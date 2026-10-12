// Publish beside pentaryn-importer, which creates and FREEZES game.pentaryn (W2-K1, -16). Today's
// guard (transform.mjs:806-814) rebuilds a frozen root; starry.mjs's later ready extends the
// rebuilt namespace. Also: an extensible root gains `transform` in place.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const importerApi = { importer: true };
game.pentaryn = Object.freeze({ import: importerApi });
await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");

test("a frozen root is rebuilt: importer's entry kept, transform added, starry still present", () => {
  assert.equal(Object.isFrozen(game.pentaryn), false, "rebuilt, not frozen again");
  assert.equal(game.pentaryn.import, importerApi);
  assert.deepEqual(Object.keys(game.pentaryn), ["import", "transform"]);
  assert.deepEqual(Object.keys(game.pentaryn.transform),
    ["shift", "revert", "forms", "wildShapeActivity", "original", "isRevertItem", "sweepSpentForms", "starry"]);
  assert.deepEqual(Object.keys(game.pentaryn.transform.starry), ["assume", "end", "active", "constellation"]);
});
