/**
 * Final code review (ties-ui-M8): `game.pentaryn.ties.uninstall()` removed the hooks but left the
 * worn badge layer and the wire layer on canvas.interface, their queued paint frames, and every card
 * in the DOM card layer — so a hot re-import drew a second set over the first.
 * Ruling [declared]: overlay.uninstall cancels its queued frame and drops the wire layer;
 * worn.uninstall cancels its frame and drops the badge layer; popups.teardown() (called from
 * overlay.uninstall) removes the card layer and clears the card map WITHOUT saving — the pinned
 * memo stays exactly as it was saved, so the re-import restores the same cards.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PINS = [{ sourceId: PC, tieId: NPC, x: 40, y: 60 }];

const F = await bootWorld({
  settings: { "pentaryn-ties.pinnedCards": PINS },
  actors: [
    {
      id: PC,
      name: "ZZ Caven",
      type: "character",
      flags: { "pentaryn-ties": { ties: [{ id: NPC, word: "debtor", notes: "Owes forty.", stance: -1, strength: 4 }] } },
    },
    { id: NPC, name: "ZZ Brakka" },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 0, y: 0 },
    { id: "zzTokNpc00000001", actorId: NPC, x: 100, y: 0, flags: { "pentaryn-ties": { worn: { by: "Oz", note: "" } } } },
  ],
});
const flush = async (n = 10) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const cardLayer = () => document.getElementById("pentaryn-ties-cards");
const cardCount = () => [...(cardLayer()?.children ?? [])].filter(c => c.classList.contains("pt-card")).length;
const liveLayers = () => canvas.interface.children.filter(c => !c.destroyed);
const pinWrites = () => F.calls.filter(c => c.op === "settings.set" && c.id === "pentaryn-ties.pinnedCards").length;

test("ties-ui-M8: uninstall drops the wire and badge layers, cancels queued frames, takes the cards down without saving", async () => {
  await flush();
  assert.equal(cardCount(), 1, "the pinned card is restored at ready");
  F.fire("canvasReady");
  F.flushFrames();
  assert.equal(liveLayers().length, 2, "a wire layer and a badge layer are painted");

  // a paint queued for each layer, then uninstall before the frame runs (the marked token's step:
  // since ties-ui-perf-10 an unmarked or missing token asks for no badge frame)
  F.fire("refreshToken", canvas.tokens.get("zzTokNpc00000001"));
  assert.ok(F.frames.length >= 2, "both painters queued a frame");
  const writesBefore = pinWrites();

  game.pentaryn.ties.uninstall();

  assert.equal(F.frames.length, 0, "the queued paint frames are cancelled");
  assert.deepEqual(liveLayers(), [], "both PIXI layers are destroyed");
  assert.equal(cardLayer(), null, "the DOM card layer is removed");
  assert.equal(pinWrites(), writesBefore, "the pinned memo is not rewritten");
  assert.deepEqual(game.settings.get("pentaryn-ties", "pinnedCards"), PINS, "the saved pins are left as they were");
});

test("ties-ui-M8: a hot re-import restores one pinned card and one of each layer, not a second set", async () => {
  await import("../pentaryn-ties.mjs?hot=m8");
  await flush();
  assert.equal(cardCount(), 1, "the same pinned card comes back, once");
  F.flushFrames();
  F.fire("canvasReady");
  F.flushFrames();
  assert.equal(liveLayers().length, 2, "one wire layer and one badge layer");
});
