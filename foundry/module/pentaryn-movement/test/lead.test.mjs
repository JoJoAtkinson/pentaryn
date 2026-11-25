// The leader plan (file-core planLead, 0.10 step L1; plan §18; Joe's leader rule 2026-11-24, Fable's review 3 §1, §2):
// the token grabbed leads; dropped on the floor the group marches (the leader on the drop square, the rest behind it),
// dropped on a token outside the group it swarms (the leader touching it first, the rest ring by ring round it). Each
// member in turn takes the best-ranked free square it can reach and gets one route search to it. Routed with the real
// pathfind-core A* on ASCII floors (test/fixtures/grid.mjs). Seeded: a failure names its seed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld } from "./fixtures/grid.mjs";
import { footprintCells, planLead, routeEnters, walkFrom } from "../file-core.mjs";
import { marchBreaches, swarmBreaches } from "./sim/shape.mjs";

const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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

/** The oracles planLead asks, on a grid world (the route keeps out of each circle by the member's own radius too). */
function oraclesOf(g, extra = {}) {
  const step = (a, b) => g.free(b.i, b.j) && (a.i === b.i || a.j === b.j || (g.free(a.i, b.j) && g.free(b.i, a.j)));
  return {
    walkable: g.walkable, step,
    // As file.mjs's route: a circle the member starts inside is one it is leaving (left out of the search).
    route: (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(c => dist(c, from) >= c.r) })?.points ?? null,
    ...extra,
  };
}
const mem = (id, x, y, w = 1) => ({ id, w, h: w, r: w / 2, start: { x, y } });

const TUNNEL = `
########################
#........###############
#........###############
#.....................##
#........###############
#........###############
########################`;

test("L1 tunnel repro (Joe's hands-on, review 3 §2): four members dropped 11 squares into a one-wide tunnel line up behind the leader, nobody named", () => {
  const g = gridWorld(TUNNEL);
  const members = [mem("L", 6.5, 3.5), mem("A", 6.5, 2.5), mem("B", 5.5, 3.5), mem("C", 5.5, 2.5)];
  const plan = planLead({ members, leaderId: "L", drop: { x: 19.5, y: 3.5 }, standing: [] }, oraclesOf(g));
  assert.equal(plan.shape, "march");
  assert.deepEqual(plan.stayed, [], `nobody named: ${JSON.stringify(plan.members)}`);
  assert.deepEqual(plan.members.L.slot, { x: 19.5, y: 3.5 }, "the leader on the drop square");
  const xs = ["A", "B", "C"].map(id => plan.members[id].slot).map(s => { assert.equal(s.y, 3.5, "in the tunnel"); return s.x; }).sort((a, b) => b - a);
  assert.deepEqual(xs, [18.5, 17.5, 16.5], "a line behind the leader");
  assert.equal(plan.searches, 4, "one search a member");
  assert.equal(plan.failed, 0);
  for (const id of ["A", "B", "C"]) assert.ok(plan.members[id].points.length >= 2);
});

test("L1 march: eight dragged across an open room ball up behind the leader, none beside or ahead of it (\"behind\" follows its last step)", () => {
  const room = `
######################
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
######################`;
  const g = gridWorld(room);
  const members = "LABCDEFG".split("").map((id, k) => mem(id, 2.5 + (k % 2), 2.5 + Math.floor(k / 2)));
  const plan = planLead({ members, leaderId: "L", drop: { x: 15.5, y: 4.5 } }, oraclesOf(g));
  assert.deepEqual(plan.stayed, []);
  const u = plan.lastStep;
  for (const m of members.slice(1)) {
    const s = plan.members[m.id].slot;
    assert.ok((s.x - 15.5) * u.x + (s.y - 4.5) * u.y < -EPS, `${m.id} behind the leader: ${JSON.stringify(s)}`);
    assert.ok(dist(s, { x: 15.5, y: 4.5 }) < 3.5, `${m.id} balled up near it`);
  }
  assert.ok(plan.searches <= members.length + 1);
});

test("L1 march: the leader at the back of a file walks through its own members to the front; the rest close up behind it", () => {
  const g = gridWorld(TUNNEL);
  const members = [mem("L", 9.5, 3.5), mem("A", 10.5, 3.5), mem("B", 11.5, 3.5), mem("C", 12.5, 3.5), mem("D", 13.5, 3.5)];
  const plan = planLead({ members, leaderId: "L", drop: { x: 19.5, y: 3.5 } }, oraclesOf(g));
  assert.deepEqual(plan.stayed, []);
  assert.deepEqual(plan.members.L.slot, { x: 19.5, y: 3.5 });
  assert.deepEqual(["A", "B", "C", "D"].map(id => plan.members[id].slot.x).sort((a, b) => b - a), [18.5, 17.5, 16.5, 15.5]);
  assert.deepEqual(plan.order, ["L", "D", "C", "B", "A"], "the leader, then least walk left");
});

test("L1 march: a member already past the leader in a dead end stays, named; the leader with no way: nobody moves", () => {
  const g = gridWorld(TUNNEL);
  const plan = planLead({ members: [mem("L", 6.5, 3.5), mem("A", 21.5, 3.5)], leaderId: "L", drop: { x: 19.5, y: 3.5 } }, oraclesOf(g));
  assert.deepEqual(plan.stayed, ["A"], "past the leader: no square behind it to reach");
  assert.equal(plan.members.L.points.length >= 2, true);
  const shut = gridWorld(TUNNEL.replace("#.....................##", "#.........#...........##"));
  const none = planLead({ members: [mem("L", 6.5, 3.5), mem("A", 6.5, 2.5)], leaderId: "L", drop: { x: 19.5, y: 3.5 } }, oraclesOf(shut));
  assert.equal(none.none, true, "No route there");
  assert.deepEqual(none.stayed.sort(), ["A", "L"]);
});

test("0.10 sign-off X1 (S05.p legs 3, 5): a member that stays where it stands in a one-wide way, on the leader's route: the leader goes through it (its own group, R6), rests clear of it, and the member is named (live: \"No route there.\" for the whole group)", () => {
  const g = gridWorld(`
################
#....##########
#..............#
#....##########
################`);
  // The ranked area is the two squares behind the drop, both held by members standing on them: X, in the way, has no
  // free square it can reach and stays; the one-wide way has no way round it.
  const members = [mem("L", 2.5, 2.5), mem("X", 8.5, 2.5), mem("Y", 13.5, 2.5), mem("Z", 12.5, 2.5)];
  const plan = planLead({ members, leaderId: "L", drop: { x: 14.5, y: 2.5 } }, oraclesOf(g, { cells: 0, extra: 2 }));
  assert.equal(plan.none, false, `the leader goes: ${JSON.stringify(plan.members)}`);
  assert.deepEqual(plan.stayed, ["X"], "the member with no square is named");
  const L = plan.members.L;
  assert.deepEqual(L.slot, { x: 14.5, y: 2.5 }, "the leader on the drop square");
  assert.ok(L.points.length >= 2 && dist(L.points.at(-1), L.slot) < EPS, "its route reaches the drop");
  assert.ok(routeEnters(L.points, 0.5, [{ x: 8.5, y: 2.5, r: 0.5 }]), "through the member that stays (its own group)");
  assert.ok(dist(L.slot, members[1].start) >= 1 - EPS, "it rests clear of it");
  assert.deepEqual([plan.members.Y.slot, plan.members.Z.slot], [{ x: 13.5, y: 2.5 }, { x: 12.5, y: 2.5 }], "the others keep their squares behind it");
  // Unchanged: a member that stays on the leader's own rest square still stops the group ("No route there").
  const on = planLead({ members: [mem("L", 2.5, 2.5), mem("X", 14.5, 2.5), mem("Y", 13.5, 2.5)], leaderId: "L", drop: { x: 14.5, y: 2.5 } },
    oraclesOf(g, { cells: 0, extra: 1 }));
  assert.equal(on.none, true, `a stayer on the rest square: ${JSON.stringify(on.members)}`);
  assert.equal(on.blocker, "X", "the notice names it");
});

const ARENA = `
######################
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
#....................#
######################`;

test("L1 swarm: ten dropped on a hero in the open fill ring 1 from their own sides; the leader touches first", () => {
  const g = gridWorld(ARENA);
  const starts = { L: [3.5, 4.5], A: [17.5, 4.5], B: [10.5, 1.5], C: [10.5, 7.5], D: [4.5, 1.5], E: [16.5, 7.5], F: [16.5, 1.5], G: [4.5, 7.5], H: [2.5, 3.5], I: [18.5, 5.5] };
  const members = Object.entries(starts).map(([id, [x, y]]) => mem(id, x, y));
  const T = { id: "T", x: 10.5, y: 4.5, r: 0.5 };
  const plan = planLead({ members, leaderId: "L", drop: { x: 10.5, y: 4.5 }, target: { id: "T", x: 10.5, y: 4.5, w: 1, h: 1 }, standing: [T] }, oraclesOf(g));
  assert.equal(plan.shape, "swarm");
  assert.equal(plan.target, "T");
  assert.deepEqual(plan.stayed, []);
  const ring1 = Object.values(plan.members).filter(e => Math.max(Math.abs(e.slot.x - 10.5), Math.abs(e.slot.y - 4.5)) < 1.01).length;
  assert.equal(ring1, 8, "ring 1 full (8 round a Medium)");
  const l = plan.members.L.slot;
  assert.ok(Math.max(Math.abs(l.x - 10.5), Math.abs(l.y - 4.5)) < 1.01 && l.x < 10.5, `the leader touches from its own (west) side: ${JSON.stringify(l)}`);
  assert.ok(plan.members.A.slot.x >= 10.5, "A comes in from the east");
});

test("L1 swarm: ring 1 is 12 squares round a Large and 16 round a Huge", () => {
  for (const [w, n, c] of [[2, 12, { x: 11, y: 5 }], [3, 16, { x: 10.5, y: 4.5 }]]) {
    const g = gridWorld(ARENA);
    const members = Array.from({ length: n + 2 }, (_, k) => mem(`M${k}`, 1.5 + (k % 3), 1.5 + Math.floor(k / 3) % 7));
    const fixed = members.filter((m, k, all) => all.findIndex(x => x.start.x === m.start.x && x.start.y === m.start.y) === k);
    const plan = planLead({ members: fixed, leaderId: fixed[0].id, target: { id: "T", ...c, w, h: w }, standing: [{ id: "T", ...c, r: w / 2 }] }, oraclesOf(g));
    const touching = Object.values(plan.members).filter(e => !e.stay && footprintCells(c, w, w).some(f => Math.max(Math.abs(f.j + 0.5 - e.slot.x), Math.abs(f.i + 0.5 - e.slot.y)) < 1.01)).length;
    assert.equal(touching, Math.min(n, fixed.length), `${w}×${w}: ring 1 = ${n}`);
  }
});

test("0.10 live round 2 (S02.d): fourteen swarm a Large standing one square off the arena's wall: all 12 touching squares filled (live: the two between the corners and the wall were sealed off once the corners were given out; 10 of 12)", () => {
  const g = gridWorld(ARENA);
  const c = { x: 11, y: 3 };
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const rnd = rng(seed);
    const spots = [];
    for (let i = 5; i <= 7; i++) for (let j = 2; j <= 19; j++) spots.push([j + 0.5, i + 0.5]);
    for (let k = spots.length - 1; k > 0; k--) { const q = Math.floor(rnd() * (k + 1)); [spots[k], spots[q]] = [spots[q], spots[k]]; }
    const members = spots.slice(0, 14).map(([x, y], k) => mem(`M${k}`, x, y));
    const plan = planLead({ members, leaderId: "M0", target: { id: "T", ...c, w: 2, h: 2 }, standing: [{ id: "T", ...c, r: 1 }] }, oraclesOf(g));
    const touching = Object.values(plan.members).filter(e => !e.stay && footprintCells(c, 2, 2).some(f => Math.max(Math.abs(f.j + 0.5 - e.slot.x), Math.abs(f.i + 0.5 - e.slot.y)) < 1.01));
    assert.deepEqual(plan.stayed, [], `seed ${seed}: nobody named`);
    assert.equal(touching.length, 12, `seed ${seed}: ring 1 full: ${touching.length} (${JSON.stringify(Object.values(plan.members).map(e => e.slot))})`);
  }
});

test("L1 swarm through a door: they file in, then fan out round the target; nobody named", () => {
  const door = `
######################
#.........#..........#
#.........#..........#
#.........#..........#
#....................#
#.........#..........#
#.........#..........#
#.........#..........#
######################`;
  const g = gridWorld(door);
  const members = "LABCDE".split("").map((id, k) => mem(id, 2.5 + (k % 2), 3.5 + Math.floor(k / 2)));
  const T = { id: "T", x: 15.5, y: 4.5, r: 0.5 };
  const plan = planLead({ members, leaderId: "L", target: { id: "T", x: 15.5, y: 4.5, w: 1, h: 1 }, standing: [T] }, oraclesOf(g));
  assert.deepEqual(plan.stayed, []);
  for (const e of Object.values(plan.members)) assert.ok(Math.max(Math.abs(e.slot.x - 15.5), Math.abs(e.slot.y - 4.5)) < 1.01, "all six touch it");
});

test("walkFrom: the nearest maxCells squares in walk order; hops counts steps; origins never tested", () => {
  const g = gridWorld(ARENA);
  const step = (a, b) => g.free(b.i, b.j);
  const m = walkFrom([{ i: 4, j: 10 }], step, { maxCells: 9 });
  assert.equal(m.size, 9);
  for (const [, d] of m) assert.ok(d <= Math.SQRT2 + EPS);
  const h = walkFrom([{ i: 4, j: 10 }], step, { hops: true, maxWalk: 2 });
  assert.equal(h.get("2,12"), 2);
  assert.deepEqual(footprintCells({ x: 11, y: 5 }, 2, 2), [{ i: 4, j: 10 }, { i: 4, j: 11 }, { i: 5, j: 10 }, { i: 5, j: 11 }]);
});

/* ---------------------------------------------------------------------------------------------------------------- */
/*  The gate: 800 seeded floors and tunnels, 2 to 20 members                                                         */
/* ---------------------------------------------------------------------------------------------------------------- */

/** A random floor (pillars, an optional wall with one or two doors) or a tunnel map (rooms joined by a one-wide way). */
function randomMap(rand, kind) {
  if (kind === "tunnel") {
    const W = 34, H = 15;
    const rows = Array.from({ length: H }, () => Array(W).fill("#"));
    const room = (i0, j0, h, w) => { for (let i = i0; i < i0 + h; i++) for (let j = j0; j < j0 + w; j++) rows[i][j] = "."; };
    room(1, 1, 8, 8);
    const ty = 2 + Math.floor(rand() * 5);
    const len = 10 + Math.floor(rand() * 14);
    for (let j = 9; j < 9 + len; j++) rows[ty][j] = ".";
    const end = 9 + len;
    if (rand() < 0.5) {
      // A bend down, then a room or a dead end.
      const down = 2 + Math.floor(rand() * 4);
      for (let i = ty; i <= ty + down; i++) rows[i][end] = ".";
      if (rand() < 0.6) room(ty + down, Math.min(end, W - 8), 4, 6);
    } else if (rand() < 0.6) room(Math.max(1, ty - 2), Math.min(end, W - 8), 6, 7);
    return rows.map(r => r.join("")).join("\n");
  }
  const W = 20 + Math.floor(rand() * 10), H = 12 + Math.floor(rand() * 6);
  const rows = [];
  for (let i = 0; i < H; i++) {
    let row = "";
    for (let j = 0; j < W; j++) row += (i === 0 || j === 0 || i === H - 1 || j === W - 1 || rand() < 0.07) ? "#" : ".";
    rows.push(row);
  }
  if (rand() < 0.6) {
    const col = 6 + Math.floor(rand() * (W - 12));
    const doors = new Set([1 + Math.floor(rand() * (H - 2)), 1 + Math.floor(rand() * (H - 2))]);
    for (let i = 1; i < H - 1; i++) rows[i] = rows[i].slice(0, col) + (doors.has(i) ? "." : "#") + rows[i].slice(col + 1);
  }
  return rows.join("\n");
}

/** One seeded drop: its world, spec and plan. */
function seeded(seed) {
  const rand = rng(seed);
  const kind = seed % 3 === 0 ? "tunnel" : "floor";
  const g = gridWorld(randomMap(rand, kind));
  const cells = [];
  g.rows.forEach((r, i) => [...r].forEach((ch, j) => { if (ch !== "#") cells.push({ i, j }); }));
  const placed = [];
  const put = (w, pool) => {
    for (let t = 0; t < 60 && pool.length; t++) {
      const c = pool[Math.floor(rand() * pool.length)];
      const p = w === 1 ? { x: c.j + 0.5, y: c.i + 0.5 } : w === 2 ? { x: c.j + 1, y: c.i + 1 } : { x: c.j + 1.5, y: c.i + 1.5 };
      if (!g.walkable({ w, h: w }, p)) continue;
      if (placed.some(q => dist(p, q) < w / 2 + q.r - EPS)) continue;
      const out = { ...p, r: w / 2, w };
      placed.push(out);
      return out;
    }
    return null;
  };
  const swarm = seed % 2 === 0;
  const standing = [];
  let target = null;
  if (swarm) {
    const tw = [1, 1, 2, 3][Math.floor(rand() * 4)];
    const t = put(tw, cells);
    if (t) { target = { id: "T", x: t.x, y: t.y, w: tw, h: tw }; standing.push({ id: "T", x: t.x, y: t.y, r: t.r }); }
  }
  const n = 2 + Math.floor(rand() * 19);
  // Members start bunched in one part of the map (a party), near a random cell.
  const home = cells[Math.floor(rand() * cells.length)];
  const near = cells.filter(c => Math.max(Math.abs(c.i - home.i), Math.abs(c.j - home.j)) <= 4);
  const members = [];
  for (let k = 0; k < n; k++) {
    const w = rand() < 0.08 ? 2 : 1;
    const p = put(w, near.length > n ? near : cells);
    if (p) members.push({ id: `m${k}`, w, h: w, r: w / 2, start: { x: p.x, y: p.y } });
  }
  for (let k = 0, s = Math.floor(rand() * 5); k < s; k++) { const p = put(1, cells); if (p) standing.push({ id: `s${k}`, x: p.x, y: p.y, r: 0.5 }); }
  const leader = members[Math.floor(rand() * members.length)];
  let drop = null;
  if (!target && leader) {
    for (let t = 0; t < 40 && !drop; t++) {
      const c = cells[Math.floor(rand() * cells.length)];
      const p = leader.w === 2 ? { x: c.j + 1, y: c.i + 1 } : { x: c.j + 0.5, y: c.i + 0.5 };
      if (g.walkable(leader, p) && standing.every(s => dist(p, s) >= s.r + leader.r - EPS)) drop = p;
    }
  }
  return { g, kind, members, standing, target, leader, drop, swarm: !!target };
}

test("L1 gate (800 seeded floors and tunnels, 2-20 members, march and swarm, Medium / Large / Huge targets): every member in place or named; no rest overlap; no route into a standing token, an earlier slot or a member that stays; march: nobody beside or ahead of the leader; swarm: the leader touching whenever a touching square was free; ≤ 1.2 searches a member, < 3 % failed", () => {
  const tot = { drops: 0, members: 0, named: 0, none: 0, searches: 0, failed: 0, swarm: 0, leaderTouch: 0, march: 0 };
  for (let seed = 1; seed <= 800; seed++) {
    const { g, members, standing, target, leader, drop } = seeded(seed);
    if (members.length < 2 || (!target && !drop)) continue;
    const o = oraclesOf(g);
    const plan = planLead({ members, leaderId: leader.id, drop, target, standing }, o);
    tot.drops += 1; tot.members += members.length; tot.searches += plan.searches; tot.failed += plan.failed;
    if (plan.none) { tot.none += 1; continue; }
    tot.named += plan.stayed.length;
    const at = new Map();
    const order = new Map(plan.order.map((id, k) => [id, k]));
    for (const m of members) {
      const e = plan.members[m.id];
      assert.ok(e, `seed ${seed}: ${m.id} has no entry`);
      if (e.stay) { assert.ok(plan.stayed.includes(m.id), `seed ${seed}: ${m.id} stays unnamed`); at.set(m.id, m.start); continue; }
      assert.ok(e.atStart ? dist(e.slot, m.start) < EPS : (e.points.length >= 2 && dist(e.points.at(-1), e.slot) <= 0.05), `seed ${seed}: ${m.id} not in place`);
      assert.ok(g.walkable(m, e.slot), `seed ${seed}: ${m.id} rests in rock`);
      at.set(m.id, e.slot);
    }
    const ids = [...at.keys()];
    const r = id => members.find(m => m.id === id).r;
    for (let a = 0; a < ids.length; a++) {
      for (let b = a + 1; b < ids.length; b++) assert.ok(dist(at.get(ids[a]), at.get(ids[b])) >= r(ids[a]) + r(ids[b]) - EPS, `seed ${seed}: ${ids[a]} and ${ids[b]} overlap at rest`);
      for (const s of standing) assert.ok(dist(at.get(ids[a]), s) >= r(ids[a]) + s.r - EPS, `seed ${seed}: ${ids[a]} rests on standing ${s.id}`);
    }
    // Routes: never into a standing token, a slot given out before it or a member that stays (the leader: standing only,
    // and the stays).
    const stays = members.filter(m => plan.members[m.id].stay).map(m => ({ ...m.start, r: m.r, id: m.id }));
    for (const m of members) {
      const e = plan.members[m.id];
      if (e.stay || e.atStart) continue;
      const earlier = m.id === leader.id ? [] : members.filter(x => x.id !== m.id && order.get(x.id) < order.get(m.id) && !plan.members[x.id].stay).map(x => ({ ...plan.members[x.id].slot, r: x.r, id: x.id }));
      const hit = routeEnters(e.points, m.r, [...standing, ...earlier, ...stays.filter(s => s.id !== m.id)]);
      // 0.10 sign-off X1 (R6): the leader goes through a member that stays only when there is no way round it.
      const own = m.id === leader.id && hit && !routeEnters(e.points, m.r, standing) && !o.route(m, m.start, e.slot, [...standing, ...stays]);
      if (own) tot.through = (tot.through ?? 0) + 1;
      assert.ok(!hit || own, `seed ${seed}: ${m.id}'s route enters a token at rest at ${JSON.stringify(hit?.at)}`);
    }
    const step = o.step;
    if (!target) {
      tot.march += 1;
      // Nobody beside or ahead: each follower's square nearer B (the leader's last step's square) than the leader's own
      // (the shape rule the simulator judges too: test/sim/shape.mjs).
      const B = plan.behind;
      if (!B) { assert.equal(plan.stayed.length, members.length - 1, `seed ${seed}: no square behind, all named`); continue; }
      const followers = members.filter(m => m.id !== leader.id && !plan.members[m.id].stay).map(m => ({ id: m.id, w: m.w, h: m.h, slot: plan.members[m.id].slot }));
      const breaches = marchBreaches({ leader, at: plan.members[leader.id].slot, behind: B, lastStep: plan.lastStep, followers, standing, step });
      assert.deepEqual(breaches, [], `seed ${seed}: beside or ahead of the leader`);
    } else {
      tot.swarm += 1;
      const Ls = plan.members[leader.id].slot;
      const breaches = swarmBreaches({ leader, at: Ls, target, standing, walkable: g.walkable, step, route: o.route });
      if (!breaches.length && footprintCells(Ls, leader.w, leader.h).some(c => footprintCells(target, target.w, target.h).some(f => Math.max(Math.abs(f.i - c.i), Math.abs(f.j - c.j)) === 1))) tot.leaderTouch += 1;
      assert.deepEqual(breaches, [], `seed ${seed}: a touching square was free and reachable, the leader took ${JSON.stringify(Ls)}`);
    }
  }
  const perMember = tot.searches / tot.members, failed = tot.failed / Math.max(1, tot.searches);
  console.log(`# L1 gate: ${JSON.stringify(tot)}; searches a member ${perMember.toFixed(3)}, failed ${(100 * failed).toFixed(2)} %`);
  assert.ok(tot.drops >= 700, `enough drops: ${tot.drops}`);
  assert.ok(perMember <= 1.2, `searches a member: ${perMember}`);
  assert.ok(failed < 0.03, `failed: ${failed}`);
});

test("L1 gate: planning in Node, warm, median under 100 ms for 8 members and under 250 ms for 20", () => {
  const room = Array.from({ length: 24 }, (_, i) => (i === 0 || i === 23 ? "#".repeat(40) : "#" + [...Array(38)].map((_, j) => (j === 18 && i !== 12 && i !== 5 ? "#" : ".")).join("") + "#")).join("\n");
  const g = gridWorld(room);
  for (const [n, cap] of [[8, 100], [20, 250]]) {
    const members = Array.from({ length: n }, (_, k) => mem(`m${k}`, 3.5 + (k % 5), 3.5 + Math.floor(k / 5)));
    const run = target => planLead({ members, leaderId: "m0", drop: { x: 30.5, y: 12.5 }, target, standing: target ? [{ id: "T", x: 30.5, y: 12.5, r: 0.5 }] : [] }, oraclesOf(g));
    for (let k = 0; k < 3; k++) { run(null); run({ id: "T", x: 30.5, y: 12.5, w: 1, h: 1 }); }
    const times = [];
    for (let k = 0; k < 9; k++) {
      const t0 = performance.now();
      const p = run(k % 2 ? { id: "T", x: 30.5, y: 12.5, w: 1, h: 1 } : null);
      times.push(performance.now() - t0);
      assert.ok(p.stayed.length <= (k % 2 ? Math.max(0, n - 24) : 0), `${n}: ${p.stayed}`);
    }
    times.sort((a, b) => a - b);
    console.log(`# L1 timing: ${n} members, median ${times[4].toFixed(1)} ms (max ${times.at(-1).toFixed(1)})`);
    assert.ok(times[4] < cap, `${n} members: median ${times[4]} ms`);
  }
});
