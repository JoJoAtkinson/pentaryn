// MM-1 (Joe's metamagic ruling, 2026-10-12, declared): Careful Spell is a declared pick. Using it
// always declares — a public card says so, and the declaration replaces any earlier one — even when
// the player skips the pick (or there is nobody to pick); the next save tray then uses it up with
// nobody protected, and the GM protects rows by hand. The picker lists only the creatures the
// player can see.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, advance, flush, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, GM_ID, PLAYER_ID } from "./fixtures/fireball.mjs";

const { F, W } = await boot({ entry: true });
const ctx = fireball(W, F);
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const resOf = id => game.messages.get(id)?.flags?.[MODULE]?.resolution ?? null;
const carefulItem = W.item({ name: "Careful Spell", type: "feat", system: { identifier: "careful-spell" } }, ctx.wizard);
const tok = id => ctx.s.tokens.get(id);

async function useCareful(pick) {
  F.become({ userId: PLAYER_ID });
  F.dialog = (opts, inputs) => {
    if (pick === null) return null;
    for (const i of inputs) i.checked = pick.includes(i.value);
    return "ok";
  };
  F.fire("dnd5e.postUseActivity", { item: carefulItem, actor: ctx.wizard }, {}, {});
  await flush(6);
  F.become({ userId: GM_ID });
  F.dialog = undefined;
}

test("MM-1: the picker lists only the creatures the player can see", async () => {
  F.calls.length = 0;
  tok(IDS.g2).object = { visible: false };   // out of the player's sight (darkness, a wall)
  await useCareful([IDS.g1]);
  const [dialog] = ops("dialog");
  assert.deepEqual(dialog.inputs.map(i => i.value), [IDS.g1, IDS.cv, IDS.mr, IDS.dead], "Goblin 2 is not named");
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [IDS.g1]);
  delete tok(IDS.g2).object;
});

test("MM-1: skipping the pick still declares — a public card, the earlier choice replaced — and the next save tray uses it with nobody protected", async () => {
  F.calls.length = 0;
  await useCareful(null);
  const card = ops("create").find(c => c.documentName === "ChatMessage");
  assert.ok(card, "the declaration card is posted");
  assert.equal(card.data.whisper, undefined, "public");
  assert.match(card.data.content, /Marrith uses Careful Spell: nobody chosen/);
  assert.doesNotMatch(card.data.content, /Goblin 1/);
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, [], "replaced: Goblin 1 is no longer chosen");

  const msg = damage(W, ctx, { id: "dmgDeclared00001", hook: true });
  await advance(800);
  await flush(8);
  const res = resOf(msg.id);
  assert.equal(res.rows.filter(r => r.protected).length, 0, "nobody protected (the GM can shield rows by hand)");
  assert.equal(ctx.wizard.flags[MODULE].careful, undefined, "the declaration is used up");
});

test("MM-1: with no creature to choose, using it still declares (no picker)", async () => {
  const all = ctx.s.tokens.contents;
  for (const tk of all) tk.object = { visible: false };
  F.calls.length = 0;
  await useCareful([IDS.g1]);
  assert.deepEqual(ops("dialog"), [], "no picker");
  assert.match(ops("create").find(c => c.documentName === "ChatMessage")?.data.content ?? "", /nobody chosen/);
  assert.deepEqual(ctx.wizard.flags[MODULE].careful.tokens, []);
  for (const tk of all) delete tk.object;
  delete ctx.wizard.flags[MODULE].careful;
});
