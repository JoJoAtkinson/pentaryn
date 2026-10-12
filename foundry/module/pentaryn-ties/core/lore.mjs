/**
 * Phase 4 — the individual axis: lore rows on one actor, their fact keys, clamps and outcomes.
 *
 * Pure: no Foundry global (split out of known-core.mjs, which re-exports this file — S4, ties-36).
 */

import { isBlankProse } from "./prose.mjs";
import { num, str } from "./shared.mjs";
import { KIND_KEY, STUDY_BASE_DC, TIER_TEXT_MAX } from "./study.mjs";

/* -------------------------------------------- */
/*  Phase 4 — the individual axis: lore rows    */
/* -------------------------------------------- */

/**
 * GM-authored facts about **one** individual (decision 8), on the subject actor:
 *
 * ```js
 * flags["pentaryn-ties"].lore = [
 *   { id, dc: 15, skill: "his", label: "Why they left the coast", text: "…", miss: "…", hold: null }
 * ]
 * ```
 *
 * Flat pass/fail at the GM's DC, one attempt per row — deliberately NOT the kind's graded
 * ladder. A ladder's rungs are stat-block facts every goblin shares; a lore row is a single
 * authored fact with a single price. A GM wanting a ladder on an individual writes three rows
 * with rising DCs and gets something *more* expressive than a forced three-tier grade, since
 * each fact is independently rollable.
 *
 * ## Why this shape is not actor-shaped
 *
 * Nothing in a row names an actor. That is decision 21 rule 3 held at the schema level: the
 * phase 6 attribute registry stores the identical row array against a registry entry, and the
 * same editor and the same reader serve both. If a row ever grows an `actorId` field, that
 * rule has been broken and the attribute phase becomes a migration instead of a widening.
 */
export const LORE_FLAG = "lore";

/** A label is a line on a button — the affordance, not the secret. */
export const LORE_LABEL_MAX = 120;

/** A lore row is a paragraph like a tier message, and rides on the same kind of document. */
export const LORE_TEXT_MAX = TIER_TEXT_MAX;

/**
 * The DC band. Wide enough for "trivially known" to "nobody alive knows this" and bounded so
 * a typo cannot author an unrollable row.
 */
export const LORE_DC_MIN = 1;
export const LORE_DC_MAX = 40;

/** The DC a fresh row starts at — the same number the kind ladder calls "recognised it". */
export const LORE_DC_DEFAULT = STUDY_BASE_DC;

/**
 * The namespaced fact key — decision 21 rule 1, and the reason it exists.
 *
 * Never the bare `"<actorId>:<loreId>"` of decision 8's first draft. `attr:` and `mask:` are
 * siblings in the same keyspace (`studied.lore`, belief rows, `granted`), so an unnamespaced
 * key would collide the moment the attribute phase lands and the fix would be a migration of
 * live player data. Costs nothing now; deletes that migration entirely.
 */
export const loreFactKey = (actorId, loreId) => `lore:${String(actorId ?? "")}:${String(loreId ?? "")}`;

/**
 * Split a fact key back into its parts. Returns `null` for anything unrecognised rather than
 * a half-parsed object — a caller that cannot identify a fact must refuse it, not guess.
 */
export function parseFactKey(key) {
  const raw = typeof key === "string" ? key.trim() : "";
  if (!raw) return null;
  /*
   * ⚠ NEVER `split(":")` here. The **subject** segment can itself contain colons: decision 16
   * advertises authoring a registry entry for a derived id, so `attr:species:human:origin` is a
   * legitimate fact key whose attribute id is `species:human` and whose fact is `origin`.
   * A naive split read the subject as `"species"` and the fact as `"human"`, and the grant then
   * matched no attribute and rendered nowhere — found by review, reproduced, fixtured below.
   *
   * The grammar that actually holds: the namespace is up to the FIRST colon, the fact is after
   * the LAST, and everything between is the subject however many colons it contains. Fact ids
   * are Foundry randomIDs and namespaces are a closed set, so only the middle is variable.
   */
  const first = raw.indexOf(":");
  if (first < 0) return null;
  const ns = raw.slice(0, first);
  const rest = raw.slice(first + 1);
  if (!rest) return null;
  if (ns === "kind") return { ns, subject: rest, fact: KIND_KEY };
  if (ns !== "lore" && ns !== "attr" && ns !== "mask") return null;
  const last = rest.lastIndexOf(":");
  if (last < 0) return null;
  const subject = rest.slice(0, last);
  const fact = rest.slice(last + 1);
  if (!subject || !fact) return null;
  return { ns, subject, fact };
}

/**
 * A ledger key (`<factKey>:<characterId>`) split back into its two halves.
 *
 * Same rule and the same reason: the character id is after the last colon, everything before it
 * is the fact key — which has its own colons and, for an authored derived attribute, one more
 * than the naive count expects.
 */
export function parseLedgerKey(key) {
  const raw = typeof key === "string" ? key.trim() : "";
  const last = raw.lastIndexOf(":");
  if (last < 0) return null;
  const characterId = raw.slice(last + 1);
  const fact = parseFactKey(raw.slice(0, last));
  if (!characterId || !fact) return null;
  return { ...fact, factKey: raw.slice(0, last), characterId };
}

/** One row, sanitised. Never throws; an unusable row is dropped by the reader, not repaired. */
export function clampLoreRow(row) {
  if (!row || typeof row !== "object") return null;
  const id = typeof row.id === "string" ? row.id.trim().slice(0, 64) : "";
  if (!id) return null;
  /*
   * A blank label is kept, not refused. The reader sanitises *storage*, and a row a GM has
   * just added and not yet named is legitimate stored state — dropping it here would delete
   * the row on the way to disk the instant it was created. Whether a row can be *offered* is
   * a different question with a different answer, and it lives in `rollableLore` below.
   */
  const label = str(row.label, LORE_LABEL_MAX).trim();
  const dc = Math.max(LORE_DC_MIN, Math.min(LORE_DC_MAX, num(row.dc, LORE_DC_DEFAULT)));
  return {
    id,
    label,
    dc,
    // the skill is validated against the world's own list by the caller that has one; here it
    // is only shape-checked, because this file is not allowed to know what dnd5e ships
    skill: typeof row.skill === "string" && row.skill.trim() ? row.skill.trim().slice(0, 32) : "his",
    text: str(row.text, LORE_TEXT_MAX),
    /*
     * The failure line — **what the player takes away from a failed check** (Joe, 2026-10-08).
     * Empty: a failure hands over nothing at all (no card, no title). Written: a failure hands over
     * exactly this text, in the same card shape a pass uses, so it reads as what they noticed —
     * never as "you failed". (2026-10-07 briefly made it a never-shown GM note; Joe reversed that,
     * see `context/plans/attribute-silent-failure.md`.)
     */
    miss: str(row.miss, LORE_TEXT_MAX),
    // tri-state, like the kind's `studyHold`: null inherits the world's `holdDefault`
    hold: row.hold === true ? true : row.hold === false ? false : null
  };
}

/**
 * Can this row be put in front of a player?
 *
 * Two conditions, and both are about not wasting the one attempt:
 *
 *  · **a label** — it is the affordance itself; an unnamed row is a button with no invitation
 *  · **something to say on at least one side** — a row with neither `text` nor `miss` hands
 *    over nothing whatever the dice do, so offering it spends the attempt on guaranteed
 *    silence. Neither side is a draft.
 *
 * ⚠ This is the **resolve** test, not the **offer** test, and since 2026-10 the two differ. A
 * row with only `miss` text would buy nothing on a pass (and a failure that reads like a finding
 * with no truth behind it) — the player sheet asks `loreOfferable` instead. This one is left broad on purpose: a dozen readers
 * (`resolveFact`, `factOrder` → the Look window, `factStatus`, the preview, `pending`) use it to
 * find rows that already hold beliefs and grants, and narrowing it would strand Share/Forget on a
 * legacy miss-only row and drop its existing card from the player's Look window.
 */
export const loreRollable = row => {
  const clean = clampLoreRow(row);
  return !!clean && !!clean.label && !(isBlankProse(clean.text) && isBlankProse(clean.miss));
};

/**
 * Can this row be **offered** to a player — drawn as a button they can spend their one attempt on?
 *
 * A row with no pass text has nothing to find: a pass would hand over nothing, and its failure
 * text would be a lie with no truth behind it. It is a draft until its pass is written. Used by the two
 * player-sheet offer lists only; everything that looks up a row by id stays on `loreRollable`.
 */
export const loreOfferable = row => {
  if (!loreRollable(row)) return false;
  return !isBlankProse(clampLoreRow(row).text);
};

/** Just the rows a player may be offered — the affordance list, never the storage list. */
export const rollableLore = rows => readLore(rows).filter(loreRollable);

/** The stored array. Junk rows vanish; duplicate ids keep the first, which is the authored one. */
export function readLore(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const clean = clampLoreRow(row);
    if (!clean || seen.has(clean.id)) continue;
    seen.add(clean.id);
    out.push(clean);
  }
  return out;
}

/**
 * What a lore row hands over for a given total — the whole grading rule for the individual
 * axis, in one place, so `study.mjs` decides nothing about content.
 *
 * Returns `null` only for "no roll happened", exactly like `tierOf`: a cancelled dialog must
 * never grade as a failure and spend the one attempt.
 */
export function loreOutcome(row, total) {
  const clean = clampLoreRow(row);
  if (!clean) return null;
  /*
   * ⚠ `Number(null)` is 0 and `Number("")` is 0, and both are finite — so a bare
   * `Number.isFinite` check grades a cancelled dialog as a total of zero, fails the row, and
   * spends the player's one attempt on a mis-click. Reject the non-numbers by type FIRST.
   * This is the same trap `tierOf` documents; a fixture caught it here.
   */
  if (typeof total !== "number" || !Number.isFinite(total)) return null;
  const pass = Math.round(total) >= clean.dc;
  /*
   * A pass hands over `text`; a failure hands over `miss` — the GM's written "what they take away
   * from a failed check" — or NOTHING when `miss` is empty (Joe, 2026-10-08). The delivered shape
   * is the same either way, so the card never says which it was.
   */
  // blank markup (`<p></p>`) is an empty side, not content — see `isBlankProse`
  const said = pass ? clean.text : clean.miss;
  const text = !isBlankProse(said) ? said : "";
  return {
    pass,
    text: text.trim(),
    /*
     * A side with nothing written (a failure with no `miss`, a pass with no `text`) hands over
     * nothing — and the caller must still write the lock and post the stub, so there is no retry. `silent` is how the conduit knows
     * to skip only the grant.
     */
    silent: !text.trim()
  };
}

/** A fresh row, ready for the editor. `id` is injected so this file stays free of randomness. */
export function makeLoreRow(id, { skill = "his", dc = LORE_DC_DEFAULT } = {}) {
  return { id: String(id ?? ""), label: "", dc, skill, text: "", miss: "", hold: null };
}
