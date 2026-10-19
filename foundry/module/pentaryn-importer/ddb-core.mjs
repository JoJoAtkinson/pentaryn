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
 * Items frozen with `flags.ddbimporter.ignoreItemImport` are left alone — a frozen item is hands-off
 * for a ddb-importer sync and for these rules alike. `ignoreItemUpdate` is NOT a freeze: ddb-importer
 * 7.5.8 reads it only to stop pushing the item back to D&D Beyond (its dynamic sync), while a sync
 * from D&D Beyond still overwrites it, so the rules still apply (Chris's Premades items carry it).
 *
 * Snapshot (all `_source` data, plain JSON):
 *   actor   { id, name, ddb: boolean, importId, stamp, system, items: [item] }
 *   item    { _id, name, type, system, flags, source, effects: [{ _id, name, disabled, flags }] }
 *           (`source` is `_stats.compendiumSource`, or null)
 *   lookups { spells: { [uuid]: { name, system } | null }, phbSpells: [{ _id, name }] | null }
 *
 * Ops (one per change; the adapter batches them):
 *   { op: "retype",        itemId, data: { type, system } }      a type change: the whole system replaced
 *   { op: "updateItem",    itemId, data: { "<path>": value } }   batched into one updateEmbeddedDocuments
 *   { op: "createEffects", itemId, data: [effectData] }           deterministic `_id`s, created with keepId
 *   { op: "updateActor",   data: { "<path>": value } }            merged with the correction stamp
 *   { op: "deleteItem",    itemId }                                batched into one deleteEmbeddedDocuments
 *
 * Ported from the 2026-10-19 fix scripts (scripts/foundry/fixes/): 2026-10-19-ddb-pc-cleanup.js
 * (feedback tiDvFa), 2026-10-19-wand-cast-spell.mjs (ixcdvA), 2026-10-19-transmuters-stone.js (tNdOEx).
 */

import { MODULE, VERSION } from "./importer-core.mjs";

/** The flag key (under this module's scope) of the correction stamp on a corrected actor. */
export const STAMP_KEY = "ddbCorrections";

/** The PHB spell compendium a Cast activity is repointed at. */
export const PHB_SPELLS = "dnd-players-handbook.spells";

/** pentaryn-riders' flag scope: it reads `choice` on pick-one effects (its README, Data written). */
export const RIDERS = "pentaryn-riders";

/**
 * ddb-importer's per-item flag that makes a sync skip an item; the rules skip it too. Only
 * `ignoreItemImport`: in ddb-importer 7.5.8 the import path (mergeExistingItems,
 * clearItemsByUserSelection) honours it alone. `ignoreItemUpdate` only stops the push back to D&D
 * Beyond, so an item carrying just that one is still overwritten by a sync and still corrected.
 */
export const FREEZE_FLAGS = Object.freeze(["ignoreItemImport"]);

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

/** The apparel / notes word must be the name's LAST word (its head noun): "Witch Robes", "Fine Clothes",
 *  "Marwen's Field Notes" match; "Cloak Clasp", "Dress Sword", "Notes of the Fallen" (no) do not. */
const APPAREL = /\b(robes?|clothes|clothing|garb|attire|vestments?|cloak|tunic|gown|dress)$/i;
const NOTES = /\b(notes|journal|diary|notebook|logbook)$/i;
/** System fields carried across a consumable → equipment change (both data models define them). */
const KEEP = ["description", "source", "identified", "unidentified", "container", "quantity", "weight",
  "price", "rarity", "equipped", "attuned", "attunement", "properties", "identifier", "magicalBonus"];

/** The name without parentheticals ("Robes (fine)"), trimmed. */
const headName = name => String(name ?? "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

function apparelKind(item) {
  if (item.type !== "consumable") return null;
  const sub = get(item, "system.type.value") ?? "";
  if (sub && sub !== "trinket") return null;          // a real potion, scroll, food… stays
  const name = headName(item.name);
  return APPAREL.test(name) ? "clothing" : NOTES.test(name) ? "trinket" : null;
}

/**
 * Every DDB consumable arrives with uses.max "1" (no recovery) and one `utility` activity that spends
 * the item's own uses (read from the live world 2026-10-19): that default is what the retype drops.
 * Anything beyond it — magical, attunement, real uses, another activity — is an item the rule does
 * not understand, so it is reported and left alone. @returns {string|null} why it is skipped
 */
function apparelSkip(item) {
  const sys = item.system ?? {};
  const props = Array.isArray(sys.properties) ? sys.properties : Object.keys(sys.properties ?? {});
  if (props.includes("mgc")) return "magical";
  if (!blank(sys.attunement)) return `requires attunement (${sys.attunement})`;
  if (!blank(sys.magicalBonus)) return "has a magical bonus";
  const max = String(sys.uses?.max ?? "").trim();
  if ((max && max !== "0" && max !== "1") || (sys.uses?.recovery ?? []).length) return `has uses (${max || "?"})`;
  const acts = Object.values(sys.activities ?? {});
  const odd = acts.filter(a => !(a?.type === "utility" && isDefaultUse(a)));
  if (odd.length) return `has activities (${odd.map(a => a?.name || a?.type || "?").join(", ")})`;
  return null;
}

/** A DDB default "use" activity: spends nothing, or only the item's own uses; rolls and applies nothing. */
function isDefaultUse(a) {
  const targets = a?.consumption?.targets ?? [];
  if (!targets.every(t => t?.type === "itemUses" && !t?.target)) return false;
  if (!blank(get(a, "roll.formula"))) return false;
  return !(a?.effects ?? []).length;
}

const apparelAsEquipment = {
  id: "apparel-as-equipment",
  label: "Apparel and notes typed as consumables",
  doc: "D&D Beyond custom Adventuring Gear arrives as a consumable trinket: robes, clothes and cloaks "
    + "(the name's last word) become equipment (clothing), notes and journals equipment (trinket). "
    + "Quantity, weight, price, description, container, equipped state, properties, attunement, "
    + "identifier and magical bonus are kept, and so is the item id; the consumable's default single "
    + "use and its use activity are dropped. An item that is magical, needs attunement or has real uses "
    + "or activities is only reported.",
  match: (actor, item) => apparelKind(item) !== null,
  plan(actor, item) {
    const kind = apparelKind(item);
    const skip = apparelSkip(item);
    if (skip) {
      return { changes: [], notes: [{ item: item.name, note: `looks like ${kind === "clothing" ? "apparel" : "notes"} but ${skip}: `
        + "left a consumable — retype it by hand if it should be equipment" }] };
    }
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

/**
 * What cast-self-uses does with one foreign Cast activity: `{ uuid, level, name }` to repoint it,
 * `{ note }` to report it, `{}` to leave it (not looked up, or not self-spending).
 */
function repointFor(act, lookups) {
  const uuid = act?.spell?.uuid;
  if (!lookups?.spells || !(uuid in lookups.spells)) return {};     // not looked up: no opinion
  const spell = lookups.spells[uuid];
  if (!spell) return { note: `Cast activity ${act._id}: spell ${uuid} not found` };
  if (!selfSpendingActivities(spell).length) return {};
  const match = (lookups.phbSpells ?? []).find(e => spellKey(e.name) === spellKey(spell.name)) ?? null;
  if (!match) {
    return { note: `${spell.name} spends its own uses and has no PHB spell of that name: `
      + "fix the item by hand, then freeze it (scripts/foundry/fixes/2026-10-19-ddb-freeze-items.js)" };
  }
  const level = act.spell.level ?? get(spell, "system.level") ?? null;
  return { uuid: `Compendium.${PHB_SPELLS}.Item.${match._id}`, level, name: spell.name };
}

const castSelfUses = {
  id: "cast-self-uses",
  label: "Item Cast activities that spend the spell's own uses",
  doc: "A wand or other item whose Cast activity points at a DDB copy of a spell that spends its own "
    + "uses with the slot off cannot cast (\"No uses on <spell> available\") and never spends the item's "
    + "charges. The activity is repointed at the PHB spell of the same name, at the spell's level, with "
    + "the slot flag on — what the DMG's own wands do — so the item's charges are spent. A spell with no "
    + "PHB match (homebrew) is only reported: freeze that item (flags.ddbimporter.ignoreItemImport) "
    + "after a fix by hand.",
  match: (actor, item) => foreignCasts(item).length > 0,
  plan(actor, item, lookups) {
    const changes = [];
    const notes = [];
    const data = {};
    const moved = [];
    for (const act of foreignCasts(item)) {
      const r = repointFor(act, lookups);
      if (r.note) notes.push({ item: item.name, note: r.note });
      if (!r.uuid) continue;
      data[`system.activities.${act._id}.spell.uuid`] = r.uuid;
      data[`system.activities.${act._id}.spell.level`] = r.level;
      data[`system.activities.${act._id}.consumption.spellSlot`] = true;
      moved.push(r.name);
    }
    if (moved.length) {
      changes.push({ op: "updateItem", itemId: item._id, data,
        summary: `${item.name}: Cast ${moved.join(", ")} → PHB spell (spends the item's charges)` });
    }
    return { changes, notes };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  Rule 4 — a cached spell copy left behind by a repointed Cast activity                         */
/* -------------------------------------------------------------------------------------------- */

/** `flags.dnd5e.cachedFor` → `{ itemId, activityId }` (relative ".Item.x.Activity.y", or a full uuid). */
export function cachedForRef(value) {
  const m = /(?:^|\.)Item\.([^.]+)\.Activity\.([^.]+)$/.exec(String(value ?? ""));
  return m ? { itemId: m[1], activityId: m[2] } : null;
}

/**
 * The spell uuid a Cast activity points at once this run's corrections land: cast-self-uses' PHB
 * target when it repoints the activity now, else the activity's own uuid (a frozen item keeps its).
 */
function castTargetOf(parent, act, lookups) {
  const uuid = act?.spell?.uuid;
  if (!uuid || isFrozen(parent) || uuid.startsWith(`Compendium.${PHB_SPELLS}.`)) return uuid ?? null;
  if (!lookups?.spells || !(uuid in lookups.spells)) return null;   // not looked up: no opinion
  return repointFor(act, lookups).uuid ?? uuid;
}

const staleCastCache = {
  id: "stale-cast-cache",
  label: "Cached spell copies a repointed Cast activity left behind",
  doc: "dnd5e keeps a copy of a Cast activity's spell on the actor (flags.dnd5e.cachedFor). When "
    + "cast-self-uses repoints the activity at the PHB spell, the copy of the old DDB spell stays and "
    + "the spellbook lists the spell twice. A cached copy whose compendium source is not the spell its "
    + "activity now casts is deleted; dnd5e caches the right one again on the next cast. A copy with no "
    + "recorded source, or whose activity is gone, is left alone.",
  match: (actor, item) => item.type === "spell" && !!cachedForRef(get(item, "flags.dnd5e.cachedFor")),
  plan(actor, item, lookups) {
    const ref = cachedForRef(get(item, "flags.dnd5e.cachedFor"));
    const parent = (actor.items ?? []).find(i => i._id === ref.itemId);
    const act = get(parent, `system.activities.${ref.activityId}`);
    if (!parent || act?.type !== "cast" || blank(item.source)) return { changes: [], notes: [] };
    const target = castTargetOf(parent, act, lookups);
    if (!target || target === item.source) return { changes: [], notes: [] };
    return {
      changes: [{ op: "deleteItem", itemId: item._id,
        summary: `${item.name}: stale cached copy for ${parent.name} removed (it now casts another spell)` }],
      notes: [],
    };
  },
};

/* -------------------------------------------------------------------------------------------- */
/*  Rule 5 — Transmuter's Stone as pick-one passive effects                                       */
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

/** An item's advancements as a list (dnd5e 6 stores them keyed by id; older data as an array). */
const advancementsOf = item => {
  const adv = get(item, "system.advancement");
  return Array.isArray(adv) ? adv : Object.values(adv ?? {});
};

/**
 * True when an item other than the stone grants CON save proficiency: a Trait advancement that chose
 * (or grants) `saves:con` — a Resilient feat on Constitution, or a class's saving throws. A class's
 * `primary` saves count only on the starting class (`system.details.originalClass`), its `secondary`
 * ones only on a multiclass. A Resilient feat without a chosen trait falls back to its ASI assignment.
 */
export function otherConSave(actor, stone) {
  const original = get(actor, "system.details.originalClass") ?? null;
  return (actor.items ?? []).some(item => {
    if (item._id === stone?._id) return false;
    const advs = advancementsOf(item);
    const traitCon = advs.some(a => {
      if (a?.type !== "Trait") return false;
      const saves = [...(get(a, "value.chosen") ?? []), ...(get(a, "configuration.grants") ?? [])];
      if (!saves.includes("saves:con")) return false;
      if (item.type !== "class" || !a.classRestriction) return true;
      const isOriginal = original ? original === item._id : true;
      return a.classRestriction === "primary" ? isOriginal : !isOriginal;
    });
    if (traitCon) return true;
    if (!/\bresilient\b/i.test(item.name ?? "")) return false;
    return advs.some(a => a?.type === "AbilityScoreImprovement" && Number(get(a, "value.assignments.con")) > 0);
  });
}

/**
 * What the import baked into the actor's base data that the stone's effects now grant: darkvision
 * at the species' range + 60 (60 with no species darkvision) goes back to the species' range, and a
 * CON save proficiency nothing else grants goes back to none.
 */
function stoneBaked(actor, stone) {
  const species = (actor.items ?? []).find(i => i.type === "race");
  const speciesDark = Number(get(species, "system.senses.ranges.darkvision")) || 0;
  const update = {};
  if (Number(get(actor, "system.attributes.senses.ranges.darkvision")) === speciesDark + 60) {
    update["system.attributes.senses.ranges.darkvision"] = speciesDark;
  }
  if (Number(get(actor, "system.abilities.con.proficient")) === 1 && !otherConSave(actor, stone)) {
    update["system.abilities.con.proficient"] = 0;
  }
  return update;
}

const transmutersStone = {
  id: "transmuters-stone",
  label: "Transmuter's Stone as pick-one effects",
  doc: "The import gives the Transmuter's Stone feat no effects and bakes the chosen benefit into the "
    + "actor's base data (darkvision 60, or the species' + 60; CON save proficiency). The feat gets one "
    + "always-on effect (CON saves) and one pick-one effect per benefit (flags.pentaryn-riders.choice, one "
    + "at a time below Wizard 10); the baked base values are reset while they are still the stone's "
    + "(darkvision back to the species' range; CON saves kept when a class or Resilient grants them). A re-sync bakes "
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
export const RULES = Object.freeze([apparelAsEquipment, freeCastInnate, castSelfUses, staleCastCache, transmutersStone]);

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
 * whose importId differs from the actor's marks a sync since the last correction. A stamp written by
 * another module version is due too (1.2.1): a release that adds or changes a rule re-applies once to
 * every DDB character at the next GM login (the rules are idempotent; a stamp with no version is left
 * to the importId test).
 * @param {object} actor  the snapshot
 * @param {{version?: string}} [opts]  the running module version (default VERSION)
 */
export function needsCorrection(actor, { version = VERSION } = {}) {
  if (!actor?.ddb) return false;
  const stamp = actor.stamp;
  if (!stamp || typeof stamp !== "object") return true;
  if (typeof stamp.version === "string" && version && stamp.version !== version) return true;
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
