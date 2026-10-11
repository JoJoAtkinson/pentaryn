// Core characterisation (guide step 1.4). The pure halves of the ledger and the pile helpers, one table
// per function, run over fixtures/impls.mjs (oracle today; the core from step 2). The recorder tables
// run on the oracle's makeRecorder (today's recordAsGM with its store injected) under mocked timers.
import { IMPLS } from "./fixtures/impls.mjs";
import * as oracle from "./fixtures/legacy-dropbin.mjs";
import { mock, test } from "node:test";
import assert from "node:assert/strict";

const same = (got, want, msg) => assert.equal(JSON.stringify(got), JSON.stringify(want), msg);

test("no Foundry globals are needed", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas", "PIXI"]) assert.equal(globalThis[g], undefined, g);
});

for (const [label, M] of IMPLS) {
  test(`${label}: makeEntry (items-journal-20)`, () => {
    const item = { name: "Sword", type: "weapon", system: { quantity: 2 } };
    const ctx = { actor: { id: "a", name: "Ann", uuid: "Actor.a" }, item, quantity: undefined, user: { id: "u", name: "U" }, scene: { id: "s", name: "S" }, now: 1000 };
    same(M.makeEntry("drop", ctx), {
      t: 1000, iso: "1970-01-01T00:00:01.000Z", reason: "drop", userId: "u", userName: "U", fromActorId: "a", fromActorName: "Ann",
      fromActorUuid: "Actor.a", itemName: "Sword", itemType: "weapon", quantity: 2, sceneId: "s", sceneName: "S", x: null, y: null,
      pileUuid: null, item,
    });
    const bare = M.makeEntry("delete", { ...ctx, actor: null, item: null, scene: null });
    same([bare.itemName, bare.itemType, bare.quantity, bare.fromActorId, bare.sceneId, bare.item], ["(unnamed)", null, 1, null, null, null]);
    assert.equal(M.makeEntry("drop", { ...ctx, quantity: 5 }).quantity, 5);
  });

  test(`${label}: dedupeKey`, () => {
    assert.equal(M.dedupeKey({ reason: "drop", itemName: "Sword", fromActorId: "a", quantity: 2 }), "drop|Sword|a|2");
  });

  test(`${label}: normaliseDeltas, listLast, findEntry, searchLog`, () => {
    same(M.normaliseDeltas(undefined), []);
    same(M.normaliseDeltas({ item: 1 }), [{ item: 1 }]);
    const a = { a: 1 }, b = { b: 2 };
    same(M.normaliseDeltas([a, b]), [a, b]);
    const log = [{ n: 1, itemName: "Sword" }, { n: 2, itemName: "undefined thing" }, { n: 3, itemName: "Shield" }];
    same(M.listLast([{ n: 1 }, { n: 2 }, { n: 3 }], 2), [{ n: 3 }, { n: 2 }]);
    same(M.listLast(log).map(e => e.n), [3, 2, 1]);
    same(M.findEntry(log, "2"), log[1]);
    assert.equal(M.findEntry(log, 9), null);
    same(M.searchLog(log, "SH").map(e => e.n), [3]);
    // KNOWN: quirk of String(text) — search(undefined) matches item names containing "undefined"
    same(M.searchLog(log, undefined).map(e => e.n), [2]);
  });

  test(`${label}: shouldCaptureDelete truth table (items-journal-27 seam)`, () => {
    const actor = { documentName: "Actor", type: "character" };
    const base = { userId: "u", selfId: "u", actor, characterType: "character", isPile: () => false, options: {} };
    assert.equal(M.shouldCaptureDelete(base), true);
    assert.equal(M.shouldCaptureDelete({ ...base, userId: "v" }), false, "another user's delete");
    assert.equal(M.shouldCaptureDelete({ ...base, actor: { documentName: "Item", type: "character" } }), false, "not an Actor parent");
    assert.equal(M.shouldCaptureDelete({ ...base, actor: null }), false);
    assert.equal(M.shouldCaptureDelete({ ...base, actor: { documentName: "Actor", type: "npc" } }), false, "not a character");
    assert.equal(M.shouldCaptureDelete({ ...base, isPile: () => true }), false, "a pile");
    assert.equal(M.shouldCaptureDelete({ ...base, options: { "pentaryn-dropbin": { restoring: true } } }), false, "our own restore (dead today: set on create)");
  });

  test(`${label}: pileFlags / isPileFlagged (items-journal-23)`, () => {
    const shapes = [
      { flags: { "item-piles": { data: { enabled: true, type: "container" } } } },
      { flags: { "item-piles": { data: { enabled: false } } } },
      { flags: { "item-piles": {} } },
      { flags: {} },
    ];
    same(M.pileFlags(shapes[0]), { enabled: true, type: "container" });
    assert.equal(M.pileFlags({}), null);
    assert.equal(M.pileFlags(null), null);
    assert.equal(M.isPileFlagged(shapes[1]), false);
    assert.equal(M.isPileFlagged(shapes[0]), true);
    for (const s of shapes) {
      const doc = { ...s, getFlag(scope, key) { return this.flags[scope]?.[key]; } };
      assert.equal(M.pileFlags(doc) ?? undefined, doc.getFlag("item-piles", "data"));
    }
  });

  test(`${label}: pinnedEntryIds (items-journal-24)`, () => {
    const scenes = [{ notes: [{ entryId: "a" }, { entryId: null }, { entryId: "" }] }, { notes: [{ entryId: "b" }] }, { notes: [] }];
    same([...M.pinnedEntryIds(scenes)].sort(), ["a", "b"]);
    for (const id of ["a", "b", "c"]) assert.equal(M.pinnedEntryIds(scenes).has(id), oracle.isNotePinnedJournal(scenes, id), id);
    // documented difference: '' is "pinned" under the old predicate, never a directory row id
    assert.equal(oracle.isNotePinnedJournal(scenes, ""), true);
    assert.equal(M.pinnedEntryIds(scenes).has(""), false);
  });

  test(`${label}: needsRedraw (items-journal-30)`, () => {
    same([M.needsRedraw(undefined, 40), M.needsRedraw(40, 40), M.needsRedraw(40, 80)], [true, false, true]);
  });

  test(`${label}: planLockSounds / planEyesNeedView (items-journal-25)`, async () => {
    const doc = (id, flags, extra = {}) => ({ id, flags, getFlag(scope, key) { return this.flags[scope]?.[key]; }, ...extra });
    const ip = data => ({ "item-piles": { data } });
    const actors = [
      doc("a1", ip({ enabled: true, type: "container" }), { prototypeToken: { sight: { enabled: false } } }),
      doc("a2", ip({ enabled: true, type: "container", lockedSound: "x.wav" }), { prototypeToken: { sight: { enabled: false } } }),
      doc("a3", ip({ enabled: true, type: "pile" }), { prototypeToken: { sight: { enabled: true } } }),
      doc("a4", {}, { prototypeToken: { sight: { enabled: true } } }),
    ];
    const scenes = [{
      id: "s1",
      tokens: [doc("t1", ip({ enabled: true, type: "container" }), { sight: { enabled: true } }), doc("t2", {}, { sight: { enabled: true } })],
      notes: [{ id: "n1", global: true, entry: {} }, { id: "n2", global: true, entry: null }, { id: "n3", global: false, entry: {} }],
    }, { id: "s2", tokens: [], notes: [] }];
    same(await M.planLockSounds(actors, scenes, "sounds/lock.wav"), {
      actorUpdates: [{ _id: "a1", "flags.item-piles.data.lockedSound": "sounds/lock.wav", "prototypeToken.flags.item-piles.data.lockedSound": "sounds/lock.wav" }],
      embedded: [{ sceneId: "s1", type: "Token", updates: [{ _id: "t1", "flags.item-piles.data.lockedSound": "sounds/lock.wav" }] }],
    });
    same(await M.planEyesNeedView(actors, scenes), {
      actorUpdates: [{ _id: "a3", "prototypeToken.sight.enabled": false }],
      embedded: [
        { sceneId: "s1", type: "Token", updates: [{ _id: "t1", "sight.enabled": false }] },
        { sceneId: "s1", type: "Note", updates: [{ _id: "n1", global: false }] },
      ],
    });
  });
}

/* ── the recorder: today's recordAsGM over an async store (items-journal-18) ── */

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
/** Settle `promise` by ticking the mocked clock (the store resolves its writes on setTimeout 0). */
async function settle(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let i = 0; i < 50 && !done; i++) {
    mock.timers.tick(0);
    await flush();
  }
  return promise;
}
/** A world-setting stand-in: `set` lands on setTimeout 0. `copyOnGet` returns a fresh array per read. */
function store({ copyOnGet }) {
  let log = [], counter = 0;
  const later = fn => new Promise(r => setTimeout(() => { fn(); r(); }, 0));
  return {
    read: () => (copyOnGet ? [...log] : log),
    write: v => later(() => { log = copyOnGet ? [...v] : v; }),
    getCounter: () => counter,
    setCounter: n => later(() => { counter = n; }),
    get log() { return log; },
  };
}
const entry = (itemName, t = 0) => ({ t, reason: "drop", itemName, fromActorId: "a", fromActorName: "Ann", quantity: 1 });

for (const copyOnGet of [true, false]) {
  const kind = copyOnGet ? "copy-on-get" : "by-reference";

  test(`recorder (${kind}): sequential appends number 1, 2, 3; a duplicate within 2000 ms returns the tail`, async () => {
    const s = store({ copyOnGet });
    const rec = oracle.makeRecorder(s);
    assert.equal(await settle(rec(entry("A", 0))), 1);
    assert.equal(await settle(rec(entry("B", 0))), 2);
    assert.equal(await settle(rec(entry("C", 0))), 3);
    assert.equal(await settle(rec(entry("C", 1999))), 3, "same key within 2000 ms: the tail's n");
    assert.equal(s.log.length, 3);
    assert.equal(await settle(rec(entry("C", 2001))), 4, "at +2001 ms: appended");
    assert.equal(s.log.length, 4);
  });

  // KNOWN: items-journal-18 — concurrent appends read the same counter and both get n = 1. Flipped by guide
  // step 8 [declared] (serialised ledger appends).
  test(`KNOWN items-journal-18 (${kind}): two concurrent appends both return n = 1`, async () => {
    const s = store({ copyOnGet });
    const rec = oracle.makeRecorder(s);
    const both = await settle(Promise.all([rec(entry("E1")), rec(entry("E2"))]));
    assert.deepEqual(both, [1, 1]);
    assert.equal(s.log.length, copyOnGet ? 1 : 2, copyOnGet ? "copy-on-get: the second write loses the first row" : "by-reference: both rows, both numbered 1");
  });
}

test("submit routing: GM records, a player with socketlib relays, neither warns and drops", async () => {
  const calls = [];
  const recordAsGM = e => { calls.push(["record", e.itemName]); return 7; };
  const sock = { executeAsGM: (name, e) => { calls.push(["executeAsGM", name, e.itemName]); return 8; } };
  const warn = (...a) => calls.push(["warn", a[0]]);
  assert.equal(oracle.makeSubmit({ isGM: () => true, socket: () => sock, recordAsGM, warn })(entry("A")), 7);
  assert.equal(oracle.makeSubmit({ isGM: () => false, socket: () => sock, recordAsGM, warn })(entry("B")), 8);
  assert.equal(oracle.makeSubmit({ isGM: () => false, socket: () => null, recordAsGM, warn })(entry("C")), null);
  assert.deepEqual(calls, [["record", "A"], ["executeAsGM", "record", "B"], ["warn", "pentaryn-dropbin | no socketlib and not a GM — entry dropped"]]);
});

test("restore target resolution: an Actor, then an id or name, else the actor it left", () => {
  const ann = { id: "a", name: "Ann" }, bo = { id: "b", name: "Bo" };
  const actors = { get: id => ({ a: ann, b: bo })[id] ?? undefined, getName: n => [ann, bo].find(x => x.name === n) };
  const isActor = x => x === ann || x === bo;
  const e = { fromActorId: "a" };
  assert.equal(oracle.restoreTarget(bo, e, { isActor, actors }), bo);
  assert.equal(oracle.restoreTarget("b", e, { isActor, actors }), bo);
  assert.equal(oracle.restoreTarget("Bo", e, { isActor, actors }), bo);
  assert.equal(oracle.restoreTarget(null, e, { isActor, actors }), ann);
  assert.equal(oracle.restoreTarget("nobody", e, { isActor, actors }), ann);
});
