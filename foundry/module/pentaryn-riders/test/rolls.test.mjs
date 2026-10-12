// B1/B2 on a client: dnd5e.postDamageRollConfiguration edits the real roll terms (golden/rolls.json
// pins each case's formulas, resets and the message flag), dnd5e.renderChatMessage turns the flag
// into the card note, and dnd5e.preCalculateDamage seeds the damage tray's resistance preset.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { FakeElement } from "./fixtures/dom.mjs";
import { IDS, MODULE, makeActor, roll, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const sorc = W.actor(IDS.sorc), druid = W.actor(IDS.druid), healer = W.actor(IDS.healer), npc = W.actor(IDS.npc);
const PRESET = Symbol.for(`${MODULE}.resistancePreset`);
const act = (actor, itemId) => actor.items.get(itemId).system.activities.contents[0];

/** Fire the hook as dnd5e does; return what changed. */
function configure(activity, formulas, { message = { data: {} }, event } = {}) {
  const rolls = formulas.map(([f, type]) => roll(f, { type }));
  F.fire("dnd5e.postDamageRollConfiguration", rolls, { subject: activity, event }, {}, message);
  return { formulas: rolls.map(r => r.formula), resets: rolls.map(r => r.resets), flag: message.data?.flags?.[MODULE] ?? null };
}

const cases = {};

test("Elemental Adept (fire) on Fireball: min2 on the fire dice, resistance preset; the untyped Affinity warns", () => {
  W.take();
  cases.adeptOnly = configure(act(sorc, "fireball00000001"), [["8d6[fire]", "fire"]]);
  assert.deepEqual(cases.adeptOnly.formulas, ["8d6min2[fire]"]);
  assert.deepEqual(W.take(), [["warn", `${MODULE} | elemental-affinity on Ilsa Vantrel has no damage type set — game.pentaryn.riders.setType(actor, "fire")`]]);
});

test("with Affinity typed fire: + CHA once, typed by the roll; other-typed dice untouched", async () => {
  await api.setType(sorc.items.get("elaffin000000001"), "fire");
  cases.both = configure(act(sorc, "fireball00000001"), [["8d6[fire]", "fire"]]);
  assert.deepEqual(cases.both.formulas, ["8d6min2[fire] + 4[Elemental Affinity]"]);
  cases.mixed = configure(act(sorc, "fireball00000001"), [["2d8 + 1d6[fire]", "cold"], ["3d6", "fire"]]);
  cases.otherRoll = configure(act(sorc, "fireball00000001"), [["2d8", "cold"], ["1d4[fire]", "cold"]]);
});

test("once per casting: an attack from a card whose earlier damage already took Affinity gets no second +CHA", async () => {
  const ray = act(sorc, "scorch0000000001");
  F.game.messages.set("dmgmsg0000000001", { id: "dmgmsg0000000001", _source: { system: { origin: "usecard000000001" } }, flags: { [MODULE]: { applied: ["elemental-affinity", "elemental-adept"] } } });
  F.game.messages.set("dmgmsg0000000002", { id: "dmgmsg0000000002", _source: { system: { origin: "othercard0000001" } }, flags: { [MODULE]: { applied: ["elemental-affinity"] } } });
  cases.secondRay = configure(ray, [["2d6[fire]", "fire"]], { message: { data: { system: { origin: "usecard000000001" } } } });
  cases.flatOrigin = configure(ray, [["2d6[fire]", "fire"]], { message: { data: { "system.origin": { id: "usecard000000001" } } } });
  const card = new FakeElement("li");
  card.setAttribute("data-message-id", "usecard000000001");
  const button = new FakeElement("button");
  card.append(button);
  cases.clickedCard = configure(ray, [["2d6[fire]", "fire"]], { event: { target: button } });
  cases.firstRay = configure(ray, [["2d6[fire]", "fire"]], { message: { data: { system: { origin: "freshcard0000001" } } } });
  assert.deepEqual(cases.secondRay.formulas, ["2d6min2[fire]"]);
  assert.deepEqual(cases.firstRay.formulas, ["2d6min2[fire] + 4[Elemental Affinity]"]);
  F.game.messages.delete("dmgmsg0000000001");
  F.game.messages.delete("dmgmsg0000000002");
});

test("Potent Spellcasting (druid): + WIS on a druid cantrip, not when the formula already adds it", () => {
  cases.potent = configure(act(druid, "prodflame0000001"), [["1d8[fire]", "fire"]]);
  cases.handAdded = configure(act(druid, "thornwhip0000001"), [["1d6[piercing] + 3", "piercing"]]);
  assert.deepEqual(cases.potent.formulas, ["1d8[fire] + 3[Potent Spellcasting]"]);
  assert.deepEqual(cases.handAdded.formulas, ["1d6[piercing] + 3"]);
});

test("Healer: 1s rerolled on spell healing dice, not on temp HP", () => {
  cases.heal = configure(act(healer, "curewounds000001"), [["2d8 + 2", "healing"]]);
  cases.temp = configure(act(healer, "curewounds000001"), [["1d4 + 4", "temphp"]]);
  assert.deepEqual(cases.heal.formulas, ["2d8r1 + 2"]);
  assert.equal(cases.temp.flag, null);
});

test("nothing applies: a weapon, no rolls, no item, no features, the setting off", async () => {
  cases.weapon = configure(act(sorc, "longsword0000001"), [["1d8[slashing]", "slashing"]]);
  const before = { data: {} };
  F.fire("dnd5e.postDamageRollConfiguration", [], { subject: act(sorc, "fireball00000001") }, {}, before);
  F.fire("dnd5e.postDamageRollConfiguration", [roll("1d6", { type: "fire" })], { subject: { type: "damage" } }, {}, before);
  F.fire("dnd5e.postDamageRollConfiguration", [roll("1d6", { type: "fire" })], null, {}, before);
  cases.noFeatures = configure(act(W.actor(IDS.wiz), "magicmissile0001"), [["3d4 + 3", "force"]]);
  await F.game.settings.set(MODULE, "enabled", false);
  cases.off = configure(act(sorc, "fireball00000001"), [["8d6[fire]", "fire"]]);
  await F.game.settings.set(MODULE, "enabled", true);
  assert.deepEqual(before, { data: {} });
  for (const k of ["weapon", "noFeatures", "off"]) assert.equal(cases[k].flag, null, k);
});

test("a negative ability modifier is subtracted", () => {
  const glum = makeActor({ name: "Glum", system: { abilities: { cha: { mod: -1 } } }, items: [
    { name: "Elemental Affinity (Cold)", type: "feat", system: {} },
    { id: "glumray000000001", name: "Ray of Frost", type: "spell", system: { level: 0 }, activities: [{ id: "glumatk000000001", type: "attack", name: "" }] },
  ] });
  cases.negative = configure(act(glum, "glumray000000001"), [["1d8[cold]", "cold"]]);
  assert.deepEqual(cases.negative.formulas, ["1d8[cold] - 1[Elemental Affinity]"]);
});

test("a throw while planning is warned as 'riders skipped' and leaves the rolls alone", () => {
  W.take();
  F.fire("dnd5e.postDamageRollConfiguration", [{ options: { type: "fire" } }], { subject: act(sorc, "fireball00000001") }, {}, { data: {} });
  assert.deepEqual(W.take().map(l => l.slice(0, 2)), [["warn", `${MODULE} | riders skipped`]]);
});

test("golden/rolls.json: every case's formulas, resets and message flag", () => {
  pinJSON("rolls", cases, import.meta.url);
});

/* ── the card note ────────────────────────────────────────────────────────── */

const card = (inner = `<section class="icon-row"></section><div class="dice-roll"></div>`) =>
  W.html(`<li class="chat-message"><div class="message-content">${inner}</div></li>`);
const dmgMessage = (flag, o = {}) => ({ type: "damage", isContentVisible: true, flags: { [MODULE]: flag }, rolls: [], system: {}, ...o });

test("card note: one line under the dice row, rebuilt on every render; bonus, min, reroll and label parts", () => {
  const el = card();
  const flag = cases.both.flag;
  F.fire("dnd5e.renderChatMessage", dmgMessage(flag), el);
  F.fire("dnd5e.renderChatMessage", dmgMessage(flag), el);
  assert.equal(el.querySelectorAll(".pentaryn-riders-note").length, 1);
  assert.equal(el.querySelector(".message-content").innerHTML,
    `<section class="icon-row"></section><p class="supplement pentaryn-riders-note">Elemental Adept: 1s count as 2 · Elemental Affinity +4</p><div class="dice-roll"></div>`);
  const heal = card(`<div class="dice-roll"></div>`);
  F.fire("dnd5e.renderChatMessage", dmgMessage({ applied: ["healer", "potent-spellcasting-druid", "nope"], detail: { healer: { modifier: "r1" } } }, { type: "healing" }), heal);
  assert.equal(heal.querySelector(".message-content").innerHTML,
    `<div class="dice-roll"></div><p class="supplement pentaryn-riders-note">Healer: 1s rerolled · Potent Spellcasting</p>`);
  const bare = W.html(`<div><span></span></div>`);
  F.fire("dnd5e.renderChatMessage", dmgMessage({ applied: ["elemental-affinity"], detail: { "elemental-affinity": { bonus: -2 } } }), bare);
  assert.equal(bare.innerHTML, `<span></span><p class="supplement pentaryn-riders-note">Elemental Affinity -2</p>`);
});

test("card note: removed and not redrawn when private, not a damage/healing card, or nothing applied", () => {
  const el = card();
  F.fire("dnd5e.renderChatMessage", dmgMessage(cases.both.flag), el);
  F.fire("dnd5e.renderChatMessage", dmgMessage(cases.both.flag, { isContentVisible: false }), el);
  assert.equal(el.querySelector(".pentaryn-riders-note"), null);
  for (const m of [dmgMessage(cases.both.flag, { type: "usage" }), dmgMessage({ applied: [] }), dmgMessage({ applied: ["nope"] }), { flags: {} }]) {
    F.fire("dnd5e.renderChatMessage", m, el);
    assert.equal(el.querySelector(".pentaryn-riders-note"), null);
  }
  W.take();
  F.fire("dnd5e.renderChatMessage", dmgMessage(cases.both.flag), { querySelector: () => { throw new Error("detached"); } });
  F.fire("dnd5e.renderChatMessage", dmgMessage(cases.both.flag), null);
  assert.deepEqual(W.take().map(l => l.slice(0, 2)), [["warn", `${MODULE} | card note skipped`]]);
});

/* ── the damage tray preset ──────────────────────────────────────────────── */

const dmgMsg = (id = "dmgcard000000001", types = ["fire"]) => ({ id, flags: { [MODULE]: { ignoreResistance: types } } });
npc.system.traits = { dr: { value: new Set(["fire", "cold"]) } };

function mountTray(messageId, optionValues) {
  const wrap = W.html(`<li data-message-id="${messageId}"><damage-application></damage-application></li>`);
  const tray = wrap.querySelector("damage-application");
  const per = new Map();
  tray.asked = [];
  tray.getTargetOptions = uuid => { tray.asked.push(uuid); if (!per.has(uuid)) per.set(uuid, {}); return per.get(uuid); };
  tray.targetList = W.html(`<select>${optionValues.map(v => `<option value="${v}"></option>`).join("")}<option value=""></option></select>`);
  W.dom.body.append(wrap);
  return { wrap, tray, per };
}

test("tray preset without a tray in the DOM: only this calculation's copy is seeded, once", () => {
  const options = { originatingMessage: dmgMsg() };
  F.fire("dnd5e.preCalculateDamage", npc, [], options);
  assert.equal(options[PRESET], true);
  assert.deepEqual([...options.ignore.resistance], ["fire"]);
  options.ignore.resistance.clear();
  F.fire("dnd5e.preCalculateDamage", npc, [], options);
  assert.deepEqual([...options.ignore.resistance], [], "already preset: the GM's choice stands");
});

test("tray preset with the tray: the tray's own per-target object is seeded with the marker; a later copy carries it", () => {
  const { wrap, tray, per } = mountTray("dmgcard000000002", [`Actor.${IDS.npc}`, `Actor.${IDS.druid}`, "Actor.missing000000001"]);
  npc.tokens = [{ uuid: "Scene.none.Token.none" }];
  const copy1 = { originatingMessage: dmgMsg("dmgcard000000002"), ignore: { resistance: new Set(["acid"]) } };
  F.fire("dnd5e.preCalculateDamage", npc, [], copy1);
  assert.deepEqual(tray.asked, [`Actor.${IDS.npc}`]);
  const persistent = per.get(`Actor.${IDS.npc}`);
  assert.equal(persistent[PRESET], true);
  assert.deepEqual([...persistent.ignore.resistance], ["fire"]);
  assert.deepEqual([...copy1.ignore.resistance], ["acid", "fire"]);
  // the GM switches it back; the next calculation copies the persistent object (with the marker)
  persistent.ignore.resistance.clear();
  const copy2 = { ...persistent, originatingMessage: dmgMsg("dmgcard000000002") };
  F.fire("dnd5e.preCalculateDamage", npc, [], copy2);
  assert.deepEqual([...persistent.ignore.resistance], []);
  // a fresh copy without the marker: the persistent one is already seeded, so only the copy changes
  const copy3 = { originatingMessage: dmgMsg("dmgcard000000002") };
  F.fire("dnd5e.preCalculateDamage", npc, [], copy3);
  assert.deepEqual([...persistent.ignore.resistance], []);
  assert.deepEqual([...copy3.ignore.resistance], ["fire"]);
  wrap.remove();
  npc.tokens = [];
});

test("tray preset: no resistance to the type → marked but nothing ignored; ignore-all kept; no flag / setting off → untouched", async () => {
  const druidOpts = { originatingMessage: dmgMsg() };
  F.fire("dnd5e.preCalculateDamage", druid, [], druidOpts);
  assert.deepEqual(druidOpts, { originatingMessage: dmgMsg(), [PRESET]: true });
  const all = { originatingMessage: dmgMsg(), ignore: true };
  F.fire("dnd5e.preCalculateDamage", npc, [], all);
  assert.equal(all.ignore, true);
  const resAll = { originatingMessage: dmgMsg(), ignore: { resistance: true } };
  F.fire("dnd5e.preCalculateDamage", npc, [], resAll);
  assert.equal(resAll.ignore.resistance, true);
  const none = { originatingMessage: { id: "x", flags: {} } };
  F.fire("dnd5e.preCalculateDamage", npc, [], none);
  assert.equal(none[PRESET], undefined);
  F.fire("dnd5e.preCalculateDamage", npc, [], undefined);
  await F.game.settings.set(MODULE, "enabled", false);
  const off = { originatingMessage: dmgMsg() };
  F.fire("dnd5e.preCalculateDamage", npc, [], off);
  assert.equal(off[PRESET], undefined);
  await F.game.settings.set(MODULE, "enabled", true);
  W.take();
  F.fire("dnd5e.preCalculateDamage", { system: { traits: { dr: { get value() { throw new Error("bad dr"); } } } } }, [], { originatingMessage: dmgMsg() });
  assert.deepEqual(W.take(), [["warn", `${MODULE} | resistance preset skipped`, "bad dr"]]);
});

test("tray preset: a token actor's own token uuid is a candidate; a token of another actor is not", () => {
  const { wrap, tray } = mountTray("dmgcard000000003", []);
  const synthetic = makeActor({ name: "Synthetic", system: { traits: { dr: { value: new Set(["fire"]) } } } });
  synthetic.isToken = true;
  synthetic.token = { uuid: "Scene.s1.Token.t1" };
  const real = globalThis.fromUuidSync;
  globalThis.fromUuidSync = uuid => (uuid === "Scene.s1.Token.t1" ? { actor: synthetic } : real(uuid));
  F.fire("dnd5e.preCalculateDamage", synthetic, [], { originatingMessage: dmgMsg("dmgcard000000003") });
  globalThis.fromUuidSync = real;
  assert.deepEqual(tray.asked, ["Scene.s1.Token.t1"]);
  wrap.remove();
});
