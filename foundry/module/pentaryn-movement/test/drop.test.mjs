// Group movement and click to stop (group.mjs, stop.mjs, group-adapter.mjs) against a synthetic token
// layer: a 100 px square grid, wall segments, a core findMovementPath that stops at the first wall,
// and a core _prepareDragLeftDropUpdates that builds [updates, options] from the drag contexts the
// way core does. What is pinned: a group drop walks each member to its own spot in waves without a
// rest overlap; ghost keeps core's straight lines; a combat drop gets a checkpoint at every cell at
// the same cost; a forced planner throw is core's drop with one warning; a slow plan finishes
// asynchronously in the same update shape; followers are not pathfound while a group is dragged;
// a click on a moving token displaces it out of combat, stops it in combat, asks the GM otherwise.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { movementWorld, drop, clicks, doors, SCENE } from "./fixtures/world.mjs";
import { MOTION } from "../motion-core.mjs";
import { fitPath } from "../group-adapter.mjs";
import { avoidDist } from "../pathfind-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
/** Advance the mocked clock in 50 ms steps, as a page's timers run (a wave is timed from the one before it, HX1-06). */
function tickBy(ms) { for (let t = 0; t < ms; t += 50) mock.timers.tick(Math.min(50, ms - t)); }

const MOD = "pentaryn-movement";
const S = 100;
const F = await movementWorld();

// A clock only the tests move (the planner's budget reads performance.now).
const clock = { t: 0, step: 0 };
Object.defineProperty(globalThis, "performance", { value: { now: () => (clock.t += clock.step) }, configurable: true, writable: true });

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

test("the drop and click wraps are in; status().group reports them", () => {
  assert.equal(Token5e.prototype._prepareDragLeftDropUpdates.__pentarynMovementGroup, true);
  assert.equal(Token5e.prototype._onClickLeft.__pentarynMovementStop, true);
  const g = api.status().group;
  assert.deepEqual(g.patched, { drop: true, click: true });
  assert.equal(g.enabled, true);
  assert.equal(g.fight, true, "a group drag in a fight is the fight file (0.9.0: tier C gone)");
  assert.equal(api.selftest().ok, true, JSON.stringify(api.selftest().checks));
});

test("a single drag out of combat is core's drop, untouched", () => {
  combatFlag = false;
  const a = makeToken("solo000000000001", 100, 100);
  const ctx = contextsFor([a], 300, 0);
  const core = coreDrop(ctx);
  drop.result = core;
  const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  assert.equal(out, core);
  assert.equal(api.status().group.last.reason, "single");
});

test("in combat a drop gets a checkpoint at every cell, at exactly the same cost", () => {
  combatFlag = true;
  const a = makeToken("cmbA000000000001", 0, 0);
  const ctx = { [a.document.id]: { token: a, destination: wp(400, 200), foundPath: [wp(0, 0, { explicit: false }), wp(400, 200)], waypoints: [] } };
  drop.result = coreDrop(ctx);
  const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  const wps = out[1].movement[a.document.id].waypoints;
  assert.equal(wps.length, 4, "one waypoint per cell walked");
  for (const w of wps) {
    assert.equal(w.checkpoint, true);
    assert.equal(w.x % S, 0);
    assert.equal(w.y % S, 0);
  }
  assert.equal(a.measureMovementPath([a.document._source, ...wps]).cost, 20);
  combatFlag = false;
});

test("a forced planner throw: the move is core's own, with one warning", () => {
  const ts = [makeToken("thrA000000000001", 400, 200), makeToken("thrB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  const core = coreDrop(ctx);
  drop.result = core;
  F.CONFIG.debug = { ...(F.CONFIG.debug ?? {}), [`${MOD}.throw`]: true };
  const warns = [];
  const saved = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  try {
    const out = ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    assert.equal(out, core);
    ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  } finally {
    console.warn = saved;
    delete F.CONFIG.debug[`${MOD}.throw`];
  }
  assert.equal(warns.length, 1, warns.join("\n"));
  assert.match(warns[0], /pentaryn-movement \| drop help skipped/);
  assert.equal(api.status().group.fallbacks[0].reason, "throw");
  // R4-11: last says what happened, not the plan it was about to make.
  const last = api.status().group.last;
  assert.deepEqual([last.mode, last.result, last.reason], ["core", "core", "throw"]);
});

test("R4-11: a group dropped where it stands plans nothing and is instant", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("zeroA00000000001", 700, 100), makeToken("zeroB00000000001", 800, 100)];
  const ctx = contextsFor(ts, 0, 0);
  const core = coreDrop(ctx);
  drop.result = core;
  const from = F.calls.length;
  clock.step = 50;                                    // a plan would read the clock and run over budget
  try {
    const out = ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    assert.equal(out, core, "core's own (zero-length) drop, untouched");
  } finally { clock.step = 0; }
  tickBy(5000);
  assert.equal(sent(from).length, 0);
  const last = api.status().group.last;
  assert.deepEqual([last.mode, last.reason, last.result, last.async], ["core", "still", "core", false]);
});

test("H1-04: a 2x2 token's straight drag through a one-square door stops where its body still fits; a 1x1 walks through", async () => {
  combatFlag = false;
  clock.step = 0;
  const big = makeToken("bigL000000000001", 350, 100, { size: 2 });
  const origin = wp(350, 100, { width: 2, height: 2, snapped: false, explicit: false, checkpoint: false });
  const dest = wp(350, 600, { width: 2, height: 2 });
  const job = big.findMovementPath([origin, dest], { preview: true, constrainOptions: {} });
  const path = job.result ?? await job.promise;
  const end = path.at(-1);
  assert.ok(end.y + 100 <= 360, `stops before the door, its centre clear of the door line: ${JSON.stringify(end)}`);
  assert.ok(end.y > 100, "it still walks up to the door");
  const small = makeToken("bigS000000000001", 400, 100);
  const sjob = small.findMovementPath([wp(400, 100, { snapped: false, explicit: false, checkpoint: false }), wp(400, 600)], { preview: true, constrainOptions: {} });
  const spath = sjob.result ?? await sjob.promise;
  assert.equal(spath.at(-1).y, 600, "a 1x1 goes through the door");
  sceneTokens.delete(big.document.id); sceneTokens.delete(small.document.id);
});

test("decision 7: a single drag where it has no way to go does not move and says so; dropped where its way does go, no notice", () => {
  combatFlag = false;
  clock.step = 0;
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);          // the door shut: nothing south is reachable
  try {
    // A single token dropped there: it does not move at all (decision 7), and a warning.
    const one = makeToken("nrtD000000000001", 700, 200);
    const c1 = contextsFor([one], 0, 400);
    c1[one.document.id].foundPath.push(wp(700, 300));
    const f2 = F.calls.length;
    assert.equal(dropWith(one, c1), null, "no move");
    assert.equal(api.status().group.last.reason, "noRoute");
    assert.ok(F.calls.slice(f2).some(c => c.op === "notify" && c.level === "warn" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"));
    // Dropped where its way does go: no notice.
    const f3 = F.calls.length;
    dropWith(one, contextsFor([one], 0, 100));
    assert.ok(!F.calls.slice(f3).some(c => c.op === "notify"));
  } finally {
    world.walls.pop();
    tickBy(60000);
  }
});

test("click to stop out of combat: put exactly where it is drawn (animate false; decision 2 as revised 2026-11-23), then core's click", () => {
  combatFlag = false;
  const t = makeToken("clkA000000000001", 100, 100);
  t.document._source = { ...t.document._source, x: 600, y: 100 };   // the server holds the end
  t.document.x = 320; t.document.y = 100;                           // drawn mid-way
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  t._onClickLeft({});
  const move = F.calls.slice(from).find(c => c.op === "move");
  assert.deepEqual(move.waypoints, [{ x: 320, y: 100, elevation: 0, action: "displace", snapped: false, explicit: true, checkpoint: true }]);
  assert.equal(move.options.animate, false);
  assert.ok(F.calls.slice(from).some(c => c.op === "stopAnimation" && c.opts.reset === false), "the tween stops here at once");
  assert.equal(clicks.at(-1).token, t);
});

test("R5-3: a press on a door's icon over a moving token stops the token and never reaches the icon's handler; with none moving there, it does", () => {
  combatFlag = false;
  const DoorControl = F.foundry.canvas.containers.DoorControl;
  const listeners = [];
  const doorsLayer = { addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }), removeEventListener() {} };
  const stageBefore = F.canvas.stage;
  F.canvas.stage = doorsLayer;
  F.fire("canvasReady");
  const capture = listeners.find(l => l.type === "pointerdown" && l.opts?.capture);
  assert.ok(capture, "a capture-phase pointerdown listener on the stage");
  const t = makeToken("doorTok00000001", 400, 100);
  t.document._source = { ...t.document._source, x: 400, y: 600 };
  t.document.x = 430; t.document.y = 300;                        // drawn crossing the door, centre (480, 350)
  t.animationContexts.set(t.movementAnimationName, {});
  t.control = () => { t.controlled = true; };
  const control = new DoorControl();
  const layerBefore = F.canvas.tokens;
  F.canvas.tokens = { ...layerBefore, active: true, placeables: [t] };
  const press = (x, y) => {
    let stopped = false;
    const ev = { button: 0, target: control, getLocalPosition: () => ({ x, y }), stopPropagation: () => { stopped = true; }, nativeEvent: { type: "pointerdown", timeStamp: x } };
    capture.fn(ev);
    if (!stopped) control._onMouseDown(ev);                        // the event reaches the icon's own handler
    return stopped;
  };
  try {
    const n = doors.length;
    const from = F.calls.length;
    assert.equal(press(485, 352), true, "stopped in the capture phase");
    assert.equal(doors.length, n, "the door is not toggled");
    assert.ok(F.calls.slice(from).some(c => c.op === "move" && c.id === t.document.id), "the token is stopped (a displace)");
    assert.equal(t.controlled, true, "and selected");
    t.animationContexts.clear();
    t.document.movement = { state: "completed", user: { isSelf: true } };
    assert.equal(press(485, 352), false, "nothing moving: the press goes on");
    assert.equal(doors.length, n + 1, "core's toggle");
  } finally {
    t.animationContexts.clear();
    F.canvas.tokens = layerBefore;
    F.canvas.stage = stageBefore;
  }
});

test("R7-3: a press on a door's icon right beside a moving token (its centre 50-80 px short) stops the token, not the door", () => {
  combatFlag = false;
  const DoorControl = F.foundry.canvas.containers.DoorControl;
  const listeners = [];
  const stageBefore = F.canvas.stage;
  F.canvas.stage = { addEventListener: (type, fn, opts) => listeners.push({ type, fn, opts }), removeEventListener() {} };
  F.fire("canvasReady");
  const capture = listeners.find(l => l.type === "pointerdown" && l.opts?.capture);
  const t = makeToken("doorNear0000001", 400, 100);
  t.document._source = { ...t.document._source, x: 400, y: 600 };
  t.document.x = 400; t.document.y = 225;                        // drawn centre (450, 275): 75 px short of the door at y 400
  t.animationContexts.set(t.movementAnimationName, {});
  t.control = () => { t.controlled = true; };
  const control = new DoorControl();
  const layerBefore = F.canvas.tokens;
  F.canvas.tokens = { ...layerBefore, active: true, placeables: [t] };
  const press = (x, y) => {
    let stopped = false;
    const ev = { button: 0, target: control, getLocalPosition: () => ({ x, y }), stopPropagation: () => { stopped = true; }, nativeEvent: { type: "pointerdown", timeStamp: y } };
    capture.fn(ev);
    if (!stopped) control._onMouseDown(ev);
    return stopped;
  };
  try {
    const n = doors.length;
    assert.equal(press(450, 350), true, "75 px from its centre: still the token's press");
    assert.equal(doors.length, n, "the door is not toggled");
    t.document.movement = { state: "completed", user: { isSelf: true } };
    t.animationContexts.clear();
    t.animationContexts.set(t.movementAnimationName, {});
    t.document.x = 400; t.document.y = 100;                      // centre (450, 150): 200 px away
    t.document.movement = { state: "pending", user: { isSelf: true } };
    assert.equal(press(450, 350), false, "a token well away from the icon leaves the door to core");
    assert.equal(doors.length, n + 1);
  } finally {
    t.animationContexts.clear();
    F.canvas.tokens = layerBefore;
    F.canvas.stage = stageBefore;
  }
});

test("R4-4: core's own stopAnimation (an unanimated update seen by another client) empties each tween's queued links first", () => {
  assert.equal(Token5e.prototype.stopAnimation.__pentarynMovementDefuse, true, "stopAnimation is wrapped");
  const t = makeToken("dfuA000000000001", 100, 100);
  let resolved = 0;
  const ctx = { chain: [{ resolve: () => { resolved += 1; } }, { resolve: () => { resolved += 1; } }] };
  t.animationContexts.set(t.movementAnimationName, ctx);
  t.stopAnimation({ reset: false });
  assert.equal(ctx.chain.length, 0, "no link left for a terminated tween's last frame to resume");
  assert.equal(resolved, 2, "each link resolved once");
  assert.ok(F.calls.some(c => c.op === "stopAnimation" && c.id === t.document.id && c.opts?.reset === false), "core's stopAnimation still runs");
  // Off the scene again (0.10 L3: a token left drawn walking here is one of this screen's walkers to a later stop).
  t.animationContexts.clear();
  sceneTokens.delete(t.document.id);
});

test("R2-9: another client that receives a stop's displace and still draws the token elsewhere puts it where the server has it", () => {
  combatFlag = false;
  const t = makeToken("rsyA000000000001", 100, 100);
  t.document._source = { ...t.document._source, x: 900, y: 200 };   // the displace landed: the server holds (900, 200)
  t.document.x = 1190; t.document.y = 1600;                         // this client still draws the old tween's last frame
  t.animationContexts.clear();                                      // and no tween runs any more
  const from = F.calls.length;
  F.fire("updateToken", t.document, { x: 900, y: 200 }, { animate: false }, "otherUser0000001");
  mock.timers.tick(0);
  assert.ok(F.calls.slice(from).some(c => c.op === "stopAnimation" && c.id === t.document.id && !c.opts), "reset to the source (a full stopAnimation)");
  // An animated update, or one that moves nothing, is left to core.
  const n = F.calls.length;
  F.fire("updateToken", t.document, { x: 900, y: 200 }, {}, "otherUser0000001");
  F.fire("updateToken", t.document, { name: "x" }, { animate: false }, "otherUser0000001");
  mock.timers.tick(1000);
  assert.equal(F.calls.slice(n).filter(c => c.op === "stopAnimation" && c.id === t.document.id).length, 1, "only the watch's next check (100 ms on)");
});

test("click to stop in combat: the initiator calls stopMovement, another client asks the GM", () => {
  combatFlag = true;
  const t = makeToken("clkB000000000001", 100, 100);
  t.document.movement = { state: "pending", user: { isSelf: true } };
  let from = F.calls.length;
  t._onClickLeft({});
  assert.ok(F.calls.slice(from).some(c => c.op === "stopMovement" && c.id === t.document.id));
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0, "never a displace in combat");
  t.document.movement = { state: "pending", user: { isSelf: false } };
  from = F.calls.length;
  t._onClickLeft({});
  const q = F.calls.slice(from).find(c => c.op === "query");
  assert.equal(q?.name, `${MOD}.stop`);
  assert.equal(F.calls.slice(from).filter(c => c.op === "stopMovement").length, 0);
  combatFlag = false;
});

test("no stop when not moving, on a modifier click, or with the target tool (0.8.0: click to stop is always on)", async () => {
  const t = makeToken("clkC000000000001", 100, 100);
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "stopMovement").length, 0, "not moving");
  t.animationContexts.set(t.movementAnimationName, {});
  t._onClickLeft({ shiftKey: true });
  F.game.activeTool = "target";
  t._onClickLeft({});
  F.game.activeTool = "select";
  assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "stopMovement").length, 0);
  from = F.calls.length;
  const r = await api.stop(t.document);
  assert.deepEqual(r, { ok: true, how: "displace", tokenId: t.document.id });
  t.animationContexts.clear();
  assert.equal((await api.stop(t.document)).code, "NOT_MOVING");
});

test("groupDrags off (tier B): a group drop is core's, followers are pathfound again", async () => {
  await game.settings.set(MOD, "groupDrags", false);
  const ts = [makeToken("offA000000000001", 400, 200), makeToken("offB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  const core = coreDrop(ctx);
  drop.result = core;
  assert.equal(ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } }), core);
  assert.equal(api.status().group.last.reason, "off");
  await game.settings.set(MOD, "groupDrags", true);
});

/* -------------------------------------------- */
/*  UX review fixes (0.4.0 review)              */
/* -------------------------------------------- */

test("a group drag with Ctrl-click waypoints keeps every member's own pathfinding", () => {
  const ts = [makeToken("wptA000000000001", 400, 200), makeToken("wptB000000000001", 300, 200)];
  const contexts = contextsFor(ts, 0, 400);
  for (const c of Object.values(contexts)) c.waypoints = [wp(c.token.document._source.x, 300)];
  layer._draggedToken = ts[0];
  ts[0].mouseInteractionManager = { interactionData: { contexts } };
  try {
    const follower = ts[1].findMovementPath([wp(300, 200), wp(300, 600)], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
    assert.ok(follower.result === undefined || follower.result.length > 1, "searched, not left at the wall");
  } finally {
    layer._draggedToken = null;
  }
});

test("in combat a planned (API) move keeps its own waypoints", () => {
  combatFlag = true;
  const a = makeToken("plnA000000000001", 0, 0);
  const ctx = { [a.document.id]: { token: a, destination: wp(400, 200), foundPath: [wp(0, 0, { explicit: false }), wp(400, 200)], waypoints: [] } };
  drop.result = coreDrop(ctx);
  drop.result[1].movement[a.document.id].planned = true;
  const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  assert.equal(out[1].movement[a.document.id].waypoints.length, 1);
  combatFlag = false;
});

test("a refused or failed stop-in-place puts the token back where the server has it", async () => {
  combatFlag = false;
  for (const outcome of ["refused", "threw"]) {
    const t = makeToken(outcome === "refused" ? "rfsA000000000001" : "rfsB000000000001", 100, 100);
    t.document.x = 320;
    t.animationContexts.set(t.movementAnimationName, {});
    t.document.move = async () => { if (outcome === "threw") throw new Error("nope"); return false; };
    const from = F.calls.length;
    const saved = console.warn;
    console.warn = () => {};
    try {
      t._onClickLeft({});
      await new Promise(r => setImmediate(r));
    } finally { console.warn = saved; }
    const stops = F.calls.slice(from).filter(c => c.op === "stopAnimation" && c.id === t.document.id);
    assert.equal(stops.length, 2, outcome);
    assert.equal(stops[0].opts.reset, false);
    assert.equal(stops[1].opts, undefined, "the second is a full reset to the source");
    t.animationContexts.clear();
  }
});

// Review (correctness lens): pins for the fixes on feat/movement-0.4-review-correctness.

test("a group drag with explicit waypoints is core's drop, so its followers are still pathfound", () => {
  const ts = [makeToken("wpcA000000000001", 400, 200), makeToken("wpcB000000000001", 300, 200)];
  const contexts = contextsFor(ts, 0, 400);
  contexts[ts[0].document.id].waypoints = [wp(400, 300)];
  layer._draggedToken = ts[0];
  ts[0].mouseInteractionManager = { interactionData: { contexts } };
  try {
    const follower = ts[1].findMovementPath([wp(300, 200), wp(300, 600)], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
    assert.deepEqual([follower.result.at(-1).x, follower.result.at(-1).y], [300, 600], "pathfound round the wall, as in 0.3");
  } finally {
    layer._draggedToken = null;
  }
});

test("click to stop out of combat on this client's pending move: stopMovement first, then the displace", () => {
  combatFlag = false;
  const t = makeToken("clkD000000000001", 100, 100);
  t.document.movement = { state: "pending", user: { isSelf: true } };
  t.document.x = 250;
  const from = F.calls.length;
  t._onClickLeft({});
  const ops = F.calls.slice(from).map(c => c.op).filter(o => ["stopMovement", "stopAnimation", "move"].includes(o));
  assert.deepEqual(ops, ["stopMovement", "stopAnimation", "move"]);
});

test("a click within 400 ms of a drop is core's click (habit click, double click); after that it stops that member", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("hbtA000000000001", 400, 200), makeToken("hbtB000000000001", 300, 200)];
  dropWith(ts[0], contextsFor(ts, 0, 400));
  for (const t of ts) t.animationContexts.set(t.movementAnimationName, {});
  let from = F.calls.length;
  ts[0]._onClickLeft({});
  clock.t += 150;
  ts[0]._onClickLeft({});                               // the second press of a double click
  assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "stopMovement").length, 0, "not armed: nothing stopped");
  assert.equal(clicks.at(-1).token, ts[0], "core's click still runs (select, then the sheet)");
  clock.t += MOTION.armMs;
  from = F.calls.length;
  ts[0]._onClickLeft({});
  const moved = F.calls.slice(from).filter(c => c.op === "move").map(c => c.id).sort();
  assert.deepEqual(moved, ts.map(t => t.document.id).sort(), "armed: the whole group stops (decision 3)");
  for (const t of ts) t.animationContexts.clear();
  tickBy(60000);
});

/** This client drops `t` (a drop marks the click's arming start, stop.mjs noteDrop). */
function noteDropOf(t) {
  const saved = t.animationContexts;
  t.animationContexts = new Map();
  try { dropWith(t, contextsFor([t], 100, 0)); } finally { t.animationContexts = saved; }
}

test("AR2-08: a move another client started is armed at once (a player's click on its own token as the GM's group sets off stops it); one this client dropped arms after 400 ms; the API stop is never held back", async () => {
  combatFlag = false;
  clock.step = 0;
  const t = makeToken("hbtC000000000001", 100, 100);
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.movement = { id: "mov0000000000001", chain: [], state: "pending", user: { isSelf: false } };
  F.fire("moveToken", t.document, t.document.movement, {}, { id: "other" });
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 1, "another user's move, just started: stopped");
  // One this client dropped: the click that follows its own drop is core's for 400 ms.
  t.document.movement = { id: "mov0000000000003", chain: [], state: "pending", user: { isSelf: true } };
  noteDropOf(t);
  F.fire("moveToken", t.document, t.document.movement, {}, { id: game.user.id });
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0, "its own drop, just started: not armed");
  clock.t += MOTION.armMs + 50;
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 1, "450 ms into its own move: stopped");
  t.document.movement = { id: "mov0000000000004", chain: [], state: "pending", user: { isSelf: true } };
  noteDropOf(t);
  F.fire("moveToken", t.document, t.document.movement, {}, { id: game.user.id });
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
  const r = await api.stop(t.document);
  assert.equal(r.ok, true);
  t.animationContexts.clear();
});

test("H1-05: in combat a GM's click asks the user who started the move (stopOwn); only that client stops it, only for a GM", async () => {
  combatFlag = true;
  const t = makeToken("gmsA000000000001", 100, 100);
  t.animationContexts.set(t.movementAnimationName, {});
  const asked = [];
  const starter = { id: "player0000000002", isSelf: false, active: true,
    query: async (name, data, opts) => { asked.push({ name, data, opts }); return { ok: true, how: "stop", tokenId: t.document.id }; } };
  t.document.movement = { state: "pending", user: starter };
  const user = game.user;
  const wasGM = user.isGM;
  Object.defineProperty(user, "isGM", { value: true, configurable: true, writable: true });
  try {
    const from = F.calls.length;
    t._onClickLeft({});
    for (let k = 0; k < 5; k++) await Promise.resolve();
    assert.equal(asked.length, 1, "the starter is asked");
    assert.equal(asked[0].name, `${MOD}.stopOwn`);
    assert.deepEqual(asked[0].data, { ref: t.document.uuid });
    assert.equal(asked[0].opts.timeout, 400);
    assert.equal(F.calls.slice(from).filter(c => c.op === "query" && c.name === `${MOD}.stop`).length, 0, "not the active-GM relay");
    assert.equal(F.calls.slice(from).filter(c => c.op === "stopMovement" || c.op === "move").length, 0, "never a stop or displace here");
    // A starter that went offline: nothing is sent to it.
    starter.active = false;
    t._onClickLeft({});
    for (let k = 0; k < 5; k++) await Promise.resolve();
    assert.equal(asked.length, 1);
  } finally {
    Object.defineProperty(user, "isGM", { value: wasGM, configurable: true, writable: true });
  }

  // The starter's side: the handler.
  const handler = CONFIG.queries[`${MOD}.stopOwn`];
  assert.equal(typeof handler, "function");
  t.document.movement = { state: "pending", user: { isSelf: true } };
  const saved = globalThis.fromUuidSync;
  globalThis.fromUuidSync = u => (u === t.document.uuid ? t.document : null);
  try {
    let from = F.calls.length;
    assert.equal((await handler({ ref: t.document.uuid }, { user: { isGM: false } })).code, "NOT_GM");
    assert.equal((await handler({ ref: "Scene.x.Token.nope" }, { user: { isGM: true } })).code, "NOT_FOUND");
    assert.equal(F.calls.slice(from).filter(c => c.op === "stopMovement").length, 0);
    from = F.calls.length;
    const r = await handler({ ref: t.document.uuid }, { user: { isGM: true, id: "gm" } });
    assert.deepEqual(r, { ok: true, how: "stop", tokenId: t.document.id });
    assert.equal(F.calls.slice(from).filter(c => c.op === "stopMovement" && c.id === t.document.id).length, 1);
    t.document.movement = { state: "pending", user: { isSelf: false } };
    assert.equal((await handler({ ref: t.document.uuid }, { user: { isGM: true } })).code, "NOT_INITIATOR");
  } finally {
    globalThis.fromUuidSync = saved;
    combatFlag = false;
    t.animationContexts.clear();
  }
});

// Live round 1 (2026-11-22): D-4 (a stop's terminated tween resumed a link with no context, and the
// player client kept the old tween position) and D-2 (a click on a moving token that core's mouse
// manager dropped never reached the click wrap).

test("D-4: a stop empties the tween's queued links (resolving each) before it terminates the tween", () => {
  combatFlag = false;
  clock.step = 0;
  const t = makeToken("dfsA000000000001", 100, 100);
  t.document.x = 250;
  const resolved = [];
  const ctx = { chain: [{ resolve: () => resolved.push(1) }, { resolve: () => resolved.push(2) }] };
  t.animationContexts.set(t.movementAnimationName, ctx);
  let chainAtStop = null;
  t.stopAnimation = function (opts) { chainAtStop = ctx.chain.length; F.calls.push({ op: "stopAnimation", id: this.document.id, opts }); };
  t._onClickLeft({});
  assert.equal(chainAtStop, 0, "no link left for a stale frame to resume");
  assert.deepEqual(resolved, [1, 2], "every queued link's promise is settled");
  t.animationContexts.clear();
});

test("D-4: once the displace is in, a drawn position off the source is reset to it (now and again later)", async () => {
  combatFlag = false;
  clock.step = 0;
  const t = makeToken("rsyA000000000001", 100, 100);
  t.document.x = 320;
  t.animationContexts.set(t.movementAnimationName, {});
  const stops = [];
  t.stopAnimation = function (opts) { stops.push(opts); if (!opts) { this.document.x = this.document._source.x; this.document.y = this.document._source.y; } };
  // The server applies the displace; a stale tween frame then writes an older position onto the document.
  t.document.move = async wps => {
    t.document._source = { ...t.document._source, x: wps[0].x, y: wps[0].y };
    t.animationContexts.clear();
    t.document.x = 375; t.document.y = 129;
    return true;
  };
  t._onClickLeft({});
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.deepEqual(stops, [{ reset: false }, undefined], "the off-source drawn position is reset to the source");
  assert.equal(t.document.x, 320);
  // A late stale frame: caught by the second check.
  t.document.x = 390;
  mock.timers.tick(300);
  assert.equal(stops.length, 3);
  assert.equal(t.document.x, 320);
  // In step: nothing more.
  mock.timers.tick(300);
  assert.equal(stops.length, 3);
});

test("D-2: a board pointerdown the click wrap did not see stops the moving token drawn under it, and selects it", () => {
  combatFlag = false;
  clock.step = 0;
  const listeners = [];
  const view = { addEventListener: (type, fn) => listeners.push({ type, fn }), removeEventListener: (type, fn) => { const i = listeners.findIndex(l => l.fn === fn); if (i >= 0) listeners.splice(i, 1); } };
  const t = makeToken("brdA000000000001", 100, 100);
  const other = makeToken("brdB000000000001", 600, 600);
  t.document.x = 320; t.document.y = 100;                 // drawn mid-way: centre (370, 150)
  t.animationContexts.set(t.movementAnimationName, {});
  const controlled = [];
  t.control = opts => { controlled.push(opts); return true; };
  const saved = { app: F.canvas.app, coords: F.canvas.canvasCoordinatesFromClient, tokens: F.canvas.tokens };
  F.canvas.app = { view };
  F.canvas.canvasCoordinatesFromClient = p => ({ x: p.x, y: p.y });
  F.canvas.tokens = { ...saved.tokens, active: true, placeables: [other, t] };
  try {
    F.fire("canvasReady");
    const board = listeners.filter(l => l.type === "pointerdown");
    assert.equal(board.length, 1, "one board listener");
    // A click where the token was a frame ago (outside its drawn circle) stops nothing.
    let from = F.calls.length;
    board[0].fn({ type: "pointerdown", button: 0, clientX: 180, clientY: 150, timeStamp: 1 });
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
    // On its drawn circle: displaced where drawn, and selected.
    from = F.calls.length;
    board[0].fn({ type: "pointerdown", button: 0, clientX: 395, clientY: 160, timeStamp: 2 });
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    assert.deepEqual(moves.map(m => [m.id, m.waypoints[0].action]), [["brdA000000000001", "displace"]]);
    const at = moves[0].waypoints[0];
    assert.deepEqual([at.x, at.y], [320, 100], `exactly where it was drawn: ${JSON.stringify(at)}`);
    assert.deepEqual(controlled, [{ releaseOthers: true }]);
    // The same pointerdown already handled by the click wrap is not stopped twice; a right press never.
    t.animationContexts.set(t.movementAnimationName, {});
    const ev = { type: "pointerdown", button: 0, clientX: 370, clientY: 150, timeStamp: 3 };
    from = F.calls.length;
    t._onClickLeft({ nativeEvent: ev });
    board[0].fn(ev);
    board[0].fn({ ...ev, button: 2, timeStamp: 4 });
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 1, "once, by the wrap");
    // A modifier press (shift: add to the selection) is core's.
    from = F.calls.length;
    board[0].fn({ ...ev, shiftKey: true, timeStamp: 5 });
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
    // The listener goes with the module.
    F.fire("canvasReady");
    assert.equal(listeners.filter(l => l.type === "pointerdown").length, 1, "never a second listener on the same board");
  } finally {
    Object.assign(F.canvas, { app: saved.app, canvasCoordinatesFromClient: saved.coords, tokens: saved.tokens });
    t.animationContexts.clear();
    tickBy(1000);
  }
});

test("R3-2: after a stop's displace a movement tween that runs on (no newer movement) is stopped at the source, and a drawn position left off it is reset", () => {
  combatFlag = false;
  const t = makeToken("strA000000000001", 100, 100);
  t.document.movement = { id: "mvStop0000000001", state: "completed", user: { isSelf: true } };
  t.document._source = { ...t.document._source, x: 1800, y: 800 };
  t.document.x = 1800; t.document.y = 800;
  t.animationContexts.clear();
  const stops = [];
  t.stopAnimation = function (opts) {
    stops.push(opts ?? null);
    if (!opts) { this.animationContexts.clear(); this.document.x = this.document._source.x; this.document.y = this.document._source.y; }
  };
  F.fire("updateToken", t.document, { x: 1800, y: 800 }, { animate: false }, "otherUser0000001");
  mock.timers.tick(0);
  assert.deepEqual(stops, [], "in step: nothing to do");
  // 400 ms on, the token walks on through the door with no newer movement (live R3-2).
  for (let i = 0; i < 4; i++) mock.timers.tick(100);
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.x = 1650; t.document.y = 830;
  mock.timers.tick(100);
  assert.deepEqual(stops, [null], "the stray tween is stopped");
  assert.deepEqual([t.document.x, t.document.y], [1800, 800], "drawn where the server has it");
  // A stale frame later, at rest: reset again.
  for (let i = 0; i < 5; i++) mock.timers.tick(100);
  t.document.x = 1200;
  mock.timers.tick(100);
  assert.equal(stops.length, 2);
  assert.equal(t.document.x, 1800);
  // A newer movement is its own: never touched.
  t.document.movement = { id: "mvNewer000000001", state: "completed", user: { isSelf: true } };
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.x = 1500;
  for (let i = 0; i < 10; i++) mock.timers.tick(100);
  assert.equal(stops.length, 2);
  assert.equal(t.document.x, 1500);
  t.animationContexts.clear();
  // And the watch ends: a fresh unanimated move 3 s later is a new watch, the old one is gone.
  t.document.movement = { id: "mvStop0000000002", state: "completed", user: { isSelf: true } };
  t.document.x = 1800;
  F.fire("updateToken", t.document, { x: 1800, y: 800 }, { animate: false }, "otherUser0000001");
  for (let i = 0; i < 35; i++) mock.timers.tick(100);
  t.document.x = 1000;
  for (let i = 0; i < 5; i++) mock.timers.tick(100);
  assert.equal(stops.length, 2, "past the watch window the token is left alone");
});

test("R3-4: a click while a moving token's document was just re-prepared (derived position = its destination) stops it where it is drawn", () => {
  combatFlag = false;
  const t = makeToken("drwA000000000001", 100, 100);
  t.document._source = { ...t.document._source, x: 1800, y: 100 };   // the destination
  t.document.x = 1800; t.document.y = 100;                           // re-prepared: derived = source until the next frame
  t.position = { x: 420, y: 100 };                                   // where the last frame drew it
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  t._onClickLeft({});
  const move = F.calls.slice(from).find(c => c.op === "move");
  const p0 = move.waypoints[0];
  assert.deepEqual([p0.x, p0.y], [420, 100], `not put at its destination: exactly where drawn: ${JSON.stringify(p0)}`);
  t.animationContexts.clear();                                       // stopped: no longer drawn walking
  // Mid-frame (derived ≠ source) the document's own derived position is the drawn one, as before.
  const u = makeToken("drwB000000000001", 100, 100);
  u.document._source = { ...u.document._source, x: 1800, y: 100 };
  u.document.x = 610; u.document.y = 100;
  u.position = { x: 600, y: 100 };
  u.animationContexts.set(u.movementAnimationName, {});
  const n = F.calls.length;
  u._onClickLeft({});
  const p1 = F.calls.slice(n).find(c => c.op === "move").waypoints[0];
  assert.deepEqual([p1.x, p1.y], [610, 100], JSON.stringify(p1));
  t.animationContexts.clear();
  u.animationContexts.clear();
});

/** A token this client is moving: drawn at `drawn` (top-left), its document already at `src`, the route `path` (origin first). */
function walking(id, drawn, src, path, { combat = false, pending = [] } = {}) {
  const t = makeToken(id, src.x, src.y);
  t.document.x = drawn.x; t.document.y = drawn.y;
  t.position = { x: drawn.x, y: drawn.y };
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.movement = {
    state: pending.length ? "pending" : "completed", user: { isSelf: true }, constrainOptions: {},
    origin: wp(path[0].x, path[0].y), passed: { waypoints: path.slice(1).map(p => wp(p.x, p.y, { checkpoint: combat })) },
    pending: { waypoints: pending.map(p => wp(p.x, p.y)) },
  };
  return t;
}
const doorWall = { id: "doorWall00000001", parent: sceneDoc, _source: { c: [400, 400, 500, 400], move: 20, sight: 20, door: 1, ds: 0 } };

/** Let the cut's chained writes run (each awaits the one before it). */
const settleWrites = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

test("R6-3 / R7-1 (0.9.0): a door shut across a move out of combat stops it exactly where it is drawn (an unanimated displace, decision 2), nothing more", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // Two walking south through the door at x 400–500 (y = 400); the documents are already past it.
  const a = walking("cutA000000000001", { x: 400, y: 150 }, { x: 400, y: 700 }, [{ x: 400, y: 100 }, { x: 400, y: 700 }]);
  const b = walking("cutB000000000001", { x: 400, y: 20 }, { x: 400, y: 600 }, [{ x: 400, y: 0 }, { x: 400, y: 600 }]);
  // One already through: it walks on. One at rest, not moving: untouched.
  walking("cutC000000000001", { x: 400, y: 520 }, { x: 400, y: 800 }, [{ x: 400, y: 300 }, { x: 400, y: 800 }]);
  makeToken("cutRest000000001", 600, 100);
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    const first = F.calls.slice(from).filter(c => c.op === "move");
    assert.deepEqual(first.map(m => m.id).sort(), [a.document.id, b.document.id].sort(), "only the two whose route crosses the shut door");
    for (const m of first) {
      // Live R7-1: core chains an animated move after the one being drawn; only an unanimated write stops it.
      assert.equal(m.options?.animate, false, "an unanimated write (stops the drawn tween on every client)");
      assert.equal(m.waypoints.length, 1);
      assert.equal(m.waypoints[0].action, "displace", "to where it is drawn");
      const sa = F.calls.slice(from).findIndex(c => c.op === "stopAnimation" && c.id === m.id && c.opts?.reset === false);
      assert.ok(sa >= 0 && sa < F.calls.slice(from).indexOf(m), "this client stops its own tween before the write");
    }
    assert.equal(first.find(m => m.id === a.document.id).waypoints[0].y, 150);
    assert.equal(first.find(m => m.id === b.document.id).waypoints[0].y, 20);
    await settleWrites();
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 2, "no walk after the stop");
    assert.equal(game.pentaryn.movement.status().group.cut?.members, 2);
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("L3 ruling (simulator seed 6142): a door is not shut while a walker crossing it would have no rest spot clear of every token along its own way: preUpdateWall refuses it, \"Door blocked: <name> is in the doorway\"; room to back off, the drag help off, or a fight: the door shuts", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const savedWalls = sceneDoc._walls;
  // The wall across y = 400 with its door at x 400-500, open (ds 1), as the scene's documents have it.
  sceneDoc.walls = [...world.walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 })), { c: [400, 400, 500, 400], door: 1, ds: 1, move: 20 }];
  const open = { id: "doorWall00000002", parent: sceneDoc, _source: { c: [400, 400, 500, 400], move: 20, sight: 20, door: 1, ds: 1 } };
  // "Jam" walks north through the door, drawn across its line (centre 450, 410); behind it, at rest, "Back" (centre
  // 450, 510) touches it: with the door shut ahead it can neither go on nor back off.
  const w = walking("jamW000000000001", { x: 400, y: 360 }, { x: 400, y: 100 }, [{ x: 400, y: 700 }, { x: 400, y: 100 }]);
  w.document.name = "Jam";
  const back = makeToken("jamBack000000001", 400, 460);
  const from = F.calls.length;
  try {
    const told = await noticesOf(async () => {
      assert.equal(F.fireCall("preUpdateWall", open, { ds: 0 }, {}, "gm"), false, "the shut is refused");
    });
    assert.ok(told.some(m => /Door blocked: Jam is in the doorway/.test(m)), JSON.stringify(told));
    assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "moveTokens").length, 0, "a dry run: nothing written, nothing stopped");
    assert.ok(w.animationContexts.size, "still walking");
    // Locked shut too.
    assert.equal(F.fireCall("preUpdateWall", open, { ds: 2 }, {}, "gm"), false);
    // Opening a shut door, a wall that is no door, or no door state in the change: never refused.
    assert.notEqual(F.fireCall("preUpdateWall", { ...open, _source: { ...open._source, ds: 0 } }, { ds: 1 }, {}, "gm"), false);
    assert.notEqual(F.fireCall("preUpdateWall", open, { sight: 0 }, {}, "gm"), false);
    // The drag help off (the GM's switch): no veto.
    await game.settings.set(MOD, "assist", false);
    try { assert.notEqual(F.fireCall("preUpdateWall", open, { ds: 0 }, {}, "gm"), false, "assist off"); }
    finally { await game.settings.set(MOD, "assist", true); }
    // In a fight: no cut, no veto (every next square is tested against the walls as they are).
    combatFlag = true;
    try { assert.notEqual(F.fireCall("preUpdateWall", open, { ds: 0 }, {}, "gm"), false, "a fight"); }
    finally { combatFlag = false; }
    // Room behind (Back gone): it would back off clear of the door's line, so the door shuts.
    sceneTokens.delete(back.document.id);
    assert.notEqual(F.fireCall("preUpdateWall", open, { ds: 0 }, {}, "gm"), false, "room to back off");
  } finally {
    w.animationContexts.clear();
    sceneDoc._walls = savedWalls;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("H1-02: a cut while the walking document was just re-prepared (derived = its destination) stops the tween where it is drawn, never at the destination", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const a = walking("prepA00000000001", { x: 400, y: 150 }, { x: 400, y: 700 }, [{ x: 400, y: 100 }, { x: 400, y: 700 }]);
  a.document.x = 400; a.document.y = 700;               // re-prepared: derived back on the source, past the door
  const seen = [];
  const own = a.stopAnimation;
  a.stopAnimation = function (opts) { seen.push({ opts, x: this.document.x, y: this.document.y }); return own.call(this, opts); };
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    const stop = seen.find(c => c.opts?.reset === false);
    assert.ok(stop, "the tween is stopped");
    assert.deepEqual([stop.x, stop.y], [400, 150], "core keeps the drawn point (the derived position), not the destination behind the door");
    await settleWrites();
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R6-3: a new wall raised across a route cuts it too; a wall that crosses no route, or an opened door, cuts nothing", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const a = walking("cutD000000000001", { x: 20, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", { ...doorWall, _source: { ...doorWall._source, ds: 1 } }, { ds: 1 }, {}, "gm");
    F.fire("createWall", { id: "farWall000000001", parent: sceneDoc, _source: { c: [700, 500, 700, 800], move: 20 } }, {}, "gm");
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
    world.walls.push([{ x: 600, y: 0 }, { x: 600, y: 300 }]);
    try {
      F.fire("createWall", { id: "newWall000000001", parent: sceneDoc, _source: { c: [600, 0, 600, 300], move: 20 } }, {}, "gm");
      await settleWrites();
    } finally { world.walls.pop(); }
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    assert.equal(moves.length, 1, "a displace where it is drawn (0.9.0: no walk on)");
    assert.equal(moves[0].id, a.document.id);
    assert.equal(moves[0].options?.animate, false);
    assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [20, 100], "where it is drawn, before the new wall");
  } finally {
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

/** Where each of `ids` rests after the moves since `from` (the last waypoint of its last move). */
function restsAfter(from, ids) {
  const out = {};
  for (const c of F.calls.slice(from)) if (c.op === "move" && ids.includes(c.id)) out[c.id] = c.waypoints.at(-1);
  return out;
}

test("0.9.0 simulator (step 5): two walkers a wall cuts while they brush do not stop inside each other; the later one walks on to the first spot clear of the first (0.10 L3: the front one first, the one behind back along its way)", async () => {
  // The simulator's class (seeds 2, 60, 277 …): two members brushing (soft) were stopped where drawn, and rested
  // inside each other for good (hard).
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const a = walking("brsA000000000001", { x: 300, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  const b = walking("brsB000000000001", { x: 340, y: 100 }, { x: 900, y: 200 }, [{ x: 100, y: 100 }, { x: 600, y: 100 }, { x: 900, y: 200 }]);
  const from = F.calls.length;
  world.walls.push([{ x: 700, y: 0 }, { x: 700, y: 300 }]);
  try {
    F.fire("createWall", { id: "brsWall000000001", parent: sceneDoc, _source: { c: [700, 0, 700, 300], move: 20 } }, {}, "gm");
    await settleWrites();
    const rest = restsAfter(from, [a.document.id, b.document.id]);
    const pa = rest[a.document.id], pb = rest[b.document.id];
    assert.ok(pa && pb, JSON.stringify(rest));
    assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= S - 1, `rest apart: ${JSON.stringify(rest)}`);
    // b is in front (a walks into it): b exactly where it is drawn, a back along the way it came.
    assert.deepEqual([pb.x, pb.y], [340, 100], "the front one exactly where it is drawn");
    assert.ok(pa.y === 100 && Math.abs(pa.x - 300) <= 1.5 * S && pa.x !== 300, `the one behind carried along its own route (on past b, at most 1.5 squares): ${JSON.stringify(pa)}`);
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L3 (simulator: a file cut by a door): one stop of a packed file settles the front one first, so the ones behind are carried back along their ways and none rests inside another", async () => {
  // The simulator's class (seeds 1569, 1832 …): a file walking drawn overlapping (soft) was stopped back to front; the
  // front one found the one behind it carried on into its way, and a token at rest ahead, and rested inside it.
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const path = [{ x: 0, y: 100 }, { x: 900, y: 100 }];
  const back = walking("fileB00000000001", { x: 220, y: 100 }, { x: 900, y: 100 }, path);
  const mid = walking("fileM00000000001", { x: 280, y: 100 }, { x: 900, y: 100 }, path);
  const front = walking("fileF00000000001", { x: 340, y: 100 }, { x: 900, y: 100 }, path);
  const stand = makeToken("fileS00000000001", 450, 100);
  const from = F.calls.length;
  world.walls.push([{ x: 600, y: 0 }, { x: 600, y: 300 }]);
  try {
    F.fire("createWall", { id: "fileWall00000001", parent: sceneDoc, _source: { c: [600, 0, 600, 300], move: 20 } }, {}, "gm");
    await settleWrites();
    const ids = [back, mid, front].map(t => t.document.id);
    const rest = restsAfter(from, ids);
    for (const id of ids) assert.ok(rest[id], `${id} stopped: ${JSON.stringify(rest)}`);
    const all = [...ids.map(id => rest[id]), { x: 450, y: 100 }];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= S - 1, `rest apart: ${JSON.stringify(rest)}`);
    }
    assert.deepEqual([rest[front.document.id].x, rest[front.document.id].y], [340, 100], "the front one exactly where it is drawn");
    assert.ok(rest[mid.document.id].x < 280 && rest[back.document.id].x < 220, `the ones behind back along their way: ${JSON.stringify(rest)}`);
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
    void stand;
  }
});

test("0.10 L3 fix round (simulator seed 9191): one stop of several tokens writes them in one update (Scene#moveTokens), each carried one's spot named by id", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const path = [{ x: 0, y: 100 }, { x: 900, y: 100 }];
  const back = walking("batB00000000001A", { x: 220, y: 100 }, { x: 900, y: 100 }, path);
  const mid = walking("batM00000000001A", { x: 280, y: 100 }, { x: 900, y: 100 }, path);
  const front = walking("batF00000000001A", { x: 340, y: 100 }, { x: 900, y: 100 }, path);
  const from = F.calls.length;
  world.walls.push([{ x: 600, y: 0 }, { x: 600, y: 300 }]);
  try {
    F.fire("createWall", { id: "batWall000000001", parent: sceneDoc, _source: { c: [600, 0, 600, 300], move: 20 } }, {}, "gm");
    const batches = F.calls.slice(from).filter(c => c.op === "moveTokens");
    assert.equal(batches.length, 1, "one update");
    const ids = [back, mid, front].map(t => t.document.id);
    assert.deepEqual([...batches[0].ids].sort(), [...ids].sort());
    assert.equal(batches[0].options.animate, false);
    assert.equal(batches[0].options.pentarynMovementStop, true);
    const at = batches[0].options.pentarynMovementStopAt ?? {};
    assert.equal(at[front.document.id] ?? null, null, "the front one rests where it is drawn");
    assert.ok(at[mid.document.id] && at[back.document.id], `the ones carried back are named: ${JSON.stringify(at)}`);
    await settleWrites();
    const rest = restsAfter(from, ids);
    assert.deepEqual(rest[mid.document.id], { ...rest[mid.document.id], x: at[mid.document.id].x, y: at[mid.document.id].y }, "named where it then rests");
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L3 (simulator seeds 2596, 6212 …): a stop also stops this screen's own walkers whose way comes into a spot it rests a token on; their destinations are no rest of the stop's", async () => {
  // The leader cut by a door rested inside the spot a mate was still walking to, with nowhere along its way (a token
  // standing behind it): named, and the mate walked on onto it.
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const lead = walking("alsoL00000000001", { x: 450, y: 100 }, { x: 700, y: 100 }, [{ x: 100, y: 100 }, { x: 700, y: 100 }]);
  const mate = walking("alsoM00000000001", { x: 450, y: 300 }, { x: 450, y: 100 }, [{ x: 450, y: 400 }, { x: 450, y: 100 }]);
  const stand = makeToken("alsoS00000000001", 350, 100);
  const from = F.calls.length;
  world.walls.push([{ x: 600, y: 0 }, { x: 600, y: 300 }]);
  try {
    F.fire("createWall", { id: "alsoWall00000001", parent: sceneDoc, _source: { c: [600, 0, 600, 300], move: 20 } }, {}, "gm");
    await settleWrites();
    const rest = restsAfter(from, [lead.document.id, mate.document.id]);
    assert.deepEqual([rest[lead.document.id]?.x, rest[lead.document.id]?.y], [450, 100], `the leader where it is drawn: ${JSON.stringify(rest)}`);
    const m = rest[mate.document.id];
    assert.ok(m, `the mate walking into it is stopped by the same stop: ${JSON.stringify(rest)}`);
    assert.ok(Math.hypot(m.x - 450, m.y - 100) >= S - 1, `apart: ${JSON.stringify(rest)}`);
    void stand;
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L3 (simulator seeds 9124, 6452 …): a member of a stop with no spot along its own way, inside only a member the same stop rested, rests where it is drawn when that one can be carried on along its own way", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const path = [{ x: 0, y: 100 }, { x: 900, y: 100 }];
  const behind = walking("roomX00000000001", { x: 240, y: 100 }, { x: 900, y: 100 }, path);
  const front = walking("roomY00000000001", { x: 300, y: 100 }, { x: 900, y: 100 }, path);
  const stand = makeToken("roomS00000000001", 125, 100);          // the way back is shut by a token at rest
  const from = F.calls.length;
  world.walls.push([{ x: 700, y: 0 }, { x: 700, y: 300 }]);
  try {
    F.fire("createWall", { id: "roomWall00000001", parent: sceneDoc, _source: { c: [700, 0, 700, 300], move: 20 } }, {}, "gm");
    await settleWrites();
    await flush();
    const rest = restsAfter(from, [behind.document.id, front.document.id]);
    const bx = rest[behind.document.id], fy = rest[front.document.id];
    assert.ok(bx && fy, JSON.stringify(rest));
    assert.deepEqual([bx.x, bx.y], [240, 100], `the one behind where it is drawn: ${JSON.stringify(rest)}`);
    assert.ok(fy.x > 300 && fy.x <= 300 + 1.5 * S && fy.y === 100, `the one in front carried on along its way: ${JSON.stringify(rest)}`);
    assert.ok(Math.hypot(bx.x - fy.x, bx.y - fy.y) >= S - 1, `apart: ${JSON.stringify(rest)}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "notify" && /Stopped on another token/.test(c.message)), "nobody named on another token");
    void stand;
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L3 fix round (simulator seeds 6572, 9631, 1569): a stop's tokens are settled together: no walk on passes a token the same stop rests on its way, and none rests inside another", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // x walks east, drawn inside s (at rest), with s2 shutting its way ahead; w, another walker of this screen, comes
  // west toward x's way back. Stopped one by one, x is carried back past w (clear of where w is drawn) and w, heading
  // into x's spot, is stopped where it is drawn: x's walk on would pass through w at rest.
  const x = walking("setX00000000001A", { x: 400, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  const w = walking("setW00000000001A", { x: 280, y: 100 }, { x: 0, y: 100 }, [{ x: 900, y: 100 }, { x: 0, y: 100 }]);
  makeToken("setS00000000001A", 430, 100);
  makeToken("setT00000000001A", 560, 100);
  const from = F.calls.length;
  try {
    x._onClickLeft({});
    await flush();
    const rest = restsAfter(from, [x.document.id, w.document.id]);
    const px = rest[x.document.id], pw = rest[w.document.id];
    assert.ok(px && pw, `both stopped: ${JSON.stringify(rest)}`);
    assert.ok(Math.hypot(px.x - pw.x, px.y - pw.y) >= S - 1, `apart: ${JSON.stringify(rest)}`);
    for (const [p, o] of [[px, { x: 430, y: 100 }], [pw, { x: 430, y: 100 }], [px, { x: 560, y: 100 }]]) assert.ok(Math.hypot(p.x - o.x, p.y - o.y) >= S - 1, `clear of those at rest: ${JSON.stringify(rest)}`);
    // x's walk on (400 → px along y 100) never passes w where it rests.
    const lo = Math.min(400, px.x), hi = Math.max(400, px.x);
    assert.ok(pw.x + S - 1 <= lo || pw.x - S + 1 >= hi, `x's walk on passes w at rest: ${JSON.stringify(rest)}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "notify" && /Stopped on another token/.test(c.message)), "nobody named on another token");
  } finally {
    x.animationContexts.clear(); w.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.9.0 simulator (step 5): a click that would leave a token resting inside one at rest carries it on along its route to the first clear spot", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const t = walking("brsC000000000001", { x: 330, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  makeToken("brsR000000000001", 260, 100);               // came to rest there meanwhile (another user's stop)
  const from = F.calls.length;
  try {
    t._onClickLeft({});
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [330, 100], "first exactly where it is drawn");
    const end = moves.at(-1).waypoints.at(-1);
    assert.ok(end.x >= 360 - 1 && end.x <= 380 && end.y === 100, `then just clear of the one at rest, ahead: ${JSON.stringify(end)}`);
  } finally {
    t.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.9.0 simulator (step 5): a stop carried clear of a token at rest walks on past a mate still walking where it would rest (never gives up into the overlap)", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const t = walking("brsE000000000001", { x: 330, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  makeToken("brsS000000000001", 260, 100);                                          // at rest
  walking("brsW000000000001", { x: 370, y: 100 }, { x: 900, y: 300 }, [{ x: 300, y: 100 }, { x: 900, y: 300 }]); // drawn just ahead, walking
  const from = F.calls.length;
  try {
    t._onClickLeft({});
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    const end = moves.at(-1).waypoints.at(-1);
    assert.ok(end.x >= 469 && end.x <= 330 + 1.5 * S && end.y === 100, `past the walker too, ahead: ${JSON.stringify(end)}`);
  } finally {
    t.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L2 fix (a): a token drawn inside one at rest with no clear spot along its own way stays where it is drawn, named (the straight-line last resort is gone)", async () => {
  // Seeds 583 / 1740 (0.9): a stop's own short walk on was cut by a door shut across it, inside the token it was
  // leaving. 0.9 then walked a straight line to the nearest clear spot (through whatever stood between); now it stays.
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const t = walking("brsF000000000001", { x: 330, y: 100 }, { x: 340, y: 100 }, [{ x: 320, y: 100 }, { x: 340, y: 100 }]);
  makeToken("brsT000000000001", 300, 100);
  const from = F.calls.length;
  try {
    const r = await api.stop(t.document);
    assert.equal(r.ok, true, JSON.stringify(r));
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.equal(moves.length, 1, `one write, where it is drawn (no walk on): ${JSON.stringify(moves.map(m => m.waypoints))}`);
    assert.deepEqual([moves[0].waypoints.at(-1).x, moves[0].waypoints.at(-1).y], [330, 100]);
    const told = api.status().group.told[0];
    assert.equal(told?.reason, "stopInside", JSON.stringify(api.status().group.told));
    assert.match(told.text, /brsF000000000001/);
  } finally {
    t.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.9.0 simulator (step 5, seed 6156) / 0.10 L2 fix (a): a stop never walks on through another token at rest on its way; a click with no clear spot along its way leaves it walking on to its own square, named (no overlap at rest, R8)", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // Drawn inside A (at rest, ahead: no clear spot within 1.5 squares); back the way it came stands B at rest.
  const t = walking("brsG000000000001", { x: 330, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  makeToken("brsA000000000001", 400, 100);
  makeToken("brsB000000000001", 225, 100);
  const from = F.calls.length;
  try {
    const r = await api.stop(t.document);
    assert.equal(r.ok, true, JSON.stringify(r));
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.deepEqual(moves, [], "no write: no straight line off its way, no rest inside A, never on through B");
    assert.ok(!F.calls.slice(from).some(c => c.op === "stopMovement" && c.id === t.document.id), "its own move goes on to its square (900, 100)");
    assert.equal(api.status().group.told[0]?.reason, "walkedOn");
    assert.equal(api.status().stop.last.walkedOn, 1);
  } finally {
    t.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L2 fix (a): a wall cut that leaves a token inside one at rest with no clear spot along its way stops it where it is drawn, named (it cannot walk on)", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const t = walking("brsH000000000001", { x: 330, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  makeToken("brsI000000000001", 400, 100);
  makeToken("brsJ000000000001", 225, 100);
  world.walls.push([{ x: 600, y: 0 }, { x: 600, y: 300 }]);
  const from = F.calls.length;
  try {
    F.fire("createWall", { id: "brsWall000000002", parent: sceneDoc, _source: { c: [600, 0, 600, 300], move: 20 } }, {}, "gm");
    await settleWrites();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.equal(moves.length, 1, JSON.stringify(moves.map(m => m.waypoints)));
    assert.deepEqual([moves[0].waypoints.at(-1).x, moves[0].waypoints.at(-1).y], [330, 100], "where it is drawn");
    assert.equal(api.status().group.told[0]?.reason, "stopInside");
  } finally {
    world.walls.pop();
    t.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.10 L2 (R6, R7): the leader stopped while it walks through its own members carries on along its way to the first free spot, however far", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // The leader drawn inside the first of three members standing in a row ahead of it (a file it walks through).
  const t = walking("ldrL000000000001", { x: 230, y: 100 }, { x: 900, y: 100 }, [{ x: 0, y: 100 }, { x: 900, y: 100 }]);
  const ms = [[1, 200], [2, 300], [3, 400]].map(([k, x]) => makeToken(`ldrM${k}00000000001`, x, 100));
  makeToken("ldrB000000000001", 100, 100);                 // and one behind it, at rest where it came from
  // Another user's group drag: every client learns its members from the moves' option, and its leader from its own.
  for (const m of ms) F.Hooks.callAll("updateToken", m.document, {}, { pentarynMovementGroup: "gLDR" }, "otherUser000001");
  F.Hooks.callAll("updateToken", t.document, { x: 900 }, { pentarynMovementLead: t.document.id, pentarynMovementGroup: "gLDR" }, "otherUser000001");
  const from = F.calls.length;
  try {
    assert.ok(api.status().group.leading.includes(t.document.id), "it leads");
    const r = await api.stop(t.document);
    assert.equal(r.ok, true, JSON.stringify(r));
    await flush();
    const end = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id).at(-1).waypoints.at(-1);
    assert.ok(end.y === 100 && end.x >= 500 - 1 && end.x <= 520, `on past its members to the first free spot: ${JSON.stringify(end)}`);
  } finally {
    t.animationContexts.clear();
    tickBy(1000);
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("H2-07 / H2-09: a single drag out of combat goes round a standing token, and dropped on one takes the nearest clear spot", () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("sngA000000000001", 100, 100);
  const rest = makeToken("sngR000000000001", 300, 100);
  rest.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, rest];
  const segOff = (c, p, q) => {
    const L2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - p.x) * (q.x - p.x) + (c.y - p.y) * (q.y - p.y)) / L2, 0), 1) : 0;
    return Math.hypot(c.x - (p.x + (q.x - p.x) * t), c.y - (p.y + (q.y - p.y) * t));
  };
  try {
    // Straight east through the one standing at (300, 100).
    let ctx = contextsFor([a], 400, 0);
    drop.result = coreDrop(ctx);
    let out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    let wps = out[1].movement[a.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [500, 100], "it still ends where it was dropped");
    let prev = { x: 150, y: 150 };
    for (const p of wps) { const q = { x: p.x + 50, y: p.y + 50 }; assert.ok(segOff({ x: 350, y: 150 }, prev, q) >= 98, `round it: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`); prev = q; }
    // Dropped on it.
    ctx = contextsFor([a], 200, 0);
    drop.result = coreDrop(ctx);
    out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    wps = out[1].movement[a.document.id].waypoints;
    const end = wps.at(-1);
    assert.ok(Math.hypot(end.x - 300, end.y - 100) >= 99, `not on top of it: ${JSON.stringify(end)}`);
    assert.ok(Math.hypot(end.x - 300, end.y - 100) <= 150, `beside it: ${JSON.stringify(end)}`);
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(rest.document.id); sceneTokens.delete(a.document.id);
    tickBy(60000);
  }
});

test("S1R1-04: a single drag in a fight goes round a token standing in its way too, square by square, and ends where it was dropped", () => {
  combatFlag = true;
  clock.step = 0;
  const a = makeToken("s4cA000000000001", 100, 100);
  const rest = makeToken("s4cR000000000001", 300, 100);
  rest.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, rest];
  try {
    // Straight east through the one standing at (300, 100): dnd5e lets an ally pass, Joe's rule does not.
    const ctx = contextsFor([a], 400, 0);
    drop.result = coreDrop(ctx);
    const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    const wps = out[1].movement[a.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [500, 100], "it still ends where it was dropped");
    let prev = { x: 150, y: 150 };
    for (const p of wps) {
      const q = { x: p.x + 50, y: p.y + 50 };
      assert.ok(p.x % 100 === 0 && p.y % 100 === 0, `whole squares: ${JSON.stringify(p)}`);
      assert.ok(Math.max(Math.abs(q.x - prev.x), Math.abs(q.y - prev.y)) <= 100, `a square at a time: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
      assert.ok(Math.hypot(q.x - 350, q.y - 150) >= 99, `never on it: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
      prev = q;
    }
  } finally {
    combatFlag = false;
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(rest.document.id); sceneTokens.delete(a.document.id);
    tickBy(60000);
  }
});

test("H2-12: a single drop whose drag path fell short only because its search was still running goes the confirmed route, with no warning", () => {
  combatFlag = false;
  clock.step = 0;
  const one = makeToken("cnfA000000000001", 100, 200);
  const c1 = contextsFor([one], 300, 400);            // through the door at x 400-500
  // The drag's path as it stood at the drop: core's line, cut at the wall.
  c1[one.document.id].foundPath = [wp(100, 200, { snapped: false, explicit: false, checkpoint: false }), wp(250, 300)];
  const from = F.calls.length;
  const out = dropWith(one, c1);
  assert.ok(!F.calls.slice(from).some(c => c.op === "notify"), "no false warning");
  const wps = out[1].movement[one.document.id].waypoints;
  assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [400, 600], "it goes all the way");
  assert.ok(wps.length >= 2, "round the wall");
  tickBy(60000);
});

test("0.10 live R1 (S05.a): a quick single drop whose drag had found nothing yet (its path the start alone, core's update empty) goes the confirmed route, not a silent no-op", () => {
  combatFlag = false;
  clock.step = 0;
  const one = makeToken("cnfQ000000000001", 100, 200);
  const others = keepOnly([one]);
  try {
    const c1 = contextsFor([one], 300, 400);            // through the door at x 400-500
    // Core's drag context while its search runs (and for its 500 ms search animation): the start alone.
    c1[one.document.id].foundPath = [wp(100, 200, { snapped: false, explicit: false, checkpoint: false })];
    const from = F.calls.length;
    const out = dropWith(one, c1);
    assert.ok(!F.calls.slice(from).some(c => c.op === "notify"), "no warning");
    assert.notEqual(api.status().group.last.reason, "still", JSON.stringify(api.status().group.last));
    assert.ok(Array.isArray(out), "core's update, filled in");
    assert.deepEqual(out[0].map(u => u._id), [one.document.id]);
    const wps = out[1].movement[one.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [400, 600], `all the way: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
  } finally {
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.10 live R1 (S05.d/g/h): the same quick drop in a fight goes the confirmed route, a checkpoint at every square, charged core's measure", () => {
  combatFlag = true;
  clock.step = 0;
  const one = makeToken("cnfR000000000001", 100, 200);
  noSpeed(one);
  const others = keepOnly([one]);
  try {
    const c1 = contextsFor([one], 300, 400);
    c1[one.document.id].foundPath = [wp(100, 200, { snapped: false, explicit: false, checkpoint: false })];
    const out = dropWith(one, c1);
    assert.notEqual(api.status().group.last.reason, "still", JSON.stringify(api.status().group.last));
    assert.ok(Array.isArray(out), "core's update, filled in");
    const wps = out[1].movement[one.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [400, 600], `all the way: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
    const path = [one.document._source, ...wps];
    for (let k = 1; k < path.length; k++) {
      assert.equal(path[k].checkpoint, true, "a checkpoint every square");
      assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, "never through a wall");
    }
  } finally {
    combatFlag = false;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("decision 8: a 2x2 with no way its body fits stops before the gap and the dragger is warned", () => {
  combatFlag = false;
  clock.step = 0;
  const big = makeToken("nrwL000000000001", 350, 100, { size: 2 });
  const c1 = {};
  const origin = wp(350, 100, { width: 2, height: 2, snapped: false, explicit: false, checkpoint: false });
  const dest = wp(350, 600, { width: 2, height: 2 });
  c1[big.document.id] = { token: big, destination: dest, foundPath: [origin, wp(350, 150, { width: 2, height: 2 })], waypoints: [] };
  const from = F.calls.length;
  const out = dropWith(big, c1);
  assert.ok(out, "it still moves up to the gap");
  assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn" && /stoppedShort/.test(c.message)), JSON.stringify(F.calls.slice(from).filter(c => c.op === "notify")));
  // H4-01 (live H7c, the first drag after a reset: "5 ft", one square): the drag's search had not finished, its
  // path one square long; the drop walks as far as the body fits along the found way, as the finished drag shows.
  const wps = out[1].movement[big.document.id].waypoints;
  // S1R2-03: and at rest on whole squares (it started half a square off the grid), its body before the door's line.
  const end = wps.at(-1);
  assert.ok(end.y >= 200, `as far as it fits, not the drag's one square: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
  assert.ok(end.x % 100 === 0 && end.y % 100 === 0, `whole squares: ${JSON.stringify(end)}`);
  assert.ok(end.y + 200 <= 400, `its body before the door's line (y 400): ${JSON.stringify(end)}`);
  sceneTokens.delete(big.document.id);
});

test("the GM's drag-help switch (assist) off: every drag is core's (pathfinding off, no group plan), whatever the two settings say", async () => {
  combatFlag = false;
  await game.settings.set(MOD, "assist", false);
  try {
    assert.equal(api.status().group.enabled, false);
    const ts = [makeToken("asfA000000000001", 400, 200), makeToken("asfB000000000001", 300, 200)];
    const ctx = contextsFor(ts, 0, 400);
    const core = coreDrop(ctx);
    const out = dropWith(ts[0], ctx);
    assert.equal(api.status().group.last.mode, "core");
    assert.equal(api.status().group.last.reason, "off");
    assert.deepEqual(out[1].movement, core[1].movement, "core's own moves");
    const one = makeToken("asfC000000000001", 100, 200);
    const job = one.findMovementPath([wp(100, 200, { snapped: false, explicit: false, checkpoint: false }), wp(400, 600)], { preview: true, constrainOptions: {} });
    const path = job.result ?? await job.promise;
    assert.ok(path.length <= 2, `no route round the wall: ${JSON.stringify(path)}`);
  } finally {
    await game.settings.set(MOD, "assist", true);
    tickBy(60000);
  }
});

test("H3-04: a single drop released while its route search is still running takes the route once the search finishes (no lost drop)", async () => {
  combatFlag = false;
  const one = makeToken("lngA000000000001", 100, 200);
  const others = keepOnly([one]);
  try {
    const c1 = contextsFor([one], 300, 400);            // through the door at x 400-500
    // The drag's search had found nothing yet: its path is the start alone, and core's update goes nowhere.
    c1[one.document.id].foundPath = [wp(100, 200, { snapped: false, explicit: false, checkpoint: false })];
    const from = F.calls.length;
    clock.step = 300;                                   // a slow search: the drop's one short search runs out too
    const out = dropWith(one, c1);
    clock.step = 0;
    assert.equal(out, null, "nothing goes out at the drop");
    for (let k = 0; k < 6; k++) { mock.timers.tick(10); for (let i = 0; i < 10; i++) await Promise.resolve(); }
    const ups = sent(from).filter(c => c.ids.includes(one.document.id));
    assert.equal(ups.length, 1, "the move goes out once the search is done");
    const wps = ups[0].options.movement[one.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [400, 600], `all the way: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "notify"), "no warning");
  } finally {
    clock.step = 0;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("H3-04: the same drop where the finished search finds no way there: nothing moves and the dragger is warned (decision 7)", async () => {
  combatFlag = false;
  const one = makeToken("lngB000000000001", 100, 200);
  const others = keepOnly([one]);
  const saved = world.walls;
  world.walls = [[{ x: 0, y: 400 }, { x: 1000, y: 400 }]];   // the door is shut: no way south
  F.fire("updateWall");
  try {
    const c1 = contextsFor([one], 300, 400);
    c1[one.document.id].foundPath = [wp(100, 200, { snapped: false, explicit: false, checkpoint: false })];
    const from = F.calls.length;
    clock.step = 300;
    const out = dropWith(one, c1);
    clock.step = 0;
    assert.equal(out, null);
    for (let k = 0; k < 6; k++) { mock.timers.tick(10); for (let i = 0; i < 10; i++) await Promise.resolve(); }
    assert.equal(sent(from).length, 0, "nothing moves");
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn"), "the dragger is told");
    assert.equal(api.status().group.last.reason, "noRoute");
  } finally {
    clock.step = 0;
    world.walls = saved;
    F.fire("updateWall");
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("H3-13: a single drop whose drag destination lags the pointer lands where the pointer came up", () => {
  combatFlag = false;
  clock.step = 0;
  const one = makeToken("lagA000000000001", 100, 100);
  const others = keepOnly([one]);
  const proto = Token5e.prototype;
  const saved = [proto._getDragOrigin, proto._getDragWaypointPosition];
  proto._getDragOrigin = function () { return center(this.document._source); };
  proto._getDragWaypointPosition = function (cur, p, { snap }) { return { ...cur, x: snap ? Math.round(p.x / S) * S : p.x, y: snap ? Math.round(p.y / S) * S : p.y }; };
  try {
    const ctx = contextsFor([one], 0, 100);                  // core's destination: one square down
    const up = { x: 150, y: 450 };                          // the pointer came up three squares down
    drop.result = coreDrop(ctx);
    const out = one._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx, destination: { ...up } }, shiftKey: false });
    const wps = out[1].movement[one.document.id].waypoints;
    assert.deepEqual([wps.at(-1).x, wps.at(-1).y], [100, 400], `where the pointer came up: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
  } finally {
    [proto._getDragOrigin, proto._getDragWaypointPosition] = saved;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/** A corridor stop (S3R1-03 / S3R2-01 / S3R2-04): `a` ours in the corridor at (ax, 400), `b` walking east up it behind. */
async function corridorStop(tag, { partial = true, deadEnd = false, ax = 500 } = {}) {
  combatFlag = false;
  clock.step = 0;
  const saved = world.walls;
  world.walls = [[{ x: 300, y: 400 }, { x: 800, y: 400 }], [{ x: 300, y: 500 }, { x: 800, y: 500 }]];
  if (deadEnd) world.walls.push([{ x: 800, y: 400 }, { x: 800, y: 500 }]);
  F.fire("updateWall");
  const a = makeToken(`${tag}A000000000001`, ax, 400), b = makeToken(`${tag}B000000000001`, 100, 400);
  const others = keepOnly([a, b]);
  const from = F.calls.length;
  try {
    for (const t of [a, b]) F.fire("updateToken", t.document, { x: 900 }, { pentarynMovementGroup: `grp${tag}0000000001`.slice(0, 16) }, "u2");
    if (partial) b.document.testUserPermission = () => false;
    for (const t of [a, b]) { t.animationContexts.set(t.movementAnimationName, {}); t.document.movement = { state: "pending", user: { isSelf: false } }; }
    a.document._source.x = 900; a.document._source.y = 400;
    // b walks east up the corridor behind it, to (900, 400).
    b.document._source.x = 900;
    b.document.movement = { state: "pending", user: { isSelf: false }, origin: wp(100, 400), passed: { waypoints: [wp(900, 400)] }, pending: { waypoints: [] } };
    clock.t += MOTION.armMs;
    const placed = F.canvas.tokens.placeables;
    F.canvas.tokens.placeables = [a, b];
    a._onClickLeft({});
    F.canvas.tokens.placeables = placed;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    return {
      mv: F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id),
      last: game.pentaryn.movement.status().stop.last,
    };
  } finally {
    for (const t of [a, b]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    world.walls = saved;
    F.fire("updateWall");
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
}

/** Centre path (pixels) of a member's waypoints from its start never comes within `reach` px of `c`. */
function clearOf(start, wps, c, reach) {
  let prev = center(start);
  for (const p of wps) {
    const q = center(p);
    const L2 = (q.x - prev.x) ** 2 + (q.y - prev.y) ** 2;
    const t = L2 ? Math.min(Math.max(((c.x - prev.x) * (q.x - prev.x) + (c.y - prev.y) * (q.y - prev.y)) / L2, 0), 1) : 0;
    if (Math.hypot(c.x - (prev.x + (q.x - prev.x) * t), c.y - (prev.y + (q.y - prev.y) * t)) < reach) return false;
    prev = q;
  }
  return true;
}

test("0.5.0: a single drag whose only way runs through a token standing in the door stops before it, and the dragger is told", () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("hrdS000000000001", 400, 100);
  const door = makeToken("hrdD000000000001", 400, 400);              // standing just past the one-square door
  door.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, door];
  try {
    const ctx = contextsFor([a], 0, 500);
    drop.result = coreDrop(ctx);
    const from = F.calls.length;
    const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    const wps = out[1].movement[a.document.id].waypoints;
    assert.ok(clearOf(a.document._source, wps, center(door.document._source), S - 1), `never through it: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
    assert.ok(center(wps.at(-1)).y < 400, `it stops before the door: ${JSON.stringify(wps.at(-1))}`);
    assert.equal(wps.at(-1).explicit, true);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.stoppedShort"), "told");
    assert.equal(api.status().group.last.result, "short");
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(door.document.id); sceneTokens.delete(a.document.id);
    tickBy(60000);
  }
});

/** The cost core measures for `wps` walked from `origin` (the synthetic measure: squares x 5). */
const costOf = (t, origin, wps) => t.measureMovementPath([origin, ...wps]).cost;

for (const fight of [true, false]) {
  test(`S1R2-01: a single drag ${fight ? "in a fight" : "out of combat"}: the ruler while dragging shows the way round the tokens standing in it, and the drop walks that way at that cost`, () => {
    combatFlag = fight;
    clock.step = 0;
    const a = makeToken(`s21${fight ? "c" : "o"}A00000000001`, 100, 100);
    const rest = makeToken(`s21${fight ? "c" : "o"}R00000000001`, 300, 100);
    rest.visible = true;
    const saved = F.canvas.tokens.placeables;
    F.canvas.tokens.placeables = [a, rest];
    const origin = wp(100, 100, { snapped: false, explicit: false, checkpoint: false });
    const dest = wp(500, 100);
    const contexts = { [a.document.id]: { token: a, destination: dest, foundPath: null, waypoints: [] } };
    layer._draggedToken = a;
    a.mouseInteractionManager = { interactionData: { contexts } };
    try {
      // The drag's preview (what core's ruler draws and measures).
      const job = a.findMovementPath([origin, dest], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
      const shown = job.result;
      assert.ok(Array.isArray(shown), "found while dragging");
      assert.deepEqual([shown.at(-1).x, shown.at(-1).y], [500, 100], "it ends where it is dropped");
      assert.ok(clearOf(origin, shown.slice(1), center(rest.document._source), S - 1), `the ruler's way goes round the token: ${JSON.stringify(shown.map(w => [w.x, w.y]))}`);
      const shownCost = costOf(a, origin, shown.slice(1));
      // The drop walks that way, at that cost.
      contexts[a.document.id].foundPath = shown;
      drop.result = coreDrop(contexts);
      const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts } });
      const wps = out[1].movement[a.document.id].waypoints;
      assert.ok(clearOf(origin, wps, center(rest.document._source), S - 1), `the walk goes round it: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
      assert.equal(costOf(a, origin, wps), shownCost, "charged what the ruler showed");
      // Not with Ctrl waypoints (the drop keeps them as core's): core's own line.
      contexts[a.document.id].waypoints = [wp(300, 300)];
      const ctl = a.findMovementPath([origin, dest], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
      assert.equal(ctl.result.length, 2, "Ctrl waypoints: core's own path");
      contexts[a.document.id].waypoints = [];
    } finally {
      combatFlag = false;
      layer._draggedToken = null;
      delete a.mouseInteractionManager;
      F.canvas.tokens.placeables = saved;
      sceneTokens.delete(rest.document.id); sceneTokens.delete(a.document.id);
      tickBy(60000);
    }
  });
}

test("S1R2-04: a single drag in a fight to a square walled in by standing tokens walks, square by square, up to the first one in its way and stops there (told), never staying where it stood", () => {
  combatFlag = true;
  clock.step = 0;
  const a = makeToken("s24A000000000001", 100, 100);
  // The square (800, 300) has the wall at y 400 below it and tokens on its five other sides.
  const ring = [[700, 200], [800, 200], [900, 200], [700, 300], [900, 300]].map(([x, y], k) => {
    const t = makeToken(`s24R00000000000${k}`, x, y);
    t.visible = true;
    return t;
  });
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, ...ring];
  try {
    // A knight's-move line: no whole square on it until its end.
    const ctx = contextsFor([a], 700, 200);
    drop.result = coreDrop(ctx);
    const from = F.calls.length;
    const out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
    tickBy(2000);
    const moves = sent(from);
    const wps = out?.[1]?.movement?.[a.document.id]?.waypoints ?? moves.at(-1)?.options?.movement?.[a.document.id]?.waypoints;
    assert.ok(wps?.length, `it moves: ${JSON.stringify(out?.[1]?.movement)} / ${moves.length} sent`);
    const end = wps.at(-1);
    assert.ok(end.x % 100 === 0 && end.y % 100 === 0, `rests on a whole square: ${JSON.stringify(end)}`);
    assert.ok(end.x >= 400, `it walks up to the ring, not a square or two: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
    let prev = center(a.document._source);
    for (const p of wps) {
      const q = center(p);
      assert.ok(Math.max(Math.abs(q.x - prev.x), Math.abs(q.y - prev.y)) <= 100 + 1e-6, `a square at a time: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
      prev = q;
    }
    for (const t of ring) assert.ok(clearOf(a.document._source, wps, center(t.document._source), S - 1), `never through ${t.document.id}: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.stoppedShort"), "told");
  } finally {
    combatFlag = false;
    F.canvas.tokens.placeables = saved;
    for (const t of ring) sceneTokens.delete(t.document.id);
    sceneTokens.delete(a.document.id);
    tickBy(60000);
  }
});

test("S1R2-03: a big token whose way stops fitting on a slanted line (no whole square on it) rests on whole squares before the door, not off the grid", () => {
  const big = makeToken("s23L000000000001", 100, 0, { size: 2 });
  try {
    // Its centre (200, 100) → (550, 600) crosses the wall's line y 400 in the one-square door (x 400-500), which its
    // body does not fit; no quarter-square sample on the line is a whole square.
    const path = [wp(100, 0, { width: 2, height: 2, snapped: false, explicit: false, checkpoint: false }), wp(450, 500, { width: 2, height: 2, snapped: false })];
    const r = fitPath(big, path);
    assert.equal(r.cut, true);
    const end = r.path.at(-1);
    assert.ok(end.x % 100 === 0 && end.y % 100 === 0, `whole squares: ${JSON.stringify(r.path.map(w => [w.x, w.y]))}`);
    assert.ok(end.y + 200 <= 400, `its body before the wall's line (y 400): ${JSON.stringify(end)}`);
    assert.ok(end.y >= 100, `it still walks toward the door: ${JSON.stringify(end)}`);
    assert.equal(end.explicit, true);
  } finally {
    sceneTokens.delete(big.document.id);
  }
});

const flush = async (n = 6) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };

/** Every notice a test drop gives (the localization keys), for the length of `fn`. */
async function noticesOf(fn) {
  const n = globalThis.ui.notifications;
  const saved = n.warn;
  const out = [];
  n.warn = (msg, o) => { out.push(String(msg)); return saved?.call(n, msg, o); };
  try { await fn(out); } finally { n.warn = saved; }
  return out;
}

test("HX1-07 / 0.8.0 click-stop: a token whose body is across a door's line is carried just past the line along its own route (drawn first, then a short walk, no snap)", async () => {
  combatFlag = false;
  clock.step = 0;
  const t = makeToken("pdrA000000000001", 100, 100);
  const others = keepOnly([t]);
  const savedWalls = sceneDoc._walls;
  sceneDoc.walls = [{ c: [400, 0, 400, 300], door: 1, ds: 1, move: 20 }];        // an open door's line at x = 400
  t.document._source = { ...t.document._source, x: 700, y: 100 };
  t.document.x = 360; t.document.y = 100;                                         // drawn across it (centre 410)
  t.document.movement = { state: "completed", user: { isSelf: true }, origin: wp(100, 100), passed: { waypoints: [wp(700, 100)] }, pending: { waypoints: [] } };
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  try {
    t._onClickLeft({});
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.equal(moves[0].options.animate, false);
    assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [360, 100], "first exactly where it is drawn");
    const end = moves[1]?.waypoints?.at(-1);
    assert.ok(end, "then a short walk");
    assert.ok(end.x >= 399 && end.x <= 410 && end.y === 100, `just past the line, ahead along its route: ${JSON.stringify(end)}`);
    assert.equal(end.snapped, false);
    assert.equal(api.status().stop.last.pastDoor, 1);
  } finally {
    sceneDoc._walls = savedWalls;
    t.animationContexts.clear();
    t.document.movement = { state: "completed", user: { isSelf: true } };
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

/** A token drawn walking east across an open door's line at x = 400 (drawn top-left `x`, its document at 700). */
function acrossDoor(id, x) {
  const t = makeToken(id, 700, 100);
  t.document.x = x; t.document.y = 100;
  t.document.movement = { state: "completed", user: { isSelf: true }, origin: wp(100, 100), passed: { waypoints: [wp(700, 100)] }, pending: { waypoints: [] } };
  t.animationContexts.set(t.movementAnimationName, {});
  return t;
}

test("0.10 L3 (simulator, seed 1477): a stop never rests a token where another stop of this client is carrying a token on to", async () => {
  combatFlag = false;
  clock.step = 0;
  const x = acrossDoor("wonX000000000001", 360);             // carried on just past the line, to about 400
  const y = acrossDoor("wonY000000000001", 650);             // far off when x is stopped
  const others = keepOnly([x, y]);
  const savedWalls = sceneDoc._walls;
  sceneDoc.walls = [{ c: [400, 0, 400, 300], door: 1, ds: 1, move: 20 }];
  // x's stop write is held, so its walk on is still to go when y is stopped.
  let release = null;
  const move0 = x.document.move;
  x.document.move = (waypoints, options) => { F.calls.push({ op: "move", id: x.document.id, waypoints, options }); return options?.animate === false ? new Promise(r => { release = () => r(true); }) : Promise.resolve(true); };
  const from = F.calls.length;
  try {
    x._onClickLeft({});
    await flush();
    // Then drawn where x will rest, and stopped by a second click before x's walk on has gone.
    y.document.x = 470;
    y._onClickLeft({});
    await flush();
    release?.();
    await flush();
    const end = id => F.calls.slice(from).filter(c => c.op === "move" && c.id === id).at(-1)?.waypoints?.at(-1);
    const ex = end(x.document.id), ey = end(y.document.id);
    assert.ok(ex && ey, JSON.stringify(F.calls.slice(from).filter(c => c.op === "move").map(c => [c.id, c.waypoints.at(-1)])));
    assert.ok(Math.hypot(ex.x - ey.x, ex.y - ey.y) >= S - 1, `apart at rest: ${JSON.stringify({ ex, ey })}`);
  } finally {
    x.document.move = move0;
    sceneDoc._walls = savedWalls;
    for (const t of [x, y]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; sceneTokens.delete(t.document.id); }
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10 L3 (simulator, seed 1477): a stop's walk on that a wall raised since would cross takes its spot again along its way, with the walls as they are now", async () => {
  combatFlag = false;
  clock.step = 0;
  const t = acrossDoor("wonW000000000001", 360);
  const others = keepOnly([t]);
  const savedWalls = sceneDoc._walls;
  sceneDoc.walls = [{ c: [400, 0, 400, 300], door: 1, ds: 1, move: 20 }];
  let release = null;
  const move0 = t.document.move;
  t.document.move = (waypoints, options) => { F.calls.push({ op: "move", id: t.document.id, waypoints, options }); return options?.animate === false ? new Promise(r => { release = () => r(true); }) : Promise.resolve(true); };
  const from = F.calls.length;
  try {
    t._onClickLeft({});
    await flush();
    // A wall raised across the walk on (between where it is drawn and the spot past the door's line) before it goes.
    world.walls.push([{ x: 430, y: 0 }, { x: 430, y: 300 }]);
    release?.();
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id);
    assert.equal(moves.length, 2, JSON.stringify(moves.map(m => m.waypoints)));
    const end = moves[1].waypoints.at(-1);
    assert.ok(end.x <= 301 && end.y === 100, `back along its way, clear of the door's line: ${JSON.stringify(end)}`);
    for (const m of moves.slice(1)) {
      let p = { x: 360, y: 100 };
      for (const q of m.waypoints) { assert.equal(crossingCore(center(p), center(q)).length, 0, "never across the new wall"); p = q; }
    }
  } finally {
    world.walls.pop();
    t.document.move = move0;
    sceneDoc._walls = savedWalls;
    t.animationContexts.clear();
    t.document.movement = { state: "completed", user: { isSelf: true } };
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10 L3 fix round (simulator seed 9124): a walk on whose way back a wall shut since, inside a member of its own stop that rests where drawn, is settled again with it: that one walks on clear along its own way", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const path = [{ x: 0, y: 100 }, { x: 900, y: 100 }];
  const f = walking("agnF00000000001A", { x: 340, y: 100 }, { x: 900, y: 100 }, path);
  const b = walking("agnB00000000001A", { x: 280, y: 100 }, { x: 900, y: 100 }, path);
  // b's stop write is held, so its walk on (back along its way, clear of f) is still to go when the wall rises.
  let release = null;
  const move0 = b.document.move;
  b.document.move = (waypoints, options) => { F.calls.push({ op: "move", id: b.document.id, waypoints, options }); return options?.animate === false ? new Promise(r => { release = () => r(true); }) : Promise.resolve(true); };
  const from = F.calls.length;
  try {
    f._onClickLeft({});
    await flush();
    assert.ok(release, "b was stopped too (its way came into f's spot)");
    // The server has both where the stop rested them; f is at rest.
    Object.assign(f.document._source, { x: 340, y: 100 });
    Object.assign(b.document._source, { x: 280, y: 100 });
    f.animationContexts.clear();
    world.walls.push([{ x: 300, y: 0 }, { x: 300, y: 300 }]);
    release();
    await flush();
    const fm = F.calls.slice(from).filter(c => c.op === "move" && c.id === f.document.id);
    const bm = F.calls.slice(from).filter(c => c.op === "move" && c.id === b.document.id);
    assert.equal(bm.length, 1, `b stays where it was drawn: ${JSON.stringify(bm.map(m => m.waypoints))}`);
    const end = fm.at(-1).waypoints.at(-1);
    assert.ok(fm.length === 2 && end.x >= 380 - 1 && end.x <= 340 + 1.5 * S && end.y === 100, `f walks on clear of b along its way: ${JSON.stringify(fm.map(m => m.waypoints))}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "notify" && /Stopped on another token/.test(c.message)), "nobody named on another token");
  } finally {
    world.walls.pop();
    b.document.move = move0;
    f.animationContexts.clear(); b.animationContexts.clear();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("0.8.0 click-stop: not across a door's line, nothing but the stop where it is drawn (no walk out, no search)", async () => {
  combatFlag = false;
  const t = makeToken("pdrB000000000001", 100, 100);
  // Alone on the scene (0.9.0: a token at rest under the spot would carry it clear).
  const others = keepOnly([t]);
  t.document._source = { ...t.document._source, x: 700, y: 100 };
  t.document.x = 333; t.document.y = 117;
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  try {
    t._onClickLeft({});
    await flush();
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    assert.equal(moves.length, 1);
    assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [333, 117]);
  } finally {
    t.animationContexts.clear();
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

/** No walk of `call` (a flush's update) comes inside touching less 0.1 square of a walk of the first wave `out` (both from now, 6 squares/s). */
function assertClearOfFirst(ts, out, call) {
  const centre = p => ({ x: p.x / S + 0.5, y: p.y / S + 0.5 });
  const walk = (id, wps) => [centre(ts.find(t => t.document.id === id).document._source), ...wps.map(centre)];
  const at = (pts, t) => {
    let left = t * 6;
    for (let k = 1; k < pts.length; k++) {
      const L = Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      if (left <= L) return { x: pts[k - 1].x + ((pts[k].x - pts[k - 1].x) * left) / L, y: pts[k - 1].y + ((pts[k].y - pts[k - 1].y) * left) / L };
      left -= L;
    }
    return pts.at(-1);
  };
  const firstWalks = (out?.[0] ?? []).map(u => walk(u._id, out[1].movement[u._id].waypoints));
  for (const id of call.ids) {
    const a = walk(id, call.options.movement[id].waypoints);
    for (const b of firstWalks) {
      let best = Infinity;
      for (let t = 0; t <= 4; t += 0.01) { const p = at(a, t), q = at(b, t); best = Math.min(best, Math.hypot(p.x - q.x, p.y - q.y)); }
      assert.ok(best >= 1 - 0.1 - 1e-6, `${id}'s flushed walk comes within ${best.toFixed(2)} squares of a first-wave walk`);
    }
  }
}

test("0.8.0 / 0.9.0 notices: the players see \"No route there\", \"Stopped short, way blocked\" and (0.9.0) the fight's one token at a time; the named ones say who (0.10 L3: out of movement in a fight; the L3 ruling: a door shut refused names who is in the doorway)", () => {
  const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const shown = Object.keys(lang.PENTARYN_MOVEMENT.notify).filter(k => typeof lang.PENTARYN_MOVEMENT.notify[k] === "string");
  assert.deepEqual(shown.sort(), ["doorBlocked", "fightGroup", "noRoute", "stoppedShort"]);
  assert.equal(lang.PENTARYN_MOVEMENT.notify.doorBlocked, "Door blocked: {name} is in the doorway.");
  assert.deepEqual(Object.keys(lang.PENTARYN_MOVEMENT.notify.named).sort(), ["aToken", "noRoute", "notSent", "speed", "stayed", "stopInside", "walkedOn"]);
  assert.equal(lang.PENTARYN_MOVEMENT.notify.stoppedShort, "Stopped short, way blocked.");
});

test("0.8.0 circuit breaker: repeated failures in a session switch the drag help off on this client (plain core) and tell the GM; turning assist back on clears it", async () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("brkA000000000001", 400, 200), makeToken("brkB000000000001", 300, 200)];
  const others = keepOnly(ts);
  const chats = [];
  const savedChat = globalThis.ChatMessage;
  globalThis.ChatMessage = { create: async data => { chats.push(data); return data; } };
  F.CONFIG.debug["pentaryn-movement.breaker"] = true;
  F.CONFIG.debug["pentaryn-movement.throw"] = true;
  try {
    for (let k = 0; k < 3; k++) dropWith(ts[0], contextsFor(ts, 0, 400));
    F.CONFIG.debug["pentaryn-movement.throw"] = false;
    assert.ok(api.status().assist.tripped, JSON.stringify(api.telemetry().summary));
    // Plain Foundry dragging from now on: a group drop is core's.
    const core = coreDrop(contextsFor(ts, 0, 400));
    drop.result = core;
    assert.equal(ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: contextsFor(ts, 0, 400) } }), core);
    assert.equal(api.status().group.last.reason, "off");
    assert.ok(chats.some(c => /switched itself off/.test(c.content) && c.whisper?.length), "the GM is told");
    await game.settings.set(MOD, "assist", false);
    await game.settings.set(MOD, "assist", true);
    assert.equal(api.status().assist.tripped, null, "the GM turning it back on clears it");
    // 0.8.2: it counts afresh from there. The session's tallies stayed past the limit, so the very next failure
    // tripped it again at once.
    F.CONFIG.debug["pentaryn-movement.throw"] = true;
    dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.equal(api.status().assist.tripped, null, "one failure after the GM turned it back on does not trip it");
    dropWith(ts[0], contextsFor(ts, 0, 400));
    dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(api.status().assist.tripped, "three more do");
    F.CONFIG.debug["pentaryn-movement.throw"] = false;
    await game.settings.set(MOD, "assist", false);
    await game.settings.set(MOD, "assist", true);
  } finally {
    F.CONFIG.debug["pentaryn-movement.throw"] = false;
    F.CONFIG.debug["pentaryn-movement.breaker"] = false;
    globalThis.ChatMessage = savedChat;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/** A core movement operation as preMoveToken gets it: a step from `from` to `to` (top-left pixels). */
const moveOp = (id, from, to, { chain = [], method = "dragging" } = {}) => ({
  id, chain, method, origin: { ...from, width: 1, height: 1 }, destination: { ...to, width: 1, height: 1 },
  passed: { waypoints: [{ ...to, width: 1, height: 1 }] }, pending: { waypoints: [] },
});

test("AR1-01: a fight move dragged here goes on square by square only while this page draws the token: once the GM views another scene its next square is not sent (core would send it through a shut door, unmeasured, at 0 ft)", () => {
  combatFlag = true;
  const t = makeToken("ar1aA00000000001", 2200, 1000);
  const others = keepOnly([t]);
  try {
    t.document.rendered = true;
    assert.notEqual(F.fireCall("preMoveToken", t.document, moveOp("mvAR1a0000000001", { x: 2200, y: 1000 }, { x: 2200, y: 900 }), {}), false, "the drag's first square goes");
    t.document.rendered = false;
    const cont = moveOp("mvAR1a0000000002", { x: 2200, y: 900 }, { x: 2200, y: 800 }, { chain: ["mvAR1a0000000001"] });
    assert.equal(F.fireCall("preMoveToken", t.document, cont, { _movementArguments: { continuationId: "c1" } }), false, "not drawn here: the next square is not sent");
    assert.equal(api.status().group.step.why, "unrendered");
    // A move the module did not drive (a macro, MCP move-token from the headless GM): never touched (C10).
    const api0 = moveOp("mvAR1a0000000003", { x: 2200, y: 900 }, { x: 2200, y: 800 }, { method: "api" });
    assert.notEqual(F.fireCall("preMoveToken", t.document, api0, {}), false);
    const contApi = moveOp("mvAR1a0000000004", { x: 2200, y: 800 }, { x: 2200, y: 700 }, { chain: ["mvAR1a0000000003"], method: "api" });
    assert.notEqual(F.fireCall("preMoveToken", t.document, contApi, { _movementArguments: { continuationId: "c2" } }), false, "its continuation goes as core sends it");
  } finally {
    delete t.document.rendered;
    combatFlag = false;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR1-01: out of combat, a continuation from a page that no longer draws the token is not sent across a wall that blocks movement now", () => {
  combatFlag = false;
  const t = makeToken("ar1bA00000000001", 100, 200);
  const others = keepOnly([t]);
  try {
    t.document.rendered = true;
    F.fireCall("preMoveToken", t.document, moveOp("mvAR1b0000000001", { x: 100, y: 200 }, { x: 100, y: 300 }), {});
    t.document.rendered = false;
    // (100, 300) → (100, 400): its centre crosses the wall along y = 400.
    const through = moveOp("mvAR1b0000000002", { x: 100, y: 300 }, { x: 100, y: 400 }, { chain: ["mvAR1b0000000001"] });
    assert.equal(F.fireCall("preMoveToken", t.document, through, { _movementArguments: { continuationId: "c1" } }), false);
    // Through the door (x 400-500): it goes.
    const door = moveOp("mvAR1b0000000003", { x: 400, y: 300 }, { x: 400, y: 400 }, { chain: ["mvAR1b0000000001"] });
    assert.notEqual(F.fireCall("preMoveToken", t.document, door, { _movementArguments: { continuationId: "c2" } }), false);
  } finally {
    delete t.document.rendered;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10 L2 fix (d): in a fight a one-way wall met from its open side does not stop the next square; from its other side it does", () => {
  combatFlag = true;
  const t = makeToken("owwA000000000001", 700, 100);
  const others = keepOnly([t]);
  // Drawn top to bottom with dir 1 (LEFT): open from the west, a wall from the east (as Foundry's orientPoint reads it).
  sceneDoc.walls = [...world.walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 })), { c: [800, 0, 800, 300], door: 0, ds: 0, move: 20, dir: 1 }];
  try {
    t.document.rendered = true;
    const east = moveOp("mvOWW00000000001", { x: 700, y: 100 }, { x: 800, y: 100 });
    assert.notEqual(F.fireCall("preMoveToken", t.document, east, {}), false, "from the open side it goes");
    t.document._source.x = 800;
    const west = moveOp("mvOWW00000000002", { x: 800, y: 100 }, { x: 700, y: 100 });
    assert.equal(F.fireCall("preMoveToken", t.document, west, {}), false, "from the walled side it does not");
    assert.equal(api.status().group.step.why, "wall");
  } finally {
    sceneDoc.walls = null;
    delete t.document.rendered;
    combatFlag = false;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR1-07: a fight's next square is never sent into a token standing still here (one walking past is not standing; one it already overlaps where it stands is not a new block; 0.10 L3: nor onto a walker's own square)", () => {
  combatFlag = true;
  const t = makeToken("ar1cA00000000001", 100, 100);
  const stand = makeToken("ar1cB00000000001", 300, 100);
  const walker = makeToken("ar1cC00000000001", 200, 200);
  const others = keepOnly([t, stand, walker]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [t, stand, walker];
  try {
    t.document.rendered = true;
    F.fireCall("preMoveToken", t.document, moveOp("mvAR1c0000000001", { x: 100, y: 100 }, { x: 200, y: 100 }), {});
    const into = moveOp("mvAR1c0000000002", { x: 200, y: 100 }, { x: 300, y: 100 }, { chain: ["mvAR1c0000000001"] });
    assert.equal(F.fireCall("preMoveToken", t.document, into, { _movementArguments: { continuationId: "c1" } }), false, "into the standing token: not sent");
    assert.equal(api.status().group.step.why, "standing");
    // (200, 100) → (200, 200) is where the walker is drawn walking past, its own square beyond: not a standing token.
    walker.document.movement = { state: "pending", user: { isSelf: false } };
    walker.document._source.y = 300;
    const past = moveOp("mvAR1c0000000003", { x: 200, y: 100 }, { x: 200, y: 200 }, { chain: ["mvAR1c0000000001"] });
    assert.notEqual(F.fireCall("preMoveToken", t.document, past, { _movementArguments: { continuationId: "c2" } }), false);
    // 0.10 L3 (simulator seeds 3124, 7976, 3599): a walker whose own square (where its document is) is that next square,
    // and that rests there (its move's last square) or has had no next square for a while (its screen held up, or
    // gone): not onto it, or the two rest on one square. One about to walk on is passed (seed 1631: two crossing).
    walker.document._source.y = 200;
    F.Hooks.callAll("updateToken", walker.document, { y: 200 }, {}, "other");          // it moved just now
    const cross = moveOp("mvAR1c0000000006", { x: 200, y: 100 }, { x: 200, y: 200 }, { chain: ["mvAR1c0000000001"] });
    assert.notEqual(F.fireCall("preMoveToken", t.document, cross, { _movementArguments: { continuationId: "c5" } }), false, "a walker about to walk on: passed");
    mock.timers.tick(600);
    const onto = moveOp("mvAR1c0000000005", { x: 200, y: 100 }, { x: 200, y: 200 }, { chain: ["mvAR1c0000000001"] });
    assert.equal(F.fireCall("preMoveToken", t.document, onto, { _movementArguments: { continuationId: "c4" } }), false, "onto a held-up walker's own square: not sent");
    walker.document.movement = { state: "completed", user: { isSelf: false } };
    walker.animationContexts.set(walker.movementAnimationName, {});
    const last = moveOp("mvAR1c0000000007", { x: 200, y: 100 }, { x: 200, y: 200 }, { chain: ["mvAR1c0000000001"] });
    assert.equal(F.fireCall("preMoveToken", t.document, last, { _movementArguments: { continuationId: "c6" } }), false, "onto a walker's last square: not sent");
    walker.animationContexts.clear();
    // Pressed together where it stands (it starts inside the standing one): leaving is fine.
    const away = moveOp("mvAR1c0000000004", { x: 260, y: 100 }, { x: 260, y: 0 }, { chain: ["mvAR1c0000000001"] });
    assert.notEqual(F.fireCall("preMoveToken", t.document, away, { _movementArguments: { continuationId: "c3" } }), false);
  } finally {
    F.canvas.tokens.placeables = saved;
    walker.document.movement = { state: "completed", user: { isSelf: true } };
    delete t.document.rendered;
    combatFlag = false;
    for (const x of [t, stand, walker]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR1-05 / AR1-06: one Ctrl+Z undoes one move: a group's waves and a fight's squares merge into one undo entry, each token back where the move found it", () => {
  combatFlag = true;
  const a = makeToken("ar1dA00000000001", 100, 100), b = makeToken("ar1dB00000000001", 200, 100);
  const others = keepOnly([a, b]);
  const savedTokens = F.canvas.tokens;
  const history = [];
  F.canvas.tokens = { ...savedTokens, history };
  const entry = (id, ox, oy, hist) => ({ type: "update", data: [{ _id: id, _movementHistory: hist }], options: { movement: { [id]: { waypoints: [{ x: ox, y: oy, action: "displace" }], method: "undo" } }, diff: false, animate: false } });
  try {
    // A fight drag of a: three squares, each its own update and undo entry; core's continuations chain to the first.
    const first = moveOp("mvAR1d0000000001", { x: 100, y: 100 }, { x: 100, y: 200 });
    F.fireCall("preMoveToken", a.document, first, {});
    history.push(entry(a.document.id, 100, 100, []));
    F.fire("updateToken", a.document, { x: 100, y: 200 }, { _movement: { [a.document.id]: first }, method: "dragging" }, game.user.id);
    for (let k = 2; k <= 3; k++) {
      const op = moveOp(`mvAR1d000000000${k}`, { x: 100, y: 100 * k }, { x: 100, y: 100 * (k + 1) }, { chain: ["mvAR1d0000000001"] });
      history.push(entry(a.document.id, 100, 100 * k, [{ x: 100, y: 100 }]));
      F.fire("updateToken", a.document, { y: 100 * (k + 1) }, { _movement: { [a.document.id]: op }, _movementArguments: { continuationId: `c${k}` } }, game.user.id);
    }
    assert.equal(history.length, 1, "one entry for the whole move");
    assert.deepEqual(history[0].options.movement[a.document.id].waypoints[0], { x: 100, y: 100, action: "displace" }, "back to where the move found it");
    assert.deepEqual(history[0].data[0]._movementHistory, [], "its movement history as it was (nothing charged)");
    // A group's two waves (out of combat), named by the group's id: one entry with both members.
    combatFlag = false;
    const w1 = moveOp("mvAR1d0000000011", { x: 100, y: 400 }, { x: 100, y: 600 }), w2 = moveOp("mvAR1d0000000012", { x: 200, y: 100 }, { x: 200, y: 600 });
    history.push(entry(a.document.id, 100, 400, []));
    F.fire("updateToken", a.document, {}, { _movement: { [a.document.id]: w1 }, pentarynMovementGroup: "gAR1" }, game.user.id);
    history.push(entry(b.document.id, 200, 100, []));
    F.fire("updateToken", b.document, {}, { _movement: { [b.document.id]: w2 }, pentarynMovementGroup: "gAR1" }, game.user.id);
    assert.equal(history.length, 2, "the fight move's entry, then the group's");
    assert.deepEqual(history[1].data.map(d => d._id).sort(), [a.document.id, b.document.id].sort());
    // A new drag of the same token right after (its reservation's options on it) is a move of its own.
    const again = { ...moveOp("mvAR1d0000000031", { x: 100, y: 600 }, { x: 100, y: 700 }) };
    F.fireCall("preMoveToken", a.document, again, {});
    history.push(entry(a.document.id, 100, 600, []));
    F.fire("updateToken", a.document, {}, { _movement: { [a.document.id]: again }, pentarynMovementRid: { [a.document.id]: "r1" } }, game.user.id);
    assert.equal(history.length, 3, "its own entry");
    history.pop();
    // Another user's update and a plain macro move keep their own entries (C10).
    history.push(entry(b.document.id, 200, 600, []));
    F.fire("updateToken", b.document, {}, { _movement: { [b.document.id]: moveOp("mvAR1d0000000021", { x: 200, y: 600 }, { x: 300, y: 600 }, { method: "api" }) } }, game.user.id);
    assert.equal(history.length, 3);
  } finally {
    F.canvas.tokens = savedTokens;
    combatFlag = false;
    for (const x of [a, b]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR1-09: a mount dragged alone carries its rider (they start stacked; the rider walks its mount's way at its offset)", () => {
  combatFlag = false;
  clock.step = 0;
  const mount = makeToken("ar1eM00000000001", 100, 100, { size: 2 });
  const rider = makeToken("ar1eR00000000001", 100, 100);
  const others = keepOnly([mount, rider]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [mount, rider];
  try {
    const from = F.calls.length;
    const out = dropWith(mount, contextsFor([mount], 300, 0));
    tickBy(5000);
    const batches = [...(Array.isArray(out) ? [{ ids: out[0].map(u => u._id), options: out[1] }] : []), ...sent(from)];
    const mv = id => batches.map(bb => bb.options.movement?.[id]).find(Boolean);
    assert.ok(mv(mount.document.id), "the mount moves");
    assert.ok(mv(rider.document.id), `the rider moves with it: ${JSON.stringify(api.status().group.last)}`);
    assert.deepEqual(mv(rider.document.id).waypoints.map(w => [w.x, w.y]), mv(mount.document.id).waypoints.map(w => [w.x, w.y]));
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const x of [mount, rider]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("AR1-12: a flying token passes over the tokens on the ground (they are no obstacle to its routes, nor it to theirs)", async () => {
  const { othersOf } = await import("../group-adapter.mjs");
  const flyer = makeToken("ar1fF00000000001", 100, 100);
  const ground = makeToken("ar1fG00000000001", 300, 100);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [flyer, ground];
  try {
    assert.equal(othersOf([{ id: flyer.document.id, token: flyer }], S).length, 1, "both on the ground: an obstacle");
    flyer.document.movementAction = "fly";
    assert.equal(othersOf([{ id: flyer.document.id, token: flyer }], S).length, 0, "flying over it");
    assert.equal(othersOf([{ id: ground.document.id, token: ground }], S).length, 0, "and under it");
  } finally {
    flyer.document.movementAction = "walk";
    F.canvas.tokens.placeables = saved;
    for (const x of [flyer, ground]) sceneTokens.delete(x.document.id);
  }
});

test("AR2-01: once the GM views another scene, a fight there is still a fight (core reads game.combat, the viewed scene's): no square of the drag, first or next, is sent unmeasured from a page that no longer draws the token", () => {
  combatFlag = false;                              // core's test reads the viewed scene's combat: none there
  const t = makeToken("ar2aA00000000001", 2200, 1000);
  const others = keepOnly([t]);
  const savedCombats = F.game.combats;
  F.game.combats = { contents: [{ active: true, started: true, scene: { id: SCENE }, _source: { scene: SCENE },
    combatants: { contents: [{ tokenId: t.document.id, sceneId: SCENE }] } }] };
  try {
    t.document.rendered = false;
    // The drag's first square, sent after the switch (a queued single drop, a group's wave).
    const first = moveOp("mvAR2a0000000001", { x: 2200, y: 1000 }, { x: 2200, y: 900 });
    assert.equal(F.fireCall("preMoveToken", t.document, first, {}), false, "the first square is not sent unmeasured");
    assert.equal(api.status().group.step.why, "unrendered");
    // Its continuation (the drag's first square went while drawn).
    t.document.rendered = true;
    F.fireCall("preMoveToken", t.document, moveOp("mvAR2a0000000002", { x: 2200, y: 1000 }, { x: 2200, y: 900 }), {});
    t.document.rendered = false;
    const cont = moveOp("mvAR2a0000000003", { x: 2200, y: 900 }, { x: 2200, y: 800 }, { chain: ["mvAR2a0000000002"] });
    assert.equal(F.fireCall("preMoveToken", t.document, cont, { _movementArguments: { continuationId: "c1" } }), false, "nor the next");
    assert.equal(api.status().group.step.fight, true, "read as the fight it is");
    // A combat on another scene (or not started) is no fight here.
    F.game.combats = { contents: [{ active: true, started: true, scene: { id: "other" }, _source: { scene: "other" },
      combatants: { contents: [{ tokenId: t.document.id, sceneId: "other" }] } }] };
    const free = moveOp("mvAR2a0000000004", { x: 2200, y: 1000 }, { x: 2200, y: 900 });
    assert.notEqual(F.fireCall("preMoveToken", t.document, free, {}), false, "out of combat, no wall crossed: it goes");
    // A move the module did not drive stays core's (C10).
    assert.notEqual(F.fireCall("preMoveToken", t.document, moveOp("mvAR2a0000000005", { x: 2200, y: 1000 }, { x: 2200, y: 900 }, { method: "api" }), {}), false);
  } finally {
    F.game.combats = savedCombats;
    delete t.document.rendered;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR2-14: a token destroyed under a timer (the GM activated another scene mid-walk) is read without a throw: a destroyed PIXI object's position getter throws", async () => {
  const { drawnPosition, positionOf, holdPinned, pinDrawn } = await import("../group-adapter.mjs");
  const t = makeToken("ar2eA00000000001", 300, 100);
  const others = keepOnly([t]);
  try {
    Object.defineProperty(t, "position", { configurable: true, get() { throw new TypeError("Cannot read properties of null (reading 'position')"); } });
    t.animationContexts.set(t.movementAnimationName, {});
    assert.doesNotThrow(() => drawnPosition(t));
    assert.deepEqual(drawnPosition(t), { x: 300, y: 100, elevation: 0 });
    assert.equal(positionOf(t), null);
    t.destroyed = true;
    pinDrawn(t, { x: 200, y: 100 }, { x: 250, y: 100 });
    assert.doesNotThrow(() => holdPinned(t));
  } finally {
    delete t.position;
    t.animationContexts.clear();
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("AR3-12: in a fight, a single drag whose only way passes an ally standing in a one-wide corridor does not move and says \"No route there\", naming the ally and the ghost button (0.8.4: \"Stopped short, way blocked.\", nameless)", () => {
  combatFlag = true;
  clock.step = 0;
  world.walls.push([{ x: 100, y: 100 }, { x: 900, y: 100 }], [{ x: 100, y: 200 }, { x: 900, y: 200 }], [{ x: 100, y: 100 }, { x: 100, y: 200 }]);
  const one = makeToken("ar3dA00000000001", 100, 100), ally = makeToken("ar3dB00000000001", 200, 100);
  ally.visible = true;
  const others = keepOnly([one, ally]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [one, ally];
  try {
    const from = F.calls.length;
    const c1 = contextsFor([one], 500, 0);
    dropWith(one, c1);
    tickBy(2000);
    const told = F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
    assert.ok(told.some(m => /named\.noRoute|is in the way/.test(m)), `named: ${JSON.stringify(told)}`);
    assert.ok(!told.some(m => /stoppedShort/.test(m)), "not \"Stopped short\"");
  } finally {
    world.walls.pop(); world.walls.pop(); world.walls.pop();
    combatFlag = false;
    F.canvas.tokens.placeables = saved;
    for (const x of [one, ally]) sceneTokens.delete(x.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});


/** mulberry32: a small seeded PRNG (a failure names its seed). */
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

test("0.9.0 step 1 gate: 60 single fight drags, each charged exactly 5 ft per square walked, never through a wall or a standing token; a door shut mid-walk stops it on the square it holds, charged for the squares sent", () => {
  combatFlag = true;
  clock.step = 0;
  const saved = F.canvas.tokens.placeables;
  let moved = 0, told = 0, cut = 0;
  try {
    for (let seed = 1; seed <= 60; seed++) {
      const rand = rng(seed);
      const sq = n => Math.floor(rand() * n) * S;
      const t = makeToken(`fc${String(seed).padStart(3, "0")}A0000000000`, sq(10), sq(4));
      const stand = [];
      for (let k = 0, n = Math.floor(rand() * 3); k < n; k++) {
        const o = makeToken(`fc${String(seed).padStart(3, "0")}S${k}000000000`, sq(10), sq(10));
        if (o.document._source.x === t.document._source.x && o.document._source.y === t.document._source.y) { sceneTokens.delete(o.document.id); continue; }
        o.visible = true;
        stand.push(o);
      }
      const others = keepOnly([t, ...stand]);
      F.canvas.tokens.placeables = [t, ...stand];
      const dest = { x: sq(10), y: sq(10) };
      if (dest.x === t.document._source.x && dest.y === t.document._source.y) dest.x = (dest.x + S) % (10 * S);
      const why = `seed ${seed}: ${JSON.stringify(t.document._source)} → ${JSON.stringify(dest)}, standing ${JSON.stringify(stand.map(o => [o.document._source.x, o.document._source.y]))}`;
      try {
        const from = F.calls.length;
        const out = dropWith(t, contextsFor([t], dest.x - t.document._source.x, dest.y - t.document._source.y));
        const wps = out?.[1]?.movement?.[t.document.id]?.waypoints ?? [];
        if (!wps.length) {
          // It does not move: it was dropped where it stands, or the dragger is told why.
          const still = dest.x === t.document._source.x && dest.y === t.document._source.y;
          assert.ok(still || F.calls.slice(from).some(c => c.op === "notify"), `${why}: stays only with a notice`);
          told += still ? 0 : 1;
          continue;
        }
        moved += 1;
        const origin = wp(t.document._source.x, t.document._source.y, { snapped: false, explicit: false, checkpoint: false });
        const path = [origin, ...wps];
        for (let k = 1; k < path.length; k++) {
          const a = path[k - 1], b = path[k];
          assert.equal(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)), S, `${why}: one square a step (${k})`);
          assert.equal(crossing(center(a), center(b)).length, 0, `${why}: step ${k} through a wall`);
          for (const o of stand) {
            const c = center(o.document._source);
            assert.ok(avoidDist({ x: c.x, y: c.y, r: 99 }, center(a), center(b)) >= 99 - 1e-6 || Math.hypot(center(a).x - c.x, center(a).y - c.y) < 99,
              `${why}: step ${k} into a standing token`);
          }
        }
        assert.equal(Token5e.prototype.measureMovementPath.call(t, path).cost, 5 * wps.length, `${why}: charged 5 ft a square`);
        // Sent square by square (core's continuations, preMoveToken on this client); a door shuts before square `k`.
        const k = 1 + Math.floor(rand() * wps.length);
        let sent = 0, shut = false;
        t.document.rendered = true;
        for (let i = 0; i < wps.length; i++) {
          if (i === k - 1) { world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]); shut = true; }
          const op = moveOp(`mvfc${seed}x${i}`, path[i], path[i + 1], { chain: i ? [`mvfc${seed}x0`] : [] });
          const go = F.fireCall("preMoveToken", t.document, op, i ? { _movementArguments: { continuationId: `c${i}` } } : {}) !== false;
          if (!go) { cut += 1; break; }
          assert.equal(crossing(center(path[i]), center(path[i + 1])).length, 0, `${why}: square ${i + 1} sent through a wall (door shut: ${shut})`);
          sent += 1;
        }
        assert.equal(Token5e.prototype.measureMovementPath.call(t, path.slice(0, sent + 1)).cost, 5 * sent, `${why}: charged for the squares sent`);
      } finally {
        if (world.walls.length > 2) world.walls.length = 2;
        delete t.document.rendered;
        for (const o of [t, ...stand]) sceneTokens.delete(o.document.id);
        for (const [key, v] of others) sceneTokens.set(key, v);
      }
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    combatFlag = false;
    tickBy(60000);
  }
  if (process.env.PM_STATS) console.log({ moved, told, cut });
  assert.ok(moved >= 40, `most of the 60 drags move (${moved} moved, ${told} told, ${cut} cut by the door)`);
});

test("while a group is dragged only the grabbed token is pathfound", () => {
  const ts = [makeToken("folA000000000001", 400, 200), makeToken("folB000000000001", 300, 200)];
  const contexts = contextsFor(ts, 0, 400);
  layer._draggedToken = ts[0];
  ts[0].mouseInteractionManager = { interactionData: { contexts } };
  try {
    const follower = ts[1].findMovementPath([wp(300, 200), wp(300, 600)], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
    assert.deepEqual(follower.result.map(w => [w.x, w.y]), [[300, 200]], "core's own path: stops at the wall");
    const grabbed = ts[0].findMovementPath([wp(400, 200), wp(400, 600)], { preview: true, constrainOptions: {}, measureOptions: {}, terrainOptions: {} });
    assert.deepEqual([grabbed.result.at(-1).x, grabbed.result.at(-1).y], [400, 600]);
  } finally {
    layer._draggedToken = null;
  }
});


test("H2-08: a fast flick whose last pointer move core skipped plans to the pointer-up point, not the stale destination", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("flkA000000000001", 100, 100), makeToken("flkB000000000001", 200, 100)];
  // Core took the drag only as far as +100 px (its one-move-per-frame throttle); the pointer came up 400 px lower, past the door.
  const ctx = contextsFor(ts, 100, 0);
  const proto = Token5e.prototype;
  const saved = [proto._getDragOrigin, proto._getDragWaypointPosition];
  proto._getDragOrigin = function () { return center(this.document._source); };
  proto._getDragWaypointPosition = function (cur, p, { snap }) { return { ...cur, x: snap ? Math.round(p.x / S) * S : p.x, y: snap ? Math.round(p.y / S) * S : p.y }; };
  try {
    const grabbedCentre = center(ts[0].document._source);
    const staleDest = { x: grabbedCentre.x + 100, y: grabbedCentre.y };
    const up = { x: grabbedCentre.x + 300, y: grabbedCentre.y + 400 };
    drop.result = coreDrop(ctx);
    const from = F.calls.length;
    // Core's pointer-up writes the up point to interactionData.destination; the contexts keep the stale one.
    assert.equal(ctx[ts[0].document.id].destination.x, staleDest.x - 50);
    const out = ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx, destination: { ...up } }, shiftKey: false });
    tickBy(5000);
    const moves = { ...(out?.[1]?.movement ?? {}), ...Object.assign({}, ...sent(from).map(c => c.options.movement)) };
    const end = moves[ts[0].document.id]?.waypoints?.at(-1);
    assert.deepEqual([end?.x, end?.y], [400, 500], `the grabbed one goes where the pointer came up: ${JSON.stringify(end)}`);
    assert.ok(moves[ts[1].document.id]?.waypoints?.at(-1)?.y >= 400, "the other follows past the door");
  } finally { [proto._getDragOrigin, proto._getDragWaypointPosition] = saved; }
});


test("0.9.0 B1: a group through a door: each member its own route and spot past it; the first in the drop's own update, the rest in waves within 4 s, never resting on another", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("b0dA000000000001", 400, 200), makeToken("b0dB000000000001", 300, 200), makeToken("b0dC000000000001", 500, 200)];
  const others = keepOnly(ts);
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(Array.isArray(out), "planned at the drop");
    const [updates, options] = out;
    assert.equal(options.method, "dragging");
    assert.ok(updates.some(u => u._id === ts[0].document.id), "the grabbed one sets off with the drop");
    assert.equal(typeof options.pentarynMovementGroup, "string", "tagged as one group");
    assert.ok(api.status().group.groups >= 1, "held as one group (a click on one stops them all)");
    const total = api.status().group.last.plan.total;
    assert.ok(total <= 4000, `the last wave within 4 s: ${total}`);
    const moves = fileMoves(out, from);
    assert.deepEqual(Object.keys(moves).sort(), ts.map(t => t.document.id).sort(), "every member sent by 4 s");
    for (const c of sent(from)) assert.equal(c.options.pentarynMovementGroup, options.pentarynMovementGroup, "a wave carries its group");
    tickBy(10000);
    const ends = [];
    for (const t of ts) {
      const wps = moves[t.document.id].waypoints;
      const path = [t.document._source, ...wps];
      for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, `${t.document.id} leg ${k} crosses a wall`);
      assert.equal(wps.at(-1).explicit, true);
      const end = center(wps.at(-1));
      assert.ok(end.y > 400, `${t.document.id} ends past the door: ${JSON.stringify(end)}`);
      ends.push(end);
    }
    assert.deepEqual([moves.b0dA000000000001.waypoints.at(-1).x, moves.b0dA000000000001.waypoints.at(-1).y], [400, 600], "the grabbed one lands where dropped");
    for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
      assert.ok(Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) >= S - 1e-6, `no rest overlap: ${JSON.stringify(ends)}`);
    }
    const last = api.status().group.last;
    assert.deepEqual([last.mode, last.result, last.async], ["plan", "plan", false]);
    assert.deepEqual(last.stayed, [], "nobody named (0.10 R13: last.stayed, the ids)");
    assert.deepEqual([last.shape, last.leader, last.target], ["march", ts[0].document.id, null], "dropped on the floor: a march led by the grabbed one");
    assert.ok(!api.status().group.told.some(t => Date.parse(t.at) >= Date.now() - 5), "no notice");
  } finally {
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/** The B1 door drop: three members through the one-square door; the ones not in the drop's update wait in waves. */
function fileDrop(tag) {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken(`b1${tag}A00000000001`, 400, 200), makeToken(`b1${tag}B00000000001`, 300, 200), makeToken(`b1${tag}C00000000001`, 500, 200)];
  const others = keepOnly(ts);
  const from = F.calls.length;
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const now = new Set(out[0].map(u => u._id));
  const waiting = ts.filter(t => !now.has(t.document.id));
  assert.ok(waiting.length >= 1, `the door files them: ${JSON.stringify(api.status().group.last.plan)}`);
  assert.deepEqual(api.status().group.pending.flatMap(w => w.ids).sort(), waiting.map(t => t.document.id).sort(), "the waiting ones are this client's pending waves");
  const restore = () => { for (const t of ts) sceneTokens.delete(t.document.id); for (const [k, v] of others) sceneTokens.set(k, v); tickBy(60000); };
  return { ts, out, from, now, waiting, restore };
}

test("0.9.0 B1 handlers: a click on one member stops the whole group, its unsent waves too", async () => {
  const f = fileDrop("c");
  try {
    const walker = f.ts.find(t => f.now.has(t.document.id));
    walker.animationContexts.set(walker.movementAnimationName, {});
    const r = await api.stop(walker.document);
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.deepEqual(api.status().group.pending, [], "no wave left to send");
    tickBy(5000);
    assert.equal(sent(f.from).length, 0, "the waiting members never set off");
  } finally { f.ts.forEach(t => t.animationContexts.clear()); f.restore(); }
});

test("0.9.0 Fable check, blocker 3 (seeds 58, 373, 535, 588): a click while a member's wave is on its way stops that member where it is drawn as soon as its move comes back", async () => {
  for (const how of ["click", "foreign"]) {
    const f = fileDrop(how === "click" ? "L" : "M");
    try {
      const waved = f.waiting[0];
      // Until its wave goes (the stub never applies it, and no echo comes back): its write is in flight.
      for (let t = 0; t < 4500 && !sent(f.from).some(c => c.ids.includes(waved.document.id)); t += 50) tickBy(50);
      const wave = sent(f.from).find(c => c.ids.includes(waved.document.id));
      assert.ok(wave, "a wave was sent");
      const walker = f.ts.find(t => f.now.has(t.document.id));
      walker.animationContexts.set(walker.movementAnimationName, {});
      if (how === "click") {
        const r = await api.stop(walker.document);
        assert.equal(r.ok, true, JSON.stringify(r));
      } else {
        // Another user's click: its displace of the walker reaches the dragger's screen.
        F.Hooks.callAll("updateToken", walker.document, { x: 400, y: 300 }, { animate: false, pentarynMovementStop: true }, "otherUser000001");
      }
      await flush();
      const from = F.calls.length;
      assert.ok(!F.calls.slice(from).some(c => c.op === "move" && c.id === waved.document.id), "not stopped before it moves");
      // The wave's write comes back: the member starts to walk its route.
      waved.animationContexts.set(waved.movementAnimationName, {});
      F.Hooks.callAll("updateToken", waved.document, { x: 400, y: 300 }, { ...wave.options }, game.user.id);
      tickBy(50);
      await flush();
      const stop = F.calls.slice(from).find(c => c.op === "move" && c.id === waved.document.id && c.options?.pentarynMovementStop);
      assert.ok(stop, `${how}: the member in flight is stopped when its move is back`);
      assert.equal(stop.options.animate, false, "where it is drawn");
      assert.ok(api.status().group.stopped.late >= 1, JSON.stringify(api.status().group.stopped));
      // Its next write (the stop's own) is no second stop.
      const n = F.calls.length;
      F.Hooks.callAll("updateToken", waved.document, { x: 400, y: 300 }, { ...wave.options }, game.user.id);
      tickBy(50);
      await flush();
      assert.ok(!F.calls.slice(n).some(c => c.op === "move" && c.id === waved.document.id), "once only");
    } finally { f.ts.forEach(t => t.animationContexts.clear()); f.restore(); }
  }
});

test("0.9.0 simulator (step 5): a click on one member never rests it inside a mate of its group already at rest (the mates it does not stop still count)", async () => {
  // Seeds 865 / 1274: a door cut stopped the group, then a click on one still walking on left it inside a mate.
  const f = fileDrop("k");
  try {
    const t = f.ts.find(x => f.now.has(x.document.id));
    const mate = f.ts.find(x => x !== t);
    mate.document._source = { ...mate.document._source, x: 400, y: 450 };            // at rest there, not walking
    t.document._source = { ...t.document._source, x: 400, y: 600 };
    t.document.x = 400; t.document.y = 480; t.position = { x: 400, y: 480 };       // drawn inside it, walking south
    t.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(400, 200), passed: { waypoints: [wp(400, 600)] }, pending: { waypoints: [] } };
    t.animationContexts.set(t.movementAnimationName, {});
    const from = F.calls.length;
    const r = await api.stop(t.document);                                        // the click's own stop, never held back
    assert.equal(r.ok, true, JSON.stringify(r));
    await flush();
    const end = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id).at(-1)?.waypoints?.at(-1);
    assert.ok(end, "stopped");
    assert.ok(Math.hypot(end.x - 400, end.y - 450) >= S - 1, `clear of the mate at rest: ${JSON.stringify(end)}`);
  } finally { f.ts.forEach(x => x.animationContexts.clear()); f.restore(); }
});

test("0.9.0 simulator (step 5): a stop never rests a member where this client has just sent a mate (its write not back yet)", async () => {
  // Seed 777: a wave sent a member to a spot; a door shut 50 ms later stopped another where it was drawn, on that spot,
  // before the wave's write had come back to this client (the document still showed the mate at its start).
  const f = fileDrop("q");
  try {
    const waved = f.waiting[0];
    // Until its wave goes (the stub never applies it, and no echo comes back).
    for (let t = 0; t < 4500 && !sent(f.from).some(c => c.ids.includes(waved.document.id)); t += 50) tickBy(50);
    let sentTo = null;
    for (const c of sent(f.from)) sentTo = c.options?.movement?.[waved.document.id]?.waypoints?.at(-1) ?? sentTo;
    assert.ok(sentTo, "a wave was sent");
    const t = f.ts.find(x => f.now.has(x.document.id));
    t.document._source = { ...t.document._source, x: 400, y: 800 };
    t.document.x = sentTo.x; t.document.y = sentTo.y; t.position = { x: sentTo.x, y: sentTo.y };
    t.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(sentTo.x, sentTo.y - 300), passed: { waypoints: [wp(400, 800)] }, pending: { waypoints: [] } };
    t.animationContexts.set(t.movementAnimationName, {});
    const from = F.calls.length;
    const r = await api.stop(t.document);
    assert.equal(r.ok, true, JSON.stringify(r));
    await flush();
    const end = F.calls.slice(from).filter(c => c.op === "move" && c.id === t.document.id).at(-1)?.waypoints?.at(-1);
    assert.ok(end && Math.hypot(end.x - sentTo.x, end.y - sentTo.y) >= S - 1, `clear of where the mate was just sent ${JSON.stringify(sentTo)}: ${JSON.stringify(end)}`);
  } finally { f.ts.forEach(x => x.animationContexts.clear()); f.restore(); }
});

test("0.9.0 B1 handlers: another user's stop of one member (its displace) makes the dragger's screen stop the rest where they are drawn and drop its waves", () => {
  const f = fileDrop("f");
  try {
    const clicked = f.ts.find(t => f.now.has(t.document.id));
    const mate = f.ts.find(t => t !== clicked && f.now.has(t.document.id)) ?? null;
    if (mate) mate.animationContexts.set(mate.movementAnimationName, {});
    const from = F.calls.length;
    F.Hooks.callAll("updateToken", clicked.document, { x: 400, y: 300 }, { animate: false, pentarynMovementStop: true }, "otherUser000001");
    assert.deepEqual(api.status().group.pending, [], "its waves dropped");
    if (mate) assert.ok(F.calls.slice(from).some(c => c.op === "move" && c.id === mate.document.id && c.options?.pentarynMovementStop), "the walking mate stopped where drawn");
    assert.ok(!F.calls.slice(from).some(c => c.op === "move" && c.id === clicked.document.id), "the clicked one is the clicker's");
    assert.equal(api.status().group.stopped.why, "foreign");
    tickBy(5000);
    assert.equal(sent(f.from).length, 0);
    // This client's own stop write is not a foreign stop (the click already stopped the group here).
    const f2 = fileDrop("s");
    try {
      F.Hooks.callAll("updateToken", f2.ts[0].document, { x: 400, y: 300 }, { animate: false, pentarynMovementStop: true }, game.user.id);
      assert.ok(api.status().group.pending.length >= 1, "its own write leaves the waves alone");
    } finally { f2.restore(); }
  } finally { f.ts.forEach(t => t.animationContexts.clear()); f.restore(); }
});

test("0.10 L2 fix (b): another user's stop of a member carried on past a door names its final spot, and the dragger's stop never rests a mate there", async () => {
  const f = fileDrop("x");
  try {
    const [, mate, carried] = f.ts;
    // The mate walks along y 100 and is drawn at (300, 100), exactly where the carried one's stop ends.
    Object.assign(mate.document, { x: 300, y: 100 });
    mate.position = { x: 300, y: 100 };
    mate.animationContexts.set(mate.movementAnimationName, {});
    mate.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(0, 100), passed: { waypoints: [wp(900, 100)] }, pending: { waypoints: [] } };
    const from = F.calls.length;
    F.Hooks.callAll("updateToken", carried.document, { x: 260, y: 300 }, { animate: false, pentarynMovementStop: true, pentarynMovementStopAt: { x: 300, y: 100 } }, "otherUser000001");
    await flush();
    const end = F.calls.slice(from).filter(c => c.op === "move" && c.id === mate.document.id).at(-1)?.waypoints?.at(-1);
    assert.ok(end, "the mate is stopped");
    assert.ok(Math.hypot(end.x - 300, end.y - 100) >= S - 1, `never at rest on the carried one's final spot: ${JSON.stringify(end)}`);
  } finally { f.ts.forEach(t => t.animationContexts.clear()); f.restore(); }
});

test("0.10 L3 fix round (simulator seed 9191): another user's stop of several members in one update names each one's final spot by id; the dragger's screen rests no mate on any of them and leaves the others of that update to it", async () => {
  const f = fileDrop("y");
  try {
    const [first, mate, carried] = f.ts;
    Object.assign(mate.document, { x: 300, y: 100 });
    mate.position = { x: 300, y: 100 };
    mate.animationContexts.set(mate.movementAnimationName, {});
    mate.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(0, 100), passed: { waypoints: [wp(900, 100)] }, pending: { waypoints: [] } };
    const from = F.calls.length;
    // One foreign update stopped `first` (where drawn) and `carried` (carried on to 300, 100): core calls the hook per document with the update's options.
    const options = { animate: false, pentarynMovementStop: true, pentarynMovementStopAt: { [first.document.id]: null, [carried.document.id]: { x: 300, y: 100 } } };
    F.Hooks.callAll("updateToken", first.document, { x: 100, y: 300 }, options, "otherUser000001");
    F.Hooks.callAll("updateToken", carried.document, { x: 260, y: 300 }, options, "otherUser000001");
    await flush();
    const end = F.calls.slice(from).filter(c => c.op === "move" && c.id === mate.document.id).at(-1)?.waypoints?.at(-1);
    assert.ok(end, "the mate is stopped");
    assert.ok(Math.hypot(end.x - 300, end.y - 100) >= S - 1, `never at rest on the second one's final spot: ${JSON.stringify(end)}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "move" && (c.id === first.document.id || c.id === carried.document.id)), "the update's own tokens are its sender's");
  } finally { f.ts.forEach(t => t.animationContexts.clear()); f.restore(); }
});

test("0.10 L2 fix (c): a wave whose members this client no longer draws (the dragger changed scene) names them; none leaves silently", () => {
  const f = fileDrop("v");
  const objects = new Map(f.ts.map(t => [t.document.id, t.document.object]));
  try {
    for (const t of f.waiting) t.document.object = null;
    const from = F.calls.length;
    tickBy(4500);
    assert.equal(sent(from).length, 0, "nothing sent from a page that does not draw them");
    const told = api.status().group.told.filter(x => x.reason === "wave:scene").map(x => x.text).join(" ");
    assert.ok(told, JSON.stringify(api.status().group.told));
    for (const t of f.waiting) assert.match(told, new RegExp(t.document.id));
    assert.match(told, /Did not move/, "named as not sent");
  } finally {
    for (const t of f.ts) t.document.object = objects.get(t.document.id);
    f.restore();
  }
});

test("0.10 L3 handlers (simulator: a hidden tab's flush packed the crowd): a tab going to the background keeps its waves in order on their own timers (a hidden tab fires them on whole seconds); one due past 3 s is timed for 3 s, so the last still goes within 4 s", () => {
  const f = fileDrop("h");
  try {
    const pending = api.status().group.pending;
    goHidden();
    assert.equal(sent(f.from).length, 0, "nothing sent at once");
    assert.deepEqual(api.status().group.pending.map(w => w.ids), pending.map(w => w.ids), "the waves wait, in order");
    assert.ok(api.status().group.flushed.kept >= 1, JSON.stringify(api.status().group.flushed));
    tickBy(4000);
    const ups = sent(f.from);
    assert.deepEqual(ups.flatMap(u => u.ids).sort(), f.waiting.map(t => t.document.id).sort(), "every waiting member went, within 4 s");
    assert.equal(ups.length, pending.length, "each wave its own update, as planned");
    assert.deepEqual(api.status().group.pending, []);
    tickBy(5000);
    assert.equal(sent(f.from).length, ups.length, "nothing twice");
  } finally { f.restore(); }
});

test("0.9.0 B1: a wave skips a member no longer at its start, and one whose way a door shut since crosses (it stays where it is drawn, named)", () => {
  const f = fileDrop("w");
  try {
    const [moved, ...rest] = f.waiting;
    moved.document._source.y -= S;                       // dragged elsewhere meanwhile (out of the others' way: it stands there now)
    tickBy(4500);
    assert.ok(!sent(f.from).some(c => c.ids.includes(moved.document.id)), "the moved one is skipped");
    for (const t of rest) assert.ok(sent(f.from).some(c => c.ids.includes(t.document.id)), "the others go");
  } finally { f.restore(); }
  const g = fileDrop("d");
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  try {
    const from = F.calls.length;
    tickBy(4500);
    assert.equal(sent(g.from).length, 0, "nothing sent through the shut door");
    const told = F.calls.slice(from).filter(c => c.op === "notify").map(c => c.message);
    assert.ok(told.some(m => /named\.stayed|Stayed where they stand/.test(m)), `named: ${JSON.stringify(told)}`);
    assert.ok(api.status().group.wave.shut >= 1, JSON.stringify(api.status().group.wave));
  } finally { world.walls.pop(); g.restore(); }
});

test("0.9.0 simulator (step 5): members a token come to rest in their way cuts short never rest on each other, in one wave or in two", () => {
  // The simulator's class: H3 and H4 of one wave both cut short before a token standing at the door's mouth since
  // the drop rested inside each other (seed 409); a member of a later wave cut short at a mate a cut left before it (382).
  for (const tag of ["x", "y"]) {
    const f = fileDrop(tag);
    const saved = F.canvas.tokens.placeables;
    const block = makeToken(`b1${tag}Blk000000001`, 400, 500);           // just past the door, since the drop
    F.canvas.tokens.placeables = [...f.ts, block];
    try {
      if (tag === "y") {
        // A mate cut short earlier rests off its start and off its slot: a later wave keeps clear of it too.
        const [first] = f.waiting;
        first.document._source = { ...first.document._source, x: 400, y: 300 };
      }
      tickBy(4500);
      const ends = [{ id: block.document.id, c: center(block.document._source) }];
      for (const t of f.ts) {
        let m = null;
        for (const c of sent(f.from)) m = c.options?.movement?.[t.document.id] ?? m;
        const p = m ? m.waypoints.at(-1) : t.document._source;
        if (!f.now.has(t.document.id)) ends.push({ id: t.document.id, c: center(p) });
      }
      for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
        const d = Math.hypot(ends[i].c.x - ends[j].c.x, ends[i].c.y - ends[j].c.y);
        assert.ok(d >= S - 2, `${tag}: ${ends[i].id} rests on ${ends[j].id}: ${JSON.stringify(ends)}`);
      }
    } finally { F.canvas.tokens.placeables = saved; sceneTokens.delete(block.document.id); f.restore(); }
  }
});

test("0.9.0 the file: no route crosses a token standing outside the drop, and no member rests on it", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("b0sA000000000001", 100, 100), makeToken("b0sB000000000001", 100, 200)];
  const rest = makeToken("b0sR000000000001", 400, 100);
  rest.visible = true;
  const others = keepOnly([...ts, rest]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, rest];
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 600, 0));
    const moves = fileMoves(out, from);
    const c = center(rest.document._source);
    for (const t of ts) {
      const wps = moves[t.document.id].waypoints;
      let prev = center(t.document._source);
      for (const p of wps) { const q = center(p); assert.ok(avoidDist({ x: c.x, y: c.y, r: 99 }, prev, q) >= 99 - 1e-6, `${t.document.id} through the standing token: ${JSON.stringify(wps.map(w => [w.x, w.y]))}`); prev = q; }
      assert.ok(Math.hypot(prev.x - c.x, prev.y - c.y) >= S - 1e-6, "not resting on it");
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of [...ts, rest]) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.9.0 the file: a member with no spot it can reach stays where it stands and is named; the others go; nobody moving at all is \"No route there\"", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("b0nA000000000001", 400, 200), makeToken("b0nB000000000001", 100, 200)];
  const others = keepOnly(ts);
  // B is boxed in where it stands (walls round x 0-300, y 0-300). (0.9.0 step 5: one whose formation spot alone is
  // sealed off now comes along to a spot the drop reaches, file-core candidatesFor.)
  const extra = [[{ x: 0, y: 300 }, { x: 300, y: 300 }], [{ x: 300, y: 0 }, { x: 300, y: 300 }]];
  world.walls.push(...extra);
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(Array.isArray(out));
    const ids = out[0].map(u => u._id);
    assert.deepEqual(ids, [ts[0].document.id], "the grabbed one goes, the sealed-off one stays");
    const told = F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
    assert.ok(told.some(m => /named\.stayed|Stayed where they stand/.test(m)), `named: ${JSON.stringify(told)}`);
    assert.equal(api.status().group.last.stayed.length, 1);
    // Nobody can go: the door shut too.
    world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
    try {
      const f2 = F.calls.length;
      assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null, "nothing moves");
      assert.ok(F.calls.slice(f2).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"), "No route there");
    } finally { world.walls.pop(); }
  } finally {
    world.walls.splice(world.walls.length - extra.length, extra.length);
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/** Let the fight queue's promises and timers run: `ms` of the mocked clock in 10 ms steps, microtasks between. */
async function runFor(ms) {
  for (let t = 0; t < ms; t += 10) { mock.timers.tick(10); for (let i = 0; i < 12; i++) await Promise.resolve(); }
}
/** Hold every move of these tokens until the test settles it: id → [{ waypoints, options, settle(v) }]. */
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

test("0.9.0 fight file: a group drag in a fight walks one member at a time, each a single move routed at its turn, a checkpoint every square, charged exactly", async () => {
  const ts = [makeToken("ffoA000000000001", 400, 200), makeToken("ffoB000000000001", 300, 200)];
  const restore = fightScene(ts);
  const held = holdMoves(ts);
  try {
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null, "nothing moves at the drop");
    assert.equal(api.status().group.last.result, "queue");
    await runFor(100);
    const moves = () => F.calls.slice(from).filter(c => c.op === "move");
    assert.equal(moves().length, 1, "one member at a time");
    const first = moves()[0];
    assert.ok(api.status().group.groups >= 1, "held as one group");
    assert.equal(typeof first.options.pentarynMovementGroup, "string", "tagged as one group (a click on one stops them)");
    held.get(first.id)[0].settle(true);
    await runFor(100);
    assert.equal(moves().length, 2, "the next one goes when the first has walked");
    const second = moves()[1];
    assert.notEqual(second.id, first.id);
    held.get(second.id)[0].settle(true);
    await runFor(100);
    for (const m of moves()) {
      const t = ts.find(x => x.document.id === m.id);
      const start = m.id === first.id ? { x: first.id === ts[0].document.id ? 400 : 300, y: 200 } : { x: second.id === ts[0].document.id ? 400 : 300, y: 200 };
      const path = [wp(start.x, start.y), ...m.waypoints];
      for (let k = 1; k < path.length; k++) {
        assert.equal(Math.max(Math.abs(path[k].x - path[k - 1].x), Math.abs(path[k].y - path[k - 1].y)), S, `${m.id}: one square a step`);
        assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, `${m.id}: through a wall`);
        assert.equal(path[k].checkpoint, true, "a checkpoint every square");
      }
      assert.equal(Token5e.prototype.measureMovementPath.call(t, path).cost, 5 * m.waypoints.length, "charged 5 ft a square");
      assert.ok(center(m.waypoints.at(-1)).y > 400, "past the door");
    }
    const q = api.status().group.queue;
    assert.deepEqual([q.members, q.sent, q.running, q.ended], [2, 2, false, "done"]);
    assert.equal(sent(from).length, 0, "no batched update: each is its own move");
  } finally { restore(); tickBy(60000); }
});

test("0.9.0 fight file: the second member is routed round the first where it came to rest (the tokens standing at its turn), never onto it", async () => {
  // Both dropped into the one square past the door: the grabbed one takes it, the other the nearest clear square.
  const ts = [makeToken("ffrA000000000001", 400, 300), makeToken("ffrB000000000001", 400, 200)];
  const restore = fightScene(ts);
  const held = holdMoves(ts);
  try {
    const from = F.calls.length;
    dropWith(ts[0], contextsFor(ts, 0, 200));
    await runFor(100);
    const moves = () => F.calls.slice(from).filter(c => c.op === "move");
    held.get(moves()[0].id)[0].settle(true);
    await runFor(200);
    assert.equal(moves().length, 2);
    const a = moves()[0], b = moves()[1];
    held.get(b.id)[0].settle(true);
    await runFor(50);
    const restA = center(a.waypoints.at(-1));
    for (const p of b.waypoints) assert.ok(Math.hypot(center(p).x - restA.x, center(p).y - restA.y) >= S - 1, `onto the first: ${JSON.stringify(b.waypoints.map(w => [w.x, w.y]))}`);
  } finally { restore(); tickBy(60000); }
});

test("0.9.0 fight file (simulator, step 5): a member whose formation spot falls off the scene walks to the nearest square the drop reaches, not named", async () => {
  // The simulator's commonest stay in a fight (209 members in 500 seeds): a fight group dragged to a room's edge, the
  // members whose same-delta square lay past it were named "did not move".
  const ts = [makeToken("ffeA000000000001", 700, 100), makeToken("ffeB000000000001", 800, 100)];
  const restore = fightScene(ts);
  const held = holdMoves(ts);
  try {
    const from = F.calls.length;
    const notes = await noticesOf(async () => {
      dropWith(ts[0], contextsFor(ts, 200, 0));            // B's square would be x 1000: off the 1000 px scene
      for (let k = 0; k < 2; k++) {
        await runFor(100);
        const m = F.calls.slice(from).filter(c => c.op === "move").at(-1);
        if (m && held.get(m.id).length) held.get(m.id).at(-1).settle(true);
      }
      await runFor(100);
    });
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    // 0.10 L3 (R6): the leader walks through B, which then stands behind it already: in place, not named.
    const q = api.status().group.queue;
    assert.ok(moves.some(m => m.id === ts[0].document.id), "the grabbed one walks");
    assert.ok(moves.some(m => m.id === ts[1].document.id) || q.there.includes(ts[1].document.id), `the other walks or is in place: ${JSON.stringify(notes)}`);
    assert.ok(!notes.some(n => n.includes?.(ts[1].document.id)), `not named: ${JSON.stringify(notes)}`);
    const a = moves.find(m => m.id === ts[0].document.id).waypoints.at(-1);
    const b = moves.find(m => m.id === ts[1].document.id)?.waypoints.at(-1) ?? { ...ts[1].document._source };
    assert.deepEqual([a.x, a.y], [900, 100], "the grabbed one where it was dropped");
    assert.ok(b.x + S <= 1000 && b.x % S === 0 && b.y % S === 0, `on a whole square on the scene: ${JSON.stringify(b)}`);
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) >= S, `not on the grabbed one: ${JSON.stringify(b)}`);
    assert.ok(Math.hypot(b.x - 1000, b.y - 100) <= 2 * S + 1, `near its formation square: ${JSON.stringify(b)}`);
  } finally { restore(); tickBy(60000); }
});

test("0.9.0 fight file: a stack (a mount and its rider) goes as one entry, the rider walking its mount's way at its offset in the same turn", async () => {
  const mount = makeToken("ffsM000000000001", 100, 100, { size: 2 });
  const rider = makeToken("ffsR000000000001", 100, 100);
  const other = makeToken("ffsO000000000001", 600, 100);
  const restore = fightScene([mount, rider, other]);
  const held = holdMoves([mount, rider, other]);
  try {
    const from = F.calls.length;
    assert.equal(dropWith(mount, contextsFor([mount, rider, other], 200, 0)), null);
    await runFor(100);
    const moves = () => F.calls.slice(from).filter(c => c.op === "move");
    const first = moves().map(m => m.id).sort();
    const stackFirst = first.includes(mount.document.id);
    assert.deepEqual(first, stackFirst ? [mount.document.id, rider.document.id].sort() : [other.document.id], `one entry at a time: ${JSON.stringify(first)}`);
    const settleAll = () => { for (const m of moves()) for (const h of held.get(m.id)) h.settle(true); };
    settleAll();
    await runFor(200);
    settleAll();
    await runFor(200);
    const mv = id => moves().find(m => m.id === id);
    assert.ok(mv(mount.document.id) && mv(rider.document.id) && mv(other.document.id), `everyone walked: ${JSON.stringify(moves().map(m => m.id))} ${JSON.stringify(api.status().group.queue)} ${JSON.stringify(api.status().group.told)}`);
    assert.deepEqual(mv(rider.document.id).waypoints.map(w => [w.x, w.y]), mv(mount.document.id).waypoints.map(w => [w.x, w.y]), "the rider on its mount's way");
    assert.equal(api.status().group.queue.members, 2, "two entries: the stack and the other");
  } finally { restore(); tickBy(60000); }
});

test("0.9.0 fight file gate: the queue ends on a click (stop), a turn change and a deleted member; the members not sent stay, named when the dragger did not end it", async () => {
  const cases = ["click", "turn", "deleted"];
  for (const why of cases) {
    const ts = [makeToken(`ffq${why[0]}A00000000001`, 400, 200), makeToken(`ffq${why[0]}B00000000001`, 300, 200), makeToken(`ffq${why[0]}C00000000001`, 500, 200)];
    const restore = fightScene(ts);
    const held = holdMoves(ts);
    try {
      const from = F.calls.length;
      assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null);
      await runFor(100);
      const moves = () => F.calls.slice(from).filter(c => c.op === "move");
      assert.equal(moves().length, 1, why);
      const walking = sceneTokens.get(moves()[0].id);
      if (why === "click") {
        walking.movement = { id: "mvffq", state: "pending", user: { isSelf: true } };
        const r = await api.stop(walking);
        assert.equal(r.ok, true, JSON.stringify(r));
        assert.ok(F.calls.slice(from).some(c => c.op === "stopMovement" && c.id === walking.id), "the walker stops on the square it holds");
        held.get(walking.id)[0].settle(false);
      } else if (why === "turn") {
        F.Hooks.callAll("updateCombat", { id: "cmb" }, { turn: 1 }, {}, game.user.id);
        held.get(walking.id)[0].settle(true);
      } else {
        const gone = ts.find(t => t.document.id !== walking.id);
        sceneTokens.delete(gone.document.id);
        F.Hooks.callAll("deleteToken", gone.document, {}, game.user.id);
        held.get(walking.id)[0].settle(true);
      }
      walking.movement = { state: "completed", user: { isSelf: true } };
      await runFor(5000);
      assert.equal(moves().length, 1, `${why}: nobody else is sent`);
      const q = api.status().group.queue;
      assert.equal(q.running, false, `${why}: the queue ended`);
      assert.equal(q.ended, why, JSON.stringify(q));
      const named = F.calls.slice(from).filter(c => c.op === "notify" && /named\.notSent|Did not move/.test(c.message));
      if (why === "click") assert.equal(named.length, 0, "a click is the dragger's own doing: no notice");
      else assert.equal(named.length, 1, `${why}: the members not sent are named`);
    } finally { restore(); tickBy(60000); }
  }
});

test("0.9.0 fight file: the watchdog (walk time + 3 s) moves a walk that never ends on to the next member; 0.10 L2: a new drop of another token leaves the queue running", async () => {
  const ts = [makeToken("ffwA000000000001", 400, 200), makeToken("ffwB000000000001", 300, 200), makeToken("ffwE000000000001", 500, 200)];
  const restore = fightScene(ts);
  holdMoves(ts);
  try {
    let from = F.calls.length;
    dropWith(ts[0], contextsFor(ts, 0, 400));
    await runFor(100);
    const moves = () => F.calls.slice(from).filter(c => c.op === "move");
    assert.equal(moves().length, 1);
    // Never settled: about 4 squares at 6 a second, then 3 s.
    await runFor(2500);
    assert.equal(moves().length, 1, "not before the watchdog");
    await runFor(2500);
    assert.equal(moves().length, 2, "the watchdog moved the queue on");
    assert.ok(api.status().group.queue.watchdog >= 1);
    // A new drop of another token (0.10 L2: no longer empties the queue, which then left its members unnamed).
    const c = makeToken("ffwC000000000001", 100, 100);
    F.canvas.tokens.placeables = [...ts, c];
    dropWith(c, contextsFor([c], 100, 0));
    await runFor(6000);
    const q = api.status().group.queue;
    assert.equal(q.ended, "done", `the queue went on to its end: ${JSON.stringify(q)}`);
    assert.equal(moves().filter(m => m.id !== c.document.id).length + q.there.length + q.stayed, 3, "its last member was walked, in place or named");
    sceneTokens.delete(c.document.id);
  } finally { restore(); tickBy(60000); }
});

test("0.9.0 fight file gate: 40 seeded fight group drags (2-4 members, tokens standing): each member's move a square a step with a checkpoint at every square, never through a wall or a token standing at its turn, never resting on one, charged exactly 5 ft a square (0.10 L3: the leader through its own members, no checkpoint inside one)", async () => {
  let walks = 0, stays = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rand = rng(7000 + seed);
    const sq = n => Math.floor(rand() * n) * S;
    const taken = new Set();
    const spot = () => { for (;;) { const p = { x: sq(10), y: sq(8) }; const k = `${p.x},${p.y}`; if (!taken.has(k)) { taken.add(k); return p; } } };
    const tag = String(seed).padStart(3, "0");
    const ms = [];
    for (let k = 0, n = 2 + Math.floor(rand() * 3); k < n; k++) { const p = spot(); ms.push(makeToken(`fg${tag}M${k}00000000`, p.x, p.y)); }
    const stand = [];
    for (let k = 0, n = Math.floor(rand() * 3); k < n; k++) { const p = spot(); stand.push(makeToken(`fg${tag}S${k}00000000`, p.x, p.y)); }
    const restore = fightScene([...ms, ...stand]);
    const all = [...ms, ...stand];
    const log = [];
    for (const t of ms) {
      t.document.move = (waypoints, options) => {
        // What stands at this member's turn: every other token where the server has it.
        const at = all.filter(o => o !== t).map(o => ({ id: o.document.id, member: ms.includes(o), c: center(o.document._source) }));
        log.push({ t, from: { ...t.document._source }, waypoints, at });
        t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
        return Promise.resolve(true);
      };
    }
    const delta = { x: sq(8) - 4 * S, y: sq(8) - 4 * S };
    const why = `seed ${seed}: members ${JSON.stringify(ms.map(t => [t.document._source.x, t.document._source.y]))} standing ${JSON.stringify(stand.map(t => [t.document._source.x, t.document._source.y]))} delta ${JSON.stringify(delta)}`;
    try {
      const from = F.calls.length;
      dropWith(ms[0], contextsFor(ms, delta.x, delta.y));
      for (let i = 0; i < 40 && api.status().group.queue?.running; i++) await runFor(50);
      const q = api.status().group.queue;
      assert.equal(q?.running, false, `${why}: the queue ended`);
      assert.equal(q.watchdog, 0, `${why}: no walk needed the watchdog`);
      for (const m of log) {
        walks += 1;
        const path = [m.from, ...m.waypoints];
        // 0.10 L3 (R6): the leader (the grabbed one) passes through its own members; its updates end on free squares.
        const lead = m.t === ms[0];
        for (let k = 1; k < path.length; k++) {
          const a = path[k - 1], b = path[k];
          assert.equal(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)), S, `${why}: ${m.t.document.id} one square a step`);
          const inMember = lead && m.at.some(o => o.member && Math.hypot(center(b).x - o.c.x, center(b).y - o.c.y) < S - 1e-6);
          assert.equal(b.checkpoint, !inMember, `${why}: a checkpoint every free square`);
          assert.equal(crossing(center(a), center(b)).length, 0, `${why}: ${m.t.document.id} step ${k} through a wall`);
          for (const o of m.at) {
            if (lead && o.member) continue;
            assert.ok(avoidDist({ x: o.c.x, y: o.c.y, r: 99 }, center(a), center(b)) >= 99 - 1e-6, `${why}: ${m.t.document.id} step ${k} into ${o.id} standing at its turn`);
          }
        }
        assert.equal(Token5e.prototype.measureMovementPath.call(m.t, path).cost, 5 * m.waypoints.length, `${why}: charged 5 ft a square`);
      }
      // Every member walked, or was named.
      const walked = new Set(log.map(m => m.t.document.id));
      const named = F.calls.slice(from).filter(c => c.op === "notify" && /Stayed where they stand|named\.stayed/.test(c.message)).map(c => c.message).join(" ");
      // The leader with no way: nobody moves, "No route there" (0.10 R10).
      const noRoute = q.ended === "noRoute";
      if (noRoute) {
        assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"), `${why}: No route there`);
        assert.equal(log.length, 0, `${why}: nobody moves`);
      }
      for (const t of ms) {
        const still = (delta.x === 0 && delta.y === 0) || noRoute;
        // (0.10 L1: one already on its square, a leader dropped where it cannot stand whose nearest clear square is its
        // own, is in place: queue.there.)
        if (!walked.has(t.document.id) && !still) { stays += 1; assert.ok(named.includes(t.document.id) || q.skipped || q.there.includes(t.document.id), `${why}: ${t.document.id} neither walked nor named`); }
      }
      // Nobody rests on anybody.
      for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
        const a = center(all[i].document._source), b = center(all[j].document._source);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= S - 1e-6, `${why}: ${all[i].document.id} rests on ${all[j].document.id}`);
      }
    } finally { restore(); tickBy(60000); }
  }
  assert.ok(walks >= 40, `walked: ${walks}, stayed: ${stays}`);
});

test("0.9.0 / 0.10 R11: a group drag in a fight of more than the cap (24, was 12) is refused with a notice; nothing moves", () => {
  assert.equal(api.status().group.limits.maxMembers, 24, "the cap is 24");
  const ts = [];
  for (let k = 0; k < 25; k++) ts.push(makeToken(`ffx${String(k).padStart(2, "0")}00000000001`, (k % 9) * S, 100 + Math.floor(k / 9) * S));
  const restore = fightScene(ts);
  try {
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], contextsFor(ts, 0, 100)), null);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.fightGroup"));
    assert.deepEqual([api.status().group.last.mode, api.status().group.last.reason], ["refused", "fightGroup"]);
  } finally { restore(); tickBy(60000); }
});

/* -------------------------------------------- */
/*  0.10 L3: the fight (R6, R7)                 */
/* -------------------------------------------- */

/** dnd5e's movement types, as the system's ruler reads them (walk has no walk fallback; swim / climb do). */
F.CONFIG.DND5E ??= { movementTypes: { walk: {}, fly: {}, burrow: {}, swim: { walkFallback: true }, climb: { walkFallback: true } } };
/** Give a token's actor a walking speed (ft) and a movement history this turn of `spent` ft (one waypoint). */
function withSpeed(t, walk, spent = 0) {
  t.document.actor = { system: { isCreature: true, attributes: { movement: { speeds: { walk, fly: 0, swim: 0, climb: 0, burrow: 0 } } } } };
  t.document.movementHistory = spent > 0 ? [{ x: 0, y: 0, cost: 0 }, { x: 0, y: 0, cost: spent }] : [];
  return t;
}
function noSpeed(t) { delete t.document.actor; delete t.document.movementHistory; return t; }
/** Settle every held move of these tokens at its end, until the queue ends (or `max` rounds). */
async function settleQueue(held, max = 60) {
  for (let i = 0; i < max && api.status().group.queue?.running; i++) {
    for (const list of held.values()) for (const h of list) if (!h.done) { h.done = true; h.settle(true); }
    await runFor(60);
  }
}

test("0.10 L3 (R6, R7): in a fight the leader walks first, through its own members standing in its lane (charged 5 ft a square, as with nobody there); its updates end on free squares only; then the others, least walk left first", async () => {
  const run = async lane => {
    const L = makeToken(`f3l${lane ? "L" : "O"}L00000000001`, 100, 100);
    const A = makeToken(`f3l${lane ? "L" : "O"}A00000000001`, lane ? 200 : 100, lane ? 100 : 200);
    const B = makeToken(`f3l${lane ? "L" : "O"}B00000000001`, lane ? 300 : 200, lane ? 100 : 200);
    const ts = [L, A, B];
    const restore = fightScene(ts);
    const held = holdMoves(ts);
    try {
      const from = F.calls.length;
      assert.equal(dropWith(L, contextsFor(ts, 500, 0)), null);
      await runFor(100);
      const moves = () => F.calls.slice(from).filter(c => c.op === "move");
      assert.equal(moves().length, 1);
      const lead = moves()[0];
      assert.equal(lead.id, L.document.id, "the leader walks first");
      assert.ok(Array.isArray(lead.options.pentarynMovementLead) && lead.options.pentarynMovementLead[0] === L.document.id, "its move names it the leader (drawn on top)");
      // Its next square through a member is sent (R6): the per-square test leaves its own members out.
      L.document.rendered = true;
      const through = moveOp("mvF3L00000000001", { x: 100, y: 100 }, { x: 300, y: 100 }, { chain: [] });
      through.method = "api";
      assert.notEqual(F.fireCall("preMoveToken", L.document, through, { pentarynMovementFile: true }), false, "through its own members: sent");
      delete L.document.rendered;
      const wps = lead.waypoints;
      assert.deepEqual(wps.map(w => w.x), [200, 300, 400, 500, 600], "straight through");
      for (const w of wps) {
        const inside = lane && (w.x === 200 || w.x === 300);
        assert.equal(w.checkpoint, !inside, `${w.x}: a checkpoint only on a free square`);
      }
      assert.equal(costOf(L, wp(100, 100), wps), 25, "5 ft a square, nothing for its members");
      await settleQueue(held);
      const order = moves().map(m => m.id);
      // B (two squares nearer the drop) before A.
      assert.deepEqual(order, [L.document.id, B.document.id, A.document.id], "the leader, then least walk left");
      for (const m of moves().slice(1)) {
        const t = ts.find(x => x.document.id === m.id);
        for (const w of m.waypoints) assert.equal(w.checkpoint, true, "a member: a checkpoint every square");
        assert.ok(center(m.waypoints.at(-1)).x < 600, `${m.id} rests behind the leader`);
        void t;
      }
      const q = api.status().group.queue;
      assert.deepEqual([q.ended, q.sent], ["done", 3]);
      return costOf(L, wp(100, 100), wps);
    } finally { restore(); tickBy(60000); }
  };
  assert.equal(await run(true), await run(false), "the leader's charge is the same with and without its members in its way");
});

test("0.10 L3 gate: 60 seeded fight queues: the leader, then least walk left; every member charged exactly 5 ft a square, the leader the same with and without members in its way; nobody through or onto a standing non-member", async () => {
  let walks = 0, leaderThrough = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const rand = rng(31000 + seed);
    const sq = n => Math.floor(rand() * n) * S;
    const play = async (ms0, stand0, spread) => {
      const tag = `${String(seed).padStart(3, "0")}${spread ? "s" : "x"}`;
      const ms = ms0.map((p, k) => makeToken(`f3g${tag}M${k}000000`, p.x, p.y));
      const stand = stand0.map((p, k) => makeToken(`f3g${tag}S${k}000000`, p.x, p.y));
      const all = [...ms, ...stand];
      const restore = fightScene(all);
      const log = [];
      for (const t of ms) {
        t.document.move = (waypoints, options) => {
          log.push({ t, from: { ...t.document._source }, waypoints, at: all.filter(o => o !== t).map(o => ({ id: o.document.id, member: ms.includes(o), c: center(o.document._source) })) });
          t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
          return Promise.resolve(true);
        };
      }
      try {
        dropWith(ms[0], contextsFor(ms, 600, 0));
        for (let i = 0; i < 60 && api.status().group.queue?.running; i++) await runFor(50);
        return { log, q: api.status().group.queue, ms };
      } finally { restore(); tickBy(60000); }
    };
    // Members on the left (x 0-300), the leader first; a few tokens standing elsewhere; dropped 6 squares east.
    const taken = new Set();
    const spot = (x0, w) => { for (;;) { const p = { x: x0 + sq(w), y: sq(4) }; const k = `${p.x},${p.y}`; if (!taken.has(k)) { taken.add(k); return p; } } };
    const n = 2 + Math.floor(rand() * 4);
    const L0 = spot(0, 1);
    const lane = [];
    for (let k = 1; k < n; k++) lane.push(rand() < 0.5 ? (() => { for (let x = 100; x <= 300; x += 100) { const kk = `${x},${L0.y}`; if (!taken.has(kk)) { taken.add(kk); return { x, y: L0.y }; } } return spot(0, 4); })() : spot(0, 4));
    const stand = Array.from({ length: Math.floor(rand() * 3) }, () => spot(700, 3));
    const why = `seed ${seed}: leader ${JSON.stringify(L0)} members ${JSON.stringify(lane)} standing ${JSON.stringify(stand)}`;
    const a = await play([L0, ...lane], stand, false);
    if (a.q.ended === "noRoute") continue;
    // The same drop with the members off the leader's lane (moved one row down where free): the leader's charge.
    const off = lane.map(p => (p.y === L0.y ? { x: p.x, y: p.y + 100 } : p));
    const freeOff = off.every((p, k) => !off.some((q, j) => j !== k && q.x === p.x && q.y === p.y) && !(p.x === L0.x && p.y === L0.y) && !stand.some(q => q.x === p.x && q.y === p.y));
    const b = freeOff ? await play([L0, ...off], stand, true) : null;
    const leadA = a.log.find(m => m.t === a.ms[0]);
    assert.ok(leadA, `${why}: the leader walked`);
    assert.equal(a.log[0].t, a.ms[0], `${why}: the leader first`);
    if (b) {
      const leadB = b.log.find(m => m.t === b.ms[0]);
      assert.equal(costOf(a.ms[0], leadA.from, leadA.waypoints), costOf(b.ms[0], leadB.from, leadB.waypoints), `${why}: the leader's charge with and without its members in its way`);
    }
    // The order: the leader, then least walk left (the queue's own record of it).
    assert.deepEqual(a.q.order?.[0], a.ms[0].document.id, `${why}: queue order ${JSON.stringify(a.q.order)}`);
    for (const m of a.log) {
      walks += 1;
      const path = [m.from, ...m.waypoints];
      const isLead = m.t === a.ms[0];
      assert.equal(costOf(m.t, m.from, m.waypoints), 5 * path.slice(1).reduce((s, p, k) => s + Math.max(Math.abs(p.x - path[k].x), Math.abs(p.y - path[k].y)) / S, 0), `${why}: ${m.t.document.id} charged 5 ft a square`);
      for (let k = 1; k < path.length; k++) {
        const p0 = path[k - 1], p1 = path[k];
        assert.equal(Math.max(Math.abs(p1.x - p0.x), Math.abs(p1.y - p0.y)), S, `${why}: one square a step`);
        for (const o of m.at) {
          const d = avoidDist({ x: o.c.x, y: o.c.y, r: 99 }, center(p0), center(p1));
          if (o.member && isLead) { if (d < 99 - 1e-6) leaderThrough += 1; continue; }
          assert.ok(d >= 99 - 1e-6, `${why}: ${m.t.document.id} step ${k} into ${o.id} standing at its turn`);
        }
        // Its updates end only on free squares: a waypoint inside a member at rest is no checkpoint.
        const inside = m.at.some(o => Math.hypot(center(p1).x - o.c.x, center(p1).y - o.c.y) < S - 1e-6);
        if (inside) assert.equal(p1.checkpoint, false, `${why}: a checkpoint inside a member`);
      }
    }
  }
  console.log(`# L3 fight gate: ${walks} walks in 60 queues, the leader through its own members on ${leaderThrough} steps`);
  assert.ok(walks >= 120, `walks ${walks}`);
  assert.ok(leaderThrough >= 10, `the leader walked through its members ${leaderThrough} times`);
});

test("0.10 L3 gate (R7): 200 seeded speed stops: a group member whose speed runs out rests on the last free square its movement pays for, never one past it; one with no usable speed walks the whole way", async () => {
  let short = 0, whole = 0, none = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(41000 + seed);
    const n = 2 + Math.floor(rand() * 3);
    const tag = String(seed).padStart(3, "0");
    const ms = Array.from({ length: n }, (_, k) => makeToken(`f3s${tag}M${k}000000`, (k % 2) * S, Math.floor(k / 2) * S));
    const speeds = ms.map(() => (rand() < 0.15 ? null : 5 * (1 + Math.floor(rand() * 8))));
    const spent = ms.map(() => (rand() < 0.4 ? 5 * Math.floor(rand() * 4) : 0));
    ms.forEach((t, k) => (speeds[k] === null ? noSpeed(t) : withSpeed(t, speeds[k], spent[k])));
    const restore = fightScene(ms);
    const log = [];
    for (const t of ms) {
      t.document.move = (waypoints, options) => {
        log.push({ t, from: { ...t.document._source }, waypoints });
        t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
        return Promise.resolve(true);
      };
    }
    const why = `seed ${seed}: speeds ${JSON.stringify(speeds)} spent ${JSON.stringify(spent)}`;
    try {
      const from = F.calls.length;
      dropWith(ms[0], contextsFor(ms, 700, 0));
      for (let i = 0; i < 60 && api.status().group.queue?.running; i++) await runFor(50);
      const q = api.status().group.queue;
      assert.equal(q.running, false, `${why}: the queue ended`);
      for (const [k, t] of ms.entries()) {
        const w = q.walks.find(x => x.id === t.document.id);
        const m = log.find(x => x.t === t);
        const left = speeds[k] === null ? null : Math.max(0, speeds[k] - spent[k]);
        if (!w) {
          // In place already (its square behind a leader that stopped short is the one it stands on), or named.
          assert.ok(q.there.includes(t.document.id) || F.calls.slice(from).some(c => c.op === "notify" && c.message.includes(t.document.id)), `${why}: ${t.document.id} neither walked, in place nor named ${JSON.stringify(q)}`);
          continue;
        }
        if (left === null) {
          assert.equal(w.left, null, why);
          assert.equal(w.sent, w.planned, `${why}: no usable speed: the whole way`);
          whole += 1;
        } else {
          assert.equal(w.left, left, `${why}: the movement left: dnd5e's speed less the history's cost`);
          const cost = m ? costOf(t, m.from, m.waypoints) : 0;
          assert.ok(cost <= left, `${why}: ${t.document.id} walked ${cost} ft of ${left}`);
          // Never one past it, and never short of what it pays for: the last free square within its movement.
          if (w.sent < w.planned) {
            short += 1;
            assert.equal(w.why, "speed", why);
            if (t !== ms[0]) assert.equal(cost, 5 * Math.floor(left / 5), `${why}: ${t.document.id} stopped short of its movement`);
            else assert.ok(cost > left - 5 * (1 + w.inside), `${why}: the leader stopped short of its movement`);
          }
          if (!m) {
            none += 1;
            // (The leader's first squares inside its own members: the last free square before them is its start.)
            assert.ok(left < 5 || w.planned === 0 || (t === ms[0] && w.inside > 0), `${why}: ${t.document.id} did not move with ${left} ft left`);
            if (w.why === "speed") assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message.includes(t.document.id)), `${why}: ${t.document.id} named`);
          }
        }
      }
      // Nobody rests on anybody.
      for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
        const a = center(ms[i].document._source), b = center(ms[j].document._source);
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= S - 1e-6, `${why}: ${ms[i].document.id} rests on ${ms[j].document.id}`);
      }
    } finally { restore(); for (const t of ms) noSpeed(t); tickBy(60000); }
  }
  console.log(`# L3 speed gate: 200 drops, ${short} members stopped where their movement ran out (${none} did not move), ${whole} with no usable speed walked the whole way`);
  assert.ok(short >= 60 && whole >= 20 && none >= 5, `short ${short}, whole ${whole}, none ${none}`);
});

test("0.10 L3 (R7): a single drag in a fight is unchanged: with 10 ft left it still walks the whole way, square by square (as 0.9.0)", () => {
  combatFlag = true;
  const t = withSpeed(makeToken("f3single00000001", 100, 100), 15, 5);
  const others = keepOnly([t]);
  try {
    const out = dropWith(t, contextsFor([t], 600, 0));
    const wps = out[1].movement[t.document.id].waypoints;
    assert.equal(wps.at(-1).x, 700, "to the drop square");
    assert.equal(wps.length, 6, "a checkpoint every square");
    assert.equal(costOf(t, wp(100, 100), wps), 30);
  } finally {
    noSpeed(t);
    combatFlag = false;
    sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10 L1 (R13): planGroup is the leader plan's dry run: dropped on the floor a march, the leader on the drop square and the rest behind it, each member's route; nothing moves", () => {
  F.canvas.ready = true;
  const ts = [makeToken("l1pA000000000001", 400, 200), makeToken("l1pB000000000001", 300, 200), makeToken("l1pC000000000001", 500, 200)];
  const others = keepOnly(ts);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  try {
    const from = F.calls.length;
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 700 });
    assert.deepEqual([r.ok, r.result, r.shape, r.leader, r.target], [true, "plan", "march", ts[0].document.id, null]);
    assert.ok(r.searches >= 3 && r.searches <= 4 && r.failed <= 1, `about one search a member: ${r.searches} / ${r.failed}`);
    const by = Object.fromEntries(r.members.map(m => [m.id, m]));
    assert.deepEqual(by[ts[0].document.id].slot, { x: 400, y: 700 }, "the leader on the drop square");
    for (const t of ts.slice(1)) {
      const m = by[t.document.id];
      assert.equal(m.stay, null);
      assert.ok(m.slot.y < 700, `${t.document.id} behind the leader (it came from the north): ${JSON.stringify(m.slot)}`);
      assert.deepEqual(m.route.at(-1), m.slot, `its route ends on its slot: ${JSON.stringify(m)}`);
      assert.equal(m.waypoints, m.route.length);
    }
    assert.equal(sent(from).length, 0);
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10.2 the door plug on the board: six dropped two squares past the door in the wall at y = 400 all come in, beside and behind the leader, none ahead; planGroup names the plug (0.10.1: two inside)", () => {
  F.canvas.ready = true;
  const ts = [[400, 300], [300, 300], [500, 300], [300, 200], [400, 200], [500, 200]].map(([x, y], k) => makeToken(`plugT${k}0000000001`.slice(0, 16), x, y));
  const others = keepOnly(ts);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  try {
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 500 });
    assert.deepEqual([r.ok, r.result, r.shape], [true, "plan", "march"]);
    assert.ok(r.plug && r.plug.past > 0 && r.plug.past <= 4 && r.plug.inside >= 5, `the plug opens: ${JSON.stringify(r.plug)}`);
    const by = Object.fromEntries(r.members.map(m => [m.id, m]));
    assert.deepEqual(by[ts[0].document.id].slot, { x: 400, y: 500 }, "the leader on the drop square");
    const inside = r.members.filter(m => !m.stay && m.slot.y >= 400);
    assert.equal(inside.length, 6, `all six inside: ${JSON.stringify(r.members.map(m => m.slot))}`);
    for (const m of r.members) assert.ok(m.slot.y <= 500, `${m.id} not ahead of the leader: ${JSON.stringify(m.slot)}`);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

test("0.10 L1 (R2): dropped on a token outside the group that this client sees: a swarm round it, the leader touching it first; on a hidden one: a march, never a swarm", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("l1sA000000000001", 100, 100), makeToken("l1sB000000000001", 100, 200), makeToken("l1sC000000000001", 200, 100)];
  const T = makeToken("l1sT000000000001", 700, 200);
  T.visible = true;
  const others = keepOnly([...ts, T]);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, T];
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 600, 100));
    const last = api.status().group.last;
    assert.deepEqual([last.shape, last.leader, last.target], ["swarm", ts[0].document.id, T.document.id]);
    assert.ok(Number.isFinite(last.plan.searches) && Number.isFinite(last.plan.failed) && Number.isFinite(last.plan.timingMs), JSON.stringify(last.plan));
    const moves = fileMoves(out, from);
    const c = center(T.document._source);
    for (const t of ts) {
      const end = center(moves[t.document.id].waypoints.at(-1));
      const ring = Math.max(Math.abs(end.x - c.x), Math.abs(end.y - c.y)) / S;
      assert.ok(ring > 0.99 && ring < 1.01, `${t.document.id} touches the target: ${JSON.stringify(end)}`);
    }
    tickBy(60000);
    for (const t of ts) { t.document._source.x = t.document.x; t.document._source.y = t.document.y; }
    // Hidden: never a swarm (the player does not know it is there; the GM would walk round it).
    T.document.hidden = true;
    dropWith(ts[0], contextsFor(ts, 600, 100));
    const l2 = api.status().group.last;
    assert.deepEqual([l2.shape, l2.target], ["march", null], "a hidden token never makes a swarm");
  } finally {
    delete T.document.hidden;
    F.canvas.tokens.placeables = saved;
    for (const t of [...ts, T]) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.10 L1 tunnel repro on the board: three dragged deep into a one-wide corridor line up behind the leader, nobody named, about one search a member", () => {
  combatFlag = false;
  clock.step = 0;
  // The door at x 400-500 continued south as a one-wide corridor to the scene's edge.
  const extra = [[{ x: 400, y: 400 }, { x: 400, y: 1000 }], [{ x: 500, y: 400 }, { x: 500, y: 1000 }]];
  world.walls.push(...extra);
  const ts = [makeToken("l1tA000000000001", 400, 200), makeToken("l1tB000000000001", 300, 200), makeToken("l1tC000000000001", 500, 200)];
  const others = keepOnly(ts);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 700));
    assert.ok(Array.isArray(out), "planned at the drop");
    const last = api.status().group.last;
    assert.deepEqual(last.stayed, [], `nobody named: ${JSON.stringify(last)}`);
    assert.ok(last.plan.searches <= 4, `searches: ${last.plan.searches}`);
    const moves = fileMoves(out, from);
    const ends = ts.map(t => moves[t.document.id].waypoints.at(-1));
    assert.deepEqual([ends[0].x, ends[0].y], [400, 900], "the leader at the far end");
    assert.deepEqual(ends.slice(1).map(e => [e.x, e.y]).sort((a, b) => b[1] - a[1]), [[400, 800], [400, 700]], "a line behind it");
    for (const t of ts) {
      const path = [t.document._source, ...moves[t.document.id].waypoints];
      for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, `${t.document.id} leg ${k} crosses a wall`);
    }
  } finally {
    world.walls.splice(world.walls.length - extra.length, extra.length);
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.10 L2 (R5, R6) on the board: the leader goes in the drop's own update naming itself the leader (drawn on top), the pack one wave later, single file through the door and down the one-wide way", () => {
  combatFlag = false;
  clock.step = 0;
  const extra = [[{ x: 400, y: 400 }, { x: 400, y: 1000 }], [{ x: 500, y: 400 }, { x: 500, y: 1000 }]];
  world.walls.push(...extra);
  const ts = [makeToken("l2tA000000000001", 400, 200), makeToken("l2tB000000000001", 300, 200), makeToken("l2tC000000000001", 500, 200)];
  const others = keepOnly(ts);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 700));
    assert.ok(Array.isArray(out), "planned at the drop");
    assert.deepEqual(out[0].map(u => u._id), [ts[0].document.id], "only the leader in the drop's own update");
    assert.deepEqual(out[1].pentarynMovementLead, [ts[0].document.id], "its move names it the leader (every client draws it on top)");
    const last = api.status().group.last;
    assert.equal(last.plan.pack, 150, "the pack one wave after the leader");
    const moves = fileMoves(out, from);
    const waves = ts.slice(1).map(t => moves[t.document.id].wave).sort();
    assert.ok(waves[0] >= 1 && waves[1] > waves[0], `one through the door at a time: waves ${waves}`);
    for (const t of ts.slice(1)) assert.equal(moves[t.document.id].options?.pentarynMovementLead, undefined, "a wave names no leader");
    assert.ok(last.plan.total <= 4000);
  } finally {
    world.walls.splice(world.walls.length - extra.length, extra.length);
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.9.0 planGroup(refs, point): the plan as a dry run (each member's slot, waypoints, why it stays); nothing moves", () => {
  F.canvas.ready = true;
  const ts = [makeToken("b0rA000000000001", 400, 200), makeToken("b0rB000000000001", 300, 200)];
  const others = keepOnly(ts);
  try {
    const from = F.calls.length;
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 600 });
    assert.equal(r.ok, true);
    assert.equal(r.result, "plan");
    assert.equal(r.members.length, 2);
    assert.deepEqual(r.members[0].slot, { x: 400, y: 600 });
    assert.ok(r.members.every(m => m.waypoints >= 1 && m.stay === null), JSON.stringify(r.members));
    assert.equal(sent(from).length, 0);
    assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
    assert.deepEqual(api.planGroup(ts.map(t => t.document), { x: "x" }).code, "BAD_ARGS");
  } finally {
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
  }
});

/* -------------------------------------------- */
/*  0.10 R9: narrow ways in a fight (Joe's S05, the spiral C stair)              */
/* -------------------------------------------- */

const S05 = JSON.parse(readFileSync(new URL("./fixtures/narrow-stations.json", import.meta.url), "utf8")).stations.find(s => s.id === "S05");
/** S05's walls (pixels, the default scenario) on a canvas big enough; returns the restore. */
function onStair() {
  const old = { walls: world.walls, rect: F.canvas.dimensions };
  world.walls = S05.walls.filter(w => !w.only).map(w => [{ x: w.c[0] * S, y: w.c[1] * S }, { x: w.c[2] * S, y: w.c[3] * S }]);
  F.canvas.dimensions = { rect: { x: 0, y: 0, width: 2500, height: 5000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2500 && y <= 5000 } };
  F.fire("updateWall");
  return () => { world.walls = old.walls; F.canvas.dimensions = old.rect; F.fire("updateWall"); };
}
/** The stair's centre-line error (px) at a centre: half the difference of its distances to the two curved walls, and its width there. */
function stairLine(p) {
  const chain = grp => Math.min(...S05.walls.filter(w => w.grp === grp).map(w => {
    const a = { x: w.c[0] * S, y: w.c[1] * S }, b = { x: w.c[2] * S, y: w.c[3] * S };
    const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0), 1);
    return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
  }));
  const di = chain("S05.stair.in"), dout = chain("S05.stair.out");
  return { err: Math.abs(di - dout) / 2, width: di + dout };
}
const minWall = p => Math.min(...world.walls.map(([a, b]) => {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.min(Math.max(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0), 1) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}));

test("0.10 R9 fight: a group of four over the spiral C stair — the leader first, then one at a time, each walk through the stair on its centre line, checkpoints where it enters a square; charged core's measure (double only in a painted mud region); nobody at rest on another", async () => {
  const done = onStair();
  const ts = S05.tokens.filter(t => t.w === 1).map((t, k) => noSpeed(makeToken(`r9f${k}00000000001`, t.x * S, t.y * S)));
  const restore = fightScene(ts);
  const log = [];
  for (const t of ts) {
    t.document.move = (waypoints, options) => {
      log.push({ t, from: { ...t.document._source }, waypoints });
      t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
      return Promise.resolve(true);
    };
  }
  try {
    // The leader (Hero 1, 800, 3300) dropped in room B (600, 4400).
    assert.equal(dropWith(ts[0], contextsFor(ts, -200, 1100)), null);
    for (let i = 0; i < 80 && api.status().group.queue?.running; i++) await runFor(50);
    const q = api.status().group.queue;
    assert.equal(q.ended, "done", JSON.stringify(q));
    assert.equal(log[0].t, ts[0], "the leader walks first");
    assert.equal(new Set(log.map(m => m.t)).size, 4, "all four walked, one at a time");
    const mudIn = p => {
      // Joe's mud region (S05 scenario mud) over the whole stair: a polygon in squares.
      const pts = S05.regions[0].shape.points;
      let inside = false;
      for (let k = 0, j = pts.length / 2 - 1; k < pts.length / 2; j = k++) {
        const xi = pts[2 * k] * S, yi = pts[2 * k + 1] * S, xj = pts[2 * j] * S, yj = pts[2 * j + 1] * S;
        if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    };
    for (const m of log) {
      const path = [m.from, ...m.waypoints];
      assert.ok(path.some(w => w.x > 1300), `${m.t.document.id} walks over the stair`);
      for (let k = 1; k < path.length; k++) {
        assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, `${m.t.document.id} step ${k} through a wall`);
        const off = path[k].x % S !== 0 || path[k].y % S !== 0;
        if (!off) continue;
        // Off the grid (the narrow way): 0.15 square clear, within 0.05 square of the centre line where narrower
        // than the token, and a checkpoint only where it enters a new square (or at its end).
        const c = center(path[k]);
        assert.ok(minWall(c) >= 14.8, `${m.t.document.id} at ${c.x},${c.y}: ${minWall(c)} px clear`);
        const line = stairLine(c);
        if (line.width < S && c.x > 1020) assert.ok(line.err <= 5, `${m.t.document.id} at ${c.x},${c.y}: ${line.err} px off the centre line`);
        const same = cell(center(path[k - 1])).i === cell(c).i && cell(center(path[k - 1])).j === cell(c).j;
        if (k < path.length - 1) assert.equal(path[k].checkpoint, !same, `${m.t.document.id} waypoint ${k}`);
      }
      // Charged exactly core's measure: 5 ft a square entered; in the mud, each square entered inside it twice.
      const plain = costOf(m.t, m.from, m.waypoints);
      let entered = 0, mud = 0;
      for (let k = 1; k < path.length; k++) {
        const a = cell(center(path[k - 1])), b = cell(center(path[k]));
        const n = Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));
        entered += n;
        if (n && mudIn(center(path[k]))) mud += n;
      }
      assert.equal(plain, 5 * entered, "5 ft a square, nothing for the narrowness");
      const orig = Token5e.prototype.measureMovementPath;
      Token5e.prototype.measureMovementPath = function (wps) {
        let cost = 0;
        for (let k = 1; k < wps.length; k++) {
          const a = cell(center(wps[k - 1])), b = cell(center(wps[k]));
          cost += Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j)) * 5 * (mudIn(center(wps[k])) ? 2 : 1);
        }
        return { cost, distance: cost };
      };
      try { assert.equal(costOf(m.t, m.from, m.waypoints), plain + 5 * mud, "double only inside the mud"); }
      finally { Token5e.prototype.measureMovementPath = orig; }
    }
    // At rest: nobody on another, all in room B, the leader in front.
    const ends = ts.map(t => center(t.document._source));
    for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) assert.ok(Math.hypot(ends[a].x - ends[b].x, ends[a].y - ends[b].y) >= 98, "no overlap at rest");
    for (const e of ends) assert.ok(e.y > 4200 && e.x < 1000, `rests in room B: ${JSON.stringify(e)}`);
  } finally { restore(); done(); tickBy(60000); }
});

test("0.10 R9 fight: a leader whose speed runs out on the stair stops part-way, off the grid, on the centre line; the group dropped mid-stair forms a line behind it", async () => {
  const done = onStair();
  const ts = S05.tokens.filter(t => t.w === 1).map((t, k) => makeToken(`r9s${k}00000000001`, t.x * S, t.y * S));
  withSpeed(ts[0], 40);                                   // 8 squares: room A to part-way up the stair
  for (const t of ts.slice(1)) noSpeed(t);
  const restore = fightScene(ts);
  const log = [];
  for (const t of ts) {
    t.document.move = (waypoints, options) => {
      log.push({ t, from: { ...t.document._source }, waypoints });
      t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
      return Promise.resolve(true);
    };
  }
  try {
    assert.equal(dropWith(ts[0], contextsFor(ts, -200, 1100)), null);
    for (let i = 0; i < 80 && api.status().group.queue?.running; i++) await runFor(50);
    const lead = log.find(m => m.t === ts[0]);
    const end = lead.waypoints.at(-1);
    const c = center(end);
    assert.ok(end.x % S !== 0 || end.y % S !== 0, `off the grid: ${end.x}, ${end.y}`);
    assert.ok(c.x > 1020, "on the stair");
    assert.ok(minWall(c) >= 14.8, `${minWall(c)} px clear`);
    const line = stairLine(c);
    assert.ok(line.width >= S || line.err <= 5, `${line.err} px off the centre line`);
    const w = api.status().group.queue.walks.find(x => x.id === ts[0].document.id);
    assert.equal(w.why, "speed");
    assert.ok(costOf(ts[0], lead.from, lead.waypoints) <= 40, "never past what its movement pays for");
    // The others (no speed: the whole way) queue behind it along the stair, one token apart, none on another.
    const rest = ts.map(t => center(t.document._source));
    for (let a = 0; a < rest.length; a++) for (let b = a + 1; b < rest.length; b++) assert.ok(Math.hypot(rest[a].x - rest[b].x, rest[a].y - rest[b].y) >= 98, `no overlap at rest ${a} ${b}`);
  } finally { restore(); done(); tickBy(60000); }
});

test("0.10 R9: a group of four over the spiral C stair out of combat — the leader in the drop's update, the rest a wave later and filing behind it over the stair; dropped mid-stair, they rest on the centre line behind it, one token apart", () => {
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  try {
    for (const [name, dx, dy, mid] of [["roomB", -200, 1100, false], ["midStair", 750, 450, true]]) {
      const ts = S05.tokens.filter(t => t.w === 1).map((t, k) => makeToken(`r9g${name.slice(0, 2)}${k}0000000001`, t.x * S, t.y * S));
      for (const t of ts) { t.visible = true; sceneTokens.set(t.document.id, t.document); }
      F.canvas.tokens.placeables = [...ts];
      const from = F.calls.length;
      // Mid-stair: the leader (Hero 1, top-left 800, 3300) dropped on the square whose centre (1600, 3800) lies in the
      // stair beside the narrowest point: it rests on the centre line there.
      const out = dropWith(ts[0], contextsFor(ts, dx, dy));
      const plan = api.status().group.last;
      assert.equal(plan.shape, "march", name);
      const by = fileMoves(out, from);
      assert.equal(by[ts[0].document.id]?.wave, 0, `${name}: the leader goes in the drop's own update`);
      const ends = [];
      for (const t of ts) {
        const m = by[t.document.id];
        assert.ok(m?.waypoints?.length, `${name}: ${t.document.id} moves (stayed: ${JSON.stringify(plan.stayed)})`);
        const path = [{ ...t.document._source }, ...m.waypoints];
        for (let k = 1; k < path.length; k++) assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, `${name}: ${t.document.id} through a wall`);
        for (const w of m.waypoints) if (center(w).x > 1020) assert.ok(minWall(center(w)) >= 14.8, `${name}: ${t.document.id} at ${JSON.stringify(center(w))}`);
        if (t !== ts[0]) assert.ok(m.wave >= 1, `${name}: ${t.document.id} after the leader`);
        assert.ok(path.some(w => w.x > 1100), `${name}: ${t.document.id} over the stair`);
        ends.push(center(m.waypoints.at(-1)));
      }
      for (let a = 0; a < ends.length; a++) for (let b = a + 1; b < ends.length; b++) assert.ok(Math.hypot(ends[a].x - ends[b].x, ends[a].y - ends[b].y) >= 98, `${name}: no overlap at rest`);
      if (mid) {
        // The leader on the centre line at the narrowest; the next members on the stair behind it, on its centre line.
        const line = stairLine(ends[0]);
        assert.ok(line.err <= 5, `the leader ${line.err} px off the centre line at ${JSON.stringify(ends[0])}`);
        const onStairEnds = ends.slice(1).filter(e => e.x > 1020);
        assert.ok(onStairEnds.length >= 2, `members behind it on the stair: ${JSON.stringify(ends)}`);
        for (const e of onStairEnds) {
          const l = stairLine(e);
          assert.ok(l.width >= S || l.err <= 5, `a member ${l.err} px off the centre line at ${JSON.stringify(e)}`);
          assert.ok(e.y < ends[0].y, "behind the leader (it came from room A, the stair's north end)");
        }
      }
      for (const t of ts) sceneTokens.delete(t.document.id);
      tickBy(60000);
    }
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10 live round 2 (S05.j3, S05.k3): dropped with the pointer on the stair's narrowest point, core snapping the leader to a square whose centre lies in the C's hollow beyond the wall: it rests on the centre line under the pointer, alone or with its group, nobody named (live: \"No route there\")", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  const proto = Token5e.prototype;
  const og = proto._getDragOrigin;
  proto._getDragOrigin = function () { return center(this.document._source); };
  try {
    for (const n of [1, 4]) {
      const ts = S05.tokens.filter(t => t.w === 1).slice(0, n).map((t, k) => makeToken(`jm${n}${k}000000000001`.slice(0, 16), t.x * S, t.y * S));
      for (const t of ts) { t.visible = true; sceneTokens.set(t.document.id, t.document); }
      F.canvas.tokens.placeables = [...ts];
      const L = ts[0], src = { ...L.document._source };
      // Core's snap: square (15, 38), centre (15.5, 38.5) in the hollow; the pointer at (1600, 3850), the throat (0.4 wide).
      const ctx = contextsFor(ts, 1500 - src.x, 3800 - src.y);
      drop.result = coreDrop(ctx);
      const from = F.calls.length;
      const out = L._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx, destination: { x: 1600, y: 3850 } }, shiftKey: false });
      const last = api.status().group.last;
      const by = fileMoves(out, from);
      const lw = by[L.document.id]?.waypoints;
      assert.ok(lw?.length, `${n}: the leader moves (${JSON.stringify(last)})`);
      const end = center(lw.at(-1));
      assert.ok(Math.hypot(end.x - 1600, end.y - 3850) <= 12, `${n}: it rests under the pointer: ${JSON.stringify(end)}`);
      assert.ok(stairLine(end).err <= 5, `${n}: on the centre line: ${stairLine(end).err}`);
      const path = [src, ...lw];
      for (let k = 1; k < path.length; k++) assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, `${n}: never through a wall`);
      if (n > 1) {
        assert.equal(last.shape, "march");
        assert.deepEqual(last.stayed, [], `${n}: nobody named`);
        for (const t of ts) assert.ok(by[t.document.id]?.waypoints?.length, `${n}: ${t.document.id} moves`);
      }
      for (const t of ts) sceneTokens.delete(t.document.id);
      tickBy(60000);
    }
  } finally { proto._getDragOrigin = og; F.canvas.tokens.placeables = saved; done(); }
});

/* -------------------------------------------- */
/*  0.10 F1: Fable's design check (review-f1 B1, B2, B3)                         */
/* -------------------------------------------- */

/** Open floor (no walls) on a 1000 px canvas for a test; returns the restore. */
function openFloor() {
  const old = world.walls;
  world.walls = [];
  F.fire("updateWall");
  return () => { world.walls = old; F.fire("updateWall"); };
}

test("0.10 F1 B3 (R1, R2): a rider is in its group for the plan — grabbed, its mount leads one entry in a march; a Large mount moved one square on each diagonal marches onto its drop square with its rider, never a swarm round its own rider", () => {
  combatFlag = false;
  clock.step = 0;
  const done = openFloor();
  const saved = F.canvas.tokens.placeables;
  let uid = 0;
  const cases = [
    // [name, rider top-left (squares), grabbed, dx, dy]
    ["rider grabbed, +4,0", [5, 5], "rider", 4, 0],
    ["rider top-left, -1,-1", [4, 4], "mount", -1, -1],
    ["rider top-left, +1,+1", [4, 4], "mount", 1, 1],
    ["rider bottom-right, -1,-1", [5, 5], "mount", -1, -1],
    ["rider bottom-right, +1,+1", [5, 5], "mount", 1, 1],
    ["rider bottom-right, +1,-1", [5, 5], "mount", 1, -1],
    ["rider bottom-right, -1,+1", [5, 5], "mount", -1, 1],
    ["rider grabbed, +1,+1", [5, 5], "rider", 1, 1],
  ];
  try {
    for (const [name, [rx, ry], grab, dx, dy] of cases) {
      const id = k => `f1b3${String(uid++).padStart(4, "0")}${k}`.padEnd(16, "0");
      const mount = makeToken(id("M"), 400, 400, { size: 2 }), rider = makeToken(id("R"), rx * S, ry * S);
      const a = makeToken(id("A"), 200, 700), b = makeToken(id("B"), 300, 800);
      const ts = [mount, rider, a, b];
      const others = keepOnly(ts);
      for (const t of ts) t.visible = true;
      F.canvas.tokens.placeables = [...ts];
      try {
        const from = F.calls.length;
        const g = grab === "rider" ? rider : mount;
        const out = dropWith(g, contextsFor(ts, dx * S, dy * S));
        const last = api.status().group.last;
        assert.equal(last.result, "plan", `${name}: planned (${JSON.stringify(last)})`);
        assert.equal(last.shape, "march", `${name}: a march, never a swarm round its own rider`);
        assert.equal(last.target, null, name);
        assert.equal(last.leader, mount.document.id, `${name}: the mount leads`);
        assert.equal(last.plan.members, 3, `${name}: the stack is one entry`);
        assert.deepEqual(last.stayed, [], `${name}: nobody named`);
        const by = fileMoves(out, from);
        const end = t => by[t.document.id]?.waypoints?.at(-1);
        assert.deepEqual([end(mount)?.x, end(mount)?.y], [400 + dx * S, 400 + dy * S], `${name}: the mount on its drop square`);
        assert.deepEqual([end(rider)?.x, end(rider)?.y], [rx * S + dx * S, ry * S + dy * S], `${name}: the rider on it`);
      } finally {
        for (const t of ts) sceneTokens.delete(t.document.id);
        for (const [k, v] of others) sceneTokens.set(k, v);
        tickBy(60000);
      }
    }
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10 F1 B3 (R2) fight: a Large mount with its rider dragged one square up-left in a fight is a march (its own rider is never the target)", async () => {
  const done = openFloor();
  const mount = noSpeed(makeToken("f1b3fM0000000001", 400, 400, { size: 2 })), rider = noSpeed(makeToken("f1b3fR0000000001", 400, 400));
  const a = noSpeed(makeToken("f1b3fA0000000001", 200, 700)), b = noSpeed(makeToken("f1b3fB0000000001", 300, 800));
  const ts = [mount, rider, a, b];
  const restore = fightScene(ts);
  const held = holdMoves(ts);
  try {
    assert.equal(dropWith(mount, contextsFor(ts, -S, -S)), null);
    const last = api.status().group.last;
    assert.equal(last.shape, "march", JSON.stringify(last));
    assert.equal(last.target, null);
    await settleQueue(held);
    const mv = F.calls.filter(c => c.op === "move" && c.id === mount.document.id).at(-1);
    assert.deepEqual([mv?.waypoints.at(-1).x, mv?.waypoints.at(-1).y], [300, 300], "the mount on its drop square");
  } finally { restore(); done(); tickBy(60000); }
});

/** The leader's side of a wall a→b (squares): the sign of the cross product at centre c (pixels). */
const sideOf = (a, b, c) => Math.sign((b[0] - a[0]) * (c.y / S - a[1]) - (b[1] - a[1]) * (c.x / S - a[0]));
/** Record every route search's goal (its last waypoint, pixels top-left) while `fn` runs. */
function routeGoals(fn) {
  const goals = [];
  const orig = Token5e.prototype.findMovementPath;
  Token5e.prototype.findMovementPath = function (waypoints, options = {}) {
    if (options.preview && waypoints.length === 2) goals.push({ ...waypoints[1] });
    return orig.call(this, waypoints, options);
  };
  try { return { out: fn(), goals }; } finally { Token5e.prototype.findMovementPath = orig; }
}

test("0.10 F1 B1 (R3, R9): planLead's floods never cross an off-grid wall — ten march beside a wall at x 12.4 (a closed room, a diagonal, a stub with an open end): no failed search, nobody named, nobody rests across the wall; the same wall on the grid as before", () => {
  combatFlag = false;
  clock.step = 0;
  const old = { walls: world.walls, rect: F.canvas.dimensions };
  const saved = F.canvas.tokens.placeables;
  const box = (x0, y0, x1, y1) => [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
  const variants = {
    grid: [12, 4, 12, 14],
    offgrid: [12.4, 4, 12.4, 14],
    diagonal: [12.2, 4, 13.1, 14],
    stub: [12.4, 4, 12.4, 10],
  };
  let uid = 0;
  try {
    for (const [name, wall] of Object.entries(variants)) for (const [bx, by] of [[11, 6], [11, 5], [10, 5]]) {
      world.walls = [...box(4, 4, 20, 14), wall].map(c => [{ x: c[0] * S, y: c[1] * S }, { x: c[2] * S, y: c[3] * S }]);
      F.canvas.dimensions = { rect: { x: 0, y: 0, width: 2500, height: 2000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2500 && y <= 2000 } };
      F.fire("updateWall");
      const spots = [[11, 11], [10, 11], [11, 12], [10, 12], [9, 11], [9, 12], [11, 13], [10, 13], [9, 13], [8, 12]];
      const ts = spots.map(([x, y]) => makeToken(`f1b1${String(uid++).padStart(5, "0")}`.padEnd(16, "0"), x * S, y * S));
      const others = keepOnly(ts);
      for (const t of ts) t.visible = true;
      F.canvas.tokens.placeables = [...ts];
      const tag = `${name} drop ${bx},${by}`;
      try {
        const src = ts[0].document._source;
        const from = F.calls.length;
        const out = dropWith(ts[0], contextsFor(ts, bx * S - src.x, by * S - src.y));
        const last = api.status().group.last;
        assert.equal(last.result, "plan", tag);
        assert.deepEqual(last.stayed, [], `${tag}: nobody named`);
        assert.equal(last.plan.failed, 0, `${tag}: no failed route search (${last.plan.searches} searches)`);
        const by2 = fileMoves(out, from);
        const lead = sideOf(wall.slice(0, 2), wall.slice(2), center(ts[0].document._source));
        for (const t of ts) {
          const m = by2[t.document.id];
          const path = [{ ...t.document._source }, ...(m?.waypoints ?? [])];
          for (let k = 1; k < path.length; k++) assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, `${tag}: ${t.document.id} through a wall`);
          assert.equal(sideOf(wall.slice(0, 2), wall.slice(2), center(path.at(-1))), lead, `${tag}: ${t.document.id} rests across the wall at ${JSON.stringify(center(path.at(-1)))}`);
        }
      } finally {
        for (const t of ts) sceneTokens.delete(t.document.id);
        for (const [k, v] of others) sceneTokens.set(k, v);
        tickBy(60000);
      }
    }
  } finally { F.canvas.tokens.placeables = saved; world.walls = old.walls; F.canvas.dimensions = old.rect; F.fire("updateWall"); }
});

/** Where a token may stand on Joe's S05 with the long door shut: room A, room B or the stair (radius 5.5 to 6.5). */
const inS05 = c => {
  const x = c.x / S, y = c.y / S, d = Math.hypot(x - 10, y - 38.5);
  return (x > 4 && x < 10 && ((y > 29 && y < 35) || (y > 42 && y < 48))) || (x >= 10 && d >= 5.5 && d <= 6.5);
};
/** S05's start spots for n heroes (its four, then room A's free squares). */
const s05Spots = n => [...S05.tokens.filter(t => t.w === 1).map(t => [t.x, t.y]), [5, 31], [6, 31], [7, 31], [9, 31], [5, 30], [6, 30], [9, 34], [7, 34]].slice(0, n);

test("0.10 F1 B1 (R3, R9) on Joe's S05: six and twelve dropped in room B over the stair — no route search to a square outside the C (the enclosed middle, the rock), none fails", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  let uid = 0;
  try {
    for (const n of [6, 12]) for (const [bx, by] of [[7, 45], [6, 44], [8, 46]]) {
      const ts = s05Spots(n).map(([x, y]) => makeToken(`f1bB${String(uid++).padStart(5, "0")}`.padEnd(16, "0"), x * S, y * S));
      const others = keepOnly(ts);
      for (const t of ts) t.visible = true;
      F.canvas.tokens.placeables = [...ts];
      const tag = `${n} dropped at ${bx},${by}`;
      try {
        const src = ts[0].document._source;
        const { out, goals } = routeGoals(() => dropWith(ts[0], contextsFor(ts, bx * S - src.x, by * S - src.y)));
        assert.ok(Array.isArray(out), tag);
        const last = api.status().group.last;
        for (const g of goals) assert.ok(inS05(center(g)), `${tag}: a route searched to ${JSON.stringify(center(g))}, outside the C`);
        assert.equal(last.plan.failed, 0, `${tag}: no failed route search (${last.plan.searches} searches, stayed ${last.stayed.length})`);
      } finally {
        for (const t of ts) sceneTokens.delete(t.document.id);
        for (const [k, v] of others) sceneTokens.set(k, v);
        tickBy(60000);
      }
    }
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

/** Points on S05's stair centre line (radius 6 round 10, 38.5) at these degrees from room A's mouth, as drop top-lefts. */
const stairDrops = degs => degs.map(deg => {
  const th = (deg * Math.PI) / 180;
  return { name: `${deg}°`, x: Math.round((10 + 6 * Math.sin(th)) * S - S / 2), y: Math.round((38.5 - 6 * Math.cos(th)) * S - S / 2) };
});
/** A group's rest spots: no wall crossed on the way, none closer than 0.98 square to another, 0.15 square clear of walls. */
function checkRest(tag, ts, by) {
  const ends = [];
  for (const t of ts) {
    const m = by[t.document.id];
    const path = [{ ...t.document._source }, ...(m?.waypoints ?? [])];
    for (let k = 1; k < path.length; k++) assert.equal(crossingCore(center(path[k - 1]), center(path[k])).length, 0, `${tag}: ${t.document.id} through a wall`);
    ends.push(center(path.at(-1)));
  }
  for (let a = 0; a < ends.length; a++) {
    assert.ok(minWall(ends[a]) >= 14.8, `${tag}: rests ${minWall(ends[a]).toFixed(1)} px from a wall at ${JSON.stringify(ends[a])}`);
    for (let b = a + 1; b < ends.length; b++) {
      const d = Math.hypot(ends[a].x - ends[b].x, ends[a].y - ends[b].y);
      assert.ok(d >= 98, `${tag}: two at rest ${d.toFixed(1)} px apart at ${JSON.stringify(ends[a])} ${JSON.stringify(ends[b])}`);
    }
  }
  return ends;
}

test("0.10 F1 B2 (R3, R9) on Joe's S05: four and eight dropped at 11 points along the stair and just inside room B, six and twelve in room B — the line behind the leader on the stair: nobody named while the way has room, none at rest within 0.98 square of another, no wall crossed", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  let uid = 0;
  const cases = [];
  for (const n of [4, 8]) for (const p of [...stairDrops([6, 10, 14, 18, 24, 32, 45, 60, 90, 120, 150]), { name: "room B 9,44", x: 900, y: 4400 }, { name: "room B 8,44", x: 800, y: 4400 }]) cases.push({ n, ...p });
  for (const n of [6, 12]) for (const [x, y] of [[7, 45], [6, 44], [8, 46]]) cases.push({ n, name: `room B ${x},${y}`, x: x * S, y: y * S });
  try {
    for (const c of cases) {
      const ts = s05Spots(c.n).map(([x, y]) => makeToken(`f1b2${String(uid++).padStart(5, "0")}`.padEnd(16, "0"), x * S, y * S));
      const others = keepOnly(ts);
      for (const t of ts) t.visible = true;
      F.canvas.tokens.placeables = [...ts];
      const tag = `${c.n} dropped at ${c.name}`;
      try {
        const src = ts[0].document._source;
        const from = F.calls.length;
        const out = dropWith(ts[0], contextsFor(ts, c.x - src.x, c.y - src.y));
        const last = api.status().group.last;
        assert.equal(last.result, "plan", `${tag}: ${JSON.stringify(last)}`);
        assert.deepEqual(last.stayed, [], `${tag}: nobody named`);
        checkRest(tag, ts, fileMoves(out, from));
      } finally {
        for (const t of ts) sceneTokens.delete(t.document.id);
        for (const [k, v] of others) sceneTokens.set(k, v);
        tickBy(60000);
      }
    }
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10 F1 B2 (R7, R9) fight on Joe's S05: four dropped at 11 points along the stair and just inside room B, eight at three, walk one at a time and form the line behind the leader (its mates at rest no wall for its floods): nobody named, none at rest within 0.98 square of another, no wall crossed", async () => {
  const done = onStair();
  let uid = 0;
  const cases = [...stairDrops([6, 10, 14, 18, 24, 32, 45, 60, 90, 120, 150]), { name: "room B 9,44", x: 900, y: 4400 }, { name: "room B 8,44", x: 800, y: 4400 }].map(p => ({ n: 4, ...p }));
  for (const p of [...stairDrops([14, 90]), { name: "room B 9,44", x: 900, y: 4400 }]) cases.push({ n: 8, ...p });
  try {
    for (const p of cases) {
      const ts = s05Spots(p.n).map(([x, y]) => noSpeed(makeToken(`f1b2f${String(uid++).padStart(4, "0")}`.padEnd(16, "0"), x * S, y * S)));
      const starts = new Map(ts.map(t => [t.document.id, { ...t.document._source }]));
      const restore = fightScene(ts);
      const log = new Map();
      for (const t of ts) {
        t.document.move = (waypoints, options) => {
          log.set(t.document.id, { waypoints });
          t.document._source.x = waypoints.at(-1).x; t.document._source.y = waypoints.at(-1).y;
          return Promise.resolve(true);
        };
      }
      const tag = `fight, ${p.n} dropped at ${p.name}`;
      try {
        const src = ts[0].document._source;
        assert.equal(dropWith(ts[0], contextsFor(ts, p.x - src.x, p.y - src.y)), null);
        for (let i = 0; i < 80 && api.status().group.queue?.running; i++) await runFor(50);
        const q = api.status().group.queue;
        assert.equal(q.ended, "done", `${tag}: ${JSON.stringify(q)}`);
        assert.equal(q.stayed, 0, `${tag}: nobody named (${JSON.stringify(q)})`);
        for (const t of ts) { const s0 = starts.get(t.document.id); t.document._source.x = s0.x; t.document._source.y = s0.y; }
        const by = Object.fromEntries([...log].map(([id, m]) => [id, m]));
        checkRest(tag, ts, by);
      } finally { restore(); tickBy(60000); }
    }
  } finally { done(); }
});

/* -------------------------------------------- */
/*  0.10 live round 1                           */
/* -------------------------------------------- */

const S06 = JSON.parse(readFileSync(new URL("./fixtures/narrow-stations.json", import.meta.url), "utf8")).stations.find(s => s.id === "S06");

test("0.10 live round 1 (S06.a/e/f, S07.d/l, S05.j3/k3): the leader's route search on a slow page is not cut at a member's cap — a march of two over S06's S-curve, hairpin and pillar field arrives, nobody named", async () => {
  combatFlag = false;
  clock.step = 0;
  const old = { walls: world.walls, rect: F.canvas.dimensions };
  world.walls = S06.walls.filter(w => !w.only).map(w => [{ x: w.c[0] * S, y: w.c[1] * S }, { x: w.c[2] * S, y: w.c[3] * S }]);
  F.canvas.dimensions = { rect: { x: 0, y: 0, width: 5000, height: 5000, contains: (x, y) => x >= 0 && y >= 0 && x <= 5000 && y <= 5000 } };
  F.fire("updateWall");
  const saved = F.canvas.tokens.placeables;
  let uid = 0;
  try {
    for (const p of ["dropScurve", "dropHairpin", "dropField"]) {
      const ts = S06.tokens.map(t => makeToken(`lr1a${String(uid++).padStart(5, "0")}`.padEnd(16, "0"), t.x * S, t.y * S));
      const others = keepOnly(ts);
      for (const t of ts) t.visible = true;
      F.canvas.tokens.placeables = [...ts];
      try {
        const src = ts[0].document._source;
        const [cx, cy] = S06.points[p].c;
        const ctx = contextsFor(ts, cx * S - S / 2 - src.x, cy * S - S / 2 - src.y);
        // A page four to eight times slower than Node (live round 1: a stair route 134 ms warm, 18-33 ms in Node).
        clock.step = 6;
        const from = F.calls.length;
        const out = dropWith(ts[0], ctx);
        // 0.10.2: a plan this slow goes on in slices (its clock their own time), the same plan.
        await planned();
        clock.step = 0;
        const last = api.status().group.last;
        assert.equal(last.result, "plan", `${p}: ${JSON.stringify(last)}`);
        assert.deepEqual(last.stayed, [], `${p}: nobody named`);
        const by = fileMoves(out, from);
        const end = center(by[ts[0].document.id].waypoints.at(-1));
        assert.ok(Math.hypot(end.x / S - cx, end.y / S - cy) <= 0.6, `${p}: the leader at the drop: ${JSON.stringify(end)}`);
      } finally {
        clock.step = 0;
        for (const t of ts) sceneTokens.delete(t.document.id);
        for (const [k, v] of others) sceneTokens.set(k, v);
        tickBy(60000);
      }
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    world.walls = old.walls; F.canvas.dimensions = old.rect; F.fire("updateWall");
  }
});

/* -------------------------------------------- */
/*  0.10 sign-off (Fable F2): S05.p             */
/* -------------------------------------------- */

/** S05.p's eight heroes where live round 3 started them (top-left px): S05's four, then the four extras in room A. */
const S05P = [[800, 3300], [600, 3300], [400, 3300], [800, 3000], [500, 3300], [700, 3300], [900, 3300], [900, 3400]];
/** A group drop on S05 with the S05 Large standing in room A (as on the playground): the plan, each member's rest (centre). */
function s05Drop(tag, starts, dest, { before = null } = {}) {
  const ts = starts.map(([x, y], k) => makeToken(`${tag}h${k}`.padEnd(16, "0"), x, y));
  const big = makeToken(`${tag}lg`.padEnd(16, "0"), 400, 3000, { size: 2 });
  const others = keepOnly([...ts, big]);
  for (const t of [...ts, big]) t.visible = true;
  F.canvas.tokens.placeables = [...ts, big];
  try {
    before?.(ts);
    const src = ts[0].document._source;
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, dest[0] - src.x, dest[1] - src.y));
    const last = api.status().group.last;
    const by = fileMoves(out, from);
    const ends = checkRest(tag, ts, by);
    return { last, ends, tops: ts.map((t, k) => { const w = by[t.document.id]?.waypoints?.at(-1) ?? t.document._source; return [w.x, w.y]; }), ts };
  } finally {
    for (const t of [...ts, big]) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
}
/** In the drop's room (A: rows 29-35, B: 42-48, columns 4-10), or on the stair on its centre line where it is narrower than a token. */
function inRoomOrLine(c, room) {
  const x = c.x / S, y = c.y / S;
  if (x > 4 && x < 10 && (room === "A" ? y > 29 && y < 35 : y > 42 && y < 48)) return true;
  if (x < 10 || !inS05(c)) return false;
  const l = stairLine(c);
  return l.width >= S || l.err <= 5;
}

test("0.10 sign-off X1 (S05.p, live round 3): eight heroes dragged A→B→A→B→A→B over the spiral stair, each leg from where the last left them, the S05 Large standing in room A: every leg plans (never \"No route there.\"), nobody named, each rests in the drop's room or on the stair's centre line, none within 0.98 square of another, no wall crossed; the live leg 3 (members standing in the stair's mouth on the leader's way) goes", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  try {
    let starts = S05P;
    ["B", "A", "B", "A", "B"].forEach((room, k) => {
      const r = s05Drop(`x1l${k}`, starts, room === "B" ? [700, 4500] : [700, 3200]);
      const tag = `leg ${k + 1} to room ${room}`;
      assert.equal(r.last.result, "plan", `${tag}: ${JSON.stringify(r.last)}`);
      assert.deepEqual(r.last.stayed, [], `${tag}: nobody named`);
      r.ends.forEach((c, j) => assert.ok(inRoomOrLine(c, room), `${tag}: hero ${j + 1} rests at ${JSON.stringify(c)}`));
      starts = r.tops;
    });
    // Live round 3's leg 3 as it stood (diag_s05p.json): five in room A and the stair's mouth, three in room B.
    const live3 = [[7.5, 32.5], [10.5, 32.52], [8.5, 32.5], [11.58, 32.72], [9.5, 32.5], [9.5, 45.5], [8.5, 44.5], [9.5, 44.5]]
      .map(([x, y]) => [Math.round(x * S - 50), Math.round(y * S - 50)]);
    const r = s05Drop("x1lv", live3, [700, 4500]);
    assert.equal(r.last.result, "plan", `live leg 3: ${JSON.stringify(r.last)}`);
    assert.deepEqual(r.last.stayed, [], "live leg 3: nobody named");
    r.ends.forEach((c, j) => assert.ok(inRoomOrLine(c, "B"), `live leg 3: hero ${j + 1} rests at ${JSON.stringify(c)}`));
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10 sign-off X2 (S05.p leg 2, live round 3): a member whose route to its first point on the line behind the leader fails takes the next clear point back (live: Heroes 6-8 kept their squares in room B)", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  try {
    // Live leg 2's start: the leader and five in room B (one in its mouth), Hero 3 left in room A.
    const leg2 = [[7.5, 45.5], [9.5, 44.5], [4.5, 33.5], [9.5, 45.5], [10.6, 44.47], [8.5, 46.5], [8.5, 45.5], [8.5, 44.5]]
      .map(([x, y]) => [Math.round(x * S - 50), Math.round(y * S - 50)]);
    // Hero 8's first point on the line is 12.61, 33.11 (just behind Hero 4's): its own token refuses that one route
    // (on the page: a route that failed, or ended too near the next one).
    let refused = 0;
    const r = s05Drop("x2l2", leg2, [700, 3200], { before: ts => {
      const t = ts[7];
      t.findMovementPath = function (w, o) {
        const d = w.at(-1);
        if (!refused && Math.hypot(d.x + 50 - 1261, d.y + 50 - 3311) < 4) { refused += 1; return { result: null }; }
        return Token5e.prototype.findMovementPath.call(this, w, o);
      };
    } });
    assert.equal(refused, 1, "the first point's route was refused");
    assert.deepEqual(r.last.stayed, [], "nobody named");
    r.ends.forEach((c, j) => assert.ok(inRoomOrLine(c, "A"), `hero ${j + 1} rests at ${JSON.stringify(c)}`));
    for (const j of [5, 6, 7]) assert.ok(r.ends[j].x > 1020, `hero ${j + 1} on the stair behind the leader, not left in room B: ${JSON.stringify(r.ends[j])}`);
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10.1 (S05.q legs 2 and 4, live round 5): the second member on the line behind the leader whose routes to the square just behind the first's all fail tries the next square, not the next 0.1 square of the same one (live: Heroes 6-8 left in room B)", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  try {
    // Live leg 2's start (round 5): the leader and six in room B or its mouth, Hero 3 left in room A.
    const leg2 = [[700, 4500], [900, 4400], [400, 3300], [900, 4500], [1010, 4397], [800, 4600], [800, 4500], [800, 4400]];
    // On the page, the route to any point of square (33, 12) failed (Hero 4 rests on the line at 11.59, 32.72; that
    // square's node lies inside its box): every member's token refuses a goal there.
    let refused = 0;
    const r = s05Drop("q1l2", leg2, [700, 3200], { before: ts => {
      for (const t of ts.slice(1)) {
        t.findMovementPath = function (w, o) {
          const d = w.at(-1), cx = d.x + 50, cy = d.y + 50;
          if (cx >= 1200 && cx < 1300 && cy >= 3300 && cy < 3400) { refused += 1; return { result: null }; }
          return Token5e.prototype.findMovementPath.call(this, w, o);
        };
      }
    } });
    assert.ok(refused >= 1, `a route into square (33, 12) was asked for and refused (${refused})`);
    assert.deepEqual(r.last.stayed, [], "nobody named");
    r.ends.forEach((c, j) => assert.ok(inRoomOrLine(c, "A"), `hero ${j + 1} rests at ${JSON.stringify(c)}`));
    for (const j of [5, 6, 7]) assert.ok(r.ends[j].x > 1020 || r.ends[j].y < 3500, `hero ${j + 1} on the stair or in room A, not left in room B: ${JSON.stringify(r.ends[j])}`);
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

test("0.10.1 (S05.q leg 4, live round 5, R8): a member whose square is its own start in the far room, with no point on the line behind the leader it can reach, stays and is named; it is never left there unnamed as if in place", () => {
  combatFlag = false;
  clock.step = 0;
  const done = onStair();
  const saved = F.canvas.tokens.placeables;
  try {
    // Live leg 4's start: Heroes 3 and 5 in room A beside the drop, Heroes 6 and 7 on their squares in room B (page: their
    // planLead squares were their own starts and the line failed them), the others in room B and the stair's mouth.
    const leg4 = [[700, 4500], [1111, 4377], [800, 3200], [1000, 4398], [900, 3200], [900, 4400], [800, 4400], [800, 4300]];
    // Heroes 6 and 7 reach no point on the stair (their every route onto it is refused).
    const r = s05Drop("q1l4", leg4, [700, 3200], { before: ts => {
      for (const t of ts.slice(5, 7)) {
        t.findMovementPath = function (w, o) {
          const d = w.at(-1);
          if (d.x + 50 > 1020 || d.y + 50 < 4150) return { result: null };
          return Token5e.prototype.findMovementPath.call(this, w, o);
        };
      }
    } });
    const ids = r.ts.map(t => t.document.id);
    r.ends.forEach((c, j) => {
      if (inRoomOrLine(c, "A")) return;
      assert.ok(r.last.stayed.includes(ids[j]), `hero ${j + 1} left at ${JSON.stringify(c)} must be named: stayed ${JSON.stringify(r.last.stayed)}`);
    });
    for (const j of [5, 6]) assert.ok(r.last.stayed.includes(ids[j]), `hero ${j + 1} (no way onto the stair) is named`);
  } finally { F.canvas.tokens.placeables = saved; done(); }
});

/* -------------------------------------------- */
/*  0.10.2: a group plan in slices (no freeze)  */
/* -------------------------------------------- */

/** A march of four north of the door wall, dropped south through the door; `steps`: every slice that many plan steps. */
async function slicedDrop(tag, steps, { between = null } = {}) {
  const ts = [[100, 200], [200, 200], [300, 200], [200, 100]].map(([x, y], k) => makeToken(`sl${tag}${k}`.padEnd(16, "0"), x, y));
  const others = keepOnly(ts);
  for (const t of ts) t.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts];
  if (steps) F.CONFIG.debug = { ...(F.CONFIG.debug ?? {}), [`${MOD}.planSteps`]: steps };
  try {
    const ctx = contextsFor(ts, 300, 500);              // the leader (100, 200) to (400, 700): through the door at x 400-500
    const from = F.calls.length;
    const out = dropWith(ts[0], ctx);
    const early = out ? Object.keys(out[1].movement) : [];
    const lead = out?.[1]?.pentarynMovementLead ?? null;
    if (between) between(ts, out);
    await planned();
    const by = fileMoves(out, from);
    return { ts, out, early, lead, by, from, status: api.status().group };
  } finally {
    if (steps) delete F.CONFIG.debug[`${MOD}.planSteps`];
    F.canvas.tokens.placeables = saved;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
}
const wpsOf = r => Object.fromEntries(r.ts.map((t, k) => [k, (r.by[t.document.id]?.waypoints ?? []).map(w => [w.x, w.y])]));

test("0.10.2 no freeze: a group plan run in slices (one plan step a slice) sends every member the moves the plan done in the drop sends, the leader in the drop's own update", async () => {
  combatFlag = false;
  clock.step = 0;
  const sync = await slicedDrop("A", 0);
  assert.equal(sync.status.last.async, false, "done in the drop's own slice");
  assert.ok(sync.early.length >= 1, "the drop's own update");
  const sliced = await slicedDrop("B", 1);
  assert.equal(sliced.status.sliced.state, "done");
  assert.ok(sliced.status.sliced.slices > 3, `in slices: ${JSON.stringify(sliced.status.sliced)}`);
  assert.equal(sliced.status.last.result, "plan");
  assert.equal(sliced.status.last.async, true);
  assert.deepEqual(sliced.early, [sliced.ts[0].document.id], "the leader alone sets off at the drop");
  assert.deepEqual(sliced.lead, [sliced.ts[0].document.id], "drawn on top (R6)");
  assert.equal(sliced.status.sliced.early, true);
  assert.deepEqual(wpsOf(sliced), wpsOf(sync), "the same way for every member");
  for (let k = 1; k < 4; k++) assert.ok(wpsOf(sliced)[k].length > 0, `member ${k} sent`);
  assert.deepEqual(sliced.status.last.stayed, sync.status.last.stayed);
});

test("0.10.2 no freeze: a door shut while the plan runs is honoured: no member is sent through it, each that stays is named; the leader sent at the drop is the door cut's (R6-3)", async () => {
  combatFlag = false;
  clock.step = 0;
  const shut = [{ x: 400, y: 400 }, { x: 500, y: 400 }];
  let fromShut = null;
  try {
    const r = await slicedDrop("C", 1, { between: () => { fromShut = F.calls.length; world.walls.push(shut); F.fire("updateWall", { id: "slWall0000000001", parent: sceneDoc, c: [400, 400, 500, 400], door: 1, ds: 0, move: 20, _source: { c: [400, 400, 500, 400], door: 1, ds: 0, move: 20 } }, { ds: 0 }, {}, "gm"); } });
    const later = sent(fromShut).filter(c => r.ts.slice(1).some(t => c.ids?.includes?.(t.document.id) || c.options?.movement?.[t.document.id]));
    for (const c of later) for (const [id, m] of Object.entries(c.options?.movement ?? {})) {
      if (id === r.ts[0].document.id) continue;
      const south = (m.waypoints ?? []).some(w => w.y + 50 > 400);
      assert.ok(!south, `${id} sent through the shut door: ${JSON.stringify(m.waypoints.map(w => [w.x, w.y]))}`);
    }
    const named = F.calls.slice(fromShut).filter(c => c.op === "notify");
    assert.ok(named.length > 0, "the ones that stay are named");
    assert.equal(r.status.sliced.state, "done");
  } finally {
    const k = world.walls.indexOf(shut);
    if (k >= 0) world.walls.splice(k, 1);
    F.fire("updateWall");
  }
});

test("0.10.2 no freeze: a click on the moving leader while the plan runs stops the group: the plan ends, nobody else is sent", async () => {
  combatFlag = false;
  clock.step = 0;
  let fromClick = null;
  const r = await slicedDrop("D", 1, { between: ts => {
    const t = ts[0];
    t.document._source = { ...t.document._source, x: 400, y: 700 };   // the server holds the leader's end
    t.document.x = 150; t.document.y = 250;                          // drawn on its way
    t.animationContexts.set(t.movementAnimationName, {});
    clock.t += MOTION.armMs + 10;                                    // click-to-stop arms after the drop
    fromClick = F.calls.length;
    t._onClickLeft({});
    t.animationContexts.clear();
  } });
  assert.equal(r.status.sliced.state, "superseded", JSON.stringify(r.status.sliced));
  const others = r.ts.slice(1).map(t => t.document.id);
  assert.ok(!sent(fromClick).some(c => others.some(id => c.options?.movement?.[id])), "no member sent after the stop");
});
