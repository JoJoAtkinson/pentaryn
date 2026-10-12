// items-journal-35: reads an LLM (running as the GM through eval) can use — entriesOf(userRef),
// statusFor(doc, {as}), inspect(userRef) and lastReason() — while add()/status() keep their legacy
// answers (null for a GM without gmButton).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { maxDepth } from "./kit/harness.mjs";
import { GM, P1, P2, journalWorld } from "./fixtures/world.mjs";
import * as core from "../journal-core.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: Date.UTC(2026, 9, 11, 12) });

const ROW_KEYS = ["pageId", "name", "key", "place", "savedAt", "updatedAt", "hash"];

test("core.entryRows: one row per page, keys in the pinned order; a hand-written page has null source fields", () => {
  const plan = core.planSave([], [
    { kind: "page", key: "JournalEntry.a.JournalEntryPage.p", type: "text", name: "A", body: "<p>a</p>" },
    { kind: "image", key: "JournalEntry.a.JournalEntryPage.q", type: "image", name: "B", src: "b.webp", caption: "" },
  ], { place: "Old Gate", now: 1000 });
  const saved = plan.create.map((d, i) => ({ ...d, _id: `page${i}` }));
  const rows = core.entryRows([...saved, { _id: "mine", name: "My notes", flags: {} }]);
  assert.deepEqual(rows.map(r => Object.keys(r)), [ROW_KEYS, ROW_KEYS, ROW_KEYS]);
  assert.deepEqual(rows.map(r => [r.pageId, r.key, r.place, r.savedAt]), [
    ["page0", "JournalEntry.a.JournalEntryPage.p", "Old Gate", 1000],
    ["page1", "JournalEntry.a.JournalEntryPage.q", "Old Gate", 1000],
    ["mine", null, null, null],
  ]);
  assert.equal(core.status(saved, [
    { key: "JournalEntry.a.JournalEntryPage.p", type: "text", body: "<p>a</p>" },
    { key: "JournalEntry.a.JournalEntryPage.q", type: "image", src: "b.webp", caption: "" },
  ]), "saved");
  assert.deepEqual(core.entryRows(undefined), []);
});

const F = await journalWorld();
await import("../journal.mjs");
F.fire("init");
F.fire("ready");
for (let i = 0; i < 30; i++) await Promise.resolve();
const api = game.pentaryn.journal;

const readable = makeDoc("JournalEntry", { id: "readable00000007", name: "Gate Inscription", ownership: { default: 2 } });
const page = makeDoc("JournalEntryPage", { id: "page000000000007", name: "Page 1", type: "text", sort: 1, ownership: { default: 2 },
  text: { content: "<p>Speak, friend.</p>" } }, { parent: readable });
Object.defineProperty(readable, "pages", { value: { contents: [page], filter: fn => [page].filter(fn) }, enumerable: false });

test("a player saves; the GM's legacy add/status still say null, and lastReason says why", async () => {
  F.become({ userId: P1 });
  const out = await api.add(readable);
  assert.equal(out.created, 1);
  assert.equal(api.lastReason(), null);
  F.become({ userId: GM });
  assert.equal(await api.add(readable), null);
  assert.equal(api.lastReason(), "no-target");
  assert.equal(api.status(readable), null);
  assert.equal(api.lastReason(), "no-target");
});

test("statusFor answers for any user, by User, id or exact name, without the bar's rule", () => {
  assert.equal(api.statusFor(readable, { as: P1 }), "saved");
  assert.equal(api.statusFor(readable, { as: "Pat" }), "saved");
  assert.equal(api.statusFor(page, { as: game.users.get(P1) }), "saved");
  assert.equal(api.statusFor(readable, { as: P2 }), "none");
  assert.equal(api.statusFor(readable), "none", "the GM, who has no journal");
  assert.equal(api.statusFor(makeDoc("Actor", {}), { as: P1 }), null);
  assert.throws(() => api.statusFor(readable, { as: "Nobody" }), { code: "NOT_FOUND" });
});

test("entriesOf: the player's rows; [] for a user without a journal; NOT_FOUND for an unknown ref", () => {
  const rows = api.entriesOf("Pat");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), ROW_KEYS);
  assert.equal(rows[0].key, page.uuid);
  assert.equal(rows[0].place, null);
  assert.deepEqual(api.entriesOf(GM), []);
  assert.throws(() => api.entriesOf("Nobody"), { code: "NOT_FOUND" });
});

test("inspect(userRef): journal ref, duplicates, entries; plain JSON, depth ≤ 4", () => {
  const out = api.inspect(P1);
  assert.deepEqual(Object.keys(out), ["user", "journal", "duplicates", "entries"]);
  assert.equal(out.journal.id, api.personal(game.users.get(P1)).id);
  assert.deepEqual(out.duplicates, []);
  assert.equal(out.entries.length, 1);
  assert.ok(maxDepth(out) <= 4);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(out))), JSON.stringify(out));
  assert.equal(api.inspect(GM).journal, null);
});

test("status/statusFor answer saved when nothing is visible but the document itself is saved", () => {
  const before = page.ownership;
  page.ownership = { default: 0 };                       // P1 can no longer observe the saved page…
  try {
    assert.equal(readable.testUserPermission(game.users.get(P1), "OBSERVER"), true, "…but still the entry");
    assert.equal(readable.testUserPermission(game.users.get(P1), "OWNER"), false);
    assert.equal(api.statusFor(page, { as: P1 }), "saved");
    F.become({ userId: P1 });
    assert.equal(api.status(page), "saved");
    assert.equal(api.lastReason(), null);

    const other = makeDoc("JournalEntry", { id: "readable00000008", name: "Sealed Door", ownership: { default: 2 } });
    const hidden = makeDoc("JournalEntryPage", { id: "page000000000008", name: "Page 1", type: "text", sort: 1, ownership: { default: 0 },
      text: { content: "<p>Shut.</p>" } }, { parent: other });
    Object.defineProperty(other, "pages", { value: { contents: [hidden], filter: fn => [hidden].filter(fn) }, enumerable: false });
    assert.equal(api.status(hidden), "none", "never saved, nothing visible");
    assert.equal(api.statusFor(hidden, { as: P1 }), "none");
  } finally {
    page.ownership = before;
    F.become({ userId: GM });
  }
});
