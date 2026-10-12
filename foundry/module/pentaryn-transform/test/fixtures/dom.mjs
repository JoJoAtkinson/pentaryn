/**
 * A minimal `document` for hud.mjs (the kit stub has no DOM). Only what the module touches:
 * createElement, className/classList, dataset, textContent, a two-tag innerHTML (the uses badge),
 * appendChild/prepend/remove, isConnected, and querySelector(All) over a small selector grammar:
 * tag, `.class` chains, `:not(.x)`, `:scope`, the descendant and `>` combinators, and `,` lists.
 *
 *   const D = installDom();
 *   D.body                       // the root every connected element hangs from
 *   D.listeners                  // document.addEventListener calls: [{ type, fn, options, at }]
 *   D.dispatched                 // document.dispatchEvent calls (the target-picker cancel)
 *   D.el("div", "a b", parent)   // a new element with classes, appended to parent (default body)
 */

class ClassList {
  #el;
  constructor(el) { this.#el = el; }
  #set() { return new Set(this.#el.className.split(/\s+/).filter(Boolean)); }
  contains(c) { return this.#set().has(c); }
  add(...cs) { const s = this.#set(); for (const c of cs) s.add(c); this.#el.className = [...s].join(" "); }
  remove(...cs) { const s = this.#set(); for (const c of cs) s.delete(c); this.#el.className = [...s].join(" "); }
  toggle(c, force) {
    const on = force === undefined ? !this.contains(c) : !!force;
    if (on) this.add(c); else this.remove(c);
    return on;
  }
}

/* ── selectors ────────────────────────────────────────────────────────────── */

function parseCompound(s) {
  const out = { tag: null, classes: [], nots: [], scope: false };
  let rest = s;
  rest = rest.replace(/:not\(\.([\w-]+)\)/g, (_, c) => { out.nots.push(c); return ""; });
  rest = rest.replace(/:scope/g, () => { out.scope = true; return ""; });
  const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)$/i.exec(rest);
  if (!m) throw new Error(`dom fixture: unsupported selector part "${s}"`);
  out.tag = m[1] ? m[1].toUpperCase() : null;
  out.classes = (m[2] ?? "").split(".").filter(Boolean);
  return out;
}

function parseSelector(sel) {
  // [{ comb: " " | ">", part }], left to right
  const tokens = sel.trim().replace(/\s*>\s*/g, " > ").split(/\s+/);
  const steps = [];
  let comb = " ";
  for (const t of tokens) {
    if (t === ">") { comb = ">"; continue; }
    steps.push({ comb, part: parseCompound(t) });
    comb = " ";
  }
  return steps;
}

function matchesPart(el, part, scopeEl) {
  if (part.scope) return el === scopeEl && !part.tag && !part.classes.length;
  if (part.tag && el.tagName !== part.tag) return false;
  if (!part.classes.every(c => el.classList.contains(c))) return false;
  return !part.nots.some(c => el.classList.contains(c));
}

function matchesSteps(el, steps, i, scopeEl) {
  if (!matchesPart(el, steps[i].part, scopeEl)) return false;
  if (i === 0) return true;
  const comb = steps[i].comb;
  if (comb === ">") return !!el.parentElement && matchesSteps(el.parentElement, steps, i - 1, scopeEl);
  for (let p = el.parentElement; p; p = p.parentElement) if (matchesSteps(p, steps, i - 1, scopeEl)) return true;
  return false;
}

function select(root, sel, scopeEl) {
  const lists = sel.split(",").map(parseSelector);
  return [...root.descendants()].filter(el => lists.some(steps => matchesSteps(el, steps, steps.length - 1, scopeEl)));
}

export class Element {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = new ClassList(this);
    this.textContent = "";
    this.oncontextmenu = null;
  }
  get isConnected() {
    let n = this;
    while (n.parentElement) n = n.parentElement;
    return n === this.ownerDocument.body;
  }
  set innerHTML(html) {
    for (const c of [...this.children]) c.remove();
    for (const m of String(html).matchAll(/<(\w+)(?:\s+class="([^"]*)")?\s*>([^<]*)<\/\1>/g)) {
      const child = new Element(this.ownerDocument, m[1]);
      child.className = m[2] ?? "";
      child.textContent = m[3] ?? "";
      this.appendChild(child);
    }
  }
  #detach(child) {
    const p = child.parentElement;
    if (p) p.children.splice(p.children.indexOf(child), 1);
    child.parentElement = null;
  }
  appendChild(node) {
    this.#detach(node);
    node.parentElement = this;
    this.children.push(node);
    return node;
  }
  prepend(node) {
    this.#detach(node);
    node.parentElement = this;
    this.children.unshift(node);
  }
  remove() { this.#detach(this); }
  *descendants() {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }
  querySelectorAll(sel) { return select(this, sel, this); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

/** Install `document` (and a MouseEvent) on globalThis. Returns the controller `D`. */
export function installDom({ hooksRef = null } = {}) {
  const D = { listeners: [], dispatched: [] };
  const doc = {
    createElement: tag => new Element(doc, tag),
    addEventListener(type, fn, options) {
      D.listeners.push({ type, fn, options, at: hooksRef?.() ?? null });
    },
    removeEventListener(type, fn) {
      const i = D.listeners.findIndex(l => l.type === type && l.fn === fn);
      if (i >= 0) D.listeners.splice(i, 1);
    },
    dispatchEvent(event) {
      D.dispatched.push(event);
      D.onDispatch?.(event);
      return true;
    },
    querySelectorAll: sel => select(doc.body, sel, null),
    querySelector: sel => select(doc.body, sel, null)[0] ?? null
  };
  doc.body = new Element(doc, "body");
  D.document = doc;
  D.body = doc.body;
  D.el = (tag = "div", classes = "", parent = doc.body) => {
    const e = new Element(doc, tag);
    e.className = classes;
    if (parent) parent.appendChild(e);
    return e;
  };
  class MouseEvent {
    constructor(type, init = {}) { Object.assign(this, { type, ...init }); }
  }
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "MouseEvent", { value: MouseEvent, configurable: true, writable: true });
  return D;
}
