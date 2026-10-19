// DDB corrections — the pure rules (ddb-core.mjs), imported bare (no Foundry stub: purity).
// Ported from the 2026-10-19 fix scripts' cases: scripts/tests/test_fix_ddb_pc_cleanup.py (apparel,
// free casts), the wand Cast repoint (2026-10-19-wand-cast-spell.mjs dry run: wand + lens repointed,
// the homebrew axe reported only) and the Transmuter's Stone (2026-10-19-transmuters-stone.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import * as core from "../ddb-core.mjs";
import { DDB_HB, PHB_INDEX, fighter, lookups, wizard } from "./fixtures/ddb.mjs";

const { RULES, planCorrections, needsCorrection, stableId, spellKey, spellUuidsNeeded, summaryLine, STONE_EFFECTS } = core;
const byRule = (plan, id) => plan.changes.filter(c => c.rule === id);

/** Apply a plan to a snapshot the way the adapter does, so idempotence can be checked purely. */
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
    if (c.op === "updateItem") for (const [k, v] of Object.entries(c.data)) set(it, k, v);
    if (c.op === "createEffects") it.effects.push(...c.data.map(e => ({ _id: e._id, name: e.name, disabled: e.disabled, flags: e.flags })));
    if (c.op === "updateActor") for (const [k, v] of Object.entries(c.data)) set(s, k, v);
  }
  return s;
}

test("the rule table: ids in run order, each with label and doc", () => {
  assert.deepEqual(RULES.map(r => r.id), ["apparel-as-equipment", "freecast-innate", "cast-self-uses", "transmuters-stone"]);
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

test("species darkvision or another CON-save source keeps the base values; nothing baked → all benefits off", () => {
  const snap = wizard();
  snap.items.find(i => i.type === "race").system.senses.ranges.darkvision = 60;
  snap.items.push({ _id: "res", name: "Resilient", type: "feat", system: { advancement: [{ configuration: { ability: "con" } }] }, flags: {}, effects: [] });
  const plan = planCorrections(snap, lookups());
  const got = byRule(plan, "transmuters-stone");
  assert.deepEqual(got.map(c => c.op), ["createEffects"]);
  assert.deepEqual(got[0].data.filter(e => !e.disabled).map(e => e.name), ["Transmuter's Stone"]);
  assert.match(plan.notes.find(n => n.rule === "transmuters-stone").note, /player picks/);
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

test("a frozen item is skipped by every rule and listed", () => {
  const snap = wizard();
  snap.items.find(i => i._id === "robe").flags = { ddbimporter: { ignoreItemUpdate: true } };
  snap.items.find(i => i._id === "wand").flags = { ddbimporter: { ignoreItemImport: true } };
  const plan = planCorrections(snap, lookups());
  assert.deepEqual(plan.frozen, ["Robe", "Wand of Magic Missiles"]);
  assert.equal(plan.changes.some(c => c.itemId === "robe" || c.itemId === "wand"), false);
  assert.equal(planCorrections(fighter({ frozenAxe: true }), lookups()).notes.length, 0);
});

test("needsCorrection: never stamped, or stamped for an earlier import; never for a non-DDB actor", () => {
  assert.equal(needsCorrection(wizard()), true);
  assert.equal(needsCorrection(wizard({ importId: "a", stamp: { importId: "a" } })), false);
  assert.equal(needsCorrection(wizard({ importId: "b", stamp: { importId: "a" } })), true);
  assert.equal(needsCorrection({ ...wizard(), ddb: false }), false);
  assert.equal(needsCorrection(wizard({ importId: null, stamp: { importId: null } })), false);
});

test("summaryLine: one line, change summaries joined, errors counted", () => {
  const changes = [{ summary: "a" }, { summary: "b" }];
  assert.equal(summaryLine("X", changes), "DDB corrections — X: 2 change(s) — a; b");
  assert.equal(summaryLine("X", changes, ["e"]), "DDB corrections — X: 2 change(s) — a; b — 1 error(s), see the console");
});

test("PHB index rows are matched by name only", () => {
  assert.ok(PHB_INDEX.every(e => /^[A-Za-z0-9]{16}$/.test(e._id)));
});
