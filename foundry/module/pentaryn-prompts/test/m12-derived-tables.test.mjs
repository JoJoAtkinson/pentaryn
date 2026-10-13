/**
 * prompts-core-M12 [declared]: three tables restated another table by hand. npc-core's
 * ABILITY_KEYS was a second copy of build-core's ABILITIES; core/size.mjs's DND_SIZE_WIDTH restated
 * the `dnd`/`w` columns of SIZES, and PC_SIZE_WORDS restated the tiny..large rows of SIZE_WORDS.
 * Each is now derived from its source. The oracle tests pin today's values, so the derivation
 * changes nothing a caller sees.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ABILITY_KEYS } from "../npc-core.mjs";
import { ABILITIES } from "../build-core.mjs";
import { SIZES, SIZE_WORDS, DND_SIZE_WIDTH, PC_SIZE_WORDS } from "../core/size.mjs";

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

test("prompts-core-M12: ABILITY_KEYS is build-core's ABILITIES, not a copy", () => {
  assert.equal(ABILITY_KEYS, ABILITIES);
  assert.deepEqual([...ABILITY_KEYS], ["str", "dex", "con", "int", "wis", "cha"]);   // oracle
  assert.ok(Object.isFrozen(ABILITY_KEYS));
});

test("prompts-core-M12: DND_SIZE_WIDTH is derived from SIZES and equals the old literal", () => {
  assert.deepEqual(DND_SIZE_WIDTH, Object.fromEntries(SIZES.map(s => [s.dnd, s.w])));
  assert.deepEqual({ ...DND_SIZE_WIDTH }, { tiny: 0.5, sm: 1, med: 1, lg: 2, huge: 3, grg: 4 });   // oracle
  assert.deepEqual(Object.keys(DND_SIZE_WIDTH), ["tiny", "sm", "med", "lg", "huge", "grg"]);
  assert.ok(Object.isFrozen(DND_SIZE_WIDTH));
});

test("prompts-core-M12: PC_SIZE_WORDS is SIZE_WORDS filtered to tiny..large and equals the old literal", () => {
  assert.deepEqual({ ...PC_SIZE_WORDS },
    { tiny: "tiny", small: "sm", sm: "sm", medium: "med", med: "med", large: "lg", lg: "lg" });   // oracle
  assert.deepEqual(Object.keys(PC_SIZE_WORDS), ["tiny", "small", "sm", "medium", "med", "large", "lg"]);
  for (const [word, key] of Object.entries(PC_SIZE_WORDS)) assert.equal(SIZE_WORDS[word], key, word);
  assert.ok(Object.isFrozen(PC_SIZE_WORDS));
});

test("prompts-core-M12: no hand-written copy of the three tables is left", () => {
  assert.doesNotMatch(read("npc-core.mjs"), /ABILITY_KEYS = Object\.freeze\(\[/);
  const size = read("core/size.mjs");
  assert.doesNotMatch(size, /DND_SIZE_WIDTH = Object\.freeze\(\{/);
  assert.doesNotMatch(size, /PC_SIZE_WORDS = Object\.freeze\(\{/);
});
