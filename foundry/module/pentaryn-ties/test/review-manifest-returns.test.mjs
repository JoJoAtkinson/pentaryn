/**
 * ext-8 [declared] (final review ties-core, 2026-10-12; defect wave 2): the manifest's `returns`
 * strings say what the call answers. Five had drifted — attributes.search answered an object, not
 * `[record]`; attributes.stale rows, not bare Actors; attributes.tell `{ ok, ids }`, never a
 * Promise of `{ ok, reason? }` alone; attributes.unreviewed a summary row, not the entry; and
 * known.categories carries `seeded`. Each row's text is pinned here and checked against what the
 * live call returns. (`noLore` in the reason table is M10's, pinned in
 * review-mark-learned-contract.test.mjs.) Standalone world; the describe golden carries the text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzExt8Pc00000001";
const NPC = "zzExt8Npc0000001";

await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "guild", title: "Salt Guild", category: "Guild" },
      { id: "cell", title: "Dock Cell", category: "Guild", parent: "guild" },
    ],
  },
  actors: [
    { id: PC, name: "ZZ Ext8 PC", type: "character", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } },
    // carries the child without its parent: a stale carrier of "cell"
    { id: NPC, name: "ZZ Ext8 NPC", type: "npc", flags: { "pentaryn-ties": { attributes: ["cell"] } } },
  ],
});
const T = () => game.pentaryn.ties;
const { MANIFEST } = await import("../api-manifest.mjs");
const returnsOf = path => MANIFEST.rows.find(r => r.path === path)?.returns;
/** The field names a `{ a, b, c }` returns string lists, in order. */
const fieldsOf = s => s.replace(/^[[{\s]+|[\]}\s]+$/g, "").split(",").map(f => f.trim());

const WANT = {
  "attributes.search": "{ matches, wouldBe, canCreate, collidesWith }",
  "attributes.stale": "[{ actor, extra, missing }]",
  "attributes.tell": "{ ok, ids } | { ok: false, reason }",
  "attributes.unreviewed": "[{ id, title, reviewState, touched, modifiedAt, createdAt }]",
  "known.categories": "[{ key, label, seeded }]",
};

test("ext-8: the five drifted returns strings say what the call answers", () => {
  for (const [path, want] of Object.entries(WANT)) assert.equal(returnsOf(path), want, path);
});

test("ext-8: attributes.search answers the object its returns names", () => {
  assert.deepEqual(Object.keys(T().attributes.search("salt")), fieldsOf(WANT["attributes.search"]));
});

test("ext-8: attributes.stale answers rows of { actor, extra, missing }", () => {
  const rows = T().attributes.stale("cell");
  assert.equal(rows.length, 1);
  assert.deepEqual(Object.keys(rows[0]), fieldsOf(WANT["attributes.stale"]));
  assert.equal(rows[0].actor.id, NPC);
});

test("ext-8: attributes.unreviewed answers summary rows, not entries", () => {
  const rows = T().attributes.unreviewed();
  assert.ok(rows.length >= 1);
  for (const r of rows) assert.deepEqual(Object.keys(r), fieldsOf(WANT["attributes.unreviewed"]));
});

test("ext-8: known.categories rows carry key, label and seeded", () => {
  const rows = T().known.categories(PC);
  assert.ok(rows.length >= 1);
  for (const r of rows) assert.deepEqual(Object.keys(r), fieldsOf(WANT["known.categories"]));
});

test("ext-8: attributes.tell answers { ok, ids }, or { ok: false, reason }", async () => {
  const ok = await T().attributes.tell(game.actors.get(PC), "cell", { withParents: true });
  assert.deepEqual(Object.keys(ok), ["ok", "ids"]);
  assert.equal(ok.ok, true);
  assert.deepEqual(await T().attributes.tell(game.actors.get(PC), "nope"), { ok: false, reason: "notFound" });
});
