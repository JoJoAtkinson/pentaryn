// Glue: install the Foundry stub, load the entry exactly as Foundry would, fire the lifecycle,
// and pin EFFECTS (hooks registered, calls made, console text) — not return values.
//
// The client under test is the ACTIVE GM ("Claude", the headless bot). Timers are mocked:
// claimMessage's 750 ms settle is ticked, never waited for.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, populate, world } from "./fixtures/actors.mjs";
import { dispatch, root } from "./fixtures/dom.mjs";
import { CARD_FLAG, CLAIM_KEY, COMBAT_SCOPE, HOOKS, MODULE, NS } from "../reactions-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });
const F = await installFoundry(world(MODULE));
const W = populate(F);
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);

await import("../reactions.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const hooksAtReady = F.hooks.slice();
const api = game.modules.get(MODULE).api;

/* ── helpers ───────────────────────────────────────────────────────────────────────────────── */

const flush = async (n = 4) => { for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r)); };
/** Let the offer run: the claim's settle (750 ms) and the awaited writes after it. */
async function settle() {
  for (let t = 0; t < 800; t += 50) { await flush(); mock.timers.tick(50); }
  await flush();
}
const creates = () => F.calls.filter(c => c.op === "create" && c.documentName === "ChatMessage");
const cards = () => game.messages.contents.filter(m => m.flags?.[MODULE]?.[CARD_FLAG]);
const cardOf = m => m.flags[MODULE][CARD_FLAG];
const reset = () => { F.calls.length = 0; consoleLines.length = 0; };
/** Wipe the chat log and the module's open-card index (a fresh combat round, as it were). */
function clearChat() {
  for (const m of [...game.messages.contents]) game.messages.delete(m.id);
  game.modules.get(MODULE).api.uninstall();          // the LIVE api: each re-import publishes a new one
  return import(`../reactions.mjs?reload=${Date.now()}`);
}
const asGM = () => F.become({ userId: IDS.gm });

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") {
    assert.equal(F.utilsSource, "foundry", "set FOUNDRY_APP_ROOT to the app's resources/app, or PENTARYN_TEST_SHIMS=1");
  }
});

test("published at ready: module.api is canonical, game.pentaryn alias, both ready hooks", () => {
  assert.ok(api, "module.api not set");
  assert.equal(game.pentaryn[NS], api);
  assert.equal(api.contract, `${MODULE}/api@1`);
  assert.ok(Object.isFrozen(api));
  const emitted = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(emitted.includes(`${MODULE}.ready`) && emitted.includes("pentaryn.ready"));
  assert.deepEqual(game.pentaryn.namespaces(), [NS]);
  assert.equal(game.users.activeGM.id, IDS.gm, "Claude is the active GM (lowest id among GMs)");
});

/* ── the triggers ──────────────────────────────────────────────────────────────────────────── */

test("a hit on Marrith: one card whispered to her owner, Shield offered, claim on the attack card (golden/card-hit.json)", async () => {
  reset();
  const seen = [];
  const id = Hooks.on(HOOKS.offered.name, (message, card) => seen.push([message?.id ?? null, card.options.map(o => o.name)]));
  const attack = W.attack({ id: "attackBite000001", total: 18 });
  await settle();
  Hooks.off(HOOKS.offered.name, id);
  const made = creates();
  assert.equal(made.length, 1);
  const data = made[0].data;
  assert.deepEqual(data.whisper, [IDS.playerP]);
  assert.equal(data.speaker.actor, IDS.marrith);
  assert.match(data.content, /Grick hits Marrith with Bite \(18 vs AC 16\)\./);
  assert.match(data.content, /data-prea-use="Actor\.marrith000000001\.Item\.itemshield000001\.Activity\./);
  assert.doesNotMatch(data.content, /Counterspell|Absorb/);
  assert.equal(attack.flags[MODULE].claims[CLAIM_KEY], game.socket.id, "this tab claimed the attack card");
  assert.deepEqual(seen, [[cards()[0].id, ["Shield"]]]);
  pinJSON("card-hit", { data, card: cardOf(cards()[0]) }, import.meta.url);
});

test("the attacker's flow never waits: nothing is written to the attack card before the claim, and only the claim after", async () => {
  await clearChat();
  reset();
  const attack = W.attack({ total: 18 });
  const writes = () => F.calls.filter(c => c.op === "update" && c.uuid === attack.uuid).map(c => Object.keys(c.changes));
  await flush();
  assert.deepEqual(writes(), [[`flags.${MODULE}.claims.${CLAIM_KEY}`]]);
  await settle();
  assert.deepEqual(writes(), [[`flags.${MODULE}.claims.${CLAIM_KEY}`]], "the card is a new message, the attack card is untouched");
  assert.equal(cards().length, 1);
});

test("a miss, an unknown AC, a monster target, or the attacker itself: no card and no claim written", async () => {
  await clearChat();
  reset();
  const miss = W.attack({ total: 15 });
  const unknown = W.message({ type: "attack", speaker: { actor: IDS.grick, token: IDS.tokGrick, alias: "Grick" }, author: IDS.gmJoe,
    system: { targets: [{ actor: W.marrith.uuid, token: W.tokenOf(IDS.marrith).uuid, name: "Marrith", ac: null }], item: { name: "Bite" } },
    rolls: [{ total: 25 }] }, { hook: true });
  const monster = W.attack({ attacker: IDS.marrith, targets: [IDS.grick], total: 25, weapon: "Dagger" });
  const self = W.attack({ attacker: IDS.marrith, targets: [IDS.marrith], total: 25, weapon: "Dagger" });
  await settle();
  assert.equal(cards().length, 0);
  assert.deepEqual(F.calls.filter(c => c.op === "update"), [], "no claim, no write at all");
  for (const m of [miss, unknown, monster, self]) assert.equal(m.flags[MODULE], undefined);
});

test("fire damage on Marrith: Absorb Elements offered; piercing alone offers nothing (no card)", async () => {
  await clearChat();
  reset();
  W.damage({ rolls: [{ total: 9, type: "fire" }] });
  await settle();
  assert.equal(cards().length, 1);
  const card = cardOf(cards()[0]);
  assert.deepEqual(card.options.map(o => o.name), ["Absorb Elements"]);
  assert.match(cards()[0].content, /Grick deals 9 fire damage to Marrith with Bite\./);
  await clearChat();
  reset();
  W.damage({ rolls: [{ total: 9, type: "piercing" }] });
  W.damage({ rolls: [{ total: 9, type: "healing" }] });
  await settle();
  assert.equal(cards().length, 0);
});

test("a multiattack coalesces: the attack and its damage, then a second swing, update the one card in place", async () => {
  await clearChat();
  reset();
  W.attack({ id: "swingOne00000001", total: 18 });
  await settle();
  W.damage({ id: "swingOneDmg00001", rolls: [{ total: 9, type: "fire" }] });
  await settle();
  W.attack({ id: "swingTwo00000001", total: 21, weapon: "Tentacles" });
  await settle();
  assert.equal(creates().length, 1, "one message");
  const [m] = cards();
  const card = cardOf(m);
  assert.deepEqual(card.swings.map(s => [s.message, s.kind, s.attack]), [["swingOne00000001", "hit", "Bite"], ["swingOneDmg00001", "damage", "Bite"], ["swingTwo00000001", "hit", "Tentacles"]]);
  assert.deepEqual(card.options.map(o => o.name), ["Shield", "Absorb Elements"]);
  assert.match(m.content, /Grick hits Marrith with Tentacles \(21 vs AC 16\)\./);
  const updates = F.calls.filter(c => c.op === "update" && c.uuid === m.uuid);
  assert.equal(updates.length, 2, "two in-place updates");
  // the same message again (a replayed hook) changes nothing
  reset();
  F.Hooks.callAll("createChatMessage", game.messages.get("swingTwo00000001"), {}, IDS.gmJoe);
  await settle();
  assert.deepEqual(F.calls.filter(c => c.op === "update" || c.op === "create"), []);
});

test("the attack and its damage land tens of ms apart (pentaryn-aoe's damage on hit): still one card, the writes run in series", async () => {
  await clearChat();
  reset();
  W.attack({ id: "raceSwing0000001", total: 18 });
  W.damage({ id: "raceSwingDmg0001", rolls: [{ total: 9, type: "fire" }] });   // no settle between: both claims are in flight
  await settle();
  assert.equal(creates().length, 1, "one message, not two");
  assert.equal(F.calls.filter(c => c.op === "updateDocuments").length, 1, "the damage card updated it in place");
  const [m] = cards();
  assert.deepEqual(cardOf(m).swings.map(s => s.message), ["raceSwing0000001", "raceSwingDmg0001"]);
  assert.deepEqual(cardOf(m).options.map(o => o.name), ["Shield", "Absorb Elements"]);
});

test("the next attacker turn is a new card; so is another attacker in the same turn", async () => {
  await clearChat();
  reset();
  W.attack({ id: "turnA00000000001", total: 18 });
  await settle();
  W.combat.turn = 1;
  W.attack({ id: "turnB00000000001", total: 18 });
  await settle();
  W.attack({ id: "turnBgruk0000001", attacker: IDS.gruk, total: 19, weapon: "Claw" });
  await settle();
  W.combat.turn = 0;
  assert.equal(cards().length, 3);
  assert.deepEqual(cards().map(m => cardOf(m).key), [
    `Token.${IDS.tokGrick}|${IDS.combat}:2:0|${W.marrith.uuid}`,
    `Token.${IDS.tokGrick}|${IDS.combat}:2:1|${W.marrith.uuid}`,
    `Token.${IDS.tokGruk}|${IDS.combat}:2:1|${W.marrith.uuid}`,
  ]);
});

test("two PCs hit by one roll: a card each, to each owner; Talo's is suppressed (Cosmic Omen is not a fit)", async () => {
  await clearChat();
  reset();
  W.attack({ total: 25, targets: [IDS.marrith, IDS.talo] });
  await settle();
  assert.deepEqual(cards().map(m => [cardOf(m).pc.name, m.whisper]), [["Marrith", [IDS.playerP]]]);
});

test("a whispered or blind attack roll: the card carries no numbers", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18, whisper: [IDS.gm, IDS.gmJoe] });
  await settle();
  assert.match(cards()[0].content, /Grick hits Marrith with Bite\.<\/p>/);
  assert.doesNotMatch(cards()[0].content, /18/);
});

/* ── the suppressions ──────────────────────────────────────────────────────────────────────── */

test("suppressed: Reaction already spent in this combat (pentaryn-combat's flag)", async () => {
  await clearChat();
  reset();
  W.marrith.flags[COMBAT_SCOPE] = { reaction: { combatId: IDS.combat } };
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 0);
  // a stale flag from another combat is not spent
  W.marrith.flags[COMBAT_SCOPE] = { reaction: { combatId: "combatold0000001" } };
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 1);
  delete W.marrith.flags[COMBAT_SCOPE];
});

test("suppressed: the PC is at 0 HP", async () => {
  await clearChat();
  reset();
  W.marrith.system.attributes.hp.value = 0;
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 0);
  W.marrith.system.attributes.hp.value = 30;
});

test("suppressed: the owner is not connected (Caven's player is offline)", async () => {
  await clearChat();
  reset();
  W.attack({ total: 25, targets: [IDS.caven] });
  await settle();
  assert.equal(cards().length, 0);
  game.users.get(IDS.playerQ).active = true;
  W.attack({ total: 25, targets: [IDS.caven] });
  await settle();
  assert.deepEqual(cards().map(m => m.whisper), [[IDS.playerQ]]);
  game.users.get(IDS.playerQ).active = false;
});

test("suppressed: no slot left for any listed option (dnd5e's own requiresSpellSlot decides that Shield is slot-cast)", async () => {
  await clearChat();
  reset();
  const shield = [...W.marrith.items.get(IDS.shield).system.activities.values()][0];
  assert.equal(shield.requiresSpellSlot, true, "the fixture's activity answers like dnd5e 6.0.6: the live decision path is under test");
  assert.equal(Object.hasOwn(CONFIG.DND5E.spellcasting.spell, "slots"), false, "6.0.6 has no `slots` data key — it is a model getter");
  const slots = W.marrith.system.spells;
  const saved = structuredClone(slots);
  slots.spell1.value = 0;
  slots.spell2.value = 0;
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 0, "Shield needs a 1st-level slot or higher");
  slots.spell2.value = 1;
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 1, "a 2nd-level slot pays for Shield");
  Object.assign(slots, saved);
});

test("an innate levelled spell needs no slot: Talo (no slot table) is offered his racial Absorb Elements on fire damage", async () => {
  await clearChat();
  reset();
  const absorb = [...W.talo.items.get(IDS.taloAbsorb).system.activities.values()][0];
  assert.equal(absorb.requiresSpellSlot, false);
  W.damage({ rolls: [{ total: 9, type: "fire" }], targets: [IDS.talo] });
  await settle();
  assert.deepEqual(cards().map(m => [m.whisper, cardOf(m).options.map(o => o.name)]), [[[IDS.playerT], ["Absorb Elements"]]]);
});

test("a spell activity without dnd5e's getter (a plain record): the method decides — `spell` needs a slot Talo has not, `innate` does not", async () => {
  await clearChat();
  reset();
  const asSpell = W.item(W.talo, { id: "itemtaloshield01", name: "Shield", type: "spell", level: 1, method: "spell", activation: "reaction", plainActivity: true });
  W.attack({ total: 25, targets: [IDS.talo] });
  await settle();
  assert.equal(cards().length, 0, "no slot table at all: Shield is unaffordable");
  W.talo.items.delete(asSpell.id);
  const asInnate = W.item(W.talo, { id: "itemtaloshield02", name: "Shield", type: "spell", level: 1, method: "innate", activation: "reaction", plainActivity: true });
  W.attack({ total: 25, targets: [IDS.talo] });
  await settle();
  assert.deepEqual(cards().map(m => cardOf(m).options.map(o => o.name)), [["Shield"]]);
  W.talo.items.delete(asInnate.id);
});

test("suppressed: a use-limited option with no use left (Talo's Parry) — and offered when one is left", async () => {
  await clearChat();
  reset();
  const parry = { id: "actparrytalo0001", type: "utility", name: "Parry", img: null, activation: { type: "reaction" }, uses: { value: 0, max: 1, spent: 1 },
    get uuid() { return `${this.item.uuid}.Activity.${this.id}`; }, item: null, async use() { F.calls.push({ op: "activity.use", uuid: this.uuid }); } };
  const item = { id: "itemparrytalo001", name: "Maneuver: Parry", type: "feat", img: null, uuid: `${W.talo.uuid}.Item.itemparrytalo001`,
    system: { identifier: "maneuver-parry", uses: { value: 0, max: 0 }, activities: new Map([[parry.id, parry]]) } };
  parry.item = item;
  W.talo.items.set(item.id, item);
  W.attack({ total: 25, targets: [IDS.talo] });
  await settle();
  assert.equal(cards().length, 0);
  parry.uses.value = 1;
  W.attack({ total: 25, targets: [IDS.talo] });
  await settle();
  assert.deepEqual(cards().map(m => [m.whisper, cardOf(m).options.map(o => o.name)]), [[[IDS.playerT], ["Maneuver: Parry"]]], "the button carries the item's name");
  W.talo.items.delete(item.id);
});

/* ── who acts ──────────────────────────────────────────────────────────────────────────────── */

test("a player's client, or the second GM's: nothing (the active GM alone offers)", async () => {
  await clearChat();
  reset();
  F.become({ userId: IDS.playerP });
  W.attack({ total: 18 });
  await settle();
  F.become({ userId: IDS.gmJoe });
  W.attack({ total: 18 });
  await settle();
  asGM();
  assert.equal(cards().length, 0);
  assert.deepEqual(F.calls.filter(c => c.op === "update" || c.op === "create"), []);
});

test("two tabs on the GM account: the tab that lost the claim stands down", async () => {
  await clearChat();
  reset();
  const attack = W.attack({ total: 18, hook: false });
  attack.flags[MODULE] = { claims: { [CLAIM_KEY]: "socket-gm-2" } };   // the other tab got there first
  F.Hooks.callAll("createChatMessage", attack, {}, IDS.gmJoe);
  await settle();
  assert.equal(cards().length, 0);
  assert.deepEqual(F.calls.filter(c => c.op === "update" || c.op === "create"), []);
});

test("the losing tab indexes the winner's card as it arrives, so it can grey it; a card that arrives closed is not indexed", async () => {
  await clearChat();
  reset();
  // the other tab's card lands here through the broadcast createChatMessage; this tab did not write it
  const card = { key: `Token.${IDS.tokGrick}|${IDS.combat}:2:0|${W.marrith.uuid}`, combatId: IDS.combat, attacker: { key: `Token.${IDS.tokGrick}`, name: "Grick", actor: IDS.grick },
    pc: { uuid: W.tokenOf(IDS.marrith).uuid, actorUuid: W.marrith.uuid, name: "Marrith" }, swings: [], options: [], closed: null };
  const theirs = W.message({ id: "theirCard0000001", whisper: [IDS.playerP], author: IDS.gm, flags: { [MODULE]: { [CARD_FLAG]: card } } }, { hook: true });
  const closedOnArrival = W.message({ id: "theirClosed00001", whisper: [IDS.playerP], author: IDS.gm, flags: { [MODULE]: { [CARD_FLAG]: { ...card, closed: "spent" } } } }, { hook: true });
  await settle();
  assert.deepEqual(F.calls.filter(c => c.op === "update" || c.op === "create"), [], "a card is no trigger: nothing offered, nothing claimed");
  // a swing now coalesces onto THEIR card rather than opening a second one
  W.attack({ id: "ontoTheirs000001", total: 18 });
  await settle();
  assert.equal(creates().length, 0);
  assert.deepEqual(cardOf(theirs).swings.map(s => s.message), ["ontoTheirs000001"]);
  // their close (an update from the other tab) drops it from the index: Marrith's turn then writes nothing
  await theirs.update({ [`flags.${MODULE}.${CARD_FLAG}.closed`]: "turn" });
  reset();
  const cb = id2 => [...W.combat.combatants.values()].find(c => c.actorId === id2);
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 0, combatantId: cb(IDS.grick).id }, { round: 2, turn: 1, combatantId: cb(IDS.marrith).id });
  await flush();
  assert.deepEqual(F.calls.filter(c => c.op === "updateDocuments"), [], "nothing open: theirs closed, the other arrived closed");
  assert.equal(cardOf(closedOnArrival).closed, "spent");
});

/* ── greying ───────────────────────────────────────────────────────────────────────────────── */

test("Marrith's turn starts: her open card greys in one batch; Grick's turn again does nothing", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18 });
  await settle();
  const [m] = cards();
  const seen = [];
  const id = Hooks.on(HOOKS.closed.name, (message, card, reason) => seen.push([message.id, reason, card.closed]));
  const cb = id2 => [...W.combat.combatants.values()].find(c => c.actorId === id2);
  reset();
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 0, combatantId: cb(IDS.grick).id }, { round: 2, turn: 1, combatantId: cb(IDS.marrith).id });
  await flush();
  Hooks.off(HOOKS.closed.name, id);
  assert.deepEqual(F.calls.filter(c => c.op === "updateDocuments").length, 1);
  assert.equal(cardOf(m).closed, "turn");
  assert.match(m.content, /prea-closed/);
  assert.match(m.content, /Reaction window passed/);
  assert.match(m.content, /<button[^>]* disabled>/);
  assert.deepEqual(seen, [[m.id, "turn", "turn"]]);
  reset();
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 1, combatantId: cb(IDS.marrith).id }, { round: 2, turn: 2, combatantId: cb(IDS.talo).id });
  await flush();
  assert.deepEqual(F.calls.filter(c => c.op === "updateDocuments"), [], "nothing left open");
});

test("another PC's turn leaves Marrith's card open; a swing after her card closed opens a new one", async () => {
  await clearChat();
  reset();
  W.attack({ id: "openone000000001", total: 18 });
  await settle();
  const cb = id2 => [...W.combat.combatants.values()].find(c => c.actorId === id2);
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 0, combatantId: cb(IDS.grick).id }, { round: 2, turn: 2, combatantId: cb(IDS.talo).id });
  await flush();
  assert.equal(cardOf(cards()[0]).closed, null);
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 2, combatantId: cb(IDS.talo).id }, { round: 2, turn: 1, combatantId: cb(IDS.marrith).id });
  await flush();
  assert.equal(cardOf(cards()[0]).closed, "turn");
  W.attack({ id: "opentwo000000001", total: 18 });     // same attacker turn key, but the card is closed
  await settle();
  assert.equal(cards().length, 2);
  assert.equal(cardOf(cards()[1]).closed, null);
});

test("pentaryn-combat records the Reaction as spent: the card greys as 'spent'; the turn-start clear (null) does not", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18 });
  await settle();
  const [m] = cards();
  await W.marrith.update({ [`flags.${COMBAT_SCOPE}.reaction`]: null });
  await flush();
  assert.equal(cardOf(m).closed, null);
  await W.marrith.update({ [`flags.${COMBAT_SCOPE}.reaction`]: { combatId: IDS.combat } });
  await flush();
  assert.equal(cardOf(m).closed, "spent");
  assert.match(m.content, /Reaction spent/);
  delete W.marrith.flags[COMBAT_SCOPE];
});

test("the combat is deleted: its open cards grey as 'ended'; an out-of-combat card stays", async () => {
  await clearChat();
  reset();
  W.attack({ id: "inCombat00000001", total: 18 });
  await settle();
  const combat = game.combat;
  game.combat = null;
  game.combats.delete(combat.id);
  W.attack({ id: "noCombat00000001", total: 18 });
  await settle();
  assert.equal(cards().length, 2);
  assert.equal(cardOf(cards()[1]).combatId, null);
  F.fire("deleteCombat", combat, {}, IDS.gm);
  await flush();
  assert.deepEqual(cards().map(m => cardOf(m).closed), ["ended", null]);
  game.combats.set(combat.id, combat);
  game.combat = combat;
});

test("a reload (hot re-import) rebuilds the open-card index from the chat log, so greying still works", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18 });
  await settle();
  game.modules.get(MODULE).api.uninstall();
  await import(`../reactions.mjs?reindex=${Date.now()}`);
  const cb = id2 => [...W.combat.combatants.values()].find(c => c.actorId === id2);
  F.fire("combatTurnChange", W.combat, { round: 2, turn: 0, combatantId: cb(IDS.grick).id }, { round: 2, turn: 1, combatantId: cb(IDS.marrith).id });
  await flush();
  assert.equal(cardOf(cards()[0]).closed, "turn");
});

/* ── the render ────────────────────────────────────────────────────────────────────────────── */

test("the owner's client: a click on Shield uses the activity; a non-owner sees the buttons disabled", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18 });
  await settle();
  const [m] = cards();
  F.become({ userId: IDS.playerP });
  let html = root(m.content);
  F.fire("renderChatMessageHTML", m, html, {});
  const button = html.querySelector("button[data-prea-use]");
  assert.equal(button.disabled, false);
  reset();
  const ev = dispatch(button, "click");
  await Promise.all(ev.results);
  assert.deepEqual(F.calls.filter(c => c.op === "activity.use").map(c => [c.actor, c.usage, c.dialog]), [[IDS.marrith, ["event"], {}]],
    "two slots can pay (1st and 2nd): dnd5e's own dialog asks which, as a sheet click would");
  assert.equal(ev.defaultPrevented, true);
  assert.equal(button.disabled, false, "re-enabled after the use");
  // Talo's player sees Marrith's card (if ever) with dead buttons
  F.become({ userId: IDS.playerT });
  html = root(m.content);
  F.fire("renderChatMessageHTML", m, html, {});
  assert.equal(html.querySelector("button[data-prea-use]").disabled, true);
  asGM();
});

test("one slot can pay for Shield: the click names it and skips dnd5e's usage dialog (nothing to choose)", async () => {
  await clearChat();
  reset();
  const slots = W.marrith.system.spells;
  const saved = structuredClone(slots);
  slots.spell1.value = 0;                 // only the 2nd-level slot is left
  W.attack({ total: 18 });
  await settle();
  const [m] = cards();
  F.become({ userId: IDS.playerP });
  const html = root(m.content);
  F.fire("renderChatMessageHTML", m, html, {});
  reset();
  const ev = dispatch(html.querySelector("button[data-prea-use]"), "click");
  await Promise.all(ev.results);
  assert.deepEqual(F.calls.filter(c => c.op === "activity.use").map(c => [c.usage, c.spell, c.dialog]), [[["event", "spell"], { slot: "spell2" }, { configure: false }]]);
  asGM();
  Object.assign(slots, saved);
});

test("a closed card renders dead buttons even for the owner; a card whose activity is gone warns instead of throwing", async () => {
  await clearChat();
  reset();
  W.attack({ total: 18 });
  await settle();
  const [m] = cards();
  F.become({ userId: IDS.playerP });
  const closed = { ...cardOf(m), closed: "turn" };
  const html = root(m.content);
  F.fire("renderChatMessageHTML", { ...m, flags: { [MODULE]: { [CARD_FLAG]: closed } } }, html, {});
  assert.equal(html.querySelector("button[data-prea-use]").disabled, true);
  const gone = root(m.content.replace(/data-prea-use="[^"]+"/, 'data-prea-use="Actor.marrith000000001.Item.nope.Activity.x"'));
  F.fire("renderChatMessageHTML", m, gone, {});
  reset();
  const ev = dispatch(gone.querySelector("button[data-prea-use]"), "click");
  await Promise.all(ev.results);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => c.level), ["warn"]);
  asGM();
});

test("a card without our flag, or a message with no DOM, is left alone", () => {
  reset();
  F.fire("renderChatMessageHTML", W.message({ content: "<p>hi</p>" }), root("<p>hi</p>"), {});
  F.fire("renderChatMessageHTML", cards()[0] ?? W.message({}), null, {});
  assert.deepEqual(consoleLines, []);
});

/* ── errors ────────────────────────────────────────────────────────────────────────────────── */

test("a throw inside our own handler is logged with the module prefix and never reaches Foundry", async () => {
  consoleLines.length = 0;
  const caught = F.hookErrors.length;
  // a message whose system getter throws: the async offer rejects, and the registry's guard reports it
  F.fire("createChatMessage", { get system() { throw new Error("boom"); } }, {}, IDS.gmJoe);
  await flush();
  assert.deepEqual(consoleLines, [["error", `${MODULE} | createChatMessage: offer`]]);
  assert.equal(F.hookErrors.length, caught, "the guard must catch it before Foundry's Hooks.#call does");
});

test("a throw in someone else's listener is Foundry's to report, not ours", async () => {
  await clearChat();
  consoleLines.length = 0;
  const id = Hooks.on(HOOKS.offered.name, function downstream() { throw new Error("listener broke"); });
  W.attack({ total: 18 });
  await settle();
  Hooks.off(HOOKS.offered.name, id);
  const msg = `Error thrown in hooked function 'downstream' for hook '${HOOKS.offered.name}'`;
  assert.deepEqual(consoleLines, [["warn", `Foundry VTT | ${msg}`], ["error", `Error: ${msg}. listener broke`]]);
  assert.equal(cards().length, 1, "the card itself still went out");
});

/* ── the manifest ──────────────────────────────────────────────────────────────────────────── */

const LABELS = ["createChatMessage: offer", "updateChatMessage: index", "combatTurnChange: close", "updateActor: reaction spent", "deleteCombat: close",
  "deleteChatMessage: prune", "renderChatMessageHTML: bind", "ready: reindex"];

test("hook registration manifest (golden/hooks.json)", () => {
  pinJSON("hooks", hooksAtReady, import.meta.url);
  assert.deepEqual(game.modules.get(MODULE).api.describe().hooks.map(h => h.label), LABELS);
});

test("describe(): the use-doc §5.1a key set, the foreign flag read and the flags written", () => {
  const d = game.modules.get(MODULE).api.describe();
  assert.deepEqual(Object.keys(d), [
    "module", "namespace", "version", "contract", "flagScope", "kit", "published",
    "methods", "queries", "settings", "events", "hooks", "patches", "flags", "errors",
  ]);
  assert.deepEqual(d.flags, { writes: [`flags.${MODULE}.card`, `flags.${MODULE}.claims.offer`], reads: ["flags.pentaryn-combat.reaction"] });
  assert.deepEqual(d.events.map(e => e.key), ["offered", "closed"]);
  assert.deepEqual(Object.keys(game.pentaryn.describe().namespaces), [NS]);
  assert.ok(Array.isArray(game.pentaryn.describe().namespaces[NS].methods));
});

// Keep this test LAST: it replaces the published API.
// A hot patch re-runs the WIRING only: the entry's static imports (features, api, settings, core,
// lib/) are the instances already loaded, so this proves re-registration and republish of the same
// code — never that edited feature code is picked up (that needs a reload).
test("hot patch: uninstall(), re-import the entry, and the wiring runs again", async () => {
  await clearChat();
  const old = game.modules.get(MODULE).api;
  old.uninstall();
  assert.equal(F.listeners("createChatMessage"), 0);
  assert.equal(game.ready, true);
  assert.ok(game.keybindings.bindings, "Foundry has built its keybindings: registering one now throws");
  consoleLines.length = 0;
  await import(`../reactions.mjs?hot=${Date.now()}`);
  assert.deepEqual(consoleLines, [], "the re-run must not throw");
  const fresh = game.modules.get(MODULE).api;
  assert.notEqual(fresh, old);
  assert.equal(game.pentaryn[NS], fresh);
  assert.equal(F.listeners("createChatMessage"), 1);
  assert.deepEqual(fresh.describe().hooks.map(h => h.label), LABELS);
  reset();
  W.attack({ total: 18 });
  await settle();
  assert.equal(cards().length, 1, "offering is live at once after a hot patch");
});
