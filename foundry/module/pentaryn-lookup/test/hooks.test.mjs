// The hook manifest: lookup registers only its lifecycle hook(s) at module scope, and its one
// feature (books.mjs) registers none.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { MODULE } from "../lookup-core.mjs";
import { hookRegistry } from "../lib/hooks.mjs";
import { makeLog } from "../lib/log.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await installFoundry({ modules: [MODULE] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const atLoad = F.hooks.slice();
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const api = game.modules.get(MODULE).api;

/** Feature files are exactly the entry's `import * as X from "./f.mjs"` targets (blueprint D12). */
function featureFiles() {
  const entry = manifestOf(ROOT).esmodules[0];
  const src = readFileSync(new URL(entry, ROOT), "utf8");
  return [...src.matchAll(/import\s*\*\s*as\s+\w+\s+from\s*["']\.\/([^"']+)["']/g)].map(m => m[1]);
}

test("the feature files are exactly books.mjs", () => {
  assert.deepEqual(featureFiles(), ["books.mjs"]);
});

test("every feature file exports install and uninstall", async () => {
  for (const f of featureFiles()) {
    const mod = await import(new URL(f, ROOT));
    assert.equal(typeof mod.install, "function", `${f}: install`);
    assert.equal(typeof mod.uninstall, "function", `${f}: uninstall`);
  }
});

test("books.install registers no hook and contributes impl only (rows live in the manifest)", async () => {
  const books = await import("../books.mjs");
  const reg = hookRegistry(MODULE, null);
  const before = F.hooks.length;
  const out = books.install(reg, { log: makeLog(MODULE) });
  assert.deepEqual(reg.ids(), []);
  assert.equal(F.hooks.length, before);
  assert.deepEqual(out.rows, []);
  assert.deepEqual(Object.keys(out.impl).sort(),
    ["monster", "monsters", "names", "onList", "packs", "page", "search", "spellList"]);
  books.uninstall();
});

test("registration manifest equals golden/hooks.json", () => {
  pinJSON("hooks", F.hooks.slice(0, atLoad.length), import.meta.url);
});

test("only lifecycle hooks are registered at module scope; the registry holds none", () => {
  assert.ok(atLoad.every(h => ["init", "setup", "ready"].includes(h.name)), JSON.stringify(atLoad));
  assert.deepEqual(api.describe().hooks, []);
});

test("uninstall() leaves no hook registered by the module's registry", () => {
  api.uninstall();
  assert.deepEqual(api.describe().hooks, []);
});
