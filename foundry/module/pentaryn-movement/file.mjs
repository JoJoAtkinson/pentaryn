/**
 * Pentaryn Movement — the feature: the file, a group drag (0.9.0, plan context/plans/pathfinding-2026-11.md §17;
 * Fable's review 2 §2 "Tier B, the file", "Fights, one at a time"). drop.mjs asks it through ctx.exposed at run time
 * (never an import between two features).
 *
 * B0, the floor (§4 step 2): at the drop, one pass (file-core planFile) gives every member its slot (the free spot
 * nearest its formation spot that it can reach) and an A* route round the tokens standing outside the drop and round
 * the slots already given out. A member with no reachable slot stays where it stands and is named in a notice.
 * B1, the file (§4 step 3): each member then gets a start delay (file-core staggerFile: in sequence order, the first
 * one at which it meets no member timed before it; the last at most 4 s after the drop; on open ground all 0). The
 * members at 0 go in the drop's own update; every later wave goes by setTimeout (drop.mjs sends it). No settle, no
 * second pass, no reservations.
 *
 * Which tokens move together: this client holds every group it sent until its members are at rest, its waves are
 * sent and its fight queue is done (read when asked), and every client learns a group's members and its sender from
 * the update option its moves carry (GROUP_OPT).
 *
 * The three runtime handlers share one primitive, stop where drawn (§2):
 *   - a click on any member stops the whole group (decision 3 as revised 2026-11-24): the clicker stops the one
 *     clicked, and the dragger's screen, seeing that stop, stops the rest and drops its unsent waves (onGroupTag);
 *   - a wall or door change stops this client's walkers whose way it crosses (drop.mjs cutAcross), and a wave sent
 *     after it is tested against the walls as they are then (a member whose way is shut stays where it is drawn);
 *   - a hidden tab sends its remaining waves at once (its timers would be throttled).
 * A wave skips a member no longer at its start (drop.mjs).
 */

import { FILE, STAGGER, candidatesFor, planFile, staggerFile } from "./file-core.mjs";
import { flood } from "./group-core.mjs";
import { avoidDist } from "./pathfind-core.mjs";
import { gridSize, inCombat, memberOf, othersOf, restWalkable, toSquares, toTopLeft } from "./group-adapter.mjs";
import { fieldFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { dnd5eMovementAutomation } from "./settings.mjs";
import { resolveRef } from "./lib/resolve.mjs";
import { errorCode } from "./lib/errors.mjs";

let log = null;
let feature = null;
/** The update option that names the group a move belongs to, so every client knows its members (decision 3). */
const GROUP_OPT = "pentarynMovementGroup";

/**
 * Groups this client sent: id → { ids: Set, scene, at, waves: [{ at, ids, timer }], send, queue }. `waves`: the
 * waves still to send and `send(ids)` the sender (drop.mjs); `queue`: a fight's one-at-a-time queue ({ cancel(why) }).
 */
const groups = new Map();
const groupOf = new Map();                 // token id → group id
/** Every client: token id → { gid, at, user } from the update options of a group's moves. */
const tagOf = new Map();
/** How long a group names its members (ms): longer than any walk it sends. */
const HOLD_MS = 60000;
let stopped = null;                        // the last stop of a group (stop.mjs), for status()

/** The most members a group drag plans (more: core's own drop). */
const FILE_MAX = 12;

/** A moving token: drawn walking, or between two squares of its move. */
function movingNow(doc) {
  const t = doc?.object;
  let animating = false;
  try { animating = !!t && !t.destroyed && [...(t.animationContexts?.values?.() ?? [])].length > 0; } catch { animating = false; }
  const st = doc?.movement?.state;
  return animating || st === "pending" || st === "paused";
}

/** Hold the members of a group this client just sent. Returns the group's id. */
function holdGroup(ids, scene) {
  const gid = foundry.utils.randomID();
  for (const id of ids) {
    const old = groupOf.get(id);
    if (old && groups.get(old)) groups.get(old).ids.delete(id);
    groupOf.set(id, gid);
  }
  groups.set(gid, { ids: new Set(ids), scene, at: Date.now(), waves: [], send: null, queue: null });
  prune();
  return gid;
}

/** Is a group still busy on this client: a wave to send, or a fight queue running? */
const busy = g => g.waves.length > 0 || !!g.queue;

/** Drop groups whose members are all at rest, or older than HOLD_MS (no timers: read when asked). */
function prune() {
  const t = Date.now();
  for (const [gid, g] of groups) {
    if (busy(g)) continue;
    const alive = t - g.at <= 1500 || [...g.ids].some(id => movingNow(g.scene?.tokens?.get?.(id)));
    if (alive && t - g.at <= HOLD_MS && g.ids.size) continue;
    for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
    groups.delete(gid);
  }
}

/** How many groups this client holds now. */
function heldCount() { prune(); return groups.size; }

/**
 * Stop a group this client sent (click-to-stop): it is no longer held. Returns the ids of its members (the caller
 * stops those moving), or [] when this client holds no group for the token. Its unsent waves and its fight queue go too
 * (`why`: what stopped it, for the queue).
 */
function groupCancel(tokenId, { why = "click" } = {}) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  dropGroup(gid, why);
  return [...g.ids];
}

/** Forget group `gid` on this client: its unsent waves are dropped and its fight queue emptied. */
function dropGroup(gid, why = "click") {
  const g = groups.get(gid);
  if (!g) return;
  for (const w of g.waves) clearTimeout(w.timer);
  g.waves = [];
  const q = g.queue;
  g.queue = null;
  try { q?.cancel?.(why); } catch (err) { log?.debug?.("file: empty the fight queue", err); }
  for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
  groups.delete(gid);
}

/* -------------------------------------------- */
/*  B1: waves (step 3)                          */
/* -------------------------------------------- */

/**
 * Send group `gid`'s later waves by setTimeout: `waves` [{ at (ms after now), ids }], `send(ids)` sends those members
 * (drop.mjs: skips one no longer at its start, tests its way against the walls as they are then). A wave at 0 is the
 * drop's own update and never comes here.
 */
function scheduleWaves(gid, waves, send) {
  const g = groups.get(gid);
  if (!g || typeof send !== "function") return 0;
  g.send = send;
  for (const w of waves) {
    if (!(w.ids?.length) || !(w.at > 0)) continue;
    const wave = { at: w.at, ids: [...w.ids], timer: null };
    wave.timer = setTimeout(() => fireWaves(gid, [wave]), w.at);
    g.waves.push(wave);
  }
  return g.waves.length;
}

/** Send `list` (waves of group gid) now, as one update: they leave the group's pending waves first. */
function fireWaves(gid, list) {
  const g = groups.get(gid);
  if (!g) return;
  for (const w of list) clearTimeout(w.timer);
  g.waves = g.waves.filter(w => !list.includes(w));
  const ids = list.flatMap(w => w.ids);
  if (!ids.length) return;
  g.at = Date.now();
  try { g.send?.(ids); }
  catch (err) {
    log?.warnOnce?.("file-wave", "a wave of a group drag could not be sent (further errors suppressed)", err);
    feature?.exposed?.tele?.("error", { reason: "wave", message: String(err?.message ?? err).slice(0, 120) });
  }
}

let flushLast = null;
/** The page went to the background: its timers would be throttled, so every remaining wave goes now (§2). */
function onVisibility() {
  if (globalThis.document?.visibilityState !== "hidden") return;
  let n = 0;
  for (const [gid, g] of [...groups]) {
    if (!g.waves.length) continue;
    n += g.waves.reduce((a, w) => a + w.ids.length, 0);
    fireWaves(gid, [...g.waves]);
  }
  if (n) {
    flushLast = { at: new Date().toISOString(), members: n };
    feature?.exposed?.tele?.("flush", { members: n });
  }
}

/** The waves this client still has to send: [{ gid, at, ids }] (status). */
function pendingWaves() {
  const out = [];
  for (const [gid, g] of groups) for (const w of g.waves) out.push({ gid, at: w.at, ids: [...w.ids] });
  return out;
}

/* -------------------------------------------- */
/*  A fight's queue (step 4)                    */
/* -------------------------------------------- */

/** Register group gid's fight queue ({ cancel(why) }): the group is busy until it ends (fileQueueDone). */
function setQueue(gid, queue) {
  const g = groups.get(gid);
  if (!g) return false;
  g.queue = queue;
  return true;
}

/** A fight queue ended on its own: the group is held only while its members walk. */
function queueDone(gid, queue) {
  const g = groups.get(gid);
  if (g && g.queue === queue) { g.queue = null; g.at = Date.now(); }
}

/** Empty every fight queue this client runs (a turn change, a new drop): { gid, ids } of each. */
function cancelQueues(why) {
  const out = [];
  for (const [gid, g] of [...groups]) {
    if (!g.queue) continue;
    const q = g.queue;
    g.queue = null;
    try { q.cancel?.(why); } catch (err) { log?.debug?.("file: empty the fight queue", err); }
    out.push({ gid, ids: [...g.ids] });
  }
  return out;
}

/** deleteToken, this client: a member of a fight queue it runs was deleted, so that queue ends. */
function onDeleteToken(doc) {
  const gid = doc?.id ? groupOf.get(doc.id) : null;
  const g = gid ? groups.get(gid) : null;
  if (!g?.queue) return;
  const q = g.queue;
  g.queue = null;
  try { q.cancel?.("deleted"); } catch (err) { log?.debug?.("file: empty the fight queue", err); }
}

/** updateCombat / deleteCombat, this client: a turn change (or the fight's end) empties every fight queue it runs. */
function onCombatChange(_combat, changes) {
  if (changes && !("turn" in changes) && !("round" in changes) && !("started" in changes) && !("active" in changes)) return;
  cancelQueues("turn");
}

/** A click (or the API) stopped a group (stop.mjs): recorded for status().group.stopped. */
function groupNoteStop({ why = "click", members = 0, whole = false } = {}) {
  stopped = { at: new Date().toISOString(), why, members, whole };
}
const stoppedLast = () => (stopped ? { ...stopped } : null);

/**
 * The members of the group a token moves with: `held` when this client sent the group, else the tokens every client
 * saw tagged with the same group lately. `{ held: false, ids: [] }` when it is in no group.
 */
function groupMembers(tokenId) {
  prune();
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (g) return { held: true, ids: [...g.ids], sender: globalThis.game?.user?.id ?? null };
  const tag = tagOf.get(tokenId);
  if (!tag || Date.now() - tag.at > HOLD_MS) return { held: false, ids: [], sender: null };
  const ids = [];
  for (const [id, t] of tagOf) if (t.gid === tag.gid && Date.now() - t.at <= HOLD_MS) ids.push(id);
  return { held: false, ids, sender: tag.user ?? null };
}

/**
 * updateToken, every client: remember which group a move belongs to (its update option) and who sent it. On the
 * client that sent a group, another user's stop of one member (a click's displace, decision 3 as revised 2026-11-24)
 * stops the whole group: its unsent waves are dropped, its fight queue emptied, and every other member still walking
 * is stopped where it is drawn (out of combat) or on the square it holds (in a fight).
 */
function onGroupTag(doc, options, userId) {
  const gid = options?.[GROUP_OPT];
  if (doc?.id && typeof gid === "string") {
    tagOf.set(doc.id, { gid, at: Date.now(), user: userId ?? null });
    if (tagOf.size > 500) tagOf.delete(tagOf.keys().next().value);
  }
  if (!options?.pentarynMovementStop || !doc?.id || userId === globalThis.game?.user?.id) return;
  if (!groupOf.has(doc.id)) return;
  stopGroupHere(doc, "foreign");
}

/**
 * Stop the group token `doc` belongs to, on the client that sent it: everything unsent goes, and each other member
 * still walking stops where it is drawn (stop.mjs's displace out of combat; stopSafely in a fight). Returns the ids
 * stopped (the members' ids, `doc` itself left to whoever stopped it).
 */
function stopGroupHere(doc, why) {
  const ids = groupCancel(doc.id, { why });
  const scene = doc.parent;
  const out = [];
  const list = ids.filter(id => id !== doc.id).map(id => scene?.tokens?.get?.(id))
    .filter(d => d?.object && !d.object.destroyed && d.movement?.user?.isSelf && movingNow(d));
  // One stop for the rest: none rests inside another, nor inside the one stopped already (0.9.0 simulator, step 5).
  const group = { skip: new Set(list.map(d => d.id)), claims: [] };
  for (const d of list) {
    try {
      if (inCombat(d)) feature?.exposed?.stopSafely?.(d);
      else feature?.exposed?.stopDisplace?.(d.object, group);
      out.push(d.id);
    } catch (err) { log?.debug?.("file: stop a member", err); }
  }
  groupNoteStop({ why, members: out.length + 1, whole: true });
  return out;
}

/* -------------------------------------------- */
/*  B0: slots and routes in one pass            */
/* -------------------------------------------- */

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One route search's wall-clock cap (ms): a long or impossible route rules that spot out instead of freezing the drop. */
const ROUTE_MS = 120;
/** How far (squares, rings of the flood) a slot may be walked from its formation spot (file-core's FILE.reach). */
const REACH_RINGS = FILE.reach;

/**
 * The oracles file-core asks for a drop (file.mjs's view of the canvas): the member records, the tokens standing
 * outside it, where a member may rest (restWalkable and the places to avoid) and the walk from each formation spot
 * (a flood through walls and blocking creatures, built on first use).
 */
function oraclesFor(anchor, contexts, constrain = {}) {
  const s = gridSize(anchor);
  const ordered = [...contexts].sort((a, b) => (a.token === anchor ? -1 : b.token === anchor ? 1 : 0));
  const members = ordered.map(c => memberOf(c, s));
  const standing = othersOf(members, s);
  const origins = new Map(members.map(m => [m.id, feature.exposed.pathfindOrigin?.(m.token.document) ?? { ...m.token.document._source }]));
  const avoidMemo = new Map();
  const hazards = m => {
    if (!avoidMemo.has(m.id)) {
      let hz = null;
      try { hz = placesToAvoid(m.token, origins.get(m.id), { ...m.dest, width: m.w, height: m.h }, { preview: true }); } catch { hz = null; }
      avoidMemo.set(m.id, hz);
    }
    return avoidMemo.get(m.id);
  };
  const walkable = (m, c) => {
    try { return restWalkable(m, c, s) && !hazards(m)?.at?.(toTopLeft(c, m.w, m.h, s)); } catch { return false; }
  };
  // Walk distances from each member's formation spot (walls and blocking creatures), built on first use: the spots
  // are tried nearest by walking, never one round the far side of a wall (file-core candidatesFor).
  const floods = new Map();
  const walk = (m, c) => {
    if (!floods.has(m.id)) {
      try {
        const f = fieldFor(m.token, m.dest, m.dest, { preview: true, constrain, automation: dnd5eMovementAutomation() });
        floods.set(m.id, { f, walk: flood({ i: 0, j: 0 }, (a, b) => !f.blocked(b) && f.wall(a, b), REACH_RINGS) });
      } catch (err) { log?.debug?.("file: the walk from a formation spot", err); floods.set(m.id, null); }
    }
    const fl = floods.get(m.id);
    if (!fl) return Math.hypot(c.x - m.formation.x, c.y - m.formation.y);
    const n = fl.f.nodeOf(toTopLeft(c, m.w, m.h, s));
    return fl.walk.get(`${n.i},${n.j}`) ?? null;
  };
  return { s, members, standing, origins, walkable, walk };
}

/**
 * A fight's spots (§4 step 4, 0.9.0 simulator step 5): for each member of a drop, the squares it may rest on when its
 * formation square is no good (off the scene, behind a wall, in rock), nearest it first, each one the drop point
 * reaches (file-core candidatesFor with the grabbed one). id → [top-left pixels]. Reads only; {} on any failure.
 */
function fightSpots(anchor, contexts, { constrain = {} } = {}) {
  if (!feature || !anchor || !contexts.length) return {};
  try {
    const { s, members, walkable, walk } = oraclesFor(anchor, contexts, constrain);
    const lead = members.find(m => m.id === anchor.document.id) ?? members[0];
    // Never another member's own formation square where that one can rest (it walks there at its turn).
    const homes = members.filter(m => walkable(m, m.formation)).map(m => ({ id: m.id, x: m.formation.x, y: m.formation.y, r: m.r }));
    const out = {};
    for (const m of members) {
      const free = c => homes.every(o => o.id === m.id || Math.hypot(c.x - o.x, c.y - o.y) >= m.r + o.r - 1e-6);
      out[m.id] = candidatesFor(m, FILE.rings, walk, lead).filter(c => free(c) && walkable(m, c)).slice(0, 2 * FILE.tries).map(c => toTopLeft(c, m.w, m.h, s));
    }
    return out;
  } catch (err) { log?.debug?.("file: a fight's spots", err); return {}; }
}

/**
 * Plan B0 for the leaders of a group drop (riders walk with their leaders, drop.mjs). `anchor` is the grabbed token
 * (or its leader). Returns { plan, members } (file-core's plan, the member records), or null when there is nothing to
 * plan. Reads only; never throws past the caller's catch (drop.mjs: core's drop).
 */
function planDrop(anchor, contexts, { constrain = {}, stagger = true } = {}) {
  if (!feature || !anchor || contexts.length < 1) return null;
  const { s, members, standing, origins, walkable, walk } = oraclesFor(anchor, contexts, constrain);
  const route = (m, from, to, avoid) => {
    const origin = origins.get(m.id);
    const tl = toTopLeft(to, m.w, m.h, s);
    const onGrid = tl.x % s === 0 && tl.y % s === 0;
    const dest = { ...origin, x: tl.x, y: tl.y, snapped: onGrid, explicit: true, checkpoint: true };
    const start = { x: from.x * s, y: from.y * s };
    const circles = avoid.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + m.r) * s - 1, box: true }))
      .filter(c => avoidDist(c, start, start) >= c.r);
    let r = null;
    try { r = feature.exposed.pathfindRouteTo?.(m.token, origin, dest, { preview: true, avoid: circles.length ? circles : null, maxMs: ROUTE_MS }); }
    catch (err) { log?.debug?.("file: a route", err); r = null; }
    if (!r?.reached || !(r.path?.length >= 2)) return null;
    const pts = r.path.map(p => toSquares(p, m.w, m.h, s));
    pts.px = r.path;
    return pts;
  };
  const plan = planFile({ members, anchorId: anchor.document.id, standing }, { walkable, walk, route, now });
  // B1: the start delays, the last within 4 s of the drop (the plan's own time comes off the cap).
  const walks = plan.order.map(id => members.find(m => m.id === id))
    .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
    .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed }));
  const capMs = Math.max(0, Math.floor((STAGGER.capMs - (plan.ms ?? 0)) / STAGGER.stepMs) * STAGGER.stepMs);
  const t1 = now();
  const timing = stagger ? staggerFile(walks, { capMs }) : { delays: Object.fromEntries(walks.map(w => [w.id, 0])), order: walks.map(w => w.id), total: 0, crowded: [] };
  timing.ms = Math.round((now() - t1) * 10) / 10;
  return { plan, members, timing };
}

/** A member's waypoints (top-left pixels, after its origin) from its plan entry, or [] when it does not move. */
function waypointsFor(m, e) {
  if (!e || e.stay || !(e.points?.length >= 2)) return [];
  const px = e.points.px;
  if (!Array.isArray(px) || px.length < 2) return [];
  return px.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
}

/**
 * Dry run: what a group drop of these tokens at `point` (the first token's destination, top-left pixels; the others
 * keep their offsets) would do. Nothing moves.
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
  const contexts = tokens.map(t => {
    const src = t.document._source;
    return { token: t, destination: { ...src, x: src.x + dx, y: src.y + dy, snapped: true, explicit: true, checkpoint: true }, foundPath: [], waypoints: [] };
  });
  const out = planDrop(tokens[0], contexts, { constrain: tokens[0]._getDragConstrainOptions?.() ?? {} });
  if (!out) return { ok: true, result: "core", reason: "noPlan", members: [] };
  const { plan, members, timing } = out;
  const s = gridSize(tokens[0]);
  return {
    ok: true, result: "plan", ms: plan.ms, passes: plan.passes, order: plan.order, starts: timing.order, total: timing.total,
    members: members.map(m => {
      const e = plan.members[m.id];
      return { id: m.id, name: m.token.document.name, slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null,
        waypoints: waypointsFor(m, e).length, stay: e?.stay && e.stay !== "still" ? e.stay : null, delay: timing.delays[m.id] ?? null };
    }),
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  reg.on("updateToken", (doc, _changes, options, userId) => onGroupTag(doc, options, userId), { label: "updateToken: which group a move belongs to; another user's stop of a member stops the group this client sent" });
  reg.on("deleteToken", doc => onDeleteToken(doc), { label: "deleteToken: a deleted member ends its fight queue" });
  reg.on("updateCombat", (combat, changes) => onCombatChange(combat, changes), { label: "updateCombat: a turn change empties the fight queues" });
  reg.on("deleteCombat", combat => onCombatChange(combat, null), { label: "deleteCombat: the fight's end empties the fight queues" });
  try { globalThis.document?.addEventListener?.("visibilitychange", onVisibility); } catch (err) { log?.debug?.("file: visibility listener", err); }
  ctx.expose({ groupCancel, groupMembers, groupNoteStop, groupHold: holdGroup, groupHeld: heldCount, groupStopped: stoppedLast,
    groupMax: () => FILE_MAX, groupPlan: planDrop, groupSpots: fightSpots, groupWaypoints: waypointsFor, groupDryRun: dryRun,
    groupWaves: scheduleWaves, groupPending: pendingWaves, groupFlushed: () => (flushLast ? { ...flushLast } : null),
    groupQueue: setQueue, groupQueueDone: queueDone, groupCancelQueues: cancelQueues });
}

export function uninstall() {
  try { globalThis.document?.removeEventListener?.("visibilitychange", onVisibility); } catch (err) { log?.debug?.("file: visibility listener", err); }
  for (const gid of [...groups.keys()]) dropGroup(gid, "uninstall");
  flushLast = null;
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  stopped = null;
  feature = null;
  log = null;
}
