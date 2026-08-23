/**
 * Pentaryn NPC Ties — entry point.
 *
 *   game.pentaryn.ties.show()          toggle every card for the hovered token (key 8)
 *   game.pentaryn.ties.showOne()       selected -> hovered, that one card (key 7)
 *   game.pentaryn.ties.edit(actor)     open the standalone editor
 *   game.pentaryn.ties.read(actor)     sanitised ties (never throws)
 *   game.pentaryn.ties.set(a, b, {...}) create/update an edge and its mirror
 *   game.pentaryn.ties.setNotes(a, bId, text)  the long version, sheet-only
 *
 * Both keys are real Foundry keybindings, not hotbar macros — they show up in
 * Configure Controls and can be rebound if 7 or 8 are already spoken for. A macro
 * is also created once, on first ready, for anyone who prefers dragging it to a bar.
 */

import * as API from "./ties-api.mjs";
import * as Overlay from "./overlay.mjs";
import * as Cards from "./popups.mjs";
import * as Worn from "./worn.mjs";
import * as Describe from "./describe.mjs";
import { TiesEditor, buildHTML, bind, forgetActor } from "./editor.mjs";
import { registerRelay } from "./relay.mjs";

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
    closeDescription: Describe.close
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

/** The GM half of the reverse-side relay. Harmless to register on a player client. */
Hooks.once("ready", () => {
  try {
    registerRelay();
  } catch (err) {
    console.warn(`${MODULE} | reverse-side relay not registered`, err);
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

function injectTab(app, element) {
  if (!game.settings.get(MODULE, "sheetTab")) return;
  const actor = app?.document;
  if (!mayView(actor)) return;

  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root) return;

  const nav = root.querySelector('nav.tabs[data-group="primary"]') ?? root.querySelector("nav.tabs");
  const body = root.querySelector("div.tab-body") ?? root.querySelector(".sheet-body");
  if (!nav || !body) return; // markup moved — fall back to the header button

  /**
   * Check for the link and the section SEPARATELY. dnd5e re-renders parts independently, so a
   * re-render can rebuild the nav while leaving the tab-body intact. A single "does [data-tab=ties]
   * exist anywhere" guard then sees the surviving section, skips, and the nav link is gone for good.
   */
  let link = nav.querySelector(`[data-tab="${TAB}"]`);
  let section = body.querySelector(`:scope > [data-tab="${TAB}"]`);
  const freshSection = !section;

  if (!link) {
    link = document.createElement("a");
    link.className = "item control";
    link.dataset.tab = TAB;
    link.dataset.group = "primary";
    link.dataset.tooltip = game.i18n.localize("PENTARYN_TIES.title");
    link.innerHTML = '<i class="fa-solid fa-people-arrows"></i>';
    nav.appendChild(link);
  }
  if (!section) {
    section = document.createElement("section");
    section.className = "tab";
    section.dataset.tab = TAB;
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
    section.innerHTML = buildHTML(actor);
    bind(section.firstElementChild, actor, paint);
  };
  paint();

  /**
   * Activate our tab by hand rather than through `app.changeTab()`.
   *
   * changeTab() RETURNS EARLY when `tabGroups[group]` already equals the tab and `force` is unset.
   * That bites exactly when it matters: the GM is on the Ties tab, something re-renders the sheet,
   * dnd5e rebuilds the DOM and activates nothing (it does not know "ties"), and the early return
   * means our re-activation silently does nothing — leaving a BLANK sheet body.
   */
  const activate = () => {
    root
      .querySelectorAll('nav.tabs [data-tab], .tab-body > [data-tab], .sheet-body > [data-tab]')
      .forEach(el => el.classList.remove("active"));
    link.classList.add("active");
    section.classList.add("active");
    if (app.tabGroups) app.tabGroups.primary = TAB;
    // dnd5e mirrors the active tab onto the root element as `tab-<name>`
    root.classList.forEach(c => {
      if (c.startsWith("tab-")) root.classList.remove(c);
    });
    root.classList.add(`tab-${TAB}`);
  };

  link.addEventListener("click", ev => {
    ev.preventDefault();
    ev.stopPropagation();
    activate();
  });
  link.dataset.ptBound = "1";

  // restore ourselves after a re-render that happened while this tab was open
  if (app.tabGroups?.primary === TAB) activate();
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
}

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
Hooks.on("deleteActor", actor => forgetActor(actor.id));

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
