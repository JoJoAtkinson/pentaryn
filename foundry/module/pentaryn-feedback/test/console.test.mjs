// captureConsole: false (a world setting read at setup; requiresReload): no console wrap is made,
// the notification wrap still is, and describe().patches says so. Its own process, because a wrap
// once made stays for the life of the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installClient } from "./fixtures/world.mjs";
import { MODULE } from "../feedback-core.mjs";

const F = await installClient({ settings: { [`${MODULE}.captureConsole`]: false } });
const plainError = console.error;
const plainWarn = console.warn;
const { errorsOf } = await import("../recorder.mjs");
await import("../feedback.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;

test("captureConsole false: console.error and console.warn are untouched", () => {
  assert.equal(console.error, plainError);
  assert.equal(console.warn, plainWarn);
  assert.deepEqual(api.describe().patches.map(p => p.adjustments), ["feedback-notifications-notify"]);
});

test("captureConsole false: hook and window errors are still recorded", () => {
  F.fire("error", "Hooks.#call", new Error("still seen"), {});
  assert.equal(errorsOf().at(-1).message, "still seen");
});

test("selftest agrees: the console wrap matches the setting", () => {
  const check = api.selftest().checks.find(c => c.label === "console wrap matches captureConsole");
  assert.equal(check.ok, true);
  assert.equal(check.detail, false);
});
