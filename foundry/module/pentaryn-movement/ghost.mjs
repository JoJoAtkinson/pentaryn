/**
 * Pentaryn Movement — the feature: owned-on-top and player ghost movement.
 *
 * GLUE, one feature. `install(reg, ctx)` registers every hook through the registry, in the order
 * the module has always registered them, and is called synchronously from the entry body (the
 * patches still apply at `setup`). `uninstall()` undoes the patches and clears session state;
 * the entry's `reg.offAll()` removes the hooks.
 *
 *  - Owned on top: a player's own tokens are lifted on that player's screen only, in the mesh sort
 *    (what is drawn on top) and the token layer's child order (what takes the click).
 *  - Ghost: Token#_getDragConstrainOptions and TokenLayer#_prepareKeyboardMovementUpdates are wrapped
 *    so a player's own token gets core's unconstrained-movement constrain options (ignoreWalls,
 *    ignoreCost; dnd5e's ignoreTokens) while ghost is in effect. The rules are in movement-core.
 */

import * as core from "./movement-core.mjs";
import {
  CSS, GHOST_ALPHA, GM_CLIP_KEYS, GM_ICONS, GM_KEYS, GM_TOOL, MODULE, NOTIFY_BLOCKED, NOTIFY_CLEARED,
  TOOL, TOOL_CLIP_KEYS, TOOL_KEYS, VERSION
} from "./movement-core.mjs";
import { SETTINGS, setting } from "./settings.mjs";
import { combatSummaries } from "./combat-adapter.mjs";
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

function combatActive(sceneId = canvas?.scene?.id) {
  return core.combatOnScene(combatSummaries(), sceneId);
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

/** Ghost in effect for this placeable (Token) on this client? */
function ghostFor(token) {
  const doc = token?.document;
  if (!doc) return false;
  return core.ghostForCtx(context(), { isGM: game.user.isGM, isOwner: !!doc.isOwner, sceneId: doc.parent?.id });
}

function ownedRankOf(token) {
  return core.ownedRank({ isGM: game.user.isGM, enabled: context().ownedOnTop, isOwner: !!token?.document?.isOwner });
}

/** Every setting key with its scope, so a console reader never has to guess one (finding -23). */
const SETTING_SCOPES = Object.freeze(Object.fromEntries(SETTINGS.map(r => [r.key, r.scope])));

/**
 * Everything a console reader needs to see why ghost is or isn't on, for `opts.sceneId` (default:
 * the scene this client views). The first eight keys are the historic ones; sceneId, version and
 * the settings key map are appended after them.
 */
function status(opts = {}) {
  const sceneId = opts?.sceneId ?? canvas?.scene?.id ?? null;
  return {
    ...core.statusFrom({
      policy: policy(), combat: combatActive(sceneId), wish: wish(), isGM: game.user.isGM,
      ownedOnTop: setting("ownedOnTop"), patched: { drag: dragPatched, keyboard: keyboardPatched }
    }),
    sceneId,
    version: VERSION,
    settings: SETTING_SCOPES,
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
    elevation: c.document?.elevation ?? 0, rank: ownedRankOf(c), sort: c.document?.sort ?? 0,
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
  mesh.sort = core.meshSort(token.document?.sort, ownedRankOf(token));
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
      toolclip: toolclip(TOOL_KEYS[pt.state], [TOOL_CLIP_KEYS.what, TOOL_CLIP_KEYS[pt.state], TOOL_CLIP_KEYS.vision])
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
}

/** The player's button, and `setGhost` on the API. */
async function onPlayerToggle(active) {
  try {
    if (active) {
      const { allowed, reason } = core.ghostAllowed({ policy: policy(), combatActive: combatActive() });
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

async function onGmFlip(active) {
  if (!game.user.isGM) return;
  try {
    const next = core.flipPolicy(policy(), setting("ghostPolicyLast"), !!active);
    if (next.last !== setting("ghostPolicyLast")) await game.settings.set(MODULE, "ghostPolicyLast", next.last);
    await game.settings.set(MODULE, "ghostPolicy", next.policy);
    ui.notifications.info(game.i18n.localize(GM_KEYS[next.policy]));
  } catch (err) {
    log.warn("policy flip failed", err);
  }
}

/** policy, combat on the viewed scene and wish, read live once (one combat scan). */
const liveState = () => ({ policy: policy(), combatActive: combatActive(), wish: wish() });

let lastToolKey = null;
function rerenderControls(force = false, now = liveState()) {
  const key = JSON.stringify([now.policy, core.playerTool({ isGM: game.user.isGM, ...now })]);
  if (!force && key === lastToolKey) return false;
  lastToolKey = key;
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
async function refresh() {
  try {
    // One live read serves every rule below: nothing awaits between them (finding -19).
    const now = liveState();
    const reason = game.user.isGM ? null : core.wishToClear(now);
    if (reason) {
      ui.notifications.info(NOTIFY_CLEARED[reason], { localize: true });
      clearedBy = reason;
      await game.settings.set(MODULE, "ghost", false); // its onChange calls refresh again
      return;
    }
    if (now.wish) clearedBy = null;
    else if (!game.user.isGM) {
      const key = core.ghostBackKey({ cleared: clearedBy, ...now });
      if (key) {
        ui.notifications.info(key, { localize: true });
        clearedBy = null;
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
});

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

  // Ownership changes who is lifted.
  reg.on("updateActor", (actor, changes) => {
    if (!("ownership" in (changes ?? {}))) return;
    for (const t of actor.getActiveTokens?.() ?? []) t.renderFlags.set({ refreshState: true });
    if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
  }, { guard: false, label: "updateActor: ownership re-sort" });
  reg.on("updateToken", (doc, changes) => {
    if (!("sort" in (changes ?? {})) && !("elevation" in (changes ?? {}))) return;
    if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
  }, { guard: false, label: "updateToken: sort/elevation re-sort" });

  for (const h of COMBAT_HOOKS) reg.on(h, () => { invalidate(); queueRefresh(); }, { guard: false, label: `${h}: refresh` });

  if (ctx.late) {
    installLayerSort();
    queueRefresh();
  }

  ctx.expose({
    status,
    ghostFor,
    combatActive,
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
  lastToolKey = null;
  clearedBy = null;
  if (feature) for (const key of Object.keys(ON_SETTING)) feature.onSettingChange(key, null);
  feature = null;
}
