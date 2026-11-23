/**
 * Pure server-ordered reservations for pentaryn-movement 0.6.0 (overlap redesign stage 2; plan
 * context/plans/pathfinding-2026-11.md §15.4). No Foundry globals.
 *
 * A plan's reservation is every member's whole walk (centre path in squares, start delay, speed): it rides an
 * update to the server (the publish, or the move itself), so every client receives every reservation in the
 * server's one order, and that order is the priority: the later one yields. Each client keeps a registry:
 *
 *   receive(reg, wire)          a reservation arrived (idempotent by rid; supersedes those tokens' older ones)
 *   moved(reg, id, …)           a move of token id arrived: its own reservation's (it set off now), a continuation
 *                               of that move (a fight's next square), or anything else (the reservation is dropped)
 *   stopped(reg, id)            it was stopped: it now stands where it is, as any standing token
 *   walkersOf / restsOf         what a planner reads: the reserved walks (with `delay`, ms from now) and their ends
 *
 * Dropping a member is always safe: a token whose reservation is gone counts where it stands (or walks) as before.
 * A reservation only adds what is about to happen.
 *
 * Units as motion-core.mjs: centres in grid squares, ms, squares per second.
 */

import { MOTION, dist } from "./motion-core.mjs";
import { onCell, settle, walkersMeet } from "./group-core.mjs";

export const RESERVE = Object.freeze({
  version: 1,
  estimateMs: 100,     // before its first move arrives, a reservation's wave 0 is taken to start this long after it
  echoMs: 1500,        // the publish's echo is awaited at most this long; past it the plan commits (fallback)
  commitMs: 150,       // the commit fallback: with no echo to read, wait this long, then read what arrived
  replans: 2,          // re-plans at the echo after a race lost; the next plan commits whatever arrives
  overdueMs: 1500,     // a member this late to set off is dropped (it stands at its start, as a standing token)
  restMs: 1000,        // a member this long past the end of its walk is dropped (its rest is the token itself)
  queueMs: 8000,       // the longest a plan waits for a reserved walk in its way to pass (liveness, design)
  singleMs: 3000,      // a single drag: the largest start delay tried before it queues
  maxMembers: 12,
  maxPoints: 160,
});

const EPS = 1e-6;
const num = v => typeof v === "number" && Number.isFinite(v);
const round3 = v => Math.round(v * 1000) / 1000;

/** A path's length (squares). */
export function lengthOf(points) {
  let L = 0;
  for (let k = 1; k < (points?.length ?? 0); k++) L += dist(points[k - 1], points[k]);
  return L;
}

/** How long a member walks (ms). */
export const durationOf = m => (lengthOf(m.points) / (m.speed > 0 ? m.speed : MOTION.speed)) * 1000;

/* -------------------------------------------- */
/*  Wire                                        */
/* -------------------------------------------- */

/**
 * The reservation as it rides an update's options: compact, plain JSON.
 * @param {{ rid, user?, scene, level?, combat?, replaces?, members: { id, r, speed?, delay?, points }[] }} rec
 */
export function encode(rec) {
  const members = (rec?.members ?? []).filter(m => m?.id && (m.points?.length ?? 0) >= 2).slice(0, RESERVE.maxMembers)
    .map(m => ({
      id: String(m.id), r: round3(m.r ?? 0.5), v: round3(m.speed > 0 ? m.speed : MOTION.speed), d: Math.max(Math.round(m.delay ?? 0), 0),
      p: m.points.slice(0, RESERVE.maxPoints).flatMap(q => [round3(q.x), round3(q.y)]),
    }));
  const out = { v: RESERVE.version, rid: String(rec.rid), scene: rec.scene ?? null, combat: !!rec.combat, members };
  if (rec.user) out.user = String(rec.user);
  if (rec.level !== undefined && rec.level !== null) out.level = rec.level;
  if (rec.replaces) out.replaces = String(rec.replaces);
  return out;
}

/** The wire back as a record, checked; null when it is not one. */
export function decode(w) {
  if (!w || typeof w !== "object" || w.v !== RESERVE.version || typeof w.rid !== "string" || !w.rid) return null;
  if (!Array.isArray(w.members)) return null;
  const members = [];
  for (const m of w.members.slice(0, RESERVE.maxMembers)) {
    if (!m || typeof m.id !== "string" || !num(m.r) || !num(m.v) || !num(m.d) || !Array.isArray(m.p)) continue;
    if (m.p.length < 4 || m.p.length % 2 || !m.p.every(num)) continue;
    const points = [];
    for (let k = 0; k < Math.min(m.p.length, 2 * RESERVE.maxPoints); k += 2) points.push({ x: m.p[k], y: m.p[k + 1] });
    members.push({ id: m.id, r: Math.max(m.r, 0), speed: m.v > 0 ? m.v : MOTION.speed, delay: Math.max(m.d, 0), points });
  }
  return {
    rid: w.rid, user: typeof w.user === "string" ? w.user : null, scene: w.scene ?? null, level: w.level ?? null,
    combat: !!w.combat, replaces: typeof w.replaces === "string" ? w.replaces : null, members,
  };
}

/* -------------------------------------------- */
/*  Registry                                    */
/* -------------------------------------------- */

export function registry() {
  return { seq: 0, recs: new Map(), byToken: new Map() };
}

/** Take token `id` out of reservation `rid` (the whole reservation when none is left). */
function removeMember(reg, rid, id) {
  const rec = reg.recs.get(rid);
  if (reg.byToken.get(id) === rid) reg.byToken.delete(id);
  if (!rec) return;
  rec.members = rec.members.filter(m => m.id !== id);
  if (!rec.members.length) reg.recs.delete(rid);
}

/** Drop reservation `rid` whole. */
export function removeReservation(reg, rid) {
  const rec = reg.recs.get(rid);
  if (!rec) return;
  for (const m of rec.members) if (reg.byToken.get(m.id) === rid) reg.byToken.delete(m.id);
  reg.recs.delete(rid);
}

/**
 * A reservation arrived (`now`: this client's clock, ms). The server's order is the order of arrival: each gets the
 * next `seq`. Idempotent by rid (one update, several tokens). It supersedes the reservations it `replaces` and, for
 * each of its tokens, that token's older one. Returns the record, or null for a wire that is not one.
 */
export function receive(reg, wire, { now = 0 } = {}) {
  const rec = decode(wire);
  if (!rec) return null;
  const had = reg.recs.get(rec.rid);
  if (had) return had;
  if (rec.replaces) removeReservation(reg, rec.replaces);
  rec.seq = ++reg.seq;
  rec.at = now;
  rec.base = now + RESERVE.estimateMs;
  rec.based = false;
  for (const m of rec.members) {
    m.startAt = null;
    m.mid = null;
    const prior = reg.byToken.get(m.id);
    if (prior && prior !== rec.rid) removeMember(reg, prior, m.id);
    reg.byToken.set(m.id, rec.rid);
  }
  if (rec.members.length) reg.recs.set(rec.rid, rec);
  return rec;
}

/** The member record of token `id` in its live reservation, or null. */
export function memberOf(reg, id) {
  const rid = reg.byToken.get(id);
  const rec = rid ? reg.recs.get(rid) : null;
  const m = rec?.members.find(x => x.id === id) ?? null;
  return m ? { rec, m } : null;
}

/**
 * A move of token `id` arrived. `rid`: the reservation the move names for it (options), `movementId` / `chain`: core's
 * movement id and chain, so a fight's next-square continuation (core does not carry custom options on it) still
 * counts as the same walk. Returns "started" | "continued" | "dropped" | "none".
 */
export function moved(reg, id, { rid = null, movementId = null, chain = [], now = 0 } = {}) {
  const cur = reg.byToken.get(id);
  if (!cur) return "none";
  const hit = memberOf(reg, id);
  if (rid && rid === cur && hit) {
    if (hit.m.startAt === null) {
      hit.m.startAt = now;
      // The first member seen to set off fixes the whole reservation's clock on this client.
      if (!hit.rec.based) { hit.rec.base = now - hit.m.delay; hit.rec.based = true; }
    }
    hit.m.mid = movementId ?? hit.m.mid;
    return "started";
  }
  if (hit?.m.mid && (movementId === hit.m.mid || (Array.isArray(chain) && chain.includes(hit.m.mid)))) return "continued";
  removeMember(reg, cur, id);
  return "dropped";
}

/** Token `id` was stopped: it stands where it is now (its reservation is gone). */
export function stopped(reg, id) {
  const cur = reg.byToken.get(id);
  if (cur) removeMember(reg, cur, id);
}

/** When member `m` of `rec` sets off (or did), this client's clock. */
export const startOf = (rec, m) => (m.startAt ?? rec.base + m.delay);

/** Drop what is over: members overdue to set off, and members long at rest. */
export function expire(reg, now = 0) {
  for (const rec of [...reg.recs.values()]) {
    for (const m of [...rec.members]) {
      const t0 = startOf(rec, m);
      if ((m.startAt === null && now > t0 + RESERVE.overdueMs) || now > t0 + durationOf(m) + RESERVE.restMs) removeMember(reg, rec.rid, m.id);
    }
  }
}

/**
 * The reserved walks a planner reads: { id, rid, seq, r, points, speed, delay } (delay ms from `now`; negative for one
 * already part way along). Only `scene`; never the tokens in `exclude` (the planner's own members) or in `skip` (read
 * otherwise, e.g. drawn walking now); `keep(id)` filters by what this user may count (a player: only what it sees).
 * `after` / `before`: only reservations that arrived after / before those seq numbers (a race's window).
 */
export function walkersOf(reg, { now = 0, scene = null, exclude = null, skip = null, keep = null, after = -Infinity, before = Infinity } = {}) {
  expire(reg, now);
  const out = [];
  for (const rec of reg.recs.values()) {
    if (scene !== null && rec.scene !== null && rec.scene !== scene) continue;
    if (!(rec.seq > after) || !(rec.seq < before)) continue;
    for (const m of rec.members) {
      if (exclude?.has?.(m.id) || skip?.has?.(m.id) || (keep && !keep(m.id))) continue;
      const t0 = startOf(rec, m);
      // Not set off yet and overdue: it sets off now at the soonest.
      const delay = m.startAt === null ? Math.max(t0 - now, 0) : t0 - now;
      out.push({ id: m.id, rid: rec.rid, seq: rec.seq, r: m.r, points: m.points, speed: m.speed, delay, combat: rec.combat });
    }
  }
  return out;
}

/** Where the reserved walks end (circles, squares): no rest spot of a later plan may be there. Same filters. */
export function restsOf(reg, opts = {}) {
  return walkersOf(reg, opts).map(w => ({ id: w.id, x: w.points.at(-1).x, y: w.points.at(-1).y, r: w.r }));
}

/* -------------------------------------------- */
/*  Decisions                                   */
/* -------------------------------------------- */

/**
 * Lost the race? `mine`: this plan's walks ({ points, r, speed, delay } from its first wave), `theirs`: the reserved
 * walks that arrived after this plan read the registry and before its own echo (earlier in the server's order).
 */
export function lostRace(mine, theirs, { combat = false } = {}) {
  return walkersMeet(mine, theirs, { combat });
}

/** When the last of `walkers` that `m` meets is at rest (ms from now), or null when it meets none. */
export function clearAfter(mine, walkers, { combat = false } = {}) {
  let until = null;
  for (const w of walkers ?? []) {
    if (!(w.points?.length >= 2)) continue;
    if (!walkersMeet(mine, [w], { combat })) continue;
    const end = (w.delay ?? 0) + durationOf(w);
    until = Math.max(until ?? 0, end);
  }
  return until;
}

/**
 * A single token's walk against the reserved and walking ones (`walkers`): the smallest start delay (a multiple of
 * MOTION.delayStep, up to `maxMs`) with which it meets none: { delay }. With none: { delay: null, until } — the time
 * (ms from now, at most RESERVE.queueMs) by when every walk it meets is at rest: the drop queues until then.
 */
export function singleTiming(member, walkers, { combat = false, maxMs = RESERVE.singleMs } = {}) {
  const ws = (walkers ?? []).filter(w => w.points?.length >= 2);
  if (!ws.length || !(member?.points?.length >= 2)) return { delay: 0 };
  for (let d = 0; d <= maxMs + EPS; d += MOTION.delayStep) {
    if (!walkersMeet([{ ...member, delay: d }], ws, { combat })) return { delay: d };
  }
  const until = clearAfter([{ ...member, delay: 0 }], ws, { combat });
  return { delay: null, until: Math.min(Math.max(until ?? 0, MOTION.delayStep), RESERVE.queueMs) };
}

/**
 * A single token's walk cut back to where it meets no walker (settle's rule: the furthest point from which nothing
 * meets it; in a fight, or for a big token, a whole square). { cut, points, still }.
 */
export function singleCut(member, walkers, { combat = false, restOk = null } = {}) {
  const big = (member.w ?? 1) > 1 || (member.h ?? 1) > 1;
  const allowedFor = () => (combat || big ? c => onCell(c, member.w ?? 1, member.h ?? 1) : null);
  const gen = settle([{ id: member.id ?? "single", r: member.r, w: member.w, h: member.h, speed: member.speed, points: member.points, cut: null, delay: 0 }],
    { statics: [], walkers, combat, allowedFor, restOk });
  let v = gen.next();
  while (!v.done) v = gen.next();
  const e = v.value.get(member.id ?? "single");
  return { cut: e?.cut ?? null, points: e?.points ?? member.points, still: !!e?.still, changed: !!e?.changed };
}

/**
 * Should a plan queue (wait for the reserved walks in its way to pass, then be made again)? Only when some member was
 * stopped short, cut or left standing (`short`: their full walks, { points, r, speed, delay }) and one of those walks
 * meets a reserved walk: the time (ms from now, at most RESERVE.queueMs) by when those are at rest; else null.
 */
export function queueUntil(short, walkers, { combat = false } = {}) {
  const ws = (walkers ?? []).filter(w => w.points?.length >= 2);
  if (!ws.length || !short?.length) return null;
  const until = clearAfter(short, ws, { combat });
  return until === null ? null : Math.min(Math.max(until, MOTION.delayStep), RESERVE.queueMs);
}
