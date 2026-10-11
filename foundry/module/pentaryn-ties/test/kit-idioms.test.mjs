/**
 * Guide S5 — the kit idioms that replaced hand-rolled copies, each pinned at the module's own call
 * sites: flag reads (readFlag), visibility (canSee), the HTML escaper, and the logger.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const F = await bootWorld({ importEntry: false });
const Known = await import("../known.mjs");
const Attributes = await import("../attributes.mjs");
const Study = await import("../study.mjs");

const doc = (flags, extra = {}) => ({ id: "zzActor000000001", name: "ZZ", type: "npc", flags: { "pentaryn-ties": flags }, items: [], ...extra });

test("S5 flags: the module's readers read flags data and never throw (readFlag)", () => {
  const known = [{ id: "zzNpc00000000009", name: "Goblin", category: "beasts", notes: "", when: 5 }];
  const a = doc({ known, attributes: ["guild"], studied: { kind: { k: { when: 1 } } } });
  assert.equal(Known.readKnown(a).length, 1);
  assert.deepEqual(Attributes.attributeIdsOf(a).filter(x => !x.includes(":")), ["guild"]);
  assert.deepEqual(Object.keys(Study.studiedOf(a).kind), ["k"]);
  // a doc with no flags at all, a key that is absent, and null
  for (const d of [{ id: "x" }, doc({}), null]) {
    assert.deepEqual(Known.readKnown(d), []);
    assert.deepEqual(Study.beliefsOf(d), {});
  }
  // a doc whose getFlag throws: the data is still read, nothing escapes
  const throwing = doc({ known }, { getFlag: () => { throw new Error("inactive scope"); } });
  assert.equal(Known.readKnown(throwing).length, 1);
});

test("S5 flags: no file outside lib/ calls getFlag on its own scope through a try/catch copy", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  const hits = sourceScan(new URL("..", import.meta.url), /const (flagOf|rawFlag) = \(doc, key\) => \{|try \{ return doc\?\.getFlag/);
  assert.deepEqual(hits, []);
});

test("S5 canSee: one rule (ties-adapter) — GM sees all; a player needs isVisible; visible is only a fallback", async () => {
  const { canSee } = await import("../ties-adapter.mjs");
  const gm = game.user;
  assert.equal(canSee({ isVisible: false }), true, "GM");
  assert.equal(canSee(null), false, "null, GM");
  game.user = { id: "zzPlayer", isGM: false };
  try {
    assert.equal(canSee({ isVisible: false }), false);
    assert.equal(canSee({ isVisible: true }), true);
    assert.equal(canSee({ visible: true }), true, "visible without isVisible");
    assert.equal(canSee({ isVisible: false, visible: true }), false, "isVisible wins over the PIXI flag");
    assert.equal(canSee(null), false);
    assert.equal(canSee({}), false);
  } finally {
    game.user = gm;
  }
});

test("S5 canSee: no other file defines its own copy", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  const hits = sourceScan(new URL("..", import.meta.url), /isVisible \?\? \w+\.visible/).filter(h => h.file !== "ties-adapter.mjs");
  assert.deepEqual(hits, []);
});

test("S5 esc: core/html.mjs equals the copy each file carried at the checkpoint (byte for byte)", async () => {
  const { esc } = await import("../core/html.mjs");
  // the verbatim line from authoring, attributes-ui, editor, lore, known, tie-dialog, worn and study
  const legacy = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  assert.equal(esc(`<a href="x">'&"</a>`), "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&quot;&lt;/a&gt;");
  for (const v of [`<a href="x">'&"</a>`, null, undefined, 0, "plain", "&amp;", ["a", "<b>"], { toString: () => "<o>" }]) {
    assert.equal(esc(v), legacy(v), String(v));
  }
});

test("S5 esc: no file outside core/ defines the &#39; escaper again", async () => {
  const { sourceScan } = await import("./kit/harness.mjs");
  assert.deepEqual(sourceScan(new URL("..", import.meta.url), /"&#39;"/).filter(h => !h.file.startsWith("core/")), []);
});

test("S5 / C24: no empty or comment-only catch in the module's own code", async () => {
  const { sourceFiles } = await import("./kit/harness.mjs");
  const { readFileSync } = await import("node:fs");
  const root = new URL("..", import.meta.url);
  const hits = [];
  for (const rel of sourceFiles(root)) {
    const src = readFileSync(new URL(rel, root), "utf8");
    for (const m of src.matchAll(/catch(?:\s*\([^)]*\))?\s*\{(\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)?\s*)\}/g)) hits.push(`${rel}: ${m[0].slice(0, 40)}`);
  }
  assert.deepEqual(hits, []);
});

test("S5 log.swallow: a failing read returns the site's own fallback and logs only at debug", async () => {
  const { makeLog } = await import("../lib/log.mjs");
  const lines = [];
  const log = makeLog("pentaryn-ties", { console: { debug: (...a) => lines.push(a[0]), warn() {}, error() {}, info() {} } });
  const boom = () => { throw new Error("unborn"); };
  assert.deepEqual(log.swallow("x", boom, {}), {});
  assert.equal(log.swallow("x", boom, "raw"), "raw");
  assert.equal(lines.length, 0, "debug off: silent");
  CONFIG.debug ??= {};
  CONFIG.debug["pentaryn-ties"] = true;
  try {
    assert.equal(log.swallow("preview: advantageStacking unreadable", boom, "raw"), "raw");
    assert.deepEqual(lines, ["pentaryn-ties | preview: advantageStacking unreadable"]);
  } finally {
    delete CONFIG.debug["pentaryn-ties"];
  }
});
