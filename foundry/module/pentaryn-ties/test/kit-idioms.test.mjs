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
