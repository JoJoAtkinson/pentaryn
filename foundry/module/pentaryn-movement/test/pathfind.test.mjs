// The findMovementPath wrap (pathfind.mjs + pathfind-adapter.mjs) against a synthetic token whose
// "core" findMovementPath stops at the first wall, as core's does. Walls are pixel segments on a
// 100 px grid; cost is 5 ft per square step (the 2024 rule, every diagonal 5 ft). What is pinned:
// a straight drag is returned untouched, a blocked drag comes back routed around the wall with the
// explicit waypoints kept and the corners non-explicit, ghost/unconstrained and the settings skip it,
// and a route that cannot be found leaves core's partial path as it was.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-movement";
const S = 100;
const F = await movementWorld();

/** Segment intersection (proper or touching), for the ray tests. */
function hit(p, q, a, b) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d3 / (d3 - d4);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  return null;
}

const world = { walls: [] };
const crossing = (o, dpt) => world.walls.map(([a, b]) => hit(o, dpt, a, b)).filter(Boolean);
const center = w => ({ x: w.x + (w.width ?? 1) * S / 2, y: w.y + (w.height ?? 1) * S / 2, elevation: 0 });
const cell = p => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) });
let coreCalls = 0;

// The token class core would configure: findMovementPath stops at the first wall between centres.
const Token5e = F.CONFIG.Token.objectClass;
Token5e.prototype.findMovementPath = function (waypoints, options = {}) {
  coreCalls += 1;
  const out = [{ ...waypoints[0] }];
  for (let k = 1; k < waypoints.length; k++) {
    if (!options.constrainOptions?.ignoreWalls && crossing(center(waypoints[k - 1]), center(waypoints[k])).length) break;
    out.push({ ...waypoints[k] });
  }
  return { result: out, promise: Promise.resolve(out), cancel: () => {} };
};
Token5e.prototype.checkCollision = function (dest, { origin, mode = "any" } = {}) {
  const hits = crossing(origin, dest);
  return mode === "all" ? hits : hits.length > 0;
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

const grid = { size: S, distance: 5, type: 1, getOffset: p => cell(p) };
Object.assign(F.canvas, {
  grid,
  dimensions: { rect: { x: 0, y: 0, width: 1000, height: 1000, contains: (x, y) => x >= 0 && y >= 0 && x <= 1000 && y <= 1000 } },
  visibility: { tokenVision: false },
});
F.CONFIG.Token.movement = { actions: { walk: { walls: "move" } } };
F.foundry.documents.TokenDocument ??= { arePositionsEqual: (a, b) => a.x === b.x && a.y === b.y };

function makeToken({ x = 0, y = 0, size = 1 } = {}) {
  const t = Object.create(Token5e.prototype);
  t.document = {
    id: "tok0000000000001", movementAction: "walk", parent: { grid, regions: [] },
    _source: { x, y, elevation: 0, width: size, height: size },
    getMovementOrigin: w => center(w),
    getOccupiedGridSpaceOffsets: () => [],
    getCompleteMovementPath: w => w,
  };
  return t;
}
const wp = (x, y, size = 1) => ({ x, y, elevation: 0, width: size, height: size, level: "L", action: "walk", snapped: true, explicit: true, checkpoint: false });
const drag = (token, waypoints, constrainOptions = {}) => token.findMovementPath(waypoints, { preview: true, constrainOptions, measureOptions: {}, terrainOptions: {} });

await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;

async function set(key, value) {
  await game.settings.set(MOD, key, value);
}

test("the wrap is installed and status() reports it", () => {
  assert.equal(Token5e.prototype.findMovementPath.__pentarynMovementPath, true);
  const s = api.pathfind.status();
  assert.equal(s.patched, true);
  assert.equal(s.mode, "everyone");
  assert.equal(s.mine, true);
  assert.equal(s.smoothCorners, true);
});

test("a straight drag is core's own job, untouched (one core call)", () => {
  world.walls = [];
  coreCalls = 0;
  const t = makeToken();
  const job = drag(t, [wp(0, 0), wp(500, 0)]);
  assert.equal(coreCalls, 1);
  assert.deepEqual(job.result.map(w => [w.x, w.y]), [[0, 0], [500, 0]]);
});

test("a drag into a wall comes back routed around it: explicit ends kept, corners non-explicit", async () => {
  await set("smoothCorners", false);
  // A wall across x = 300 from y = 0 to y = 400: the way round is under it.
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  const t = makeToken();
  const job = drag(t, [wp(0, 0), wp(500, 0)]);
  const path = job.result;
  assert.ok(Array.isArray(path));
  assert.deepEqual([path[0].x, path[0].y], [0, 0]);
  assert.deepEqual([path.at(-1).x, path.at(-1).y], [500, 0]);
  assert.equal(path.at(-1).explicit, true);
  assert.ok(path.length > 2);
  for (const w of path.slice(1, -1)) {
    assert.equal(w.explicit, false);
    assert.equal(w.checkpoint, false);
  }
  for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, "no leg crosses the wall");
  const s = api.pathfind.status().last;
  assert.equal(s.reached, 2);
  assert.equal(s.improved, true);
  assert.equal(s.arcs, 0);
  // The cost equals the grid optimum: 5 squares across, 4 down and back up → max(5, 8) with diagonals.
  assert.equal(t.measureMovementPath(path).cost, 40);
});

test("smooth corners: arcs are placed where clear, and the cost stays the grid optimum", async () => {
  await set("smoothCorners", true);
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  const t = makeToken();
  const path = drag(t, [wp(0, 0), wp(500, 0)]).result;
  for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0);
  assert.equal(t.measureMovementPath(path).cost, 40);
  assert.ok(api.pathfind.status().last.arcs > 0, JSON.stringify(path.map(w => [w.x, w.y])));
  assert.ok(path.some(w => w.snapped === false), "arc points are unsnapped");
});

test("ghost / the GM's unconstrained tool (ignoreWalls) skips pathfinding", () => {
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  coreCalls = 0;
  const job = drag(makeToken(), [wp(0, 0), wp(500, 0)], { ignoreWalls: true });
  assert.equal(coreCalls, 1);
  assert.equal(job.result.length, 2, "straight through, as core moves it");
});

test("world off / GM only / this client off: core's partial path, one core call", async () => {
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  for (const [key, value] of [["pathfinding", "off"], ["pathfinding", "gm"], ["pathfindMine", false]]) {
    await set(key, value);
    coreCalls = 0;
    const job = drag(makeToken(), [wp(0, 0), wp(500, 0)]);
    assert.equal(coreCalls, 1, `${key}=${value}`);
    assert.equal(job.result.length, 1, "stops at the wall");
    await set("pathfinding", "everyone");
    await set("pathfindMine", true);
  }
});

test("a sealed destination: no route, core's partial path is returned as it was", () => {
  world.walls = [
    [{ x: 400, y: 0 }, { x: 400, y: 1000 }],
  ];
  const job = drag(makeToken(), [wp(0, 0), wp(500, 0)]);
  assert.equal(job.result.length, 1);
  assert.equal(api.pathfind.status().last.found, 0);
});

test("a 2×2 token is not routed through a one-square gap; a 1×1 token is", async () => {
  await set("smoothCorners", false);
  // A wall along y = 300 with a one-square gap at x 400..500; both drags start left of it.
  world.walls = [[{ x: 0, y: 300 }, { x: 400, y: 300 }], [{ x: 500, y: 300 }, { x: 1000, y: 300 }]];
  const one = drag(makeToken({ x: 100 }), [wp(100, 0), wp(100, 600)]).result;
  assert.deepEqual([one.at(-1).x, one.at(-1).y], [100, 600], "1×1 goes round through the gap");
  const big = drag(makeToken({ x: 100, size: 2 }), [wp(100, 0, 2), wp(100, 600, 2)]).result;
  assert.equal(big.length, 1, "2×2: no route, core's stop at the wall");
  assert.equal(api.pathfind.status().last.found, 0);
  await set("smoothCorners", true);
});

test("a straight drag core allows is never made stricter (core checks the centre ray only)", () => {
  // The 2×2's centre line touches the wall end exactly: core lets it through, so do we.
  world.walls = [[{ x: 0, y: 300 }, { x: 400, y: 300 }], [{ x: 500, y: 300 }, { x: 1000, y: 300 }]];
  coreCalls = 0;
  const job = drag(makeToken({ x: 300, size: 2 }), [wp(300, 0, 2), wp(300, 600, 2)]);
  assert.equal(coreCalls, 1);
  assert.equal(job.result.length, 2);
});

test("pathfind.route needs a drawn token; it refuses politely without one", () => {
  const r = api.pathfind.route({ documentName: "Token", id: "x", object: null, parent: { id: "sceneA" } }, { to: { x: 0, y: 0 } });
  assert.equal(r.ok, false);
});
