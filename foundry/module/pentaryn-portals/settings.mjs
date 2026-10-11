/**
 * Pentaryn Portal Cards — settings (usability Area 6 re-run). The only file outside lib/ that
 * calls game.settings.
 */

import { MODULE } from "./portals-core.mjs";

// Plain English: this module ships no language file (adding one changes module.json, a restart).
export const SETTINGS = {
  teleportDefault: { default: true, name: "Teleport is the default answer",
    hint: "The teleport question opens with Teleport focused (Enter teleports). Off: core's default, Don't Teleport." },
  spreadArrivals: { default: true, name: "Arrivals step off an occupied square",
    hint: "A player character who comes through a portal onto a square someone already stands on moves to the nearest free square around it (the GM's client does it)." },
  confirmPartyTeleport: { default: true, name: "Confirm a party teleport",
    hint: "The GM's Teleport party first lists who will move (each follower beside its PC) and asks. Off: it moves at once." }
};

export function setting(key) {
  try { return game.settings.get(MODULE, key); } catch { return SETTINGS[key]?.default; }
}

/** Called from the entry's `init`. */
export function registerSettings() {
  for (const [key, s] of Object.entries(SETTINGS)) {
    game.settings.register(MODULE, key, { name: s.name, hint: s.hint, scope: "world", config: true, type: Boolean, default: s.default });
  }
}
