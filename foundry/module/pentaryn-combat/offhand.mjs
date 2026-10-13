/**
 * Off-hand corrections and the weapon-set seed (feature, installed at setup).
 *
 *  offhandModeReset  after an off-hand roll the weapon's remembered attack mode goes back to its
 *                    first main-hand mode (shapes.mjs resetOffhandMode; counting.mjs calls it).
 *  offhandPip        an off-hand swing spends the Bonus pip, not the Action pip (hud/bars.mjs).
 *  seedWeaponSets    Argon's weapon-set slot was empty for the PCs. At the active GM's ready (and on
 *                    a new character), a character whose flags.enhancedcombathud.weaponSets was never
 *                    written gets set 1 = main melee + Light off-hand, set 2 = ranged. Never overwrites.
 *                    seedAll writes every character in one Actor.updateDocuments.
 */

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { weaponsOf } from "./shapes.mjs";
import { ARGON, setting } from "./settings.mjs";

const log = makeLog(MODULE);

/* ── weapon sets ─────────────────────────────────────────────────────────── */

function argonActive() {
  return !!game.modules.get(ARGON)?.active;
}

function readSets(actor) {
  try { return actor.getFlag(ARGON, "weaponSets"); } catch { return undefined; }
}

/** The seed for one character whose weapon-set flag was never written, or null (nothing to write). */
function seedFor(actor) {
  if (!setting("seedWeaponSets") || !argonActive() || actor?.type !== "character") return null;
  // A character with a class: not an item pile or a template (type "character" too), and not a Wild
  // Shape form (dnd5e keeps the type; Argon ignores the flag for a transformed actor anyway).
  if (actor.isPolymorphed || actor.getFlag?.("dnd5e", "isPolymorphed")) return null;
  if (!actor.items?.some?.(i => i.type === "class")) return null;
  if (!core.shouldSeed(readSets(actor))) return null;
  return core.weaponSetSeed(weaponsOf(actor)) || null;
}

/** Seed one character if its weapon-set flag was never written. @returns {object|null} what was written */
export async function seedWeaponSets(actor) {
  const seed = seedFor(actor);
  if (!seed) return null;
  await actor.setFlag(ARGON, "weaponSets", seed);
  log.info(`weapon sets seeded for ${actor.name}`, seed);
  return seed;
}

/**
 * Active GM: every character with no weapon-set flag, written in ONE Actor.updateDocuments
 * (combat-core-AC-1). A character whose seed cannot be computed is warned and skipped; a failed
 * batch is warned once, naming the actors, and nobody is seeded.
 */
export async function seedAll() {
  if (!game.users?.activeGM?.isSelf) return [];
  const rows = [];
  for (const actor of game.actors.filter(a => a.type === "character")) {
    try {
      const seed = seedFor(actor);
      if (seed) rows.push({ actor, seed });
    } catch (err) { log.warn(`weapon-set seed failed for ${actor.name}`, err); }
  }
  if (!rows.length) return [];
  try {
    await Actor.updateDocuments(rows.map(({ actor, seed }) => ({ _id: actor.id, [`flags.${ARGON}.weaponSets`]: seed })));
  } catch (err) {
    log.warn(`weapon-set seed failed for ${rows.map(r => r.actor.name).join(", ")}`, err);
    return [];
  }
  for (const { actor, seed } of rows) log.info(`weapon sets seeded for ${actor.name}`, seed);
  return rows.map(({ actor, seed }) => ({ actor: actor.name, seed }));
}

/* ── install ─────────────────────────────────────────────────────────────── */

const timers = new Set();

export function install(reg) {
  registerSeed(reg);
  return { impl: { seedWeaponSets, seedAll } };
}

function registerSeed(reg) {
  reg.on("createActor", (actor) => {
    if (!game.users?.activeGM?.isSelf || actor.type !== "character") return;
    // Items arrive with the actor; give the sheet's own creation flow a beat.
    const t = setTimeout(() => {
      timers.delete(t);
      seedWeaponSets(actor).catch(err => { log.warn("weapon-set seed (new character)", err); return null; });
    }, core.DELAYS.seedAfterCreate);
    timers.add(t);
  }, { label: "seed a new character's weapon sets" });
}

export function uninstall() {
  for (const t of timers) clearTimeout(t);
  timers.clear();
}
