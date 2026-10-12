/**
 * Characterisation (prompts checkpoint, wave 1), prompts-lookup-31: the typeahead ticket and
 * keystroke state machine, driven through a stub window (the file installs its keyup listener at
 * import). Timers are node:test mock timers. KNOWN rows (prompts-lookup-32) pin today's gaps
 * as they are. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const L = {};
const toasts = [];
globalThis.window = { addEventListener: (type, fn) => (L[type] = fn), removeEventListener: type => delete L[type] };
globalThis.ui = { notifications: { warn: s => toasts.push(s) } };
const T = await import("../typeahead-adapter.mjs");

/** A keyboard event; returns whether the module swallowed it. */
function key(type, k, o = {}) {
  let swallowed = false;
  const ev = { key: k, code: o.code ?? `Key${k}`, metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false, ...o,
    preventDefault() { swallowed = true; }, stopImmediatePropagation() {} };
  L[type]?.(ev);
  return swallowed;
}
const type = (text, o) => [...text].forEach(c => key("keydown", c, o));

test("tickets: keys go to the newest pending ticket; capture stops when the last is taken", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const t1 = T.start();
  type("one");
  const t2 = T.start();
  type("two");
  assert.deepEqual(T.take(t1), { text: "one", close: null });
  assert.equal(T.isCapturing(), true);
  assert.deepEqual(T.take(t2), { text: "two", close: null });
  assert.equal(T.isCapturing(), false);
  assert.equal(typeof L.keydown, "undefined", "keydown listener removed when capture ends");
  assert.equal(typeof L.keyup, "function", "keyup listener stays (installed at import)");
});

test("modifiers and shortcuts pass; Cmd+Enter saves; Shift+Escape discards; Escape saves", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = T.start();
  assert.equal(key("keydown", "Shift", { code: "ShiftLeft" }), false);
  assert.equal(key("keydown", "c", { metaKey: true }), false);
  assert.equal(key("keydown", "Enter", { metaKey: true, code: "Enter" }), true);
  assert.deepEqual(T.take(a), { text: "", close: "save" });
  const b = T.start();
  key("keydown", "Escape", { shiftKey: true, code: "Escape" });
  assert.deepEqual(T.take(b), { text: "", close: "discard" });
  const c = T.start();
  key("keydown", "Escape", { code: "Escape" });
  key("keydown", "Enter", { code: "Enter" });
  assert.deepEqual(T.take(c), { text: "\n", close: "save" });
});

test("Backspace drops one code point; arrows and composing keys are swallowed without text", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = T.start();
  key("keydown", "👍", { code: "Unidentified" });
  key("keydown", "a");
  key("keydown", "Backspace", { code: "Backspace" });
  assert.equal(key("keydown", "ArrowLeft", { code: "ArrowLeft" }), true);
  assert.equal(key("keydown", "x", { isComposing: true }), true);
  assert.deepEqual(T.take(a), { text: "👍", close: null });
});

test("no ticket: keydown passes; a swallowed code is swallowed exactly once on keyup, even after take()", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  assert.equal(key("keydown", "q"), false);
  const a = T.start();
  key("keydown", "z", { code: "KeyZ" });
  T.take(a);
  assert.equal(key("keyup", "z", { code: "KeyZ" }), true);
  assert.equal(key("keyup", "z", { code: "KeyZ" }), false);
  assert.equal(key("keyup", "y", { code: "KeyY" }), false);
});

test("the 3,500 ms orphan: a toast, or the sink, or nothing for whitespace; take(999) is empty", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  toasts.length = 0;
  T.setOrphanSink(null);
  T.start();
  type("  hi ", { code: "Space" });
  t.mock.timers.tick(3499);
  assert.equal(T.isCapturing(), true);
  t.mock.timers.tick(1);
  assert.equal(T.isCapturing(), false);
  assert.deepEqual(toasts, ['Typed before a prompt box opened and not used: "hi"']);
  const sunk = [];
  T.setOrphanSink(text => (sunk.push(text), true));
  T.start();
  type("ok");
  t.mock.timers.tick(3500);
  assert.deepEqual(sunk, ["ok"]);
  assert.equal(toasts.length, 1);
  T.setOrphanSink(null);
  T.start();
  type("   ", { code: "Space" });
  t.mock.timers.tick(3500);
  assert.equal(toasts.length, 1);
  assert.deepEqual(T.take(999), { text: "", close: null });
  for (const c of ["Space", "KeyZ"]) key("keyup", "", { code: c });   // drain swallowed codes
});

test("[declared] DP5 (prompts-lookup-32 item 2): window blur clears the swallowed set; KNOWN: there is no uninstall", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = T.start();
  key("keydown", "w", { code: "KeyW" });
  T.take(a);
  // a blur handler clears the set (was KNOWN: "blur" in L was false and this keyup was swallowed)
  assert.equal(typeof L.blur, "function");
  L.blur({});
  assert.equal(key("keyup", "w", { code: "KeyW" }), false);
  assert.equal("uninstall" in T, false);
});
