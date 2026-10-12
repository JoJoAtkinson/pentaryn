// Publishing beside pentaryn-importer, which replaces game.pentaryn with a FROZEN object in its own
// ready hook: combat defers a tick and then replaces the root with a copy plus `combat` (the
// frozen-root guard copy W2-K1 retires with publishNamespace, [declared] in S7).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const { F } = await setupWorld();
await import("../combat.mjs");

test("a frozen root is replaced by a copy carrying combat; the other members are kept", async () => {
  F.fire("init");
  F.fire("setup");
  F.fire("ready");
  const importer = { version: "x" };
  const frozen = Object.freeze({ importer });
  F.game.pentaryn = frozen;          // importer's ready ran after ours, before the tick
  mock.timers.tick(0);
  await drain();
  assert.notEqual(F.game.pentaryn, frozen);
  assert.equal(Object.isFrozen(F.game.pentaryn), false);
  assert.equal(F.game.pentaryn.importer, importer);
  assert.deepEqual(Object.keys(F.game.pentaryn), ["importer", "combat"]);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(frozen.combat, undefined);
});
