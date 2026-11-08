// Feedback pcuOX7 (Talo: a long rest should roll the Cosmic Omen) and gWNXLN (Caven: a rest should
// remind a caster to prepare spells), triage G1 with G3 as the fallback: after a long rest the owner
// gets one whispered card with a row per REST_RULES match, drawn from the card's flag at render; the
// omen is stored on the feat and marked on Argon (0.7.2: the one button Argon draws per feat is badged with
// the omen's name and never greyed; only a per-activity split greys the other) and the activity choice; a Cosmic Omen used with no
// omen (or the wrong one) rolls it / is redirected; the stars are read once a day and the omen flag's
// updateItem redraws the rendered cards on every client. Before this feature none of the six hooks was
// registered (the pure table is in test/core-fixtures.mjs, checks 4–9d).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, drain, makeActor, setupWorld } from "./fixtures/world.mjs";
import { omenOfActivity as omenOfActivityName } from "../riders-core.mjs";

const TALO = "talo000000000001";
const OMEN = "cosmicomen000001";
const WEAL = "wealact000000001", WOE = "woeact0000000001";
const own = { default: 0, [IDS.player]: 3 };

const talo = () => makeActor({
  id: TALO, name: "Talo", type: "character", ownership: own,
  system: { abilities: { wis: { mod: 5 } }, attributes: { hd: {} } },
  items: [
    { id: "druidcls00000001", name: "Druid", type: "class", system: { identifier: "druid", levels: 7, spellcasting: { progression: "full" } } },
    { id: OMEN, name: "Cosmic Omen", type: "feat", system: { identifier: "cosmic-omen", uses: { value: 5, max: 5 } }, activities: [
      { id: WEAL, type: "utility", name: "Weal (Even)", roll: { formula: "1d6" } },
      { id: WOE, type: "utility", name: "Woe (Odd)", roll: { formula: "1d6" } },
    ] },
    { id: "cure000000000001", name: "Cure Wounds", type: "spell", system: { level: 1, canPrepare: true, prepared: 1 } },
  ],
});

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld({ extraActors: [talo()] });
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const actor = W.actor(TALO);
const omenItem = () => actor.items.get(OMEN);
const act = id => omenItem().system.activities.get(id);
const uses = [];
for (const id of [WEAL, WOE]) act(id).use = async (...args) => { uses.push([id, ...args.map(a => JSON.parse(JSON.stringify(a ?? null)))]); return {}; };
const creates = () => W.log.filter(l => l.op === "ChatMessage.create").map(l => l.data);
const rest = (a = actor, type = "long") => F.fire("dnd5e.restCompleted", a, {}, { type });
const unsetOmen = async () => { if (omenItem().flags[MODULE]?.omen) await omenItem().unsetFlag(MODULE, "omen"); };

/* ── 1. the card ─────────────────────────────────────────────────────────── */

test("a long rest by the owner: the stored omen is cleared (one item batch) and one card is whispered to the players and the rester, with the rows in its flag", async () => {
  await omenItem().setFlag(MODULE, "omen", "weal");
  W.takeLog();
  rest();
  await drain();
  const log = W.takeLog();
  assert.deepEqual(log.map(l => l.op), ["updateEmbeddedDocuments", "ChatMessage.create"]);
  assert.deepEqual(log[0].updates, [{ _id: OMEN, [`flags.${MODULE}.omen`]: "<_del>" }]);
  assert.equal(omenItem().flags[MODULE]?.omen, undefined, "a new day");
  const card = log[1].data;
  assert.deepEqual(card.whisper, [IDS.player, IDS.gm]);
  assert.deepEqual(card.speaker, { actor: TALO, alias: "Talo" });
  assert.equal(card.content, `<p class="pr-rest-title">Long rest: Talo</p>`);
  assert.deepEqual(card.flags, { [MODULE]: { rest: { actor: `Actor.${TALO}`, type: "long", rules: [{ key: "cosmic-omen", item: OMEN }, { key: "prepare-spells", item: null }] } } });
  assert.deepEqual(W.take(), []);
});

test("no card: a short rest, a rester who does not own the actor, the setting off, an actor with nothing to offer", async () => {
  W.takeLog();
  rest(actor, "short");
  F.become({ userId: IDS.player });
  rest(W.actor(IDS.npc));
  F.become({ userId: IDS.gm });
  await F.game.settings.set(MODULE, "restCard", false);
  rest();
  await F.game.settings.set(MODULE, "restCard", true);
  rest(W.actor(IDS.healer), "long");           // a fighter whose Cure Wounds has no preparing method
  rest(W.actor(IDS.wiz), "long");              // fixture spells carry no canPrepare: nothing to prepare
  await drain();
  assert.deepEqual(creates(), []);
  assert.deepEqual(W.takeLog().filter(l => l.op !== "getActiveTokens"), []);
});

/* ── the rows, drawn at render ───────────────────────────────────────────── */

function restCard(id = "restcard00000001", rules = [{ key: "cosmic-omen", item: OMEN }, { key: "prepare-spells", item: null }], actorUuid = `Actor.${TALO}`) {
  const message = makeDoc("ChatMessage", { id, type: "base", isAuthor: true, speaker: { actor: TALO }, flags: { [MODULE]: { rest: { actor: actorUuid, type: "long", rules } } } });
  F.game.messages.set(id, message);
  return message;
}
const cardEl = id => W.html(`<li class="chat-message" data-message-id="${id}"><div class="message-content"><p class="pr-rest-title">Long rest: Talo</p></div></li>`);
const rows = el => el.querySelectorAll(".pr-rest-row").map(r => [r.dataset.prRule, r.querySelector(".pr-rest-label")?.textContent, r.querySelector("button")?.textContent ?? null, r.querySelector(".pr-rest-state")?.textContent ?? null]);

test("the owner sees one row per rule with its button, once per render, under the message content", async () => {
  await unsetOmen();
  const message = restCard();
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  F.fire("dnd5e.renderChatMessage", message, el);
  assert.equal(el.querySelectorAll(".pr-rest").length, 1);
  assert.deepEqual(rows(el), [["cosmic-omen", "Cosmic Omen", "Read the stars", null], ["prepare-spells", "Prepared spells", "Review prepared spells", null]]);
  const buttons = el.querySelectorAll("button.pr-rest-btn");
  assert.deepEqual(buttons.map(b => [b.dataset.action, b.dataset.tooltip]), [
    ["prRest", "Roll the day's omen (1d6): even is Weal, odd is Woe, until your next long rest."],
    ["prRest", "Opens the Spells tab on every spell, so you can prepare and unprepare."],
  ]);
  assert.equal(el.querySelector(".message-content").children[1].className, "pr-rest");
});

test("Read the stars: one 1d6 (the roll posted with the omen as flavor), the omen stored on the feat, the card re-rendered to name it", async () => {
  await unsetOmen();
  const message = restCard("restcard00000002");
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  const updated = [];
  F.ui.chat = { updateMessage: m => updated.push(m.id) };
  W.rolls.push(4);
  W.takeLog();
  const { event } = await el.querySelector('[data-pr-rule="cosmic-omen"] button').click();
  await drain();
  assert.ok(event.defaultPrevented && event.propagationStopped);
  assert.equal(omenItem().flags[MODULE].omen, "weal", "4 is even: Weal");
  const log = W.takeLog();
  assert.deepEqual(log.map(l => l.op), ["roll", "update", "roll.toMessage"].filter(op => op !== "update"), "the flag write is an F.calls update, the rest is here");
  assert.deepEqual(log[0], { op: "roll", formula: "1d6", total: 4 });
  assert.deepEqual(log[1].data, { speaker: { actor: TALO, alias: "Talo" }, flavor: "Cosmic Omen: Weal (even)" });
  assert.deepEqual(updated, [message.id]);
  F.fire("dnd5e.renderChatMessage", message, el);
  assert.deepEqual(rows(el), [["cosmic-omen", "Cosmic Omen", null, "Weal (even)"], ["prepare-spells", "Prepared spells", "Review prepared spells", null]]);
  delete F.ui.chat;
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("the stars are read once a day: a second Read the stars (a stale button on another client's card) rolls nothing, writes nothing and keeps the omen", async () => {
  await unsetOmen();
  const message = restCard("restcard00000008");
  const mine = cardEl(message.id), stale = cardEl(message.id);   // the same card rendered twice: this tab, and one that never redrew
  F.fire("dnd5e.renderChatMessage", message, mine);
  F.fire("dnd5e.renderChatMessage", message, stale);
  W.rolls.push(3);
  W.takeLog();
  F.calls.length = 0;
  await mine.querySelector('[data-pr-rule="cosmic-omen"] button').click();
  await drain();
  assert.equal(omenItem().flags[MODULE].omen, "woe", "3 is odd");
  assert.deepEqual(W.takeLog().map(l => l.op), ["roll", "roll.toMessage"]);
  assert.equal(F.calls.filter(c => c.op === "update").length, 1, "one flag write");
  F.calls.length = 0;
  W.rolls.push(6);                                                   // would read Weal, were it drawn
  await stale.querySelector('[data-pr-rule="cosmic-omen"] button').click();
  await drain();
  assert.equal(omenItem().flags[MODULE].omen, "woe", "unchanged");
  assert.deepEqual(W.takeLog(), [], "no roll, no roll message");
  assert.deepEqual(F.calls.filter(c => c.op === "update"), [], "no write");
  assert.deepEqual(W.rolls, [6], "the queued face was never drawn");
  W.rolls.length = 0;
  F.fire("dnd5e.renderChatMessage", message, stale);
  assert.deepEqual(rows(stale)[0], ["cosmic-omen", "Cosmic Omen", null, "Woe (odd)"], "redrawn, the stale card names the day's omen");
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("the omen stored or cleared on any client (updateItem) redraws that actor's rest cards rendered here, once per card, popout included; other cards, items and fields do nothing", async () => {
  await unsetOmen();
  const message = restCard("restcard00000009");
  const inLog = cardEl(message.id), inPopout = cardEl(message.id);
  const other = restCard("restcard00000010", [{ key: "prepare-spells", item: null }], `Actor.${IDS.wiz}`);
  const otherEl = cardEl(other.id);
  const plain = W.html(`<li class="chat-message" data-message-id="nocard0000000001"><div class="message-content">hi</div></li>`);
  document.body.append(inLog, inPopout, otherEl, plain);
  const updated = [];
  F.ui.chat = { updateMessage: m => updated.push(m.id) };
  try {
    await omenItem().setFlag(MODULE, "omen", "weal");
    await drain();
    assert.deepEqual(updated, [message.id], "Talo's card once; the wizard's card and a plain message untouched");
    updated.length = 0;
    await unsetOmen();
    await drain();
    assert.deepEqual(updated, [message.id], "cleared (the next rest): the button comes back everywhere");
    updated.length = 0;
    await omenItem().update({ "system.uses.value": 4 });                       // another field of the feat
    await actor.items.get("cure000000000001").update({ "system.prepared": 1 });  // another item
    await drain();
    assert.deepEqual(updated, [], "nothing to redraw");
    delete F.ui.chat;
    await omenItem().setFlag(MODULE, "omen", "weal");                         // no chat log on this client (a headless tab): a no-op
    await drain();
  } finally {
    delete F.ui.chat;
    for (const el of [inLog, inPopout, otherEl, plain]) el.remove();
    await unsetOmen();
  }
  assert.deepEqual(W.take(), []);
});

test("Review prepared spells: this user's view for the character goes to All and the sheet opens on the Spells tab (changeTab when the render did not land there)", async () => {
  const message = restCard("restcard00000003");
  const el = cardEl(message.id);
  F.fire("dnd5e.renderChatMessage", message, el);
  const calls = [];
  actor.sheet = { tabGroups: { primary: "details" }, async render(opts) { calls.push(["render", opts]); }, changeTab(tab, group) { calls.push(["changeTab", tab, group]); this.tabGroups[group] = tab; } };
  await el.querySelector('[data-pr-rule="prepare-spells"] button').click();
  await drain();
  assert.equal(F.game.user.getFlag(MODULE, `spellView.${TALO}`), "all");
  assert.deepEqual(calls, [["render", { force: true, tab: { primary: "spells" } }], ["changeTab", "spells", "primary"]]);
  // a render that lands on the tab needs no changeTab; the view already All is a no-op write-wise
  calls.length = 0;
  actor.sheet.render = async function (opts) { calls.push(["render", opts]); this.tabGroups.primary = "spells"; };
  await el.querySelector('[data-pr-rule="prepare-spells"] button').click();
  await drain();
  assert.deepEqual(calls, [["render", { force: true, tab: { primary: "spells" } }]]);
  await F.game.user.unsetFlag(MODULE, `spellView.${TALO}`);
  delete actor.sheet;
  assert.deepEqual(W.take(), []);
});

test("a viewer who does not own the actor: the day's omen is shown, no buttons; nothing to show, no box; a gone feat says so; an unknown actor or rule draws nothing", async () => {
  await unsetOmen();
  const message = restCard("restcard00000004");
  F.become({ userId: IDS.player });
  try {
    const mine = cardEl(message.id);
    F.fire("dnd5e.renderChatMessage", message, mine);
    assert.deepEqual(rows(mine).map(r => r[2]), ["Read the stars", "Review prepared spells"], "Pell owns Talo");
  } finally { F.become({ userId: IDS.gm }); }
  const theirs = makeActor({ id: "theirs0000000001", name: "Theirs", type: "character", ownership: { default: 0 }, items: [
    { id: "theiromen0000001", name: "Cosmic Omen", type: "feat", system: { identifier: "cosmic-omen" }, activities: [{ id: "thweal0000000001", type: "utility", name: "Weal (Even)" }] },
    { id: "theircure0000001", name: "Cure Wounds", type: "spell", system: { level: 1, canPrepare: true, prepared: 1 } },
  ] });
  F.game.actors.set(theirs.id, theirs);
  const card = restCard("restcard00000005", [{ key: "cosmic-omen", item: "theiromen0000001" }, { key: "prepare-spells", item: null }], `Actor.${theirs.id}`);
  F.become({ userId: IDS.player });
  try {
    const el = cardEl(card.id);
    F.fire("dnd5e.renderChatMessage", card, el);
    assert.equal(el.querySelector(".pr-rest"), null, "no omen yet and no buttons for a non-owner: nothing to draw");
    await theirs.items.get("theiromen0000001").setFlag(MODULE, "omen", "woe");
    F.fire("dnd5e.renderChatMessage", card, el);
    assert.deepEqual(rows(el), [["cosmic-omen", "Cosmic Omen", null, "Woe (odd)"]]);
  } finally { F.become({ userId: IDS.gm }); }
  theirs.items.delete("theiromen0000001");
  const gone = cardEl(card.id);
  F.fire("dnd5e.renderChatMessage", card, gone);
  assert.deepEqual(rows(gone)[0], ["cosmic-omen", "Cosmic Omen", null, "Cosmic Omen is no longer on the sheet."]);
  const odd = restCard("restcard00000006", [{ key: "portent", item: null }], "Actor.nobody0000000001");
  const el = cardEl(odd.id);
  F.fire("dnd5e.renderChatMessage", odd, el);
  assert.equal(el.querySelector(".pr-rest"), null);
  F.fire("dnd5e.renderChatMessage", { type: "damage", flags: {} }, el);
  assert.equal(el.querySelector(".pr-rest"), null);
  assert.deepEqual(W.take(), []);
});

/* ── 2. the omen on the HUD and the sheet ────────────────────────────────── */

// Argon's DND5eItemButton: `_item` is the Item (one button per item, the layer's default for a feat:
// `isActivity` false and `activity` the item's FIRST activity) or one Activity (its explodeItemActivities
// setting: `isActivity` true). `item` is the Item either way.
const buttonEl = () => W.html(`<div class="feature-element"><span class="label">x</span></div>`);
const argonButton = (activity, item = omenItem()) => ({ _item: activity, isActivity: true, item, activity, element: buttonEl() });
const argonItemButton = (item = omenItem()) => ({ _item: item, isActivity: false, item, activity: item.system.activities.contents[0], element: buttonEl() });
const badgeText = b => b.element.querySelector(".pr-omen-badge")?.textContent ?? null;
const choiceEl = () => W.html(`<section><menu class="unlist"><li><button type="button" data-action="choose" data-activity-id="${WEAL}"><span class="name">Weal (Even)</span></button></li><li><button type="button" data-action="choose" data-activity-id="${WOE}"><span class="name">Woe (Odd)</span></button></li></menu></section>`);

test("Argon, one button per item (the default for a feat; 0.7.2, Talo live): never greyed, the badge names the stored omen although Argon's `activity` is the first (Weal); re-rendered not doubled; no omen or the setting off → bare", async () => {
  await omenItem().setFlag(MODULE, "omen", "woe");
  const one = argonItemButton();
  assert.equal(omenOfActivityName(one.activity), "weal", "Argon's getter answers the item's first activity");
  F.fire("renderItemButtonArgonComponent", one);
  assert.equal(one.element.classList.contains("pr-omen-off"), false, "the one button is the feat: never greyed");
  assert.equal(badgeText(one), "Woe");
  F.fire("renderItemButtonArgonComponent", one);
  assert.equal(one.element.querySelectorAll(".pr-omen-badge").length, 1, "re-rendered, not doubled");
  await omenItem().setFlag(MODULE, "omen", "weal");
  F.fire("renderItemButtonArgonComponent", one);
  assert.equal(badgeText(one), "Weal");
  assert.equal(one.element.classList.contains("pr-omen-off"), false);
  await F.game.settings.set(MODULE, "restCard", false);
  F.fire("renderItemButtonArgonComponent", one);
  assert.equal(badgeText(one), null);
  await F.game.settings.set(MODULE, "restCard", true);
  await unsetOmen();
  F.fire("renderItemButtonArgonComponent", one);
  assert.equal(one.element.outerHTML, buttonEl().outerHTML);
  assert.deepEqual(W.take(), []);
});

test("a button that does not say `isActivity` (another HUD, a double): `_item` the item → the item's badge; `_item` an activity → that activity's mark; neither → the item's", async () => {
  await omenItem().setFlag(MODULE, "omen", "woe");
  const item = omenItem();
  const asItem = { _item: item, item, activity: act(WEAL), element: buttonEl() };
  const asWeal = { _item: act(WEAL), item, activity: act(WEAL), element: buttonEl() };
  const bare = { item, activity: act(WEAL), element: buttonEl() };
  for (const b of [asItem, asWeal, bare]) F.fire("renderItemButtonArgonComponent", b);
  assert.deepEqual([badgeText(asItem), asItem.element.classList.contains("pr-omen-off")], ["Woe", false]);
  assert.deepEqual([badgeText(asWeal), asWeal.element.classList.contains("pr-omen-off")], [null, true]);
  assert.deepEqual([badgeText(bare), bare.element.classList.contains("pr-omen-off")], ["Woe", false]);
  await unsetOmen();
});

test("Argon, one button per activity (the item split): with Woe stored the Woe button gets the badge and the Weal button is greyed; no omen or the setting off clears both; other items untouched", async () => {
  await omenItem().setFlag(MODULE, "omen", "woe");
  const weal = argonButton(act(WEAL)), woe = argonButton(act(WOE));
  F.fire("renderItemButtonArgonComponent", weal);
  F.fire("renderItemButtonArgonComponent", woe);
  assert.equal(weal.element.classList.contains("pr-omen-off"), true);
  assert.equal(weal.element.querySelector(".pr-omen-badge"), null);
  assert.equal(woe.element.classList.contains("pr-omen-off"), false);
  assert.equal(woe.element.querySelector(".pr-omen-badge").textContent, "today's omen");
  F.fire("renderItemButtonArgonComponent", woe);
  assert.equal(woe.element.querySelectorAll(".pr-omen-badge").length, 1, "re-rendered, not doubled");
  await F.game.settings.set(MODULE, "restCard", false);
  F.fire("renderItemButtonArgonComponent", weal);
  F.fire("renderItemButtonArgonComponent", woe);
  assert.equal(weal.element.classList.contains("pr-omen-off"), false);
  assert.equal(woe.element.querySelector(".pr-omen-badge"), null);
  await F.game.settings.set(MODULE, "restCard", true);
  await unsetOmen();
  F.fire("renderItemButtonArgonComponent", weal);
  assert.equal(weal.element.classList.contains("pr-omen-off"), false);
  const sword = W.actor(IDS.sorc).items.get("longsword0000001");
  const other = argonButton(sword.system.activities.contents[0], sword);
  F.fire("renderItemButtonArgonComponent", other);
  assert.equal(other.element.outerHTML, `<div class="feature-element"><span class="label">x</span></div>`);
  F.fire("renderItemButtonArgonComponent", { item: null, element: null });
  assert.deepEqual(W.take(), []);
});

test("the activity choice dialog: today's omen marked, the other disabled; no omen stored → untouched", async () => {
  await omenItem().setFlag(MODULE, "omen", "weal");
  const el = choiceEl();
  F.fire("renderActivityChoiceDialog", { item: omenItem() }, el, {}, { isFirstRender: true });
  const [weal, woe] = el.querySelectorAll("button");
  assert.ok(weal.classList.contains("pr-omen-today") && !weal.disabled);
  assert.equal(weal.querySelector(".pr-omen-badge").textContent, "today's omen");
  assert.ok(woe.classList.contains("pr-omen-off") && woe.disabled);
  F.fire("renderActivityChoiceDialog", { item: omenItem() }, el, {}, { isFirstRender: false });
  assert.equal(weal.querySelectorAll(".pr-omen-badge").length, 1);
  await unsetOmen();
  const plain = choiceEl();
  F.fire("renderActivityChoiceDialog", { item: omenItem() }, plain);
  assert.equal(plain.querySelectorAll(".pr-omen-off, .pr-omen-today, .pr-omen-badge").length, 0);
  F.fire("renderActivityChoiceDialog", { item: W.actor(IDS.sorc).items.get("fireball00000001") }, plain);
  assert.deepEqual(W.take(), []);
});

/* ── 3. use it and the stars decide (G3) ─────────────────────────────────── */

const use = (id, usage = {}, dialog = {}) => F.fireCall("dnd5e.preUseActivity", act(id), usage, dialog, {});

test("the stored omen's activity goes through; the other is stopped and the day's activity used instead, with one notice", async () => {
  await omenItem().setFlag(MODULE, "omen", "weal");
  uses.length = 0;
  F.calls.length = 0;
  assert.notEqual(use(WEAL), false, "Weal on a Weal day");
  assert.equal(use(WOE, { event: { type: "click" }, legacy: false, consume: { resources: [0] } }, { configure: true }), false, "Woe on a Weal day: stopped");
  await drain();
  assert.deepEqual(uses, [[WEAL, { event: { type: "click" }, legacy: false, consume: { resources: [0] }, pentaryn: { omen: true } }, { configure: true }, {}]], "the click's own usage and dialog config, plus the re-call mark");
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["info", "The stars read Weal (even) today: Weal (Even) it is."]]);
  assert.notEqual(use(WEAL, { pentaryn: { omen: true } }), false, "the re-call is never stopped again");
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("no omen stored (offline for the rest, or the card closed): the first use rolls and stores it, then uses the day's activity — the one clicked when it matches, silently", async () => {
  await unsetOmen();
  uses.length = 0;
  F.calls.length = 0;
  W.rolls.push(3);
  W.takeLog();
  assert.equal(use(WEAL, {}, {}), false, "stopped: the stars have not been read");
  await drain();
  assert.equal(omenItem().flags[MODULE].omen, "woe", "3 is odd");
  assert.deepEqual(W.takeLog().map(l => l.op), ["roll", "roll.toMessage"]);
  assert.deepEqual(uses, [[WOE, { pentaryn: { omen: true } }, {}, {}]], "no event, no dialog choice: dnd5e's defaults (the JSON copy drops undefined)");
  assert.equal(F.calls.filter(c => c.op === "notify").length, 1, "clicked Weal, got Woe: one notice");
  await unsetOmen();
  uses.length = 0;
  F.calls.length = 0;
  W.rolls.push(6);
  assert.equal(use(WEAL), false);
  await drain();
  assert.equal(omenItem().flags[MODULE].omen, "weal");
  assert.deepEqual(uses.map(u => u[0]), [WEAL], "clicked the day's activity: used as clicked");
  assert.deepEqual(F.calls.filter(c => c.op === "notify"), [], "no notice when the click was right");
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("left to dnd5e: the setting off, a non-owner's use, another item, a Cosmic Omen activity that names no omen", async () => {
  await unsetOmen();
  uses.length = 0;
  await F.game.settings.set(MODULE, "restCard", false);
  assert.notEqual(use(WOE), false);
  await F.game.settings.set(MODULE, "restCard", true);
  const theirs = makeActor({ id: "theirs0000000002", name: "Theirs", type: "character", ownership: { default: 0 }, items: [
    { id: "theiromen0000002", name: "Cosmic Omen", type: "feat", system: { identifier: "cosmic-omen" }, activities: [{ id: "thweal0000000002", type: "utility", name: "Weal (Even)" }] },
  ] });
  F.become({ userId: IDS.player });
  try {
    assert.notEqual(F.fireCall("dnd5e.preUseActivity", theirs.items.get("theiromen0000002").system.activities.get("thweal0000000002"), {}, {}, {}), false);
  } finally { F.become({ userId: IDS.gm }); }
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", W.actor(IDS.sorc).items.get("fireball00000001").system.activities.contents[0], {}, {}, {}), false);
  const third = { id: "stars00000000001", type: "utility", name: "Consult the stars" };
  Object.defineProperty(third, "item", { value: omenItem() });
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", third, {}, {}, {}), false);
  await drain();
  assert.deepEqual(uses, []);
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("a throwing activity is warned, never a veto, never thrown", () => {
  W.take();
  assert.notEqual(F.fireCall("dnd5e.preUseActivity", { get item() { throw new Error("odd activity"); } }, {}, {}, {}), false);
  assert.deepEqual(W.take().filter(l => /Cosmic Omen/.test(l[1])), [["warn", `${MODULE} | Cosmic Omen check skipped`, "odd activity"]]);
});

/* ── the API ─────────────────────────────────────────────────────────────── */

test("restCard(ref): the card without resting, for an owned actor (a GM owns all); REFUSED otherwise; [] / null when nothing matches", async () => {
  await omenItem().setFlag(MODULE, "omen", "weal");
  W.takeLog();
  const out = await api.restCard("Talo");
  assert.equal(out.ok, true);
  assert.deepEqual(out.rules, ["cosmic-omen", "prepare-spells"]);
  assert.equal(out.message, null, "the stub's ChatMessage.create answers no id");
  assert.deepEqual(W.takeLog().map(l => l.op), ["updateEmbeddedDocuments", "ChatMessage.create"]);
  assert.equal(omenItem().flags[MODULE]?.omen, undefined);
  const none = await api.restCard(W.actor(IDS.npc));
  assert.deepEqual([none.ok, none.rules, none.message], [true, [], null]);
  const theirs = makeActor({ id: "theirs0000000003", name: "Theirs", type: "character", ownership: { default: 0 } });
  F.game.actors.set(theirs.id, theirs);
  F.become({ userId: IDS.player });
  try {
    assert.equal((await api.restCard(theirs)).code, "REFUSED");
  } finally { F.become({ userId: IDS.gm }); }
  assert.equal((await api.restCard("Nobody")).code, "NOT_FOUND");
});

test("readOmen(ref): rolls and stores the omen (even weal, odd woe) once a day — a stored omen is answered, not rerolled; NONE without a Cosmic Omen; REFUSED for a non-owner", async () => {
  await unsetOmen();
  W.rolls.push(2);
  const out = await api.readOmen(`Actor.${TALO}`);
  assert.deepEqual([out.ok, out.omen, out.face, out.rolled], [true, "weal", 2, true]);
  assert.equal(omenItem().flags[MODULE].omen, "weal");
  W.rolls.push(5);
  F.calls.length = 0;
  const again = await api.readOmen(actor);
  assert.deepEqual([again.ok, again.omen, again.face, again.rolled], [true, "weal", null, false], "read once a day: the stored omen, nothing rolled");
  assert.deepEqual([W.rolls, F.calls.filter(c => c.op === "update")], [[5], []], "the queued face never drawn, nothing written");
  W.rolls.length = 0;
  assert.equal((await api.readOmen(W.actor(IDS.sorc))).code, "NONE");
  F.become({ userId: IDS.player });
  try {
    assert.equal((await api.readOmen(W.actor(IDS.npc))).code, "REFUSED");
  } finally { F.become({ userId: IDS.gm }); }
  await unsetOmen();
  W.take();
});

test("uninstall removes the drawn rows and marks from the page; the omen flag stays", async () => {
  await omenItem().setFlag(MODULE, "omen", "weal");
  const message = restCard("restcard00000007");
  const el = cardEl(message.id);
  document.body.append(el);
  F.fire("dnd5e.renderChatMessage", message, el);
  const woe = argonButton(act(WOE));
  document.body.append(woe.element);
  F.fire("renderItemButtonArgonComponent", woe);
  assert.equal(document.querySelectorAll(".pr-rest").length, 1);
  assert.ok(woe.element.classList.contains("pr-omen-off"));
  const rest = await import("../rest.mjs");
  rest.uninstall();
  assert.equal(document.querySelectorAll(".pr-rest, .pr-omen-badge, .pr-omen-off").length, 0);
  assert.equal(el.querySelector(".pr-rest-title").textContent, "Long rest: Talo", "the message's own content stays");
  assert.equal(omenItem().flags[MODULE].omen, "weal");
  el.remove();
  woe.element.remove();
});
