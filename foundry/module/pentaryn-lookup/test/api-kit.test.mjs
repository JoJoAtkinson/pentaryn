// The kit-built API (guide step 7): rows ↔ implementations, the describe/surface goldens, the
// publish (module.api, both ready hooks) and the frozen surface (declared DL1, DL2).
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { installLookupWorld } from "./fixtures/packs.mjs";
import { LIMITS, MODULE, NS } from "../lookup-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

const F = await installFoundry({ modules: [MODULE] });
installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const api = game.modules.get(MODULE).api;

test("published: module.api is canonical, game.pentaryn.rules its alias, both ready hooks fired", () => {
  assert.ok(api);
  assert.equal(game.pentaryn[NS], api);
  const emitted = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(emitted.includes(`${MODULE}.ready`));
  assert.ok(emitted.includes("pentaryn.ready"));
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
});

test("describe(): namespace rules, the use-doc key set, and exactly the ten methods (prompts-lookup-2)", () => {
  const d = api.describe();
  assert.equal(d.namespace, "rules");
  assert.equal(d.module, MODULE);
  assert.deepEqual(Object.keys(d), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(d.methods.map(m => m.path).sort(),
    ["monster", "monsters", "names", "onList", "packs", "page", "search", "selftest", "spellList", "toPlainText"]);
  assert.match(d.methods.find(m => m.path === "search").returns, /hits: \[/);
  assert.match(d.methods.find(m => m.path === "search").doc, /iterate `\.hits`/);
  assert.deepEqual(d.published?.module, MODULE);
});

test("every described method is a function on the API", () => {
  for (const { path } of api.describe().methods) assert.equal(typeof api[path], "function", path);
});

test("page's ref is never run through the kit resolver (resolve: false); no other param is named ref", () => {
  for (const row of MANIFEST.rows) {
    for (const p of row.params) {
      if (p.name !== "ref") continue;
      assert.equal(row.path, "page");
      assert.equal(p.resolve, false);
    }
  }
});

test("selftest is the module's own non-legacy row; the lookups are legacy rows", () => {
  const rows = Object.fromEntries(MANIFEST.rows.map(r => [r.path, r]));
  assert.equal(rows.selftest.legacy, undefined);
  assert.equal(rows.toPlainText.legacy, undefined);
  for (const p of ["search", "page", "monster", "monsters", "names", "packs", "onList", "spellList"]) assert.equal(rows[p].legacy, true, p);
  for (const r of MANIFEST.rows) assert.deepEqual([r.gm, r.writes], [false, false], r.path);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("DL1: the API is frozen; LIMITS is a frozen copy, core's table stays writable", () => {
  assert.ok(Object.isFrozen(api));
  assert.ok(Object.isFrozen(api.LIMITS));
  assert.notEqual(api.LIMITS, LIMITS);
  assert.deepEqual({ ...api.LIMITS }, { ...LIMITS });
  assert.throws(() => { "use strict"; api.LIMITS.hits = 99; }, TypeError);
  assert.throws(() => { "use strict"; api.x = 1; }, TypeError);
  assert.equal(Object.isFrozen(LIMITS), false);
});

test("kit members: version, contract, trace, uninstall", () => {
  assert.equal(api.version, "0.3.0");
  assert.equal(api.contract, `${MODULE}/api@1`);
  assert.deepEqual(api.trace(), []);
  assert.equal(typeof api.uninstall, "function");
  assert.deepEqual(api.settings(), {});
});

test("describe() equals golden/describe.json (version, kit, published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});
