/**
 * Pentaryn Pins — FEATURE: a pinned player's client shows the scene their pinned token is on.
 *
 * Runs on the PLAYER's own client. Since 0.2.0 a token's move reaches the player the way core moves
 * anyone: whoever moves it pulls them (Scene#pullUsers → core's "pullToScene" → Scene#view:
 * portals teleportToken, core's Teleport Token region, the GM's own pulls), and pentaryn-resume picks
 * the scene at login. Pins only fills the gaps (rebuild plan context/plans/pin-2026-10-rebuild.md §5):
 *
 *   pins-scene-activate  Scene#_onActivate, the one patch (installed at setup): activating another
 *                        scene, or deactivating the token's scene while it is viewed, does nothing;
 *                        activating the token's scene while the player looks elsewhere views the
 *                        token's level with the token controlled (§5.4).
 *   deleteToken          a safety net (§5.1): NET_GRACE_MS after a delete of the pinned token on the
 *                        viewed scene, if nobody pulled the player to where it went (a GM cut-and-paste),
 *                        view it. A loading canvas is waited out, never given up on.
 *   moveToken            a level gap-filler (§5.2): the token moved to another level of the viewed
 *                        scene and core's own level switch will not follow (a sighted pet left behind).
 *   "pullToScene"        a second listener on core's socket event (§5.3), attached at "ready" after
 *                        core's own: a pull that lands while the canvas is loading (core drops it with
 *                        a toast) is viewed, as sent, once it clears; a newer pull drops the held one.
 *
 * Nothing here remembers a player's choice: a nav click on another scene is never redirected. With
 * the switch off, for a GM, an unpinned user or a pin with no single token, the wrapper calls core
 * with the same `this` and arguments and every listener returns at once.
 */

import { MODULE, NET_GRACE_MS, NET_POLL_MS, activateDecision, coreSwitchesLevel, levelFollow, netDecision,
  replayDecision } from "./pins-core.mjs";
import { levelOn, pinOfUser, resolvePin, rootOfToken, tokenPermits } from "./world-adapter.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { ownsOtherSighted } from "./lib/pull-rule.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";

let C = null;
const handles = [];
/** The poll timers whenSettled started (uninstall clears them). */
const timers = new Set();
/** The safety net's one timer: the grace window, then a poll while loading. */
let netTimer = null;
/** The deleted token's level when the net's window opened (code review CR5): what the net last saw. */
let netSeenLevel = null;
/** The latest pull core dropped while loading, `{ sceneId, viewOptions }`, until it is replayed. */
let pendingPull = null;
/** A replay poll is running (it reads whatever `pendingPull` holds when loading clears). */
let replayArmed = false;
let pullListener = null;

const enabled = () => C?.setting("pinning") === true;
const isGM = () => !!game.user?.isGM;
const viewed = () => ({ scene: canvas?.scene?.id ?? null, level: canvas?.level?.id ?? null });

/** `controlledTokens: [the pinned token]` when this user owns it, else nothing (core's fallback pans). */
function followOptions(t) {
  return tokenPermits(t.token.doc, game.user, "OWNER") ? { controlledTokens: [t.token.id] } : {};
}

/** This client's pin target `{ scene, level, token }`, or null (off, a GM, no pin, no single token). */
function target() {
  if (!enabled() || isGM()) return null;
  const { token } = resolvePin(game.user, { viewedSceneId: canvas?.scene?.id ?? null });
  return token ? { scene: token.scene, level: levelOn(token.scene, token.level), token } : null;
}

/** Safe target lookup: a failure logs and behaves as stock. */
function safeTarget(where) {
  try {
    return target();
  } catch (err) {
    C?.log.warn(`${where}: pin lookup failed, behaving as stock`, err);
    return null;
  }
}

/** My pin's root, when the switch is on and I am a player; else null. */
function myRoot() {
  if (!enabled() || isGM()) return null;
  return pinOfUser(game.user);
}

/** Run `fn`, logging a throw (timers and socket listeners have no hook guard around them). */
function guarded(fn, where) {
  try {
    fn();
  } catch (err) {
    C?.log.error(`${where} failed`, err);
  }
}

/** View `sceneId` with `options`, emitting `followed`. */
function viewTo(sceneId, options, reason) {
  const scene = game.scenes.get(sceneId);
  if (!scene) return;
  C.emit("followed", { scene: sceneId, level: options?.level ?? null, reason });
  Promise.resolve(scene.view(options)).catch(err => C.log.error("view failed", err));
}

/** Run `fn` now when the canvas is not loading, else once it stops (poll every NET_POLL_MS, no cap). */
function whenSettled(fn, where) {
  if (!canvas?.loading) return guarded(fn, where);
  const h = setTimeout(() => {
    timers.delete(h);
    whenSettled(fn, where);
  }, NET_POLL_MS);
  timers.add(h);
}

/* ── §5.4 the patch ────────────────────────────────────────────────────── */

function onActivate(scene, wrapped, args) {
  const t = safeTarget("Scene#_onActivate");
  const [active, operation] = args;
  const viewedId = canvas?.scene?.id ?? null;
  const d = activateDecision({ enabled: enabled(), isGM: isGM(), target: t, active: !!active, sceneId: scene.id, viewedId });
  if (d === "skip") return undefined;
  // the token's own scene while the player looks elsewhere: core would draw _determineInitialLevel's
  // floor (no level in the activation's viewOptions); draw the token's, with the token controlled
  if (t && active && scene.id === t.scene && viewedId !== scene.id) {
    const viewOptions = { ...(operation?.viewOptions ?? {}), ...followOptions(t) };
    if (t.level) viewOptions.level = t.level;
    return wrapped(active, { ...operation, viewOptions }, ...args.slice(2));
  }
  return wrapped(...args);
}

function installPatches(ctx) {
  const proto = globalThis.CONFIG?.Scene?.documentClass?.prototype;
  if (!proto) {
    ctx.log.warn("CONFIG.Scene.documentClass not found; scene activation moves pinned players as stock");
    return;
  }
  const via = libWrapperRoute({ log: ctx.log });
  handles.push(wrapMethod(MODULE, {
    target: proto, name: "_onActivate", label: "Scene#_onActivate",
    path: "CONFIG.Scene.documentClass.prototype._onActivate", type: "MIXED",
    marker: "__pentarynPinsActivate", adjustments: "pins-scene-activate",
  }, function (wrapped, ...args) {
    return onActivate(this, wrapped, args);
  }, { via, log: ctx.log }));
}

/* ── §5.1 the deleteToken safety net ───────────────────────────────────── */

function checkNet() {
  netTimer = null;
  const found = safeTarget("deleteToken: safety net");
  // the token's level did not change (a same-level delete + replace): match by scene only, so a
  // player who chose another floor of that scene keeps it (code review CR5)
  const t = found && found.level === netSeenLevel ? { ...found, level: null } : found;
  const d = netDecision({ target: t, viewed: viewed(), loading: !!canvas?.loading });
  if (d === "wait") {
    netTimer = setTimeout(() => guarded(checkNet, "the safety net"), NET_POLL_MS);   // every draw ends
    return;
  }
  if (d !== "view") return;
  const opts = followOptions(found);
  if (found.level) opts.level = found.level;
  viewTo(found.scene, opts, "cut");
}

function onDeleteToken(doc) {
  const root = myRoot();
  if (!root || rootOfToken(doc) !== root) return;
  if (doc.parent?.id !== canvas?.scene?.id) return;   // not the scene I watch (a peek): never yank
  // the first delete of a window records where the token stood before the whole shuffle
  if (netTimer === null) netSeenLevel = levelOn(doc.parent.id, doc._source?.level ?? doc.level ?? null);
  clearTimeout(netTimer);
  netTimer = setTimeout(() => guarded(checkNet, "the safety net"), NET_GRACE_MS);
}

/* ── §5.2 the moveToken level gap-filler ───────────────────────────────── */

async function onMoveToken(doc, movement, user) {
  const root = myRoot();
  const scene = doc?.parent;
  if (!root || !scene || scene.id !== canvas?.scene?.id || rootOfToken(doc) !== root) return;
  const from = movement?.origin?.level ?? null, to = movement?.destination?.level ?? null;
  if (!to || from === to) return;
  const viewedLevel = canvas.level ?? null;                  // captured now, as core does (token.mjs:2909)
  await movement.animation?.ended;                           // core's own waits (token.mjs:2915-2918)
  await canvas.initializing;
  if (!canvas.ready || !viewedLevel?.isView || canvas.scene?.id !== scene.id) return;   // core's :2929 bail
  // decided AFTER the waits, against the state core reads then (review note R7)
  const core = coreSwitchesLevel({
    viewedLevel: viewedLevel.id, origin: from,
    observes: !doc.hidden && tokenPermits(doc, game.user, "OBSERVER"),
    // core's token.mjs:2943-2944 clause, the kit's one copy (code review CR8)
    ownsOtherSighted: ownsOtherSighted(scene, game.user, { except: doc, level: viewedLevel.id }),
    selfMove: user?.isSelf === true, method: movement.method ?? null,
  });
  const t = safeTarget("moveToken: level gap");
  if (!levelFollow({ target: t, tokenUuid: doc.uuid, to, viewedLevel: canvas.level?.id ?? null, core })) return;
  whenSettled(() => {
    if (canvas.level?.id === to || canvas.scene?.id !== scene.id) return;
    viewTo(scene.id, { level: to, ...followOptions(t) }, "level");
  }, "the level gap-filler");
}

/* ── §5.3 a pull core dropped while loading is replayed ────────────────── */

function onPull(sceneId, viewOptions) {
  // every pull replaces the one held: a newer pull core honours (not loading) supersedes a dropped
  // one, which must never be replayed over it (code review CR1)
  if (!replayDecision({ pinned: !!myRoot(), loading: !!canvas?.loading })) {
    pendingPull = null;
    return;
  }
  pendingPull = { sceneId, viewOptions: viewOptions ?? {} };   // the latest wins
  if (replayArmed) return;
  replayArmed = true;
  whenSettled(() => {
    replayArmed = false;
    const p = pendingPull;
    pendingPull = null;
    if (!p || !myRoot()) return;
    viewTo(p.sceneId, p.viewOptions, "retry");               // the GM's request as sent, never pins' target
  }, "the pull replay");
}

/**
 * Attached at "ready" (review RF3), never at setup. Until then core is still buffering socket events
 * (Game#connect's prependAny); its own pullToScene handler is attached in
 * Game#activateSocketListeners (game.mjs:777, just before "ready"), which then re-emits each
 * buffered event to the listeners attached so far. A listener on the socket earlier would see those
 * pulls twice (live, during the first draw, and again in that replay) and replay one core honours.
 * From "ready" on, core's handler runs first: its Scene#view sets `loading` only after a microtask,
 * so this listener still reads the canvas as core found it.
 */
function attachPullReplay(ctx) {
  if (pullListener) return;
  if (typeof globalThis.game?.socket?.on !== "function") {
    ctx.log.debug("game.socket.on not found; a pull dropped while loading is not replayed");
    return;
  }
  pullListener = (sceneId, viewOptions) => guarded(() => onPull(sceneId, viewOptions), "the pull replay");
  game.socket.on("pullToScene", pullListener);
}

export function install(reg, ctx) {
  C = ctx;
  installPatches(ctx);
  reg.on("deleteToken", doc => onDeleteToken(doc), { label: "deleteToken: safety net" });
  reg.on("moveToken", (doc, movement, _operation, user) => onMoveToken(doc, movement, user), { label: "moveToken: level gap" });
  if (globalThis.game?.ready) attachPullReplay(ctx);              // a hot re-import after ready
  else reg.once("ready", () => attachPullReplay(ctx), { label: "ready: pull replay" });
}

export function uninstall() {
  for (const h of handles.splice(0)) h.unwrap();
  if (pullListener) globalThis.game?.socket?.off?.("pullToScene", pullListener);
  pullListener = null;
  clearTimeout(netTimer);
  netTimer = null;
  netSeenLevel = null;
  for (const h of timers) clearTimeout(h);
  timers.clear();
  pendingPull = null;
  replayArmed = false;
}
