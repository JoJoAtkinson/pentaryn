/**
 * Pentaryn NPC Ties — the actor-sheet integration: the three tabs (Ties, Known, Attributes) and the
 * header button (FEATURE). Moved out of the entry (guide S7).
 */

import { MODULE } from "./ties-core.mjs";
import { setting } from "./settings.mjs";
import { TiesEditor, buildHTML, bind, forgetActor } from "./editor.mjs";
import { KNOWN_TAB_ID, buildKnownHTML, bindKnown, forgetKnownActor, openAddPicker, fileHovered, openKnownEntry } from "./known-ui.mjs";
import { ATTR_TAB_ID, buildAttributesHTML, bindAttributes, forgetAttributesActor } from "./attributes-ui.mjs";
import { forgetLoreKey } from "./lore-ui.mjs";
import { makeLog } from "./lib/log.mjs";

const log = makeLog(MODULE);

const TAB = "ties";

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
  return setting("playerAccess") === true && actor.isOwner === true;
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
    id: KNOWN_TAB_ID,
    icon: "fa-solid fa-book-skull",
    tooltip: "PENTARYN_TIES.known.title",
    shows: actor => actor?.type === "character",
    build: actor => buildKnownHTML(actor),
    bind: (root, actor, repaint) => bindKnown(root, actor, repaint)
  },
  {
    id: ATTR_TAB_ID,
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
    build: actor => buildAttributesHTML(actor),
    bind: (root, actor, repaint) => bindAttributes(root, actor, repaint)
  }
];

function injectTab(app, element) {
  if (!setting("sheetTab")) return;
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
      log.warn(`${spec.id} tab injection skipped`, err);
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

/**
 * ApplicationV2 fires `render<Class>` once per class in the sheet's chain, so one render of a
 * character sheet reaches two or three of the four hooks below with the same element. The first
 * does the work; the rest return before the setting reads and selector sweeps (ties-26). The mark
 * clears on the next microtask, so a genuine later re-render is never skipped.
 */
const handled = new WeakSet();
function firstThisDispatch(element) {
  const root = element instanceof HTMLElement ? element : element?.[0];
  if (!root || typeof root !== "object") return true;
  if (handled.has(root)) return false;
  handled.add(root);
  queueMicrotask(() => handled.delete(root));
  return true;
}

/**
 * FEATURE install — synchronous, from the entry body: the deleteActor sweep (unguarded, as it always
 * was), then the four sheet render hooks (each keeps its own try/catch; the text is pinned).
 */
export function install(reg) {
  // The editor keeps which note panels are open in a module-level Map keyed by actor id.
  // Nothing else references a deleted actor's entry, so drop it rather than hold it for the
  // rest of the session.
  reg.on("deleteActor", actor => {
    forgetActor(actor.id);
    forgetKnownActor(actor.id);
    // ties-31: the Attributes tab's and the lore editor's cosmetic state for that actor too
    forgetAttributesActor(actor.id);
    forgetLoreKey(`lore:${actor.id}`);
  }, { guard: false, label: "sheet: forget a deleted actor" });

  for (const hook of ["renderNPCActorSheet", "renderCharacterActorSheet", "renderActorSheetV2", "renderActorSheet"]) {
    reg.on(hook, (app, element) => {
      if (!firstThisDispatch(element)) return; // ties-26: the chain fires 2–3 of these per render
      try {
        injectHeaderButton(app, element);
        injectTab(app, element);
      } catch (err) {
        log.warn(`sheet injection skipped`, err);
      }
    }, { label: `sheet: ${hook}` });
  }

  // the sheet's API paths (rows in api-manifest.mjs)
  return { impl: { edit, "known.picker": openAddPicker, "known.file": file, "known.open": openKnownEntry } };
}

/** Open the standalone ties editor (the header button's window). */
function edit(actor) {
  return TiesEditor.open(actor);
}

/** The canvas key's own path, for a macro or a console: file whoever is hovered (key 5). */
const file = token => fileHovered(token ?? canvas?.tokens?.hover ?? null);

/** The entry's reg.offAll() removes the hooks; nothing else to drop. */
export function uninstall() {}
