// items-journal-38: which journals a scene pin opens is computed once and cached (core.pinnedEntryIds,
// makePinnedCache), forgotten on Note/Scene create, update and delete (updateScene: see pinned-cache.test).
// The listeners are registered on the first single-page decision, so golden/hooks.json (load time) is unchanged.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";
import * as core from "../journal-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

test("pinnedEntryIds: the items-journal-24 fixture", () => {
  const scenes = [{ notes: [{ entryId: "a" }, { entryId: null }, { entryId: "" }] }, { notes: [{ entryId: "b" }] }, { notes: [] }];
  assert.deepEqual([...core.pinnedEntryIds(scenes)].sort(), ["a", "b"]);
  assert.deepEqual([...core.pinnedEntryIds(undefined)], []);
});

test("equivalence with the old every-scene scan over 50 seeded layouts, for every non-empty id", () => {
  let seed = 38;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  const ids = ["a", "b", "c", "d", "e", null, ""];
  for (let i = 0; i < 50; i++) {
    const scenes = Array.from({ length: rnd(5) }, () => ({ notes: Array.from({ length: rnd(4) }, () => ({ entryId: ids[rnd(ids.length)] })) }));
    const set = core.pinnedEntryIds(scenes);
    for (const id of ["a", "b", "c", "d", "e", "z"]) {
      assert.equal(set.has(id), scenes.some(s => s.notes.some(n => n.entryId === id)), `layout ${i}, id ${id}`);
    }
  }
});

test("makePinnedCache: built once; a new note is seen only after invalidate()", () => {
  const scenes = [{ notes: [{ entryId: "a" }] }];
  let builds = 0;
  const cache = core.makePinnedCache(() => { builds++; return scenes; });
  assert.equal(cache.built, false);
  assert.equal(cache.has("a"), true);
  scenes[0].notes.push({ entryId: "b" });
  assert.equal(cache.has("b"), false, "stale until invalidated");
  assert.equal(builds, 1);
  cache.invalidate();
  assert.equal(cache.has("b"), true);
  assert.equal(builds, 2);
});

test("single-page eyes: one scan for many renders; each of the five hooks forgets the cache", async () => {
  const F = await journalWorld();
  await import("../journal.mjs");
  F.fire("init");
  F.fire("ready");
  for (let i = 0; i < 30; i++) await Promise.resolve();
  F.become({ userId: P1 });
  let scans = 0;
  const notes = [{ entryId: "readable00000021" }];
  const scene = { id: "scene00000000021", get notes() { scans++; return notes; } };
  F.game.scenes = new StubCollection([scene]);
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const make = id => {
    const entry = makeDoc("JournalEntry", { id, ownership: { default: 2 } });
    const page = makeDoc("JournalEntryPage", { ownership: { default: 2 } }, { parent: entry });
    Object.defineProperty(entry, "pages", { value: { filter: fn => [page].filter(fn), contents: [page] }, enumerable: false });
    const toggles = [];
    const root = Object.assign(Object.create(HTMLElement.prototype), {
      classList: { add() {}, remove() {}, toggle: (c, on) => toggles.push([c, !!on]) },
      querySelector: () => null, append() {},
    });
    const app = Object.setPrototypeOf({ rendered: true, document: entry, element: root }, JES.prototype);
    return { app, toggles };
  };
  globalThis.document = { createElement: () => ({ className: "", addEventListener() {} }) };
  const a = make("readable00000021");
  const b = make("readable00000022");
  assert.equal(F.listeners("createNote"), 0, "nothing registered before the first decision");
  for (let i = 0; i < 3; i++) F.fire("renderJournalEntrySheet", a.app, null, {}, {});
  F.fire("renderJournalEntrySheet", b.app, null, {}, {});
  assert.equal(scans, 1, "four renders, one scan");
  assert.deepEqual(a.toggles.at(-1), ["pj-single", true]);
  assert.deepEqual(b.toggles.at(-1), ["pj-single", false]);
  for (const h of ["createNote", "updateNote", "deleteNote", "createScene", "deleteScene"]) {
    assert.equal(F.listeners(h), 1, h);
    F.fire(h);
    F.fire("renderJournalEntrySheet", b.app, null, {}, {});
  }
  assert.equal(scans, 6, "each hook forced one rebuild");
  notes.push({ entryId: "readable00000022" });
  F.fire("updateNote");
  F.fire("renderJournalEntrySheet", b.app, null, {}, {});
  assert.deepEqual(b.toggles.at(-1), ["pj-single", true], "a re-pointed note is seen after updateNote");
  game.pentaryn.journal.uninstall();
  assert.equal(F.listeners("createNote"), 0, "uninstall removes the lazily registered listeners");
  F.become({ userId: GM });
});
