/**
 * A small DOM stand-in for node: elements with classes, data attributes, children, simple selectors
 * (`tag`, `.a`, `.a.b`, `tag.a`, `[data-x]`, `[data-x="v"]`, `tag[data-x]`), and events dispatched
 * with a capture phase (document → target) and a bubble phase (target → document) that honour
 * stopPropagation. Enough for the sheet badge and the canvas menu; never a browser.
 */

let seq = 0;

class FakeEvent {
  constructor(type, init = {}) {
    Object.assign(this, { button: 0, buttons: 0, clientX: 0, clientY: 0, key: null }, init);
    this.type = type;
    this.stopped = false;
    this.defaultPrevented = false;
  }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = true; }
  preventDefault() { this.defaultPrevented = true; }
}

function parseSelector(sel) {
  const m = /^([a-z0-9]*)((?:\.[\w-]+)*)((?:\[[\w-]+(?:="[^"]*")?\])*)$/i.exec(sel.trim());
  if (!m) throw new Error(`fake dom: unsupported selector ${sel}`);
  const classes = m[2] ? m[2].split(".").filter(Boolean) : [];
  const attrs = [...m[3].matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(a => [a[1], a[2]]);
  return { tag: m[1].toUpperCase(), classes, attrs };
}

export class FakeElement {
  constructor(tag = "div", doc = null) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.attrs = {};
    this.className = "";
    this._text = "";
    this.listeners = [];
    this.uid = ++seq;
  }
  get id() { return this.attrs.id ?? ""; }
  set id(v) { this.attrs.id = String(v); }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    return {
      contains: c => list().includes(c),
      add: c => { if (!list().includes(c)) el.className = [...list(), c].join(" "); },
      remove: c => { el.className = list().filter(x => x !== c).join(" "); },
      toggle: c => { if (list().includes(c)) el.className = list().filter(x => x !== c).join(" "); else el.className = [...list(), c].join(" "); },
    };
  }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(""); }
  set textContent(v) { this.children = []; this._text = String(v); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) {
    if (k.startsWith("data-")) {
      const key = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (key in this.dataset) return this.dataset[key];
    }
    return this.attrs[k] ?? null;
  }
  hasAttribute(k) { return this.getAttribute(k) !== null; }
  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === "string") { const t = new FakeElement("#text", this.ownerDocument); t._text = n; this.appendChild(t); }
      else this.appendChild(n);
    }
  }
  appendChild(child) {
    child.remove?.();
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  insertBefore(child, ref) {
    child.remove?.();
    child.parentElement = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(child);
    else this.children.splice(i, 0, child);
    return child;
  }
  /** `ChildNode#before`: insert `nodes` into this element's parent, right before it (no parent: nothing). */
  before(...nodes) {
    const parent = this.parentElement;
    if (!parent) return;
    for (const n of nodes) parent.insertBefore(n, this);
  }
  remove() {
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(c => c !== this);
    this.parentElement = null;
  }
  get isConnected() {
    let n = this;
    while (n.parentElement) n = n.parentElement;
    return n === this.ownerDocument?.documentElement;
  }
  contains(node) {
    for (let n = node; n; n = n.parentElement) if (n === this) return true;
    return false;
  }
  matches(sel) {
    if (this.tagName === "#TEXT") return false;
    return sel.split(",").some(one => {
      const { tag, classes, attrs } = parseSelector(one);
      if (tag && tag !== this.tagName) return false;
      if (!classes.every(c => this.classList.contains(c))) return false;
      return attrs.every(([k, v]) => {
        const got = this.getAttribute(k);
        return v === undefined ? got !== null : got === v;
      });
    });
  }
  closest(sel) {
    for (let n = this; n; n = n.parentElement) if (n.matches?.(sel)) return n;
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = el => { for (const c of el.children) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  addEventListener(type, fn, opts = false) {
    const capture = typeof opts === "boolean" ? opts : !!opts?.capture;
    this.listeners.push({ type, fn, capture });
  }
  removeEventListener(type, fn, opts = false) {
    const capture = typeof opts === "boolean" ? opts : !!opts?.capture;
    this.listeners = this.listeners.filter(l => !(l.type === type && l.fn === fn && l.capture === capture));
  }
  listenerCount(type) { return this.listeners.filter(l => l.type === type).length; }
  /** Layout stand-in: `FakeElement.sizes[tagName]` (default 0 × 0) at the element's style left/top. */
  getBoundingClientRect() {
    const { w = 0, h = 0 } = FakeElement.sizes[this.tagName] ?? {};
    const left = parseFloat(this.style.left) || 0, top = parseFloat(this.style.top) || 0;
    return { left, top, width: w, height: h, right: left + w, bottom: top + h, x: left, y: top };
  }
}
/** Sizes by tag name for getBoundingClientRect, e.g. `FakeElement.sizes.NAV = { w: 220, h: 60 }`. */
FakeElement.sizes = {};

/** Install `document` on globalThis with a body and a `#board` inside a `#board-wrap`. */
export function installDom() {
  const doc = { listeners: [] };
  const root = new FakeElement("html", doc);
  const body = new FakeElement("body", doc);
  root.appendChild(body);
  Object.assign(doc, {
    documentElement: root,
    body,
    createElement: tag => new FakeElement(tag, doc),
    getElementById: id => findById(root, id),
    addEventListener: (type, fn, opts) => root.addEventListener(type, fn, opts),
    removeEventListener: (type, fn, opts) => root.removeEventListener(type, fn, opts),
  });
  const wrap = new FakeElement("div", doc);
  wrap.id = "board-wrap";
  const board = new FakeElement("canvas", doc);
  board.id = "board";
  wrap.appendChild(board);
  body.appendChild(wrap);
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  return { doc, root, body, board, wrap };
}

function findById(el, id) {
  for (const c of el.children) {
    if (c.id === id) return c;
    const hit = findById(c, id);
    if (hit) return hit;
  }
  return null;
}

/** Dispatch an event at `target`: capture listeners root → target, then bubble target → root. */
export function dispatch(target, type, init = {}) {
  const ev = new FakeEvent(type, { target, ...init });
  const path = [];
  for (let n = target; n; n = n.parentElement) path.unshift(n);
  for (const node of path) {
    for (const l of node.listeners.filter(x => x.type === type && (x.capture || node === target))) {
      ev.currentTarget = node;
      l.fn(ev);
    }
    if (ev.stopped) return ev;
  }
  for (const node of [...path].reverse()) {
    if (node === target) continue;   // target-phase listeners ran above
    for (const l of node.listeners.filter(x => x.type === type && !x.capture)) {
      ev.currentTarget = node;
      l.fn(ev);
    }
    if (ev.stopped) return ev;
  }
  return ev;
}
