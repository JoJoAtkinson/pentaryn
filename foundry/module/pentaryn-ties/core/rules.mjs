/**
 * Pure rules added after the S4 split (wave 3): the flat-roll miss verdict (ties-13), the fact-key
 * and flag-name grammar the GM-side files used to spell by hand (ties-14), the concealment clamp
 * (ties-9) and the first-name rule the roster and the inspect window share (ties-15).
 *
 * NOT re-exported by the known-core.mjs barrel: that barrel's export list is pinned
 * (test/golden/known-core-exports.json) so a console macro that imports it never loses a name. Import
 * these from `./core/rules.mjs` directly.
 *
 * Pure: no Foundry global; imports only core files.
 */

/**
 * Did this rolled, flat pass/fail row (lore, attribute lore) MISS?
 *
 * A share is never a failure, whatever it replaced. The roll's own verdict (`pass`) decides when it
 * was recorded; a legacy row without one is graded by its total against the row's DC. Each caller
 * keeps its own kind / identification / null handling around this (the four call sites differ
 * there on purpose — see study.mjs `rowMissed`, `beliefs`, `legacyMissCards` and `shareStatus`).
 *
 * @param {object|null} rec  a ledger row
 * @param {*} dc             the row's DC (anything not a number grades nothing)
 * @returns {boolean}
 */
export function rolledMiss(rec, dc) {
  if (!rec || rec.from) return false;
  if (typeof rec.pass === "boolean") return rec.pass === false;
  return typeof rec.total === "number" && typeof dc === "number" && Math.round(rec.total) < dc;
}
