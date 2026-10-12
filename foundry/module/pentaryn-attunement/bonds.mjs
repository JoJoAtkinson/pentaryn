/**
 * Pentaryn Attunement Slots — FEATURE: item arrivals and the over-cap warning.
 *
 * preUpdateItem covers every writer of `system.attuned` (the sheet's sun toggle, the context menu,
 * this module's drops, macros, the MCP bridge); preCreateItem catches an item arriving already
 * attuned, and restores a bonded item's real state before it exists; createItem hands an away
 * item's slot back once it is home. Neither pre-hook ever returns false: a vetoed update resolves
 * without applying and without throwing, so a script would carry on believing it succeeded.
 *
 * Registered synchronously at load (from the entry): dropbin's attunement repair registers inside
 * an async ready, so restoreBond runs first. Moving this install to setup would change that order.
 */

import { AWAY, AWAY_FLAG, BOND, MODULE, SLOTS, awayOf, bondChanges, capOf, computeSlots, homeSlots, isBondOwner, wouldExceed } from "./attunement-core.mjs";
import { clearSerial, isPileActor, serial } from "./actor-adapter.mjs";
import { claimDocument } from "./lib/election.mjs";
import { flagPath } from "./lib/flags.mjs";

/* -------------------------------------------- */
/*  Away bonds                                  */
/* -------------------------------------------- */

/*
 * An attuned item that leaves its owner — confiscated into a chest, handed to
 * someone to carry — is still attuned by the rules: attunement only ends when
 * you end it, or after 24 hours more than 100 feet away. dnd5e has no way to say
 * that. Delete the item from the actor and the attunement simply vanishes; the
 * slot frees up and nothing remembers it.
 *
 * So the item carries a *bond* and the actor carries an *away list* (shapes in
 * attunement-core.mjs). The away entry holds a slot (greyed, chain-broken, "not
 * on <actor>") and the bond lets the item find its way home: when an item
 * carrying a bond is created on the bonded actor, by any route — item-piles
 * Take, a sheet drop, a script — `preCreateItem` restores its real name,
 * equipped state and attunement before the document exists, so it arrives lit
 * up. Nobody has to remember to re-attune.
 *
 * `bond.name` is also what makes the "(Talo)" tag on a confiscated item go away
 * the moment anyone picks it up: the tag is for finding things in the box, not
 * for living on a character sheet.
 */

/**
 * An item is being created on an actor. If it carries a bond, put it back the
 * way it was. Runs on whichever client creates the document — for an item-piles
 * Take that is the GM's — which is why this mutates source rather than writing.
 * @param {Item} item
 */
function restoreBond(item, data, options) {
  const bond = item.getFlag?.(MODULE, BOND);
  if (!bond) return;
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  // Into another container (box to box): leave it tagged.
  if (isPileActor(actor)) return;

  const changes = bondChanges(bond, { actorId: actor.id, actorUuid: actor.uuid, awayKeys: awayOf(actor).map(a => a.key), fallbackName: item.name });
  // A purse copied inside another actor's 750 ms claim window carries that tab's stamp; left in
  // place, every tab here reads the claim as held by someone else and nobody pays (W2-A1).
  const claims = item.getFlag?.(MODULE, "claims");
  if (claims?.coinBack) changes[`flags.${MODULE}.claims.coinBack`] = _del;
  if (claims?.home) changes[`flags.${MODULE}.claims.home`] = _del;   // the same, for a hand-back (ATT-AC-1-residual)
  item.updateSource(changes);
  // Merged, not replaced: the batch's pending-attune count and swapFrom live here too (EC-4).
  if (options) options[MODULE] = { ...options[MODULE], bond };
}

/**
 * After the item exists: hand its slot back and say so. Only on the client that
 * created it — one user, but every tab of that user (the MCP bridge tab and a GM
 * browser tab both pass the userId gate). The coin purse is therefore claimed
 * first, so exactly one tab pays (W2-A1); the slot hand-back is claimed the same
 * way (key `home`), so exactly one tab hands each item back (ATT-AC-1-residual).
 */
async function onCreateItemBond(item, options, userId) {
  if (userId !== game.user.id) return;
  const actor = item.parent;
  if (!(actor instanceof Actor)) return;
  // Read the bond off the document, not `options`: item-piles' create path does
  // not carry preCreate's options mutations through to this hook.
  const bond = item.getFlag(MODULE, BOND);
  if (!bond) return;
  if (isPileActor(actor)) return;

  if (bond.currency) {
    // Single-use key: the purse is a one-time event and deletes itself. A purse
    // already gone (paid by the other tab) re-reads as {} and stands down.
    const won = await claimDocument(item, "coinBack", { scope: MODULE, reread: d => d.parent?.items?.get?.(d.id) ?? {} });
    if (!won) return;
    // Two purses in one batch each add onto the other's write, not the same read (ATT-AC-2). Their own
    // chain, so a purse never waits on a hand-back. Item Piles' own currency write is outside any chain.
    return serial(actor, async () => {
      const update = {};
      for (const [k, v] of Object.entries(bond.currency)) update[`system.currency.${k}`] = (actor.system.currency?.[k] ?? 0) + v;
      await actor.update(update);
      await item.delete();
      ui.notifications.info(_loc("PENTARYN_ATTUNEMENT.CoinBack", { actor: actor.name }));
    }, ":coin");
  }

  if (!isBondOwner(bond, actor)) return;
  // One tab per item, as the purse: two tabs each running their own chain could interleave a batch's
  // actor writes and leave a phantom away slot (ATT-AC-1-residual). An item already home re-reads as {}.
  const won = await claimDocument(item, "home", { scope: MODULE, reread: d => d.parent?.items?.get?.(d.id) ?? {} });
  if (!won) return;
  // Home for good: the bond has done its job. Anywhere else it stays, so the
  // item still knows its way back if it is handed over later. The claim goes with it.
  await item.update({ [flagPath(MODULE, BOND)]: _del, [`flags.${MODULE}.claims.home`]: _del });
  // A take-all brings several bonded items home in one batch: each hand-back reads the away list
  // and slots, so it waits for the previous one's actor write (ATT-AC-1).
  return serial(actor, async () => {
    const away = awayOf(actor);
    if (!away.some(a => a.key === bond.key)) return;
    const slots = homeSlots(computeSlots(actor).slots, AWAY + bond.key, item.id);
    await actor.update({
      [`flags.${MODULE}.${AWAY_FLAG}`]: away.filter(a => a.key !== bond.key),
      [`flags.${MODULE}.${SLOTS}`]: slots
    });
    ui.notifications.info(_loc("PENTARYN_ATTUNEMENT.BackInHand", { name: item.name, actor: actor.name }));
  });
}

/* -------------------------------------------- */
/*  Enforcement — warn, never veto              */
/* -------------------------------------------- */

/**
 * Warn when this item's attunement takes the actor past the cap. One batch shares one `options`
 * object across every pre-hook, and none of its writes has landed yet, so the attunes already seen
 * in the batch are counted there (`pending`) and added to the away slots: the first item over the
 * cap and every one after it warns (EC-4).
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} key
 * @param {number} [freed]   slots the same batch frees (a swap's occupant)
 * @param {object} [options] the batch's options
 */
function warnOverCap(actor, item, key, freed = 0, options) {
  const att = actor?.system?.attributes?.attunement;
  if (!att) return;
  const batch = options ? (options[MODULE] ??= {}) : {};
  const pending = batch.pending ?? 0;
  batch.pending = pending + 1;
  const max = capOf(att);
  const { exceed, after } = wouldExceed({ value: att.value - freed, max, awayCount: awayOf(actor).length + pending });
  if (!exceed) return;
  ui.notifications.warn(_loc(key, {
    name: item.name, actor: actor.name, value: after, max
  }));
}

function onPreUpdateItem(item, changes, options) {
  if (foundry.utils.getProperty(changes, "system.attuned") !== true) return;
  if (item.system?.attuned) return;             // already attuned: no delta
  if (!item.system?.attunement) return;         // does not count against the cap
  // A slot swap unattunes the occupant in the same batch, so it frees one (EC-3).
  const from = item.parent?.items?.get?.(options?.[MODULE]?.swapFrom);
  const freed = (from?.system?.attuned && from.system.attunement) ? 1 : 0;
  warnOverCap(item.parent, item, "PENTARYN_ATTUNEMENT.WouldExceed", freed, options);
}

function onPreCreateItem(item, data, options) {
  restoreBond(item, data, options);
  if (item.getFlag?.(MODULE, BOND)) return;
  if (!item.system?.attuned) return;
  if (!(item.parent instanceof Actor)) return;
  warnOverCap(item.parent, item, "PENTARYN_ATTUNEMENT.ArrivedAttuned", 0, options);
}

/** The hooks install() registers, in order; selftest() checks each is in the registry (EXT-8). */
export const HOOK_NAMES = Object.freeze(["preUpdateItem", "preCreateItem", "createItem"]);

export function install(reg) {
  reg.on("preUpdateItem", onPreUpdateItem, { label: "preUpdateItem: over-cap warn" });
  reg.on("preCreateItem", onPreCreateItem, { label: "preCreateItem: bond restore" });
  reg.on("createItem", onCreateItemBond, { label: "createItem: bond return" });
}

/** Session state: the per-actor write tails (shared with stash and the sheet's drops). */
export function uninstall() {
  clearSerial();
}
