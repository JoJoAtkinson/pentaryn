// The published API (guide step 6, opt-in for small; declared change C-1): manifest ↔ impls, the
// surface and describe goldens, publish synchronously at ready on module.api and
// game.pentaryn.cursors, status() (finding -32), and uninstall().
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { cursorWorld, flush } from "./fixtures/board.mjs";
import { KEYS, MODULE, VARS, cursorValues } from "../cursors-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { SETTINGS } from "../settings.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await cursorWorld();
const { el, setTool } = F;
const announced = [];
await import("../cursors.mjs");
Hooks.on(`${MODULE}.ready`, api => announced.push(api));
F.fire("init");
F.fire("ready");
const atReady = { module: game.modules.get(MODULE).api, alias: game.pentaryn?.cursors, announced: announced.length };
mock.timers.tick(0);
await flush();
const api = game.modules.get(MODULE).api;

test("[declared C-1] published synchronously at ready: module.api is canonical, game.pentaryn.cursors the alias", () => {
  assert.ok(atReady.module, "module.api is set inside ready, before the tick");
  assert.equal(atReady.alias, atReady.module);
  assert.equal(atReady.announced, 1, "pentaryn-cursors.ready fires once, with the API");
  assert.equal(announced[0], api);
  assert.equal(game.pentaryn.cursors, api);
  assert.ok(Object.isFrozen(api));
});

test("the 0.2.0 surface is a subset: refresh, current, keys, keyFor", () => {
  for (const k of ["refresh", "current", "keys", "keyFor"]) assert.ok(k in api, k);
  assert.deepEqual(api.keys, KEYS);
  assert.deepEqual(Object.keys(api.keys), Object.keys(KEYS));
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("describe() equals golden/describe.json (version, kit and published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("every described method is a function on the API", () => {
  for (const { path } of api.describe().methods) assert.equal(typeof api[path], "function", path);
});

test("described settings are exactly the SETTINGS table; settings() snapshots them", () => {
  assert.deepEqual(api.describe().settings.map(s => s.key), SETTINGS.map(r => r.key));
  assert.deepEqual(api.settings(), { enabled: true });
});

test("status(): one read-only diagnosis, no style write", () => {
  setTool("drawings", "rect");
  assert.equal(api.refresh(), "draw");
  const n = el.styleCalls.length;
  assert.deepEqual(api.status(), {
    enabled: true, key: "draw", control: "drawings", tool: "rect", placementActive: false,
    boardCursor: "var(--cursor-default)", dataset: "draw", imageSet: false, expected: "draw",
  });
  assert.equal(el.styleCalls.length, n, "status() writes nothing");

  // a live placement wins whatever the tool
  const placing = { id: "preview" };
  canvas.regions._placementContext = { preview: placing };
  F.preview.children.push(placing);
  assert.deepEqual([api.status().placementActive, api.status().expected], [true, "aoe"]);
  F.preview.children.length = 0;
  canvas.regions._placementContext = null;
});

test("status() with the setting off: key null, expected still keyFor's answer", async () => {
  await game.settings.set(MODULE, "enabled", false);
  const s = api.status();
  assert.deepEqual([s.enabled, s.key, s.expected, s.dataset], [false, null, "draw", null]);
  await game.settings.set(MODULE, "enabled", true);
  assert.equal(api.current(), "draw");
});

test("uninstall(): clears the board and drops every registered hook", () => {
  setTool("tokens", "target");
  assert.equal(api.refresh(), "target");
  assert.deepEqual(el.props(), cursorValues("target", "/modules/pentaryn-cursors", false));
  assert.ok(api.describe().hooks.length > 0);
  api.uninstall();
  assert.deepEqual(el.props(), {});
  assert.equal(el.dataset.pentarynCursor, undefined);
  assert.equal(api.current(), null);
  assert.deepEqual(api.describe().hooks, []);
  F.fire("renderSceneControls");
  assert.equal(api.current(), null, "no hook left to refresh");
  assert.deepEqual(Object.fromEntries(VARS.map(v => [v, el.style.getPropertyValue(v) || null])), Object.fromEntries(VARS.map(v => [v, null])));
});
