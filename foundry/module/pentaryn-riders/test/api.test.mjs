// The legacy API on game.pentaryn.riders, called as a GM at the console (guide S1/S6 oracles;
// combat-riders-26, -32). Every member is called with the fixture actors and its result pinned as it
// is today: `report` rows (golden/report-*.json), `featuresOf`, `setType`, `retireManual`,
// `installBattleMedic`, `spendHitDie` / `restoreHitDie` / `hdPools` (the Hit Dice kernel oracle),
// and `preview`. `battleMedic` (the client runner) is in battle-medic.test.mjs.
//
// combat-riders-12 [declared] (riders half, guide §4): legacy members took documents only (a name
// string returned no rows). They now also resolve a name, id, UUID or Token; a miss answers null.
// The flipped pin is the last test.
//
// riders-async-4 [declared]: installBattleMedic deleted each old "Heal dX" activity with its own
// awaited deleteActivity write. It now removes them all in one item update (dnd5e's own
// `system.activities.<id>: _del` form); the Battle Medic create/update stays a separate write.
//
// riders-async-5 [declared]: setType on an actor wrote one setFlag per item, and retireManual one
// setFlag plus one deleteActivity per activity. An actor target now takes one
// `updateEmbeddedDocuments("Item", …)` (a single Item target keeps its one setFlag); retireManual
// puts each item's flag (when missing) and every damage-activity deletion into that one batch.
//
// rob-5 [declared]: setType wrote any non-empty type and reported success. The type is now checked
// against each targeted rule's `types` (an actor's typed features, or the typed rules an Item
// matches); only items whose rule lists it are set, and when none does it throws BAD_ARGS naming
// the allowed types and writes nothing. An Item no typed rule matches (Healer) is no longer set.
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
  assert.deepEqual(await api.setType(sc.items.get("schealer00000001"), "fire"), [], "rob-5: an item no typed rule matches is not set");
  assert.deepEqual(await api.setType(sc.items.get("scadept000000001"), "fire"), ["Elemental Adept (Fire)"]);
  assert.deepEqual(await api.setType(npc, "fire"), []);
  assert.deepEqual(await api.setType({ name: "plain" }, "fire"), [], "no setFlag: skipped");
  // riders-async-5: an actor target is one updateEmbeddedDocuments; an Item target its one setFlag.
  const writes = F.calls.filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments").slice(-3).map(c => [c.op, c.uuid.split(".").pop(), c.changes ?? c.updates]);
  assert.deepEqual(writes, [
    ["updateEmbeddedDocuments", sc.id, [
      { _id: "scadept000000001", [`flags.${MODULE}.damageType`]: "cold" },
      { _id: "scaffin000000001", [`flags.${MODULE}.damageType`]: "cold" },
    ]],
    ["updateEmbeddedDocuments", sc.id, [{ _id: "scaffin000000001", [`flags.${MODULE}.damageType`]: "fire" }]],
    ["update", "scadept000000001", { [`flags.${MODULE}.damageType`]: "fire" }],
  ]);
});

test("rob-5 [declared]: setType checks the type against each targeted rule's types; none fits → BAD_ARGS naming them, nothing written", async () => {
  const sc = makeActor({ name: "Typed", items: [
    { id: "tyadept000000001", name: "Elemental Adept", type: "feat", system: {} },
    { id: "tyaffin000000001", name: "Elemental Affinity", type: "feat", system: {} },
    { id: "tyhealer00000001", name: "Healer", type: "feat", system: {} },
  ] });
  const before = F.calls.length;
  const writes = () => F.calls.slice(before).filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments");
  await assert.rejects(api.setType(sc, "banana"), {
    code: "BAD_ARGS",
    message: "BAD_ARGS: setType: \"banana\" fits none of Elemental Adept (acid, cold, fire, lightning, thunder), Elemental Affinity (acid, cold, fire, lightning, poison)",
  });
  await assert.rejects(api.setType(sc, "poison", "elemental-adept"), { code: "BAD_ARGS", message: /fits none of Elemental Adept \(acid, cold, fire, lightning, thunder\)$/ });
  await assert.rejects(api.setType(sc.items.get("tyadept000000001"), "Poison"), { code: "BAD_ARGS", message: /fits none of Elemental Adept \(/ });
  assert.deepEqual(writes(), [], "an invalid type writes nothing");
  // A type one rule takes and another does not: only the rule that takes it is set.
  assert.deepEqual(await api.setType(sc, "Poison"), ["Elemental Affinity"]);
  assert.deepEqual(await api.setType(sc, "thunder"), ["Elemental Adept"]);
  assert.equal(sc.items.get("tyadept000000001").flags[MODULE].damageType, "thunder");
  assert.equal(sc.items.get("tyaffin000000001").flags[MODULE].damageType, "poison");
  // An item no typed rule matches is not set (was: any item took the flag).
  assert.deepEqual(await api.setType(sc.items.get("tyhealer00000001"), "fire"), []);
  assert.equal(sc.items.get("tyhealer00000001").flags?.[MODULE]?.damageType, undefined);
  assert.deepEqual(await api.setType(sc.items.get("tyadept000000001"), "ACID"), ["Elemental Adept"]);
  assert.equal(sc.items.get("tyadept000000001").flags[MODULE].damageType, "acid");
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
  assert.deepEqual(W.takeLog(), [{ op: "updateEmbeddedDocuments", actor: "One", embeddedName: "Item", updates: [
    { _id: "oneaffin00000001", [`flags.${MODULE}.damageType`]: "fire", "system.activities.onefire000000001": "<_del>" },
  ] }], "riders-async-5: flag and deletion in one write");
  assert.deepEqual(one.items.get("oneaffin00000001").system.activities.map(a => a.id), ["oneutil000000001"]);

  const flagged = makeActor({ name: "Flagged", items: [{ id: "flgaffin00000001", name: "Elemental Affinity (Cold)", type: "feat", system: {}, flags: { [MODULE]: { damageType: "cold" } }, activities: [
    { id: "flgcold000000001", type: "damage", name: "" },
  ] }] });
  const before = F.calls.length;
  assert.deepEqual(await api.retireManual(flagged), ["Elemental Affinity (Cold): flgcold000000001"], "no name → the id");
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments").map(c => c.updates ?? c.changes),
    [[{ _id: "flgaffin00000001", "system.activities.flgcold000000001": "<_del>" }]], "flag already set: not rewritten");

  const multi = makeActor({ name: "Multi", items: [{ id: "mulaffin00000001", name: "Elemental Affinity (Fire, Cold)", type: "feat", system: {} }] });
  assert.deepEqual(await api.retireManual(multi), []);
  assert.deepEqual(multi.items.get("mulaffin00000001").flags[MODULE].damageType, ["fire", "cold"], "two types → the array");
});

test("setType on an actor and retireManual write once, in one updateEmbeddedDocuments (riders-async-5)", async () => {
  const sc = makeActor({ name: "Batch", items: [
    { id: "bsadept000000001", name: "Elemental Adept (Fire)", type: "feat", system: {} },
    { id: "bsaffin000000001", name: "Elemental Affinity", type: "feat", system: {} },
  ] });
  let before = F.calls.length;
  assert.deepEqual(await api.setType(sc, "acid"), ["Elemental Adept (Fire)", "Elemental Affinity"]);
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments").map(c => [c.op, c.updates]), [
    ["updateEmbeddedDocuments", [
      { _id: "bsadept000000001", [`flags.${MODULE}.damageType`]: "acid" },
      { _id: "bsaffin000000001", [`flags.${MODULE}.damageType`]: "acid" },
    ]],
  ], "one write for both items");
  assert.equal(sc.items.get("bsadept000000001").flags[MODULE].damageType, "acid");
  assert.equal(sc.items.get("bsaffin000000001").flags[MODULE].damageType, "acid");

  const two = makeActor({ name: "TwoAffin", items: [
    { id: "twaffin000000001", name: "Elemental Affinity (Fire)", type: "feat", system: {}, activities: [
      { id: "twfire0000000001", type: "damage", name: "Fire" },
      { id: "twutil0000000001", type: "utility", name: "Note" },
      { id: "twfire0000000002", type: "damage", name: "Fire Again" },
    ] },
    { id: "twaffin000000002", name: "Elemental Affinity (Cold)", type: "feat", system: {}, flags: { [MODULE]: { damageType: "cold" } }, activities: [
      { id: "twcold0000000001", type: "damage", name: "Cold" },
    ] },
  ] });
  W.takeLog();
  before = F.calls.length;
  assert.deepEqual(await api.retireManual(two), ["Elemental Affinity (Fire): Fire", "Elemental Affinity (Fire): Fire Again", "Elemental Affinity (Cold): Cold"]);
  assert.deepEqual(W.takeLog().map(l => l.op), ["updateEmbeddedDocuments"], "no setFlag, no deleteActivity: one batch");
  assert.deepEqual(F.calls.slice(before).filter(c => c.op === "update" || c.op === "updateEmbeddedDocuments").map(c => [c.op, c.updates]), [
    ["updateEmbeddedDocuments", [
      { _id: "twaffin000000001", [`flags.${MODULE}.damageType`]: ["fire", "cold"], "system.activities.twfire0000000001": "<_del>", "system.activities.twfire0000000002": "<_del>" },
      { _id: "twaffin000000002", "system.activities.twcold0000000001": "<_del>" },
    ]],
  ]);
  assert.deepEqual(two.items.get("twaffin000000001").system.activities.map(a => a.id), ["twutil0000000001"]);
  assert.equal(two.items.get("twaffin000000002").system.activities.size, 0);
  assert.equal(two.items.get("twaffin000000002").flags[MODULE].damageType, "cold", "a set flag is not rewritten");
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

test("installBattleMedic: every 'Heal dX' activity goes in one item update (riders-async-4)", async () => {
  const two = makeActor({ name: "TwoDice", items: [{
    id: "twofeat000000001", name: "Healer", type: "feat", system: { identifier: "healer" },
    activities: [
      { id: "twod8act00000001", type: "heal", name: "Heal d8", consumption: { targets: [] } },
      { id: "twod6act00000001", type: "heal", name: "Heal d6", consumption: { targets: [] } },
      { id: "tworeroll0000001", type: "heal", name: "Healing Reroll", consumption: { targets: [] } },
    ],
  }] });
  W.takeLog();
  const out = await api.installBattleMedic(two);
  assert.deepEqual(out.removed, ["Heal d8", "Heal d6"]);
  const log = W.takeLog();
  assert.deepEqual(log.map(l => l.op), ["createActivity", "updateItem"], "one create, then one update for both deletions");
  assert.deepEqual(log[1].changes, { "system.activities.twod8act00000001": "<_del>", "system.activities.twod6act00000001": "<_del>" });
  assert.deepEqual(two.items.get("twofeat000000001").system.activities.map(a => a.name), ["Healing Reroll", "Battle Medic"]);
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

test("rob-3 [declared]: spendHitDie takes a numeric-string faces (\"6\" spends a d6); \"d6\" or junk reads as no faces → the largest", async () => {
  const before = F.calls.length;
  assert.equal(await api.spendHitDie(wiz, { faces: "6" }), 6, "a numeric string picks that pool");
  assert.equal(await api.spendHitDie(wiz, { faces: "d6" }), 10, "not a number → the largest, as before");
  assert.equal(await api.spendHitDie(wiz, { faces: "junk" }), 10);
  const writes = F.calls.slice(before).filter(c => c.op === "update").map(c => c.uuid);
  assert.deepEqual(writes, [`Actor.${IDS.wiz}.Item.wizclass00000001`, `Actor.${IDS.wiz}.Item.ftrclass00000001`, `Actor.${IDS.wiz}.Item.ftrclass00000001`]);
});

test("preview: core.transformFormula with dnd5e's damage types", () => {
  assert.equal(api.preview("1d6[fire]", { rollType: "damage", types: ["fire"], modifier: "min2" }), "1d6min2[fire]");
  assert.equal(api.preview("8d6", { rollType: "fire", types: ["fire"], modifier: "min2", bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }), "8d6min2 + 4[Elemental Affinity]");
  assert.equal(api.preview("2d8[cold] + 1d6[fire]", { rollType: "cold", types: ["fire"], modifier: "min2" }), "2d8[cold] + 1d6min2[fire]");
  assert.equal(api.preview("1d8 + 3", { rollType: "healing", modifier: "r1" }), "1d8r1 + 3");
  assert.equal(api.preview("1d8 + (2d4[fire]) + @abilities.wis.mod", { rollType: "fire", modifier: "min2" }), "1d8min2 + (2d4[fire]) + @abilities.wis.mod", "groups and @references are left alone");
  assert.equal(api.preview("2d6min3 + 1d4rr1", { rollType: "fire", modifier: "min2" }), "2d6min3 + 1d4rr1min2");
  assert.equal(api.preview("1d4rr1", { rollType: "healing", modifier: "r1" }), "1d4rr1");
});

// [declared, preview only] (found at the checkpoint; the live riders edit real terms): a die modifier
// whose argument is an @reference ("1d8x@mod=8", Sorcerous Burst's explode) was split by the string
// tokenizer, so preview inserted min2 inside it ("1d8xmin2@mod=8"). Such a token is now left alone.
test("parseFormula keeps a die modifier's @reference argument with its modifier (preview gives \"1d8x@mod=8min2\" or leaves the die alone)", () => {
  assert.equal(api.preview("1d8x@mod=8", { rollType: "force", modifier: "min2" }), "1d8x@mod=8");
  assert.deepEqual(api.core.parseFormula("1d8x@mod=8").map(t => t.kind), ["other"]);
  assert.equal(api.preview("1d8x@mod=8 + 2d6", { rollType: "force", modifier: "min2" }), "1d8x@mod=8 + 2d6min2", "the other dice still get it");
  assert.equal(api.preview("1d8+3", { rollType: "healing", modifier: "r1" }), "1d8r1 + 3");
});

test("combat-riders-12 [declared]: report/featuresOf/setType/retireManual/installBattleMedic/spendHitDie/restoreHitDie/hdPools resolve an Actor, Token, UUID, id or exact name; a substring or miss gives null", async () => {
  const rows = api.report(sorc);
  for (const ref of ["Ilsa Vantrel", "ilsa vantrel", IDS.sorc, `Actor.${IDS.sorc}`, { documentName: "Token", actor: sorc }, { document: { documentName: "Token", actor: sorc } }]) {
    assert.deepEqual(api.report(ref), rows, JSON.stringify(ref.documentName ?? ref.document?.documentName ?? ref));
    assert.deepEqual(feats(sorc), api.featuresOf(ref).map(f => ({ key: f.key, rule: f.rule.key, items: f.items.map(i => i.name), types: f.types })));
  }
  assert.deepEqual(api.hdPools("Grisk"), [{ id: null, faces: 8, value: 3, spent: 1 }]);
  for (const miss of ["Ilsa", "Nobody", "", "Actor.nobody0000000001", { documentName: "Token", actor: null }]) {
    assert.equal(api.report(miss), null, JSON.stringify(miss));
    assert.equal(api.featuresOf(miss), null);
    assert.equal(api.hdPools(miss), null);
    assert.equal(await api.setType(miss, "fire"), null);
    assert.equal(await api.retireManual(miss), null);
    assert.equal(await api.installBattleMedic(miss), null);
    assert.equal(await api.spendHitDie(miss), null);
    assert.equal(await api.restoreHitDie(miss), null);
  }
  W.takeLog();
  assert.deepEqual(await api.setType("Ilsa Vantrel", "fire"), ["Elemental Adept (Fire)", "Elemental Affinity"]);
  assert.equal(await api.spendHitDie("Grisk"), 8);
  assert.equal(await api.restoreHitDie(`Actor.${IDS.npc}`), 8);
  assert.deepEqual(api.report(), api.report(undefined), "no argument: every character, as before");
  W.take();
});
