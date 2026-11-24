// Stage 2 round 2 (S2R2, pentaryn-movement 0.6.2): what the live round found, pinned. Plan
// context/plans/pathfinding-2026-11.md §15.6.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, settle } from "../group-core.mjs";
import { MOTION, trajectory, firstConflict } from "../motion-core.mjs";

const OPEN = `
######################
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
######################`;

function oracles(g, anchor) {
  return { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route, narrow: g.narrow, now: () => 0 };
}

/**
 * S2R2-01 (root cause, part 1): the timing pass held a member in wave 0 to "one batch, no latency buffer" against a
 * walk of ANOTHER move (wave 0 is the drop's own first batch, never theirs), so it set off at once where settle (and
 * the queue, walkersMeet) keep the 0.75-square buffer: settle then cut it back or left it standing, with a start
 * delay that would have cleared the walk.
 */
test("S2R2-01: a member timed against another move's walk keeps the latency buffer in wave 0 too: it waits, never cut", () => {
  const a = member("a", { x: 2.5, y: 5.5 }, { x: 14, y: 0 });
  const mine = trajectory([a.start, a.formation], { speed: 6 });
  // A walk across a's line at x 9.5 that a's wave-0 start clears without the buffer and meets with it.
  let walker = null;
  for (let d = -1500; d <= 1500 && !walker; d += 10) {
    const w = { id: "w", r: 0.5, speed: 6, delay: d, points: [{ x: 9.5, y: 1.5 }, { x: 9.5, y: 9.5 }] };
    const tr = trajectory(w.points, { speed: 6, delay: d });
    if (firstConflict(mine, tr, 0.5, 0.5, { sameWave: true }) === null && firstConflict(mine, tr, 0.5, 0.5) !== null) walker = w;
  }
  assert.ok(walker, "a walk the buffer alone tells apart");
  const g = gridWorld(OPEN);
  const res = finish(planGroup({ members: [a], anchorId: "a", moving: [walker] }, oracles(g, a)));
  assert.equal(res.result, "plan");
  const e = res.members.a;
  assert.deepEqual(res.cut, [], `not cut: ${JSON.stringify(e)}`);
  assert.deepEqual(res.stayed, []);
  assert.ok(e.delay > 0 && e.delay % MOTION.delayStep === 0, `it waits for the walk: delay ${e.delay}`);
  assert.equal(Math.hypot(e.points.at(-1).x - a.formation.x, e.points.at(-1).y - a.formation.y) < 1e-6, true, "the whole way");
});

/**
 * S2R2-01 (root cause, part 2): the queue read the walks again at delivery and asked only whether a short member's
 * whole way FROM NOW meets one. A member settle cut back or left standing for a walk it meets only at the start delay
 * the timing gave it, or for a walk gone while the plan ran (on a loaded tab a plan's slices are 300 ms apart, and a
 * reserved walk counts until 1 s past its end), was committed short with nothing to wait for: the grabbed Hero 5
 * stayed at its start, "Another move is still in the way: it stays where it is", the corridor clear.
 */
test("S2R2-01: settle says which walk a member gave way to", () => {
  const w = { id: "W", r: 0.5, speed: 6, delay: 0, points: [{ x: 5, y: -4 }, { x: 5, y: 4 }] };
  const gen = settle([{ id: "a", r: 0.5, speed: 6, delay: 0, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }], { walkers: [w] });
  let v = gen.next();
  while (!v.done) v = gen.next();
  const e = v.value.get("a");
  assert.equal(e.changed, true, "cut back");
  assert.deepEqual(e.walks, ["W"]);
});
