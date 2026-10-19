/**
 * pentaryn-importer — DDB corrections, the PURE part (no Foundry globals; node imports it bare).
 *
 * D&D Beyond player characters arrive through the third-party ddb-importer module (the actor carries
 * `flags.ddbimporter`). It gets a few things wrong for this table, and every re-sync from D&D Beyond
 * puts them back. Each rule below corrects one of those shapes, generically (by item type, name,
 * identifier and data shape — never by an actor or item id), so every DDB character gets the same
 * treatment. The glue (ddb-adapter.mjs, ddb-corrections.mjs) snapshots a live Actor into the plain
 * shape below, resolves the lookups a rule needs, runs `planCorrections`, and applies the ops.
 *
 * A rule is `{ id, label, doc, match(actor, item), plan(actor, item, lookups) → { changes, notes } }`.
 * Idempotent by construction: an item that is already correct does not match, or plans nothing.
 * Items frozen with `flags.ddbimporter.ignoreItemUpdate` / `ignoreItemImport` are left alone — a
 * frozen item is hands-off for ddb-importer and for these rules alike.
 *
 * Snapshot (all `_source` data, plain JSON):
 *   actor   { id, name, ddb: boolean, importId, stamp, system, items: [item] }
 *   item    { _id, name, type, system, flags, effects: [{ _id, name, disabled, flags }] }
 *   lookups { spells: { [uuid]: { name, system } | null }, phbSpells: [{ _id, name }] | null }
 *
 * Ops (one per change; the adapter batches them):
 *   { op: "retype",        itemId, data: { type, system } }      a type change: the whole system replaced
 *   { op: "updateItem",    itemId, data: { "<path>": value } }   batched into one updateEmbeddedDocuments
 *   { op: "createEffects", itemId, data: [effectData] }           deterministic `_id`s, created with keepId
 *   { op: "updateActor",   data: { "<path>": value } }            merged with the correction stamp
 *
 * Ported from the 2026-10-19 fix scripts (scripts/foundry/fixes/): 2026-10-19-ddb-pc-cleanup.js
 * (feedback tiDvFa), 2026-10-19-wand-cast-spell.mjs (ixcdvA), 2026-10-19-transmuters-stone.js (tNdOEx).
 */

import { MODULE } from "./importer-core.mjs";

/** The flag key (under this module's scope) of the correction stamp on a corrected actor. */
export const STAMP_KEY = "ddbCorrections";

/** The PHB spell compendium a Cast activity is repointed at. */
export const PHB_SPELLS = "dnd-players-handbook.spells";

/** pentaryn-riders' flag scope: it reads `choice` on pick-one effects (its README, Data written). */
export const RIDERS = "pentaryn-riders";

/** ddb-importer's per-item flags that make a sync skip an item; the rules skip it too. */
export const FREEZE_FLAGS = Object.freeze(["ignoreItemUpdate", "ignoreItemImport"]);

const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const get = (obj, path) => path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
const blank = v => v === undefined || v === null || String(v).trim() === "";

/** True when ddb-importer will skip this item on a sync (and so do the rules). */
export function isFrozen(item) {
  return FREEZE_FLAGS.some(k => get(item, `flags.ddbimporter.${k}`) === true);
}

/** A stable 16-character document id for (`seed`), so two tabs creating the same effect collide, not duplicate. */
export function stableId(seed) {
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let out = "";
  for (let round = 0; out.length < 16; round++) {
    for (const ch of `${seed}#${round}`) {
      h1 = Math.imul(h1 ^ ch.charCodeAt(0), 16777619) >>> 0;
      h2 = Math.imul(h2 + ch.charCodeAt(0), 2246822519) >>> 0;
    }
    let n = (h1 ^ h2) >>> 0;
    for (let i = 0; i < 5 && out.length < 16; i++) {
      out += ALPHABET[n % 62];
      n = Math.floor(n / 62);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------------------------- */
/*  Rule 1 — apparel and notes typed as consumables                                               */
/* -------------------------------------------------------------------------------------------- */

const APPAREL = /\b(robes?|clothes|clothing|garb|attire|vestments?|cloak|tunic|gown|dress)\b/i;
const NOTES = /\b(notes|journal|diary|notebook|logbook)\b/i;
/** System fields carried across a consumable → equipment change (both data models define them). */
const KEEP = ["description", "source", "identified", "unidentified", "container", "quantity", "weight",
  "price", "rarity", "equipped", "attuned"];

function apparelKind(item) {
  if (item.type !== "consumable") return null;
  const sub = get(item, "system.type.value") ?? "";
  if (sub && sub !== "trinket") return null;          // a real potion, scroll, food… stays
  return APPAREL.test(item.name) ? "clothing" : NOTES.test(item.name) ? "trinket" : null;
}

const apparelAsEquipment = {
  id: "apparel-as-equipment",
  label: "Apparel and notes typed as consumables",
  doc: "D&D Beyond custom Adventuring Gear arrives as a consumable trinket: robes, clothes and cloaks "
    + "become equipment (clothing), notes and journals equipment (trinket). Quantity, weight, price, "
    + "description, container and equipped state are kept, and so is the item id.",
  match: (actor, item) => apparelKind(item) !== null,
  plan(actor, item) {
    const kind = apparelKind(item);
    const system = { type: { value: kind, baseItem: "" } };
    for (const k of KEEP) if (item.system?.[k] !== undefined) system[k] = clone(item.system[k]);
    const sub = get(item, "system.type.value") || "-";
    return {
      changes: [{ op: "retype", itemId: item._id, data: { type: "equipment", system },
        summary: `${item.name}: consumable/${sub} → equipment/${kind}` }],
      notes: [],
    };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  Rule 2 — a feat's 1/day free cast filed as At-Will                                            */
/* -------------------------------------------------------------------------------------------- */

const freeCastInnate = {
  id: "freecast-innate",
  label: "1/day free casts shown as At-Will",
  doc: "Shadow Touched, Magic Initiate and the like arrive as spellcasting method `atwill` with uses "
    + "per rest, so dnd5e lists them under At-Will. They become method `innate` (Innate Spellcasting), "
    + "uses kept. An at-will spell with no uses is a real at-will spell and is left alone.",
  match: (actor, item) => item.type === "spell" && get(item, "system.method") === "atwill" && !blank(get(item, "system.uses.max")),
  plan(actor, item) {
    const recovery = (get(item, "system.uses.recovery") ?? []).map(r => r?.period).filter(Boolean).join(",") || "?";
    return {
      changes: [{ op: "updateItem", itemId: item._id, data: { "system.method": "innate" },
        summary: `${item.name}: At-Will → Innate (${get(item, "system.uses.max")}/${recovery})` }],
      notes: [],
    };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  Rule 3 — a Cast activity whose spell spends its own (absent) uses                             */
/* -------------------------------------------------------------------------------------------- */

/** A spell name for matching: parentheticals dropped ("(2024)"), whitespace collapsed, lower case. */
export function spellKey(name) {
  return String(name ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

/** The spell's activities that spend the spell's own uses with the slot off while it has no uses. */
export function selfSpendingActivities(spell) {
  const max = String(get(spell, "system.uses.max") ?? "").trim();
  if (max && max !== "0") return [];
  return Object.values(get(spell, "system.activities") ?? {}).filter(a =>
    a?.consumption?.spellSlot === false
    && (a.consumption.targets ?? []).some(t => t?.type === "itemUses" && !t.target));
}

/** The Cast activities of an item that point at a spell outside the PHB pack. */
function foreignCasts(item) {
  return Object.values(get(item, "system.activities") ?? {}).filter(a =>
    a?.type === "cast" && typeof a.spell?.uuid === "string" && a.spell.uuid
    && !a.spell.uuid.startsWith(`Compendium.${PHB_SPELLS}.`));
}

/** The spell uuids `planCorrections` needs resolved for this actor (the adapter looks them up). */
export function spellUuidsNeeded(actor) {
  const out = new Set();
  for (const item of actor.items ?? []) {
    if (isFrozen(item)) continue;
    for (const a of foreignCasts(item)) out.add(a.spell.uuid);
  }
  return [...out];
}

const castSelfUses = {
  id: "cast-self-uses",
  label: "Item Cast activities that spend the spell's own uses",
  doc: "A wand or other item whose Cast activity points at a DDB copy of a spell that spends its own "
    + "uses with the slot off cannot cast (\"No uses on <spell> available\") and never spends the item's "
    + "charges. The activity is repointed at the PHB spell of the same name, at the spell's level, with "
    + "the slot flag on — what the DMG's own wands do — so the item's charges are spent. A spell with no "
    + "PHB match (homebrew) is only reported: freeze that item (flags.ddbimporter.ignoreItemUpdate) "
    + "after a fix by hand.",
  match: (actor, item) => foreignCasts(item).length > 0,
  plan(actor, item, lookups) {
    const changes = [];
    const notes = [];
    const data = {};
    const moved = [];
    for (const act of foreignCasts(item)) {
      const uuid = act.spell.uuid;
      if (!lookups?.spells || !(uuid in lookups.spells)) continue;      // not looked up: no opinion
      const spell = lookups.spells[uuid];
      if (!spell) {
        notes.push({ item: item.name, note: `Cast activity ${act._id}: spell ${uuid} not found` });
        continue;
      }
      if (!selfSpendingActivities(spell).length) continue;
      const match = (lookups.phbSpells ?? []).find(e => spellKey(e.name) === spellKey(spell.name)) ?? null;
      if (!match) {
        notes.push({ item: item.name, note: `${spell.name} spends its own uses and has no PHB spell of that name: `
          + "fix the item by hand, then freeze it (scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js)" });
        continue;
      }
      const level = act.spell.level ?? get(spell, "system.level") ?? null;
      data[`system.activities.${act._id}.spell.uuid`] = `Compendium.${PHB_SPELLS}.Item.${match._id}`;
      data[`system.activities.${act._id}.spell.level`] = level;
      data[`system.activities.${act._id}.consumption.spellSlot`] = true;
      moved.push(spell.name);
    }
    if (moved.length) {
      changes.push({ op: "updateItem", itemId: item._id, data,
        summary: `${item.name}: Cast ${moved.join(", ")} → PHB spell (spends the item's charges)` });
    }
    return { changes, notes };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  Rule 4 — Transmuter's Stone as pick-one passive effects                                       */
/* -------------------------------------------------------------------------------------------- */

const STONE_GROUP = "transmuters-stone";
const STONE_MAX = "min(2, 1 + floor(@classes.wizard.levels / 10))";
const STONE_IMG = "icons/commodities/gems/gem-rough-cushion-green.webp";
const RESIST = ["acid", "cold", "fire", "lightning", "poison", "thunder"];
const cap = s => s[0].toUpperCase() + s.slice(1);
const change = (key, type, value) => ({ key, type, value, phase: "initial", priority: 20 });

/** The stone's effects, by key: one always-on, the rest pick-one (flags.pentaryn-riders.choice). */
export const STONE_EFFECTS = Object.freeze([
  { key: "bearer", name: "Transmuter's Stone", choice: false,
    description: "While you have the stone: proficiency in Constitution saving throws (always on). Pick one benefit below.",
    changes: [change("system.abilities.con.proficient", "upgrade", 1)] },
  { key: "darkvision", name: "Transmuter's Stone: Darkvision", choice: true,
    description: "Darkvision 60 ft, or +60 ft to the darkvision you have. Turning this on turns the other stone benefit off.",
    changes: [change("system.attributes.senses.ranges.darkvision", "add", 60)] },
  { key: "speed", name: "Transmuter's Stone: Speed", choice: true,
    description: "Your Speed increases by 10 feet. Turning this on turns the other stone benefit off.",
    changes: [change("system.attributes.movement.speeds.walk", "add", "10")] },
  ...RESIST.map(t => ({ key: `resist-${t}`, name: `Transmuter's Stone: Resistance (${cap(t)})`, choice: true,
    description: `Resistance to ${cap(t)} damage. Turning this on turns the other stone benefit off.`,
    changes: [change("system.traits.dr.value", "add", t)] })),
]);

const isStone = item => item.type === "feat"
  && (get(item, "system.identifier") === "transmuters-stone" || item.name === "Transmuter's Stone");

/** What the import baked into the actor's base data that the stone's effects now grant. */
function stoneBaked(actor, stone) {
  const species = (actor.items ?? []).find(i => i.type === "race");
  const speciesDark = Number(get(species, "system.senses.ranges.darkvision")) || 0;
  const otherConSave = (actor.items ?? []).some(i => i._id !== stone._id && /resilient/i.test(i.name)
    && /con/i.test(JSON.stringify(get(i, "system.advancement") ?? {})));
  const update = {};
  if (Number(get(actor, "system.attributes.senses.ranges.darkvision")) === 60 && !speciesDark) {
    update["system.attributes.senses.ranges.darkvision"] = 0;
  }
  if (Number(get(actor, "system.abilities.con.proficient")) === 1 && !otherConSave) {
    update["system.abilities.con.proficient"] = 0;
  }
  return update;
}

const transmutersStone = {
  id: "transmuters-stone",
  label: "Transmuter's Stone as pick-one effects",
  doc: "The import gives the Transmuter's Stone feat no effects and bakes the chosen benefit into the "
    + "actor's base data (darkvision 60, CON save proficiency). The feat gets one always-on effect (CON "
    + "saves) and one pick-one effect per benefit (flags.pentaryn-riders.choice, one at a time below "
    + "Wizard 10); the baked base values are reset while they are still the stone's. A re-sync bakes "
    + "them again, so this re-applies after every sync. The benefit that was baked (darkvision) starts "
    + "on; otherwise all start off and the player picks.",
  match: (actor, item) => isStone(item),
  plan(actor, item) {
    const have = new Set((item.effects ?? []).map(e => get(e, `flags.${RIDERS}.stone`)).filter(Boolean));
    const baked = stoneBaked(actor, item);
    const anyChoice = STONE_EFFECTS.some(w => w.choice && have.has(w.key));
    const startOn = anyChoice ? null : ("system.attributes.senses.ranges.darkvision" in baked ? "darkvision" : null);
    const create = STONE_EFFECTS.filter(w => !have.has(w.key)).map(w => ({
      _id: stableId(`${item._id}:${STONE_GROUP}:${w.key}`),
      name: w.name, img: STONE_IMG, type: "base", transfer: true,
      disabled: w.choice ? w.key !== startOn : false,
      description: w.description,
      system: { changes: clone(w.changes) },
      flags: { [RIDERS]: { stone: w.key, ...(w.choice ? { choice: { group: STONE_GROUP, max: STONE_MAX } } : {}) } },
    }));
    const changes = [];
    const notes = [];
    if (create.length) {
      changes.push({ op: "createEffects", itemId: item._id, data: create,
        summary: `${item.name}: ${create.length} effect(s) (${create.filter(c => !c.disabled).map(c => c.name).join(", ") || "none on"})` });
      if (!anyChoice && !startOn) notes.push({ item: item.name, note: "no benefit was baked in: all stone benefits start off — the player picks one" });
    }
    if (Object.keys(baked).length) {
      changes.push({ op: "updateActor", data: baked,
        summary: `${item.name}: base ${Object.keys(baked).map(k => k.split(".").slice(-2).join(".")).join(", ")} reset (the stone grants it)` });
    }
    return { changes, notes };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  The rule table and the planner                                                                */
/* -------------------------------------------------------------------------------------------- */

/** Every rule, in the order it runs. A new rule is a row here plus a table in test/ddb-core.test.mjs. */
export const RULES = Object.freeze([apparelAsEquipment, freeCastInnate, castSelfUses, transmutersStone]);

/**
 * Plan the corrections for one snapshot. Pure: never mutates its inputs.
 * @param {object} actor    the snapshot (header)
 * @param {object} lookups  resolved spells and the PHB index (header)
 * @param {{rules?: object[]}} [opts]
 * @returns {{ actor: {id, name}, importId: string|null, changes: object[], notes: object[], frozen: string[] }}
 */
export function planCorrections(actor, lookups = {}, { rules = RULES } = {}) {
  const changes = [];
  const notes = [];
  const frozen = [];
  for (const item of actor.items ?? []) {
    if (isFrozen(item)) {
      frozen.push(item.name);
      continue;
    }
    for (const rule of rules) {
      if (!rule.match(actor, item)) continue;
      const out = rule.plan(actor, item, lookups);
      for (const c of out.changes ?? []) changes.push({ rule: rule.id, item: c.itemId ? item.name : null, ...c });
      for (const n of out.notes ?? []) notes.push({ rule: rule.id, ...n });
    }
  }
  return { actor: { id: actor.id, name: actor.name }, importId: actor.importId ?? null, changes, notes, frozen };
}

/**
 * Whether the GM-ready sweep should correct this actor: a DDB actor never corrected, or corrected
 * for an earlier import. ddb-importer stores no sync timestamp; it gives every import a fresh
 * `flags.ddbimporter.importId` (`foundry.utils.randomID()` in DDBCharacterImporter), so a stamp
 * whose importId differs from the actor's marks a sync since the last correction.
 */
export function needsCorrection(actor) {
  if (!actor?.ddb) return false;
  const stamp = actor.stamp;
  if (!stamp || typeof stamp !== "object") return true;
  return (stamp.importId ?? null) !== (actor.importId ?? null);
}

/** The stamp written on the actor after a clean run. */
export function stampFor(actor, { at, version, changes }) {
  return { importId: actor.importId ?? null, at, version, changes };
}

/** The flag path of the stamp, for an update. */
export const STAMP_PATH = `flags.${MODULE}.${STAMP_KEY}`;

/** The one summary line of a run that changed something: `<name>: n change(s) — a; b; c`. */
export function summaryLine(name, changes, errors = []) {
  const head = `DDB corrections — ${name}: ${changes.length} change(s)`;
  const body = changes.map(c => c.summary).join("; ");
  const tail = errors.length ? ` — ${errors.length} error(s), see the console` : "";
  return `${head}${body ? ` — ${body}` : ""}${tail}`;
}
