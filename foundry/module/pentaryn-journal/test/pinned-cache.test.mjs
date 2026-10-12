// pinned-cache (final review EC-2, bar.mjs PIN_HOOKS): the pinned-journal cache's docs said a Scene
// update clears it, but nothing listened for updateScene, so `scene.update({notes})` (re-pointing a pin
// through its scene) left a journal's one-page look stale until some other Note/Scene hook fired.
// Now an updateScene whose change touches `notes` forgets the cache; any other scene update keeps it.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

test("pinned-cache: updateScene with a notes change forgets the cache; other scene updates keep it", async () => {
  const F = await journalWorld();
  await import("../journal.mjs");
  F.fire("init");
  F.fire("ready");
  for (let i = 0; i < 30; i++) await Promise.resolve();
  F.become({ userId: P1 });
  let scans = 0;
  let notes = [{ entryId: "readable00000061" }];
  const scene = { id: "scene00000000061", get notes() { scans++; return notes; } };
  F.game.scenes = new StubCollection([scene]);
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const entry = makeDoc("JournalEntry", { id: "readable00000062", ownership: { default: 2 } });
  const page = makeDoc("JournalEntryPage", { ownership: { default: 2 } }, { parent: entry });
  Object.defineProperty(entry, "pages", { value: { filter: fn => [page].filter(fn), contents: [page] }, enumerable: false });
  const toggles = [];
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add() {}, remove() {}, toggle: (c, on) => toggles.push([c, !!on]) },
    querySelector: () => null, append() {},
  });
  const app = Object.setPrototypeOf({ rendered: true, document: entry, element: root }, JES.prototype);
  globalThis.document = { createElement: () => ({ className: "", addEventListener() {} }) };

  F.fire("renderJournalEntrySheet", app, null, {}, {});
  assert.deepEqual(toggles.at(-1), ["pj-single", false]);
  assert.equal(scans, 1);
  assert.equal(F.listeners("updateScene"), 1, "updateScene is watched once the cache is in use");

  F.fire("updateScene", scene, { darkness: 0.5 }, {}, GM);
  F.fire("renderJournalEntrySheet", app, null, {}, {});
  assert.equal(scans, 1, "a scene update that does not touch notes keeps the cache");

  notes = [{ entryId: "readable00000062" }];
  F.fire("updateScene", scene, { notes: [{ _id: "note000000000061", entryId: "readable00000062" }] }, {}, GM);
  F.fire("renderJournalEntrySheet", app, null, {}, {});
  assert.equal(scans, 2, "a notes change rebuilds once");
  assert.deepEqual(toggles.at(-1), ["pj-single", true], "a pin re-pointed through scene.update is seen");

  game.pentaryn.journal.uninstall();
  assert.equal(F.listeners("updateScene"), 0, "uninstall removes it");
  F.become({ userId: GM });
});
