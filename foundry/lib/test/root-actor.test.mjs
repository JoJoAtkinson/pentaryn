import { test } from "node:test";
import assert from "node:assert/strict";
import { rootActorId } from "../root-actor.mjs";

const TALO = "taloActor0000001", WOLF = "wolfForm00000001", BEAR = "bearForm00000001";

// The same table pentaryn-pins' core.test pinned for its own rootActorId before it moved here.
test("rootActorId: the token's actor, or the original while transformed", () => {
  const table = [
    ["plain token", { actorId: TALO }, TALO],
    ["polymorphed token: the token flag names the original", { actorId: WOLF, tokenOriginal: TALO }, TALO],
    ["token flag missing, the form actor's originalActor set", { actorId: WOLF, actorOriginal: TALO }, TALO],
    ["only previousActorIds", { actorId: WOLF, previousIds: [TALO] }, TALO],
    ["nested transform: two previous ids, one original", { actorId: BEAR, tokenOriginal: TALO, previousIds: [TALO, WOLF] }, TALO],
    ["malformed values fall back to actorId", { actorId: TALO, tokenOriginal: 7, actorOriginal: "", previousIds: "nope" }, TALO],
    ["malformed previous id", { actorId: WOLF, previousIds: [null] }, WOLF],
    ["no ids at all", {}, null],
    ["no argument", undefined, null],
  ];
  for (const [why, input, want] of table) assert.equal(rootActorId(input), want, why);
});

test("rootActorId: order is token flag, form actor flag, previousIds[0], actorId", () => {
  const A = "aaaaaaaaaaaaaaa1", B = "bbbbbbbbbbbbbbb1", C = "ccccccccccccccc1", D = "ddddddddddddddd1";
  assert.equal(rootActorId({ actorId: D, tokenOriginal: A, actorOriginal: B, previousIds: [C] }), A);
  assert.equal(rootActorId({ actorId: D, actorOriginal: B, previousIds: [C] }), B);
  assert.equal(rootActorId({ actorId: D, previousIds: [C] }), C);
  assert.equal(rootActorId({ actorId: D }), D);
});

test("rootActorId: only a 16-character document id counts, in every slot", () => {
  for (const bad of ["CAV", "taloActor0000001x", "taloActor00000-1", "", " ", 16, {}, ["taloActor0000001"]]) {
    assert.equal(rootActorId({ tokenOriginal: bad, actorOriginal: bad, previousIds: [bad], actorId: bad }), null, JSON.stringify(bad));
  }
  assert.equal(rootActorId({ tokenOriginal: "CAV", actorId: TALO }), TALO, "a non-id original is skipped, not returned");
});
