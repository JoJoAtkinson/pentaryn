// FR2-09: in a fight only the client that started a move sends each next square, so a reload mid-walk left the token
// on the square it had reached. Every client records the squares its fight walks have still to go (sessionStorage);
// after a reload the walk goes on from the square it rests on, costed. 0.8.2: never in another turn. A turn
// change stops a walk and charges what follows to the new turn, so a walk recorded in one turn and resumed after the
// reload in the next charged the new turn for the old one's move (Fable's §3: "the move finishes under the rules it
// started with").
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { movementWorld, SCENE, PLAYER } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.now() });
const F = await movementWorld();
const KEY = "pentaryn-movement.fightWalks";

const store = new Map();
globalThis.sessionStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: k => { store.delete(k); },
};

const fight = { id: "combat0000000001", round: 2, turn: 1 };
const tokens = new Map();
const moves = [];
const scene = { id: SCENE, tokens, grid: { size: 100, type: 1 } };
const doc = id => {
  const d = {
    documentName: "Token", id, name: id, parent: scene, isOwner: true, hidden: false, movementAction: "walk",
    _source: { x: 100, y: 0, elevation: 0, width: 1, height: 1 },
    movement: { state: "completed", user: { isSelf: true } },
    combatant: { combat: fight },
    _shouldRecordMovementHistory: () => true,
    move(waypoints, options) { moves.push({ id, waypoints, options }); return Promise.resolve(true); },
  };
  d.object = { document: d, destroyed: false };
  tokens.set(id, d);
  return d;
};
doc("frSame0000000001");
doc("frTurn0000000001");
const realGet = game.scenes.get.bind(game.scenes);
game.scenes.get = id => (id === SCENE ? scene : realGet(id));
Object.assign(F.canvas, { ready: true, scene, grid: { size: 100, type: 1 } });
F.canvas.tokens.placeables = [];

const route = [{ x: 100, y: 0, checkpoint: true }, { x: 200, y: 0, checkpoint: true }, { x: 300, y: 0, checkpoint: true }];
const rec = turn => ({ t: Date.now() - 2000, scene: SCENE, world: game.world.id, user: PLAYER, turn, route });
store.set(KEY, JSON.stringify({
  frSame0000000001: rec("combat0000000001:2:1"),     // the same turn: it walks on
  frTurn0000000001: rec("combat0000000001:2:0"),     // recorded on the turn before: it stays
}));

await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

test("FR2-09: after a reload a fight walk goes on from the square it rests on, in the turn it was recorded in only", () => {
  mock.timers.tick(0);
  assert.deepEqual(moves.map(m => m.id), ["frSame0000000001"], JSON.stringify(game.pentaryn.movement.status().group.fightResumed));
  assert.deepEqual(moves[0].waypoints.map(w => [w.x, w.y]), [[200, 0], [300, 0]], "the squares still to walk");
  assert.ok(moves[0].waypoints.every(w => w.checkpoint), "every square a checkpoint (Joe's decision 1)");
  const why = game.pentaryn.movement.status().group.fightResumed.why;
  assert.equal(why.frSame0000000001, "walks on");
  assert.match(why.frTurn0000000001, /^turn changed/, "a turn change since the record: nothing charged to the new turn");
  assert.equal(store.has(KEY), false, "the records are used once");
});
