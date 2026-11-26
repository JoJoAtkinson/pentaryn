// Characterisation pins for the motion half of pentaryn-movement (the cleanup's safety net): what pathfind-core,
// narrow-core, motion-core, group-adapter, pathfind-adapter, pathfind and drop do NOW, asserted value for value, so that
// a refactor (merging the two segmentsCross copies, tightening relax / simplify / roundTurns / checkWalk, trimming drop)
// that changes a behaviour fails here. Nothing in this file says what is RIGHT; a test marked ODD pins a behaviour that
// looks wrong and is left alone. The first half is pure (no Foundry); the second runs the module through the same
// synthetic world drop.test.mjs uses.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as pf from "../pathfind-core.mjs";
import * as mc from "../motion-core.mjs";
import * as nc from "../narrow-core.mjs";
import { DUNGEON } from "./fixtures/dungeon.mjs";
import { router, rng, judge } from "./fixtures/narrow.mjs";
import { movementWorld, drop, SCENE } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
/** Advance the mocked clock in 50 ms steps, as a page's timers run. */
function tickBy(ms) { for (let t = 0; t < ms; t += 50) mock.timers.tick(Math.min(50, ms - t)); }

// A clock only the tests move (the planner's budget reads performance.now).
const clock = { t: 0, step: 0 };
Object.defineProperty(globalThis, "performance", { value: { now: () => (clock.t += clock.step) }, configurable: true, writable: true });

// The pinned values that are too long to read inline (a seeded table, a route): name -> value, in the order the tests
// take them. `PIN_DUMP=1 node --test test/pin-motion.test.mjs` prints each as `PIN <name>[tab]<json>` for pasting here.
const PINS = {
// <PINS>
  "dungeon pairs": [{"k":0,"state":"found","size":1,"from":[20,1],"cost":75,"n":16,"steps":"N NE N N N N N N N N N NE N N NE","pulled":[[20,1],[16,2],[9,2],[5,4]]},{"k":1,"state":"found","size":2,"from":[4,15],"cost":30,"n":4,"steps":"SE SE SE","pulled":[[4,15],[7,18]]},{"k":2,"state":"found","size":1,"from":[23,28],"cost":115,"n":24,"steps":"SW SW SW W W W W W W W W W W W W W W W W W W W NW","pulled":[[23,28],[26,25],[26,6],[25,5]]},{"k":3,"state":"found","size":2,"from":[5,37],"cost":55,"n":12,"steps":"W W W W W W W W W W W","pulled":[[5,37],[5,26]]},{"k":4,"state":"found","size":1,"from":[27,29],"cost":175,"n":36,"steps":"NW W W W W W W W W W W W W W W W W W NW NW NW NW NW NW NW W NW N N N N N N N NW","pulled":[[27,29],[26,21],[26,11],[18,2],[11,2],[10,1]]},{"k":5,"state":"found","size":2,"from":[6,33],"cost":40,"n":9,"steps":"W W W W W W W SW","pulled":[[6,33],[7,25]]},{"k":6,"state":"found","size":1,"from":[8,26],"cost":240,"n":49,"steps":"E E SE SE SE S S S S S S SW SW SW SW SW S S S SW W W W W W W W W W W W W W W NW NW NW NW NW NW NW W NW N N N N NE","pulled":[[8,26],[11,31],[17,31],[26,25],[26,11],[18,2],[14,2],[13,3]]},{"k":7,"state":"found","size":2,"from":[6,4],"cost":5,"n":2,"steps":"S","pulled":[[6,4],[7,4]]},{"k":8,"state":"found","size":1,"from":[19,5],"cost":145,"n":30,"steps":"SE SE SE SE SE S SE E E E E E E E E E E E E E E NE NE NE NE NE E E NE","pulled":[[19,5],[26,11],[26,25],[20,33]]},{"k":9,"state":"found","size":2,"from":[3,3],"cost":15,"n":4,"steps":"SE S SE","pulled":[[3,3],[6,5]]},{"k":10,"state":"found","size":1,"from":[26,8],"cost":115,"n":24,"steps":"N N NW NW NW NW NW NW N N N N N N N NE NE NE NE NE NE N NE","pulled":[[26,8],[18,2],[11,2],[3,9]]},{"k":11,"state":"found","size":2,"from":[7,16],"cost":25,"n":4,"steps":"E E NE","pulled":[[7,16],[6,19]]},{"k":12,"state":"found","size":1,"from":[20,31],"cost":220,"n":45,"steps":"SW SW SW SW SW SW W W W W W W W W W W W W W W NW NW NW NW NW NW NW W NW N N N N N N N NE NE NE NE NE NE NE N","pulled":[[20,31],[26,25],[26,11],[18,2],[11,2],[3,9]]},{"k":13,"state":"found","size":2,"from":[5,27],"cost":40,"n":9,"steps":"NE NE E E E E E E","pulled":[[5,27],[3,29],[3,35]]},{"k":14,"state":"found","size":1,"from":[21,1],"cost":105,"n":22,"steps":"E E E E E SE SE SE SE SE E E E E E E E E E E E","pulled":[[21,1],[26,12],[26,22]]},{"k":15,"state":"found","size":2,"from":[4,8],"cost":25,"n":6,"steps":"W W W W SW","pulled":[[4,8],[5,3]]},{"k":16,"state":"found","size":1,"from":[6,28],"cost":95,"n":20,"steps":"S S SE SE SE S S S S S S S S SE S SE S S SE","pulled":[[6,28],[9,29],[11,31],[19,31],[25,34]]},{"k":17,"state":"found","size":2,"from":[1,33],"cost":20,"n":5,"steps":"SE E E SE","pulled":[[1,33],[3,37]]},{"k":18,"state":"found","size":1,"from":[12,2],"cost":310,"n":63,"steps":"S S S S S S SE E SE SE SE SE SE SE SE E E E E E E E E E E E E E E NE N N N NE NE NE NE NE N N N N N N NW W W W W NW W W NW W NW NW NW W W W NW W","pulled":[[12,2],[18,2],[26,11],[26,25],[24,26],[17,31],[11,31],[10,29],[9,23],[5,18],[4,13]]},{"k":19,"state":"found","size":2,"from":[8,7],"cost":30,"n":7,"steps":"N N N N NW N","pulled":[[8,7],[2,6]]}],
  "squareEntries straight": [{"x":0.5,"y":0.5,"checkpoint":false},{"x":1,"y":0.5,"checkpoint":true},{"x":2,"y":0.5,"checkpoint":true},{"x":2.5,"y":0.5,"checkpoint":true}],
  "slit one-way": [[1,"west to east",16,0.2],[1,"east to west","none"],[2,"west to east","none"],[2,"east to west",15,0.19]],
  "S05 routes": {"hero1 -> dropB":{"found":true,"n":40,"narrow":true,"fine":true,"minClearance":0.1862,"settled":true,"sum":23517.99,"end":{"x":7,"y":45}},"hero2 -> dropB":{"found":true,"n":38,"narrow":true,"fine":true,"minClearance":0.1914,"settled":true,"sum":22518.16,"end":{"x":7,"y":45}},"hero3 -> dropB":{"found":true,"n":39,"narrow":true,"fine":true,"minClearance":0.1881,"settled":true,"sum":22987.09,"end":{"x":7,"y":45}},"hero4 -> dropB":{"found":true,"n":41,"narrow":true,"fine":true,"minClearance":0.1872,"settled":true,"sum":23937.68,"end":{"x":7,"y":45}},"hero1 -> dropMid":{"found":true,"n":21,"narrow":true,"fine":true,"minClearance":0.1919,"settled":true,"sum":11239.65,"end":{"x":16,"y":38.5}},"hero1 -> dropStair45":{"found":true,"n":14,"narrow":true,"fine":true,"minClearance":0.2975,"settled":true,"sum":7127.04,"end":{"x":14.2426,"y":34.2574}},"hero1 -> dropA":{"found":true,"n":2,"narrow":false,"fine":false,"minClearance":null,"settled":null,"sum":960,"end":{"x":7,"y":32}},"dropB -> dropA":{"found":true,"n":40,"narrow":true,"fine":true,"minClearance":0.1903,"settled":true,"sum":23397.43,"end":{"x":7,"y":32}},"dropA -> dropB":{"found":true,"n":38,"narrow":true,"fine":true,"minClearance":0.188,"settled":true,"sum":22473.61,"end":{"x":7,"y":45}},"dropMid -> dropB":{"found":true,"n":21,"narrow":true,"fine":true,"minClearance":0.1947,"settled":true,"sum":13540.7,"end":{"x":7,"y":45}},"dropMid -> dropA":{"found":true,"n":21,"narrow":true,"fine":true,"minClearance":0.1947,"settled":true,"sum":11130.25,"end":{"x":7,"y":32}}},
  "S05 fight routes": {"hero1 -> dropB":{"found":true,"n":62,"narrow":true,"fine":true,"minClearance":0.1899,"settled":true,"sum":36865.24,"end":{"x":7,"y":45},"checkpoints":24,"narrowPts":57},"hero2 -> dropB":{"found":true,"n":62,"narrow":true,"fine":true,"minClearance":0.1899,"settled":true,"sum":36851.24,"end":{"x":7,"y":45},"checkpoints":24,"narrowPts":57}},
  "S05 long scenario": {"medium":{"found":true,"n":41,"narrow":true,"fine":true,"minClearance":0.1862,"settled":true,"sum":24172.98,"end":{"x":7,"y":45}},"large":{"found":true,"n":6,"narrow":false,"fine":false,"minClearance":null,"settled":null,"sum":2896,"end":{"x":7.5,"y":45.5},"cost":33},"shut":{"found":false,"state":"none"}},
  "S06 routes": {"dropScurve from hero1":{"found":true,"n":35,"narrow":true,"fine":true,"minClearance":0.4867,"settled":true,"sum":21754.43,"end":{"x":45.25,"y":29.5}},"dropScurve from hero2":{"found":true,"n":36,"narrow":true,"fine":true,"minClearance":0.4876,"settled":true,"sum":22380.64,"end":{"x":45.25,"y":29.5}},"dropDiag from hero1":{"found":true,"n":34,"narrow":true,"fine":true,"minClearance":0.196,"settled":true,"sum":22775.5,"end":{"x":45.25,"y":33}},"dropDiag from hero2":{"found":true,"n":38,"narrow":true,"fine":true,"minClearance":0.195,"settled":true,"sum":25440.41,"end":{"x":45.25,"y":33}},"dropFunnel from hero1":{"found":true,"n":18,"narrow":true,"fine":true,"minClearance":0.15,"settled":true,"sum":12627.64,"end":{"x":45.25,"y":36.5}},"dropFunnel from hero2":{"found":true,"n":11,"narrow":false,"fine":false,"minClearance":null,"settled":null,"sum":7838.25,"end":{"x":45.25,"y":36.5}},"dropSlit from hero1":{"found":false,"state":"none"},"dropSlit from hero2":{"found":false,"state":"none"},"dropHairpin from hero1":{"found":true,"n":42,"narrow":true,"fine":true,"minClearance":0.4879,"settled":true,"sum":33598.14,"end":{"x":29.5,"y":44}},"dropHairpin from hero2":{"found":true,"n":39,"narrow":true,"fine":true,"minClearance":0.4872,"settled":true,"sum":31431.01,"end":{"x":29.5,"y":44}},"dropField from hero1":{"found":true,"n":62,"narrow":true,"fine":true,"minClearance":0.3139,"settled":true,"sum":52497.01,"end":{"x":47.5,"y":47}},"dropField from hero2":{"found":true,"n":62,"narrow":true,"fine":true,"minClearance":0.314,"settled":true,"sum":52787.45,"end":{"x":47.5,"y":47}}},
  "S05 fight charge": {"walked":121,"charged":135,"entered":27,"points":62,"end":[600,4400],"offGrid":57,"checkpoints":30},
  "S05 route api": {"n":38,"cost":125,"arcs":0,"minClearance":0.186,"legs":[{"state":"found","nodes":78,"corners":36,"arcs":0,"narrow":true,"minClearance":0.1862}],"sum":2183883},
  "S05 route api goal": {"goal":{"x":1550,"y":3799},"end":{"x":1550,"y":3799},"n":21,"narrow":true},
  "confirmLater large partial": {"ids":["clmA000000000001"],"wps":[[350,200,false,false],[400,200,true,true]]},
  "aroundLater round": [[200,200,false],[400,200,false],[500,100,true]],
  "aroundLater short": [[399,100,true,true]],
  "walkOne throws": ["Did not move, the group's walk was ended: wlkD000000000001, wlkE000000000001."],
  "walkOne rejects": ["Did not move, the group's walk was ended: wlkD000000000001, wlkE000000000001."],
// </PINS>
};
/** A pinned dataset: compared to PINS[name] (or printed under PIN_DUMP). */
function pin(name, got) {
  if (process.env.PIN_DUMP) { console.log(`PIN ${name}\t${JSON.stringify(got)}`); return; }
  assert.ok(name in PINS, `no pinned value for ${name}`);
  assert.deepEqual(got, PINS[name], name);
}
const r4 = x => (x === null || x === undefined ? x : Math.round(x * 1e4) / 1e4);
const r2 = x => (x === null || x === undefined ? x : Math.round(x * 1e2) / 1e2);

/* ============================================ */
/*  pathfind-core: constants and rules          */
/* ============================================ */

test("pathfind-core constants are frozen at today's values", () => {
  assert.deepEqual({ ...pf.LIMITS }, { maxNodes: 6000, sliceMs: 8, totalMs: 1500, waitMs: 4000, margin: 8, arcStepDeg: 40, arcMaxCells: 2, arcTries: 4 });
  assert.ok(Object.isFrozen(pf.LIMITS));
  assert.deepEqual([...pf.PATHFIND_MODES], ["everyone", "gm", "off"]);
  assert.ok(Object.isFrozen(pf.PATHFIND_MODES));
  assert.equal(pf.DEFAULT_PATHFIND, "everyone");
  assert.equal(pf.SECRET_DOOR, 2);
  assert.deepEqual([...pf.MOVE_ON_ENTER], ["teleportToken", "changeLevel"]);
  assert.ok(Object.isFrozen(pf.MOVE_ON_ENTER));
});

test("skipReason table: every early return, in order", () => {
  const base = { mode: "everyone", mine: true, isGM: false, gridType: 1, constrain: {}, waypoints: 2 };
  const row = o => pf.skipReason({ ...base, ...o });
  assert.equal(row({}), null);
  assert.equal(row({ mode: "off" }), "off");
  assert.equal(row({ mode: "gm" }), "gmOnly", "the GM-only mode, as a player");
  assert.equal(row({ mode: "gm", isGM: true }), null);
  assert.equal(row({ mine: false }), "client");
  assert.equal(row({ gridType: 0 }), "grid");
  assert.equal(row({ gridType: 2 }), "grid");
  assert.equal(row({ constrain: { ignoreWalls: true } }), "unconstrained");
  assert.equal(row({ waypoints: 1 }), "short");
  assert.equal(row({ mode: "off", mine: false, gridType: 0 }), "off", "off wins over everything after it");
  assert.equal(row({ mode: "gm", mine: false }), "gmOnly", "gmOnly before client");
  assert.equal(row({ mine: false, gridType: 0 }), "client", "client before grid");
  assert.equal(row({ gridType: 0, constrain: { ignoreWalls: true }, waypoints: 0 }), "grid");
  assert.equal(row({ constrain: { ignoreWalls: true }, waypoints: 0 }), "unconstrained", "unconstrained before short");
  assert.equal(row({ mode: "zzz" }), null, "an unknown mode falls back to everyone");
  assert.equal(row({ mode: "zzz", mine: false }), "client");
  // The defaults: waypoints 0 is short, even for the GM in GM-only mode.
  assert.equal(pf.skipReason({ mode: "gm", mine: true, isGM: true, gridType: 1 }), "short");
  // ODD: ignoreCost alone is not "unconstrained" (only ignoreWalls is); with the default waypoints it reads "short".
  assert.equal(pf.skipReason({ mode: "everyone", mine: true, isGM: false, gridType: 1, constrain: { ignoreCost: true } }), "short");
  assert.equal(row({ constrain: { ignoreCost: true } }), null, "with two waypoints, ignoreCost goes on to be pathfound");
});

test("searchOver: a drag's search is over past 1500 ms of its own slices or 4000 ms of wall clock", () => {
  assert.equal(pf.searchOver(), false);
  assert.equal(pf.searchOver({ busy: 1500 }), false);
  assert.equal(pf.searchOver({ busy: 1501 }), true);
  assert.equal(pf.searchOver({ wall: 4000 }), false);
  assert.equal(pf.searchOver({ wall: 4001 }), true);
  assert.equal(pf.searchOver({ busy: 200, wall: 1600 }), false);
});

test("boundsFor: the start / goal box padded by max(margin, half the distance), clipped to a limit", () => {
  assert.deepEqual(pf.boundsFor({ i: 0, j: 0 }, { i: 30, j: 4 }), { minI: -15, maxI: 45, minJ: -15, maxJ: 19 });
  assert.deepEqual(pf.boundsFor({ i: 0, j: 0 }, { i: 30, j: 4 }, { minI: 0, maxI: 10, minJ: 0, maxJ: 10 }), { minI: 0, maxI: 10, minJ: 0, maxJ: 10 });
  assert.deepEqual(pf.boundsFor({ i: 5, j: 5 }, { i: 6, j: 7 }), { minI: -3, maxI: 14, minJ: -3, maxJ: 15 }, "the default margin of 8 cells");
  assert.deepEqual(pf.boundsFor({ i: 5, j: 5 }, { i: 6, j: 7 }, null, 2), { minI: 3, maxI: 8, minJ: 3, maxJ: 9 }, "a given margin");
  assert.deepEqual(pf.boundsFor({ i: 9, j: 9 }, { i: 1, j: 2 }), { minI: -7, maxI: 17, minJ: -6, maxJ: 17 }, "either way round");
});

test("directPath is Foundry's square-grid walk; cornerOk refuses a diagonal whose two orthogonal routes are both walled", () => {
  assert.deepEqual(pf.directPath({ i: 0, j: 0 }, { i: 1, j: 3 }), [{ i: 0, j: 0 }, { i: 0, j: 1 }, { i: 1, j: 2 }, { i: 1, j: 3 }]);
  assert.deepEqual(pf.directPath({ i: 2, j: 2 }, { i: 2, j: 2 }), [{ i: 2, j: 2 }]);
  assert.deepEqual(pf.directPath({ i: 3, j: 0 }, { i: 0, j: 0 }).map(n => n.i), [3, 2, 1, 0]);
  const a = { i: 0, j: 0 }, b = { i: 1, j: 1 };
  const key = (p, q) => `${p.i},${p.j}>${q.i},${q.j}`;
  const shut = (...pairs) => { const bad = new Set(pairs); return (p, q) => !bad.has(key(p, q)); };
  // The route over (0,1): a→(0,1)→b; the route over (1,0): a→(1,0)→b.
  assert.equal(pf.cornerOk(a, b, shut()), true);
  assert.equal(pf.cornerOk(a, b, shut("0,0>0,1")), true, "one orthogonal route open is enough");
  assert.equal(pf.cornerOk(a, b, shut("0,0>0,1", "0,0>1,0")), false, "both walled");
  assert.equal(pf.cornerOk(a, b, shut("0,1>1,1", "1,0>1,1")), false);
  assert.equal(pf.cornerOk(a, b, shut("0,0>0,1", "1,0>1,1")), false, "each route cut at a different step");
  assert.equal(pf.cornerOk(a, { i: 0, j: 1 }, () => false), true, "an orthogonal step has no corner");
});

test("arcSegments and filletPoints", () => {
  assert.equal(pf.arcSegments(Math.PI / 2, 1, 0.05), 3);
  assert.equal(pf.arcSegments(Math.PI / 2, 1, 1), 1, "an error bound at or over the radius: one chord");
  assert.equal(pf.arcSegments(Math.PI / 2, 1, 5), 1);
  assert.equal(pf.arcSegments(0, 1, 0.05), 1, "no turn: one chord");
  assert.equal(pf.arcSegments(1, 0, 0.05), 1);
  assert.equal(pf.arcSegments(1, 1, 0), 1);
  assert.equal(pf.arcSegments(Math.PI, 10, 0.05), 16);
  const z = { x: 0, y: 0 };
  assert.equal(pf.filletPoints(z, z, { x: 1, y: 1 }, 0.5), null, "a zero-length leg");
  assert.equal(pf.filletPoints({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 1, y: 1 }, 0.5), null);
  assert.equal(pf.filletPoints({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, 20), null, "a tangent longer than a leg");
  const arc = pf.filletPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, 100);
  assert.deepEqual(arc.map(p => ({ x: r4(p.x), y: r4(p.y) })), [{ x: 200, y: 0 }, { x: 250, y: 13.3975 }, { x: 286.6025, y: 50 }, { x: 300, y: 100 }]);
  const fine = pf.filletPoints({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, 100, 40, { maxError: 1 });
  assert.equal(fine.length, pf.arcSegments(Math.PI / 2, 100, 1) + 1, "a finer arc where the error bound needs it");
});

test("avoidRegion: a move-on-enter region is avoided; a hidden one only for the GM; a disabled behaviour or any other type never", () => {
  const r = (type, extra = {}) => ({ behaviors: [{ type }], ...extra });
  assert.equal(pf.avoidRegion(r("teleportToken")), true);
  assert.equal(pf.avoidRegion(r("changeLevel")), true);
  assert.equal(pf.avoidRegion(r("teleportToken", { hidden: true })), false, "hidden, for a player");
  assert.equal(pf.avoidRegion(r("teleportToken", { hidden: true }), { isGM: false }), false);
  assert.equal(pf.avoidRegion(r("changeLevel", { hidden: true }), { isGM: true }), true, "hidden changeLevel, for the GM");
  assert.equal(pf.avoidRegion({ behaviors: [{ type: "teleportToken", disabled: true }] }), false);
  assert.equal(pf.avoidRegion(r("executeScript")), false);
  assert.equal(pf.avoidRegion({ behaviors: [{ type: "executeScript" }, { type: "teleportToken" }] }), true, "any one of its behaviours");
  assert.equal(pf.avoidRegion({ behaviors: [] }), false);
  assert.equal(pf.avoidRegion({}), false);
  assert.equal(pf.avoidRegion(null), false);
});

test("reachedCount counts explicit waypoints a path passes through, in order", () => {
  const same = (a, b) => a.x === b.x;
  assert.equal(pf.reachedCount([{ x: 1 }, { x: 2 }, { x: 3 }], [{ x: 1 }, { x: 3 }], same), 2);
  assert.equal(pf.reachedCount([{ x: 1 }, { x: 2 }], [{ x: 1 }, { x: 3 }], same), 1);
  assert.equal(pf.reachedCount([{ x: 3 }, { x: 1 }], [{ x: 1 }, { x: 3 }], same), 1, "in order: 3 first does not count");
  assert.equal(pf.reachedCount([], [{ x: 1 }], same), 0);
  assert.equal(pf.reachedCount(null, [{ x: 1 }], same), 0);
  assert.equal(pf.reachedCount([{ x: 1 }], [], same), 0);
});

/* ============================================ */
/*  The two segmentsCross copies                */
/* ============================================ */

test("the two segmentsCross copies (motion-core, pathfind-core) agree on 200 seeded rows, collinear overlap and end touch included", () => {
  const rand = rng(20260);
  let yes = 0;
  const pt = () => ({ x: Math.floor(rand() * 5), y: Math.floor(rand() * 5) });
  for (let k = 0; k < 200; k++) {
    // A coarse integer lattice makes collinear overlaps and end touches common.
    const p = pt(), q = pt(), a = pt(), b = pt();
    const A = pf.segmentsCross(p, q, a, b), B = mc.segmentsCross(p, q, a, b);
    assert.equal(A, B, `row ${k}: ${JSON.stringify([p, q, a, b])}`);
    if (A) yes += 1;
  }
  const cases = [
    [[0, 0], [4, 0], [2, 0], [6, 0], true],      // collinear overlap
    [[0, 0], [2, 0], [2, 0], [6, 0], true],      // collinear, end to end
    [[0, 0], [1, 0], [2, 0], [6, 0], false],     // collinear, apart
    [[0, 0], [2, 2], [2, 2], [4, 0], true],      // end touch
    [[0, 0], [2, 0], [1, 0], [1, 3], true],      // a T: one end on the other's middle
    [[0, 0], [2, 2], [0, 2], [2, 0], true],      // a proper cross
    [[0, 0], [2, 0], [0, 1], [2, 1], false],     // parallel
    [[0, 0], [0, 0], [0, 0], [3, 0], true],      // a point on a segment
    [[0, 0], [0, 0], [1, 0], [3, 0], false],     // a point off it
  ];
  for (const [p, q, a, b, want] of cases) {
    const P = { x: p[0], y: p[1] }, Q = { x: q[0], y: q[1] }, A = { x: a[0], y: a[1] }, B = { x: b[0], y: b[1] };
    assert.equal(pf.segmentsCross(P, Q, A, B), want, `pathfind-core ${JSON.stringify([p, q, a, b])}`);
    assert.equal(mc.segmentsCross(P, Q, A, B), want, `motion-core ${JSON.stringify([p, q, a, b])}`);
    assert.equal(pf.segmentsCross(Q, P, B, A), want, "either way round");
  }
  assert.equal(yes, 71, "the table's crossing rows");
});

/* ============================================ */
/*  A* and string pulling on the dungeon        */
/* ============================================ */

const FT = 5;
/**
 * The dungeon (test/fixtures/dungeon.mjs) as a step test, the way pathfind-core.test builds one from an ASCII map:
 * '#' solid, '.' open; this file's extras: a closed door D on the corridor between rooms A and B, a mud patch
 * (double cost), a one-way wall (blocks moving east across the line x = 30 for rows 5-9) and a size for the token
 * (nodes are the top-left square of its footprint).
 */
function dungeonWorld({ size = 1, door = false, mud = false, oneWay = false } = {}) {
  const rows = DUNGEON.split("\n").filter(Boolean).map(r => [...r]);
  if (door) rows[5][11] = "D";
  if (mud) for (let i = 6; i <= 9; i++) for (let j = 14; j <= 18; j++) rows[i][j] = "~";
  const H = rows.length, W = rows[0].length;
  const at = (i, j) => (i < 0 || j < 0 || i >= H || j >= W ? "#" : rows[i][j]);
  const solid = (i, j) => "#D".includes(at(i, j));
  const gate = (i, j, di, dj) => oneWay && di === 0 && dj === 1 && j + 1 === 30 && i >= 5 && i <= 9;
  const unit = (i, j, di, dj) => !solid(i + di, j + dj) && !gate(i, j, di, dj);
  const cells = n => { const out = []; for (let a = 0; a < size; a++) for (let b = 0; b < size; b++) out.push([n.i + a, n.j + b]); return out; };
  const orth = (a, b) => cells(a).every(([i, j]) => unit(i, j, b.i - a.i, b.j - a.j));
  const wall = (a, b) => {
    const di = b.i - a.i, dj = b.j - a.j;
    if (!di || !dj) return orth(a, b);
    return cells(a).every(([i, j]) => !solid(i + di, j + dj)
      && ((unit(i, j, di, 0) && unit(i + di, j, 0, dj)) || (unit(i, j, 0, dj) && unit(i, j + dj, di, 0))));
  };
  const edge = (a, b) => (!wall(a, b) ? null : cells(b).some(([i, j]) => at(i, j) === "~") ? 2 * FT : FT);
  const lineOk = (a, b) => pf.chainCost(a, b, { edge, wall }) !== null;
  const fits = n => cells(n).every(([i, j]) => !solid(i, j));
  return { edge, wall, lineOk, fits, H, W, bounds: { minI: 0, maxI: H - size, minJ: 0, maxJ: W - size } };
}
/** A path as one compact string, a letter pair a step (N S and E W), readable in a diff. */
const stepsOf = path => path.slice(1).map((n, k) => {
  const di = n.i - path[k].i, dj = n.j - path[k].j;
  return (di < 0 ? "N" : di > 0 ? "S" : "") + (dj < 0 ? "W" : dj > 0 ? "E" : "");
}).join(" ");

test("A* plus stringPull over the dungeon: 20 seeded start / goal pairs (a shut door, mud, a one-way wall, a 2x2 token) pin their node path, cost and pulled points", () => {
  const rand = rng(777);
  const worlds = [dungeonWorld({ door: true, mud: true, oneWay: true }), dungeonWorld({ size: 2, door: true, mud: true, oneWay: true })];
  // A 2x2 does not fit the one-wide corridors, so its pairs share one of the three rooms (A, B, D).
  const rooms = [{ i: [1, 9], j: [1, 9] }, { i: [1, 9], j: [13, 21] }, { i: [1, 9], j: [25, 37] }];
  const pick = (w, room = null) => {
    for (;;) {
      const n = room ? { i: room.i[0] + Math.floor(rand() * (room.i[1] - room.i[0] + 1)), j: room.j[0] + Math.floor(rand() * (room.j[1] - room.j[0] + 1)) }
        : { i: Math.floor(rand() * w.H), j: Math.floor(rand() * w.W) };
      if (w.fits(n)) return n;
    }
  };
  const got = [];
  for (let k = 0; k < 20; k++) {
    const w = worlds[k % 2];
    const room = k % 2 ? rooms[Math.floor(rand() * rooms.length)] : null;
    const start = pick(w, room), goal = pick(w, room);
    const job = pf.search({ start, goal, edge: w.edge, wall: w.wall, unit: FT, bounds: w.bounds });
    const state = job.run();
    if (state !== "found") { got.push({ k, state }); continue; }
    const pulled = pf.stringPull(job.path, job.costs, { edge: w.edge, wall: w.wall, lineOk: w.lineOk });
    got.push({ k, state, size: k % 2 + 1, from: [start.i, start.j], cost: job.costs.at(-1), n: job.path.length, steps: stepsOf(job.path), pulled: pulled.map(n => [n.i, n.j]) });
  }
  pin("dungeon pairs", got);
  // Whatever it found, the pulled line costs what the A* path did.
  for (const g of got) {
    if (g.state !== "found") continue;
    const w = worlds[g.k % 2];
    let c = 0;
    for (let m = 1; m < g.pulled.length; m++) c += pf.chainCost({ i: g.pulled[m - 1][0], j: g.pulled[m - 1][1] }, { i: g.pulled[m][0], j: g.pulled[m][1] }, w);
    assert.equal(c, g.cost, `pair ${g.k}: pulled cost`);
  }
});

/* ============================================ */
/*  motion-core                                 */
/* ============================================ */

test("MOTION constants are frozen at today's values", () => {
  assert.ok(Object.isFrozen(mc.MOTION));
  assert.deepEqual({ ...mc.MOTION }, {
    restGap: 0.2, motionGap: 0.75, contact: 0.15, delayStep: 150, maxDelay: 3000, waveMs: 150, chordError: 0.05,
    cornerPoints: 8, routePoints: 64, speed: 6, checkpointEvery: 1, armMs: 400,
  });
  assert.equal(mc.GROUP_MAX, 24);
});

test("wallOpenFrom: a one-way wall lets a move through only from the side it names; a plain wall, a point on its line, or bad input never", () => {
  const c = [0, 0, 0, 10];
  assert.equal(mc.wallOpenFrom(c, 1, { x: -1, y: 5 }), true);
  assert.equal(mc.wallOpenFrom(c, 1, { x: 1, y: 5 }), false, "the same wall from the other side");
  assert.equal(mc.wallOpenFrom(c, 2, { x: 1, y: 5 }), true, "direction 2 opens from that side");
  assert.equal(mc.wallOpenFrom(c, 2, { x: -1, y: 5 }), false);
  assert.equal(mc.wallOpenFrom(c, 0, { x: 1, y: 5 }), false, "no direction: a plain wall");
  assert.equal(mc.wallOpenFrom(c, 0, { x: -1, y: 5 }), false);
  assert.equal(mc.wallOpenFrom(c, 1, { x: 0, y: 5 }), false, "a point on the line");
  assert.equal(mc.wallOpenFrom(c, "1", { x: -1, y: 5 }), true, "a direction given as a string");
  assert.equal(mc.wallOpenFrom([0, 0], 1, { x: -1, y: 5 }), false);
  assert.equal(mc.wallOpenFrom(c, 1, null), false);
  // The narrow field's own copy (narrow-core openFrom) reads a one-way wall the same way (through lineCross).
  const f = nc.narrowField([], { lines: [{ c, dir: 1 }] });
  assert.equal(f.lineCross({ x: -1, y: 5 }, { x: 1, y: 5 }), !mc.wallOpenFrom(c, 1, { x: -1, y: 5 }));
  assert.equal(f.lineCross({ x: 1, y: 5 }, { x: -1, y: 5 }), !mc.wallOpenFrom(c, 1, { x: 1, y: 5 }));
});

test("cellChain: every cell a route passes, a checkpoint on every `every`-th and the last", () => {
  const chain = mc.cellChain([{ i: 0, j: 0 }, { i: 2, j: 3 }]);
  assert.equal(chain.length, 4);
  assert.deepEqual(chain.map(c => [c.i, c.j]), [[0, 0], [1, 1], [1, 2], [2, 3]]);
  assert.deepEqual(chain.map(c => c.checkpoint), [false, true, true, true], "the start is no checkpoint, the rest are");
  const five = mc.cellChain([{ i: 0, j: 0 }, { i: 0, j: 4 }], 2);
  assert.equal(five.length, 5);
  assert.deepEqual(five.map(c => c.checkpoint), [false, false, true, false, true], "every 2nd (index 2) and the last");
  assert.deepEqual(mc.cellChain([{ i: 3, j: 3 }]).map(c => c.checkpoint), [true], "a single node: its one cell is the last, so a checkpoint");
  assert.equal(mc.cellChain([{ i: 3, j: 3 }]).length, 1);
  const two = mc.cellChain([{ i: 0, j: 0 }, { i: 0, j: 2 }, { i: 1, j: 2 }]);
  assert.deepEqual(two.map(c => [c.i, c.j, c.checkpoint]), [[0, 0, false], [0, 1, true], [0, 2, true], [1, 2, true]]);
});

test("fightWalk: how far a fight member walks, where it may rest, why it stops", () => {
  // Speed: left 12 ft over costs 0,5,10,15,20 reaches square 2.
  assert.deepEqual(mc.fightWalk(5, { costs: [0, 5, 10, 15, 20], left: 12 }), { end: 2, paid: 2, checkpoints: [false, true, true], short: true, why: "speed" });
  // Free squares: square 2 is inside a token; no costs: walk the whole way, no checkpoint on the inside square.
  assert.deepEqual(mc.fightWalk(5, { free: k => k !== 2 }), { end: 4, paid: 4, checkpoints: [false, true, false, true, true], short: false, why: null });
  // Square 4 (the last) taken, with 20 ft left over the same costs: end 3, paid 4, short, "speed".
  assert.deepEqual(mc.fightWalk(5, { free: k => k !== 4, left: 20, costs: [0, 5, 10, 15, 20] }), { end: 3, paid: 4, checkpoints: [false, true, true, true], short: true, why: "speed" });
  // ODD: a free() that throws reads as "not free" for every square: end 0, paid every square, short with no reason.
  assert.deepEqual(mc.fightWalk(4, { free: () => { throw new Error("boom"); } }), { end: 0, paid: 3, checkpoints: [false], short: true, why: null });
  assert.deepEqual(mc.fightWalk(1), { end: 0, paid: 0, checkpoints: [false], short: false, why: null });
  // No usable speed (left not finite, or no costs): the whole way.
  assert.equal(mc.fightWalk(5, { costs: [0, 5, 10, 15, 20], left: NaN }).end, 4);
  assert.equal(mc.fightWalk(5, { left: 5 }).end, 4, "a speed with no costs to read it against");
  assert.equal(mc.fightWalk(5, { costs: [0, 5, 10, 15, 20], left: 0 }).end, 0, "nothing left: it does not move");
  assert.equal(mc.fightWalk(5, { costs: [0, 5, 10, 15, 20], left: 20 }).short, false, "exactly enough");
});

test("trajectory and positionAt: linear per segment at the speed given, after the delay; before the start / after the end it rests", () => {
  const tr = mc.trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }], { speed: 6, delay: 100 });
  assert.deepEqual(tr.times, [100, 1100]);
  assert.deepEqual([tr.start, tr.end], [100, 1100]);
  assert.deepEqual(mc.positionAt(tr, 600), { x: 3, y: 0 });
  assert.deepEqual(mc.positionAt(tr, 50), { x: 0, y: 0 });
  assert.deepEqual(mc.positionAt(tr, 5000), { x: 6, y: 0 });
  // Difficulty slows a segment (capped at 10, floored at 1).
  const slow = mc.trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 6 }], { speed: 6, difficulty: [2, 99] });
  assert.deepEqual(slow.times.map(t => Math.round(t)), [0, 2000, 12000]);
  assert.deepEqual(mc.trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }], { difficulty: [0.1] }).times, [0, 1000], "under 1 reads as 1");
  assert.deepEqual(mc.delayed(tr, 400).times, [400, 1400]);
  assert.deepEqual(mc.positionAt(mc.trajectory([{ x: 2, y: 2 }]), 99), { x: 2, y: 2 }, "a single point");
});

test("closeTime and nearestWhile on a head-on pair (radius 0.5 each, speed 6)", () => {
  const A = mc.trajectory([{ x: 0, y: 0 }, { x: 6, y: 0 }], { speed: 6 });
  const B = mc.trajectory([{ x: 6, y: 0 }, { x: 0, y: 0 }], { speed: 6 });
  assert.ok(Math.abs(mc.closeTime(A, B, 1) - 166.667) < 0.01, String(mc.closeTime(A, B, 1)));
  assert.equal(mc.closeTime(A, B, 0), 0);
  // Side by side in two lanes 2 squares apart: never closer than 1.
  const C = mc.trajectory([{ x: 6, y: 2 }, { x: 0, y: 2 }], { speed: 6 });
  assert.equal(mc.closeTime(A, C, 1), 0);
  // nearestWhile: the nearest a moving trajectory comes to a point within a time window.
  assert.equal(mc.nearestWhile(A, { x: 3, y: 2 }, 0, 5000), 2);
  assert.equal(mc.nearestWhile(A, { x: 3, y: 2 }, 2000, 5000), Infinity, "not moving then");
});

test("waves buckets start delays into 150 ms waves", () => {
  assert.deepEqual(mc.waves({ a: 0, b: 1, c: 150, d: 151, e: -5 }), [{ at: 0, ids: ["a", "e"] }, { at: 150, ids: ["b", "c"] }, { at: 300, ids: ["d"] }]);
  assert.deepEqual(mc.waves({}), []);
});

/* ============================================ */
/*  narrow-core                                 */
/* ============================================ */

test("NARROW constants are frozen at today's values", () => {
  assert.ok(Object.isFrozen(nc.NARROW));
  assert.deepEqual({ ...nc.NARROW }, {
    fine: 8, pass: 0.15, eps: 0.001, reach: 1, penalty: 3, spacing: 0.125, iterations: 60, lambda: 0.5, maxStep: 0.1,
    settled: 0.0002, tol: 0.012, tube: 0.025, turn: 15, cut: 0.05, sample: 0.0625, maxChord: 2, opposing: -0.3, maxCells: 4000,
  });
});

test("resample: points every `step` along a polyline, both ends kept", () => {
  const five = nc.resample([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0.25);
  assert.equal(five.length, 5);
  assert.deepEqual(five.map(p => p.x), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(nc.resample([{ x: 5, y: 5 }], 0.25), [{ x: 5, y: 5 }], "one point");
  // A step that does not divide the length: the last interval is merged when under 0.35 of a step.
  assert.deepEqual(nc.resample([{ x: 0, y: 0 }, { x: 1, y: 0 }], 0.4).map(p => r4(p.x)), [0, 0.4, 0.8, 1]);
  assert.deepEqual(nc.resample([{ x: 0, y: 0 }, { x: 1.05, y: 0 }], 0.5).map(p => r4(p.x)), [0, 0.5, 1.05], "a short tail replaces the last sample");
  // Across a corner the carry runs on: 0.5 along then 0.5 up at step 0.25 is 4 steps.
  assert.equal(nc.resample([{ x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0.5 }], 0.25).length, 5);
});

test("squareEntries marks a point just past each grid-line crossing, and the last, as checkpoints (ODD: the field is the first argument and is not read)", () => {
  const e = nc.squareEntries(null, [{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }]);
  pin("squareEntries straight", e);
  assert.equal(e[0].checkpoint, false);
  assert.equal(e.at(-1).checkpoint, true);
  assert.equal(e.filter(p => p.checkpoint).length, 3, "x = 1, x = 2 and the end");
  // Any first argument gives the same answer.
  assert.deepEqual(nc.squareEntries({ never: "read" }, [{ x: 0.5, y: 0.5 }, { x: 2.5, y: 0.5 }]), e);
  const sq = p => `${Math.floor(p.y)},${Math.floor(p.x)}`;
  const diag = nc.squareEntries(null, [{ x: 0.5, y: 0.5 }, { x: 2.7, y: 0.6 }, { x: 2.9, y: 2.2 }]);
  assert.deepEqual(diag.filter(p => p.checkpoint).map(sq), ["0,1", "0,2", "1,2", "2,2", "2,2"]);
  // A move that stays in its square marks only its last point.
  const inside = nc.squareEntries(null, [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.8 }]);
  assert.deepEqual(inside.map(p => p.checkpoint), [false, true]);
});

test("pointsBack: the points `dists` of walk back from a polyline's end; null beyond its length", () => {
  const pts = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
  assert.deepEqual(nc.pointsBack(pts, [1, 3, 4]), [{ x: 2, y: 0 }, { x: 0, y: 0 }, null]);
  assert.deepEqual(nc.pointsBack(pts, [0]), [{ x: 3, y: 0 }]);
  assert.deepEqual(nc.pointsBack(pts, []), []);
  // Round a corner: back 1.5 from (3, 2) along (0,0)-(3,0)-(3,2) is on the first leg, 0.5 from the corner.
  assert.deepEqual(nc.pointsBack([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }], [1.5, 2, 2.5]).map(p => p && { x: r4(p.x), y: r4(p.y) }),
    [{ x: 2.5, y: 0 }, { x: 3, y: 0 }, { x: 2.5, y: 0 }].map((p, k) => (k === 0 ? { x: 3, y: 0.5 } : k === 1 ? { x: 3, y: 0 } : { x: 2.5, y: 0 })));
});

test("one-way walls on a narrow band (narrow-core openFrom / lineCross): a slit with one passes from its open side and is refused from its shut side", () => {
  // A 0.4-wide slit along y 10.6-11 between two 4 x 5 rooms, off the grid so the plain test cannot take it, and a one-way
  // wall across the slit at x = 11.
  const walls = [[8, 10.6, 14, 10.6], [8, 11, 14, 11],
    [4, 8, 8, 8], [4, 13, 8, 13], [4, 8, 4, 13], [8, 8, 8, 10.6], [8, 11, 8, 13],
    [14, 8, 18, 8], [14, 13, 18, 13], [18, 8, 18, 13], [14, 8, 14, 10.6], [14, 11, 14, 13]];
  const W = { x: 6, y: 10.8 }, E = { x: 16, y: 10.8 };
  const seen = [];
  for (const dir of [1, 2]) {
    const lines = [{ c: [11, 10.6, 11, 11], dir }];
    const f = nc.narrowField(walls, { pad: 0.5, lines });
    // The field's own test: from the west a dir-1 wall is open, from the east it is shut; dir 2 the other way round.
    assert.equal(f.lineCross(W, E), dir === 2, `dir ${dir}: west to east`);
    assert.equal(f.lineCross(E, W), dir === 1, `dir ${dir}: east to west`);
    for (const [name, a, b] of [["west to east", W, E], ["east to west", E, W]]) {
      const R = router(walls, { lines });
      const r = R.route(a, b);
      const open = (dir === 1) === (name === "west to east");
      assert.equal(r.found, open, `dir ${dir} ${name}`);
      if (!open) { seen.push([dir, name, r.state]); continue; }
      assert.equal(r.narrow, true, `dir ${dir} ${name}: through the slit`);
      assert.ok(r.minClearance >= 0.15 && r.minClearance < 0.2, String(r.minClearance));
      assert.equal(judge(walls, r.points).through, false);
      seen.push([dir, name, r.points.length, r2(r.minClearance)]);
    }
  }
  pin("slit one-way", seen);
  // No direction: a plain wall both ways.
  const plain = router(walls, { lines: [{ c: [11, 10.6, 11, 11], dir: 0 }] });
  assert.equal(plain.route(W, E).found, false);
  assert.equal(router(walls, { lines: [{ c: [11, 10.6, 11, 11], dir: 0 }] }).route(E, W).found, false);
  // checkWalk refuses a walk across it from the shut side whatever the walk's clearance.
  const f1 = nc.narrowField(walls, { pad: 0.5, lines: [{ c: [11, 10.6, 11, 11], dir: 1 }] });
  assert.equal(nc.checkWalk(f1, [{ x: 9, y: 10.8 }, { x: 13, y: 10.8 }]).ok, true);
  assert.equal(nc.checkWalk(f1, [{ x: 13, y: 10.8 }, { x: 9, y: 10.8 }]).ok, false);
});

test("ODD: narrow-core's cell links are cached both ways, so on one router the answer to a one-way slit depends on which way was asked first", () => {
  const walls = [[8, 10.6, 14, 10.6], [8, 11, 14, 11],
    [4, 8, 8, 8], [4, 13, 8, 13], [4, 8, 4, 13], [8, 8, 8, 10.6], [8, 11, 8, 13],
    [14, 8, 18, 8], [14, 13, 18, 13], [18, 8, 18, 13], [14, 8, 14, 10.6], [14, 11, 14, 13]];
  const W = { x: 6, y: 10.8 }, E = { x: 16, y: 10.8 };
  const lines = [{ c: [11, 10.6, 11, 11], dir: 1 }];
  const R = router(walls, { lines });
  const we = R.route(W, E), ew = R.route(E, W);
  assert.equal(we.found, true);
  // A fresh router refuses east to west in the search ("none"); on this one the search found a way (it reuses the links
  // the first call cached) and only the walk's own one-way check refused it.
  assert.deepEqual([ew.found, ew.state], [false, "walk"]);
  assert.deepEqual([router(walls, { lines }).route(E, W).found, router(walls, { lines }).route(E, W).state], [false, "none"]);
});

/* ============================================ */
/*  Stations S05 and S06 through the router     */
/* ============================================ */

const STATIONS = JSON.parse(readFileSync(new URL("./fixtures/narrow-stations.json", import.meta.url), "utf8")).stations;
const station = id => STATIONS.find(s => s.id === id);
/** A station's walls in a scenario (an open door does not block; a secret door always does). */
const wallsOf = (s, scen = "default") => {
  const doors = s.scenarios?.[scen]?.doors ?? {};
  return s.walls.filter(w => !w.only || w.only.includes(scen))
    .filter(w => { const ds = w.key in doors ? doors[w.key] : w.ds; return !(w.door && w.door !== 2 && ds === 1); })
    .map(w => w.c);
};
const PASS = nc.NARROW.pass - nc.NARROW.eps;
/** What a route is, for a pin: found, how many points, the narrow flag, the least clearance, and a checksum of every point (a refactor of relax / simplify / roundTurns that moves one changes it). */
function routeFacts(r) {
  if (!r.found) return { found: false, state: r.state };
  return {
    found: true, n: r.points.length, narrow: r.narrow, fine: r.fine, minClearance: r4(r.minClearance), settled: r.settled,
    sum: r2(r.points.reduce((s, p) => s + p.x * 7 + p.y * 13, 0)), end: { x: r4(r.points.at(-1).x), y: r4(r.points.at(-1).y) },
  };
}
const centreOf = t => ({ x: t.x + t.w / 2, y: t.y + t.h / 2 });

test("S05 (the spiral C stair): every named route pins its reach, point count, narrow flag and least clearance", () => {
  const S = station("S05");
  const W = wallsOf(S);
  const R = router(W);
  const hero = S.tokens.filter(t => t.w === 1).map(centreOf);
  const P = n => ({ x: S.points[n].c[0], y: S.points[n].c[1] });
  const routes = [
    ["hero1 -> dropB", hero[0], P("dropB")], ["hero2 -> dropB", hero[1], P("dropB")], ["hero3 -> dropB", hero[2], P("dropB")], ["hero4 -> dropB", hero[3], P("dropB")],
    ["hero1 -> dropMid", hero[0], P("dropMid")], ["hero1 -> dropStair45", hero[0], P("dropStair45")], ["hero1 -> dropA", hero[0], P("dropA")],
    ["dropB -> dropA", P("dropB"), P("dropA")], ["dropA -> dropB", P("dropA"), P("dropB")], ["dropMid -> dropB", P("dropMid"), P("dropB")], ["dropMid -> dropA", P("dropMid"), P("dropA")],
  ];
  const got = {};
  for (const [name, a, b] of routes) {
    const r = R.route(a, b);
    got[name] = routeFacts(r);
    assert.ok(r.found, `${name}: reached`);
    const j = judge(W, r.points);
    assert.equal(j.through, false, `${name}: through a wall`);
    assert.ok(j.minClearance >= PASS, `${name}: clearance ${j.minClearance}`);
    if (r.narrow) assert.ok(r.minClearance >= PASS, `${name}: reported clearance ${r.minClearance}`);
  }
  pin("S05 routes", got);
  // The same routes in a fight keep the grid outside the stair and mark a checkpoint where the walk enters a square.
  const Rf = router(W, { fight: true });
  const fight = {};
  for (const [name, a, b] of routes.slice(0, 2)) {
    const r = Rf.route(a, b);
    fight[name] = { ...routeFacts(r), checkpoints: r.points.filter(p => p.checkpoint).length, narrowPts: r.points.filter(p => p.narrow).length };
  }
  pin("S05 fight routes", fight);
});

test("S05 scenarios: with the long way open a Medium still takes the stair and a Large goes round; with it shut a Large has no way", () => {
  const S = station("S05");
  const large = S.tokens.find(t => t.w === 2), hero = S.tokens[0];
  const B = { x: S.points.dropB.c[0], y: S.points.dropB.c[1] };
  const long = wallsOf(S, "long");
  const m = router(long).route({ x: hero.x + 0.5, y: hero.y + 0.5 }, B);
  const L = router(long, { size: 2 }).route({ x: large.x + 1, y: large.y + 1 }, { x: B.x + 0.5, y: B.y + 0.5 });
  const shut = router(wallsOf(S), { size: 2 }).route({ x: large.x + 1, y: large.y + 1 }, { x: B.x + 0.5, y: B.y + 0.5 });
  pin("S05 long scenario", { medium: routeFacts(m), large: { ...routeFacts(L), cost: L.cost }, shut: routeFacts(shut) });
});

test("S06 (passage shapes): S-curve, diagonal slit, funnel and hairpin pass; the 0.2 slit is refused; each route pins its facts", () => {
  const S = station("S06");
  const W = wallsOf(S);
  const R = router(W);
  const hall = S.tokens.map(t => ({ x: t.x + 0.5, y: t.y + 0.5 }));
  const want = { dropScurve: true, dropDiag: true, dropFunnel: true, dropSlit: false, dropHairpin: true, dropField: true };
  const got = {};
  for (const [name, ok] of Object.entries(want)) {
    const to = { x: S.points[name].c[0], y: S.points[name].c[1] };
    hall.forEach((from, k) => {
      const r = R.route(from, to);
      got[`${name} from hero${k + 1}`] = routeFacts(r);
      assert.equal(r.found, ok, `${name} from hero ${k + 1}`);
      if (!ok) return;
      const j = judge(W, r.points);
      assert.equal(j.through, false);
      assert.ok(j.minClearance >= PASS, `${name}: ${j.minClearance}`);
    });
  }
  pin("S06 routes", got);
});

/* ============================================ */
/*  The glue: the module in the synthetic world  */
/* ============================================ */

// The harness below is drop.test.mjs's (a 100 px grid, a wall across y = 400 with a one-square door at x 400-500, a core
// findMovementPath that stops at the first wall, a core _prepareDragLeftDropUpdates that builds [updates, options]).

const MOD = "pentaryn-movement";
const GMID = "gmUser0000000001";
const S = 100;
const F = await movementWorld();

/** Segment intersection (proper crossing), the wall test; a move that ends on a wall's line, inside it, hits it too (as core's does). */
function hit(p, q, a, b, { ends = false } = {}) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d3 / (d3 - d4);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const inside = r => Math.min(a.x, b.x) < r.x && r.x < Math.max(a.x, b.x) || Math.min(a.y, b.y) < r.y && r.y < Math.max(a.y, b.y);
  if (Math.abs(d2) < 1e-9 && Math.abs(d1) > 1e-9 && inside(q)) return { x: q.x, y: q.y };
  if (!ends) return null;
  // `ends` (core's own collision, 0.10 L1): a move whose line passes exactly through a wall's end (a door frame's
  // corner) touches it, and core's lineSegmentIntersection counts a touch (t1 within 1e-8 of 0 or 1).
  const through = (r, u, v) => Math.min(u.x, v.x) - 1e-9 <= r.x && r.x <= Math.max(u.x, v.x) + 1e-9 && Math.min(u.y, v.y) - 1e-9 <= r.y && r.y <= Math.max(u.y, v.y) + 1e-9
    && Math.hypot(r.x - u.x, r.y - u.y) > 1e-9 && Math.hypot(r.x - v.x, r.y - v.y) > 1e-9;
  if (Math.abs(d3) < 1e-9 && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9 && through(a, p, q)) return { x: a.x, y: a.y };
  if (Math.abs(d4) < 1e-9 && Math.abs(d1) > 1e-9 && Math.abs(d2) > 1e-9 && through(b, p, q)) return { x: b.x, y: b.y };
  return null;
}
// A wall across y = 400 with a one-square door at x 400–500.
const world = { walls: [[{ x: 0, y: 400 }, { x: 400, y: 400 }], [{ x: 500, y: 400 }, { x: 1000, y: 400 }]] };
const crossing = (o, d) => world.walls.map(([a, b]) => hit(o, d, a, b)).filter(Boolean);
/** Core's collision (checkCollision, findMovementPath): a touch of a wall's end counts. */
const crossingCore = (o, d) => world.walls.map(([a, b]) => hit(o, d, a, b, { ends: true })).filter(Boolean);
const center = w => ({ x: w.x + (w.width ?? 1) * S / 2, y: w.y + (w.height ?? 1) * S / 2, elevation: 0 });
const cell = p => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) });

const Token5e = F.CONFIG.Token.objectClass;
Token5e.prototype.findMovementPath = function (waypoints, options = {}) {
  const out = [{ ...waypoints[0] }];
  for (let k = 1; k < waypoints.length; k++) {
    if (!options.constrainOptions?.ignoreWalls && crossingCore(center(waypoints[k - 1]), center(waypoints[k])).length) break;
    out.push({ ...waypoints[k] });
  }
  return { result: out, promise: Promise.resolve(out), cancel: () => {} };
};
Token5e.prototype.checkCollision = function (dest, { origin, mode = "any" } = {}) {
  const hits = crossingCore(origin, dest);
  if (mode === "all") return hits;
  if (mode === "closest") return hits.sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y))[0] ?? null;
  return hits.length > 0;
};
Token5e.prototype.measureMovementPath = function (wps) {
  let cost = 0;
  for (let k = 1; k < wps.length; k++) {
    const a = cell(center(wps[k - 1])), b = cell(center(wps[k]));
    cost += Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 5;
  }
  return { cost, distance: cost };
};
Token5e.prototype.createTerrainMovementPath = wps => wps;
Token5e.prototype.can = function () { return true; };
Token5e.prototype.stopAnimation = function (opts) { F.calls.push({ op: "stopAnimation", id: this.document.id, opts }); };

const grid = { size: S, distance: 5, type: 1, getOffset: p => cell(p) };
const sceneTokens = new Map();
Object.assign(F.canvas, {
  grid,
  dimensions: { rect: { x: 0, y: 0, width: 1000, height: 1000, contains: (x, y) => x >= 0 && y >= 0 && x <= 1000 && y <= 1000 } },
  visibility: { tokenVision: false },
});
Object.assign(F.canvas.scene, {
  tokens: sceneTokens,
  async updateEmbeddedDocuments(type, updates, options) {
    F.calls.push({ op: "scene.update", type, ids: updates.map(u => u._id), options });
    return updates;
  },
});
F.CONFIG.Token.movement = { actions: { walk: { walls: "move" }, displace: { walls: null } }, defaultSpeed: 6 };
F.foundry.documents.TokenDocument ??= { arePositionsEqual: (a, b) => a.x === b.x && a.y === b.y };
F.game.activeTool = "select";

const layer = { _draggedToken: null, _movementPlanningContext: null };
// The tokens' own Scene (TokenDocument#parent): waves go to it, not to whatever the canvas shows.
const viewedScene = F.canvas.scene;
const sceneDoc = { id: SCENE, grid, regions: [], tokens: sceneTokens, updateEmbeddedDocuments: (...a) => viewedScene.updateEmbeddedDocuments(...a),
  // Scene#moveTokens (one update for several tokens, 0.10 L3 fix round: one stop's writes): recorded, then each token's
  // movement as its own TokenDocument#move would record it (the options shared, as core passes them to every hook).
  async moveTokens(instructions, options) {
    F.calls.push({ op: "moveTokens", ids: Object.keys(instructions), options });
    const ids = Object.keys(instructions);
    const done = ids.map(id => sceneTokens.get(id)?.move(instructions[id].waypoints, { ...options, method: instructions[id].method }));
    const res = await Promise.all(done);
    return Object.fromEntries(ids.map((id, k) => [id, res[k]]));
  },
  // The walls as the adapter reads them (wall ends a smoothed route keeps its body clear of).
  // A test may set its own list (null: back to the world's).
  _walls: null,
  get walls() { return this._walls ?? world.walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 })); },
  set walls(v) { this._walls = v; } };
let combatFlag = false;

function makeToken(id, x, y, { size = 1 } = {}) {
  const t = Object.create(Token5e.prototype);
  t.layer = layer;
  t.movementAnimationName = `Token.${id}.animateMovement`;
  t.animationContexts = new Map();
  t.document = {
    documentName: "Token", id, uuid: `Scene.${SCENE}.Token.${id}`, name: id, movementAction: "walk", isOwner: true,
    parent: sceneDoc,
    _source: { x, y, elevation: 0, width: size, height: size, level: "L" },
    x, y, elevation: 0,
    movement: { state: "completed", user: { isSelf: true } },
    object: t,
    getMovementOrigin: w => center(w),
    getOccupiedGridSpaceOffsets: () => [],
    getCompleteMovementPath: w => w,
    _shouldRecordMovementHistory: () => combatFlag,
    testUserPermission: () => true,
    stopMovement() { F.calls.push({ op: "stopMovement", id }); return true; },
    async move(waypoints, options) { F.calls.push({ op: "move", id, waypoints, options }); return true; },
  };
  sceneTokens.set(id, t.document);
  return t;
}
/** Take every token but `keep` off the scene for a test; returns them, to put back. */
function keepOnly(keep) {
  const ids = new Set(keep.map(t => t.document.id));
  const out = new Map([...sceneTokens].filter(([k]) => !ids.has(k)));
  for (const k of out.keys()) sceneTokens.delete(k);
  return out;
}
const wp = (x, y, extra = {}) => ({ x, y, elevation: 0, width: 1, height: 1, level: "L", action: "walk", snapped: true, explicit: true, checkpoint: true, ...extra });

/** Drag contexts as core builds them (destination = same delta; foundPath = core's own path). */
function contextsFor(tokens, dx, dy) {
  const out = {};
  for (const t of tokens) {
    const src = t.document._source;
    const origin = wp(src.x, src.y, { snapped: false, explicit: false, checkpoint: false });
    const dest = wp(src.x + dx, src.y + dy);
    const found = Token5e.prototype.findMovementPath.call(t, [origin, dest], { constrainOptions: {} }).result;
    out[t.document.id] = { token: t, destination: dest, foundPath: found, waypoints: [] };
  }
  return out;
}
/** Core's _prepareDragLeftDropUpdates result for these contexts. */
function coreDrop(contexts) {
  const updates = [], movement = {};
  for (const [id, c] of Object.entries(contexts)) {
    if (c.foundPath.length <= 1) continue;
    updates.push({ _id: id });
    movement[id] = { id: undefined, waypoints: c.foundPath.slice(1), planned: false };
  }
  return [updates, { constrainOptions: {}, terrainOptions: {}, measureOptions: {}, method: "dragging", movement }];
}
function dropWith(grabbed, contexts) {
  drop.result = coreDrop(contexts);
  return grabbed._prepareDragLeftDropUpdates({ interactionData: { contexts } });
}
const sent = from => F.calls.slice(from).filter(c => c.op === "scene.update");
/** A plan running in slices (0.10.2) to its end: each slice waits for a timer (setTimeout 0 off the page). */
async function planned(max = 50000) {
  for (let k = 0; k < max && api.status().group.sliced?.state === "planning"; k++) { mock.timers.tick(1); await new Promise(r => setImmediate(r)); }
}
/** Every member's waypoints of a file: the drop's own update, then its later waves (after the clock ran 4.5 s). */
function fileMoves(out, from) {
  const by = {};
  for (const [id, m] of Object.entries(out?.[1]?.movement ?? {})) by[id] = { waypoints: m.waypoints, wave: 0 };
  tickBy(4500);
  sent(from).forEach((c, k) => { for (const [id, m] of Object.entries(c.options?.movement ?? {})) by[id] = { waypoints: m.waypoints, wave: k + 1, options: c.options }; });
  return by;
}

// The page's visibility (0.8.0: a tab going to the background sends its groups' waves at once).
const visListeners = new Set();
globalThis.document = {
  visibilityState: "visible",
  addEventListener: (type, fn) => { if (type === "visibilitychange") visListeners.add(fn); },
  removeEventListener: (type, fn) => { if (type === "visibilitychange") visListeners.delete(fn); },
};
const goHidden = () => { globalThis.document.visibilityState = "hidden"; for (const fn of [...visListeners]) fn(); globalThis.document.visibilityState = "visible"; };

await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;


/** The cost core measures for `wps` walked from `origin` (the synthetic measure: squares x 5). */
const costOf = (t, origin, wps) => t.measureMovementPath([origin, ...wps]).cost;
/** Let the fight queue's promises and timers run: `ms` of the mocked clock in 10 ms steps, microtasks between. */
async function runFor(ms) {
  for (let t = 0; t < ms; t += 10) { mock.timers.tick(10); for (let i = 0; i < 12; i++) await Promise.resolve(); }
}
/** Hold every move of these tokens until the test settles it: id -> [{ waypoints, options, settle(v) }]. */
function holdMoves(ts) {
  const held = new Map();
  for (const t of ts) {
    held.set(t.document.id, []);
    t.document.move = (waypoints, options) => {
      F.calls.push({ op: "move", id: t.document.id, waypoints, options });
      return new Promise(r => held.get(t.document.id).push({ waypoints, options, settle: v => { t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y; r(v); } }));
    };
  }
  return held;
}
/** A fight group's tokens on the scene (and drawn), the others off it for the test; returns the restore. */
function fightScene(ts) {
  combatFlag = true;
  clock.step = 0;
  for (const t of ts) t.visible = true;
  const others = keepOnly(ts);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  return () => {
    combatFlag = false;
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  };
}
/** dnd5e's movement types, as the system's ruler reads them (walk has no walk fallback; swim / climb do). */
F.CONFIG.DND5E ??= { movementTypes: { walk: {}, fly: {}, burrow: {}, swim: { walkFallback: true }, climb: { walkFallback: true } } };
/** Give a token's actor a walking speed (ft) and a movement history this turn of `spent` ft (one waypoint). */
function withSpeed(t, walk, spent = 0) {
  t.document.actor = { system: { isCreature: true, attributes: { movement: { speeds: { walk, fly: 0, swim: 0, climb: 0, burrow: 0 } } } } };
  t.document.movementHistory = spent > 0 ? [{ x: 0, y: 0, cost: 0 }, { x: 0, y: 0, cost: spent }] : [];
  return t;
}
function noSpeed(t) { delete t.document.actor; delete t.document.movementHistory; return t; }

test("the glue harness is up: the drop and click wraps are installed", () => {
  assert.deepEqual(api.status().group.patched, { drop: true, click: true });
});

/* -------------------------------------------- */
/*  group-adapter: speeds, layers, who counts    */
/* -------------------------------------------- */

const GA = await import("../group-adapter.mjs");

test("speedOf: the action's animation speed, else the token's own, else core's default; never 0 or not finite", () => {
  const t = makeToken("spdA000000000001", 100, 100);
  const cfg = F.CONFIG.Token.movement;
  try {
    assert.equal(GA.speedOf(t), 6, "nothing says: core's default (6 squares a second)");
    cfg.actions.walk.getAnimationOptions = () => ({ movementSpeed: 8 });
    assert.equal(GA.speedOf(t), 8, "the action's own");
    cfg.actions.walk.getAnimationOptions = () => ({ movementSpeed: 0 });
    t._getAnimationMovementSpeed = () => 4;
    assert.equal(GA.speedOf(t), 4, "0 from the action: the token's own");
    t._getAnimationMovementSpeed = () => NaN;
    assert.equal(GA.speedOf(t), 6, "a speed that is not usable: the default");
    cfg.actions.walk.getAnimationOptions = () => { throw new Error("boom"); };
    t._getAnimationMovementSpeed = () => { throw new Error("boom"); };
    assert.equal(GA.speedOf(t), 6, "both throw: the default");
    delete cfg.actions.walk.getAnimationOptions;
    delete t._getAnimationMovementSpeed;
    assert.equal(GA.speedOf(t, "fly"), 6, "an action core does not know");
    cfg.defaultSpeed = 9;
    assert.equal(GA.speedOf(t), 9, "core's default is read live");
  } finally {
    cfg.defaultSpeed = 6;
    delete cfg.actions.walk.getAnimationOptions;
    sceneTokens.delete(t.document.id);
  }
});

test("movementLeft: speed for the movement action less this turn's history; no usable speed is null (a fight walk then goes the whole way)", () => {
  const t = makeToken("mvlA000000000001", 100, 100);
  const types = F.CONFIG.DND5E.movementTypes;
  const speeds = (o = {}) => ({ walk: 0, fly: 0, swim: 0, climb: 0, burrow: 0, ...o });
  const give = (sp, extra = {}) => { t.document.actor = { system: { isCreature: true, attributes: { movement: { speeds: sp } }, ...extra } }; };
  try {
    // Walk 30 ft with 10 ft of this turn's movement history: 20 ft left.
    withSpeed(t, 30, 10);
    assert.deepEqual(GA.movementLeft(t), { speed: 30, spent: 10, left: 20 });
    withSpeed(t, 30, 0);
    assert.deepEqual(GA.movementLeft(t), { speed: 30, spent: 0, left: 30 });
    withSpeed(t, 30, 50);
    assert.deepEqual(GA.movementLeft(t), { speed: 30, spent: 50, left: 0 }, "overspent: none left, never negative");
    t.document.movementHistory = [{ cost: 5 }, { cost: NaN }, {}, { cost: 10 }];
    assert.deepEqual(GA.movementLeft(t), { speed: 30, spent: 15, left: 15 }, "a waypoint core could not measure is left out");
    // No speed on the sheet: not usable.
    noSpeed(t);
    assert.equal(GA.movementLeft(t), null, "no actor");
    give(speeds());
    assert.equal(GA.movementLeft(t), null, "a speed of 0");
    give(speeds({ walk: 30 }), { isCreature: false });
    assert.equal(GA.movementLeft(t), null, "not a creature");
    t.document.actor = { system: { isCreature: true, attributes: { movement: {} } } };
    assert.equal(GA.movementLeft(t), null, "no speeds");
    // The movement action's speed, with the walk fallback.
    give(speeds({ walk: 30, fly: 60 }));
    assert.deepEqual(GA.movementLeft(t, "fly"), { speed: 60, spent: 0, left: 60 }, "its own speed");
    give(speeds({ walk: 30, fly: 20 }));
    assert.equal(GA.movementLeft(t, "fly").speed, 20, "fly has no walk fallback: 20, though walking is faster");
    give(speeds({ walk: 30, swim: 0 }));
    assert.equal(GA.movementLeft(t, "swim").speed, 30, "swim has the walk fallback");
    give(speeds({ walk: 30, swim: 10 }));
    assert.equal(GA.movementLeft(t, "swim").speed, 30, "the fallback is at least the walking speed");
    give(speeds({ walk: 30, burrow: 0 }));
    assert.equal(GA.movementLeft(t, "burrow"), null, "burrow 0 has no fallback");
    give(speeds({ walk: 30 }));
    assert.equal(GA.movementLeft(t, "hover").speed, 30, "a type dnd5e does not know reads at least the walking speed");
    F.CONFIG.Token.movement.actions.blink = { teleport: true };
    assert.equal(GA.movementLeft(t, "blink"), null, "a teleport");
    // The default action is the token's own.
    t.document.movementAction = "fly";
    give(speeds({ walk: 30, fly: 60 }));
    assert.equal(GA.movementLeft(t).speed, 60);
    assert.equal(GA.movementLeft(null), null);
  } finally {
    delete F.CONFIG.Token.movement.actions.blink;
    t.document.movementAction = "walk";
    void types;
    noSpeed(t);
    sceneTokens.delete(t.document.id);
  }
});

test("layerOf / sameLayer: a token whose movement action is fly is on the air layer, every other on the ground", () => {
  assert.equal(GA.layerOf({ movementAction: "fly" }), "air");
  assert.equal(GA.layerOf({ movementAction: "walk" }), "ground");
  assert.equal(GA.layerOf({ movementAction: "swim" }), "ground");
  assert.equal(GA.layerOf({}), "ground");
  assert.equal(GA.layerOf(null), "ground");
  assert.equal(GA.layerOf({ get movementAction() { throw new Error("gone"); } }), "ground");
  assert.equal(GA.sameLayer({ movementAction: "fly" }, { movementAction: "fly" }), true);
  assert.equal(GA.sameLayer({ movementAction: "fly" }, { movementAction: "walk" }), false);
  assert.equal(GA.sameLayer({ movementAction: "walk" }, { movementAction: "swim" }), true);
});

test("a flyer is a different layer: it passes over ground tokens and they under it (no avoid circles, a straight drop)", () => {
  combatFlag = false;
  clock.step = 0;
  const flyer = makeToken("lyrF000000000001", 100, 100);
  const ground = makeToken("lyrG000000000001", 300, 100);
  ground.visible = true; flyer.visible = true;
  const others = keepOnly([flyer, ground]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [flyer, ground];
  try {
    const ids = x => GA.othersOf([{ id: x.document.id, token: x }], S).map(o => o.id);
    assert.deepEqual(ids(flyer), [ground.document.id], "both on the ground: an obstacle");
    flyer.document.movementAction = "fly";
    assert.deepEqual(ids(flyer), [], "the flyer passes over the ground token");
    assert.deepEqual(ids(ground), [], "and the ground token is under it");
    // Dragged east straight through the other one's square: the drop is the straight line, nothing to go round.
    const straight = dropWith(flyer, contextsFor([flyer], 400, 0))[1].movement[flyer.document.id].waypoints;
    assert.deepEqual(straight.map(w => [w.x, w.y]), [[500, 100]], "a flyer over a ground token: straight");
    const under = dropWith(ground, contextsFor([ground], -200, 0))[1].movement[ground.document.id].waypoints;
    assert.deepEqual(under.map(w => [w.x, w.y]), [[100, 100]], "a ground token under a flyer: straight");
    assert.equal(api.status().group.last.result, "core");
    // The same two on the ground: the one dragged goes round the other (more than one waypoint).
    flyer.document.movementAction = "walk";
    const round = dropWith(flyer, contextsFor([flyer], 400, 0))[1].movement[flyer.document.id].waypoints;
    assert.ok(round.length > 1, `round it: ${JSON.stringify(round.map(w => [w.x, w.y]))}`);
    assert.deepEqual([round.at(-1).x, round.at(-1).y], [500, 100]);
  } finally {
    flyer.document.movementAction = "walk";
    F.canvas.tokens.placeables = saved;
    for (const x of [flyer, ground]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("countsForRoutes: the GM counts every token; a player every token not hidden that it sees, owns or that is friendly", () => {
  const doc = (o = {}) => ({ hidden: false, isOwner: false, disposition: 0, ...o });
  const tok = (o = {}, visible = false) => ({ visible, document: doc(o) });
  const user = F.game.user;
  const wasGM = user.isGM;
  try {
    user.isGM = false;
    const table = [
      ["hidden", tok({ hidden: true }, true), false],
      ["hidden even if owned", tok({ hidden: true, isOwner: true }), false],
      ["seen", tok({}, true), true],
      ["owned", tok({ isOwner: true }), true],
      ["friendly", tok({ disposition: 1 }), true],
      ["neutral, unseen, unowned", tok({}), false],
      ["hostile, unseen", tok({ disposition: -1 }), false],
    ];
    for (const [name, t, want] of table) assert.equal(GA.countsForRoutes(t), want, `a player: ${name}`);
    assert.equal(GA.countsForRoutes(null), false);
    assert.equal(GA.countsForRoutes({}), false, "no document");
    user.isGM = true;
    for (const [name, t] of table) assert.equal(GA.countsForRoutes(t), true, `the GM: ${name}`);
    assert.equal(GA.countsForRoutes({}), false, "even the GM: no document");
  } finally { user.isGM = wasGM; }
});

test("memberOf: a drag context as a member record (centres in squares, the drop's top-left, core's path in squares)", () => {
  const t = makeToken("memA000000000001", 100, 200, { size: 2 });
  try {
    const ctx = { token: t, destination: wp(300, 400, { width: 2, height: 2 }), foundPath: [wp(100, 200), wp(200, 300), wp(300, 400)] };
    const m = GA.memberOf(ctx, S);
    assert.deepEqual({ id: m.id, w: m.w, h: m.h, r: m.r, start: m.start, formation: m.formation, tl: m.tl, speed: m.speed, dest: m.dest },
      { id: "memA000000000001", w: 2, h: 2, r: 1, start: { x: 2, y: 3 }, formation: { x: 4, y: 5 }, tl: { x: 3, y: 4 }, speed: 6, dest: ctx.destination });
    assert.deepEqual(m.corePath, [{ x: 2, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 5 }], "core's path as centres of a 2x2");
    assert.equal(m.token, t);
    // No destination: the end of core's path; no path either: the token's own source.
    assert.deepEqual(GA.memberOf({ token: t, foundPath: [wp(100, 200), wp(500, 600)] }, S).formation, { x: 6, y: 7 });
    assert.deepEqual(GA.memberOf({ token: t }, S).formation, { x: 2, y: 3 });
    assert.deepEqual(GA.memberOf({ token: t }, S).corePath, []);
    assert.deepEqual([GA.toSquares({ x: 100, y: 200 }, 1, 1, S), GA.toTopLeft({ x: 1.5, y: 2.5 }, 1, 1, S), GA.toTopLeft({ x: 2, y: 3 }, 2, 2, S)],
      [{ x: 1.5, y: 2.5 }, { x: 100, y: 200 }, { x: 100, y: 200 }]);
    assert.equal(GA.gridSize(t), 100);
    assert.equal(GA.gridSize({ document: { parent: { grid: { size: 70 } } } }), 70);
    assert.equal(GA.gridSize({}), 100);
  } finally { sceneTokens.delete(t.document.id); }
});

test("othersOf: the circles of the counting tokens outside the group, on the same level and layer, never a preview", () => {
  const a = makeToken("othA000000000001", 100, 100);
  const b = makeToken("othB000000000001", 300, 100, { size: 2 });
  const c = makeToken("othC000000000001", 500, 100);
  const d = makeToken("othD000000000001", 700, 100);
  const e = makeToken("othE000000000001", 900, 100);
  for (const t of [a, b, c, d, e]) t.visible = true;
  c.isPreview = true;
  d.document._source.level = "ELSEWHERE";
  e.document.hidden = true; e.visible = false;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, b, c, d, e];
  const wasGM = F.game.user.isGM;
  try {
    F.game.user.isGM = false;
    assert.deepEqual(GA.othersOf([{ id: a.document.id, token: a }], S), [{ x: 4, y: 2, r: 1, id: b.document.id }], "the 2x2 only: a preview, another level and a hidden token are left out");
    F.game.user.isGM = true;
    assert.deepEqual(GA.othersOf([{ id: a.document.id, token: a }], S).map(o => o.id), [b.document.id, e.document.id], "the GM counts the hidden one too");
    // A member of the move is never another. (ODD: members without tokens give no level to filter on, so the token
    // on another level comes back.)
    assert.deepEqual(GA.othersOf([{ id: a.document.id }, { id: b.document.id }], S).map(o => o.id), [d.document.id, e.document.id]);
  } finally {
    F.game.user.isGM = wasGM;
    F.canvas.tokens.placeables = saved;
    for (const t of [a, b, c, d, e]) sceneTokens.delete(t.document.id);
  }
});

/* -------------------------------------------- */
/*  A single drag, in a fight and out of one     */
/* -------------------------------------------- */

const wpsOf = (out, t) => out[1].movement[t.document.id].waypoints;
const xy = wps => wps.map(w => [w.x, w.y]);

test("a single drag out of combat is core's drop (one explicit waypoint); in combat it gets a checkpoint at every square, charged core's own measure", () => {
  clock.step = 0;
  const a = makeToken("sngA000000000001", 100, 100);
  const others = keepOnly([a]);
  try {
    combatFlag = false;
    const free = dropWith(a, contextsFor([a], 400, 0));
    assert.deepEqual(xy(wpsOf(free, a)), [[500, 100]]);
    assert.equal(wpsOf(free, a)[0].explicit, true);
    assert.deepEqual([api.status().group.last.mode, api.status().group.last.reason, api.status().group.last.result], ["core", "single", "core"]);
    combatFlag = true;
    const out = dropWith(a, contextsFor([a], 400, 0));
    const wps = wpsOf(out, a);
    assert.deepEqual(xy(wps), [[200, 100], [300, 100], [400, 100], [500, 100]], "a waypoint at every square");
    assert.deepEqual(wps.map(w => w.checkpoint), [true, true, true, true], "each one a checkpoint");
    assert.deepEqual(wps.slice(0, 3).map(w => [w.snapped, w.explicit]), [[true, false], [true, false], [true, false]], "the inserted ones: snapped, not explicit");
    assert.equal(wps[3].explicit, true, "the dropped one stays explicit");
    assert.equal(costOf(a, wp(100, 100), wps), 20, "charged exactly core's measure of the same distance");
    assert.equal(costOf(a, wp(100, 100), [wp(500, 100)]), 20);
    // A diagonal: a checkpoint per square along it, one cost.
    const diag = wpsOf(dropWith(a, contextsFor([a], 200, 200)), a);
    assert.deepEqual(xy(diag), [[200, 200], [300, 300]]);
    assert.equal(costOf(a, wp(100, 100), diag), 10);
  } finally {
    combatFlag = false;
    sceneTokens.delete(a.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("withCheckpoints falls back to core's waypoints, with no checkpoint flags added, when core measures the expanded path at a different cost, or throws", () => {
  clock.step = 0;
  const a = makeToken("wcfA000000000001", 100, 100);
  const others = keepOnly([a]);
  const proto = Token5e.prototype;
  const measure = proto.measureMovementPath;
  try {
    combatFlag = true;
    // Different cost for any path of more than two points (the expanded one).
    proto.measureMovementPath = function (wps, o) { const m = measure.call(this, wps, o); return wps.length > 2 ? { ...m, cost: m.cost + 5 } : m; };
    const differs = wpsOf(dropWith(a, contextsFor([a], 400, 0)), a);
    assert.deepEqual(xy(differs), [[500, 100]], "core's one waypoint");
    assert.equal(differs[0].checkpoint, true, "the checkpoint core's own context gave it");
    assert.equal(differs[0].snapped, true);
    // Throws for the expanded path.
    proto.measureMovementPath = function (wps, o) { if (wps.length > 2) throw new Error("no measure"); return measure.call(this, wps, o); };
    const throws = wpsOf(dropWith(a, contextsFor([a], 400, 0)), a);
    assert.deepEqual(xy(throws), [[500, 100]]);
    // ODD: an expanded path whose cost is NaN is accepted (NaN > 1e-6 is false), while a NaN cost for core's own path falls back.
    proto.measureMovementPath = function (wps, o) { return wps.length > 2 ? { cost: NaN } : measure.call(this, wps, o); };
    assert.equal(wpsOf(dropWith(a, contextsFor([a], 400, 0)), a).length, 4, "the expanded path is kept");
    proto.measureMovementPath = function (wps, o) { return wps.length > 2 ? measure.call(this, wps, o) : { cost: NaN }; };
    assert.deepEqual(xy(wpsOf(dropWith(a, contextsFor([a], 400, 0)), a)), [[500, 100]], "core's own cost not finite: the fallback");
    // Back to a faithful measure: expanded again.
    proto.measureMovementPath = measure;
    assert.equal(wpsOf(dropWith(a, contextsFor([a], 400, 0)), a).length, 4);
  } finally {
    proto.measureMovementPath = measure;
    combatFlag = false;
    sceneTokens.delete(a.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  The spiral C stair (S05) through the wrap    */
/* -------------------------------------------- */

const S05 = station("S05");
/** S05's walls (pixels, the default scenario) on a canvas big enough; returns the restore. */
function onStair() {
  const old = { walls: world.walls, rect: F.canvas.dimensions };
  world.walls = S05.walls.filter(w => !w.only).map(w => [{ x: w.c[0] * S, y: w.c[1] * S }, { x: w.c[2] * S, y: w.c[3] * S }]);
  F.canvas.dimensions = { rect: { x: 0, y: 0, width: 2500, height: 5000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2500 && y <= 5000 } };
  F.fire("updateWall");
  return () => { world.walls = old.walls; F.canvas.dimensions = old.rect; F.fire("updateWall"); };
}
/** The distance a centre line walks (ft at 5 ft a square) and the squares it enters (Chebyshev between cells). */
function walkedFt(path) {
  let px = 0, entered = 0;
  for (let k = 1; k < path.length; k++) {
    const a = center(path[k - 1]), b = center(path[k]);
    px += Math.hypot(b.x - a.x, b.y - a.y);
    const ca = cell(a), cb = cell(b);
    entered += Math.max(Math.abs(ca.i - cb.i), Math.abs(ca.j - cb.j));
  }
  return { walked: Math.round((px / S) * 5 * 10) / 10, entered };
}

test("a fight charge on an off-grid way: the stair walk is charged 5 ft per grid square entered, as the ruler shows, never the distance walked (decisions 2026-11-25)", () => {
  const done = onStair();
  const t = noSpeed(makeToken("chgA000000000001", 800, 3300));
  const others = keepOnly([t]);
  try {
    combatFlag = true;
    clock.step = 0;
    const out = dropWith(t, contextsFor([t], -200, 1100));
    const wps = wpsOf(out, t);
    const { walked, entered } = walkedFt(wps.length ? [wp(800, 3300), ...wps] : []);
    const charged = costOf(t, wp(800, 3300), wps);
    assert.equal(charged, 5 * entered, "5 ft per square entered");
    assert.ok(charged > walked, `charged more than walked: ${charged} against ${walked}`);
    pin("S05 fight charge", { walked: Math.round(walked), charged, entered, points: wps.length, end: [wps.at(-1).x, wps.at(-1).y],
      offGrid: wps.filter(w => w.x % S !== 0 || w.y % S !== 0).length, checkpoints: wps.filter(w => w.checkpoint).length });
    assert.equal(wps.at(-1).checkpoint, true);
  } finally {
    combatFlag = false;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    done();
    tickBy(60000);
  }
});

test("pathfind route(token, { to }) on S05: reached, the waypoints, the narrow flag, the least clearance; a drop inside the rock snaps to the nearest centre-line point (goal)", () => {
  const done = onStair();
  const t = makeToken("rteA000000000001", 800, 3300);
  const others = keepOnly([t]);
  try {
    combatFlag = false;
    clock.step = 0;
    const r = api.pathfind.route(t.document, { to: { x: 600, y: 4400 } });
    assert.deepEqual(Object.keys(r).sort(), ["arcs", "cost", "goal", "legs", "minClearance", "ms", "narrow", "ok", "reached", "straight", "waypoints"]);
    assert.deepEqual([r.ok, r.reached, r.straight, r.narrow, r.goal], [true, true, false, true, null]);
    assert.ok(r.minClearance >= 0.149 && r.minClearance < 0.5, String(r.minClearance));
    assert.deepEqual([r.waypoints.at(-1).x, r.waypoints.at(-1).y], [600, 4400]);
    assert.equal(r.waypoints.at(-1).explicit, true);
    assert.ok(r.waypoints.slice(1, -1).every(w => w.explicit === false), "the shape points are not explicit");
    pin("S05 route api", { n: r.waypoints.length, cost: r.cost, arcs: r.arcs, minClearance: r4(r.minClearance), legs: r.legs.map(l => ({ ...l, minClearance: r4(l.minClearance) })),
      sum: r2(r.waypoints.reduce((s, w) => s + w.x * 7 + w.y * 13, 0)) });
    // Dropped 0.1 square east of the centre line at the narrowest (0.4 wide): it rests on the line.
    const g = api.pathfind.route(t.document, { to: { x: 1560, y: 3800 } });
    assert.equal(g.reached, true);
    assert.ok(g.goal && Math.abs(g.goal.x - 1550) <= 1 && Math.abs(g.goal.y - 3800) <= 1, JSON.stringify(g.goal));
    pin("S05 route api goal", { goal: { x: r2(g.goal.x), y: r2(g.goal.y) }, end: { x: g.waypoints.at(-1).x, y: g.waypoints.at(-1).y }, n: g.waypoints.length, narrow: g.narrow });
    // The route needs a drawn token and a destination.
    assert.equal(api.pathfind.route(t.document, {}).ok, false);
    assert.equal(api.pathfind.route({ documentName: "Token", id: "x", object: null, parent: { id: SCENE } }, { to: { x: 0, y: 0 } }).ok, false);
  } finally {
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    done();
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  Riders: a mount carries its rider            */
/* -------------------------------------------- */

/** Every batch a drop sent: its own update first (when core's goes out), then the later waves. */
function batchesOf(out, from) {
  tickBy(5000);
  return [...(Array.isArray(out) ? [{ ids: out[0].map(u => u._id), options: out[1] }] : []), ...sent(from)];
}

test("riders: a mount dragged alone carries its rider at its offset; a rider dragged alone leaves its mount", () => {
  combatFlag = false;
  clock.step = 0;
  const mount = makeToken("rdrM000000000001", 100, 100, { size: 2 });
  const rider = makeToken("rdrR000000000001", 200, 100);            // 1x1 on the mount's right half: starts stacked
  const others = keepOnly([mount, rider]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [mount, rider];
  try {
    const from = F.calls.length;
    const out = dropWith(mount, contextsFor([mount], 400, 0));
    const mv = (b, id) => b.map(x => x.options.movement?.[id]).find(Boolean);
    const b = batchesOf(out, from);
    const m = mv(b, mount.document.id), r = mv(b, rider.document.id);
    assert.ok(m && r, `both move: ${JSON.stringify(api.status().group.last)}`);
    assert.deepEqual(xy(m.waypoints), [[500, 100]]);
    assert.deepEqual(xy(r.waypoints), [[600, 100]], "the rider's own square: its leader's way at its offset (+100, 0)");
    assert.deepEqual([r.waypoints[0].width, r.waypoints[0].height], [1, 1], "its own size");
    assert.equal(r.waypoints[0].snapped, true, "an offset of a whole square keeps the snap");
    assert.deepEqual(out[0].map(u => u._id).sort(), [mount.document.id, rider.document.id].sort());
    assert.equal(api.status().group.last.stacked, 1, "one rider in the stack");
    // An offset that is not a whole square: the rider's waypoint is not snapped.
    rider.document._source.x = 250; rider.document.x = 250;
    const from1 = F.calls.length;
    const off = batchesOf(dropWith(mount, contextsFor([mount], 400, 0)), from1);
    const r1 = mv(off, rider.document.id);
    assert.deepEqual(xy(r1.waypoints), [[650, 100]], "at its own offset, +150");
    assert.equal(r1.waypoints[0].snapped, false, "an offset that is not a whole square is not snapped");
    rider.document._source.x = 200; rider.document.x = 200;
    // A rider dragged alone leaves its mount.
    const from2 = F.calls.length;
    const alone = dropWith(rider, contextsFor([rider], 0, 200));
    const b3 = batchesOf(alone, from2);
    assert.ok(mv(b3, rider.document.id), "the rider moves");
    assert.equal(mv(b3, mount.document.id), undefined, "its mount does not");
    assert.deepEqual(xy(mv(b3, rider.document.id).waypoints), [[200, 300]]);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const x of [mount, rider]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  confirmLater with a Large token              */
/* -------------------------------------------- */

/** Let a drop's route search finish in its timer slices. */
async function finishSearch() { for (let k = 0; k < 8; k++) { mock.timers.tick(10); for (let i = 0; i < 12; i++) await Promise.resolve(); } }
const warns = from => F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
/** A Large's drag context, its drag path as it stood at the drop (`found`: waypoints after the start; none = the start alone). */
function largeCtx(big, to, found = []) {
  const src = big.document._source;
  const origin = wp(src.x, src.y, { width: 2, height: 2, snapped: false, explicit: false, checkpoint: false });
  const dest = wp(to.x, to.y, { width: 2, height: 2 });
  return { [big.document.id]: { token: big, destination: dest, foundPath: [origin, ...found.map(f => wp(f.x, f.y, { width: 2, height: 2 }))], waypoints: [] } };
}

test("confirmLater, a Large: the search ends with only a partial way: 'Stopped short, way blocked' and, when a player dragged, a whisper to the GM; it goes the partial", async () => {
  combatFlag = false;
  const big = makeToken("clmA000000000001", 350, 100, { size: 2 });
  const others = keepOnly([big]);
  const chats = [];
  const savedChat = globalThis.ChatMessage;
  globalThis.ChatMessage = { create: async data => { chats.push(data); return data; } };
  try {
    const from = F.calls.length;
    clock.step = 300;                                    // the drop's one short search runs out: it goes on in slices
    const out = dropWith(big, largeCtx(big, { x: 350, y: 600 }, [{ x: 350, y: 150 }]));
    clock.step = 0;
    assert.equal(out, null, "nothing goes out at the drop");
    assert.equal(sent(from).length, 0);
    await finishSearch();
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.stoppedShort"], "told once");
    assert.equal(api.status().group.last.result, "narrow");
    assert.equal(chats.length, 1, "the GM is whispered because a player dragged");
    assert.deepEqual(chats[0].whisper, [GMID]);
    assert.equal(chats[0].content, "<p>clmA000000000001: Stopped short, way blocked.</p>");
    assert.equal(chats[0].speaker.alias, "Pentaryn Movement");
    const ups = sent(from);
    assert.equal(ups.length, 1, "the partial way goes out");
    const wps = ups[0].options.movement[big.document.id].waypoints;
    pin("confirmLater large partial", { ids: ups[0].ids, wps: wps.map(w => [w.x, w.y, w.explicit, w.checkpoint]) });
    const end = wps.at(-1);
    assert.ok(end.y >= 200 && end.y + 200 <= 400, `as far as its body fits, short of the door's line: ${JSON.stringify(end)}`);
    // The GM dragging is not whispered.
    chats.length = 0;
    tickBy(2000);                                       // the same notice twice within a second shows once
    F.game.user.isGM = true;
    try {
      const from2 = F.calls.length;
      clock.step = 300;
      dropWith(big, largeCtx(big, { x: 350, y: 600 }, [{ x: 350, y: 150 }]));
      clock.step = 0;
      await finishSearch();
      assert.deepEqual(warns(from2), ["PENTARYN_MOVEMENT.notify.stoppedShort"]);
      assert.equal(chats.length, 0, "a GM is not whispered");
    } finally { F.game.user.isGM = false; }
  } finally {
    clock.step = 0;
    globalThis.ChatMessage = savedChat;
    sceneTokens.delete(big.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("confirmLater, a Large: no partial and core's drag went somewhere: core's waypoints; the search done and nothing found with core going nowhere: 'No route there', nothing moves", async () => {
  combatFlag = false;
  const big = makeToken("clmB000000000001", 350, 100, { size: 2 });
  const others = keepOnly([big]);
  const saved = world.walls;
  world.walls = [[{ x: 0, y: 400 }, { x: 1000, y: 400 }]];       // the door is shut: no way south
  F.fire("updateWall");
  const savedChat = globalThis.ChatMessage;
  globalThis.ChatMessage = { create: async data => data };
  try {
    // Core's drag went one square: with no partial way, that is what goes.
    let from = F.calls.length;
    clock.step = 300;
    assert.equal(dropWith(big, largeCtx(big, { x: 350, y: 600 }, [{ x: 350, y: 150 }])), null);
    clock.step = 0;
    await finishSearch();
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.stoppedShort"]);
    let ups = sent(from);
    assert.equal(ups.length, 1);
    assert.deepEqual(xy(ups[0].options.movement[big.document.id].waypoints), [[350, 150]], "core's own waypoints");
    assert.equal(api.status().group.last.result, "narrow");
    // Core's drag found nothing (the start alone): nothing moves, "No route there".
    tickBy(2000);
    from = F.calls.length;
    clock.step = 300;
    assert.equal(dropWith(big, largeCtx(big, { x: 350, y: 600 })), null);
    clock.step = 0;
    await finishSearch();
    assert.equal(sent(from).length, 0, "nothing moves");
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.noRoute"]);
    assert.deepEqual([api.status().group.last.reason, api.status().group.last.result], ["noRoute", "none"]);
  } finally {
    clock.step = 0;
    world.walls = saved;
    F.fire("updateWall");
    globalThis.ChatMessage = savedChat;
    sceneTokens.delete(big.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  aroundLater: a single drop round a standing token, searched after the drop  */
/* -------------------------------------------- */

const telemetryOf = kind => api.telemetry().events.filter(e => e.kind === kind);
/** One drag of `a` three squares east past `stand` with a slow search (it finishes after the drop); returns what went out. */
async function slowAround(a, to = 400) {
  const from = F.calls.length;
  clock.step = 300;
  const out = dropWith(a, contextsFor([a], to, 0));
  clock.step = 0;
  return { from, out };
}

test("aroundLater: the search done after the drop reaches the drop square: the way round the standing token goes (result 'round')", async () => {
  combatFlag = false;
  const a = makeToken("aroA000000000001", 100, 100);
  const stand = makeToken("aroS000000000001", 300, 100);
  stand.visible = true; a.visible = true;
  const others = keepOnly([a, stand]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, stand];
  try {
    const { from, out } = await slowAround(a);
    assert.equal(out, null, "nothing at the drop");
    assert.equal(sent(from).length, 0);
    await finishSearch();
    assert.equal(api.status().group.last.result, "round");
    const ups = sent(from);
    assert.equal(ups.length, 1);
    assert.deepEqual(ups[0].ids, [a.document.id]);
    const wps = ups[0].options.movement[a.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [500, 100], "to where it was dropped");
    assert.deepEqual([wps.at(-1).explicit, wps.at(-1).checkpoint], [true, true]);
    assert.ok(wps.length >= 2, "round it");
    let prev = { x: 150, y: 150 };
    for (const p of wps) {
      const q = { x: p.x + 50, y: p.y + 50 };
      assert.ok(pf.avoidDist({ x: 350, y: 150, r: 98, box: true }, prev, q) >= 98 - 1e-6, "never inside the standing token's square");
      prev = q;
    }
    assert.equal(warns(from).length, 0, "no notice");
    pin("aroundLater round", wps.map(w => [w.x, w.y, w.explicit]));
  } finally {
    clock.step = 0;
    F.canvas.tokens.placeables = saved;
    for (const x of [a, stand]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("aroundLater: no way round: it walks as far as it is free of the token ('Stopped short', standingInTheWay), or with nothing free 'No route there' and stays", async () => {
  combatFlag = false;
  const savedWalls = world.walls;
  // A one-square lane along row 1 (walls on y = 100 and y = 200): the token standing in it cannot be passed.
  world.walls = [[{ x: 0, y: 100 }, { x: 1000, y: 100 }], [{ x: 0, y: 200 }, { x: 1000, y: 200 }]];
  F.fire("updateWall");
  const a = makeToken("arnA000000000001", 100, 100);
  const stand = makeToken("arnS000000000001", 500, 100);
  stand.visible = true; a.visible = true;
  const others = keepOnly([a, stand]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, stand];
  try {
    let { from, out } = await slowAround(a, 700);
    assert.equal(out, null);
    await finishSearch();
    assert.equal(api.status().group.last.result, "short");
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.stoppedShort"]);
    assert.deepEqual(api.status().group.told[0].reason, "standingInTheWay");
    let ups = sent(from);
    assert.equal(ups.length, 1);
    const wps = ups[0].options.movement[a.document.id].waypoints;
    pin("aroundLater short", wps.map(w => [w.x, w.y, w.explicit, w.checkpoint]));
    assert.ok(wps.at(-1).x < 500 - 90, `short of the token standing at 500: ${wps.at(-1).x}`);
    // The token right beside it: nothing is free; it stays, "No route there".
    tickBy(2000);
    stand.document._source.x = 200; stand.document.x = 200;
    ({ from, out } = await slowAround(a, 700));
    assert.equal(out, null);
    await finishSearch();
    assert.equal(api.status().group.last.result, "none");
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.noRoute"]);
    assert.equal(sent(from).length, 0, "nothing moves");
  } finally {
    clock.step = 0;
    world.walls = savedWalls;
    F.fire("updateWall");
    F.canvas.tokens.placeables = saved;
    for (const x of [a, stand]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("aroundLater: a rejection in the search's answer is counted (error 'around') and the dragger told 'Stopped short' (aroundFailed); nothing moves", async () => {
  combatFlag = false;
  const a = makeToken("arfA000000000001", 100, 100);
  const stand = makeToken("arfS000000000001", 300, 100);
  stand.visible = true; a.visible = true;
  const others = keepOnly([a, stand]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, stand];
  const real = a.document;
  try {
    const errors = telemetryOf("error").length;
    const { from, out } = await slowAround(a);
    assert.equal(out, null);
    // The token's document goes bad between the drop and the answer: reading its size throws.
    a.document = { id: real.id, parent: real.parent, get _source() { throw new Error("gone"); } };
    await finishSearch();
    a.document = real;
    assert.equal(sent(from).length, 0, "nothing moves");
    assert.deepEqual(warns(from), ["PENTARYN_MOVEMENT.notify.stoppedShort"]);
    assert.equal(api.status().group.told[0].reason, "aroundFailed");
    const errs = telemetryOf("error");
    assert.equal(errs.length, errors + 1, "one more error");
    assert.deepEqual([errs.at(-1).reason, errs.at(-1).message], ["around", "gone"]);
  } finally {
    a.document = real;
    clock.step = 0;
    F.canvas.tokens.placeables = saved;
    for (const x of [a, stand]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  walkOne: one member of a fight queue         */
/* -------------------------------------------- */

test("walkOne: the next member starts only when the walker's movementAnimationPromise has resolved (a rejection counts as resolved)", async () => {
  for (const how of ["resolve", "reject", "not a promise"]) {
    const ts = [makeToken("wlkA000000000001", 400, 200), makeToken("wlkB000000000001", 300, 200)];
    const restore = fightScene(ts);
    const held = holdMoves(ts);
    let release = null;
    const gate = how === "not a promise" ? { then: undefined } : new Promise((res, rej) => { release = () => (how === "resolve" ? res() : rej(new Error("drawn badly"))); });
    ts[0].movementAnimationPromise = gate;
    ts[1].movementAnimationPromise = null;
    try {
      const from = F.calls.length;
      assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null);
      await runFor(100);
      const moves = () => F.calls.slice(from).filter(c => c.op === "move");
      assert.equal(moves().length, 1, `${how}: the leader walks first`);
      held.get(ts[0].document.id)[0].settle(true);
      await runFor(300);
      if (how === "not a promise") {
        assert.equal(moves().length, 2, "a value with no then: nothing to wait for, the next goes at once");
      } else {
        assert.equal(moves().length, 1, `${how}: the move is on the server but its animation has not ended: the next waits`);
        release();
        await runFor(100);
        assert.equal(moves().length, 2, `${how}: the next member goes once it has`);
      }
      held.get(ts[1].document.id)[0].settle(true);
      await runFor(100);
      const q = api.status().group.queue;
      assert.deepEqual([q.sent, q.running, q.ended], [2, false, "done"], how);
    } finally { restore(); tickBy(60000); }
  }
});

test("walkOne: a move that throws or rejects is counted (error 'fightMove'), stops the queue on that member ('stopped'), and the members not yet sent are named", async () => {
  for (const how of ["throws", "rejects"]) {
    const ts = [makeToken("wlkC000000000001", 400, 200), makeToken("wlkD000000000001", 300, 200), makeToken("wlkE000000000001", 500, 200)];
    const restore = fightScene(ts);
    const held = holdMoves(ts);
    ts[0].document.move = how === "throws" ? () => { throw new Error("boom"); } : () => Promise.reject(new Error("boom"));
    try {
      const errors = telemetryOf("error").length;
      const from = F.calls.length;
      assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null);
      await runFor(300);
      const q = api.status().group.queue;
      const errs = telemetryOf("error");
      assert.equal(errs.length, errors + 1, `${how}: one error`);
      assert.deepEqual([errs.at(-1).reason, errs.at(-1).message], ["fightMove", "boom"]);
      // ODD: the failed move still counts as sent, and the queue does not go on to the next member: it ends "stopped".
      assert.deepEqual([q.running, q.ended, q.sent], [false, "stopped", 1], `${how}: ${JSON.stringify(q)}`);
      assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0, "no other member was sent");
      assert.ok(held.get(ts[1].document.id).length === 0 && held.get(ts[2].document.id).length === 0);
      const named = F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
      pin(`walkOne ${how}`, named);
    } finally { restore(); tickBy(60000); }
  }
});

test("fight group walk and speed: 30 ft with 10 ft already spent leaves 20 ft: the member stops on the last square it pays for, named; one with no speed on its sheet walks the whole way", async () => {
  const ts = [withSpeed(makeToken("spdL000000000001", 100, 100), 30, 10), noSpeed(makeToken("spdM000000000001", 100, 200))];
  const restore = fightScene(ts);
  const log = [];
  for (const t of ts) {
    t.document.move = waypoints => {
      log.push({ id: t.document.id, from: { ...t.document._source }, waypoints });
      t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
      return Promise.resolve(true);
    };
  }
  try {
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], contextsFor(ts, 700, 0)), null);
    for (let i = 0; i < 60 && api.status().group.queue?.running; i++) await runFor(50);
    const q = api.status().group.queue;
    assert.equal(q.running, false);
    const lead = q.walks.find(w => w.id === ts[0].document.id), other = q.walks.find(w => w.id === ts[1].document.id);
    assert.deepEqual({ ...lead, id: undefined }, { id: undefined, planned: 7, sent: 4, left: 20, why: "speed", inside: 0 });
    assert.equal(other.left, null, "no usable speed");
    assert.equal(other.sent, other.planned, "so it walks the whole way");
    assert.equal(other.why, null);
    const walked = log.find(m => m.id === ts[0].document.id);
    assert.deepEqual([walked.waypoints.length, walked.waypoints.at(-1).x], [4, 500], "four squares: 20 ft at 5 ft a square");
    assert.equal(costOf(ts[0], walked.from, walked.waypoints), 20);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn" && c.message.includes(ts[0].document.id)), "the member that ran out of movement is named");
  } finally { restore(); for (const t of ts) noSpeed(t); tickBy(60000); }
});
