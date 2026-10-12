/**
 * CSS scoping (guide S11, C37): every selector in styles/ties.css sits under the module's `pt-`
 * prefix or `.pentaryn-ties`, and each window the stylesheet roots on carries its `pt-` class.
 * The one exception is the canvas card layer `#pentaryn-ties-cards`, whose element is pinned by the
 * canvas goldens (a class on it would be a declared DOM change).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = f => readFileSync(ROOT + f, "utf8");

/** Top-level and @media selectors, comments stripped (the scorer's reading). */
function selectors(css) {
  const out = [];
  let buf = "";
  for (const ch of css.replace(/\/\*[\s\S]*?\*\//g, "")) {
    if (ch === "{") {
      const head = buf.trim();
      buf = "";
      if (!head.startsWith("@")) out.push(...head.split(",").map(s => s.trim()).filter(Boolean));
    } else if (ch === "}" || ch === ";") buf = "";
    else buf += ch;
  }
  return out.filter(s => !/^(from|to|\d+%|:root)/.test(s));
}

test("every selector is under .pt- or .pentaryn-ties, the card layer excepted", () => {
  const stray = selectors(read("styles/ties.css"))
    .filter(s => !s.includes(".pt-") && !s.includes(".pentaryn-ties") && !s.startsWith("#pentaryn-ties-cards"));
  assert.deepEqual(stray, []);
});

test("each window the stylesheet roots on carries its pt- class", () => {
  const roots = { "review-ui.mjs": "pt-attr-review", "look-app.mjs": "pt-look-window",
    "preview-app.mjs": "pt-inspect-preview", "tie-dialog.mjs": "pt-tie-dialog" };
  const css = read("styles/ties.css");
  for (const [file, cls] of Object.entries(roots)) {
    assert.match(read(file), new RegExp(`classes: \\[[^\\]]*"${cls}"`), file);
    assert.ok(css.includes(`.${cls} `), `${cls} is used in ties.css`);
  }
});
