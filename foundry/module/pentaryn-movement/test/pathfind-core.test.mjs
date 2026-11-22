// Pure pathfinding (pathfind-core.mjs) on synthetic wall sets. No Foundry: the grid is a little
// ASCII map, walls sit on the lines between squares, and the step tests are built from it the way
// pathfind-adapter.mjs builds them from a scene (walls on the footprint, creatures on squares,
// cost per square measured under the 2024 rule: every diagonal 5 ft).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as pf from "../pathfind-core.mjs";

const FT = 5;

/**
 * A map: '#' solid square, 'D' a closed door square (blocks), 'd' an open door (passes), 'H' a
 * hostile creature (blocks, dnd5e), '~' difficult terrain (double cost), '.' open. Walls between
 * squares come from `walls`: segments [[x0, y0], [x1, y1]] on grid lines (x = column line, y = row
 * line), and `oneWay` segments that block only moves in `dir` (+1 = increasing j or i).
 * `size` is the token's side in squares (a 2 is a 2×2 token; nodes are its top-left square).
 */
function world(rows, { walls = [], oneWay = [], size = 1 } = {}) {
  const H = rows.length, W = rows[0].length;
  const at = (i, j) => (i < 0 || j < 0 || i >= H || j >= W ? "#" : rows[i][j]);
  const solid = (i, j) => "#D".includes(at(i, j));
  // Does a wall segment lie on the grid line between square (i, j) and its neighbour (i+di, j+dj)?
  const between = (i, j, di, dj) => {
    for (const [[x0, y0], [x1, y1]] of walls) {
      if (di === 0 && x0 === x1 && x0 === j + Math.max(0, dj) && Math.min(y0, y1) <= i && Math.max(y0, y1) >= i + 1) return true;
      if (dj === 0 && y0 === y1 && y0 === i + Math.max(0, di) && Math.min(x0, x1) <= j && Math.max(x0, x1) >= j + 1) return true;
    }
    for (const { seg: [[x0, y0], [x1, y1]], dir } of oneWay) {
      if (di === 0 && x0 === x1 && x0 === j + Math.max(0, dj) && Math.min(y0, y1) <= i && Math.max(y0, y1) >= i + 1 && dj === dir) return true;
      if (dj === 0 && y0 === y1 && y0 === i + Math.max(0, di) && Math.min(x0, x1) <= j && Math.max(x0, x1) >= j + 1 && di === dir) return true;
    }
    return false;
  };
  // An orthogonal unit move of one square: blocked by a solid square or a wall on the line crossed.
  const unit = (i, j, di, dj) => !solid(i + di, j + dj) && !between(i, j, di, dj);
  // Footprint: each covered square makes the same move.
  const cells = n => {
    const out = [];
    for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) out.push([n.i + a, n.j + b]);
    return out;
  };
  const orth = (a, b) => cells(a).every(([i, j]) => unit(i, j, b.i - a.i, b.j - a.j));
  // A diagonal ray between centres: passes when a 2-step orthogonal route exists for every square
  // (a ray through the shared corner point: the corner rule then decides squeezes).
  const wall = (a, b) => {
    const di = b.i - a.i, dj = b.j - a.j;
    if (!di || !dj) return orth(a, b);
    return cells(a).every(([i, j]) => !solid(i + di, j + dj)
      && ((unit(i, j, di, 0) && unit(i + di, j, 0, dj)) || (unit(i, j, 0, dj) && unit(i, j + dj, di, 0))
        || (!between(i, j, di, 0) && !between(i + di, j, 0, dj)) || (!between(i, j, 0, dj) && !between(i, j + dj, di, 0))));
  };
  const blocked = n => cells(n).some(([i, j]) => at(i, j) === "H");
  const edge = (a, b) => {
    if (blocked(b) || !wall(a, b)) return null;
    return cells(b).some(([i, j]) => at(i, j) === "~") ? 2 * FT : FT;
  };
  // The whole straight line passes when every square on its direct path is reachable step by step.
  const lineOk = (a, b) => pf.chainCost(a, b, { edge, wall }) !== null;
  return { edge, wall, lineOk, H, W, bounds: { minI: 0, maxI: H - size, minJ: 0, maxJ: W - size } };
}

function route(rows, from, to, opts = {}) {
  const w = world(rows, opts);
  const job = pf.search({ start: from, goal: to, edge: w.edge, wall: w.wall, unit: FT, bounds: w.bounds });
  const state = job.run();
  if (state !== "found") return { state, w };
  const pulled = pf.stringPull(job.path, job.costs, { edge: w.edge, wall: w.wall, lineOk: w.lineOk });
  return { state, w, path: job.path, cost: job.costs.at(-1), pulled };
}

const sumCost = (pts, w) => {
  let c = 0;
  for (let k = 1; k < pts.length; k++) c += pf.chainCost(pts[k - 1], pts[k], w);
  return c;
};

test("open floor: a straight drag is one leg, cost = Chebyshev × 5 ft", () => {
  const r = route([".....", ".....", "....."], { i: 0, j: 0 }, { i: 2, j: 4 });
  assert.equal(r.state, "found");
  assert.equal(r.cost, 4 * FT);
  assert.deepEqual(r.pulled, [{ i: 0, j: 0 }, { i: 2, j: 4 }]);
});

test("L-corridor: goes around the corner; the pulled path keeps the A* cost", () => {
  const map = [
    "......",
    "####..",
    "......",
  ];
  const r = route(map, { i: 0, j: 0 }, { i: 2, j: 0 });
  assert.equal(r.state, "found");
  assert.equal(r.cost, 8 * FT);                       // out to column 4, down, back
  assert.ok(r.pulled.length >= 3 && r.pulled.length < r.path.length, JSON.stringify(r.pulled));
  assert.equal(sumCost(r.pulled, r.w), r.cost, "string pulling never raises the cost");
});

test("closed door blocks, open door passes", () => {
  const closed = ["...#...", "...D...", "...#..."];
  const open = ["...#...", "...d...", "...#..."];
  const a = { i: 1, j: 0 }, b = { i: 1, j: 6 };
  assert.equal(route(closed, a, b).state, "none");
  const r = route(open, a, b);
  assert.equal(r.state, "found");
  assert.equal(r.cost, 6 * FT);
});

test("a wall on a grid line blocks; a one-way wall blocks one direction only", () => {
  const map = ["...", "...", "..."];
  const fence = [[[0, 1], [3, 1]]];                    // the whole line between rows 0 and 1
  assert.equal(route(map, { i: 0, j: 1 }, { i: 2, j: 1 }, { walls: fence }).state, "none");
  const gate = [{ seg: [[0, 1], [3, 1]], dir: 1 }];    // blocks moving down (increasing i)
  assert.equal(route(map, { i: 0, j: 1 }, { i: 2, j: 1 }, { oneWay: gate }).state, "none");
  assert.equal(route(map, { i: 2, j: 1 }, { i: 0, j: 1 }, { oneWay: gate }).state, "found");
});

test("corner rule: no diagonal squeeze between two walls that meet at a corner", () => {
  // Walls: the line right of square (0,0) and the line below it, meeting at the corner (1, 1).
  const map = ["...", "...", "..."];
  const walls = [[[1, 0], [1, 1]], [[0, 1], [1, 1]]];
  const w = world(map, { walls });
  assert.equal(pf.cornerOk({ i: 0, j: 0 }, { i: 1, j: 1 }, w.wall), false);
  // One wall end only: the diagonal past it is allowed.
  const w2 = world(map, { walls: [walls[0]] });
  assert.equal(pf.cornerOk({ i: 0, j: 0 }, { i: 1, j: 1 }, w2.wall), true);
  assert.equal(route(map, { i: 0, j: 0 }, { i: 1, j: 1 }, { walls }).state, "none", "the square is sealed");
});

test("a 2×2 token refuses a 1-wide gap a 1×1 token takes", () => {
  const map = [
    "......",
    "......",
    "###.##",
    "......",
    "......",
  ];
  assert.equal(route(map, { i: 0, j: 3 }, { i: 4, j: 3 }).state, "found");
  assert.equal(route(map, { i: 0, j: 2 }, { i: 3, j: 2 }, { size: 2 }).state, "none");
  const wide = ["......", "......", "##..##", "......", "......"];
  assert.equal(route(wide, { i: 0, j: 2 }, { i: 3, j: 2 }, { size: 2 }).state, "found");
});

test("difficult terrain: detours when the detour is cheaper, crosses when it is not", () => {
  const strip = ["..~..", "..~..", "....."];
  const r = route(strip, { i: 0, j: 0 }, { i: 0, j: 4 });
  assert.equal(r.cost, 4 * FT, "four diagonals under the strip (20 ft) beat crossing it (25 ft)");
  const wall = ["..~..", "..~..", "..~.."];
  const r2 = route(wall, { i: 0, j: 0 }, { i: 0, j: 4 });
  assert.equal(r2.cost, 5 * FT, "no way round: crossing costs 3×5 + 10");
  assert.equal(sumCost(r2.pulled, r2.w), r2.cost);
});

test("a hostile in a doorway blocks the door; the route takes the other door", () => {
  const map = [
    ".......",
    "#H###.#",
    ".......",
  ];
  const r = route(map, { i: 0, j: 1 }, { i: 2, j: 1 });
  assert.equal(r.state, "found");
  assert.ok(!r.path.some(n => n.i === 1 && n.j === 1), "never through the hostile");
  assert.equal(r.cost, 8 * FT);
});

test("string pulling: equal-cost zig-zags straighten; the cost never rises", () => {
  const map = ["..........", "..........", "....#.....", "..........", ".........."];
  for (const [a, b] of [[{ i: 0, j: 0 }, { i: 4, j: 9 }], [{ i: 4, j: 0 }, { i: 0, j: 9 }], [{ i: 2, j: 0 }, { i: 2, j: 9 }]]) {
    const r = route(map, a, b);
    assert.equal(r.state, "found");
    assert.equal(r.cost, pf.chebyshev(a, b) * FT, "the pillar costs nothing extra with 5-ft diagonals");
    assert.equal(sumCost(r.pulled, r.w), r.cost);
    assert.ok(r.pulled.length <= 3, JSON.stringify(r.pulled));
  }
});

test("unreachable goal and the node cap give 'none'; run(budget) resumes to the same answer", () => {
  const sealed = ["....", ".##.", ".#.#", ".##."];
  assert.equal(route(sealed, { i: 0, j: 0 }, { i: 2, j: 2 }).state, "none");
  const w = world(["." .repeat(30), "." .repeat(30), "." .repeat(30)]);
  const capped = pf.search({ start: { i: 0, j: 0 }, goal: { i: 2, j: 29 }, edge: w.edge, wall: w.wall, unit: FT, maxNodes: 3 });
  assert.equal(capped.run(), "none");
  let t = 0;
  const sliced = pf.search({ start: { i: 0, j: 0 }, goal: { i: 2, j: 29 }, edge: w.edge, wall: w.wall, unit: FT, now: () => (t += 1) });
  let state, slices = 0;
  while ((state = sliced.run(0.5)) === "more") slices += 1;
  assert.equal(state, "found");
  assert.equal(sliced.costs.at(-1), 29 * FT);
  assert.ok(slices >= 0);
});

test("directPath matches Foundry's square-grid walk (ends included, Chebyshev steps)", () => {
  const p = pf.directPath({ i: 0, j: 0 }, { i: 2, j: 5 });
  assert.equal(p.length, 6);
  assert.deepEqual(p[0], { i: 0, j: 0 });
  assert.deepEqual(p.at(-1), { i: 2, j: 5 });
  for (let k = 1; k < p.length; k++) assert.equal(pf.chebyshev(p[k - 1], p[k]), 1);
  assert.deepEqual(pf.directPath({ i: 3, j: 3 }, { i: 3, j: 3 }), [{ i: 3, j: 3 }]);
});

test("filletPoints: a 90° corner becomes a tangent arc inside the turn", () => {
  const A = { x: 0, y: 0 }, B = { x: 300, y: 0 }, C = { x: 300, y: 300 };
  const arc = pf.filletPoints(A, B, C, 150);
  assert.ok(arc.length >= 3);
  assert.deepEqual(arc[0], { x: 150, y: 0 });
  assert.ok(Math.abs(arc.at(-1).x - 300) < 1e-6 && Math.abs(arc.at(-1).y - 150) < 1e-6);
  const O = { x: 150, y: 150 };                        // the arc's centre: radius 150 to every point
  for (const p of arc) assert.ok(Math.abs(Math.hypot(p.x - O.x, p.y - O.y) - 150) < 1e-6);
  for (const p of arc) assert.ok(p.x <= 300 + 1e-6 && p.y >= -1e-6, "inside the corner");
  assert.equal(pf.filletPoints(A, B, { x: 600, y: 0 }, 50), null, "no turn, no arc");
});

test("fillet keeps a corner sharp when no arc is clear or one would cost more", () => {
  const pts = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }];
  const all = pf.fillet(pts, { maxT: 300, clear: () => true, cost: () => 10 });
  assert.equal(all.arcs, 1);
  assert.ok(all.points.length > 3 && all.points.some(p => p.arc));
  const blocked = pf.fillet(pts, { maxT: 300, clear: () => false, cost: () => 10 });
  assert.equal(blocked.arcs, 0);
  assert.deepEqual(blocked.points, pts);
  let n = 0;
  const dearer = pf.fillet(pts, { maxT: 300, clear: () => true, cost: seq => (seq.length > 3 ? 15 : 10), tries: 3 });
  assert.equal(dearer.arcs, 0);
  // Halving: only a small arc clears (its first point within 80 px of the corner).
  const small = pf.fillet(pts, { maxT: 300, clear: (p, q) => { n += 1; return Math.hypot(600 - p.x, p.y) <= 80 || p.x === 0; }, cost: () => 10 });
  assert.equal(small.arcs, 1);
  assert.ok(n > 0);
});

test("skipReason: every early return", () => {
  const go = { mode: "everyone", mine: true, isGM: false, gridType: 1, constrain: {}, waypoints: 2 };
  assert.equal(pf.skipReason(go), null);
  assert.equal(pf.skipReason({ ...go, mode: "off" }), "off");
  assert.equal(pf.skipReason({ ...go, mode: "gm" }), "gmOnly");
  assert.equal(pf.skipReason({ ...go, mode: "gm", isGM: true }), null);
  assert.equal(pf.skipReason({ ...go, mode: "junk" }), null, "an unknown mode is the default (everyone)");
  assert.equal(pf.skipReason({ ...go, mine: false }), "client");
  assert.equal(pf.skipReason({ ...go, gridType: 0 }), "grid");
  assert.equal(pf.skipReason({ ...go, gridType: 2 }), "grid");
  assert.equal(pf.skipReason({ ...go, constrain: { ignoreWalls: true } }), "unconstrained", "ghost / GM unconstrained");
  assert.equal(pf.skipReason({ ...go, waypoints: 1 }), "short");
});

test("boundsFor pads the box and clips it; reachedCount counts explicit waypoints in order", () => {
  const b = pf.boundsFor({ i: 0, j: 0 }, { i: 2, j: 2 }, { minI: -3, maxI: 30, minJ: 0, maxJ: 30 });
  assert.deepEqual(b, { minI: -3, maxI: 10, minJ: 0, maxJ: 10 });
  const same = (a, c) => a.x === c.x && a.y === c.y;
  const ex = [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 9 }];
  assert.equal(pf.reachedCount([{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 0 }], ex, same), 2);
  assert.equal(pf.reachedCount([], ex, same), 0);
});

// Live round 1 D-10: two corners one square apart (in and out of a door) shared their tangent point,
// and the route carried that waypoint twice.
test("fillet never repeats a point where two arcs meet (corners closer than two tangent lengths)", () => {
  const pts = [{ x: 450, y: 350 }, { x: 750, y: 850 }, { x: 850, y: 850 }, { x: 1250, y: 350 }];
  const r = pf.fillet(pts, { maxT: 150, clear: () => true, cost: () => 10, maxError: 5 });
  assert.equal(r.arcs, 2);
  for (let k = 1; k < r.points.length; k++) {
    const a = r.points[k - 1], b = r.points[k];
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 0.5, `points ${k - 1} and ${k} coincide: ${JSON.stringify([a, b])}`);
  }
});
