/**
 * Just enough DOM for the aoe glue (no jsdom in this repo): elements with attributes, dataset,
 * classList, text and element children, an HTML parser for `innerHTML`, a serialiser for golden
 * pins, the selectors the module uses (tag, #id, .a.b, [x], [x="v"], :scope, descendant and `>`),
 * closest/matches/contains, and listeners with bubbling.
 *
 * Text is kept raw (entities are neither decoded nor re-encoded), so a parse → serialise round trip
 * is byte-stable. An unsupported selector throws, so a test never passes on a silent non-match.
 */

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const kebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export class FakeText {
  constructor(text) {
    this.nodeType = 3;
    this.text = text;
    this.parent = null;
  }
  get outerHTML() {
    return this.text;
  }
  get textContent() {
    return this.text;
  }
}

export class FakeElement {
  constructor(tag = "div") {
    this.nodeType = 1;
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.attrs = new Map();
    this.nodes = [];
    this.parent = null;
    this.listeners = [];
    this.root = false;
    this.style = {
      props: {},
      setProperty(k, v) {
        this.props[k] = v;
      },
      getPropertyValue(k) {
        return this.props[k] ?? "";
      },
    };
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === "string" ? el.attrs.get(`data-${kebab(k)}`) : undefined),
      set: (_, k, v) => {
        el.attrs.set(`data-${kebab(k)}`, String(v));
        return true;
      },
      deleteProperty: (_, k) => el.attrs.delete(`data-${kebab(k)}`),
      has: (_, k) => el.attrs.has(`data-${kebab(k)}`),
      ownKeys: () => [...el.attrs.keys()].filter(a => a.startsWith("data-")).map(a => camel(a.slice(5))),
      getOwnPropertyDescriptor: (_, k) => (el.attrs.has(`data-${kebab(k)}`)
        ? { value: el.attrs.get(`data-${kebab(k)}`), enumerable: true, configurable: true }
        : undefined),
    });
  }

  /* attributes and reflected properties */
  getAttribute(n) {
    return this.attrs.has(n) ? this.attrs.get(n) : null;
  }
  setAttribute(n, v) {
    this.attrs.set(n, String(v));
  }
  hasAttribute(n) {
    return this.attrs.has(n);
  }
  removeAttribute(n) {
    this.attrs.delete(n);
  }
  get className() {
    return this.attrs.get("class") ?? "";
  }
  set className(v) {
    this.attrs.set("class", String(v));
  }
  get id() {
    return this.attrs.get("id") ?? "";
  }
  set id(v) {
    this.attrs.set("id", String(v));
  }
  get type() {
    return this.attrs.get("type") ?? "";
  }
  set type(v) {
    this.attrs.set("type", String(v));
  }
  get value() {
    return this._value ?? this.attrs.get("value") ?? "";
  }
  set value(v) {
    this._value = String(v);
  }
  get checked() {
    return this._checked ?? this.attrs.has("checked");
  }
  set checked(v) {
    this._checked = !!v;
  }
  bool(name, on) {
    if (on) this.attrs.set(name, "");
    else this.attrs.delete(name);
  }
  get disabled() {
    return this.attrs.has("disabled");
  }
  set disabled(v) {
    this.bool("disabled", v);
  }
  get hidden() {
    return this.attrs.has("hidden");
  }
  set hidden(v) {
    this.bool("hidden", v);
  }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { el.className = [...new Set([...list(), ...c])].join(" "); },
      remove: (...c) => { el.className = list().filter(x => !c.includes(x)).join(" "); },
      contains: c => list().includes(c),
      toggle: (c, on) => {
        const want = on ?? !list().includes(c);
        el.className = (want ? [...new Set([...list(), c])] : list().filter(x => x !== c)).join(" ");
        return want;
      },
    };
  }

  /* tree */
  get children() {
    return this.nodes.filter(n => n.nodeType === 1);
  }
  get isConnected() {
    let n = this;
    while (n.parent) n = n.parent;
    return n.root === true;
  }
  append(...nodes) {
    for (const n of nodes) {
      const node = typeof n === "string" ? new FakeText(n) : n;
      node.parent?.nodes && node.parent.nodes.splice(node.parent.nodes.indexOf(node), 1);
      node.parent = this;
      this.nodes.push(node);
    }
  }
  after(node) {
    const p = this.parent;
    if (!p) return;
    node.parent?.nodes && node.parent.nodes.splice(node.parent.nodes.indexOf(node), 1);
    node.parent = p;
    p.nodes.splice(p.nodes.indexOf(this) + 1, 0, node);
  }
  remove() {
    if (!this.parent) return;
    this.parent.nodes.splice(this.parent.nodes.indexOf(this), 1);
    this.parent = null;
  }
  contains(other) {
    for (let n = other; n; n = n.parent) if (n === this) return true;
    return false;
  }
  descendants(out = []) {
    for (const c of this.children) {
      out.push(c);
      c.descendants(out);
    }
    return out;
  }

  /* html */
  get innerHTML() {
    return this.nodes.map(n => n.outerHTML).join("");
  }
  set innerHTML(html) {
    for (const n of this.nodes) n.parent = null;
    this.nodes = [];
    for (const n of parseHTML(String(html))) this.append(n);
  }
  get outerHTML() {
    const attrs = [...this.attrs].map(([k, v]) => ` ${k}="${v}"`).join("");
    if (VOID.has(this.localName)) return `<${this.localName}${attrs}>`;
    return `<${this.localName}${attrs}>${this.innerHTML}</${this.localName}>`;
  }
  get textContent() {
    return this.nodes.map(n => n.textContent).join("");
  }

  /* selectors */
  matches(selector, scope = null) {
    return parseSelector(selector).some(chain => matchChain(this, chain, scope));
  }
  querySelectorAll(selector) {
    const chains = parseSelector(selector);
    return this.descendants().filter(el => chains.some(chain => matchChain(el, chain, this)));
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  closest(selector) {
    for (let n = this; n && n.nodeType === 1; n = n.parent) if (n.matches(selector)) return n;
    return null;
  }

  /* events */
  addEventListener(type, fn, capture = false) {
    this.listeners.push({ type, fn, capture: !!(capture?.capture ?? capture) });
  }
}

/* ── selectors ─────────────────────────────────────────────────────────── */

function parseCompound(src) {
  const c = { tag: null, id: null, classes: [], attrs: [], scope: false };
  const re = /^(\*|[a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([\w-]+)))?\]|(:scope)/y;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    const m = re.exec(src.slice(0));
    if (!m || m.index !== i) throw new Error(`fake DOM: unsupported selector part ${JSON.stringify(src.slice(i))}`);
    if (m[1]) c.tag = m[1] === "*" ? null : m[1].toLowerCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.classes.push(m[3]);
    else if (m[4]) c.attrs.push([m[4], m[5] ?? m[6] ?? m[7] ?? null]);
    else if (m[8]) c.scope = true;
    i = re.lastIndex;
  }
  return c;
}

export function parseSelector(selector) {
  return String(selector).split(",").map(part => {
    const tokens = part.trim().replace(/\s*>\s*/g, " > ").split(/\s+/).filter(Boolean);
    const chain = [];
    let comb = " ";
    for (const tk of tokens) {
      if (tk === ">") { comb = ">"; continue; }
      chain.push({ comb, compound: parseCompound(tk) });
      comb = " ";
    }
    return chain;
  });
}

function matchCompound(el, c, scope) {
  if (!el || el.nodeType !== 1) return false;
  if (c.scope && el !== scope) return false;
  if (c.tag && el.localName !== c.tag) return false;
  if (c.id && el.id !== c.id) return false;
  if (c.classes.some(k => !el.classList.contains(k))) return false;
  return c.attrs.every(([k, v]) => (v === null ? el.hasAttribute(k) : el.getAttribute(k) === v));
}

function matchChain(el, chain, scope) {
  const at = (node, i) => {
    if (!matchCompound(node, chain[i].compound, scope)) return false;
    if (i === 0) return true;
    if (chain[i].comb === ">") return at(node.parent, i - 1);
    for (let p = node.parent; p; p = p.parent) if (at(p, i - 1)) return true;
    return false;
  };
  return at(el, chain.length - 1);
}

/* ── html ──────────────────────────────────────────────────────────────── */

export function parseHTML(html) {
  const top = new FakeElement("#fragment");
  const stack = [top];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of html.matchAll(re)) {
    const cur = stack.at(-1);
    if (m[1]) {
      const name = m[1].toLowerCase();
      const i = stack.findLastIndex(e => e.localName === name);
      if (i > 0) stack.length = i;
    } else if (m[2]) {
      const el = new FakeElement(m[2]);
      for (const a of (m[3] ?? "").matchAll(/([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        el.attrs.set(a[1].toLowerCase(), a[2] ?? a[3] ?? a[4] ?? "");
      }
      cur.append(el);
      if (!VOID.has(el.localName) && !m[4]) stack.push(el);
    } else if (m[5] !== undefined) {
      cur.append(new FakeText(m[5]));
    }
  }
  const nodes = [...top.nodes];
  for (const n of nodes) n.parent = null;
  return nodes;
}

/** One element from markup (the first element node). */
export function el(html) {
  return parseHTML(html).find(n => n.nodeType === 1);
}

/** A connected root (isConnected is true below it). */
export function root(html = "") {
  const r = new FakeElement("body");
  r.root = true;
  r.innerHTML = html;
  return r;
}

/**
 * Dispatch an event at `target`: capture listeners root → target, then bubble target → root.
 * Returns the event; async listener results are collected on `event.results`.
 */
export function dispatch(target, type, init = {}) {
  const path = [];
  for (let n = target; n; n = n.parent) path.push(n);
  const event = {
    type, target, defaultPrevented: false, stopped: false, results: [],
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.stopped = true; },
    ...init,
  };
  const run = (node, capture) => {
    for (const l of node.listeners.filter(x => x.type === type && x.capture === capture)) {
      event.currentTarget = node;
      event.results.push(l.fn(event));
    }
  };
  for (const node of [...path].reverse()) run(node, true);
  for (const node of path) {
    if (event.stopped) break;
    run(node, false);
  }
  return event;
}

export const document = {
  createElement: tag => new FakeElement(tag),
};
