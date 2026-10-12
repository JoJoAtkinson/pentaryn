/**
 * pentaryn-prompts — the pure half of `with: {kind: "npc", npc, features}` (no `game`, node-tested).
 *
 * The npc kind used to be expanded by the bridge server (dnd5e-create-npc + dnd5e-add-feature),
 * so it only worked through the MCP tool. It now runs in the module (npc-adapter.mjs), against the same
 * `foundry-mcp-bridge.*` query handlers those tools call, so the eval-js path builds npcs too.
 * This file is the argument checking those tools did with zod: the same fields, enums, ranges
 * and defaults (sourceRules "2014", spells from "dnd5e.spells", exactly as the tools defaulted them), so an
 * npc that dry-runs here creates there. Unknown keys are refused (with the known ones listed), which
 * the tools' zod silently dropped.
 */

export const NPC_SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan"]);
export const CREATURE_TYPES = Object.freeze(["humanoid", "undead", "beast", "dragon", "aberration", "construct", "elemental",
  "fey", "fiend", "giant", "monstrosity", "ooze", "plant", "celestial", "swarm"]);
export const ABILITY_KEYS = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const SKILL_NAMES = Object.freeze(["Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History", "Insight",
  "Intimidation", "Investigation", "Medicine", "Nature", "Perception", "Performance", "Persuasion", "Religion", "Sleight of Hand",
  "Stealth", "Survival"]);
export const DAMAGE_TYPES = Object.freeze(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing",
  "poison", "psychic", "radiant", "slashing", "thunder"]);
export const CONDITIONS = Object.freeze(["blinded", "charmed", "deafened", "exhaustion", "frightened", "grappled", "incapacitated",
  "invisible", "paralyzed", "petrified", "poisoned", "prone", "restrained", "stunned", "unconscious"]);
export const WEAPON_PROPERTIES = Object.freeze(["ada", "amm", "fin", "fir", "foc", "hvy", "lgt", "lod", "mgc", "rch", "ret", "spc",
  "thr", "two", "ver"]);
export const FEATURE_TYPES = Object.freeze(["passive", "save", "attack", "attack-with-save", "aura", "spellcasting", "spells"]);
export const SPELLCASTING_CLASSES = Object.freeze({ wizard: "int", artificer: "int", cleric: "wis", druid: "wis", ranger: "wis",
  sorcerer: "cha", warlock: "cha", bard: "cha", paladin: "cha" });

/** featureType → the `foundry-mcp-bridge.<query>` the tool used. */
export const FEATURE_QUERY = Object.freeze({
  passive: "addPassiveFeatureToActor", save: "addSaveFeatureToActor", attack: "addAttackToActor",
  "attack-with-save": "addAttackWithSaveToActor", aura: "addAuraToActor", spellcasting: "setActorSpellcasting",
  spells: "addSpellsToActor"
});

/* ── a tiny validator: field specs → defaults, errors, unknown keys ─────── */

const isInt = v => Number.isInteger(v);
const T = {
  str: (min = 0) => ({ check: v => typeof v === "string" && v.length >= min, want: min ? "a non-empty string" : "a string" }),
  int: (min = -Infinity, max = Infinity) => ({ check: v => isInt(v) && v >= min && v <= max, want: `a whole number${Number.isFinite(min) ? ` >= ${min}` : ""}${Number.isFinite(max) ? ` <= ${max}` : ""}` }),
  num: (min = -Infinity, gt = false) => ({ check: v => typeof v === "number" && Number.isFinite(v) && (gt ? v > min : v >= min), want: `a number ${gt ? ">" : ">="} ${min}` }),
  bool: () => ({ check: v => typeof v === "boolean", want: "true or false" }),
  one: list => ({ check: v => list.includes(v), want: list.map(x => (x === "" ? '""' : x)).join(" | ") }),
  strs: () => ({ check: v => Array.isArray(v) && v.every(x => typeof x === "string"), want: "a list of strings" }),
  any: () => ({ check: () => true, want: "" })
};

/**
 * Apply `spec` (`{field: {type, req?, def?}}`) to `raw`: defaults filled, required checked, every
 * value type-checked, unknown keys refused. → `{args, errors}`.
 */
function apply(raw, spec, where) {
  const errors = [];
  const args = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { args, errors: [`${where} must be an object`] };
  const extra = Object.keys(raw).filter(k => !(k in spec));
  if (extra.length) errors.push(`${where}: unknown key(s) ${extra.join(", ")} (known: ${Object.keys(spec).join(", ")})`);
  for (const [k, f] of Object.entries(spec)) {
    let v = raw[k];
    if (v === undefined) {
      if (f.req) { errors.push(`${where}.${k} is required (${f.type.want})`); continue; }
      if (f.def === undefined) continue;
      v = typeof f.def === "function" ? f.def() : f.def;
    } else if (!f.type.check(v)) {
      errors.push(`${where}.${k}: expected ${f.type.want}, got ${JSON.stringify(v)}`);
      continue;
    }
    args[k] = v;
  }
  return { args, errors };
}

/* ── the npc ─────────────────────────────────────────────────────────────── */

const NPC_SPEC = {
  name: { type: T.str(1), req: true },
  creatureType: { type: T.one(CREATURE_TYPES), req: true },
  creatureSubtype: { type: T.str(), def: "" },
  size: { type: T.one(NPC_SIZES), req: true },
  alignment: { type: T.str(), def: "" },
  cr: { type: { check: v => (typeof v === "string" && /^\d+(\/[248])?$/.test(v)) || (typeof v === "number" && Number.isFinite(v) && v >= 0),
    want: 'a CR like "0", "1/4", "1/2", "5" or a number' }, req: true },
  hpAverage: { type: T.int(1), req: true },
  hpFormula: { type: T.str(1), req: true },
  acMode: { type: T.one(["default", "flat"]), req: true },
  acValue: { type: T.int(0, 30) },
  abilities: { type: { check: v => v && typeof v === "object" && !Array.isArray(v), want: "{str, dex, con, int, wis, cha}" }, req: true },
  savingThrows: { type: { check: v => Array.isArray(v) && v.every(x => ABILITY_KEYS.includes(x)), want: "a list of str|dex|con|int|wis|cha" }, def: () => [] },
  walkSpeed: { type: T.int(0), def: 30 },
  flySpeed: { type: T.int(0), def: 0 },
  swimSpeed: { type: T.int(0), def: 0 },
  climbSpeed: { type: T.int(0), def: 0 },
  burrowSpeed: { type: T.int(0), def: 0 },
  hover: { type: T.bool(), def: false },
  darkvision: { type: T.int(0), def: 0 },
  blindsight: { type: T.int(0), def: 0 },
  tremorsense: { type: T.int(0), def: 0 },
  truesight: { type: T.int(0), def: 0 },
  specialSenses: { type: T.str(), def: "" },
  skills: { type: { check: v => Array.isArray(v), want: "a list of {skill, proficiency}" }, def: () => [] },
  damageImmunities: { type: T.strs(), def: () => [] },
  damageResistances: { type: T.strs(), def: () => [] },
  damageVulnerabilities: { type: T.strs(), def: () => [] },
  conditionImmunities: { type: T.strs(), def: () => [] },
  languages: { type: T.strs(), def: () => [] },
  languagesCustom: { type: T.str(), def: "" },
  biography: { type: T.str(), def: "" },
  sourceBook: { type: T.str(), def: "" },
  sourcePage: { type: T.str(), def: "" },
  sourceRules: { type: T.one(["2014", "2024"]), def: "2014" }
};

export const NPC_KEYS = Object.freeze(Object.keys(NPC_SPEC));

/**
 * `npc` (the dnd5e-create-npc arguments) → `{ok, errors, warnings, args}` with every default filled.
 * Languages are left as given; npc-adapter.mjs turns them into dnd5e keys against CONFIG.
 */
export function normaliseNpc(raw) {
  const { args, errors } = apply(raw, NPC_SPEC, "npc");
  const warnings = [];
  if (args.acMode === "flat" && args.acValue === undefined) errors.push("npc.acValue is required when acMode is \"flat\"");
  if (args.abilities) {
    const bad = ABILITY_KEYS.filter(k => !(isInt(args.abilities[k]) && args.abilities[k] >= 1 && args.abilities[k] <= 30));
    const extra = Object.keys(args.abilities).filter(k => !ABILITY_KEYS.includes(k));
    if (bad.length) errors.push(`npc.abilities: ${bad.join(", ")} must be whole numbers 1-30 (all six are required)`);
    if (extra.length) errors.push(`npc.abilities: unknown ${extra.join(", ")} (str dex con int wis cha)`);
  }
  for (const [i, s] of (args.skills ?? []).entries()) {
    if (!s || !SKILL_NAMES.includes(s.skill) || !["proficient", "expert"].includes(s.proficiency)) {
      errors.push(`npc.skills[${i}]: {skill: ${SKILL_NAMES.join("|")}, proficiency: proficient|expert}`);
    }
  }
  for (const f of ["damageImmunities", "damageResistances", "damageVulnerabilities"]) {
    for (const v of args[f] ?? []) if (!DAMAGE_TYPES.includes(v)) warnings.push(`npc.${f}: unknown damage type "${v}"`);
  }
  for (const v of args.conditionImmunities ?? []) if (!CONDITIONS.includes(v)) warnings.push(`npc.conditionImmunities: unknown condition "${v}"`);
  return { ok: !errors.length, errors, warnings, args };
}

/* ── features ────────────────────────────────────────────────────────────── */

const damagePart = { check: v => v && isInt(v.number) && v.number >= 1 && [4, 6, 8, 10, 12, 20, 100].includes(v.denomination)
  && typeof v.type === "string" && v.type.length > 0, want: "{number >= 1, denomination 4|6|8|10|12|20|100, type}" };
const parts = { check: v => Array.isArray(v) && v.length > 0 && v.every(p => damagePart.check(p)), want: `a non-empty list of ${damagePart.want}` };
const ACT = ["action", "bonus", "reaction", "legendary", "lair", "special"];
const AREA = ["cone", "cube", "cylinder", "emanation", "line", "radius", "sphere"];
const ABIL = T.one(ABILITY_KEYS);

const common = {
  featureType: { type: T.one(FEATURE_TYPES), req: true },
  recharge: { type: T.int(2, 6) },
  actorIdentifier: { type: T.any() }
};
const named = { featureName: { type: T.str(1), req: true }, description: { type: T.str(), def: "" } };
const source = { sourceRules: { type: T.one(["2014", "2024"]), def: "2014" }, sourceBook: { type: T.str(), def: "" }, sourcePage: { type: T.str(), def: "" } };
const weapon = {
  activationType: { type: T.one(ACT), def: "action" },
  attackType: { type: T.one(["melee", "ranged"]), req: true },
  weaponClass: { type: T.one(["natural", "simpleM", "martialM", "simpleR", "martialR"]), def: "natural" },
  abilityModifier: { type: ABIL },
  attackBonus: { type: T.int(0, 10), def: 0 },
  proficient: { type: T.bool(), def: true },
  equipped: { type: T.bool(), def: true },
  reachFt: { type: T.int(5), def: 5 },
  rangeFt: { type: T.int(1) },
  longRangeFt: { type: T.int(1) },
  damageParts: { type: parts, req: true },
  properties: { type: T.strs(), def: () => [] }
};

const FEATURE_SPEC = {
  passive: { ...common, ...named, ...source },
  save: { ...common, ...named, activationType: { type: T.one(ACT), def: "action" }, saveAbility: { type: ABIL, req: true },
    saveDC: { type: T.int(1, 30), req: true }, damageParts: { type: parts, req: true }, halfOnSave: { type: T.bool(), def: true },
    areaType: { type: T.one([...AREA, ""]), def: "" }, areaSize: { type: T.num(0, true) }, areaUnits: { type: T.one(["ft", "m"]), def: "ft" },
    affectsType: { type: T.one(["creature", "object", "space", ""]), def: "creature" } },
  attack: { ...common, ...named, ...weapon, ...source },
  "attack-with-save": { ...common, ...named, ...weapon, saveAbility: { type: ABIL, req: true }, saveDC: { type: T.int(1, 30), req: true },
    saveDamageParts: { type: parts, req: true }, saveOnSave: { type: T.one(["half", "none"]), def: "none" }, ...source },
  aura: { ...common, ...named, activationType: { type: T.one(ACT), def: "action" }, damageParts: { type: parts, req: true },
    areaType: { type: T.one(AREA), req: true }, areaSize: { type: T.num(0, true), req: true }, areaUnits: { type: T.one(["ft", "m"]), def: "ft" },
    affectsType: { type: T.one(["creature", "object", "space", ""]), def: "creature" }, ...source },
  spellcasting: { ...common, spellcastingClass: { type: T.one(Object.keys(SPELLCASTING_CLASSES)), req: true },
    spellcastingLevel: { type: T.int(1, 20), req: true }, spellcastingAbility: { type: ABIL }, sourceRules: { type: T.one(["2014", "2024"]), def: "2014" } },
  spells: { ...common, spellNames: { type: { check: v => Array.isArray(v) && v.length >= 1 && v.length <= 50 && v.every(x => typeof x === "string" && x),
    want: "1-50 spell names" }, req: true },
  compendiumPacks: { type: T.strs(), def: () => ["dnd5e.spells"] } }
};

/**
 * One `features[]` entry (dnd5e-add-feature arguments without actorIdentifier, plus `recharge`) →
 * `{ok, errors, warnings, query, args, recharge, label}`. `args` is what the bridge query takes
 * (actorIdentifier is filled in when the actor exists; `effectiveAbility` added where the tool
 * added it). `recharge` is applied afterwards by the patch (by feature name).
 */
export function normaliseFeature(raw, index = 0) {
  const where = `features[${index}]`;
  const type = raw?.featureType;
  if (!FEATURE_TYPES.includes(type)) {
    return { ok: false, errors: [`${where}.featureType must be one of ${FEATURE_TYPES.join(" | ")}`], warnings: [], args: null };
  }
  const { args, errors } = apply(raw, FEATURE_SPEC[type], where);
  const warnings = [];
  delete args.actorIdentifier;
  const recharge = args.recharge ?? null;
  delete args.recharge;
  if (recharge && ["spellcasting", "spells"].includes(type)) errors.push(`${where}.recharge: not for ${type}`);
  if (type === "save" && args.areaType && args.areaSize === undefined) errors.push(`${where}.areaSize is required when areaType is "${args.areaType}"`);
  if (type === "attack" || type === "attack-with-save") {
    if (args.attackType === "ranged" && args.rangeFt === undefined) errors.push(`${where}.rangeFt is required when attackType is "ranged"`);
    if (args.longRangeFt !== undefined && args.rangeFt !== undefined && args.longRangeFt <= args.rangeFt) {
      errors.push(`${where}.longRangeFt (${args.longRangeFt}) must be greater than rangeFt (${args.rangeFt})`);
    }
    args.effectiveAbility = args.abilityModifier ?? (args.attackType === "melee" ? "str" : "dex");
    for (const p of args.properties ?? []) if (!WEAPON_PROPERTIES.includes(p)) warnings.push(`${where}: unknown weapon property "${p}"`);
  }
  if (type === "spellcasting") args.effectiveAbility = args.spellcastingAbility ?? SPELLCASTING_CLASSES[args.spellcastingClass];
  for (const p of [...(args.damageParts ?? []), ...(args.saveDamageParts ?? [])]) {
    if (!DAMAGE_TYPES.includes(p.type)) warnings.push(`${where}: unknown damage type "${p.type}"`);
  }
  if (recharge && !args.featureName) errors.push(`${where}.recharge needs featureName`);
  const label = args.featureName ?? (type === "spellcasting" ? `spellcasting (${args.spellcastingClass} ${args.spellcastingLevel})` : type === "spells" ? `spells (${(args.spellNames ?? []).length})` : type);
  return { ok: !errors.length, errors, warnings, query: FEATURE_QUERY[type], args, recharge, label };
}

/**
 * The whole `with` of an npc replacement → `{ok, errors, warnings, npc, features, recharge}`;
 * `recharge` is `{featureName: n}` for the patch to apply once the features exist.
 */
export function checkNpcSpec(w) {
  const errors = [], warnings = [];
  const n = normaliseNpc(w?.npc);
  errors.push(...n.errors);
  warnings.push(...n.warnings);
  if (w?.features !== undefined && !Array.isArray(w.features)) errors.push("features must be a list");
  const features = [];
  const recharge = {};
  (Array.isArray(w?.features) ? w.features : []).forEach((f, i) => {
    const r = normaliseFeature(f, i);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (r.ok) {
      features.push(r);
      if (r.recharge) recharge[r.args.featureName] = r.recharge;
    }
  });
  if (features.length > 40) errors.push("features: at most 40");
  return { ok: !errors.length, errors, warnings, npc: n.args, features, recharge };
}
