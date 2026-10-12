/**
 * The pieces two or more core files read: the private number/string clamps, the Known notes cap, the
 * attribute title cap and the share-row provenance helpers. NOT part of the known-core.mjs barrel —
 * each exported cap is re-exported by the file that owns its domain (core/known, core/attributes,
 * core/study), so the barrel's export list is what it was before the split.
 *
 * Pure: no Foundry global (split out of known-core.mjs — S4, ties-36). Imports nothing.
 */

/**
 * Known notes get their OWN cap, deliberately larger than a tie's 4000.
 *
 * A tie note is one paragraph about one relationship. A Known entry is a bestiary page that
 * phase 3 will *append* study reveals to — description, then immunities, then attacks — on
 * top of whatever the player already wrote. Sharing `NOTES_MAX` would mean a well-kept entry
 * silently truncating either its own prose or the reveal that was just paid for with a roll.
 * (The plan's own correction, build-and-validate §5.)
 */
export const KNOWN_NOTES_MAX = 8000;

export const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
/*
 * A number, or a numeric string (a form field), rounded; anything else takes the default. Typed
 * first, as ties-core.mjs's own `num`: `Number(null | "" | [] | false)` is 0, so the old
 * `Number.isFinite(Number(v))` read a missing or cleared DC as 0 and clamped it to 1 instead of the
 * default 15 (M1, declared).
 */
export const num = (v, d) => {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : d;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Math.round(Number(v));
  return d;
};

/**
 * A real number, or `null` — and it is `null` for `null`.
 *
 * ⚠ **`Number(null)` is `0`, and `0` is finite.** So the obvious guard,
 * `Number.isFinite(Number(v)) ? … : null`, silently turns "no value" into "zero". That has now
 * bitten this module three times: a cancelled lore roll graded as a total of 0 and spent the
 * player's one attempt; and a kind the GM *told* a character about appeared in the belief ledger
 * as **"rolled 0"** — which is not a smaller truth than "I told them", it is a different and false
 * one, in the record whose whole job is to tell the GM what actually happened.
 *
 * Check the type FIRST. Every nullable numeric field in this file goes through here.
 */
export const numOrNull = v => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

/** A timestamp, or `null`. `0` is not a time — "never delivered" must not read as the epoch. */
export const timeOrNull = v => {
  const n = numOrNull(v);
  return n !== null && n > 0 ? n : null;
};

export const clampKnownNotes = v => str(v, KNOWN_NOTES_MAX);

export const ATTR_TITLE_MAX = 120;

/**
 * The provenance of a **shared** belief row: the character id it came from, or `"gm"`.
 *
 * Spread in only when present, so every rolled row keeps exactly the shape it always had (and
 * every stored row does not grow a `from: null` it never needed). GM-plane only — it lives on the
 * NPC's ledger or in a GM-only setting, never on anything a player reads.
 */
export const SHARE_FROM_MAX = 40;
export const fromOf = rec => {
  const v = typeof rec?.from === "string" ? rec.from.trim().slice(0, SHARE_FROM_MAX) : "";
  return v ? { from: v } : {};
};

/**
 * The roll's own verdict on a flat pass/fail row (lore and attribute lore), stored explicitly
 * because the text could not always carry it: before 2026-10 a failed row WITH authored miss
 * text stored that miss line as its text, indistinguishable from a pass by text alone. A failure
 * now stores `text: ""`, but those legacy rows are still in the world, so the verdict stays
 * explicit. Spread in only when a real boolean — rows written before this field existed have
 * none, and `shareStatus` derives theirs from `total` against the row's DC instead.
 */
export const passOf = rec => (typeof rec?.pass === "boolean" ? { pass: rec.pass } : {});
