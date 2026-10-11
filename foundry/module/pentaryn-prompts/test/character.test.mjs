/**
 * Characterisation (prompts checkpoint, wave 3): character.mjs — compendium lookup (findItem,
 * suggest, notFound; prompts-lookup-10's pool matcher and feat asymmetry), startingOptions, the
 * one-BAD_SPEC resolve, summarise, and the headless advancement run's choices (chooseData for
 * every advancement type) through a stepped AdvancementManager stand-in. The real dnd5e managers
 * are not modelled; what is pinned is what this file decides and passes to them.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addItemPack } from "./fixtures/world.mjs";
import { StubCollection, stubId } from "./kit/foundry-stub.mjs";
import { sameName } from "../build-core.mjs";

const F = await installWorld();
const U = foundry.utils;

/* the books: classes, origins, spells, equipment, plus a feats pack holding an equipment-typed "Tough" */
addItemPack(F, "dnd-players-handbook.classes", [
  { _id: "clWizard00000001", name: "Wizard", type: "class", system: { identifier: "wizard", advancement: [{ type: "Subclass", level: 3 }], primaryAbility: { value: ["int"] } } },
  { _id: "clFighter0000001", name: "Fighter", type: "class", system: { identifier: "fighter", advancement: [] } },
  { _id: "scEvoker00000001", name: "Evoker", type: "subclass", system: { classIdentifier: "wizard" } },
  { _id: "scChampion000001", name: "Champion", type: "subclass", system: { classIdentifier: "fighter" } }
]);
addItemPack(F, "dnd-players-handbook.origins", [
  { _id: "spcElf0000000001", name: "Elf", type: "race", system: { advancement: [{ type: "Size", title: "Size", configuration: { sizes: ["med", "sm"] } }] } },
  { _id: "spcTiefInfernal1", name: "Tiefling, Infernal", type: "race", system: { advancement: [] } },
  { _id: "bgSage0000000001", name: "Sage", type: "background", system: {} }
]);
addItemPack(F, "dnd-players-handbook.spells", [
  { _id: "spMagicMissile01", name: "Magic Missile", type: "spell", system: { level: 1 } },
  { _id: "spCureWounds0001", name: "Cure Wounds", type: "spell", system: { level: 1 } },
  { _id: "spFireBolt000001", name: "Fire Bolt", type: "spell", system: { level: 0 } }
]);
addItemPack(F, "dnd-players-handbook.equipment", [{ _id: "eqBook0000000001", name: "Book", type: "loot" }]);
addItemPack(F, "dnd-players-handbook.feats", [{ _id: "ftTough000000001", name: "Tough", type: "equipment" }]);
globalThis.dnd5e = { registry: { spellLists: { forType: (type, id) => (id === "wizard" ? { has: s => s.name !== "Cure Wounds" } : null) } } };
const C = await import("../character-adapter.mjs");

test("prompts-lookup-10: the pool match order (a pasted copy of character.mjs:214-216) over the finding's table", () => {
  const pool = ["Compendium.a.Item.1", "Compendium.a.Item.2"];
  const names = ["Divine Order: Protector", "Divine Order: Thaumaturge"];
  const tail = n => String(n).split(/:\s*/).pop();
  const pasted = w => (pool.indexOf(w) >= 0 ? pool.indexOf(w)
    : names.findIndex(n => sameName(n, w)) >= 0 ? names.findIndex(n => sameName(n, w))
      : names.findIndex(n => sameName(tail(n), w)));
  const table = [["Compendium.a.Item.2", 1], ["Protector", 0], ["thaumaturge", 1], ["Divine Order: Protector", 0], ["Order Divine: Protector", 0], ["Nope", -1]];
  for (const [w, want] of table) assert.equal(pasted(w), want, w);
});

test("prompts-lookup-10: findItem has no type filter for feats; suggest filters them (KNOWN asymmetry)", async () => {
  const tough = await C.findItem("Tough", "feat");
  assert.equal(tough.uuid, "Compendium.dnd-players-handbook.feats.Item.ftTough000000001");
  assert.equal(tough.type, "equipment");
  assert.deepEqual(await C.suggest("Tuff", "feat"), []);
});

test("findItem: a document passes through; a uuid resolves (or BAD_SPEC); names match any case and word order; kinds filter by type", async () => {
  const doc = { documentName: "Item", name: "x" };
  assert.equal(await C.findItem(doc, "item"), doc);
  assert.equal(await C.findItem(null, "item"), null);
  assert.equal((await C.findItem("Compendium.dnd-players-handbook.spells.Item.spFireBolt000001", "spell")).name, "Fire Bolt");
  await assert.rejects(C.findItem("Item.nope", "item"), { code: "BAD_SPEC", message: "BAD_SPEC: Item.nope is not an item" });
  assert.equal((await C.findItem("infernal tiefling", "race")).name, "Tiefling, Infernal");
  assert.equal((await C.findItem("  WIZARD ", "class")).name, "Wizard");
  assert.equal(await C.findItem("Evoker", "class"), null, "a subclass is not a class");
  assert.equal((await C.findItem("Evoker", "subclass")).name, "Evoker");
  assert.equal((await C.findItem("book", "item")).name, "Book");
  assert.equal(await C.findItem("Nothing", "item"), null);
  // the SRD packs are absent: skipped, not an error, and their missing index is cached
  assert.equal(F.calls.filter(c => c.op === "pack.getIndex" && c.pack === "dnd-players-handbook.classes").length, 1);
});

test("suggest / notFound: nearest names from the packs a kind searches", async () => {
  assert.deepEqual(await C.suggest("Wizzard", "class"), ["Wizard"]);
  assert.deepEqual(await C.suggest("Magic Misile", "spell", 1), ["Magic Missile"]);
  assert.equal(await C.notFound("class", "Wizzard", "class"), "no class \"Wizzard\" in dnd-players-handbook.classes, dnd5e.classes24 — nearest: \"Wizard\"");
  assert.equal(await C.notFound("item", "Spellbook", "item", "; hint"), "no item \"Spellbook\" in dnd-players-handbook.equipment, dnd5e.equipment24 — nearest: \"Book\"; hint");
  assert.equal(await C.notFound("thing", "zzzz", "nokind"), "no thing \"zzzz\" in dnd-players-handbook.equipment, dnd5e.equipment24");
});

test("startingOptions: A gear, B gold, none, per book, or a problem", () => {
  const rows = [undefined, null, false, true, "a", "B", "none", "NONE", "x", { class: "A" }, { background: "b" }, { class: "A", extra: 1 }, { class: "Q" }, []];
  pinJSON("starting-options", rows.map(v => [v === undefined ? "<undefined>" : v, C.startingOptions(v)]), import.meta.url);
  assert.equal(C.CHARACTER_FOLDER, "Foundry MCP Characters");
});

const ARRAY = { str: 8, dex: 14, con: 13, int: 15, wis: 12, cha: 10 };

test("resolveCharacter: every problem in one BAD_SPEC (golden character-problems)", async () => {
  const cases = [
    { level: 0, abilities: { str: 1 } },
    { name: "A", class: "Wizzard", species: "Elf", background: "Sage", abilities: ARRAY },
    { name: "B", class: "Wizard", species: "Elf", background: "Sage", abilities: ARRAY, level: 3 },
    { name: "C", class: "Wizard", subclass: "Champion", species: "Elf", background: "Sage", abilities: ARRAY, level: 3,
      spells: ["Cure Wounds", "Magic Misile"], items: ["Grappling hook", { data: { name: "x" } }], startingEquipment: "C", choices: { "Bogus: Thing": 1 } },
    { name: "D", class: "Wizard", species: "Elfish", background: "Sage", abilities: ARRAY, choices: { "Elf: Thing": 1 } }
  ];
  const out = [];
  for (const w of cases) {
    const err = await C.resolveCharacter(w).then(() => null, e => e);
    out.push({ w, code: err?.code ?? null, message: err?.message ?? null });
  }
  pinJSON("character-problems", out, import.meta.url);
});

test("resolveCharacter: a clean spec resolves its books, size, spells, gear and starting options (golden character-resolved)", async () => {
  const r = await C.resolveCharacter({ name: "Ilsa", class: "wizard", subclass: "Evoker", species: "Elf", background: "Sage", level: 3, abilities: ARRAY,
    size: "small", spells: ["Magic Missile"], spellbook: ["Fire Bolt"], allowOffList: false,
    items: ["Book", { data: { name: "Amulet", type: "equipment", system: { description: { value: "requires attunement" } } }, quantity: 1 }],
    startingEquipment: { class: "B", background: "A" } });
  const name = d => d?.name ?? null;
  pinJSON("character-resolved", { docs: Object.fromEntries(Object.entries(r.docs).map(([k, v]) => [k, name(v)])), level: r.level, abilities: r.abilities,
    size: r.size, warnings: r.warnings, planWarnings: r.planWarnings, defaults: r.defaults,
    spells: { prepared: r.spells.prepared.map(name), book: r.spells.book.map(name) }, gear: r.gear.map(g => ({ spec: g.spec, src: name(g.src), data: g.data ?? null })),
    starting: r.starting }, import.meta.url);
  const fighter = await C.resolveCharacter({ name: "Off", class: "Fighter", species: "Elf", background: "Sage", abilities: ARRAY, spellbook: ["Magic Missile"], size: "huge" });
  // "huge" is no species size word: no size asked, no warning; a non-wizard's spellbook is a warning
  assert.deepEqual([fighter.size, fighter.warnings], ["med", ["spellbook given for a Fighter; only a wizard keeps one (added unprepared)"]]);
  const tooBig = await C.resolveCharacter({ name: "Big", class: "Fighter", species: "Elf", background: "Sage", abilities: ARRAY, size: "large" });
  assert.deepEqual([tooBig.size, tooBig.warnings], ["med", ["Elf cannot be lg; using med"]]);
});

/* ── the headless build: a stepped AdvancementManager stand-in ─────────── */

const applied = [];
const SLOT_KEYS = ["spell1", "pact"];
class FakeActor {
  static async create(data) { return new FakeActor(data); }
  constructor(data) {
    this.id = data._id ?? stubId("act");
    this.name = data.name;
    this.type = data.type;
    this._source = { system: U.deepClone(data.system ?? {}), items: U.deepClone(data.items ?? []) };
    this.writes = [];
    this.reset();
  }
  reset() {
    const src = this._source.system;
    const sys = U.deepClone(src);
    sys._source = src;
    const items = this._source.items.map(i => ({ ...U.deepClone(i), id: i._id }));
    this.items = new StubCollection(items);
    const cls = items.find(i => i.type === "class");
    sys.spells = Object.fromEntries(SLOT_KEYS.map(k => [k, { value: src.spells?.[k]?.value ?? 0, max: 0, level: 1, type: "leveled" }]));
    sys.abilities = Object.fromEntries(Object.entries(src.abilities ?? {}).map(([k, v]) => [k, { value: v.value, proficient: 0 }]));
    sys.details = { ...(src.details ?? {}), level: cls?.system.levels ?? 0, race: items.find(i => i.id === src.details?.race) ?? null,
      background: items.find(i => i.id === src.details?.background) ?? null };
    sys.attributes = { ...(src.attributes ?? {}), hp: { max: 20, value: 0 }, ac: { value: 12 }, prof: 2, spell: { dc: 13 }, spellcasting: src.attributes?.spellcasting ?? "",
      movement: { walk: 30 }, senses: { ranges: { darkvision: 60 } } };
    sys.skills = { arc: { value: 1 }, his: { value: 2 }, ath: { value: 0 } };
    sys.traits = { size: "sm", languages: { value: new Set(["common"]) } };
    sys.scale = {};
    sys.tools = {};
    sys.currency = {};
    this.system = sys;
  }
  updateSource(changes) { U.mergeObject(this._source, U.expandObject(changes)); }
  async update(changes) { this.writes.push(changes); this.updateSource(changes); this.reset(); return this; }
  toObject() { return { name: this.name, type: this.type, system: U.deepClone(this._source.system), items: U.deepClone(this._source.items) }; }
  async createEmbeddedDocuments(type, data) { this._source.items.push(...U.deepClone(data)); this.reset(); return data; }
  async performBulkUpdate({ actor, create = [], delete: del = [], item = [] }) {
    this._source.system = U.deepClone(actor.system);
    this._source.items = [...this._source.items.filter(i => !del.includes(i._id)).map(i => item.find(u => u._id === i._id) ?? i), ...create];
    this.reset();
  }
  async delete() { this.deleted = true; }
}

/** An advancement stand-in: records apply(level, data); answers automaticApplicationValue / unfulfilledChoices. */
function adv(type, title, { configuration = {}, auto = false, available = [], actor = null } = {}) {
  return {
    type, title, configuration,
    actor: actor ?? { system: { _source: { abilities: { str: { value: 8 }, dex: { value: 14 }, con: { value: 13 }, int: { value: 15 }, wis: { value: 12 }, cha: { value: 10 } } } } },
    automaticApplicationValue: async () => auto,
    unfulfilledChoices: async () => ({ available }),
    apply: async (level, data) => { applied.push([title, level, F.plain(data)]); }
  };
}
const set = xs => new Set(xs);   // Foundry's primitives give Set#first
const choice = keys => ({ asSet: () => new Set(keys) });

/** Steps per item name; the manager adds the item to a clone and runs these steps. */
const STEPS = {
  Elf: () => [
    [adv("Size", "Size"), 0],
    [adv("Trait", "Elven Lineage Languages", { auto: { chosen: ["languages:standard:common"] },
      available: [{ choices: choice(["languages:standard:elvish", "languages:standard:dwarvish", "languages:standard:common", "languages:exotic:sylvan"]) }] }), 0]
  ],
  Sage: () => [
    [adv("AbilityScoreImprovement", "Ability Score Increase", { configuration: { points: 3, cap: 2, locked: set(["str"]) } }), 0],
    [adv("Trait", "Skills", { auto: { chosen: ["skills:arc", "skills:his"] }, available: [] }), 0],
    [adv("ItemGrant", "Origin Feat", { auto: { "Compendium.x.Item.feat": "feat" } }), 0]
  ],
  Wizard: () => [
    [adv("HitPoints", "Hit Points"), 1, { isOriginalClass: true }],
    [adv("HitPoints", "Hit Points"), 2],
    [adv("HitPoints", "Hit Points"), 3],
    [adv("ScaleValue", "Cantrips Known"), 1],
    [adv("ItemChoice", "Cantrips", { configuration: { choices: { 1: { count: 2 } }, pool: [{ uuid: "Compendium.p.Item.a" }, { uuid: "Compendium.p.Item.b" }, { uuid: "Compendium.p.Item.c" }],
      spell: { ability: set(["int"]) } } }), 1],
    [adv("ItemChoice", "Arcane Recovery Pick", { configuration: { choices: { 2: { count: 1 } }, pool: [{ uuid: "Compendium.p.Item.a" }, { uuid: "Compendium.p.Item.b" }] } }), 2],
    [adv("ItemChoice", "Magic Initiate", { configuration: { type: "spell", choices: { 1: { count: 2 } }, pool: [], restriction: { list: set(["class:wizard"]) }, spell: { ability: set(["int", "wis"]) } } }), 1],
    [adv("ItemChoice", "Bonus Spell", { configuration: { type: "spell", choices: { 1: { count: 1 } }, pool: [] } }), 1],
    [adv("ItemChoice", "Nothing at 1", { configuration: { choices: {} } }), 1],
    [adv("ItemGrant", "Spellbook Grant", { configuration: { items: [{ uuid: "u1" }, { uuid: "u2", optional: true }], spell: { ability: set(["int", "wis"]) } } }), 1],
    [adv("ItemGrant", "Chosen Grant", { configuration: { items: [{ uuid: "Compendium.p.Item.a" }, { uuid: "Compendium.p.Item.b" }] } }), 2],
    [adv("Subclass", "Arcane Tradition"), 3],
    [adv("AbilityScoreImprovement", "Ability Score Improvement", { configuration: { points: 2, cap: 2 } }), 3],
    [adv("Custom", "Mystery"), 3],
    [adv("Custom", "Answered"), 3],
    [adv("Custom", "Automatic", { auto: { x: 1 } }), 3]
  ]
};

function stage() {
  const pool = { "Compendium.p.Item.a": "Spell: Light", "Compendium.p.Item.b": "Spell: Mage Hand", "Compendium.p.Item.c": "Spell: Prestidigitation" };
  const prev = globalThis.fromUuidSync;
  globalThis.fromUuidSync = u => (pool[u] ? { name: pool[u] } : prev(u));
  const AdvancementManager = {
    forNewItem(actor, itemData) {
      const clone = new FakeActor({ _id: actor.id, name: actor.name, type: actor.type, system: U.deepClone(actor._source.system),
        items: [...U.deepClone(actor._source.items), { ...U.deepClone(itemData), _id: itemData._id ?? stubId("itm") }] });
      const steps = (STEPS[itemData.name]?.() ?? []).map(([a, level, item = {}]) => ({ type: "forward", flow: { advancement: a, level, item: { name: itemData.name, ...item } } }));
      return { steps, clone };
    }
  };
  const saved = { Actor: globalThis.Actor };
  globalThis.Actor = { implementation: FakeActor };
  globalThis.dnd5e.applications = { advancement: { AdvancementManager } };
  F.CONFIG.DND5E = { focusTypes: { arcane: { label: "Arcane Focus", itemIds: { crystal: "Compendium.dnd5e.items.Item.crystal" } } } };
  F.CONFIG.Item = { documentClass: {} };
  F.game.items.fromCompendium = doc => U.deepClone({ name: doc.name, type: doc.type, system: doc.system ?? {} });
  F.game.folders.set("folderChars00001", { id: "folderChars00001", name: "Foundry MCP Characters", type: "Actor" });
  return () => { globalThis.Actor = saved.Actor; globalThis.fromUuidSync = prev; };
}

test("the headless build: what chooseData gives each advancement, and the report (golden character-build)", async () => {
  const unstage = stage();
  try {
    const w = { name: "Ilsa", class: "Wizard", subclass: "Evoker", species: "Elf", background: "Sage", level: 3, abilities: ARRAY, hp: "avg",
      choices: { "Wizard: Hit Points@3": "max", "Wizard: Cantrips": ["Mage Hand", "Nope"], "Wizard: Magic Initiate": { spells: ["Fire Bolt", "Magic Missile"], ability: "wis" },
        "Wizard: Chosen Grant": ["Mage Hand"], "Wizard: Answered": { picked: true }, "Ability Score Improvement@3": { int: 1, dex: 1 },
        "Elf: Elven Lineage Languages": ["Elvish", "Klingon"], "Unused Key": 1 },
      spells: ["Magic Missile"], spellbook: ["Fire Bolt", "Fire Bolt"], items: ["Book"] };
    const resolved = { docs: { species: { name: "Elf", system: {} }, background: { name: "Sage", system: {} },
      cls: { name: "Wizard", type: "class", system: { identifier: "wizard", levels: 1, primaryAbility: { value: ["int"] } } },
      subclass: { name: "Evoker", uuid: "Compendium.dnd-players-handbook.classes.Item.scEvoker00000001" } },
      level: 3, abilities: ARRAY, size: "sm", defaults: ["from resolve"], warnings: ["resolve warning"],
      spells: { prepared: [await C.findItem("Magic Missile", "spell")], book: [await C.findItem("Fire Bolt", "spell")] },
      gear: [{ spec: { name: "Book" }, src: await C.findItem("Book", "item") }], starting: { class: "none", background: "none" } };
    applied.length = 0;
    const pre = await C.previewCharacter(w, resolved);
    const preApplied = [...applied];
    applied.length = 0;
    const { actor, report } = await C.buildCharacter(w, resolved, { prov: { markerId: "m1" } });
    const scrub = v => JSON.parse(JSON.stringify(v).replace(/\b\d{16}\b/g, "<id>"));
    pinJSON("character-build", scrub({ preview: { applied: preApplied, report: pre }, real: { applied, report, writes: actor.writes,
      items: actor._source.items.map(i => [i.name, i.type, i.system?.prepared ?? null, i.system?.sourceItem ?? null]) } }), import.meta.url);
    assert.deepEqual(preApplied, applied, "the dry run's preview steps exactly as the real run");
  } finally {
    unstage();
  }
});

test("the headless build: an ASI naming a missing feat, an ASI breaking its cap, and a missing subclass are BAD_SPEC; the half-built actor is deleted", async () => {
  const unstage = stage();
  try {
    const base = { docs: { species: { name: "Elf", system: {} }, background: { name: "Sage", system: {} },
      cls: { name: "Wizard", type: "class", system: { identifier: "wizard", levels: 1 } }, subclass: { uuid: "S" } },
      level: 3, abilities: ARRAY, size: "sm", warnings: [], spells: { prepared: [], book: [] }, gear: [], starting: null };
    const bad = [
      [{ name: "X", choices: { "Ability Score Improvement@3": { feat: "Nonexistent" } } }, "BAD_SPEC: Wizard: Ability Score Improvement (level 3): no feat \"Nonexistent\""],
      [{ name: "X", choices: { "Sage: Ability Score Increase": { str: 2, int: 1 } } }, "BAD_SPEC: Sage: Ability Score Increase: not allowed by this advancement: str (allowed: dex, con, int, wis, cha)"],
      [{ name: "X" }, "BAD_SPEC: Wizard: Arcane Tradition (level 3): no subclass given"]
    ];
    for (const [w, msg] of bad) {
      let made = null;
      const create = FakeActor.create;
      FakeActor.create = async d => (made = new FakeActor(d));
      const r = w.choices ? base : { ...base, docs: { ...base.docs, subclass: null } };
      await assert.rejects(C.buildCharacter(w, r), { code: "BAD_SPEC", message: msg });
      FakeActor.create = create;
      assert.equal(made.deleted, true);
    }
    // an ASI given as a feat that exists: the feat's uuid
    applied.length = 0;
    STEPS.Tough = () => [];
    await C.previewCharacter({ name: "Y", choices: { "Ability Score Improvement@3": { feat: "Tough" } } }, base);
    assert.deepEqual(applied.find(a => a[0] === "Ability Score Improvement"), ["Ability Score Improvement", 3, { type: "feat", uuid: "Compendium.dnd-players-handbook.feats.Item.ftTough000000001" }]);
  } finally {
    unstage();
  }
});

test("summarise: the reviewer's numbers from an actor", () => {
  const actor = {
    system: {
      abilities: { str: { value: 8, proficient: 0 }, dex: { value: 14, proficient: 0 }, con: { value: 13, proficient: 0 }, int: { value: 16, proficient: 1 }, wis: { value: 12, proficient: 1 }, cha: { value: 10, proficient: 0 } },
      details: { level: 3, race: { name: "Elf" }, background: { name: "Sage" } },
      attributes: { hp: { max: 17 }, ac: { value: 12 }, prof: 2, spell: { dc: 13 }, spellcasting: "int", movement: { walk: 30 }, senses: { darkvision: 60 } },
      skills: { arc: { value: 2 }, his: { value: 1 }, ath: { value: 0 } }, traits: { size: "med", languages: { value: new Set(["common", "elvish"]) } },
      scale: { wizard: { "max-prepared": { value: 6 }, "cantrips-known": { value: 3 } } },
      spells: { spell1: { value: 4, max: 4, level: 1, type: "leveled" }, spell2: { value: 0, max: 2, level: 2, type: "leveled" }, spell3: { value: 0, max: 0, level: 3 } }
    },
    items: new StubCollection([
      { id: "c", name: "Wizard", type: "class", system: { identifier: "wizard", levels: 3, spellcasting: { progression: "full" } } },
      { id: "s", name: "Evoker", type: "subclass", system: {} },
      { id: "f1", name: "Alert", type: "feat", system: { type: { value: "feat" } } },
      { id: "f2", name: "Arcane Recovery", type: "feat", system: { type: { value: "class" } } },
      { id: "sp1", name: "Fire Bolt", type: "spell", system: { level: 0, prepared: 1, sourceItem: "class:wizard" } },
      { id: "sp2", name: "Light", type: "spell", system: { level: 0, prepared: 2, sourceItem: "race:elf" } },
      { id: "sp3", name: "Magic Missile", type: "spell", system: { level: 1, prepared: 1 } },
      { id: "sp4", name: "Shield", type: "spell", system: { level: 1, prepared: 0 } },
      { id: "sp5", name: "Detect Magic", type: "spell", system: { level: 1, prepared: 2 } }
    ])
  };
  pinJSON("character-summary", C.summarise(actor), import.meta.url);
  const fighter = { ...actor, items: new StubCollection([{ id: "c", name: "Fighter", type: "class", system: { identifier: "fighter", levels: 3, spellcasting: { progression: "none" } } }]),
    system: { ...actor.system, attributes: { ...actor.system.attributes, spell: undefined, spellcasting: "", senses: { ranges: { darkvision: 0 } } }, spells: {} } };
  const s = C.summarise(fighter);
  assert.deepEqual([s.spellCounts, s.spellDC, s.spellAbility, s.darkvision, s.slots, s.subclass], [null, null, null, 0, [], null]);
});
