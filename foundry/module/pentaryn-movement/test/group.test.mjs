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
import { movementWorld, drop, clicks, doors, SCENE } from "./fixtures/world.mjs";
import { MOTION } from "../motion-core.mjs";
import { RESERVE } from "../reserve-core.mjs";
import { fitPath } from "../group-adapter.mjs";

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
  assert.equal(g.clickToStop, true);
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

test("a group through a door: each member its own route and spot, in waves, never resting on another", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("grpA000000000001", 400, 200), makeToken("grpB000000000001", 300, 200), makeToken("grpC000000000001", 500, 200)];
  const ctx = contextsFor(ts, 0, 400);
  const from = F.calls.length;
  const out = dropWith(ts[0], ctx);
  assert.ok(Array.isArray(out), "planned synchronously");
  const [updates, options] = out;
  assert.equal(options.method, "dragging");
  const first = updates.map(u => u._id);
  tickBy(5000);
  const later = sent(from);
  const all = [...first, ...later.flatMap(c => c.ids)];
  assert.deepEqual([...all].sort(), ts.map(t => t.document.id).sort(), "every member moves exactly once");
  assert.ok(later.length >= 1, "at least one later wave");
  for (const c of later) assert.equal(c.options.method, "dragging");
  const moves = { ...options.movement, ...Object.assign({}, ...later.map(c => c.options.movement)) };
  const ends = [];
  for (const t of ts) {
    const wps = moves[t.document.id].waypoints;
    const path = [t.document._source, ...wps];
    for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, `${t.document.id} leg ${k} crosses a wall`);
    for (const w of wps.slice(0, -1)) {
      assert.equal(w.explicit, false);
      assert.equal(w.checkpoint, false);
    }
    assert.equal(wps.at(-1).explicit, true);
    const end = center(wps.at(-1));
    assert.ok(end.y > 400, `${t.document.id} ends past the door`);
    ends.push(end);
  }
  assert.deepEqual([moves.grpA000000000001.waypoints.at(-1).x, moves.grpA000000000001.waypoints.at(-1).y], [400, 600], "the anchor lands where dropped");
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    assert.ok(Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) >= S - 1e-6, `no rest overlap (r1 + r2): ${JSON.stringify(ends)}`);
  }
  const last = api.status().group.last;
  assert.equal(last.result, "plan");
  assert.equal(last.async, false);
  assert.equal(last.waves, later.length + 1);
});

test("R2-5: a door closed after the drop cuts a waiting member's wave on a whole cell before it, never on the door line", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("drA0000000000001", 400, 200), makeToken("drB0000000000001", 300, 200), makeToken("drC0000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = new Set(out[0].map(u => u._id));
  const waiting = ts.filter(t => !first.has(t.document.id));
  assert.ok(waiting.length > 0, "at least one member waits for a later wave");
  // The GM closes the door (x 400–500 on y = 400) before the later waves go out.
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    tickBy(5000);
  } finally {
    world.walls.pop();
  }
  const moves = Object.assign({}, ...sent(from).map(c => c.options.movement));
  for (const t of waiting) {
    const wps = moves[t.document.id]?.waypoints;
    if (!wps) continue;                                // could not move at all: nothing sent, it stays put
    const path = [t.document._source, ...wps];
    world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
    try {
      for (let k = 1; k < path.length; k++) assert.equal(crossing(center(path[k - 1]), center(path[k])).length, 0, `${t.document.id} leg ${k} crosses the closed door`);
    } finally {
      world.walls.pop();
    }
    const end = wps.at(-1);
    assert.ok(end.x % S === 0 && end.y % S === 0, `${t.document.id} ends on a whole cell: ${JSON.stringify(end)}`);
    assert.ok(center(end).y < 400, `${t.document.id} stays on its own side of the door`);
    assert.equal(end.explicit, true);
  }
});

test("R4-1: a door closed after the drop never sends two waiting members to one cell before it, nor onto a token at rest", () => {
  combatFlag = false;
  clock.step = 0;
  // Only this test's tokens (and one ally resting by the door) stand on the scene meanwhile.
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const ts = [400, 300, 500, 200, 600, 100].map((x, k) => makeToken(`stk${k}00000000000`.slice(0, 16), x, 100));
  const ally = makeToken("stkAlly000000001", 300, 300);
  try {
    const out = dropWith(ts[0], contextsFor(ts, 0, 500));
    const first = new Set(out[0].map(u => u._id));
    const waiting = ts.filter(t => !first.has(t.document.id));
    assert.ok(waiting.length >= 3, `several members wait for later waves (${waiting.length})`);
    world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
    const from = F.calls.length;
    let moves;
    try {
      // Each wave's update lands on the server before the next goes out (the source moves to the cut spot).
      const onUpdate = viewedScene.updateEmbeddedDocuments;
      viewedScene.updateEmbeddedDocuments = async (type, updates, options) => {
        for (const u of updates) {
          const end = options.movement?.[u._id]?.waypoints?.at(-1);
          const d = sceneTokens.get(u._id);
          if (end && d) d._source = { ...d._source, x: end.x, y: end.y };
        }
        return onUpdate.call(viewedScene, type, updates, options);
      };
      try { tickBy(5000); } finally { viewedScene.updateEmbeddedDocuments = onUpdate; }
      moves = Object.assign({}, ...sent(from).map(c => c.options.movement));
    } finally {
      world.walls.pop();
    }
    const rest = t => moves[t.document.id]?.waypoints?.at(-1) ?? t.document._source;
    const cut = waiting.filter(t => moves[t.document.id]);
    assert.ok(cut.length >= 2, `at least two waiting members still walk to the door (${cut.length})`);
    const spots = [...waiting.map(t => ({ id: t.document.id, p: rest(t) })), { id: "ally", p: ally.document._source }];
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      const d = Math.hypot(spots[i].p.x - spots[j].p.x, spots[i].p.y - spots[j].p.y);
      assert.ok(d >= S - 1e-6, `${spots[i].id} and ${spots[j].id} rest ${d} px apart: ${JSON.stringify(spots)}`);
    }
    for (const t of cut) {
      const end = rest(t);
      assert.ok(end.x % S === 0 && end.y % S === 0, `${t.document.id} ends on a whole cell`);
      assert.ok(center(end).y < 400, `${t.document.id} stays north of the closed door`);
    }
  } finally {
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R5-1: a door closed mid-walk never sends a waiting member to the square where core will stop a member already walking", () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const ts = [400, 300, 500, 200, 600, 100].map((x, k) => makeToken(`wlk${k}00000000000`.slice(0, 16), x, 100));
  // Already on its way through the door with checkpoints to go: its source is the next checkpoint, (400, 200);
  // core's continuation will constrain the rest at the shut door and stop it on (400, 300).
  const walker = makeToken("wlkWalker0000001", 400, 200);
  walker.document.movement = { state: "pending", user: { isSelf: false }, pending: { waypoints: [wp(400, 300), wp(400, 600)] } };
  let asked = 0;
  walker.constrainMovementPath = path => {
    asked += 1;
    const out = [];
    for (const w of path) { if (out.length && crossing(center(out.at(-1)), center(w)).length) return [out, true]; out.push(w); }
    return [out, false];
  };
  try {
    const out = dropWith(ts[0], contextsFor(ts, 0, 500));
    const first = new Set(out[0].map(u => u._id));
    const waiting = ts.filter(t => !first.has(t.document.id));
    world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
    const from = F.calls.length;
    let moves;
    try {
      const onUpdate = viewedScene.updateEmbeddedDocuments;
      viewedScene.updateEmbeddedDocuments = async (type, updates, options) => {
        for (const u of updates) {
          const end = options.movement?.[u._id]?.waypoints?.at(-1);
          const d = sceneTokens.get(u._id);
          if (end && d) d._source = { ...d._source, x: end.x, y: end.y };
        }
        return onUpdate.call(viewedScene, type, updates, options);
      };
      try { tickBy(5000); } finally { viewedScene.updateEmbeddedDocuments = onUpdate; }
      moves = Object.assign({}, ...sent(from).map(c => c.options.movement));
    } finally {
      world.walls.pop();
    }
    assert.ok(asked > 0, "the walking token's stop was predicted with its own constrainMovementPath");
    for (const t of waiting) {
      const end = moves[t.document.id]?.waypoints?.at(-1);
      if (!end) continue;
      assert.ok(!(end.x === 400 && end.y === 300), `${t.document.id} is not sent to (400, 300), where the walker will stop`);
    }
  } finally {
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R5-1: when a group this client sent is at rest, a member left on top of another steps to the nearest free whole cell", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const ts = [makeToken("dstA000000000001", 400, 100), makeToken("dstB000000000001", 300, 100), makeToken("dstC000000000001", 500, 100)];
  try {
    dropWith(ts[0], contextsFor(ts, 0, 100));
    mock.timers.tick(100);
    // Whatever cut them (a door, core's own constrain), B and C end on one cell; A elsewhere.
    ts[0].document._source = { ...ts[0].document._source, x: 400, y: 200 };
    ts[1].document._source = { ...ts[1].document._source, x: 600, y: 200 };
    ts[2].document._source = { ...ts[2].document._source, x: 600, y: 200 };
    const from = F.calls.length;
    tickBy(20000);
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    assert.equal(moves.length, 1, `one member moves off the other: ${JSON.stringify(moves.map(m => [m.id, m.waypoints]))}`);
    assert.equal(moves[0].id, "dstC000000000001", "the later one in the group moves, the first stays");
    const p = moves[0].waypoints[0];
    assert.ok(p.x % S === 0 && p.y % S === 0, "onto a whole cell");
    assert.ok(Math.hypot(p.x - 600, p.y - 200) <= S * 1.5, "next to where it was");
    assert.ok(!(p.x === 400 && p.y === 200), "not onto A");
    assert.equal(p.y < 400, true, "on its own side of the wall");
    assert.ok(game.pentaryn.movement.status().group.destacked?.members === 1);
  } finally {
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R5-2: a wave due while the page unloads is not sent and stays in the record; a wave leaves it only once the server answered", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const store = new Map();
  const listeners = {};
  globalThis.sessionStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  globalThis.addEventListener = (type, fn) => { (listeners[type] ??= new Set()).add(fn); };
  globalThis.removeEventListener = (type, fn) => { listeners[type]?.delete(fn); };
  const KEY = "pentaryn-movement.pendingWaves";
  const waves = () => JSON.parse(store.get(KEY) ?? "[]").flatMap(r => r.waves.map(w => w.at));
  const ts = [400, 300, 500, 200, 600, 100].map((x, k) => makeToken(`unl${k}00000000000`.slice(0, 16), x, 100));
  try {
    const out = dropWith(ts[0], contextsFor(ts, 0, 500));
    const first = new Set(out[0].map(u => u._id));
    assert.ok(ts.some(t => !first.has(t.document.id)), "some members wait for later waves");
    const due = waves().sort((a, b) => a - b);
    assert.ok(due.length >= 2, `two or more later waves are recorded (${due})`);
    // The first later wave goes out; the server has not answered yet: it stays in the record.
    const onUpdate = viewedScene.updateEmbeddedDocuments;
    let answer;
    viewedScene.updateEmbeddedDocuments = (type, updates, options) => {
      F.calls.push({ op: "scene.update", type, ids: updates.map(u => u._id), options });
      return new Promise(r => { answer = r; });
    };
    const from = F.calls.length;
    try {
      mock.timers.tick(due[0]);
      assert.equal(sent(from).length, 1, "the first later wave is sent");
      await new Promise(r => setImmediate(r));
      assert.ok(waves().includes(due[0]), "not taken off before the server answered");
      answer([]);
      await new Promise(r => setImmediate(r));
      assert.ok(!waves().includes(due[0]), "taken off once answered");
    } finally { viewedScene.updateEmbeddedDocuments = onUpdate; }
    // A reload starts: the next wave is due while the old page still runs. Nothing goes out; it stays.
    for (const fn of listeners.beforeunload ?? []) fn();
    const mid = F.calls.length;
    mock.timers.tick(due[1] - due[0]);
    await new Promise(r => setImmediate(r));
    assert.equal(sent(mid).length, 0, "no wave is sent while the page unloads");
    assert.ok(waves().includes(due[1]), "the unsent wave is left for the reloaded page");
    // The navigation did not happen after all: the held wave goes out later.
    tickBy(2000);
    assert.ok(sent(mid).length >= 1, "the held wave goes out when the page stays");
  } finally {
    tickBy(10000);
    delete globalThis.sessionStorage;
    delete globalThis.addEventListener;
    delete globalThis.removeEventListener;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R4-3: a turn change that clears one member's history (core stops it) stops the whole group: unsent waves cancelled, the others stopped", () => {
  combatFlag = true;
  clock.step = 0;
  const ts = [makeToken("trnA000000000001", 400, 200), makeToken("trnB000000000001", 300, 200), makeToken("trnC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = new Set(out[0].map(u => u._id));
  for (const t of ts) t.document.movement = { state: first.has(t.document.id) ? "pending" : "completed", user: { isSelf: true } };
  const cleared = ts.find(t => first.has(t.document.id));
  const from = F.calls.length;
  try {
    F.fire("updateToken", cleared.document, { _movementHistory: [] }, { diff: false, noHook: true, _clearMovementHistory: true }, "gm00000000000001");
    tickBy(5000);
    const calls = F.calls.slice(from);
    assert.equal(calls.filter(c => c.op === "scene.update").length, 0, "no later wave went out");
    const stopped = new Set(calls.filter(c => c.op === "stopMovement").map(c => c.id));
    for (const t of ts) {
      if (t === cleared || !first.has(t.document.id)) assert.ok(!stopped.has(t.document.id), `${t.document.id} not stopped again`);
      else assert.ok(stopped.has(t.document.id), `${t.document.id} (still walking) is stopped with it`);
    }
    assert.equal(api.status().group.stopped?.why, "turnChange");
  } finally {
    for (const t of ts) t.document.movement = { state: "completed", user: { isSelf: true } };
    combatFlag = false;
  }
});

test("planGroup(refs, point) is the same plan as a dry run: slots, delays, levels; nothing moves", () => {
  F.canvas.ready = true;
  const ts = [makeToken("dryA000000000001", 400, 200), makeToken("dryB000000000001", 300, 200)];
  const from = F.calls.length;
  const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 600 });
  assert.equal(r.ok, true);
  assert.equal(r.result, "plan");
  assert.equal(r.members.length, 2);
  assert.deepEqual(r.members[0].slot, { x: 400, y: 600 });
  assert.ok(r.members.every(m => Number.isFinite(m.delay) && m.waypoints >= 2));
  assert.equal(sent(from).length, 0);
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
  assert.deepEqual(api.planGroup(ts.map(t => t.document), { x: "x" }).code, "BAD_ARGS");
});

test("decision 3: a click on one member sends no later wave at all; the group stops, and only this user's own members when it does not own them all", () => {
  combatFlag = false;
  const ts = [makeToken("stpA000000000001", 400, 200), makeToken("stpB000000000001", 300, 200), makeToken("stpC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = out[0].map(u => u._id);
  const moving = sceneTokens.get(first[0]).object;
  moving.animationContexts.set(moving.movementAnimationName, {});
  clock.t += MOTION.armMs;                             // armed: the move has run 400 ms
  const from = F.calls.length;
  moving._onClickLeft({});
  tickBy(5000);
  assert.equal(sent(from).length, 0, "no later wave went out");
  const moves = F.calls.slice(from).filter(c => c.op === "move" && c.options?.animate === false);
  assert.deepEqual([...new Set(moves.map(m => m.id))], [moving.document.id], "only the moving member is displaced (the waiting ones never set off)");
  assert.equal(clicks.at(-1).token, moving, "then core's click runs (select)");
  moving.animationContexts.clear();
  // Not every member is the clicker's: only the clicker's own stop, and the rest still go.
  const us = [makeToken("stpD000000000001", 400, 200), makeToken("stpE000000000001", 300, 200), makeToken("stpF000000000001", 500, 200)];
  const out2 = dropWith(us[0], contextsFor(us, 0, 400));
  const firstIds = new Set(out2[0].map(u => u._id));
  for (const t of us) if (!firstIds.has(t.document.id)) t.document.testUserPermission = () => false;
  const mv = sceneTokens.get(out2[0][0]._id).object;
  mv.animationContexts.set(mv.movementAnimationName, {});
  clock.t += MOTION.armMs;
  const f2 = F.calls.length;
  mv._onClickLeft({});
  tickBy(5000);
  const later = sent(f2).flatMap(c => c.ids);
  assert.ok(!later.includes(mv.document.id), "the clicked one sends nothing more");
  assert.ok(us.filter(t => !firstIds.has(t.document.id)).every(t => later.includes(t.document.id)), `the others' waves still go: ${JSON.stringify(later)}`);
  mv.animationContexts.clear();
});

test("a wave whose member has moved meanwhile is dropped for that member", () => {
  const ts = [makeToken("mvdA000000000001", 400, 200), makeToken("mvdB000000000001", 300, 200), makeToken("mvdC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = new Set(out[0].map(u => u._id));
  const waiting = ts.filter(t => !first.has(t.document.id));
  assert.ok(waiting.length > 0);
  for (const t of waiting) t.document._source = { ...t.document._source, x: t.document._source.x + 100 };
  const from = F.calls.length;
  tickBy(5000);
  assert.equal(sent(from).length, 0);
});

test("ghost / unconstrained: core's straight lines in one batch", () => {
  const saved = Token5e.prototype._getDragConstrainOptions;
  // The wrapped method: what the GM's unconstrained tool gives the drag.
  const ts = [makeToken("ghsA000000000001", 400, 200), makeToken("ghsB000000000001", 300, 200)];
  for (const t of ts) t._getDragConstrainOptions = () => ({ ignoreWalls: true, ignoreCost: true });
  const ctx = {};
  for (const t of ts) {
    const src = t.document._source;
    ctx[t.document.id] = { token: t, destination: wp(src.x, src.y + 400), foundPath: [wp(src.x, src.y), wp(src.x, src.y + 400)], waypoints: [] };
  }
  const core = coreDrop(ctx);
  drop.result = core;
  const from = F.calls.length;
  const out = ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  tickBy(5000);
  assert.equal(sent(from).length, 0, "one batch");
  assert.deepEqual(out[0].map(u => u._id).sort(), ts.map(t => t.document.id).sort());
  for (const t of ts) assert.equal(out[1].movement[t.document.id].waypoints.length, 1, "straight");
  assert.equal(api.status().group.last.reason, "unconstrained");
  Token5e.prototype._getDragConstrainOptions = saved;
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
  assert.match(warns[0], /pentaryn-movement \| group movement skipped/);
  assert.equal(api.status().group.fallbacks[0].reason, "throw");
  // R4-11: last says what happened, not the plan it was about to make.
  const last = api.status().group.last;
  assert.deepEqual([last.mode, last.result, last.reason, last.waves], ["core", "core", "throw", 0]);
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

test("R2-1: a planner throw is core's drop, still with no two members resting on one spot", () => {
  combatFlag = false;
  const a = makeToken("thsA000000000001", 100, 300), b = makeToken("thsB000000000001", 200, 300);
  const ctx = contextsFor([a, b], 200, 0);
  // Core's paths, as a wall at x = 400 cuts them: both end on (300, 300).
  ctx[a.document.id].foundPath = [ctx[a.document.id].foundPath[0], wp(300, 300)];
  ctx[b.document.id].foundPath = [ctx[b.document.id].foundPath[0], wp(300, 300)];
  drop.result = coreDrop(ctx);
  F.CONFIG.debug = { ...(F.CONFIG.debug ?? {}), [`${MOD}.throw`]: true };
  const saved = console.warn;
  console.warn = () => {};
  let out;
  try {
    out = a._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } });
  } finally {
    console.warn = saved;
    delete F.CONFIG.debug[`${MOD}.throw`];
  }
  const [, options] = out;
  const restOf = t => {
    const m = options.movement[t.document.id];
    const p = m?.waypoints?.length ? m.waypoints.at(-1) : t.document._source;
    return center(p);
  };
  const pa = restOf(a), pb = restOf(b);
  assert.deepEqual([options.movement[a.document.id].waypoints.at(-1).x, options.movement[a.document.id].waypoints.at(-1).y], [300, 300], "the grabbed token keeps its end");
  assert.ok(Math.hypot(pa.x - pb.x, pa.y - pb.y) >= S - 1e-6, `no rest overlap: ${JSON.stringify([pa, pb])}`);
});

test("a slow plan returns no updates and commits the same shape when it finishes", () => {
  const ts = [makeToken("asyA000000000001", 400, 200), makeToken("asyB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  clock.step = 2;                                     // every clock read costs time: the 30 ms sync slice runs out
  const from = F.calls.length;
  const out = dropWith(ts[0], ctx);
  assert.equal(out, null, "the drop ends with no updates");
  for (let k = 0; k < 50; k++) mock.timers.tick(10);
  clock.step = 0;
  const commits = sent(from);
  assert.ok(commits.length >= 1, "committed later");
  assert.equal(commits[0].options.method, "dragging");
  const ids = commits.flatMap(c => c.ids).sort();
  assert.deepEqual(ids, ts.map(t => t.document.id).sort());
  assert.equal(api.status().group.last.async, true);
  assert.equal(api.status().group.last.result, "plan");
});

test("H1-03: a plan on a slow page, with long frames between its slices, is still planned (the budget is planning time)", () => {
  const ts = [makeToken("slwA000000000001", 400, 200), makeToken("slwB000000000001", 300, 200), makeToken("slwC000000000001", 200, 200)];
  const ctx = contextsFor(ts, 0, 400);
  clock.step = 2;                                     // every clock read costs time: the drop goes async
  const from = F.calls.length;
  assert.equal(dropWith(ts[0], ctx), null);
  for (let k = 0; k < 50; k++) { clock.t += 400; mock.timers.tick(10); }   // a frame of 400 ms between slices
  clock.step = 0;
  const last = api.status().group.last;
  assert.equal(last.result, "plan", `planned, not ${last.reason}`);
  assert.ok(last.ms > 300, `the wall clock ran past the old 300 ms cap (${last.ms})`);
  assert.ok(sent(from).length >= 1, "committed");
  tickBy(60000);
});

test("H1-03: a plan whose silent wait passes GROUP_LIMITS.waitMs on the wall clock is core's", () => {
  const ts = [makeToken("slwD000000000001", 400, 200), makeToken("slwE000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  clock.step = 2;
  assert.equal(dropWith(ts[0], ctx), null);
  for (let k = 0; k < 50; k++) { clock.t += 5000; mock.timers.tick(10); }
  clock.step = 0;
  assert.equal(api.status().group.last.reason, "budget");
  tickBy(60000);
});

test("H1-05: a member still walking through where another was clicked to a stop walks round it from where it is drawn", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("arnA000000000001", 400, 100), b = makeToken("arnB000000000001", 100, 100);
  dropWith(a, contextsFor([a, b], 0, 100));
  b.document.testUserPermission = () => false;         // not the clicker's: only a stops (decision 3), b walks round it
  const others = keepOnly([a, b]);                     // a stops on its own square: nobody else's in the way
  mock.timers.tick(100);                               // still held as a group (until its members rest)
  clock.t += 2000;
  // a walks, drawn at (400, 200); b walks east along y = 200 from (100, 200) to (700, 200), straight through a.
  a.document.x = 400; a.document.y = 200; a.position = { x: 400, y: 200 };
  a.animationContexts.set(a.movementAnimationName, {});
  b.document._source.x = 700; b.document._source.y = 200;
  b.document.x = 100; b.document.y = 200; b.position = { x: 100, y: 200 };
  b.animationContexts.set(b.movementAnimationName, {});
  b.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(100, 200),
    passed: { waypoints: [wp(700, 200)] }, pending: { waypoints: [] } };
  const from = F.calls.length;
  try {
    a._onClickLeft({});
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const bm = F.calls.slice(from).filter(c => c.op === "move" && c.id === b.document.id);
    assert.equal(bm[0]?.options?.animate, false, "b stops where it is drawn first");
    assert.deepEqual([bm[0].waypoints[0].x, bm[0].waypoints[0].y], [100, 200]);
    const walk = bm[1];
    assert.ok(walk, "then walks on");
    assert.deepEqual([walk.waypoints.at(-1).x, walk.waypoints.at(-1).y], [700, 200], "to its own spot");
    const c = { x: 450, y: 250 };
    let prev = { x: 150, y: 250 };
    for (const p of walk.waypoints) {
      const q = { x: p.x + 50, y: p.y + 50 };
      const L2 = (q.x - prev.x) ** 2 + (q.y - prev.y) ** 2;
      const t = L2 ? Math.min(Math.max(((c.x - prev.x) * (q.x - prev.x) + (c.y - prev.y) * (q.y - prev.y)) / L2, 0), 1) : 0;
      assert.ok(Math.hypot(c.x - (prev.x + (q.x - prev.x) * t), c.y - (prev.y + (q.y - prev.y) * t)) >= 99 - 1e-6, "never through the stopped one");
      prev = q;
    }
  } finally {
    for (const [k, v] of others) sceneTokens.set(k, v);
    for (const t of [a, b]) t.animationContexts.clear();
    b.document.movement = { state: "completed", user: { isSelf: true } };
    tickBy(60000);
  }
});

test("H1-05: with no way round the stopped member (it stands in the only door), the one behind stops short of it", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("crdA000000000001", 400, 100), b = makeToken("crdB000000000001", 300, 100);
  dropWith(a, contextsFor([a, b], 0, 100));
  b.document.testUserPermission = () => false;         // not the clicker's: only a stops (decision 3)
  const others = keepOnly([a, b]);
  mock.timers.tick(100);
  clock.t += 2000;
  a.document.x = 400; a.document.y = 400; a.position = { x: 400, y: 400 };   // just through the door
  a.animationContexts.set(a.movementAnimationName, {});
  b.document._source.x = 400; b.document._source.y = 700;
  b.document.x = 400; b.document.y = 100; b.position = { x: 400, y: 100 };
  b.animationContexts.set(b.movementAnimationName, {});
  b.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(400, 100),
    passed: { waypoints: [wp(400, 700)] }, pending: { waypoints: [] } };
  const from = F.calls.length;
  try {
    a._onClickLeft({});
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const am = F.calls.slice(from).find(c => c.op === "move" && c.id === a.document.id).waypoints[0];
    const bm = F.calls.slice(from).filter(c => c.op === "move" && c.id === b.document.id);
    assert.equal(bm[0]?.options?.animate, false, "b stops where it is drawn first");
    const end = bm[1]?.waypoints.at(-1) ?? bm[0].waypoints[0];
    assert.ok(end.y + 50 <= 400, `b stays on its side of the door: ${JSON.stringify(end)}`);
    assert.ok(Math.hypot(end.x - am.x, end.y - am.y) >= 99, `b rests clear of a: ${JSON.stringify([end, am])}`);
  } finally {
    for (const [k, v] of others) sceneTokens.set(k, v);
    for (const t of [a, b]) t.animationContexts.clear();
    b.document.movement = { state: "completed", user: { isSelf: true } };
    tickBy(60000);
  }
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

test("H1-12 / decision 7: a group dropped where the grabbed token has no way to go stays put, nobody moves, and says so; a single drag there does not move and says so", () => {
  combatFlag = false;
  clock.step = 0;
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);          // the door shut: nothing south is reachable
  try {
    const ts = [makeToken("nrtA000000000001", 400, 200), makeToken("nrtB000000000001", 300, 200), makeToken("nrtC000000000001", 500, 200)];
    const ctx = contextsFor(ts, 0, 400);
    // A follower's core path would still take it to the wall.
    ctx[ts[1].document.id].foundPath.push(wp(300, 300));
    const from = F.calls.length;
    const out = dropWith(ts[0], ctx);
    tickBy(5000);
    assert.equal(api.status().group.last.reason, "anchorNoRoute");
    const moved = [...(out?.[0] ?? []).map(u => u._id), ...sent(from).flatMap(c => c.ids)];
    assert.deepEqual(moved, [], `nobody moves, the grabbed one neither (decision 7): ${JSON.stringify(moved)}`);
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn" && c.message === "PENTARYN_MOVEMENT.notify.noRouteGroup"), "one warning");
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

test("H1-09: out of combat a member's route goes round a token that stays (a crowd member), not through it", () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("crwA000000000001", 100, 100), b = makeToken("crwB000000000001", 100, 200);
  const rest = makeToken("crwR000000000001", 250, 200);
  rest.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, b, rest];
  try {
    const from = F.calls.length;
    const out = dropWith(a, contextsFor([a, b], 300, 0));
    tickBy(5000);
    const batches = [...(out ? [{ ids: out[0].map(u => u._id), options: out[1] }] : []), ...sent(from)];
    const mb = batches.map(x => x.options.movement?.[b.document.id]).find(Boolean);
    assert.ok(mb, "b moves");
    let prev = { x: 150, y: 250 };
    const c = { x: 300, y: 250 };
    for (const p of mb.waypoints) {
      const q = { x: p.x + 50, y: p.y + 50 };
      const L2 = (q.x - prev.x) ** 2 + (q.y - prev.y) ** 2;
      const t = L2 ? Math.min(Math.max(((c.x - prev.x) * (q.x - prev.x) + (c.y - prev.y) * (q.y - prev.y)) / L2, 0), 1) : 0;
      assert.ok(Math.hypot(c.x - (prev.x + (q.x - prev.x) * t), c.y - (prev.y + (q.y - prev.y) * t)) >= 99, `b never passes through the crowd member: ${JSON.stringify(mb.waypoints.map(w => [w.x, w.y]))}`);
      prev = q;
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(rest.document.id);
    tickBy(60000);
  }
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

test("click to stop out of combat: displaced to the nearest free whole square (animate false; decision 2), then core's click", () => {
  combatFlag = false;
  const t = makeToken("clkA000000000001", 100, 100);
  t.document._source = { ...t.document._source, x: 600, y: 100 };   // the server holds the end
  t.document.x = 320; t.document.y = 100;                           // drawn mid-way
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  t._onClickLeft({});
  const move = F.calls.slice(from).find(c => c.op === "move");
  assert.deepEqual(move.waypoints, [{ x: 300, y: 100, elevation: 0, action: "displace", snapped: false, explicit: true, checkpoint: true }]);
  assert.equal(move.options.animate, false);
  assert.ok(F.calls.slice(from).some(c => c.op === "stopAnimation" && c.opts.reset === false), "the tween stops here at once");
  assert.equal(clicks.at(-1).token, t);
});

test("R4-5: a click-stop in a doorway, the body across the wall beside the door, rests on the nearest clear whole cell", () => {
  combatFlag = false;
  const t = makeToken("clkDoor000000001", 400, 100);
  t.document._source = { ...t.document._source, x: 400, y: 600 };   // the server holds the end, through the door
  t.document.x = 460; t.document.y = 340;                           // drawn in the doorway, its circle over the wall at x 500+
  t.animationContexts.set(t.movementAnimationName, {});
  const from = F.calls.length;
  t._onClickLeft({});
  const move = F.calls.slice(from).find(c => c.op === "move");
  assert.equal(move.waypoints.length, 1);
  assert.deepEqual([move.waypoints[0].x, move.waypoints[0].y], [500, 300], "the nearest whole cell clear of the wall");
  assert.equal(move.waypoints[0].action, "displace");
  t.animationContexts.clear();
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

test("R5-3: a click-stop in an open doorway, its body across the door's line, rests on a whole cell on one side of it", () => {
  combatFlag = false;
  const t = makeToken("clkOpen000000001", 400, 100);
  t.document._source = { ...t.document._source, x: 400, y: 600 };
  t.document.x = 400; t.document.y = 352;                           // centre (450, 402): across the open door at y 400
  t.animationContexts.set(t.movementAnimationName, {});
  sceneDoc.walls = [{ door: 1, ds: 1, c: [400, 400, 500, 400] }];
  try {
    const from = F.calls.length;
    t._onClickLeft({});
    const move = F.calls.slice(from).find(c => c.op === "move");
    const p = move.waypoints[0];
    assert.ok(p.x % S === 0 && p.y % S === 0, `a whole cell (${p.x}, ${p.y})`);
    assert.ok(p.y === 300 || p.y === 400, `beside the door, not across it (${p.y})`);
    assert.equal(p.x, 400);
  } finally {
    sceneDoc.walls = null;
    t.animationContexts.clear();
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

test("R7-4: a click-stop whose box would rest 5 px across an open door's line rests on a whole cell beside it", () => {
  combatFlag = false;
  const t = makeToken("clkOpen000000002", 400, 100);
  t.document._source = { ...t.document._source, x: 400, y: 600 };
  t.document.x = 400; t.document.y = 305;                           // centre (450, 355): the box (y 305-405) crosses y 400 by 5 px
  t.animationContexts.set(t.movementAnimationName, {});
  sceneDoc.walls = [{ door: 1, ds: 1, c: [400, 400, 500, 400] }];
  try {
    const from = F.calls.length;
    t._onClickLeft({});
    const p = F.calls.slice(from).find(c => c.op === "move").waypoints[0];
    assert.deepEqual([p.x, p.y], [400, 300], "the whole cell before the line");
  } finally {
    sceneDoc.walls = null;
    t.animationContexts.clear();
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

test("no stop when not moving, on a modifier click, with the target tool, or with the setting off", async () => {
  const t = makeToken("clkC000000000001", 100, 100);
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "stopMovement").length, 0, "not moving");
  t.animationContexts.set(t.movementAnimationName, {});
  t._onClickLeft({ shiftKey: true });
  F.game.activeTool = "target";
  t._onClickLeft({});
  F.game.activeTool = "select";
  await game.settings.set(MOD, "clickToStop", false);
  t._onClickLeft({});
  await game.settings.set(MOD, "clickToStop", true);
  assert.equal(F.calls.slice(from).filter(c => c.op === "move" || c.op === "stopMovement").length, 0);
  from = F.calls.length;
  const r = await api.stop(t.document);
  assert.deepEqual(r, { ok: true, how: "displace", tokenId: t.document.id });
  t.animationContexts.clear();
  assert.equal((await api.stop(t.document)).code, "NOT_MOVING");
});

test("groupMovement off: a group drop is core's, followers are pathfound again", async () => {
  await game.settings.set(MOD, "groupMovement", false);
  const ts = [makeToken("offA000000000001", 400, 200), makeToken("offB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  const core = coreDrop(ctx);
  drop.result = core;
  assert.equal(ts[0]._prepareDragLeftDropUpdates({ interactionData: { contexts: ctx } }), core);
  assert.equal(api.status().group.last.reason, "off");
  await game.settings.set(MOD, "groupMovement", true);
});

/* -------------------------------------------- */
/*  UX review fixes (0.4.0 review)              */
/* -------------------------------------------- */

test("the grabbed token walks the route its drag preview showed", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("shwA000000000001", 400, 200), makeToken("shwB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  // The drag's own (pathfound) route for the grabbed token: through the door with one bend.
  const shown = [wp(400, 200, { snapped: false, explicit: false, checkpoint: false }), wp(420, 300, { explicit: false, checkpoint: false, snapped: false }), wp(400, 600)];
  ctx.shwA000000000001.foundPath = shown;
  const from = F.calls.length;
  const out = dropWith(ts[0], ctx);
  tickBy(5000);
  const later = sent(from);
  const moves = { ...out[1].movement, ...Object.assign({}, ...later.map(c => c.options.movement)) };
  assert.deepEqual(moves.shwA000000000001.waypoints.map(w => [w.x, w.y]), [[420, 300], [400, 600]]);
});

test("decision 3: a click on any member stops the whole group (the clicker owns every member), after its last wave went out and in a one-wave group", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("hldA000000000001", 400, 200), makeToken("hldB000000000001", 300, 200), makeToken("hldC000000000001", 500, 200)];
  dropWith(ts[0], contextsFor(ts, 0, 400));
  tickBy(1200);                              // every wave is out; they are still walking
  clock.t += 1200;
  for (const t of ts) t.animationContexts.set(t.movementAnimationName, {});
  let from = F.calls.length;
  ts[1]._onClickLeft({});
  let moved = F.calls.slice(from).filter(c => c.op === "move").map(c => c.id).sort();
  assert.deepEqual(moved, ts.map(t => t.document.id).sort(), "every member stops");
  const spots = F.calls.slice(from).filter(c => c.op === "move").map(c => c.waypoints[0]);
  assert.ok(spots.every(p => p.x % 100 === 0 && p.y % 100 === 0), `each on a whole square: ${JSON.stringify(spots)}`);
  assert.equal(new Set(spots.map(p => `${p.x},${p.y}`)).size, spots.length, "no two on one square");
  for (const t of ts) t.animationContexts.clear();

  // Ghost: one batch, no later wave; still one group.
  const gs = [makeToken("hldD000000000001", 400, 200), makeToken("hldE000000000001", 300, 200)];
  for (const t of gs) t._getDragConstrainOptions = () => ({ ignoreWalls: true, ignoreCost: true });
  const ctx = {};
  for (const t of gs) {
    const src = t.document._source;
    ctx[t.document.id] = { token: t, destination: wp(src.x, src.y + 400), foundPath: [wp(src.x, src.y), wp(src.x, src.y + 400)], waypoints: [] };
  }
  const out = dropWith(gs[0], ctx);
  assert.equal(out[0].length, 2, "one batch");
  for (const t of gs) t.animationContexts.set(t.movementAnimationName, {});
  clock.t += MOTION.armMs;
  from = F.calls.length;
  gs[0]._onClickLeft({});
  moved = F.calls.slice(from).filter(c => c.op === "move").map(c => c.id).sort();
  assert.deepEqual(moved, gs.map(t => t.document.id).sort());
  for (const t of gs) t.animationContexts.clear();
  tickBy(60000);
  assert.equal(api.status().group.groups, 0, "groups are let go once everyone is at rest");
});

test("a newer drop of a member cancels its older pending wave, and waves go to the drop's scene", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("supA000000000001", 400, 200), makeToken("supB000000000001", 300, 200), makeToken("supC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = new Set(out[0].map(u => u._id));
  const waiting = ts.filter(t => !first.has(t.document.id));
  assert.ok(waiting.length > 0);
  // The GM grabs a waiting member again before its wave went out (its source has not changed yet).
  const again = waiting[0];
  const solo = contextsFor([again], 100, 0);
  drop.result = coreDrop(solo);
  again._prepareDragLeftDropUpdates({ interactionData: { contexts: solo } });
  // …and switches the view to another scene.
  const viewed = F.canvas.scene;
  const elsewhere = { id: "sceneB", tokens: new Map(), async updateEmbeddedDocuments() { F.calls.push({ op: "wrong-scene" }); return []; } };
  const from = F.calls.length;
  F.canvas.scene = elsewhere;
  try { tickBy(5000); } finally { F.canvas.scene = viewed; }
  const calls = F.calls.slice(from);
  assert.equal(calls.filter(c => c.op === "wrong-scene").length, 0, "never the viewed scene");
  const ids = calls.filter(c => c.op === "scene.update").flatMap(c => c.ids);
  assert.ok(!ids.includes(again.document.id), "the re-dropped member's old wave is not sent");
  for (const t of waiting.slice(1)) assert.ok(ids.includes(t.document.id), "the others still go");
});

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

test("the grabbed token keeps the route its drag found (no second search inside the drop)", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("ancA000000000001", 400, 200), makeToken("ancB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  // What the drag's pathfinder found for the anchor: a dog-leg through the door the stub would not draw.
  const shown = [wp(400, 200, { explicit: false, checkpoint: false }), wp(450, 300, { snapped: false, explicit: false, checkpoint: false }), wp(400, 600)];
  ctx[ts[0].document.id].foundPath = shown;
  const out = dropWith(ts[0], ctx);
  const from = F.calls.length;
  tickBy(5000);
  const moves = { ...out[1].movement, ...Object.assign({}, ...sent(from).map(c => c.options.movement)) };
  assert.deepEqual(moves.ancA000000000001.waypoints.map(w => [w.x, w.y]), [[450, 300], [400, 600]]);
});

test("a late (async) commit leaves out a member moved while the plan ran", () => {
  const ts = [makeToken("latA000000000001", 400, 200), makeToken("latB000000000001", 300, 200)];
  const ctx = contextsFor(ts, 0, 400);
  clock.step = 2;
  const from = F.calls.length;
  assert.equal(dropWith(ts[0], ctx), null);
  ts[1].document._source = { ...ts[1].document._source, x: 0 };        // someone moved it meanwhile
  for (let k = 0; k < 50; k++) mock.timers.tick(10);
  clock.step = 0;
  const ids = sent(from).flatMap(c => c.ids);
  assert.ok(ids.includes("latA000000000001"));
  assert.ok(!ids.includes("latB000000000001"), "the moved member keeps its newer move");
  for (const c of sent(from)) assert.deepEqual(Object.keys(c.options.movement).sort(), [...c.ids].sort());
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

test("a move another client started arms 400 ms after this client first saw it (moveToken); the API stop is never held back", async () => {
  combatFlag = false;
  clock.step = 0;
  const t = makeToken("hbtC000000000001", 100, 100);
  t.animationContexts.set(t.movementAnimationName, {});
  t.document.movement = { id: "mov0000000000001", chain: [], state: "pending", user: { isSelf: false } };
  F.fire("moveToken", t.document, t.document.movement, {}, { id: "other" });
  let from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0, "just started: not armed");
  // A continuation of the same move keeps the first start.
  clock.t += 300;
  t.document.movement = { id: "mov0000000000002", chain: ["mov0000000000001"], state: "pending", user: { isSelf: false } };
  F.fire("moveToken", t.document, t.document.movement, {}, { id: "other" });
  clock.t += 150;
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 1, "450 ms into the move: stopped");
  // A new move: unarmed again, but api.stop() stops it at once.
  t.document.movement = { id: "mov0000000000003", chain: [], state: "pending", user: { isSelf: false } };
  F.fire("moveToken", t.document, t.document.movement, {}, { id: "other" });
  from = F.calls.length;
  t._onClickLeft({});
  assert.equal(F.calls.slice(from).filter(c => c.op === "move").length, 0);
  const r = await api.stop(t.document);
  assert.equal(r.ok, true);
  t.animationContexts.clear();
});

test("in combat a GM's click asks the user who started the move (stopOwn); only that client stops it, only for a GM", async () => {
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

test("a group slot is never inside a teleport region (a scene link), unless the group is dropped into it", () => {
  combatFlag = false;
  clock.step = 0;
  // Open floor south of the wall; a scene-link region on b's formation spot (300, 600).
  const zone = { x: 300, y: 600, w: 100, h: 100 };
  const inZone = c => c.x > zone.x && c.x < zone.x + zone.w && c.y > zone.y && c.y < zone.y + zone.h;
  sceneDoc.regions = [{ id: "regTele000000001", hidden: false, behaviors: [{ type: "teleportToken", disabled: false }] }];
  const ts = [makeToken("regA000000000001", 400, 500), makeToken("regB000000000001", 300, 500)];
  for (const t of ts) t.document.testInsideRegion = (r, d) => inZone(center({ x: d.x, y: d.y, width: 1, height: 1 }));
  try {
    const r = api.planGroup(ts.map(t => t.document), { x: 400, y: 600 });
    assert.equal(r.ok, true);
    assert.equal(r.result, "plan");
    const b = r.members.find(m => m.id === "regB000000000001");
    assert.ok(!inZone(center({ ...b.slot, width: 1, height: 1 })), `b is re-slotted out of the region: ${JSON.stringify(b.slot)}`);
    // Dropped into it: the grabbed token lands there and the region is not avoided.
    const r2 = api.planGroup([ts[1].document, ts[0].document], { x: 300, y: 600 });
    assert.equal(r2.result, "plan");
    assert.deepEqual(r2.members[0].slot, { x: 300, y: 600 });
  } finally {
    sceneDoc.regions = [];
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
  assert.equal(t.document.x, 300);
  // A late stale frame: caught by the second check.
  t.document.x = 390;
  mock.timers.tick(300);
  assert.equal(stops.length, 3);
  assert.equal(t.document.x, 300);
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
    assert.ok(at.x % 100 === 0 && at.y % 100 === 0 && Math.hypot(at.x - 320, at.y - 100) <= 150, `a free whole square near where it was drawn: ${JSON.stringify(at)}`);
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

test("D-1: a group drop that runs out of planning time is core's, but no two members rest on one spot", () => {
  combatFlag = false;
  // Core's paths (cut by walls on the table) bring b and c to a's end square.
  const ts = [makeToken("stkA000000000001", 100, 600), makeToken("stkB000000000001", 100, 700), makeToken("stkC000000000001", 100, 800)];
  const path = (t, ...pts) => [wp(t.document._source.x, t.document._source.y, { snapped: false, explicit: false, checkpoint: false }), ...pts.map(([x, y]) => wp(x, y))];
  const ctx = {
    [ts[0].document.id]: { token: ts[0], destination: wp(800, 600), foundPath: path(ts[0], [800, 600]), waypoints: [] },
    [ts[1].document.id]: { token: ts[1], destination: wp(800, 700), foundPath: path(ts[1], [800, 600]), waypoints: [] },
    [ts[2].document.id]: { token: ts[2], destination: wp(800, 800), foundPath: path(ts[2], [500, 600], [800, 600]), waypoints: [] },
  };
  clock.step = 200;                                     // every clock read costs 200 ms: the planning budget runs out
  const from = F.calls.length;
  assert.equal(dropWith(ts[0], ctx), null);
  for (let k = 0; k < 50; k++) mock.timers.tick(10);
  clock.step = 0;
  assert.equal(api.status().group.last.reason, "budget");
  const commit = sent(from)[0];
  assert.ok(commit, "core's move went out");
  const ends = Object.fromEntries(Object.entries(commit.options.movement).map(([id, m]) => [id, m.waypoints.at(-1)]));
  assert.deepEqual([ends.stkA000000000001.x, ends.stkA000000000001.y], [800, 600], "the grabbed token keeps its drop point");
  const cs = Object.values(ends).map(e => center(e));
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    assert.ok(Math.hypot(cs[i].x - cs[j].x, cs[i].y - cs[j].y) >= S - 1e-6, `members ${i} and ${j} rest on top of each other`);
  }
  for (const e of Object.values(ends)) assert.equal(e.checkpoint, true);
  tickBy(60000);
});

/* ---- Live play-test round 3 ---- */

const PENDING = "pentaryn-movement.pendingWaves";
function fakeSession() {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
  };
  return store;
}

test("R3-1: a group's unsent waves are kept in this tab's sessionStorage (for a reload) and taken off as they go out", () => {
  const store = fakeSession();
  try {
    combatFlag = false;
    clock.step = 0;
    const ts = [makeToken("pnA0000000000001", 400, 200), makeToken("pnB0000000000001", 300, 200), makeToken("pnC0000000000001", 500, 200)];
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    const first = new Set(out[0].map(u => u._id));
    const waiting = ts.map(t => t.document.id).filter(id => !first.has(id));
    assert.ok(waiting.length > 0, "at least one member waits for a later wave");
    const recs = JSON.parse(store.get(PENDING));
    assert.equal(recs.length, 1);
    const rec = recs[0];
    assert.equal(rec.sceneId, SCENE);
    assert.equal(rec.user, game.user.id);
    assert.equal(rec.world, game.world.id);
    assert.deepEqual(rec.waves.flatMap(w => w.updates.map(u => u._id)).sort(), [...waiting].sort(), "exactly the waiting members");
    for (const w of rec.waves) for (const u of w.updates) assert.ok(w.movement[u._id]?.waypoints?.length, "each with its route");
    assert.deepEqual(rec.starts[waiting[0]], { x: sceneTokens.get(waiting[0])._source.x, y: sceneTokens.get(waiting[0])._source.y });
    for (let i = 0; i < 80; i++) mock.timers.tick(100);
    assert.equal(store.has(PENDING), false, "all sent: nothing left to resume");
  } finally {
    delete globalThis.sessionStorage;
  }
});

test("R3-1 / H1-05: a member clicked to a stop leaves nothing of its own to resume after a reload", () => {
  const store = fakeSession();
  try {
    combatFlag = false;
    clock.step = 0;
    const ts = [makeToken("psA0000000000001", 400, 200), makeToken("psB0000000000001", 300, 200), makeToken("psC0000000000001", 500, 200)];
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(store.has(PENDING));
    const moving = sceneTokens.get(out[0][0]._id).object;
    moving.animationContexts.set(moving.movementAnimationName, {});
    clock.t += MOTION.armMs;
    moving._onClickLeft({});
    const left = JSON.parse(store.get(PENDING) ?? "[]");
    assert.ok(!left.some(r => r.waves.some(w => w.ids.includes(moving.document.id))), "the clicked member's wave is gone");
    moving.animationContexts.clear();
    tickBy(60000);
  } finally {
    delete globalThis.sessionStorage;
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
  assert.ok(p0.x % 100 === 0 && Math.hypot(p0.x - 420, p0.y - 100) <= 150, `not put at its destination: near where drawn, on a whole square: ${JSON.stringify(p0)}`);
  // Mid-frame (derived ≠ source) the document's own derived position is the drawn one, as before.
  const u = makeToken("drwB000000000001", 100, 100);
  u.document._source = { ...u.document._source, x: 1800, y: 100 };
  u.document.x = 610; u.document.y = 100;
  u.position = { x: 600, y: 100 };
  u.animationContexts.set(u.movementAnimationName, {});
  const n = F.calls.length;
  u._onClickLeft({});
  const p1 = F.calls.slice(n).find(c => c.op === "move").waypoints[0];
  assert.ok(p1.x % 100 === 0 && Math.hypot(p1.x - 610, p1.y - 100) <= 150, JSON.stringify(p1));
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

test("R3-5: planGroup's grabbed token walks the route its drag preview would show (the pathfinder's full budget), as a drop does", () => {
  F.canvas.ready = true;
  combatFlag = false;
  const ts = [makeToken("dr5A000000000001", 100, 200), makeToken("dr5B000000000001", 400, 200)];
  clock.step = 0;
  const r = api.planGroup(ts.map(t => t.document), { x: 100, y: 600 });
  assert.equal(r.ok, true);
  assert.equal(r.result, "plan", JSON.stringify(r));
  assert.equal(r.anchorRoute?.reached, true, "searched before the plan, as the drag preview is");
  assert.ok(r.anchorRoute.waypoints > 2, "round the wall, through the door");
  assert.deepEqual(r.members[0].slot, { x: 100, y: 600 });
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

test("R6-3 / R7-1: a door shut across a move out of combat stops the drawn walk at once (an unanimated displace), then walks to a free square before the door", async () => {
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
      assert.equal(m.options?.animate, false, "the first write is unanimated (stops the drawn tween on every client)");
      assert.equal(m.waypoints.length, 1);
      assert.equal(m.waypoints[0].action, "displace", "to where it is drawn");
      const sa = F.calls.slice(from).findIndex(c => c.op === "stopAnimation" && c.id === m.id && c.opts?.reset === false);
      assert.ok(sa >= 0 && sa < F.calls.slice(from).indexOf(m), "this client stops its own tween before the write");
    }
    assert.equal(first.find(m => m.id === a.document.id).waypoints[0].y, 150);
    await settleWrites();
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    const walk = id => moves.filter(m => m.id === id)[1];
    for (const t of [a, b]) {
      const w = walk(t.document.id);
      assert.ok(w, "then a walk");
      assert.notEqual(w.options?.animate, false, "the walk is animated");
      assert.ok(w.waypoints.every(p => p.y < 400 && p.action !== "displace"), "never across the door");
    }
    const end = t => walk(t.document.id).waypoints.at(-1);
    assert.deepEqual([end(a).x, end(a).y], [400, 300], "the nearest takes the last square before the door");
    assert.deepEqual([end(b).x, end(b).y], [400, 200], "the next one the square behind it");
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

test("H1-07 / H1-09: a member cut in the doorway with no square on its way walks to the nearest clear spot nobody else takes", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // Its body across the door line (centre 10 px above it): no whole square before the door on its way.
  const a = walking("dwyA00000000001x", { x: 400, y: 340 }, { x: 400, y: 700 }, [{ x: 400, y: 300 }, { x: 400, y: 700 }]);
  makeToken("dwyRest00000001x", 400, 300);             // the square right behind it is taken
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    await settleWrites();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    assert.equal(moves[0]?.waypoints[0].action, "displace");
    assert.deepEqual([moves[0].waypoints[0].x, moves[0].waypoints[0].y], [400, 340], "first stopped where it is drawn (no jump)");
    const walk = moves[1];
    assert.ok(walk, "then walks to its spot");
    assert.notEqual(walk.options?.animate, false);
    const end = walk.waypoints.at(-1);
    assert.ok(end.y < 400, "on its own side of the door");
    assert.notDeepEqual([end.x, end.y], [400, 300], "not onto the token resting behind it");
    assert.ok(Math.hypot(end.x - 400, end.y - 300) >= S - 1e-6, "touching at most");
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
    assert.equal(moves.length, 2, "a displace where it is drawn, then the walk");
    assert.ok(moves.every(m => m.id === a.document.id));
    assert.equal(moves[0].options?.animate, false);
    assert.deepEqual([moves[1].waypoints.at(-1).x, moves[1].waypoints.at(-1).y], [500, 100], "the square before the new wall");
  } finally {
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R7-2: in a fight, a cut never calls stopMovement while the member's next square is on its way to the server", () => {
  combatFlag = true;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const a = walking("cutG000000000001", { x: 400, y: 120 }, { x: 400, y: 200 }, [{ x: 400, y: 100 }, { x: 400, y: 200 }],
    { combat: true, pending: [{ x: 400, y: 300 }, { x: 400, y: 400 }, { x: 400, y: 500 }] });
  // Core's continuation for the next square has been sent and not yet landed.
  a.document._movementContinuation = { continued: true };
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    const stops = () => F.calls.slice(from).filter(c => c.op === "stopMovement" && c.id === a.document.id).length;
    assert.equal(stops(), 0, "no stop while the continuation is in flight (core would file it under a settled movement)");
    mock.timers.tick(100);
    assert.equal(stops(), 0, "still waiting");
    // The continuation lands: core clears the flag. Now the stop goes out, once.
    a.document._movementContinuation.continued = false;
    mock.timers.tick(30);
    assert.equal(stops(), 1, "stopped once it landed");
    a.animationContexts.clear(); a.document.movement.state = "stopped";
    mock.timers.tick(200);
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    assert.equal(moves.length, 1, "then walks on to its square");
    assert.deepEqual([moves[0].waypoints.at(-1).x, moves[0].waypoints.at(-1).y], [400, 300]);
  } finally {
    world.walls.pop();
    combatFlag = false;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("H1-07: in a fight, a member cut with no square on its way that core stops on another token's square steps to a free one (costed), not 4 s later", () => {
  combatFlag = true;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const a = walking("cmbA00000000001x", { x: 400, y: 280 }, { x: 400, y: 300 }, [{ x: 400, y: 200 }, { x: 400, y: 300 }],
    { combat: true, pending: [{ x: 400, y: 400 }, { x: 400, y: 500 }] });
  makeToken("cmbRest0000001xx", 400, 300);              // already resting on the square a is entering
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    assert.ok(F.calls.slice(from).some(c => c.op === "stopMovement" && c.id === a.document.id));
    a.animationContexts.clear(); a.document.movement.state = "stopped";
    mock.timers.tick(200);
    const step = F.calls.slice(from).find(c => c.op === "move" && c.id === a.document.id);
    assert.ok(step, "it steps off the taken square");
    const end = step.waypoints.at(-1);
    assert.notDeepEqual([end.x, end.y], [400, 300]);
    assert.ok(end.y < 400, "on its own side of the door");
    assert.notEqual(end.action, "displace", "a costed walk in a fight");
    assert.notEqual(step.options?.animate, false);
  } finally {
    world.walls.pop();
    combatFlag = false;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("R6-1: in a fight, members walking to a door that shuts stop at their next square and walk on to separate squares before it", () => {
  combatFlag = true;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // A checkpoint at every square: the source is the square being entered, the rest pending.
  const a = walking("cutE000000000001", { x: 400, y: 120 }, { x: 400, y: 200 }, [{ x: 400, y: 100 }, { x: 400, y: 200 }],
    { combat: true, pending: [{ x: 400, y: 300 }, { x: 400, y: 400 }, { x: 400, y: 500 }] });
  const b = walking("cutF000000000001", { x: 400, y: 20 }, { x: 400, y: 100 }, [{ x: 400, y: 0 }, { x: 400, y: 100 }],
    { combat: true, pending: [{ x: 400, y: 200 }, { x: 400, y: 300 }, { x: 400, y: 400 }] });
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    const stops = F.calls.slice(from).filter(c => c.op === "stopMovement").map(c => c.id).sort();
    assert.deepEqual(stops, [a.document.id, b.document.id].sort(), "both stop at their next square (never a displace in a fight)");
    // Once each has finished its square, it walks on (costed) to its own square before the door.
    for (const t of [a, b]) { t.animationContexts.clear(); t.document.movement.state = "stopped"; }
    mock.timers.tick(200);
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    const endOf = t => moves.find(m => m.id === t.document.id)?.waypoints.at(-1);
    assert.deepEqual([endOf(a).x, endOf(a).y], [400, 300], "the nearest takes the last square before the door");
    assert.deepEqual([endOf(b).x, endOf(b).y], [400, 200], "the next one, stopped on (400, 100), walks on to the square behind it");
    assert.ok(moves.every(m => m.waypoints.every(w => w.action !== "displace")), "a walk, never a displace");
  } finally {
    world.walls.pop();
    combatFlag = false;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
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

test("H2-02: when the only way round the stopped member is the long way, the one behind stops short on open floor instead", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = world.walls;
  // A second gap far east (x 900-1000): round the door the long way is 12 squares for a 6-square walk.
  world.walls = [[{ x: 0, y: 400 }, { x: 400, y: 400 }], [{ x: 500, y: 400 }, { x: 900, y: 400 }]];
  F.fire("updateWall");
  const a = makeToken("dtrA000000000001", 400, 100), b = makeToken("dtrB000000000001", 300, 100);
  dropWith(a, contextsFor([a, b], 0, 100));
  mock.timers.tick(100);
  clock.t += 2000;
  a.document.x = 400; a.document.y = 400; a.position = { x: 400, y: 400 };   // just through the door
  a.animationContexts.set(a.movementAnimationName, {});
  b.document._source.x = 400; b.document._source.y = 700;
  b.document.x = 400; b.document.y = 100; b.position = { x: 400, y: 100 };
  b.animationContexts.set(b.movementAnimationName, {});
  b.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(400, 100),
    passed: { waypoints: [wp(400, 700)] }, pending: { waypoints: [] } };
  const from = F.calls.length;
  try {
    a._onClickLeft({});
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const bm = F.calls.slice(from).filter(c => c.op === "move" && c.id === b.document.id);
    const walk = bm[1]?.waypoints ?? [];
    assert.ok(walk.every(p => p.x <= 600), `no detour by the far gap: ${JSON.stringify(walk.map(p => [p.x, p.y]))}`);
    const end = walk.at(-1) ?? bm[0].waypoints[0];
    assert.ok(end.y + 50 <= 400, `b stays on its side of the door: ${JSON.stringify(end)}`);
  } finally {
    for (const t of [a, b]) t.animationContexts.clear();
    b.document.movement = { state: "completed", user: { isSelf: true } };
    world.walls = saved;
    F.fire("updateWall");
    tickBy(60000);
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
  assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn" && /nrwL000000000001|tooNarrow/.test(c.message)), JSON.stringify(F.calls.slice(from).filter(c => c.op === "notify")));
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

test("decision 3: every client learns a group's members from its moves' update option; a click there stops this user's own members of it", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("tagA000000000001", 400, 100), b = makeToken("tagB000000000001", 100, 100);
  const c = makeToken("tagC000000000001", 700, 700), d = makeToken("tagD000000000001", 900, 700), e = makeToken("tagE000000000001", 700, 900);
  const others = keepOnly([a, b, c, d, e]);
  try {
    const out = dropWith(a, contextsFor([a, b], 0, 100));
    const opts = [out?.[1], ...F.calls.filter(x => x.op === "scene.update").map(x => x.options)].filter(Boolean);
    assert.ok(opts.some(o => typeof o.pentarynMovementGroup === "string"), "the moves name their group");
    tickBy(60000);
    // Another client's group (seen here only through its updates): c and d are ours, e is not.
    for (const t of [c, d, e]) F.fire("updateToken", t.document, { y: 800 }, { pentarynMovementGroup: "grpOther00000001" }, "u2");
    e.document.testUserPermission = () => false;
    for (const t of [c, d, e]) {
      t.animationContexts.set(t.movementAnimationName, {});
      t.document.movement = { state: "pending", user: { isSelf: false } };
    }
    clock.t += MOTION.armMs;
    const from = F.calls.length;
    c._onClickLeft({});
    const moved = [...new Set(F.calls.slice(from).filter(x => x.op === "move").map(x => x.id))].sort();
    assert.deepEqual(moved, [c.document.id, d.document.id], "c and d stop, e (not ours) walks on");
  } finally {
    for (const t of [c, d, e]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("decision 3: a member of this client's group stopped by another user (an unanimated write) is walked round by the rest", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("frnA000000000001", 400, 100), b = makeToken("frnB000000000001", 100, 100);
  const others = keepOnly([a, b]);
  dropWith(a, contextsFor([a, b], 0, 100));
  mock.timers.tick(100);
  clock.t += 2000;
  a.document._source.x = 400; a.document._source.y = 200;
  b.document._source.x = 700; b.document._source.y = 200;
  b.document.x = 100; b.document.y = 200; b.position = { x: 100, y: 200 };
  b.animationContexts.set(b.movementAnimationName, {});
  b.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(100, 200),
    passed: { waypoints: [wp(700, 200)] }, pending: { waypoints: [] } };
  const from = F.calls.length;
  try {
    F.fire("updateToken", a.document, { x: 400, y: 200 }, { animate: false }, "someoneElse");
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const bm = F.calls.slice(from).filter(x => x.op === "move" && x.id === b.document.id);
    assert.equal(bm[0]?.options?.animate, false, "b stops where it is drawn");
    assert.ok(bm[1], "then walks on round a");
    assert.deepEqual([bm[1].waypoints.at(-1).x, bm[1].waypoints.at(-1).y], [700, 200]);
    // This user's own unanimated write (a stop it made itself) is not a foreign stop.
    const f2 = F.calls.length;
    F.fire("updateToken", a.document, { x: 400, y: 200 }, { animate: false }, game.user.id);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    assert.equal(F.calls.slice(f2).filter(x => x.op === "move").length, 0);
  } finally {
    b.animationContexts.clear();
    b.document.movement = { state: "completed", user: { isSelf: true } };
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
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

test("H3-01: a group clicked to a stop in a fight, two of it finishing on one square: once at rest the later one steps to a free square (a walk, counted: S1R1-05); H3-16: status().group.stopped says so", async () => {
  combatFlag = true;
  clock.step = 0;
  const ts = [makeToken("cstA000000000001", 400, 200), makeToken("cstB000000000001", 300, 200), makeToken("cstC000000000001", 500, 200)];
  const others = keepOnly(ts);
  try {
    dropWith(ts[0], contextsFor(ts, 0, 400));
    // All three walking (this client's moves); B finishes its square on A's (walked too close in the corridor).
    for (const t of ts) {
      t.document.movement = { state: "pending", user: { isSelf: true } };
      t.animationContexts.set(t.movementAnimationName, {});
      t.document.stopMovement = function () {
        F.calls.push({ op: "stopMovement", id: this.id });
        this.movement = { state: "stopped", user: { isSelf: true } };
        this.object.animationContexts.clear();
        return true;
      };
    }
    ts[1].document._source.x = 400; ts[1].document._source.y = 500;
    ts[0].document._source.x = 400; ts[0].document._source.y = 500;
    ts[2].document._source.x = 500; ts[2].document._source.y = 500;
    clock.t += MOTION.armMs;
    const from = F.calls.length;
    ts[0]._onClickLeft({});
    for (let i = 0; i < 10; i++) await Promise.resolve();
    tickBy(3000);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const calls = F.calls.slice(from);
    assert.deepEqual([...new Set(calls.filter(c => c.op === "stopMovement").map(c => c.id))].sort(), ts.map(t => t.document.id).sort(), "all three stop at their next squares");
    const apart = calls.filter(c => c.op === "move");
    assert.equal(apart.length, 1, `one step apart: ${JSON.stringify(apart.map(m => [m.id, m.waypoints]))}`);
    const step = apart[0];
    assert.equal(step.id, ts[1].document.id, "the later of the pair moves");
    assert.notEqual(step.waypoints[0].action, "displace", "never a free displace in a fight (S1R1-05)");
    const p = step.waypoints[0];
    assert.ok(!(p.x === 400 && p.y === 500) && !(p.x === 500 && p.y === 500), `onto a free square: ${JSON.stringify(p)}`);
    assert.equal(p.x % S, 0); assert.equal(p.y % S, 0);
    assert.equal(api.status().group.stopped?.why, "click");
  } finally {
    for (const t of ts) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; delete t.document.stopMovement; }
    combatFlag = false;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("H3-05: a wave still on its way to the server when the group is clicked to a stop is stopped as soon as it moves", async () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("lwsA000000000001", 400, 200), makeToken("lwsB000000000001", 300, 200), makeToken("lwsC000000000001", 500, 200)];
  const others = keepOnly(ts);
  const real = viewedScene.updateEmbeddedDocuments;
  const held = [], inFlight = [];
  try {
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    const first = new Set(out[0].map(u => u._id));
    const waiting = ts.filter(t => !first.has(t.document.id));
    assert.ok(waiting.length > 0, "the case has a later wave");
    // The wave's update goes out and waits on the network.
    viewedScene.updateEmbeddedDocuments = async function (type, updates, options) {
      F.calls.push({ op: "scene.update", type, ids: updates.map(u => u._id), options });
      inFlight.push(...updates.map(u => u._id));
      await new Promise(r => held.push(r));
      return updates;
    };
    const moving = sceneTokens.get([...first][0]).object;
    moving.animationContexts.set(moving.movementAnimationName, {});
    for (let t = 0; t < 3000 && !held.length; t += 25) mock.timers.tick(25);
    assert.ok(held.length >= 1, "a wave is in flight");
    clock.t += MOTION.armMs;
    const from = F.calls.length;
    moving._onClickLeft({});
    // The wave lands: its members now walk.
    for (const t of waiting) { t.animationContexts.set(t.movementAnimationName, {}); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    for (const r of held) r();
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < 20; i++) await Promise.resolve();
      mock.timers.tick(60);
    }
    const stopped = new Set(F.calls.slice(from).filter(c => c.op === "move" && c.options?.animate === false).map(c => c.id));
    assert.ok(inFlight.length >= 1);
    for (const id of inFlight) assert.ok(stopped.has(id), `${id} (its wave landed after the click) is stopped too`);
    assert.equal(sent(from).length, 0, "no wave goes out after the click");
  } finally {
    viewedScene.updateEmbeddedDocuments = real;
    for (const t of ts) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    for (const [k, v] of others) sceneTokens.set(k, v);
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

test("H3-05: a player's stop of its own member, others of the group still walking, keeps out of the one-wide corridor they must pass", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = world.walls;
  // A one-wide corridor (y 400-500) from x 300 to 800 between two open rooms.
  world.walls = [[{ x: 300, y: 400 }, { x: 800, y: 400 }], [{ x: 300, y: 500 }, { x: 800, y: 500 }]];
  F.fire("updateWall");
  const a = makeToken("cdrA000000000001", 500, 400), b = makeToken("cdrB000000000001", 100, 400);
  const others = keepOnly([a, b]);
  try {
    for (const t of [a, b]) F.fire("updateToken", t.document, { x: 900 }, { pentarynMovementGroup: "grpCorr00000001" }, "u2");
    b.document.testUserPermission = () => false;
    for (const t of [a, b]) { t.animationContexts.set(t.movementAnimationName, {}); t.document.movement = { state: "pending", user: { isSelf: false } }; }
    a.document._source.x = 900; a.document._source.y = 400;
    clock.t += MOTION.armMs;
    const from = F.calls.length;
    a._onClickLeft({});
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const mv = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    // HX1-07: the square out of the corridor is far from where it is drawn: it stops on the near square, then walks there.
    assert.equal(mv.length, 2, "a stops, then walks out");
    assert.equal(mv[0].waypoints[0].action, "displace");
    assert.ok(Math.hypot(mv[0].waypoints[0].x - 500, mv[0].waypoints[0].y - 400) <= 75, `stopped where it is drawn: ${JSON.stringify(mv[0].waypoints[0])}`);
    const p = mv[1].waypoints.at(-1);
    assert.notEqual(p.action, "displace", "walked, not jumped");
    assert.ok(p.x <= 200 || p.x >= 800, `out of the corridor: ${JSON.stringify(p)}`);
    assert.ok(!F.calls.slice(from).some(c => c.op === "move" && c.id === b.document.id), "b (not ours) walks on");
  } finally {
    for (const t of [a, b]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    world.walls = saved;
    F.fire("updateWall");
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("H3-09: a group drop whose 2x2 member has no way its body fits through the door tells the dragger, as a single drag does", () => {
  combatFlag = false;
  clock.step = 0;
  const big = makeToken("gnwL000000000001", 600, 100, { size: 2 });
  const one = makeToken("gnwA000000000001", 400, 200);
  const others = keepOnly([big, one]);
  try {
    const ctx = contextsFor([one], 0, 400);
    const o = wp(600, 100, { width: 2, height: 2, snapped: false, explicit: false, checkpoint: false });
    ctx[big.document.id] = { token: big, destination: wp(600, 500, { width: 2, height: 2 }), foundPath: [o, wp(600, 150, { width: 2, height: 2 })], waypoints: [] };
    const from = F.calls.length;
    dropWith(one, ctx);
    tickBy(5000);
    assert.ok(api.status().group.last.excluded?.includes(big.document.id), JSON.stringify(api.status().group.last));
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.level === "warn" && /gnwL000000000001|tooNarrow/.test(c.message)), JSON.stringify(F.calls.slice(from).filter(c => c.op === "notify")));
  } finally {
    for (const [k, v] of others) sceneTokens.set(k, v);
    sceneTokens.delete(big.document.id); sceneTokens.delete(one.document.id);
    tickBy(60000);
  }
});

test("HX1-04: in a fight, a member crossing the door's line when it shuts (its square past it) finishes that square and goes no further", () => {
  combatFlag = true;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // Drawn 30 px short of the door line (y = 400), entering the square below it (its source), more squares pending.
  const a = walking("hx4A000000000001", { x: 400, y: 330 }, { x: 400, y: 400 }, [{ x: 400, y: 300 }, { x: 400, y: 400 }],
    { combat: true, pending: [{ x: 400, y: 500 }, { x: 400, y: 600 }] });
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    assert.ok(F.calls.slice(from).some(c => c.op === "stopMovement" && c.id === a.document.id), "it is stopped (it walked on into the far room)");
    a.animationContexts.clear(); a.document.movement.state = "stopped";
    mock.timers.tick(200);
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    assert.ok(moves.every(m => m.waypoints.every(w => w.y <= 400)), `no further: ${JSON.stringify(moves.map(m => m.waypoints))}`);
  } finally {
    world.walls.pop();
    combatFlag = false;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("S3R1-08: in a fight, a member whose square under way (or whose next square was already sent) lies past a door that shuts is put back on the square before it: that square undone, never drawn across", async () => {
  combatFlag = true;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  const hist = ys => ys.map(y => wp(400, y, { movementId: "mv1" }));
  const undoOf = t => {
    t.document.update = async (changes, options) => { F.calls.push({ op: "update", id: t.document.id, changes, options }); return true; };
  };
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  try {
    // 1. Drawn 30 px short of the door line (y = 400), entering the square below it (its source): it walked (400,200) and (400,300).
    const a = walking("s38A000000000001", { x: 400, y: 330 }, { x: 400, y: 400 }, [{ x: 400, y: 300 }, { x: 400, y: 400 }],
      { combat: true, pending: [{ x: 400, y: 500 }, { x: 400, y: 600 }] });
    a.document._source._movementHistory = hist([200, 300, 400]);
    undoOf(a);
    let from = F.calls.length;
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    let undo = F.calls.slice(from).find(c => c.op === "update" && c.id === a.document.id);
    assert.ok(undo, "the square past the door is undone");
    assert.deepEqual([undo.changes.x, undo.changes.y], [400, 300], "back on the last square before the door");
    assert.equal(undo.changes._movementHistory.length, 2, "and the history cut there: it pays for the squares it walked");
    assert.equal(undo.options.isUndo, true);
    assert.equal(undo.options.animate, false);
    const sa = F.calls.slice(from).findIndex(c => c.op === "stopAnimation" && c.id === a.document.id && c.opts?.reset === false);
    assert.ok(sa >= 0 && sa < F.calls.slice(from).indexOf(undo), "its tween stopped where it is drawn first (never drawn across)");
    a.animationContexts.clear(); a.document.movement.state = "stopped";
    a.document._source.y = 300;
    mock.timers.tick(200);
    assert.ok(F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id).every(m => m.waypoints.every(w => w.y <= 300)), "no walk past it");
    sceneTokens.clear();

    // 2. On (400,300), its next square (400,400) already on its way to the server when the door shuts: once it lands
    // (core passed it while the door was open), it is undone too.
    const b = walking("s38B000000000001", { x: 400, y: 300 }, { x: 400, y: 300 }, [{ x: 400, y: 200 }, { x: 400, y: 300 }],
      { combat: true, pending: [{ x: 400, y: 400 }, { x: 400, y: 500 }] });
    b.document._source._movementHistory = hist([200, 300]);
    b.document._movementContinuation = { continued: true };
    undoOf(b);
    from = F.calls.length;
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    assert.ok(!F.calls.slice(from).some(c => c.op === "update"), "nothing while its square is on the way");
    b.document._movementContinuation.continued = false;
    b.document._source.y = 400;
    b.document._source._movementHistory = hist([200, 300, 400]);
    mock.timers.tick(50);
    undo = F.calls.slice(from).find(c => c.op === "update" && c.id === b.document.id);
    assert.ok(undo, `undone once it landed: ${JSON.stringify(F.calls.slice(from).map(c => c.op))}`);
    assert.deepEqual([undo.changes.x, undo.changes.y], [400, 300]);
    assert.ok(game.pentaryn.movement.status().group.cut.undone >= 2);
  } finally {
    world.walls.pop();
    combatFlag = false;
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("S3R1-03: a player's stop of its own member whose walk out of the corridor would meet a walker stops on the nearest free square instead", async () => {
  combatFlag = false;
  clock.step = 0;
  const saved = world.walls;
  world.walls = [[{ x: 300, y: 400 }, { x: 800, y: 400 }], [{ x: 300, y: 500 }, { x: 800, y: 500 }]];
  F.fire("updateWall");
  const a = makeToken("s33A000000000001", 500, 400), b = makeToken("s33B000000000001", 100, 400);
  const others = keepOnly([a, b]);
  try {
    for (const t of [a, b]) F.fire("updateToken", t.document, { x: 900 }, { pentarynMovementGroup: "grpCorr00000002" }, "u2");
    b.document.testUserPermission = () => false;
    for (const t of [a, b]) { t.animationContexts.set(t.movementAnimationName, {}); t.document.movement = { state: "pending", user: { isSelf: false } }; }
    a.document._source.x = 900; a.document._source.y = 400;
    // b (the GM's) walks east up the corridor behind it, to (900, 400).
    b.document._source.x = 900;
    b.document.movement = { state: "pending", user: { isSelf: false }, origin: wp(100, 400), passed: { waypoints: [wp(900, 400)] }, pending: { waypoints: [] } };
    clock.t += MOTION.armMs;
    const placed = F.canvas.tokens.placeables;
    F.canvas.tokens.placeables = [a, b];
    const from = F.calls.length;
    a._onClickLeft({});
    F.canvas.tokens.placeables = placed;
    for (let i = 0; i < 20; i++) await Promise.resolve();
    const mv = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    assert.equal(mv.length, 1, `stops, and does not walk on through b's way: ${JSON.stringify(mv.map(m => m.waypoints))}`);
    assert.equal(mv[0].waypoints[0].action, "displace");
    assert.ok(Math.hypot(mv[0].waypoints[0].x - 500, mv[0].waypoints[0].y - 400) <= 75, `on the nearest free square: ${JSON.stringify(mv[0].waypoints[0])}`);
    assert.equal(game.pentaryn.movement.status().stop.last?.walkOnBlocked, 1, JSON.stringify(game.pentaryn.movement.status().stop));
  } finally {
    for (const t of [a, b]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    world.walls = saved;
    F.fire("updateWall");
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("HX1-08: out of combat, a member cut back on the square it is drawn in rests on that whole square, not where it is drawn", async () => {
  combatFlag = false;
  const saved = new Map(sceneTokens);
  sceneTokens.clear();
  // Drawn off the grid at (420, 280); the last square before the door on its way is the one it is drawn in.
  const a = walking("hx8A000000000001", { x: 420, y: 280 }, { x: 400, y: 700 }, [{ x: 400, y: 100 }, { x: 400, y: 700 }]);
  world.walls.push([{ x: 400, y: 400 }, { x: 500, y: 400 }]);
  const from = F.calls.length;
  try {
    F.fire("updateWall", doorWall, { ds: 0 }, {}, "gm");
    await settleWrites();
    const moves = F.calls.slice(from).filter(c => c.op === "move" && c.id === a.document.id);
    const end = moves.at(-1)?.waypoints.at(-1);
    assert.ok(end, "it moves");
    assert.equal(end.x % S, 0, `a whole square: ${JSON.stringify(moves.map(m => m.waypoints))}`);
    assert.equal(end.y % S, 0);
    assert.ok(end.y < 400, "before the door");
  } finally {
    world.walls.pop();
    sceneTokens.clear();
    for (const [k, v] of saved) sceneTokens.set(k, v);
  }
});

test("S1R1-09: a stop of a member whose wave landed after its group was clicked to a stop is counted on the click's record, never written over it", async () => {
  combatFlag = true;
  clock.step = 0;
  const ts = [makeToken("s9A0000000000001", 400, 200), makeToken("s9B0000000000001", 300, 200)];
  const others = keepOnly(ts);
  try {
    dropWith(ts[0], contextsFor(ts, 0, 400));
    for (const t of ts) {
      t.document.movement = { state: "pending", user: { isSelf: true } };
      t.animationContexts.set(t.movementAnimationName, {});
      t.document.stopMovement = function () { this.movement = { state: "stopped", user: { isSelf: true } }; this.object.animationContexts.clear(); return true; };
    }
    clock.t += MOTION.armMs;
    ts[0]._onClickLeft({});
    for (let i = 0; i < 10; i++) await Promise.resolve();
    assert.equal(api.status().stop.last?.via, "click");
    // B's wave lands now: the group's follow-up stop (lateStop).
    ts[1].document.movement = { state: "pending", user: { isSelf: true } };
    ts[1].animationContexts.set(ts[1].movementAnimationName, {});
    await api.stop(ts[1].document, { via: "late" });
    const last = api.status().stop.last;
    assert.equal(last.via, "click", JSON.stringify(last));
    assert.equal(last.tokenId, ts[0].document.id);
    assert.equal(last.late, 1);
  } finally {
    for (const t of ts) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; delete t.document.stopMovement; }
    combatFlag = false;
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("HX1-03 / S1R1-05: a group clicked to a stop in a fight: a member left at rest in a one-wide corridor walks on along its own way out of it (counted, never a displace back); one with no free way on walks out to open floor near it", async () => {
  combatFlag = true;
  clock.step = 0;
  const savedWalls = world.walls;
  // A one-wide corridor (y 400-500) from x 300 to 800 between two open rooms.
  world.walls = [[{ x: 300, y: 400 }, { x: 800, y: 400 }], [{ x: 300, y: 500 }, { x: 800, y: 500 }]];
  F.fire("updateWall");
  const ts = [makeToken("hx3A000000000001", 100, 400), makeToken("hx3B000000000001", 0, 400), makeToken("hx3C000000000001", 100, 300)];
  const others = keepOnly(ts);
  try {
    dropWith(ts[0], contextsFor(ts, 900, 0));
    for (const t of ts) {
      t.document.movement = { state: "pending", user: { isSelf: true } };
      t.animationContexts.set(t.movementAnimationName, {});
      t.document.stopMovement = function () {
        F.calls.push({ op: "stopMovement", id: this.id });
        this.movement = { state: "stopped", user: { isSelf: true } };
        this.object.animationContexts.clear();
        return true;
      };
    }
    // A's way on east, a square at a time, as its checkpoints hold it (the stop clears them).
    ts[0].document.movement.pending = { waypoints: [500, 600, 700, 800, 900, 1000].map(x => ({ x, y: 400 })) };
    // Where they finish their squares: A and B in the corridor, C in the room before it.
    ts[0].document._source.x = 500; ts[0].document._source.y = 400;
    ts[1].document._source.x = 400; ts[1].document._source.y = 400;
    ts[2].document._source.x = 200; ts[2].document._source.y = 300;
    clock.t += MOTION.armMs;
    const from = F.calls.length;
    ts[0]._onClickLeft({});
    for (let i = 0; i < 10; i++) await Promise.resolve();
    tickBy(3000);
    for (let i = 0; i < 10; i++) await Promise.resolve();
    const moves = F.calls.slice(from).filter(c => c.op === "move");
    for (const t of ts.slice(0, 2)) {
      const m = moves.find(x => x.id === t.document.id);
      assert.ok(m, `${t.document.id} steps out of the corridor: ${JSON.stringify(moves.map(x => [x.id, x.waypoints]))}`);
      const p = m.waypoints.at(-1);
      assert.ok(m.waypoints.every(w => w.action !== "displace"), "never a free displace in a fight");
      assert.ok(p.x <= 200 || p.x >= 800, `out of the corridor: ${JSON.stringify(p)}`);
    }
    // A walks on, east, square by square (no jump back past where it came from).
    const a = moves.find(x => x.id === ts[0].document.id);
    assert.deepEqual(a.waypoints.map(w => w.x), a.waypoints.map((w, k) => 600 + 100 * k), `A walks on along its way: ${JSON.stringify(a.waypoints)}`);
    assert.ok(a.waypoints.at(-1).x >= 800);
    const ends = moves.map(m => m.waypoints.at(-1)).map(p => `${p.x},${p.y}`);
    assert.equal(new Set([...ends, "200,300"]).size, ends.length + 1, "each on its own square");
  } finally {
    for (const t of ts) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; delete t.document.stopMovement; }
    combatFlag = false;
    world.walls = savedWalls;
    F.fire("updateWall");
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("HX1-01: the grabbed one's drag route is not reused when it passes through a token that stays; its route goes round it", () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("hx1A000000000001", 100, 100), b = makeToken("hx1B000000000001", 100, 200);
  const rest = makeToken("hx1R000000000001", 300, 100);
  rest.visible = false;                         // out of this client's sight (a GM controlling a member): it still stands there
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, b, rest];
  try {
    const ctx = contextsFor([a, b], 400, 0);
    // The drag's own route: straight east through the standing token.
    ctx.hx1A000000000001.foundPath = [wp(100, 100, { snapped: false, explicit: false, checkpoint: false }), wp(500, 100)];
    const from = F.calls.length;
    const out = dropWith(a, ctx);
    tickBy(5000);
    const batches = [...(out ? [{ options: out[1] }] : []), ...sent(from)];
    const ma = batches.map(x => x.options.movement?.[a.document.id]).find(Boolean);
    assert.ok(ma, "a moves");
    let prev = { x: 150, y: 150 };
    const c = { x: 350, y: 150 };
    for (const p of ma.waypoints) {
      const q = { x: p.x + 50, y: p.y + 50 };
      const L2 = (q.x - prev.x) ** 2 + (q.y - prev.y) ** 2;
      const t = L2 ? Math.min(Math.max(((c.x - prev.x) * (q.x - prev.x) + (c.y - prev.y) * (q.y - prev.y)) / L2, 0), 1) : 0;
      assert.ok(Math.hypot(c.x - (prev.x + (q.x - prev.x) * t), c.y - (prev.y + (q.y - prev.y) * t)) >= 98, `a never passes through it: ${JSON.stringify(ma.waypoints.map(w => [w.x, w.y]))}`);
      prev = q;
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(rest.document.id);
    tickBy(60000);
  }
});

test("HX1-06: a page frozen past two waves' times sends the overdue one, then the next as far after it as planned (never both in one tick)", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("frzA000000000001", 400, 200), makeToken("frzB000000000001", 300, 200), makeToken("frzC000000000001", 500, 200)];
  const others = keepOnly(ts);
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    assert.ok(Array.isArray(out));
    const waves = api.status().group.last.waves;
    assert.ok(waves >= 3, `three waves at least (${waves})`);
    mock.timers.tick(1500);                       // one frozen stretch past every wave's time
    assert.equal(sent(from).length, 1, "only the overdue wave goes at once");
    tickBy(2000);
    const later = sent(from);
    assert.equal(later.length, waves - 1, "the rest follow, spaced");
  } finally {
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("HX1-07: a member another user stopped that walks on to its square after the displace: the rest walk round that square, not the displace's", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("frsA000000000001", 400, 100), b = makeToken("frsB000000000001", 100, 100);
  const others = keepOnly([a, b]);
  dropWith(a, contextsFor([a, b], 0, 200));
  mock.timers.tick(100);
  clock.t += 2000;
  // b walks east along y = 300; a was displaced to (400, 200) (clear of b's way), walking on to (400, 300) (on it).
  a.document._source.x = 400; a.document._source.y = 200;
  b.document._source.x = 700; b.document._source.y = 300;
  b.document.x = 100; b.document.y = 300; b.position = { x: 100, y: 300 };
  b.animationContexts.set(b.movementAnimationName, {});
  b.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(100, 300),
    passed: { waypoints: [wp(700, 300)] }, pending: { waypoints: [] } };
  const from = F.calls.length;
  try {
    F.fire("updateToken", a.document, { x: 400, y: 200 }, { animate: false, pentarynMovementStopAt: { x: 400, y: 300 } }, "someoneElse");
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const bm = F.calls.slice(from).filter(x => x.op === "move" && x.id === b.document.id);
    assert.equal(bm[0]?.options?.animate, false, "b stops where it is drawn: its way crosses the square a walks on to");
  } finally {
    b.animationContexts.clear();
    b.document.movement = { state: "completed", user: { isSelf: true } };
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

test("HX1-01 (c): a player's stop of its own member: this client never walks that player's other members round it (the player stops them), only its own", async () => {
  combatFlag = false;
  clock.step = 0;
  const a = makeToken("ownA000000000001", 400, 100), c = makeToken("ownC000000000001", 100, 150), b = makeToken("ownB000000000001", 100, 100);
  const others = keepOnly([a, c, b]);
  const player = { id: "plyr000000000001", name: "Player", isGM: false };
  const savedGet = game.users.get.bind(game.users);
  game.users.get = id => (id === player.id ? player : savedGet(id));
  for (const t of [a, c]) t.document.testUserPermission = (u, lvl) => u === player && lvl === "OWNER";
  b.document.testUserPermission = () => false;
  dropWith(a, contextsFor([a, c, b], 0, 100));
  mock.timers.tick(100);
  clock.t += 2000;
  a.document._source.x = 400; a.document._source.y = 200;
  for (const [t, y] of [[b, 200], [c, 250]]) {
    t.document._source.x = 700; t.document._source.y = y;
    t.document.x = 100; t.document.y = y; t.position = { x: 100, y };
    t.animationContexts.set(t.movementAnimationName, {});
    t.document.movement = { state: "completed", user: { isSelf: true }, constrainOptions: {}, origin: wp(100, y), passed: { waypoints: [wp(700, y)] }, pending: { waypoints: [] } };
  }
  const from = F.calls.length;
  try {
    F.fire("updateToken", a.document, { x: 400, y: 200 }, { animate: false }, player.id);
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const moved = id => F.calls.slice(from).some(x => x.op === "move" && x.id === id);
    assert.ok(moved(b.document.id), "b (this client's) walks round a");
    assert.ok(!moved(c.document.id), "c (the player's) is the player's to stop");
  } finally {
    game.users.get = savedGet;
    for (const t of [b, c]) { t.animationContexts.clear(); t.document.movement = { state: "completed", user: { isSelf: true } }; }
    for (const [k, v] of others) sceneTokens.set(k, v);
    tickBy(60000);
  }
});

/* ---- 0.5.0: standing tokens are hard obstacles ---- */

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
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"), "told");
    assert.equal(api.status().group.last.result, "short");
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(door.document.id); sceneTokens.delete(a.document.id);
    tickBy(60000);
  }
});

test("0.5.0: a group whose only way is through a token standing in the door: nobody walks through it, they stop short in the room, and the dragger is told", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("hrdA000000000001", 400, 200), makeToken("hrdB000000000001", 300, 200), makeToken("hrdC000000000001", 500, 200)];
  const door = makeToken("hrdE000000000001", 400, 400);
  door.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, door];
  try {
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    tickBy(10000);
    const batches = [...(out ? [{ options: out[1] }] : []), ...sent(from)];
    const moves = Object.assign({}, ...batches.map(b => b.options.movement ?? {}));
    for (const t of ts) {
      const m = moves[t.document.id];
      if (!m) continue;                                              // one that cannot move at all stays
      assert.ok(clearOf(t.document._source, m.waypoints, center(door.document._source), S - 1), `${t.document.id} never through it`);
      assert.ok(center(m.waypoints.at(-1)).y < 400, `${t.document.id} rests in the room: ${JSON.stringify(m.waypoints.at(-1))}`);
    }
    const last = api.status().group.last;
    assert.equal(last.result, "plan");
    assert.ok(last.short.includes(ts[0].document.id), JSON.stringify(last));
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"), "told");
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(door.document.id);
    tickBy(60000);
  }
});

test("0.5.0: a group drop left to core (out of planning time) stops each member's walk before a token standing in its way", () => {
  combatFlag = false;
  const ts = [makeToken("hrcA000000000001", 100, 600), makeToken("hrcB000000000001", 100, 700)];
  const still = makeToken("hrcS000000000001", 500, 700);
  still.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, still];
  const path = (t, ...pts) => [wp(t.document._source.x, t.document._source.y, { snapped: false, explicit: false, checkpoint: false }), ...pts.map(([x, y]) => wp(x, y))];
  const ctx = {
    [ts[0].document.id]: { token: ts[0], destination: wp(800, 600), foundPath: path(ts[0], [800, 600]), waypoints: [] },
    [ts[1].document.id]: { token: ts[1], destination: wp(800, 700), foundPath: path(ts[1], [800, 700]), waypoints: [] },
  };
  try {
    clock.step = 200;
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], ctx), null);
    for (let k = 0; k < 50; k++) mock.timers.tick(10);
    clock.step = 0;
    assert.equal(api.status().group.last.reason, "budget");
    const commit = sent(from)[0];
    const mb = commit.options.movement[ts[1].document.id];
    assert.ok(mb, "b still moves");
    assert.ok(clearOf(ts[1].document._source, mb.waypoints, center(still.document._source), S - 1), `b stops before the standing token: ${JSON.stringify(mb.waypoints.map(w => [w.x, w.y]))}`);
    assert.ok(center(mb.waypoints.at(-1)).x <= 450, JSON.stringify(mb.waypoints.at(-1)));
  } finally {
    clock.step = 0;
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(still.document.id);
    tickBy(60000);
  }
});

test("0.5.0: in a fight a member's route goes round a token that stays too, every square a checkpoint", () => {
  combatFlag = true;
  clock.step = 0;
  const a = makeToken("hfgA000000000001", 100, 100), b = makeToken("hfgB000000000001", 100, 200);
  const rest = makeToken("hfgR000000000001", 300, 200);
  rest.visible = true;
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [a, b, rest];
  try {
    const from = F.calls.length;
    const out = dropWith(a, contextsFor([a, b], 400, 0));
    tickBy(5000);
    const batches = [...(out ? [{ options: out[1] }] : []), ...sent(from)];
    const mb = batches.map(x => x.options.movement?.[b.document.id]).find(Boolean);
    assert.equal(api.status().group.last.mode, "plan", JSON.stringify(api.status().group.last));
    assert.equal(api.status().group.last.combat, true);
    assert.ok(mb, "b moves");
    assert.ok(clearOf(b.document._source, mb.waypoints, center(rest.document._source), S - 1), `b never through the standing token: ${JSON.stringify(mb.waypoints.map(w => [w.x, w.y]))}`);
    for (const w of mb.waypoints) assert.ok(w.x % S === 0 && w.y % S === 0, `on whole squares: ${JSON.stringify(w)}`);
  } finally {
    combatFlag = false;
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(rest.document.id);
    tickBy(60000);
  }
});

/* -------------------------------------------- */
/*  Stage 1, round S1R2 (0.5.2)                  */
/* -------------------------------------------- */

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
    assert.ok(F.calls.slice(from).some(c => c.op === "notify" && c.message === "PENTARYN_MOVEMENT.notify.noRoute"), "told");
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

/* -------------------------------------------- */
/*  0.6.0: server-ordered reservations          */
/* -------------------------------------------- */

const { reservations: reserveMod } = await import("../reserve-adapter.mjs");
const { PLAN_OPT, RID_OPT } = reserveMod;
const { encode: encodeWire } = await import("../reserve-core.mjs");
const flush = async (n = 6) => { for (let k = 0; k < n; k++) await new Promise(r => setImmediate(r)); };
/** A reservation another client published: token `id` walking `points` (centres, squares) from now. */
const foreignWire = (rid, id, points, extra = {}) => encodeWire({ rid, scene: SCENE, user: "other00000000001", members: [{ id, r: 0.5, speed: 6, delay: 0, points }], ...extra });

test("0.6.0: a group drop alone on the table carries its whole reservation on its first wave, and every wave names it", () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const ts = [makeToken("rsvA000000000001", 400, 200), makeToken("rsvB000000000001", 300, 200), makeToken("rsvC000000000001", 500, 200)];
  const from = F.calls.length;
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  assert.ok(Array.isArray(out), "planned synchronously (nobody else could be planning)");
  const plan = out[1][PLAN_OPT];
  assert.ok(plan?.rid, "the plan rides the first wave");
  assert.deepEqual(plan.members.map(m => m.id).sort(), ts.map(t => t.document.id).sort(), "every member's walk, later waves too");
  for (const m of plan.members) assert.ok(m.p.length >= 4 && m.d >= 0 && m.d % MOTION.delayStep === 0, JSON.stringify(m));
  for (const id of out[0].map(u => u._id)) assert.equal(out[1][RID_OPT][id], plan.rid);
  tickBy(5000);
  for (const b of sent(from)) {
    assert.equal(b.options[PLAN_OPT], undefined, "later waves do not repeat the plan");
    for (const id of b.ids) assert.equal(b.options[RID_OPT]?.[id], plan.rid, "a later wave names its reservation");
  }
  assert.equal(api.status().group.last.reserved, plan.members.length);
  assert.ok(api.status().group.reservations.inline >= 1);
  tickBy(60000);
});

test("0.6.0: every client records a reservation once; its own move sets it off, any other move or a stop drops it", () => {
  reserveMod.reset();
  const a = makeToken("rsvD000000000001", 100, 100), b = makeToken("rsvE000000000001", 100, 300);
  const w = encodeWire({ rid: "ridAB00000000001", scene: SCENE, members: [
    { id: a.document.id, r: 0.5, speed: 6, delay: 0, points: [{ x: 1.5, y: 1.5 }, { x: 5.5, y: 1.5 }] },
    { id: b.document.id, r: 0.5, speed: 6, delay: 300, points: [{ x: 1.5, y: 3.5 }, { x: 5.5, y: 3.5 }] }] });
  F.fire("updateToken", a.document, {}, { [PLAN_OPT]: w }, "other00000000001");
  F.fire("updateToken", b.document, {}, { [PLAN_OPT]: w }, "other00000000001");
  let st = api.status().group.reservations;
  assert.equal(st.live, 1);
  assert.equal(st.received, 1, "one update, two tokens: recorded once");
  F.fire("moveToken", a.document, { id: "mvA", chain: [] }, { [RID_OPT]: { [a.document.id]: w.rid } }, null);
  F.fire("moveToken", a.document, { id: "mvA2", chain: ["mvA"] }, {}, null);
  assert.equal(api.status().group.reservations.reservations[0].members, 2, "a fight's next square keeps it");
  F.fire("moveToken", a.document, { id: "other", chain: [] }, {}, null);
  assert.equal(api.status().group.reservations.reservations[0].members, 1, "a move that is not the reservation's drops it");
  F.fire("stopToken", b.document);
  st = api.status().group.reservations;
  assert.equal(st.live, 0, "a stop drops it");
  assert.equal(st.dropped, 1);
  sceneTokens.delete(a.document.id);
  sceneTokens.delete(b.document.id);
});

test("0.6.0: a single drag across another client's reserved walk waits for it, then carries its own reservation", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const s = makeToken("rsvS000000000001", 100, 600), f = makeToken("rsvF000000000001", 400, 900);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [s, f];
  try {
    // F walks north across S's way, from now.
    const w = foreignWire("ridF000000000001", f.document.id, [{ x: 4.5, y: 9.5 }, { x: 4.5, y: 5.5 }]);
    F.fire("updateToken", f.document, {}, { [PLAN_OPT]: w }, "other00000000001");
    F.fire("moveToken", f.document, { id: "mvF", chain: [] }, { [RID_OPT]: { [f.document.id]: w.rid } }, null);
    const from = F.calls.length;
    const out = dropWith(s, contextsFor([s], 600, 0));
    assert.equal(out, null, "it waits: the drop sends nothing now");
    const delay = api.status().group.last.delay;
    assert.ok(delay > 0 && delay % MOTION.delayStep === 0, `a start delay: ${delay}`);
    tickBy(delay - 50);
    await flush();
    assert.equal(sent(from).length, 0, "not before its delay");
    tickBy(100);
    await flush();
    const go = sent(from);
    assert.equal(go.length, 1);
    assert.deepEqual(go[0].ids, [s.document.id]);
    assert.equal(go[0].options[PLAN_OPT].members[0].id, s.document.id, "its own reservation rides the move");
    assert.equal(go[0].options[PLAN_OPT].members[0].d, 0, "set off now");
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(f.document.id);
    sceneTokens.delete(s.document.id);
    reserveMod.reset();
    tickBy(60000);
  }
});

test("0.6.0: with another client planning, a drop publishes first; a reservation that came back before its echo and meets it makes it the later one: planned again, round it", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  F.CONFIG.debug["pentaryn-movement.publishFirst"] = true;
  const s = makeToken("rsvT000000000001", 100, 600), f = makeToken("rsvG000000000001", 400, 900);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [s, f];
  const publishes = [];
  let competitor = true;
  // The server's order: the other client's reservation is applied (and broadcast) before this one's publish.
  s.document.update = async (changes, options) => {
    publishes.push(options);
    if (competitor) {
      competitor = false;
      const w = foreignWire("ridG000000000001", f.document.id, [{ x: 4.5, y: 9.5 }, { x: 4.5, y: 5.5 }]);
      F.fire("updateToken", f.document, {}, { [PLAN_OPT]: w }, "other00000000001");
    }
    F.fire("updateToken", s.document, changes, options, game.user.id);
    return s.document;
  };
  try {
    const from = F.calls.length;
    assert.equal(dropWith(s, contextsFor([s], 600, 0)), null, "published first: nothing sent with the drop");
    await flush();
    assert.equal(publishes.length, 2, "the race lost at the echo: published again");
    assert.ok(publishes[0][PLAN_OPT] && publishes[0].diff === false);
    assert.equal(publishes[1][PLAN_OPT].replaces, publishes[0][PLAN_OPT].rid, "the new reservation replaces the first");
    assert.ok(publishes[1][PLAN_OPT].members[0].d > 0, "planned round the earlier one: it waits");
    const st = api.status().group.reservations;
    assert.equal(st.raced, 1);
    assert.equal(st.race.single, true);
    tickBy(RESERVE.singleMs + 200);
    await flush();
    const go = sent(from);
    assert.equal(go.length, 1, "then it moves, once");
    assert.equal(go[0].options[PLAN_OPT], undefined, "its echo was read: the move only names it");
    assert.equal(go[0].options[RID_OPT][s.document.id], publishes[1][PLAN_OPT].rid);
  } finally {
    F.CONFIG.debug["pentaryn-movement.publishFirst"] = false;
    delete s.document.update;
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(f.document.id);
    sceneTokens.delete(s.document.id);
    reserveMod.reset();
    tickBy(60000);
  }
});

test("0.6.0: with another client planning, a group drop publishes first and moves at its echo when nothing came before it", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  F.CONFIG.debug["pentaryn-movement.publishFirst"] = true;
  const ts = [makeToken("rsvH000000000001", 400, 200), makeToken("rsvI000000000001", 300, 200), makeToken("rsvJ000000000001", 500, 200)];
  const publishes = [];
  ts[0].document.update = async (changes, options) => {
    publishes.push(options);
    F.fire("updateToken", ts[0].document, changes, options, game.user.id);
    return ts[0].document;
  };
  try {
    const from = F.calls.length;
    assert.equal(dropWith(ts[0], contextsFor(ts, 0, 400)), null);
    await flush();
    assert.equal(publishes.length, 1);
    const first = sent(from)[0];
    assert.ok(first, "the first wave goes at the echo");
    assert.equal(first.options[PLAN_OPT], undefined);
    for (const id of first.ids) assert.equal(first.options[RID_OPT][id], publishes[0][PLAN_OPT].rid);
    assert.equal(api.status().group.reservations.raced, 0);
  } finally {
    F.CONFIG.debug["pentaryn-movement.publishFirst"] = false;
    delete ts[0].document.update;
    reserveMod.reset();
    tickBy(60000);
  }
});

test("0.6.0: a hidden member is never in a reservation (players receive every option)", () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const ts = [makeToken("rsvK000000000001", 400, 200), makeToken("rsvL000000000001", 300, 200)];
  ts[1].document.hidden = true;
  try {
    const out = dropWith(ts[0], contextsFor(ts, 0, 400));
    const plan = out?.[1]?.[PLAN_OPT];
    assert.ok(plan);
    assert.deepEqual(plan.members.map(m => m.id), [ts[0].document.id]);
    assert.equal(out[1][RID_OPT][ts[1].document.id], undefined);
  } finally {
    ts[1].document.hidden = false;
    tickBy(60000);
  }
});

test("0.6.0: a group dropped where another move's reserved walk ends rests clear of that spot", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  // The reservations' clock runs with the mocked timers (0.6.1: a drop queues again while F is still on its way; on a
  // clock that never moves F never got there, and the drop queued for its whole budget).
  const perfNow = performance.now;
  performance.now = () => Date.now();
  const f = makeToken("rsvM000000000001", 800, 800);
  const ts = [makeToken("rsvN000000000001", 100, 100), makeToken("rsvO000000000001", 200, 100)];
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, f];
  try {
    // F is reserved to come to rest at (6.5, 1.5): the grabbed one's drop point.
    const w = foreignWire("ridM000000000001", f.document.id, [{ x: 8.5, y: 8.5 }, { x: 8.5, y: 4.5 }, { x: 6.5, y: 1.5 }]);
    F.fire("updateToken", f.document, {}, { [PLAN_OPT]: w }, "other00000000001");
    // It sets off: the server has it where it stops.
    Object.assign(f.document._source, { x: 600, y: 100 });
    Object.assign(f.document, { x: 600, y: 100 });
    F.fire("moveToken", f.document, { id: "mvM", chain: [] }, { [RID_OPT]: { [f.document.id]: w.rid } }, null);
    const from = F.calls.length;
    const out = dropWith(ts[0], contextsFor(ts, 500, 0));
    for (let k = 0; k < 20; k++) { tickBy(500); await flush(); }
    const ends = [];
    // It may queue first (the reserved walk passes by the spot it takes instead), then go: every batch it sends.
    const all = [...(out ? [{ options: out[1] }] : []), ...sent(from)];
    for (const b of all) for (const [id, m] of Object.entries(b.options.movement ?? {})) ends.push({ id, end: m.waypoints.at(-1) });
    assert.ok(ends.length >= 1, "it moves");
    for (const { end } of ends) {
      const c = { x: (end.x + 50) / 100, y: (end.y + 50) / 100 };
      assert.ok(Math.hypot(c.x - 6.5, c.y - 1.5) >= 1 - 1e-6, `rests clear of the reserved spot: ${JSON.stringify(c)}`);
    }
  } finally {
    F.canvas.tokens.placeables = saved;
    sceneTokens.delete(f.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});

/* -------------------------------------------- */
/*  Stage 2 round 1 (S2R1)                      */
/* -------------------------------------------- */

/** A reservation another client published and set off: token `id` walking `points` (centres, squares) at `speed`. */
function reserveWalk(doc, rid, points, speed) {
  const w = encodeWire({ rid, scene: SCENE, user: "other00000000001", members: [{ id: doc.id, r: 0.5, speed, delay: 0, points }] });
  F.fire("updateToken", doc, {}, { [PLAN_OPT]: w }, "other00000000001");
  F.fire("moveToken", doc, { id: `mv${rid}`, chain: [] }, { [RID_OPT]: { [doc.id]: w.rid } }, null);
  return w;
}
/** A later wave of another client's plan: `doc` is reserved to walk `points` `delay` ms from now; it stands until then. */
function reserveLater(doc, rid, points, delay) {
  const w = encodeWire({ rid, scene: SCENE, user: "other00000000001", members: [{ id: doc.id, r: 0.5, speed: 6, delay, points }] });
  F.fire("updateToken", doc, {}, { [PLAN_OPT]: w }, "other00000000001");
  return w;
}
/** Its move arrives: it sets off, and the server has it where it will stop (top-left px `to`). */
function setOff(doc, w, to) {
  Object.assign(doc._source, to);
  Object.assign(doc, to);
  F.fire("moveToken", doc, { id: `mv${w.rid}`, chain: [] }, { [RID_OPT]: { [doc.id]: w.rid } }, null);
}
/** Every notice a test drop gives (the localization keys), for the length of `fn`. */
async function noticesOf(fn) {
  const n = globalThis.ui.notifications;
  const saved = n.warn;
  const out = [];
  n.warn = (msg, o) => { out.push(String(msg)); return saved?.call(n, msg, o); };
  try { await fn(out); } finally { n.warn = saved; }
  return out;
}

test("S2R1-01: a group drop queued behind a walk goes once it is past", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const perfNow = performance.now;
  performance.now = () => Date.now();          // the reservations' clock runs with the mocked timers
  const f = makeToken("s2bF000000000001", 1000, 100);
  const ts = [makeToken("s2bA000000000001", 200, 100), makeToken("s2bB000000000001", 100, 100)];
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, f];
  try {
    reserveWalk(f.document, "ridS2bF000000001", [{ x: 10.5, y: 1.5 }, { x: 4.5, y: 1.5 }, { x: 4.5, y: 2.6 }], 0.9);
    const from = F.calls.length;
    const warns = await noticesOf(async () => {
      dropWith(ts[0], contextsFor(ts, 500, 0));
      tickBy(RESERVE.queueMs + 12000);
      await flush();
      tickBy(5000);
      await flush();
    });
    const ends = {};
    for (const b of sent(from)) for (const [id, m] of Object.entries(b.options.movement ?? {})) ends[id] = m.waypoints.at(-1);
    assert.deepEqual(ends[ts[0].document.id] && [ends[ts[0].document.id].x, ends[ts[0].document.id].y], [700, 100], `the grabbed one gets there: ${JSON.stringify(ends)} ${JSON.stringify(api.status().group.last)}`);
    assert.deepEqual(warns, []);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of [f, ...ts]) sceneTokens.delete(t.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});

test("S2R1-03: a single drag still blocked when its queue is over queues again (RESERVE.queueMs in all), then goes the whole way", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const perfNow = performance.now;
  performance.now = () => Date.now();          // the reservations' clock runs with the mocked timers
  const s = makeToken("s2cS000000000001", 100, 600), f = makeToken("s2cF000000000001", 900, 600), g = makeToken("s2cG000000000001", 900, 600);
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [s, f, g];
  try {
    // F comes head-on along S's row for about 4 s, then steps off it: past any start delay a single drag tries.
    const way = [{ x: 9.5, y: 6.5 }, { x: 5.5, y: 6.5 }, { x: 5.5, y: 8.0 }];
    let from = null;
    const warns = await noticesOf(async () => {
      reserveWalk(f.document, "ridS2cF000000001", way, 1);
      from = F.calls.length;
      assert.equal(dropWith(s, contextsFor([s], 600, 0)), null, "it queues");
      const q1 = api.status().group.last.queued;
      assert.ok(q1 > 0 && q1 < RESERVE.queueMs, `a queue with room left: ${q1}`);
      // Just before it is over, G comes the same way (a move reserved during the queue, or one that ran late).
      tickBy(q1 - 100);
      reserveWalk(g.document, "ridS2cG000000001", way, 1);
      tickBy(200);
      await flush();
      assert.equal(sent(from).length, 0, `queued again, not cut short: ${JSON.stringify(api.status().group.last)}`);
      for (let k = 0; k < 40; k++) { tickBy(500); await flush(); }
    });
    const go = sent(from);
    assert.equal(go.length, 1, JSON.stringify(api.status().group.last));
    const end = go[0].options.movement[s.document.id].waypoints.at(-1);
    assert.deepEqual([end.x, end.y], [700, 600], `the whole way: ${JSON.stringify(api.status().group.last)}`);
    const rec = api.status().group.last;
    assert.ok(rec.queued > 0 && rec.queued <= RESERVE.queueMs, JSON.stringify(rec));
    assert.deepEqual(warns, []);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of [s, f, g]) sceneTokens.delete(t.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});

test("S2R1-01: a group drop whose way is still taken when its queue is over queues again, then goes; never \"No route there\"", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const perfNow = performance.now;
  performance.now = () => Date.now();
  // F stands just past the one-square door and G just before it: two later waves of other moves, both about to walk off.
  const f = makeToken("s2eF000000000001", 400, 400), g = makeToken("s2eG000000000001", 400, 300);
  const ts = [makeToken("s2eA000000000001", 400, 100), makeToken("s2eB000000000001", 300, 100)];
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [...ts, f, g];
  try {
    let from = null;
    const warns = await noticesOf(async () => {
      const wf = reserveLater(f.document, "ridS2eF000000001", [{ x: 4.5, y: 4.5 }, { x: 8.5, y: 4.5 }], 1200);
      from = F.calls.length;
      assert.equal(dropWith(ts[0], contextsFor(ts, 0, 500)), null, "it queues for F");
      const q1 = api.status().group.last.queued;
      assert.equal(api.status().group.last.result, "queued", JSON.stringify(api.status().group.last));
      tickBy(1200);
      setOff(f.document, wf, { x: 800, y: 400 });
      // G's own move is reserved while the group queues: it walks off a little later.
      tickBy(q1 - 1300);
      const wg = reserveLater(g.document, "ridS2eG000000001", [{ x: 4.5, y: 3.5 }, { x: 8.5, y: 3.5 }], 1000);
      tickBy(200);
      await flush();
      const again = api.status().group.last;
      assert.equal(sent(from).length, 0, `G is still in the way: nothing sent (${JSON.stringify(again)})`);
      assert.equal(again.result, "queued", `queued again: ${JSON.stringify(again)}`);
      assert.ok(again.queued > q1 && again.queued <= RESERVE.queueMs, JSON.stringify(again));
      tickBy(800);
      setOff(g.document, wg, { x: 800, y: 300 });
      for (let k = 0; k < 30; k++) { tickBy(500); await flush(); }
    });
    const ends = {};
    for (const b of sent(from)) for (const [id, m] of Object.entries(b.options.movement ?? {})) ends[id] = m.waypoints.at(-1);
    const a = ends[ts[0].document.id];
    assert.deepEqual(a && [a.x, a.y], [400, 600], `the grabbed one gets through the door: ${JSON.stringify(ends)} ${JSON.stringify(api.status().group.last)}`);
    assert.ok(!warns.some(m => /noRoute/.test(m)), `no "No route there": ${JSON.stringify(warns)}`);
    assert.ok(api.status().group.reservations.queued >= 2);
  } finally {
    F.canvas.tokens.placeables = saved;
    for (const t of [f, g, ...ts]) sceneTokens.delete(t.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});

/* -------------------------------------------- */
/*  Stage 2 round 2 (S2R2)                      */
/* -------------------------------------------- */

test("S2R2-03: a hidden token the GM drags that must wait where a player's reserved walk passes steps aside first, then goes", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const perfNow = performance.now;
  performance.now = () => Date.now();
  const user = game.user;
  const wasGM = user.isGM;
  Object.defineProperty(user, "isGM", { value: true, configurable: true, writable: true });
  const h = makeToken("s2rH000000000001", 500, 100), f = makeToken("s2rF000000000001", 100, 100);
  h.document.hidden = true;
  const steps = [];
  // The step aside lands where it was sent (the server's echo before the promise resolves, as core's).
  h.document.move = async (waypoints, options) => {
    steps.push({ waypoints, options });
    Object.assign(h.document._source, { x: waypoints.at(-1).x, y: waypoints.at(-1).y });
    Object.assign(h.document, { x: waypoints.at(-1).x, y: waypoints.at(-1).y });
    return true;
  };
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [h, f];
  const way = [{ x: 1.5, y: 1.5 }, { x: 9.5, y: 1.5 }];
  try {
    // A player's group member, which cannot see H, is reserved to walk along H's row, through where H stands.
    reserveWalk(f.document, "ridS2rF000000001", way, 1);
    const from = F.calls.length;
    // The GM drags H head-on along that row: no start delay clears it, so it would wait at its start.
    assert.equal(dropWith(h, contextsFor([h], -300, 0)), null, "it waits");
    for (let k = 0; k < 40; k++) { tickBy(500); await flush(); }
    assert.equal(steps.length, 1, `it stepped aside once: ${JSON.stringify(api.status().group.last)}`);
    const at = steps[0].waypoints.at(-1);
    const c = { x: (at.x + 50) / 100, y: (at.y + 50) / 100 };
    // Off the walk: never inside it (the walker's circle plus its own).
    assert.ok(Math.abs(c.y - 1.5) >= 1 - 1e-6, `clear of the walk: ${JSON.stringify(c)}`);
    assert.ok(c.y < 4, "on its own side of the wall");
    const go = sent(from);
    assert.equal(go.length, 1, `then it goes: ${JSON.stringify(api.status().group.last)}`);
    const end = go[0].options.movement[h.document.id].waypoints.at(-1);
    assert.deepEqual([end.x, end.y], [200, 100], "to where it was dropped");
    assert.equal(api.status().group.reservations.aside, 1);
  } finally {
    Object.defineProperty(user, "isGM", { value: wasGM, configurable: true, writable: true });
    F.canvas.tokens.placeables = saved;
    for (const t of [h, f]) sceneTokens.delete(t.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});

/* -------------------------------------------- */
/*  Stage 2 round 3 (S2R3)                      */
/* -------------------------------------------- */

test("S2R3-01: after stepping aside, a hidden token's way on goes round the tokens standing between it and its drop", async () => {
  combatFlag = false;
  clock.step = 0;
  reserveMod.reset();
  const perfNow = performance.now;
  performance.now = () => Date.now();
  const user = game.user;
  const wasGM = user.isGM;
  Object.defineProperty(user, "isGM", { value: true, configurable: true, writable: true });
  const h = makeToken("s3rH000000000001", 500, 100), f = makeToken("s3rF000000000001", 100, 100);
  // A visible token standing between where H steps aside and where it was dropped (live: Hero 5 at (14,4)).
  const st = makeToken("s3rS000000000001", 300, 100);
  h.document.hidden = true;
  const steps = [];
  h.document.move = async (waypoints, options) => {
    steps.push({ waypoints, options });
    Object.assign(h.document._source, { x: waypoints.at(-1).x, y: waypoints.at(-1).y });
    Object.assign(h.document, { x: waypoints.at(-1).x, y: waypoints.at(-1).y });
    return true;
  };
  const saved = F.canvas.tokens.placeables;
  F.canvas.tokens.placeables = [h, f, st];
  const way = [{ x: 1.5, y: 1.5 }, { x: 9.5, y: 1.5 }];
  try {
    reserveWalk(f.document, "ridS3rF000000001", way, 1);
    const from = F.calls.length;
    assert.equal(dropWith(h, contextsFor([h], -300, 0)), null, "it waits");
    for (let k = 0; k < 40; k++) { tickBy(500); await flush(); }
    assert.equal(steps.length, 1, `it stepped aside once: ${JSON.stringify(api.status().group.last)}`);
    const at = steps[0].waypoints.at(-1);
    const go = sent(from);
    assert.equal(go.length, 1, `then it goes: ${JSON.stringify(api.status().group.last)}`);
    const wps = go[0].options.movement[h.document.id].waypoints;
    // Every leg of its way on keeps its centre a whole token (both radii) from the standing one's centre.
    const sc = { x: 3.5, y: 1.5 };
    const pts = [at, ...wps].map(p => ({ x: (p.x + 50) / 100, y: (p.y + 50) / 100 }));
    const segD = (c, a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy) / L)) : 0;
      return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y);
    };
    for (let k = 1; k < pts.length; k++) {
      assert.ok(segD(sc, pts[k - 1], pts[k]) >= 1 - 0.02, `leg ${k} clear of the standing token: ${JSON.stringify(pts)}`);
    }
  } finally {
    Object.defineProperty(user, "isGM", { value: wasGM, configurable: true, writable: true });
    F.canvas.tokens.placeables = saved;
    for (const t of [h, f, st]) sceneTokens.delete(t.document.id);
    reserveMod.reset();
    tickBy(60000);
    performance.now = perfNow;
  }
});
