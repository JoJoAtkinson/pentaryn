/**
 * Verbatim oracles from starry.mjs at the wave-4 checkpoint (0.3.3). The only edit: Foundry reads
 * are injected as parameters (named in each header). Guide step 3 (-7) proves its seams against them.
 */

import { grantsFly } from "../../transform-core.mjs";

/** starry.mjs:81-87 `starrySecondsLeft`, with `activeStarry(actor)` (`e`) and `worldTime` injected. */
export function legacyStarrySecondsLeft(e, worldTime) {
  const start = e?.start?.time ?? e?._source?.start?.time;
  const secs = e?._source?.duration?.value;
  if (!Number.isFinite(start) || !Number.isFinite(secs)) return null;
  return start + secs - worldTime;
}

const IMG = {
  archer: "icons/weapons/bows/bow-ornamental-gold-blue.webp",
  chalice: "icons/magic/holy/chalice-glowing-yellow-blue.webp",
  dragon: "icons/creatures/reptiles/dragon-winged-blue.webp"
};

/** starry.mjs:98-102 `constellationImg`. Injected: the activity's `img`, the feature item's `itemImg`. */
export function legacyConstellationImg(img, itemImg, c) {
  const generic = !img || img.includes("mystery-man") || img.startsWith("systems/dnd5e/icons/svg/activity");
  return generic ? (IMG[c] ?? itemImg) : img;
}

/** starry.mjs:121-128 `baseEffect` (verbatim; `item.effects.contents` is the item's effects list). */
export function legacyBaseEffect(item, c, twinkling) {
  const effects = item?.effects?.contents ?? [];
  if (c === "dragon") {
    const dragons = effects.filter(e => /dragon/i.test(e.name));
    return (twinkling ? dragons.find(grantsFly) : dragons.find(e => !grantsFly(e))) ?? dragons[0] ?? null;
  }
  return effects.find(e => /^starry form$/i.test(e.name)) ?? null;
}

/** starry.mjs:233 — the chat key for an ending, by reason. */
export function legacyStarryEndKey(reason) {
  return reason === "incapacitated" ? "StarryIncapacitated" : (reason === "expired" ? "StarryExpired" : "StarryEnd");
}

/** starry.mjs:257-259 — the closed-dialog refund's arithmetic: the update, or null for none. */
export function legacyStarryRefund(uses) {
  const spent = uses?.spent;
  if (Number.isFinite(spent) && spent > 0) return { "system.uses.spent": spent - 1 };
  return null;
}
