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
  // pinned null (pins absent, off, unpinned, a GM, no single token) is exactly the table above
  for (const [why, input, world, want] of table) assert.deepEqual(core.resumeTarget(input, { ...world, pinned: null }), want, `${why} (pinned null)`);
  // a pinned token whose scene is not an id string is no pin (memory.mjs logs it)
  for (const [why, input, world, want] of table) assert.deepEqual(core.resumeTarget(input, { ...world, pinned: { scene: { id: "cave" } } }), want, `${why} (bad pinned)`);
});

test("resumeTarget with a pinned token (pentaryn-pins, resume 0.2.0): the token's scene and level; the saved pan/zoom only on that scene", () => {
  const saved = { scene: "cave", level: "l2", active: "town", x: 500, y: 600, scale: 0.5 };
  const exists = id => ["town", "cave"].includes(id);
  const pinned = { scene: "cave", level: "l1", token: "Scene.cave.Token.t1" };
  const pos = { x: 500, y: 600, scale: 0.5 };
  const table = [
    ["saved view of the pinned scene: the token's level (not the saved one), the saved position", saved,
      { activeId: "town", sceneExists: exists, pinned }, { scene: "cave", level: "l1", token: pinned.token, position: pos }],
    ["the active scene changed since the save: the table moving on does not apply", saved,
      { activeId: "keep", sceneExists: exists, pinned }, { scene: "cave", level: "l1", token: pinned.token, position: pos }],
    ["saved view of another scene: the pinned scene, no position", { ...saved, scene: "town" },
      { activeId: "town", sceneExists: exists, pinned }, { scene: "cave", level: "l1", token: pinned.token, position: null }],
    ["no saved view: still the pinned scene (pins 0.1.0's patch did this draw)", undefined,
      { activeId: "town", sceneExists: exists, pinned }, { scene: "cave", level: "l1", token: pinned.token, position: null }],
    ["saved view of the pinned scene with no position", { scene: "cave", active: "town" },
      { activeId: "x", sceneExists: exists, pinned }, { scene: "cave", level: "l1", token: pinned.token, position: null }],
    ["a token with no level", saved, { activeId: "town", sceneExists: exists, pinned: { scene: "cave", token: pinned.token } },
      { scene: "cave", level: null, token: pinned.token, position: pos }],
    ["the pinned token's scene is gone", saved, { activeId: "town", sceneExists: id => id === "town", pinned }, null],
  ];
  for (const [why, input, world, want] of table) assert.deepEqual(core.resumeTarget(input, world), want, why);
});
