// transform-creatures-16 [declared] (W2-K1): with today's pentaryn-importer, which MERGES into
// game.pentaryn (items-journal-1), game.pentaryn.transform survives either load order — the importer's
// ready registered before transform's, and after it (the order that used to lose the namespace).
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const merge = tag => () => { game.pentaryn = Object.assign(game.pentaryn ?? {}, { [tag]: { tag } }); };
Hooks.once("ready", merge("importerBefore"));
await import("../transform.mjs");
await import("../hud.mjs");
Hooks.once("ready", merge("importerAfter"));
F.fire("ready");

test("a merging importer before and after transform's ready: the namespace and starry survive", () => {
  const api = game.modules.get("pentaryn-transform").api;
  assert.equal(game.pentaryn.transform, api);
  assert.deepEqual(Object.keys(game.pentaryn).sort(), ["importerAfter", "importerBefore", "transform"]);
  assert.equal(typeof game.pentaryn.transform.starry.assume, "function");
  assert.deepEqual(F.hookErrors, []);
});
