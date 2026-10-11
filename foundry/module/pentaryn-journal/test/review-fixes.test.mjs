// Review of the standalone findings (wave 2):
// - items-journal-33 (3): the bar's "open" click looks up the user's journal once (it used to call
//   personal() twice: once in savedStatus, once for openSaved). Counted through game.journal.filter,
//   which is what personal() scans.
// - items-journal-35: lastReason() never carries a previous call's reason past an add() that threw.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await journalWorld();
const clicks = [];
globalThis.document = {
  createElement: () => ({ className: "", innerHTML: "", remove() {}, addEventListener: (t, fn) => clicks.push(fn) }),
};
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

const readable = makeDoc("JournalEntry", { id: "readable00000041", name: "Plaque", ownership: { default: 2 } });
const page = makeDoc("JournalEntryPage", { id: "page000000000041", name: "P", type: "text", sort: 1, ownership: { default: 2 },
  text: { content: "<p>x</p>" } }, { parent: readable });
Object.defineProperty(readable, "pages", { value: new StubCollection([page]), enumerable: false });

test("the bar's open click: one personal() lookup, and it opens the saved page", async () => {
  F.become({ userId: P1 });
  const saved = await api.add(readable);
  assert.equal(saved.created, 1);
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector: () => null, append() {},
  });
  const app = Object.setPrototypeOf({ rendered: true, document: readable, element: root }, JES.prototype);
  clicks.length = 0;
  F.fire("renderJournalEntrySheet", app, null, {}, {});
  assert.equal(clicks.length, 1, "the bar listens for clicks");
  const scan = game.journal.filter;
  let scans = 0;
  game.journal.filter = (...a) => { scans++; return scan.apply(game.journal, a); };
  const from = F.calls.length;
  try {
    const btn = { disabled: false, dataset: { pj: "open" } };
    await clicks[0]({ target: { closest: () => btn }, preventDefault() {} });
  } finally {
    game.journal.filter = scan;
  }
  assert.equal(scans, 1, "one personal() per bar action");
  const renders = F.calls.slice(from).filter(c => c.op === "sheet.render");
  assert.equal(renders.length, 1);
  assert.equal(renders[0].opts.pageId, saved.pageIds[0]);
  F.become({ userId: GM });
});

test("lastReason is cleared by an add() that throws, not left at the previous call's reason", async () => {
  assert.equal(await api.add(readable), null, "the GM without gmButton");
  assert.equal(api.lastReason(), "no-target");
  F.become({ userId: P1 });
  const journal = api.personal();
  const keep = journal.createEmbeddedDocuments;
  journal.createEmbeddedDocuments = async () => { throw new Error("server refused"); };
  const other = makeDoc("JournalEntry", { id: "readable00000042", name: "Stone", ownership: { default: 2 } });
  const p2 = makeDoc("JournalEntryPage", { id: "page000000000042", name: "S", type: "text", ownership: { default: 2 },
    text: { content: "<p>y</p>" } }, { parent: other });
  Object.defineProperty(other, "pages", { value: new StubCollection([p2]), enumerable: false });
  try {
    await assert.rejects(api.add(other), { message: "server refused" });
  } finally {
    journal.createEmbeddedDocuments = keep;
    F.become({ userId: GM });
  }
  assert.equal(api.lastReason(), null, "no stale 'no-target' from the GM's earlier call");
});
