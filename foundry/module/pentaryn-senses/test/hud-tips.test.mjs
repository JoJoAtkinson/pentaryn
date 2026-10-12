/**
 * [declared senses-edge-3] One rule for every button tip: the plain-text string goes to
 * `data-tooltip-text` (Foundry 14's TooltipManager shows it as text, never parses it as HTML) and
 * to `aria-label`; nothing sets `data-tooltip`, and no name is HTML-escaped first. Before the fix
 * the Outshone tip escaped the winner's name (`&amp;` on screen and in the screen reader) while the
 * LinkTo tip put the anchor's raw name in `data-tooltip`, which Foundry parses as HTML.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, flush, settle, tokenHUD, el, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const LANTERN_NAME = `Tom's <b>Lantern</b> & "Co"`;
const STAKE_NAME = `Stake <i>&</i> 'Post'`;
const world = standardWorld();
world.actors.find(a => a.id === ID.hero).items.get(ID.lantern).name = LANTERN_NAME;
world.scenes[0].tokens.get(ID.tStake).name = STAKE_NAME;

const F = await boot({ world });
await settle(mock);
const hero = () => game.actors.get(ID.hero);
const tok = id => game.scenes.get(ID.s1).tokens.get(id);

/** Every button's tip as the DOM carries it. */
const tips = b => ({ tooltip: b.dataset.tooltip, text: b.dataset.tooltipText, aria: b.getAttribute("aria-label") });
const plain = text => ({ tooltip: undefined, text, aria: text });

test("senses-edge-3: the Outshone tip names the winning item as plain text in data-tooltip-text and aria-label", async () => {
  await hero().items.get(ID.torch).update({ [`flags.${MODULE}.lit`]: true });
  await hero().items.get(ID.lantern).update({ [`flags.${MODULE}.lit`]: true });
  await flush();
  await settle(mock);
  const root = el("section", { className: "inventory" });
  for (const item of hero().items) {
    const row = el("div", { className: "item-row", children: [el("div", { className: "item-name" })] });
    root.append(el("li", { className: "item", dataset: { itemId: item.id }, children: [row] }));
  }
  F.fire("renderBaseActorSheet", { actor: hero() }, root);
  // the lantern (60 ft) outshines the torch (40 ft): the torch's flame names the lantern
  const torch = root.querySelector(`li[data-item-id="${ID.torch}"]`);
  assert.deepEqual(tips(torch.querySelector(".ps-light-toggle")),
    plain(`Lit, but your ${LANTERN_NAME} gives more light, so this one adds nothing now. Click to put it out.`));
  const lantern = root.querySelector(`li[data-item-id="${ID.lantern}"]`);
  assert.deepEqual(tips(lantern.querySelector(".ps-light-toggle")), plain("Put it out"));
  assert.deepEqual(tips(lantern.querySelector(".ps-light-hood")), plain("Lower the hood"));
});

test("senses-edge-3: the Chain to <target> tip names the anchor token as plain text, never in data-tooltip", () => {
  game.user.targets = new Set([{ document: tok(ID.tStake) }]);
  const h = tokenHUD(tok(ID.tGob));
  F.fire("renderTokenHUD", h.app, h.element);
  game.user.targets = new Set();
  assert.deepEqual(tips(h.col.querySelector(".ps-chain-btn")), plain(`Chain to ${STAKE_NAME}`));
});

test("senses-edge-3: the static tips (Break chain, End light, the spell card's row) follow the same rule", async () => {
  const hulk = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", hulk.app, hulk.element);
  assert.deepEqual(tips(hulk.col.querySelector(".ps-chain-btn")), plain("Break chain"));
  await game.pentaryn.senses.light.cast(hero().items.get(ID.light), { token: ID.tStake });
  await flush();
  await settle(mock);
  const h = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", h.app, h.element);
  assert.deepEqual(tips(h.col.querySelector(".ps-light-end")), plain("End light"));
  const list = el("ul", { className: "unlist" });
  const card = el("div", { className: "message-content", children: [el("div", { className: "chat-card", children: [el("section", { className: "icon-row", children: [list] })] })] });
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: hero().items.get(ID.light).uuid } } }, card);
  const row = card.querySelectorAll("[data-ps-light]").map(tips);
  assert.equal(row.length, 3);
  for (const t of row) assert.deepEqual(t, plain(t.aria));
});
