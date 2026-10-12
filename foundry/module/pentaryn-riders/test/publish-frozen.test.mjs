// KNOWN W2-K1 (wave-2 report; wave-3 report "What wave 4 starts with" item 4): riders carries the
// old frozen-root guard. When game.pentaryn is frozen at publish time, riders REPLACES the root with
// a spread copy plus riders. Nothing freezes the root live any more (dead code). The guide's S6
// publish step replaces the guard with the kit's publishNamespace as a [declared] commit; with kit
// 1.0.2 a frozen root then throws a TypeError, and that commit flips this pin.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");

test("KNOWN W2-K1: a frozen root is replaced by a copy that also carries riders", () => {
  const root = Object.freeze({ importer: { ok: true } });
  F.game.pentaryn = root;
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  assert.notEqual(F.game.pentaryn, root);
  assert.deepEqual(Object.keys(F.game.pentaryn), ["importer", "riders"]);
  assert.equal(F.game.pentaryn.importer, root.importer);
  assert.equal(Object.isFrozen(F.game.pentaryn), false);
  assert.deepEqual(W.lines, []);
});

test.todo("W2-K1 after S6 [declared]: publishNamespace leaves a frozen root alone and the publish throws a TypeError");
