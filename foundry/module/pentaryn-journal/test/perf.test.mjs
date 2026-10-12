// items-journal-33 — refresh cost. (1) sanitize is memoised per page and per item (journal-perf-3) (makeMemo; counted through
// sanitizeMemo.misses), (2) an item update refreshes bars only while an item bar is open
// (needsItemRefresh; counted through decorate's element reads), (3) one personal() per bar action.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { StubCollection, makeDoc } from "./kit/foundry-stub.mjs";
import { GM, P1, journalWorld } from "./fixtures/world.mjs";
import * as core from "../journal-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const SAMPLES = [
  ["plain", "<p>Hello &amp; welcome</p>", {}],
  ["secret", '<p>a</p><section class="secret"><p>GM</p></section><p>b</p>', {}],
  ["revealed", '<section class="secret revealed" id="secret-1"><p>shown</p></section>', {}],
  ["embed", "@Embed[JournalEntry.x.JournalEntryPage.y]{Map}", { embeddedLabel: "embedded content" }],
  ["relative", "@UUID[.abc]{rel}", { resolve: u => `JournalEntry.e.JournalEntryPage${u}` }],
  ["script", "<script>alert(1)</script><p>ok</p>", {}],
];

test("makeMemo equals sanitize on every sample; a repeat key does not recompute; a new key does; bounded", () => {
  let calls = 0;
  const counted = (...a) => { calls++; return core.sanitize(...a); };
  const memo = core.makeMemo(counted, 4);
  for (const [k, html, opts] of SAMPLES) assert.deepEqual(memo(k, html, opts), core.sanitize(html, opts), k);
  assert.equal(calls, SAMPLES.length);
  assert.ok(memo.size <= 4, `size ${memo.size}`);
  const last = SAMPLES.at(-1);
  memo(last[0], last[1], last[2]);
  assert.equal(calls, SAMPLES.length, "a repeat key is a hit");
  memo(`${last[0]}|2`, last[1], last[2]);
  assert.equal(calls, SAMPLES.length + 1, "a changed key recomputes");
  memo(null, "<p>x</p>");
  memo(null, "<p>x</p>");
  assert.equal(calls, SAMPLES.length + 3, "a null key is never cached");
  assert.equal(memo.misses, calls);
  assert.ok(memo.size <= 4);
});

test("needsItemRefresh", () => {
  assert.equal(core.needsItemRefresh(["entry", "image"]), false);
  assert.equal(core.needsItemRefresh(["entry", "item"]), true);
  assert.equal(core.needsItemRefresh([]), false);
  assert.equal(core.needsItemRefresh(undefined), false);
});

const F = await journalWorld();
const A = await import("../sources-adapter.mjs");

test("pageDescriptor: one sanitize per page per modification; a page without _stats is never cached", () => {
  const entry = makeDoc("JournalEntry", { id: "readable00000011", name: "Gate" });
  const page = makeDoc("JournalEntryPage", { id: "page000000000011", name: "P", type: "text", text: { content: "<p>a</p>" },
    _stats: { modifiedTime: 1 } }, { parent: entry });
  const before = A.sanitizeMemo.misses;
  const d1 = A.pageDescriptor(page, entry);
  const d2 = A.pageDescriptor(page, entry);
  assert.deepEqual(d1, d2);
  assert.equal(A.sanitizeMemo.misses - before, 1, "two refreshes, one sanitize");
  page.text.content = "<p>b</p>";
  page._stats.modifiedTime = 2;
  assert.equal(A.pageDescriptor(page, entry).body, "<p>b</p>");
  assert.equal(A.sanitizeMemo.misses - before, 2);
  const bare = makeDoc("JournalEntryPage", { id: "page000000000012", type: "text", text: { content: "<p>c</p>" } }, { parent: entry });
  A.pageDescriptor(bare, entry);
  A.pageDescriptor(bare, entry);
  assert.equal(A.sanitizeMemo.misses - before, 4);
});

test("journal-perf-3: itemDescriptor sanitizes once per item modification, identify flag and label; no modifiedTime, no cache", () => {
  const pile = makeDoc("Actor", { id: "pileActor0000003", name: "Crate", flags: { "item-piles": { data: { enabled: true } } } });
  const item = makeDoc("Item", { id: "item000000000003", name: "Lamp", img: "l.webp",
    system: { identified: true, description: { value: "<p>lit</p>" }, unidentified: { description: "<p>a lamp?</p>" } },
    _stats: { modifiedTime: 1 } }, { parent: pile });
  const src = { item, pile, pileName: "Crate" };
  const before = A.sanitizeMemo.misses;
  const d1 = A.itemDescriptor(src);
  const d2 = A.itemDescriptor(src);
  assert.deepEqual(d1, d2);
  assert.match(d1.body, /<p>lit<\/p>$/);
  assert.equal(A.sanitizeMemo.misses - before, 1, "two decorates, one sanitize");
  item.system.identified = false;
  assert.match(A.itemDescriptor(src).body, /<p>a lamp\?<\/p>$/, "the identify flag is part of the key");
  assert.equal(A.sanitizeMemo.misses - before, 2);
  item.system.identified = true;
  item.system.description.value = "<p>out</p>";
  item._stats.modifiedTime = 2;
  assert.match(A.itemDescriptor(src).body, /<p>out<\/p>$/);
  assert.equal(A.sanitizeMemo.misses - before, 3);
  const bare = makeDoc("Item", { id: "item000000000004", name: "Rope", img: "r.webp", system: { description: { value: "<p>r</p>" } } }, { parent: pile });
  A.itemDescriptor({ item: bare, pile, pileName: "Crate" });
  A.itemDescriptor({ item: bare, pile, pileName: "Crate" });
  assert.equal(A.sanitizeMemo.misses - before, 5, "an item without _stats is never cached");
});

/** A window root decorate() can work on: a footer slot, classList, and a counter of element reads. */
function fakeApp(document, extra = {}) {
  const kids = [];
  const root = Object.assign(Object.create(HTMLElement.prototype), {
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector: sel => (sel === ":scope > .pj-bar" ? kids.find(k => k.className === "pj-bar") ?? null : null),
    append: el => kids.push(el),
  });
  const app = { rendered: true, document, reads: 0, ...extra };
  Object.defineProperty(app, "element", { get() { app.reads++; return root; } });
  return app;
}

test("updateItem refreshes nothing while only entry bars are open, and the bars while an item bar is", async () => {
  globalThis.document = { createElement: () => ({ className: "", innerHTML: "", addEventListener() {}, remove() {} }) };
  await import("../journal.mjs");
  F.fire("init");
  F.fire("ready");
  for (let i = 0; i < 30; i++) await Promise.resolve();
  F.become({ userId: P1 });
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  const readable = makeDoc("JournalEntry", { id: "readable00000012", name: "Gate", ownership: { default: 2 } });
  Object.defineProperty(readable, "pages", { value: new StubCollection(), enumerable: false });
  const entryApp = Object.setPrototypeOf(fakeApp(readable), JES.prototype);
  F.foundry.applications.instances.set("e", entryApp);
  F.fire("renderJournalEntrySheet", entryApp, null, {}, {});
  const afterRender = entryApp.reads;
  F.fire("updateItem");
  mock.timers.tick(200);
  assert.equal(entryApp.reads, afterRender, "an entry bar never re-renders for an item update");

  const pile = makeDoc("Actor", { id: "pileActor0000002", name: "Chest", ownership: { default: 2 },
    flags: { "item-piles": { data: { enabled: true } } } });
  const item = makeDoc("Item", { id: "item000000000002", name: "Ring", img: "i.webp", system: { description: { value: "<p>r</p>" } } }, { parent: pile });
  Object.defineProperty(pile, "items", { value: new StubCollection([item]), enumerable: false });
  const itemApp = fakeApp(item);
  F.foundry.applications.instances.set("i", itemApp);
  F.fire("renderItemSheet5e", itemApp);
  const e0 = entryApp.reads;
  const i0 = itemApp.reads;
  F.fire("updateItem");
  mock.timers.tick(100);
  assert.equal(itemApp.reads, i0 + 1, "the item bar refreshes");
  assert.equal(entryApp.reads, e0 + 1, "one refresh pass over every bar");
  F.foundry.applications.instances.clear();
  F.become({ userId: GM });
});

test("savedStatus stops at the first saved source", async () => {
  const { hookRegistry } = await import("../lib/hooks.mjs");
  const { makeLog } = await import("../lib/log.mjs");
  const bar = await import("../bar.mjs");
  const log = makeLog("pentaryn-journal");
  const reg = hookRegistry("pentaryn-journal", log);
  const ctx = { log, reg, exposed: {}, expose(a) { Object.assign(ctx.exposed, a); } };
  bar.install(reg, ctx);
  F.become({ userId: P1 });
  try {
    const entry = makeDoc("JournalEntry", { id: "readable00000013", name: "Hall", ownership: { default: 2 } });
    const pages = [1, 2, 3].map(i => makeDoc("JournalEntryPage", { id: `page00000000001${i}`, name: `P${i}`, type: "text",
      sort: i, ownership: { default: 2 }, text: { content: `<p>${i}</p>` } }, { parent: entry }));
    Object.defineProperty(entry, "pages", { value: new StubCollection(pages), enumerable: false });
    const target = { kind: "entry", entry };
    const sources = A.descriptorsFor(target);
    assert.equal(sources.length, 3);
    const copy = { id: "copy000000000013", flags: { "pentaryn-journal": { source: { key: sources[0].key, hash: core.hashOf(sources[0]) } } } };
    const journalPages = [copy];
    let finds = 0;
    const find = journalPages.find;
    journalPages.find = function (...a) { finds++; return find.apply(this, a); };
    core.status(journalPages, sources);
    const byStatus = finds;
    finds = 0;
    const r = ctx.exposed.savedStatus(target, journalPages);
    assert.equal(r.st, "partial");
    assert.equal(r.saved, copy, "the first saved source's copy");
    assert.deepEqual(r.sources, sources);
    assert.equal(finds - byStatus, 1, "one scan after status(), not one per source");
  } finally {
    F.become({ userId: GM });
    bar.uninstall();
    reg.offAll();
  }
});

test("journal-perf-4: one refresh pass looks up the personal journal once, not once per open bar", async () => {
  const { hookRegistry } = await import("../lib/hooks.mjs");
  const { makeLog } = await import("../lib/log.mjs");
  const bar = await import("../bar.mjs");
  const log = makeLog("pentaryn-journal");
  const reg = hookRegistry("pentaryn-journal", log);
  let lookups = 0;
  const ctx = { log, reg, exposed: { personal: () => { lookups++; return null; } }, expose(a) { Object.assign(ctx.exposed, a); } };
  bar.install(reg, ctx);
  F.become({ userId: P1 });
  const JES = F.foundry.applications.sheets.journal.JournalEntrySheet;
  try {
    const apps = [1, 2, 3].map(i => {
      const entry = makeDoc("JournalEntry", { id: `readable0000002${i}`, name: `Hall ${i}`, ownership: { default: 2 } });
      const page = makeDoc("JournalEntryPage", { id: `page00000000002${i}`, name: "P", type: "text", sort: 1,
        ownership: { default: 2 }, text: { content: `<p>${i}</p>` } }, { parent: entry });
      Object.defineProperty(entry, "pages", { value: new StubCollection([page]), enumerable: false });
      const app = Object.setPrototypeOf(fakeApp(entry), JES.prototype);
      F.foundry.applications.instances.set(`perf4-${i}`, app);
      return app;
    });
    const reads = apps.map(a => a.reads);
    lookups = 0;
    ctx.exposed.refreshBars();
    mock.timers.tick(100);
    assert.deepEqual(apps.map(a => a.reads), reads.map(r => r + 1), "every open bar is redrawn");
    assert.equal(lookups, 1, "one personal() per refresh pass");
    lookups = 0;
    F.fire("renderJournalEntrySheet", apps[0], null, {}, {});
    assert.ok(lookups >= 1, "a render hook still looks the journal up itself");
  } finally {
    F.foundry.applications.instances.clear();
    F.become({ userId: GM });
    bar.uninstall();
    reg.offAll();
  }
});
