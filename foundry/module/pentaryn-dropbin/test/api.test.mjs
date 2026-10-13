// The kit-built API (guide step 6): rows ↔ implementations, the describe/surface goldens, legacy rows,
// the store-row settings() snapshot, uninstall and the hot re-import. Ledger, corpse and loot behaviour
// is pinned by glue.test (frozen) and the feature tests.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { dropbinWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const ROOT = new URL("..", import.meta.url);
const manifest = manifestOf(ROOT);
const F = await dropbinWorld();
await import("../dropbin.mjs");
F.fire("init");
F.fire("socketlib.ready");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.modules.get("pentaryn-dropbin").api;
const { MANIFEST } = await import("../api-manifest.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");

test("published as module.api and game.pentaryn.dropbin, frozen; every described method is a function", () => {
  assert.equal(game.pentaryn.dropbin, api);
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.corpses), true);
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
  assert.equal(api.contract, "pentaryn-dropbin/api@1");
});

test("every pre-migration row is legacy; restore/export/clear are GM write rows; flags contract", () => {
  const rows = Object.fromEntries(api.describe().methods.map(m => [m.path, m]));
  for (const [path, m] of Object.entries(rows)) assert.equal(!!m.legacy, !["inspect", "restoreResult", "selftest"].includes(path), path);
  for (const p of ["restore", "export", "clear"]) assert.deepEqual([rows[p].gm, rows[p].writes], [true, true], p);
  assert.deepEqual(api.describe().flags.reads, ["flags.item-piles.data"]);
  assert.ok(api.describe().flags.writes.includes("flags.pentaryn-dropbin.ownership"), "PT3-1's saved pre-death map");
});

test("dropbin-EXT-2: corpse rows declare every document write they make (revive ⊇ fromCorpse via sync; overlay)", () => {
  const fx = path => api.describe().methods.find(m => m.path === path).sideEffects ?? [];
  const has = (path, list) => { for (const e of list) assert.ok(fx(path).includes(e), `${path} lacks ${e}`); };
  const flags = ["corpse", "sight", "ownership"].map(k => `flags.pentaryn-dropbin.${k}`);
  has("corpses.fromCorpse", ["Item Piles pile flags", ...flags, "delta.ownership", "sight.enabled", "ActiveEffect (Lootable, removed)"]);
  assert.ok(!fx("corpses.fromCorpse").includes("flags.pentaryn-dropbin.*"), "fromCorpse names each flag");
  has("corpses.toCorpse", ["flags.core.overlay"]);
  has("corpses.sync", ["flags.core.overlay", ...fx("corpses.fromCorpse"), ...fx("corpses.toCorpse")]);
  has("corpses.revive", ["ActiveEffect (Dead)", "system.attributes.hp.value", ...fx("corpses.fromCorpse")]);
});

test("dropbin-M13: the legacy-row helper is named legacyRow (it builds the loot.* rows too, not only corpses.*)", async () => {
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(new URL("../api-manifest.mjs", import.meta.url), "utf8");
  assert.ok(!/\bcorpseRow\b/.test(src), "no helper named corpseRow");
  assert.match(src, /const legacyRow = /);
  for (const path of ["corpses.sync", "loot.install"]) assert.match(src, new RegExp(`legacyRow\\("${path.replace(".", "\\.")}"`), path);
});

test("settings() reports the store rows' size, never the ledger itself", () => {
  assert.deepEqual(api.settings(), { log: { store: true, size: 0 }, counter: { store: true, size: null } });
});

test("uninstall() removes every hook the module registered", () => {
  api.uninstall();
  assert.deepEqual(F.listeners(), {});
});

test("hot re-import after ready re-wires and republishes a new API object", async () => {
  const before = game.pentaryn.dropbin;
  await import("../dropbin.mjs?v=2");
  assert.notEqual(game.pentaryn.dropbin, before);
  assert.equal(game.modules.get("pentaryn-dropbin").api, game.pentaryn.dropbin);
  assert.ok(F.listeners("renderActorDirectory") === 1 && F.listeners("preDeleteItem") === 1, JSON.stringify(F.listeners()));
  assert.ok(F.listeners("item-piles-preRenderInterface") === 1);
  game.pentaryn.dropbin.uninstall();
  assert.deepEqual(F.listeners(), {});
});
