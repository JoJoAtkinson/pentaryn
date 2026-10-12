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

import { AWAY, AWAY_FLAG, BOND, MODULE, SLOTS, awayOf, bondChanges, computeSlots, homeSlots, isBondOwner, t, wouldExceed } from "./attunement-core.mjs";
import { isPileActor } from "./actor-adapter.mjs";
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
  if (item.getFlag?.(MODULE, "claims")?.coinBack) changes[`flags.${MODULE}.claims.coinBack`] = _del;
  item.updateSource(changes);
  if (options) options[MODULE] = { bond };
}

/**
 * After the item exists: hand its slot back and say so. Only on the client that
 * created it — one user, but every tab of that user (the MCP bridge tab and a GM
 * browser tab both pass the userId gate). The coin purse is therefore claimed
 * first, so exactly one tab pays (W2-A1); the slot hand-back writes the same
 * values from either tab and needs no claim.
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
      ui.notifications.info(t("CoinBack", { actor: actor.name }));
    }, ":coin");
  }

  if (!isBondOwner(bond, actor)) return;
  // Home for good: the bond has done its job. Anywhere else it stays, so the
  // item still knows its way back if it is handed over later.
  await item.update({ [flagPath(MODULE, BOND)]: _del });
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
    ui.notifications.info(t("BackInHand", { name: item.name, actor: actor.name }));
  });
}

/** Per-actor tails of in-flight hand-backs and, apart (`:coin`), coin purses. Local to this tab; two tabs still race (recorded). */
const tails = new Map();

/**
 * Run `step` after the actor's previous step in the same `lane` settles. Uncontended, it runs
 * synchronously, so a lone item home takes the same ticks as before. Returns `step`'s own promise: a
 * rejection still reaches the reg's labelled catch, while the stored tail swallows it so the next step still runs.
 */
function serial(actor, step, lane = "") {
  const key = actor.uuid + lane;
  const prev = tails.get(key);
  const run = prev ? prev.then(step) : step();
  const tail = run.catch(() => {});
  tails.set(key, tail);
  tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
  return run;
}

/* -------------------------------------------- */
/*  Enforcement — warn, never veto              */
/* -------------------------------------------- */

/**
 * @param {Actor} actor
 * @param {Item} item
 * @param {string} key
 */
function warnOverCap(actor, item, key) {
  const att = actor?.system?.attributes?.attunement;
  if (!att) return;
  const { exceed, after } = wouldExceed({ value: att.value, max: att.max, awayCount: awayOf(actor).length });
  if (!exceed) return;
  ui.notifications.warn(t(key, {
    name: item.name, actor: actor.name, value: after, max: att.max
  }));
}

function onPreUpdateItem(item, changes) {
  if (foundry.utils.getProperty(changes, "system.attuned") !== true) return;
  if (item.system?.attuned) return;             // already attuned: no delta
  if (!item.system?.attunement) return;         // does not count against the cap
  warnOverCap(item.parent, item, "WouldExceed");
}

function onPreCreateItem(item, data, options) {
  restoreBond(item, data, options);
  if (item.getFlag?.(MODULE, BOND)) return;
  if (!item.system?.attuned) return;
  if (!(item.parent instanceof Actor)) return;
  warnOverCap(item.parent, item, "ArrivedAttuned");
}

export function install(reg) {
  reg.on("preUpdateItem", onPreUpdateItem, { label: "preUpdateItem: over-cap warn" });
  reg.on("preCreateItem", onPreCreateItem, { label: "preCreateItem: bond restore" });
  reg.on("createItem", onCreateItemBond, { label: "createItem: bond return" });
}

/** Session state: the hand-back and coin-purse tails. */
export function uninstall() {
  tails.clear();
}
