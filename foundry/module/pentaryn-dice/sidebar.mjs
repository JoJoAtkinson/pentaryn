/**
 * Pentaryn Dice — the Dice So Nice sidebar helpers and the select-all shortcut. One feature.
 *
 * On `renderDsnSidebarTab` (Dice So Nice 6.4's `DsnSidebarTab`, an AppV2 sidebar tab whose whole
 * content is re-rendered on every persistent-dice change), each die row gets a count box, a
 * "+ ×N" button and a "select all of this type" button; below the list, "Select all my dice",
 * "Clear selection" and the Ctrl+click hint that Dice So Nice keeps behind its Help toggle.
 *
 * Our buttons carry no `data-action`, so Dice So Nice's AppV2 action delegation never sees them;
 * they get their own click listeners. Every string is set as textContent (no innerHTML).
 * Adjustments row dsn-sidebar-tab-dom.
 */

import { CSS, MAX_COUNT, bindingLabel, clampCount, idsToSelect } from "./dice-core.mjs";
import { selectAllBinding } from "./settings.mjs";
import { clearSelection, listDice, ready, rerenderTab, selectMine, spawn } from "./dsn-adapter.mjs";
import { htmlRoot } from "./lib/api.mjs";

/** Session state: the last count typed per die type, so a re-render keeps it. Never persisted. */
const counts = new Map();
let installed = false;
let spawning = false;
let ctxRef = null;

const L = (key, data) => globalThis._loc(key, data);
const userId = () => globalThis.game?.user?.id ?? null;

function el(tag, { cls, text, title, attrs } = {}) {
  const node = globalThis.document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  if (title) node.title = title;
  for (const [k, v] of Object.entries(attrs ?? {})) node.setAttribute(k, String(v));
  return node;
}

function button(cls, { text, icon, title }) {
  const b = el("button", { cls: `${CSS}btn ${cls}`, title, attrs: { type: "button" } });
  if (icon) b.append(el("i", { cls: icon, attrs: { "aria-hidden": "true", inert: "" } }));
  if (text != null) b.append(el("span", { text }));
  return b;
}

async function spawnClicked(type, input, btn) {
  if (spawning || !ready()) return;
  const n = clampCount(input.value);
  counts.set(type, n);
  spawning = true;
  btn.disabled = true;
  try {
    const out = await spawn({ type, count: n });
    if (out?.stopped && out.spawned < out.requested) {
      ctxRef?.log.notify("warn", L("PENTARYN_DICE.Notify.stopped", { spawned: out.spawned, requested: out.requested, type: type.toUpperCase() }));
    }
  } catch (err) {
    ctxRef?.log.error("spawn failed", err);
  } finally {
    spawning = false;
    btn.disabled = false;
  }
}

function decorateRow(row) {
  const type = row.dataset?.type;
  const buttons = row.querySelector(".dsn-toolbox-dice-buttons");
  if (!type || !buttons || buttons.querySelector(`.${CSS}count`)) return false;
  const label = type.toUpperCase();
  const input = el("input", {
    cls: `${CSS}count`,
    title: L("PENTARYN_DICE.Sidebar.countTitle", { type: label }),
    attrs: { type: "number", min: 1, max: MAX_COUNT, step: 1, inputmode: "numeric" },
  });
  input.value = String(counts.get(type) ?? 1);
  input.addEventListener("change", () => {
    const n = clampCount(input.value);
    counts.set(type, n);
    input.value = String(n);
  });
  const add = button(`${CSS}spawn`, { text: L("PENTARYN_DICE.Sidebar.spawn"), title: L("PENTARYN_DICE.Sidebar.spawnTitle", { type: label }) });
  add.addEventListener("click", ev => {
    ev.preventDefault?.();
    void spawnClicked(type, input, add);
  });
  const pick = button(`${CSS}select-type`, { icon: "fa-solid fa-object-group", title: L("PENTARYN_DICE.Sidebar.selectTypeTitle", { type: label }) });
  pick.addEventListener("click", ev => {
    ev.preventDefault?.();
    selectMine({ userId: userId(), type });
  });
  buttons.prepend(input);
  buttons.append(add, pick);
  return true;
}

function actionsSection() {
  const section = el("section", { cls: `dsn-toolbox-section ${CSS}actions` });
  const row = el("div", { cls: `${CSS}row` });
  const all = button(`${CSS}select-all`, { icon: "fa-solid fa-object-group", text: L("PENTARYN_DICE.Sidebar.selectAll") });
  all.addEventListener("click", ev => {
    ev.preventDefault?.();
    selectMine({ userId: userId() });
  });
  const clear = button(`${CSS}clear`, { icon: "fa-solid fa-object-ungroup", text: L("PENTARYN_DICE.Sidebar.clear") });
  clear.addEventListener("click", ev => {
    ev.preventDefault?.();
    clearSelection();
  });
  row.append(all, clear);
  const key = bindingLabel(selectAllBinding());
  const hint = el("p", {
    cls: `${CSS}hint`,
    text: key ? L("PENTARYN_DICE.Sidebar.hint", { key }) : L("PENTARYN_DICE.Sidebar.hintNoKey"),
  });
  section.append(row, hint);
  return section;
}

/**
 * Add the helpers to one render of the tab. Idempotent: a second call on the same DOM adds nothing.
 * @returns {number} rows decorated (0 when the tab has no dice list: persistent dice off, not ready)
 */
export function decorate(element) {
  const root = htmlRoot(element);
  if (!root) return 0;
  const rows = [...root.querySelectorAll("li.dsn-toolbox-dice-row[data-type]")];
  if (!rows.length) return 0;
  let n = 0;
  for (const row of rows) if (decorateRow(row)) n += 1;
  if (!root.querySelector(`section.${CSS}actions`)) {
    const anchor = root.querySelector("section.dsn-toolbox-clear");
    const section = actionsSection();
    if (anchor) anchor.before(section);
    else rows[0].closest("section")?.after(section);
  }
  return n;
}

/**
 * The select-all shortcut. Returns false (Foundry passes the key on) unless it selected something:
 * helpers off, Dice So Nice not ready, or none of your dice on the table.
 */
export function onSelectAllKey() {
  if (!installed || !ctxRef?.setting("enabled") || !ready()) return false;
  if (!idsToSelect(listDice(), { userId: userId() }).length) return false;
  selectMine({ userId: userId() });
  return true;
}

/** The `enabled` setting's onChange: redraw the tab so the helpers appear or go. */
export function onEnabledChange() {
  if (installed) rerenderTab();
}

export function install(reg, ctx) {
  ctxRef = ctx;
  installed = true;
  reg.on("renderDsnSidebarTab", (app, element) => {
    if (!ctx.setting("enabled")) return;
    decorate(element);
  }, { label: "renderDsnSidebarTab: helpers" });
}

export function uninstall() {
  installed = false;
  spawning = false;
  counts.clear();
}
