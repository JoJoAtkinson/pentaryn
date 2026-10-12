// The legacy API on game.pentaryn.riders, called as a GM at the console (guide S1/S6 oracles;
// combat-riders-26, -32). Every member is called with the fixture actors and its result pinned as it
// is today: `report` rows (golden/report-*.json), `featuresOf`, `setType`, `retireManual`,
// `installBattleMedic`, `spendHitDie` / `restoreHitDie` / `hdPools` (the Hit Dice kernel oracle),
// and `preview`. `battleMedic` (the client runner) is in battle-medic.test.mjs.
//
// KNOWN combat-riders-12 (riders half, guide §4): legacy members take documents only. A name, id
// or UUID string is not resolved: report("Ilsa Vantrel") returns no rows and setType("…") sets
// nothing. Pinned here; the [declared] withRef change flips the todo at the end.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { IDS, MODULE, makeActor, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_800_000_000_000 });
const W = await setupWorld();
const { F } = W;
await import("../riders.mjs");
F.fire("init");
F.fire("ready");
mock.timers.tick(0);
const api = F.game.pentaryn.riders;
const sorc = W.actor(IDS.sorc), druid = W.actor(IDS.druid), healer = W.actor(IDS.healer), npc = W.actor(IDS.npc), wiz = W.actor(IDS.wiz);

const feats = actor => api.featuresOf(actor).map(f => ({ key: f.key, rule: f.rule.key, items: f.items.map(i => i.name), types: f.types }));

test("featuresOf: one entry per matched rule, with live items and resolved types", () => {
  assert.deepEqual(feats(sorc), [
    { key: "elemental-adept", rule: "elemental-adept", items: ["Elemental Adept (Fire)"], types: ["fire"] },
    { key: "elemental-affinity", rule: "elemental-affinity", items: ["Elemental Affinity"], types: [] },
  ]);
  assert.equal(api.featuresOf(sorc)[0].items[0], sorc.items.get("eladept000000001"), "live Item documents");
  assert.deepEqual(feats(druid), [{ key: "potent-spellcasting-druid", rule: "potent-spellcasting-druid", items: ["Elemental Fury: Potent Spellcasting"], types: null }]);
  assert.deepEqual(feats(healer), [{ key: "healer", rule: "healer", items: ["Healer"], types: null }]);
  assert.deepEqual(feats(npc), []);
  assert.deepEqual(feats(null), []);
});

test("featuresOf: a name-only Potent Spellcasting matches both the druid and the cleric rule", () => {
  const both = makeActor({ name: "Generic", items: [{ name: "Potent Spellcasting", type: "feat", system: {} }] });
  assert.deepEqual(feats(both).map(f => f.key), ["potent-spellcasting-druid", "potent-spellcasting-cleric"]);
});

test("featuresOf: a typed feature's types merge across items; the flag outranks the name", () => {
  const two = makeActor({
    name: "Twice", items: [
      { name: "Elemental Adept (Cold)", type: "feat", system: {} },
      { name: "Elemental Adept (Lightning)", type: "feat", system: {}, flags: { [MODULE]: { damageType: ["fire", "acid"] } } },
      { name: "Elemental Adept (Cold)", type: "feat", system: {}, flags: { [MODULE]: { damageType: "cold" } } },
    ],
  });
  assert.deepEqual(feats(two), [{ key: "elemental-adept", rule: "elemental-adept", items: ["Elemental Adept (Cold)", "Elemental Adept (Lightning)", "Elemental Adept (Cold)"], types: ["cold", "fire", "acid"] }]);
});

test("report(actor): rows as returned, and one console.table of them", () => {
  W.take();
  const rows = api.report(sorc);
  pinJSON("report-sorcerer", rows, import.meta.url);
  assert.deepEqual(rows[1].status, "NO TYPE — setType(actor, 'fire')");
  assert.deepEqual(rows[1].manual, "2 +CHA activities left — retireManual(actor)");
  assert.deepEqual(W.take(), [["table", rows]]);
  assert.deepEqual(api.report(druid), [{ actor: "Bren Ashwood", rule: "potent-spellcasting-druid", items: "Elemental Fury: Potent Spellcasting", status: "active", handAdded: "Thorn Whip already add WIS — rider skips them" }]);
  assert.deepEqual(api.report(healer), [{ actor: "Mara Quill", rule: "healer", items: "Healer", status: "active", battleMedic: "not installed — installBattleMedic(actor)" }]);
  assert.deepEqual(api.report(npc), []);
});

test("report(): every character actor (NPCs left out), in world order", () => {
  pinJSON("report-all", api.report(), import.meta.url);
  assert.deepEqual([...new Set(api.report().map(r => r.actor))], ["Ilsa Vantrel", "Bren Ashwood", "Mara Quill"]);
  W.take();
});

test("setType: type required; an actor sets every typed feature item, or one rule's; returns item names", async () => {
  await assert.rejects(api.setType(sorc, ""), { message: "setType(item | actor, type, ruleKey?): type required" });
  await assert.rejects(api.setType(sorc, null), { message: "setType(item | actor, type, ruleKey?): type required" });
  const sc = makeActor({ name: "Scratch", items: [
    { id: "scadept000000001", name: "Elemental Adept (Fire)", type: "feat", system: {} },
    { id: "scaffin000000001", name: "Elemental Affinity", type: "feat", system: {} },
    { id: "schealer00000001", name: "Healer", type: "feat", system: {} },
  ] });
  W.takeLog();
  assert.deepEqual(await api.setType(sc, "  Cold "), ["Elemental Adept (Fire)", "Elemental Affinity"]);
  assert.equal(sc.items.get("scadept000000001").flags[MODULE].damageType, "cold");
  assert.deepEqual(await api.setType(sc, "Fire", "elemental-affinity"), ["Elemental Affinity"]);
  assert.equal(sc.items.get("scaffin000000001").flags[MODULE].damageType, "fire");
  assert.deepEqual(await api.setType(sc.items.get("schealer00000001"), "fire"), ["Healer"], "an item is set whatever it is");
  assert.deepEqual(await api.setType(npc, "fire"), []);
  assert.deepEqual(await api.setType({ name: "plain" }, "fire"), [], "no setFlag: skipped");
  const writes = F.calls.filter(c => c.op === "update").slice(-4).map(c => [c.uuid.split(".").pop(), c.changes]);
  assert.deepEqual(writes, [
    ["scadept000000001", { [`flags.${MODULE}.damageType`]: "cold" }],
    ["scaffin000000001", { [`flags.${MODULE}.damageType`]: "cold" }],
    ["scaffin000000001", { [`flags.${MODULE}.damageType`]: "fire" }],
    ["schealer00000001", { [`flags.${MODULE}.damageType`]: "fire" }],
  ]);
});

test("retireManual: untyped Affinity left alone; typed → flag pinned (if unset) and every damage activity deleted", async () => {
  assert.deepEqual(await api.retireManual(sorc), [], "Affinity has no type: left alone");
  const one = makeActor({ name: "One", items: [{ id: "oneaffin00000001", name: "Elemental Affinity", type: "feat", system: {}, activities: [
    { id: "onefire000000001", type: "damage", name: "Fire", damage: { parts: [{ types: ["fire"] }] } },
    { id: "oneutil000000001", type: "utility", name: "Note" },
  ] }] });
  W.takeLog();
  assert.deepEqual(await api.retireManual(one), ["Elemental Affinity: Fire"]);
  assert.equal(one.items.get("oneaffin00000001").flags[MODULE].damageType, "fire");
  assert.deepEqual(W.takeLog(), [{ op: "deleteActivity", item: "Elemental Affinity", id: "onefire000000001" }]);

  const flagged = makeActor({ name: "Flagged", items: [{ id: "flgaffin00000001", name: "Elemental Affinity (Cold)", type: "feat", system: {}, flags: { [MODULE]: { damageType: "cold" } }, activities: [
    { id: "flgcold000000001", type: "damage", name: "" },
  ] }] });
  const before = F.calls.length;
  assert.deepEqual(await api.retireManual(flagged), ["Elemental Affinity (Cold): flgcold000000001"], "no name → the id");
  assert.equal(F.calls.slice(before).filter(c => c.op === "update").length, 0, "flag already set: not rewritten");

  const multi = makeActor({ name: "Multi", items: [{ id: "mulaffin00000001", name: "Elemental Affinity (Fire, Cold)", type: "feat", system: {} }] });
  assert.deepEqual(await api.retireManual(multi), []);
  assert.deepEqual(multi.items.get("mulaffin00000001").flags[MODULE].damageType, ["fire", "cold"], "two types → the array");
});

test("retireManual: items the user does not own are skipped", async () => {
  const one = makeActor({ name: "NotMine", ownership: { default: 0 }, items: [{ id: "nmaffin000000001", name: "Elemental Affinity (Fire)", type: "feat", system: {}, activities: [{ id: "nmfire0000000001", type: "damage", name: "Fire" }] }] });
  F.become({ userId: IDS.player });
  try {
    assert.deepEqual(await api.retireManual(one), []);
  } finally { F.become({ userId: IDS.gm }); }
  assert.equal(one.items.get("nmaffin000000001").system.activities.size, 1);
});

test("installBattleMedic: no feat / not owner refusals", async () => {
  assert.deepEqual(await api.installBattleMedic(npc), { ok: false, why: "no Healer feat" });
  assert.deepEqual(await api.installBattleMedic(null), { ok: false, why: "no Healer feat" });
  const theirs = makeActor({ name: "Theirs", items: [{ name: "Healer", type: "feat", system: { identifier: "healer" } }] });
  F.become({ userId: IDS.player });
  try {
    assert.deepEqual(await api.installBattleMedic(theirs), { ok: false, why: "not owner" });
  } finally { F.become({ userId: IDS.gm }); }
});

test("installBattleMedic: creates one utility activity on the kit the old activity spent; replaces 'Heal dX' only", async () => {
  W.takeLog();
  const out = await api.installBattleMedic(healer);
  assert.deepEqual(out, { ok: true, item: `Actor.${IDS.healer}.Item.healerfeat000001`, kit: "healerkit0000001", kitFound: true, updated: false, removed: ["Heal d8"] });
  pinJSON("install-battle-medic", W.takeLog(), import.meta.url);
  const again = await api.installBattleMedic(healer, { replace: false });
  assert.deepEqual(again, { ok: true, item: `Actor.${IDS.healer}.Item.healerfeat000001`, kit: "healerkit0000001", kitFound: true, updated: true, removed: [] });
  assert.deepEqual(W.takeLog().map(l => l.op), ["updateActivity"]);
  assert.deepEqual(api.report(healer)[0].battleMedic, "installed, kit Healer's Kit");
  W.take();
});

test("installBattleMedic: the kit found by name; none → no consumption; report says so", async () => {
  const named = makeActor({ name: "Named", items: [
    { id: "namedkit00000001", name: "healers kit", type: "consumable", system: {} },
    { id: "namedfeat0000001", name: "Healer", type: "feat", system: {} },
  ] });
  assert.equal((await api.installBattleMedic(named)).kit, "namedkit00000001");
  const bare = makeActor({ name: "Bare", type: "character", items: [{ id: "barefeat00000001", name: "Healer", type: "feat", system: {} }] });
  W.takeLog();
  assert.deepEqual(await api.installBattleMedic(bare), { ok: true, item: `Actor.${bare.id}.Item.barefeat00000001`, kit: null, kitFound: false, updated: false, removed: [] });
  assert.deepEqual(W.takeLog()[0].data.consumption, { targets: [] });
  assert.equal(api.report(bare)[0].battleMedic, "installed, no kit linked");
  healer.items.delete("healerkit0000001");
  assert.equal(api.report(healer)[0].battleMedic, "installed, kit healerkit0000001 MISSING");
  W.take();
});

test("hdPools (the Hit Dice kernel oracle): NPC one pool, PC one per class, junk denomination → 0 faces", () => {
  assert.deepEqual(api.hdPools(npc), [{ id: null, faces: 8, value: 3, spent: 1 }]);
  assert.deepEqual(api.hdPools(wiz), [
    { id: "wizclass00000001", faces: 6, value: 2, spent: 3 },
    { id: "ftrclass00000001", faces: 10, value: 1, spent: 0 },
  ]);
  assert.deepEqual(api.hdPools(W.actor(IDS.noHd)), [], "no attributes.hd → no pools");
  assert.deepEqual(api.hdPools(null), []);
  const odd = makeActor({ name: "Odd", system: { isNPC: true, attributes: { hd: { denomination: "x" } } } });
  assert.deepEqual(api.hdPools(odd), [{ id: null, faces: 0, value: 0, spent: 0 }]);
  const cls = makeActor({ name: "Cls", system: { attributes: { hd: {} } }, items: [{ id: "clsnohd000000001", name: "Monk", type: "class", system: { identifier: "monk" } }] });
  assert.deepEqual(api.hdPools(cls), [{ id: "clsnohd000000001", faces: 0, value: 0, spent: 0 }]);
});

test("spendHitDie / restoreHitDie: largest available / largest spent; faces picks a pool; writes spent", async () => {
  const before = F.calls.length;
  assert.equal(await api.spendHitDie(npc), 8);
  assert.equal(await api.spendHitDie(wiz), 10);
  assert.equal(await api.spendHitDie(wiz, { faces: 6 }), 6);
  assert.equal(await api.spendHitDie(wiz, { faces: 12 }), 10, "no such pool → the largest");
  assert.equal(await api.restoreHitDie(wiz), 10);
  assert.equal(await api.restoreHitDie(npc), 8);
  assert.equal(await api.spendHitDie(W.actor(IDS.noHd)), null);
  assert.equal(await api.restoreHitDie(W.actor(IDS.noHd)), null);
  const writes = F.calls.slice(before).filter(c => c.op === "update").map(c => [c.uuid, c.changes]);
  assert.deepEqual(writes, [
    [`Actor.${IDS.npc}`, { "system.attributes.hd.spent": 2 }],
    [`Actor.${IDS.wiz}.Item.ftrclass00000001`, { "system.hd.spent": 1 }],
    [`Actor.${IDS.wiz}.Item.wizclass00000001`, { "system.hd.spent": 4 }],
    [`Actor.${IDS.wiz}.Item.ftrclass00000001`, { "system.hd.spent": 2 }],
    [`Actor.${IDS.wiz}.Item.ftrclass00000001`, { "system.hd.spent": 1 }],
    [`Actor.${IDS.npc}`, { "system.attributes.hd.spent": 1 }],
  ]);
});

test("preview: core.transformFormula with dnd5e's damage types", () => {
  assert.equal(api.preview("1d6[fire]", { rollType: "damage", types: ["fire"], modifier: "min2" }), "1d6min2[fire]");
  assert.equal(api.preview("8d6", { rollType: "fire", types: ["fire"], modifier: "min2", bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }), "8d6min2 + 4[Elemental Affinity]");
  assert.equal(api.preview("2d8[cold] + 1d6[fire]", { rollType: "cold", types: ["fire"], modifier: "min2" }), "2d8[cold] + 1d6min2[fire]");
  assert.equal(api.preview("1d8 + 3", { rollType: "healing", modifier: "r1" }), "1d8r1 + 3");
});

test("KNOWN combat-riders-12: a name string is not resolved (report → [], setType → [])", async () => {
  assert.deepEqual(api.report("Ilsa Vantrel"), []);
  assert.deepEqual(await api.setType("Ilsa Vantrel", "fire"), []);
  assert.deepEqual(api.featuresOf(IDS.sorc), []);
  W.take();
});

test.todo("combat-riders-12 [declared]: report/featuresOf/setType/retireManual/installBattleMedic/spendHitDie/restoreHitDie/hdPools resolve an Actor, Token, UUID, id or exact name; a substring or miss gives null");
