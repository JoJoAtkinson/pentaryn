// The kit-built API (guide step 6, items-journal-5): rows ↔ implementations, the describe/surface
// goldens, the unlisted legacy members, selftest, and that it is the same code the legacy root
// publishes. Import behaviour itself is pinned by glue.test and write.test.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { MODULE } from "../importer-core.mjs";
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
  assert.deepEqual(api.describe().flags, { writes: ["flags.pentaryn.*"], reads: [] });
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
    assert.deepEqual(out.checks.filter(c => !c.ok).map(c => c.label), ["module.json flags.pentaryn.contract is the contract this code speaks"]);
  } finally {
    game.modules.get(MODULE).flags = flags;
  }
});
