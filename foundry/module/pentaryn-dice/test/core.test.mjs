// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry
// global at load, this file would fail before any test ran: that is the purity proof.
import * as core from "../dice-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const ROOT = new URL("..", import.meta.url);

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
  for (const fn of ["probeInternals", "clampCount", "spawnGroups", "idsToSelect", "selectionSummary", "bindingLabel", "statusOf"]) {
    assert.equal(typeof core[fn], "function", fn);
  }
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, manifest.flags.pentaryn.namespace);
  assert.equal(core.CSS, manifest.flags.pentaryn.cssPrefix);
  assert.equal(core.FLAG_SCOPE, manifest.flags.pentaryn.flagScope);
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
  assert.ok(manifest.relationships.requires.some(r => r.id === core.DSN), "dice-so-nice is required");
});

test("every HOOKS row is named pentaryn-<short>.* (or carries a legacyName with an until)", () => {
  for (const [key, row] of Object.entries(core.HOOKS)) {
    assert.ok(row.name.startsWith(`${core.MODULE}.`), key);
    if (row.legacyName) assert.ok(row.until, `${key}: legacyName needs until`);
  }
});

test("the default shortcut is not Ctrl+A (core selectAll), Shift+A (Argon) or a bare A (core moveLeft)", () => {
  const { key, modifiers } = core.DEFAULT_SELECT_KEY;
  assert.equal(key, "KeyA");
  assert.deepEqual([...modifiers], ["Alt"]);
  assert.ok(!modifiers.includes("Control") && !modifiers.includes("Shift") && modifiers.length > 0);
});

/* ── probeInternals ─────────────────────────────────────────────────── */

const fullDice3d = () => ({
  persistent: { spawn() {} },
  box: {
    persistentDiceManager: {
      selectedPersistentDiceIds: new Set(),
      togglePersistentSelection() {},
      clearPersistentSelection() {},
      getSelectedPersistentDice() {},
      countPersistentDiceByOwner() {},
    },
  },
});

test("INTERNALS names exactly the six internals the plan's smoke check lists", () => {
  assert.deepEqual(core.INTERNALS.map(i => i.name), [
    "persistent.spawn", "selectedPersistentDiceIds", "togglePersistentSelection",
    "clearPersistentSelection", "getSelectedPersistentDice", "countPersistentDiceByOwner",
  ]);
});

test("probeInternals: all six present → ok", () => {
  const r = core.probeInternals(fullDice3d());
  assert.equal(r.ok, true);
  assert.equal(r.checks.length, 6);
  assert.ok(r.checks.every(c => c.ok));
});

test("probeInternals: no dice3d → every check fails with the same reason", () => {
  const r = core.probeInternals(null);
  assert.equal(r.ok, false);
  assert.ok(r.checks.every(c => !c.ok && /game\.dice3d is missing/.test(c.detail)));
});

test("probeInternals: no manager (persistent dice off) → five fail and say why; spawn still passes", () => {
  const d = fullDice3d();
  d.box.persistentDiceManager = null;
  const r = core.probeInternals(d);
  assert.equal(r.ok, false);
  assert.deepEqual(r.checks.map(c => c.ok), [true, false, false, false, false, false]);
  assert.match(r.checks[1].detail, /persistent dice setting is off/);
});

test("probeInternals: a renamed method, or the Set replaced by an array, fails that check only", () => {
  const d = fullDice3d();
  delete d.box.persistentDiceManager.getSelectedPersistentDice;
  d.box.persistentDiceManager.selectedPersistentDiceIds = [];
  const r = core.probeInternals(d);
  const bad = r.checks.filter(c => !c.ok).map(c => c.name);
  assert.deepEqual(bad, ["selectedPersistentDiceIds", "getSelectedPersistentDice"]);
  assert.match(r.checks.find(c => c.name === "getSelectedPersistentDice").detail, /is missing/);
});

/* ── counts and spawn groups ────────────────────────────────────────── */

test("clampCount: integers 1..MAX_COUNT; anything unreadable is 1", () => {
  const table = [
    [8, 8], ["8", 8], [" 3 ", 3], [2.9, 2], [0, 1], [-4, 1], ["", 1], ["x", 1], [null, 1], [undefined, 1],
    [NaN, 1], [Infinity, 1], [core.MAX_COUNT, core.MAX_COUNT], [core.MAX_COUNT + 50, core.MAX_COUNT],
  ];
  for (const [input, want] of table) assert.equal(core.clampCount(input), want, JSON.stringify(input));
});

test("spawnGroups: a plain die is one die per group", () => {
  assert.deepEqual(core.spawnGroups("d6", 3), [
    [{ type: "d6", digitPlace: null, secondary: false }],
    [{ type: "d6", digitPlace: null, secondary: false }],
    [{ type: "d6", digitPlace: null, secondary: false }],
  ]);
  assert.equal(core.spawnGroups("d20").length, 1, "count defaults to 1");
  assert.equal(core.spawnGroups("dc", 2).length, 2, "Dice So Nice's coin");
  assert.equal(core.spawnGroups("df", 1).length, 1, "Fate die");
});

test("spawnGroups: a d100 is its linked tens + units pair, as Dice So Nice's own + spawns it", () => {
  const g = core.spawnGroups("d100", 2);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0], [
    { type: "d100", digitPlace: 0, secondary: false },
    { type: "d10", digitPlace: 1, secondary: true },
  ]);
  assert.notEqual(g[0], g[1], "each group is its own copy");
  assert.equal(core.spawnGroups("d1000", 1)[0].length, 3);
});

test("spawnGroups: not a die name → null; the count is clamped", () => {
  for (const bad of [null, undefined, "", "6", "d", "dx", "2d6", 6, "d6 "]) assert.equal(core.spawnGroups(bad, 1), null, String(bad));
  assert.equal(core.spawnGroups("d6", 999).length, core.MAX_COUNT);
  assert.equal(core.spawnGroups("d6", 0).length, 1);
});

/* ── selection ──────────────────────────────────────────────────────── */

const ME = "me00000000000001";
const YOU = "you0000000000001";
const DICE = [
  { id: 1, type: "d6", owner: ME },
  { id: 2, type: "d6", owner: YOU },
  { id: 3, type: "d20", owner: ME },
  { id: 4, type: "d100", owner: ME, linkGroupId: "g1" },
  { id: 5, type: "d10", owner: ME, linkGroupId: "g1", secondary: true },
  { id: 6, type: "d10", owner: ME },
  { id: 7, type: "d6", owner: ME, guest: true },
  { id: 8, type: "d6", owner: ME },
];

test("idsToSelect: all of mine — never another player's, never a guest die; pairs whole", () => {
  assert.deepEqual(core.idsToSelect(DICE, { userId: ME }), [1, 3, 4, 5, 6, 8]);
  assert.deepEqual(core.idsToSelect(DICE, { userId: YOU }), [2]);
  assert.deepEqual(core.idsToSelect(DICE, { userId: "nobody0000000001" }), []);
});

test("idsToSelect: one type — a d100 brings its d10 half; 'all d10' leaves the pair's d10 alone", () => {
  assert.deepEqual(core.idsToSelect(DICE, { userId: ME, type: "d6" }), [1, 8]);
  assert.deepEqual(core.idsToSelect(DICE, { userId: ME, type: "d100" }), [4, 5]);
  assert.deepEqual(core.idsToSelect(DICE, { userId: ME, type: "d10" }), [6]);
  assert.deepEqual(core.idsToSelect(DICE, { userId: ME, type: "d8" }), []);
});

test("idsToSelect: hostile input", () => {
  assert.deepEqual(core.idsToSelect(null, { userId: ME }), []);
  assert.deepEqual(core.idsToSelect([null, undefined, { id: 9, type: "d4", owner: ME }], { userId: ME }), [9]);
  assert.deepEqual(core.idsToSelect(DICE), [], "no user → nothing (owner null never matches undefined)");
});

test("countRolls and selectionSummary count a d100 pair once", () => {
  assert.equal(core.countRolls(DICE.filter(d => d.owner === ME)), 6);
  assert.deepEqual(core.selectionSummary(DICE, [1, 4, 5, 8, 99]), { d6: 2, d100: 1 });
  assert.deepEqual(core.selectionSummary(DICE, []), {});
  assert.deepEqual(core.selectionSummary(null, null), {});
});

/* ── labels and status ──────────────────────────────────────────────── */

test("bindingLabel: Foundry key codes → what a player reads", () => {
  const table = [
    [{ key: "KeyA", modifiers: ["Alt"] }, "Alt+A"],
    [{ key: "KeyS", modifiers: ["Control", "Shift"] }, "Ctrl+Shift+S"],
    [{ key: "Digit7" }, "7"],
    [{ key: "Numpad3", modifiers: [] }, "Num 3"],
    [{ key: "F2" }, "F2"],
    [null, null],
    [{}, null],
    [{ key: "" }, null],
  ];
  for (const [input, want] of table) assert.equal(core.bindingLabel(input), want, JSON.stringify(input));
});

test("statusOf: one plain object; mine counts rolls, selected counts by type", () => {
  const s = core.statusOf({ enabled: true, active: true, persistentDice: true, dice: DICE, selectedIds: [3, 6], userId: ME, shortcut: "Alt+A", internals: { ok: true, checks: [] } });
  assert.deepEqual(s, {
    enabled: true, dsnActive: true, persistentDice: true, mine: 5, selected: { d20: 1, d10: 1 },
    shortcut: "Alt+A", internals: { ok: true, checks: [] },
  });
  const empty = core.statusOf();
  assert.deepEqual([empty.enabled, empty.dsnActive, empty.mine, empty.internals.ok], [true, false, 0, false]);
});
