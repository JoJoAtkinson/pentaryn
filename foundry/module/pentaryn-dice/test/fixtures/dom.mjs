/**
 * A tiny DOM stand-in for node: just enough of HTMLElement for the sidebar feature — create,
 * append/prepend/before/after, className/dataset/attributes, textContent, click listeners, and
 * querySelector(All)/closest/matches for compound selectors (`tag.cls[attr][attr=v]`) joined by
 * descendant spaces. Synthetic; nothing here is Foundry's or Dice So Nice's.
 */

const camel = s => s.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

export class FakeElement {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.className = "";
    this.listeners = {};
    this.ownText = "";
    this.disabled = false;
    this.value = "";
    this.title = "";
  }

  get classList() {
    const list = this.className.split(/\s+/).filter(Boolean);
    return { contains: c => list.includes(c), values: () => list };
  }

  setAttribute(k, v) {
    this.attributes.set(k, String(v));
    if (k === "class") this.className = String(v);
    else if (k.startsWith("data-")) this.dataset[camel(k.slice(5))] = String(v);
    else if (k === "title") this.title = String(v);
  }

  getAttribute(k) {
    if (k === "class") return this.className;
    return this.attributes.has(k) ? this.attributes.get(k) : null;
  }

  get textContent() {
    return this.ownText + this.children.map(c => c.textContent).join("");
  }

  set textContent(v) {
    this.ownText = String(v);
    this.children = [];
  }

  #adopt(node) {
    node.parentNode?.removeChild(node);
    node.parentNode = this;
  }

  removeChild(node) {
    const i = this.children.indexOf(node);
    if (i >= 0) this.children.splice(i, 1);
    node.parentNode = null;
  }

  append(...nodes) {
    for (const n of nodes) {
      this.#adopt(n);
      this.children.push(n);
    }
  }

  prepend(...nodes) {
    for (const n of [...nodes].reverse()) {
      this.#adopt(n);
      this.children.unshift(n);
    }
  }

  before(node) {
    const p = this.parentNode;
    p.#adopt(node);
    p.children.splice(p.children.indexOf(this), 0, node);
  }

  after(node) {
    const p = this.parentNode;
    p.#adopt(node);
    p.children.splice(p.children.indexOf(this) + 1, 0, node);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  /** Fire `type` at this element's own listeners; returns what they returned. */
  dispatch(type, extra = {}) {
    const ev = { type, target: this, currentTarget: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    return (this.listeners[type] ?? []).map(fn => fn(ev));
  }

  click() {
    return this.dispatch("click");
  }

  *descendants() {
    for (const c of this.children) {
      yield c;
      yield* c.descendants();
    }
  }

  matches(selector) {
    const parts = selector.trim().split(/\s+/);
    if (!matchCompound(this, parts.at(-1))) return false;
    let node = this.parentNode;
    for (let i = parts.length - 2; i >= 0; i--) {
      while (node && !matchCompound(node, parts[i])) node = node.parentNode;
      if (!node) return false;
      node = node.parentNode;
    }
    return true;
  }

  querySelectorAll(selector) {
    return [...this.descendants()].filter(n => n.matches(selector));
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  closest(selector) {
    for (let n = this; n; n = n.parentNode) if (n.matches(selector)) return n;
    return null;
  }
}

function matchCompound(node, compound) {
  const m = /^([a-z][a-z0-9-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(compound);
  if (!m) throw new Error(`fake DOM: unsupported selector "${compound}"`);
  const [, tag, classes, attrs] = m;
  if (tag && node.tagName !== tag.toUpperCase()) return false;
  for (const c of classes.split(".").filter(Boolean)) if (!node.classList.contains(c)) return false;
  for (const a of attrs.match(/\[[^\]]+\]/g) ?? []) {
    const [, name, value] = /^\[([\w-]+)(?:="?([^"\]]*)"?)?\]$/.exec(a);
    const got = name.startsWith("data-") ? node.dataset[camel(name.slice(5))] : node.getAttribute(name);
    if (got == null) return false;
    if (value !== undefined && got !== value) return false;
  }
  return true;
}

/** Put `document` and `HTMLElement` on globalThis (kit htmlRoot checks `instanceof HTMLElement`). */
export function installDom() {
  globalThis.HTMLElement = FakeElement;
  globalThis.document = { createElement: tag => new FakeElement(tag) };
}

export function h(tag, { cls, data, attrs, text } = {}, children = []) {
  const n = new FakeElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(data ?? {})) n.setAttribute(`data-${k}`, v);
  for (const [k, v] of Object.entries(attrs ?? {})) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  n.append(...children);
  return n;
}
