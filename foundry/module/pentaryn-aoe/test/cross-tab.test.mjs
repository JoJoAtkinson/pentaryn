// AC-1 (final review 2026-10-12, declared fix): with two GM tabs (the MCP bridge plus a browser
// tab) both are activeGM.isSelf. Player save matching ran unclaimed in both, each writing the whole
// resolution from its own copy, and Apply in both tabs damaged the same rows twice. Save matching
// now runs only in the tab that wins claimMessage(save, "matchSave"); Apply re-reads the live
// resolution before each row, skips a row another tab already applied, and marks each landed row
// at once.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, PLAYER_ID } from "./fixtures/fireball.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const R = S.resolve;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);
const G1 = "Actor.actGoblin0000001";

async function tray(id) {
  for (const a of [ctx.g1, ctx.g2]) a.system.attributes.hp.value = 7;
  const msg = damage(W, ctx, { id, hook: true });
  await advance(800);
  await flush(8);
  F.calls.length = 0;
  return msg;
}

const playerSave = (extra = {}) => W.message({
  type: "save", rolls: [{ total: 3, isSuccess: false }], system: { ability: "dex", type: "ability" },
  speaker: { token: IDS.cv, actor: IDS.caven }, timestamp: Date.now() + 1, ...extra,
});

test("AC-1 a player save claimed by another GM tab is not matched in this one", async () => {
  const msg = await tray("dmgCrossTab00001");
  const save = playerSave({ flags: { [MODULE]: { claims: { matchSave: "another-socket" } } } });
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  assert.equal(resOf(msg.id).rows.find(r => r.id === IDS.cv).save, null, "the other tab fills the row, not this one");
});

test("AC-1 the tab that wins the matchSave claim fills the row", async () => {
  const msg = await tray("dmgCrossTab00002");
  const save = playerSave();
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  assert.equal(game.messages.get(save.id).flags[MODULE].claims.matchSave, game.socket.id);
  assert.deepEqual(resOf(msg.id).rows.find(r => r.id === IDS.cv).save, { total: 3, success: false, messageId: save.id });
});

test("AC-1 a save that answers no open tray is not claimed (no flag write on every save)", async () => {
  const save = W.message({ type: "save", rolls: [{ total: 9 }], system: { ability: "wis", type: "ability" }, speaker: { token: "noSuchToken00001" }, timestamp: Date.now() + 1 });
  F.calls.length = 0;
  F.fire("createChatMessage", save, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  assert.equal(game.messages.get(save.id).flags?.[MODULE]?.claims, undefined);
  assert.deepEqual(ops("update").filter(c => c.uuid?.includes(save.id)), []);
});

test("AC-1 Apply skips a row another GM tab applied meanwhile, and marks each landed row at once", async () => {
  const msg = await tray("dmgCrossTab00003");
  const real = ctx.g1.applyDamage;
  let g1Marked = null;
  ctx.g1.applyDamage = async function (...args) {
    ctx.g1.applyDamage = real;
    const out = await real.apply(this, args);
    // The other tab's Apply lands g2 while this tab is still on g1.
    const theirs = foundry.utils.deepClone(resOf(msg.id));
    const g2 = theirs.rows.find(r => r.id === IDS.g2);
    g2.applied = true; g2.hp = { before: 7, after: 0 };
    await game.messages.get(msg.id).update({ [`flags.${MODULE}.resolution`]: theirs });
    return out;
  };
  const realG2 = ctx.g2.applyDamage;
  ctx.g2.applyDamage = async function (...args) {
    g1Marked = resOf(msg.id).rows.find(r => r.id === IDS.g1).applied;
    return realG2.apply(this, args);
  };
  try {
    const out = await R.applyRows(msg.id);
    assert.deepEqual(ops("applyDamage").map(c => c.actor), [G1], "g2 was applied by the other tab; this tab skips it");
    assert.deepEqual(out.rows.filter(r => r.id === IDS.g1 || r.id === IDS.g2).map(r => r.applied), [true, true]);
    assert.deepEqual(out.rows.find(r => r.id === IDS.g2).hp, { before: 7, after: 0 }, "the other tab's record is kept");
    assert.equal(g1Marked, null, "g2's applyDamage never ran in this tab");
  } finally {
    ctx.g2.applyDamage = realG2;
  }
});

test("AC-1 each landed row is marked applied before the next row's damage goes out", async () => {
  const msg = await tray("dmgCrossTab00004");
  const realG2 = ctx.g2.applyDamage;
  let g1Marked = null;
  ctx.g2.applyDamage = async function (...args) {
    ctx.g2.applyDamage = realG2;
    g1Marked = resOf(msg.id).rows.find(r => r.id === IDS.g1).applied;
    return realG2.apply(this, args);
  };
  await R.applyRows(msg.id);
  assert.equal(g1Marked, true, "a second tab reading now would skip g1");
});
