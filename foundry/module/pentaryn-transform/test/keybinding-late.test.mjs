// The keybinding is registered at init. Registering after the binding map is built throws in
// Foundry (ClientKeybindings#register); hud.mjs catches it and warns, and loading goes on.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
await import("../transform.mjs");
await import("../hud.mjs");
F.fire("setup");                                         // the binding map exists now
F.console.length = 0;
F.fire("init");

test("a late registration warns with the fixed text and registers nothing", () => {
  assert.deepEqual(F.console.map(c => c.slice(0, 2)), [["warn", "pentaryn-transform | Escape-cancels-target-picker keybinding not registered"]]);
  assert.equal(F.console[0][2].message, "You cannot register a Keybinding after the init hook");
  assert.equal(game.keybindings.actions.size, 0);
  assert.deepEqual(F.hookErrors, []);
});
