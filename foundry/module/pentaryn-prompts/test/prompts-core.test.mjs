/**
 * prompts-core.mjs (guide step 8): the identity constants load with no Foundry global, and the
 * tables moved out of feature files (KINDS from replace, PATCH_KEYS from checkPatch, SPEC_DIR,
 * CROP_DIR) are the same values their old homes still re-export.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

test("prompts-core loads bare; identity constants", async () => {
  for (const g of ["game", "canvas", "foundry", "CONFIG", "ui"]) assert.equal(globalThis[g], undefined, g);
  const C = await import("../prompts-core.mjs");
  assert.deepEqual([C.MODULE, C.SHORT, C.NS, C.CONTRACT, C.I18N, C.CSS],
    ["pentaryn-prompts", "prompts", "prompts", "pentaryn-prompts/api@1", "PENTARYN_PROMPTS", "pp-"]);
  assert.equal(C.VERSION, manifestOf(new URL("..", import.meta.url)).version);
  assert.deepEqual(C.HOOKS, {});
  assert.ok(Object.isFrozen(C.HOOKS) && Object.isFrozen(C.KINDS) && Object.isFrozen(C.PATCH_KEYS));
  assert.deepEqual(C.KINDS, ["actor", "npc", "character", "hotspot", "note", "light", "tile", "none"]);
  assert.deepEqual([...C.PATCH_KEYS].sort(), ["ac", "addItems", "biography", "cr", "creatureType", "disposition", "hp", "img",
    "itemUpdates", "languages", "name", "recharge", "removeItems", "set", "size", "speed", "traits"]);
  const geo = await import("../geometry-core.mjs");
  assert.equal(geo.MODULE, C.MODULE);
  assert.equal(geo.VERSION, C.VERSION);
});
