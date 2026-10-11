/**
 * A minimal DOM for the sheet strip (no jsdom): elements that record what the module builds, so a
 * render can be serialised and pinned. `document.createElement` is installed on globalThis.
 *
 * Selectors are not parsed. `querySelector(sel)` answers from the element's `queries` map (the
 * test wires the sheet's own nodes), `querySelectorAll(":scope > .x")` filters direct children by
 * class, and `closest(sel)` understands `.class` and `[data-action="x"]`.
 */

export class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.attrs = {};
    this.children = [];
    this.innerHTML = "";
    this.textContent = "";
    this.listeners = {};
    this.parent = null;
    this.queries = {};
  }

  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    const set = names => { el.className = [...new Set(names)].join(" "); };
    return {
      add: (...c) => set([...list(), ...c]),
      remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, force) => {
        const on = force === undefined ? !list().includes(c) : !!force;
        set(on ? [...list(), c] : list().filter(x => x !== c));
        return on;
      },
      contains: c => list().includes(c),
    };
  }

  append(...nodes) {
    for (const n of nodes) {
      n.parent = this;
      this.children.push(n);
    }
  }

  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  querySelector(sel) {
    return this.queries[sel] ?? null;
  }

  querySelectorAll(sel) {
    const m = /^:scope > \.([\w-]+)$/.exec(sel);
    return m ? this.children.filter(c => c.classList.contains(m[1])) : [];
  }

  after(node) {
    const p = this.parent;
    const i = p.children.indexOf(this);
    node.parent = p;
    p.children.splice(i + 1, 0, node);
  }

  remove() {
    const p = this.parent;
    if (p) p.children.splice(p.children.indexOf(this), 1);
    this.parent = null;
  }

  matches(sel) {
    let m = /^\.([\w-]+)$/.exec(sel);
    if (m) return this.classList.contains(m[1]);
    m = /^\[data-action="([\w-]+)"\]$/.exec(sel);
    if (m) return this.dataset.action === m[1];
    return false;
  }

  closest(sel) {
    for (let el = this; el; el = el.parent) if (el.matches(sel)) return el;
    return null;
  }
}

export function installDocument() {
  globalThis.document = { createElement: tag => new El(tag) };
}

/** A plain tree of what was built (listeners as their event names). */
export function serialise(el) {
  const out = { tag: el.tagName };
  if (el.className) out.className = el.className;
  if (Object.keys(el.dataset).length) out.dataset = { ...el.dataset };
  if (Object.keys(el.attrs).length) out.attrs = { ...el.attrs };
  for (const k of ["src", "alt", "type"]) if (el[k] !== undefined) out[k] = el[k];
  if (el.innerHTML) out.innerHTML = el.innerHTML;
  if (el.textContent) out.textContent = el.textContent;
  if (Object.keys(el.listeners).length) out.listeners = Object.keys(el.listeners);
  if (el.children.length) out.children = el.children.map(serialise);
  return out;
}

/**
 * The parts of a dnd5e character sheet the strip touches: root → .sidebar → .card (the strip goes
 * after it), and the inventory's `☀ value / max` counter.
 */
export function sheetElement() {
  const root = new El("section");
  const sidebar = new El("div");
  sidebar.className = "sidebar";
  const card = new El("div");
  card.className = "card";
  sidebar.append(card);
  root.append(sidebar);
  const counter = new El("div");
  counter.className = "attunement";
  sidebar.queries[":scope > .card"] = card;
  root.queries[".sidebar"] = sidebar;
  root.queries['[data-application-part="inventory"] .attunement'] = counter;
  return { root, sidebar, card, counter };
}

/** A fake DOM event on `target`, with the calls the listeners make recorded. */
export function domEvent(target, extra = {}) {
  const seen = [];
  return {
    target,
    seen,
    preventDefault: () => seen.push("preventDefault"),
    stopPropagation: () => seen.push("stopPropagation"),
    dataTransfer: {},
    ...extra,
  };
}
