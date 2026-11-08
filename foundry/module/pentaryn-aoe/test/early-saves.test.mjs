// J2 (feedback fs7q6K, Psionic Lash): a save rolled from the usage card's own Saving Throw button BEFORE
// Damage (threaded under the usage card) fills that target's row when the tray is built, and a save
// threaded under the usage card answers a waiting row whenever it was rolled (matchSave's time rule
// is for saves from elsewhere). Nothing is asked for twice.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE, GM_ID, PLAYER_ID } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ctx = fireball(W, F);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const cavenRow = id => resOf(id).rows.find(r => r.id === IDS.cv);

/** A save as dnd5e's card button posts it: threaded under the usage card (system.origin), by speaker. */
function earlySave({ total = 17, origin = IDS.usage, ability = "dex", at = Date.now() - 1000, flags = {}, token = IDS.cv, actor = IDS.caven } = {}) {
  return W.message({
    type: "save", author: GM_ID, rolls: [{ total }], system: { ability, type: "ability", origin },
    speaker: { scene: ctx.s.id, token, actor }, timestamp: at, flags,
  }, { hook: true });
}

test("the GM clicked the card's DC 15 DEX button for Caven before Damage: the tray opens with his row filled and asks nobody", async () => {
  const save = earlySave({ total: 17 });
  await flush(4);
  F.calls.length = 0;
  const msg = damage(W, ctx, { id: "dmgEarly00000001", hook: true });
  await advance(800);
  await flush(8);
  const row = cavenRow(msg.id);
  assert.deepEqual([row.save, row.multiplier, row.kind], [{ total: 17, success: true, messageId: save.id }, 0.5, "manual"]);
  assert.equal(ops("create").some(c => c.data.type === "request"), false, "every manual row is answered: no request card");
  assert.equal(resOf(msg.id).request, null);
  assert.equal(game.settings.get(MODULE, "promptPlayers"), true);
});

test("a save already counted on another tray, a request-card result, a monster save this module rolled, a save from another card, or one newer than the damage is not taken", async () => {
  earlySave({ total: 9, flags: { dnd5e: { requestResult: { actorUuid: ctx.caven.uuid, requestId: "someRequest00001" } } } });
  earlySave({ total: 8, flags: { [MODULE]: { npcSave: true } } });
  earlySave({ total: 7, origin: "usageCardOther01" });
  await flush(4);
  const msg = damage(W, ctx, { id: "dmgEarly00000002", hook: true });
  await advance(800);
  await flush(8);
  const row = cavenRow(msg.id);
  assert.equal(row.save, null, "the 17 is on the first tray; the 9, 8 and 7 do not qualify");
  assert.equal(resOf(msg.id).request !== null, true, "so Caven is asked");
  const late = earlySave({ total: 6, at: Date.now() + 5000 });
  const msg2 = damage(W, ctx, { id: "dmgEarly00000003", hook: true });
  await advance(800);
  await flush(8);
  assert.notEqual(cavenRow(msg2.id).save?.messageId, late.id, "a save newer than the damage is for the live path, not the build");
  // the superseded second tray (same usage, same area) is out of the way
  assert.equal(resOf(msg.id).superseded, true);
});

test("live path: a save threaded under the usage card but OLDER than the damage message still answers the waiting row", async () => {
  const msg = damage(W, ctx, { id: "dmgEarly00000004", hook: true, timestamp: Date.now() });
  await advance(800);
  await flush(8);
  assert.equal(cavenRow(msg.id).save, null);
  const save = W.message({
    type: "save", author: PLAYER_ID, rolls: [{ total: 3, isSuccess: false }], system: { ability: "dex", type: "ability", origin: IDS.usage },
    speaker: { scene: ctx.s.id, token: IDS.cv, actor: IDS.caven }, timestamp: msg.timestamp - 50,
  });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);                                  // AC-1: the matchSave claim settles
  await flush(8);
  assert.deepEqual([cavenRow(msg.id).save, cavenRow(msg.id).multiplier], [{ total: 3, success: false, messageId: save.id }, 1]);
});

test("live path: an older save from somewhere else (no usage card) is still not an answer", async () => {
  const msg = damage(W, ctx, { id: "dmgEarly00000005", hook: true, timestamp: Date.now() });
  await advance(800);
  await flush(8);
  const save = W.message({
    type: "save", author: PLAYER_ID, rolls: [{ total: 19 }], system: { ability: "dex", type: "ability" },
    speaker: { scene: ctx.s.id, token: IDS.cv, actor: IDS.caven }, timestamp: msg.timestamp - 50,
  });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  assert.equal(cavenRow(msg.id).save, null);
  assert.equal(typeof R.fillEarlierSaves, "function");
});
