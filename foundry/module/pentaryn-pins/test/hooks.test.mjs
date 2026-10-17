// The hook manifest: what this module registers, in order, pinned against golden/hooks.json.
// A change here is a behaviour change (listener order decides vetoes and render mutations).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { pinsWorld } from "./fixtures/actors.mjs";
import { makeToken } from "./kit/foundry-stub.mjs";
import { MODULE } from "../pins-core.mjs";

const ROOT = new URL("..", import.meta.url);
const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
await import("../pins.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
F.fire("setup");
/** RF3: core attaches its own socket listeners (and stops buffering) only just before "ready" (game.mjs:777). */
const pullListenersAtSetup = F.socketListeners("pullToScene");
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

test("(RF3) the pullToScene replay is attached at ready, after core's activateSocketListeners — never at setup", () => {
  assert.equal(pullListenersAtSetup, 0, "nothing on the socket during setup (core is still buffering)");
  assert.equal(F.socketListeners("pullToScene"), 1);
});

test("registry labels (describe().hooks)", () => {
  assert.deepEqual(api.describe().hooks, [
    { name: "deleteToken", label: "deleteToken: safety net" },
    { name: "moveToken", label: "moveToken: level gap" },
    { name: "ready", label: "ready: pull replay" },
    { name: "renderBaseActorSheet", label: "sheet: pinned badge" },
    { name: "updateUser", label: "updateUser: sheet badge" },
    { name: "deleteUser", label: "deleteUser: sheet badge" },
    { name: "canvasReady", label: "canvasReady: bind board" },
    { name: "canvasTearDown", label: "canvasTearDown: close menu" },
    { name: "canvasPan", label: "canvasPan: close menu" },
    { name: "createToken", label: "createToken: watch" },
    { name: "deleteToken", label: "deleteToken: watch" },
    { name: "pentaryn-portals.prePull", label: "prePull: leave pinned-elsewhere players" },
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

test("uninstall() leaves no hook, no pending safety-net or watch timer, no socket listener; the one patch unwrapped", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const proto = CONFIG.Scene.documentClass.prototype;
  assert.equal(proto._onActivate.__pentarynPinsActivate, true);
  assert.equal(proto.view.__pentarynPinsView, undefined, "no Scene#view patch since 0.2.0");
  assert.equal(F.socketListeners("pullToScene"), 1);
  const ids = { gm: game.user.id, talo: game.users.contents.find(u => u.name === "Talo's player").id };
  const [A, B, C] = ["Harbour", "Lighthouse", "Cave"].map(n => game.scenes.contents.find(s => s.name === n));
  const [tok] = B.tokens.contents;
  const silent = (scene, id) => {
    const t = makeToken({ id, name: "Talo", actorId: tok.actorId, actorLink: true }, scene);
    t.collection = scene.tokens;
    scene.tokens.set(id, t);
    return t;
  };
  // t=0, the pinned player's client: the copy it views on C is deleted → a safety-net timer (due 1500,
  // it would view B); a pull dropped while loading → a replay poll
  F.become({ userId: ids.talo });
  const copy = silent(C, "taloHooksCopyC01");
  Object.assign(canvas, { loading: false, ready: true, scene: C, level: null });
  F.deleteToken(copy);
  canvas.loading = true;
  F.socketFire("pullToScene", A.id, {});
  // t=500, the GM client: a pinned token event → a watch timer (due 2000)
  t.mock.timers.tick(500);
  F.become({ userId: ids.gm });
  F.fire("deleteToken", makeToken({ id: "taloHooksGone001", name: "Talo", actorId: tok.actorId }, A), {}, ids.gm);
  F.become({ userId: ids.talo });
  const viewsBefore = F.views.length;
  const toastsBefore = F.calls.filter(c => c.op === "notify").length;
  const names = [...new Set(api.describe().hooks.map(h => h.name))];
  api.uninstall();
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.deepEqual(api.describe().hooks, []);
  assert.deepEqual(api.describe().patches, [], "the patch unwrapped");
  assert.equal(proto._onActivate.__pentarynPinsActivate, undefined);
  assert.equal(F.socketListeners("pullToScene"), 0, "socket.off with the same listener");
  canvas.loading = false;
  t.mock.timers.tick(1000);                          // t=1500, still the player: the net and the replay are due
  await new Promise(r => setImmediate(r));
  assert.equal(F.views.length, viewsBefore, "no safety-net or replay timer left to fire");
  const copy2 = silent(C, "taloHooksCopyC02");       // two tokens: the watch would toast Paused
  F.become({ userId: ids.gm });
  t.mock.timers.tick(60000);                         // t=2000+, the GM: the watch is due
  assert.equal(F.calls.filter(c => c.op === "notify").length, toastsBefore, "no watch timer left to fire");
  C.tokens.delete(copy2.id);
});
