// Characterisation pins (2026-11-25, the cleanup pass): what stop.mjs, motion-core.mjs, drop.mjs, group-adapter.mjs and
// group-core.mjs do NOW, so that tightening them cannot change a behaviour unseen. Every assertion states what the code
// does today; where that looks wrong the test is named "ODD:" and still pins it (the doc says one thing, the code another).
// A synthetic world as drop.test.mjs builds it: a 100 px grid, core's collision stubbed, one wall across y = 400 with a
// door at x 400-500 (a test sets its own `scene.walls` where it needs others). Nothing here edits a module source or
// another test.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, clicks, SCENE } from "./fixtures/world.mjs";
import { MOTION, clearAlong, clickStop, doorShutting, firstLegAcross, remainingFrom, routeAhead, segmentsCross, settleAlong, shutBlocked, spotsAlong, stopOrder } from "../motion-core.mjs";
import { clearOfWalls, doorwayAt, drawnPosition, fitPath, holdPinned, pinDrawn, stopWhereDrawn, unpin } from "../group-adapter.mjs";
import { firstIntrusion } from "../group-core.mjs";
import { movingTokenAt } from "../stop.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
const tickBy = ms => { for (let t = 0; t < ms; t += 50) mock.timers.tick(Math.min(50, ms - t)); };
const flush = async (n = 8) => { for (let k = 0; k < n; k++) await Promise.resolve(); };

const MOD = "pentaryn-movement";
const S = 100;
const F = await movementWorld();

// The clock only the tests move (stop.mjs arms a click from performance.now; group-adapter's pin runs out on it).
const clock = { t: 0 };
Object.defineProperty(globalThis, "performance", { value: { now: () => clock.t }, configurable: true, writable: true });
const warned = [];
console.warn = (...a) => { warned.push(a.map(String).join(" ")); };

const center = w => ({ x: w.x + (w.width ?? 1) * S / 2, y: w.y + (w.height ?? 1) * S / 2, elevation: 0 });
const Token5e = F.CONFIG.Token.objectClass;
/** Walls the stubbed collision tests (a test pushes its own; the default scene has none, so nothing is in the way). */
const solid = [];
function crosses(o, d, [a, b]) {
  const k = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = k(a, b, o), d2 = k(a, b, d), d3 = k(o, d, a), d4 = k(o, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
Token5e.prototype.checkCollision = function (dest, { origin } = {}) { return solid.some(w => crosses(origin, dest, w)); };
Token5e.prototype.can = function () { return true; };
Token5e.prototype.stopAnimation = function (opts) { F.calls.push({ op: "stopAnimation", id: this.document.id, opts }); };

const grid = { size: S, distance: 5, type: 1, getOffset: p => ({ i: Math.floor(p.y / S), j: Math.floor(p.x / S) }) };
const sceneTokens = new Map();
Object.assign(F.canvas, {
  grid,
  dimensions: { rect: { x: 0, y: 0, width: 2000, height: 2000, contains: (x, y) => x >= 0 && y >= 0 && x <= 2000 && y <= 2000 } },
  visibility: { tokenVision: false },
});
F.CONFIG.Token.movement = { actions: { walk: { walls: "move" }, displace: { walls: null } }, defaultSpeed: 6 };
F.game.activeTool = "select";

const layer = { _draggedToken: null, _movementPlanningContext: null };
const sceneDoc = { id: SCENE, grid, regions: [], tokens: sceneTokens, walls: [],
  async moveTokens(instructions, options) {
    F.calls.push({ op: "moveTokens", ids: Object.keys(instructions), options });
    const ids = Object.keys(instructions);
    const done = ids.map(id => sceneTokens.get(id)?.move(instructions[id].waypoints, { ...options, method: instructions[id].method }));
    const res = await Promise.all(done);
    return Object.fromEntries(ids.map((id, k) => [id, res[k]]));
  } };
Object.assign(F.canvas.scene, { tokens: sceneTokens });
let combatFlag = false;

/** A token placeable at rest where `x, y` (top-left px) says; `walk` below puts it in motion. */
function makeToken(id, x, y, { size = 1, name = id } = {}) {
  const t = Object.create(Token5e.prototype);
  t.layer = layer;
  t.movementAnimationName = `Token.${id}.animateMovement`;
  t.animationContexts = new Map();
  t.document = {
    documentName: "Token", id, uuid: `Scene.${SCENE}.Token.${id}`, name, movementAction: "walk", isOwner: true, hidden: false,
    parent: sceneDoc, rendered: true,
    _source: { x, y, elevation: 0, width: size, height: size, level: "L" },
    x, y, elevation: 0,
    movement: { state: "completed", user: { isSelf: true } },
    object: t,
    _shouldRecordMovementHistory: () => combatFlag,
    testUserPermission: () => true,
    stopMovement() { F.calls.push({ op: "stopMovement", id }); return true; },
    async move(waypoints, options) { F.calls.push({ op: "move", id, waypoints, options }); return true; },
  };
  sceneTokens.set(id, t.document);
  return t;
}
/** `t` walking: the server holds its end (`to`), it is drawn at `at`, its route is origin → corners → end (top-left px). */
function walk(t, at, to, { via = [], user = { isSelf: true }, from = null } = {}) {
  const d = t.document;
  d._source = { ...d._source, x: to.x, y: to.y };
  d.x = at.x; d.y = at.y;
  t.animationContexts.set(t.movementAnimationName, {});
  d.movement = { id: `mv${d.id}`, chain: [], state: "pending", user, origin: from ?? { x: at.x, y: at.y },
    passed: { waypoints: [] }, pending: { waypoints: [...via, to].map(p => ({ x: p.x, y: p.y })) } };
  return t;
}
const rest = t => { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; };
const clear = () => { sceneTokens.clear(); solid.length = 0; sceneDoc.walls = []; };
const door = (x0, y0, x1, y1, extra = {}) => ({ c: [x0, y0, x1, y1], door: 1, ds: 0, move: 20, ...extra });
const calls = from => F.calls.slice(from);
const moves = from => calls(from).filter(c => c.op === "move");

// ---- the exposed accessors of the features, captured while the module installs, so a test can stand in for file.mjs ----
let exposed = null;
{
  const assign = Object.assign;
  Object.assign = function (target, ...sources) {
    if (!exposed && sources[0] && "stopBatched" in sources[0]) exposed = target;
    return assign.call(this, target, ...sources);
  };
  try {
    await import("../movement.mjs");
    F.fire("init"); F.fire("setup"); F.fire("ready");
  } finally { Object.assign = assign; }
}
const api = game.pentaryn.movement;


const told = () => { const { at, ...rest } = api.status().group.told[0] ?? {}; return rest; };
const warnings = from => calls(from).filter(c => c.op === "notify" && c.level === "warn").map(c => c.message);

// The board and the door icons, as core hands them to the module's listeners.
const listeners = { board: null, door: null };
F.canvas.app = { view: { addEventListener: (type, fn) => { if (type === "pointerdown") listeners.board = fn; }, removeEventListener() {} } };
F.canvas.stage = { addEventListener: (type, fn, opts) => { if (type === "pointerdown" && opts?.capture) listeners.door = fn; }, removeEventListener() {} };
Object.defineProperty(F.canvas.tokens, "placeables", { get: () => [...sceneTokens.values()].map(d => d.object), configurable: true });
F.canvas.tokens.active = true;
F.canvas.canvasCoordinatesFromClient = ({ x, y }) => ({ x, y });
F.fire("canvasReady");
const DoorControl = F.foundry.canvas.containers.DoorControl;
let stamp = 0;
const boardDown = (x, y, extra = {}) => listeners.board({ button: 0, clientX: x, clientY: y, type: "pointerdown", timeStamp: (stamp += 1), ...extra });
function doorDown(x, y, extra = {}) {
  const ctl = new DoorControl();
  let stopped = false;
  listeners.door({ button: 0, target: ctl, getLocalPosition: () => ({ x, y }), stopPropagation: () => { stopped = true; }, nativeEvent: { type: "pointerdown", timeStamp: (stamp += 1) }, ...extra });
  return stopped;
}
/** status().stop.last without its clock. */
const lastStop = () => { const { at, ...rest } = api.status().stop.last ?? {}; assert.equal(typeof at, "string"); return rest; };

test("harness: the module installed and its exposed accessors were captured", () => {
  assert.ok(exposed && typeof exposed.stop === "function" && typeof exposed.groupPendingEnds === "function");
  assert.equal(Token5e.prototype._onClickLeft.__pentarynMovementStop, true);
});

/* -------------------------------------------- */
/*  motion-core: the tables and the pure walks  */
/* -------------------------------------------- */

test("MOTION is frozen at these values", () => {
  assert.equal(Object.isFrozen(MOTION), true);
  assert.deepEqual({ ...MOTION }, { restGap: 0.2, motionGap: 0.75, contact: 0.15, delayStep: 150, maxDelay: 3000, waveMs: 150,
    chordError: 0.05, cornerPoints: 8, routePoints: 64, speed: 6, checkpointEvery: 1, armMs: 400 });
});

test("ODD: MOTION.restGap is read by no source file (the tuning knob is dead)", async () => {
  const { readdirSync, readFileSync } = await import("node:fs");
  const root = new URL("../", import.meta.url);
  const reads = readdirSync(root).filter(f => f.endsWith(".mjs")).filter(f => /\brestGap\b/.test(readFileSync(new URL(f, root), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  assert.deepEqual(reads, ["motion-core.mjs"], "only its own definition");
});

const base = { enabled: true, tool: "select", modifiers: false, canControl: true, state: "pending", animating: false, combat: false, initiatorSelf: false };

test("clickStop: armed at MOTION.armMs exactly (399 ms is core's click, 400 a displace)", () => {
  assert.equal(clickStop({ ...base, elapsed: 399 }), null);
  assert.equal(clickStop({ ...base, elapsed: 400 }), "displace");
  assert.equal(clickStop({ ...base, elapsed: Infinity }), "displace");
  assert.equal(clickStop(base), "displace", "elapsed defaults to Infinity: unknown means armed");
});

test("clickStop: in a fight it is query, stop for the client that started the move", () => {
  assert.equal(clickStop({ ...base, state: "paused", combat: true }), "query", "paused, another user's");
  assert.equal(clickStop({ ...base, state: "completed", animating: true, combat: true, initiatorSelf: true }), "stop", "animating, its own");
  assert.equal(clickStop({ ...base, combat: true, initiatorSelf: true }), "stop");
  assert.equal(clickStop({ ...base, combat: true }), "query");
});

test("clickStop: nothing for a token at rest, the target tool, a modifier, no control or the setting off", () => {
  assert.equal(clickStop({ ...base, state: "completed" }), null, "completed and not animating");
  assert.equal(clickStop({ ...base, tool: "target" }), null);
  assert.equal(clickStop({ ...base, modifiers: true }), null);
  assert.equal(clickStop({ ...base, canControl: false }), null);
  assert.equal(clickStop({ ...base, enabled: false }), null);
});

test("ODD: clickStop with elapsed NaN is null; the doc says unknown elapsed is Infinity (NaN fails `elapsed >= armMs`)", () => {
  assert.equal(clickStop({ ...base, elapsed: NaN }), null);
});

test("stopOrder: of two overlapping, the one walking into the other settles after it; the front one first", () => {
  const a = { id: "a", at: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  const b = { id: "b", at: { x: 0.8, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  const c = { id: "c", at: { x: 5, y: 5 }, dir: null, r: 0.5 };
  assert.deepEqual(stopOrder([a, b, c]), ["b", "a", "c"]);
  assert.deepEqual(stopOrder([c, b, a]), ["c", "b", "a"], "the front one before the one behind it, the far one where it was given");
});

test("stopOrder: no overlap keeps the given order; so does a cycle (two walking at each other)", () => {
  const a = { id: "a", at: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  const far = { id: "b", at: { x: 3, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  assert.deepEqual(stopOrder([a, far]), ["a", "b"]);
  assert.deepEqual(stopOrder([far, a]), ["b", "a"]);
  const p = { id: "p", at: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  const q = { id: "q", at: { x: 0.8, y: 0 }, dir: { x: -1, y: 0 }, r: 0.5 };
  assert.deepEqual(stopOrder([p, q]), ["p", "q"]);
  assert.deepEqual(stopOrder([q, p]), ["q", "p"]);
  assert.deepEqual(stopOrder([]), []);
});

test("stopOrder: `margin` widens what counts as near", () => {
  const a = { id: "a", at: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  const b = { id: "b", at: { x: 1.4, y: 0 }, dir: { x: 1, y: 0 }, r: 0.5 };
  assert.deepEqual(stopOrder([a, b]), ["a", "b"], "apart: as given");
  assert.deepEqual(stopOrder([a, b], { margin: 1 }), ["b", "a"], "near with a margin: front first");
});

const restCircle = x => p => Math.hypot(p.x - x, p.y) < 1;       // a token of r 0.5 at rest at (x, 0), a mover of r 0.5 inside it
const along = { step: 0.25, aheadMax: 4, behindMax: 4 };

test("clearAlong: a token drawn on one at rest at (3,0) is carried ahead to the first clear sample (4,0), the corners passed none", () => {
  assert.deepEqual(clearAlong({ x: 3, y: 0 }, [{ x: 6, y: 0 }], [{ x: 0, y: 0 }], { bad: restCircle(3), ...along }), { p: { x: 4, y: 0 }, via: [] });
});

test("clearAlong: a wall ahead sends it back the way it came (2,0); a spot `taken` is skipped (4.75,0); too short a reach finds nothing", () => {
  const bad = restCircle(3);
  const wall = (a, b) => (a.x < 3.5) !== (b.x < 3.5);
  assert.deepEqual(clearAlong({ x: 3, y: 0 }, [{ x: 6, y: 0 }], [{ x: 0, y: 0 }], { bad, ...along, wallBetween: wall }), { p: { x: 2, y: 0 }, via: [] });
  assert.deepEqual(clearAlong({ x: 3, y: 0 }, [{ x: 6, y: 0 }], [{ x: 0, y: 0 }], { bad, ...along, taken: p => p.x >= 4 && p.x < 4.6 }), { p: { x: 4.75, y: 0 }, via: [] });
  assert.equal(clearAlong({ x: 3, y: 0 }, [{ x: 6, y: 0 }], [{ x: 0, y: 0 }], { bad, step: 0.25, aheadMax: 0.5, behindMax: 0.5 }), null);
});

test("clearAlong: `enters` ends a way; the corners passed come back as via, snapped", () => {
  const bad = p => p.y < 1;
  const out = clearAlong({ x: 0, y: 0 }, [{ x: 2.2, y: 0.01 }, { x: 2.2, y: 3 }], [], { bad, step: 1, aheadMax: 10, behindMax: 0, snap: p => ({ x: Math.round(p.x), y: Math.round(p.y) }) });
  assert.deepEqual(out, { p: { x: 2, y: 1 }, via: [{ x: 2, y: 0 }] });
  assert.equal(clearAlong({ x: 0, y: 0 }, [{ x: 5, y: 0 }], [], { bad: () => true, step: 1, aheadMax: 9, behindMax: 0 }), null, "nowhere clear");
  assert.equal(clearAlong({ x: 0, y: 0 }, [{ x: 5, y: 0 }], [], { bad: p => p.x < 3, enters: () => true, step: 1, aheadMax: 9, behindMax: 0 }), null, "it would enter a token at rest");
});

test("spotsAlong: where it is drawn when free, then ahead, then behind, every step, at most `max`", () => {
  const free = p => Math.hypot(p.x - 3, p.y) >= 1;
  const out = spotsAlong({ drawn: { x: 3, y: 0 }, ahead: [{ x: 5, y: 0 }], behind: [{ x: 1, y: 0 }], free, step: 0.5, aheadMax: 2, behindMax: 2 });
  assert.deepEqual(out.map(s => [s.p.x, s.p.y]), [[4, 0], [4.5, 0], [5, 0], [2, 0], [1.5, 0], [1, 0]], "ahead first, then behind, the drawn spot left out (not free)");
  assert.ok(out.every(s => s.via.length === 0));
  const free2 = spotsAlong({ drawn: { x: 3, y: 0 }, ahead: [{ x: 5, y: 0 }], behind: [], free: () => true, step: 1, aheadMax: 2, behindMax: 0 });
  assert.deepEqual(free2.map(s => s.p.x), [3, 4, 5], "drawn first when it is free");
  const capped = spotsAlong({ drawn: { x: 3, y: 0 }, ahead: [{ x: 5, y: 0 }], behind: [], free: () => true, step: 1, aheadMax: 2, behindMax: 0, max: 2 });
  assert.equal(capped.length, 2);
});

const cand = (x, y) => ({ p: { x, y }, via: [] });
const item = (id, drawn, cands, extra = {}) => ({ id, r: 0.5, drawn, cands, ...extra });

test("settleAlong: the first keeps its best spot, the second moves to the first spot that does not rest inside it", () => {
  const out = settleAlong([item("a", { x: 0, y: 0 }, [cand(0, 0), cand(-1, 0)]), item("b", { x: 0.5, y: 0 }, [cand(0.5, 0), cand(1.5, 0)])]);
  assert.deepEqual(Object.fromEntries(out), { a: cand(0, 0), b: cand(1.5, 0) });
});

test("settleAlong: both with only their drawn spot (inside each other) is null; one with no candidate is null", () => {
  assert.equal(settleAlong([item("a", { x: 0, y: 0 }, [cand(0, 0)]), item("b", { x: 0.5, y: 0 }, [cand(0.5, 0)])]), null);
  assert.equal(settleAlong([item("a", { x: 0, y: 0 }, [cand(0, 0)]), item("b", { x: 5, y: 0 }, [])]), null);
});

test("shutBlocked: none is null; an item with no cands is its id; the unsettleable pair names the first; the settleable pair is null", () => {
  const a1 = item("a", { x: 0, y: 0 }, [cand(0, 0)]), b1 = item("b", { x: 0.5, y: 0 }, [cand(0.5, 0)]);
  assert.equal(shutBlocked([]), null);
  assert.equal(shutBlocked(undefined), null);
  assert.equal(shutBlocked([{ id: "z", cands: [] }]), "z");
  assert.equal(shutBlocked([a1, b1]), "a");
  assert.equal(shutBlocked([item("a", { x: 0, y: 0 }, [cand(0, 0), cand(-1, 0)]), item("b", { x: 0.5, y: 0 }, [cand(0.5, 0), cand(1.5, 0)])]), null);
});

test("doorShutting: an open door going to any other state; not one already shut, a non-door, a wall that does not block, or a change without ds", () => {
  const open = { door: 1, move: 20, ds: 1 };
  assert.equal(doorShutting(open, { ds: 0 }), true);
  assert.equal(doorShutting(open, { ds: 2 }), true, "locked counts as shut");
  assert.equal(doorShutting({ ...open, ds: 0 }, { ds: 1 }), false, "opening");
  assert.equal(doorShutting({ door: 0, move: 20, ds: 1 }, { ds: 0 }), false);
  assert.equal(doorShutting({ ...open, move: 0 }, { ds: 0 }), false);
  assert.equal(doorShutting(open, { c: [0, 0, 1, 1] }), false);
  assert.equal(doorShutting(open, { ds: 0, move: 0 }), false, "the same update that stops it blocking");
  assert.equal(doorShutting(null, { ds: 0 }), false);
});

const ROUTE = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];

test("routeAhead: the index of the next corner; null within 0.5 of the end, for a single point, or a bad route", () => {
  assert.equal(routeAhead(ROUTE, { x: 2, y: 0.1 }), 1);
  assert.equal(routeAhead(ROUTE, { x: 4, y: 1 }), 2);
  assert.equal(routeAhead(ROUTE, { x: 4, y: 3.7 }), null, "within 0.5 of the end");
  assert.equal(routeAhead(ROUTE, { x: 4, y: 3.4 }), 2);
  assert.equal(routeAhead([{ x: 0, y: 0 }], { x: 0, y: 0 }), null);
  assert.equal(routeAhead(null, { x: 0, y: 0 }), null);
  assert.equal(routeAhead(ROUTE, null), null);
});

test("remainingFrom: where it is, then the corners still to reach; null at the end", () => {
  assert.deepEqual(remainingFrom(ROUTE, { x: 4, y: 1 }), [{ x: 4, y: 1 }, { x: 4, y: 4 }]);
  assert.equal(remainingFrom(ROUTE, { x: 4, y: 3.8 }), null);
});

test("firstLegAcross: the index of the first leg that crosses the wall, else -1", () => {
  const wall = [{ x: 1, y: 2 }, { x: 3, y: 2 }];
  assert.equal(firstLegAcross({ x: 2, y: 0 }, [{ x: 2, y: 4 }], ...wall), 0);
  assert.equal(firstLegAcross({ x: 0, y: 0 }, [{ x: 2, y: 0 }, { x: 2, y: 4 }], ...wall), 1, "the second leg");
  assert.equal(firstLegAcross({ x: 0, y: 0 }, [{ x: 4, y: 0 }, { x: 4, y: 4 }], { x: 5, y: 2 }, { x: 6, y: 2 }), -1, "a wall nowhere near");
  assert.equal(firstLegAcross({ x: 0, y: 0 }, [], ...wall), -1);
});

test("segmentsCross: a touch counts; just short does not", () => {
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 1 }), true);
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 0.99, y: 0 }, { x: 1, y: -1 }, { x: 1, y: 1 }), false);
  assert.equal(segmentsCross({ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 2, y: 0 }), true, "a proper crossing");
});

/* -------------------------------------------- */
/*  stop.mjs: the click, the board, the door    */
/* -------------------------------------------- */


test("a click on a move this client dropped is core's for 399 ms and a displace from 400 ms (the arming starts at the drop)", () => {
  clear(); combatFlag = false;
  const t = makeToken("arm1", 100, 100);
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  exposed.noteDrop([t.document.id]);
  clock.t += 399;
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(moves(from).length, 0, "399 ms: not armed");
  assert.equal(clicks.at(-1).token, t, "core's click still runs");
  clock.t += 1;
  t._onClickLeft({});
  assert.equal(moves(from).length, 1, "400 ms: armed");
  assert.deepEqual(moves(from)[0].waypoints, [{ x: 320, y: 100, elevation: 0, action: "displace", snapped: false, explicit: true, checkpoint: true }]);
  assert.equal(moves(from)[0].options.animate, false);
  rest(t);
});

test("a move this client never saw start is armed at once; the moveToken of another user's move arms it at once too", () => {
  clear(); combatFlag = false;
  const t = makeToken("arm2", 100, 100);
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 }, { user: { isSelf: false } });
  assert.equal(exposed.moveStartedAt(t.document.id), null);
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(moves(from).length, 1, "never seen: Infinity ms");
  F.fire("moveToken", t.document, t.document.movement, {}, { id: "other" });
  assert.equal(typeof exposed.moveStartedAt(t.document.id), "number");
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(moves(from).length, 1, "a foreign move is armed at once");
  rest(t);
});

test("status().stop.last after a click: { tokenId, name, how, via, also, members, whole }; pastDoor and walkedOn only when they happened", () => {
  clear(); combatFlag = false;
  const t = makeToken("last1", 100, 100, { name: "Orla" });
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  t._onClickLeft({});
  assert.deepEqual(lastStop(), { tokenId: "last1", name: "Orla", how: "displace", via: "click", also: 0, members: 1, whole: true });
  rest(t);
});

test("status().stop.last after a board press: via board with the canvas point (rounded), and the token selected", () => {
  clear(); combatFlag = false;
  const t = makeToken("last2", 100, 100);
  t.control = opts => { t.controlled = true; F.calls.push({ op: "control", opts }); };
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  const from = F.calls.length;
  boardDown(370.4, 150.6);
  assert.deepEqual(lastStop(), { tokenId: "last2", name: "last2", how: "displace", via: "board", also: 0, members: 1, whole: true, point: { x: 370, y: 151 } });
  assert.equal(moves(from).length, 1);
  assert.deepEqual(calls(from).find(c => c.op === "control").opts, { releaseOthers: true });
  rest(t);
});

test("a board press that the click wrap just saw is left alone; a press away from every moving token, or with another button, does nothing", () => {
  clear(); combatFlag = false;
  const t = makeToken("last3", 100, 100);
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  const native = { type: "pointerdown", timeStamp: 77 };
  t._onClickLeft({ nativeEvent: native });
  let from = F.calls.length;
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  boardDown(370, 150, { timeStamp: 77, type: "pointerdown" });
  assert.equal(moves(from).length, 0, "same timeStamp and type as the click's DOM event");
  boardDown(900, 900);
  boardDown(370, 150, { button: 2 });
  assert.equal(moves(from).length, 0);
  rest(t);
});

test("status().stop.last after a door-icon press: via door, no point; the icon's own handler never sees it and the token is selected", () => {
  clear(); combatFlag = false;
  const t = makeToken("last4", 400, 100);
  t.control = () => { t.controlled = true; };
  walk(t, { x: 430, y: 300 }, { x: 400, y: 600 });
  const from = F.calls.length;
  assert.equal(doorDown(485, 352), true);
  assert.deepEqual(lastStop(), { tokenId: "last4", name: "last4", how: "displace", via: "door", also: 0, members: 1, whole: true });
  assert.equal(moves(from).length, 1);
  assert.equal(t.controlled, true);
  rest(t);
  assert.equal(doorDown(485, 352), false, "nothing moving there: core's toggle");
});

test("a door-icon press 0.9 squares beyond the drawn circle still stops the token; further does not", () => {
  clear(); combatFlag = false;
  const t = makeToken("last5", 400, 100);
  walk(t, { x: 400, y: 100 }, { x: 400, y: 600 });                     // drawn centre (450, 150), radius 50
  assert.equal(doorDown(450, 150 + 50 + 89), true);
  walk(t, { x: 400, y: 100 }, { x: 400, y: 600 });
  assert.equal(doorDown(450, 150 + 50 + 95), false);
  rest(t);
});

test("status().stop.last after api stop(): via api; the result is { ok, how, tokenId }", async () => {
  clear(); combatFlag = false;
  const t = makeToken("last6", 100, 100);
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  exposed.noteDrop([t.document.id]);                                   // just dropped: a click would be core's, the API is never held back
  const r = await api.stop(t.document);
  assert.deepEqual(r, { ok: true, how: "displace", tokenId: "last6" });
  assert.deepEqual(lastStop(), { tokenId: "last6", name: "last6", how: "displace", via: "api", also: 0, members: 1, whole: true });
  rest(t);
  assert.deepEqual(await api.stop(t.document), { ok: false, code: "NOT_MOVING", reason: "the token is not moving, or you cannot control it" });
});

test("api stop() of a token that is not drawn is NOT_DRAWN", async () => {
  const r = await exposed.stop({ id: "ghost", object: null });
  assert.deepEqual(r, { ok: false, code: "NOT_DRAWN", reason: "the token is not drawn on this canvas" });
});

test("a click out of combat on this client's pending move: stopMovement, then stopAnimation (reset false), then the displace", () => {
  clear(); combatFlag = false;
  const t = makeToken("seq1", 100, 100);
  walk(t, { x: 250, y: 100 }, { x: 600, y: 100 });
  const from = F.calls.length;
  t._onClickLeft({});
  assert.deepEqual(calls(from).map(c => c.op).filter(o => ["stopMovement", "stopAnimation", "move"].includes(o)), ["stopMovement", "stopAnimation", "move"]);
  assert.equal(calls(from).find(c => c.op === "stopAnimation").opts.reset, false);
  rest(t);
});

test("a click in a fight: the starter's own move is stopMovement, never a displace; another user's is the relay query", () => {
  clear(); combatFlag = true;
  const t = makeToken("fgt1", 100, 100);
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 });
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(calls(from).filter(c => c.op === "stopMovement").length, 1);
  assert.equal(moves(from).length, 0);
  assert.deepEqual(lastStop(), { tokenId: "fgt1", name: "fgt1", how: "stop", via: "click", members: 1, whole: true }, "no displace in the batch: `also` is not set");
  walk(t, { x: 320, y: 100 }, { x: 600, y: 100 }, { user: { isSelf: false } });
  from = F.calls.length;
  t._onClickLeft({});
  const q = calls(from).find(c => c.op === "query");
  assert.deepEqual([q?.name, q?.data], [`${MOD}.stop`, { ref: t.document.uuid }]);
  rest(t); combatFlag = false;
});

test("notice: a stop that could not rest clear of a token and walks on to its own square: key walkedOn, the names substituted, nothing written", async () => {
  clear(); combatFlag = false;
  makeToken("restR1", 320, 100, { name: "Rook" });
  const A = makeToken("walkA1", 300, 100, { name: "Orla" });
  walk(A, { x: 300, y: 100 }, { x: 600, y: 100 });
  solid.push([{ x: 362, y: 0 }, { x: 362, y: 300 }]);               // a wall across its way ahead; behind it there is only its own start
  const from = F.calls.length;
  A._onClickLeft({});
  await flush();
  assert.deepEqual(warnings(from), ["Could not stop clear of another token, so walked on to its own square: Orla."]);
  assert.deepEqual(told(), { kind: "stayed", reason: "walkedOn", text: "Could not stop clear of another token, so walked on to its own square: Orla." });
  assert.equal(moves(from).length, 0, "no write: the document already holds its square");
  assert.deepEqual(lastStop(), { tokenId: "walkA1", name: "Orla", how: "displace", via: "click", walkedOn: 1, also: 0, members: 0, whole: true });
  rest(A);
});

test("notice: a stop that rests on another token with no free spot along its own way: key stopInside, written where drawn", async () => {
  clear(); combatFlag = false;
  makeToken("restR2", 320, 100, { name: "Rook" });
  const A = makeToken("walkA2", 320, 100, { name: "Orla" });
  walk(A, { x: 300, y: 100 }, { x: 320, y: 100 });
  const from = F.calls.length;
  A._onClickLeft({});
  await flush();
  assert.deepEqual(warnings(from), ["Stopped on another token, with no free spot along its own way: Orla. Drag it clear."]);
  assert.deepEqual(told(), { kind: "stayed", reason: "stopInside", text: "Stopped on another token, with no free spot along its own way: Orla. Drag it clear." });
  assert.deepEqual(moves(from).map(m => m.waypoints), [[{ x: 300, y: 100, elevation: 0, action: "displace", snapped: false, explicit: true, checkpoint: true }]]);
  rest(A);
});

test("the notice names a token the user cannot read as 'a token'", async () => {
  clear(); combatFlag = false;
  makeToken("restR3", 320, 100);
  const A = makeToken("walkA3", 320, 100, { name: "Secret" });
  A.document.isOwner = false;
  A.document.displayName = 0;
  walk(A, { x: 300, y: 100 }, { x: 320, y: 100 });
  const from = F.calls.length;
  exposed.stopBatched(() => exposed.stopDisplace(A));                     // a click is a player's own token only: the door cut stops any
  await flush();
  assert.deepEqual(warnings(from), ["Stopped on another token, with no free spot along its own way: a token. Drag it clear."]);
  rest(A);
});

test("a click never throws out of the wrap: a failing decision warns once (further errors suppressed) and core's click still runs", () => {
  clear(); combatFlag = false;
  const A = makeToken("thrw1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 });
  warned.length = 0;
  const n = clicks.length;
  Object.defineProperty(F.game, "activeTool", { get() { throw new Error("no tool"); }, configurable: true });
  try {
    for (let k = 0; k < 2; k++) A._onClickLeft({});
  } finally { Object.defineProperty(F.game, "activeTool", { value: "select", configurable: true, writable: true }); }
  assert.equal(clicks.length, n + 2, "core's click ran both times");
  assert.deepEqual(warned.filter(w => /click to stop skipped/.test(w)), ["pentaryn-movement | click to stop skipped (further errors suppressed) Error: no tool"]);
  rest(A);
});

test("a stop that the server refuses (move resolves false) or that throws puts the token back where the server has it", async () => {
  clear(); combatFlag = false;
  for (const outcome of ["refused", "threw"]) {
    const A = makeToken(`rfs${outcome}`, 100, 100);
    walk(A, { x: 320, y: 100 }, { x: 600, y: 100 });
    A.document.move = async () => { if (outcome === "threw") throw new Error("nope"); return false; };
    warned.length = 0;
    const from = F.calls.length;
    A._onClickLeft({});
    await flush();
    const stops = calls(from).filter(c => c.op === "stopAnimation");
    assert.deepEqual(stops.map(s => s.opts), [{ reset: false }, undefined], `${outcome}: held where drawn, then reset to the source`);
    if (outcome === "threw") assert.match(warned.at(-1), /pentaryn-movement \| could not stop a token where it was drawn/);
    rest(A);
  }
});

test("stop() as the query handler: the sender must own the token, and this client must have started the move", async () => {
  clear(); combatFlag = true;
  const A = makeToken("qry1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 });
  const sender = { id: "player0000000009" };
  A.document.testUserPermission = () => false;
  assert.deepEqual(await exposed.stop(A.document, {}, { user: sender }), { ok: false, code: "NOT_OWNER", reason: "the sender does not own that token" });
  A.document.testUserPermission = (u, lvl) => { assert.equal(u, sender); assert.equal(lvl, "OWNER"); return true; };
  A.document.movement.user = { isSelf: false };
  let from = F.calls.length;
  assert.deepEqual(await exposed.stop(A.document, {}, { user: sender }), { ok: false, code: "NOT_INITIATOR", reason: "this client did not start that move" });
  assert.equal(calls(from).filter(c => c.op === "stopMovement").length, 0);
  A.document.movement.user = { isSelf: true };
  const cancels = [];
  const real = exposed.groupCancel;
  exposed.groupCancel = (...a) => { cancels.push(a); return real(...a); };
  try {
    from = F.calls.length;
    assert.deepEqual(await exposed.stop(A.document, {}, { user: sender }), { ok: true, how: "stop", tokenId: "qry1" });
  } finally { exposed.groupCancel = real; }
  assert.deepEqual(cancels, [["qry1", { why: "click" }]], "the whole group's queue goes too");
  assert.equal(calls(from).filter(c => c.op === "stopMovement" && c.id === "qry1").length, 1);
  rest(A); combatFlag = false;
});

test("stop() as the relay row: the manifest's `stop` query reaches the same function on the active GM", async () => {
  clear(); combatFlag = true;
  const A = makeToken("qry2", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 });
  const me = game.user, gm = game.users.get("gmUser0000000001");
  const saved = [me.isGM, gm.active];
  Object.defineProperty(me, "isGM", { value: true, configurable: true, writable: true });
  gm.active = false;                                                       // this client is now the active GM
  globalThis.fromUuidSync = u => (u === A.document.uuid ? A.document : null);
  try {
    const from = F.calls.length;
    const out = await CONFIG.queries[`${MOD}.stop`]({ ref: A.document.uuid }, { user: { id: "p2", isGM: false } });
    assert.deepEqual(out, { ok: true, how: "stop", tokenId: "qry2" });
    assert.equal(calls(from).filter(c => c.op === "stopMovement").length, 1);
  } finally {
    Object.defineProperty(me, "isGM", { value: saved[0], configurable: true, writable: true });
    gm.active = saved[1];
    delete globalThis.fromUuidSync;
    combatFlag = false; rest(A);
  }
});

test("a player's click in combat on a move with no active GM resolves null: nothing is stopped or written, the API says NO_ANSWER", async () => {
  clear(); combatFlag = true;
  const A = makeToken("nogm1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 }, { user: { isSelf: false } });
  const gm = game.users.get("gmUser0000000001");
  gm.active = false;
  try {
    const from = F.calls.length;
    A._onClickLeft({});
    await flush();
    assert.equal(calls(from).filter(c => ["stopMovement", "move", "moveTokens", "query"].includes(c.op)).length, 0);
    assert.equal(clicks.at(-1).token, A, "core's click still runs");
    assert.deepEqual(await api.stop(A.document), { ok: false, code: "NO_ANSWER", reason: "the client that started the move did not stop it" });
    assert.deepEqual(lastStop(), { tokenId: "nogm1", name: "nogm1", how: "query", via: "api" });
  } finally { gm.active = true; rest(A); combatFlag = false; }
});

test("a player's click in combat asks the active GM with a 400 ms timeout; a GM that times out or refuses leaves everything as it was", async () => {
  clear(); combatFlag = true;
  const A = makeToken("ask1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 }, { user: { isSelf: false } });
  const real = game.users.get("gmUser0000000001");
  const asked = [];
  let answer = async () => ({ ok: true, how: "stop", tokenId: "ask1" });
  const fake = { id: real.id, name: "GM", isGM: true, active: true, isSelf: false, role: 4, query: async (name, data, opts) => { asked.push({ name, data, opts }); return answer(); } };
  game.users.set(real.id, fake);
  try {
    let from = F.calls.length;
    A._onClickLeft({});
    await flush();
    assert.deepEqual(asked, [{ name: `${MOD}.stop`, data: { ref: A.document.uuid }, opts: { timeout: 400 } }]);
    answer = async () => { throw new Error("operation has timed out"); };
    from = F.calls.length;
    A._onClickLeft({});
    assert.deepEqual(await api.stop(A.document), { ok: false, code: "NO_ANSWER", reason: "the client that started the move did not stop it" });
    assert.equal(calls(from).filter(c => ["stopMovement", "move"].includes(c.op)).length, 0);
    answer = async () => ({ ok: true, how: "stop", tokenId: "ask1" });
    assert.deepEqual(await api.stop(A.document), { ok: true, how: "stop", tokenId: "ask1" }, "the GM's answer, as it is");
  } finally { game.users.set(real.id, real); rest(A); combatFlag = false; }
});

/* -------------------------------------------- */
/*  A stop's batch, ownership, the board lookup */
/* -------------------------------------------- */

/** Stand in for file.mjs's group lookups for one call: `members` is what groupMembers answers. */
function withGroup(members, fn) {
  const saved = { groupMembers: exposed.groupMembers, groupCancel: exposed.groupCancel, groupNoteStop: exposed.groupNoteStop };
  const log = { cancel: [], note: [] };
  exposed.groupMembers = () => members;
  exposed.groupCancel = (...a) => { log.cancel.push(a); return members.ids ?? []; };
  exposed.groupNoteStop = o => log.note.push(o);
  try { return fn(log); } finally { Object.assign(exposed, saved); }
}

test("several stops of one batch go as ONE Scene#moveTokens naming each id, animate false, each stopped where drawn", async () => {
  clear(); combatFlag = false;
  const ts = ["bat1a", "bat1b", "bat1c"].map((id, k) => makeToken(id, 100, 100 + k * 300));
  ts.forEach((t, k) => walk(t, { x: 320, y: 100 + k * 300 }, { x: 900, y: 100 + k * 300 }));
  const from = F.calls.length;
  withGroup({ held: true, ids: ts.map(t => t.document.id), sender: "me" }, log => {
    ts[0]._onClickLeft({});
    assert.deepEqual(log.cancel, [["bat1a", { why: "click" }]], "the dragger's client: the whole group, its unsent waves too");
    assert.deepEqual(log.note, [{ why: "click", members: 3, whole: true }]);
  });
  await flush();
  const mt = calls(from).filter(c => c.op === "moveTokens");
  assert.equal(mt.length, 1, "one update");
  assert.deepEqual(mt[0].ids, ["bat1a", "bat1b", "bat1c"]);
  assert.deepEqual(mt[0].options, { animate: false, pentarynMovementStop: true, pentarynMovementStopAt: { bat1a: null, bat1b: null, bat1c: null } });
  const each = moves(from);
  assert.deepEqual(each.map(m => m.id), ["bat1a", "bat1b", "bat1c"]);
  for (const m of each) {
    assert.equal(m.options.method, "api");
    assert.equal(m.options.animate, false);
    assert.deepEqual(m.waypoints.map(w => [w.x, w.action, w.snapped, w.explicit, w.checkpoint]), [[320, "displace", false, true, true]]);
  }
  assert.deepEqual(lastStop(), { tokenId: "bat1a", name: "bat1a", how: "displace", via: "click", also: 0, members: 3, whole: true });
  ts.forEach(rest);
});

test("a single stop writes with the token's own move (no Scene#moveTokens), its options naming where it rests (null: where drawn)", async () => {
  clear(); combatFlag = false;
  const A = makeToken("one1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 900, y: 100 });
  const from = F.calls.length;
  exposed.stopDisplace(A);                                              // outside a batch: flushBatch alone
  await flush();
  assert.equal(calls(from).filter(c => c.op === "moveTokens").length, 0);
  assert.deepEqual(moves(from).map(m => m.options), [{ animate: false, pentarynMovementStop: true, pentarynMovementStopAt: { one1: null }, method: "api" }]);
  rest(A);
});

test("owns(): a click stops the mates in its group that this user owns (a GM all of them); a mate it does not own is left, and the stop is not whole", async () => {
  clear(); combatFlag = false;
  const a = makeToken("own1a", 100, 100), b = makeToken("own1b", 100, 400);
  const owners = new Set([game.user.id]);
  for (const t of [a, b]) t.document.testUserPermission = (u, lvl) => { assert.equal(lvl, "OWNER"); return u.isGM || owners.has(u.id); };
  const ids = [a.document.id, b.document.id];
  const arrange = () => { walk(a, { x: 320, y: 100 }, { x: 900, y: 100 }); walk(b, { x: 320, y: 400 }, { x: 900, y: 400 }); };
  const run = async () => {
    arrange();
    const from = F.calls.length;
    withGroup({ held: false, ids, sender: null }, () => a._onClickLeft({}));
    await flush();
    const stopped = moves(from).map(m => m.id).sort();
    const { whole, members } = lastStop();
    [a, b].forEach(rest);
    return { stopped, whole, members };
  };
  assert.deepEqual(await run(), { stopped: ["own1a", "own1b"], whole: true, members: 2 }, "a player owner of both");
  owners.clear(); owners.add(game.user.id);
  b.document.testUserPermission = () => false;
  assert.deepEqual(await run(), { stopped: ["own1a"], whole: false, members: 1 }, "a mate it does not own");
  b.document.testUserPermission = (u) => u.isGM;
  Object.defineProperty(game.user, "isGM", { value: true, configurable: true, writable: true });
  try { assert.deepEqual(await run(), { stopped: ["own1a", "own1b"], whole: true, members: 2 }, "a GM owns all"); }
  finally { Object.defineProperty(game.user, "isGM", { value: false, configurable: true, writable: true }); }
  b.document.testUserPermission = () => { throw new Error("no permission api"); };
  assert.deepEqual(await run(), { stopped: ["own1a"], whole: false, members: 1 }, "a throw is not owned");
  delete b.document.testUserPermission;
  assert.deepEqual(await run(), { stopped: ["own1a", "own1b"], whole: true, members: 2 }, "no testUserPermission: the document's isOwner");
});

test("a token the user cannot control is core's click: no stop (its own wrap is not the table's)", () => {
  clear(); combatFlag = false;
  const A = makeToken("ctl1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 900, y: 100 });
  A.can = () => false;
  const from = F.calls.length;
  A._onClickLeft({});
  assert.equal(moves(from).length, 0);
  A.can = () => { throw new Error("no can"); };
  A.document.isOwner = false;
  A._onClickLeft({});
  assert.equal(moves(from).length, 0, "a throw falls back to the document's isOwner");
  A.document.isOwner = true;
  A._onClickLeft({});
  assert.equal(moves(from).length, 1);
  rest(A);
});

test("a stop of a dragger's group seen on another screen: the one clicked, the dragger's screen stops the rest", async () => {
  clear(); combatFlag = false;
  const a = makeToken("far1a", 100, 100), b = makeToken("far1b", 100, 400);
  walk(a, { x: 320, y: 100 }, { x: 900, y: 100 }); walk(b, { x: 320, y: 400 }, { x: 900, y: 400 });
  const from = F.calls.length;
  withGroup({ held: false, ids: ["far1a", "far1b"], sender: "gmUser0000000001" }, log => {
    a._onClickLeft({});
    assert.deepEqual(log.cancel, [], "not this client's group");
    assert.deepEqual(log.note, [{ why: "click", members: 1, whole: true }], "the dragger is here: whole by its screen");
  });
  await flush();
  assert.deepEqual(moves(from).map(m => m.id), ["far1a"]);
  [a, b].forEach(rest);
});

test("movingTokenAt(p): the nearest moving token whose drawn circle holds p; null over a still token, empty board or with a modifier", () => {
  clear(); combatFlag = false;
  const a = makeToken("mta1", 100, 100), b = makeToken("mta2", 100, 100), still = makeToken("mta3", 700, 100);
  walk(a, { x: 100, y: 100 }, { x: 900, y: 100 });
  walk(b, { x: 130, y: 100 }, { x: 900, y: 100 });
  const hit = p => { const r = movingTokenAt(p); return r && [r.token.document.id, r.how]; };
  assert.deepEqual(hit({ x: 160, y: 150 }), ["mta1", "displace"], "10 px from a's centre, 20 from b's");
  assert.deepEqual(hit({ x: 175, y: 150 }), ["mta2", "displace"]);
  assert.equal(hit({ x: 750, y: 150 }), null, "over a token at rest");
  assert.equal(hit({ x: 500, y: 500 }), null, "empty board");
  assert.equal(movingTokenAt({ x: 160, y: 150 }, { modifiers: true }), null);
  assert.equal(hit({ x: 300, y: 150 }), null, "beyond both circles (150 px from a, 120 from b)");
  assert.equal(movingTokenAt({ x: 300, y: 150 }, { slack: 0.9 })?.token.document.id, "mta2", "within the door icon's slack of b (140 px), not of a");
  [a, b, still].forEach(rest);
  assert.equal(movingTokenAt({ x: 150, y: 150 }), null, "nothing moving");
  clear();
  assert.equal(movingTokenAt({ x: 150, y: 150 }), null);
});

test("movingTokenAt skips previews, destroyed tokens and tokens whose click the table refuses", () => {
  clear(); combatFlag = false;
  const a = makeToken("mtb1", 100, 100), b = makeToken("mtb2", 100, 100), c = makeToken("mtb3", 100, 100);
  for (const t of [a, b, c]) walk(t, { x: 100, y: 100 }, { x: 900, y: 100 });
  a.isPreview = true; b.destroyed = true;
  assert.equal(movingTokenAt({ x: 150, y: 150 }).token.document.id, "mtb3");
  c.can = () => false;
  assert.equal(movingTokenAt({ x: 150, y: 150 }), null);
  [a, b, c].forEach(rest);
});

test("a throw in resync or settle is swallowed (debug-logged) and the click, the timers and the hook never throw", () => {
  clear(); combatFlag = false;
  const debugged = [];
  const realDebug = console.debug;
  console.debug = (...a) => debugged.push(String(a[0]));
  F.CONFIG.debug[MOD] = true;
  try {
    // resync: at rest, drawn off its source, and the reset throws.
    const A = makeToken("rsy1", 100, 100);
    A.document._source = { ...A.document._source, x: 900, y: 200 };
    A.document.x = 1190; A.document.y = 1600;
    A.stopAnimation = () => { throw new Error("reset failed"); };
    F.fire("updateToken", A.document, { x: 900, y: 200 }, { animate: false }, "other");
    mock.timers.tick(0);
    assert.ok(debugged.includes("pentaryn-movement | resync"), debugged.join());
    // settle: a movement tween still running whose stop throws.
    const B = makeToken("rsy2", 100, 100);
    walk(B, { x: 320, y: 100 }, { x: 900, y: 100 });
    B.stopAnimation = () => { throw new Error("stop failed"); };
    F.fire("updateToken", B.document, { x: 900, y: 100 }, { animate: false }, "other");
    mock.timers.tick(0);
    assert.ok(debugged.includes("pentaryn-movement | settle"), debugged.join());
    mock.timers.tick(3200);                                          // the whole watch runs out without a throw
  } finally { console.debug = realDebug; F.CONFIG.debug[MOD] = false; clear(); }
});

test("a token that is gone or drawn at its source is left alone by the unanimated-move watch; an animated update starts none", () => {
  clear(); combatFlag = false;
  const A = makeToken("wat1", 100, 100);
  const from = F.calls.length;
  F.fire("updateToken", A.document, { x: 100 }, {}, "o");
  F.fire("updateToken", A.document, { name: "x" }, { animate: false }, "o");
  F.fire("updateToken", { id: "nobody", object: null }, { x: 1 }, { animate: false }, "o");
  F.fire("updateToken", A.document, { x: 100 }, { animate: false }, "o");
  mock.timers.tick(3200);
  assert.equal(calls(from).filter(c => c.op === "stopAnimation").length, 0, "drawn where the server has it: nothing to reset");
});

/* -------------------------------------------- */
/*  Where a stop rests a token                  */
/* -------------------------------------------- */

/** A walker drawn across the door at x 400-500, y 400, heading south: click it and read where the stop carries it. */
async function clickInDoorway(id) {
  const A = walk(makeToken(id, 400, 100), { x: 400, y: 360 }, { x: 400, y: 600 });
  const from = F.calls.length;
  A._onClickLeft({});
  await flush();
  const out = moves(from).map(m => [m.waypoints[0].x, m.waypoints[0].y, m.waypoints[0].action]);
  rest(A); sceneTokens.delete(id);
  return out;
}

test("takenAround: the ends of a mate's pending waves count as circles, so a click-stop never rests a token where an unsent wave is going", async () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400)];
  assert.deepEqual(await clickInDoorway("pnd1"), [[400, 360, "displace"], [400, 400, "walk"]], "alone: the first clear spot past the door's line");
  const real = exposed.groupPendingEnds;
  try {
    exposed.groupPendingEnds = () => [{ id: "mate1", x: 400, y: 400 }];
    assert.deepEqual(await clickInDoorway("pnd2"), [[400, 360, "displace"], [400, 500, "walk"]], "a mate's wave ends on that square: the next clear one along its way");
    exposed.groupPendingEnds = () => [{ id: "pnd3", x: 400, y: 400 }];
    assert.deepEqual(await clickInDoorway("pnd3"), [[400, 360, "displace"], [400, 400, "walk"]], "its own end is no claim on itself");
    exposed.groupPendingEnds = () => { throw new Error("no file"); };
    assert.deepEqual(await clickInDoorway("pnd4"), [[400, 360, "displace"], [400, 400, "walk"]], "a failing lookup is ignored");
  } finally { exposed.groupPendingEnds = real; }
});

test("a mate this client just sent (its write not back yet) is a claim too", async () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400)];
  const real = exposed.groupInFlight;
  exposed.groupInFlight = () => [{ id: "sent1", x: 400, y: 400, width: 1, height: 1 }];
  try { assert.deepEqual(await clickInDoorway("fly1"), [[400, 360, "displace"], [400, 500, "walk"]]); }
  finally { exposed.groupInFlight = real; }
});

test("a token at rest where the first clear spot would be moves the carry-on one on; a token hidden from a player is not counted", async () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400)];
  const R = makeToken("blk1", 400, 400);
  assert.deepEqual(await clickInDoorway("blk2"), [[400, 360, "displace"], [400, 500, "walk"]], "a token at rest on (400,400): clear of it at 500");
  R.document.hidden = true;
  assert.deepEqual(await clickInDoorway("blk3"), [[400, 360, "displace"], [400, 400, "walk"]], "hidden from a player: not counted");
  Object.defineProperty(game.user, "isGM", { value: true, configurable: true, writable: true });
  try { assert.deepEqual(await clickInDoorway("blk4"), [[400, 360, "displace"], [400, 500, "walk"]], "a GM counts it"); }
  finally { Object.defineProperty(game.user, "isGM", { value: false, configurable: true, writable: true }); }
});

test("settleTogether: a walker of this screen that a stopped token's walk on would pass through is stopped by the same stop (depth 0, then one more settle with none left)", async () => {
  clear(); combatFlag = false;
  for (const [id, x] of [["stA", 200], ["stB", 150], ["stC", 350]]) makeToken(id, x, 100);
  for (const [id, x, to] of [["w0", 350, 900], ["w1", 200, 900], ["w2", 600, 0], ["w3", 50, 0]]) {
    walk(makeToken(id, x, 100), { x, y: 100 }, { x: to, y: 100 }, { from: { x: to === 900 ? 0 : 900, y: 100 } });
  }
  solid.push([{ x: 402, y: 0 }, { x: 402, y: 300 }]);                     // a wall across w0's way ahead
  const from = F.calls.length;
  withGroup({ held: true, ids: ["w0"], sender: "me" }, () => sceneTokens.get("w0").object._onClickLeft({}));
  await flush();
  const mt = calls(from).filter(c => c.op === "moveTokens");
  assert.equal(mt.length, 1, "one update for everything this stop stopped");
  assert.deepEqual(mt[0].ids, ["w1", "w2", "w3"], "w0 itself is not written: it walks on to its own square");
  assert.deepEqual(mt[0].options.pentarynMovementStopAt, { w1: null, w2: null, w3: null }, "each where it is drawn");
  assert.deepEqual(moves(from).map(m => [m.id, m.waypoints[0].x, m.waypoints[0].y]), [["w1", 200, 100], ["w2", 600, 100], ["w3", 50, 100]]);
  assert.deepEqual(warnings(from), ["Could not stop clear of another token, so walked on to its own square: w0.", "Stopped on another token, with no free spot along its own way: w1. Drag it clear."]);
  assert.deepEqual(lastStop(), { tokenId: "w0", name: "w0", how: "displace", via: "click", walkedOn: 1, also: 2, members: 0, whole: true }, "also 2: two by stopAlso, the third by settleTogether");
  assert.deepEqual(exposed.stopWalkingOn(), [], "no walk on is left owing");
});

test("a walk on is a claim for 3 s: another stop never rests a token on it, then the claim lapses", async () => {
  clear(); combatFlag = false;
  const x = walk(makeToken("clm1", 400, 100), { x: 400, y: 100 }, { x: 900, y: 100 }, { from: { x: 0, y: 100 } });
  walk(makeToken("clm2", 280, 100), { x: 280, y: 100 }, { x: 0, y: 100 }, { from: { x: 900, y: 100 } });
  makeToken("clmS", 430, 100); makeToken("clmT", 560, 100);
  const stuck = new Promise(() => {});
  const realMove = x.document.move;
  x.document.move = function (wps, opts) { return wps[0].action === "walk" ? stuck : realMove.call(this, wps, opts); };
  x._onClickLeft({});
  await flush();
  const owed = () => exposed.stopWalkingOn().map(({ at, ...r }) => r);
  assert.deepEqual(owed(), [{ id: "clm1", x: 330, y: 100, w: 1, h: 1 }], "the walk on that never lands is still owed");
  mock.timers.tick(3000);
  assert.equal(owed().length, 1, "at 3 s");
  mock.timers.tick(1);
  assert.deepEqual(owed(), [], "after 3 s the claim lapses");
});

/* -------------------------------------------- */
/*  drop.mjs: a door shut, a wall raised        */
/* -------------------------------------------- */

const openDoor = () => ({ id: "doorWall00000002", parent: sceneDoc, _source: { c: [400, 400, 500, 400], move: 20, sight: 20, door: 1, ds: 1 } });
const shutDoor = () => door(400, 400, 500, 400, { ds: 0 });

test("a door shut on a jam is refused: preUpdateWall returns false, the walls and walkers stay as they are, 'Door blocked: {name} is in the doorway'", async () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400, { ds: 1 })];
  // "Jam" walks north through the door, drawn across its line; "Back" at rest behind it touches it: with the door shut ahead it can neither go on nor back off.
  const jam = walk(makeToken("jam1", 400, 100, { name: "Jam" }), { x: 400, y: 360 }, { x: 400, y: 100 }, { from: { x: 400, y: 700 }, via: [] });
  jam.document.movement.origin = { x: 400, y: 700 };
  makeToken("jamBack", 400, 460);
  const wall = openDoor();
  const from = F.calls.length;
  const walls0 = JSON.stringify(sceneDoc.walls), src0 = JSON.stringify(wall._source);
  assert.equal(F.fireCall("preUpdateWall", wall, { ds: 0 }, {}, "gm"), false);
  assert.deepEqual(warnings(from), ["Door blocked: Jam is in the doorway."]);
  assert.deepEqual(told(), { kind: "doorBlocked", reason: "doorBlocked", text: "Door blocked: Jam is in the doorway." });
  assert.equal(calls(from).filter(c => c.op === "move" || c.op === "moveTokens" || c.op === "stopMovement").length, 0, "a dry run: nothing stopped, nothing written");
  assert.equal(JSON.stringify(sceneDoc.walls), walls0);
  assert.equal(JSON.stringify(wall._source), src0);
  assert.equal(jam.animationContexts.size, 1, "still walking");
  assert.equal(F.fireCall("preUpdateWall", wall, { ds: 2 }, {}, "gm"), false, "locked counts as shut");
  // Never refused: an opening, a non-door, a change with no door state.
  assert.notEqual(F.fireCall("preUpdateWall", { ...wall, _source: { ...wall._source, ds: 0 } }, { ds: 1 }, {}, "gm"), false);
  assert.notEqual(F.fireCall("preUpdateWall", wall, { sight: 0 }, {}, "gm"), false);
  assert.notEqual(F.fireCall("preUpdateWall", { ...wall, _source: { ...wall._source, door: 0 } }, { ds: 0 }, {}, "gm"), false);
  // The jam gone: room behind to back off, so the door shuts. In a fight, or with the GM's drag help off, never refused.
  combatFlag = true;
  assert.notEqual(F.fireCall("preUpdateWall", wall, { ds: 0 }, {}, "gm"), false, "a fight: no veto");
  combatFlag = false;
  await game.settings.set(MOD, "assist", false);
  try { assert.notEqual(F.fireCall("preUpdateWall", wall, { ds: 0 }, {}, "gm"), false, "assist off: no veto"); }
  finally { await game.settings.set(MOD, "assist", true); }
  sceneTokens.delete("jamBack");
  assert.notEqual(F.fireCall("preUpdateWall", wall, { ds: 0 }, {}, "gm"), false, "room to back off");
});

test("the refusal names the walker 'a token' to a player who cannot read its name", () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400, { ds: 1 })];
  const jam = walk(makeToken("jam2", 400, 100, { name: "Secret Jam" }), { x: 400, y: 360 }, { x: 400, y: 100 });
  jam.document.movement.origin = { x: 400, y: 700 };
  jam.document.isOwner = false;
  jam.document.displayName = 0;
  makeToken("jamBack2", 400, 460);
  const from = F.calls.length;
  assert.equal(F.fireCall("preUpdateWall", openDoor(), { ds: 0 }, {}, "gm"), false);
  assert.deepEqual(warnings(from), ["Door blocked: a token is in the doorway."]);
  jam.document.displayName = 50;                                              // a nameplate shown to everyone
  const again = F.calls.length;
  assert.equal(F.fireCall("preUpdateWall", openDoor(), { ds: 0 }, {}, "gm"), false);
  assert.deepEqual(warnings(again), ["Door blocked: Secret Jam is in the doorway."]);
});

test("a door shut that every crossing walker can settle goes; the cut then stops each crossing walker where it is drawn, in one update", async () => {
  clear(); combatFlag = false;
  sceneDoc.walls = [door(400, 400, 500, 400, { ds: 1 })];
  const a = walk(makeToken("cut1a", 400, 100), { x: 400, y: 200 }, { x: 400, y: 700 });
  const b = walk(makeToken("cut1b", 450, 100), { x: 450, y: 100 }, { x: 450, y: 700 });
  const off = walk(makeToken("cut1c", 700, 100), { x: 700, y: 200 }, { x: 900, y: 200 });         // its way crosses no wall
  assert.notEqual(F.fireCall("preUpdateWall", openDoor(), { ds: 0 }, {}, "gm"), false, "room to settle: the shut goes");
  solid.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);                                        // the door is shut now
  sceneDoc.walls = [shutDoor()];
  const from = F.calls.length;
  F.fire("updateWall", { id: "doorWall00000002", parent: sceneDoc, _source: { c: [400, 400, 500, 400], move: 20, door: 1, ds: 0 } }, { ds: 0 }, {}, "gm");
  await flush();
  const mt = calls(from).filter(c => c.op === "moveTokens");
  assert.equal(mt.length, 1);
  assert.deepEqual(mt[0].ids.sort(), ["cut1a", "cut1b"]);
  assert.deepEqual(moves(from).map(m => [m.id, m.waypoints[0].x, m.waypoints[0].y, m.waypoints[0].action, m.options.animate]).sort(), [["cut1a", 400, 200, "displace", false], ["cut1b", 450, 100, "displace", false]]);
  assert.equal(moves(from).some(m => m.id === "cut1c"), false);
  assert.equal(api.status().group.cut.why, "wall");
  assert.equal(api.status().group.cut.members, 2);
  [a, b, off].forEach(rest);
});

test("a wall change that does not touch ds, door, move, c or dir is ignored; a wall that does not block movement cuts nothing", async () => {
  clear(); combatFlag = false;
  const a = walk(makeToken("cut2a", 400, 100), { x: 400, y: 200 }, { x: 400, y: 700 });
  const wall = { id: "w", parent: sceneDoc, _source: { c: [300, 400, 600, 400], move: 20, door: 0 } };
  const from = F.calls.length;
  F.fire("updateWall", wall, { sight: 0, light: 0 }, {}, "gm");
  F.fire("createWall", { ...wall, _source: { ...wall._source, move: 0 } }, {}, "gm");
  await flush();
  assert.equal(moves(from).length, 0);
  F.fire("createWall", wall, {}, "gm");
  await flush();
  assert.deepEqual(moves(from).map(m => m.id), ["cut2a"], "a new wall across the route cuts it");
  rest(a);
});

test("cutNow throwing: warnOnce 'drop-cut' and a telemetry error {reason: 'cut'}; the updateWall hook never throws", () => {
  clear(); combatFlag = false;
  const tele = [], real = { stopBatched: exposed.stopBatched, tele: exposed.tele };
  exposed.stopBatched = () => { throw new Error("cut failed"); };
  exposed.tele = (...a) => tele.push(a);
  warned.length = 0;
  try {
    const wall = { id: "w", parent: sceneDoc, _source: { c: [300, 400, 600, 400], move: 20, door: 0 } };
    F.fire("updateWall", wall, { ds: 0 }, {}, "gm");
    F.fire("updateWall", wall, { ds: 0 }, {}, "gm");
    F.fire("createWall", wall, {}, "gm");
  } finally { Object.assign(exposed, real); }
  assert.deepEqual(tele, [["error", { reason: "cut" }], ["error", { reason: "cut" }], ["error", { reason: "cut" }]]);
  assert.deepEqual(warned.filter(w => /wall raised mid-walk/.test(w)), ["pentaryn-movement | a wall raised mid-walk could not stop the moves crossing it (further errors suppressed) Error: cut failed"], "once");
});

test("a failing door check never vetoes: preUpdateWall warns once and lets the change through", () => {
  clear(); combatFlag = false;
  const real = exposed.stopShutBlocked;
  exposed.stopShutBlocked = () => { throw new Error("check failed"); };
  warned.length = 0;
  try {
    assert.equal(F.fireCall("preUpdateWall", openDoor(), { ds: 0 }, {}, "gm"), true);
    assert.equal(F.fireCall("preUpdateWall", openDoor(), { ds: 0 }, {}, "gm"), true);
  } finally { exposed.stopShutBlocked = real; }
  assert.equal(warned.filter(w => /door shut could not be checked/.test(w)).length, 1);
});

/* -------------------------------------------- */
/*  drop.mjs: a fight's next square             */
/* -------------------------------------------- */

const moveOp = (id, from, to, { chain = [], method = "dragging" } = {}) => ({
  id, chain, method, origin: { ...from, width: 1, height: 1 }, destination: { ...to, width: 1, height: 1 },
  passed: { waypoints: [{ ...to, width: 1, height: 1 }] }, pending: { waypoints: [] },
});
const step = () => { const { at, ...rest } = api.status().group.step ?? {}; return rest; };
const cont = { _movementArguments: { continuationId: "c1" } };

test("in a fight a next square into a token standing still is not sent: step.why 'standing', the square held, the standing token's id", () => {
  clear(); combatFlag = true;
  const t = makeToken("nxt1", 100, 100, { name: "Mover" }), stand = makeToken("nxt2", 300, 100);
  void stand;
  F.fireCall("preMoveToken", t.document, moveOp("mvNxt1", { x: 100, y: 100 }, { x: 200, y: 100 }), {});
  const into = moveOp("mvNxt2", { x: 200, y: 100 }, { x: 300, y: 100 }, { chain: ["mvNxt1"] });
  const from = F.calls.length;
  assert.equal(F.fireCall("preMoveToken", t.document, into, cont), false);
  assert.deepEqual(step(), { id: "nxt1", name: "Mover", why: "standing", fight: true, hit: "nxt2" });
  assert.deepEqual([t.document._source.x, t.document._source.y], [100, 100], "it stays on the square it holds");
  assert.deepEqual(calls(from).filter(c => c.op === "notify").map(c => c.message), ["PENTARYN_MOVEMENT.notify.stoppedShort"], "told 'Stopped short, way blocked.'");
  assert.equal(told().reason, "step:standing");
  combatFlag = false;
});

test("a next square of a token this page does not draw: 'unrendered' in a fight, 'wallUnrendered' out of one across a wall", () => {
  clear(); combatFlag = true;
  const t = makeToken("nxt3", 100, 200);
  t.document.rendered = false;
  assert.equal(F.fireCall("preMoveToken", t.document, moveOp("mvNxt3", { x: 100, y: 200 }, { x: 100, y: 300 }), {}), false);
  assert.deepEqual([step().why, step().fight, step().hit], ["unrendered", true, null]);
  combatFlag = false;
  sceneDoc.walls = [{ c: [0, 400, 400, 400], door: 0, ds: 0, move: 20 }];
  assert.equal(F.fireCall("preMoveToken", t.document, moveOp("mvNxt4", { x: 100, y: 300 }, { x: 100, y: 400 }), {}), false);
  assert.deepEqual([step().why, step().fight], ["wallUnrendered", false]);
  assert.notEqual(F.fireCall("preMoveToken", t.document, moveOp("mvNxt5", { x: 400, y: 300 }, { x: 400, y: 400 }), {}), false, "round the end of the wall: it goes");
  t.document.rendered = true;
  assert.notEqual(F.fireCall("preMoveToken", t.document, moveOp("mvNxt6", { x: 100, y: 300 }, { x: 100, y: 400 }), {}), false, "out of combat and drawn here: core's, untouched");
});

test("a move the module did not drive, or a move with ghost/ignoreWalls, is never touched", () => {
  clear(); combatFlag = true;
  const t = makeToken("nxt4", 100, 100);
  t.document.rendered = false;
  assert.notEqual(F.fireCall("preMoveToken", t.document, moveOp("mvNxt7", { x: 100, y: 100 }, { x: 100, y: 200 }, { method: "api" }), {}), false, "an API move");
  assert.notEqual(F.fireCall("preMoveToken", t.document, { ...moveOp("mvNxt8", { x: 100, y: 100 }, { x: 100, y: 200 }), constrainOptions: { ignoreWalls: true } }, {}), false, "ghost");
  assert.notEqual(F.fireCall("preMoveToken", t.document, { ...moveOp("mvNxt9", { x: 100, y: 100 }, { x: 100, y: 200 }), destination: undefined, passed: { waypoints: [] } }, {}), false, "nowhere to go");
  combatFlag = false;
});

test("a one-way wall met from its open side lets the next square go; from the other side it holds (why 'wall')", () => {
  clear(); combatFlag = true;
  const t = makeToken("nxt5", 700, 100);
  sceneDoc.walls = [{ c: [800, 0, 800, 300], door: 0, ds: 0, move: 20, dir: 1 }];
  assert.equal(F.fireCall("preMoveToken", t.document, moveOp("mvOw1", { x: 700, y: 100 }, { x: 800, y: 100 }), {}), true, "from the open side");
  t.document._source.x = 800;
  assert.equal(F.fireCall("preMoveToken", t.document, moveOp("mvOw2", { x: 800, y: 100 }, { x: 700, y: 100 }), {}), false, "from the walled side");
  assert.equal(step().why, "wall");
  sceneDoc.walls = [{ c: [800, 0, 800, 300], door: 0, ds: 0, move: 20, dir: 2 }];
  assert.equal(F.fireCall("preMoveToken", t.document, moveOp("mvOw3", { x: 800, y: 100 }, { x: 700, y: 100 }), {}), true, "the other direction flips it");
  combatFlag = false;
});

/* -------------------------------------------- */
/*  group-adapter.mjs                           */
/* -------------------------------------------- */

const box = (x0, y0, x1, y1) => [[{ x: x0, y: y0 }, { x: x1, y: y0 }], [{ x: x1, y: y0 }, { x: x1, y: y1 }], [{ x: x1, y: y1 }, { x: x0, y: y1 }], [{ x: x0, y: y1 }, { x: x0, y: y0 }]];

test("clearOfWalls: a square that fits and is free is returned as it is; snapping wants a whole square", () => {
  clear();
  const t = makeToken("cow1", 700, 700);
  assert.deepEqual(clearOfWalls(t, { x: 200, y: 200 }, { snap: true }), { x: 200, y: 200 });
  assert.deepEqual(clearOfWalls(t, { x: 230, y: 210 }), { x: 230, y: 210 }, "not snapping: where it is");
  assert.deepEqual(clearOfWalls(t, { x: 230, y: 210 }, { snap: true }), { x: 200, y: 200 }, "snapping: the nearest whole square");
  assert.deepEqual(clearOfWalls(t, { x: 200, y: 200 }, { snap: true, prefer: q => q.x === 300 }), { x: 300, y: 200 }, "`prefer`: the nearest square it also likes");
});

test("clearOfWalls snap fallback: with no free square its centre can walk to, a free one that fits even past a corner", () => {
  clear();
  const t = makeToken("cow2", 700, 700);
  solid.push(...box(190, 190, 310, 310));                       // a closed cell round the square at (200,200)
  const taken = q => q.x === 200 && q.y === 200;
  assert.deepEqual(clearOfWalls(t, { x: 200, y: 200 }, { snap: true, taken }), { x: 100, y: 100 }, "the nearest free square that fits, across the wall");
});

test("clearOfWalls snap fallback: with every square taken, the nearest that fits, the spot itself when it does", () => {
  clear();
  const t = makeToken("cow3", 700, 700);
  solid.push(...box(190, 190, 310, 310));
  assert.deepEqual(clearOfWalls(t, { x: 200, y: 200 }, { snap: true, taken: () => true }), { x: 200, y: 200 });
});

test("clearOfWalls without snapping: fits(p) is p even when taken; else the nearest ok square within 1.5 squares; else p unchanged", () => {
  clear();
  const t = makeToken("cow4", 700, 700);
  assert.deepEqual(clearOfWalls(t, { x: 200, y: 200 }, { taken: () => true }), { x: 200, y: 200 }, "everything taken, p fits: p");
  solid.push([{ x: 1000, y: 1015 }, { x: 1500, y: 1015 }]);       // 15 px under the spot's top edge: its body crosses the wall
  assert.deepEqual(clearOfWalls(t, { x: 1000, y: 1000 }, { taken: () => true }), { x: 900, y: 1000 }, "p does not fit: the nearest square that does, taken or not");
  assert.deepEqual(clearOfWalls(t, { x: 1000, y: 1000 }), { x: 900, y: 1000 });
  assert.deepEqual(clearOfWalls(t, { x: -2000, y: -2000 }, { taken: () => true }), { x: -2000, y: -2000 }, "off the scene: nothing fits, p unchanged");
});

test("clearOfWalls: a body across a door's line (open or shut) does not fit; the nearest square clear of the line does", () => {
  clear();
  sceneDoc.walls = [door(400, 400, 500, 400, { ds: 1 })];
  const t = makeToken("cow5", 100, 100);
  assert.equal(doorwayAt(t, { x: 450, y: 449 }), true);
  assert.equal(doorwayAt(t, { x: 450, y: 450.5 }), false, "touching the line is fine: 49.5 px");
  assert.equal(doorwayAt(t, { x: 450, y: 450 }), false);
  assert.deepEqual(clearOfWalls(t, { x: 400, y: 360 }), { x: 400, y: 400 }, "the nearest square its body fits on: its box touching the line (50 px from it)");
});

test("fitPath: a 1x1 token or a path of one point is returned whole; a 2x2 where its body fits the way is whole", () => {
  clear();
  const one = makeToken("fit1", 100, 100);
  const p1 = [{ x: 100, y: 100 }, { x: 900, y: 300 }];
  assert.deepEqual(fitPath(one, p1), { path: p1, cut: false });
  const big = makeToken("fit2", 100, 100, { size: 2 });
  const p2 = [{ x: 100, y: 100, width: 2, height: 2 }, { x: 900, y: 300, width: 2, height: 2 }];
  assert.deepEqual(fitPath(big, p2), { path: p2, cut: false });
  assert.deepEqual(fitPath(big, [p2[0]]), { path: [p2[0]], cut: false });
  assert.deepEqual(fitPath(big, null), { path: null, cut: false });
});

test("fitPath on a slanted line with no whole square on it falls back to the last position its whole body fits (unsnapped, explicit)", () => {
  clear();
  const walls = [[{ x: 0, y: 400 }, { x: 350, y: 400 }], [{ x: 550, y: 400 }, { x: 1500, y: 400 }], [{ x: 150, y: 100 }, { x: 250, y: 300 }]];
  solid.push(...walls);
  sceneDoc.walls = walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 }));
  const big = makeToken("fit3", 250, 50, { size: 2 });
  const path = [{ x: 250, y: 50, width: 2, height: 2, snapped: false, explicit: false, checkpoint: false }, { x: 50, y: 250, width: 2, height: 2, snapped: false, explicit: true, checkpoint: true }];
  const out = fitPath(big, path);
  assert.equal(out.cut, true);
  assert.deepEqual(out.path.map(p => [p.x, p.y, p.snapped, p.explicit, p.checkpoint]), [[250, 50, false, false, false], [217, 83, false, true, true]]);
});

test("fitPath: a cut big token rests on a whole square when one is on the way (S1R1-07), through the door's gap it does not fit", () => {
  clear();
  const walls = [[{ x: 0, y: 400 }, { x: 400, y: 400 }], [{ x: 500, y: 400 }, { x: 1000, y: 400 }]];
  solid.push(...walls);
  sceneDoc.walls = walls.map(([a, b]) => ({ c: [a.x, a.y, b.x, b.y], door: 0, ds: 0, move: 20 }));
  const big = makeToken("fit4", 350, 100, { size: 2 });
  const path = [{ x: 350, y: 100, width: 2, height: 2, snapped: false, explicit: false, checkpoint: false }, { x: 350, y: 600, width: 2, height: 2, snapped: true, explicit: true, checkpoint: true }];
  const out = fitPath(big, path);
  assert.equal(out.cut, true);
  const end = out.path.at(-1);
  assert.deepEqual([end.x % 100, end.y % 100, end.explicit], [0, 0, true], "a whole square");
  assert.ok(end.y + 200 <= 400, `its body before the wall: ${JSON.stringify(end)}`);
});

/** A token with a PIXI position, for the pin and the drawn position. */
function pinTok(id, src, drawn) {
  const t = makeToken(id, src.x, src.y);
  t.document.x = drawn.x; t.document.y = drawn.y;
  t.position = { x: drawn.x, y: drawn.y, set(x, y) { this.x = x; this.y = y; F.calls.push({ op: "pos.set", id, x, y }); } };
  return t;
}

test("stopWhereDrawn puts the document's derived position on where it is drawn, then stops the tween keeping it (reset false), in that order", () => {
  clear();
  const t = pinTok("swd1", { x: 600, y: 100 }, { x: 600, y: 100 });
  let seen = null;
  t.stopAnimation = function (o) { seen = { x: this.document.x, y: this.document.y, o }; };
  stopWhereDrawn(t, { x: 320, y: 100 });
  assert.deepEqual(seen, { x: 320, y: 100, o: { reset: false } });
  seen = null;
  stopWhereDrawn(t, { x: NaN, y: 1 });
  assert.deepEqual(seen, { x: 320, y: 100, o: { reset: false } }, "a non-finite point leaves the position alone");
  assert.doesNotThrow(() => stopWhereDrawn(null, { x: 1, y: 1 }), "a missing token with a point: nothing");
});

test("ODD: stopWhereDrawn(null) with no point throws (its `at` default reads the token before its own guard can return)", () => {
  assert.throws(() => stopWhereDrawn(null), TypeError);
  assert.throws(() => stopWhereDrawn({ document: null }), TypeError);
});

test("pinDrawn / holdPinned / unpin: the drawn position is held until the source reaches the target; unpin lets go", () => {
  clear();
  const t = pinTok("pin1", { x: 600, y: 100 }, { x: 320, y: 100 });
  assert.equal(holdPinned(t), false, "no pin: nothing");
  pinDrawn(t, { x: 320, y: 100 }, { x: 320, y: 100 });
  // A re-preparation drew it back on the destination: put back on the pin (document and sprite).
  t.document.x = 600; t.position.x = 600;
  const from = F.calls.length;
  assert.equal(holdPinned(t), true);
  assert.deepEqual([t.document.x, t.document.y, t.position.x, t.position.y], [320, 100, 320, 100]);
  assert.deepEqual(calls(from).filter(c => c.op === "pos.set").map(c => [c.x, c.y]), [[320, 100]]);
  assert.equal(holdPinned(t), false, "already drawn there");
  // The server has it: the pin is let go.
  t.document._source.x = 320;
  assert.equal(holdPinned(t), false);
  t.document.x = 600;
  assert.equal(holdPinned(t), false, "the pin is gone: a later re-preparation is left alone");
  assert.equal(t.document.x, 600);
  // unpin
  t.document._source.x = 600;
  pinDrawn(t, { x: 320, y: 100 }, { x: 320, y: 100 });
  unpin(t);
  assert.equal(holdPinned(t), false);
  pinDrawn(t, { x: 320, y: 100 }, { x: 320, y: 100 });
  unpin("pin1");
  assert.equal(holdPinned(t), false, "unpin by id too");
});

test("pinDrawn ignores a token without an id or a point that is not finite", () => {
  clear();
  const t = pinTok("pin2", { x: 600, y: 100 }, { x: 600, y: 100 });
  pinDrawn(t, { x: NaN, y: 100 }, { x: 320, y: 100 });
  pinDrawn(t, { x: 320, y: 100 }, undefined);
  pinDrawn({ document: {} }, { x: 320, y: 100 }, { x: 320, y: 100 });
  t.document.x = 600;
  assert.equal(holdPinned(t), false);
});

test("a pin lets go after 1.5 s, or when the server has the token somewhere else: drawn where the server has it", () => {
  clear();
  const t = pinTok("pin3", { x: 600, y: 100 }, { x: 320, y: 100 });
  pinDrawn(t, { x: 320, y: 100 }, { x: 320, y: 100 });
  clock.t += 1501;
  assert.equal(holdPinned(t), false, "ran out");
  assert.deepEqual([t.document.x, t.position.x], [600, 600], "drawn where the server has it, document and sprite");
  const u = pinTok("pin4", { x: 600, y: 100 }, { x: 320, y: 100 });
  pinDrawn(u, { x: 320, y: 100 }, { x: 320, y: 100 });
  u.document._source.x = 900;                                          // another user's stop put it elsewhere
  assert.equal(holdPinned(u), false);
  assert.equal(u.document.x, 900, "drawn where the server has it now");
  const v = pinTok("pin5", { x: 600, y: 100 }, { x: 320, y: 100 });
  pinDrawn(v, { x: 320, y: 100 }, { x: 320, y: 100 });
  v.destroyed = true;
  assert.equal(holdPinned(v), false, "a destroyed token: the pin is dropped");
});

test("holdPinned while a tween runs: true, and the tween is stopped where it is pinned on a microtask", async () => {
  clear();
  const t = pinTok("pin6", { x: 600, y: 100 }, { x: 320, y: 100 });
  pinDrawn(t, { x: 320, y: 100 }, { x: 320, y: 100 });
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.x = 330; t.position.x = 330;
  const from = F.calls.length;
  assert.equal(holdPinned(t), true);
  assert.equal(calls(from).filter(c => c.op === "stopAnimation").length, 0, "not at once");
  await flush();
  assert.deepEqual(calls(from).filter(c => c.op === "stopAnimation").map(c => [c.id, c.opts]), [["pin6", { reset: false }]]);
  assert.deepEqual([t.document.x, t.document.y], [320, 100]);
  unpin(t);
});

test("drawnPosition: the document's rounded position; while a tween runs on a document re-prepared onto its source, the sprite's", () => {
  clear();
  const t = pinTok("drw1", { x: 600, y: 100 }, { x: 320.4, y: 99.6 });
  assert.deepEqual(drawnPosition(t), { x: 320, y: 100, elevation: 0 });
  t.document.x = 600; t.document.y = 100;                           // re-prepared onto the source
  t.position.x = 410; t.position.y = 100;
  assert.deepEqual(drawnPosition(t), { x: 600, y: 100, elevation: 0 }, "at rest: the document");
  t.animationContexts.set(t.movementAnimationName, {});
  assert.deepEqual(drawnPosition(t), { x: 410, y: 100, elevation: 0 }, "animating: where the sprite is");
  t.destroyed = true;
  assert.deepEqual(drawnPosition(t), { x: 600, y: 100, elevation: 0 }, "a destroyed sprite's position is never read");
  const bad = pinTok("drw2", { x: 600, y: 100 }, { x: 600, y: 100 });
  bad.animationContexts.set(bad.movementAnimationName, {});
  Object.defineProperty(bad, "position", { get() { throw new Error("null transform"); } });
  assert.deepEqual(drawnPosition(bad), { x: 600, y: 100, elevation: 0 });
});

/* -------------------------------------------- */
/*  group-core.mjs: what stop.mjs reads         */
/* -------------------------------------------- */

test("firstIntrusion: where a way first comes inside a circle, { k, t } on its segment; a circle it starts on is left out; null when it never does", () => {
  const way = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }];
  const hit = firstIntrusion(way, 0.5, [{ x: 2, y: 0, r: 0.5 }]);
  assert.equal(hit.k, 0);
  assert.ok(Math.abs(hit.t - 0.25) < 1e-6, `1 square short of the circle's centre: ${hit.t}`);
  assert.equal(firstIntrusion(way, 0.5, [{ x: 0.5, y: 0, r: 0.5 }]), null, "starting inside it: an overlap already there");
  assert.equal(firstIntrusion(way, 0.5, [{ x: 2, y: 3, r: 0.5 }]), null);
  const side = firstIntrusion(way, 0.5, [{ x: 4, y: 2, r: 0.5 }]);
  assert.equal(side.k, 1);
  assert.ok(Math.abs(side.t - 0.25) < 1e-3, `${side.t}`);
  assert.equal(firstIntrusion(way, 0.5, []), null);
  assert.equal(firstIntrusion([way[0]], 0.5, [{ x: 2, y: 0, r: 0.5 }]), null, "a point is no way");
  assert.equal(firstIntrusion([{ x: 0, y: 0 }, { x: 4, y: 0 }], 0.5, [{ x: 0, y: 0.8, r: 0.5 }]), null, "0.8 apart (touching is 1.0): already overlapping at the start, left out");
});

/* -------------------------------------------- */
/*  The GM's click, and the listeners' guards   */
/* -------------------------------------------- */

test("a GM's click in combat on another user's move asks the starter (stopOwn, 400 ms) and never the relay; a starter that fails leaves everything as it was", async () => {
  clear(); combatFlag = true;
  const A = makeToken("gms1", 100, 100);
  const asked = [];
  let answer = async () => { throw new Error("gone"); };
  const starter = { id: "player0000000002", isSelf: false, active: true, query: async (name, data, opts) => { asked.push({ name, data, opts }); return answer(); } };
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 }, { user: starter });
  Object.defineProperty(game.user, "isGM", { value: true, configurable: true, writable: true });
  try {
    const from = F.calls.length;
    A._onClickLeft({});
    await flush();
    assert.deepEqual(asked, [{ name: `${MOD}.stopOwn`, data: { ref: A.document.uuid }, opts: { timeout: 400 } }]);
    assert.equal(calls(from).filter(c => c.op === "query" || c.op === "stopMovement" || c.op === "move").length, 0, "the starter failed: nothing else");
    assert.deepEqual(await api.stop(A.document), { ok: false, code: "NO_ANSWER", reason: "the client that started the move did not stop it" });
    answer = async () => ({ ok: true, how: "stop", tokenId: "gms1" });
    assert.deepEqual(await api.stop(A.document), { ok: true, how: "stop", tokenId: "gms1" });
    starter.active = false;
    asked.length = 0;
    A._onClickLeft({});
    await flush();
    assert.deepEqual(asked, [], "a starter that went offline is not asked");
  } finally {
    Object.defineProperty(game.user, "isGM", { value: false, configurable: true, writable: true });
    rest(A); combatFlag = false;
  }
});

test("stopOwn on the starter's client: only a GM sender, only a token it started; it stops the group it sent and records how: 'stopOwn'", async () => {
  clear(); combatFlag = true;
  const A = makeToken("sow1", 100, 100);
  walk(A, { x: 320, y: 100 }, { x: 600, y: 100 });
  const handler = CONFIG.queries[`${MOD}.stopOwn`];
  assert.equal(typeof handler, "function");
  globalThis.fromUuidSync = u => (u === A.document.uuid ? A.document : null);
  try {
    assert.equal((await handler({ ref: A.document.uuid }, { user: { isGM: false } })).code, "NOT_GM");
    assert.equal((await handler({ ref: "Scene.x.Token.nope" }, { user: { isGM: true } })).code, "NOT_FOUND");
    assert.equal((await handler({}, { user: { isGM: true } })).code, "NOT_FOUND");
    const from = F.calls.length;
    assert.deepEqual(await handler({ ref: A.document.uuid }, { user: { isGM: true, id: "gm9" } }), { ok: true, how: "stop", tokenId: "sow1" });
    assert.equal(calls(from).filter(c => c.op === "stopMovement").length, 1);
    assert.deepEqual(lastStop(), { tokenId: "sow1", how: "stopOwn", by: "gm9" });
    A.document.movement.user = { isSelf: false };
    assert.equal((await handler({ ref: A.document.uuid }, { user: { isGM: true } })).code, "NOT_INITIATOR");
  } finally { delete globalThis.fromUuidSync; rest(A); combatFlag = false; }
});

test("a board or door press that throws warns once (further errors suppressed) and never throws out of the listener", () => {
  clear(); combatFlag = false;
  const A = makeToken("grd1", 400, 100);
  walk(A, { x: 430, y: 300 }, { x: 400, y: 600 });
  warned.length = 0;
  const real = F.canvas.canvasCoordinatesFromClient;
  F.canvas.canvasCoordinatesFromClient = () => { throw new Error("no coords"); };
  try {
    boardDown(1, 1); boardDown(2, 2);
    assert.deepEqual(warned.filter(w => /\(board\)/.test(w)), ["pentaryn-movement | click to stop (board) skipped (further errors suppressed) Error: no coords"]);
  } finally { F.canvas.canvasCoordinatesFromClient = real; }
  assert.doesNotThrow(() => doorDown(485, 352, { stopPropagation: () => { throw new Error("no stop"); } }));
  assert.doesNotThrow(() => doorDown(485, 352, { stopPropagation: () => { throw new Error("no stop"); } }));
  assert.deepEqual(warned.filter(w => /over a door/.test(w)), ["pentaryn-movement | click to stop over a door skipped (further errors suppressed) Error: no stop"]);
  rest(A);
});

test("a board or door press is core's with the target tool or a modifier held (the same table as a click)", () => {
  clear(); combatFlag = false;
  const A = makeToken("grd2", 400, 100);
  walk(A, { x: 430, y: 300 }, { x: 400, y: 600 });
  const from = F.calls.length;
  boardDown(480, 350, { shiftKey: true });
  assert.equal(doorDown(485, 352, { ctrlKey: true }), false, "a modifier: the icon's own toggle");
  F.game.activeTool = "target";
  try {
    boardDown(480, 350);
    assert.equal(doorDown(485, 352), false, "the target tool");
  } finally { F.game.activeTool = "select"; }
  assert.equal(moves(from).length, 0);
  assert.equal(doorDown(485, 352), true, "select tool, no modifier: stopped");
  assert.equal(moves(from).length, 1);
  rest(A);
});
