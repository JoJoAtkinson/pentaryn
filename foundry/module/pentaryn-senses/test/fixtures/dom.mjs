/**
 * Just enough DOM for the senses glue (no jsdom): elements with classes, dataset, attributes,
 * children, events, `closest`, `remove`, and the selectors the module uses — `tag`, `.a.b`,
 * `tag.a`, `[data-x]`, `[data-x="v"]`, `tag[data-x]`, `:scope > sel`, and one child combinator
 * `a > b`. An unsupported selector matches nothing.
 */

const camel = s => s.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export class FakeElement {
  constructor(tag = "div", { className = "", dataset = {}, children = [], attrs = {} } = {}) {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.dataset = { ...dataset };
    this.attrs = {};
    this.children = [];
    this.parent = null;
    this.innerHTML = "";
    this.type = "";
    this.listeners = {};
    for (const [k, v] of Object.entries(attrs)) this.setAttribute(k, v);
    for (const c of children) this.append(c);
  }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { el.className = [...new Set([...list(), ...c])].join(" "); },
      remove: (...c) => { el.className = list().filter(x => !c.includes(x)).join(" "); },
      contains: c => list().includes(c),
    };
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  setAttribute(k, v) {
    if (k.startsWith("data-")) this.dataset[camel(k)] = String(v);
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k.startsWith("data-")) return this.dataset[camel(k)] ?? null;
    return this.attrs[k] ?? null;
  }
  append(...nodes) {
    for (const n of nodes) { n.parent = this; this.children.push(n); }
  }
  appendChild(n) {
    this.append(n);
    return n;
  }
  after(n) {
    const p = this.parent;
    if (!p) return;
    n.parent = p;
    p.children.splice(p.children.indexOf(this) + 1, 0, n);
  }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter(c => c !== this);
    this.parent = null;
  }
  closest(sel) {
    for (let n = this; n; n = n.parent) if (n.matches(sel)) return n;
    return null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  /** Dispatch a click; returns the event so a test can see preventDefault/stopPropagation. */
  click() {
    const ev = { prevented: false, stopped: false, target: this, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
    for (const fn of this.listeners.click ?? []) fn(ev);
    return ev;
  }
  matches(sel) {
    const child = /^(.+?)\s*>\s*([^>]+)$/.exec(sel.trim());
    if (child && !sel.trim().startsWith(":scope")) return this.matches(child[2]) && !!this.parent?.matches(child[1]);
    const m = /^([a-z]*)((?:\.[\w-]+)*)(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i.exec(sel.trim());
    if (!m) return false;
    const [, tag, classes, attr, value] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const c of classes.split(".").filter(Boolean)) if (!this.classList.contains(c)) return false;
    if (attr) {
      const got = this.getAttribute(attr);
      if (got === null) return false;
      if (value !== undefined && got !== value) return false;
    }
    return true;
  }
  querySelectorAll(sel) {
    const scoped = /^:scope\s*>\s*(.+)$/.exec(sel);
    if (scoped) return this.children.filter(c => c.matches(scoped[1]));
    const out = [];
    const walk = n => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  /** A compact, stable picture of the subtree for goldens. */
  toJSON() {
    const out = { tag: this.tagName.toLowerCase() };
    if (this.className) out.class = this.className;
    if (this.type) out.type = this.type;
    if (Object.keys(this.dataset).length) out.data = { ...this.dataset };
    if (Object.keys(this.attrs).length) out.attrs = { ...this.attrs };
    if (this.innerHTML) out.html = this.innerHTML;
    if (this.children.length) out.children = this.children.map(c => c.toJSON());
    return out;
  }
}

export const el = (tag, opts) => new FakeElement(tag, opts);

/** `window` with capture listeners a test can dispatch to. */
export function fakeWindow() {
  const listeners = new Map();   // type → [{fn, capture}]
  return {
    listeners,
    addEventListener(type, fn, capture) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push({ fn, capture: !!capture });
    },
    removeEventListener(type, fn) {
      const list = listeners.get(type) ?? [];
      const i = list.findIndex(l => l.fn === fn);
      if (i >= 0) list.splice(i, 1);
    },
    dispatch(type, ev) {
      for (const l of [...(listeners.get(type) ?? [])]) l.fn(ev);
    },
    count(type) {
      return (listeners.get(type) ?? []).length;
    },
  };
}

/** Install `document`, `HTMLElement` and `window` globals backed by the fakes. */
export function installDom() {
  const body = el("body");
  globalThis.HTMLElement = FakeElement;
  globalThis.document = { createElement: tag => new FakeElement(tag), body };
  globalThis.window = fakeWindow();
  return { body, window: globalThis.window };
}
