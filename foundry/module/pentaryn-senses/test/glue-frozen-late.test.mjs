/**
 * Characterisation (senses checkpoint, wave 3), glue case e, second load order: the root is
 * extensible when chain publishes, and becomes FROZEN before senses publishes (another module
 * freezes it in between). Senses rebuilds it. Both namespaces end up present. Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const target = { importer: { name: "importer" } };
// freezes itself the moment chain lands in it
const root = new Proxy(target, { set(t, k, v) { t[k] = v; if (k === "chain") Object.freeze(t); return true; } });
await boot({ beforeImport: F => { F.game.pentaryn = root; } });
await settle(mock);

test("root frozen between chain and senses: senses rebuilds it; both present", () => {
  assert.equal(Object.isFrozen(target), true);
  assert.notEqual(game.pentaryn, root);
  assert.deepEqual(Object.keys(game.pentaryn), ["importer", "chain", "senses"]);
  assert.equal(game.pentaryn.chain, target.chain);
  assert.equal(typeof game.pentaryn.senses.resetSight, "function");
});
