/**
 * Pentaryn Movement — the feature: drag pathfinding around walls (plan
 * context/plans/pathfinding-2026-11.md).
 *
 * GLUE, one feature. Wraps Token#findMovementPath on the configured token class (dnd5e's Token5e),
 * so the chain is pentaryn → dnd5e → core. The original runs first; when its path already reaches
 * every explicit waypoint (a straight drag) it is returned untouched, unless it walks into a teleport /
 * change-level region the drag neither starts nor ends in (0.4.5, live R5-4). Otherwise each leg from the
 * first unreached waypoint on is searched (pathfind-core: A*, cost-preserving string pulling, and
 * corner arcs when this client's "Smooth corners" is on), the found corners are spliced in as
 * non-explicit waypoints, and the expanded list goes back through the original, so dnd5e and core
 * still apply walls, doors, creatures, terrain and cost exactly as before. A route core then cuts
 * shorter than the plain drag is discarded.
 *
 * Skipped entirely for ghost and the GM's unconstrained tool (both set constrainOptions.ignoreWalls),
 * on gridless and hex scenes, and when the world setting or this client's setting is off.
 *
 * Keyboard movement never calls findMovementPath and is untouched.
 */

import * as pf from "./pathfind-core.mjs";
import { LIMITS } from "./pathfind-core.mjs";
import { MOTION } from "./motion-core.mjs";
import { MODULE } from "./movement-core.mjs";
import { dnd5eMovementAutomation, setting } from "./settings.mjs";
import { fieldFor, narrowFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { drain, walkForSteps } from "./narrow-core.mjs";
import { fitPath } from "./group-adapter.mjs";

/**
 * Corners are always rounded where an arc costs nothing (0.8.0 folded the smoothCorners setting in); only
 * `CONFIG.debug["pentaryn-movement.arcs"] = false` turns the arcs off, for tests and for a straight-line check.
 */
const arcsOn = () => globalThis.CONFIG?.debug?.[`${MODULE}.arcs`] !== false;
import { wrapMethod } from "./lib/patch.mjs";

let log = null;
let feature = null;
let findHandle = null;
let findPatched = false;
/** true while route() asks for the plain path (the wrap then passes straight through). */
let bypass = false;

/* -------------------------------------------- */
/*  Step cache                                  */
/* -------------------------------------------- */

/**
 * Step results (walls, creatures, cost) memoised across the searches of one drag: core asks again
 * on every square the pointer crosses, and nearly every step is the same. Keys are absolute
 * positions plus the moving token's id, size, action, level, elevation and preview: creature
 * blocking and creature difficult terrain depend on who moves. Dropped when a wall, door, region or
 * token changes, when the controlled tokens change (dnd5e never blocks on a token moved with the
 * mover), when this client's fog is explored (which walls and creatures count in preview), on a new
 * canvas, and once the cache is MEMO_TTL old — its age, not its idle time, so a drag that keeps the
 * cache busy still sees what changed visibility (a creature coming into view) within MEMO_TTL.
 */
const MEMO_TTL = 2000;
const MEMO_MAX = 200000;
let memo = new Map();
let memoBorn = 0;
function memoNow() {
  const t = Date.now();
  if (t - memoBorn > MEMO_TTL || memo.size > MEMO_MAX) { memo = new Map(); memoBorn = t; }
  return memo;
}
function dropMemo() {
  memo = new Map();
  memoBorn = Date.now();
}

/**
 * The narrow-way fields (0.10 R9, narrow-core), one per scene, wall type, size and preview: they depend on the walls
 * alone (and, for a player's preview, the fog this client has explored), so they outlive the step cache. Dropped when
 * a wall or door changes, on a new canvas, and (a preview's) when fog is explored.
 */
let narrowCache = new Map();
function dropNarrow() { narrowCache = new Map(); }
function dropNarrowPreview() { for (const k of [...narrowCache.keys()]) if (!k.endsWith("|f")) narrowCache.delete(k); }

/** The FogManager this client listens to for "explored" (core's TokenLayer re-plans on it too). */
let fogTarget = null;
function watchFog() {
  const fog = globalThis.canvas?.fog;
  if (fog === fogTarget) return;
  unwatchFog();
  if (typeof fog?.addEventListener !== "function") return;
  fog.addEventListener("explored", dropMemo);
  fog.addEventListener("explored", dropNarrowPreview);
  fogTarget = fog;
}
function unwatchFog() {
  fogTarget?.removeEventListener?.("explored", dropMemo);
  fogTarget?.removeEventListener?.("explored", dropNarrowPreview);
  fogTarget = null;
}

/** What the last search did, for status(). */
let last = null;

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

const same = (a, b) => foundry.documents.TokenDocument.arePositionsEqual(a, b);
const now = () => globalThis.performance?.now?.() ?? Date.now();

function skipFor(token, waypoints, options) {
  return pf.skipReason({
    mode: setting("pathfinding"),
    mine: !!setting("pathfindMine"),
    isGM: !!game.user?.isGM,
    gridType: token.document?.parent?.grid?.type ?? canvas.grid?.type,
    constrain: options?.constrainOptions ?? {},
    waypoints: waypoints?.length ?? 0,
  });
}

/** The narrow field this token's move would use (0.10 R9), or null (a bigger token, ghost, no wall test). */
function narrowOf(token, wp, options) {
  const src = token.document?._source ?? {};
  const w = wp?.width ?? src.width ?? 1, h = wp?.height ?? src.height ?? 1;
  if (options?.constrainOptions?.ignoreWalls || w > 1 || h > 1) return null;
  const action = wp?.action ?? token.document?.movementAction;
  const cfg = CONFIG.Token?.movement?.actions?.[action];
  const wallType = cfg ? cfg.walls : "move";
  const look = !!options?.preview && !game.user?.isGM && !!globalThis.canvas?.visibility?.tokenVision;
  return narrowFor(token, { wallType, look, width: w, height: h, cache: narrowCache });
}

/**
 * Where a token may rest near top-left position `p` on a narrow way (0.10 R9: a drop point inside a tight area means
 * the nearest centre-line point): { x, y } top-left pixels, the same point when it already keeps the pass radius
 * (the centre line where the way is narrower than the token), or null when `p` is not in a tight square or nothing
 * near is passable. Reads only.
 */
function restPointFor(token, p, options = {}) {
  const nf = narrowOf(token, p, options);
  if (!nf || !Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return null;
  const s = nf.s;
  const src = token.document?._source ?? {};
  const w = p.width ?? src.width ?? 1, h = p.height ?? src.height ?? 1;
  const c = { x: (p.x + (w * s) / 2) / s, y: (p.y + (h * s) / 2) / s };
  if (!nf.tight(Math.floor(c.y), Math.floor(c.x))) return null;
  const r = nf.restPoint(c);
  if (!r) return null;
  return { x: Math.round(r.x * s - (w * s) / 2), y: Math.round(r.y * s - (h * s) / 2) };
}

/**
 * Where a drop rests when its pointer lies on a narrow way (0.10 live round 2, S05 dropMid: core snapped the token to a
 * square whose centre lies beyond the way's wall, in the C's hollow, so the rest point was there and no route reached
 * it: "No route there"): the pointer's own rest point on the way (R9 "a token dropped part-way along a narrow way rests
 * off-grid where it is"), top-left pixels. `snapped` and `raw` are top-left positions: core's snapped destination and
 * the pointer's (unsnapped). null when the pointer is not on a way narrower than the token, or when the snapped square's
 * centre lies on the same part of the way (its own rest point stands: restPointFor). Reads only.
 */
function cursorRestPoint(token, snapped, raw, options = {}) {
  if (![snapped?.x, snapped?.y, raw?.x, raw?.y].every(Number.isFinite)) return null;
  const nf = narrowOf(token, raw, options);
  if (!nf) return null;
  const s = nf.s;
  const src = token.document?._source ?? {};
  const w = raw.width ?? src.width ?? 1, h = raw.height ?? src.height ?? 1;
  const centre = p => ({ x: (p.x + (w * s) / 2) / s, y: (p.y + (h * s) / 2) / s });
  const rc = centre(raw), sc = centre(snapped);
  if (!nf.tight(Math.floor(rc.y), Math.floor(rc.x)) || !(nf.widthAt(rc.x, rc.y) < 2 * nf.pad)) return null;
  const nr = nf.nodeAt(rc);
  if (!nr) return null;
  const SI = Math.floor(sc.y), SJ = Math.floor(sc.x);
  const ns = nf.tight(SI, SJ) ? nf.nodeAt(sc) : { I: SI, J: SJ, c: 0 };
  if (ns && ns.I === nr.I && ns.J === nr.J && ns.c === nr.c) return null;
  const r = nf.restPoint(rc);
  if (!r) return null;
  return { x: Math.round(r.x * s - (w * s) / 2), y: Math.round(r.y * s - (h * s) / 2) };
}

/**
 * A drag's or a route's explicit waypoints with each one in a tight square moved to where the token may rest there
 * (restPointFor; it moves at most a few pixels where it already stands on the centre line). The same array when none
 * moves.
 */
function narrowGoals(token, waypoints, options) {
  let out = null;
  for (let k = 1; k < (waypoints?.length ?? 0); k++) {
    const p = waypoints[k];
    if (!p || (!p.explicit && k < waypoints.length - 1)) continue;
    const r = restPointFor(token, p, options);
    if (!r || (Math.abs(r.x - p.x) < 1 && Math.abs(r.y - p.y) < 1)) continue;
    out ??= [...waypoints];
    out[k] = { ...p, x: r.x, y: r.y, snapped: false };
  }
  return out ?? waypoints;
}

/** A leg can be searched when only x/y change along it (no elevation, size, level or action change). */
function searchable(a, b) {
  const keys = ["elevation", "width", "height", "level", "action", "shape"];
  return keys.every(k => a[k] === undefined || b[k] === undefined || a[k] === b[k]);
}

/* -------------------------------------------- */
/*  One leg                                     */
/* -------------------------------------------- */

/** In a started combat (dnd5e records the movement): no arcs, the route stays on the grid (0.4.0). */
function inCombat(token) {
  try { return token.document?._shouldRecordMovementHistory?.() === true; } catch { return false; }
}

/** Steps of a narrow way's walk between two looks at the clock (planner's slices). */
const WALK_CHECK = 4;

/** A resumable search for leg a→b. `points` (pixel top-lefts, a and b excluded) once found. */
function legPlan(token, a, b, options, smooth, { avoid = null } = {}) {
  const leg = { a, b, state: "more", points: null, arcs: 0, nodes: 0, field: null, job: null };
  if (!searchable(a, b)) { leg.state = "none"; return leg; }
  const fight = inCombat(token);
  const f = fieldFor(token, a, b, {
    preview: !!options.preview, constrain: options.constrainOptions ?? {},
    measureOptions: options.measureOptions ?? {}, terrainOptions: options.terrainOptions ?? {},
    memo: memoNow(), automation: dnd5eMovementAutomation(), avoid, rounded: !fight, narrowCache,
  });
  leg.field = f;
  const nf = f.narrow;
  // An unsnapped start joins the lattice at its nearest node, if that first move is open. In a tight square (0.10
  // R9: a token resting on a narrow way's centre line) it starts in the part of the square it stands in instead.
  let start = f.nodeOf(a);
  let lead = f.onLattice(a) ? null : f.pos(start);
  if (nf && (nf.tight(start) || (lead && !f.clear(a, lead)))) {
    const at = nf.field.nodeAt(nf.centre(a));
    if (at) { start = nf.fromAbs(at.I, at.J, at.c); lead = null; }
  }
  if (lead && !f.clear(a, lead)) { leg.state = "none"; return leg; }
  leg.lead = lead;
  // A goal off the lattice (H2-01): the route ends on its node, then one short hop to the goal, which must be open;
  // in a tight square the part of it the goal lies in, the walk ending on the goal itself.
  let goal = f.goal;
  let tail = f.onLattice(b) ? null : f.pos(f.goal);
  if (nf && (nf.tight(goal) || (tail && !(f.clear(tail, b) || (tail.x === Math.round(b.x) && tail.y === Math.round(b.y)))))) {
    const at = nf.field.nodeAt(nf.centre(b));
    if (at) { goal = nf.fromAbs(at.I, at.J, at.c); tail = null; leg.fineGoal = true; }
  }
  if (tail && !(f.clear(tail, b) || (tail.x === Math.round(b.x) && tail.y === Math.round(b.y)))) { leg.state = "none"; return leg; }
  leg.job = pf.searchWide({
    start, goal, edge: f.edge, wall: f.wall, unit: f.unit, maxNodes: LIMITS.maxNodes, now, more: nf?.more ?? null,
  }, f.lattice);
  leg.finish = () => drain(leg.finishSteps());
  // The leg's corners once its search found a path; yields inside a narrow way's walk (0.10.2: the walk is most of a
  // route over the stair, and planner.step slices it like the search).
  leg.finishSteps = function* () {
    leg.nodes = leg.job.expanded;
    // Through a narrow way (R9): one walk on its centre line, its corners every chord of it (no string pull, no arcs:
    // the band is both); in a fight its checkpoints are where the centre line enters each square.
    const path = leg.job.path;
    const parts = !!nf && !!path?.some(n => n.c);
    // On whole squares only (no part of a tight square): today's route, unless it passes a tight square closer than
    // the pass radius to a wall (constraint 1: the finer test only where the plain one fails).
    const plainOk = () => {
      const pulled = pf.stringPull(path, leg.job.costs, { edge: f.edge, wall: f.wall, lineOk: f.lineOk });
      const c = pulled.map(n => nf.centre(f.pos(n)));
      const pts = [nf.centre(a), ...c.slice(1, -1), nf.centre(b)];
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k - 1], q = pts[k];
        if (!nf.field.tight(Math.floor(p.y), Math.floor(p.x)) && !nf.field.tight(Math.floor(q.y), Math.floor(q.x))
          && !nf.field.crosses(p, q)) {
          // A segment between two plain squares may still cut a tight one: its samples tell.
          const L = Math.hypot(q.x - p.x, q.y - p.y);
          let tight = false;
          for (let s = 1; s < Math.ceil(L / 0.5) && !tight; s++) { const t = s / Math.ceil(L / 0.5); tight = nf.field.tight(Math.floor(p.y + (q.y - p.y) * t), Math.floor(p.x + (q.x - p.x) * t)); }
          if (!tight) continue;
        }
        const dp = nf.field.clearance(p.x, p.y), dq = nf.field.clearance(q.x, q.y);
        if (dp < nf.field.passMin || dq < nf.field.passMin || !nf.field.segOk(p, dp, q, dq)) return false;
      }
      return true;
    };
    if (nf && (parts || (path?.some(n => nf.tight(n)) && !plainOk()))) {
      const pull = (k0, k1) => {
        const sub = path.slice(k0, k1 + 1), sc = leg.job.costs.slice(k0, k1 + 1);
        const kept = pf.stringPull(sub, sc, { edge: f.edge, wall: f.wall, lineOk: f.lineOk });
        return kept.map(n => k0 + sub.indexOf(n));
      };
      let walk = null;
      try {
        walk = yield* walkForSteps(nf.field, path.map(n => ({ ...nf.toAbs(n), c: n.c ?? 0 })),
          { from: nf.centre(a), to: nf.centre(b), fight, pull, okSeg: nf.okSeg });
      } catch (err) { log?.debug?.("narrow walk", err); walk = null; }
      if (walk) {
        const pts = walk.points.slice(1, -1).map(p => ({ ...nf.topLeft(p), ...(p.checkpoint !== undefined ? { checkpoint: !!p.checkpoint } : {}) }));
        leg.points = pts;
        leg.smoothed = null;
        leg.narrow = { narrow: !!walk.narrow, minClearance: walk.minClearance, settled: walk.settled };
        return;
      }
      // No walk that keeps the radius: a path through a part of a tight square is no route; one on whole squares
      // is the plain test's, as before.
      if (path.some(n => n.c)) { leg.state = "none"; leg.points = null; return; }
    }
    const pulled = pf.stringPull(leg.job.path, leg.job.costs, { edge: f.edge, wall: f.wall, lineOk: f.lineOk });
    let pts = pulled.map(n => ({ ...f.pos(n), lattice: true }));
    if (lead) pts = [{ x: a.x, y: a.y }, ...pts];
    if (smooth && pts.length > 2) {
      // 0.4.0: chords within MOTION.chordError of the arc, a point cap per corner and per route.
      const r = pf.fillet(pts, { maxT: LIMITS.arcMaxCells * f.s, clear: f.clear, cost: f.cost,
        maxError: MOTION.chordError * f.s, cornerPoints: MOTION.cornerPoints, maxPoints: MOTION.routePoints });
      leg.arcs = r.arcs;
      leg.smoothed = r.points.slice(1, tail ? undefined : -1);
    }
    leg.points = pts.slice(1, tail ? undefined : -1);
  };
  return leg;
}

/**
 * Waypoints for the expanded list: the corners as non-explicit, non-checkpoint waypoints (a narrow way's walk in a
 * fight names its own: where its centre line enters a square).
 */
function cornerWaypoints(leg, useArcs) {
  const pts = (useArcs && leg.smoothed) || leg.points || [];
  return pts.map(p => leg.field.waypoint(p, { snapped: p.lattice ? !!leg.b.snapped : false, ...(p.checkpoint !== undefined ? { checkpoint: p.checkpoint } : {}) }));
}

/* -------------------------------------------- */
/*  The job                                     */
/* -------------------------------------------- */

/**
 * Plan every leg from `from` (index of the last explicit waypoint the plain path reached), then
 * rebuild through the original. Returns { step(budgetMs) → "done"|"more", result() }.
 */
function planner(token, waypoints, options, from, wrapped, base, smooth, { avoid = null, force = false, accept = null } = {}) {
  const legs = [];
  for (let k = from; k < waypoints.length - 1; k++) legs.push(legPlan(token, waypoints[k], waypoints[k + 1], options, smooth, { avoid }));
  const t0 = now();
  let ms = 0;

  // A found leg's walk runs in the same slices as the search (leg.walking: its finishSteps, unfinished); the clock is
  // read every WALK_CHECK of its steps (a band's iteration is a fraction of a millisecond).
  const walk = (leg, s0, budget) => {
    for (let n = 1; ; n++) {
      if (leg.walking.next().done) { leg.walking = null; return true; }
      if (n % WALK_CHECK === 0 && now() - s0 >= budget) return false;
    }
  };
  const step = budget => {
    const s0 = now();
    for (const leg of legs) {
      if (leg.walking) { if (!walk(leg, s0, budget)) return "more"; continue; }
      if (leg.state !== "more") continue;
      const left = budget - (now() - s0);
      if (left <= 0) return "more";
      const r = leg.job.run(left);
      if (r === "more") return "more";
      leg.state = r;
      if (r === "found") { leg.walking = leg.finishSteps(); if (!walk(leg, s0, budget)) return "more"; }
      else leg.nodes = leg.job.expanded;
    }
    ms = now() - t0;
    return "done";
  };
  /** A walk still running when the search is stopped (its cap) ends now: a found leg always gets its corners. */
  const settleWalks = () => { for (const leg of legs) if (leg.walking) { drain(leg.walking); leg.walking = null; } };

  const build = useArcs => {
    const out = waypoints.slice(0, from + 1);
    legs.forEach((leg, n) => {
      if (leg.state === "found") out.push(...cornerWaypoints(leg, useArcs));
      out.push(waypoints[from + n + 1]);
    });
    return out;
  };

  const result = () => {
    settleWalks();
    const baseReach = pf.reachedCount(base.result, waypoints, same);
    const found = legs.some(l => l.state === "found");
    let best = base.result;
    let reach = baseReach;
    let arcs = 0;
    if (found) {
      for (const useArcs of smooth ? [true, false] : [false]) {
        const r = wrapped(build(useArcs), options);
        const path = r?.result;
        if (!Array.isArray(path)) continue;
        // A big token's arcs can bend its body into a door frame the straight corners clear (live H2-01): then
        // the corners without arcs.
        if (accept && !accept(path)) continue;
        const n = pf.reachedCount(path, waypoints, same);
        // force (a group re-plan round resting members): a found route that gets there replaces the plain one.
        if (n > reach || (force && n === waypoints.length && best === base.result)) {
          best = path; reach = n;
          arcs = useArcs ? legs.reduce((s, l) => s + l.arcs, 0) : 0;
          if (n === waypoints.length) break;
        }
      }
    }
    last = {
      at: new Date().toISOString(), tokenId: token.document?.id ?? null, legs: legs.length,
      found: legs.filter(l => l.state === "found").length, nodes: legs.reduce((s, l) => s + l.nodes, 0),
      ms: Math.round(ms * 10) / 10, reached: reach, of: waypoints.length, arcs, improved: best !== base.result,
      async: ms > LIMITS.sliceMs, memo: memo.size, ...narrowOfLegs(legs),
    };
    return best;
  };

  return { step, result, legs };
}

/** A plan's narrow-way facts (R13): narrow (a way narrower than the token on it), minClearance (squares), or {}. */
function narrowOfLegs(legs) {
  const n = legs.filter(l => l.state === "found" && l.narrow);
  if (!n.length) return { narrow: false, minClearance: null };
  return { narrow: n.some(l => l.narrow.narrow), minClearance: Math.round(Math.min(...n.map(l => l.narrow.minClearance)) * 1000) / 1000 };
}

/**
 * Does core's path `path` for this drag cross a teleport / change-level region (pathfind-adapter
 * placesToAvoid's traps: not one the drag starts or ends in; a hidden one only for a GM)? Fog and
 * secret doors are not asked: a straight drag over them stays core's.
 */
function entersTrap(token, waypoints, path, options) {
  const hz = placesToAvoid(token, waypoints[0], waypoints.at(-1), { preview: !!options?.preview });
  if (!hz.traps.length) return false;
  for (let k = 1; k < path.length; k++) if (!hz.line(path[k - 1], path[k], { fog: false })) return true;
  return false;
}

/**
 * The job core's drag code waits on (TokenFindMovementPathJob): `result` is the path when found
 * at once, `undefined` while searching, `null` once cancelled. A search that does not finish in
 * one slice continues in timer slices; the drag shows core's searching animation meanwhile.
 */
/** A big token's path where its body fits (live H1-04); any other path as it is. */
function fitted(token, path, options) {
  if (options?.constrainOptions?.ignoreWalls || !Array.isArray(path)) return path;
  try { return fitPath(token, path).path; } catch (err) { log?.debug?.("fitPath", err); return path; }
}

/**
 * Does a path (top-left pixels) bring the token's centre inside any of `avoid` (circles { x, y, r }, pixel centres)?
 * Its size from `w` / `h` (default its source's), the grid size `s` (default its scene's).
 */
function crossesCircles(path, avoid, token, { w = null, h = null, s = null } = {}) {
  if (!avoid?.length || !Array.isArray(path) || path.length < 2) return false;
  const src = token.document?._source ?? {};
  const W = w ?? src.width ?? 1, H = h ?? src.height ?? 1;
  const S = s ?? token.document?.parent?.grid?.size ?? canvas.grid?.size ?? 100;
  return path.some((p, k) => k > 0 && avoid.some(c => {
    const a = { x: path[k - 1].x + (W * S) / 2, y: path[k - 1].y + (H * S) / 2 };
    const b = { x: p.x + (W * S) / 2, y: p.y + (H * S) / 2 };
    return pf.avoidHits(c, a, b, 0);
  }));
}

/** A big token's path is taken only where its body fits all the way (fitPath). */
const fitsWhole = token => path => { try { return !fitPath(token, path).cut; } catch { return true; } };

/** A finished job for `path`. */
const doneJob = path => ({ result: path, promise: Promise.resolve(path), cancel: () => {} });

function pathfindJob(token, waypoints, options, wrapped, base) {
  if (!Array.isArray(base?.result)) return null;          // a wrapper below us is still searching
  // A big token never walks where its body does not fit (core tests walls at its centre only, live H1-04).
  const big = !options?.constrainOptions?.ignoreWalls && ((token.document?._source?.width ?? 1) > 1 || (token.document?._source?.height ?? 1) > 1);
  const squeezed = big && fitPath(token, base.result).cut;
  const plain = () => (squeezed ? doneJob(fitted(token, base.result, options)) : null);
  // A group drag (0.4.0): only the grabbed token is searched while dragging; the group plan runs at the drop.
  if (feature?.exposed?.groupFollower?.(token)) return plain();
  const reason = skipFor(token, waypoints, options);
  if (reason) return plain();
  const reached = pf.reachedCount(base.result, waypoints, same);
  if (reached === 0) return plain();
  // A token dragged alone (S1R2-01): the drop goes round the tokens standing in its way (drop.mjs aroundOthers), so
  // the drag's ruler shows that way and what it costs, not core's line through them (40 ft shown, 90 ft walked).
  let avoid = null;
  try { avoid = feature?.exposed?.singleAvoid?.(token, waypoints, options) ?? null; } catch (err) { log?.debug?.("single drag: the tokens that stay", err); }
  const crosses = !!avoid?.length && crossesCircles(base.result, avoid, token);
  // A drag core lets through whole is core's own, unless its line walks into a teleport / change-level
  // region the drag neither starts nor ends in (live R5-4: a straight drag walked into a scene link and
  // the player's view jumped to its destination; only group slots and route() kept out), or a big token's
  // body does not fit along it (H1-04). Then every leg is searched round it; with no way round, core's
  // line stays (a big token's cut where it stops fitting).
  const force = reached >= waypoints.length;
  if (force && !squeezed && !crosses && !entersTrap(token, waypoints, base.result, options)) return null;

  const smooth = arcsOn() && !inCombat(token);
  const plan = planner(token, waypoints, options, force || crosses ? 0 : reached - 1, wrapped, base, smooth,
    { avoid, force: force || crosses, accept: big ? fitsWhole(token) : null });
  if (plan.step(LIMITS.sliceMs) === "done") return doneJob(big ? fitted(token, plan.result(), options) : plan.result());

  let cancelled = false;
  let resolve;
  const job = { result: undefined, promise: new Promise(r => { resolve = r; }), cancel: null };
  const started = now();
  job.cancel = () => {
    if (job.result !== undefined) return;
    cancelled = true;
    job.result = null;
    resolve(null);
  };
  // The cap counts the search's own slices (live H1-10: on a slow page the frames between slices used the
  // 1.5 s up, the drop took core's partial line, and a maze drag stopped 3.6 squares short on a 165 ft
  // ruler); the wall clock has its own, longer cap.
  let busy = 0;
  const tick = () => {
    if (cancelled) return;
    try {
      const over = pf.searchOver({ busy, wall: now() - started });
      const t = now();
      const more = !over && plan.step(LIMITS.sliceMs) === "more";
      busy += now() - t;
      if (more) { setTimeout(tick, 0); return; }
      job.result = over ? base.result : plan.result();
      if (big) job.result = fitted(token, job.result, options);
    } catch (err) {
      log?.warnOnce("pathfind-async", "pathfinding failed (further errors suppressed)", err);
      job.result = base.result;
    }
    resolve(job.result);
  };
  setTimeout(tick, 0);
  return job;
}

/* -------------------------------------------- */
/*  The wrap                                    */
/* -------------------------------------------- */

function patchFind() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?.findMovementPath !== "function") {
    log.warn("no Token#findMovementPath; drag pathfinding disabled");
    return false;
  }
  findHandle = wrapMethod(MODULE, {
    target: proto, name: "findMovementPath", label: "Token#findMovementPath",
    marker: "__pentarynMovementPath", adjustments: "movement-pathfind-find-path",
  }, function (wrapped, waypoints, options = {}) {
    if (bypass) return wrapped(waypoints, options);
    // A point dropped in a tight square is where the token may rest there (R9), when this drag is pathfound.
    let wps = waypoints;
    try {
      if (!feature?.exposed?.groupFollower?.(this) && !skipFor(this, waypoints, options)) wps = narrowGoals(this, waypoints, options);
    } catch (err) { log.debug?.("narrow goals", err); wps = waypoints; }
    const base = wrapped(wps, options);
    try { return pathfindJob(this, wps, options, wrapped, base) ?? base; }
    catch (err) { log.warnOnce("pathfind", "pathfinding skipped (further errors suppressed)", err); return base; }
  });
  return true;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

function status() {
  return {
    mode: setting("pathfinding"),
    mine: !!setting("pathfindMine"),
    smoothCorners: arcsOn(),
    patched: findPatched,
    gridType: canvas?.grid?.type ?? null,
    memo: memo.size,
    limits: { ...LIMITS },
    last: last ? { ...last } : null,
  };
}

/** A waypoint for `token` at its current source position. */
function originOf(tokenDoc) {
  const src = tokenDoc._source;
  return { x: src.x, y: src.y, elevation: src.elevation, width: src.width, height: src.height, depth: src.depth,
    shape: src.shape, level: src.level, action: tokenDoc.movementAction, snapped: false, explicit: false, checkpoint: false };
}

/**
 * Route `token` from waypoint `origin` to waypoint `dest` without moving it: core's (dnd5e's) own
 * path when it gets there, else the pathfinder's, both through the original findMovementPath so
 * dnd5e constrains them. Runs every slice synchronously (up to LIMITS.totalMs).
 *   avoid: circles { x, y, r } (pixel centres) the route keeps out of (group re-plan); a plain path
 *          that crosses one is searched round it.
 *   smooth: corner arcs (default this client's setting; never in combat).
 *   maxMs:  wall-clock cap for this one call (default LIMITS.totalMs). Group planning passes less
 *           than its per-member budget, so one long or impossible route never freezes the drop.
 * Returns { reached, straight, path, cost, legs, arcs, ms }.
 */
function routeTo(token, origin, dest, opts = {}) { return drain(routeToSteps(token, origin, dest, opts)); }

/**
 * routeTo in slices (0.10.2, a group plan that never freezes the page): yields between the search's slices and inside
 * a narrow way's walk; `clock` is the caller's (a sliced plan's busy time, so its cap counts the route's own work, not
 * the frames between slices). Drained, it is routeTo.
 */
function* routeToSteps(token, origin, dest, opts = {}, clock = now) {
  const t0 = clock();
  const cap = Math.min(opts.maxMs ?? LIMITS.totalMs, LIMITS.totalMs);
  const gen = routeSteps(token, origin, dest, opts);
  let r = gen.next(false);
  while (!r.done) {
    yield;
    r = gen.next(clock() - t0 >= cap);
  }
  return r.value;
}

/**
 * routeTo, finished in timer slices instead of at once (H3-04: a single drop released before the drag's own
 * long search finished was lost). The cap is the search's own slices (LIMITS.totalMs) and the wall clock
 * (LIMITS.waitMs), as the drag's search. Resolves the same shape as routeTo.
 */
function routeToAsync(token, origin, dest, opts = {}) {
  return new Promise(resolve => {
    const started = now();
    let busy = 0;
    let gen;
    try { gen = routeSteps(token, origin, dest, opts); } catch (err) { log?.debug?.("route (async)", err); resolve(null); return; }
    const tick = () => {
      try {
        const t = now();
        let r = gen.next(pf.searchOver({ busy, wall: now() - started }));
        while (!r.done && now() - t < LIMITS.sliceMs) r = gen.next(pf.searchOver({ busy: busy + now() - t, wall: now() - started }));
        busy += now() - t;
        if (r.done) { resolve(r.value); return; }
        setTimeout(tick, 0);
      } catch (err) {
        log?.warnOnce?.("pathfind-route-async", "a route search failed (further errors suppressed)", err);
        resolve(null);
      }
    };
    setTimeout(tick, 0);
  });
}

/** routeTo's body: yields between search slices; `gen.next(true)` stops the search where it is. */
function* routeSteps(token, origin, dest, { preview = false, smooth = null, avoid = null, constrainOptions = {} } = {}) {
  const options = { preview, constrainOptions, measureOptions: {}, terrainOptions: {} };
  const call = (w, o) => {
    bypass = true;
    try { return token.findMovementPath(w, o); } finally { bypass = false; }
  };
  const t0 = now();
  let ends = [origin, dest];
  try { if (!constrainOptions?.ignoreWalls) ends = narrowGoals(token, ends, options); } catch { ends = [origin, dest]; }
  const base = call(ends, options);
  if (!Array.isArray(base?.result)) return { reached: false, straight: false, path: null, cost: null, legs: [], arcs: 0, ms: 0 };
  const reached = pf.reachedCount(base.result, ends, same);
  const s = token.document?.parent?.grid?.size ?? canvas.grid?.size ?? 100;
  const w = origin.width ?? 1, h = origin.height ?? 1;
  const crosses = !!avoid?.length && crossesCircles(base.result, avoid, token, { w, h, s });
  // A route this module invents (a group member's) never goes through a secret door, a teleport /
  // change-level region or a player's unexplored ground, even where core's straight line would.
  const hz = placesToAvoid(token, origin, dest, { preview });
  const risky = base.result.some((p, k) => k > 0 && (!hz.line(base.result[k - 1], p)
    || (hz.secret.length && hz.crossesSecret(
      { x: base.result[k - 1].x + (w * s) / 2, y: base.result[k - 1].y + (h * s) / 2 },
      { x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 }))));
  const squeezed = !constrainOptions?.ignoreWalls && fitPath(token, base.result).cut;
  let path = base.result, legs = [], arcs = 0, partial = null, unfinished = false, narrow = { narrow: false, minClearance: null };
  if (reached === 1 || crosses || risky || squeezed) {
    const smoothing = (smooth ?? arcsOn()) && !inCombat(token);
    const big = !constrainOptions?.ignoreWalls && ((w > 1) || (h > 1));
    const plan = planner(token, ends, options, 0, call, base, smoothing, { avoid, force: !!(crosses || risky || squeezed), accept: big ? fitsWhole(token) : null });
    while (plan.step(LIMITS.sliceMs) === "more") {
      if (yield "more") break;
    }
    path = plan.result();
    // A big token's way as far as its body fits (H4-01: a drop whose drag search had not finished walked the
    // drag's one-square line; the drag itself shows this cut path once its search is done).
    if (big && path?.length) { try { partial = fitPath(token, path).path; } catch { partial = null; } }
    if ((crosses || risky || squeezed) && path === base.result) path = null;   // no way round: the caller keeps what it had
    else if (path && !constrainOptions?.ignoreWalls && fitPath(token, path).cut) path = null;
    legs = plan.legs.map(l => ({ state: l.state, nodes: l.nodes, corners: l.points?.length ?? 0, arcs: l.arcs, ...(l.narrow ? { narrow: l.narrow.narrow, minClearance: l.narrow.minClearance } : {}) }));
    narrow = narrowOfLegs(plan.legs);
    // Stopped by its cap with a leg still searching: "not found yet", never "no way there" (H4-01).
    unfinished = legs.some(l => l.state === "more");
    arcs = last?.arcs ?? 0;
  }
  const cost = path?.length ? token.measureMovementPath(path, { preview }).cost : null;
  return {
    reached: !!path && pf.reachedCount(path, ends, same) === 2,
    straight: reached === 2 && !crosses && !risky, path, cost, legs, arcs, ms: Math.round((now() - t0) * 10) / 10,
    unfinished, partial, ...narrow, goal: ends[1] === dest ? null : { x: ends[1].x, y: ends[1].y },
  };
}

/**
 * Route a token to a top-left position without moving it: what the drag would get. Runs every
 * slice synchronously (up to LIMITS.totalMs). Needs a canvas with the token's scene drawn.
 */
function route(tokenDoc, opts = {}) {
  const token = tokenDoc?.object;
  if (!token || !canvas?.ready) return { ok: false, reason: "no drawn token (the canvas must show its scene)" };
  const to = opts.to;
  if (!Number.isFinite(to?.x) || !Number.isFinite(to?.y)) return { ok: false, reason: "opts.to { x, y } (top-left pixels) is required" };
  const origin = originOf(tokenDoc);
  const dest = { ...origin, x: to.x, y: to.y, snapped: true, explicit: true };
  dropMemo();
  const r = routeTo(token, origin, dest, { preview: !!opts.preview, smooth: opts.smooth ?? null });
  return {
    ok: true,
    reached: r.reached,
    straight: r.straight,
    waypoints: (r.path ?? []).map(w => ({ x: w.x, y: w.y, explicit: !!w.explicit })),
    cost: r.cost, arcs: r.arcs, legs: r.legs, ms: r.ms,
    // 0.10 R9: through a way narrower than the token, the least clearance from a wall (squares), and the rest point
    // a destination in a tight square moved to (null: where asked).
    narrow: !!r.narrow, minClearance: r.minClearance ?? null, goal: r.goal ?? null,
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

/** Documents whose change can change a step's answer. */
const DROP_HOOKS = [
  "createWall", "updateWall", "deleteWall",
  "createRegion", "updateRegion", "deleteRegion",
  "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior",
  "createToken", "updateToken", "deleteToken",
  "controlToken",
];

/** A setting changed: drop the cache and let core re-plan any drag in progress. */
function onSetting() {
  dropMemo();
  globalThis.canvas?.tokens?.recalculatePlannedMovementPaths?.();
}

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  for (const key of ["pathfinding", "pathfindMine"]) ctx.onSettingChange(key, onSetting);
  if (ctx.late) findPatched = patchFind();
  else reg.once("setup", () => { findPatched = patchFind(); }, { guard: false, label: "setup: wrap findMovementPath" });
  // A wall or door change also drops the narrow-way fields (0.10 R9): they depend on the walls alone.
  const dropWalls = () => { dropMemo(); dropNarrow(); };
  for (const h of DROP_HOOKS) reg.on(h, h.endsWith("Wall") ? dropWalls : dropMemo, { label: `${h}: drop path cache` });
  reg.on("canvasReady", () => { dropMemo(); dropNarrow(); watchFog(); }, { label: "canvasReady: drop path cache, watch fog explored" });
  if (ctx.late) watchFog();
  ctx.expose({
    pathfindStatus: status,
    pathfindRoute: route,
    pathfindRouteTo: routeTo,
    pathfindRouteSliced: routeToSteps,
    pathfindRouteToAsync: routeToAsync,
    pathfindOrigin: originOf,
    pathfindSkip: token => !!skipFor(token, [null, null], { constrainOptions: {} }),
    pathfindPatched: () => findPatched,
    pathfindMemo: memoNow,
    pathfindNarrowCache: () => narrowCache,
    pathfindRestPoint: restPointFor,
    pathfindCursorRest: cursorRestPoint,
  });
}

export function uninstall() {
  findHandle?.unwrap();
  findHandle = null;
  findPatched = false;
  unwatchFog();
  dropMemo();
  dropNarrow();
  last = null;
  if (feature) for (const key of ["pathfinding", "pathfindMine"]) feature.onSettingChange(key, null);
  feature = null;
}
