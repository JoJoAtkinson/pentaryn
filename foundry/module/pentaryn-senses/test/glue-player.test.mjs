/**
 * Characterisation (senses checkpoint, wave 3): the entry as a PLAYER (Marrith's owner) with the
 * GM connected — the API is published but nothing is written at ready; the carried-light path, the
 * torch hook and every GM reconcile stay silent; chain refuses; the Light cantrip writes only the
 * caster's own item flag; names hidden by displayName stay hidden; non-owners are refused.
 * Frozen once committed: during the refactor only import paths may change.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, makeActor, makeItem, activityOf, flush, settle, since, captureConsole, tokenHUD, el, standardWorld, ID, MODULE, NOW, GM, PLAYER, LIGHT_SPELL, TORCH } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const world = standardWorld();
// the Stake carries a Light and a torch the player does not own
const stake = world.actors.find(a => a.id === ID.stake);
for (const d of [{ ...LIGHT_SPELL, id: "itmStakeLight001" }, { ...TORCH, id: "itmStakeTorch001" }]) {
  const it = makeItem(d, stake);
  it.collection = stake.items;
  stake.items.set(it.id, it);
}
const F = await boot({ user: PLAYER, others: [GM], world, ready: false });
const L = () => game.pentaryn.senses.light;
const hero = () => game.actors.get(ID.hero);
const tok = id => game.scenes.get(ID.s1).tokens.get(id) ?? game.scenes.get(ID.s2).tokens.get(id);

async function effects(fn) {
  const mark = F.calls.length;
  const value = await fn();
  await flush();
  await settle(mock);
  const shown = value && typeof value === "object" && "message" in value && "id" in value ? { notification: value.message } : value;
  return { value: shown === undefined ? "<undefined>" : F.plain(shown), calls: since(mark) };
}

test("ready as a player: the API is published and nothing is written", async () => {
  const r = await effects(() => F.fire("ready"));
  assert.deepEqual(r.calls, []);
  // [declared S-1, S-2]: kit members added, chain.uninstall gone, senses.chain alias (glue.test pins the rest)
  assert.deepEqual(Object.keys(game.pentaryn.senses), [
    "syncLight", "carriedLight", "resetSight", "light", "setupLight", "syncAll", "chain", "inspect",   // + inspect (-25, additive)
    "version", "contract", "settings", "trace", "uninstall", "describe",
  ]);
  assert.deepEqual(Object.keys(game.pentaryn.chain), ["link", "break", "links", "repaint"]);
  assert.equal(await game.pentaryn.senses.resetSight({ force: true }), null);
});

test("player: carried-light hooks, the torch hook and the GM reconcile hooks write nothing", async () => {
  hero().items.get(ID.torch).flags[MODULE] = { lit: true };
  const rows = await effects(async () => {
    F.fire("updateActor", hero());
    F.fire("createItem", makeItem({ id: "itmPlayerTorch01", name: "Torch", system: { identifier: "torch" } }, hero()));
    F.fire("updateItem", hero().items.get(ID.light), { flags: { [MODULE]: { lightCast: null } } });
    F.fire("deleteScene", {});
    F.fire("deleteActor", hero());
  });
  hero().items.get(ID.torch).flags[MODULE] = {};
  assert.deepEqual(rows.calls, []);
});

test("player: setupLight is GM-only; chain refuses", async t => {
  const out = captureConsole(t);
  const r = await effects(async () => [
    await game.pentaryn.senses.setupLight(),
    await game.pentaryn.chain.link(ID.tGob, ID.tStake),
    await game.pentaryn.chain.break(ID.tHulk),
  ]);
  assert.deepEqual(r, { value: [0, false, 0], calls: [{ op: "notify", level: "warn", message: "pentaryn-senses: setupLight is GM-only." }] });
  assert.deepEqual(out, []);
});

test("player cast: writes only the item flag; the toast names a token only when the player could see its name", async () => {
  const rows = {};
  const light = hero().items.get(ID.light);
  rows.ownToken = await effects(() => L().cast(light, { token: ID.tHero }));
  rows.nameNone = await effects(() => L().cast(light, { token: ID.tGob }));       // displayName NONE
  tok(ID.tGob).displayName = CONST.TOKEN_DISPLAY_MODES.HOVER;
  rows.nameHover = await effects(() => L().cast(light, { token: ID.tGob }));
  tok(ID.tGob).displayName = CONST.TOKEN_DISPLAY_MODES.OWNER_HOVER;
  rows.nameOwnerHover = await effects(() => L().cast(light, { token: ID.tGob }));
  tok(ID.tGob).displayName = 0;
  rows.tokenElsewhere = await effects(() => L().cast(light, { scene: ID.s2, token: "tokMissing000001" }));
  rows.square = await effects(() => L().cast(light, { x: 10, y: 20 }));
  rows.end = await effects(() => L().end(light));
  pinJSON("player-cast", rows, import.meta.url);
});

test("player: no GM connected → the flag waits and the player is told", async () => {
  F.game.users.get(GM).active = false;
  const r = await effects(() => L().cast(hero().items.get(ID.light), { token: ID.tHero }));
  F.game.users.get(GM).active = true;
  assert.deepEqual(r.calls.filter(c => c.op === "notify"), [{ op: "notify", level: "warn", message: "The GM isn't connected; the light will appear when they are." }]);
  // with no active GM the carried path falls back to "any GM": a player is not one
  hero().items.get(ID.torch).flags[MODULE] = { lit: true };
  F.game.users.get(GM).active = false;
  const r2 = await effects(() => F.fire("updateActor", hero()));
  F.game.users.get(GM).active = true;
  hero().items.get(ID.torch).flags[MODULE] = {};
  assert.deepEqual(r2.calls, []);
});

test("player: someone else's items are refused (cast, end, toggle with a warning; hood and prompt silently)", async () => {
  const sLight = stake.items.get("itmStakeLight001"), sTorch = stake.items.get("itmStakeTorch001");
  const rows = {
    cast: await effects(() => L().cast(sLight, { token: ID.tStake })),
    end: await effects(() => L().end(sLight)),
    toggle: await effects(() => L().toggle(sTorch)),
    hood: await effects(() => L().hood(sTorch)),
    prompt: await effects(() => L().prompt(sLight)),
  };
  F.dialogChoice = "me";
  rows.postUse = await effects(() => F.fire("dnd5e.postUseActivity", activityOf(sLight, "actLightSummon01")));
  rows.dialogs = F.dialogs.length;
  pinJSON("player-refusals", rows, import.meta.url);
});

test("player: the sheet locks rows the player does not own; the card drops Summon but adds no buttons", async () => {
  const sTorch = stake.items.get("itmStakeTorch001");
  const name = el("div", { className: "item-name" });
  const root = el("section", { children: [el("li", { dataset: { itemId: sTorch.id }, children: [el("div", { className: "item-row", children: [name] })] })] });
  F.fire("renderBaseActorSheet", { actor: stake }, root);
  const btn = root.querySelector(".ps-light-toggle");
  const click = await effects(() => { btn.click(); });
  const summon = el("li", { children: [el("button", { attrs: { "data-action": "placeSummons" } })] });
  const card = el("div", { className: "message-content", children: [el("div", { className: "chat-card", children: [el("section", { className: "icon-row", children: [el("ul", { className: "unlist", children: [summon] })] })] })] });
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: stake.items.get("itmStakeLight001").uuid } } }, card);
  pinJSON("player-sheet-card", { row: root.children[0].toJSON(), click, card: card.toJSON() }, import.meta.url);
});

test("player: End light on the Token HUD only for the caster's owner", async () => {
  // the GM's reconcile would have written this; the player's client just reads it
  tok(ID.tStake).flags[MODULE] = { spellLight: { source: hero().items.get(ID.light).uuid, prior: null } };
  hero().items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake } };
  const mine = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", mine.app, mine.element);
  const click = await effects(() => { mine.col.querySelector(".ps-light-end").click(); });
  tok(ID.tHulk).flags[MODULE] = { spellLight: { source: stake.items.get("itmStakeLight001").uuid, prior: null } };
  const theirs = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", theirs.app, theirs.element);
  pinJSON("player-hud", { mine: mine.col.children.map(c => c.dataset.tooltip), click, theirs: theirs.col.children.length }, import.meta.url);
});
