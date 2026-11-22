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
