/**
 * Just enough DOM for the dropbin glue (no jsdom): elements with classes, dataset, children, the few
 * selectors the module uses (`tag`, `.a.b`, `tag.a`, `[data-x]`, `:scope > tag`), events and removal.
 * An unsupported selector matches nothing — e.g. loot's `button:not(.pd-loot-all) i.fa-fist-raised`
 * (native Take All present) always reads "absent" here.
 */

export class FakeElement {
  constructor(tag = "div", { className = "", dataset = {}, children = [] } = {}) {
    this.tagName = tag.toUpperCase();
    this.className = className;
    this.dataset = { ...dataset };
    this.children = [];
    this.parent = null;
    this.innerHTML = "";
    this.hidden = false;
    this.disabled = false;
    this.listeners = {};
    for (const c of children) this.append(c);
  }
  get classList() {
    const el = this;
    const list = () => el.className.split(/\s+/).filter(Boolean);
    return {
      add: (...c) => { el.className = [...new Set([...list(), ...c])].join(" "); },
      remove: (...c) => { el.className = list().filter(x => !c.includes(x)).join(" "); },
      toggle: (c, on) => {
        const want = on ?? !list().includes(c);
        el.className = (want ? [...new Set([...list(), c])] : list().filter(x => x !== c)).join(" ");
        return want;
      },
      contains: c => list().includes(c),
    };
  }
  get isConnected() {
    let n = this;
    while (n.parent) n = n.parent;
    return n.root === true;
  }
  append(...nodes) {
    for (const n of nodes) { n.parent = this; this.children.push(n); }
  }
  prepend(n) {
    n.parent = this;
    this.children.unshift(n);
  }
  insertBefore(n, ref) {
    n.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(n);
    else this.children.splice(i, 0, n);
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
  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }
  click() {
    const ev = { preventDefault() {}, stopPropagation() {}, target: this };
    for (const fn of this.listeners.click ?? []) fn(ev);
  }
  matches(sel) {
    const m = /^([a-z]*)((?:\.[\w-]+)*)(?:\[([\w-]+)\])?$/i.exec(sel.trim());
    if (!m) return false;
    const [, tag, classes, attr] = m;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    for (const c of classes.split(".").filter(Boolean)) if (!this.classList.contains(c)) return false;
    if (attr) {
      const key = attr.replace(/^data-/, "").replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      if (!(key in this.dataset)) return false;
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
}

/** Install `document` and `HTMLElement` globals backed by FakeElement. */
export function installDom() {
  globalThis.HTMLElement = FakeElement;
  globalThis.document = { createElement: tag => new FakeElement(tag) };
}

export const el = (tag, opts) => new FakeElement(tag, opts);
