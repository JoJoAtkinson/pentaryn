// Publishing into an existing, extensible game.pentaryn (the live shape since the importer merges
// into it, items-journal-1): riders is added in place, other namespaces are kept. The frozen-root
// case (W2-K1) is in publish-frozen.test.mjs; no root at all is glue.test's case.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");

test("an extensible root gains riders in place; its other namespaces stay", () => {
  const root = { importer: { ok: true } };
  F.game.pentaryn = root;
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  assert.equal(F.game.pentaryn, root, "same object");
  assert.deepEqual(root.importer, { ok: true });
  assert.equal(typeof root.riders.report, "function");
});

