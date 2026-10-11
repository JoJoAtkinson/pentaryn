// Pentaryn Creatures — a player can always find the creatures they control.
//
// 1. Creature light. Every token a player owns whose actor is a creature (`npc`: summons,
//    familiars, skeletons, Arcane Eye, a steed) carries a small bright light, so it never vanishes
//    in the dark. Never on a PC or its Wild Shape form. Written by the active GM's client only, and
//    flagged (flags.pentaryn-creatures.light), so we only ever take away a light we put there.
// 2. Owners see their own. A token you own stays drawn on your screen even when nothing you
//    control can see it (an Invisible Arcane Eye in the dark). A per-client override of
//    Token#isVisible that only ever adds tokens the user owns, never GM-hidden ones.
// 3. "Your creatures" strip. Portraits of the tokens you own on this scene, above the hotbar.
//    Click = select and pan to it; double-click = open its sheet. Computed from the scene every time
//    it draws; nothing is stored, so a dismissed or killed summon simply stops being there.
//
// Exposes game.pentaryn.creatures.

import * as core from "./creatures-core.mjs";
import { onSettingChange, registerSettings, setting } from "./settings.mjs";

const { MODULE, isPlayerCreature, lightUpdate, ownerShouldSee, stripEntries, shouldShowStrip, stripSignature, stripDock, isItemPile, isAoeHandle } = core;

const isWriter = () => game.users?.activeGM?.isSelf === true;

/* -------------------------------------------- */
/*  Token summaries for the pure core           */
/* -------------------------------------------- */

function isPile(t) {
  return isItemPile(t.flags, t.actor?.flags);
}

/** A prop, not a creature: pentaryn-aoe's spell-area handle is an `npc` every player owns (`default: OWNER`). */
function isProp(t) {
  return isAoeHandle(t.flags, t.actor?.flags);
}

/** A plain summary of a TokenDocument, as seen by `user`. */
function summarize(t, user = game.user) {
  const a = t.actor;
  return {
    id: t.id,
    name: t.name,
    img: t.texture?.src,
    actorImg: a?.img,
    actorId: a ? (t.actorId || a.id) : null,
    originalActorId: a?.flags?.dnd5e?.originalActor ?? null,
    actorType: a?.type,
    hasPlayerOwner: a?.hasPlayerOwner === true,
    isOwner: user.isSelf ? t.isOwner : t.testUserPermission(user, "OWNER"),
    hidden: t.hidden === true,
    isPile: isPile(t),
    isProp: isProp(t)
  };
}

/* -------------------------------------------- */
/*  1. Creature light (active GM writes)        */
/* -------------------------------------------- */

const queued = new Map();   // sceneId -> Set<tokenId> | "all"
let flushTimer = null;

function queue(scene, tokenId = null) {
  if (!scene || !isWriter()) return;
  const cur = queued.get(scene.id);
  if (tokenId === null || cur === "all") queued.set(scene.id, "all");
  else (cur ?? queued.set(scene.id, new Set()).get(scene.id)).add(tokenId);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 200);
}

async function flush() {
  const jobs = [...queued.entries()];
  queued.clear();
  for (const [sceneId, ids] of jobs) {
    const scene = game.scenes.get(sceneId);
    if (scene) await syncScene(scene, ids === "all" ? null : ids).catch(err => console.warn(`${MODULE} | light sync failed on ${scene.name}`, err));
  }
}

/** Bring one scene's tokens in line (or only `ids`). Returns how many tokens were written. */
async function syncScene(scene, ids = null) {
  if (!isWriter()) return 0;
  const radius = Number(setting("lightRadius")) || 0;
  const updates = [];
  for (const t of scene.tokens) {
    if (ids && !ids.has(t.id)) continue;
    const u = lightUpdate(t, { qualifies: isPlayerCreature(summarize(t)), radius });
    if (u) updates.push({ _id: t.id, ...u });
  }
  if (updates.length) await scene.updateEmbeddedDocuments("Token", updates);
  return updates.length;
}

async function syncAll() {
  let n = 0;
  for (const scene of game.scenes) n += await syncScene(scene);
  return n;
}

// Changes that can turn the light on or off. A token that only moved is skipped.
const LIGHT_KEYS = ["light", "actorId", "actorLink", "delta", "flags"];

Hooks.on("createToken", (doc) => queue(doc.parent, doc.id));
Hooks.on("updateToken", (doc, changes) => {
  if (LIGHT_KEYS.some(k => k in (changes ?? {}))) queue(doc.parent, doc.id);
});
Hooks.on("updateActor", (actor, changes) => {
  if (!isWriter() || !changes || !("ownership" in changes || "type" in changes)) return;
  if (actor.isToken) return queue(actor.token?.parent, actor.token?.id);
  for (const scene of game.scenes) for (const t of scene.tokens) if (t.actorId === actor.id) queue(scene, t.id);
});
// A user promoted to GM, or removed, changes who counts as a player owner.
for (const h of ["createUser", "updateUser", "deleteUser"]) {
  Hooks.on(h, (_user, changes) => {
    if (h === "updateUser" && !("role" in (changes ?? {}))) return;
    if (isWriter()) for (const scene of game.scenes) queue(scene);
  });
}

/* -------------------------------------------- */
/*  2. Owners always see their own tokens       */
/* -------------------------------------------- */

let ownerSeesOn = true;

/** Called only when core said "not visible". */
function ownerOverride(token) {
  if (!ownerSeesOn || game.user.isGM) return false;
  try {
    const doc = token.document;
    if (!doc?.isOwner || isProp(doc)) return false;   // every player owns a spell-area handle
    return ownerShouldSee({
      enabled: true,
      isGM: false,
      isOwner: true,
      hidden: doc.hidden === true,
      configPreview: token._preview?._previewType === "config",
      filteredOut: token.isFilteredOut === true,
      culled: typeof token._testCulled === "function" ? token._testCulled() === true : false
    });
  } catch {
    return false;
  }
}

let patchedWith = null;

function patchVisibility() {
  const path = "foundry.canvas.placeables.Token.prototype.isVisible";
  if (game.modules.get("lib-wrapper")?.active && globalThis.libWrapper) {
    try {
      globalThis.libWrapper.register(MODULE, path, function (wrapped, ...args) {
        return wrapped(...args) || ownerOverride(this);
      }, "WRAPPER");
      return (patchedWith = "libWrapper");
    } catch (err) {
      console.warn(`${MODULE} | libWrapper registration failed, patching directly`, err);
    }
  }
  const proto = foundry.canvas.placeables.Token.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, "isVisible");
  if (!desc?.get) {
    console.warn(`${MODULE} | Token#isVisible not found; owners-see-their-own is off`);
    return (patchedWith = null);
  }
  Object.defineProperty(proto, "isVisible", {
    ...desc,
    get() { return desc.get.call(this) || ownerOverride(this); }
  });
  return (patchedWith = "direct");
}

function refreshTokenVisibility() {
  if (!canvas?.ready) return;
  for (const t of canvas.tokens.placeables) t.renderFlags.set({ refreshVisibility: true });
}

/* -------------------------------------------- */
/*  3. The "Your creatures" strip               */
/* -------------------------------------------- */

const STRIP_ID = "pentaryn-creatures";
let lastSig = null;
let renderTimer = null;

/** The strip's entries for `user` on the viewed scene (or `scene`). */
function list(user = game.user, scene = canvas?.scene) {
  if (!scene) return [];
  const characterId = user.character?.id ?? null;
  return stripEntries([...scene.tokens].map(t => summarize(t, user)), { characterId });
}

function stripEl() {
  return document.getElementById(STRIP_ID);
}

function mount() {
  let el = stripEl();
  if (el?.isConnected) return el;
  el = document.createElement("nav");
  el.id = STRIP_ID;
  el.setAttribute("aria-label", _loc("PENTARYN_CREATURES.label"));
  el.addEventListener("click", onClick);
  el.addEventListener("dblclick", onDoubleClick);
  const bottom = document.getElementById("ui-bottom");
  const hotbar = document.getElementById("hotbar");
  if (bottom && hotbar?.parentElement === bottom) bottom.insertBefore(el, hotbar);
  else if (bottom) bottom.append(el);
  else document.body.append(el);
  return el;
}

function render() {
  const enabled = !game.user.isGM && setting("showStrip");
  const entries = enabled && canvas?.ready ? list() : [];
  if (!shouldShowStrip(entries)) {
    stripEl()?.remove();
    lastSig = null;
    return;
  }
  const sig = stripSignature(entries);
  const el = mount();
  if (sig !== lastSig || !el.childElementCount) {
    lastSig = sig;
    el.replaceChildren(...build(entries));
  }
  markControlled();
  placeStrip();
}

/* The strip floats above the Combat HUD while the HUD is up (usability Area 6 re-run, W8): docked
   above the hotbar it sat behind Argon's action bars, so clicks went to the bar instead. */
let dockTimer = null;
function placeStrip() {
  const el = stripEl();
  if (!el) { clearInterval(dockTimer); dockTimer = null; return; }
  const bar = document.querySelector(".extended-combat-hud .action-hud") ?? document.querySelector(".extended-combat-hud");
  const r = bar && bar.offsetParent !== null ? bar.getBoundingClientRect() : null;
  const dock = setting("floatOverHud") ? stripDock(r, window.innerHeight) : null;
  el.classList.toggle("pcr-floating", !!dock);
  el.style.bottom = dock ? `${dock.bottom}px` : "";
  el.style.left = dock ? `${dock.left}px` : "";
  // Argon opens, closes and re-renders without a hook we can rely on: look again twice a second
  // while the strip exists (one rect read).
  dockTimer ??= setInterval(placeStrip, 500);
}

function build(entries) {
  const label = document.createElement("span");
  label.className = "pcr-label";
  label.textContent = _loc("PENTARYN_CREATURES.label");
  const out = [label];
  const hint = _loc("PENTARYN_CREATURES.hint");
  for (const e of entries) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `pcr-token rank-${e.rank}`;
    b.dataset.tokenId = e.id;
    b.dataset.tooltipHtml = `<strong>${foundry.utils.escapeHTML(e.name)}</strong><br>${foundry.utils.escapeHTML(hint)}`;
    b.setAttribute("aria-label", e.name);
    const img = document.createElement("img");
    img.src = e.img;
    img.alt = "";
    img.draggable = false;
    b.append(img);
    out.push(b);
  }
  return out;
}

function markControlled() {
  const el = stripEl();
  if (!el || !canvas?.ready) return;
  for (const b of el.querySelectorAll(".pcr-token")) {
    b.classList.toggle("controlled", !!canvas.tokens.get(b.dataset.tokenId)?.controlled);
  }
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(() => {
    try { render(); } catch (err) { console.warn(`${MODULE} | strip render failed`, err); }
  }, 60);
}

function tokenFor(event) {
  const id = event.target.closest?.(".pcr-token")?.dataset.tokenId;
  return id ? canvas.tokens?.get(id) : null;
}

/** Click: select it (shift keeps the others) and pan to it. */
function onClick(event) {
  const token = tokenFor(event);
  if (!token) return;
  event.preventDefault();
  if (!canvas.tokens.active) canvas.tokens.activate();
  token.control({ releaseOthers: !event.shiftKey });
  const { x, y } = token.center;
  canvas.animatePan({ x, y });
}

/** Double-click: open its sheet. */
function onDoubleClick(event) {
  const token = tokenFor(event);
  if (!token?.actor?.sheet) return;
  event.preventDefault();
  token.actor.sheet.render({ force: true });
}

Hooks.on("canvasReady", () => { lastSig = null; scheduleRender(); });
for (const h of ["createToken", "deleteToken", "updateToken"]) {
  Hooks.on(h, (doc) => { if (doc.parent?.id === canvas?.scene?.id) scheduleRender(); });
}
Hooks.on("updateActor", (_actor, changes) => {
  if (changes && ("ownership" in changes || "img" in changes || "name" in changes)) scheduleRender();
});
Hooks.on("updateUser", (user, changes) => { if (user.isSelf && changes && "character" in changes) scheduleRender(); });
Hooks.on("controlToken", () => markControlled());

/* -------------------------------------------- */
/*  Settings, patch, API                        */
/* -------------------------------------------- */

// Setting reactions (the rows live in settings.mjs).
onSettingChange("lightRadius", () => { if (isWriter()) syncAll().catch(err => console.warn(`${MODULE} | light sync failed`, err)); });
onSettingChange("ownerSees", (v) => { ownerSeesOn = v !== false; refreshTokenVisibility(); });
onSettingChange("showStrip", () => { lastSig = null; scheduleRender(); });

Hooks.once("init", () => registerSettings());

// Before the canvas first draws, so the first frame already uses the override.
Hooks.once("setup", () => {
  ownerSeesOn = setting("ownerSees") !== false;
  patchVisibility();
});

Hooks.once("ready", () => {
  if (isWriter()) syncAll().catch(err => console.warn(`${MODULE} | light sync failed`, err));
  scheduleRender();
});

// pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a
// tick and rebuild rather than assign (same as pentaryn-journal / -portals).
Hooks.once("ready", () => setTimeout(() => {
  const api = {
    list,
    render: () => { lastSig = null; render(); },
    syncScene,
    syncAll,
    isCreature: (tokenDoc) => isPlayerCreature(summarize(tokenDoc)),
    ownerSees: (token) => ownerOverride(token),
    patchedWith: () => patchedWith,
    core
  };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, creatures: api };
  else { game.pentaryn ??= {}; game.pentaryn.creatures = api; }
}, 0));
