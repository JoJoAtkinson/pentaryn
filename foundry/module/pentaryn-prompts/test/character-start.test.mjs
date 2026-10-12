/**
 * Characterisation (prompts checkpoint, wave 3): the rest of character.mjs — the dry run's check of
 * choice VALUES against what each advancement offers (collectAdvancements: pools, ASIs, pool-less
 * feat and spell choices, granted items), steps synthesised for an item a step granted, starting
 * equipment (linked gear, OR groups, focus / tool / weapon / armor categories, gold, a container
 * with its contents), Martial Arts' enchantments, and a `character` replacement end to end through
 * replace.mjs. dnd5e's managers are stand-ins; what is pinned is what this module decides.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addItemPack, captureConsole, token, MODULE } from "./fixtures/world.mjs";
import { StubCollection, stubId } from "./kit/foundry-stub.mjs";

const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const U = foundry.utils;
const EQ = "dnd-players-handbook.equipment";
const eq = id => `Compendium.${EQ}.Item.${id}`;
const CL = id => `Compendium.dnd-players-handbook.classes.Item.${id}`;

addItemPack(F, "dnd-players-handbook.classes", [
  { _id: "clCleric00000001", name: "Cleric", type: "class", system: { identifier: "cleric", advancement: [
    { type: "ItemChoice", title: "Divine Order", configuration: { choices: { 1: { count: 1 } }, pool: [{ uuid: CL("featProtector001") }, { uuid: CL("featThaum0000001") }] } },
    { type: "AbilityScoreImprovement", title: "Ability Score Improvement", level: 4, configuration: { points: 2, cap: 2 } },
    { type: "ItemChoice", title: "Blessed Strikes", configuration: { type: "feat", choices: { 1: { count: 1 } }, pool: [] } },
    { type: "ItemChoice", title: "Magic Initiate", configuration: { type: "spell", choices: { 1: { count: 2 } }, pool: [], restriction: { list: new Set(["class:cleric", "class:druid"]) } } },
    { type: "ItemGrant", title: "Granted", level: 1, configuration: { items: [{ uuid: CL("featThaum0000001") }, { uuid: "Compendium.nope.Item.gone" }] } },
    { type: "Subclass", title: "Domain", level: 3 },
    { type: "HitPoints", title: "Hit Points", levels: [1, 2, 3, 4, 5] }
  ] } },
  { _id: "featProtector001", name: "Divine Order: Protector", type: "feat", system: { advancement: [{ type: "Trait", title: "Protector Training", level: 1 }] } },
  { _id: "featThaum0000001", name: "Divine Order: Thaumaturge", type: "feat", system: {} },
  { _id: "featTough0000001", name: "Tough", type: "feat", system: {} },
  { _id: "scLife0000000001", name: "Life Domain", type: "subclass", system: { classIdentifier: "cleric" } },
  { _id: "clMonk0000000001", name: "Monk", type: "class", system: { identifier: "monk", advancement: [] } }
]);
addItemPack(F, "dnd-players-handbook.origins", [
  { _id: "spcDwarf00000001", name: "Dwarf", type: "race", system: { advancement: [] } },
  { _id: "bgAcolyte0000001", name: "Acolyte", type: "background", system: { advancement: [{ type: "AbilityScoreImprovement", title: "Ability Score Increase", configuration: { points: 3 } }] } }
]);
addItemPack(F, "dnd-players-handbook.spells", [{ _id: "spGuidance000001", name: "Guidance", type: "spell", system: { level: 0 } }]);
addItemPack(F, EQ, [
  { _id: "eqPriestPack0001", name: "Priest's Pack", type: "container", system: {} },
  { _id: "crystal000000001", name: "Crystal", type: "equipment", system: {} },
  { _id: "toolDice00000001", name: "Dice Set", type: "tool", system: { type: { value: "gaming" } } },
  { _id: "toolLute00000001", name: "Lute", type: "tool", system: { type: { value: "music" } } },
  { _id: "wpnSpear00000001", name: "Spear", type: "weapon", system: { type: { value: "simpleM" } } },
  { _id: "wpnStaff00000001", name: "Quarterstaff", type: "weapon", system: { type: { value: "simpleM" } } }
]);
addItemPack(F, "dnd-players-handbook.feats", [{ _id: "ftAlert000000001", name: "Alert", type: "feat", system: {} }]);
globalThis.dnd5e = { registry: { spellLists: { forType: () => null } } };
const C = await import("../character-adapter.mjs");
const R = await import("../replace.mjs");

const ARRAY = { str: 8, dex: 14, con: 13, int: 10, wis: 15, cha: 12 };

test("resolveCharacter checks choice values against each advancement (golden character-choice-values)", async () => {
  const base = { name: "Bryn", class: "Cleric", subclass: "Life Domain", species: "Dwarf", background: "Acolyte", level: 4, abilities: ARRAY };
  const rows = [];
  for (const choices of [
    { "Cleric: Divine Order": "Protectr", "Ability Score Improvement@4": { feat: "Toughh" }, "Cleric: Blessed Strikes": "Nope", "Cleric: Magic Initiate": ["Guidance", "Zap"] },
    { "Cleric: Divine Order": "Thaumaturge", "Ability Score Improvement@4": [1], "Acolyte: Ability Score Increase": { str: 3 } },
    { "Cleric: Divine Order": "Protector", "Ability Score Improvement@4": { feat: "Tough" }, "Cleric: Blessed Strikes": "Alert", "Cleric: Magic Initiate": { spells: ["Guidance"] },
      "Divine Order: Protector: Protector Training": ["x"] },
    {}
  ]) {
    const r = await C.resolveCharacter({ ...base, choices }).then(v => ({ planWarnings: v.planWarnings, warnings: v.warnings }), e => ({ code: e.code, message: e.message }));
    rows.push({ choices, ...r });
  }
  pinJSON("character-choice-values", rows, import.meta.url);
});

/* ── the build stand-in: a FakeActor and a stepped manager ──────────────── */

const applied = [];
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
    sys.spells = {};
    sys.abilities = Object.fromEntries(Object.entries(src.abilities ?? {}).map(([k, v]) => [k, { value: v.value, proficient: 0 }]));
    sys.details = { ...(src.details ?? {}), level: cls?.system.levels ?? 0, race: items.find(i => i.id === src.details?.race) ?? null,
      background: items.find(i => i.id === src.details?.background) ?? null };
    sys.attributes = { ...(src.attributes ?? {}), hp: { max: 30, value: 0 }, ac: { value: 14 }, prof: 2, spell: { dc: 12 }, spellcasting: src.attributes?.spellcasting ?? "",
      movement: { walk: 40 }, senses: { ranges: {} } };
    sys.skills = {};
    sys.traits = { size: "med", languages: { value: new Set() } };
    sys.scale = {};
    sys.tools = { dice: { value: 1 } };
    sys.currency = { gp: Number(src.currency?.gp ?? 0) };
    this.system = sys;
  }
  updateSource(changes) { U.mergeObject(this._source, U.expandObject(changes)); }
  async update(changes) { this.writes.push(changes); this.updateSource(changes); this.reset(); return this; }
  toObject() { return { name: this.name, type: this.type, system: U.deepClone(this._source.system), items: U.deepClone(this._source.items) }; }
  async createEmbeddedDocuments(type, data, opts) { applied.push(["createEmbeddedDocuments", data.map(d => d.name), opts]); this._source.items.push(...U.deepClone(data)); this.reset(); return data; }
  async performBulkUpdate({ actor, create = [], delete: del = [], item = [] }) {
    this._source.system = U.deepClone(actor.system);
    this._source.items = [...this._source.items.filter(i => !del.includes(i._id)).map(i => item.find(u => u._id === i._id) ?? i), ...create];
    this.reset();
  }
  async delete() { this.deleted = true; }
  async getTokenDocument(pos) {
    const data = { _id: "tdKo000000000001", name: this.name, actorId: this.id, x: pos.x, y: pos.y, width: 1, height: 1, actorLink: true, disposition: 1, texture: { src: "ko.webp" }, flags: {} };
    return { toObject: () => structuredClone(data) };
  }
}

function adv(type, title, extra = {}) {
  return { type, title, configuration: {}, automaticApplicationValue: async () => false, unfulfilledChoices: async () => ({ available: [] }),
    actor: { system: { _source: { abilities: {} } } }, apply: async (level, data) => { applied.push([title, level, F.plain(data)]); }, ...extra };
}

function stage() {
  const M = {
    forNewItem(actor, itemData) {
      const clone = new FakeActor({ _id: actor.id, name: actor.name, type: actor.type, system: U.deepClone(actor._source.system),
        items: [...U.deepClone(actor._source.items), { ...U.deepClone(itemData), _id: itemData._id ?? stubId("itm") }] });
      const steps = [];
      if (itemData.type === "class") {
        // level 1: a grant that puts an item with its own advancements on the clone; level 2: hit points
        steps.push({ type: "forward", flow: { level: 1, item: { name: itemData.name }, advancement: adv("ItemGrant", "Ki Features", {
          automaticApplicationValue: async () => ({ granted: true }),
          apply: async (level, data) => {
            applied.push(["Ki Features", level, F.plain(data)]);
            clone._source.items.push({ _id: "grantedKi0000001", name: "Ki", type: "feat", hasAdvancement: true, system: { advancementClassLinked: false } });
            clone.reset();
            for (const i of clone.items) if (i.id === "grantedKi0000001") i.hasAdvancement = true;
          } }) } });
        steps.push({ type: "forward", flow: { level: 2, item: { name: itemData.name }, advancement: adv("HitPoints", "Hit Points") } });
        steps.push({ type: "reverse" });
      }
      return { steps, clone };
    },
    flowsForLevel(item, level) {
      return level === 1 ? [{ level, item: { name: item.name }, advancement: adv("Custom", "Ki Points", { automaticApplicationValue: async () => ({ points: 2 }) }) }] : [];
    }
  };
  const saved = { Actor: globalThis.Actor };
  globalThis.Actor = { implementation: FakeActor };
  globalThis.dnd5e.applications = { advancement: { AdvancementManager: M } };
  F.CONFIG.DND5E = {
    focusTypes: { arcane: { label: "Arcane Focus", itemIds: { crystal: "Compendium.dnd5e.items.Item.crystal000000001", orb: "Compendium.dnd5e.items.Item.orb" } }, holy: { label: "Holy Symbol", itemIds: {} } },
    tools: { dice: { id: eq("toolDice00000001") }, lute: { id: eq("toolLute00000001") } },
    toolTypes: { gaming: { label: "Gaming Set" }, music: "Musical Instrument" },
    weaponIds: { spear: "Compendium.dnd5e.equipment24.Item.wpnSpear00000001" }, armorIds: {}
  };
  F.CONFIG.Item = { documentClass: { createWithContents: async ([src]) => [{ ...F.game.items.fromCompendium(src), _id: "packTop000000001" },
    { name: "Candle", type: "loot", _id: "packIn0000000001", system: { container: "packTop000000001", quantity: 10 } }] } };
  const fc = F.game.items.fromCompendium;
  F.game.items.fromCompendium = doc => ({ ...fc(doc), ...(doc.spellcasting ? { spellcasting: doc.spellcasting } : {}) });
  F.game.folders.set("folderTestSet001", { id: "folderTestSet001", name: "Test Set", type: "Actor" });
  return () => { globalThis.Actor = saved.Actor; F.game.items.fromCompendium = fc; };
}

const START = [
  { _id: "a", type: "linked", key: eq("wpnSpear00000001"), count: 1, sort: 1 },
  { _id: "o", type: "OR", sort: 2 }, { _id: "o1", group: "o", type: "tool", key: "gaming", sort: 1 }, { _id: "o2", group: "o", type: "tool", key: "music", sort: 2 },
  { _id: "f", type: "focus", key: "arcane", sort: 3 }, { _id: "f2", type: "focus", key: "holy", sort: 4 },
  { _id: "w", type: "weapon", key: "spear", sort: 5 }, { _id: "w2", type: "weapon", key: "martialM", sort: 6 }, { _id: "ar", type: "armor", sort: 7 },
  { _id: "t", type: "tool", key: "lute", sort: 8 }, { _id: "x", type: "vehicle", key: "cart", sort: 9 },
  { _id: "l2", type: "linked", key: "Compendium.nope.Item.missing", sort: 10 }, { _id: "c", type: "currency", key: "gp", count: 5, sort: 11 },
  { _id: "pp", type: "linked", key: eq("eqPriestPack0001"), count: 2, sort: 12 }
];

async function monk() {
  const w = { name: "Ko", class: "Monk", species: "Dwarf", background: "Acolyte", level: 2, abilities: ARRAY, folder: "Test Set",
    items: ["Quarterstaff", { data: { name: "Martial Arts", type: "feat", system: { identifier: "martial-arts" } } }] };
  const enchants = [];
  const act = { type: "enchant", availableEnchantments: [{ _id: "enchDex000000001" }], canEnchant: i => ["Quarterstaff", "Spear"].includes(i.name),
    applyEnchantment: async (profile, item) => { enchants.push([profile, item.name]); if (item.name === "Spear") throw new Error("no slot"); return true; } };
  const resolved = await C.resolveCharacter({ ...w, startingEquipment: { class: "A", background: "B" } });
  resolved.docs.cls = { ...resolved.docs.cls, system: { ...resolved.docs.cls.system, startingEquipment: START, wealth: "5d4" }, spellcasting: { ability: "wis" } };
  resolved.docs.background = { ...resolved.docs.background, system: { ...resolved.docs.background.system, wealth: "50" } };
  resolved.gear[1].data.system.activities = [act];
  return { w, resolved, enchants };
}

test("the build: synthesised steps for a granted item, starting equipment A + B, a packed container, Martial Arts (golden character-start)", async () => {
  const unstage = stage();
  try {
    const { w, resolved, enchants } = await monk();
    applied.length = 0;
    const pre = await C.previewCharacter(w, resolved);
    const preApplied = [...applied];
    applied.length = 0;
    const { actor, report } = await C.buildCharacter(w, resolved, {});
    const scrub = v => JSON.parse(JSON.stringify(v).replace(/\b\d{16}\b/g, "<id>").replace(/"_id":"[A-Za-z0-9]{16}"/g, '"_id":"<rid>"'));
    pinJSON("character-start", scrub({ preview: { applied: preApplied, report: pre }, real: { applied, report, enchants, writes: actor.writes,
      items: actor._source.items.map(i => [i.name, i.type, i.system?.quantity ?? null, i.system?.container ?? null]), folder: F.calls.filter(c => c.op === "Folder.create").length } }), import.meta.url);
  } finally {
    unstage();
  }
});

test("a character replacement: the dry run's preview plan and the real run's token (golden replace-character)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: 1760000000000 });
  const unstage = stage();
  try {
    const m = token({ id: "pc", name: "Prompt · mid", actorId: "markerActormid00", x: 400, y: 400, width: 1, height: 1, hidden: true,
      flags: { [MODULE]: { marker: "mid", prompt: "our monk" } } }, F.s1);
    m.collection = F.s1.tokens;
    F.s1.tokens.set("pc", m);
    const spec = { sceneId: "s1", markerId: "pc", with: { kind: "character", name: "Ko", class: "Monk", species: "Dwarf", background: "Acolyte", level: 2, abilities: ARRAY,
      choices: { "Monk: Nope": 1 } } };
    const bad = await captureConsole(() => R.replaceMany({ replacements: [spec], dryRun: true }));
    delete spec.with.choices;
    const dry = await captureConsole(() => R.replaceMany({ replacements: [spec], dryRun: true }));
    // a placement that throws an uncoded error: CREATE_FAILED, the new actor discarded
    const getTD = FakeActor.prototype.getTokenDocument;
    delete FakeActor.prototype.getTokenDocument;
    const broken = await captureConsole(() => R.replaceMany({ replacements: [spec] }));
    FakeActor.prototype.getTokenDocument = getTD;
    const real = await captureConsole(() => R.replaceMany({ replacements: [{ ...spec, ring: "pc" }] }));
    const scrub = v => JSON.parse(JSON.stringify(v).replace(/\b\d{16}\b/g, "<id>"));
    const created = F.calls.filter(c => c.op === "createEmbeddedDocuments" && c.type === "Token").at(-1);
    pinJSON("replace-character", scrub({ bad: bad.value.text.split("\n"), dry: dry.value.text.split("\n"), broken: broken.value.text.split("\n"),
      real: real.value.text.split("\n"), token: created.data }), import.meta.url);
  } finally {
    unstage();
  }
});
