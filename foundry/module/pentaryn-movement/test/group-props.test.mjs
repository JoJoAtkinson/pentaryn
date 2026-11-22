// Randomized property tests and edge cases for the pure group planner (group-core.mjs, motion-core.mjs),
// seeded so a failure reproduces: the seed is in the message. Floors are random ASCII maps routed with the
// real pathfind-core A* (test/fixtures/grid.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member, finish } from "./fixtures/grid.mjs";
import { planGroup, assignSlots, hexCandidates, cellCandidates, flood, alongRoute, offRoute, delaySteps, GROUP_LIMITS } from "../group-core.mjs";
import { MOTION, trajectory, delayed, positionAt, firstConflict, minSeparation, waves, cellChain, dist, radiusOf, groupMode, clickStop } from "../motion-core.mjs";

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
function randomMap(rand, W = 16, H = 11) {
  const rows = [];
  for (let i = 0; i < H; i++) {
    let row = "";
    for (let j = 0; j < W; j++) row += (i === 0 || j === 0 || i === H - 1 || j === W - 1 || rand() < 0.12) ? "#" : ".";
    rows.push(row);
  }
  if (rand() < 0.6) {
    const col = 4 + Math.floor(rand() * (W - 8));
    const doors = new Set([1 + Math.floor(rand() * (H - 2)), 1 + Math.floor(rand() * (H - 2))]);
    for (let i = 1; i < H - 1; i++) rows[i] = rows[i].slice(0, col) + (doors.has(i) ? "." : "#") + rows[i].slice(col + 1);
  }
  return rows.join("\n");
}

function randomScenario(seed) {
  const rand = rng(seed);
  const ascii = randomMap(rand);
  const g = gridWorld(ascii);
  const cells = [];
  g.rows.forEach((r, i) => [...r].forEach((c, j) => { if (c !== "#") cells.push({ x: j + 0.5, y: i + 0.5 }); }));
  const n = 2 + Math.floor(rand() * 5);
  const pool = [...cells];
  const raw = [];
  for (let k = 0; k < n && pool.length; k++) {
    const p = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    raw.push({ id: `m${k}`, p, w: rand() < 0.12 ? 2 : 1 });
  }
  const target = cells[Math.floor(rand() * cells.length)];
  const anchorId = raw[Math.floor(rand() * raw.length)].id;
  const anchorRaw = raw.find(m => m.id === anchorId);
  const delta = { x: target.x - anchorRaw.p.x, y: target.y - anchorRaw.p.y };
  const ms = raw.map(m => member(m.id, m.p, delta, { w: m.w }));
  return { seed, ascii, g, ms, anchorId, combat: rand() < 0.2 };
}

const oracles = (g, anchor, extra = {}) => ({ walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route,
  toward: (m, f, t) => g.route(m, f, t), narrow: g.narrow, now: () => 0, ...extra });
const traj = e => delayed(trajectory(e.points), e.delay);

/** Drive a plan to the end, counting route calls (its "route" yields; the timing passes yield "time" too). */
function drive(gen) {
  let yields = 0;
  for (;;) {
    const s = gen.next();
    if (s.done) return { value: s.value, yields };
    if (s.value === "route") yields += 1;
  }
}

const SEEDS = Array.from({ length: 300 }, (_, k) => 1000 + k);
const stats = { plans: 0, core: 0, cut: 0, stayed: 0, excluded: 0 };

test("property: planning terminates, within the route-call bound and the wall-clock time box", () => {
  for (const seed of SEEDS) {
    const sc = randomScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const t = Date.now();
    const { value, yields } = drive(planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat }, oracles(sc.g, anchor)));
    const n = sc.ms.length;
    assert.ok(["plan", "core"].includes(value.result), `seed ${seed}`);
    // Routes, the way-that-ignores-tokens for those with none, lateral re-plans, and up to 3 other spots each (0.5.0).
    assert.ok(yields <= 2 + 3 * n + 2 * n * n + 3 * n, `seed ${seed}: ${yields} route calls for ${n} members`);
    assert.ok(Date.now() - t < GROUP_LIMITS.totalMs, `seed ${seed}: ${Date.now() - t} ms`);
    stats[value.result === "plan" ? "plans" : "core"] += 1;
  }
});

test("property: every planned path avoids walls, every slot is on floor, no two slots overlap at rest", () => {
  for (const seed of SEEDS) {
    const sc = randomScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const res = finish(planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat }, oracles(sc.g, anchor)));
    if (res.result !== "plan") continue;
    const byId = Object.fromEntries(sc.ms.map(m => [m.id, m]));
    // A member that stays where it stands (no way at all) does not move; its "slot" is its start.
    const planned = Object.values(res.members).filter(e => !e.core && e.level !== "stay");
    for (const e of planned) {
      const m = byId[e.id];
      for (let k = 1; k < e.points.length; k++) {
        assert.ok(sc.g.lineFits(e.points[k - 1], e.points[k], m.w, m.h), `seed ${seed}: ${e.id} segment ${k} crosses a wall\n${sc.ascii}\n${JSON.stringify(e.points)}`);
      }
      assert.ok(e.short || sc.g.walkable(m, e.slot), `seed ${seed}: ${e.id} slot ${JSON.stringify(e.slot)} is not on floor`);
      assert.deepEqual(e.points.at(-1), e.slot, `seed ${seed}: ${e.id} route ends at its slot`);
      assert.ok(Number.isInteger(e.delay / MOTION.delayStep) && e.delay >= 0, `seed ${seed}: delay ${e.delay}`);
    }
    for (let a = 0; a < planned.length; a++) for (let b = a + 1; b < planned.length; b++) {
      const ra = byId[planned[a].id].r, rb = byId[planned[b].id].r;
      if (planned[a].short || planned[b].short) continue;          // cut short: checked over time below (settle)
      assert.ok(dist(planned[a].slot, planned[b].slot) >= ra + rb - 1e-6, `seed ${seed}: ${planned[a].id}/${planned[b].id} overlap at rest\n${sc.ascii}`);
    }
    if (!res.members[sc.anchorId].short) assert.deepEqual(res.members[sc.anchorId].slot, anchor.formation, `seed ${seed}: anchor moved`);
    if (res.cut.length) stats.cut += 1;
    if (res.stayed.length) stats.stayed += 1;
    if (res.excluded.length) stats.excluded += 1;
  }
});

test("property: no two circles overlap at any sampled time (0.5.0: there is no relaxed plan any more)", () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const sc = randomScenario(seed);
    if (sc.combat) continue;
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const res = finish(planGroup({ members: sc.ms, anchorId: sc.anchorId }, oracles(sc.g, anchor)));
    if (res.result !== "plan") continue;
    const byId = Object.fromEntries(sc.ms.map(m => [m.id, m]));
    const list = Object.values(res.members).filter(e => !e.core);
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = traj(list[a]), B = traj(list[b]);
      const rr = byId[list[a].id].r + byId[list[b].id].r;
      const d0 = dist(positionAt(A, 0), positionAt(B, 0));
      // Pairs that start in contact may brush by MOTION.contact as one leaves (plan §13.3).
      const floor = (d0 < rr + 0.05 ? Math.min(d0, rr) - MOTION.contact : rr) - 1e-6;
      const end = Math.max(A.end, B.end);
      for (let t = 0; t <= end; t += 10) {
        const d = dist(positionAt(A, t), positionAt(B, t));
        assert.ok(d >= floor, `seed ${seed}: ${list[a].id}/${list[b].id} at ${t} ms are ${d.toFixed(3)} apart (need ${floor.toFixed(3)})\n${sc.ascii}`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 100, `only ${checked} pairs checked`);
});

test("property: firstConflict agrees with brute-force sampling (one batch: no latency shift)", () => {
  const rand = rng(42);
  const pt = () => ({ x: rand() * 6, y: rand() * 6 });
  for (let k = 0; k < 400; k++) {
    const A = trajectory([pt(), pt(), pt()], { delay: Math.floor(rand() * 5) * 150 });
    const B = trajectory([pt(), pt()], { delay: Math.floor(rand() * 5) * 150 });
    const hit = firstConflict(A, B, 0.5, 0.5, { sameWave: true });
    const d0 = dist(positionAt(A, 0), positionAt(B, 0));
    if (d0 < 1.3) continue;
    // The latency buffer only adds conflicts: in another wave, a pair clear there is clear in one batch.
    if (firstConflict(A, B, 0.5, 0.5, { sameWave: false }) === null) assert.equal(hit, null, `iteration ${k}: the buffer removed a conflict`);
    let brute = null;
    for (let t = 0; t <= Math.max(A.end, B.end) + 5; t += 0.5) {
      if (dist(positionAt(A, t), positionAt(B, t)) < 1 - 1e-3) { brute = t; break; }
    }
    if (brute === null) assert.ok(hit === null || hit.d > 1 - 1e-3, `iteration ${k}: false conflict at ${hit?.t}`);
    else {
      assert.notEqual(hit, null, `iteration ${k}: missed a conflict at ${brute}`);
      assert.ok(hit.t <= brute + 1, `iteration ${k}: reported ${hit.t}, brute ${brute}`);
    }
  }
});

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

const OPEN = `
##############
#............#
#............#
#............#
#............#
##############`;

test("edge: members already at their destination plan a no-op", () => {
  const g = gridWorld(OPEN);
  const ms = [member("a", { x: 3.5, y: 2.5 }, { x: 0, y: 0 }), member("b", { x: 4.5, y: 2.5 }, { x: 0, y: 0 })];
  const res = finish(planGroup({ members: ms, anchorId: "a" }, oracles(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.equal(res.members.a.delay, 0);
  assert.equal(res.members.b.delay, 0);
  assert.deepEqual(res.members.a.slot, ms[0].formation);
});

test("edge: an unknown anchor id is core; a lone member still plans", () => {
  const g = gridWorld(OPEN);
  const ms = [member("a", { x: 3.5, y: 2.5 }, { x: 4, y: 1 }), member("b", { x: 4.5, y: 2.5 }, { x: 4, y: 1 })];
  assert.deepEqual(finish(planGroup({ members: ms, anchorId: "nope" }, oracles(g, ms[0]))), { result: "core", reason: "noAnchor" });
  const solo = finish(planGroup({ members: [ms[0]], anchorId: "a" }, oracles(g, ms[0])));
  assert.equal(solo.result, "plan");
  assert.equal(solo.members.a.delay, 0);
});

test("edge: the anchor has no route (sealed off): core, with no partial plan", () => {
  const SEALED = `
#########
#..#....#
#..#....#
#########`;
  const g = gridWorld(SEALED);
  const ms = [member("a", { x: 1.5, y: 1.5 }, { x: 5, y: 0 }), member("b", { x: 2.5, y: 1.5 }, { x: 5, y: 0 })];
  const res = finish(planGroup({ members: ms, anchorId: "a" }, oracles(g, ms[0])));
  assert.equal(res.result, "core");
  assert.equal(res.members, undefined);
});

test("edge: twelve members (the maximum) in open ground all plan, nothing overlaps at rest", () => {
  const BIG = ["##################", ...Array.from({ length: 8 }, () => "#................#"), "##################"].join("\n");
  const g = gridWorld(BIG);
  const ms = Array.from({ length: 12 }, (_, k) => member(`m${k}`, { x: 1.5 + (k % 4), y: 1.5 + Math.floor(k / 4) }, { x: 8, y: 3 }));
  const res = finish(planGroup({ members: ms, anchorId: "m5" }, oracles(g, ms[5])));
  assert.equal(res.result, "plan");
  const list = Object.values(res.members);
  assert.equal(list.length, 12);
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) assert.ok(dist(list[a].slot, list[b].slot) >= 1 - 1e-6);
});

test("edge: a bystander on a formation spot: nobody rests inside it", () => {
  const g = gridWorld(OPEN);
  const d = { x: 6, y: 0 };
  const ms = [member("a", { x: 2.5, y: 2.5 }, d), member("b", { x: 2.5, y: 3.5 }, d)];
  const others = [{ x: 8.5, y: 3.5, r: 0.5 }];
  const res = finish(planGroup({ members: ms, anchorId: "a", others }, oracles(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.ok(dist(res.members.b.slot, others[0]) >= 1 - 1e-6);
  assert.deepEqual(res.reslotted, ["b"]);
});

test("edge: no free candidate for a non-anchor: it is reported missing, not stacked on the anchor", () => {
  const ms = [member("a", { x: 3.5, y: 2.5 }, { x: 0, y: 0 }), member("b", { x: 4.5, y: 2.5 }, { x: 0, y: 0 })];
  const res = assignSlots({ members: ms, anchorId: "a", walkable: (m, c) => dist(c, { x: 3.5, y: 2.5 }) < 0.2, walkDistance: () => 0, rings: 3 });
  assert.deepEqual(res.missing, ["b"]);
});

test("edge: ghost (straight) with every formation on one point nudges all but the anchor; none overlap", () => {
  const g = gridWorld(OPEN);
  const ms = Array.from({ length: 5 }, (_, k) => member(`m${k}`, { x: 1.5 + k, y: 1.5 }, { x: 0, y: 2 }));
  for (const m of ms) m.formation = { x: 8.5, y: 3.5 };
  const res = finish(planGroup({ members: ms, anchorId: "m0", mode: "straight" }, oracles(g, ms[0])));
  const slots = Object.values(res.members).map(e => e.slot);
  assert.deepEqual(res.members.m0.slot, { x: 8.5, y: 3.5 });
  for (let a = 0; a < slots.length; a++) for (let b = a + 1; b < slots.length; b++) assert.ok(dist(slots[a], slots[b]) >= 1 - 1e-6, `${a}/${b}`);
  for (const e of Object.values(res.members)) assert.equal(e.delay, 0);
});

test("edge: ghost with a mixed-size group and a bystander on the Large's spot", () => {
  const g = gridWorld(OPEN);
  const a = member("a", { x: 2.5, y: 2.5 }, { x: 6, y: 0 });
  const L = member("L", { x: 2, y: 4 }, { x: 6, y: 0 }, { w: 2 });
  const others = [{ x: 8, y: 4, r: 0.5 }];
  const res = finish(planGroup({ members: [a, L], anchorId: "a", mode: "straight", others }, oracles(g, a)));
  assert.ok(dist(res.members.L.slot, others[0]) >= 1.5 - 1e-6, `L at ${JSON.stringify(res.members.L.slot)}`);
});

test("edge: candidates never include the centre and stay unique", () => {
  const key = p => `${p.x.toFixed(4)},${p.y.toFixed(4)}`;
  const hex = hexCandidates({ x: 5, y: 5 }, 1.1);
  assert.equal(new Set(hex.map(key)).size, hex.length);
  assert.ok(hex.every(p => dist(p, { x: 5, y: 5 }) > 1e-6));
  const cells = cellCandidates({ x: 5, y: 5 }, 1, 1);
  assert.ok(cells.length > 0);
  assert.equal(new Set(cells.map(key)).size, cells.length);
  assert.ok(cells.every(p => p.x !== 5 || p.y !== 5));
});

test("edge: alongRoute / offRoute on a degenerate route do not NaN", () => {
  for (const route of [[{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 1, y: 1 }]]) {
    assert.ok(Number.isFinite(alongRoute(route, { x: 3, y: 3 })));
    assert.ok(Number.isFinite(offRoute(route, { x: 3, y: 3 })));
  }
});

test("edge: waves bucket negative and zero delays at 0, exact multiples in place, empty to empty", () => {
  assert.deepEqual(waves({ a: 0, b: -50, c: 150, d: 151, e: 300 }), [
    { at: 0, ids: ["a", "b"] }, { at: 150, ids: ["c"] }, { at: 300, ids: ["d", "e"] }]);
  assert.deepEqual(waves({}), []);
});

test("edge: delaySteps covers 0..max inclusive", () => {
  const s = delaySteps();
  assert.equal(s[0], 0);
  assert.equal(s.at(-1), MOTION.maxDelay);
  assert.equal(s.length, MOTION.maxDelay / MOTION.delayStep + 1);
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
  assert.equal(minSeparation(trajectory([{ x: 0, y: 0 }]), trajectory([{ x: 3, y: 4 }])), 5);
  assert.equal(firstConflict(trajectory([{ x: 0, y: 0 }]), trajectory([{ x: 3, y: 4 }]), 0.5, 0.5), null);
  assert.equal(firstConflict(trajectory([{ x: 0, y: 0 }]), trajectory([{ x: 0, y: 0 }]), 0.5, 0.5), null);
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

test.after(() => console.log("# property stats", JSON.stringify(stats)));

/* -------------------------------------------- */
/*  0.5.0: hard obstacles                       */
/* -------------------------------------------- */

/**
 * A random scenario with tokens outside the group: some standing (on floor cells nobody starts on), some walking
 * now (a straight walk between two floor cells, from the drop), in and out of combat.
 */
function crowdScenario(seed) {
  const sc = randomScenario(seed);
  const rand = rng(seed * 7 + 3);
  const cells = [];
  sc.g.rows.forEach((r, i) => [...r].forEach((c, j) => { if (c !== "#") cells.push({ x: j + 0.5, y: i + 0.5 }); }));
  const clearOf = (c, list, gap = 0) => list.every(q => dist(c, q.p ?? q) >= 0.5 + (q.r ?? 0.5) + gap - 1e-6);
  const starts = sc.ms.map(m => ({ p: m.start, r: m.r }));
  const others = [];
  const nOthers = Math.floor(rand() * 6);
  for (let k = 0; k < 40 && others.length < nOthers; k++) {
    const c = cells[Math.floor(rand() * cells.length)];
    if (clearOf(c, starts) && clearOf(c, others)) others.push({ id: `o${others.length}`, x: c.x, y: c.y, r: 0.5 });
  }
  const moving = [];
  if (rand() < 0.4) {
    const a = cells[Math.floor(rand() * cells.length)], b = cells[Math.floor(rand() * cells.length)];
    if (clearOf(a, starts) && clearOf(a, others) && sc.g.lineFits(a, b) && dist(a, b) > 1) moving.push({ id: "w0", r: 0.5, points: [a, b], speed: 6 });
  }
  return { ...sc, others, moving };
}

/** The floor two circles must keep (firstConflict's rule without the latency shift): touching, or held if they start closer. */
function floorFor(A, B, rr) {
  const d0 = dist(positionAt(A, 0), positionAt(B, 0));
  return (d0 < rr + 0.05 ? Math.min(d0, rr) - MOTION.contact : rr) - 1e-6;
}

const CROWD_SEEDS = Array.from({ length: 300 }, (_, k) => 5000 + k);

test("property (0.5.0): nothing overlaps a standing token, a walking one or another member at any sampled time, in or out of combat", () => {
  let checked = 0, withOthers = 0;
  for (const seed of CROWD_SEEDS) {
    const sc = crowdScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const res = finish(planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat, others: sc.others, moving: sc.moving }, oracles(sc.g, anchor)));
    if (res.result !== "plan") continue;
    if (sc.others.length) withOthers += 1;
    const byId = Object.fromEntries(sc.ms.map(m => [m.id, m]));
    const list = Object.values(res.members);
    const tr = e => delayed(trajectory(e.points, { speed: byId[e.id].speed }), e.delay);
    const fixed = [...sc.others.map(o => ({ id: o.id, r: o.r, T: trajectory([o]) })), ...sc.moving.map(w => ({ id: w.id, r: w.r, T: trajectory(w.points), walker: true }))];
    for (const e of list) {
      assert.ok(!e.core, `seed ${seed}: ${e.id} is never core's walk`);
      const A = tr(e);
      for (const f of fixed) {
        if (f.walker && A.end <= A.start) continue;              // standing still: the walker's own planner answers
        const rr = byId[e.id].r + f.r, floor = floorFor(A, f.T, rr);
        for (let t = 0; t <= Math.max(A.end, f.T.end) + 20; t += 10) {
          const d = dist(positionAt(A, t), positionAt(f.T, t));
          assert.ok(d >= floor, `seed ${seed}: ${e.id} and ${f.id} ${d.toFixed(3)} apart at ${t} ms (need ${floor.toFixed(3)})\n${sc.ascii}\n${JSON.stringify({ e, others: sc.others, moving: sc.moving })}`);
        }
        checked += 1;
      }
    }
    for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
      const A = tr(list[a]), B = tr(list[b]);
      const rr = byId[list[a].id].r + byId[list[b].id].r, floor = floorFor(A, B, rr);
      for (let t = 0; t <= Math.max(A.end, B.end) + 20; t += 10) {
        const d = dist(positionAt(A, t), positionAt(B, t));
        assert.ok(d >= floor, `seed ${seed}: ${list[a].id}/${list[b].id} ${d.toFixed(3)} apart at ${t} ms (need ${floor.toFixed(3)})\n${sc.ascii}`);
      }
      checked += 1;
    }
  }
  assert.ok(checked > 500, `only ${checked} pairs checked`);
  assert.ok(withOthers > 100, `only ${withOthers} plans with standing tokens`);
});

test("property (0.5.0): every walk stays clear of walls, and a member's way never enters a standing token's circle", () => {
  for (const seed of CROWD_SEEDS) {
    const sc = crowdScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const res = finish(planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat, others: sc.others }, oracles(sc.g, anchor)));
    if (res.result !== "plan") continue;
    for (const e of Object.values(res.members)) {
      const m = sc.ms.find(x => x.id === e.id);
      for (let k = 1; k < e.points.length; k++) assert.ok(sc.g.lineFits(e.points[k - 1], e.points[k], m.w, m.h), `seed ${seed}: ${e.id} leg ${k} crosses a wall`);
      const live = sc.others.filter(o => dist(m.start, o) >= m.r + o.r - 1e-6);
      for (let k = 1; k < e.points.length; k++) for (const o of live) {
        const p = e.points[k - 1], q = e.points[k];
        const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
        const t = L2 ? Math.min(Math.max(((o.x - p.x) * (q.x - p.x) + (o.y - p.y) * (q.y - p.y)) / L2, 0), 1) : 0;
        const d = Math.hypot(o.x - (p.x + (q.x - p.x) * t), o.y - (p.y + (q.y - p.y) * t));
        assert.ok(d >= m.r + o.r - 1e-3, `seed ${seed}: ${e.id} walks ${d.toFixed(3)} from standing ${o.id}`);
      }
      // In a fight every walk ends on a whole square (or does not move).
      if (sc.combat && e.points.length > 1) {
        const end = e.points.at(-1);
        assert.ok([end.x - m.w / 2, end.y - m.h / 2].every(v => Math.abs(v - Math.round(v)) < 1e-6), `seed ${seed}: ${e.id} rests off the grid in a fight ${JSON.stringify(end)}`);
      }
    }
  }
});

test("property (0.5.0): liveness — every plan finishes inside its budget and every member is at rest within a bounded time", () => {
  for (const seed of CROWD_SEEDS) {
    const sc = crowdScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    let steps = 0;
    const gen = planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat, others: sc.others, moving: sc.moving }, oracles(sc.g, anchor));
    let s;
    const t0 = Date.now();
    do { s = gen.next(); steps += 1; } while (!s.done && steps < 100000);
    assert.ok(s.done, `seed ${seed}: the plan never finished`);
    assert.ok(Date.now() - t0 < GROUP_LIMITS.totalMs, `seed ${seed}: ${Date.now() - t0} ms`);
    const res = s.value;
    if (res.result !== "plan") { assert.ok(["core"].includes(res.result)); continue; }
    assert.equal(Object.keys(res.members).length, sc.ms.length, `seed ${seed}: every member has an entry`);
    for (const e of Object.values(res.members)) {
      assert.ok(Number.isFinite(e.delay) && e.delay >= 0, `seed ${seed}: ${e.id} delay ${e.delay}`);
      const end = delayed(trajectory(e.points, { speed: 6 }), e.delay).end;
      // The longest wait: the delay cap, then go-last and twice the cap past it, plus the walk.
      assert.ok(end <= 4 * MOTION.maxDelay + 20000, `seed ${seed}: ${e.id} at rest only after ${Math.round(end)} ms`);
    }
  }
});

test("hard obstacles: a token standing in the only corridor: nobody walks through it; they stop short before it", () => {
  const g = gridWorld(`
##########################
#.....####################
#.....####################
#.........................
#.....####################
#.....####################
##########################`);
  const d = { x: 15, y: 0 };
  const ms = [member("a", { x: 4.5, y: 3.5 }, d), member("b", { x: 4.5, y: 2.5 }, d)];
  const others = [{ id: "x", x: 12.5, y: 3.5, r: 0.5 }];
  const res = finish(planGroup({ members: ms, anchorId: "a", others }, oracles(g, ms[0])));
  assert.equal(res.result, "plan");
  assert.equal(res.anchorShort, true, "the grabbed one cannot get there");
  for (const e of Object.values(res.members)) {
    assert.ok(e.short, `${e.id} stops short`);
    assert.ok(e.slot.x <= 11.5 + 1e-6, `${e.id} rests before the token: ${JSON.stringify(e.slot)}`);
    const A = delayed(trajectory(e.points), e.delay);
    for (let t = 0; t <= A.end + 10; t += 5) assert.ok(dist(positionAt(A, t), others[0]) >= 1 - 1e-6);
  }
  assert.ok(dist(res.members.a.slot, res.members.b.slot) >= 1 - 1e-6, "and not on each other");
  // In a fight too, each on a whole square.
  const fight = finish(planGroup({ members: ms, anchorId: "a", others, combat: true }, oracles(g, ms[0])));
  for (const e of Object.values(fight.members)) {
    assert.ok(e.slot.x <= 11.5 + 1e-6);
    assert.ok(Number.isInteger(e.slot.x - 0.5) && Number.isInteger(e.slot.y - 0.5), `${e.id} on a square: ${JSON.stringify(e.slot)}`);
  }
});

test("hard obstacles: no way round a token is never swapped for the way through it, however long the way round", () => {
  const g = gridWorld(`
###############
#.............#
#.............#
#.............#
#######.#######
#.............#
#.............#
#.............#
###############`);
  const d = { x: 0, y: 4 };
  const ms = [member("a", { x: 7.5, y: 2.5 }, d), member("b", { x: 6.5, y: 2.5 }, d)];
  // A token standing in the door: the way through the door is shut for them both.
  const others = [{ id: "door", x: 7.5, y: 4.5, r: 0.5 }];
  const res = finish(planGroup({ members: ms, anchorId: "a", others }, oracles(g, ms[0])));
  assert.equal(res.result, "plan");
  for (const e of Object.values(res.members)) {
    assert.ok(e.slot.y < 4, `${e.id} stays in the upper room: ${JSON.stringify(e.slot)}`);
    for (let k = 1; k < e.points.length; k++) assert.ok(e.points[k].y < 4.5);
  }
});

test("settle: a walk that would still meet a member at rest is cut back before it, and one that cannot move stays", async () => {
  const { settle } = await import("../group-core.mjs");
  // b rests at (5, 0); a walks along y = 0 from 0 to 10 straight through it.
  const list = [
    { id: "b", r: 0.5, points: [{ x: 5, y: 0 }], delay: 0 },
    { id: "a", r: 0.5, points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], delay: 0 },
  ];
  const gen = settle(list, {});
  let s; do s = gen.next(); while (!s.done);
  const a = s.value.get("a");
  assert.equal(a.changed, true);
  assert.ok(a.points.at(-1).x <= 4 + 1e-6, `a stops before b: ${JSON.stringify(a.points.at(-1))}`);
  assert.equal(s.value.get("b").changed, false);
  // A standing token on a's start side and b on its way: a cannot move at all past b, and is never pushed through.
  const gen2 = settle([{ id: "a", r: 0.5, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }], delay: 0 }], { statics: [{ x: 1.2, y: 0, r: 0.5 }] });
  let s2; do s2 = gen2.next(); while (!s2.done);
  assert.ok(s2.value.get("a").points.at(-1).x <= 0.2 + 1e-6);
  // In a fight it rests on whole squares only.
  const gen3 = settle([{ id: "b", r: 0.5, points: [{ x: 5.5, y: 0.5 }], delay: 0 }, { id: "a", r: 0.5, w: 1, h: 1, points: [{ x: 0.5, y: 0.5 }, { x: 9.5, y: 0.5 }], delay: 0 }],
    { combat: true, allowedFor: m => c => [c.x - 0.5, c.y - 0.5].every(v => Math.abs(v - Math.round(v)) < 1e-6) });
  let s3; do s3 = gen3.next(); while (!s3.done);
  const end = s3.value.get("a").points.at(-1);
  assert.ok(Number.isInteger(end.x - 0.5) && end.x <= 4.5 + 1e-6, `a on a square before b: ${JSON.stringify(end)}`);
});

test("freePrefix / prefixOf / composeCut: the way as far as it is free, cuts composed", async () => {
  const { freePrefix, prefixOf, composeCut, firstIntrusion } = await import("../group-core.mjs");
  const pts = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
  assert.equal(firstIntrusion(pts, 0.5, []), null);
  const hit = firstIntrusion(pts, 0.5, [{ x: 4, y: 2, r: 0.5 }]);
  assert.equal(hit.k, 1);
  assert.ok(Math.abs(hit.t - 0.25) < 1e-6, JSON.stringify(hit));
  const p = freePrefix(pts, 0.5, [{ x: 4, y: 2, r: 0.5 }]);
  assert.equal(p.full, false);
  assert.ok(Math.abs(p.points.at(-1).y - 1) < 0.02 && p.points.at(-1).y <= 1);
  // A circle it starts on is not in its way.
  assert.equal(freePrefix(pts, 0.5, [{ x: 0.2, y: 0, r: 0.5 }]).full, true);
  // On whole cells: back to the last allowed point.
  const cells = freePrefix([{ x: 0.5, y: 0.5 }, { x: 6.5, y: 0.5 }], 0.5, [{ x: 4.2, y: 0.5, r: 0.5 }], { allowed: c => Number.isInteger(c.x - 0.5) });
  assert.deepEqual(cells.points.at(-1), { x: 2.5, y: 0.5 }, "the circle reaches to x 3.2: the last whole square before it");
  // Composition: cut half way along the second leg, then half way along that cut's last leg = a quarter of the leg.
  const outer = { k: 1, t: 0.5 };
  const inner = { k: 1, t: 0.5 };
  assert.deepEqual(prefixOf(pts, composeCut(outer, inner)).at(-1), { x: 4, y: 1 });
  assert.deepEqual(prefixOf(pts, composeCut(outer, { k: 0, t: 0.5 })).at(-1), { x: 2, y: 0 });
  assert.deepEqual(prefixOf(pts, { k: 0, t: 0 }), [{ x: 0, y: 0 }]);
});
