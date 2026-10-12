/**
 * Loot all
 * ========
 *
 * Item Piles 3.3.4 has a native **Take All Items** button, but it only shows when item AND
 * currency sharing are both off on the pile. Ours have sharing on (so the Split buttons work),
 * which hid Take All everywhere. This adds a **Loot all** button to the loot window's footer, next
 * to the Split buttons, on every pile and container: corpses, eye hotspots and gear piles alike.
 *
 * Clicking it calls `game.itempiles.API.transferEverything(pile, character)`. Item Piles does the
 * rest on the GM's client (its item filters, the chat card, delete-when-empty), exactly as its own
 * Take All would. Item Piles has already checked range, lock and visibility before the window
 * opened; the button is also hidden on locked or closed containers and on merchants/vaults (those
 * use other windows and never get it).
 *
 * The character it loots into is, in order: the actor the window says "you're inspecting as"
 * (Item Piles' recipient, which follows its Change button), else the user's assigned character,
 * else the first player character they own. A player with none sees the button greyed out with
 * the reason in its tooltip. A GM with none does not see it.
 */

import { MODULE, lootAllState } from "./loot-core.mjs";
import { api as itemPilesApi, isValidItemPile, isItemPileEmpty, getActorFlagData, transferEverything, storeOf, SELECTORS } from "./piles.mjs";

const BTN = "pd-loot-all";
/** lootAllState's reasons → their full lang keys (literal, so the i18n gate proves each). */
const REASON_KEYS = Object.freeze({
  noCharacter: "PENTARYN_DROPBIN.lootAll.noCharacter",
  empty: "PENTARYN_DROPBIN.lootAll.empty",
});
const reasonText = reason => _loc(REASON_KEYS[reason]);
const warn = (label, err) => console.warn(`${MODULE} | loot all ${label}`, err);

function usable(actor) {
  return !!(actor && actor.isOwner && !isValidItemPile(actor));
}

function recipientFor(app) {
  const store = storeOf(app);
  for (const a of [store?.recipient, app?.recipient]) if (usable(a)) return a;
  const own = game.user.character;
  if (usable(own)) return own;
  if (game.user.isGM) return null;
  return game.actors.find(a => a.type === "character" && usable(a)) ?? null;
}

function footerOf(app) {
  const root = app?.element?.[0] ?? app?.element;
  if (!(root instanceof HTMLElement)) return null;
  const all = root.querySelectorAll(SELECTORS.footer);
  return all[all.length - 1] ?? null;
}

function stateFor(app, footer) {
  const pile = app.actor;
  if (!pile || !itemPilesApi()) return { show: false };
  const pileData = getActorFlagData(pile) ?? {};
  const recipient = recipientFor(app);
  const nativeTakeAll = !!footer?.querySelector(`button:not(.${BTN}) ${SELECTORS.nativeTakeAllIcon}`);
  const state = lootAllState({ pileData, empty: isItemPileEmpty(pile), hasRecipient: !!recipient,
    isGM: game.user.isGM, nativeTakeAll });
  return { ...state, recipient };
}

/** Tracked buttons, so pile changes can grey or un-grey them while the window stays open. */
const live = new Set();

function paint(app, btn, footer) {
  const s = stateFor(app, footer);
  btn.hidden = !s.show;
  btn.disabled = !!s.disabled || btn.dataset.busy === "1";
  btn.dataset.tooltip = s.reason ? reasonText(s.reason) : _loc("PENTARYN_DROPBIN.lootAll.tip", { name: s.recipient?.name ?? "" });
}

function addButton(app) {
  try {
    if (!app?.actor || !itemPilesApi()) return false;
    const footer = footerOf(app);
    if (!footer) return false;
    let btn = footer.querySelector(`.${BTN}`);
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = BTN;
      btn.innerHTML = `<i class="fas fa-hand-holding"></i> ${_loc("PENTARYN_DROPBIN.lootAll.label")}`;
      btn.addEventListener("click", ev => { ev.preventDefault(); ev.stopPropagation(); lootAll(app, btn); });
      // Next to the Split buttons: before Close Lid (containers) or Leave, whichever comes first.
      const anchor = [...footer.querySelectorAll(SELECTORS.footerButton)]
        .find(b => b.querySelector(SELECTORS.exitIcon));
      footer.insertBefore(btn, anchor ?? null);
      live.add({ app, btn });
    }
    paint(app, btn, footer);
    return true;
  } catch (err) {
    warn("install", err);
    return false;
  }
}

async function lootAll(app, btn) {
  const { show, disabled, reason, recipient } = stateFor(app, footerOf(app));
  if (!show) return;
  if (disabled || !recipient) {
    if (reason) ui.notifications.warn(reasonText(reason));
    return;
  }
  btn.dataset.busy = "1";
  btn.disabled = true;
  try {
    const store = storeOf(app);
    const opts = typeof store?.interactionId === "string" ? { interactionId: store.interactionId } : {};
    await transferEverything(app.actor, recipient, opts);
  } catch (err) {
    warn("transfer", err);
    ui.notifications.error(_loc("PENTARYN_DROPBIN.lootAll.failed"));
  } finally {
    delete btn.dataset.busy;
    if (btn.isConnected) paint(app, btn, footerOf(app));
  }
}

function refreshAll() {
  for (const entry of live) {
    if (!entry.btn.isConnected) { live.delete(entry); continue; }
    try { paint(entry.app, entry.btn, footerOf(entry.app)); } catch (err) { warn("refresh", err); }
  }
}

let queued = 0;
function scheduleRefresh() {
  if (!live.size || queued) return;
  queued = setTimeout(() => { queued = 0; refreshAll(); }, 50);
}

/** The Svelte footer may mount a frame after the render hook; retry briefly. */
function installSoon(app, tries = 20) {
  if (addButton(app) || tries <= 0) return;
  setTimeout(() => installSoon(app, tries - 1), 100);
}

const isInventoryApp = app => app?.constructor?.name === "ItemPileInventoryApp"
  || app?.options?.classes?.includes?.("item-pile-inventory");

/** The legacy API object; `loot.install(app)` adds the button to one open window. */
export const loot = { install: addButton, refreshAll, recipientFor };

/** Registration order (golden/hooks.json): the two window hooks, then the refresh triggers. */
export function install(reg, ctx) {
  ctx.expose({ loot });
  reg.on("renderItemPileInventoryApp", app => installSoon(app), { label: "loot: render" });
  // Belt and braces: Item Piles' own hook fires as the window is built, before it is in the DOM.
  reg.on("item-piles-openInterface", app => { if (isInventoryApp(app)) setTimeout(() => installSoon(app), 0); },
    { label: "loot: open" });
  for (const h of ["updateActor", "createItem", "updateItem", "deleteItem", "updateToken"]) {
    reg.on(h, scheduleRefresh, { label: `loot: ${h}` });
  }
}

/** Forget tracked buttons and a queued refresh. */
export function uninstall() {
  live.clear();
  clearTimeout(queued);
  queued = 0;
}
