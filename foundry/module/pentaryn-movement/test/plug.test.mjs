// The door plug (0.10.2; Joe 2026-11-24 / 11-25, scratch decisions.md; plan §18.11): a march leader dropped just past a
// one-wide door or mouth brought two or three through and the rest lined up outside though the room had space (R3: only
// squares nearer the square behind the leader than the leader's own, and the first follower took the square just
// inside the door, which shut the rest of the room off). Joe's rule of thumb: "would a little more of the party have
// come through here?" Now, when the leader's route came through a narrow point (narrowZones: a one-wide square, a door
// in a thin wall) and it rests within LEAD.plug of walk past it on squares that are not narrow, the squares on its side
// within LEAD.beside of it and not ahead of it go first (behind it, then beside it), the square that would shut the
// others off fills last; the rest wait outside, behind as before. Open ground, a tunnel, a deeper drop and a fight's
// turn are unchanged. Routed with the real pathfind-core A* on ASCII floors (test/fixtures/grid.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridWorld } from "./fixtures/grid.mjs";
import { LEAD, planLead, routeEnters } from "../file-core.mjs";
import { marchBreaches } from "./sim/shape.mjs";

const EPS = 1e-6;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function oraclesOf(g, extra = {}) {
  return {
    walkable: g.walkable, step: g.stepOpen,
    route: (m, from, to, avoid) => g.route(m, from, to, { avoid: avoid.map(o => ({ x: o.x, y: o.y, r: o.r + m.r - 0.01 })).filter(c => dist(c, from) >= c.r) })?.points ?? null,
    ...extra,
  };
}
const room = (W, H, f) => Array.from({ length: H }, (_, i) => Array.from({ length: W }, (_, j) => f(i, j)).join("")).join("\n");

/**
 * Three ways into a room (rows 1-11, the way in on row 6): a one-wide gap in a thick wall (column 9), a door in a thin
 * wall (x = 10), and the mouth of a one-wide tunnel (columns 7-14). `first`: the room's first column; `near`: a square
 * on the side the party comes from.
 */
const MAPS = {
  door: { ascii: room(27, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 26 || (j === 9 && i !== 6)) ? "#" : "."), first: 10, near: c => c.j <= 8 },
  thin: { ascii: room(27, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 26) ? "#" : "."), first: 10, near: c => c.j <= 9,
    walls: [{ a: { x: 10, y: 1 }, b: { x: 10, y: 6 } }, { a: { x: 10, y: 7 }, b: { x: 10, y: 12 } }] },
  mouth: { ascii: room(32, 13, (i, j) => (i === 0 || i === 12 || j === 0 || j === 31) ? "#" : (j >= 7 && j <= 14 && i !== 6) ? "#" : "."), first: 15, near: c => c.j <= 14 },
};

/** n members bunched on the near side nearest the way in (the leader the nearest), the leader dropped `past` squares in. */
function scenario(name, past, n) {
  const M = MAPS[name];
  const g = gridWorld(M.ascii, { walls: M.walls ?? [] });
  const origin = { i: 6, j: M.first - 1 };
  const walk = new Map([[`${origin.i},${origin.j}`, 0]]);
  const open = [[origin, 0]];
  while (open.length) {
    open.sort((a, b) => a[1] - b[1]);
    const [c, d] = open.shift();
    for (const [di, dj] of [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const q = { i: c.i + di, j: c.j + dj }, k = `${q.i},${q.j}`;
      if (!M.near(q) || walk.has(k) || !g.stepOpen(c, q)) continue;
      walk.set(k, d + (di && dj ? Math.SQRT2 : 1));
      open.push([q, walk.get(k)]);
    }
  }
  const cells = [...walk.keys()].map(k => { const [i, j] = k.split(",").map(Number); return { i, j }; })
    .filter(c => !(name === "door" && c.j === 9))
    .sort((a, b) => walk.get(`${a.i},${a.j}`) - walk.get(`${b.i},${b.j}`) || a.i - b.i || a.j - b.j);
  const members = cells.slice(0, n).map((c, k) => ({ id: `m${k}`, w: 1, h: 1, r: 0.5, start: { x: c.j + 0.5, y: c.i + 0.5 } }));
  return { g, M, members, drop: { x: M.first - 1 + past + 0.5, y: 6.5 } };
}

function plan(name, past, n, extra = {}) {
  const { g, M, members, drop } = scenario(name, past, n);
  const o = oraclesOf(g, extra);
  const p = planLead({ members, leaderId: "m0", drop, standing: [] }, o);
  const inside = members.filter(m => !p.members[m.id].stay && p.members[m.id].slot.x > M.first);
  return { g, M, members, drop, o, p, inside };
}

/** The invariants every plan keeps: in place or named, no rest overlap, routes clear of earlier slots, the shape. */
function holds(label, { g, members, o, p }) {
  assert.equal(p.none, false, `${label}: the leader goes`);
  const at = new Map();
  for (const m of members) {
    const e = p.members[m.id];
    if (e.stay) { assert.ok(p.stayed.includes(m.id), `${label}: ${m.id} stays unnamed`); at.set(m.id, m.start); continue; }
    assert.ok(e.atStart || (e.points.length >= 2 && dist(e.points.at(-1), e.slot) <= 0.05), `${label}: ${m.id} not in place`);
    assert.ok(g.walkable(m, e.slot), `${label}: ${m.id} rests in rock`);
    at.set(m.id, e.slot);
  }
  const ids = [...at.keys()];
  for (let a = 0; a < ids.length; a++) for (let b = a + 1; b < ids.length; b++) {
    assert.ok(dist(at.get(ids[a]), at.get(ids[b])) >= 1 - EPS, `${label}: ${ids[a]} and ${ids[b]} overlap at rest`);
  }
  const order = new Map(p.order.map((id, k) => [id, k]));
  for (const m of members.slice(1)) {
    const e = p.members[m.id];
    if (e.stay || e.atStart) continue;
    const earlier = members.filter(x => x.id !== m.id && x.id !== "m0" && order.get(x.id) < order.get(m.id) && !p.members[x.id].stay).map(x => ({ ...p.members[x.id].slot, r: 0.5 }));
    assert.equal(routeEnters(e.points, 0.5, [{ ...p.members.m0.slot, r: 0.5 }, ...earlier]), null, `${label}: ${m.id}'s route enters a member at rest`);
  }
  const L = p.members.m0.slot, u = p.lastStep;
  for (const m of members.slice(1)) {
    const e = p.members[m.id];
    if (e.stay) continue;
    assert.ok((e.slot.x - L.x) * u.x + (e.slot.y - L.y) * u.y <= EPS, `${label}: ${m.id} ahead of the leader at ${JSON.stringify(e.slot)}`);
  }
  const followers = members.slice(1).filter(m => !p.members[m.id].stay).map(m => ({ id: m.id, w: 1, h: 1, slot: p.members[m.id].slot }));
  assert.deepEqual(marchBreaches({ leader: members[0], at: L, behind: p.behind, lastStep: u, followers, standing: [], step: o.step, choke: p.choke }), [], `${label}: the shape`);
}

// Members inside the room (the leader too), per map, squares past the way in and group size: 0.10.1 / 0.10.2.
//   past 1: the leader stands in the way in; nobody can pass it without a diagonal squeeze past the frame (refused).
//   past 2: the nine free squares within 2.5 of the leader, not ahead of it, then the doorway; 12: two wait outside.
//   past 3: everyone (0.10.1: three).  past 5: no plug (beyond LEAD.plug); everyone, as 0.10.1.
const EXPECT = {
  1: { 4: 1, 8: 1, 12: 1 },
  2: { 4: 4, 8: 8, 12: 10 },
  3: { 4: 4, 8: 8, 12: 12 },
  5: { 4: 4, 8: 8, 12: 12 },
};

for (const name of Object.keys(MAPS)) {
  for (const past of [1, 2, 3, 5]) {
    test(`0.10.2 door plug (${name}, the leader ${past} square${past > 1 ? "s" : ""} past the way in, 4 / 8 / 12 members): ${Object.values(EXPECT[past]).join(" / ")} inside, nobody ahead of the leader, the rest behind outside`, () => {
      for (const n of [4, 8, 12]) {
        const r = plan(name, past, n);
        const label = `${name} past ${past}, ${n}`;
        holds(label, r);
        assert.deepEqual(r.p.stayed, [], `${label}: nobody named`);
        assert.equal(r.inside.length, EXPECT[past][n], `${label}: inside ${r.inside.map(m => m.id)}`);
        if (past === 5) assert.equal(r.p.choke, null, `${label}: deeper than LEAD.plug: no plug`);
        if (past === 2 || past === 3) {
          assert.ok(r.p.choke, `${label}: the plug opens`);
          // Before anyone waits outside, every square of the plug's inside holds a member.
          if (r.inside.length < n) {
            const held = new Set(r.members.map(m => r.p.members[m.id].slot).map(s => `${Math.floor(s.y)},${Math.floor(s.x)}`));
            const empty = r.p.choke.inside.filter(k => !held.has(k));
            assert.deepEqual(empty, [], `${label}: free squares inside while ${n - r.inside.length} wait outside`);
          }
        }
      }
    });
  }
}

test("0.10.2 door plug: the square just inside the way in fills last, so the way stays open while the room has space (two past, eight members)", () => {
  for (const name of Object.keys(MAPS)) {
    const r = plan(name, 2, 8);
    const just = { x: r.M.first + 0.5, y: 6.5 };
    assert.ok(r.members.every(m => dist(r.p.members[m.id].slot, just) > 0.5), `${name}: the square just inside is left free (${JSON.stringify(r.members.map(m => r.p.members[m.id].slot))})`);
  }
});

test("0.10.2 door plug, the trigger: none on open ground, in a one-wide tunnel (the line behind), on the doorway itself, deeper than LEAD.plug, or switched off", () => {
  // Open ground: the behind-only rule (the L1 test "eight dragged across an open room" keeps its shape).
  const open = gridWorld(room(22, 9, (i, j) => (i === 0 || i === 8 || j === 0 || j === 21) ? "#" : "."));
  const members = "LABCDEFG".split("").map((id, k) => ({ id, w: 1, h: 1, r: 0.5, start: { x: 2.5 + (k % 2), y: 2.5 + Math.floor(k / 2) } }));
  const p0 = planLead({ members, leaderId: "L", drop: { x: 15.5, y: 4.5 } }, oraclesOf(open));
  assert.equal(p0.choke, null, "open ground");
  // A one-wide tunnel: the leader rests in it (its square is narrow), the line behind it as before.
  const tunnel = gridWorld(`
########################
#........###############
#........###############
#.....................##
#........###############
#........###############
########################`);
  const four = [{ id: "L", start: { x: 6.5, y: 3.5 } }, { id: "A", start: { x: 6.5, y: 2.5 } }, { id: "B", start: { x: 5.5, y: 3.5 } }, { id: "C", start: { x: 5.5, y: 2.5 } }]
    .map(m => ({ ...m, w: 1, h: 1, r: 0.5 }));
  const pt = planLead({ members: four, leaderId: "L", drop: { x: 19.5, y: 3.5 } }, oraclesOf(tunnel));
  assert.equal(pt.choke, null, "in a tunnel");
  assert.deepEqual(["A", "B", "C"].map(id => pt.members[id].slot.x).sort((a, b) => b - a), [18.5, 17.5, 16.5], "the line behind the leader");
  // Dropped in the doorway (the one-wide square of the thick wall): no plug.
  const d = scenario("door", 0, 8);
  const pd = planLead({ members: d.members, leaderId: "m0", drop: { x: 9.5, y: 6.5 } }, oraclesOf(d.g));
  assert.equal(pd.choke, null, "on the doorway");
  // Deeper than LEAD.plug: four squares past a thick door is 3.6 of walk past its square (plug), five is 4.6 (none).
  assert.ok(plan("door", 4, 8).p.choke?.past <= LEAD.plug + EPS);
  assert.equal(plan("door", 5, 8).p.choke, null);
  // Switched off (o.plug 0; file.mjs never does): 0.10.1's plan, two inside.
  assert.equal(plan("door", 2, 8, { plug: 0 }).inside.length, 2);
  // A narrow point refused (file.mjs: one on a narrow way's tight squares): none.
  assert.equal(plan("door", 2, 8, { chokeOk: () => false }).p.choke, null);
});

test("0.10.2 door plug: a fight is unchanged (its turn plans with the leader at rest, `leaderAt`, its order with no search): the same squares with the plug switched off, and none opened", () => {
  for (const name of Object.keys(MAPS)) for (const past of [2, 3]) {
    const { g, members, drop } = scenario(name, past, 8);
    const at = { at: drop, from: { x: drop.x - 1, y: drop.y } };
    for (const m of members.slice(1)) {
      const spec = { members: [{ ...members[0], start: drop }, m], leaderId: "m0", leaderAt: at, standing: [] };
      const on = planLead(spec, oraclesOf(g)), off = planLead(spec, oraclesOf(g, { plug: 0 }));
      assert.equal(on.choke, null, `${name} past ${past}: ${m.id}'s turn opens no plug`);
      assert.deepEqual(on.members[m.id], off.members[m.id], `${name} past ${past}: ${m.id}'s square at its turn`);
    }
    // fightPlan: the order only, planLead with no route.
    const o = oraclesOf(g);
    delete o.route;
    const order = planLead({ members, leaderId: "m0", drop, standing: [] }, o);
    const orderOff = planLead({ members, leaderId: "m0", drop, standing: [] }, { ...o, plug: 0 });
    assert.equal(order.choke, null);
    assert.deepEqual(order.byWalk, orderOff.byWalk, `${name} past ${past}: the fight's order`);
  }
});

test("0.10.2 door plug: planning stays fast (eight and twelve two squares past a door, warm, median under 100 ms)", () => {
  for (const n of [8, 12]) {
    for (let k = 0; k < 3; k++) plan("door", 2, n);
    const times = [];
    for (let k = 0; k < 7; k++) { const t0 = performance.now(); plan("door", 2, n); times.push(performance.now() - t0); }
    times.sort((a, b) => a - b);
    assert.ok(times[3] < 100, `${n}: median ${times[3].toFixed(1)} ms`);
  }
});
