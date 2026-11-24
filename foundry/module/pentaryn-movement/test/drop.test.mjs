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
function hit(p, q, a, b) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d3 / (d3 - d4);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  const inside = r => Math.min(a.x, b.x) < r.x && r.x < Math.max(a.x, b.x) || Math.min(a.y, b.y) < r.y && r.y < Math.max(a.y, b.y);
  if (Math.abs(d2) < 1e-9 && Math.abs(d1) > 1e-9 && inside(q)) return { x: q.x, y: q.y };
  return null;
}
// A wall across y = 400 with a one-square door at x 400–500.
const world = { walls: [[{ x: 0, y: 400 }, { x: 400, y: 400 }], [{ x: 500, y: 400 }, { x: 1000, y: 400 }]] };
const crossing = (o, d) => world.walls.map(([a, b]) => hit(o, d, a, b)).filter(Boolean);
const center = w => ({ x: w.x + (w.width ?? 1) * S / 2, y: w.y + (w.height ?? 1) * S / 2, elevation: 0 });
const cell = p => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) });

const Token5e = F.CONFIG.Token.objectClass;
Token5e.prototype.findMovementPath = function (waypoints, options = {}) {
  const out = [{ ...waypoints[0] }];
  for (let k = 1; k < waypoints.length; k++) {
    if (!options.constrainOptions?.ignoreWalls && crossing(center(waypoints[k - 1]), center(waypoints[k])).length) break;
    out.push({ ...waypoints[k] });
  }
  return { result: out, promise: Promise.resolve(out), cancel: () => {} };
};
Token5e.prototype.checkCollision = function (dest, { origin, mode = "any" } = {}) {
  const hits = crossing(origin, dest);
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
  assert.equal(g.fight, false, "tier C (fight group drags) is off by default");
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

test("R3-6: the width probe casts no ray from a point off the canvas (core warns once per ray there); such a point has no room", async () => {
  const { narrowPoints } = await import("../group-adapter.mjs");
  const saved = F.canvas.dimensions;
  F.canvas.dimensions = { ...saved, width: 1000, height: 1000 };
  const t = makeToken("nrwA000000000001", 100, 100);
  const origins = [];
  t.checkCollision = (dest, { origin }) => { origins.push(origin); return null; };
  try {
    // A probe beside a slot candidate just off the left edge (x -0.5 squares), and one on open ground.
    const off = narrowPoints(t, [{ x: -0.5, y: 4 }, { x: -0.49, y: 4 }], 0.5, S);
    assert.equal(origins.filter(o => o.x < 0 || o.y < 0 || o.x > 1000 || o.y > 1000).length, 0, "no ray from off the canvas");
    assert.ok(off.length > 0, "off the canvas is narrow (no room)");
    origins.length = 0;
    const open = narrowPoints(t, [{ x: 5, y: 5 }, { x: 5.01, y: 5 }], 0.5, S);
    assert.deepEqual(open, [], "open ground is not narrow");
    assert.ok(origins.length > 0, "rays are cast inside");
  } finally {
    F.canvas.dimensions = saved;
  }
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

test("0.8.0 click-stop: not across a door's line, nothing but the stop where it is drawn (no walk out, no search)", async () => {
  combatFlag = false;
  const t = makeToken("pdrB000000000001", 100, 100);
  t.document._source = { ...t.document._source, x: 700, y: 100 };
  t.document.x = 333; t.document.y = 117;
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  t._onClickLeft({});
  await flush();
  const moves = F.calls.slice(from).filter(c => c.op === "move");
  assert.equal(moves.length, 1);
  assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [333, 117]);
  t.animationContexts.clear();
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

test("0.8.0 / 0.9.0 notices: the players see \"No route there\", \"Stopped short, way blocked\" and (0.9.0) the fight's one token at a time; the named ones say who", () => {
  const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8"));
  const shown = Object.keys(lang.PENTARYN_MOVEMENT.notify).filter(k => typeof lang.PENTARYN_MOVEMENT.notify[k] === "string");
  assert.deepEqual(shown.sort(), ["fightGroup", "noRoute", "stoppedShort"]);
  assert.deepEqual(Object.keys(lang.PENTARYN_MOVEMENT.notify.named).sort(), ["aToken", "noRoute", "stayed"]);
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

test("AR1-07: a fight's next square is never sent into a token standing still here (one walking is not standing; one it already overlaps where it stands is not a new block)", () => {
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
    // (200, 100) → (200, 200) is where the walker is drawn walking: not a standing token.
    walker.document.movement = { state: "pending", user: { isSelf: false } };
    const past = moveOp("mvAR1c0000000003", { x: 200, y: 100 }, { x: 200, y: 200 }, { chain: ["mvAR1c0000000001"] });
    assert.notEqual(F.fireCall("preMoveToken", t.document, past, { _movementArguments: { continuationId: "c2" } }), false);
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
    assert.equal(last.plan.stayed, 0);
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

test("0.9.0 B1 handlers: a tab going to the background sends its remaining waves at once", () => {
  const f = fileDrop("h");
  try {
    goHidden();
    const ups = sent(f.from);
    assert.equal(ups.length, 1, "one update");
    assert.deepEqual(ups[0].ids.sort(), f.waiting.map(t => t.document.id).sort());
    assert.deepEqual(api.status().group.pending, []);
    assert.ok(api.status().group.flushed.members >= 1);
    tickBy(5000);
    assert.equal(sent(f.from).length, 1, "nothing twice");
  } finally { f.restore(); }
});

test("0.9.0 B1: a wave skips a member no longer at its start, and one whose way a door shut since crosses (it stays where it is drawn, named)", () => {
  const f = fileDrop("w");
  try {
    const [moved, ...rest] = f.waiting;
    moved.document._source.x += S;                       // dragged elsewhere meanwhile
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

test("0.9.0 B0: no route crosses a token standing outside the drop, and no member rests on it", () => {
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

test("0.9.0 B0: a member with no spot it can reach stays where it stands and is named; the others go; nobody moving at all is \"No route there\"", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("b0nA000000000001", 400, 200), makeToken("b0nB000000000001", 100, 200)];
  const others = keepOnly(ts);
  // B's room below is sealed off from the door side: a wall down x = 300 from y 400.
  const extra = [[{ x: 300, y: 400 }, { x: 300, y: 1000 }]];
  world.walls.push(...extra);
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(Array.isArray(out));
    const ids = out[0].map(u => u._id);
    assert.deepEqual(ids, [ts[0].document.id], "the grabbed one goes, the sealed-off one stays");
    const told = F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);
    assert.ok(told.some(m => /named\.stayed|Stayed where they stand/.test(m)), `named: ${JSON.stringify(told)}`);
    assert.equal(api.status().group.last.plan.stayed, 1);
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

test("0.9.0: a group drag in a fight is refused with a notice (until the fight file); nothing moves", () => {
  combatFlag = true;
  clock.step = 0;
  const ts = [makeToken("b0fA000000000001", 400, 200), makeToken("b0fB000000000001", 300, 200)];
  const others = keepOnly(ts);
  try {
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], contextsFor(ts, 0, 100)), null);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.fightGroup"));
    assert.deepEqual([api.status().group.last.mode, api.status().group.last.reason], ["refused", "fightGroup"]);
  } finally {
    combatFlag = false;
    for (const t of ts) sceneTokens.delete(t.document.id);
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("0.9.0 planGroup(refs, point): B0's plan as a dry run (each member's slot, waypoints, why it stays); nothing moves", () => {
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
