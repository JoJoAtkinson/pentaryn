// The hook manifest: what this module registers, in order, pinned against golden/hooks.json.
// A change here is a behaviour change (listener order decides vetoes and render mutations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { world } from "./fixtures/actors.mjs";
import { MODULE } from "../__SHORT__-core.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await installFoundry(world(MODULE));
await import("../__SHORT__.mjs");
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
    { name: "updateActor", label: "updateActor: note" },
    { name: "deleteActor", label: "deleteActor: prune" },
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

test("uninstall() leaves no hook behind", () => {
  const names = [...new Set(api.describe().hooks.map(h => h.name))];
  api.uninstall();
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.deepEqual(api.describe().hooks, []);
});
