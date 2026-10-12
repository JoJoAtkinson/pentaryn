// Guide S6: both entries are wiring only. Every feature exports install/uninstall, every
// registration goes through the shared registry (labelled), and uninstall leaves nothing behind:
// no hook, no document listener, no observer, no patch.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { setupWorld } from "./fixtures/world.mjs";

// No real timers: onReady's deferred weapon-set seed (DELAYS.seedAfterReady) stays parked unless ticked.
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const { ctx, reg } = await import("../context.mjs");

const FEATURES = [
  "roll-dock.mjs", "counting.mjs", "turn-riders.mjs", "offhand.mjs", "sequence.mjs", "patches.mjs",
  ...readdirSync(new URL("../turnflow/", import.meta.url)).map(f => `turnflow/${f}`),
  "hud/tooltips.mjs", "hud/picker.mjs", "hud/bars.mjs",
];

test("every feature file exports install and uninstall", async () => {
  for (const f of FEATURES) {
    const m = await import(`../${f}`);
    assert.equal(typeof m.install, "function", `${f} install`);
    assert.equal(typeof m.uninstall, "function", `${f} uninstall`);
  }
});

test("every live module hook is a registry record with a label", () => {
  const ids = reg.ids();
  assert.ok(ids.length > 60, String(ids.length));
  for (const r of ids) assert.ok(r.label && typeof r.label === "string", JSON.stringify(r));
  const live = Object.values(F.listeners()).reduce((a, b) => a + b, 0);
  assert.equal(live, ids.filter(r => r.kind === "on").length, "nothing registered outside the registry");
});

test("ctx.expose: the runner's running() reaches the API side", () => {
  assert.equal(typeof ctx.exposed.running, "function");
  assert.equal(ctx.exposed.running(), null);
});

test("uninstall: no hook, no document listener, the observer disconnected", () => {
  const liveDocListeners = () => doc.listeners.length;
  assert.ok(liveDocListeners() >= 6);
  ctx.uninstall();
  assert.deepEqual(reg.ids(), []);
  assert.equal(Object.values(F.listeners()).reduce((a, b) => a + b, 0), 0);
  assert.equal(liveDocListeners(), 0);
  assert.equal(doc.observers.length, 1);
  assert.equal(doc.observers[0].disconnected, true, "the picker-cue observer is disconnected");
});
