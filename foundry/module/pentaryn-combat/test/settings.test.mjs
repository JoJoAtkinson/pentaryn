// Guide S5: the SETTINGS table (literal labels, C51/C22), the Argon setting readers that moved into
// settings.mjs (C21), and the entry's onChange callback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { LANG, MODULE, setupWorld } from "./fixtures/world.mjs";

const W = await setupWorld();
const { F } = W;
const settings = await import("../settings.mjs");
const flat = {};
(function walk(node, prefix) {
  for (const [k, v] of Object.entries(node)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") walk(v, key); else flat[key] = v;
  }
})(LANG, "");

test("SETTINGS: 30 frozen rows in DEFAULTS order, literal name/hint keys present in lang, a doc each", () => {
  assert.equal(settings.SETTINGS.length, 30);
  assert.deepEqual(settings.SETTINGS.map(r => r.key), Object.keys(settings.DEFAULTS));
  for (const r of settings.SETTINGS) {
    assert.ok(Object.isFrozen(r), r.key);
    assert.equal(r.name, `PENTARYN_COMBAT.Setting.${r.key}.Name`);
    assert.equal(r.hint, `PENTARYN_COMBAT.Setting.${r.key}.Hint`);
    assert.equal(typeof flat[r.name], "string", r.name);
    assert.equal(typeof flat[r.hint], "string", r.hint);
    assert.ok(r.doc.length > 5, r.key);
    assert.deepEqual([r.scope, r.config, r.type, r.default], ["world", true, Boolean, true]);
  }
});

test("registerSettings passes the entry's onChange to every row; a second call registers nothing", () => {
  const seen = [];
  const keys = settings.registerSettings({ onChange: v => seen.push(v) });
  assert.equal(keys.length, 30);
  F.game.settings.settings.get(`${MODULE}.swingPips`).onChange(false);
  assert.deepEqual(seen, [false]);
  assert.deepEqual(settings.registerSettings(), []);
});

test("argonSetting: the value; on a throw the call site's fallback, or the throw itself", () => {
  assert.equal(settings.argonSetting("rangepicker"), true);
  assert.equal(settings.hasArgonSetting("rangepicker"), true);
  assert.equal(settings.hasArgonSetting("nope"), false);
  const get = F.game.settings.get;
  F.game.settings.get = () => { throw new Error("not registered"); };
  try {
    assert.equal(settings.argonSetting("rangepicker", () => false), false);
    assert.throws(() => settings.argonSetting("alwaysOn"), /not registered/);
  } finally { F.game.settings.get = get; }
});
