/**
 * Play-test fixes (wave 1 play test, 2026-10-11, context/plans/addon-blueprint-2026-10/wave-1-playtest.md),
 * fixed on fix/playtest-2026-10-11.
 * - PT2-2: the character helper left every spell slot at 0 (e.g. 0/4) after the advancements. A new
 *   character's slots (leveled and pact) start full, in the real run and in the dry run's preview,
 *   and the sheet line reads them back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry, StubCollection, stubId } from "./kit/foundry-stub.mjs";
import { sheetLine } from "../readback-core.mjs";

/* ── PT2-2: a dnd5e-shaped stand-in actor ─────────────────────────────────
 * Just enough of Actor5e for character.mjs's runBuild: source vs derived data, slot maxima derived
 * from the class item (as dnd5e's _prepareSpellcasting does), `value` stored in the source and
 * initial 0 (the dnd5e schema's `spells` MappingField), updateSource/reset/update and
 * performBulkUpdate. The AdvancementManager stand-in has no steps: it adds the item to a clone,
 * which is what the build commits. */

const SLOT_TABLE = {
  sorcerer: { spell1: [1, 4], spell2: [2, 3], spell3: [3, 2] },
  warlock: { pact: [3, 2] }
};
const SLOT_KEYS = ["spell1", "spell2", "spell3", "spell4", "spell5", "spell6", "spell7", "spell8", "spell9", "pact"];

function stage() {
  const U = foundry.utils;
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
      const table = SLOT_TABLE[cls?.system.identifier] ?? {};
      sys.spells = Object.fromEntries(SLOT_KEYS.map(k => [k, {
        value: src.spells?.[k]?.value ?? 0, override: null, max: table[k]?.[1] ?? 0,
        level: table[k]?.[0] ?? (k === "pact" ? 0 : Number(k.slice(5))), type: k === "pact" ? "pact" : "leveled"
      }]));
      sys.abilities = Object.fromEntries(Object.entries(src.abilities ?? {}).map(([k, v]) => [k, { value: v.value, proficient: 0 }]));
      sys.details = { ...(src.details ?? {}), level: cls?.system.levels ?? 0,
        race: items.find(i => i.id === src.details?.race) ?? null, background: items.find(i => i.id === src.details?.background) ?? null };
      sys.attributes = { ...(src.attributes ?? {}), hp: { max: 32, value: src.attributes?.hp?.value ?? 0 }, ac: { value: 12 },
        prof: 3, spell: { dc: 13 }, spellcasting: src.attributes?.spellcasting ?? "", movement: { walk: 30 }, senses: { ranges: {} } };
      sys.skills = {};
      sys.traits = { size: "med", languages: { value: new Set() } };
      sys.scale = {};
      this.system = sys;
    }
    updateSource(changes) {
      U.mergeObject(this._source, U.expandObject(changes));
    }
    async update(changes) {
      this.writes.push(changes);
      this.updateSource(changes);
      this.reset();
      return this;
    }
    toObject() {
      return { name: this.name, type: this.type, system: U.deepClone(this._source.system), items: U.deepClone(this._source.items) };
    }
    async performBulkUpdate({ actor, create = [], delete: del = [], item = [] }) {
      this._source.system = U.deepClone(actor.system);
      const kept = this._source.items.filter(i => !del.includes(i._id))
        .map(i => item.find(u => u._id === i._id) ?? i);
      this._source.items = [...kept, ...create];
      this.reset();
    }
    async delete() { this.deleted = true; }
  }
  const AdvancementManager = {
    forNewItem(actor, itemData) {
      const clone = new FakeActor({ _id: actor.id, name: actor.name, type: actor.type, system: U.deepClone(actor._source.system),
        items: [...U.deepClone(actor._source.items), { ...U.deepClone(itemData), _id: itemData._id ?? stubId("itm") }] });
      return { steps: [], clone };
    }
  };
  const saved = { Actor: globalThis.Actor, dnd5e: globalThis.dnd5e };
  globalThis.Actor = { implementation: FakeActor };
  globalThis.dnd5e = { applications: { advancement: { AdvancementManager } } };
  CONFIG.DND5E = { focusTypes: {} };
  game.items.fromCompendium = doc => U.deepClone(doc);
  game.folders = new StubCollection([{ id: "fold00000000001", name: "Foundry MCP Characters", type: "Actor" }]);
  return () => { globalThis.Actor = saved.Actor; globalThis.dnd5e = saved.dnd5e; };
}

function resolvedFor(identifier, name) {
  return {
    abilities: { str: 8, dex: 14, con: 14, int: 10, wis: 12, cha: 16 },
    docs: {
      species: { name: "Human", type: "race", system: {} },
      background: { name: "Sage", type: "background", system: {} },
      cls: { name, type: "class", system: { identifier, levels: 1, primaryAbility: { value: ["cha"] } } },
      subclass: null
    },
    level: 5, size: "med", defaults: [], warnings: []
  };
}

async function withFoundry(fn) {
  const S = await installFoundry();
  const unstage = stage();
  try {
    return await fn();
  } finally {
    unstage();
    S.restore();
  }
}

const SORCERER_SLOTS = [
  { key: "spell1", level: 1, type: "leveled", value: 4, max: 4 },
  { key: "spell2", level: 2, type: "leveled", value: 3, max: 3 },
  { key: "spell3", level: 3, type: "leveled", value: 2, max: 2 }
];

test("PT2-2: the dry run's preview fills every spell slot and the sheet line reads them back", async () => {
  await withFoundry(async () => {
    const { previewCharacter } = await import("../character-adapter.mjs");
    const report = await previewCharacter({ name: "ZZ Sorcerer 5" }, resolvedFor("sorcerer", "Sorcerer"));
    assert.deepEqual(report.summary.slots, SORCERER_SLOTS);
    assert.match(sheetLine(report.summary), /slots 1st 4\/4, 2nd 3\/3, 3rd 2\/2$/);
  });
});

test("PT2-2: the real build commits full leveled slots, in the same write as full HP", async () => {
  await withFoundry(async () => {
    const { buildCharacter } = await import("../character-adapter.mjs");
    const { actor, report } = await buildCharacter({ name: "ZZ Sorcerer 5" }, resolvedFor("sorcerer", "Sorcerer"));
    const src = actor._source.system.spells ?? {};
    assert.deepEqual([src.spell1?.value, src.spell2?.value, src.spell3?.value], [4, 3, 2]);
    assert.equal(src.spell4?.value ?? 0, 0, "a slot level the class does not have stays untouched");
    assert.deepEqual(report.summary.slots, SORCERER_SLOTS);
    const last = actor.writes.at(-1);
    assert.equal(last["system.attributes.hp.value"], 32);
    assert.equal(last["system.spells.spell1.value"], 4);
  });
});

test("PT2-2: pact slots are filled too (warlock), dry run and real run", async () => {
  await withFoundry(async () => {
    const { previewCharacter, buildCharacter } = await import("../character-adapter.mjs");
    const pact = [{ key: "pact", level: 3, type: "pact", value: 2, max: 2 }];
    const pre = await previewCharacter({ name: "ZZ Warlock 5" }, resolvedFor("warlock", "Warlock"));
    assert.deepEqual(pre.summary.slots, pact);
    assert.match(sheetLine(pre.summary), /slots pact 2\/2 \(3rd\)$/);
    const { actor, report } = await buildCharacter({ name: "ZZ Warlock 5" }, resolvedFor("warlock", "Warlock"));
    assert.equal(actor._source.system.spells.pact?.value, 2);
    assert.deepEqual(report.summary.slots, pact);
  });
});

test("PT2-2: a character with no slots prints no slots clause", () => {
  const s = { class: "Fighter 5", species: "Human", background: "Soldier", abilities: { str: 16 }, hp: 44, ac: 18, prof: 3,
    saves: [], skills: [], speed: 30, size: "med", spellCounts: null, slots: [] };
  assert.doesNotMatch(sheetLine(s), /slots/);
});
