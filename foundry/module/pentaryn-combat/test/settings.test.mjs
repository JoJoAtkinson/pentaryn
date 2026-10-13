// Guide S5: the SETTINGS table (literal labels, C51/C22), the Argon setting readers that moved into
// settings.mjs (C21), and the entry's onChange callback.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

// combat-core-M6: the header says no other file calls game.settings, but turn-riders.mjs read
// pentaryn-aoe's autoDamageOnHit itself. The read lives in settings.mjs as aoeAutoDamage().
test("aoeAutoDamage: true only when pentaryn-aoe is active and autoDamageOnHit is on; false on any failure (combat-core-M6)", async () => {
  assert.equal(settings.aoeAutoDamage(), false, "aoe not installed");
  F.game.settings.register("pentaryn-aoe", "autoDamageOnHit", { scope: "world", config: false, type: Boolean, default: true });
  assert.equal(settings.aoeAutoDamage(), false, "aoe installed but not active");
  F.game.modules.set("pentaryn-aoe", { id: "pentaryn-aoe", active: true });
  try {
    assert.equal(settings.aoeAutoDamage(), true);
    await F.game.settings.set("pentaryn-aoe", "autoDamageOnHit", false);
    assert.equal(settings.aoeAutoDamage(), false);
    const get = F.game.settings.get;
    F.game.settings.get = () => { throw new Error("not registered"); };
    try { assert.equal(settings.aoeAutoDamage(), false); } finally { F.game.settings.get = get; }
  } finally { F.game.modules.delete("pentaryn-aoe"); }
});

test("no module file but settings.mjs calls game.settings (combat-core-M6)", () => {
  const root = new URL("../", import.meta.url);
  const offenders = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!["lib", "test", "node_modules"].includes(e.name)) walk(new URL(`${e.name}/`, dir), `${rel}${e.name}/`);
      } else if (e.name.endsWith(".mjs") && `${rel}${e.name}` !== "settings.mjs") {
        if (/game\.settings\b/.test(readFileSync(new URL(e.name, dir), "utf8"))) offenders.push(`${rel}${e.name}`);
      }
    }
  })(root, "");
  assert.deepEqual(offenders, []);
});
