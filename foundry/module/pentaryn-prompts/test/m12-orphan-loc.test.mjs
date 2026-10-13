/**
 * M12 (final review 2026-10-12, prompts-adapters): the adapter's no-sink orphan toast hard-coded
 * English. It now goes through `_loc("PENTARYN_PROMPTS.typeahead.orphan", {text})` — the key
 * typeahead.mjs uses — and keeps the English string only where `_loc` is not defined (node).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const L = {};
const toasts = [];
const locCalls = [];
globalThis.window = { addEventListener: (type, fn) => (L[type] = fn), removeEventListener: type => delete L[type] };
globalThis.ui = { notifications: { warn: s => toasts.push(s) } };
const T = await import("../typeahead-adapter.mjs");

const type = text => {
  for (const k of text) {
    L.keydown?.({ key: k, code: `Key${k}`, metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false,
      preventDefault() {}, stopImmediatePropagation() {} });
  }
};

test("M12: the no-sink orphan toast is localised through _loc with the typeahead.orphan key", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  globalThis._loc = (key, data) => (locCalls.push([key, data]), `[de] ${data?.text}`);
  try {
    toasts.length = 0;
    T.setOrphanSink(null);
    T.start();
    type("hallo");
    t.mock.timers.tick(3500);
    assert.deepEqual(locCalls, [["PENTARYN_PROMPTS.typeahead.orphan", { text: "hallo" }]]);
    assert.deepEqual(toasts, ["[de] hallo"]);
  } finally {
    delete globalThis._loc;
  }
});

test("M12: without _loc (node) the toast falls back to the English string, cut at 120", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  toasts.length = 0;
  T.setOrphanSink(null);
  T.start();
  type("x".repeat(200));
  t.mock.timers.tick(3500);
  assert.deepEqual(toasts, [`Typed before a prompt box opened and not used: "${"x".repeat(120)}"`]);
});
