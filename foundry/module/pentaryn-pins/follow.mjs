/**
 * Pentaryn Pins — FEATURE: a pinned player's client shows the scene their pinned token is on.
 *
 * Runs on the PLAYER's own client. Two core patches, installed at `setup` (before Game#initializeCanvas
 * draws anything), plus one view queue (plan §3 "Client mechanism"):
 *
 *   pins-scene-view      Scene#view: every way a client changes scene (login draw, activation, pulls,
 *                        nav clicks, resume, TeleportToken, portals' teleportParty) ends here. A view
 *                        of another scene is redirected to the token's; while the canvas is loading
 *                        nothing reaches core (no "cannot switch Scenes" toast): the scene already
 *                        being drawn is dropped silently, anything else waits in the queue.
 *   pins-scene-activate  Scene#_onActivate: activating another scene, or deactivating the token's
 *                        scene while it is viewed, does nothing for a pinned player.
 *
 * A pinned player follows the token's scene AND level; only a level of that scene the player picked
 * themselves passes as asked. A view is NOT the player's choice while core's `pullToScene` socket
 * handler runs (marked by an `onAny` socket listener, which socket.io-client calls before the
 * event's own listeners), while `_onActivate` runs, before `ready` (the login draw), and for core's
 * own view of the initial level after the viewed level is deleted (a `deleteLevel` mark).
 *
 * With the switch off, for a GM, an unpinned user or a pin with no single token, both wrappers call
 * core with the same `this` and arguments: stock, byte for byte.
 *
 * The queue: every view pins starts goes through `request`, never straight to Scene#view; `settle`
 * polls canvas.loading and recomputes the target fresh once it clears. Nothing here calls `view`
 * from inside `canvasReady` (that hook runs while canvas.loading is still true).
 */

import { FLAG_SCOPE, MODULE, PIN_FLAG, SETTLE_GIVE_UP_MS, SETTLE_MS, TOAST_EVERY_MS,
  activateDecision, followNeeded, queueDecision, viewDecision } from "./pins-core.mjs";
import { pinOfUser, resolvePin, rootOfToken } from "./world-adapter.mjs";
import { onPinningChange } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { libWrapperRoute } from "./lib/patch-libwrapper.mjs";

let C = null;
/** The `{ scene, level }` of the draw the view wrapper last let through, until that draw resolves. */
let inflight = null;
let settleTimer = null;
/** When the current wait began (0: no wait); one wait spans every re-defer until it settles or gives up. */
let settleSince = 0;
let settleReason = "reconcile";
let lastToast = -Infinity;
/** > 0 while a view runs that the player did not ask for (a GM pull, an activation). */
let imposed = 0;
/** Never below 0: an uninstall may reset `imposed` while a mark is still open. */
const endImposed = () => { imposed = Math.max(0, imposed - 1); };
/** The `{ scene, level }` the player last chose that is not the token's level, else null. */
let choice = null;
/**
 * The id of the scene whose viewed level was just deleted, else null. Core's Level._onDeleteOperation
 * then views that scene's initial level itself (level.mjs: `scene.view({ level: initialLevel.id })`);
 * that one view is not the player's choice (code review L4). Consumed by that view, cleared at canvasReady.
 */
let fallbackScene = null;
/** Session map: root actor id → uuid of its token created last (the transient two-token state of a move). */
const latest = new Map();
const handles = [];
let unsubscribe = null;
let socketListener = null;

const enabled = () => C?.setting("pinning") === true;
const isGM = () => !!game.user?.isGM;
const viewed = () => ({ scene: canvas?.scene?.id ?? null, level: canvas?.level?.id ?? null });
const wantOf = t => ({ scene: t.scene, level: t.level ?? null });

/**
 * View options for a view pins aims at the target. When they name `controlledTokens` (the default:
 * a view pins starts itself), those become the pinned token when this user owns it, else are left
 * out. Ids from an asked view stand on another scene or level (core controls nothing and never
 * pans), and `[]` skips core's fallback to the character, an owned token or an observed one to pan
 * to (board.mjs #initializeTokenControl; code review E2/B4). Asked options without them keep core's
 * fallback, as stock.
 */
function followOptions(t, options = { controlledTokens: null }) {
  const opts = { ...options };
  if (!("controlledTokens" in opts)) return opts;
  delete opts.controlledTokens;
  const doc = t.token.doc;
  const owned = doc?.isOwner === true || doc?.actor?.testUserPermission?.(game.user, "OWNER") === true;
  if (owned) opts.controlledTokens = [doc.id];
  return opts;
}

/**
 * The token's level when its scene has it, else null. An orphan level (an id the scene no longer
 * has: a carry from before portals 0.6.0, a deleted level) is followed by scene only: core draws
 * the scene's initial level for an unknown id (board.mjs `levels.get(level) ?? initial`), so
 * asking for it would redraw on every canvasReady, forever (code review B1).
 */
function levelOn(sceneId, level) {
  if (!level) return null;
  const levels = game.scenes.get(sceneId)?.levels;
  if (typeof levels?.has !== "function") return level;
  return levels.has(level) ? level : null;
}

/** This client's pin target `{ scene, level, token, root }`, or null (off, a GM, no pin, no single token). */
function target() {
  if (!enabled() || isGM()) return null;
  const root = pinOfUser(game.user);
  if (!root) return null;
  const { token } = resolvePin(game.user, { latestUuid: latest.get(root) ?? null, viewedSceneId: canvas?.scene?.id ?? null });
  return token ? { scene: token.scene, level: levelOn(token.scene, token.level), token, root } : null;
}

/** Safe target lookup for the patches: a failure logs and behaves as stock. */
function safeTarget(where) {
  try {
    return target();
  } catch (err) {
    C?.log.warn(`${where}: pin lookup failed, behaving as stock`, err);
    return null;
  }
}

/** "Your view follows {actor}" — after ready only, at most once per TOAST_EVERY_MS. */
function toastFollow(t) {
  if (!game.ready) return;
  const now = Date.now();
  if (now - lastToast < TOAST_EVERY_MS) return;
  lastToast = now;
  const actor = t.token.form ?? game.actors.get(t.root)?.name ?? "";
  C.log.notify("info", _loc("PENTARYN_PINS.Notify.Follows", { actor }));
}

/**
 * The one way pins starts a view: to target `t`'s scene and level, always with followOptions(t), so
 * core controls and pans to the pinned token, never its fallback (game.user.character, or the first
 * owned token on the level: a familiar). Pins moving the view ends any level the player chose.
 */
function request(t, reason) {
  choice = null;
  const want = wantOf(t);
  const d = queueDecision({ loading: !!canvas?.loading, inflight, viewed: viewed(), want });
  if (d === "none") return null;
  if (d === "defer") {
    settle(reason);
    return null;
  }
  const scene = game.scenes.get(want.scene);
  if (!scene) return null;
  const opts = followOptions(t);
  if (want.level) opts.level = want.level;
  C.emit("followed", { scene: want.scene, level: want.level ?? null, reason });
  return Promise.resolve(scene.view(opts)).catch(err => C.log.error("view failed", err));
}

/**
 * Hold the target until canvas.loading clears, then view it — recomputed fresh, never the stale
 * want. One wait runs from its first defer until it settles: a re-defer (the view it waits behind
 * has not resolved) keeps the start, so the give-up always fires (code review 2026-10-17 #7).
 */
function settle(reason = "reconcile") {
  settleReason = reason;
  if (settleTimer) return;
  if (!settleSince) settleSince = Date.now();
  settleTimer = setTimeout(tick, SETTLE_MS);
}

function tick() {
  settleTimer = null;
  if (Date.now() - settleSince >= SETTLE_GIVE_UP_MS) {
    settleSince = 0;
    C.log.warn("the view queue is still waiting after 120 s; giving up until the next canvasReady");
    return;
  }
  if (canvas?.loading) {
    settleTimer = setTimeout(tick, SETTLE_MS);
    return;
  }
  const t = safeTarget("the view queue");
  if (t && followNeeded({ target: t, viewed: viewed(), choice })) request(t, settleReason);
  if (!settleTimer) settleSince = 0;   // settled: nothing re-deferred
}

/**
 * canvasReady / ready: the view is not on the token's scene and level (and the level is not one the
 * player chose) → settle (never a view from inside the hook). A level the token moves to is also
 * followed by `updateToken: follow`.
 */
function reconcile(reason) {
  const t = safeTarget(reason);
  if (!followNeeded({ target: t, viewed: viewed(), choice })) return;
  settle(reason);
}

/* ── the patches ───────────────────────────────────────────────────────── */

function onView(scene, wrapped, args) {
  const t = safeTarget("Scene#view");
  const options = args[0] ?? {};
  const fallback = fallbackScene !== null && fallbackScene === scene.id;
  if (fallback) fallbackScene = null;
  const chosen = !!game.ready && imposed === 0 && !fallback;
  const d = viewDecision({ enabled: enabled(), isGM: isGM(), target: t, sceneId: scene.id, level: options.level ?? null, chosen });
  if (d.action === "stock") return wrapped(...args);
  const want = { scene: d.scene, level: d.level };
  const reason = game.ready ? "pull" : "login";
  if (canvas?.loading || inflight) {
    // a draw is under way (or let through and not yet loading): never reach core (its guard toasts,
    // or it would queue a second draw); the same draw → drop, else queue
    if (queueDecision({ loading: !!canvas?.loading, inflight, viewed: viewed(), want }) === "defer") settle(reason);
    return Promise.resolve(scene);
  }
  if (d.action === "redirect") {
    const dest = game.scenes.get(d.scene);
    if (!dest) return wrapped(...args);
    toastFollow(t);
    C.emit("followed", { scene: d.scene, level: d.level, reason });
    const opts = followOptions(t, options);
    if (d.level) opts.level = d.level;
    else delete opts.level;
    return dest.view(opts, ...args.slice(1));
  }
  // another level than asked: the asked controlledTokens stand on the asked level, so control the token
  const relevelled = !!d.level && d.level !== (options.level ?? null);
  const opts = relevelled ? followOptions(t, options) : { ...options };
  if (d.level) opts.level = d.level;
  choice = chosen && d.level && d.level !== t.level ? want : null;
  inflight = want;
  return (async () => {
    try {
      return await wrapped(opts, ...args.slice(1));
    } finally {
      if (inflight === want) inflight = null;
    }
  })();
}

function onActivate(scene, wrapped, args) {
  const t = safeTarget("Scene#_onActivate");
  const d = activateDecision({ enabled: enabled(), isGM: isGM(), target: t, active: !!args[0], sceneId: scene.id, viewedId: canvas?.scene?.id ?? null });
  if (d === "skip") return undefined;
  imposed++;   // core's _onActivate calls this.view(viewOptions) synchronously: not the player's choice
  try {
    return wrapped(...args);
  } finally {
    endImposed();
  }
}

/**
 * Mark a GM pull. socket.io-client calls `onAny` listeners before the event's own (socket.js
 * emitEvent), so this runs just before core's Scenes.#pullToScene calls `scene.view(viewOptions)`
 * synchronously, whenever either was registered; the mark ends at the next microtask.
 */
function installSocket(ctx) {
  const socket = globalThis.game?.socket;
  if (typeof socket?.onAny !== "function") {
    // every Foundry v14 client has it (socket.io-client 4); a stub without it just loses the pull mark
    ctx.log.debug("game.socket.onAny not found; a GM pull to another level of the token's scene passes as asked");
    return;
  }
  socketListener = event => {
    if (event !== "pullToScene") return;
    imposed++;
    queueMicrotask(endImposed);
  };
  socket.onAny(socketListener);
}

function installPatches(ctx) {
  const proto = globalThis.CONFIG?.Scene?.documentClass?.prototype;
  if (!proto) {
    ctx.log.warn("CONFIG.Scene.documentClass not found; pinned views cannot follow their token");
    return;
  }
  const via = libWrapperRoute({ log: ctx.log });
  handles.push(wrapMethod(MODULE, {
    target: proto, name: "view", label: "Scene#view",
    path: "CONFIG.Scene.documentClass.prototype.view", type: "MIXED",
    marker: "__pentarynPinsView", adjustments: "pins-scene-view",
  }, function (wrapped, ...args) {
    return onView(this, wrapped, args);
  }, { via, log: ctx.log }));
  handles.push(wrapMethod(MODULE, {
    target: proto, name: "_onActivate", label: "Scene#_onActivate",
    path: "CONFIG.Scene.documentClass.prototype._onActivate", type: "MIXED",
    marker: "__pentarynPinsActivate", adjustments: "pins-scene-activate",
  }, function (wrapped, ...args) {
    return onActivate(this, wrapped, args);
  }, { via, log: ctx.log }));
}

/* ── follow hooks (player client) ──────────────────────────────────────── */

/** My pin's root, when the switch is on and I am a player; else null. */
function myRoot() {
  if (!enabled() || isGM()) return null;
  return pinOfUser(game.user);
}

/** The same token id, with the same root, on another scene: `doc` is a hop's arrival. */
function hopOf(doc, root) {
  const scenes = game.scenes?.contents ?? [...(game.scenes?.values?.() ?? [])];
  for (const s of scenes) {
    if (s.id === doc.parent?.id) continue;
    const other = s.tokens?.get?.(doc.id);
    if (other && rootOfToken(other) === root) return true;
  }
  return false;
}

/**
 * The pinned token was moved by someone else: core's Token#panCanvas pans when its centre is
 * off-screen (sidebar padding, hex centres). A controlled token is panned by core itself
 * (Token#_onUpdate); a second animatePan would cancel the first (code review R2).
 */
function panIfOffScreen(doc) {
  const token = doc.object;
  if (!token || token.controlled || typeof token.panCanvas !== "function") return;
  Promise.resolve(token.panCanvas()).catch(err => C.log.debug("pan to the pinned token failed", err));
}

export function install(reg, ctx) {
  C = ctx;
  installPatches(ctx);
  installSocket(ctx);
  ctx.expose({ latestOf: root => latest.get(root) ?? null });

  // A move is followed when it COMPLETES: core's hop (create + delete with replacements, one batch)
  // and carryTo (keepId create, then a plain delete) both end in a delete. A create alone is
  // followed only when it is the character's one token: a copy, or a drag from the sidebar while
  // the original stands elsewhere, is two tokens (the audit's MANY_TOKENS), never a move.
  // A create that keeps the token's id while that id still stands on another scene is the first
  // half of a hop (carryTo, core's teleport: keepId): the new token is the latest, so a view
  // before the delete resolves to it, not to the token that is leaving (code review 2026-10-17 #8).
  reg.on("createToken", doc => {
    const root = myRoot();
    if (!root || rootOfToken(doc) !== root) return;
    if (hopOf(doc, root)) latest.set(root, doc.uuid);
    const t = target();
    if (!t || t.token.uuid !== doc.uuid) return;
    request(t, "move");
  }, { label: "createToken: follow" });

  reg.on("deleteToken", (doc, options) => {
    const root = myRoot();
    if (!root || rootOfToken(doc) !== root) return;
    if (latest.get(root) === doc.uuid) latest.delete(root);
    const repl = options?.replacements?.[doc.id];
    const dest = repl ? fromUuidSync(repl) : null;
    if (dest?.parent && rootOfToken(dest) === root) latest.set(root, dest.uuid);
    // recomputed after the delete: the token left (the replacement, the carried copy, or the one
    // the GM kept); none left → stay (stock). Scene AND level: a move within the scene is a copy
    // on another level and the original deleted (code review A1-3). A move ends any level the
    // player chose; a GM tidying a duplicate does not.
    const t = target();
    if (!t) return;
    const moved = t.token.uuid === dest?.uuid || t.token.id === doc.id;
    if (!followNeeded({ target: t, viewed: viewed(), choice: moved ? null : choice })) return;
    request(t, moved ? "move" : "reconcile");
  }, { label: "deleteToken: follow" });

  reg.on("updateToken", (doc, changes, _options, userId) => {
    if (!changes) return;
    // a plain move pans only when someone else moved a token on the viewed scene: every other move
    // (the player's own walk above all) returns before the world walk below (code review F1)
    const moved = ("x" in changes || "y" in changes) && userId !== game.user?.id && doc.parent?.id === canvas?.scene?.id
      && !!doc.object && !doc.object.controlled;
    if (!("level" in changes || "actorId" in changes || moved)) return;
    const root = myRoot();
    if (!root || rootOfToken(doc) !== root) return;
    const t = target();
    if (!t) return;
    if ("actorId" in changes) return void request(t, "reconcile");   // a transform or a revert
    if (t.token.uuid !== doc.uuid) return;
    if ("level" in changes) return void request(t, "move");   // t.level: the token's, unless orphaned (B1)
    if (moved) panIfOffScreen(doc);
  }, { label: "updateToken: follow" });

  reg.on("updateUser", (user, changes) => {
    const mine = changes?.flags?.[FLAG_SCOPE];
    if (!mine || !(PIN_FLAG in mine || `-=${PIN_FLAG}` in mine)) return;
    if (user?.id !== game.user?.id) return;
    const t = target();
    if (t) request(t, "reconcile");
  }, { label: "updateUser: pin changed" });

  // The viewed level is deleted: a level the player chose there is gone, and core's fallback view of
  // the scene's initial level that follows (after this hook, in _onDeleteOperation) is imposed (L4).
  reg.on("deleteLevel", level => {
    const sceneId = level?.parent?.id ?? null;
    if (!sceneId || !myRoot()) return;
    if (choice?.scene === sceneId && choice.level === level.id) choice = null;
    if (sceneId === canvas?.scene?.id && level.id === (canvas?.level?.id ?? null)) fallbackScene = sceneId;
  }, { label: "deleteLevel: core's fallback view" });

  reg.on("canvasReady", () => {
    fallbackScene = null;   // core viewed no level (a scene with none left: unview), or the view ran
    reconcile("reconcile");   // never returns false: canvasReady is Hooks.call and others listen after
  }, { label: "canvasReady: reconcile" });

  reg.on("ready", () => reconcile("login"), { label: "ready: reconcile" });

  unsubscribe = onPinningChange(value => {
    if (!value) return;   // switched off: nobody moves
    const t = target();
    if (t) request(t, "switch");
  });
}

export function uninstall() {
  for (const h of handles.splice(0)) h.unwrap();
  if (socketListener) globalThis.game?.socket?.offAny?.(socketListener);
  socketListener = null;
  if (settleTimer) clearTimeout(settleTimer);
  settleTimer = null;
  settleSince = 0;
  unsubscribe?.();
  unsubscribe = null;
  inflight = null;
  choice = null;
  fallbackScene = null;
  imposed = 0;
  latest.clear();
  lastToast = -Infinity;
}
