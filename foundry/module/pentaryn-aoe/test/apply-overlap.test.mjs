// aoe-edge-1 (final review 2026-10-12, declared fix): applyRows is "safe to repeat", but two
// overlapping calls on one tray both read the unapplied rows before either write landed, so every
// row took damage twice. Calls for one message are now serialised in this tab.
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

test("aoe-edge-1 two overlapping applyRows calls on one tray damage each row once", async () => {
  const msg = await tray("dmgOverlap000001");
  const hp0 = [ctx.g1, ctx.g2].map(a => a.system.attributes.hp.value);
  const [a, b] = await Promise.all([R.applyRows(msg.id), R.applyRows(msg.id)]);
  assert.deepEqual(ops("applyDamage").map(c => [c.actor, c.multiplier]), [[G1, 0.5], [G2, 1]]);
  const rows = resOf(msg.id).rows.filter(r => r.id === IDS.g1 || r.id === IDS.g2);
  assert.deepEqual(rows.map(r => [r.applied, r.hp.before]), [[true, hp0[0]], [true, hp0[1]]]);
  assert.deepEqual(rows.map(r => r.hp.after), [ctx.g1, ctx.g2].map(x => x.system.attributes.hp.value));
  assert.deepEqual(a, b, "the second call sees the first one's rows as applied and writes nothing new");
  assert.equal(R.applying.size, 0, "the per-message chain is dropped once it settles");
});

test("aoe-edge-1 a rejecting Apply still rejects for its caller, and the queued Apply runs after it", async () => {
  const msg = await tray("dmgOverlap000002");
  once(ctx.g1, async () => { throw new Error("applyDamage refused"); });
  const a = R.applyRows(msg.id), b = R.applyRows(msg.id);
  await assert.rejects(a, /applyDamage refused/);
  const out = await b;
  assert.ok(out.rows.find(r => r.id === IDS.g1).applied && out.rows.find(r => r.id === IDS.g2).applied);
  assert.equal(R.applying.size, 0);
});

test("aoe-edge-1 a stuck applyDamage stops blocking a later Apply after APPLY_WAIT_MS", async () => {
  const msg = await tray("dmgOverlap000003");
  once(ctx.g1, () => new Promise(() => {}));                 // never settles
  R.applyRows(msg.id);
  let settled = false;
  const b = R.applyRows(msg.id).then(v => { settled = true; return v; });
  await advance(R.APPLY_WAIT_MS - 100);
  assert.equal(settled, false, "the later Apply waits for the earlier one first");
  await advance(200);
  const out = await b;
  assert.equal(settled, true);
  assert.ok(out.rows.find(r => r.id === IDS.g1).applied, "the later Apply ran once the wait ran out");
});
