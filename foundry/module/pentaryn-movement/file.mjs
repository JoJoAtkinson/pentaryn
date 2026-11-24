/**
 * Pentaryn Movement — the feature: the file, a group drag (0.10, plan context/plans/pathfinding-2026-11.md §18; Joe's
 * leader rule, 2026-11-24). drop.mjs asks it through ctx.exposed at run time (never an import between two features).
 *
 * The plan (0.10 L1): the token grabbed leads (a rider's mount when a rider is grabbed). Where it is dropped picks the
 * shape: on a token outside the group that this client can see, a SWARM round that token; anywhere else a MARCH, the
 * leader on the drop square and the rest behind it. file-core planLead gives every member its square and one route
 * (the pathfinder's, round the tokens standing outside the group and the squares given out before it; the leader's
 * through its own group), the floods on the pathfinder's shared step memo. A member with no square it can reach stays
 * and is named; the leader with no way moves nobody ("No route there").
 * The motion (0.10 L2, R5): the leader goes in the drop's own update, the pack one wave (150 ms) later, or once a
 * leader that starts behind is a wave past the frontmost member; single file only at a narrow point (a door, a
 * one-wide way), and a member is held while one would walk through it at rest; the last at most 4 s after the drop
 * (file-core staggerFile). Every later wave goes by setTimeout (drop.mjs sends it). In a fight: the order and each
 * member's square at its turn (fightPlan, slotAtTurn).
 *
 * Which tokens move together: this client holds every group it sent until its members are at rest, its waves are
 * sent and its fight queue is done (read when asked), and every client learns a group's members and its sender from
 * the update option its moves carry (GROUP_OPT).
 *
 * The three runtime handlers share one primitive, stop where drawn (§2):
 *   - a click on any member stops the whole group (decision 3 as revised 2026-11-24): the clicker stops the one
 *     clicked, and the dragger's screen, seeing that stop, stops the rest and drops its unsent waves (onGroupTag);
 *     a member whose wave was on its way then stops where it is drawn as soon as its move comes back (lateStops);
 *   - a wall or door change stops this client's walkers whose way it crosses (drop.mjs cutAcross), and a wave sent
 *     after it is tested against the walls as they are then (a member whose way is shut stays where it is drawn);
 *   - a hidden tab keeps its waves in order on their own timers (0.10 L3: they fire on whole seconds), the last by 4 s.
 * A wave skips a member no longer at its start (drop.mjs).
 */

import { STAGGER, planLead, staggerFile } from "./file-core.mjs";
import { GROUP_MAX, MOTION, radiusOf } from "./motion-core.mjs";
import { pathLength } from "./group-core.mjs";
import { pointsBack } from "./narrow-core.mjs";
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
  markLate(g);
  dropGroup(gid, why);
  return [...g.ids];
}

/**
 * Members a stop of their group could not reach yet (Fable's check of 0.9.0-dev, blocker 3; simulator seeds 58, 373,
 * 535, 588): a wave sent them, its write is not back, so nothing walks to stop; when the write comes back they would
 * walk their whole route through the mates stopped meanwhile. Each is stopped where it is drawn as soon as its move
 * comes back here (onGroupTag). token id → until (Date.now() ms).
 */
const lateStops = new Map();
/** How long a stop waits for such a member's write (ms): drop.mjs's IN_FLIGHT_MS. */
const LATE_MS = 3000;
let lateCount = 0;

/** Group `g` is being stopped: every member this client has just sent and that is not moving yet stops on arrival. */
function markLate(g) {
  let flying = [];
  try { flying = feature?.exposed?.groupInFlight?.() ?? []; } catch (err) { log?.debug?.("file: in flight", err); }
  const until = Date.now() + LATE_MS;
  for (const f of flying) {
    if (!g.ids.has(f.id)) continue;
    const doc = g.scene?.tokens?.get?.(f.id);
    if (doc && movingNow(doc)) continue;
    lateStops.set(f.id, until);
  }
}

/** One batch of late stops (one wave's write: every member in it, sharing one stop's claims). */
let lateBatch = null;
/** A late member's move is back on this client: stop it where it is drawn (its start, near enough), with its batch. */
function stopLate(doc) {
  if (!lateBatch) {
    lateBatch = [];
    setTimeout(() => batched(() => {
      const list = lateBatch ?? [];
      lateBatch = null;
      const docs = list.filter(d => d?.object && !d.object.destroyed);
      const group = { skip: new Set(docs.map(d => d.id)), claims: [] };
      for (const d of orderOf(docs)) {
        try {
          if (inCombat(d)) feature?.exposed?.stopSafely?.(d);
          else feature?.exposed?.stopDisplace?.(d.object, group);
          lateCount += 1;
        } catch (err) { log?.debug?.("file: a late stop", err); }
      }
      try { feature?.exposed?.stopAlso?.(group); } catch (err) { log?.debug?.("file: a late stop's also", err); }
      if (stopped && docs.length) stopped.late = (stopped.late ?? 0) + docs.length;
    }), 0);
  }
  lateBatch.push(doc);
}

/** Documents one stop settles, the front ones first (stop.mjs stopOrderOf, 0.10 L3). */
function orderOf(docs) {
  try {
    const tokens = feature?.exposed?.stopOrderOf?.(docs.map(d => d.object)) ?? null;
    return tokens ? tokens.map(t => t.document) : docs;
  } catch (err) { log?.debug?.("file: the stop's order", err); return docs; }
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
function scheduleWaves(gid, waves, send, ends = null) {
  const g = groups.get(gid);
  if (!g || typeof send !== "function") return 0;
  g.send = send;
  g.t0 = Date.now();
  g.ends = ends instanceof Map ? ends : null;
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
/** The latest a hidden tab's wave is timed for (ms after the drop): its timers fire on the next whole second, so by 4 s. */
const HIDDEN_LAST_MS = 3000;
/**
 * The page went to the background (0.10 L3; 0.8 to L2 sent every remaining wave at once, and a whole file set off
 * together: the simulator's crowds jammed in the doorway and a door cut left them on each other). A hidden tab's
 * timers fire on whole seconds, so the waves keep their order on their own timers; one due later than 3 s after the
 * drop is timed for 3 s, and the last still goes within 4 s of the drop.
 */
function onVisibility() {
  if (globalThis.document?.visibilityState !== "hidden") return;
  let kept = 0, retimed = 0;
  const t = Date.now();
  for (const [gid, g] of [...groups]) {
    const t0 = g.t0 ?? t;
    for (const w of [...g.waves]) {
      if (t0 + w.at <= t0 + HIDDEN_LAST_MS) { kept += w.ids.length; continue; }
      clearTimeout(w.timer);
      w.timer = setTimeout(() => fireWaves(gid, [w]), Math.max(0, t0 + HIDDEN_LAST_MS - t));
      retimed += w.ids.length;
    }
  }
  if (kept + retimed) {
    flushLast = { at: new Date().toISOString(), members: kept + retimed, kept, retimed };
    feature?.exposed?.tele?.("flush", { members: kept + retimed });
  }
}

/**
 * Where this client's members still waiting for their wave will rest (0.10 L3, the simulator's seed 6166: a stop
 * carried a token onto one): [{ id, x, y }] (top-left pixels, the plan's), for stop.mjs takenAround.
 */
function pendingEnds() {
  const out = [];
  for (const g of groups.values()) {
    if (!g.ends) continue;
    for (const w of g.waves) for (const id of w.ids) { const e = g.ends.get(id); if (e) out.push({ id, x: e.x, y: e.y }); }
  }
  return out;
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
const stoppedLast = () => (stopped ? { ...stopped, lateTotal: lateCount } : null);

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
  // This client's own wave write of a member whose group was stopped while it was on its way: stop it now.
  if (doc?.id && lateStops.has(doc.id) && userId === globalThis.game?.user?.id && !options?.pentarynMovementStop) {
    const until = lateStops.get(doc.id);
    lateStops.delete(doc.id);
    if (Date.now() <= until) stopLate(doc);
  }
  if (!options?.pentarynMovementStop || !doc?.id || userId === globalThis.game?.user?.id) return;
  if (!groupOf.has(doc.id)) return;
  stopGroupHere(doc, "foreign", options.pentarynMovementStopAt ?? null);
}

/** Run one stop as one update (stop.mjs stopBatched, 0.10 L3 fix round). */
const batched = fn => (feature?.exposed?.stopBatched ? feature.exposed.stopBatched(fn) : fn());

/**
 * Stop the group token `doc` belongs to, on the client that sent it: everything unsent goes, and each other member
 * still walking stops where it is drawn (stop.mjs's displace out of combat; stopSafely in a fight). `restAt`: where the
 * stop of `doc` will rest when it is carried on past a door or clear of a token (its write names it, top-left pixels;
 * 0.10 L2 fix (b): a mate was rested there). Returns the ids stopped (the members' ids, `doc` itself left to whoever
 * stopped it).
 */
function stopGroupHere(doc, why, restAt = null) { return batched(() => stopGroupNow(doc, why, restAt)); }
function stopGroupNow(doc, why, restAt) {
  const ids = groupCancel(doc.id, { why });
  const scene = doc.parent;
  const out = [];
  // `restAt` names, by id, every token one stop wrote in its update (0.10 L3 fix round: one stop, one update); those
  // are the sender's. An older write named only `doc`'s spot ({ x, y }).
  const named = Number.isFinite(restAt?.x) ? { [doc.id]: restAt } : (restAt && typeof restAt === "object" ? restAt : {});
  const list = ids.filter(id => id !== doc.id && !(id in named)).map(id => scene?.tokens?.get?.(id))
    .filter(d => d?.object && !d.object.destroyed && d.movement?.user?.isSelf && movingNow(d));
  // One stop for the rest: none rests inside another, nor inside the one stopped already, nor where it will rest
  // (0.9.0 simulator, step 5; 0.10 L2).
  const group = { skip: new Set(list.map(d => d.id)), claims: [] };
  for (const [id, at] of Object.entries(named)) {
    const d = scene?.tokens?.get?.(id) ?? (id === doc.id ? doc : null);
    if (!d?._source || !Number.isFinite(at?.x) || !Number.isFinite(at?.y)) continue;
    const s = gridSize(d.object ?? { document: d });
    const w = d._source.width ?? 1, h = d._source.height ?? 1;
    group.claims.push({ id, x: at.x + (w * s) / 2, y: at.y + (h * s) / 2, r: radiusOf(w, h) * s });
  }
  for (const d of orderOf(list)) {
    try {
      if (inCombat(d)) feature?.exposed?.stopSafely?.(d);
      else feature?.exposed?.stopDisplace?.(d.object, group);
      out.push(d.id);
    } catch (err) { log?.debug?.("file: stop a member", err); }
  }
  try { for (const id of feature?.exposed?.stopAlso?.(group) ?? []) out.push(id); } catch (err) { log?.debug?.("file: stop also", err); }
  groupNoteStop({ why, members: out.length + 1, whole: true });
  return out;
}

/* -------------------------------------------- */
/*  The leader plan (0.10 L1)                   */
/* -------------------------------------------- */

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One route search's wall-clock cap (ms): a long or impossible route rules that spot out instead of freezing the drop. */
const ROUTE_MS = 120;

/**
 * The token a group drop lands on, when it swarms (R2): the leader's drop centre inside a token outside the group
 * that this client can see (friend, foe or prop), on the same level. A hidden token never (also for the GM): then it
 * is a march and the token stands in the way. { id, x, y, w, h } (centre and size in squares) or null.
 */
function targetOf(anchor, centre, ids, s) {
  const level = anchor.document?._source?.level;
  const p = { x: centre.x * s, y: centre.y * s };
  let best = null;
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const doc = t?.document;
    if (!doc?._source || ids.has(doc.id) || t.isPreview || t.destroyed || doc.hidden || !t.visible) continue;
    if (level !== undefined && doc._source.level !== undefined && doc._source.level !== level) continue;
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const x0 = doc._source.x, y0 = doc._source.y;
    if (p.x < x0 || p.y < y0 || p.x >= x0 + w * s || p.y >= y0 + h * s) continue;
    const c = toSquares(doc._source, w, h, s);
    if (!best || Math.hypot(c.x - centre.x, c.y - centre.y) < Math.hypot(best.x - centre.x, best.y - centre.y)) best = { id: doc.id, ...c, w, h };
  }
  return best;
}

/**
 * The oracles planLead asks for a drop (file.mjs's view of the canvas): the member records, the tokens standing
 * outside it, where a member may rest (restWalkable and the places to avoid), and one step between neighbouring
 * squares (the walls a 1×1 body of the leader meets, on the pathfinder's shared step memo, so the rank flood, the
 * walk to the drop and every member's reach share one answer per step).
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
  // One step for a 1×1 body (the lattice on whole squares: node (i, j) is the square at row i, column j).
  const lead = members[0];
  let field = null;
  try {
    const src = lead.token.document._source;
    const at = { ...src, x: 0, y: 0, width: 1, height: 1, snapped: true };
    field = fieldFor(lead.token, at, at, { preview: true, constrain, automation: dnd5eMovementAutomation(), memo: feature.exposed.pathfindMemo?.() ?? new Map(),
      narrowCache: feature.exposed.pathfindNarrowCache?.() ?? null });
  } catch (err) { log?.debug?.("file: the step field", err); field = null; }
  // Through a narrow way (0.10 R9) two squares join where a part of one meets a part of the other (narrow-core).
  const nf = field?.narrow?.field ?? null;
  const step = (a, b) => {
    if (!field) return true;
    try {
      if (field.wall(a, b)) return true;
      if (!nf || (!nf.tight(a.i, a.j) && !nf.tight(b.i, b.j))) return false;
      return nf.adjacent(a.i, a.j, b.i - a.i, b.j - a.j).length > 0;
    } catch { return false; }
  };
  return { s, members, standing, origins, walkable, step, narrow: nf };
}

/**
 * A march whose leader rests on a narrow way (0.10 R9; Fable's constraint 6): the members after it (least walk left
 * first) take points on the leader's own way back from where it rests, one token apart (their radii and the rest gap),
 * while those points lie on the narrow way and are clear of the tokens standing; each gets one route there. The rest
 * keep planLead's squares (off the narrow way). Changes `plan` in place.
 */
function lineBehind(plan, members, standing, origins, s, nf) {
  const L = members.find(m => m.id === plan.leader);
  const lead = plan.members[L?.id];
  const pts = lead?.points;
  if (!nf || !L || !(pts?.length >= 2)) return;
  const route = routeOracle(origins, s);
  const claimed = [{ ...lead.slot, r: L.r, id: L.id }];
  let back = 0, prevR = L.r;
  for (const id of plan.byWalk ?? []) {
    if (id === L.id) continue;
    const m = members.find(x => x.id === id);
    if (!m || m.w > 1 || m.h > 1 || plan.members[id]?.atStart) break;
    back += prevR + m.r + MOTION.restGap;
    const [p] = pointsBack(pts, [back]);
    if (!p || !nf.tight(Math.floor(p.y), Math.floor(p.x))) break;
    if (standing.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r + m.r + MOTION.restGap - 1e-6)) break;
    let way = null;
    try { way = route(m, m.start, p, [...standing, ...claimed]); } catch { way = null; }
    if (!way) break;
    plan.members[id] = { ...plan.members[id], slot: p, points: way, walk: pathLength(way), stay: undefined, line: true };
    plan.stayed = (plan.stayed ?? []).filter(x => x !== id);
    claimed.push({ ...p, r: m.r, id });
    prevR = m.r;
  }
}

/** A route oracle for planLead (centres in squares; avoid circles in squares, their own radius). */
function routeOracle(origins, s) {
  return (m, from, to, avoid) => {
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
}

/**
 * Plan a group drop by the leader rule (out of combat): the shape from where it lands (R2), planLead's slots and
 * routes, then the start delays (staggerFile, R5: the leader at once, the pack one wave later, single file only at a
 * narrow point, the last within 4 s of the drop). `anchor` is the grabbed token (or its mount); riders walk with their
 * leaders (drop.mjs). Returns { plan, members, timing }, or null when there is nothing to plan. Reads only; never
 * throws past the caller's catch (drop.mjs: core's drop).
 */
function planDrop(anchor, contexts, { constrain = {} } = {}) {
  if (!feature || !anchor || contexts.length < 1) return null;
  const { s, members, standing, origins, walkable, step, narrow } = oraclesFor(anchor, contexts, constrain);
  const L = members[0];
  const target = targetOf(anchor, L.formation, new Set(members.map(m => m.id)), s);
  // A march dropped in a tight square (0.10 R9): the leader rests where it may there, on the narrow way's centre line.
  let drop = L.formation, rest = null;
  if (!target && L.w <= 1 && L.h <= 1) {
    try {
      const tl = toTopLeft(L.formation, L.w, L.h, s);
      const rp = feature.exposed.pathfindRestPoint?.(L.token, { ...origins.get(L.id), x: tl.x, y: tl.y }, { preview: true });
      if (rp) { rest = toSquares(rp, L.w, L.h, s); drop = rest; }
    } catch (err) { log?.debug?.("file: a rest point", err); rest = null; }
  }
  const mayRest = rest ? (m, c) => (m.id === L.id && Math.hypot(c.x - rest.x, c.y - rest.y) < 1e-6) || walkable(m, c) : walkable;
  const plan = planLead({ members, leaderId: L.id, drop, target, standing },
    { walkable: mayRest, step, route: routeOracle(origins, s), now });
  if (rest && !plan.none) {
    try { lineBehind(plan, members, standing, origins, s, narrow); } catch (err) { log?.debug?.("file: the line behind", err); }
  }
  // The start delays, the last within 4 s of the drop (the plan's own time comes off the cap).
  const walks = plan.order.map(id => members.find(m => m.id === id))
    .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
    .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed, left: plan.members[m.id].left }));
  const capMs = Math.max(0, Math.floor((STAGGER.capMs - (plan.ms ?? 0)) / STAGGER.stepMs) * STAGGER.stepMs);
  const t1 = now();
  const timing = staggerFile(walks, { capMs, leaderId: plan.leader, step });
  timing.ms = Math.round((now() - t1) * 10) / 10;
  return { plan, members, timing };
}

/**
 * A fight's group drag at the drop (R7): its shape, its target and the order the members walk in (the leader, then
 * least walk left; planLead with no search). { shape, target, order } or null. Reads only.
 */
function fightPlan(anchor, contexts, { constrain = {} } = {}) {
  if (!feature || !anchor || !contexts.length) return null;
  try {
    const { s, members, standing, walkable, step } = oraclesFor(anchor, contexts, constrain);
    const L = members[0];
    const target = targetOf(anchor, L.formation, new Set(members.map(m => m.id)), s);
    const plan = planLead({ members, leaderId: L.id, drop: L.formation, target, standing }, { walkable, step, now });
    // The order (R7): the leader, then least walk left; each member's square is picked at its own turn (slotAtTurn).
    return { shape: plan.shape, target, order: plan.byWalk?.length ? plan.byWalk : plan.order, leader: L.id };
  } catch (err) { log?.debug?.("file: a fight's plan", err); return null; }
}

/**
 * A fight member's square when its turn comes (R7): planLead for that one member, every other token standing where
 * it stands now (the members already moved where they came to rest). March: behind where the leader came to rest
 * (`leaderAt`: its rest and the square its last step came from, top-left pixels); swarm: round the target. The
 * top-left pixels, or null (no free square it can reach: it stays, named). Reads only.
 */
function slotAtTurn(token, { shape = "march", target = null, leaderId = null, leaderAt = null } = {}) {
  if (!feature || !token?.document) return null;
  try {
    const doc = token.document;
    const s = gridSize(token);
    const ctx = { token, destination: { ...doc._source }, foundPath: [], waypoints: [] };
    const { members, standing, walkable, step, origins, narrow } = oraclesFor(token, [ctx]);
    const m = members[0];
    let leader = null, at = null;
    if (shape === "march") {
      const ldoc = leaderId ? doc.parent?.tokens?.get?.(leaderId) : null;
      if (!ldoc || !leaderAt) return null;
      const w = ldoc._source.width ?? 1, h = ldoc._source.height ?? 1;
      leader = { id: ldoc.id, w, h, r: radiusOf(w, h), start: toSquares(leaderAt.at, w, h, s) };
      at = { at: leader.start, from: toSquares(leaderAt.from ?? leaderAt.at, w, h, s) };
    }
    // The leader resting on a narrow way (0.10 R9, constraint 6): the first point clear of every token standing back
    // along this member's own way to it, one token apart, on the narrow way.
    if (leader && narrow && m.w <= 1 && m.h <= 1 && narrow.tight(Math.floor(leader.start.y), Math.floor(leader.start.x))) {
      let way = null;
      try { way = routeOracle(origins, s)(m, m.start, leader.start, []); } catch { way = null; }
      if (way) {
        const gap = MOTION.restGap;
        const near = p => standing.some(o => Math.hypot(o.x - p.x, o.y - p.y) < o.r + m.r + gap - 1e-6);
        for (let d = leader.r + m.r + gap; d < 40; d += 0.1) {
          const [p] = pointsBack(way, [d]);
          if (!p || !narrow.tight(Math.floor(p.y), Math.floor(p.x))) break;
          if (!near(p)) return toTopLeft(p, m.w, m.h, s);
        }
      }
    }
    const list = leader ? [leader, m] : [m];
    const plan = planLead({ members: list, leaderId: leader?.id ?? m.id, target: shape === "swarm" ? target : null, leaderAt: at,
      standing: standing.filter(o => o.id !== leader?.id) }, { walkable, step, now });
    const e = plan.members[m.id];
    if (!e || e.stay) return null;
    return toTopLeft(e.slot, m.w, m.h, s);
  } catch (err) { log?.debug?.("file: a fight member's square", err); return null; }
}

/** A member's waypoints (top-left pixels, after its origin) from its plan entry, or [] when it does not move. */
function waypointsFor(m, e) {
  if (!e || e.stay || !(e.points?.length >= 2)) return [];
  const px = e.points.px;
  if (!Array.isArray(px) || px.length < 2) return [];
  return px.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
}

/**
 * Dry run (R13): what a group drop of these tokens with the first one dropped at `point` (its top-left, pixels) would
 * do: the shape (march / swarm), the leader, the target, and each member's spot, route, start delay and why it stays.
 * Nothing moves.
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
    ok: true, result: plan.none ? "none" : "plan", shape: plan.shape, leader: plan.leader, target: plan.target,
    ms: plan.ms, searches: plan.searches, failed: plan.failed, order: plan.order, starts: timing.order, total: timing.total, pack: timing.pack,
    members: members.map(m => {
      const e = plan.members[m.id];
      const wps = waypointsFor(m, e);
      return { id: m.id, name: m.token.document.name, slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null,
        route: wps.map(p => ({ x: p.x, y: p.y })), waypoints: wps.length, stay: e?.stay ?? null, delay: timing.delays[m.id] ?? null };
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
    groupMax: () => GROUP_MAX, groupPlan: planDrop, groupFightPlan: fightPlan, groupSlotAtTurn: slotAtTurn, groupWaypoints: waypointsFor, groupDryRun: dryRun,
    groupWaves: scheduleWaves, groupPending: pendingWaves, groupPendingEnds: pendingEnds, groupFlushed: () => (flushLast ? { ...flushLast } : null),
    groupQueue: setQueue, groupQueueDone: queueDone, groupCancelQueues: cancelQueues });
}

export function uninstall() {
  try { globalThis.document?.removeEventListener?.("visibilitychange", onVisibility); } catch (err) { log?.debug?.("file: visibility listener", err); }
  for (const gid of [...groups.keys()]) dropGroup(gid, "uninstall");
  flushLast = null;
  lateStops.clear();
  lateBatch = null;
  lateCount = 0;
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  stopped = null;
  feature = null;
  log = null;
}
