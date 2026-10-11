/**
 * Pentaryn Movement — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Four rows, in the order they have always been registered. Labels are full literal keys (the i18n
 * gate proves each one). A row's onChange calls whatever the feature registered for that key with
 * onSettingChange(); the feature does that during its synchronous install, before `init`.
 */

import { DEFAULT_POLICY, MODULE } from "./movement-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** key → the feature's change handler. */
const handlers = {};

/** Route a setting's onChange to `fn` (one handler per key; a later call replaces it). */
export function onSettingChange(key, fn) {
  handlers[key] = fn;
}

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "ghostPolicy", scope: "world", config: true, type: String, default: DEFAULT_POLICY,
    name: "PENTARYN_MOVEMENT.settings.policy.name",
    hint: "PENTARYN_MOVEMENT.settings.policy.hint",
    choices: {
      off: "PENTARYN_MOVEMENT.settings.policy.off",
      exploration: "PENTARYN_MOVEMENT.settings.policy.exploration",
      always: "PENTARYN_MOVEMENT.settings.policy.always"
    },
    onChange: value => handlers.ghostPolicy?.(value),
    doc: "GM policy for player ghost movement: off, exploration (off while a combat runs on the scene) or always.",
  },
  {
    key: "ghostPolicyLast", scope: "world", config: false, type: String, default: DEFAULT_POLICY,
    doc: "The mode the GM toolbar button restores when it is switched back on (exploration or always).",
  },
  {
    key: "ghost", scope: "client", config: false, type: Boolean, default: false,
    onChange: value => handlers.ghost?.(value),
    doc: "This player's ghost button (their wish); in effect only while the policy allows it. Client scope.",
  },
  {
    key: "ownedOnTop", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.ownedOnTop.name",
    hint: "PENTARYN_MOVEMENT.settings.ownedOnTop.hint",
    onChange: value => handlers.ownedOnTop?.(value),
    doc: "Draw this player's own tokens on top, on their screen only. Client scope.",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

/** The live value; the row default when unregistered or unreadable. */
export const setting = settingReader(MODULE, SETTINGS);

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
