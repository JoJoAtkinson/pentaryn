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

/** The Starry Form feature's identity: its identifier first, its name as the fallback (wildshape.mjs isStarryFormData, starry-adapter.mjs starryItem). */
export const STARRY_FORM = Object.freeze({ identifier: "starry-form", name: "Starry Form" });

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
 * the constellation, enabled, not transferred, started now.
 *
 * Off Foundry's world clock (D8, Joe's ruling): out of combat there are no turns to track, so the form
 * stays on; in combat starry.mjs counts `flags.<module>.starry.left` down by combat time. So no
 * duration value, and dnd5e's `isTemporary` flag keeps it a temporary effect (token icon) that
 * Foundry's effect registry does not track.
 *
 * @param {{ base: object|null, constellation: string, label: string, img?: string, now: number,
 *           seconds?: number, description?: string, origin?: string, id: string }} args
 *        base: the item effect's source (`effect.toObject()`), or null for a bare effect
 *        seconds: the combat time left on the form
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
    duration: { value: null, units: "seconds", expiry: null },
    start: { time: now },
    description,
    flags: { ...(src.flags ?? {}), dnd5e: { ...(src.flags?.dnd5e ?? {}), isTemporary: true }, [MODULE]: { starry: { constellation, left: seconds } } }
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

/** A constellation's own picture when its activity has none of its own. */
export const STARRY_IMG = Object.freeze({
  archer: "icons/weapons/bows/bow-ornamental-gold-blue.webp",
  chalice: "icons/magic/holy/chalice-glowing-yellow-blue.webp",
  dragon: "icons/creatures/reptiles/dragon-winged-blue.webp"
});

/** True for an image nobody chose: empty, the mystery man, or dnd5e's generic activity icon. */
export function isGenericActivityImg(img) {
  return !img || img.includes("mystery-man") || img.startsWith("systems/dnd5e/icons/svg/activity");
}

/**
 * The constellation's picture: the activity's own image if someone set one, else the fixed one,
 * else the feature item's (transform-creatures-7).
 */
export function constellationImgOf(img, itemImg, c) {
  return isGenericActivityImg(img) ? (STARRY_IMG[c] ?? itemImg) : img;
}

/**
 * The feature's effect a constellation brings: for the Dragon, the one granting flight with
 * Twinkling Constellations (else the one without), else the first Dragon effect; otherwise the
 * effect named exactly "Starry Form". null for none (transform-creatures-7).
 * @param {object[]} effects  the feature item's effects
 */
export function pickStarryBase(effects, c, twinkling) {
  const list = effects ?? [];
  if (c === "dragon") {
    const dragons = list.filter(e => /dragon/i.test(e.name));
    return (twinkling ? dragons.find(grantsFly) : dragons.find(e => !grantsFly(e))) ?? dragons[0] ?? null;
  }
  return list.find(e => /^starry form$/i.test(e.name)) ?? null;
}

/** Seconds left: start + seconds - now (negative once past), or null unless both are finite. */
export function secondsLeft({ start, seconds, now }) {
  if (!Number.isFinite(start) || !Number.isFinite(seconds)) return null;
  return start + seconds - now;
}

/** The chat line for a Starry Form ending, by reason: StarryIncapacitated, StarryExpired, StarryEnd. */
export function starryEndKey(reason) {
  return reason === "incapacitated" ? "StarryIncapacitated" : (reason === "expired" ? "StarryExpired" : "StarryEnd");
}
