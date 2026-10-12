/**
 * senses-EXT-4 (final review 2026-10-12): which light profiles setupLight() and the torch-on-create
 * hook give a "Light" activity is one frozen list, ACTIVITY_PROFILES in core/light.mjs (today just
 * "torch": lamps, lanterns and candles ship with their own). light.mjs tests membership in it rather
 * than a hard-coded 'torch', so a new source is one row. Behaviour for the shipped profiles is
 * unchanged (test/golden/setup-light.json).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../senses-core.mjs";

test("senses-EXT-4: ACTIVITY_PROFILES is a frozen list of LIGHT_PROFILES keys, today ['torch']", () => {
  const { ACTIVITY_PROFILES, LIGHT_PROFILES } = core;
  assert.ok(Array.isArray(ACTIVITY_PROFILES), "senses-core.mjs exports ACTIVITY_PROFILES");
  assert.ok(Object.isFrozen(ACTIVITY_PROFILES), "the list is frozen");
  assert.deepEqual([...ACTIVITY_PROFILES], ["torch"]);
  for (const key of ACTIVITY_PROFILES) assert.ok(key in LIGHT_PROFILES, `${key} is a LIGHT_PROFILES key`);
});

test("senses-EXT-4: ensureTorchActivity tests ACTIVITY_PROFILES membership, not a hard-coded 'torch'", () => {
  const src = readFileSync(new URL("../light.mjs", import.meta.url), "utf8");
  const fn = /async function ensureTorchActivity\([^)]*\) \{[\s\S]*?\n\}/.exec(src)?.[0] ?? "";
  assert.ok(fn, "light.mjs has ensureTorchActivity");
  assert.match(fn, /ACTIVITY_PROFILES\.includes\(profileKey\(item\)\)/);
  assert.doesNotMatch(fn, /["']torch["']/);
});
