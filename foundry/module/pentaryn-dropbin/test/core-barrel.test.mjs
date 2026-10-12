// The pure barrel (guide step 2): it imports bare, its VERSION is module.json's, MODULE is the one
// loot-core defines, and the ledger helpers the glue uses beyond core.test's tables match the oracle.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";
import * as core from "../dropbin-core.mjs";
import * as lootCore from "../loot-core.mjs";
import * as oracle from "./fixtures/legacy-dropbin.mjs";

test("the barrel imports with no Foundry globals and touches none", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas", "PIXI"]) assert.equal(globalThis[g], undefined, g);
});

test("VERSION === module.json version; MODULE is loot-core's", () => {
  assert.equal(core.VERSION, readJSON(new URL("../module.json", import.meta.url)).version);
  assert.equal(core.MODULE, "pentaryn-dropbin");
  assert.equal(core.MODULE, lootCore.MODULE);
  assert.deepEqual([core.SHORT, core.NS, core.I18N, core.CSS], ["dropbin", "dropbin", "PENTARYN_DROPBIN", "pd-"]);
});

test("duplicateOfTail agrees with the oracle's tail test", () => {
  const log = [{ n: 1, t: 0, reason: "drop", itemName: "A", fromActorId: "a", quantity: 1 }];
  const e = (t, itemName = "A") => ({ t, reason: "drop", itemName, fromActorId: "a", quantity: 1 });
  for (const x of [e(1999), e(2000), e(2001), e(0, "B")]) {
    assert.equal(!!core.duplicateOfTail(log, x), oracle.isDuplicateOfTail(log, x), JSON.stringify(x));
  }
  assert.equal(core.duplicateOfTail([], e(0)), null);
});

test("appendEntry: number counter + 1, never mutates; a duplicate returns the tail's n", () => {
  const log = Object.freeze([{ n: 4, t: 0, reason: "drop", itemName: "A", fromActorId: "a", quantity: 1 }]);
  const fresh = core.appendEntry(log, 4, { t: 5000, reason: "drop", itemName: "A", fromActorId: "a", quantity: 1 });
  assert.deepEqual([fresh.n, fresh.counter, fresh.duplicate, fresh.log.length, log.length], [5, 5, false, 2, 1]);
  assert.deepEqual(Object.keys(fresh.log[1]).slice(0, 2), ["n", "t"]);
  const dup = core.appendEntry(log, 4, { t: 100, reason: "drop", itemName: "A", fromActorId: "a", quantity: 1 });
  assert.deepEqual([dup.n, dup.counter, dup.duplicate], [4, 4, true]);
  assert.equal(dup.log, log);
  assert.equal(core.appendEntry([], undefined, { t: 0 }).n, 1, "no counter yet: #1");
});

test("restoreTarget agrees with the oracle", () => {
  const ann = { id: "a", name: "Ann" }, bo = { id: "b", name: "Bo" };
  const actors = { get: id => ({ a: ann, b: bo })[id] ?? undefined, getName: n => [ann, bo].find(x => x.name === n) };
  const isActor = x => x === ann || x === bo;
  for (const target of [bo, "b", "Bo", null, "nobody", 7]) {
    assert.equal(core.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }),
      oracle.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }), String(target?.name ?? target));
  }
});

test("lockedContainer: only an enabled, locked container", () => {
  assert.deepEqual(core.lockedContainer({ enabled: true, type: "container", locked: true }), { enabled: true, type: "container", locked: true });
  for (const d of [null, {}, { enabled: true, type: "pile", locked: true }, { enabled: true, type: "container" }, { enabled: false, type: "container", locked: true }]) {
    assert.equal(core.lockedContainer(d), null, JSON.stringify(d));
  }
});

test("listLast: last n means none for n <= 0, null or non-numeric", () => {
  const log = [{ n: 1 }, { n: 2 }, { n: 3 }];
  for (const x of [0, -1, null, NaN, "abc"]) assert.deepEqual(core.listLast(log, x), [], String(x));
  assert.deepEqual(core.listLast(log, "2"), [{ n: 3 }, { n: 2 }]);
  assert.deepEqual(core.listLast(log, 2.7), [{ n: 3 }, { n: 2 }]);
  assert.deepEqual(core.listLast(log, undefined), [{ n: 3 }, { n: 2 }, { n: 1 }]);
});
