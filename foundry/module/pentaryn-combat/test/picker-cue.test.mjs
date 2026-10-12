// combat-riders-35 [declared D-c4]: the picker cue's pointer listeners and observer exist only while
// skipPickerGuide is on. Default on: as before (hooks.test's document-listener pin holds).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { MODULE, setupWorld } from "./fixtures/world.mjs";

// No real timers: onReady's deferred weapon-set seed (DELAYS.seedAfterReady) stays parked unless ticked.
mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;
await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const pointerListeners = () => doc.listeners.filter(l => l.type === "pointermove" || l.type === "pointerdown").length;
const liveObservers = () => doc.observers.filter(o => !o.disconnected).length;

test("on (default): two pointer listeners and one observer", () => {
  assert.equal(pointerListeners(), 2);
  assert.equal(liveObservers(), 1);
});

test("switched off: the listeners go and the observer disconnects; back on: both return", async () => {
  await F.game.settings.set(MODULE, "skipPickerGuide", false);
  F.Hooks.callAll("updateSetting", { key: `${MODULE}.skipPickerGuide` });
  assert.equal(pointerListeners(), 0);
  assert.equal(liveObservers(), 0);
  assert.equal(doc.body.classList.contains("pentaryn-combat-picker-cue"), false);
  await F.game.settings.set(MODULE, "skipPickerGuide", true);
  F.Hooks.callAll("updateSetting", { key: `${MODULE}.skipPickerGuide` });
  assert.equal(pointerListeners(), 2);
  assert.equal(liveObservers(), 1);
  assert.equal(doc.body.classList.contains("pentaryn-combat-picker-cue"), true);
});
