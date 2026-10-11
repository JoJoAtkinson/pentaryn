/**
 * Pentaryn Drop Bin — FEATURE: the ledger
 * =======================================
 *
 * An append-only record of everything that leaves a character's sheet, with the item's complete
 * source object, so `restore(n)` is faithful after the pile, actor or scene is long gone.
 *
 * Two capture paths, registered at `ready`:
 *   1. Item Piles' drop hook — an item dropped onto the canvas as a pile.
 *   2. Core `preDeleteItem` — an item removed from a character sheet outright, captured in the
 *      PRE hook because after deletion the data is unreachable.
 *
 * Writes are funnelled to a GM: world settings are not player-writable and file uploads are
 * GM-only, so a player's entry is relayed through socketlib (socketlib-adapter.mjs). The JSON
 * mirror (assets/drop-bin/drop-log.json) is a convenience for reading outside Foundry; the world
 * setting is the source of truth.
 *
 * Adjustments rows: the socketlib relay (socketlib-dropbin-relay); Item Piles' drop hook and pile
 * checks go through piles.mjs (itempiles-corpses).
 */

import {
  MODULE, DIR, FILE, DEDUPE_MS, duplicateOfTail, makeEntry, normaliseDeltas, listLast, findEntry, searchLog,
  shouldCaptureDelete, restoreTarget,
} from "./dropbin-core.mjs";
import { setting, readLog, writeLedger, clearLog } from "./settings.mjs";
import { dropHook, actorClassType, isValidItemPile } from "./piles.mjs";
import { registerRecord, hasSocket, executeAsGM, resetSocket } from "./socketlib-adapter.mjs";

/* ------------------------------------------------------------------ storage */

/** Mirror to disk. Best-effort: a failed mirror must never lose the entry. */
async function writeMirror(log) {
  if (!game.user.isGM) return false;
  try {
    const FP = foundry.applications.apps.FilePicker?.implementation ?? FilePicker;
    const json = JSON.stringify(log, null, 2);
    const file = new File([json], FILE, { type: "application/json" });
    const res = await FP.upload("data", DIR, file, {}, { notify: false });
    return !!res;
  } catch (err) {
    console.warn(`${MODULE} | JSON mirror failed (the world setting is still authoritative)`, err);
    return false;
  }
}

/**
 * Append one entry. GM-only — everything else routes here through socketlib.
 * De-dupes, because Item Piles hooks can fire on more than one client.
 */
async function recordAsGM(entry) {
  if (!game.user.isGM) return null;
  const log = readLog();

  const tail = duplicateOfTail(log, entry, DEDUPE_MS);
  if (tail) return tail.n;

  const n = (setting("counter") ?? 0) + 1;
  const row = { n, ...entry };
  log.push(row);

  await writeLedger({ n, log });
  await writeMirror(log);

  console.log(`${MODULE} | #${n} ${entry.reason}: ${entry.itemName} from ${entry.fromActorName}`);
  return n;
}

/** Called from any client. Routes to a GM if this client is not one. */
function submit(entry) {
  if (game.user.isGM) return recordAsGM(entry);
  if (hasSocket()) return executeAsGM("record", entry);
  console.warn(`${MODULE} | no socketlib and not a GM — entry dropped`, entry);
  return null;
}

function baseEntry(reason, actor, item, quantity) {
  return makeEntry(reason, { actor, item, quantity, user: game.user, scene: canvas?.scene, now: Date.now() });
}

/* ------------------------------------------------------------------- capture */

function registerCapture(reg) {
  const DROP = dropHook();

  // 1. dropped onto the canvas as an Item Pile
  if (DROP) {
    reg.on(DROP, (source, target, itemDeltas, position) => {
      try {
        const actor = source?.actor ?? source;
        for (const d of normaliseDeltas(itemDeltas)) {
          const doc = d?.item ?? d;
          const obj = doc?.toObject ? doc.toObject() : foundry.utils.duplicate(doc ?? {});
          const e = baseEntry("drop", actor, obj, Math.abs(d?.quantity ?? obj?.system?.quantity ?? 1));
          e.x = position?.x ?? null;
          e.y = position?.y ?? null;
          e.pileUuid = target?.uuid ?? (typeof target === "string" ? target : null);
          submit(e);
        }
      } catch (err) {
        console.warn(`${MODULE} | drop capture failed`, err);
      }
    }, { guard: false, label: "drop capture" });
  }

  // 2. deleted straight off a character sheet — capture BEFORE it is unreachable
  reg.on("preDeleteItem", (item, options, userId) => {
    try {
      const actor = item?.parent;
      if (!shouldCaptureDelete({ userId, selfId: game.user.id, actor, characterType: actorClassType(),
        isPile: isValidItemPile, options })) return;
      submit(baseEntry("delete", actor, item.toObject(), item.system?.quantity ?? 1));
    } catch (err) {
      console.warn(`${MODULE} | delete capture failed`, err);
    }
  }, { guard: false, label: "delete capture" });
}

/* ----------------------------------------------------------------------- API */

const all = () => readLog();
const list = (n = 20) => listLast(readLog(), n);
const get = n => findEntry(readLog(), n);
const search = text => searchLog(readLog(), text);

/** Recreate entry #n. Defaults to the actor it left; pass an Actor or id to redirect. */
async function restore(n, target = null) {
  if (!game.user.isGM) return ui.notifications.warn("Only the GM can restore from the drop bin.");
  const entry = findEntry(readLog(), n);
  if (!entry) return ui.notifications.error(`Drop bin: no entry #${n}.`);

  const actor = restoreTarget(target, entry, { isActor: x => x instanceof Actor, actors: game.actors });
  if (!actor) return ui.notifications.error(`Drop bin: cannot find an actor to restore #${n} onto.`);

  const obj = foundry.utils.duplicate(entry.item);
  delete obj._id;
  const [made] = await actor.createEmbeddedDocuments("Item", [obj], { [MODULE]: { restoring: true } });
  ui.notifications.info(`Restored ${made.name} to ${actor.name} (drop bin #${n}).`);
  return made;
}

async function exportMirror() {
  if (!game.user.isGM) return false;
  const ok = await writeMirror(readLog());
  ui.notifications.info(ok ? `Drop bin written to ${DIR}/${FILE}` : "Drop bin mirror failed — see console.");
  return ok;
}

async function clear() {
  if (!game.user.isGM) return false;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: "Clear the drop bin?" },
    content: `<p>This wipes <strong>${readLog().length}</strong> ledger entries. The JSON mirror is overwritten too.</p>`
  }).catch(() => false);
  if (!confirmed) return false;
  await clearLog();
  await writeMirror([]);
  return true;
}

/* --------------------------------------------------------------- lifecycle */

/**
 * socketlib.ready → register the relay; ready → the capture hooks, then the entry's publish
 * (one ready handler, as before the migration).
 */
export function install(reg, ctx) {
  ctx.expose({ ledger: { all, list, get, search, restore, export: exportMirror, clear } });
  if (globalThis.game?.ready && globalThis.socketlib) {
    // a hot re-import after ready: socketlib.ready has fired already (socketlib hands back the
    // module's existing socket)
    try { registerRecord(recordAsGM); } catch (err) { ctx.log.warn("hot patch: the ledger relay was not re-registered", err); }
  } else {
    reg.once("socketlib.ready", () => {
      registerRecord(recordAsGM);
    }, { guard: false, label: "socketlib.ready" });
  }
  ctx.onReady(() => {
    registerCapture(reg);
    ctx.publish();
  }, "ledger ready");
}

export function uninstall() {
  resetSocket();
}
