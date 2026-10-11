// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../__SHORT__-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(typeof core.noteText, "function");
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, manifest.flags.pentaryn.namespace);
  assert.equal(core.CSS, manifest.flags.pentaryn.cssPrefix);
  assert.equal(core.FLAG_SCOPE, manifest.flags.pentaryn.flagScope);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
});

test("every HOOKS row is named pentaryn-<short>.* (or carries a legacyName with an until)", () => {
  for (const [key, row] of Object.entries(core.HOOKS)) {
    assert.ok(row.name.startsWith(`${core.MODULE}.`), key);
    if (row.legacyName) assert.ok(row.until, `${key}: legacyName needs until`);
  }
});

test("noteText: trims, collapses, caps; empty and non-strings are null", () => {
  const long = "x".repeat(core.NOTE_MAX + 10);
  const table = [
    ["  hello   world ", "hello world"],
    ["line\nbreak\ttab", "line break tab"],
    ["", null],
    ["   ", null],
    [null, null],
    [42, null],
    [long, `${"x".repeat(core.NOTE_MAX - 1)}…`],
  ];
  for (const [input, want] of table) assert.equal(core.noteText(input), want, JSON.stringify(input));
});
// @if dnd5e

test("hpOf: value/max/bloodied from a plain actor-like object", () => {
  assert.deepEqual(core.hpOf({ system: { attributes: { hp: { value: 9, max: 20 } } } }), { value: 9, max: 20, bloodied: true });
  assert.deepEqual(core.hpOf({ system: { attributes: { hp: { value: 11, max: 20 } } } }), { value: 11, max: 20, bloodied: false });
  assert.deepEqual(core.hpOf({ system: { attributes: { hp: { value: 3, max: 0 } } } }), { value: 3, max: null, bloodied: false });
  assert.equal(core.hpOf({ system: {} }), null);
  assert.equal(core.hpOf(null), null);
});
// @endif
