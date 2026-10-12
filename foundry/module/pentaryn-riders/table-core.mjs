/**
 * Pure helpers for concentration.mjs and argon-tidy.mjs (no Foundry globals at import).
 * Fixtures: test/table.mjs (`node test/table.mjs`, also run from test/run.mjs).
 */

import { MODULE } from "./riders-core.mjs";

/** The one module id lives in riders-core (core → core); `MOD` is kept for old imports. */
export { MODULE, MODULE as MOD };

/** The flag a summoned token carries: the uuid of the concentration effect that keeps it. */
export const SUMMON_FLAG = "concentration";

/**
 * The concentration effect that a cast of `itemId` started, among an actor's effects.
 * dnd5e 6 marks each concentration effect with flags.dnd5e.item = { id, type, ... }.
 * The last match wins (a re-cast creates the new effect before ending the old one).
 * @param {Iterable<{ id?: string, uuid?: string, flags?: object, statuses?: Set<string>|string[] }>} effects
 * @param {string} itemId
 * @param {string} [status="concentrating"]
 * @returns {object|null}
 */
export function concentrationEffectFor(effects, itemId, status = "concentrating") {
  if (!itemId) return null;
  let found = null;
  for (const e of effects ?? []) {
    const statuses = e?.statuses instanceof Set ? e.statuses : new Set(e?.statuses ?? []);
    if (!statuses.has(status)) continue;
    const data = e?.flags?.dnd5e?.item ?? {};
    if (data.id === itemId || data.data?._id === itemId) found = e;
  }
  return found;
}

/**
 * Ids of the tokens (of one scene) that a deleted concentration effect was keeping on the map.
 * @param {Iterable<{ id: string, flags?: object }>} tokens
 * @param {string} effectUuid
 * @returns {string[]}
 */
export function summonTokenIds(tokens, effectUuid) {
  if (!effectUuid) return [];
  const ids = [];
  for (const t of tokens ?? []) {
    if (t?.flags?.[MODULE]?.[SUMMON_FLAG] === effectUuid) ids.push(t.id);
  }
  return ids;
}

/**
 * Does this item have an activity that spends another item's uses (`itemUses` consumption)?
 * Argon's badge on such a button shows the other item's uses, but Argon only re-renders the
 * button when its OWN item changes.
 * @param {{ system?: { activities?: Iterable<object> } }} item
 * @param {string} targetId   the item whose uses changed
 * @returns {boolean}
 */
export function spendsUsesOf(item, targetId) {
  if (!item || !targetId) return false;
  for (const a of item.system?.activities ?? []) {
    for (const t of a?.consumption?.targets ?? []) {
      if (t?.type === "itemUses" && t.target === targetId) return true;
    }
  }
  return false;
}

/* ── usability Area 5 re-run (cast-flow.mjs, argon-tidy.mjs parts 3–4) ──── */

/** Metamagic options (PHB 2024). None needs Argon's target picker: Careful Spell is chosen in the area tray. */
export const METAMAGIC = new Set([
  "careful-spell", "distant-spell", "empowered-spell", "extended-spell", "heightened-spell",
  "quickened-spell", "seeking-spell", "subtle-spell", "transmuted-spell", "twinned-spell"
]);

/** Should Argon's target picker be skipped for this item (a Metamagic option)? */
export function skipsTargetPicker(item) {
  return METAMAGIC.has(item?.system?.identifier ?? "");
}

/**
 * The level-scaling default for an activity that RESTORES a spell slot at a level the user picks
 * (Pearl of Power: "regain one expended spell slot of level 3 or lower"). dnd5e opens the slider at
 * the lowest level, so restoring a 3rd-level slot took an extra click (S11). The highest level at or
 * below the cap with a slot spent is the sensible default. An activity whose cost grows with the
 * level (Font of Magic: points → slot) is left alone: the cheapest level stays the default there.
 *
 * @param {object} p
 * @param {{type: string, value?: string, target?: string}[]} p.targets  consumption targets
 * @param {{allowed?: boolean, max?: string|number}} p.scaling          consumption.scaling
 * @param {Record<number, {value: number, max: number}>} p.slots          spell slots by level
 * @returns {number|null}  the scaling (levels above the base), or null to leave dnd5e's default
 */
export function restoreSlotScaling({ targets = [], scaling = {}, slots = {} } = {}) {
  if (!scaling?.allowed) return null;
  if ((targets ?? []).some(t => String(t?.value ?? "").includes("@scaling"))) return null;
  const restore = (targets ?? []).find(t => t?.type === "spellSlots" && Number(t.value) < 0);
  if (!restore) return null;
  const base = Number(String(restore.target ?? "").replace(/^spell/, "")) || 1;
  const cap = String(scaling.max ?? "").trim() === "" ? 9 : base + Math.max(0, Number(scaling.max) - 1);
  for (let level = Math.min(9, cap); level >= base; level--) {
    const s = slots?.[level];
    if (s && Number(s.max) > 0 && Number(s.value) < Number(s.max)) return level - base;
  }
  return null;
}

/* ── usability Area 6 re-run (wizard) ───────────────────────────────────── */

/**
 * Should a summon cast start with "Place Summons" ticked? dnd5e ticks it only when the activity's
 * own `summon.prompt` is set, and the PHB's Summon Undead and Animate Dead ship with it off, so
 * the player had to tick it every cast and only then saw the profile choice (W7, W9). Ticked when
 * placing is possible at all and the caller did not ask for no summons.
 * @param {{type: string, create: boolean|undefined, canSummon: boolean, hasScene: boolean, profiles: number}} p
 */
export function placeSummonsDefault({ type = "", create, canSummon = false, hasScene = false, profiles = 0 } = {}) {
  if (type !== "summon" || create === true) return false;
  return !!(canSummon && hasScene && profiles > 0);
}

/** Is this a wildcard texture path ("…/skeleton-*.webp") that a client cannot load as it is? */
export function isWildcardPath(src) {
  return typeof src === "string" && /[*?]/.test(src);
}

/** Feature identifiers that can turn a FAILED save into a success after the roll (keep the button). */
export const AFTER_FAIL_FEATURES = Object.freeze(["indomitable", "mind-sharpener", "bardic-inspiration"]);

/**
 * A rolled concentration save: what to show and whether to end the concentration now (W9).
 * dnd5e 6 marks a failed concentration save with a Break Concentration button and ends nothing;
 * the player had to read the bare total and click it. PHB: "If you take damage, you must succeed
 * on a Constitution saving throw to maintain Concentration."
 * @param {object} p
 * @param {number} p.total        the save's total
 * @param {number|null} p.dc      the roll's target (the DC), if known
 * @param {boolean} p.canBreak    dnd5e's own SaveMessageData#canBreakConcentration (a failure, not
 *                                already broken, an owner, concentration rules on, not resisted)
 * @param {boolean} [p.canResist] an NPC can still spend a Legendary Resistance
 * @param {string[]} [p.features] the actor's feature identifiers and active effect names, lowercased
 * @param {boolean} [p.auto]      the setting
 * @returns {{dc: number|null, failed: boolean|null, autoBreak: boolean}}
 */
export function concentrationResult({ total = null, dc = null, canBreak = false, canResist = false, features = [], auto = true } = {}) {
  const knownDc = Number.isFinite(Number(dc)) && dc !== null ? Number(dc) : null;
  const failed = knownDc !== null && Number.isFinite(Number(total)) ? Number(total) < knownDc : (canBreak ? true : null);
  const keep = canResist || (features ?? []).some(f => AFTER_FAIL_FEATURES.some(id => String(f).includes(id)));
  return { dc: knownDc, failed, autoBreak: !!(auto && canBreak && !keep) };
}

/** Arcane Recovery's budget: combined levels up to half the Wizard level, rounded up (PHB). */
export function arcaneRecoveryCap(wizardLevel) {
  return Math.max(0, Math.ceil((Number(wizardLevel) || 0) / 2));
}

/** Highest slot level Arcane Recovery may restore ("none of the slots can be level 6 or higher"). */
export const ARCANE_RECOVERY_MAX_LEVEL = 5;

/**
 * Arcane Recovery's opening choice: spend the budget on the highest spent slots first (level 5 down
 * to 1), never above level 5, never more slots of a level than are spent. The player can change it.
 * @param {Record<number, {value: number, max: number}>} slots  spell slots by level
 * @param {number} cap  combined levels allowed
 * @returns {Record<number, number>}  slots to restore by level (only levels with one or more)
 */
export function arcaneRecoveryDefault(slots = {}, cap = 0) {
  const out = {};
  let left = Math.max(0, Number(cap) || 0);
  for (let level = ARCANE_RECOVERY_MAX_LEVEL; level >= 1 && left > 0; level--) {
    const s = slots?.[level];
    let spent = s ? Math.max(0, Number(s.max) - Number(s.value)) : 0;
    while (spent > 0 && left >= level) { out[level] = (out[level] ?? 0) + 1; left -= level; spent--; }
  }
  return out;
}

/**
 * Is a chosen recovery allowed? → { ok, used, reason }. Reasons: "level" (6th or higher), "spent"
 * (more than are spent at a level), "cap" (over the combined levels).
 */
export function arcaneRecoveryCheck(choice = {}, slots = {}, cap = 0) {
  let used = 0;
  for (const [k, n] of Object.entries(choice ?? {})) {
    const level = Number(k), count = Number(n) || 0;
    if (!count) continue;
    if (count < 0) return { ok: false, used, reason: "spent" };
    if (level > ARCANE_RECOVERY_MAX_LEVEL || level < 1) return { ok: false, used, reason: "level" };
    const s = slots?.[level];
    const spent = s ? Math.max(0, Number(s.max) - Number(s.value)) : 0;
    if (count > spent) return { ok: false, used, reason: "spent" };
    used += level * count;
  }
  if (used > cap) return { ok: false, used, reason: "cap" };
  return { ok: true, used, reason: null };
}

/** Is this item the Wizard's Arcane Recovery? Identifier, PHB source, or name. */
export function isArcaneRecovery({ type = "", identifier = "", name = "" } = {}) {
  if (type && type !== "feat") return false;
  return identifier === "arcane-recovery" || String(name).trim().toLowerCase() === "arcane recovery";
}
