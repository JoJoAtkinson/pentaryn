/**
 * Final review (ties-ui-E1): the playerAccess kill switch covers the pinned cards a player left on
 * their browser. README: player tools work "only while **playerAccess** is on". The stored pins are
 * not touched while access is off; they come back once it is on again.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PLAYER = "zzPlayerUser0001";

const F = await bootWorld({
  user: { id: PLAYER, name: "ZZ Player", isGM: false },
  users: [{ id: "zzGmUser00000001", name: "ZZ GM", isGM: true, active: true }],
  settings: {
    "pentaryn-ties.playerAccess": false,
    "pentaryn-ties.pinnedCards": [{ sourceId: PC, tieId: NPC, x: 40, y: 60 }],
  },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      ownership: { default: 0, [PLAYER]: 3 },
      flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", notes: "Owes forty.", stance: -1, strength: 4 }] } },
    },
    { id: NPC, name: "ZZ Brakka", ownership: { default: 1 } },
  ],
});
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const cardCount = () => [...(document.getElementById("pentaryn-ties-cards")?.children ?? [])].filter(c => c.classList.contains("pt-card")).length;

test("restorePinned: a player's pinned cards stay down while playerAccess is off", async () => {
  await flush();
  assert.equal(cardCount(), 0, "no pinned card mounts while the kill switch is off");
  assert.equal(F.calls.filter(c => c.op === "settings.set" && c.id === "pentaryn-ties.pinnedCards").length, 0, "the stored pins are left alone");

  await game.settings.set("pentaryn-ties", "playerAccess", true);
  const { restorePinned } = await import("../popups.mjs");
  restorePinned();
  assert.equal(cardCount(), 1, "with access back, the pinned card returns");
});
