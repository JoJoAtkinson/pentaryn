// metamagic-disarm (play test AO-1 / final review 2026-10-12, declared fix): out of combat a used
// Careful Spell stayed armed for ten minutes, so a later, unrelated save spell still protected the
// caster's side. Joe's ruling: metamagic ends after use, each casting is a fresh choice. Careful
// Spell is now taken by the caster's next spell cast (its usage card), in or out of combat, with no
// time window; a placement cancelled before it lands (refunded) does not take it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, PLAYER_ID } from "./fixtures/fireball.mjs";

const { F, W } = await boot({ entry: true });
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const ctx = fireball(W, F);
const carefulItem = W.item({ name: "Careful Spell", type: "feat", system: { identifier: "careful-spell" } }, ctx.wizard);

async function arm() {
  delete ctx.wizard.flags[MODULE]?.careful;
  F.fire("dnd5e.postUseActivity", { item: carefulItem, actor: ctx.wizard }, {}, {});
  await flush();
  assert.equal(ctx.wizard.flags[MODULE].careful.usage, null, "armed, not yet taken");
}

/** The caster casts `item` (a spell): dnd5e's postUseActivity with its usage card. */
async function cast(item, id, { usageConfig = {}, templates } = {}) {
  const card = W.message({ id, type: "usage", author: PLAYER_ID, system: { item: { uuid: item.uuid } }, speaker: { scene: ctx.s.id, actor: ctx.wizard.id } });
  F.fire("dnd5e.postUseActivity", { item, actor: ctx.wizard }, usageConfig, { message: card, ...(templates ? { templates } : {}) });
  await flush();
  return card;
}

test("metamagic-disarm: the next spell cast takes Careful Spell; a later save spell's area protects nobody", async () => {
  await arm();
  const shield = W.item({ id: "itemShield000001", name: "Shield", system: { identifier: "shield", duration: { units: "round" } } }, ctx.wizard);
  const card = await cast(shield, "usageShield00001");
  assert.equal(ctx.wizard.flags[MODULE].careful.usage, card.id, "spent on the spell it was used with");
  const msg = damage(W, ctx, { id: "dmgDisarm0000001", hook: true });
  await advance(800);
  await flush(8);
  const res = resOf(msg.id);
  assert.equal(res.careful, null);
  assert.equal(res.rows.filter(r => r.protected).length, 0);
});

test("metamagic-disarm: no ten-minute window — Careful Spell waits for the next spell, then that spell's area is protected", async () => {
  await arm();
  await advance(11 * 60 * 1000, 60 * 1000);
  await cast(ctx.item, IDS.usage);
  assert.equal(ctx.wizard.flags[MODULE].careful.usage, IDS.usage);
  const msg = damage(W, ctx, { id: "dmgDisarm0000002", hook: true });
  await advance(800);
  await flush(8);
  assert.deepEqual(resOf(msg.id).careful, { names: ["Caven"], max: 3 });
});

test("metamagic-disarm: a placement cancelled before it lands (refunded) does not take Careful Spell", async () => {
  await arm();
  await cast(ctx.item, "usageCancelled01", { usageConfig: { create: { measuredTemplate: true } }, templates: [] });
  assert.equal(ctx.wizard.flags[MODULE].careful.usage, null, "still armed for the re-cast");
});
