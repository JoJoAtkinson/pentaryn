/**
 * Synthetic compendium packs for the glue and API characterisation (guide step 2).
 *
 * Shapes follow what the entry reads from Foundry: `game.packs.get(id)` → `{ metadata.label,
 * documentName, locked, getDocuments(), getIndex(), getDocument(id) }`; a JournalEntry's `pages` is an
 * iterable collection with `.size` and no `.length` (an EmbeddedCollection live). Index entries
 * carry `_id` (never `id`), as Foundry's index does. Not real book text — see books.mjs.
 *
 * `dnd-dungeon-masters-guide.content` is deliberately absent so the missing-pack paths run.
 */

import { StubCollection } from "../kit/foundry-stub.mjs";
import { BOOKS } from "./books.mjs";

/** A collection keyed by `_id` (compendium index) or `id` (documents). */
function keyed(list, key) {
  const c = new StubCollection();
  for (const e of list) c.set(e[key], e);
  return c;
}

function makePack(id, { label, documentName, docs = [], index = null, locked = true }) {
  const idx = keyed(index ?? docs.map(d => ({ _id: d.id, name: d.name })), "_id");
  const pack = {
    collection: id,
    metadata: { id, label },
    documentName,
    locked,   // module and system packs are locked by default (CompendiumCollection#locked)
    calls: { getDocuments: 0, getIndex: [] },
    async getDocuments() {
      pack.calls.getDocuments += 1;
      return docs;
    },
    async getIndex(opts) {
      pack.calls.getIndex.push(opts ?? null);
      return idx;
    },
    async getDocument(docId) {
      return docs.find(d => d.id === docId) ?? null;
    },
  };
  return pack;
}

function journal(packId, { id, name, pages }) {
  const entry = { documentName: "JournalEntry", id, name, pack: packId, parent: null };
  entry.uuid = `Compendium.${packId}.JournalEntry.${id}`;
  entry.pages = keyed(pages.map(p => ({
    documentName: "JournalEntryPage",
    id: p.id,
    name: p.name,
    text: p.html === null ? null : { content: p.html },
    parent: entry,
    uuid: `${entry.uuid}.JournalEntryPage.${p.id}`,
  })), "id");
  return entry;
}

// ── journal packs ──────────────────────────────────────────────────────────────

const PHB = "dnd-players-handbook.content";
const ARTIFACTS = {
  id: "docTreasure", name: "Treasure", pages: [
    { id: "pgArtifacts", name: "Artifacts",
      html: "<p>Artifact properties.</p>"
        + "<p>@Embed[Compendium.dnd-players-handbook.tables.RollTable.tblMinor rollable]</p>"
        + "<p>@Embed[Compendium.dnd-players-handbook.tables.RollTable.tblGone rollable]</p>" },
    { id: "pgNoText", name: "No Text", html: null },
  ],
};
const phbDocs = [...BOOKS[0].docs, ARTIFACTS].map(d => journal(PHB, d));
const c24Docs = [journal("dnd5e.content24", {
  id: "docSrd", name: "SRD Combat", pages: [{ id: "pgSrdCover", name: "Cover (SRD)", html: "<p>Half cover gives +2 to AC.</p>" }],
})];

// ── roll tables (resolved by fromUuid) ─────────────────────────────────────────

export const TABLES = {
  "Compendium.dnd-players-handbook.tables.RollTable.tblMinor": {
    name: "Minor Beneficial Properties",
    formula: "1d100",
    results: { contents: [
      { range: [1, 20], description: "<p>While attuned, you gain <strong>darkvision</strong>.</p>", name: "", text: "" },
      { range: [21, 21], description: "", name: "A single row", text: "" },
    ] },
  },
};

// ── monsters ───────────────────────────────────────────────────────────────────

function actor(packId, { id, name, cr, size, type, ac = 15, hp = 7, items = [], languages = [], walk = 30 }) {
  const a = {
    documentName: "Actor", id, name, type: "npc",
    uuid: `Compendium.${packId}.Actor.${id}`,
    system: {
      details: { cr, type: { value: type } },
      attributes: { ac: { value: ac }, hp: { max: hp }, movement: { walk } },
      traits: { size, languages: { value: new Set(languages) } },
    },
    getRollData: () => ({ actor: name }),
  };
  a.items = keyed(items.map((it, n) => ({ id: `${id}i${n}`, uuid: `${a.uuid}.Item.${id}i${n}`, ...it })), "id");
  return a;
}

const MM = "dnd-monster-manual.actors";
const mmActors = [
  actor(MM, { id: "mmGoblin", name: "Goblin", cr: 0.25, size: "sm", type: "humanoid", languages: ["common", "goblin"],
    items: [{ name: "Scimitar", type: "weapon", system: { description: { value: "<p>Melee: [[/attack]] to hit.</p>" } } }] }),
  actor(MM, { id: "mmBoss", name: "Goblin Boss", cr: 1, size: "sm", type: "humanoid", ac: 17, hp: 21,
    items: [
      { name: "Redirect Attack", type: "feat",
        system: { description: { value: "<p>The [[lookup @name]] swaps places: [[/attack]] , reach 5 ft .</p>" },
          activities: { contents: [{ activation: { type: "reaction" } }] },
          uses: { recovery: [{ period: "recharge", formula: "5" }] } },
        getRollData: () => ({ item: "Redirect Attack" }) },
      { name: "Multiattack", type: "feat", system: { description: { value: "<p>Two ( 2 ) attacks.</p>" }, activation: { type: "action" } } },
      { name: "Plain", type: "loot", system: {} },
    ] }),
  actor(MM, { id: "mmGuard", name: "Shield Guardian", cr: 7, size: "lg", type: "construct", ac: 17, hp: 142 }),
];
const mmIndex = [
  { _id: "mmGoblin", name: "Goblin", type: "npc", uuid: `Compendium.${MM}.Actor.mmGoblin`,
    system: { details: { cr: 0.25, type: { value: "humanoid", subtype: "goblinoid" } }, traits: { size: "sm" } } },
  { _id: "mmBoss", name: "Goblin Boss", type: "npc", uuid: `Compendium.${MM}.Actor.mmBoss`,
    system: { details: { cr: 1, type: { value: "humanoid", subtype: "goblinoid" } }, traits: { size: "sm" } } },
  { _id: "mmGuard", name: "Shield Guardian", type: "npc",                 // no uuid: the fallback builds it
    system: { details: { cr: 7, type: { value: "construct" } }, traits: { size: "lg" } } },
  { _id: "mmHero", name: "Sample Hero", type: "character",
    system: { details: { cr: 2, type: { value: "humanoid" } }, traits: { size: "med" } } },
];
const SRD_ACTORS = "dnd5e.actors24";
const srdIndex = [
  { _id: "srdGoblin", name: "Goblin", type: "npc", uuid: `Compendium.${SRD_ACTORS}.Actor.srdGoblin`,     // duplicate name: dropped
    system: { details: { cr: 0.25, type: { value: "humanoid" } }, traits: { size: "sm" } } },
  { _id: "srdOgre", name: "Ogre", type: "npc", uuid: `Compendium.${SRD_ACTORS}.Actor.srdOgre`,
    system: { details: { cr: 2, type: { value: "giant" } }, traits: { size: "lg" } } },
  { _id: "srdNoCr", name: "Mystery", type: "npc", uuid: `Compendium.${SRD_ACTORS}.Actor.srdNoCr`,
    system: { details: {}, traits: { size: "med" } } },
];

// ── spells and the dnd5e registry ──────────────────────────────────────────────

const SP = "dnd-players-handbook.spells";
const spell = (packId, id, name, level) => ({ documentName: "Item", id, name, uuid: `Compendium.${packId}.Item.${id}`, system: { level } });
const phbSpells = [spell(SP, "spFireball", "Fireball", 3), spell(SP, "spAid", "Aid", 2)];
const srdSpells = [spell("dnd5e.spells24", "spAid24", "Aid", 2), spell("dnd5e.spells24", "spLight24", "Light", 0)];
const spellIndex = docs => docs.map(d => ({ _id: d.id, name: d.name, system: { level: d.system.level } }));

export function spellRegistry() {
  const lists = {
    "class:wizard": {
      has: doc => doc.name === "Fireball",
      uuids: new Set([
        `Compendium.dnd5e.spells24.Item.spAid24`,
        `Compendium.${SP}.Item.spFireball`,
        `Compendium.${SP}.Item.spAid`,
        `Compendium.dnd5e.spells24.Item.spLight24`,
        "not-a-compendium-uuid",
      ]),
    },
    "class:cleric": { has: () => false, uuids: new Set([`Compendium.${SP}.Item.spAid`]) },
  };
  return {
    spellLists: {
      forType: (type, identifier) => lists[`${type}:${identifier}`],
      options: [{ value: "class:wizard", label: "Wizard" }, { value: "class:cleric", label: "Cleric" }],
    },
  };
}

// ── character-option packs (names()) ──────────────────────────────────────────

const classIndex = [
  { _id: "c1", name: "Wizard", type: "class", system: { identifier: "wizard" } },
  { _id: "c2", name: "Paladin", type: "class", system: { identifier: "paladin" } },
  { _id: "s1", name: "Life Domain", type: "subclass", system: { classIdentifier: "cleric" } },
  { _id: "s2", name: "Evoker", type: "subclass", system: { classIdentifier: "wizard" } },
  { _id: "s3", name: "Abjurer", type: "subclass", system: { classIdentifier: "wizard" } },
  { _id: "s4", name: "Orphan Path", type: "subclass", system: {} },
];
const originIndex = [
  { _id: "o1", name: "Elf, High", type: "race", system: {} },
  { _id: "o2", name: "Dwarf", type: "race", system: {} },
  { _id: "o3", name: "Sage", type: "background", system: {} },
];
const featIndex = [
  { _id: "f1", name: "Alert", type: "feat", system: { type: { value: "feat", subtype: "origin" } } },
  { _id: "f2", name: "Archery", type: "feat", system: { type: { value: "feat", subtype: "fightingStyle" } } },
  { _id: "f3", name: "Grappler", type: "feat", system: { type: { value: "feat", subtype: "" } } },
  { _id: "f4", name: "Not A Feat", type: "spell", system: {} },
];

// ── assembly ───────────────────────────────────────────────────────────────────

export function makePacks() {
  const list = [
    makePack(PHB, { label: "Player's Handbook", documentName: "JournalEntry", docs: phbDocs }),
    makePack("dnd5e.content24", { label: "SRD 5.2 Rules", documentName: "JournalEntry", docs: c24Docs }),
    makePack(MM, { label: "Monster Manual Actors", documentName: "Actor", docs: mmActors, index: mmIndex }),
    makePack(SRD_ACTORS, { label: "SRD 5.2 Actors", documentName: "Actor", docs: [], index: srdIndex }),
    makePack(SP, { label: "PHB Spells", documentName: "Item", docs: phbSpells, index: spellIndex(phbSpells) }),
    makePack("dnd5e.spells24", { label: "SRD 5.2 Spells", documentName: "Item", docs: srdSpells, index: spellIndex(srdSpells) }),
    makePack("dnd-players-handbook.classes", { label: "PHB Classes", documentName: "Item", index: classIndex }),
    makePack("dnd-players-handbook.origins", { label: "PHB Origins", documentName: "Item", index: originIndex }),
    makePack("dnd-players-handbook.feats", { label: "PHB Feats", documentName: "Item", index: featIndex }),
  ];
  return new Map(list.map(p => [p.collection, p]));
}

/** fromUuid over the fixture packs: pages, journal entries, actors, spells and TABLES. */
export function makeFromUuid(packs) {
  return async uuid => {
    const s = String(uuid);
    if (TABLES[s]) return TABLES[s];
    const m = /^Compendium\.([^.]+\.[^.]+)\.(JournalEntry|Actor|Item)\.([^.]+)(?:\.JournalEntryPage\.([^.]+))?$/.exec(s);
    if (!m) return null;
    const doc = await packs.get(m[1])?.getDocument(m[3]);
    if (!doc) return null;
    return m[4] ? doc.pages?.get(m[4]) ?? null : doc;
  };
}

/** Text enricher stand-in: `[[/attack]]` → "+4", `[[lookup @name]]` → the roll data's name. */
export function enrichStub(calls = []) {
  return async (html, opts) => {
    calls.push(opts);
    return String(html).replace(/\[\[\/attack\]\]/g, "+4").replace(/\[\[lookup @name\]\]/g, opts?.rollData?.actor ?? opts?.rollData?.item ?? "it");
  };
}

/**
 * Install the packs, fromUuid, dnd5e and the TextEditor on an installed stub `F`. Returns the
 * pieces a test may swap: `{ packs, enrichCalls }`.
 */
export function installLookupWorld(F) {
  const packs = makePacks();
  F.game.packs = packs;
  F.game.version = "14.369";
  globalThis.fromUuid = makeFromUuid(packs);
  globalThis.dnd5e = { registry: spellRegistry() };
  const enrichCalls = [];
  F.foundry.applications.ux = { TextEditor: { implementation: { enrichHTML: enrichStub(enrichCalls) } } };
  // selftest reads core's indexDocument SOURCE (not a patch): a stand-in with the v14.369 shape
  F.foundry.documents.collections = { CompendiumCollection: class CompendiumCollection {
    indexDocument(document) {
      const data = document.toObject?.() ?? {};
      for (const field of []) foundry.utils.setProperty({}, field, foundry.utils.getProperty(data, field));
    }
  } };
  return { packs, enrichCalls };
}
