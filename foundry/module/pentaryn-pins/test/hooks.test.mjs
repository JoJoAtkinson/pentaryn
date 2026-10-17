// The hook manifest: what this module registers, in order, pinned against golden/hooks.json.
// A change here is a behaviour change (listener order decides vetoes and render mutations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { pinsWorld } from "./fixtures/actors.mjs";
import { MODULE } from "../pins-core.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
await import("../pins.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
F.fire("setup");
F.fire("ready");
const api = game.modules.get(MODULE).api;

/** Feature files are exactly the entry's `import * as X from "./f.mjs"` targets (blueprint D12). */
function featureFiles() {
  const entry = manifestOf(ROOT).esmodules[0];
  const src = readFileSync(new URL(entry, ROOT), "utf8");
  return [...src.matchAll(/import\s*\*\s*as\s+\w+\s+from\s*["']\.\/([^"']+)["']/g)].map(m => m[1]);
}

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", F.hooks, import.meta.url);
});

test("only lifecycle hooks are registered at module scope", () => {
  assert.deepEqual(atLoad.map(h => h.name), ["init", "setup", "ready"]);
});

test("registry labels (describe().hooks)", () => {
  assert.deepEqual(api.describe().hooks, [
    { name: "createToken", label: "createToken: follow" },
    { name: "deleteToken", label: "deleteToken: follow" },
    { name: "updateToken", label: "updateToken: follow" },
    { name: "updateUser", label: "updateUser: pin changed" },
    { name: "deleteLevel", label: "deleteLevel: core's fallback view" },
    { name: "canvasReady", label: "canvasReady: reconcile" },
    { name: "ready", label: "ready: reconcile" },
    { name: "renderBaseActorSheet", label: "sheet: pinned badge" },
    { name: "updateUser", label: "updateUser: sheet badge" },
    { name: "deleteUser", label: "deleteUser: sheet badge" },
    { name: "canvasReady", label: "canvasReady: bind board" },
    { name: "canvasTearDown", label: "canvasTearDown: close menu" },
    { name: "canvasPan", label: "canvasPan: close menu" },
  ]);
});

test("every feature file exports install and uninstall", async () => {
  const files = featureFiles();
  assert.ok(files.length > 0);
  for (const f of files) {
    const mod = await import(new URL(f, ROOT));
    assert.equal(typeof mod.install, "function", `${f}: install`);
    assert.equal(typeof mod.uninstall, "function", `${f}: uninstall`);
  }
});

test("uninstall() leaves no hook, no settle timer and unwraps both patches", t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"] });
  const proto = CONFIG.Scene.documentClass.prototype;
  assert.equal(proto.view.__pentarynPinsView, true);
  assert.equal(proto._onActivate.__pentarynPinsActivate, true);
  // a settle loop alive: a pinned player on another scene while the canvas loads
  F.become({ userId: game.users.contents.find(u => u.name === "Talo's player").id });
  Object.assign(canvas, { loading: true, scene: game.scenes.active });
  F.fire("canvasReady", canvas);
  const viewsBefore = F.views.length;
  const names = [...new Set(api.describe().hooks.map(h => h.name))];
  api.uninstall();
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.deepEqual(api.describe().hooks, []);
  assert.deepEqual(api.describe().patches, [], "both patches unwrapped");
  assert.equal(proto.view.__pentarynPinsView, undefined);
  assert.equal(proto._onActivate.__pentarynPinsActivate, undefined);
  canvas.loading = false;
  t.mock.timers.tick(1000);
  assert.equal(F.views.length, viewsBefore, "no settle timer left to fire");
});
