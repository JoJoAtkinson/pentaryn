// Stage 1, round 1 (0.5.1): the live S1R1 defects, on the hard-case dungeon (ZZ H Dungeon: rooms A and B joined by a
// one-wide corridor on row 5, the maze, room D; the secret door shut). Squares, centres; routes on whole-square lattices
// as pathfind-adapter's fieldFor anchors them (gridLattice).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, freePrefix, settle, onCell, detourTooLong } from "../group-core.mjs";
import { trajectory, delayed, positionAt, dist } from "../motion-core.mjs";

const DUNGEON = `
########################################
#..........##..........##..............#
#..........##..........##..............#
#..........##..........##..............#
#..........##..........##..............#
#......................................#
#..........##..........................#
#..........##..........##..............#
#..........##..........##..............#
#..........##..........................#
#..........##..........##..............#
##.###############.############.########
##.##############...###########.########
##.............##...###########.########
##.#####.#####.##...###########.########
##.#####.#####.################.########
##.##...#......################.########
##.##.#########################.########
##.##.####################............##
#..........###############............##
#..........###############............##
#..........###############............##
#..........###############............##
#..........###############............##
#..........###############............##
#..........###############............##
#.....................................##
#..........###############............##
#..........#############################
########################################`;

const at = (col, row, w = 1) => ({ x: col + w / 2, y: row + w / 2 });
function plan(group, anchorId, drop, standing, { combat = false, route = null } = {}) {
  const g = gridWorld(DUNGEON, { gridLattice: true, pull: !combat });
  const a = group.find(m => m[0] === anchorId);
  const delta = { x: drop[0] - a[1], y: drop[1] - a[2] };
  const ms = group.map(([id, col, row, w = 1]) => member(id, at(col, row, w), delta, { w }));
  const others = standing.map(([id, col, row, w = 1]) => ({ id, ...(w < 1 ? { x: col + 0.5, y: row + 0.5 } : at(col, row, w)), r: w / 2 }));
  const anchor = ms.find(m => m.id === anchorId);
  const o = { walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: route ? route(g) : g.route,
    toward: (m, f, t) => g.route(m, f, t), narrow: g.narrow, cramped: g.cramped, now: () => 0 };
  return { res: finish(planGroup({ members: ms, anchorId, combat, others }, o)), ms, others, g };
}
const CROWD = [["H5", 13, 3], ["H6", 13, 4], ["H7", 14, 4], ["H8", 13, 6], ["Tiny", 14, 6, 0.5]];

/** Nobody's walk, wait or rest comes inside a standing token's circle, at any sampled time. */
function clearOfStanding(res, ms, others) {
  for (const e of Object.values(res.members)) {
    const m = ms.find(x => x.id === e.id);
    const tr = delayed(trajectory(e.points), e.delay);
    for (let t = 0; t <= tr.end + 100; t += 10) {
      const p = positionAt(tr, t);
      for (const o of others) assert.ok(dist(p, o) >= m.r + o.r - 1e-6, `${e.id} meets ${o.id} at ${t} ms`);
    }
  }
}

test("S1R1-01: with the crowd in room B, a member starting behind another in A queues for the A-B door; nobody walks round the dungeon", () => {
  for (const group of [[["H1", 1, 8], ["H2", 2, 9], ["H3", 1, 10], ["H4", 3, 10]], [["H1", 1, 8], ["H2", 2, 9], ["H3", 1, 10]]]) {
    const { res, ms, others, g } = plan(group, "H1", [14, 5], CROWD);
    assert.equal(res.result, "plan");
    for (const e of Object.values(res.members)) {
      const m = ms.find(x => x.id === e.id);
      const direct = g.route(m, m.start, e.slot)?.length ?? Infinity;          // walls only
      assert.ok(!detourTooLong(direct, e.length), `${e.id}: ${e.length.toFixed(1)} squares for a ${direct.toFixed(1)}-square way (${group.length} members)`);
      assert.ok(e.length < 25, `${e.id} walks ${e.length.toFixed(1)} squares`);
      assert.equal(e.short, false, `${e.id} gets there`);
    }
    clearOfStanding(res, ms, others);
  }
});

test("S1R1-03: in a fight, the grabbed one and the member beside it wait for those in front and then go, round the others' spots (a re-plan in a fight too)", () => {
  // The live routes (top-left px) the pathfinder gave on ZZ H Dungeon with Hero 7 at (14,5) and Hero 8 at (10,4).
  const P = {
    H1: [[800, 300], [900, 500], [1300, 500], [1300, 600], [1500, 600], [1500, 500]],
    H2: [[800, 500], [1300, 500], [1300, 400], [1600, 400]],
    H3: [[800, 700], [1000, 500], [1300, 500], [1300, 600], [1600, 600]],
    H4: [[900, 400], [900, 500], [1300, 500], [1300, 600], [1400, 600]],
    H5: [[900, 600], [1000, 500], [1300, 500], [1300, 400], [1600, 400], [1700, 500]],
    H6: [[700, 500], [1300, 500], [1300, 400], [1400, 400]],
  };
  const R = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, v.map(([x, y]) => ({ x: x / 100 + 0.5, y: y / 100 + 0.5 }))]));
  const len = pts => pts.slice(1).reduce((s, p, k) => s + dist(p, pts[k]), 0);
  const route = g => (m, from, to, opts) => {
    const r = R[m.id];
    if (dist(r.at(-1), to) < 1e-6 && dist(r[0], from) < 1e-6 && (opts?.avoid?.length ?? 0) <= 2) return { points: r, length: len(r) };
    return g.route(m, from, to, opts);
  };
  const group = [["H1", 8, 3], ["H2", 8, 5], ["H3", 8, 7], ["H4", 9, 4], ["H5", 9, 6], ["H6", 7, 5]];
  const { res, ms, others } = plan(group, "H1", [15, 5], [["H7", 14, 5], ["H8", 10, 4]], { combat: true, route });
  assert.equal(res.result, "plan");
  assert.deepEqual(res.stayed, [], `nobody stays: ${JSON.stringify(res.stayed)}`);
  assert.equal(res.anchorShort, false, "no \"No route there\"");
  assert.deepEqual(res.members.H1.slot, at(15, 5), "the grabbed one lands where it was dropped");
  for (const e of Object.values(res.members)) {
    assert.equal(e.short, false, `${e.id} gets there`);
    for (const p of e.points) assert.ok(onCell(p), `${e.id} on whole squares: ${JSON.stringify(p)}`);
  }
  clearOfStanding(res, ms, others);
  // Members never meet each other either.
  const list = Object.values(res.members);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const A = delayed(trajectory(list[i].points), list[i].delay), B = delayed(trajectory(list[j].points), list[j].delay);
    const d0 = dist(positionAt(A, 0), positionAt(B, 0));
    for (let t = 0; t <= Math.max(A.end, B.end) + 50; t += 10) {
      const d = dist(positionAt(A, t), positionAt(B, t));
      assert.ok(d >= Math.min(1, d0) - 0.15 - 1e-6, `${list[i].id}/${list[j].id} ${d.toFixed(3)} apart at ${t} ms`);
    }
  }
});

test("S1R1-02: a member cut short before a token standing at a corridor's mouth never rests in the corridor (back to open floor, or where it stands)", () => {
  const g = gridWorld(DUNGEON, { gridLattice: true });
  // From room A along row 5 through the corridor (x 11-13) into B; a token stands just past its mouth.
  const pts = [{ x: 7.5, y: 4.5 }, { x: 10.5, y: 5.5 }, { x: 13.5, y: 5.5 }, { x: 16.5, y: 5.5 }];
  const stand = [{ x: 14.2, y: 5.5, r: 0.5 }];
  const plain = freePrefix(pts, 0.5, stand);
  assert.ok(g.cramped(plain.points.at(-1), 0.5), "without the guard it stops with half its body in the corridor's mouth");
  const p = freePrefix(pts, 0.5, stand, { restOk: (c, r) => !g.cramped(c, r) });
  assert.equal(p.full, false);
  const end = p.points.at(-1);
  assert.ok(!g.cramped(end, 0.5), `not in the corridor: ${JSON.stringify(end)}`);
  assert.ok(end.x <= 10.5 + 1e-6, `back in room A: ${JSON.stringify(end)}`);
  // settle() too: cut back from a walker it would meet, never to a rest in the corridor.
  const list = [{ id: "m", r: 0.5, points: pts, delay: 0 }];
  const walkers = [{ id: "w", r: 0.5, points: [{ x: 16.5, y: 5.5 }, { x: 13.6, y: 5.5 }] }];
  const out = finish(settle(list, { walkers, restOk: (c, r) => !g.cramped(c, r) }));
  const e = out.get("m");
  assert.ok(e.changed);
  assert.ok(!g.cramped(e.points.at(-1), 0.5), `settle: not in the corridor: ${JSON.stringify(e.points.at(-1))}`);
});

test("S1R1-07: a big member whose way ends where its body stops fitting (off the grid) rests on whole squares out of a fight, never past the door's line", () => {
  // H7b: the Large (5,4) with Hero 1 (8,4); Hero 1 dropped in room B. The Large fits no one-wide door: its way is the
  // line toward its spot as far as its body fits, which ends 12 px into the door frame (live: (9.12, 4.52)).
  const group = [["H1", 8, 4], ["L", 5, 4, 2]];
  const toward = (m, f, t) => (m.id === "L" ? { points: [at(5, 4, 2), { x: 10.12, y: 5.52 }], length: 4.2 } : null);
  const g = gridWorld(DUNGEON, { gridLattice: true });
  const ms = group.map(([id, col, row, w = 1]) => member(id, at(col, row, w), { x: 8, y: 1 }, { w }));
  const route = (m, f, t, o) => (m.id === "L" ? null : g.route(m, f, t, o));
  const res = finish(planGroup({ members: ms, anchorId: "H1" },
    { walkable: g.walkable, walkDistance: g.walkDistanceFrom(ms[0].formation), route, toward, narrow: g.narrow, cramped: g.cramped, now: () => 0 }));
  assert.equal(res.result, "plan");
  const end = res.members.L.points.at(-1);
  assert.equal(res.members.L.short, true);
  assert.ok(onCell(end, 2, 2), `whole squares: ${JSON.stringify(end)}`);
  assert.ok(end.x + 1 <= 11 + 1e-6, `its right edge not past the door's line (x 11): ${JSON.stringify(end)}`);
});
