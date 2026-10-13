/**
 * R5 ([declared] DP9, console only): every swallowed failure in character-adapter.mjs prints a debug
 * line behind CONFIG.debug["pentaryn-prompts"], and falls back exactly as before. One direct test
 * per catch: a rejecting fromUuid (docAt), a throwing spellLists.forType (onClassList), a rejecting
 * spell or item lookup, a throwing createWithContents (itemDataFor) and a throwing canEnchant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, addItemPack, MODULE } from "./fixtures/world.mjs";
import { StubCollection, stubId } from "./kit/foundry-stub.mjs";

const F = await installWorld();
const U = foundry.utils;
const REJECT = "Compendium.dnd-players-handbook.classes.Item.featReject00001";

addItemPack(F, "dnd-players-handbook.classes", [
  { _id: "clMonk0000000001", name: "Monk", type: "class", system: { identifier: "monk", advancement: [
    { type: "ItemGrant", title: "Granted", level: 1, configuration: { items: [{ uuid: REJECT }] } }
  ] } }
]);
addItemPack(F, "dnd-players-handbook.origins", [
  { _id: "spcDwarf00000001", name: "Dwarf", type: "race", system: { advancement: [] } },
  { _id: "bgAcolyte0000001", name: "Acolyte", type: "background", system: { advancement: [] } }
]);
addItemPack(F, "dnd-players-handbook.spells", [{ _id: "spGuidance000001", name: "Guidance", type: "spell", system: { level: 0 } }]);
addItemPack(F, "dnd-players-handbook.equipment", [
  { _id: "eqPriestPack0001", name: "Priest's Pack", type: "container", system: {} },
  { _id: "wpnStaff00000001", name: "Quarterstaff", type: "weapon", system: { type: { value: "simpleM" } } }
]);
globalThis.dnd5e = { registry: { spellLists: { forType: () => null } } };
const C = await import("../character-adapter.mjs");

const ARRAY = { str: 8, dex: 14, con: 13, int: 10, wis: 15, cha: 12 };
const BASE = { name: "Ko", class: "Monk", species: "Dwarf", background: "Acolyte", level: 1, abilities: ARRAY };

/** Console debug lines `fn` prints, with debug off and then on. → `{off, on, value}` (value from the "on" run). */
async function debugBoth(fn) {
  const saved = console.debug;
  const run = async () => {
    const out = [];
    console.debug = (...a) => out.push(a.map(x => (x instanceof Error ? `Error(${x.message})` : String(x))).join(" "));
    try { return { out, value: await fn() }; } finally { console.debug = saved; }
  };
  const off = await run();
  F.CONFIG.debug[MODULE] = true;
  try {
    const on = await run();
    return { off: off.out, on: on.out, value: on.value, offValue: off.value };
  } finally {
    delete F.CONFIG.debug[MODULE];
  }
}

/* a ghost actor and a manager that only adds the item: enough for previewCharacter's runBuild */
class GhostActor {
  constructor(data) {
    this.id = data._id ?? stubId("act");
    this.name = data.name;
    this.type = data.type;
    this._source = { system: U.deepClone(data.system ?? {}), items: U.deepClone(data.items ?? []) };
    this.reset();
  }
  reset() {
    const src = this._source.system;
    const items = this._source.items.map(i => ({ ...U.deepClone(i), id: i._id }));
    this.items = new StubCollection(items);
    const cls = items.find(i => i.type === "class");
    this.system = { _source: src, spells: {}, skills: {}, scale: {}, currency: {},
      abilities: Object.fromEntries(Object.entries(src.abilities ?? {}).map(([k, v]) => [k, { value: v.value, proficient: 0 }])),
      details: { level: cls?.system.levels ?? 0, race: null, background: null },
      attributes: { hp: { max: 8 }, ac: { value: 10 }, prof: 2, spell: { dc: 10 }, spellcasting: "", movement: { walk: 30 }, senses: { ranges: {} } },
      traits: { size: "med", languages: { value: new Set() } } };
  }
  updateSource(changes) {
    const { items, ...rest } = U.expandObject(changes);
    if (items) this._source.items.push(...U.deepClone(items));
    U.mergeObject(this._source, rest);
  }
}

function stage() {
  const saved = { Actor: globalThis.Actor, apps: globalThis.dnd5e.applications, DND5E: F.CONFIG.DND5E, Item: F.CONFIG.Item };
  globalThis.Actor = { implementation: GhostActor };
  globalThis.dnd5e.applications = { advancement: { AdvancementManager: { forNewItem(actor, itemData) {
    const clone = new GhostActor({ _id: actor.id, name: actor.name, type: actor.type, system: U.deepClone(actor._source.system),
      items: [...U.deepClone(actor._source.items), { ...U.deepClone(itemData), _id: itemData._id ?? stubId("itm") }] });
    return { steps: [], clone };
  } } } };
  F.CONFIG.DND5E = { focusTypes: {} };
  F.CONFIG.Item = { documentClass: {} };
  return () => {
    globalThis.Actor = saved.Actor;
    globalThis.dnd5e.applications = saved.apps;
    F.CONFIG.DND5E = saved.DND5E;
    F.CONFIG.Item = saved.Item;
  };
}

test("R5: a rejecting fromUuid (docAt) skips the granted item as before and prints a debug line only with debug on", async () => {
  const prev = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => { if (uuid === REJECT) throw new Error("pack locked"); return prev(uuid); };
  try {
    const { off, on, value, offValue } = await debugBoth(() => C.resolveCharacter(BASE));
    assert.deepEqual(off, []);
    assert.deepEqual(on, [`pentaryn-prompts | docAt ${REJECT} (treated as missing) Error(pack locked)`]);
    assert.deepEqual(value.planWarnings, offValue.planWarnings);
    assert.equal(value.docs.cls.name, "Monk");
  } finally {
    globalThis.fromUuid = prev;
  }
});

test("R5: a throwing spellLists.forType (onClassList) leaves the spell unchecked as before and prints a debug line only with debug on", async () => {
  const prev = dnd5e.registry.spellLists.forType;
  dnd5e.registry.spellLists.forType = () => { throw new Error("no registry"); };
  try {
    const { off, on, value } = await debugBoth(() => C.resolveCharacter({ ...BASE, spells: ["Guidance"] }));
    assert.deepEqual(off, []);
    assert.deepEqual(on, ["pentaryn-prompts | class spell list (unknown, not checked) Error(no registry)"]);
    assert.deepEqual(value.spells.prepared.map(s => s.name), ["Guidance"]);
  } finally {
    dnd5e.registry.spellLists.forType = prev;
  }
});

test("R5: a spell or item lookup that rejects is still 'not found' and prints a debug line only with debug on", async () => {
  const { off, on, value } = await debugBoth(() => C.resolveCharacter({ ...BASE, spells: ["Item.nope"], items: [{ uuid: "Item.gone" }] }).catch(e => e));
  assert.deepEqual(off, []);
  assert.deepEqual(on, [
    "pentaryn-prompts | spell lookup Item.nope (treated as not found) Error(BAD_SPEC: Item.nope is not an item)",
    "pentaryn-prompts | item lookup Item.gone (treated as not found) Error(BAD_SPEC: Item.gone is not an item)"
  ]);
  assert.equal(value.code, "BAD_SPEC");
  assert.match(value.message, /spells: no spell "Item\.nope"/);
  assert.match(value.message, /items: no item "Item\.gone"/);
});

test("R5: a throwing createWithContents (itemDataFor) adds the container alone as before and prints a debug line only with debug on", async () => {
  const unstage = stage();
  F.CONFIG.Item = { documentClass: { createWithContents: async () => { throw new Error("no contents"); } } };
  try {
    const w = { ...BASE, items: ["Priest's Pack"] };
    const resolved = await C.resolveCharacter(w);
    const { off, on, value } = await debugBoth(() => C.previewCharacter(w, resolved));
    assert.deepEqual(off, []);
    assert.deepEqual(on, ["pentaryn-prompts | createWithContents (the container alone) Error(no contents)"]);
    assert.deepEqual(value.items, ["Priest's Pack"]);
  } finally {
    unstage();
  }
});

test("R5: a throwing canEnchant leaves the weapon unenchanted as before and prints a debug line only with debug on", async () => {
  const unstage = stage();
  try {
    const w = { ...BASE, items: ["Quarterstaff", { data: { name: "Martial Arts", type: "feat", system: { identifier: "martial-arts" } } }] };
    const resolved = await C.resolveCharacter(w);
    const act = { type: "enchant", availableEnchantments: [{ _id: "enchDex000000001" }], canEnchant() { throw new Error("bad weapon"); } };
    resolved.gear[1].data.system.activities = [act];
    const { off, on, value } = await debugBoth(() => C.previewCharacter(w, resolved));
    assert.deepEqual(off, []);
    assert.deepEqual(on, ["pentaryn-prompts | canEnchant (weapon skipped) Error(bad weapon)"]);
    assert.deepEqual(value.enchanted, []);
  } finally {
    unstage();
  }
});
