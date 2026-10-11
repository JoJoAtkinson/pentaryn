// The published API (guide step 5): rows ↔ implementations, the describe/surface goldens, the
// legacy keys, the kit members, module.api, and the late GM-only publish record.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { wasmReady } from "./fixtures/engine.mjs";
import { wallsWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
const { MODULE, VERSION } = await import("../walls-core.mjs");
const { MANIFEST } = await import("../api-manifest.mjs");
const { SETTINGS } = await import("../settings.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");

F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const api = game.modules.get(MODULE).api;
const LEGACY = ["preview", "run", "undo", "makeMacro", "runEngine", "backends"];

test("published as module.api and game.pentaryn.walls (the same frozen object)", () => {
  assert.ok(api);
  assert.equal(game.pentaryn.walls, api);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(api.version, VERSION);
  assert.equal(api.describe().version, manifestOf(ROOT).version);
});

test("the six legacy keys stay, in order; every described method is a function", () => {
  assert.deepEqual(Object.keys(api).filter(k => LEGACY.includes(k)), LEGACY);
  const methods = api.describe().methods.map(m => m.path);
  for (const path of methods) assert.equal(typeof path.split(".").reduce((o, k) => o?.[k], api), "function", path);
  for (const k of LEGACY) assert.ok(methods.includes(k), k);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit and published excluded)", () => {
  const d = api.describe();
  assert.ok(maxDepth(d) <= 6);
  pinJSON("describe", normaliseDescribe(d), import.meta.url);
});

test("surface equals golden/surface.json: the legacy six plus the kit members", () => {
  const s = pinJSON("surface", surfaceOf(api), import.meta.url);
  for (const k of [...LEGACY, "describe", "version", "contract", "settings", "trace", "uninstall"]) assert.ok(k in s, k);
});

test("the publish is recorded as late and GM-gated (when: ready:gm:wasm)", () => {
  assert.equal(game.pentaryn.published().walls.when, "ready:gm:wasm");
  const fired = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(fired.includes("pentaryn-walls.ready"));
  assert.ok(fired.includes("pentaryn.ready"));
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { backend: "auto" });
});

test("runEngine and backends are the pure engine and the registry", () => {
  const r = api.runEngine([], { gridSize: 100, runId: "x" });
  assert.deepEqual([r.creates, r.updates, r.refusals], [[], [], []]);
  assert.deepEqual(api.backends().map(b => b.name), ["js", "wasm"]);
});

test("the flags contract names the (pre-migration) scope it writes and both scopes it reads", () => {
  const d = api.describe();
  assert.equal(d.flagScope, "wall-autocomplete");
  const both = k => [`flags.pentaryn-walls.${k}`, `flags.wall-autocomplete.${k}`];
  assert.deepEqual(d.flags.reads, ["keepOpen", "generated", "run", "priorC"].flatMap(both));
  assert.ok(d.flags.writes.includes("flags.wall-autocomplete.run"));
});

test("undo() describes the stamp deletion under both scopes", () => {
  const undo = api.describe().methods.find(m => m.path === "undo");
  assert.ok(undo.sideEffects.some(e => e.includes("flags.pentaryn-walls") && e.includes("flags.wall-autocomplete") && e.includes("deleted")));
});
