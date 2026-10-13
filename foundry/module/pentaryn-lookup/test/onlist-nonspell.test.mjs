// lookup-edge-3 [declared]: onList(<uuid>) whose uuid resolves to something that is not a spell Item
// (a JournalEntry, an Actor) answers {notFound, spell, hint} naming what it found, instead of
// throwing on `system.level` (a JournalEntry has no `system`) or answering a level-less "spell".
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

test("lookup-edge-3: onList(<JournalEntry uuid>) answers notFound naming the document, not a TypeError", async () => {
  const uuid = "Compendium.dnd-players-handbook.content.JournalEntry.docTreasure";
  assert.deepEqual(await rules.onList(uuid, "wizard"),
    { notFound: true, spell: uuid, hint: `${uuid} is a JournalEntry, not a spell Item` });
});

test("lookup-edge-3: onList(<Actor uuid>) answers notFound, not a level-less spell", async () => {
  const uuid = "Compendium.dnd-monster-manual.actors.Actor.mmGoblin";
  assert.deepEqual(await rules.onList(uuid, "wizard"),
    { notFound: true, spell: uuid, hint: `${uuid} is a Actor, not a spell Item` });
});

test("lookup-edge-3: onList(<spell uuid>) still answers the spell", async () => {
  const out = await rules.onList("Compendium.dnd-players-handbook.spells.Item.spFireball", "wizard");
  assert.equal(out.spell, "Fireball");
  assert.equal(out.level, 3);
  assert.equal(out.onList, true);
});
