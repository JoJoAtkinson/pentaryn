// The start delays (file-core staggerFile, 0.9 B1; unchanged in 0.10 L1) on the leader plan's routes (planLead; its own
// gate is lead.test.mjs). Routed with the real pathfind-core A* (test/fixtures/grid.mjs). Seeded: a failure names its
// seed. (0.10 L1: the 0.9 B0 planner's tests went with it: planFile, orderOf, candidatesFor, waveWays.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld } from "./fixtures/grid.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";
import { STAGGER, planLead, staggerFile } from "../file-core.mjs";
import { delayed, dist, minSeparation, trajectory } from "../motion-core.mjs";

const EPS = 1e-6;

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

/** The oracles planLead asks, on a grid world (as file.mjs: a circle the member starts inside is left out). */
const oraclesOf = g => ({
  walkable: g.walkable,
  step: (a, b) => g.free(b.i, b.j) && (a.i === b.i || a.j === b.j || (g.free(a.i, b.j) && g.free(b.i, a.j))),
  route: (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(c => dist(c, from) >= c.r) })?.points ?? null,
});

/** A member record: id, start centre, size. */
const member = (id, start, w = 1) => ({ id, w, h: w, r: w / 2, start, speed: 6 });

/** A random W×H floor: a walled border, scattered pillars, an optional full wall with one or two doors. */
function randomMap(rand, W = 18, H = 12) {
  const rows = [];
  for (let i = 0; i < H; i++) {
    let row = "";
    for (let j = 0; j < W; j++) row += (i === 0 || j === 0 || i === H - 1 || j === W - 1 || rand() < 0.1) ? "#" : ".";
    rows.push(row);
  }
  if (rand() < 0.7) {
    const col = 5 + Math.floor(rand() * (W - 10));
    const doors = new Set([1 + Math.floor(rand() * (H - 2)), 1 + Math.floor(rand() * (H - 2))]);
    for (let i = 1; i < H - 1; i++) rows[i] = rows[i].slice(0, col) + (doors.has(i) ? "." : "#") + rows[i].slice(col + 1);
  }
  return rows.join("\n");
}

/** A seeded drop: 2-8 members (some 2x2), 0-4 tokens standing outside it, the grabbed one dropped on a random floor cell. */
function scenario(seed, ascii = null) {
  const rand = rng(seed);
  const map = ascii ?? randomMap(rand);
  const g = gridWorld(map);
  const cells = [];
  g.rows.forEach((r, i) => [...r].forEach((c, j) => { if (c !== "#") cells.push({ x: j + 0.5, y: i + 0.5 }); }));
  const pool = [...cells];
  const take = () => pool.splice(Math.floor(rand() * pool.length), 1)[0];
  const raw = [];
  const n = 2 + Math.floor(rand() * 7);
  for (let k = 0; k < n && pool.length; k++) {
    const p = take();
    const big = rand() < 0.12 && g.walkable({ w: 2, h: 2 }, { x: p.x + 0.5, y: p.y + 0.5 });
    raw.push({ id: `m${k}`, p: big ? { x: p.x + 0.5, y: p.y + 0.5 } : p, w: big ? 2 : 1 });
  }
  // Members never start overlapping one another (a stack walks as its leader, drop.mjs).
  const ms0 = raw.filter((m, k) => raw.slice(0, k).every(o => dist(o.p, m.p) >= (o.w + m.w) / 2 - EPS));
  const standing = [];
  for (let k = 0, s = Math.floor(rand() * 5); k < s && pool.length; k++) {
    const p = take();
    if (ms0.every(m => dist(m.p, p) >= m.w / 2 + 0.5 - EPS)) standing.push({ id: `s${k}`, x: p.x, y: p.y, r: 0.5 });
  }
  const target = cells[Math.floor(rand() * cells.length)];
  const anchor = ms0[0];
  const drop = anchor.w === 2 ? { x: target.x + 0.5, y: target.y + 0.5 } : target;
  const members = ms0.map(m => member(m.id, m.p, m.w));
  return { seed, map, g, members, standing, anchorId: anchor.id, drop };
}

/** The leader plan of a scenario. */
const planOf = sc => planLead({ members: sc.members, leaderId: sc.anchorId, drop: sc.drop, standing: sc.standing }, oraclesOf(sc.g));

/* The start delays (0.9 B1, §4 step 3) on the leader plan's routes. */

/** B1's walks for a plan: the members that move, in plan order. */
const walksOf = (sc, plan) => plan.order.map(id => sc.members.find(m => m.id === id))
  .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
  .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed }));

/** The delays' gate for one plan: every delay a wave step, the last within the cap, every mover timed. */
function checkStagger(sc, plan, t, capMs = STAGGER.capMs) {
  const why = `seed ${sc.seed}`;
  const walks = walksOf(sc, plan);
  assert.deepEqual(Object.keys(t.delays).sort(), walks.map(w => w.id).sort(), `${why}: every member that moves has a delay`);
  for (const [id, d] of Object.entries(t.delays)) {
    assert.ok(d >= 0 && d <= capMs + 1e-6, `${why}: ${id} starts at ${d} ms (cap ${capMs})`);
    assert.ok(Math.abs(d / STAGGER.stepMs - Math.round(d / STAGGER.stepMs)) < 1e-9, `${why}: ${id}'s delay ${d} is a wave step`);
  }
  assert.ok(t.total <= capMs + 1e-6, `${why}: total stagger ${t.total} ms`);
  assert.deepEqual([...t.order].sort(), walks.map(w => w.id).sort(), `${why}: the start order holds every mover`);
}

/** How deep two members of a file overlap while both move (soft, reported): the largest depth over every pair. */
function moverDepth(walks, delays) {
  let worst = 0;
  const trs = walks.map(w => ({ w, tr: delayed(trajectory(w.points, { speed: w.speed }), delays[w.id] ?? 0) }));
  for (let i = 0; i < trs.length; i++) for (let j = i + 1; j < trs.length; j++) {
    worst = Math.max(worst, trs[i].w.r + trs[j].w.r - minSeparation(trs[i].tr, trs[j].tr));
  }
  return worst;
}

// 0.9's "on open ground every delay is 0" was for formation routes side by side; on the leader plan the pack converges
// behind the leader, and R5 (decisions 2026-11-24) wants the leader in the drop's own update and the pack one wave
// later: L2 builds that timing (todo until then).
test("open ground (R5, L2): the leader goes in the drop's own update, the pack one wave (150 ms) later, nobody later than that", { todo: "L2: the motion (0.10 R5) replaces 0.9's staggerFile" }, () => {
  const g = gridWorld(`
####################
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
####################`);
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const n = 2 + Math.floor(rand() * 6);
    const delta = { x: Math.floor(rand() * 9) - 4, y: Math.floor(rand() * 5) - 2 };
    if (!delta.x && !delta.y) delta.x = 3;
    // A loose formation: members two squares apart in a 3-wide block, dropped where it fits whole.
    const ms = [];
    for (let k = 0; k < n; k++) ms.push(member(`m${k}`, { x: 7.5 + 2 * (k % 3), y: 2.5 + 2 * Math.floor(k / 3) }));
    const sc = { seed, g, members: ms, standing: [], anchorId: "m0", drop: { x: 7.5 + delta.x, y: 2.5 + delta.y } };
    const plan = planOf(sc);
    const t = staggerFile(walksOf(sc, plan));
    checkStagger(sc, plan, t);
    assert.equal(t.delays.m0, 0, `seed ${seed}: the leader at once`);
    assert.ok(t.total <= STAGGER.stepMs, `seed ${seed}: open ground, the pack one wave later: ${JSON.stringify(t.delays)}`);
  }
});

test("B1: through one door the file staggers (the deeper ones wait their turn), the last within 4 s, and the movers meet less than all at once", () => {
  const g = gridWorld(`
############
#..........#
#..........#
#####.######
#..........#
#..........#
############`);
  const delta = { x: 0, y: 3 };
  const ms = [member("a", { x: 5.5, y: 1.5 }), member("b", { x: 4.5, y: 1.5 }), member("c", { x: 6.5, y: 1.5 }), member("d", { x: 5.5, y: 2.5 })];
  const sc = { seed: "door", g, members: ms, standing: [], anchorId: "a", drop: { x: 5.5 + delta.x, y: 1.5 + delta.y } };
  const plan = planOf(sc);
  const walks = walksOf(sc, plan);
  const t = staggerFile(walks);
  checkStagger(sc, plan, t);
  assert.ok(t.total > 0, `a door files them: ${JSON.stringify(t.delays)}`);
  assert.equal(Object.values(t.delays).filter(d => d === 0).length >= 1, true, "someone goes at once");
  const zero = Object.fromEntries(walks.map(w => [w.id, 0]));
  assert.ok(moverDepth(walks, t.delays) <= moverDepth(walks, zero) + 1e-6, `B1 no worse than B0: ${moverDepth(walks, t.delays)} vs ${moverDepth(walks, zero)}`);
});

test("B1: a cap shorter than the file's needs is honoured (never a cut): the crowded ones go at the least crowded step under it", () => {
  const g = gridWorld(`
############
#..........#
#..........#
#####.######
#..........#
#..........#
############`);
  const delta = { x: 0, y: 3 };
  const ms = [0, 1, 2, 3, 4, 5].map(k => member(`m${k}`, { x: 2.5 + k, y: 1.5 + (k % 2) }));
  const sc = { seed: "cap", g, members: ms, standing: [], anchorId: "m0", drop: { x: 2.5 + delta.x, y: 1.5 + delta.y } };
  const plan = planOf(sc);
  const t = staggerFile(walksOf(sc, plan), { capMs: 300 });
  checkStagger(sc, plan, t, 300);
  for (const w of walksOf(sc, plan)) assert.ok(plan.members[w.id].points.length >= 2, "every planned member still goes");
});

test("B1 gate (600 seeded drops on random floors, 200 in the dungeon, on the leader plan's routes): total stagger at most 4 s; every mover timed; mover overlap reported, B1 no worse than B0", () => {
  let worse = 0, b0 = 0, b1 = 0, filed = 0, drops = 0, maxTotal = 0, met0 = 0, met1 = 0;
  for (const [from, to, map] of [[1, 600, null], [1001, 1200, DUNGEON]]) {
    for (let seed = from; seed <= to; seed++) {
      const sc = scenario(seed, map);
      const plan = planOf(sc);
      const walks = walksOf(sc, plan);
      const t = staggerFile(walks);
      checkStagger(sc, plan, t);
      drops += 1;
      maxTotal = Math.max(maxTotal, t.total);
      if (t.total > 0) filed += 1;
      const d0 = moverDepth(walks, Object.fromEntries(walks.map(w => [w.id, 0])));
      const d1 = moverDepth(walks, t.delays);
      b0 = Math.max(b0, d0); b1 = Math.max(b1, d1);
      if (d0 > 0.05) met0 += 1;
      if (d1 > 0.05) met1 += 1;
      if (d1 > d0 + 1e-6) worse += 1;
    }
  }
  if (process.env.PM_STATS) console.log({ stagger: { drops, filed, maxTotal, movers: { b0: met0, b1: met1 }, worstDepthB0: b0, worstDepthB1: b1, worse } });
  assert.ok(maxTotal <= STAGGER.capMs, `max total ${maxTotal}`);
  // Soft, measured: the deepest two-mover overlap of a drop is no deeper staggered than all at once, in nearly every drop.
  assert.ok(worse <= drops * 0.05, `${worse} of ${drops} drops overlap deeper staggered than all at once`);
  assert.ok(met1 <= met0, `drops where two movers meet: B1 ${met1}, B0 ${met0}`);
});

