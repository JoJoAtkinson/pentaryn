// R4 (final review 2026-10-12, declared fix): one rejecting NPC save threw out of rollNpcSaves, so
// every save already rolled in that pass was discarded, and resolve() then skipped the player
// request card and autoApplyNpc. Each row is now caught on its own: the failure is logged naming
// the row, the saves that landed are written, the rest of resolve() still runs, and the failed
// row stays unrolled ('—') for a re-roll.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, lines, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);
const G1 = "Actor.actGoblin0000001", G2 = "Actor.actGoblin0000002";

/** Make `actor`'s next rollSavingThrow call reject, then restore the stub. */
function rejectOnce(actor) {
  const real = actor.rollSavingThrow;
  Object.defineProperty(actor, "rollSavingThrow", {
    configurable: true, writable: true,
    value: async () => { actor.rollSavingThrow = real; throw new Error("save refused"); },
  });
}

test("R4 one rejecting NPC save keeps the saves that landed; the request card and autoApplyNpc still run", async () => {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;   // alive, so their rows are ticked
  await game.settings.set(MODULE, "autoApplyNpc", true);
  rejectOnce(ctx.g1);
  F.calls.length = 0; out.length = 0;
  const msg = damage(W, ctx, { id: "dmgNpcPartial001", hook: true });
  await advance(800);
  await flush(8);
  await game.settings.set(MODULE, "autoApplyNpc", false);

  const rows = resOf(msg.id).rows;
  const g1 = rows.find(r => r.id === IDS.g1), g2 = rows.find(r => r.id === IDS.g2);
  assert.ok(!g1.save, "the goblin whose save failed stays unrolled for a re-roll");
  assert.ok(g2.save, "the goblin rolled after it keeps its save");
  assert.ok(lines().some(l => l === `warn: ${MODULE} | npcSave`), "the failure is logged");
  assert.ok(out.find(o => o.text === `${MODULE} | npcSave`).args.includes(g1.name), "the log names the row");
  assert.ok(resOf(msg.id).request, "the player request card is still posted");
  assert.ok(ops("create").some(c => c.data.type === "request"));
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [G2], "autoApplyNpc still applies the row that saved");

  F.calls.length = 0;
  await R.rollNpcSaves(msg.id);
  assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), [G1], "a re-roll rolls only the failed row");
  assert.ok(resOf(msg.id).rows.find(r => r.id === IDS.g1).save);
});
