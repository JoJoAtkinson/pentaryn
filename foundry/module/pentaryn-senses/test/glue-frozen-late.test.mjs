/**
 * Characterisation (senses checkpoint, wave 3), glue case e, second load order: the root is
 * extensible when the first namespace publishes, and becomes FROZEN before the second publishes
 * (another module freezes it in between). The second rebuilds it. Both namespaces end up present.
 * Frozen once committed.
 *
 * [declared S-3], flipped from "root frozen between chain and senses: senses rebuilds it": the
 * entry's ready now publishes senses FIRST and the chain alias second, in the same tick, so the
 * window is between senses and chain. The proxy freezes the root the moment senses lands in it;
 * the chain alias then rebuilds it.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const target = { importer: { name: "importer" } };
// freezes itself the moment senses lands in it
const root = new Proxy(target, { set(t, k, v) { t[k] = v; if (k === "senses") Object.freeze(t); return true; } });
await boot({ beforeImport: F => { F.game.pentaryn = root; } });
await settle(mock);

test("root frozen between senses and chain: the chain alias rebuilds it; both present", () => {
  assert.equal(Object.isFrozen(target), true);
  assert.notEqual(game.pentaryn, root);
  assert.deepEqual(Object.keys(game.pentaryn), ["importer", "senses", "chain"]);
  assert.equal(game.pentaryn.senses, target.senses);
  assert.equal(typeof game.pentaryn.chain.link, "function");
  assert.equal(typeof game.pentaryn.senses.resetSight, "function");
});
