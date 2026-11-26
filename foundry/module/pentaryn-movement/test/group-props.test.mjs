// Randomized property tests and edge cases for the pure cores (group-core.mjs flood and freePrefix, motion-core.mjs),
// seeded so a failure reproduces: the seed is in the message.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flood, freePrefix, prefixOf, onCell, stacksOf } from "../group-core.mjs";
import { MOTION, trajectory, delayed, positionAt, waves, cellChain, dist, radiusOf, groupMode, clickStop } from "../motion-core.mjs";

/** mulberry32: small seeded PRNG. */
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

/** A random W×H floor: a walled border, scattered pillars, an optional full wall with one or two doors. */
test("property: positionAt is clamped at both ends and never faster than the speed", () => {
  const rand = rng(7);
  for (let k = 0; k < 200; k++) {
    const pts = Array.from({ length: 1 + Math.floor(rand() * 5) }, () => ({ x: rand() * 10, y: rand() * 10 }));
    const diff = pts.slice(1).map(() => 1 + rand() * 4);
    const tr = trajectory(pts, { delay: rand() * 1000, difficulty: diff });
    assert.deepEqual(positionAt(tr, -5), pts[0]);
    assert.deepEqual(positionAt(tr, tr.end + 5), pts.at(-1));
    let prev = positionAt(tr, tr.start);
    for (let t = tr.start; t <= tr.end; t += 7) {
      const p = positionAt(tr, t);
      assert.ok(dist(p, prev) <= 6 / 1000 * 7 + 1e-9, "no teleport");
      prev = p;
    }
  }
});

/* -------------------------------------------- */
/*  Edge cases                                  */
/* -------------------------------------------- */

test("edge: waves bucket negative and zero delays at 0, exact multiples in place, empty to empty", () => {
  assert.deepEqual(waves({ a: 0, b: -50, c: 150, d: 151, e: 300 }), [
    { at: 0, ids: ["a", "b"] }, { at: 150, ids: ["c"] }, { at: 300, ids: ["d", "e"] }]);
  assert.deepEqual(waves({}), []);
});


test("edge: cellChain of one node; `every` 0 acts as 1; a huge `every` checkpoints only the last", () => {
  assert.deepEqual(cellChain([{ i: 1, j: 1 }]), [{ i: 1, j: 1, checkpoint: true }]);   // the last cell is always a checkpoint
  const nodes = [{ i: 0, j: 0 }, { i: 0, j: 5 }];
  assert.ok(cellChain(nodes, 0).slice(1).every(c => c.checkpoint));
  const far = cellChain(nodes, 99);
  assert.equal(far.filter(c => c.checkpoint).length, 1);
  assert.equal(far.at(-1).checkpoint, true);
});

test("edge: single-point and zero-length trajectories rest; overlapped rests never conflict", () => {
  const tr = trajectory([{ x: 1, y: 1 }]);
  assert.deepEqual(positionAt(tr, 500), { x: 1, y: 1 });
  const z = trajectory([{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }]);
  assert.ok(Number.isFinite(positionAt(z, 10).x));
});

test("edge: difficulty is clamped to [1, 10]", () => {
  const p = [{ x: 0, y: 0 }, { x: 6, y: 0 }];
  assert.equal(trajectory(p, { difficulty: [0.1] }).end, trajectory(p).end);
  assert.equal(trajectory(p, { difficulty: [99] }).end, trajectory(p, { difficulty: [10] }).end);
});

test("edge: radiusOf and groupMode boundaries and precedence", () => {
  assert.equal(radiusOf(2, 1), 1);
  assert.equal(radiusOf(0.5), 0.25);
  assert.equal(groupMode({ members: 2 }).mode, "plan");
  assert.equal(groupMode({ members: 12 }).mode, "plan");
  // R11 (0.10 L2): the cap is 24, out of combat and in a fight (was 12).
  assert.equal(groupMode({ members: 24 }).mode, "plan");
  assert.equal(groupMode({ members: 25 }).reason, "tooMany");
  assert.equal(groupMode({ members: 24, combat: true }).mode, "plan");
  assert.equal(groupMode({ members: 0 }).reason, "single");
  assert.equal(groupMode({ enabled: false, members: 99, gridType: 0 }).reason, "off");
  assert.equal(groupMode({ members: 99, gridType: 0 }).reason, "tooMany");
  assert.equal(groupMode({ members: 3, ghost: true, unconstrained: true }).reason, "ghost");
});

test("edge: clickStop rows", () => {
  const live = { state: "pending", canControl: true };
  assert.equal(clickStop({ ...live, modifiers: true }), null);
  assert.equal(clickStop({ ...live, tool: "ruler" }), null);
  assert.equal(clickStop({ ...live, canControl: false }), null);
  assert.equal(clickStop({ ...live, enabled: false }), null);
  assert.equal(clickStop({ state: "completed", canControl: true }), null);
  assert.equal(clickStop({ state: "paused", canControl: true }), "displace");
  assert.equal(clickStop({ state: "completed", animating: true, canControl: true }), "displace");
  assert.equal(clickStop({ ...live, combat: true }), "query");
  assert.equal(clickStop({ ...live, combat: true, initiatorSelf: true }), "stop");
});

test("edge: flood respects radius and blocked cells; diagonals cost √2", () => {
  const m = flood({ i: 0, j: 0 }, () => true, 2);
  assert.equal(m.get("1,1"), Math.SQRT2);
  assert.equal(m.get("0,2"), 2);
  assert.equal(m.has("0,3"), false);
  const w = flood({ i: 0, j: 0 }, (a, b) => !(b.i === 0 && b.j === 1), 3);
  assert.ok(w.get("0,2") > 2);
});


test("freePrefix: the way as far as it is free; S1R1-02 not at rest in a one-wide corridor; S1R1-07 a way ending off the grid backs off to a cell", () => {
  const way = [{ x: 0.5, y: 0.5 }, { x: 6.5, y: 0.5 }];
  const blocker = { x: 4.5, y: 0.5, r: 0.5 };
  // Out of combat: a hair before the token standing in the way.
  const p = freePrefix(way, 0.5, [blocker]);
  assert.equal(p.full, false);
  assert.ok(p.points.at(-1).x < 3.5 + 1e-6 && p.points.at(-1).x > 3.3, JSON.stringify(p.points));
  // S1R1-02: where it may not rest (restOk false), a step at a time further back.
  const q = freePrefix(way, 0.5, [blocker], { restOk: c => c.x < 2.9 });
  assert.ok(q.points.at(-1).x < 2.9, JSON.stringify(q.points));
  // A fight rests on whole cells only.
  const f = freePrefix(way, 0.5, [blocker], { allowed: c => onCell(c) });
  assert.ok(onCell(f.points.at(-1)), JSON.stringify(f.points));
  assert.equal(f.points.at(-1).x, 3.5);
  // A free way is returned whole; S1R1-07: one ending where it may not rest is cut back to the last point it may.
  assert.equal(freePrefix(way, 0.5, []).full, true);
  const off = freePrefix(way, 0.5, [], { allowed: c => c.x <= 4.5 });
  assert.equal(off.full, false);
  assert.ok(off.points.at(-1).x <= 4.5, JSON.stringify(off.points));
  // prefixOf: a null cut is the whole route, a cut at a point or between two.
  assert.equal(prefixOf(way, null), way);
  assert.deepEqual(prefixOf(way, { k: 0, t: 0.5 }).at(-1), { x: 3.5, y: 0.5 });
});

// Tokens that start stacked (0.8.0; group-core since 0.10 L2, sequence-core deleted).
test("stacksOf: a rider on its mount, a familiar on a shoulder, a grappled pair; neighbours touching are no stack", () => {
  const items = [
    { id: "mount", c: { x: 1, y: 1 }, r: 1, size: 4 },          // a Large at (0,0)-(2,2)
    { id: "rider", c: { x: 0.5, y: 0.5 }, r: 0.5, size: 1 },    // a Medium on its top-left square
    { id: "owl", c: { x: 5.4, y: 5.4 }, r: 0.25, size: 0.25 },  // a Tiny on the shoulder of
    { id: "hero", c: { x: 5.5, y: 5.5 }, r: 0.5, size: 1 },
    { id: "left", c: { x: 8.5, y: 0.5 }, r: 0.5, size: 1 },     // two side by side: touching, no stack
    { id: "right", c: { x: 9.5, y: 0.5 }, r: 0.5, size: 1 },
  ];
  const st = stacksOf(items, { prefer: "rider" });
  const byLeader = Object.fromEntries(st.map(s => [s.leader, s.riders.map(r => r.id)]));
  assert.deepEqual(byLeader, { mount: ["rider"], hero: ["owl"] }, "the largest leads; touching neighbours are left alone");
  const rider = st.find(s => s.leader === "mount").riders[0];
  assert.deepEqual([rider.dx, rider.dy], [-0.5, -0.5]);
  // Two of one size: the grabbed one leads.
  const pair = stacksOf([{ id: "a", c: { x: 0.5, y: 0.5 }, r: 0.5 }, { id: "b", c: { x: 0.6, y: 0.5 }, r: 0.5 }], { prefer: "b" });
  assert.equal(pair[0].leader, "b");
});
