// DDB corrections — the pure rules (ddb-core.mjs), imported bare (no Foundry stub: purity).
// Ported from the 2026-10-19 fix scripts' cases: scripts/tests/test_fix_ddb_pc_cleanup.py (apparel,
// free casts), the wand Cast repoint (2026-10-19-wand-cast-spell.mjs dry run: wand + lens repointed,
// the homebrew axe reported only) and the Transmuter's Stone (2026-10-19-transmuters-stone.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../ddb-core.mjs";
import { DDB_DM, DDB_HB, PHB_INDEX, fighter, lookups, wizard } from "./fixtures/ddb.mjs";

const { RULES, otherDarkvision, planCorrections, needsCorrection, stableId, spellKey, spellUuidsNeeded, summaryLine, STONE_EFFECTS } = core;
const DARK = "system.attributes.senses.ranges.darkvision";
const byRule = (plan, id) => plan.changes.filter(c => c.rule === id);

/** Apply a plan to a snapshot the way the adapter (and dnd5e's cached-spell clean-up) does, so idempotence can be checked purely. */
function applyToSnapshot(snap, plan) {
  const s = structuredClone(snap);
  const set = (obj, path, v) => {
    const parts = path.split(".");
    let n = obj;
    for (const p of parts.slice(0, -1)) n = (n[p] ??= {});
    n[parts.at(-1)] = v;
  };
  for (const c of plan.changes) {
    const it = s.items.find(i => i._id === c.itemId);
    if (c.op === "retype") Object.assign(it, { type: c.data.type, system: structuredClone(c.data.system) });
    if (c.op === "updateItem") {
      for (const [k, v] of Object.entries(c.data)) set(it, k, v);
      // dnd5e's onUpdateActivities: a Cast activity whose spell changed loses its old cached copy
      for (const k of Object.keys(c.data)) {
        const m = /^system\.activities\.([^.]+)\.spell\.uuid$/.exec(k);
        if (m) s.items = s.items.filter(i => i.flags?.dnd5e?.cachedFor !== `.Item.${c.itemId}.Activity.${m[1]}`);
      }
    }
    if (c.op === "createEffects") it.effects.push(...c.data.map(e => ({ _id: e._id, name: e.name, disabled: e.disabled, flags: e.flags })));
    if (c.op === "updateActor") for (const [k, v] of Object.entries(c.data)) set(s, k, v);
    if (c.op === "deleteItem") s.items = s.items.filter(i => i._id !== c.itemId);
  }
  return s;
}

test("the rule table: ids in run order, each with label and doc", () => {
  assert.deepEqual(RULES.map(r => r.id), ["apparel-as-equipment", "freecast-innate", "cast-self-uses", "stale-cast-cache", "transmuters-stone"]);
  for (const r of RULES) {
    assert.equal(typeof r.match, "function", r.id);
    assert.equal(typeof r.plan, "function", r.id);
    assert.ok(r.label && r.doc, r.id);
  }
});

test("planCorrections never mutates its inputs", () => {
  const snap = wizard();
  const l = lookups();
  const before = JSON.stringify([snap, l]);
  planCorrections(snap, l);
  assert.equal(JSON.stringify([snap, l]), before);
});

/* apparel-as-equipment — test_dry_run_plans_and_writes_nothing / test_apply_retypes_keeping_fields */

test("apparel and notes typed consumable/trinket (or blank) become equipment; real consumables stay", () => {
  const plan = planCorrections(wizard(), lookups());
  const got = byRule(plan, "apparel-as-equipment").map(c => [c.item, c.data.system.type.value]);
  assert.deepEqual(got, [
    ["Robe", "clothing"], ["Witch Robes", "clothing"], ["Field Notes", "trinket"], ["Orc Sized Robes", "clothing"],
  ]);
  assert.ok(byRule(plan, "apparel-as-equipment").every(c => c.op === "retype" && c.data.type === "equipment"));
});

test("a retype keeps the shared fields and drops consumable-only ones", () => {
  const plan = planCorrections(wizard(), lookups());
  const witch = byRule(plan, "apparel-as-equipment").find(c => c.itemId === "witch").data.system;
  assert.deepEqual(witch.type, { value: "clothing", baseItem: "" });
  assert.equal(witch.equipped, true);
  assert.deepEqual(witch.description, { value: "<p>black</p>" });
  const robe = byRule(plan, "apparel-as-equipment").find(c => c.itemId === "robe").data.system;
  assert.equal("uses" in robe, false);
  assert.deepEqual(robe.weight, { value: 4 });
});

test("the apparel name must END in the apparel word: a clasp, a sword or 'X of Y' is not apparel", () => {
  const gear = (_id, name) => ({ _id, name, type: "consumable", system: { type: { value: "trinket" }, uses: { max: "1" } }, flags: {}, effects: [] });
  const snap = { ...wizard(), items: [
    gear("c1", "Cloak Clasp"), gear("c2", "Dress Sword"), gear("c3", "Robe of Useful Items"), gear("c4", "Notes of the Fallen"),
    gear("ok1", "Fine Clothes"), gear("ok2", "Cloak (hooded)"), gear("ok3", "Marwen's Field Notes"), gear("ok4", "Travel Journal"),
  ] };
  const got = byRule(planCorrections(snap, lookups()), "apparel-as-equipment").map(c => c.itemId);
  assert.deepEqual(got, ["ok1", "ok2", "ok3", "ok4"]);
});

test("magical, attunement, real uses or activities: apparel is reported, not retyped", () => {
  const consumeOwn = { u: { _id: "u", type: "utility", consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] } } };
  const gear = (_id, name, extra) => ({ _id, name, type: "consumable",
    system: { type: { value: "trinket" }, uses: { max: "1", recovery: [] }, activities: structuredClone(consumeOwn), ...extra }, flags: {}, effects: [] });
  const snap = { ...wizard(), items: [
    gear("mgc", "Elven Cloak", { properties: ["mgc"] }),
    gear("att", "Witch Robes", { attunement: "required" }),
    gear("use", "Robe", { uses: { max: "3", recovery: [{ period: "lr" }] } }),
    gear("act", "Smoke Cloak", { activities: { ...structuredClone(consumeOwn), s: { _id: "s", type: "save", consumption: { targets: [] } } } }),
    gear("ok", "Plain Robe", { properties: [], identifier: "plain-robe" }),
  ] };
  const plan = planCorrections(snap, lookups());
  assert.deepEqual(byRule(plan, "apparel-as-equipment").map(c => c.itemId), ["ok"],
    "the DDB default (uses 1, one utility spending its own uses) is still apparel");
  const notes = plan.notes.filter(n => n.rule === "apparel-as-equipment");
  assert.deepEqual(notes.map(n => n.item), ["Elven Cloak", "Witch Robes", "Robe", "Smoke Cloak"]);
  assert.match(notes[0].note, /magical/);
  assert.match(notes[1].note, /attunement/);
  assert.match(notes[2].note, /uses/);
  assert.match(notes[3].note, /activities/);
});

test("a retype keeps properties, attunement, identifier and magicalBonus", () => {
  const snap = { ...wizard(), items: [{ _id: "r", name: "Robes", type: "consumable", flags: {}, effects: [],
    system: { type: { value: "trinket" }, properties: ["fin"], attunement: "", identifier: "robes", magicalBonus: null, uses: { max: "1" } } }] };
  const sys = byRule(planCorrections(snap, lookups()), "apparel-as-equipment")[0].data.system;
  assert.deepEqual(sys.properties, ["fin"]);
  assert.equal(sys.attunement, "");
  assert.equal(sys.identifier, "robes");
  assert.equal("magicalBonus" in sys, true);
  assert.equal("uses" in sys, false, "the consumable's default single use is dropped");
});

/* freecast-innate */

test("feat 1/day casts filed At-Will become Innate; the slot copy and a real at-will cantrip stay", () => {
  const plan = planCorrections(wizard(), lookups());
  const got = byRule(plan, "freecast-innate");
  assert.deepEqual(got.map(c => c.itemId).sort(), ["fl1", "inv", "swa"]);
  assert.ok(got.every(c => c.op === "updateItem" && c.data["system.method"] === "innate"));
  assert.ok(got.every(c => c.summary.endsWith("(1/lr)")), got.map(c => c.summary).join(" | "));
});

/* cast-self-uses — the wand dry run of 2026-10-19 */

test("spellUuidsNeeded: every foreign Cast spell, none for a null uuid, none on a frozen item", () => {
  assert.deepEqual(spellUuidsNeeded(wizard()).length, 2);
  assert.deepEqual(spellUuidsNeeded(fighter()), [DDB_HB]);
  assert.deepEqual(spellUuidsNeeded(fighter({ frozenAxe: true })), []);
});

test("a Cast activity on a self-spending DDB spell is repointed at the PHB spell, slot on, at its level", () => {
  const plan = planCorrections(wizard(), lookups());
  const got = byRule(plan, "cast-self-uses");
  assert.deepEqual(got.map(c => c.itemId), ["wand", "lens"]);
  assert.deepEqual(got[0].data, {
    "system.activities.castMaMi.spell.uuid": "Compendium.dnd-players-handbook.spells.Item.phbsplMagicMissi",
    "system.activities.castMaMi.spell.level": 1,
    "system.activities.castMaMi.consumption.spellSlot": true,
  });
  assert.equal(got[1].data["system.activities.castDeMa.spell.uuid"], "Compendium.dnd-players-handbook.spells.Item.phbsplDetectMagi",
    "the (2024) suffix is ignored when matching");
});

test("a homebrew self-spending spell with no PHB match is a note, not a change", () => {
  const plan = planCorrections(fighter(), lookups());
  assert.deepEqual(byRule(plan, "cast-self-uses"), []);
  assert.equal(plan.notes.length, 1);
  assert.match(plan.notes[0].note, /Menacing Provocation .*no PHB spell.*freeze/);
});

test("a spell not looked up yields no opinion; one that resolved to null is a note", () => {
  assert.deepEqual(byRule(planCorrections(wizard(), {}), "cast-self-uses"), []);
  const l = lookups();
  l.spells[DDB_HB] = null;
  assert.match(planCorrections(fighter(), l).notes[0].note, /not found/);
});

test("a spell with uses of its own, or with the slot on, is not self-spending", () => {
  const l = lookups();
  const mm = Object.keys(l.spells)[0];
  l.spells[mm].system.uses.max = "3";
  assert.deepEqual(byRule(planCorrections(wizard(), l), "cast-self-uses").map(c => c.itemId), ["lens"]);
  assert.deepEqual(core.selfSpendingActivities({ system: { uses: { max: "" }, activities: { a: { consumption: { spellSlot: true, targets: [{ type: "itemUses" }] } } } } }), []);
  assert.equal(spellKey(" Detect  Magic (2024) "), "detect magic");
});

/* stale-cast-cache — Marwen's Prism-Silt Lens, 2026-10-19 */

test("a repoint in the same run leaves the old cached copy to dnd5e (its onUpdateActivities deletes it; ours would race)", () => {
  const plan = planCorrections(wizard(), lookups());
  assert.deepEqual(byRule(plan, "cast-self-uses").map(c => c.itemId), ["wand", "lens"], "the lens is repointed this run");
  assert.deepEqual(byRule(plan, "stale-cast-cache"), []);
});

test("a true orphan (neither the current spell nor the new one) goes even in a repoint run; the new spell's copy stays", () => {
  const snap = wizard();
  snap.items.push(
    { _id: "oldCache", name: "Detect Magic", type: "spell", system: { level: 1 }, effects: [],
      flags: { dnd5e: { cachedFor: ".Item.lens.Activity.castDeMa" } }, source: "Compendium.world.ddb-spells.Item.ddbDetectMagic14" },
    { _id: "newCache", name: "Detect Magic", type: "spell", system: { level: 1 }, effects: [],
      flags: { dnd5e: { cachedFor: ".Item.lens.Activity.castDeMa" } }, source: "Compendium.dnd-players-handbook.spells.Item.phbsplDetectMagi" });
  const got = byRule(planCorrections(snap, lookups()), "stale-cast-cache");
  assert.deepEqual(got.map(c => [c.op, c.itemId]), [["deleteItem", "oldCache"]]);
  assert.match(got[0].summary, /Detect Magic: stale cached copy for Prism-Silt Lens removed/);
});

test("uuids compare normalised: a legacy compendium uuid for the activity's spell is not stale", () => {
  const snap = wizard();
  const lens = snap.items.find(i => i._id === "lens");
  const phb = "Compendium.dnd-players-handbook.spells.Item.phbsplDetectMagi";
  lens.system.activities.castDeMa.spell.uuid = phb;
  const cache = snap.items.find(i => i._id === "dmCache");
  cache.source = "Compendium.dnd-players-handbook.spells.phbsplDetectMagi";   // legacy form, no ".Item."
  assert.deepEqual(byRule(planCorrections(snap, {}), "stale-cast-cache").map(c => c.itemId), ["dmCache"], "raw strings differ");
  cache.sourceKey = phb;                                                        // the adapter's parseUuid form
  lens.castKeys = { castDeMa: phb };
  assert.deepEqual(byRule(planCorrections(snap, {}), "stale-cast-cache"), [], "the same spell, normalised");
});

test("after the release: activity already on the PHB spell, the DDB copy is stale, the PHB copy stays", () => {
  const snap = wizard();
  const lens = snap.items.find(i => i._id === "lens");
  lens.system.activities.castDeMa.spell.uuid = "Compendium.dnd-players-handbook.spells.Item.phbsplDetectMagi";
  snap.items.push({ _id: "dmPhb", name: "Detect Magic", type: "spell", system: { level: 1, method: "spell" },
    flags: { dnd5e: { cachedFor: ".Item.lens.Activity.castDeMa" } }, effects: [],
    source: "Compendium.dnd-players-handbook.spells.Item.phbsplDetectMagi" });
  assert.deepEqual(byRule(planCorrections(snap, lookups()), "stale-cast-cache").map(c => c.itemId), ["dmCache"]);
  // a sweep without lookups too: the activity names a PHB spell, so no lookup is needed
  assert.deepEqual(byRule(planCorrections(snap, {}), "stale-cast-cache").map(c => c.itemId), ["dmCache"]);
});

test("a current cached copy, one with no source, a missing activity, a frozen parent: left alone", () => {
  const snap = wizard();
  const cache = snap.items.find(i => i._id === "dmCache");
  // not looked up: no opinion
  assert.deepEqual(byRule(planCorrections(snap, {}), "stale-cast-cache"), []);
  cache.source = null;
  assert.deepEqual(byRule(planCorrections(snap, lookups()), "stale-cast-cache"), []);
  cache.source = DDB_DM;
  cache.flags.dnd5e.cachedFor = ".Item.lens.Activity.gone";
  assert.deepEqual(byRule(planCorrections(snap, lookups()), "stale-cast-cache"), []);
  cache.flags.dnd5e.cachedFor = ".Item.lens.Activity.castDeMa";
  snap.items.find(i => i._id === "lens").flags = { ddbimporter: { ignoreItemImport: true } };
  assert.deepEqual(byRule(planCorrections(snap, lookups()), "stale-cast-cache"), [], "a frozen lens keeps its DDB spell");
  assert.deepEqual(core.cachedForRef("Actor.a.Item.b.Activity.c"), { itemId: "b", activityId: "c" });
  assert.equal(core.cachedForRef("nonsense"), null);
});

/* transmuters-stone */

test("the stone gets its effects (darkvision on, it was baked) and the baked base values reset", () => {
  const plan = planCorrections(wizard(), lookups());
  const got = byRule(plan, "transmuters-stone");
  assert.deepEqual(got.map(c => c.op), ["createEffects", "updateActor"]);
  const effects = got[0].data;
  assert.equal(effects.length, STONE_EFFECTS.length);
  assert.deepEqual(effects.filter(e => !e.disabled).map(e => e.name), ["Transmuter's Stone", "Transmuter's Stone: Darkvision"]);
  for (const e of effects) {
    assert.match(e._id, /^[A-Za-z0-9]{16}$/);
    assert.equal(e.transfer, true);
    assert.equal(typeof e.flags["pentaryn-riders"].stone, "string");
  }
  assert.deepEqual(effects.find(e => e.flags["pentaryn-riders"].stone === "speed").flags["pentaryn-riders"].choice,
    { group: "transmuters-stone", max: "min(2, 1 + floor(@classes.wizard.levels / 10))" });
  assert.equal("choice" in effects[0].flags["pentaryn-riders"], false, "the always-on effect is not a choice");
  assert.deepEqual(got[1].data, { "system.attributes.senses.ranges.darkvision": 0, "system.abilities.con.proficient": 0 });
});

test("effect ids are stable per item and key (two tabs collide instead of duplicating)", () => {
  const a = byRule(planCorrections(wizard(), lookups()), "transmuters-stone")[0].data.map(e => e._id);
  const b = byRule(planCorrections(wizard(), lookups()), "transmuters-stone")[0].data.map(e => e._id);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, a.length);
  assert.equal(stableId("x"), stableId("x"));
  assert.notEqual(stableId("x"), stableId("y"));
});

/** Resilient as the PHB feat carries it on an actor (dnd5e 6: advancements keyed by id). */
const resilient = ability => ({ _id: `res${ability}`, name: "Resilient", type: "feat", flags: {}, effects: [], system: { advancement: {
  asi: { _id: "asi", type: "AbilityScoreImprovement", configuration: { cap: 1, fixed: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }, locked: [], points: 1 }, value: { type: "asi", assignments: { [ability]: 1 } } },
  trt: { _id: "trt", type: "Trait", configuration: { allowReplacements: false, choices: [{ count: 1, pool: ["saves:*"] }], grants: [], mode: "default" }, value: { chosen: [`saves:${ability}`] } },
} } });

test("species darkvision or another CON-save source keeps the base values; nothing baked → all benefits off", () => {
  const snap = wizard();
  snap.items.find(i => i.type === "race").system.senses.ranges.darkvision = 60;
  snap.items.push(resilient("con"));
  const plan = planCorrections(snap, lookups());
  const got = byRule(plan, "transmuters-stone");
  assert.deepEqual(got.map(c => c.op), ["createEffects"]);
  assert.deepEqual(got[0].data.filter(e => !e.disabled).map(e => e.name), ["Transmuter's Stone"]);
  assert.match(plan.notes.find(n => n.rule === "transmuters-stone").note, /player picks/);
});

test("Resilient on another ability does not keep the stone's CON save (\"configuration\" is not CON)", () => {
  const snap = wizard();
  snap.items.push(resilient("wis"));
  const got = byRule(planCorrections(snap, lookups()), "transmuters-stone");
  assert.equal(got.find(c => c.op === "updateActor").data["system.abilities.con.proficient"], 0);
  // a Resilient whose trait was never chosen falls back to its ASI assignment
  const bare = resilient("con");
  bare.system.advancement.trt.value = {};
  const snap2 = wizard();
  snap2.items.push(bare);
  assert.equal(byRule(planCorrections(snap2, lookups()), "transmuters-stone").some(c => c.op === "updateActor"
    && "system.abilities.con.proficient" in c.data), false);
});

test("species darkvision + 60 is the baked value: reset to the species' range, never doubled", () => {
  const snap = wizard();
  snap.items.find(i => i.type === "race").system.senses.ranges.darkvision = 120;
  snap.system.attributes.senses.ranges.darkvision = 180;
  const got = byRule(planCorrections(snap, lookups()), "transmuters-stone");
  assert.equal(got.find(c => c.op === "updateActor").data["system.attributes.senses.ranges.darkvision"], 120);
  assert.deepEqual(got[0].data.filter(e => !e.disabled).map(e => e.name), ["Transmuter's Stone", "Transmuter's Stone: Darkvision"]);
  // the species' own 120 with nothing baked stays
  snap.system.attributes.senses.ranges.darkvision = 120;
  const again = byRule(planCorrections(snap, lookups()), "transmuters-stone").find(c => c.op === "updateActor");
  assert.equal(!!again && "system.attributes.senses.ranges.darkvision" in again.data, false);
});

test("a CON save from the starting class is kept; a primary-only grant on a multiclass is not", () => {
  const fighterClass = (_id, restriction) => ({ _id, name: "Fighter", type: "class", flags: {}, effects: [], system: { levels: 1, advancement: {
    s: { _id: "s", type: "Trait", level: 1, classRestriction: restriction, configuration: { grants: ["saves:str", "saves:con"] }, value: { chosen: ["saves:str", "saves:con"] } } } } });
  const snap = wizard();
  snap.items.push(fighterClass("ftr", "primary"));
  snap.system.details = { originalClass: "ftr" };
  const keep = byRule(planCorrections(snap, lookups()), "transmuters-stone").find(c => c.op === "updateActor");
  assert.equal("system.abilities.con.proficient" in keep.data, false);
  snap.system.details = { originalClass: "wizClass" };    // fighter is a multiclass: primary saves not granted
  const reset = byRule(planCorrections(snap, lookups()), "transmuters-stone").find(c => c.op === "updateActor");
  assert.equal(reset.data["system.abilities.con.proficient"], 0);
  assert.equal(core.otherConSave({ items: [fighterClass("x", null)] }, null), true, "no restriction: always granted");
});

test("a re-sync that kept the effects but re-baked the base values: only the reset is planned", () => {
  const once = wizard();
  const fixed = applyToSnapshot(once, planCorrections(once, lookups()));
  fixed.system.attributes.senses.ranges.darkvision = 60;   // the sync bakes it again
  fixed.system.abilities.con.proficient = 1;
  const got = planCorrections(fixed, lookups()).changes;
  assert.deepEqual(got.map(c => [c.rule, c.op]), [["transmuters-stone", "updateActor"]]);
});

/* the whole plan */

test("idempotent: the corrected snapshot plans nothing", () => {
  for (const make of [wizard, fighter]) {
    const snap = make();
    const fixed = applyToSnapshot(snap, planCorrections(snap, lookups()));
    // the repointed Cast now names a PHB spell, so it is no longer looked up or matched
    assert.deepEqual(planCorrections(fixed, lookups()).changes, [], make.name);
  }
});

test("a frozen item (ignoreItemImport) is skipped by every rule and listed", () => {
  const snap = wizard();
  snap.items.find(i => i._id === "robe").flags = { ddbimporter: { ignoreItemImport: true } };
  snap.items.find(i => i._id === "wand").flags = { ddbimporter: { ignoreItemImport: true } };
  const plan = planCorrections(snap, lookups());
  assert.deepEqual(plan.frozen, ["Robe", "Wand of Magic Missiles"]);
  assert.equal(plan.changes.some(c => c.itemId === "robe" || c.itemId === "wand"), false);
  assert.equal(planCorrections(fighter({ frozenAxe: true }), lookups()).notes.length, 0);
});

test("ignoreItemUpdate alone is not a freeze: ddb-importer still overwrites the item, so the rules apply", () => {
  const snap = wizard();
  snap.items.find(i => i._id === "robe").flags = { ddbimporter: { ignoreItemUpdate: true } };   // e.g. a Chris's Premades item
  snap.items.find(i => i._id === "wand").flags = { ddbimporter: { ignoreItemUpdate: true } };
  const plan = planCorrections(snap, lookups());
  assert.deepEqual(plan.frozen, []);
  assert.equal(core.isFrozen(snap.items.find(i => i._id === "robe")), false);
  assert.ok(plan.changes.some(c => c.itemId === "robe"));
  assert.ok(plan.changes.some(c => c.itemId === "wand"));
  assert.deepEqual(core.FREEZE_FLAGS, ["ignoreItemImport"]);
});

test("needsCorrection: never stamped, or stamped for an earlier import; never for a non-DDB actor", () => {
  assert.equal(needsCorrection(wizard()), true);
  assert.equal(needsCorrection(wizard({ importId: "a", stamp: { importId: "a" } })), false);
  assert.equal(needsCorrection(wizard({ importId: "b", stamp: { importId: "a" } })), true);
  assert.equal(needsCorrection({ ...wizard(), ddb: false }), false);
  assert.equal(needsCorrection(wizard({ importId: null, stamp: { importId: null } })), false);
});

test("needsCorrection: a stamp from another module version is due once (a new rule reaches stamped actors)", () => {
  assert.equal(needsCorrection(wizard({ importId: "a", stamp: { importId: "a", version: "1.2.0" } }), { version: "1.2.1" }), true);
  assert.equal(needsCorrection(wizard({ importId: "a", stamp: { importId: "a", version: "1.2.1" } }), { version: "1.2.1" }), false);
  assert.equal(needsCorrection(wizard({ importId: "a", stamp: { importId: "a", version: "0.0.0" } })), true, "defaults to VERSION");
});

test("summaryLine: one line, change summaries joined, errors counted", () => {
  const changes = [{ summary: "a" }, { summary: "b" }];
  assert.equal(summaryLine("X", changes), "DDB corrections — X: 2 change(s) — a; b");
  assert.equal(summaryLine("X", changes, ["e"]), "DDB corrections — X: 2 change(s) — a; b — 1 error(s), see the console");
});

test("PHB index rows are matched by name only", () => {
  assert.ok(PHB_INDEX.every(e => /^[A-Za-z0-9]{16}$/.test(e._id)));
});

/* transmuters-stone — second review: other darkvision sources, no originalClass */

test("another evident darkvision source keeps the base darkvision and says so", () => {
  const snap = wizard();
  snap.items.push({ _id: "umbral", name: "Umbral Sight", type: "feat", flags: {}, effects: [],
    system: { description: { value: "<p>You gain Darkvision with a range of 60 feet.</p>" } } });
  const plan = planCorrections(snap, lookups());
  const update = byRule(plan, "transmuters-stone").find(c => c.op === "updateActor");
  assert.equal(DARK in (update?.data ?? {}), false, "base darkvision left as is");
  assert.match(plan.notes.find(n => /base darkvision 60 left as is: Umbral Sight/.test(n.note))?.note ?? "", /reset it by hand/);
  const effects = byRule(plan, "transmuters-stone").find(c => c.op === "createEffects").data;
  assert.equal(effects.find(e => e.flags["pentaryn-riders"].stone === "darkvision").disabled, true, "not started on: nothing was reset");
  // other evidence: an effect changing darkvision, an item's own senses; a spell never counts
  assert.deepEqual(otherDarkvision({ items: [
    { _id: "a", name: "Goggles", type: "equipment", system: {}, effects: [{ keys: [DARK] }] },
    { _id: "b", name: "Gift", type: "feat", system: { senses: { ranges: { darkvision: 60 } } } },
    { _id: "c", name: "Darkvision", type: "spell", system: {} },
    { _id: "d", name: "Alert", type: "feat", system: { description: { value: "initiative" } } },
  ] }, null), ["Goggles", "Gift"]);
});

test("a multiclass without originalClass: CON kept on the safe side, with a note", () => {
  const snap = wizard();
  const conClass = (id, name) => ({ _id: id, name, type: "class", flags: {}, effects: [], system: { advancement: {
    t: { type: "Trait", classRestriction: "primary", configuration: { grants: ["saves:con", "saves:str"] }, value: {} } } } });
  snap.items.push(conClass("wiz", "Wizard"), conClass("ftr", "Fighter"));
  const plan = planCorrections(snap, lookups());
  const update = byRule(plan, "transmuters-stone").find(c => c.op === "updateActor");
  assert.equal("system.abilities.con.proficient" in (update?.data ?? {}), false);
  assert.ok(plan.notes.some(n => /no starting class recorded/.test(n.note)));
  snap.system.details = { originalClass: "wiz" };
  assert.ok(!planCorrections(snap, lookups()).notes.some(n => /no starting class recorded/.test(n.note)), "recorded: no note");
});
