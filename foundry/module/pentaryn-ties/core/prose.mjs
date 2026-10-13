/**
 * Prose for a reveal: the enricher guard, flattening, the derived-prose cap, the traits line and
 * `composeReveal`.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { kindPassed } from "./shared.mjs";

/* ── enricher flattening: the guard, not a convenience ────────────────────── */

const UNRESOLVED = /\[\[|@UUID\[|&(?:amp;)?[A-Za-z]+\[/;

/**
 * Did enrichment actually resolve this, or is it still source code?
 *
 * **Probed live on 2026-08-23** against the installed Monster Manual, which is what makes
 * this a guard rather than a worry. `enrichHTML(desc, {relativeTo: item, rollData:
 * item.getRollData()})` on a real MM Goblin Warrior turns
 *
 *     <p>[[/attack extended]]. [[/damage average extended]], plus …</p>
 *
 * into "Melee Attack Roll: +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage, …" — real
 * numbers, no brackets. Enriching the **same string without `relativeTo`** leaves
 * `[[/attack extended]]` completely intact, because the enricher has no activity to resolve
 * against. That is the failure this guard exists for, and it is nastier than it looks: a
 * generic tag-stripper (pentaryn-lookup's `toPlainText`, whose job is search snippets)
 * degrades the survivor to the words "attack extended" — plausible-looking gibberish in a
 * player's notebook, with nothing left to detect it by.
 *
 * So this module does NOT reuse that flattener, and the plan's instruction to do so does not
 * survive contact: the two want opposite policies on an unresolved enricher. Lookup keeps the
 * words; the notebook must **refuse the string**.
 */
export function hasUnresolvedEnricher(html) {
  return typeof html === "string" && UNRESOLVED.test(html);
}

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘",
  ldquo: "“", rdquo: "”", times: "×", minus: "−", deg: "°"
};

/**
 * Does this text say **nothing** a player could read? Whitespace, `&nbsp;`, zero-width characters,
 * HTML comments and empty markup (`<p></p>`, `<p><br></p>`, `<div> </div>` — what a rich-text
 * editor leaves behind when an author clears a field) all count as blank.
 *
 * Joe's rule (2026-10): any tier may be left empty on purpose, and **empty means no trace** — no
 * card, no source line, no header around a hollow box. Every "is there anything to hand over?"
 * test asks this rather than `.trim()`, which passes `"<p></p>"` as content and grants a card whose
 * body is the literal tags (grant text is escaped at render).
 *
 * Only a fixed list of formatting tags is stripped, never `<anything>`: a GM's plain-text line
 * that happens to sit in angle brackets ("<the name is scratched out>") is content and stays so.
 */
const BLANK_MARKUP =
  /<!--[\s\S]*?-->|<\/?(?:p|br|hr|div|span|section|article|em|strong|b|i|u|s|small|mark|sub|sup|code|pre|blockquote|h[1-6]|ul|ol|li|a|font)\b[^>]*>/gi;
export function isBlankProse(text) {
  if (typeof text !== "string" || !text) return true;
  return !text
    .replace(BLANK_MARKUP, "")
    .replace(/&(?:nbsp|#160|#x0*a0|#8203|#x200b|zwj|zwnj);/gi, "")
    .replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff]+/g, "")
    .length;
}

/**
 * Enriched HTML → the prose that lands in a notebook.
 *
 * Block tags become spaces so `<p>a</p><p>b</p>` reads "a b" — but dnd5e's enrichers wrap
 * *inline* spans around every number, so a naive strip yields "Melee Attack Roll : +4 , reach
 * 5 ft ." (observed, in the probe above). The punctuation pass is therefore not cosmetic
 * either: this text is pasted into a player-owned textarea and never enriched again.
 */
export function flattenHTML(html) {
  if (typeof html !== "string" || !html) return "";
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?%)\]])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .trim();
}

/** Flatten, or refuse. `null` means "this string is not fit to hand a player". */
export function safeFlatten(html) {
  if (hasUnresolvedEnricher(html)) return null;
  return flattenHTML(html);
}

/**
 * How much *derived* description a reveal will paste. Authored tier messages are not capped
 * here — they have their own `TIER_TEXT_MAX` and a GM who writes 900 words meant them.
 */
export const DERIVED_PROSE_MAX = 700;

/**
 * ⚠ **A Monster Manual biography is not a description — it is the creature's whole lore page.**
 *
 * Measured on the installed MM, not guessed: the Goblin Warrior's
 * `system.details.biography.value` flattens to well over 3,000 characters and opens with a
 * gear list and two image captions ("Gear: Leather Armor, Scimitar…", "A goblin boss, a goblin
 * hexer, and a goblin warrior prepare to strike…") before it reaches a sentence anybody would
 * write in a notebook. The plan's "biography flattened to prose" assumed a paragraph. Pasting
 * the real thing would bury the player's own page under a page of the publisher's.
 *
 * So the derived rung is capped, cut on a word boundary, and marked with an ellipsis so the
 * truncation reads as deliberate. This is also the honest argument for the feature the plan
 * actually cares about: **the authored tier message is the description**, and the derived text
 * is only what keeps a kind rollable before anyone has written one.
 */
export function capProse(text, max = DERIVED_PROSE_MAX) {
  const s = String(text ?? "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, "")}…`;
}

/* ── composing the reveal ─────────────────────────────────────────────────── */

/**
 * One line of resistances, from already-localized label arrays.
 *
 * The caller resolves `di`/`dr`/`dv`/`ci` off the sheet and localizes them; this only decides
 * what a *line* is. A kind with none of them returns "" and the tier-20 rung then buys the
 * honest truth that there is nothing to be immune to — the sentence is the caller's
 * (`nothingNotable`), because it is prose.
 */
export function traitsLine({ immune = [], resist = [], vulnerable = [], conditionImmune = [] } = {}, labels = {}) {
  const parts = [];
  const push = (key, list) => {
    const clean = (Array.isArray(list) ? list : []).map(x => String(x ?? "").trim()).filter(Boolean);
    if (clean.length) parts.push(`${labels[key] ?? key}: ${clean.join(", ")}.`);
  };
  push("immune", immune);
  push("resist", resist);
  push("vulnerable", vulnerable);
  push("conditionImmune", conditionImmune);
  return parts.join(" ");
}

/**
 * The description slot of a kind study, by tier — pure, so the failure rule is fixtured.
 *
 *   `authored`  the exact-rung authored text (`authoredTier`), or ""
 *   `derived`   the kind's flattened biography, or ""
 *   `none`      the "you place it, but nothing in words" line for a pass with no prose
 *
 * **Below 15 is a failure and hands over nothing** unless the GM authored rung 0 — the one lie
 * this module still delivers (2026-10, `context/plans/attribute-silent-failure.md`). The generic
 * "nothing about it means anything to you" card that used to fill an unauthored failure is gone:
 * it was a card the player could read as "I failed". `none` is reachable only at 15 and above,
 * so a pass always says something and a failure says nothing.
 */
export function studyDescription({ authored = "", derived = "", tier = 0, none = "" } = {}) {
  const said = v => (isBlankProse(String(v ?? "")) ? "" : String(v).trim());
  const a = said(authored);
  if (a) return a;
  if (!kindPassed(tier)) return "";
  return said(derived) || said(none);
}

/**
 * The reveal, exactly as it lands in the notes (decision 7's shape).
 *
 *     — Studied (Nature) —
 *     A small, black-hearted humanoid…
 *     Immune: poison. Resists: cold.
 *     Scimitar: Melee Attack Roll +4, reach 5 ft. Hit: 5 (1d6 + 2) Slashing damage
 *
 * ⚠ The header carries the **skill and nothing else**. The first cut of the plan wrote
 * "Nature 22 vs DC 15" into it — the exact number and DC the blind roll exists to hide,
 * printed into a field the player can read at leisure. If a maintainer is ever tempted to put
 * the total back "so the player can see how well they did": that is the number, and the whole
 * feature is built to not have it here.
 *
 * `description` is the authored tier message when one exists and the derived biography when it
 * does not — the caller decides, because only the caller knows whether the author wrote one.
 * Everything below the description is gated by tier and is always derived, always true.
 */
export function composeReveal({
  tier = 0,
  header = "",
  description = "",
  traits = "",
  attacks = [],
  separator = " · "
} = {}) {
  const lines = [];
  const desc = String(description ?? "").trim();
  if (!isBlankProse(desc)) lines.push(desc);
  if (tier >= 20 && !isBlankProse(String(traits ?? ""))) lines.push(String(traits).trim());
  if (tier >= 25) {
    const clean = (Array.isArray(attacks) ? attacks : []).map(a => String(a ?? "").trim()).filter(a => !isBlankProse(a));
    if (clean.length) lines.push(clean.join(separator));
  }
  /*
   * A header over nothing is not a reveal (Joe, 2026-10: empty means no trace). With no body line
   * the whole reveal is "", so the caller's `silent` test sees an empty payload and grants no card,
   * rather than a card that reads "— Studied (Nature) —" and stops.
   */
  if (!lines.length) return "";
  if (header) lines.unshift(header);
  return lines.join("\n");
}
