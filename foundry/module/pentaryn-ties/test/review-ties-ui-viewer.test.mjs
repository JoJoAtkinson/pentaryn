/**
 * Final code review (ties-ui-M11): the Attributes tab's build and bind must agree on whose knowledge
 * the tab is for. Build used to borrow the user's assigned character on an NPC tab while bind took
 * "a character sheet or nobody", so a GM's Mark-as-learned button on an NPC tab drew and did nothing.
 * Ruling: one viewerFor(actor) for both — a character sheet is its own viewer, any other sheet
 * borrows the user's assigned character (GM and player alike); with none, no button is drawn.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el } from "./fixtures/dom.mjs";

const PC = "zzVwrPc000000001";
const NPC = "zzVwrNpc00000001";
const REGISTRY = [{ id: "city", title: "Vel", category: "City", secret: false, lore: [{ id: "c1", label: "Walls", dc: 11, skill: "his", text: "<p>Three rings.</p>", miss: "" }] }];

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Viewer PC", type: "character", flags: { "pentaryn-ties": { attributes: ["city"] } } },
    { id: NPC, name: "ZZ Viewer NPC", flags: { "pentaryn-ties": { attributes: ["city"] } } },
  ],
});
const AUI = await import("../attributes-ui.mjs");
const pc = game.actors.get(PC);
const npc = game.actors.get(NPC);

const mount = actor => {
  const section = el("section");
  section.innerHTML = AUI.buildAttributesHTML(actor);
  AUI.bindAttributes(section.firstElementChild, actor, () => {});
  return section;
};
const learnedButtons = root => root.querySelectorAll(".pt-lore-btn").filter(b => b.dataset.action === "attr-learned");

test("ties-ui-M11 viewerFor: a character sheet is its own viewer; any other sheet borrows the assigned character", () => {
  assert.equal(typeof AUI.viewerFor, "function", "attributes-ui.mjs exports viewerFor");
  game.user.character = pc;
  assert.equal(AUI.viewerFor(pc), pc);
  assert.equal(AUI.viewerFor(npc), pc, "an NPC tab borrows the user's character");
  assert.equal(AUI.viewerFor(npc, npc), npc, "an explicit viewer wins");
  game.user.character = null;
  assert.equal(AUI.viewerFor(pc), pc);
  assert.equal(AUI.viewerFor(npc), null, "no assigned character, no viewer");
});

test("ties-ui-M11: Mark as learned on an NPC tab grants to the GM's assigned character, and the toast names them", async () => {
  game.user.character = pc;
  const [btn] = learnedButtons(mount(npc));
  assert.ok(btn, "the NPC tab draws a Mark-as-learned button");
  assert.ok(btn.listeners.click?.length, "the button is bound");
  const mark = F.calls.length;
  await settle(btn.dispatch("click"));
  const granted = pc.getFlag("pentaryn-ties", "granted") ?? {};
  assert.ok(Object.values(granted).some(g => g.text === "<p>Three rings.</p>"), "the assigned character received the fact");
  const toast = F.calls.slice(mark).find(c => c.op === "notify" && c.level === "info");
  assert.ok(toast?.message.includes("ZZ Viewer PC"), `the toast names who received it: ${toast?.message}`);
  game.user.character = null;
});

test("ties-ui-M11: with no assigned character an NPC tab draws no Mark-as-learned button", () => {
  game.user.character = null;
  assert.equal(learnedButtons(mount(npc)).length, 0, "nobody to grant to, so no dead button");
});
