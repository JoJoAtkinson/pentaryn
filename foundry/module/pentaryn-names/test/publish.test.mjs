// Guide step 5 (N-D2): the kit-built API. First pins, written when the publish moved to the kit:
// golden/surface.json, describe() methods in manifest order, the frozen object, the root helpers.
// The legacy surface and the four load orders stay pinned in glue.test.mjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, equip, world } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const F = await installFoundry(world());
equip(F);
await import("../names.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const { surfaceOf } = await import("../lib/api.mjs");
const { VERSION, CONTRACT, NS } = await import("../names-core.mjs");
const api = game.pentaryn.names;

test("the published API is frozen, versioned and pinned (golden/surface.json)", () => {
  assert.ok(Object.isFrozen(api));
  assert.equal(api.version, VERSION);
  assert.equal(api.contract, CONTRACT);
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("describe(): the three legacy rows in order, the hooks names listens to, no events or settings", () => {
  const d = api.describe();
  assert.deepEqual(Object.keys(d), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(d.methods.map(m => m.path), ["sync", "relabel", "shortName"]);
  assert.ok(d.methods.every(m => m.legacy === true));
  assert.deepEqual(d.methods.filter(m => m.writes).map(m => m.path), ["sync"]);
  for (const m of d.methods) assert.equal(typeof api[m.path], "function", m.path);
  assert.deepEqual(d.hooks, [
    { name: "preUpdateActor", label: "preUpdateActor: remember old name" },
    { name: "updateActor", label: "updateActor: relabel" },
  ]);
  assert.deepEqual([d.module, d.namespace, d.flagScope], [MODULE, NS, MODULE]);
  assert.deepEqual([d.events, d.settings, d.queries, d.patches], [[], [], [], []]);
  assert.equal(d.published.when, "ready");
  assert.deepEqual(api.settings(), {});
});

test("game.pentaryn root helpers see names", () => {
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
  assert.deepEqual(Object.keys(game.pentaryn.describe().namespaces), [NS]);
});

test("trace() is empty while CONFIG.debug is off", () => {
  assert.deepEqual(api.trace(), []);
});

test("uninstall() removes both actor hooks; a hot re-import after ready re-wires and republishes", async () => {
  api.uninstall();
  assert.deepEqual(F.listeners(), {});
  assert.equal(game.ready, true, "the stub marks the world ready once ready fired");
  await import("../names.mjs?v=2");
  assert.deepEqual(F.listeners(), { preUpdateActor: 1, updateActor: 1 });
  const again = game.pentaryn.names;
  assert.notEqual(again, api, "a new API object");
  assert.equal(game.modules.get(MODULE).api, again);
  assert.deepEqual(again.describe().methods.map(m => m.path), ["sync", "relabel", "shortName"]);
  again.uninstall();
});
