/**
 * ties-29: the blind roll's private-API dependency is asked before the claim, and a throw after the
 * claim hands it back. (The declared B4 pin covers the missing-API case end to end.)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>" }] } } },
  ],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const Apply = await import("../study/apply.mjs");
const Study = await import("../study.mjs");
const get = id => game.actors.get(id);

test("rollModeBlind maps BLIND through core's map, and names the missing API when it is gone", () => {
  const keep = foundry.dice.Roll._mapLegacyRollMode;
  foundry.dice.Roll._mapLegacyRollMode = m => `mapped:${m}`;
  assert.equal(Apply.rollModeBlind(), `mapped:${CONST.DICE_ROLL_MODES.BLIND}`);
  delete foundry.dice.Roll._mapLegacyRollMode;
  assert.throws(() => Apply.rollModeBlind(), /_mapLegacyRollMode is missing/);
  foundry.dice.Roll._mapLegacyRollMode = keep;
});

test("a roll that throws after the claim releases it: the error surfaces, the fact is studyable again", async () => {
  const pc = get(PC);
  const roll = pc.rollSkill;
  pc.rollSkill = async () => {
    throw new Error("zz dice tray exploded");
  };
  await assert.rejects(settle(Study.studyAs(pc, get(NPC), { loreId: "l1" })), /dice tray exploded/);
  pc.rollSkill = roll;
  assert.equal(Study.beliefsOf(get(NPC))[PC]?.[`lore:${NPC}:l1`] ?? null, null, "no claim row left");
  F.rolls.push(18);
  assert.equal(await settle(Study.studyAs(pc, get(NPC), { loreId: "l1" })), true);
});
