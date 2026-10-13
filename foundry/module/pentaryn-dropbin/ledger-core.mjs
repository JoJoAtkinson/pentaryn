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

/**
 * The fields that identify one loss: reason, item name, the actor it left, the quantity, the item
 * source's _id and the pile it went to (dropbin-EC-2) — so a second same-named item lost within
 * DEDUPE_MS is its own entry, while one event seen on two clients is still one.
 */
export const dedupeKey = e => `${e.reason}|${e.itemName}|${e.fromActorId}|${e.quantity}|${e.item?._id ?? ""}|${e.pileUuid ?? ""}`;

/** The log's last entry when `entry` repeats it within `dedupeMs`, else null. */
export function duplicateOfTail(log, entry, dedupeMs = DEDUPE_MS) {
  const tail = log[log.length - 1];
  return tail && dedupeKey(tail) === dedupeKey(entry) && entry.t - tail.t < dedupeMs ? tail : null;
}

/**
 * The shape an entry must have to be appended (dropbin-R10): an object whose reason is 'drop' or
 * 'delete', with a string itemName, numeric t and quantity, and an item that is null or an object.
 * A relayed entry is checked before it joins a batch, so a malformed one cannot reject the others.
 */
export const isEntryShape = e =>
  !!e && typeof e === "object" && (e.reason === "drop" || e.reason === "delete") && typeof e.itemName === "string"
  && typeof e.t === "number" && typeof e.quantity === "number" && (e.item === null || typeof e.item === "object");

/**
 * The relayed entry's sender is plausible (DB-AC-3): socketlib hands the relay no sender id, so
 * `entry.userId` must name an existing user who is a GM or owns the actor `entry.fromActorId` —
 * the ownership test only when that actor still exists. Forging past it needs the console.
 */
export function isPlausibleSender(entry, { users, actors }) {
  const user = typeof entry?.userId === "string" ? users?.get(entry.userId) : null;
  if (!user) return false;
  if (user.isGM) return true;
  const actor = entry.fromActorId ? actors?.get(entry.fromActorId) : null;
  return !actor || actor.testUserPermission(user, "OWNER") === true;
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

/**
 * The scene a dropped pile sits on (DB-AC-1): the pile token's parent, or a synthetic pile actor's
 * token's; null for anything else (a world actor, an unresolved uuid). Never the recording client's
 * canvas, which may show another scene.
 */
export function pileScene(target) {
  const token = target?.documentName === "Actor" ? target.token : target;
  return token?.documentName === "Token" ? token.parent ?? null : null;
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
 * restore()'s target (dropbin-R3): null/undefined is the actor the entry left; otherwise an Actor
 * (a synthetic token actor too) as given, a TokenDocument's actor, or a string that is an actor id,
 * an exact actor name, or an Actor/Token UUID. An explicit target that does not resolve is null,
 * never the actor the entry left. The actor the entry left (dropbin-R4) is `fromActorUuid` first —
 * an unlinked token's synthetic actor while that token exists — then the base actor by
 * `fromActorId`. `isActor` stands for `instanceof Actor`; `actors` for `game.actors`; `fromUuid`
 * for `fromUuidSync`.
 */
export function restoreTarget(target, entry, { isActor, actors, fromUuid = () => null }) {
  const asActor = doc => {
    if (doc?.documentName === "Token") return doc.actor ?? null;
    return doc && isActor(doc) ? doc : null;
  };
  const byUuid = uuid => {
    try { return asActor(fromUuid?.(uuid) ?? null); } catch { return null; }
  };
  if (target === null || target === undefined) {
    return (entry.fromActorUuid ? byUuid(entry.fromActorUuid) : null) ?? actors.get(entry.fromActorId) ?? null;
  }
  if (typeof target !== "string") return asActor(target);
  return asActor(actors.get(target) ?? actors.getName(target) ?? null) ?? (target.includes(".") ? byUuid(target) : null);
}
