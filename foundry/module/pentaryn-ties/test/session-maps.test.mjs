/**
 * ties-31: the session-lifetime maps are pruned. A deleted combat takes its per-round inspection
 * marks; a deleted actor takes its Known "show hidden" toggle, the Attributes tab's open rows,
 * toggled branches and filter, and its lore editor's open rows. The one-inspection-per-round rule
 * still holds inside a live combat.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

import { settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const F = await bootWorld({
  actors: [{ id: PC, name: "ZZ Caven", type: "character" }, { id: NPC, name: "ZZ Brakka" }],
  tokens: [{ id: "zzTokPc000000001", actorId: PC }, { id: "zzTokNpc00000001", actorId: NPC }],
});
const cascade = await import("../study/cascade.mjs");
const attrs = await import("../attributes-ui.mjs");
const lore = await import("../lore-ui.mjs");
const known = await import("../known-ui.mjs");

test("deleteCombat prunes that combat's inspection marks, and only that combat's; the round rule still holds", async () => {
  const pc = game.actors.get(PC);
  Object.defineProperty(pc, "inCombat", { value: true, configurable: true });
  const combat = { id: "zzCombat00000001", started: true, round: 1, combatants: [{ id: "zzCombatant00001", actorId: PC }], previous: {} };
  game.combat = combat;
  await settle(game.pentaryn.ties.study.examine(pc, game.actors.get(NPC)));
  assert.equal(cascade._sizes().inspected, 1, "one mark for this combatant this round");
  assert.equal(await game.pentaryn.ties.study.examine(pc, game.actors.get(NPC)), false, "a second inspection this round is refused");
  cascade.forgetCombat("zzOtherCombat001");
  assert.equal(cascade._sizes().inspected, 1, "another combat's delete leaves it");
  F.fire("deleteCombat", combat);
  assert.equal(cascade._sizes().inspected, 0, "deleteCombat prunes it");
  game.combat = null;
});

test("deleteActor drops the actor's cosmetic state in every map", () => {
  attrs.forgetAttributesActor("zzPc000000000001");
  lore.forgetLoreKey("lore:zzPc000000000001");
  known.forgetKnownActor("zzPc000000000001");
  F.fire("deleteActor", { id: "zzPc000000000001" });
  assert.deepEqual(attrs._sizes(), { expanded: 0, worldToggled: 0, worldFilter: 0 });
  assert.equal(lore._sizes().open, 0);
  assert.deepEqual(known._sizes(), { expanded: 0, shownHidden: 0 });
});

test("ties-ui-EXT-2: every SHEET_TABS row owns its forget(actorId), and deleteActor loops over the rows", async () => {
  const { SHEET_TABS } = await import("../sheet.mjs");
  assert.ok(Array.isArray(SHEET_TABS), "SHEET_TABS is exported for the sweep to be checked");
  for (const spec of SHEET_TABS) assert.equal(typeof spec.forget, "function", `${spec.id} has forget`);
  const seen = [];
  const saved = SHEET_TABS.map(spec => spec.forget);
  SHEET_TABS.forEach((spec, i) => { spec.forget = id => { seen.push([spec.id, id]); saved[i](id); }; });
  try {
    F.fire("deleteActor", { id: NPC });
  } finally {
    SHEET_TABS.forEach((spec, i) => { spec.forget = saved[i]; });
  }
  assert.deepEqual(seen, SHEET_TABS.map(spec => [spec.id, NPC]));
  assert.deepEqual(F.hookErrors ?? [], []);
});
