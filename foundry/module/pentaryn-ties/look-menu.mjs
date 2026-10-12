/**
 * Pentaryn NPC Ties — the player's double-click look menu (FEATURE).
 *
 * Moved out of the entry (guide S7). Imports ui, adapter, settings and the study conduit (a domain
 * file — graph-allow, gap G1).
 */

import { mayWrite } from "./settings.mjs";
import { inspectorFor } from "./ties-adapter.mjs";
import { openTieDialogFor } from "./tie-dialog.mjs";
import { openLook } from "./look-app.mjs";
import { fileHovered } from "./known-ui.mjs";
import { inspect } from "./study.mjs";
import { readFlag } from "./lib/flags.mjs";

/*
 * The player's door to Inspect: double-click a creature you can see.
 *
 * A player can't open the Token HUD on a token they don't own (core `_canHUD`), and core never
 * calls a non-owner's double-click handler without LIMITED, so the hover key (4) was the only way
 * in. Joe double-clicked Marrith as Caven, expected a menu, and got nothing (2026-10-07).
 *
 * The listener sits on the canvas element and reads the hovered token, so it fires whatever the
 * token's permission, and only for a token this client can actually see (hover already requires
 * that). The menu is identical for every target, for the same reason the HUD eye is (see above).
 * Item piles (corpses, chests) keep their own double-click and get no menu.
 */
let lookMenu = null;

function closeLookMenu() {
  lookMenu?.remove();
  lookMenu = null;
}

function openLookMenu(token, ev) {
  closeLookMenu();
  const who = inspectorFor();
  const subject = token.actor ?? game.actors.get(token.document.actorId);
  if (!who || !subject || subject.id === who.id) return;

  /*
   * Two items, the same two for every target. "Take a closer look" opens the player's Look window
   * FIRST and then inspects — the window's opening never waits on, or depends on, what the dice
   * do. "What I know about them" opens the same window with no inspect at all: no stub card, no
   * roll, no tempo tell — reading your own notebook is not looking someone over.
   */
  const menu = document.createElement("nav");
  menu.className = "pt-look-menu";
  const item = (icon, label, tip, act) => {
    const b = document.createElement("button");
    b.type = "button";
    b.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    b.dataset.tooltip = tip;
    b.addEventListener("click", async e => {
      e.preventDefault();
      e.stopPropagation();
      closeLookMenu(); // one gesture, one cascade
      await act();
    });
    menu.appendChild(b);
  };
  item("fa-eye", game.i18n.localize("PENTARYN_TIES.known.inspect.button"),
    game.i18n.format("PENTARYN_TIES.known.inspect.tip", { name: token.name }), async () => {
      openLook(who, subject);
      await inspect(who, subject);
    });
  item("fa-book-open-reader", game.i18n.localize("PENTARYN_TIES.known.look.menu"),
    game.i18n.format("PENTARYN_TIES.known.look.menuTip", { name: token.name }), async () => {
      openLook(who, subject);
    });
  /*
   * The two writing keys (6 and 5) on the menu too (usability run 2026-10, U-7-1): Joe's rule is
   * that no player action may be reachable only through a key nobody told them about. Both take
   * the clicked token directly, so they do exactly what hovering it and pressing the key does,
   * refusals included. Same items for every target, like the two above.
   */
  item("fa-people-arrows", game.i18n.localize("PENTARYN_TIES.keybind.add"),
    game.i18n.format("PENTARYN_TIES.known.look.menuTieTip", { name: token.name }), async () => {
      await openTieDialogFor(token);
    });
  item("fa-feather-pointed", game.i18n.localize("PENTARYN_TIES.known.look.menuNotebook"),
    game.i18n.format("PENTARYN_TIES.known.look.menuNotebookTip", { name: token.name }), async () => {
      await fileHovered(token);
    });
  document.body.appendChild(menu);
  const { innerWidth: w, innerHeight: h } = window;
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(ev.clientX + 10, w - r.width - 8)}px`;
  menu.style.top = `${Math.min(ev.clientY + 10, h - r.height - 8)}px`;
  lookMenu = menu;
}

/** The canvas element the double-click listener sits on, and the listener — kept for uninstall. */
let watched = null;

function onDoubleClick(ev) {
  if (game.user?.isGM || !mayWrite()) return; // the GM has the HUD
  // The token under the click itself, not Foundry's hover state: hover can be held by
  // something else (a pin, a pile) or simply not have caught up, and then the double-click
  // did nothing at all. Topmost first, and only creatures this client can see.
  const pt = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
  const under = canvas.tokens.placeables
    .filter(t => t.isVisible && t.bounds.contains(pt.x, pt.y))
    .sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0) || b.zIndex - a.zIndex);
  const token = under.find(t => !t.isOwner && !readFlag(t.document, "item-piles", "data")?.enabled) ?? null;
  if (!token || under[0]?.isOwner) return; // your own token on top: core opens your sheet
  openLookMenu(token, ev);
}

const onPointerDown = ev => {
  if (lookMenu && !lookMenu.contains(ev.target)) closeLookMenu();
};
const onKeyDown = ev => { if (ev.key === "Escape") closeLookMenu(); };

/**
 * Put the double-click listener on the canvas element, once per element (the `ptLook` mark). Runs on
 * every canvasReady; the entry also calls it on a hot re-import, when canvasReady has already fired.
 */
export function wireCanvas() {
  const view = canvas.app?.view;
  if (!view || view.dataset.ptLook) return;
  view.dataset.ptLook = "1";
  view.addEventListener("dblclick", onDoubleClick);
  watched = view;
}

/**
 * FEATURE install — synchronous, from the entry body, in today's order: the canvas double-click
 * (canvasReady), the two document listeners, then canvasPan / canvasTearDown. Guarded (B9): a throw
 * logs `pentaryn-ties | look menu: <hook>`.
 */
export function install(reg) {
  reg.on("canvasReady", () => wireCanvas(), { label: "look menu: canvas double-click" });
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown);
  reg.on("canvasPan", () => closeLookMenu(), { label: "look menu: canvasPan" });
  reg.on("canvasTearDown", () => closeLookMenu(), { label: "look menu: canvasTearDown" });
}

/** Remove the document and canvas listeners and any open menu (the entry's reg.offAll() drops the hooks). */
export function uninstall() {
  closeLookMenu();
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKeyDown);
  if (watched) {
    watched.removeEventListener("dblclick", onDoubleClick);
    delete watched.dataset.ptLook;
    watched = null;
  }
}
