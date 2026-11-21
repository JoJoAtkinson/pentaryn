// Feedback WUiaAA (Marrith: Empowered Spell should reroll the damage dice), triage H1, one-click per
// the 2026-11-07 review: a sorcerer's spell damage card gets an "Empower (1 SP)" button; one click
// spends the point through the feat's own activity (no dialog, no card), rerolls the dice below their
// average (up to CHA mod, lowest first), posts the result as a new damage card under the usage card
// and retires the old card (flag, no tray). Shift-click picks the dice. An applied card loses the
// button (marked by the feat alone, points or not); no button when nothing is below average. Before
// this feature neither hook was registered and core/empower.mjs did not exist.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { makeDoc } from "./kit/foundry-stub.mjs";
import { IDS, MODULE, drain, makeActor, setupWorld } from "./fixtures/world.mjs";

const core = await import("../core/empower.mjs");

/* ── the pure core ───────────────────────────────────────────────────────── */

const die = (faces, results, modifiers = [], flavor = "fire") => ({ class: "BasicDie", number: results.length, faces, modifiers, results: results.map(r => (typeof r === "number" ? { result: r, active: true } : r)), options: { flavor } });
const op = operator => ({ class: "OperatorTerm", operator });
const num = n => ({ class: "NumericTerm", number: n });
/** Marrith's Fireball: 8d6min2[fire] + 5 — the 1 reads 2 (core's min2 as `count`). */
const fireball = () => ({
  class: "DamageRoll", formula: "8d6min2[fire] + 5", total: 35, evaluated: true, options: { type: "fire" },
  terms: [die(6, [{ result: 1, active: true, count: 2, rerolled: true }, 2, 3, 4, 5, 6, 6, 2], ["min2"]), op("+"), num(5)],
});

test("dieValue / minimumOf: core's count over the face; the min floor among modifiers", () => {
  assert.equal(core.dieValue({ result: 1, count: 2 }), 2);
  assert.equal(core.dieValue({ result: 4 }), 4);
  assert.ok(Number.isNaN(core.dieValue({})) && Number.isNaN(core.dieValue(null)));
  assert.equal(core.minimumOf(["min2"]), 2);
  assert.equal(core.minimumOf(["x5=8", "min3"]), 3);
  assert.equal(core.minimumOf(["r1"]), null);
  assert.equal(core.minimumOf(undefined), null);
});

test("empowerCandidates: every active face of a top-level die added linearly; a die multiplied, inside a function, negative-count or inactive is not", () => {
  const c = core.empowerCandidates([fireball()]);
  assert.deepEqual(c.map(x => [x.result, x.value]), [[0, 2], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 6], [7, 2]]);
  assert.deepEqual(c[0], { roll: 0, term: 0, result: 0, faces: 6, value: 2, mean: 3.5 });
  const odd = [{
    terms: [
      die(8, [{ result: 2, active: false }, 7]),                                   // one inactive face
      op("+"), { class: "FunctionTerm", fn: "max", terms: ["1d6", "3"] },         // a die inside a function
      op("+"), { class: "ParentheticalTerm", term: "2d6" },
      op("*"), die(4, [1]),                                                      // multiplied
      op("-"), die(4, [1]),                                                      // subtracted: linear
      op("+"), { ...die(6, [1]), number: -1 },                                   // a negative count
      op("+"), { class: "BasicDie", faces: 6, number: 1 },                       // no results (unevaluated)
    ],
  }, { terms: [die(12, [3])] }];
  assert.deepEqual(core.empowerCandidates(odd).map(x => [x.roll, x.term, x.result, x.faces, x.value]), [[0, 0, 1, 8, 7], [0, 8, 0, 4, 1], [1, 0, 0, 12, 3]]);
  assert.deepEqual(core.empowerCandidates([]), []);
  assert.deepEqual(core.empowerCandidates(null), []);
  assert.deepEqual(core.empowerCandidates([{ terms: [die(1, [1])] }]), [], "a d1 is not a die");
});

test("empowerPlan: the faces below their average, lowest first (then the bigger die), up to the modifier; at least one", () => {
  const picks = core.empowerPlan([fireball()], 5);
  assert.deepEqual(picks.map(p => [p.result, p.value]), [[0, 2], [1, 2], [7, 2], [2, 3]], "the 1-read-as-2, the 2s, then the 3; 4 and up stay");
  assert.deepEqual(core.empowerPlan([fireball()], 2).map(p => p.result), [0, 1]);
  assert.deepEqual(core.empowerPlan([fireball()], 0).map(p => p.result), [0], "CHA 0 or less: still one die (the rule's minimum)");
  assert.deepEqual(core.empowerPlan([fireball()], "x").map(p => p.result), [0]);
  const two = [{ terms: [die(6, [3])] }, { terms: [die(10, [3])] }];
  assert.deepEqual(core.empowerPlan(two, 1).map(p => p.roll), [1], "equal faces: the larger die first");
  assert.deepEqual(core.empowerPlan([{ terms: [die(6, [4, 5, 6])] }], 5), [], "nothing below average: nothing to do by itself");
});

test("empowerRolls: the old face stays inactive and struck through, the new one follows it; totals move by the difference; min2 re-applied; subtraction honoured; input untouched", () => {
  const input = [fireball()];
  const snapshot = JSON.stringify(input);
  const faces = [6, 4, 1, 3];
  const out = core.empowerRolls(input, core.empowerPlan(input, 5), () => faces.shift());
  assert.equal(JSON.stringify(input), snapshot, "not mutated");
  assert.deepEqual(out.changes, [
    { roll: 0, term: 0, result: 0, faces: 6, from: 2, to: 3 },
    { roll: 0, term: 0, result: 1, faces: 6, from: 2, to: 2 },
    { roll: 0, term: 0, result: 2, faces: 6, from: 3, to: 4 },
    { roll: 0, term: 0, result: 7, faces: 6, from: 2, to: 6 },
  ], "in roll order; rerolled highest index first, so the rng's 6 went to the last 2");
  assert.equal(out.delta, (3 - 2) + (2 - 2) + (4 - 3) + (6 - 2));
  assert.equal(out.rolls[0].total, 35 + out.delta);
  const results = out.rolls[0].terms[0].results;
  assert.equal(results.length, 12);
  assert.deepEqual(results[0], { result: 1, active: false, count: 2, rerolled: true });
  assert.deepEqual(results[1], { result: 3, active: true });
  assert.deepEqual(results[2], { result: 2, active: false, rerolled: true });
  assert.deepEqual(results[3], { result: 1, active: true, count: 2 }, "a 1 under min2 reads 2 again");
  assert.deepEqual(results[11], { result: 6, active: true });
  assert.equal(results.filter(r => r.active).length, 8, "still eight live dice");
  assert.equal(out.rolls[0].formula, "8d6min2[fire] + 5");

  const minus = [{ total: 11, terms: [num(12), op("-"), die(4, [1])] }];
  const m = core.empowerRolls(minus, [{ roll: 0, term: 2, result: 0 }], () => 4);
  assert.equal(m.rolls[0].total, 8, "a bigger subtracted die lowers the total");
  assert.deepEqual(m.changes.map(c => [c.from, c.to]), [[1, 4]]);
});

test("empowerRolls: junk picks (an inactive face, a non-linear die, out of range, a duplicate) change nothing; the rng is clamped to 1..faces", () => {
  const roll = { total: 4, terms: [die(6, [{ result: 2, active: false }, 3]), op("+"), num(1), op("*"), die(4, [1])] };
  const out = core.empowerRolls([roll], [{ roll: 0, term: 0, result: 0 }, { roll: 0, term: 4, result: 0 }, { roll: 0, term: 0, result: 9 }, { roll: 3, term: 0, result: 0 }, { roll: 0, term: 0, result: 1 }, { roll: 0, term: 0, result: 1 }], () => 99);
  assert.deepEqual(out.changes, [{ roll: 0, term: 0, result: 1, faces: 6, from: 3, to: 6 }], "only the live linear face, once");
  assert.equal(out.rolls[0].total, 7);
  assert.deepEqual(core.empowerRolls([fireball()], [{ roll: 0, term: 0, result: 3 }], () => 0).changes.map(c => c.to), [2], "0 reads a 1, which min2 reads as 2");
  assert.deepEqual(core.empowerRolls([{ total: 4, terms: [die(4, [4])] }], [{ roll: 0, term: 0, result: 0 }], () => 0).changes.map(c => c.to), [1], "0 reads 1");
  assert.deepEqual(core.empowerRolls(null, [], () => 1), { rolls: [], changes: [], delta: 0 });
});

test("F1 rollsTotal: each roll's total floored at 0, summed (dnd5e's card total); junk reads 0", () => {
  assert.equal(core.rollsTotal([{ total: 35 }, { total: 6 }]), 41);
  assert.equal(core.rollsTotal([{ total: -3 }, { total: 4 }]), 4);
  assert.equal(core.rollsTotal([{ total: "x" }, null]), 0);
  assert.equal(core.rollsTotal(null), 0);
});

test("F1 rerolledFaces: each change's old and new face where they landed (earlier changes in the term shift it), raw faces, class and flavor; a change that points at no pair is skipped", () => {
  const faces = [6, 4, 1, 3];
  const out = core.empowerRolls([fireball()], core.empowerPlan([fireball()], 5), () => faces.shift());
  const got = core.rerolledFaces(out.rolls, out.changes);
  assert.deepEqual(got.map(f => [f.oldIndex, f.newIndex, f.old, f.fresh]), [[0, 1, 1, 3], [2, 3, 2, 1], [4, 5, 3, 4], [10, 11, 2, 6]], "the 1 under min2 prints 1; the new 1 under min2 prints 1 too");
  assert.deepEqual([got[0].faces, got[0].cls, got[0].flavor, got[0].roll, got[0].term], [6, "BasicDie", "fire", 0, 0]);
  assert.deepEqual(core.rerolledFaces(out.rolls, [{ roll: 0, term: 2, result: 0 }, { roll: 4, term: 0, result: 0 }]), [], "a number term, a missing roll");
  assert.deepEqual(core.rerolledFaces([fireball()], [{ roll: 0, term: 0, result: 0 }]), [], "not rerolled: the face after is not new");
  assert.deepEqual(core.rerolledFaces(null, null), []);
});

test("F1 matchChips: each rerolled face takes the first unused adjacent old-then-new pair in one list on its die size; a min2 die that only reads rerolled is passed over", () => {
  const chip = (list, faces, label, rerolled = false) => ({ list, faces, label, rerolled });
  const chips = [
    chip(0, 6, "1", true),          // Elemental Adept's min2 1: rerolled, active — followed by an unrelated 5
    chip(0, 6, "5"),
    chip(0, 6, "1", true), chip(0, 6, "4"),   // the reroll: 1 → 4
    chip(0, 6, "3", true), chip(1, 6, "3"),   // split across lists: never a pair
    chip(1, 8, "2", true), chip(1, 8, "7"),   // a d8: 2 → 7
  ];
  assert.deepEqual(core.matchChips(chips, [{ faces: 6, old: 1, fresh: 4 }, { faces: 8, old: 2, fresh: 7 }]), [[2, 3], [6, 7]]);
  assert.deepEqual(core.matchChips(chips, [{ faces: 6, old: 1, fresh: 4 }, { faces: 6, old: 1, fresh: 4 }]), [[2, 3]], "a pair is used once");
  assert.deepEqual(core.matchChips(chips, [{ faces: 6, old: 3, fresh: 3 }]), [], "not in one list");
  assert.deepEqual(core.matchChips(null, [{ faces: 6, old: 1, fresh: 4 }]), []);
  assert.deepEqual(core.matchChips(chips, null), []);
});

test("F2 rerolledRollData: only the new faces, one term per die class, size and flavor, joined by +; null with nothing rerolled", () => {
  const f = (faces, fresh, flavor = "fire", cls = "Die") => ({ faces, fresh, flavor, cls });
  const data = core.rerolledRollData([f(6, 4), f(6, 3), f(8, 7, "cold"), f(6, 6)]);
  assert.equal(data.class, "Roll");
  assert.equal(data.formula, "3d6[fire] + 1d8[cold]");
  assert.equal(data.total, 4 + 3 + 6 + 7);
  assert.equal(data.evaluated, true);
  assert.deepEqual(data.terms.map(t => t.class), ["Die", "OperatorTerm", "Die"]);
  assert.deepEqual(data.terms[0], { class: "Die", number: 3, faces: 6, modifiers: [], results: [{ result: 4, active: true }, { result: 3, active: true }, { result: 6, active: true }], options: { flavor: "fire" }, evaluated: true });
  assert.deepEqual(core.rerolledRollData([f(6, 2, null)]).terms[0].options, {}, "no flavor, no options");
  assert.equal(core.rerolledRollData([]), null);
  assert.equal(core.rerolledRollData([{ faces: 1, fresh: 1 }, { faces: 6, fresh: NaN }]), null, "junk is skipped");
  assert.equal(core.rerolledRollData(null), null);
});

/* ── the card ────────────────────────────────────────────────────────────── */

const MAR = "marrith000000001", FONT = "fontofmagic00001", EMP = "empowered0000001", EMPACT = "empact0000000001", FIREBALL = "fireball00000009";
const own = { default: 0, [IDS.player]: 3 };
const marrith = () => makeActor({
  id: MAR, name: "Marrith", type: "character", ownership: own,
  system: { abilities: { cha: { mod: 5 } }, attributes: { hd: {} } },
  items: [
    { id: "sorccls000000001", name: "Sorcerer", type: "class", system: { identifier: "sorcerer", levels: 12, spellcasting: { progression: "full" } } },
    { id: FONT, name: "Font of Magic", type: "feat", system: { identifier: "font-of-magic", uses: { value: 4, max: 12, spent: 8 } } },
    { id: EMP, name: "Empowered Spell", type: "feat", system: { identifier: "empowered-spell" }, activities: [
      { id: EMPACT, type: "utility", name: "Empowered Spell", consumption: { targets: [{ type: "itemUses", target: FONT, value: "1" }] } },
    ] },
    { id: FIREBALL, name: "Fireball", type: "spell", system: { level: 3 }, activities: [{ id: "fbsave0000000009", type: "save" }] },
    { id: "dagger0000000001", name: "Dagger", type: "weapon", system: {}, activities: [{ id: "dagatk0000000001", type: "attack" }] },
  ],
});

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld({ extraActors: [marrith()] });
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const mar = W.actor(MAR);
const font = () => mar.items.get(FONT);
const empAct = mar.items.get(EMP).system.activities.get(EMPACT);
const uses = [];
empAct.use = async (...args) => {
  uses.push(args.map(a => JSON.parse(JSON.stringify(a ?? null))));
  if (font().system.uses.value < 1) return undefined;
  font().system.uses.value -= 1;
  return { updates: [] };
};
const bazgar = makeActor({ id: "bazgar0000000001", name: "Bazgar", type: "npc", system: { attributes: { hp: { value: 40, max: 40 } } } });

/** A dnd5e damage card as rolled from Fireball's usage card. */
function damageCard({ id = "dmg0000000000001", item = mar.items.get(FIREBALL), rolls = [fireball()], flags = {}, isAuthor = true, type = "damage" } = {}) {
  const message = makeDoc("ChatMessage", {
    id, type, isAuthor, isContentVisible: true, speaker: { actor: MAR, alias: "Marrith" }, flavor: "Fireball - Damage", whisper: [], blind: false,
    system: { activity: { id: "fbsave0000000009", uuid: `Actor.${MAR}.Item.${FIREBALL}.Activity.fbsave0000000009` }, item: { id: item.id, uuid: item.uuid, type: item.type }, origin: "usecard000000099", targets: [{ name: "Bazgar", uuid: "Actor.bazgar0000000001" }], onSave: "half" },
    rolls: rolls.map(r => ({ toJSON: () => r })),
    flags: { [MODULE]: { applied: ["elemental-adept"], ignoreResistance: ["fire"], origin: "usecard000000099", detail: {} , ...flags }, core: { canPopout: true } },
  });
  Object.defineProperty(message, "getAssociatedItem", { value: () => item, enumerable: false, configurable: true });
  Object.defineProperty(message, "getAssociatedActor", { value: () => mar, enumerable: false, configurable: true });
  F.game.messages.set(id, message);
  return message;
}
const cardEl = id => W.html(`<li class="chat-message" data-message-id="${id}"><div class="message-content"><div class="chat-card"></div><section class="icon-row"><button class="dice-roll"><strong class="total">35</strong></button></section><p class="supplement pentaryn-riders-note">Elemental Adept: 1s count as 2</p><damage-application class="dnd5e2"></damage-application></div></li>`);
const button = el => el.querySelector("button.pr-empower-btn");
const render = (message, el = cardEl(message.id)) => { F.fire("dnd5e.renderChatMessage", message, el); return el; };

/** The world stub's ChatMessage.create answers plain data; the Empower flow wants the created card. */
const created = [];
const realCreate = globalThis.ChatMessage.create;
globalThis.ChatMessage.create = async data => {
  created.push(JSON.parse(JSON.stringify(data)));
  const doc = makeDoc("ChatMessage", { id: `newdmg0000000${String(created.length).padStart(3, "0")}`, ...JSON.parse(JSON.stringify(data)) });
  F.game.messages.set(doc.id, doc);
  return doc;
};
const uniforms = [];
F.CONFIG.Dice = { randomUniform: () => uniforms.shift() ?? 0.5 };

test("the caster's owner sees one Empower (1 SP) button under the riders note, once per render, with the modifier in its tooltip", () => {
  const message = damageCard();
  const el = render(message);
  render(message, el);
  assert.equal(el.querySelectorAll(".pr-empower").length, 1);
  const b = button(el);
  assert.deepEqual([b.textContent, b.dataset.action, b.dataset.tooltip], ["Empower (1 SP)", "prEmpower", "Spend 1 Sorcery Point to reroll up to 5 damage dice that came up below their average; the new rolls are kept. Shift-click to choose the dice."]);
  const content = el.querySelector(".message-content");
  assert.equal(content.children[3].className, "pr-empower", "right after the card note");
  assert.ok(el.querySelector("damage-application"), "the live card keeps its tray");
  assert.deepEqual(W.take(), []);
});

test("no button: a weapon's damage, an attack card, no Sorcery Points, no dice, no die below its average, an applied card, a card this user cannot edit, the setting off, no Empowered Spell", async () => {
  const none = (message, why) => assert.equal(button(render(message)), null, why);
  none(damageCard({ id: "dmg0000000000002", item: mar.items.get("dagger0000000001") }), "a dagger");
  none(damageCard({ id: "dmg0000000000003", type: "attack" }), "an attack roll");
  none(damageCard({ id: "dmg0000000000004", flags: { trayApplied: true } }), "applied");
  none(damageCard({ id: "dmg0000000000005", rolls: [{ total: 5, terms: [num(5)] }] }), "no dice");
  none(damageCard({ id: "dmg0000000000012", rolls: [{ class: "DamageRoll", formula: "3d6", total: 15, evaluated: true, terms: [die(6, [4, 5, 6])] }] }), "nothing below average: one click would have nothing to do, and no picker is offered");
  font().system.uses.value = 0;
  none(damageCard({ id: "dmg0000000000006" }), "no points");
  font().system.uses.value = 4;
  await F.game.settings.set(MODULE, "empoweredSpell", false);
  none(damageCard({ id: "dmg0000000000007" }), "setting off");
  await F.game.settings.set(MODULE, "empoweredSpell", true);
  F.become({ userId: IDS.player });
  try {
    none(damageCard({ id: "dmg0000000000008", isAuthor: false }), "Pell owns Marrith but a GM rolled this card: Pell cannot retire it");
    assert.ok(button(render(damageCard({ id: "dmg0000000000009", isAuthor: true }))), "Pell's own card");
  } finally { F.become({ userId: IDS.gm }); }
  assert.ok(button(render(damageCard({ id: "dmg0000000000010", isAuthor: false }))), "a GM can retire any card");
  const sorc = W.actor(IDS.sorc);
  const theirs = damageCard({ id: "dmg0000000000011", item: sorc.items.get("fireball00000001") });
  Object.defineProperty(theirs, "getAssociatedActor", { value: () => sorc });
  none(theirs, "Ilsa has no Empowered Spell");
  assert.deepEqual(W.take(), []);
});

test("one click: the point through the feat's activity (no dialog, no card), the four low dice rerolled, a new damage card under the usage card with the old card's targets and riders flags, the old card retired", async () => {
  const message = damageCard({ id: "dmg0000000000020" });
  const el = render(message);
  uses.length = 0;
  created.length = 0;
  uniforms.push(0.1, 0.4, 0.9, 0.5);      // d6 faces 6, 4, 1 (reads 2 under min2), 3 — drawn for results 7, 2, 1, 0
  F.calls.length = 0;
  const { event } = await button(el).click();
  await drain();
  assert.ok(event.defaultPrevented && event.propagationStopped);
  assert.deepEqual(uses, [[{ pentaryn: { empower: true } }, { configure: false }, { create: false }]]);
  assert.equal(font().system.uses.value, 3, "one Sorcery Point");
  assert.equal(created.length, 1);
  const card = created[0];
  assert.equal(card.type, "damage");
  assert.deepEqual(card.speaker, { actor: MAR, alias: "Marrith" });
  assert.equal(card.flavor, "Fireball - Damage");
  assert.deepEqual(card.system, { activity: { id: "fbsave0000000009", uuid: `Actor.${MAR}.Item.${FIREBALL}.Activity.fbsave0000000009` }, item: { id: FIREBALL, uuid: `Actor.${MAR}.Item.${FIREBALL}`, type: "spell" }, origin: "usecard000000099", targets: [{ name: "Bazgar", uuid: "Actor.bazgar0000000001" }], onSave: "half" });
  const roll = JSON.parse(card.rolls[0]);
  assert.equal(roll.class, "DamageRoll");
  assert.equal(roll.total, 35 - (2 + 2 + 3 + 2) + (3 + 2 + 4 + 6), "41: the 1-as-2 → 3, 2 → 2 (a 1 under min2), 3 → 4, 2 → 6");
  assert.equal(roll.terms[0].results.filter(r => r.active).map(r => r.count ?? r.result).reduce((a, b) => a + b, 0) + 5, roll.total, "the live faces add up to the total");
  assert.deepEqual(card.flags[MODULE].applied, ["elemental-adept"], "the riders' note and tray preset carry over");
  assert.deepEqual(card.flags[MODULE].empowered, { from: message.id, cost: 1, changes: [
    { roll: 0, term: 0, result: 0, faces: 6, from: 2, to: 3 }, { roll: 0, term: 0, result: 1, faces: 6, from: 2, to: 2 },
    { roll: 0, term: 0, result: 2, faces: 6, from: 3, to: 4 }, { roll: 0, term: 0, result: 7, faces: 6, from: 2, to: 6 },
  ], oldTotal: 35 }, "F1: the card's total before the reroll joins the flag; from / cost / changes unchanged");
  assert.deepEqual(Object.keys(card.flags[MODULE].empowered), ["from", "cost", "changes", "oldTotal"], "the flag's keys: pentaryn-aoe reads `from`");
  assert.equal(card.flags.core, undefined, "only our flags are copied");
  assert.equal(message.flags[MODULE].supersededBy, "newdmg0000000001");
  assert.deepEqual(F.calls.filter(c => c.op === "update").map(c => [c.uuid, c.changes]), [[`ChatMessage.${message.id}`, { [`flags.${MODULE}.supersededBy`]: "newdmg0000000001" }]]);
  assert.deepEqual(F.calls.filter(c => c.op === "notify"), []);
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("F2 Dice So Nice: every client stops DSN throwing an empowered card's whole roll (diceSoNiceMessagePreProcess); the clicking client throws the new faces alone, synchronised, with the card's whisper list and blind flag", async () => {
  const thrown = [];
  F.game.dice3d = { showForRoll: async (...args) => { thrown.push(args); return true; } };
  globalThis.Roll.fromData = data => ({ fromData: JSON.parse(JSON.stringify(data)) });
  const points = font().system.uses.value;
  try {
    const message = damageCard({ id: "dmg0000000000021" });
    message.whisper = ["gmuser0000000001"];
    message.toObject = () => ({ ...JSON.parse(JSON.stringify({ speaker: message.speaker, flavor: message.flavor, system: message.system, flags: message.flags })), whisper: ["gmuser0000000001"], blind: true });
    const el = render(message);
    created.length = 0;
    uniforms.push(0.1, 0.4, 0.9, 0.5);    // the four low dice → 6, 4, 1, 3 (results 7, 2, 1, 0)
    await button(el).click();
    await drain();
    assert.equal(created.length, 1);
    const fresh = F.game.messages.get("newdmg0000000" + String(created.length).padStart(3, "0"));
    assert.equal(thrown.length, 1, "one throw, from the clicking client");
    const [roll, user, sync, whisper, blind, messageId] = thrown[0];
    assert.equal(roll.fromData.formula, "4d6[fire]", "only the four rerolled dice");
    assert.deepEqual(roll.fromData.terms[0].results.map(r => r.result), [3, 1, 4, 6], "raw faces, in roll order (the 1 that min2 reads as 2 is thrown as a 1)");
    assert.deepEqual([user, sync, whisper, blind, messageId], [F.game.user, true, ["gmuser0000000001"], true, fresh.id]);
    // every client's DSN decision for the empowered card: not thrown; any other card is left to DSN
    const decide = id => { const d = { willTrigger3DRoll: true }; F.fire("diceSoNiceMessagePreProcess", id, d); return d.willTrigger3DRoll; };
    assert.equal(decide(fresh.id), false, "the empowered card's whole roll is not animated");
    assert.equal(decide(message.id), true, "the old card: untouched");
    assert.equal(decide("nosuchmessage001"), true);
    await F.game.settings.set(MODULE, "empoweredSpell", false);
    assert.equal(decide(fresh.id), true, "the setting off: DSN as usual");
    await F.game.settings.set(MODULE, "empoweredSpell", true);
    // no Dice So Nice: nothing thrown, nothing warned
    delete F.game.dice3d;
    const other = damageCard({ id: "dmg0000000000022" });
    const el2 = render(other);
    uniforms.push(0.1, 0.4, 0.9, 0.5);
    await button(el2).click();
    await drain();
    assert.equal(thrown.length, 1);
    // a throw that fails is warned, never thrown; the cards stand
    F.game.dice3d = { showForRoll: async () => { throw new Error("no webgl"); } };
    const third = damageCard({ id: "dmg0000000000023" });
    const el3 = render(third);
    uniforms.push(0.1, 0.4, 0.9, 0.5);
    W.take();
    await button(el3).click();
    await drain();
    assert.ok(third.flags[MODULE].supersededBy, "the old card is retired all the same");
    assert.deepEqual(W.take().filter(l => l[0] !== "info").map(l => l.slice(0, 3)), [["warn", `${MODULE} | Dice So Nice: the rerolled dice were not thrown`, "no webgl"]]);
  } finally {
    delete F.game.dice3d;
    delete globalThis.Roll.fromData;
    font().system.uses.value = points;   // the later tests count from here
  }
});

test("the retired card: no apply tray, no button, one line; the new card: the note, no button", () => {
  const old = F.game.messages.get("dmg0000000000020");
  const el = render(old);
  assert.equal(el.querySelector("damage-application"), null, "cannot be applied twice");
  assert.equal(button(el), null);
  assert.equal(el.querySelector(".pr-superseded").textContent, "Superseded by Empowered Spell: apply the new roll below.");
  assert.ok(el.classList.contains("pr-superseded-card"));
  const fresh = F.game.messages.get("newdmg0000000001");
  fresh.isContentVisible = true;
  Object.defineProperty(fresh, "getAssociatedItem", { value: () => mar.items.get(FIREBALL) });
  Object.defineProperty(fresh, "getAssociatedActor", { value: () => mar });
  const el2 = render(fresh);
  assert.equal(el2.querySelector(".pr-empower-note").textContent, "Empowered Spell (1 SP): 2 → 3, 2 → 2, 3 → 4, 2 → 6 (35 → 41)", "F1: the totals before and after");
  assert.equal(button(el2), null, "once per spell");
  assert.ok(el2.querySelector("damage-application"), "the new card is the one to apply");
  assert.deepEqual(W.take(), []);
});

test("F1: the empowered card's rerolled chips stand out (pr-emp-old, then pr-emp-new) in dnd5e's dice tooltip, once per render; the min2 1 that was not rerolled stays plain; a card from before oldTotal shows no totals", () => {
  const fresh = F.game.messages.get("newdmg0000000001");
  const tooltip = faces => `<div class="dice-tooltip"><section class="tooltip-part"><div class="dice"><ol class="dice-rolls">${faces.map(([f, cls]) => `<li class="roll basicdie d6 ${cls}">${f}</li>`).join("")}</ol></div></section></div>`;
  // dnd5e prints each result in term order: the old face (rerolled), then its new one
  const list = [["1", "rerolled min"], ["3", ""], ["2", "rerolled"], ["1", "min"], ["3", "rerolled"], ["4", ""], ["4", ""], ["5", ""], ["6", "max"], ["6", "max"], ["2", "rerolled"], ["6", "max"]];
  const el = W.html(`<li class="chat-message" data-message-id="${fresh.id}"><div class="message-content"><div class="dice-roll">${tooltip(list)}</div><section class="icon-row"></section></div></li>`);
  render(fresh, el);
  render(fresh, el);
  const lis = el.querySelectorAll("li.roll");
  const marks = lis.map(li => (li.classList.contains("pr-emp-old") ? "old" : li.classList.contains("pr-emp-new") ? "new" : "-"));
  assert.deepEqual(marks, ["old", "new", "old", "new", "old", "new", "-", "-", "-", "-", "old", "new"]);
  assert.equal(el.querySelectorAll(".pr-empower-note").length, 1);
  const legacy = damageCard({ id: "dmg0000000000025", flags: { empowered: { from: "dmg0000000000024", cost: 1, changes: [{ roll: 0, term: 0, result: 0, faces: 6, from: 2, to: 5 }] } } });
  assert.equal(render(legacy).querySelector(".pr-empower-note").textContent, "Empowered Spell (1 SP): 2 → 5", "no oldTotal stored: the line as before");
  assert.deepEqual(W.take(), []);
});

test("Shift-click: the picker lists each die with its face, the one-click choice ticked; the player's choice is rerolled (here two dice); Not now rerolls nothing and spends nothing", async () => {
  const message = damageCard({ id: "dmg0000000000030" });
  const el = render(message);
  uses.length = 0;
  created.length = 0;
  W.takeLog();
  W.answer = dialog => {
    const boxes = dialog.form.querySelectorAll("input[type=checkbox]");
    assert.deepEqual(boxes.map(b => [b.getAttribute("name"), b.hasAttribute("checked")]), [["d0", true], ["d1", true], ["d2", true], ["d3", false], ["d4", false], ["d5", false], ["d6", false], ["d7", true]]);
    assert.deepEqual(dialog.form.querySelectorAll("label").map(l => l.textContent.trim()), ["d6: 2", "d6: 2", "d6: 3", "d6: 4", "d6: 5", "d6: 6", "d6: 6", "d6: 2"]);
    assert.equal(dialog.element.querySelector(".pr-emp-total").textContent, "4 of 5 dice");
    return { d0: 0, d1: 0 };   // untick two: results 2 and 7 stay ticked
  };
  uniforms.push(0.1, 0.1);
  await button(el).fire("click", { shiftKey: true });
  await drain();
  assert.deepEqual(W.takeLog().filter(l => l.op === "DialogV2.wait").map(l => [l.title, l.buttons]), [["Empowered Spell", [["ok", "Reroll", true], ["cancel", "Not now", false]]]]);
  assert.equal(uses.length, 1);
  assert.deepEqual(created[0].flags[MODULE].empowered.changes.map(c => [c.result, c.from, c.to]), [[2, 3, 6], [7, 2, 6]]);
  assert.equal(JSON.parse(created[0].rolls[0]).total, 35 + 3 + 4);
  assert.equal(font().system.uses.value, 2);

  const other = damageCard({ id: "dmg0000000000031" });
  const el2 = render(other);
  W.answer = () => "cancel";
  uses.length = 0;
  created.length = 0;
  await button(el2).fire("click", { shiftKey: true });
  await drain();
  assert.deepEqual([uses.length, created.length, other.flags[MODULE].supersededBy], [0, 0, undefined]);
  assert.equal(font().system.uses.value, 2);
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("one die below its average: a plain click rerolls just that die, no dialog; with every die at or above average the button is not drawn at all", async () => {
  const one = damageCard({ id: "dmg0000000000040", rolls: [{ class: "DamageRoll", formula: "3d6", total: 13, evaluated: true, terms: [die(6, [3, 4, 6])] }] });
  const el = render(one);
  assert.ok(button(el));
  uses.length = 0;
  created.length = 0;
  W.takeLog();
  W.answer = () => { throw new Error("no dialog may open"); };
  uniforms.push(0.1);
  await button(el).click();
  await drain();
  assert.equal(W.takeLog().filter(l => l.op === "DialogV2.wait").length, 0, "a plain click never opens the picker");
  assert.deepEqual(created[0].flags[MODULE].empowered.changes.map(c => [c.from, c.to]), [[3, 6]]);
  assert.equal(JSON.parse(created[0].rolls[0]).total, 16);
  assert.equal(uses.length, 1);
  const high = damageCard({ id: "dmg0000000000041", rolls: [{ class: "DamageRoll", formula: "3d6", total: 15, evaluated: true, terms: [die(6, [4, 5, 6])] }] });
  assert.equal(button(render(high)), null, "nothing one click could do: no button, no picker");
  W.answer = undefined;
  assert.deepEqual(W.take().filter(l => l[0] !== "info"), []);
});

test("the activity refuses (no Sorcery Points left when clicked): one warning, nothing rerolled, nothing posted, the card untouched", async () => {
  const message = damageCard({ id: "dmg0000000000050" });
  const el = render(message);
  font().system.uses.value = 0;
  // the card was drawn with points: the click re-reads them and still asks the activity, which refuses
  const card = (await import("../empower.mjs")).empowerCard(message);
  assert.equal(card, null, "re-read: no points");
  font().system.uses.value = 1;
  empAct.use = async () => undefined;
  uses.length = 0;
  created.length = 0;
  F.calls.length = 0;
  await button(el).click();
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["warn", "Empowered Spell was not used (no Sorcery Points left?). Nothing was rerolled."]]);
  assert.deepEqual([created.length, message.flags[MODULE].supersededBy], [0, undefined]);
  empAct.use = async (...args) => { uses.push(args.map(a => JSON.parse(JSON.stringify(a ?? null)))); font().system.uses.value -= 1; return { updates: [] }; };
  font().system.uses.value = 4;
  assert.deepEqual(W.take(), [["warn", `${MODULE} | Empowered Spell was not used (no Sorcery Points left?). Nothing was rerolled.`]], "log.notify's console twin");
});

test("applied means done: the tray's dnd5e.applyDamage (the card as options.origin) marks the card once, on a client that can edit it; the button then goes", async () => {
  const message = damageCard({ id: "dmg0000000000060" });
  assert.ok(button(render(message)));
  F.calls.length = 0;
  F.fire("dnd5e.applyDamage", bazgar, 12, { origin: message, isDelta: true });
  F.fire("dnd5e.applyDamage", bazgar, 12, { origin: message, isDelta: true });   // a second target: no second write
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "update").map(c => c.changes), [{ [`flags.${MODULE}.trayApplied`]: true }]);
  assert.equal(message.flags[MODULE].trayApplied, true);
  assert.equal(button(render(message)), null);
  // a card applied at 0 Sorcery Points is marked all the same: the button must not appear once Font of Magic brings points back
  font().system.uses.value = 0;
  const broke = damageCard({ id: "dmg0000000000063" });
  assert.equal(button(render(broke)), null, "no points: no button");
  F.calls.length = 0;
  F.fire("dnd5e.applyDamage", bazgar, 9, { origin: broke });
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "update").map(c => c.changes), [{ [`flags.${MODULE}.trayApplied`]: true }], "marked by the feat alone");
  font().system.uses.value = 4;
  assert.equal(button(render(broke)), null, "points back: still no button");
  // left alone: a weapon's card, a card this user cannot edit, an already-marked card, no origin
  const dagger = damageCard({ id: "dmg0000000000061", item: mar.items.get("dagger0000000001") });
  const theirs = damageCard({ id: "dmg0000000000062", isAuthor: false });
  F.calls.length = 0;
  F.fire("dnd5e.applyDamage", bazgar, 3, { origin: dagger });
  F.become({ userId: IDS.player });
  try { F.fire("dnd5e.applyDamage", bazgar, 3, { origin: theirs }); } finally { F.become({ userId: IDS.gm }); }
  F.fire("dnd5e.applyDamage", bazgar, 3, { origin: message });
  F.fire("dnd5e.applyDamage", bazgar, 3, {});
  F.fire("dnd5e.applyDamage", bazgar, 3);
  await drain();
  assert.deepEqual(F.calls.filter(c => c.op === "update"), []);
  assert.deepEqual(W.take(), []);
});

test("after the point is spent: a new card that fails to post is one warning naming the lost point, the old card stays live; an old card that fails to retire gets its own line, the new card stands", async () => {
  const message = damageCard({ id: "dmg0000000000090" });
  const el = render(message);
  const good = globalThis.ChatMessage.create;
  globalThis.ChatMessage.create = async () => { throw new Error("db down"); };
  uses.length = 0;
  F.calls.length = 0;
  W.take();
  try {
    await button(el).click();
    await drain();
  } finally { globalThis.ChatMessage.create = good; }
  assert.equal(uses.length, 1, "the point went");
  const lost = "Empowered Spell: the Sorcery Point was spent but the new damage card could not be posted. The old card stays live; tell the GM.";
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["warn", lost]]);
  assert.equal(message.flags[MODULE].supersededBy, undefined);
  assert.ok(button(render(message)), "still live");
  assert.deepEqual(W.take().map(l => l.slice(0, 2)), [["warn", `${MODULE} | ${lost}`], ["warn", `${MODULE} | Empowered Spell: the Sorcery Point was spent but the new card was not posted`]]);

  const second = damageCard({ id: "dmg0000000000091" });
  const el2 = render(second);
  second.update = async () => { throw new Error("locked"); };
  uses.length = 0;
  created.length = 0;
  F.calls.length = 0;
  await button(el2).click();
  await drain();
  assert.equal(created.length, 1, "the new card is posted");
  const stuck = "Empowered Spell: the new damage card is posted, but the old card could not be marked as superseded. Apply only the new one.";
  assert.deepEqual(F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]), [["warn", stuck]]);
  assert.deepEqual(W.take().map(l => l[1]), [`${MODULE} | ${stuck}`, `${MODULE} | Empowered Spell: the new card is posted but the old card was not retired`]);
});

test("a broken card root or origin is warned, never thrown; non-damage roots are left alone", () => {
  W.take();
  F.fire("dnd5e.renderChatMessage", damageCard({ id: "dmg0000000000070" }), { querySelector: () => { throw new Error("detached"); } });
  F.fire("dnd5e.applyDamage", bazgar, 1, { get origin() { throw new Error("odd origin"); } });
  const lines = W.take().filter(l => /Empower|applied damage/.test(l[1])).map(l => l.slice(0, 3));
  assert.deepEqual(lines, [["warn", `${MODULE} | Empower button skipped`, "detached"], ["warn", `${MODULE} | applied damage check skipped`, "odd origin"]]);
  const usage = W.html(`<li class="chat-message"><div class="message-content"><div class="card-buttons"></div></div></li>`);
  F.fire("dnd5e.renderChatMessage", { type: "usage", flags: {} }, usage);
  assert.equal(usage.querySelector(".pr-empower"), null);
});

test("uninstall removes the drawn buttons from the page; flags and notes stay", async () => {
  const message = damageCard({ id: "dmg0000000000080" });
  const el = render(message);
  document.body.append(el);
  assert.equal(document.querySelectorAll(".pr-empower").length, 1);
  const empower = await import("../empower.mjs");
  empower.uninstall();
  assert.equal(document.querySelectorAll(".pr-empower").length, 0);
  assert.ok(el.querySelector(".pentaryn-riders-note"), "other content stays");
  el.remove();
  globalThis.ChatMessage.create = realCreate;
});
