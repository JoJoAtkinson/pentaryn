/**
 * Characterisation (senses checkpoint, wave 3), glue case e, first load order: what `ready` does
 * with the `game.pentaryn` root another module left.
 *
 * [declared J10 (kit 1.0.2), -34], flipped from "frozen root before ready: senses rebuilds it; both
 * namespaces present; importer kept": the importer merges into an extensible root since its keystone
 * (items-journal-1, c0c3f97), so the hand-written frozen-root guards are gone. The root the importer
 * leaves is assigned into, never rebuilt (this file); a frozen root now throws in ready and nothing
 * is published (glue-frozen-late.test.mjs).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const importer = { name: "importer" };
const root = { importer };
await boot({ beforeImport: F => { F.game.pentaryn = root; } });
await settle(mock);

test("extensible root before ready: the same root gains senses, then chain; importer kept", () => {
  assert.equal(game.pentaryn, root, "assigned into, never rebuilt");
  assert.deepEqual(Object.keys(game.pentaryn), ["importer", "senses", "chain"]);
  assert.equal(game.pentaryn.importer, importer);
  assert.equal(typeof game.pentaryn.chain.link, "function");
  assert.equal(typeof game.pentaryn.senses.syncLight, "function");
});
