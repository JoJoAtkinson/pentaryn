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

// Micro-benchmark, deterministic half (items-journal-7): count slug reads instead of timing them, so
// the test never flakes. The old lookup read up to every world actor per entry; the index reads each
// actor once per run, and picks the same actor for every entry. Wall-clock curve: node test/bench.mjs.
test("one slug read per world actor per run, not one per actor per entry; same picks as the scan", () => {
  const world = Array.from({ length: 200 }, (_, i) => actor(`w${i}`, i % 3 ? `s${i % 50}` : undefined));
  const entries = Array.from({ length: 40 }, (_, j) => (j % 4 ? `s${j}` : `new${j}`));
  let scanReads = 0, indexReads = 0;
  const slugOf = count => a => (count(), a.flags.pentaryn?.slug);
  const scanned = entries.map(s => world.find(a => slugOf(() => scanReads++)(a) === s));
  const index = indexBySlug(world, slugOf(() => indexReads++));
  assert.equal(indexReads, world.length);
  assert.ok(scanReads > 10 * indexReads, `scan read ${scanReads} slugs, the index ${indexReads}`);
  assert.deepEqual(entries.map(s => index.get(s)), scanned);
});
