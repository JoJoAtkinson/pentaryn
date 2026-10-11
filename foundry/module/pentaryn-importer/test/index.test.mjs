// indexBySlug (items-journal-7): the per-run slug index that replaced one game.actors scan per manifest
// entry. First actor wins (Array.find's choice), falsy slugs are skipped. The end-to-end effect —
// a duplicate slug in one manifest is created then updated — is pinned by write.test's full import.
import { test } from "node:test";
import assert from "node:assert/strict";
import { indexBySlug } from "../importer-core.mjs";

const actor = (id, slug) => ({ id, flags: slug === undefined ? {} : { pentaryn: { slug } } });

test("the audit's fixture: first wins, no undefined key, one entry", () => {
  const index = indexBySlug([actor("1", "a"), actor("2", "a"), actor("3")]);
  assert.equal(index.get("a").id, "1");
  assert.equal(index.has(undefined), false);
  assert.equal(index.size, 1);
});

test("falsy slugs are skipped; a number slug never matches its string", () => {
  const index = indexBySlug([actor("1", ""), actor("2", null), actor("3", 0), actor("4", 5), { id: "5" }, actor("6", "b")]);
  assert.deepEqual([...index.keys()], [5, "b"]);
  assert.equal(index.get("5"), undefined);
});

test("any iterable of actors (a Foundry Collection yields values) and a custom slug reader", () => {
  const collection = new Map([["x", actor("x", "a")], ["y", actor("y", "c")]]);
  const values = { [Symbol.iterator]: () => collection.values() };
  assert.deepEqual([...indexBySlug(values).keys()], ["a", "c"]);
  assert.equal(indexBySlug([{ id: "1", s: "q" }], a => a.s).get("q").id, "1");
});
