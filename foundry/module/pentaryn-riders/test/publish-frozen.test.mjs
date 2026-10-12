// W2-K1 [declared] (wave-2 report; wave-3 report "What wave 4 starts with" item 4): riders carried
// the old frozen-root guard (a frozen game.pentaryn was REPLACED by a spread copy plus riders).
// Nothing freezes the root live any more; the guide's S6 publish step replaced the guard with the
// kit's publishNamespace, synchronous at ready, and with kit 1.0.2 a frozen root throws a TypeError.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");

test("W2-K1 [declared]: publishNamespace leaves a frozen root alone and the publish throws a TypeError", () => {
  const root = Object.freeze({ importer: { ok: true } });
  F.game.pentaryn = root;
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  assert.equal(F.game.pentaryn, root);
  assert.deepEqual(Object.keys(F.game.pentaryn), ["importer"]);
  assert.deepEqual(F.hookErrors.map(e => [e.hook, e.error?.constructor?.name]), [["ready", "TypeError"]]);
});
