/**
 * typeahead-core.mjs (guide step 11, prompts-lookup-31): the state machine driven directly with
 * plain events and an injected clock — the same table typeahead.test runs through the window.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTypeahead } from "../typeahead-core.mjs";

function rig() {
  let now = 0, id = 0;
  const timers = new Map();
  const log = { orphans: [], capture: [] };
  const T = createTypeahead({
    setTimer: (fn, ms) => (timers.set(++id, { fn, at: now + ms }), id),
    clearTimer: i => timers.delete(i),
    onOrphan: t => log.orphans.push(t),
    onCapture: on => log.capture.push(on),
  });
  const tick = ms => {
    now += ms;
    for (const [i, t] of [...timers]) if (t.at <= now) { timers.delete(i); t.fn(); }
  };
  const ev = (key, o = {}) => ({ key, code: o.code ?? `Key${key}`, metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false, ...o });
  const type = text => [...text].map(c => T.keyDown(ev(c)));
  return { T, tick, ev, type, log };
}

test("tickets newest-first; capture on/off reported once each way", () => {
  const { T, type, log } = rig();
  const a = T.start();
  type("one");
  const b = T.start();
  type("two");
  assert.deepEqual(T.take(a), { text: "one", close: null });
  assert.equal(T.isCapturing(), true);
  assert.deepEqual(T.take(b), { text: "two", close: null });
  assert.equal(T.isCapturing(), false);
  assert.deepEqual(log.capture, [true, false]);
});

test("keys: modifiers and shortcuts pass; Cmd+Enter / Esc save; Shift+Esc discards; Backspace one code point; arrows and composing swallowed", () => {
  const { T, ev } = rig();
  assert.equal(T.keyDown(ev("q")), false, "no ticket: passes");
  const a = T.start();
  assert.equal(T.keyDown(ev("Shift", { code: "ShiftLeft" })), false);
  assert.equal(T.keyDown(ev("c", { metaKey: true })), false);
  assert.equal(T.keyDown(ev("Enter", { metaKey: true, code: "Enter" })), true);
  assert.deepEqual(T.take(a), { text: "", close: "save" });
  const b = T.start();
  T.keyDown(ev("Escape", { shiftKey: true, code: "Escape" }));
  assert.deepEqual(T.take(b), { text: "", close: "discard" });
  const c = T.start();
  T.keyDown(ev("👍", { code: "Unidentified" }));
  T.keyDown(ev("a"));
  T.keyDown(ev("Backspace", { code: "Backspace" }));
  assert.equal(T.keyDown(ev("ArrowLeft", { code: "ArrowLeft" })), true);
  assert.equal(T.keyDown(ev("x", { isComposing: true })), true);
  T.keyDown(ev("Escape", { code: "Escape" }));
  T.keyDown(ev("Enter", { code: "Enter" }));
  assert.deepEqual(T.take(c), { text: "👍\n", close: "save" });
});

test("a swallowed keydown's keyup is swallowed exactly once", () => {
  const { T, ev } = rig();
  const a = T.start();
  T.keyDown(ev("z", { code: "KeyZ" }));
  T.take(a);
  assert.equal(T.keyUp("KeyZ"), true);
  assert.equal(T.keyUp("KeyZ"), false);
  assert.equal(T.keyUp("KeyY"), false);
});

test("the timeout orphan: the sink first (true = taken), else onOrphan; whitespace is dropped; take(999) is empty", () => {
  const { T, tick, type, log } = rig();
  T.start();
  type("  hi ");
  tick(3499);
  assert.equal(T.isCapturing(), true);
  tick(1);
  assert.deepEqual(log.orphans, ["  hi "]);
  const sunk = [];
  T.setOrphanSink(t => (sunk.push(t), true));
  T.start();
  type("ok");
  tick(3500);
  assert.deepEqual(sunk, ["ok"]);
  T.setOrphanSink(t => false);
  T.start();
  type("no");
  tick(3500);
  assert.deepEqual(log.orphans, ["  hi ", "no"]);
  T.setOrphanSink(null);
  T.start();
  type("   ");
  tick(3500);
  assert.equal(log.orphans.length, 2);
  assert.deepEqual(T.take(999), { text: "", close: null });
});

test("DP5: blur() forgets every swallowed code", () => {
  const { T, ev } = rig();
  const a = T.start();
  T.keyDown(ev("w", { code: "KeyW" }));
  T.keyDown(ev("q", { code: "KeyQ" }));
  T.take(a);
  T.blur();
  assert.equal(T.keyUp("KeyW"), false);
  assert.equal(T.keyUp("KeyQ"), false);
});

test("prompts-core-R4: a keyless keydown (no string key) is swallowed while capturing, never throws", () => {
  const { T, ev } = rig();
  const a = T.start();
  T.keyDown(ev("a"));
  for (const key of [undefined, null, 42]) {
    assert.equal(T.keyDown(ev(key, { code: "" })), true, `key ${String(key)}: swallowed`);
    assert.equal(T.keyDown(ev(key, { code: "", isComposing: true })), true, `composing key ${String(key)}: swallowed`);
  }
  assert.deepEqual(T.take(a), { text: "a", close: null }, "buffer untouched");
  assert.equal(T.keyDown(ev(undefined, { code: "" })), false, "no ticket: passes");
});
