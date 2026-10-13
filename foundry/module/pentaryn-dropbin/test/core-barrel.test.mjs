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

test("duplicateOfTail agrees with the oracle's tail test where the item source and pile match (dropbin-EC-2 declared the rest)", () => {
  const log = [{ n: 1, t: 0, reason: "drop", itemName: "A", fromActorId: "a", quantity: 1, pileUuid: "P", item: { _id: "i" } }];
  const e = (t, itemName = "A") => ({ t, reason: "drop", itemName, fromActorId: "a", quantity: 1, pileUuid: "P", item: { _id: "i" } });
  for (const x of [e(1999), e(2000), e(2001), e(0, "B")]) {
    assert.equal(!!core.duplicateOfTail(log, x), oracle.isDuplicateOfTail(log, x), JSON.stringify(x));
  }
  assert.equal(core.duplicateOfTail([], e(0)), null);
});

test("dedupe keys on the item's source _id and pileUuid: a distinct same-named loss within 2 s is a second entry (dropbin-EC-2)", () => {
  const e = (t, _id, pileUuid = null) => ({ t, reason: "drop", itemName: "Dagger", fromActorId: "a", quantity: 1, pileUuid, item: { _id, name: "Dagger" } });
  const log = [{ n: 1, ...e(0, "i1", "Scene.s.Token.p1") }];
  assert.equal(core.duplicateOfTail(log, e(500, "i2", "Scene.s.Token.p1")), null, "another Dagger, same pile: a real second loss");
  assert.equal(core.duplicateOfTail(log, e(500, "i1", "Scene.s.Token.p2")), null, "a second pile: a real second loss");
  assert.equal(core.duplicateOfTail(log, e(500, "i1", "Scene.s.Token.p1")), log[0], "the same event seen twice: one entry");
  assert.equal(oracle.isDuplicateOfTail(log, e(500, "i2", "Scene.s.Token.p1")), true, "the oracle dropped the second Dagger (EC-2)");
  const del = (t, _id) => ({ t, reason: "delete", itemName: "Potion", fromActorId: "a", quantity: 1, pileUuid: null, item: { _id } });
  const r = core.appendEntry(core.appendEntry([], 0, del(0, "p1")).log, 1, del(100, "p2"));
  assert.deepEqual([r.n, r.duplicate, r.log.length], [2, false, 2], "two Potions deleted within 2 s: two entries");
  assert.equal(core.appendEntry(r.log, 2, del(200, "p2")).duplicate, true, "the second Potion relayed again: one entry");
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

test("restoreTarget agrees with the oracle where the target resolves or is absent (dropbin-R3 declared the rest)", () => {
  const ann = { id: "a", name: "Ann" }, bo = { id: "b", name: "Bo" };
  const actors = { get: id => ({ a: ann, b: bo })[id] ?? undefined, getName: n => [ann, bo].find(x => x.name === n) };
  const isActor = x => x === ann || x === bo;
  for (const target of [bo, "b", "Bo", null]) {
    assert.equal(core.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }),
      oracle.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }), String(target?.name ?? target));
  }
  for (const target of ["nobody", 7]) {
    assert.equal(oracle.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }), ann, "the oracle fell back");
    assert.equal(core.restoreTarget(target, { fromActorId: "a" }, { isActor, actors }), null, String(target));
  }
});

test("lockedContainer: only an enabled, locked container", () => {
  assert.deepEqual(core.lockedContainer({ enabled: true, type: "container", locked: true }), { enabled: true, type: "container", locked: true });
  for (const d of [null, {}, { enabled: true, type: "pile", locked: true }, { enabled: true, type: "container" }, { enabled: false, type: "container", locked: true }]) {
    assert.equal(core.lockedContainer(d), null, JSON.stringify(d));
  }
});

test("isActiveGMSelf: true only on the active GM user's client", () => {
  assert.equal(core.isActiveGMSelf(undefined), false);
  assert.equal(core.isActiveGMSelf({ activeGM: null }), false);
  assert.equal(core.isActiveGMSelf({ activeGM: { isSelf: false } }), false);
  assert.equal(core.isActiveGMSelf({ activeGM: { isSelf: true } }), true);
});

test("isOurCorpse / hasNoLoot tables", () => {
  const M = "pentaryn-dropbin";
  assert.equal(core.isOurCorpse({ flags: { [M]: { corpse: true } } }), true);
  assert.equal(core.isOurCorpse({ flags: {} }), false);
  assert.equal(core.hasNoLoot({ flags: { [M]: { noLoot: true } }, actor: null }), true, "token flag");
  assert.equal(core.hasNoLoot({ flags: {}, actor: { flags: { [M]: { noLoot: true } } } }), true, "actor flag only");
  assert.equal(core.hasNoLoot({ flags: {}, actor: { flags: {} } }), false, "neither");
  assert.equal(core.hasNoLoot({ flags: {}, actor: null }), false, "no actor");
});

test("listLast(log, 0) is no entries (dropbin-R1); every other n keeps slice(-n)", () => {
  const log = [{ n: 1 }, { n: 2 }, { n: 3 }];
  assert.deepEqual(core.listLast(log, 0), [], "dropbin-R1: the last 0 entries are none");
  // KNOWN (dropbin-R1, declared): the oracle's slice(-0) is slice(0), the whole ledger, for n = 0.
  assert.deepEqual(oracle.listLast(log, 0).map(e => e.n), [3, 2, 1], "the oracle returned the whole ledger");
  for (const x of [undefined, 2, "2", 5, -1, null, NaN, "abc", 2.7]) {
    assert.deepEqual(core.listLast(log, x), oracle.listLast(log, x), String(x));
  }
});
