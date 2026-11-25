// The findMovementPath wrap (pathfind.mjs + pathfind-adapter.mjs) against a synthetic token whose
// "core" findMovementPath stops at the first wall, as core's does. Walls are pixel segments on a
// 100 px grid; cost is 5 ft per square step (the 2024 rule, every diagonal 5 ft). What is pinned:
// a straight drag is returned untouched, a blocked drag comes back routed around the wall with the
// explicit waypoints kept and the corners non-explicit, ghost/unconstrained and the settings skip it,
// and a route that cannot be found leaves core's partial path as it was.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld } from "./fixtures/world.mjs";
import { segmentsCross } from "../pathfind-core.mjs";

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
// A wall may carry door / ds (core's WALL_DOOR_TYPES / WALL_DOOR_STATES): an open door (ds 1) never collides, as in core.
// `world.touch` (the 0.10 R9 stair tests): a touch of a wall counts too, as Foundry 14.370's lineSegmentIntersection.
const touchHit = (p, q, a, b) => hit(p, q, a, b) ?? (segmentsCross(p, q, a, b) && Math.hypot(q.x - p.x, q.y - p.y) > 1e-9 ? { x: p.x, y: p.y } : null);
const crossing = (o, dpt) => world.walls.filter(w => w.ds !== 1).map(([a, b]) => (world.touch ? touchHit : hit)(o, dpt, a, b)).filter(Boolean);
const door = (a, b, door = 1, ds = 0) => Object.assign([a, b], { door, ds });
/** The token's Scene as the adapter reads it: walls (door type, segment) and regions. */
const sceneDoc = {
  grid: null,
  get walls() { return world.walls.map(([a, b, ...rest]) => ({ c: [a.x, a.y, b.x, b.y], door: world.walls.find(w => w[0] === a && w[1] === b)?.door ?? 0, ds: 0, rest })); },
  get regions() { return world.regions ?? []; },
  get tokens() { return world.tokens ?? []; },
};
/** A region as core and the adapter read it: a rectangle, its behaviours, hidden. */
const region = (id, rect, { type = "teleportToken", hidden = false, disabled = false } = {}) => ({ id, hidden, rect, behaviors: [{ type, disabled }] });
const inRect = (r, p) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
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
sceneDoc.grid = grid;
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
    id: "tok0000000000001", movementAction: "walk", parent: sceneDoc,
    testInsideRegion: (r, data) => inRect(r.rect, center({ ...{ x, y, width: size, height: size }, ...data })),
    _source: { x, y, elevation: 0, width: size, height: size },
    getMovementOrigin: w => center(w),
    getOccupiedGridSpaceOffsets: () => [],
    getCompleteMovementPath: w => w,
  };
  return t;
}
const wp = (x, y, size = 1) => ({ x, y, elevation: 0, width: size, height: size, level: "L", action: "walk", snapped: true, explicit: true, checkpoint: false });
/**
 * A drag's path. A search can outlast its synchronous slice on a loaded machine (the gate runs the files in parallel):
 * then the job finishes in timer slices with the same answer, which the mocked timers run here.
 */
const drag = (token, waypoints, constrainOptions = {}) => {
  const job = token.findMovementPath(waypoints, { preview: true, constrainOptions, measureOptions: {}, terrainOptions: {} });
  for (let i = 0; i < 2000 && job.result === undefined; i++) mock.timers.tick(1);
  return job;
};

await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.pentaryn.movement;

/** 0.8.0: corner arcs are always on; the debug switch turns them off for a straight-line check. */
async function arcs(on) {
  globalThis.CONFIG.debug ??= {};
  globalThis.CONFIG.debug["pentaryn-movement.arcs"] = on;
  // As the old setting's change did: the step cache goes (a re-set of a live setting clears it).
  await set("pathfindMine", true);
}

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
  await arcs(false);
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
  // The grid optimum is 40 (5 across, 4 down and back up, diagonals at 5 ft), but its one diagonal step past the
  // wall's end takes the body over that end: out of combat the corner is rounded, one square more (H2-14).
  assert.equal(t.measureMovementPath(path).cost, 45);
  assert.ok(clearOfEnd(path, { x: 300, y: 400 }), "the body never passes over the wall's end");
});

/** Every leg's centre line keeps a 1×1 body (48 px) off a wall end. */
function clearOfEnd(path, c) {
  for (let k = 1; k < path.length; k++) {
    const a = center(path[k - 1]), b = center(path[k]);
    const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - a.x) * (b.x - a.x) + (c.y - a.y) * (b.y - a.y)) / L2, 0), 1) : 0;
    if (Math.hypot(c.x - (a.x + (b.x - a.x) * t), c.y - (a.y + (b.y - a.y) * t)) < 48 - 1e-6) return false;
  }
  return true;
}

test("smooth corners: arcs are placed where clear, and the cost stays the grid optimum", async () => {
  await arcs(true);
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  const t = makeToken();
  const path = drag(t, [wp(0, 0), wp(500, 0)]).result;
  for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0);
  assert.equal(t.measureMovementPath(path).cost, 45, "the rounded corner's square, no more (the arcs cost nothing)");
  assert.ok(clearOfEnd(path, { x: 300, y: 400 }), `arcs keep the body off the wall's end: ${JSON.stringify(path.map(w => [w.x, w.y]))}`);
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
  // The exhaustive search can outlast one slice on a loaded machine (the gate runs the files in parallel): then the
  // job finishes in timer slices, with the same answer.
  for (let i = 0; i < 1000 && job.result === undefined; i++) mock.timers.tick(1);
  assert.equal(job.result.length, 1);
  assert.equal(api.pathfind.status().last.found, 0);
});

test("a 2×2 token is not routed through a one-square gap; a 1×1 token is", async () => {
  await arcs(false);
  // A wall along y = 300 with a one-square gap at x 400..500; both drags start left of it.
  world.walls = [[{ x: 0, y: 300 }, { x: 400, y: 300 }], [{ x: 500, y: 300 }, { x: 1000, y: 300 }]];
  const one = drag(makeToken({ x: 100 }), [wp(100, 0), wp(100, 600)]).result;
  assert.deepEqual([one.at(-1).x, one.at(-1).y], [100, 600], "1×1 goes round through the gap");
  const big = drag(makeToken({ x: 100, size: 2 }), [wp(100, 0, 2), wp(100, 600, 2)]).result;
  assert.equal(big.length, 1, "2×2: no route, core's stop at the wall");
  assert.equal(api.pathfind.status().last.found, 0);
  await arcs(true);
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

test("the step cache is per mover: one token's own square is not another's free square", async () => {
  const { fieldFor } = await import("../pathfind-adapter.mjs");
  world.walls = [];
  // Token B stands on the square at (300, 0); dnd5e blocks every creature but B itself there.
  const occupied = { x: 300, y: 0 };
  const layer = { isOccupiedGridSpaceBlocking: (space, mover) => space.i === 0 && space.j === 3 && mover.document.id !== "tokB000000000001" };
  const creature = (id, x, y) => {
    const t = makeToken({ x, y });
    t.document.id = id;
    t.document.actor = { system: { isCreature: true }, statuses: new Set() };
    t.document.getOccupiedGridSpaceOffsets = w => [cell(w)];
    t.layer = layer;
    return t;
  };
  const a = creature("tokA000000000001", 0, 0);
  const b = creature("tokB000000000001", occupied.x, occupied.y);
  const memo = new Map();
  const goal = wp(500, 0);
  const opts = { memo, automation: "full" };
  const fb = fieldFor(b, wp(occupied.x, occupied.y), goal, opts);
  assert.equal(fb.blocking, true);
  assert.equal(fb.blocked(fb.nodeOf(occupied)), false, "B's own square is free to B");
  const fa = fieldFor(a, wp(0, 0), goal, opts);
  assert.equal(fa.blocked(fa.nodeOf(occupied)), true, "the same square blocks A, cache or not");
});

/** Count the wall rays one drag casts (0 = every step came from the cache). */
function raysOf(fn) {
  const orig = Token5e.prototype.checkCollision;
  let n = 0;
  Token5e.prototype.checkCollision = function (...a) { n += 1; return orig.apply(this, a); };
  try { fn(); } finally { Token5e.prototype.checkCollision = orig; }
  return n;
}

test("the step cache expires by age, not idle time: a drag that keeps using it still re-reads after 2 s", async () => {
  await arcs(false);
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  const realNow = Date.now;
  let t = 1_000_000_000;
  Date.now = () => t;
  try {
    F.fire("updateWall");                                    // a fresh cache, born now
    const tok = makeToken();
    const again = () => raysOf(() => drag(tok, [wp(0, 0), wp(500, 0)]));
    assert.ok(again() > 0, "the first drag casts its rays");
    for (const step of [500, 500, 500]) {                    // busy every 500 ms: reused
      t += step;
      assert.equal(again(), 0, `reused at +${t - 1_000_000_000} ms`);
    }
    t += 600;                                                // 2.1 s old, though used 600 ms ago
    assert.ok(again() > 0, "rebuilt once the cache is older than 2 s");
  } finally {
    Date.now = realNow;
    await arcs(true);
  }
});

test("the step cache drops when this client's fog is explored and when the controlled tokens change", async () => {
  world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
  const fog = new EventTarget();
  F.canvas.fog = fog;
  F.fire("canvasReady", F.canvas);
  const go = () => drag(makeToken(), [wp(0, 0), wp(500, 0)]);
  go();
  assert.ok(api.pathfind.status().memo > 0);
  fog.dispatchEvent(new Event("explored"));
  assert.equal(api.pathfind.status().memo, 0, "fog explored → dropped");
  go();
  assert.ok(api.pathfind.status().memo > 0);
  F.fire("controlToken", {}, true);
  assert.equal(api.pathfind.status().memo, 0, "controlToken → dropped");
  // A new FogManager: the old one no longer drops the cache, the new one does.
  const fog2 = new EventTarget();
  F.canvas.fog = fog2;
  F.fire("canvasReady", F.canvas);
  go();
  fog.dispatchEvent(new Event("explored"));
  assert.ok(api.pathfind.status().memo > 0, "the old fog is unwatched");
  fog2.dispatchEvent(new Event("explored"));
  assert.equal(api.pathfind.status().memo, 0);
  delete F.canvas.fog;
});

/* -------------------------------------------- */
/*  Places an auto-route never goes (0.4.0)     */
/* -------------------------------------------- */

// A wall down x = 300 the whole height, with openings at y 400–500 (A) and y 800–900 (B).
const splitWith = (a, b = null) => [
  [{ x: 300, y: 0 }, { x: 300, y: 400 }], a, [{ x: 300, y: 500 }, { x: 300, y: 800 }],
  b ?? [{ x: 300, y: 800 }, { x: 300, y: 900 }], [{ x: 300, y: 900 }, { x: 300, y: 1000 }],
];
const A = (kind, ds) => door({ x: 300, y: 400 }, { x: 300, y: 500 }, kind, ds);
const B = (kind, ds) => door({ x: 300, y: 800 }, { x: 300, y: 900 }, kind, ds);
// Touching counts (a line through a door's end passes that door).
const crossesSeg = (path, [a, b]) => path.some((w, k) => k > 0 && segmentsCross(center(path[k - 1]), center(w), a, b));
const reaches = (path, x, y) => path.at(-1).x === x && path.at(-1).y === y;

test("doors: an auto-route uses an open door, never a closed or locked one", async () => {
  await arcs(false);
  try {
    world.walls = splitWith(A(1, 1), B(1, 0));
    F.fire("updateWall");
    let path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(reaches(path, 500, 0), "through the open door");
    assert.ok(crossesSeg(path, world.walls[1]), `the route passes door A: ${JSON.stringify(path.map(w => [w.x, w.y]))}`);
    for (const ds of [0, 2]) {                                  // closed, locked
      world.walls = splitWith(A(1, ds), B(1, ds));
      F.fire("updateWall");
      path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
      assert.ok(!reaches(path, 500, 0), `ds ${ds}: no route, core's partial path`);
    }
  } finally {
    world.walls = [];
    F.fire("updateWall");
    await arcs(true);
  }
});

test("secret doors: an auto-route never passes one, open or shut; an ordinary open door elsewhere is used", async () => {
  await arcs(false);
  try {
    world.walls = splitWith(A(2, 1), B(1, 0));                  // the secret door stands open, B is shut
    F.fire("updateWall");
    let path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(!reaches(path, 500, 0), "no route through an open secret door");
    world.walls = splitWith(A(2, 1), B(1, 1));                  // B open too: the route takes B
    F.fire("updateWall");
    path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(reaches(path, 500, 0));
    assert.ok(!crossesSeg(path, world.walls[1]), "never through the secret door");
    assert.ok(crossesSeg(path, world.walls[3]), "through door B");
    // routeTo (a group member's route, pathfind.route): even where core's own straight line goes
    // through the open secret door, the route this module invents goes round by door B.
    world.walls = splitWith(A(2, 1), B(1, 1));
    F.fire("updateWall");
    const t = makeToken({ x: 200, y: 400 });
    Object.assign(t.document, { object: t, documentName: "Token", uuid: "Scene.sceneA.Token.tok0000000000001" });
    const r = api.pathfind.route(t.document, { to: { x: 400, y: 400 } });
    assert.equal(r.ok, true);
    assert.equal(r.reached, true);
    assert.equal(r.straight, false, "core's straight line was not taken");
    assert.ok(!crossesSeg(r.waypoints, world.walls[1]), "not through the secret door");
  } finally {
    world.walls = [];
    F.fire("updateWall");
    await arcs(true);
  }
});

test("teleport / change-level regions: an auto-route keeps out unless the leg ends or starts inside; hidden ones count only for a GM", async () => {
  await arcs(false);
  const zone = { x: 200, y: 400, w: 250, h: 300 };
  const inZone = path => {
    for (let k = 1; k < path.length; k++) {
      const a = center(path[k - 1]), b = center(path[k]);
      for (let t = 0; t <= 1; t += 0.05) if (inRect(zone, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return true;
    }
    return false;
  };
  try {
    world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
    world.regions = [];
    F.fire("updateWall");
    const plain = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(reaches(plain, 500, 0) && inZone(plain), "without the region the shortest way passes where it will be");
    for (const type of ["teleportToken", "changeLevel"]) {
      world.regions = [region("reg0000000000001", zone, { type })];
      F.fire("updateRegion");
      const path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
      assert.ok(reaches(path, 500, 0), `${type}: still reached`);
      assert.ok(!inZone(path), `${type}: the route keeps out of the region`);
    }
    // The destination inside it: allowed (the token is going there).
    const into = drag(makeToken(), [wp(0, 0), wp(300, 500)]).result;
    assert.ok(reaches(into, 300, 500), "a leg that ends in the region gets there");
    // Starting inside it: leaving is free.
    const out = drag(makeToken({ x: 300, y: 500 }), [wp(300, 500), wp(0, 600)]).result;
    assert.ok(reaches(out, 0, 600));
    // A disabled behaviour, or a behaviour that moves nobody: no effect.
    for (const r of [region("reg0000000000002", zone, { disabled: true }), region("reg0000000000003", zone, { type: "executeScript" })]) {
      world.regions = [r];
      F.fire("updateRegion");
      assert.ok(inZone(drag(makeToken(), [wp(0, 0), wp(500, 0)]).result));
    }
    // Hidden: a player's route does not bend round it (that would give it away).
    world.regions = [region("reg0000000000004", zone, { hidden: true })];
    F.fire("updateRegion");
    assert.ok(inZone(drag(makeToken(), [wp(0, 0), wp(500, 0)]).result), "a player ignores a hidden region");
  } finally {
    world.walls = [];
    world.regions = [];
    F.fire("updateRegion");
    await arcs(true);
  }
});

test("R5-4: a straight drag core allows whole is routed round a teleport region it would walk into, unless it ends there", async () => {
  await arcs(false);
  const zone = { x: 200, y: 0, w: 150, h: 300 };
  const inZone = path => {
    for (let k = 1; k < path.length; k++) {
      const a = center(path[k - 1]), b = center(path[k]);
      for (let t = 0; t <= 1; t += 0.05) if (inRect(zone, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return true;
    }
    return false;
  };
  try {
    world.walls = [];
    world.regions = [region("reg00000000000r5", zone)];
    F.fire("updateRegion");
    const path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(reaches(path, 500, 0), "still reached");
    assert.ok(!inZone(path), `no wall in the way, yet the route keeps out of the region: ${JSON.stringify(path.map(w => [w.x, w.y]))}`);
    // Dropped inside it: core's straight line, the token goes there on purpose.
    const into = drag(makeToken(), [wp(0, 0), wp(200, 0)]).result;
    assert.deepEqual(into.map(w => [w.x, w.y]), [[0, 0], [200, 0]]);
    // Sealed round it: no way round, core's line stays.
    world.regions = [region("reg00000000000r6", { x: 200, y: -2000, w: 150, h: 6000 })];
    F.fire("updateRegion");
    assert.ok(reaches(drag(makeToken(), [wp(0, 0), wp(500, 0)]).result, 500, 0));
  } finally {
    world.regions = [];
    F.fire("updateRegion");
    await arcs(true);
  }
});

test("fog: a player's route never plans through ground that player has not explored and cannot see", async () => {
  await arcs(false);
  const vis = F.canvas.visibility;
  let explored = c => c.y < 400;
  F.canvas.visibility = { tokenVision: true, testVisibility: () => false };
  F.canvas.fog = { isPointExplored: c => explored(c), addEventListener() {}, removeEventListener() {} };
  try {
    world.walls = [[{ x: 300, y: 0 }, { x: 300, y: 400 }]];
    F.fire("updateWall");
    let path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(!reaches(path, 500, 0), "the only way round is unexplored: no route");
    explored = c => c.y < 600;
    F.fire("updateWall");
    path = drag(makeToken(), [wp(0, 0), wp(500, 0)]).result;
    assert.ok(reaches(path, 500, 0), "explored now: routed");
    for (const w of path) assert.ok(explored(center(w)), "every corner on explored ground");
  } finally {
    F.canvas.visibility = vis;
    delete F.canvas.fog;
    world.walls = [];
    F.fire("updateWall");
    await arcs(true);
  }
});

test("H2-11: a 2×2 cut at a one-square door rests with its whole body clear of the frame", async () => {
  await arcs(false);
  // A wall along x = 500 with a one-square door gap at y 300..400; the Large walks straight at it.
  world.walls = [[{ x: 500, y: 0 }, { x: 500, y: 300 }], [{ x: 500, y: 400 }, { x: 500, y: 1000 }]];
  F.fire("updateWall");
  const big = drag(makeToken({ x: 100, y: 250, size: 2 }), [wp(100, 250, 2), wp(700, 250, 2)]).result;
  const end = big.at(-1);
  assert.ok(end.x + 2 * S <= 500 + 2 * S * 0.01 + 1, `the box (x ${end.x}..${end.x + 2 * S}) stays west of the frame at x 500`);
  assert.ok(end.x >= 250, `it still walks up to the door: ${end.x}`);
  await arcs(true);
});

test("H2-04: on a scene with no terrain, a search measures each step direction once (not every step)", async () => {
  await arcs(false);
  world.walls = [[{ x: 650, y: 50 }, { x: 650, y: 850 }]];
  F.fire("updateWall");
  const orig = Token5e.prototype.measureMovementPath;
  let steps = 0;
  Token5e.prototype.measureMovementPath = function (wps, o) { if (wps.length === 2) steps += 1; return orig.call(this, wps, o); };
  try {
    const job = drag(makeToken({ x: 400, y: 400 }), [wp(400, 400), wp(900, 400)]);
    assert.deepEqual([job.result.at(-1).x, job.result.at(-1).y], [900, 400]);
  } finally { Token5e.prototype.measureMovementPath = orig; }
  assert.ok(steps <= 8, `two-waypoint measures: ${steps}`);
  await arcs(true);
});

test("0.10 live round 2: a Difficult Terrain region away from the way does not make a search measure every step (1,083 of a twelve-member plan's 1,493 ms on the page); a step into it still is", async () => {
  await arcs(false);
  world.walls = [[{ x: 650, y: 50 }, { x: 650, y: 850 }]];
  const terrain = { disabled: false, system: { _getTerrainEffects() { return []; } } };
  const zone = (id, x, y, w, h) => ({ id, hidden: false, rect: { x, y, w, h }, bounds: { x, y, width: w, height: h }, behaviors: [terrain] });
  const orig = Token5e.prototype.measureMovementPath;
  let steps = 0;
  Token5e.prototype.measureMovementPath = function (wps, o) { if (wps.length === 2) steps += 1; return orig.call(this, wps, o); };
  try {
    world.regions = [zone("mud0000000000001", 0, 900, 100, 100)];
    F.fire("updateRegion");
    const job = drag(makeToken({ x: 400, y: 400 }), [wp(400, 400), wp(900, 400)]);
    assert.deepEqual([job.result.at(-1).x, job.result.at(-1).y], [900, 400]);
    assert.ok(steps <= 8, `a region far away: two-waypoint measures ${steps}`);
    // The same region over the way: its steps are measured one by one (their cost is the region's).
    world.regions = [zone("mud0000000000002", 600, 0, 200, 1000)];
    F.fire("updateRegion");
    steps = 0;
    const over = drag(makeToken({ x: 400, y: 400 }), [wp(400, 400), wp(900, 400)]);
    assert.deepEqual([over.result.at(-1).x, over.result.at(-1).y], [900, 400]);
    assert.ok(steps > 8, `a region on the way: its steps measured (${steps})`);
    // A region with no box to read: every step measured, as before.
    world.regions = [{ ...zone("mud0000000000003", 0, 900, 100, 100), bounds: null }];
    F.fire("updateRegion");
    steps = 0;
    drag(makeToken({ x: 400, y: 400 }), [wp(400, 400), wp(900, 400)]);
    assert.ok(steps > 8, `no box: every step measured (${steps})`);
  } finally {
    Token5e.prototype.measureMovementPath = orig;
    world.regions = [];
    world.walls = [];
    F.fire("updateRegion");
    await arcs(true);
  }
});

test("0.10 live round 2: the squares of tokens dnd5e leaves out of its creature difficult terrain (the dragger's own, hidden, the mover's disposition under the 2024 rules) cost by direction; a hostile's square is measured", async () => {
  await arcs(false);
  world.walls = [[{ x: 650, y: 50 }, { x: 650, y: 850 }]];
  const creature = { system: { isCreature: true, traits: { size: "med" } } };
  const at = (id, i, j, more = {}) => ({ id, disposition: 1, hidden: false, actor: creature, object: { controlled: false }, getOccupiedGridSpaceOffsets: () => [{ i, j }], ...more });
  const orig = Token5e.prototype.measureMovementPath;
  const had = globalThis.dnd5e;
  let steps = 0;
  Token5e.prototype.measureMovementPath = function (wps, o) { if (wps.length === 2) steps += 1; return orig.call(this, wps, o); };
  const run = list => {
    world.tokens = list;
    F.fire("updateToken");
    steps = 0;
    const t = makeToken({ x: 400, y: 400 });
    t.document.disposition = 1;
    t.document.getOccupiedGridSpaceOffsets = w => [{ i: Math.floor(w.y / S), j: Math.floor(w.x / S) }];
    const job = drag(t, [wp(400, 400), wp(900, 400)]);
    assert.deepEqual([job.result.at(-1).x, job.result.at(-1).y], [900, 400]);
    return steps;
  };
  try {
    globalThis.dnd5e = { settings: { rulesVersion: "modern" } };
    const around = [[3, 5], [4, 5], [5, 5], [3, 6], [5, 6], [4, 4]];
    const mine = run(around.map(([i, j], k) => at(`own000000000000${k}`, i, j, { object: { controlled: true } })));
    assert.ok(mine <= 8, `the dragger's own tokens: ${mine}`);
    const hidden = run(around.map(([i, j], k) => at(`hid000000000000${k}`, i, j, { hidden: true, disposition: -1 })));
    assert.ok(hidden <= 8, `hidden tokens: ${hidden}`);
    const friends = run(around.map(([i, j], k) => at(`fri000000000000${k}`, i, j)));
    assert.ok(friends <= 8, `friends under the 2024 rules: ${friends}`);
    const foes = run(around.map(([i, j], k) => at(`foe000000000000${k}`, i, j, { disposition: -1 })));
    assert.ok(foes > 8, `hostiles: their squares measured (${foes})`);
    globalThis.dnd5e = { settings: { rulesVersion: "legacy" } };
    const legacy = run(around.map(([i, j], k) => at(`leg000000000000${k}`, i, j)));
    assert.ok(legacy > 8, `friends under the 2014 rules: measured (${legacy})`);
  } finally {
    Token5e.prototype.measureMovementPath = orig;
    globalThis.dnd5e = had;
    world.tokens = [];
    world.walls = [];
    F.fire("updateToken");
    await arcs(true);
  }
});

test("0.10 live round 2: the wall answers are shared by every token of one size (a group's members walk the same ways: each asked core again), and a position's squares are asked of core once", async () => {
  await arcs(false);
  world.walls = [[{ x: 650, y: 50 }, { x: 650, y: 850 }]];
  F.fire("updateWall");
  const orig = Token5e.prototype.checkCollision;
  try {
    const tok = (id, size = 1) => { const t = makeToken({ x: 400, y: 400, size }); t.document.id = id; return t; };
    const first = raysOf(() => drag(tok("grp0000000000001"), [wp(400, 400), wp(900, 400)]));
    const second = raysOf(() => drag(tok("grp0000000000002"), [wp(400, 400), wp(900, 400)]));
    assert.ok(first > 0, `the first asks core: ${first}`);
    assert.equal(second, 0, "a second token of the same size asks core nothing new");
    const big = raysOf(() => drag(tok("grp0000000000003", 2), [wp(400, 400, 2), wp(900, 400, 2)]));
    assert.ok(big > 0, `a token of another size asks core for its own: ${big}`);
    // Its squares: once per position though both the creature test and the cost ask for them.
    F.fire("updateWall");
    const t = tok("grp0000000000004");
    const asked = new Map();
    t.document.getOccupiedGridSpaceOffsets = w => { const k = `${w.x},${w.y}`; asked.set(k, (asked.get(k) ?? 0) + 1); return [{ i: Math.floor(w.y / S), j: Math.floor(w.x / S) }]; };
    world.tokens = [{ id: "foe0000000000001", disposition: -1, hidden: false, actor: { system: { isCreature: true } }, object: { controlled: false }, getOccupiedGridSpaceOffsets: () => [{ i: 4, j: 5 }] }];
    const had = F.CONFIG.DND5E;
    drag(t, [wp(400, 400), wp(900, 400)]);
    assert.ok(asked.size > 10, `positions asked: ${asked.size}`);
    assert.equal(Math.max(...asked.values()), 1, "each position asked once");
    F.CONFIG.DND5E = had;
  } finally {
    Token5e.prototype.checkCollision = orig;
    world.tokens = [];
    world.walls = [];
    F.fire("updateWall");
    await arcs(true);
  }
});

test("AR2-06: out of combat a route keeps its square clear of a standing token's square (a box), not only its circle: a smoothed corner passed 0.11 square into it", async () => {
  const { fieldFor } = await import("../pathfind-adapter.mjs");
  world.walls = [];
  const t = makeToken({ x: 0, y: 0 });
  // A standing 1x1 token centred at (350, 150); the mover is 1x1: centres closer than 100 px on both axes overlap.
  const stand = { x: 350, y: 150, r: 99 };
  // The mover's centre from (50, 50) to (260, 230) (top-lefts (0,0) → (210,180)): its closest point to the standing
  // centre is ~107 px away (clear of the circle) but at (260, 230) it is 90 px off on x and 80 on y (inside the box).
  const p = { x: 0, y: 0 }, q = { x: 210, y: 180 };
  const circle = fieldFor(t, wp(0, 0), wp(500, 0), { avoid: [stand] });
  assert.equal(circle.clear(p, q), true, "a circle lets the corner through");
  const box = fieldFor(t, wp(0, 0), wp(500, 0), { avoid: [{ ...stand, box: true }] });
  assert.equal(box.clear(p, q), false, "a box does not");
  assert.equal(box.clear({ x: 0, y: 0 }, { x: 0, y: 200 }), true, "a way a whole square off it is clear");
});

/* -------------------------------------------- */
/*  0.10 R9: narrow ways (Joe's S05, the spiral C stair, through the wrap)       */
/* -------------------------------------------- */

const { readFileSync } = await import("node:fs");
const S05 = JSON.parse(readFileSync(new URL("./fixtures/narrow-stations.json", import.meta.url), "utf8")).stations.find(s => s.id === "S05");
/** S05's walls in pixels (the default scenario: the long way's door shut), on a canvas big enough to hold it. */
function onStair() {
  world.walls = S05.walls.filter(w => !w.only).map(w => [{ x: w.c[0] * S, y: w.c[1] * S }, { x: w.c[2] * S, y: w.c[3] * S }]);
  const old = F.canvas.dimensions;
  F.canvas.dimensions = { rect: { x: 0, y: 0, width: 2500, height: 5000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2500 && y <= 5000 } };
  world.touch = true;
  F.fire("updateWall");
  return () => { F.canvas.dimensions = old; world.walls = []; world.touch = false; F.fire("updateWall"); };
}
/** The least distance (px) of a path's centre line, sampled every 1/16 square, to any wall; and whether it crosses one. */
function clearanceOf(path, size = 1) {
  const segD = (p, a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0), 1) : 0;
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  };
  let min = Infinity, through = false;
  for (let k = 1; k < path.length; k++) {
    const a = center({ ...path[k - 1], width: size, height: size }), b = center({ ...path[k], width: size, height: size });
    if (crossing(a, b).length) through = true;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (S / 16)));
    for (let s = 0; s <= n; s++) {
      const p = { x: a.x + ((b.x - a.x) * s) / n, y: a.y + ((b.y - a.y) * s) / n };
      for (const [u, v] of world.walls) min = Math.min(min, segD(p, u, v));
    }
  }
  return { min, through };
}

test("R9: a drag over Joe's spiral C stair (S05) crosses from room A to room B in one route on the centre line, 0.15 square clear", async () => {
  await arcs(true);
  const done = onStair();
  try {
    const t = makeToken({ x: 800, y: 3300 });
    const job = drag(t, [wp(800, 3300), wp(600, 4400)]);
    const path = job.result;
    assert.deepEqual([path.at(-1).x, path.at(-1).y], [600, 4400], "reaches room B");
    const c = clearanceOf(path);
    assert.equal(c.through, false);
    assert.ok(c.min >= 14.9, `clearance ${c.min} px: ${JSON.stringify(path.map(w => [w.x, w.y]))}`);
    assert.ok(path.some(w => w.x > 1300), "over the stair (it bulges east of the rooms)");
    const last = api.pathfind.status().last;
    assert.equal(last.narrow, true);
    assert.ok(last.minClearance >= 0.149, JSON.stringify(last));
    for (const w of path.slice(1, -1)) assert.equal(w.explicit, false);
    // pathfind.route reports it too (R13).
    Object.assign(t.document, { object: t, documentName: "Token", uuid: "Scene.sceneA.Token.tok0000000000001" });
    const r = api.pathfind.route(t.document, { to: { x: 600, y: 4400 } });
    assert.equal(r.reached, true);
    assert.equal(r.narrow, true);
    assert.ok(r.minClearance >= 0.149 && r.minClearance < 0.5, String(r.minClearance));
  } finally { done(); }
});

test("R9: a destination dropped off the stair's centre line rests on it (the nearest centre-line point)", async () => {
  const done = onStair();
  try {
    const t = makeToken({ x: 800, y: 3300 });
    // Shift-dropped 0.1 square east of the centre line at the narrowest (0.4 wide): top-left (1560, 3800).
    const job = drag(t, [wp(800, 3300), { ...wp(1560, 3800), snapped: false }]);
    const end = job.result.at(-1);
    assert.ok(Math.abs(end.x - 1550) <= 1 && Math.abs(end.y - 3800) <= 1, `rests at ${end.x}, ${end.y}`);
    assert.equal(clearanceOf(job.result).through, false);
    Object.assign(t.document, { object: t, documentName: "Token", uuid: "Scene.sceneA.Token.tok0000000000001" });
    const r = api.pathfind.route(t.document, { to: { x: 1560, y: 3800 } });
    assert.ok(r.reached && r.goal && Math.abs(r.goal.x - 1550) <= 1, JSON.stringify(r.goal));
  } finally { done(); }
});

test("R9 / decision 8: a Large never takes the narrow way: with no way round it is not routed through the stair", async () => {
  const done = onStair();
  try {
    const t = makeToken({ x: 400, y: 3000, size: 2 });
    t.document.id = "tokLarge00000001";
    const job = drag(t, [wp(400, 3000, 2), wp(600, 4400, 2)]);
    const path = job.result;
    assert.ok(!(path.at(-1).x === 600 && path.at(-1).y === 4400), "not through");
    assert.ok(!path.some(w => w.x > 1050), "never onto the stair");
    // Where it stops, its whole body (a 2×2: radius 100 px) is clear of every wall (decision 8: stop before the mouth).
    const c = center({ ...path.at(-1), width: 2, height: 2 });
    const body = Math.min(...world.walls.map(([u, v]) => {
      const dx = v.x - u.x, dy = v.y - u.y, L2 = dx * dx + dy * dy;
      const t = L2 ? Math.min(Math.max(((c.x - u.x) * dx + (c.y - u.y) * dy) / L2, 0), 1) : 0;
      return Math.hypot(c.x - u.x - dx * t, c.y - u.y - dy * t);
    }));
    assert.ok(body >= 98, `its body ${body} px from a wall at ${JSON.stringify(c)}`);
    Object.assign(t.document, { object: t, documentName: "Token", uuid: "Scene.sceneA.Token.tokLarge00000001" });
    const r = api.pathfind.route(t.document, { to: { x: 600, y: 4400 } });
    assert.equal(r.reached, false);
    assert.equal(r.narrow, false);
  } finally { done(); }
});

test("0.10 live round 1: core's wall test (Token#checkCollision, most of a plan's time on the page) runs only for a step that comes near a wall; the routes are the same", async () => {
  await arcs(false);
  // A wall at x = 400 from the top down to y = 300, and a wall across y = 700 with a door gap at x 400-500.
  world.walls = [[{ x: 400, y: 0 }, { x: 400, y: 300 }], [{ x: 0, y: 700 }, { x: 400, y: 700 }], [{ x: 500, y: 700 }, { x: 1000, y: 700 }]];
  F.fire("updateWall");
  try {
    const tok = makeToken();
    let job;
    const round = raysOf(() => { job = drag(tok, [wp(0, 0), wp(800, 0)]); });
    const p = job.result;
    // The routes as before the broad phase (112 and 192 core rays then).
    assert.deepEqual(p.map(w => [w.x, w.y]), [[0, 0], [300, 300], [400, 300], [800, 0]], "round the wall");
    for (let k = 1; k < p.length; k++) assert.equal(crossing(center(p[k - 1]), center(p[k])).length, 0, "never through the wall");
    F.fire("updateWall");
    let thru;
    const gap = raysOf(() => { thru = drag(tok, [wp(0, 0), wp(100, 900)]); });
    const q = thru.result;
    assert.deepEqual(q.map(w => [w.x, w.y]), [[0, 0], [400, 600], [400, 700], [100, 900]], "through the gap");
    for (let k = 1; k < q.length; k++) assert.equal(crossing(center(q[k - 1]), center(q[k])).length, 0, "never through the wall");
    assert.ok(round > 0 && gap > 0, "the rays near a wall still ask core");
    assert.ok(round <= 30 && gap <= 50, `only the rays near a wall: ${round}, ${gap}`);
  } finally {
    world.walls = [];
    F.fire("updateWall");
  }
});
