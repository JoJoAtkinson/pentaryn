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
 *   when       its walk, looked at GUARD.horizonMs ahead, would come closer than touching less GUARD.tol to one it
 *              gives way to (less GUARD.standTol to one standing).
 *   yield      stopped where it is drawn (stop.mjs's displace, unanimated, marked as a guard move), backing out to the
 *              nearest spot off a higher mover's way when it would stand in it; it waits (the amber cue on), and walks
 *              the rest of its way again once that way is clear. 3 s after its first yield it re-routes once round what
 *              stands, when that way fits before the move's deadline; it rests on the nearest free spot at 8 s or the
 *              move's deadline, whichever first ("Stopped short, way blocked"). Nothing waits forever and nothing
 *              accepts overlap. Stack mates (tokens that started stacked, group.mjs) never yield to each other.
 *   where      out of combat only (0.8.0): a fight's group is kept apart by space (tier C) or is core's move (the
 *              fallback); the 0.7 fight pause guard and its first-square gate are gone.
 *   cost       a check costs O(tokens nearby) (guard-core's bucket grid), every GUARD.everyMs; nothing runs while this
 *              client moves nothing.
 */

import { GUARD, aroundOf, asideSpot, conflictAhead, hashOf, nearby, newYield, segmentDistance, standingOnRoute, stepYield, yieldsTo } from "./guard-core.mjs";
import { dist, radiusOf, routeAhead, segmentsCross } from "./motion-core.mjs";
import { LIFE } from "./lifecycle-core.mjs";
import { clearOfWalls, countsForRoutes, crossesDoor, cutAtWalls, doorwayAt, drawnPosition, gridSize, inCombat, layerOf, movementFacts, restWalkable, speedOf, toSquares, toTopLeft } from "./group-adapter.mjs";
import { reservations as reserve } from "./reserve-adapter.mjs";
import { setting } from "./settings.mjs";
import { hideCue, showCue } from "./cue-ui.mjs";

const GUARD_OPT = reserve.GUARD_OPT;
const REST = "PENTARYN_MOVEMENT.notify.stoppedShort";
/** How long a re-route's search may run (its own slices; ms). */
const REROUTE_MS = 600;

let feature = null;
let log = null;
/** token id → its yield record (guard-core newYield, plus: mid, busy, route, dest, pauseAt, aside, blocker, restAt). */
const yields = new Map();
let ticking = null;
let lastRun = 0;
const counts = { fired: 0, standing: 0, movers: 0, late: 0, resumed: 0, rerouted: 0, noRoute: 0, rested: 0, aside: 0, cancelled: 0, errors: 0,
  inside: 0, offDoor: 0, overridden: 0, detour: 0, gated: 0, wallCut: 0, resumeCut: 0 };
const firings = [];
const perf = { ticks: 0, checks: 0, maxMs: 0, over4: 0, over16: 0 };
/** token id → { mid, wps, pts } (the movement's waypoints, top-left, and their centres in squares). */
const ways = new Map();

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const enabled = () => { try { return setting("pathfinding") !== "off" || !!setting("groupDrags"); } catch { return false; } };
const tele = (kind, data) => { try { feature?.exposed?.tele?.(kind, data); } catch (err) { log?.debug?.("guard: telemetry", err); } };

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
    id: doc.id, token: t, c, r: radiusOf(w, h), w, h, level: src.level, layer: layerOf(doc), moving: facts.animating, points: null, speed: 0,
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

/* -------------------------------------------- */
/*  The wall watch (FR2-03 / FR2-04)            */
/* -------------------------------------------- */

/** Walls that shut or were raised lately (id → when, ms): the only ones a planned way can newly cross. */
const fresh = new Map();
/** How long a wall that shut stays watched (ms), and how far ahead along a mover's way it is looked for (squares). */
const FRESH_MS = 30_000;
const WALL_REACH = 1.5;

function noteWall(wall, changes) {
  if (!wall?.id) return;
  if (changes && !["ds", "door", "move", "c", "dir"].some(k => k in changes)) return;
  fresh.set(wall.id, clock());
  if (fresh.size > 200) fresh.delete(fresh.keys().next().value);
  if (yields.size) lastRun = 0;
}

/** Does this wall block movement now (a shut door, a solid wall)? */
function blocksNow(wall) {
  const w = wall?._source ?? wall;
  if (!w || !(Number(w.move) > 0)) return false;
  return !(Number(w.door) > 0 && Number(w.ds) === 1);
}

/**
 * A wall shut or raised lately that the way ahead of a move this client started (`pts`, square centres, the first
 * where it is drawn) now crosses within WALL_REACH squares, and that really stops this token there (its own collision
 * test), or null. The door cut at the shut misses a move that was not under way at that instant (live FR2-03 / FR2-04:
 * members walked through the shut door 1-2.5 s after it shut); the guard looks at every move it watches, so the cut
 * runs again as soon as such a move nears the wall. Reads only.
 */
function wallAhead(token, pts, s) {
  if (!fresh.size || !(pts?.length >= 2)) return null;
  const scene = token.document?.parent;
  const now = clock();
  const walls = [];
  for (const [id, at] of fresh) {
    if (now - at > FRESH_MS) { fresh.delete(id); continue; }
    const w = scene?.walls?.get?.(id);
    if (w && blocksNow(w)) walls.push(w);
  }
  if (!walls.length) return null;
  const z = token.document._source.elevation ?? 0;
  let left = WALL_REACH;
  for (let k = 1; k < pts.length && left > 0; k++) {
    const a = pts[k - 1], b0 = pts[k];
    const L = dist(a, b0);
    if (L < 1e-9) continue;
    const f = Math.min(1, left / L);
    const b = { x: a.x + (b0.x - a.x) * f, y: a.y + (b0.y - a.y) * f };
    left -= L;
    for (const w of walls) {
      const c = w._source?.c ?? w.c;
      if (!Array.isArray(c) || c.length < 4) continue;
      if (!segmentsCross(a, b, { x: c[0] / s, y: c[1] / s }, { x: c[2] / s, y: c[3] / s })) continue;
      let stops = true;
      try { stops = !!token.checkCollision({ x: b.x * s, y: b.y * s, elevation: z }, { origin: { x: a.x * s, y: a.y * s, elevation: z }, type: "move", mode: "any" }); }
      catch { stops = true; }
      if (stops) return w;
    }
  }
  return null;
}

/** The wall watch for one mover: a fresh wall across its way ahead cuts the moves across it, once per wall per move. */
function watchWalls(y, token, me, s) {
  if (!fresh.size || typeof feature?.exposed?.groupCutAcross !== "function") return false;
  const pts = me.points?.length >= 2 ? [me.c, ...me.points.slice(1)] : null;
  const wall = wallAhead(token, pts, s);
  if (!wall) return false;
  y.walls ??= new Set();
  if (y.walls.has(wall.id)) return false;
  y.walls.add(wall.id);
  counts.wallCut += 1;
  log?.info?.(`yield guard: ${token.document?.name ?? token.id} nears a wall shut since its move began: cut before it`);
  try { feature.exposed.groupCutAcross(wall); } catch (err) { counts.errors += 1; log?.debug?.("guard: wall cut", err); }
  return true;
}

/**
 * A held way out of combat cut where a wall now blocks it (cutAtWalls: on a free whole square before it, or nothing
 * when it would not get off where it waits). Tokens standing anywhere count as taken.
 */
function cutHeldRoute(token, from, wps) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1;
  const r = radiusOf(w, h) * s;
  const circles = [];
  for (const o of doc.parent?.tokens?.values?.() ?? []) {
    if (!o?._source || o.id === doc.id) continue;
    if (o.hidden && !globalThis.game?.user?.isGM) continue;
    const ow = o._source.width ?? 1, oh = o._source.height ?? 1;
    circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r: radiusOf(ow, oh) * s });
  }
  const taken = p => circles.some(c => Math.hypot(p.x + (w * s) / 2 - c.x, p.y + (h * s) / 2 - c.y) < r + c.r - 1e-6);
  return cutAtWalls(token, { ...from, elevation: doc._source.elevation ?? 0 }, wps, { taken });
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
  // Tokens that started stacked with it (a rider and its mount, 0.8.0) walk together and never part.
  let mates = null;
  try { mates = feature?.exposed?.groupStackmates?.(me.id) ?? null; } catch { mates = null; }
  for (const e of nearby(snap.hash, me.c, reach)) {
    if (e.id === me.id || mates?.has?.(e.id)) continue;
    if (me.level !== undefined && e.level !== undefined && e.level !== me.level) continue;
    // A flying token passes over the ones on the ground (0.8.3, AR1-12).
    if (me.layer && e.layer && me.layer !== e.layer) continue;
    const paused = !!e.paused;
    const moving = e.moving && !paused;
    const points = paused ? (e.moving && dist(e.c, e.target) > 1e-6 ? [e.c, e.target] : null) : moving ? e.points : null;
    const o = { id: e.id, c: e.c, r: e.r, points, speed: e.speed || 6, delay: 0, standing: !moving,
      prio: e.prio, hidden: e.hidden, byPlayer: e.byPlayer };
    o.yieldTo = yieldsTo(me, o) || (resuming && moving);
    o.samePlan = Number.isFinite(me.prio?.ord) && me.prio.ord === e.prio?.ord;
    out.push(o);
    if (moving && e.combat && e.target && dist(e.c, e.target) > 1e-6) out.push({ ...o, points: [e.c, e.target], yieldTo: true, committed: true });
    // A mover it does not give way to that comes to rest within the look ahead is a standing token there from then
    // on, and standing tokens never yield (FR2-05: Player8B's Hero 7 walked on into the GM's Hero 1 coming to rest at
    // its slot, -97 px for 427 ms; the GM's later move put Hero 1 after Hero 7 in the order, so neither gave way).
    if (moving && !o.yieldTo && !o.samePlan && e.points?.length >= 2) {
      const end = e.points.at(-1);
      let L = 0;
      for (let k = 1; k < e.points.length; k++) L += dist(e.points[k - 1], e.points[k]);
      if ((L / (o.speed || 6)) * 1000 <= horizonMs) out.push({ ...o, c: end, points: null, standing: true, yieldTo: true, restsSoon: true });
    }
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

/** Record and log one firing (the design: every firing is a planner miss). */
function fire(y, doc, hit, { combat = false, late = false } = {}) {
  tele("fire", { id: doc.id, against: hit.id, standing: !!hit.standing, inMs: Math.round(hit.t) });
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

/** One look at one of this client's movers (out of combat only, 0.8.0: a fight is never paused by the guard). */
function look(y, snap, now, s) {
  if (y.busy) return;                                          // its own write (a stop, a walk on) is on its way
  const token = globalThis.canvas?.tokens?.get?.(y.id);
  if (!token || token.destroyed || !token.document?._source) { drop(y.id); return; }
  const doc = token.document;
  const m = doc.movement;
  if (!m?.user?.isSelf || inCombat(doc)) { drop(y.id); return; }
  const me = snap.byId.get(y.id) ?? entryOf(token, s);
  if (!(me.speed > 0)) me.speed = speedOf(token);
  if (y.phase === "walk") {
    if (!me.moving) { drop(y.id); return; }
    if (m.constrainOptions?.ignoreTokens || m.constrainOptions?.ignoreWalls) return;          // ghost, unconstrained
    if (!(me.points?.length >= 2)) return;
    if (watchWalls(y, token, me, s)) return;
    perf.checks += 1;
    const hit = conflictAhead(me, othersFor(me, snap, GUARD.horizonMs), { horizonMs: GUARD.horizonMs });
    if (!hit) return;
    const act = stepYield(y, { now, conflict: true });
    fire(y, doc, hit);
    if (act === "pause") { pause(y, token, hit, snap, me); lastRun = 0; }
    else if (act === "rest") rest(y, token, snap, me);
    return;
  }
  if (y.phase !== "held") return;
  // Held: would its way, if it went on now, be clear?
  const pts = [me.c, ...(y.route ?? []).map(p => toSquares(p, me.w, me.h, s))];
  const mine = { ...me, points: pts.length >= 2 ? pts : null };
  perf.checks += 1;
  const hit = mine.points ? conflictAhead(mine, othersFor(mine, snap, GUARD.horizonMs, { resuming: true }), { horizonMs: GUARD.horizonMs }) : null;
  const blocked = mine.points ? standingOnRoute(mine.points, me.r, standingOf(snap, me), { tol: GUARD.standTol }) : null;
  const act = stepYield(y, { now, clear: !hit && !blocked });
  if (act === "resume") resume(y, token);
  else if (act === "reroute") reroute(y, token, snap, me);
  else if (act === "rest") rest(y, token, snap, me);
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

/** Pause: stop where it is drawn (backing out of a higher mover's way, or off a door's line). */
function pause(y, token, hit, snap, me) {
  const doc = token.document;
  tele("yield", { id: doc.id, against: hit.id, standing: !!hit.standing });
  showCue(doc.id, "yield");
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

/** Resume: the rest of its way from where it waits (cut before a wall shut since). */
function resume(y, token) {
  const doc = token.document;
  counts.resumed += 1;
  hideCue(doc.id);
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
  // A wall shut while it waited (FR2-04: a held member walked its old way on through the shut door): its way is cut
  // before the wall, and with no square to walk to it stays where it waits.
  try {
    const cut = cutHeldRoute(token, from, wps);
    if (cut.cut) {
      counts.resumeCut += 1;
      if (!cut.waypoints.length) { drop(doc.id); return; }
      wps = cut.waypoints.map((p, i, all) => plain(p, i === all.length - 1));
    }
  } catch (err) { log?.debug?.("guard: resume across a wall", err); }
  y.busy = true;
  Promise.resolve(doc.move(wps, { method: "api", [GUARD_OPT]: true, ...republish(doc, from, wps) }))
    .catch(err => { counts.errors += 1; log?.debug?.("guard: resume", err); })
    .finally(() => { y.busy = false; });
}

/** 3 s after the first yield: one way round what stands now (and the mover it gave way to), however long. */
function reroute(y, token, snap, me) {
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
      // A way round it can walk before its move's deadline (0.8.0, the one 10 s clock; S3R1-04: one re-route went round
      // the whole dungeon, 42 squares, and came to rest about 60 s after the drop): longer, it waits on and rests at
      // the deadline, short of its spot. (This replaces the "too long" detour test.)
      const sq = q => ({ x: (q.x + (me.w * s) / 2) / s, y: (q.y + (me.h * s) / 2) / s });
      const lenOf = list => { let L = 0; for (let k = 1; k < list.length; k++) L += dist(sq(list[k - 1]), sq(list[k])); return L; };
      const walkMs = (lenOf(rt.path) / (me.speed > 0 ? me.speed : 6)) * 1000;
      if (Number.isFinite(y.restAt) && clock() + walkMs > y.restAt) { counts.detour += 1; counts.noRoute += 1; y.phase = "held"; return; }
      const wps = rt.path.slice(1).map((p, k, all) => plain(p, k === all.length - 1));
      if (!ours(y, doc)) return;
      y.route = wps;
      await doc.move(wps, { method: "api", [GUARD_OPT]: true, ...republish(doc, { x: origin.x, y: origin.y }, wps) });
    })
    .catch(err => { counts.errors += 1; y.phase = "held"; log?.debug?.("guard: re-route", err); })
    .finally(() => { y.busy = false; });
}

/** 8 s after the first yield, or at the move's deadline: it rests on the nearest free spot, "Stopped short". */
function rest(y, token, snap, me) {
  const doc = token.document;
  counts.rested += 1;
  y.phase = "done";
  y.busy = true;
  hideCue(doc.id);
  const s = gridSize(token);
  const tell = () => {
    tele("notice", { notice: "short", reason: "guardRest", id: doc.id });
    try { globalThis.ui?.notifications?.warn?.(REST, { localize: true }); }
    catch (err) { log?.debug?.("guard: notice", err); }
  };
  const settle = async () => {
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
  if (yields.get(id)?.phase === "held") hideCue(id);
  yields.delete(id);
  ways.delete(id);
  if (!yields.size) stopTicker();
}

function tick() {
  if (!feature) return;
  if (!yields.size) { stopTicker(); return; }
  const now = clock();
  if (now - lastRun < GUARD.everyMs) return;
  let list = [...yields.values()];
  lastRun = now;
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

/** Did this move come from a drag, or from the module (its update options name it)? */
function fromModule(doc, operation) {
  if (doc?.movement?.method === "dragging") return true;
  for (const k of Object.keys(operation ?? {})) if (k.startsWith("pentarynMovement")) return true;
  return false;
}

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
  // A fight's move is never guarded (0.8.0): its group is kept apart by space (tier C) or is core's move (the fallback).
  if (!enabled() || operation?.animate === false || inCombat(doc)) return;
  // Only a move the module had a hand in (0.8.3, AR1-03; acceptance C10, moves it did not plan are never delayed,
  // rerouted or vetoed): a drag (pathfound, or a group's member) or a move that carries the module's options. A plain
  // update {x, y} (a macro, MCP move-token, a teleport), Argon's Dash or forced movement goes as core moves it.
  if (!fromModule(doc, operation)) return;
  // Its yields end by its move's one deadline (lifecycle-core): from the drop this client saw, else from now.
  let startedAt = null;
  try { startedAt = feature.exposed.moveStartedAt?.(doc.id) ?? null; } catch { startedAt = null; }
  yields.set(doc.id, { ...newYield(), id: doc.id, mid, busy: false, route: null, dest: null, pauseAt: null, aside: false, blocker: null,
    restAt: (Number.isFinite(startedAt) ? startedAt : clock()) + LIFE.deadlineMs });
  lastRun = 0;
  startTicker();
}

/** stopToken: a stop the guard did not make lets go of the token (a click, a turn change, another user). */
function onStop(doc) {
  if (yields.size) lastRun = 0;
  if (doc?.id && yields.has(doc.id)) drop(doc.id);
}

/**
 * A click-stop (or any stop) of a token the guard holds: it stays where it waits (stop.mjs calls this first).
 * Returns true when the guard held it.
 */
function guardCancel(id, via = "api") {
  const y = yields.get(id);
  if (!y || (y.phase !== "held" && !y.busy)) return false;
  counts.cancelled += 1;
  tele("stop", { reason: `guardCancel:${via}`, id });
  drop(id);
  return true;
}

function guardStatus() {
  const held = [...yields.values()].filter(y => y.phase === "held").map(y => ({ id: y.id, since: y.firstAt, rerouted: y.rerouted, firings: y.firings }));
  return { enabled: enabled(), watching: yields.size, held, ticking: !!ticking, ...counts, perf: { ...perf }, last: firings.slice(-5).map(f => ({ ...f })),
    errorsSeen: errorsSeen.map(e => ({ ...e })) };
}

/**
 * Uncaught page errors this tab saw that name this module, or an array frozen by core (FR2-10: 19 uncaught "Cannot
 * assign to read only property '0' of object '[object Array]'" on a player tab, no package and no stack in the
 * console): the last five, with where they were thrown, for status().guard.errorsSeen. Reads only.
 */
const errorsSeen = [];
let errorTarget = null;
function onPageError(ev) {
  try {
    const err = ev?.error ?? ev?.reason ?? null;
    const message = String(err?.message ?? ev?.message ?? err ?? "");
    const stack = String(err?.stack ?? "");
    const where = `${ev?.filename ?? ""}:${ev?.lineno ?? ""}:${ev?.colno ?? ""}`;
    if (!/pentaryn-movement/.test(stack + where) && !/read only property/.test(message)) return;
    errorsSeen.push({ at: new Date().toISOString(), message: message.slice(0, 200), where, stack: stack.split("\n").slice(0, 6).join(" | ").slice(0, 800) });
    if (errorsSeen.length > 5) errorsSeen.shift();
  } catch (err) { log?.debug?.("guard: a page error", err); }
}
function listenErrors() {
  const w = globalThis.window;
  if (!w || typeof w.addEventListener !== "function" || errorTarget === w) return;
  w.addEventListener("error", onPageError);
  w.addEventListener("unhandledrejection", onPageError);
  errorTarget = w;
}
function unlistenErrors() {
  try { errorTarget?.removeEventListener?.("error", onPageError); errorTarget?.removeEventListener?.("unhandledrejection", onPageError); }
  catch (err) { log?.debug?.("guard: page error listener", err); }
  errorTarget = null;
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
  listenErrors();
  reg.on("moveToken", (doc, movement, operation) => onMove(doc, movement, operation), { label: "moveToken: the runtime yield guard watches the moves this client started" });
  reg.on("stopToken", doc => onStop(doc), { label: "stopToken: a stop the guard did not make lets go of the token" });
  reg.on("canvasTearDown", () => { clearAll(); fresh.clear(); }, { label: "canvasTearDown: the yield guard forgets this scene's moves" });
  reg.on("updateWall", (wall, changes) => noteWall(wall, changes), { label: "updateWall: the guard's wall watch notes a door shut" });
  reg.on("createWall", wall => noteWall(wall, null), { label: "createWall: the guard's wall watch notes a wall raised" });
  ctx.expose({ guardStatus, guardCancel, guardInstalled: () => true });
}

export function uninstall() {
  clearAll();
  fresh.clear();
  unlistenErrors();
  errorsSeen.length = 0;
  for (const k of Object.keys(counts)) counts[k] = 0;
  for (const k of Object.keys(perf)) perf[k] = 0;
  firings.length = 0;
  lastRun = 0;
  feature = null;
}
