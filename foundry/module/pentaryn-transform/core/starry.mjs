/**
 * Pentaryn Transform — pure Starry Form (Circle of the Stars) rules. Plain data in, plain data out.
 */

import { MODULE } from "./constants.mjs";

/* ── Starry Form (Circle of the Stars) ───────────────────────────────────── */

/** The three constellations, in the PHB's order. */
export const CONSTELLATIONS = Object.freeze(["archer", "chalice", "dragon"]);

/** Bright 10 ft, Dim 10 ft beyond it — Foundry's dim radius is measured from the token. */
export const STARRY_LIGHT = Object.freeze({
  bright: 10, dim: 20, color: "#cfe0ff", alpha: 0.35, luminosity: 0.5, coloration: 1,
  animation: { type: "starlight", speed: 2, intensity: 3, reverse: false }
});

/** Starry Form lasts 10 minutes. */
export const STARRY_SECONDS = 600;

/** The constellation an activity stands for, from its name ("Archer" → "archer"), or null. */
export function constellationOfActivity(activity) {
  const n = String(activity?.name ?? "").trim().toLowerCase();
  return CONSTELLATIONS.find(c => n === c || n.startsWith(`${c} `)) ?? null;
}

/**
 * The Starry Form effect for the druid: the feature's own base effect (or the Dragon's, whose
 * changes give the roll floors and, with Twinkling Constellations, Fly 20 and hover), renamed for
 * the constellation, enabled, not transferred, timed from now.
 *
 * @param {{ base: object|null, constellation: string, label: string, img?: string, now: number,
 *           seconds?: number, description?: string, origin?: string, id: string }} args
 *        base: the item effect's source (`effect.toObject()`), or null for a bare effect
 * @returns {object}  ActiveEffect data for `createEmbeddedDocuments(..., { keepId: true })`
 */
export function starryEffectData({ base = null, constellation, label, img, now, seconds = STARRY_SECONDS, description = "", origin, id }) {
  const src = base ? JSON.parse(JSON.stringify(base)) : {};
  delete src._stats;
  delete src.folder;
  delete src.sort;
  const data = {
    ...src,
    _id: id,
    name: `Starry Form: ${label}`,
    img: img || src.img || "icons/magic/symbols/star-solid-gold.webp",
    transfer: false,
    disabled: false,
    duration: { value: seconds, units: "seconds", expiry: null },
    start: { time: now },
    description,
    flags: { ...(src.flags ?? {}), [MODULE]: { starry: { constellation } } }
  };
  if (origin) data.origin = origin;
  return data;
}

/** Change keys that grant a fly speed: dnd5e 6's key and the pre-6 one (stored PHB effects keep it). */
const FLY_KEYS = Object.freeze(["system.attributes.movement.speeds.fly", "system.attributes.movement.fly"]);

/**
 * Does this effect grant a fly speed? Picks Twinkling Constellations' Dragon effect (Fly 20) over
 * the plain one. Changes sit at `changes` (pre-v14 source) or `system.changes`.
 * @param {object} effect  an ActiveEffect or its source
 * @returns {boolean}
 */
export function grantsFly(effect) {
  const changes = effect?.changes ?? effect?.system?.changes ?? [];
  return (Array.isArray(changes) ? changes : []).some(ch => FLY_KEYS.some(k => String(ch?.key ?? "").startsWith(k)));
}

/**
 * Can the druid take on (or change) a starry form now? Checked before any use is spent.
 * - shifted: Starry Form is taken "rather than shape-shifting".
 * - incapacitated: the form would end at once.
 * - noUses: none left (only when a use would be spent).
 * @returns {"shifted"|"incapacitated"|"noUses"|null}
 */
export function starryBlock({ shifted = false, incapacitated = false, usesLeft = null, spends = true } = {}) {
  if (shifted) return "shifted";
  if (incapacitated) return "incapacitated";
  if (spends && usesLeft === 0) return "noUses";
  return null;
}
