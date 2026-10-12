/**
 * Off-hand corrections and the weapon-set seed.
 *
 *  offhandModeReset  dnd5e remembers the last attack mode per activity (flags.dnd5e.last.<id>), so
 *                    one Offhand swing made every later main-hand swing with that weapon default to
 *                    Offhand (no ability modifier). After any off-hand roll the remembered mode goes
 *                    back to the weapon's first main-hand mode. dnd5e writes `last` inside rollAttack
 *                    before dnd5e.postRollAttack fires, so restoring in that hook lands after it.
 *  offhandPip        Argon spends the pip of the activity's activation type, so an off-hand swing of
 *                    an `action` weapon greyed the Action pip. The Bonus pip is spent instead and the
 *                    Action pip given back when no main swing was made this turn (hud.mjs listens).
 *  seedWeaponSets    Argon's weapon-set slot was empty for the PCs. At the active GM's ready (and on
 *                    a new character), a character whose flags.enhancedcombathud.weaponSets was never
 *                    written gets set 1 = main melee + Light off-hand, set 2 = ranged. Never overwrites.
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { weaponsOf } from "./shapes.mjs";
import { setting } from "./settings.mjs";

const log = makeLog(MODULE);

const ARGON = "enhancedcombathud";

/** Put a weapon's remembered attack mode back to main-hand after an off-hand roll. */
export async function resetOffhandMode(activity, attackMode) {
  if (!setting("offhandModeReset") || !String(attackMode ?? "").endsWith("offhand")) return false;
  // dnd5e hands hooks a clone of the item (Activity#use works on one); write to the real one.
  const item = activity?.item ? (activity.item.actor?.items?.get(activity.item.id) ?? null) : null;
  if (!item?.isOwner) return false;
  const next = core.mainMode(item.system?.attackModes ?? []);
  if (!next) return false;
  await item.setFlag("dnd5e", `last.${activity.id}.attackMode`, next);
  return true;
}

/* ── weapon sets ─────────────────────────────────────────────────────────── */

function argonActive() {
  return !!game.modules.get(ARGON)?.active;
}

function readSets(actor) {
  try { return actor.getFlag(ARGON, "weaponSets"); } catch { return undefined; }
}

/** Seed one character if its weapon-set flag was never written. @returns {object|null} what was written */
export async function seedWeaponSets(actor) {
  if (!setting("seedWeaponSets") || !argonActive() || actor?.type !== "character") return null;
  // A character with a class: not an item pile or a template (type "character" too), and not a Wild
  // Shape form (dnd5e keeps the type; Argon ignores the flag for a transformed actor anyway).
  if (actor.isPolymorphed || actor.getFlag?.("dnd5e", "isPolymorphed")) return null;
  if (!actor.items?.some?.(i => i.type === "class")) return null;
  if (!core.shouldSeed(readSets(actor))) return null;
  const seed = core.weaponSetSeed(weaponsOf(actor));
  if (!seed) return null;
  await actor.setFlag(ARGON, "weaponSets", seed);
  log.info(`weapon sets seeded for ${actor.name}`, seed);
  return seed;
}

/** Active GM: every character with no weapon-set flag. */
export async function seedAll() {
  if (!game.users?.activeGM?.isSelf) return [];
  const out = [];
  for (const actor of game.actors.filter(a => a.type === "character")) {
    try {
      const seed = await seedWeaponSets(actor);
      if (seed) out.push({ actor: actor.name, seed });
    } catch (err) { log.warn(`weapon-set seed failed for ${actor.name}`, err); }
  }
  return out;
}

export function installOffhand() {
  Hooks.on("createActor", (actor) => {
    if (!game.users?.activeGM?.isSelf || actor.type !== "character") return;
    // Items arrive with the actor; give the sheet's own creation flow a beat.
    setTimeout(() => seedWeaponSets(actor).catch(err => { log.debug("weapon-set seed (new character)", err); return null; }), 500);
  });
}
