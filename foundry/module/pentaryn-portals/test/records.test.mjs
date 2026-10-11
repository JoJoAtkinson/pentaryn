// Finding aoe-movement-portals-36: the GM list is computed once per pass, not once per token.
// The record itself is pinned at the checkpoint (golden/records.json, party.test) and unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, P1, GM } from "./fixtures/world.mjs";

const { S, W } = await boot();
await W.tick();
const adapter = await import("../scene-adapter.mjs");

W.actor({ id: "R36CAV", name: "Caven", type: "character", ownership: { default: 0, [P1]: 3, [GM]: 3 } });
W.actor({ id: "R36SK", name: "Skeleton", ownership: { default: 0, [P1]: 3 } });
const scene = W.scene({ id: "R36", name: "Hall", tokens: [
  { id: "r36a", name: "Caven", actorId: "R36CAV", actorLink: true },
  { id: "r36b", name: "Skeleton", actorId: "R36SK" },
  { id: "r36c", name: "Guard" },
] });

test("partyRecords: one game.users scan per pass (3 tokens)", t => {
  const filter = t.mock.method(game.users, "filter");
  assert.deepEqual(S.partyRecords(scene).map(r => r.name), ["Caven", "Skeleton"]);
  assert.equal(filter.mock.callCount(), 1);
});

test("recordOf with explicit gmIds equals the default; an index from .map is ignored", () => {
  const strip = ({ doc, ...r }) => { void doc; return r; };
  const t = scene.tokens.get("r36a");
  assert.deepEqual(strip(S.recordOf(t, { gmIds: [GM] })), strip(S.recordOf(t)));
  assert.deepEqual(strip(S.recordOf(t, 0)), strip(S.recordOf(t)));
  assert.deepEqual(S.recordOf(t, { gmIds: [GM] }).owners, [P1]);
  assert.deepEqual(adapter.gmUserIds(), [GM]);
});
