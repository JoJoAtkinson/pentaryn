// Publishing beside pentaryn-importer. W2-K1 [declared] (kit 1.0.2, J10): combat publishes through
// publishNamespace, synchronously at ready, into the plain game.pentaryn every module assigns into.
// The old frozen-root guard (replace a frozen root with a copy, one tick later) is gone: a frozen
// root now refuses the alias with a TypeError, which Foundry's hook runner reports; module.api, the
// canonical handle, is still set.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const { F } = await setupWorld();
await import("../combat.mjs");

test("a frozen root at ready: module.api is set, the alias is refused (TypeError), the root is left as it is", async () => {
  F.fire("init");
  F.fire("setup");
  const importer = { version: "x" };
  const frozen = Object.freeze({ importer });
  F.game.pentaryn = frozen;
  F.fire("ready");
  mock.timers.tick(0);
  await drain();
  assert.equal(F.game.pentaryn, frozen, "never replaced");
  assert.equal(frozen.combat, undefined);
  assert.equal(typeof F.game.modules.get("pentaryn-combat").api?.plan, "function", "module.api is canonical");
  assert.ok(F.hookErrors.some(e => e.hook === "ready" && /object is not extensible|read.only|Cannot add property/i.test(String(e.error?.message ?? e.error ?? e))), JSON.stringify(F.hookErrors.map(e => ({ hook: e.hook, msg: String(e.error?.message ?? e) }))));
});
