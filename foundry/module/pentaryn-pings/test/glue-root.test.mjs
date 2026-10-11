// Glue characterisation: publishing into game.pentaryn when another module got there first, both load
// orders (pings.mjs:232-238; SF1). Before: a frozen root (the pre-items-journal-1 importer shape) holding
// foreign keys — pings rebuilds it by spread and keeps them. After: a module publishing later through
// the kit, and a legacy frozen-root rebuild, both keep pings. Its own process.
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
F.game.pentaryn = Object.freeze({ import: importer, rules });
await import("../pings.mjs");

test("before: a frozen root is rebuilt with pings added and every foreign key kept", () => {
  const frozen = F.game.pentaryn;
  F.fire("init");
  F.fire("ready");
  mock.timers.tick(0);
  const root = F.game.pentaryn;
  assert.notEqual(root, frozen, "rebuilt, not assigned into");
  assert.equal(root.import, importer);
  assert.equal(root.rules, rules);
  for (const k of ["import", "rules", "pings"]) assert.ok(Object.keys(root).includes(k), k);
  assert.equal(Object.isExtensible(root), true, "the rebuilt root is extensible (SF1)");
  for (const k of ["last", "recent", "all", "clear"]) assert.equal(typeof root.pings[k], "function", k);
  assert.equal(Object.isFrozen(frozen), true, "the old root is left as it was");
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
