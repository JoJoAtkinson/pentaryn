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

import { MODULE, decorate as decorateRecord, imageOffset, recentOf } from "./pings-core.mjs";
import { readLog, registerSettings } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import * as capture from "./capture.mjs";

const log = makeLog(MODULE);

const nowMs = () => Date.now();
const readSetting = () => readLog({ log });

/** The plain scene fields core's imageOffset/decorate need; an unknown scene → no offset, grid 100. */
function sceneInfo(sceneId) {
  const scene = game.scenes.get(sceneId);
  const gridSize = scene?.grid?.size;
  return {
    offset: imageOffset(scene ? { width: scene.width, height: scene.height, padding: scene.padding, gridSize } : null),
    gridSize,
  };
}

function decorate(rec) {
  if (!rec) return null;
  return decorateRecord(rec, sceneInfo(rec.sceneId), nowMs());
}

Hooks.once("init", () => {
  registerSettings();
});

Hooks.once("ready", () => {
  if (!game.user.isGM) return;

  capture.start({ log });

  const api = {
    last: () => decorate(readSetting().at(-1)),
    recent: (n = 10) => recentOf(readSetting(), n).map(decorate),
    all: () => readSetting().map(decorate),
    clear: () => capture.clear()
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
