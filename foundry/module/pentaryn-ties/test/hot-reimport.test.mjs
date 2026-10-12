/**
 * The entry's hot re-import (after `game.pentaryn.ties.uninstall()`, world already ready): the look
 * menu's canvas double-click comes back at once, not at the next scene change, and the socket
 * listeners from the first load are reused, not registered a second time. Review finding on the
 * wave-3 hot branch.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

let socketOns = 0;
const F = await bootWorld({
  actors: [{ id: "zzPc000000000001", name: "ZZ Caven", type: "character" }],
  before: F => {
    F.game.socket.on = () => void socketOns++;
  },
});
// the fixture's document records listeners but its removeEventListener is a no-op; make it real here
document.removeEventListener = function (type, fn, capture) {
  const i = this.listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === (capture === true));
  if (i >= 0) this.listeners.splice(i, 1);
};
const view = () => canvas.app.view;

test("cold boot: one canvas double-click listener (at canvasReady), the two socket listeners", () => {
  F.fire("canvasReady");
  assert.equal(view().listeners.dblclick?.length, 1);
  assert.equal(socketOns, 2);
});

test("uninstall, then a hot re-import: the double-click is back once, the sockets are not re-registered", async () => {
  game.pentaryn.ties.uninstall();
  assert.deepEqual(view().listeners.dblclick ?? [], []);
  assert.equal(view().dataset.ptLook, undefined);
  assert.equal(game.ready, true);
  await import("../pentaryn-ties.mjs?hot=1");
  for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
  assert.equal(view().listeners.dblclick?.length, 1);
  assert.equal(view().dataset.ptLook, "1");
  assert.equal(socketOns, 2, "the first load's socket listeners are reused");
  assert.equal(typeof game.pentaryn.ties.describe, "function");
  F.fire("canvasReady");
  assert.equal(view().listeners.dblclick.length, 1, "a later canvasReady does not wire it twice");
});
