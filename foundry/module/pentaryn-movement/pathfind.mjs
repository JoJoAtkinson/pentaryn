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
import { fieldFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { fitPath } from "./group-adapter.mjs";
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

/** The FogManager this client listens to for "explored" (core's TokenLayer re-plans on it too). */
let fogTarget = null;
function watchFog() {
  const fog = globalThis.canvas?.fog;
  if (fog === fogTarget) return;
  unwatchFog();
  if (typeof fog?.addEventListener !== "function") return;
  fog.addEventListener("explored", dropMemo);
  fogTarget = fog;
}
function unwatchFog() {
  fogTarget?.removeEventListener?.("explored", dropMemo);
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

/** A resumable search for leg a→b. `points` (pixel top-lefts, a and b excluded) once found. */
function legPlan(token, a, b, options, smooth, { avoid = null } = {}) {
  const leg = { a, b, state: "more", points: null, arcs: 0, nodes: 0, field: null, job: null };
  if (!searchable(a, b)) { leg.state = "none"; return leg; }
  const f = fieldFor(token, a, b, {
    preview: !!options.preview, constrain: options.constrainOptions ?? {},
    measureOptions: options.measureOptions ?? {}, terrainOptions: options.terrainOptions ?? {},
    memo: memoNow(), automation: dnd5eMovementAutomation(), avoid, rounded: !inCombat(token),
  });
  leg.field = f;
  // An unsnapped start joins the lattice at its nearest node, if that first move is open.
  const start = f.nodeOf(a);
  const lead = f.onLattice(a) ? null : f.pos(start);
  if (lead && !f.clear(a, lead)) { leg.state = "none"; return leg; }
  leg.lead = lead;
  // A goal off the lattice (H2-01): the route ends on its node, then one short hop to the goal, which must be open.
  const tail = f.onLattice(b) ? null : f.pos(f.goal);
  if (tail && !(f.clear(tail, b) || (tail.x === Math.round(b.x) && tail.y === Math.round(b.y)))) { leg.state = "none"; return leg; }
  leg.job = pf.searchWide({
    start, goal: f.goal, edge: f.edge, wall: f.wall, unit: f.unit, maxNodes: LIMITS.maxNodes, now,
  }, f.lattice);
  leg.finish = () => {
    leg.nodes = leg.job.expanded;
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

/** Waypoints for the expanded list: the corners as non-explicit, non-checkpoint waypoints. */
function cornerWaypoints(leg, useArcs) {
  const pts = (useArcs && leg.smoothed) || leg.points || [];
  return pts.map(p => leg.field.waypoint(p, { snapped: p.lattice ? !!leg.b.snapped : false }));
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

  const step = budget => {
    const s0 = now();
    for (const leg of legs) {
      if (leg.state !== "more") continue;
      const left = budget - (now() - s0);
      if (left <= 0) return "more";
      const r = leg.job.run(left);
      if (r === "more") return "more";
      leg.state = r;
      if (r === "found") leg.finish();
      else leg.nodes = leg.job.expanded;
    }
    ms = now() - t0;
    return "done";
  };

  const build = useArcs => {
    const out = waypoints.slice(0, from + 1);
    legs.forEach((leg, n) => {
      if (leg.state === "found") out.push(...cornerWaypoints(leg, useArcs));
      out.push(waypoints[from + n + 1]);
    });
    return out;
  };

  const result = () => {
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
      async: ms > LIMITS.sliceMs, memo: memo.size,
    };
    return best;
  };

  return { step, result, legs };
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
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
    return Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.y - (a.y + (b.y - a.y) * t)) < c.r;
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
  // A token dragged alone (S1R2-01): the drop goes round the tokens standing in its way (group.mjs aroundOthers), so
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

  const smooth = !!setting("smoothCorners") && !inCombat(token);
  const plan = planner(token, waypoints, options, force || crosses ? 0 : reached - 1, wrapped, base, smooth,
    { avoid: crosses ? avoid : null, force: force || crosses, accept: big ? fitsWhole(token) : null });
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
    const base = wrapped(waypoints, options);
    if (bypass) return base;
    try { return pathfindJob(this, waypoints, options, wrapped, base) ?? base; }
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
    smoothCorners: !!setting("smoothCorners"),
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
function routeTo(token, origin, dest, opts = {}) {
  const t0 = now();
  const cap = Math.min(opts.maxMs ?? LIMITS.totalMs, LIMITS.totalMs);
  const gen = routeSteps(token, origin, dest, opts);
  for (;;) {
    const r = gen.next(now() - t0 >= cap);
    if (r.done) return r.value;
  }
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
  const ends = [origin, dest];
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
  let path = base.result, legs = [], arcs = 0, partial = null, unfinished = false;
  if (reached === 1 || crosses || risky || squeezed) {
    const smoothing = (smooth ?? !!setting("smoothCorners")) && !inCombat(token);
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
    legs = plan.legs.map(l => ({ state: l.state, nodes: l.nodes, corners: l.points?.length ?? 0, arcs: l.arcs }));
    // Stopped by its cap with a leg still searching: "not found yet", never "no way there" (H4-01).
    unfinished = legs.some(l => l.state === "more");
    arcs = last?.arcs ?? 0;
  }
  const cost = path?.length ? token.measureMovementPath(path, { preview }).cost : null;
  return {
    reached: !!path && pf.reachedCount(path, ends, same) === 2,
    straight: reached === 2 && !crosses && !risky, path, cost, legs, arcs, ms: Math.round((now() - t0) * 10) / 10,
    unfinished, partial,
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
  for (const key of ["pathfinding", "pathfindMine", "smoothCorners"]) ctx.onSettingChange(key, onSetting);
  if (ctx.late) findPatched = patchFind();
  else reg.once("setup", () => { findPatched = patchFind(); }, { guard: false, label: "setup: wrap findMovementPath" });
  for (const h of DROP_HOOKS) reg.on(h, dropMemo, { label: `${h}: drop path cache` });
  reg.on("canvasReady", () => { dropMemo(); watchFog(); }, { label: "canvasReady: drop path cache, watch fog explored" });
  if (ctx.late) watchFog();
  ctx.expose({
    pathfindStatus: status,
    pathfindRoute: route,
    pathfindRouteTo: routeTo,
    pathfindRouteToAsync: routeToAsync,
    pathfindRouteSteps: routeSteps,
    pathfindOrigin: originOf,
    pathfindSkip: token => !!skipFor(token, [null, null], { constrainOptions: {} }),
    pathfindPatched: () => findPatched,
  });
}

export function uninstall() {
  findHandle?.unwrap();
  findHandle = null;
  findPatched = false;
  unwatchFog();
  dropMemo();
  last = null;
  if (feature) for (const key of ["pathfinding", "pathfindMine", "smoothCorners"]) feature.onSettingChange(key, null);
  feature = null;
}
