/**
 * Pentaryn Ping Log
 * =================
 *
 * Foundry keeps no ping history. A ping is a transient socket message: it draws
 * an animation on whoever is looking at that scene and then it is gone. Nothing
 * is written anywhere, so "where did I just point?" is unanswerable a second
 * later — and completely unanswerable to a tool that only ever sees the world
 * through short-lived scripted calls.
 *
 * This module writes them down.
 *
 *   game.pentaryn.pings.last()        the most recent ping
 *   game.pentaryn.pings.recent(n)     the last n, newest first (default 10)
 *   game.pentaryn.pings.all()         the whole buffer, oldest first
 *   game.pentaryn.pings.clear()       empty it
 *
 * Each record is `{ t, userId, userName, sceneId, sceneName, x, y }` where
 * `x`/`y` are **canvas** coordinates — the same space token `x`/`y` live in, so
 * a record drops straight into a token create. Canvas space includes the
 * scene's padding, so it is NOT the same as a pixel offset into the background
 * image; subtract the padding offset for that (see `imageOffset` below).
 *
 * Two capture paths, because neither alone is enough:
 *
 *   1. `ControlsLayer#handlePing` — fires for every ping *drawn on this client*,
 *      which covers the GM's own pings and other users' pings on the scene the
 *      GM is currently viewing. Patched on the **prototype**, not the instance:
 *      canvas layers are rebuilt on every scene change, so an instance patch
 *      would silently fall off the first time the GM changed scene.
 *
 *   2. `userActivity` on the socket — covers pings from other clients on scenes
 *      the GM is *not* looking at. Without this, a player pinging the map you
 *      are not currently on records nothing.
 *
 * The two overlap, so records are de-duplicated on (user, scene, position)
 * inside a short window.
 *
 * Only a GM writes. World settings are not player-writable, and a player client
 * attempting the write would throw on every ping.
 */

const MODULE = "pentaryn-pings";
const LOG = "log";
const MAX = "max";
const DEDUPE_MS = 400;

/** In-memory mirror, so a burst of pings costs one database write, not five. */
let buffer = null;
let flushTimer = null;

const nowMs = () => Date.now();

function readSetting() {
  try {
    const v = game.settings.get(MODULE, LOG);
    return Array.isArray(v) ? v : [];
  } catch (err) {
    console.warn(`${MODULE} | could not read the log`, err);
    return [];
  }
}

function cap() {
  const n = Number(game.settings.get(MODULE, MAX));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 500) : 50;
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (!game.user.isGM || !buffer) return;
    try {
      await game.settings.set(MODULE, LOG, buffer);
    } catch (err) {
      console.warn(`${MODULE} | could not persist the log`, err);
    }
  }, 250);
}

/**
 * Record one ping. Silently ignores anything malformed — a dropped ping is a
 * missing convenience, but a throw here would land inside Foundry's own socket
 * handler and take other listeners down with it.
 */
function record(userId, sceneId, x, y) {
  if (!game.user?.isGM) return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;

  buffer ??= readSetting();

  const px = Math.round(x);
  const py = Math.round(y);
  const t = nowMs();

  // de-dupe: the same ping can arrive via both capture paths
  const recent = buffer[buffer.length - 1];
  if (
    recent &&
    recent.userId === userId &&
    recent.sceneId === sceneId &&
    recent.x === px &&
    recent.y === py &&
    t - recent.t < DEDUPE_MS
  ) {
    return;
  }

  const scene = game.scenes.get(sceneId);
  buffer.push({
    t,
    userId,
    userName: game.users.get(userId)?.name ?? userId,
    sceneId,
    sceneName: scene?.name ?? null,
    x: px,
    y: py
  });

  const limit = cap();
  if (buffer.length > limit) buffer = buffer.slice(-limit);

  scheduleFlush();
}

/**
 * The scene padding offset — canvas coordinates minus this gives a pixel offset
 * into the background image. Foundry rounds the padding up to a whole grid
 * square, which is why this is not simply `width * padding`.
 */
function imageOffset(scene) {
  if (!scene) return { x: 0, y: 0 };
  const g = scene.grid?.size ?? 100;
  return {
    x: Math.ceil((scene.width * scene.padding) / g) * g,
    y: Math.ceil((scene.height * scene.padding) / g) * g
  };
}

function decorate(rec) {
  if (!rec) return null;
  const scene = game.scenes.get(rec.sceneId);
  const off = imageOffset(scene);
  const g = scene?.grid?.size ?? 100;
  return {
    ...rec,
    canvas: { x: rec.x, y: rec.y },
    image: { x: rec.x - off.x, y: rec.y - off.y },
    gridSquare: {
      i: Math.floor((rec.x - off.x) / g),
      j: Math.floor((rec.y - off.y) / g)
    },
    /** Top-left of the grid square, i.e. what a snapped token's x/y would be. */
    snapped: { x: Math.floor(rec.x / g) * g, y: Math.floor(rec.y / g) * g },
    age: `${Math.round((nowMs() - rec.t) / 1000)}s ago`
  };
}

function patchControlsLayer() {
  const Layer =
    foundry?.canvas?.layers?.ControlsLayer ??
    globalThis.ControlsLayer ??
    CONFIG?.Canvas?.layers?.controls?.layerClass;

  if (!Layer?.prototype?.handlePing) {
    console.warn(`${MODULE} | no ControlsLayer#handlePing to patch — local pings will rely on the socket path only`);
    return false;
  }
  if (Layer.prototype.handlePing.__pentarynPatched) return true;

  const original = Layer.prototype.handlePing;
  function patched(user, position, options = {}) {
    try {
      const sceneId = options?.scene ?? canvas?.scene?.id;
      record(user?.id ?? game.user.id, sceneId, position?.x, position?.y);
    } catch (err) {
      console.warn(`${MODULE} | ping capture failed`, err);
    }
    return original.call(this, user, position, options);
  }
  patched.__pentarynPatched = true;
  Layer.prototype.handlePing = patched;
  return true;
}

Hooks.once("init", () => {
  game.settings.register(MODULE, LOG, {
    name: "Ping log",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(MODULE, MAX, {
    name: "Pings to keep",
    hint: "How many of the most recent pings to remember. Older ones fall off the end.",
    scope: "world",
    config: true,
    type: Number,
    default: 50
  });
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  buffer = readSetting();
  patchControlsLayer();

  // pings from clients on scenes this GM is not currently viewing
  game.socket.on("userActivity", (userId, data) => {
    try {
      if (!data?.ping) return;
      record(userId, data.sceneId ?? canvas?.scene?.id, data.ping.x, data.ping.y);
    } catch (err) {
      console.warn(`${MODULE} | socket ping capture failed`, err);
    }
  });

  const api = {
    last: () => decorate(readSetting().at(-1)),
    recent: (n = 10) => readSetting().slice(-n).reverse().map(decorate),
    all: () => readSetting().map(decorate),
    clear: async () => {
      buffer = [];
      await game.settings.set(MODULE, LOG, []);
      return true;
    }
  };

  // `game.pentaryn` may already exist and may be frozen by another module.
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, pings: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.pings = api;
  }

  console.log(`${MODULE} | ready — ${readSetting().length} ping(s) on record`);
});
