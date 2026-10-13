// R5 (final review 2026-10-12, declared fix): with no DC on the save activity, a monster save came
// out a success (`total >= null`) and a player save a failure (fillSave's `!!null`). Now neither is
// guessed: the save is recorded with success null, the multiplier stays null ('?') so Apply skips
// the row, and the GM picks the multiplier by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, PLAYER_ID } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);

test("R5 a null DC records monster and player saves as unknown, never an automatic pass or fail", async () => {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;
  ctx.activity.save.dc.value = null;
  const msg = damage(W, ctx, { id: "dmgNullDc0000001", hook: true });
  await advance(800);
  await flush(8);

  const npc = resOf(msg.id).rows.filter(r => r.kind === "auto" && r.save);
  assert.ok(npc.length >= 2, "the monster saves were rolled");
  assert.deepEqual(npc.map(r => [r.save.success, r.multiplier]), npc.map(() => [null, null]), "monster saves: no pass, no fail, multiplier '?'");

  const save = W.message({ type: "save", rolls: [{ total: 20 }], system: { ability: "dex", type: "ability" }, speaker: { token: IDS.cv, actor: IDS.caven }, timestamp: Date.now() + 1 });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  const cv = resOf(msg.id).rows.find(r => r.id === IDS.cv);
  assert.deepEqual([cv.save, cv.multiplier], [{ total: 20, success: null, messageId: save.id }, null], "player save: unknown, multiplier '?'");

  const html = S.tray.trayHTML(resOf(msg.id), msg);
  assert.doesNotMatch(html.match(new RegExp(`data-row="${IDS.cv}"[\\s\\S]*?</li>`))[0], /pa-pass|pa-fail/, "the tray shows neither a pass nor a fail");
  ctx.activity.save.dc.value = 15;
});
