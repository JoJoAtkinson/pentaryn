// aoe-careful-select (Joe's metamagic ruling, 2026-10-12, declared; supersedes metamagic-disarm):
// metamagic is a tracking thing. Using Careful Spell opens a picker on the caster's client — the
// creatures on the caster's scene by token name, the current targets ticked, up to CHA mod (min 1);
// the choice is stored on the caster (flags.pentaryn-aoe.careful) and a public card names it. The
// caster's next SAVE tray protects exactly those rows and clears it (one use per declaration); a
// non-save spell leaves it armed, there is no time window, and a second use replaces the choice.
// Nothing infers "the caster's side". The GM toggles any row's protection on the tray by hand.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, GM_ID, PLAYER_ID } from "./fixtures/fireball.mjs";
import { root, dispatch } from "./fixtures/dom.mjs";

const { F, W } = await boot({ entry: true });
const ctx = fireball(W, F);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const carefulItem = W.item({ name: "Careful Spell", type: "feat", system: { identifier: "careful-spell" } }, ctx.wizard);
const tok = id => ctx.s.tokens.get(id);
const CARD = `<div class="message-content"><div class="chat-card">card</div><damage-application></damage-application></div>`;

/** The caster uses Careful Spell; `pick` (token ids) are the boxes ticked when OK is pressed, null closes the picker. */
async function useCareful({ pick, as = PLAYER_ID } = {}) {
  F.become({ userId: as });
  F.dialog = pick === undefined ? undefined : (opts, inputs) => {
    if (pick === null) return null;
    for (const i of inputs) i.checked = pick.includes(i.value);
    return "ok";
  };
  F.fire("dnd5e.postUseActivity", { item: carefulItem, actor: ctx.wizard }, {}, {});
  await flush(6);
  F.become({ userId: GM_ID });
  F.dialog = undefined;
}

async function resolveDamage(id) {
  const msg = damage(W, ctx, { id, hook: true });
  await advance(800);
  await flush(8);
  return resOf(msg.id);
}

test("aoe-careful-select: the picker lists the caster's scene by token name, the current targets ticked; the choice is stored and a public card names it", async () => {
  F.calls.length = 0;
  game.users.get(PLAYER_ID).targets = new Set([{ document: tok(IDS.g1) }, { document: tok(IDS.cv) }]);
  await useCareful();
  const [dialog] = ops("dialog");
  assert.ok(dialog, "the picker opened on the caster's client");
  assert.deepEqual(dialog.inputs.map(i => [i.value, i.checked]), [
    [IDS.g1, true], [IDS.g2, false], [IDS.cv, true], [IDS.mr, false], [IDS.dead, false],
  ], "creatures only (no handle, no pile), the hidden goblin not shown to a player; targets pre-ticked");
  const flag = ctx.wizard.flags[MODULE].careful;
  assert.deepEqual([flag.scene, flag.tokens, flag.names], [IDS.scene, [IDS.g1, IDS.cv], ["Goblin 1", "Caven"]]);
  const card = ops("create").find(c => c.documentName === "ChatMessage");
  assert.ok(card, "a chat card");
  assert.equal(card.data.whisper, undefined, "public");
  assert.match(card.data.content, /Marrith uses Careful Spell: Goblin 1, Caven/);
  game.users.get(PLAYER_ID).targets = new Set();
});

test("aoe-careful-select: the next save tray protects exactly the chosen creatures (a foe too: no 'caster's side') and clears the declaration", async () => {
  F.calls.length = 0;
  const res = await resolveDamage("dmgSelect0000001");
  assert.deepEqual(res.rows.filter(r => r.protected).map(r => r.id), [IDS.g1, IDS.cv]);
  const g1 = res.rows.find(r => r.id === IDS.g1);
  assert.deepEqual([g1.save.success, g1.save.careful, g1.multiplier], [true, true, 0]);
  assert.equal(ops("rollSavingThrow").filter(c => c.actor === ctx.g1.uuid).length, 0, "a protected monster rolls nothing");
  assert.deepEqual(res.careful.names, ["Goblin 1", "Caven"]);
  assert.equal(ctx.wizard.flags[MODULE].careful, undefined, "one use per declaration");
  const next = await resolveDamage2("dmgSelect0000002", "usageOther000001");
  assert.equal(next.rows.filter(r => r.protected).length, 0, "the save spell after that gets nothing");
});

/** A damage message from another usage card (a later casting). */
async function resolveDamage2(id, usage) {
  W.message({ id: usage, type: "usage", author: PLAYER_ID, system: { activity: { uuid: ctx.activity.uuid }, item: { uuid: ctx.item.uuid } }, speaker: { scene: ctx.s.id, actor: ctx.wizard.id } });
  const msg = damage(W, ctx, { id, hook: true, usage });
  await advance(800);
  await flush(8);
  return resOf(msg.id);
}

test("aoe-careful-select: a re-roll of the same usage card keeps its Careful Spell and does not spend a new declaration", async () => {
  await useCareful({ pick: [IDS.g2] });
  const res = await resolveDamage("dmgSelect0000003");
  assert.deepEqual(res.rows.filter(r => r.protected).map(r => r.id), [IDS.g1, IDS.cv], "the card's own choice");
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g2], "the new declaration is still armed");
});

test("aoe-careful-select: a non-save spell (Shield) leaves it armed; no time window; using it again replaces the choice", async () => {
  const shield = W.item({ id: "itemShieldSel001", name: "Shield", type: "spell", system: { identifier: "shield" } }, ctx.wizard);
  const card = W.message({ id: "usageShieldSel01", type: "usage", author: PLAYER_ID, system: { item: { uuid: shield.uuid } }, speaker: { scene: ctx.s.id, actor: ctx.wizard.id } });
  F.fire("dnd5e.postUseActivity", { item: shield, actor: ctx.wizard }, {}, { message: card });
  await advance(11 * 60 * 1000, 60 * 1000);
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g2]);
  await useCareful({ pick: [IDS.dead, IDS.mr] });
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.mr, IDS.dead], "replaced (scene order)");
  const res = await resolveDamage2("dmgSelect0000004", "usageOther000002");
  assert.deepEqual(res.rows.filter(r => r.protected).map(r => r.id), [IDS.mr, IDS.dead], "the caster may choose herself");
});

test("aoe-careful-select: the choice is capped at the CHA mod (min 1); closing the picker stores and posts nothing", async () => {
  await useCareful({ pick: [IDS.g1, IDS.g2, IDS.cv, IDS.mr, IDS.dead] });
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g1, IDS.g2, IDS.cv], "CHA +3");
  const cha = ctx.wizard.system.abilities.cha.mod;
  ctx.wizard.system.abilities.cha.mod = -1;
  await useCareful({ pick: [IDS.g2, IDS.cv] });
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g2], "minimum of one");
  ctx.wizard.system.abilities.cha.mod = cha;
  F.calls.length = 0;
  await useCareful({ pick: null });
  assert.deepEqual(ops("update", "create"), []);
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g2], "the earlier choice stands");
  delete ctx.wizard.flags[MODULE].careful;
});

test("aoe-careful-select: the GM toggles a row's protection on the tray; unprotected, a monster rolls (or gets its roll back) and a player waits", async () => {
  const click = async (id, row) => {
    const host = root(CARD);
    F.fire("dnd5e.renderChatMessage", game.messages.get(id), host);
    const el = host.querySelector(`[data-row="${row}"] [data-pa="protect"]`);
    assert.ok(el, `a shield toggle on ${row}`);
    F.calls.length = 0;
    const ev = dispatch(el.querySelector("i") ?? el, "click");
    await Promise.all(ev.results);
    await flush(8);
    return resOf(id).rows.find(r => r.id === row);
  };
  const dead = await click("dmgSelect0000004", IDS.dead);
  assert.equal(!!dead.protected, false);
  assert.deepEqual([dead.save?.careful, dead.save?.success, dead.multiplier], [undefined, false, 1], "rolled now");
  assert.deepEqual(ops("rollSavingThrow").map(c => c.actor), [ctx.dead.uuid]);

  const res = await resolveDamage2("dmgSelect0000005", "usageOther000003");
  assert.equal(res.rows.filter(r => r.protected).length, 0);
  const g2 = await click("dmgSelect0000005", IDS.g2);
  assert.deepEqual([g2.protected, g2.save.careful, g2.multiplier], [true, true, 0], "protected by hand");
  const back = await click("dmgSelect0000005", IDS.g2);
  assert.equal(!!back.protected, false);
  assert.deepEqual([back.save.careful, back.save.success, back.multiplier], [undefined, false, 1], "back to its own roll");
  assert.deepEqual(ops("rollSavingThrow"), [], "not re-rolled");
  const cv = await click("dmgSelect0000005", IDS.cv);
  assert.equal(cv.protected, true);
  const cvBack = await click("dmgSelect0000005", IDS.cv);
  assert.deepEqual([!!cvBack.protected, cvBack.save, cvBack.multiplier], [false, null, null], "a player row waits again");
});
