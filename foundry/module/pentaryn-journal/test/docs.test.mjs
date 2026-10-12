// Doc guard (items-journal-37, README half): report() is not listed as GM-only (the code has no gate),
// and the hidden folderName setting is documented.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const README = readFileSync(new URL("../README.md", import.meta.url), "utf8");

test("report() is not under 'For the GM only'", () => {
  const gmOnly = README.split("For the GM only:")[1]?.split(/\n- \*\*/)[0] ?? "";
  assert.doesNotMatch(gmOnly, /`report\(\)`/);
  assert.match(README, /`report\(\)` \(not gated/);
});

test("the folderName setting is documented", () => {
  assert.match(README, /`folderName`/);
});

// journal-M9: the headers used to describe the bar as eye/pin-only ("under every eye readable (a
// JournalEntry opened from a scene Note pin, …)"). The code shows it on any journal the player can
// observe but not own, and on any item in an inspectable eye pile — the rule "Who sees it" states.
test("journal-M9: the headers state the bar's real rule, not eye/pin-only", () => {
  const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const header = (src) => src.slice(0, src.indexOf("*/"));
  const bar = header(read("bar.mjs"));
  const entry = header(read("journal.mjs"));
  const intro = README.split("## What the player sees")[1].split("\n- **")[0];
  const manifest = JSON.parse(read("module.json"));
  const texts = {
    "bar.mjs": bar, "journal.mjs": entry, "README intro": intro,
    "module.json description": manifest.description,
    "module.json afterSync": manifest.flags.pentaryn.afterSync.join("\n"),
  };
  for (const [where, text] of Object.entries(texts)) {
    const flat = text.replace(/\s*\n\s*\*?\s*/g, " ");
    assert.doesNotMatch(flat, /every eye readable/i, `${where} still says the bar is eye-only`);
  }
  for (const where of ["bar.mjs", "journal.mjs", "README intro", "module.json description"]) {
    const flat = texts[where].replace(/\s*\n\s*\*?\s*/g, " ");
    assert.match(flat, /observe but (do(es)? not|don't) own/i, `${where} does not state the observe-not-own rule`);
    assert.match(flat, /eye pile/i, `${where} does not mention eye-pile items`);
  }
});
