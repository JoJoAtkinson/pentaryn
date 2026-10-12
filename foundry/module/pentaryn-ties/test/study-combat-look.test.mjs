/**
 * ES-5: the once-per-round inspection mark finds the character's combatant in EVERY started combat,
 * not only the combat the client happens to be viewing (`game.combat`), and a second look in the
 * same round is marked — the "already looked this round" warning shows — but never refused
 * (track and mark, never hard-block).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
await bootWorld({
  actors: [{ id: PC, name: "ZZ Caven", type: "character" }, { id: NPC, name: "ZZ Brakka" }],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const cascade = await import("../study/cascade.mjs");

test("ES-5: a look in a started combat the client is not viewing is marked, and a second look that round warns but still runs", async () => {
  const warned = [];
  const warn = ui.notifications.warn;
  ui.notifications.warn = msg => void warned.push(msg);
  const pc = game.actors.get(PC);
  const npc = game.actors.get(NPC);
  // the character fights in a combat on another scene; this client views a different (or no) combat
  const fight = { id: "zzCombatFar00001", started: true, round: 2, combatants: [{ id: "zzCombatant00002", actorId: PC }] };
  const viewed = { id: "zzCombatHere0001", started: true, round: 1, combatants: [] };
  const idle = { id: "zzCombatIdle0001", started: false, round: 0, combatants: [{ id: "zzCombatant00003", actorId: PC }] };
  game.combats = [viewed, fight, idle];
  game.combat = viewed;
  try {
    assert.notEqual(await settle(game.pentaryn.ties.study.examine(pc, npc)), false, "the first look runs");
    assert.equal(cascade._sizes().inspected, 1, "the look is marked against the started combat the character is in");
    assert.deepEqual(warned, [], "the first look this round does not warn");

    assert.notEqual(await settle(game.pentaryn.ties.study.examine(pc, npc)), false, "a second look this round is not refused");
    assert.equal(warned.length, 1, "the second look this round warns once");
    assert.equal(warned[0], game.i18n.localize("PENTARYN_TIES.known.inspect.spentThisRound"));
  } finally {
    cascade.forgetCombat(fight.id);
    ui.notifications.warn = warn;
    game.combat = null;
    game.combats = undefined;
  }
});
