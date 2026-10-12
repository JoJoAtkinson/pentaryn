// B4: the Hit Dice − / + on dnd5e's character sheet (renderCharacterActorSheet), outside edit mode,
// for whoever can edit the sheet. The built DOM is pinned as HTML; clicks spend / restore one die.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { IDS, MODULE, drain, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const wiz = W.actor(IDS.wiz);

const sheet = () => W.html(`<section><div class="meter-group"><div class="label">Hit Dice</div><div class="meter hit-dice"></div></div></section>`);
const app = (o = {}) => ({ document: wiz, isEditable: true, isEditMode: false, ...o });
const label = el => el.querySelector(".meter-group > .label");

const BUTTONS = (spendOff, restoreOff) =>
  `Hit Dice<span class="pr-hd">`
  + `<button type="button" class="pr-hd-btn unbutton" data-pr-hd="spend" data-tooltip="Spend a Hit Die" aria-label="Spend a Hit Die"${spendOff ? " disabled" : ""}><i class="fa-solid fa-minus" inert></i></button>`
  + `<button type="button" class="pr-hd-btn unbutton" data-pr-hd="restore" data-tooltip="Regain a Hit Die" aria-label="Regain a Hit Die"${restoreOff ? " disabled" : ""}><i class="fa-solid fa-plus" inert></i></button>`
  + `</span>`;

test("play mode, editable: a − and a + after the label, once per render", () => {
  const el = sheet();
  F.fire("renderCharacterActorSheet", app(), el);
  F.fire("renderCharacterActorSheet", app(), el);
  assert.equal(label(el).innerHTML, BUTTONS(false, false));
});

test("the buttons' disabled state follows the summary (value 0 → no −, value = max → no +)", () => {
  const none = W.html(`<section><div class="meter-group"><div class="label">HD</div><div class="meter hit-dice"></div></div></section>`);
  const empty = { ...wiz, items: wiz.items, classes: { a: { id: "a", system: { hd: { denomination: "d8", value: 0, spent: 2 } } } }, system: { attributes: { hd: {} } } };
  F.fire("renderCharacterActorSheet", app({ document: empty }), none);
  assert.match(label(none).innerHTML, /data-pr-hd="spend"[^>]* disabled/);
  assert.doesNotMatch(label(none).innerHTML, /data-pr-hd="restore"[^>]* disabled/);
  const full = { ...empty, classes: { a: { id: "a", system: { hd: { denomination: "d8", value: 2, spent: 0 } } } } };
  F.fire("renderCharacterActorSheet", app({ document: full }), none);
  assert.match(label(none).innerHTML, /data-pr-hd="restore"[^>]* disabled/);
  assert.doesNotMatch(label(none).innerHTML, /data-pr-hd="spend"[^>]* disabled/);
});

test("edit mode, not editable, no document, the setting off: removed and not redrawn", async () => {
  const el = sheet();
  F.fire("renderCharacterActorSheet", app(), el);
  F.fire("renderCharacterActorSheet", app({ isEditMode: true }), el);
  assert.equal(label(el).innerHTML, "Hit Dice");
  F.fire("renderCharacterActorSheet", app({ isEditable: false }), el);
  F.fire("renderCharacterActorSheet", app({ document: null }), el);
  assert.equal(label(el).innerHTML, "Hit Dice");
  await F.game.settings.set(MODULE, "hdControls", false);
  F.fire("renderCharacterActorSheet", app(), el);
  assert.equal(label(el).innerHTML, "Hit Dice");
  await F.game.settings.set(MODULE, "hdControls", true);
});

test("app.actor stands in for app.document; app.element for a non-element argument; no meter → nothing", () => {
  const el = sheet();
  F.fire("renderCharacterActorSheet", { actor: wiz, isEditable: true, isEditMode: false, element: el }, {});
  assert.equal(label(el).innerHTML, BUTTONS(false, false));
  const bare = W.html(`<section><div class="label">Hit Dice</div></section>`);
  F.fire("renderCharacterActorSheet", app(), bare);
  assert.equal(bare.innerHTML, `<div class="label">Hit Dice</div>`);
});

test("clicks: − spends the largest, + restores the largest spent; the button is disabled meanwhile", async () => {
  const el = sheet();
  F.fire("renderCharacterActorSheet", app(), el);
  const wrap = el.querySelector(".pr-hd");
  const [minus, plus] = wrap.querySelectorAll("button");
  const before = F.calls.length;
  const icon = minus.querySelector("i");
  const { event } = await wrap.fire("click", { target: icon });
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  assert.equal(minus.disabled, true);
  await wrap.fire("click", { target: plus });
  await wrap.fire("click", { target: wrap });                 // not on a button: nothing
  await wrap.fire("click", { target: minus });                // disabled: nothing
  await drain();
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update").map(c => [c.uuid.split(".").pop(), c.changes]), [
    ["ftrclass00000001", { "system.hd.spent": 1 }],
    ["ftrclass00000001", { "system.hd.spent": 0 }],          // the d10 just spent is the largest spent
  ]);
});

test("a failed write is warned and the button comes back", async () => {
  const el = sheet();
  F.fire("renderCharacterActorSheet", app(), el);
  const wrap = el.querySelector(".pr-hd");
  const minus = wrap.querySelector("button");
  const realGet = wiz.items.get.bind(wiz.items);
  wiz.items.get = () => ({ update: async () => { throw new Error("write refused"); } });
  W.take();
  await wrap.fire("click", { target: minus });
  wiz.items.get = realGet;
  assert.equal(minus.disabled, false);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | hit die change failed`, "write refused"]]);
});
