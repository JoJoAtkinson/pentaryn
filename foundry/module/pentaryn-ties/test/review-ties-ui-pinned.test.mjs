/**
 * Final code review (ties-ui-E5): pinned cards outlive reloads "as a memo" (popups.mjs header), and
 * place() clamps a card dragged to the screen edge to 0, so 0 is a position the module saves. A card
 * saved flush to the left/top edge must come back there, not 20px in. Numeric strings still count;
 * only a missing or non-numeric coordinate falls back to 20.
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

test("ties-ui-E5 pinnedCoord: 0 and numeric strings are kept; missing or non-numeric falls back to 20", async () => {
  const { pinnedCoord } = await import("../popups.mjs");
  assert.equal(typeof pinnedCoord, "function", "popups.mjs exports pinnedCoord");
  assert.equal(pinnedCoord(0), 0, "0 is the screen edge, not missing");
  assert.equal(pinnedCoord("40"), 40);
  assert.equal(pinnedCoord("1e2"), 100);
  assert.equal(pinnedCoord(null), 20);
  assert.equal(pinnedCoord(undefined), 20);
  assert.equal(pinnedCoord(""), 20);
  assert.equal(pinnedCoord(NaN), 20);
  assert.equal(pinnedCoord("left"), 20);
});

test("ties-ui-E5 restorePinned: a card saved at the screen edge comes back at the edge", async () => {
  await flush();
  const { restorePinned } = await import("../popups.mjs");
  restorePinned();
  const cards = [...(document.getElementById("pentaryn-ties-cards")?.children ?? [])].filter(c => c.classList.contains("pt-card"));
  assert.equal(cards.length, 1, "the pinned card is restored");
  assert.equal(cards[0].style.left, "0px");
  assert.equal(cards[0].style.top, "0px");
});
