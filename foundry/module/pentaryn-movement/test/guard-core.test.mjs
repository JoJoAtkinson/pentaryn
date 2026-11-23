// The runtime yield guard's pure rules (guard-core.mjs, 0.7.0 stage 3): who yields to whom, the look ahead, the
// whole-route check a resume needs, backing out of a higher mover's way, a fight's horizon (doorway: two squares), the
// yield's clock (3 s re-route once, 8 s rest, never forever), and the bucket grid. Plus each move's place in the
// server's order (reserve-core claim / priorityOf), which the guard reads as priority.
import { test } from "node:test";
import assert from "node:assert/strict";
import { GUARD, along, aroundOf, asideSpot, cellHorizon, comparePriority, conflictAhead, hashOf, lengthOf, nearby, newYield,
  pathDistance, standingOnRoute, stepYield, yieldsTo } from "../guard-core.mjs";
import { claim, encode, moved, priorityOf, receive, registry, walkersOf } from "../reserve-core.mjs";

const P = (ord, k = 0, id = "x") => ({ ord, k, id });

test("comparePriority: server order first, then plan order, then id; an order never seen goes first", () => {
  assert.ok(comparePriority(P(1), P(2)) < 0);
  assert.ok(comparePriority(P(3, 0), P(3, 1)) < 0);
  assert.ok(comparePriority(P(3, 1, "a"), P(3, 1, "b")) < 0);
  assert.equal(comparePriority(P(3, 1, "a"), P(3, 1, "a")), 0);
  assert.ok(comparePriority({ id: "z" }, P(1, 0, "a")) < 0);
});

test("yieldsTo: everyone gives way to a standing token; the later mover gives way; a hidden mover gives way to a player's", () => {
  const me = { prio: P(5), hidden: false, byPlayer: false };
  assert.equal(yieldsTo(me, { standing: true, prio: P(9) }), true);
  assert.equal(yieldsTo(me, { standing: false, prio: P(4) }), true);
  assert.equal(yieldsTo(me, { standing: false, prio: P(6) }), false, "never to a lower mover");
  // Exactly one of a pair yields (no double yield, no deadlock of two movers).
  for (const [a, b] of [[P(1), P(2)], [P(2, 0), P(2, 1)], [P(2, 1, "a"), P(2, 1, "b")]]) {
    const x = yieldsTo({ prio: a }, { standing: false, prio: b }), y = yieldsTo({ prio: b }, { standing: false, prio: a });
    assert.notEqual(x, y);
  }
  // Visibility: the GM's hidden mover yields to a player's, even an earlier one; a player's never to a hidden one.
  assert.equal(yieldsTo({ prio: P(1), hidden: true }, { standing: false, prio: P(9), byPlayer: true }), true);
  assert.equal(yieldsTo({ prio: P(9), byPlayer: true }, { standing: false, prio: P(1), hidden: true }), false);
  // Two of the GM's: the order as usual.
  assert.equal(yieldsTo({ prio: P(1), hidden: true }, { standing: false, prio: P(9) }), false);
});

test("along: walks the polyline at its speed after its delay, then stays at its end", () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }];
  assert.deepEqual(along(pts, 6, 0), { x: 0, y: 0 });
  assert.deepEqual(along(pts, 6, 250), { x: 1.5, y: 0 });
  assert.deepEqual(along(pts, 6, 750), { x: 3, y: 1.5 });
  assert.deepEqual(along(pts, 6, 5000), { x: 3, y: 3 });
  assert.deepEqual(along(pts, 6, 250, 250), { x: 0, y: 0 });
  assert.equal(lengthOf(pts), 6);
  assert.equal(pathDistance({ x: 1, y: 1 }, pts), 1);
});

test("conflictAhead: a standing token in its way fires; touching does not; one it starts beside and leaves does not", () => {
  const me = { c: { x: 0, y: 0 }, r: 0.5, points: [{ x: 0, y: 0 }, { x: 5, y: 0 }], speed: 6 };
  const hit = conflictAhead(me, [{ id: "s", c: { x: 2, y: 0 }, r: 0.5, standing: true, yieldTo: true }]);
  assert.ok(hit && hit.id === "s" && hit.standing && hit.t > 0 && hit.t <= GUARD.horizonMs);
  assert.ok(hit.d < 1 - GUARD.tol);
  // Beyond the horizon: not yet.
  assert.equal(conflictAhead(me, [{ id: "s", c: { x: 4.5, y: 0 }, r: 0.5, standing: true, yieldTo: true }]), null);
  // Passing it touching (1 square apart, centre to centre): never fires.
  assert.equal(conflictAhead(me, [{ id: "s", c: { x: 1.5, y: 1 }, r: 0.5, standing: true, yieldTo: true }]), null);
  // Starting overlapped with a neighbour and walking away from it: never fires.
  assert.equal(conflictAhead(me, [{ id: "n", c: { x: -0.7, y: 0 }, r: 0.5, standing: true, yieldTo: true }]), null);
  // Not one it does not give way to.
  assert.equal(conflictAhead(me, [{ id: "s", c: { x: 2, y: 0 }, r: 0.5, standing: false, points: [{ x: 2, y: 0 }, { x: 2, y: 5 }], speed: 6, yieldTo: false }]), null);
});

test("conflictAhead: a pair already inside touching never gets further in (a member of its own plan may brush as its planner lets it)", () => {
  // Overlapped by 0.3 now, and walking a way that closes in by a little more before leaving.
  const me = { c: { x: 0, y: 0 }, r: 0.5, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0 }, { x: 0.1, y: 3 }], speed: 6 };
  const o = { id: "o", c: { x: 0.7, y: 0 }, r: 0.5, standing: true, yieldTo: true };
  assert.ok(conflictAhead(me, [o]), "another token: no closer than now");
  assert.equal(conflictAhead(me, [{ ...o, samePlan: true }]), null, "a member of the same plan: its planner's contact");
});

test("conflictAhead: a higher mover crossing in front fires at the first meeting; its delay is read", () => {
  const me = { c: { x: 0, y: 0 }, r: 0.5, points: [{ x: 0, y: 0 }, { x: 6, y: 0 }], speed: 6 };
  const cross = { id: "m", c: { x: 1.5, y: -2 }, r: 0.5, points: [{ x: 1.5, y: -2 }, { x: 1.5, y: 4 }], speed: 6, yieldTo: true };
  const hit = conflictAhead(me, [cross]);
  assert.ok(hit && hit.id === "m" && !hit.standing);
  // The same crossing 2 s later: not within the horizon.
  assert.equal(conflictAhead(me, [{ ...cross, delay: 2000 }]), null);
  // Standing me, the mover walking into me: fires too (I stand in its way; the glue backs out or holds).
  const still = { c: { x: 1.5, y: 0 }, r: 0.5, points: null, speed: 0 };
  assert.ok(conflictAhead(still, [cross]));
});

test("standingOnRoute: a token standing anywhere along the rest of its way blocks a resume; one it starts on does not", () => {
  const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
  assert.deepEqual(standingOnRoute(pts, 0.5, [{ id: "far", x: 9, y: 0.2, r: 0.5 }]), { id: "far" });
  assert.equal(standingOnRoute(pts, 0.5, [{ id: "side", x: 5, y: 1, r: 0.5 }]), null);
  assert.equal(standingOnRoute(pts, 0.5, [{ id: "on", x: 0.3, y: 0, r: 0.5 }]), null);
});

test("asideSpot: the nearest spot off the higher mover's way, clear of standing tokens and of what ok() refuses", () => {
  const me = { c: { x: 5, y: 5 }, r: 0.5 };
  const threat = { r: 0.5, points: [{ x: 0, y: 5 }, { x: 10, y: 5 }] };
  const spot = asideSpot(me, threat, []);
  assert.ok(spot && pathDistance(spot, threat.points) >= 1 + GUARD.asideGap - 1e-9);
  assert.ok(Math.hypot(spot.x - 5, spot.y - 5) <= GUARD.asideReach + 1e-9);
  // Below blocked by a wall (ok), above by a standing token: nowhere.
  const none = asideSpot(me, threat, [{ x: 5, y: 3.8, r: 0.5 }, { x: 4.3, y: 3.9, r: 0.5 }, { x: 5.7, y: 3.9, r: 0.5 }], { ok: c => c.y < 5 });
  assert.equal(none, null);
  // Every candidate is within reach and sorted nearest first.
  const c = aroundOf({ x: 0, y: 0 });
  for (let k = 1; k < c.length; k++) assert.ok(Math.hypot(c[k].x, c[k].y) >= Math.hypot(c[k - 1].x, c[k - 1].y) - 1e-9);
});

test("cellHorizon: the rest of this square and the next; two squares when the next is a doorway", () => {
  const one = cellHorizon(6, 0.5, [1, 1]);
  const two = cellHorizon(6, 0.5, [1, 1], { doorway: true });
  assert.equal(Math.round(one), Math.round((1.5 / 6) * 1000 + GUARD.cellSlackMs));
  assert.equal(Math.round(two), Math.round((2.5 / 6) * 1000 + GUARD.cellSlackMs));
});

test("stepYield: pause, resume once clear (held at least minHold), re-route once at 3 s, rest at 8 s", () => {
  const y = newYield();
  assert.equal(stepYield(y, { now: 0, conflict: false }), null);
  assert.equal(stepYield(y, { now: 100, conflict: true }), "pause");
  assert.equal(y.phase, "held");
  assert.equal(stepYield(y, { now: 150, clear: true }), null, "clear, but not long enough");
  assert.equal(stepYield(y, { now: 260, clear: false }), null);
  assert.equal(stepYield(y, { now: 300, clear: true }), null);
  assert.equal(stepYield(y, { now: 460, clear: true }), "resume");
  assert.equal(y.phase, "walk");
  // A second yield in the same move keeps the clock of the first.
  assert.equal(stepYield(y, { now: 1000, conflict: true }), "pause");
  assert.equal(stepYield(y, { now: 3099, clear: false }), null);
  assert.equal(stepYield(y, { now: 3100, clear: false }), "reroute");
  assert.equal(y.rerouted, true);
  y.phase = "held";                                        // the glue: no way round
  assert.equal(stepYield(y, { now: 5000, clear: false }), null, "re-routes once only");
  assert.equal(stepYield(y, { now: 8100, clear: false }), "rest");
  assert.equal(y.phase, "done");
  assert.equal(stepYield(y, { now: 9000, conflict: true }), null);
});

test("stepYield: walking again after 8 s, the next conflict rests at once", () => {
  const y = newYield();
  stepYield(y, { now: 0, conflict: true });
  stepYield(y, { now: 100, clear: true });
  assert.equal(stepYield(y, { now: 400, clear: true }), "resume");
  assert.equal(stepYield(y, { now: 9000, conflict: true }), "rest");
});

test("hashOf / nearby: every item within reach is returned (a superset), far ones are not", () => {
  const items = [];
  for (let i = 0; i < 30; i++) for (let j = 0; j < 30; j++) items.push({ c: { x: i * 0.7, y: j * 0.7 } });
  const h = hashOf(items);
  const c = { x: 10, y: 10 };
  const got = new Set(nearby(h, c, 2));
  for (const it of items) if (Math.hypot(it.c.x - c.x, it.c.y - c.y) <= 2) assert.ok(got.has(it));
  assert.ok(got.size < items.length / 10);
});

test("claim / priorityOf: a reserved move takes its reservation's place and its place in the plan; others the next place", () => {
  const reg = registry();
  receive(reg, encode({ rid: "r1", scene: "S", members: [
    { id: "a", r: 0.5, points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] },
    { id: "b", r: 0.5, points: [{ x: 0, y: 1 }, { x: 1, y: 1 }] }] }), { now: 0 });
  // A plain move of c arrives after the reservation, before its members move: it is later in the order.
  claim(reg, "c", moved(reg, "c", { movementId: "C1" }), { movementId: "C1" });
  claim(reg, "b", moved(reg, "b", { rid: "r1", movementId: "B1", now: 10 }), { movementId: "B1" });
  claim(reg, "a", moved(reg, "a", { rid: "r1", movementId: "A1", now: 10 }), { movementId: "A1" });
  const pa = priorityOf(reg, "a"), pb = priorityOf(reg, "b"), pc = priorityOf(reg, "c");
  assert.equal(pa.ord, pb.ord);
  assert.ok(comparePriority(pa, pb) < 0, "plan order inside the reservation");
  assert.ok(comparePriority(pb, pc) < 0, "the reservation arrived first");
  // A fight's next square keeps it; a guard move keeps it; any other new move takes a later place.
  claim(reg, "a", moved(reg, "a", { movementId: "A2", chain: ["A1"] }), { movementId: "A2", chain: ["A1"] });
  assert.equal(priorityOf(reg, "a").ord, pa.ord);
  claim(reg, "a", "none", { movementId: "G1", keep: true });
  assert.equal(priorityOf(reg, "a").ord, pa.ord);
  claim(reg, "a", "none", { movementId: "A9" });
  assert.ok(priorityOf(reg, "a").ord > pc.ord);
  assert.equal(priorityOf(reg, "zz"), null);
  // The reservations' own seq is untouched by plain moves (race windows read it).
  assert.equal(reg.seq, 1);
  // walkersOf names each member's place (ord, k) and who reserved it.
  receive(reg, encode({ rid: "r2", user: "U", scene: "S", members: [{ id: "d", r: 0.5, points: [{ x: 5, y: 5 }, { x: 6, y: 5 }], delay: 300 }] }), { now: 0 });
  const w = walkersOf(reg, { now: 0, scene: "S" }).find(x => x.id === "d");
  assert.equal(w.k, 0);
  assert.equal(w.user, "U");
  assert.ok(w.ord > pc.ord);
});
