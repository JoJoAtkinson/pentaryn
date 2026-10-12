/**
 * AC-4 (final review 2026-10-12, ties-study): a late claim can roll a fact a second time.
 *
 * Two GM sessions of one account both handle a study request. Session A stakes, wins, rolls and
 * writes the finished belief record. Session B's stake is slow and lands *after* that record: the
 * update merges `{ claim, when }` into the finished row, B reads its own claim back, wins, and rolls
 * the fact again over A's answer. readBack now refuses a row that already carries a finished record,
 * and the loser hands its stray stake back so the record is not left reading as a roll in flight.
 * Fresh world so no other file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const LORE = `lore:${NPC}:l1`;
const DONE = { text: "<p>Owes.</p>", tier: null, total: 17, when: 1, delivered: null, claim: null, sources: null, pass: true };

const F = await bootWorld({
  importEntry: false,
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>", miss: "", hold: true }],
          beliefs: { [PC]: { [LORE]: { ...DONE } } },
        },
      },
    },
  ],
});
const { claimFact } = await import("../study/claim.mjs");
const row = () => game.actors.get(NPC).flags["pentaryn-ties"].beliefs[PC][LORE];

test("AC-4: a late claim stake on a finished record loses, so the fact is never rolled a second time", async () => {
  const ledger = game.actors.get(NPC);
  const won = await settle(claimFact({ ns: "lore", ledger, beliefKey: LORE }, PC, 2));
  assert.equal(won, false, "the late session must not win the roll");
  assert.equal(row().claim, null, "the loser hands its stray stake back");
  for (const k of ["text", "total", "delivered", "pass"]) assert.deepEqual(row()[k], DONE[k], `the record's ${k} is untouched`);
  assert.ok(F.calls.every(c => c.op !== "rollSkill"), "no dice were thrown");
});
