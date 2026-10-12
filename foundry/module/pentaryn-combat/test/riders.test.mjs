// riders.mjs, the once-per-turn riders on attack cards (guide S6a renames it turn-riders.mjs):
// the turn stamp, offers and their hints, the card button and its roll, the auto mode with its Undo,
// the per-swing Damage button when pentaryn-aoe's auto-damage is off, the card re-renders, Reckless
// on/off, and the GM report. Cards are rendered through dnd5e.renderChatMessage as dnd5e does;
// their HTML is pinned (golden/riders-*.json).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeCombat, makeEffect, makeMessage, makeToken, setupWorld, setTurn } from "./fixtures/world.mjs";
import { barbarian, fighter, rogue, slayer, wolf } from "./fixtures/actors.mjs";
import * as legacy from "./fixtures/legacy-combat.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld({ aoe: true, aoeAutoDamage: false });
const { F, doc } = W;
const lines = captureConsole();

const rog = rogue();
const fig = fighter();
const brb = barbarian();
const sly = slayer();
const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
const rtok = makeToken(rog, { id: "tokRogue00000001", x: 0 });
const gtok = makeToken(gob, { id: "tokGoblin0000001", x: 1, disposition: -1 });
const ftok = makeToken(fig, { id: "tokFighter000001", x: 2 });
const btok = makeToken(brb, { id: "tokBarbarian0001", x: 8 });
ftok.center = { x: 250, y: 1050 };   // the fighter starts far from the goblin
const combat = makeCombat({ id: "c1", entries: [
  { id: "cb1", actor: rog, token: rtok }, { id: "cb2", actor: gob, token: gtok }, { id: "cb3", actor: brb, token: btok },
] });

await import("../combat.mjs");
const riders = await import("../turn-riders.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
mock.timers.tick(0);
await drain();
F.calls.length = 0;
lines.length = 0;

const act = (actor, itemId) => [...actor.items.get(itemId).system.activities.values()][0];
const KEY = () => `c1:${combat.round}:${combat.combatant.id}`;
let seqId = 0;
function attackCard(actor, itemId, { mode = null, adv = false, dis = false, crit = false, stamp = KEY(), targets = [gtok], origin = "usageCard000001", swing = false, author = F.game.user, ammunition = null } = {}) {
  const a = act(actor, itemId);
  return makeMessage({
    id: `atk${String(++seqId).padStart(13, "0")}`, type: "attack", author,
    system: { activity: { uuid: a.uuid, type: "attack" }, targets: targets.map(t => ({ token: t.document.uuid, uuid: t.actor.uuid })), mode, origin: { id: origin }, ammunition },
    _source: { system: { origin, targets: targets.map(t => ({ token: t.document.uuid })) } },
    flags: { [MODULE]: { ...(stamp ? { turnKey: stamp } : {}), ...(swing ? { swing: { i: 1, n: 2, kind: "main" } } : {}) } },
    rolls: [{ isCritical: crit, hasAdvantage: adv, hasDisadvantage: dis, options: { attackMode: mode } }],
    speaker: { actor: actor.id },
  });
}
function card() {
  const li = doc.createElement("li");
  li.className = "chat-message";
  const content = doc.createElement("div");
  content.className = "message-content";
  content.innerHTML = `<section class="icon-row">x</section><div class="card-buttons"></div>`;
  li.append(content);
  doc.body.append(li);
  return li;
}
const render = (message) => {
  const html = card();
  html.dataset.messageId = message.id;
  F.Hooks.callAll("dnd5e.renderChatMessage", message, html);
  return html;
};
const reset = (...actors) => { for (const a of actors) delete a.flags[MODULE]; };
const notes = () => F.calls.filter(c => c.op === "notify").map(c => c.message);

test("the turn stamp: every attack roll's message carries the turn it was made in", () => {
  const msg = { data: {} };
  F.Hooks.call("dnd5e.preRollAttackV2", { subject: act(rog, "scimitar00000001") }, {}, msg);
  assert.equal(msg.data.flags[MODULE].turnKey, "c1:1:cb1");
  const none = { data: {} };
  F.Hooks.call("dnd5e.preRollAttackV2", { subject: { type: "attack" } }, {}, none);
  assert.deepEqual(none, { data: {} }, "no actor: no stamp");
  F.calls.length = 0;
});

test("offersFor: Sneak Attack's eligibility per roll, weapon and ally (golden/riders-offers.json)", () => {
  const rows = [];
  const row = (label, msg) => {
    const { actor, offers, turn } = riders.offersFor(msg);
    rows.push({ label, actor: actor?.name ?? null, turnKey: turn?.key ?? null, offers: offers.map(o => ({ key: o.rider.key, activity: o.activity?.id ?? null, dice: o.dice, state: o.state ?? null, offer: o.offer, auto: o.auto, checks: o.checks })) });
  };
  row("advantage", attackCard(rog, "scimitar00000001", { adv: true }));
  row("no advantage, no ally", attackCard(rog, "scimitar00000001"));
  row("an ally beside the target", (() => { ftok.center = { x: 250, y: 50 }; return attackCard(rog, "scimitar00000001"); })());
  row("ally, but disadvantage", attackCard(rog, "scimitar00000001", { dis: true }));
  row("two targets: ally unknown", attackCard(rog, "scimitar00000001", { targets: [gtok, ftok] }));
  rog.flags[MODULE] = { turn: { key: "c1:1:cb1", riders: { "sneak-attack": "used" } } };
  row("already used this turn", attackCard(rog, "scimitar00000001", { adv: true }));
  reset(rog);
  row("a fighter: no riders", attackCard(fig, "longsword0000001", { adv: true }));
  row("a barbarian, raging? no; reckless? no", attackCard(brb, "greataxe00000001"));
  row("a slayer: Divine Strike and Colossus Slayer", attackCard(sly, "glaive0000000001"));
  row("not an attack message's activity", makeMessage({ type: "attack", system: { activity: { uuid: "Actor.none.Item.none.Activity.none" } } }));
  row("activity as a uuid string", makeMessage({ type: "attack", system: { activity: act(rog, "scimitar00000001").uuid }, rolls: [{ hasAdvantage: true }] }));
  pinJSON("riders-offers", rows, import.meta.url);
  assert.equal(rows[0].offers[0].auto, true);
  assert.equal(rows[1].offers[0].auto, false);
  ftok.center = { x: 250, y: 50 + 1000 };
});

test("the card button: who sees it, what it says, and when it goes (golden/riders-card.json)", async () => {
  const out = {};
  out.offer = render(attackCard(rog, "scimitar00000001", { adv: true })).innerHTML;
  out.noStamp = render(attackCard(rog, "scimitar00000001", { adv: true, stamp: null })).innerHTML;
  out.staleStamp = render(attackCard(rog, "scimitar00000001", { adv: true, stamp: "c1:0:cb1" })).innerHTML;
  out.damageCard = render(makeMessage({ type: "damage", system: {} })).innerHTML;
  await F.game.settings.set(MODULE, "riderOffers", false);
  out.settingOff = render(attackCard(rog, "scimitar00000001", { adv: true })).innerHTML;
  await F.game.settings.set(MODULE, "riderOffers", true);
  // auto mode hides the button for an auto-eligible swing, not for an ask-only one
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "auto");
  out.autoEligible = render(attackCard(rog, "scimitar00000001", { adv: true })).innerHTML;
  out.autoNotEligible = render(attackCard(rog, "scimitar00000001")).innerHTML;
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "ask");
  // a player who neither owns the actor nor wrote the card sees nothing
  F.become({ userId: "player0000000001" });
  rog.isOwner = false;
  out.stranger = render(attackCard(rog, "scimitar00000001", { adv: true, author: F.game.users.get("gmUser0000000001") })).innerHTML;
  out.authorNotOwner = render(attackCard(rog, "scimitar00000001", { adv: true, author: F.game.users.get("player0000000001") })).innerHTML;
  rog.isOwner = true;
  F.become({ userId: "gmUser0000000001" });
  // a second render replaces the row, never doubles it
  const msg = attackCard(rog, "scimitar00000001", { adv: true });
  const html = render(msg);
  F.Hooks.callAll("dnd5e.renderChatMessage", msg, html);
  out.rerendered = html.querySelectorAll(".pentaryn-combat-riders").length;
  // no .message-content: the row goes on the element itself
  const bare = doc.createElement("div");
  F.Hooks.callAll("dnd5e.renderChatMessage", attackCard(rog, "scimitar00000001", { adv: true }), bare);
  out.bare = bare.innerHTML;
  pinJSON("riders-card", out, import.meta.url);
  assert.equal(out.rerendered, 1);
  assert.match(out.offer, /pentaryn-combat-rider/);
  assert.doesNotMatch(out.noStamp, /pentaryn-combat-rider/);
});

test("the hint is worked out again as the pointer arrives (an ally who stepped in since)", async () => {
  const msg = attackCard(rog, "scimitar00000001");
  const html = render(msg);
  const b = html.querySelector(".pentaryn-combat-rider");
  const before = b.dataset.tooltip;
  ftok.center = { x: 250, y: 50 };
  await b.fire("pointerenter");
  const after = b.dataset.tooltip;
  ftok.center = { x: 250, y: 1050 };
  pinJSON("riders-hint", { before, after }, import.meta.url);
  assert.notEqual(before, after);
});

test("rollRider: the feature's damage with the swing's crit, narrowed type, the swing's targets, threaded under the card", async () => {
  reset(rog);
  const msg = attackCard(rog, "scimitar00000001", { adv: true, crit: true });
  const html = render(msg);
  F.calls.length = 0;
  await html.querySelector(".pentaryn-combat-rider").fire("click");
  await drain();
  const roll = F.calls.filter(c => ["activity.rollDamage", "damage.parts"].includes(c.op));
  pinJSON("riders-roll", { roll, turn: rog.flags[MODULE].turn.riders }, import.meta.url);
  assert.equal(rog.flags[MODULE].turn.riders["sneak-attack"], "used");
  F.calls.length = 0;
  assert.equal(await riders.rollRider(msg, "sneak-attack"), null);
  assert.deepEqual(notes(), [F.game.i18n.format("PENTARYN_COMBAT.Rider.Used", { name: "Sneak Attack" })]);
  F.calls.length = 0;
  setTurn(combat, { round: 2 });
  assert.equal(await riders.rollRider(msg, "sneak-attack"), null, "an earlier turn's card");
  assert.deepEqual(notes(), [F.game.i18n.localize("PENTARYN_COMBAT.Rider.Stale")]);
  setTurn(combat, { round: 1 });
  F.calls.length = 0;
  assert.equal(await riders.rollRider(msg, "nope"), null, "unknown rider");
  assert.equal(await riders.rollRider(attackCard(fig, "longsword0000001"), "sneak-attack"), null, "no rider activity on the fighter");
  rog.isOwner = false;
  assert.equal(await riders.rollRider(msg, "frenzy"), null, "not the owner");
  rog.isOwner = true;
  assert.deepEqual(F.calls, [{ op: "notify", level: "info", message: F.game.i18n.localize("PENTARYN_COMBAT.Rider.Stale") }],
    "only the fighter's card (he is not in this combat, so its stamp is another turn's)");
  reset(rog);
});

test("rollRider: two quick clicks are one roll; a cancelled roll spends nothing", async () => {
  reset(rog);
  const msg = attackCard(rog, "scimitar00000001", { adv: true });
  const sneak = rog.items.get("sneakAttack00001").system.activities.get("sneakDmg00000001");
  let release;
  sneak.script.damage.push(() => new Promise(r => { release = r; }));
  const first = riders.rollRider(msg, "sneak-attack");
  await drain();
  F.calls.length = 0;
  assert.equal(await riders.rollRider(msg, "sneak-attack"), null);
  assert.deepEqual(notes(), [F.game.i18n.format("PENTARYN_COMBAT.Rider.Used", { name: "Sneak Attack" })]);
  release(null);
  assert.equal(await first, null);
  assert.equal(rog.flags[MODULE]?.turn, undefined, "cancelled: not marked used");
  F.calls.length = 0;
});

test("narrowing: only our own rider rolls get the type and the tidied dice count", () => {
  const ours = { [MODULE]: { rider: "frenzy", narrow: "slashing" }, rolls: [{ parts: ["(@scale.barbarian.rage-damage)d6"], data: { scale: { barbarian: { "rage-damage": 2 } } } }, { parts: "x" }] };
  F.Hooks.call("dnd5e.preRollDamageV2", ours, {}, { data: {} });
  const plain = { rolls: [{ parts: ["(@scale.barbarian.rage-damage)d6"], data: {} }] };
  F.Hooks.call("dnd5e.preRollDamageV2", plain, {}, { data: {} });
  const noType = { [MODULE]: { rider: "frenzy", narrow: null }, rolls: [{ parts: ["(@x)d6"], data: { x: "a" } }] };
  F.Hooks.call("dnd5e.preRollDamageV2", noType, {}, { data: {} });
  pinJSON("riders-narrow", { ours: ours.rolls, plain: plain.rolls, noType: noType.rolls }, import.meta.url);
  assert.deepEqual(ours.rolls[0].parts, ["2d6"]);
  assert.deepEqual(ours.rolls[0].options, { type: "slashing", types: ["slashing"] });
  F.calls.length = 0;
});

test("auto mode: the dice go into the weapon's damage roll once per turn, with a 4 s guard (golden/riders-auto.json)", async () => {
  reset(rog);
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "auto");
  const msg = attackCard(rog, "scimitar00000001", { adv: true, origin: "usageCardAuto01" });
  const a = act(rog, "scimitar00000001");
  const config = { subject: a, rolls: [{ parts: ["1d6", "@mod"], data: {} }] };
  const message = { data: { system: { origin: "usageCardAuto01" } } };
  const applied = riders.autoRiders(config, message);
  await drain();
  const out = { applied, parts: [...config.rolls[0].parts], flags: message.data.flags, turn: rog.flags[MODULE].turn.riders };
  // the next swing's damage before the flag lands: the guard holds
  const again = { subject: a, rolls: [{ parts: ["1d6"], data: {} }] };
  out.guarded = riders.autoRiders(again, { data: {} });
  mock.timers.tick(4000);
  out.afterGuardButUsed = riders.autoRiders({ subject: a, rolls: [{ parts: ["1d6"], data: {} }] }, { data: {} });
  // not a weapon, not the owner, setting off, no attack message
  out.notWeapon = riders.autoRiders({ subject: { ...a, item: { type: "feat" }, actor: rog, type: "attack" }, rolls: [{ parts: [] }] }, {});
  rog.isOwner = false;
  out.notOwner = riders.autoRiders({ subject: a, rolls: [{ parts: [] }] }, {});
  rog.isOwner = true;
  await F.game.settings.set(MODULE, "riderOffers", false);
  out.settingOff = riders.autoRiders({ subject: a, rolls: [{ parts: [] }] }, {});
  await F.game.settings.set(MODULE, "riderOffers", true);
  out.noRolls = riders.autoRiders({ subject: a }, {});
  pinJSON("riders-auto", out, import.meta.url);
  assert.equal(out.applied.length, 1);
  assert.deepEqual(out.guarded, []);
  await F.game.user.setFlag(MODULE, "riders.sneak-attack", "ask");
  reset(rog);
  F.calls.length = 0;
});

test("attackMessageFor: the same usage card's attack, else the latest of that activity (last 15 messages)", () => {
  const a = act(rog, "scimitar00000001");
  const m1 = attackCard(rog, "scimitar00000001", { origin: "cardA" });
  const m2 = attackCard(rog, "scimitar00000001", { origin: "cardB" });
  assert.equal(riders.attackMessageFor(a, { data: { system: { origin: "cardA" } } }).id, m1.id);
  assert.equal(riders.attackMessageFor(a, { data: {} }).id, m2.id);
  assert.equal(riders.attackMessageFor(act(sly, "glaive0000000001"), {}), null);
  for (let i = 0; i < 15; i++) makeMessage({ type: "base" });
  assert.equal(riders.attackMessageFor(a, {}), null, "older than the last 15 messages");
});

test("the auto note on the damage card: + Sneak Attack 3d6 · Undo; Undo gives the use back and strikes it through (golden/riders-note.json)", async () => {
  reset(rog);
  const atk = attackCard(rog, "scimitar00000001", { adv: true });
  rog.flags[MODULE] = { turn: { key: "c1:1:cb1", riders: { "sneak-attack": `auto:${atk.id}` } } };
  const dmg = makeMessage({ type: "damage", speaker: { actor: rog.id }, flags: { [MODULE]: { auto: [{ key: "sneak-attack", dice: "3d6", attack: atk.id }] } },
    rolls: [{ total: 19, dice: [{ number: 1, faces: 6, total: 4 }, { number: 3, faces: 6, total: 12 }] }], author: F.game.user });
  const out = {};
  let html = render(dmg);
  out.live = html.querySelector(".pentaryn-combat-auto").outerHTML;
  out.position = html.querySelector(".message-content").children.map(c => c.className);
  F.calls.length = 0;
  await html.querySelector(".pentaryn-combat-auto").fire("click", { target: html.querySelector("[data-undo]") });
  await drain();
  out.afterUndo = structuredClone({ turn: rog.flags[MODULE].turn.riders, undone: dmg.flags[MODULE].undone, notes: notes() });
  html = render(dmg);
  out.undone = html.querySelector(".pentaryn-combat-auto").outerHTML;
  // a stale Undo (the rider was re-spent on another card) says so and changes nothing
  rog.flags[MODULE].turn.riders["sneak-attack"] = "auto:someOtherCard";
  const dmg2 = makeMessage({ type: "damage", speaker: { actor: rog.id }, flags: { [MODULE]: { auto: [{ key: "sneak-attack", dice: "3d6", attack: atk.id }] } }, rolls: [], author: F.game.user });
  html = render(dmg2);
  out.notLive = html.querySelector(".pentaryn-combat-auto").outerHTML;
  F.calls.length = 0;
  const fake = doc.createElement("button");
  fake.dataset.undo = "sneak-attack";
  html.querySelector(".pentaryn-combat-auto").append(fake);
  await html.querySelector(".pentaryn-combat-auto").fire("click", { target: fake });
  out.staleNotes = notes();
  // undone with no dice to find: the plain text
  const dmg3 = makeMessage({ type: "damage", speaker: { actor: rog.id }, flags: { [MODULE]: { auto: [{ key: "sneak-attack", dice: "3d6", attack: atk.id }], undone: ["sneak-attack"] } }, rolls: [] });
  out.undonePlain = render(dmg3).querySelector(".pentaryn-combat-auto").outerHTML;
  // a non-damage card or no auto flag: nothing
  out.attackType = render(makeMessage({ type: "attack", flags: { [MODULE]: { auto: [{ key: "x" }] } } })).querySelector(".pentaryn-combat-auto");
  pinJSON("riders-note", out, import.meta.url);
  const oracle = legacy.autoNoteParts({ auto: [{ key: "sneak-attack", dice: "3d6", attack: atk.id }], turn: { riders: { "sneak-attack": `auto:${atk.id}` } }, undone: [], rolls: [], isOwner: true, isGM: true, T: (k, d) => (d ? F.game.i18n.format(k, d) : F.game.i18n.localize(k)) });
  assert.equal(out.live.includes(oracle[0]), true, "the oracle builds the same live piece");
  reset(rog);
  F.calls.length = 0;
});

test("the per-swing Damage button: only with aoe's auto-damage off, on a sequence swing's card, for the owner", async () => {
  const out = {};
  const msg = attackCard(rog, "scimitar00000001", { swing: true, crit: true, mode: "offhand", ammunition: null });
  let html = render(msg);
  out.button = html.querySelector(".pentaryn-combat-damage")?.outerHTML ?? null;
  F.calls.length = 0;
  await html.querySelector(".pentaryn-combat-damage button").fire("click");
  out.roll = F.calls.filter(c => c.op === "activity.rollDamage");
  out.notASwing = render(attackCard(rog, "scimitar00000001")).querySelector(".pentaryn-combat-damage");
  await F.game.settings.set("pentaryn-aoe", "autoDamageOnHit", true);
  out.aoeOn = render(attackCard(rog, "scimitar00000001", { swing: true })).querySelector(".pentaryn-combat-damage");
  await F.game.settings.set("pentaryn-aoe", "autoDamageOnHit", false);
  F.game.modules.get("pentaryn-aoe").active = false;
  out.aoeInactive = !!render(attackCard(rog, "scimitar00000001", { swing: true })).querySelector(".pentaryn-combat-damage");
  F.game.modules.get("pentaryn-aoe").active = true;
  rog.isOwner = false;
  out.notOwner = render(attackCard(rog, "scimitar00000001", { swing: true })).querySelector(".pentaryn-combat-damage");
  rog.isOwner = true;
  pinJSON("riders-swing-damage", out, import.meta.url);
  assert.ok(out.button);
  assert.equal(out.aoeOn, null);
  F.calls.length = 0;
});

test("card re-renders: a turn-flag change re-renders this turn's attack cards and cards still showing a button (50 ms, batched)", async () => {
  for (const m of [...F.game.messages.contents]) F.game.messages.delete(m.id);
  for (const el of doc.body.querySelectorAll(".chat-message")) el.remove();
  reset(rog);
  const current = attackCard(rog, "scimitar00000001", { adv: true });
  const old = attackCard(rog, "scimitar00000001", { adv: true, stamp: "c1:0:cb1" });
  const oldShowing = attackCard(rog, "scimitar00000001", { adv: true, stamp: "c1:0:cb1" });
  const oldHtml = card();
  oldHtml.dataset.messageId = oldShowing.id;
  oldHtml.querySelector(".message-content").innerHTML += `<div class="pentaryn-combat-riders"></div>`;
  const autoCard = makeMessage({ type: "damage", speaker: { actor: rog.id }, flags: { [MODULE]: { auto: [{ key: "sneak-attack" }] } } });
  const someoneElse = attackCard(fig, "longsword0000001");
  F.calls.length = 0;
  await rog.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1" } });
  await rog.update({ [`flags.${MODULE}.-=turn`]: null });
  mock.timers.tick(49);
  assert.deepEqual(F.calls.filter(c => c.op === "chat.updateMessage"), []);
  mock.timers.tick(1);
  const updated = F.calls.filter(c => c.op === "chat.updateMessage").map(c => c.id);
  assert.deepEqual(updated, [current.id, oldShowing.id, autoCard.id]);
  void old; void someoneElse;
  // Reckless on/off re-renders too; another effect does not
  F.calls.length = 0;
  F.Hooks.callAll("createActiveEffect", { name: "Reckless", parent: rog });
  F.Hooks.callAll("createActiveEffect", { name: "Blessed", parent: rog });
  F.Hooks.callAll("deleteActiveEffect", { name: "Reckless Attack", parent: { documentName: "Item" } });
  mock.timers.tick(50);
  assert.deepEqual(F.calls.filter(c => c.op === "chat.updateMessage").map(c => c.id), [current.id, oldShowing.id, autoCard.id]);
  // a turn change / combat end re-renders every card on this client still showing a button or an Undo
  F.calls.length = 0;
  F.Hooks.callAll("combatTurnChange", combat, {}, {});
  F.Hooks.callAll("deleteCombat", { id: "gone", combatants: [] });
  mock.timers.tick(50);
  pinJSON("riders-rerender", F.calls.filter(c => c.op === "chat.updateMessage").map(c => c.id === oldShowing.id ? "oldShowing" : c.id), import.meta.url);
  F.calls.length = 0;
  F.ui.chat.updateMessage = () => { throw new Error("popped out"); };
  await rog.update({ [`flags.${MODULE}.turn`]: { key: "c1:1:cb1" } });
  mock.timers.tick(50);
  F.Hooks.callAll("combatTurnChange", combat, {}, {});
  mock.timers.tick(50);
  F.ui.chat.updateMessage = m => F.calls.push({ op: "chat.updateMessage", id: m?.id ?? null });
  assert.deepEqual(lines.splice(0), [], "a popped-out chat log's throw is swallowed");
  reset(rog);
});

test("setReckless: on copies the item's stock effect with Advantage on Strength attacks; off deletes; owner only", async () => {
  F.calls.length = 0;
  assert.equal(riders.isReckless(brb), false);
  assert.equal(await riders.setReckless(brb, true), true);
  const created = F.calls.find(c => c.op === "createEmbedded");
  assert.equal(riders.isReckless(brb), true);
  assert.equal(await riders.setReckless(brb, true), true, "already on: nothing new");
  assert.equal(F.calls.filter(c => c.op === "createEmbedded").length, 1);
  assert.equal(await riders.setReckless(brb, false), false);
  const deleted = F.calls.find(c => c.op === "deleteEmbedded");
  assert.equal(riders.isReckless(brb), false);
  assert.equal(await riders.setReckless(brb, false), false, "already off");
  brb.items.get("recklessAttack01").effects.clear();
  F.calls.length = 0;
  await riders.setReckless(brb, true);
  const fallback = F.calls.find(c => c.op === "createEmbedded");
  await riders.setReckless(brb, false);
  brb.isOwner = false;
  assert.equal(await riders.setReckless(brb, true), false, "not the owner: reports, changes nothing");
  brb.isOwner = true;
  assert.equal(riders.isReckless(null), false);
  pinJSON("riders-reckless", { created, deleted, fallback }, import.meta.url);
  F.calls.length = 0;
});

test("riderActivity / riderDiceFor / report (golden/riders-report.json)", async () => {
  const core = await import("../combat-core.mjs");
  assert.equal(riders.riderActivity(rog, core.riderByKey("sneak-attack")).id, "sneakDmg00000001");
  assert.equal(riders.riderActivity(fig, core.riderByKey("sneak-attack")), null);
  assert.equal(riders.riderDiceFor(rog, core.riderByKey("sneak-attack")), "3d6");
  assert.equal(riders.riderDiceFor(brb, core.riderByKey("frenzy")), "2d6");
  assert.equal(riders.riderDiceFor(sly, core.riderByKey("divine-strike")), "1d8");
  assert.equal(riders.riderDiceFor(null, core.riderByKey("sneak-attack")), "");
  rog.flags[MODULE] = { turn: { key: "c1:1:cb1" }, last: { weapon: "scimitar00000001" } };
  lines.length = 0;
  const all = riders.report();
  const one = riders.report("Rogue");
  const byDoc = riders.report(brb);
  const none = riders.report("Nobody");
  pinJSON("riders-report", { all, one, byDoc, none, console: lines.splice(0) }, import.meta.url);
  reset(rog);
});

test("EC-5: a Frenzy with no Rage Damage bonus is no rider — no button, no auto dice, no spend", async () => {
  reset(brb);
  const scale = brb.system.scale;
  brb.system.scale = {};
  const core = await import("../combat-core.mjs");
  const rage = makeEffect(brb, { id: "rageOn0000000002", name: "Rage" });
  brb.effects.set(rage.id, rage);
  await riders.setReckless(brb, true);
  try {
    const frenzy = core.riderByKey("frenzy");
    assert.equal(riders.riderDiceFor(brb, frenzy), "");
    const msg = attackCard(brb, "greataxe00000001", { adv: true, origin: "usageCardFrz001" });
    msg.system.ability = "str";
    assert.deepEqual(riders.offersFor(msg).offers.filter(o => o.rider.key === "frenzy"), [], "not offered");
    assert.equal(render(msg).querySelector(".pentaryn-combat-rider"), null, "no + Frenzy button");
    await F.game.user.setFlag(MODULE, "riders.frenzy", "auto");
    const config = { subject: act(brb, "greataxe00000001"), rolls: [{ parts: ["1d12", "@mod"], data: {} }] };
    assert.deepEqual(riders.autoRiders(config, { data: { system: { origin: "usageCardFrz001" } } }), []);
    assert.deepEqual(config.rolls[0].parts, ["1d12", "@mod"], "no 0d6 added");
    await F.game.user.setFlag(MODULE, "riders.frenzy", "ask");
    F.calls.length = 0;
    assert.equal(await riders.rollRider(msg, "frenzy"), null);
    assert.equal(F.calls.find(c => c.op === "activity.rollDamage"), undefined, "nothing rolled");
    assert.equal(brb.flags[MODULE]?.turn?.riders?.frenzy, undefined, "Frenzy not spent");
    brb.system.scale = scale;
    assert.equal(riders.offersFor(msg).offers.find(o => o.rider.key === "frenzy")?.dice, "2d6", "with the bonus: offered");
  } finally {
    brb.system.scale = scale;
    await riders.setReckless(brb, false);
    brb.effects.delete(rage.id);
    reset(brb);
    F.calls.length = 0;
  }
});

test("forced failures: each card hook is guarded on its own (golden/riders-console.json)", () => {
  lines.length = 0;
  const boom = () => { throw new Error("boom"); };
  F.Hooks.call("dnd5e.preRollDamageV2", { get [MODULE]() { return boom(); }, get subject() { return boom(); } }, {}, {});
  const msg = { get type() { return boom(); }, getFlag: boom };
  const html = card();
  F.Hooks.callAll("dnd5e.renderChatMessage", msg, html);
  pinJSON("riders-console", lines.splice(0), import.meta.url);
  assert.deepEqual(F.hookErrors, []);
});
