// journal-rob-6: saveNow wrote the copy, then awaited openSaved (the sheet render). A render that threw
// rejected add() after the copy already existed, so the bar showed "failed" and skipped the added toast
// for a page that was in the journal. Now a failed open is a console warning ("open after save failed");
// the added/updated toast still shows and add() answers the saved page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

const F = await journalWorld();
globalThis.document = {
  createElement: () => ({ className: "", innerHTML: "", remove() {}, addEventListener() {} }),
};
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

function readable() {
  const entry = makeDoc("JournalEntry", { id: "readable0000rob6", name: "Plaque rob6", ownership: { default: 2 } });
  const page = makeDoc("JournalEntryPage", { id: "page0000000rob6", name: "Rob6", type: "text", sort: 1,
    ownership: { default: 2 }, text: { content: "<p>rob6</p>" } }, { parent: entry });
  Object.defineProperty(entry, "pages", { value: new StubCollection([page]), enumerable: false });
  return entry;
}

test("a failed open after save still answers the copy and shows the added toast (journal-rob-6)", async () => {
  F.become({ userId: P1 });
  const journal = api.personal();
  const keep = journal.sheet.render;
  const keepWarn = console.warn;
  const warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  journal.sheet.render = async () => { throw new Error("render broke"); };
  try {
    const before = journal.pages.size;
    const from = F.calls.length;
    const out = await api.add(readable());
    assert.equal(journal.pages.size, before + 1, "the copy is saved");
    assert.equal(out?.created, 1, "add answers the saved copy");
    const toasts = F.calls.slice(from).filter(c => c.op === "notify");
    assert.ok(toasts.some(t => t.level === "info"), "the added toast still shows");
    assert.ok(!toasts.some(t => t.level === "warn" || t.level === "error"), "no failed toast");
    assert.ok(warns.some(w => w.includes("open after save failed")), "the failed open is a console warning");
  } finally {
    journal.sheet.render = keep;
    console.warn = keepWarn;
    F.become({ userId: GM });
  }
});
