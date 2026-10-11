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
import { inspectorFor } from "./ties-adapter.mjs";
import { closeAll, restorePinned } from "./popups.mjs";
import { toggle as toggleDescription, close as closeDescription } from "./describe.mjs";
import { TiesEditor } from "./editor.mjs";
import { openTieDialogFor } from "./tie-dialog.mjs";
import { openPreview } from "./preview.mjs";
import { openLook } from "./look.mjs";
import { openReview } from "./review-ui.mjs";
import { inbound, migrateLegacy, read, removeTie, setNotes, setTie, STANCES } from "./ties-api.mjs";
import {
  addKnown, categoriesFor, fileHovered, hideKnown, notebookActor, openAddPicker, openKnownEntry,
  readKnown, removeKnown, setKnownField
} from "./known.mjs";
import {
  attributeIdsOf, attributesOf, brokenAncestry, clearSelection, createAttribute, deleteAttribute,
  derivedFor, describeRef, deselectAttributes, ensureAttribute, grantKnowledge, knowledge,
  knownWorld, linkAttribute, registry, repairAncestry, repairIcons, resolveAttribute,
  reviewAttribute, searchAttributes, selectAttributes, selectedAttributes, staleCarriers,
  unlinkAttribute, unreviewAttribute, unreviewedAttributes, updateAttribute
} from "./attributes.mjs";
import {
  attrOffersFor, clearScoping, beliefs, deliver, deliverHeldIdentifications, factStatus, forgetFact, grantKind,
  inspect, inspectAs, kindActorOf, kindDialog, legacyMissCards, loreStateFor, pending,
  releaseHeldAttribute, requestAttrLore, requestLore, requestStudy, reset, resetIdentification,
  resetInspection, resolveFact, scopingState, setKindOf, setStudyHold, setStudyOffset,
  setStudyTiers, shareFact, studiedOf, studyAs, studyStateFor, studyTiersOf
} from "./study.mjs";
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
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
  uninstall
};

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
  for (const feature of AT_INIT) feature.install(reg, ctx);
}

/**
 * Publish the API under `game.pentaryn.ties`. The root is a plain object every module assigns
 * into: the importer merges into it and nothing freezes it since its keystone (items-journal-1),
 * so the old frozen-root guard is gone (kit 1.0.2, J10). A frozen root now throws here.
 */
function publishAPI() {
  const api = {
    show: overlay.showAll,
    showAll: overlay.showAll,
    showOne: overlay.showOne,
    cards: overlay.showAll, // 0.3.0 name, kept so existing macros don't break
    clear: overlay.clear,
    closeAllCards: closeAll,
    edit: actor => TiesEditor.open(actor),
    addTie: token => openTieDialogFor(token ?? canvas?.tokens?.hover ?? canvas?.tokens?.controlled?.[0] ?? null),
    read: read,
    // who points AT this actor — GM only, gated inside the function itself
    inbound: inbound,
    set: setTie,
    setTie: setTie,
    setNotes: setNotes,
    remove: removeTie,
    migrate: migrateLegacy,
    STANCES: STANCES,
    // the worn mark — per-token, GM-only. Console path for anyone who prefers a macro
    // to the HUD button: game.pentaryn.ties.wornDialog(canvas.tokens.controlled[0])
    worn: worn.readWorn,
    setWorn: worn.setWorn,
    clearWorn: worn.clearWorn,
    wornDialog: worn.openDialog,
    // the description card — GM only, key 9. Was the `Quick View` macro.
    // `describeCard`, not `describe`: the kit reserves describe() for the API manifest (B1)
    describeCard: toggleDescription,
    closeDescription: closeDescription,
    /*
     * The Known list — the notebook tab. A sub-object rather than six more top-level names:
     * it is a second feature sharing this module's plumbing, and `ties.known.read` says so
     * where `ties.readKnown` would just be another entry in a long list.
     */
    known: {
      read: readKnown,
      add: addKnown,
      set: setKnownField,
      hide: hideKnown,
      purge: removeKnown, // destroys; the UI never does this
      remove: removeKnown,
      categories: categoriesFor,
      picker: openAddPicker,
      // the canvas key's own path, for a macro or a console: file whoever is hovered
      file: token => fileHovered(token ?? canvas?.tokens?.hover ?? null),
      open: openKnownEntry,
      notebook: notebookActor
    },
    /*
     * The study conduit. Its authoring half is console-only in phase 3 by the plan's own
     * correction — the GM section that will host tier messages, the kind pointer and the
     * belief ledger is phase 4's, and shipping a second authoring surface now would mean
     * building it twice.
     *
     *   study.tiers(actor, [{min: 25, text: "…"}, {min: 0, text: "…"}])   author the ladder
     *   study.kind(actor)                    the pointer picker; kindOf(actor, id) to skip it
     *   study.hold(actor, true|false|null)   per-kind approval gate; null inherits the setting
     *   study.beliefs(actor)                 what each character was told, and whether it landed
     *   study.pending()                      every undelivered reveal in the world
     *   study.deliver(character, kind)       release one
     *   study.reset(character, kind)         un-spend it — the honest do-over
     *   study.as(character, subject, {mode, situational})   throw the check by hand
     *   study.preview(actor)                 the GM inspect window: player view + simulated rolls
     *   study.look(subject, pc?)             the player's read-only Look window (null for a GM)
     *   study.share(spec, [pc…], {from, notify})   tell them one fact as if passed (chain-aware)
     *   study.forget(spec, pc)               undo a share, and only a share
     *   study.whoKnows(spec, pc)             passed | told | held | failed | locked | none
     *   study.audit.legacyMissCards()        cards a failure granted before 2026-10 (read-only)
     */
    study: {
      state: studyStateFor,
      request: requestStudy,
      as: studyAs,
      kind: kindDialog,
      kindOf: setKindOf,
      kindActor: kindActorOf,
      tiers: setStudyTiers,
      difficulty: setStudyOffset,
      readTiers: studyTiersOf,
      hold: setStudyHold,
      beliefs: beliefs,
      pending: pending,
      deliver: deliver,
      reset: reset,
      studied: studiedOf,
      // phase 4 — the individual axis
      fact: resolveFact,
      lore: loreStateFor,
      askLore: requestLore,
      // phase 6 — the attribute layer
      askAttr: requestAttrLore,
      attrOffers: attrOffersFor,
      // phase 8 — inspection and the cascade
      examine: inspect,
      look: (subject, character = game.user?.character) => openLook(character, subject),
      scoping: scopingState,
      clearScoping: clearScoping,
      inspectAs: inspectAs,
      deliverHeld: deliverHeldIdentifications,
      releaseHeld: releaseHeldAttribute,
      resetIdent: resetIdentification,
      release: grantKind,
      resetInspection: resetInspection,
      // GM inspect window — player view (with who-knows tags and Share) and simulated rolls
      preview: openPreview,
      // GM: tell characters one fact as if they had passed it; forget undoes a share (only)
      share: shareFact,
      forget: forgetFact,
      whoKnows: factStatus,
      // console-only: cards a FAILURE granted before 2026-10 (failures now hand over nothing)
      audit: { legacyMissCards: legacyMissCards }
    },
    /*
     * Every call that names an attribute takes an id OR a name (id wins; a miss is refused, never
     * created). Reads return data; writes return `{ ok, reason?, … }` and never throw — test `.ok`.
     */
    attributes: {
      list: registry,
      of: attributesOf,
      ids: attributeIdsOf,
      derived: derivedFor,
      resolve: resolveAttribute,
      lookup: describeRef,
      ensure: ensureAttribute,
      create: createAttribute,
      update: updateAttribute,
      remove: deleteAttribute,
      link: linkAttribute,
      unlink: unlinkAttribute,
      search: searchAttributes,
      // phase 8 — world knowledge and validation
      knows: knowledge,
      known: knownWorld,
      tell: grantKnowledge,
      broken: brokenAncestry,
      repair: repairAncestry,
      stale: staleCarriers,
      /*
       * The review panel (context/foundry/attribute-review.md). `update`/`create` above UN-review an
       * entry and record what they touched; sign-off is the GM's — `review()` exists for when he
       * asks, and the panel's own save (`reviewedUpdate`, `reviewedLoreUpdate`) is deliberately not published.
       */
      openReview,
      selected: selectedAttributes,
      select: selectAttributes,
      deselect: deselectAttributes,
      clearSelection: clearSelection,
      review: reviewAttribute,
      unreview: unreviewAttribute,
      unreviewed: unreviewedAttributes
    }
  };
  game.pentaryn ??= {};
  game.pentaryn.ties = api;
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
for (const feature of FEATURES) feature.install(reg, ctx);
