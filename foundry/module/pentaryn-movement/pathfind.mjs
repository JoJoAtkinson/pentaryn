/**
 * Pentaryn Movement — the feature: drag pathfinding around walls (plan
 * context/plans/pathfinding-2026-11.md).
 *
 * GLUE, one feature. Wraps Token#findMovementPath on the configured token class (dnd5e's Token5e),
 * so the chain is pentaryn → dnd5e → core. The original runs first; when its path already reaches
 * every explicit waypoint (a straight drag) it is returned untouched. Otherwise each leg from the
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
import { MODULE } from "./movement-core.mjs";
import { dnd5eMovementAutomation, setting } from "./settings.mjs";
import { fieldFor } from "./pathfind-adapter.mjs";
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

/** A resumable search for leg a→b. `points` (pixel top-lefts, a and b excluded) once found. */
function legPlan(token, a, b, options, smooth) {
  const leg = { a, b, state: "more", points: null, arcs: 0, nodes: 0, field: null, job: null };
  if (!searchable(a, b)) { leg.state = "none"; return leg; }
  const f = fieldFor(token, a, b, {
    preview: !!options.preview, constrain: options.constrainOptions ?? {},
    measureOptions: options.measureOptions ?? {}, terrainOptions: options.terrainOptions ?? {}, memo: memoNow(),
    automation: dnd5eMovementAutomation(),
  });
  leg.field = f;
  // An unsnapped start joins the lattice at its nearest node, if that first move is open.
  const start = f.nodeOf(a);
  const lead = f.onLattice(a) ? null : f.pos(start);
  if (lead && !f.clear(a, lead)) { leg.state = "none"; return leg; }
  leg.lead = lead;
  leg.job = pf.search({
    start, goal: f.goal, edge: f.edge, wall: f.wall, unit: f.unit,
    bounds: pf.boundsFor(start, f.goal, f.lattice), maxNodes: LIMITS.maxNodes, now,
  });
  leg.finish = () => {
    leg.nodes = leg.job.expanded;
    const pulled = pf.stringPull(leg.job.path, leg.job.costs, { edge: f.edge, wall: f.wall, lineOk: f.lineOk });
    let pts = pulled.map(n => ({ ...f.pos(n), lattice: true }));
    if (lead) pts = [{ x: a.x, y: a.y }, ...pts];
    if (smooth && pts.length > 2) {
      const r = pf.fillet(pts, { maxT: LIMITS.arcMaxCells * f.s, clear: f.clear, cost: f.cost });
      leg.arcs = r.arcs;
      leg.smoothed = r.points.slice(1, -1);
    }
    leg.points = pts.slice(1, -1);
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
function planner(token, waypoints, options, from, wrapped, base, smooth) {
  const legs = [];
  for (let k = from; k < waypoints.length - 1; k++) legs.push(legPlan(token, waypoints[k], waypoints[k + 1], options, smooth));
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
        const n = pf.reachedCount(path, waypoints, same);
        if (n > reach) {
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
 * The job core's drag code waits on (TokenFindMovementPathJob): `result` is the path when found
 * at once, `undefined` while searching, `null` once cancelled. A search that does not finish in
 * one slice continues in timer slices; the drag shows core's searching animation meanwhile.
 */
function pathfindJob(token, waypoints, options, wrapped, base) {
  if (!Array.isArray(base?.result)) return null;          // a wrapper below us is still searching
  const reason = skipFor(token, waypoints, options);
  if (reason) return null;
  const reached = pf.reachedCount(base.result, waypoints, same);
  if (reached >= waypoints.length || reached === 0) return null;

  const smooth = !!setting("smoothCorners");
  const plan = planner(token, waypoints, options, reached - 1, wrapped, base, smooth);
  if (plan.step(LIMITS.sliceMs) === "done") {
    const path = plan.result();
    return { result: path, promise: Promise.resolve(path), cancel: () => {} };
  }

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
  const tick = () => {
    if (cancelled) return;
    try {
      const over = now() - started > LIMITS.totalMs;
      if (!over && plan.step(LIMITS.sliceMs) === "more") { setTimeout(tick, 0); return; }
      job.result = over ? base.result : plan.result();
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

/**
 * Route a token to a top-left position without moving it: what the drag would get. Runs every
 * slice synchronously (up to LIMITS.totalMs). Needs a canvas with the token's scene drawn.
 */
function route(tokenDoc, opts = {}) {
  const token = tokenDoc?.object;
  if (!token || !canvas?.ready) return { ok: false, reason: "no drawn token (the canvas must show its scene)" };
  const to = opts.to;
  if (!Number.isFinite(to?.x) || !Number.isFinite(to?.y)) return { ok: false, reason: "opts.to { x, y } (top-left pixels) is required" };
  const src = tokenDoc._source;
  const origin = { x: src.x, y: src.y, elevation: src.elevation, width: src.width, height: src.height, depth: src.depth,
    shape: src.shape, level: src.level, action: tokenDoc.movementAction, snapped: false, explicit: false, checkpoint: false };
  const dest = { ...origin, x: to.x, y: to.y, snapped: true, explicit: true };
  const options = { preview: !!opts.preview, constrainOptions: {}, measureOptions: {}, terrainOptions: {} };
  const call = (w, o) => {
    bypass = true;
    try { return token.findMovementPath(w, o); } finally { bypass = false; }
  };
  const t0 = now();
  dropMemo();
  const base = call([origin, dest], options);
  const reached = pf.reachedCount(base.result, [origin, dest], same);
  let path = base.result, legs = [], arcs = 0;
  if (reached === 1) {
    const plan = planner(token, [origin, dest], options, 0, call, base, opts.smooth ?? !!setting("smoothCorners"));
    while (plan.step(LIMITS.sliceMs) === "more" && now() - t0 < LIMITS.totalMs);
    path = plan.result();
    legs = plan.legs.map(l => ({ state: l.state, nodes: l.nodes, corners: l.points?.length ?? 0, arcs: l.arcs }));
    arcs = last?.arcs ?? 0;
  }
  const cost = path?.length ? token.measureMovementPath(path, { preview: !!opts.preview }).cost : null;
  return {
    ok: true,
    reached: pf.reachedCount(path, [origin, dest], same) === 2,
    straight: reached === 2,
    waypoints: (path ?? []).map(w => ({ x: w.x, y: w.y, explicit: !!w.explicit })),
    cost, arcs, legs, ms: Math.round((now() - t0) * 10) / 10,
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
