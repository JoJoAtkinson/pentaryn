// Core characterisation (guide step 2). lookup-core is imported FIRST and bare — no Foundry globals
// are installed in this file — which is the purity proof.
import * as core from "../lookup-core.mjs";
import {
  toPlainText, searchBooks, findPage, renderPage, monsterDigest,
  pageUuid, actorUuid, snippetAround, capPayload, LIMITS, embeddedTableUuids, renderTable,
} from "../lookup-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BOOKS, PAGES, MONSTER_OK, MONSTER_MOVED } from "./fixtures/books.mjs";

test("lookup-core loads with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(globalThis[g], undefined, g);
});

test("every export the legacy suite imports exists", () => {
  for (const name of [
    "toPlainText", "searchBooks", "findPage", "renderPage", "monsterDigest", "pageUuid", "actorUuid",
    "snippetAround", "capPayload", "embeddedTableUuids", "renderTable",
  ]) assert.equal(typeof core[name], "function", name);
  assert.equal(typeof core.LIMITS, "object");
});

// prompts-lookup-28 (lookup half): lookup's toPlainText and prompts' stripHtml do the same job under
// different contracts. The same seven inputs live in prompts' suite with ITS outputs; each module pins
// its own, so unifying them is a deliberate diff, never a drive-by "fix".
const HTML_TABLE = [
  ["<p>a</p><p>b</p>", "a b"],
  ["@UUID[Compendium.x]{Cover}", "Cover"],
  ["&amp;Reference[prone]", "prone"],
  ["[[/r 2d6]]", "r 2d6"],
  ["A &mdash; B &#39;c&#39;", "A — B 'c'"],
  ["<script>x</script>y", "y"],
  ["@Embed[Compendium.p.RollTable.t rollable]{T}", "@Embed[Compendium.p.RollTable.t rollable]{T}"],
];

test("prompts-lookup-28: toPlainText over the shared HTML-to-text table", () => {
  assert.deepEqual(HTML_TABLE.map(([html]) => core.toPlainText(html)), HTML_TABLE.map(([, want]) => want));
});

test("toPlainText: non-strings and empty give the empty string", () => {
  for (const v of [undefined, null, 0, {}, ""]) assert.equal(core.toPlainText(v), "");
});

// ── the fixture suite (guide step 10: converted from the self-running test/legacy-core.mjs) ──
// Everything asserted here fails SILENTLY in production if it regresses: enricher noise just makes
// snippets worse, a NaN serializes to null, an over-large payload is truncated by the transport.
// None of it throws. That is the whole reason these cases exist.

const eq = (actual, expected, what = "") => assert.deepStrictEqual(actual, expected, what || undefined);
const ok = (cond, what) => assert.ok(cond, what || "expected truthy");
const has = (hay, needle) => assert.ok(String(hay).includes(needle),
  `expected to contain ${JSON.stringify(needle)}, got ${JSON.stringify(String(hay).slice(0, 200))}`);
const lacks = (hay, needle) => assert.ok(!String(hay).includes(needle),
  `expected NOT to contain ${JSON.stringify(needle)}, got ${JSON.stringify(String(hay).slice(0, 200))}`);

// ── toPlainText: the enricher traps ──────────────────────────────────────────
test("enrichers: @UUID[...]{Label} keeps only the label", () => {
  const s = toPlainText(PAGES.enrichers);
  has(s, "explained in Combat later");
  lacks(s, "@UUID[");
  lacks(s, "Compendium.dnd-players-handbook");
});

test("enrichers: bare @UUID[...] is dropped entirely", () => {
  const s = toPlainText(PAGES.enrichers);
  lacks(s, "Compendium.x");
  has(s, "for more");
});

test("enrichers: &Reference[x] degrades to its text", () => {
  has(toPlainText(PAGES.enrichers), "Half Cover");
});

test("enrichers: inline rolls degrade to readable words", () => {
  const s = toPlainText(PAGES.enrichers);
  has(s, "save dex 15");
  lacks(s, "[[");
});

test("enrichers: HTML-escaped ampersand form is handled", () => {
  const s = toPlainText(PAGES.escapedAmp);
  has(s, "three-quarters cover");
  lacks(s, "Reference[");
  lacks(s, "&amp;");
});

test("enrichers: an UNKNOWN enricher degrades to its text, never to nothing", () => {
  const s = toPlainText(`<p>a &Newthing[important words]{shown} b</p>`);
  has(s, "shown");
  const bare = toPlainText(`<p>a &Newthing[important words] b</p>`);
  has(bare, "important words");
});

// ── toPlainText: HTML ────────────────────────────────────────────────────────
test("blocks become spaces, not joined words", () => {
  const s = toPlainText(PAGES.blocks);
  has(s, "sentence one sentence two");
  lacks(s, "onesentence");
});

test("entities decode, including numeric", () => {
  const s = toPlainText(PAGES.entities);
  has(s, '"natural"');
  has(s, "—");
  has(s, "&"); // &amp; -> &
  has(s, "5°");
  lacks(s, "&nbsp;");
});

test("nested tags flatten cleanly", () => {
  eq(toPlainText(PAGES.nested), "Bold and italic and a link .");
});

test("script and style contents are removed", () => {
  const s = toPlainText(PAGES.scripty);
  has(s, "before");
  has(s, "after");
  lacks(s, "not a tag");
  lacks(s, "color:red");
});

test("empty and non-string input is safe", () => {
  eq(toPlainText(""), "");
  eq(toPlainText(null), "");
  eq(toPlainText(undefined), "");
  eq(toPlainText(42), "");
});

// ── uuids ────────────────────────────────────────────────────────────────────
test("pageUuid builds the pasteable form", () => {
  eq(pageUuid("p.c", "d1", "pg1"), "Compendium.p.c.JournalEntry.d1.JournalEntryPage.pg1");
});
test("actorUuid builds the pasteable form", () => {
  eq(actorUuid("mm.actors", "a1"), "Compendium.mm.actors.Actor.a1");
});

// ── snippets ─────────────────────────────────────────────────────────────────
test("short text is returned whole, unelided", () => {
  eq(snippetAround("short text", 0, 240), "short text");
});

test("a match at the start is not cut off before it", () => {
  const text = toPlainText(PAGES.matchAtStart);
  const s = snippetAround(text, text.search(/grappled/i), 100);
  has(s.toLowerCase(), "grappled");
});

test("a match at the end is reached", () => {
  const text = toPlainText(PAGES.matchAtEnd);
  const s = snippetAround(text, text.search(/grappled/i), 100);
  has(s.toLowerCase(), "grappled");
});

// ── search ───────────────────────────────────────────────────────────────────
test("search finds matches and reports a total", () => {
  const r = searchBooks(BOOKS, "cover");
  ok(r.total > 0, "expected hits");
  ok(r.hits.length > 0);
});

test("search yields ONE hit per page however many times it matches", () => {
  const r = searchBooks(BOOKS, "cover", { limit: 20 });
  const repeated = r.hits.filter(h => h.page === "Repeated Cover");
  eq(repeated.length, 1, "repeated page should collapse to one hit: ");
  ok(repeated[0].matches >= 3, `expected matches>=3, got ${repeated[0].matches}`);
});

test("search snippets carry no enricher noise", () => {
  const r = searchBooks(BOOKS, "cover", { limit: 20 });
  for (const h of r.hits) {
    lacks(h.snippet, "@UUID[");
    lacks(h.snippet, "[[");
    lacks(h.snippet, "Compendium.");
  }
});

test("every hit carries a pasteable uuid", () => {
  for (const h of searchBooks(BOOKS, "cover", { limit: 20 }).hits)
    ok(h.uuid.startsWith("Compendium."), `bad uuid ${h.uuid}`);
});

test("2014 hits are stamped so they cannot masquerade as current", () => {
  const r = searchBooks(BOOKS, "half cover", { limit: 20 });
  const old = r.hits.find(h => h.book.includes("2014"));
  ok(old, "expected a 2014 hit in the fixture");
  eq(old.edition, "2014");
  ok(!r.hits.filter(h => !h.book.includes("2014")).some(h => h.edition),
     "2024 hits must not carry an edition stamp");
});

test("search defaults to 5 hits and says how many it withheld", () => {
  const r = searchBooks(BOOKS, "the");
  ok(r.hits.length <= LIMITS.hits, `got ${r.hits.length}`);
  if (r.total > r.hits.length) has(r.note, "Narrow the query");
});

test("limit is honoured and hard-capped", () => {
  eq(searchBooks(BOOKS, "cover", { limit: 1 }).hits.length, 1);
  ok(searchBooks(BOOKS, "the", { limit: 9999 }).hits.length <= LIMITS.hitsMax);
});

test("snippet width is honoured and hard-capped", () => {
  const narrow = searchBooks(BOOKS, "grappled", { snippet: 60 }).hits[0];
  ok(narrow.snippet.length <= 60 + 4, `got ${narrow.snippet.length}`);
});

test("an empty query is a loud error, not empty results", () => {
  has(searchBooks(BOOKS, "").error, "non-empty");
  has(searchBooks(BOOKS, "   ").error, "non-empty");
});

test("a regex-special query is escaped, not exploded", () => {
  const r = searchBooks(BOOKS, "cover (");
  ok(!r.error, `should not error: ${r.error}`);
  eq(r.total, 0);
});

test("search is case-insensitive", () => {
  ok(searchBooks(BOOKS, "COVER").total > 0);
  ok(searchBooks(BOOKS, "CoVeR").total > 0);
});

test("a page with no text never produces a hit", () => {
  ok(!searchBooks(BOOKS, "cover", { limit: 20 }).hits.some(h => h.page === "Empty Page"));
});

// ── payload capping ──────────────────────────────────────────────────────────
test("an over-large payload is capped and says so", () => {
  const fat = { query: "x", total: 9, shown: 9,
                hits: Array.from({ length: 9 }, (_, i) => ({ i, snippet: "y".repeat(2000) })) };
  const c = capPayload(fat, 4096);
  ok(JSON.stringify(c).length <= 4096, `still ${JSON.stringify(c).length} bytes`);
  eq(c.truncated, true);
  has(c.note, "capped");
});

test("capping keeps at least one hit rather than returning nothing", () => {
  const fat = { query: "x", total: 1, shown: 1, hits: [{ snippet: "y".repeat(50000) }] };
  eq(capPayload(fat, 100).hits.length, 1);
});

// ── page lookup ──────────────────────────────────────────────────────────────
test("page() finds an exact name", () => {
  const r = renderPage(findPage(BOOKS, "Study"));
  has(r.text, "Study action");
  eq(r.page, "Study");
  ok(r.uuid.startsWith("Compendium."));
});

test("page() is case-insensitive and falls back to substring", () => {
  eq(renderPage(findPage(BOOKS, "study")).page, "Study");
  eq(renderPage(findPage(BOOKS, "Rules Gloss")).page ?? null, null); // journal name, not a page
  ok(renderPage(findPage(BOOKS, "Grappl")).page.startsWith("Grappl"));
});

test("an exact match wins over a substring match", () => {
  eq(renderPage(findPage(BOOKS, "Cover")).page, "Cover");
});

test("a miss returns suggestions, never undefined", () => {
  const r = findPage(BOOKS, "Stuffy");
  eq(r.notFound, true);
  ok(Array.isArray(r.closest));
  ok(r.hint.length > 0);
});

test("page() text is capped with an offset to continue", () => {
  const r = renderPage(findPage(BOOKS, "Long Page"), { maxChars: 500 });
  eq(r.text.length, 500);
  eq(r.truncated, true);
  ok(r.totalChars > 500);
  eq(r.nextOffset, 500);
  const next = renderPage(findPage(BOOKS, "Long Page"), { maxChars: 500, offset: 500 });
  ok(next.text !== r.text, "offset should advance the window");
});

test("page({raw}) returns the original enricher-laden HTML", () => {
  const r = renderPage(findPage(BOOKS, "Cover"), { raw: true });
  has(r.raw, "@UUID[");
  ok(!r.text, "raw mode should not also send stripped text");
});

test("page() stamps the edition on 2014 content", () => {
  const found = findPage([BOOKS[1]], "Cover");
  eq(renderPage(found).edition, "2014");
});

// ── monsters ─────────────────────────────────────────────────────────────────
test("monsterDigest reads the dnd5e 6.0.6 paths (prepared actor.system; unchanged from 5.3.3)", () => {
  const d = monsterDigest(MONSTER_OK);
  eq(d.cr, 1); eq(d.ac, 15); eq(d.hp, 7);
  eq(d.type, "humanoid"); eq(d.size, "sm");
  eq(d.features.length, 2);
  eq(d.uuid, "Compendium.test-mm.actors.Actor.actGoblin");
  ok(!d.warning, "clean data should not warn");
});

test("monsterDigest WARNS when a data path has moved instead of emitting nulls", () => {
  const d = monsterDigest(MONSTER_MOVED);
  ok(d.warning, "expected a warning");
  has(d.warning, "system.details.cr");
  has(d.warning, "system.attributes.hp.max");
});

test("monsterDigest falls back to ac.flat when ac.value is absent", () => {
  const d = monsterDigest({ ...MONSTER_OK,
    system: { ...MONSTER_OK.system, attributes: { ac: { flat: 12 }, hp: { max: 7 } } } });
  eq(d.ac, 12);
});

test("monsterDigest on nothing is notFound, not a crash", () => {
  eq(monsterDigest(null).notFound, true);
});

// ── report ───────────────────────────────────────────────────────────────────
// ── embedded roll tables ──
test("embeddedTableUuids finds RollTable embeds only, once each", () => {
  const html = `<p>@Embed[Compendium.dmg.content.JournalEntry.a.JournalEntryPage.b caption=false]</p>
    @Embed[Compendium.dmg.tables.RollTable.minor rollable] @Embed[Compendium.dmg.tables.RollTable.major rollable]
    @Embed[Compendium.dmg.tables.RollTable.minor rollable]`;
  eq(embeddedTableUuids(html), ["Compendium.dmg.tables.RollTable.minor", "Compendium.dmg.tables.RollTable.major"]);
});
test("renderTable prints ranges and stripped text", () => {
  const r = renderTable({ name: "Minor", formula: "1d100", uuid: "u", results: [
    { range: [1, 20], description: "<p>You can speak @UUID[x]{Abyssal}.</p>" }, { range: [21, 21], name: "Single" }] });
  eq(r.rows, ["1-20 You can speak Abyssal.", "21 Single"]);
  eq(r.formula, "1d100");
});
