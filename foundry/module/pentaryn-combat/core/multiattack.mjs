/**
 * Pentaryn Combat core — NPC / Wild Shape Multiattack: parse the text, plan the swings, the flag override.
 * PURE: plain data in, plain data out; re-exported by ../combat-core.mjs (guide S12, contents moved
 * unchanged).
 */

import { normalizeName } from "./identity.mjs";

const NUMBER_WORDS = Object.freeze({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, once: 1, twice: 2 });

function numberOf(word) {
  const w = String(word ?? "").toLowerCase();
  if (/^\d+$/.test(w)) return Number(w);
  return NUMBER_WORDS[w] ?? null;
}

/**
 * Multiattack text → a swing plan.
 *
 * Handles what dnd5e's 2024 MM and this world's homebrew write:
 *   "makes two [[/item .id]] attacks"
 *   "makes one [[/item .a]] attack and one [[/item .b]] attack" / "… and two [[/item Tail]] attacks"
 *   "makes three attacks, using [[/item .a]] or [[/item .b]] in any combination"
 *   "makes two [[/item .a]] or [[/item .b]] attacks"
 *   "makes a number of [[/item Slam]] attacks equal to half this spell's level … [[floor(@x / 2)]]{…}"
 *   "makes one Slam attack and uses Pacifying Spores"  (bare names)
 * "It can replace one attack with …" and "… uses [[/item X]]" (non-attacks) are ignored.
 *
 * @param {string} description            the item's description HTML
 * @param {{id: string, name: string, isAttack: boolean}[]} items  the actor's items
 * @param {object} [opts]
 * @param {(formula: string) => number|null} [opts.evalFormula]  for the summon-level formula
 * @returns {{total: number, groups: {count: number, choices: string[]}[], formula?: string}|null}
 */
export function parseMultiattack(description, items = [], { evalFormula = null } = {}) {
  if (!description) return null;
  const attacks = items.filter(i => i.isAttack);
  const byId = new Map(items.map(i => [i.id, i]));
  const byName = new Map(items.map(i => [normalizeName(i.name), i]));

  let text = String(description)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/\[\[lookup[^\]]*\]\]/gi, "it");

  // The summon-level count, then any other inline roll.
  let formula = null;
  text = text.replace(/\[\[(?!\/)([^\]]+)\]\](\{[^}]*\})?/g, (_, f) => { formula ??= f.trim(); return " "; });

  // Links → ⟦id⟧ tokens (⟦-⟧ for a link that is not one of the actor's attack items).
  text = text.replace(/\[\[\/item\s+([^\]]+)\]\](\{[^}]*\})?/gi, (_, ref) => {
    const r = ref.trim();
    if (/\.Activity\./i.test(r)) return "⟦-⟧";
    const item = r.startsWith(".") ? byId.get(r.slice(1).split(".")[0]) : byName.get(normalizeName(r));
    return item && item.isAttack ? `⟦${item.id}⟧` : "⟦-⟧";
  });
  // Bare attack names ("one Slam attack"), longest first so "Light Crossbow" beats "Crossbow".
  for (const a of [...attacks].sort((x, y) => y.name.length - x.name.length)) {
    const esc = a.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`(?<![⟦\\w])${esc}(?=\\s+attacks?\\b)`, "gi"), `⟦${a.id}⟧`);
  }
  text = text.replace(/\s+/g, " ").trim();

  // Only the sentence that says what it makes; "It can replace one attack…" is a later sentence.
  const sentence = (text.match(/makes[^.]*\./i) ?? text.match(/makes.*/i))?.[0] ?? "";
  if (!sentence) return null;

  const ids = s => [...s.matchAll(/⟦([^⟧]+)⟧/g)].map(m => m[1]).filter(id => id !== "-");

  // a number of [X] attacks equal to …
  if (/a number of/i.test(sentence)) {
    const m = sentence.match(/a number of\s+((?:⟦[^⟧]+⟧\s*)?)attacks/i);
    if (!m) return null;
    let choices = ids(m[1]);
    if (!choices.length && attacks.length === 1) choices = [attacks[0].id];
    if (!choices.length || !formula) return null;
    const n = evalFormula ? evalFormula(formula) : null;
    const count = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : null;
    if (count === null) return { total: 0, groups: [{ count: 0, choices }], formula };
    return { total: count, groups: [{ count, choices }], formula };
  }

  // N attacks, using [A] or/and [B] (in any combination)
  const anyCombo = sentence.match(/makes\s+(\w+)\s+attacks?\s*,?\s*using\s+(.*?)(?:\s+in any combination|\.|$)/i);
  if (anyCombo) {
    const count = numberOf(anyCombo[1]);
    const choices = ids(anyCombo[2]);
    if (!count || !choices.length) return null;
    return { total: count, groups: [{ count, choices }] };
  }

  // one or more "N [A] (or [B]) attack(s)" groups
  const groups = [];
  const re = /\b(\w+)\s+((?:⟦[^⟧]+⟧(?:\s*,?\s*(?:or|and)\s*)?)+)\s*attacks?\b/gi;
  let prevEnd = null;
  for (const m of sentence.matchAll(re)) {
    const count = numberOf(m[1]);
    const choices = ids(m[2]);
    if (!count || !choices.length) continue;
    // "two [A] attacks or two [B] attacks" is one choice of two swings, not four swings.
    const gap = prevEnd === null ? "" : sentence.slice(prevEnd, m.index);
    const last = groups[groups.length - 1];
    if (last && /^\s*,?\s*or\s*$/i.test(gap)) {
      last.count = Math.max(last.count, count);
      for (const c of choices) if (!last.choices.includes(c)) last.choices.push(c);
    } else {
      groups.push({ count, choices });
    }
    prevEnd = m.index + m[0].length;
  }
  if (groups.length) return { total: groups.reduce((s, g) => s + g.count, 0), groups };

  // "makes two attacks" with no item named: only if the creature has exactly one attack.
  const bare = sentence.match(/makes\s+(\w+)\s+attacks?\b/i);
  const count = bare ? numberOf(bare[1]) : null;
  if (count && attacks.length === 1) return { total: count, groups: [{ count, choices: [attacks[0].id] }] };
  return null;
}

/** The default plan of a parsed Multiattack: each group's first choice, count times. */
export function multiattackPlan(parsed, { pick = {} } = {}) {
  if (!parsed?.groups?.length) return null;
  // pick[i] picks for group i; pick["*"] (the remembered weapon) for every group that offers it —
  // the HUD's picker shows the first group with a choice, which need not be group 0.
  return parsed.groups.map((g, i) => {
    const want = (pick[i] && g.choices.includes(pick[i])) ? pick[i] : (pick["*"] && g.choices.includes(pick["*"]) ? pick["*"] : null);
    return { itemId: want ?? g.choices[0], count: g.count };
  });
}

/** A stored override `[{item, count}]` → a plan, against the actor's item ids. */
export function overridePlan(flag, itemIds = []) {
  if (!Array.isArray(flag)) return null;
  const known = new Set(itemIds);
  const plan = flag
    .map(r => ({ itemId: r?.item ?? r?.itemId, count: Number(r?.count) }))
    .filter(r => known.has(r.itemId) && Number.isInteger(r.count) && r.count > 0);
  return plan.length ? plan : null;
}
