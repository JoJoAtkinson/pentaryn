/**
 * Just enough DOM for the ties glue (no jsdom): elements with classes, dataset, attributes, children,
 * listeners, and a small selector engine — compounds of `tag`, `.class`, `[attr]`, `[attr="v"]`,
 * joined by descendant (` `) or child (`>`) combinators, comma lists, and a leading `:scope >`.
 * Anything else matches nothing.
 *
 * `innerHTML` is kept as the string it was set to (that is what `serialise` prints) AND parsed, lazily,
 * into a second list of nodes that queries, `firstElementChild` and event bubbling walk — so a module's
 * `bind(root)` finds its rows and buttons and a test can click them. The parser knows tags, quoted and
 * bare attributes, void elements, comments and the five entities the module escapes; `value` / `checked`
 * / `selected` come off the markup (a textarea's value is its text, a select's is its selected option).
 */

const SIMPLE = /^([a-z][\w-]*|\*)?((?:\.[\w-]+|\[[\w-]+(?:="[^"]*")?\])*)$/i;

function parseCompound(src) {
  // pseudo-classes understood: :not(<simple compound>) and :focus (document.activeElement)
  const nots = [];
  let focus = false;
  const bare = src
    .replace(/:not\(([^()]*)\)/g, (m, inner) => {
      nots.push(parseCompound(inner.trim()));
      return "";
    })
    .replace(/:focus\b/g, () => {
      focus = true;
      return "";
    });
  if (nots.includes(null)) return null;
  const m = SIMPLE.exec(bare);
  if (!m) return null;
  const [, tag, rest] = m;
  const classes = [...rest.matchAll(/\.([\w-]+)/g)].map(x => x[1]);
  const attrs = [...rest.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].map(x => ({ name: x[1], value: x[2] }));
  return { tag: tag && tag !== "*" ? tag.toUpperCase() : null, classes, attrs, nots, focus };
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

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const decode = s =>
  String(s).replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: "\u00a0" })[e]);

/** Markup → FakeElements (top level), each child's `parent` set, `owner` the element they hang from. */
export function parseHTML(html, owner = null) {
  const top = [];
  const stack = [];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  const add = node => {
    const parent = stack.at(-1) ?? null;
    node.parent = parent ?? owner;
    if (parent) parent._kids.push(node);
    else top.push(node);
  };
  for (const m of String(html ?? "").matchAll(re)) {
    const [, close, open, attrs, selfClose, text] = m;
    if (text !== undefined) {
      const t = decode(text);
      for (const n of stack) n.textContent += t;
      continue;
    }
    if (close) {
      const i = stack.map(n => n.tagName).lastIndexOf(close.toUpperCase());
      if (i >= 0) {
        const closed = stack.splice(i);
        for (const n of closed) n._finish();
      }
      continue;
    }
    if (!open) continue; // a comment
    const el = new FakeElement(open);
    el._fromMarkup = true;
    for (const a of (attrs ?? "").matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const name = a[1].toLowerCase();
      const value = decode(a[2] ?? a[3] ?? a[4] ?? "");
      const bare = a[2] === undefined && a[3] === undefined && a[4] === undefined;
      if (name === "class") el.className = value;
      else if (name === "id") el.id = value;
      else if (name.startsWith("data-")) el.dataset[camel(name)] = value;
      else if (["checked", "selected", "disabled", "hidden", "readonly", "multiple"].includes(name)) el[name === "readonly" ? "readOnly" : name] = true;
      else if (name === "value") el.value = value;
      else if (name === "type") el.type = value;
      else if (name === "name") el.name = value;
      else el.attrs[name] = bare ? "" : value;
    }
    add(el);
    if (!VOID.has(open.toLowerCase()) && !selfClose) stack.push(el);
    else el._finish();
  }
  for (const n of stack.splice(0)) n._finish();
  return top;
}

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
    this._kids = [];
    this._parsedFor = null;
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
    this._kids = [];
    this._parsedFor = null;
    if (this._fromMarkup) this.textContent = "";
  }
  /** Children from markup: parsed once per innerHTML value (markup-born elements carry them already). */
  get parsedChildren() {
    if (this._fromMarkup && this._parsedFor === null && !this._html) return this._kids;
    if (this._parsedFor !== this._html) {
      this._kids = this._html ? parseHTML(this._html, this) : [];
      this._parsedFor = this._html;
    }
    return this._kids;
  }
  /** Every child node: appended ones, then the ones parsed from innerHTML. */
  get nodes() {
    return [...this.children, ...this.parsedChildren];
  }
  get firstElementChild() {
    return this.nodes[0] ?? null;
  }
  get parentElement() {
    return this.parent;
  }
  /** A markup-born element is complete: its value defaults come off its content. */
  _finish() {
    this._parsedFor = null;
    if (this.tagName === "INPUT" && this.value === undefined) this.value = "";
    if (this.tagName === "TEXTAREA" && this.value === undefined) this.value = this.textContent;
    if (this.tagName === "SELECT" && this.value === undefined) {
      const opts = this.querySelectorAll("option");
      const sel = opts.find(o => o.selected) ?? opts[0];
      this.value = sel ? sel.value ?? sel.textContent : "";
    }
  }
  get options() {
    return this.querySelectorAll("option");
  }
  get selectedOptions() {
    return this.querySelectorAll("option").filter(o => (o.value ?? o.textContent) === this.value);
  }
  insertAdjacentHTML(pos, html) {
    const made = parseHTML(html, this);
    if (pos === "afterbegin") this._kids.unshift(...made);
    else this._kids.push(...made);
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.innerHTML = "";
    this.append(...nodes);
  }
  replaceWith(n) {
    const p = this.parent;
    if (!p) return;
    for (const list of [p.children, p._kids]) {
      const i = list.indexOf(this);
      if (i >= 0) {
        n.parent = p;
        list.splice(i, 1, n);
      }
    }
    this.parent = null;
  }
  select() {}
  scrollIntoView() {}
  setSelectionRange() {}
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
    if (k.startsWith("data-")) this.dataset[camel(k)] = String(v);
    else if (k === "class") this.className = String(v);
    else if (k === "id") this.id = String(v);
    else if (["hidden", "disabled", "checked", "selected"].includes(k)) this[k] = true;
    else this.attrs[k] = String(v);
  }
  getAttribute(k) {
    if (k.startsWith("data-")) return this.dataset[camel(k)] ?? null;
    if (k === "class") return this.className || null;
    if (k === "id") return this.id ?? null;
    if (["hidden", "disabled", "checked", "selected"].includes(k)) return this[k] ? "" : null;
    return this.attrs[k] ?? null;
  }
  hasAttribute(k) {
    return this.getAttribute(k) !== null;
  }
  removeAttribute(k) {
    if (k.startsWith("data-")) delete this.dataset[camel(k)];
    else if (["hidden", "disabled", "checked", "selected"].includes(k)) this[k] = false;
    else delete this.attrs[k];
  }
  toggleAttribute(k, force) {
    const on = force === undefined ? !this.hasAttribute(k) : !!force;
    if (on) this.setAttribute(k, "");
    else this.removeAttribute(k);
    return on;
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
    if (p) {
      p.children = p.children.filter(c => c !== this);
      p._kids = p._kids.filter(c => c !== this);
    }
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
  /** Fire `type` at this element and bubble it up (stopPropagation stops the climb). */
  async dispatch(type, extra = {}) {
    const seen = [];
    let stopped = false;
    const ev = {
      type,
      target: this,
      currentTarget: this,
      preventDefault: () => seen.push("preventDefault"),
      stopPropagation: () => {
        stopped = true;
        seen.push("stopPropagation");
      },
      ...extra,
    };
    for (let el = this; el && !stopped; el = el.parent) {
      ev.currentTarget = el;
      for (const fn of [...(el.listeners[type] ?? [])]) await fn(ev);
    }
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
    if (c.focus && globalThis.document?.activeElement !== this) return false;
    if (c.nots?.some(n => this.matchesCompound(n))) return false;
    if (c.tag && this.tagName !== c.tag) return false;
    for (const cls of c.classes) if (!this.classList.contains(cls)) return false;
    for (const a of c.attrs) {
      let v;
      if (a.name.startsWith("data-")) v = this.dataset[camel(a.name)];
      else if (a.name === "class") v = this.className;
      else if (["hidden", "disabled", "checked", "selected"].includes(a.name)) v = this[a.name] ? "" : undefined;
      else v = this.attrs[a.name] ?? this[a.name];
      if (v === undefined || v === null || v === false) return false;
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
      for (const c of n.nodes) {
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
        for (const c of n.nodes) {
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
