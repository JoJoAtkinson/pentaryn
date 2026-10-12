/**
 * EXT-1 (final review 2026-10-12, ties-study): the hold prompt's meta line is picked by the
 * fact's namespace. Only a kind has a tier, so only a kind prints "Tier {tier} on a total of
 * {total}"; a lore row and an attribute fact print "{fact} — DC {dc}, rolled {total}". Before the
 * fix an attribute fact took the kind line and read "Tier null on a total of 15". A row with no
 * roll behind it (an auto kind, a GM tell) prints its total as "—", never "null". Fresh world so
 * no other file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";

const F = await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      {
        id: "guild",
        title: "The Guild",
        category: "Guild",
        dc: 14,
        skill: "his",
        reveal: "<p>Guild hands.</p>",
        miss: "",
        lore: [{ id: "g2", label: "Held oath", dc: 10, skill: "rel", text: "<p>Second oath.</p>", miss: "", hold: true }],
      },
    ],
  },
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" } } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { kindOf: KIND, attributes: ["guild"] } } },
  ],
});
const { resolveFact } = await import("../study/resolve.mjs");
const { putBelief } = await import("../study/apply.mjs");
const { promptDeliver } = await import("../study/gate.mjs");

/** The meta line of the hold prompt the GM sees for this held row ("Later" is answered). */
async function holdMeta(fact, record) {
  await settle(putBelief(fact, PC, record)); // the attr plane confirms its write (AC-2)
  const mark = F.calls.length;
  F.dialogs.push(false);
  await promptDeliver(game.actors.get(PC), fact);
  const dialog = F.calls.slice(mark).find(c => c.op === "DialogV2.confirm");
  assert.ok(dialog, "the hold prompt opened");
  return dialog.content.match(/<p class="pt-study-hold-meta">(.*?)<\/p>/)[1];
}

test("EXT-1: an attribute fact's hold prompt names the fact, DC and total, not 'Tier null'", async () => {
  const fact = resolveFact({ ns: "attr", subjectId: NPC, attrId: "guild", factId: "g2" });
  const meta = await holdMeta(fact, { total: 15, tier: null, pass: true, text: "<p>Second oath.</p>", at: 1 });
  assert.doesNotMatch(meta, /null/);
  assert.equal(meta, "The Guild — Held oath — DC 10, rolled 15");
});

test("EXT-1: a held auto kind (no roll) prints its total as '—', not 'null'", async () => {
  const fact = resolveFact({ ns: "kind", subjectId: NPC });
  const meta = await holdMeta(fact, { total: null, tier: 25, pass: true, text: "<p>Ghouls.</p>", at: 1 });
  assert.doesNotMatch(meta, /null/);
  assert.match(meta, /^Tier 25 on a total of —\./);
});

test("EXT-1: a rolled kind still prints its tier and total", async () => {
  const fact = resolveFact({ ns: "kind", subjectId: NPC });
  const meta = await holdMeta(fact, { total: 17, tier: 15, pass: true, text: "<p>Ghouls.</p>", at: 1 });
  assert.match(meta, /^Tier 15 on a total of 17\./);
});
