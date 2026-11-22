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
import { MOTION, cellChain, firstLegAcross, groupMode, radiusOf, routeAhead, waves } from "./motion-core.mjs";
import { DETOUR_SQUARES, GROUP_LIMITS, detourTooLong, flood, hexCandidates, planGroup, restOnPaths, runPlan, walkersMeet } from "./group-core.mjs";
import { LIMITS, skipReason } from "./pathfind-core.mjs";
import { clearOfWalls, continuationInFlight, cutAtWalls, drawnPosition, gridSize, inCombat, memberOf, movementFacts, movingOthers, narrowPoints, othersOf, pinDrawn, restWalkable, speedOf, stopWhereDrawn, toSquares, toTopLeft, unpin } from "./group-adapter.mjs";
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
/** Every client: token id → { gid, at } from the update options of a group's moves (GROUP_OPT). */
const tagOf = new Map();
/** The update option that names the group a move belongs to, so every client knows its members (decision 3). */
const GROUP_OPT = "pentarynMovementGroup";
/** A click-stop's update option: the square it walks on to after its displace (stop.mjs, HX1-07). */
const STOP_AT = "pentarynMovementStopAt";
/** How long a group tag names a token's group (ms). */
const TAG_TTL_MS = 60000;
let last = null;                           // the last drop, for status()
let resumedLast = null;                    // the last reload that picked up unsent waves, for status()
let stoppedAt = null;                      // the last time a turn change stopped a group, for status()
let destacked = null;                      // the last rest check that moved a member off another, for status()
let cutLast = null;                        // the last wall raised mid-walk that cut moves this client started, for status()
let heldLast = null;                       // the last wave held back for a token walking through its way (HX1-02), for status()
const fallbacks = [];                      // the last few reasons a drop went to core
/** token id → the sequence number of this client's latest drop of it: an older plan or wave never overrides a newer drop. */
const latestDrop = new Map();
let dropSeq = 0;

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One async planning slice (ms), as the pathfinder's. */
const SLICE_MS = 8;
/** One route call's wall-clock cap: under the per-member budget, so a long or impossible route excludes that member instead of freezing the drop. */
const ROUTE_MS = Math.min(Math.max(GROUP_LIMITS.memberMs - 30, 20), 250);
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

/**
 * The page is going (a reload, a closed tab): a wave due now is not sent and stays in the record for the
 * next `ready` (live R5-2). Between a reload's start and the old page's end its timers still fire; 0.4.3
 * took the wave off the record and then sent it over a socket that was closing, so the update was lost
 * and the reloaded page had nothing to resume: the grabbed member, in the last wave, never moved. A wave
 * now leaves the record only once the server has the update. If the page stays after all (a cancelled
 * navigation), the held wave goes out UNLOAD_RETRY_MS later.
 */
let unloading = false;
const UNLOAD_RETRY_MS = 2000;
let unloadTarget = null;
const onUnload = () => { unloading = true; };
function listenUnload() {
  const w = globalThis.window ?? globalThis;
  if (unloadTarget === w || typeof w?.addEventListener !== "function") return;
  w.addEventListener("beforeunload", onUnload);
  w.addEventListener("pagehide", onUnload);
  unloadTarget = w;
}
function unlistenUnload() {
  try {
    unloadTarget?.removeEventListener?.("beforeunload", onUnload);
    unloadTarget?.removeEventListener?.("pagehide", onUnload);
  } catch (err) { log?.debug?.("unload listener", err); }
  unloadTarget = null;
  unloading = false;
}

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
function unstack(contexts, result, anchorId, combat, around = []) {
  const [updates, options] = result ?? [];
  const movement = options?.movement;
  if (!Array.isArray(updates) || !movement || contexts.length + around.length < 2) return result;
  // Circles that stay where they are (squares): tokens outside the drop, members that are not moving.
  const recs = around.map((c, i) => ({ id: `__still${i}`, r: c.r, path: [{ x: c.x, y: c.y }] }));
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
  // The grabbed token first (it keeps its end) unless it would rest on one that stays (H1-08).
  if (!around.length) recs.sort((a, b) => (a.id === anchorId ? -1 : b.id === anchorId ? 1 : 0));
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
function oraclesFor(members, anchor, { combat, constrain, clock = null }) {
  const s = gridSize(anchor.token);
  const byId = new Map(members.map(m => [m.id, m]));
  // Tokens outside the drop, at rest where the server has them (squares): routes keep round them out of
  // combat (live H1-09: arrivals were drawn through a crowd member standing in the far room, -30 / -81 px).
  let still = null;
  const stillOthers = () => (still ??= (() => { try { return othersOf(members, s); } catch { return []; } })());
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
  // Did the last route() return null only because its search ran out of time (H4-01: "no route" for a way the
  // identical next drag found)? planGroup then finishes that search in slices (routeLong).
  let unfinished = false;
  const destOf = (rec, to) => {
    const doc = rec.token.document;
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    const origin = feature.exposed.pathfindOrigin(doc);
    return { origin, dest: {
      ...origin, x: tl.x, y: tl.y, elevation: rec.dest.elevation ?? origin.elevation,
      action: last.action ?? doc.movementAction, snapped: combat || (atFormation && !!rec.dest.snapped),
      explicit: true, checkpoint: true,
    } };
  };
  const route = (m, from, to, { avoid = [] } = {}) => {
    unfinished = false;
    const rec = byId.get(m.id);
    const doc = rec.token.document;
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    // The grabbed token to its drop point: the route its drag preview showed (already pathfound and
    // constrained while dragging), so it walks what the player saw and the drop never searches it again.
    const shown = rec.corePathRaw ?? [];
    const src = doc._source;
    // Round the tokens that stay, when it can be (not those on its start or its spot); else as before.
    const crowd = combat || constrain?.ignoreWalls ? [] : stillOthers()
      .map(c => ({ x: c.x, y: c.y, r: c.r + rec.r }))
      .filter(c => Math.hypot(c.x - from.x, c.y - from.y) >= c.r - 1e-6 && Math.hypot(c.x - to.x, c.y - to.y) >= c.r - 1e-6);
    // A search the drag had not finished (`searching`) is never reused, nor one through a token that stays (HX1-01: the
    // drag's preview routes round walls only, and the grabbed one walked through Hero 7 standing in room B, -84 px).
    if (m.id === anchor.id && !avoid.length && atFormation && !rec.searching && shown.length >= 2
      && Math.round(last.x) === tl.x && Math.round(last.y) === tl.y
      && shown[0].x === src.x && shown[0].y === src.y && !throughAny(shown.map(p => toSquares(p, rec.w, rec.h, s)), crowd)) {
      return measured(shown.map(p => ({ ...p })));
    }
    const origin = feature.exposed.pathfindOrigin(doc);
    const dest = {
      ...origin, x: tl.x, y: tl.y, elevation: rec.dest.elevation ?? origin.elevation,
      action: last.action ?? doc.movementAction, snapped: combat || (atFormation && !!rec.dest.snapped),
      explicit: true, checkpoint: true,
    };
    const search = list => feature.exposed.pathfindRouteTo(rec.token, origin, dest, {
      preview: true, avoid: list.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      maxMs: ROUTE_MS,
    });
    const lengthOf = path => {
      const pts = path.map(p => toSquares(p, rec.w, rec.h, s));
      let length = 0;
      for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      return { pts, length };
    };
    let r = crowd.length ? search([...avoid, ...crowd]) : null;
    // Its search round them ran out (a slow tab): never the way through them instead; the plan finishes it (routeLong).
    if (crowd.length && !r?.reached && r?.unfinished) { unfinished = true; return null; }
    if (r?.reached && r.path?.length) {
      // Round the crowd, but never the long way round (live H3-03): past the H2-02 rule against the way
      // that ignores the crowd, that way wins (the rest check keeps the ends apart).
      const round = lengthOf(r.path).length;
      if (round > Math.hypot(to.x - from.x, to.y - from.y) + DETOUR_SQUARES) {
        const plain = search(avoid);
        if (plain?.reached && plain.path?.length && detourTooLong(lengthOf(plain.path).length, round)) r = plain;
      }
    }
    if (!r?.reached || !r.path?.length) r = search(avoid);
    if (!r?.reached || !r.path?.length) { unfinished = !!r?.unfinished; return null; }
    const { pts, length } = lengthOf(r.path);
    return { points: pts, length, data: { path: r.path, cost: r.cost } };
  };
  /**
   * The route a short search could not finish, searched to the end in slices (a yield between them, so a slow
   * tab draws its frames): `yield*` it from the plan. Its own cap is a drag search's (LIMITS.totalMs of its
   * own slices). The route, or null (no way, or still not found: `unfinished` says which).
   */
  const routeLong = function* (m, from, to, { avoid = [] } = {}) {
    unfinished = false;
    const rec = byId.get(m.id);
    const steps = feature.exposed.pathfindRouteSteps;
    if (!rec || typeof steps !== "function") return null;
    const { origin, dest } = destOf(rec, to);
    const searchLong = function* (list) {
      const gen = steps(rec.token, origin, dest, {
        preview: true, avoid: list.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      });
      let busy = 0, r;
      for (;;) {
        const t = now();
        r = gen.next(busy >= LIMITS.totalMs);
        busy += now() - t;
        if (r.done) break;
        yield "route";
      }
      return r.value;
    };
    // Round the tokens that stay here too (HX1-01 (d): a member whose short search ran out on a slow tab was
    // searched again without them and walked through the crowd at the corridor's mouth, -77 to -90 px), unless
    // that is the long way round.
    const crowd = combat || constrain?.ignoreWalls ? [] : stillOthers()
      .map(c => ({ x: c.x, y: c.y, r: c.r + rec.r }))
      .filter(c => Math.hypot(c.x - from.x, c.y - from.y) >= c.r - 1e-6 && Math.hypot(c.x - to.x, c.y - to.y) >= c.r - 1e-6);
    const len = path => {
      let L = 0;
      for (let k = 1; k < path.length; k++) L += Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y) / s;
      return L;
    };
    let v = crowd.length ? yield* searchLong([...avoid, ...crowd]) : null;
    if (v?.reached && v.path?.length && len(v.path) > Math.hypot(to.x - from.x, to.y - from.y) + DETOUR_SQUARES) {
      const plain = yield* searchLong(avoid);
      if (plain?.reached && plain.path?.length && detourTooLong(len(plain.path), len(v.path))) v = plain;
    }
    if (!v?.reached || !v.path?.length) v = yield* searchLong(avoid);
    if (!v?.reached || !v.path?.length) { unfinished = !!v?.unfinished; return null; }
    const pts = v.path.map(p => toSquares(p, rec.w, rec.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return { points: pts, length, data: { path: v.path, cost: v.cost } };
  };
  return {
    walkable,
    walkDistance,
    route,
    routeLong,
    unfinished: () => unfinished,
    narrow: (points, r) => narrowPoints(anchor.token, points, r, s),
    now: clock?.now ?? now,
  };
}

/** Does a path (centres, squares) come inside any of `circles` ({ x, y, r } squares) by more than a hair? */
function throughAny(pts, circles) {
  if (!circles?.length || pts.length < 2) return false;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (circles.some(c => segDist(c, a, b) < c.r - 0.02)) return true;
  }
  return false;
}

/**
 * A clock that runs only while the plan runs (live H1-03). The budget was read on the wall clock, and
 * between two 8 ms slices a slow page draws a frame (100-400 ms on a busy tab), so a plan of about
 * 150 ms of work read 420 ms and went to core: the followers stopped at the first wall. The budget is
 * now the planning time itself; the silent wait has its own wall-clock cap (GROUP_LIMITS.waitMs).
 */
function planClock() {
  let spent = 0, since = null;
  return {
    now: () => spent + (since === null ? 0 : now() - since),
    run(fn) {
      since = now();
      try { return fn(); } finally { spent += now() - since; since = null; }
    },
  };
}

/** Members, the anchor and the plan generator for a drop (or a dry run). */
function prepare(grabbed, contexts, info) {
  const s = gridSize(grabbed);
  const members = contexts.map(c => ({ ...memberOf(c, s), corePathRaw: c.foundPath ?? [], searching: !!c.searching }));
  const anchor = members.find(m => m.id === grabbed.document.id);
  if (!anchor) return null;
  let moving = [];
  try { moving = info.mode === "plan" ? movingOthers(members, s) : []; } catch (err) { log?.debug?.("tokens walking outside the group", err); }
  const spec = { members, anchorId: anchor.id, combat: info.combat, mode: info.mode, others: othersOf(members, s), moving };
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
    const r = radiusOf(ow, oh) * s;
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r });
    // Still walking with waypoints to go (a move with checkpoints): core constrains each next leg when it
    // continues, so a door shut since stops it short of its source. Where it will stop counts too (live
    // R5-1: a member already walking to the door was cut by core on the square a waiting member was sent to).
    const stop = predictedStop(o);
    if (stop) circles.push({ x: stop.x + (ow * s) / 2, y: stop.y + (oh * s) / 2, r });
  }
  for (const c of claims ?? []) if (c.id !== id) circles.push(c);
  return p => {
    const cx = p.x + (w * s) / 2, cy = p.y + (h * s) / 2;
    return circles.some(c => Math.hypot(cx - c.x, cy - c.y) < r + c.r - 1e-6);
  };
}

/**
 * Where core will stop a token whose move still has waypoints pending (top-left pixels), with the walls
 * as they are now: its own constrainMovementPath over the rest of the path, as core's continuation runs
 * it. null when nothing is pending, the path is not cut, or the token is not drawn here.
 */
function predictedStop(doc) {
  const m = doc?.movement;
  const pending = m?.pending?.waypoints;
  if (!pending?.length || m.state === "completed" || m.state === "stopped") return null;
  const token = doc.object;
  if (typeof token?.constrainMovementPath !== "function") return null;
  try {
    const origin = { ...doc._source };
    const [path, cut] = token.constrainMovementPath([origin, ...pending.filter(w => !w.intermediate)], { preview: false });
    const end = cut ? path?.at(-1) : null;
    return end && Number.isFinite(end.x) && Number.isFinite(end.y) ? { x: end.x, y: end.y } : null;
  } catch { return null; }
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

/**
 * A wave member's waypoints, round the members clicked to a stop since the drop (H1-05): when its path
 * passes through one, searched again round it (a short search); unchanged when it does not, or when no
 * way round is found (the rest check moves it off at the end).
 */
function roundStopped(scene, id, m, options, avoid) {
  if (!m?.waypoints?.length || options?.constrainOptions?.ignoreWalls || m.planned) return m;
  const doc = scene?.tokens?.get(id);
  const token = doc?.object;
  if (!token || inCombat(doc)) return m;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const rm = radiusOf(w, h) * s;
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const circles = avoid.map(c => ({ x: c.x, y: c.y, r: c.r + rm - 1 }));
  let prev = centre(doc._source), hit = false;
  for (const q of m.waypoints.map(centre)) { if (circles.some(c => segDist(c, prev, q) < c.r)) { hit = true; break; } prev = q; }
  if (!hit) return m;
  try {
    const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
    const r = feature.exposed.pathfindRouteTo?.(token, origin, { ...origin, ...m.waypoints.at(-1), explicit: true, checkpoint: true },
      { avoid: circles, maxMs: AROUND_MS });
    const from = { x: doc._source.x, y: doc._source.y };
    if (r?.reached && r.path?.length >= 2 && !tooLong(from, m.waypoints, r.path.slice(1), s)) {
      const wps = r.path.slice(1).map((p, k, all) => ({ ...p, checkpoint: k === all.length - 1, explicit: k === all.length - 1 ? true : p.explicit }));
      return { ...m, waypoints: wps };
    }
    // No way round, or only the long way (H2-02: round the whole dungeon): it walks only as far as open floor
    // short of the first stopped member on its way, or does not set off.
    const hitC = circles.find(cc => { let p = centre(doc._source); return m.waypoints.map(centre).some(q => { const d = segDist(cc, p, q) < cc.r; p = q; return d; }); }) ?? circles[0];
    const wps = restShortOf(token, { from, waypoints: m.waypoints }, hitC, hitC.r, takenFor(scene, id, []), s);
    return wps.length ? { ...m, waypoints: wps } : null;
  } catch (err) { log?.debug?.("a wave round a stopped member", err); return m; }
}

/**
 * Send one batch for drop `seq`, only for the members still ours. `claims`: the drop's cut spots so far.
 * Resolves true once the batch is done with (sent and answered, nothing to send, or refused), false when
 * the update failed because the page is going: the caller keeps it for the reloaded page.
 */
function send(scene, seq, starts, updates, options, what, claims = [], avoid = []) {
  let ids = stillOurs(updates.map(u => u._id), scene, starts, seq);
  if (!ids.length) return Promise.resolve(true);
  const movement = {};
  for (const id of ids) {
    let m = options.movement?.[id] ? walkableNow(scene, id, options.movement[id], options, claims) : options.movement?.[id];
    if (m && avoid.length) m = roundStopped(scene, id, m, options, avoid);
    if (m) movement[id] = m;
  }
  ids = ids.filter(id => movement[id] || !options.movement?.[id]);
  if (!ids.length) return Promise.resolve(true);
  let pending;
  try { pending = Promise.resolve(scene.updateEmbeddedDocuments("Token", updates.filter(u => ids.includes(u._id)), { ...options, movement })); }
  catch (err) { pending = Promise.reject(err); }
  return pending.then(() => true, err => {
    if (unloading) return false;
    log.warnOnce(`group-${what}`, `a group ${what} failed (further errors suppressed)`, err);
    return true;
  });
}

/**
 * Hold this client's group until its last member should be at rest (so a click on any member stops
 * them all, plan §12), and send the later waves; each checks the group was not stopped and its
 * members have not moved or been dropped again. Waves go to the drop's own scene, also when this
 * client has switched to another view meanwhile.
 */
function schedule(later, base, members, { scene, seq, starts, endMs = 0, gid = foundry.utils.randomID() }) {
  if (!base || members.length < 2) return null;
  const group = { ids: new Set(members.map(m => m.id)), timers: [], stopped: false, claims: [], avoid: [], pinned: new Set(), scene };
  const order = members.map(m => m.id);
  groups.set(gid, group);
  for (const id of group.ids) groupOf.set(id, gid);
  const lastWave = later.at(-1)?.at ?? 0;
  // A wave held back for a token walking through its way (HX1-02) pushes the group's end back by as much.
  group.held = 0;
  group.waiting = 0;
  group.t0 = Date.now();
  group.shift = 0;
  const end = () => {
    if (group.held > 0 || group.waiting > 0) {
      const extra = Math.max(group.held, FOREIGN_WAIT_MS);
      group.held = 0;
      group.timers.push(setTimeout(end, extra));
      return;
    }
    const stopped = group.stopped;
    forget(gid);
    // A stopped group rests where it was stopped (a click, a turn change); otherwise nobody on top of anybody.
    // A member clicked to a stop stays where it was put: the others step off it, never it off them.
    if (!stopped && scene) settleGroup(order.filter(id => !group.pinned.has(id)), scene);
  };
  group.timers.push(setTimeout(end, Math.max(endMs, lastWave) + GROUP_HOLD_MS));
  if (later.length && scene?.id) {
    savePending({ gid, world: game.world?.id ?? null, user: game.user?.id ?? null, sceneId: scene.id, t0: Date.now(),
      endMs, base, ids: [...group.ids], starts: Object.fromEntries(starts ?? []),
      waves: later.map(w => ({ at: w.at, ids: w.ids, updates: w.updates, movement: w.movement })) });
  }
  if (later.length) listenUnload();
  const fire = wave => {
    if (group.stopped) return;
    // The page is going: the wave stays in the record for the reloaded page (live R5-2).
    if (unloading) {
      group.timers.push(setTimeout(() => { unloading = false; fire(wave); }, UNLOAD_RETRY_MS));
      return;
    }
    // Never sooner after the waves before it than the plan has them apart (a page frozen for a few hundred ms by
    // core's fog extraction, HX1-06, fired every overdue wave in one tick: members meant to file through a door
    // 150-450 ms apart set off together, drawn on top of each other). A late wave shifts those after it by as much,
    // and the group's end with them.
    {
      const t = Date.now();
      const due = group.t0 + wave.at + group.shift;
      if (t < due - 50) {
        group.waiting += 1;
        group.timers.push(setTimeout(() => { group.waiting -= 1; fire(wave); }, due - t));
        return;
      }
      if (t - due > 50) { group.held += t - due; group.shift += t - due; }
    }
    // A member a relay stop took out of the group (groupCancel only) is not sent.
    const updates = wave.updates.filter(u => group.ids.has(u._id));
    if (!updates.length) { prunePending(gid, { at: wave.at }); return; }
    // A token outside the group now walking through this wave's way (another player's group dropped at the same
    // moment, HX1-02): the wave waits until it has passed, FOREIGN_MAX_MS at most.
    wave.heldMs ??= 0;
    let busy = false;
    try { busy = wave.heldMs < FOREIGN_MAX_MS && foreignInWay(scene, group, updates, wave.movement); } catch (err) { log?.debug?.("a wave: walkers in its way", err); }
    if (busy) {
      wave.heldMs += FOREIGN_WAIT_MS;
      group.held += FOREIGN_WAIT_MS;
      group.waiting += 1;
      group.timers.push(setTimeout(() => { group.waiting -= 1; fire(wave); }, FOREIGN_WAIT_MS));
      heldLast = { at: new Date().toISOString(), members: updates.length, ms: wave.heldMs };
      return;
    }
    send(scene, seq, starts, updates, { ...base, movement: wave.movement }, "wave", group.claims, group.avoid)
      .then(done => {
        if (done) prunePending(gid, { at: wave.at });
        // Stopped while this wave was on its way to the server (live H3-05: a click 950 ms after the drop on the
        // Mac, over the tunnel, let the wave's two members walk on into the far room): they stop as soon as they move.
        if (group.stopped) lateStop(scene, updates.map(u => u._id));
      });
  };
  for (const wave of later) group.timers.push(setTimeout(() => fire(wave), wave.at));
  return group;
}

/** How often a wave looks again for a token walking through its way, and for how long at most (ms; HX1-02). */
const FOREIGN_WAIT_MS = 250;
const FOREIGN_MAX_MS = 8000;

/**
 * Is a token outside group `group` (another player's, another of this client's groups) walking now where this
 * wave's members would walk (their planned ways from where they stand, with their timing)? Only on a canvas that
 * shows the drop's scene (the walkers are read from it). Reads only.
 */
function foreignInWay(scene, group, updates, movement) {
  if (!globalThis.canvas?.ready || globalThis.canvas.scene?.id !== scene?.id) return false;
  const own = [...group.ids].map(id => ({ id, token: scene.tokens?.get(id)?.object })).filter(m => m.token && !m.token.destroyed);
  if (!own.length) return false;
  const s = gridSize(own[0].token);
  const walkers = movingOthers(own, s);
  if (!walkers.length) return false;
  const mine = [];
  for (const u of updates) {
    const doc = scene.tokens?.get(u._id);
    const wps = movement?.[u._id]?.waypoints;
    if (!doc?.object || !wps?.length) continue;
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    mine.push({ points: [doc._source, ...wps].map(p => toSquares(p, w, h, s)), r: radiusOf(w, h), speed: speedOf(doc.object) });
  }
  return walkersMeet(mine, walkers, { combat: own.some(m => inCombat(m.token.document)) });
}

/** How often, and how many times, a member whose wave landed after its group was stopped is tried (ms). */
const LATE_STOP_EVERY_MS = 50;
const LATE_STOP_TRIES = 10;

/**
 * Members of a stopped group whose moves were already on their way to the server: stop each as a click
 * would (stop.mjs), as soon as this client sees it moving. A member that never moves is left alone.
 */
function lateStop(scene, ids, tries = LATE_STOP_TRIES) {
  if (!feature || !ids?.length) return;
  const left = [];
  for (const id of ids) {
    const doc = scene?.tokens?.get(id);
    if (!doc?.object || doc.object.destroyed) continue;
    const st = doc.movement?.state;
    const moving = st === "pending" || st === "paused" || (() => { try { return !!doc.object.animationContexts?.has?.(doc.object.movementAnimationName); } catch { return false; } })();
    if (!moving) { left.push(id); continue; }
    Promise.resolve().then(() => feature?.exposed?.stop?.(doc)).catch(err => log?.debug?.("stop a late wave", err));
  }
  if (left.length && tries > 0) setTimeout(() => lateStop(scene, left, tries - 1), LATE_STOP_EVERY_MS);
}

/** How often, and how many times, the rest check waits for a member still walking (ms). */
const DESTACK_EVERY_MS = 500;
/** How far round a stacked member the rest check looks for a free square (squares): a file of six in a 1-wide corridor needs 3 (H3-01). */
const DESTACK_REACH = 3;
const DESTACK_TRIES = 6;

/**
 * When a group this client sent is at rest: no member rests on top of another token (tokens are circles;
 * touching is fine). Whatever brought two together (a door shut mid-walk and core's own cut of a member
 * already on its way, live R5-1; a member moved by hand meanwhile), the later member steps to the nearest
 * whole cell around it that is clear of walls and of every other token and that it reaches in a straight
 * line: a walk out of combat, a displace in one (free: dnd5e records no movement for it). Only members this
 * client may move; nothing when none overlaps. Returns the moves made.
 */
function destack(ids, sceneOf, { roomy = false } = {}) {
  const moved = [];
  const claims = [];
  for (const id of ids) {
    const doc = sceneOf(id)?.tokens?.get(id);
    const token = doc?.object;
    if (!doc?._source || !token || !doc.isOwner) continue;
    const s = gridSize(token);
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const taken = takenFor(doc.parent, id, claims);
    const here = { x: doc._source.x, y: doc._source.y };
    const self0 = { x: here.x + (w * s) / 2, y: here.y + (h * s) / 2 };
    // `roomy` (a group clicked to a stop in a fight, HX1-03): one at rest in a one-wide corridor or a doorway steps
    // out to the nearest free square in the open within DESTACK_REACH, as a stop out of combat does (H4-09).
    const inGap = roomy && !roomyAt(token, self0, radiusOf(w, h), s);
    if (inGap) {
      const pick = gapExit(token, doc, here, taken, s, w, h);
      if (pick) {
        claims.push({ id, x: pick.x + (w * s) / 2, y: pick.y + (h * s) / 2, r: radiusOf(w, h) * s });
        moveAside(doc, pick, moved, id);
        continue;
      }
    }
    if (!taken(here)) {
      claims.push({ id, x: self0.x, y: self0.y, r: radiusOf(w, h) * s });
      continue;
    }
    // Only a token that overlaps one sent before it in this group, or one not in the group, moves: walk the
    // ids in order and let the first of a stacked pair stay.
    const earlier = ids.slice(0, ids.indexOf(id));
    const self = { x: here.x + (w * s) / 2, y: here.y + (h * s) / 2 };
    const r = radiusOf(w, h) * s;
    const blockers = [...(doc.parent?.tokens?.values?.() ?? [])].filter(o => o?._source && o.id !== id
      && (earlier.includes(o.id) || !ids.includes(o.id))
      && Math.hypot(o._source.x + ((o._source.width ?? 1) * s) / 2 - self.x, o._source.y + ((o._source.height ?? 1) * s) / 2 - self.y)
        < r + radiusOf(o._source.width ?? 1, o._source.height ?? 1) * s - 1e-6);
    if (!blockers.length && !claims.some(c => Math.hypot(c.x - self.x, c.y - self.y) < r + c.r - 1e-6)) continue;
    const bx = Math.round(here.x / s), by = Math.round(here.y / s);
    const cands = [];
    for (let dy = -DESTACK_REACH; dy <= DESTACK_REACH; dy++) for (let dx = -DESTACK_REACH; dx <= DESTACK_REACH; dx++) if (dx || dy) cands.push({ x: (bx + dx) * s, y: (by + dy) * s });
    cands.sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
    const member = { token, r: radiusOf(w, h) };
    const z = doc._source.elevation ?? 0;
    const pick = cands.find(c => {
      if (taken(c)) return false;
      if (!restWalkable(member, toSquares(c, w, h, s), s)) return false;
      try {
        return !token.checkCollision({ x: c.x + (w * s) / 2, y: c.y + (h * s) / 2, elevation: z },
          { origin: { ...self, elevation: z }, type: "move", mode: "any" });
      } catch { return false; }
    });
    if (!pick) continue;
    claims.push({ id, x: pick.x + (w * s) / 2, y: pick.y + (h * s) / 2, r });
    moveAside(doc, pick, moved, id);
  }
  if (moved.length) destacked = { at: new Date().toISOString(), members: moved.length };
  return moved;
}

/** A rest check's step aside: a walk out of combat, a displace in one (free: dnd5e records no movement for it). */
function moveAside(doc, pick, moved, id) {
  const z = doc._source.elevation ?? 0;
  const action = inCombat(doc) ? "displace" : (doc.movementAction ?? "walk");
  try {
    Promise.resolve(doc.move([{ x: pick.x, y: pick.y, elevation: z, action, snapped: true, explicit: true, checkpoint: true }], { method: "api" }))
      .catch(err => log?.debug?.("destack move", err));
    moved.push({ id, x: pick.x, y: pick.y });
  } catch (err) { log?.debug?.("destack move", err); }
}

/**
 * The nearest whole square within DESTACK_REACH of `here` (top-left) out of any gap narrower than two of the token,
 * free of every other token (`taken`), clear of walls and of door lines, reached from where it rests by a walk
 * (a short search round walls, open doors only) no longer than 2 x the reach. null when there is none.
 */
function gapExit(token, doc, here, taken, s, w, h) {
  const r = radiusOf(w, h);
  const self = { x: here.x + (w * s) / 2, y: here.y + (h * s) / 2 };
  const bx = Math.round(here.x / s), by = Math.round(here.y / s);
  const cands = [];
  for (let dy = -DESTACK_REACH; dy <= DESTACK_REACH; dy++) for (let dx = -DESTACK_REACH; dx <= DESTACK_REACH; dx++) if (dx || dy) cands.push({ x: (bx + dx) * s, y: (by + dy) * s });
  cands.sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
  const z = doc._source.elevation ?? 0;
  const fine = c => {
    if (taken(c)) return false;
    let spot = null;
    try { spot = clearOfWalls(token, c, { taken, snap: true }); } catch { spot = null; }
    return !!spot && spot.x === c.x && spot.y === c.y && roomyAt(token, { x: c.x + (w * s) / 2, y: c.y + (h * s) / 2 }, r, s);
  };
  const straight = c => {
    try { return !token.checkCollision({ x: c.x + (w * s) / 2, y: c.y + (h * s) / 2, elevation: z }, { origin: { ...self, elevation: z }, type: "move", mode: "any" }); } catch { return false; }
  };
  const ok = cands.filter(fine);
  // In a straight line first (out along the corridor), then the nearest a short walk reaches round a wall.
  const line = ok.find(straight);
  if (line) return line;
  for (const c of ok) {
    let rt = null;
    try {
      const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
      rt = feature.exposed.pathfindRouteTo?.(token, origin, { ...origin, x: c.x, y: c.y, snapped: true, explicit: true, checkpoint: true }, { maxMs: AROUND_MS });
    } catch { rt = null; }
    if (rt?.reached && rt.path?.length >= 2 && pathSquares(here, rt.path.slice(1), s) <= 2 * DESTACK_REACH) return c;
  }
  return null;
}

/** Is any of these tokens still walking (or animating) on this client? */
function anyWalking(ids, sceneOf) {
  return ids.some(id => {
    const doc = sceneOf(id)?.tokens?.get(id);
    if (!doc) return false;
    const st = doc.movement?.state;
    if (st && st !== "completed" && st !== "stopped") return true;
    try { return !!doc.object?.animationContexts?.has?.(doc.object.movementAnimationName); } catch { return false; }
  });
}

function settleGroup(ids, scene, tries = DESTACK_TRIES, opts = {}) {
  const sceneOf = () => scene;
  try {
    if (!feature) return;
    if (anyWalking(ids, sceneOf) && tries > 0) { setTimeout(() => settleGroup(ids, scene, tries - 1, opts), DESTACK_EVERY_MS); return; }
    destack(ids, sceneOf, opts);
  } catch (err) {
    log?.warnOnce?.("group-destack", "a group's rest check failed (further errors suppressed)", err);
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
 * The members of the group a token moves with (decision 3): `held` when this client sent the group (its live
 * members, the token included), else the tokens every client saw tagged with the same group in the last
 * TAG_TTL_MS. `{ held: false, ids: [] }` when it is in no group.
 */
/** A click (or the API) stopped a group, or members of one (stop.mjs): recorded for status().group.stopped (H3-16). */
function groupNoteStop({ why = "click", members = 0, whole = false } = {}) {
  stoppedAt = { at: new Date().toISOString(), why, members, whole };
}

/**
 * A group stopped in a fight (stop.mjs): each member finishes the square it is in, and two that walked
 * close together can finish on the same square (live H3-01: 3 of 4 corridor clicks left two on one square).
 * Once they are all at rest, the later of a stacked pair steps to the nearest free whole square (a displace:
 * free, dnd5e records nothing for it), as the rest check does.
 */
function groupSettle(ids, scene, { roomy = false } = {}) {
  if (!ids?.length || !scene) return;
  settleGroup(ids, scene, DESTACK_TRIES, { roomy });
}

function groupMembers(tokenId) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (g) return { held: true, ids: [...g.ids] };
  const tag = tagOf.get(tokenId);
  if (!tag || Date.now() - tag.at > TAG_TTL_MS) return { held: false, ids: [] };
  const ids = [];
  for (const [id, t] of tagOf) if (t.gid === tag.gid && Date.now() - t.at <= TAG_TTL_MS) ids.push(id);
  return { held: false, ids };
}

/** updateToken, every client: remember which group a move belongs to (its update option). */
function onGroupTag(doc, options) {
  const gid = options?.[GROUP_OPT];
  if (!doc?.id || typeof gid !== "string") return;
  tagOf.set(doc.id, { gid, at: Date.now() });
  if (tagOf.size > 500) tagOf.delete(tagOf.keys().next().value);
}

/**
 * updateToken, the client that sent a group: another user stopped one of its members (a player's own token in
 * the GM's group, decision 3: an unanimated position write by someone else). It leaves the group, and the
 * others walk round where it now rests (groupStopOne), as they would for a stop on this client.
 */
function onForeignStop(doc, changes, options, userId) {
  if (!doc?.id || !groupOf.has(doc.id) || options?.animate !== false) return;
  if (!changes || !("x" in changes || "y" in changes) || !userId || userId === game.user?.id) return;
  // A stop whose square is walked to after the displace (HX1-07) names that square: the others keep round it, not
  // round where the displace put it (the GM's members walked through the player's stopped Hero 4, -77 to -87 px).
  const at = options?.[STOP_AT];
  const spot = Number.isFinite(at?.x) && Number.isFinite(at?.y) ? { x: at.x, y: at.y } : { x: doc._source.x, y: doc._source.y };
  // That user stops every member of the group it owns (decision 3): those are its to stop, not this client's to walk
  // round (HX1-01 (c): this client re-routed the player's Hero 3 while the player stopped it, the two writes raced and
  // Hero 3 was left drawn off its square). Their unsent waves go too.
  try {
    const g = groups.get(groupOf.get(doc.id));
    const u = globalThis.game?.users?.get?.(userId);
    if (g && u && !u.isGM) {
      for (const id of [...g.ids]) {
        const d2 = g.scene?.tokens?.get(id);
        let theirs = false;
        try { theirs = !!d2?.testUserPermission?.(u, "OWNER"); } catch { theirs = false; }
        if (!theirs || id === doc.id) continue;
        g.ids.delete(id); prunePending(groupOf.get(id), { id });
        const ow = g.walkOn?.get(id);
        if (ow) { ow.cancelled = true; g.walkOn.delete(id); }
      }
    }
  } catch (err) { log?.debug?.("a member stopped elsewhere: its user's other members", err); }
  try { groupStopOne(doc.id, spot); } catch (err) { log?.debug?.("a member stopped elsewhere", err); }
}

/** Smallest distance between segments p1-p2 and q1-q2 (sampled: exact enough for a few squares). */
function segSegDist(p1, p2, q1, q2) {
  let best = Infinity;
  for (let k = 0; k <= 8; k++) {
    const t = k / 8;
    best = Math.min(best, segDist({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t }, q1, q2),
      segDist({ x: q1.x + (q2.x - q1.x) * t, y: q1.y + (q2.y - q1.y) * t }, p1, p2));
  }
  return best;
}

/** Distance from point c to segment a-b. */
function segDist(c, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 ? Math.min(Math.max(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.y - (a.y + (b.y - a.y) * t));
}

/**
 * Where a route (`route.from` + waypoints, top-left) first comes within `reach` of circle `c` (centres):
 * `{ x, y, k }`, the top-left a little before that point and the index of the waypoint it is on the way
 * to; null when it never does.
 */
function shortOf(route, c, reach, w, h, s) {
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  let a = centre(route.from);
  for (let k = 0; k < route.waypoints.length; k++) {
    const b = centre(route.waypoints[k]);
    if (segDist(c, a, b) < reach) {
      // Solve |a + t (b - a) - c| = reach for the first t in [0, 1].
      const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y;
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - reach * reach;
      const disc = B * B - 4 * A * C;
      let t = A > 0 && disc >= 0 ? (-B - Math.sqrt(disc)) / (2 * A) : 0;
      t = Math.min(Math.max(t, 0), 1);
      const L = Math.sqrt(A) || 1;
      t = Math.max(t - 2 / L, 0);
      if (t <= 0 && k === 0) return { x: route.from.x, y: route.from.y, k: 0 };
      return { x: Math.round(a.x + dx * t - (w * s) / 2), y: Math.round(a.y + dy * t - (h * s) / 2), k };
    }
    a = b;
  }
  return null;
}

/** One route call when walking round a stopped member (ms): short, the token is already walking. */
const AROUND_MS = 60;

/** Length of a top-left path from `from` (squares). */
function pathSquares(from, wps, s) {
  let L = 0, prev = from;
  for (const p of wps) { L += Math.hypot(p.x - prev.x, p.y - prev.y) / s; prev = p; }
  return L;
}

/**
 * Is a way round a stopped member a detour nobody wants (live H2-02: a member stopped in a one-wide corridor
 * sent the others round the whole dungeon, 35 s)? Longer than the way left by DETOUR_SQUARES or half of it.
 */
function tooLong(from, aheadWps, roundWps, s) {
  return detourTooLong(pathSquares(from, aheadWps, s), pathSquares(from, roundWps, s));
}

/** Room round centre `c` (pixels) for a circle of radius r squares: not in a gap narrower than two of it. */
function roomyAt(token, c, r, s) {
  const p = { x: c.x / s, y: c.y / s };
  try {
    return !narrowPoints(token, [p, { x: p.x + 0.01, y: p.y }], r, s).length && !narrowPoints(token, [p, { x: p.x, y: p.y + 0.01 }], r, s).length;
  } catch { return true; }
}

/**
 * With no way round a member stopped ahead (circle `c`, pixels; `reach` the centre distance to keep), where a
 * member walking `route` (from + top-left waypoints) rests instead (live H2-02: members were left in the
 * one-wide corridor behind it, and walked through it): short of it on its way, on open floor (not in a gap,
 * where it would block whoever comes after), clear of walls and of `taken`. Along its way back from the stop
 * point first; if it is already in the gap, the nearest open spot it can walk back to. Returns top-left
 * waypoints (empty: stay where it is drawn).
 */
function restShortOf(token, route, c, reach, taken, s) {
  const doc = token.document;
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h);
  const member = { token, r };
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const fine = p => {
    const q = centre(p);
    return Math.hypot(q.x - c.x, q.y - c.y) >= reach && !taken?.(p) && restWalkable(member, toSquares(p, w, h, s), s) && roomyAt(token, q, r, s);
  };
  const keep = (k, p) => [...route.waypoints.slice(0, k).map(q => ({ ...q, checkpoint: false })),
    { ...(route.waypoints[k] ?? route.waypoints.at(-1)), x: Math.round(p.x), y: Math.round(p.y), snapped: false, explicit: true, checkpoint: true }];
  const short = shortOf(route, c, reach, w, h, s);
  // Back along the way ahead, from the stop point to where it is drawn, every quarter square.
  const pts = [route.from, ...route.waypoints];
  const kStop = short?.k ?? 0;
  const stopAt = short ?? route.from;
  const seq = [];
  let prev = stopAt;
  for (let k = kStop; k >= 0; k--) {
    const a = pts[k];
    const L = Math.hypot(prev.x - a.x, prev.y - a.y);
    const n = Math.max(1, Math.ceil(L / (s / 4)));
    for (let i = 0; i <= n; i++) seq.push({ k, p: { x: prev.x + (a.x - prev.x) * (i / n), y: prev.y + (a.y - prev.y) * (i / n) } });
    prev = a;
  }
  for (const { k, p } of seq) {
    if (!fine(p)) continue;
    if (Math.hypot(p.x - route.from.x, p.y - route.from.y) < 1) return [];
    return keep(k, p);
  }
  // Already in the gap: the nearest open spot round where it is drawn that it can walk to without passing the stopped one.
  const here = toSquares(route.from, w, h, s);
  const hereC = centre(route.from);
  const away = q => { const k = centre(q); return Math.hypot(k.x - c.x, k.y - c.y) > Math.hypot(hereC.x - c.x, hereC.y - c.y); };
  const cands = hexCandidates(here, 0.5, 8).map(q => toTopLeft(q, w, h, s)).filter(q => away(q) && fine(q))
    .sort((a, b) => Math.hypot(a.x - route.from.x, a.y - route.from.y) - Math.hypot(b.x - route.from.x, b.y - route.from.y));
  const origin = { ...(feature.exposed.pathfindOrigin?.(doc) ?? doc._source), x: route.from.x, y: route.from.y };
  for (const q of cands.slice(0, 3)) {
    let r2 = null;
    try {
      r2 = feature.exposed.pathfindRouteTo?.(token, origin, { ...origin, x: q.x, y: q.y, snapped: false, explicit: true, checkpoint: true },
        { avoid: [{ x: c.x, y: c.y, r: reach }], maxMs: AROUND_MS });
    } catch (err) { log?.debug?.("stop one: a way back", err); r2 = null; }
    if (!r2?.reached || !(r2.path?.length >= 2)) continue;
    if (pathSquares(route.from, r2.path.slice(1), s) > 3 * Math.hypot(q.x - route.from.x, q.y - route.from.y) / s + 2) continue;
    return r2.path.slice(1).map((p, k, all) => ({ ...p, checkpoint: k === all.length - 1, explicit: k === all.length - 1 ? true : p.explicit }));
  }
  // Nowhere open nearby: short of it on its way, as clear as it can be.
  let spot = stopAt;
  try { spot = clearOfWalls(token, stopAt, { taken }); } catch (err) { log?.debug?.("stop one: a clear spot", err); }
  if (Math.hypot(spot.x - route.from.x, spot.y - route.from.y) < 1) return [];
  return keep(kStop, spot);
}

/**
 * A click stopped one member of a group this client sent (live H1-05: the whole group froze mid-room,
 * off the grid; Joe: only the clicked one stops). Only that member leaves the group (its unsent wave
 * dropped); `spot` (top-left) is where it now rests. Out of combat each other member still walking whose
 * route ahead passes through it is stopped where it is drawn and walks on round it to its own spot (an
 * unanimated displace, then the new route, as a door cut does); with no way round it carries on and the
 * rest check moves it off at the end. Its later waves plan round it too. In a fight the others carry on.
 * Returns the ids re-routed.
 */
function groupStopOne(tokenId, spot = null) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  g.ids.delete(tokenId); groupOf.delete(tokenId); prunePending(gid, { id: tokenId });
  // A walk round an earlier stop this client had on its way for it is called off: it is stopped now.
  const mine = g.walkOn?.get(tokenId);
  if (mine) { mine.cancelled = true; g.walkOn.delete(tokenId); }
  g.pinned.add(tokenId);
  const doc = g.scene?.tokens?.get(tokenId);
  const scene = doc?.parent ?? g.scene;
  if (!doc || !scene || !spot || inCombat(doc)) return [];
  const s = doc.object ? gridSize(doc.object) : (scene.grid?.size ?? 100);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const c = { x: spot.x + (w * s) / 2, y: spot.y + (h * s) / 2, r: radiusOf(w, h) * s };
  g.avoid.push(c);
  const out = [];
  for (const id of g.ids) {
    const d = scene.tokens?.get(id);
    const token = d?.object;
    const m = d?.movement;
    // One stopped where it is drawn a moment ago for a walk round an earlier stop, its walk not sent yet (HX1-01 (c):
    // a player's four stops came 40-80 ms apart, and the walk round the first went through the fourth): its walk
    // to come is checked against this stop too.
    const onWay = g.walkOn?.get(id);
    if (!onWay && (!token || token.destroyed || !m?.user?.isSelf || m.constrainOptions?.ignoreWalls)) continue;
    if (!onWay && !movementFacts(token).animating && m.state !== "pending") continue;
    if (!token || token.destroyed) continue;
    const route = onWay ? { from: onWay.from, waypoints: onWay.wps } : routeLeft(token, false);
    if (!route?.waypoints?.length) continue;
    const dw = d._source.width ?? 1, dh = d._source.height ?? 1;
    const centre = p => ({ x: p.x + (dw * s) / 2, y: p.y + (dh * s) / 2 });
    const rm = radiusOf(dw, dh) * s;
    const reach = c.r + rm - 1;
    // Round every member stopped so far, not only this one (HX1-01 (c): a player stopped four of the GM's six one
    // after another; each re-route kept round the last one only, and Hero 5 walked through the stopped Hero 4, -99 px).
    // Not one it already overlaps where it is drawn (it walks on off it; the rest check sets them apart).
    const from0 = centre(route.from);
    const rounds = g.avoid.map(a => ({ x: a.x, y: a.y, r: a.r + rm - 1 })).filter(a => Math.hypot(from0.x - a.x, from0.y - a.y) >= a.r);
    let prev = from0, hit = false;
    for (const q of route.waypoints.map(centre)) { if (segDist(c, prev, q) < reach) { hit = true; break; } prev = q; }
    if (!hit) continue;
    const dest = route.waypoints.at(-1);
    let r = null;
    try {
      const origin = { ...(feature.exposed.pathfindOrigin?.(d) ?? d._source), x: route.from.x, y: route.from.y };
      r = feature.exposed.pathfindRouteTo?.(token, origin, { ...origin, ...dest, explicit: true, checkpoint: true },
        { avoid: rounds.length ? rounds : [{ x: c.x, y: c.y, r: reach }], maxMs: AROUND_MS });
    } catch (err) { log?.debug?.("stop one: a route round it", err); r = null; }
    let wps;
    const round = r?.reached && r.path?.length >= 2 ? r.path.slice(1) : null;
    if (round && !tooLong(route.from, route.waypoints, round, s)) {
      wps = round.map((p, k, all) => ({ ...p, checkpoint: k === all.length - 1, explicit: k === all.length - 1 ? true : p.explicit }));
    } else {
      // No way round (a one-wide corridor), or only the long way (H2-02): it stops short of the stopped one, on
      // open floor nobody else takes (it walked through it before, live H1-05 harness: -73 px; it was left in
      // the corridor, H2-02), and the next one behind stops short of it.
      wps = [];
      try { wps = restShortOf(token, route, c, reach, takenFor(scene, id, g.claims), s); } catch (err) { log?.debug?.("stop one: rest short", err); }
      const spot = wps.at(-1) ?? route.from;
      const sc = { id, x: spot.x + (dw * s) / 2, y: spot.y + (dh * s) / 2, r: radiusOf(dw, dh) * s };
      g.claims.push(sc);
      g.avoid.push({ x: sc.x, y: sc.y, r: sc.r });
    }
    out.push(id);
    if (onWay) { onWay.wps = wps; continue; }       // its displace is on its way: the walk that follows is the new one
    const entry = { from: route.from, wps };
    (g.walkOn ??= new Map()).set(id, entry);
    try { stopWhereDrawn(token, route.from); } catch (err) { log?.debug?.("stop one: stopAnimation", err); }
    pinDrawn(token, route.from, route.from);
    const z = d._source.elevation ?? 0;
    Promise.resolve(d.move([{ x: route.from.x, y: route.from.y, elevation: z, action: "displace", snapped: false, explicit: true, checkpoint: true }], { method: "api", animate: false }))
      .then(moved => {
        unpin(token);
        if (g.walkOn?.get(id) === entry) g.walkOn.delete(id);
        return moved === false || entry.cancelled || !feature || token.destroyed || !entry.wps.length ? null : d.move(entry.wps, { method: "api" });
      })
      .catch(err => { unpin(token); if (g.walkOn?.get(id) === entry) g.walkOn.delete(id); log?.debug?.("stop one: walk round", err); });
  }
  return out;
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
    try { stopSafely(d); } catch (err) { log?.debug?.("stop a member at a turn change", err); }
  }
  if (ids.length) {
    stoppedAt = { at: new Date().toISOString(), why: "turnChange", members: ids.length };
  }
}

/* -------------------------------------------- */
/*  A wall raised mid-walk (live R6-3, R6-1)    */
/* -------------------------------------------- */

const DOOR_OPEN = 1;
/** How long a combat cut waits for its stopped token to finish its square before it walks on (ms). */
const CUT_WAIT_MS = 3000;
const CUT_POLL_MS = 50;

/** stop.mjs's stopSafely when it is installed (never a stopMovement racing an in-flight segment, live R7-2), else core's. */
function stopSafely(doc, after = null) {
  const fn = feature?.exposed?.stopSafely;
  if (typeof fn === "function") return fn(doc, after);
  let ok = false;
  try { ok = doc.stopMovement() === true; } catch (err) { log?.debug?.("stopMovement", err); }
  try { after?.(ok); } catch (err) { log?.debug?.("after a stop", err); }
  return Promise.resolve(ok);
}

/** Does this wall block movement as it stands now? */
function blocksMove(wall) {
  const w = wall?._source ?? wall;
  if (!w || !(Number(w.move) > 0)) return false;
  return !(Number(w.door) > 0 && Number(w.ds) === DOOR_OPEN);
}

/**
 * The route a moving token still has to walk, as core holds it: out of combat the whole path is one
 * update (the document is already at its end, the tween walks `passed`), so the route starts where the
 * token is drawn; in a fight (a checkpoint at every square) it starts at the square it is entering (its
 * source), the rest is `pending`. null when nothing is left. Top-left pixels with width / height.
 */
function routeLeft(token, combat) {
  const doc = token.document;
  const m = doc.movement;
  const src = doc._source;
  const clean = w => ({ x: w.x, y: w.y, elevation: w.elevation ?? src.elevation ?? 0, width: w.width ?? src.width, height: w.height ?? src.height,
    level: w.level ?? src.level, action: w.action ?? doc.movementAction ?? "walk", snapped: !!w.snapped, explicit: true, checkpoint: !!w.checkpoint });
  if (combat) {
    const pending = (m?.pending?.waypoints ?? []).filter(w => !w.intermediate);
    if (!pending.length) return null;
    return { from: { x: src.x, y: src.y, elevation: src.elevation ?? 0 }, waypoints: pending.map(clean) };
  }
  const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])].filter(w => Number.isFinite(w?.x) && Number.isFinite(w?.y));
  const at = drawnPosition(token);
  const k = routeAhead(all, at);
  if (k === null) return null;
  const waypoints = all.slice(k).map(clean);
  if (waypoints.length) waypoints[waypoints.length - 1].checkpoint = true;
  return { from: at, waypoints };
}

/**
 * Where tokens rest or are going, for a cut (top-left `p` → taken?): every other token's source and, for one
 * still walking with waypoints to go, where core will stop it (as takenFor), but never the movers being cut
 * (their source is where they were going, core's stop for them is the stack this avoids): `claims`, the
 * squares the movers before this one took, stand in for them.
 */
function takenForCut(scene, id, movers, claims) {
  const doc = scene?.tokens?.get(id);
  const s = doc?.object ? gridSize(doc.object) : (scene?.grid?.size ?? 100);
  const src = doc?._source ?? {};
  const w = src.width ?? 1, h = src.height ?? 1, r = radiusOf(w, h) * s;
  const circles = [];
  for (const o of scene?.tokens?.values?.() ?? []) {
    if (!o?._source || o.id === id || movers.has(o.id)) continue;
    if (o.hidden && !game.user?.isGM) continue;
    if (src.level !== undefined && o._source.level !== undefined && o._source.level !== src.level) continue;
    const ow = o._source.width ?? 1, oh = o._source.height ?? 1;
    const or = radiusOf(ow, oh) * s;
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r: or });
    const stop = predictedStop(o);
    if (stop) circles.push({ x: stop.x + (ow * s) / 2, y: stop.y + (oh * s) / 2, r: or });
  }
  for (const c of claims) if (c.id !== id) circles.push(c);
  return p => {
    const cx = p.x + (w * s) / 2, cy = p.y + (h * s) / 2;
    return circles.some(c => Math.hypot(cx - c.x, cy - c.y) < r + c.r - 1e-6);
  };
}

/**
 * In a fight: once the stopped token has finished its square, walk on to the cut square (a move, costed).
 * With no cut square (`waypoints` empty) and `taken` given: when the square core stopped it on is another
 * token's, it steps to the nearest free clear whole square (costed), at once rather than by the rest check
 * 4 s later (live H1-07: two members on one square for 3.4-4.1 s, then one jumped aside).
 */
function walkOnAfterStop(doc, waypoints, left = Math.ceil(CUT_WAIT_MS / CUT_POLL_MS), taken = null) {
  const token = doc.object;
  if (!feature || !token || token.destroyed) return;
  const st = doc.movement?.state;
  if ((movementFacts(token).animating || st === "pending" || continuationInFlight(doc)) && left > 0) {
    setTimeout(() => walkOnAfterStop(doc, waypoints, left - 1, taken), CUT_POLL_MS);
    return;
  }
  if (!waypoints?.length) {
    const src = doc._source;
    const here = { x: src.x, y: src.y, elevation: src.elevation ?? 0 };
    if (!taken?.(here)) return;
    let spot = here;
    try { spot = clearOfWalls(token, here, { taken }); } catch (err) { log?.debug?.("cut: a free square", err); }
    if (spot.x === here.x && spot.y === here.y) return;
    waypoints = [{ x: spot.x, y: spot.y, elevation: here.elevation, width: src.width ?? 1, height: src.height ?? 1, level: src.level,
      action: doc.movementAction ?? "walk", snapped: true, explicit: true, checkpoint: true }];
  }
  try {
    Promise.resolve(doc.move(waypoints, { method: "api" })).catch(err => log?.debug?.("cut: walk on", err));
  } catch (err) { log?.debug?.("cut: walk on", err); }
}

/**
 * createWall / updateWall, every client: a wall that now blocks movement across the route of a move this
 * client started cuts that move on a whole square before it, one free square per token (live R6-3: out of
 * combat the whole path is one update, so a door shut or a wall raised after the drop was walked straight
 * through; R6-1: in a fight core cut every member walking to the door on the same last square, and the rest
 * check split them with one-square jumps 4 s later). Out of combat the token walks on from where it is drawn
 * to its square (one update: a displace to where it is drawn, then the route); in a fight it stops at its
 * next square (stopMovement) and walks on from there, costed. The nearest to the wall chooses first. A token
 * with no free square on its way stops where it stands. Ghost, unconstrained and wall-less actions pass.
 * Returns the cuts made.
 */
function cutAcross(wall) {
  const scene = wall?.parent;
  const c = wall?._source?.c ?? wall?.c;
  if (!feature || !scene?.tokens || !Array.isArray(c) || c.length < 4 || !blocksMove(wall)) return [];
  const a = { x: c[0], y: c[1] }, b = { x: c[2], y: c[3] };
  const movers = [];
  for (const doc of scene.tokens.values?.() ?? []) {
    const token = doc?.object;
    const m = doc?.movement;
    if (!token || token.destroyed || !m?.user?.isSelf || !doc.isOwner) continue;
    if (m.constrainOptions?.ignoreWalls) continue;
    const facts = movementFacts(token);
    if (!facts.animating && m.state !== "pending" && m.state !== "paused") continue;
    const combat = inCombat(doc);
    const route = routeLeft(token, combat);
    if (!route) continue;
    const s = gridSize(token);
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
    const legs = route.waypoints.filter(p => (CONFIG.Token?.movement?.actions?.[p.action]?.walls ?? "move") !== null);
    const k = firstLegAcross(centre(route.from), legs.map(centre), a, b);
    // In a fight the route starts at the square it is entering (its source): one drawn short of the wall with that
    // square past it is crossing it now (HX1-04: in the doorway when the door shut, it finished its square and then
    // walked on into room B, 8 squares). It finishes that square (its cost is spent) and goes no further.
    if (k < 0 && combat) {
      let crossing = false;
      try { crossing = firstLegAcross(centre(drawnPosition(token)), [centre(route.from)], a, b) >= 0; } catch { crossing = false; }
      if (crossing) movers.push({ doc, token, combat, route, along: 0, w, h, s, entering: true });
      continue;
    }
    if (k < 0) continue;
    // How far along it is to the wall: the nearer chooses its square first.
    let along = 0, prev = centre(route.from);
    for (let i = 0; i <= k; i++) { const q = centre(legs[i]); along += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
    movers.push({ doc, token, combat, route, along, w, h, s });
  }
  if (!movers.length) return [];
  movers.sort((x, y) => x.along - y.along);
  const ids = new Set(movers.map(m => m.doc.id));
  const claims = [];
  const out = [];
  for (const mv of movers) {
    const { doc, token, combat, route, w, h, s } = mv;
    let kept = [];
    const taken = takenForCut(scene, doc.id, ids, claims);
    // Its last leg keeps off the squares the members cut before it took (HX1-08: one walked past another already
    // resting on its square by the door, -22 px).
    const rMe0 = radiusOf(w, h) * s;
    const legClear = (a, b) => {
      const p = { x: a.x + (w * s) / 2, y: a.y + (h * s) / 2 }, q = { x: b.x + (w * s) / 2, y: b.y + (h * s) / 2 };
      return claims.every(c => c.id === doc.id || segDist(c, p, q) >= c.r + rMe0 - 15);
    };
    if (!mv.entering) {
      try { ({ waypoints: kept } = cutAtWalls(token, route.from, route.waypoints, { taken, clear: legClear })); }
      catch (err) { log?.debug?.("cut: the square before the wall", err); kept = []; }
    }
    // No square on its way (already in the doorway): out of combat it rests on the nearest clear spot no
    // other token takes, walked to from where it is drawn (live H1-07 / H1-09: it was put on the square a
    // member behind it had just stopped on, and the rest check split them seconds later).
    // Back on the square it is drawn in counts the same (HX1-08: it rested where it was drawn, off the grid at
    // (8.7, 3.67)): a whole square, as every other cut member (plan H8.1).
    if (!kept.length && !combat) {
      let spot = route.from;
      // A square whose walk keeps clear of the other cut members' walks (HX1-08: two walking to their squares
      // crossed, -23 px): theirs from where they are drawn to their squares (or where they are, not chosen yet).
      const me = { x: route.from.x + (w * s) / 2, y: route.from.y + (h * s) / 2 };
      const rMe = radiusOf(w, h) * s;
      const ways = movers.filter(o => o !== mv).map(o => {
        const a = { x: o.route.from.x + (o.w * s) / 2, y: o.route.from.y + (o.h * s) / 2 };
        const c = claims.find(q => q.id === o.doc.id);
        return { a, b: c ? { x: c.x, y: c.y } : a, r: radiusOf(o.w, o.h) * s };
      });
      const apart = q => {
        const b = { x: q.x + (w * s) / 2, y: q.y + (h * s) / 2 };
        return ways.every(o => segSegDist(me, b, o.a, o.b) >= rMe + o.r - 15);
      };
      try { spot = clearOfWalls(token, route.from, { taken, snap: true, prefer: apart }); } catch (err) { log?.debug?.("cut: a clear spot", err); }
      if (spot.x !== route.from.x || spot.y !== route.from.y) {
        kept = [{ x: spot.x, y: spot.y, elevation: doc._source.elevation ?? 0, width: w, height: h, level: doc._source.level,
          action: doc.movementAction ?? "walk", snapped: true, explicit: true, checkpoint: true }];
      }
    }
    const end = kept.at(-1) ?? route.from;
    claims.push({ id: doc.id, x: end.x + (w * s) / 2, y: end.y + (h * s) / 2, r: radiusOf(w, h) * s });
    try {
      if (combat) {
        // Never while its next square is on the way to the server (live R7-2); walk on once stopped.
        // No square on its way: once stopped, off any square another token holds (H1-07).
        stopSafely(doc, () => walkOnAfterStop(doc, kept, undefined, kept.length ? null : p => takenForCut(scene, doc.id, ids, claims)(p)));
      } else {
        // Two writes (live R7-1): core chains an animated movement after the one being drawn, so a single
        // "displace here, then walk" update was drawn only after the old walk had reached its end, through
        // the shut door, and every client then jumped back 1100-1775 px. An unanimated displace stops the
        // tween on every client where it is drawn now (this one first, before the write); the walk to the
        // square before the wall follows once the server has it.
        const z = doc._source.elevation ?? 0;
        const here = route.from;
        const disp = [{ x: here.x, y: here.y, elevation: z, action: "displace", snapped: false, explicit: true, checkpoint: true }];
        try { stopWhereDrawn(token, route.from); } catch (err) { log?.debug?.("cut: stopAnimation", err); }
        pinDrawn(token, route.from, route.from);
        Promise.resolve(doc.move(disp, { method: "api", animate: false }))
          .then(moved => {
            unpin(token);
            if (moved === false) { try { if (!token.destroyed) token.stopAnimation?.(); } catch (err) { log?.debug?.("cut: reset", err); } return null; }
            if (!kept.length || !feature || token.destroyed) return null;
            return doc.move(kept, { method: "api" });
          })
          .catch(err => { unpin(token); log?.debug?.("cut: move", err); });
      }
      out.push({ id: doc.id, x: end.x, y: end.y, combat });
    } catch (err) { log?.debug?.("cut", err); }
  }
  // This client's unsent waves plan round the squares just taken too.
  for (const g of groups.values()) g.claims.push(...claims);
  if (out.length) cutLast = { at: new Date().toISOString(), why: "wall", wall: wall.id ?? null, members: out.length };
  return out;
}

function onWallChange(wall, changes) {
  if (changes && !["ds", "door", "move", "c", "dir"].some(k => k in changes)) return;
  try { cutAcross(wall); }
  catch (err) { log?.warnOnce?.("group-cut", "a wall raised mid-walk could not cut the moves crossing it (further errors suppressed)", err); }
}

/* -------------------------------------------- */
/*  The drop                                    */
/* -------------------------------------------- */

function debugThrow() {
  if (globalThis.CONFIG?.debug?.[`${MODULE}.throw`]) throw new Error("debug: forced planner throw");
}

/**
 * A fast flick (live H2-08): core's drag handler takes at most one pointer move per frame, so when the last
 * moves of a quick drag land inside one frame the drag's destination stays where an earlier move left it
 * (in the rock between two rooms, for a flick from room A to room B) and the drop is planned there:
 * "no way there", nobody moves. A group drop whose pointer-up is elsewhere takes the pointer-up's point,
 * as core's next move would have set it (same delta for every member, snapped as the drag snaps). Their
 * found paths still end at the old point; the plan searches its own routes. Returns true when it moved them.
 */
function catchUpDestination(grabbed, event, contexts) {
  if (!contexts.length || contexts.some(c => c.waypoints?.length) || grabbed.layer?._movementPlanningContext) return false;
  // A single drop too (live H3-13: released soon after the last move it landed 1-3 squares short), when the
  // drop's own route search (noteNoRoute) takes it to the new point: out of combat, pathfinding on, no ghost.
  if (contexts.length === 1) {
    const doc = grabbed.document;
    if (contexts[0].token !== grabbed || inCombat(doc) || feature.exposed.pathfindSkip?.(grabbed)) return false;
    try { if (grabbed._getDragConstrainOptions?.()?.ignoreWalls) return false; } catch { return false; }
  }
  // The pointer-up's point (core's pointer-up handler writes it to interactionData.destination; the contexts keep
  // what the last move they saw gave them).
  let p = event?.interactionData?.destination ?? null;
  if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) {
    try { p = event?.getLocalPosition?.(grabbed.layer) ?? null; } catch { p = null; }
  }
  if (!Number.isFinite(p?.x) || !Number.isFinite(p?.y)) return false;
  const origin = grabbed._getDragOrigin?.();
  if (!origin || typeof grabbed._getDragWaypointPosition !== "function") return false;
  const snap = !event.shiftKey && !globalThis.canvas?.grid?.isGridless;
  const dx = p.x - origin.x, dy = p.y - origin.y;
  const next = [];
  for (const c of contexts) {
    const { x, y } = c.token.document._source;
    const dest = c.token._getDragWaypointPosition(c.destination, { x: x + dx, y: y + dy }, { snap });
    if (!Number.isFinite(dest?.x) || !Number.isFinite(dest?.y)) return false;
    next.push([c, { ...dest, action: undefined, snapped: snap, explicit: true, checkpoint: true }]);
  }
  // Nothing to catch up: the grabbed one's destination is where the pointer came up.
  const mine = next.find(([c]) => c.token === grabbed)?.[1];
  const had = contexts.find(c => c.token === grabbed)?.destination;
  if (!mine || (had && Math.round(had.x) === Math.round(mine.x) && Math.round(had.y) === Math.round(mine.y))) return false;
  for (const [c, dest] of next) c.destination = dest;
  return true;
}

/** Does no member of this drop go anywhere (every waypoint is where it stands)? */
function droppedInPlace(contexts, [updates, options], caughtUp = false) {
  if (caughtUp) return contexts.every(c => c.destination?.x === c.token.document._source.x && c.destination?.y === c.token.document._source.y);
  return contexts.every(c => {
    const doc = c.token.document;
    const wps = options.movement?.[doc.id]?.waypoints ?? [];
    return wps.every(w => w.x === doc._source.x && w.y === doc._source.y && (w.elevation ?? doc._source.elevation) === doc._source.elevation);
  }) || !updates.length;
}

/**
 * Feedback on a drop with no way to where it was dropped (live H1-12; Joe's decision 7, 2026-11-22: nobody
 * moves, and a short warning to the dragger only). A big token with no way it fits through (decision 8) stops
 * before the gap instead, and the GM is told.
 */
const NO_ROUTE = "PENTARYN_MOVEMENT.notify.noRoute";
const NO_ROUTE_GROUP = "PENTARYN_MOVEMENT.notify.noRouteGroup";
const TOO_NARROW = "PENTARYN_MOVEMENT.notify.tooNarrow";
function tellNoRoute(key, data = null) {
  try {
    const n = globalThis.ui?.notifications;
    if (data) n?.warn?.(game.i18n?.format?.(key, data) ?? key);
    else n?.warn?.(key, { localize: true });
  } catch (err) { log?.debug?.("no-route notice", err); }
}

/** A big token stopped before a gap it does not fit: the GM hears of it, also when a player dragged it (a whisper). */
function tellNarrow(token) {
  const name = token?.document?.name ?? "";
  tellNoRoute(TOO_NARROW, { name });
  if (game.user?.isGM) return;
  try {
    const gms = (game.users?.filter?.(u => u.isGM && u.active) ?? []).map(u => u.id);
    if (!gms.length) return;
    globalThis.ChatMessage?.create?.({ content: `<p>${foundry.utils.escapeHTML?.(game.i18n.format(TOO_NARROW, { name })) ?? name}</p>`, whisper: gms,
      speaker: { alias: "Pentaryn Movement" } });
  } catch (err) { log?.debug?.("narrow: tell the GM", err); }
}

/**
 * Group drop: each big member the plan left to core (no route its body fits) that core stops short of its
 * spot gets the "does not fit" notice, as a single drag does (decision 8; live H3-09: no notice in the group case).
 */
function tellExcludedNarrow(members, excluded, result) {
  for (const id of excluded ?? []) {
    const m = members.find(x => x.id === id);
    if (!m?.token || (m.w ?? 1) <= 1 && (m.h ?? 1) <= 1) continue;
    const end = result?.[1]?.movement?.[id]?.waypoints?.at(-1) ?? m.token.document._source;
    if (Math.round(end.x) === Math.round(m.dest?.x) && Math.round(end.y) === Math.round(m.dest?.y)) continue;
    tellNarrow(m.token);
  }
}

/** One route call that checks a drop the drag's own path fell short of (ms). */
const CONFIRM_MS = 250;

/**
 * A single drop out of combat, when its path (as the drag found it) ends short of where it was dropped.
 * The drag's path can be short only because its search was still running at the drop (live H2-12: a false
 * "no way" for a reachable maze drop, 1 of 11), so one search confirms it first. Returns
 *   false       it gets there (`route`: the confirmed path, when the drag's was short), or nothing to say
 *   "none"      no way there at all
 *   "narrow"    a big token with no way its body fits: it goes as far as it fits (decision 8)
 * Not in a fight (a path cut by the movement left would read as "no way"), not for ghost or the
 * unconstrained tool, not when this client's pathfinding is off. An unfinished search says nothing.
 */
function noteNoRoute(grabbed, contexts, out = {}) {
  // A group's plan searches the grabbed one's route itself (anchorNoRoute): no second search here.
  if (contexts.length !== 1) return false;
  const c = contexts.find(x => x.token === grabbed) ?? contexts[0];
  const doc = c?.token?.document;
  if (!doc || inCombat(doc) || !c.destination || c.waypoints?.length) return false;
  const end = c.foundPath?.at?.(-1);
  if (!end) return false;
  try { if (grabbed._getDragConstrainOptions?.()?.ignoreWalls) return false; } catch (err) { log?.debug?.("drag constrain options", err); }
  if (feature.exposed.pathfindSkip?.(grabbed)) return false;
  if (Math.round(end.x) === Math.round(c.destination.x) && Math.round(end.y) === Math.round(c.destination.y)) return false;
  const big = (doc._source.width ?? 1) > 1 || (doc._source.height ?? 1) > 1;
  let r = null;
  try {
    const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
    r = feature.exposed.pathfindRouteTo?.(grabbed, origin, { ...origin, ...c.destination, explicit: true, checkpoint: true }, { preview: true, maxMs: CONFIRM_MS });
  } catch (err) { log?.debug?.("no-route: confirm", err); r = null; }
  if (!r) return false;
  if (r.reached && r.path?.length >= 2) { out.route = r.path; return false; }
  const legs = r.legs ?? [];
  const done = legs.length > 0 && legs.every(l => l.state !== "more");
  // Still searching (a long maze route, live H3-04): the drop finishes the search in timer slices (confirmLater).
  if (!done) return legs.length ? "pending" : false;
  if (big && (legs.some(l => l.state === "found") || (c.foundPath?.length ?? 0) >= 2)) {
    // As far as its body fits along the found way, as the drag shows once its search is done (live H4-01: the
    // drop came before the drag's search finished and the Large walked the drag's one-square line, "5 ft").
    if (r.partial?.length >= 2) out.route = r.partial;
    return "narrow";
  }
  return "none";
}

/**
 * A single drop out of combat whose route search had not finished at the drop, nor in one more short search
 * (live H3-04: a 495 ft maze route released 150 ms after the last pointer move; core's own update went nowhere,
 * so nothing moved and nobody was told). The search finishes in timer slices; then the token takes the route,
 * or, with no way there, stays and the dragger is warned (decision 7). A big token with no way it fits goes as
 * far as core's line takes it, with the narrow warning. Past the search's cap, core's own line, as before.
 * Nothing is sent when the token was moved or dropped again meanwhile. Returns null (the drop sends nothing now).
 */
function confirmLater(grabbed, c, result) {
  const doc = grabbed.document;
  const scene = doc.parent ?? canvas.scene;
  const seq = ++dropSeq;
  latestDrop.set(doc.id, seq);
  try { feature.exposed.noteDrop?.([doc.id]); } catch (err) { log.debug?.("noteDrop", err); }
  const starts = new Map([[doc.id, { x: doc._source.x, y: doc._source.y }]]);
  const t0 = now();
  const rec = { at: new Date().toISOString(), mode: "core", reason: "single", combat: false, members: 1, result: null, ms: null, async: true, relaxed: 0, replans: 0, waves: 1 };
  last = rec;
  const big = (doc._source.width ?? 1) > 1 || (doc._source.height ?? 1) > 1;
  const coreGoes = !droppedInPlace([c], result);
  const go = waypoints => {
    const m = result[1].movement?.[doc.id] ?? { planned: false };
    const updates = result[0].length ? result[0] : [{ _id: doc.id }];
    return send(scene, seq, starts, updates, { ...result[1], movement: { [doc.id]: { ...m, waypoints } } }, "move");
  };
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const search = feature.exposed.pathfindRouteToAsync;
  Promise.resolve(typeof search === "function" ? search(grabbed, origin, { ...origin, ...c.destination, explicit: true, checkpoint: true }, { preview: true }) : null)
    .then(r => {
      rec.ms = Math.round((now() - t0) * 10) / 10;
      if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { rec.result = "superseded"; return; }
      if (r?.reached && r.path?.length >= 2) {
        rec.result = "route";
        go(r.path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false })));
        return;
      }
      const legs = r?.legs ?? [];
      const done = legs.length > 0 && legs.every(l => l.state !== "more");
      if (done && big && (legs.some(l => l.state === "found") || (c.foundPath?.length ?? 0) >= 2)) {
        tellNarrow(grabbed);
        rec.result = "narrow";
        if (r?.partial?.length >= 2) go(r.partial.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false })));
        else if (coreGoes) go(result[1].movement[doc.id].waypoints);
        return;
      }
      if (done || !coreGoes) {
        // No way there (or the search ran out with nothing to go on): it stays, and the dragger is told.
        rec.reason = "noRoute"; rec.result = "none";
        tellNoRoute(NO_ROUTE);
        return;
      }
      rec.result = "core";
      go(result[1].movement[doc.id].waypoints);
    })
    .catch(err => log.warnOnce?.("single-confirm", "a single drop's route search failed (further errors suppressed)", err));
  return null;
}

/** One route call for a single drop round the tokens that stay (ms). */
const SINGLE_MS = 150;

/**
 * A single token dropped out of combat (live H2-09, H2-07): core walks it straight through a token standing
 * in its way (dnd5e blocks only hostile creatures) and stacks it on one it is dropped on. Dropped on another
 * token it takes the nearest clear spot it can reach (as the grabbed one of a group does); its way there goes
 * round the tokens that stay, when there is such a way that is not a long detour. Mutates core's result. Not
 * with Ctrl waypoints, a planned move, ghost or the unconstrained tool, or when this client's pathfinding is off.
 */
function aroundOthers(grabbed, c, result) {
  const doc = grabbed.document;
  const m = result?.[1]?.movement?.[doc.id];
  if (!m?.waypoints?.length || m.planned || c?.waypoints?.length || grabbed.layer?._movementPlanningContext) return false;
  if (result[1].constrainOptions?.ignoreWalls || feature.exposed.pathfindSkip?.(grabbed)) return false;
  if (m.waypoints.some(w => (CONFIG.Token?.movement?.actions?.[w.action]?.walls ?? "move") === null)) return false;
  const s = gridSize(grabbed);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h);
  const others = othersOf([{ id: doc.id, token: grabbed }], s);
  if (!others.length) return false;
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const start = centre(origin);
  const circles = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1 }));
  const taken = p => { const q = centre(p); return circles.some(o => Math.hypot(q.x - o.x, q.y - o.y) < o.r); };
  let end = m.waypoints.at(-1);
  let moved = false;
  if (taken(end)) {
    let spot = end;
    try { spot = clearOfWalls(grabbed, end, { taken }); } catch (err) { log.debug?.("single: a clear spot", err); }
    if (taken(spot)) return false;
    end = { ...end, x: spot.x, y: spot.y, snapped: false };
    moved = true;
  }
  // Does its way pass through one that stays (not one it starts on)?
  const live = circles.filter(o => Math.hypot(start.x - o.x, start.y - o.y) >= o.r);
  let prev = start, through = false;
  const wps = moved ? [...m.waypoints.slice(0, -1), end] : m.waypoints;
  for (const q of wps.map(centre)) { if (live.some(o => segDist(o, prev, q) < o.r)) { through = true; break; } prev = q; }
  if (!through && !moved) return false;
  const dest = { ...origin, ...end, explicit: true, checkpoint: true };
  let r1 = null;
  try { r1 = feature.exposed.pathfindRouteTo?.(grabbed, origin, dest, { preview: true, avoid: live, maxMs: SINGLE_MS }); } catch (err) { log.debug?.("single: a route round", err); }
  // Its search round them ran out (a slow tab): finished after the drop, the token going when it is done (live
  // H4-04: on the slow page a single walked straight through a token standing in room B, -75 to -85 px).
  if (!moved && r1?.unfinished && typeof feature.exposed.pathfindRouteToAsync === "function") return { later: { origin, dest, avoid: live, wps } };
  let path = r1?.reached && r1.path?.length >= 2 && !tooLong(origin, wps, r1.path.slice(1), s) ? r1.path : null;
  if (!path && moved) {
    try { const r2 = feature.exposed.pathfindRouteTo?.(grabbed, origin, dest, { preview: true, maxMs: SINGLE_MS }); if (r2?.reached && r2.path?.length >= 2) path = r2.path; }
    catch (err) { log.debug?.("single: a route", err); }
  }
  if (!path) {
    if (!moved) return false;
    // The spot beside it, at the end of core's own way (the last leg bent to it).
    m.waypoints = wps.map((p, k) => (k === wps.length - 1 ? { ...p, explicit: true, checkpoint: true } : p));
    return true;
  }
  m.waypoints = path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
  return true;
}

/**
 * A single drop whose way round the tokens that stay was still being searched at the drop (aroundOthers'
 * `later`): the search finishes in timer slices and the token takes that way, or core's (`wps`) when there is
 * none or only a long detour. Nothing is sent when the token was moved or dropped again meanwhile. Returns null.
 */
function aroundLater(grabbed, result, { origin, dest, avoid, wps }) {
  const doc = grabbed.document;
  const scene = doc.parent ?? canvas.scene;
  const seq = ++dropSeq;
  latestDrop.set(doc.id, seq);
  try { feature.exposed.noteDrop?.([doc.id]); } catch (err) { log.debug?.("noteDrop", err); }
  const starts = new Map([[doc.id, { x: doc._source.x, y: doc._source.y }]]);
  const t0 = now();
  const rec = { at: new Date().toISOString(), mode: "core", reason: "single", combat: false, members: 1, result: null, ms: null, async: true, relaxed: 0, replans: 0, waves: 1 };
  last = rec;
  const s = gridSize(grabbed);
  const go = waypoints => {
    const m = result[1].movement?.[doc.id] ?? { planned: false };
    const updates = result[0].length ? result[0] : [{ _id: doc.id }];
    return send(scene, seq, starts, updates, { ...result[1], movement: { [doc.id]: { ...m, waypoints } } }, "move");
  };
  Promise.resolve(feature.exposed.pathfindRouteToAsync(grabbed, origin, dest, { preview: true, avoid }))
    .then(r => {
      rec.ms = Math.round((now() - t0) * 10) / 10;
      if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { rec.result = "superseded"; return; }
      if (r?.reached && r.path?.length >= 2 && !tooLong(origin, wps, r.path.slice(1), s)) {
        rec.result = "round";
        go(r.path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false })));
        return;
      }
      rec.result = "core";
      go(wps);
    })
    .catch(err => log.warnOnce?.("single-around", "a single drop's way round the others failed (further errors suppressed)", err));
  return null;
}

/** The wrap's body: core's result in, the drop's result out (null while an async plan runs). */
function onDrop(grabbed, event, result) {
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[1]?.movement) return result;
  const contexts = contextsOf(event).filter(c => c?.token?.document);
  if (!contexts.length) return result;
  let caughtUp = false;
  try { caughtUp = setting("groupMovement") && catchUpDestination(grabbed, event, contexts); } catch (err) { log.debug?.("drop: catch up the destination", err); }
  let noRoute = false;
  const confirmed = {};
  try { noRoute = noteNoRoute(grabbed, contexts, confirmed); } catch (err) { log.debug?.("no-route check", err); }
  if (contexts.length === 1 && noRoute === "none") {
    // Decision 7: a single token with no way there does not move at all.
    tellNoRoute(NO_ROUTE);
    last = { at: new Date().toISOString(), mode: "core", reason: "noRoute", combat: false, members: 1, result: "none", ms: 0, async: false, relaxed: 0, replans: 0, waves: 0 };
    return null;
  }
  if (contexts.length === 1 && noRoute === "pending") return confirmLater(grabbed, contexts[0], result);
  if (contexts.length === 1 && noRoute === "narrow") tellNarrow(grabbed);
  if (contexts.length === 1 && confirmed.route) {
    // The drag's search was still running at the drop: the confirmed route, not core's short line.
    const m = result[1].movement?.[grabbed.document.id];
    if (m) m.waypoints = confirmed.route.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
  }
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
  if (droppedInPlace(contexts, result, caughtUp)) {
    Object.assign(last, { mode: "core", reason: "still", result: "core", ms: 0 });
    return result;
  }
  if (info.mode === "core") {
    if (info.reason === "single" && !info.combat) {
      let around = false;
      try { around = aroundOthers(grabbed, contexts[0], result); } catch (err) { log.debug?.("single: round the tokens that stay", err); }
      if (around?.later) return aroundLater(grabbed, result, around.later);
    }
    if (unstackable(info.reason)) unstack(contexts, result, grabbed.document.id, info.combat);
    if (info.combat) checkpointAll(contexts, result[1]);
    last.result = "core";
    return result;
  }
  debugThrow();
  const clock = planClock();
  const prep = prepare(grabbed, contexts, { ...info, clock });
  if (!prep) { fellBack("noAnchor"); return result; }

  const finish = plan => {
    last.ms = Math.round((now() - t0) * 10) / 10;
    if (plan?.reason === "anchorNoRoute") {
      // No way for the grabbed token to the drop: nobody moves (H1-12; Joe's decision 7), and the dragger is told.
      fellBack("anchorNoRoute");
      // Where it was dropped (top-left px), so a refusal can be checked against the map (H4-01).
      const d = prep.anchor?.dest;
      Object.assign(last, { result: "none", reason: "anchorNoRoute", dest: d ? { x: Math.round(d.x), y: Math.round(d.y) } : null });
      tellNoRoute(NO_ROUTE_GROUP);
      return { first: [[], { ...result[1], movement: {} }], later: [], base: null };
    }
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
    // A big member with no route its body fits stops short where core leaves it: told as a single drag is (H3-09).
    try { tellExcludedNarrow(prep.members, plan.excluded, result); } catch (err) { log.debug?.("narrow: a group member", err); }
    const b = batches(plan, prep.members, result, info.combat);
    last.waves = b.later.length + 1;
    return b;
  };

  const scene = grabbed.document.parent ?? canvas.scene;
  const starts = new Map(prep.members.map(m => [m.id, { x: m.token.document._source.x, y: m.token.document._source.y }]));
  // Every client learns the group's members from its moves' update options (a click on one stops them all, decision 3).
  const gid = foundry.utils.randomID();
  const tag = b => {
    if (prep.members.length < 2) return b;
    if (b.first?.[1]) b.first[1] = { ...b.first[1], [GROUP_OPT]: gid };
    if (b.base) b.base = { ...b.base, [GROUP_OPT]: gid };
    return b;
  };
  const hold = b => ({ scene, seq, starts, endMs: b.endMs ?? 0, gid });
  const step = clock.run(() => runPlan(prep.gen, GROUP_LIMITS.syncMs, clock.now));
  if (step.done) {
    const b = tag(finish(step.value));
    schedule(b.later, b.base, prep.members, hold(b));
    return b.first[0].length ? b.first : null;
  }

  // Async: finish in timer slices, then commit the same shape core would have, for the members
  // nobody moved and this client did not drop again in the meantime.
  last.async = true;
  const commit = ([updates, options]) => (updates.length ? send(scene, seq, starts, updates, options, "move") : null);
  const tick = () => {
    if (!feature) return;                  // uninstalled while planning: nothing is sent
    let b;
    try {
      if (clock.now() > GROUP_LIMITS.totalMs || now() - t0 > GROUP_LIMITS.waitMs) b = finish({ result: "core", reason: "budget" });
      else {
        const r = clock.run(() => runPlan(prep.gen, SLICE_MS, clock.now));
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
    b = tag(b);
    const sent = commit(b.first);
    const g = schedule(b.later, b.base, prep.members, hold(b));
    // A click while the first wave was on its way stopped the group: that wave stops too (H3-05).
    sent?.then?.(() => { if (g?.stopped) lateStop(scene, b.first[0].map(u => u._id)); });
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
    destacked: destacked ? { ...destacked } : null,
    cut: cutLast ? { ...cutLast } : null,
    held: heldLast ? { ...heldLast } : null,
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
  reg.on("updateToken", (doc, _changes, options) => onGroupTag(doc, options), { label: "updateToken: which group a move belongs to (click stops the group)" });
  reg.on("updateToken", (doc, changes, options, userId) => onForeignStop(doc, changes, options, userId), { label: "updateToken: a member another user stopped (the rest walk round it)" });
  // A door shut or a wall raised across a move this client started cuts it before the wall (live R6-3, R6-1).
  reg.on("createWall", wall => { onWallChange(wall, null); }, { label: "createWall: cut moves across a new wall" });
  reg.on("updateWall", (wall, changes) => { onWallChange(wall, changes); }, { label: "updateWall: cut moves across a shut door" });
  ctx.expose({ groupFollower, groupCancel, groupMembers, groupStopOne, groupSettle, groupNoteStop, groupStatus, groupCutAcross: cutAcross, groupDryRun: dryRun, groupPatched: () => dropPatched });
}

export function uninstall() {
  unlistenUnload();
  dropHandle?.unwrap();
  dropHandle = null;
  dropPatched = false;
  // The unsent waves' records stay: a hot patch's re-import (or the next reload) sends them.
  for (const g of groups.values()) for (const t of g.timers) clearTimeout(t);
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  last = null;
  resumedLast = null;
  stoppedAt = null;
  destacked = null;
  cutLast = null;
  heldLast = null;
  fallbacks.length = 0;
  latestDrop.clear();
  feature = null;
}
