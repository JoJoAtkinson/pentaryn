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
