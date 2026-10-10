/**
 * The swing strip and the weapon picker — our own small DOM, not Argon panels, so nothing here
 * depends on Argon's private classes. The strip sits just above the Argon HUD while a sequence
 * runs: "Swing 2 of 3 · Longsword → Goblin", with Adv/Dis for the next swing, Quick, and Stop.
 * When a swing's dialog is closed it turns into the pause bar: Resume / Retarget / weapon tiles /
 * Stop. Esc while paused = Stop.
 */

const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

let el = null;
let handlers = {};
let pending = null;        // resolve() of waitChoice
let cancelFns = [];
let lastCtx = null;

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
  const target = ctx.target ? ` → ${esc(ctx.target)}` : ` → <em>${esc(T("PENTARYN_COMBAT.Strip.NoTarget"))}</em>`;
  const kind = ctx.kind && ctx.kind !== "main" ? ` <span class="pc-kind">${esc(T(`PENTARYN_COMBAT.Kind.${ctx.kind}`))}</span>` : "";
  const advBtn = (value, label) =>
    `<button type="button" data-pc="adv" data-value="${value}" class="${ctx.adv === value ? "active" : ""}" data-tooltip="${esc(T("PENTARYN_COMBAT.Strip.AdvHint"))}">${esc(label)}</button>`;
  const tiles = paused && ctx.weapons?.length > 1
    ? `<div class="pc-weapons">${ctx.weapons.map(w =>
      `<button type="button" data-pc="swap" data-id="${esc(w.id)}" data-tooltip="${esc(T("PENTARYN_COMBAT.Strip.SwapHint", { weapon: w.name }))}"><img src="${esc(w.img)}" alt="">${esc(w.name)}</button>`).join("")}</div>`
    : "";
  el.classList.toggle("paused", paused);
  el.innerHTML = `
    <div class="pc-head">
      <strong>${esc(ctx.title ?? "")}</strong>
      <span class="pc-count">${esc(T("PENTARYN_COMBAT.Strip.SwingOf", { i: n.current, n: n.total }))}</span>
      <span class="pc-what">${esc(ctx.weapon)}${target}${kind}</span>
    </div>
    ${paused ? `<div class="pc-paused">${esc(T("PENTARYN_COMBAT.Strip.Paused"))}</div>` : ""}
    <div class="pc-row">
      ${paused ? `<button type="button" data-pc="resume" class="pc-primary">${esc(T("PENTARYN_COMBAT.Strip.Resume"))}</button>
                  <button type="button" data-pc="retarget">${esc(T("PENTARYN_COMBAT.Strip.Retarget"))}</button>` : ""}
      ${advBtn("advantage", T("PENTARYN_COMBAT.Strip.Adv"))}
      ${advBtn("disadvantage", T("PENTARYN_COMBAT.Strip.Dis"))}
      <label class="pc-quick" data-tooltip="${esc(T("PENTARYN_COMBAT.Strip.QuickHint"))}"><input type="checkbox" data-pc="quick" ${ctx.quick ? "checked" : ""}> ${esc(T("PENTARYN_COMBAT.Strip.Quick"))}</label>
      <button type="button" data-pc="stop" class="pc-stop" data-tooltip="${esc(T("PENTARYN_COMBAT.Strip.StopHint"))}">${esc(T("PENTARYN_COMBAT.Strip.Stop"))}</button>
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
}

export function hide() {
  if (pending) { const p = pending; pending = null; p({ type: "stop" }); }
  for (const fn of cancelFns.splice(0)) fn();
  document.removeEventListener("keydown", onKey, true);
  el?.remove();
  el = null;
  handlers = {};
  lastCtx = null;
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
    pickerEl.innerHTML = `<div class="pc-head"><strong>${esc(title)}</strong><span class="pc-what">${esc(T("PENTARYN_COMBAT.Picker.Hint"))}</span></div>
      <div class="pc-weapons">${tiles.map(t => `
        <button type="button" data-id="${esc(t.id)}">
          <img src="${esc(t.img)}" alt="">
          <span class="pc-name">${esc(t.name)}</span>
          <span class="pc-stats">${esc([t.toHit, t.damage].filter(Boolean).join(" · "))}</span>
          <span class="pc-swings">${esc(T("PENTARYN_COMBAT.Picker.Swings", { n: t.swings }))}</span>
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
