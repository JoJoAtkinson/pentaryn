/**
 * Pentaryn NPC Ties (pentaryn-ties) — ENTRY: esmodules[0]. Wiring only.
 *
 * Files, in load order (the README "Files" table has the roles):
 *   ties-core.mjs, core/*.mjs (known-core.mjs barrel)   PURE rules
 *   settings.mjs           SETTINGS / KEYBINDINGS tables, setting(), mayWrite
 *   ties-adapter.mjs, socket-adapter.mjs   ADAPTERS: canvas reads, the module socket
 *   conduit.mjs            FEATURE: socket listeners at ready, the tempo-clearing hooks
 *   token-hud.mjs          FEATURE: Token HUD buttons, the Attribute Review control
 *   look-menu.mjs          FEATURE: the player's double-click look menu
 *   sheet.mjs              FEATURE: the three sheet tabs and the header button
 *   overlay.mjs, worn.mjs, item-marks.mjs   FEATURES installed during init
 *   lib/*.mjs              vendored kit — never edited here (scripts/foundry/blueprint/vendor.py)
 *
 * Lifecycle: the entry body registers init and ready, then installs conduit, token-hud, look-menu
 * and sheet SYNCHRONOUSLY, in that order — every listener keeps its place (golden/hooks.json).
 * init → settings and keys, then overlay, worn, item-marks · ready → publish, then the GM's
 * one-time steps. The keys' bodies are handed to settings.mjs with onKeys().
 *
 * The API is `game.pentaryn.ties` — `game.pentaryn.ties.describe()` lists it once the kit API lands
 * (S8); until then the published object below is the reference.
 */

import { MODULE } from "./ties-core.mjs";
import { registerSettings, onKeys, setting, mayWrite } from "./settings.mjs";
import { inspectorFor, migrateLegacy } from "./ties-adapter.mjs";
import { restorePinned } from "./popups.mjs";
import { toggle as toggleDescription, close as closeDescription } from "./describe.mjs";
import { openTieDialogFor } from "./tie-dialog.mjs";
import { openLook } from "./look.mjs";
import { fileHovered } from "./known.mjs";
import { repairIcons } from "./attributes.mjs";
import { inspect } from "./study.mjs";
import { buildApiFor } from "./api.mjs";
import { makeLog } from "./lib/log.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import * as conduit from "./conduit.mjs";
import * as tokenHud from "./token-hud.mjs";
import * as lookMenu from "./look-menu.mjs";
import * as sheet from "./sheet.mjs";
import * as overlay from "./overlay.mjs";
import * as worn from "./worn.mjs";
import * as itemMarks from "./item-marks.mjs";

/** Features installed from the entry body, in this order (their hooks follow init and ready). */
const FEATURES = [conduit, tokenHud, lookMenu, sheet];
/** Features whose hooks have always registered during init. */
const AT_INIT = [overlay, worn, itemMarks];

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = {
  log,
  reg,
  setting,
  api: null,
  contributions: [],
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall
};

/** A feature's `{ rows?, impl }` — the API paths it owns because they open a window or touch the canvas. */
function contribute(contribution) {
  if (contribution) ctx.contributions.push(contribution);
}

// the key-9 card belongs to no feature: the entry wires its key, so the entry contributes its paths
contribute({ impl: { describeCard: toggleDescription, closeDescription } });

/*
 * The keys' bodies. The rows (ids, default keys, labels) are KEYBINDINGS in settings.mjs; settings
 * may not import a feature, so the bodies are handed over here and each row's onDown calls its body.
 */
onKeys({
  showWeb: () => overlay.showAll(),
  addTie: () => {
    if (!mayWrite()) return;
    openTieDialogFor(canvas?.tokens?.hover ?? null);
  },
  fileKnown: () => {
    if (!mayWrite()) return;
    fileHovered(canvas?.tokens?.hover ?? null);
  },
  /*
   * Inspect the hovered token — phase 8's gesture, on the key beside the one that files them.
   * Deliberately the same idiom as `fileKnown`: hover, press, done. Nothing about the key press
   * varies by what the target carries.
   */
  inspect: () => {
    if (!mayWrite()) return;
    const token = canvas?.tokens?.hover ?? null;
    const who = inspectorFor();
    const subject = token?.actor ?? (token ? game.actors.get(token.document.actorId) : null);
    if (who && subject && subject.id !== who.id) {
      // the Look window first, before the dice — same moment, same frame, whatever follows
      if (!game.user?.isGM) openLook(who, subject);
      inspect(who, subject);
    }
  },
  showOneTie: () => overlay.showOne(),
  showDescription: () => toggleDescription()
});

/*
 * init: the settings and keys, then the three features whose hooks have always registered DURING
 * init (golden/hooks-after-init.json pins them after the load-time ones).
 */
function onInit() {
  registerSettings({ log });
  for (const feature of AT_INIT) contribute(feature.install(reg, ctx));
}

/**
 * Build the API from the manifest (a drift throws here, inside the "publish api" step) and publish it
 * under `game.pentaryn.ties`. The root is a plain object every module assigns into: the importer
 * merges into it and nothing freezes it since its keystone (items-journal-1), so the old frozen-root
 * guard is gone (kit 1.0.2, J10). A frozen root now throws here.
 */
function publishAPI() {
  ctx.api = buildApiFor(ctx);
  game.pentaryn ??= {};
  game.pentaryn.ties = ctx.api;
}

/** Each step is independent — one failure must not silently skip the others. */
async function onReady() {
  for (const [label, step] of [
    ["publish api", async () => publishAPI()],
    ["migrate legacy flags", async () => game.user.isGM && migrateLegacy()],
    ["repair dead attribute icons", async () => game.user.isGM && repairIcons()],
    ["create macro", async () => game.user.isGM && ensureMacro()],
    ["restore pinned cards", async () => restorePinned()]
  ]) {
    try {
      await step();
    } catch (err) {
      log.error(`ready step failed: ${label}`, err);
    }
  }
}

/** A draggable macro, created once, for people who'd rather use a hotbar slot. */
async function ensureMacro() {
  if (setting("macroCreated")) return;
  const name = game.i18n.localize("PENTARYN_TIES.macroName");
  if (!game.macros.getName(name)) {
    await Macro.create({
      name,
      type: "script",
      img: "icons/sundries/gaming/chess-pawn-white.webp",
      command: "game.pentaryn.ties.show();"
    });
  }
  await game.settings.set(MODULE, "macroCreated", true);
}

/** Remove every hook, listener and subscription this module added (then re-import the entry to re-wire). */
function uninstall() {
  for (const feature of [...AT_INIT, ...FEATURES].reverse()) feature.uninstall();
  reg.offAll();
}

// unguarded, as Hooks.once always registered them: a throw here keeps Foundry's own error line
reg.once("init", onInit, { guard: false, label: "init" });
reg.once("ready", onReady, { guard: false, label: "ready steps" });
for (const feature of FEATURES) contribute(feature.install(reg, ctx));
