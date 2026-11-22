/**
 * Pentaryn Movement — the feature: group movement (0.4.0, plan context/plans/pathfinding-2026-11.md
 * §12–13). A multi-token drag drops with each member on its own route to its own rest slot, started
 * in waves so the circles keep apart, and an in-combat drop commits a checkpoint at every cell so
 * click-to-stop (stop.mjs) can halt it honestly.
 *
 * GLUE, one feature. Wraps Token#_prepareDragLeftDropUpdates on the configured token class: core's
 * own [updates, options] come back first, then
 *   - two or more contexts, no skip reason (motion-core groupMode): group-core plans slots, routes
 *     (the pathfinder's routeTo, through dnd5e's constrain) and start delays; wave 0 goes out as the
 *     drop's own update, later waves as timers on this client, one batched update per 150 ms;
 *   - ghost / unconstrained out of combat: core's straight lines, only a rest overlap nudged;
 *   - anything else: core's updates, with per-cell checkpoints for members in a started combat.
 * Any throw, an over-budget plan or an unverifiable route means core's own updates for that drop
 * (or member), with one warning. A plan that does not finish in GROUP_LIMITS.syncMs finishes in
 * timer slices; the drop then returns no updates and the same shape is committed when it is ready.
 *
 * While a group is dragged only the grabbed token is pathfound (groupFollower, read by pathfind.mjs):
 * the plan at the drop replaces the others' previews anyway.
 */

import { MODULE } from "./movement-core.mjs";
import { MOTION, cellChain, groupMode, radiusOf, waves } from "./motion-core.mjs";
import { GROUP_LIMITS, flood, planGroup, restOnPaths, runPlan } from "./group-core.mjs";
import { skipReason } from "./pathfind-core.mjs";
import { cutAtWalls, gridSize, inCombat, memberOf, narrowPoints, othersOf, restWalkable, toSquares, toTopLeft } from "./group-adapter.mjs";
import { fieldFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { dnd5eMovementAutomation, setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { resolveRef } from "./lib/resolve.mjs";
import { errorCode } from "./lib/errors.mjs";

let log = null;
let feature = null;
let dropHandle = null;
let dropPatched = false;

/** Groups this client committed: id → { ids, timers, stopped }. */
const groups = new Map();
const groupOf = new Map();                 // token id → group id
let last = null;                           // the last drop, for status()
let resumedLast = null;                    // the last reload that picked up unsent waves, for status()
let stoppedAt = null;                      // the last time a turn change stopped a group, for status()
const fallbacks = [];                      // the last few reasons a drop went to core
/** token id → the sequence number of this client's latest drop of it: an older plan or wave never overrides a newer drop. */
const latestDrop = new Map();
let dropSeq = 0;

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One async planning slice (ms), as the pathfinder's. */
const SLICE_MS = 8;
/** One route call's wall-clock cap: under the per-member budget, so a long or impossible route excludes that member instead of freezing the drop. */
const ROUTE_MS = Math.max(GROUP_LIMITS.memberMs - 30, 20);
/** How long after its last member should be at rest a group is still held as one (ms). */
const GROUP_HOLD_MS = 1000;

/* -------------------------------------------- */
/*  Pending waves survive a reload (live R3-1)  */
/* -------------------------------------------- */

/**
 * The later waves live in this client's timers; a reload (or a crash of the tab) used to drop them, and
 * a member of a later wave never moved (live R3-1: Hero 3 stayed at its start). Each scheduled group's
 * unsent waves are kept in this tab's sessionStorage (it survives a reload of the tab, nothing else
 * reads it) and taken off as they go out; on the next `ready` this client sends what is left, the
 * waves keeping their spacing (the first unsent one at once when it is overdue). The usual checks
 * still apply when each goes out: the member has not moved since the drop and no newer drop of it.
 * Records are this user's and this world's only, and older than PENDING_TTL_MS are dropped unsent.
 */
const PENDING_KEY = `${MODULE}.pendingWaves`;
/** How long after its drop a group's unsent waves are still sent after a reload (ms). */
const PENDING_TTL_MS = 60000;

function sessionStore() {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

function readPending() {
  const store = sessionStore();
  if (!store) return [];
  try {
    const list = JSON.parse(store.getItem(PENDING_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter(r => r && typeof r === "object") : [];
  } catch { return []; }
}

function writePending(list) {
  const store = sessionStore();
  if (!store) return;
  try {
    if (list.length) store.setItem(PENDING_KEY, JSON.stringify(list));
    else store.removeItem(PENDING_KEY);
  } catch (err) { log?.debug?.("pending waves (sessionStorage)", err); }
}

/** Keep (or replace) group `gid`'s record; stale records are dropped on the way. */
function savePending(rec) {
  const t = Date.now();
  let copy;
  try { copy = JSON.parse(JSON.stringify(rec)); } catch (err) { log?.debug?.("pending waves (serialise)", err); return; }
  writePending([...readPending().filter(r => r.gid !== rec.gid && t - (r.t0 ?? 0) <= PENDING_TTL_MS), copy]);
}

/** Take a wave (`at`), one member (`id`) or the whole group off group `gid`'s record. */
function prunePending(gid, { at = null, id = null } = {}) {
  const list = readPending();
  const i = list.findIndex(r => r.gid === gid);
  if (i < 0) return;
  const rec = list[i];
  if (at !== null) rec.waves = (rec.waves ?? []).filter(w => w.at !== at);
  else if (id !== null) {
    rec.waves = (rec.waves ?? []).map(w => ({ ...w, ids: (w.ids ?? []).filter(x => x !== id),
      updates: (w.updates ?? []).filter(u => u?._id !== id) })).filter(w => w.updates.length);
  } else rec.waves = [];
  if (rec.waves.length) list[i] = rec;
  else list.splice(i, 1);
  writePending(list);
}

/**
 * After a reload: send what this client's groups had left, spaced as planned. Returns how many
 * groups were picked up (status().group.resumed.groups).
 */
function resumePending() {
  const list = readPending();
  if (!list.length) return 0;
  writePending([]);
  let resumed = 0;
  const t = Date.now();
  for (const r of list) {
    try {
      if ((r.world ?? null) !== (game.world?.id ?? null) || r.user !== game.user?.id) continue;
      const age = t - (r.t0 ?? 0);
      if (!(age >= 0) || age > PENDING_TTL_MS) continue;
      const scene = globalThis.game?.scenes?.get?.(r.sceneId);
      const waves = (r.waves ?? []).filter(w => Array.isArray(w?.updates) && w.updates.length).sort((a, b) => a.at - b.at);
      if (!scene || !waves.length || !r.base) continue;
      // Each wave as late as the first unsent one (or on time): they keep their spacing to each other.
      const off = Math.min(age, waves[0].at);
      const later = waves.map(w => ({ ...w, at: Math.max(w.at - off, 0) }));
      const seq = ++dropSeq;
      for (const w of later) for (const u of w.updates) latestDrop.set(u._id, seq);
      const starts = new Map(Object.entries(r.starts ?? {}));
      const ids = [...new Set([...(r.ids ?? []), ...later.flatMap(w => w.updates.map(u => u._id))])];
      schedule(later, r.base, ids.map(id => ({ id })), { scene, seq, starts, endMs: Math.max((r.endMs ?? 0) - off, 0) });
      resumed += 1;
    } catch (err) {
      log?.warnOnce?.("group-resume", "a group's waves could not be resumed after a reload (further errors suppressed)", err);
    }
  }
  if (resumed) resumedLast = { at: new Date().toISOString(), groups: resumed };
  return resumed;
}

/** status().group.last after a throw: the drop went as core's (live R4-11: it read mode "plan", result null). */
function noteThrow(t0 = null) {
  last = { ...(last ?? { at: new Date().toISOString(), members: null, async: false, relaxed: 0, replans: 0 }),
    mode: "core", reason: "throw", result: "core", waves: 0, ms: t0 === null ? (last?.ms ?? null) : Math.round((now() - t0) * 10) / 10 };
}

function fellBack(reason) {
  fallbacks.unshift({ at: new Date().toISOString(), reason });
  fallbacks.length = Math.min(fallbacks.length, 8);
}

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

const contextsOf = event => Object.values(event?.interactionData?.contexts ?? {});

/** During a group drag, is this token one of the followers (pathfinding waits for the drop)? */
function groupFollower(token) {
  if (!setting("groupMovement")) return false;
  const dragged = token?.layer?._draggedToken;
  if (!dragged || dragged === token) return false;
  const contexts = dragged.mouseInteractionManager?.interactionData?.contexts ?? {};
  const n = Object.keys(contexts).length;
  if (n < 2 || n > GROUP_LIMITS.maxMembers || !(token.document?.id in contexts)) return false;
  // A drop core will commit anyway (Ctrl-click waypoints, a direct or planned move) keeps every
  // member's own pathfinding, as before 0.4.0: otherwise its followers would stop at the first wall.
  const planning = token.layer?._movementPlanningContext;
  if (planning || Object.values(contexts).some(c => c?.waypoints?.length)) return false;
  return (token.document?.parent?.grid?.type ?? globalThis.canvas?.grid?.type) === 1;
}

function modeFor(grabbed, contexts) {
  const planning = grabbed.layer?._movementPlanningContext ?? null;
  const constrain = grabbed._getDragConstrainOptions?.() ?? {};
  const ghost = !!feature.exposed.ghostFor?.(grabbed);
  const gridType = grabbed.document?.parent?.grid?.type ?? globalThis.canvas?.grid?.type;
  const combat = contexts.some(c => inCombat(c.token?.document));
  const pathfind = skipReason({
    mode: setting("pathfinding"), mine: !!setting("pathfindMine"), isGM: !!game.user?.isGM, gridType, constrain: {}, waypoints: 2,
  });
  return {
    combat, constrain,
    ...groupMode({
      enabled: !!setting("groupMovement"), members: contexts.length, gridType,
      direct: !!planning?.direct, planned: !!planning, waypoints: contexts.some(c => c.waypoints?.length),
      ghost, unconstrained: !!constrain.ignoreWalls && !ghost, combat, pathfind: pathfind === "grid" ? null : pathfind,
    }),
  };
}

/* -------------------------------------------- */
/*  In combat: a checkpoint at every cell        */
/* -------------------------------------------- */

/**
 * The waypoints after `path[0]` with every cell between lattice neighbours inserted as a snapped
 * checkpoint. Kept only when core measures the expanded path at exactly the same cost.
 */
function withCheckpoints(token, path) {
  const s = gridSize(token);
  const out = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const di = (b.y - a.y) / s, dj = (b.x - a.x) / s;
    const flat = ["elevation", "width", "height", "level", "action"].every(f => a[f] === undefined || b[f] === undefined || a[f] === b[f]);
    if (flat && Number.isInteger(di) && Number.isInteger(dj)) {
      const cells = cellChain([{ i: 0, j: 0 }, { i: di, j: dj }]);
      for (const c of cells.slice(1, -1)) {
        out.push({ ...b, x: a.x + c.j * s, y: a.y + c.i * s, snapped: true, explicit: false, checkpoint: c.checkpoint });
      }
    }
    out.push({ ...b, checkpoint: true });
  }
  try {
    const before = token.measureMovementPath(path, { preview: false })?.cost;
    const after = token.measureMovementPath([path[0], ...out], { preview: false })?.cost;
    if (!Number.isFinite(before) || Math.abs(before - after) > 1e-6) return path.slice(1);
  } catch {
    return path.slice(1);
  }
  return out;
}

/** In combat, give every member's committed waypoints their cell checkpoints. */
function checkpointAll(contexts, options) {
  if (!setting("clickToStop")) return;
  for (const c of contexts) {
    const id = c.token?.document?.id;
    const m = options.movement?.[id];
    // A planned move (the planning API) keeps its waypoints: its caller holds them as the plan's result.
    if (!m?.waypoints?.length || m.planned || !inCombat(c.token.document)) continue;
    const origin = feature.exposed.pathfindOrigin?.(c.token.document) ?? c.foundPath?.[0];
    m.waypoints = withCheckpoints(c.token, [origin, ...m.waypoints]);
  }
}

/* -------------------------------------------- */
/*  A drop left to core: no two at rest on one spot */
/* -------------------------------------------- */

/** Core reasons whose group drop is still de-stacked (the others are not a group, or the caller holds the path). */
const UNSTACK = new Set(["tooMany", "waypoints", "ghost", "unconstrained", "budget", "anchorNoRoute", "noPlan", "throw"]);
const unstackable = reason => UNSTACK.has(reason) || String(reason ?? "").startsWith("pathfind:");

/**
 * A group drop committed as core's: cut each member's path so that no two rest on top of each other
 * (group-core restOnPaths; live R1 D-1). The grabbed token is placed first. In combat a member only
 * stops on a cell centre (or a waypoint), so the cells it walks stay whole. Mutates core's
 * [updates, options] and returns it: a member that would not move at all leaves both.
 */
function unstack(contexts, result, anchorId, combat) {
  const [updates, options] = result ?? [];
  const movement = options?.movement;
  if (!Array.isArray(updates) || !movement || contexts.length < 2) return result;
  const recs = [];
  for (const c of contexts) {
    const doc = c.token?.document;
    if (!doc?._source) continue;
    const s = gridSize(c.token);
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const m = movement[doc.id];
    const origin = feature.exposed.pathfindOrigin?.(doc) ?? c.foundPath?.[0] ?? doc._source;
    const raw = m?.waypoints?.length ? [origin, ...m.waypoints] : [origin];
    recs.push({ id: doc.id, r: radiusOf(w, h), w, h, s, m, path: raw.map(p => toSquares(p, w, h, s)) });
  }
  recs.sort((a, b) => (a.id === anchorId ? -1 : b.id === anchorId ? 1 : 0));
  const onCell = (c, m) => [c.x - m.w / 2, c.y - m.h / 2].every(v => Math.abs(v - Math.round(v)) < 1e-6);
  const rest = restOnPaths(recs, { allowed: combat ? onCell : null });
  const still = new Set();
  for (const rec of recs) {
    const pick = rest[rec.id];
    if (!rec.m?.waypoints?.length || !pick || pick.end) continue;
    if (pick.k === 0 && pick.t <= 1e-6) { still.add(rec.id); delete movement[rec.id]; continue; }
    const wps = rec.m.waypoints;
    let cut;
    if (pick.t >= 1 - 1e-6) cut = wps.slice(0, pick.k + 1);
    else {
      const tl = toTopLeft(pick, rec.w, rec.h, rec.s);
      cut = [...wps.slice(0, pick.k), { ...wps[pick.k], x: tl.x, y: tl.y, snapped: !!combat }];
    }
    cut[cut.length - 1] = { ...cut.at(-1), explicit: true, checkpoint: true };
    movement[rec.id] = { ...rec.m, waypoints: cut };
  }
  if (still.size) result[0] = updates.filter(u => !still.has(u._id));
  return result;
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/** The oracles group-core asks, for these members on this canvas. */
function oraclesFor(members, anchor, { combat, constrain }) {
  const s = gridSize(anchor.token);
  const byId = new Map(members.map(m => [m.id, m]));
  // Walk distances from the anchor's drop point, on its own lattice (walls and blocking creatures;
  // no cost, which the flood does not need). Built on first use: a straight (ghost) drop never asks.
  let f = null, walk = null;
  const walkDistance = c => {
    if (!walk) {
      f = fieldFor(anchor.token, anchor.dest, anchor.dest, { preview: true, constrain: constrain ?? {}, automation: dnd5eMovementAutomation() });
      const rmax = Math.max(...members.map(m => m.r));
      walk = flood({ i: 0, j: 0 }, (a, b) => !f.blocked(b) && f.wall(a, b), Math.ceil(GROUP_LIMITS.rings * (2 * rmax + MOTION.restGap)) + 2);
    }
    const n = f.nodeOf(toTopLeft(c, anchor.w, anchor.h, s));
    return walk.get(`${n.i},${n.j}`) ?? null;
  };
  const restMemo = new Map();
  // Per member: the places no slot may be (a teleport / change-level region other than the one the
  // group is dropped into or the member starts in; a player's unexplored ground).
  const avoidMemo = new Map();
  const avoidFor = rec => {
    if (!avoidMemo.has(rec.id)) {
      let hz = null;
      try {
        const origin = feature.exposed.pathfindOrigin?.(rec.token.document) ?? { ...rec.token.document._source };
        hz = placesToAvoid(rec.token, origin, { ...anchor.dest, width: rec.w, height: rec.h }, { preview: true });
      } catch { hz = null; }
      avoidMemo.set(rec.id, hz);
    }
    return avoidMemo.get(rec.id);
  };
  const walkable = (m, c) => {
    const rec = byId.get(m.id) ?? m;
    const k = `${rec.id}|${rec.w}x${rec.h}|${c.x.toFixed(3)},${c.y.toFixed(3)}`;
    if (!restMemo.has(k)) {
      const hz = rec.token ? avoidFor(rec) : null;
      restMemo.set(k, restWalkable(rec, c, s) && !hz?.at(toTopLeft(c, rec.w, rec.h, s)));
    }
    return restMemo.get(k);
  };
  const measured = path => {
    const pts = path.map(p => toSquares(p, anchor.w, anchor.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    let cost = null;
    try { cost = anchor.token.measureMovementPath(path, { preview: true })?.cost ?? null; } catch { cost = null; }
    return { points: pts, length, data: { path, cost } };
  };
  const route = (m, from, to, { avoid = [] } = {}) => {
    const rec = byId.get(m.id);
    const doc = rec.token.document;
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    // The grabbed token to its drop point: the route its drag preview showed (already pathfound and
    // constrained while dragging), so it walks what the player saw and the drop never searches it again.
    const shown = rec.corePathRaw ?? [];
    const src = doc._source;
    // A search the drag had not finished (`searching`) is never reused.
    if (m.id === anchor.id && !avoid.length && atFormation && !rec.searching && shown.length >= 2
      && Math.round(last.x) === tl.x && Math.round(last.y) === tl.y
      && shown[0].x === src.x && shown[0].y === src.y) return measured(shown.map(p => ({ ...p })));
    const origin = feature.exposed.pathfindOrigin(doc);
    const dest = {
      ...origin, x: tl.x, y: tl.y, elevation: rec.dest.elevation ?? origin.elevation,
      action: last.action ?? doc.movementAction, snapped: combat || (atFormation && !!rec.dest.snapped),
      explicit: true, checkpoint: true,
    };
    const r = feature.exposed.pathfindRouteTo(rec.token, origin, dest, {
      preview: true, avoid: avoid.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      maxMs: ROUTE_MS,
    });
    if (!r?.reached || !r.path?.length) return null;
    const pts = r.path.map(p => toSquares(p, rec.w, rec.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return { points: pts, length, data: { path: r.path, cost: r.cost } };
  };
  return {
    walkable,
    walkDistance,
    route,
    narrow: (points, r) => narrowPoints(anchor.token, points, r, s),
    now,
  };
}

/** Members, the anchor and the plan generator for a drop (or a dry run). */
function prepare(grabbed, contexts, info) {
  const s = gridSize(grabbed);
  const members = contexts.map(c => ({ ...memberOf(c, s), corePathRaw: c.foundPath ?? [], searching: !!c.searching }));
  const anchor = members.find(m => m.id === grabbed.document.id);
  if (!anchor) return null;
  const spec = { members, anchorId: anchor.id, combat: info.combat, mode: info.mode, others: othersOf(members, s) };
  return { members, anchor, gen: planGroup(spec, oraclesFor(members, anchor, info)) };
}

/**
 * Turn a finished plan into update batches: { first: [updates, options], later: [{ at, ids, updates, movement }] }.
 * A planned member's waypoints are its route (in combat with cell checkpoints); a member left to core
 * keeps core's entry. A member whose route is missing falls back to core's entry too.
 */
function batches(plan, members, [updates, options], combat) {
  const movement = { ...options.movement };
  const delays = {};
  for (const m of members) {
    const e = plan.members[m.id];
    delays[m.id] = e?.delay ?? 0;
    if (plan.straight && e && movement[m.id]?.waypoints?.length) {
      // Ghost / unconstrained: core's straight line; a nudged member only gets its end moved.
      const tl = toTopLeft(e.slot, m.w, m.h, gridSize(m.token));
      const wps = movement[m.id].waypoints.slice();
      const end = wps.at(-1);
      if (end.x !== tl.x || end.y !== tl.y) wps[wps.length - 1] = { ...end, x: tl.x, y: tl.y, snapped: false };
      movement[m.id] = { ...movement[m.id], waypoints: wps };
      continue;
    }
    if (!e || e.core || !e.data?.path?.length) continue;
    const path = e.data.path;
    if (path.length < 2) { delete movement[m.id]; continue; }      // already there
    let wps = combat ? withCheckpoints(m.token, path) : path.slice(1);
    if (!plan.straight && !combat) wps = wps.map((w, k) => (k === wps.length - 1 ? w : { ...w, checkpoint: false }));
    wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
    movement[m.id] = { ...(movement[m.id] ?? { planned: false }), waypoints: wps };
  }
  const ids = Object.keys(movement);
  const byWave = waves(Object.fromEntries(ids.map(id => [id, delays[id] ?? 0])));
  const base = { ...options };
  delete base.movement;
  const cut = list => ({
    updates: list.map(id => updates.find(u => u._id === id) ?? { _id: id }),
    movement: Object.fromEntries(list.map(id => [id, movement[id]])),
  });
  const first = byWave[0]?.at === 0 ? cut(byWave[0].ids) : { updates: [], movement: {} };
  const later = byWave.filter(w => w.at > 0).map(w => ({ at: w.at, ids: w.ids, ...cut(w.ids) }));
  // When the last member should be at rest (ms after the drop): the group is stoppable as one until then.
  let endMs = 0;
  for (const m of members) {
    const e = plan.members[m.id];
    const pts = e?.points ?? [];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    endMs = Math.max(endMs, (e?.delay ?? 0) + (len / (m.speed > 0 ? m.speed : MOTION.speed)) * 1000);
  }
  return { first: [first.updates, { ...base, movement: first.movement }], later, base, endMs };
}

/**
 * Which of `ids` may still be sent for drop `seq`: on `scene`, not moved since the drop
 * (`starts`), and not dropped again by this client since (a newer drop always wins).
 */
function stillOurs(ids, scene, starts, seq) {
  return ids.filter(id => {
    const doc = scene?.tokens?.get(id);
    const at = starts.get(id);
    return doc && at && latestDrop.get(id) === seq && doc._source.x === at.x && doc._source.y === at.y;
  });
}

/**
 * Is a cell (top-left pixels) where token `id` would overlap another token at rest, or a spot an earlier
 * cut of the same drop claimed (`claims`: centres and radii in pixels)? Another token counts where the
 * server has it (its source: a moving one's is where it will stop). Tokens are circles: touching is fine.
 * A hidden token counts only for the GM.
 */
function takenFor(scene, id, claims) {
  const doc = scene?.tokens?.get(id);
  const s = doc?.object ? gridSize(doc.object) : (scene?.grid?.size ?? 100);
  const src = doc?._source ?? {};
  const w = src.width ?? 1, h = src.height ?? 1;
  const r = radiusOf(w, h) * s;
  const circles = [];
  const all = typeof scene?.tokens?.values === "function" ? [...scene.tokens.values()] : [];
  for (const o of all) {
    if (!o?._source || o.id === id) continue;
    if (o.hidden && !game.user?.isGM) continue;
    if (src.level !== undefined && o._source.level !== undefined && o._source.level !== src.level) continue;
    const ow = o._source.width ?? 1, oh = o._source.height ?? 1;
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r: radiusOf(ow, oh) * s });
  }
  for (const c of claims ?? []) if (c.id !== id) circles.push(c);
  return p => {
    const cx = p.x + (w * s) / 2, cy = p.y + (h * s) / 2;
    return circles.some(c => Math.hypot(cx - c.x, cy - c.y) < r + c.r - 1e-6);
  };
}

/**
 * A member's waypoints as they may still be walked now: a wall that closed since the plan (a door the
 * GM shut mid-walk, live R2-5) cuts them on a clean spot before it, never on the wall line, where core's
 * own cut would leave the member, and never on a spot another token rests on or another member of the
 * drop was cut to (live R4-1). The cut spot is added to `claims`. null when it cannot move at all.
 * Ghost and unconstrained moves pass.
 */
function walkableNow(scene, id, m, options, claims) {
  if (!m?.waypoints?.length || options?.constrainOptions?.ignoreWalls || m.planned) return m;
  const doc = scene?.tokens?.get(id);
  const token = doc?.object;
  if (!token?.checkCollision) return m;
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const { waypoints, cut } = cutAtWalls(token, origin, m.waypoints, { taken: takenFor(scene, id, claims) });
  if (!cut) return m;
  if (!waypoints.length) return null;
  const end = waypoints.at(-1), s = gridSize(token);
  const w = end.width ?? doc._source.width ?? 1, h = end.height ?? doc._source.height ?? 1;
  claims?.push({ id, x: end.x + (w * s) / 2, y: end.y + (h * s) / 2, r: radiusOf(w, h) * s });
  return { ...m, waypoints };
}

/** Send one batch for drop `seq`, only for the members still ours. `claims`: the drop's cut spots so far. */
function send(scene, seq, starts, updates, options, what, claims = []) {
  let ids = stillOurs(updates.map(u => u._id), scene, starts, seq);
  if (!ids.length) return;
  const movement = {};
  for (const id of ids) {
    const m = options.movement?.[id] ? walkableNow(scene, id, options.movement[id], options, claims) : options.movement?.[id];
    if (m) movement[id] = m;
  }
  ids = ids.filter(id => movement[id] || !options.movement?.[id]);
  if (!ids.length) return;
  scene.updateEmbeddedDocuments("Token", updates.filter(u => ids.includes(u._id)), { ...options, movement })
    .catch(err => log.warnOnce(`group-${what}`, `a group ${what} failed (further errors suppressed)`, err));
}

/**
 * Hold this client's group until its last member should be at rest (so a click on any member stops
 * them all, plan §12), and send the later waves; each checks the group was not stopped and its
 * members have not moved or been dropped again. Waves go to the drop's own scene, also when this
 * client has switched to another view meanwhile.
 */
function schedule(later, base, members, { scene, seq, starts, endMs = 0 }) {
  if (!base || members.length < 2) return;
  const gid = foundry.utils.randomID();
  const group = { ids: new Set(members.map(m => m.id)), timers: [], stopped: false, claims: [] };
  groups.set(gid, group);
  for (const id of group.ids) groupOf.set(id, gid);
  const lastWave = later.at(-1)?.at ?? 0;
  group.timers.push(setTimeout(() => forget(gid), Math.max(endMs, lastWave) + GROUP_HOLD_MS));
  if (later.length && scene?.id) {
    savePending({ gid, world: game.world?.id ?? null, user: game.user?.id ?? null, sceneId: scene.id, t0: Date.now(),
      endMs, base, ids: [...group.ids], starts: Object.fromEntries(starts ?? []),
      waves: later.map(w => ({ at: w.at, ids: w.ids, updates: w.updates, movement: w.movement })) });
  }
  for (const wave of later) {
    group.timers.push(setTimeout(() => {
      prunePending(gid, { at: wave.at });
      if (group.stopped) return;
      // A member a relay stop took out of the group (groupCancel only) is not sent.
      const updates = wave.updates.filter(u => group.ids.has(u._id));
      if (updates.length) send(scene, seq, starts, updates, { ...base, movement: wave.movement }, "wave", group.claims);
    }, wave.at));
  }
}

function forget(gid) {
  const g = groups.get(gid);
  if (!g) return;
  for (const t of g.timers) clearTimeout(t);
  for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
  groups.delete(gid);
  prunePending(gid);
}

/**
 * Stop the rest of a group this client sent (click-to-stop): cancel the unsent waves. Returns the
 * ids of the group's members (the caller stops those already moving), or [] when this client holds
 * no group for the token. `only` cancels just that token's own wave entry.
 */
function groupCancel(tokenId, { only = false } = {}) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  if (only) { g.ids.delete(tokenId); groupOf.delete(tokenId); prunePending(gid, { id: tokenId }); return [tokenId]; }
  g.stopped = true;
  const ids = [...g.ids];
  forget(gid);
  return ids;
}

/**
 * updateToken, every client: core stops a token's movement when its movement history is cleared, which
 * a turn change does for every combatant with a history (Combat#_clearMovementHistoryOnStartTurn). In a
 * group this client sent, that stopped only the members that had walked a square already, and the rest
 * (and the unsent waves) went on (live R4-3: on BOSS the third member kept walking). The whole group
 * now stops as one, as a click on a member stops it: unsent waves cancelled, every member this client
 * is moving stopped at its next square (stopMovement). What they walked before the turn change was
 * that turn's, and core clears it with the turn, as it does for a single token.
 */
function onHistoryCleared(doc, options) {
  if (!options?._clearMovementHistory || !doc?.id || !groupOf.has(doc.id)) return;
  const ids = groupCancel(doc.id);
  for (const id of ids) {
    if (id === doc.id) continue;
    const d = doc.parent?.tokens?.get(id);
    const m = d?.movement;
    if (!m?.user?.isSelf || m.state === "completed" || m.state === "stopped") continue;
    try { d.stopMovement(); } catch (err) { log?.debug?.("stop a member at a turn change", err); }
  }
  if (ids.length) {
    stoppedAt = { at: new Date().toISOString(), why: "turnChange", members: ids.length };
  }
}

/* -------------------------------------------- */
/*  The drop                                    */
/* -------------------------------------------- */

function debugThrow() {
  if (globalThis.CONFIG?.debug?.[`${MODULE}.throw`]) throw new Error("debug: forced planner throw");
}

/** Does no member of this drop go anywhere (every waypoint is where it stands)? */
function droppedInPlace(contexts, [updates, options]) {
  return contexts.every(c => {
    const doc = c.token.document;
    const wps = options.movement?.[doc.id]?.waypoints ?? [];
    return wps.every(w => w.x === doc._source.x && w.y === doc._source.y && (w.elevation ?? doc._source.elevation) === doc._source.elevation);
  }) || !updates.length;
}

/** The wrap's body: core's result in, the drop's result out (null while an async plan runs). */
function onDrop(grabbed, event, result) {
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[1]?.movement) return result;
  const contexts = contextsOf(event).filter(c => c?.token?.document);
  if (!contexts.length) return result;
  // Every drop, whatever its mode, supersedes this client's pending plan or waves for those tokens.
  const seq = ++dropSeq;
  for (const c of contexts) latestDrop.set(c.token.document.id, seq);
  // Click-to-stop arms MOTION.armMs after the drop (stop.mjs).
  try { feature.exposed.noteDrop?.(contexts.map(c => c.token.document.id)); } catch (err) { log.debug?.("noteDrop", err); }
  const info = modeFor(grabbed, contexts);
  const t0 = now();
  last = { at: new Date().toISOString(), mode: info.mode, reason: info.reason, combat: info.combat, members: contexts.length,
    result: null, ms: null, async: false, relaxed: 0, replans: 0, waves: 0 };

  // Dropped where it stands: nobody moves, nothing to plan (live R4-11: it spent 316 ms and fell back on budget).
  if (droppedInPlace(contexts, result)) {
    Object.assign(last, { mode: "core", reason: "still", result: "core", ms: 0 });
    return result;
  }
  if (info.mode === "core") {
    if (unstackable(info.reason)) unstack(contexts, result, grabbed.document.id, info.combat);
    if (info.combat) checkpointAll(contexts, result[1]);
    last.result = "core";
    return result;
  }
  debugThrow();
  const prep = prepare(grabbed, contexts, info);
  if (!prep) { fellBack("noAnchor"); return result; }

  const finish = plan => {
    last.ms = Math.round((now() - t0) * 10) / 10;
    if (plan?.result !== "plan") {
      fellBack(plan?.reason ?? "noPlan");
      last.result = "core";
      last.reason = plan?.reason ?? "noPlan";
      unstack(contexts, result, grabbed.document.id, info.combat);
      if (info.combat) checkpointAll(contexts, result[1]);
      return { first: result, later: [], base: null };
    }
    last.result = "plan";
    Object.assign(last, { relaxed: plan.relaxed, replans: plan.replans, constricted: plan.constricted,
      formation: plan.formation, excluded: plan.excluded, planMs: plan.ms });
    const b = batches(plan, prep.members, result, info.combat);
    last.waves = b.later.length + 1;
    return b;
  };

  const scene = grabbed.document.parent ?? canvas.scene;
  const starts = new Map(prep.members.map(m => [m.id, { x: m.token.document._source.x, y: m.token.document._source.y }]));
  const hold = b => ({ scene, seq, starts, endMs: b.endMs ?? 0 });
  const step = runPlan(prep.gen, GROUP_LIMITS.syncMs, now);
  if (step.done) {
    const b = finish(step.value);
    schedule(b.later, b.base, prep.members, hold(b));
    return b.first[0].length ? b.first : null;
  }

  // Async: finish in timer slices, then commit the same shape core would have, for the members
  // nobody moved and this client did not drop again in the meantime.
  last.async = true;
  const commit = ([updates, options]) => {
    if (updates.length) send(scene, seq, starts, updates, options, "move");
  };
  const tick = () => {
    if (!feature) return;                  // uninstalled while planning: nothing is sent
    let b;
    try {
      if (now() - t0 > GROUP_LIMITS.totalMs) b = finish({ result: "core", reason: "budget" });
      else {
        const r = runPlan(prep.gen, SLICE_MS, now);
        if (!r.done) { setTimeout(tick, 0); return; }
        b = finish(r.value);
      }
    } catch (err) {
      log.warnOnce("group-plan", "group planning failed; the move goes as core's (further errors suppressed)", err);
      fellBack("throw");
      noteThrow(t0);
      try { unstack(contexts, result, grabbed.document.id, info.combat); }
      catch (e) { log.debug?.("unstack after a planning throw", e); }
      b = { first: result, later: [], base: null };
    }
    commit(b.first);
    schedule(b.later, b.base, prep.members, hold(b));
  };
  setTimeout(tick, 0);
  return null;
}

/* -------------------------------------------- */
/*  The wrap                                    */
/* -------------------------------------------- */

function patchDrop() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._prepareDragLeftDropUpdates !== "function") {
    log.warn("no Token#_prepareDragLeftDropUpdates; group movement disabled");
    return false;
  }
  dropHandle = wrapMethod(MODULE, {
    target: proto, name: "_prepareDragLeftDropUpdates", label: "Token#_prepareDragLeftDropUpdates",
    marker: "__pentarynMovementGroup", adjustments: "movement-group-drop",
  }, function (wrapped, event) {
    const result = wrapped(event);
    try { return onDrop(this, event, result); }
    catch (err) {
      log.warnOnce("group", "group movement skipped; the move goes as core's (further errors suppressed)", err);
      fellBack("throw");
      noteThrow();
      // Still no two at rest on one spot (as every other core fallback; live R2-1 checked the throw path too).
      try {
        const contexts = contextsOf(event).filter(c => c?.token?.document);
        if (Array.isArray(result?.[0]) && result[1]?.movement) unstack(contexts, result, this.document?.id, contexts.some(c => inCombat(c.token.document)));
      } catch (e) { log.debug?.("unstack after a throw", e); }
      return result;
    }
  });
  return true;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

function groupStatus() {
  const controlled = globalThis.canvas?.tokens?.controlled ?? [];
  return {
    enabled: !!setting("groupMovement"),
    clickToStop: !!setting("clickToStop"),
    patched: { drop: dropPatched, click: !!feature?.exposed?.stopPatched?.() },
    regime: controlled.some(t => inCombat(t.document)) ? "combat" : "free",
    limits: { ...GROUP_LIMITS, motion: { ...MOTION } },
    groups: groups.size,
    last: last ? { ...last } : null,
    fallbacks: fallbacks.map(f => ({ ...f })),
    resumed: resumedLast ? { ...resumedLast } : null,
    stopped: stoppedAt ? { ...stoppedAt } : null,
  };
}

/**
 * Dry run: what a drop of these tokens at `point` (the first token's destination, top-left pixels;
 * the others keep their offsets) would do. Nothing moves.
 */
function dryRun(refs, point) {
  if (!globalThis.canvas?.ready) return { ok: false, code: "NO_CANVAS", reason: "no drawn canvas (a browser tab, not the headless GM)" };
  let list;
  try { list = (Array.isArray(refs) ? refs : [refs]).map(r => resolveRef(r, "token")); }
  catch (err) { return { ok: false, code: errorCode(err) ?? "BAD_ARGS", reason: String(err?.message ?? err) }; }
  const tokens = list.map(d => d?.object).filter(Boolean);
  if (tokens.length !== list.length) return { ok: false, code: "NOT_FOUND", reason: "every token must be drawn on this canvas" };
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { ok: false, code: "BAD_ARGS", reason: "point { x, y } (top-left pixels) is required" };
  const lead = tokens[0].document._source;
  const dx = point.x - lead.x, dy = point.y - lead.y;
  let anchorRoute = null;
  const contexts = tokens.map((t, k) => {
    const origin = feature.exposed.pathfindOrigin(t.document);
    const dest = { ...origin, x: origin.x + dx, y: origin.y + dy, snapped: true, explicit: true, checkpoint: true };
    // The grabbed token gets the route its drag preview would have shown (the pathfinder's own, full
    // budget): a real drop reuses that route, so the dry run must too. Without it the anchor was searched
    // inside the plan's per-member budget and a maze dry run read "anchorNoRoute" / "budget" where a drop
    // plans (live R3-5).
    let foundPath = [origin];
    if (k === 0) {
      try {
        const r = feature.exposed.pathfindRouteTo?.(t, origin, dest, { preview: true });
        anchorRoute = { reached: !!r?.reached, ms: r?.ms ?? null, waypoints: r?.path?.length ?? 0 };
        if (r?.reached && r.path?.length >= 2) foundPath = r.path;
      } catch (err) { log.debug?.("dry run: the anchor's route", err); }
    }
    return { token: t, destination: dest, foundPath, waypoints: [] };
  });
  const info = modeFor(tokens[0], contexts);
  if (info.mode === "core" && tokens.length > 1) return { ok: true, result: "core", reason: info.reason, anchorRoute, members: [] };
  const prep = prepare(tokens[0], contexts, { ...info, mode: info.mode === "core" ? "plan" : info.mode });
  let r = runPlan(prep.gen, GROUP_LIMITS.totalMs, now);
  while (!r.done) r = runPlan(prep.gen, GROUP_LIMITS.totalMs, now);
  const plan = r.value;
  if (plan.result !== "plan") return { ok: true, result: "core", reason: plan.reason, anchorRoute, members: [] };
  const s = gridSize(tokens[0]);
  return {
    ok: true, result: "plan", reason: info.reason, combat: info.combat, constricted: plan.constricted, anchorRoute,
    formation: plan.formation, replans: plan.replans, relaxed: plan.relaxed, ms: plan.ms,
    members: prep.members.map(m => {
      const e = plan.members[m.id];
      return {
        id: m.id, name: m.token.document.name, core: !!e?.core, level: e?.level ?? null, delay: e?.delay ?? 0,
        slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null, waypoints: e?.data?.path?.length ?? e?.points?.length ?? 0,
      };
    }),
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  if (ctx.late) dropPatched = patchDrop();
  else reg.once("setup", () => { dropPatched = patchDrop(); }, { guard: false, label: "setup: wrap _prepareDragLeftDropUpdates (group movement)" });
  // A reload mid-move: this tab's unsent waves go out now (live R3-1).
  if (ctx.late) resumePending();
  else reg.once("ready", () => { resumePending(); }, { label: "ready: resume a group's waves after a reload" });
  // A turn change clears every combatant's movement history, and core stops a token whose history is
  // cleared: the rest of its group stops with it (live R4-3).
  reg.on("updateToken", (doc, _changes, options) => onHistoryCleared(doc, options), { label: "updateToken: a turn change stops the whole group" });
  ctx.expose({ groupFollower, groupCancel, groupStatus, groupDryRun: dryRun, groupPatched: () => dropPatched });
}

export function uninstall() {
  dropHandle?.unwrap();
  dropHandle = null;
  dropPatched = false;
  // The unsent waves' records stay: a hot patch's re-import (or the next reload) sends them.
  for (const g of groups.values()) for (const t of g.timers) clearTimeout(t);
  groups.clear();
  groupOf.clear();
  last = null;
  resumedLast = null;
  stoppedAt = null;
  fallbacks.length = 0;
  latestDrop.clear();
  feature = null;
}
