// The published API (guide S6, D-M2): rows ↔ implementations, the describe/surface goldens, the kit
// members, the publish (module.api, the alias, the ready hooks) and uninstall + hot re-import.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { movementWorld } from "./fixtures/world.mjs";
import * as coreModule from "../movement-core.mjs";
import { MODULE, VERSION } from "../movement-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";
import { patches } from "../lib/patch.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("drawTokenLayer", canvas.tokens);
const before = F.calls.length;
F.fire("ready");
const api = game.modules.get(MODULE).api;

test("published synchronously at ready: module.api is game.pentaryn.movement, frozen, ready hooks fired", () => {
  assert.ok(api);
  assert.equal(game.pentaryn.movement, api);
  assert.ok(Object.isFrozen(api));
  assert.equal(api.version, VERSION);
  assert.equal(api.contract, "pentaryn-movement/api@1");
  const fired = F.calls.slice(before).filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.deepEqual(fired, ["pentaryn-movement.ready", "pentaryn.ready"]);
});

test("every described method is a function on the API; core is published unlisted (a frozen copy)", () => {
  for (const m of api.describe().methods) assert.equal(typeof api[m.path], "function", m.path);
  assert.deepEqual(api.describe().methods.map(m => m.path),
    ["status", "ghostFor", "combatActive", "setGhost", "setPolicy", "pinsUnderTokens", "selftest"]);
  assert.ok(Object.isFrozen(api.core));
  assert.equal(api.core.MODULE, MODULE);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published and patch routes excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json (core.* is the pure module: checked against its exports instead)", () => {
  const surface = Object.fromEntries(Object.entries(surfaceOf(api)).filter(([k]) => !k.startsWith("core.")));
  pinJSON("surface", surface, import.meta.url);
  assert.deepEqual(Object.keys(api.core).sort(), Object.keys(coreModule).sort());
});

test("every patch record names an adjustments row; three patches", () => {
  const listed = api.describe().patches;
  assert.equal(listed.length, 3);
  for (const p of listed) assert.ok(p.adjustments?.startsWith("movement-"), p.label);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { ghostPolicy: "exploration", ghostPolicyLast: "exploration", ghost: false, ownedOnTop: true });
});

test("selftest passes on a healthy load", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
});

test("trace() is the kit ring (empty with debug off)", () => {
  assert.deepEqual(api.trace(), []);
});

test("uninstall() leaves no hook and no patch behind; a hot re-import re-wires and republishes", async () => {
  const names = [...new Set(api.describe().hooks.map(h => h.name))];
  const drag = CONFIG.Token.objectClass.prototype._getDragConstrainOptions;
  api.uninstall();
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.deepEqual(api.describe().hooks, []);
  assert.equal(patches().length, 0);
  assert.notEqual(CONFIG.Token.objectClass.prototype._getDragConstrainOptions, drag, "drag wrap undone");
  assert.equal(CONFIG.Token.objectClass.prototype._getDragConstrainOptions.__pentarynMovement, undefined);
  assert.equal(api.selftest().ok, false);

  await import("../movement.mjs?v=2");
  const again = game.modules.get(MODULE).api;
  assert.notEqual(again, api);
  assert.equal(game.pentaryn.movement, again);
  assert.deepEqual(again.describe().hooks.map(h => h.name), names.filter(n => n !== "setup"), "late: patched at once, no setup hook");
  assert.equal(CONFIG.Token.objectClass.prototype._getDragConstrainOptions.__pentarynMovement, true);
  assert.equal(again.selftest().ok, true, JSON.stringify(again.selftest().checks));
  mock.timers.tick(60);
});

test("after uninstall() a setting change reaches no feature handler", async () => {
  const live = game.modules.get(MODULE).api;
  live.uninstall();
  const from = F.calls.length;
  await game.settings.set(MODULE, "ghostPolicy", "off");
  await game.settings.set(MODULE, "ghost", true);
  await game.settings.set(MODULE, "ownedOnTop", false);
  mock.timers.tick(60);
  const after = op => F.calls.slice(from).filter(c => c.op === op);
  assert.deepEqual(after("controls.render"), []);
  assert.deepEqual(after("setAllRenderFlags"), []);
  await game.settings.set(MODULE, "ghostPolicy", "exploration");
  await game.settings.set(MODULE, "ghost", false);
  await game.settings.set(MODULE, "ownedOnTop", true);
  mock.timers.tick(60);
  assert.deepEqual(after("controls.render"), []);
  assert.deepEqual(after("setAllRenderFlags"), []);

  await import("../movement.mjs?v=3");
  const again = game.modules.get(MODULE).api;
  assert.notEqual(again, live);
  assert.equal(again.selftest().ok, true, JSON.stringify(again.selftest().checks));
  mock.timers.tick(60);
});
