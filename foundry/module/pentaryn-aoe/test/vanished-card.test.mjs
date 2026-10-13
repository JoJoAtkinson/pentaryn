// [declared] aoe-vanish-1 (defect wave 3, 2026-10-13): a damage card deleted after the 750 ms
// resolve claim has settled, but while resolve() is still running, logged one swallowed console
// error (the bare-state write refused because the card was gone, rethrown into the hook guard),
// and a card deleted while the monster saves were rolling still rolled the rest and posted the
// players' request card for a tray nobody could see. A vanished card is now a clean cancel:
// nothing is logged, nothing more is rolled, posted, superseded or applied. A write refused while
// the card is still there is still an error.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, out, lines, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const ctx = fireball(W, F);
const G1 = "Actor.actGoblin0000001";
const noise = () => lines().filter(l => /^(warn|error):/.test(l));
const reset = () => { F.calls.length = 0; out.length = 0; };

/** As the server does: an update to a card that is no longer there is refused. */
function refuseWhenGone(msg) {
  const real = msg.update;
  Object.defineProperty(msg, "update", {
    configurable: true, writable: true,
    value: async function (...args) {
      if (!game.messages.has(this.id)) throw new Error(`ChatMessage id [${this.id}] does not exist`);
      return real.apply(this, args);
    },
  });
  return msg;
}

/** The damage card, with its hook still to fire (so the test can arm the deletion first). */
function card(id) {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;
  return refuseWhenGone(damage(W, ctx, { id }));
}

test("aoe-vanish-1 a card deleted mid-resolve, before its first write (during Careful Spell's clear): no error, nothing posted", async () => {
  const msg = card("dmgVanishCareful1");
  await ctx.wizard.update({ [`flags.${MODULE}.careful`]: { tokens: [IDS.cv] } });
  const real = ctx.wizard.update;
  ctx.wizard.update = async function (...args) {
    ctx.wizard.update = real;
    await msg.delete();   // the GM deletes the card while Careful Spell's flag clear is in flight
    return real.apply(this, args);
  };
  reset();
  F.Hooks.callAll("createChatMessage", msg, {}, msg.author);
  await advance(800);
  await flush(8);
  assert.equal(game.messages.has(msg.id), false);
  assert.deepEqual(noise(), [], "a vanished card is a clean cancel, not an error");
  assert.deepEqual(ops("rollSavingThrow"), [], "no monster save is rolled for a card that is gone");
  assert.deepEqual(ops("create").filter(c => c.data?.type === "request"), [], "no request card");
});

test("aoe-vanish-1 a card deleted while the monster saves roll: the rest are not rolled, no request card, no auto-apply", async () => {
  await game.settings.set(MODULE, "autoApplyNpc", true);
  try {
    const msg = card("dmgVanishSaves01");
    const real = ctx.g1.rollSavingThrow;
    ctx.g1.rollSavingThrow = async function (...args) {
      ctx.g1.rollSavingThrow = real;
      const rolled = await real.apply(this, args);
      await msg.delete();
      return rolled;
    };
    reset();
    F.Hooks.callAll("createChatMessage", msg, {}, msg.author);
    await advance(800);
    await flush(8);
    assert.deepEqual(noise(), []);
    assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), [G1], "the goblin after the deletion is not rolled");
    assert.deepEqual(ops("create").filter(c => c.data?.type === "request"), [], "no request card for a gone tray");
    assert.deepEqual(ops("applyDamage"), []);
  } finally {
    await game.settings.set(MODULE, "autoApplyNpc", false);
  }
});

test("aoe-vanish-1 a queued write whose card vanished in flight returns null and logs nothing", async () => {
  const msg = card("dmgVanishMutate1");
  F.Hooks.callAll("createChatMessage", msg, {}, msg.author);
  await advance(800);
  await flush(8);
  assert.ok(msg.flags[MODULE].resolution, "resolved");
  reset();
  const real = msg.update;
  msg.update = async function (...args) {   // deleted between the read and the write
    msg.update = real;
    await msg.delete();
    return real.apply(this, args);
  };
  assert.equal(await R.mutate(msg.id, r => r), null);
  assert.deepEqual(noise(), []);
});

test("aoe-vanish-1 a write refused while the card is still there is still logged", async () => {
  const msg = card("dmgVanishMutate2");
  F.Hooks.callAll("createChatMessage", msg, {}, msg.author);
  await advance(800);
  await flush(8);
  reset();
  const real = msg.update;
  msg.update = async function () { msg.update = real; throw new Error("permission denied"); };
  assert.equal(await R.mutate(msg.id, r => r), null);
  assert.ok(lines().includes(`error: ${MODULE} | mutate`), "a real failure is still an error");
  assert.equal(game.messages.has(msg.id), true);
});

test("aoe-vanish-1 (live check) a delete asked for while the first monster save posts, its server round trip still pending: the next goblin is not rolled", async () => {
  const msg = card("dmgVanishPending");
  const real = msg.delete;
  // As live: preDeleteChatMessage runs at once on the deleting client; the card leaves
  // game.messages only when the server answers, after the save loop's next check.
  msg.delete = function (options = {}) {
    msg.delete = real;
    F.Hooks.call("preDeleteChatMessage", this, options, game.user.id);
    return new Promise(res => setTimeout(() => res(real.call(this, options)), 100));
  };
  const roll = ctx.g1.rollSavingThrow;
  ctx.g1.rollSavingThrow = async function (...args) {
    ctx.g1.rollSavingThrow = roll;
    const rolled = await roll.apply(this, args);
    msg.delete();   // not awaited: a createChatMessage hook cannot wait for the server
    return rolled;
  };
  reset();
  F.Hooks.callAll("createChatMessage", msg, {}, msg.author);
  await advance(1000);
  await flush(8);
  assert.equal(game.messages.has(msg.id), false);
  assert.deepEqual(noise(), []);
  assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), [G1], "the goblin after the deletion is not rolled");
  assert.deepEqual(ops("create").filter(c => c.data?.type === "request"), [], "no request card for a gone tray");
});
