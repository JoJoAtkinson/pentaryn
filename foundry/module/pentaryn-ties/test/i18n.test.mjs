/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 6): the language file as the code
 * uses it. The 48 template-built keys (13 families: `stance.*`, `group.*`, `attributes.ns.*`, …) are
 * pinned with their English strings and rendered through the call sites that are reachable from
 * here, so S10's literal maps can be proven to say the same thing. Every literal key the sources
 * name — settings, keybindings, `t("…")` / `f("…")` / `"PENTARYN_TIES.…"` — exists in lang/en.json.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pinJSON, sourceFiles } from "./kit/harness.mjs";
import { bootWorld, LANG } from "./fixtures/world.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FAMILIES = [
  "attributes.filter.", "attributes.carried.", "attributes.help.", "attributes.ns.", "known.category.",
  "known.share.skip.", "known.study.mode.", "known.inspect.scope", "review.sort.", "review.tab.", "stance.",
  "group.", "dialog.reverse",
];

const F = await bootWorld();
const API = await import("../ties-api.mjs");
const Known = await import("../known.mjs");
const Attributes = await import("../attributes.mjs");

test("the 48 template-built keys and their English, by family", () => {
  const out = {};
  for (const fam of FAMILIES) {
    out[fam] = Object.fromEntries(Object.entries(LANG).filter(([k]) => k.startsWith(`PENTARYN_TIES.${fam}`)));
  }
  pinJSON("i18n-template-keys", out, import.meta.url);
  assert.equal(Object.values(out).reduce((n, o) => n + Object.keys(o).length, 0), 48);
});

test("rendered through their call sites: stanceLabel, categoryLabel, a derived attribute's category", () => {
  pinJSON(
    "i18n-call-sites",
    {
      stanceLabel: Object.fromEntries([-2, -1, 0, 1, 2].map(v => [v, API.stanceLabel(v)])),
      categoryLabel: Object.fromEntries(["sentient", "beasts"].map(k => [k, Known.categoryLabel({ key: k })])),
      derivedCategory: Object.fromEntries(["type:humanoid", "species:elf", "background:sage", "size:med", "kind:zzNoActor0000001"].map(id => [id, Attributes.describeAttribute(id).category])),
    },
    import.meta.url
  );
});

test("every literal key the sources name exists in lang/en.json", () => {
  const strip = src => src.replace(/\/\*[\s\S]*?\*\//g, "");
  const used = new Set();
  for (const rel of sourceFiles(ROOT)) {
    const src = strip(readFileSync(join(ROOT, rel), "utf8"));
    for (const m of src.matchAll(/"(PENTARYN_TIES\.[A-Za-z0-9_.]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\b(?:t|f)\(\s*"([A-Za-z0-9_.]+)"/g)) used.add(`PENTARYN_TIES.${m[1]}`);
  }
  const missing = [...used].filter(k => !(k in LANG)).sort();
  assert.deepEqual(missing, []);
  assert.ok(used.size > 380, `scanned ${used.size} keys`);
});

test("settings and keybindings: every name/hint/choice key is in the language file", () => {
  const keys = [];
  for (const s of game.settings.settings.values()) {
    for (const k of [s.name, s.hint, ...Object.values(s.choices ?? {})]) if (k) keys.push(k);
  }
  for (const k of game.keybindings.actions.values()) for (const x of [k.name, k.hint]) if (x) keys.push(x);
  assert.deepEqual(keys.filter(k => !(k in LANG)), []);
  assert.equal(keys.length, 24); // 6 settings × name+hint, 2 choices, 6 keybindings × name+hint
});

test("the language file: 473 flat keys, every value a string", () => {
  assert.equal(Object.keys(LANG).length, 473);
  assert.ok(Object.values(LANG).every(v => typeof v === "string"));
  assert.ok(Object.keys(LANG).every(k => k.startsWith("PENTARYN_TIES.")));
  assert.equal(F.utilsSource === "foundry" || process.env.PENTARYN_TEST_SHIMS === "1", true);
});
