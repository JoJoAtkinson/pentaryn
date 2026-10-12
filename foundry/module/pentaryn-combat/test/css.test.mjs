// Guide S10 (combat-riders-34, the CSS part): no JS adds .pentaryn-combat-hidden, so its rule is gone;
// one !important is left (combat.css's Argon override; removing it is declared B5, not done).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf, sourceScan, pinJSON } from "./kit/harness.mjs";
import { rulesForManifest } from "./css-rules.mjs";

const css = readFileSync(new URL("../styles/combat.css", import.meta.url), "utf8");

test("the dead .pentaryn-combat-hidden rule is gone and nothing sets the class", () => {
  assert.equal(css.includes("pentaryn-combat-hidden"), false);
  assert.deepEqual(sourceScan(new URL("..", import.meta.url), /pentaryn-combat-hidden/), []);
});

test("one !important left (B5 keeps it)", () => {
  assert.equal((css.match(/!important/g) ?? []).length, 1);
});

// D7 [declared] (transform-creatures-14 step 2, W4-C6): combat loads the shared tooltip rules itself.
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "");

// [declared] W4-C6 (Joe 2026-10-12, Wave 7 batch), flipped from "combat.css imports the vendored kit
// stylesheet before every rule": module.json `styles` lists lib/argon-tooltip.css after combat.css; the
// @import is gone and combat.css still keeps no copy of the kit's rules.
test("D7: module.json styles lists the vendored kit stylesheet; combat.css neither imports nor copies it", () => {
  assert.deepEqual(manifestOf(new URL("..", import.meta.url)).styles, ["styles/combat.css", "lib/argon-tooltip.css"]);
  assert.equal(/@import/.test(strip(css)), false);
  assert.equal(strip(css).includes(".pentaryn-tt"), false);
});

test("D7: the tooltip class combat's TT adds is styled by what combat.css loads, not by pentaryn-transform", () => {
  const ui = readFileSync(new URL("../hud/buttons-ui.mjs", import.meta.url), "utf8");
  const TT = JSON.parse(ui.match(/export const TT = (\[[^\]]*\]);/)[1]);
  assert.deepEqual(TT, ["pentaryn-tt", "pentaryn-combat-tt"]);
  const loaded = rulesForManifest(new URL("..", import.meta.url), /./).map(r => r.selector);
  for (const c of TT) assert.ok(loaded.some(s => s.startsWith(`.ech-tooltip.${c}`)), `.${c} styled by combat's module.json styles`);
});

test("D7: the .pentaryn-tt rules combat's styles apply are transform.css's pre-D7 block, in order (golden/tooltip-rules.json)", () => {
  // Computed from origin/main's pentaryn-transform/styles/transform.css (:70-113), which styled
  // combat's tooltips until now; the same golden pins pentaryn-transform's own css.test. Since W4-C6
  // the loader reads module.json `styles` in order (unchanged golden).
  pinJSON("tooltip-rules", rulesForManifest(new URL("..", import.meta.url), /\.pentaryn-tt\b/), import.meta.url);
});
