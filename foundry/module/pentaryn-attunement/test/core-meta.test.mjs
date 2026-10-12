// The core's identity (guide step 2, C41): imported bare FIRST, before any stub, so a Foundry global
// at its top level fails here; its constants agree with module.json.
const core = await import("../attunement-core.mjs");
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../module.json", import.meta.url), "utf8"));

test("the core loads with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "Actor", "canvas"]) assert.equal(globalThis[g], undefined, g);
  assert.equal(typeof core.computeSlots, "function");
});

test("VERSION === module.json version; MODULE === module.json id", () => {
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.FLAG_SCOPE, manifest.id);
});

test("trimSlots drops trailing holes only and copies (writeSlots, :352–353)", () => {
  const input = ["a", null, "b", null, null];
  assert.deepEqual(core.trimSlots(input), ["a", null, "b"]);
  assert.deepEqual(input, ["a", null, "b", null, null], "input untouched");
  assert.deepEqual(core.trimSlots([null, null]), []);
  assert.deepEqual(core.trimSlots([]), []);
});

test("shortName takes the first word before a space or comma", () => {
  assert.equal(core.shortName("Talo Vesk"), "Talo");
  assert.equal(core.shortName("Quinn, Ballad"), "Quinn");
});

test("patchProficiencyMap({}) adds PROFICIENCY_CATEGORIES in order", () => {
  assert.deepEqual(core.patchProficiencyMap({}), [...core.PROFICIENCY_CATEGORIES]);
  assert.deepEqual([...core.PROFICIENCY_CATEGORIES], ["wondrous", "ring", "rod", "wand", "trinket"]);
  assert.ok(Object.isFrozen(core.PROFICIENCY_CATEGORIES));
});

test("EC-10: capOf — a finite max (floored at 0), else 3; computeSlots uses it", () => {
  assert.equal(core.capOf({ max: 5 }), 5);
  assert.equal(core.capOf({ max: 0 }), 0);
  assert.equal(core.capOf({ max: -2 }), 0);
  for (const max of [undefined, NaN, Infinity, null, "4"]) assert.equal(core.capOf({ max }), 3, String(max));
  assert.equal(core.capOf({}), 3);
  assert.equal(core.capOf(undefined), 3);
  const actor = (att) => ({ system: { attributes: { attunement: att } }, items: { filter: () => [] }, getFlag: () => undefined });
  for (const max of [undefined, NaN]) {
    const s = core.computeSlots(actor({ value: 0, max }));
    assert.equal(s.max, 3, String(max));
    assert.deepEqual(s.slots, [null, null, null]);
  }
});
