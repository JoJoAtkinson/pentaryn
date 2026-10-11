/**
 * Pentaryn Drop Bin — the ledger's pure half
 * ==========================================
 *
 * The entry shape, the dedupe rule, the append, the reads over a log and the delete-capture guards.
 * No Foundry global is touched: everything a rule needs from the world (the user, the scene, the
 * clock, Item Piles' answers) is passed in, so `node test/run.mjs` proves it bare.
 */

import { MODULE } from "./loot-core.mjs";

/** Where the JSON mirror goes (Data/assets/drop-bin/drop-log.json). */
export const DIR = "assets/drop-bin";
export const FILE = "drop-log.json";
/** Two entries with the same key this close together are one event seen on two clients. */
export const DEDUPE_MS = 2000;
/** The JSON mirror is written this long after the last entry of a burst (export() writes at once). */
export const MIRROR_DEBOUNCE_MS = 2000;

/** The ready line's size hint: the ledger as JSON, in whole KB (at least 1 when not empty). */
export const ledgerKB = log => (log.length ? Math.max(1, Math.round(JSON.stringify(log).length / 1024)) : 0);

/** The four fields that identify one loss: reason, item name, the actor it left, the quantity. */
export const dedupeKey = e => `${e.reason}|${e.itemName}|${e.fromActorId}|${e.quantity}`;

/** The log's last entry when `entry` repeats it within `dedupeMs`, else null. */
export function duplicateOfTail(log, entry, dedupeMs = DEDUPE_MS) {
  const tail = log[log.length - 1];
  return tail && dedupeKey(tail) === dedupeKey(entry) && entry.t - tail.t < dedupeMs ? tail : null;
}

/**
 * Append `entry` as number `counter + 1`, or recognise it as a repeat of the tail. Never mutates
 * its inputs. @returns {{ log, counter, n, duplicate }} — on a duplicate the log and counter are
 * the ones passed in and `n` is the tail's number.
 */
export function appendEntry(log, counter, entry, dedupeMs = DEDUPE_MS) {
  const tail = duplicateOfTail(log, entry, dedupeMs);
  if (tail) return { log, counter, n: tail.n, duplicate: true };
  const n = (counter ?? 0) + 1;
  return { log: [...log, { n, ...entry }], counter: n, n, duplicate: false };
}

/**
 * One ledger entry (key order is the stored shape; golden/ledger-entry.json pins it). `item` is the
 * item's complete source object, so a restore is faithful after the pile, actor or scene is gone.
 * `t` and `iso` come from the same `now`.
 */
export function makeEntry(reason, { actor, item, quantity, user, scene, now }) {
  return {
    t: now,
    iso: new Date(now).toISOString(),
    reason,
    userId: user.id,
    userName: user.name,
    fromActorId: actor?.id ?? null,
    fromActorName: actor?.name ?? null,
    fromActorUuid: actor?.uuid ?? null,
    itemName: item?.name ?? "(unnamed)",
    itemType: item?.type ?? null,
    quantity: quantity ?? item?.system?.quantity ?? 1,
    sceneId: scene?.id ?? null,
    sceneName: scene?.name ?? null,
    x: null, y: null,
    pileUuid: null,
    item: item ?? null
  };
}

/** Item Piles passes one delta or an array of them. */
export const normaliseDeltas = itemDeltas => (Array.isArray(itemDeltas) ? itemDeltas : [itemDeltas].filter(Boolean));

/** The last `n` entries, newest first. */
export const listLast = (log, n = 20) => log.slice(-n).reverse();

/** Entry number `n` (a number or a numeric string), or null. */
export const findEntry = (log, n) => log.find(e => e.n === Number(n)) ?? null;

/** The compact row `list(n, {brief: true})` returns: no item source (key order pinned). */
export const briefOf = e => ({
  n: e.n, iso: e.iso, reason: e.reason, itemName: e.itemName, itemType: e.itemType, quantity: e.quantity,
  fromActorName: e.fromActorName, sceneName: e.sceneName, pileUuid: e.pileUuid,
});

/** Entries whose item name contains `text`, case-insensitive. `String(text)`: undefined searches "undefined". */
export const searchLog = (log, text) => {
  const q = String(text).toLowerCase();
  return log.filter(e => (e.itemName ?? "").toLowerCase().includes(q));
};

/**
 * Whether a `preDeleteItem` is a loss to record: this client's own delete, off an Actor of the
 * character type (Item Piles' ACTOR_CLASS_TYPE) that is not itself a pile, and not one of our
 * own restores.
 */
export function shouldCaptureDelete({ userId, selfId, actor, characterType, isPile, options }) {
  if (userId !== selfId) return false;                 // one client records, not all
  if (!actor || actor.documentName !== "Actor") return false;
  if (actor.type !== characterType) return false;     // characters only
  if (isPile?.(actor)) return false;                   // piles are not losses
  // Never true in practice (items-journal-27): restore() tags its CREATE with {restoring: true}, and a
  // create never reaches preDeleteItem. Kept as the documented tag on our own restores (no consumer).
  if (options?.[MODULE]?.restoring) return false;
  return true;
}

/**
 * restore()'s target: an Actor as given, else an actor id or exact name, else the actor the entry
 * left. `isActor` stands for `instanceof Actor`; `actors` for `game.actors`.
 */
export function restoreTarget(target, entry, { isActor, actors }) {
  return isActor(target) ? target
    : (typeof target === "string" ? (actors.get(target) ?? actors.getName(target)) : null)
    ?? actors.get(entry.fromActorId);
}
