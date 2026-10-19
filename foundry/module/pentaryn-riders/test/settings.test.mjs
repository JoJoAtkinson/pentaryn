// Guide S4 (combat-riders-25 step 1, C21, C22, C51): the SETTINGS table and its two readers.
// settingOr keeps the six try/catch readers' semantics (unreadable → the fallback, else `!== false`),
// settingRaw keeps the direct reads (unregistered → Foundry's own throw). The registration order and
// option objects are pinned by glue.test (golden/settings.json); this file pins the table itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANG, MODULE, setupWorld } from "./fixtures/world.mjs";

const W = await setupWorld();
const { F } = W;
const { SETTINGS, registerSettings, settingOr, settingRaw, setting, settingsSnapshot } = await import("../settings.mjs");

const ORDER = ["rituals", "longCasts", "concentrationSummons", "concentrationAutoBreak", "castDefaults", "arcaneRecovery", "enabled", "hdControls", "spellView"];
const langHas = key => key.split(".").reduce((o, p) => o?.[p], LANG) !== undefined;

test("SETTINGS: nine frozen rows in today's order, literal labels present in lang, a doc line each", () => {
  assert.ok(Object.isFrozen(SETTINGS));
  assert.deepEqual(SETTINGS.map(r => r.key), ORDER);
  for (const r of SETTINGS) {
    assert.equal(r.name, `PENTARYN_RIDERS.settings.${r.key}.name`);
    assert.equal(r.hint, `PENTARYN_RIDERS.settings.${r.key}.hint`);
    assert.ok(langHas(r.name) && langHas(r.hint), r.key);
    assert.deepEqual([r.scope, r.config, r.type, r.default], ["world", true, Boolean, true], r.key);
    assert.ok(typeof r.doc === "string" && r.doc.length > 10, r.key);
  }
  assert.equal(typeof SETTINGS.find(r => r.key === "hdControls").onChange, "function");
  assert.equal(SETTINGS.find(r => r.key === "spellView").onChange, SETTINGS.find(r => r.key === "hdControls").onChange);
  assert.equal(SETTINGS.filter(r => r.onChange).length, 2);
});

test("before init: settingOr gives the fallback, settingRaw throws Foundry's message, setting gives the row default", () => {
  for (const key of ORDER) {
    assert.equal(settingOr(key, false), false, key);
    assert.equal(settingOr(key, true), true, key);
    assert.throws(() => settingRaw(key), { message: `"${MODULE}.${key}" is not a registered game setting` });
    assert.equal(setting(key), true, key);
  }
  assert.equal(setting("nope"), undefined);
});

test("registered: settingOr / settingRaw read the value; a registered false reads false; a second register is a no-op", async () => {
  registerSettings();
  registerSettings();
  assert.deepEqual(F.calls.filter(c => c.op === "settings.register").map(c => c.id.slice(MODULE.length + 1)), ORDER);
  for (const key of ORDER) {
    assert.equal(settingOr(key, false), true, key);
    assert.equal(settingRaw(key), true, key);
  }
  await F.game.settings.set(MODULE, "castDefaults", false);
  assert.equal(settingOr("castDefaults", true), false);
  assert.equal(settingRaw("castDefaults"), false);
  assert.deepEqual(settingsSnapshot(), { ...Object.fromEntries(ORDER.map(k => [k, true])), castDefaults: false });
  await F.game.settings.set(MODULE, "castDefaults", true);
});
