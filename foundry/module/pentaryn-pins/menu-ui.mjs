/**
 * Pentaryn Pins — WIDGET: the GM canvas menu's DOM. Decisions come from core and canvas-menu.mjs;
 * this file only builds, positions and closes the `nav`.
 *
 * Items: `{ icon, label, run }` or `{ icon, label, sub: [{ label, enabled, note, run }] }`. A click
 * on an enabled entry closes the menu BEFORE its action runs, so a double click does nothing.
 * Text goes in through textContent, never innerHTML.
 */

import { CSS, menuPlacement } from "./pins-core.mjs";

let menu = null;

function el(tag, className = "", text = null) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== null) n.textContent = text;
  return n;
}

function row(item, i, j = null) {
  const a = el("a", `${CSS}item${item.enabled === false ? ` ${CSS}disabled` : ""}`);
  a.dataset.i = String(i);
  if (j !== null) a.dataset.j = String(j);
  if (item.enabled === false) a.setAttribute("aria-disabled", "true");
  if (item.icon) {
    const icon = el("i", `fa-solid ${item.icon}`);
    icon.setAttribute("inert", "");
    a.append(icon);
  }
  a.append(el("span", `${CSS}label`, item.label));
  if (item.note) a.append(el("span", `${CSS}note`, item.note));
  if (item.sub) a.append(el("i", `fa-solid fa-caret-right ${CSS}caret`));
  return a;
}

/** Is a DOM node inside the open menu? */
export function menuContains(node) {
  return !!menu && !!node && (menu === node || menu.contains?.(node) === true);
}

export function isOpen() {
  return !!menu;
}

export function closeMenu() {
  menu?.remove();
  menu = null;
}

/**
 * Open the menu at a client point. `onError(err)` gets an action's rejection.
 * @returns {HTMLElement} the menu
 */
export function openMenu({ x, y, items }, { onError = () => undefined } = {}) {
  closeMenu();
  const nav = el("nav", `${CSS}menu pentaryn-pins`);
  items.forEach((item, i) => {
    if (!item.sub) return void nav.append(row(item, i));
    const group = el("div", `${CSS}group`);
    group.append(row(item, i));
    const sub = el("div", `${CSS}sub`);
    item.sub.forEach((entry, j) => sub.append(row(entry, i, j)));
    group.append(sub);
    nav.append(group);
  });
  nav.style.left = `${x}px`;
  nav.style.top = `${y}px`;
  nav.addEventListener("click", ev => {
    const a = ev.target?.closest?.("a[data-i]");
    if (!a) return;
    const item = items[Number(a.dataset.i)];
    const entry = a.dataset.j !== undefined ? item?.sub?.[Number(a.dataset.j)] : item;
    if (!entry) return;
    if (entry.sub) return void a.parentElement?.classList?.toggle?.(`${CSS}open`);   // touch: open the submenu
    if (entry.enabled === false || typeof entry.run !== "function") return;
    closeMenu();
    Promise.resolve().then(entry.run).catch(onError);
  });
  document.body.append(nav);
  menu = nav;
  place(nav, x, y, items);
  return nav;
}

/**
 * Keep the menu and its submenu inside the window (Foundry's body clips overflow). The submenu is
 * display:none until hovered, so its size is estimated from the menu's own rows.
 */
function place(nav, x, y, items) {
  const r = nav.getBoundingClientRect?.();
  if (!r || !(r.width > 0) || !(r.height > 0)) return;
  const rowH = r.height / Math.max(1, items.length);
  const at = items.findIndex(item => item.sub);
  const subRows = at >= 0 ? items[at].sub.length : 0;
  const p = menuPlacement({ x, y, w: r.width, h: r.height, subW: subRows ? r.width : 0, subH: subRows * rowH,
    subTop: Math.max(0, at) * rowH, vw: globalThis.innerWidth ?? Infinity, vh: globalThis.innerHeight ?? Infinity });
  nav.style.left = `${p.left}px`;
  nav.style.top = `${p.top}px`;
  if (p.flipX) nav.classList.add(`${CSS}flip-x`);
  if (p.flipY) nav.classList.add(`${CSS}flip-y`);
}
