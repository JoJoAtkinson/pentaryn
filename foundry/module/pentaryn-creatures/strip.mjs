/**
 * Pentaryn Creatures — UI: the "Your creatures" strip. Portraits of the tokens you own on this
 * scene, above the hotbar; click = select and pan to it, double-click = open its sheet. Computed
 * from the scene every time it draws; nothing is stored, so a dismissed or killed summon simply
 * stops being there. What it shows and in which order is core's (stripEntries, shouldShowStrip);
 * where it floats over Argon's Combat HUD is core's stripDock.
 *
 * DOM only: `nav#pentaryn-creatures.pcr-strip`, built from `.pcr-*` children. The triggers that
 * redraw it live in creature-strip.mjs.
 */

import { MODULE, dockKey, shouldPollDock, shouldShowStrip, stripDock, stripEntries, stripSignature } from "./creatures-core.mjs";
import { setting } from "./settings.mjs";
import { summarize } from "./tokens-adapter.mjs";

const STRIP_ID = MODULE;
let lastSig = null;

/** The strip's entries for `user` on the viewed scene (or `scene`). */
export function list(user = game.user, scene = canvas?.scene) {
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
  el.className = "pcr-strip";
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

/** Forget the last signature, so the next render rebuilds the buttons. */
export function forget() {
  lastSig = null;
}

/** Draw, update or remove the strip for this client. Rebuilds only when the entries changed. */
export function render() {
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
/** The element and dock (core dockKey) last written, so an unchanged tick writes nothing. */
let dockedEl = null;
let lastDock = null;

/** Argon's Combat HUD module is enabled in this world (its id never changes within a session). */
const argonActive = () => game.modules.get("enhancedcombathud")?.active === true;

function stopDockPoll() {
  clearInterval(dockTimer);
  dockTimer = null;
}

function applyDock(el, dock) {
  const key = dockKey(dock);
  if (el === dockedEl && key === lastDock) return;
  dockedEl = el;
  lastDock = key;
  el.classList.toggle("pcr-floating", !!dock);
  el.style.bottom = dock ? `${dock.bottom}px` : "";
  el.style.left = dock ? `${dock.left}px` : "";
}

/**
 * Float the strip over Argon's action bar, or dock it. Argon opens, closes and re-renders without a
 * hook we can rely on, so while the strip exists, floatOverHud is on and Argon is enabled, look
 * again twice a second (one rect read); otherwise no poll at all (transform-creatures-40).
 */
export function placeStrip() {
  const el = stripEl();
  if (!el) { stopDockPoll(); return; }
  const floatOverHud = !!setting("floatOverHud");
  if (!shouldPollDock({ stripPresent: true, floatOverHud, argonActive: argonActive() })) {
    stopDockPoll();
    applyDock(el, null);
    return;
  }
  const bar = document.querySelector(".extended-combat-hud .action-hud") ?? document.querySelector(".extended-combat-hud");
  const r = bar && bar.offsetParent !== null ? bar.getBoundingClientRect() : null;
  applyDock(el, stripDock(r, window.innerHeight));
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

/** Mark the buttons of the tokens this client controls. */
export function markControlled() {
  const el = stripEl();
  if (!el || !canvas?.ready) return;
  for (const b of el.querySelectorAll(".pcr-token")) {
    b.classList.toggle("controlled", !!canvas.tokens.get(b.dataset.tokenId)?.controlled);
  }
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

/** Take the strip off the page and stop the dock poll. */
export function remove() {
  stripEl()?.remove();
  stopDockPoll();
  dockedEl = null;
  lastDock = null;
  lastSig = null;
}
