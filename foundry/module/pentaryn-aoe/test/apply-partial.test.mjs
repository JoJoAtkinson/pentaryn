// R1 (final review 2026-10-12, declared fix): when one row's applyDamage rejected, the rows already
// damaged in that Apply were never marked applied, so the next Apply damaged them again. Each row
// is now caught on its own: the rows that landed are marked applied, the GM is told which rows
// failed, and a retry applies only those.
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
const G1 = "Actor.actGoblin0000001", G2 = "Actor.actGoblin0000002";

async function tray(id) {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;   // alive, so their rows are ticked
  const msg = damage(W, ctx, { id, hook: true });
  await advance(800);
  await flush(8);
  F.calls.length = 0;
  return msg;
}

/** Make `actor`'s next applyDamage call run `fn` instead, then restore the stub. */
function once(actor, fn) {
  const real = actor.applyDamage;
  Object.defineProperty(actor, "applyDamage", {
    configurable: true, writable: true,
    value(...args) { actor.applyDamage = real; return fn.call(this, real, ...args); },
  });
}

test("R1 a rejecting row leaves the rows already damaged marked applied, and a retry damages only the failed row", async () => {
  const msg = await tray("dmgPartial000001");
  once(ctx.g2, async () => { throw new Error("applyDamage refused"); });
  await assert.rejects(R.applyRows(msg.id), /applyDamage refused/, "the rejection still reaches the caller");
  let rows = resOf(msg.id).rows;
  assert.equal(rows.find(r => r.id === IDS.g1).applied, true, "the goblin that took damage is marked applied");
  assert.ok(!rows.find(r => r.id === IDS.g2).applied, "the goblin whose damage failed is not");
  const warns = ops("notify").filter(c => c.level === "warn");
  assert.equal(warns.length, 1, "the GM is told once");
  assert.match(warns[0].message, new RegExp(rows.find(r => r.id === IDS.g2).name), "the toast names the row that failed");

  F.calls.length = 0;
  await R.applyRows(msg.id);
  assert.deepEqual(ops("applyDamage").map(c => c.actor), [G2], "the retry damages only the row that failed");
  rows = resOf(msg.id).rows;
  assert.ok(rows.find(r => r.id === IDS.g1).applied && rows.find(r => r.id === IDS.g2).applied);
});

test("R1 a failing first row does not stop the later rows from being damaged", async () => {
  const msg = await tray("dmgPartial000002");
  once(ctx.g1, async () => { throw new Error("applyDamage refused"); });
  await assert.rejects(R.applyRows(msg.id), /applyDamage refused/);
  assert.ok(ops("applyDamage").some(c => c.actor === G2), "the second goblin was still damaged");
  const rows = resOf(msg.id).rows;
  assert.equal(rows.find(r => r.id === IDS.g2).applied, true);
  assert.ok(!rows.find(r => r.id === IDS.g1).applied);
});
