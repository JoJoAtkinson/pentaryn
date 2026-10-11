/**
 * pentaryn-prompts — settings, keybindings and the manifest ring. The only file outside lib/ that
 * calls game.settings.register/get.
 *
 * The rows keep today's registrations byte for byte (golden/settings.json): literal
 * `PENTARYN_PROMPTS.settings.<key>.name/.hint` labels, the same scope, type, default, range and
 * choices, in the same order. `defaultSize.choices` is an OBJECT on purpose — the kit derives label
 * keys for array choices.
 */

import { GATHER_CHARS, SIZE_KEYS } from "./geometry-core.mjs";
import { MODULE, I18N } from "./prompts-core.mjs";
import { defineKeybindings, defineSettings, settingsSnapshot as snapshot } from "./lib/settings.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "panelRows", scope: "world", config: true, type: Number, default: 12, range: { min: 3, max: 40, step: 1 },
    name: "PENTARYN_PROMPTS.settings.panelRows.name", hint: "PENTARYN_PROMPTS.settings.panelRows.hint",
    doc: "Rows the dialog's side panel lists before \"+N more\". Read on each panel draw.",
  },
  {
    key: "panelChars", scope: "world", config: true, type: Number, default: 90, range: { min: 30, max: 300, step: 10 },
    name: "PENTARYN_PROMPTS.settings.panelChars.name", hint: "PENTARYN_PROMPTS.settings.panelChars.hint",
    doc: "Characters of text per side-panel row. Read on each panel draw.",
  },
  {
    key: "gatherChars", scope: "world", config: true, type: Number, default: GATHER_CHARS, range: { min: 60, max: 1200, step: 20 },
    name: "PENTARYN_PROMPTS.settings.gatherChars.name", hint: "PENTARYN_PROMPTS.settings.gatherChars.hint",
    doc: "Characters of a built thing's description in the gather text (cut at a sentence end). A gather's chars argument wins.",
  },
  {
    key: "unseenWithinFt", scope: "world", config: true, type: Number, default: 60, range: { min: 0, max: 300, step: 5 },
    name: "PENTARYN_PROMPTS.settings.unseenWithinFt.name", hint: "PENTARYN_PROMPTS.settings.unseenWithinFt.hint",
    doc: "Things behind a wall or door are still listed when this close (ft), in the panel and the gather.",
  },
  {
    key: "cropMaxPerCall", scope: "world", config: true, type: Number, default: 6, range: { min: 0, max: 12, step: 1 },
    name: "PENTARYN_PROMPTS.settings.cropMaxPerCall.name", hint: "PENTARYN_PROMPTS.settings.cropMaxPerCall.hint",
    doc: "Most encounter crops one gather (or crops call) returns.",
  },
  {
    key: "cropLongSidePx", scope: "world", config: true, type: Number, default: 768, range: { min: 256, max: 1568, step: 64 },
    name: "PENTARYN_PROMPTS.settings.cropLongSidePx.name", hint: "PENTARYN_PROMPTS.settings.cropLongSidePx.hint",
    doc: "Long side of each encounter crop, in px.",
  },
  {
    key: "cropsDefault", scope: "world", config: true, type: String, default: "auto",
    name: "PENTARYN_PROMPTS.settings.cropsDefault.name", hint: "PENTARYN_PROMPTS.settings.cropsDefault.hint",
    choices: {
      auto: "PENTARYN_PROMPTS.settings.cropsDefault.auto",
      on: "PENTARYN_PROMPTS.settings.cropsDefault.on",
      off: "PENTARYN_PROMPTS.settings.cropsDefault.off",
    },
    doc: "Encounter images when a gather does not say: auto (exactly one scene with art), on, off.",
  },
  {
    key: "party", scope: "world", config: true, type: String, default: "",
    name: "PENTARYN_PROMPTS.settings.party.name", hint: "PENTARYN_PROMPTS.settings.party.hint",
    doc: "The world's party for encounter budgets, size x level (\"4x5\"); blank = none. A call's party wins.",
  },
  {
    key: "deleteEmptyOnClose", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_PROMPTS.settings.deleteEmptyOnClose.name", hint: "PENTARYN_PROMPTS.settings.deleteEmptyOnClose.hint",
    doc: "A freshly dropped or placed marker closed with no text is deleted.",
  },
  {
    key: "defaultSize", scope: "client", config: true, type: String, default: "mid",
    name: "PENTARYN_PROMPTS.settings.defaultSize.name", hint: "PENTARYN_PROMPTS.settings.defaultSize.hint",
    choices: Object.fromEntries(SIZE_KEYS.map(k => [k, k])),
    doc: "The marker size the P key places on this client.",
  },
  // the manifest ring (plan §6.4): never shown, written by gather on a GM client
  { key: "lastCalls", store: true, type: Array, default: [], doc: "The last five gather manifests (call id → ids, hashes, encounters); replace and crops read them." },
]);

/** Called from the entry's `init` handler, before the keybindings. */
export function registerSettings() {
  defineSettings(MODULE, SETTINGS, { i18nRoot: I18N, labels: { section: "settings", name: "name", hint: "hint" } });
}

/**
 * The two keybinding rows, with the `onDown` handlers the caller passes (the placement feature's).
 * Literal `PENTARYN_PROMPTS.keybind.*` labels, as registered today.
 */
export function keybindingRows({ place, edit }) {
  return [
    {
      key: "place", name: "PENTARYN_PROMPTS.keybind.place", hint: "PENTARYN_PROMPTS.keybind.placeHint",
      editable: [{ key: "KeyP" }], restricted: true, onDown: place,
      doc: "P: a marker of the client's default size under the cursor, its box open (GM only).",
    },
    {
      key: "edit", name: "PENTARYN_PROMPTS.keybind.edit", hint: "PENTARYN_PROMPTS.keybind.editHint",
      editable: [{ key: "KeyP", modifiers: ["Shift"] }], restricted: true, onDown: edit,
      doc: "Shift+P: open the hovered marker's box.",
    },
  ];
}

/** Keybindings register during `init` only (Foundry refuses them after setup). */
export function registerKeybindings(rows, { log = null } = {}) {
  defineKeybindings(MODULE, rows, { i18nRoot: I18N, log });
}

/**
 * The live value, or `fallback` when it is unset (`null`/`undefined`) or unreadable — today's LOCAL
 * semantics (the kit's settingReader would answer the row default instead).
 */
export function setting(key, fallback) {
  try {
    return game.settings.get(MODULE, key) ?? fallback;
  } catch (err) {
    log.debug(`setting ${key} unreadable`, err);
    return fallback;
  }
}

/** The live value; a throw propagates (the P key's defaultSize read, as today). */
export function settingStrict(key) {
  return game.settings.get(MODULE, key);
}

/** `{ key: liveValue }` for every row; the lastCalls store reports `{ store: true, size }`. */
export function settingsSnapshot() {
  return snapshot(MODULE, SETTINGS);
}

/* ── the manifest ring (hidden world setting `lastCalls`) ──────────────────── */

const RING = 5;

export function manifests() {
  const v = setting("lastCalls", []);
  return Array.isArray(v) ? v : [];
}

export function manifestFor(call) {
  return manifests().find(m => m?.call === call) ?? null;
}

/** Newest first, five kept, one per call id. GM clients only; a plain set, not a serialStore (yet). */
export async function storeManifest(manifest) {
  if (!game.user?.isGM) return;
  const ring = manifests().filter(m => m?.call !== manifest.call);
  ring.unshift(manifest);
  await game.settings.set(MODULE, "lastCalls", ring.slice(0, RING));
}
