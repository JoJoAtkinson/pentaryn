/**
 * settings.mjs (guide step 4, C21/C22/C51): the one store row registers exactly today's config;
 * the readers fall back instead of throwing. Added at step 4.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";

const F = await installFoundry({ modules: ["pentaryn-senses"] });
const S = await import("../settings.mjs");

test("SETTINGS: one store row, sightReset", () => {
  assert.deepEqual(S.SETTINGS.map(r => [r.key, r.store, r.type, r.default]), [["sightReset", true, Number, 0]]);
  assert.equal(Object.isFrozen(S.SETTINGS), true);
});

test("before registration: setting() gives the default; systemSetting() of an absent key is undefined", () => {
  assert.equal(S.setting("sightReset"), 0);
  assert.equal(S.setting("nope"), undefined);
  assert.equal(S.systemSetting("dnd5e", "senseVisionSync"), undefined);
});

test("registerSettings: today's {scope, config, type, default}; a second call registers nothing", () => {
  S.registerSettings();
  S.registerSettings();
  assert.deepEqual(F.calls.filter(c => c.op === "settings.register"), [{ op: "settings.register", id: "pentaryn-senses.sightReset" }]);
  const { namespace, key, ...config } = F.game.settings.settings.get("pentaryn-senses.sightReset");
  assert.deepEqual([namespace, key, config], ["pentaryn-senses", "sightReset", { scope: "world", config: false, type: Number, default: 0 }]);
});

test("setSetting writes; setting reads it back; the snapshot reports the store row's size", async () => {
  await S.setSetting("sightReset", 1);
  assert.equal(S.setting("sightReset"), 1);
  assert.deepEqual(S.settingsSnapshot(), { sightReset: { store: true, size: null } });
});
