/**
 * A minimal `document` / `window` for the strip (strip.mjs). The kit stub has no DOM.
 *
 * Only what the entry touches: createElement, getElementById, `#ui-bottom` > `#hotbar`, body,
 * append/insertBefore/remove/replaceChildren, isConnected, childElementCount, id, className +
 * classList, dataset, style, setAttribute, addEventListener, textContent, closest/querySelectorAll by
 * one class, and a `document.querySelector` that answers from a table the test fills (the Argon
 * selectors) and counts every call. `window.innerHeight` is settable.
 *
 *   const D = installDom();
 *   D.argon(".extended-combat-hud .action-hud", { top: 700, left: 300, width: 900, height: 120 });
 *   D.queries   // every document.querySelector selector, in order
 *   D.snapshot(el)  // a plain tree for pins
 */

class ClassList {
  #el;
  constructor(el) {
    this.#el = el;
  }
  #set() {
    return new Set(this.#el.className.split(/\s+/).filter(Boolean));
  }
  contains(c) {
    return this.#set().has(c);
  }
  add(...cs) {
    const s = this.#set();
    for (const c of cs) s.add(c);
    this.#el.className = [...s].join(" ");
  }
  remove(...cs) {
    const s = this.#set();
    for (const c of cs) s.delete(c);
    this.#el.className = [...s].join(" ");
  }
  toggle(c, force) {
    const on = force === undefined ? !this.contains(c) : !!force;
    if (on) this.add(c);
    else this.remove(c);
    return on;
  }
}

export class Element {
  constructor(doc, tagName) {
    this.ownerDocument = doc;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this.className = "";
    this.classList = new ClassList(this);
    this.listeners = {};
    this.textContent = "";
    this.id = "";
    this.calls = { replaceChildren: 0 };
  }
  get isConnected() {
    let n = this;
    while (n.parentElement) n = n.parentElement;
    return n === this.ownerDocument.documentElement;
  }
  get childElementCount() {
    return this.children.length;
  }
  setAttribute(k, v) {
    this.attributes[k] = String(v);
  }
  getAttribute(k) {
    return this.attributes[k] ?? null;
  }
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  #detach(child) {
    const p = child.parentElement;
    if (p) p.children.splice(p.children.indexOf(child), 1);
    child.parentElement = null;
  }
  append(...nodes) {
    for (const n of nodes) {
      this.#detach(n);
      n.parentElement = this;
      this.children.push(n);
    }
  }
  insertBefore(node, ref) {
    this.#detach(node);
    node.parentElement = this;
    const i = this.children.indexOf(ref);
    this.children.splice(i < 0 ? this.children.length : i, 0, node);
    return node;
  }
  replaceChildren(...nodes) {
    this.calls.replaceChildren += 1;
    for (const c of [...this.children]) this.#detach(c);
    this.append(...nodes);
  }
  remove() {
    this.#detach(this);
  }
  *descendants() {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }
  /** `.cls` only (all the entry asks for). */
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, "");
    return [...this.descendants()].filter(e => e.classList.contains(cls));
  }
  closest(sel) {
    const cls = sel.replace(/^\./, "");
    for (let n = this; n; n = n.parentElement) if (n.classList?.contains(cls)) return n;
    return null;
  }
  /** Fire `type` at this element: listeners on it and its ancestors (bubbling), target = this. */
  dispatch(type, init = {}) {
    const event = { type, target: this, shiftKey: false, defaultPrevented: false, ...init };
    event.preventDefault = () => {
      event.defaultPrevented = true;
    };
    for (let n = this; n; n = n.parentElement) for (const fn of n.listeners[type] ?? []) fn(event);
    return event;
  }
}

/** Install `document` and `window` on globalThis. Returns the controller `D`. */
export function installDom({ innerHeight = 900, hotbar = true } = {}) {
  const D = { queries: [], byId: [], selectors: new Map() };
  const doc = {
    createElement: tag => new Element(doc, tag),
    getElementById(id) {
      D.byId.push(id);
      for (const e of doc.documentElement.descendants()) if (e.id === id) return e;
      return null;
    },
    querySelector(sel) {
      D.queries.push(sel);
      return D.selectors.get(sel) ?? null;
    },
  };
  doc.documentElement = new Element(doc, "html");
  doc.body = new Element(doc, "body");
  doc.documentElement.append(doc.body);
  const uiBottom = new Element(doc, "div");
  uiBottom.id = "ui-bottom";
  doc.body.append(uiBottom);
  if (hotbar) {
    const bar = new Element(doc, "div");
    bar.id = "hotbar";
    uiBottom.append(bar);
  }
  Object.assign(D, { document: doc, uiBottom });

  /** Register an Argon element for `selector` with this bounding rect; `visible: false` → offsetParent null. */
  D.argon = (selector, rect, { visible = true } = {}) => {
    const el = new Element(doc, "div");
    el.offsetParent = visible ? doc.body : null;
    el.getBoundingClientRect = () => ({ ...rect });
    D.selectors.set(selector, el);
    return el;
  };
  D.clearArgon = () => D.selectors.clear();

  /** A plain tree of an element, for pins. */
  D.snapshot = el =>
    el && {
      tag: el.tagName.toLowerCase(),
      ...(el.id ? { id: el.id } : {}),
      ...(el.className ? { className: el.className } : {}),
      ...(Object.keys(el.attributes).length ? { attributes: { ...el.attributes } } : {}),
      ...(Object.keys(el.dataset).length ? { dataset: { ...el.dataset } } : {}),
      ...(el.textContent ? { text: el.textContent } : {}),
      ...(el.type ? { type: el.type } : {}),
      ...(el.src !== undefined ? { src: el.src, alt: el.alt, draggable: el.draggable } : {}),
      ...(el.children.length ? { children: el.children.map(D.snapshot) } : {}),
    };

  const win = { innerHeight };
  Object.defineProperty(globalThis, "document", { value: doc, configurable: true, writable: true });
  Object.defineProperty(globalThis, "window", { value: win, configurable: true, writable: true });
  D.window = win;
  return D;
}
