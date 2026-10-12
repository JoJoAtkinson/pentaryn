// Glue characterisation: publishing into game.pentaryn when another module got there first, both load
// orders (pings.mjs onReady → publishNamespace; SF1). Before: an extensible root (the importer's shape since its keystone,
// items-journal-1) holding foreign keys — pings assigns into it and keeps them. After: a module
// publishing later through the kit, and a legacy frozen-root rebuild, both keep pings. Its own process.
// [declared] kit 1.0.2 (J10): the "before" root was a FROZEN one that pings rebuilt by spread; the kit
// no longer rebuilds a frozen root (it throws — pinned in foundry/lib/test/publish.test.mjs).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { setupWorld } from "./fixtures/world.mjs";
import { publishNamespace } from "../lib/publish.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F } = W;
W.captureConsole();
const rules = Object.freeze({ lookup() {} });
const importer = Object.freeze({ import() {} });
F.game.pentaryn = { import: importer, rules };
await import("../pings.mjs");

test("before: an extensible root is assigned into, with pings added and every foreign key kept", () => {
  const before = F.game.pentaryn;
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  const root = F.game.pentaryn;
  assert.equal(root, before, "assigned into, never rebuilt");
  assert.equal(root.import, importer);
  assert.equal(root.rules, rules);
  assert.deepEqual(Object.keys(root), ["import", "rules", "pings"]);
  assert.equal(Object.isExtensible(root), true, "the root stays extensible (SF1)");
  for (const k of ["last", "recent", "all", "clear"]) assert.equal(typeof root.pings[k], "function", k);
  assert.deepEqual(F.hookErrors, []);
});

test("after: a later kit publish and a later legacy frozen rebuild both keep pings", () => {
  const pings = F.game.pentaryn.pings;
  publishNamespace("zz", Object.freeze({ contract: "pentaryn-zz/api@1", describe: () => ({}) }), { moduleId: "pentaryn-zz" });
  mock.timers.tick(0);
  assert.equal(F.game.pentaryn.pings, pings);
  F.game.pentaryn = Object.freeze({ ...F.game.pentaryn, late: {} });
  assert.equal(F.game.pentaryn.pings, pings);
  assert.equal(F.game.pentaryn.rules, rules);
  assert.deepEqual(W.console, [["log", "pentaryn-pings | ready — 0 ping(s) on record"]]);
});
