// turnflow.mjs on the active GM's client (guide S6c: turnflow/{action-buttons, boundaries,
// helper-token, dialogs, death, portrait, effects, drawers, movement, manual-dice}.mjs + patches.mjs). Each hook
// is driven as Foundry / dnd5e / Argon fire it and its effect pinned; the five prototype patches
// are pinned before/after on stub classes (combat-riders-7, -8 oracles). The player-only branches of
// the turn boundary are in turnflow-player.test.mjs.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeCombat, makeEffect, makeMessage, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { barbarian, fighter, rogue, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc, argon: A } = W;
const lines = captureConsole();
for (const k of ["dash", "disengage", "dodge", "hide", "ready", "shove"]) F.game.i18n.translations[`enhancedcombathud-dnd5e.items.${k}.name`] = k[0].toUpperCase() + k.slice(1);

const fig = fighter();
const rog = rogue();
const brb = barbarian();
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const toks = Object.fromEntries([fig, rog, brb, gob].map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
const combat = makeCombat({ id: "c1", entries: [fig, rog, brb, gob].map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });

// PIXI-like PreciseText instances and core classes exist before init (the patches install there)
await import("../combat.mjs");
await import("../hud.mjs");
const seq = await import("../sequence.mjs");
const turnflow = await import("../turnflow/drawers.mjs");
const portraitBefore = { has: Object.hasOwn(A.PortraitPanel.prototype, "_pcConditions") };
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
for (const a of F.game.actors) delete a.flags.enhancedcombathud;
F.calls.length = 0;
lines.length = 0;

const notes = () => F.calls.filter(c => c.op === "notify").map(c => c.message);
const reset = (...actors) => { for (const a of actors) { delete a.flags[MODULE]; for (const e of [...a.effects]) a.effects.delete(e.id); a.statuses.clear(); } };
const onTurn = actor => setTurn(combat, { turn: combat.combatants.contents.findIndex(c => c.actor === actor) });

/** Argon's Action bar with its six special-action buttons and one owned item button. */
function actionBar(actor) {
  const panel = new A.ActionPanel({ label: "DND5E.Action" });
  const mk = (name, actorItem = false) => {
    const b = new A.ItemButton({ item: { id: name.toLowerCase(), name, img: `icons/${name}.webp` } });
    b.createChatMessage = () => {};
    b.actorItem = actorItem;
    Object.defineProperty(b, "actor", { get: () => actor });
    const own = b._onLeftClick;
    b._onLeftClick = async function (ev) { F.calls.push({ op: "argon.special", name }); return own.call(this, ev); };
    return b;
  };
  const split = { button1: mk("Hide"), button2: mk("Ready"), element: doc.createElement("div"), render() {} };   // Argon's split button holds two
  panel._buttons = [mk("Dash"), mk("Disengage"), mk("Dodge"), split, mk("Shove"), mk("Dash", true), new A.ItemButton({ item: { id: "plain", name: "Not special" } })];
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction" });
  const bonus = new A.ActionPanel({ label: "DND5E.BonusAction" });
  A.ARGON.components.main = [panel, bonus, reaction];
  A.ARGON._actor = actor;
  A.ARGON._token = toks[actor.id];
  F.Hooks.callAll("renderActionPanelArgonComponent", panel, panel.element, actor);
  return { panel, reaction, bonus, by: name => panel._buttons.find(b => b.item?.name === name && !b.actorItem) ?? split[name === "Hide" ? "button1" : "button2"] };
}

test("special actions: each spends the Action (or a swing for Shove) and does its rule (golden/turnflow-specials.json)", async () => {
  const rows = [];
  onTurn(fig);
  for (const name of ["Dash", "Disengage", "Dodge", "Hide", "Ready", "Shove"]) {
    reset(fig);
    const bar = actionBar(fig);
    if (name === "Hide") fig.skillScript.push([{ total: 17 }]);
    F.calls.length = 0;
    await bar.by(name)._onLeftClick({});
    await drain();
    rows.push({
      name, special: bar.by(name)._pcSpecial, actionUsed: bar.panel.isActionUsed, paints: bar.panel.updates,
      turn: fig.flags[MODULE]?.turn ?? null, effects: fig.effects.contents.map(e => ({ name: e.name, flags: e.flags, changes: e.system?.changes ?? null })),
      statuses: [...fig.statuses], calls: F.calls.filter(c => ["argon.special", "createEmbedded", "toggleStatusEffect", "rollSkill", "notify"].includes(c.op)),
    });
  }
  pinJSON("turnflow-specials", rows, import.meta.url);
  assert.equal(rows[0].special, "dash");
  reset(fig);
});

test("special actions: second Dash adds the same again; Hide fails / cancelled; no Action left warns; an owned item only spends the pip", async () => {
  const rows = [];
  onTurn(fig);
  reset(fig);
  let bar = actionBar(fig);
  await bar.by("Dash")._onLeftClick({});
  fig.system.attributes.movement.walk = 60;   // prepared Speed now includes the first Dash
  await bar.by("Dash")._onLeftClick({});
  await drain();
  rows.push({ label: "two Dashes", changes: fig.effects.contents.map(e => e.system.changes), notes: notes() });
  fig.system.attributes.movement.walk = 30;
  reset(fig);
  bar = actionBar(fig);
  fig.skillScript.push([{ total: 9 }]);
  fig.statuses.add("hiding");
  F.calls.length = 0;
  await bar.by("Hide")._onLeftClick({});
  rows.push({ label: "Hide 9: not hidden (status off)", statuses: [...fig.statuses], notes: notes() });
  fig.skillScript.push(null);
  F.calls.length = 0;
  await bar.by("Hide")._onLeftClick({});
  rows.push({ label: "Hide cancelled", notes: notes() });
  fig.skillScript.push(new Error("dialog broke"));
  F.calls.length = 0;
  await bar.by("Hide")._onLeftClick({});
  rows.push({ label: "Hide roll throws", notes: notes(), console: lines.splice(0) });
  reset(fig);
  fig.flags[MODULE] = { turn: { key: "c1:1:cb1", otherActions: 1 } };
  bar = actionBar(fig);
  F.calls.length = 0;
  await bar.by("Dodge")._onLeftClick({});
  rows.push({ label: "no Action left: warned, still posted", notes: notes(), dodging: fig.statuses.has("dodging") });
  F.calls.length = 0;
  await bar.by("Shove")._onLeftClick({});
  rows.push({ label: "Shove with no Action left: warned too (its swing needs an Attack action)", notes: notes() });
  reset(fig);
  bar = actionBar(fig);
  const owned = bar.panel._buttons.find(b => b.actorItem);
  F.calls.length = 0;
  await owned._onLeftClick({});
  rows.push({ label: "an owned Dash item: pip only", actionUsed: bar.panel.isActionUsed, turn: fig.flags[MODULE]?.turn ?? null, effects: fig.effects.size });
  onTurn(gob);
  reset(fig);
  bar = actionBar(fig);
  F.calls.length = 0;
  await bar.by("Dodge")._onLeftClick({});
  rows.push({ label: "off his turn: Dodge only, nothing recorded", actionUsed: bar.panel.isActionUsed, turn: fig.flags[MODULE]?.turn ?? null, dodging: fig.statuses.has("dodging") });
  onTurn(fig);
  await F.game.settings.set(MODULE, "specialActions", false);
  reset(fig);
  bar = actionBar(fig);
  F.calls.length = 0;
  await bar.by("Dash")._onLeftClick({});
  rows.push({ label: "setting off: Argon's own click only", calls: F.calls.filter(c => c.op.startsWith("argon.") || c.op === "createEmbedded") });
  await F.game.settings.set(MODULE, "specialActions", true);
  // an error after Argon's click is warned with the action's kind
  reset(fig);
  bar = actionBar(fig);
  const create = fig.createEmbeddedDocuments;
  fig.createEmbeddedDocuments = async () => { throw new Error("no create"); };
  await bar.by("Disengage")._onLeftClick({});
  fig.createEmbeddedDocuments = create;
  rows.push({ label: "effect create fails", console: lines.splice(0) });
  pinJSON("turnflow-specials-edge", rows, import.meta.url);
  // a button wrapped once only; a non-special button gets _pcSpecial null
  const b = bar.by("Dash");
  const wrapped = b._onLeftClick;
  F.Hooks.callAll("renderActionPanelArgonComponent", bar.panel, bar.panel.element, fig);
  assert.equal(b._onLeftClick, wrapped);
  assert.equal(bar.panel._buttons.at(-1)._pcSpecial, undefined, "no createChatMessage: never looked at");
  reset(fig);
  F.calls.length = 0;
});

test("the Reaction bar's weapon: 'Opportunity Attack: X', spends the Reaction (not the Action), tags its roll", async () => {
  onTurn(fig);
  reset(fig);
  const slot = new A.DND5eItemButton({ item: fig.items.get("longsword0000001"), isWeaponSet: true });
  const act = [...fig.items.get("longsword0000001").system.activities.values()][0];
  slot._activity = act;
  Object.defineProperty(slot, "actor", { get: () => fig });
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [slot] });
  const action = new A.ActionPanel({ label: "DND5E.Action" });
  A.ARGON.components.main = [action, reaction];
  // Argon's own click (the instance method the wrapper wraps): uses the activity (postUseActivity
  // fires inside it) and spends the weapon's own activation, the Action
  slot._onLeftClick = async function () { F.calls.push({ op: "argon.slotClick" }); action.isActionUsed = true; F.Hooks.callAll("dnd5e.postUseActivity", act, {}, {}); };
  F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
  const label = slot.label;
  const once = slot._pcOA;
  const wrapper = slot._onLeftClick;
  F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
  assert.equal(slot._onLeftClick, wrapper, "wrapped once per instance");
  F.calls.length = 0;
  await slot._onLeftClick({});
  const used = { action: action.isActionUsed, reaction: reaction.isActionUsed, tag: seq.taggedKind(act.uuid) };
  pinJSON("turnflow-reaction-slot", { label, once, used, labelOff: null }, import.meta.url);
  assert.equal(label, "Opportunity Attack: Longsword");
  seq.forgetRoll(act.uuid);
  await F.game.settings.set(MODULE, "reactionSlot", false);
  assert.equal(slot.label, "Longsword", "setting off: Argon's own label");
  await F.game.settings.set(MODULE, "reactionSlot", true);
  reset(fig);   // the OA recorded the Reaction (edge-1): the next panel would relight it
  F.calls.length = 0;
});

test("the Reaction slot's click with no use (cancelled) forgets the tag and spends nothing", async () => {
  onTurn(fig);
  const slot = new A.DND5eItemButton({ item: fig.items.get("dagger0000000001"), isWeaponSet: true });
  const act = [...fig.items.get("dagger0000000001").system.activities.values()][0];
  slot._activity = act;
  Object.defineProperty(slot, "actor", { get: () => fig });
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [slot] });
  A.ARGON.components.main = [new A.ActionPanel({ label: "DND5E.Action" }), reaction];
  F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
  await slot._onLeftClick({});
  assert.equal(seq.taggedKind(act.uuid), null);
  assert.equal(reaction.isActionUsed, false);
  assert.equal(F.listeners("dnd5e.postUseActivity"), 2, "its temporary hook is gone (setup's and turnflow's remain)");
});

test("the Reaction slot's click that throws (no use) still forgets the tag", async () => {
  onTurn(fig);
  const slot = new A.DND5eItemButton({ item: fig.items.get("dagger0000000001"), isWeaponSet: true });
  const act = [...fig.items.get("dagger0000000001").system.activities.values()][0];
  slot._activity = act;
  Object.defineProperty(slot, "actor", { get: () => fig });
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [slot] });
  A.ARGON.components.main = [new A.ActionPanel({ label: "DND5E.Action" }), reaction];
  slot._onLeftClick = async () => { throw new Error("argon"); };
  F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
  await assert.rejects(slot._onLeftClick({}), /argon/);
  assert.equal(seq.taggedKind(act.uuid), null);
  assert.equal(reaction.isActionUsed, false);
  assert.equal(F.listeners("dnd5e.postUseActivity"), 2, "its temporary hook is gone (setup's and turnflow's remain)");
});

test("edge-1: an Opportunity Attack through the Reaction slot records flags.pentaryn-combat.reaction (on and off your turn)", async () => {
  const oa = async (turnOf) => {
    reset(fig);
    onTurn(turnOf);
    const slot = new A.DND5eItemButton({ item: fig.items.get("longsword0000001"), isWeaponSet: true });
    const act = [...fig.items.get("longsword0000001").system.activities.values()][0];
    slot._activity = act;
    Object.defineProperty(slot, "actor", { get: () => fig });
    const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [slot] });
    A.ARGON.components.main = [new A.ActionPanel({ label: "DND5E.Action" }), reaction];
    slot._onLeftClick = async function () { F.Hooks.callAll("dnd5e.postUseActivity", act, {}, {}); };
    F.Hooks.callAll("renderActionPanelArgonComponent", reaction, reaction.element, fig);
    await slot._onLeftClick({});
    await drain();
    seq.forgetRoll(act.uuid);
    return F.plain(fig.flags[MODULE]?.reaction ?? null);
  };
  assert.deepEqual(await oa(fig), { combatId: "c1" }, "own turn: the Reaction is recorded");
  assert.deepEqual(await oa(gob), { combatId: "c1" }, "off your turn: the Reaction is recorded");
  assert.equal(F.game.pentaryn.combat.inspect(fig).reaction.spent, true, "inspect().reaction sees it");
  reset(fig);
  F.calls.length = 0;
});

test("turn boundaries on the GM: sweeps at turn end / start, the Reaction back, drawers closed (golden/turnflow-boundary.json)", async () => {
  reset(fig, rog, brb);
  await fig.createEmbeddedDocuments("ActiveEffect", [{ name: "Dash", flags: { [MODULE]: { until: "turnEnd", special: "dash" } } }]);
  await fig.createEmbeddedDocuments("ActiveEffect", [{ name: "Dodging", statuses: ["dodging"] }]);
  await rog.createEmbeddedDocuments("ActiveEffect", [{ name: "Dodging", statuses: ["dodging"] }]);
  await rog.createEmbeddedDocuments("ActiveEffect", [{ name: "Reckless", flags: { [MODULE]: { reckless: true } } }]);
  rog.flags[MODULE] = { reaction: { combatId: "c1" } };
  A.ARGON._actor = fig;
  A.ARGON._hudState.set(fig, { DND5E_BonusAction: { visible: true }, other: 3 });
  F.calls.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, turn: 0, combatantId: "cb1" }, { round: 1, turn: 1, combatantId: "cb2" });
  await drain();
  const calls = F.calls.splice(0).filter(c => !["Hooks.call", "Hooks.callAll"].includes(c.op) || c.name.startsWith("pentaryn"));
  const state = {
    fig: { effects: fig.effects.contents.map(e => e.name) },
    rog: { effects: rog.effects.contents.map(e => e.name), reaction: rog.flags[MODULE].reaction },
    hudState: A.ARGON._hudState.get(fig),
  };
  // nothing changed: no sweep
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, turn: 1, combatantId: "cb2" }, { round: 1, turn: 1, combatantId: "cb2" });
  await drain();
  const same = F.calls.splice(0).filter(c => ["deleteEmbedded", "update", "argon.collapseAllPanels"].includes(c.op));
  pinJSON("turnflow-boundary", { calls, state, same }, import.meta.url);
  assert.deepEqual(state.fig.effects, ["Dodging"], "Dash ends at its turn's end, Dodge stays to the start of the next");
  assert.deepEqual(state.rog.effects, [], "turn start: Dodge and Reckless go");
  assert.equal(state.rog.reaction, null);
  reset(fig, rog);
  mock.timers.tick(100);
  F.calls.length = 0;
});

test("sweeps with the settings off, and the warn texts when a sweep fails", async () => {
  reset(fig, rog);
  await fig.createEmbeddedDocuments("ActiveEffect", [{ name: "Dash", flags: { [MODULE]: { until: "turnEnd" } } }]);
  await rog.createEmbeddedDocuments("ActiveEffect", [{ name: "Reckless", flags: { [MODULE]: { reckless: true } } }]);
  await F.game.settings.set(MODULE, "specialActions", false);
  await F.game.settings.set(MODULE, "recklessToggle", false);
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  await drain();
  assert.equal(fig.effects.size + rog.effects.size, 2, "both settings off: nothing swept");
  await F.game.settings.set(MODULE, "recklessToggle", true);
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  await drain();
  assert.deepEqual([fig.effects.size, rog.effects.size], [1, 0], "Reckless swept alone");
  await F.game.settings.set(MODULE, "specialActions", true);
  const delF = fig.deleteEmbeddedDocuments, delR = rog.deleteEmbeddedDocuments;
  fig.deleteEmbeddedDocuments = async () => { throw new Error("locked"); };
  rog.deleteEmbeddedDocuments = async () => { throw new Error("locked too"); };
  await rog.createEmbeddedDocuments("ActiveEffect", [{ name: "Dodging", statuses: ["dodging"] }]);
  lines.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb2" });
  await drain();
  assert.deepEqual(lines.splice(0), [
    { level: "warn", text: "pentaryn-combat | turn-end sweep", err: "locked" },
    { level: "warn", text: "pentaryn-combat | turn-start sweep", err: "locked too" },
  ]);
  fig.deleteEmbeddedDocuments = delF;
  rog.deleteEmbeddedDocuments = delR;
  reset(fig, rog);
  mock.timers.tick(100);
  F.calls.length = 0;
});

test("a deleted combat: its combatants' effects swept and their combat flags cleared; then the orphan sweep (1.5 s)", async () => {
  reset(fig, rog, brb, gob);
  fig.flags[MODULE] = { turn: { key: "c9:2:cbX" }, reaction: { combatId: "c9" } };
  rog.flags[MODULE] = { turn: { key: "nocombat" }, reaction: { combatId: "other" } };
  brb.flags[MODULE] = { turn: { key: "c1:1:cb3" } };
  await fig.createEmbeddedDocuments("ActiveEffect", [{ name: "Dash", flags: { [MODULE]: { until: "turnEnd" } } }]);
  const c9 = { id: "c9", combatants: [{ actor: fig }, { actor: fig }, { actor: rog }, { actor: null }] };
  F.calls.length = 0;
  F.Hooks.callAll("deleteCombat", c9);
  await drain();
  const now = F.calls.splice(0).filter(c => ["deleteEmbedded", "update"].includes(c.op));
  mock.timers.tick(1500);
  await drain();
  const later = F.calls.splice(0).filter(c => ["deleteEmbedded", "update"].includes(c.op));
  pinJSON("turnflow-delete-combat", { now, later, flags: { fig: fig.flags[MODULE], rog: rog.flags[MODULE], brb: brb.flags[MODULE] } }, import.meta.url);
  assert.deepEqual(fig.flags[MODULE], {});
  assert.deepEqual(rog.flags[MODULE], { turn: { key: "nocombat" } }, "the other combat's reaction is an orphan too (no such combat)");
  // a failing cleanup is warned
  fig.flags[MODULE] = { turn: { key: "c9:1:x" } };
  const unset = fig.unsetFlag;
  fig.unsetFlag = async () => { throw new Error("unset refused"); };
  lines.length = 0;
  F.Hooks.callAll("deleteCombat", c9);
  await drain();
  mock.timers.tick(1500);
  await drain();
  fig.unsetFlag = unset;
  pinJSON("turnflow-delete-combat-console", lines.splice(0), import.meta.url);
  reset(fig, rog, brb);
  F.calls.length = 0;
});

test("controlToken: the one token left selected is bound to the HUD 150 ms later (owner, Argon on)", async () => {
  const rows = [];
  const run = (label, { controlled, left, argonOn = true, setting = true, hudToken = null, owner = true }) => {
    F.calls.length = 0;
    A.ARGON.enabled = argonOn;
    A.ARGON._token = hudToken;
    F.canvas.tokens.controlled = left;
    for (const t of left) t.actor.isOwner = owner;
    F.Hooks.callAll("controlToken", toks[fig.id], controlled);
    mock.timers.tick(149);
    const early = F.calls.filter(c => c.op === "argon.bind").length;
    mock.timers.tick(1);
    rows.push({ label, early, binds: F.calls.filter(c => c.op === "argon.bind").map(c => c.token) });
    for (const t of left) t.actor.isOwner = true;
  };
  run("released, one left", { controlled: false, left: [toks[rog.id]] });
  run("controlled (not a release)", { controlled: true, left: [toks[rog.id]] });
  run("two left", { controlled: false, left: [toks[rog.id], toks[brb.id]] });
  run("Argon off", { controlled: false, left: [toks[rog.id]], argonOn: false });
  run("already the HUD's", { controlled: false, left: [toks[rog.id]], hudToken: toks[rog.id] });
  run("not the owner", { controlled: false, left: [toks[rog.id]], owner: false });
  await F.game.settings.set(MODULE, "hudFollows", false);
  run("hudFollows off", { controlled: false, left: [toks[rog.id]] });
  await F.game.settings.set(MODULE, "hudFollows", true);
  await F.game.settings.set("enhancedcombathud", "alwaysOn", true);
  run("Argon disabled but alwaysOn", { controlled: false, left: [toks[rog.id]], argonOn: false });
  await F.game.settings.set("enhancedcombathud", "alwaysOn", false);
  A.ARGON.enabled = true;
  F.canvas.tokens.controlled = [];
  pinJSON("turnflow-control-token", rows, import.meta.url);
  F.calls.length = 0;
});

test("a helper token you held is deleted: your own token is selected again (handle → HUD token; summon → summoner; else your character)", async () => {
  const rows = [];
  const run = (label, { handle = false, origin = null, hud = null, others = [], character = null, controlled = true, scene = F.canvas.scene }) => {
    F.calls.length = 0;
    const helperActor = { getFlag: (s, k) => (s === "dnd5e" && k === "summon.origin" ? origin : undefined) };
    const doc = { id: "helper0000000001", parent: scene, object: { controlled }, flags: handle ? { "pentaryn-aoe": { handle: true } } : {}, actor: helperActor };
    A.ARGON._token = hud;
    F.canvas.tokens.controlled = others;
    F.game.user.character = character;
    F.Hooks.callAll("deleteToken", doc);
    mock.timers.tick(0);
    rows.push({ label, controls: F.calls.filter(c => c.op === "token.control").map(c => [c.id, c.opts]) });
  };
  run("an aoe handle: back to the HUD's token", { handle: true, hud: toks[rog.id] });
  run("a summon: back to the summoner's token (origin = the summoning item)", { origin: `Actor.${brb.id}.Item.rage000000000001` });
  run("an origin that resolves to an Actor (no .actor): your character", { origin: `Actor.${brb.id}`, character: fig });
  run("a summon whose summoner has no token here, no character: nothing", { origin: "Actor.none.Item.none" });
  run("something else is still selected", { handle: true, hud: toks[rog.id], others: [toks[brb.id]] });
  run("not a helper", {});
  run("not selected when deleted", { handle: true, hud: toks[rog.id], controlled: false });
  run("another scene", { handle: true, hud: toks[rog.id], scene: { id: "other" } });
  await F.game.settings.set(MODULE, "helperTokenControl", false);
  run("setting off", { handle: true, hud: toks[rog.id] });
  await F.game.settings.set(MODULE, "helperTokenControl", true);
  // a throw inside the tick is warned
  lines.length = 0;
  F.canvas.tokens.controlled = null;
  const doc = { id: "h", parent: F.canvas.scene, object: { controlled: true }, flags: { "pentaryn-aoe": { handle: true } } };
  Object.defineProperty(F.canvas.tokens, "controlled", { get() { throw new Error("canvas torn down"); }, configurable: true });
  F.Hooks.callAll("deleteToken", doc);
  mock.timers.tick(0);
  Object.defineProperty(F.canvas.tokens, "controlled", { value: [], writable: true, configurable: true });
  rows.push({ label: "a throw", console: lines.splice(0) });
  F.game.user.character = null;
  A.ARGON._token = null;
  pinJSON("turnflow-helper-token", rows, import.meta.url);
});

/** A roll / usage window registered in foundry.applications.instances. */
function appWindow(id, cls, { z = 100, html = "" } = {}) {
  const el = doc.createElement("div");
  el.id = id;
  el.className = `application ${cls}`;
  el.style.zIndex = String(z);
  el.innerHTML = html || `<button type="button" data-action="normal" autofocus>Normal</button><input type="number" name="points" value="5"><button type="button" data-action="use">Use</button><select></select>`;
  doc.body.append(el);
  const app = { id, element: el, rendered: true, closed: 0, close() { this.closed += 1; return Promise.resolve(); } };
  F.foundry.applications.instances.set(id, app);
  return app;
}

test("Esc closes a dnd5e roll dialog without a click into it; text fields, a running sequence and the setting keep it", async () => {
  const low = appWindow("roll-low", "roll-configuration", { z: 50 });
  const top = appWindow("roll-top", "roll-configuration", { z: 150 });
  const rows = [];
  const esc = async (label, target) => {
    const ev = await doc.fire("keydown", { key: "Escape", target });
    rows.push({ label, closed: [low.closed, top.closed], prevented: ev.defaultPrevented });
  };
  await esc("a button inside the low one", low.element.querySelector("button"));
  await esc("nothing focused: the top one", doc.body);
  await esc("the document element focused", doc.documentElement);
  await esc("a number field inside", top.element.querySelector("input"));
  await esc("a select", top.element.querySelector("select"));
  const other = doc.createElement("div");
  doc.body.append(other);
  await esc("focus elsewhere (not body): not ours", other);
  await F.game.settings.set(MODULE, "escRollDialog", false);
  await esc("setting off", doc.body);
  await F.game.settings.set(MODULE, "escRollDialog", true);
  let release;
  const a = [...fig.items.get("longsword0000001").system.activities.values()][0];
  a.script.attack.push(() => new Promise(r => { release = r; }));
  onTurn(fig);
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  await esc("a sequence runs: the strip's own Esc", doc.body);
  release({ total: 10 });
  await run;
  mock.timers.tick(400);
  await drain();
  pinJSON("turnflow-esc", rows, import.meta.url);
  for (const w of [low, top]) w.element.remove();
  other.remove();
  F.foundry.applications.instances.clear();
  reset(fig);
  F.calls.length = 0;
});

test("Enter in a usage window's number box commits it and presses Use after the re-render (or 400 ms)", async () => {
  const usage = appWindow("usage-1", "activity-usage");
  const input = usage.element.querySelector("input");
  doc.dispatched.length = 0;
  doc.clicked.length = 0;
  let ev = await doc.fire("keydown", { key: "Enter", target: input });
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(doc.dispatched.map(d => [d.type, d.bubbles]), [["change", true]]);
  F.Hooks.callAll("renderActivityUsageDialog", { other: true });
  F.Hooks.callAll("renderActivityUsageDialog", usage);
  doc.flushFrames();
  assert.deepEqual(doc.clicked.map(b => b.dataset.action), ["use"]);
  mock.timers.tick(400);
  assert.equal(doc.clicked.length, 1, "pressed once");
  assert.equal(F.listeners("renderActivityUsageDialog"), 0);
  // no re-render (the value did not change): the 400 ms fallback
  doc.clicked.length = 0;
  await doc.fire("keydown", { key: "Enter", target: input });
  mock.timers.tick(399);
  assert.equal(doc.clicked.length, 0);
  mock.timers.tick(1);
  assert.equal(doc.clicked.length, 1);
  // closed meanwhile: nothing pressed
  doc.clicked.length = 0;
  await doc.fire("keydown", { key: "Enter", target: input });
  usage.rendered = false;
  mock.timers.tick(400);
  assert.equal(doc.clicked.length, 0);
  usage.rendered = true;
  // not ours: a modifier, a select, outside a usage window, the setting off, a disabled Use
  const rows = [];
  const tryKey = async (label, init) => { doc.clicked.length = 0; const e = await doc.fire("keydown", init); mock.timers.tick(400); rows.push([label, e.defaultPrevented, doc.clicked.length]); };
  await tryKey("shift+Enter", { key: "Enter", target: input, shiftKey: true });
  await tryKey("a select", { key: "Enter", target: usage.element.querySelector("select") });
  const roll = appWindow("roll-x", "roll-configuration");
  await tryKey("a roll window's box", { key: "Enter", target: roll.element.querySelector("input") });
  await F.game.settings.set(MODULE, "enterUses", false);
  await tryKey("setting off", { key: "Enter", target: input });
  await F.game.settings.set(MODULE, "enterUses", true);
  usage.element.querySelector('[data-action="use"]').disabled = true;
  await tryKey("Use disabled", { key: "Enter", target: input });
  F.foundry.applications.instances.delete("usage-1");
  await tryKey("no app for the window", { key: "Enter", target: input });
  pinJSON("turnflow-enter", rows, import.meta.url);
  for (const w of [usage, roll]) w.element.remove();
  F.foundry.applications.instances.clear();
});

test("a closed attack roll's empty usage card is deleted 250 ms later (golden/turnflow-tidy.json)", async () => {
  const rows = [];
  const run = async (label, { msg = {}, rolls = [], under = false, running = false, setting = true, wait = 250 } = {}) => {
    const card = makeMessage({ type: "usage", author: F.game.user, system: { deltas: {} }, ...msg });
    if (under) makeMessage({ type: "attack", system: { origin: { id: card.id } } });
    let release;
    let run2 = null;
    if (running) {
      const a = [...fig.items.get("longsword0000001").system.activities.values()][0];
      a.script.attack.push(() => new Promise(r => { release = r; }));
      run2 = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
      await drain();
    }
    if (!setting) await F.game.settings.set(MODULE, "tidyCancelledAttacks", false);
    F.Hooks.callAll("closeAttackRollConfigurationDialog", { rolls, message: { data: { system: { origin: msg.originAsObject ? { id: card.id } : card.id } } } });
    mock.timers.tick(wait - 1);
    const early = !!F.game.messages.get(card.id);
    mock.timers.tick(1);
    await drain();
    rows.push({ label, earlyThere: early, there: !!F.game.messages.get(card.id) });
    if (!setting) await F.game.settings.set(MODULE, "tidyCancelledAttacks", true);
    if (running) { release(null); await drain(); const e = doc.getElementById("pentaryn-combat-strip"); await e.fire("click", { target: e.querySelector('[data-pc="stop"]') }); await run2; mock.timers.tick(400); await drain(); }
  };
  await run("closed, nothing under it: deleted");
  await run("origin given as {id}", { msg: { originAsObject: true } });
  await run("an attack rolled under it: kept", { under: true });
  await run("the dialog rolled: not looked at", { rolls: [{}] });
  await run("someone else's card: kept", { msg: { author: F.game.users.get("player0000000001") } });
  await run("something consumed: kept", { msg: { system: { deltas: { actor: [{ keyPath: "x", delta: -1 }] } } } });
  await run("older than 5 minutes: kept", { msg: { timestamp: Date.now() - 5 * 60 * 1000 } });
  await run("a sequence still running: kept", { running: true });
  await run("setting off: kept", { setting: false });
  const notUsage = makeMessage({ type: "base" });
  F.Hooks.callAll("closeAttackRollConfigurationDialog", { message: { data: { system: { origin: notUsage.id } } } });
  mock.timers.tick(250);
  rows.push({ label: "not a usage card", there: !!F.game.messages.get(notUsage.id) });
  const gone = makeMessage({ type: "usage", author: F.game.user, system: {} });
  F.Hooks.callAll("closeAttackRollConfigurationDialog", { message: { data: { system: { origin: gone.id } } } });
  F.game.messages.delete(gone.id);
  mock.timers.tick(250);
  const failing = makeMessage({ type: "usage", author: F.game.user, system: {} });
  failing.delete = async () => { throw new Error("already gone"); };
  F.Hooks.callAll("closeAttackRollConfigurationDialog", { message: { data: { system: { origin: failing.id } } } });
  mock.timers.tick(250);
  await drain();
  F.Hooks.callAll("closeAttackRollConfigurationDialog", { get rolls() { throw new Error("app broke"); } });
  rows.push({ label: "warns", console: lines.splice(0) });
  pinJSON("turnflow-tidy", rows, import.meta.url);
  // the oracle agrees with the decision on the first case's shape
  const card = makeMessage({ type: "usage", author: F.game.user, system: { deltas: {} } });
  assert.equal(legacy.tidyOnClose({ msg: card, messages: F.game.messages.contents, userId: F.game.user.id, now: Date.now(), running: null }), true);
  assert.equal(legacy.tidyAtSequenceEnd({ msg: card, messages: F.game.messages.contents, userId: F.game.user.id, now: Date.now() }), true);
  F.calls.length = 0;
});

test("damage at 0 HP: a Death Saving Throw failure (two on a crit), a chat line; massive damage whispered to the GM", () => {
  const rows = [];
  const hit = (label, actor, amount, { hp = 0, failures = 0, crit = false, max = 20, temp = 0 } = {}) => {
    actor.system.attributes.hp = { value: hp, max, temp, effectiveMax: max };
    actor.system.attributes.death = { failure: failures };
    const updates = {};
    F.calls.length = 0;
    F.Hooks.call("dnd5e.preApplyDamage", actor, amount, updates, { originatingMessage: crit ? { rolls: [{ isCritical: true }] } : null });
    rows.push({ label, updates, chats: F.calls.filter(c => c.op === "ChatMessage.create").map(c => c.data) });
  };
  hit("at 0 HP, 5 damage", fig, 5);
  hit("at 0 HP, a crit", fig, 5, { crit: true });
  hit("two failures already, a crit", fig, 5, { failures: 2, crit: true });
  hit("three failures: nothing", fig, 5, { failures: 3 });
  hit("temp HP absorbs it all", fig, 5, { temp: 10 });
  hit("massive at 0 HP", fig, 25);
  hit("massive from 5 HP", fig, 30, { hp: 5 });
  hit("above 0, not massive", fig, 3, { hp: 5 });
  hit("an NPC", gob, 5);
  rows.push({ label: "setting off" });
  pinJSON("turnflow-death", rows, import.meta.url);
});

test("damage at 0 HP: setting off, no death data, a throw", async () => {
  await F.game.settings.set(MODULE, "deathSaveDamage", false);
  const updates = {};
  fig.system.attributes.hp = { value: 0, max: 20 };
  F.Hooks.call("dnd5e.preApplyDamage", fig, 5, updates, {});
  assert.deepEqual(updates, {});
  await F.game.settings.set(MODULE, "deathSaveDamage", true);
  const death = fig.system.attributes.death;
  delete fig.system.attributes.death;
  F.Hooks.call("dnd5e.preApplyDamage", fig, 5, updates, {});
  assert.deepEqual(updates, {});
  fig.system.attributes.death = death;
  lines.length = 0;
  F.Hooks.call("dnd5e.preApplyDamage", fig, 5, null, {});
  assert.deepEqual(lines.splice(0).map(l => l.text), ["pentaryn-combat | damage at 0 HP"]);
  fig.system.attributes.hp = { value: 20, max: 20, temp: 0 };
  F.calls.length = 0;
});

test("the HUD portrait lists status conditions Argon leaves out, with their rules text (combat-riders-8)", async () => {
  assert.deepEqual(portraitBefore, { has: false });
  const P = A.PortraitPanel;
  assert.equal(P.prototype._pcConditions, true);
  reset(fig);
  const prone = makeEffect(fig, { id: "prone00000000001", name: "Prone", statuses: ["prone"] });
  const dodging = makeEffect(fig, { id: "dodging000000001", name: "Dodging", statuses: ["dodging"], description: "<p>own text</p>" });
  const dash = makeEffect(fig, { id: "dash000000000001", name: "Dash", isTemporary: true, statuses: [] });
  const hidden = makeEffect(fig, { id: "hidden0000000001", name: "Secret", statuses: ["poisoned"], isConcealed: true });
  const off = makeEffect(fig, { id: "off0000000000001", name: "Off", statuses: ["blinded"], disabled: true });
  for (const e of [prone, dodging, dash, hidden, off]) fig.effects.set(e.id, e);
  W.uuids.set("Compendium.dnd5e.rules.JournalEntry.c.JournalEntryPage.prone", { text: { content: "<p>Prone rules</p>" } });
  const panel = new P(fig, [{ uuid: dash.uuid, name: "Dash" }]);
  const list = await panel.getEffects();
  const again = await new P(fig, [{ uuid: prone.uuid, name: "Prone (Argon)" }]).getEffects();
  await F.game.settings.set(MODULE, "portraitConditions", false);
  const offList = await new P(fig, []).getEffects();
  await F.game.settings.set(MODULE, "portraitConditions", true);
  const noActor = await new P(null, [{ uuid: "x" }]).getEffects();
  const applicable = fig.allApplicableEffects;
  fig.allApplicableEffects = () => { throw new Error("prepare failed"); };
  lines.length = 0;
  const broken = await new P(fig, []).getEffects();
  fig.allApplicableEffects = applicable;
  pinJSON("turnflow-portrait", { list, again, offList, noActor, broken, console: lines.splice(0) }, import.meta.url);
  reset(fig);
});

test("scrolling-text guard: a destroyed PreciseText ignores destroy and x/y; a hidden tab starts no floating text (combat-riders-7)", async () => {
  const P = W.PreciseText;
  assert.equal(Object.hasOwn(P.prototype, "destroy"), true, "patched at init");
  assert.equal(Object.hasOwn(P.prototype, "y"), true);
  const t = new P();
  t.x = 3;
  t.y = 4;
  assert.deepEqual([t.x, t.y], [3, 4]);
  t.destroy();
  t.destroy();
  assert.equal(t.destroyCalls, 1, "the second destroy is a no-op");
  t.y = 5;
  assert.equal(t.y, 0, "a destroyed text reads 0 and ignores the write");
  await F.game.settings.set(MODULE, "scrollingTextGuard", false);
  const u = new P();
  u.destroy();
  u.destroy();
  assert.equal(u.destroyCalls, 2, "setting off: core's destroy runs");
  assert.throws(() => { u.y = 5; }, /null|undefined/, "setting off: the original setter runs (and throws on a null transform)");
  assert.throws(() => u.y, /null|undefined/, "setting off: the original getter runs too (combat-core-EC-7)");
  await F.game.settings.set(MODULE, "scrollingTextGuard", true);
  const G = W.InterfaceCanvasGroup;
  assert.equal(G.prototype.createScrollingText._pentaryn, true);
  assert.equal(G.prototype.createScrollingText.name, "createScrollingText");
  F.calls.length = 0;
  assert.equal(await new G().createScrollingText({}, "5"), "shown");
  doc.hidden = true;
  assert.equal(await new G().createScrollingText({}, "6"), undefined);
  await F.game.settings.set(MODULE, "scrollingTextGuard", false);
  assert.equal(await new G().createScrollingText({}, "7"), "shown");
  await F.game.settings.set(MODULE, "scrollingTextGuard", true);
  const C = W.ChatLog;
  assert.equal(C.prototype.notify._pentaryn, true);
  new C().notify({ id: "m1" }, { newMessage: true });
  doc.hidden = false;
  new C().notify({ id: "m2" }, { newMessage: true });
  doc.hidden = true;
  new C().notify({ id: "m3" });
  doc.hidden = false;
  pinJSON("turnflow-guards", F.calls.filter(c => ["createScrollingText", "ChatLog.notify"].includes(c.op)), import.meta.url);
  F.calls.length = 0;
});

test("combat-core-EC-7 [declared]: with scrollingTextGuard Off a destroyed PreciseText's x/y getter is core's own", async () => {
  const P = W.PreciseText;
  const t = new P();
  t.x = 7;
  t.y = 8;
  t.destroy();
  assert.deepEqual([t.x, t.y], [0, 0], "On: a destroyed text reads 0");
  await F.game.settings.set(MODULE, "scrollingTextGuard", false);
  try {
    const u = new P();
    u.x = 1;
    u.y = 2;
    assert.deepEqual([u.x, u.y], [1, 2], "Off: a live text reads through the native getter");
    u.destroy();
    for (const axis of ["x", "y"]) {
      assert.throws(() => u[axis], /null|undefined/, `Off: the native ${axis} getter runs on a destroyed text (it throws on a null transform)`);
      assert.throws(() => { u[axis] = 5; }, /null|undefined/, `Off: the native ${axis} setter runs too`);
    }
  } finally {
    await F.game.settings.set(MODULE, "scrollingTextGuard", true);
  }
});

test("Argon's pip settle: updateActionUse runs twice only when the pip count changed (combat-riders-3)", () => {
  const proto = A.ActionPanel.prototype;
  assert.equal(proto.updateActionUse._pcSettles, true);
  const rows = [];
  for (const [from, to] of [[1, 2], [2, 2], [2, 4]]) {
    const p = new A.ActionPanel({ label: "DND5E.Action", max: from });
    p._argonBug = true;
    p.updateActionUse();
    p._max = to;
    p.isActionUsed = true;
    p.updates = 0;
    const out = p.updateActionUse();
    rows.push({ from, to, calls: p.updates, out, used: p.uses.children.map(c => c.classList.contains("used")) });
  }
  const bare = new A.ActionPanel({ label: "x" });
  bare.element = null;
  bare.updates = 0;
  bare.updateActionUse();
  rows.push({ label: "element-less panel", calls: bare.updates });
  pinJSON("turnflow-pip-settle", rows, import.meta.url);
  assert.deepEqual(rows.map(r => r.calls), [2, 1, 2, 1]);
});

test("Manual dice: the Roll Resolution box takes focus on render, and a digit typed with nothing focused goes into it", async () => {
  const R = W.RollResolver;
  const res = new R();
  res.element.className = "application roll-resolver";
  res.element.innerHTML = `<input type="text" value="4"><input type="text" value=""><input type="text" value="" disabled>`;
  doc.body.append(res.element);
  F.foundry.applications.instances.set("resolver", res);
  doc.activeElement = doc.body;
  F.Hooks.callAll("renderRollResolver", res);
  doc.flushFrames();
  const boxes = res.element.querySelectorAll("input");
  assert.equal(doc.activeElement, boxes[1], "the first empty box");
  doc.activeElement = doc.body;
  let ev = await doc.fire("keydown", { key: "7", target: doc.body });
  assert.equal(doc.activeElement, boxes[1]);
  assert.equal(ev.propagationStopped, true);
  doc.activeElement = doc.body;
  ev = await doc.fire("keydown", { key: "7", target: doc.body, ctrlKey: true });
  assert.equal(doc.activeElement, doc.body, "with a modifier: a hotkey");
  ev = await doc.fire("keydown", { key: "a", target: doc.body });
  assert.equal(doc.activeElement, doc.body);
  const chat = doc.createElement("textarea");
  ev = await doc.fire("keydown", { key: "7", target: chat });
  assert.equal(doc.activeElement, doc.body, "typing in a text area");
  await F.game.settings.set(MODULE, "dockRollDialogs", false);
  ev = await doc.fire("keydown", { key: "7", target: doc.body });
  assert.equal(doc.activeElement, doc.body, "setting off");
  doc.activeElement = doc.body;
  F.Hooks.callAll("renderRollResolver", res);
  doc.flushFrames();
  assert.equal(doc.activeElement, doc.body, "setting off: no focus");
  await F.game.settings.set(MODULE, "dockRollDialogs", true);
  doc.activeElement = boxes[0];
  F.Hooks.callAll("renderRollResolver", res);
  doc.flushFrames();
  assert.equal(doc.activeElement, boxes[0], "focus already inside: left alone");
  res.element.remove();
  F.foundry.applications.instances.clear();
  doc.activeElement = doc.body;
  ev = await doc.fire("keydown", { key: "7", target: doc.body });
  assert.equal(ev.propagationStopped, false, "no resolver open");
});

test("self effects: a self-only feature with one effect applies it through dnd5e's tray; Steady Aim gets its effect (golden/turnflow-effects.json)", async () => {
  const rows = [];
  const applied = [];
  class Tray { async _applyEffectToActor(effect, actor) { applied.push({ effect: effect.uuid, actor: actor.id, chat: this.chatMessage?.id ?? null, effects: this.effects.map(e => e.uuid) }); } }
  globalThis.customElements.define("effect-application", Tray);
  const origCreate = doc.createElement;
  doc.createElement = tag => (tag === "effect-application" ? new Tray() : origCreate(tag));
  reset(brb);
  const rage = brb.items.get("rage000000000001").system.activities.get("rageAct000000001");
  const effect = { uuid: "Actor.barbarian0000001.Item.rage000000000001.ActiveEffect.rage" };
  rage.target = { affects: { type: "self" } };
  rage.applicableEffects = [{ getEffect: async () => effect }];
  const card = makeMessage({ type: "usage" });
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: card });
  await drain();
  rows.push({ label: "Rage", applied: applied.splice(0) });
  brb.effects.set("rageOn0000000001", makeEffect(brb, { id: "rageOn0000000001", name: "Rage", stats: { compendiumSource: effect.uuid } }));
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: card });
  await drain();
  rows.push({ label: "already on from that source", applied: applied.splice(0) });
  reset(brb);
  rage.applicableEffects = [{ effect }];
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: { id: "notInGame" } });
  await drain();
  rows.push({ label: "a profile with an effect getter (older dnd5e), a message not in game.messages", applied: applied.splice(0) });
  rage.applicableEffects = [{ effect }, { effect }];
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: card });
  rage.applicableEffects = [{ effect }];
  rage.target = { affects: { type: "creature" } };
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: card });
  rage.target = { affects: { type: "self" } };
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, {});
  await F.game.settings.set(MODULE, "selfEffects", false);
  F.Hooks.callAll("dnd5e.postUseActivity", rage, {}, { message: card });
  await F.game.settings.set(MODULE, "selfEffects", true);
  await drain();
  rows.push({ label: "two effects / not self / no message / setting off", applied: applied.splice(0) });
  // Steady Aim
  reset(rog);
  const sa = { actor: rog, item: { name: "Steady Aim", img: "sa.webp", uuid: "Actor.rogue00000000001.Item.steadyAim", system: { identifier: "steady-aim" } }, target: {} };
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postUseActivity", sa, {}, {});
  await drain();
  rows.push({ label: "Steady Aim", created: F.calls.filter(c => c.op === "createEmbedded").map(c => c.data), notes: notes() });
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postUseActivity", sa, {}, {});
  await drain();
  rows.push({ label: "Steady Aim again: one effect only", created: F.calls.filter(c => c.op === "createEmbedded").length });
  // the attack it was for: in combat the Advantage goes, Speed 0 stays; out of combat the effect goes
  onTurn(rog);
  F.calls.length = 0;
  F.Hooks.callAll("dnd5e.postRollAttack", [{ total: 12 }], { subject: [...rog.items.get("scimitar00000001").system.activities.values()][0] });
  await drain();
  rows.push({ label: "after its attack, in combat", changes: rog.effects.contents.map(e => e.system.changes.map(c => c.key)), calls: F.calls.filter(c => c.op === "update" || c.op === "delete").map(c => c.op) });
  F.Hooks.callAll("dnd5e.postRollAttack", [{ total: 12 }], { subject: [...rog.items.get("scimitar00000001").system.activities.values()][0] });
  await drain();
  rows.push({ label: "a second attack: nothing left to trim", changes: rog.effects.contents.map(e => e.system.changes.length) });
  combat.started = false;
  F.Hooks.callAll("dnd5e.postRollAttack", [{ total: 12 }], { subject: [...rog.items.get("scimitar00000001").system.activities.values()][0] });
  await drain();
  combat.started = true;
  rows.push({ label: "out of combat: the effect goes", effects: rog.effects.size });
  await F.game.settings.set(MODULE, "steadyAim", false);
  F.Hooks.callAll("dnd5e.postUseActivity", sa, {}, {});
  await drain();
  rows.push({ label: "setting off", effects: rog.effects.size });
  await F.game.settings.set(MODULE, "steadyAim", true);
  doc.createElement = origCreate;
  pinJSON("turnflow-effects", rows, import.meta.url);
  reset(rog, brb);
  F.calls.length = 0;
});

test("Argon's drawers open above their own button (golden/turnflow-drawers.json)", async () => {
  const rows = [];
  const hudEl = doc.createElement("div");
  hudEl._rect = { left: 100, top: 600, width: 800, height: 200 };
  hudEl.offsetWidth = 1600;   // the HUD is scaled 0.5
  const lane = doc.createElement("div");
  lane.className = "action-hud";
  lane._rect = { left: 300, top: 600, width: 600, height: 200 };
  hudEl.append(lane);
  doc.body.append(hudEl);
  const button = new A.ItemButton({ item: { id: "useFeature", name: "Use Feature" } });
  button.element._rect = { left: 700, top: 650, width: 40, height: 40 };
  hudEl.append(button.element);
  const drawer = new A.ButtonPanel();
  drawer.element.offsetParent = hudEl;
  drawer.element._rect = { left: 0, top: 0, width: 300, height: 100 };
  hudEl.append(drawer.element);
  button.panel = drawer;
  F.Hooks.callAll("renderButtonPanelButtonArgonComponent", button);
  drawer.toggle(true);
  rows.push({ label: "opened", left: drawer.element.style.left, toggles: drawer.toggles });
  F.Hooks.callAll("renderButtonPanelButtonArgonComponent", button);
  drawer.toggle(false);
  rows.push({ label: "closed (wrapped once)", left: drawer.element.style.left, toggles: drawer.toggles });
  // a tooltip of a button inside a closing drawer is dropped
  const inside = doc.createElement("div");
  drawer.element.append(inside);
  A.ARGON._tooltip = { _triggerElement: inside, _destroy() { F.calls.push({ op: "argon.tooltip.destroy" }); } };
  F.calls.length = 0;
  drawer.toggle(false);
  rows.push({ label: "closing drops its tooltip", tooltip: A.ARGON._tooltip, calls: F.calls.splice(0) });
  await F.game.settings.set(MODULE, "drawerNearButton", false);
  drawer.element.style.left = "33px";
  drawer.toggle(true);
  rows.push({ label: "setting off: Argon's place", left: drawer.element.style.left });
  await F.game.settings.set(MODULE, "drawerNearButton", true);
  // a drawer Argon reopened inside its render: placed once the button is laid out (up to 10 frames)
  const button2 = new A.ItemButton({ item: { id: "castSpell", name: "Cast Spell" } });
  const drawer2 = new A.ButtonPanel();
  drawer2.element.offsetParent = hudEl;
  drawer2.element._rect = { left: 0, top: 0, width: 200, height: 100 };
  drawer2.element.classList.add("show");
  hudEl.append(drawer2.element);
  button2.panel = drawer2;
  F.Hooks.callAll("renderButtonPanelButtonArgonComponent", button2);
  for (let i = 0; i < 3; i++) { const f = doc.frames.splice(0); for (const fn of f) fn(); }
  const notYet = drawer2.element.style.left ?? "";
  hudEl.append(button2.element);
  button2.element._rect = { left: 400, top: 650, width: 40, height: 40 };
  doc.flushFrames();
  rows.push({ label: "restored drawer", before: notYet, after: drawer2.element.style.left });
  // placeOpenDrawers (hud/bars.mjs calls it after a recompose)
  drawer2.element.style.left = "";
  turnflow.placeOpenDrawers({ _buttons: [button2, button, null, { panel: null }] });
  doc.flushFrames();
  rows.push({ label: "placeOpenDrawers", left: drawer2.element.style.left, closedOneUntouched: drawer.element.style.left });
  turnflow.placeOpenDrawers(null);
  pinJSON("turnflow-drawers", rows, import.meta.url);
  hudEl.remove();
  A.ARGON._tooltip = null;
});

test("a turn boundary closes the drawers of the creature whose turn ended or began, on the HUD", () => {
  A.ARGON._actor = rog;
  A.ARGON._hudState = new Map([[rog, { a: { visible: true }, b: { visible: false }, n: 1 }], [brb, { c: { visible: true } }]]);
  F.calls.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb2" }, { round: 1, combatantId: "cb3" });
  assert.deepEqual(A.ARGON._hudState.get(rog), { a: { visible: false }, b: { visible: false }, n: 1 });
  assert.deepEqual(A.ARGON._hudState.get(brb), { c: { visible: false } });
  assert.deepEqual(F.calls.filter(c => c.op === "argon.collapseAllPanels").length, 1);
  A.ARGON._actor = fig;
  F.calls.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb2" }, { round: 1, combatantId: "cb3" });
  assert.equal(F.calls.filter(c => c.op === "argon.collapseAllPanels").length, 0, "neither is on the HUD");
  mock.timers.tick(100);
  F.calls.length = 0;
});

test("Argon's movement readout redraws after an effect change, a Speed edit or a turn change (50 ms, batched)", async () => {
  const m = { element: doc.createElement("div"), redraws: 0, updateMovement() { this.redraws += 1; } };
  doc.body.append(m.element);
  A.ARGON.components.movement = m;
  A.ARGON._actor = fig;
  A.ARGON._token = toks[fig.id];
  F.Hooks.callAll("createActiveEffect", { parent: fig });
  F.Hooks.callAll("deleteActiveEffect", { parent: fig });
  mock.timers.tick(49);
  assert.equal(m.redraws, 0);
  mock.timers.tick(1);
  assert.equal(m.redraws, 1, "two changes, one redraw");
  F.Hooks.callAll("updateActor", fig, { system: { attributes: { movement: { walk: 40 } } } });
  mock.timers.tick(50);
  F.Hooks.callAll("updateActor", fig, { system: { attributes: { hp: { value: 3 } } } });
  mock.timers.tick(50);
  F.Hooks.callAll("updateActiveEffect", { parent: rog });
  mock.timers.tick(50);
  F.Hooks.callAll("combatTurnChange", combat, { round: 1, combatantId: "cb1" }, { round: 1, combatantId: "cb1" });
  mock.timers.tick(50);
  assert.equal(m.redraws, 3, "Speed edit and turn change; not HP, not another actor");
  A.ARGON._token = null;
  F.Hooks.callAll("createActiveEffect", { parent: fig });
  mock.timers.tick(50);
  m.element.remove();
  F.Hooks.callAll("createActiveEffect", { parent: fig });
  mock.timers.tick(50);
  A.ARGON._token = toks[fig.id];
  m.updateMovement = () => { throw new Error("argon"); };
  m.element = doc.createElement("div");
  doc.body.append(m.element);
  F.Hooks.callAll("createActiveEffect", { parent: fig });
  mock.timers.tick(50);
  assert.equal(m.redraws, 3);
  assert.deepEqual(lines.splice(0), []);
  m.element.remove();
});
