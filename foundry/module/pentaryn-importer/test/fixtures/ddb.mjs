/**
 * Synthetic D&D Beyond characters for the DDB-corrections tests, shaped like the ddb-importer 7.5.8
 * transfers read from the live pentaryn world on 2026-10-19 (read-only): consumable-trinket apparel,
 * feat 1/day spells with method "atwill" and uses.max "1", a wand whose Cast activity points at a DDB
 * spell that spends its own uses, a homebrew item with no PHB spell, the Transmuter's Stone feat with
 * its benefit baked into base data. Names are generic; no live ids.
 *
 * `snapshot()` is the plain shape ddb-core.mjs plans on; `liveActor()` wraps one in the few Document
 * behaviours ddb-adapter.mjs touches, recording every write in `writes`.
 */

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export const DDB_MM = "Compendium.world.ddb-spells.Item.ddbMagicMissil24";
export const DDB_DM = "Compendium.world.ddb-spells.Item.ddbDetectMagic24";
export const DDB_HB = "Compendium.world.ddb-spells.Item.ddbMenaciProvo14";
export const PHB_INDEX = [
  { _id: "phbsplMagicMissi", name: "Magic Missile" },
  { _id: "phbsplDetectMagi", name: "Detect Magic" },
  { _id: "phbsplFalseLifex", name: "False Life" },
];

/** A DDB spell copy whose damage activity spends the spell's own (absent) uses with the slot off. */
const selfSpender = (name, level) => ({
  name,
  system: {
    level, uses: { max: "" },
    activities: { dmg: { _id: "dmg", type: "damage", consumption: { spellSlot: false, targets: [{ type: "itemUses", target: "", value: "1" }] } } },
  },
});

export const SPELLS = {
  [DDB_MM]: selfSpender("Magic Missile", 1),
  [DDB_DM]: selfSpender("Detect Magic (2024)", 1),
  [DDB_HB]: selfSpender("Menacing Provocation", 1),
};

const item = (_id, name, type, system, flags = {}, effects = [], source = null) => ({ _id, name, type, system, flags, source, effects });
const cast = (id, uuid) => ({ [id]: { _id: id, type: "cast", spell: { uuid, level: null }, consumption: { spellSlot: false, targets: [] } } });

/** The wizard: apparel, notes, free casts, a wand, a lens, the stone. */
export function wizard({ importId = "imp1", stamp = null } = {}) {
  return {
    id: "actorWizard00001", name: "Test Wizard", ddb: true, importId, stamp,
    system: { attributes: { senses: { ranges: { darkvision: 60 } } }, abilities: { con: { proficient: 1 } } },
    items: [
      item("robe", "Robe", "consumable", { type: { value: "trinket" }, quantity: 1, weight: { value: 4 }, equipped: false, uses: { max: 1 } }),
      item("witch", "Witch Robes", "consumable", { type: { value: "trinket" }, quantity: 1, equipped: true, description: { value: "<p>black</p>" } }),
      item("notes", "Field Notes", "consumable", { type: { value: "trinket" }, quantity: 1 }),
      item("orcrobe", "Orc Sized Robes", "consumable", { type: { value: "" }, quantity: 1 }),
      item("oil", "Oil", "consumable", { type: { value: "trinket" }, quantity: 3, container: "bp" }),
      item("scroll", "Scroll of Sleep", "consumable", { type: { value: "scroll" }, container: "bp" }),
      item("potion", "Potion of Cloak Shadows", "consumable", { type: { value: "potion" } }),
      item("clothes", "Traveler's Clothes", "equipment", { type: { value: "clothing" } }),
      item("bp", "Backpack", "container", {}),
      item("race", "Human", "race", { senses: { ranges: {} } }),
      item("fl1", "False Life", "spell", { level: 1, method: "atwill", sourceItem: "feat:shadow-touched", uses: { max: "1", recovery: [{ period: "lr" }] } }),
      item("fl2", "False Life", "spell", { level: 1, method: "spell", sourceItem: "feat:shadow-touched", uses: { max: "" } }),
      item("inv", "Invisibility", "spell", { level: 2, method: "atwill", sourceItem: "feat:shadow-touched", uses: { max: "1", recovery: [{ period: "lr" }] } }),
      item("swa", "Speak with Animals", "spell", { level: 1, method: "atwill", sourceItem: "feat:magic-initiate-druid", uses: { max: "1", recovery: [{ period: "lr" }] } }),
      item("hand", "Mage Hand", "spell", { level: 0, method: "atwill", sourceItem: "class:wizard", uses: { max: "" } }),
      item("wand", "Wand of Magic Missiles", "equipment", { activities: cast("castMaMi", DDB_MM), uses: { max: "7" } }),
      item("lens", "Prism-Silt Lens", "equipment", { activities: cast("castDeMa", DDB_DM), uses: { max: "3" } }),
      item("alt", "Wondrous Alteration", "feat", { activities: { castAlt: { _id: "castAlt", type: "cast", spell: { uuid: null } } } }),
      item("stone", "Transmuter's Stone", "feat", { identifier: "transmuters-stone" }),
      // dnd5e's cached copy of the lens's DDB Detect Magic (flags.dnd5e.cachedFor): stale once repointed
      item("dmCache", "Detect Magic", "spell", { level: 1, method: "spell", uses: { max: "" } },
        { dnd5e: { cachedFor: ".Item.lens.Activity.castDeMa" } }, [], DDB_DM),
    ],
  };
}

/** The fighter: an orc (species darkvision), a homebrew axe with a self-spending Cast, gear. */
export function fighter({ importId = "imp2", stamp = null, frozenAxe = false } = {}) {
  return {
    id: "actorFighter0001", name: "Test Fighter", ddb: true, importId, stamp,
    system: { attributes: { senses: { ranges: { darkvision: 120 } } }, abilities: { con: { proficient: 1 } } },
    items: [
      item("race", "Orc", "race", { senses: { ranges: { darkvision: 120 } } }),
      item("rope", "Rope", "consumable", { type: { value: "trinket" } }),
      item("axe", "Axe of Resonant Provocation", "weapon", { activities: cast("castMePr", DDB_HB) },
        frozenAxe ? { ddbimporter: { ignoreItemImport: true } } : {}),
    ],
  };
}

export const lookups = () => ({ spells: clone(SPELLS), phbSpells: clone(PHB_INDEX) });

/* -------------------------------------------------------------------------------------------- */
/*  Live-ish documents for the adapter and the feature                                            */
/* -------------------------------------------------------------------------------------------- */

class Coll extends Map {
  get contents() { return [...this.values()]; }
  [Symbol.iterator]() { return this.values(); }
  filter(fn) { return this.contents.filter(fn); }
  find(fn) { return this.contents.find(fn); }
}

const setPath = (obj, path, value) => {
  const parts = path.split(".");
  let node = obj;
  for (const p of parts.slice(0, -1)) node = (node[p] ??= {});
  node[parts.at(-1)] = value;
};

/** The `system` a type change replaces: a ForcedReplacement operator's value, or the old `==system` key. */
const replaced = changes => {
  const FR = globalThis.foundry?.data?.operators?.ForcedReplacement;
  if (FR && changes.system instanceof FR) return changes.system.value;
  return changes["==system"];
};

/**
 * A Document-like actor from a snapshot. `writes` records every write; `failRetype` makes the
 * type change throw (the recreate fallback then runs); `owners` are the user ids that own it
 * (`testUserPermission`, a GM always does).
 */
export function liveActor(snap, { isOwner = true, failRetype = false, writes = [], owners = [] } = {}) {
  const actor = {
    documentName: "Actor", id: snap.id, name: snap.name, uuid: `Actor.${snap.id}`, isOwner, writes,
    testUserPermission: (user, level) => level === "OWNER" && (user?.isGM === true || owners.includes(user?.id)),
    flags: { ...(snap.ddb ? { ddbimporter: { importId: snap.importId } } : {}),
      ...(snap.stamp ? { "pentaryn-importer": { ddbCorrections: clone(snap.stamp) } } : {}) },
    items: new Coll(),
  };
  actor._source = { system: clone(snap.system), flags: actor.flags };
  const mkItem = data => {
    const it = {
      id: data._id, name: data.name, type: data.type, effects: new Coll(),
      _source: { system: clone(data.system), flags: clone(data.flags ?? {}), _stats: { compendiumSource: data.source ?? null } },
      get flags() { return this._source.flags; },
      toObject() { return clone({ _id: this.id, name: this.name, type: this.type, system: this._source.system, flags: this._source.flags }); },
      async update(changes) {
        const system = replaced(changes);
        if (failRetype && changes.type) throw new Error("type change refused");
        writes.push(["item.update", this.id, clone({ ...changes, ...(system ? { system } : {}) }), Object.keys(changes)]);
        if (changes.type) this.type = changes.type;
        if (system) this._source.system = clone(system);
      },
      async createEmbeddedDocuments(kind, docs, opts) {
        writes.push(["effects.create", this.id, docs.map(d => [d._id, d.name, d.disabled]), clone(opts)]);
        for (const d of docs) {
          if (this.effects.has(d._id)) throw new Error(`ActiveEffect ${d._id} already exists`);
          this.effects.set(d._id, { id: d._id, name: d.name, disabled: d.disabled, _source: { flags: clone(d.flags) } });
        }
      },
    };
    for (const e of data.effects ?? []) it.effects.set(e._id, { id: e._id, name: e.name, disabled: e.disabled, _source: { flags: clone(e.flags) } });
    return it;
  };
  for (const data of snap.items) actor.items.set(data._id, mkItem(data));
  Object.assign(actor, {
    async updateEmbeddedDocuments(kind, updates) {
      writes.push(["items.update", clone(updates)]);
      for (const u of updates) {
        const it = actor.items.get(u._id);
        for (const [k, v] of Object.entries(u)) if (k !== "_id") setPath(it._source, k, v);
      }
    },
    async deleteEmbeddedDocuments(kind, ids) {
      writes.push(["items.delete", ids]);
      for (const id of ids) actor.items.delete(id);
    },
    async createEmbeddedDocuments(kind, docs, opts) {
      writes.push(["items.create", docs.map(d => [d._id, d.type]), clone(opts)]);
      for (const d of docs) actor.items.set(d._id, mkItem({ ...d, effects: [] }));
    },
    async update(changes) {
      writes.push(["actor.update", clone(changes)]);
      for (const [k, v] of Object.entries(changes)) {
        if (k.startsWith("flags.")) setPath(actor, k, clone(v));
        else setPath(actor._source, k, v);
      }
    },
  });
  return actor;
}
