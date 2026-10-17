// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../resume-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  assert.equal(typeof core.resumeTarget, "function");
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

test("viewRecord: needs a scene id; a position is all of x, y, scale or nothing", () => {
  const table = [
    [null, null],
    ["scene", null],
    [{}, null],
    [{ scene: "" }, null],
    [{ scene: "s1" }, { scene: "s1", level: null, active: null }],
    [{ scene: "s1", level: "l1", active: "a1", x: 10.4, y: 20.6, scale: 0.75049 },
      { scene: "s1", level: "l1", active: "a1", x: 10, y: 21, scale: 0.75 }],
    [{ scene: "s1", x: 1, y: 2 }, { scene: "s1", level: null, active: null }],
    [{ scene: "s1", x: 1, y: 2, scale: 0 }, { scene: "s1", level: null, active: null }],
    [{ scene: "s1", x: NaN, y: 2, scale: 1 }, { scene: "s1", level: null, active: null }],
    [{ scene: "s1", level: 5, active: "" }, { scene: "s1", level: null, active: null }],
  ];
  for (const [input, want] of table) assert.deepEqual(core.viewRecord(input), want, JSON.stringify(input));
});

test("sameView: a pixel and a thousandth of zoom are noise; scene, level, active are not", () => {
  const base = { scene: "s1", level: "l1", active: "a1", x: 100, y: 200, scale: 1 };
  assert.equal(core.sameView(base, { ...base, x: 100.4 }), true);
  assert.equal(core.sameView(base, { ...base, x: 102 }), false);
  assert.equal(core.sameView(base, { ...base, scale: 1.01 }), false);
  assert.equal(core.sameView(base, { ...base, scene: "s2" }), false);
  assert.equal(core.sameView(base, { ...base, level: null }), false);
  assert.equal(core.sameView(base, { ...base, active: "a2" }), false);
  assert.equal(core.sameView(base, { scene: "s1", level: "l1", active: "a1" }), false);
  assert.equal(core.sameView(base, undefined), false);
  assert.equal(core.sameView(undefined, null), true);
});

test("resumeTarget: back to the saved view only while the active scene is unchanged", () => {
  const saved = { scene: "cave", level: "l2", active: "town", x: 500, y: 600, scale: 0.5 };
  const exists = id => ["town", "cave"].includes(id);
  const table = [
    ["the saved view, same active scene", saved, { activeId: "town", sceneExists: exists },
      { scene: "cave", level: "l2", position: { x: 500, y: 600, scale: 0.5 } }],
    ["no saved view", undefined, { activeId: "town", sceneExists: exists }, null],
    ["the GM moved the table on", saved, { activeId: "cave", sceneExists: exists }, null],
    ["the active scene was deactivated", saved, { activeId: null, sceneExists: exists }, null],
    ["the saved scene was deleted", saved, { activeId: "town", sceneExists: () => false }, null],
    ["no position stored", { scene: "town", active: "town" }, { activeId: "town", sceneExists: exists },
      { scene: "town", level: null, position: null }],
    ["saved with no active scene, still none", { scene: "cave", active: null }, { activeId: null, sceneExists: exists },
      { scene: "cave", level: null, position: null }],
  ];
  for (const [why, input, world, want] of table) assert.deepEqual(core.resumeTarget(input, world), want, why);
});
