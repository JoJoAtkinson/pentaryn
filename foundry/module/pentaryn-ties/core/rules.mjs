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

import { MEMBER_FACT } from "./attributes.mjs";

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

/* ── the key and flag grammar (ties-14) ───────────────────────────────────── */

/** The per-actor concealment flag (`flags.pentaryn-ties.conceal`): a number, or `{ default, <attrId> }`. */
export const CONCEAL_FLAG = "conceal";

/**
 * The reserved row key an inspection stakes in the subject's `beliefs` ledger while it runs — a claim,
 * never an answer (study `claimInspect` / `releaseInspect`).
 */
export const INSPECT_CLAIM_KEY = "#inspect";

/**
 * Is this a ledger / grant key for an identification (`attr:<attrId>:#id`, as `identifiedKey` builds
 * it)? The same test the GM-side files spelled `key.endsWith(":#id")`. An identification MISS line
 * (`lore:<subject>:#idmiss-<attr>`) is not one.
 */
export const isIdentKey = key => String(key ?? "").endsWith(`:${MEMBER_FACT}`);

/* ── concealment (ties-9 part 3) ──────────────────────────────────────────── */

/**
 * How much an actor's concealment raises the DC to identify one attribute on it — never printed.
 * `raw` is the `conceal` flag: a number for every attribute, or `{ default, <attrId>: n }`. Clamped to
 * 0–20 and rounded; anything that is not a number reads as 0. The one copy of the clamp the
 * cascade (study) and the GM's inspect preview both use.
 */
export function concealFor(raw, attrId) {
  if (typeof raw === "number") return Math.max(0, Math.min(20, Math.round(raw)));
  return Math.max(0, Math.min(20, Math.round(Number(raw?.[attrId] ?? raw?.default ?? 0) || 0)));
}

/* ── names (ties-15) ──────────────────────────────────────────────────────── */

/** "Caven Ashwell" → "Caven", "Talo, the Quiet" → "Talo"; a blank name → "" ; null → "?". */
export const firstName = name => String(name ?? "").trim().split(/[\s,]/)[0] || String(name ?? "?");
