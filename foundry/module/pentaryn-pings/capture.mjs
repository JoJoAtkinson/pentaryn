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
 *      at. Adjustments row `core-pings-user-activity-socket`.
 *
 * The two overlap, so a record repeating the last one (user, scene, rounded point) inside
 * DEDUPE_MS is dropped. Records go to an in-memory buffer; a burst costs one world-setting write,
 * FLUSH_MS after its first ping. Only a GM writes: world settings are not player-writable.
 */

import { DEDUPE_MS, FLUSH_MS, MODULE, appendCapped, capLimit, isDuplicate } from "./pings-core.mjs";
import { maxSetting, readLog, writeLog } from "./settings.mjs";
import { isAnyGM } from "./lib/election.mjs";
import { unwrapAll, wrapMethod } from "./lib/patch.mjs";

/** Session state. `buffer` mirrors the store, so a burst of pings costs one write, not five. */
let log = null;
let buffer = null;
let flushTimer = null;
let listener = null;

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!isAnyGM() || !buffer) return;
    try {
      await writeLog(buffer);
    } catch (err) {
      log.warn("could not persist the log", err);
    }
  }, FLUSH_MS);
}

/**
 * Record one ping. Silently ignores anything malformed — a dropped ping is a missing convenience,
 * but a throw here would land inside Foundry's own socket handler. Both call sites catch.
 */
export function record(userId, sceneId, x, y) {
  if (!isAnyGM()) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  buffer ??= readLog({ log });

  const px = Math.round(x);
  const py = Math.round(y);
  const t = Date.now();

  // de-dupe: the same ping can arrive via both capture paths
  if (isDuplicate(buffer[buffer.length - 1], { userId, sceneId, x: px, y: py }, t, DEDUPE_MS)) return;

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
  buffer = appendCapped(buffer, rec, capLimit(maxSetting()));

  scheduleFlush();
}

/** Empty the buffer and the store. A flush already due then writes the emptied buffer. */
export async function clear() {
  buffer = [];
  await writeLog([]);
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
  if (Layer.prototype.handlePing.__pentarynPatched) return true;

  wrapMethod(MODULE, {
    target: Layer.prototype,
    name: "handlePing",
    marker: "__pentarynPatched",
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
 * Undo start(): unwrap handlePing (this module's kit copy holds only that patch), stop listening on
 * userActivity, drop the buffer and a pending flush (pings not yet written, ≤ FLUSH_MS, are lost).
 */
export function uninstall() {
  unwrapAll();
  if (listener) game.socket?.off?.("userActivity", listener);
  listener = null;
  clearTimeout(flushTimer);
  flushTimer = null;
  buffer = null;
}

/** ready, GM clients: read the store into the buffer, wrap handlePing, listen on userActivity. */
export function start() {
  buffer = readLog({ log });
  patchControlsLayer();

  // pings from clients on scenes this GM is not currently viewing
  if (listener) return;
  listener = (userId, data) => {
    try {
      if (!data?.ping) return;
      record(userId, data.sceneId ?? canvas?.scene?.id, data.ping.x, data.ping.y);
    } catch (err) {
      log.warn("socket ping capture failed", err);
    }
  };
  game.socket.on("userActivity", listener);
}
