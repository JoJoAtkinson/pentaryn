/**
 * prompts-core-EXT-2 [declared]: the setting defaults live in one table, core/defaults.mjs DEFAULTS.
 * settings.mjs registers them, gather/the panel/crops fall back to them, and the core's default
 * parameters read them — same values as before, written once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installWorld } from "./fixtures/world.mjs";

await installWorld();
const KEYS = ["unseenWithinFt", "cropMaxPerCall", "cropLongSidePx", "cropsDefault", "gatherChars"];

test("prompts-core-EXT-2: core/defaults.mjs holds the five setting defaults, same values as before", async () => {
  const { DEFAULTS } = await import("../core/defaults.mjs");
  const { GATHER_CHARS } = await import("../geometry-core.mjs");
  assert.deepEqual({ ...DEFAULTS },
    { unseenWithinFt: 60, cropMaxPerCall: 6, cropLongSidePx: 768, cropsDefault: "auto", gatherChars: GATHER_CHARS });
  assert.equal(GATHER_CHARS, 400);
  assert.ok(Object.isFrozen(DEFAULTS));
});

test("prompts-core-EXT-2: each settings row's default is the DEFAULTS entry", async () => {
  const { DEFAULTS } = await import("../core/defaults.mjs");
  const { SETTINGS } = await import("../settings.mjs");
  for (const k of KEYS) assert.equal(SETTINGS.find(r => r.key === k).default, DEFAULTS[k], k);
});

test("prompts-core-EXT-2: no file repeats a default as a literal", () => {
  const src = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
  const literalFallback = new RegExp(`setting\\("(${KEYS.join("|")})",\\s*(?!\\s|DEFAULTS\\.)`);
  for (const f of ["gather.mjs", "dialog.mjs"]) assert.doesNotMatch(src(f), literalFallback, f);
  for (const k of KEYS) {
    assert.doesNotMatch(src("settings.mjs"), new RegExp(`key: "${k}"[^\\n]*default: (?!DEFAULTS\\.)`), k);
  }
  for (const f of ["core/view.mjs", "core/placement.mjs", "scene-adapter.mjs"]) {
    assert.doesNotMatch(src(f), /unseenWithinFt = \d/, f);
  }
  assert.doesNotMatch(src("crops-adapter.mjs"), /longSide = \d/);
});

test("prompts-core-EXT-2: the core default parameters still answer the same values", async () => {
  const { buildView } = await import("../geometry-core.mjs");
  const { panelSplit } = await import("../core/placement.mjs");
  assert.equal(buildView([]).view.unseenWithinFt, 60);
  const rels = [{ key: "a", ft: 60, los: "blocked" }, { key: "b", ft: 65, los: "blocked" }];
  assert.deepEqual(panelSplit(rels).unseen.map(r => r.key), ["a"]);
});
