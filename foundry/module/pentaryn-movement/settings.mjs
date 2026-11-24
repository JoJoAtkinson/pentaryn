/**
 * Pentaryn Movement — settings. The only file outside lib/ that calls game.settings.register/get.
 *
 * Nine rows: the four ghost / owned-on-top rows in their historic order, then the drag help's five (0.8.0, plan
 * §16.6): world `pathfinding` and client `pathfindMine` (tier A), the group gate `groupDrags` (out of combat the
 * file, in a fight one member at a time; 0.9.0 removed tier C's `fightGroupDrags`), the GM toolbar's `assist`, and
 * (0.9.0) `groupStagger`, B1 against B0: the file's start delays, or every member at once.
 * 0.8.0 folded smoothCorners and clickToStop in (always on) and renamed groupMovement to groupDrags;
 * migrateSettings() carries old values over once. Every row carries full
 * literal label keys, the two hidden ones too (D-M3; never shown, since config: false rows do not render), so the
 * i18n gate proves each one. A row's onChange calls whatever the feature registered for that key with
 * onSettingChange(); the feature does that during its synchronous install, before `init`.
 */

import { DEFAULT_POLICY, MODULE } from "./movement-core.mjs";
import { DEFAULT_PATHFIND } from "./pathfind-core.mjs";
import { defineKeybindings, defineSettings, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

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
    doc: "Tier A, drag pathfinding round walls and standing tokens (with the ruler and a single token's click-stop): everyone (default), gm (GM drags only) or off. Read live on every drag.",
  },
  {
    key: "pathfindMine", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.pathfindMine.name",
    hint: "PENTARYN_MOVEMENT.settings.pathfindMine.hint",
    onChange: forward("pathfindMine"),
    doc: "This client's drags find a path (when the world setting allows it). Client scope. Corners are always rounded where that costs nothing (0.8.0 folded smoothCorners in).",
  },
  {
    key: "groupDrags", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.groupDrags.name",
    hint: "PENTARYN_MOVEMENT.settings.groupDrags.hint",
    onChange: forward("groupDrags"),
    doc: "Group drags (0.8.0; was groupMovement): out of combat the file (0.9.0: each member its own spot and route, start delays within 4 s, filing through doors); in a fight one member at a time, each a single move routed at its turn (0.9.0, replaces tier C). Off: core's move, cut before standing tokens.",
  },
  {
    key: "assist", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.assist.name",
    hint: "PENTARYN_MOVEMENT.settings.assist.hint",
    onChange: forward("assist"),
    doc: "The table's drag help (0.4.9): off, every drag is plain Foundry dragging (no pathfinding, no group plan, no single-drop routing); the GM's toolbar button flips it. Pathfinding and the tier gates keep their own values. The circuit breaker (0.8.0) switches it off after repeated failures.",
  },
  {
    key: "groupStagger", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_MOVEMENT.settings.groupStagger.name",
    hint: "PENTARYN_MOVEMENT.settings.groupStagger.hint",
    onChange: forward("groupStagger"),
    doc: "0.9.0, B1 against B0 (Fable's review 2 §4 step 7): on (B1, the file), a group drag out of combat starts its members in waves within 4 s so they file through doors; off (B0), every member sets off in the drop's own update on its own route. Read live on every group drop; fights are one at a time either way.",
  },
]);

/** key → the feature's keybinding handler (telemetry.mjs registers it with onKey during its synchronous install). */
const keyHandlers = {};

/** Route a keybinding's onDown to `fn` (one handler per key; null removes it). */
export function onKey(key, fn) {
  keyHandlers[key] = fn;
}

/** Keybinding rows (0.8.0). onDown forwards to what the feature registered with onKey(). */
export const KEYBINDINGS = Object.freeze([
  {
    key: "wrongMove",
    name: "PENTARYN_MOVEMENT.telemetry.wrongMove.name",
    hint: "PENTARYN_MOVEMENT.telemetry.wrongMove.hint",
    editable: [{ key: "KeyW", modifiers: ["Alt"] }],
    onDown: () => keyHandlers.wrongMove?.() ?? false,
    doc: "That move was wrong: files the last ten seconds of this client's drag movement through pentaryn-feedback (telemetry.mjs).",
  },
]);

/** Called from the entry's `init` handler (rows already registered are skipped). */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS);
  try { defineKeybindings(MODULE, KEYBINDINGS); }
  catch (err) { globalThis.console?.debug?.(`${MODULE} | keybindings not registered`, err); }
}

const rawSetting = settingReader(MODULE, SETTINGS);

/** The drag help's keys the table switch (`assist`) and the circuit breaker turn off. */
const ASSISTED = Object.freeze({ pathfinding: "off", groupDrags: false });

/**
 * The circuit breaker (0.8.0, telemetry.mjs): after repeated fallbacks or errors in a session the drag help switches
 * itself off on this client at once (the GM's client also turns `assist` off for the table). Cleared by a reload, or by
 * the GM turning `assist` back on.
 */
let tripped = null;
export function tripAssist(why = "errors") { tripped = { at: new Date().toISOString(), why }; }
export function untripAssist() { tripped = null; }
export const assistTripped = () => (tripped ? { ...tripped } : null);

/**
 * The live value; the row default when unregistered or unreadable. With the table's drag help off (`assist`,
 * the GM's toolbar button) or the breaker tripped, pathfinding reads "off" and both group tiers false, whatever they
 * are set to.
 */
export const setting = key => {
  if (key in ASSISTED && (tripped || rawSetting("assist") === false)) return ASSISTED[key];
  return rawSetting(key);
};

/* -------------------------------------------- */
/*  0.8.0: the old rows' values carried over     */
/* -------------------------------------------- */

/**
 * Rows removed: world key → the row it became (or null: folded in, or gone). 0.8.0: groupMovement became groupDrags;
 * 0.9.0: fightGroupDrags (tier C) is gone, a group drag in a fight being the fight file under groupDrags.
 */
export const RETIRED = Object.freeze({
  world: { groupMovement: "groupDrags", fightGroupDrags: null },
  client: { smoothCorners: null, clickToStop: null },
});

/** A stored setting's value, parsed (stored values are JSON strings). */
function parsed(raw) {
  if (typeof raw !== "string") return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

/**
 * Once, at ready: an old world row's stored value moves to its new row (the active GM writes, then deletes the old
 * Setting document), and the folded client rows are dropped from this browser's storage. Returns what it did, for
 * status() and the CHANGELOG's migration line. Never throws.
 */
export async function migrateSettings() {
  const out = { world: {}, client: {} };
  try {
    const store = game.settings?.storage?.get?.("world");
    const gm = !!game.user?.isGM && (game.users?.activeGM?.id ?? game.user.id) === game.user.id;
    for (const [old, now] of Object.entries(RETIRED.world)) {
      const doc = store?.getSetting?.(`${MODULE}.${old}`);
      if (!doc) continue;
      const value = parsed(doc.value);
      out.world[old] = { value, to: now, moved: false };
      if (!gm) continue;
      if (now && typeof value === "boolean" && game.settings.settings.has(`${MODULE}.${now}`)) await game.settings.set(MODULE, now, value);
      await doc.delete?.();
      out.world[old].moved = true;
    }
  } catch (err) { out.error = String(err?.message ?? err); }
  try {
    const local = globalThis.localStorage;
    for (const old of Object.keys(RETIRED.client)) {
      const id = `${MODULE}.${old}`;
      const raw = local?.getItem?.(id);
      if (raw === null || raw === undefined) continue;
      out.client[old] = { value: parsed(raw), folded: true };
      local.removeItem(id);
    }
  } catch (err) { out.error ??= String(err?.message ?? err); }
  migrated = out;
  return out;
}
let migrated = null;
export const settingsMigrated = () => migrated;

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
