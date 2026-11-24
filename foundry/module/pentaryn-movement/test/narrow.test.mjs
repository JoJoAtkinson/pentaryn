// Narrow ways (0.10 step N, Joe's R9; plan §18.4): pathfinding through any passage shape, on pure geometry. The
// router (test/fixtures/narrow.mjs) builds a 1×1 token's plain square test the way pathfind-adapter.mjs does and adds
// narrow-core's field and walk, as pathfind.mjs does. Every check is independent of the field (brute force over every
// wall). The gates: 400 seeded room-to-room routes over generated C stairs, Joe's stations S05 (the spiral C stair)
// and S06 (passage shapes) from the ZZ Playground, the other shapes, a Large and the long way round, a fight, and the
// regression (a map whose walls lie on the grid lines routes exactly as before).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pf from "../pathfind-core.mjs";
import { NARROW, narrowField, squareEntries } from "../narrow-core.mjs";
import { router, cStair, judge, headings, centreError, inLane, rng } from "./fixtures/narrow.mjs";

const PASS = NARROW.pass - NARROW.eps;               // 0.15, to 0.001 square (0.1 px on a 100 px grid)
const STATIONS = JSON.parse(readFileSync(new URL("./fixtures/narrow-stations.json", import.meta.url), "utf8")).stations;
const station = id => STATIONS.find(s => s.id === id);
/** A station's walls in a scenario (an open door does not block; a secret door always does). */
const wallsOf = (s, scen = "default") => {
  const doors = s.scenarios?.[scen]?.doors ?? {};
  return s.walls.filter(w => !w.only || w.only.includes(scen))
    .filter(w => { const ds = w.key in doors ? doors[w.key] : w.ds; return !(w.door && w.door !== 2 && ds === 1); })
    .map(w => w.c);
};
const median = a => { const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (a, q) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(q * b.length))]; };
/** The warm time of a route: the median of three runs once its field is built. */
const warm = (R, a, b) => median([0, 1, 2].map(() => R.route(a, b).ms));

/** The centre-line error of a walk through a C wherever the way is narrower than the token (diameter `dia`). */
function centreLine(C, pts, dia = 1) {
  let max = 0, n = 0;
  for (const p of judge(C.walls, pts).samples) {
    if (!inLane(C, p)) continue;
    const ce = centreError(C, p);
    if (ce.width >= dia) continue;
    n += 1;
    max = Math.max(max, ce.err);
  }
  return { max, n };
}

test("R9 gate: 400 seeded room-to-room routes over generated C stairs, both ways, from random points", () => {
  const out = { routes: 0, found: 0, narrow: 0, through: 0, minClearance: Infinity, centreMax: 0, centreSamples: 0, turnMax: 0, zig: 0, warm: [], cold: [], squares: [], points: [] };
  for (let seed = 1; seed <= 200; seed++) {
    const C = cStair(seed);
    const R = router(C.walls);
    const a = C.pick(C.rooms[0]), b = C.pick(C.rooms[1]);
    const t0 = performance.now();
    const first = R.route(a, b);
    out.cold.push(performance.now() - t0);
    out.squares.push(R.field.built().squares);
    for (const [from, to, r0] of [[a, b, first], [b, a, null]]) {
      const r = r0 ?? R.route(from, to);
      out.routes += 1;
      assert.ok(r.found, `seed ${seed}: no route (${r.state}; R ${C.R.toFixed(2)}, narrowest ${C.wmin.toFixed(3)}, sweep ${(C.sweep * 180 / Math.PI).toFixed(0)}°)`);
      out.found += 1;
      assert.ok(r.fine, `seed ${seed}: the route did not use the narrow way`);
      if (r.narrow) out.narrow += 1;
      const j = judge(C.walls, r.points);
      assert.equal(j.through, false, `seed ${seed}: through a wall`);
      assert.ok(j.minClearance >= PASS, `seed ${seed}: clearance ${j.minClearance.toFixed(4)} under ${NARROW.pass}`);
      out.minClearance = Math.min(out.minClearance, j.minClearance);
      const c = centreLine(C, r.points);
      assert.ok(c.max <= 0.05, `seed ${seed}: ${c.max.toFixed(4)} square off the centre line where the way is narrower than the token`);
      out.centreMax = Math.max(out.centreMax, c.max);
      out.centreSamples += c.n;
      const h = headings(r.points);
      assert.ok(h.max <= 30, `seed ${seed}: a turn of ${h.max.toFixed(1)}° between two samples`);
      assert.equal(h.zig, 0, `seed ${seed}: a zigzag`);
      out.turnMax = Math.max(out.turnMax, h.max);
      out.points.push(r.points.length);
      out.warm.push(warm(R, from, to));
    }
  }
  assert.equal(out.found, 400);
  const w = { p50: median(out.warm), p95: pct(out.warm, 0.95), max: Math.max(...out.warm) };
  assert.ok(w.max < 50, `warm ${JSON.stringify(w)} (gate: under 50 ms)`);
  console.log(`# R9 C stairs: ${out.found}/${out.routes} found (${out.narrow} through a way narrower than the token), 0 through a wall, least clearance ${out.minClearance.toFixed(4)}, `
    + `centre line within ${out.centreMax.toFixed(4)} over ${out.centreSamples} narrow samples, largest turn ${out.turnMax.toFixed(1)}°, `
    + `no zigzag; warm p50 ${w.p50.toFixed(1)} p95 ${w.p95.toFixed(1)} max ${w.max.toFixed(1)} ms; cold (the first route, building the field) `
    + `p50 ${median(out.cold).toFixed(1)} max ${Math.max(...out.cold).toFixed(1)} ms over ${median(out.squares)} squares; points p50 ${median(out.points)} max ${Math.max(...out.points)}`);
});

test("R9: a way under 0.3 square is refused; 0.3 passes (the funnel), with the centre at 0.15 from both walls", () => {
  // A straight funnel from 1.0 down to `throat` and back, between two rooms; walls off the grid.
  const funnel = throat => {
    const y0 = 10.37, x0 = 10.21, L = 6;
    const half = x => 0.5 - (0.5 - throat / 2) * (1 - Math.abs((x - x0 - L / 2) / (L / 2)));
    const top = [], bot = [];
    for (let k = 0; k <= 12; k++) { const x = x0 + (L * k) / 12; top.push([x, y0 - half(x)]); bot.push([x, y0 + half(x)]); }
    const walls = [];
    for (let k = 1; k < top.length; k++) { walls.push([...top[k - 1], ...top[k]]); walls.push([...bot[k - 1], ...bot[k]]); }
    // Rooms west and east, 4 × 4.
    const room = (xa, xb, side) => {
      const t = y0 - 2, b = y0 + 2, x = side < 0 ? xb : xa;
      walls.push([xa, t, xb, t], [xa, b, xb, b], [side < 0 ? xa : xb, t, side < 0 ? xa : xb, b], [x, t, x, y0 - 0.5], [x, y0 + 0.5, x, b]);
    };
    room(x0 - 4, x0, -1);
    room(x0 + L, x0 + L + 4, 1);
    return { walls, a: { x: x0 - 2, y: y0 + 0.3 }, b: { x: x0 + L + 2, y: y0 - 0.4 } };
  };
  for (const [throat, passes] of [[0.3, true], [0.32, true], [0.5, true], [0.29, false], [0.2, false]]) {
    const F = funnel(throat);
    const R = router(F.walls);
    const r = R.route(F.a, F.b);
    assert.equal(r.found, passes, `throat ${throat}: ${passes ? "passes" : "refused"}`);
    if (!passes) continue;
    const j = judge(F.walls, r.points);
    assert.equal(j.through, false);
    assert.ok(j.minClearance >= PASS, `throat ${throat}: clearance ${j.minClearance}`);
  }
});

test("R9: a hairpin whose two lanes share squares — the route goes round the U, never across the wall between them", () => {
  // Two lanes 0.8 wide, divided by one wall at y = 20.43 (through the middle of row 20), joined by a U at x ≈ 30.
  const walls = [[18, 19.63, 30, 19.63], [18, 20.43, 30, 20.43], [18, 21.23, 30, 21.23]];
  const O = { x: 30, y: 20.43 };
  for (let k = 0; k < 12; k++) {
    const a0 = -Math.PI / 2 + (Math.PI * k) / 12, a1 = -Math.PI / 2 + (Math.PI * (k + 1)) / 12;
    walls.push([O.x + 0.8 * Math.cos(a0), O.y + 0.8 * Math.sin(a0), O.x + 0.8 * Math.cos(a1), O.y + 0.8 * Math.sin(a1)]);
  }
  walls.push([18, 19.63, 18, 18], [18, 21.23, 18, 23]);     // a room west of the upper lane's mouth
  walls.push([14, 18, 18, 18], [14, 23, 18, 23], [14, 18, 14, 23], [18, 20.43, 18, 21.23]);   // the lower lane's west end shut
  const R = router(walls);
  const r = R.route({ x: 16, y: 20 }, { x: 19.2, y: 20.83 });
  assert.ok(r.found);
  const j = judge(walls, r.points);
  assert.equal(j.through, false, "never across the dividing wall");
  assert.ok(j.minClearance >= PASS);
  assert.ok(Math.max(...r.points.map(p => p.x)) > 29.9, "the way goes round the U");
  // The squares of row 20 hold two nodes each (one per lane).
  const c = R.field.cells(20, 24);
  assert.equal(R.field.tight(20, 24), true);
  assert.equal(c.n, 2);
});

test("R9: a field of off-grid pillars — found, clear, smooth", () => {
  const r0 = rng(77);
  let fine = 0;
  for (let trial = 0; trial < 20; trial++) {
    const walls = [[10, 10, 30, 10], [30, 10, 30, 22], [30, 22, 10, 22], [10, 22, 10, 10]];
    for (let k = 0; k < 18; k++) {
      const x = 12 + r0() * 16, y = 11.5 + r0() * 9, s = 0.2 + r0() * 0.4;
      walls.push([x, y, x + s, y], [x + s, y, x + s, y + s], [x + s, y + s, x, y + s], [x, y + s, x, y]);
    }
    const R = router(walls);
    const a = { x: 11 + r0(), y: 11 + r0() * 10 }, b = { x: 28 + r0(), y: 11 + r0() * 10 };
    if (R.field.clearance(a.x, a.y) < 0.5 || R.field.clearance(b.x, b.y) < 0.5) continue;
    const r = R.route(a, b);
    assert.ok(r.found, `trial ${trial}`);
    const j = judge(walls, r.points);
    assert.equal(j.through, false);
    // Every route keeps the pass radius: the plain one is kept only when it does (constraint 1), else the narrow walk.
    assert.ok(j.minClearance >= PASS, `trial ${trial}: ${j.minClearance}`);
    // A plain route's corners are pathfind.mjs's arcs; a narrow walk's own smoothness here.
    if (!r.fine) continue;
    fine += 1;
    const h = headings(r.points);
    assert.ok(h.max <= 35 && h.zig === 0, `trial ${trial}: turn ${h.max}, zigzags ${h.zig}`);
  }
  assert.ok(fine >= 3, `${fine} narrow walks`);
  console.log(`# pillar fields: 20 trials, ${fine} through the narrow walk, the rest today's plain route (it kept 0.15 square)`);
});

test("R9 stations: Joe's S05 (the spiral C stair) — one route room to room, both ways, on the centre line", () => {
  const S = station("S05");
  const W = wallsOf(S);
  const R = router(W);
  const inner = S.walls.filter(w => w.grp === "S05.stair.in").map(w => w.c), outer = S.walls.filter(w => w.grp === "S05.stair.out").map(w => w.c);
  const chainDist = (p, ws) => Math.min(...ws.map(([ax, ay, bx, by]) => {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = Math.min(Math.max(((p.x - ax) * dx + (p.y - ay) * dy) / L2, 0), 1);
    return Math.hypot(p.x - ax - dx * t, p.y - ay - dy * t);
  }));
  const r0 = rng(5);
  const roomA = () => ({ x: 4.6 + r0() * 4.8, y: 29.6 + r0() * 4.8 }), roomB = () => ({ x: 4.6 + r0() * 4.8, y: 42.6 + r0() * 4.8 });
  let worst = 0, turn = 0;
  const times = [];
  for (let k = 0; k < 20; k++) {
    for (const [a, b] of [[roomA(), roomB()], [roomB(), roomA()]]) {
      const r = R.route(a, b);
      assert.ok(r.found && r.fine && r.narrow, `route ${k}`);
      const j = judge(W, r.points);
      assert.equal(j.through, false);
      assert.ok(j.minClearance >= PASS, `route ${k}: ${j.minClearance}`);
      for (const p of j.samples) {
        if (p.x <= 10.2) continue;                     // the stair is east of the rooms' wall (x = 10)
        const di = chainDist(p, inner), dout = chainDist(p, outer);
        if (di + dout < 1) worst = Math.max(worst, Math.abs(di - dout) / 2);
      }
      const h = headings(r.points);
      assert.ok(h.max <= 30, `route ${k}: turn ${h.max}`);
      assert.equal(h.zig, 0, `route ${k}: zigzag`);
      turn = Math.max(turn, h.max);
      times.push(warm(R, a, b));
    }
  }
  assert.ok(worst <= 0.05, `centre line ${worst}`);
  assert.ok(Math.max(...times) < 50, `warm ${Math.max(...times)} ms`);
  // The station's drop points: dropMid (the narrowest, 0.4) is a centre-line point, as restPoint gives it for a point
  // in the way beside it (the snapped square's own centre, 16.5, lies outside the C's outer wall, on open floor).
  const mid = S.points.dropMid.c;
  const rp = R.field.restPoint({ x: mid[0] + 0.12, y: mid[1] + 0.05 });
  assert.ok(Math.hypot(rp.x - mid[0], rp.y - mid[1]) < 0.05, `restPoint ${JSON.stringify(rp)}`);
  console.log(`# S05: 40 routes, centre line within ${worst.toFixed(4)}, largest turn ${turn.toFixed(1)}°, warm max ${Math.max(...times).toFixed(1)} ms`);
});

test("R9 stations: Joe's S06 (passage shapes) — S-curve, diagonal slit 0.4, funnel 0.3 pass; slit 0.2 refused; hairpin; pillars", () => {
  const S = station("S06");
  const W = wallsOf(S);
  const R = router(W);
  const hall = S.tokens.map(t => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  const want = { dropScurve: true, dropDiag: true, dropFunnel: true, dropSlit: false, dropHairpin: true, dropField: true };
  const line = [];
  for (const [name, ok] of Object.entries(want)) {
    const p = S.points[name].c, to = { x: p[0], y: p[1] };
    for (const from of hall) {
      const r = R.route(from, to);
      assert.equal(r.found, ok, `${name}: ${ok ? "found" : "refused"}`);
      if (!ok) continue;
      const j = judge(W, r.points);
      assert.equal(j.through, false, name);
      assert.ok(j.minClearance >= PASS, `${name}: ${j.minClearance}`);
      const h = headings(r.points);
      assert.ok(h.max <= 40 && h.zig === 0, `${name}: turn ${h.max}, zigzags ${h.zig}`);
      const ms = warm(R, from, to);
      assert.ok(ms < 50, name);
      if (name === "dropHairpin") assert.ok(Math.max(...r.points.map(q => q.x)) > 40.4, "round the U");
      if (from === hall[0]) line.push(`${name} clearance ${j.minClearance.toFixed(3)} turn ${h.max.toFixed(1)}° warm ${ms.toFixed(1)} ms`);
    }
    if (!ok) line.push(`${name} refused`);
  }
  console.log(`# S06: ${line.join("; ")}`);
});

test("R9 / decision 8: with a long way round a Medium takes the short narrow way and a Large the long one; with none the Large has no way", () => {
  const S = station("S05");
  const large = S.tokens.find(t => t.w === 2), hero = S.tokens[0];
  const B = { x: S.points.dropB.c[0], y: S.points.dropB.c[1] };
  const long = wallsOf(S, "long");
  const m = router(long).route({ x: hero.x + 0.5, y: hero.y + 0.5 }, B);
  const L = router(long, { size: 2 }).route({ x: large.x + 1, y: large.y + 1 }, { x: B.x + 0.5, y: B.y + 0.5 });
  assert.ok(m.found && m.fine, "the Medium through the stair");
  assert.ok(L.found && !L.fine, "the Large the long way");
  assert.ok(L.cost > m.cost + 5, `the long way is longer (${L.cost} against ${m.cost})`);
  assert.ok(Math.min(...L.points.map(p => p.y)) < 29, "round by the north door");
  const shut = router(wallsOf(S), { size: 2 }).route({ x: large.x + 1, y: large.y + 1 }, { x: B.x + 0.5, y: B.y + 0.5 });
  assert.equal(shut.found, false, "no way for the Large through the stair");
});

test("R9 fight: through the C the walk's checkpoints are where its centre line enters each square; the rest stays on the grid", () => {
  const S = station("S05");
  const W = wallsOf(S);
  const R = router(W, { fight: true });
  const hero = S.tokens[0];
  const from = { x: hero.x + 0.5, y: hero.y + 0.5 }, to = { x: S.points.dropB.c[0], y: S.points.dropB.c[1] };
  const r = R.route(from, to);
  assert.ok(r.found && r.fine);
  const j = judge(W, r.points);
  assert.equal(j.through, false);
  // Through the narrow way every square the walk passes is entered at a checkpoint (just inside it); a point that
  // stays in the square it is in is none. The rest (the rooms) is on square centres: the grid, as a fight's path is.
  const sq = p => `${Math.floor(p.y)},${Math.floor(p.x)}`;
  const onGrid = p => Math.abs(p.x - Math.floor(p.x) - 0.5) < 1e-9 && Math.abs(p.y - Math.floor(p.y) - 0.5) < 1e-9;
  const narrow = r.points.filter(p => p.narrow);
  assert.ok(narrow.length > 10 && narrow.some(p => !onGrid(p)), "off the grid through the stair");
  for (let k = 1; k < r.points.length; k++) {
    const p = r.points[k];
    if (!p.narrow) continue;
    assert.equal(!!p.checkpoint, sq(p) !== sq(r.points[k - 1]), `point ${k} (${sq(p)})`);
  }
  for (const p of r.points.filter(q => !q.narrow)) assert.ok(onGrid(p) || p === r.points[0] || p === r.points.at(-1), `room point off the grid ${JSON.stringify(p)}`);
  // squareEntries alone: one checkpoint per square entered, the last point a checkpoint.
  const e = squareEntries(null, [{ x: 0.5, y: 0.5 }, { x: 2.7, y: 0.6 }, { x: 2.9, y: 2.2 }]);
  assert.deepEqual(e.filter(p => p.checkpoint).map(sq), ["0,1", "0,2", "1,2", "2,2", "2,2"]);
  assert.equal(e.at(-1).checkpoint, true);
});

test("R9 regression: walls on the grid lines — no tight square, every route the same, waypoint for waypoint", () => {
  const r0 = rng(4242);
  let n = 0;
  for (let trial = 0; trial < 60; trial++) {
    // A random maze of wall segments on grid lines.
    const walls = [];
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(r0() * 20), y = Math.floor(r0() * 20), L = 1 + Math.floor(r0() * 5);
      walls.push(r0() < 0.5 ? [x, y, x + L, y] : [x, y, x, y + L]);
    }
    walls.push([0, 0, 20, 0], [20, 0, 20, 20], [20, 20, 0, 20], [0, 20, 0, 0]);
    const a = { x: 0.5 + Math.floor(r0() * 20), y: 0.5 + Math.floor(r0() * 20) }, b = { x: 0.5 + Math.floor(r0() * 20), y: 0.5 + Math.floor(r0() * 20) };
    const limit = { minI: 0, maxI: 19, minJ: 0, maxJ: 19 };
    const withNarrow = router(walls, { limit }), plain = router(walls, { limit, narrow: false });
    const p = withNarrow.route(a, b), q = plain.route(a, b);
    assert.equal(p.found, q.found);
    if (!p.found) continue;
    n += 1;
    assert.equal(p.fine, false, "no narrow way on a grid map");
    assert.deepEqual(p.points, q.points);
    assert.deepEqual(p.path, q.path);
    for (let I = 0; I < 20; I++) for (let J = 0; J < 20; J++) assert.equal(withNarrow.field.tight(I, J), false);
  }
  assert.ok(n > 20);
});

test("R9: pathfind-core search with `more` and none given: the same job on a plain lattice", () => {
  const edge = (a, b) => (b.i < 0 || b.j < 0 || b.i > 9 || b.j > 9 ? null : 1);
  const a = pf.search({ start: { i: 0, j: 0 }, goal: { i: 7, j: 4 }, edge });
  const b = pf.search({ start: { i: 0, j: 0 }, goal: { i: 7, j: 4 }, edge, more: () => [] });
  a.run(); b.run();
  assert.deepEqual(a.path, b.path);
  assert.deepEqual(a.costs, b.costs);
  assert.equal(pf.nodeKey({ i: 2, j: 3 }), "2,3");
  assert.equal(pf.nodeKey({ i: 2, j: 3, c: 2 }), "2,3#2");
  assert.equal(pf.nodeKey({ i: 2, j: 3, c: 0 }), "2,3");
});

test("R9: narrowField's pieces — tight squares, components, the rest point on the centre line", () => {
  // A 0.4 diagonal slit: two parallel walls through the middle of squares.
  const f = narrowField([[2, 2.2828, 6, 6.2828], [2.2828, 2, 6.2828, 6]], { pad: 0.5 });
  assert.equal(f.tight(3, 3), true);
  assert.equal(f.tight(0, 9), false);
  const p = f.restPoint({ x: 4.2, y: 4.3 });
  // The way is 0.4 wide (perpendicular): its centre line keeps 0.2 from both walls.
  assert.ok(Math.abs(f.clearance(p.x, p.y) - 0.2) < 0.002, `rest ${JSON.stringify(p)} at ${f.clearance(p.x, p.y)}`);
  const g = narrowField([[0.1, 0.5, 0.9, 0.5]], { pad: 0.5 });
  assert.equal(g.tight(0, 0), true);
  assert.equal(g.cells(0, 0).n, 2, "a thin wall through a square makes two parts");
});
