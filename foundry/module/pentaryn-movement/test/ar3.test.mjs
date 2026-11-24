// Acceptance round 3 (AR3, 0.8.4 frozen; plan §16.13): one named regression per defect the module fixed in 0.8.5 in
// its pure planner. Each fails on 0.8.4's code. The glue's (fight steps held, a teleport mid-walk, the named notice,
// a stop's walks on together, the hidden-tab flush) are in group.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, remainingVia } from "../group-core.mjs";
import { trajectory, delayed, firstConflict } from "../motion-core.mjs";

// House A over the village square: a one-wide door at column 5 in the wall along row 6.
const HOUSE = `
##############
#............#
#............#
#............#
#............#
#............#
#####.########
#............#
#............#
#............#
#............#
##############`;

const oraclesFor = (g, anchor, extra = {}) => ({ walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route,
  narrow: g.narrow, now: () => 0, ...extra });

test("AR3-01: a row of members beside a one-wide door files through it nearest first; nobody is left standing (0.8.4 ranked the row by the foot of the perpendicular on the grabbed one's route, and its settle kept four of nine where they stood)", () => {
  const g = gridWorld(HOUSE);
  // Hero 1 (grabbed) at the row's west end, the row along row 8 from column 2 to 9; dropped in the house at (5, 3).
  const d = { x: 3, y: -5 };
  const ms = [2, 3, 4, 5, 6, 7, 8, 9].map((c, k) => member(`h${k + 1}`, { x: c + 0.5, y: 8.5 }, d));
  const res = finish(planGroup({ members: ms, anchorId: "h1" }, oraclesFor(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.deepEqual(res.stayed, [], `nobody stays: ${JSON.stringify(res.why)}`);
  for (const m of ms) assert.ok(res.members[m.id].points.length >= 2, `${m.id} moves`);
  // The one under the door (column 5) goes before the far end of the row (column 9).
  assert.ok(res.members.h4.delay <= res.members.h8.delay, `h4 ${res.members.h4.delay} before h8 ${res.members.h8.delay}`);
});

test("AR3-01: remainingVia ranks a point by the walk left by the route (to its nearest leg, then along the rest)", () => {
  const way = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: -4 }];
  assert.equal(remainingVia(way, { x: 4, y: -4 }), 0);
  assert.equal(remainingVia(way, { x: 2, y: 0 }), 6);
  // Beside the route's corner (the foot of every point east of it): its own distance to the corner, then the rest.
  assert.equal(remainingVia(way, { x: 8, y: 0 }), 8);
});

// A one-wide dead end north of a two-wide corridor (M3's T-junction, cut down).
const TEE = `
###############
######.########
######.########
######.########
######.########
######.########
######.########
#.............#
#.............#
###############`;

test("AR3-02: in a fight a one-wide dead end gives every member a square side by side (0.8.4's open-ground rest gap ruled out every second square: three of eight got none)", () => {
  const g = gridWorld(TEE, { gridLattice: true, pull: false });
  // Six heroes in the corridor, the grabbed one at the west end; dropped in the dead end at (6, 3).
  const d = { x: 5, y: -4 };
  const ms = [1, 2, 3, 4, 5].map((c, k) => member(`h${k + 1}`, { x: c + 0.5, y: 7.5 }, d)).concat([member("h6", { x: 1.5, y: 8.5 }, d)]);
  const res = finish(planGroup({ members: ms, anchorId: "h1", combat: true, sequenced: true }, oraclesFor(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.deepEqual(res.stayed, [], `nobody stays: ${JSON.stringify(res.why)}`);
  const ends = Object.values(res.members).map(e => e.points.at(-1));
  assert.equal(new Set(ends.map(p => `${p.x},${p.y}`)).size, ends.length, "one square each");
});

test("AR3-02: the grabbed one at the back of the file into a dead end stops short behind those ahead of it, rather than leave them no way (0.8.4: it waited for spots short of its own, and four never moved)", () => {
  const g = gridWorld(TEE, { gridLattice: true, pull: false });
  const d = { x: 5, y: -4 };
  const ms = [1, 2, 3, 4, 5].map((c, k) => member(`h${k + 1}`, { x: c + 0.5, y: 7.5 }, d)).concat([member("h6", { x: 1.5, y: 8.5 }, d)]);
  const res = finish(planGroup({ members: ms, anchorId: "h1", combat: true, sequenced: true }, oraclesFor(g, ms[0])));
  assert.deepEqual(res.stayed, [], `nobody stays: ${JSON.stringify(res.why)}`);
  const a = res.members.h1.points.at(-1);
  assert.ok(res.members.h1.points.length >= 2, "the grabbed one moves");
  // No member ahead of it in the file rests in the dead end short of it, on its way (it could never get past).
  for (const id of ["h2", "h3", "h4", "h5"]) {
    const p = res.members[id].points.at(-1);
    assert.ok(!(Math.abs(p.x - 6.5) < 1e-6 && p.y > a.y), `${id} at ${JSON.stringify(p)} is not in the grabbed one's way (it rests at ${JSON.stringify(a)})`);
  }
});

// The one-wide bridge into Room E: a file whose head is the grabbed one.
const BRIDGE = `
################
#.##############
#.##############
#.##############
#.#########....#
#..............#
###########....#
###########....#
################`;

test("AR3-02: a grabbed one heading a one-wide file goes first, not last (0.8.4 sent it last, past nobody: nobody moved over the bridge)", () => {
  const g = gridWorld(BRIDGE, { gridLattice: true, pull: false });
  // The file down the west column, the grabbed one at its foot (1, 5); dropped in the room's mouth (11, 5).
  const d = { x: 10, y: 0 };
  const ms = [member("h8", { x: 1.5, y: 5.5 }, d), ...[4, 3, 2, 1].map((r, k) => member(`h${7 - k}`, { x: 1.5, y: r + 0.5 }, d))];
  const res = finish(planGroup({ members: ms, anchorId: "h8", combat: true, sequenced: true }, oraclesFor(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.deepEqual(res.stayed, [], `nobody stays: ${JSON.stringify(res.why)}`);
  assert.equal(Object.keys(res.members)[0], "h8", `the grabbed one heads the file: ${Object.keys(res.members)}`);
});

const LANE = `
################
#..............#
################`;

test("AR3-04: a member slowed in difficult terrain is timed as core draws it (speed over the difficulty): the one behind it waits (0.8.4 timed both at full speed, and the one behind walked into it)", () => {
  const g = gridWorld(LANE);
  // Two in file walking east along the lane; mud from column 6 on (difficulty 3).
  const d = { x: 7, y: 0 };
  const ms = [member("a", { x: 3.5, y: 1.5 }, d), member("b", { x: 2.5, y: 1.5 }, d)];
  const mud = (m, points) => {
    const pts = [points[0]], diff = [];
    for (let k = 1; k < points.length; k++) {
      const p = points[k - 1], q = points[k];
      const n = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.25));
      for (let j = 1; j <= n; j++) {
        const x = p.x + (q.x - p.x) * j / n, y = p.y + (q.y - p.y) * j / n, mx = p.x + (q.x - p.x) * (j - 0.5) / n;
        pts.push({ x, y }); diff.push(mx >= 6 ? 3 : 1);
      }
    }
    return { points: pts, difficulty: diff };
  };
  const plain = finish(planGroup({ members: ms, anchorId: "a" }, oraclesFor(g, ms[0])));
  const slow = finish(planGroup({ members: ms, anchorId: "a" }, oraclesFor(g, ms[0], { terrainPath: mud })));
  const trOf = e => { const t = mud(null, e.points); return delayed(trajectory(t.points, { difficulty: t.difficulty }), e.delay); };
  assert.ok(firstConflict(trOf(plain.members.a), trOf(plain.members.b), 0.5, 0.5) !== null, "timed at full speed, they meet in the mud");
  assert.equal(firstConflict(trOf(slow.members.a), trOf(slow.members.b), 0.5, 0.5), null, "timed as drawn, they never meet");
});

test("AR3-10: a member with no route round the tokens is searched toward its spot in slices (towardSliced), never in one task", () => {
  const g = gridWorld(HOUSE);
  const d = { x: 3, y: -5 };
  const ms = [member("a", { x: 2.5, y: 8.5 }, d), member("L", { x: 8, y: 9 }, d, { w: 2 })];
  let sliced = 0, whole = 0;
  const route = (m, from, to, opts) => (m.id === "L" ? null : g.route(m, from, to, opts));
  const res = finish(planGroup({ members: ms, anchorId: "a" }, oraclesFor(g, ms[0], {
    route,
    toward: () => { whole += 1; return null; },
    towardSliced: function* () { sliced += 1; yield "route"; return null; },
  })));
  assert.equal(res.result, "plan");
  assert.ok(sliced >= 1, "searched in slices");
  assert.equal(whole, 0, "never the one-task search");
});
