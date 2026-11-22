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

const oracles = (g, anchor, extra = {}) => ({ walkable: g.walkable, walkDistance: g.walkDistanceFrom(anchor.formation), route: g.route, narrow: g.narrow, now: () => 0, ...extra });
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
const stats = { plans: 0, core: 0, relaxed: 0, excluded: 0 };

test("property: planning terminates, within the route-call bound and the wall-clock time box", () => {
  for (const seed of SEEDS) {
    const sc = randomScenario(seed);
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const t = Date.now();
    const { value, yields } = drive(planGroup({ members: sc.ms, anchorId: sc.anchorId, combat: sc.combat }, oracles(sc.g, anchor)));
    const n = sc.ms.length;
    assert.ok(["plan", "core"].includes(value.result), `seed ${seed}`);
    assert.ok(yields <= 1 + 2 * n + 2 * n * n, `seed ${seed}: ${yields} route calls for ${n} members`);
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
    const planned = Object.values(res.members).filter(e => !e.core);
    for (const e of planned) {
      const m = byId[e.id];
      for (let k = 1; k < e.points.length; k++) {
        assert.ok(sc.g.lineFits(e.points[k - 1], e.points[k], m.w, m.h), `seed ${seed}: ${e.id} segment ${k} crosses a wall\n${sc.ascii}\n${JSON.stringify(e.points)}`);
      }
      assert.ok(sc.g.walkable(m, e.slot), `seed ${seed}: ${e.id} slot ${JSON.stringify(e.slot)} is not on floor`);
      assert.deepEqual(e.points.at(-1), e.slot, `seed ${seed}: ${e.id} route ends at its slot`);
      assert.ok(Number.isInteger(e.delay / MOTION.delayStep) && e.delay >= 0, `seed ${seed}: delay ${e.delay}`);
    }
    for (let a = 0; a < planned.length; a++) for (let b = a + 1; b < planned.length; b++) {
      const ra = byId[planned[a].id].r, rb = byId[planned[b].id].r;
      assert.ok(dist(planned[a].slot, planned[b].slot) >= ra + rb - 1e-6, `seed ${seed}: ${planned[a].id}/${planned[b].id} overlap at rest\n${sc.ascii}`);
    }
    assert.deepEqual(res.members[sc.anchorId].slot, anchor.formation, `seed ${seed}: anchor moved`);
    if (res.relaxed) stats.relaxed += 1;
    if (res.excluded.length) stats.excluded += 1;
  }
});

test("property: when nothing relaxed, no two circles overlap at any sampled time", () => {
  let checked = 0;
  for (const seed of SEEDS) {
    const sc = randomScenario(seed);
    if (sc.combat) continue;
    const anchor = sc.ms.find(m => m.id === sc.anchorId);
    const res = finish(planGroup({ members: sc.ms, anchorId: sc.anchorId }, oracles(sc.g, anchor)));
    if (res.result !== "plan" || res.relaxed) continue;
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

test("property: firstConflict agrees with brute-force sampling", () => {
  const rand = rng(42);
  const pt = () => ({ x: rand() * 6, y: rand() * 6 });
  for (let k = 0; k < 400; k++) {
    const A = trajectory([pt(), pt(), pt()], { delay: Math.floor(rand() * 5) * 150 });
    const B = trajectory([pt(), pt()], { delay: Math.floor(rand() * 5) * 150 });
    const sameWave = rand() < 0.5;
    const hit = firstConflict(A, B, 0.5, 0.5, { sameWave });
    const d0 = dist(positionAt(A, 0), positionAt(B, 0));
    if (d0 < 1.3) continue;
    const lim = sameWave ? 1 : 1.25;
    let brute = null;
    for (let t = 0; t <= Math.max(A.end, B.end) + 5; t += 0.5) {
      const moving = t > Math.max(A.start, B.start) && t < Math.min(A.end, B.end);
      if (dist(positionAt(A, t), positionAt(B, t)) < (moving ? lim : 1) - 1e-3) { brute = t; break; }
    }
    if (brute === null) assert.equal(hit, null, `iteration ${k}: false conflict at ${hit?.t}`);
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
