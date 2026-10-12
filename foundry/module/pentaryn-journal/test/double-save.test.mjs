// double-save (final review journal-async-2, bar.mjs save): two overlapping save() calls both
// planned from the journal's pages before either had written, so both created a copy (two pages for
// one readable). `busy` is per window and api.add had no guard. Now save() calls on this client are
// chained: the second waits for the first and plans from the page it wrote.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await journalWorld();
globalThis.document = {
  createElement: () => ({ className: "", innerHTML: "", remove() {}, addEventListener() {} }),
};
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

function readableNamed(n) {
  const readable = makeDoc("JournalEntry", { id: `readable000000${n}`, name: `Plaque ${n}`, ownership: { default: 2 } });
  const page = makeDoc("JournalEntryPage", { id: `page00000000000${n}`, name: `P${n}`, type: "text", sort: 1,
    ownership: { default: 2 }, text: { content: `<p>x${n}</p>` } }, { parent: readable });
  Object.defineProperty(readable, "pages", { value: new StubCollection([page]), enumerable: false });
  return readable;
}

test("double-save: two quick adds of one readable make one copy, not two", async () => {
  F.become({ userId: P1 });
  const journal = api.personal();
  const keep = journal.createEmbeddedDocuments;
  // A real create is a server round trip: the page lands some ticks after the call, not inside it.
  journal.createEmbeddedDocuments = async (...a) => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
    return keep.apply(journal, a);
  };
  try {
    const readable = readableNamed(61);
    const before = journal.pages.size;
    const [a, b] = await Promise.all([api.add(readable), api.add(readable)]);
    assert.equal(journal.pages.size, before + 1, "one copy in the journal");
    assert.equal(a.created, 1, "the first add creates the copy");
    assert.equal(b.created, 0, "the second add sees the first's page and creates nothing");
    assert.deepEqual(b.pageIds, a.pageIds, "both answer the same page");
  } finally {
    journal.createEmbeddedDocuments = keep;
    F.become({ userId: GM });
  }
});

test("double-save: a failed save does not block the next one", async () => {
  F.become({ userId: P1 });
  const journal = api.personal();
  const keep = journal.createEmbeddedDocuments;
  try {
    journal.createEmbeddedDocuments = async () => {   // refuses once, then behaves
      journal.createEmbeddedDocuments = keep;
      throw new Error("server refused");
    };
    const first = api.add(readableNamed(62));
    const second = api.add(readableNamed(63));
    await assert.rejects(first, { message: "server refused" });
    const out = await second;
    assert.equal(out.created, 1, "the queued add still runs");
  } finally {
    journal.createEmbeddedDocuments = keep;
    F.become({ userId: GM });
  }
});
