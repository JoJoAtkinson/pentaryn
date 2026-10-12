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

// journal-EXT-6: the skip-reason vocabulary was written by hand in four places (core.skipReason,
// api.mjs, the manifest's lastReason row, README) with nothing checking they agree. It now lives in
// core.SKIP_REASONS; the code uses its members, the manifest builds its string from it, and this
// test pins the README line to exactly those names.
test("journal-EXT-6: one skip-reason list — core, manifest and README agree", async () => {
  const core = await import("../journal-core.mjs");
  const { MANIFEST } = await import("../api-manifest.mjs");
  assert.ok(Array.isArray(core.SKIP_REASONS), "journal-core exports SKIP_REASONS");
  assert.ok(Object.isFrozen(core.SKIP_REASONS));
  assert.deepEqual([...core.SKIP_REASONS], ["no-target", "no-journal", "nothing-visible", "too-large"]);
  for (const r of [core.skipReason({}), core.skipReason({ journal: {} }),
    core.skipReason({ journal: {}, sources: [1], plan: { tooLarge: true } })]) {
    assert.ok(core.SKIP_REASONS.includes(r), `skipReason returned ${r}, not a SKIP_REASONS member`);
  }
  const row = MANIFEST.rows.find(r => r.path === "lastReason");
  assert.equal(row.returns, [...core.SKIP_REASONS.map(r => `"${r}"`), "null"].join(" | "));
  const line = README.split("`lastReason()`")[1].split("\n- ")[0].split(":").slice(1).join(":"); // the list after "was `null`:"
  const named = [...line.matchAll(/`([a-z-]+)`/g)].map(m => m[1]);
  assert.deepEqual(named, [...core.SKIP_REASONS], "README's lastReason line names exactly SKIP_REASONS");
  const api = readFileSync(new URL("../api.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(api, /lastReason = "/, "api.mjs sets lastReason from SKIP_REASONS, not a string literal");
});
