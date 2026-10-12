// KNOWN (transform-creatures-16): transform publishes synchronously at ready and depends on running
// AFTER pentaryn-importer's ready. If the importer's freeze runs later (its ready registered after
// transform's), the importer's fresh frozen root replaces game.pentaryn and the namespace is gone.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
await import("../transform.mjs");
await import("../hud.mjs");
Hooks.once("ready", () => { game.pentaryn = Object.freeze({ import: {} }); });   // importer, loaded later
F.fire("ready");

test("KNOWN -16: an importer ready registered after transform's drops game.pentaryn.transform", () => {
  assert.deepEqual(Object.keys(game.pentaryn), ["import"]);
  assert.equal(game.pentaryn.transform, undefined);
});

test("the namespace survives either load order (publishNamespace, guide step 8 / W2-K1)", { todo: "transform-creatures-16: [declared] in step 8" }, () => {
  assert.ok(game.pentaryn.transform);
});
