// Guide step 5 (P-D1, P-D2, [declared]): the kit-built API. First pins, written when the publish moved
// to the kit: golden/surface.json, describe() in manifest order, module.api, the ready hooks on a GM
// client, settings() without the log's contents, uninstall() and the hot re-import. The legacy
// surface, the player client and both root load orders stay pinned in the glue tests.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { ALPHA, GM, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ seed: [{ t: 1, userId: GM, userName: "Gamemaster", sceneId: ALPHA, sceneName: "ZZ live-goldens pings", x: 1, y: 2 }] });
const { F } = W;
F.game.modules.set(MODULE, { id: MODULE, active: true });
F.game.socket.off = (event, fn) => {
  const i = W.socket.findIndex(([e, f]) => e === event && f === fn);
  if (i >= 0) W.socket.splice(i, 1);
};
W.captureConsole();
const heard = [];
F.Hooks.on("pentaryn-pings.ready", api => heard.push(["pentaryn-pings.ready", api]));
F.Hooks.on("pentaryn.ready", (ns, api, meta) => heard.push(["pentaryn.ready", ns, api, meta]));

await import("../pings.mjs");
F.fire("init");
F.fire("ready");
const { surfaceOf } = await import("../lib/api.mjs");
const { VERSION, CONTRACT, NS } = await import("../pings-core.mjs");
const api = F.game.pentaryn.pings;

test("the published API is frozen, versioned and pinned (golden/surface.json); module.api is the same object", () => {
  assert.ok(Object.isFrozen(api));
  assert.equal(api.version, VERSION);
  assert.equal(api.contract, CONTRACT);
  assert.equal(F.game.modules.get(MODULE).api, api);
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("ready hooks fire once on the GM client, with the API", () => {
  assert.deepEqual(heard.map(h => h[0]), ["pentaryn-pings.ready", "pentaryn.ready"]);
  assert.equal(heard[0][1], api);
  assert.deepEqual([heard[1][1], heard[1][2], heard[1][3]], [NS, api, { when: "ready:gm" }]);
});

test("describe(): the four legacy rows, clear the one write, the settings table, the patch row, no hooks or events", () => {
  const d = api.describe();
  assert.deepEqual(Object.keys(d), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual([d.module, d.namespace, d.flagScope], [MODULE, NS, MODULE]);
  assert.deepEqual(d.methods.map(m => m.path), ["last", "recent", "all", "clear"]);
  assert.ok(d.methods.every(m => m.legacy === true));
  assert.deepEqual(d.methods.filter(m => m.writes).map(m => m.path), ["clear"]);
  assert.deepEqual(d.methods.find(m => m.path === "recent").params.map(p => [p.name, p.default]), [["n", 10]]);
  for (const m of d.methods) assert.equal(typeof api[m.path], "function", m.path);
  assert.deepEqual(d.settings.map(s => [s.key, s.type, s.store ?? false]), [["log", "Array", true], ["max", "Number", false]]);
  assert.deepEqual(d.patches, [{ label: "ControlsLayer#handlePing", marker: "__pentarynPatched", via: "direct", adjustments: "pings-core-ping-handle" }]);
  assert.deepEqual([d.hooks, d.events, d.queries], [[], [], []]);
  assert.deepEqual(d.flags, { writes: [], reads: [] });
  assert.equal(d.published.when, "ready:gm");
});

test("settings(): max and the log's size, never its contents; trace() empty while debug is off", () => {
  assert.deepEqual(api.settings(), { log: { store: true, size: 1 }, max: 50 });
  assert.deepEqual(api.trace(), []);
});

test("step 6 (P-D3, [declared]): every reader's records carry ageMs after age, a number of ms", () => {
  mock.timers.tick(12_345);
  const last = api.last();
  assert.deepEqual(Object.keys(last).slice(-2), ["age", "ageMs"]);
  assert.equal(last.ageMs, Date.now() - last.t);
  assert.equal(last.age, `${Math.round(last.ageMs / 1000)}s ago`);
  assert.deepEqual(api.recent().map(r => typeof r.ageMs), ["number"]);
  assert.deepEqual(api.all().map(r => typeof r.ageMs), ["number"]);
  assert.match(api.describe().methods.find(m => m.path === "last").returns, /age, ageMs \}/);
});

test("game.pentaryn root helpers see pings", () => {
  assert.deepEqual(F.game.pentaryn.namespaces(), [NS]);
  assert.deepEqual(Object.keys(F.game.pentaryn.describe().namespaces), [NS]);
});

test("uninstall() unwraps handlePing, stops listening, drops a pending flush; a hot re-import re-wires and republishes", async () => {
  assert.deepEqual(W.console.splice(0), [["log", "pentaryn-pings | ready — 1 ping(s) on record"]], "the first ready");
  const layer = new W.ControlsLayer();
  await layer.handlePing(F.game.users.get(GM), { x: 10, y: 10 }, { scene: ALPHA });
  const writes = W.log().length;
  api.uninstall();
  assert.equal(W.ControlsLayer.prototype.handlePing, W.original, "the original is back");
  assert.deepEqual(W.socket, [], "no userActivity listener");
  assert.deepEqual(F.listeners(), { "pentaryn-pings.ready": 1, "pentaryn.ready": 1 }, "only this test's listeners");
  mock.timers.tick(1000);
  await drain();
  assert.equal(W.log().length, writes, "the pending flush was dropped");
  await layer.handlePing(F.game.users.get(GM), { x: 11, y: 11 }, { scene: ALPHA });
  W.emitSocket("userActivity", GM, { cursor: { x: 12, y: 12 }, ping: { scene: ALPHA } });
  mock.timers.tick(1000);
  await drain();
  assert.equal(W.log().length, writes, "nothing is captured once uninstalled");
  assert.deepEqual(W.console.splice(0), []);

  assert.equal(F.game.ready, true);
  await import("../pings.mjs?v=2");
  const again = F.game.pentaryn.pings;
  assert.notEqual(again, api, "a new API object");
  assert.equal(F.game.modules.get(MODULE).api, again);
  assert.equal(W.ControlsLayer.prototype.handlePing.__pentarynPatched, true, "wrapped again");
  assert.deepEqual(W.socket.map(([e]) => e), ["userActivity"]);
  // [declared] pings-edge-1: the unflushed ping at 10 sat only in the pending list, which uninstall()
  // dropped; it never reached the settings cache
  assert.deepEqual(W.console.splice(0), [["log", "pentaryn-pings | ready — 1 ping(s) on record"]]);
  await layer.handlePing(F.game.users.get(GM), { x: 13, y: 13 }, { scene: ALPHA });
  mock.timers.tick(250);
  await drain();
  assert.deepEqual(W.log().at(-1).value.map(r => r.x), [1, 13]);
  again.uninstall();
});

test("drift guard: manifest RECORD keys = a reader record's keys; the log row doc keys = a stored record's keys", async () => {
  // runs last: the uninstall test above left a real capture (x 13) as the newest stored record
  const { RECORD } = await import("../api-manifest.mjs");
  const { SETTINGS } = await import("../settings.mjs");
  const recordKeys = RECORD.replace(/:\s*\{[^}]*\}/g, "").replace(/[{}\s]/g, "").split(",");
  assert.deepEqual(Object.keys(api.last()), recordKeys);
  const stored = W.stored().at(-1);
  assert.equal(stored.x, 13, "the newest stored record is the real capture");
  const docKeys = SETTINGS.find(r => r.key === "log").doc.match(/\{([^}]*)\}/)[1].replace(/\s/g, "").split(",");
  assert.deepEqual(Object.keys(stored), docKeys);
});
