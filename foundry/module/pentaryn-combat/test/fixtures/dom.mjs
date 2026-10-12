/**
 * Just enough DOM for the pentaryn-combat glue, no jsdom (adapted from pentaryn-portals'
 * test/fixtures/dom.mjs): an HTML parser for the strings the module writes through `innerHTML`, a
 * serializer, attributes / dataset / classList / style, events with a capture flag and bubbling, and
 * a selector engine covering what combat queries — `tag`, `#id`, `.a.b`, `[attr]`, `[attr="v"]`,
 * `:not(…)`, descendant and `>` combinators, `:scope > x`, and comma lists. An unsupported selector
 * throws, so a gap here never reads as "absent".
 *
 * Recorders: `document` keeps every add/removeEventListener call in order (`doc.listenerLog`) and
 * the live list (`doc.listeners`); `MutationObserver` keeps every observer and its `observe` target;
 * `customElements` is a plain registry; `requestAnimationFrame` queues until `flushFrames()`.
 */

const VOID = new Set(["img", "input", "br", "hr", "meta", "link", "source"]);
const decode = s => s.replace(/&(amp|lt|gt|quot|#x[0-9a-fA-F]+|#\d+);/g, (m, e) => (e[0] === "#"
  ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1)))
  : ({ amp: "&", lt: "<", gt: ">", quot: '"' })[e]));
const escText = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export class FakeText {
  constructor(data) { this.data = data; this.parentNode = null; this.nodeType = 3; }
  get textContent() { return this.data; }
  remove() { this.parentNode?._drop(this); }
}

let doc = null;   // the installed document, for isConnected / activeElement

const kebab = k => String(k).replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
const camel = k => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

function makeStyle() {
  const style = {};
  Object.defineProperty(style, "setProperty", { value: (k, v) => { style[k] = String(v); }, enumerable: false });
  Object.defineProperty(style, "removeProperty", { value: k => { delete style[k]; }, enumerable: false });
  return style;
}

export class FakeElement {
  constructor(tag = "div") {
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.nodeType = 1;
    this.attrs = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = [];          // { type, fn, capture, once }
    this.style = makeStyle();
    this._value = undefined;
    this._checked = undefined;
    this._rect = null;
    this.isContentEditable = false;
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
  get type() { return this.getAttribute("type") ?? (this.localName === "input" ? "text" : this.localName === "button" ? "submit" : ""); }
  set type(v) { this.setAttribute("type", v); }
  get disabled() { return this.hasAttribute("disabled"); }
  set disabled(v) { if (v) this.setAttribute("disabled", ""); else this.removeAttribute("disabled"); }
  get checked() { return this._checked ?? this.hasAttribute("checked"); }
  set checked(v) { this._checked = !!v; }
  get value() { return this._value ?? this.getAttribute("value") ?? ""; }
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

  /* layout: tests set `_rect`, `offsetWidth`, `offsetParent` */
  getBoundingClientRect() {
    const r = this._rect ?? { left: 0, top: 0, width: 0, height: 0 };
    return { ...r, right: r.left + r.width, bottom: r.top + r.height, x: r.left, y: r.top };
  }

  /* tree */
  get children() { return this.childNodes.filter(n => n.nodeType === 1); }
  get parentElement() { return this.parentNode?.nodeType === 1 ? this.parentNode : null; }
  get firstElementChild() { return this.children[0] ?? null; }
  get nextSibling() {
    const p = this.parentNode;
    if (!p) return null;
    return p.childNodes[p.childNodes.indexOf(this) + 1] ?? null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return !!doc && n === doc.documentElement;
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
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    const node = this._adopt(n);
    const i = this.childNodes.indexOf(ref);
    this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, node);
    return node;
  }
  after(...nodes) {
    const p = this.parentNode;
    if (!p) return;
    let at = p.childNodes.indexOf(this) + 1;
    for (const n of nodes) { const node = p._adopt(n); p.childNodes.splice(at++, 0, node); }
  }
  remove() { this.parentNode?._drop(this); }
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
  set textContent(v) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; if (String(v)) this.append(String(v)); }
  get innerHTML() { return this.childNodes.map(serialize).join(""); }
  set innerHTML(html) {
    for (const n of this.childNodes) n.parentNode = null;
    this.childNodes = [];
    for (const n of parseHTML(String(html))) this.append(n);
  }
  get outerHTML() { return serialize(this); }

  /* events */
  addEventListener(type, fn, opts) {
    this.listeners.push({ type, fn, capture: opts === true || !!opts?.capture, once: !!opts?.once });
  }
  removeEventListener(type, fn) { this.listeners = this.listeners.filter(l => l.type !== type || l.fn !== fn); }
  /** Dispatch on this element only (capture listeners first); resolves with what the listeners returned. */
  async fire(type, init = {}) {
    const ev = fakeEvent(type, this, init);
    const out = [];
    for (const l of [...this.listeners.filter(l => l.type === type && l.capture), ...this.listeners.filter(l => l.type === type && !l.capture)]) {
      if (ev.immediateStopped) break;
      if (l.once) this.removeEventListener(type, l.fn);
      out.push(await l.fn(ev));
    }
    return { event: ev, results: out };
  }
  /** DOM dispatchEvent: this element's listeners, then its ancestors' when the event bubbles. Recorded on `doc.dispatched`. */
  dispatchEvent(ev) {
    doc?.dispatched.push({ type: ev.type, target: this, bubbles: !!ev.bubbles });
    for (let n = this; n; n = ev.bubbles ? n.parentNode : null) {
      for (const l of (n.listeners ?? []).filter(l => l.type === ev.type)) l.fn(ev);
    }
    return true;
  }
  click() { doc?.clicked.push(this); return this.fire("click"); }
  focus() { if (doc) doc.activeElement = this; }
  blur() { if (doc?.activeElement === this) doc.activeElement = doc.body; }

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

function fakeEvent(type, target, init) {
  const ev = {
    type, target, defaultPrevented: false, propagationStopped: false, immediateStopped: false,
    button: 0, clientX: 0, clientY: 0, pointerId: 1, key: undefined, ...init,
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
function splitTop(s, sep) {
  const out = [];
  let depth = 0, quote = null, cur = "";
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (depth === 0 && sep.test(ch)) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function parseSelector(sel) {
  return splitTop(sel, /,/).map(s => s.trim()).filter(Boolean).map(group => {
    const tokens = splitTop(group.replace(/\s*>\s*/g, " > "), /\s/).filter(Boolean);
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
  const nots = [];
  t = t.replace(/:not\(((?:[^()]|\([^()]*\))*)\)/g, (_, inner) => { nots.push(parseSelector(inner)); return ""; });
  const re = /^([a-zA-Z][\w-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[\w-]+(?:=(?:"[^"]*"|'[^']*'|[^\]]+))?\])*)$/;
  const m = re.exec(t);
  if (!m) throw new Error(`fixtures/dom.mjs: unsupported selector "${t}"`);
  const out = { tag: m[1] && m[1] !== "*" ? m[1].toLowerCase() : null, ids: [], classes: [], attrs: [], nots };
  for (const p of m[2].match(/#[\w-]+|\.[\w-]+|\[[^\]]+\]/g) ?? []) {
    if (p[0] === "#") out.ids.push(p.slice(1));
    else if (p[0] === ".") out.classes.push(p.slice(1));
    else {
      const a = /^\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]+)))?\]$/.exec(p);
      out.attrs.push({ name: a[1], value: a[2] ?? a[3] ?? a[4] ?? null });
    }
  }
  return out;
}

function matchCompound(el, c, scope) {
  if (c.scope) return el === scope;
  if (c.tag && el.localName !== c.tag) return false;
  if (c.ids.some(id => el.id !== id)) return false;
  if (c.classes.some(k => !el.classList.contains(k))) return false;
  if (c.nots.some(chains => chains.some(chain => matchChain(el, chain, scope)))) return false;
  return c.attrs.every(a => el.hasAttribute(a.name) && (a.value === null || el.getAttribute(a.name) === a.value));
}

function matchChain(el, chain, scope, i = chain.length - 1) {
  if (!el || el.nodeType !== 1 || !matchCompound(el, chain[i].compound, scope)) return false;
  if (i === 0) return true;
  const comb = chain[i].comb;
  if (comb === ">") return matchChain(el.parentNode, chain, scope, i - 1);
  for (let p = el.parentNode; p; p = p.parentNode) if (matchChain(p, chain, scope, i - 1)) return true;
  return false;
}

const byTag = tag => ({ [Symbol.hasInstance]: x => x instanceof FakeElement && x.localName === tag });

/**
 * Install `document`, `window`, the element classes, `MutationObserver`, `customElements`,
 * `requestAnimationFrame`, `getComputedStyle`, `Event` and `MouseEvent` globals. Returns the document.
 */
export function installDom() {
  const documentElement = new FakeElement("html");
  const body = new FakeElement("body");
  documentElement.append(body);
  const listeners = [];
  const listenerLog = [];
  doc = {
    body, documentElement, activeElement: body, hidden: false, listeners, listenerLog, dispatched: [], clicked: [],
    createElement: tag => new FakeElement(tag),
    getElementById: id => documentElement.querySelector(`#${id}`),
    querySelector: sel => documentElement.querySelector(sel),
    querySelectorAll: sel => documentElement.querySelectorAll(sel),
    addEventListener: (type, fn, opts) => {
      const capture = opts === true || !!opts?.capture;
      listeners.push({ type, fn, capture, passive: !!opts?.passive });
      listenerLog.push({ op: "add", type, capture, passive: !!opts?.passive });
    },
    removeEventListener: (type, fn, opts) => {
      const capture = opts === true || !!opts?.capture;
      const i = listeners.findIndex(l => l.type === type && l.fn === fn && l.capture === capture);
      if (i >= 0) listeners.splice(i, 1);
      listenerLog.push({ op: "remove", type, capture, found: i >= 0 });
    },
    /** Fire the document-level listeners of one type (capture first, in registration order). */
    fire: async (type, init = {}) => {
      const ev = fakeEvent(type, init.target ?? body, init);
      const ls = [...listeners.filter(l => l.type === type && l.capture), ...listeners.filter(l => l.type === type && !l.capture)];
      for (const l of ls) {
        if (ev.immediateStopped) break;
        await l.fn(ev);
      }
      return ev;
    },
  };
  const observers = [];
  class MutationObserver {
    constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; observers.push(this); }
    observe(target, opts) { this.targets.push({ target, opts }); }
    disconnect() { this.disconnected = true; }
  }
  const registry = new Map();
  const frames = [];
  const define = (k, value) => Object.defineProperty(globalThis, k, { value, configurable: true, writable: true });
  define("document", doc);
  define("window", { innerWidth: 1600, innerHeight: 900 });
  define("Node", FakeElement);
  define("HTMLElement", FakeElement);
  define("HTMLButtonElement", byTag("button"));
  define("HTMLInputElement", byTag("input"));
  define("HTMLTextAreaElement", byTag("textarea"));
  define("HTMLSelectElement", byTag("select"));
  define("MutationObserver", MutationObserver);
  define("customElements", { get: n => registry.get(n), define: (n, c) => registry.set(n, c) });
  define("requestAnimationFrame", fn => { frames.push(fn); return frames.length; });
  define("getComputedStyle", el => ({ zIndex: el?.style?.zIndex ?? "auto" }));
  define("Event", class Event { constructor(type, init = {}) { this.type = type; this.bubbles = !!init.bubbles; } });
  define("MouseEvent", class MouseEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } });
  doc.observers = observers;
  doc.frames = frames;
  /** Run the queued animation frames (and any they queue), up to `max` rounds. */
  doc.flushFrames = (max = 20) => {
    let n = 0;
    while (frames.length && n++ < max) for (const fn of frames.splice(0)) fn();
  };
  return doc;
}

/** Build an element tree from HTML: the first top-level element. */
export function html(source) {
  return parseHTML(source.trim()).find(n => n.nodeType === 1);
}
