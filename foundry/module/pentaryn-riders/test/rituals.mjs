#!/usr/bin/env node
/**
 * Fixtures for rituals-core.mjs (Ritual Adept). No dependencies — `node test/rituals.mjs`;
 * also run at the end of test/run.mjs so the module's node-test gate covers it.
 * Synthetic fixtures only.
 */

const { spellInfo, isRitualAdept, isAdeptOnlyRitual, adeptRituals, RITUAL_ADEPT_SOURCE } = await import("../rituals-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

const spell = (name, { level = 1, method = "spell", prepared = 0, ritual = true, sourceClass = "", cachedFor = null, type = "spell" } = {}) => ({
  name, type,
  system: { level, method, prepared, sourceClass, properties: new Set(ritual ? ["ritual"] : []) },
  flags: cachedFor ? { dnd5e: { cachedFor } } : {}
});

/* ── Ritual Adept identity ───────────────────────────────────────────────── */

check("1 identifier", isRitualAdept({ type: "feat", identifier: "ritual-adept" }), true);
check("2 PHB source", isRitualAdept({ type: "feat", source: RITUAL_ADEPT_SOURCE }), true);
check("3 name, any case", isRitualAdept({ type: "feat", name: " ritual ADEPT " }), true);
check("4 other feat", isRitualAdept({ type: "feat", identifier: "arcane-recovery", name: "Arcane Recovery" }), false);
check("5 a spell named so is not the feature", isRitualAdept({ type: "spell", name: "Ritual Adept" }), false);
check("6 nothing", isRitualAdept(null), false);

/* ── which spells are ritual-only ───────────────────────────────────────── */

check("7 unprepared wizard ritual", isAdeptOnlyRitual(spellInfo(spell("Detect Magic"))), true);
check("8 prepared ritual stays a normal spell", isAdeptOnlyRitual(spellInfo(spell("Alarm", { prepared: 1 }))), false);
check("9 always-prepared ritual", isAdeptOnlyRitual(spellInfo(spell("Alarm", { prepared: 2 }))), false);
check("10 not a ritual", isAdeptOnlyRitual(spellInfo(spell("Shield", { ritual: false }))), false);
check("11 cantrip", isAdeptOnlyRitual(spellInfo(spell("Light", { level: 0 }))), false);
check("12 innate", isAdeptOnlyRitual(spellInfo(spell("Detect Magic", { method: "innate" }))), false);
check("13 item-granted (ring cast)", isAdeptOnlyRitual(spellInfo(spell("Detect Magic", { cachedFor: ".Item.x.Activity.y" }))), false);
check("14 other class's spell", isAdeptOnlyRitual(spellInfo(spell("Speak with Animals", { sourceClass: "druid" }))), false);
check("15 credited to wizard", isAdeptOnlyRitual(spellInfo(spell("Identify", { sourceClass: "wizard" }))), true);
check("16 not a spell", isAdeptOnlyRitual(spellInfo(spell("Ritual Book", { type: "loot" }))), false);
check("17 properties as array", isAdeptOnlyRitual(spellInfo({ type: "spell", system: { level: 1, method: "spell", prepared: 0, properties: ["ritual"] } })), true);

/* ── the HUD list ───────────────────────────────────────────────────────── */

check("18 sorted by level then name, filtered",
  adeptRituals([
    spell("Phantom Steed", { level: 3 }), spell("Shield", { ritual: false }), spell("Identify"),
    spell("Alarm"), spell("Leomund's Tiny Hut", { level: 3 }), spell("Gentle Repose", { level: 2 }),
    spell("Comprehend Languages", { prepared: 1 })
  ]).map(s => s.name),
  ["Alarm", "Identify", "Gentle Repose", "Leomund's Tiny Hut", "Phantom Steed"]);
check("19 empty", adeptRituals([]), []);

if (failures.length) {
  console.error(`rituals-core: ${pass} passed, ${failures.length} FAILED\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`rituals-core: ${pass} passed`);
