/**
 * Pentaryn Transform — the constants every core file shares. PURE.
 *
 * The core/ files import these from here, never from the barrel (transform-core.mjs), so the
 * barrel can re-export them all without an import cycle.
 */

export const MODULE = "pentaryn-transform";

/** The duration effect pushed onto every Wild Shape form. Static, 16 characters. */
export const EFFECT_ID = "pentarynWildShp0";

/** dnd5e's duration units → seconds. A round is six seconds; a turn is counted as one round. */
export const UNIT_SECONDS = Object.freeze({
  turn: 6, round: 6, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000
});
