// API characterisation (guide step 2): every published method over a fixed input table, pinned in
// golden/legacy-api.json against today's unchanged code. Later steps must leave the golden as is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { characterise } from "./kit/harness.mjs";
import { enrichStub, installLookupWorld } from "./fixtures/packs.mjs";
import { BOOKSETS } from "../lookup-core.mjs";

const F = await installFoundry({ modules: ["pentaryn-lookup"] });
const world = installLookupWorld(F);
await import("../pentaryn-lookup.mjs");
const quiet = console.log;
console.log = () => {};
F.fire("ready");
console.log = quiet;
const rules = game.pentaryn.rules;

const PAGE_UUID = "Compendium.dnd-players-handbook.content.JournalEntry.docGloss.JournalEntryPage.pgStudy";
const ENTRY_UUID = "Compendium.dnd-players-handbook.content.JournalEntry.docGloss";

/** Run `fn` with a temporary global swap, restored afterwards. */
async function withSwap(apply, fn) {
  const undo = apply();
  try {
    return await fn();
  } finally {
    undo();
  }
}
const setEnrich = impl => () => {
  const ux = F.foundry.applications.ux.TextEditor.implementation;
  const saved = ux.enrichHTML;
  ux.enrichHTML = impl;
  return () => { ux.enrichHTML = saved; };
};

const CASES = {
  "search cover": () => rules.search("cover"),
  "search cover limit 20": () => rules.search("cover", { limit: 20 }),
  "search a.b regex": () => rules.search("a.b", { regex: true }),
  "search nothing-here": () => rules.search("nothing-here"),
  "search cover books=monsters (all packs missing)": () => rules.search("cover", { books: "monsters" }),
  "search cover books=2014 (missing)": () => rules.search("cover", { books: "2014" }),
  "search cover books=[content24]": () => rules.search("cover", { books: ["dnd5e.content24"] }),
  "page empty": () => rules.page(""),
  "page Study": () => rules.page("Study"),
  "page Study maxChars 50 offset 10": () => rules.page("Study", { maxChars: 50, offset: 10 }),
  "page nope": () => rules.page("No Such Page"),
  "page by page uuid": () => rules.page(PAGE_UUID),
  "page by JournalEntry uuid (warning since DL4)": () => rules.page(ENTRY_UUID),
  "page Compendium.x.y (fromUuid null)": () => rules.page("Compendium.x.y"),
  "page Compendium.x.y (fromUuid rejects)": () => withSwap(() => {
    const saved = globalThis.fromUuid;
    globalThis.fromUuid = async () => { throw new Error("boom"); };
    return () => { globalThis.fromUuid = saved; };
  }, () => rules.page("Compendium.x.y")),
  "page Artifacts (embedded tables, one missing)": () => rules.page("Artifacts"),
  "page Artifacts tables:false": () => rules.page("Artifacts", { tables: false }),
  "page Artifacts raw": () => rules.page("Artifacts", { raw: true }),
  "page No Text (text null)": () => rules.page("No Text"),
  "monster empty": () => rules.monster(""),
  "monster goblin": () => rules.monster("goblin"),
  "monster gob (substring fallback)": () => rules.monster("gob"),
  "monster Goblin Boss text": () => rules.monster("Goblin Boss", { text: true }),
  "monster Goblin Boss text, enrichHTML throws (raw text kept)": () =>
    withSwap(setEnrich(async () => { throw new Error("enrich failed"); }), () => rules.monster("Goblin Boss", { text: true })),
  "monster Goblin text": () => rules.monster("Goblin", { text: true }),
  "monster zzz": () => rules.monster("zzz"),
  "monsters {}": () => rules.monsters({}),
  "monsters cr 1/2-2": () => rules.monsters({ cr: "1/2-2" }),
  "monsters size Large type CONSTRUCT": () => rules.monsters({ size: "Large", type: "CONSTRUCT" }),
  "monsters limit 1": () => rules.monsters({ limit: 1 }),
  "monsters cr 1/4 minCr 1": () => rules.monsters({ cr: "1/4", minCr: 1 }),
  "monsters maxCr 1 name gob": () => rules.monsters({ maxCr: 1, name: "GOB" }),
  "monsters cr 3": () => rules.monsters({ cr: 3 }),
  "monsters size weird": () => rules.monsters({ size: "weird" }),
  "monsters packs [srd]": () => rules.monsters({ packs: ["dnd5e.actors24", "no.such"] }),
  "names()": () => rules.names(),
  "names subclass": () => rules.names("subclass"),
  "names Race": () => rules.names("Race"),
  "names bogus": () => rules.names("bogus"),
  "onList Fireball wizard": () => rules.onList("Fireball", "wizard"),
  "onList Fireball Wizard (case)": () => rules.onList("Fireball", "Wizard"),
  "onList Fireball cleric": () => rules.onList("Fireball", "cleric"),
  "onList Fireball nope": () => rules.onList("Fireball", "nope"),
  "onList Nope wizard": () => rules.onList("Nope", "wizard"),
  "onList by spell uuid": () => rules.onList("Compendium.dnd-players-handbook.spells.Item.spFireball", "wizard"),
  "spellList wizard": () => rules.spellList("wizard"),
  "spellList wizard level 3": () => rules.spellList("wizard", { level: 3 }),
  "spellList nope": () => rules.spellList("nope"),
  "packs()": () => rules.packs(),
  "toPlainText": () => rules.toPlainText("<p>a &amp; b</p>"),
};

test("legacy API over the input table (golden/legacy-api.json)", async () => {
  const rows = await characterise("legacy-api", label => CASES[label](), Object.keys(CASES), { file: import.meta.url });
  // spot checks that the fixture really drives the paths the table is named for
  const out = Object.fromEntries(rows.map(r => [r.input[0], r.out ?? r]));
  assert.equal(out["search cover books=monsters (all packs missing)"].error.startsWith("compendium pack(s) not found"), true);
  assert.deepEqual(out["page Compendium.x.y (fromUuid rejects)"], { error: "no document at Compendium.x.y" });
  assert.equal(out["monster zzz"].notFound, true);
  assert.equal(out["onList Fireball wizard"].onList, true);
  assert.equal(out["onList Fireball nope"].onList, null);
});

test("selftest() against the stub: { ok, passed, failed, labels } pinned", async () => {
  await characterise("legacy-selftest", async () => {
    const r = await rules.selftest();
    return { ok: r.ok, passed: r.passed, failed: r.failed, labels: r.checks.map(c => c.label) };
  }, [[]], { file: import.meta.url });
});

test("monster(…, {text}) hands enrichHTML the item's roll data, relativeTo and secrets", async () => {
  world.enrichCalls.length = 0;
  await rules.monster("Goblin Boss", { text: true });
  assert.equal(world.enrichCalls.length, 3);
  assert.deepEqual(world.enrichCalls[0].rollData, { item: "Redirect Attack" });
  assert.deepEqual(world.enrichCalls[1].rollData, { actor: "Goblin Boss" });   // no item getRollData → the actor's
  assert.equal(world.enrichCalls[0].secrets, true);
  assert.equal(world.enrichCalls[0].relativeTo.name, "Redirect Attack");
});

// prompts-lookup-1, flipped by guide step 12 [declared] DL5 (was KNOWN: "search calls getDocuments()
// on every call (no book cache today)"): books are cached per session, one getDocuments() per present
// pack; uninstall() clears the cache.
test("prompts-lookup-1 [declared DL5]: after uninstall() clears the cache, two searches read each present rules pack once", async () => {
  rules.uninstall();
  const present = BOOKSETS.rules.filter(id => world.packs.has(id));
  const before = present.map(id => world.packs.get(id).calls.getDocuments);
  const first = await rules.search("cover");
  const second = await rules.search("cover");
  assert.deepEqual(second, first);
  assert.deepEqual(present.map((id, i) => world.packs.get(id).calls.getDocuments - before[i]), present.map(() => 1));
});

// prompts-lookup-4, flipped by guide step 13 [declared] DL3 (was KNOWN: "onList with dnd5e.registry
// undefined rejects TypeError"): the missing registry is the documented "no such list" answer.
test("prompts-lookup-4 [declared DL3]: onList with dnd5e.registry undefined answers onList: null, known: none", async () => {
  const saved = globalThis.dnd5e;
  globalThis.dnd5e = { registry: undefined };
  try {
    assert.deepEqual(await rules.onList("Fireball", "wizard"), {
      spell: "Fireball", uuid: "Compendium.dnd-players-handbook.spells.Item.spFireball", level: 3,
      list: "class:wizard", onList: null, hint: "no such list; known: ",
    });
  } finally {
    globalThis.dnd5e = saved;
  }
});

test("enrichStub fixture sanity", async () => {
  assert.equal(await enrichStub()("[[/attack]]", {}), "+4");
});

// review/lookup R1: README promises "a miss is an answer object …, never a throw", and api-manifest
// marks every opts/q param optional — so null must answer exactly as an omitted argument does.
test("null opts answers exactly as omitted opts (README: never a throw)", async () => {
  const pairs = [
    [() => rules.search("cover", null), () => rules.search("cover")],
    [() => rules.page("Study", null), () => rules.page("Study")],
    [() => rules.page(PAGE_UUID, null), () => rules.page(PAGE_UUID)],
    [() => rules.monster("Goblin", null), () => rules.monster("Goblin")],
    [() => rules.monsters(null), () => rules.monsters()],
    [() => rules.onList("Fireball", "wizard", null), () => rules.onList("Fireball", "wizard")],
    [() => rules.spellList("wizard", null), () => rules.spellList("wizard")],
  ];
  for (const [withNull, omitted] of pairs) assert.deepEqual(await withNull(), await omitted());
});
