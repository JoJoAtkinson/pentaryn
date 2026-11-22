/**
 * Pentaryn Movement — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Nine rows: the four ghost / owned-on-top rows in their historic order, the three pathfinding
 * rows (0.3.0), then group movement and click to stop (0.4.0). Every row carries full literal label keys, the two hidden ones too (D-M3; never shown, since config: false rows do not render), so the
 * i18n gate proves each one. A row's onChange calls whatever the feature registered for that key with
 * onSettingChange(); the feature does that during its synchronous install, before `init`.
 */

import { DEFAULT_POLICY, MODULE } from "./movement-core.mjs";
import { DEFAULT_PATHFIND } from "./pathfind-core.mjs";
import { defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** key → the feature's change handler. */
const handlers = {};

/** Route a setting's onChange to `fn` (one handler per key; a later call replaces it). */
export function onSettingChange(key, fn) {
  handlers[key] = fn;
}

/** A row's onChange: forward to the handler the feature registered for that key. */
const forward = key => value => handlers[key]?.(value);

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
    onChange: forward("ghostPolicy"),
    doc: "GM policy for player ghost movement: off, exploration (off while a combat runs on the scene) or always.",
  },
  {
    key: "ghostPolicyLast", scope: "world", config: false, type: String, default: DEFAULT_POLICY,
    name: "PENTARYN_MOVEMENT.settings.ghostPolicyLast.name",
    hint: "PENTARYN_MOVEMENT.settings.ghostPolicyLast.hint",
    doc: "The mode the GM toolbar button restores when it is switched back on (exploration or always).",
  },
  {
    key: "ghost", scope: "client", config: false, type: Boolean, default: false,
    name: "PENTARYN_MOVEMENT.settings.ghost.name",
    hint: "PENTARYN_MOVEMENT.settings.ghost.hint",
    onChange: forward("ghost"),
    doc: "This player's ghost button (their wish); in effect only while the policy allows it. Client scope.",
  },
  {
    key: "ownedOnTop", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.ownedOnTop.name",
    hint: "PENTARYN_MOVEMENT.settings.ownedOnTop.hint",
    onChange: forward("ownedOnTop"),
    doc: "Draw this player's own tokens on top, on their screen only. Client scope.",
  },
  {
    key: "pathfinding", scope: "world", config: true, type: String, default: DEFAULT_PATHFIND,
    name: "PENTARYN_MOVEMENT.settings.pathfinding.name",
    hint: "PENTARYN_MOVEMENT.settings.pathfinding.hint",
    choices: {
      everyone: "PENTARYN_MOVEMENT.settings.pathfinding.everyone",
      gm: "PENTARYN_MOVEMENT.settings.pathfinding.gm",
      off: "PENTARYN_MOVEMENT.settings.pathfinding.off"
    },
    onChange: forward("pathfinding"),
    doc: "Drag pathfinding around walls: everyone (default), gm (GM drags only) or off. Read live on every drag.",
  },
  {
    key: "pathfindMine", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.pathfindMine.name",
    hint: "PENTARYN_MOVEMENT.settings.pathfindMine.hint",
    onChange: forward("pathfindMine"),
    doc: "This client's drags find a path around walls (when the world setting allows it). Client scope.",
  },
  {
    key: "smoothCorners", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.smoothCorners.name",
    hint: "PENTARYN_MOVEMENT.settings.smoothCorners.hint",
    onChange: forward("smoothCorners"),
    doc: "Round a found path's corners into arcs where that stays clear of walls and costs no extra movement. Client scope.",
  },
  {
    key: "groupMovement", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.groupMovement.name",
    hint: "PENTARYN_MOVEMENT.settings.groupMovement.hint",
    onChange: forward("groupMovement"),
    doc: "Several tokens dragged together each walk their own route to their own spot, started in turn so they do not overlap (0.4.0).",
  },
  {
    key: "assist", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.assist.name",
    hint: "PENTARYN_MOVEMENT.settings.assist.hint",
    onChange: forward("assist"),
    doc: "The table's drag help (0.4.9): off, every drag is plain Foundry dragging (no pathfinding, no group plan, no single-drop routing); the GM's toolbar button flips it. Pathfinding and Group movement keep their own values.",
  },
  {
    key: "clickToStop", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.clickToStop.name",
    hint: "PENTARYN_MOVEMENT.settings.clickToStop.hint",
    onChange: forward("clickToStop"),
    doc: "Clicking a moving token stops it where it is (in combat, at the next square). Client scope (0.4.0).",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
}

const rawSetting = settingReader(MODULE, SETTINGS);
/**
 * The live value; the row default when unregistered or unreadable. With the table's drag help off (`assist`,
 * the GM's toolbar button) pathfinding reads "off" and group movement false, whatever they are set to.
 */
export const setting = key => {
  if ((key === "pathfinding" || key === "groupMovement") && rawSetting("assist") === false) return key === "pathfinding" ? "off" : false;
  return rawSetting(key);
};

/**
 * Keys whose row is not registered, or whose raw read throws or returns a value of another type
 * than the row default (rob-4: the selftest check, which `setting()`'s default fallback would hide).
 */
export function unreadableSettings() {
  return SETTINGS.filter(r => {
    if (!game.settings.settings.has(`${MODULE}.${r.key}`)) return true;
    try {
      return typeof game.settings.get(MODULE, r.key) !== typeof r.default;
    } catch {
      return true;
    }
  }).map(r => r.key);
}

/** One queue for every policy write on this client (created on first use). */
let policySem = null;

/**
 * Run `fn` (an async read-compute-write of ghostPolicy/ghostPolicyLast) after every earlier policy
 * write on this client has finished, so the GM button and setPolicy never compute from a stale
 * policy (movement-async-1). Resolves to what `fn` returns; a rejection rejects that caller only.
 */
export function policyWrite(fn) {
  policySem ??= new foundry.utils.Semaphore(1);
  return policySem.add(fn);
}

/**
 * dnd5e's movementAutomation ("none" | "light" | "full"), which gates its creature blocking; the
 * pathfinder passes it to the same gate (pathfind-adapter.mjs). "none" when unreadable.
 */
export function dnd5eMovementAutomation() {
  try {
    return game.settings.get("dnd5e", "movementAutomation");
  } catch {
    return "none";
  }
}

export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}
