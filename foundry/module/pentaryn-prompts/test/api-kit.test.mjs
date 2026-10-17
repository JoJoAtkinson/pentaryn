/**
 * The kit-built API (guide step 13, [declared] DP1-DP3; prompts-lookup-19): rows ↔ implementations,
 * the describe/surface goldens, the new reads (inspect, markersOn, manifest, selftest), the frozen
 * object on module.api and game.pentaryn.prompts, the ready hooks, the publish record.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { installWorld, captureConsole, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const F = await installWorld();
F.game.modules.set(MODULE, { id: MODULE, version: "0.4.6", active: true });
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
await captureConsole(() => F.fire("setup"));
await captureConsole(async () => { F.fire("ready"); await flush(); });
const api = F.game.pentaryn.prompts;
const { MANIFEST } = await import("../api-manifest.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");
const { HOOKS } = await import("../prompts-core.mjs");
const LEGACY = ["gather", "list", "crops", "show", "replace", "replaceMany", "open", "place", "ensureMarkers", "model", "manifests", "status"];

test("published once, synchronously at ready: module.api is game.pentaryn.prompts, frozen; both ready hooks fired", () => {
  assert.equal(F.game.modules.get(MODULE).api, api);
  assert.equal(Object.isFrozen(api), true);
  const fired = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(fired.includes("pentaryn-prompts.ready"));
  assert.ok(fired.includes("pentaryn.ready"));
  assert.equal(F.game.pentaryn.published().prompts.when, "ready");
  assert.throws(() => { "use strict"; api.gather = null; }, TypeError);
});

test("rows ↔ implementations: every row is a function on the API; a row without an implementation fails at build", () => {
  for (const row of MANIFEST.rows) assert.equal(typeof row.path.split(".").reduce((o, k) => o?.[k], api), "function", row.path);
  for (const k of LEGACY) assert.ok(MANIFEST.rows.some(r => r.path === k), k);
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
  assert.equal(api.version, "0.4.6");
  assert.equal(api.contract, "pentaryn-prompts/api@1");
});

test("describe() equals golden/describe.json; queries are the five the fork sends", () => {
  const d = api.describe();
  assert.ok(maxDepth(d) <= 6);
  assert.deepEqual(d.queries, ["list", "gather", "crops", "replace", "show"].map(n => `${MODULE}.${n}`));
  assert.deepEqual(d.patches.map(p => [p.label, p.marker, p.adjustments]), [["Token#_onClickLeft2", "__pentarynPromptsClick", "prompts-token-dblclick"]]);
  assert.deepEqual(d.events.map(e => e.key), Object.keys(HOOKS), "describe().events is the module's HOOKS table");
  pinJSON("describe", normaliseDescribe(d), import.meta.url);
});

test("surface equals golden/surface.json: the legacy twelve, the new reads, the kit members", () => {
  const s = pinJSON("surface", surfaceOf(api), import.meta.url);
  for (const k of [...LEGACY, "inspect", "markersOn", "manifest", "selftest", "describe", "version", "contract", "settings", "trace", "uninstall"]) {
    assert.ok(k in s, k);
  }
});

test("inspect(ref): a marker's size and text, a built token's provenance; depth ≤ 4; never a substring", async () => {
  const m1 = await api.inspect(F.s1.tokens.get("m1"));
  assert.deepEqual(m1, { token: { documentName: "Token", id: "m1", uuid: F.s1.tokens.get("m1").uuid, name: F.s1.tokens.get("m1").name },
    marker: { size: "mid", text: "a lantern" }, provenance: null });
  assert.ok(maxDepth(m1) <= 4);
  const plain = await api.inspect("tokOrdinary00001", { sceneId: "s1" });
  assert.deepEqual([plain.token.id, plain.marker, plain.provenance], ["tokOrdinary00001", null, null]);
  assert.throws(() => api.inspect("tokOrdinary", { sceneId: "s1" }), { code: "NOT_FOUND" });
  assert.throws(() => api.inspect("m", { sceneId: "s1" }), { code: "NOT_FOUND" });
});

test("markersOn(sceneId), manifest(call), selftest()", async () => {
  assert.deepEqual(api.markersOn("s1"), [{ id: "m1", size: "mid", text: "a lantern" }, { id: "m2", size: "small", text: "goblin boss" }]);
  assert.throws(() => api.markersOn("nope"), { code: "NOT_FOUND", message: "NOT_FOUND: scene nope" });
  assert.equal(api.manifest("pm-none"), null);
  const st = api.selftest();
  assert.equal(st.ok, true, JSON.stringify(st.checks));
  assert.deepEqual(st.checks.map(c => c.label), ["the six marker actors exist", "double-click is patched",
    "pentaryn-prompts.gather is a registered query", "the running code is module.json's version"]);
  assert.equal(api.status().doubleClick, "direct");
});

test("kit members: settings() snapshot, trace() array, describe().settings rows", () => {
  const s = api.settings();
  assert.equal(s.gatherChars, 400);
  assert.deepEqual(s.lastCalls, { store: true, size: 0 });
  assert.ok(Array.isArray(api.trace()));
  assert.deepEqual(api.describe().settings.map(r => r.key), ["panelRows", "panelChars", "gatherChars", "unseenWithinFt",
    "cropMaxPerCall", "cropLongSidePx", "cropsDefault", "party", "deleteEmptyOnClose", "defaultSize", "lastCalls"]);
});
