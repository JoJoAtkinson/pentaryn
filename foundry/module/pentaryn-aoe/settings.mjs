/**
 * World settings for pentaryn-aoe, plus a reader that falls back to the defaults.
 *
 * The fallback matters twice: while the module is hot-patched into a client before the server
 * has scanned it, and on any client where registration failed. A missing setting must never
 * throw inside a chat or region hook.
 */

import { MODULE } from "./core.mjs";

export const DEFAULTS = {
  handleTokens: true,
  removeAreaButton: true,
  instantCleanup: true,
  concentrationCleanup: true,
  resolveSaves: true,
  npcSaveRollMode: "gm",
  autoApplyNpc: false,
  promptPlayers: true,
  autoDamageOnHit: true,
  autoApplySelf: true,
  highlightUnapplied: true
};

const BOOLS = [
  "handleTokens", "removeAreaButton", "instantCleanup", "concentrationCleanup",
  "resolveSaves", "autoApplyNpc", "promptPlayers", "autoDamageOnHit", "autoApplySelf", "highlightUnapplied"
];

export function registerSettings() {
  for (const key of BOOLS) {
    if (game.settings.settings.has(`${MODULE}.${key}`)) continue;
    game.settings.register(MODULE, key, {
      name: `PENTARYN_AOE.Setting.${key}.Name`,
      hint: `PENTARYN_AOE.Setting.${key}.Hint`,
      scope: "world", config: true, type: Boolean, default: DEFAULTS[key]
    });
  }
  if (!game.settings.settings.has(`${MODULE}.npcSaveRollMode`)) {
    game.settings.register(MODULE, "npcSaveRollMode", {
      name: "PENTARYN_AOE.Setting.npcSaveRollMode.Name",
      hint: "PENTARYN_AOE.Setting.npcSaveRollMode.Hint",
      scope: "world", config: true, type: String, default: DEFAULTS.npcSaveRollMode,
      // Core v14 message modes. dnd5e 6 hands the roll mode to core as messageMode, and core
      // replaces a name it does not know (the old "gmroll") with the client default, i.e. public.
      choices: {
        gm: "PENTARYN_AOE.Setting.npcSaveRollMode.gm",
        blind: "PENTARYN_AOE.Setting.npcSaveRollMode.blind",
        public: "PENTARYN_AOE.Setting.npcSaveRollMode.public"
      }
    });
  }
}

/** The pre-6.0 roll-mode names this setting stored (core's own mapping turns them into message modes). */
export const LEGACY_ROLL_MODES = ["gmroll", "blindroll", "publicroll"];

/**
 * One-shot, active GM: a world that stored a legacy roll-mode name ("gmroll") gets the core v14
 * message mode ("gm") written back, so the settings menu shows a real choice again. Until it has
 * run (a hot-patched client), resolve.mjs maps the stored name at the roll anyway.
 */
export async function migrateSettings() {
  if (!game.users?.activeGM?.isSelf) return null;
  let stored;
  try { stored = game.settings.get(MODULE, "npcSaveRollMode"); } catch { return null; }
  if (!LEGACY_ROLL_MODES.includes(stored)) return null;
  const next = foundry.dice.Roll._mapLegacyRollMode(stored);
  await game.settings.set(MODULE, "npcSaveRollMode", next);
  console.info(`${MODULE} | npcSaveRollMode ${stored} → ${next}`);
  return next;
}

/** Read a setting; the default if it is unregistered or unreadable. */
export function setting(key) {
  try {
    return game.settings.get(MODULE, key);
  } catch {
    return DEFAULTS[key];
  }
}
