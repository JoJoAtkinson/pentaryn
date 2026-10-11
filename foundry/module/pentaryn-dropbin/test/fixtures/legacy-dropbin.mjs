/**
 * Verbatim oracles (guide step 1.3): today's dropbin.mjs logic with its globals injected, so step 2's
 * ledger-core / dropbin-core functions can be proven equal. Bodies from dropbin.mjs (snapshot = HEAD
 * line numbers in the comments). Where the guide names a new pure function (pileFlags, needsRedraw,
 * the planners), the oracle is today's in-place expression or loop, and its output shape is the
 * contract the core function must meet.
 */

const MODULE = "pentaryn-dropbin";
const DEDUPE_MS = 2000;

/** :138–157 baseEntry, with `now`, the user and the scene injected (Date.now / game.user / canvas.scene). */
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

/** :107–113 the dedupe key and the tail test. */
export const dedupeKey = e => `${e.reason}|${e.itemName}|${e.fromActorId}|${e.quantity}`;
export const isDuplicateOfTail = (log, entry, dedupeMs = DEDUPE_MS) => {
  const tail = log[log.length - 1];
  return !!(tail && dedupeKey(tail) === dedupeKey(entry) && entry.t - tail.t < dedupeMs);
};

/**
 * :105–126 recordAsGM with its store injected. `read()` returns the log (as readLog does),
 * `getCounter()`/`setCounter(n)`/`write(log)`/`mirror(log)` stand for the settings and the upload.
 */
export function makeRecorder({ isGM = () => true, read, write, getCounter, setCounter, mirror = async () => true, say = () => {} }) {
  return async function recordAsGM(entry) {
    if (!isGM()) return null;
    const ledger = read();
    const key = `${entry.reason}|${entry.itemName}|${entry.fromActorId}|${entry.quantity}`;
    const tail = ledger[ledger.length - 1];
    if (tail && `${tail.reason}|${tail.itemName}|${tail.fromActorId}|${tail.quantity}` === key
        && entry.t - tail.t < DEDUPE_MS) {
      return tail.n;
    }
    const n = (getCounter() ?? 0) + 1;
    const row = { n, ...entry };
    ledger.push(row);
    await setCounter(n);
    await write(ledger);
    await mirror(ledger);
    say(`${MODULE} | #${n} ${entry.reason}: ${entry.itemName} from ${entry.fromActorName}`);
    return n;
  };
}

/** :129–134 submit with its context injected. */
export function makeSubmit({ isGM, socket, recordAsGM, warn }) {
  return function submit(entry) {
    if (isGM()) return recordAsGM(entry);
    if (socket()) return socket().executeAsGM("record", entry);
    warn(`${MODULE} | no socketlib and not a GM — entry dropped`, entry);
    return null;
  };
}

/** :166 the drop hook's delta normalisation. */
export const normaliseDeltas = itemDeltas => (Array.isArray(itemDeltas) ? itemDeltas : [itemDeltas].filter(Boolean));

/** :208–213 list / get / search over a log. */
export const listLast = (log, n = 20) => log.slice(-n).reverse();
export const findEntry = (log, n) => log.find(e => e.n === Number(n)) ?? null;
export const searchLog = (log, text) => {
  const q = String(text).toLowerCase();
  return log.filter(e => (e.itemName ?? "").toLowerCase().includes(q));
};

/** :221–223 restore's target resolution (`isActor` stands for `instanceof Actor`). */
export function restoreTarget(target, entry, { isActor, actors }) {
  return isActor(target) ? target
    : (typeof target === "string" ? (actors.get(target) ?? actors.getName(target)) : null)
    ?? actors.get(entry.fromActorId);
}

/** :186–193 the preDeleteItem guards: true when the delete is captured. */
export function shouldCaptureDelete({ userId, selfId, actor, characterType, isPile, options }) {
  if (userId !== selfId) return false;
  if (!actor || actor.documentName !== "Actor") return false;
  if (actor.type !== characterType) return false;
  if (isPile?.(actor)) return false;
  if (options?.[MODULE]?.restoring) return false;
  return true;
}

/** :376/:436/:470 the plain-flag pile reads (items-journal-23). */
export const pileFlags = doc => doc?.flags?.["item-piles"]?.data ?? null;
export const isPileFlagged = doc => !!pileFlags(doc)?.enabled;

/** :478–483 isNotePinnedJournal over injected scenes. */
export function isNotePinnedJournal(scenes, id) {
  for (const scene of scenes) for (const note of scene.notes) {
    if (note.entryId === id) return true;
  }
  return false;
}
/** items-journal-24's set form; membership must equal isNotePinnedJournal for every non-empty id. */
export function pinnedEntryIds(scenes) {
  const s = new Set();
  for (const sc of scenes) for (const n of sc.notes) if (n.entryId) s.add(n.entryId);
  return s;
}

/** items-journal-30: redraw the eye disc only when its size changes (today: always). */
export const needsRedraw = (prev, size) => prev !== size;

/**
 * :398–418 ensureLockSounds' loops, run against recording stubs. The plan shape the core planner must
 * return: `{ actorUpdates: [{_id, ...payload}], embedded: [{sceneId, type, updates}] }`.
 */
export async function planLockSounds(actors, scenes, sound = "sounds/lock.wav") {
  const plan = { actorUpdates: [], embedded: [] };
  for (const actor of actors) {
    const data = actor.getFlag("item-piles", "data");
    if (!data?.enabled || data.type !== "container" || data.lockedSound) continue;
    plan.actorUpdates.push({ _id: actor.id, "flags.item-piles.data.lockedSound": sound,
                         "prototypeToken.flags.item-piles.data.lockedSound": sound });
  }
  for (const scene of scenes) {
    const updates = [];
    for (const tok of scene.tokens) {
      const data = tok.getFlag("item-piles", "data");
      if (!data?.enabled || data.type !== "container" || data.lockedSound) continue;
      updates.push({ _id: tok.id, "flags.item-piles.data.lockedSound": sound });
    }
    if (updates.length) plan.embedded.push({ sceneId: scene.id, type: "Token", updates });
  }
  return plan;
}

/** :434–451 ensureEyesNeedView's loops; same plan shape. */
export async function planEyesNeedView(actors, scenes) {
  const isPile = d => d?.flags?.["item-piles"]?.data?.enabled;
  const plan = { actorUpdates: [], embedded: [] };
  for (const actor of actors) {
    if (isPile(actor) && actor.prototypeToken.sight.enabled) {
      plan.actorUpdates.push({ _id: actor.id, "prototypeToken.sight.enabled": false });
    }
  }
  for (const scene of scenes) {
    const tok = scene.tokens.filter(t => isPile(t) && t.sight.enabled)
      .map(t => ({ _id: t.id, "sight.enabled": false }));
    if (tok.length) plan.embedded.push({ sceneId: scene.id, type: "Token", updates: tok });
    const pins = scene.notes.filter(n => n.global && n.entry).map(n => ({ _id: n.id, global: false }));
    if (pins.length) plan.embedded.push({ sceneId: scene.id, type: "Note", updates: pins });
  }
  return plan;
}
