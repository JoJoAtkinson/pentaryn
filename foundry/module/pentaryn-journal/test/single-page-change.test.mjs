// journal-rob-4 (final review, bar.mjs install): the singlePageReadables change listener re-applied
// the one-page look to every open journal with no per-window try/catch, so one window that threw
// skipped every window after it and the error escaped into settings.mjs changed() (and from there
// into the setting's onChange). Now each window is tried on its own and a throw is warned
// ("single-page skipped"), exactly as the render hook does.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

test("journal-rob-4: a throwing window neither skips the others nor escapes the setting change", async () => {
  const F = await journalWorld();
  await import("../journal.mjs");
  F.fire("init");
  F.fire("ready");
  for (let i = 0; i < 30; i++) await Promise.resolve();
  F.become({ userId: P1 });

  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const bad = Object.setPrototypeOf({
    rendered: true,
    document: { documentName: "JournalEntry" },
    get element() { throw new Error("boom"); },
  }, JES.prototype);
  const entry = makeDoc("JournalEntry", { id: "readable00000071", ownership: { default: 2 } });
  Object.defineProperty(entry, "pages", { value: { filter: () => [], contents: [] }, enumerable: false });
  const toggles = [];
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add() {}, remove() {}, toggle: (c, on) => toggles.push([c, !!on]) },
  });
  const good = Object.setPrototypeOf({ rendered: true, document: entry, element: root }, JES.prototype);
  F.foundry.applications.instances.set("bad", bad);
  F.foundry.applications.instances.set("good", good);

  const warns = [];
  const orig = console.warn;
  console.warn = (...args) => warns.push(args);
  try {
    await game.settings.set("pentaryn-journal", "singlePageReadables", false);
  } finally {
    console.warn = orig;
    F.foundry.applications.instances.delete("bad");
    F.foundry.applications.instances.delete("good");
  }
  assert.deepEqual(toggles, [["pj-single", false]], "the window after the throwing one is still re-applied");
  const skipped = warns.filter(a => String(a[0]).includes("single-page skipped"));
  assert.equal(skipped.length, 1, "the throw is warned once");
  assert.equal(skipped[0][1]?.message, "boom");

  game.pentaryn.journal.uninstall();
  F.become({ userId: GM });
});
