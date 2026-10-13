/**
 * Pentaryn NPC Ties — settings and keybindings. The only file outside lib/ that calls
 * game.settings.register/get.
 *
 * Every row keeps the LITERAL label keys it has always registered (`PENTARYN_TIES.settings.*`,
 * `PENTARYN_TIES.keybind.*` — the flat shape, decision D4), so nothing in lang/en.json moves and the
 * i18n gate sees each key as a definite reference. Registration order is unchanged: the six keys
 * first, then the ten settings (golden/glue-boot-gm.json pins it).
 *
 * SETTINGS may not import a feature, so the keys' bodies are handed in by the entry (`onKeys`) and
 * each row's `onDown` calls its body at press time.
 */

import { MODULE, I18N } from "./ties-core.mjs";
import { REGISTRY_SETTING, ATTR_BELIEFS_SETTING, KNOWLEDGE_SETTING } from "./known-core.mjs";
import { defineKeybindings, defineSettings, serialStore, settingReader, settingsSnapshot as snapshot } from "./lib/settings.mjs";

/** Where dragged cards were left — per browser, so two people at one table don't fight over it. */
export const PIN_SETTING = "pinnedCards";

/** @type {import("./lib/settings.mjs").SettingRow[]} */
export const SETTINGS = Object.freeze([
  {
    key: "macroCreated", store: true, type: Boolean, default: false,
    doc: "Set once the hotbar macro (game.pentaryn.ties.show()) has been created, so it is never made twice.",
  },
  /*
   * World scope: whether players may run this at all is the GM's call, and one answer for the
   * table. Off mid-session and the next key press does nothing for them.
   */
  {
    key: "playerAccess", scope: "world", config: true, type: Boolean, default: true,
    name: "PENTARYN_TIES.settings.playerAccess",
    hint: "PENTARYN_TIES.settings.playerAccessHint",
    doc: "Players may use the tie, notebook and inspect keys, tabs and dialogs on their own character. Off = GM only.",
  },
  /*
   * The approval gate's world-wide fallback (disguise decision 8). Default **off** — auto-deliver —
   * because a gate that is on by default turns every roll into a chore the first time somebody
   * enables the feature. The per-kind `studyHold` flag overrides it in both directions, and the
   * granularity stops at the *roll*: a hold that applied only to high tiers would deliver low
   * totals instantly and hold high ones, which makes the delay itself the number.
   */
  {
    key: "holdDefault", scope: "world", config: true, type: Boolean, default: false,
    name: "PENTARYN_TIES.settings.holdDefault",
    hint: "PENTARYN_TIES.settings.holdDefaultHint",
    doc: "Hold every study reveal for the GM's Deliver unless the kind says otherwise.",
  },
  /*
   * The attribute registry, its belief ledger and the world-knowledge ledger — phases 6 and 8.
   * World settings rather than flags, and this is the one place the choice is load-bearing: what a
   * world setting buys is **writability**, not visibility — `SETTINGS_MODIFY` requires role 4, so
   * the server refuses a player write, which is what makes an attribute-lore lock or a stage-1
   * failure unforgeable. Everything in a world syncs to every client regardless; this was never a
   * secrecy mechanism.
   */
  {
    key: REGISTRY_SETTING, store: true, type: Array, default: [],
    doc: "The attribute registry (GM-authored entries, their lore rows, review state).",
  },
  {
    key: ATTR_BELIEFS_SETTING, store: true, type: Object, default: {},
    doc: "Attribute-lore belief rows, keyed `attr:<id>:<loreId>:<characterId>`.",
  },
  {
    key: KNOWLEDGE_SETTING, store: true, type: Object, default: {},
    doc: "World knowledge: which attributes each character knows exist, and which they failed to.",
  },
  /*
   * Decision 19. **Default RAW**, and that is a shipping decision rather than a preference: the
   * 2024 PHB cancels advantage and disadvantage outright when both are present, however many sit
   * on each side, and a module meant for other tables defaults to the book. Joe's netting is one flip.
   */
  {
    key: "advantageStacking", scope: "world", config: true, type: String, default: "raw",
    name: "PENTARYN_TIES.settings.advantageStacking",
    hint: "PENTARYN_TIES.settings.advantageStackingHint",
    choices: { raw: "PENTARYN_TIES.settings.advantageRaw", net: "PENTARYN_TIES.settings.advantageNet" },
    doc: "How advantage sources combine on a study roll: raw (2024 PHB, any of each cancels) or net.",
  },
  {
    key: "nearDistance", scope: "world", config: true, type: Number, default: 4,
    name: "PENTARYN_TIES.settings.nearDistance",
    hint: "PENTARYN_TIES.settings.nearDistanceHint",
    range: { min: 1, max: 20, step: 1 },
    doc: "How close (in grid squares) a token must be to count as near for the tie cards.",
  },
  {
    key: "sheetTab", scope: "client", config: true, type: Boolean, default: true,
    name: "PENTARYN_TIES.settings.sheetTab",
    hint: "PENTARYN_TIES.settings.sheetTabHint",
    doc: "Show the Ties, Known and Attributes tabs on actor sheets (this browser only).",
  },
]);

/**
 * Hidden per-browser state, registered with no labels (blueprint gap G3: a hidden CLIENT setting is
 * neither a world `store` row nor a labelled config row). `after` keeps today's registration order.
 */
export const CLIENT_STATE = Object.freeze([
  {
    key: PIN_SETTING, scope: "client", config: false, type: Array, default: [], after: "nearDistance",
    doc: "Pinned tie cards on this browser: [{ sourceId, tieId, x, y }].",
  },
]);

/* -------------------------------------------- */
/*  Keybindings                                 */
/* -------------------------------------------- */

/** The bodies behind the keys, handed in by the entry before init. */
const keyBodies = {};

/** The entry's key bodies by row key; a key with no body still swallows the press. */
export function onKeys(bodies) {
  Object.assign(keyBodies, bodies);
}

const press = key => () => {
  keyBodies[key]?.();
  return true;
};

/*
 * TWO tie keys, and they are the same web at two densities: 8 — hover somebody: a card for everyone
 * THEY know who is in sight; 7 — select your own token and hover somebody else: the ONE card for
 * what that person is to you (overlay.mjs has the reasoning). 6 and 5 are the two writing keys (what
 * someone is TO you; what you have learned ABOUT them), 4 inspects the hovered token, and 9 — the
 * odd one out — is the GM's description card. None but 9 is `restricted`: players need them for
 * their own character, and the permission check lives behind each key.
 *
 * `showWeb` keeps its original id so anyone who rebound it off 8 keeps their key. They are real
 * Foundry keybindings, not hotbar macros — they show in Configure Controls and can be rebound.
 */
export const KEYBINDINGS = Object.freeze([
  {
    key: "showWeb", editable: [{ key: "Digit8" }], restricted: false, onDown: press("showWeb"),
    name: "PENTARYN_TIES.keybind.show",
    hint: "PENTARYN_TIES.keybind.showHint",
    doc: "8 — every tie card for the hovered token.",
  },
  {
    key: "addTie", editable: [{ key: "Digit6" }], restricted: false, onDown: press("addTie"),
    name: "PENTARYN_TIES.keybind.add",
    hint: "PENTARYN_TIES.keybind.addHint",
    doc: "6 — record a tie with the hovered token (your own token: its list).",
  },
  {
    key: "fileKnown", editable: [{ key: "Digit5" }], restricted: false, onDown: press("fileKnown"),
    name: "PENTARYN_TIES.keybind.known",
    hint: "PENTARYN_TIES.keybind.knownHint",
    doc: "5 — file the hovered creature in your Known notebook and open its page.",
  },
  {
    key: "inspect", editable: [{ key: "Digit4" }], restricted: false, onDown: press("inspect"),
    name: "PENTARYN_TIES.keybind.inspect",
    hint: "PENTARYN_TIES.keybind.inspectHint",
    doc: "4 — inspect the hovered token (the one gesture that starts an identification roll).",
  },
  {
    key: "showOneTie", editable: [{ key: "Digit7" }], restricted: false, onDown: press("showOneTie"),
    name: "PENTARYN_TIES.keybind.one",
    hint: "PENTARYN_TIES.keybind.oneHint",
    doc: "7 — the one tie card: selected → hovered.",
  },
  {
    key: "showDescription", editable: [{ key: "Digit9" }], restricted: true, onDown: press("showDescription"),
    name: "PENTARYN_TIES.keybind.describe",
    hint: "PENTARYN_TIES.keybind.describeHint",
    doc: "9 — GM only: the hovered actor's private description card.",
  },
]);

/**
 * Called from the entry's `init`: the six keys first, then the settings in today's order (a hot
 * patch re-runs it; both kit calls skip what is already registered).
 */
export function registerSettings({ log } = {}) {
  defineKeybindings(MODULE, KEYBINDINGS, { i18nRoot: I18N, log });
  for (const row of SETTINGS) {
    defineSettings(MODULE, [row], { i18nRoot: I18N });
    for (const hidden of CLIENT_STATE) if (hidden.after === row.key) registerClientState(hidden);
  }
}

function registerClientState({ key, scope, config, type, default: value }) {
  if (game.settings.settings?.has?.(`${MODULE}.${key}`)) return;
  game.settings.register(MODULE, key, { scope, config, type, default: value });
}

/*
 * The two whole-value stores more than one writer touches at once (ties-30): world knowledge (a
 * cascade, a share and a GM grant can land together) and attribute-lore beliefs. Each is ONE
 * serialStore for the module (C58), made on first use — its queue needs Foundry's Semaphore, which a
 * bare-node import of this file does not have. A queued write reads the setting INSIDE the queue,
 * so the second of two writes sees the first. ⚠ Never await one queued write from inside another
 * on the same store: it would wait on itself.
 */
const stores = {};
export const knowledgeStore = () => (stores.knowledge ??= serialStore(MODULE, KNOWLEDGE_SETTING));
export const attrBeliefsStore = () => (stores.attrBeliefs ??= serialStore(MODULE, ATTR_BELIEFS_SETTING));

/** The live value; the row default when unregistered or unreadable (before init, a hot patch). */
export const setting = settingReader(MODULE, [...SETTINGS, ...CLIENT_STATE]);

export function settingsSnapshot() {
  return snapshot(MODULE, [...SETTINGS, ...CLIENT_STATE]);
}

/**
 * May this user record ties at all?
 *
 * The `playerAccess` setting's hint promises "turn this off to make the whole feature GM-only
 * again". It used to govern only the sheet tab and the canvas keys, leaving the dialog, the hover
 * key and the HUD button answering to nobody. A kill-switch that leaves three doors open is not one.
 *
 * ⚠ Deliberately NOT `setting()`: before init that returns the row default, `true`, and this must
 * refuse rather than guess. Both the UI and the relay's GM-side handler ask this same question.
 */
export function mayWrite(user = game.user) {
  if (user?.isGM) return true;
  try {
    return game.settings.get(MODULE, "playerAccess") === true;
  } catch {
    return false; // settings not registered yet: refuse rather than guess
  }
}

/**
 * May this user act on this actor — run a key on it, see its sheet tabs? The GM always; a player
 * only on an actor they own, and only while `mayWrite` lets them at all.
 *
 * ONE copy (ties-ui-EXT-11): the canvas keys (overlay.mjs) and the sheet tabs (sheet.mjs) each used
 * to write it, both through `setting()` — which before the settings register answers the default,
 * `true`. `mayWrite` refuses there instead, which is the stricter and intended answer.
 */
export function mayActOn(actor) {
  if (!actor) return false;
  if (game.user?.isGM) return true;
  return mayWrite() && actor.isOwner === true;
}
