/**
 * Final code review (ties-ui-E5): pinned cards outlive reloads "as a memo" (popups.mjs header), and
 * place() clamps a card dragged to the screen edge to 0, so 0 is a position the module saves. A card
 * saved flush to the left/top edge must come back there, not 20px in.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzEdgePc00000001";
const NPC = "zzEdgeNpc0000001";

await bootWorld({
  settings: { "pentaryn-ties.pinnedCards": [{ sourceId: NPC, tieId: PC, x: 0, y: 0 }] },
  actors: [
    { id: PC, name: "ZZ Edge PC", type: "character" },
    { id: NPC, name: "ZZ Edge NPC", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "rival", notes: "", stance: 0, strength: 3 }] } } },
  ],
});
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};

test("restorePinned: a card saved at the screen edge comes back at the edge", async () => {
  await flush();
  const { restorePinned } = await import("../popups.mjs");
  restorePinned();
  const cards = [...(document.getElementById("pentaryn-ties-cards")?.children ?? [])].filter(c => c.classList.contains("pt-card"));
  assert.equal(cards.length, 1, "the pinned card is restored");
  assert.equal(cards[0].style.left, "0px");
  assert.equal(cards[0].style.top, "0px");
});
