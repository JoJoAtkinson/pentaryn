// settings.mjs (guide step 4): the tables register exactly what the glue registered (glue case (a)
// pins the values); the row-only fields never reach Foundry; setting() falls back to the default.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wallsWorld } from "./fixtures/world.mjs";

const F = await wallsWorld();
const { KEYBINDINGS, SETTINGS, registerSettings, setting, settingsSnapshot } = await import("../settings.mjs");

test("before init: setting() answers the row default, never throws", () => {
  assert.equal(setting("backend"), "auto");
  assert.equal(setting("nope"), undefined);
});

test("registerSettings: one setting, three keybindings in table order; no `action`/`doc` reaches Foundry", () => {
  const pressed = [];
  registerSettings({ onKey: action => () => { pressed.push(action); return true; } });
  assert.deepEqual([...game.settings.settings.keys()].filter(k => k.startsWith("pentaryn-walls.")), ["pentaryn-walls.backend"]);
  const binds = [...game.keybindings.actions.entries()].filter(([id]) => id.startsWith("pentaryn-walls."));
  assert.deepEqual(binds.map(([id]) => id), KEYBINDINGS.map(r => `pentaryn-walls.${r.key}`));
  for (const [, b] of binds) {
    assert.equal("action" in b, false);
    assert.equal("doc" in b, false);
    assert.equal(b.onDown(), true);
  }
  assert.deepEqual(pressed, ["run", "undo", "preview"]);
  assert.notEqual(binds[0][1].editable, KEYBINDINGS[0].editable, "Foundry gets its own copy of the table's arrays");
});

test("a second registerSettings (hot patch) registers nothing new and does not throw", () => {
  registerSettings({ onKey: () => () => true });
  assert.equal([...game.keybindings.actions.keys()].filter(k => k.startsWith("pentaryn-walls.")).length, 3);
});

test("setting() reads live; settingsSnapshot() lists every row", async () => {
  await game.settings.set("pentaryn-walls", "backend", "js");
  assert.equal(setting("backend"), "js");
  assert.deepEqual(settingsSnapshot(), { backend: "js" });
  assert.deepEqual(SETTINGS.map(r => r.key), ["backend"]);
});

test("a failing settings read falls back to the default (unreachable once init has run)", () => {
  const get = game.settings.get;
  game.settings.get = () => { throw new Error("not registered"); };
  try {
    assert.equal(setting("backend"), "auto");
  } finally {
    game.settings.get = get;
  }
  assert.ok(F);
});
