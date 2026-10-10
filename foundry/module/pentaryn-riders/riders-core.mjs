/**
 * Pentaryn Riders — pure logic
 * ============================
 *
 * Everything here is plain data in, plain data out: no `game`, no `foundry`, no `CONFIG`. The
 * module file (`riders.mjs`) turns real dnd5e rolls and actors into the shapes below, calls these,
 * and writes the result back. `node test/run.mjs` imports this file bare, which is the proof that
 * it stays pure.
 *
 * Shapes
 * ------
 * A **term descriptor** mirrors one Foundry roll term, only as far as the riders care:
 *
 *     { kind: "die", number, faces, modifiers: ["r1"], flavor }   // foundry.dice.terms.Die
 *     { kind: "op",  operator: "+" }                              // OperatorTerm
 *     { kind: "num", number, flavor }                             // NumericTerm
 *     { kind: "other", text, flavor }                             // anything else (left alone)
 *
 * A **feature** is an item on the actor that matched a rule, already resolved:
 *
 *     { key: "elemental-adept", types: ["fire"] }      // typed rules carry their chosen types
 */

export const MOD = "pentaryn-riders";

/** The damage types each typed feature may choose from (2024 PHB). */
export const ADEPT_TYPES = Object.freeze(["acid", "cold", "fire", "lightning", "thunder"]);
export const AFFINITY_TYPES = Object.freeze(["acid", "cold", "fire", "lightning", "poison"]);

const PHB = "Compendium.dnd-players-handbook";

/**
 * The rules table. One row per feature. A row is active for an actor while the actor owns an item
 * that matches `match` (dnd5e identifier, compendium source, or name with any "(Fire)" suffix
 * ignored). `when` narrows which rolls it touches; `effect` says what it does.
 *
 *   when.spell            the roll comes from a spell item (scrolls and wands cast spells too)
 *   when.cantrip          ...and that spell is level 0
 *   when.classIdentifier  ...and the spell belongs to this class (falls back to the actor's only
 *                         spellcasting class when the spell names none)
 *   when.rolls            "damage" (default) or "healing"
 *   when.rollTypes        ...and only rolls of these types (Healer: "healing", not temp/max HP)
 *
 *   effect.dieModifier    added to every die of a matching roll: "min2" (1s count as 2), "r1"
 *   effect.bonus          an ability key; its modifier is added once to one matching roll
 *   effect.unlessCarried  skip the bonus when the activity's damage formula already adds that
 *                         ability's mod (`carriedAbilities`). Only for rules where the PHB spells
 *                         never add it themselves — no PHB druid/cleric cantrip adds WIS — so a
 *                         carried one is a hand edit. Not on Elemental Affinity: Alter Self's
 *                         natural weapons and Green-Flame Blade add the mod legitimately.
 *   effect.once           "casting": a spell that makes several attack rolls from one card
 *                         (Scorching Ray) gets the bonus on the first damage roll only
 *   effect.ignoreResistance  the damage tray starts with the target's resistance to the
 *                         feature's types switched off (the GM can switch it back on)
 *
 * `types` (typed rules only) lists the choices; the chosen one is resolved per item, see
 * `resolveTypes`.
 */
export const RULES = Object.freeze([
  Object.freeze({
    key: "elemental-adept",
    label: "Elemental Adept",
    match: {
      identifiers: ["elemental-adept"],
      sources: [`${PHB}.feats.Item.phbftElementalAd`],
      names: ["Elemental Adept"]
    },
    types: ADEPT_TYPES,
    when: { spell: true, rolls: "damage" },
    effect: { dieModifier: "min2", ignoreResistance: true }
  }),
  Object.freeze({
    key: "elemental-affinity",
    label: "Elemental Affinity",
    match: {
      identifiers: ["elemental-affinity"],
      sources: [`${PHB}.classes.Item.phbscrElementalA`],
      names: ["Elemental Affinity"]
    },
    types: AFFINITY_TYPES,
    when: { spell: true, rolls: "damage" },
    effect: { bonus: "cha", once: "casting" }
  }),
  Object.freeze({
    key: "potent-spellcasting-druid",
    label: "Potent Spellcasting",
    match: {
      identifiers: ["elemental-fury-potent-spellcasting"],
      sources: [`${PHB}.classes.Item.phbFuryPotentSpe`],
      names: ["Elemental Fury: Potent Spellcasting", "Potent Spellcasting"]
    },
    when: { spell: true, cantrip: true, classIdentifier: "druid", rolls: "damage" },
    effect: { bonus: "wis", unlessCarried: true }
  }),
  Object.freeze({
    key: "potent-spellcasting-cleric",
    label: "Potent Spellcasting",
    match: {
      identifiers: ["blessed-strikes-potent-spellcasting"],
      sources: [`${PHB}.classes.Item.phbClcPotentSpel`],
      names: ["Blessed Strikes: Potent Spellcasting", "Potent Spellcasting"]
    },
    when: { spell: true, cantrip: true, classIdentifier: "cleric", rolls: "damage" },
    effect: { bonus: "wis", unlessCarried: true }
  }),
  Object.freeze({
    key: "healer",
    label: "Healer",
    match: {
      identifiers: ["healer"],
      sources: [`${PHB}.feats.Item.phbftHealer00000`],
      names: ["Healer"]
    },
    // "Hit Points you restore": temp HP (False Life) and max HP (Heroes' Feast) are not restored.
    when: { spell: true, rolls: "healing", rollTypes: ["healing"] },
    effect: { dieModifier: "r1" }
  })
]);

export const ruleByKey = key => RULES.find(r => r.key === key) ?? null;

/* -------------------------------------------- */
/*  Matching features                           */
/* -------------------------------------------- */

/** "Elemental Adept (Fire)" → "elemental adept". Lower case, no parenthetical, single spaces. */
export function normalizeName(name) {
  return String(name ?? "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Does this item match the rule?
 * @param {object} rule
 * @param {{identifier?: string, source?: string, name?: string, type?: string}} item
 */
export function matchRule(rule, item) {
  if (!rule || !item) return false;
  if (item.type && !["feat", "class", "subclass"].includes(item.type)) return false;
  const m = rule.match ?? {};
  if (item.identifier && (m.identifiers ?? []).includes(item.identifier)) return true;
  if (item.source && (m.sources ?? []).includes(item.source)) return true;
  const n = normalizeName(item.name);
  return !!n && (m.names ?? []).some(x => normalizeName(x) === n);
}

/**
 * The damage types a typed feature item stands for, most explicit source first:
 *   1. `flags.pentaryn-riders.damageType` (string or array) — set by `setType`;
 *   2. a parenthetical in the item name: "Elemental Adept (Fire)";
 *   3. the item's own damage activities, when they name exactly one allowed type
 *      (an Elemental Affinity trimmed to its Fire activity).
 * Returns [] when none of these says — the rule then stays off and `report()` says why.
 * @param {{flagType?: string|string[], name?: string, activityTypes?: string[]}} item
 * @param {readonly string[]} allowed
 */
export function resolveTypes({ flagType, name, activityTypes } = {}, allowed = []) {
  const ok = t => allowed.includes(t);
  const clean = list => [...new Set(list.map(t => String(t).toLowerCase().trim()).filter(ok))];

  if (flagType) {
    const flagged = clean(Array.isArray(flagType) ? flagType : [flagType]);
    if (flagged.length) return flagged;
  }
  const paren = /\(([^)]*)\)/.exec(String(name ?? ""));
  if (paren) {
    const named = clean(paren[1].split(/[\s,/&]+|\band\b/i));
    if (named.length) return named;
  }
  const own = clean(activityTypes ?? []);
  if (own.length === 1) return own;
  return [];
}

/* -------------------------------------------- */
/*  Terms and formulas                          */
/* -------------------------------------------- */

/**
 * The damage type of each term, the way dnd5e's `chunkTerms` reads it: "+" and "-" split chunks;
 * a chunk takes the first flavor that names a damage type, else the roll's own type.
 * The "+" / "-" operators themselves get `null`; "*" and "/" belong to their chunk.
 * @param {object[]} terms     term descriptors
 * @param {string} rollType    the roll's `options.type`
 * @param {(t: string) => boolean} isType
 * @returns {(string|null)[]}
 */
export function termTypes(terms, rollType, isType) {
  const out = new Array(terms.length).fill(null);
  let chunk = [];
  let chunkType = null;
  const flush = () => {
    for (const i of chunk) out[i] = chunkType ?? rollType ?? null;
    chunk = [];
    chunkType = null;
  };
  terms.forEach((t, i) => {
    if (t.kind === "op" && (t.operator === "+" || t.operator === "-")) { flush(); return; }
    chunk.push(i);
    const f = String(t.flavor ?? "").toLowerCase().trim();
    if (f && isType(f)) chunkType ??= f;
  });
  flush();
  return out;
}

/**
 * Indices of the dice a typed die modifier applies to. `types` null = every die.
 * @returns {number[]}
 */
export function planDice(terms, { rollType, types = null, isType = () => false } = {}) {
  const typed = termTypes(terms, rollType, isType);
  const hits = [];
  terms.forEach((t, i) => {
    if (t.kind !== "die") return;
    if (types && !types.includes(typed[i])) return;
    hits.push(i);
  });
  return hits;
}

/**
 * Add one modifier to a die's modifier list without doubling up.
 *   min<n>: an existing min ≥ n stays; a lower one is raised.
 *   r<n>:   skipped if the die already rerolls (r or rr) anything.
 * @param {string[]} modifiers
 * @param {string} mod   "min2" | "r1" | …
 * @returns {string[]|null}  the new list, or null when nothing changes
 */
export function withModifier(modifiers, mod) {
  const list = [...(modifiers ?? [])];
  const min = /^min(\d+)$/i.exec(mod);
  if (min) {
    const want = Number(min[1]);
    const at = list.findIndex(m => /^min\d+$/i.test(m));
    if (at === -1) return [...list, `min${want}`];
    const have = Number(/^min(\d+)$/i.exec(list[at])[1]);
    if (have >= want) return null;
    list[at] = `min${want}`;
    return list;
  }
  if (/^r\d+$/i.test(mod)) {
    if (list.some(m => /^rr?(?:[<>=]*\d+)?$/i.test(m))) return null;
    return [...list, mod];
  }
  if (list.includes(mod)) return null;
  return [...list, mod];
}

const DIE_RX = /^(\d*)d(\d+)((?:[a-z]+[0-9<>=]*)*)(?:\[([^\]]*)\])?/i;
const MOD_RX = /([a-z]+[0-9<>=]*)/gi;
const NUM_RX = /^(\d+(?:\.\d+)?)(?:\[([^\]]*)\])?/;

/**
 * A small tokenizer for flat formulas ("8d6min2[fire] + 4[Elemental Affinity]"). It exists so the
 * transforms can be shown and tested on strings; the live module works on real Foundry terms.
 * Parenthesised groups, functions and @references become `other` and are never changed.
 */
export function parseFormula(formula) {
  const s = String(formula ?? "");
  const out = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if ("+-*/".includes(c)) { out.push({ kind: "op", operator: c }); i++; continue; }
    const rest = s.slice(i);
    let m = DIE_RX.exec(rest);
    if (m) {
      out.push({
        kind: "die", number: m[1] === "" ? 1 : Number(m[1]), faces: Number(m[2]),
        modifiers: m[3] ? m[3].match(MOD_RX) : [], flavor: m[4] ?? ""
      });
      i += m[0].length;
      continue;
    }
    m = NUM_RX.exec(rest);
    if (m) { out.push({ kind: "num", number: Number(m[1]), flavor: m[2] ?? "" }); i += m[0].length; continue; }
    // Anything else up to the next top-level + - * / or space.
    let j = i;
    let depth = 0;
    while (j < s.length) {
      const d = s[j];
      if (d === "(" || d === "[" || d === "{") depth++;
      else if (d === ")" || d === "]" || d === "}") depth--;
      else if (depth <= 0 && (/\s/.test(d) || "+-*/".includes(d))) break;
      j++;
    }
    out.push({ kind: "other", text: s.slice(i, j), flavor: "" });
    i = j;
  }
  return out;
}

/** The inverse of `parseFormula`, spaced the way Foundry prints formulas. */
export function formatTerms(terms) {
  const fl = f => (f ? `[${f}]` : "");
  return terms.map(t => {
    if (t.kind === "op") return ` ${t.operator} `;
    if (t.kind === "die") return `${t.number}d${t.faces}${(t.modifiers ?? []).join("")}${fl(t.flavor)}`;
    if (t.kind === "num") return `${t.number}${fl(t.flavor)}`;
    return t.text ?? "";
  }).join("").trim();
}

/**
 * The bonus term a rider appends: `+ <value>[label]`, or `- <value>` for a negative modifier.
 * The label is the flavor, except when the roll is of another type than the one the bonus is
 * for, in which case the flavor is the damage type, so dnd5e still types the bonus correctly.
 */
export function bonusTerms(value, { label, type, rollType } = {}) {
  const flavor = type && rollType && type !== rollType ? type : (label ?? "");
  return [
    { kind: "op", operator: value < 0 ? "-" : "+" },
    { kind: "num", number: Math.abs(value), flavor }
  ];
}

/**
 * Apply a die modifier (to dice of `types`, or all) and/or a bonus to a formula string.
 * Exactly what the module does to a real roll, as a string, for tests and for `preview()`.
 */
export function transformFormula(formula, { rollType, types = null, modifier = null, bonus = null, isType = () => false } = {}) {
  const terms = parseFormula(formula);
  if (modifier) {
    for (const i of planDice(terms, { rollType, types, isType })) {
      const next = withModifier(terms[i].modifiers, modifier);
      if (next) terms[i].modifiers = next;
    }
  }
  if (bonus && bonus.value) terms.push(...bonusTerms(bonus.value, { ...bonus, rollType }));
  return formatTerms(terms);
}

/**
 * Which ability modifiers a set of damage formulas already adds as a term: `@abilities.<key>.mod`
 * names the key outright; a bare `@mod` is the activity's own ability. Only an added term counts —
 * the start of the formula or after `+`, `(`, `,` or a space — so Sorcerous Burst's explode limit
 * `1d8x@mod=8` is not a bonus. Talo's world cantrips carried a hand-added `@abilities.wis.mod`.
 * @param {string[]} formulas         each damage part's bonus / custom formula
 * @param {string} [activityAbility]  the activity's ability, for `@mod`
 * @returns {string[]}
 */
export function carriedAbilities(formulas, activityAbility = "") {
  const out = new Set();
  for (const f of formulas ?? []) {
    const s = String(f ?? "");
    for (const m of s.matchAll(/(?:^|[+(,\s])@abilities\.([a-z]{3})\.mod\b/gi)) out.add(m[1].toLowerCase());
    if (activityAbility && /(?:^|[+(,\s])@mod\b/i.test(s)) out.add(String(activityAbility).toLowerCase());
  }
  return [...out];
}

/* -------------------------------------------- */
/*  Planning the riders for one roll set        */
/* -------------------------------------------- */

/**
 * Decide what the active riders do to one damage roll (one activity's `rolls` array).
 *
 * @param {object} ctx
 * @param {{key: string, types?: string[]}[]} ctx.features  active, resolved features on the actor
 * @param {{isSpell: boolean, level?: number, classIdentifier?: string, casterClasses?: string[]}} ctx.item
 * @param {{type: string, healing: boolean, types: string[]}[]} ctx.rolls
 *        per roll: its type, whether it heals, and the damage types its dice/terms carry
 * @param {Record<string, number>} ctx.abilities  ability modifiers, { cha: 4, wis: 3 }
 * @param {string[]} [ctx.item.carries]  ability keys whose modifier the activity's own damage
 *        formula already adds (a hand-added `@abilities.wis.mod`); a bonus rider for that ability
 *        is skipped so it is never counted twice — see `carriedAbilities`
 * @param {string} [ctx.activityType]  "attack" enables the once-per-casting guard
 * @param {string[]} [ctx.usedThisCasting]  rule keys already applied from the same card
 * @returns {{dice: {roll: number, modifier: string, types: string[]|null, key: string}[],
 *            bonuses: {roll: number, value: number, label: string, type: string|null, key: string}[],
 *            ignoreResistance: string[], applied: string[], skipped: {key: string, why: string}[]}}
 */
export function planRiders({ features = [], item = {}, rolls = [], abilities = {}, activityType = "", usedThisCasting = [] } = {}) {
  const plan = { dice: [], bonuses: [], ignoreResistance: [], applied: [], skipped: [] };
  const used = new Set(usedThisCasting);

  for (const f of features) {
    const rule = ruleByKey(f.key);
    if (!rule) continue;
    const w = rule.when ?? {};
    const e = rule.effect ?? {};

    if (w.spell && !item.isSpell) continue;
    if (w.cantrip && Number(item.level) !== 0) continue;
    if (w.classIdentifier) {
      const own = item.classIdentifier
        || ((item.casterClasses ?? []).length === 1 ? item.casterClasses[0] : "");
      if (own !== w.classIdentifier) continue;
    }

    const wantHealing = w.rolls === "healing";
    const types = rule.types ? (f.types ?? []) : null;
    if (rule.types && !types.length) { plan.skipped.push({ key: rule.key, why: "no-type" }); continue; }

    // Rolls this rule may touch: the right kind (damage vs healing), and of its type if typed.
    const eligible = rolls
      .map((r, index) => ({ ...r, index }))
      .filter(r => !!r.healing === wantHealing)
      .filter(r => !w.rollTypes || w.rollTypes.includes(r.type))
      .filter(r => !types || types.some(t => (r.types ?? [r.type]).includes(t)));
    if (!eligible.length) continue;

    let did = false;

    if (e.dieModifier) {
      for (const r of eligible) plan.dice.push({ roll: r.index, modifier: e.dieModifier, types, key: rule.key });
      did = true;
    }

    if (e.bonus) {
      const value = Number(abilities[e.bonus] ?? 0);
      if (!value) plan.skipped.push({ key: rule.key, why: "zero-modifier" });
      else if (e.unlessCarried && (item.carries ?? []).includes(e.bonus)) plan.skipped.push({ key: rule.key, why: "already-in-formula" });
      else if (e.once === "casting" && activityType === "attack" && used.has(rule.key)) {
        plan.skipped.push({ key: rule.key, why: "once-per-casting" });
      } else {
        // Prefer the roll whose own type matches, so the bonus is typed by the roll itself.
        const target = (types && eligible.find(r => types.includes(r.type))) ?? eligible[0];
        const type = types ? (types.includes(target.type) ? target.type : types.find(t => (target.types ?? []).includes(t)) ?? null) : null;
        plan.bonuses.push({ roll: target.index, value, label: rule.label, type, key: rule.key });
        did = true;
      }
    }

    if (e.ignoreResistance && types) {
      for (const t of types) if (!plan.ignoreResistance.includes(t)) plan.ignoreResistance.push(t);
      did = true;
    }

    if (did && !plan.applied.includes(rule.key)) plan.applied.push(rule.key);
  }
  return plan;
}

/* -------------------------------------------- */
/*  Hit Dice                                    */
/* -------------------------------------------- */

/**
 * Which hit die to spend: the largest size that still has one. The patient picks in the rules;
 * the largest is what anyone picks.
 * @param {{id: string|null, faces: number, value: number, spent: number}[]} pools
 * @returns {object|null}  the pool to spend from
 */
export function pickSpend(pools) {
  return [...(pools ?? [])].filter(p => p.value > 0 && p.faces > 0).sort((a, b) => b.faces - a.faces)[0] ?? null;
}

/** Which hit die to give back: the largest size that has one spent. */
export function pickRestore(pools) {
  return [...(pools ?? [])].filter(p => p.spent > 0 && p.faces > 0).sort((a, b) => b.faces - a.faces)[0] ?? null;
}

/** Battle Medic: the patient's hit die, a 1 rerolled once (Healing Rerolls), plus the healer's PB. */
export function battleMedicFormula(faces, prof) {
  const f = Math.max(1, Math.trunc(Number(faces) || 0));
  const p = Math.trunc(Number(prof) || 0);
  return p > 0 ? `1d${f}r1 + ${p}` : `1d${f}r1`;
}

/** The most a Battle Medic roll can heal; the GM clamps a player's number to this. */
export function clampHeal(amount, faces, prof) {
  const n = Math.round(Number(amount) || 0);
  const max = Math.max(0, Math.trunc(Number(faces) || 0)) + Math.max(0, Math.trunc(Number(prof) || 0));
  return Math.max(0, Math.min(n, max));
}
