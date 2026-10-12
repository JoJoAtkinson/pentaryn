/**
 * ES-4 (final review 2026-10-12, ties-study): the tempo bubble is drawn only over a token this
 * viewer can see. A player whose client cannot see the looker's token (hidden, out of sight) must
 * not get a bubble pinned to that spot — it would reveal where another character stands. Joe's
 * ruling: do not draw it when `!token.isVisible` for this viewer. The GM sees every token, so the
 * GM's client still draws it. Fresh world so no other file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const PLAYER = "zzPlayerUser0001";

await bootWorld({
  user: { id: PLAYER, name: "ZZ Player", isGM: false },
  users: [{ id: "zzGmUser00000001", name: "ZZ GM", isGM: true, active: true }],
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: PC2, name: "ZZ Wren", type: "character" },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 200, y: 300 },
    { id: "zzTokPc200000001", actorId: PC2, x: 900, y: 900, isVisible: false },
  ],
});
const { showBubble } = await import("../study/tempo.mjs");
const bubbles = el("div");
bubbles.id = "chat-bubbles";
document.body.appendChild(bubbles);
const drawn = tokenId => bubbles.querySelector(`.pt-tempo[data-pt-token="${tokenId}"]`);

test("ES-4: a player gets no tempo bubble over a token they cannot see", () => {
  showBubble({ tokenId: "zzTokPc200000001", sceneId: canvas.scene.id, text: "Wren is studying the room." });
  assert.equal(drawn("zzTokPc200000001"), null, "the bubble would reveal the hidden token's position");
});

test("ES-4: a player still gets the bubble over a token they can see", () => {
  showBubble({ tokenId: "zzTokPc000000001", sceneId: canvas.scene.id, text: "Caven is studying the room." });
  assert.ok(drawn("zzTokPc000000001"));
});

test("ES-4: the GM sees every token, so the GM's client draws it over the hidden one", () => {
  const player = game.user;
  game.user = { id: "zzGmUser00000001", isGM: true };
  try {
    showBubble({ tokenId: "zzTokPc200000001", sceneId: canvas.scene.id, text: "Wren is studying the room." });
    assert.ok(drawn("zzTokPc200000001"));
  } finally {
    game.user = player;
  }
});
