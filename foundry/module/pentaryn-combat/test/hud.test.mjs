// hud.mjs, the Argon bars (guide S6b: hud/{bars,buttons-ui,pips-bar,picker,tooltips}.mjs + argon.mjs).
// A fake Argon HUD (fixtures/argon.mjs) is rendered through every renderActionPanelArgonComponent
// listener in registration order (turnflow's, hud's bars, hud's pips), as Argon fires them, and the
// resulting bars are pinned (golden/argon-bars.json), with the tooltips, the pips, the clicks, the
// event listeners that spend Argon's pips, the re-render signatures and the tooltip hygiene.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeCombat, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { argonTooltip } from "./fixtures/argon.mjs";
import { barbarian, fighter, monk, rogue, slayer, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc, argon } = W;
const A = argon;
const lines = captureConsole();

const fig = fighter({ extraItems: [
  { id: "handaxe000000001", name: "Handaxe", type: "weapon", img: "icons/weapons/handaxe.webp", system: { identifier: "handaxe", equipped: true, properties: new Set(["lgt", "thr"]), mastery: "vex", masteryOptions: new Set(["vex"]), type: { value: "simpleM", baseItem: "handaxe" } },
    activities: [{ id: "handaxeAtk000001", type: "attack", activation: "action" }] },
] });
const rog = rogue();
const wlf = wolf();
const mnk0 = monk({ focus: 0 });
const mnk = monk({ focus: 2 });
const sly = slayer();
const brb = barbarian();
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const toks = Object.fromEntries([fig, rog, wlf, mnk0, mnk, sly, brb, gob].map((a, i) => [a.id, makeToken(a, { x: i * 3 })]));
const combat = makeCombat({ id: "c1", entries: [fig, rog, wlf, mnk0, mnk, sly, brb, gob].map((a, i) => ({ id: `cb${i + 1}`, actor: a, token: toks[a.id] })) });
const turnOf = actor => combat.combatants.contents.findIndex(c => c.actor === actor);

await import("../combat.mjs");
await import("../hud.mjs");
const seq = await import("../sequence.mjs");
const core = await import("../combat-core.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
for (const a of F.game.actors) delete a.flags.enhancedcombathud;   // the seed wrote sets: start clean
F.calls.length = 0;
lines.length = 0;

const hudRoot = doc.createElement("div");
hudRoot.className = "extended-combat-hud";
const row = doc.createElement("div");
row.className = "action-hud";
hudRoot.append(row);
doc.body.append(hudRoot);

/** A fresh Argon HUD for an actor: Action (weapon-set slot + an item button), Bonus (off-hand slot), Reaction, Special. */
function buildHud(actor, { mainSlot = null, offSlot = null, extra = {} } = {}) {
  row.textContent = "";
  const slot = (itemId, panel) => {
    const b = new A.DND5eItemButton({ item: itemId ? actor.items.get(itemId) : null, isWeaponSet: true, hookId: `hook-${panel}` });
    return b;
  };
  const item = (id, name) => new A.ItemButton({ item: { id, name } });
  const action = new A.ActionPanel({ label: "DND5E.Action", buttons: [slot(mainSlot, "main"), item("castSpell", "Cast Spell"), ...(extra.action ?? [])] });
  const bonus = new A.ActionPanel({ label: "DND5E.BonusAction", buttons: [slot(offSlot, "off"), ...(extra.bonus ?? [])] });
  const reaction = new A.ActionPanel({ label: "DND5E.Reaction", buttons: [...(extra.reaction ?? [])] });
  const special = new A.ActionPanel({ label: "DND5E.Special", buttons: [...(extra.special ?? [])] });
  for (const p of [action, bonus, reaction, special]) {
    for (const b of p._buttons) { b._parent = p; p.element.append(b.element); }
    if (p._buttons.length) row.append(p.element);   // Argon never attaches an empty panel
  }
  A.ARGON.components.main = [action, bonus, reaction, special];
  A.ARGON._actor = actor;
  A.ARGON._token = toks[actor.id];
  return { action, bonus, reaction, special };
}
const fire = (panel, actor) => F.Hooks.callAll("renderActionPanelArgonComponent", panel, panel.element, actor);
const renderAll = (h, actor) => { for (const p of [h.action, h.bonus, h.reaction, h.special]) fire(p, actor); };
const describe = p => ({
  label: p.label,
  attached: p.element.isConnected,
  buttons: p._buttons.map(b => ({
    cls: b.constructor.name, id: b.item?.id ?? null, name: b.item?.name ?? null, classes: b.element.className,
    badge: b.element.querySelector(":scope > .quantity-1 span")?.textContent ?? null, followUp: b.followUp ?? null,
  })),
  domOrder: p.element.children.filter(c => c.className.includes("feature-element")).length,
  sig: p._pcSig ?? null,
  pips: p._pentarynPips ? { max: p.maxActions, current: p.currentActions, ours: p._pentarynPips() } : null,
  used: p.isActionUsed,
});
const reset = (...actors) => { for (const a of actors) delete a.flags[MODULE]; };
const onTurn = actor => setTurn(combat, { turn: turnOf(actor) });
const notes = () => F.calls.filter(c => c.op === "notify").map(c => c.message);

test("the bars as composed for the cast (golden/argon-bars.json)", async () => {
  const out = {};
  const compose = async (label, actor, opts = {}) => {
    reset(actor);
    opts.before?.();
    const h = buildHud(actor, opts);
    renderAll(h, actor);
    await drain();
    out[label] = [h.action, h.bonus, h.reaction, h.special].map(describe);
    opts.after?.();
  };
  onTurn(fig);
  await compose("fighter, his turn", fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  await compose("fighter after a Dagger swing (Off-hand: Handaxe offered)", fig, {
    mainSlot: "dagger0000000001", offSlot: "dagger0000000001",
    before: () => { fig.flags[MODULE] = { turn: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } }; },
  });
  onTurn(rog);
  await compose("rogue, her turn (Nick pair; Sneak Attack toggle)", rog, { mainSlot: "scimitar00000001", offSlot: "dagger0000000002" });
  await compose("rogue after the Scimitar (Nick on the Special bar)", rog, {
    mainSlot: "scimitar00000001", offSlot: "dagger0000000002",
    before: () => { rog.flags[MODULE] = { turn: { key: "c1:1:cb2", attackAction: { swings: 1, weapons: ["scimitar00000001"] } } }; },
  });
  onTurn(wlf);
  await compose("wolf, its turn (Multiattack)", wlf, { mainSlot: "bite" });
  onTurn(mnk0);
  await compose("monk with no Focus (Flurry greyed, Martial Arts)", mnk0);
  onTurn(mnk);
  await compose("monk with 2 Focus", mnk);
  onTurn(sly);
  await compose("slayer, Pole Strike gated on the bar", sly, {
    mainSlot: "glaive0000000001",
    extra: { bonus: [Object.assign(new A.ItemButton({ item: sly.items.get("polearmMaster001") }), { activity: sly.items.get("polearmMaster001").system.activities.get("poleStrikeAct001") })] },
  });
  await compose("slayer after the Glaive (Pole Strike open, Hew after a crit)", sly, {
    mainSlot: "glaive0000000001",
    before: () => { sly.flags[MODULE] = { turn: { key: "c1:1:cb6", attackAction: { swings: 1, weapons: ["glaive0000000001"], crit: true, critWeapon: "glaive0000000001" } } }; },
    extra: { bonus: [Object.assign(new A.ItemButton({ item: sly.items.get("polearmMaster001") }), { activity: sly.items.get("polearmMaster001").system.activities.get("poleStrikeAct001") })] },
  });
  onTurn(brb);
  await compose("barbarian (Reckless toggle, Frenzy toggle)", brb, { mainSlot: "greataxe00000001" });
  onTurn(gob);
  await compose("fighter off his turn", fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  combat.started = false;
  await compose("fighter out of combat, after a swing (New turn)", fig, {
    mainSlot: "longsword0000001",
    before: () => { fig.flags[MODULE] = { turn: { key: "nocombat", attackAction: { swings: 1, weapons: ["longsword0000001"] } } }; },
  });
  combat.started = true;
  pinJSON("argon-bars", out, import.meta.url);
  assert.equal(out["fighter, his turn"][0].buttons[0].cls, "FullAttackButton");
  reset(fig, rog, sly);
});

test("tooltips: Full Attack, the follow-ups and the commands (golden/argon-tooltips.json)", async () => {
  const out = {};
  const tips = async (label, actor, opts = {}) => {
    reset(actor);
    opts.before?.();
    const h = buildHud(actor, opts);
    renderAll(h, actor);
    const rows = [];
    for (const p of [h.action, h.bonus, h.special]) {
      for (const b of p._buttons) if (b.hasTooltip) rows.push({ id: b.item?.id, data: await b.getTooltipData() });
    }
    out[label] = rows;
  };
  onTurn(fig);
  await tips("fighter", fig);
  await tips("fighter after a Dagger swing", fig, { before: () => { fig.flags[MODULE] = { turn: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } }; } });
  onTurn(rog);
  await tips("rogue (Nick)", rog);
  onTurn(wlf);
  await tips("wolf", wlf);
  onTurn(mnk0);
  await tips("monk, no Focus", mnk0);
  onTurn(brb);
  await tips("barbarian", brb);
  pinJSON("argon-tooltips", out, import.meta.url);
  reset(fig, rog);
});

test("the swing pips: 2+ swings read the turn flag (Action Surge widens); 1 swing keeps Argon's own; setting off", async () => {
  onTurn(fig);
  reset(fig);
  let h = buildHud(fig, { mainSlot: "longsword0000001" });
  fire(h.action, fig);
  const rows = [{ label: "fresh", max: h.action.maxActions, current: h.action.currentActions, ours: h.action._pentarynPips() }];
  await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1 }, surges: 1 } });
  rows.push({ label: "one swing, one surge", max: h.action.maxActions, current: h.action.currentActions });
  combat.started = false;
  rows.push({ label: "out of combat: Argon's own", max: h.action.maxActions, current: h.action.currentActions });
  combat.started = true;
  onTurn(rog);
  h = buildHud(rog, { mainSlot: "scimitar00000001" });
  fire(h.action, rog);
  rows.push({ label: "rogue (1 swing + Nick): Argon's own", max: h.action.maxActions, current: h.action.currentActions, ours: h.action._pentarynPips() });
  await F.game.settings.set(MODULE, "swingPips", false);
  onTurn(fig);
  h = buildHud(fig, { mainSlot: "longsword0000001" });
  fire(h.action, fig);
  rows.push({ label: "swingPips off", max: h.action.maxActions, ours: h.action._pentarynPips ?? null });
  await F.game.settings.set(MODULE, "swingPips", true);
  pinJSON("argon-pips", rows, import.meta.url);
  assert.deepEqual([rows[0].max, rows[0].current], [2, 2]);
  reset(fig);
  F.calls.length = 0;
});

test("perf-1: one burst (a flag write, a settled sequence, a turn change) works out fullAttackState once per actor", async () => {
  onTurn(fig);
  reset(fig);
  const { fullAttackState } = await import("../hud/buttons-ui.mjs");
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  renderAll(h, fig);
  await drain();
  mock.timers.tick(60);
  // Each fullAttackState works the actor's Multiattack out from the setting: its reads count the computations.
  const get = F.game.settings.get;
  let reads = 0;
  F.game.settings.get = function (ns, key) { if (ns === MODULE && key === "multiattack") reads += 1; return get.call(this, ns, key); };
  const count = async (fn) => { reads = 0; await fn(); return reads; };
  try {
    const one = await count(() => fullAttackState(fig));
    const rows = {
      "one call": one,
      "a flag write": await count(() => fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1 } } })),
      "a settled sequence": await count(async () => { F.Hooks.callAll("pentarynCombat.sequenceEnd", fig); await drain(); }),
      "a turn change": await count(() => F.Hooks.callAll("updateCombat", combat, { round: 1 })),
      "outside a burst, each read works it out again": await count(() => { h.action.maxActions; h.action.currentActions; }),
    };
    assert.deepEqual(rows, {
      "one call": one,
      "a flag write": one,
      "a settled sequence": one,
      "a turn change": one,
      "outside a burst, each read works it out again": 2 * one,
    });
  } finally {
    F.game.settings.get = get;
  }
  mock.timers.tick(60);
  await drain();
  reset(fig);
  F.calls.length = 0;
});

test("perf-2: one burst works the follow-ups out once (the Bonus and Special signatures and the off-hand slot share it); a throw still logs at each caller", async () => {
  onTurn(fig);
  reset(fig);
  const { fullAttackState } = await import("../hud/buttons-ui.mjs");
  const { followUpsFor } = await import("../shapes.mjs");
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  renderAll(h, fig);
  await drain();
  mock.timers.tick(60);
  // Each follow-ups computation (and each fullAttackState with a weapon) reads Enhanced Dual Wielding once.
  const own = Object.hasOwn(fig, "getFlag");
  const getFlag = fig.getFlag;
  let reads = 0;
  fig.getFlag = function (scope, key) { if (scope === "dnd5e" && key === "enhancedDualWielding") reads += 1; return getFlag.call(this, scope, key); };
  const count = async (fn) => { reads = 0; await fn(); return reads; };
  try {
    const state = await count(() => fullAttackState(fig));
    const fu = await count(() => followUpsFor(fig));
    assert.ok(fu > 0, "the counter sees a follow-ups computation");
    const rows = {
      "a flag write": await count(() => fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1 } } })),
      "a settled sequence": await count(async () => { F.Hooks.callAll("pentarynCombat.sequenceEnd", fig); await drain(); }),
      "a turn change": await count(() => F.Hooks.callAll("updateCombat", combat, { round: 1 })),
    };
    assert.deepEqual(rows, {
      "a flag write": state + fu,
      "a settled sequence": state + fu,
      "a turn change": state + fu,
    });
  } finally {
    if (own) fig.getFlag = getFlag; else delete fig.getFlag;
  }
  // A throw is kept with the burst: each caller still logs its own debug line, the follow-ups are tried once.
  const desc = Object.getOwnPropertyDescriptor(h.bonus, "currentActions");
  let tries = 0;
  Object.defineProperty(h.bonus, "currentActions", { configurable: true, get() { tries += 1; throw new Error("perf-2 probe"); } });
  const debugs = [];
  const debug = console.debug;
  console.debug = (...args) => debugs.push([args[0], args[1]?.message ?? null]);
  globalThis.CONFIG.debug = { ...(globalThis.CONFIG.debug ?? {}), [MODULE]: true };
  try {
    await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 2 } } });
  } finally {
    console.debug = debug;
    delete globalThis.CONFIG.debug[MODULE];
    if (desc) Object.defineProperty(h.bonus, "currentActions", desc); else delete h.bonus.currentActions;
  }
  assert.equal(tries, 1, "the follow-ups are tried once per burst");
  assert.deepEqual(debugs.filter(d => d[1] === "perf-2 probe"), [
    [`${MODULE} | bar signature (next render recomposes)`, "perf-2 probe"],
    [`${MODULE} | bar signature (next render recomposes)`, "perf-2 probe"],
    [`${MODULE} | off-hand slot re-check (the next render re-checks)`, "perf-2 probe"],
  ]);
  mock.timers.tick(60);
  await drain();
  row.textContent = "";
  reset(fig);
  F.calls.length = 0;
});

test("perf-3: a Multiattack actor never scans its weapons, so a malformed attack item leaves its pips on the Multiattack total", async () => {
  onTurn(wlf);
  reset(wlf);
  const { fullAttackState } = await import("../hud/buttons-ui.mjs");
  const h = buildHud(wlf);
  fire(h.action, wlf);
  const sys = wlf.items.get("bite").system;
  const props = sys.properties;
  sys.properties = { lgt: true };   // not iterable: a weapon shape of the Bite throws
  try {
    const st = fullAttackState(wlf);
    assert.deepEqual([st.ma?.total, st.pipCount, st.worth], [2, 2, true]);
    assert.deepEqual([h.action.maxActions, h.action._pentarynPips()], [2, true], "the Multiattack's pips, not Argon's single one");
  } finally {
    sys.properties = props;
  }
  reset(wlf);
  F.calls.length = 0;
});

test("Full Attack clicks: runs the plan; asks for a weapon once when nothing is remembered; warns with no swings left", async () => {
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig);
  fire(h.action, fig);
  const fa = h.action._buttons[0];
  assert.equal(fa.constructor.name, "FullAttackButton");
  // nothing remembered, no weapon set, 2+ candidates: the picker first
  F.calls.length = 0;
  const click = fa._onLeftClick({ type: "mouseup" });
  await drain();
  const picker = doc.body.querySelector(".pentaryn-combat-picker");
  assert.ok(picker);
  const tiles = picker.querySelectorAll("button[data-id]").map(b => b.dataset.id);
  await picker.fire("click", { target: picker.querySelector('button[data-id="longsword0000001"]') });
  await click;
  await drain();
  mock.timers.tick(400);
  await drain();
  const rolls = F.calls.filter(c => c.op === "activity.rollAttack").length;
  assert.equal(fig.flags[MODULE].last.weapon, "longsword0000001");
  assert.equal(rolls, 2);
  // no swings left this turn
  F.calls.length = 0;
  await fa._onLeftClick({});
  assert.deepEqual(notes(), [F.game.i18n.localize("PENTARYN_COMBAT.Hud.NoSwingsLeft")]);
  // the picker closed with Esc: nothing runs
  reset(fig);
  F.calls.length = 0;
  const click2 = fa._onLeftClick({});
  await drain();
  mock.timers.tick(0);
  await doc.fire("keydown", { key: "Escape" });
  await click2;
  assert.equal(F.calls.filter(c => c.op === "activity.rollAttack").length, 0);
  // right-click: choose and re-render the Action bar 60 ms later
  F.calls.length = 0;
  const rc = fa._onRightClick();
  await drain();
  mock.timers.tick(0);
  const p2 = doc.body.querySelector(".pentaryn-combat-picker");
  await p2.fire("click", { target: p2.querySelector('button[data-id="dagger0000000001"]') });
  await rc;
  mock.timers.tick(60);
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "argon.panel.render").map(c => c.label), ["DND5E.Action"]);
  assert.equal(fig.flags[MODULE].last.weapon, "dagger0000000001");
  pinJSON("argon-full-attack-click", { tiles, targets: [fa.targets, fa.ranges], hasTooltip: fa.hasTooltip }, import.meta.url);
  reset(fig);
  F.calls.length = 0;
});

test("Full Attack's targets/ranges: Argon's picker opens only when nothing is targeted and nothing runs", () => {
  onTurn(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001" });
  fire(h.action, fig);
  const fa = h.action._buttons[0];
  F.game.user.targets.clear();
  assert.equal(fa.targets, 1);
  F.game.user.targets.add(toks[gob.id]);
  assert.equal(fa.targets, 0);
  F.game.user.targets.clear();
  assert.deepEqual(fa.ranges, { normal: 5, long: null });
  fig.flags[MODULE] = { last: { weapon: "shortbow00000001" } };
  assert.deepEqual(fa.ranges, { normal: 80, long: 320 });
  reset(fig);
});

test("PickerProbe.ranges: range, reach, then the grid distance, else 5", async () => {
  const { argonClasses } = await import("../hud/buttons-ui.mjs");
  const { PickerProbe } = argonClasses();
  assert.deepEqual(new PickerProbe({ activity: { range: { value: 80, long: 320 } } }).ranges, { normal: 80, long: 320 });
  assert.deepEqual(new PickerProbe({ activity: { item: { system: { range: { reach: 10 } } } } }).ranges, { normal: 10, long: null });
  assert.deepEqual(new PickerProbe({ activity: {} }).ranges, { normal: 5, long: null });
});

test("ext-7: Full Attack, follow-ups and the picker probe share one fallback, the scene's grid distance", async () => {
  const { argonClasses } = await import("../hud/buttons-ui.mjs");
  const { PickerProbe, FollowUpButton } = argonClasses();
  const had = Object.hasOwn(F.canvas.scene, "grid"), was = F.canvas.scene.grid;
  F.canvas.scene.grid = { distance: 10 };
  try {
    assert.deepEqual(new PickerProbe({ activity: {} }).ranges, { normal: 10, long: null });
    const fu = new FollowUpButton({ hudActor: fig, followUp: { kind: "offhand", weaponId: "nosuchweapon0001" } });
    assert.deepEqual(fu.ranges, { normal: 10, long: null });
    // reach still wins over the fallback
    assert.deepEqual(new PickerProbe({ activity: { item: { system: { range: { reach: 5 } } } } }).ranges, { normal: 5, long: null });
  } finally {
    if (had) F.canvas.scene.grid = was; else delete F.canvas.scene.grid;
  }
});

test("follow-up and command clicks (golden/argon-clicks.json)", async () => {
  const out = {};
  // a greyed Flurry warns, no picker
  onTurn(mnk0);
  let h = buildHud(mnk0);
  renderAll(h, mnk0);
  const flurry = h.bonus._buttons.find(b => b.followUp?.kind === "flurry");
  out.flurryTargets = flurry.targets;
  F.calls.length = 0;
  await flurry._onLeftClick({});
  out.flurryGreyed = notes();
  // Martial Arts runs the follow-up
  F.calls.length = 0;
  const ma = h.bonus._buttons.find(b => b.followUp?.kind === "martial-arts");
  out.maRanges = ma.ranges;
  await ma._onLeftClick({});
  mock.timers.tick(400);
  await drain();
  out.maRolls = F.calls.filter(c => c.op === "activity.rollAttack").map(c => c.activity);
  reset(mnk0);
  // the Sneak Attack toggle: ask → auto, and the Special bar re-renders
  onTurn(rog);
  h = buildHud(rog);
  renderAll(h, rog);
  const toggle = h.special._buttons.find(b => b.item?.id === "pentaryn-combat-rider-sneak-attack");
  out.toggleTooltip = await toggle.getTooltipData();
  F.calls.length = 0;
  await toggle._onLeftClick();
  mock.timers.tick(60);
  await drain();
  out.toggle = { mode: F.game.user.flags[MODULE].riders["sneak-attack"], renders: F.calls.filter(c => c.op === "argon.panel.render").map(c => c.label) };
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "ask");
  // Reckless on: the effect, a note, the Special bar re-rendered
  onTurn(brb);
  h = buildHud(brb);
  renderAll(h, brb);
  const reckless = h.special._buttons.find(b => b.item?.id === "pentaryn-combat-reckless");
  F.calls.length = 0;
  await reckless._onLeftClick();
  mock.timers.tick(60);
  await drain();
  out.reckless = { on: brb.effects.contents.map(e => e.name), notes: notes(), renders: F.calls.filter(c => c.op === "argon.panel.render").map(c => c.label) };
  h = buildHud(brb);
  renderAll(h, brb);
  const off = h.special._buttons.find(b => b.item?.id === "pentaryn-combat-reckless");
  out.recklessOnClass = off.element.className;
  await off._onLeftClick();
  out.recklessOff = brb.effects.contents.map(e => e.name);
  // New turn out of combat
  combat.started = false;
  fig.flags[MODULE] = { turn: { key: "nocombat", attackAction: { swings: 2, weapons: ["longsword0000001"] } } };
  h = buildHud(fig);
  renderAll(h, fig);
  const nt = h.special._buttons.find(b => b.item?.id === "pentaryn-combat-new-turn");
  await nt._onLeftClick();
  out.newTurn = fig.flags[MODULE].turn;
  combat.started = true;
  mock.timers.tick(60);   // the Reckless-off click's Special re-render
  await drain();
  pinJSON("argon-clicks", out, import.meta.url);
  reset(fig, rog, brb);
  F.calls.length = 0;
});

test("events spend Argon's own pips: usage, bonusSpent, bonusAction, otherAction, reaction, offhand (golden/argon-events.json)", async () => {
  const rows = [];
  const look = (label, h) => rows.push({ label, action: h.action.isActionUsed, bonus: h.bonus.isActionUsed, reaction: h.reaction.isActionUsed, calls: F.calls.splice(0).filter(c => c.op.startsWith("argon.")) });
  onTurn(rog);
  reset(rog);
  let h = buildHud(rog, { mainSlot: "scimitar00000001", offSlot: "dagger0000000002" });
  renderAll(h, rog);
  F.calls.length = 0;
  const sc = [...rog.items.get("scimitar00000001").system.activities.values()][0];
  F.Hooks.callAll("pentarynCombat.usage", sc, "main");
  look("usage main, 1-swing rogue: Argon's consumeActionEconomy", h);
  F.Hooks.callAll("pentarynCombat.usage", sc, "nick");
  look("usage nick: nothing", h);
  F.Hooks.callAll("pentarynCombat.bonusSpent", rog, "offhand");
  look("bonusSpent: Bonus pip used", h);
  h.bonus.isActionUsed = false;
  F.Hooks.callAll("pentarynCombat.bonusAction", rog, sc);
  look("bonusAction: Bonus pip used", h);
  F.Hooks.callAll("pentarynCombat.otherAction", rog, sc);
  look("otherAction: Action pip used (Argon's single pip)", h);
  F.Hooks.callAll("pentarynCombat.offhand", rog, { bySequence: false });
  look("offhand by hand with no Action taken: Action pip given back", h);
  F.Hooks.callAll("pentarynCombat.reaction", rog, sc);
  look("reaction: Reaction pip used", h);
  F.Hooks.callAll("pentarynCombat.bonusSpent", fig, "offhand");
  look("another actor's event: nothing", h);
  combat.started = false;
  h.bonus.isActionUsed = false;
  F.Hooks.callAll("pentarynCombat.bonusSpent", rog, "offhand");
  look("out of combat: no pips", h);
  combat.started = true;
  onTurn(fig);
  reset(fig);
  h = buildHud(fig, { mainSlot: "longsword0000001" });
  renderAll(h, fig);
  F.calls.length = 0;
  F.Hooks.callAll("pentarynCombat.usage", [...fig.items.get("longsword0000001").system.activities.values()][0], "main");
  look("usage main with our swing pips: nothing (our pips count it)", h);
  F.Hooks.callAll("pentarynCombat.otherAction", fig, null);
  look("otherAction with our swing pips: nothing", h);
  pinJSON("argon-events", rows, import.meta.url);
  F.calls.length = 0;
});

test("restorePips: a re-bound HUD and a new round repaint Argon's own pips from the flags", async () => {
  onTurn(rog);
  rog.flags[MODULE] = { turn: { key: "c1:1:cb2", otherActions: 1, bonusUsed: true }, reaction: { combatId: "c1" } };
  const h = buildHud(rog);
  renderAll(h, rog);
  const afterRender = [h.action.isActionUsed, h.bonus.isActionUsed, h.reaction.isActionUsed];
  h.action.isActionUsed = h.bonus.isActionUsed = h.reaction.isActionUsed = false;
  F.Hooks.callAll("updateCombat", combat, { round: 1 });
  mock.timers.tick(0);
  const afterRound = [h.action.isActionUsed, h.bonus.isActionUsed, h.reaction.isActionUsed];
  h.action.isActionUsed = h.bonus.isActionUsed = h.reaction.isActionUsed = false;
  F.Hooks.callAll("updateCombat", combat, { turn: 2 });
  mock.timers.tick(0);
  const afterTurnOnly = [h.action.isActionUsed, h.bonus.isActionUsed, h.reaction.isActionUsed];
  onTurn(gob);
  h.action.isActionUsed = h.bonus.isActionUsed = h.reaction.isActionUsed = false;
  fire(h.action, rog);
  const offTurn = [h.action.isActionUsed, h.bonus.isActionUsed, h.reaction.isActionUsed];
  assert.deepEqual(afterRender, [true, true, true]);
  assert.deepEqual(afterRound, [true, true, true]);
  assert.deepEqual(afterTurnOnly, [false, false, false]);
  assert.deepEqual(offTurn, [false, false, true], "off its turn only the Reaction is repainted");
  // your turn began: the Reaction flag cleared relights the pip
  onTurn(rog);
  h.reaction.isActionUsed = true;
  await rog.update({ [`flags.${MODULE}.reaction`]: null });
  assert.equal(h.reaction.isActionUsed, false);
  reset(rog);
  F.calls.length = 0;
});

test("re-render on change: a bar is rebuilt 60 ms later only when its signature changed; forgetButtons; slots refilled", async () => {
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  const drawer = new A.ButtonPanel();
  row.append(drawer.element);
  h.bonus._buttons[0].panel = drawer;
  A.ARGON._itemButtons.add(h.bonus._buttons[0]);
  A.ARGON.components.weaponSets = { getSetData: async () => ({ set: 1 }) };
  renderAll(h, fig);
  F.calls.length = 0;
  // a main swing: the Action bar's signature stays, the Bonus bar's too (no Light weapon used)
  await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["longsword0000001"] } } });
  mock.timers.tick(60);
  await drain();
  const first = F.calls.splice(0).filter(c => c.op.startsWith("argon."));
  // a Dagger swing: Off-hand appears → the Bonus bar re-renders, its drawer and hook forgotten, slots refilled
  await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } });
  mock.timers.tick(59);
  const before60 = F.calls.filter(c => c.op === "argon.panel.render").length;
  mock.timers.tick(1);
  await drain();
  const second = F.calls.splice(0).filter(c => c.op.startsWith("argon."));
  pinJSON("argon-rerender", { first, before60, second, drawerGone: !drawer.element.isConnected, itemButtons: A.ARGON._itemButtons.size }, import.meta.url);
  assert.equal(before60, 0);
  // the HUD unbound before the 60 ms: nothing renders
  await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] }, followUps: ["offhand"], bonusUsed: true } });
  A.ARGON._actor = null;
  mock.timers.tick(60);
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "argon.panel.render"), []);
  // a render that rejects is warned with its bar's label
  A.ARGON._actor = fig;
  h.bonus.render = async () => { throw new Error("argon broke"); };
  await fig.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } });
  mock.timers.tick(60);
  await drain();
  assert.deepEqual(lines.splice(0), [{ level: "warn", text: "pentaryn-combat | DND5E.BonusAction re-render", err: "argon broke" }]);
  reset(fig);
  F.calls.length = 0;
});

test("other triggers: sequenceEnd, a new turn/round (aborting a stale sequence), a deleted combat, an item, an effect, a new body", async () => {
  const rows = [];
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  renderAll(h, fig);
  const fa = h.action._buttons[0];
  let refreshes = 0;
  const own = fa.refresh.bind(fa);
  fa.refresh = () => { refreshes += 1; own(); };
  const look = label => { rows.push({ label, refreshes, renders: F.calls.filter(c => c.op === "argon.panel.render").map(c => c.label) }); refreshes = 0; F.calls.length = 0; };
  F.calls.length = 0;
  F.Hooks.callAll("pentarynCombat.sequenceEnd", fig);
  await drain();
  mock.timers.tick(60);
  look("sequenceEnd");
  F.Hooks.callAll("pentarynCombat.sequenceEnd", rog);
  await drain();
  look("sequenceEnd for another actor");
  F.Hooks.callAll("updateCombat", combat, { round: 1 });
  mock.timers.tick(60);
  look("updateCombat round");
  F.Hooks.callAll("updateCombat", combat, { active: true });
  look("updateCombat, nothing turn-related");
  F.Hooks.callAll("deleteCombat", combat);
  mock.timers.tick(0);
  mock.timers.tick(60);
  look("deleteCombat (a tick later)");
  F.Hooks.callAll("updateItem", fig.items.get("dagger0000000001"), {});
  mock.timers.tick(60);
  look("updateItem of the HUD actor");
  F.Hooks.callAll("updateItem", rog.items.get("dagger0000000002"), {});
  look("updateItem of another actor");
  F.Hooks.callAll("createActiveEffect", { parent: fig, name: "Blessed" });
  mock.timers.tick(60);
  look("an effect on the HUD actor");
  pinJSON("argon-triggers", rows, import.meta.url);
  // a running sequence is aborted when the turn moves on, or the token becomes another body
  let release;
  const a = [...fig.items.get("longsword0000001").system.activities.values()][0];
  a.script.attack.push(() => new Promise(r => { release = r; }));
  const run = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }, { weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  F.Hooks.callAll("updateCombat", combat, { round: 1 });
  assert.equal(seq.running().abort, false, "still his turn");
  onTurn(gob);
  F.Hooks.callAll("updateCombat", combat, { turn: turnOf(gob) });
  assert.equal(seq.running().abort, true);
  release({ total: 10 });
  assert.deepEqual(await run, { rolled: 1, status: "stopped" });
  mock.timers.tick(400);
  onTurn(fig);
  a.script.attack.push(() => new Promise(r => { release = r; }));
  const run2 = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }]);
  await drain();
  F.Hooks.callAll("updateToken", toks[fig.id].document, { x: 5 });
  assert.equal(seq.running().abort, false);
  // edge-2: another creature's token becoming another body leaves this sequence running
  F.Hooks.callAll("updateToken", toks[rog.id].document, { actorId: "other" });
  assert.equal(seq.running().abort, false, "edge-2: another token's shape change does not abort");
  F.Hooks.callAll("updateToken", toks[fig.id].document, { actorId: "other" });
  assert.equal(seq.running().abort, true);
  release(null);
  await run2;
  mock.timers.tick(400);
  await drain();
  reset(fig);
  F.calls.length = 0;
});

test("ac-3: a refresh that throws after a settled sequence or a deleted combat is logged at debug, never an unhandled rejection or a timer throw", async () => {
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  renderAll(h, fig);
  await drain();
  const fa = h.action._buttons[0];
  fa.refresh = () => { throw new Error("reading 'items' of null"); };
  const unhandled = [];
  const onUnhandled = err => unhandled.push(err?.message ?? String(err));
  process.on("unhandledRejection", onUnhandled);
  const debugs = [];
  const debug = console.debug;
  console.debug = (...args) => debugs.push([args[0], args[1]?.message ?? null]);
  globalThis.CONFIG.debug = { ...(globalThis.CONFIG.debug ?? {}), [MODULE]: true };
  const timerThrows = [];
  try {
    F.Hooks.callAll("pentarynCombat.sequenceEnd", fig);
    await drain();
    await new Promise(r => setImmediate(r));
    F.Hooks.callAll("deleteCombat", combat);
    try { mock.timers.tick(0); mock.timers.tick(60); } catch (err) { timerThrows.push(err.message); }
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.debug = debug;
    delete globalThis.CONFIG.debug[MODULE];
    row.textContent = "";
  }
  assert.deepEqual(unhandled, [], "sequenceEnd: no unhandled rejection");
  assert.deepEqual(timerThrows, [], "deleteCombat: the timer body never throws");
  assert.deepEqual(debugs.filter(d => d[1] === "reading 'items' of null"), [
    [`${MODULE} | bars: sequence ended`, "reading 'items' of null"],
    [`${MODULE} | bars: combat over (HUD closed)`, "reading 'items' of null"],
  ]);
  reset(fig);
  F.calls.length = 0;
});

test("Pole Strike gate: greyed with its reason; a left mouseup is stopped with a note; the tooltip says why", async () => {
  onTurn(sly);
  reset(sly);
  const pole = Object.assign(new A.ItemButton({ item: sly.items.get("polearmMaster001") }), { activity: sly.items.get("polearmMaster001").system.activities.get("poleStrikeAct001") });
  pole.getTooltipData = async () => ({ title: "Pole Strike", description: "<p>own</p>" });
  const h = buildHud(sly, { mainSlot: "glaive0000000001", extra: { bonus: [pole] } });
  renderAll(h, sly);
  assert.ok(pole.element.classList.contains("pentaryn-combat-gated"));
  F.calls.length = 0;
  const ev = await pole.element.fire("mouseup", { button: 0 });
  assert.equal(ev.event.immediateStopped, true);
  assert.deepEqual(notes(), [F.game.i18n.localize("PENTARYN_COMBAT.Hud.PoleStrikeGated")]);
  const right = await pole.element.fire("mouseup", { button: 2 });
  assert.equal(right.event.immediateStopped, false);
  const gated = await pole.getTooltipData();
  sly.flags[MODULE] = { turn: { key: "c1:1:cb6", attackAction: { swings: 1, weapons: ["glaive0000000001"] } } };
  F.Hooks.callAll("renderItemButtonArgonComponent", pole, pole.element, sly);
  assert.equal(pole.element.classList.contains("pentaryn-combat-gated"), false);
  const open = await pole.getTooltipData();
  F.calls.length = 0;
  const ev2 = await pole.element.fire("mouseup", { button: 0 });
  assert.equal(ev2.event.immediateStopped, false);
  pinJSON("argon-pole-strike", { gated, open }, import.meta.url);
  await F.game.settings.set(MODULE, "gateFollowUps", false);
  reset(sly);
  const pole2 = Object.assign(new A.ItemButton({ item: sly.items.get("polearmMaster001") }), { activity: { name: "Pole Strike" } });
  F.Hooks.callAll("renderItemButtonArgonComponent", pole2, pole2.element, sly);
  assert.equal(pole2.element.classList.contains("pentaryn-combat-gated"), false, "setting off");
  await F.game.settings.set(MODULE, "gateFollowUps", true);
  const notPole = Object.assign(new A.ItemButton({ item: { id: "x", system: { identifier: "polearm-master" } } }), { activity: { name: "Reactive Strike", activation: { type: "reaction" }, type: "attack" } });
  F.Hooks.callAll("renderItemButtonArgonComponent", notPole, notPole.element, sly);
  assert.equal(notPole.element.classList.contains("pentaryn-combat-gated"), false, "Reactive Strike stays");
  const throwing = new A.ItemButton({ item: { id: "y" } });
  Object.defineProperty(throwing, "activity", { get() { throw new Error("no activity"); } });
  F.Hooks.callAll("renderItemButtonArgonComponent", throwing, throwing.element, sly);
  assert.deepEqual(lines.splice(0), []);
  F.calls.length = 0;
});

test("a follow-up that appears mid-turn pulses until the pointer reaches the bar, or 12 s", async () => {
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001", offSlot: "dagger0000000001" });
  renderAll(h, fig);
  fig.flags[MODULE] = { turn: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } };
  fire(h.bonus, fig);
  const off = h.bonus._buttons.find(b => b.followUp?.kind === "offhand");
  assert.ok(off.element.classList.contains("pentaryn-combat-new"));
  mock.timers.tick(11_999);
  assert.ok(off.element.classList.contains("pentaryn-combat-new"));
  mock.timers.tick(1);
  assert.equal(off.element.classList.contains("pentaryn-combat-new"), false);
  fire(h.bonus, fig);
  const again = h.bonus._buttons.find(b => b.followUp?.kind === "offhand");
  assert.equal(again.element.classList.contains("pentaryn-combat-new"), false, "seen before: no pulse");
  // first composition for an actor: no pulse; pointerenter stops it
  reset(fig);
  h.bonus._pcFuSeen = { actor: fig.uuid, keys: new Set() };
  fig.flags[MODULE] = { turn: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } };
  fire(h.bonus, fig);
  const third = h.bonus._buttons.find(b => b.followUp?.kind === "offhand");
  assert.ok(third.element.classList.contains("pentaryn-combat-new"));
  await h.bonus.element.fire("pointerenter");
  assert.equal(third.element.classList.contains("pentaryn-combat-new"), false);
  reset(fig);
});

test("a panel Argon never attached is put in its place when our buttons land in it (U-3-7)", () => {
  onTurn(rog);
  reset(rog);
  const h = buildHud(rog, { mainSlot: "scimitar00000001", offSlot: "dagger0000000002" });
  assert.equal(h.special.element.isConnected, false);
  renderAll(h, rog);
  assert.equal(h.special.element.isConnected, true);
  assert.deepEqual(row.children.map(c => A.ARGON.components.main.find(p => p.element === c)?.label ?? c.className), ["DND5E.Action", "DND5E.BonusAction", "DND5E.Special"]);
  reset(rog);
});

test("tooltip hygiene: a stray Argon tooltip drops on pointerover elsewhere; roll and usage dialogs drop it; our buttons close theirs on leave", async () => {
  onTurn(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001" });
  renderAll(h, fig);
  const fa = h.action._buttons[0];
  const other = doc.createElement("div");
  doc.body.append(other);
  // pointerover elsewhere: dropped
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  F.calls.length = 0;
  await doc.fire("pointerover", { target: other });
  const away = F.calls.splice(0);
  assert.equal(A.ARGON._tooltip, null);
  // over its own button: kept; locked: kept
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  await doc.fire("pointerover", { target: fa.element });
  assert.notEqual(A.ARGON._tooltip, null);
  A.ARGON._tooltip._locked = true;
  await doc.fire("pointerover", { target: other });
  assert.notEqual(A.ARGON._tooltip, null);
  // its button gone from the page: dropped on the next pointerover, even over the tooltip
  const gone = doc.createElement("div");
  A.ARGON._tooltip = argonTooltip(F, gone);
  await doc.fire("pointerover", { target: A.ARGON._tooltip.element });
  const goneCalls = F.calls.splice(0);
  assert.equal(A.ARGON._tooltip, null);
  // roll windows, dnd5e dialogs, the activity chooser, DialogV2
  const dialogs = [];
  for (const hook of ["renderRollConfigurationDialog", "renderRollResolver", "renderDialog5e", "renderActivityChoiceDialog", "renderDialogV2"]) {
    A.ARGON._tooltip = argonTooltip(F, fa.element);
    F.Hooks.callAll(hook, {});
    dialogs.push([hook, A.ARGON._tooltip === null]);
  }
  await F.game.settings.set(MODULE, "fullAttack", false);
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  F.Hooks.callAll("renderDialogV2", {});
  dialogs.push(["fullAttack off", A.ARGON._tooltip === null]);
  await F.game.settings.set(MODULE, "fullAttack", true);
  // mouseleave on our button closes its own tooltip
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  await fa.element.fire("mouseleave");
  dialogs.push(["mouseleave", A.ARGON._tooltip === null]);
  // refresh re-renders an open tooltip of ours in place with fresh data
  A.ARGON._tooltip = argonTooltip(F, fa.element);
  F.calls.length = 0;
  fa.refresh();
  await drain();
  const refreshed = F.calls.filter(c => c.op === "argon.tooltip.render").length;
  A.ARGON._tooltip = null;
  pinJSON("argon-tooltip-hygiene", { away, goneCalls, dialogs, refreshed }, import.meta.url);
  assert.equal(refreshed, 1);
  other.remove();
  F.calls.length = 0;
});

test("the picker tutorial and its cue: setting on/off through createSetting / updateSetting; the observer places the label", async () => {
  const rows = [];
  rows.push({ label: "after ready", cue: doc.body.classList.contains("pentaryn-combat-picker-cue"), guide: F.game.settings.get("enhancedcombathud", "targetPickerGuideShown") });
  await F.game.settings.set(MODULE, "skipPickerGuide", false);
  F.Hooks.callAll("updateSetting", { key: `${MODULE}.skipPickerGuide` });
  rows.push({ label: "switched off", cue: doc.body.classList.contains("pentaryn-combat-picker-cue") });
  F.Hooks.callAll("createSetting", { key: `${MODULE}.other` });
  await F.game.settings.set(MODULE, "skipPickerGuide", true);
  await F.game.settings.set("enhancedcombathud", "targetPickerGuideShown", false);
  F.calls.length = 0;
  F.Hooks.callAll("createSetting", { key: `${MODULE}.skipPickerGuide` });
  rows.push({ label: "switched on again", cue: doc.body.classList.contains("pentaryn-combat-picker-cue"), calls: F.calls.splice(0) });
  // the observer: a label added with no position goes to the pointer, with a starting text
  await doc.fire("pointermove", { clientX: 300, clientY: 400 });
  const label = doc.createElement("div");
  label.className = "ech-target-picker";
  const placed = doc.createElement("div");
  placed.className = "ech-target-picker";
  placed.style.left = "5px";
  placed.textContent = "1/1 Targets";
  doc.observers[0].cb([{ addedNodes: [label, placed, "text"] }]);
  rows.push({ label: "observer", style: { ...label.style }, text: label.textContent, placedStyle: { ...placed.style }, placedText: placed.textContent });
  await doc.fire("pointerdown", { clientX: 10, clientY: 20 });
  doc.body.classList.remove("pentaryn-combat-picker-cue");
  const late = doc.createElement("div");
  late.className = "ech-target-picker";
  doc.observers[0].cb([{ addedNodes: [late] }]);
  rows.push({ label: "cue off: untouched", style: { ...late.style }, text: late.textContent });
  doc.body.classList.add("pentaryn-combat-picker-cue");
  // marking the tutorial seen fails: warned
  const set = F.game.settings.set;
  F.game.settings.set = () => { throw new Error("client setting locked"); };
  await set.call(F.game.settings, "enhancedcombathud", "targetPickerGuideShown", false);
  F.Hooks.callAll("updateSetting", { key: `${MODULE}.skipPickerGuide` });
  F.game.settings.set = set;
  rows.push({ label: "set throws", console: lines.splice(0) });
  pinJSON("argon-picker-guide", rows, import.meta.url);
  F.calls.length = 0;
});

test("ac-1: marking Argon's picker tutorial seen rejects (async settings.set): warned once, never an unhandled rejection", async () => {
  const unhandled = [];
  const onUnhandled = err => unhandled.push(err?.message ?? String(err));
  process.on("unhandledRejection", onUnhandled);
  const set = F.game.settings.set;
  lines.splice(0);
  try {
    await set.call(F.game.settings, "enhancedcombathud", "targetPickerGuideShown", false);
    F.game.settings.set = async () => { throw new Error("client setting locked"); };
    F.Hooks.callAll("updateSetting", { key: `${MODULE}.skipPickerGuide` });
    await drain();
    await new Promise(r => setImmediate(r));
  } finally {
    process.off("unhandledRejection", onUnhandled);
    F.game.settings.set = set;
  }
  assert.deepEqual(unhandled, [], "no unhandled rejection");
  const warned = lines.splice(0).filter(l => JSON.stringify(l).includes("marking Argon's picker tutorial seen failed"));
  assert.equal(warned.length, 1, "warned once");
  F.calls.length = 0;
});

test("Argon's target picker for a Retarget: a hidden probe's pre-click; undefined when it can't run", async () => {
  onTurn(fig);
  reset(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001" });
  renderAll(h, fig);
  const rows = [];
  const a = [...fig.items.get("longsword0000001").system.activities.values()][0];
  const run = async (label, setup) => {
    F.game.user.targets.clear();
    F.game.user.targets.add(toks[gob.id]);
    setup?.();
    a.script.attack.push(null, { total: 10 }, { total: 10 });
    const p = seq.runSwings(fig, [{ weaponId: "longsword0000001", mode: null, kind: "main" }, { weaponId: "longsword0000001", mode: null, kind: "main" }]);
    await drain();
    F.calls.length = 0;
    const el = doc.getElementById("pentaryn-combat-strip");
    await el.fire("click", { target: el.querySelector('[data-pc="retarget"]') });
    await drain();
    if (F.listeners("targetToken")) { F.Hooks.callAll("targetToken", F.game.user, toks[rog.id], true); await drain(); }
    const st = seq.running()?.state.status ?? "ended";
    if (st === "paused") { const e = doc.getElementById("pentaryn-combat-strip"); await e.fire("click", { target: e.querySelector('[data-pc="resume"]') }); }
    await p;
    mock.timers.tick(400);
    await drain();
    rows.push({ label, statusAfterPick: st, calls: F.calls.filter(c => ["argon.preLeftClick", "canvas.setTargets", "notify", "argon.leftClick"].includes(c.op)) });
    reset(fig);
  };
  await run("picked", () => { A.ARGON.pickScript.push([toks[rog.id]]); });
  await run("cancelled (right-click): targets restored, still paused", () => { A.ARGON.pickScript.push(null); });
  await run("Argon's picker setting off: the fallback", () => { F.game.settings.set("enhancedcombathud", "rangepicker", false); });
  await F.game.settings.set("enhancedcombathud", "rangepicker", true);
  await run("no HUD token: the fallback", () => { A.ARGON._token = null; });
  A.ARGON._token = toks[fig.id];
  pinJSON("argon-target-picker", rows, import.meta.url);
  F.game.user.targets.clear();
  F.calls.length = 0;
});

test("a composition that throws is logged as an error and Argon's render goes on", () => {
  onTurn(fig);
  const h = buildHud(fig, { mainSlot: "longsword0000001" });
  Object.defineProperty(h.action, "_buttons", { get() { throw new Error("buttons gone"); }, configurable: true });
  lines.length = 0;
  fire(h.action, fig);
  assert.deepEqual(lines.splice(0).map(l => [l.level, l.text, l.err]), [
    ["warn", "pentaryn-combat | turn-flow buttons", "buttons gone"],
    ["error", "pentaryn-combat | HUD composition failed", "buttons gone"],
  ]);
  const panelNoActor = new A.ActionPanel({ label: "DND5E.Action" });
  A.ARGON._actor = null;
  F.Hooks.callAll("renderActionPanelArgonComponent", panelNoActor, panelNoActor.element, null);
  assert.deepEqual(panelNoActor._buttons, [], "no actor: nothing composed");
  const throwingEco = A.DND5eItemButton.consumeActionEconomy;
  A.DND5eItemButton.consumeActionEconomy = () => { throw new Error("eco"); };
  A.ARGON._actor = rog;
  onTurn(rog);
  const h2 = buildHud(rog, { mainSlot: "scimitar00000001" });
  renderAll(h2, rog);
  F.Hooks.callAll("pentarynCombat.usage", [...rog.items.get("scimitar00000001").system.activities.values()][0], "main");
  A.DND5eItemButton.consumeActionEconomy = throwingEco;
  assert.deepEqual(lines.splice(0), [{ level: "warn", text: "pentaryn-combat | action economy", err: "eco" }]);
});

test("legacy oracle: followUpsNow as the bars read it, panel or not (golden/follow-ups-now.json)", () => {
  const rows = {};
  for (const [label, actor, setup] of [
    ["fighter, fresh", fig, () => onTurn(fig)],
    ["fighter after a Light Dagger swing", fig, () => { onTurn(fig); fig.flags[MODULE] = { turn: { key: "c1:1:cb1", attackAction: { swings: 1, weapons: ["dagger0000000001"] } } }; }],
    ["rogue after the Scimitar (Nick)", rog, () => { onTurn(rog); rog.flags[MODULE] = { turn: { key: "c1:1:cb2", attackAction: { swings: 1, weapons: ["scimitar00000001"] } } }; }],
    ["monk focus 0", mnk0, () => onTurn(mnk0)],
    ["monk focus 2", mnk, () => onTurn(mnk)],
  ]) {
    setup();
    rows[label] = {
      noPanel: legacy.followUpsNow(actor, null),
      bonusFree: legacy.followUpsNow(actor, { currentActions: 1 }),
      bonusSpent: legacy.followUpsNow(actor, { currentActions: 0 }),
    };
    reset(actor);
  }
  combat.started = false;
  rows["fighter out of combat, panel spent (ignored out of combat)"] = { bonusSpent: legacy.followUpsNow(fig, { currentActions: 0 }) };
  combat.started = true;
  pinJSON("follow-ups-now", rows, import.meta.url);
});
