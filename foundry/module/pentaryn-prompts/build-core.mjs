/**
 * pentaryn-prompts — the pure half of building things from prompts (no `game`, node-tested).
 *
 * Ability budgets for player characters (the 2024 PHB's standard array / point buy, background
 * increases, level ASIs), matching a caller's short choice words against dnd5e's trait keys, and
 * the lookup order for per-advancement choices. character-adapter.mjs is the Foundry half.
 */

// cropsDecision, specFileUrl and sameName live in core/text.mjs; gather.mjs, replace.mjs and core/pool.mjs
// import them from there. build-core keeps re-exporting all three because they are part of its pinned
// surface (golden/core-exports.json).
import { cropsDecision, specFileUrl, sameName } from "./core/text.mjs";
export { cropsDecision, specFileUrl, sameName };

export const ABILITIES = Object.freeze(["str", "dex", "con", "int", "wis", "cha"]);
export const STANDARD_ARRAY = Object.freeze([15, 14, 13, 12, 10, 8]);
/** 2024 PHB point-buy cost per score, 27 points. */
export const POINT_COST = Object.freeze({ 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 });
export const POINT_BUDGET = 27;

const ABILITY_WORDS = {
  str: "str", strength: "str", dex: "dex", dexterity: "dex", con: "con", constitution: "con",
  int: "int", intelligence: "int", wis: "wis", wisdom: "wis", cha: "cha", charisma: "cha"
};

/** `{Strength: 15, dex: 14}` → `{str: 15, dex: 14}`; unknown keys are reported. */
export function normaliseAbilities(obj) {
  const out = {}, unknown = [];
  for (const [k, v] of Object.entries(obj ?? {})) {
    const kl = String(k).toLowerCase();
    const key = Object.hasOwn(ABILITY_WORDS, kl) ? ABILITY_WORDS[kl] : undefined;
    if (!key) { unknown.push(k); continue; }
    out[key] = Number(v);
  }
  return { abilities: out, unknown };
}

/**
 * Validate base scores (BEFORE background and level increases).
 * `method`: "array" (a permutation of 15 14 13 12 10 8) | "pointbuy" (8-15, at most 27 points) |
 * "manual" (3-20, anything). Returns `{ok, errors, warnings, spent?}`.
 */
export function validateAbilities(raw, method = "array") {
  const { abilities: a, unknown } = normaliseAbilities(raw);
  const errors = [], warnings = [];
  if (unknown.length) errors.push(`unknown abilities: ${unknown.join(", ")}`);
  const missing = ABILITIES.filter(k => !Number.isInteger(a[k]));
  if (missing.length) errors.push(`missing or non-integer: ${missing.join(", ")}`);
  if (errors.length) return { ok: false, errors, warnings, abilities: a };
  const vals = ABILITIES.map(k => a[k]);
  if (method === "array") {
    const got = [...vals].sort((x, y) => y - x).join(" ");
    if (got !== STANDARD_ARRAY.join(" ")) {
      errors.push(`standard array is ${STANDARD_ARRAY.join(" ")} (one each, before background increases); got ${got}`);
    }
  } else if (method === "pointbuy") {
    const bad = ABILITIES.filter(k => !(a[k] in POINT_COST));
    if (bad.length) errors.push(`point buy scores are 8-15 before increases; out of range: ${bad.map(k => `${k} ${a[k]}`).join(", ")}`);
    else {
      const spent = vals.reduce((s, v) => s + POINT_COST[v], 0);
      if (spent > POINT_BUDGET) errors.push(`point buy spends ${spent} of ${POINT_BUDGET} points`);
      else if (spent < POINT_BUDGET) warnings.push(`point buy spends only ${spent} of ${POINT_BUDGET} points`);
      return { ok: !errors.length, errors, warnings, abilities: a, spent };
    }
  } else if (method === "manual") {
    const bad = ABILITIES.filter(k => a[k] < 3 || a[k] > 20);
    if (bad.length) errors.push(`scores must be 3-20: ${bad.join(", ")}`);
  } else {
    errors.push(`abilityMethod must be array | pointbuy | manual, got ${method}`);
  }
  return { ok: !errors.length, errors, warnings, abilities: a };
}

/**
 * Check an ability increase against an AbilityScoreImprovement advancement's configuration:
 * `points` to spend (background 3, level ASI 2), `cap` per ability (2), `locked` abilities.
 * The background rule is +2/+1 or +1/+1/+1; a level ASI is +2 or +1/+1. Returns errors.
 */
export function checkIncrease(assign, { points = 2, cap = 2, locked = [] } = {}) {
  const { abilities: a, unknown } = normaliseAbilities(assign);
  const errors = [];
  if (unknown.length) errors.push(`unknown abilities: ${unknown.join(", ")}`);
  const bad = Object.entries(a).filter(([, v]) => !Number.isInteger(v) || v < 0);
  if (bad.length) errors.push(`increases must be whole numbers >= 0`);
  const total = Object.values(a).reduce((s, v) => s + (v || 0), 0);
  if (total !== points) errors.push(`spend exactly ${points} point(s); got ${total}`);
  const over = Object.entries(a).filter(([, v]) => v > cap).map(([k]) => k);
  if (over.length) errors.push(`at most +${cap} to one ability: ${over.join(", ")}`);
  const lock = Object.keys(a).filter(k => a[k] && locked.includes(k));
  if (lock.length) errors.push(`not allowed by this advancement: ${lock.join(", ")} (allowed: ${ABILITIES.filter(k => !locked.includes(k)).join(", ")})`);
  return { ok: !errors.length, errors, assignments: a };
}

/**
 * A default increase when the caller gave none: +2 to the highest allowed score, +1 to the next
 * (ties broken by `prefer`, e.g. the class's primary abilities). Background: points 3.
 */
export function defaultIncrease(scores, { points = 2, cap = 2, locked = [], prefer = [] } = {}) {
  const allowed = ABILITIES.filter(k => !locked.includes(k) && (scores[k] ?? 0) < 20);
  const rank = k => ((scores[k] ?? 0) * 10) + (prefer.includes(k) ? 5 - prefer.indexOf(k) : 0);
  const order = [...allowed].sort((x, y) => rank(y) - rank(x));
  const out = {};
  let left = points;
  for (const k of order) {
    if (!left) break;
    const room = Math.min(cap, left, 20 - (scores[k] ?? 0));
    if (room <= 0) continue;
    // the 2024 shape: +2 then +1 (background 3) or +2 (level ASI)
    const give = Math.min(room, left === 3 ? 2 : left);
    out[k] = give;
    left -= give;
  }
  return out;
}

/**
 * Match short choice words against dnd5e trait keys. `wanted`: ["ath", "Perception", "skills:ste",
 * "longsword"]; `available`: the advancement's selectable keys ("skills:ath", "weapon:mar:longsword").
 * A word matches a key when it equals it, its last segment, or the label given in `labels`.
 * Returns `{keys, unmatched}` in the caller's order, each key once.
 */
export function matchTraitKeys(wanted, available, labels = {}) {
  const keys = [], unmatched = [];
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9:*]/g, "");
  const pool = [...available];
  for (const w of wanted ?? []) {
    const n = norm(w);
    const hit = pool.find(k => norm(k) === n)
      ?? pool.find(k => norm(k.split(":").pop()) === n)
      ?? pool.find(k => norm(labels[k]) === n)
      ?? pool.find(k => norm(labels[k]).startsWith(n) && n.length >= 3);
    if (!hit || keys.includes(hit)) { unmatched.push(w); continue; }
    keys.push(hit);
  }
  return { keys, unmatched };
}

/**
 * Where a choice for an advancement is looked up in the caller's `choices` object, most specific
 * first: `"<item>: <title>@<level>"`, `"<title>@<level>"`, `"<item>: <title>"`, `"<title>"`,
 * then the advancement type (`"Subclass"`, `"Size"`). Case-insensitive. Returns `[key, value]` or null.
 */
export function lookupChoice(choices, { item, title, level, type }) {
  if (!choices) return null;
  const lower = new Map(Object.entries(choices).map(([k, v]) => [k.toLowerCase().replace(/\s+/g, " ").trim(), [k, v]]));
  const titles = titleForms(title);
  const tries = [
    ...titles.map(t => `${item}: ${t}@${level}`), ...titles.map(t => `${t}@${level}`),
    ...titles.map(t => `${item}: ${t}`), ...titles, `${type}@${level}`, `${type}`
  ];
  for (const t of tries) {
    const hit = lower.get(String(t).toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * The names an advancement title answers to: the title, and the title without a trailing "Choice" /
 * "Choices" — the PHB's Cleric titles its pick "Divine Order Choice", the books and the playbook
 * call it "Divine Order".
 */
export function titleForms(title) {
  const t = String(title ?? "");
  const bare = t.replace(/\s+choices?$/i, "").trim();
  return bare && bare !== t ? [t, bare] : [t];
}

/* ── dry-run validation (plan §13): choice keys, names, languages, attunement ── */

const normKey = k => String(k ?? "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Every `choices` key form an advancement answers to (the lookupChoice forms). `advs`:
 * `[{item, title, type, levels: [n, …]}]` — what the species, background, class levels, subclass
 * and the items they grant carry. → Set of lower-cased keys.
 */
export function choiceKeyForms(advs) {
  const out = new Set();
  for (const a of advs ?? []) {
    const levels = a.levels?.length ? a.levels : [a.level ?? 0];
    for (const t of titleForms(a.title)) {
      for (const level of levels) {
        for (const f of [`${a.item}: ${t}@${level}`, `${t}@${level}`, `${a.type}@${level}`]) out.add(normKey(f));
      }
      for (const f of [`${a.item}: ${t}`, `${t}`, `${a.type}`]) out.add(normKey(f));
    }
  }
  return out;
}

/**
 * Check a character's `choices` keys against the advancements it will run. → `{ok, unknown, known}`
 * where `known` is a short list for the error message (titles, with the levels they occur at).
 */
export function checkChoiceKeys(choices, advs) {
  const forms = choiceKeyForms(advs);
  const unknown = Object.keys(choices ?? {}).filter(k => !forms.has(normKey(k)));
  const byTitle = new Map();
  for (const a of advs ?? []) {
    if (!a.title || ["HitPoints", "ScaleValue"].includes(a.type)) continue;
    const t = `${a.title}`;
    if (!byTitle.has(t)) byTitle.set(t, new Set());
    for (const l of (a.levels?.length ? a.levels : [a.level ?? 0])) if (l > 1) byTitle.get(t).add(l);
  }
  const known = [...byTitle.entries()].map(([t, ls]) => (ls.size ? `${t}@${[...ls].sort((x, y) => x - y).join("|")}` : t));
  return { ok: !unknown.length, unknown, known };
}

/** Levenshtein distance (iterative, two rows). */
export function editDistance(a, b) {
  a = String(a); b = String(b);
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * The `n` names nearest to `query`: shared words first ("Elf" → "Elf, High"), then one name inside
 * the other ("Spellbook" → "Book"), then spelling distance. Case and punctuation ignored.
 */
export function nearestNames(query, names, n = 3) {
  const flat = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const q = flat(query), qw = new Set(q.split(" ").filter(Boolean)), qc = q.replace(/ /g, "");
  if (!q) return [];
  const scored = [];
  for (const name of new Set(names ?? [])) {
    const f = flat(name), fc = f.replace(/ /g, "");
    if (!f) continue;
    const words = f.split(" ");
    const shared = words.filter(w => qw.has(w)).length;
    const inside = fc.length >= 3 && (qc.includes(fc) || fc.includes(qc)) ? 1 : 0;
    const dist = editDistance(qc, fc) / Math.max(qc.length, fc.length);
    const score = shared * 2 + inside * 1.5 + (1 - dist);
    if (shared || inside || dist <= 0.4) scored.push({ name, score });
  }
  return scored.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name)).slice(0, n).map(s => s.name);
}

/** `CONFIG.DND5E.languages`-shaped tree → `{key: label}` (groups' children flattened). */
export function flattenLanguages(tree, out = {}) {
  for (const [k, v] of Object.entries(tree ?? {})) {
    if (v && typeof v === "object" && v.children) {
      if (v.selectable !== false && v.label) out[k] = v.label;
      flattenLanguages(v.children, out);
    } else {
      out[k] = typeof v === "string" ? v : (v?.label ?? k);
    }
  }
  return out;
}

/** Words people write for a dnd5e language that are neither its key nor its label. */
export const LANGUAGE_ALIASES = Object.freeze({
  elven: "elvish", elf: "elvish", dwarven: "dwarvish", dwarf: "dwarvish", orcish: "orc", gnomic: "gnomish", gnome: "gnomish",
  giantish: "giant", draconian: "draconic", thievescant: "cant", thieves: "cant", signlanguage: "sign", commonsign: "sign",
  deepspeech: "deep", sylvan: "sylvan", infernal: "infernal"
});

/**
 * Language words → dnd5e keys: `["Common", "goblin", "Thieves' Cant"]` → `{keys: ["common", "goblin",
 * "cant"], unknown: []}`. A word matches a key or its label, case and punctuation ignored.
 * `flat` is `flattenLanguages(CONFIG.DND5E.languages)`; a localisation key as label is matched on
 * its last segment too.
 */
export function languageKeys(words, flat) {
  const norm = s => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const table = Object.entries(flat ?? {}).map(([k, label]) => ({ k, n: [norm(k), norm(label), norm(String(label).split(".").pop())] }));
  const keys = [], unknown = [];
  for (const w of [].concat(words ?? [])) {
    const n = norm(w);
    if (!n) continue;
    const alias = LANGUAGE_ALIASES[n];
    const hit = table.find(t => t.n.includes(n)) ?? (alias ? table.find(t => t.k === alias) : null);
    if (!hit) { unknown.push(String(w)); continue; }
    if (!keys.includes(hit.k)) keys.push(hit.k);
  }
  return { keys, unknown };
}

/** The language a species traditionally speaks (2024 PHB origins; the 2014 list where they agree). */
export const SPECIES_LANGUAGE = Object.freeze({
  aasimar: "celestial", dragonborn: "draconic", dwarf: "dwarvish", elf: "elvish", gnome: "gnomish",
  goliath: "giant", halfling: "halfling", orc: "orc", tiefling: "infernal", "half-elf": "elvish", "half-orc": "orc"
});

/** After the species' own, the order a default fills the rest in: the commonest standard tongues. */
export const LANGUAGE_PREFERENCE = Object.freeze(["common", "elvish", "dwarvish", "halfling", "goblin", "orc", "giant", "gnomish", "draconic"]);

/**
 * Default language picks for a Trait advancement nobody answered: the species' language first,
 * then LANGUAGE_PREFERENCE, then the rest in book order (sign language last). `available` are
 * trait keys (`languages:standard:elvish`); → up to `n` of them.
 */
export function defaultLanguagePicks(available, species, n) {
  const tail = k => String(k).split(":").pop();
  const s = String(species ?? "").toLowerCase();
  const own = Object.entries(SPECIES_LANGUAGE).find(([sp]) => s.split(/[^a-z-]+/).includes(sp))?.[1] ?? null;
  const order = [...(own ? [own] : []), ...LANGUAGE_PREFERENCE];
  const rank = k => { const i = order.indexOf(tail(k)); return i >= 0 ? i : (/sign/.test(tail(k)) ? 1000 : 500); };
  return [...available].map((k, i) => ({ k, r: rank(k), i })).sort((a, b) => (a.r - b.r) || (a.i - b.i)).slice(0, n).map(x => x.k);
}

/** Are all of these trait keys languages? */
export function areLanguageKeys(keys) {
  const list = [...(keys ?? [])];
  return list.length > 0 && list.every(k => String(k).startsWith("languages"));
}

/** dnd5e item types that carry `system.attunement` (EquippableItemTemplate); loot and the rest do not. */
export const ATTUNABLE_TYPES = Object.freeze(["weapon", "equipment", "consumable", "tool", "container"]);

/**
 * Does this text say the item requires attunement? The book's "(requires attunement…)" and plain
 * "requires attunement" / "attunement required", but not "does not require attunement", "doesn't
 * require attunement", "no attunement required", "without attunement" or "attunement is optional".
 */
export function saysRequiresAttunement(text) {
  const t = String(text ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;|\s+/g, " ");
  const re = /(\b(?:not|never|no longer|doesn't|does not|don't|do not|needn't|need not|without)\s+(?:\w+\s+){0,2})?(?:requires?|requiring)\s+attunement|(\bno\s+)?attunement\s+(?:is\s+)?required/gi;
  for (const m of t.matchAll(re)) if (!m[1] && !m[2]) return true;
  return false;
}

/**
 * Inline item data whose text requires attunement but whose `system.attunement` is blank: set it to
 * "required" (dnd5e's value), for the types that have the field. → the note to print, or null.
 * Reads the description, the unidentified description and the name. Mutates `data`. A loot item
 * (no attunement in dnd5e) is left alone and named, so the builder can make it equipment.
 */
export function fixAttunement(data) {
  if (!data || typeof data !== "object") return null;
  const sys = data.system ?? {};
  if (sys.attunement) return null;
  const text = [sys.description?.value, sys.description?.chat, sys.unidentified?.description, data.name].filter(Boolean).join(" ");
  if (!saysRequiresAttunement(text)) return null;
  if (!ATTUNABLE_TYPES.includes(data.type)) {
    return `${data.name}: its text requires attunement, but a ${data.type ?? "?"} item has no attunement in dnd5e — make it type "equipment" (wondrous item) if it should take a slot`;
  }
  data.system = { ...sys, attunement: "required" };
  return `${data.name}: attunement set to required (its text requires attunement)`;
}

/* ── eval round 3 (plan §14): one-pass problems, starting equipment, focus, stock lore ── */

/**
 * Every problem of one replacement as ONE BAD_SPEC message, so a builder fixes them all in one
 * round trip instead of one per dry run: `character: 3 problems — (1) …; (2) …; (3) …`.
 */
export function problemsText(label, problems) {
  const list = [...new Set((problems ?? []).filter(Boolean).map(String))];
  if (!list.length) return null;
  if (list.length === 1) return `${label}: ${list[0]}`;
  return `${label}: ${list.length} problems — ${list.map((p, i) => `(${i + 1}) ${p}`).join("; ")}`;
}

/**
 * A class's or background's starting equipment (dnd5e `system.startingEquipment` entries) as a
 * plan. dnd5e prints it "Choose A or B: (A) <the top-level entries> or (B) <wealth> GP".
 * `option`: "A" (the gear) | "B" (the wealth instead) | "none".
 * → `{items: [{uuid, count, proficiency}], categories: [{type, key, count}], currency: {gp: n},
 *    picks: ["…"]}` where `picks` names each OR group decided by taking its first entry, and
 *    `categories` are the "any holy focus" / "one kind of gaming set" entries the caller resolves.
 * Pure: entries are plain `{_id, group, type, key, count, requiresProficiency, sort}`.
 */
export function startingEquipmentPlan(entries, { option = "A", wealth = null, labelOf = null } = {}) {
  const out = { items: [], categories: [], currency: {}, picks: [] };
  const opt = String(option ?? "A").toUpperCase();
  if (opt === "NONE") return out;
  const add = (k, n) => { out.currency[k] = (out.currency[k] ?? 0) + n; };
  if (opt === "B") {
    const gp = Number(String(wealth ?? "").trim());
    if (Number.isFinite(gp) && gp > 0) add("gp", gp);
    else if (wealth) out.picks.push(`wealth "${wealth}" is a formula, not rolled — set the gold by hand`);
    return out;
  }
  const all = (entries ?? []).map(e => ({ ...e, group: e.group || null }));
  const kids = id => all.filter(e => e.group === id).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
  const name = e => (labelOf ? labelOf(e) : null) ?? (e.type === "linked" ? e.key : `${e.type}:${e.key}`);
  const walk = e => {
    switch (e.type) {
      case "AND": for (const c of kids(e._id)) walk(c); break;
      case "OR": {
        const c = kids(e._id);
        if (!c.length) break;
        if (c.length > 1) out.picks.push(`took ${name(c[0])} (first of: ${c.map(name).join(" | ")})`);
        walk(c[0]);
        break;
      }
      case "linked":
        if (e.key) out.items.push({ uuid: e.key, count: Number(e.count) > 0 ? Number(e.count) : 1, proficiency: !!e.requiresProficiency });
        break;
      case "currency":
        if (e.key && Number(e.count) > 0) add(e.key, Number(e.count));
        break;
      default:
        out.categories.push({ type: e.type, key: e.key ?? null, count: Number(e.count) > 0 ? Number(e.count) : 1 });
    }
  };
  for (const e of all.filter(x => !x.group).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))) walk(e);
  return out;
}

/** The spellcasting focus each 2024 class casts through (dnd5e `CONFIG.DND5E.focusTypes` keys; bard: an instrument). */
export const CLASS_FOCUS = Object.freeze({
  cleric: "holy", paladin: "holy", druid: "druidic", ranger: "druidic",
  sorcerer: "arcane", warlock: "arcane", wizard: "arcane", bard: "music"
});

/**
 * Does a spellcaster carry what it casts through? `items`: `[{name, type, source, toolType}]`
 * (source = the compendium uuid it came from); `focusTypes`: CONFIG.DND5E.focusTypes.
 * → null when fine or not a caster, else `{focus, label, options: [names]}`.
 * A wizard's spellbook counts (2024 PHB: the spellbook can be the focus).
 */
export function focusMissing(classId, items, focusTypes = {}) {
  const focus = CLASS_FOCUS[String(classId ?? "").toLowerCase()];
  if (!focus) return null;
  const list = items ?? [];
  if (focus === "music") {
    if (list.some(i => i.type === "tool" && i.toolType === "music")) return null;
    return { focus, label: "musical instrument", options: [] };
  }
  const cfg = focusTypes[focus] ?? {};
  const ids = Object.values(cfg.itemIds ?? {});
  const tail = u => String(u ?? "").split(".").pop();
  const idTails = new Set(ids.map(tail));
  if (list.some(i => i.source && (ids.includes(i.source) || idTails.has(tail(i.source))))) return null;
  // by name too (an inline {data} "Holy Symbol of Lathander", a renamed amulet)
  const words = { holy: /holy symbol|amulet|emblem|reliquary/i, arcane: /arcane focus|crystal|orb|rod|staff|wand/i,
    druidic: /druidic focus|mistletoe|wooden staff|yew wand|totem/i }[focus];
  if (words && list.some(i => words.test(i.name ?? ""))) return null;
  if (String(classId).toLowerCase() === "wizard" && list.some(i => /spellbook/i.test(i.name ?? ""))) return null;
  return { focus, label: cfg.label ?? `${focus} focus`, options: Object.keys(cfg.itemIds ?? {}) };
}

/**
 * Is a built creature's biography the stock compendium lore? A Monster Manual import carries
 * `Gear: @UUID[…]{Daggers (3)}`, a heading and an `@Embed[…]` of the book's lore page; `patch.
 * biography` REPLACES the biography, so on a creature this system built, a book embed still there
 * means nobody wrote one. Printed in a gather it is noise ("Gear: Daggers (3) / Kobolds /
 * Tricksters and Servants…") beside the prompt and the Why line. Only for built things (callers
 * check provenance): a hand-placed monster's lore is all the builder has.
 */
export function isStockLore(html) {
  return /@Embed\[Compendium\.(?:dnd-monster-manual|dnd-players-handbook|dnd-dungeon-masters-guide|dnd5e)\./.test(String(html ?? ""));
}
