// Server-ordered reservations, the pure part (reserve-core.mjs, 0.6.0 stage 2): the wire, the registry (arrival
// order is the server's order; a newer reservation of a token supersedes its older one; a move that is not the
// reservation's drops it; a fight's continuation keeps it; a stop drops it), the reads (delays from now), and the
// decisions (the race, a single drag's delay, the queue, the cut). Unit cases; reserve-props.test.mjs randomizes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RESERVE, clearAfter, decode, durationOf, encode, expire, lostRace, memberOf, moved, queueUntil, receive, registry,
  restsOf, singleCut, singleTiming, stopped, walkersOf } from "../reserve-core.mjs";
import { MOTION, delayed, dist, positionAt, trajectory } from "../motion-core.mjs";

const walk = (id, points, { delay = 0, r = 0.5, speed = 6 } = {}) => ({ id, r, speed, delay, points });
const wire = (rid, members, extra = {}) => encode({ rid, scene: "S", members, ...extra });

test("wire: encode / decode keep the walks (3 decimals), drop what is not a walk, refuse what is not a reservation", () => {
  const w = wire("r1", [walk("a", [{ x: 1.23456, y: 2 }, { x: 4, y: 2 }], { delay: 300 }), walk("b", [{ x: 1, y: 1 }])], { user: "u1", level: "L", replaces: "r0" });
  assert.equal(w.members.length, 1, "a one-point walk is not reserved");
  const rec = decode(JSON.parse(JSON.stringify(w)));
  assert.deepEqual(rec.members[0].points, [{ x: 1.235, y: 2 }, { x: 4, y: 2 }]);
  assert.equal(rec.members[0].delay, 300);
  assert.equal(rec.user, "u1");
  assert.equal(rec.replaces, "r0");
  assert.equal(rec.level, "L");
  for (const bad of [null, {}, { v: 2, rid: "x", members: [] }, { v: 1, rid: "", members: [] }, { v: 1, rid: "x" }]) assert.equal(decode(bad), null);
  const odd = decode({ v: 1, rid: "x", members: [{ id: "a", r: 0.5, v: 6, d: 0, p: [1, 2, 3] }, { id: "b", r: 0.5, v: 6, d: 0, p: [1, 1, "2", 2] }] });
  assert.equal(odd.members.length, 0, "odd or non-numeric coordinates are dropped");
});

test("registry: arrival order is the seq; idempotent by rid; a newer reservation of a token supersedes its older one", () => {
  const reg = registry();
  const r1 = receive(reg, wire("r1", [walk("a", [{ x: 0, y: 0 }, { x: 3, y: 0 }]), walk("b", [{ x: 0, y: 1 }, { x: 3, y: 1 }])]), { now: 0 });
  assert.equal(r1.seq, 1);
  assert.equal(receive(reg, wire("r1", [walk("a", [{ x: 0, y: 0 }, { x: 3, y: 0 }])]), { now: 5 }), r1, "one update, several tokens: once");
  const r2 = receive(reg, wire("r2", [walk("a", [{ x: 0, y: 0 }, { x: 0, y: 3 }])]), { now: 10 });
  assert.equal(r2.seq, 2);
  assert.deepEqual(r1.members.map(m => m.id), ["b"], "a left r1");
  assert.equal(memberOf(reg, "a").rec.rid, "r2");
  const r3 = receive(reg, wire("r3", [walk("b", [{ x: 0, y: 1 }, { x: 1, y: 1 }])], { replaces: "r2" }), { now: 20 });
  assert.equal(reg.recs.has("r2"), false, "replaced whole");
  assert.equal(reg.recs.has("r1"), false, "r1 had nobody left");
  assert.equal(memberOf(reg, "b").rec, r3);
  assert.equal(memberOf(reg, "a"), null);
});

test("registry: its own move sets it off (and fixes the clock); a fight's continuation keeps it; any other move or a stop drops it", () => {
  const reg = registry();
  receive(reg, wire("r1", [walk("a", [{ x: 0, y: 0 }, { x: 6, y: 0 }]), walk("b", [{ x: 0, y: 1 }, { x: 6, y: 1 }], { delay: 600 })]), { now: 1000 });
  // Before anything moves: wave 0 is taken to start RESERVE.estimateMs after the publish.
  let ws = walkersOf(reg, { now: 1000 });
  assert.deepEqual(ws.map(w => [w.id, w.delay]), [["a", RESERVE.estimateMs], ["b", 600 + RESERVE.estimateMs]]);
  assert.equal(moved(reg, "a", { rid: "r1", movementId: "M1", now: 1250 }), "started");
  ws = walkersOf(reg, { now: 1250 });
  assert.deepEqual(ws.map(w => [w.id, w.delay]), [["a", 0], ["b", 600]], "the clock is the first move's arrival");
  ws = walkersOf(reg, { now: 1500 });
  assert.equal(ws.find(w => w.id === "a").delay, -250, "part way along");
  assert.equal(moved(reg, "a", { rid: null, movementId: "M2", chain: ["M1"], now: 1400 }), "continued");
  assert.equal(moved(reg, "a", { rid: null, movementId: "M9", chain: [], now: 1450 }), "dropped");
  assert.equal(memberOf(reg, "a"), null);
  stopped(reg, "b");
  assert.equal(memberOf(reg, "b"), null);
  assert.equal(reg.recs.size, 0);
  assert.equal(moved(reg, "zz", { rid: "r1" }), "none");
});

test("registry: a member overdue to set off, or long at rest, expires (it counts where it stands, as any token)", () => {
  const reg = registry();
  receive(reg, wire("r1", [walk("a", [{ x: 0, y: 0 }, { x: 6, y: 0 }]), walk("b", [{ x: 0, y: 2 }, { x: 12, y: 2 }], { delay: 300 })]), { now: 0 });
  moved(reg, "b", { rid: "r1", movementId: "B", now: 400 });
  expire(reg, RESERVE.estimateMs + RESERVE.overdueMs - 1);
  assert.ok(memberOf(reg, "a"), "not yet overdue");
  expire(reg, RESERVE.estimateMs + RESERVE.overdueMs + 1);
  assert.equal(memberOf(reg, "a"), null, "never set off: gone");
  const bEnd = 400 + durationOf({ points: [{ x: 0, y: 2 }, { x: 12, y: 2 }], speed: 6 });
  expire(reg, bEnd + RESERVE.restMs - 1);
  assert.ok(memberOf(reg, "b"));
  expire(reg, bEnd + RESERVE.restMs + 1);
  assert.equal(memberOf(reg, "b"), null);
});

test("reads: scene, exclude, skip, keep and the race window filter; rests are the walks' ends", () => {
  const reg = registry();
  receive(reg, wire("r1", [walk("a", [{ x: 0, y: 0 }, { x: 3, y: 0 }]), walk("h", [{ x: 0, y: 5 }, { x: 3, y: 5 }])]), { now: 0 });
  receive(reg, encode({ rid: "r2", scene: "T", members: [walk("c", [{ x: 0, y: 0 }, { x: 3, y: 3 }])] }), { now: 0 });
  receive(reg, wire("r3", [walk("d", [{ x: 9, y: 0 }, { x: 9, y: 3 }])]), { now: 0 });
  const ids = o => walkersOf(reg, { now: 0, scene: "S", ...o }).map(w => w.id).sort();
  assert.deepEqual(ids({}), ["a", "d", "h"]);
  assert.deepEqual(ids({ exclude: new Set(["a"]) }), ["d", "h"]);
  assert.deepEqual(ids({ skip: new Set(["d"]) }), ["a", "h"]);
  assert.deepEqual(ids({ keep: id => id !== "h" }), ["a", "d"], "a player never counts what it does not see");
  assert.deepEqual(ids({ after: 1, before: 3 }), [], "r2 is another scene");
  assert.deepEqual(ids({ after: 0, before: 3 }), ["a", "h"]);
  assert.deepEqual(restsOf(reg, { now: 0, scene: "S", keep: id => id === "d" }), [{ id: "d", x: 9, y: 3, r: 0.5 }]);
});

test("lostRace / clearAfter: two walks head-on in one corridor meet; one behind the other's end does not", () => {
  const mine = [walk("m", [{ x: 0, y: 0 }, { x: 10, y: 0 }])];
  const theirs = [walk("t", [{ x: 10, y: 0 }, { x: 0, y: 0 }])];
  assert.equal(lostRace(mine, theirs), true);
  const after = clearAfter(mine, theirs);
  assert.ok(Math.abs(after - durationOf(theirs[0])) < 1e-6);
  assert.equal(lostRace(mine, [walk("t", [{ x: 0, y: 5 }, { x: 10, y: 5 }])]), false);
  assert.equal(clearAfter(mine, [walk("t", [{ x: 0, y: 5 }, { x: 10, y: 5 }])]), null);
});

test("singleTiming: the smallest delay that meets nothing; with none, it queues until the walks in its way are past", () => {
  // A walker crossing its way: a short wait lets it pass.
  const me = { id: "s", r: 0.5, speed: 6, points: [{ x: 0, y: 3 }, { x: 6, y: 3 }] };
  const crossing = walk("w", [{ x: 3, y: 0 }, { x: 3, y: 6 }]);
  const t = singleTiming(me, [crossing]);
  assert.ok(t.delay > 0 && t.delay <= RESERVE.singleMs && t.delay % MOTION.delayStep === 0, JSON.stringify(t));
  const A = delayed(trajectory(me.points), t.delay), B = trajectory(crossing.points);
  for (let x = 0; x < 4000; x += 10) assert.ok(dist(positionAt(A, x), positionAt(B, x)) >= 1 - 1e-6, `at ${x} ms`);
  assert.deepEqual(singleTiming(me, []), { delay: 0 });
  // Head-on down the same corridor, long: no delay up to the cap clears it.
  const long = { id: "s", r: 0.5, speed: 6, points: [{ x: 0, y: 0 }, { x: 30, y: 0 }] };
  const oncoming = walk("w", [{ x: 30, y: 0 }, { x: 0, y: 0 }]);
  const q = singleTiming(long, [oncoming]);
  assert.equal(q.delay, null);
  assert.ok(q.until > 0 && q.until <= RESERVE.queueMs, JSON.stringify(q));
});

test("singleCut: cut back to where it meets nothing; in a fight on a whole square; a token that cannot move stays", () => {
  const me = { id: "s", r: 0.5, speed: 6, points: [{ x: 0.5, y: 0.5 }, { x: 10.5, y: 0.5 }] };
  const resting = walk("w", [{ x: 8.5, y: 3.5 }, { x: 8.5, y: 0.5 }]);             // comes to rest on its way
  const c = singleCut(me, [resting]);
  assert.ok(c.changed && !c.still);
  const end = c.points.at(-1);
  assert.ok(end.x <= 7.5 + 1e-6, `stops before it: ${JSON.stringify(end)}`);
  const f = singleCut(me, [resting], { combat: true });
  const fe = f.points.at(-1);
  assert.ok(Math.abs(fe.x - 0.5 - Math.round(fe.x - 0.5)) < 1e-6, `whole square: ${JSON.stringify(fe)}`);
  const boxed = singleCut(me, [walk("w", [{ x: 1.5, y: 3.5 }, { x: 1.5, y: 0.5 }])], { combat: true });
  assert.equal(boxed.still, true);
});

test("queueUntil: only a member cut short whose full way meets a walk queues; at most RESERVE.queueMs", () => {
  const full = [{ r: 0.5, speed: 6, delay: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
  assert.equal(queueUntil([], [walk("w", [{ x: 10, y: 0 }, { x: 0, y: 0 }])]), null);
  assert.equal(queueUntil(full, []), null);
  assert.equal(queueUntil(full, [walk("w", [{ x: 0, y: 4 }, { x: 10, y: 4 }])]), null);
  const u = queueUntil(full, [walk("w", [{ x: 10, y: 0 }, { x: 0, y: 0 }], { delay: 200 })]);
  assert.ok(u > 200 && u <= RESERVE.queueMs);
  assert.equal(queueUntil(full, [walk("w", [{ x: 80, y: 0 }, { x: 0, y: 0 }])]), RESERVE.queueMs, "capped: nothing waits forever");
});
