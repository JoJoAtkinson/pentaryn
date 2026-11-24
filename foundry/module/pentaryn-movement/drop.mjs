/**
 * Pentaryn Movement — the feature: the drop (0.9.0, plan context/plans/pathfinding-2026-11.md §17; Fable's review 2
 * §2, §4 steps 1–4). Replaces group.mjs.
 *
 * GLUE, one feature. Wraps Token#_prepareDragLeftDropUpdates on the configured token class: core's own
 * [updates, options] come back first, then
 *   - a single drop (tier A): its route confirmed clear of the tokens standing outside it, and it goes. Round them when
 *     there is a way; with none, as far as it is free of them, or not at all, and the dragger is told. No publish,
 *     queue, start delay or step-aside: nothing ever waits for another mover. A search still running at the drop
 *     finishes in slices and the token goes when it is done (confirmLater / aroundLater).
 *   - several tokens out of combat (tier B, the file, with file.mjs): slots and routes in one pass (B0), then start
 *     delays (B1, the last within 4 s; on open ground all 0). The members at 0 go in the drop's own update, later
 *     waves by setTimeout; a wave skips a member no longer at its start and is tested against the walls as they are
 *     then. A member with no reachable slot stays and is named in a notice.
 *   - several tokens in a fight (the fight file, §4 step 4; Joe 2026-11-24): one member at a time, in order, each a
 *     normal single move routed when its turn comes round the tokens standing then (exact cost, nothing walked
 *     through); a stack goes as one entry. A click, a turn change, a new drop or a deleted member empties the queue;
 *     a watchdog (the walk's time plus 3 s) moves it on, so it cannot hang. More than the group cap: refused.
 *   - ghost / the unconstrained tool / Ctrl waypoints / a planned move: core's own drop, untouched.
 * In a fight every move gets a checkpoint at every square (decision 1), and before each next square of a move this
 * client drives is sent it is tested (onPreMove): against the walls that block movement now (Joe 2026-11-23, every
 * square, drawn or not); not sent at all from a page that no longer draws the token (the undrawn-token rule, AR1-01 /
 * AR2-01); not into a token standing still. Out of combat a wall raised or a door shut across a move this client drives
 * stops it where it is drawn. Tokens that start stacked walk as their leader (riders); one Ctrl+Z undoes one move.
 * Any throw is core's own drop (fail open), with one warning, and the circuit breaker counts it.
 */

import { MODULE } from "./movement-core.mjs";
import { MOTION, cellChain, dist, firstLegAcross, groupMode, radiusOf, routeAhead, waves as wavesOf } from "./motion-core.mjs";
import { coalesceHistory, freePrefix, onCell, pathLength, prefixOf } from "./group-core.mjs";
import { sequence, stacksOf } from "./sequence-core.mjs";
import { orderOf, waveWays } from "./file-core.mjs";
import { avoidDist, skipReason } from "./pathfind-core.mjs";
import { clearOfWalls, countsForRoutes, drawnPosition, gridSize, inCombat, memberOf, movementFacts, othersOf, restWalkable, sameLayer, speedOf, toSquares } from "./group-adapter.mjs";
import { setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";

let log = null;
let feature = null;
let dropHandle = null;
let dropPatched = false;

/** The update option that names the group a move belongs to (file.mjs reads it on every client; the same string). */
const GROUP_OPT = "pentarynMovementGroup";
let last = null;                           // the last drop, for status()
let cutLast = null;                        // the last wall raised mid-walk that stopped moves this client drives
let stepLast = null;                       // the last next square of a move this client drives that it did not send
let undoLast = null;                       // the last move whose undo entries were merged into one
const fallbacks = [];                      // the last few reasons a drop went to core
/** token id → the sequence number of this client's latest drop of it: an older search never overrides a newer drop. */
const latestDrop = new Map();
let dropSeq = 0;
/** How long a move counts as one for undo and stacks (ms). */
const MOVE_MS = 10000;

const now = () => globalThis.performance?.now?.() ?? Date.now();
const perf = { drops: 0, maxMs: 0, lastMs: null };

function fellBack(reason) {
  fallbacks.unshift({ at: new Date().toISOString(), reason });
  fallbacks.length = Math.min(fallbacks.length, 8);
  feature?.exposed?.tele?.("fallback", { reason });
}

const contextsOf = event => Object.values(event?.interactionData?.contexts ?? {});
const lastWp = (wps) => wps.map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));

/* -------------------------------------------- */
/*  Notices                                     */
/* -------------------------------------------- */

/**
 * The notices a player sees (0.8.0, Fable's review §4): "No route there" (decision 7: nobody moves), "Stopped short,
 * way blocked", and since 0.9.0 the members of a group drag that stayed, by name. What happened exactly is a reason
 * code in the telemetry. The same notice twice within NOTICE_GAP_MS shows once.
 */
const NOTICES = Object.freeze({ noRoute: "PENTARYN_MOVEMENT.notify.noRoute", short: "PENTARYN_MOVEMENT.notify.stoppedShort",
  fight: "PENTARYN_MOVEMENT.notify.fightGroup" });
const NOTICE_GAP_MS = 1000;
const noticeAt = {};
const told = [];                           // the last notices, for status() and the tests: { at, kind, reason, text? }

function noteTold(kind, reason, text = null) {
  told.unshift({ at: new Date().toISOString(), kind, reason, ...(text ? { text } : {}) });
  told.length = Math.min(told.length, 8);
}

function tell(kind, reason = kind) {
  feature?.exposed?.tele?.("notice", { notice: kind, reason });
  noteTold(kind, reason);
  const t = Date.now();
  if (t - (noticeAt[kind] ?? -Infinity) < NOTICE_GAP_MS) return;
  noticeAt[kind] = t;
  try { globalThis.ui?.notifications?.warn?.(NOTICES[kind] ?? NOTICES.short, { localize: true }); }
  catch (err) { log?.debug?.("notice", err); }
}

/** A token's name as this user may read it (the GM, its owner, or a nameplate shown to everyone), else "a token". */
function nameFor(doc) {
  const modes = globalThis.CONST?.TOKEN_DISPLAY_MODES ?? {};
  const shown = doc && (game.user?.isGM || doc.isOwner || [modes.HOVER ?? 30, modes.ALWAYS ?? 50].includes(doc.displayName));
  return shown ? doc.name : game.i18n.localize("PENTARYN_MOVEMENT.notify.named.aToken");
}

/** "No route there", naming the token standing in the only way and the ghost button that walks through it (AR3-12). */
function tellBlockedBy(grabbed, blockerId) {
  const doc = grabbed?.document?.parent?.tokens?.get?.(blockerId) ?? null;
  const text = game.i18n.format("PENTARYN_MOVEMENT.notify.named.noRoute", { name: nameFor(doc) });
  feature?.exposed?.tele?.("notice", { notice: "noRoute", reason: "blockedBy" });
  noteTold("noRoute", "blockedBy", text);
  const t = Date.now();
  if (t - (noticeAt.noRoute ?? -Infinity) < NOTICE_GAP_MS) return;
  noticeAt.noRoute = t;
  try { globalThis.ui?.notifications?.warn?.(text); } catch (err) { log?.debug?.("notice", err); }
}

/**
 * The members of a group drag that stayed where they stand (no free spot they can reach), by name (0.9.0 B0); with
 * `key` "notSent", the members a fight queue never sent because its walk was ended (a turn change, a deleted member, a
 * member stopped on the way).
 */
const NAMED = Object.freeze({ stayed: "PENTARYN_MOVEMENT.notify.named.stayed", notSent: "PENTARYN_MOVEMENT.notify.named.notSent" });
function tellStayed(docs, reason = "stayed", key = "stayed") {
  const names = docs.map(nameFor).join(", ");
  const text = game.i18n.format(NAMED[key] ?? NAMED.stayed, { names });
  feature?.exposed?.tele?.("notice", { notice: "stayed", reason, members: docs.length });
  noteTold("stayed", reason, text);
  try { globalThis.ui?.notifications?.warn?.(text); } catch (err) { log?.debug?.("notice", err); }
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

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

/** During a group drag out of combat, is this token one of the followers (pathfinding waits for the drop)? */
function groupFollower(token) {
  let combat = false;
  try { combat = inCombat(token?.document); } catch { combat = false; }
  if (combat || !setting("groupDrags")) return false;
  const dragged = token?.layer?._draggedToken;
  if (!dragged || dragged === token) return false;
  const contexts = dragged.mouseInteractionManager?.interactionData?.contexts ?? {};
  const n = Object.keys(contexts).length;
  if (n < 2 || n > (feature.exposed.groupMax?.() ?? 12) || !(token.document?.id in contexts)) return false;
  // A drop core will commit anyway (Ctrl-click waypoints, a direct or planned move) keeps every
  // member's own pathfinding: otherwise its followers would stop at the first wall.
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
      enabled: !!setting("groupDrags"), members: contexts.length, gridType,
      direct: !!planning?.direct, planned: !!planning, waypoints: contexts.some(c => c.waypoints?.length),
      ghost, unconstrained: !!constrain.ignoreWalls && !ghost, combat, pathfind: pathfind === "grid" ? null : pathfind,
    }),
  };
}

/* -------------------------------------------- */
/*  In combat: a checkpoint at every square      */
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

/** A path (top-left pixels) with every square between two whole-square corners put in, as a fight walks it (S1R2-04). */
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

/** A path cut at { k, t } (group-core prefixOf), its cut end on the grid in a fight. */
function cutPath(path, cut, combat) {
  if (!cut) return path;
  const pts = path.map(p => ({ x: p.x, y: p.y }));
  const pre = prefixOf(pts, cut);
  const out = path.slice(0, Math.min(pre.length, cut.k + 1));
  if (pre.length > out.length) {
    const end = pre.at(-1);
    const next = path[Math.min(cut.k + 1, path.length - 1)];
    out.push({ ...next, x: Math.round(end.x), y: Math.round(end.y), snapped: !!combat });
  }
  return out;
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
  const fight = inCombat(doc);
  const path = fight ? onSquares([origin, ...wps], s) : [origin, ...wps];
  const pts = path.map(p => toSquares(p, w, h, s));
  const p = freePrefix(pts, radiusOf(w, h), others, { allowed: fight ? c => onCell(c, w, h) : null });
  const out = (p.full ? path : cutPath(path, p.cut, fight)).slice(1);
  if (out.length) out[out.length - 1] = { ...out.at(-1), explicit: true, checkpoint: true };
  if (!p.full) out.short = true;
  return out;
}

/* -------------------------------------------- */
/*  Tokens that start stacked (0.8.0)           */
/* -------------------------------------------- */

/** token id → { mates: Set, at }: members of a recent drop that started stacked (a fight step never bars a mate). */
const stackOf = new Map();

/**
 * The members of a drop that start stacked (a rider on its mount, a familiar on a shoulder): rider id → { leader, dx,
 * dy } (top-left pixel offset from its leader, the largest of the stack, the grabbed one on a tie). Each rider walks
 * its leader's way at its offset; the planner sees only the leader. null when none.
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
  if (stackOf.size > 200) for (const [id, v] of stackOf) if (t - v.at > MOVE_MS) stackOf.delete(id);
  return out.size ? out : null;
}

/**
 * The tokens stacked on `grabbed` when it is the largest of its stack (AR1-09: a mount dragged alone carries its
 * rider): drop contexts for each, at its offset from the grabbed one's destination. A rider dragged alone leaves its
 * mount. Never one moving.
 */
function soloRiders(grabbed, ctx) {
  const doc = grabbed.document;
  const s = gridSize(grabbed);
  const me = { id: doc.id, c: toSquares(doc._source, doc._source.width ?? 1, doc._source.height ?? 1, s),
    r: radiusOf(doc._source.width ?? 1, doc._source.height ?? 1), size: (doc._source.width ?? 1) * (doc._source.height ?? 1), token: grabbed };
  const items = [me];
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const o = t?.document;
    if (!o?._source || o.id === doc.id || t.isPreview || t.destroyed || !countsForRoutes(t)) continue;
    if (o._source.level !== undefined && doc._source.level !== undefined && o._source.level !== doc._source.level) continue;
    if (movementFacts(t).animating || o.movement?.state === "pending") continue;
    const w = o._source.width ?? 1, h = o._source.height ?? 1;
    items.push({ id: o.id, c: toSquares(o._source, w, h, s), r: radiusOf(w, h), size: w * h, token: t });
  }
  const st = stacksOf(items, { prefer: doc.id }).find(x => x.leader === doc.id || x.riders.some(r => r.id === doc.id));
  if (!st) return [];
  const ids = [st.leader, ...st.riders.map(r => r.id)];
  const t0 = Date.now();
  for (const id of ids) stackOf.set(id, { mates: new Set(ids.filter(x => x !== id)), at: t0 });
  if (st.leader !== doc.id) return [];
  const dest = ctx.destination ?? ctx.foundPath?.at(-1) ?? doc._source;
  const out = [];
  for (const r of st.riders) {
    const it = items.find(i => i.id === r.id);
    const odoc = it?.token?.document;
    if (!odoc?.isOwner) continue;
    const dx = odoc._source.x - doc._source.x, dy = odoc._source.y - doc._source.y;
    out.push({ token: it.token, destination: { ...dest, x: dest.x + dx, y: dest.y + dy, width: odoc._source.width, height: odoc._source.height }, foundPath: [], waypoints: [] });
  }
  return out;
}

/** The ids that started stacked with token `id` in a recent drop (an empty set when none). */
function stackmates(id) {
  const v = stackOf.get(id);
  return v && Date.now() - v.at <= MOVE_MS ? v.mates : new Set();
}

/** A rider's waypoints: its leader's, at its offset (its own size). */
function riderWaypoints(lead, rider, doc) {
  const w = doc?._source?.width ?? 1, h = doc?._source?.height ?? 1;
  const s = doc?.parent?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const aligned = rider.dx % s === 0 && rider.dy % s === 0;
  return lead.map(p => ({ ...p, x: p.x + rider.dx, y: p.y + rider.dy, width: w, height: h, snapped: !!p.snapped && aligned }));
}

/** Core's [updates, options] with every rider moving as its leader does, or not at all when the leader does not move. */
function carryRiders(riders, result) {
  if (!riders?.size || !result) return result;
  const movement = result[1]?.movement;
  if (!movement) return result;
  let updates = result[0];
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
  result[0] = updates;
  return result;
}

/* -------------------------------------------- */
/*  A single drop (tier A)                      */
/* -------------------------------------------- */

/**
 * A fast flick (live H3-13): core's drag handler takes at most one pointer move per frame, so a quick drag's
 * destination can lag the pointer-up. A drop whose pointer-up is elsewhere takes the pointer-up's point (same delta for
 * every member, snapped as the drag snaps). A single drop only out of combat with pathfinding on and no ghost (its own
 * route search, noteNoRoute, takes it there). Returns true when it moved them.
 */
function catchUpDestination(grabbed, event, contexts) {
  if (!contexts.length || contexts.some(c => c.waypoints?.length) || grabbed.layer?._movementPlanningContext) return false;
  if (contexts.length === 1) {
    const doc = grabbed.document;
    if (contexts[0].token !== grabbed || inCombat(doc) || feature.exposed.pathfindSkip?.(grabbed)) return false;
    try { if (grabbed._getDragConstrainOptions?.()?.ignoreWalls) return false; } catch { return false; }
  }
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
  const mine = next.find(([c]) => c.token === grabbed)?.[1];
  const had = contexts.find(c => c.token === grabbed)?.destination;
  if (!mine || (had && Math.round(had.x) === Math.round(mine.x) && Math.round(had.y) === Math.round(mine.y))) return false;
  for (const [c, dest] of next) c.destination = dest;
  return true;
}

/** Does no member of this drop go anywhere (every waypoint is where it stands)? */
function droppedInPlace(contexts, [updates, options], caughtUp = false) {
  // A group is planned from its drop points, not core's paths (a member whose core path stops at a wall still has a way).
  if (caughtUp || contexts.length > 1) return contexts.every(c => c.destination?.x === c.token.document._source.x && c.destination?.y === c.token.document._source.y);
  return contexts.every(c => {
    const doc = c.token.document;
    const wps = options.movement?.[doc.id]?.waypoints ?? [];
    return wps.every(w => w.x === doc._source.x && w.y === doc._source.y && (w.elevation ?? doc._source.elevation) === doc._source.elevation);
  }) || !updates.length;
}

/** One route call that checks a drop the drag's own path fell short of (ms). */
const CONFIRM_MS = 250;

/**
 * A single drop out of combat whose path (as the drag found it) ends short of where it was dropped: the drag's search
 * may still have been running at the drop (live H2-12), so one search confirms it first. Returns
 *   false       it gets there (`out.route`: the confirmed path, when the drag's was short), or nothing to say
 *   "none"      no way there at all (decision 7)
 *   "narrow"    a big token with no way its body fits: it goes as far as it fits (decision 8)
 *   "pending"   still searching: confirmLater finishes the search in slices
 */
function noteNoRoute(grabbed, contexts, out = {}) {
  if (contexts.length !== 1) return false;
  const c = contexts.find(x => x.token === grabbed) ?? contexts[0];
  const doc = c?.token?.document;
  if (!doc || inCombat(doc) || !c.destination || c.waypoints?.length) return false;
  const end = c.foundPath?.at?.(-1);
  if (!end) return false;
  try { if (grabbed._getDragConstrainOptions?.()?.ignoreWalls) return false; } catch (err) { log.debug?.("drag constrain options", err); }
  if (feature.exposed.pathfindSkip?.(grabbed)) return false;
  if (Math.round(end.x) === Math.round(c.destination.x) && Math.round(end.y) === Math.round(c.destination.y)) return false;
  const big = (doc._source.width ?? 1) > 1 || (doc._source.height ?? 1) > 1;
  let r = null;
  try {
    const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
    r = feature.exposed.pathfindRouteTo?.(grabbed, origin, { ...origin, ...c.destination, explicit: true, checkpoint: true }, { preview: true, maxMs: CONFIRM_MS });
  } catch (err) { log.debug?.("no-route: confirm", err); r = null; }
  if (!r) return false;
  if (r.reached && r.path?.length >= 2) { out.route = r.path; return false; }
  const legs = r.legs ?? [];
  const done = legs.length > 0 && legs.every(l => l.state !== "more");
  if (!done) return legs.length ? "pending" : false;
  if (big && (legs.some(l => l.state === "found") || (c.foundPath?.length ?? 0) >= 2)) {
    if (r.partial?.length >= 2) out.route = r.partial;
    return "narrow";
  }
  return "none";
}

/** Which of `ids` may still be sent for drop `seq`: on `scene`, not moved since the drop, and not dropped again since. */
function stillOurs(ids, scene, starts, seq) {
  return ids.filter(id => {
    const doc = scene?.tokens?.get(id);
    const at = starts.get(id);
    return doc && at && latestDrop.get(id) === seq && doc._source.x === at.x && doc._source.y === at.y;
  });
}

/**
 * Send a single drop whose way was found after the drop (confirmLater, aroundLater): only when the token is still where
 * the drop found it and was not dropped again; walked only as far as it is free of the tokens standing now (one may
 * have come to rest in its way while the search ran). Never throws; a throw is core's line instead (fail open).
 */
function sendLater(grabbed, result, waypoints, { seq, starts, scene }) {
  const doc = grabbed.document;
  try {
    if (!feature || !stillOurs([doc.id], scene, starts, seq).length || !waypoints?.length) return Promise.resolve(false);
    let wps = waypoints;
    if (!feature.exposed.ghostFor?.(grabbed)) {
      const others = othersOf([{ id: doc.id, token: grabbed }], gridSize(grabbed));
      const kept = freeOfOthers(grabbed, { ...doc._source }, wps, others);
      if (kept.short) { tell(kept.length ? "short" : "noRoute", "standingSince"); wps = kept; }
    }
    if (!wps.length) return Promise.resolve(false);
    if (inCombat(doc)) wps = withCheckpoints(grabbed, [{ ...(feature.exposed.pathfindOrigin?.(doc) ?? doc._source) }, ...wps]);
    const base = result?.[1]?.movement?.[doc.id] ?? { planned: false };
    const options = {};
    for (const [k, v] of Object.entries(result?.[1] ?? {})) if (k !== "movement") options[k] = v;
    return Promise.resolve(scene.updateEmbeddedDocuments("Token", [{ _id: doc.id }], { ...options, movement: { [doc.id]: { ...base, waypoints: wps } } }))
      .then(() => true, err => { failed("sendLater", err); return false; });
  } catch (err) { failed("sendLater", err); return Promise.resolve(false); }
}

/** A single drop's async way failed: counted (the breaker), one warning. */
function failed(why, err) {
  log?.warnOnce?.(`single-${why}`, "a single drop could not be sent (further errors suppressed)", err);
  feature?.exposed?.tele?.("error", { reason: why, message: String(err?.message ?? err).slice(0, 120) });
}

/** A record for status() of a drop whose way is found after it. */
function laterRecord(reason) {
  last = { at: new Date().toISOString(), mode: "core", reason, combat: false, members: 1, result: null, ms: null, async: true };
  return last;
}

/**
 * A single drop out of combat whose route search had not finished at the drop (live H3-04). The search finishes in
 * timer slices; then the token takes the route, or, with no way there, stays and the dragger is warned (decision 7).
 * A big token with no way it fits goes as far as it fits, with the narrow warning. Returns null.
 */
function confirmLater(grabbed, c, result, seq) {
  const doc = grabbed.document;
  const scene = doc.parent ?? canvas.scene;
  const starts = new Map([[doc.id, { x: doc._source.x, y: doc._source.y }]]);
  const t0 = now();
  const rec = laterRecord("single");
  const big = (doc._source.width ?? 1) > 1 || (doc._source.height ?? 1) > 1;
  const coreGoes = !droppedInPlace([c], result);
  const go = wps => sendLater(grabbed, result, wps, { seq, starts, scene });
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const search = feature.exposed.pathfindRouteToAsync;
  Promise.resolve(typeof search === "function" ? search(grabbed, origin, { ...origin, ...c.destination, explicit: true, checkpoint: true }, { preview: true }) : null)
    .then(r => {
      rec.ms = Math.round((now() - t0) * 10) / 10;
      if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { rec.result = "superseded"; return; }
      if (r?.reached && r.path?.length >= 2) { rec.result = "route"; go(lastWp(r.path.slice(1))); return; }
      const legs = r?.legs ?? [];
      const done = legs.length > 0 && legs.every(l => l.state !== "more");
      if (done && big && (legs.some(l => l.state === "found") || (c.foundPath?.length ?? 0) >= 2)) {
        tellNarrow(grabbed);
        rec.result = "narrow";
        if (r?.partial?.length >= 2) go(lastWp(r.partial.slice(1)));
        else if (coreGoes) go(result[1].movement[doc.id].waypoints);
        return;
      }
      if (done || !coreGoes) { rec.reason = "noRoute"; rec.result = "none"; tell("noRoute"); return; }
      rec.result = "core";
      go(result[1].movement[doc.id].waypoints);
    })
    .catch(err => { failed("confirm", err); if (coreGoes) go(result[1].movement[doc.id].waypoints); else tell("noRoute", "confirmFailed"); });
  return null;
}

/** One route call for a single drop round the tokens that stay (ms). */
const SINGLE_MS = 150;

/**
 * A single token dropped (live H2-09, H2-07; S1R1-04 in a fight): core walks it straight through a token standing in
 * its way and stacks it on one it is dropped on. Dropped on another token it takes the nearest clear spot it can
 * reach; its way goes round the tokens that stay, however long. With no way round, core's way as far as it is free of
 * them. Mutates core's result. Not with Ctrl waypoints, a planned move, ghost or the unconstrained tool, or when this
 * client's pathfinding is off. Returns false (nothing to do), true (mutated), { later } (search still running),
 * { stay, by } (does not move) or { short, by } (stops before the first token in its way).
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
  // AR2-06: out of combat its way keeps its square clear of theirs (a box); in a fight on whole squares, the circle.
  const box = !inCombat(doc);
  const circles = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1, box, id: o.id }));
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
  const live = circles.filter(o => avoidDist(o, start, start) >= o.r);
  let prev = start, through = false, by = null;
  const wps = moved ? [...m.waypoints.slice(0, -1), end] : m.waypoints;
  for (const q of wps.map(centre)) { const o = live.find(cc => avoidDist(cc, prev, q) < cc.r); if (o) { through = true; by = o.id ?? null; break; } prev = q; }
  if (!through && !moved) return false;
  const dest = { ...origin, ...end, explicit: true, checkpoint: true };
  let r1 = null;
  try { r1 = feature.exposed.pathfindRouteTo?.(grabbed, origin, dest, { preview: true, avoid: live, maxMs: SINGLE_MS }); } catch (err) { log.debug?.("single: a route round", err); }
  if (!moved && r1?.unfinished && typeof feature.exposed.pathfindRouteToAsync === "function") return { later: { origin, dest, avoid: live, wps } };
  if (r1?.reached && r1.path?.length >= 2) { m.waypoints = lastWp(r1.path.slice(1)); return true; }
  const kept = freeOfOthers(grabbed, origin, wps, others);
  if (!kept.length) return { stay: true, by };
  m.waypoints = kept;
  return kept.length === wps.length && !kept.short ? true : { short: true, by };
}

/**
 * While one token is dragged alone (S1R2-01), the circles (pixel centres) of the tokens standing outside it that its
 * way keeps out of, so that the drag's ruler shows the way it will walk and what it costs. null when its drop would
 * not go round them.
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
  const box = !inCombat(doc);
  const out = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1, box }))
    .filter(o => avoidDist(o, a, a) >= o.r && avoidDist(o, b, b) >= o.r);
  return out.length ? out : null;
}

/**
 * A single drop whose way round the tokens that stay was still being searched at the drop (aroundOthers' `later`):
 * the search finishes in timer slices and the token takes that way, or core's as far as it is free of them. Returns null.
 */
function aroundLater(grabbed, result, { origin, dest, avoid, wps }, seq) {
  const doc = grabbed.document;
  const scene = doc.parent ?? canvas.scene;
  const starts = new Map([[doc.id, { x: doc._source.x, y: doc._source.y }]]);
  const t0 = now();
  const rec = laterRecord("single");
  const s = gridSize(grabbed);
  const go = waypoints => sendLater(grabbed, result, waypoints, { seq, starts, scene });
  Promise.resolve(feature.exposed.pathfindRouteToAsync(grabbed, origin, dest, { preview: true, avoid }))
    .then(r => {
      rec.ms = Math.round((now() - t0) * 10) / 10;
      if (!feature || !stillOurs([doc.id], scene, starts, seq).length) { rec.result = "superseded"; return; }
      if (r?.reached && r.path?.length >= 2) { rec.result = "round"; go(lastWp(r.path.slice(1))); return; }
      let others = [];
      try { others = othersOf([{ id: doc.id, token: grabbed }], s); } catch (err) { log.debug?.("single: the tokens that stay", err); }
      const kept = freeOfOthers(grabbed, origin, wps, others);
      rec.result = kept.short ? (kept.length ? "short" : "none") : "core";
      if (kept.short) tell(kept.length ? "short" : "noRoute", "standingInTheWay");
      if (kept.length) go(kept);
    })
    .catch(err => { failed("around", err); tell("short", "aroundFailed"); });
  return null;
}

/* -------------------------------------------- */
/*  Every next square of a move this client drives  */
/* -------------------------------------------- */

const DOOR_OPEN = 1;
/** Does this wall block movement as it stands now? */
function blocksMove(wall) {
  const w = wall?._source ?? wall;
  if (!w || !(Number(w.move) > 0)) return false;
  return !(Number(w.door) > 0 && Number(w.ds) === DOOR_OPEN);
}

/** Core movement ids of moves this client started by a drag or for the module (their continuations name them in `chain`). */
const driven = new Map();                  // movement id → when (ms)
const DRIVEN_TTL_MS = 60000;

/** A waypoint's centre and the token's circle (squares). */
function stepCircle(doc, p, s) {
  const w = p?.width ?? doc._source.width ?? 1, h = p?.height ?? doc._source.height ?? 1;
  return { x: p.x / s + w / 2, y: p.y / s + h / 2, r: radiusOf(w, h) };
}

/** Distance from point c to segment a-b (squares). */
function segPt(c, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = L2 > 1e-12 ? Math.min(Math.max(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
  return Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.y - (a.y + (b.y - a.y) * t));
}

/** Does the step a → b (pixels, centres) cross a wall that blocks movement now, read from the scene's documents? */
function stepThroughWall(scene, a, b) {
  for (const w of scene?.walls ?? []) {
    const c = w?.c;
    if (!c || c.length < 4 || !blocksMove(w)) continue;
    if (firstLegAcross(a, [b], { x: c[0], y: c[1] }, { x: c[2], y: c[3] }) === 0) return true;
  }
  return false;
}

/** A moving token: drawn walking, or between two squares of its move. */
function moving(t) {
  const o = t.document;
  return movementFacts(t).animating || o.movement?.state === "pending" || o.movement?.state === "paused";
}

/**
 * Does the fight step a → b (squares, centres) of `doc` come inside a token standing still on this page (drawn, counted
 * for routes, same level and layer, not a stack mate)? One already overlapping where the step starts is no new block;
 * one moving is not standing (two movers may brush, Joe 2026-11-24). The token's id, or null.
 */
function stepMeetsStanding(doc, a, b, s) {
  const mates = stackmates(doc.id);
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const o = t?.document;
    if (!o?._source || o.id === doc.id || t.isPreview || t.destroyed || mates.has(o.id) || !countsForRoutes(t)) continue;
    if (o._source.level !== undefined && doc._source.level !== undefined && o._source.level !== doc._source.level) continue;
    if (!sameLayer(doc, o)) continue;
    if (moving(t)) continue;
    const c = stepCircle(o, o._source, s);
    const rr = b.r + c.r - 0.02;
    if (Math.hypot(a.x - c.x, a.y - c.y) < rr) continue;
    if (segPt(c, a, b) < rr) return o.id;
  }
  return null;
}

/**
 * preMoveToken on the client that sends a move (0.8.3 AR1-01 / AR1-07; Joe's combat door rule of 2026-11-23). For a
 * fresh drag (or a move the module sends) and every continuation of one, before it is sent:
 *   - in a fight: the step from the square it holds to its next square is tested against the walls that block movement
 *     NOW (closed doors, new walls, a Wall of Stone; movement walls, never vision), drawn or not; a page that does not
 *     draw the token never sends it (core cannot measure it there: AR1-01 charged 0 ft for 4 squares through a shut
 *     door, AR2-01 the first square too); and never into a token standing still.
 *   - out of combat, from a page that does not draw the token: not across a wall that blocks movement now.
 * Not sending is core's own stop (preMoveToken false): the token stays on the square it holds, charged for the squares
 * it walked, and the initiator hears "Stopped short, way blocked". Moves the module did not drive are never touched (C10).
 */
function onPreMove(doc, move, options) {
  if (!feature || !doc?._source || !move) return true;
  const t = Date.now();
  const chain = Array.isArray(move.chain) ? move.chain : [];
  const cont = options?._movementArguments?.continuationId !== undefined || chain.length > 0;
  if (!cont) {
    const mine = move.method === "dragging" || Object.keys(options ?? {}).some(k => k.startsWith("pentarynMovement"));
    if (!mine) return true;
    if (move.id) {
      driven.set(move.id, t);
      if (driven.size > 200) for (const [k, at] of driven) if (t - at > DRIVEN_TTL_MS) driven.delete(k);
    }
  } else {
    if (!chain.some(id => driven.has(id))) return true;
    if (move.id) driven.set(move.id, t);
  }
  if (move.constrainOptions?.ignoreWalls || options?.constrainOptions?.ignoreWalls) return true;
  const scene = doc.parent;
  const fight = inCombat(doc);
  if (!fight && doc.rendered !== false) return true;
  const s = scene?.grid?.size ?? gridSize(doc.object ?? { document: doc });
  const from = move.origin ?? doc._source;
  const to = move.destination ?? move.passed?.waypoints?.at(-1);
  if (!to) return true;
  // Every leg it would walk now (a fresh move's passed part is its whole way), with a wall-blocking action.
  const walled = p => (CONFIG.Token?.movement?.actions?.[p?.action]?.walls ?? "move") !== null;
  const pts = [from, ...(move.passed?.waypoints ?? []).filter(w => !w?.intermediate), to];
  const legs = pts.map(p => stepCircle(doc, p, s));
  let why = null, hit = null;
  if (fight && !doc.rendered) why = "unrendered";
  for (let k = 1; k < legs.length && !why; k++) {
    if (!walled(pts[k])) continue;
    if (stepThroughWall(scene, { x: legs[k - 1].x * s, y: legs[k - 1].y * s }, { x: legs[k].x * s, y: legs[k].y * s })) why = fight ? "wall" : "wallUnrendered";
  }
  if (!why && fight) {
    hit = stepMeetsStanding(doc, legs[0], legs.at(-1), s);
    if (hit) why = "standing";
  }
  if (!why) return true;
  feature.exposed.tele?.("cut", { reason: `step:${why}`, id: doc.id });
  stepLast = { at: new Date().toISOString(), id: doc.id, name: doc.name, why, fight, hit };
  tell("short", `step:${why}`);
  return false;
}

/* -------------------------------------------- */
/*  A wall raised mid-walk (live R6-3)          */
/* -------------------------------------------- */

/**
 * The route a moving token still has to walk out of combat, from where it is drawn (the whole path is one update: the
 * document is already at its end, the tween walks `passed`). null when nothing is left.
 */
function routeLeft(token) {
  const doc = token.document;
  const m = doc.movement;
  const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])].filter(w => Number.isFinite(w?.x) && Number.isFinite(w?.y));
  const at = drawnPosition(token);
  const k = routeAhead(all, at, { near: 0.05 * gridSize(token), end: 0.5 });
  if (k === null) return null;
  return { from: at, waypoints: all.slice(k) };
}

/**
 * createWall / updateWall, every client: out of combat, a wall that now blocks movement across the way still ahead of
 * a move this client drives stops that move where it is drawn (stop.mjs's displace: decision 2, no snap; one in a
 * doorway carried just past the door's line). In a fight nothing here: every next square is tested against the walls
 * as they are when it is sent (onPreMove). Ghost and the unconstrained tool pass. Returns the ids stopped.
 */
function cutAcross(wall) {
  const scene = wall?.parent;
  const c = wall?._source?.c ?? wall?.c;
  if (!feature || !scene?.tokens || !Array.isArray(c) || c.length < 4 || !blocksMove(wall)) return [];
  const a = { x: c[0], y: c[1] }, b = { x: c[2], y: c[3] };
  const cut = [];
  for (const doc of scene.tokens.values?.() ?? []) {
    const token = doc?.object;
    const m = doc?.movement;
    if (!token || token.destroyed || !m?.user?.isSelf || !doc.isOwner || inCombat(doc)) continue;
    if (m.constrainOptions?.ignoreWalls || !movementFacts(token).animating) continue;
    const route = routeLeft(token);
    if (!route) continue;
    const s = gridSize(token);
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
    const legs = route.waypoints.filter(p => (CONFIG.Token?.movement?.actions?.[p.action]?.walls ?? "move") !== null);
    if (firstLegAcross(centre(route.from), legs.map(centre), a, b) < 0) continue;
    cut.push(token);
  }
  // One stop for all of them: none rests inside another (0.9.0 simulator, step 5: two brushing members cut together).
  const group = { skip: new Set(cut.map(t => t.document.id)), claims: [] };
  const out = [];
  for (const token of cut) {
    try { feature.exposed.stopDisplace?.(token, group); out.push(token.document.id); } catch (err) { log?.debug?.("cut: stop where drawn", err); }
  }
  if (out.length) {
    cutLast = { at: new Date().toISOString(), why: "wall", wall: wall.id ?? null, members: out.length };
    feature.exposed.tele?.("cut", { reason: "wall", members: out.length });
  }
  return out;
}

function onWallChange(wall, changes) {
  if (changes && !["ds", "door", "move", "c", "dir"].some(k => k in changes)) return;
  try { cutAcross(wall); }
  catch (err) {
    log?.warnOnce?.("drop-cut", "a wall raised mid-walk could not stop the moves crossing it (further errors suppressed)", err);
    feature?.exposed?.tele?.("error", { reason: "cut" });
  }
}

/* -------------------------------------------- */
/*  One Ctrl+Z for one move (0.8.3)              */
/* -------------------------------------------- */

/**
 * Core stores one undo entry per update this client sends, and a move the module drives can be many: a fight's every
 * square (core's continuation), a stop's write, a group's hidden members sent apart. The entries of one move are
 * merged into one, each token's taken from its first: the undo puts every token back where the move found it, with
 * its movement history (and so its charge) as it was (AR1-05 / AR1-06). Moves the module did not drive keep core's
 * entries (C10).
 */
const undoKeyOf = new Map();               // core movement id → the move's key
const undoTokenKey = new Map();            // token id → { key, at }
const moduleKeyed = o => Object.keys(o ?? {}).some(k => k.startsWith("pentarynMovement"));

function undoKeyFor(doc, options) {
  const mv = options?._movement?.[doc.id];
  const recent = undoTokenKey.get(doc.id);
  const fresh = recent && Date.now() - recent.at <= MOVE_MS ? recent.key : null;
  if (!mv) return moduleKeyed(options) ? fresh : null;
  const chain = Array.isArray(mv.chain) ? mv.chain : [];
  const root = chain[0] ?? mv.id;
  const ours = driven.has(root) || driven.has(mv.id) || chain.some(id => undoKeyOf.has(id)) || moduleKeyed(options);
  if (!ours) return null;
  const key = options?.[GROUP_OPT] ?? chain.map(id => undoKeyOf.get(id)).find(Boolean)
    ?? (mv.method !== "dragging" && moduleKeyed(options) ? fresh : null) ?? root;
  if (mv.id) undoKeyOf.set(mv.id, key);
  if (undoKeyOf.size > 400) for (const k of [...undoKeyOf.keys()].slice(0, 200)) undoKeyOf.delete(k);
  return key;
}

/** updateToken on the client that sent it: tag its undo entry with its move, and merge that move's entries. */
function onUndoEntry(doc, options, userId) {
  if (!feature || userId !== game.user?.id || options?.isUndo) return;
  const hist = globalThis.canvas?.tokens?.history;
  if (!Array.isArray(hist) || !hist.length) return;
  let key = null;
  try { key = undoKeyFor(doc, options); } catch (err) { log?.debug?.("undo: the move's key", err); }
  if (!key) return;
  undoTokenKey.set(doc.id, { key, at: Date.now() });
  if (undoTokenKey.size > 200) for (const [id, v] of undoTokenKey) if (Date.now() - v.at > MOVE_MS) undoTokenKey.delete(id);
  for (let i = hist.length - 1; i >= Math.max(0, hist.length - 8); i--) {
    const e = hist[i];
    if (e?.type !== "update" || !e.data?.some?.(d => d._id === doc.id)) continue;
    if (e.pmKey === undefined) Object.defineProperty(e, "pmKey", { value: key, writable: true, enumerable: false });
    break;
  }
  try { if (coalesceHistory(hist, key)) undoLast = { at: new Date().toISOString(), key, tokens: hist.at(-1)?.data?.length ?? 0 }; }
  catch (err) { log?.debug?.("undo: merge the move's entries", err); }
}

/* -------------------------------------------- */
/*  The drop                                    */
/* -------------------------------------------- */

function debugThrow() {
  if (globalThis.CONFIG?.debug?.[`${MODULE}.throw`]) throw new Error("debug: forced planner throw");
}

/** A single drop (tier A). Returns core's result (mutated), or null (nothing moves now). */
function singleDrop(grabbed, contexts, result, info, seq, noRoute, confirmed) {
  const doc = grabbed.document;
  if (noRoute === "none") {
    // Decision 7: a single token with no way there does not move at all.
    tell("noRoute");
    Object.assign(last, { reason: "noRoute", result: "none", ms: 0 });
    return null;
  }
  if (noRoute === "pending") return confirmLater(grabbed, contexts[0], result, seq);
  if (noRoute === "narrow") tellNarrow(grabbed);
  if (confirmed.route) {
    // The drag's search was still running at the drop: the confirmed route, not core's short line.
    const m = result[1].movement?.[doc.id];
    if (m) m.waypoints = lastWp(confirmed.route.slice(1));
  }
  let around = false;
  try { around = aroundOthers(grabbed, contexts[0], result); } catch (err) { log.debug?.("single: round the tokens that stay", err); }
  if (around?.later) return aroundLater(grabbed, result, around.later, seq);
  if (around?.stay || around?.short) {
    if (around.stay && around.by) tellBlockedBy(grabbed, around.by);
    else tell(around.stay ? "noRoute" : "short", around.stay ? "noRoute" : "standingInTheWay");
    Object.assign(last, { reason: "noRoute", result: around.stay ? "none" : "short", ms: 0 });
    if (around.stay) return null;
  } else last.result = "core";
  if (info.combat) checkpointAll(contexts, result[1]);
  return result;
}

/** The wrap's body: core's result in, the drop's result out (null: nothing moves now). */
function onDrop(grabbed, event, result) {
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[1]?.movement) return result;
  const contexts = contextsOf(event).filter(c => c?.token?.document);
  if (!contexts.length) return result;
  const t0 = now();
  // A new drop by this client empties every fight queue it runs (§2).
  try { feature.exposed.groupCancelQueues?.("drop"); } catch (err) { log.debug?.("drop: empty the fight queues", err); }
  let caughtUp = false;
  try { caughtUp = (contexts.length < 2 || !!setting("groupDrags")) && catchUpDestination(grabbed, event, contexts); } catch (err) { log.debug?.("drop: catch up the destination", err); }
  let noRoute = false;
  const confirmed = {};
  try { noRoute = noteNoRoute(grabbed, contexts, confirmed); } catch (err) { log.debug?.("no-route check", err); }
  // A mount dragged alone carries its riders (AR1-09); a rider dragged alone leaves its mount.
  if (contexts.length === 1 && noRoute !== "none" && noRoute !== "pending") {
    try {
      const extra = soloRiders(grabbed, contexts[0]);
      if (extra.length) contexts.push(...extra);
    } catch (err) { log.debug?.("drop: a mount's riders", err); }
  }
  const seq = ++dropSeq;
  for (const c of contexts) latestDrop.set(c.token.document.id, seq);
  // Click-to-stop arms MOTION.armMs after the drop (stop.mjs).
  try { feature.exposed.noteDrop?.(contexts.map(c => c.token.document.id)); } catch (err) { log.debug?.("noteDrop", err); }
  const info = modeFor(grabbed, contexts);
  last = { at: new Date().toISOString(), mode: info.mode, reason: info.reason, combat: info.combat, members: contexts.length,
    result: null, ms: null, async: false };
  let riders = null;
  try { riders = info.reason === "single" ? null : stacksFor(contexts, grabbed); } catch (err) { log.debug?.("drop: stacked tokens", err); }
  if (riders) last.stacked = riders.size;
  const done = out => {
    const ms = Math.round((now() - t0) * 10) / 10;
    if (last.ms === null) last.ms = ms;
    perf.drops += 1; perf.lastMs = ms; perf.maxMs = Math.max(perf.maxMs, ms);
    return out;
  };

  // A single drop with no way there, or whose search still runs: core's update may go nowhere (H3-04).
  if (info.reason === "single" && (noRoute === "none" || noRoute === "pending")) return done(singleDrop(grabbed, contexts, result, info, seq, noRoute, confirmed));
  // Dropped where it stands: nobody moves, nothing to plan.
  if (droppedInPlace(contexts, result, caughtUp)) {
    Object.assign(last, { mode: "core", reason: "still", result: "core" });
    return done(result);
  }
  if (info.mode === "core" && info.reason === "single") return done(singleDrop(grabbed, contexts, result, info, seq, noRoute, confirmed));
  // One stack dragged (a mount and its riders): its leader's move, the riders at their offsets.
  const oneStack = !!riders && contexts.filter(c => !riders.has(c.token.document.id)).length === 1;
  // A group drag in a fight with the drag help on is the fight file, one member at a time (§4 step 4); one it
  // cannot plan (more than the cap) is refused. Ghost, the unconstrained tool, Ctrl waypoints and a planned move are
  // core's own, as everywhere.
  const own = ["ghost", "unconstrained", "waypoints", "planned", "direct", "grid"].includes(info.reason);
  if (info.combat && !oneStack && !own && setting("groupDrags")) {
    if (info.mode === "plan") { debugThrow(); return done(fightFile(grabbed, contexts, riders, seq)); }
    return done(refuseFight(contexts));
  }
  if (info.mode !== "plan" || oneStack) {
    if (info.combat) checkpointAll(contexts, result[1]);
    carryRiders(riders, result);
    last.result = "core";
    feature.exposed.tele?.("plan", { mode: "core", reason: info.reason ?? "stack", members: contexts.length, combat: !!info.combat });
    return done(result);
  }
  debugThrow();
  return done(groupDrop(grabbed, contexts, result, riders, seq));
}

/**
 * A group drag in a fight the fight file cannot take (more members than the cap, or its pathfinding off): nobody
 * moves, and the dragger is told to drag one token at a time (Joe 2026-11-24). Never a wrong charge, never a walk
 * through a standing token.
 */
function refuseFight(contexts) {
  Object.assign(last, { mode: "refused", reason: "fightGroup", result: "none" });
  feature.exposed.tele?.("plan", { mode: "refused", reason: "fightGroup", members: contexts.length, combat: true });
  tell("fight", "fightGroup");
  return null;
}

/**
 * A group drag out of combat, the file (file.mjs): every member's slot and route in one pass (B0), then its start
 * delay (B1). The members at 0 go in the drop's own update; each later wave by setTimeout (file.mjs), sent by
 * sendWave. A member with no reachable slot stays and is named; nobody moving at all is "No route there". A throw is
 * core's own drop (the wrap's catch).
 */
function groupDrop(grabbed, contexts, result, riders, seq) {
  const lead = riders?.get(grabbed.document.id)?.leader;
  const anchor = lead ? (contexts.find(c => c.token.document.id === lead)?.token ?? grabbed) : grabbed;
  const leaders = riders?.size ? contexts.filter(c => !riders.has(c.token.document.id)) : contexts;
  // B1 (the file's start delays) or B0 (every member at once): the GM's groupStagger, read on every drop (§4 step 7).
  const stagger = setting("groupStagger") !== false;
  const out = feature.exposed.groupPlan?.(anchor, leaders, { constrain: grabbed._getDragConstrainOptions?.() ?? {}, stagger });
  if (!out) { fellBack("noPlan"); last.result = "core"; return carryRiders(riders, result); }
  const { plan, members, timing } = out;
  const delays = timing?.delays ?? {};
  const base = result[1].movement ?? {};
  const now0 = {}, later = new Map();
  for (const m of members) {
    const wps = feature.exposed.groupWaypoints(m, plan.members[m.id]);
    if (!wps.length) continue;
    const d = delays[m.id] ?? 0;
    if (d > 0) later.set(m.id, { wps, delay: d });
    else now0[m.id] = wps;
  }
  const waveList = wavesOf(Object.fromEntries([...later].map(([id, v]) => [id, v.delay])));
  Object.assign(last, { result: "plan", plan: { tier: stagger ? "B1" : "B0", ms: plan.ms, passes: plan.passes, stayed: plan.stayed.length, members: plan.order.length,
    waves: waveList.length + (Object.keys(now0).length ? 1 : 0), total: timing?.total ?? 0, crowded: timing?.crowded?.length ?? 0, timingMs: timing?.ms ?? null } });
  feature.exposed.tele?.("plan", { mode: "file", members: members.length, ms: plan.ms, stayed: plan.stayed.length, waves: waveList.length + 1, total: timing?.total ?? 0 });
  const movement = {};
  const updates = [];
  for (const [id, wps] of Object.entries(now0)) {
    movement[id] = { ...(base[id] ?? { planned: false }), waypoints: wps };
    updates.push({ _id: id });
  }
  const stayedDocs = plan.stayed.map(id => members.find(m => m.id === id)?.token?.document).filter(Boolean);
  if (!updates.length && !later.size) {
    last.result = "none";
    if (!stayedDocs.length || plan.stayed.includes(anchor.document.id)) tell("noRoute", "groupNoRoute");
    else tellStayed(stayedDocs);
    return null;
  }
  if (stayedDocs.length) tellStayed(stayedDocs);
  const options = { ...result[1], movement };
  const res = carryRiders(riders, [updates, options]);
  // Every client learns the group from its update option (a click on one stops them all); never with a hidden member
  // among them (update options reach every client).
  const scene = grabbed.document.parent;
  const ids = [...new Set([...res[0].map(u => u._id), ...later.keys(), ...[...(riders ?? new Map())].filter(([, r]) => later.has(r.leader)).map(([id]) => id)])];
  const gid = feature.exposed.groupHold?.(ids, scene) ?? null;
  const tag = gid && !ids.some(id => scene?.tokens?.get?.(id)?.hidden) ? gid : null;
  if (tag) options[GROUP_OPT] = tag;
  if (gid && later.size) {
    const starts = new Map(ids.map(id => [id, { ...(scene?.tokens?.get?.(id)?._source ?? {}) }]));
    const opts = {};
    for (const [k, v] of Object.entries(result[1])) if (k !== "movement") opts[k] = v;
    if (tag) opts[GROUP_OPT] = tag;
    // Where each member's plan rests it (top-left): a mate resting anywhere else is in the others' way (sendWave).
    const ends = new Map([...Object.entries(now0).map(([id, wps]) => [id, wps.at(-1)]), ...[...later].map(([id, v]) => [id, v.wps.at(-1)])]);
    const stayed = new Set();                  // members a wave left where they stand (named)
    const sentTo = new Map();                  // id → where a wave sent it (top-left), its echo maybe not back yet
    const send = list => sendWave(grabbed, list, { later, base, opts, riders, seq, starts, scene, ids, ends, stayed, sentTo });
    feature.exposed.groupWaves?.(gid, waveList, send);
  }
  if (res[0].length) noteInFlight(scene, res[0], res[1].movement);
  return res[0].length ? res : null;
}

/** Does the way `wps` (top-left pixels, from `from`) of `doc` cross a wall that blocks movement as it stands now? */
function wayShut(doc, from, wps) {
  const scene = doc.parent;
  const s = scene?.grid?.size ?? gridSize(doc.object ?? { document: doc });
  const pts = [from, ...wps];
  for (let k = 1; k < pts.length; k++) {
    if ((CONFIG.Token?.movement?.actions?.[pts[k]?.action]?.walls ?? "move") === null) continue;
    const a = stepCircle(doc, pts[k - 1], s), b = stepCircle(doc, pts[k], s);
    if (stepThroughWall(scene, { x: a.x * s, y: a.y * s }, { x: b.x * s, y: b.y * s })) return true;
  }
  return false;
}

/**
 * A later wave of a file (file.mjs's timer, or all at once when the tab goes to the background): each member still at
 * its start and not dropped again since (latestDrop) goes its planned way, unless a wall raised or a door shut since
 * crosses it (it stays where it is drawn: stop where drawn, for a member not yet sent) and only as far as it is free of
 * the tokens standing outside the group now (a hard obstacle; never a second plan). Its riders go with it. Never
 * throws; a failed update is counted (the breaker).
 */
function sendWave(grabbed, list, { later, base, opts, riders, seq, starts, scene, ids, ends = new Map(), stayed = new Set(), sentTo = new Map() }) {
  if (!feature) return;
  const wanted = list.filter(id => later.has(id));
  const live = stillOurs(wanted, scene, starts, seq);
  const s = gridSize(grabbed);
  const mates = ids.map(id => ({ id, token: scene?.tokens?.get?.(id)?.object ?? null })).filter(m => m.token);
  let others = [];
  try { others = mates.length ? othersOf(mates, s) : []; } catch (err) { log?.debug?.("wave: the tokens standing", err); }
  // 0.9.0 simulator (step 5, seeds 382 / 409 / 1958): a mate at rest anywhere but its plan's spot and its start (a
  // cut or a stop left it there), or one an earlier wave left where it stands, stands in this wave's way too; so
  // does each member of this wave cut short or staying, for the ones after it.
  const same = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
  const circleOf = (doc, p = doc._source) => {
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    return { ...toSquares(p, w, h, s), r: radiusOf(w, h), id: doc.id };
  };
  for (const id of ids) {
    if (live.includes(id) || (riders?.has?.(id))) continue;
    const doc = scene?.tokens?.get?.(id);
    const t = doc?.object;
    if (!doc?._source || !t || t.destroyed) continue;
    const to = sentTo.get(id);
    // Sent short of its plan's spot by an earlier wave: it rests there (walking there still, or its echo not back).
    if (to && !same(to, ends.get(id)) && (same(doc._source, to) || same(doc._source, starts.get(id)))) { others.push(circleOf(doc, to)); continue; }
    if (moving(t)) continue;
    const offPlan = !same(doc._source, ends.get(id)) && !same(doc._source, starts.get(id)) && !same(doc._source, to);
    if (offPlan || stayed.has(id)) others.push(circleOf(doc));
  }
  // Mates still waiting for a later wave, at their starts: a way cut short never rests on one (it may stay there,
  // 0.9.0 simulator seed 5361); a full way passes them (they set off later, two movers may brush).
  const waiting = [];
  for (const id of new Set((feature.exposed.groupPending?.() ?? []).flatMap(w => w.ids))) {
    const doc = scene?.tokens?.get?.(id);
    if (!ids.includes(id) || live.includes(id) || !doc?._source || !same(doc._source, starts.get(id))) continue;
    waiting.push(circleOf(doc));
  }
  const movement = {}, updates = [], shut = [];
  let short = false;
  // Who walks how far (file-core waveWays): shut or cut to nothing stays, cut short rests there, a shared lane swaps.
  const { ways } = waveWays(live.filter(id => scene.tokens.get(id)?.object && !scene.tokens.get(id).object.destroyed), {
    shut: id => { const doc = scene.tokens.get(id); return wayShut(doc, { ...doc._source }, later.get(id).wps); },
    at: id => circleOf(scene.tokens.get(id)),
    cut: (id, rests) => {
      const doc = scene.tokens.get(id);
      const wps = later.get(id).wps;
      let kept = freeOfOthers(doc.object, { ...doc._source }, wps, [...others, ...rests]);
      if (kept.short && kept.length && waiting.length) kept = freeOfOthers(doc.object, { ...doc._source }, wps, [...others, ...rests, ...waiting]);
      if (kept.short && !kept.length) return null;
      const way = kept.short ? kept : wps;
      return { way, end: circleOf(doc, way.at(-1)), short: !!kept.short };
    },
  });
  for (const id of live) {
    const doc = scene.tokens.get(id);
    const token = doc?.object;
    if (!token || token.destroyed) continue;
    const wps = ways.get(id);
    if (!wps) { shut.push(doc); stayed.add(id); continue; }
    if (wps !== later.get(id).wps) short = true;
    movement[id] = { ...(base[id] ?? { planned: false }), waypoints: wps };
    updates.push({ _id: id });
    sentTo.set(id, { x: wps.at(-1).x, y: wps.at(-1).y });
  }
  const skipped = wanted.length - live.length;
  waveLast = { at: new Date().toISOString(), members: wanted.length, sent: updates.length, skipped, shut: shut.length, short };
  if (shut.length) { feature.exposed.tele?.("cut", { reason: "wave", members: shut.length }); tellStayed(shut, "wave"); }
  else if (short) tell("short", "wave");
  if (!updates.length) return;
  const res = carryRiders(riders, [updates, { ...opts, movement }]);
  // A rider goes only while it is still where the drop found it.
  const ok = new Set(stillOurs(res[0].map(u => u._id), scene, starts, seq));
  const sendIds = res[0].filter(u => ok.has(u._id) || live.includes(u._id));
  for (const id of Object.keys(res[1].movement)) if (!sendIds.some(u => u._id === id)) delete res[1].movement[id];
  noteInFlight(scene, sendIds, res[1].movement);
  Promise.resolve(scene.updateEmbeddedDocuments("Token", sendIds, res[1])).catch(err => failed("wave", err));
}
let waveLast = null;                       // the last later wave this client sent, for status()

/**
 * Where this client has just sent tokens of a group (top-left, with size), until their write comes back (updateToken)
 * or IN_FLIGHT_MS: a stop on this client never rests one inside such a spot while the documents still show the old
 * place (0.9.0 simulator, step 5, seed 777: a wave and a door cut 50 ms apart).
 */
const inFlight = new Map();                // token id → { x, y, width, height, at }
const IN_FLIGHT_MS = 3000;
function noteInFlight(scene, updates, movement) {
  const t = Date.now();
  for (const u of updates) {
    const end = movement?.[u._id]?.waypoints?.at(-1);
    const doc = scene?.tokens?.get?.(u._id);
    if (!end || !doc?._source) continue;
    inFlight.set(u._id, { x: end.x, y: end.y, width: doc._source.width ?? 1, height: doc._source.height ?? 1, at: t });
  }
}
/** The spots in flight now: [{ id, x, y, width, height }] (top-left pixels). */
function restsInFlight() {
  const t = Date.now();
  const out = [];
  for (const [id, r] of inFlight) {
    if (t - r.at > IN_FLIGHT_MS) { inFlight.delete(id); continue; }
    out.push({ id, ...r });
  }
  return out;
}

/* -------------------------------------------- */
/*  A fight's group drag: one at a time (step 4) */
/* -------------------------------------------- */

/** A fight queue's watchdog past its walk's own time (ms): a walk that has not ended by then moves the queue on. */
const FIGHT_WATCH_MS = 3000;
let fightLast = null;                      // the last fight queue, for status()

/**
 * A group drag in a fight (the fight file, §4 step 4; Joe 2026-11-24): nothing moves at the drop. The members, in
 * order (sequence-core over their straight walks, least walk left first: never one sent through another standing at
 * its start when an order avoids it), each get a normal single move when their turn comes: routed then, round every
 * token standing then (the members already moved where they came to rest, the others where they stand), a checkpoint
 * at every square, charged by core as any single move. The next one starts when that walk has ended (core's move
 * promise, then its animation) or the watchdog moves it on. A stack (a mount and its riders) goes as one entry.
 * Returns null.
 */
function fightFile(grabbed, contexts, riders, seq) {
  const s = gridSize(grabbed);
  const scene = grabbed.document.parent;
  const leaders = riders?.size ? contexts.filter(c => !riders.has(c.token.document.id)) : contexts;
  const ms = leaders.map(c => ({ ...memberOf(c, s), c })).filter(m => dist(m.start, m.formation) > 1e-6);
  const ridersOf = id => [...(riders ?? new Map())].filter(([, r]) => r.leader === id).map(([rid, r]) => ({ id: rid, dx: r.dx, dy: r.dy }));
  const order = sequence(orderOf(ms, null).map(m => ({ id: m.id, r: m.r, points: [m.start, m.formation] }))).order;
  // Where each may rest when its formation square is no good (off the scene, behind a wall): squares the drop reaches.
  const lead = riders?.get(grabbed.document.id)?.leader;
  const anchor = lead ? (leaders.find(c => c.token.document.id === lead)?.token ?? grabbed) : grabbed;
  let spots = {};
  try { spots = feature.exposed.groupSpots?.(anchor, leaders, { constrain: grabbed._getDragConstrainOptions?.() ?? {} }) ?? {}; }
  catch (err) { log?.debug?.("fight: the spots", err); }
  const entries = order.map(id => ms.find(m => m.id === id)).map(m => ({
    id: m.id, start: { x: m.token.document._source.x, y: m.token.document._source.y }, dest: { ...m.c.destination }, riders: ridersOf(m.id),
    spots: spots[m.id] ?? [],
  }));
  Object.assign(last, { result: "queue", plan: { members: entries.length, order } });
  feature.exposed.tele?.("plan", { mode: "fightFile", members: entries.length, combat: true });
  if (!entries.length) { last.result = "none"; return null; }
  const ids = entries.flatMap(e => [e.id, ...e.riders.map(r => r.id)]);
  const gid = feature.exposed.groupHold?.(ids, scene) ?? null;
  const tag = gid && !ids.some(id => scene?.tokens?.get?.(id)?.hidden) ? gid : null;
  let wake = null;
  const q = {
    gid, done: false, why: null, current: null,
    cancel(why) { if (this.done) return; this.done = true; this.why = why; try { wake?.(); } catch (err) { log?.debug?.("fight: wake", err); } },
    woken: null,
  };
  q.woken = new Promise(r => { wake = r; });
  if (gid) feature.exposed.groupQueue?.(gid, q);
  fightLast = { at: new Date().toISOString(), members: entries.length, sent: 0, stayed: 0, skipped: 0, watchdog: 0, ended: null, running: true };
  const rec = fightLast;
  runFight(q, entries, { scene, gid, tag, seq, rec }).catch(err => failed("fight", err)).finally(() => {
    rec.running = false;
    rec.ended ??= q.why ?? "done";
    if (gid) feature?.exposed?.groupQueueDone?.(gid, q);
  });
  return null;
}

/** A timer for the queue's watchdog that also ends when the queue is emptied: resolves "timeout" or "cancel". */
function deadline(q, ms) {
  let t = null;
  const timer = new Promise(r => { t = setTimeout(() => r("timeout"), Math.max(0, ms)); });
  return { race: p => Promise.race([p, timer, q.woken.then(() => "cancel")]), clear: () => clearTimeout(t) };
}

async function runFight(q, entries, { scene, gid, tag, seq, rec }) {
  const stayed = [];
  let k = 0, walked = false;           // walked: entry k was sent (it walks, or walked, on its own)
  for (; k < entries.length; k++) {
    walked = false;
    if (q.done || !feature) break;
    const e = entries[k];
    const doc = scene?.tokens?.get?.(e.id);
    const token = doc?.object;
    if (!doc || !token || token.destroyed) { q.cancel("deleted"); break; }
    // Moved (or dropped again) since the drop: it is no longer this queue's.
    if (latestDrop.get(e.id) !== seq || doc._source.x !== e.start.x || doc._source.y !== e.start.y) { rec.skipped += 1; continue; }
    const way = await routeAtTurn(token, e);
    if (q.done || !feature) break;
    if (!way.waypoints) { stayed.push(doc); rec.stayed += 1; continue; }
    q.current = e.id;
    walked = true;
    const r = await walkOne(q, token, e, way, { gid, tag });
    q.current = null;
    if (r === "timeout") { rec.watchdog += 1; continue; }
    if (r === "cancel" || q.done) break;
    rec.sent += 1;
    // Stopped or prevented on the way (a click, a door shut across it, a square refused): the group stops there.
    if (r === false) { q.cancel("stopped"); break; }
  }
  if (stayed.length) tellStayed(stayed, "fight");
  // The members a turn change, a deleted member or a stop on the way left unsent are named (a click or a new drop is
  // the dragger's own doing).
  const left = entries.slice(k + (walked ? 1 : 0)).map(e => scene?.tokens?.get?.(e.id)).filter(Boolean);
  if (q.done && left.length && ["turn", "deleted", "stopped"].includes(q.why)) tellStayed(left, `fight:${q.why}`, "notSent");
}

/**
 * One member's way when its turn comes (a fight): round every token standing now outside its stack (circles on whole
 * squares), to its formation spot or, when a token stands there, the nearest clear square it can reach. { origin,
 * waypoints } or { stay }.
 */
async function routeAtTurn(token, e) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h);
  const skip = [{ id: doc.id, token }, ...e.riders.map(x => ({ id: x.id, token: null }))];
  const others = othersOf(skip, s);
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const circles = others.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1, box: false, id: o.id }));
  const taken = p => { const c = centre(p); return circles.some(o => Math.hypot(c.x - o.x, c.y - o.y) < o.r); };
  // Its formation square; on a token, the nearest clear square; and where that square is no good (off the scene,
  // behind a wall, in rock: 0.9.0 simulator, step 5), the squares round it the drop reaches (fightSpots), nearest first.
  const member = { token, r, w, h };
  const fits = p => { try { return restWalkable(member, { x: (p.x + (w * s) / 2) / s, y: (p.y + (h * s) / 2) / s }, s); } catch { return false; } };
  const ends = [];
  const add = p => { if (p && !taken(p) && fits(p) && !ends.some(q => q.x === p.x && q.y === p.y)) ends.push({ ...e.dest, x: p.x, y: p.y, snapped: true }); };
  const end0 = { ...e.dest };
  if (taken(end0)) {
    let spot = null;
    try { spot = clearOfWalls(token, end0, { taken, snap: true }); } catch (err) { log?.debug?.("fight: a clear square", err); }
    add(spot);
  } else if (fits(end0)) ends.push(end0);
  for (const p of e.spots ?? []) add(p);
  if (!ends.length) return { stay: "noSpot" };
  const origin = feature.exposed.pathfindOrigin?.(doc) ?? { ...doc._source };
  const start = centre(origin);
  const live = circles.filter(o => avoidDist(o, start, start) >= o.r);
  const opts = { preview: true, avoid: live.length ? live : null };
  let why = "noRoute";
  for (const end of ends.slice(0, FIGHT_TRIES)) {
    if (Math.round(start.x) === Math.round(centre(end).x) && Math.round(start.y) === Math.round(centre(end).y)) return { stay: "there" };
    const dest = { ...origin, ...end, explicit: true, checkpoint: true };
    let rr = null;
    try {
      const search = feature.exposed.pathfindRouteToAsync;
      rr = typeof search === "function" ? await search(token, origin, dest, opts) : feature.exposed.pathfindRouteTo?.(token, origin, dest, { ...opts, maxMs: CONFIRM_MS });
    } catch (err) { log?.debug?.("fight: a route", err); rr = null; }
    if (rr?.reached && rr.path?.length >= 2) return { origin, waypoints: lastWp(rr.path.slice(1)) };
    why = "noRoute";
  }
  return { stay: why };
}
/** Squares a fight member's turn tries a route to, at most (its formation square or the nearest clear, then fightSpots). */
const FIGHT_TRIES = 4;

/**
 * Walk one entry (its leader, its riders at their offsets), a checkpoint at every square; resolves true (walked to
 * its end), false (stopped or prevented on the way), "timeout" (the watchdog: its walk's time plus FIGHT_WATCH_MS) or
 * "cancel" (the queue was emptied).
 */
async function walkOne(q, token, e, way, { gid, tag }) {
  const doc = token.document;
  const scene = doc.parent;
  const wps = withCheckpoints(token, [way.origin, ...way.waypoints]);
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const squares = pathLength([way.origin, ...wps].map(p => toSquares(p, w, h, s)));
  const walkMs = (squares / Math.max(speedOf(token), 0.5)) * 1000;
  const opts = { method: "api", pentarynMovementFile: gid ?? true, ...(tag ? { [GROUP_OPT]: tag } : {}) };
  const ids = [doc.id, ...e.riders.map(x => x.id)];
  try { feature.exposed.noteDrop?.(ids); } catch (err) { log?.debug?.("fight: noteDrop", err); }
  const dl = deadline(q, walkMs + FIGHT_WATCH_MS);
  try {
    const moves = [Promise.resolve(doc.move(wps, opts))];
    for (const x of e.riders) {
      const rdoc = scene?.tokens?.get?.(x.id);
      if (!rdoc || rdoc._source.x !== doc._source.x + x.dx || rdoc._source.y !== doc._source.y + x.dy) continue;
      moves.push(Promise.resolve(rdoc.move(riderWaypoints(wps, x, rdoc), opts)));
    }
    const r = await dl.race(Promise.all(moves).then(all => all[0]));
    if (r !== true) return r === undefined ? false : r;
    // Core's promise resolves once the last square is on the server; the next one starts when it is drawn there.
    const anim = token.destroyed ? null : token.movementAnimationPromise;
    if (anim && typeof anim.then === "function") {
      const a = await dl.race(Promise.resolve(anim).then(() => true, () => true));
      if (a !== true) return a;
    }
    return true;
  } catch (err) {
    failed("fightMove", err);
    return false;
  } finally { dl.clear(); }
}

function patchDrop() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._prepareDragLeftDropUpdates !== "function") {
    log.warn("no Token#_prepareDragLeftDropUpdates; drop help disabled");
    return false;
  }
  dropHandle = wrapMethod(MODULE, {
    target: proto, name: "_prepareDragLeftDropUpdates", label: "Token#_prepareDragLeftDropUpdates",
    marker: "__pentarynMovementGroup", adjustments: "movement-group-drop",
  }, function (wrapped, event) {
    const result = wrapped(event);
    try {
      return onDrop(this, event, result);
    } catch (err) {
      log.warnOnce("group", "drop help skipped; the move goes as core's (further errors suppressed)", err);
      feature?.exposed?.tele?.("error", { reason: "drop", message: String(err?.message ?? err).slice(0, 120) });
      fellBack("throw");
      last = { ...(last ?? { at: new Date().toISOString(), members: null, async: false }), mode: "core", reason: "throw", result: "core" };
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
    fight: !!setting("groupDrags"),
    stagger: setting("groupStagger") !== false,
    patched: { drop: dropPatched, click: !!feature?.exposed?.stopPatched?.() },
    regime: controlled.some(t => inCombat(t.document)) ? "combat" : "free",
    limits: { maxMembers: feature?.exposed?.groupMax?.() ?? null, motion: { ...MOTION } },
    groups: feature?.exposed?.groupHeld?.() ?? 0,
    last: last ? { ...last } : null,
    fallbacks: fallbacks.map(f => ({ ...f })),
    stopped: feature?.exposed?.groupStopped?.() ?? null,
    cut: cutLast ? { ...cutLast } : null,
    step: stepLast ? { ...stepLast } : null,
    undo: undoLast ? { ...undoLast } : null,
    told: told.map(t => ({ ...t })),
    pending: feature?.exposed?.groupPending?.() ?? [],
    wave: waveLast ? { ...waveLast } : null,
    flushed: feature?.exposed?.groupFlushed?.() ?? null,
    queue: fightLast ? { ...fightLast } : null,
    perf: { ...perf },
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  if (ctx.late) dropPatched = patchDrop();
  else reg.once("setup", () => { dropPatched = patchDrop(); }, { guard: false, label: "setup: wrap _prepareDragLeftDropUpdates (the drop)" });
  reg.on("preMoveToken", (doc, move, options) => onPreMove(doc, move, options), { label: "preMoveToken: the next square of a move this client drives (walls now, an undrawn token, standing tokens)" });
  reg.on("updateToken", (doc, _changes, options, userId) => { inFlight.delete(doc?.id); onUndoEntry(doc, options, userId); }, { label: "updateToken: one undo entry for one move (a fight's squares); a wave's write is back" });
  reg.on("createWall", wall => { onWallChange(wall, null); }, { label: "createWall: stop moves across a new wall" });
  reg.on("updateWall", (wall, changes) => { onWallChange(wall, changes); }, { label: "updateWall: stop moves across a shut door" });
  ctx.expose({ groupFollower, singleAvoid, groupStatus, groupCutAcross: cutAcross, groupInFlight: restsInFlight,
    groupPatched: () => dropPatched, groupCheckpoints: withCheckpoints, groupStackmates: stackmates });
}

export function uninstall() {
  dropHandle?.unwrap();
  dropHandle = null;
  dropPatched = false;
  stackOf.clear();
  driven.clear();
  undoKeyOf.clear();
  undoTokenKey.clear();
  last = null;
  cutLast = null;
  stepLast = null;
  waveLast = null;
  fightLast = null;
  undoLast = null;
  told.length = 0;
  fallbacks.length = 0;
  latestDrop.clear();
  inFlight.clear();
  Object.assign(perf, { drops: 0, maxMs: 0, lastMs: null });
  feature = null;
}
