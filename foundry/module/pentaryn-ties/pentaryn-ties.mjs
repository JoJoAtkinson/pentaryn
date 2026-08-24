/**
 * Pentaryn NPC Ties — entry point.
 *
 *   game.pentaryn.ties.show()          toggle every card for the hovered token (key 8)
 *   game.pentaryn.ties.showOne()       selected -> hovered, that one card (key 7)
 *   game.pentaryn.ties.edit(actor)     open the standalone editor
 *   game.pentaryn.ties.read(actor)     sanitised ties (never throws)
 *   game.pentaryn.ties.set(a, b, {...}) create/update an edge and its mirror
 *   game.pentaryn.ties.setNotes(a, bId, text)  the long version, sheet-only
 *   game.pentaryn.ties.known.read(actor)       the Known list (never throws)
 *   game.pentaryn.ties.known.add(actor, who)   file someone; null if already filed
 *   game.pentaryn.ties.known.file(token)       hover + file + open their page (key 5)
 *   game.pentaryn.ties.known.hide(actor, id, true|false)  tuck away / put back
 *   game.pentaryn.ties.known.purge(actor, id)   destroys a row; nothing in the UI does
 *   game.pentaryn.ties.study.lore(pc, npc)     that NPC's rows, as the PC's sheet sees them
 *   game.pentaryn.ties.study.askLore(pc, npc, loreId)  roll one of them
 *   game.pentaryn.ties.study.fact({ns, subjectId, factId})  the conduit's resolve seam
 *   game.pentaryn.ties.attributes.of(actor)    what this one belongs to (derived + authored)
 *   game.pentaryn.ties.attributes.create(title)  a registry entry; refuses an id collision
 *   game.pentaryn.ties.attributes.link(actor, id) / .unlink(actor, id)
 *   game.pentaryn.ties.study.inspect(pc, subject)   the one gesture that starts a check
 *   game.pentaryn.ties.attributes.known(pc)         what they have worked out of the world
 *   game.pentaryn.ties.attributes.tell(pc, id, {withParents})  disclosure, the only non-roll route
 *
 * The keys are real Foundry keybindings, not hotbar macros — they show up in
 * Configure Controls and can be rebound if 5 through 9 are already spoken for. A macro
 * is also created once, on first ready, for anyone who prefers dragging it to a bar.
 */

import * as API from "./ties-api.mjs";
import * as Overlay from "./overlay.mjs";
import * as Cards from "./popups.mjs";
import * as Worn from "./worn.mjs";
import * as Describe from "./describe.mjs";
import { TiesEditor, buildHTML, bind, forgetActor } from "./editor.mjs";
import * as Known from "./known.mjs";
import * as Attributes from "./attributes.mjs";
import * as AttributesUI from "./attributes-ui.mjs";
import { registerRelay } from "./relay.mjs";
import * as Study from "./study.mjs";

const MODULE = API.MODULE;
const TAB = "ties";

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  /**
   * TWO keys, and they are the same web at two densities.
   *
   *   8 — hover somebody: a card for everyone THEY know who is in sight.
   *   7 — select your own token and hover somebody else: the ONE card for what that person
   *       is to you. Press again on them to close it, move to another and press for theirs.
   *
   * They read the canvas differently on purpose — 8's subject is the hovered token, 7's is
   * the SELECTED one and the hovered token is the object. 7 therefore refuses to run
   * without a selection rather than falling back to the hover, because falling back would
   * silently answer a different question. The reasoning lives in overlay.mjs.
   *
   * 0.3.0 also shipped two keys — bare 8 for a word under each token, Shift+8 for cards —
   * and the cards won outright, so the word mode was removed rather than left in as a
   * setting nobody would pick. This is not that: both of these draw cards, and they differ
   * only in how many.
   *
   * `showWeb` keeps its original id so anyone who rebound it off 8 keeps their key.
   *
   * Neither is `restricted` — players need to reach this for their own character; the
   * permission check lives in the overlay, where it also honours the playerAccess setting.
   */
  game.keybindings.register(MODULE, "showWeb", {
    name: "PENTARYN_TIES.keybind.show",
    hint: "PENTARYN_TIES.keybind.showHint",
    editable: [{ key: "Digit8" }],
    restricted: false,
    onDown: () => {
      Overlay.showAll();
      return true;
    }
  });

  /**
   * 6 — the writing key, next to the three reading keys.
   *
   * Right-clicking a token was the obvious home for this and it is not available: core's
   * `Token#_canHUD` is `user.isGM || actor.testUserPermission(user, "OWNER")`, so a player
   * right-clicking an NPC gets nothing at all, and there is no context-menu hook for
   * placeables (`_getEntryContextOptions` is a sidebar/application thing). A hover key is
   * the only surface that gives a player "you can see them, so you can add them".
   *
   * Hovering someone you OWN opens their list to write on; hovering anyone else opens a
   * tie pointing AT them, from you.
   */
  game.keybindings.register(MODULE, "addTie", {
    name: "PENTARYN_TIES.keybind.add",
    hint: "PENTARYN_TIES.keybind.addHint",
    editable: [{ key: "Digit6" }],
    restricted: false,
    onDown: () => {
      if (!API.mayWrite()) return true;
      openTieDialogFor(canvas?.tokens?.hover ?? null);
      return true;
    }
  });

  /**
   * 5 — the other writing key, and it sits next to 6 because that is what it is.
   *
   * 6 records what someone is *to* you; 5 records what you have learned *about* them. Both
   * are the same gesture — hover the creature in front of you and press — and both refuse in
   * the same way, so they belong on adjacent keys rather than at opposite ends of the row.
   *
   * The tab's "Add…" picker is the other door and answers a different question ("someone I
   * met three sessions ago"); this one answers "the thing that is looking at me right now",
   * which is the door that has to be one keystroke wide.
   */
  game.keybindings.register(MODULE, "fileKnown", {
    name: "PENTARYN_TIES.keybind.known",
    hint: "PENTARYN_TIES.keybind.knownHint",
    editable: [{ key: "Digit5" }],
    restricted: false,
    onDown: () => {
      if (!API.mayWrite()) return true;
      Known.fileHovered(canvas?.tokens?.hover ?? null);
      return true;
    }
  });

  /*
   * Inspect the hovered token — phase 8's gesture, on the key beside the one that files them.
   * Deliberately the same idiom as `fileKnown`: hover, press, done. Nothing about the key press
   * varies by what the target carries.
   */
  game.keybindings.register(MODULE, "inspect", {
    name: "PENTARYN_TIES.keybind.inspect",
    hint: "PENTARYN_TIES.keybind.inspectHint",
    editable: [{ key: "Digit4" }],
    restricted: false,
    onDown: () => {
      if (!API.mayWrite()) return true;
      const token = canvas?.tokens?.hover ?? null;
      const who = inspectorFor();
      const subject = token?.actor ?? (token ? game.actors.get(token.document.actorId) : null);
      if (who && subject && subject.id !== who.id) Study.inspect(who, subject);
      return true;
    }
  });

  game.keybindings.register(MODULE, "showOneTie", {
    name: "PENTARYN_TIES.keybind.one",
    hint: "PENTARYN_TIES.keybind.oneHint",
    editable: [{ key: "Digit7" }],
    restricted: false,
    onDown: () => {
      Overlay.showOne();
      return true;
    }
  });

  /**
   * 9 — the odd one out, and deliberately so. 7 and 8 are two densities of the same
   * question and both have a player half; this is "who IS this", read off the actor's
   * private biography, and is GM-only. It lives next to them on the number row because
   * that is where the hand already is, and because 7/8/9 were free — a letter would have
   * collided with something Foundry or dnd5e already owns.
   */
  Describe.registerKeybinding();

  game.settings.register(MODULE, "macroCreated", { scope: "world", config: false, type: Boolean, default: false });

  /**
   * World scope: whether players may run this at all is the GM's call, and one answer for
   * the table. Off mid-session and the next key press does nothing for them.
   */
  game.settings.register(MODULE, "playerAccess", {
    name: "PENTARYN_TIES.settings.playerAccess",
    hint: "PENTARYN_TIES.settings.playerAccessHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  /**
   * The approval gate's world-wide fallback (disguise decision 8).
   *
   * Default **off** — auto-deliver — because a gate that is on by default turns every roll into
   * a chore the first time somebody enables the feature, and Joe's own framing is that most
   * checks he does not care about. The per-kind `studyHold` flag overrides it in both
   * directions, and the granularity stops at the *roll*: a hold that applied only to high tiers
   * would deliver low totals instantly and hold high ones, which makes the delay itself the
   * number.
   */
  game.settings.register(MODULE, "holdDefault", {
    name: "PENTARYN_TIES.settings.holdDefault",
    hint: "PENTARYN_TIES.settings.holdDefaultHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  /*
   * The attribute registry and its ledger — phase 6, decision 16.
   *
   * `config: false` on both: neither is edited through Foundry's settings sheet. The registry
   * has its own editor, and the ledger is machine-written. What a world setting buys here is
   * **writability**, not visibility — `SETTINGS_MODIFY` requires role 4, so the server refuses
   * a player write, which is what makes an attribute-lore lock as unforgeable as a belief row
   * on an NPC. Everything in a world syncs to every client regardless (decision 8's
   * measurements); this was never a secrecy mechanism and is not documented as one.
   */
  game.settings.register(MODULE, Attributes.REGISTRY_SETTING, {
    scope: "world",
    config: false,
    type: Array,
    default: []
  });

  game.settings.register(MODULE, Attributes.ATTR_BELIEFS_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  /*
   * Decision 19. **Default RAW**, and that is a shipping decision rather than a preference:
   * the 2024 PHB cancels advantage and disadvantage outright when both are present, however
   * many sit on each side, and a module meant for other tables defaults to the book. Joe's
   * netting is one flip.
   */
  /*
   * Phase 8's world-knowledge ledger — who knows *of* what, and who has permanently failed to.
   *
   * A world setting rather than a flag on the character, and this is the one place the choice is
   * load-bearing: a character actor is owned by its player, so a flag there would be
   * player-writable and the stage-1 lock forgeable. `SETTINGS_MODIFY` requires role 4.
   */
  game.settings.register(MODULE, Attributes.KNOWLEDGE_SETTING, {
    scope: "world",
    config: false,
    type: Object,
    default: {}
  });

  game.settings.register(MODULE, "advantageStacking", {
    name: "PENTARYN_TIES.settings.advantageStacking",
    hint: "PENTARYN_TIES.settings.advantageStackingHint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      raw: "PENTARYN_TIES.settings.advantageRaw",
      net: "PENTARYN_TIES.settings.advantageNet"
    },
    default: "raw"
  });

  game.settings.register(MODULE, "nearDistance", {
    name: "PENTARYN_TIES.settings.nearDistance",
    hint: "PENTARYN_TIES.settings.nearDistanceHint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 20, step: 1 },
    default: 4
  });

  // where dragged cards were left — per browser, so two people at one table don't fight over it
  game.settings.register(MODULE, Cards.PIN_SETTING, {
    scope: "client",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(MODULE, "sheetTab", {
    name: "PENTARYN_TIES.settings.sheetTab",
    hint: "PENTARYN_TIES.settings.sheetTabHint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  Overlay.registerHooks();
  Worn.registerHooks();
});

/**
 * Publish the API without assuming `game.pentaryn` is ours to extend.
 * pentaryn-importer creates and FREEZES that namespace, so a bare
 * `game.pentaryn.ties = …` throws in strict mode (esmodules always are) and
 * takes the rest of the ready hook down with it. Rebuild the object instead.
 */
function publishAPI() {
  const api = {
    show: Overlay.showAll,
    showAll: Overlay.showAll,
    showOne: Overlay.showOne,
    cards: Overlay.showAll, // 0.3.0 name, kept so existing macros don't break
    clear: Overlay.clear,
    closeAllCards: Cards.closeAll,
    edit: actor => TiesEditor.open(actor),
    addTie: token => openTieDialogFor(token ?? canvas?.tokens?.hover ?? canvas?.tokens?.controlled?.[0] ?? null),
    read: API.read,
    // who points AT this actor — GM only, gated inside the function itself
    inbound: API.inbound,
    set: API.setTie,
    setTie: API.setTie,
    setNotes: API.setNotes,
    remove: API.removeTie,
    migrate: API.migrateLegacy,
    STANCES: API.STANCES,
    // the worn mark — per-token, GM-only. Console path for anyone who prefers a macro
    // to the HUD button: game.pentaryn.ties.wornDialog(canvas.tokens.controlled[0])
    worn: Worn.readWorn,
    setWorn: Worn.setWorn,
    clearWorn: Worn.clearWorn,
    wornDialog: Worn.openDialog,
    // the description card — GM only, key 9. Was the `Quick View` macro.
    describe: Describe.toggle,
    closeDescription: Describe.close,
    /*
     * The Known list — the notebook tab. A sub-object rather than six more top-level names:
     * it is a second feature sharing this module's plumbing, and `ties.known.read` says so
     * where `ties.readKnown` would just be another entry in a long list.
     */
    known: {
      read: Known.readKnown,
      add: Known.addKnown,
      set: Known.setKnownField,
      hide: Known.hideKnown,
      purge: Known.removeKnown, // destroys; the UI never does this
      remove: Known.removeKnown,
      categories: Known.categoriesFor,
      picker: Known.openAddPicker,
      // the canvas key's own path, for a macro or a console: file whoever is hovered
      file: token => Known.fileHovered(token ?? canvas?.tokens?.hover ?? null),
      open: Known.openKnownEntry,
      notebook: Known.notebookActor
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
     */
    study: {
      state: Study.studyStateFor,
      request: Study.requestStudy,
      as: Study.studyAs,
      kind: Study.kindDialog,
      kindOf: Study.setKindOf,
      kindActor: Study.kindActorOf,
      tiers: Study.setStudyTiers,
      difficulty: Study.setStudyOffset,
      readTiers: Study.studyTiersOf,
      hold: Study.setStudyHold,
      beliefs: Study.beliefs,
      pending: Study.pending,
      deliver: Study.deliver,
      reset: Study.reset,
      studied: Study.studiedOf,
      // phase 4 — the individual axis
      fact: Study.resolveFact,
      lore: Study.loreStateFor,
      askLore: Study.requestLore,
      // phase 6 — the attribute layer
      askAttr: Study.requestAttrLore,
      attrOffers: Study.attrOffersFor,
      // phase 8 — inspection and the cascade
      inspect: Study.inspect,
      scoping: Study.scopingState,
      clearScoping: Study.clearScoping,
      inspectAs: Study.inspectAs,
      deliverHeld: Study.deliverHeldIdentifications,
      releaseHeld: Study.releaseHeldAttribute,
      resetIdent: Study.resetIdentification,
      release: Study.grantKind,
      resetInspection: Study.resetInspection
    },
    attributes: {
      list: Attributes.registry,
      of: Attributes.attributesOf,
      ids: Attributes.attributeIdsOf,
      derived: Attributes.derivedFor,
      describe: Attributes.describeAttribute,
      create: Attributes.createAttribute,
      update: Attributes.updateAttribute,
      remove: Attributes.deleteAttribute,
      link: Attributes.linkAttribute,
      unlink: Attributes.unlinkAttribute,
      search: Attributes.searchAttributes,
      // phase 8 — world knowledge and validation
      knows: Attributes.knowledge,
      known: Attributes.knownWorld,
      tell: Attributes.grantKnowledge,
      broken: Attributes.brokenAncestry,
      repair: Attributes.repairAncestry,
      stale: Attributes.staleCarriers
    }
  };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, ties: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.ties = api;
  }
}

/** Each step is independent — one failure must not silently skip the others. */
Hooks.once("ready", async () => {
  for (const [label, step] of [
    ["publish api", async () => publishAPI()],
    ["migrate legacy flags", async () => game.user.isGM && API.migrateLegacy()],
    ["repair dead attribute icons", async () => game.user.isGM && Attributes.repairIcons()],
    ["create macro", async () => game.user.isGM && ensureMacro()],
    ["restore pinned cards", async () => Cards.restorePinned()]
  ]) {
    try {
      await step();
    } catch (err) {
      console.error(`${MODULE} | ready step failed: ${label}`, err);
    }
  }
});

/**
 * The two GM-side socket handlers. Harmless to register on a player client — both check
 * `activeGM` before doing anything, and both are separate `game.socket.on` registrations on
 * one channel, each ignoring the other's action.
 *
 * Registered in their own try/catch each: a study conduit that fails to register must not cost
 * the reverse-side relay that has been shipping since 0.9.0.
 */
Hooks.once("ready", () => {
  for (const [label, register] of [
    ["reverse-side relay", registerRelay],
    ["study conduit", Study.registerStudy]
  ]) {
    try {
      register();
    } catch (err) {
      console.warn(`${MODULE} | ${label} not registered`, err);
    }
  }
});

/** A draggable macro, created once, for people who'd rather use a hotbar slot. */
async function ensureMacro() {
  if (game.settings.get(MODULE, "macroCreated")) return;
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

/* -------------------------------------------- */
/*  Sheet integration                           */
/* -------------------------------------------- */

/**
 * dnd5e 5.x actor sheets are ApplicationV2 with nav.tabs[data-group=primary] and a
 * div.tab-body of section.tab[data-tab]. We append one of each and let the sheet's own
 * changeTab() drive activation. Everything here is best-effort: if the markup moves,
 * we bail silently and the header button still opens the editor.
 */
/**
 * The GM gets the tab on every sheet; a player gets it on a character they own, and can
 * edit it — it's their character's address book. The point is "who do I know", answerable
 * without a scene open or a token selected.
 */
function mayView(actor) {
  if (!(actor instanceof Actor)) return false;
  if (game.user?.isGM) return true;
  return game.settings.get(MODULE, "playerAccess") === true && actor.isOwner === true;
}

/**
 * Every tab this module hosts on the actor sheet, in nav order.
 *
 * The injector below used to hardcode one id and one paint closure. It was described as
 * "already generic" and it was not: adding a second tab meant a second copy of the
 * nav-rebuilt-separately guard and of the `changeTab` workaround, which is the trickiest DOM
 * code in the module and the wrong thing to have two of. A spec is the whole difference.
 *
 * `shows(actor)` is the per-tab gate on top of `mayView`. Ties belong on anything with a
 * sheet — an NPC's own address book is the GM's prep. **Known belongs to characters only**:
 * it is a player's notebook about the world, and an NPC does not keep one (design decision
 * 1). Nothing else varies per tab, and if a third tab ever needs more than this, add the
 * field here rather than a branch in the loop.
 */
const SHEET_TABS = [
  {
    id: TAB,
    icon: "fa-solid fa-people-arrows",
    tooltip: "PENTARYN_TIES.title",
    shows: () => true,
    build: actor => buildHTML(actor),
    bind: (root, actor, repaint) => bind(root, actor, repaint)
  },
  {
    id: Known.KNOWN_TAB_ID,
    icon: "fa-solid fa-book-skull",
    tooltip: "PENTARYN_TIES.known.title",
    shows: actor => actor?.type === "character",
    build: actor => Known.buildKnownHTML(actor),
    bind: (root, actor, repaint) => Known.bindKnown(root, actor, repaint)
  },
  {
    id: AttributesUI.ATTR_TAB_ID,
    icon: "fa-solid fa-tags",
    tooltip: "PENTARYN_TIES.attributes.title",
    /*
     * Every actor has attributes — derivation gives even a bare NPC its `type:` and `size:` —
     * so the test is not "does it carry any" but "is there anything worth a tab". For a GM
     * that is always (it is where they author and link); for a player it is when their own
     * character carries something, which is also always. The tab is therefore unconditional,
     * and the setting that turns all three tabs off is the honest kill switch.
     */
    shows: () => true,
    build: actor => AttributesUI.buildAttributesHTML(actor),
    bind: (root, actor, repaint) => AttributesUI.bindAttributes(root, actor, repaint)
  }
];

function injectTab(app, element) {
  if (!game.settings.get(MODULE, "sheetTab")) return;
  const actor = app?.document;
  if (!mayView(actor)) return;

  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  const nav = root.querySelector('nav.tabs[data-group="primary"]') ?? root.querySelector("nav.tabs");
  const body = root.querySelector("div.tab-body") ?? root.querySelector(".sheet-body");
  if (!nav || !body) return; // markup moved — fall back to the header button

  for (const spec of SHEET_TABS) {
    if (!spec.shows(actor)) continue;
    // One failing tab must not take the others with it: a Known tab that throws would
    // otherwise cost the GM the Ties tab it was injected beside.
    try {
      injectOneTab(app, root, nav, body, actor, spec);
    } catch (err) {
      console.warn(`${MODULE} | ${spec.id} tab injection skipped`, err);
    }
  }
}

function injectOneTab(app, root, nav, body, actor, spec) {
  /**
   * Check for the link and the section SEPARATELY. dnd5e re-renders parts independently, so a
   * re-render can rebuild the nav while leaving the tab-body intact. A single "does [data-tab=ties]
   * exist anywhere" guard then sees the surviving section, skips, and the nav link is gone for good.
   */
  let link = nav.querySelector(`[data-tab="${spec.id}"]`);
  let section = body.querySelector(`:scope > [data-tab="${spec.id}"]`);
  const freshSection = !section;

  if (!link) {
    link = document.createElement("a");
    link.className = "item control";
    link.dataset.tab = spec.id;
    link.dataset.group = "primary";
    link.dataset.tooltip = game.i18n.localize(spec.tooltip);
    link.innerHTML = `<i class="${spec.icon}"></i>`;
    nav.appendChild(link);
  }
  if (!section) {
    section = document.createElement("section");
    section.className = "tab";
    section.dataset.tab = spec.id;
    section.dataset.group = "primary";
    body.appendChild(section);
  }
  if (!freshSection && link.dataset.ptBound === "1") return; // both already live and wired

  /*
   * No mode to pass any more: a row is read-at-a-glance until you click it, and the detail
   * it opens is editable for whoever owns the actor. The sheet's own Play/Edit slider is
   * irrelevant to us now — which also means a sheet re-render cannot land us in the wrong
   * one.
   */
  const paint = () => {
    section.innerHTML = spec.build(actor);
    spec.bind(section.firstElementChild, actor, paint);
  };
  paint();

  /**
   * Activate our tab by hand rather than through `app.changeTab()`.
   *
   * changeTab() RETURNS EARLY when `tabGroups[group]` already equals the tab and `force` is unset.
   * That bites exactly when it matters: the GM is on the Ties tab, something re-renders the sheet,
   * dnd5e rebuilds the DOM and activates nothing (it does not know "ties"), and the early return
   * means our re-activation silently does nothing — leaving a BLANK sheet body.
   *
   * The deactivate sweep is deliberately over-broad — every `[data-tab]` in the nav and both
   * body shapes — which is also what makes a SECOND injected tab safe: switching to Known
   * clears Ties by the same line that clears Features, with no list of our own tabs to keep
   * in step.
   */
  const activate = () => {
    root
      .querySelectorAll('nav.tabs [data-tab], .tab-body > [data-tab], .sheet-body > [data-tab]')
      .forEach(el => el.classList.remove("active"));
    link.classList.add("active");
    section.classList.add("active");
    if (app.tabGroups) app.tabGroups.primary = spec.id;
    // dnd5e mirrors the active tab onto the root element as `tab-<name>`
    root.classList.forEach(c => {
      if (c.startsWith("tab-")) root.classList.remove(c);
    });
    root.classList.add(`tab-${spec.id}`);
  };

  link.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    activate();
  });
  link.dataset.ptBound = "1";

  // restore ourselves after a re-render that happened while this tab was open
  if (app.tabGroups?.primary === spec.id) activate();
}

/**
 * Open the tie dialog for a token.
 *
 * The dialog works out which end of the link the token fills — normally the **to** half,
 * falling back to the **from** half when removing it would leave you no one to write on
 * (a player pressing this on their own token). That rule lives in the dialog because it is
 * driven by who you have access to, which is the same thing that decides everything else
 * about the window.
 */
export async function openTieDialogFor(token) {
  const { TieDialog, baseActorOf, sourceCandidates } = await import("./tie-dialog.mjs");
  const actor = token ? baseActorOf(token) : null;
  if (!actor) {
    ui.notifications.warn(game.i18n.localize("PENTARYN_TIES.notify.noTarget"));
    return null;
  }
  // nothing to write with, and for a player that includes the case where the GM turned the
  // whole feature off — so check the pens, not the token
  if (!API.mayWrite()) return null;
  if (!game.user?.isGM && !sourceCandidates().length) return null;
  return TieDialog.open({ clicked: actor, clickedToken: token });
}

/**
 * The Token HUD button — the discoverable half of the pair.
 *
 * The HUD only opens for a token you own or as GM (core's `_canHUD`), so this needs no
 * permission check of its own: if the button is on screen, you were allowed to open it.
 */
function injectTieHUD(app, element) {
  const token = app?.object ?? null;
  // the HUD opens for owners and GMs, but the setting can still have this feature switched
  // off for players — in which case the button must not be there to press
  if (!API.mayWrite()) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const col = root?.querySelector(".col.left") ?? root?.querySelector(".left");
  if (!col || col.querySelector(".pt-tie-btn")) return;
  if (!token) return;

  const label = game.i18n.localize("PENTARYN_TIES.hud.tie");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon pt-tie-btn";
  btn.dataset.tooltip = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = '<i class="fa-solid fa-people-arrows"></i>';
  btn.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    openTieDialogFor(token);
  });
  col.appendChild(btn);

  /*
   * Phase 8's inspect control — the route phase 6 never had, and the ONLY thing in this module
   * that starts an identification roll (Joe: *"no examine, no auto detection"*).
   *
   * ⚠ **Uniform for every target.** Same icon, same tooltip, same enabled state whatever the
   * creature carries. A control that looked different next to someone with secrets would answer
   * the question before the dice did — the same reason the stub card is uniform.
   */
  const who = inspectorFor();
  if (who && token.document?.actorId !== who.id) {
    const look = game.i18n.localize("PENTARYN_TIES.known.inspect.button");
    const eye = document.createElement("button");
    eye.type = "button";
    eye.className = "control-icon pt-inspect-btn";
    eye.dataset.tooltip = game.i18n.format("PENTARYN_TIES.known.inspect.tip", { name: token.name });
    eye.setAttribute("aria-label", look);
    eye.innerHTML = '<i class="fa-solid fa-eye"></i>';
    eye.addEventListener("click", async ev => {
      ev.preventDefault();
      ev.stopPropagation();
      eye.disabled = true; // one gesture, one cascade — a double-click must not queue two
      await Study.inspect(who, token.actor ?? game.actors.get(token.document.actorId));
    });
    col.appendChild(eye);
  }
}

/**
 * Whose eyes are we looking through?
 *
 * A player inspects as their own character — they have exactly one, which is the case the ties
 * dialog already established as "easily resolved". A GM inspects as the **selected** token's
 * actor, so they can throw the check for whichever PC is asking without leaving the canvas.
 */
function inspectorFor() {
  if (game.user?.isGM) {
    const selected = canvas?.tokens?.controlled?.[0];
    const actor = selected?.actor ?? null;
    return actor?.type === "character" ? actor : null;
  }
  return game.user?.character ?? null;
}

/*
 * **Anything that means time has passed ends the run of looking.**
 *
 * The call-out describes someone *rapidly* working a room — Joe's rule. It is about tempo, so it
 * must only ever count looks that happened in one continuous stretch of standing there. Movement
 * already breaks the run (15 ft, in `scopeTell`); these are the other three events that plainly
 * mean time moved on, and every one of them is something the table *knows* happened:
 *
 *  · **a new scene** — you are not still working the same room in a different building
 *  · **combat starting** — the fiction jumps to structured time, and the per-round rule takes over
 *    governing inspection anyway
 *  · **combat ending** — however long that fight was, it was not "a moment"
 *
 * Cheap to be generous here: a false reset costs one un-said line, while a missed reset has
 * somebody read as paranoid for looks they took an hour ago in another building.
 */
const endLookingRun = why => {
  try {
    Study.clearScoping();
  } catch (err) {
    console.warn(`${MODULE} | could not clear inspection tempo (${why})`, err);
  }
};

Hooks.on("canvasReady", () => endLookingRun("scene change"));
Hooks.on("combatStart", () => endLookingRun("combat started"));
Hooks.on("deleteCombat", () => endLookingRun("combat ended"));
/*
 * `combatStart` is not fired by every path that begins a fight (a GM nudging the round forward by
 * hand does not raise it), so watch the round counter too — 0 → 1 is a start whoever caused it.
 */
Hooks.on("updateCombat", (combat, changes) => {
  if (changes?.round === 1 || (typeof changes?.round === "number" && changes.round > 0 && !combat.previous?.round)) {
    endLookingRun("first round");
  }
});

Hooks.on("renderTokenHUD", (app, element) => {
  try {
    injectTieHUD(app, element);
  } catch (err) {
    console.warn(`${MODULE} | tie HUD injection skipped`, err);
  }
});

/** Header button — the robust host, independent of the sheet's tab markup. */
function injectHeaderButton(app, element) {
  const actor = app?.document;
  if (!mayView(actor)) return;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const header = root?.querySelector(".window-header");
  if (!header || header.querySelector(".pentaryn-ties-btn")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "header-control icon fa-solid fa-people-arrows pentaryn-ties-btn";
  btn.dataset.tooltip = game.i18n.localize("PENTARYN_TIES.title");
  btn.setAttribute("aria-label", game.i18n.localize("PENTARYN_TIES.title"));
  btn.addEventListener("click", () => TiesEditor.open(actor));
  // sit just left of the close button rather than after it
  const close = header.querySelector("button.header-control.fa-xmark, button.header-control .fa-xmark")?.closest("button");
  if (close) header.insertBefore(btn, close);
  else header.appendChild(btn);
}

// The editor keeps which note panels are open in a module-level Map keyed by actor id.
// Nothing else references a deleted actor's entry, so drop it rather than hold it for the
// rest of the session.
Hooks.on("deleteActor", actor => {
  forgetActor(actor.id);
  Known.forgetKnownActor(actor.id);
});

for (const hook of ["renderNPCActorSheet", "renderCharacterActorSheet", "renderActorSheetV2", "renderActorSheet"]) {
  Hooks.on(hook, (app, element) => {
    try {
      injectHeaderButton(app, element);
      injectTab(app, element);
    } catch (err) {
      console.warn(`${MODULE} | sheet injection skipped`, err);
    }
  });
}
