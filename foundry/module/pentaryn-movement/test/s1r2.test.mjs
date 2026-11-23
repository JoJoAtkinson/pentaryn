// Stage 1, round S1R2 (0.5.2): the live S1R2 defects the pure planner shows, on the hard-case dungeon. Squares,
// centres; routes on whole-square lattices as pathfind-adapter's fieldFor anchors them (gridLattice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";
import { planGroup } from "../group-core.mjs";
import { trajectory, delayed, positionAt, dist } from "../motion-core.mjs";

const at = (col, row, w = 1) => ({ x: col + w / 2, y: row + w / 2 });
function plan(group, anchorId, drop, standing, { combat = false } = {}) {
  const g = gridWorld(DUNGEON, { gridLattice: true, pull: !combat });
  const a = group.find(m => m[0] === anchorId);
  const delta = { x: drop[0] - a[1], y: drop[1] - a[2] };
  const ms = group.map(([id, col, row, w = 1]) => member(id, at(col, row, w), delta, { w }));
  const others = standing.map(([id, col, row, w = 1]) => ({ id, ...(w < 1 ? { x: col + 0.5, y: row + 0.5 } : at(col, row, w)), r: w / 2 }));
  const anchor = ms.find(m => m.id === anchorId);
  const o = { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route,
    toward: (m, f, t) => g.route(m, f, t), narrow: g.narrow, cramped: g.cramped, now: () => 0 };
  return { res: finish(planGroup({ members: ms, anchorId, combat, others }, o)), ms, others };
}
const CROWD = [["H5", 13, 3], ["H6", 13, 4], ["H7", 14, 4], ["H8", 13, 6], ["Tiny", 14, 6, 0.5]];

/** The deepest any two members come inside touching (squares, < 0 an overlap), against where they started. */
function worstGraze(res, ms) {
  const list = Object.values(res.members);
  let worst = { d: Infinity, who: null, t: null };
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const p = ms.find(m => m.id === list[i].id), q = ms.find(m => m.id === list[j].id);
    const A = delayed(trajectory(list[i].points), list[i].delay), B = delayed(trajectory(list[j].points), list[j].delay);
    const rr = p.r + q.r;
    const d0 = dist(positionAt(A, 0), positionAt(B, 0));
    for (let t = 0; t <= Math.max(A.end, B.end) + 50; t += 5) {
      const d = dist(positionAt(A, t), positionAt(B, t)) - Math.min(d0, rr);
      if (d < worst.d) worst = { d, who: `${list[i].id}/${list[j].id}`, t };
    }
  }
  return worst;
}

test("S1R2-05: crowd NE: members that start side by side never graze each other while one waits its turn (no more than a hair inside touching)", () => {
  for (const [group, anchor] of [[[["H1", 9, 1], ["H2", 10, 2], ["H3", 10, 1], ["H4", 8, 1]], "H1"], [[["H1", 1, 8], ["H2", 2, 9], ["H3", 1, 10], ["H4", 3, 10]], "H1"]]) {
    const { res, ms } = plan(group, anchor, [14, 5], CROWD);
    assert.equal(res.result, "plan");
    const w = worstGraze(res, ms);
    assert.ok(w.d >= -0.02 - 1e-6, `${w.who} ${(w.d * 100).toFixed(0)} px inside touching at ${w.t} ms`);
  }
});
