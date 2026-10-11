/**
 * A HOT import of the entry into a running client (`game.ready` already true) — the dev path.
 *
 * [declared S-4, dev-only], flipped from the checkpoint's "hot import: previous copies uninstalled;
 * chain published now; light republished into the old senses": chain and light no longer keep
 * `globalThis.__pentaryn*` sentinels or republish themselves. Re-wiring goes through the entry:
 * `game.pentaryn.senses.uninstall()`, then re-import the entry. Because the lifecycle hooks have
 * already fired, the entry runs init and ready at once: the setting is registered, a NEW senses
 * object is published (with the chain alias), and chain queues a repaint. The sentinels a previous
 * copy left are ignored.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, NOW, MODULE } from "./fixtures/world.mjs";

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

test("hot import: the entry runs init and ready now; a new senses and the chain alias are published", () => {
  assert.deepEqual(uninstalled, [], "the old sentinels are not called");
  assert.notEqual(game.pentaryn.senses, oldSenses, "senses is republished, not patched");
  assert.equal(game.pentaryn.senses.syncLight.name, "syncLight");
  assert.equal(game.pentaryn.senses.setupLight.name, "setup");
  assert.equal(typeof game.pentaryn.chain.link, "function");
  assert.ok(F.game.settings.settings.has(`${MODULE}.sightReset`), "init ran: the setting is registered");
  assert.equal(F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"]?.label, "PENTARYN_SENSES.Glow.Label", "the glow is registered now");
  assert.equal(F.frames.pending(), 1, "chain queued a repaint");
  assert.equal(F.listeners("ready"), 0, "no lifecycle listener waits");
  assert.equal(F.listeners("init"), 0);
});
