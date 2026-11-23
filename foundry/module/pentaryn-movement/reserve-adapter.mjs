/**
 * Pentaryn Movement — server-ordered reservations, the Foundry side (0.6.0, overlap redesign stage 2; plan
 * context/plans/pathfinding-2026-11.md §15.4). ADAPTER (imports core and lib only): the registry and its reads;
 * group.mjs registers its hooks and makes the writes (the publish, a repair's re-publish).
 *
 * Every client keeps one registry (reserve-core) of the reservations it has received, in arrival order, which is
 * the server's order: a reservation rides a token update (options), and the server applies and broadcasts token
 * updates one at a time. A planner reads the registry (`liveFor`); a drop publishes its reservation before it moves
 * when another user could be planning at the same moment (`racers`), and decides at the publish's echo whether a
 * reservation it had not read came first (`raceWindow`).
 *
 * The publish is an empty token update with `diff: false` (as core's own stop / resume relays), so it goes through
 * the server's order, reaches every client and comes back to the sender before the update promise resolves; the
 * move itself follows at the echo. Hidden tokens are never in a reservation (players receive every option).
 */

import { encode, expire, moved, receive, registry, restsOf, stopped, walkersOf } from "./reserve-core.mjs";
import { MODULE } from "./movement-core.mjs";

/** The update option that carries a reservation (the wire, reserve-core encode). */
export const PLAN_OPT = "pentarynMovementPlan";
/** The update option that names, per token, the reservation a move walks ({ [tokenId]: rid }). */
export const RID_OPT = "pentarynMovementRid";

const now = () => globalThis.performance?.now?.() ?? Date.now();
let log = null;
/** May this user count a token (group-adapter countsForRoutes, given by group.mjs: an adapter imports no adapter). */
let countsToken = () => !!globalThis.game?.user?.isGM;
let reg = registry();
const counts = { received: 0, published: 0, inline: 0, raced: 0, replans: 0, queued: 0, fallback: 0, dropped: 0, republished: 0 };
let lastRace = null;

function configure({ log: l = null, counts: c = null } = {}) {
  log = l;
  if (typeof c === "function") countsToken = c;
}

function reset() {
  reg = registry();
  for (const k of Object.keys(counts)) counts[k] = 0;
  lastRace = null;
}

const note = (what, n = 1) => { counts[what] = (counts[what] ?? 0) + n; };
const noteRace = rec => { lastRace = { at: new Date().toISOString(), ...rec }; };

/* -------------------------------------------- */
/*  Receiving (every client)                    */
/* -------------------------------------------- */

/** updateToken, every client: a reservation in the options is recorded (once per rid). */
function onUpdate(doc, _changes, options) {
  const w = options?.[PLAN_OPT];
  if (!w) return;
  const had = reg.recs.has(w?.rid);
  const rec = receive(reg, w, { now: now() });
  if (rec && !had) note("received");
  if (rec && !rec.scene && doc?.parent?.id) rec.scene = doc.parent.id;
}

/** moveToken, every client: a move of a reserved token sets it off, continues it, or drops its reservation. */
function onMove(doc, movement, operation) {
  if (!doc?.id) return;
  if (operation?.[PLAN_OPT]) onUpdate(doc, null, operation);
  const r = moved(reg, doc.id, { rid: operation?.[RID_OPT]?.[doc.id] ?? null, movementId: movement?.id ?? null,
    chain: movement?.chain ?? [], now: now() });
  if (r === "dropped") note("dropped");
}

/** stopToken, every client: a stopped token stands where it is. */
function onStop(doc) {
  if (doc?.id) stopped(reg, doc.id);
}

/* -------------------------------------------- */
/*  Reading                                     */
/* -------------------------------------------- */

/** May this user count token `id` of `scene` (a player: only what it sees, never a hidden one) on `level`? */
function keeper(scene, level) {
  return id => {
    const doc = scene?.tokens?.get?.(id);
    if (!doc?._source) return false;
    if (level !== undefined && doc._source.level !== undefined && doc._source.level !== level) return false;
    const t = doc.object;
    return t ? countsToken(t) : !!globalThis.game?.user?.isGM;
  };
}

/**
 * What a planner of `members` ({ id, token }) reads: the reserved walks of every other token on their scene and level
 * ({ id, rid, r, points, speed, delay }, squares) and where those end (circles). `skip`: ids read otherwise (drawn
 * walking now: movingOthers is exact for those). `after` / `before`: a race's window (seq numbers).
 */
function liveFor(members, { skip = null, after, before } = {}) {
  const doc0 = members[0]?.token?.document;
  const scene = doc0?.parent ?? globalThis.canvas?.scene ?? null;
  if (!scene) return { walkers: [], rests: [] };
  const opts = { now: now(), scene: scene.id ?? null, exclude: new Set(members.map(m => m.id)), skip, keep: keeper(scene, doc0?._source?.level), after, before };
  return { walkers: walkersOf(reg, opts), rests: restsOf(reg, opts) };
}

/** The registry's arrival counter: a plan reads everything up to it. */
const seqNow = () => reg.seq;

/** The seq a reservation got here, or null (not arrived). */
const seqOf = rid => reg.recs.get(rid)?.seq ?? null;

/** Rest circles of the reserved walks round token `id` (pixel centres; for the repairs' "taken" checks). */
function restCircles(scene, id) {
  const doc = scene?.tokens?.get?.(id);
  if (!doc?._source) return [];
  const s = scene?.grid?.size ?? globalThis.canvas?.grid?.size ?? 100;
  const keep = keeper(scene, doc._source.level);
  return restsOf(reg, { now: now(), scene: scene.id ?? null, exclude: new Set([id]), keep })
    .map(c => ({ id: c.id, x: c.x * s, y: c.y * s, r: c.r * s }));
}

/**
 * Could another client be planning a drop at this moment (then a drop publishes first and decides at the echo)?
 * Another active user. `CONFIG.debug["pentaryn-movement.publishFirst"]` (true / false) forces it, for tests.
 */
function racers() {
  const forced = globalThis.CONFIG?.debug?.[`${MODULE}.publishFirst`];
  if (forced === true || forced === false) return forced;
  const me = globalThis.game?.user?.id;
  try { return (globalThis.game?.users ?? []).some?.(u => u?.active && u.id !== me) ?? false; } catch { return false; }
}

/* -------------------------------------------- */
/*  Writing                                     */
/* -------------------------------------------- */

/** A new reservation id. */
const newRid = () => (globalThis.foundry?.utils?.randomID?.() ?? Math.random().toString(36).slice(2, 18));

/** The wire for these walks (members: { id, r, speed, delay, points }, squares) on `doc`'s scene; hidden tokens left out. */
function wireFor(scene, members, { rid = newRid(), combat = false, replaces = null, level } = {}) {
  const visible = members.filter(m => !scene?.tokens?.get?.(m.id)?.hidden && (m.points?.length ?? 0) >= 2);
  if (!visible.length) return null;
  return encode({ rid, user: globalThis.game?.user?.id ?? null, scene: scene?.id ?? null, combat, replaces, level, members: visible });
}

/** The options a move carries for a reservation: the plan (inline) and every member's rid. */
function optionsFor(wire, { inline = true } = {}) {
  if (!wire) return {};
  const rids = Object.fromEntries(wire.members.map(m => [m.id, wire.rid]));
  return inline ? { [PLAN_OPT]: wire, [RID_OPT]: rids } : { [RID_OPT]: rids };
}

/** The reservations that arrived after `snap` and before `mine` (seq): earlier in the server's order, not read by the plan. */
function raceWindow(members, snap, mine) {
  return liveFor(members, { after: snap, before: mine ?? Infinity }).walkers;
}

function status() {
  expire(reg, now());
  const live = [...reg.recs.values()].map(r => ({ rid: r.rid, seq: r.seq, user: r.user, members: r.members.length, based: r.based }));
  return { live: live.length, reservations: live, ...counts, race: lastRace ? { ...lastRace } : null };
}

/** The registry's surface, one object (group.mjs imports it by name). */
export const reservations = Object.freeze({
  PLAN_OPT, RID_OPT, configure, reset, note, noteRace, onUpdate, onMove, onStop, liveFor, seqNow, seqOf, restCircles, racers,
  newRid, wireFor, optionsFor, raceWindow, status,
});
