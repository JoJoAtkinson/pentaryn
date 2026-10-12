// lang-switch (final review 2026-10-12, exceptions C35): lang/en.json shipped but nothing read it — every
// player-visible string came from the inline STRINGS table, so a translation (or a fix to the English
// file) never reached the table. [declared] The strings now go through Foundry's `_loc` with full-key
// literals: what the lang file says is what the sheet and the toasts show.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceFiles } from "./kit/harness.mjs";
import { attunementWorld, addItem, makeActor, MOD } from "./fixtures/world.mjs";
import { domEvent, installDocument, sheetElement } from "./fixtures/dom.mjs";

const ROOT = new URL("..", import.meta.url);
const LANG = JSON.parse(readFileSync(new URL("lang/en.json", ROOT), "utf8")).PENTARYN_ATTUNEMENT;

const F = await attunementWorld();
installDocument();
await import("../attunement.mjs");

// A stand-in translation: every module string marked, placeholders kept.
for (const [k, v] of Object.entries(LANG)) F.game.i18n.translations[`PENTARYN_ATTUNEMENT.${k}`] = `«xx» ${v}`;

const slotsOf = strip => strip.children.find(c => c.tagName === "UL").children;
const findIn = (el, pred) => {
  if (pred(el)) return el;
  for (const c of el.children) {
    const hit = findIn(c, pred);
    if (hit) return hit;
  }
  return null;
};

test("lang-switch: the strip's over-limit note and away tooltip read the lang file", () => {
  const actor = makeActor(F, {
    id: "actorLang0000001", name: "Talo Vesk", attunement: { value: 1, max: 1 },
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff", img: "s.webp" }], slots: ["away:k1"] } },
    items: [{ id: "itemLangRing0001", name: "Ring", system: { attunement: "required", attuned: true } }],
  });
  actor.isOwner = true;
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  const strip = dom.sidebar.children.find(c => c.classList.contains("pentaryn-attunement"));
  const note = findIn(strip, el => el.classList?.contains?.("over-cap-note"));
  assert.equal(note?.textContent, "«xx» 1 over the limit");
  assert.match(slotsOf(strip)[0].dataset.tooltip, /<p>«xx» Still attuned, but not on Talo\./);
});

test("lang-switch: a drop of an item that needs no attunement warns in the lang file's words", async () => {
  const actor = makeActor(F, { id: "actorLang0000002", name: "Hat Owner", attunement: { value: 0, max: 3 } });
  actor.isOwner = true;
  const plain = addItem(F, actor, { id: "itemLangHat00001", name: "Plain Hat", system: { attunement: "" } });
  const dom = sheetElement();
  F.fire("renderBaseActorSheet", { actor, isEditable: true }, dom.root);
  const strip = dom.sidebar.children.find(c => c.classList.contains("pentaryn-attunement"));
  F.foundry.applications.ux = { TextEditor: { implementation: { getDragEventData: () => ({ type: "Item" }) } } };
  globalThis.Item = { implementation: { fromDropData: async () => plain } };
  const from = F.calls.length;
  await strip.listeners.drop[0](domEvent(slotsOf(strip)[0]));
  assert.deepEqual(F.calls.slice(from).filter(c => c.op === "notify").map(c => c.message),
    ["«xx» Plain Hat does not require attunement."]);
});

const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\'"`])\/\/[^\n]*/g, "$1");
const sources = () => sourceFiles(ROOT).map(rel => [rel, stripComments(readFileSync(new URL(rel, ROOT), "utf8"))]);

const placeholders = key => [...LANG[key].matchAll(/\{(\w+)\}/g)].map(x => x[1]);
const dataKeys = data => new Set([...(data ?? "").matchAll(/(\w+)\s*[:,}]/g)].map(x => x[1]));

// Foundry's localize prints "undefined" for a placeholder missing from data, where t() kept `{n}`.
test("lang-switch: no inline string table; every key is a full literal in lang/en.json and gets every placeholder", () => {
  const seen = new Set();
  for (const [rel, src] of sources()) {
    assert.ok(!/\bSTRINGS\b|(?<![\w.])t\(\s*["'`\w]/.test(src), `${rel} still routes strings through t()/STRINGS`);
    for (const [, key, data] of src.matchAll(/_loc\(\s*"PENTARYN_ATTUNEMENT\.(\w+)"\s*(?:,\s*(\{[^}]*\}))?/g)) {
      seen.add(key);
      assert.ok(key in LANG, `${rel}: PENTARYN_ATTUNEMENT.${key} is not in lang/en.json`);
      const given = dataKeys(data);
      for (const ph of placeholders(key)) assert.ok(given.has(ph), `${rel}: ${key} is missing {${ph}}`);
    }
    // The one variable key: warnOverCap's callers pass the full key, and its data covers both strings.
    const warn = /_loc\(key, (\{[^}]*\})\)/.exec(src);
    for (const [, key] of src.matchAll(/warnOverCap\([^)]*"PENTARYN_ATTUNEMENT\.(\w+)"/g)) {
      seen.add(key);
      assert.ok(key in LANG && warn, `${rel}: warnOverCap key ${key}`);
      for (const ph of placeholders(key)) assert.ok(dataKeys(warn[1]).has(ph), `${rel}: warnOverCap misses {${ph}} for ${key}`);
    }
    for (const m of src.matchAll(/_loc\(\s*([^"\s])/g)) assert.ok(rel === "bonds.mjs" && src.startsWith("_loc(key, {", m.index), `${rel}: a _loc key must be a full literal`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(LANG).sort(), "every lang key is used by a literal");
});
