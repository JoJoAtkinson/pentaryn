// The kit-built API (guide step 6): rows ↔ implementations, the describe/surface goldens, the 18 legacy
// core names, selftest, the GM-only rows' refusals, and uninstall. Journal behaviour itself is pinned by
// glue.test (frozen) and the feature tests.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, normaliseDescribe, pinJSON, readJSON } from "./kit/harness.mjs";
import { GM, P1, P2, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const manifest = manifestOf(ROOT);
const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.modules.get("pentaryn-journal").api;
const { MANIFEST } = await import("../api-manifest.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");
const core = await import("../journal-core.mjs");

test("published as module.api and game.pentaryn.journal, frozen; every described method is a function", () => {
  assert.equal(game.pentaryn.journal, api);
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

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("version and contract", () => {
  assert.equal(api.version, manifest.version);
  assert.equal(api.describe().version, manifest.version);
  assert.equal(api.contract, "pentaryn-journal/api@1");
});

test("journal.core is exactly the 18 legacy names, a frozen copy; core.MOD is the module id", () => {
  assert.deepEqual(Object.keys(api.core).sort(), readJSON(new URL("./golden/core-keys.json", import.meta.url)));
  assert.equal(Object.isFrozen(api.core), true);
  assert.equal(api.core.MOD, "pentaryn-journal");
  assert.equal(api.core.sanitize, core.sanitize);
  assert.equal("barVisible" in api.core, false, "new core rules are not added to the published surface");
});

test("the pre-migration rows are legacy; selftest and the items-journal-35 reads are not; ensure/ensureAll are GM write rows; report is ungated", () => {
  const rows = Object.fromEntries(api.describe().methods.map(m => [m.path, m]));
  const fresh = ["selftest", "inspect", "entriesOf", "statusFor", "lastReason"];
  for (const [path, m] of Object.entries(rows)) assert.equal(!!m.legacy, !fresh.includes(path), path);
  assert.deepEqual([rows.ensure.gm, rows.ensure.writes, rows.ensureAll.gm, rows.ensureAll.writes], [true, true, true, true]);
  assert.equal(rows.report.gm, false);
  assert.deepEqual(api.describe().flags.reads, ["flags.item-piles.data"]);
});

test("ensure as a player rejects 'GM only'; add/status as the GM with gmButton off → null", async () => {
  F.become({ userId: P1 });
  await assert.rejects(api.ensure(game.users.get(P2)), { message: "GM only" });
  assert.equal(await api.ensureAll(), null);
  F.become({ userId: GM });
  const entry = { documentName: "JournalEntry", id: "readable00000009", flags: {}, testUserPermission: () => true };
  assert.equal(await api.add(entry), null);
  assert.equal(api.status(entry), null);
});

test("selftest passes on a healthy load", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks));
});

test("settings() reports the three rows' live values", () => {
  assert.deepEqual(api.settings(), { gmButton: false, singlePageReadables: true, folderName: "Player Journals" });
});

test("uninstall() removes every hook the module registered", () => {
  api.uninstall();
  assert.deepEqual(F.listeners(), {});
});
