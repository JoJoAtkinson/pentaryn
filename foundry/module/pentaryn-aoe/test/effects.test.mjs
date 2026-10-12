// Part D: a usage card's one effect lands on the caster when the caster is who it is for; the
// card says so; an Effects tray with unapplied effects lights up; the same spell does not stack.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, out, lines, MODULE, GM_ID, PLAYER_ID } from "./fixtures/world.mjs";
import { root, el, dispatch } from "./fixtures/dom.mjs";
import { seams } from "./fixtures/seams.mjs";

const { F, W } = await boot({ entry: true });
const S = await seams();
const E = S.effects;
const ops = (...names) => F.calls.filter(c => names.includes(c.op));
const reset = () => { F.calls.length = 0; out.length = 0; };

const scene = W.scene({ id: "EffScene00000001" });
const caven = W.actor({ id: "actCavenEff00001", name: "Caven", type: "character", ownership: { default: 0, [PLAYER_ID]: 3 } });
const ally = W.actor({ id: "actAllyEff000001", name: "Ally", type: "character" });
const cavTok = W.token(scene, { id: "tokCavenEff00001", name: "Cav", actorId: caven.id, actor: caven });
const spell = W.item({ id: "itemMageArmor001", name: "Mage Armor", system: { identifier: "mage-armor" } }, caven);
const shield = W.item({ id: "itemShield000001", name: "Shield", system: { identifier: "shield" } }, caven);
const fx = (item, id, name, type = "base") => {
  const e = W.effect(null, { id, name, type });
  Object.defineProperty(e, "parent", { value: item });
  W.register(e.uuid, e);
  return e;
};
const armorFx = fx(spell, "effMageArmor0001", "Mage Armor");
const shieldFx = fx(shield, "effShield0000001", "Shield");

let fetches = 0;
function card({ effects = [armorFx], targets = [], affects = "creature", type = "utility", range = "touch", item = spell, timestamp = Date.now(), author = PLAYER_ID, flags = {}, id } = {}) {
  return W.message({
    ...(id ? { id } : {}), type: "usage", author, timestamp, flags, speaker: { alias: "Cav" },
    system: { effects: effects.map(e => e.uuid), targets, activity: { type }, getEffects: async () => { fetches++; return [...effects, null]; } },
    actor: caven, item, activity: { type, target: { affects: { type: affects } }, range: { units: range } },
  });
}
/** Copies earlier tests applied to Caven (pendingFor counts them as applied). */
const clearCopies = () => { for (const e of caven.effects.contents) caven.effects.delete(e.id); };
const selfTarget = [{ token: cavTok.uuid, actor: caven.uuid }];

/* ── reading a card ─────────────────────────────────────────────────────────────────────────── */

test("cardEffects: a usage card's effects, enchantments and blanks dropped; [] otherwise", async () => {
  const ench = fx(spell, "effEnchant000001", "Glow", "enchantment");
  assert.deepEqual((await E.cardEffects(card({ effects: [armorFx, ench] }))).map(e => e.id), [armorFx.id]);
  assert.deepEqual(await E.cardEffects(W.message({ type: "damage" })), []);
  assert.deepEqual(await E.cardEffects(W.message({ type: "usage", system: { effects: [] } })), []);
  assert.deepEqual(await E.cardEffects(null), []);
});

test("-5 targetActors: token's actor, else the recorded actor (no legacy uuid); targetActorUuid per target", () => {
  const reg = {
    T1: { actor: { uuid: "Actor.a1", effects: [] } }, "Actor.a2": { uuid: "Actor.a2", effects: [] }, "Actor.a3": { uuid: "Actor.a3", effects: [] },
  };
  for (const [k, v] of Object.entries(reg)) W.register(k, v);
  const targets = [{ token: "T1", actor: "Actor.x" }, { actor: "Actor.a2" }, { uuid: "Actor.a3" }, { token: "gone", actor: "Actor.a2" }];
  assert.deepEqual(E.targetActors({ system: { targets } }).map(a => a.uuid), ["Actor.a1", "Actor.a2", "Actor.a2"]);
  assert.deepEqual(targets.map(E.targetActorUuid), ["Actor.a1", "Actor.a2", null, "Actor.a2"]);
  assert.deepEqual(E.targetActors({ system: {} }), []);
});

test("-14 pendingFor: ['e1'] with one fetch; an old card → [] with no fetch; recorded or copied on every target → []", async () => {
  fetches = 0;
  const m = card();
  assert.deepEqual(await E.pendingFor(m), [armorFx.id]);
  assert.equal(fetches, 1);
  const old = card({ timestamp: Date.now() - 2 * 60 * 60 * 1000 });
  assert.deepEqual(await E.pendingFor(old), []);
  assert.equal(fetches, 1);
  const recorded = card({ flags: { [MODULE]: { effectsApplied: { ids: [armorFx.id] } } } });
  assert.deepEqual(await E.pendingFor(recorded), []);
  const copied = card({ targets: selfTarget });
  const copy = W.effect(caven, { name: "Mage Armor", _stats: { duplicateSource: armorFx.uuid } });
  assert.deepEqual(await E.pendingFor(copied), []);
  copy.disabled = true;
  assert.deepEqual(await E.pendingFor(copied), [armorFx.id], "a disabled copy does not count");
  caven.effects.delete(copy.id);
  assert.deepEqual(await E.pendingFor(card({ effects: [] })), []);
});

test("cardEffects and pendingFor accept a message id (ChatMessage|id)", async () => {
  const c = card({ effects: [armorFx], id: "msgByIdCard00001" });
  assert.deepEqual((await E.cardEffects(c)).map(e => e.id), [armorFx.id]);
  assert.deepEqual((await E.cardEffects(c.id)).map(e => e.id), [armorFx.id]);
  assert.deepEqual(await E.pendingFor(c.id), [armorFx.id]);
  assert.deepEqual(await E.cardEffects("noSuchMessage000"), []);
  assert.deepEqual(await E.pendingFor("noSuchMessage000"), []);
});

/* ── self-apply ──────────────────────────────────────────────────────────────────────────────── */

test("selfReason over the card shapes (golden/self-reason.json)", async () => {
  const rows = {};
  const shapes = {
    targetedSelf: card({ targets: selfTarget }),
    selfOnly: card({ effects: [shieldFx], item: shield, affects: "self", targets: [{ actor: ally.uuid }] }),
    untargetedTouch: card(),
    untargetedRanged: card({ range: "ft" }),
    targetedAlly: card({ targets: [{ actor: ally.uuid }] }),
    saveActivity: card({ type: "save", targets: selfTarget }),
    twoEffects: card({ effects: [armorFx, shieldFx], targets: selfTarget }),
    noCaster: Object.assign(card(), {}),
  };
  Object.defineProperty(shapes.noCaster, "getAssociatedActor", { value: () => null });
  for (const [k, m] of Object.entries(shapes)) rows[k] = await E.selfReason(m);
  pinJSON("self-reason", rows, import.meta.url);
  await game.settings.set(MODULE, "untargetedSelf", false);
  assert.equal(await E.selfReason(card()), null);
  await game.settings.set(MODULE, "untargetedSelf", true);
});

test("createChatMessage on the active GM: Mage Armor on yourself goes on, recorded, once (golden/self-apply.json)", async () => {
  reset();
  const m = card({ targets: selfTarget });
  F.fire("createChatMessage", m, {}, PLAYER_ID);
  await advance(800);
  await flush(8);
  pinJSON("self-apply", { calls: ops("_prepareEffectData", "create", "update"), flag: m.flags[MODULE].effectsApplied }, import.meta.url);
  assert.equal(m.flags[MODULE].effectsApplied.auto, true);
  reset();
  F.fire("createChatMessage", m, {}, PLAYER_ID);
  await advance(800);
  assert.deepEqual(ops("create"), [], "a recorded card is skipped");
});

test("selfApply: an unidentified item is named by itself, not its effect; the token alias names the caster", async () => {
  const potion = W.item({ id: "itemPotion000001", name: "Murky potion", type: "consumable", system: { identified: false } }, caven);
  const m = card({ targets: selfTarget, item: potion });
  const r = await E.selfApply(m, { force: true });
  assert.deepEqual(r, { reason: "targeted-self", actor: caven.uuid, effects: [armorFx.id] });
  assert.deepEqual([m.flags[MODULE].effectsApplied.names, m.flags[MODULE].effectsApplied.actorName], [["Murky potion"], "Cav"]);
});

test("selfApply → null: setting off (unless forced), no effects, no reason, not owner and not GM, in flight, lost claim", async () => {
  await game.settings.set(MODULE, "autoApplySelf", false);
  assert.equal(await E.selfApply(card({ targets: selfTarget })), null);
  await game.settings.set(MODULE, "autoApplySelf", true);
  assert.equal(await E.selfApply(null), null);
  assert.equal(await E.selfApply(card({ effects: [] })), null);
  assert.equal(await E.selfApply(card({ targets: [{ actor: ally.uuid }] })), null);
  F.become({ userId: PLAYER_ID });
  const notMine = card({ targets: selfTarget });
  caven.ownership = { default: 0 };
  assert.equal(await E.selfApply(notMine), null);
  caven.ownership = { default: 0, [PLAYER_ID]: 3 };
  F.become({ userId: GM_ID });
  const busy = card({ targets: selfTarget });
  E.inflight.add(busy.id);
  assert.equal(await E.selfApply(busy), null);
  E.inflight.delete(busy.id);
  const lost = card({ targets: selfTarget });
  const p = E.selfApply(lost);
  await flush();
  lost.flags[MODULE].claims.selfApply = "another-socket";
  await advance(800);
  assert.equal(await p, null);
});

test("selfApply: one effect failing is warned 'pentaryn-aoe | self-apply X → Y'; none applied → null", async () => {
  const cls = F.elements.get("effect-application");
  F.elements.delete("effect-application");
  reset();
  assert.equal(await E.selfApply(card({ targets: selfTarget }), { force: true }), null);
  assert.deepEqual(lines(), [`warn: ${MODULE} | self-apply Mage Armor → Caven`]);
  F.elements.set("effect-application", cls);
});

test("an existing copy from the same source is refreshed (update), not duplicated", async () => {
  clearCopies();
  const copy = W.effect(caven, { name: "Mage Armor", disabled: true, _stats: { duplicateSource: armorFx.uuid } });
  reset();
  await E.selfApply(card({ targets: selfTarget }), { force: true });
  assert.deepEqual(ops("update").filter(c => c.documentName === "ActiveEffect").map(c => [c.uuid, c.changes]), [[copy.uuid, { _id: copy.id, disabled: false }]]);
  caven.effects.delete(copy.id);
});

test("isApplier: the active GM if there is one, else the card's author", () => {
  assert.equal(E.isApplier(PLAYER_ID), true);
  F.become({ userId: PLAYER_ID });
  assert.equal(E.isApplier(PLAYER_ID), false);
  game.users.get(GM_ID).active = false;
  assert.equal(E.isApplier(PLAYER_ID), true);
  assert.equal(E.isApplier(GM_ID), false);
  game.users.get(GM_ID).active = true;
  F.become({ userId: GM_ID });
});

test("markApplied: always local; written to the message only when this user may", async () => {
  const m = card();
  m._deny = ["update"];
  F.become({ userId: PLAYER_ID });
  m.ownership = { default: 0 };
  reset();
  await E.markApplied(m, ["x1"]);
  assert.deepEqual(ops("update"), []);
  assert.deepEqual([...E.localApplied.get(m.id)], ["x1"]);
  assert.deepEqual(E.appliedIds(m), ["x1"]);
  F.become({ userId: GM_ID });
  m._deny = [];
  await E.markApplied(m, ["x2"], { by: "tray" });
  assert.deepEqual(m.flags[MODULE].effectsApplied, { by: "tray", ids: ["x2"] });
});

/* ── the card ────────────────────────────────────────────────────────────────────────────────── */

const TRAY = `<div class="chat-card">c</div><effect-application><ul><li class="effect" data-uuid="u" data-id="effMageArmor0001"><button aria-pressed="true">Mage Armor</button></li></ul><button class="apply-button">Apply</button></effect-application>`;

test("the card shows 'Applied to …' once an auto apply is recorded (golden/applied-line.json)", () => {
  const m = card({ flags: { [MODULE]: { effectsApplied: { auto: true, actorName: "Cav <b>", names: ["Mage Armor", "Fly"] } } } });
  const host = root(TRAY);
  F.fire("dnd5e.renderChatMessage", m, host);
  F.fire("dnd5e.renderChatMessage", m, host);
  assert.equal(host.querySelectorAll(".pentaryn-aoe-applied").length, 1);
  pinJSON("applied-line", host.querySelector(".pentaryn-aoe-applied").outerHTML, import.meta.url);
});

test("a tray with unapplied effects lights up; a settled or applied card does not", async () => {
  const lit = root(TRAY);
  F.fire("dnd5e.renderChatMessage", card({ targets: [{ actor: ally.uuid }] }), lit);
  await flush(8);
  const tray = lit.querySelector("effect-application");
  assert.deepEqual([tray.className, tray.dataset.pentarynAoe, tray.style.props["--pentaryn-aoe-unapplied"]], ["pentaryn-aoe-unapplied", "1", JSON.stringify(game.i18n.localize("PENTARYN_AOE.Effects.Unapplied"))]);
  const old = root(TRAY);
  F.fire("dnd5e.renderChatMessage", card({ targets: [{ actor: ally.uuid }], timestamp: Date.now() - 2 * 3600 * 1000 }), old);
  await flush(8);
  assert.equal(old.querySelector("effect-application").className, "");
  await game.settings.set(MODULE, "highlightUnapplied", false);
  const off = root(TRAY);
  F.fire("dnd5e.renderChatMessage", card({ targets: [{ actor: ally.uuid }] }), off);
  await flush(8);
  await game.settings.set(MODULE, "highlightUnapplied", true);
  assert.equal(off.querySelector("effect-application").className, "");
});

test("a fresh self-cast card waits out the 15 s grace for the auto apply before lighting up", async () => {
  clearCopies();
  const m = card({ targets: selfTarget });
  m.flags[MODULE] = { effectsApplied: { auto: false } };
  const host = root(TRAY);
  F.fire("dnd5e.renderChatMessage", m, host);
  await flush(8);
  const tray = host.querySelector("effect-application");
  assert.equal(tray.className, "", "not during the grace");
  await advance(15000);
  assert.equal(tray.className, "");
  await advance(300);
  assert.equal(tray.className, "pentaryn-aoe-unapplied", "the auto apply never landed: light up");
  const m2 = card({ targets: selfTarget });
  const h2 = root(TRAY);
  F.fire("dnd5e.renderChatMessage", m2, h2);
  await flush(8);
  m2.flags[MODULE] = { effectsApplied: { auto: true } };
  await advance(15300);
  assert.equal(h2.querySelector("effect-application").className, "", "it landed: stay dark");
});

test("dnd5e's own Apply is noticed: highlight off at once, recorded on the card 1.2 s later", async () => {
  const m = card({ targets: [{ actor: ally.uuid }] });
  const host = root(`<div data-message-id="${m.id}">${TRAY}<recorded-targets></recorded-targets></div>`);
  host.querySelector("recorded-targets").targets = [{ actor: ally }];
  F.fire("dnd5e.renderChatMessage", m, host);
  await flush(8);
  const tray = host.querySelector("effect-application");
  assert.equal(tray.className, "pentaryn-aoe-unapplied");
  dispatch(tray.querySelector(".apply-button"), "click");
  await flush(8);
  assert.equal(tray.className, "");
  assert.equal(m.flags[MODULE]?.effectsApplied, undefined);
  await advance(1200);
  assert.deepEqual(m.flags[MODULE].effectsApplied, { ids: [armorFx.id] });
});

test("an Apply click with nothing pressed, or nobody to apply to, or outside the button, is ignored", async () => {
  const m = card({ targets: [{ actor: ally.uuid }] });
  const host = root(TRAY.replace('aria-pressed="true"', 'aria-pressed="false"'));
  F.fire("dnd5e.renderChatMessage", m, host);
  dispatch(host.querySelector(".apply-button"), "click");
  const m2 = card({ targets: [{ actor: ally.uuid }] });
  const h2 = root(TRAY);
  F.fire("dnd5e.renderChatMessage", m2, h2);
  F.canvas.tokens.controlled = [];
  dispatch(h2.querySelector(".apply-button"), "click");
  dispatch(h2.querySelector("li"), "click");
  await advance(1300);
  assert.equal(m.flags[MODULE]?.effectsApplied, undefined);
  assert.equal(m2.flags[MODULE]?.effectsApplied, undefined);
  assert.deepEqual(E.applyTargets(el(`<effect-application></effect-application>`)), []);
  F.canvas.tokens.controlled = [{ actor: ally }, { actor: null }];
  assert.equal(E.applyTargets(el(`<effect-application></effect-application>`)).length, 1);
  F.canvas.tokens.controlled = [];
});

test("only usage cards are decorated", () => {
  const host = root(TRAY);
  F.fire("dnd5e.renderChatMessage", W.message({ type: "damage" }), host);
  assert.equal(host.querySelector("effect-application").dataset.pentarynAoe, undefined);
});

/* ── the same spell does not stack ───────────────────────────────────────────────────────────── */

test("preCreateActiveEffect: a copy of a spell's effect replaces an enabled one of the same name from the same spell", async () => {
  const fromRing = W.item({ id: "itemRingShield01", name: "Shield", system: { identifier: "shield" } }, caven);
  const ringFx = fx(fromRing, "effRingShield001", "Shield");
  const old = W.effect(caven, { name: "Shield", _stats: { duplicateSource: shieldFx.uuid } });
  const other = W.effect(caven, { name: "Mage Armor", _stats: { duplicateSource: armorFx.uuid } });
  const incoming = W.effect(null, { name: "Shield", _stats: { duplicateSource: ringFx.uuid } });
  Object.defineProperty(incoming, "parent", { value: caven });
  reset();
  F.fire("preCreateActiveEffect", incoming, {}, {}, GM_ID);
  await flush();
  assert.deepEqual(ops("delete").map(c => c.uuid), [old.uuid]);
  assert.ok(caven.effects.has(other.id));
});

test("no replacement: setting off, not on an actor, no source, not a spell, disabled old; a failed delete is warned", async () => {
  const old = W.effect(caven, { name: "Shield", _stats: { duplicateSource: shieldFx.uuid } });
  const make = (stats, parent = caven, name = "Shield") => {
    const e = W.effect(null, { name, _stats: stats });
    Object.defineProperty(e, "parent", { value: parent });
    return e;
  };
  reset();
  await game.settings.set(MODULE, "noSpellStacking", false);
  F.fire("preCreateActiveEffect", make({ duplicateSource: shieldFx.uuid }));
  await game.settings.set(MODULE, "noSpellStacking", true);
  F.fire("preCreateActiveEffect", make({ duplicateSource: shieldFx.uuid }, spell));
  F.fire("preCreateActiveEffect", make({}));
  F.fire("preCreateActiveEffect", make({ duplicateSource: "Item.notASpell" }));
  W.register("Item.notASpell", { documentName: "Item", type: "feat" });
  F.fire("preCreateActiveEffect", make({ duplicateSource: "Item.notASpell" }));
  await flush();
  assert.deepEqual(ops("delete"), []);
  Object.defineProperty(old, "delete", { value: async () => { throw new Error("gone"); } });
  F.fire("preCreateActiveEffect", make({ duplicateSource: shieldFx.uuid }));
  await flush();
  assert.deepEqual(lines(), [`warn: ${MODULE} | replace Shield`]);
  old.disabled = true;
  reset();
  F.fire("preCreateActiveEffect", make({ duplicateSource: shieldFx.uuid }));
  await flush();
  assert.deepEqual(lines(), []);
  caven.effects.delete(old.id);
});

test("spellOf: the source effect's item, else the origin; identifier, else the name; a throwing lookup is skipped", () => {
  const noId = W.item({ id: "itemNoIdent00001", name: "Bless", system: { identifier: "" } }, caven);
  W.register("Item.throws", null);
  const from = globalThis.fromUuidSync;
  assert.equal(E.spellOf({ _stats: { duplicateSource: armorFx.uuid } }), "mage-armor");
  assert.equal(E.spellOf({ _stats: {}, origin: noId.uuid }), "Bless");
  assert.equal(E.spellOf({ _stats: { duplicateSource: "Item.missing" }, origin: spell.uuid }), "mage-armor");
  globalThis.fromUuidSync = () => { throw new Error("bad uuid"); };
  assert.equal(E.spellOf({ _stats: { duplicateSource: "x" }, origin: "y" }), null);
  globalThis.fromUuidSync = from;
  assert.equal(E.spellOf({ _stats: {} }), null);
});

test("applyEffect without dnd5e's <effect-application> throws", async () => {
  const cls = F.elements.get("effect-application");
  F.elements.delete("effect-application");
  await assert.rejects(E.applyEffect(card(), armorFx, caven), /effect-application/);
  F.elements.set("effect-application", cls);
});
