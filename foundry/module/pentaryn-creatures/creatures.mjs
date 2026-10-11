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
import { summarize } from "./tokens-adapter.mjs";
import { hookRegistry } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import * as light from "./light.mjs";
import * as ownerSees from "./owner-sees.mjs";

const { MODULE, isPlayerCreature, stripEntries, shouldShowStrip, stripSignature, stripDock } = core;

const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = {
  log,
  reg,
  setting,
  onSettingChange,
  exposed: {},
  expose(accessors) {
    Object.assign(ctx.exposed, accessors);
  },
};

light.install(reg, ctx);
const { syncScene, syncAll } = ctx.exposed;

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
onSettingChange("showStrip", () => { lastSig = null; scheduleRender(); });

Hooks.once("init", () => registerSettings());

ownerSees.install(reg, ctx);

Hooks.once("ready", () => {
  ctx.exposed.syncAllQuietly();
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
    ownerSees: ctx.exposed.ownerSees,
    patchedWith: ctx.exposed.patchedWith,
    core
  };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, creatures: api };
  else { game.pentaryn ??= {}; game.pentaryn.creatures = api; }
}, 0));
