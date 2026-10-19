// Guide S5 (C17, C18, combat-riders-25 step 3 / -31): the entry's FEATURES each export install and
// uninstall, register no hook at import, and the entry is the only module-scope registrar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const ROOT = new URL("../", import.meta.url);
const FEATURES = ["rituals", "concentration", "argon-tidy", "cast-flow", "damage-riders", "card-note", "tray-preset", "battle-medic", "hd-sheet", "spell-view"];

test("the entry lists the ten features in today's load order", () => {
  const entry = readFileSync(new URL("riders.mjs", ROOT), "utf8");
  const imported = [...entry.matchAll(/^import \* as \w+ from "\.\/([\w-]+)\.mjs";$/gm)].map(m => m[1]);
  assert.deepEqual(imported, FEATURES);
});

test("every feature exports install(reg, ctx) and uninstall(), and imports without a Foundry global", async () => {
  for (const f of FEATURES) {
    const mod = await import(new URL(`${f}.mjs`, ROOT));
    assert.equal(typeof mod.install, "function", f);
    assert.equal(mod.install.length, 2, f);
    assert.equal(typeof mod.uninstall, "function", f);
  }
  assert.equal(globalThis.Hooks, undefined, "nothing touched Hooks at import");
});

test("no module-scope Hooks.on/once outside the entry; no game.settings outside settings.mjs", () => {
  for (const file of readdirSync(ROOT).filter(n => n.endsWith(".mjs"))) {
    const text = readFileSync(new URL(file, ROOT), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    if (file !== "riders.mjs") assert.doesNotMatch(text, /\bHooks\.(on|once)\(/, file);
    if (file !== "settings.mjs") assert.doesNotMatch(text, /game\.settings\.(get|register)\(/, file);
  }
});
