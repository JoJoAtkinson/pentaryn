// journal-EC-3 (final review, bar.mjs decorate/fillBar): a readable the player can OBSERVE whose
// pages they cannot see showed the "Add to my journal" bar, and clicking it did nothing visible
// (descriptorsFor was empty, so save() skipped silently). Now the bar is hidden there, exactly as for
// a window with no target: no footer, no `pentaryn-journal-readable` class. The api's targetOf and
// status rules are unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

const F = await journalWorld();
globalThis.document = {
  createElement: () => ({ className: "", innerHTML: "", remove() { this.removed = true; }, addEventListener() {} }),
};
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

function readableWith(id, pageOwnership) {
  const entry = makeDoc("JournalEntry", { id, name: "Plaque", ownership: { default: 2 } });
  const page = makeDoc("JournalEntryPage", { id: `${id.slice(0, 12)}page`, name: "P", type: "text", sort: 1,
    ownership: { default: pageOwnership }, text: { content: "<p>x</p>" } }, { parent: entry });
  Object.defineProperty(entry, "pages", { value: new StubCollection([page]), enumerable: false });
  return entry;
}

function openWindow(entry) {
  let bar = null;
  const classes = new Set();
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add: c => classes.add(c), remove: c => classes.delete(c), toggle() {} },
    querySelector: sel => (sel === ":scope > .pj-bar" && bar && !bar.removed ? bar : null),
    append: el => { bar = el; },
  });
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const app = Object.setPrototypeOf({ rendered: true, document: entry, element: root }, JES.prototype);
  F.fire("renderJournalEntrySheet", app, null, {}, {});
  return { app, bar: () => (bar && !bar.removed ? bar : null), classes };
}

test("journal-EC-3: no bar on a readable with no page the player can see", () => {
  F.become({ userId: P1 });
  try {
    const hidden = readableWith("readableEC3hid0", 0);
    const w = openWindow(hidden);
    assert.equal(w.bar(), null, "no footer");
    assert.ok(!w.classes.has("pentaryn-journal-readable"), "no readable class");
    assert.equal(api.shouldShowBar(hidden), true, "the api's bar rule is unchanged");
    assert.equal(api.status(hidden), "none", "the api's status rule is unchanged (a target with nothing to save)");
  } finally {
    F.become({ userId: GM });
  }
});

test("journal-EC-3: the bar comes off when the last visible page is hidden, and back when one is shown", () => {
  F.become({ userId: P1 });
  try {
    const entry = readableWith("readableEC3tog0", 2);
    const w = openWindow(entry);
    assert.ok(w.bar(), "a visible page: the bar shows");
    assert.ok(w.classes.has("pentaryn-journal-readable"));
    entry.pages.contents[0].ownership.default = 0;
    F.fire("renderJournalEntrySheet", w.app, null, {}, {});
    assert.equal(w.bar(), null, "page hidden: the bar is removed");
    assert.ok(!w.classes.has("pentaryn-journal-readable"));
    entry.pages.contents[0].ownership.default = 2;
    F.fire("renderJournalEntrySheet", w.app, null, {}, {});
    assert.ok(w.bar(), "page shown again: the bar is back");
    assert.ok(w.classes.has("pentaryn-journal-readable"));
  } finally {
    F.become({ userId: GM });
  }
});
