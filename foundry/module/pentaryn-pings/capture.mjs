/**
 * Pentaryn Ping Log — the capture feature (GM clients only).
 *
 * Foundry keeps no ping history: a ping is a transient socket message that draws an animation and
 * is gone. Two capture paths, because neither alone is enough:
 *
 *   1. `ControlsLayer#handlePing` — fires for every ping *drawn on this client*: the GM's own, and
 *      other users' on the scene the GM is viewing. Wrapped on the **prototype**, not the instance:
 *      canvas layers are rebuilt on every scene change, so an instance patch would fall off the
 *      first time the GM changed scene. Adjustments row `pings-core-ping-handle`.
 *   2. core's `userActivity` socket event — pings from clients on scenes the GM is *not* looking
 *      at; the point is `data.cursor`, the scene `data.ping.scene`. Adjustments row
 *      `core-pings-user-activity-socket`.
 *
 * The two overlap, so a record repeating the last one (user, scene, rounded point) inside
 * DEDUPE_MS is dropped. Records wait in `pending`; a burst costs one world-setting write, FLUSH_MS
 * after its first ping, and a failed write is retried once. Only a GM writes: world settings are not
 * player-writable.
 *
 * Two GM tabs (pings-edge-1, [declared]): every GM tab captures and writes. A flush is a
 * read-modify-write through the kit's serialStore — this tab's pending records merged into the log
 * as stored now (core `mergePending`, which also drops the other tab's copy of the same ping) — so
 * neither tab overwrites the other. The log row's onChange tells this tab about every change; an
 * empty log is a clear (from either tab) and drops what this tab had not yet written.
 */

import { DEDUPE_MS, FLUSH_MS, MODULE, capLimit, isDuplicate, mergePending } from "./pings-core.mjs";
import { logStore, maxSetting, onLogChange, readLog } from "./settings.mjs";
import { isAnyGM } from "./lib/election.mjs";
import { wrapMethod } from "./lib/patch.mjs";

/**
 * Session state. `pending`: this tab's records since its last flush, so a burst costs one write.
 * `last`: the newest record this tab knows of (its own, or the store's after a change) — the dedupe
 * compares against it. `epoch` counts clears, so a failed flush never puts back cleared pings.
 */
let log = null;
let pending = [];
let last = null;
let epoch = 0;
let flushTimer = null;
let listener = null;
/** The handlePing patch's kit handle (pings-ext-1): uninstall() undoes this patch only. */
let handle = null;

function scheduleFlush(retry = false) {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush(retry);
  }, FLUSH_MS);
}

/**
 * Merge this tab's pending records into the stored log. A failed write keeps them and is retried
 * once, FLUSH_MS later (pings-edge-2, [declared]); a failed retry waits for the next ping's flush.
 * A flush already armed by a newer ping stands in for the retry.
 */
async function flush(retry = false) {
  if (!isAnyGM() || !pending.length) return;
  const batch = pending;
  const at = epoch;
  pending = [];
  try {
    await logStore().write(current => mergePending(current, batch, capLimit(maxSetting()), DEDUPE_MS));
  } catch (err) {
    if (at === epoch) pending = [...batch, ...pending];
    log.warn("could not persist the log", err);
    if (!retry && pending.length) scheduleFlush(true);
  }
}

/** The log row's onChange (this tab's write or another GM tab's): an empty log is a clear. */
function onStoreChange(value) {
  const list = Array.isArray(value) ? value : [];
  if (!list.length) {
    pending = [];
    epoch++;
  }
  last = pending.at(-1) ?? list.at(-1) ?? null;
}

/**
 * Record one ping. Silently ignores anything malformed — a dropped ping is a missing convenience,
 * but a throw here would land inside Foundry's own socket handler. Both call sites catch.
 */
function record(userId, sceneId, x, y) {
  if (!isAnyGM()) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  const px = Math.round(x);
  const py = Math.round(y);
  const t = Date.now();

  // de-dupe: the same ping can arrive via both capture paths
  if (isDuplicate(last, { userId, sceneId, x: px, y: py }, t, DEDUPE_MS)) return;

  const scene = game.scenes.get(sceneId);
  const rec = {
    t,
    userId,
    userName: game.users.get(userId)?.name ?? userId,
    sceneId,
    sceneName: scene?.name ?? null,
    x: px,
    y: py,
  };
  pending.push(rec);
  last = rec;

  scheduleFlush();
}

/** Drop this tab's pending records and write an empty log. A flush already due then writes nothing. */
export async function clear() {
  pending = [];
  last = null;
  epoch++;
  await logStore().write(() => []);
  return true;
}

function patchControlsLayer() {
  const Layer =
    foundry?.canvas?.layers?.ControlsLayer ??
    globalThis.ControlsLayer ??
    CONFIG?.Canvas?.layers?.controls?.layerClass;

  if (!Layer?.prototype?.handlePing) {
    log.warn("no ControlsLayer#handlePing to patch — local pings will rely on the socket path only");
    return false;
  }
  handle = wrapMethod(MODULE, {
    target: Layer.prototype,
    name: "handlePing",
    marker: "__pentarynPingsPatched",
    label: "ControlsLayer#handlePing",
    adjustments: "pings-core-ping-handle",
  }, function (wrapped, user, position, options = {}) {
    try {
      const sceneId = options?.scene ?? canvas?.scene?.id;
      record(user?.id ?? game.user.id, sceneId, position?.x, position?.y);
    } catch (err) {
      log.warn("ping capture failed", err);
    }
    return wrapped(user, position, options);
  }, { log });
  return true;
}

/** Entry body, every client: keep the module's log. Registers no hook (golden/hooks.json). */
export function install(reg, ctx) {
  log = ctx.log;
}

/**
 * Undo start(): unwrap handlePing through its own handle, stop listening on userActivity and on the
 * log row, drop the pending records and their flush (pings not yet written, ≤ FLUSH_MS, are lost).
 * When a foreign wrapper sits on top of ours the undo fails and the kit keeps the record
 * (pings-ext-1, [declared]): describe().patches still lists the live patch, and a hot re-import gets
 * that existing handle back instead of wrapping a second time.
 */
export function uninstall() {
  handle?.unwrap();
  handle = null;
  if (listener) game.socket?.off?.("userActivity", listener);
  listener = null;
  onLogChange(null);
  clearTimeout(flushTimer);
  flushTimer = null;
  pending = [];
  last = null;
}

/**
 * ready, GM clients: hear log changes, take the newest stored record, wrap handlePing, listen on
 * userActivity. A second ready without uninstall() (pings-rob-1) keeps `pending` and its flush timer:
 * the store is re-read only through onChange and the serialStore write, never copied over pending.
 */
export function start() {
  onLogChange(onStoreChange);
  last = pending.at(-1) ?? readLog({ log }).at(-1) ?? null;
  patchControlsLayer();

  // pings from clients on scenes this GM is not currently viewing. Core v14's payload is
  // {cursor: {x, y}, ping: {scene, pull, style, zoom}} (Canvas#ping); on the viewed scene core's
  // own listener has already drawn it through handlePing, and the dedupe drops this copy.
  if (listener) return;
  listener = (userId, data) => {
    try {
      if (!data?.ping) return;
      record(userId, data.ping.scene ?? canvas?.scene?.id, data.cursor?.x, data.cursor?.y);
    } catch (err) {
      log.warn("socket ping capture failed", err);
    }
  };
  game.socket.on("userActivity", listener);
}
