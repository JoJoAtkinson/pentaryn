// Guide step 10 [declared] T-D4 (transform-creatures-14's test): transform's own classes are
// ptf-* (cssPrefix); every one the code adds is styled in styles/transform.css or is a marker the
// code queries; the shared tooltip classes come from the kit's lib/argon-tooltip.css (D7), which
// transform.css imports; no old pentaryn-<class> is left; every own selector is scoped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceScan } from "./kit/harness.mjs";

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

test("D7: transform.css imports the vendored kit stylesheet and keeps no copy of its rules", () => {
  assert.match(css, /@import "\.\.\/lib\/argon-tooltip\.css";/);
  assert.equal(strip(css).includes(".ech-tooltip.pentaryn-tt"), false);
  const firstRule = strip(css).trim().split("\n").find(l => l.trim());
  assert.match(firstRule, /^@import /, "@import comes before every rule");
});

test("every own selector is scoped under .ptf-* or .pentaryn-transform (C37)", () => {
  const heads = strip(css).replace(/@import[^;]*;/g, "").match(/[^{}]+(?=\{)/g).map(s => s.trim()).filter(s => !s.startsWith("@") && !/^\d+%|^from|^to/.test(s));
  for (const head of heads) for (const sel of head.split(",")) {
    if (/^\d+%/.test(sel.trim())) continue;
    assert.ok(/\.ptf-|\.pentaryn-transform/.test(sel), sel.trim());
  }
});
