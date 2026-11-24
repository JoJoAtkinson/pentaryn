/**
 * Pentaryn Movement — the feature: owned-on-top and player ghost movement.
 *
 * GLUE, one feature. `install(reg, ctx)` registers every hook through the registry, in the order
 * the module has always registered them, and is called synchronously from the entry body (the
 * patches still apply at `setup`). `uninstall()` undoes the patches and clears session state;
 * the entry's `reg.offAll()` removes the hooks.
 *
 *  - Owned on top: a player's own tokens are lifted on that player's screen only, in the mesh sort
 *    (what is drawn on top) and the token layer's child order (what takes the click). The leader of a moving
 *    group drag (0.10 L2, R6) is lifted a rank above that on every screen while it walks (its move's option).
 *  - Ghost: Token#_getDragConstrainOptions and TokenLayer#_prepareKeyboardMovementUpdates are wrapped
 *    so a player's own token gets core's unconstrained-movement constrain options (ignoreWalls,
 *    ignoreCost; dnd5e's ignoreTokens) while ghost is in effect. The rules are in movement-core.
 *    An incorporeal token (a feat, or the GM's ghostInCombat flag) keeps ghosting through a fight
 *    (I1); the GM's side of that flag — the Token HUD toggle, the write, inspect — is ghost-combat.mjs.
 */

import * as core from "./movement-core.mjs";
import {
  ASSIST_KEYS, ASSIST_TOOL, CSS, GHOST_ALPHA, GM_CLIP_KEYS, GM_ICONS, GM_KEYS, GM_TOOL, MODULE, NOTIFY_BLOCKED, NOTIFY_CLEARED,
  TOOL, TOOL_CLIP_KEYS, TOOL_KEYS, VERSION
} from "./movement-core.mjs";
import { SETTINGS, policyWrite, setting, untripAssist } from "./settings.mjs";
import { combatSummaries, exemptActor, exemptTokenIds, sceneIdOf, sceneOf } from "./combat-adapter.mjs";
import { defineAccessor, wrapMethod } from "./lib/patch.mjs";

/** The ctx this feature was installed with (null when uninstalled). */
let feature = null;
/** The module's kit logger (ctx.log); every line keeps the `pentaryn-movement | ` prefix. */
let log = null;

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

const policy = () => core.normalizePolicy(setting("ghostPolicy"));
const wish = () => !!setting("ghost");

/**
 * Takes a scene id or a Scene document (rob-3); default: the viewed scene. null also means the
 * viewed scene, as it does for status({ sceneId: null }) (movement-edge-4).
 */
function combatActive(scene) {
  return core.combatOnScene(combatSummaries(), sceneIdOf(scene ?? canvas?.scene?.id));
}

/**
 * The per-token hot paths (the drag and keyboard wraps, refreshToken, the layer sort) read the
 * settings and the combats through this cache instead of once per token (finding -19). It is
 * dropped BEFORE the refresh is queued by everything that can change it: the three settings'
 * onChange, the six combat hooks and canvasReady. isGM and ownership are read live per call.
 * The once-per-refresh paths (status, the toolbar, refresh itself) keep reading live; refresh
 * reads once and shares it across its rules.
 */
let ghostContext = null;
function context() {
  return (ghostContext ??= core.buildGhostContext({
    policy: setting("ghostPolicy"), wish: setting("ghost"), ownedOnTop: setting("ownedOnTop"),
    combats: combatSummaries()
  }));
}
function invalidate() {
  ghostContext = null;
}

/**
 * Ghost in effect for this token on this client? Takes a Token placeable (the drag and keyboard
 * wraps) or a TokenDocument (rob-2); anything else is false.
 */
function ghostFor(token) {
  const doc = token?.document ?? (token?.documentName === "Token" ? token : null);
  if (!doc) return false;
  const ctx = context();
  const sceneId = doc.parent?.id;
  const isGM = game.user.isGM;
  const isOwner = !!doc.isOwner;
  // The incorporeal exception (I1) is read from the actor only when a fight here would otherwise
  // block ghost: a few item names and one flag, on the token's own actor — never a world scan.
  const blocked = ctx.policy === "exploration" && !!sceneId && ctx.combatScenes.has(sceneId);
  const exempt = blocked && ctx.wish && isOwner && !isGM && exemptActor(doc.actor);
  return core.ghostForCtx(ctx, { isGM, isOwner, sceneId, exempt });
}

/** The Scene for a scene id: the viewed one when it matches, else the world's (null if unknown). */
function sceneFor(sceneId) {
  if (!sceneId) return null;
  return canvas?.scene?.id === sceneId ? canvas.scene : sceneOf(sceneId);
}

function ownedRankOf(token) {
  return core.ownedRank({ isGM: game.user.isGM, enabled: context().ownedOnTop, isOwner: !!token?.document?.isOwner });
}

/* -------------------------------------------- */
/*  The leader drawn on top (0.10 L2, R6)       */
/* -------------------------------------------- */

/**
 * The leader of a group drag walks through its own members (Joe 2026-11-24, R6), drawn on top of them on every
 * screen while it does: its move carries `pentarynMovementLead` (its own id, with its riders' after it: update options
 * reach every client, and a batch's options are shared, so the ids say which of the batch lead), and every client lifts
 * those tokens a rank
 * above owned-on-top (core.LEAD_RANK) until its move ends. No document write: the mesh sort and the layer's click
 * order only. token id → { token, age (ms, counted by the polls) }.
 */
const LEAD_OPT = "pentarynMovementLead";
const leading = new Map();
/** How long a lead mark is kept at least (its move's animation starts after the update), and at most (ms). */
const LEAD_MIN_MS = 300;
const LEAD_MAX_MS = 60000;
const LEAD_POLL_MS = 100;
let leadTimer = null;

/** Is this token's movement still drawn walking, or between two squares of its move? */
function walkingNow(token) {
  const doc = token?.document;
  let animating = false;
  try { animating = !!token?.animationContexts?.has?.(token.movementAnimationName) || (token?.animationContexts?.size ?? 0) > 0; } catch { animating = false; }
  const st = doc?.movement?.state;
  return animating || st === "pending" || st === "paused";
}

function relift(token) {
  try { token?.renderFlags?.set?.({ refreshState: true }); } catch (err) { log?.debug?.("lead: refresh", err); }
  if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
}

/** updateToken, every client: a move naming this token its group's leader (or a rider of it) lifts it while it walks. */
function onLeadMove(doc, options) {
  const named = options?.[LEAD_OPT];
  if (!doc?.id || !(Array.isArray(named) ? named.includes(doc.id) : named === doc.id)) return;
  const token = doc.object ?? null;
  leading.set(doc.id, { token, age: 0 });
  if (token) relift(token);
  if (!leadTimer) leadTimer = setTimeout(pollLeaders, LEAD_POLL_MS);
}

/** Drop the marks of the leaders whose move has ended (and of any left past LEAD_MAX_MS; ages count the polls). */
function pollLeaders() {
  leadTimer = null;
  for (const [id, m] of [...leading]) {
    const tok = m.token;
    m.age += LEAD_POLL_MS;
    const gone = !tok || tok.destroyed || tok._destroyed;
    if (gone || m.age > LEAD_MAX_MS || (m.age >= LEAD_MIN_MS && !walkingNow(tok))) {
      leading.delete(id);
      if (!gone) relift(tok);
    }
  }
  if (leading.size) leadTimer = setTimeout(pollLeaders, LEAD_POLL_MS);
}

/** This client's rank for a token: the leader of a moving group above owned-on-top, then owned. */
function rankOf(token) {
  const id = token?.document?.id ?? token?.id;
  if (id && leading.has(id)) return core.LEAD_RANK;
  return ownedRankOf(token);
}

/** Every setting key with its scope, so a console reader never has to guess one (finding -23). */
const SETTING_SCOPES = Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.scope])));

/**
 * Everything a console reader needs to see why ghost is or isn't on, for `opts.sceneId` (default:
 * the scene this client views). The first eight keys are the historic ones; sceneId, version and
 * the settings key map are appended after them. `opts` may also be a bare scene id or a Scene, and
 * `opts.sceneId` a Scene; the returned sceneId is always the id string (rob-3).
 */
function status(opts = {}) {
  const scene = typeof opts === "string" || opts?.documentName === "Scene" ? opts : opts?.sceneId;
  const sceneId = scene == null ? (canvas?.scene?.id ?? null) : sceneIdOf(scene);
  // Not combatActive(sceneId): there null means the viewed scene, and a junk argument that
  // resolved to null here must answer no combat, not the viewed scene's (movement-edge-4).
  const combat = core.combatOnScene(combatSummaries(), sceneId);
  const p = policy();
  const combatExempt = combat && p === "exploration" && !game.user.isGM ? exemptTokenIds(sceneFor(sceneId)) : [];
  return {
    ...core.statusFrom({
      policy: p, combat, wish: wish(), isGM: game.user.isGM, exempt: combatExempt.length > 0,
      ownedOnTop: setting("ownedOnTop"), patched: { drag: dragPatched, keyboard: keyboardPatched }
    }),
    sceneId,
    version: VERSION,
    settings: SETTING_SCOPES,
    combatExempt,
  };
}

/* -------------------------------------------- */
/*  The movement hooks into core                */
/* -------------------------------------------- */

let dragPatched = false;
let keyboardPatched = false;
let dragHandle = null;
let keyboardHandle = null;

/** Wrap Token#_getDragConstrainOptions on the configured token class (dnd5e's Token5e). */
function patchDrag() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._getDragConstrainOptions !== "function") {
    log.warn("no Token#_getDragConstrainOptions; ghost drag disabled");
    return false;
  }
  dragHandle = wrapMethod(MODULE, {
    target: proto, name: "_getDragConstrainOptions", label: "Token#_getDragConstrainOptions",
    marker: "__pentarynMovement", adjustments: "movement-drag-constrain-ghost",
  }, function (wrapped, ...args) {
    const base = wrapped(...args);
    try { return ghostFor(this) ? core.constrainFor(base, true) : base; }
    catch (err) { log.warn("drag constrain skipped", err); return base; }
  });
  return true;
}

/** Wrap TokenLayer#_prepareKeyboardMovementUpdates: arrow keys ghost too. */
function patchKeyboard() {
  const proto = CONFIG.Canvas?.layers?.tokens?.layerClass?.prototype;
  if (typeof proto?._prepareKeyboardMovementUpdates !== "function") {
    log.warn("no TokenLayer#_prepareKeyboardMovementUpdates; ghost arrow keys disabled");
    return false;
  }
  keyboardHandle = wrapMethod(MODULE, {
    target: proto, name: "_prepareKeyboardMovementUpdates", label: "TokenLayer#_prepareKeyboardMovementUpdates",
    marker: "__pentarynMovement", adjustments: "movement-keyboard-constrain-ghost",
  }, function (wrapped, objects, ...rest) {
    const result = wrapped(objects, ...rest);
    try { core.ghostKeyboardMovement(result, objects, ghostFor); }
    catch (err) { log.warn("keyboard constrain skipped", err); }
    return result;
  });
  return true;
}

/** Token5e and TokenLayer5e are in CONFIG by `setup` (the system's init ran first). */
function patchAll() {
  dragPatched = patchDrag();
  keyboardPatched = patchKeyboard();
}

/* -------------------------------------------- */
/*  Owned on top + ghost look (client only)     */
/* -------------------------------------------- */

/** The token layer's interaction order, with owned tokens lifted (what takes the click). */
function sortTokenObjects() {
  const children = this.children;
  for (let i = 0; i < children.length; i++) children[i]._lastSortedIndex = i;
  const key = new Map(children.map(c => [c, {
    elevation: c.document?.elevation ?? 0, rank: rankOf(c), sort: c.document?.sort ?? 0,
    zIndex: c.zIndex ?? 0, index: c._lastSortedIndex
  }]));
  children.sort((a, b) => core.compareTokens(key.get(a), key.get(b)));
  this.sortDirty = false;
}
sortTokenObjects.__pentarynMovement = true;

/**
 * The sort is an instance property on the layer's objects container (a new container per canvas
 * draw), recorded through the kit so describe().patches lists it. Only the live container keeps
 * the record: a new draw drops the previous one, so the patch list stays one entry long. A sort
 * someone else put over ours is replaced, as it always was.
 */
let sortPatch = null; // { objects, handle }
function installLayerSort(layer = canvas?.tokens) {
  const objects = layer?.objects;
  if (!objects) return;
  if (sortPatch && (sortPatch.objects !== objects || !objects.sortChildren?.__pentarynMovement)) {
    sortPatch.handle.unwrap();
    sortPatch = null;
  }
  if (!objects.sortChildren?.__pentarynMovement) {
    const handle = defineAccessor(MODULE, objects, "sortChildren",
      { value: sortTokenObjects, writable: true, enumerable: true },
      { marker: "__pentarynMovement", adjustments: "movement-layer-sort-owned", label: "TokenLayer.objects#sortChildren" });
    sortPatch = { objects, handle };
  }
  objects.sortDirty = true;
}

/** After core's refresh: lift the mesh, and fade it while ghosting. */
function onRefreshToken(token, flags) {
  const mesh = token?.mesh;
  if (!mesh || token._destroyed) return;
  mesh.sort = core.meshSort(token.document?.sort, rankOf(token));
  if ((flags?.refreshState || flags?.refreshMesh) && ghostFor(token)) {
    mesh.alpha = token.alpha * (token.document?.alpha ?? 1) * GHOST_ALPHA;
  }
}

/** Re-run core's state refresh on every token, then our hook applies on top. */
function refreshTokens() {
  if (!canvas?.ready || !canvas.tokens) return;
  canvas.tokens.setAllRenderFlags({ refreshState: true, refreshMesh: true });
  if (canvas.tokens.objects) canvas.tokens.objects.sortDirty = true;
}

/* -------------------------------------------- */
/*  Toolbar                                     */
/* -------------------------------------------- */

function toolclip(heading, paragraphs) {
  const SC = foundry.applications.ui.SceneControls;
  return { heading, items: SC.buildToolclipItems(paragraphs.map(paragraph => ({ paragraph }))) };
}

function addTools(controls) {
  const tools = controls?.tokens?.tools;
  if (!tools) return;
  const now = liveState();

  const pt = core.playerTool({ isGM: game.user.isGM, ...now });
  if (pt.visible) {
    tools[TOOL] = {
      name: TOOL,
      order: 4.5,
      title: TOOL_KEYS[pt.state],
      icon: "fa-solid fa-ghost",
      toggle: true,
      active: pt.active,
      onChange: (_event, active) => onPlayerToggle(active),
      toolclip: toolclip(TOOL_KEYS[pt.state], [TOOL_CLIP_KEYS.what, TOOL_CLIP_KEYS[pt.state],
        ...(pt.exempt ? [TOOL_CLIP_KEYS.exempt] : []), TOOL_CLIP_KEYS.vision])
    };
  }

  const gt = core.gmTool({ isGM: game.user.isGM, policy: now.policy });
  if (gt.visible) {
    tools[GM_TOOL] = {
      name: GM_TOOL,
      order: 4.6,
      title: GM_KEYS[gt.state],
      icon: GM_ICONS[gt.state],
      toggle: true,
      active: gt.active,
      onChange: (_event, active) => onGmFlip(active),
      toolclip: toolclip(GM_KEYS[gt.state], GM_CLIP_KEYS)
    };
  }

  // The table's drag help, one click (Joe, 2026-11-22): off, everyone drags as plain Foundry does.
  if (game.user.isGM) {
    const on = setting("assist") !== false;
    tools[ASSIST_TOOL] = {
      name: ASSIST_TOOL,
      order: 4.7,
      title: on ? ASSIST_KEYS.on : ASSIST_KEYS.off,
      icon: on ? "fa-solid fa-route" : "fa-solid fa-arrows-up-down-left-right",
      toggle: true,
      active: on,
      onChange: (_event, active) => onAssistFlip(active),
      toolclip: toolclip(on ? ASSIST_KEYS.on : ASSIST_KEYS.off, [ASSIST_KEYS.clip])
    };
  }
}

/** The GM's drag-help button: writes the world setting, the toast names the state now in effect. */
async function onAssistFlip(active) {
  if (!game.user.isGM) return;
  try {
    await game.settings.set(MODULE, "assist", !!active);
    ui.notifications.info(game.i18n.localize(active ? ASSIST_KEYS.on : ASSIST_KEYS.off));
  } catch (err) {
    log.warn("drag help flip failed", err);
  }
}

/** The player's button, and `setGhost` on the API. */
async function onPlayerToggle(active) {
  try {
    if (active) {
      const { allowed, reason } = core.ghostAllowed(liveState());   // exempt included: an incorporeal token of yours in the fight
      if (!allowed) {
        ui.notifications.warn(NOTIFY_BLOCKED[reason], { localize: true });
        await game.settings.set(MODULE, "ghost", false);
        rerenderControls(true);
        return;
      }
    }
    await game.settings.set(MODULE, "ghost", !!active);
  } catch (err) {
    log.warn("ghost toggle failed", err);
  }
}

/**
 * The GM's button. The flip is computed from the live policy inside the policy queue, so a quick
 * double click flips from the first click's result; the toast names the mode in effect after the
 * write (movement-async-1).
 */
async function onGmFlip(active) {
  if (!game.user.isGM) return;
  try {
    await policyWrite(async () => {
      const next = core.flipPolicy(policy(), setting("ghostPolicyLast"), !!active);
      if (next.last !== setting("ghostPolicyLast")) await game.settings.set(MODULE, "ghostPolicyLast", next.last);
      await game.settings.set(MODULE, "ghostPolicy", next.policy);
      ui.notifications.info(game.i18n.localize(GM_KEYS[policy()]));
    });
  } catch (err) {
    log.warn("policy flip failed", err);
  }
}

/**
 * policy, combat on the viewed scene, wish and exempt, read live once (one combat scan). `exempt`
 * (an owned incorporeal or GM-flagged token is here) is looked up only when a fight would block ghost.
 */
const liveState = () => {
  const now = { policy: policy(), combatActive: combatActive(), wish: wish() };
  now.exempt = now.policy === "exploration" && now.combatActive && !game.user.isGM && exemptTokenIds(canvas?.scene).length > 0;
  return now;
};

let lastToolKey = null;
function rerenderControls(force = false, now = liveState()) {
  const key = JSON.stringify([now.policy, core.playerTool({ isGM: game.user.isGM, ...now })]);
  if (!force && key === lastToolKey) return false;
  lastToolKey = key;
  // The button under the pointer is drawn again: its tooltip would stay on screen with nothing under it (H4-14).
  try { game.tooltip?.deactivate?.(); } catch (err) { log?.debug?.("tooltip", err); }
  if (ui.controls?.rendered) ui.controls.render({ reset: true });
  return true;
}

/** The pm-blocked badge on the player's button while a combat has switched ghost off. */
function markBlocked(element) {
  const btn = (element ?? ui.controls?.element)?.querySelector?.(`button.tool[data-tool="${TOOL}"]`);
  if (!btn) return;
  const pt = core.playerTool({ isGM: game.user.isGM, ...liveState() });
  btn.classList.toggle(CSS.blocked, pt.state === "combat");
}

/* -------------------------------------------- */
/*  Reacting to change                          */
/* -------------------------------------------- */

/**
 * Policy, combat, wish or scene changed: clear a stale wish, then redraw the button and the tokens
 * if what the button shows has changed.
 */
let clearedBy = null; // why this client last switched the player's ghost off ("combat" | "off")
let clearedScene = null; // the viewed scene a "combat" clear happened on (movement-edge-1)
async function refresh() {
  try {
    // One live read serves every rule below: nothing awaits between them (finding -19).
    const now = liveState();
    const reason = game.user.isGM ? null : core.wishToClear(now);
    if (reason) {
      ui.notifications.info(NOTIFY_CLEARED[reason], { localize: true });
      clearedBy = reason;
      clearedScene = reason === "combat" ? canvas?.scene?.id ?? null : null;
      await game.settings.set(MODULE, "ghost", false); // its onChange calls refresh again
      return;
    }
    if (now.wish) clearedBy = clearedScene = null;
    else if (!game.user.isGM) {
      // A fight clear asks about the scene it happened on, not the one now viewed (movement-edge-1).
      const combatActive = clearedBy === "combat" ? core.combatOnScene(combatSummaries(), clearedScene) : now.combatActive;
      const key = core.ghostBackKey({ cleared: clearedBy, ...now, combatActive });
      if (key) {
        ui.notifications.info(key, { localize: true });
        clearedBy = clearedScene = null;
      }
    }
    // Combat updates fire every turn; only a real change of state redraws anything.
    if (!rerenderControls(false, now)) return;
    canvas?.tokens?.recalculatePlannedMovementPaths?.();
    refreshTokens();
  } catch (err) {
    log.warn("refresh failed", err);
  }
}
const queueRefresh = foundry.utils.debounce(() => refresh(), 50);

/** The settings this feature reacts to, in registration order. */
const ON_SETTING = Object.freeze({
  ghostPolicy: () => { invalidate(); queueRefresh(); },
  ghost: () => { invalidate(); queueRefresh(); },
  ownedOnTop: () => { invalidate(); refreshTokens(); },
  // The drag help switch: the GM's button redraws, any drag in progress is planned again.
  // Turned back on, it also clears this client's circuit breaker (0.8.0).
  assist: value => { if (value !== false) untripAssist(); rerenderControls(true); canvas?.tokens?.recalculatePlannedMovementPaths?.(); },
});

/**
 * A client setting written in another tab of this browser reaches this one only as a window
 * "storage" event (Foundry keeps client settings in localStorage; this tab's onChange never runs).
 * Run that key's handler here too, so the cached ghost context is not stale (movement-edge-3).
 * Nothing is written: the handler re-reads what localStorage already holds.
 */
const STORAGE_KEYS = new Map(["ghost", "ownedOnTop"].map(key => [`${MODULE}.${key}`, key]));
function onStorage(event) {
  const key = STORAGE_KEYS.get(event?.key);
  if (key) ON_SETTING[key]();
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

/** Every combat hook: updateCombatant too, since revealing a hidden combatant can start "combat on this scene". */
const COMBAT_HOOKS = ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"];

/**
 * Register the hooks in the module's historic order. Handlers that had no try/catch of their own
 * stay unguarded (`guard: false`), so a throw still reaches Foundry's hook error handling as before.
 * `ctx.late` (a hot re-import after `ready`): `setup` has already fired, so patch now.
 */
export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  for (const [key, fn] of Object.entries(ON_SETTING)) ctx.onSettingChange(key, fn);
  globalThis.window?.addEventListener?.("storage", onStorage);

  if (ctx.late) patchAll();
  else reg.once("setup", patchAll, { guard: false, label: "setup: wrap drag and keyboard" });

  reg.on("getSceneControlButtons", controls => {
    try { addTools(controls); } catch (err) { log.warn("toolbar skipped", err); }
  }, { guard: false, label: "getSceneControlButtons: ghost tools" });

  reg.on("renderSceneControls", (_app, element) => {
    try { markBlocked(element); }
    catch (err) { log.warnOnce("renderSceneControls", "renderSceneControls (further errors suppressed)", err); }
  }, { guard: false, label: "renderSceneControls: combat badge" });

  reg.on("drawTokenLayer", layer => installLayerSort(layer), { guard: false, label: "drawTokenLayer: owned-on-top sort" });
  reg.on("canvasReady", () => { invalidate(); installLayerSort(); queueRefresh(); }, { guard: false, label: "canvasReady: sort and refresh" });
  // hot: ghost context (settings and combats read once, see context())
  reg.on("refreshToken", (token, flags) => {
    try { onRefreshToken(token, flags); }
    catch (err) { log.warnOnce("refreshToken", "refreshToken (further errors suppressed)", err); }
  }, { guard: false, label: "refreshToken: lift and fade" });

  // Ownership changes who is lifted; our ghostInCombat flag changes whether a fight blocks the button.
  reg.on("updateActor", (actor, changes) => {
    if (changes?.flags?.[MODULE] !== undefined) queueRefresh();
    if (!("ownership" in (changes ?? {}))) return;
    for (const t of actor.getActiveTokens?.() ?? []) t.renderFlags.set({ refreshState: true });
    if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
  }, { guard: false, label: "updateActor: ownership re-sort" });
  reg.on("updateToken", (doc, changes, options) => {
    // The leader of a group drag is drawn on top while it moves (0.10 R6: its move's option names it).
    onLeadMove(doc, options);
    // An unlinked token's flag lands on its delta (the synthetic actor), which arrives as a Token update.
    if (changes?.delta?.flags?.[MODULE] !== undefined || "actorLink" in (changes ?? {}) || "actorId" in (changes ?? {})) queueRefresh();
    if (!("sort" in (changes ?? {})) && !("elevation" in (changes ?? {}))) return;
    if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
  }, { guard: false, label: "updateToken: sort/elevation re-sort; the leader of a moving group on top (0.10)" });

  for (const h of COMBAT_HOOKS) reg.on(h, () => { invalidate(); queueRefresh(); }, { guard: false, label: `${h}: refresh` });

  // An incorporeal token of this user's arriving or leaving the viewed scene mid-fight (dnd5e's
  // summon places a token and adds no combatant itself) changes whether the fight blocks the button.
  const onTokenHere = doc => { if (doc?.parent?.id && doc.parent.id === canvas?.scene?.id) queueRefresh(); };
  reg.on("createToken", onTokenHere, { label: "createToken: refresh (ghost in combat)" });
  reg.on("deleteToken", onTokenHere, { label: "deleteToken: refresh (ghost in combat)" });

  if (ctx.late) {
    installLayerSort();
    queueRefresh();
  }

  ctx.expose({
    status,
    ghostFor,
    combatActive,
    leadingIds: () => [...leading.keys()],
    setGhost: on => onPlayerToggle(!!on),
    patched: () => ({ drag: dragPatched, keyboard: keyboardPatched }),
  });
}

/** Undo the three patches and drop session state (hooks are removed by the entry's reg.offAll()). */
export function uninstall() {
  queueRefresh.cancel?.();
  invalidate();
  for (const h of [dragHandle, keyboardHandle, sortPatch?.handle]) h?.unwrap();
  dragHandle = keyboardHandle = sortPatch = null;
  dragPatched = keyboardPatched = false;
  clearTimeout(leadTimer);
  leadTimer = null;
  leading.clear();
  lastToolKey = null;
  clearedBy = clearedScene = null;
  if (feature) for (const key of Object.keys(ON_SETTING)) feature.onSettingChange(key, null);
  globalThis.window?.removeEventListener?.("storage", onStorage);
  feature = null;
}
