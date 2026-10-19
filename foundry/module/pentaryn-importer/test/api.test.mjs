// The kit-built API (guide step 6, items-journal-5): rows ↔ implementations, the describe/surface
// goldens, the unlisted legacy members, selftest, and that it is the same code the legacy root
// publishes. Import behaviour itself is pinned by glue.test and write.test.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { GATE_KEYS, MODULE } from "../importer-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const manifest = manifestOf(ROOT);
const F = await installFoundry({
  user: { isGM: true },
  modules: [{ id: MODULE, version: manifest.version, flags: manifest.flags }],
  system: { id: "dnd5e", version: "6.0.6" },
});
const quiet = console.log;
console.log = () => {};
try {
  await import("../pentaryn-importer.mjs");
  F.fire("ready");
} finally {
  console.log = quiet;
}
const api = game.modules.get(MODULE).api;

test("published as module.api; every described method is a function", () => {
  assert.equal(typeof api, "object");
  assert.equal(Object.isFrozen(api), true);
  for (const path of api.describe().methods.map(m => m.path)) {
    assert.equal(typeof path.split(".").reduce((o, k) => o?.[k], api), "function", path);
  }
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("describe().version is module.json's; contract is the API contract, not the actors.json one", () => {
  assert.equal(api.describe().version, manifest.version);
  assert.equal(api.version, manifest.version);
  assert.equal(api.contract, "pentaryn-importer/api@1");
  assert.equal(api.actorsContract, "pentaryn/actors.json@1");
  assert.equal(api.actorsContract, manifest.flags.pentaryn.contract);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("game.pentaryn.importer is the API; the legacy root keys sit beside it in an unfrozen root", () => {
  assert.equal(game.pentaryn.importer, api);
  assert.equal(Object.isFrozen(game.pentaryn), false);
  assert.deepEqual(game.pentaryn.namespaces(), ["importer"]);
  assert.equal(game.pentaryn.contract, api.actorsContract, "the root's contract keeps its old meaning");
});

test("the same code the legacy root publishes: import, moduleId, _internals", () => {
  assert.equal(api.import, game.pentaryn.import);
  assert.equal(api.moduleId, game.pentaryn.moduleId);
  assert.deepEqual(Object.keys(api._internals), Object.keys(game.pentaryn._internals));
  for (const k of Object.keys(api._internals)) assert.equal(api._internals[k], game.pentaryn._internals[k], k);
  assert.equal(Object.isFrozen(api._internals), true);
});

test("import is a GM-only legacy write row that documents both failure channels", () => {
  const row = api.describe().methods.find(m => m.path === "import");
  assert.deepEqual([row.gm, row.writes, row.legacy], [true, true, true]);
  assert.deepEqual(row.throws, ["PentarynAbort", "PentarynAssertionError"]);
  assert.match(row.doc, /dryRun/);
  assert.deepEqual(api.describe().flags.writes.slice(0, 1), ["flags.pentaryn.*"]);
});

test("selftest passes on a healthy load", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
});

test("selftest fails when module.json lost its gate flags", () => {
  const flags = game.modules.get(MODULE).flags;
  game.modules.get(MODULE).flags = {};
  try {
    const out = api.selftest();
    assert.equal(out.ok, false);
    assert.deepEqual(out.checks.filter(c => !c.ok).map(c => c.label), [
      "module.json flags.pentaryn.contract present",
      "module.json flags.pentaryn.targetSystem present",
      "module.json flags.pentaryn.targetSystemVersion present",
      "module.json flags.pentaryn.generation present",
    ]);
  } finally {
    game.modules.get(MODULE).flags = flags;
  }
});

// importer-M3: a module.json that keeps `contract` but lost a version-gate key used to pass selftest
// while every import was refused. One check per GATE_KEYS key, detail = the value.
test("importer-M3: selftest fails for each version-gate key module.json lost, not only contract", () => {
  const mod = game.modules.get(MODULE);
  const flags = mod.flags;
  for (const key of ["targetSystem", "targetSystemVersion", "generation"]) {
    const pentaryn = { ...flags.pentaryn };
    delete pentaryn[key];
    mod.flags = { ...flags, pentaryn };
    try {
      const out = api.selftest();
      assert.equal(out.ok, false, key);
      assert.deepEqual(out.checks.filter(c => !c.ok).map(c => c.label), [`module.json flags.pentaryn.${key} present`]);
    } finally {
      mod.flags = flags;
    }
  }
  const healthy = api.selftest().checks.filter(c => c.label.startsWith("module.json flags.pentaryn."));
  assert.deepEqual(healthy.map(c => [c.label, c.detail]), [
    ["module.json flags.pentaryn.contract present", "pentaryn/actors.json@1"],
    ["module.json flags.pentaryn.targetSystem present", flags.pentaryn.targetSystem],
    ["module.json flags.pentaryn.targetSystemVersion present", flags.pentaryn.targetSystemVersion],
    ["module.json flags.pentaryn.generation present", flags.pentaryn.generation],
  ]);
});

test("importer-M3: the contract check keeps its identity comparison", () => {
  const mod = game.modules.get(MODULE);
  const flags = mod.flags;
  mod.flags = { ...flags, pentaryn: { ...flags.pentaryn, contract: "pentaryn/actors.json@2" } };
  try {
    const out = api.selftest();
    assert.deepEqual(out.checks.filter(c => !c.ok).map(c => [c.label, c.detail]),
      [["module.json flags.pentaryn.contract present", "pentaryn/actors.json@2"]]);
  } finally {
    mod.flags = flags;
  }
});

// Wave 7 batch (guide step 9): the blueprint keys were MERGED into flags.pentaryn; the version gate's
// keys stay beside them (the glue stub above reads the real flags, so a replaced object fails there too).
test("module.json flags.pentaryn carries the gate keys and the blueprint keys together", () => {
  const f = manifest.flags.pentaryn;
  assert.deepEqual([...GATE_KEYS], ["contract", "targetSystem", "targetSystemVersion", "generation"]);
  for (const k of GATE_KEYS) assert.ok(k in f, k);
  assert.deepEqual([f.tier, f.namespace, f.flagScope, f.cssPrefix], ["full", "importer", "pentaryn-importer", "pim-"]);
  assert.equal(manifest.compatibility.minimum, "14");
});
