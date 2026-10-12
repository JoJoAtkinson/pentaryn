/**
 * Just enough DOM for the riders glue, no jsdom (adapted from pentaryn-portals' test fixture): an
 * HTML parser for the strings the module writes through `innerHTML`, a serializer, attributes /
 * dataset / classList / style, events with a capture flag, focus/blur, and a selector engine
 * covering what riders queries — `tag`, `#id`, `.a.b`, `[attr]`, `[attr="v"]` / `[attr='v']`,
 * `[attr^=v]`, descendant and `>` combinators, `:scope > x`, and comma lists. An unsupported
 * selector throws, so a gap here never reads as "absent".
 */

const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source"]);
const decode = s => s.replace(/&(amp|lt|gt|quot|#x27|#39);/g, (m, e) => ({ amp: "&", lt: "<", gt: ">", quot: '"', "#x27": "'", "#39": "'" })[e]);
const escText = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export class FakeText {
  constructor(data) { this.data = data; this.parentNode = null; this.nodeType = 3; }
  get textContent() { return this.data; }
  remove() { this.parentNode?._drop(this); }
}

let doc = null;   // the installed document, for isConnected / activeElement

export class FakeElement {
  constructor(tag = "div") {
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = [];          // { type, fn, capture }
    this.style = {};
    this._value = undefined;
    this._checked = undefined;
    const el = this;
    this.dataset = new Proxy({}, {
      get: (_, k) => (typeof k === "string" ? el.getAttribute(`data-${kebab(k)}`) ?? undefined : undefined),
      set: (_, k, v) => { el.setAttribute(`data-${kebab(k)}`, String(v)); return true; },
      has: (_, k) => el.hasAttribute(`data-${kebab(k)}`),
      deleteProperty: (_, k) => { el.removeAttribute(`data-${kebab(k)}`); return true; },
      ownKeys: () => [...el.attrs.keys()].filter(a => a.startsWith("data-")).map(a => camel(a.slice(5))),
      getOwnPropertyDescriptor: (_, k) => (el.hasAttribute(`data-${kebab(k)}`) ? { enumerable: true, configurable: true, value: el.dataset[k] } : undefined),
    });
  }

  /* attributes */
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  hasAttribute(n) { return this.attrs.has(n); }
  get id() { return this.getAttribute("id") ?? ""; }
  set id(v) { this.setAttribute("id", v); }
  get className() { return this.getAttribute("class") ?? ""; }
  set className(v) { this.setAttribute("class", v); }
  get name() { return this.getAttribute("name") ?? ""; }
  get src() { return this.getAttribute("src") ?? ""; }
  set src(v) { this.setAttribute("src", v); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get checked() { return this._checked ?? this.hasAttribute("checked"); }
  set checked(v) { this._checked = !!v; }
  get value() {
    if (this._value !== undefined) return this._value;
    if (this.localName === "textarea") return this.textContent;
    if (this.localName === "select") {
      const opts = this.querySelectorAll("option");
      const sel = opts.find(o => o.hasAttribute("selected")) ?? opts[0];
      return sel ? sel.value : "";
    }
    if (this.localName === "option") return this.getAttribute("value") ?? this.textContent;
    return this.getAttribute("value") ?? "";
  }
  set value(v) { this._value = String(v); }
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
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get parentElement() { return this.parentNode; }
  get firstElementChild() { return this.children[0] ?? null; }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return !!doc && (n === doc.body || n === doc.documentElement);
  }
  _adopt(n) {
    if (typeof n === "string") n = new FakeText(n);
    n.parentNode?._drop(n);
    n.parentNode = this;
    return n;
  }
  _drop(n) { this.childNodes = this.childNodes.filter(c => c !== n); n.parentNode = null; }
  append(...nodes) { for (const n of nodes) this.childNodes.push(this._adopt(n)); }
  appendChild(n) { this.append(n); return n; }
  prepend(...nodes) { this.childNodes.unshift(...nodes.map(n => this._adopt(n))); }
  remove() { this.parentNode?._drop(this); }
  replaceWith(n) {
    const p = this.parentNode;
    if (!p) return;
    const node = p._adopt(n);
    p.childNodes.splice(p.childNodes.indexOf(this), 1, node);
    this.parentNode = null;
  }
  contains(n) {
    for (let x = n; x; x = x.parentNode) if (x === this) return true;
    return false;
  }
  closest(sel) {
    for (let x = this; x && x.nodeType === 1; x = x.parentNode) if (x.matches(sel)) return x;
    return null;
  }

  /* text and HTML */
  get textContent() { return this.childNodes.map(n => n.textContent).join(""); }
  set textContent(v) { this.childNodes = []; this.append(String(v)); }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  set innerHTML(html) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    for (const n of parseHTML(String(html))) this.append(n);
  }
  get outerHTML() { return serialize(this); }

  /* events: listeners run in registration order; capture ones first, as on the target itself */
  addEventListener(type, fn, opts) { this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture }); }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => l.type !== type || l.fn !== fn); }
  /** Dispatch on this element; resolves with what the listeners returned (async ones awaited). */
  async fire(type, init = {}) {
    const ev = fakeEvent(type, this, init);
    const out = [];
    for (const l of [...this.listeners.filter(l => l.type === type && l.capture), ...this.listeners.filter(l => l.type === type && !l.capture)]) {
      if (ev.immediateStopped) break;
      out.push(await l.fn(ev));
    }
    return { event: ev, results: out };
  }
  click() { return this.fire("click"); }
  focus() { if (doc) doc.activeElement = this; }
  /** Blur: focus leaves the element and its `blur` listeners run. */
  blur() {
    if (doc?.activeElement === this) doc.activeElement = null;
    this.blurred = (this.blurred ?? 0) + 1;
    return this.fire("blur");
  }
  setPointerCapture(id) { this.pointerCapture = id; }

  /* selectors */
  matches(sel) { return parseSelector(sel).some(chain => matchChain(this, chain, null)); }
  querySelectorAll(sel) {
    const chains = parseSelector(sel);
    const out = [];
    const walk = n => {
      for (const c of n.children) {
        if (chains.some(chain => matchChain(c, chain, this))) out.push(c);
        walk(c);
      }
    };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

const kebab = k => String(k).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function fakeEvent(type, target, init) {
  const ev = {
    type, target, defaultPrevented: false, propagationStopped: false, immediateStopped: false,
    button: 0, clientX: 0, clientY: 0, pointerId: 1, ...init,
    preventDefault() { ev.defaultPrevented = true; },
    stopPropagation() { ev.propagationStopped = true; },
    stopImmediatePropagation() { ev.immediateStopped = true; ev.propagationStopped = true; },
  };
  return ev;
}

function serialize(n) {
  if (n.nodeType === 3) return escText(n.data);
  const attrs = [...n.attrs].map(([k, v]) => (v === "" ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join("");
  if (VOID.has(n.localName)) return `<${n.localName}${attrs}>`;
  return `<${n.localName}${attrs}>${n.childNodes.map(serialize).join("")}</${n.localName}>`;
}

/** Parse an HTML fragment into nodes. Tolerant: an unmatched end tag closes up to its opener. */
export function parseHTML(html) {
  const root = new FakeElement("#fragment");
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    const top = stack.at(-1);
    if (m[1]) {
      const tag = m[1].toLowerCase();
      const i = stack.map(e => e.localName).lastIndexOf(tag);
      if (i > 0) stack.length = i;
    } else if (m[2]) {
      const el = new FakeElement(m[2]);
      const attrRe = /([^\s=>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a;
      while ((a = attrRe.exec(m[3] ?? ""))) el.attrs.set(a[1].toLowerCase(), decode(a[2] ?? a[3] ?? a[4] ?? ""));
      top.append(el);
      if (!VOID.has(el.localName) && !m[4]) stack.push(el);
    } else if (m[5]) {
      top.append(new FakeText(decode(m[5])));
    }
  }
  const nodes = root.childNodes;
  for (const n of nodes) n.parentNode = null;
  return nodes;
}

/* selector engine: [[{ comb, compound }]] per comma group, right-most last */
function parseSelector(sel) {
  return sel.split(",").map(s => s.trim()).filter(Boolean).map(group => {
    const tokens = group.replace(/\s*>\s*/g, " > ").split(/\s+/);
    const chain = [];
    let comb = " ";
    for (const t of tokens) {
      if (t === ">") { comb = ">"; continue; }
      chain.push({ comb, compound: parseCompound(t) });
      comb = " ";
    }
    return chain;
  });
}

function parseCompound(t) {
  if (t === ":scope") return { scope: true };
  const re = /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:\^?=(?:"[^"]*"|'[^']*'|[^\]]+))?\])*)$/;
  const m = re.exec(t);
  if (!m) throw new Error(`fixtures/dom.mjs: unsupported selector "${t}"`);
  const out = { tag: m[1] && m[1] !== "*" ? m[1].toLowerCase() : null, ids: [], classes: [], attrs: [] };
  for (const p of m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) ?? []) {
    if (p[0] === "#") out.ids.push(p.slice(1));
    else if (p[0] === ".") out.classes.push(p.slice(1));
    else {
      const a = /^\[([\w-]+)(?:(\^?)=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/.exec(p);
      out.attrs.push({ name: a[1], prefix: a[2] === "^", value: a[3] ?? a[4] ?? a[5] ?? null });
    }
  }
  return out;
}

function matchCompound(el, c, scope) {
  if (c.scope) return el === scope;
  if (c.tag && el.localName !== c.tag) return false;
  if (c.ids.some(id => el.id !== id)) return false;
  if (c.classes.some(k => !el.classList.contains(k))) return false;
  return c.attrs.every(a => el.hasAttribute(a.name)
    && (a.value === null || (a.prefix ? el.getAttribute(a.name).startsWith(a.value) : el.getAttribute(a.name) === a.value)));
}

function matchChain(el, chain, scope, i = chain.length - 1) {
  if (!el || el.nodeType !== 1 || !matchCompound(el, chain[i].compound, scope)) return false;
  if (i === 0) return true;
  const comb = chain[i].comb;
  if (comb === ">") return matchChain(el.parentNode, chain, scope, i - 1);
  for (let p = el.parentNode; p; p = p.parentNode) if (matchChain(p, chain, scope, i - 1)) return true;
  return false;
}

/** Install `document` and `HTMLElement` globals. Returns the document. */
export function installDom() {
  const body = new FakeElement("body");
  const documentElement = new FakeElement("html");
  const listeners = [];
  doc = {
    body, documentElement, activeElement: null, listeners,
    createElement: tag => new FakeElement(tag),
    getElementById: id => (body.id === id ? body : body.querySelector(`#${id}`)),
    addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture }),
    removeEventListener: (type, fn) => { const i = listeners.findIndex(l => l.type === type && l.fn === fn); if (i >= 0) listeners.splice(i, 1); },
    /** Fire a document-level listener (the menu's outside-click closer). */
    fire: async (type, init = {}) => { for (const l of listeners.filter(l => l.type === type)) await l.fn(fakeEvent(type, init.target ?? body, init)); },
  };
  // document-wide queries run over body (the damage-tray lookup)
  doc.querySelectorAll = sel => body.querySelectorAll(sel);
  doc.querySelector = sel => body.querySelector(sel);
  globalThis.HTMLElement = FakeElement;
  globalThis.document = doc;
  return doc;
}

/** Build an element tree from HTML: the first top-level element. */
export function html(source) {
  return parseHTML(source.trim()).find(n => n.nodeType === 1);
}
