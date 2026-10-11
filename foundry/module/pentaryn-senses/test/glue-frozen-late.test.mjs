/**
 * Characterisation (senses checkpoint, wave 3), glue case e, second load order: a FROZEN root.
 *
 * [declared J10 (kit 1.0.2), -34], flipped from "root frozen between senses and chain: the chain
 * alias rebuilds it": nothing freezes `game.pentaryn` any more, so the rebuild is gone. A root that
 * is frozen anyway makes the publish throw: Foundry's hook guard logs the TypeError, nothing is
 * published, and the GM chain after the publish does not run.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, since, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const root = Object.freeze({ importer: { name: "importer" } });
const F = await boot({ beforeImport: F => { F.game.pentaryn = root; }, ready: false });

test("frozen root: ready throws a TypeError (logged by Foundry), publishes nothing, writes nothing", async () => {
  const mark = F.calls.length;
  F.fire("ready");
  await settle(mock);
  assert.equal(game.pentaryn, root);
  assert.deepEqual(Object.keys(game.pentaryn), ["importer"]);
  assert.deepEqual(F.hookErrors.map(e => [e.hook, e.error.constructor.name]), [["ready", "TypeError"]]);
  assert.deepEqual(since(mark).filter(c => c.op !== "settings.get"), []);
});
