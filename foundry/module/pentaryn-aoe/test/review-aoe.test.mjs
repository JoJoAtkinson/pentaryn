// Final code review (2026-10-12), edge cases found in review. Each test pins a promise the code
// already makes; see context/plans/final-review-2026-10-12/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);

test("applyRows: two overlapping calls on one tray apply each row once", async () => {
  const msg = damage(W, ctx, { hook: true });
  await advance(800);
  await flush(8);
  const hp0 = [ctx.g1, ctx.g2].map(a => a.system.attributes.hp.value);
  F.calls.length = 0;
  const a = R.applyRows(msg.id), b = R.applyRows(msg.id);
  await Promise.all([a, b]);
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.multiplier]), [["Actor.actGoblin0000001", 0.5], ["Actor.actGoblin0000002", 1]]);
  const rows = resOf(msg.id).rows.filter(r => r.id === IDS.g1 || r.id === IDS.g2);
  assert.deepEqual(rows.map(r => [r.applied, r.hp.before]), [[true, hp0[0]], [true, hp0[1]]]);
  assert.deepEqual(rows.map(r => r.hp.after), [ctx.g1, ctx.g2].map(a => a.system.attributes.hp.value));
  assert.equal(R.applying.size, 0, "the per-message chain is dropped once it settles");
});
