// settings.mjs (guide step 3): the table registers what the checkpoint pinned (glue.test owns that pin);
// these cases cover the parts glue.test cannot see — whenChanged's listener map and setting()'s fallback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { journalWorld } from "./fixtures/world.mjs";

await journalWorld();
const { SETTINGS, registerSettings, setting, settingsSnapshot, whenChanged } = await import("../settings.mjs");

test("setting() before registration falls back to the row default; unknown key → undefined", () => {
  assert.equal(setting("gmButton"), false);
  assert.equal(setting("singlePageReadables"), true);
  assert.equal(setting("folderName"), "Player Journals");
  assert.equal(setting("nope"), undefined);
});

test("registerSettings twice registers once (a hot patch skips existing rows)", () => {
  registerSettings();
  registerSettings();
  const mine = [...game.settings.settings.values()].filter(s => s.namespace === "pentaryn-journal");
  assert.deepEqual(mine.map(s => s.key), SETTINGS.map(r => r.key));
});

test("whenChanged: each listener gets the new value; the remover detaches it", async () => {
  const seen = [];
  const off = whenChanged("gmButton", v => seen.push(["a", v]));
  whenChanged("singlePageReadables", v => seen.push(["other", v]));
  await game.settings.set("pentaryn-journal", "gmButton", true);
  off();
  await game.settings.set("pentaryn-journal", "gmButton", false);
  assert.deepEqual(seen, [["a", true]]);
  assert.equal(setting("gmButton"), false);
});

test("settingsSnapshot reports every row's live value", () => {
  assert.deepEqual(settingsSnapshot(), { gmButton: false, singlePageReadables: true, folderName: "Player Journals" });
});
