// Glue: install the Foundry stub, load the entry exactly as Foundry would, fire the lifecycle,
// and pin EFFECTS (hooks registered, calls made, console text) — not return values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
// @if small
import { pinJSON } from "./kit/harness.mjs";
// @endif
import { IDS, world } from "./fixtures/actors.mjs";
import { HOOKS, MODULE, NS } from "../__SHORT__-core.mjs";

const F = await installFoundry(world(MODULE));
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);

await import("../__SHORT__.mjs");
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

test("a note flag change emits noteChanged once, with the normalised note", async () => {
  const seen = [];
  const id = Hooks.on(HOOKS.noteChanged.name, (actor, note) => seen.push([actor.id, note]));
  const actor = game.actors.get(IDS.aldric);
  await actor.update({ [`flags.${MODULE}.note`]: "  keep   watch " });
  await actor.update({ name: "Aldric V." });                 // not ours: nothing
  Hooks.off(HOOKS.noteChanged.name, id);
  assert.deepEqual(seen, [[IDS.aldric, "keep watch"]]);
});
// @if full

test("the enabled setting gates the feature", async () => {
  const seen = [];
  const id = Hooks.on(HOOKS.noteChanged.name, () => seen.push(1));
  await game.settings.set(MODULE, "enabled", false);
  await game.actors.get(IDS.aldric).update({ [`flags.${MODULE}.note`]: "quiet" });
  await game.settings.set(MODULE, "enabled", true);
  Hooks.off(HOOKS.noteChanged.name, id);
  assert.deepEqual(seen, []);
});
// @endif

test("a throw inside our own handler is logged with the module prefix and never reaches Foundry", () => {
  consoleLines.length = 0;
  const caught = F.hookErrors.length;
  // a malformed document makes the feature's own updateActor handler throw (actor.id of null)
  F.fire("updateActor", null, { flags: { [MODULE]: { note: "boom" } } });
  assert.deepEqual(consoleLines, [["error", `${MODULE} | updateActor: note`]]);
  assert.equal(F.hookErrors.length, caught, "the guard must catch it before Foundry's Hooks.#call does");
});

test("a throw in someone else's listener is Foundry's to report, not ours", async () => {
  consoleLines.length = 0;
  const id = Hooks.on(HOOKS.noteChanged.name, function downstream() { throw new Error("listener broke"); });
  await game.actors.get(IDS.aldric).update({ [`flags.${MODULE}.note`]: "again" });
  Hooks.off(HOOKS.noteChanged.name, id);
  const msg = `Error thrown in hooked function 'downstream' for hook '${HOOKS.noteChanged.name}'`;
  assert.deepEqual(consoleLines, [["warn", `Foundry VTT | ${msg}`], ["error", `Error: ${msg}. listener broke`]]);
});
// @if small

test("hook registration manifest (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtReady, import.meta.url);
  assert.deepEqual(api.describe().hooks.map(h => h.label), ["updateActor: note", "deleteActor: prune"]);
});
// @endif

test("describe() has the use-doc §5.1a key set every namespace shares (small and full alike)", () => {
  assert.deepEqual(Object.keys(api.describe()), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(Object.keys(game.pentaryn.describe().namespaces), [NS]);
  assert.ok(Array.isArray(game.pentaryn.describe().namespaces[NS].methods));
});

// @if full

test("the example keybinding registers at init and flips the enabled setting", async () => {
  const id = `${MODULE}.toggleEnabled`;
  assert.deepEqual(F.calls.filter(c => c.op === "keybindings.register").map(c => c.id), [id]);
  assert.equal(game.keybindings.actions.get(id).onDown(), true);
  await new Promise(r => setTimeout(r, 0));
  assert.equal(game.settings.get(MODULE, "enabled"), false);
  game.keybindings.actions.get(id).onDown();
  await new Promise(r => setTimeout(r, 0));
  assert.equal(game.settings.get(MODULE, "enabled"), true);
});
// @endif

// Keep this test LAST: it replaces the published API.
// A hot patch re-runs the WIRING only: the entry's static imports (features, api, settings, core,
// lib/) are the instances already loaded, so this proves re-registration and republish of the same
// code — never that edited feature code is picked up (that needs a reload).
test("hot patch: uninstall(), re-import the entry, and the wiring runs again", async () => {
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("updateActor"), 0);
  assert.equal(game.ready, true);
  assert.ok(game.keybindings.bindings, "Foundry has built its keybindings: registering one now throws");
  const binds = F.calls.filter(c => c.op === "keybindings.register").length;
  consoleLines.length = 0;
  await import(`../__SHORT__.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, [], "the re-run init must not throw (settings/keybindings already registered are skipped)");
  assert.equal(F.calls.filter(c => c.op === "keybindings.register").length, binds);
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(F.listeners("updateActor"), 1);
  assert.deepEqual(fresh.describe().hooks.map(h => h.label), ["updateActor: note", "deleteActor: prune"]);
  const seen = [];
  const id = Hooks.on(HOOKS.noteChanged.name, (actor, note) => seen.push(note));
  await game.actors.get(IDS.aldric).update({ [`flags.${MODULE}.note`]: "patched" });
  Hooks.off(HOOKS.noteChanged.name, id);
  assert.deepEqual(seen, ["patched"]);
});
