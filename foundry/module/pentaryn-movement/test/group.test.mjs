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
import { movementWorld, drop, clicks, SCENE } from "./fixtures/world.mjs";
import { MOTION } from "../motion-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-movement";
const S = 100;
const F = await movementWorld();

// A clock only the tests move (the planner's budget reads performance.now).
const clock = { t: 0, step: 0 };
Object.defineProperty(globalThis, "performance", { value: { now: () => (clock.t += clock.step) }, configurable: true, writable: true });

/** Segment intersection (proper crossing), the wall test. */
function hit(p, q, a, b) {
  const d = (u, v, w) => (v.x - u.x) * (w.y - u.y) - (v.y - u.y) * (w.x - u.x);
  const d1 = d(a, b, p), d2 = d(a, b, q), d3 = d(p, q, a), d4 = d(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    const t = d3 / (d3 - d4);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
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
const sceneDoc = { id: SCENE, grid, regions: [], tokens: sceneTokens, updateEmbeddedDocuments: (...a) => viewedScene.updateEmbeddedDocuments(...a) };
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
  mock.timers.tick(5000);
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
    mock.timers.tick(5000);
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

test("a stopped group sends no later wave (the initiator stops one member: all stop)", () => {
  combatFlag = false;
  const ts = [makeToken("stpA000000000001", 400, 200), makeToken("stpB000000000001", 300, 200), makeToken("stpC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = out[0].map(u => u._id);
  const moving = sceneTokens.get(first[0]).object;
  moving.animationContexts.set(moving.movementAnimationName, {});
  clock.t += MOTION.armMs;                             // armed: the move has run 400 ms
  const from = F.calls.length;
  moving._onClickLeft({});
  mock.timers.tick(5000);
  assert.equal(sent(from).length, 0, "no later wave went out");
  const moves = F.calls.slice(from).filter(c => c.op === "move");
  assert.ok(moves.some(m => m.id === moving.document.id), "the clicked member is displaced");
  assert.equal(clicks.at(-1).token, moving, "then core's click runs (select)");
  moving.animationContexts.clear();
});

test("a wave whose member has moved meanwhile is dropped for that member", () => {
  const ts = [makeToken("mvdA000000000001", 400, 200), makeToken("mvdB000000000001", 300, 200), makeToken("mvdC000000000001", 500, 200)];
  const out = dropWith(ts[0], contextsFor(ts, 0, 400));
  const first = new Set(out[0].map(u => u._id));
  const waiting = ts.filter(t => !first.has(t.document.id));
  assert.ok(waiting.length > 0);
  for (const t of waiting) t.document._source = { ...t.document._source, x: t.document._source.x + 100 };
  const from = F.calls.length;
  mock.timers.tick(5000);
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
  mock.timers.tick(5000);
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

test("click to stop out of combat: displaced where drawn (animate false), then core's click", () => {
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
  assert.equal(F.calls.slice(n).filter(c => c.op === "stopAnimation" && c.id === t.document.id).length, 1, "only the R2-9 resync's own second check, 250 ms on");
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
  mock.timers.tick(5000);
  const later = sent(from);
  const moves = { ...out[1].movement, ...Object.assign({}, ...later.map(c => c.options.movement)) };
  assert.deepEqual(moves.shwA000000000001.waypoints.map(w => [w.x, w.y]), [[420, 300], [400, 600]]);
});

test("a click on any member stops the whole group after its last wave went out, and in a one-wave group", () => {
  combatFlag = false;
  clock.step = 0;
  const ts = [makeToken("hldA000000000001", 400, 200), makeToken("hldB000000000001", 300, 200), makeToken("hldC000000000001", 500, 200)];
  dropWith(ts[0], contextsFor(ts, 0, 400));
  mock.timers.tick(1200);                              // every wave is out; they are still walking
  clock.t += 1200;
  for (const t of ts) t.animationContexts.set(t.movementAnimationName, {});
  let from = F.calls.length;
  ts[1]._onClickLeft({});
  let moved = F.calls.slice(from).filter(c => c.op === "move").map(c => c.id).sort();
  assert.deepEqual(moved, ts.map(t => t.document.id).sort(), "every member is stopped where drawn");
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
  mock.timers.tick(60000);
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
  try { mock.timers.tick(5000); } finally { F.canvas.scene = viewed; }
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
  mock.timers.tick(5000);
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

test("a click within 400 ms of a drop is core's click (habit click, double click); after that it stops the group", () => {
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
  assert.deepEqual(moved, ts.map(t => t.document.id).sort(), "armed: the whole group stops where drawn");
  for (const t of ts) t.animationContexts.clear();
  mock.timers.tick(60000);
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
    assert.deepEqual(moves.map(m => [m.id, m.waypoints[0].x, m.waypoints[0].y, m.waypoints[0].action]), [["brdA000000000001", 320, 100, "displace"]]);
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
    mock.timers.tick(1000);
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
  clock.step = 50;                                      // every clock read costs 50 ms: the 300 ms budget runs out
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
  mock.timers.tick(60000);
});
