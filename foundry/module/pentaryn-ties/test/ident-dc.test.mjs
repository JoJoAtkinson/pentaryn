/**
 * M13 + EXT-9 (final review 2026-10-12, ties-study): three checks disagreed on whether a DC-less
 * identification row was missed, and the effective identification DC was computed at five sites.
 *
 * A derived attribute with no authored entry has no DC (describeAttribute's fallback carries none),
 * so a row on it has nothing to fail against. `pending` used `dc ?? Infinity` and so read every such
 * row as a failure and dropped it from the GM's list; `beliefs` said "no verdict"; the cascade's
 * held-rung prompt compared against NaN. Ruling: a DC-less identification row is never a miss.
 * `identDcOf(subject, attrId)` and `identRowMissed(rec, dc)` in study/resolve.mjs are the one answer.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "guild", title: "Salt Guild", category: "Guild", secret: true, dc: 10, skill: "inv", reveal: "<p>Guild hands.</p>" },
    ],
  },
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["guild", "ghost"], conceal: 3 } } },
  ],
});
const Resolve = await import("../study/resolve.mjs");
const Study = await import("../study.mjs");
const { identifiedKey } = await import("../core/ledgers.mjs");
const npc = () => game.actors.get(NPC);

test("M13+EXT-9: identDcOf is the entry's DC plus concealment, or null when no entry has a DC", () => {
  assert.equal(typeof Resolve.identDcOf, "function", "study/resolve.mjs exports identDcOf");
  assert.equal(Resolve.identDcOf(npc(), "guild"), 13, "authored DC 10 + concealment 3");
  assert.equal(Resolve.identDcOf(npc(), "ghost"), null, "no authored entry, no DC");
});

test("M13+EXT-9: identRowMissed is false with no DC or no numeric total", () => {
  assert.equal(typeof Resolve.identRowMissed, "function", "study/resolve.mjs exports identRowMissed");
  assert.equal(Resolve.identRowMissed({ total: 3 }, null), false, "nothing to fail against");
  assert.equal(Resolve.identRowMissed({ total: null }, 13), false, "a GM tell has no total");
  assert.equal(Resolve.identRowMissed({ total: Number.NaN }, 13), false);
  assert.equal(Resolve.identRowMissed({ total: 12 }, 13), true);
  assert.equal(Resolve.identRowMissed({ total: 13 }, 13), false, "meeting the DC passes");
});

test("M13+EXT-9: pending, beliefs and factStatus agree a DC-less identification row is not a miss", async () => {
  const row = total => ({ text: "", tier: null, total, when: 1, delivered: null });
  await npc().update({
    "flags.pentaryn-ties.beliefs": { [PC]: { [identifiedKey("ghost")]: row(3), [identifiedKey("guild")]: row(12) } },
  });

  const listed = Study.pending().filter(p => p.subjectId === NPC).map(p => p.beliefKey);
  assert.ok(listed.includes(identifiedKey("ghost")), "the DC-less empty row stays on the GM's pending list");
  assert.ok(!listed.includes(identifiedKey("guild")), "the authored row under its DC (12 < 13) is a parked failure");

  const views = Study.beliefs(npc());
  const ghost = views.find(v => v.factId === "#id" && v.total === 3);
  const guild = views.find(v => v.factId === "#id" && v.total === 12);
  assert.notEqual(ghost?.pass, false, "beliefs never tags the DC-less row missed");
  assert.equal(guild?.pass, false, "beliefs tags the authored row under DC + concealment missed");

  const status = Study.factStatus({ ns: "ident", subjectId: NPC, attrId: "guild" }, game.actors.get(PC));
  assert.equal(status.dc, Resolve.identDcOf(npc(), "guild"), "factStatus reports the same effective DC");
  assert.equal(Study.factStatus({ ns: "ident", subjectId: NPC, attrId: "ghost" }, game.actors.get(PC)).dc, null);
});
