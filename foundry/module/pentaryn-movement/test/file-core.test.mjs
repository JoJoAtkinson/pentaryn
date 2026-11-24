// The start delays (file-core staggerFile, 0.10 L2: Joe's R5, the leader at once and the pack one wave later, single
// file only at a narrow point) on the leader plan's routes (planLead; its own gate is lead.test.mjs). Routed with the
// real pathfind-core A* (test/fixtures/grid.mjs). Seeded: a failure names its seed. (0.10 L1: the 0.9 B0 planner's
// tests went with it; L2: B0, the ordering search and 0.9's staggered-start tests.)
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld } from "./fixtures/grid.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";
import { STAGGER, narrowZones, planLead, routeEnters, staggerFile } from "../file-core.mjs";
import { closeTime, delayed, dist, nearestWhile, positionAt, trajectory } from "../motion-core.mjs";

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

/* The start delays (0.10 L2, R5) on the leader plan's routes. */

/** The walks staggerFile times for a plan: the members that move, in plan order. */
const walksOf = (sc, plan) => plan.order.map(id => sc.members.find(m => m.id === id))
  .filter(m => plan.members[m.id]?.points?.length >= 2 && !plan.members[m.id].stay)
  .map(m => ({ id: m.id, r: m.r, points: plan.members[m.id].points, speed: m.speed, left: plan.members[m.id].left }));
/** staggerFile as file.mjs calls it: the leader, the narrow points from the same step oracle planLead uses. */
const timeOf = (sc, plan, o = {}) => staggerFile(walksOf(sc, plan), { leaderId: plan.leader, step: oraclesOf(sc.g).step, ...o });

/** The delays' gate for one plan: every delay a wave step, the leader at 0, nobody before the pack, the last within the cap. */
function checkStagger(sc, plan, t, capMs = STAGGER.capMs) {
  const why = `seed ${sc.seed}`;
  const walks = walksOf(sc, plan);
  assert.deepEqual(Object.keys(t.delays).sort(), walks.map(w => w.id).sort(), `${why}: every member that moves has a delay`);
  for (const [id, d] of Object.entries(t.delays)) {
    assert.ok(d >= 0 && d <= capMs + 1e-6, `${why}: ${id} starts at ${d} ms (cap ${capMs})`);
    assert.ok(Math.abs(d / STAGGER.stepMs - Math.round(d / STAGGER.stepMs)) < 1e-9, `${why}: ${id}'s delay ${d} is a wave step`);
    if (id === plan.leader) assert.equal(d, 0, `${why}: the leader goes in the drop's own update`);
    else assert.ok(d >= t.pack - 1e-6, `${why}: ${id} at ${d}, before the pack (${t.pack})`);
  }
  assert.ok(t.total <= capMs + 1e-6, `${why}: the last start ${t.total} ms`);
  assert.deepEqual(t.order, walks.map(w => w.id), `${why}: the start order is the plan's`);
}

/**
 * The timed motion, sampled every 10 ms (an independent check of what staggerFile promises): `rest` — a member other
 * than the leader walking into one at rest (still at its start, or at its slot), deeper than the slack; `narrow` — two
 * centres inside one narrow point's box together (the zones from the same step oracle). Each a list of { t, ids }.
 */
function motionOf(walks, delays, { leaderId, zonesAt }) {
  const trs = walks.map(w => ({ w, tr: delayed(trajectory(w.points, { speed: w.speed }), delays[w.id] ?? 0) }));
  const end = Math.max(...trs.map(x => x.tr.end), 0);
  const out = { rest: [], narrow: [] };
  for (let t = 0; t <= end + 10; t += 10) {
    const at = trs.map(x => ({ id: x.w.id, r: x.w.r, p: positionAt(x.tr, t), moving: t > x.tr.start && t < x.tr.end, lead: x.w.id === leaderId, tr: x.tr }));
    for (const a of at) for (const b of at) {
      if (a === b || !a.moving || b.moving || a.lead || b.lead) continue;
      // In the same update a brush is soft (STAGGER.brush), and so is a pass within a wave of the other's arrival (a
      // crossing); across waves, the slack.
      const same = Math.abs(a.tr.start - b.tr.start) < 1e-6;
      if (same && t >= b.tr.end && t < b.tr.end + STAGGER.stepMs) continue;
      if (dist(a.p, b.p) < a.r + b.r - (same ? STAGGER.brush : STAGGER.slack) - 1e-6) out.rest.push({ t, ids: [a.id, b.id] });
    }
    if (!zonesAt) continue;
    // One through a narrow point at a time: two moving there together (the leader walking through a member at rest
    // there is R6's, not a second one through).
    const inside = new Map();
    for (const a of at) for (const z of zonesAt(a.p)) {
      if (!a.moving || Math.abs(a.p.x - z.x) >= 0.5 - 1e-6 || Math.abs(a.p.y - z.y) >= 0.5 - 1e-6) continue;
      if (inside.has(z.key)) out.narrow.push({ t, ids: [inside.get(z.key), a.id], zone: z.key });
      else inside.set(z.key, a.id);
    }
  }
  return out;
}

const ROOM = `
####################
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
#..................#
####################`;

test("R5 open ground, the leader in front (L2): the leader goes in the drop's own update, the pack one wave (150 ms) later; only a member whose slot an earlier one's route crosses is held, until that one has passed", () => {
  const g = gridWorld(ROOM);
  assert.deepEqual(narrowZones(oraclesOf(g).step)({ x: 9.5, y: 4.5 }), [], "open ground: no narrow point");
  let drops = 0, heldDrops = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const n = 2 + Math.floor(rand() * 6);
    const delta = { x: Math.floor(rand() * 9) - 4, y: Math.floor(rand() * 5) - 2 };
    if (!delta.x && !delta.y) delta.x = 3;
    // A loose formation: members two squares apart in a 3-wide block; the leader the frontmost along the drag.
    const ms = [];
    for (let k = 0; k < n; k++) ms.push(member(`m${k}`, { x: 7.5 + 2 * (k % 3), y: 2.5 + 2 * Math.floor(k / 3) }));
    const ahead = m => m.start.x * delta.x + m.start.y * delta.y;
    const lead = [...ms].sort((a, b) => ahead(b) - ahead(a))[0];
    const sc = { seed, g, members: ms, standing: [], anchorId: lead.id, drop: { x: lead.start.x + delta.x, y: lead.start.y + delta.y } };
    const plan = planOf(sc);
    if (plan.none || plan.members[lead.id].atStart) continue;
    const t = timeOf(sc, plan);
    checkStagger(sc, plan, t);
    drops += 1;
    assert.equal(t.pack, STAGGER.stepMs, `seed ${seed}: the pack one wave after the leader`);
    assert.deepEqual(t.crowded, [], `seed ${seed}`);
    const walks = walksOf(sc, plan);
    const held = walks.filter(w => t.delays[w.id] > STAGGER.stepMs);
    if (held.length) heldDrops += 1;
    for (const h of held) {
      // Held only by R5's rest rule: an earlier member's route crosses its slot (planLead gives that member its slot
      // later; the review's "a follower's slot on an earlier follower's route").
      const slot = h.points.at(-1);
      const crossed = walks.slice(0, walks.indexOf(h)).some(w => w.id !== plan.leader && nearestWhile(trajectory(w.points), slot, -Infinity, Infinity) < w.r + h.r - STAGGER.brush);
      assert.ok(crossed, `seed ${seed}: ${h.id} held (${t.delays[h.id]} ms) with no earlier route across its slot: ${JSON.stringify(t.delays)}`);
    }
  }
  if (process.env.PM_STATS) console.log({ openGround: { drops, heldDrops } });
  assert.ok(heldDrops <= drops * 0.05, `${heldDrops} of ${drops} open-ground drops held anyone past one wave`);
});

test("R5 the leader behind (L2): the pack waits until the leader is a wave (0.9 square) past the frontmost member, 4 s at most", () => {
  const g = gridWorld(ROOM);
  let behind = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const n = 3 + Math.floor(rand() * 5);
    const ms = [];
    for (let k = 0; k < n; k++) ms.push(member(`m${k}`, { x: 3.5 + (k % 3), y: 2.5 + Math.floor(k / 3) }));
    // Dragged east: the leader is the westmost of the middle row.
    const lead = ms.find(m => m.start.x === 3.5 && m.start.y === 3.5) ?? ms[0];
    const sc = { seed, g, members: ms, standing: [], anchorId: lead.id, drop: { x: lead.start.x + 6 + Math.floor(rand() * 6), y: lead.start.y } };
    const plan = planOf(sc);
    const t = timeOf(sc, plan);
    checkStagger(sc, plan, t);
    // By walk to the drop (planLead's `left`): at the pack's start the leader has a wave (0.9 square) less to walk
    // than the frontmost member had, and not a wave sooner.
    const walks = walksOf(sc, plan);
    const front = Math.min(...walks.filter(w => w.id !== lead.id).map(w => w.left));
    const ahead = plan.members[lead.id].left - front;
    if (ahead > 0) behind += 1;
    const walked = ms => (6 * ms) / 1000;
    assert.ok(walked(t.pack) >= ahead + 0.9 - 1e-6 || t.pack === Math.floor(STAGGER.capMs / STAGGER.stepMs) * STAGGER.stepMs,
      `seed ${seed}: at the pack's start (${t.pack} ms) the leader is a wave past the frontmost member (${ahead} squares behind it)`);
    assert.ok(walked(t.pack - STAGGER.stepMs) < Math.max(ahead, 0) + 0.9 + 1e-6, `seed ${seed}: no later than that (pack ${t.pack})`);
  }
  if (process.env.PM_STATS) console.log({ leaderBehind: { drops: 200, behind } });
  assert.ok(behind >= 150, `the leader started behind in ${behind} drops`);
});

const LINE = `
##################################################
#................................................#
##################################################`;

test("R5 a file of 20 is one wave (L2): twenty in a one-wide way, the leader in front, move up as one, nobody held", () => {
  const g = gridWorld(LINE);
  for (const [gapEvery, k] of [[0, 6], [3, 5], [0, 12]]) {
    const ms = [];
    let x = 30.5;
    for (let n = 0; n < 20; n++) { ms.push(member(`m${n}`, { x, y: 1.5 })); x -= gapEvery && n % gapEvery === gapEvery - 1 ? 2 : 1; }
    const sc = { seed: `line${gapEvery}`, g, members: ms, standing: [], anchorId: "m0", drop: { x: 30.5 + k, y: 1.5 } };
    const plan = planOf(sc);
    assert.deepEqual(plan.stayed, []);
    const t = timeOf(sc, plan);
    checkStagger(sc, plan, t);
    assert.deepEqual(t.crowded, []);
    assert.deepEqual([...new Set(Object.values(t.delays))].sort((a, b) => a - b), [0, STAGGER.stepMs], `one wave after the leader: ${JSON.stringify(t.delays)}`);
    const m = motionOf(walksOf(sc, plan), t.delays, { leaderId: "m0", zonesAt: narrowZones(oraclesOf(g).step) });
    assert.deepEqual(m.rest, []);
    assert.deepEqual(m.narrow, [], "single file in the way: never two in one square");
  }
});

const DOOR = `
####################
#..................#
#..................#
#..................#
#..................#
##########.#########
#..................#
#..................#
#..................#
#..................#
####################`;

test("R5 through a door single file (L2): never two members' centres inside the door frame together, spread out again past it, the last within 4 s", () => {
  const g = gridWorld(DOOR);
  const zonesAt = narrowZones(oraclesOf(g).step);
  assert.deepEqual(zonesAt({ x: 10.5, y: 5.5 }).map(z => z.key), ["c5,10"], "the door's gap is a narrow point");
  assert.deepEqual(zonesAt({ x: 4.5, y: 2.5 }), [], "the room is not");
  let spread = 0, drops = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rand = rng(seed);
    const n = 2 + Math.floor(rand() * 7);
    const cells = [];
    for (let i = 1; i <= 4; i++) for (let j = 3; j <= 16; j++) cells.push({ x: j + 0.5, y: i + 0.5 });
    const ms = [];
    for (let k = 0; k < n; k++) ms.push(member(`m${k}`, cells.splice(Math.floor(rand() * cells.length), 1)[0]));
    const lead = ms[Math.floor(rand() * n)];
    // Dropped clear of the door's mouth (a drop right past it plugs the door: R3's tie to the least walk, open).
    let drop = null;
    while (!drop) { const p = { x: 3.5 + Math.floor(rand() * 14), y: 7.5 + Math.floor(rand() * 3) }; if (Math.abs(p.x - 10.5) >= 2 || p.y === 9.5) drop = p; }
    const sc = { seed, g, members: ms, standing: [], anchorId: lead.id, drop };
    const plan = planOf(sc);
    if (plan.none) continue;
    const t = timeOf(sc, plan);
    checkStagger(sc, plan, t);
    drops += 1;
    assert.deepEqual(t.crowded, [], `seed ${seed}: ${n} through one door fit in 4 s`);
    const walks = walksOf(sc, plan);
    const m = motionOf(walks, t.delays, { leaderId: plan.leader, zonesAt });
    assert.deepEqual(m.narrow.slice(0, 1), [], `seed ${seed}: two in the door together`);
    assert.deepEqual(m.rest.slice(0, 1), [], `seed ${seed}: a member walks into one at rest`);
    const slots = Object.values(plan.members).filter(e => !e.stay).map(e => e.slot);
    if (slots.length >= 4) {
      spread += 1;
      assert.ok(new Set(slots.map(s => s.x)).size >= 2 && new Set(slots.map(s => s.y)).size >= 2, `seed ${seed}: spread out past the door: ${JSON.stringify(slots)}`);
    }
  }
  if (process.env.PM_STATS) console.log({ door: { drops, spread } });
  assert.ok(drops >= 140 && spread >= 50, `${drops} drops, ${spread} of four or more`);
});

const TUNNEL40 = `
##############################################
#....#########################################
#............................................#
#....#########################################
##############################################`;

test("R5 / R6 a leader anywhere in a one-wide tunnel of 2 to 20 always reaches the front (L2): 0 blocked in 400 seeds; nobody else ever ahead of it once it moves", () => {
  const g = gridWorld(TUNNEL40);
  const zonesAt = narrowZones(oraclesOf(g).step);
  let blocked = 0, capped = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const rand = rng(seed);
    const n = 2 + Math.floor(rand() * 19);
    // A file in the tunnel, a gap of a square here and there; the leader anywhere in it.
    const ms = [];
    let x = 6.5 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) { ms.push(member(`m${k}`, { x, y: 2.5 })); x += rand() < 0.15 ? 2 : 1; }
    const lead = ms[Math.floor(rand() * n)];
    const front = ms.at(-1).start.x;
    const drop = { x: Math.min(44.5, front + 1 + Math.floor(rand() * 8)), y: 2.5 };
    const sc = { seed, g, members: ms, standing: [], anchorId: lead.id, drop };
    const plan = planOf(sc);
    const ok = !plan.none && !plan.stayed.length && plan.members[lead.id].slot.x === drop.x;
    if (!ok) { blocked += 1; continue; }
    const t = timeOf(sc, plan);
    checkStagger(sc, plan, t);
    if (t.pack >= Math.floor(STAGGER.capMs / STAGGER.stepMs) * STAGGER.stepMs) { capped += 1; continue; }
    const walks = walksOf(sc, plan);
    const trL = trajectory(plan.members[lead.id].points, { speed: 6 });
    for (const w of walks) {
      if (w.id === lead.id) continue;
      const tr = delayed(trajectory(w.points, { speed: 6 }), t.delays[w.id]);
      for (let s = tr.start; s <= tr.end; s += 10) {
        assert.ok(positionAt(tr, s).x < positionAt(trL, s).x - 0.5, `seed ${seed}: ${w.id} ahead of the leader at ${s} ms`);
      }
    }
    if (!t.crowded.length) {
      const m = motionOf(walks, t.delays, { leaderId: lead.id, zonesAt });
      assert.deepEqual(m.rest.slice(0, 1), [], `seed ${seed}: a member walks into one at rest`);
      assert.deepEqual(m.narrow.slice(0, 1), [], `seed ${seed}: two in one square of the tunnel`);
    }
  }
  if (process.env.PM_STATS) console.log({ tunnel: { blocked, capped } });
  assert.equal(blocked, 0, `${blocked} of 400 blocked`);
  assert.ok(capped <= 40, `${capped} drops waited the whole 4 s for the leader`);
});

test("R5: a cap shorter than the file's needs is honoured (never a cut): the crowded ones go at the least crowded step under it", () => {
  const g = gridWorld(`
############
#..........#
#..........#
#####.######
#..........#
#..........#
############`);
  const ms = [0, 1, 2, 3, 4, 5].map(k => member(`m${k}`, { x: 2.5 + k, y: 1.5 + (k % 2) }));
  const sc = { seed: "cap", g, members: ms, standing: [], anchorId: "m0", drop: { x: 2.5, y: 4.5 } };
  const plan = planOf(sc);
  const t = timeOf(sc, plan, { capMs: 300 });
  checkStagger(sc, plan, t, 300);
  assert.ok(t.crowded.length > 0, "six through one door do not fit in 300 ms");
  for (const w of walksOf(sc, plan)) assert.ok(plan.members[w.id].points.length >= 2, "every planned member still goes");
});

test("R5 gate (L2; 600 seeded drops on random floors, 200 in the dungeon, on the leader plan's routes): the leader at 0, nobody before the pack, the last within 4 s; uncrowded, nobody walks into a member at rest and no two share a narrow point", () => {
  let drops = 0, waited = 0, crowdedDrops = 0, maxTotal = 0, rest = 0, narrow = 0;
  for (const [from, to, map] of [[1, 600, null], [1001, 1200, DUNGEON]]) {
    for (let seed = from; seed <= to; seed++) {
      const sc = scenario(seed, map);
      const plan = planOf(sc);
      if (plan.none) continue;
      const t = timeOf(sc, plan);
      checkStagger(sc, plan, t);
      drops += 1;
      maxTotal = Math.max(maxTotal, t.total);
      if (t.total > t.pack) waited += 1;
      if (t.crowded.length) { crowdedDrops += 1; continue; }
      const m = motionOf(walksOf(sc, plan), t.delays, { leaderId: plan.leader, zonesAt: narrowZones(oraclesOf(sc.g).step) });
      if (m.rest.length) { rest += 1; assert.fail(`seed ${seed}: ${JSON.stringify(m.rest[0])} walks into a member at rest`); }
      if (m.narrow.length) { narrow += 1; assert.fail(`seed ${seed}: ${JSON.stringify(m.narrow[0])} share a narrow point`); }
    }
  }
  if (process.env.PM_STATS) console.log({ stagger: { drops, waited, crowdedDrops, maxTotal, rest, narrow } });
  assert.ok(maxTotal <= STAGGER.capMs, `max total ${maxTotal}`);
  // Crowded (soft: they go at the least crowded step, never cut): a leader more than 4 s behind its frontmost member
  // (the pack capped), or a member whose start and slot both lie on earlier members' routes.
  assert.ok(crowdedDrops <= drops * 0.05, `${crowdedDrops} of ${drops} drops crowded`);
});

/** A walk X passes the circle of member Y at rest (by more than the slack: a brush is not a pass). */
const passes = (X, c, r) => !!routeEnters(X.points, X.r, [{ x: c.x, y: c.y, r }], STAGGER.slack);

test("L3 FIFO order (every screen gets a drop's waves in the order they were sent): a member whose slot lies on another's route is never sent before it, one whose start lies on another's route never after it; the leader excepted (R6). 600 seeded floors, 200 dungeon drops, 200 lines in a one-wide way", () => {
  let drops = 0, pairs = 0, broken = 0;
  const lines = [];
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(77000 + seed);
    const g = gridWorld(TUNNEL40);
    const n = 3 + Math.floor(rand() * 8), x0 = 2 + Math.floor(rand() * 6);
    const ms = Array.from({ length: n }, (_, k) => member(`m${k}`, { x: x0 + k + 0.5, y: 2.5 }));
    lines.push({ seed: 77000 + seed, g, members: ms, standing: [], anchorId: ms[Math.floor(rand() * n)].id, drop: { x: 30.5 + Math.floor(rand() * 6), y: 2.5 } });
  }
  const all = [...Array.from({ length: 600 }, (_, k) => scenario(k + 1)), ...Array.from({ length: 200 }, (_, k) => scenario(1001 + k, DUNGEON)), ...lines];
  for (const sc of all) {
    const plan = planOf(sc);
    if (plan.none) continue;
    const t = timeOf(sc, plan);
    drops += 1;
    const walks = walksOf(sc, plan).filter(w => w.id !== plan.leader);
    for (const X of walks) for (const Y of walks) {
      if (X === Y) continue;
      const d = id => t.delays[id];
      if (passes(X, Y.points.at(-1), Y.r)) { pairs += 1; if (d(X.id) > d(Y.id) + 1e-6) { broken += 1; assert.fail(`seed ${sc.seed}: ${X.id} (${d(X.id)} ms) passes ${Y.id}'s slot, sent after it (${d(Y.id)} ms)`); } }
      if (passes(X, Y.points[0], Y.r)) { pairs += 1; if (d(Y.id) > d(X.id) + 1e-6) { broken += 1; assert.fail(`seed ${sc.seed}: ${X.id} (${d(X.id)} ms) passes ${Y.id}'s start, sent before it leaves (${d(Y.id)} ms)`); } }
    }
  }
  if (process.env.PM_STATS) console.log({ fifo: { drops, pairs, broken } });
  assert.ok(pairs >= 200, `ordered pairs ${pairs}`);
});

test("closeTime / nearestWhile (L2): how long two movers are closer than a limit; the nearest a mover comes to a point in a time window", () => {
  const A = trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }], { speed: 6 });            // 1 s
  const B = trajectory([{ x: 0, y: 0.4 }, { x: 6, y: 0.4 }], { speed: 6 });         // side by side, 0.4 apart
  assert.ok(Math.abs(closeTime(A, B, 0.5) - 1000) < 1e-6, "a lane: the whole second");
  const C = trajectory([{ x: 3, y: -3 }, { x: 3, y: 3 }], { speed: 6 });            // crosses A's way at its middle
  assert.ok(closeTime(A, C, 0.5) > 0 && closeTime(A, C, 0.5) < 200, `a crossing is brief: ${closeTime(A, C, 0.5)}`);
  assert.equal(closeTime(A, delayed(C, 2000), 0.5), 0, "one after the other never meet");
  assert.ok(Math.abs(nearestWhile(A, { x: 3, y: 1 }, -Infinity, Infinity) - 1) < 1e-9);
  assert.ok(Math.abs(nearestWhile(A, { x: 3, y: 1 }, 0, 250) - Math.hypot(1.5, 1)) < 1e-9, "only while it moves in the window");
  assert.equal(nearestWhile(A, { x: 3, y: 1 }, 2000, 3000), Infinity, "at rest after its end: not moving then");
});
