// Feedback triage 2026-11, cluster L6 (`M4D2Im`; Joe 2026-11-07, review adjustment): a plain fourth
// button "Roll manually" on dnd5e's d20 roll window only. It rolls in Normal mode, marks the roll
// (options.pentarynManual), and for that one roll's evaluation the client's dice configuration reads
// the d20 as Manual, so core's Roll Resolution box opens for it. The flip is scoped to the marked
// roll's synchronous identification: a roll evaluating alongside it reads the real configuration, and
// so does the marked roll itself once its terms are rolled. No setting, no toggle, no stored state.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { LANG, MODULE, setupWorld } from "./fixtures/world.mjs";
import { patches } from "../lib/patch.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
const W = await setupWorld();
const { F, doc } = W;

/* dnd5e 6.0.6's D20RollConfigurationDialog#_finalizeConfig (:19468) and the attack subclass that inherits it */
const ADV = F.CONFIG.Dice.D20Roll.ADV_MODE;
class RollConfigurationDialog { _finalizeConfig(config, action) {} }
class D20RollConfigurationDialog extends RollConfigurationDialog {
  _finalizeConfig(config, action) {
    let advantageMode = ADV.NORMAL;
    if (action === "advantage") advantageMode = ADV.ADVANTAGE;
    else if (action === "disadvantage") advantageMode = ADV.DISADVANTAGE;
    for (const roll of config.rolls ?? []) {
      roll.options ??= {};
      roll.options.advantageMode = advantageMode;
    }
  }
}
class AttackRollConfigurationDialog extends D20RollConfigurationDialog {}
Object.defineProperty(globalThis, "dnd5e", { value: { applications: { dice: { D20RollConfigurationDialog } } }, configurable: true, writable: true });

/* core's ClientSettings: game.settings is an instance whose get() lives on the prototype */
const ownGet = F.game.settings.get;
class ClientSettings { get(namespace, key, options) { return ownGet.call(this, namespace, key, options); } }
delete F.game.settings.get;
Object.setPrototypeOf(F.game.settings, ClientSettings.prototype);
F.foundry.helpers = { ClientSettings };
F.game.settings.register("core", "diceConfiguration", { scope: "client", config: false, type: Object, default: {} });
await F.game.settings.set("core", "diceConfiguration", { d6: "mersenne" });
const REAL = { d6: "mersenne" };

/*
 * core's Roll#_evaluate (14.369:34512), reduced to what the wrap relies on: before the first await
 * the dice configuration is read (resolverImplementation, RollResolver#awaitFulfillment →
 * identifyFulfillableTerms, both plain reads and the Setting-document read), and after it the terms
 * roll and read it again (DiceTerm#_roll).
 */
const reads = [];
class Roll {
  static DICE_CONFIGURATION_SETTING = "diceConfiguration";
  constructor(formula, data = {}, options = {}) { this.formula = formula; this.data = data; this.options = options; }
  async _evaluate(options = {}) {
    reads.push({ roll: this.options.id, when: "identify", config: F.game.settings.get("core", "diceConfiguration"),
      document: F.game.settings.get("core", "diceConfiguration", { document: true }) });
    await new Promise(r => setImmediate(r));
    reads.push({ roll: this.options.id, when: "term", config: F.game.settings.get("core", "diceConfiguration") });
    return this;
  }
}
F.foundry.dice = { Roll };

let manualRolls = true;   // MANUAL_ROLLS is on roles 2–4 in this world
F.game.user.hasPermission = p => p === "MANUAL_ROLLS" && manualRolls;

await import("../combat.mjs");
await import("../hud.mjs");
F.calls.length = 0;
F.fire("init");
F.fire("setup");
F.fire("ready");

const BUTTONS = '<form><nav class="dialog-buttons flexrow"><button type="submit" data-action="advantage">Advantage</button><button type="submit" data-action="normal" autofocus>Normal</button><button type="submit" data-action="disadvantage">Disadvantage</button></nav></form>';
function d20Window() {
  const el = doc.createElement("div");
  el.innerHTML = BUTTONS;
  return el;
}
const labels = el => [...el.querySelectorAll("nav.dialog-buttons button")].map(b => b.dataset.action);

test("the d20 roll window gets one more submit button, data-action manual, after the three modes; a re-render adds no second", () => {
  const html = d20Window();
  F.Hooks.callAll("renderD20RollConfigurationDialog", new AttackRollConfigurationDialog(), html);
  assert.deepEqual(labels(html), ["advantage", "normal", "disadvantage", "manual"]);
  const button = html.querySelector("button.pc-roll-manually");
  assert.equal(button.getAttribute("type"), "submit", "dnd5e's #handleFormSubmission reads event.submitter.dataset.action");
  assert.equal(button.hasAttribute("autofocus"), false, "Enter stays the default mode");
  assert.ok(button.textContent.includes(LANG.PENTARYN_COMBAT.RollManually.Label));
  assert.equal(button.dataset.tooltipText, LANG.PENTARYN_COMBAT.RollManually.Hint);
  assert.ok(button.querySelector("i.fa-keyboard"));
  F.Hooks.callAll("renderD20RollConfigurationDialog", new AttackRollConfigurationDialog(), html);
  assert.deepEqual(labels(html), ["advantage", "normal", "disadvantage", "manual"]);
});

test("d20 windows only: the listener is on renderD20RollConfigurationDialog, none on the damage dialog (review: no damage twin)", () => {
  assert.equal(F.listeners("renderD20RollConfigurationDialog"), 1);
  assert.equal(F.listeners("renderDamageRollConfigurationDialog"), 0);
  const html = d20Window();
  F.Hooks.callAll("renderRollConfigurationDialog", {}, html);
  assert.deepEqual(labels(html), ["advantage", "normal", "disadvantage"], "the base render hook adds nothing");
});

test("a user without MANUAL_ROLLS sees no button", () => {
  manualRolls = false;
  try {
    const html = d20Window();
    F.Hooks.callAll("renderD20RollConfigurationDialog", new AttackRollConfigurationDialog(), html);
    assert.deepEqual(labels(html), ["advantage", "normal", "disadvantage"]);
  } finally { manualRolls = true; }
});

test("_finalizeConfig('manual'): Normal mode and the roll config marked; the other actions are untouched", () => {
  const app = new AttackRollConfigurationDialog();
  const config = { rolls: [{ options: { advantageMode: ADV.ADVANTAGE } }, {}] };
  app._finalizeConfig(config, "manual");
  assert.deepEqual(config.rolls.map(r => r.options), [
    { advantageMode: ADV.NORMAL, pentarynManual: true },
    { advantageMode: ADV.NORMAL, pentarynManual: true },
  ]);
  for (const [action, mode] of [["advantage", ADV.ADVANTAGE], ["normal", ADV.NORMAL], ["disadvantage", ADV.DISADVANTAGE]]) {
    const c = { rolls: [{}] };
    app._finalizeConfig(c, action);
    assert.deepEqual(c.rolls[0].options, { advantageMode: mode }, action);
  }
  assert.doesNotThrow(() => app._finalizeConfig({}, "manual"), "no rolls: nothing to mark");
});

test("_finalizeConfig('manual') without MANUAL_ROLLS marks nothing (a crafted submit rolls digitally)", () => {
  manualRolls = false;
  try {
    const c = { rolls: [{}] };
    new D20RollConfigurationDialog()._finalizeConfig(c, "manual");
    assert.deepEqual(c.rolls[0].options, { advantageMode: ADV.NORMAL });
  } finally { manualRolls = true; }
});

test("a marked roll's identification reads the d20 as Manual; its term rolls, a roll evaluating alongside it and the Setting document read the real configuration", async () => {
  reads.length = 0;
  const marked = new Roll("1d20 + 5", {}, { id: "A", pentarynManual: true });
  const beside = new Roll("8d6", {}, { id: "B" });
  const pA = marked._evaluate();   // the synchronous prefix has run and the flag is down again
  assert.equal(F.game.settings.get("core", "diceConfiguration").d20, undefined, "between two rolls: the real configuration");
  const pB = beside._evaluate();
  await Promise.all([pA, pB]);
  assert.deepEqual(reads, [
    { roll: "A", when: "identify", config: { d6: "mersenne", d20: "manual" }, document: REAL },
    { roll: "B", when: "identify", config: REAL, document: REAL },
    { roll: "A", when: "term", config: REAL },
    { roll: "B", when: "term", config: REAL },
  ]);
  assert.deepEqual(F.game.settings.get("core", "diceConfiguration"), REAL, "the stored value was never written");
  assert.deepEqual(F.calls.filter(c => c.op === "settings.set" && c.id === "core.diceConfiguration"), [], "the dice configuration is never written");
});

test("the flip is skipped for an unmarked roll, a blind roll (allowInteractive false) and a user without MANUAL_ROLLS", async () => {
  reads.length = 0;
  await new Roll("1d20", {}, { id: "plain" })._evaluate();
  await new Roll("1d20", {}, { id: "blind", pentarynManual: true })._evaluate({ allowInteractive: false });
  manualRolls = false;
  try { await new Roll("1d20", {}, { id: "noperm", pentarynManual: true })._evaluate(); } finally { manualRolls = true; }
  assert.deepEqual(reads.map(r => [r.roll, r.when, r.config]), [
    ["plain", "identify", REAL], ["plain", "term", REAL],
    ["blind", "identify", REAL], ["blind", "term", REAL],
    ["noperm", "identify", REAL], ["noperm", "term", REAL],
  ]);
});

test("a throwing _evaluate still lowers the flag", async () => {
  const bad = new Roll("1d20", {}, { id: "bad", pentarynManual: true });
  bad._evaluate = undefined;   // the wrap sits on the prototype; make the original throw by breaking the instance's reads
  const broken = new Roll("1d20", {}, { pentarynManual: true });
  Object.defineProperty(broken, "options", { get() { return { pentarynManual: true, get id() { throw new Error("boom"); } }; } });
  await assert.rejects(() => Roll.prototype._evaluate.call(broken), /boom/);
  assert.equal(F.game.settings.get("core", "diceConfiguration").d20, undefined);
});

test("the three wraps are kit patches naming combat- rows; a second init does not wrap again", () => {
  const rows = patches().filter(p => p.moduleId === MODULE && p.marker === "_pcRollManually").map(({ label, adjustments }) => ({ label, adjustments }));
  assert.deepEqual(rows, [
    { label: "D20RollConfigurationDialog#_finalizeConfig", adjustments: "combat-dnd5e-roll-manually-action" },
    { label: "Roll#_evaluate", adjustments: "combat-core-roll-manually-evaluate" },
    { label: "ClientSettings#get", adjustments: "combat-core-roll-manually-dice-config" },
  ]);
  const before = [D20RollConfigurationDialog.prototype._finalizeConfig, Roll.prototype._evaluate, ClientSettings.prototype.get];
  F.Hooks.callAll("init");
  assert.deepEqual([D20RollConfigurationDialog.prototype._finalizeConfig, Roll.prototype._evaluate, ClientSettings.prototype.get], before);
  assert.equal(patches().filter(p => p.marker === "_pcRollManually").length, 3);
});

test("uninstall: the prototypes are as before; settings still read", async () => {
  const { ctx } = await import("../context.mjs");
  assert.equal(ClientSettings.prototype.get._pcRollManually, true);
  ctx.uninstall();
  assert.equal(ClientSettings.prototype.get._pcRollManually, undefined);
  assert.equal(Roll.prototype._evaluate._pcRollManually, undefined);
  assert.equal(D20RollConfigurationDialog.prototype._finalizeConfig._pcRollManually, undefined);
  assert.deepEqual(patches().filter(p => p.marker === "_pcRollManually"), []);
  assert.deepEqual(F.game.settings.get("core", "diceConfiguration"), REAL);
  const c = { rolls: [{}] };
  new D20RollConfigurationDialog()._finalizeConfig(c, "manual");
  assert.deepEqual(c.rolls[0].options, { advantageMode: ADV.NORMAL }, "dnd5e's own: an unknown action is Normal, nothing marked");
});
