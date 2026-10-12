/**
 * The swing strip and the weapon picker — our own small DOM, not Argon panels, so nothing here
 * depends on Argon's private classes. The strip sits just above the Argon HUD while a sequence
 * runs: "Swing 2 of 3 · Longsword → Goblin", with Adv/Dis for the next swing, Quick, and Stop.
 * When a swing's dialog is closed it turns into the pause bar: Resume / Retarget / weapon tiles /
 * Stop. Esc while paused = Stop.
 */

import { MODULE, dockRect, swingTag, clampToView, keyFor } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { setting } from "./settings.mjs";

const log = makeLog(MODULE);


let el = null;
let handlers = {};
let pending = null;        // resolve() of waitChoice
let cancelFns = [];
let lastCtx = null;
let enterAction = null;    // the open roll window's default button (normal / advantage / disadvantage)

function esc(s) {
  return foundry.utils.escapeHTML ? foundry.utils.escapeHTML(String(s ?? "")) : String(s ?? "").replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
}

function anchor() {
  const hud = document.querySelector(".extended-combat-hud .action-hud") ?? document.querySelector(".extended-combat-hud");
  const r = hud?.getBoundingClientRect?.();
  return r && r.height ? Math.max(8, window.innerHeight - r.top + 8) : 120;
}

/**
 * The dnd5e roll dialog (attack or damage) a focused element sits in, or null. dnd5e autofocuses the
 * dialog's default button (Normal) and Foundry's KeyboardManager ignores every key while a form
 * button has focus, so a plain Esc on a fresh roll dialog did nothing until the player clicked it.
 */
function rollDialogOf(target) {
  if (!(target instanceof HTMLButtonElement)) return null;   // text fields and selects keep native Esc
  const host = target.closest(".application.roll-configuration");
  return host ? (foundry.applications.instances.get(host.id) ?? null) : null;
}

function onKey(ev) {
  if (ev.key !== "Escape" || !el) return;
  if (lastCtx?.status === "paused") {
    ev.preventDefault();
    ev.stopPropagation();
    choose({ type: "stop" });
    return;
  }
  // A swing's roll dialog is open: Esc closes it, which pauses the sequence (the help line's promise).
  const dialog = lastCtx?.status === "running" ? rollDialogOf(ev.target) : null;
  if (!dialog) return;
  ev.preventDefault();
  ev.stopPropagation();
  dialog.close();
}

function paint(ctx) {
  if (!el) return;
  lastCtx = ctx;
  const n = ctx.numbers ?? { current: 1, total: 1 };
  const paused = ctx.status === "paused";
  const target = ctx.target ? ` → ${esc(ctx.target)}` : ` → <em>${esc(_loc("PENTARYN_COMBAT.Strip.NoTarget"))}</em>`;
  const kind = ctx.kind && ctx.kind !== "main" ? ` <span class="pc-kind">${esc(_loc(keyFor("Kind", ctx.kind)))}</span>` : "";
  const advBtn = (value, label) =>
    `<button type="button" data-pc="adv" data-value="${value}" class="${ctx.adv === value ? "active" : ""}" data-tooltip="${esc(_loc("PENTARYN_COMBAT.Strip.AdvHint"))}">${esc(label)}</button>`;
  // Each tile says what the weapon does (to hit · damage), so a swap mid-sequence is an informed one.
  const tiles = paused && ctx.weapons?.length > 1
    ? `<div class="pc-weapons">${ctx.weapons.map(w =>
      `<button type="button" data-pc="swap" data-id="${esc(w.id)}" data-tooltip="${esc(_loc("PENTARYN_COMBAT.Strip.SwapHint", { weapon: w.name }))}"><img src="${esc(w.img)}" alt=""><span class="pc-name">${esc(w.name)}</span>${w.stats ? `<span class="pc-stats">${esc(w.stats)}</span>` : ""}</button>`).join("")}</div>`
    : "";
  // Enter takes the roll window's highlighted (autofocused) button: Advantage under Reckless or Steady
  // Aim, not always Normal (usability Area 3, D1).
  const keys = paused ? _loc("PENTARYN_COMBAT.Strip.KeysPaused")
    : _loc("PENTARYN_COMBAT.Strip.KeysAction", { action: _loc(keyFor("Strip.Action", enterAction ?? "normal")) });
  el.classList.toggle("paused", paused);
  el.innerHTML = `
    <div class="pc-head">
      <strong>${esc(ctx.title ?? "")}</strong>
      <span class="pc-count">${esc(_loc("PENTARYN_COMBAT.Strip.SwingOf", { i: n.current, n: n.total }))}</span>
      <span class="pc-what">${esc(ctx.weapon)}${target}${kind}</span>
      <span class="pc-keys">${esc(keys)}</span>
    </div>
    ${paused ? `<div class="pc-paused">${esc(_loc("PENTARYN_COMBAT.Strip.Paused"))} ${esc(_loc(keyFor("Strip.PausedNote", ctx.note ?? "main")))}</div>` : ""}
    <div class="pc-row">
      ${paused ? `<button type="button" data-pc="resume" class="pc-primary">${esc(_loc("PENTARYN_COMBAT.Strip.Resume"))}</button>
                  <button type="button" data-pc="retarget">${esc(_loc("PENTARYN_COMBAT.Strip.Retarget"))}</button>` : ""}
      ${advBtn("advantage", _loc("PENTARYN_COMBAT.Strip.Adv"))}
      ${advBtn("disadvantage", _loc("PENTARYN_COMBAT.Strip.Dis"))}
      <label class="pc-quick" data-tooltip="${esc(_loc("PENTARYN_COMBAT.Strip.QuickHint"))}"><input type="checkbox" data-pc="quick" ${ctx.quick ? "checked" : ""}> ${esc(_loc("PENTARYN_COMBAT.Strip.Quick"))}</label>
      <button type="button" data-pc="stop" class="pc-stop" data-tooltip="${esc(_loc("PENTARYN_COMBAT.Strip.StopHint"))}">${esc(_loc("PENTARYN_COMBAT.Strip.Stop"))}</button>
    </div>
    ${tiles}`;
  el.style.bottom = `${anchor()}px`;
}

function onClick(ev) {
  const b = ev.target.closest("[data-pc]");
  if (!b || b.dataset.pc === "quick") return;
  ev.preventDefault();
  const what = b.dataset.pc;
  if (what === "adv") {
    if (lastCtx?.status === "paused") choose({ type: "adv", value: b.dataset.value });
    else handlers.onAdv?.(b.dataset.value);
  } else if (what === "stop") {
    for (const fn of cancelFns.splice(0)) fn();
    // A swing's roll window still open closes unrolled (sequence.mjs onStop; U-10-11, which replaced
    // U-10-4's "focus goes back to the open window" — there is no window left to roll).
    handlers.onStop?.();
    choose({ type: "stop" });
  } else if (what === "resume") choose({ type: "resume" });
  else if (what === "retarget") choose({ type: "retarget" });
  else if (what === "swap") choose({ type: "swap", weaponId: b.dataset.id });
}

function onChange(ev) {
  const b = ev.target.closest("[data-pc='quick']");
  if (b) handlers.onQuick?.(b.checked);
}

export function show(ctx, h = {}) {
  hide();
  handlers = h;
  el = document.createElement("div");
  el.id = "pentaryn-combat-strip";
  el.className = "pentaryn-combat-strip";
  el.addEventListener("click", onClick);
  el.addEventListener("change", onChange);
  document.body.appendChild(el);
  document.addEventListener("keydown", onKey, true);
  paint(ctx);
}

export function update(ctx) {
  paint(ctx);
  redock();
}

/* ── roll windows docked above the strip (setting dockRollDialogs) ─────────── */
// Area 2: the first swing's window (and the taller ones with Ability / Weapon Mastery rows) sat over
// the strip, hiding Adv / Dis / Quick / Stop until the player pressed Esc, and its Normal button
// moved between swings. While a sequence runs, every dnd5e roll window and the manual-dice Roll
// Resolution window has its bottom edge just above the strip and says which swing it is.

const docked = new Set();
let dockLast = null;          // {left, bottom} of a window the player dragged (kept for this session)

function docking() {
  return !!el && lastCtx?.status === "running" && !el.classList.contains("picking") && setting("dockRollDialogs");
}

function moved(app) {
  const d = app?._pcDock;
  const p = app?.position ?? {};
  return !!d && (Math.round(p.left) !== d.left || Math.round(p.top) !== d.top);
}

function dock(app) {
  const win = app?.element;
  if (!docking() || !win?.isConnected || moved(app)) return;
  const r = win.getBoundingClientRect();
  if (!r.height) return;
  const { left, top } = dockRect({
    stripTop: el.getBoundingClientRect().top, height: r.height, width: r.width,
    viewW: window.innerWidth, viewH: window.innerHeight, last: dockLast
  });
  app.setPosition({ left, top });
  // What the window really got (setPosition clamps), so only a drag by the player reads as "moved".
  const p = app.position ?? {};
  app._pcDock = { left: Math.round(p.left ?? left), top: Math.round(p.top ?? top), height: r.height };
  docked.add(app);
}

function redock() {
  for (const app of [...docked]) {
    if (!app.element?.isConnected) { docked.delete(app); continue; }
    dock(app);
  }
}

function tagTitle(app, { weapon = false } = {}) {
  const tag = swingTag({ ...(lastCtx?.numbers ?? {}), weapon: lastCtx?.weapon, kind: lastCtx?.kind, status: lastCtx?.status });
  const title = app?.window?.title;
  if (!tag || tag.n < 2 || !title || title.dataset.pcSwing) return;
  const kind = tag.kind !== "main" ? ` (${_loc(keyFor("Kind", tag.kind))})` : "";
  const text = _loc(weapon ? "PENTARYN_COMBAT.Strip.SwingTagWeapon" : "PENTARYN_COMBAT.Strip.SwingTag", { weapon: tag.weapon, i: tag.i, n: tag.n }) + kind;
  title.dataset.pcSwing = "1";
  title.textContent = `${title.textContent} · ${text}`;
}

/** Read the roll window's default button so the strip's "Enter = …" says what Enter will do. */
function readEnter(app) {
  if (!el) return;
  const b = app?.element?.querySelector?.("button[autofocus][data-action]");
  const action = ["normal", "advantage", "disadvantage", "critical"].includes(b?.dataset?.action) ? b.dataset.action : null;
  if (action === enterAction) return;
  enterAction = action;
  if (lastCtx) paint(lastCtx);
}

/* ── focus: Enter means what the strip says ───────────────────────────────── */
// Area 10 (U-R-1): after "New target" the resumed swing's window opened without focus (the pick's
// canvas click ended after it rendered), so Enter did nothing until the player clicked Normal.

function topRollWindow() {
  const open = [...document.querySelectorAll(".application.roll-configuration")];
  return open.sort((a, b) => (Number(getComputedStyle(b).zIndex) || 0) - (Number(getComputedStyle(a).zIndex) || 0))[0] ?? null;
}

function typingElsewhere(a, win) {
  if (!a || win?.contains(a)) return false;
  return a instanceof HTMLInputElement || a instanceof HTMLTextAreaElement || a instanceof HTMLSelectElement || !!a.isContentEditable;
}

/**
 * Give the open roll window's default button the focus. Never takes it from a text field the player
 * is typing in elsewhere (chat, a Roll Resolution box); without `force` it leaves a focus already
 * inside the window alone.
 */
export function focusRollWindow({ force = false } = {}) {
  if (!setting("dockRollDialogs")) return false;
  const win = topRollWindow();
  if (!win) return false;
  const a = document.activeElement;
  if (typingElsewhere(a, win)) return false;
  if (!force && a && a !== document.body && win.contains(a)) return true;
  const b = win.querySelector("button[autofocus]") ?? win.querySelector('button[data-action="normal"]');
  b?.focus?.();
  return !!b;
}

function settleFocus() {
  if (!el) return;
  // Twice: once the frame paints, and again after a pick's pointerup has landed on the canvas.
  requestAnimationFrame(() => focusRollWindow());
  setTimeout(() => focusRollWindow(), 150);
}

export function onRollWindow(app, { weapon = false } = {}) {
  try { if (app?.element?.classList?.contains("roll-configuration")) readEnter(app); } catch (err) { log.debug("read Enter (the hint stays)", err); }
  try { if (app?.element?.classList?.contains("roll-configuration")) settleFocus(); } catch (err) { log.debug("settle focus (the player clicks)", err); }
  try {
    if (!docking()) { requestAnimationFrame(() => keepOnScreen(app)); return; }
    tagTitle(app, { weapon });
    // After the frame paints, so the window's real height is known.
    requestAnimationFrame(() => dock(app));
    dock(app);
  } catch (err) { log.warn("roll window dock", err); }
}

/**
 * Outside a Full Attack a roll window keeps dnd5e's place, but never past the viewport's edge
 * (Area 10: Lay on Hands' Healing roll opened at the bottom right, its buttons off screen).
 */
function keepOnScreen(app) {
  if (!setting("dockRollDialogs")) return;
  const win = app?.element;
  if (!win?.isConnected || typeof app.setPosition !== "function") return;
  const r = win.getBoundingClientRect();
  if (!r.height || !r.width) return;
  const to = clampToView({ left: r.left, top: r.top, width: r.width, height: r.height, viewW: window.innerWidth, viewH: window.innerHeight });
  if (to) app.setPosition(to);
}

export function onRollWindowClose(app) {
  try {
    if (moved(app)) {
      const p = app.position ?? {};
      dockLast = { left: Math.round(p.left), bottom: Math.round(p.top + (app._pcDock?.height ?? 0)) };
    }
    docked.delete(app);
  } catch (err) { log.debug("roll window close (closing anyway)", err); }
}

// Registered by roll-dock.mjs (a feature installed first in combat.mjs).

export function hide() {
  if (pending) { const p = pending; pending = null; p({ type: "stop" }); }
  for (const fn of cancelFns.splice(0)) fn();
  document.removeEventListener("keydown", onKey, true);
  el?.remove();
  el = null;
  handlers = {};
  lastCtx = null;
  enterAction = null;
  docked.clear();
}

/**
 * While the player picks a target the strip fades and lets clicks through to the tokens under it
 * (it sits over the lower token row); its Stop button stays clickable.
 */
export function picking(on) {
  el?.classList.toggle("picking", !!on);
}

/** Wait for a pause-bar choice: resume | retarget | swap | adv | stop. */
export function waitChoice(ctx) {
  paint(ctx);
  return new Promise(resolve => { pending = resolve; });
}

export function choose(choice) {
  if (!pending) return;
  const p = pending;
  pending = null;
  p(choice);
}

/** Called when the strip's Stop is pressed (used by the fallback target wait). */
export function onceCancel(fn) {
  cancelFns.push(fn);
}

/* ── weapon picker ───────────────────────────────────────────────────────── */

let pickerEl = null;

/**
 * A row of weapon tiles above the HUD; one click picks. Resolves to the weapon id, or null on
 * Esc / a click elsewhere.
 * @param {{id, name, img, toHit, damage, swings}[]} tiles
 */
export function pickWeapon(tiles, { title = "" } = {}) {
  pickerEl?.remove();
  return new Promise(resolve => {
    const done = (id) => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
      pickerEl?.remove();
      pickerEl = null;
      resolve(id);
    };
    const outside = (ev) => { if (pickerEl && !pickerEl.contains(ev.target)) done(null); };
    const key = (ev) => { if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); done(null); } };
    pickerEl = document.createElement("div");
    pickerEl.className = "pentaryn-combat-strip pentaryn-combat-picker";
    pickerEl.innerHTML = `<div class="pc-head"><strong>${esc(title)}</strong><span class="pc-what">${esc(_loc("PENTARYN_COMBAT.Picker.Hint"))}</span></div>
      <div class="pc-weapons">${tiles.map(t => `
        <button type="button" data-id="${esc(t.id)}">
          <img src="${esc(t.img)}" alt="">
          <span class="pc-name">${esc(t.name)}</span>
          <span class="pc-stats">${esc([t.toHit, t.damage].filter(Boolean).join(" · "))}</span>
          <span class="pc-swings">${esc(_loc("PENTARYN_COMBAT.Picker.Swings", { n: t.swings }))}</span>
        </button>`).join("")}</div>`;
    pickerEl.addEventListener("click", ev => {
      const b = ev.target.closest("button[data-id]");
      if (b) done(b.dataset.id);
    });
    document.body.appendChild(pickerEl);
    pickerEl.style.bottom = `${anchor()}px`;
    // Next tick: the right-click that opened it must not count as "outside".
    setTimeout(() => {
      document.addEventListener("pointerdown", outside, true);
      document.addEventListener("keydown", key, true);
    }, 0);
  });
}
