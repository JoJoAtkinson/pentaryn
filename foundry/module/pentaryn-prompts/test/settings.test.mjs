/**
 * settings.mjs (guide step 5, prompts-lookup-16): the local `setting(key, fallback)` semantics the
 * glue relies on — the caller's fallback, never the row default, when the value is unset or the
 * read throws — and `settingStrict` letting a throw through (the P key's defaultSize read).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
const S = await import("../settings.mjs");

test("setting(): the live value; the caller's fallback when unset or when the read throws", () => {
  S.registerSettings();
  assert.equal(S.setting("gatherChars", 160), 400);
  assert.equal(S.setting("nope", "fb"), "fb");
  const get = F.game.settings.get;
  F.game.settings.get = () => { throw new Error("not registered"); };
  try {
    assert.equal(S.setting("gatherChars", 160), 160);
    assert.equal(S.setting("gatherChars", 400), 400);
    assert.throws(() => S.settingStrict("defaultSize"), /not registered/);
  } finally {
    F.game.settings.get = get;
  }
  assert.equal(S.settingStrict("defaultSize"), "mid");
});

test("the manifest ring: newest first, one per call, five kept; a player client never writes", async () => {
  for (let i = 1; i <= 7; i++) await S.storeManifest({ call: `pm-${i}` });
  await S.storeManifest({ call: "pm-5", again: true });
  assert.deepEqual(S.manifests().map(m => m.call), ["pm-5", "pm-7", "pm-6", "pm-4", "pm-3"]);
  assert.deepEqual(S.manifestFor("pm-5"), { call: "pm-5", again: true });
  assert.equal(S.manifestFor("pm-1"), null);
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  await S.storeManifest({ call: "pm-9" });
  F.game.user = gm;
  assert.equal(S.manifestFor("pm-9"), null);
  F.game.settings.set(MODULE, "lastCalls", "junk");
  assert.deepEqual(S.manifests(), []);
});

test("settingsSnapshot(): live values, the store as its size", async () => {
  await F.game.settings.set(MODULE, "lastCalls", [{ call: "a" }, { call: "b" }]);
  const snap = S.settingsSnapshot();
  assert.deepEqual(snap.lastCalls, { store: true, size: 2 });
  assert.equal(snap.defaultSize, "mid");
  assert.equal(Object.keys(snap).length, 11);
});
