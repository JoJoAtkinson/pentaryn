// The seams the migration cuts into lookup-core (guide steps 3-4). Each table is first pinned
// against the ORACLE — today's inline code, pasted into test/fixtures/legacy-monsters.mjs — and the
// extracted core functions are then asserted equal to it, so a pure move cannot drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../lookup-core.mjs";
import * as oracle from "./fixtures/legacy-monsters.mjs";
import { manifestOf } from "./kit/harness.mjs";

const CR_INPUTS = ["1/4", 0.25, "3", 3, "", null, undefined, "x", " 1 / 2 ", "1/8"];
const CR_WANT = [0.25, 0.25, 3, 3, null, null, null, null, 0.5, 0.125];

const QUERIES = [
  {}, { cr: "1/2-2" }, { cr: 3 }, { cr: "1/4", minCr: 1 }, { maxCr: 1 }, { size: "Large" }, { size: "weird" },
  { type: "CONSTRUCT" }, { name: "GOB" }, { limit: 999 }, { limit: 0 }, { limit: 1 }, { limit: "7" },
  { packs: ["a.b"] }, { cr: "" }, { cr: null }, { cr: "x" }, { cr: "1/2 - 3" },
];

const BOSS = { type: "npc", name: "Goblin Boss", system: { details: { cr: 1, type: { value: "fey" } }, traits: { size: "sm" } } };
const ENTRIES = [
  BOSS,
  { ...BOSS, type: "character" },
  { type: "npc", name: "No CR", system: { details: {}, traits: { size: "med" } } },
  { type: "npc", name: "Shield Guardian", system: { details: { cr: 7, type: { value: "construct" } }, traits: { size: "lg" } } },
];

const SORT_INPUT = () => [{ name: "B", cr: 1 }, { name: "A", cr: 1 }, { name: "C", cr: 0.25 }, { name: "D" }];
const rows = n => Array.from({ length: n }, (_, i) => ({ name: `M${i}`, cr: i }));

test("oracle: crNum over the guide's table", () => {
  assert.deepEqual(CR_INPUTS.map(oracle.crNum), CR_WANT);
});

test("oracle: monsterQuery over the guide's table", () => {
  assert.deepEqual([oracle.monsterQuery({ cr: "1/2-2" }).lo, oracle.monsterQuery({ cr: "1/2-2" }).hi], [0.5, 2]);
  assert.deepEqual([oracle.monsterQuery({ cr: 3 }).lo, oracle.monsterQuery({ cr: 3 }).hi], [3, 3]);
  assert.deepEqual([oracle.monsterQuery({ cr: "1/4", minCr: 1 }).lo, oracle.monsterQuery({ cr: "1/4", minCr: 1 }).hi], [1, 0.25]);
  assert.equal(oracle.monsterQuery({ size: "Large" }).size, "lg");
  assert.equal(oracle.monsterQuery({ size: "weird" }).size, "weird");
  assert.equal(oracle.monsterQuery({ limit: 999 }).limit, 200);
  assert.equal(oracle.monsterQuery({}).limit, 40);
  assert.equal(oracle.monsterQuery({ limit: 0 }).limit, 40);
});

test("oracle: matchMonster over the guide's table", () => {
  const q = over => ({ ...oracle.monsterQuery({}), ...over });
  assert.equal(oracle.matchMonster(BOSS, q({ type: "fey" })), true);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ type: "FEY" })), true);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ size: "med" })), false);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ name: "boss" })), true);
  assert.equal(oracle.matchMonster({ ...BOSS, type: "character" }, oracle.monsterQuery({})), false);
});

test("oracle: sortMonsters keeps the NaN fall-through, pageMonsters hints the rest", () => {
  assert.deepEqual(oracle.sortMonsters(SORT_INPUT()).map(r => r.name), ["C", "A", "B", "D"]);
  const page = oracle.pageMonsters(rows(45), 40);
  assert.equal(page.shown, 40);
  assert.match(page.hint, /5 more/);
});


// ── step 3: the extracted core equals the oracle ─────────────────────────────

test("core.crNum and SIZE_KEYS equal the oracle", () => {
  assert.deepEqual(CR_INPUTS.map(core.crNum), CR_INPUTS.map(oracle.crNum));
  assert.deepEqual(core.SIZE_KEYS, oracle.SIZE_KEYS);
});

test("core.monsterQuery equals the oracle over the query table", () => {
  for (const q of QUERIES) assert.deepEqual(core.monsterQuery(q), oracle.monsterQuery(q), JSON.stringify(q));
  assert.deepEqual(core.monsterQuery(), oracle.monsterQuery());
});

test("core.matchMonster equals the oracle over entries × queries", () => {
  const queries = [...QUERIES, { type: "FEY" }, { size: "med" }, { name: "boss" }, { cr: "5-8", size: "large", type: "construct" }];
  for (const e of ENTRIES) {
    for (const q of queries) {
      const parsed = oracle.monsterQuery(q);
      assert.equal(core.matchMonster(e, parsed), oracle.matchMonster(e, parsed), `${e.name} ${JSON.stringify(q)}`);
    }
  }
});

test("core.sortMonsters and pageMonsters equal the oracle (NaN CR order kept)", () => {
  assert.deepEqual(core.sortMonsters(SORT_INPUT()), oracle.sortMonsters(SORT_INPUT()));
  for (const [n, limit] of [[45, 40], [40, 40], [0, 40], [3, 1]]) {
    assert.deepEqual(core.pageMonsters(rows(n), limit), oracle.pageMonsters(rows(n), limit), `${n}/${limit}`);
  }
});

test("core.monsterRow builds today's row; a missing index uuid falls back to the actor uuid", () => {
  const e = { _id: "x1", name: "Goblin", system: { details: { cr: 0.25, type: { value: "humanoid", subtype: "goblinoid" } }, traits: { size: "sm" } } };
  assert.deepEqual(core.monsterRow(e, "p.a"),
    { name: "Goblin", cr: 0.25, size: "sm", type: "humanoid (goblinoid)", uuid: "Compendium.p.a.Actor.x1", pack: "p.a" });
  assert.equal(core.monsterRow({ ...e, uuid: "U" }, "p.a").uuid, "U");
  assert.equal(core.monsterRow({ ...e, system: { details: { type: { value: "fey" } } } }, "p.a").type, "fey");
});

test("VERSION === module.json version; ids agree", () => {
  const manifest = manifestOf(new URL("..", import.meta.url));
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.equal(core.NS, "rules");
  assert.equal(core.CONTRACT, `${core.MODULE}/api@1`);
  assert.deepEqual(core.HOOKS, {});
  assert.ok(Object.isFrozen(core.HOOKS));
});

test("listFor: registry injected, identifier lower-cased, a throw is null (and reported)", () => {
  const reg = { spellLists: { forType: (t, i) => (t === "class" && i === "wizard" ? "L" : null) } };
  assert.equal(core.listFor(reg, "class", "Wizard"), "L");
  assert.equal(core.listFor(reg, "class", "nope"), null);
  assert.equal(core.listFor({}, "class", "x"), null);
  const seen = [];
  assert.equal(core.listFor(undefined, "class", "x", err => seen.push(err.name)), null);
  assert.deepEqual(seen, ["TypeError"]);
});

test("knownLists: every option value", () => {
  assert.deepEqual(core.knownLists({ spellLists: { options: [{ value: "class:wizard" }, { value: "class:cleric" }] } }),
    ["class:wizard", "class:cleric"]);
});

test("resolveBookIds and missingPackError keep today's answers", () => {
  assert.equal(core.resolveBookIds(), core.BOOKSETS.rules);
  assert.equal(core.resolveBookIds("2014"), core.BOOKSETS["2014"]);
  assert.equal(core.resolveBookIds("bogus"), core.BOOKSETS.rules);
  assert.deepEqual(core.resolveBookIds(["a.b"]), ["a.b"]);
  assert.deepEqual(core.missingPackError(["a.b", "c.d"]),
    { error: "compendium pack(s) not found: a.b, c.d — is the module enabled in Manage Modules?" });
});

test("BOOKSETS.all is rules then monsters, in order (EXT-1)", () => {
  assert.deepEqual(core.BOOKSETS.all, [...core.BOOKSETS.rules, ...core.BOOKSETS.monsters]);
  // "2014" is an integer-like key, so JS enumerates it first whatever the literal order.
  assert.deepEqual(Object.keys(core.BOOKSETS), ["2014", "rules", "monsters", "all"]);
});

test("tidy closes the spaces enriched roll text leaves", () => {
  assert.equal(core.tidy("+4 , reach 5 ft . Two ( 2 ) attacks"), "+4, reach 5 ft. Two (2) attacks");
});

// ── step 4: the plain-data seams the adapter feeds (prompts-lookup-1, -5 move halves) ──

test("foundFromDoc: a JournalEntryPage renders exactly as today's inline object did", () => {
  const f = core.foundFromDoc({ documentName: "JournalEntryPage", id: "g", name: "Cover", html: "<p>Half cover</p>",
    pack: "p.c", parent: { id: "d", name: "Combat" }, packLabel: "PHB" });
  assert.deepEqual(core.renderPage(f),
    { book: "PHB", journal: "Combat", page: "Cover", uuid: "Compendium.p.c.JournalEntry.d.JournalEntryPage.g", text: "Half cover" });
});

test("foundFromDoc: a parentless JournalEntry stands as its own journal, with empty text", () => {
  const out = core.renderPage(core.foundFromDoc({ documentName: "JournalEntry", id: "d", name: "Combat", html: "", pack: "p.c", parent: null }));
  assert.equal(out.text, "");
  assert.equal(out.journal, out.page);
  assert.equal(out.book, "p.c");
  assert.equal("edition" in out, false);
});

test("foundFromDoc: a non-page uuid is echoed verbatim, never a fabricated page uuid (LKM-11)", () => {
  for (const [documentName, uuid] of [["JournalEntry", "Compendium.p.c.JournalEntry.d"], ["Actor", "Compendium.p.a.Actor.x"],
                                      ["Item", "Compendium.p.i.Item.y"]]) {
    const f = core.foundFromDoc({ documentName, uuid, id: uuid.split(".").pop(), name: "N", html: "", pack: "p.c", parent: null });
    assert.equal(core.renderPage(f).uuid, uuid, documentName);
    assert.equal(core.renderPage(f, { raw: true }).uuid, uuid, `${documentName} raw`);
  }
  // a page still answers its canonical pageUuid(), whatever the caller passed
  const pg = core.foundFromDoc({ documentName: "JournalEntryPage", uuid: "Compendium.p.c.JournalEntryPage.g", id: "g", name: "G",
    html: "", pack: "p.c", parent: { id: "d", name: "D" } });
  assert.equal(core.renderPage(pg).uuid, "Compendium.p.c.JournalEntry.d.JournalEntryPage.g");
});

test("foundFromDoc: the 2014 pack's edition comes from EDITIONS", () => {
  const out = core.renderPage(core.foundFromDoc({ id: "g", name: "G", html: "x", pack: "dnd5e.rules", parent: { id: "d", name: "D" }, packLabel: "SRD" }));
  assert.equal(out.edition, "2014");
});

// [declared] DL5 (step 12): each page also carries its stripped `text`, computed once per load.
test("toBook: the plain-book shape with each page's text, pages iterated with for…of (a Set has no .length)", () => {
  assert.deepEqual(
    core.toBook("p", "L", undefined, [{ id: "d", name: "D", pages: new Set([{ id: "g", name: "G", text: { content: "<p>a</p>" } }, { id: "h", name: "H", text: null }]) }]),
    { id: "p", label: "L", edition: undefined, docs: [{ id: "d", name: "D", pages: [{ id: "g", name: "G", html: "<p>a</p>", text: "a" }, { id: "h", name: "H", html: "", text: "" }] }] });
});

// ── DL5: a page's precomputed text answers exactly as stripping it per call did ──

test("searchBooks and renderPage: books with precomputed text equal the same books without", async () => {
  const { BOOKS } = await import("./fixtures/books.mjs");
  const BOOKS_T = BOOKS.map(b => ({ ...b, docs: b.docs.map(d => ({ ...d, pages: d.pages.map(p => ({ ...p, text: core.toPlainText(p.html) })) })) }));
  for (const q of ["cover", "half cover", "Study", "attack", "nothing-here", "a.b"]) {
    for (const o of [{}, { limit: 20 }, { snippet: 600 }, { regex: true }]) {
      assert.deepEqual(core.searchBooks(BOOKS_T, q, o), core.searchBooks(BOOKS, q, o), `${q} ${JSON.stringify(o)}`);
    }
  }
  assert.deepEqual(core.renderPage(core.findPage(BOOKS_T, "Study"), { maxChars: 50, offset: 10 }),
    core.renderPage(core.findPage(BOOKS, "Study"), { maxChars: 50, offset: 10 }));
});

// ── DL3: the registry guard (prompts-lookup-4) ──

test("knownLists: a missing registry or spellLists is [], a throwing one is [] and reported", () => {
  assert.deepEqual(core.knownLists(undefined), []);
  assert.deepEqual(core.knownLists({}), []);
  assert.deepEqual(core.knownLists({ spellLists: {} }), []);
  const seen = [];
  const throwing = { spellLists: { get options() { throw new Error("moved"); } } };
  assert.deepEqual(core.knownLists(throwing, err => seen.push(err.message)), []);
  assert.deepEqual(seen, ["moved"]);
});

// ── DL4: a non-page UUID says so (prompts-lookup-5, warning half) ──

test("nonPageWarning: none for a page; the documented text for any other kind", () => {
  assert.equal(core.nonPageWarning("Compendium.p.c.JournalEntry.d.JournalEntryPage.g", "JournalEntryPage"), null);
  assert.equal(core.nonPageWarning("Compendium.p.c.JournalEntry.d", "JournalEntry"),
    "Compendium.p.c.JournalEntry.d is a JournalEntry, not a JournalEntryPage — pass a page UUID from search()");
  assert.match(core.nonPageWarning("Compendium.p.a.Actor.x", "Actor"), /is a Actor, not a JournalEntryPage/);
});
