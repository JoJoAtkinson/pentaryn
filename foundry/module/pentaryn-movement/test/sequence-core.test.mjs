// A fight's group move by space, tier C (0.8.0, sequence-core; Joe's decision 2026-11-23), and tokens that start stacked.
// Pinned: walks whose swept corridors never meet set off together; the others wait for the ARRIVAL of each one before
// them whose corridor meets theirs; the order never walks one through another standing at its start or into one
// resting at its end; with no safe order the walk stops short. A seeded simulation checks the invariant: no two
// members ever come inside each other, and none inside a standing token (zero tolerance), at any time.
import { test } from "node:test";
import assert from "node:assert/strict";
import { corridorsMeet, cutsFor, onWay, segSeg, sequence, stacksOf, unsafeOrder, wayDistance } from "../sequence-core.mjs";
import { freePrefix } from "../group-core.mjs";

const W = (id, pts, r = 0.5) => ({ id, r, points: pts.map(([x, y]) => ({ x, y })) });
const cut = (points, r, circles) => freePrefix(points, r, circles, { allowed: c => Number.isInteger(c.x - 0.5) && Number.isInteger(c.y - 0.5) }).points;

test("segSeg / wayDistance: crossing segments are 0 apart, parallel ones their gap", () => {
  assert.equal(segSeg({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }), 0);
  assert.equal(segSeg({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 2, y: 1 }), 1);
  assert.equal(wayDistance([{ x: 0, y: 0 }, { x: 3, y: 0 }], [{ x: 1.5, y: 2 }]), 2);
});

test("corridors: touching is fine, coming inside is not", () => {
  assert.equal(corridorsMeet(W("a", [[0.5, 0.5], [5.5, 0.5]]), W("b", [[0.5, 1.5], [5.5, 1.5]])), false, "side by side, one square apart");
  assert.equal(corridorsMeet(W("a", [[0.5, 0.5], [5.5, 0.5]]), W("b", [[0.5, 1.4], [5.5, 1.4]])), true);
  assert.equal(onWay([{ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }], 0.5, { x: 3.5, y: 1.5 }, 0.5), false);
  assert.equal(onWay([{ x: 0.5, y: 0.5 }, { x: 5.5, y: 0.5 }], 0.5, { x: 3.5, y: 1.2 }, 0.5), true);
});

test("disjoint corridors run together", () => {
  const seq = sequence([W("a", [[0.5, 0.5], [5.5, 0.5]]), W("b", [[0.5, 2.5], [5.5, 2.5]]), W("c", [[0.5, 4.5], [5.5, 4.5]])]);
  assert.deepEqual(seq.together.sort(), ["a", "b", "c"]);
  assert.deepEqual(seq.after, { a: [], b: [], c: [] });
});

test("a file through a door: the one in front goes first; each behind sets off on the arrival of those before it", () => {
  // Three in a row heading east along y 0.5, each to a square past the next: the front one must go first, or the one
  // behind would walk into it standing.
  const a = W("a", [[2.5, 0.5], [6.5, 0.5]]), b = W("b", [[1.5, 0.5], [5.5, 0.5]]), c = W("c", [[0.5, 0.5], [4.5, 0.5]]);
  const seq = sequence([c, b, a]);                  // plan order the wrong way round
  assert.deepEqual(seq.order, ["a", "b", "c"], "the order that is safe, not plan order");
  assert.deepEqual(seq.together, ["a"]);
  assert.deepEqual(seq.after.b, ["a"]);
  assert.deepEqual(seq.after.c, ["a", "b"]);
  assert.equal(unsafeOrder(c, a), true, "c first would walk through a standing at its start");
  assert.equal(unsafeOrder(a, c), false);
  const kept = cutsFor([c, b, a], seq, cut);
  for (const w of [a, b, c]) assert.deepEqual(kept[w.id], w.points, `${w.id} walks its whole way`);
});

test("a swap with no safe order: the later one stops short of the other's start and end", () => {
  const a = W("a", [[0.5, 0.5], [4.5, 0.5]]), b = W("b", [[4.5, 0.5], [0.5, 0.5]]);
  const seq = sequence([a, b]);
  assert.deepEqual(seq.order, ["a", "b"], "plan order when neither is safe");
  const kept = cutsFor([a, b], seq, cut);
  // a walks while b stands at its start: a stops short of (4.5, 0.5), on a whole square; b then stays short of a.
  assert.ok(kept.a.at(-1).x <= 3.5 + 1e-9, JSON.stringify(kept.a));
  assert.ok(kept.b.length <= 2 && kept.b.at(-1).x >= kept.a.at(-1).x + 1 - 1e-9, JSON.stringify(kept.b));
});

/* A seeded simulation of sequenced walks: each member walks its kept way at its speed, setting off when every member it
 * waits for has arrived (plus a random latency per arrival event, 0-400 ms: the round trips and fog stalls that broke
 * timing). Asserts the invariant at every 10 ms: no pair of members inside each other, nobody inside a standing token. */
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
function along(pts, d) {
  for (let k = 1; k < pts.length; k++) {
    const L = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    if (d <= L) return { x: pts[k - 1].x + ((pts[k].x - pts[k - 1].x) * d) / L, y: pts[k - 1].y + ((pts[k].y - pts[k - 1].y) * d) / L };
    d -= L;
  }
  return pts.at(-1);
}
function lengthOf(pts) { let L = 0; for (let k = 1; k < pts.length; k++) L += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y); return L; }

function scenario(seed) {
  const r = rng(seed);
  const n = 2 + Math.floor(r() * 5);
  const taken = new Set();
  const cellFree = (x, y) => !taken.has(`${x},${y}`);
  const walks = [];
  for (let i = 0; i < n; i++) {
    let sx, sy, ex, ey;
    do { sx = Math.floor(r() * 8); sy = Math.floor(r() * 8); } while (!cellFree(sx, sy));
    taken.add(`${sx},${sy}`);
    do { ex = Math.floor(r() * 8); ey = Math.floor(r() * 8); } while (!cellFree(ex, ey) || (ex === sx && ey === sy));
    taken.add(`${ex},${ey}`);
    // An L-shaped way of whole squares (a fight walks square by square).
    const pts = [[sx, sy]];
    let x = sx, y = sy;
    while (x !== ex) { x += Math.sign(ex - x); pts.push([x, y]); }
    while (y !== ey) { y += Math.sign(ey - y); pts.push([x, y]); }
    walks.push(W(`m${i}`, pts.map(([px, py]) => [px + 0.5, py + 0.5])));
  }
  return { walks, r };
}

test("seeded: sequenced walks never meet, and never pass a member standing at its start or resting at its end (500 seeds)", () => {
  let together = 0, waited = 0, cutN = 0;
  for (let seed = 1; seed <= 500; seed++) {
    const { walks, r } = scenario(seed);
    const seq = sequence(walks);
    const kept = cutsFor(walks, seq, cut);
    const speed = 6 / 1000;                          // squares per ms
    const start = {}, end = {};
    for (const id of seq.order) {
      const deps = seq.after[id];
      const at = deps.length ? Math.max(...deps.map(d => end[d] + r() * 400)) : r() * 50;
      start[id] = at;
      end[id] = at + lengthOf(kept[id]) / speed;
      if (deps.length) waited += 1; else together += 1;
      if (kept[id].length !== walks.find(w => w.id === id).points.length) cutN += 1;
    }
    const tEnd = Math.max(...Object.values(end)) + 10;
    const pos = (id, t) => {
      const pts = kept[id];
      if (t <= start[id]) return pts[0];
      return along(pts, (t - start[id]) * speed);
    };
    for (let t = 0; t <= tEnd; t += 10) {
      for (let i = 0; i < walks.length; i++) {
        for (let j = i + 1; j < walks.length; j++) {
          const a = walks[i], b = walks[j];
          const p = pos(a.id, t), q = pos(b.id, t);
          const d = Math.hypot(p.x - q.x, p.y - q.y);
          assert.ok(d >= a.r + b.r - 1e-6, `seed ${seed} t ${t}: ${a.id} and ${b.id} ${d.toFixed(3)} apart (${JSON.stringify(seq)})`);
        }
      }
    }
  }
  assert.ok(together > 0 && waited > 0, `both kinds ran: ${together} together, ${waited} waited, ${cutN} cut`);
});

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
