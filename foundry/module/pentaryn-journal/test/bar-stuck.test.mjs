// bar-stuck (final review rob-1, bar.mjs onBarClick): a throw while the bar redraws itself to
// "Adding…" happened before the try, so `busy` was never cleared and the window's bar stayed on
// "Adding…" for the rest of the session, and the click's promise rejected with nobody listening.
// Now the redraw is inside the try: the player gets the "failed" warning, the bar comes back, and a
// throwing "open" click is caught too.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await journalWorld();
const clicks = [];
const bars = [];
globalThis.document = {
  createElement: () => {
    const bar = { className: "", innerHTML: "", remove() {}, addEventListener: (t, fn) => clicks.push(fn) };
    bars.push(bar);
    return bar;
  },
};
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

const readable = makeDoc("JournalEntry", { id: "readable00000051", name: "Plaque", ownership: { default: 2 } });
const page = makeDoc("JournalEntryPage", { id: "page000000000051", name: "P", type: "text", sort: 1, ownership: { default: 2 },
  text: { content: "<p>x</p>" } }, { parent: readable });
Object.defineProperty(readable, "pages", { value: new StubCollection([page]), enumerable: false });

const ADDING = game.i18n.localize("PENTARYN_JOURNAL.adding");
const FAILED = game.i18n.localize("PENTARYN_JOURNAL.notify.failed");

function openWindow() {
  let bar = null;
  let boom = false;
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector: sel => {
      if (sel === ":scope > .pj-bar") {
        if (boom) throw new Error("redraw failed");
        return bar;
      }
      return null;
    },
    append: el => { bar = el; },
  });
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const app = Object.setPrototypeOf({ rendered: true, document: readable, element: root }, JES.prototype);
  clicks.length = 0;
  F.fire("renderJournalEntrySheet", app, null, {}, {});
  assert.equal(clicks.length, 1, "the bar listens for clicks");
  return { app, bar: () => bar, click: clicks[0], explode: on => { boom = on; } };
}

const press = (click, pj) => click({ target: { closest: () => ({ disabled: false, dataset: { pj } }) }, preventDefault() {} });

test("bar-stuck: a throw while drawing 'Adding…' warns the player and clears the busy state", async () => {
  F.become({ userId: P1 });
  try {
    const w = openWindow();
    assert.ok(!w.bar().innerHTML.includes(ADDING));
    w.explode(true);
    const from = F.calls.length;
    await assert.doesNotReject(press(w.click, "add"), "the click's promise does not reject");
    const warns = F.calls.slice(from).filter(c => c.op === "notify" && c.level === "warn");
    assert.deepEqual(warns.map(c => c.message), [FAILED], "the player is told it failed");
    w.explode(false);
    F.fire("renderJournalEntrySheet", w.app, null, {}, {});
    assert.ok(!w.bar().innerHTML.includes(ADDING), "the bar is not stuck on 'Adding…'");
    assert.match(w.bar().innerHTML, /data-pj="add"/, "the add button is back");
    const adds = F.calls.length;
    await press(w.click, "add");
    assert.ok(F.calls.slice(adds).some(c => c.op === "createEmbeddedDocuments"), "a second click adds");
  } finally {
    F.become({ userId: GM });
  }
});

test("bar-stuck: a throwing 'open' click is caught, not an unhandled rejection", async () => {
  F.become({ userId: P1 });
  try {
    const w = openWindow();
    const journal = api.personal();
    const keep = journal.sheet.render;
    journal.sheet.render = async () => { throw new Error("render failed"); };
    try {
      await assert.doesNotReject(press(w.click, "open"));
    } finally {
      journal.sheet.render = keep;
    }
  } finally {
    F.become({ userId: GM });
  }
});
