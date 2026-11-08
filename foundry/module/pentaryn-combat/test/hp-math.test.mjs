// Feedback triage 2026-11, cluster K (`GaMIoP`): "50-10" typed into the Token HUD's bar box or an
// actor sheet's HP box gives 40 (setting hpMath). Every existing form (=40, -10, +5, 50%, 40) reaches
// core / dnd5e exactly as typed; the boxes carry the tooltip; both wraps are kit patches with a
// combat- adjustments row and come off on uninstall.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { LANG, MODULE, setupWorld } from "./fixtures/world.mjs";
import { patches } from "../lib/patch.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;

/* core's TokenHUD (the override at foundry.mjs:98851 → BasePlaceableHUD#_parseAttributeInput) */
const parsed = [];
class BasePlaceableHUD {
  _parseAttributeInput(name, attr, input) {
    parsed.push({ name, input });
    const isDelta = input.startsWith("+") || input.startsWith("-");
    const v = Number(input.replace(/^=/, ""));
    return { attribute: name, value: isDelta ? attr.value + v : v, isDelta, isBar: true };
  }
}
class TokenHUD extends BasePlaceableHUD {
  _parseAttributeInput(name, attr, input) { return super._parseAttributeInput(name, attr, input); }
}
F.foundry.applications.hud = { TokenHUD };

/* dnd5e's BaseActorSheet#_onChangeInputDelta (6.0.6:65787) and the group sheet that calls super (68506) */
const seen = [];
class BaseActorSheet { _onChangeInputDelta(event) { seen.push(event.target?.value ?? null); } }
class GroupActorSheet extends BaseActorSheet {
  _onChangeInputDelta(event) { super._onChangeInputDelta(event); seen.push(`group:${event.target.value}`); }
}
Object.defineProperty(globalThis, "dnd5e", { value: { applications: { actor: { BaseActorSheet } } }, configurable: true, writable: true });

/* Roll.safeEval as core's: arithmetic only, a syntax error throws */
globalThis.Roll.safeEval = expression => {
  if (!/^[\d\s()+\-*/.]+$/.test(expression)) throw new Error(`not safe: ${expression}`);
  return Function(`"use strict"; return (${expression});`)();
};

await import("../combat.mjs");
await import("../hud.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const hud = new TokenHUD();
const bar = { value: 50, max: 60 };

test("Token HUD: an expression reaches core as its '=result'; every existing form exactly as typed", () => {
  const cases = [
    ["50-10", "=40"], ["2*(3+4)", "=14"], ["7/2", "=3"], ["100 - 1", "=99"],
    ["=50", "=50"], ["-10", "-10"], ["+5", "+5"], ["50%", "50%"], ["40", "40"], ["", ""],
    ["50-", "50-"],   // Roll.safeEval throws: left as typed (core's Number → NaN, as today)
    ["abc", "abc"],
  ];
  for (const [typed, want] of cases) {
    parsed.length = 0;
    hud._parseAttributeInput("bar1", bar, typed);
    assert.deepEqual(parsed, [{ name: "bar1", input: want }], JSON.stringify(typed));
  }
  assert.equal(hud._parseAttributeInput("bar1", bar, "50-10").value, 40);
  assert.equal(hud._parseAttributeInput("bar1", bar, "-10").value, 40, "a delta is still core's own arithmetic");
});

test("setting hpMath off: the typed text reaches core untouched", async () => {
  await F.game.settings.set(MODULE, "hpMath", false);
  try {
    parsed.length = 0;
    hud._parseAttributeInput("bar1", bar, "50-10");
    assert.deepEqual(parsed, [{ name: "bar1", input: "50-10" }]);
  } finally { await F.game.settings.set(MODULE, "hpMath", true); }
});

test("actor sheet: the input's value is rewritten before dnd5e's parser reads it; a subclass calling super sees the same", () => {
  const input = doc.createElement("input");
  input.setAttribute("name", "system.attributes.hp.value");
  for (const [typed, want] of [["50-10", "=40"], ["=12", "=12"], ["-3", "-3"], ["17", "17"]]) {
    seen.length = 0;
    input.value = typed;
    new GroupActorSheet()._onChangeInputDelta({ target: input });
    assert.deepEqual(seen, [want, `group:${want}`], typed);
    assert.equal(input.value, want);
  }
  seen.length = 0;
  assert.doesNotThrow(() => new BaseActorSheet()._onChangeInputDelta({ target: null }), "no target: dnd5e's own handler decides");
  assert.deepEqual(seen.length, 1);
});

test("tooltips: the Token HUD's bar boxes, the sheet's HP box and its meter say what the box understands", () => {
  const tip = LANG.PENTARYN_COMBAT.HpMath.Tip;
  assert.equal(tip, "=40 sets · -10 subtracts · 50-10 does the math");
  const hudHtml = doc.createElement("div");
  hudHtml.innerHTML = '<input type="text" name="elevation"><input type="text" name="bar2"><input type="text" name="bar1">';
  F.Hooks.callAll("renderTokenHUD", hud, hudHtml);
  assert.deepEqual([...hudHtml.querySelectorAll("input")].map(i => i.dataset.tooltipText), [undefined, tip, tip]);
  const sheet = doc.createElement("div");
  sheet.innerHTML = '<div class="meter"><div class="progress hit-points" role="meter"><div class="label">50 / 60</div><input type="text" name="system.attributes.hp.value" hidden></div></div><input type="text" name="system.attributes.hp.temp">';
  F.Hooks.callAll("renderBaseActorSheet", {}, sheet);
  assert.equal(sheet.querySelector('input[name="system.attributes.hp.value"]').dataset.tooltipText, tip);
  assert.equal(sheet.querySelector('[role="meter"]').dataset.tooltipText, tip, "the box is hidden until the meter is clicked: the meter carries the tip");
  assert.equal(sheet.querySelector('input[name="system.attributes.hp.temp"]').dataset.tooltipText, undefined, "only the HP box");
  const own = doc.createElement("div");
  own.innerHTML = '<div role="meter" data-tooltip="DND5E.HitPoints"><input type="text" name="system.attributes.hp.value"></div>';
  F.Hooks.callAll("renderBaseActorSheet", {}, own);
  assert.equal(own.querySelector('[role="meter"]').dataset.tooltipText, undefined, "a meter with dnd5e's own tooltip keeps it");
});

test("tooltips with the setting off: nothing is written", async () => {
  await F.game.settings.set(MODULE, "hpMath", false);
  try {
    const hudHtml = doc.createElement("div");
    hudHtml.innerHTML = '<input type="text" name="bar1">';
    F.Hooks.callAll("renderTokenHUD", hud, hudHtml);
    assert.equal(hudHtml.querySelector("input").dataset.tooltipText, undefined);
  } finally { await F.game.settings.set(MODULE, "hpMath", true); }
});

test("both wraps are kit patches naming a combat- adjustments row; a second init does not wrap again", () => {
  const rows = patches().filter(p => p.moduleId === MODULE && p.marker === "_pcHpMath").map(({ label, adjustments }) => ({ label, adjustments }));
  assert.deepEqual(rows, [
    { label: "TokenHUD#_parseAttributeInput", adjustments: "combat-core-token-hud-arithmetic" },
    { label: "BaseActorSheet#_onChangeInputDelta", adjustments: "combat-dnd5e-sheet-arithmetic" },
  ]);
  const before = [TokenHUD.prototype._parseAttributeInput, BaseActorSheet.prototype._onChangeInputDelta];
  F.Hooks.callAll("init");
  assert.deepEqual([TokenHUD.prototype._parseAttributeInput, BaseActorSheet.prototype._onChangeInputDelta], before);
  assert.equal(patches().filter(p => p.marker === "_pcHpMath").length, 2);
});

test("uninstall: both prototypes are as before and the parsers read the raw text again", async () => {
  const { ctx } = await import("../context.mjs");
  assert.equal(TokenHUD.prototype._parseAttributeInput._pcHpMath, true);
  ctx.uninstall();
  assert.equal(TokenHUD.prototype._parseAttributeInput._pcHpMath, undefined);
  assert.equal(BaseActorSheet.prototype._onChangeInputDelta._pcHpMath, undefined);
  assert.deepEqual(patches().filter(p => p.marker === "_pcHpMath"), []);
  parsed.length = 0;
  hud._parseAttributeInput("bar1", bar, "50-10");
  assert.deepEqual(parsed, [{ name: "bar1", input: "50-10" }]);
});
