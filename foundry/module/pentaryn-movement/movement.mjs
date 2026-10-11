/**
 * Pentaryn Movement
 * =================
 *
 * Two fixes from the 2026-10-08 table feedback (plan C2, context/plans/table-feedback-2026-10-08.md):
 *
 * 1. Owned tokens draw on top, for their owner. A player's own tokens are lifted above everyone
 *    else's on that player's screen only: the mesh sort (what is drawn on top) and the token
 *    layer's child order (what takes the click). Nothing is written to the scene. The GM is never
 *    affected (the GM owns everything).
 *
 * 2. Ghost movement for players. A ghost button in the token tools lets a player drag (or arrow-key)
 *    their own tokens through walls and creatures. It reuses core's own mechanism, the same
 *    constrain options the GM's Unconstrained Movement tool sets:
 *        {ignoreWalls, ignoreCost}   core  Token#constrainMovementPath
 *        {ignoreTokens}              dnd5e Token5e#constrainMovementPath (creature blocking)
 *    Core only ever offers those to the GM, in Token#_getDragConstrainOptions (dnd5e
 *    overrides it the same way; verified on core 14.369 / dnd5e 6.0.6). This module wraps that one method, plus the keyboard
 *    movement preparation, and adds the flags when ghost is in effect for that token. No collision
 *    code is reimplemented.
 *
 *    Why no GM relay: neither core nor the server refuses a player's unconstrained move. The
 *    constraint is applied on the mover's own client (TokenDocument#preUpdateMovement passes the
 *    mover's constrainOptions straight into constrainMovementPath; verified on core 14.369),
 *    and the server's Token#_preUpdate only checks the destination matches the update and the
 *    origin matches the current position; it never consults walls. Verify live as a player.
 *
 *    The GM governs it with a world setting (Off / Exploration only / Always allowed) and a button
 *    in the same toolbar that flips it Off and back. "Exploration only" switches ghost off while a
 *    combat is running on the scene (see movement-core `combatOnScene`).
 *
 * While ghost is on, the player's own tokens are drawn translucent, so the mode is never invisible.
 *
 * Exposes game.pentaryn.movement.
 */

import * as core from "./movement-core.mjs";

const MOD = core.MODULE;
const TOOL = "pentarynGhost";
const GM_TOOL = "pentarynGhostPolicy";
const GHOST_ALPHA = 0.55;

/* -------------------------------------------- */
/*  Settings (read defensively)                 */
/* -------------------------------------------- */

const DEFAULTS = { ghostPolicy: core.DEFAULT_POLICY, ghostPolicyLast: core.DEFAULT_POLICY, ghost: false, ownedOnTop: true };

function setting(key) {
  try { return game.settings.get(MOD, key); } catch { return DEFAULTS[key]; }
}
const policy = () => core.normalizePolicy(setting("ghostPolicy"));
const wish = () => !!setting("ghost");

/* -------------------------------------------- */
/*  State                                       */
/* -------------------------------------------- */

/**
 * Plain summaries of the world's combats for movement-core. Hidden combatants are left out: players'
 * clients receive them, and counting them would switch ghost off (with a "fight started" toast) the
 * moment the GM adds a hidden ambush to the tracker, before anything is revealed or started.
 */
function combatSummaries() {
  return (game.combats?.contents ?? []).map(c => ({
    active: !!c.active,
    sceneId: c.scene?.id ?? c._source?.scene ?? null,
    started: !!c.started,
    combatantSceneIds: (c.combatants?.contents ?? []).filter(cb => !cb.hidden)
      .map(cb => cb.sceneId ?? cb.token?.parent?.id).filter(Boolean)
  }));
}

function combatActive(sceneId = canvas?.scene?.id) {
  return core.combatOnScene(combatSummaries(), sceneId);
}

/** Ghost in effect for this placeable (Token) on this client? */
function ghostFor(token) {
  const doc = token?.document;
  if (!doc) return false;
  return core.ghostFor({
    isGM: game.user.isGM, policy: policy(), wish: wish(), isOwner: !!doc.isOwner,
    combatActive: combatActive(doc.parent?.id)
  });
}

function ownedRankOf(token) {
  return core.ownedRank({ isGM: game.user.isGM, enabled: setting("ownedOnTop"), isOwner: !!token?.document?.isOwner });
}

/** Everything a console reader needs to see why ghost is or isn't on. */
function status() {
  const p = policy();
  const combat = combatActive();
  const allowed = core.ghostAllowed({ policy: p, combatActive: combat });
  return {
    policy: p, combatOnScene: combat, allowed: allowed.allowed, reason: allowed.reason,
    wish: wish(), ghost: !game.user.isGM && allowed.allowed && wish(),
    ownedOnTop: !!setting("ownedOnTop"),
    patched: { drag: !!dragPatched, keyboard: !!keyboardPatched }
  };
}

/* -------------------------------------------- */
/*  The movement hooks into core                */
/* -------------------------------------------- */

let dragPatched = false;
let keyboardPatched = false;

/** Wrap Token#_getDragConstrainOptions on the configured token class (dnd5e's Token5e). */
function patchDrag() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._getDragConstrainOptions !== "function") {
    console.warn(`${MOD} | no Token#_getDragConstrainOptions; ghost drag disabled`);
    return false;
  }
  if (proto._getDragConstrainOptions.__pentarynMovement) return true;
  const original = proto._getDragConstrainOptions;
  function patched(...args) {
    const base = original.apply(this, args);
    try { return ghostFor(this) ? core.constrainFor(base, true) : base; }
    catch (err) { console.warn(`${MOD} | drag constrain skipped`, err); return base; }
  }
  patched.__pentarynMovement = true;
  proto._getDragConstrainOptions = patched;
  return true;
}

/** Wrap TokenLayer#_prepareKeyboardMovementUpdates: arrow keys ghost too. */
function patchKeyboard() {
  const proto = CONFIG.Canvas?.layers?.tokens?.layerClass?.prototype;
  if (typeof proto?._prepareKeyboardMovementUpdates !== "function") {
    console.warn(`${MOD} | no TokenLayer#_prepareKeyboardMovementUpdates; ghost arrow keys disabled`);
    return false;
  }
  if (proto._prepareKeyboardMovementUpdates.__pentarynMovement) return true;
  const original = proto._prepareKeyboardMovementUpdates;
  function patched(objects, ...rest) {
    const result = original.call(this, objects, ...rest);
    try {
      const movement = result?.[1]?.movement;
      if (movement) {
        for (const o of objects ?? []) {
          const m = movement[o?.id];
          if (m && ghostFor(o)) m.constrainOptions = core.constrainFor(m.constrainOptions, true);
        }
      }
    } catch (err) { console.warn(`${MOD} | keyboard constrain skipped`, err); }
    return result;
  }
  patched.__pentarynMovement = true;
  proto._prepareKeyboardMovementUpdates = patched;
  return true;
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

function installLayerSort(layer = canvas?.tokens) {
  const objects = layer?.objects;
  if (!objects) return;
  if (!objects.sortChildren?.__pentarynMovement) objects.sortChildren = sortTokenObjects;
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

const GM_ICONS = {
  off: "fa-solid fa-road-barrier",
  exploration: "fa-solid fa-person-hiking",
  always: "fa-solid fa-person-walking-dashed-line-arrow-right"
};

function toolclip(heading, paragraphs) {
  const SC = foundry.applications.ui.SceneControls;
  return { heading, items: SC.buildToolclipItems(paragraphs.map(paragraph => ({ paragraph }))) };
}

function addTools(controls) {
  const tools = controls?.tokens?.tools;
  if (!tools) return;
  const p = policy();
  const combat = combatActive();

  const pt = core.playerTool({ isGM: game.user.isGM, policy: p, combatActive: combat, wish: wish() });
  if (pt.visible) {
    tools[TOOL] = {
      name: TOOL,
      order: 4.5,
      title: `PENTARYN_MOVEMENT.tool.${pt.state}`,
      icon: "fa-solid fa-ghost",
      toggle: true,
      active: pt.active,
      onChange: (_event, active) => onPlayerToggle(active),
      toolclip: toolclip(`PENTARYN_MOVEMENT.tool.${pt.state}`, ["PENTARYN_MOVEMENT.tool.clip.what", `PENTARYN_MOVEMENT.tool.clip.${pt.state}`, "PENTARYN_MOVEMENT.tool.clip.vision"])
    };
  }

  const gt = core.gmTool({ isGM: game.user.isGM, policy: p });
  if (gt.visible) {
    tools[GM_TOOL] = {
      name: GM_TOOL,
      order: 4.6,
      title: `PENTARYN_MOVEMENT.gm.${gt.state}`,
      icon: GM_ICONS[gt.state],
      toggle: true,
      active: gt.active,
      onChange: (_event, active) => onGmFlip(active),
      toolclip: toolclip(`PENTARYN_MOVEMENT.gm.${gt.state}`, ["PENTARYN_MOVEMENT.gm.clip.what", "PENTARYN_MOVEMENT.gm.clip.modes", "PENTARYN_MOVEMENT.gm.clip.combat"])
    };
  }
}

async function onPlayerToggle(active) {
  try {
    if (active) {
      const { allowed, reason } = core.ghostAllowed({ policy: policy(), combatActive: combatActive() });
      if (!allowed) {
        ui.notifications.warn(`PENTARYN_MOVEMENT.notify.blocked.${reason}`, { localize: true });
        await game.settings.set(MOD, "ghost", false);
        rerenderControls(true);
        return;
      }
    }
    await game.settings.set(MOD, "ghost", !!active);
  } catch (err) {
    console.warn(`${MOD} | ghost toggle failed`, err);
  }
}

async function onGmFlip(active) {
  if (!game.user.isGM) return;
  try {
    const next = core.flipPolicy(policy(), setting("ghostPolicyLast"), !!active);
    if (next.last !== setting("ghostPolicyLast")) await game.settings.set(MOD, "ghostPolicyLast", next.last);
    await game.settings.set(MOD, "ghostPolicy", next.policy);
    ui.notifications.info(game.i18n.localize(`PENTARYN_MOVEMENT.gm.${next.policy}`));
  } catch (err) {
    console.warn(`${MOD} | policy flip failed`, err);
  }
}

let lastToolKey = null;
function rerenderControls(force = false) {
  const p = policy();
  const key = JSON.stringify([p, core.playerTool({ isGM: game.user.isGM, policy: p, combatActive: combatActive(), wish: wish() })]);
  if (!force && key === lastToolKey) return false;
  lastToolKey = key;
  if (ui.controls?.rendered) ui.controls.render({ reset: true });
  return true;
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
    const reason = game.user.isGM ? null
      : core.wishToClear({ policy: policy(), combatActive: combatActive(), wish: wish() });
    if (reason) {
      ui.notifications.info(`PENTARYN_MOVEMENT.notify.cleared.${reason}`, { localize: true });
      clearedBy = reason;
      await game.settings.set(MOD, "ghost", false); // its onChange calls refresh again
      return;
    }
    if (wish()) clearedBy = null;
    else if (!game.user.isGM && core.ghostBack({ cleared: clearedBy, policy: policy(), combatActive: combatActive(), wish: wish() })) {
      ui.notifications.info(`PENTARYN_MOVEMENT.notify.back.${clearedBy}`, { localize: true });
      clearedBy = null;
    }
    // Combat updates fire every turn; only a real change of state redraws anything.
    if (!rerenderControls()) return;
    canvas?.tokens?.recalculatePlannedMovementPaths?.();
    refreshTokens();
  } catch (err) {
    console.warn(`${MOD} | refresh failed`, err);
  }
}
const queueRefresh = foundry.utils.debounce(() => refresh(), 50);

/* -------------------------------------------- */
/*  Pins under tokens (plan D5)                 */
/* -------------------------------------------- */

/** GM/console: pins on a scene whose centre sits under a token. Player-owned tokens listed first. */
function pinsUnderTokens(scene = canvas?.scene) {
  if (!scene) return [];
  const size = scene.grid?.size ?? canvas?.grid?.size ?? 100;
  const notes = scene.notes.map(n => ({ id: n.id, x: n.x, y: n.y, label: n.text || n.entry?.name || n.label || "" }));
  const tokens = scene.tokens.filter(t => !t.hidden).map(t => ({
    id: t.id, name: t.name, x: t.x, y: t.y, w: (t.width ?? 1) * size, h: (t.height ?? 1) * size,
    playerOwned: game.users.some(u => !u.isGM && t.testUserPermission?.(u, "OWNER"))
  }));
  return core.pinsUnderTokens(notes, tokens);
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MOD, "ghostPolicy", {
    name: "PENTARYN_MOVEMENT.settings.policy.name",
    hint: "PENTARYN_MOVEMENT.settings.policy.hint",
    scope: "world", config: true, type: String, default: core.DEFAULT_POLICY,
    choices: {
      off: "PENTARYN_MOVEMENT.settings.policy.off",
      exploration: "PENTARYN_MOVEMENT.settings.policy.exploration",
      always: "PENTARYN_MOVEMENT.settings.policy.always"
    },
    onChange: () => queueRefresh()
  });
  game.settings.register(MOD, "ghostPolicyLast", {
    scope: "world", config: false, type: String, default: core.DEFAULT_POLICY
  });
  game.settings.register(MOD, "ghost", {
    scope: "client", config: false, type: Boolean, default: false,
    onChange: () => queueRefresh()
  });
  game.settings.register(MOD, "ownedOnTop", {
    name: "PENTARYN_MOVEMENT.settings.ownedOnTop.name",
    hint: "PENTARYN_MOVEMENT.settings.ownedOnTop.hint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: () => refreshTokens()
  });
});

// Token5e and TokenLayer5e are in CONFIG by now (the system's init ran first).
Hooks.once("setup", () => {
  dragPatched = patchDrag();
  keyboardPatched = patchKeyboard();
});

Hooks.on("getSceneControlButtons", controls => {
  try { addTools(controls); } catch (err) { console.warn(`${MOD} | toolbar skipped`, err); }
});

Hooks.on("renderSceneControls", (_app, element) => {
  try {
    const btn = (element ?? ui.controls?.element)?.querySelector?.(`button.tool[data-tool="${TOOL}"]`);
    if (!btn) return;
    const pt = core.playerTool({ isGM: game.user.isGM, policy: policy(), combatActive: combatActive(), wish: wish() });
    btn.classList.toggle("pm-blocked", pt.state === "combat");
  } catch {}
});

Hooks.on("drawTokenLayer", layer => installLayerSort(layer));
Hooks.on("canvasReady", () => { installLayerSort(); queueRefresh(); });
Hooks.on("refreshToken", (token, flags) => {
  try { onRefreshToken(token, flags); } catch {}
});

// Ownership changes who is lifted.
Hooks.on("updateActor", (actor, changes) => {
  if (!("ownership" in (changes ?? {}))) return;
  for (const t of actor.getActiveTokens?.() ?? []) t.renderFlags.set({ refreshState: true });
  if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
});
Hooks.on("updateToken", (doc, changes) => {
  if (!("sort" in (changes ?? {})) && !("elevation" in (changes ?? {}))) return;
  if (canvas?.tokens?.objects) canvas.tokens.objects.sortDirty = true;
});

// updateCombatant: revealing a hidden combatant can start "combat on this scene".
for (const h of ["createCombat", "updateCombat", "deleteCombat", "createCombatant", "updateCombatant", "deleteCombatant"]) {
  Hooks.on(h, () => queueRefresh());
}

// Published one tick after ready (publishing synchronously is a declared step of the migration). The
// importer merges into game.pentaryn and nothing freezes it since its keystone (items-journal-1), so
// the old frozen-root guard is gone (kit 1.0.2, J10): the API is assigned into the plain root.
Hooks.once("ready", () => setTimeout(() => {
  const api = {
    status,
    ghostFor,
    combatActive,
    /** Player: switch ghost on/off for yourself (same as the button). */
    setGhost: on => onPlayerToggle(!!on),
    /** GM: set the policy directly: "off" | "exploration" | "always". */
    setPolicy: async value => {
      if (!game.user.isGM) throw new Error("GM only");
      const p = core.normalizePolicy(value);
      if (p !== "off") await game.settings.set(MOD, "ghostPolicyLast", p);
      return game.settings.set(MOD, "ghostPolicy", p);
    },
    pinsUnderTokens,
    core
  };
  game.pentaryn ??= {};
  game.pentaryn.movement = api;
}, 0));
