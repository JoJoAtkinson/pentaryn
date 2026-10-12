// The swallowed and warned failure paths the other suites do not reach (coverage as gap finder):
// each `.catch(() => null)` keeps its value, each warn keeps its text, and the fallbacks for an
// older or partial runtime (no escapeHTML, no setTargets, no label getter, a Roll that throws, a
// Multiattack choice, a Frenzy rider while raging). S4 converts these catches to log.swallow /
// log.debug; these pins say what each returned before.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeActor, makeCombat, makeEffect, makeMessage, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { argonTooltip } from "./fixtures/argon.mjs";
import { barbarian, druid, fighter, rogue, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc, argon: A } = W;
const lines = captureConsole();
const fig = fighter();
const rog = rogue();
const brb = barbarian();
const drd = makeActor({ id: "druidBear0000002", name: "Druid (Bear)", polymorphed: true, items: [
  { id: "multiattack00007", name: "Multiattack", type: "feat", system: { description: { value: "<p>The bear makes two attacks, using [[/item .bite]] or [[/item .claw]] in any combination.</p>" } } },
  { id: "bite", name: "Bite", type: "weapon", system: { type: { value: "natural" }, properties: new Set() }, activities: [{ id: "biteAtk" }] },
  { id: "claw", name: "Claw", type: "weapon", system: { type: { value: "natural" }, properties: new Set() }, activities: [{ id: "clawAtk" }] },
] });
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const toks = Object.fromEntries([fig, rog, brb, drd, gob].map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
const combat = makeCombat({ id: "c1", entries: [fig, rog, brb, drd, gob].map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });
const onTurn = actor => setTurn(combat, { turn: combat.combatants.contents.findIndex(c => c.actor === actor) });

await import("../combat.mjs");
await import("../hud.mjs");
const seq = await import("../sequence.mjs");
const riders = await import("../turn-riders.mjs");
const shapes = await import("../shapes.mjs");
const strip = await import("../strip.mjs");
F.fire("init");
F.fire("setup");
F.game.combats.map = () => { throw new Error("combats not ready"); };   // the ready orphan sweep rejects
F.fire("ready");
await drain();
delete F.game.combats.map;
mock.timers.tick(0);
await drain();
for (const a of F.game.actors) delete a.flags.enhancedcombathud;
const readyConsole = lines.splice(0);
F.calls.length = 0;
const act = (actor, itemId) => [...actor.items.get(itemId).system.activities.values()][0];

test("ready: an orphan-sweep rejection is warned", () => {
  assert.deepEqual(readyConsole.filter(l => l.level === "warn"), [{ level: "warn", text: "pentaryn-combat | orphan flag sweep", err: "combats not ready" }]);
});

test("hud: a refresh whose tooltip data rejects; a Multiattack weapon choice; releaseTargets without setTargets; no pip getters", async () => {
  // Multiattack with a choice ("two attacks, using Bite or Claw in any combination"): the picker offers both
  onTurn(drd);
  const ma = shapes.multiattackOf(drd);
  const action = new A.ActionPanel({ label: "DND5E.Action" });
  A.ARGON.components.main = [action];
  A.ARGON._actor = drd;
  A.ARGON._token = toks[drd.id];
  F.Hooks.callAll("renderActionPanelArgonComponent", action, action.element, drd);
  const fa = action._buttons[0];
  const pick = fa._onRightClick();
  await drain();
  mock.timers.tick(0);
  const picker = doc.body.querySelector(".pentaryn-combat-picker");
  const tiles = picker.querySelectorAll("button[data-id]").map(b => [b.dataset.id, b.querySelector(".pc-swings").textContent]);
  await picker.fire("click", { target: picker.querySelector("button[data-id]") });
  await pick;
  mock.timers.tick(60);
  await drain();
  // a tooltip refresh whose data rejects: swallowed
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  fa.getTooltipData = async () => { throw new Error("stale"); };
  fa.refresh();
  await drain();
  A.ARGON._tooltip = null;
  // releaseTargets with no setTargets (Argon's picker path)
  onTurn(fig);
  A.ARGON._actor = fig;
  F.game.user.targets.add(toks[gob.id]);
  const keep = F.canvas.tokens.setTargets;
  F.canvas.tokens.setTargets = undefined;
  A.ARGON.pickScript.push(null);
  const a = act(fig, "longsword0000001");
  a.script.attack.push(null, { total: 10 });
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  F.calls.length = 0;
  const s = doc.getElementById("pentaryn-combat-strip");
  await s.fire("click", { target: s.querySelector('[data-pc="retarget"]') });
  await drain();
  const released = F.calls.filter(c => c.op === "token.setTarget").map(c => [c.id, c.on]);
  F.canvas.tokens.setTargets = keep;
  await s.fire("click", { target: s.querySelector('[data-pc="stop"]') });
  await run;
  mock.timers.tick(400);
  // an Action panel without Argon's pip getters: no override
  const odd = { label: "DND5E.Action", _buttons: [], element: doc.createElement("div"), updateVisibility() {}, updateActionUse() {} };
  F.Hooks.callAll("renderActionPanelArgonComponent", odd, odd.element, fig);
  pinJSON("failure-hud", { ma, tiles, last: drd.flags[MODULE]?.last ?? null, released, oddPips: odd._pentarynPips ?? null, console: lines.splice(0) }, import.meta.url);
  delete drd.flags[MODULE];
  delete fig.flags[MODULE];
  F.game.user.targets.clear();
});

test("a Reaction whose flag write fails still emits pentarynCombat.reaction", async () => {
  onTurn(fig);
  const shield = { actor: fig, item: { type: "spell", name: "Shield", system: { identifier: "shield" } }, type: "utility", activation: { type: "reaction" }, uuid: "x" };
  const setFlag = fig.setFlag;
  fig.setFlag = async () => { throw new Error("locked"); };
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postUseActivity", shield, {}, {});
  await drain();
  fig.setFlag = setFlag;
  assert.deepEqual(F.calls.filter(c => c.op === "Hooks.callAll" && c.name.startsWith("pentarynCombat")).map(c => c.name), ["pentarynCombat.reaction"]);
  assert.deepEqual(lines.splice(0), []);
});

test("the sequence's own swallowed failures: a window that will not close, the last-weapon write, a target restore", async () => {
  onTurn(fig);
  const a = act(fig, "longsword0000001");
  a.script.attack.length = 0;
  let release;
  a.script.attack.push(() => new Promise(r => { release = r; }));
  const el = doc.createElement("div");
  el.className = "application roll-configuration";
  F.foundry.applications.instances.set("w", { element: el, config: { subject: a }, close: () => Promise.reject(new Error("already closing")) });
  F.foundry.applications.instances.set("w2", { element: el, get config() { throw new Error("no config"); }, close: () => Promise.resolve() });
  const setFlag = fig.setFlag;
  fig.setFlag = async () => { throw new Error("last refused"); };
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  seq.abortFor(fig);
  release(null);
  const out = await run;
  await drain();
  fig.setFlag = setFlag;
  F.foundry.applications.instances.clear();
  mock.timers.tick(400);
  assert.deepEqual(out, { rolled: 0, status: "stopped" });
  assert.deepEqual(lines.splice(0), [], "both swallowed");
  // restoreTargets without canvas.tokens.setTargets: setTarget per token; a throw is warned
  F.game.user.targets.clear();
  F.game.user.targets.add(toks[gob.id]);
  a.script.attack.push(null, { total: 10 });
  seq.registerTargetPicker(async () => { F.game.user.targets.clear(); return false; });
  const keep = F.canvas.tokens.setTargets;
  F.canvas.tokens.setTargets = undefined;
  const run2 = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  F.calls.length = 0;
  const s = doc.getElementById("pentaryn-combat-strip");
  await s.fire("click", { target: s.querySelector('[data-pc="retarget"]') });
  await drain();
  const restored = F.calls.filter(c => c.op === "token.setTarget").map(c => [c.id, c.on, c.opts]);
  toks[gob.id].setTarget = () => { throw new Error("token gone"); };
  F.game.user.targets.add({ id: "ghost", document: {}, scene: { id: "other" } });
  await s.fire("click", { target: s.querySelector('[data-pc="retarget"]') });
  await drain();
  delete toks[gob.id].setTarget;
  F.canvas.tokens.setTargets = keep;
  seq.registerTargetPicker(null);
  await s.fire("click", { target: s.querySelector('[data-pc="stop"]') });
  await run2;
  mock.timers.tick(400);
  pinJSON("failure-sequence", { restored, console: lines.splice(0) }, import.meta.url);
  delete fig.flags[MODULE];
  F.game.user.targets.clear();
});

test("turnflow's swallowed failures: the Reaction reset, the death-save chat, a rules page, a self effect, Steady Aim's end", async () => {
  // the next combatant's Reaction flag cannot be cleared: swallowed
  rog.flags[MODULE] = { reaction: { combatId: "c1" } };
  const setFlag = rog.setFlag;
  rog.setFlag = async () => { throw new Error("locked"); };
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  await drain();
  rog.setFlag = setFlag;
  // ChatMessage.create rejects: swallowed
  const create = ChatMessage.create;
  ChatMessage.create = async () => { throw new Error("chat down"); };
  fig.system.attributes.hp = { value: 0, max: 20, temp: 0 };
  fig.system.attributes.death = { failure: 0 };
  F.Hooks.call("dnd5e.preApplyDamage", fig, 30, {}, {});
  ChatMessage.create = create;
  fig.system.attributes.hp = { value: 20, max: 20, temp: 0 };
  await drain();
  // a rules page that fails to load: no tooltip text
  const e = makeEffect(fig, { id: "poisoned00000001", name: "Poisoned", statuses: ["poisoned"] });
  fig.effects.set(e.id, e);
  F.CONFIG.DND5E.conditionTypes.poisoned = { reference: "Compendium.broken" };
  const fromUuid = globalThis.fromUuid;
  globalThis.fromUuid = async () => { throw new Error("pack locked"); };
  const list = await new A.PortraitPanel(fig, []).getEffects();
  globalThis.fromUuid = fromUuid;
  const noRef = makeEffect(fig, { id: "deafened00000001", name: "Deafened", statuses: ["deafened"] });
  fig.effects.set(noRef.id, noRef);
  const list2 = await new A.PortraitPanel(fig, []).getEffects();
  fig.effects.delete(e.id);
  fig.effects.delete(noRef.id);
  // a self effect whose profile throws, and Steady Aim's end failing
  F.Hooks.callAll("dnd5e.postUseActivity", { actor: brb, item: { name: "Rage", system: {} }, target: { affects: { type: "self" } }, applicableEffects: [{ getEffect: async () => { throw new Error("no effect"); } }] }, {}, { message: { id: "m" } });
  const sa = makeEffect(rog, { id: "steadyAim0000001", name: "Steady Aim", flags: { [MODULE]: { special: "steady-aim" } }, system: { changes: [{ key: "system.abilities.dex.attack.roll.mode", value: 1 }, { key: "system.attributes.movement.walk", value: 0 }] } });
  sa.update = async () => { throw new Error("update refused"); };
  rog.effects.set(sa.id, sa);
  onTurn(rog);
  F.Hooks.callAll("dnd5e.postRollAttack", [{}], { subject: act(rog, "scimitar00000001") });
  await drain();
  combat.started = false;
  sa.delete = async () => { throw new Error("delete refused"); };
  F.Hooks.callAll("dnd5e.postRollAttack", [{}], { subject: act(rog, "scimitar00000001") });
  await drain();
  combat.started = true;
  rog.effects.delete(sa.id);
  pinJSON("failure-turnflow", { portrait: list.map(x => [x.name, x.tooltip]), portrait2: list2.map(x => [x.name, x.tooltip]), console: lines.splice(0) }, import.meta.url);
});

test("hud: a weapon-set slot rendering on the Bonus bar re-checks the duplicate off-hand slot", () => {
  onTurn(fig);
  const slot = new A.DND5eItemButton({ item: fig.items.get("dagger0000000001"), isWeaponSet: true });
  const bonus = new A.ActionPanel({ label: "DND5E.BonusAction", buttons: [slot] });
  A.ARGON.components.main = [bonus];
  A.ARGON._actor = fig;
  fig.flags[MODULE] = { turn: { key: "c1:1:cb1", nick: true } };
  F.Hooks.callAll("renderItemButtonArgonComponent", slot, slot.element, null);
  assert.ok(slot.element.classList.contains("pentaryn-combat-dup"), "Nick spent: the plain off-hand slot hides");
  const elsewhere = new A.DND5eItemButton({ item: fig.items.get("dagger0000000001"), isWeaponSet: true });
  F.Hooks.callAll("renderItemButtonArgonComponent", elsewhere, elsewhere.element, fig);
  assert.equal(elsewhere.element.classList.contains("pentaryn-combat-dup"), false, "not on the Bonus bar");
  Object.defineProperty(bonus, "_buttons", { get() { throw new Error("gone"); } });
  F.Hooks.callAll("renderItemButtonArgonComponent", slot, slot.element, fig);
  assert.deepEqual(lines.splice(0), []);
  delete fig.flags[MODULE];
});

test("riders: Frenzy while raging and reckless is auto; the damage type from the activity's parts; an Undo mark that fails", async () => {
  onTurn(brb);
  const rage = makeEffect(brb, { id: "rageOn0000000001", name: "Rage" });
  brb.effects.set(rage.id, rage);
  await riders.setReckless(brb, true);
  const card = makeMessage({ type: "attack", system: { activity: { uuid: act(brb, "greataxe00000001").uuid }, targets: [] }, rolls: [{ options: { ability: "str" } }] });
  const frenzy = riders.offersFor(card).offers.map(o => [o.rider.key, o.offer, o.auto, o.dice]);
  await riders.setReckless(brb, false);
  brb.effects.delete(rage.id);
  // the rider's damage type: the weapon's base types, else its activity's damage parts
  const axe = brb.items.get("greataxe00000001");
  const base = axe.system.damage;
  axe.system.damage = {};
  act(brb, "greataxe00000001").damage = { parts: [{ types: new Set() }, { types: new Set(["slashing"]) }] };
  brb.flags[MODULE] = {};
  F.calls.length = 0;
  await riders.rollRider(makeMessage({ type: "attack", system: { activity: { uuid: act(brb, "greataxe00000001").uuid } }, flags: {}, rolls: [{}] }), "frenzy");
  const narrowed = F.calls.find(c => c.op === "activity.rollDamage")?.config ?? null;
  axe.system.damage = base;
  act(brb, "greataxe00000001").damage = { parts: [] };
  // an Undo mark the card cannot take: warned
  const atk = makeMessage({ type: "attack", system: { activity: { uuid: act(rog, "scimitar00000001").uuid } } });
  onTurn(rog);
  rog.flags[MODULE] = { turn: { key: "c1:1:cb2", riders: { "sneak-attack": `auto:${atk.id}` } } };
  const dmg = makeMessage({ type: "damage", speaker: { actor: rog.id }, author: F.game.user, flags: { [MODULE]: { auto: [{ key: "sneak-attack", dice: "3d6", attack: atk.id }] } } });
  dmg.setFlag = async () => { throw new Error("card locked"); };
  const html = doc.createElement("div");
  F.Hooks.callAll("dnd5e.renderChatMessage", dmg, html);
  const note = html.querySelector(".pentaryn-combat-auto");
  await note.fire("click", { target: note.querySelector("[data-undo]") });
  await drain();
  pinJSON("failure-riders", { frenzy, narrowed, console: lines.splice(0) }, import.meta.url);
  delete brb.flags[MODULE];
  delete rog.flags[MODULE];
  mock.timers.tick(100);
});

test("strip: escaping without foundry.utils.escapeHTML; a docked window that left the page is dropped on redock", () => {
  const esc = F.foundry.utils.escapeHTML;
  F.foundry.utils.escapeHTML = undefined;
  strip.show({ numbers: { current: 1, total: 2 }, status: "running", weapon: `A<b>&"'`, title: "T", kind: "main" }, {});
  const what = doc.getElementById("pentaryn-combat-strip").querySelector(".pc-what").innerHTML;
  F.foundry.utils.escapeHTML = esc;
  const win = doc.createElement("div");
  win.className = "application roll-configuration";
  win._rect = { left: 0, top: 0, width: 300, height: 200 };
  doc.body.append(win);
  const app = { element: win, window: { title: doc.createElement("h1") }, position: { left: 0, top: 0 }, positions: [], setPosition(p) { this.positions.push(p); Object.assign(this.position, p); } };
  F.Hooks.callAll("renderRollConfigurationDialog", app);
  doc.flushFrames();
  const before = app.positions.length;
  win.remove();
  strip.update({ numbers: { current: 2, total: 2 }, status: "running", weapon: "x", title: "T", kind: "main" });
  win.isConnected;   // detached now
  strip.update({ numbers: { current: 2, total: 2 }, status: "running", weapon: "x", title: "T", kind: "main" });
  pinJSON("failure-strip", { what, before, after: app.positions.length }, import.meta.url);
  strip.hide();
});

test("shapes: a Multiattack formula whose Roll throws counts as unparsed; turnflow: a slot without a label getter", () => {
  const R = globalThis.Roll;
  globalThis.Roll = class { constructor() { throw new Error("bad formula"); } };
  const spirit = makeActor({ id: "spiritThrow00001", name: "Spirit", type: "npc", items: [
    { id: "multiattack00009", name: "Multiattack", type: "feat", system: { description: { value: "It makes a number of [[/item Rend]] attacks equal to [[floor(@x / 2)]]." } } },
    { id: "rend000000000009", name: "Rend", type: "weapon", system: { type: { value: "natural" } }, activities: [{ id: "rendAtk000000009" }] },
  ] });
  assert.equal(shapes.multiattackOf(spirit), null);
  globalThis.Roll = R;
  // a Reaction-bar slot whose class has no label getter: the item's name is the base label
  const slot = { _isWeaponSet: true, item: { name: "Claw" }, element: doc.createElement("div"), _onLeftClick: async () => {} };
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [slot] });
  F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
  assert.equal(slot.label, "Opportunity Attack: Claw");
  slot.item = { name: "" };
  assert.equal(slot.label, "", "no name: the base label (the item's name)");
});

test("ac-2: renderHud swallows a render that rejects after the HUD closed, at debug, never as an unhandled rejection", async () => {
  const { renderHud } = await import("../argon.mjs");
  const unhandled = [];
  const onUnhandled = err => unhandled.push(err?.message ?? String(err));
  process.on("unhandledRejection", onUnhandled);
  const debugs = [];
  const debug = console.debug;
  console.debug = (...args) => debugs.push([args[0], args[1]?.message ?? null]);
  const render = A.ARGON.render;
  const actor = A.ARGON._actor;
  globalThis.CONFIG.debug = { ...(globalThis.CONFIG.debug ?? {}), [MODULE]: true };
  try {
    A.ARGON._actor = fig;
    A.ARGON.render = async () => { throw new Error("reading 'system' of null"); };
    renderHud();
    await drain();
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.debug = debug;
    A.ARGON.render = render;
    A.ARGON._actor = actor;
    delete globalThis.CONFIG.debug[MODULE];
  }
  assert.deepEqual(unhandled, [], "no unhandled rejection");
  assert.deepEqual(debugs, [[`${MODULE} | HUD re-render (HUD closed)`, "reading 'system' of null"]]);
});
