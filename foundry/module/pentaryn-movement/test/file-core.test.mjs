// B0, the floor of a group drag out of combat (file-core.mjs, 0.9.0; Fable's review 2 §4 step 2). Its gate as property
// tests on random ASCII floors and the hard-case dungeon, routed with the real pathfind-core A* (test/fixtures/grid.mjs):
// every member is sent or named; no route crosses a token standing outside the drop or a slot given out before it; no
// two slots overlap (nor a slot and a token at rest). Seeded: a failure names its seed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld, member } from "./fixtures/grid.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";
import { FILE, candidatesFor, clearOf, orderOf, planFile, routeEnters, wayToPoint } from "../file-core.mjs";
import { dist } from "../motion-core.mjs";

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

/** The oracles file-core asks, on a grid world: the route keeps out of each circle by the member's own radius too. */
const oraclesOf = (g, extra = {}) => ({
  walkable: g.walkable,
  // No slot behind a wall: walked from the formation spot at most twice the straight way (as file.mjs's flood).
  walk: (m, c) => g.walkDistanceFrom(m.formation)(c),
  route: (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })) })?.points ?? null,
  ...extra,
});

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
  const delta = { x: target.x - anchor.p.x, y: target.y - anchor.p.y };
  const members = ms0.map(m => member(m.id, m.p, delta, { w: m.w }));
  return { seed, map, g, members, standing, anchorId: anchor.id };
}

/** Every property of B0's gate, for one plan. */
function check(sc, plan) {
  const { members, standing } = sc;
  const why = `seed ${sc.seed}`;
  const byId = new Map(members.map(m => [m.id, m]));
  const order = plan.order;
  assert.deepEqual([...order].sort(), members.map(m => m.id).sort(), `${why}: every member planned`);
  const rest = [];                                     // where every member rests: its slot, or its start when it stays
  for (const id of order) {
    const m = byId.get(id);
    const e = plan.members[id];
    assert.ok(e, `${why}: ${id} has an entry`);
    const sent = e.points.length >= 2;
    // At its spot already: dropped within a square of where it stands.
    const atSpot = e.points.length === 1 && e.atStart && !e.stay && dist(m.start, m.formation) < 1;
    const named = !!e.stay && plan.stayed.includes(id);
    assert.ok(sent || atSpot || named, `${why}: ${id} is sent or named (${JSON.stringify(e)})`);
    assert.equal(Number(!!sent) + Number(!!atSpot) + Number(!!named), 1, `${why}: ${id} is one of sent, at its spot, named`);
    if (sent) {
      assert.ok(dist(e.points[0], m.start) < 1e-6, `${why}: ${id}'s route starts where it stands`);
      assert.ok(dist(e.points.at(-1), e.slot) < 0.05, `${why}: ${id}'s route ends on its slot`);
      assert.ok(sc.g.walkable(m, e.slot), `${why}: ${id} can stand on its slot`);
    }
    rest.push({ id, c: sent ? e.slot : m.start, r: m.r });
  }
  // No two at rest overlap (touching is fine), nor one at rest and a token standing outside the drop.
  for (let i = 0; i < rest.length; i++) {
    for (let j = i + 1; j < rest.length; j++) {
      const a = rest[i], b = rest[j];
      assert.ok(dist(a.c, b.c) >= a.r + b.r - 1e-6, `${why}: ${a.id} and ${b.id} rest overlapping (${dist(a.c, b.c).toFixed(3)})`);
    }
    for (const s of standing) assert.ok(dist(rest[i].c, s) >= rest[i].r + s.r - 1e-6, `${why}: ${rest[i].id} rests on standing ${s.id}`);
  }
  // No route crosses a token standing outside the drop, a member that stays where it stands, or a slot given out
  // before it (leaving one it starts inside is allowed: that one is moving). No slot lies on an earlier route.
  const still = rest.filter(r => !(plan.members[r.id].points.length >= 2)).map(r => ({ x: r.c.x, y: r.c.y, r: r.r, id: r.id }));
  const given = [], routes = [];
  for (const id of order) {
    const m = byId.get(id);
    const e = plan.members[id];
    if (!(e.points.length >= 2)) continue;
    const hard = [...standing, ...still.filter(s => s.id !== id), ...given];
    const hit = routeEnters(e.points, m.r, hard);
    assert.equal(hit, null, `${why}: ${id}'s route enters a standing token or an earlier slot at ${JSON.stringify(hit?.at)}`);
    for (const rt of routes) assert.ok(wayToPoint(rt.points, e.slot) >= m.r + rt.r - 1e-6, `${why}: ${id}'s slot is on ${rt.id}'s route`);
    given.push({ x: e.slot.x, y: e.slot.y, r: m.r, id });
    routes.push({ points: e.points, r: m.r, id });
  }
  assert.ok(plan.passes <= members.length + 2, `${why}: ${plan.passes} passes`);
}

test("orderOf: the grabbed one first, then least walk left first; candidates nearest the formation spot first", () => {
  const ms = [member("a", { x: 5.5, y: 5.5 }, { x: 4, y: 0 }), member("b", { x: 2.5, y: 5.5 }, { x: 1, y: 0 }), member("c", { x: 9.5, y: 5.5 }, { x: 2, y: 0 })];
  assert.deepEqual(orderOf(ms, "c").map(m => m.id), ["c", "b", "a"]);
  const cand = candidatesFor(ms[0]);
  assert.deepEqual(cand[0], ms[0].formation);
  for (let k = 2; k < cand.length; k++) assert.ok(dist(cand[k], ms[0].formation) >= dist(cand[k - 1], ms[0].formation) - EPS);
  assert.ok(clearOf({ x: 0, y: 0 }, 0.5, [{ x: 1, y: 0, r: 0.5 }]), "touching is clear");
  assert.ok(!clearOf({ x: 0, y: 0 }, 0.5, [{ x: 0.9, y: 0, r: 0.5 }]));
});

test("B0: a group through one door, every member to its own spot past it in one plan, none through the token standing beside the door", () => {
  const g = gridWorld(`
############
#..........#
#..........#
#####.######
#..........#
#..........#
############`);
  const delta = { x: 0, y: 3 };
  const ms = [member("a", { x: 5.5, y: 1.5 }, delta), member("b", { x: 4.5, y: 1.5 }, delta), member("c", { x: 6.5, y: 1.5 }, delta), member("d", { x: 5.5, y: 2.5 }, delta)];
  const standing = [{ id: "s", x: 4.5, y: 4.5, r: 0.5 }];
  const sc = { seed: "door", g, members: ms, standing, anchorId: "a" };
  const plan = planFile({ members: ms, anchorId: "a", standing }, oraclesOf(g));
  check(sc, plan);
  assert.deepEqual(plan.stayed, [], JSON.stringify(plan.members));
  for (const m of ms) assert.ok(plan.members[m.id].slot.y > 3, `${m.id} past the door: ${JSON.stringify(plan.members[m.id].slot)}`);
  // Its drop point is the door's mouth, on every other member's way: it rests beside it, so the others pass.
  assert.ok(plan.members.a.slot.y > 3 && dist(plan.members.a.slot, ms[0].formation) <= 3.2, `the grabbed one past the door, near its drop point: ${JSON.stringify(plan.members.a.slot)}`);
});

test("B0: a member with no free spot it can reach stays and is named; the others go", () => {
  // The room past the door has two squares; three members are dropped into it.
  const g = gridWorld(`
#########
#.......#
####.####
####..###
#########`);
  const delta = { x: 0, y: 2 };
  const ms = [member("a", { x: 4.5, y: 1.5 }, delta), member("b", { x: 5.5, y: 1.5 }, delta), member("c", { x: 3.5, y: 1.5 }, delta)];
  const plan = planFile({ members: ms, anchorId: "a", standing: [] }, oraclesOf(g));
  check({ seed: "full", g, members: ms, standing: [] }, plan);
  const sent = ms.filter(m => plan.members[m.id].points.length >= 2).map(m => m.id);
  assert.ok(sent.includes("a"), "the grabbed one goes");
  assert.ok(plan.stayed.length >= 1, `someone stays: ${JSON.stringify(plan.members)}`);
  for (const id of plan.stayed) assert.ok(["noSpot", "noRoute", "through", "budget"].includes(plan.members[id].stay), plan.members[id].stay);
});

test("B0: dropped on a token standing there, the grabbed one takes the nearest clear spot it can reach", () => {
  const g = gridWorld(`
########
#......#
#......#
########`);
  const ms = [member("a", { x: 1.5, y: 1.5 }, { x: 4, y: 0 })];
  const standing = [{ id: "s", x: 5.5, y: 1.5, r: 0.5 }];
  const plan = planFile({ members: ms, anchorId: "a", standing }, oraclesOf(g));
  check({ seed: "on", g, members: ms, standing }, plan);
  const e = plan.members.a;
  assert.ok(e.points.length >= 2);
  assert.ok(dist(e.slot, standing[0]) >= 1 - EPS && dist(e.slot, standing[0]) <= 1.5 + EPS, JSON.stringify(e.slot));
});

test("B0: a member dropped where it stands stays or steps off the others' way; nobody walks through it", () => {
  const g = gridWorld(`
##########
#........#
#........#
##########`);
  // b is dropped where it stands (its formation is its start); a's way passes b's square.
  const ms = [member("a", { x: 1.5, y: 1.5 }, { x: 6, y: 0 }), { ...member("b", { x: 4.5, y: 1.5 }, { x: 0, y: 0 }) }];
  const plan = planFile({ members: ms, anchorId: "a", standing: [] }, oraclesOf(g));
  check({ seed: "still", g, members: ms, standing: [] }, plan);
  assert.deepEqual(plan.stayed, []);
  if (plan.members.b.points.length === 1) assert.equal(routeEnters(plan.members.a.points, 0.5, [{ x: 4.5, y: 1.5, r: 0.5 }]), null, "a goes round b");
  else assert.ok(wayToPoint(plan.members.a.points, plan.members.b.slot) >= 1 - EPS, "b steps off a's way");
});

test("B0: planning time is bounded; a member not reached by then stays, named \"budget\"", () => {
  const g = gridWorld(`
############
#..........#
#..........#
############`);
  const clock = { t: 0 };
  const ms = [0, 1, 2, 3, 4].map(k => member(`m${k}`, { x: 1.5 + k, y: 1.5 }, { x: 5, y: 1 }));
  const o = oraclesOf(g);
  const plan = planFile({ members: ms, anchorId: "m0", standing: [] }, { ...o, now: () => clock.t,
    route: (m, f, t, a) => { clock.t += 600; return o.route(m, f, t, a); } });
  check({ seed: "budget", g, members: ms, standing: [] }, plan);
  assert.ok(plan.stayed.some(id => plan.members[id].stay === "budget"), JSON.stringify(plan.members));
  assert.ok(plan.ms <= FILE.totalMs + 2 * 600, `bounded: ${plan.ms}`);
});

/** Of the members that could reach their own drop spot alone (round the standing tokens), how many B0 sends. */
function liveness(sc, plan) {
  let reachable = 0, sent = 0;
  for (const m of sc.members) {
    const avoid = sc.standing.map(o => ({ ...o, r: o.r + m.r - 0.01 }));
    if (!sc.g.walkable(m, m.formation) || !sc.g.route(m, m.start, m.formation, { avoid })) continue;
    reachable += 1;
    if (plan.members[m.id].points.length >= 2 || plan.members[m.id].atStart) sent += 1;
  }
  return { reachable, sent };
}

test("B0 gate (600 seeded drops on random floors): every member sent or named; no route through a standing token or an earlier slot; no two slots overlap", () => {
  let reachable = 0, sent = 0;
  for (let seed = 1; seed <= 600; seed++) {
    const sc = scenario(seed);
    const plan = planFile({ members: sc.members, anchorId: sc.anchorId, standing: sc.standing }, oraclesOf(sc.g));
    check(sc, plan);
    const l = liveness(sc, plan);
    reachable += l.reachable; sent += l.sent;
  }
  if (process.env.PM_STATS) console.log({ random: { reachable, sent } });
  // Most members dropped where they could walk alone get there (or beside it): the floor, not a stay-by-default.
  assert.ok(sent / reachable >= 0.95, `${sent} of ${reachable} members that could reach their spot alone are sent`);
});

test("B0 gate on the hard-case dungeon (200 seeds): the same properties through its corridors and maze", () => {
  let reachable = 0, sent = 0;
  for (let seed = 1001; seed <= 1200; seed++) {
    const sc = scenario(seed, DUNGEON);
    const plan = planFile({ members: sc.members, anchorId: sc.anchorId, standing: sc.standing }, oraclesOf(sc.g));
    check(sc, plan);
    const l = liveness(sc, plan);
    reachable += l.reachable; sent += l.sent;
  }
  if (process.env.PM_STATS) console.log({ dungeon: { reachable, sent } });
  assert.ok(sent / reachable >= 0.9, `${sent} of ${reachable} members that could reach their spot alone are sent`);
});
