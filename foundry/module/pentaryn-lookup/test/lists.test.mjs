// prompts-lookup-6 follow-up: the spellList dedupe and the names() grouping leave books.mjs for
// lookup-core. Each table is first pinned against the ORACLE (books.mjs's inline code at f4553b7b,
// test/fixtures/legacy-lists.mjs); the core functions are then asserted equal to it.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../lookup-core.mjs";
import * as oracle from "./fixtures/legacy-lists.mjs";

// ── spellList ────────────────────────────────────────────────────────────────

const PHB = "dnd-players-handbook.spells", SRD = "dnd5e.spells24", OLD = "dnd5e.spells", HB = "world.homebrew";
const U = (pack, id) => `Compendium.${pack}.Item.${id}`;
const INDEX = {
  [PHB]: new Map([["f", { name: "Fireball", system: { level: 3 } }], ["a", { name: "Aid", system: { level: 2 } }],
                  ["c", { name: "Cantrip X", system: { level: 0 } }]]),
  [SRD]: new Map([["a24", { name: "Aid", system: { level: 2 } }], ["l24", { name: "Light", system: { level: 0 } }],
                  ["n24", { name: "No Level", system: {} }]]),
  [OLD]: new Map([["l14", { name: "Light", system: { level: 0 } }], ["b14", { name: "Bless", system: { level: 1 } }]]),
  [HB]: null,                                         // an absent pack: readIndex answers null
};
const reads = [];
const readIndex = async (id, fields) => { reads.push([id, fields]); return INDEX[id] ?? null; };

// the registry's order deliberately puts the SRD and the 2014 pack before the owned book
const UUIDS = [
  U(SRD, "a24"), U(OLD, "l14"), U(PHB, "f"), U(SRD, "l24"), "not-a-compendium-uuid", U(PHB, "a"),
  U(HB, "h1"), U(SRD, "n24"), U(PHB, "missing"), U(OLD, "b14"), U(PHB, "c"), "Compendium.x.Actor.y",
];
const LEVELS = [null, 0, 2, "3", 9];

test("oracle: spellList dedupe keeps the owned book first, one row per name, level then name", async () => {
  const all = await oracle.spellListSpells(UUIDS, readIndex);
  assert.deepEqual(all.map(r => [r.name, r.level, r.uuid]), [
    ["Cantrip X", 0, U(PHB, "c")],                    // level 0 and null sort together, by name
    [U(PHB, "missing"), null, U(PHB, "missing")],    // no index entry: the uuid stands as its name, level null
    [U(HB, "h1"), null, U(HB, "h1")],
    ["Light", 0, U(SRD, "l24")],                      // the SRD keeps the registry's order ahead of the 2014 pack
    ["No Level", null, U(SRD, "n24")],
    ["Bless", 1, U(OLD, "b14")],
    ["Aid", 2, U(PHB, "a")],                          // the PHB's Aid, not the SRD's
    ["Fireball", 3, U(PHB, "f")],
  ]);
  assert.deepEqual((await oracle.spellListSpells(UUIDS, readIndex, "3")).map(r => r.name), ["Fireball"]);
});

// ── names() ──────────────────────────────────────────────────────────────────

const NAME_INDEX = {
  "dnd-players-handbook.classes": [
    { name: "Wizard", type: "class", system: { identifier: "wizard" } },
    { name: "Bard", type: "class", system: { identifier: "bard" } },
    { name: "Oath of Glory", type: "subclass", system: { classIdentifier: "paladin" } },
    { name: "Oath of Devotion", type: "subclass", system: { classIdentifier: "paladin" } },
    { name: "Loose Subclass", type: "subclass", system: {} },             // no classIdentifier → "?"
    { name: "A Feature", type: "feat", system: {} },                     // neither: ignored
  ],
  "dnd-players-handbook.origins": [
    { name: "Elf, High", type: "race", system: { type: {} } },
    { name: "Dwarf", type: "race", system: { type: {} } },
    { name: "Sage", type: "background", system: {} },
    { name: "Acolyte", type: "background", system: {} },
    { name: "Darkvision", type: "feat", system: {} },                    // ignored
  ],
  "dnd-players-handbook.feats": [
    { name: "Tough", type: "feat", system: { type: { value: "feat", subtype: "origin" } } },
    { name: "Alert", type: "feat", system: { type: { value: "feat", subtype: "origin" } } },
    { name: "Grappler", type: "feat", system: { type: { value: "feat", subtype: "general" } } },
    { name: "Mystery", type: "feat", system: { type: { value: "feat", subtype: "" } } },   // "" → other
    { name: "Bare", type: "feat" },                                      // no system → other
    { name: "Not A Feat", type: "spell", system: {} },                   // ignored
  ],
};
const nameReads = [];
const readNames = index => async (id, fields) => { nameReads.push([id, fields]); return index[id] ?? null; };
const KINDS = [null, "subclass", "Subclasses", "Race", "species", "background", "class", "FEATS", "bogus", ""];

test("oracle: names() groups, sorts and picks one part by kind", async () => {
  const all = await oracle.names(readNames(NAME_INDEX));
  assert.deepEqual(all, {
    classes: ["Bard", "Wizard"],
    subclasses: { paladin: ["Oath of Devotion", "Oath of Glory"], "?": ["Loose Subclass"] },
    species: ["Dwarf", "Elf, High"],
    backgrounds: ["Acolyte", "Sage"],
    feats: { origin: ["Alert", "Tough"], general: ["Grappler"], other: ["Bare", "Mystery"] },
  });
  assert.deepEqual(await oracle.names(readNames(NAME_INDEX), "Race"), { species: ["Dwarf", "Elf, High"] });
  assert.deepEqual(await oracle.names(readNames(NAME_INDEX), "bogus"), all);
  assert.deepEqual(await oracle.names(readNames({})),
    { classes: [], subclasses: {}, species: [], backgrounds: [], feats: {} });
});
