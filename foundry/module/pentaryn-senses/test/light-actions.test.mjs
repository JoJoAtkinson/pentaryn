/**
 * senses-EXT-2 (final review 2026-10-12): the Light actions are one frozen table, LIGHT_ACTIONS in
 * light-ui.mjs, that drives both the "Where does the light go?" prompt's buttons and the spell
 * card's action row. The prompt keeps its "Not now" (cancel), the card its "End light" (end); the
 * entries they share carry the same label, the same icon, in the same order, and each card button
 * runs the light action the table names.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, standardWorld, activityOf, flush, settle, el, ID, NOW } from "./fixtures/world.mjs";
import { LIGHT_ACTIONS, bindActions } from "../light-ui.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

const F = await boot({ world: standardWorld() });
await settle(mock);
const lightItem = () => game.actors.get(ID.hero).items.get(ID.light);

function usageCard() {
  const list = el("ul", { className: "unlist" });
  const section = el("section", { className: "icon-row", children: [list] });
  const card = el("div", { className: "chat-card", children: [el("header"), section] });
  return el("div", { className: "message-content", children: [card] });
}

const iconOf = html => /class="([^"]+)"/.exec(html)?.[1];

test("senses-EXT-2: LIGHT_ACTIONS is one frozen table (action, icon, label key, handler)", () => {
  assert.ok(Array.isArray(LIGHT_ACTIONS), "light-ui.mjs exports LIGHT_ACTIONS");
  assert.ok(Object.isFrozen(LIGHT_ACTIONS), "the table is frozen");
  for (const row of LIGHT_ACTIONS) assert.ok(Object.isFrozen(row), `row ${row.action} is frozen`);
  assert.deepEqual(LIGHT_ACTIONS.map(r => [r.action, r.icon, r.label, r.handler, !!r.dialog, !!r.card]), [
    ["me", "fa-solid fa-user", "PENTARYN_SENSES.Light.OnMe", "onMe", true, true],
    ["pick", "fa-solid fa-crosshairs", "PENTARYN_SENSES.Light.Pick", "pickAndCast", true, true],
    ["end", "fa-solid fa-lightbulb-slash", "PENTARYN_SENSES.Light.End", "end", false, true],
    ["cancel", "fa-solid fa-xmark", "PENTARYN_SENSES.Light.NotNow", null, true, false],
  ]);
});

test("senses-EXT-2: the prompt's buttons and the card's row both come from LIGHT_ACTIONS", async () => {
  F.dialogs.length = 0;
  F.dialogChoice = null;
  F.fire("dnd5e.postUseActivity", activityOf(lightItem(), "actLightSummon01"));
  await flush();
  const dialog = F.dialogs.at(-1).buttons.map(b => ({ action: b.action, icon: b.icon, label: b.label }));
  const card = usageCard();
  F.fire("dnd5e.renderChatMessage", { type: "usage", system: { item: { uuid: lightItem().uuid } } }, card);
  const row = card.querySelectorAll("[data-ps-light]")
    .map(b => ({ action: b.dataset.psLight, icon: iconOf(b.innerHTML), label: b.getAttribute("aria-label") }));
  const want = key => LIGHT_ACTIONS.filter(r => r[key]).map(r => ({ action: r.action, icon: r.icon, label: _loc(r.label) }));
  assert.deepEqual(dialog, want("dialog"));
  assert.deepEqual(row, want("card"));
  assert.equal(F.dialogs.at(-1).buttons[0].default, true, "On me stays the prompt's default");

  // each card button runs the handler its row names
  const ran = [];
  const spy = Object.fromEntries(["onMe", "pickAndCast", "end", "toggle", "hood", "run"]
    .map(h => [h, () => { ran.push(h); }]));
  bindActions(spy);
  for (const b of card.querySelectorAll("[data-ps-light]")) b.click();
  await flush();
  assert.deepEqual(ran, LIGHT_ACTIONS.filter(r => r.card).map(r => r.handler));
});
