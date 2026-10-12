/**
 * rob-5 (final review 2026-10-12, ties-study): `applyInspect` checked that the inspector existed,
 * was owned by the sender and could reach the subject — but never that it was a character sheet,
 * unlike `applyStudy`. A relayed payload naming an NPC as the inspector ran the whole cascade for it:
 * ledger rows written under the NPC's id, grants handed to an NPC. It now refuses with the same
 * sentence `applyStudy` uses. Fresh world so no other file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const NPC_A = "zzNpc00000000001";
const NPC_B = "zzNpc00000000002";

await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "kin", title: "Kin", category: "People", secret: true, dc: 30, skill: "ins", reveal: "<p>One of us.</p>", whenKnown: "enables", whenCarried: "auto" },
    ],
  },
  actors: [
    { id: NPC_A, name: "ZZ Brakka", type: "npc", flags: { "pentaryn-ties": { attributes: ["kin"] } } },
    { id: NPC_B, name: "ZZ Vell", type: "npc", flags: { "pentaryn-ties": { attributes: ["kin"] } } },
  ],
});
const { applyInspect } = await import("../study/cascade.mjs");

test("rob-5: applyInspect refuses an inspector that is not a character sheet, and writes nothing", async () => {
  const ok = await settle(applyInspect({ characterId: NPC_A, subjectId: NPC_B }, game.user.id));
  assert.equal(ok, false, "refused");
  assert.equal(game.actors.get(NPC_B).flags["pentaryn-ties"]?.beliefs?.[NPC_A], undefined, "no ledger rows under the NPC's id");
  assert.equal(game.actors.get(NPC_A).flags["pentaryn-ties"]?.granted, undefined, "no grant to the NPC");
});
