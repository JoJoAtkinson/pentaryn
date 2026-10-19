// Feedback EBGqNA: a cleric's Spells tab (80 spells, 56 unprepared) was overwhelming. The tab opens on
// the spells the character can cast today, through dnd5e's own `dnd5e.filterItem` seam, with a
// "Show: Prepared (n) / All spells (n)" switch drawn before the list's search bar; the choice is a
// user flag per actor. Before this feature the hook was not registered at all, so every spell showed.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

const CLERIC = "clericpc00000001";
const own = { default: 0, [IDS.player]: 3 };
const spell = (id, name, system) => ({ id, name, type: "spell", system: { canPrepare: true, prepared: 0, linkedActivity: null, ...system } });
const cleric = () => makeActor({
  id: CLERIC, name: "Sabriel", type: "character", ownership: own, system: { attributes: { hd: {} } },
  items: [
    { id: "clrclass00000001", name: "Cleric", type: "class", system: { identifier: "cleric", levels: 5 } },
    spell("sacredflame00001", "Sacred Flame", { level: 0, prepared: 0 }),                  // a cantrip never ticked: shown
    spell("bless00000000001", "Bless", { level: 1, prepared: 1 }),                         // prepared: shown
    spell("cureWounds000001", "Cure Wounds", { level: 1, prepared: 2 }),                   // always prepared: shown
    spell("command000000001", "Command", { level: 1, prepared: 0 }),                       // unprepared: hidden
    spell("revivify00000001", "Revivify", { level: 3, prepared: 0 }),                      // unprepared: hidden
    spell("mistystep0000001", "Misty Step", { level: 2, prepared: 0, canPrepare: false }), // at-will / innate: shown
    spell("fireball00000002", "Fireball", { level: 3, prepared: 0, linkedActivity: { id: "x" } }), // cast from an item: shown
    { id: "mace000000000001", name: "Mace", type: "weapon", system: {} },
  ],
});

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld({ extraActors: [cleric()] });
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const sab = W.actor(CLERIC);
const item = id => sab.items.get(id);

const sheetHTML = () => W.html(
  `<section><div class="tab spells" data-tab="spells"><section class="top"></section>`
  + `<div class="inventory-element"><div class="middle"><item-list-controls for="spells"></item-list-controls></div><div class="items-list"></div></div>`
  + `</div></section>`);
const app = (o = {}) => ({ document: sab, renders: 0, render() { this.renders++; }, ...o });
const shown = (sheet = app()) => [...sab.items].filter(i => F.fireCall("dnd5e.filterItem", sheet, i, new Set()) !== false).map(i => i.name);
const bar = el => el.querySelector(".pr-spell-view");

test("default view is Prepared: unprepared levelled spells are hidden; cantrips, always, at-will, item-cast spells and non-spells stay", () => {
  assert.deepEqual(shown(), ["Cleric", "Sacred Flame", "Bless", "Cure Wounds", "Misty Step", "Fireball", "Mace"]);
});

test("the switch is drawn before the search bar, with counts, Prepared pressed, once per render", () => {
  const el = sheetHTML();
  F.fire("renderCharacterActorSheet", app(), el);
  F.fire("renderCharacterActorSheet", app(), el);
  assert.equal(el.querySelectorAll(".pr-spell-view").length, 1);
  const middle = el.querySelector(".inventory-element > .middle");
  assert.equal(middle.parentNode.children[0], bar(el), "first in the inventory element, before .middle");
  assert.equal(bar(el).outerHTML,
    `<div class="pr-spell-view" role="group" aria-label="Show">`
    + `<span class="pr-sv-label">Show</span>`
    + `<button type="button" class="pr-sv-btn unbutton active" data-pr-spell-view="prepared" data-tooltip="${F.game.i18n.localize("PENTARYN_RIDERS.spellView.preparedTip")}" aria-pressed="true">Prepared (5)</button>`
    + `<button type="button" class="pr-sv-btn unbutton" data-pr-spell-view="all" data-tooltip="Every spell on this sheet, including the 2 you have not prepared. Prepare or unprepare them here." aria-pressed="false">All spells (7)</button>`
    + `<span class="pr-sv-note">2 unprepared hidden</span>`
    + `</div>`);
});

test("All spells: a click stores the user flag, re-applies dnd5e's filters in place and redraws the switch", async () => {
  const el = sheetHTML();
  const controls = el.querySelector("item-list-controls");
  let applied = 0;
  controls._applyFilters = () => { applied++; };
  const a = app();
  F.fire("renderCharacterActorSheet", a, el);
  const all = bar(el).querySelector('[data-pr-spell-view="all"]');
  const { event } = await bar(el).fire("click", { target: all });
  await drain();
  assert.equal(event.defaultPrevented, true);
  assert.equal(applied, 1);
  assert.equal(a.renders, 0, "no full re-render when the list controls are there");
  assert.equal(F.game.user.getFlag(MODULE, `spellView.${CLERIC}`), "all");
  assert.equal(bar(el).querySelector(".active").dataset.prSpellView, "all");
  assert.equal(bar(el).querySelector(".pr-sv-note"), null);
  assert.equal(shown().length, 9, "every item shows");

  // the pressed button again: nothing; back to Prepared
  await bar(el).fire("click", { target: bar(el).querySelector('[data-pr-spell-view="all"]') });
  assert.equal(applied, 1);
  await bar(el).fire("click", { target: bar(el).querySelector('[data-pr-spell-view="prepared"]') });
  await drain();
  assert.equal(applied, 2);
  assert.equal(F.game.user.getFlag(MODULE, `spellView.${CLERIC}`), "prepared");
  assert.equal(shown().length, 7);
});

test("the choice is per user: another user still opens on Prepared", async () => {
  await F.game.user.setFlag(MODULE, `spellView.${CLERIC}`, "all");
  assert.equal(shown().length, 9);
  F.become({ userId: IDS.player });
  assert.equal(shown().length, 7);
  F.become({ userId: IDS.gm });
  await F.game.user.setFlag(MODULE, `spellView.${CLERIC}`, "prepared");
});

test("no list controls on the sheet: the click falls back to a full render", async () => {
  const el = W.html(`<section><div class="tab" data-tab="spells"><div class="inventory-element"></div></div></section>`);
  const a = app();
  F.fire("renderCharacterActorSheet", a, el);
  assert.equal(el.querySelector(".inventory-element").children[0], bar(el), "prepended when there is no .middle");
  await bar(el).fire("click", { target: bar(el).querySelector('[data-pr-spell-view="all"]') });
  await drain();
  assert.equal(a.renders, 1);
  await F.game.user.setFlag(MODULE, `spellView.${CLERIC}`, "prepared");
});

test("no switch and no filtering: nothing unprepared, an NPC, the setting off; no spells tab → nothing", async () => {
  const wizEl = sheetHTML();
  const sorc = W.actor(IDS.sorc);
  F.fire("renderCharacterActorSheet", app({ document: sorc }), wizEl);
  assert.equal(bar(wizEl), null, "a sorcerer has nothing to hide");

  const npcSheet = app({ document: { ...sab, documentName: "Actor", type: "npc", id: CLERIC, items: sab.items } });
  assert.notEqual(F.fireCall("dnd5e.filterItem", npcSheet, item("command000000001"), new Set()), false);

  const el = sheetHTML();
  F.fire("renderCharacterActorSheet", app(), el);
  assert.ok(bar(el));
  await F.game.settings.set(MODULE, "spellView", false);
  F.fire("renderCharacterActorSheet", app(), el);
  assert.equal(bar(el), null, "removed when the setting goes off");
  assert.equal(shown().length, 9);
  await F.game.settings.set(MODULE, "spellView", true);

  const bare = W.html(`<section><div class="tab" data-tab="features"></div></section>`);
  F.fire("renderCharacterActorSheet", app(), bare);
  assert.equal(bare.innerHTML, `<div class="tab" data-tab="features"></div>`);
});

test("a flag write that fails is warned once and the choice holds for the session", async () => {
  const el = sheetHTML();
  F.fire("renderCharacterActorSheet", app(), el);
  const real = F.game.user.setFlag;
  F.game.user.setFlag = async () => { throw new Error("no permission"); };
  W.take();
  await bar(el).fire("click", { target: bar(el).querySelector('[data-pr-spell-view="all"]') });
  await drain();
  F.game.user.setFlag = real;
  assert.deepEqual(W.take(), [["warn", `${MODULE} | spell view not saved (kept for this session)`, "no permission"]]);
  assert.equal(shown().length, 9);
});
