// Glue case (i): publish under the three game.pentaryn load orders (guide step 1.5). Each case is a
// fresh Foundry stub and a fresh copy of the entry (a query-string import), fired init → ready →
// one tick. Checked only after the tick, so the declared step-6 change (publish synchronously at
// ready, C-1) still passes; the API's legacy keys are a floor, not an exact list.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { cursorWorld, flush } from "./fixtures/board.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

let seq = 0;
async function boot(pentaryn) {
  const F = await cursorWorld({ pentaryn });
  await import(`../cursors.mjs?order=${++seq}`);
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  await flush();
  return F;
}
const legacyFloor = api => {
  for (const k of ["refresh", "current", "keys", "keyFor"]) assert.ok(k in api, k);
  assert.equal(typeof api.refresh, "function");
};

test("game.pentaryn absent → created, holding cursors", async () => {
  const F = await boot(undefined);
  assert.ok(game.pentaryn && typeof game.pentaryn === "object");
  legacyFloor(game.pentaryn.cursors);
  assert.deepEqual(Object.keys(game.pentaryn), ["cursors"]);
  F.restore();
});

test("extensible {x:1} → the same object gains cursors", async () => {
  const root = { x: 1 };
  const F = await boot(root);
  assert.equal(game.pentaryn, root);
  assert.equal(root.x, 1);
  legacyFloor(root.cursors);
  assert.deepEqual(Object.keys(root), ["x", "cursors"]);
  F.restore();
});

test("frozen {x:1} → a NEW object with x and cursors; the old one untouched", async () => {
  const root = Object.freeze({ x: 1 });
  const F = await boot(root);
  assert.notEqual(game.pentaryn, root);
  assert.equal(game.pentaryn.x, 1);
  legacyFloor(game.pentaryn.cursors);
  assert.deepEqual(Object.keys(game.pentaryn), ["x", "cursors"]);
  assert.deepEqual(Object.keys(root), ["x"]);
  assert.ok(Object.isFrozen(root));
  // the published refresh drives this boot's board
  F.setTool("tokens", "target");
  assert.equal(game.pentaryn.cursors.refresh(), "target");
  assert.equal(F.el.dataset.pentarynCursor, "target");
  F.restore();
});
