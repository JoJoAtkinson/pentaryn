/**
 * prompts-core-M1 [declared]: encounterXp's docblock said "Hostile-or-neutral npcs only.", which
 * was never what the code did. encounterXp counts nothing itself: each built creature's XP comes
 * from scene-adapter's actorXp(actor, token), and actorXp decides who counts (a hostile npc's CR
 * XP; 0 for characters, piles, neutral/friendly/secret tokens and anything without a CR). The
 * docblock now says so. Comment only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../replace.mjs", import.meta.url), "utf8");

test("prompts-core-M1: encounterXp's docblock defers who counts to actorXp, no 'Hostile-or-neutral'", () => {
  const at = src.indexOf("function encounterXp(");
  assert.ok(at > 0, "encounterXp is still in replace.mjs");
  const open = src.lastIndexOf("/**", at);
  const doc = src.slice(open, src.indexOf("*/", open) + 2);
  assert.doesNotMatch(doc, /Hostile-or-neutral/i, "the old, wrong filter sentence is gone");
  assert.match(doc, /actorXp\(actor, token\)/, "the docblock names actorXp(actor, token)");
  assert.match(doc, /decides who counts/, "and says actorXp decides who counts");
});
