// The hook manifest (guide step 7): what this module registers, in order, pinned against
// golden/hooks.json (the same 17 rows the glue test pins), the registry labels, the feature
// contract (install/uninstall), and uninstall() leaving nothing behind. A player client.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { MODULE, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const ROOT = new URL("..", import.meta.url);
const W = await setupWorld({ player: true });
const { F } = W;
registerSelf(F, manifestOf(ROOT));
await import("../creatures.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
await drain();
mock.timers.tick(60);
const api = F.game.modules.get(MODULE).api;
const bootHookCount = F.hooks.length;
const onRows = rows => rows.filter(h => h.kind === "on").map(h => `${h.kind}:${h.name}`);

/** Feature files are exactly the entry's `import * as X from "./f.mjs"` targets (blueprint D12). */
function featureFiles() {
  const entry = manifestOf(ROOT).esmodules[0];
  const src = readFileSync(new URL(entry, ROOT), "utf8");
  return [...src.matchAll(/import\s*\*\s*as\s+\w+\s+from\s*["']\.\/([^"']+)["']/g)].map(m => m[1]);
}

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
});

test("registry labels (describe().hooks), in order; the lifecycle hooks are the entry's own", () => {
  assert.deepEqual(api.describe().hooks, [
    { name: "createToken", label: "createToken: queue light" },
    { name: "updateToken", label: "updateToken: queue light" },
    { name: "updateActor", label: "updateActor: queue light" },
    { name: "createUser", label: "createUser: re-check every scene" },
    { name: "updateUser", label: "updateUser: re-check every scene" },
    { name: "deleteUser", label: "deleteUser: re-check every scene" },
    { name: "canvasReady", label: "canvasReady: redraw strip" },
    { name: "createToken", label: "createToken: redraw strip" },
    { name: "deleteToken", label: "deleteToken: redraw strip" },
    { name: "updateToken", label: "updateToken: redraw strip" },
    { name: "updateActor", label: "updateActor: redraw strip" },
    { name: "updateUser", label: "updateUser: redraw strip" },
    { name: "controlToken", label: "controlToken: mark strip" },
    { name: "setup", label: "setup: wrap Token#isVisible" },
  ]);
});

test("every feature file exports install and uninstall", async () => {
  const files = featureFiles();
  assert.deepEqual(files, ["light.mjs", "creature-strip.mjs", "owner-sees.mjs"]);
  for (const f of files) {
    const mod = await import(new URL(f, ROOT));
    assert.equal(typeof mod.install, "function", `${f}: install`);
    assert.equal(typeof mod.uninstall, "function", `${f}: uninstall`);
  }
});

test("uninstall() leaves no hook, no strip, no dock poll, no wrap and no queued light behind", async () => {
  assert.ok(W.strip(), "the strip is up before");
  assert.equal(api.describe().patches.length, 1);
  const names = [...new Set(api.describe().hooks.map(h => h.name))];
  api.uninstall();
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.deepEqual(F.listeners(), {}, "the lifecycle once-hooks have fired; nothing else is left");
  assert.deepEqual(api.describe().hooks, []);
  assert.deepEqual(api.describe().patches, []);
  assert.equal(W.strip(), null);
  assert.equal(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  W.D.byId.length = 0;
  W.D.queries.length = 0;
  mock.timers.tick(2000);
  await drain();
  assert.deepEqual([W.D.byId, W.D.queries, W.writes], [[], [], []], "no timer fires afterwards");
});

test("hot patch: after uninstall(), re-importing the entry re-wires hooks, the wrap, the strip and a new API", async () => {
  const before = F.hooks.length;
  await import("../creatures.mjs?v=2");
  const api2 = F.game.modules.get(MODULE).api;
  assert.notEqual(api2, api, "a new API object");
  assert.equal(F.game.pentaryn.creatures, api2);
  assert.deepEqual(F.hooks.slice(before).map(h => `${h.kind}:${h.name}`), [
    "on:createToken", "on:updateToken", "on:updateActor", "on:createUser", "on:updateUser", "on:deleteUser",
    "on:canvasReady", "on:createToken", "on:deleteToken", "on:updateToken", "on:updateActor", "on:updateUser",
    "on:controlToken",
  ], "the feature hooks again; no lifecycle hooks (they already fired), the wrap is applied at once");
  assert.equal(api2.patchedWith(), "direct");
  assert.notEqual(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  mock.timers.tick(60);
  await drain();
  assert.ok(W.strip(), "the strip is drawn again");
  api2.uninstall();
  assert.deepEqual(F.listeners(), {});
});

test("every feature the hot re-import installs also installs on boot", () => {
  const boot = onRows(F.hooks.slice(0, bootHookCount));
  const hot = onRows(F.hooks.slice(bootHookCount));
  assert.equal(hot.length, 13, "the hot re-import ran (previous test)");
  assert.deepEqual(boot, hot, "a FEATURES entry not wired into the boot branch would differ here");
});
