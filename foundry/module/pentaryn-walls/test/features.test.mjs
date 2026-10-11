// The feature set (guide step 5): actions.mjs registers no hooks, exports install/uninstall, and the
// entry registers only its two lifecycle hooks; uninstall() leaves none behind.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf } from "./kit/harness.mjs";
import { wasmReady } from "./fixtures/engine.mjs";
import { wallsWorld } from "./fixtures/world.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await wallsWorld();
await import("../pentaryn-walls.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
F.fire("ready");
await wasmReady;
for (let i = 0; i < 20; i++) await Promise.resolve();
const api = game.pentaryn.walls;

function featureFiles() {
  const src = readFileSync(new URL(manifestOf(ROOT).esmodules[0], ROOT), "utf8");
  return [...src.matchAll(/import\s*\*\s*as\s+\w+\s+from\s*["']\.\/([^"']+)["']/g)].map(m => m[1]);
}

test("only lifecycle hooks at module scope: once init, once ready", () => {
  assert.deepEqual(atLoad, [{ kind: "once", name: "init" }, { kind: "once", name: "ready" }]);
});

test("the feature list is actions.mjs then migrations.mjs, and each exports install and uninstall", async () => {
  assert.deepEqual(featureFiles(), ["actions.mjs", "migrations.mjs"]);
  for (const f of featureFiles()) {
    const mod = await import(new URL(f, ROOT));
    assert.equal(typeof mod.install, "function", f);
    assert.equal(typeof mod.uninstall, "function", f);
  }
});

test("no feature hooks: describe().hooks is empty; uninstall() leaves no listener", () => {
  assert.deepEqual(api.describe().hooks, []);
  api.uninstall();
  for (const name of ["init", "ready"]) assert.equal(F.listeners(name), 0, name);
});
