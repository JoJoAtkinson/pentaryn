// Glue: install the Foundry stub, load the entry exactly as Foundry would, fire the lifecycle,
// and pin EFFECTS (hooks registered, settings and keybindings, console text) — not return values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";
import { installDom } from "./fixtures/dom.mjs";
import { fakeDsn, tabElement, world } from "./fixtures/dsn.mjs";
import { MODULE, NS } from "../dice-core.mjs";

installDom();
const F = await installFoundry(world(MODULE));
const D = fakeDsn();
game.dice3d = D.dice3d;
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);

await import("../dice.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const hooksAtReady = F.hooks.slice();
const api = game.modules.get(MODULE).api;

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("published at ready: module.api is canonical, game.pentaryn alias, both ready hooks", () => {
  assert.ok(api, "module.api not set");
  assert.equal(game.pentaryn[NS], api);
  assert.equal(api.contract, `${MODULE}/api@1`);
  assert.ok(Object.isFrozen(api));
  const emitted = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(emitted.includes(`${MODULE}.ready`) && emitted.includes("pentaryn.ready"));
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
});

test("init registers the client setting and the select-all keybinding: Alt+A, never Ctrl+A", () => {
  const regs = F.calls.filter(c => c.op === "settings.register").map(c => c.id);
  assert.deepEqual(regs, [`${MODULE}.enabled`]);
  assert.equal(game.settings.settings.get(`${MODULE}.enabled`).scope, "client");
  const action = game.keybindings.actions.get(`${MODULE}.selectAll`);
  assert.ok(action, "keybinding registered");
  assert.deepEqual(action.editable, [{ key: "KeyA", modifiers: ["Alt"] }]);
  assert.equal(typeof action.onDown, "function");
  assert.equal(action.name, "PENTARYN_DICE.Keybind.selectAll.Name");
});

test("the shortcut passes the key on (false) with no dice of yours out, and selects them (true) when there are", () => {
  const onDown = game.keybindings.actions.get(`${MODULE}.selectAll`).onDown;
  D.make("d6", { ownerUserId: "someoneelse00001" });
  assert.equal(onDown(), false, "only another player's die on the table");
  assert.equal(D.selected.size, 0);
  const mine = D.make("d8");
  assert.equal(onDown(), true);
  assert.deepEqual([...D.selected], [mine.id]);
  D.manager.clearPersistentSelection();
});

test("a throw inside our own handler is logged with the module prefix and never reaches Foundry", () => {
  consoleLines.length = 0;
  const caught = F.hookErrors.length;
  // a tab element whose querySelectorAll throws makes the feature's own render handler throw
  const broken = tabElement();
  broken.querySelectorAll = () => { throw new Error("boom"); };
  F.fire("renderDsnSidebarTab", {}, broken);
  assert.deepEqual(consoleLines, [["error", `${MODULE} | renderDsnSidebarTab: helpers`]]);
  assert.equal(F.hookErrors.length, caught, "the guard must catch it before Foundry's Hooks.#call does");
});

test("hook registration manifest (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtReady, import.meta.url);
  assert.deepEqual(api.describe().hooks.map(h => h.label), ["renderDsnSidebarTab: helpers"]);
});

test("describe() has the use-doc §5.1a key set every namespace shares (small and full alike)", () => {
  assert.deepEqual(Object.keys(api.describe()), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(Object.keys(game.pentaryn.describe().namespaces), [NS]);
  assert.ok(Array.isArray(game.pentaryn.describe().namespaces[NS].methods));
});

// Keep this test LAST: it replaces the published API.
// A hot patch re-runs the WIRING only: the entry's static imports (features, api, settings, core,
// lib/) are the instances already loaded, so this proves re-registration and republish of the same
// code — never that edited feature code is picked up (that needs a reload).
test("hot patch: uninstall(), re-import the entry, and the wiring runs again", async () => {
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("renderDsnSidebarTab"), 0);
  const tab = tabElement();
  F.fire("renderDsnSidebarTab", {}, tab);
  assert.equal(tab.querySelectorAll(".pdi-count").length, 0, "nothing decorates after uninstall");
  D.make("d4");
  assert.equal(game.keybindings.actions.get(`${MODULE}.selectAll`).onDown(), false, "the shortcut is inert after uninstall");
  assert.equal(game.ready, true);
  assert.ok(game.keybindings.bindings, "Foundry has built its keybindings: registering one now throws");
  const binds = F.calls.filter(c => c.op === "keybindings.register").length;
  consoleLines.length = 0;
  await import(`../dice.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, [], "the re-run init must not throw (settings/keybindings already registered are skipped)");
  assert.equal(F.calls.filter(c => c.op === "keybindings.register").length, binds);
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(F.listeners("renderDsnSidebarTab"), 1);
  F.fire("renderDsnSidebarTab", {}, tab);
  assert.equal(tab.querySelectorAll(".pdi-count").length, 7, "decorates again");
  assert.equal(game.keybindings.actions.get(`${MODULE}.selectAll`).onDown(), true, "and the shortcut works again");
});
