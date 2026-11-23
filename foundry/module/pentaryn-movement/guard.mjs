/**
 * Pentaryn Movement — the feature: the runtime yield guard (0.7.0, overlap redesign stage 3 of 3; plan
 * context/plans/pathfinding-2026-11.md §15.8, Fable's design 2026-11-22).
 *
 * GLUE, one feature. A safety net under the plans, never the plan itself: every firing is logged (console info line,
 * status().guard), because a firing is a planner miss to fix. What it does, per the design's rules:
 *
 *   who acts   only the client that started a move touches it (`doc.movement.user.isSelf`); nothing is relayed.
 *   who yields standing tokens never yield (every mover gives way to them); between two movers the later in the
 *              server's order yields (a reservation's arrival, or an unreserved move's; within a plan, plan order:
 *              reserve-core claim), so a mover never yields to a lower one and two clients never both yield for
 *              one meeting. A hidden mover yields to a player's mover (that player cannot see it); a player's
 *              mover never yields to what it cannot count (countsForRoutes).
 *   when       its walk, looked at GUARD.horizonMs ahead (a fight: the rest of its square and the next, two when the
 *              next is a doorway), would come closer than touching less GUARD.tol to one it gives way to.
 *   yield      out of combat: stopped where it is drawn (stop.mjs's displace, unanimated, marked as a guard move),
 *              backing out to the nearest spot off a higher mover's way when it would stand in it; it waits, and
 *              walks the rest of its way again once that way is clear. In a fight: core's pauseMovement withholds
 *              the next square's continuation (free; no displace, ever), so it rests on whole squares, pays for the
 *              squares it walked, and stops before a door rather than in it. 3 s after its first yield it re-routes
 *              once round what stands; at 8 s it rests on the nearest free spot with a quiet notice. Nothing waits
 *              forever and nothing accepts overlap.
 *   cost       a check costs O(tokens nearby) (guard-core's bucket grid); out of combat every GUARD.everyMs, in a
 *              fight every frame while a square is being walked; nothing runs while this client moves nothing.
 */

import { GUARD, aroundOf, asideSpot, cellHorizon, conflictAhead, hashOf, nearby, newYield, segmentDistance, standingOnRoute, stepYield, yieldsTo } from "./guard-core.mjs";
import { dist, radiusOf, routeAhead } from "./motion-core.mjs";
import { detourTooLong } from "./group-core.mjs";
import { clearOfWalls, continuationInFlight, countsForRoutes, crossesDoor, doorwayAt, drawnPosition, gridSize, inCombat, movementFacts, restWalkable, speedOf, toSquares, toTopLeft } from "./group-adapter.mjs";
import { reservations as reserve } from "./reserve-adapter.mjs";
import { setting } from "./settings.mjs";

const GUARD_OPT = reserve.GUARD_OPT;
const REST = "PENTARYN_MOVEMENT.notify.guardRest";
/** How long a re-route's search may run (its own slices; ms). */
const REROUTE_MS = 600;

let feature = null;
let log = null;
/** token id → its yield record (guard-core newYield, plus: mid, busy, route, dest, resume, pauseAt, selfStop). */
const yields = new Map();
let ticking = null;
let lastRun = 0;
const counts = { fired: 0, standing: 0, movers: 0, late: 0, resumed: 0, rerouted: 0, noRoute: 0, rested: 0, aside: 0, cancelled: 0, errors: 0,
  inside: 0, offDoor: 0, overridden: 0, detour: 0, gated: 0 };
const firings = [];
const perf = { ticks: 0, checks: 0, maxMs: 0, over4: 0, over16: 0 };
/** token id → { mid, wps, pts } (the movement's waypoints, top-left, and their centres in squares). */
const ways = new Map();

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const enabled = () => { try { return !!setting("groupMovement"); } catch { return false; } };

/* -------------------------------------------- */
/*  What is on the board                        */
/* -------------------------------------------- */

/** A movement's waypoints (top-left pixels), origin first, intermediate ones left out. */
function wayOf(doc) {
  const m = doc.movement;
  return [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])]
    .filter(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
}

/** A waypoint core's move takes (its own fields only). */
function plain(p, last = false) {
  const out = { x: p.x, y: p.y };
  for (const k of ["elevation", "width", "height", "level", "action", "snapped"]) if (p[k] !== undefined) out[k] = p[k];
  out.explicit = last || !!p.explicit;
  out.checkpoint = last || !!p.checkpoint;
  return out;
}

/** The centres (squares) of token `t`'s current movement, cached per movement. */
function polyline(t, s, w, h) {
  const doc = t.document;
  const mid = doc.movement?.id ?? null;
  const hit = ways.get(doc.id);
  if (hit && hit.mid === mid) return hit;
  const wps = wayOf(doc);
  const rec = { mid, wps, pts: wps.map(p => toSquares(p, w, h, s)) };
  ways.set(doc.id, rec);
  if (ways.size > 300) ways.delete(ways.keys().next().value);
  return rec;
}

/** One token as the guard reads it now. */
function entryOf(t, s) {
  const doc = t.document;
  const src = doc._source;
  const w = src.width ?? 1, h = src.height ?? 1;
  const facts = movementFacts(t);
  const c = toSquares(drawnPosition(t), w, h, s);
  const e = {
    id: doc.id, token: t, c, r: radiusOf(w, h), w, h, level: src.level, moving: facts.animating, points: null, speed: 0,
    prio: reserve.priority(doc.id) ?? { id: doc.id }, hidden: !!doc.hidden, byPlayer: !!facts.user && facts.user.isGM === false,
  };
  if (e.moving) {
    const { pts } = polyline(t, s, w, h);
    const k = aheadOf(pts, c);
    e.points = k === null ? null : [c, ...pts.slice(k)];
    e.speed = speedOf(t);
    // A fight's mover may stop at the end of the square it is walking (its guard, a click): read both ways.
    e.combat = inCombat(doc);
    if (e.combat) e.target = toSquares(src, w, h, s);
  }
  // A fight's move another guard paused (core relays the state): it stands where its square ends, its way after kept.
  if (facts.state === "paused") {
    e.paused = true;
    e.target = toSquares(src, w, h, s);
    const pending = (doc.movement?.pending?.waypoints ?? []).filter(p => !p.intermediate).map(p => toSquares(p, w, h, s));
    e.pending = [e.target, ...pending];
  }
  return e;
}

/** The index of the next point of `pts` a token drawn at `c` walks to (its last point while it is short of it), or null. */
function aheadOf(pts, c) {
  const k = routeAhead(pts, c);
  if (k !== null) return k;
  return pts.length && dist(pts.at(-1), c) > 1e-3 ? pts.length - 1 : null;
}

/** Every token on the board (those this user counts in a bucket grid), this tick. */
function snapshot(s) {
  const byId = new Map();
  const counted = [];
  let reach = 0;
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    if (!t?.document?._source || t.isPreview || t.destroyed) continue;
    const e = entryOf(t, s);
    e.counts = countsForRoutes(t);
    byId.set(e.id, e);
    if (!e.counts) continue;
    counted.push(e);
    reach = Math.max(reach, (e.moving ? (e.speed * 2 * GUARD.horizonMs) / 1000 : 0) + e.r);
  }
  return { byId, counted, hash: hashOf(counted), reach, reserved: null };
}

/** The reserved walks not set off yet (this tick, once): stage 2's registry. */
function reservedOf(snap, token) {
  if (snap.reserved) return snap.reserved;
  let walkers = [];
  try { walkers = reserve.liveFor([{ id: token.document.id, token }]).walkers; } catch (err) { log?.debug?.("guard: reservations", err); }
  snap.reserved = walkers.filter(wk => wk.delay > 0 && !(snap.byId.get(wk.id)?.moving));
  return snap.reserved;
}

/**
 * The others mover `me` (an entry) reads: nearby, on its level, each marked whether it gives way to it. In a fight a
 * mover's square under way is committed (core cannot stop it inside a square), so nobody walks or stands in it whatever
 * the order, and a paused one stands where its square ends. `resuming` (a held yield deciding to go on): it starts
 * afresh, so it waits for every mover's way, and in a fight for an earlier paused one's (of two held, one goes first).
 */
function othersFor(me, snap, horizonMs, { resuming = false } = {}) {
  const reach = (me.speed * horizonMs) / 1000 + me.r + snap.reach + GUARD.tol;
  const out = [];
  for (const e of nearby(snap.hash, me.c, reach)) {
    if (e.id === me.id) continue;
    if (me.level !== undefined && e.level !== undefined && e.level !== me.level) continue;
    const paused = !!e.paused;
    const moving = e.moving && !paused;
    const points = paused ? (e.moving && dist(e.c, e.target) > 1e-6 ? [e.c, e.target] : null) : moving ? e.points : null;
    const o = { id: e.id, c: e.c, r: e.r, points, speed: e.speed || 6, delay: 0, standing: !moving,
      prio: e.prio, hidden: e.hidden, byPlayer: e.byPlayer };
    o.yieldTo = yieldsTo(me, o) || (resuming && moving);
    o.samePlan = Number.isFinite(me.prio?.ord) && me.prio.ord === e.prio?.ord;
    out.push(o);
    if (moving && e.combat && e.target && dist(e.c, e.target) > 1e-6) out.push({ ...o, points: [e.c, e.target], yieldTo: true, committed: true });
    if (resuming && paused && e.pending?.length >= 2 && yieldsTo(me, { standing: false, prio: e.prio, hidden: e.hidden, byPlayer: e.byPlayer })) {
      out.push({ ...o, c: e.target, points: e.pending, standing: false, yieldTo: true });
    }
  }
  for (const wk of reservedOf(snap, me.token)) {
    if (wk.id === me.id || wk.delay > horizonMs || !(wk.points?.length >= 2)) continue;
    const u = wk.user ? globalThis.game?.users?.get?.(wk.user) : null;
    const o = { id: wk.id, c: wk.points[0], r: wk.r, points: wk.points, speed: wk.speed, delay: wk.delay, standing: false,
      prio: { ord: wk.ord, k: wk.k, id: wk.id }, hidden: false, byPlayer: !!u && u.isGM === false };
    o.yieldTo = yieldsTo(me, o);
    out.push(o);
  }
  return out;
}

/** The circles of the tokens standing on the board this user counts (squares; a paused one where its square ends), `me` left out. */
function standingOf(snap, me) {
  return snap.counted.filter(e => (!e.moving || e.paused) && e.id !== me.id && (me.level === undefined || e.level === undefined || e.level === me.level))
    .map(e => { const at = e.paused && e.target ? e.target : e.c; return { id: e.id, x: at.x, y: at.y, r: e.r }; });
}

/**
 * Every token this user counts but `me`, where it is now (a paused one where its square ends): what a step aside, or
 * off a door's line, may neither land on nor pass through (S3R1-02: an aside step chosen against the standing tokens
 * only walked into a member this guard had just stopped, -28 px).
 */
function circlesOf(snap, me) {
  return snap.counted.filter(e => e.id !== me.id && (me.level === undefined || e.level === undefined || e.level === me.level))
    .map(e => { const at = e.paused && e.target ? e.target : e.c; return { id: e.id, x: at.x, y: at.y, r: e.r }; });
}

/** Is this guard's async write still its to make: the same yield, and the token's move still this client's own? */
function ours(y, doc) {
  return !!feature && yields.get(doc.id) === y && !!doc.movement?.user?.isSelf;
}

/* -------------------------------------------- */
/*  The check                                   */
/* -------------------------------------------- */

/** A fight's mover: its way (from where it is drawn: this square, then the pending ones) and how far ahead to look. */
function combatWay(me, doc, s) {
  const src = toSquares(doc._source, me.w, me.h, s);
  const pending = (doc.movement?.pending?.waypoints ?? []).filter(p => !p.intermediate).map(p => toSquares(p, me.w, me.h, s));
  const pts = [me.c];
  if (dist(me.c, src) > 1e-6) pts.push(src);
  pts.push(...pending);
  const next = [];
  let prev = src;
  for (const p of pending.slice(0, 2)) { next.push(dist(prev, p)); prev = p; }
  let doorway = false;
  try { doorway = !!pending[0] && doorwayAt(me.token, { x: pending[0].x * s, y: pending[0].y * s }); } catch (err) { log?.debug?.("guard: doorway", err); }
  const segLeft = dist(me.c, src);
  return { pts, pending, segLeftMs: (segLeft / (me.speed > 0 ? me.speed : 6)) * 1000, horizonMs: cellHorizon(me.speed, segLeft, next, { doorway }) };
}

/** Record and log one firing (the design: every firing is a planner miss). */
function fire(y, doc, hit, { combat = false, late = false } = {}) {
  counts.fired += 1;
  counts[hit.standing ? "standing" : "movers"] += 1;
  if (late) counts.late += 1;
  if (hit.inside) counts.inside += 1;
  const other = globalThis.canvas?.tokens?.get?.(hit.id)?.document ?? null;
  const rec = {
    at: new Date().toISOString(), tokenId: doc.id, name: doc.name ?? null, against: hit.id, againstName: other?.name ?? null,
    standing: !!hit.standing, combat, late, inMs: Math.round(hit.t), d: Math.round(hit.d * 100) / 100, lim: Math.round(hit.lim * 100) / 100, firing: y.firings,
  };
  firings.push(rec);
  if (firings.length > GUARD.keep) firings.shift();
  log?.info?.(`yield guard: ${rec.name ?? rec.tokenId} gives way to ${rec.againstName ?? rec.against} (${rec.standing ? "standing" : "moving"}, ${rec.inMs} ms ahead${late ? ", late" : ""}): a planner miss`, rec);
  y.blocker = hit.id;
}

/** One look at one of this client's movers. */
function look(y, snap, now, s) {
  if (y.busy) return;                                          // its own write (a pause, a walk on) is on its way
  const token = globalThis.canvas?.tokens?.get?.(y.id);
  if (!token || token.destroyed || !token.document?._source) { drop(y.id); return; }
  const doc = token.document;
  const m = doc.movement;
  if (!m?.user?.isSelf) { drop(y.id); return; }
  const combat = inCombat(doc);
  const me = snap.byId.get(y.id) ?? entryOf(token, s);
  if (!(me.speed > 0)) me.speed = speedOf(token);
  if (y.phase === "walk") {
    if (!me.moving) {
      // Between two squares of a fight it is about to go on; otherwise it is at rest: nothing to guard.
      if (combat && m.state === "pending") return;
      if (m.state !== "paused") drop(y.id);
      return;
    }
    if (m.constrainOptions?.ignoreTokens || m.constrainOptions?.ignoreWalls) return;          // ghost, unconstrained
    let horizonMs = GUARD.horizonMs, way = null;
    if (combat) {
      way = combatWay(me, doc, s);
      if (!way.pending.length) return;                         // its last square: nothing left to withhold
      me.points = way.pts;
      horizonMs = way.horizonMs;
    }
    if (!(me.points?.length >= 2)) return;
    perf.checks += 1;
    const hit = conflictAhead(me, othersFor(me, snap, horizonMs), { horizonMs });
    if (!hit) return;
    const late = combat && hit.t < way.segLeftMs;
    if (combat && continuationInFlight(doc)) return;           // its next square is on its way: the next look decides
    const act = stepYield(y, { now, conflict: true });
    fire(y, doc, hit, { combat, late });
    if (act === "pause") { pause(y, token, hit, snap, me, combat, way); lastRun = 0; }
    else if (act === "rest") rest(y, token, snap, me, combat);
    return;
  }
  if (y.phase !== "held") return;
  // Held: would its way, if it went on now, be clear?
  let pts, horizonMs = GUARD.horizonMs;
  if (combat) {
    const way = combatWay(me, doc, s);
    pts = way.pts;
    horizonMs = way.horizonMs;
  } else {
    pts = [me.c, ...(y.route ?? []).map(p => toSquares(p, me.w, me.h, s))];
  }
  const mine = { ...me, points: pts.length >= 2 ? pts : null };
  perf.checks += 1;
  const hit = mine.points ? conflictAhead(mine, othersFor(mine, snap, horizonMs, { resuming: true }), { horizonMs }) : null;
  const blocked = mine.points ? standingOnRoute(mine.points, me.r, standingOf(snap, me)) : null;
  const act = stepYield(y, { now, clear: !hit && !blocked });
  if (act === "resume") resume(y, token, combat);
  else if (act === "reroute") reroute(y, token, snap, me, combat);
  else if (act === "rest") rest(y, token, snap, me, combat);
}

/* -------------------------------------------- */
/*  The yields                                  */
/* -------------------------------------------- */

/** Can `token` step from `from` to `c` (squares) and stand there: open floor, no wall between, not in a doorway? */
function spotOk(token, from, c, s) {
  const doc = token.document;
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const z = doc._source.elevation ?? 0;
  if (!restWalkable({ token, r: radiusOf(w, h) }, c, s)) return false;
  try {
    if (token.checkCollision({ x: c.x * s, y: c.y * s, elevation: z }, { origin: { x: from.x * s, y: from.y * s, elevation: z }, type: "move", mode: "any" })) return false;
    if (doorwayAt(token, { x: c.x * s, y: c.y * s })) return false;
    // Never through a doorway (S3R1-02: an aside step took a member back through the open A-B door and its resume
    // out again, the door's line crossed three times): a step aside stays on its side of every door.
    if (crossesDoor(token, { x: from.x * s, y: from.y * s }, { x: c.x * s, y: c.y * s })) return false;
  } catch { return false; }
  return true;
}

/**
 * Where it may stand instead of where it is drawn, out of combat, or null to stand there: off a higher mover's way
 * (`threat`, the design's corridor rule), and never on a door's line (S3R1-05: a member the guard stopped where it
 * was drawn rested across the A-B door). The nearest spot round it (on its own side of the door: the step never
 * crosses a door's line), clear of the tokens about and reached without a wall or a token between.
 */
function standSpot(token, me, threat, snap, s) {
  const ok = c => spotOk(token, me.c, c, s);
  const circles = circlesOf(snap, me);
  let inDoor = false;
  try { inDoor = doorwayAt(token, { x: me.c.x * s, y: me.c.y * s }); } catch { inDoor = false; }
  if (threat) return asideSpot(me, threat, circles, { ok });
  if (!inDoor) return null;
  for (const c of aroundOf(me.c)) {
    if (circles.some(o => dist(c, o) < me.r + o.r - 1e-9)) continue;
    if (circles.some(o => dist(me.c, o) >= me.r + o.r - 1e-9 && segmentDistance(o, me.c, c) < me.r + o.r - 1e-9)) continue;
    if (ok(c)) return { x: c.x, y: c.y };
  }
  return null;
}


const republish = (doc, from, wps) => {
  try { return feature?.exposed?.groupRepublish?.(doc, from, wps) ?? {}; } catch (err) { log?.debug?.("guard: re-publish", err); return {}; }
};

/** Mark mover `me` standing in this tick's snapshot (at `spot` when it steps there). */
function standNow(snap, me, spot = null) {
  const e = snap.byId.get(me.id);
  if (!e) return;
  e.moving = false;
  e.points = null;
  if (spot) e.c = { x: spot.x, y: spot.y };
}

/** Pause: out of combat stop where it is drawn (backing out of a higher mover's way); in a fight withhold the next square. */
function pause(y, token, hit, snap, me, combat, way) {
  const doc = token.document;
  if (combat) {
    let cb = null;
    try { cb = doc.pauseMovement(); } catch (err) { log?.debug?.("guard: pause", err); }
    if (typeof cb !== "function") { y.phase = "walk"; return; }
    y.resume = cb;
    y.dest = plain((doc.movement?.pending?.waypoints ?? []).filter(p => !p.intermediate).at(-1) ?? doc._source, true);
    return;
  }
  const s = gridSize(token);
  const drawn = drawnPosition(token);
  const { wps, pts } = polyline(token, s, me.w, me.h);
  const k = aheadOf(pts, me.c);
  y.route = k === null ? [] : wps.slice(k).map((p, i, all) => plain(p, i === all.length - 1));
  y.dest = wps.length ? plain(wps.at(-1), true) : null;
  y.pauseAt = { x: drawn.x, y: drawn.y };
  // A higher mover whose way passes where it would stand: the nearest spot off that way (the design's corridor rule);
  // drawn across a door's line: off it (decision 2: never at rest on a door's line).
  let spot = null;
  const threat = hit.standing ? null : (snap.byId.get(hit.id)?.points ? snap.byId.get(hit.id) : null);
  try { spot = standSpot(token, me, threat, snap, s); } catch (err) { log?.debug?.("guard: aside", err); }
  // It stands from now on, for every other look this tick (S3R1-02: the next mover's step aside, chosen in the same
  // tick, read it as still walking and stepped into it).
  standNow(snap, me, spot);
  y.busy = true;
  Promise.resolve(feature?.exposed?.stopDisplace?.(token, { drawn, p: { ...drawn }, near: null }, { [GUARD_OPT]: true }))
    .then(async () => {
      if (!spot || !ours(y, doc)) return;
      const tl = toTopLeft(spot, me.w, me.h, s);
      const from = { x: doc._source.x, y: doc._source.y };
      const step = [{ x: tl.x, y: tl.y, elevation: doc._source.elevation ?? 0, action: doc.movementAction ?? "walk", snapped: false, explicit: true, checkpoint: true }];
      await doc.move(step, { method: "api", [GUARD_OPT]: true, ...republish(doc, from, step) });
      if (threat) counts.aside += 1;
      else counts.offDoor += 1;
      y.aside = true;
    })
    .catch(err => { counts.errors += 1; log?.warnOnce?.("guard-pause", "the yield guard could not stop a token (further errors suppressed)", err); })
    .finally(() => { y.busy = false; });
}

/** Resume: out of combat the rest of its way from where it waits; in a fight core's continuation. */
function resume(y, token, combat) {
  const doc = token.document;
  counts.resumed += 1;
  if (combat) {
    const cb = y.resume;
    y.resume = null;
    if (typeof cb === "function") Promise.resolve().then(cb).catch(err => log?.debug?.("guard: resume", err));
    return;
  }
  if (!y.route?.length || !ours(y, doc)) { drop(doc.id); return; }
  const s = gridSize(token);
  const from = { x: doc._source.x, y: doc._source.y };
  let wps = y.route.map((p, i, all) => plain(p, i === all.length - 1));
  // Backed out: back onto its way at the spot it left, when the straight leg to the next point meets a wall.
  if (y.aside && y.pauseAt) {
    const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
    const c = q => ({ x: q.x + (w * s) / 2, y: q.y + (h * s) / 2, elevation: doc._source.elevation ?? 0 });
    let hits = true;
    try { hits = !!token.checkCollision(c(wps[0]), { origin: c(from), type: "move", mode: "any" }); } catch { hits = true; }
    if (hits) wps = [{ ...wps[0], x: y.pauseAt.x, y: y.pauseAt.y, explicit: false, checkpoint: false }, ...wps];
  }
  y.aside = false;
  y.busy = true;
  Promise.resolve(doc.move(wps, { method: "api", [GUARD_OPT]: true, ...republish(doc, from, wps) }))
    .catch(err => { counts.errors += 1; log?.debug?.("guard: resume", err); })
    .finally(() => { y.busy = false; });
}

/** Stop a fight's paused or pending move this guard holds (core's stop; the stop hook knows it is ours). */
async function stopOwn(y, doc) {
  const st = doc.movement?.state;
  if (st !== "paused" && st !== "pending") return;
  y.selfStop = true;
  try { await feature?.exposed?.stopSafely?.(doc); } catch (err) { log?.debug?.("guard: stop", err); }
  y.selfStop = false;
  y.resume = null;
}

/** 3 s after the first yield: one way round what stands now (and the mover it gave way to), however long. */
function reroute(y, token, snap, me, combat) {
  const doc = token.document;
  counts.rerouted += 1;
  const dest = y.dest;
  const s = gridSize(token);
  if (!dest || typeof feature?.exposed?.pathfindRouteToAsync !== "function") { y.phase = "held"; return; }
  const origin = { ...(feature.exposed.pathfindOrigin?.(doc) ?? doc._source) };
  const r = me.r;
  const cen = p => ({ x: p.x + (me.w * s) / 2, y: p.y + (me.h * s) / 2 });
  const a0 = cen(origin), b0 = cen(dest);
  const circles = standingOf(snap, me).map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + r) * s - 1 }));
  const blocker = y.blocker ? snap.byId.get(y.blocker) : null;
  if (blocker) circles.push({ x: blocker.c.x * s, y: blocker.c.y * s, r: (blocker.r + r) * s - 1 });
  const avoid = circles.filter(o => Math.hypot(a0.x - o.x, a0.y - o.y) >= o.r && Math.hypot(b0.x - o.x, b0.y - o.y) >= o.r);
  const mid0 = doc.movement?.id ?? null;
  y.busy = true;
  Promise.resolve(feature.exposed.pathfindRouteToAsync(token, origin, { ...origin, ...dest, explicit: true, checkpoint: true },
    { preview: true, avoid: avoid.length ? avoid : null, maxMs: REROUTE_MS }))
    .then(async rt => {
      if (!ours(y, doc) || (doc.movement?.id ?? null) !== mid0) return;
      if (!rt?.reached || !(rt.path?.length >= 2)) { counts.noRoute += 1; y.phase = "held"; return; }
      // A way round no longer than a detour anyone wants (S3R1-04: one re-route went round the whole dungeon, 42
      // squares, and came to rest about 60 s after the drop): longer, it waits on and rests at 8 s, short of its spot.
      const sq = q => ({ x: (q.x + (me.w * s) / 2) / s, y: (q.y + (me.h * s) / 2) / s });
      const lenOf = list => { let L = 0; for (let k = 1; k < list.length; k++) L += dist(sq(list[k - 1]), sq(list[k])); return L; };
      const direct = lenOf([origin, ...(y.route?.length ? y.route : [dest])]);
      if (detourTooLong(direct, lenOf(rt.path))) { counts.detour += 1; counts.noRoute += 1; y.phase = "held"; return; }
      let wps = rt.path.slice(1).map((p, k, all) => plain(p, k === all.length - 1));
      if (combat) {
        try { wps = feature.exposed.groupCheckpoints?.(token, [origin, ...wps]) ?? wps; } catch (err) { log?.debug?.("guard: checkpoints", err); }
        // Its first square is committed with the move (S3R3-03): not while it is taken; it waits on to the 8 s rest.
        if (!firstClear(token, wps)) { counts.noRoute += 1; y.phase = "held"; return; }
        await stopOwn(y, doc);
      }
      if (!ours(y, doc)) return;
      y.route = wps;
      await doc.move(wps, { method: "api", [GUARD_OPT]: true, ...republish(doc, { x: origin.x, y: origin.y }, wps) });
    })
    .catch(err => { counts.errors += 1; y.phase = "held"; log?.debug?.("guard: re-route", err); })
    .finally(() => { y.busy = false; });
}

/** 8 s after the first yield: it rests on the nearest free spot (in a fight, the square it is on), quietly told. */
function rest(y, token, snap, me, combat) {
  const doc = token.document;
  counts.rested += 1;
  y.phase = "done";
  y.busy = true;
  const s = gridSize(token);
  const tell = () => {
    try { globalThis.ui?.notifications?.info?.(globalThis.game?.i18n?.format?.(REST, { name: doc.name ?? "" }) ?? REST); }
    catch (err) { log?.debug?.("guard: notice", err); }
  };
  const settle = async () => {
    if (combat) { await stopOwn(y, doc); return; }
    if (movementFacts(token).animating) {
      const drawn = drawnPosition(token);
      await feature?.exposed?.stopDisplace?.(token, { drawn, p: { ...drawn }, near: null }, { [GUARD_OPT]: true });
    }
    // On a token at rest (one stopped against it meanwhile): the nearest free spot, walked to.
    const w = me.w, h = me.h;
    const circles = standingOf(snap, me).map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + me.r) * s - 1 }));
    const taken = p => circles.some(o => Math.hypot(p.x + (w * s) / 2 - o.x, p.y + (h * s) / 2 - o.y) < o.r);
    const here = { x: doc._source.x, y: doc._source.y, elevation: doc._source.elevation ?? 0 };
    // Not on a door's line either (decision 2): clearOfWalls never leaves it straddling one.
    let inDoor = false;
    try { inDoor = doorwayAt(token, { x: here.x + (w * s) / 2, y: here.y + (h * s) / 2 }); } catch { inDoor = false; }
    if (!taken(here) && !inDoor) return;
    if (yields.get(doc.id) !== y) return;
    let spot = here;
    try { spot = clearOfWalls(token, here, { taken }); } catch (err) { log?.debug?.("guard: a free spot", err); }
    if (taken(spot) || (spot.x === here.x && spot.y === here.y)) return;
    const step = [{ x: spot.x, y: spot.y, elevation: here.elevation, action: doc.movementAction ?? "walk", snapped: false, explicit: true, checkpoint: true }];
    await doc.move(step, { method: "api", ...republish(doc, here, step) });
  };
  settle()
    .catch(err => { counts.errors += 1; log?.debug?.("guard: rest", err); })
    .finally(() => { tell(); drop(doc.id); });
}

/* -------------------------------------------- */
/*  The ticker                                  */
/* -------------------------------------------- */

function drop(id) {
  yields.delete(id);
  ways.delete(id);
  if (!yields.size) stopTicker();
}

function tick() {
  if (!feature) return;
  if (!yields.size) { stopTicker(); return; }
  const now = clock();
  const due = now - lastRun >= GUARD.everyMs;
  let list = [...yields.values()].filter(y => {
    if (due) return true;
    // In a fight, every frame while a square is walked (its next square is decided before this one ends).
    const d = globalThis.canvas?.tokens?.get?.(y.id)?.document;
    return y.phase === "walk" && !!d && inCombat(d);
  });
  if (!list.length) return;
  if (due) lastRun = now;
  // The table's drag help switched off: no new yields; the ones held finish (resume, re-route or rest).
  if (!enabled()) {
    for (const y of list) if (y.phase === "walk") drop(y.id);
    list = list.filter(y => yields.get(y.id) === y);
    if (!list.length) return;
  }
  const s = globalThis.canvas?.grid?.size ?? globalThis.canvas?.scene?.grid?.size ?? 100;
  const snap = snapshot(s);
  for (const y of list) {
    try { look(y, snap, now, s); }
    catch (err) { counts.errors += 1; log?.warnOnce?.("guard-look", "the yield guard skipped a check (further errors suppressed)", err); }
  }
  const ms = clock() - now;
  perf.ticks += 1;
  perf.maxMs = Math.max(perf.maxMs, Math.round(ms * 100) / 100);
  if (ms > 4) perf.over4 += 1;
  if (ms > 16) perf.over16 += 1;
}

function startTicker() {
  if (ticking || !yields.size) return;
  const t = globalThis.canvas?.app?.ticker;
  if (typeof t?.add !== "function") return;
  const fn = () => {
    try { tick(); }
    catch (err) { counts.errors += 1; log?.warnOnce?.("guard-tick", "the yield guard's frame failed (further errors suppressed)", err); }
  };
  // After the tweens of this frame (core animates at LOW): the drawn positions it reads are this frame's.
  t.add(fn, null, globalThis.PIXI?.UPDATE_PRIORITY?.UTILITY ?? -50);
  ticking = { t, fn };
}

function stopTicker() {
  try { ticking?.t?.remove?.(ticking.fn); } catch (err) { log?.debug?.("guard: ticker", err); }
  ticking = null;
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

/** moveToken, every client: a move this client started is guarded; the guard's own moves keep their yield. */
function onMove(doc, movement, operation) {
  // Any move (a pause elsewhere, a new walk): the next frame looks again at every move this client guards.
  if (yields.size) lastRun = 0;
  if (!feature || !doc?.id) return;
  // A move of a guarded token that another user made (a player's click-stop of its own member in this client's
  // group, the GM's hand): it is theirs now, and nothing this guard had in hand for it (a re-route searching, a
  // resume due) may undo it (S3R1-06: the GM's guard re-routed Hero 3 after Player8A had stopped it, and it walked
  // on to its old slot).
  if (!doc.movement?.user?.isSelf) {
    if (yields.has(doc.id)) { counts.overridden += 1; drop(doc.id); }
    return;
  }
  const y = yields.get(doc.id);
  const mid = movement?.id ?? doc.movement?.id ?? null;
  const chain = movement?.chain ?? doc.movement?.chain ?? [];
  if (y && (operation?.[GUARD_OPT] || (y.mid && (mid === y.mid || chain.includes?.(y.mid))))) {
    y.mid = mid ?? y.mid;
    startTicker();
    return;
  }
  if (y) drop(doc.id);
  if (!enabled() || operation?.animate === false) return;
  yields.set(doc.id, { ...newYield(), id: doc.id, mid, busy: false, route: null, dest: null, resume: null, pauseAt: null, aside: false, selfStop: false, blocker: null });
  lastRun = 0;
  startTicker();
}

/** stopToken: a stop the guard did not make lets go of the token (a click, a turn change, another user). */
function onStop(doc) {
  if (yields.size) lastRun = 0;
  const y = doc?.id ? yields.get(doc.id) : null;
  if (y && !y.selfStop) drop(doc.id);
}

/**
 * A click-stop (or any stop) of a token the guard holds: it stays where it waits (stop.mjs calls this first). In a
 * fight the paused move is stopped here. Returns true when the guard held it.
 */
function guardCancel(id, via = "api") {
  const y = yields.get(id);
  if (!y || (y.phase !== "held" && !y.busy)) return false;
  counts.cancelled += 1;
  const doc = globalThis.canvas?.tokens?.get?.(id)?.document;
  drop(id);
  if (doc && doc.movement?.state === "paused" && doc.movement?.user?.isSelf) {
    try { feature?.exposed?.stopSafely?.(doc); } catch (err) { log?.debug?.(`guard: cancel (${via})`, err); }
  }
  return true;
}

/**
 * Is the first square of a fight's move `token` is about to send clear (S3R3-03)? Core sends a fight's first square
 * with the move itself, so the guard can withhold only the squares after it (deviation 6): whoever sends such a move
 * (a door cut's walk on, a later wave, a re-route) asks this first. The walk from where it is drawn to its first
 * waypoint, plus GUARD.cellSlackMs, must come inside touching (less GUARD.tol) of nothing: no token standing (a paused
 * one where its square ends), no square under way, no way a token walking now takes in that time. A move about to be
 * sent comes after every move already under way in the server's order, so it gives way to all of them; to a reserved
 * walk still to set off it gives way by the order (reserve-core), so two waves held for each other never wait on
 * each other. Live S3R2-02 / S3R3-03: after a door cut at 1.5 s Hero 4's walk on to the square before the door was
 * sent while Hero 3 still stood on it, and Hero 3 stepped off it as Hero 4 walked in (-65 to -67 px for 264-282 ms,
 * 3 of 3 runs); the guard fired "late", inside a square it could not withhold. `waypoints`: top-left pixels. Reads only.
 */
function firstClear(token, waypoints) {
  try {
    const doc = token?.document;
    if (!doc?._source || !Array.isArray(waypoints) || !globalThis.canvas?.tokens?.placeables) return true;
    // Read only on a canvas that shows its scene (what is drawn is all it can go by).
    const viewed = globalThis.canvas?.scene?.id;
    if (viewed && doc.parent?.id && viewed !== doc.parent.id) return true;
    const first = waypoints.find(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!first) return true;
    const s = gridSize(token);
    const snap = snapshot(s);
    const me = { ...(snap.byId.get(doc.id) ?? entryOf(token, s)) };
    me.speed = me.speed > 0 ? me.speed : speedOf(token);
    const to = toSquares(first, first.width ?? me.w, first.height ?? me.h, s);
    if (dist(me.c, to) < 1e-6) return true;
    me.points = [me.c, to];
    me.moving = true;
    me.prio = reserve.priority(doc.id) ?? { ord: Infinity, id: doc.id };
    const horizonMs = (dist(me.c, to) / me.speed) * 1000 + GUARD.cellSlackMs;
    const others = othersFor(me, snap, horizonMs, { resuming: true })
      .map(o => (Number.isFinite(o.delay) && o.delay > 0 ? o : { ...o, yieldTo: true }));
    perf.checks += 1;
    const hit = conflictAhead(me, others, { horizonMs }) ?? standingOnRoute(me.points, me.r, standingOf(snap, me));
    if (hit) { counts.gated += 1; return false; }
    return true;
  } catch (err) {
    counts.errors += 1;
    log?.debug?.("guard: a first square", err);
    return true;
  }
}

function guardStatus() {
  const held = [...yields.values()].filter(y => y.phase === "held").map(y => ({ id: y.id, since: y.firstAt, rerouted: y.rerouted, firings: y.firings }));
  return { enabled: enabled(), watching: yields.size, held, ticking: !!ticking, ...counts, perf: { ...perf }, last: firings.slice(-5).map(f => ({ ...f })) };
}

function clearAll() {
  stopTicker();
  yields.clear();
  ways.clear();
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  reg.on("moveToken", (doc, movement, operation) => onMove(doc, movement, operation), { label: "moveToken: the runtime yield guard watches the moves this client started" });
  reg.on("stopToken", doc => onStop(doc), { label: "stopToken: a stop the guard did not make lets go of the token" });
  reg.on("canvasTearDown", () => clearAll(), { label: "canvasTearDown: the yield guard forgets this scene's moves" });
  ctx.expose({ guardStatus, guardCancel, guardFirstClear: firstClear, guardInstalled: () => true });
}

export function uninstall() {
  clearAll();
  for (const k of Object.keys(counts)) counts[k] = 0;
  for (const k of Object.keys(perf)) perf[k] = 0;
  firings.length = 0;
  lastRun = 0;
  feature = null;
}
