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

// [declared] kit 1.0.2 (J10), flipped from "frozen {x:1} → a NEW object with x and cursors; the old one
// untouched": nothing freezes game.pentaryn since the importer's keystone (c0c3f97), so the kit's
// frozen-root guard is gone and a frozen root is refused — ready's publish throws, Foundry's Hooks
// reports it, and the root is left exactly as it was.
test("frozen {x:1} → refused: the root is left as it was and the throw is reported by Hooks", async () => {
  const root = Object.freeze({ x: 1 });
  const { warn, error } = console;
  const lines = [];
  console.warn = (...a) => lines.push(["warn", String(a[0])]);
  console.error = (...a) => lines.push(["error", a[0] instanceof Error ? a[0].message : String(a[0])]);
  let F;
  try {
    F = await boot(root);
  } finally {
    console.warn = warn;
    console.error = error;
  }
  assert.equal(game.pentaryn, root);
  assert.deepEqual(Object.keys(root), ["x"]);
  assert.ok(Object.isFrozen(root));
  assert.equal(F.hookErrors.length, 1);
  assert.equal(F.hookErrors[0].hook, "ready");
  assert.match(F.hookErrors[0].error.message, /object is not extensible/);
  assert.equal(lines.length, 2, "one warn and one error line, as Foundry's Hooks.#call logs");
  F.restore();
});
