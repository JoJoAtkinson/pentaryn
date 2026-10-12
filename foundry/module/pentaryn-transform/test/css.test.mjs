// Guide step 10 [declared] T-D4 (transform-creatures-14's test): transform's own classes are
// ptf-* (cssPrefix); every one the code adds is styled in styles/transform.css or is a marker the
// code queries; the shared tooltip classes come from the kit's lib/argon-tooltip.css (D7), which
// module.json `styles` lists (W4-T4, the Wave 7 batch; it was an @import in transform.css); no old
// pentaryn-<class> is left; every own selector is scoped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceScan, pinJSON } from "./kit/harness.mjs";
import { manifestOf } from "./kit/harness.mjs";
import { rulesForManifest } from "./css-rules.mjs";

const ROOT = new URL("..", import.meta.url);
const css = readFileSync(new URL("../styles/transform.css", import.meta.url), "utf8");
const kitCss = readFileSync(new URL("../lib/argon-tooltip.css", import.meta.url), "utf8");
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, "");

const RENAMED = ["return", "empty", "starry-on", "starry-act", "starry-chalice", "chalice-ready", "hidden", "picker",
  "current", "effect", "form-line", "hp-temp", "starry-pick", "chalice-pulse"];
/** Classes the code sets only to find or mark an element, never styled. */
const MARKERS = new Set(["ptf-starry-chalice", "ptf-hp-temp"]);

const codeClasses = () => {
  const out = new Set();
  for (const h of sourceScan(ROOT, /ptf-|pentaryn-tt/)) for (const m of h.text.matchAll(/(ptf-[a-z-]+|pentaryn-tt(?:-list)?)(?![a-z-])/g)) out.add(m[1]);
  return out;
};

test("the old → new map is a bijection, and no old pentaryn-<class> is left in code or CSS", () => {
  const news = RENAMED.map(c => `ptf-${c}`);
  assert.equal(new Set(news).size, RENAMED.length);
  const old = new RegExp(`pentaryn-(${RENAMED.join("|")})(?![A-Za-z0-9-])`);
  assert.deepEqual(sourceScan(ROOT, old).map(h => `${h.file}:${h.line}`), []);
  assert.equal(old.test(strip(css)), false);
  assert.ok(strip(css).includes("@keyframes ptf-chalice-pulse"));
});

test("every ptf-* class the code uses is styled here (or is a marker); the tooltip classes are the kit's", () => {
  const styles = strip(css);
  for (const c of codeClasses()) {
    if (c.startsWith("pentaryn-tt")) { assert.ok(kitCss.includes(`.${c}`), `${c} in lib/argon-tooltip.css`); continue; }
    if (MARKERS.has(c)) continue;
    assert.ok(styles.includes(`.${c}`) || styles.includes(` ${c} `), `${c} is styled in transform.css`);
  }
});

// [declared] W4-T4 (Joe 2026-10-12, Wave 7 batch), flipped from "transform.css imports the vendored kit
// stylesheet (@import first)": module.json `styles` lists lib/argon-tooltip.css after transform.css, and
// transform.css has neither the @import nor a copy of the kit's rules.
test("D7: module.json styles lists the vendored kit stylesheet; transform.css neither imports nor copies it", () => {
  assert.deepEqual(manifestOf(ROOT).styles, ["styles/transform.css", "lib/argon-tooltip.css"]);
  assert.equal(/@import/.test(strip(css)), false);
  assert.equal(strip(css).includes(".ech-tooltip.pentaryn-tt"), false);
});

test("every own selector is scoped under .ptf-* or .pentaryn-transform (C37)", () => {
  const heads = strip(css).replace(/@import[^;]*;/g, "").match(/[^{}]+(?=\{)/g).map(s => s.trim()).filter(s => !s.startsWith("@") && !/^\d+%|^from|^to/.test(s));
  for (const head of heads) for (const sel of head.split(",")) {
    if (/^\d+%/.test(sel.trim())) continue;
    assert.ok(/\.ptf-|\.pentaryn-transform/.test(sel), sel.trim());
  }
});

test("D7: the .pentaryn-tt rules transform's styles apply, in module.json order, are its pre-D7 block in order (golden/tooltip-rules.json)", () => {
  // The golden was computed from styles/transform.css at origin/main (rules :70-113, before the kit
  // import), so the shared stylesheet changes no rule, value or order a transform tooltip gets. Since
  // W4-T4 the loader reads module.json `styles` (unchanged golden: only the kit file has these rules).
  pinJSON("tooltip-rules", rulesForManifest(ROOT, /\.pentaryn-tt\b/), import.meta.url);
});
