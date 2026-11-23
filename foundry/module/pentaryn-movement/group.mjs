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
 *   - in a fight with tier C on (fightGroupDrags, 0.8.0): the same plan, sent by space (commitFight: members whose
 *     corridors never meet together, the others on the arrival of those before them);
 *   - anything else (tier B / C off, too many, Ctrl waypoints...): core's updates cut before standing tokens
 *     (unstack), with per-cell checkpoints in a started combat, still held as one group (holdCore).
 * Every drop has one run (lifecycle-core) whose 10 s deadline bounds every wait; tokens that start stacked walk as
 * their leader (stacksFor / carryRiders); a tab going to the background sends its waves at once (flush); a throw
 * while delivering fails open to core's move (safeDeliver / failOpen).
 * Any throw, an over-budget plan or an unverifiable route means core's own updates for that drop
 * (or member), with one warning. A plan that does not finish in GROUP_LIMITS.syncMs finishes in
 * timer slices; the drop then returns no updates and the same shape is committed when it is ready.
 *
 * While a group is dragged only the grabbed token is pathfound (groupFollower, read by pathfind.mjs):
 * the plan at the drop replaces the others' previews anyway.
 */

import { MODULE } from "./movement-core.mjs";
import { MOTION, cellChain, firstLegAcross, groupMode, radiusOf, routeAhead, waves } from "./motion-core.mjs";
import { GROUP_LIMITS, flood, freePrefix, hexCandidates, onCell, planGroup, prefixOf, restOnPaths, runPlan, settle, stayPastDeadline, walkersMeet } from "./group-core.mjs";
import { LIFE, capped, expired, left as lifeLeft, newRun, over, step as lifeStep } from "./lifecycle-core.mjs";
import { cutsFor, sequence, stacksOf } from "./sequence-core.mjs";
import { hideCue, showCue } from "./cue-ui.mjs";
import { LIMITS, skipReason } from "./pathfind-core.mjs";
import { clearOfWalls, continuationInFlight, countsForRoutes, cutAtWalls, drawnPosition, gridSize, inCombat, memberOf, movementFacts, movingOthers, narrowPoints, othersOf, pinDrawn, restWalkable, speedOf, stopWhereDrawn, toSquares, toTopLeft, unpin } from "./group-adapter.mjs";
import { fieldFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { dnd5eMovementAutomation, setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { resolveRef } from "./lib/resolve.mjs";
import { errorCode } from "./lib/errors.mjs";
import { reservations as reserve } from "./reserve-adapter.mjs";
import { RESERVE, lostRace, queueNext, queueUntil, singleCut, singleTiming, throughStanding } from "./reserve-core.mjs";

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
 * Records are this user's and this world's only, and older than PENDING_TTL_MS are dropped unsent;
 * since 0.7.1 so is a group whose first unsent wave is more than RESERVE.overdueMs overdue (S3R1-07:
 * the other clients have dropped those reservations by then, and a page that took 10+ s to come back
 * walked an old plan into members long at rest). Those members stay where they are, with a notice.
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

/** How long after ready the waves-dropped notice is shown (ms; FR1-10). */
const NOTICE_DELAY_MS = 1500;

/**
 * After a reload: send what this client's groups had left, spaced as planned. Returns how many
 * groups were picked up (status().group.resumed.groups).
 */
function resumePending() {
  const list = readPending();
  if (!list.length) return 0;
  writePending([]);
  let resumed = 0, dropped = 0;
  const t = Date.now();
  for (const r of list) {
    try {
      if ((r.world ?? null) !== (game.world?.id ?? null) || r.user !== game.user?.id) continue;
      const age = t - (r.t0 ?? 0);
      if (!(age >= 0) || age > PENDING_TTL_MS) continue;
      const scene = globalThis.game?.scenes?.get?.(r.sceneId);
      const waves = (r.waves ?? []).filter(w => Array.isArray(w?.updates) && w.updates.length).sort((a, b) => a.at - b.at);
      if (!scene || !waves.length || !r.base) continue;
      // Too late (S3R1-07): past RESERVE.overdueMs every other client has dropped these members' reservations and
      // counts them standing where they are; the board has moved on since the plan, and the page took longer than
      // that to come back (the GM's reload: 10+ s), so a late wave would walk an old plan into members long at rest.
      // They stay where they are, and this user is told.
      if (age - waves[0].at > RESERVE.overdueMs) {
        dropped += waves.reduce((n, w) => n + w.updates.length, 0);
        continue;
      }
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
  if (resumed || dropped) resumedLast = { at: new Date().toISOString(), groups: resumed, dropped };
  if (dropped) {
    // A moment after ready, and kept until dismissed (FR1-10: shown at ready on a player's reload it was never drawn,
    // and a notice that fades is gone before a reloaded page is looked at): "Stopped short" (0.8.0, two notices only).
    feature?.exposed?.tele?.("wave", { reason: "reloadDropped", members: dropped });
    setTimeout(() => {
      try { ui.notifications?.warn?.("PENTARYN_MOVEMENT.notify.stoppedShort", { localize: true, permanent: true }); }
      catch (err) { log?.debug?.("pending waves (notice)", err); }
    }, NOTICE_DELAY_MS);
  }
  return resumed;
}

/* -------------------------------------------- */
/*  A fight's walk across a reload (FR2-09)     */
/* -------------------------------------------- */

/**
 * In a fight core walks a move square by square, and only the client that started it sends each next square: a reload
 * mid-walk left the token on the square it had reached (live FR2-09 / FR1-06: Hero 4 at rest in the one-wide corridor,
 * 2 of 2). Every client records, for the fight moves it started, the squares still to walk (sessionStorage, per tab);
 * after a reload the walk goes on from the square it rests on, costed, as long as the record is FIGHT_TTL_MS fresh,
 * the token is still in the fight and rests on a square of that walk (a swiftshader page took 27 s to come back,
 * so a minute). It walks on only as far as it is free of every token standing (walkOnFight): stopping short beats
 * walking into anyone.
 */
const FIGHT_KEY = `${MODULE}.fightWalks`;
const FIGHT_TTL_MS = 60000;
let fightResumed = null;

function readFights() {
  const store = sessionStore();
  if (!store) return {};
  try { const o = JSON.parse(store.getItem(FIGHT_KEY) ?? "{}"); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
  catch { return {}; }
}

function writeFights(o) {
  const store = sessionStore();
  if (!store) return;
  try {
    const t = Date.now();
    for (const [k, v] of Object.entries(o)) if (!v || t - (v.t ?? 0) > FIGHT_TTL_MS) delete o[k];
    if (Object.keys(o).length) store.setItem(FIGHT_KEY, JSON.stringify(o));
    else store.removeItem(FIGHT_KEY);
  } catch (err) { log?.debug?.("fight walks (sessionStorage)", err); }
}

const FIGHT_FIELDS = ["x", "y", "elevation", "width", "height", "level", "action", "snapped", "explicit", "checkpoint"];

/** moveToken, every client: a fight move this client started records the squares it has still to walk. */
function onFightMove(doc, movement) {
  if (!feature || !doc?.id) return;
  const m = doc.movement;
  if (!m?.user?.isSelf) return;
  const fights = readFights();
  const pending = (movement?.pending?.waypoints ?? m.pending?.waypoints ?? []).filter(w => !w.intermediate);
  let combat = false;
  try { combat = inCombat(doc); } catch { combat = false; }
  if (!combat || !pending.length || m.constrainOptions?.ignoreWalls) {
    if (fights[doc.id]) { delete fights[doc.id]; writeFights(fights); }
    return;
  }
  fights[doc.id] = { t: Date.now(), scene: doc.parent?.id ?? null, world: game.world?.id ?? null, user: game.user?.id ?? null,
    route: pending.map(w => Object.fromEntries(FIGHT_FIELDS.filter(k => w[k] !== undefined).map(k => [k, w[k]]))) };
  writeFights(fights);
  listenUnload();
}

/** stopToken: a stopped move has nothing left to walk (not the stops of a page that is going: those it resumes). */
function onFightStop(doc) {
  if (!doc?.id || unloading) return;
  const fights = readFights();
  if (!fights[doc.id]) return;
  delete fights[doc.id];
  writeFights(fights);
}

/** After a reload, once the canvas is drawn: each recorded fight walk goes on from the square it rests on. */
function resumeFights(tries = 120) {
  const fights = readFights();
  const ids = Object.keys(fights);
  if (!ids.length || !feature) return 0;
  // Once its scene is the one drawn (a player's page comes back on another map first, and pentaryn-resume then views
  // its own: live, the records were read before their tokens were drawn).
  const drawn = id => { const sc = globalThis.canvas?.scene; return !!sc && sc.id === fights[id]?.scene && !!sc.tokens?.get?.(id)?.object; };
  if (!globalThis.canvas?.ready || !ids.some(drawn)) { if (tries > 0) setTimeout(() => resumeFights(tries - 1), 250); return 0; }
  writeFights({});
  const t = Date.now();
  let n = 0;
  const why = {};
  for (const id of ids) {
    const r = fights[id];
    try {
      if (!r || t - (r.t ?? 0) > FIGHT_TTL_MS || r.world !== (game.world?.id ?? null) || r.user !== game.user?.id) {
        why[id] = `stale (${t - (r?.t ?? 0)} ms, ${r?.world === (game.world?.id ?? null)}, ${r?.user === game.user?.id})`;
        continue;
      }
      const doc = game.scenes?.get?.(r.scene)?.tokens?.get?.(id);
      if (!doc?.object || !doc.isOwner || !inCombat(doc)) { why[id] = `not here (${!!doc?.object}/${!!doc?.isOwner}/${doc ? inCombat(doc) : null})`; continue; }
      const st = doc.movement?.state;
      if (st === "pending" || st === "paused") { why[id] = st; continue; }
      const route = Array.isArray(r.route) ? r.route.filter(w => Number.isFinite(w?.x) && Number.isFinite(w?.y)) : [];
      const src = doc._source;
      const k = route.findIndex(w => w.x === src.x && w.y === src.y);
      const left = route.slice(k + 1);
      if (!left.length) { why[id] = "at its end"; continue; }
      // It rests on its walk (a square it reached, or the one it set off from): the rest of it, every square a checkpoint.
      if (k < 0 && !squareNext(src, left[0], gridSize(doc.object))) { why[id] = "off its walk"; continue; }
      why[id] = walkOnFight(doc, left.map(w => ({ ...w, explicit: true, checkpoint: true }))) ? "walks on" : "blocked";
      n += 1;
    } catch (err) { why[id] = `error ${err?.message ?? err}`; log?.debug?.("resume a fight walk", err); }
  }
  fightResumed = { at: new Date().toISOString(), members: n, why };
  return n;
}

/** Is `b` one square (8 neighbours) from `a` (top-left pixels)? */
function squareNext(a, b, s) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= s + 1e-6;
}

/** status().group.last after a throw: the drop went as core's (live R4-11: it read mode "plan", result null). */
function noteThrow(t0 = null) {
  last = { ...(last ?? { at: new Date().toISOString(), members: null, async: false, cut: 0, replans: 0 }),
    mode: "core", reason: "throw", result: "core", waves: 0, ms: t0 === null ? (last?.ms ?? null) : Math.round((now() - t0) * 10) / 10 };
}

function fellBack(reason) {
  fallbacks.unshift({ at: new Date().toISOString(), reason });
  fallbacks.length = Math.min(fallbacks.length, 8);
  feature?.exposed?.tele?.("fallback", { reason });
}

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

const contextsOf = event => Object.values(event?.interactionData?.contexts ?? {});

/** During a group drag, is this token one of the followers (pathfinding waits for the drop)? */
function groupFollower(token) {
  // The tier that would plan this drop (0.8.0): out of combat groupDrags, in a fight fightGroupDrags. A drop left to
  // core's move keeps every member's own pathfinding.
  let combat = false;
  try { combat = inCombat(token?.document); } catch { combat = false; }
  if (!setting(combat ? "fightGroupDrags" : "groupDrags")) return false;
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
      enabled: !!setting("groupDrags"), fightTier: !!setting("fightGroupDrags"), members: contexts.length, gridType,
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

/**
 * A path (top-left pixels) with every square between two whole-square corners put in, as a fight walks it
 * (withCheckpoints): a cut or a timing of the path then sees the squares walked, not the straight line between its
 * corners (S1R2-04: a single drag's knight's-move line had no whole square on it before the first token in its way,
 * so it was cut back to where it stood and did not move at all).
 */
function onSquares(path, s) {
  if (!Array.isArray(path) || path.length < 2) return path;
  const out = [path[0]];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const di = (b.y - a.y) / s, dj = (b.x - a.x) / s;
    if (Number.isInteger(di) && Number.isInteger(dj) && Math.max(Math.abs(di), Math.abs(dj)) > 1) {
      for (const c of cellChain([{ i: 0, j: 0 }, { i: di, j: dj }]).slice(1, -1)) {
        out.push({ ...b, x: a.x + c.j * s, y: a.y + c.i * s, snapped: true, explicit: false, checkpoint: false });
      }
    }
    out.push(b);
  }
  return out;
}

/** In combat, give every member's committed waypoints their cell checkpoints. */
function checkpointAll(contexts, options) {
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
const UNSTACK = new Set(["tooMany", "waypoints", "ghost", "unconstrained", "budget", "anchorNoRoute", "noPlan", "throw", "fightTier", "off", "deliver"]);
const unstackable = reason => UNSTACK.has(reason) || String(reason ?? "").startsWith("pathfind:");

/**
 * A group drop committed as core's: cut each member's path so that no two rest on top of each other
 * (group-core restOnPaths; live R1 D-1). The grabbed token is placed first. In combat a member only
 * stops on a cell centre (or a waypoint), so the cells it walks stay whole. Mutates core's
 * [updates, options] and returns it: a member that would not move at all leaves both.
 */
function unstack(contexts, result, anchorId, combat, riders = null) {
  const [updates, options] = result ?? [];
  const movement = options?.movement;
  if (!Array.isArray(updates) || !movement || contexts.length < 2) return carryRiders(riders, result);
  // Tokens that start stacked (a rider on its mount, 0.8.0): only the leader is cut here, its riders go with it.
  const all = contexts;
  if (riders?.size) contexts = contexts.filter(c => !riders.has(c.token?.document?.id));
  // Tokens standing outside the drop are hard (0.5.0): each member's path stops before the first it would walk into,
  // and nobody rests on one. Not for ghost or the unconstrained tool, which walk through on purpose.
  let around = [];
  try {
    const free = !!options.constrainOptions?.ignoreWalls || contexts.some(c => feature.exposed.ghostFor?.(c.token));
    const s0 = gridSize(contexts[0].token);
    if (!free) around = othersOf(all.map(c => ({ id: c.token.document.id, token: c.token })), s0);
  } catch (err) { log?.debug?.("unstack: the tokens standing round the drop", err); around = []; }
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
  // The grabbed token first among the movers (it keeps its end); the ones that stay are placed before every mover.
  recs.sort((a, b) => (a.id === anchorId ? -1 : b.id === anchorId ? 1 : 0));
  const rest = restOnPaths(recs, { allowed: combat ? (c, m) => onCell(c, m.w, m.h) : null, hard: around });
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
  return carryRiders(riders, result);
}

/* -------------------------------------------- */
/*  Tokens that start stacked (0.8.0)           */
/* -------------------------------------------- */

/** token id → { mates: Set, at }: members of a recent drop that started stacked (the guard never parts them). */
const stackOf = new Map();

/**
 * The members of a drop that start stacked (a rider on its mount, a familiar on a shoulder, a grappled pair: tokens
 * whose circles overlap by more than a quarter square): rider id → { leader, dx, dy } (top-left pixel offset from its
 * leader, the largest of the stack, the grabbed one on a tie). They stay stacked: each rider walks its leader's way at
 * its offset, in its leader's wave; the planner, the cuts and the guard see only the leader. null when none.
 */
function stacksFor(contexts, grabbed) {
  if (contexts.length < 2) return null;
  const s = gridSize(grabbed);
  const items = contexts.map(c => {
    const src = c.token.document._source;
    const w = src.width ?? 1, h = src.height ?? 1;
    return { id: c.token.document.id, c: toSquares(src, w, h, s), r: radiusOf(w, h), size: w * h, src };
  });
  const byId = new Map(items.map(i => [i.id, i]));
  const out = new Map();
  const t = Date.now();
  for (const st of stacksOf(items, { prefer: grabbed.document.id })) {
    const lead = byId.get(st.leader).src;
    const ids = [st.leader, ...st.riders.map(r => r.id)];
    for (const id of ids) stackOf.set(id, { mates: new Set(ids.filter(x => x !== id)), at: t });
    for (const r of st.riders) {
      const src = byId.get(r.id).src;
      out.set(r.id, { leader: st.leader, dx: src.x - lead.x, dy: src.y - lead.y });
    }
  }
  if (stackOf.size > 200) for (const [id, v] of stackOf) if (t - v.at > 2 * LIFE.deadlineMs) stackOf.delete(id);
  return out.size ? out : null;
}

/** The ids that started stacked with token `id` in a drop of the last deadline (an empty set when none). */
function stackmates(id) {
  const v = stackOf.get(id);
  return v && Date.now() - v.at <= 2 * LIFE.deadlineMs ? v.mates : new Set();
}

/** A rider's waypoints: its leader's, at its offset (its own size). */
function riderWaypoints(lead, rider, doc) {
  const w = doc?._source?.width ?? 1, h = doc?._source?.height ?? 1;
  const s = doc?.parent?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const aligned = rider.dx % s === 0 && rider.dy % s === 0;
  return lead.map(p => ({ ...p, x: p.x + rider.dx, y: p.y + rider.dy, width: w, height: h, snapped: !!p.snapped && aligned }));
}

/**
 * Core's [updates, options] (or one wave's { updates, movement }) with every rider moving as its leader does: its
 * leader's waypoints at its offset, or not at all when the leader does not move. Mutates and returns it.
 */
function carryRiders(riders, result) {
  if (!riders?.size || !result) return result;
  const isPair = Array.isArray(result);
  const movement = isPair ? result[1]?.movement : result.movement;
  if (!movement) return result;
  let updates = isPair ? result[0] : result.updates;
  const scene = globalThis.canvas?.scene;
  for (const [id, r] of riders) {
    const lead = movement[r.leader];
    const doc = scene?.tokens?.get?.(id) ?? null;
    if (!lead?.waypoints?.length) {
      delete movement[id];
      updates = updates.filter(u => u._id !== id);
      continue;
    }
    movement[id] = { ...(movement[id] ?? { planned: false }), ...lead, waypoints: riderWaypoints(lead.waypoints, r, doc) };
    if (!updates.some(u => u._id === id)) updates = [...updates, { _id: id }];
  }
  if (isPair) result[0] = updates; else result.updates = updates;
  return result;
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/** The oracles group-core asks, for these members on this canvas. */
function oraclesFor(members, anchor, { combat, constrain, clock = null }) {
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
  // In a fight a route is walked square by square (a checkpoint at every square, withCheckpoints): the plan times
  // those squares, not the straight lines between its corners (a knight's-move corner ran half a square off the
  // squares walked, past a member waiting beside them).
  const squares = path => (combat ? onSquares(path, s) : path);
  const measured = raw => {
    const path = squares(raw);
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
  /** A found path (top-left pixels) as a route: centres in squares, its length, the path itself. */
  const asRoute = (rec, raw, cost) => {
    const path = squares(raw);
    const pts = path.map(p => toSquares(p, rec.w, rec.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return { points: pts, length, data: { path, cost } };
  };
  /** The grabbed token's drag route, when it is the one to reuse for a route to `to` (its drop point). */
  const shownFor = (m, to) => {
    const rec = byId.get(m.id);
    if (m.id !== anchor.id || rec.searching) return null;
    const doc = rec.token.document;
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    const shown = rec.corePathRaw ?? [];
    const src = doc._source;
    if (!atFormation || shown.length < 2 || Math.round(last.x) !== tl.x || Math.round(last.y) !== tl.y) return null;
    if (shown[0].x !== src.x || shown[0].y !== src.y) return null;
    return shown;
  };
  const search = (rec, to, list, maxMs = ROUTE_MS) => {
    const { origin, dest } = destOf(rec, to);
    return feature.exposed.pathfindRouteTo(rec.token, origin, dest, {
      preview: true, avoid: list.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      maxMs,
    });
  };
  /**
   * The route round `avoid` (circles, squares: the tokens standing in the way and, in a re-plan, rest spots), which
   * group-core decides (0.5.0: hard, in a fight too). There is no way back to a route through them: no route is null,
   * and the plan walks the member as far as the way is free (toward).
   */
  const route = (m, from, to, { avoid = [] } = {}) => {
    unfinished = false;
    const rec = byId.get(m.id);
    // The grabbed token to its drop point: the route its drag preview showed (already pathfound and constrained while
    // dragging), so it walks what the player saw, unless it passes through a token that stays (HX1-01: the drag's
    // preview routes round walls only) or a search the drag had not finished (`searching`).
    const shown = shownFor(m, to);
    if (shown && !throughAny(shown.map(p => toSquares(p, rec.w, rec.h, s)), avoid)) return measured(shown.map(p => ({ ...p })));
    const r = search(rec, to, avoid);
    if (!r?.reached || !r.path?.length) { unfinished = !!r?.unfinished; return null; }
    return asRoute(rec, r.path, r.cost);
  };
  /**
   * The way that ignores the tokens (0.5.0, a member with no route round them): the drag route for the grabbed one,
   * else a search round walls only; for a big token as far as its body fits. group-core walks it only as far as it
   * is free of the tokens. null when there is none.
   */
  const toward = (m, from, to) => {
    unfinished = false;
    const rec = byId.get(m.id);
    if (!rec) return null;
    const shown = shownFor(m, to);
    if (shown) return measured(shown.map(p => ({ ...p })));
    const r = search(rec, to, []);
    if (r?.reached && r.path?.length >= 2) return asRoute(rec, r.path, r.cost);
    if (r?.partial?.length >= 2) return asRoute(rec, r.partial, null);
    // Not found within its cap: "not yet", which the plan finishes in slices (FR1-07), never "no way".
    unfinished = !!r?.unfinished;
    return null;
  };
  /**
   * A route search run in slices with a yield between them (`yield*` it from the plan), its own time capped at `cap`
   * ms. Round `avoid` as route(). The route, or null (no way, or not found within the cap: `unfinished` says which).
   */
  const sliced = function* (rec, to, avoid, cap) {
    const steps = feature.exposed.pathfindRouteSteps;
    const { origin, dest } = destOf(rec, to);
    const gen = steps(rec.token, origin, dest, {
      preview: true, avoid: avoid.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
    });
    let busy = 0, v;
    for (;;) {
      const t = now();
      v = gen.next(busy >= cap);
      busy += now() - t;
      if (v.done) break;
      yield "route";
    }
    v = v.value;
    if (!v?.reached || !v.path?.length) { unfinished = !!v?.unfinished; return null; }
    return asRoute(rec, v.path, v.cost);
  };
  /**
   * route(), searched in slices (S2R1-02): the same answer and the same ROUTE_MS cap, but a search that has no way
   * (a corridor plugged by the tokens it keeps round explores the whole map) no longer holds the page for its whole
   * cap in one go. A route search was the one step of a plan that did not yield: up to 250 ms each, two or three in
   * one slice, and every token on the tab froze for 300-870 ms.
   */
  const routeSliced = function* (m, from, to, { avoid = [] } = {}) {
    unfinished = false;
    const rec = byId.get(m.id);
    const shown = shownFor(m, to);
    if (shown && !throughAny(shown.map(p => toSquares(p, rec.w, rec.h, s)), avoid)) return measured(shown.map(p => ({ ...p })));
    if (!rec || typeof feature.exposed.pathfindRouteSteps !== "function") return route(m, from, to, { avoid });
    return yield* sliced(rec, to, avoid, ROUTE_MS);
  };
  /**
   * The route a short search could not finish, searched to the end in slices (a yield between them, so a slow
   * tab draws its frames): `yield*` it from the plan. Its own cap is a drag search's (LIMITS.totalMs of its
   * own slices). Round `avoid` as route() (HX1-01 (d): never redone through the tokens). The route, or null
   * (no way, or still not found: `unfinished` says which).
   */
  const routeLong = function* (m, from, to, { avoid = [] } = {}) {
    unfinished = false;
    const rec = byId.get(m.id);
    if (!rec || typeof feature.exposed.pathfindRouteSteps !== "function") return null;
    return yield* sliced(rec, to, avoid, LIMITS.totalMs);
  };
  /**
   * Is a token of radius r (squares) at c in a one-wide corridor or a doorway (S1R1-02: the grabbed one cut short
   * rested with half its body in the A-B corridor's mouth)? Its centre and four points 0.9 r out: from any of them,
   * move-blocking walls within 0.6 square on both sides, across or along.
   */
  const crampMemo = new Map();
  const z = anchor.token.document?._source?.elevation ?? 0;
  const wallWithin = (o, dx, dy) => {
    try { return !!anchor.token.checkCollision({ x: o.x + dx * 0.6 * s, y: o.y + dy * 0.6 * s, elevation: z }, { origin: o, type: "move", mode: "any" }); }
    catch { return false; }
  };
  const cramped = (c, r = 0.5) => {
    const k = `${c.x.toFixed(2)},${c.y.toFixed(2)},${r}`;
    if (!crampMemo.has(k)) {
      const d = 0.9 * r;
      const v = [[0, 0], [d, 0], [-d, 0], [0, d], [0, -d]].some(([ox, oy]) => {
        const o = { x: (c.x + ox) * s, y: (c.y + oy) * s, elevation: z };
        return (wallWithin(o, 1, 0) && wallWithin(o, -1, 0)) || (wallWithin(o, 0, 1) && wallWithin(o, 0, -1));
      });
      crampMemo.set(k, v);
    }
    return crampMemo.get(k);
  };
  return {
    walkable,
    walkDistance,
    cramped,
    route,
    routeSliced,
    routeLong,
    toward,
    unfinished: () => unfinished,
    narrow: (points, r) => narrowPoints(anchor.token, points, r, s),
    now: clock?.now ?? now,
  };
}

/**
 * Does a path (centres, squares) come inside any of `circles` ({ x, y, r } squares)? As strict as the plan's own
 * check (settle): S1R1-02, a drag line slanting into a corridor's mouth grazed a token standing beside it by 0.01
 * square, passed a 0.02 slack, and settle then cut the grabbed one back into the corridor.
 */
function throughAny(pts, circles) {
  if (!circles?.length || pts.length < 2) return false;
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    if (circles.some(c => segDist(c, a, b) < c.r - 1e-4)) return true;
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
function prepare(grabbed, contexts, info, riders = null) {
  const s = gridSize(grabbed);
  const all = contexts;
  if (riders?.size) contexts = contexts.filter(c => !riders.has(c.token?.document?.id));
  const members = contexts.map(c => ({ ...memberOf(c, s), corePathRaw: c.foundPath ?? [], searching: !!c.searching }));
  // The riders are not standing tokens to keep round: they walk with their leaders.
  const outside = [...members, ...all.filter(c => riders?.has(c.token?.document?.id)).map(c => ({ id: c.token.document.id, token: c.token }))];
  const anchor = members.find(m => m.id === grabbed.document.id);
  if (!anchor) return null;
  let moving = [];
  try { moving = info.mode === "plan" ? movingOthers(outside, s) : []; } catch (err) { log?.debug?.("tokens walking outside the group", err); }
  // The reservations this client has received (0.6.0): every other move's whole plan, its later waves too, in the
  // server's order. Read up to `snap`: one arriving after it, and before this plan's own publish comes back, came
  // first and was not read (the race, decided at the echo).
  const snap = reserve.seqNow();
  let reserved = [];
  if (info.mode === "plan") {
    try {
      const live = reserve.liveFor(members, { skip: new Set(moving.map(w => w.id)) });
      moving = [...moving, ...live.walkers];
      reserved = live.rests;
    } catch (err) { log?.debug?.("reservations", err); }
  }
  const spec = { members, anchorId: anchor.id, combat: info.combat, mode: info.mode, others: othersOf(outside, s), moving, reserved };
  return { members, anchor, snap, walkers: moving, gen: planGroup(spec, oraclesFor(members, anchor, info)) };
}

/**
 * Turn a finished plan into update batches: { first: [updates, options], later: [{ at, ids, updates, movement }] }.
 * A planned member's waypoints are its route (in combat with cell checkpoints); a member left to core
 * keeps core's entry. A member whose route is missing falls back to core's entry too.
 */
function batches(plan, members, [updates, options], combat, riders = null) {
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
    // A member that stays where it stands (no free way, 0.5.0) does not move at all.
    if (e && !e.core && (e.points?.length ?? 0) < 2) { delete movement[m.id]; continue; }
    if (!e || e.core || !e.data?.path?.length) continue;
    const path = cutPath(e.data.path, e.cut, combat);
    if (path.length < 2) { delete movement[m.id]; continue; }      // already there
    let wps = combat ? withCheckpoints(m.token, path) : path.slice(1);
    if (!plan.straight && !combat) wps = wps.map((w, k) => (k === wps.length - 1 ? w : { ...w, checkpoint: false }));
    wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
    movement[m.id] = { ...(movement[m.id] ?? { planned: false }), waypoints: wps };
  }
  // Riders walk their leader's way, in its wave (0.8.0).
  if (riders?.size) {
    carryRiders(riders, [[], { movement }]);
    for (const [id, r] of riders) if (movement[id]) delays[id] = delays[r.leader] ?? 0;
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
 * A found path (top-left pixels) cut short where the plan stops the member (group-core's { k, t }, 0.5.0): up to
 * waypoint k, then the point at fraction t of the next leg (in a fight a whole square, snapped).
 */
function cutPath(path, cut, combat) {
  if (!cut) return path;
  const pts = path.map(p => ({ x: p.x, y: p.y }));
  const pre = prefixOf(pts, cut);
  const out = path.slice(0, Math.min(pre.length, cut.k + 1));
  if (pre.length > out.length) {
    const end = pre.at(-1);
    const next = path[Math.min(cut.k + 1, path.length - 1)];
    const x = Math.round(end.x), y = Math.round(end.y);
    // In a fight the cut point is a whole square already (group-core onCell): its top-left is on the grid.
    out.push({ ...next, x, y, snapped: !!combat });
  }
  return out;
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
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r, why: `src:${o.id}` });
    // Still walking with waypoints to go (a move with checkpoints): core constrains each next leg when it
    // continues, so a door shut since stops it short of its source. Where it will stop counts too (live
    // R5-1: a member already walking to the door was cut by core on the square a waiting member was sent to).
    const stop = predictedStop(o);
    if (stop) circles.push({ x: stop.x + (ow * s) / 2, y: stop.y + (oh * s) / 2, r, why: `stop:${o.id}` });
  }
  for (const c of claims ?? []) if (c.id !== id) circles.push({ ...c, why: c.why ?? `claim:${c.id}` });
  // Where other moves' reserved walks end (0.6.0): taken too.
  try { circles.push(...reserve.restCircles(scene, id).map(c => ({ ...c, why: `rest:${c.id}` }))); } catch (err) { log?.debug?.("taken: reserved rests", err); }
  return whyTaken(circles, w, h, r, s);
}

/** A taken test over `circles` (top-left `p` → true when a body of radius r at p comes inside one); `.why(p)` names the circle. */
function whyTaken(circles, w, h, r, s) {
  const hit = p => {
    const cx = p.x + (w * s) / 2, cy = p.y + (h * s) / 2;
    return circles.find(c => Math.hypot(cx - c.x, cy - c.y) < r + c.r - 1e-6) ?? null;
  };
  const test = p => !!hit(p);
  test.why = p => hit(p)?.why ?? null;
  return test;
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
 * A wave member's waypoints, short of the members clicked to a stop since the drop (`avoid`: pixel centres and radii):
 * a member whose way passes through one stops short behind it (0.8.0, Fable's review: followers stop short behind a
 * stopped one; no re-route, no "too long" test). Unchanged when its way passes none; null when it would not get off
 * where it stands.
 */
function roundStopped(scene, id, m, options, avoid) {
  if (!m?.waypoints?.length || options?.constrainOptions?.ignoreWalls || m.planned || !avoid?.length) return m;
  const doc = scene?.tokens?.get(id);
  const token = doc?.object;
  if (!token || inCombat(doc)) return m;
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const wps = shortBehind(token, { from: origin, waypoints: m.waypoints }, avoid);
  if (wps === m.waypoints) return m;
  feature.exposed.tele?.("cut", { reason: "behindStopped", id });
  return wps.length ? { ...m, waypoints: wps } : null;
}

/**
 * A walk (`route`: `from` + top-left waypoints) kept only as far as it is free of `circles` (pixel centres, each its
 * token's own radius): the same waypoints when it never comes inside one, else the free prefix ([] when it would not
 * get off where it is). Out of combat any point; in a fight a whole square.
 */
function shortBehind(token, route, circles) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const combat = inCombat(doc);
  const path = combat ? onSquares([route.from, ...route.waypoints], s) : [route.from, ...route.waypoints];
  const pts = path.map(p => toSquares(p, w, h, s));
  const sq = circles.map(c => ({ x: c.x / s, y: c.y / s, r: c.r / s }));
  const p = freePrefix(pts, radiusOf(w, h), sq, { allowed: combat ? c => onCell(c, w, h) : null });
  if (p.full) return route.waypoints;
  const out = cutPath(path, p.cut, combat).slice(1);
  if (out.length) out[out.length - 1] = { ...out.at(-1), explicit: true, checkpoint: true };
  return out;
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
  let rids = options?.[reserve.RID_OPT] ? { ...options[reserve.RID_OPT] } : null;
  for (const id of ids) {
    let m = options.movement?.[id] ? walkableNow(scene, id, options.movement[id], options, claims) : options.movement?.[id];
    if (m && avoid.length) m = roundStopped(scene, id, m, options, avoid);
    if (m) movement[id] = m;
    // Its walk is not the one reserved any more (cut at a wall shut since, round a member stopped since): the move
    // does not name the reservation, so every client drops it and counts the token as it walks.
    if (rids && m !== options.movement?.[id]) delete rids[id];
  }
  ids = ids.filter(id => movement[id] || !options.movement?.[id]);
  if (!ids.length) return Promise.resolve(true);
  const opts = rids ? { ...options, movement, [reserve.RID_OPT]: rids } : { ...options, movement };
  // A hidden member's update goes on its own, with none of this module's keys (FR1-11: update options reach every
  // client, and the group's tag and reservation ids rode the same frame as a hidden token's move).
  const hiddenIds = new Set(ids.filter(id => scene.tokens?.get?.(id)?.hidden));
  let pending;
  try {
    const shown = updates.filter(u => ids.includes(u._id) && !hiddenIds.has(u._id));
    const hid = updates.filter(u => hiddenIds.has(u._id));
    const calls = [];
    if (shown.length) calls.push(scene.updateEmbeddedDocuments("Token", shown, hiddenIds.size ? { ...opts, movement: pick(movement, id => !hiddenIds.has(id)) } : opts));
    if (hid.length) calls.push(scene.updateEmbeddedDocuments("Token", hid, plainOptions(opts, movement, hiddenIds)));
    pending = Promise.all(calls);
  } catch (err) { pending = Promise.reject(err); }
  return pending.then(() => true, err => {
    if (unloading) return false;
    log.warnOnce(`group-${what}`, `a group ${what} failed (further errors suppressed)`, err);
    return true;
  });
}

/** The entries of `obj` whose key passes `keep`. */
function pick(obj, keep) {
  return Object.fromEntries(Object.entries(obj ?? {}).filter(([k]) => keep(k)));
}

/** Update options for hidden members only: core's own, their movement, none of this module's keys (FR1-11). */
function plainOptions(opts, movement, ids) {
  const out = {};
  for (const [k, v] of Object.entries(opts ?? {})) if (!k.startsWith("pentarynMovement")) out[k] = v;
  out.movement = pick(movement, id => ids.has(id));
  return out;
}

/**
 * Hold this client's group until its last member should be at rest (so a click on any member stops
 * them all, plan §12), and send the later waves; each checks the group was not stopped and its
 * members have not moved or been dropped again. Waves go to the drop's own scene, also when this
 * client has switched to another view meanwhile. `run`: the drop's lifecycle (lifecycle-core), whose one deadline
 * bounds every wait here (0.8.0); a wave still held at the deadline is not sent (its members stop short).
 */
function schedule(later, base, members, { scene, seq, starts, endMs = 0, gid = foundry.utils.randomID(), run = null }) {
  if (!base || members.length < 2) return null;
  const group = { ids: new Set(members.map(m => m.id)), timers: [], stopped: false, claims: [], avoid: [], pinned: new Set(), scene,
    run: run ?? newRun({ id: gid, now: Date.now(), members: members.map(m => m.id) }), pending: new Set(later), sent: [], base, seq, starts, gid };
  groups.set(gid, group);
  for (const id of group.ids) groupOf.set(id, gid);
  const lastWave = later.at(-1)?.at ?? 0;
  // A wave held back for a token walking through its way (HX1-02) pushes the group's end back by as much.
  group.held = 0;
  group.waiting = 0;
  group.t0 = Date.now();
  group.shift = 0;
  if (!over(group.run)) lifeStep(group.run, "walking", { now: group.t0 });
  const end = () => {
    if ((group.held > 0 || group.waiting > 0) && !expired(group.run, Date.now())) {
      const extra = capped(group.run, Date.now(), Math.max(group.held, FOREIGN_WAIT_MS));
      group.held = 0;
      group.timers.push(setTimeout(end, Math.max(extra, 1)));
      return;
    }
    // A stopped group rests where it was stopped (a click, a turn change); members left short stay short: nothing
    // is moved off anything at rest (0.8.0: no rest de-stack, stacked tokens stay stacked).
    lifeStep(group.run, group.stopped ? "stopped" : "rested", { now: Date.now() });
    forget(gid);
  };
  group.timers.push(setTimeout(end, Math.max(endMs, lastWave) + GROUP_HOLD_MS));
  if (later.length && scene?.id) {
    savePending({ gid, world: game.world?.id ?? null, user: game.user?.id ?? null, sceneId: scene.id, t0: Date.now(),
      endMs, base, ids: [...group.ids], starts: Object.fromEntries(starts ?? []),
      waves: later.map(w => ({ at: w.at, ids: w.ids, updates: w.updates, movement: w.movement })) });
  }
  if (later.length) listenUnload();
  const waitOn = (wave, ms, why) => {
    group.waiting += 1;
    for (const id of wave.ids ?? []) showCue(id, why);
    group.timers.push(setTimeout(() => { group.waiting -= 1; fire(wave); }, Math.max(ms, 1)));
  };
  const fire = wave => {
    if (group.stopped || !group.pending.has(wave)) return;
    // The page is going: the wave stays in the record for the reloaded page (live R5-2).
    if (unloading) {
      group.timers.push(setTimeout(() => { unloading = false; fire(wave); }, UNLOAD_RETRY_MS));
      return;
    }
    const t = Date.now();
    // Its deadline passed while it was held: its members stay where they are, told once (0.8.0).
    if (expired(group.run, t)) {
      group.pending.delete(wave);
      for (const id of wave.ids ?? []) hideCue(id);
      prunePending(gid, { at: wave.at });
      feature.exposed.tele?.("wave", { reason: "deadline", members: wave.updates.length });
      tell("short", "deadline");
      return;
    }
    // Never sooner after the waves before it than the plan has them apart (a page frozen for a few hundred ms by
    // core's fog extraction, HX1-06, fired every overdue wave in one tick). A late wave shifts those after it by as
    // much, and the group's end with them.
    const due = group.t0 + wave.at + group.shift;
    if (t < due - 50) { waitOn(wave, due - t, "wave"); return; }
    if (t - due > 50) { group.held += t - due; group.shift += t - due; }
    // A member a relay stop took out of the group (groupCancel only) is not sent.
    const updates = wave.updates.filter(u => group.ids.has(u._id));
    if (!updates.length) { group.pending.delete(wave); prunePending(gid, { at: wave.at }); return; }
    // A token outside the group now walking through this wave's way (another player's group dropped at the same
    // moment, HX1-02): the wave waits until it has passed, as long as the run's deadline allows.
    let busy = false;
    try { busy = foreignInWay(scene, group, updates, wave.movement); } catch (err) { log?.debug?.("a wave: walkers in its way", err); }
    if (busy) {
      group.held += FOREIGN_WAIT_MS;
      heldLast = { at: new Date().toISOString(), members: updates.length, ms: t - group.t0 };
      feature.exposed.tele?.("queue", { reason: "wave", members: updates.length });
      waitOn(wave, capped(group.run, t, FOREIGN_WAIT_MS), "foreign");
      return;
    }
    sendWave(group, wave, updates);
  };
  group.fire = fire;
  for (const wave of later) group.timers.push(setTimeout(() => fire(wave), wave.at));
  return group;
}

/**
 * A group just scheduled on a page that is already in the background (SIM-04, 0.8.1: dropped, then alt-tabbed while
 * it planned or published, so no visibilitychange came after the group existed) sends its later waves at once, as a
 * tab going to the background does (flush). `first`: the first wave ({ ids, movement }), which walks from now too.
 */
function flushIfHidden(group, first = null) {
  if (!group) return;
  if (first?.ids?.length) group.sent.push({ at: Date.now(), movement: first.movement, ids: first.ids });
  if (globalThis.document?.visibilityState !== "hidden") return;
  try { if (flush(group)) flushedLast = { at: new Date().toISOString(), members: group.ids.size }; }
  catch (err) { log?.warnOnce?.("group-flush", "a group's waves could not be sent when the tab went to the background (further errors suppressed)", err); feature?.exposed?.tele?.("error", { reason: "flush" }); }
}

/** Send one wave of `group` now (`updates`: its members still in the group). */
function sendWave(group, wave, updates, movement = wave.movement) {
  group.pending.delete(wave);
  for (const u of updates) hideCue(u._id);
  group.sent.push({ at: Date.now(), movement, ids: updates.map(u => u._id) });
  feature.exposed.tele?.("wave", { reason: "sent", members: updates.length });
  return send(group.scene, group.seq, group.starts, updates, { ...group.base, movement }, "wave", group.claims, group.avoid)
    .then(done => {
      if (done) prunePending(group.gid, { at: wave.at });
      // Stopped while this wave was on its way to the server (live H3-05): they stop as soon as they move.
      if (group.stopped) lateStop(group.scene, updates.map(u => u._id));
    });
}

/**
 * The page went to the background (0.8.0, Fable's review §1: players alt-tab to D&D Beyond): a hidden tab's timers are
 * throttled and draws no frames, so its later waves would wait on it. Every group this client holds sends what it has
 * left at once, each walk cut back (group-core settle) where it would meet another member's walk or the walks already
 * sent, as they are timed now: nobody waits for the tab, nobody walks through anybody. Out of combat only (a fight's
 * member sets off on another's arrival, which the deadline bounds).
 */
function flushGroups() {
  let n = 0;
  for (const g of [...groups.values()]) {
    try { n += flush(g); } catch (err) { log?.warnOnce?.("group-flush", "a group's waves could not be sent when the tab went to the background (further errors suppressed)", err); feature?.exposed?.tele?.("error", { reason: "flush" }); }
  }
  if (n) flushedLast = { at: new Date().toISOString(), members: n };
  return n;
}
let flushedLast = null;

function flush(g) {
  if (g.stopped || !g.pending?.size || !g.scene) return 0;
  const waves = [...g.pending].sort((a, b) => a.at - b.at);
  const ids = new Set(waves.flatMap(w => w.updates.map(u => u._id)).filter(id => g.ids.has(id)));
  const docs = [...ids].map(id => g.scene.tokens?.get?.(id)).filter(d => d?.object && !inCombat(d));
  if (!docs.length) return 0;
  const s = gridSize(docs[0].object);
  const movementOf = id => waves.find(w => w.movement?.[id])?.movement?.[id] ?? null;
  const list = docs.map(d => {
    const w = d._source.width ?? 1, h = d._source.height ?? 1;
    const m = movementOf(d.id);
    return { id: d.id, r: radiusOf(w, h), w, h, speed: speedOf(d.object), delay: 0, cut: null, m,
      points: [d._source, ...(m?.waypoints ?? [])].map(p => toSquares(p, w, h, s)) };
  }).filter(e => e.m && e.points.length >= 2);
  const t = Date.now();
  const walkers = [];
  for (const sent of g.sent) {
    for (const id of sent.ids) {
      const d = g.scene.tokens?.get?.(id);
      const m = sent.movement?.[id];
      const st = g.starts?.get?.(id);
      if (!d || !m?.waypoints?.length || !st) continue;
      const w = d._source.width ?? 1, h = d._source.height ?? 1;
      walkers.push({ id, r: radiusOf(w, h), speed: speedOf(d.object), delay: sent.at - t, points: [st, ...m.waypoints].map(p => toSquares(p, w, h, s)) });
    }
  }
  let statics = [];
  try { statics = othersOf([...g.ids].map(id => ({ id, token: g.scene.tokens?.get?.(id)?.object })).filter(m => m.token), s); } catch (err) { log?.debug?.("flush: the tokens standing", err); }
  const gen = settle(list, { statics, walkers, combat: false, allowedFor: e => ((e.w ?? 1) > 1 || (e.h ?? 1) > 1 ? c => onCell(c, e.w, e.h) : null) });
  let v = gen.next();
  while (!v.done) v = gen.next();
  const movement = {};
  const updates = [];
  for (const e of list) {
    const r = v.value.get(e.id);
    if (r?.still) continue;
    const doc = g.scene.tokens.get(e.id);
    const path = cutPath([{ ...doc._source }, ...e.m.waypoints], r?.cut ?? null, false);
    if (path.length < 2) continue;
    const wps = path.slice(1);
    wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
    movement[e.id] = { ...e.m, waypoints: wps };
    updates.push(waves.flatMap(w => w.updates).find(u => u._id === e.id) ?? { _id: e.id });
  }
  for (const w of waves) { g.pending.delete(w); for (const id of w.ids ?? []) hideCue(id); }
  feature.exposed.tele?.("wave", { reason: "flushed", members: updates.length, of: list.length });
  if (!updates.length) return 0;
  const fake = { at: waves[0].at, ids: updates.map(u => u._id), updates, movement };
  sendWave(g, fake, updates, movement).then(() => { for (const w of waves) prunePending(g.gid, { at: w.at }); });
  return updates.length;
}

/** How often a wave looks again for a token walking through its way, and for how long at most (ms; HX1-02). */
const FOREIGN_WAIT_MS = 250;
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
    Promise.resolve().then(() => feature?.exposed?.stop?.(doc, { via: "late" })).catch(err => log?.debug?.("stop a late wave", err));
  }
  if (left.length && tries > 0) setTimeout(() => lateStop(scene, left, tries - 1), LATE_STOP_EVERY_MS);
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

/** Length of a top-left path from `from` (squares). */
function pathSquares(from, wps, s) {
  let L = 0, prev = from;
  for (const p of wps) { L += Math.hypot(p.x - prev.x, p.y - prev.y) / s; prev = p; }
  return L;
}

/** Room round centre `c` (pixels) for a circle of radius r squares: not in a gap narrower than two of it. */
function roomyAt(token, c, r, s) {
  const p = { x: c.x / s, y: c.y / s };
  try {
    return !narrowPoints(token, [p, { x: p.x + 0.01, y: p.y }], r, s).length && !narrowPoints(token, [p, { x: p.x, y: p.y + 0.01 }], r, s).length;
  } catch { return true; }
}

/**
 * A click stopped one member of a group this client sent (live H1-05; Joe: only the clicked one stops). Only that
 * member leaves the group (its unsent wave dropped); `spot` (top-left) is where it now rests. Out of combat each other
 * member still walking whose way ahead passes through it (or through one stopped before it) stops short behind it
 * (0.8.0, Fable's review: the stop is inside its own reservation, so followers stop short behind it; no re-route, no
 * search): stopped where it is drawn (an unanimated displace), then the walk as far as it is free. Its later waves
 * stop short of it too (send → roundStopped). In a fight the others carry on. Returns the ids cut short.
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
  hideCue(tokenId);
  const doc = g.scene?.tokens?.get(tokenId);
  const scene = doc?.parent ?? g.scene;
  if (!doc || !scene || !spot || inCombat(doc)) return [];
  const s = doc.object ? gridSize(doc.object) : (scene.grid?.size ?? 100);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  g.avoid.push({ x: spot.x + (w * s) / 2, y: spot.y + (h * s) / 2, r: radiusOf(w, h) * s });
  const out = [];
  for (const id of g.ids) {
    const d = scene.tokens?.get(id);
    const token = d?.object;
    const m = d?.movement;
    const onWay = g.walkOn?.get(id);
    if (!onWay && (!token || token.destroyed || !m?.user?.isSelf || m.constrainOptions?.ignoreWalls)) continue;
    if (!onWay && !movementFacts(token).animating && m.state !== "pending") continue;
    if (!token || token.destroyed) continue;
    const route = onWay ? { from: onWay.from, waypoints: onWay.wps } : routeLeft(token, false);
    if (!route?.waypoints?.length) continue;
    // Not the stops it already overlaps where it is drawn (it walks on off them).
    const dw = d._source.width ?? 1, dh = d._source.height ?? 1, rm = radiusOf(dw, dh) * s;
    const from0 = { x: route.from.x + (dw * s) / 2, y: route.from.y + (dh * s) / 2 };
    const circles = g.avoid.filter(a => Math.hypot(from0.x - a.x, from0.y - a.y) >= a.r + rm - 1e-6);
    const wps = shortBehind(token, route, circles);
    if (wps === route.waypoints) continue;
    out.push(id);
    feature.exposed.tele?.("cut", { reason: "behindStopped", id });
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
        return moved === false || entry.cancelled || !feature || token.destroyed || !entry.wps.length ? null
          : d.move(entry.wps, { method: "api", ...republish(d, route.from, entry.wps) });
      })
      .catch(err => { unpin(token); if (g.walkOn?.get(id) === entry) g.walkOn.delete(id); log?.debug?.("stop one: walk short", err); });
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
/*  A wall raised mid-walk (live R6-3)          */
/* -------------------------------------------- */

const DOOR_OPEN = 1;
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
  const k = routeAhead(all, at, { near: 0.05 * gridSize(token), end: 0.5 });
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
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r: or, why: `src:${o.id}` });
    const stop = predictedStop(o);
    if (stop) circles.push({ x: stop.x + (ow * s) / 2, y: stop.y + (oh * s) / 2, r: or, why: `stop:${o.id}` });
  }
  for (const c of claims) if (c.id !== id) circles.push({ ...c, why: c.why ?? `claim:${c.id}` });
  return whyTaken(circles, w, h, r, s);
}

/**
 * After a reload, a fight's walk this client started goes on from the square it rests on (FR2-09), as far as it is
 * free of every token standing (0.8.0: the first-square gate is gone; a walk that would meet a standing token is cut
 * before it, on a whole square, and one that would not get off where it is does not move). Costed: a move.
 */
function walkOnFight(doc, waypoints) {
  const token = doc.object;
  if (!feature || !token || token.destroyed || !waypoints?.length) return false;
  let wps = waypoints;
  try {
    const others = othersOf([{ id: doc.id, token }], gridSize(token));
    wps = freeOfOthers(token, { ...doc._source }, waypoints, others);
  } catch (err) { log?.debug?.("resume a fight walk: the tokens standing", err); }
  if (!wps.length) return false;
  if (wps.short) feature.exposed.tele?.("cut", { reason: "resumeStanding", id: doc.id });
  try {
    Promise.resolve(doc.move(wps, { method: "api", ...republish(doc, doc._source, wps) })).catch(err => log?.debug?.("resume a fight walk", err));
  } catch (err) { log?.debug?.("resume a fight walk", err); }
  return true;
}

/**
 * createWall / updateWall, every client: a wall that now blocks movement across the route of a move this client
 * started cuts that move (live R6-3: out of combat the whole path is one update, so a door shut after the drop was
 * walked straight through).
 *   Out of combat: it is cut on a whole square before the wall, one free square per token (the nearest to the wall
 *   chooses first); it walks on from where it is drawn to that square (a displace to where it is drawn, then the walk).
 *   In a fight (0.8.0, Joe's decision 2026-11-23): everyone of that group move stops on the square they hold
 *   (stopMovement finishes the square under way, already paid for); a square already committed past the door means
 *   that token got through. No undo write, no walk on, no look again later: core constrains every later square of a
 *   move against the walls as they are when it is sent.
 * Ghost, unconstrained and wall-less actions pass. Returns the cuts made.
 */
function cutAcross(wall) {
  const scene = wall?.parent;
  const c = wall?._source?.c ?? wall?.c;
  if (!feature || !scene?.tokens || !Array.isArray(c) || c.length < 4 || !blocksMove(wall)) return [];
  const a = { x: c[0], y: c[1] }, b = { x: c[2], y: c[3] };
  const movers = [];
  const fight = new Set();
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
    if (combat) {
      // Its way on (from where it is drawn) crosses the wall: it and the rest of its group stop where they are.
      const way = [centre(drawnPosition(token)), centre(route.from), ...legs.map(centre)];
      if (firstLegAcross(way[0], way.slice(1), a, b) >= 0) fight.add(doc.id);
      continue;
    }
    const k = firstLegAcross(centre(route.from), legs.map(centre), a, b);
    if (k < 0) continue;
    // How far along it is to the wall: the nearer chooses its square first.
    let along = 0, prev = centre(route.from);
    for (let i = 0; i <= k; i++) { const q = centre(legs[i]); along += Math.hypot(q.x - prev.x, q.y - prev.y); prev = q; }
    movers.push({ doc, token, route, along, w, h, s });
  }
  const out = fight.size ? fightCut(scene, fight) : [];
  if (movers.length) out.push(...freeCut(scene, movers));
  if (out.length) {
    cutLast = { at: new Date().toISOString(), why: "wall", wall: wall.id ?? null, members: out.length, fight: out.filter(o => o.combat).length };
    feature.exposed.tele?.("cut", { reason: "wall", members: out.length });
  }
  return out;
}

/** A fight's door cut: every member of the cut moves' groups this client moves stops on the square it holds. */
function fightCut(scene, ids) {
  const all = new Set(ids);
  for (const id of ids) {
    const gid = groupOf.get(id);
    const g = gid ? groups.get(gid) : null;
    if (!g) continue;
    for (const m of g.ids) all.add(m);
    groupCancel(id);
  }
  const out = [];
  for (const id of all) {
    const doc = scene.tokens?.get?.(id);
    const m = doc?.movement;
    if (!doc?.object || !m?.user?.isSelf || m.state === "completed" || m.state === "stopped") continue;
    try { stopSafely(doc); out.push({ id, x: doc._source.x, y: doc._source.y, combat: true }); }
    catch (err) { log?.debug?.("cut: stop a fight move", err); }
  }
  return out;
}

/** Out of combat: each mover cut on a free whole square before the wall (the nearest to it chooses first). */
function freeCut(scene, movers) {
  movers.sort((x, y) => x.along - y.along);
  const ids = new Set(movers.map(m => m.doc.id));
  const claims = [];
  const out = [];
  for (const mv of movers) {
    const { doc, token, route, w, h, s } = mv;
    let kept = [];
    const taken = takenForCut(scene, doc.id, ids, claims);
    // Its last leg keeps off the squares the members cut before it took (HX1-08: one walked past another already
    // resting on its square by the door, -22 px).
    const rMe0 = radiusOf(w, h) * s;
    const legClear = (p0, q0) => {
      const p = { x: p0.x + (w * s) / 2, y: p0.y + (h * s) / 2 }, q = { x: q0.x + (w * s) / 2, y: q0.y + (h * s) / 2 };
      return claims.every(c => c.id === doc.id || segDist(c, p, q) >= c.r + rMe0 - 15);
    };
    try { ({ waypoints: kept } = cutAtWalls(token, route.from, route.waypoints, { taken, clear: legClear })); }
    catch (err) { log?.debug?.("cut: the square before the wall", err); kept = []; }
    // No square on its way (already in the doorway): it rests on the nearest clear whole square no other token takes,
    // walked to from where it is drawn (live H1-07 / H1-09, HX1-08), its walk clear of the other cut members' walks.
    if (!kept.length) {
      let spot = route.from;
      const me = { x: route.from.x + (w * s) / 2, y: route.from.y + (h * s) / 2 };
      const rMe = radiusOf(w, h) * s;
      const ways = movers.filter(o => o !== mv).map(o => {
        const p = { x: o.route.from.x + (o.w * s) / 2, y: o.route.from.y + (o.h * s) / 2 };
        const c = claims.find(q => q.id === o.doc.id);
        return { a: p, b: c ? { x: c.x, y: c.y } : p, r: radiusOf(o.w, o.h) * s };
      });
      const apart = q => {
        const e = { x: q.x + (w * s) / 2, y: q.y + (h * s) / 2 };
        return ways.every(o => segSegDist(me, e, o.a, o.b) >= rMe + o.r - 15);
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
      // Two writes (live R7-1): an unanimated displace stops the tween on every client where it is drawn now (this one
      // first, before the write); the walk to the square before the wall follows once the server has it.
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
          return doc.move(kept, { method: "api", ...republish(doc, route.from, kept) });
        })
        .catch(err => { unpin(token); log?.debug?.("cut: move", err); });
      out.push({ id: doc.id, x: end.x, y: end.y, combat: false });
    } catch (err) { log?.debug?.("cut", err); }
  }
  // This client's unsent waves plan round the squares just taken too.
  for (const g of groups.values()) g.claims.push(...claims);
  return out;
}

function onWallChange(wall, changes) {
  if (changes && !["ds", "door", "move", "c", "dir"].some(k => k in changes)) return;
  try { cutAcross(wall); }
  catch (err) {
    log?.warnOnce?.("group-cut", "a wall raised mid-walk could not cut the moves crossing it (further errors suppressed)", err);
    feature?.exposed?.tele?.("error", { reason: "cut" });
  }
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
 * The two notices a player sees (0.8.0, Fable's review §4): "No route there" (decision 7: nobody moves) and "Stopped
 * short, way blocked" (a token in the only way, a big token that does not fit, a wait that ran out). What happened
 * exactly is a reason code in the telemetry, not a third notice. The same notice twice within NOTICE_GAP_MS shows once.
 */
const NOTICES = Object.freeze({ noRoute: "PENTARYN_MOVEMENT.notify.noRoute", short: "PENTARYN_MOVEMENT.notify.stoppedShort" });
const NOTICE_GAP_MS = 1000;
const noticeAt = {};
function tell(kind, reason = kind) {
  feature?.exposed?.tele?.("notice", { notice: kind, reason });
  const t = Date.now();
  if (t - (noticeAt[kind] ?? -Infinity) < NOTICE_GAP_MS) return;
  noticeAt[kind] = t;
  try { globalThis.ui?.notifications?.warn?.(NOTICES[kind] ?? NOTICES.short, { localize: true }); }
  catch (err) { log?.debug?.("notice", err); }
}

/**
 * A big token stopped before a gap it does not fit (decision 8): "Stopped short", and the GM hears which token, also
 * when a player dragged it (a whisper).
 */
function tellNarrow(token) {
  tell("short", "tooNarrow");
  if (game.user?.isGM) return;
  try {
    const gms = (game.users?.filter?.(u => u.isGM && u.active) ?? []).map(u => u.id);
    if (!gms.length) return;
    const text = `${token?.document?.name ?? ""}: ${game.i18n.localize(NOTICES.short)}`;
    globalThis.ChatMessage?.create?.({ content: `<p>${foundry.utils.escapeHTML?.(text) ?? text}</p>`, whisper: gms,
      speaker: { alias: "Pentaryn Movement" } });
  } catch (err) { log?.debug?.("narrow: tell the GM", err); }
}

/**
 * Group drop: each big member with no route its body fits that stops short of its spot is told as a single drag is
 * (decision 8; H3-09). The grabbed one stopped short of where it was dropped (a token standing in the only way, or
 * after its queue another move is still in the way): "Stopped short, way blocked".
 */
function tellPlanShort(members, plan, { yielded = false } = {}) {
  for (const id of plan?.excluded ?? []) {
    const m = members.find(x => x.id === id);
    if (!m?.token || ((m.w ?? 1) <= 1 && (m.h ?? 1) <= 1)) continue;
    if (!plan.members?.[id]?.short) continue;
    tellNarrow(m.token);
  }
  if (!plan?.anchorShort) return;
  const a = members.find(m => m.id === plan.anchorId);
  if (a?.token && ((a.w ?? 1) > 1 || (a.h ?? 1) > 1)) tellNarrow(a.token);
  else tell("short", yielded ? "yielded" : "anchorShort");
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
  const rec = { at: new Date().toISOString(), mode: "core", reason: "single", combat: false, members: 1, result: null, ms: null, async: true, cut: 0, replans: 0, waves: 1 };
  last = rec;
  const big = (doc._source.width ?? 1) > 1 || (doc._source.height ?? 1) > 1;
  const coreGoes = !droppedInPlace([c], result);
  // Through the reservations (0.6.0): it waits for, or queues behind, the walks in its way.
  const go = waypoints => singleFlow({ grabbed, result, waypoints, seq, starts, scene, combat: false, rec })
    .catch(err => log.warnOnce?.("single-reserve", "a single drop's reservation failed (further errors suppressed)", err));
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
        tell("noRoute");
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
    try { spot = clearOfWalls(grabbed, end, { taken, snap: inCombat(doc) }); } catch (err) { log.debug?.("single: a clear spot", err); }
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
  // Round them however long (0.5.0: the long way round is never swapped for the way through).
  if (r1?.reached && r1.path?.length >= 2) {
    m.waypoints = r1.path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
    return true;
  }
  // No way round them: core's way (to the spot beside it, the last leg bent to it), walked only as far as it is free
  // of them, and the dragger is told (0.5.0; before, it walked straight through).
  const kept = freeOfOthers(grabbed, origin, wps, others);
  if (!kept.length) return { stay: true };
  m.waypoints = kept;
  return kept.length === wps.length && !kept.short ? true : { short: true };
}

/**
 * While one token is dragged alone (S1R2-01), the circles (pixel centres, { x, y, r }) of the tokens standing
 * outside it that its way keeps out of: the ones its drop goes round (aroundOthers), so that the drag's ruler shows
 * the way it will walk and what it costs (in a fight a player saw 40 ft and was charged 90 ft). Not the ones it
 * starts in, nor the one it is dropped on (the drop takes a clear spot beside that one). null when its drop would not
 * go round them: a group drag, Ctrl waypoints, a planned move, ghost or the unconstrained tool, no others.
 */
function singleAvoid(token, waypoints, options = {}) {
  const doc = token?.document;
  const layer = token?.layer;
  if (!doc?._source || !layer || layer._draggedToken !== token || layer._movementPlanningContext) return null;
  if (!Array.isArray(waypoints) || waypoints.length !== 2) return null;
  const contexts = token.mouseInteractionManager?.interactionData?.contexts ?? {};
  const ids = Object.keys(contexts);
  if (ids.length !== 1 || ids[0] !== doc.id || contexts[ids[0]]?.waypoints?.length) return null;
  if (options?.constrainOptions?.ignoreWalls || feature?.exposed?.ghostFor?.(token)) return null;
  if (waypoints.some(w => (CONFIG.Token?.movement?.actions?.[w?.action]?.walls ?? "move") === null)) return null;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h);
  const others = othersOf([{ id: doc.id, token }], s);
  if (!others.length) return null;
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const a = centre(waypoints[0]), b = centre(waypoints[1]);
  const out = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1 }))
    .filter(o => Math.hypot(a.x - o.x, a.y - o.y) >= o.r && Math.hypot(b.x - o.x, b.y - o.y) >= o.r);
  return out.length ? out : null;
}

/**
 * Core's waypoints for a single token (after `origin`), walked only as far as they are free of the tokens standing
 * outside the move (`others`: circles, squares; 0.5.0). The waypoints, the last one explicit; [] when it cannot move
 * at all; `.short` when they were cut.
 */
function freeOfOthers(token, origin, wps, others) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  // In a fight the squares it walks (S1R2-04), so that it stops on the last whole one before the first token.
  const path = inCombat(doc) ? onSquares([origin, ...wps], s) : [origin, ...wps];
  const pts = path.map(p => toSquares(p, w, h, s));
  const p = freePrefix(pts, radiusOf(w, h), others, { allowed: inCombat(doc) ? c => onCell(c, w, h) : null });
  const out = (p.full ? path : cutPath(path, p.cut, inCombat(doc))).slice(1);
  if (out.length) out[out.length - 1] = { ...out.at(-1), explicit: true, checkpoint: true };
  if (!p.full) out.short = true;
  return out;
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
  const rec = { at: new Date().toISOString(), mode: "core", reason: "single", combat: false, members: 1, result: null, ms: null, async: true, cut: 0, replans: 0, waves: 1 };
  last = rec;
  const s = gridSize(grabbed);
  const go = waypoints => {
    // In a fight a checkpoint at every cell, as every other combat move (S1R1-04).
    const wps = inCombat(doc) ? withCheckpoints(grabbed, [origin, ...waypoints]) : waypoints;
    // Through the reservations (0.6.0): it waits for, or queues behind, the walks in its way.
    return singleFlow({ grabbed, result, waypoints: wps, seq, starts, scene, combat: inCombat(doc), rec })
      .catch(err => log.warnOnce?.("single-reserve", "a single drop's reservation failed (further errors suppressed)", err));
  };
  Promise.resolve(feature.exposed.pathfindRouteToAsync(grabbed, origin, dest, { preview: true, avoid }))
    .then(r => {
      rec.ms = Math.round((now() - t0) * 10) / 10;
      if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { rec.result = "superseded"; return; }
      if (r?.reached && r.path?.length >= 2) {
        rec.result = "round";
        go(r.path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false })));
        return;
      }
      // No way round them: as far as core's way is free of them (0.5.0), and the dragger is told.
      let others = [];
      try { others = othersOf([{ id: doc.id, token: grabbed }], s); } catch (err) { log.debug?.("single: the tokens that stay", err); }
      const kept = freeOfOthers(grabbed, origin, wps, others);
      rec.result = kept.short ? (kept.length ? "short" : "none") : "core";
      if (kept.short) tell(kept.length ? "short" : "noRoute", "standingInTheWay");
      if (kept.length) go(kept);
    })
    .catch(err => log.warnOnce?.("single-around", "a single drop's way round the others failed (further errors suppressed)", err));
  return null;
}

/**
 * A group drop left to core's move (a fight with tier C off, tier B off, too many, ghost...): still held as one group
 * on this client, tagged on its update (GROUP_OPT), so a click on any member stops them all (decision 3), a turn change
 * stops them all, and a door cut stops them all in a fight. Held until its last member should be at rest. Mutates
 * core's options (the tag).
 */
function holdCore(contexts, result, seq) {
  const [updates, options] = result ?? [];
  if (!Array.isArray(updates) || updates.length < 2 || !options) return null;
  const scene = contexts[0]?.token?.document?.parent ?? globalThis.canvas?.scene;
  const gid = foundry.utils.randomID();
  options[GROUP_OPT] = gid;
  const s = gridSize(contexts[0].token);
  let endMs = 0;
  const starts = new Map();
  for (const c of contexts) {
    const doc = c.token.document;
    starts.set(doc.id, { x: doc._source.x, y: doc._source.y });
    const wps = options.movement?.[doc.id]?.waypoints ?? [];
    let L = 0, prev = doc._source;
    for (const p of wps) { L += Math.hypot(p.x - prev.x, p.y - prev.y) / s; prev = p; }
    endMs = Math.max(endMs, (L / (speedOf(c.token) || MOTION.speed)) * 1000);
  }
  const base = { ...options };
  delete base.movement;
  // A fight walks square by square, a round trip each: held up to the move's deadline rather than its walking time.
  const combat = contexts.some(c => inCombat(c.token.document));
  return schedule([], base, updates.map(u => ({ id: u._id })), { scene, seq, starts, gid,
    endMs: combat ? Math.min(Math.max(2 * endMs, 1000), LIFE.deadlineMs) : endMs });
}

/** The wrap's body: core's result in, the drop's result out (null while an async plan runs). */
function onDrop(grabbed, event, result) {
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[1]?.movement) return result;
  const contexts = contextsOf(event).filter(c => c?.token?.document);
  if (!contexts.length) return result;
  let caughtUp = false;
  try { caughtUp = (contexts.length < 2 || !!setting(contexts.some(c => inCombat(c.token.document)) ? "fightGroupDrags" : "groupDrags")) && catchUpDestination(grabbed, event, contexts); } catch (err) { log.debug?.("drop: catch up the destination", err); }
  let noRoute = false;
  const confirmed = {};
  try { noRoute = noteNoRoute(grabbed, contexts, confirmed); } catch (err) { log.debug?.("no-route check", err); }
  if (contexts.length === 1 && noRoute === "none") {
    // Decision 7: a single token with no way there does not move at all.
    tell("noRoute");
    last = { at: new Date().toISOString(), mode: "core", reason: "noRoute", combat: false, members: 1, result: "none", ms: 0, async: false, cut: 0, replans: 0, waves: 0 };
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
    result: null, ms: null, async: false, cut: 0, replans: 0, waves: 0 };
  // Tokens that start stacked stay stacked (0.8.0): the riders walk with their leaders.
  let riders = null;
  try { riders = info.reason === "single" ? null : stacksFor(contexts, grabbed); } catch (err) { log.debug?.("drop: stacked tokens", err); }
  if (riders) last.stacked = riders.size;

  // Dropped where it stands: nobody moves, nothing to plan (live R4-11: it spent 316 ms and fell back on budget).
  if (droppedInPlace(contexts, result, caughtUp)) {
    Object.assign(last, { mode: "core", reason: "still", result: "core", ms: 0 });
    return result;
  }
  if (info.mode === "core") {
    // In a fight too (S1R1-04: a single drag walked straight through three tokens standing in its way, -98 to
    // -100 px; dnd5e lets a creature pass an ally, Joe's rule is that nothing is walked through): round them on the
    // grid, at the cost of the squares walked.
    if (info.reason === "single") {
      let around = false;
      try { around = aroundOthers(grabbed, contexts[0], result); } catch (err) { log.debug?.("single: round the tokens that stay", err); }
      if (around?.later) return aroundLater(grabbed, result, around.later);
      // No way round a token standing in its only way (0.5.0): it stops before it, or does not move at all.
      if (around?.stay || around?.short) {
        tell(around.stay ? "noRoute" : "short", around.stay ? "noRoute" : "standingInTheWay");
        Object.assign(last, { reason: "noRoute", result: around.stay ? "none" : "short", ms: 0 });
        if (around.stay) return null;
        if (info.combat) checkpointAll(contexts, result[1]);
        return singleOut(grabbed, contexts, result, info, seq);
      }
      if (info.combat) checkpointAll(contexts, result[1]);
      last.result = "core";
      // The reserved walks and the tokens walking now (0.6.0): it waits for them, queues, or reserves its own.
      return singleOut(grabbed, contexts, result, info, seq);
    }
    if (info.combat) checkpointAll(contexts, result[1]);
    if (unstackable(info.reason)) unstack(contexts, result, grabbed.document.id, info.combat, riders);
    else carryRiders(riders, result);
    if (contexts.length > 1) {
      feature.exposed.tele?.("plan", { mode: "core", reason: info.reason, members: contexts.length, combat: !!info.combat });
      holdCore(contexts, result, seq);
    }
    last.result = "core";
    return result;
  }
  debugThrow();
  const clock = planClock();
  // A rider grabbed: its leader is the plan's anchor (the stack walks the leader's way).
  const lead = riders?.get(grabbed.document.id)?.leader;
  const anchorToken = lead ? (contexts.find(c => c.token.document.id === lead)?.token ?? grabbed) : grabbed;
  const prep = prepare(anchorToken, contexts, { ...info, clock }, riders);
  if (!prep) { fellBack("noAnchor"); return result; }

  const scene = grabbed.document.parent ?? canvas.scene;
  const starts = new Map(prep.members.map(m => [m.id, { x: m.token.document._source.x, y: m.token.document._source.y }]));
  // Every client learns the group's members from its moves' update options (a click on one stops them all, decision 3).
  for (const c of contexts) starts.set(c.token.document.id, { x: c.token.document._source.x, y: c.token.document._source.y });
  const gid = foundry.utils.randomID();
  const d = { grabbed: anchorToken, contexts, info, result, seq, t0, scene, starts, gid, prep, sync: true, riders,
    attempt: 0, waited: 0, rid: null, rec: last, level: grabbed.document._source?.level,
    run: newRun({ id: gid, now: Date.now(), members: contexts.map(c => c.token.document.id) }) };
  // A hidden member's move is sent apart from the others (FR1-11, send()): never in the batch core sends for the drop.
  const anyHidden = prep.members.some(m => m.token?.document?.hidden);
  const step = anyHidden ? { done: false } : timedSlice(() => clock.run(() => runPlan(prep.gen, GROUP_LIMITS.syncMs, clock.now)));
  if (step.done) return deliver(d, step.value);

  // Async: finish in timer slices, then commit the same shape core would have, for the members
  // nobody moved and this client did not drop again in the meantime.
  last.async = true;
  d.sync = false;
  runAsync(prep, clock, t0, plan => {
    if (!feature || !plan) return;                  // uninstalled while planning: nothing is sent
    safeDeliver(d, plan);
  });
  return null;
}

/**
 * How long the plan's slices held the page (S2R1-02: tokens froze together for 300-870 ms while two groups moved):
 * every slice a drop ran (the synchronous step too), the longest, and those over PERF_LONG_MS. Read in status().group.
 */
const PERF_LONG_MS = 50;
const perf = { slices: 0, maxMs: 0, long: 0, lastLong: null };
function timedSlice(fn) {
  const t = now();
  try { return fn(); } finally {
    const ms = now() - t;
    perf.slices += 1;
    if (ms > perf.maxMs) perf.maxMs = Math.round(ms * 10) / 10;
    if (ms > PERF_LONG_MS) { perf.long += 1; perf.lastLong = { at: new Date().toISOString(), ms: Math.round(ms) }; }
  }
}

/** A finished plan (or a fallback) as update batches, recorded on the drop's status record (`d.rec`). */
function finishFor(d, plan) {
  const { prep, result, contexts, info, grabbed } = d;
  const rec = d.rec;
  rec.ms = Math.round((now() - d.t0) * 10) / 10;
  if (plan?.reason === "anchorNoRoute") {
    // No way for the grabbed token to the drop: nobody moves (H1-12; Joe's decision 7), and the dragger is told.
    fellBack("anchorNoRoute");
    // Where it was dropped (top-left px), so a refusal can be checked against the map (H4-01).
    const dd = prep.anchor?.dest;
    Object.assign(rec, { result: "none", reason: "anchorNoRoute", dest: dd ? { x: Math.round(dd.x), y: Math.round(dd.y) } : null });
    tell("noRoute", "group");
    return { first: [[], { ...result[1], movement: {} }], later: [], base: null };
  }
  if (plan?.result !== "plan") {
    fellBack(plan?.reason ?? "noPlan");
    rec.result = "core";
    rec.reason = plan?.reason ?? "noPlan";
    // A planning throw (live R4-11: status read mode "plan", result null).
    if (plan?.reason === "throw") Object.assign(rec, { mode: "core", waves: 0 });
    if (info.combat) checkpointAll(contexts, result[1]);
    unstack(contexts, result, grabbed.document.id, info.combat, d.riders);
    return { first: result, later: [], base: null };
  }
  rec.result = "plan";
  Object.assign(rec, { cut: plan.cut?.length ?? 0, stayed: plan.stayed?.length ?? 0, replans: plan.replans, constricted: plan.constricted,
    formation: plan.formation, excluded: plan.excluded, short: Object.values(plan.members).filter(e => e.short).map(e => e.id), planMs: plan.ms });
  // A big member with no route its body fits stops short before the gap: told as a single drag is (H3-09); the
  // grabbed one stopped short of its drop by a token in the way: the dragger hears "No route there" (0.5.0).
  try { tellPlanShort(prep.members, plan, { yielded: d.waited > 0 }); } catch (err) { log.debug?.("narrow: a group member", err); }
  const b = batches(plan, prep.members, result, info.combat, d.riders);
  rec.waves = b.later.length + 1;
  feature.exposed.tele?.("plan", { ms: rec.ms, planMs: plan.ms ?? null, members: prep.members.length, combat: !!info.combat, waves: rec.waves,
    cut: rec.cut, stayed: rec.stayed, replans: plan.replans ?? 0 });
  // A plan that moves nobody (every member stays: no free way for any, 0.5.0) is a drop that did not take, and the
  // dragger hears so (FR2-08: "mode plan" and nobody moved, with no notice).
  if (!(b.first?.[0]?.length) && !b.later.length && !plan.anchorShort) {
    rec.result = "none";
    rec.reason = "nobodyMoves";
    tell("noRoute", "group");
  }
  return b;
}

/** The group's tag on its batches (GROUP_OPT). */
function tagFor(d, b) {
  if (d.prep.members.length < 2) return b;
  if (b.first?.[1]) b.first[1] = { ...b.first[1], [GROUP_OPT]: d.gid };
  if (b.base) b.base = { ...b.base, [GROUP_OPT]: d.gid };
  return b;
}

/**
 * A plan's generator run to its end in timer slices (or its budget), then `done(plan)` in the same timer tick (the
 * plan, or a fallback's { result: "core", reason }; null when uninstalled meanwhile).
 */
function runAsync(prep, clock, t0, done) {
  const finish = plan => {
    try { done(plan); } catch (err) { log.warnOnce("group-deliver", "a group drop could not be sent (further errors suppressed)", err); feature?.exposed?.tele?.("error", { reason: "async" }); }
  };
  const tick = () => {
    if (!feature) { finish(null); return; }
    let plan;
    try {
      if (clock.now() > GROUP_LIMITS.totalMs || now() - t0 > GROUP_LIMITS.waitMs) plan = { result: "core", reason: "budget" };
      else {
        const r = timedSlice(() => clock.run(() => runPlan(prep.gen, SLICE_MS, clock.now)));
        if (!r.done) { setTimeout(tick, 0); return; }
        plan = r.value;
      }
    } catch (err) {
      log.warnOnce("group-plan", "group planning failed; the move goes as core's (further errors suppressed)", err);
      feature?.exposed?.tele?.("error", { reason: "plan", message: String(err?.message ?? err).slice(0, 120) });
      plan = { result: "core", reason: "throw" };
    }
    finish(plan);
  };
  setTimeout(tick, 0);
}

/* -------------------------------------------- */
/*  Reservations (0.6.0, stage 2)               */
/* -------------------------------------------- */

/**
 * Publish a reservation ahead of its move (0.6.0): an empty update of `doc` (one this user owns) carrying it, with
 * `diff: false` as core's own stop / resume relays, so it goes through the server's order and comes back here before
 * the update resolves. Resolves to { seq } (where it arrived here, in that order), or null when it did not come back
 * within RESERVE.echoMs or the update failed (the caller then commits after RESERVE.commitMs: the commit fallback).
 */
function publish(doc, wire) {
  reserve.note("published");
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    const timer = setTimeout(() => { reserve.note("fallback"); finish(null); }, RESERVE.echoMs);
    let p;
    try { p = Promise.resolve(doc.update({}, { diff: false, [reserve.PLAN_OPT]: wire })); }
    catch (err) { p = Promise.reject(err); }
    p.then(() => {
      clearTimeout(timer);
      const seq = reserve.seqOf(wire.rid);
      if (seq === null) reserve.note("fallback");
      finish(seq === null ? null : { seq });
    }, err => {
      clearTimeout(timer);
      log?.debug?.("reservation: publish", err);
      reserve.note("fallback");
      finish(null);
    });
  });
}

/**
 * A repair's move (a door cut's walk to its square) re-publishes (0.6.0): a one-token reservation riding the move
 * itself (it sets off now). `from`, `waypoints`: top-left pixels. The options to add ({} for a hidden token).
 */
function republish(doc, from, waypoints) {
  try {
    const token = doc?.object;
    if (!token || !waypoints?.length || doc.hidden) return {};
    const s = gridSize(token);
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const points = [from, ...waypoints].map(p => toSquares(p, w, h, s));
    const wire = reserve.wireFor(doc.parent, [{ id: doc.id, r: radiusOf(w, h), speed: speedOf(token), delay: 0, points }],
      { combat: inCombat(doc), level: doc._source.level });
    if (!wire) return {};
    reserve.note("republished");
    return reserve.optionsFor(wire);
  } catch (err) {
    log?.debug?.("reservation: republish", err);
    return {};
  }
}

/** A plan's walks as reserved: { id, r, speed, delay, points } (centres, squares; the walk as cut). */
function walksOf(prep, plan) {
  const out = [];
  // In the plan's own order (its timing pass: the members fixed first come first), so a member's place in the wire
  // is its place in the plan, which the runtime guard reads as who goes first within it (0.7.0).
  const byId = new Map(prep.members.map(m => [m.id, m]));
  const ids = [...Object.keys(plan.members ?? {}).filter(id => byId.has(id)), ...prep.members.map(m => m.id).filter(id => !(id in (plan.members ?? {})))];
  for (const m of ids.map(id => byId.get(id))) {
    const e = plan.members?.[m.id];
    if (!e || e.core || !(e.points?.length >= 2)) continue;
    out.push({ id: m.id, r: m.r, w: m.w, h: m.h, speed: m.speed, delay: e.delay ?? 0, points: e.points });
  }
  return out;
}

/** Every walk this client reads for `members` now: tokens drawn walking, and the reservations it has. */
function walkersNow(members, s) {
  let walking = [];
  try { walking = movingOthers(members, s); } catch (err) { log?.debug?.("tokens walking now", err); }
  let live = { walkers: [] };
  try { live = reserve.liveFor(members, { skip: new Set(walking.map(w => w.id)) }); } catch (err) { log?.debug?.("reservations", err); }
  return [...walking, ...live.walkers];
}

/**
 * Does the drop queue (a later plan waits at its start for a reserved walk in its way to pass, rather than stop short
 * of it)? Its members cut short, left standing or stopped short: their full ways against every walk read now. The
 * wait (ms), or null.
 */
function queueFor(d, plan) {
  const { prep } = d;
  const ids = new Set([...(plan.cut ?? []), ...(plan.stayed ?? []), ...Object.values(plan.members ?? {}).filter(e => e.short).map(e => e.id)]);
  if (!ids.size) return null;
  const s = gridSize(d.grabbed);
  const blamed = new Set(Object.values(plan.members ?? {}).filter(e => ids.has(e.id)).flatMap(e => e.walks ?? []));
  const full = [];
  for (const m of prep.members) {
    const e = plan.members?.[m.id];
    if (!ids.has(m.id) || !e?.data?.path?.length) continue;
    const path = d.info.combat ? onSquares(e.data.path, s) : e.data.path;
    full.push({ points: path.map(p => toSquares(p, m.w, m.h, s)), r: m.r, speed: m.speed, delay: e.delay ?? 0 });
  }
  if (!full.length && !blamed.size) return null;
  return queueUntil(full, walkersNow(prep.members, s), { combat: d.info.combat, blamed });
}

/** Wait `ms` on a timer this client holds (nothing when uninstalled meanwhile). */
const wait = ms => new Promise(resolve => setTimeout(resolve, Math.max(ms, 0)));

/** Batches with `extra` options on the first wave and the later ones. */
function withOptions(b, extra) {
  if (b.first?.[1]) b.first[1] = { ...b.first[1], ...extra };
  if (b.base) b.base = { ...b.base, ...extra };
  return b;
}

/** Are the drop's members still where it found them, and not dropped again since? */
const stillMine = d => stillOurs(d.prep.members.map(m => m.id), d.scene, d.starts, d.seq).length > 0;

/** Send a drop's batches: the first wave (returned to core when the drop is still synchronous) and the later waves. */
function commit(d, b) {
  if (d.info.combat && d.info.mode === "plan" && b.base) return commitFight(d, b);
  const hold = { scene: d.scene, seq: d.seq, starts: d.starts, endMs: b.endMs ?? 0, gid: d.gid, run: d.run };
  // The riders are members of the group too (a click on one stops them all), though the plan never saw them.
  const members = [...d.prep.members, ...[...(d.riders ?? new Map()).keys()].map(id => ({ id }))];
  // The first wave walks from now: a flush on a background tab (flushIfHidden, flushGroups) keeps clear of it (SIM-05).
  const firstWave = { ids: b.first[0].map(u => u._id), movement: b.first[1]?.movement ?? {} };
  if (d.sync) {
    const g0 = schedule(b.later, b.base, members, hold);
    flushIfHidden(g0, firstWave);
    if (!b.later.length) lifeStep(d.run, "walking", { now: Date.now() });
    return b.first[0].length ? b.first : null;
  }
  const [updates, options] = b.first;
  const sent = updates.length ? send(d.scene, d.seq, d.starts, updates, options, "move") : null;
  const g = schedule(b.later, b.base, members, hold);
  flushIfHidden(g, firstWave);
  if (!g) lifeStep(d.run, "walking", { now: Date.now() });
  // A click while the first wave was on its way stopped the group: that wave stops too (H3-05).
  sent?.then?.(() => { if (g?.stopped) lateStop(d.scene, updates.map(u => u._id)); });
  return null;
}

/**
 * A fight's group move, tier C (0.8.0, sequence-core; Joe's decision 2026-11-23): space, not time. Members whose swept
 * corridors never meet set off together; every other member sets off on the ARRIVAL of each member before it whose
 * corridor meets its own (its move finished and drawn at rest here: core's movement promise, then the animation).
 * Where no order is safe the walk stops short (cutsFor). A member still waiting at the run's deadline stays where it
 * is ("Stopped short, way blocked"). A click on any member, a turn change or a door cut stops the group (groupCancel):
 * nothing still waiting is sent. Returns the members that set off at once for core (a synchronous drop) or null.
 */
function commitFight(d, b) {
  const movement = { ...b.first[1].movement };
  for (const w of b.later) Object.assign(movement, w.movement);
  const updates = [...b.first[0], ...b.later.flatMap(w => w.updates)];
  const s = gridSize(d.grabbed);
  const byId = new Map(d.prep.members.map(m => [m.id, m]));
  const order = walksOrder(d.prep, d.plan);
  const walks = [];
  for (const m of order) {
    const mv = movement[m.id];
    if (!mv?.waypoints?.length) continue;
    walks.push({ id: m.id, r: m.r, points: [m.token.document._source, ...mv.waypoints].map(p => toSquares(p, m.w, m.h, s)) });
  }
  const seqr = sequence(walks);
  const cuts = {};
  cutsFor(walks, seqr, (points, r, circles, id) => {
    const m = byId.get(id);
    const p = freePrefix(points, r, circles, { allowed: c => onCell(c, m?.w ?? 1, m?.h ?? 1) });
    if (!p.full) cuts[id] = p.cut;
    return p.points;
  });
  for (const [id, cut] of Object.entries(cuts)) {
    const m = byId.get(id);
    const path = cutPath([{ ...m.token.document._source }, ...movement[id].waypoints], cut, true);
    feature.exposed.tele?.("cut", { reason: "noSafeOrder", id });
    if (path.length < 2) { delete movement[id]; continue; }
    const wps = path.slice(1);
    wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
    movement[id] = { ...movement[id], waypoints: wps };
  }
  // Riders go with their leaders (the same batch).
  const ridersOf = id => [...(d.riders ?? [])].filter(([, r]) => r.leader === id).map(([rid]) => rid);
  if (d.riders?.size) carryRiders(d.riders, [[], { movement }]);
  const g = { ids: new Set(d.prep.members.map(m => m.id)), timers: [], stopped: false, claims: [], avoid: [], pinned: new Set(), scene: d.scene,
    run: d.run, pending: new Set(), sent: [], base: b.base, seq: d.seq, starts: d.starts, gid: d.gid, fight: seqr };
  for (const [rid] of d.riders ?? []) g.ids.add(rid);
  groups.set(d.gid, g);
  for (const id of g.ids) groupOf.set(id, d.gid);
  lifeStep(d.run, "walking", { now: Date.now() });
  const arrived = new Set();
  const sentIds = new Set();
  const batchOf = ids => {
    const list = ids.flatMap(id => [id, ...ridersOf(id)]).filter(id => movement[id]);
    return [list.map(id => updates.find(u => u._id === id) ?? { _id: id }), { ...b.base, movement: Object.fromEntries(list.map(id => [id, movement[id]])) }];
  };
  const finish = () => {
    if (groups.get(d.gid) !== g) return;
    if (seqr.order.every(id => arrived.has(id) || !movement[id])) {
      lifeStep(d.run, g.stopped ? "stopped" : "rested", { now: Date.now() });
      forget(d.gid);
    }
  };
  const watchArrival = id => {
    arrivalOf(d.scene.tokens?.get?.(id))
      .catch(err => log?.debug?.("fight: arrival", err))
      .finally(() => { arrived.add(id); hideCue(id); pump(); });
  };
  const go = ids => {
    for (const id of ids) sentIds.add(id);
    const [ups, opts] = batchOf(ids);
    if (!ups.length) { for (const id of ids) arrived.add(id); pump(); return null; }
    feature.exposed.tele?.("wave", { reason: "fight", members: ups.length });
    return send(d.scene, d.seq, d.starts, ups, opts, "move").then(() => {
      if (g.stopped) lateStop(d.scene, ups.map(u => u._id));
      for (const id of ids) watchArrival(id);
    });
  };
  // A member's start is vetted when it sets off, not at the plan (0.8.1, the simulator SIM-02 / SIM-03): it sets off
  // seconds after the drop, on another's arrival, and the plan's start delays (which kept its members off the walks
  // outside the group) are not used here. A walk outside the group in its way now (another drop at the same moment)
  // holds it until that walk has passed, within the run's deadline ("wait"); a token that has come to rest in its way
  // since the plan, or a member resting short of its spot, cuts its walk before that token, on a whole square, or
  // keeps it where it stands ("stay"). Reads only, but `movement`.
  const vet = id => {
    const doc = d.scene.tokens?.get?.(id);
    const token = doc?.object;
    const m = byId.get(id);
    if (!token || !m || !movement[id]?.waypoints?.length) return "go";
    const mates = new Set([id, ...ridersOf(id)]);
    try {
      const walkers = walkersNow([...g.ids].map(x => ({ id: x, token: d.scene.tokens?.get?.(x)?.object })).filter(x => x.token), s);
      if (walkers.length) {
        const pts = onSquares([{ ...doc._source }, ...movement[id].waypoints], s).map(p => toSquares(p, m.w, m.h, s));
        if (walkersMeet([{ points: pts, r: m.r, speed: m.speed, delay: 0 }], walkers, { combat: true })) return "wait";
      }
    } catch (err) { log?.debug?.("fight: the walks in a member's way", err); }
    let others = [];
    try { others = othersOf([...mates].map(x => ({ id: x, token: d.scene.tokens?.get?.(x)?.object })).filter(x => x.token), s); }
    catch (err) { log?.debug?.("fight: the tokens standing in a member's way", err); }
    const wps = freeOfOthers(token, { ...doc._source }, movement[id].waypoints, others);
    if (!wps.short) return "go";
    feature.exposed.tele?.("cut", { reason: "fightStanding", id });
    if (!wps.length) { delete movement[id]; return "stay"; }
    movement[id] = { ...movement[id], waypoints: wps };
    return "go";
  };
  const pump = () => {
    if (g.stopped || groups.get(d.gid) !== g) return;
    const ready = seqr.order.filter(id => !sentIds.has(id) && movement[id] && (seqr.after[id] ?? []).every(x => arrived.has(x)));
    const going = [];
    let held = false;
    for (const id of ready) {
      let v = "go";
      try { v = vet(id); } catch (err) { log?.debug?.("fight: vet a member's start", err); }
      if (v === "wait") { held = true; showCue(id, "foreign"); continue; }
      if (v === "stay") { sentIds.add(id); arrived.add(id); hideCue(id); continue; }
      going.push(id);
    }
    if (going.length) go(going);
    if (held && !g.retry && !expired(d.run, Date.now())) {
      g.retry = setTimeout(() => { g.retry = null; pump(); }, Math.max(capped(d.run, Date.now(), FOREIGN_WAIT_MS), 1));
      g.timers.push(g.retry);
    }
    finish();
  };
  // The one deadline: whoever still waits stays where it is.
  g.timers.push(setTimeout(() => {
    if (groups.get(d.gid) !== g) return;
    const left = seqr.order.filter(id => !sentIds.has(id) && movement[id]);
    if (left.length) { feature.exposed.tele?.("wave", { reason: "deadline", members: left.length }); tell("short", "fightDeadline"); }
    for (const id of left) hideCue(id);
    lifeStep(d.run, "rested", { now: Date.now(), why: "deadline" });
    forget(d.gid);
  }, Math.max(lifeLeft(d.run, Date.now()), 1)));
  for (const id of seqr.order) if (!seqr.together.includes(id) && movement[id]) showCue(id, "after");
  // Sent here, never returned to core: an arrival is watched on the move this client's own update started.
  d.sync = false;
  pump();
  return null;
}

/** token id → resolvers waiting for its move to end (moveToken / stopToken, arrivalOf). */
const arrivals = new Map();

/**
 * Resolves when `doc`'s current move (this client's own) has ended and is drawn at rest here: core's movement promise
 * (`movement.finished`) when it has one, else the moveToken / stopToken that ends it; then the token's movement
 * animation. At once when it is not moving. An event, never a clock: the run's deadline bounds the wait.
 */
function arrivalOf(doc) {
  const m = doc?.movement;
  const live = m?.user?.isSelf && m.state !== "completed" && m.state !== "stopped";
  if (!live) return Promise.resolve(doc?.object?.movementAnimationPromise ?? null);
  const ended = typeof m.finished?.then === "function" ? m.finished
    : new Promise(resolve => { if (!arrivals.has(doc.id)) arrivals.set(doc.id, new Set()); arrivals.get(doc.id).add(resolve); });
  return Promise.resolve(ended).then(() => doc.object?.movementAnimationPromise ?? null);
}

/** moveToken / stopToken, every client: a move of a token someone waits on that has now ended resolves them. */
function onArrival(doc) {
  const set = doc?.id ? arrivals.get(doc.id) : null;
  if (!set) return;
  const st = doc.movement?.state;
  if (st && st !== "completed" && st !== "stopped") return;
  arrivals.delete(doc.id);
  for (const fn of set) { try { fn(); } catch (err) { log?.debug?.("arrival", err); } }
}

/** The plan's members in its own order (walksOf's: the timing pass's order first, then the rest). */
function walksOrder(prep, plan) {
  const ids = Object.keys(plan?.members ?? {});
  return [...ids.map(id => prep.members.find(m => m.id === id)).filter(Boolean), ...prep.members.filter(m => !ids.includes(m.id))];
}

/**
 * A planned group drop's way out (0.6.0): it queues when a reserved walk is in the way of a member it would cut
 * short; else it reserves its walks. Alone on the table the reservation rides the first wave itself; with another
 * client that could be planning at the same moment it is published first, and the move follows at its echo: a
 * reservation that came back before it (earlier in the server's order) and that this plan had not read, when the
 * two meet, makes this plan the later one: it is made again, round it (RESERVE.replans times at most). Returns the
 * first wave for core (synchronous, nothing to wait for) or null.
 */
function deliver(d, plan) {
  d.plan = plan;
  if (globalThis.CONFIG?.debug?.[`${MODULE}.throwDeliver`]) throw new Error("debug: forced delivery throw");
  if (plan?.result !== "plan" || plan.straight) return commit(d, tagFor(d, finishFor(d, plan)));
  // Before its batches (and its notices): a drop that queues is planned again, and tells then. It queues again while
  // a walk is still in its way when the queue is over (S2R1-01), as long as the run's one deadline allows (0.8.0: the
  // queue is part of the 10 s, never on top of it).
  if (lifeLeft(d.run, Date.now()) >= MOTION.delayStep) {
    let until = null;
    try { until = queueFor(d, plan); } catch (err) { log.debug?.("queue: the walks in the way", err); }
    until = queueNext(d.waited, until);
    if (until !== null) until = capped(d.run, Date.now(), until);
    if (until !== null && until >= MOTION.delayStep) {
      d.waited += until;
      reserve.note("queued");
      feature.exposed.tele?.("queue", { reason: "plan", ms: Math.round(until), members: d.prep.members.length });
      Object.assign(d.rec, { result: "queued", queued: Math.round(d.waited) });
      if (d.sync) d.sync = false;
      lifeStep(d.run, "queued", { now: Date.now(), why: "walksInTheWay" });
      for (const m of d.prep.members) showCue(m.id, "queued");
      setTimeout(() => { for (const m of d.prep.members) hideCue(m.id); replan(d); }, until);
      return null;
    }
  }
  // A member the plan would set off after the run's deadline stays where it stands (SIM-01, 0.8.1): its wave would
  // never be sent, while its reservation and the run stayed open for it.
  const late = stayPastDeadline(plan, lifeLeft(d.run, Date.now()));
  if (late.late.length) {
    plan = late.plan;
    d.plan = plan;
    feature.exposed.tele?.("wave", { reason: "pastDeadline", members: late.late.length });
    tell("short", "pastDeadline");
  }
  const b = tagFor(d, finishFor(d, plan));
  const walks = walksOf(d.prep, plan);
  const wire = reserve.wireFor(d.scene, walks, { combat: d.info.combat, replaces: d.rid, level: d.level });
  if (!wire) return commit(d, b);
  d.rid = wire.rid;
  d.rec.reserved = walks.length;
  if (!reserve.racers(d.scene)) {
    reserve.note("inline");
    // The plan rides the first wave (every wave when the first is empty: a receiver records it once); every wave names it.
    const names = reserve.optionsFor(wire, { inline: false });
    if (b.first?.[0]?.length) {
      withOptions(b, names);
      b.first[1] = { ...b.first[1], ...reserve.optionsFor(wire) };
      return commit(d, b);
    }
    return commit(d, withOptions(b, reserve.optionsFor(wire)));
  }
  d.sync = false;
  // Published on a member every client may see (FR1-11: never in the frame of a hidden grabbed token's update).
  const pubDoc = d.grabbed.document.hidden ? (d.scene.tokens?.get?.(wire.members?.[0]?.id) ?? d.grabbed.document) : d.grabbed.document;
  publish(pubDoc, wire)
    .then(echo => (echo ? echo : wait(RESERVE.commitMs).then(() => null)))
    .then(echo => {
      if (!feature) return;
      if (!stillMine(d)) { d.rec.result = "superseded"; return; }
      const theirs = reserve.raceWindow(d.prep.members, d.prep.snap, echo?.seq ?? Infinity).filter(w => w.rid !== wire.rid);
      if (theirs.length && d.attempt < RESERVE.replans && lostRace(walks, theirs, { combat: d.info.combat })) {
        d.attempt += 1;
        d.rec.raced = d.attempt;
        reserve.note("raced");
        reserve.noteRace({ members: walks.length, against: theirs.length, attempt: d.attempt, single: false });
        feature.exposed.tele?.("lostRace", { members: walks.length, against: theirs.length, attempt: d.attempt });
        replan(d);
        return;
      }
      // Its echo read: the plan is already where every client has it. Without an echo it rides the move as well.
      d.committed = true;
      commit(d, withOptions(b, reserve.optionsFor(wire, { inline: !echo })));
    })
    .catch(err => {
      log.warnOnce("group-reserve", "a group's reservation could not be published (further errors suppressed)", err);
      // The drop still takes, without its reservation (FR2-08: a drag that went nowhere, and nobody was told).
      if (!feature || d.committed || !stillMine(d)) return;
      d.committed = true;
      d.rec.result = "unreserved";
      try { commit(d, b); } catch (err2) { log.debug?.("a group's drop without its reservation", err2); failOpen(d, "deliver"); }
    });
  return null;
}

/** deliver(), failing open (0.8.0): an exception on the way sends core's move with its hard-obstacle cuts. */
function safeDeliver(d, plan) {
  try { return deliver(d, plan); }
  catch (err) {
    log.warnOnce("group-deliver", "a group drop could not be sent as planned; it goes as core's (further errors suppressed)", err);
    feature?.exposed?.tele?.("error", { reason: "deliver", message: String(err?.message ?? err).slice(0, 120) });
    failOpen(d, "deliver");
    return null;
  }
}

/**
 * Fail open (0.8.0, Fable's review §4): a drop whose plan or delivery threw goes as core's move after all, every
 * member's path cut before the first token standing in it (unstack), for the members still where the drop found them
 * and not dropped again. Logged and counted (the circuit breaker reads it). Never throws.
 */
function failOpen(d, why = "error") {
  try {
    if (!feature || d.failedOpen) return;
    d.failedOpen = true;
    fellBack(why);
    lifeStep(d.run, "fallback", { now: Date.now(), why });
    Object.assign(d.rec ?? {}, { result: "core", reason: why });
    const result = [[...(d.result?.[0] ?? [])], { ...(d.result?.[1] ?? {}), movement: { ...(d.result?.[1]?.movement ?? {}) } }];
    if (d.info?.combat) checkpointAll(d.contexts, result[1]);
    unstack(d.contexts, result, d.grabbed.document.id, !!d.info?.combat, d.riders);
    for (const m of d.prep?.members ?? []) hideCue(m.id);
    if (result[0].length) send(d.scene, d.seq, d.starts, result[0], result[1], "move").catch(err => log?.debug?.("fail open: send", err));
  } catch (err) { log?.debug?.("fail open", err); }
}

/** The drop planned again (after a race lost, or once its queue is over): read what is reserved now, plan, deliver. */
function replan(d) {
  if (!feature || !stillMine(d)) return;
  reserve.note("replans");
  const clock = planClock();
  let prep = null;
  try { prep = prepare(d.grabbed, d.contexts, { ...d.info, clock }, d.riders); } catch (err) { log.debug?.("re-plan: prepare", err); }
  if (!prep) { failOpen(d, "replan"); return; }
  d.prep = prep;
  d.sync = false;
  lifeStep(d.run, "planning", { now: Date.now(), why: "replan" });
  runAsync(prep, clock, now(), plan => {
    if (!feature || !plan || !stillMine(d)) return;
    safeDeliver(d, plan);
  });
}

/**
 * A single token's walk (`waypoints` after its origin, top-left pixels) against the walks this client reads: the
 * member record, the walkers and the timing (reserve-core singleTiming).
 */
function singleRead(grabbed, waypoints, combat) {
  const doc = grabbed.document;
  const s = gridSize(grabbed);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const path = combat ? onSquares([origin, ...waypoints], s) : [origin, ...waypoints];
  const member = { id: doc.id, r: radiusOf(w, h), w, h, speed: speedOf(grabbed), points: path.map(p => toSquares(p, w, h, s)), delay: 0 };
  const snap = reserve.seqNow();
  const walkers = walkersNow([{ id: doc.id, token: grabbed }], s);
  return { member, walkers, path, snap, timing: singleTiming(member, walkers, { combat }) };
}

/**
 * A single drop (0.6.0): it reads the reserved walks and the tokens walking now, and sets off with the smallest start
 * delay that meets none of them; with none, it queues until they are past, then goes as far as it is free of them.
 * Alone on the table with nothing to wait for, its reservation rides the move (returned to core now); otherwise it
 * goes by singleFlow. Returns core's result or null.
 */
function singleOut(grabbed, contexts, result, info, seq) {
  const doc = grabbed.document;
  const c = contexts[0];
  const m = result?.[1]?.movement?.[doc.id];
  if (!m?.waypoints?.length || m.planned || c?.waypoints?.length || grabbed.layer?._movementPlanningContext) return result;
  if (result[1].constrainOptions?.ignoreWalls || feature.exposed.ghostFor?.(grabbed)) return result;
  let read = null;
  try { read = singleRead(grabbed, m.waypoints, info.combat); } catch (err) { log.debug?.("single: the walks in its way", err); return result; }
  const scene = doc.parent ?? canvas.scene;
  if (read.timing.delay === 0 && !reserve.racers(scene)) {
    const wire = reserve.wireFor(scene, [read.member], { combat: info.combat, level: doc._source.level });
    if (wire) { Object.assign(result[1], reserve.optionsFor(wire)); reserve.note("inline"); }
    return result;
  }
  const starts = new Map([[doc.id, { x: doc._source.x, y: doc._source.y }]]);
  singleFlow({ grabbed, result, waypoints: m.waypoints, seq, starts, scene, combat: info.combat, rec: last, first: read })
    .catch(err => log.warnOnce("single-reserve", "a single drop's reservation failed (further errors suppressed)", err));
  return null;
}


/** How often a hidden token's single drop steps aside at most, and how long it waits between looks while it queues. */
const ASIDE_TRIES = 3;
const ASIDE_LOOK_MS = 500;

/**
 * S2R2-03 (the design's visibility rule: "a player's token never yields to something unseen; the GM-side mover yields
 * instead"). A hidden token the GM drags that has to wait at its start (a start delay, or a queue) where another
 * move's walk will pass through it steps aside first: to the nearest free spot no walk this client reads passes
 * through, a short straight walk clear of walls, on open floor (not in a doorway), clear of every token at rest and of
 * the reserved walks' ends. The players' planners cannot see it, so they plan through it: it must not stand there.
 * Out of combat only (in a fight a step costs movement). Then its way to the drop point is found again from there.
 * Returns { waypoints, at } (the new way, top-left pixels, and where it now stands), { stop: true } when it stepped
 * aside but has no way on from there, or null (not needed, or nowhere to go).
 */
async function stepAside(ctx, read, waypoints) {
  const { grabbed, scene, combat } = ctx;
  const doc = grabbed.document;
  if (combat || !doc.hidden || !game.user?.isGM) return null;
  const s = gridSize(grabbed);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h);
  const here = toSquares(doc._source, w, h, s);
  if (throughStanding(here, r, read.walkers) === null) return null;
  const taken = takenFor(scene, doc.id, []);
  const member = { token: grabbed, r };
  const z = doc._source.elevation ?? 0;
  const px = c => ({ x: c.x * s, y: c.y * s, elevation: z });
  const blocked = (a, b) => { try { return !!grabbed.checkCollision(px(b), { origin: px(a), type: "move", mode: "any" }); } catch { return true; } };
  // The tokens standing outside it (S2R3-01: hard obstacles, for its step and for its way on), not one it starts in.
  let others = [];
  try { others = othersOf([{ id: doc.id, token: grabbed }], s); } catch (err) { log.debug?.("aside: the tokens that stay", err); }
  const standing = others.filter(o => Math.hypot(here.x - o.x, here.y - o.y) >= o.r + r - 1e-3);
  const through = (a, b) => standing.some(o => segDist(o, a, b) < o.r + r - 1e-3);
  const cands = hexCandidates(here, 0.5, 8).filter(c => Math.hypot(c.x - here.x, c.y - here.y) > 1e-6)
    .sort((a, b) => Math.hypot(a.x - here.x, a.y - here.y) - Math.hypot(b.x - here.x, b.y - here.y));
  let spot = null;
  for (const c of cands) {
    const tl = toTopLeft(c, w, h, s);
    if (taken(tl) || !restWalkable(member, c, s) || !roomyAt(grabbed, px(c), r, s) || blocked(here, c) || through(here, c)) continue;
    if (throughStanding(c, r, read.walkers) !== null) continue;
    spot = tl;
    break;
  }
  if (!spot) return null;
  const from = { ...(feature.exposed.pathfindOrigin?.(doc) ?? doc._source) };
  try {
    await doc.move([{ ...from, x: spot.x, y: spot.y, snapped: false, explicit: true, checkpoint: true }], { method: "api" });
  } catch (err) { log.debug?.("aside: the step", err); return null; }
  reserve.note("aside");
  const at = { x: doc._source.x, y: doc._source.y };
  const dest = waypoints?.at(-1);
  if (!dest) return { stop: true, at };
  const origin = { ...(feature.exposed.pathfindOrigin?.(doc) ?? doc._source), x: at.x, y: at.y };
  const target = { ...origin, ...dest, explicit: true, checkpoint: true };
  // S2R3-01: its way on goes round the tokens standing outside it (live: drawn through standing Hero 5, -60 px),
  // however long, searched in slices; with no way round, core's way as far as it meets none of them.
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const a0 = centre(origin), b0 = centre(target);
  const avoid = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1 }))
    .filter(o => Math.hypot(a0.x - o.x, a0.y - o.y) >= o.r && Math.hypot(b0.x - o.x, b0.y - o.y) >= o.r);
  const opts = { preview: true, avoid: avoid.length ? avoid : null, maxMs: 4 * SINGLE_MS };
  let r1 = null;
  try {
    r1 = typeof feature.exposed.pathfindRouteToAsync === "function"
      ? await feature.exposed.pathfindRouteToAsync(grabbed, origin, target, opts)
      : feature.exposed.pathfindRouteTo?.(grabbed, origin, target, opts);
  } catch (err) { log.debug?.("aside: the way on", err); }
  if (!feature) return { stop: true, at };
  if (r1?.reached && r1.path?.length >= 2) {
    const wps = r1.path.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
    return { waypoints: wps, at };
  }
  let plain = null;
  try { plain = feature.exposed.pathfindRouteTo?.(grabbed, origin, target, { preview: true, maxMs: SINGLE_MS }); } catch (err) { log.debug?.("aside: the plain way on", err); }
  if (!(plain?.path?.length >= 2)) return { stop: true, at };
  const kept = freeOfOthers(grabbed, origin, plain.path.slice(1), others);
  if (!kept.length) return { stop: true, at };
  return { waypoints: kept, at };
}

/**
 * A single drop that waits, queues or publishes first (0.6.0). Each round reads the walks anew; a race lost at the
 * echo (a reservation earlier in the server's order that it had not read and that it meets) goes round again, at most
 * RESERVE.replans times. It queues while a walk is in its way, RESERVE.queueMs in all (S2R1-03: one queue, then it
 * gave up while the group was still filing past); after that, the walk goes as far as it meets nothing (on a whole
 * square in a fight), or not at all, with a quiet notice that says which. Nothing is sent when the token was moved or
 * dropped again meanwhile.
 */
async function singleFlow(ctx) {
  const { grabbed, result, seq, starts, scene, combat, rec } = ctx;
  const doc = grabbed.document;
  const base = result[1].movement?.[doc.id] ?? { planned: false };
  const updates = result[0].length ? result[0] : [{ _id: doc.id }];
  let waypoints = ctx.waypoints;
  let read = ctx.first ?? null;
  let waited = 0, races = 0, replaces = null, asides = 0;
  // One deadline for the whole drop (0.8.0): its start delay, its queues and its races all fit in it.
  const run = newRun({ id: doc.id, now: Date.now(), members: [doc.id] });
  // A hidden token of the GM's looks again every ASIDE_LOOK_MS while it queues (a walk reserved meanwhile through it).
  const looks = doc.hidden && game.user?.isGM && !combat;
  const rounds = RESERVE.replans + 2 + Math.ceil(RESERVE.queueMs / (looks ? Math.min(MOTION.delayStep, ASIDE_LOOK_MS) : MOTION.delayStep)) + ASIDE_TRIES;
  for (let round = 0; round <= rounds; round++) {
    if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { if (rec) rec.result = "superseded"; return; }
    read ??= singleRead(grabbed, waypoints, combat);
    let delay = read.timing.delay;
    if (delay !== null && delay > lifeLeft(run, Date.now())) delay = null;
    // S2R2-03: it waits where a walk passes that cannot see it (a hidden token): it steps aside first.
    if ((delay === null || delay > 0) && looks && asides < ASIDE_TRIES) {
      let aside = null;
      try { aside = await stepAside(ctx, read, waypoints); } catch (err) { log.debug?.("aside", err); }
      if (aside) {
        asides += 1;
        starts.set(doc.id, aside.at);
        if (rec) rec.aside = asides;
        if (aside.stop) { if (rec) Object.assign(rec, { result: "aside", reason: "yielded" }); return; }
        waypoints = aside.waypoints;
        read = null;
        continue;
      }
    }
    if (delay === null) {
      let until = queueNext(waited, read.timing.until);
      if (until !== null) until = capped(run, Date.now(), until);
      if (until !== null && until >= MOTION.delayStep) {
        const pause = looks ? Math.min(until, ASIDE_LOOK_MS) : until;
        waited += pause;
        reserve.note("queued");
        feature.exposed.tele?.("queue", { reason: "single", ms: Math.round(pause) });
        lifeStep(run, "queued", { now: Date.now() });
        if (rec) rec.queued = Math.round(waited);
        showCue(doc.id, "queued");
        await wait(pause);
        hideCue(doc.id);
        read = null;
        continue;
      }
      // Queued once already: as far as it meets nothing, then it stands (a whole square in a fight).
      const cut = singleCut(read.member, read.walkers, { combat });
      if (cut.still) {
        if (rec) Object.assign(rec, { result: "stay", reason: "yielded" });
        tell("short", "yieldedStay");
        return;
      }
      let path = cutPath(read.path, cut.cut, combat);
      if (path.length < 2) return;
      let wps = path.slice(1);
      wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
      if (combat) wps = withCheckpoints(grabbed, path);
      waypoints = wps;
      if (rec) Object.assign(rec, { result: "short", reason: "yielded" });
      tell("short", "yielded");
      read = singleRead(grabbed, waypoints, combat);
      delay = 0;
    }
    const racing = reserve.racers(scene);
    const wire = reserve.wireFor(scene, [{ ...read.member, delay: racing ? delay : 0 }], { combat, replaces, level: doc._source.level });
    let echo = null;
    if (racing && wire) {
      echo = await publish(doc, wire);
      if (!echo) await wait(RESERVE.commitMs);
      if (!feature) return;
      const theirs = reserve.raceWindow([{ id: doc.id, token: grabbed }], read.snap, echo?.seq ?? Infinity).filter(w => w.rid !== wire.rid);
      if (theirs.length && races < RESERVE.replans && lostRace([{ ...read.member, delay }], theirs, { combat })) {
        races += 1;
        replaces = wire.rid;
        reserve.note("raced");
        reserve.noteRace({ members: 1, against: theirs.length, attempt: races, single: true });
        feature.exposed.tele?.("lostRace", { members: 1, against: theirs.length, attempt: races });
        if (rec) rec.raced = races;
        read = null;
        continue;
      }
    }
    if (delay > 0) {
      if (rec) rec.delay = delay;
      showCue(doc.id, "delay");
      await wait(delay);
      hideCue(doc.id);
    }
    lifeStep(run, "walking", { now: Date.now() });
    if (!feature || !stillOurs([doc.id], scene, starts, seq).length) return;
    // Published and read back: every client has the plan; else (alone, or no echo) it rides the move.
    const inline = !(racing && echo);
    const extra = wire ? reserve.optionsFor(wire, { inline }) : {};
    if (wire && inline) reserve.note("inline");
    await send(scene, seq, starts, updates, { ...result[1], ...extra, movement: { [doc.id]: { ...base, waypoints } } }, "move");
    return;
  }
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
      feature?.exposed?.tele?.("error", { reason: "drop", message: String(err?.message ?? err).slice(0, 120) });
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
    enabled: !!setting("groupDrags"),
    fight: !!setting("fightGroupDrags"),
    patched: { drop: dropPatched, click: !!feature?.exposed?.stopPatched?.() },
    regime: controlled.some(t => inCombat(t.document)) ? "combat" : "free",
    limits: { ...GROUP_LIMITS, motion: { ...MOTION }, life: { ...LIFE } },
    groups: groups.size,
    runs: [...groups.values()].map(g => ({ id: g.gid ?? null, state: g.run?.state ?? null, leftMs: g.run ? lifeLeft(g.run, Date.now()) : null, fight: !!g.fight, pending: g.pending?.size ?? 0 })),
    last: last ? { ...last } : null,
    fallbacks: fallbacks.map(f => ({ ...f })),
    resumed: resumedLast ? { ...resumedLast } : null,
    fightResumed: fightResumed ? { ...fightResumed } : null,
    flushed: flushedLast ? { ...flushedLast } : null,
    stopped: stoppedAt ? { ...stoppedAt } : null,
    cut: cutLast ? { ...cutLast } : null,
    held: heldLast ? { ...heldLast } : null,
    reservations: reserve.status(),
    perf: { ...perf },
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
    formation: plan.formation, replans: plan.replans, cut: plan.cut, stayed: plan.stayed, ms: plan.ms,
    members: prep.members.map(m => {
      const e = plan.members[m.id];
      return {
        id: m.id, name: m.token.document.name, core: !!e?.core, level: e?.level ?? null, delay: e?.delay ?? 0,
        short: !!e?.short, slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null, waypoints: e?.points?.length ?? 0,
      };
    }),
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

/** visibilitychange: the tab went to the background, so this client's groups send what they have left now (flush). */
function onVisibility() {
  if (globalThis.document?.visibilityState !== "hidden" || !feature) return;
  flushGroups();
}
let visTarget = null;
function listenVisibility() {
  const d = globalThis.document;
  if (!d || visTarget === d || typeof d.addEventListener !== "function") return;
  d.addEventListener("visibilitychange", onVisibility);
  visTarget = d;
}
function unlistenVisibility() {
  try { visTarget?.removeEventListener?.("visibilitychange", onVisibility); } catch (err) { log?.debug?.("visibility listener", err); }
  visTarget = null;
}

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  listenVisibility();
  if (ctx.late) dropPatched = patchDrop();
  else reg.once("setup", () => { dropPatched = patchDrop(); }, { guard: false, label: "setup: wrap _prepareDragLeftDropUpdates (group movement)" });
  // A reload mid-move: this tab's unsent waves go out now (live R3-1).
  if (ctx.late) { resumePending(); resumeFights(); }
  else reg.once("ready", () => { resumePending(); resumeFights(); }, { label: "ready: resume a group's waves and a fight's walks after a reload" });
  // A fight's walk this client started: the squares still to walk, for a reload mid-walk (FR2-09).
  reg.on("moveToken", (doc, movement) => onFightMove(doc, movement), { label: "moveToken: a fight walk's squares still to go (reload)" });
  reg.on("stopToken", doc => onFightStop(doc), { label: "stopToken: a fight walk stopped has nothing to resume" });
  // A fight's group move, tier C (0.8.0): a member sets off on the arrival of the one before it (an event).
  reg.on("moveToken", doc => onArrival(doc), { label: "moveToken: a fight member's arrival sets off the next (tier C)" });
  reg.on("stopToken", doc => onArrival(doc), { label: "stopToken: a fight member stopped has arrived (tier C)" });
  // A turn change clears every combatant's movement history, and core stops a token whose history is
  // cleared: the rest of its group stops with it (live R4-3).
  reg.on("updateToken", (doc, _changes, options) => onHistoryCleared(doc, options), { label: "updateToken: a turn change stops the whole group" });
  reg.on("updateToken", (doc, _changes, options) => onGroupTag(doc, options), { label: "updateToken: which group a move belongs to (click stops the group)" });
  reg.on("updateToken", (doc, changes, options, userId) => onForeignStop(doc, changes, options, userId), { label: "updateToken: a member another user stopped (the rest stop short behind it)" });
  // Server-ordered reservations (0.6.0): every client records each plan as it arrives, sets it off, drops it.
  reserve.configure({ log, counts: countsForRoutes });
  reg.on("updateToken", (doc, changes, options) => reserve.onUpdate(doc, changes, options), { label: "updateToken: a move's reservation (the server's order)" });
  reg.on("moveToken", (doc, movement, operation) => reserve.onMove(doc, movement, operation), { label: "moveToken: a reserved token sets off, walks on, or its reservation goes" });
  reg.on("stopToken", doc => reserve.onStop(doc), { label: "stopToken: a stopped token's reservation goes" });
  // A door shut or a wall raised across a move this client started cuts it (out of combat before the wall; in a fight
  // everyone of the group stops where they are).
  reg.on("createWall", wall => { onWallChange(wall, null); }, { label: "createWall: cut moves across a new wall" });
  reg.on("updateWall", (wall, changes) => { onWallChange(wall, changes); }, { label: "updateWall: cut moves across a shut door" });
  ctx.expose({ groupFollower, singleAvoid, groupCancel, groupMembers, groupStopOne, groupNoteStop, groupStatus, groupCutAcross: cutAcross, groupDryRun: dryRun,
    groupPatched: () => dropPatched, groupRepublish: republish, groupCheckpoints: withCheckpoints, groupStackmates: stackmates, groupFlush: flushGroups,
    groupRunOf: id => groups.get(groupOf.get(id))?.run ?? null });
}

export function uninstall() {
  unlistenUnload();
  unlistenVisibility();
  dropHandle?.unwrap();
  dropHandle = null;
  dropPatched = false;
  // The unsent waves' records stay: a hot patch's re-import (or the next reload) sends them.
  for (const g of groups.values()) for (const t of g.timers) clearTimeout(t);
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  stackOf.clear();
  arrivals.clear();
  last = null;
  resumedLast = null;
  fightResumed = null;
  flushedLast = null;
  stoppedAt = null;
  cutLast = null;
  heldLast = null;
  fallbacks.length = 0;
  latestDrop.clear();
  reserve.reset();
  feature = null;
}
