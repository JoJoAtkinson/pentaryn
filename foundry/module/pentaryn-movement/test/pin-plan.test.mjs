// Pins the group-drag planner as it is, before the 0.10.2 clean-up (characterisation: every number below is what the code
// gave when this file was written; one that looks odd is marked "ODD" and pinned all the same). The files it holds still:
//   motion-core.mjs  groupMode (the decision table), GROUP_MAX, waves
//   group-core.mjs   flood, stacksOf
//   file-core.mjs    LEAD, STAGGER, planLead (march, swarm, the door plug), staggerFile, narrowZones, walkFrom, heap,
//                    footprintCells, routeEnters
//   file.mjs         targetOf, fightPlan, slotAtTurn, planDrop(Steps), dryRun (through the board at the foot)
//   api.mjs          planGroup
// The pure half runs routed on ASCII floors (test/fixtures/grid.mjs, the real pathfind-core A*); the glue half on the
// board drop.test.mjs uses (a 100 px grid, a wall across y = 400 with a one-square door at x 400-500). Squares are row i,
// column j; centres in squares (x = j + 0.5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, SCENE } from "./fixtures/world.mjs";
import { gridWorld } from "./fixtures/grid.mjs";
import { LEAD, STAGGER, footprintCells, heap, narrowZones, planLead, planLeadSteps, routeEnters, staggerFile, walkFrom } from "../file-core.mjs";
import { flood, stacksOf } from "../group-core.mjs";
import { GROUP_MAX, groupMode, waves } from "../motion-core.mjs";
import { drain } from "../narrow-core.mjs";

const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** lead.test.mjs's seeded generator. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The oracles planLead asks, on a grid world (as plug.test.mjs: the step is the world's own, walls only). */
function oraclesOf(g, extra = {}) {
  return {
    walkable: g.walkable, step: g.stepOpen,
    route: (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(c => dist(c, from) >= c.r) })?.points ?? null,
    ...extra,
  };
}
const mem = (id, x, y, w = 1) => ({ id, w, h: w, r: w / 2, start: { x, y } });
/** The plan's slots as "x,y" strings (a member that stays: "x,y stay:why"). */
const slotsOf = p => Object.fromEntries(Object.entries(p.members).map(([k, e]) => [k, `${e.slot.x},${e.slot.y}${e.stay ? ` stay:${e.stay}` : ""}`]));
/** A plan without its clock (ms) as plain JSON. */
const noClock = p => JSON.stringify({ ...p, ms: 0 });
const open = (W, H) => Array.from({ length: H }, (_, i) => (i === 0 || i === H - 1 ? "#".repeat(W) : `#${".".repeat(W - 2)}#`)).join("\n");

/** An 8x5 open room (walls on rows 0 and 6, columns 0 and 9). */
const ROOM = `
##########
#........#
#........#
#........#
#........#
#........#
##########`;
/** A hall (rows 1-2) over a room (`below` rows) joined by a one-wide door (row 3, column 5). */
const door = below => `
###########
#.........#
#.........#
#####.#####
${Array(below).fill("#.........#").join("\n")}
###########`;
const DOOR = door(4);
/** A hall (rows 1-2) over a one-wide shaft (column 5, rows 3-6). */
const TUN = `
###########
#.........#
#.........#
#####.#####
#####.#####
#####.#####
#####.#####
###########`;

/* ================================================================================================================== */
/*  motion-core: the decision table, GROUP_MAX, waves                                                                  */
/* ================================================================================================================== */

test("GROUP_MAX is 24", () => {
  assert.equal(GROUP_MAX, 24);
});

test("groupMode: the table in priority order, one row per reason", () => {
  const m = o => groupMode(o);
  assert.deepEqual(m({ members: 1 }), { mode: "core", reason: "single" });
  assert.deepEqual(m({ members: 0 }), { mode: "core", reason: "single" });
  assert.deepEqual(m({ members: 24 }), { mode: "plan", reason: null });
  assert.deepEqual(m({ members: 25 }), { mode: "core", reason: "tooMany" });
  // The setting wins before the count; a single member before both.
  assert.deepEqual(m({ members: 30, enabled: false }), { mode: "core", reason: "off" });
  assert.deepEqual(m({ members: 1, enabled: false }), { mode: "core", reason: "single" });
  assert.deepEqual(m({ members: 2, enabled: false }), { mode: "core", reason: "off" });
  assert.deepEqual(m({ members: 2, gridType: 2 }), { mode: "core", reason: "grid" });
  assert.deepEqual(m({ members: 30, gridType: 2 }), { mode: "core", reason: "tooMany" });
  // Then direct, planned, waypoints, each ahead of the ones below it.
  assert.deepEqual(m({ members: 2, direct: true, planned: true, waypoints: true, ghost: true }), { mode: "core", reason: "direct" });
  assert.deepEqual(m({ members: 2, planned: true, waypoints: true, ghost: true }), { mode: "core", reason: "planned" });
  assert.deepEqual(m({ members: 2, waypoints: true, ghost: true }), { mode: "core", reason: "waypoints" });
  assert.deepEqual(m({ members: 2, gridType: 2, direct: true }), { mode: "core", reason: "grid" });
  // Ghost and unconstrained: core's straight lines out of combat, core's own in a fight.
  assert.deepEqual(m({ members: 2, ghost: true }), { mode: "straight", reason: "ghost" });
  assert.deepEqual(m({ members: 2, ghost: true, combat: true }), { mode: "core", reason: "ghost" });
  assert.deepEqual(m({ members: 2, unconstrained: true }), { mode: "straight", reason: "unconstrained" });
  assert.deepEqual(m({ members: 2, unconstrained: true, combat: true }), { mode: "core", reason: "unconstrained" });
  assert.deepEqual(m({ members: 2, ghost: true, unconstrained: true }), { mode: "straight", reason: "ghost" }, "ghost names the reason first");
  // Pathfinding off (or any other value) comes after ghost and unconstrained.
  assert.deepEqual(m({ members: 2, pathfind: "off" }), { mode: "core", reason: "pathfind:off" });
  assert.deepEqual(m({ members: 2, pathfind: "off", ghost: true }), { mode: "straight", reason: "ghost" });
  assert.deepEqual(m({ members: 2, combat: true }), { mode: "plan", reason: null });
  assert.deepEqual(m({ members: 2 }), { mode: "plan", reason: null });
  assert.deepEqual(m(), { mode: "core", reason: "single" }, "no inputs: no members");
});

test("waves: ceil to 150 ms buckets in time order; a negative delay goes in bucket 0", () => {
  assert.deepEqual(waves({ a: 0, b: 1, c: 150, d: 151, e: -5, f: 300 }), [{ at: 0, ids: ["a", "e"] }, { at: 150, ids: ["b", "c"] }, { at: 300, ids: ["d", "f"] }]);
  assert.deepEqual(waves({}), []);
  assert.deepEqual(waves({ a: 90 }, 100), [{ at: 100, ids: ["a"] }], "the bucket is a parameter");
  assert.deepEqual(waves({ late: 450, soon: 10 }), [{ at: 150, ids: ["soon"] }, { at: 450, ids: ["late"] }], "sorted by time, not by insertion");
});

/* ================================================================================================================== */
/*  The constants                                                                                                     */
/* ================================================================================================================== */

test("LEAD and STAGGER: frozen, with these values", () => {
  assert.ok(Object.isFrozen(LEAD) && Object.isFrozen(STAGGER));
  assert.deepEqual({ ...LEAD }, { cells: 6, extra: 40, far: 6000, maxWalk: 40, rings: 8, tries: 2, totalMs: 1500, plug: 4, beside: 2.5 });
  assert.deepEqual({ ...STAGGER }, { capMs: 4000, stepMs: 150, deep: 0.5, longMs: 400, slack: 0.05, brush: 0.15 });
});

/* ================================================================================================================== */
/*  planLead: march and swarm                                                                                         */
/* ================================================================================================================== */

test("planLead march in the open room: the leader on the drop, the rest in a line behind it; three searches, none failed, no plug", () => {
  const g = gridWorld(ROOM);
  const p = planLead({ members: [mem("L", 1.5, 1.5), mem("A", 2.5, 1.5), mem("B", 1.5, 2.5)], leaderId: "L", drop: { x: 7.5, y: 3.5 } }, oraclesOf(g));
  assert.equal(p.shape, "march");
  assert.equal(p.leader, "L");
  assert.equal(p.target, null);
  assert.equal(p.none, false);
  assert.deepEqual(slotsOf(p), { L: "7.5,3.5", A: "6.5,3.5", B: "5.5,3.5" });
  assert.deepEqual(p.stayed, []);
  assert.equal(p.searches, 3);
  assert.equal(p.failed, 0);
  assert.equal(p.choke, null);
  assert.equal(p.blocker, null);
});

test("planLead swarm on a standing 1x1: the leader takes the first diagonal touch (its own side), the others the squares beside it", () => {
  const g = gridWorld(ROOM);
  const T = { id: "T", x: 6.5, y: 3.5, r: 0.5 };
  const p = planLead({ members: [mem("L", 1.5, 1.5), mem("A", 2.5, 1.5), mem("B", 1.5, 2.5)], leaderId: "L", target: { id: "T", x: 6.5, y: 3.5, w: 1, h: 1 }, standing: [T] }, oraclesOf(g));
  assert.equal(p.shape, "swarm");
  assert.equal(p.target, "T");
  assert.deepEqual(slotsOf(p), { L: "5.5,2.5", A: "5.5,3.5", B: "5.5,4.5" });
  assert.deepEqual(p.stayed, []);
  assert.equal(p.searches, 3);
  assert.deepEqual(p.order, ["L", "A", "B"]);
});

test("planLead swarm ring 1: 8 squares touch a Medium target, 12 a Large, 16 a Huge (the slot sets, with 24 members on open floor)", () => {
  const g = gridWorld(open(30, 20));
  const members = Array.from({ length: 24 }, (_, k) => mem(`m${k}`, 3.5 + (k % 6), 3.5 + Math.floor(k / 6)));
  const sets = {
    1: { c: { x: 15.5, y: 10.5 }, ring: ["14.5,10.5", "14.5,11.5", "14.5,9.5", "15.5,11.5", "15.5,9.5", "16.5,10.5", "16.5,11.5", "16.5,9.5"] },
    2: { c: { x: 16, y: 10 }, ring: ["14.5,10.5", "14.5,11.5", "14.5,8.5", "14.5,9.5", "15.5,11.5", "15.5,8.5", "16.5,11.5", "16.5,8.5", "17.5,10.5", "17.5,11.5", "17.5,8.5", "17.5,9.5"] },
    3: { c: { x: 16.5, y: 10.5 }, ring: ["14.5,10.5", "14.5,11.5", "14.5,12.5", "14.5,8.5", "14.5,9.5", "15.5,12.5", "15.5,8.5", "16.5,12.5", "16.5,8.5", "17.5,12.5", "17.5,8.5", "18.5,10.5", "18.5,11.5", "18.5,12.5", "18.5,8.5", "18.5,9.5"] },
  };
  for (const [w, { c, ring }] of Object.entries(sets)) {
    const n = +w;
    const p = planLead({ members, leaderId: "m0", target: { id: "T", ...c, w: n, h: n }, standing: [{ id: "T", ...c, r: n / 2 }] }, oraclesOf(g));
    assert.deepEqual(p.stayed, [], `${n}x${n}`);
    const touching = Object.values(p.members).map(e => e.slot)
      .filter(s => Math.abs(Math.max(Math.abs(s.x - c.x), Math.abs(s.y - c.y)) - (n / 2 + 0.5)) < EPS)
      .map(s => `${s.x},${s.y}`).sort();
    assert.deepEqual(touching, [...ring].sort(), `${n}x${n}: the ring-1 slot set`);
    assert.equal(touching.length, [8, 12, 16][n - 1]);
  }
});

/* ================================================================================================================== */
/*  The door plug                                                                                                     */
/* ================================================================================================================== */

/** Six in a row in the hall (L, A, B, C, D, E at x 1.5 .. 6.5), the leader dropped on (5.5, 5.5): two squares past the door. */
function plugSix(extra = {}) {
  const g = gridWorld(DOOR);
  const o = oraclesOf(g, extra);
  const members = "LABCDE".split("").map((id, k) => mem(id, 1.5 + k, 1.5));
  return { g, o, members, p: planLead({ members, leaderId: "L", drop: { x: 5.5, y: 5.5 } }, o) };
}

test("door plug: six dropped two squares past a one-wide door all come in, the leader's neighbours first; nobody ahead of it", () => {
  const { p } = plugSix();
  assert.deepEqual(slotsOf(p), { L: "5.5,5.5", D: "4.5,4.5", C: "7.5,4.5", E: "3.5,4.5", B: "4.5,5.5", A: "7.5,5.5" });
  assert.deepEqual(p.stayed, []);
  assert.deepEqual(p.order, ["L", "D", "C", "E", "B", "A"]);
  assert.equal(p.choke.inside.length, 9);
  assert.deepEqual(p.choke.inside, ["5,6", "4,5", "5,4", "4,4", "4,6", "5,7", "5,3", "4,3", "4,7"]);
  assert.deepEqual({ key: p.choke.key, x: p.choke.x, y: p.choke.y, past: p.choke.past }, { key: "c3,5", x: 5.5, y: 3.5, past: 1.6 });
  for (const id of "ABCDE") assert.ok(p.members[id].slot.y <= 5.5 + EPS, `${id} is not ahead of the leader (its last step is south)`);
});

test("staggerFile on the door plug plan: the pack three-quarters of a second behind, then a wave or two apart; every delay a wave multiple under the cap", () => {
  const { p, o } = plugSix();
  const walks = p.order.map(id => ({ id, r: 0.5, points: p.members[id].points, left: p.members[id].left }));
  const t = staggerFile(walks, { leaderId: "L", step: o.step });
  assert.deepEqual(t.delays, { L: 0, D: 750, C: 1050, E: 1500, B: 1800, A: 2100 });
  assert.deepEqual(t.order, ["L", "D", "C", "E", "B", "A"]);
  assert.equal(t.total, 2100);
  assert.equal(t.pack, 750);
  assert.deepEqual(t.crowded, []);
  for (const d of Object.values(t.delays)) { assert.equal(d % STAGGER.stepMs, 0); assert.ok(d <= STAGGER.capMs); }
});

test("plug window (D1): the leader dropped 4 squares past the door brings all 12, 5 past is no plug, 1 past stands in the way in (D4: nobody passes it)", () => {
  const g = gridWorld(door(7));
  const o = oraclesOf(g);
  const twelve = () => Array.from({ length: 12 }, (_, k) => mem(k === 0 ? "L" : `m${k}`, 1.5 + (k % 6), 1.5 + Math.floor(k / 6)));
  const at = past => planLead({ members: twelve(), leaderId: "L", drop: { x: 5.5, y: 3.5 + past } }, o);
  const insideOf = p => Object.values(p.members).filter(e => !e.stay && e.slot.y > 3.9).length;
  const four = at(4);
  assert.equal(four.choke.past, 3.6);
  assert.equal(insideOf(four), 12, "four past: all twelve in");
  assert.deepEqual(four.stayed, []);
  const five = at(5);
  assert.equal(five.choke, null, "five past: beyond LEAD.plug, no plug");
  assert.equal(insideOf(five), 12, "... the longer stream brings them all in anyway");
  const one = at(1);
  assert.equal(one.choke.past, 0.6);
  assert.equal(insideOf(one), 1, "one past: only the leader is in");
  assert.deepEqual(one.stayed, []);
  assert.deepEqual(slotsOf(one), {
    L: "5.5,4.5", m10: "5.5,3.5", m11: "5.5,2.5", m4: "5.5,1.5", m9: "4.5,2.5", m3: "4.5,1.5", m5: "6.5,2.5", m8: "3.5,2.5", m2: "3.5,1.5", m7: "2.5,2.5", m1: "2.5,1.5", m6: "1.5,2.5",
  });
  assert.deepEqual(one.members.m10.slot, { x: 5.5, y: 3.5 }, "the second one waits in the doorway behind the leader");
  const two = at(2), three = at(3);
  assert.deepEqual([insideOf(two), insideOf(three)], [10, 12]);
  assert.deepEqual([two.choke.past, three.choke.past], [1.6, 2.6]);
});

test("chokeOk refusing the narrow point: no plug and the line behind, byte-identical to o.plug 0", () => {
  const refused = plugSix({ chokeOk: () => false }).p;
  const off = plugSix({ plug: 0 }).p;
  assert.equal(refused.choke, null);
  assert.equal(off.choke, null);
  assert.equal(noClock(refused), noClock(off));
  assert.deepEqual(slotsOf(refused), { L: "5.5,5.5", D: "5.5,4.5", C: "5.5,3.5", E: "5.5,2.5", B: "4.5,2.5", A: "5.5,1.5" });
  assert.deepEqual(refused.order, ["L", "D", "C", "E", "B", "A"]);
});

test("tunnel with the leader at the back: it leads through its own group; the rest in a line behind it, no plug", () => {
  const g = gridWorld(TUN);
  const p = planLead({ members: [mem("L", 1.5, 1.5), mem("A", 2.5, 1.5), mem("B", 3.5, 1.5)], leaderId: "L", drop: { x: 5.5, y: 5.5 } }, oraclesOf(g));
  assert.deepEqual(slotsOf(p), { L: "5.5,5.5", B: "5.5,4.5", A: "5.5,3.5" });
  assert.deepEqual(p.stayed, []);
  assert.equal(p.choke, null);
  assert.deepEqual(p.lastStep, { x: 0, y: 1 }, "the leader's last step is south");
});

test("ODD: a 2x2 follower that cannot pass the one-wide door gets a slot on its own side and is NOT in stayed (movement.md says a Large that cannot follow stays, named)", () => {
  const g = gridWorld(door(7));
  const members = [mem("L", 1.5, 1.5), mem("G", 3, 2, 2)];
  const p = planLead({ members, leaderId: "L", drop: { x: 5.5, y: 6.5 } }, oraclesOf(g));
  assert.deepEqual(p.members.G.slot, { x: 5, y: 2 }, "a square in the hall");
  assert.equal(p.members.G.stay, undefined);
  assert.deepEqual(p.stayed, []);
  assert.deepEqual(p.members.G.points, [{ x: 3, y: 2 }, { x: 5, y: 2 }]);
  assert.equal(p.choke.inside.length, 12);
  assert.deepEqual(p.members.L.slot, { x: 5.5, y: 6.5 });
});

test("a 2x2 leader that does not fit the door: none, no blocker, both named, one search and it failed (the glue says 'No route there')", () => {
  const g = gridWorld(door(7));
  const members = [mem("G", 3, 2, 2), mem("A", 6.5, 1.5)];
  const p = planLead({ members, leaderId: "G", drop: { x: 5, y: 6 } }, oraclesOf(g));
  assert.equal(p.none, true);
  assert.equal(p.blocker, null);
  assert.deepEqual(p.stayed, ["G", "A"]);
  assert.equal(p.searches, 1);
  assert.equal(p.failed, 1);
  assert.deepEqual(slotsOf(p), { G: "3,2 stay:noRoute", A: "6.5,1.5 stay:noRoute" });
});

test("a leader whose rest square is held by a member that stays: none, the blocker is that member (the glue's tellBlockedBy notice)", () => {
  const g = gridWorld(`
################
#....##########
#..............#
#....##########
################`);
  const members = [mem("L", 2.5, 2.5), mem("X", 14.5, 2.5), mem("Y", 13.5, 2.5)];
  const p = planLead({ members, leaderId: "L", drop: { x: 14.5, y: 2.5 } }, oraclesOf(g, { cells: 0, extra: 1 }));
  assert.equal(p.none, true);
  assert.equal(p.blocker, "X");
  assert.deepEqual([...p.stayed].sort(), ["L", "X", "Y"]);
});

test("a member walled into a pocket with no reachable square: it stays, named, on its start; the others are slotted and routed", () => {
  const g = gridWorld(`
##########
#........#
#.####...#
#.#..#...#
#.####...#
#........#
##########`);
  const members = [mem("L", 1.5, 1.5), mem("A", 2.5, 1.5), mem("P", 3.5, 3.5), mem("B", 1.5, 2.5)];
  const p = planLead({ members, leaderId: "L", drop: { x: 7.5, y: 3.5 } }, oraclesOf(g));
  assert.deepEqual(p.stayed, ["P"]);
  assert.deepEqual(slotsOf(p), { L: "7.5,3.5", A: "6.5,2.5", B: "6.5,1.5", P: "3.5,3.5 stay:noRoute" });
  assert.deepEqual(p.members.P.points, [{ x: 3.5, y: 3.5 }]);
  for (const id of ["L", "A", "B"]) assert.ok(p.members[id].points.length >= 2 && dist(p.members[id].points.at(-1), p.members[id].slot) < 0.05, id);
  assert.equal(p.searches, 5);
  assert.equal(p.failed, 2);
});

test("24 members on open floor: nobody stays, no two rest closer than their radii, the file starts within the 4 s cap", () => {
  const g = gridWorld(open(30, 16));
  const o = oraclesOf(g);
  const members = Array.from({ length: 24 }, (_, k) => mem(k === 0 ? "L" : `m${k}`, 3.5 + (k % 6), 3.5 + Math.floor(k / 6)));
  const p = planLead({ members, leaderId: "L", drop: { x: 20.5, y: 8.5 } }, o);
  assert.deepEqual(p.stayed, []);
  assert.equal(p.shape, "march");
  assert.equal(p.searches, 24);
  assert.equal(p.failed, 0);
  const rest = members.map(m => ({ id: m.id, ...p.members[m.id].slot, r: m.r }));
  for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) assert.ok(dist(rest[a], rest[b]) >= rest[a].r + rest[b].r - EPS, `${rest[a].id} / ${rest[b].id} overlap at rest`);
  const walks = p.order.map(id => ({ id, r: 0.5, points: p.members[id].points, left: p.members[id].left }));
  const t = staggerFile(walks, { leaderId: "L", step: o.step });
  assert.equal(t.total, 2250);
  assert.ok(t.total <= STAGGER.capMs);
  assert.deepEqual(t.crowded, []);
  assert.equal(t.pack, 1200);
});

test("planLead with leaderAt (a fight's later turn): the leader is not planned or searched; the members rank behind `at` along from -> at", () => {
  const g = gridWorld(ROOM);
  const o = oraclesOf(g);
  const members = () => [mem("L", 7.5, 3.5), mem("A", 1.5, 1.5), mem("B", 2.5, 4.5)];
  const east = planLead({ members: members(), leaderId: "L", leaderAt: { at: { x: 7.5, y: 3.5 }, from: { x: 6.5, y: 3.5 } } }, o);
  assert.equal(east.members.L, undefined, "the leader has no entry: it is at rest already");
  assert.equal(east.searches, 2, "one search for each other member");
  assert.deepEqual(east.order, ["L", "B", "A"]);
  assert.deepEqual(slotsOf(east), { B: "6.5,3.5", A: "5.5,3.5" });
  assert.deepEqual(east.lastStep, { x: 1, y: 0 });
  assert.deepEqual(east.behind, { x: 6.5, y: 3.5 });
  assert.deepEqual(east.stayed, []);
  assert.equal(east.choke, null);
  const south = planLead({ members: members(), leaderId: "L", leaderAt: { at: { x: 7.5, y: 3.5 }, from: { x: 7.5, y: 2.5 } } }, o);
  assert.deepEqual(slotsOf(south), { B: "7.5,2.5", A: "6.5,2.5" }, "behind a step from the north: the north side");
  assert.deepEqual(south.lastStep, { x: 0, y: 1 });
  for (const id of ["A", "B"]) assert.ok(south.members[id].slot.y < 3.5, id);
});

test("planLeadSteps drained is planLead (JSON-equal) on 50 seeded floors; it yields one { lead } and a yield a member", () => {
  let led = 0;
  for (let seed = 1; seed <= 50; seed++) {
    const rand = rng(seed * 7919);
    const W = 16 + Math.floor(rand() * 8), H = 10 + Math.floor(rand() * 5);
    const rows = Array.from({ length: H }, (_, i) => Array.from({ length: W }, (_, j) => (i === 0 || j === 0 || i === H - 1 || j === W - 1 || rand() < 0.08 ? "#" : ".")).join(""));
    const col = 6 + Math.floor(rand() * (W - 12));
    if (rand() < 0.6) { const d = 1 + Math.floor(rand() * (H - 2)); for (let i = 1; i < H - 1; i++) rows[i] = rows[i].slice(0, col) + (i === d ? "." : "#") + rows[i].slice(col + 1); }
    const g = gridWorld(rows.join("\n"));
    const cells = [];
    rows.forEach((r, i) => [...r].forEach((ch, j) => { if (ch !== "#") cells.push({ x: j + 0.5, y: i + 0.5 }); }));
    const members = [];
    const taken = new Set();
    for (let k = 0, n = 2 + Math.floor(rand() * 6); k < n * 4 && members.length < n; k++) {
      const c = cells[Math.floor(rand() * cells.length)];
      if (taken.has(`${c.x},${c.y}`)) continue;
      taken.add(`${c.x},${c.y}`);
      members.push(mem(`m${members.length}`, c.x, c.y));
    }
    const drop = cells[Math.floor(rand() * cells.length)];
    if (members.length < 2 || taken.has(`${drop.x},${drop.y}`)) continue;
    const spec = { members, leaderId: "m0", drop };
    const whole = planLead(spec, oraclesOf(g));
    const steps = [];
    const gen = planLeadSteps(spec, oraclesOf(g));
    let r = gen.next();
    while (!r.done) { steps.push(r.value); r = gen.next(); }
    assert.equal(JSON.stringify(r.value), JSON.stringify(whole), `seed ${seed}`);
    assert.equal(JSON.stringify(drain(planLeadSteps(spec, oraclesOf(g)))), JSON.stringify(whole), `seed ${seed}: drain`);
    if (!whole.none) {
      led += 1;
      assert.equal(steps.filter(s => s?.lead).length, 1, `seed ${seed}: one { lead }`);
      assert.equal(steps.find(s => s?.lead).lead.id, "m0");
    }
  }
  assert.ok(led >= 25, `enough floors planned: ${led}`);
});

/* ================================================================================================================== */
/*  narrowZones, flood, stacksOf, walkFrom, footprintCells, routeEnters, heap                                          */
/* ================================================================================================================== */

/** The floor squares of `g` that are one-wide (their own narrowZones key at their centre). */
function narrowCells(g) {
  const z = narrowZones(g.stepOpen);
  const out = [];
  g.rows.forEach((r, i) => [...r].forEach((ch, j) => { if (ch !== "#" && z({ x: j + 0.5, y: i + 0.5 }).some(q => q.key === `c${i},${j}`)) out.push(`${i},${j}`); }));
  return out;
}

test("narrowZones: the door square on DOOR, every shaft square on TUN, none in an open ROOM", () => {
  assert.deepEqual(narrowCells(gridWorld(DOOR)), ["3,5"]);
  assert.deepEqual(narrowCells(gridWorld(TUN)), ["3,5", "4,5", "5,5", "6,5"]);
  assert.deepEqual(narrowCells(gridWorld(ROOM)), []);
  const z = narrowZones(gridWorld(DOOR).stepOpen);
  assert.deepEqual(z({ x: 5.5, y: 3.5 }), [{ key: "c3,5", x: 5.5, y: 3.5 }]);
  assert.deepEqual(z({ x: 3.5, y: 5.5 }), []);
});

test("narrowZones: a step that throws is a closed step, so every square is one-wide", () => {
  const z = narrowZones(() => { throw new Error("no"); });
  assert.deepEqual(z({ x: 2.5, y: 2.5 }), [{ key: "c2,2", x: 2.5, y: 2.5 }]);
});

test("flood from the origin over open ground out to 1.5: nine squares, the origin 0, four orthogonal at 1, four diagonal at sqrt 2 (insertion order)", () => {
  const f = flood({ i: 0, j: 0 }, () => true, 1.5);
  assert.deepEqual([...f.entries()], [["0,0", 0], ["0,1", 1], ["1,0", 1], ["0,-1", 1], ["-1,0", 1], ["1,1", Math.SQRT2], ["1,-1", Math.SQRT2], ["-1,1", Math.SQRT2], ["-1,-1", Math.SQRT2]]);
  assert.equal(f.size, 9);
});

test("stacksOf: a rider on its mount (the mount leads, the rider at its own offset), equal sizes with `prefer`, singletons left out", () => {
  assert.deepEqual(stacksOf([{ id: "m", c: { x: 1, y: 1 }, r: 1, size: 2 }, { id: "r", c: { x: 1, y: 1 }, r: 0.5 }, { id: "x", c: { x: 5, y: 5 }, r: 0.5 }]),
    [{ leader: "m", riders: [{ id: "r", dx: 0, dy: 0 }] }]);
  const eq = [{ id: "a", c: { x: 0, y: 0 }, r: 0.5 }, { id: "b", c: { x: 0.1, y: 0 }, r: 0.5 }];
  const preferB = stacksOf(eq, { prefer: "b" });
  assert.equal(preferB.length, 1);
  assert.equal(preferB[0].leader, "b");
  assert.equal(preferB[0].riders.length, 1);
  assert.equal(preferB[0].riders[0].id, "a");
  assert.ok(Math.abs(preferB[0].riders[0].dx - -0.1) < EPS && preferB[0].riders[0].dy === 0);
  assert.equal(stacksOf(eq)[0].leader, "a", "no prefer: list order");
  assert.deepEqual(stacksOf([{ id: "p", c: { x: 0, y: 0 }, r: 0.5 }, { id: "q", c: { x: 3, y: 0 }, r: 0.5 }]), [], "apart: no stack");
});

test("walkFrom: `until` stops once the keys are settled, in settling order; maxCells and maxWalk bound it; hops count steps", () => {
  const g = gridWorld(open(22, 9));
  const step = (a, b) => g.free(b.i, b.j);
  const full = walkFrom([{ i: 4, j: 10 }], step, {});
  assert.equal(full.size, 140);
  const stopped = walkFrom([{ i: 4, j: 10 }], step, { until: ["4,12"] });
  assert.equal(stopped.size, 10);
  assert.equal([...stopped.keys()].at(-1), "4,12");
  assert.equal(stopped.get("4,12"), 2);
  assert.deepEqual([...stopped], [...full].slice(0, 10), "the settled prefix of the full walk");
  assert.deepEqual([...walkFrom([{ i: 4, j: 10 }], step, { maxCells: 5 })], [["4,10", 0], ["4,11", 1], ["5,10", 1], ["3,10", 1], ["4,9", 1]]);
  assert.deepEqual([...walkFrom([{ i: 4, j: 10 }, { i: 4, j: 11 }], step, { maxWalk: 1 })].map(([k, d]) => `${k}:${d}`),
    ["4,10:0", "4,11:0", "3,10:1", "3,11:1", "5,11:1", "4,12:1", "4,9:1", "5,10:1"]);
  assert.equal(walkFrom([{ i: 4, j: 10 }], step, { hops: true, maxWalk: 2 }).get("2,12"), 2);
});

test("footprintCells: a 2x2 at (3, 2) covers rows 1-2, columns 2-3; a 1x1 its own square; a 3x3 nine; under one square the nearest", () => {
  assert.deepEqual(footprintCells({ x: 3, y: 2 }, 2, 2), [{ i: 1, j: 2 }, { i: 1, j: 3 }, { i: 2, j: 2 }, { i: 2, j: 3 }]);
  assert.deepEqual(footprintCells({ x: 3.5, y: 2.5 }), [{ i: 2, j: 3 }]);
  assert.equal(footprintCells({ x: 3.5, y: 2.5 }, 3, 3).length, 9);
  assert.deepEqual(footprintCells({ x: 2.5, y: 2.5 }, 0.5), [{ i: 2, j: 2 }]);
});

test("routeEnters: a circle the route starts inside is one it is leaving; another on the way is the first hit; slack and degenerate inputs", () => {
  const pts = [{ x: 0, y: 0 }, { x: 5, y: 0 }];
  assert.equal(routeEnters(pts, 0.5, [{ x: 0.2, y: 0, r: 0.5 }]), null, "starts inside: leaving it");
  const hit = routeEnters(pts, 0.5, [{ x: 3, y: 0.3, r: 0.5 }]);
  assert.equal(hit.k, 0);
  assert.ok(Math.abs(hit.t - 0.4134097494507283) < 1e-9);
  assert.ok(Math.abs(hit.at.x - 2.0670487472536414) < 1e-9 && hit.at.y === 0);
  assert.deepEqual(routeEnters(pts, 0.5, [{ x: 0.2, y: 0, r: 0.5 }, { x: 3, y: 0.3, r: 0.5 }]), hit, "the one it leaves does not hide the one it enters");
  assert.equal(routeEnters(pts, 0.5, [{ x: 3, y: 2, r: 0.5 }]), null, "a circle clear of the route");
  const looser = routeEnters(pts, 0.5, [{ x: 3, y: 0.3, r: 0.5 }], 0.5);
  assert.ok(Math.abs(looser.t - 0.5200002500001405) < 1e-9, "a bigger slack shrinks the circle: the route enters it later");
  assert.equal(routeEnters([{ x: 0, y: 0 }], 0.5, [{ x: 3, y: 0.3, r: 0.5 }]), null, "one point is no route");
  assert.equal(routeEnters(pts, 0.5, []), null);
  assert.equal(routeEnters(null, 0.5, [{ x: 3, y: 0, r: 1 }]), null);
});

test("heap: smallest first (the tie order is the heap's own), size counts what is in", () => {
  const h = heap();
  for (const [d, k] of [[3, "c"], [1, "a"], [2, "b"], [1, "a2"], [0.5, "z"]]) h.push(d, k);
  assert.equal(h.size, 5);
  const out = [];
  while (h.size) out.push(h.pop());
  assert.deepEqual(out, [[0.5, "z"], [1, "a2"], [1, "a"], [2, "b"], [3, "c"]]);
});

/* ================================================================================================================== */
/*  The board: file.mjs (targetOf, fightPlan, slotAtTurn, planDrop) and api.mjs (planGroup)                            */
/* ================================================================================================================== */

const S = 100;
const F = await movementWorld();
const Token5e = F.CONFIG.Token.objectClass;
/** A wall across y = 400 with a one-square door at x 400-500 (drop.test.mjs's board). */
const walls = [[{ x: 0, y: 400 }, { x: 400, y: 400 }], [{ x: 500, y: 400 }, { x: 1000, y: 400 }]];
function hit(p, q, a, b) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const inside = r => Math.min(a.x, b.x) < r.x && r.x < Math.max(a.x, b.x) || Math.min(a.y, b.y) < r.y && r.y < Math.max(a.y, b.y);
  if (Math.abs(d2) < 1e-9 && Math.abs(d1) > 1e-9 && inside(q)) return true;
  const through = (r, u, v) => Math.min(u.x, v.x) - 1e-9 <= r.x && r.x <= Math.max(u.x, v.x) + 1e-9 && Math.min(u.y, v.y) - 1e-9 <= r.y && r.y <= Math.max(u.y, v.y) + 1e-9
    && Math.hypot(r.x - u.x, r.y - u.y) > 1e-9 && Math.hypot(r.x - v.x, r.y - v.y) > 1e-9;
  if (Math.abs(d3) < 1e-9 && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9 && through(a, p, q)) return true;
  if (Math.abs(d4) < 1e-9 && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9 && through(b, p, q)) return true;
  return false;
}
const crossing = (o, d) => walls.some(([a, b]) => hit(o, d, a, b));
const centreOf = w => ({ x: w.x + (w.width ?? 1) * S / 2, y: w.y + (w.height ?? 1) * S / 2, elevation: 0 });
const cellOf = p => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) });
Token5e.prototype.findMovementPath = function (waypoints, options = {}) {
  const out = [{ ...waypoints[0] }];
  for (let k = 1; k < waypoints.length; k++) {
    if (!options.constrainOptions?.ignoreWalls && crossing(centreOf(waypoints[k - 1]), centreOf(waypoints[k]))) break;
    out.push({ ...waypoints[k] });
  }
  return { result: out, promise: Promise.resolve(out), cancel: () => {} };
};
Token5e.prototype.checkCollision = function (dest, { origin, mode = "any" } = {}) {
  const blocked = crossing(origin, dest);
  return mode === "any" ? blocked : blocked ? { x: dest.x, y: dest.y } : null;
};
Token5e.prototype.measureMovementPath = function (wps) {
  let cost = 0;
  for (let k = 1; k < wps.length; k++) {
    const a = cellOf(centreOf(wps[k - 1])), b = cellOf(centreOf(wps[k]));
    cost += Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 5;
  }
  return { cost, distance: cost };
};
Token5e.prototype.createTerrainMovementPath = wps => wps;
Token5e.prototype.can = function () { return true; };
Token5e.prototype.stopAnimation = function () {};

const grid = { size: S, distance: 5, type: 1, getOffset: p => cellOf(p) };
const sceneTokens = new Map();
Object.assign(F.canvas, {
  grid,
  dimensions: { rect: { x: 0, y: 0, width: 1000, height: 1000, contains: (x, y) => x >= 0 && y >= 0 && x <= 1000 && y <= 1000 } },
  visibility: { tokenVision: false },
});
Object.assign(F.canvas.scene, {
  tokens: sceneTokens,
  async updateEmbeddedDocuments(type, updates, options) { F.calls.push({ op: "scene.update", type, ids: updates.map(u => u._id), options }); return updates; },
});
F.CONFIG.Token.movement = { actions: { walk: { walls: "move" }, displace: { walls: null } }, defaultSpeed: 6 };
F.foundry.documents.TokenDocument ??= { arePositionsEqual: (a, b) => a.x === b.x && a.y === b.y };
F.game.activeTool = "select";
const layer = { _draggedToken: null, _movementPlanningContext: null };
const sceneDoc = {
  id: SCENE, grid, regions: [], tokens: sceneTokens,
  updateEmbeddedDocuments: (...a) => F.canvas.scene.updateEmbeddedDocuments(...a),
  async moveTokens(instructions, options) { F.calls.push({ op: "moveTokens", ids: Object.keys(instructions), options }); return {}; },
  get walls() { return walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 })); },
};
function makeToken(id, x, y, { size = 1 } = {}) {
  const t = Object.create(Token5e.prototype);
  t.layer = layer;
  t.movementAnimationName = `Token.${id}.animateMovement`;
  t.animationContexts = new Map();
  t.visible = true;
  t.document = {
    documentName: "Token", id, uuid: `Scene.${SCENE}.Token.${id}`, name: id, movementAction: "walk", isOwner: true, hidden: false,
    parent: sceneDoc,
    _source: { x, y, elevation: 0, width: size, height: size, level: "L" },
    x, y, elevation: 0,
    movement: { state: "completed", user: { isSelf: true } },
    object: t,
    getMovementOrigin: w => centreOf(w),
    getOccupiedGridSpaceOffsets: () => [],
    getCompleteMovementPath: w => w,
    _shouldRecordMovementHistory: () => false,
    testUserPermission: () => true,
    stopMovement() { F.calls.push({ op: "stopMovement", id }); return true; },
    async move(waypoints, options) { F.calls.push({ op: "move", id, waypoints, options }); return true; },
  };
  sceneTokens.set(id, t.document);
  return t;
}

// movement.mjs keeps its ctx to itself, so the accessors file.mjs exposes (fightPlan, slotAtTurn, planDrop(Steps)) are
// taken as they are handed to ctx.expose (an Object.assign onto ctx.exposed).
let exposed = null;
const assign = Object.assign;
Object.assign = function (target, ...sources) {
  if (sources[0] && typeof sources[0] === "object" && "groupFightPlan" in sources[0]) exposed = target;
  return assign.apply(this, [target, ...sources]);
};
await import("../movement.mjs");
Object.assign = assign;
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;

/** Run `fn` with exactly `ts` on the scene and the canvas, and put the board back. */
function onBoard(ts, fn) {
  const kept = new Map(sceneTokens);
  const saved = F.canvas.tokens.placeables;
  sceneTokens.clear();
  for (const t of ts) sceneTokens.set(t.document.id, t.document);
  F.canvas.tokens.placeables = [...ts];
  try { return fn(); } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.clear();
    for (const [k, v] of kept) sceneTokens.set(k, v);
  }
}
/** Drag contexts for tokens moved by (dx, dy), as dryRun builds them. */
const contextsOf = (tokens, dx, dy) => tokens.map(t => {
  const src = t.document._source;
  return { token: t, destination: { ...src, x: src.x + dx, y: src.y + dy, snapped: true, explicit: true, checkpoint: true }, foundPath: [], waypoints: [] };
});
const writesOf = from => F.calls.slice(from).filter(c => ["scene.update", "moveTokens", "move", "stopMovement"].includes(c.op));

test("the board is wired: the accessors file.mjs exposes are in hand, the API is published", () => {
  for (const k of ["groupFightPlan", "groupSlotAtTurn", "groupPlan", "groupPlanSteps", "groupDryRun"]) assert.equal(typeof exposed[k], "function", k);
  assert.equal(exposed.groupMax(), 24);
  assert.equal(typeof api.planGroup, "function");
});

test("api planGroup on the board (a march): the shape, leader, target, plug and each member's slot / route / waypoints / stay / delay; nothing is written or moved", () => {
  const ts = [makeToken("pinAAAAAAAAAAAA1", 400, 200), makeToken("pinBBBBBBBBBBBB1", 300, 200), makeToken("pinCCCCCCCCCCCC1", 500, 200)];
  const [A, B, C] = ts.map(t => t.document.id);
  onBoard(ts, () => {
    const from = F.calls.length;
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 700 });
    assert.deepEqual(writesOf(from), [], "a dry run writes and moves nothing");
    assert.deepEqual(Object.keys(r).sort(), ["failed", "leader", "members", "ms", "ok", "order", "pack", "plug", "result", "searches", "shape", "starts", "target", "total"]);
    assert.deepEqual([r.ok, r.result, r.shape, r.leader, r.target], [true, "plan", "march", A, null]);
    assert.equal(typeof r.ms, "number");
    assert.deepEqual([r.searches, r.failed], [3, 0]);
    assert.deepEqual(r.order, [A, B, C]);
    assert.deepEqual(r.starts, [A, B, C]);
    assert.deepEqual([r.total, r.pack], [600, 150]);
    assert.deepEqual(r.plug, { x: 450, y: 400, past: 3.1, inside: 12 }, "a leader three squares past the door opens the plug");
    for (const m of r.members) assert.deepEqual(Object.keys(m).sort(), ["delay", "id", "name", "route", "slot", "stay", "waypoints"]);
    assert.deepEqual(r.members.map(m => [m.id, m.slot, m.delay, m.stay, m.waypoints]), [
      [A, { x: 400, y: 700 }, 0, null, 1],
      [B, { x: 400, y: 600 }, 300, null, 4],
      [C, { x: 400, y: 500 }, 600, null, 4],
    ]);
    assert.deepEqual(r.members[0].route, [{ x: 400, y: 700 }], "the leader goes straight through the door");
    assert.deepEqual(r.members[1].route, [{ x: 354, y: 271 }, { x: 388, y: 353 }, { x: 400, y: 441 }, { x: 400, y: 600 }]);
    assert.deepEqual(r.members[2].route, [{ x: 435, y: 265 }, { x: 409, y: 304 }, { x: 400, y: 350 }, { x: 400, y: 500 }]);
    for (const m of r.members) { assert.equal(m.name, m.id); assert.equal(m.waypoints, m.route.length); assert.deepEqual(m.route.at(-1), m.slot); }
  });
});

test("api planGroup: a bad point, an undrawn canvas and a token that is not drawn answer with a code", () => {
  const ts = [makeToken("pinDDDDDDDDDDDD1", 400, 200), makeToken("pinEEEEEEEEEEEE1", 300, 200)];
  onBoard(ts, () => {
    assert.equal(api.planGroup(ts.map(t => t.document), { x: "x" }).code, "BAD_ARGS");
    assert.equal(api.planGroup(ts.map(t => t.document), null).code, "BAD_ARGS");
    F.canvas.ready = false;
    try { assert.equal(api.planGroup(ts.map(t => t.document), { x: 400, y: 600 }).code, "NO_CANVAS"); } finally { F.canvas.ready = true; }
    ts[1].document.object = null;
    assert.equal(api.planGroup(ts.map(t => t.document), { x: 400, y: 600 }).code, "NOT_FOUND");
    ts[1].document.object = ts[1];
  });
});

test("targetOf (through planGroup): dropped on a visible token outside the group a swarm; on a hidden one (also for the GM) or on a member of the group a march", () => {
  const A = makeToken("pinFFFFFFFFFFFF1", 400, 200), B = makeToken("pinGGGGGGGGGGGG1", 300, 200), T = makeToken("pinTTTTTTTTTTTT1", 700, 600);
  onBoard([A, B, T], () => {
    const refs = [A.document, B.document];
    const swarm = api.planGroup(refs, { x: 700, y: 600 });
    assert.deepEqual([swarm.shape, swarm.target, swarm.leader], ["swarm", "pinTTTTTTTTTTTT1", "pinFFFFFFFFFFFF1"]);
    assert.deepEqual(swarm.members.map(m => m.slot), [{ x: 600, y: 500 }, { x: 600, y: 600 }], "round the target, each from its own side");
    assert.equal(swarm.plug, null);
    // A hidden token is never a target; the leader is dropped on its square and the march goes on.
    T.document.hidden = true;
    const hidden = api.planGroup(refs, { x: 700, y: 600 });
    assert.deepEqual([hidden.shape, hidden.target], ["march", null]);
    // ... also for the GM.
    game.user.isGM = true;
    try {
      const gm = api.planGroup(refs, { x: 700, y: 600 });
      assert.deepEqual([gm.shape, gm.target], ["march", null]);
    } finally { game.user.isGM = false; }
    T.document.hidden = false;
    // A member of the group is not a target (the leader dropped on a mate).
    const onMate = api.planGroup(refs, { x: 300, y: 200 });
    assert.deepEqual([onMate.shape, onMate.target], ["march", null]);
    // Not visible to this client: not a target.
    T.visible = false;
    assert.equal(api.planGroup(refs, { x: 700, y: 600 }).shape, "march");
    T.visible = true;
    // Another level: not a target.
    T.document._source.level = "M";
    assert.equal(api.planGroup(refs, { x: 700, y: 600 }).shape, "march");
    T.document._source.level = "L";
    assert.equal(api.planGroup(refs, { x: 700, y: 600 }).shape, "swarm");
  });
});

test("the door plug on the board: six dropped two squares past the door; planGroup names it (its centre in pixels, the walk past it, the squares inside)", () => {
  const ts = [[400, 300], [300, 300], [500, 300], [300, 200], [400, 200], [500, 200]].map(([x, y], k) => makeToken(`pinP${k}PPPPPPPPPPP1`.slice(0, 16), x, y));
  onBoard(ts, () => {
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 500 });
    assert.deepEqual([r.ok, r.result, r.shape], [true, "plan", "march"]);
    assert.deepEqual(r.plug, { x: 450, y: 400, past: 1.1, inside: 9 });
    assert.equal(r.members.filter(m => !m.stay && m.slot.y >= 400).length, 6, "all six inside");
    for (const m of r.members) assert.ok(m.slot.y <= 500, `${m.id} is not ahead of the leader`);
  });
});

test("fightPlan (no route oracle): the shape, target, leader and the order only (the leader, then least walk left); nothing is searched", () => {
  const ts = [makeToken("pinHHHHHHHHHHHH1", 400, 200), makeToken("pinIIIIIIIIIIII1", 300, 200), makeToken("pinJJJJJJJJJJJJ1", 500, 100)];
  onBoard(ts, () => {
    const ctxs = contextsOf(ts, 0, 400);
    const asked = [];
    const sliced = exposed.pathfindRouteSliced, to = exposed.pathfindRouteTo;
    exposed.pathfindRouteSliced = (...a) => { asked.push("sliced"); return sliced?.(...a); };
    exposed.pathfindRouteTo = (...a) => { asked.push("to"); return to?.(...a); };
    try {
      const plan = exposed.groupFightPlan(ts[0], ctxs, { constrain: {}, group: [] });
      assert.deepEqual(Object.keys(plan).sort(), ["leader", "order", "shape", "target"]);
      assert.deepEqual([plan.shape, plan.target, plan.leader], ["march", null, "pinHHHHHHHHHHHH1"]);
      assert.deepEqual(plan.order, ["pinHHHHHHHHHHHH1", "pinIIIIIIIIIIII1", "pinJJJJJJJJJJJJ1"]);
      assert.deepEqual(asked, [], "no route is asked");
    } finally { exposed.pathfindRouteSliced = sliced; exposed.pathfindRouteTo = to; }
    assert.equal(exposed.groupFightPlan(null, ctxs), null);
    assert.equal(exposed.groupFightPlan(ts[0], []), null);
  });
});

test("slotAtTurn: the second member's square after the leader rested: behind it, not on a token standing at its turn", () => {
  const L = makeToken("pinKKKKKKKKKKKK1", 400, 600), M = makeToken("pinLLLLLLLLLLLL1", 300, 200), X = makeToken("pinXXXXXXXXXXXX1", 400, 500);
  onBoard([L, M, X], () => {
    const leaderAt = { at: { x: 400, y: 600 }, from: { x: 400, y: 500 } };
    const behind = exposed.groupSlotAtTurn(M, { shape: "march", leaderId: "pinKKKKKKKKKKKK1", leaderAt });
    assert.deepEqual(behind, { x: 500, y: 500 }, "a square behind the leader (north of it), clear of X");
    assert.ok(behind.y < 600);
    assert.notDeepEqual(behind, { x: 400, y: 500 }, "not the token standing there");
    assert.equal(exposed.groupSlotAtTurn(M, { shape: "march", leaderId: "nobody", leaderAt }), null);
    assert.equal(exposed.groupSlotAtTurn(M, { shape: "march", leaderId: "pinKKKKKKKKKKKK1" }), null);
    assert.equal(exposed.groupSlotAtTurn(null, {}), null);
  });
});

test("planDropSteps with a moving clock yields at least once and ends with the same plan as planDrop", () => {
  const ts = [makeToken("pinMMMMMMMMMMMM1", 400, 200), makeToken("pinNNNNNNNNNNNN1", 300, 200), makeToken("pinOOOOOOOOOOOO1", 500, 200)];
  onBoard(ts, () => {
    const ctxs = contextsOf(ts, 0, 500);
    const whole = exposed.groupPlan(ts[0], ctxs, {});
    let t = 0;
    const gen = exposed.groupPlanSteps(ts[0], ctxs, { clock: () => (t += 0.5) });
    let yields = 0, led = 0, r = gen.next();
    while (!r.done) { yields += 1; if (r.value?.lead) led += 1; r = gen.next(); }
    assert.ok(yields >= 1, `yielded ${yields}`);
    assert.equal(led, 1, "one { lead }");
    const strip = o => JSON.parse(JSON.stringify({ shape: o.plan.shape, leader: o.plan.leader, order: o.plan.order, stayed: o.plan.stayed, searches: o.plan.searches, failed: o.plan.failed,
      members: o.plan.members, delays: o.timing.delays, total: o.timing.total, pack: o.timing.pack, starts: o.timing.order }));
    assert.deepEqual(strip(r.value), strip(whole));
    assert.equal(exposed.groupPlan(null, ctxs), null);
    assert.equal(exposed.groupPlan(ts[0], []), null);
  });
});
