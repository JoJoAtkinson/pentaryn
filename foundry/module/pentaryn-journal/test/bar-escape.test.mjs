// items-journal-32: the bar's strings go through core.escapeHTML. Its entity spelling differs from
// Foundry's for an apostrophe (&#39; vs &#x27;), but every bar string reads the same once decoded.
import * as core from "../journal-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lang = JSON.parse(readFileSync(new URL("../lang/en.json", import.meta.url), "utf8")).PENTARYN_JOURNAL;
const decode = s => s.replace(/&(lt|gt|quot|#39|amp);/g, (m, e) => ({ lt: "<", gt: ">", quot: '"', "#39": "'", amp: "&" })[e]);

test("every string fillBar renders round-trips through core.escapeHTML and a 5-entity decoder", () => {
  const strings = [lang.add, lang.adding, lang.saved, lang.open, lang.update, lang.hint.add, lang.hint.changed,
    lang.hint.saved.replace("{when}", "3 minutes ago"), `<b>"Tom" & 'Jerry'</b>`];
  for (const s of strings) assert.equal(decode(core.escapeHTML(s)), s);
});

test("bar.mjs escapes with core.escapeHTML only; Foundry's escaper stays in the adapter's hashed body", () => {
  const src = readFileSync(new URL("../bar.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /foundry\.utils\.escapeHTML/);
  assert.match(src, /const barEsc = escapeHTML;/);
  const adapter = readFileSync(new URL("../sources-adapter.mjs", import.meta.url), "utf8");
  assert.match(adapter, /const esc = s => foundry\.utils\.escapeHTML\(String\(s \?\? ""\)\);/);
});
