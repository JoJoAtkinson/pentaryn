// G1 (feedback SvOaxr, plan feedback-triage-2026-11-19 §H2): a healing card from an activity
// that can only affect its user (Stone's Endurance) records the caster as its one target on the
// roller's client (preCreateChatMessage → updateSource), so dnd5e's tray reads "Talo +11" for every
// viewer and never offers the heal to an enemy the roller had targeted (browser test T3). A Self-range
// area (Burning Hands, Spirit Guardians), a save, an attack and a touch spell (Cure Wounds) are left alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, MODULE, PLAYER_ID, GM_ID } from "./fixtures/world.mjs";
import { selfTargetCard, lateTargetCard } from "../core.mjs";

const { F, W } = await boot({ entry: true, user: { id: PLAYER_ID, name: "Player", isGM: false }, users: [{ id: GM_ID, name: "Gamemaster", isGM: true }] });

/* ── the pure rule ───────────────────────────────────────────────────── */

test("selfTargetCard: affects self, or Self range with no other affects; never an area, a save, an attack or another card type", () => {
  const card = over => selfTargetCard({ type: "healing", activityType: "heal", rangeUnits: "self", affectsType: null, templateType: null, hasSave: false, ...over });
  assert.equal(card({}), true, "Stone's Endurance: Self range, nothing else");
  assert.equal(card({ rangeUnits: null, affectsType: "self" }), true, "affects: self");
  assert.equal(card({ type: "damage", activityType: "damage" }), false, "never a damage card: Armor of Agathys' Self-range cold damage is the attacker's");
  assert.equal(card({ templateType: "cone" }), false, "Burning Hands: a Self-range cone");
  assert.equal(card({ templateType: "radius", affectsType: "self" }), false, "Spirit Guardians: an emanation");
  assert.equal(card({ hasSave: true }), false, "a save activity");
  assert.equal(card({ activityType: "save" }), false);
  assert.equal(card({ activityType: "attack" }), false, "Booming Blade's Self range is a weapon's reach");
  assert.equal(card({ rangeUnits: "touch", affectsType: "creature" }), false, "Cure Wounds (touch)");
  assert.equal(card({ affectsType: "creature" }), false, "Self range but it affects creatures");
  assert.equal(card({ type: "usage" }), false, "a usage card is Part D's (untargetedSelf), never this");
  assert.equal(selfTargetCard(), false);
});

/* ── the hook ────────────────────────────────────────────────────────── */

const s = W.scene({ id: "SelfScene0000001", name: "Self" });
F.canvas.scene = s;
const talo = W.actor({ id: "actTalo000000001", name: "Talo", type: "character", hasPlayerOwner: true, ownership: { default: 0, [PLAYER_ID]: 3 } });
const bog = W.actor({ id: "actBog0000000001", name: "Bog Vessel", type: "npc" });
const taloTok = W.token(s, { id: "tokTalo000000001", name: "Talo", actorId: talo.id, actor: talo, disposition: 1 });
const bogTok = W.token(s, { id: "tokBog0000000001", name: "Bog Vessel 4", actorId: bog.id, actor: bog });
const item = W.item({ id: "itemStoneEnd0001", name: "Stone's Endurance", type: "feat" }, talo);

function activity({ id, type = "heal", range = "self", affects = null, template = null, save = false } = {}) {
  const act = {
    id, type, uuid: `${item.uuid}.Activity.${id}`, item, actor: talo,
    range: { units: range }, target: { affects: { type: affects }, template: { type: template ?? "" } },
    ...(save ? { save: { ability: new Set(["dex"]), dc: { value: 13 } } } : {}),
  };
  W.register(act.uuid, act);
  return act;
}

/** A roll card as dnd5e builds it before create: the roller's current targets recorded. */
function pending(act, { type = "healing", targets = [], author = PLAYER_ID } = {}) {
  const m = W.message({ type, author, activity: act, system: { activity: { uuid: act.uuid }, targets }, speaker: { scene: s.id, actor: talo.id, token: taloTok.id } });
  Object.defineProperty(m, "updateSource", { value(changes) { for (const [k, v] of Object.entries(changes)) F.foundry.utils.setProperty(this, k, v); }, enumerable: false });
  return m;
}
const enemy = [{ actor: bog.uuid, ac: 12, img: "x", name: "Bog Vessel 4", token: bogTok.uuid }];

test("Stone's Endurance rolled with an enemy targeted: the card records Talo, not the enemy", () => {
  const m = pending(activity({ id: "actStoneEnd00001" }), { targets: enemy });
  const ret = F.fire("preCreateChatMessage", m, {}, {}, PLAYER_ID);
  assert.notEqual(ret, false, "never a veto");
  assert.deepEqual(m.system.targets.map(t => [t.token, t.name]), [[taloTok.uuid, "Talo"]]);
  assert.equal(m.flags?.[MODULE]?.areaTargets, undefined, "areaTargets is never written");
  assert.equal(m.flags?.[MODULE]?.recordedTargets, undefined, "recordedTargets is never written");
});

test("with nothing targeted: Talo; and late targets then leave the card alone", () => {
  const m = pending(activity({ id: "actStoneEnd00002" }));
  F.fire("preCreateChatMessage", m, {}, {}, PLAYER_ID);
  assert.deepEqual(m.system.targets.map(t => t.token), [taloTok.uuid]);
  const late = lateTargetCard([{ id: m.id, type: m.type, author: PLAYER_ID, timestamp: Date.now(), targets: m.system.targets.length, lateTargets: false, areaTargets: false, applied: false }], { userId: PLAYER_ID, now: Date.now() });
  assert.equal(late, null, "a card with targets is not followed");
});

test("affects: self also counts; the usage token wins over the speaker", () => {
  const act = activity({ id: "actSecondWind001", range: null, affects: "self" });
  act.getUsageToken = () => ({ document: taloTok });
  const m = pending(act, { targets: enemy });
  F.fire("preCreateChatMessage", m, {}, {}, PLAYER_ID);
  assert.deepEqual(m.system.targets.map(t => t.token), [taloTok.uuid]);
});

test("Burning Hands (Self cone), Spirit Guardians (Self emanation), a save, an attack, Cure Wounds (touch), Armor of Agathys' damage: targets untouched", () => {
  const agathys = activity({ id: "actAgathys000001", type: "damage" });
  const dmg = pending(agathys, { type: "damage", targets: enemy });
  F.fire("preCreateChatMessage", dmg, {}, {}, PLAYER_ID);
  assert.deepEqual(dmg.system.targets, enemy, "a Self-range damage card keeps the attacker");
  const cases = [
    activity({ id: "actBurnHands0001", type: "damage", template: "cone" }),
    activity({ id: "actSpiritGuard01", type: "damage", affects: "self", template: "radius" }),
    activity({ id: "actThunderclap01", type: "save", save: true }),
    activity({ id: "actBoomBlade0001", type: "attack" }),
    activity({ id: "actCureWounds001", range: "touch", affects: "creature" }),
  ];
  for (const act of cases) {
    const m = pending(act, { type: act.type === "heal" ? "healing" : "damage", targets: enemy });
    F.fire("preCreateChatMessage", m, {}, {}, PLAYER_ID);
    assert.deepEqual(m.system.targets, enemy, act.id);
  }
});

test("another user's create, a usage card, or applyFromCard off: untouched", async () => {
  const act = activity({ id: "actStoneEnd00003" });
  const other = pending(act, { targets: enemy, author: GM_ID });
  F.fire("preCreateChatMessage", other, {}, {}, GM_ID);
  assert.deepEqual(other.system.targets, enemy, "the hook runs on the creating client only");
  const usage = pending(act, { type: "usage", targets: enemy });
  F.fire("preCreateChatMessage", usage, {}, {}, PLAYER_ID);
  assert.deepEqual(usage.system.targets, enemy);
  await game.settings.set(MODULE, "applyFromCard", false);
  try {
    const off = pending(act, { targets: enemy });
    F.fire("preCreateChatMessage", off, {}, {}, PLAYER_ID);
    assert.deepEqual(off.system.targets, enemy);
  } finally { await game.settings.set(MODULE, "applyFromCard", true); }
});
