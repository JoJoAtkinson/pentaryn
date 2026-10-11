/**
 * ties-37 field-drop guards (tests only, characterisation). A field the clamp/store literals do
 * not name is erased registry-wide (attributes) or on the next keystroke (Known) — these fail the
 * moment an edit drops one. Keep MAX and RAW maximal when a field is added. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ATTR_CONTENT_FIELDS, ATTR_REVIEW_FIELDS, SNAPSHOT_FIELDS,
  clampAttribute, readRegistry, readKnown, toStoredKnown
} from "../known-core.mjs";

/** A maximal valid registry entry: every field set to a value the clamp keeps. */
const MAX = {
  id: "ashfallcompany",
  title: "Ashfall Company",
  category: "Faction",
  icon: "icons/zz/ashfall.webp",
  whenKnown: "advantage",
  whenCarried: "auto",
  secret: true,
  parent: "greywatch",
  dc: 14,
  skill: "his",
  reveal: "<p>Mercenaries.</p>",
  miss: "<p>A sigil.</p>",
  hold: true,
  lore: [{ id: "l1", label: "Origins", dc: 12, skill: "arc", text: "<p>Fire.</p>", miss: "<p>Ash.</p>", hold: false }],
  source: { blob: "abcdef1", path: "world/factions/ashfall.md" },
  bonuses: [],
  createdAt: 1700000000000,
  modifiedAt: 1700000100000,
  reviewedAt: 1700000200000,
  touched: ["title", "dc"],
  reviewedSnapshot: { title: "Ashfall Company", dc: 14, lore: [] }
};

/** A maximal raw Known entry. */
const RAW = { id: "zzNpc00000000001", name: "ZZ Brakka", category: "sentient", notes: "Owes us.", imposter: 1700000000000, hidden: true, when: 1700000300000 };

test("(a) clampAttribute names every content and review field, plus id and bonuses", () => {
  const keys = Object.keys(clampAttribute(MAX));
  for (const k of [...ATTR_CONTENT_FIELDS, ...ATTR_REVIEW_FIELDS, "id", "bonuses"]) assert.ok(keys.includes(k), `clampAttribute drops ${k}`);
});

test("(a') MAX survives the clamp with every value kept", () => {
  assert.deepEqual(clampAttribute(MAX), MAX);
});

test("(b) clampAttribute and readRegistry are idempotent on MAX", () => {
  const once = clampAttribute(MAX);
  assert.deepEqual(clampAttribute(once), once);
  const reg = readRegistry([MAX]);
  assert.deepEqual(readRegistry(reg), reg);
});

test("(c) a Known entry round-trips store → read → store with every key, imposter and hidden included", () => {
  const stored = toStoredKnown([RAW]);
  const again = toStoredKnown(readKnown(stored, { resolve: () => null }));
  assert.deepEqual(Object.keys(again[0]).sort(), Object.keys(stored[0]).sort());
  assert.deepEqual(again, stored);
  assert.equal(again[0].imposter, RAW.imposter);
  assert.equal(again[0].hidden, true);
});

test("(d) SNAPSHOT_FIELDS ⊆ ATTR_CONTENT_FIELDS (holds on today's code)", () => {
  for (const k of SNAPSHOT_FIELDS) assert.ok(ATTR_CONTENT_FIELDS.includes(k), k);
});
