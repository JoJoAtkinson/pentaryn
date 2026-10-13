/**
 * Pentaryn Drop Bin — the Item Piles adapter. The only file that touches `game.itempiles`.
 *
 * Item Piles is not a hard dependency (module.json requires socketlib only), so every read here is
 * optional: with Item Piles inactive the checks answer "not a pile" and the hooks are never named.
 * The writes (`turnTokensIntoItemPiles`, `revertTokensFromItemPiles`, `transferEverything`) are
 * only reached behind an `api()` check.
 *
 * `SELECTORS` names the loot window's DOM that Loot all reads.
 *
 * `storeOf(app)` reads Item Piles' private Svelte state (`app.svelte.appShell.$$.ctx`) to follow the
 * loot window's Change-recipient button; it fails soft (null) when that shape changes.
 */

const itempiles = () => globalThis.game?.itempiles;

/**
 * Item Piles' loot window (ItemPileInventoryApp) DOM, as Loot all finds it: the footer, its direct
 * buttons, the Close Lid (containers) / Leave icons Loot all sits before, and the native Take All
 * icon. Re-check these against the window after an Item Piles update.
 */
export const SELECTORS = Object.freeze({
  footer: "footer.sheet-footer",
  footerButton: ":scope > button",
  exitIcon: "i.fa-box, i.fa-sign-out-alt",
  nativeTakeAllIcon: "i.fa-fist-raised",
});

/** `game.itempiles.API`, or undefined when Item Piles is not active. */
export const api = () => itempiles()?.API;

/** The hook Item Piles fires when an item is dropped onto the canvas as a pile, or undefined. */
export const dropHook = () => itempiles()?.hooks?.ITEM?.DROP;

/** The actor type Item Piles treats as a character (its ACTOR_CLASS_TYPE), or undefined. */
export const actorClassType = () => api()?.ACTOR_CLASS_TYPE;

/** Item Piles' own pile test (its defaults applied); false without Item Piles. */
export const isValidItemPile = doc => !!api()?.isValidItemPile?.(doc);

/** Whether a pile has nothing left Item Piles would show; false without Item Piles. */
export const isItemPileEmpty = doc => !!api()?.isItemPileEmpty?.(doc);

/** Item Piles' flag data for an actor with its defaults merged, or undefined. */
export const getActorFlagData = actor => api()?.getActorFlagData?.(actor);

/** Item Piles' Take All, run on the GM's client by Item Piles. */
export const transferEverything = (source, target, opts) => api().transferEverything(source, target, opts);

/** Turn token documents into piles. */
export const turnTokensIntoItemPiles = (docs, opts) => api().turnTokensIntoItemPiles(docs, opts);

/** Turn piles back into plain tokens. */
export const revertTokensFromItemPiles = docs => api().revertTokensFromItemPiles(docs);

/** Item Piles' Svelte store for this loot window, if we can reach it: it tracks the Change button. */
export function storeOf(app) {
  try {
    const ctx = app?.svelte?.appShell?.$$?.ctx;
    if (!Array.isArray(ctx)) return null;
    return ctx.find(c => c && typeof c === "object" && typeof c.takeAll === "function" && "recipient" in c) ?? null;
  } catch {
    return null;
  }
}
