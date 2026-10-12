// Publish beside pentaryn-importer. [declared] W2-K1 (kit 1.0.2, J10): transform publishes through
// publishNamespace, synchronously at ready, into the plain game.pentaryn every module assigns into
// (the importer merges since items-journal-1). The old frozen-root guard (rebuild a frozen root) is
// gone: a frozen root now refuses the alias with a TypeError, which Foundry's hook runner reports;
// module.api, the canonical handle, is still set — with starry built in.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { setup } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const F = await setup();
const importerApi = { importer: true };
const frozen = Object.freeze({ import: importerApi });
game.pentaryn = frozen;
await import("../transform.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("ready");

test("[declared] W2-K1 a frozen root: never replaced, the alias refused (TypeError), module.api set with starry", () => {
  assert.equal(game.pentaryn, frozen, "never replaced");
  assert.deepEqual(Object.keys(game.pentaryn), ["import"]);
  const api = game.modules.get("pentaryn-transform").api;
  assert.equal(typeof api?.shift, "function", "module.api is canonical");
  assert.deepEqual(Object.keys(api.starry), ["assume", "end", "active", "constellation"]);
  assert.ok(F.hookErrors.some(e => e.hook === "ready" && /not extensible|read.only|Cannot add property/i.test(String(e.error?.message ?? e.error ?? e))),
    JSON.stringify(F.hookErrors.map(e => ({ hook: e.hook, msg: String(e.error?.message ?? e) }))));
});
