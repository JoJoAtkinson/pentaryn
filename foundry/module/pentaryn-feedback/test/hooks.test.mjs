// The hook manifest: what this module registers, in order, pinned against golden/hooks.json.
// A change here is a behaviour change (listener order decides vetoes and render mutations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installClient } from "./fixtures/world.mjs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { MODULE } from "../feedback-core.mjs";
import { DOC_TYPES } from "../recorder.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await installClient();
await import("../feedback.mjs");
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

test("registry labels (describe().hooks): recorder first, then reporter; no hot hook", () => {
  const hooks = api.describe().hooks;
  const names = hooks.map(h => h.name);
  assert.equal(names[0], "canvasReady");
  for (const type of DOC_TYPES) {
    for (const op of ["create", "update", "delete"]) assert.ok(names.includes(`${op}${type}`), `${op}${type}`);
  }
  for (const n of ["getSceneControlButtons", "chatMessage", "userConnected", "updateUser", "error", "dnd5e.postUseActivity"]) {
    assert.ok(names.includes(n), n);
  }
  // updateToken IS listened to (own committed moves, keys only — one compare per update); the
  // per-frame and per-pointer hooks are not
  for (const hot of ["pointermove", "hoverToken", "refreshToken", "drawToken", "canvasPan", "sightRefresh", "renderChatLog"]) {
    assert.equal(names.includes(hot), false, hot);
  }
  assert.ok(names.indexOf("getSceneControlButtons") > names.indexOf("error"), "reporter installs after the recorder");
  assert.equal(new Set(hooks.map(h => h.label)).size, hooks.length, "labels are unique");
});

test("every feature file exports install and uninstall", async () => {
  const files = featureFiles();
  assert.deepEqual(files, ["recorder.mjs", "reporter.mjs"]);
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
