// [declared] aoe-edge-3: the canvasReady sweep is wired at setup on every client and gated inside
// on the active GM, so a GM who becomes the active GM after ready (a handover) still sweeps.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, flush, MODULE, GM_ID } from "./fixtures/world.mjs";

// Another GM, sorted first, is the active GM at ready: this client's readyAreas does nothing.
const OTHER = "aaOtherGm0000001";
const { F, W } = await boot({ users: [{ id: OTHER, name: "Other GM", isGM: true, active: true }], entry: true });
await flush(8);

test("aoe-edge-3: at ready another GM is active, so this client did no startup work", () => {
  assert.notEqual(game.users.activeGM.id, GM_ID);
  assert.deepEqual(F.calls.filter(c => c.op === "create" && c.documentName === "Actor"), []);
});

test("aoe-edge-3: after a GM handover, canvasReady sweeps on the new active GM", async () => {
  const s = W.scene({ id: "HandoverScene001" });
  W.token(s, { id: "orphanHandover01", flags: { [MODULE]: { handle: true, region: "goneRegionHand01" }, dnd5e: { lockSize: true } } });
  F.calls.length = 0;
  F.fire("canvasReady", { scene: s });
  await flush(8);
  assert.deepEqual(F.calls.filter(c => c.op === "deleteEmbedded"), [], "not the active GM yet: no sweep");
  game.users.get(OTHER).active = false;
  assert.equal(game.users.activeGM.id, GM_ID);
  F.fire("canvasReady", { scene: s });
  await flush(8);
  assert.deepEqual(F.calls.filter(c => c.op === "deleteEmbedded").map(c => c.ids), [["orphanHandover01"]]);
});
