/**
 * Never loot this (A2)
 * ====================
 *
 * Some monster "weapons" are attacks in weapon clothing: the Unbound Ancient's Dread Blade is a
 * `weapon / martialM` with weight 0 and price 0 (a Monster Manual copy), so the natural-weapon filter
 * cannot catch it and a dead ancient offered its blade as loot. The GM marks such an item once, and it
 * stays on the actor but never shows in the corpse's loot window:
 *
 *   - **Primary surface: the pile inventory.** On a loot window the GM right-clicks an item row and
 *     picks *Never loot this* (or *Lootable again*). The row vanishes for everyone at once; players
 *     never see the menu.
 *   - **The item sheet header.** The same toggle in the sheet's header controls (the ⋯ menu), for
 *     marking a creature's gear before it dies, or a world item every copy inherits from.
 *   - **The API:** `game.pentaryn.dropbin.noLoot(item, { on })`.
 *
 * What is written: `flags.pentaryn-dropbin.noLoot = true` on the Item (deleted when unmarked). How it
 * hides: every corpse pile carries the world's item filters plus a row on that flag as its Item Piles
 * `overrideItemFilters` (corpses.mjs), so Item Piles itself filters the item out of the window, out of
 * Loot all and out of "is the pile empty" (the eye). A corpse made before 0.3.0 has no such row; the
 * toggle writes it on that pile when it finds it missing, so the click always shows at once.
 *
 * Nothing else changes on the player's screen: no prompt, no toast, no mode.
 */

import { MODULE, isNoLootItem, isOurCorpse, pileFlags, isPileFlagged, hasNoLootFilter, corpseItemFilters } from "./dropbin-core.mjs";
import { actorClassType, itemFilters, SELECTORS } from "./piles.mjs";
import { ok, fail } from "./lib/errors.mjs";
import { htmlRoot } from "./lib/api.mjs";

/** The module log (set by install). */
let log = null;

/** Item Piles' inventory row (piles.mjs SELECTORS), stamped with the item's uuid for the GM (data-pd-item-uuid). */
const STAMP = "pdItemUuid";
const SELECTOR = `${SELECTORS.itemRow}[data-pd-item-uuid]`;
const KEYS = Object.freeze({ never: "PENTARYN_DROPBIN.noLoot.never", again: "PENTARYN_DROPBIN.noLoot.again" });
const ICONS = Object.freeze({ never: "fa-solid fa-ban", again: "fa-solid fa-hand-holding" });
const del = () => new foundry.data.operators.ForcedDeletion();

/** The document whose Item Piles flags make this actor a pile: an unlinked token's own token, else the actor. */
const pileDocOf = actor => (actor?.isToken && actor.token ? actor.token : actor ?? null);

/**
 * Our corpse pile lacking the noLoot filter row (made before 0.3.0): write the pile's filters now, so
 * the GM's click hides the item at once instead of on the body's next sync. Returns whether it wrote.
 */
async function ensureNoLootFilter(actor) {
  const doc = pileDocOf(actor);
  if (!doc || !isOurCorpse(doc) || !isPileFlagged(doc)) return false;
  if (hasNoLootFilter(pileFlags(doc)?.overrideItemFilters)) return false;
  await doc.update({ "flags.item-piles.data.overrideItemFilters": corpseItemFilters(itemFilters()) });
  return true;
}

/**
 * GM: mark (`on: true`), unmark (`on: false`) or flip (no `on`) an Item. Resolves `ok({ uuid, noLoot,
 * filterWritten })`, or `fail(NOT_GM | BAD_ARGS)`. A no-change call writes nothing.
 */
async function set(item, { on } = {}) {
  if (!game.user.isGM) return fail("NOT_GM", "only the GM marks what is loot");
  if (item?.documentName !== "Item") return fail("BAD_ARGS", `expected an Item, got ${item?.documentName ?? typeof item}`);
  const want = on === undefined ? !isNoLootItem(item) : !!on;
  if (want !== isNoLootItem(item)) await item.update({ [`flags.${MODULE}.noLoot`]: want ? true : del() });
  const filterWritten = await ensureNoLootFilter(item.parent?.documentName === "Actor" ? item.parent : null);
  log.info("noLoot", { uuid: item.uuid, noLoot: want, by: game.user.id });
  return ok({ uuid: item.uuid, noLoot: want, filterWritten });
}

/** A click handler's flip: the result is logged, never an unhandled rejection. */
function flip(item) {
  Promise.resolve(set(item)).then(
    r => { if (!r.ok) log.warn(`noLoot refused: ${r.code} ${r.reason}`); },
    err => log.warn("noLoot failed", err),
  );
}

/* -------------------------------------------- */
/*  The pile inventory's item context menu       */
/* -------------------------------------------- */

/** item-piles-renderPileItem (element, item): the GM's rows carry their item's uuid. */
function stampRow(element, item) {
  if (!game.user.isGM || !element?.dataset || typeof item?.uuid !== "string") return;
  element.dataset[STAMP] = item.uuid;
}

/** The Item behind a stamped row, or null. */
function itemOf(target) {
  const uuid = target?.dataset?.[STAMP];
  if (!uuid) return null;
  let doc = null;
  try { doc = fromUuidSync(uuid); } catch (err) { log.debug("noLoot: row uuid", err); }
  return doc?.documentName === "Item" ? doc : null;
}

/** The two entries; one shows per row, by the item's state (core renders `visible` per open). */
function menuEntries() {
  const entry = (key, when) => ({
    label: _loc(KEYS[key]), icon: ICONS[key],
    visible: target => { const item = itemOf(target); return !!item && isNoLootItem(item) === when; },
    onClick: (_event, target) => { const item = itemOf(target); if (item) flip(item); },
  });
  return [entry("never", false), entry("again", true)];
}

/** One context menu per loot window root (a re-render keeps the Svelte root). */
let menus = new WeakSet();

function installMenu(app) {
  if (!game.user.isGM) return false;
  const root = htmlRoot(app?.element);
  if (!root) return false;
  if (menus.has(root)) return true;
  const Menu = foundry.applications?.ux?.ContextMenu?.implementation ?? foundry.applications?.ux?.ContextMenu;
  if (!Menu) return false;
  new Menu(root, SELECTOR, menuEntries(), { jQuery: false, fixed: true });
  menus.add(root);
  return true;
}

/* -------------------------------------------- */
/*  The item sheet header                        */
/* -------------------------------------------- */

/**
 * getHeaderControlsItemSheet5e (app, controls): the GM's control on every item that could end up on a
 * corpse: an NPC's, or a world item (its copies inherit the flag). A character's gear gets none.
 */
function headerControl(app, controls) {
  const item = app?.document;
  if (!game.user.isGM || item?.documentName !== "Item" || !Array.isArray(controls)) return;
  const parent = item.parent;
  if (parent?.documentName === "Actor" && parent.type === (actorClassType() ?? "character")) return;
  const key = isNoLootItem(item) ? "again" : "never";
  controls.push({ action: "pdNoLoot", icon: ICONS[key], label: KEYS[key], visible: true, onClick: () => flip(item) });
}

/* -------------------------------------------- */
/*  Lifecycle                                   */
/* -------------------------------------------- */

/** Registration order (golden/hooks.json): the row stamp, the loot-window menu, the item sheet control. */
export function install(reg, ctx) {
  log = ctx.log;
  ctx.expose({ noLoot: { set, ensureNoLootFilter, menuEntries } });
  reg.on("item-piles-renderPileItem", stampRow, { label: "noLoot: row stamp" });
  reg.on("renderItemPileInventoryApp", app => { installMenu(app); }, { label: "noLoot: menu" });
  reg.on("getHeaderControlsItemSheet5e", headerControl, { label: "noLoot: item sheet" });
}

/** Forget the windows that have a menu (their listener goes with their DOM). */
export function uninstall() {
  menus = new WeakSet();
}
