/**
 * The performance findings, each proven neutral on output (or declared where it is not):
 * ties-24 worn badges (badgePlan; players schedule no frame — B7), and the others as they land.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PLAYER = "zzPlayerUser0001";
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [{ id: "zzNpc00000000001", name: "ZZ Brakka" }],
  tokens: [{ id: "zzTokNpc00000001", actorId: "zzNpc00000000001", x: 200, y: 300 }],
});
const Worn = await import("../worn.mjs");

test("ties-24: badgePlan — the corner, the radius and the initial, from the document's position", () => {
  const p = (id, x, y, by, w = 100) => ({ id, w, document: { id, x, y, getFlag: (s, k) => (k === "worn" && by !== null ? { by, note: "" } : undefined) } });
  assert.deepEqual(Worn.badgePlan([p("a", 200, 300, "ozmandius")], 100), [{ tokenId: "a", x: 200 + 100 - 17.25, y: 300 + 17.25, r: 15, letter: "O" }]);
  assert.equal(Worn.badgePlan([p("b", 0, 0, "   ")], 100).length, 0, "a blank mark is no mark");
  assert.equal(Worn.badgePlan([p("c", 0, 0, null)], 100).length, 0);
  assert.equal(Worn.badgePlan([p("d", 0, 0, "x", 50)], 40)[0].r, 8, "never under 8 px");
  assert.equal(Worn.badgePlan([p("e", 0, 0, "  vesh")], 100)[0].letter, "V");
});

test("ties-24 / B7 [declared]: a player's drawBadges schedules no frame; the GM's schedules one", () => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  F.frames.length = 0;
  Worn.drawBadges();
  assert.equal(F.frames.length, 0, "players never paint the badge layer, so never queue it");
  game.user = gm;
  Worn.drawBadges();
  assert.equal(F.frames.length, 1);
  F.flushFrames();
});
