/**
 * Pentaryn NPC Ties — entry point.
 *
 *   game.pentaryn.ties.show()          toggle the canvas web for the hovered token
 *   game.pentaryn.ties.edit(actor)     open the standalone editor
 *   game.pentaryn.ties.read(actor)     sanitised ties (never throws)
 *   game.pentaryn.ties.set(a, b, {...}) create/update an edge and its mirror
 *   game.pentaryn.ties.setNotes(a, bId, text)  the long version, sheet-only
 *
 * The key is a real Foundry keybinding, not a hotbar macro — it shows up in
 * Configure Controls and can be rebound if 8 is already spoken for. A macro is
 * also created once, on first ready, for anyone who prefers dragging it to a bar.
 */

import * as API from "./ties-api.mjs";
import * as Overlay from "./overlay.mjs";
import * as Cards from "./popups.mjs";
import { TiesEditor, buildHTML, bind } from "./editor.mjs";

const MODULE = API.MODULE;
const TAB = "ties";

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  /**
   * Two keys, two levels of noise. Not `restricted` any more — players need to reach this
   * for their own character; the permission check lives in Overlay.toggle(), where it can
   * also honour the playerAccess setting.
   */
  game.keybindings.register(MODULE, "showWeb", {
    name: "PENTARYN_TIES.keybind.show",
    hint: "PENTARYN_TIES.keybind.showHint",
    editable: [{ key: "Digit8" }],
    restricted: false,
    onDown: () => {
      Overlay.toggle(Overlay.MODES.WORD);
      return true;
    }
  });

  /**
   * Shift+8, not 9. Hotbar slot 9 is spoken for by the Quick View macro (see
   * playbooks/foundry-npc-ties.md), and a bare Digit9 keybinding would fire both. Same
   * finger, shift for more detail, nothing else disturbed.
   */
  game.keybindings.register(MODULE, "showCards", {
    name: "PENTARYN_TIES.keybind.showCards",
    hint: "PENTARYN_TIES.keybind.showCardsHint",
    editable: [{ key: "Digit8", modifiers: ["Shift"] }],
    restricted: false,
    onDown: () => {
      Overlay.toggle(Overlay.MODES.CARD);
      return true;
    }
  });

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
});

/**
 * Publish the API without assuming `game.pentaryn` is ours to extend.
 * pentaryn-importer creates and FREEZES that namespace, so a bare
 * `game.pentaryn.ties = …` throws in strict mode (esmodules always are) and
 * takes the rest of the ready hook down with it. Rebuild the object instead.
 */
function publishAPI() {
  const api = {
    show: Overlay.toggle,
    cards: () => Overlay.toggle(Overlay.MODES.CARD),
    clear: Overlay.clear,
    closeAllCards: Cards.closeAll,
    MODES: Overlay.MODES,
    edit: actor => TiesEditor.open(actor),
    read: API.read,
    set: API.setTie,
    setTie: API.setTie,
    setNotes: API.setNotes,
    remove: API.removeTie,
    migrate: API.migrateLegacy,
    STANCES: API.STANCES
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
