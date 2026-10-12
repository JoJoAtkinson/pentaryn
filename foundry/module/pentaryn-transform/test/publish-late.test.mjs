// transform-creatures-16 [declared] (guide step 8, W2-K1): api.starry is built into the one frozen
// API, so it no longer depends on hook order, and module.api survives whatever another module does
// to game.pentaryn later. An importer that REPLACED game.pentaryn after transform's ready (the old
// pentaryn-importer) still drops the alias — the importer merges since items-journal-1, and with a
// merging importer the namespace survives either load order.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
await import("../transform.mjs");
await import("../hud.mjs");
Hooks.once("ready", () => { game.pentaryn = Object.freeze({ import: {} }); });   // an old, replacing importer, loaded later
F.fire("ready");

test("[declared] -16 an importer that replaces game.pentaryn later drops the alias; module.api (with starry) survives", () => {
  assert.deepEqual(Object.keys(game.pentaryn), ["import"]);
  assert.equal(game.pentaryn.transform, undefined);
  const api = game.modules.get("pentaryn-transform").api;
  assert.equal(typeof api.shift, "function");
  assert.equal(typeof api.starry.assume, "function", "starry does not depend on hook order");
});

// The merging importer, in both orders: test/publish-merge.test.mjs.
