/**
 * Characterisation (senses checkpoint, wave 3): a HOT import into a running client (`game.ready`
 * already true) — the dev path the plan's step 5 retires ([declared, dev-only] S-4). Chain and light
 * uninstall the previous copy through their `globalThis.__pentaryn*` sentinels; chain publishes at
 * once and queues a repaint; light republishes onto the existing `game.pentaryn.senses`; senses' own
 * `once ready` never fires, so the rest of that namespace is the OLD object's. Frozen once committed.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const uninstalled = [];
const oldSenses = { syncLight: function oldSync() {}, light: { old: true }, setupLight: function oldSetup() {} };
const F = await boot({
  init: false, ready: false,
  beforeImport: F => {
    F.game.ready = true;
    F.game.pentaryn = { senses: oldSenses };
    globalThis.__pentarynChain = { uninstall: () => uninstalled.push("chain") };
    globalThis.__pentarynLight = { uninstall: () => uninstalled.push("light") };
  },
});

test("hot import: previous copies uninstalled; chain published now; light republished into the old senses", () => {
  assert.deepEqual(uninstalled, ["chain", "light"]);
  assert.deepEqual(Object.keys(game.pentaryn.chain), ["link", "break", "links", "repaint", "uninstall"]);
  assert.equal(globalThis.__pentarynChain, game.pentaryn.chain);
  assert.equal(game.pentaryn.senses, oldSenses, "senses keeps the old object");
  assert.equal(game.pentaryn.senses.light, globalThis.__pentarynLight);
  assert.equal(game.pentaryn.senses.setupLight.name, "setup");
  assert.equal(game.pentaryn.senses.syncLight.name, "oldSync", "the carried path is not republished");
  assert.equal(F.frames.pending(), 1, "chain queued a repaint");
  assert.equal(F.listeners("ready"), 1, "only senses' own ready is waiting (chain did not add one)");
});
