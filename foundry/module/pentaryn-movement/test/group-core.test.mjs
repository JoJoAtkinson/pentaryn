// Pure group planning and motion (group-core.mjs, motion-core.mjs): the plan's unit acceptance tests
// (context/plans/pathfinding-2026-11.md §12 "Acceptance tests", numbered as there) plus the decision
// tables. Floors are ASCII maps (test/fixtures/grid.mjs) routed with the real pathfind-core A*.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, assignSlots, runPlan, hexCandidates, cellCandidates, flood, alongRoute, GROUP_LIMITS } from "../group-core.mjs";
import {
  MOTION, trajectory, delayed, positionAt, firstConflict, minSeparation, waves, cellChain, groupMode, clickStop, dist,
} from "../motion-core.mjs";
import * as pf from "../pathfind-core.mjs";

const CORRIDOR = `
##########################
#.....####################
#.....####################
#.........................
#.....####################
#.....####################
##########################`;

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

const ROOM = `
##############
#............#
#............#
#............#
#.......#....#
#............#
#............#
#............#
##############`;

/** Oracles over a grid world for an anchor. */
function oracles(g, anchor, extra = {}) {
  return { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route, narrow: g.narrow, now: () => 0, ...extra };
}
function plan(ascii, members, anchorId, spec = {}, extra = {}) {
  const g = gridWorld(ascii);
  const anchor = members.find(m => m.id === anchorId);
  const res = finish(planGroup({ members, anchorId, ...spec }, oracles(g, anchor, extra)));
  return { g, res };
}
const traj = e => delayed(trajectory(e.points), e.delay);
/** Smallest distance between two planned members while both are moving (5 ms samples). */
function minWhileMoving(a, b) {
  const A = traj(a), B = traj(b);
  let best = Infinity;
  for (let t = Math.max(A.start, B.start); t <= Math.min(A.end, B.end); t += 5) best = Math.min(best, dist(positionAt(A, t), positionAt(B, t)));
  return best;
}
function pairs(res) {
  const list = Object.values(res.members);
  const out = [];
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]);
  return out;
}
const R = 0.5; // a Medium token's radius in squares

test("1. two circles converging on one route: the second is delayed; moving apart ≥ r1 + r2 + 0.25", () => {
  const d = { x: 15, y: 0 };
  const { res } = plan(CORRIDOR, [member("a", { x: 4.5, y: 3.5 }, d), member("b", { x: 4.5, y: 2.5 }, d)], "a");
  assert.equal(res.result, "plan");
  const { a, b } = res.members;
  assert.equal(a.delay, 0);
  assert.ok(b.delay > 0, `b delay ${b.delay}`);
  assert.equal(b.delay % MOTION.delayStep, 0);
  assert.ok(minWhileMoving(a, b) >= 2 * R + MOTION.motionGap - 1e-6, `moving separation ${minWhileMoving(a, b)}`);
});

test("2. 1-wide corridor, 4 members in a column: depth-ordered slots, strictly increasing delays, no re-plans, no relaxations", () => {
  const d = { x: 15, y: 0 };
  const ms = [member("a", { x: 3.5, y: 3.5 }, d), member("b", { x: 3.5, y: 2.5 }, d), member("c", { x: 3.5, y: 4.5 }, d), member("e", { x: 3.5, y: 1.5 }, d)];
  const { res } = plan(CORRIDOR, ms, "a");
  assert.equal(res.constricted, true);
  assert.equal(res.replans, 0);
  assert.equal(res.relaxed, 0);
  const file = Object.values(res.members).sort((x, y) => x.delay - y.delay);
  // Slot depth (x along the corridor) falls as the delay rises: nobody passes anybody.
  for (let k = 1; k < file.length; k++) {
    assert.ok(file[k].delay > file[k - 1].delay, `delays ${file.map(f => f.delay)}`);
    assert.ok(file[k].slot.x < file[k - 1].slot.x, `slots ${file.map(f => f.slot.x)}`);
    assert.equal(file[k].slot.y, 3.5);
  }
  assert.deepEqual(res.members.a.slot, { x: 18.5, y: 3.5 }, "the anchor lands where dropped");
  for (const [p, q] of pairs(res)) assert.ok(dist(p.slot, q.slot) >= 2 * R + MOTION.restGap - 1e-6);
});

test("3. a 1-wide door, 6 members in a 3×2 block: all pass, separation holds, the last waits ≤ 3 s", () => {
  const d = { x: 0, y: 4 };
  const ms = [];
  let n = 0;
  for (const y of [1.5, 2.5]) for (const x of [6.5, 7.5, 8.5]) ms.push(member(`m${n++}`, { x, y }, d));
  const { g, res } = plan(DOOR, ms, "m4");
  assert.equal(res.result, "plan");
  assert.equal(res.relaxed, 0);
  assert.deepEqual(res.excluded, []);
  assert.deepEqual(res.members.m4.slot, { x: 7.5, y: 6.5 });
  for (const e of Object.values(res.members)) {
    assert.ok(e.slot.y > 5, `${e.id} ends in the lower room`);
    assert.ok(g.walkable({ w: 1 }, e.slot));
    assert.ok(e.delay <= MOTION.maxDelay);
  }
  for (const [p, q] of pairs(res)) {
    assert.ok(dist(p.slot, q.slot) >= 2 * R + MOTION.restGap - 1e-6, `${p.id}/${q.id} rest`);
    // Grid neighbours may brush as one leaves (MOTION.contact); nothing more.
    assert.ok(minSeparation(traj(p), traj(q)) >= 2 * R - MOTION.contact - 1e-6, `${p.id}/${q.id} ${minSeparation(traj(p), traj(q))}`);
  }
});

test("4. a formation spot inside a wall: that member is re-slotted, the others and the anchor keep theirs", () => {
  // Three in a row; the drop puts the middle one's same-delta spot inside the pillar (row 4, column 8).
  const d = { x: 5, y: 3 };
  const ms = [member("a", { x: 2.5, y: 1.5 }, d), member("b", { x: 3.5, y: 1.5 }, d), member("c", { x: 4.5, y: 1.5 }, d)];
  const { g, res } = plan(ROOM, ms, "a");
  assert.equal(res.formation, false);
  assert.deepEqual(res.members.a.slot, { x: 7.5, y: 4.5 });
  assert.equal(g.walkable({ w: 1 }, ms[1].formation), false, "b's formation spot is in the pillar");
  assert.ok(g.walkable({ w: 1 }, res.members.b.slot));
  assert.deepEqual(res.reslotted, ["b"]);
  assert.deepEqual(res.members.c.slot, ms[2].formation);
  for (const [p, q] of pairs(res)) assert.ok(dist(p.slot, q.slot) >= 2 * R - 1e-6);
});

test("5. mixed sizes: the Large is placed first and nothing overlaps at rest", () => {
  const anchor = { id: "a", w: 1, h: 1, r: 0.5, start: { x: 0.5, y: 0.5 }, formation: { x: 5.5, y: 5.5 } };
  const large = { id: "L", w: 2, h: 2, r: 1, start: { x: 0, y: 3 }, formation: { x: 9, y: 9 } };
  const medium = { id: "m", w: 1, h: 1, r: 0.5, start: { x: 0.5, y: 2.5 }, formation: { x: 9.5, y: 9.5 } };
  // Both formation spots are off the floor; both would rather have the spot nearest them, east of the anchor.
  const walkable = (m, c) => c.x < 8 && c.y < 8;
  const out = assignSlots({ members: [anchor, medium, large], anchorId: "a", walkable, walkDistance: c => dist(c, anchor.formation) });
  assert.deepEqual(out.missing, []);
  const s = out.slots;
  // The spot both want (nearest their formation spots): the Large, placed first, has it.
  const want = hexCandidates(anchor.formation, 2 * 1 + MOTION.restGap).filter(c => walkable(null, c) && dist(c, anchor.formation) >= 1.5 + MOTION.restGap)
    .sort((p, q) => dist(p, large.formation) - dist(q, large.formation))[0];
  assert.deepEqual(s.L, want);
  assert.notDeepEqual(s.m, want);
  assert.ok(dist(s.L, s.a) >= 1.5 + MOTION.restGap - 1e-6);
  assert.ok(dist(s.m, s.a) >= 1 + MOTION.restGap - 1e-6);
  assert.ok(dist(s.L, s.m) >= 1.5 + MOTION.restGap - 1e-6);
});

test("6. members that start overlapped: no conflict before they first separate", () => {
  const A = trajectory([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  const B = trajectory([{ x: 0.3, y: 0 }, { x: 0.3, y: 10 }]);                   // overlapped, then apart
  assert.equal(firstConflict(A, B, R, R), null);
  const C = trajectory([{ x: 0.2, y: 0 }, { x: 10.2, y: 0 }]);                   // overlapped, side by side throughout
  assert.equal(firstConflict(A, C, R, R), null);
  // Once separated the full distance applies: D leaves, then cuts back through A's line.
  const D = trajectory([{ x: 0.2, y: 0 }, { x: 0.2, y: 4 }, { x: 10, y: 0.5 }]);
  assert.notEqual(firstConflict(A, D, R, R), null);
});

test("7. a member with no route is excluded; the rest are planned around where core leaves it", () => {
  const SEALED = `
############
#..........#
#..........#
#..........#
#######.####
#...........
####.#######
#..#.......#
############`;
  // "z" stands in a sealed pocket (row 7, columns 1-2); core leaves it where it is.
  const d = { x: 0, y: 4 };
  const ms = [member("a", { x: 7.5, y: 1.5 }, d), member("b", { x: 8.5, y: 1.5 }, d), member("z", { x: 1.5, y: 7.5 }, { x: 0, y: -2 })];
  ms[2].corePath = [{ x: 1.5, y: 7.5 }];
  const { res } = plan(SEALED, ms, "a");
  assert.equal(res.result, "plan");
  assert.deepEqual(res.excluded, ["z"]);
  assert.equal(res.members.z.core, true);
  assert.equal(res.members.b.core, false);
  for (const id of ["a", "b"]) assert.ok(dist(res.members[id].slot, { x: 1.5, y: 7.5 }) >= 1 - 1e-6);
});

test("8. over budget: the result is core, with no partial plan", () => {
  const clock = { t: 0, perRoute: GROUP_LIMITS.memberMs + 1 };
  const g = gridWorld(DOOR, { clock });
  const d = { x: 0, y: 4 };
  const ms = [member("a", { x: 7.5, y: 2.5 }, d), member("b", { x: 6.5, y: 2.5 }, d)];
  const res = finish(planGroup({ members: ms, anchorId: "a" }, oracles(g, ms[0], { now: () => clock.t })));
  assert.deepEqual(res, { result: "core", reason: "budget" });
  // Total budget too: many cheap routes add up past 1 s.
  const slow = { t: 0, perRoute: 200 };
  const g2 = gridWorld(DOOR, { clock: slow });
  const many = [];
  for (let k = 0; k < 6; k++) many.push(member(`m${k}`, { x: 2.5 + k, y: 2.5 }, d));
  const res2 = finish(planGroup({ members: many, anchorId: "m0" }, oracles(g2, many[0], { now: () => slow.t })));
  assert.equal(res2.result, "core");
  assert.equal(res2.members, undefined);
});

test("runPlan: time slices resume the same plan; a finished plan returns its value", () => {
  const d = { x: 15, y: 0 };
  const ms = [member("a", { x: 3.5, y: 3.5 }, d), member("b", { x: 3.5, y: 2.5 }, d)];
  const g = gridWorld(CORRIDOR);
  let t = 0;
  const gen = planGroup({ members: ms, anchorId: "a" }, oracles(g, ms[0], { now: () => t }));
  const first = runPlan(gen, 0, () => (t += 1));
  assert.equal(first.done, false);
  let r = first;
  while (!r.done) r = runPlan(gen, 1000, () => t);
  assert.equal(r.value.result, "plan");
});

test("9. tessellation: chords within 0.05 square of the arc, at most 8 points a corner, 64 a route", () => {
  const S = 100;
  // One right-angle corner with the largest fillet (tangent 2 squares, radius 2 squares).
  const arc = pf.filletPoints({ x: 0, y: 0 }, { x: 5 * S, y: 0 }, { x: 5 * S, y: 5 * S }, 2 * S, pf.LIMITS.arcStepDeg, { maxError: MOTION.chordError * S });
  assert.ok(arc.length <= MOTION.cornerPoints, `${arc.length} points`);
  const O = { x: 3 * S, y: 2 * S };
  for (const p of arc) assert.ok(Math.abs(Math.hypot(p.x - O.x, p.y - O.y) - 2 * S) < 1e-6, "on the circle");
  for (let k = 1; k < arc.length; k++) {
    const m = { x: (arc[k - 1].x + arc[k].x) / 2, y: (arc[k - 1].y + arc[k].y) / 2 };
    assert.ok(2 * S - Math.hypot(m.x - O.x, m.y - O.y) <= MOTION.chordError * S + 1e-6);
  }
  // Without the bound the 40° sampling is coarser than 0.05 square (why the bound exists).
  const coarse = pf.filletPoints({ x: 0, y: 0 }, { x: 5 * S, y: 0 }, { x: 5 * S, y: 5 * S }, 2 * S);
  assert.ok(coarse.length < arc.length);
  // A long zigzag: the whole route stays within 64 points (later corners stay sharp).
  const pts = [];
  for (let k = 0; k < 40; k++) pts.push({ x: k * 5 * S, y: (k % 2) * 5 * S });
  const r = pf.fillet(pts, { maxT: 2 * S, clear: () => true, cost: () => 0, maxError: MOTION.chordError * S,
    cornerPoints: MOTION.cornerPoints, maxPoints: MOTION.routePoints });
  assert.ok(r.points.length <= MOTION.routePoints, `${r.points.length} points`);
  assert.ok(r.arcs > 0 && r.arcs < 38);
  assert.deepEqual(r.points.at(-1), { ...pts.at(-1) });
});

test("10. combat route: every checkpoint is a cell, each step one square; the cost is the grid optimum", () => {
  const rows = ["..........", "..######..", "..#....#..", "..#.##.#..", "......#...", ".........."];
  const free = (i, j) => i >= 0 && j >= 0 && i < rows.length && j < rows[0].length && rows[i][j] === ".";
  const edge = (a, b) => (free(b.i, b.j) ? 5 : null);
  const wall = (a, b) => free(b.i, b.j);
  const job = pf.search({ start: { i: 2, j: 4 }, goal: { i: 5, j: 9 }, edge, wall, unit: 5 });
  assert.equal(job.run(), "found");
  const pulled = pf.stringPull(job.path, job.costs, { edge, wall });
  const cells = cellChain(pulled);
  assert.deepEqual(cells[0], { i: 2, j: 4, checkpoint: false });
  assert.deepEqual({ i: cells.at(-1).i, j: cells.at(-1).j }, { i: 5, j: 9 });
  let cost = 0;
  for (let k = 1; k < cells.length; k++) {
    assert.ok(Number.isInteger(cells[k].i) && Number.isInteger(cells[k].j));
    assert.equal(Math.max(Math.abs(cells[k].i - cells[k - 1].i), Math.abs(cells[k].j - cells[k - 1].j)), 1);
    assert.equal(cells[k].checkpoint, true);
    assert.ok(free(cells[k].i, cells[k].j));
    cost += 5;
  }
  assert.equal(cost, job.costs.at(-1));
  // Every second cell (the stutter fallback): the last stays a checkpoint.
  const two = cellChain(pulled, 2);
  assert.equal(two.at(-1).checkpoint, true);
  assert.equal(two[1].checkpoint, false);
  assert.equal(two[2].checkpoint, true);
});

test("10b. in combat there are no lateral re-plans: delays and slots only", () => {
  const d = { x: 0, y: 4 };
  const ms = [];
  let n = 0;
  for (const y of [1.5, 2.5]) for (const x of [6.5, 7.5, 8.5]) ms.push(member(`m${n++}`, { x, y }, d));
  const { g, res } = plan(DOOR, ms, "m4", { combat: true });
  assert.equal(res.replans, 0);
  assert.equal(g.calls.avoid, 0);
  for (const e of Object.values(res.members)) {
    assert.notEqual(e.level, 1);
    // Combat slots are whole cells.
    assert.ok(Number.isInteger(e.slot.x - 0.5) && Number.isInteger(e.slot.y - 0.5), JSON.stringify(e.slot));
  }
});

test("11. skip reasons: direct, ghost, ignoreWalls (unconstrained) and a non-square grid", () => {
  const go = { members: 3 };
  assert.deepEqual(groupMode({ ...go, direct: true }), { mode: "core", reason: "direct" });
  assert.deepEqual(groupMode({ ...go, ghost: true }), { mode: "straight", reason: "ghost" });
  assert.deepEqual(groupMode({ ...go, unconstrained: true }), { mode: "straight", reason: "unconstrained" });
  assert.deepEqual(groupMode({ ...go, ghost: true, combat: true }), { mode: "core", reason: "ghost" });
  assert.deepEqual(groupMode({ ...go, gridType: 0 }), { mode: "core", reason: "grid" });
  assert.deepEqual(groupMode({ ...go, gridType: 2 }), { mode: "core", reason: "grid" });
  assert.deepEqual(groupMode({ ...go, enabled: false }), { mode: "core", reason: "off" });
  assert.deepEqual(groupMode({ members: 1 }), { mode: "core", reason: "single" });
  assert.deepEqual(groupMode({ ...go, planned: true }), { mode: "core", reason: "planned" });
  assert.deepEqual(groupMode({ ...go, waypoints: true }), { mode: "core", reason: "waypoints" });
  assert.deepEqual(groupMode({ ...go, pathfind: "client" }), { mode: "core", reason: "pathfind:client" });
  assert.deepEqual(groupMode(go), { mode: "plan", reason: null });
});

test("12. thirteen members: core", () => {
  assert.deepEqual(groupMode({ members: 13 }), { mode: "core", reason: "tooMany" });
  const ms = [];
  for (let k = 0; k < 13; k++) ms.push(member(`m${k}`, { x: 1.5 + k % 6, y: 1.5 + Math.floor(k / 6) }, { x: 0, y: 4 }));
  const g = gridWorld(DOOR);
  const res = finish(planGroup({ members: ms, anchorId: "m0" }, oracles(g, ms[0])));
  assert.deepEqual(res, { result: "core", reason: "tooMany" });
  assert.equal(g.calls.route, 0, "no route was searched");
});

test("ten members through a door: every one ends in the lower room, none overlapping at rest", () => {
  const d = { x: 0, y: 4 };
  const ms = [];
  for (let k = 0; k < 10; k++) ms.push(member(`m${k}`, { x: 3.5 + (k % 5) * 2, y: 1.5 + Math.floor(k / 5) }, d));
  const { res } = plan(DOOR, ms, "m2");
  assert.equal(res.result, "plan");
  const list = Object.values(res.members);
  assert.equal(list.length, 10);
  for (const e of list) {
    assert.ok(!e.core, `${e.id} planned`);
    assert.ok(e.slot.y > 5, `${e.id} ends in the lower room`);
  }
  for (const [p, q] of pairs(res)) assert.ok(dist(p.slot, q.slot) >= 2 * R + MOTION.restGap - 1e-6, `${p.id}/${q.id}`);
});

test("open ground: the formation is kept and walks together in one batch", () => {
  const d = { x: 3, y: 0 };
  const ms = [member("a", { x: 2.5, y: 2.5 }, d), member("b", { x: 2.5, y: 3.5 }, d), member("c", { x: 3.5, y: 2.5 }, d)];
  const { res } = plan(ROOM, ms, "a");
  assert.equal(res.formation, true);
  for (const m of ms) {
    assert.deepEqual(res.members[m.id].slot, m.formation);
    assert.equal(res.members[m.id].delay, 0, `${m.id} goes with the first batch`);
  }
});

test("ghost / unconstrained (straight): straight lines, one batch; only an overlapping rest spot is nudged", () => {
  const ms = [member("a", { x: 2.5, y: 2.5 }, { x: 4, y: 0 }), member("b", { x: 3.5, y: 2.5 }, { x: 4, y: 0 })];
  const g = gridWorld(ROOM);
  const straight = finish(planGroup({ members: ms, anchorId: "a", mode: "straight" }, oracles(g, ms[0])));
  assert.equal(straight.straight, true);
  assert.equal(g.calls.route, 0);
  for (const m of ms) {
    assert.deepEqual(straight.members[m.id].points, [m.start, m.formation]);
    assert.equal(straight.members[m.id].delay, 0);
  }
  // Two that start stacked on one square: the second is nudged so they do not rest on top of each other.
  const stacked = [member("a", { x: 2.5, y: 2.5 }, { x: 4, y: 0 }), member("b", { x: 2.5, y: 2.5 }, { x: 4, y: 0 })];
  const res = finish(planGroup({ members: stacked, anchorId: "a", mode: "straight" }, oracles(g, stacked[0])));
  assert.deepEqual(res.members.a.slot, stacked[0].formation);
  assert.ok(dist(res.members.a.slot, res.members.b.slot) >= 1 - 1e-6);
  assert.deepEqual(res.reslotted, ["b"]);
});

test("trajectories: linear per segment, delayed starts, terrain slows a segment, rest after the end", () => {
  const tr = trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 3 }], { speed: 6, difficulty: [1, 2] });
  assert.equal(tr.times[1], 1000);
  assert.equal(tr.end, 2000);                         // 3 squares at half speed
  assert.deepEqual(positionAt(tr, 500), { x: 3, y: 0 });
  assert.deepEqual(positionAt(tr, 1500), { x: 6, y: 1.5 });
  assert.deepEqual(positionAt(tr, 9999), { x: 6, y: 3 });
  const late = delayed(tr, 300);
  assert.deepEqual(positionAt(late, 200), { x: 0, y: 0 });
  assert.deepEqual(positionAt(late, 800), { x: 3, y: 0 });
  // Stopped mid-path (click to stop): where the token is drawn at that instant is the trajectory's point.
  assert.deepEqual(positionAt(tr, 750), { x: 4.5, y: 0 });
});

test("conflicts: one batch out of combat may walk touching; different waves or combat need the buffer", () => {
  const A = trajectory([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
  const B = trajectory([{ x: 0, y: 1.1 }, { x: 10, y: 1.1 }]);
  assert.equal(firstConflict(A, B, R, R, { sameWave: true }), null);
  assert.notEqual(firstConflict(A, B, R, R, { sameWave: false }), null);
  assert.notEqual(firstConflict(A, B, R, R, { sameWave: true, combat: true }), null);
  // Head on: found, and at the right moment (centres 1 apart at t where 10 - 12t/1000·… closes).
  const C = trajectory([{ x: 10, y: 0 }, { x: 0, y: 0 }]);
  const hit = firstConflict(A, C, R, R, { sameWave: true });
  assert.ok(hit && Math.abs(hit.t - 750) < 1, JSON.stringify(hit));
  assert.ok(minSeparation(A, C) < 1e-6);
});

test("waves: delays bucket into one batched update per 150 ms", () => {
  assert.deepEqual(waves({ a: 0, b: 0, c: 150, d: 160, e: 300 }), [
    { at: 0, ids: ["a", "b"] }, { at: 150, ids: ["c"] }, { at: 300, ids: ["d", "e"] },
  ]);
});

test("candidates: a hex ring of 6k per ring; cells nearest first; the flood walks round walls", () => {
  assert.equal(hexCandidates({ x: 0, y: 0 }, 1, 3).length, 6 + 12 + 18);
  for (const c of hexCandidates({ x: 0, y: 0 }, 1.1, 1)) assert.ok(Math.abs(Math.hypot(c.x, c.y) - 1.1) < 1e-9);
  const cells = cellCandidates({ x: 2, y: 2 }, 1, 1, 2);
  assert.equal(cells.length, 24);
  assert.deepEqual(cells[0], { x: 1.5, y: 1.5 });
  const rows = ["...", "##.", "..."];
  const f = flood({ i: 0, j: 0 }, (a, b) => b.i >= 0 && b.j >= 0 && b.i < 3 && b.j < 3 && rows[b.i][b.j] === "."
    && (a.i === b.i || a.j === b.j || (rows[a.i][b.j] === "." && rows[b.i][a.j] === ".")), 5);
  assert.ok(f.get("2,0") > 4, `round the wall: ${f.get("2,0")}`);
  assert.equal(alongRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 4, y: 3 }), 4);
  assert.equal(alongRoute([{ x: 0, y: 0 }, { x: 10, y: 0 }], { x: 12, y: 0 }), 12);
});

test("click to stop: the decision table", () => {
  const moving = { canControl: true, state: "completed", animating: true };
  assert.equal(clickStop(moving), "displace");
  assert.equal(clickStop({ ...moving, combat: true, initiatorSelf: true }), "stop");
  assert.equal(clickStop({ ...moving, combat: true, initiatorSelf: false }), "query");
  assert.equal(clickStop({ ...moving, state: "pending", animating: false }), "displace");
  assert.equal(clickStop({ ...moving, state: "paused", animating: false }), "displace");
  assert.equal(clickStop({ ...moving, animating: false }), null, "not moving: core's click");
  assert.equal(clickStop({ ...moving, tool: "target" }), null);
  assert.equal(clickStop({ ...moving, modifiers: true }), null);
  assert.equal(clickStop({ ...moving, canControl: false }), null);
  assert.equal(clickStop({ ...moving, enabled: false }), null);
});
