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
  npcSaveRollMode: "gmroll",
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
      choices: {
        gmroll: "PENTARYN_AOE.Setting.npcSaveRollMode.gmroll",
        blindroll: "PENTARYN_AOE.Setting.npcSaveRollMode.blindroll",
        publicroll: "PENTARYN_AOE.Setting.npcSaveRollMode.publicroll"
      }
    });
  }
}

/** Read a setting; the default if it is unregistered or unreadable. */
export function setting(key) {
  try {
    return game.settings.get(MODULE, key);
  } catch {
    return DEFAULTS[key];
  }
}
