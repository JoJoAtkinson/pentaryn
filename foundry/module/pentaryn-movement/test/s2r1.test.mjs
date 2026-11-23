// Stage 2, round 1 (0.6.1): the live S2R1 defects that are the planner's own. S2R1-02: while two groups moved, every
// token on a tab froze for 300-870 ms at a time. A route search was the one step of a plan that never yielded: each
// one held the page up to its 250 ms cap (a search with no way, round the tokens it keeps clear of, explores the whole
// map), two or three in one slice. Every route search of a plan now runs in slices (o.routeSliced).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member } from "./fixtures/grid.mjs";
import { planGroup } from "../group-core.mjs";
import { queueNext, RESERVE } from "../reserve-core.mjs";
import { MOTION } from "../motion-core.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";

const at = (col, row) => ({ x: col + 0.5, y: row + 0.5 });

function oracles(g, anchor, { sliced = true } = {}) {
  const calls = { route: 0, sliced: 0, yields: 0 };
  const o = { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), toward: (m, f, t) => g.route(m, f, t),
    narrow: g.narrow, cramped: g.cramped, now: () => 0,
    route: (...a) => { calls.route += 1; return g.route(...a); } };
  // A search in three slices: it yields between them, as the glue's (pathfind routeSteps) does.
  if (sliced) o.routeSliced = function* (...a) { calls.sliced += 1; for (let k = 0; k < 3; k++) { calls.yields += 1; yield "route"; } return g.route(...a); };
  return { o, calls };
}

test("S2R1-02: every route search of a plan runs in slices when the glue has them (a yield between slices); the same plan", () => {
  const g = gridWorld(DUNGEON, { gridLattice: true });
  const group = [["H1", 8, 3], ["H2", 8, 5], ["H3", 8, 7], ["H4", 9, 4]];
  const drop = [17, 5];
  const mk = () => {
    const a = group[0];
    const delta = { x: drop[0] - a[1], y: drop[1] - a[2] };
    return group.map(([id, c, r]) => member(id, at(c, r), delta, {}));
  };
  const others = [{ id: "S1", ...at(5, 3), r: 0.5 }, { id: "S2", ...at(12, 5), r: 0.5 }];   // S2 stands in the corridor's mouth
  const run = sliced => {
    const ms = mk();
    const { o, calls } = oracles(g, ms[0], { sliced });
    const gen = planGroup({ members: ms, anchorId: "H1", others }, o);
    const labels = [];
    let v;
    while (!(v = gen.next()).done) labels.push(v.value);
    return { plan: v.value, calls, labels };
  };
  const a = run(true), b = run(false);
  assert.equal(a.calls.route, 0, "no route search runs in one go");
  assert.ok(a.calls.sliced > 0);
  assert.ok(a.labels.filter(l => l === "route").length >= a.calls.yields, "the plan yields between a search's slices");
  assert.equal(a.plan.result, b.plan.result);
  for (const id of Object.keys(b.plan.members ?? {})) {
    assert.deepEqual(a.plan.members[id].points, b.plan.members[id].points, `${id}: the same way`);
    assert.equal(a.plan.members[id].delay, b.plan.members[id].delay, `${id}: the same delay`);
  }
});

test("S2R1-01 / S2R1-03: queueNext — a drop queues again while a walk is in its way, RESERVE.queueMs in all", () => {
  assert.equal(queueNext(0, 2000), 2000);
  assert.equal(queueNext(2000, 3000), 3000, "a second queue");
  assert.equal(queueNext(6000, 3000), RESERVE.queueMs - 6000, "never past the budget");
  assert.equal(queueNext(RESERVE.queueMs - MOTION.delayStep / 2, 3000), null, "spent");
  assert.equal(queueNext(0, null), null);
  assert.equal(queueNext(0, 0), null);
});
