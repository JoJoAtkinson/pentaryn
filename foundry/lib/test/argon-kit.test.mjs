import { test } from "node:test";
import assert from "node:assert/strict";
import { applyButtons, dropTooltip, itemButtonClass, mainPanel, paintBadge, settlePips, slotKind } from "../argon-kit.mjs";

// A DOM-free fake panel and buttons (code-audit-2026-10/transform.md, transform-creatures-12 recipe).
const button = (id) => ({ id, element: { removed: false, remove() { this.removed = true; } }, render() { this.rendered = true; } });
const panel = (buttons, { isConnected = true } = {}) => ({
  _buttons: buttons,
  element: { kids: [], isConnected, appendChild(x) { this.kids.push(x); } },
  updateVisibility() { this.vis = (this.vis || 0) + 1; },
});

test("applyButtons: old buttons removed, order kept, parents set, only fresh rendered, visibility once", () => {
  const [a, b, c] = ["a", "b", "c"].map(button);
  const p = panel([a, b]);
  applyButtons(p, [b, c], [c]);
  assert.equal(a.element.removed, true);
  assert.deepEqual(p.element.kids, [b.element, c.element]);
  assert.equal(b._parent, p);
  assert.equal(c._parent, p);
  assert.deepEqual(p._buttons, [b, c]);
  assert.equal(b.rendered, undefined);
  assert.equal(c.rendered, true);
  assert.equal(p.vis, 1);
});

test("applyButtons superset: `after` runs last with the panel; an attached panel is never moved", () => {
  const [a, b] = ["a", "b"].map(button);
  const p = panel([a]);
  const seen = [];
  applyButtons(p, [a, b], [b], { attachDetached: true, after: x => seen.push([x, x.vis]), g: { ui: {} } });
  assert.deepEqual(seen, [[p, 1]]);
  assert.deepEqual(p.element.kids, [a.element, b.element]);
});

test("applyButtons attachDetached: a detached panel with buttons goes before the next attached main panel", () => {
  const inserted = [];
  const host = { insertBefore(el, before) { inserted.push([el, before]); } };
  const attached = { element: { isConnected: true, parentElement: host } };
  const p = panel([], { isConnected: false });
  const g = { ui: { ARGON: { components: { main: [p, attached] } } } };
  applyButtons(p, [button("x")], [], { attachDetached: true, g });
  assert.deepEqual(inserted, [[p.element, attached.element]]);
});

test("applyButtons attachDetached: last in the row goes after the last attached panel; no host, nothing", () => {
  const inserted = [];
  const host = { insertBefore(el, before) { inserted.push([el, before]); } };
  const sib = { id: "sibling" };
  const attached = { element: { isConnected: true, parentElement: host, nextSibling: sib } };
  const p = panel([], { isConnected: false });
  applyButtons(p, [button("x")], [], { attachDetached: true, g: { ui: { ARGON: { components: { main: [attached, p] } } } } });
  assert.deepEqual(inserted, [[p.element, sib]]);
  const q = panel([], { isConnected: false });
  assert.doesNotThrow(() => applyButtons(q, [button("y")], [], { attachDetached: true, g: { ui: { ARGON: { components: { main: [q] } } } } }));
});

test("applyButtons without attachDetached leaves a detached panel alone (transform's behaviour)", () => {
  const p = panel([], { isConnected: false });
  assert.doesNotThrow(() => applyButtons(p, [button("x")], [], { g: {} }));
  assert.equal(p.vis, 1);
});

test("paintBadge: adds, updates and removes the .quantity-1 badge; toggles the module's empty class", () => {
  const made = [];
  const classes = new Set();
  let badge = null;
  const el = {
    querySelector: () => badge,
    prepend(x) { badge = x; },
    classList: { toggle(c, on) { if (on) classes.add(c); else classes.delete(c); } },
  };
  const g = { document: { createElement: () => {
    const span = { textContent: "" };
    const b = { className: "", innerHTML: "", querySelector: () => span, remove() { badge = null; }, span };
    made.push(b);
    return b;
  } } };
  paintBadge({ element: el }, 2, "x-empty", { g });
  assert.equal(made.length, 1);
  assert.equal(badge.className, "quantity-1");
  assert.equal(badge.span.textContent, "2");
  assert.equal(classes.has("x-empty"), false);
  paintBadge({ element: el }, 0, "x-empty", { g });
  assert.equal(made.length, 1, "reused");
  assert.equal(badge.span.textContent, "0");
  assert.equal(classes.has("x-empty"), true);
  paintBadge({ element: el }, null, "x-empty", { g });
  assert.equal(badge, null);
  assert.equal(classes.has("x-empty"), false);
});

test("dropTooltip: deactivates core's tooltip, forgets Argon's, never throws", () => {
  const calls = [];
  const g = { game: { tooltip: { deactivate: () => calls.push("off") } }, ui: { ARGON: { _tooltip: {} } } };
  dropTooltip({ g });
  assert.deepEqual(calls, ["off"]);
  assert.equal(g.ui.ARGON._tooltip, null);
  const logged = [];
  const bad = { game: { tooltip: { deactivate() { throw new Error("x"); } } } };
  assert.doesNotThrow(() => dropTooltip({ g: bad, log: { debug: (op) => logged.push(op) } }));
  assert.deepEqual(logged, ["drop tooltip"]);
});

test("itemButtonClass: learned from a weapon-set slot, then cached; null before", () => {
  class ItemButton {}
  class DnD5eItemButton extends ItemButton {}
  const g = { CONFIG: { ARGON: { MAIN: { BUTTONS: { ItemButton } } } } };
  assert.equal(itemButtonClass(null, { g }), null);
  assert.equal(itemButtonClass({ _buttons: [new ItemButton()] }, { g }), null, "not a weapon-set slot");
  const slot = Object.assign(new DnD5eItemButton(), { _isWeaponSet: true });
  assert.equal(itemButtonClass({ _buttons: [slot] }, { g }), DnD5eItemButton);
  assert.equal(itemButtonClass(), DnD5eItemButton, "cached");
});

test("slotKind, mainPanel, settlePips", () => {
  class ItemButton {}
  class SplitButton {}
  const item = Object.assign(new ItemButton(), { item: { id: "i1" } });
  const split = Object.assign(new SplitButton(), { button1: { item: { id: "a" } }, button2: { item: { id: "b" } } });
  assert.deepEqual(slotKind({ _isWeaponSet: true }, { ItemButton, SplitButton }), { kind: "weaponSet" });
  assert.deepEqual(slotKind(item, { ItemButton, SplitButton }), { kind: "item", id: "i1" });
  assert.deepEqual(slotKind(split, { ItemButton, SplitButton }), { kind: "split", ids: ["a", "b"] });
  assert.deepEqual(slotKind({}, { ItemButton }), { kind: "other" });

  const action = { label: "DND5E.Action" };
  const g = { ui: { ARGON: { components: { main: [{ label: "DND5E.BonusAction" }, action] } } } };
  assert.equal(mainPanel("DND5E.Action", { g }), action);
  assert.equal(mainPanel("DND5E.Reaction", { g }), null);
  assert.equal(mainPanel("DND5E.Action", { g: {} }), null);

  let n = 0;
  settlePips({ updateActionUse() { n++; } });
  assert.equal(n, 2);
  assert.doesNotThrow(() => settlePips(null));
  assert.doesNotThrow(() => settlePips({}));
});

test("KIT-R6: a fresh button's rejected render is caught and warned through `log` (else g.console), never unhandled", async () => {
  const unhandled = [];
  const onUnhandled = (err) => unhandled.push(err);
  process.on("unhandledRejection", onUnhandled);
  try {
    const boom = new Error("render failed");
    const failing = (id) => ({ id, element: { remove() {} }, render: () => Promise.reject(boom) });
    const warned = [];
    const log = { warn: (...args) => warned.push(args) };
    const a = failing("a");
    assert.doesNotThrow(() => applyButtons(panel([]), [a], [a], { log }));
    const consoled = [];
    const q = panel([]);
    const b = failing("b");
    applyButtons(q, [b], [b], { g: { console: { warn: (...args) => consoled.push(args) } } });
    const ok = button("c");
    applyButtons(panel([]), [ok], [ok], { log });
    await new Promise(r => setTimeout(r, 0));
    assert.equal(warned.length, 1);
    assert.equal(warned[0].at(-1), boom);
    assert.equal(consoled.length, 1);
    assert.equal(consoled[0].at(-1), boom);
    assert.equal(ok.rendered, true);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
