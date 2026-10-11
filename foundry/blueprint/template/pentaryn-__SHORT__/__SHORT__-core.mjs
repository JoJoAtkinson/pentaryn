/**
 * __Title__ — PURE core: constants, the HOOKS table, and the rules.
 *
 * No Foundry global at runtime (only pure `foundry.utils.*` helpers are allowed), so every rule
 * here runs in node on plain fixtures. Glue files import from here; nothing here imports glue.
 * Past ~600 lines, split into core/<topic>.mjs behind this file as a barrel.
 */

export const MODULE = "pentaryn-__SHORT__";
export const SHORT = "__SHORT__";
export const NS = "__NS__";
export const VERSION = "0.1.0";                       // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-__SHORT__/api@1";   // bump the major on a published-shape change
export const I18N = "PENTARYN___SHORT_UPPER__";
export const CSS = "__CSS__";
export const FLAG_SCOPE = MODULE;

/** Events this module emits. New names are `pentaryn-<short>.<camelEvent>`; pre-hooks are vetoable. */
export const HOOKS = Object.freeze({
  noteChanged: Object.freeze({ name: "pentaryn-__SHORT__.noteChanged", pre: false, args: "(actor, note)" }),
});

/** Longest note kept. */
export const NOTE_MAX = 200;

/**
 * The example rule: a GM note, normalised — trimmed, inner whitespace collapsed, capped at
 * NOTE_MAX characters. Empty or non-string → null (meaning "no note").
 * @param {*} text
 * @returns {string|null}
 */
export function noteText(text) {
  if (typeof text !== "string") return null;
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > NOTE_MAX ? `${s.slice(0, NOTE_MAX - 1)}…` : s;
}
// @if dnd5e

/**
 * HP from a dnd5e actor-like object: `{ value, max, bloodied }`, or null when it has none.
 * Pure — it reads the object it is given, never a global.
 */
export function hpOf(actorLike) {
  const hp = actorLike?.system?.attributes?.hp;
  if (!hp || !Number.isFinite(hp.value)) return null;
  const max = Number.isFinite(hp.max) && hp.max > 0 ? hp.max : null;
  return { value: hp.value, max, bloodied: max !== null && hp.value <= max / 2 };
}
// @endif
