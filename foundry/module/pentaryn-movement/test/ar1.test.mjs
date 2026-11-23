// Acceptance round 1 (AR1, 0.8.2 frozen; plan §16.11): one named regression per defect the module fixed in 0.8.3.
// Each fails on 0.8.2's code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup } from "../group-core.mjs";

const DOOR = `
###############
#.............#
#.............#
#.............#
#######.#######
#.............#
#.............#
#.............#
###############`;

test("AR1-04: a Large that fits no door stays where it stands when its short way would end in the others' way (never parked in the door's mouth)", () => {
  const g = gridWorld(DOOR);
  // a (anchor), b, c, e and f file down from the upper room through the one-wide door (column 7, row 4).
  const d = { x: 0, y: 4 };
  const ms = [member("a", { x: 7.5, y: 2.5 }, d), member("b", { x: 6.5, y: 2.5 }, d), member("c", { x: 8.5, y: 2.5 }, d),
    member("e", { x: 7.5, y: 1.5 }, d), member("f", { x: 6.5, y: 1.5 }, d)];
  // The Large fits no door: the way toward its spot ends in the door's mouth, in the way of every other member
  // (0.8.2 parked it there, at (7, 3)).
  const L = member("L", { x: 3, y: 2 }, { x: 4, y: 4 }, { w: 2 });
  const route = (m, from, to, opts) => (m.id === "L" ? null : g.route(m, from, to, opts));
  const toward = m => (m.id === "L" ? { points: [{ x: 3, y: 2 }, { x: 7, y: 3 }], length: 4.1 } : null);
  const res = finish(planGroup({ members: [...ms, L], anchorId: "a" },
    { walkable: g.walkable, walkDistance: g.walkDistanceFrom(ms[0].formation), route, toward, narrow: g.narrow, now: () => 0 }));
  assert.equal(res.result, "plan");
  const e = res.members;
  assert.equal(e.L.points.length, 1, `the Large stays: ${JSON.stringify(e.L.points)}`);
  assert.deepEqual(e.L.points[0], { x: 3, y: 2 });
  for (const id of ["a", "b", "c", "e", "f"]) assert.ok(e[id].points.length >= 2, `${id} moves`);
  assert.deepEqual(res.stayed.filter(id => id !== "L"), [], "nobody else is left standing");
});
