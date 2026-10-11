/**
 * Just enough DOM for the ties glue (no jsdom): elements with classes, dataset, attributes, children,
 * listeners, and a small selector engine — compounds of `tag`, `.class`, `[attr]`, `[attr="v"]`,
 * joined by descendant (` `) or child (`>`) combinators, comma lists, and a leading `:scope >`.
 * Anything else matches nothing. `innerHTML` is stored, never parsed; `firstElementChild` of an
 * element whose innerHTML was set is one placeholder element (`<parsed>`) whose queries find nothing.
 */

const SIMPLE = /^([a-z][\w-]*|\*)?((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i;

function parseCompound(src) {
  const m = SIMPLE.exec(src);
  if (!m) return null;
  const [, tag, rest] = m;
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
  const attrs = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(x => ({ name: x[1], value: x[2] }));
  return { tag: tag && tag !== "*" ? tag.toUpperCase() : null, classes, attrs };
}

/** "a b > c" → [{compound, comb}] right-to-left friendly list. */
function parseComplex(sel) {
  const parts = sel.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
  const out = [];
  let comb = null;
  for (const p of parts) {
    if (p === ">") {
      comb = ">";
      continue;
    }
    if (p === ":scope") {
      out.push({ scope: true, comb });
      comb = null;
      continue;
    }
    const c = parseCompound(p);
    if (!c) return null;
    out.push({ ...c, comb });
    comb = null;
  }
  return out;
}

const camel = name => name.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export class FakeElement {
  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.className = "";
    this.dataset = {};
    this.attrs = {};
    this.style = {};
    this.children = [];
    this.parent = null;
    this._html = "";
    this._placeholder = null;
    this.textContent = "";
    this.listeners = {};
    this.disabled = false;
    this.type = undefined;
  }
  get innerHTML() {
    return this._html;
  }
  set innerHTML(v) {
    this._html = String(v ?? "");
    this._placeholder = null;
  }
  get firstElementChild() {
    if (this.children.length) return this.children[0];
    if (!this._html) return null;
    this._placeholder ??= Object.assign(new FakeElement("parsed"), { parent: this });
    return this._placeholder;
  }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    const set = names => {
      el.className = [...new Set(names)].join(" ");
    };
    return {
      add: (...c) => set([...list(), ...c]),
      remove: (...c) => set(list().filter(x => !c.includes(x))),
      toggle: (c, force) => {
        const on = force === undefined ? !list().includes(c) : !!force;
        set(on ? [...list(), c] : list().filter(x => x !== c));
        return on;
      },
      contains: c => list().includes(c),
      forEach: fn => list().forEach(fn),
    };
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
  }
  getAttribute(k) {
    return this.attrs[k] ?? null;
  }
  appendChild(n) {
    n.parent?.children && n.remove();
    n.parent = this;
    this.children.push(n);
    return n;
  }
  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === "string") {
        this.textContent += n;
        continue;
      }
      this.appendChild(n);
    }
  }
  insertBefore(n, ref) {
    n.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(n);
    else this.children.splice(i, 0, n);
    return n;
  }
  remove() {
    const p = this.parent;
    if (p) p.children = p.children.filter(c => c !== this);
    this.parent = null;
  }
  contains(n) {
    for (let x = n; x; x = x.parent) if (x === this) return true;
    return false;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn);
  }
  async dispatch(type, extra = {}) {
    const seen = [];
    const ev = { type, target: this, preventDefault: () => seen.push("preventDefault"), stopPropagation: () => seen.push("stopPropagation"), ...extra };
    for (const fn of [...(this.listeners[type] ?? [])]) await fn(ev);
    return seen;
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 40, right: 100, bottom: 40 };
  }
  get offsetHeight() {
    return 40;
  }
  animate() {
    return { finished: Promise.resolve() };
  }
  blur() {}
  focus() {}
  /** Does this element satisfy one compound? */
  matchesCompound(c) {
    if (c.tag && this.tagName !== c.tag) return false;
    for (const cls of c.classes) if (!this.classList.contains(cls)) return false;
    for (const a of c.attrs) {
      let v;
      if (a.name.startsWith("data-")) v = this.dataset[camel(a.name)];
      else if (a.name === "class") v = this.className;
      else v = this.attrs[a.name] ?? this[a.name];
      if (v === undefined || v === null) return false;
      if (a.value !== undefined && String(v) !== a.value) return false;
    }
    return true;
  }
  /** Right-to-left match of a complex selector, `scopeEl` anchoring `:scope`. */
  matchesComplex(parts, scopeEl) {
    const step = (el, i) => {
      const p = parts[i];
      if (p.scope) return el === scopeEl;
      if (!el.matchesCompound(p)) return false;
      if (i === 0) return true;
      const next = parts[i].comb;
      if (next === ">") return !!el.parent && step(el.parent, i - 1);
      for (let a = el.parent; a; a = a.parent) if (step(a, i - 1)) return true;
      return false;
    };
    return step(this, parts.length - 1);
  }
  matches(sel) {
    return sel.split(",").some(s => {
      const parts = parseComplex(s);
      return !!parts && this.matchesComplex(parts, null);
    });
  }
  closest(sel) {
    for (let el = this; el; el = el.parent) if (el.matches(sel)) return el;
    return null;
  }
  querySelectorAll(sel) {
    const lists = sel.split(",").map(parseComplex).filter(Boolean);
    const out = [];
    const walk = n => {
      for (const c of n.children) {
        if (lists.some(parts => c.matchesComplex(parts, this))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
}

/** A tree of what was built, for golden pins (listeners as their event names). */
export function serialise(el) {
  const out = { tag: el.tagName };
  for (const k of ["id", "src", "alt", "title", "value", "name"]) if (el[k] !== undefined && el[k] !== "") out[k] = el[k];
  if (el.className) out.className = el.className;
  if (Object.keys(el.dataset).length) out.dataset = { ...el.dataset };
  if (Object.keys(el.attrs).length) out.attrs = { ...el.attrs };
  if (el.type !== undefined) out.type = el.type;
  if (Object.keys(el.style).length) out.style = { ...el.style };
  if (el.disabled) out.disabled = true;
  if (el.innerHTML) out.innerHTML = el.innerHTML;
  if (el.textContent) out.textContent = el.textContent;
  if (Object.keys(el.listeners).length) out.listeners = Object.keys(el.listeners).filter(k => el.listeners[k].length);
  if (el.children.length) out.children = el.children.map(serialise);
  return out;
}

export const el = (tag, { className = "", dataset = {}, children = [] } = {}) => {
  const e = new FakeElement(tag);
  e.className = className;
  Object.assign(e.dataset, dataset);
  for (const c of children) e.appendChild(c);
  return e;
};

/**
 * Install `document`, `window` and `HTMLElement`. `document` records its own listeners (the entry's
 * look-menu `pointerdown`/`keydown`) so a test can fire them.
 */
export function installDom() {
  const body = new FakeElement("body");
  const byId = new Map();
  const doc = {
    body,
    activeElement: null,
    listeners: [],
    createElement: tag => new FakeElement(tag),
    addEventListener(type, fn, capture) {
      this.listeners.push({ type, fn, capture: capture === true });
    },
    removeEventListener() {},
    getElementById: id => {
      if (byId.has(id)) return byId.get(id);
      const walk = n => {
        for (const c of n.children) {
          if (c.id === id) return c;
          const hit = walk(c);
          if (hit) return hit;
        }
        return null;
      };
      return walk(body);
    },
    byId,
  };
  globalThis.HTMLElement = FakeElement;
  globalThis.document = doc;
  globalThis.window = { innerWidth: 1200, innerHeight: 800 };
  return doc;
}
