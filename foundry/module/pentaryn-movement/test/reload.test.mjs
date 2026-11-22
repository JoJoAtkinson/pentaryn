// Live R3-1: a reload mid-move dropped a group's later waves (they live in this client's timers), and a
// member of a later wave never moved. The waves the dying tab had not sent are in its sessionStorage;
// the next `ready` sends them, spaced as planned (the first unsent one at once when overdue), with the
// usual checks: the member has not moved since the drop. Another user's, another world's or a stale
// record is dropped unsent.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, SCENE, PLAYER } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
const F = await movementWorld();
const KEY = "pentaryn-movement.pendingWaves";

const store = new Map();
globalThis.sessionStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};

const tokens = new Map();
const scene = {
  id: SCENE, tokens,
  async updateEmbeddedDocuments(type, updates, options) {
    F.calls.push({ op: "scene.update", type, ids: updates.map(u => u._id), options });
    return updates;
  },
};
const doc = (id, x, y) => {
  const d = { documentName: "Token", id, _source: { x, y, elevation: 0, width: 1, height: 1 }, x, y, movementAction: "walk", parent: scene };
  tokens.set(id, d);
  return d;
};
doc("memB000000000001", 700, 700);
doc("memC000000000001", 800, 700);
doc("memD000000000001", 900, 700);
const realGet = game.scenes.get.bind(game.scenes);
game.scenes.get = id => (id === SCENE ? scene : realGet(id));

const route = (x, y) => ({ waypoints: [{ x, y, elevation: 0, width: 1, height: 1, action: "walk", snapped: false, explicit: true, checkpoint: true }], planned: false });
const now = Date.now();
const base = { constrainOptions: {}, terrainOptions: {}, measureOptions: {}, method: "dragging" };
store.set(KEY, JSON.stringify([
  { // ours: two waves left, 1 s after the drop (the first was due at 600 ms)
    gid: "g1", world: game.world.id, user: PLAYER, sceneId: SCENE, t0: now - 1000, endMs: 4000, base,
    ids: ["memA000000000001", "memB000000000001", "memC000000000001", "memD000000000001"],
    starts: { memB000000000001: { x: 700, y: 700 }, memC000000000001: { x: 800, y: 700 }, memD000000000001: { x: 1, y: 1 } },
    waves: [
      { at: 600, ids: ["memB000000000001"], updates: [{ _id: "memB000000000001" }], movement: { memB000000000001: route(2200, 1200) } },
      { at: 900, ids: ["memC000000000001", "memD000000000001"], updates: [{ _id: "memC000000000001" }, { _id: "memD000000000001" }],
        movement: { memC000000000001: route(2300, 1200), memD000000000001: route(2400, 1200) } },
    ],
  },
  { gid: "g2", world: game.world.id, user: "someoneElse00001", sceneId: SCENE, t0: now - 1000, base, ids: [], starts: { memB000000000001: { x: 700, y: 700 } },
    waves: [{ at: 600, ids: ["memB000000000001"], updates: [{ _id: "memB000000000001" }], movement: { memB000000000001: route(1, 1) } }] },
  { gid: "g3", world: game.world.id, user: PLAYER, sceneId: SCENE, t0: now - 120000, base, ids: [], starts: { memB000000000001: { x: 700, y: 700 } },
    waves: [{ at: 600, ids: ["memB000000000001"], updates: [{ _id: "memB000000000001" }], movement: { memB000000000001: route(2, 2) } }] },
]));

await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const sent = () => F.calls.filter(c => c.op === "scene.update");

test("R3-1: after a reload the unsent waves go out, spaced as planned, and only ours", async () => {
  mock.timers.tick(0);
  assert.deepEqual(sent().map(c => c.ids), [["memB000000000001"]], "the overdue wave at once");
  assert.deepEqual(sent()[0].options.movement.memB000000000001.waypoints.map(w => [w.x, w.y]), [[2200, 1200]]);
  assert.equal(sent()[0].options.method, "dragging");
  mock.timers.tick(299);
  assert.equal(sent().length, 1, "the next keeps its 300 ms spacing");
  mock.timers.tick(1);
  assert.deepEqual(sent().map(c => c.ids), [["memB000000000001"], ["memC000000000001"]], "a member moved since the drop (D) is left out");
  mock.timers.tick(10000);
  assert.equal(sent().length, 2, "another user's or a stale record is never sent");
  await new Promise(r => setImmediate(r));          // a wave leaves the record once the server answered (R5-2)
  assert.equal(store.has(KEY), false, "nothing left to resume");
  assert.equal(game.pentaryn.movement.status().group.resumed.groups, 1);
});
