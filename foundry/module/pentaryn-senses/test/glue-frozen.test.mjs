/**
 * Characterisation (senses checkpoint, wave 3), glue case e, first load order: `game.pentaryn` is
 * already a FROZEN object before ready (pentaryn-importer freezes it). Senses publishes first and
 * rebuilds the root; the chain alias then assigns into the rebuilt (extensible) root. Both
 * namespaces end up present and the other module's entry survives. Frozen once committed.
 * [declared S-3]: the chain alias is published by the entry's ready AFTER senses (was: before, by
 * chain's own ready listener), so the key order is importer, senses, chain.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const importer = { name: "importer" };
const root = Object.freeze({ importer });
await boot({ beforeImport: F => { F.game.pentaryn = root; } });
await settle(mock);

test("frozen root before ready: senses rebuilds it; both namespaces present; importer kept", () => {
  assert.notEqual(game.pentaryn, root);
  assert.deepEqual(Object.keys(game.pentaryn), ["importer", "senses", "chain"]);
  assert.equal(game.pentaryn.importer, importer);
  assert.equal(Object.isExtensible(game.pentaryn), true);
  assert.equal(typeof game.pentaryn.chain.link, "function");
  assert.equal(typeof game.pentaryn.senses.syncLight, "function");
});
