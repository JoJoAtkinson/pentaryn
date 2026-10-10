#!/usr/bin/env node
/**
 * Fixtures for riders-core.mjs. No dependencies — `node test/run.mjs`.
 *
 * Nothing Foundry is stubbed: importing the core bare is itself the proof that it stays pure.
 * Synthetic fixtures only (test/ is published with the module).
 */

const core = await import("../riders-core.mjs");
const {
  RULES, ruleByKey, normalizeName, matchRule, resolveTypes, termTypes, planDice, withModifier,
  parseFormula, formatTerms, bonusTerms, transformFormula, planRiders, pickSpend, pickRestore,
  battleMedicFormula, clampHeal, carriedAbilities, riderFlag, noteParts, usedFromMessages, MOD,
  ADEPT_TYPES, AFFINITY_TYPES
} = core;

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}
const ok = (name, cond) => check(name, !!cond, true);

// dnd5e's damage + healing type keys, enough for the fixtures.
const TYPES = new Set(["acid", "bludgeoning", "cold", "fire", "force", "lightning", "necrotic", "piercing",
  "poison", "psychic", "radiant", "slashing", "thunder", "healing", "temphp"]);
const isType = t => TYPES.has(t);

/* ── rules table ──────────────────────────────────────────────────────────── */

check("1 rule keys", RULES.map(r => r.key),
  ["elemental-adept", "elemental-affinity", "potent-spellcasting-druid", "potent-spellcasting-cleric", "healer"]);
ok("2 table frozen", Object.isFrozen(RULES) && Object.isFrozen(RULES[0]));
check("3 ruleByKey miss", ruleByKey("nope"), null);

/* ── matching ─────────────────────────────────────────────────────────────── */

check("10 normalizeName strips paren", normalizeName("Elemental Adept (Fire)"), "elemental adept");
check("11 normalizeName curly apostrophe", normalizeName("Healer’s  Kit"), "healer's kit");
const adept = ruleByKey("elemental-adept");
ok("12 match by identifier", matchRule(adept, { identifier: "elemental-adept", name: "x", type: "feat" }));
ok("13 match by source", matchRule(adept, { source: "Compendium.dnd-players-handbook.feats.Item.phbftElementalAd", name: "x", type: "feat" }));
ok("14 match by name with type suffix", matchRule(adept, { name: "Elemental Adept (Fire)", type: "feat" }));
ok("15 no match other feat", !matchRule(adept, { identifier: "alert", name: "Alert", type: "feat" }));
ok("16 healer rule ignores the kit (consumable)", !matchRule(ruleByKey("healer"), { name: "Healer", type: "consumable" }));
ok("17 healer rule matches feat", matchRule(ruleByKey("healer"), { identifier: "healer", name: "Healer", type: "feat" }));
ok("18 druid potent by full name", matchRule(ruleByKey("potent-spellcasting-druid"), { name: "Elemental Fury: Potent Spellcasting", type: "feat" }));
ok("19 cleric potent not by druid identifier", !matchRule(ruleByKey("potent-spellcasting-cleric"), { identifier: "elemental-fury-potent-spellcasting", name: "Elemental Fury: Potent Spellcasting", type: "feat" }));

/* ── type resolution ─────────────────────────────────────────────────────── */

check("20 flag wins", resolveTypes({ flagType: "Fire", name: "Elemental Adept (Cold)" }, ADEPT_TYPES), ["fire"]);
check("21 flag array", resolveTypes({ flagType: ["fire", "cold"] }, ADEPT_TYPES), ["fire", "cold"]);
check("22 flag not allowed falls through to name", resolveTypes({ flagType: "poison", name: "Elemental Adept (Thunder)" }, ADEPT_TYPES), ["thunder"]);
check("23 name paren", resolveTypes({ name: "Elemental Adept (Fire)" }, ADEPT_TYPES), ["fire"]);
check("24 single activity type", resolveTypes({ name: "Elemental Affinity", activityTypes: ["fire"] }, AFFINITY_TYPES), ["fire"]);
check("25 five activities → unknown", resolveTypes({ name: "Elemental Affinity", activityTypes: AFFINITY_TYPES }, AFFINITY_TYPES), []);
check("26 nothing → unknown", resolveTypes({ name: "Elemental Adept" }, ADEPT_TYPES), []);

/* ── formula round trip ───────────────────────────────────────────────────── */

for (const [i, f] of [
  "8d6", "8d6[fire]", "1d10r1 + 4", "2d6 + 1d8[radiant] + 3", "1d4min2", "(2d6) * 2 + @mod", "16d6min2[fire] + 4[Elemental Affinity]"
].entries()) check(`30.${i} round trip ${f}`, formatTerms(parseFormula(f)), f);
check("31 shorthand d6", formatTerms(parseFormula("d6")), "1d6");
check("32 parse die", parseFormula("2d8r1min2[fire]")[0], { kind: "die", number: 2, faces: 8, modifiers: ["r1", "min2"], flavor: "fire" });

/* ── term typing (mirrors dnd5e chunkTerms) ───────────────────────────────── */

check("40 roll type for bare dice", termTypes(parseFormula("8d6 + 3"), "fire", isType), ["fire", null, "fire"]);
check("41 flavor overrides per chunk", termTypes(parseFormula("4d6 + 4d6[radiant]"), "fire", isType), ["fire", null, "radiant"]);
check("42 non-type flavor keeps roll type", termTypes(parseFormula("4d6 + 4[Elemental Affinity]"), "fire", isType), ["fire", null, "fire"]);
check("43 * keeps one chunk", termTypes(parseFormula("2d6[cold] * 2"), "fire", isType), ["cold", "cold", "cold"]);

/* ── the formula transforms ───────────────────────────────────────────────── */

const fire = { rollType: "fire", isType };
check("50 adept min2 on fire dice", transformFormula("8d6", { ...fire, types: ["fire"], modifier: "min2" }), "8d6min2");
check("51 adept leaves radiant dice alone", transformFormula("4d6 + 4d6[radiant]", { ...fire, types: ["fire"], modifier: "min2" }), "4d6min2 + 4d6[radiant]");
check("52 adept on fire-flavored dice in a radiant roll", transformFormula("4d6[fire] + 4d6", { rollType: "radiant", isType, types: ["fire"], modifier: "min2" }), "4d6min2[fire] + 4d6");
check("53 adept not on a cold roll", transformFormula("8d8", { rollType: "cold", isType, types: ["fire"], modifier: "min2" }), "8d8");
check("54 min2 not doubled", transformFormula("8d6min2", { ...fire, types: ["fire"], modifier: "min2" }), "8d6min2");
check("55 min3 kept over min2", transformFormula("8d6min3", { ...fire, types: ["fire"], modifier: "min2" }), "8d6min3");
check("56 min1 raised to min2", transformFormula("8d6min1", { ...fire, types: ["fire"], modifier: "min2" }), "8d6min2");
check("57 crit-doubled dice still one term", transformFormula("16d6 + 5", { ...fire, types: ["fire"], modifier: "min2" }), "16d6min2 + 5");
check("58 numbers untouched, parenthetical untouched", transformFormula("(2d6) + 3", { ...fire, types: ["fire"], modifier: "min2" }), "(2d6) + 3");
check("59 affinity bonus", transformFormula("8d6", { ...fire, bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }), "8d6 + 4[Elemental Affinity]");
check("60 bonus typed by flavor when roll is another type", transformFormula("4d6[fire] + 4d6", { rollType: "radiant", isType, bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }), "4d6[fire] + 4d6 + 4[fire]");
check("61 negative bonus subtracts", transformFormula("1d10", { ...fire, bonus: { value: -1, label: "Potent Spellcasting" } }), "1d10 - 1[Potent Spellcasting]");
check("62 adept + affinity together", transformFormula("8d6", { ...fire, types: ["fire"], modifier: "min2", bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }), "8d6min2 + 4[Elemental Affinity]");
check("63 healer r1 on healing dice", transformFormula("2d8 + 4", { rollType: "healing", isType, modifier: "r1" }), "2d8r1 + 4");
check("64 r1 not added when it already rerolls", transformFormula("1d8r1 + 4", { rollType: "healing", isType, modifier: "r1" }), "1d8r1 + 4");
check("65 r1 not added over rr<3", transformFormula("1d8rr<3", { rollType: "healing", isType, modifier: "r1" }), "1d8rr<3");
check("66 typed bonus to a fire-typed roll uses the label", bonusTerms(4, { label: "Elemental Affinity", type: "fire", rollType: "fire" }),
  [{ kind: "op", operator: "+" }, { kind: "num", number: 4, flavor: "Elemental Affinity" }]);

check("67 withModifier no change returns null", withModifier(["min2"], "min2"), null);
check("68 withModifier appends", withModifier([], "min2"), ["min2"]);
check("69 planDice all dice when untyped", planDice(parseFormula("1d6 + 2d8[cold] + 3"), { rollType: "fire", isType }), [0, 2]);

/* ── planRiders ───────────────────────────────────────────────────────────── */

const marrith = [{ key: "elemental-adept", types: ["fire"] }, { key: "elemental-affinity", types: ["fire"] }];
const fireball = { isSpell: true, level: 3, classIdentifier: "sorcerer", casterClasses: ["sorcerer"] };
const fireRoll = [{ type: "fire", healing: false, types: ["fire"] }];

check("70 Marrith fireball: min2 + CHA + ignore fire res",
  planRiders({ features: marrith, item: fireball, rolls: fireRoll, abilities: { cha: 5 }, activityType: "save" }),
  {
    dice: [{ roll: 0, modifier: "min2", types: ["fire"], key: "elemental-adept" }],
    bonuses: [{ roll: 0, value: 5, label: "Elemental Affinity", type: "fire", key: "elemental-affinity" }],
    ignoreResistance: ["fire"], applied: ["elemental-adept", "elemental-affinity"], skipped: []
  });

const notSpell = planRiders({ features: marrith, item: { isSpell: false }, rolls: fireRoll, abilities: { cha: 5 } });
check("71 weapon fire damage: nothing", notSpell.applied, []);

const cold = planRiders({ features: marrith, item: fireball, rolls: [{ type: "cold", healing: false, types: ["cold"] }], abilities: { cha: 5 } });
check("72 cold spell: nothing", cold.applied, []);

const ray = planRiders({ features: marrith, item: fireball, rolls: fireRoll, abilities: { cha: 5 }, activityType: "attack", usedThisCasting: ["elemental-affinity"] });
check("73 second Scorching Ray: no CHA, still min2", [ray.bonuses.length, ray.applied, ray.skipped],
  [0, ["elemental-adept"], [{ key: "elemental-affinity", why: "once-per-casting" }]]);

const reroll = planRiders({ features: marrith, item: fireball, rolls: fireRoll, abilities: { cha: 5 }, activityType: "save", usedThisCasting: ["elemental-affinity"] });
check("74 a save spell re-rolled from its card gets CHA again", reroll.bonuses.length, 1);

const flameStrike = planRiders({ features: marrith, item: fireball, abilities: { cha: 5 }, activityType: "save",
  rolls: [{ type: "radiant", healing: false, types: ["radiant"] }, { type: "fire", healing: false, types: ["fire"] }] });
check("75 two-part spell: CHA on the fire roll, min2 on the fire roll only", [flameStrike.bonuses[0].roll, flameStrike.dice.map(d => d.roll)], [1, [1]]);

const noType = planRiders({ features: [{ key: "elemental-adept", types: [] }], item: fireball, rolls: fireRoll });
check("76 adept with no type stays off and says why", [noType.applied, noType.skipped], [[], [{ key: "elemental-adept", why: "no-type" }]]);

const talo = [{ key: "potent-spellcasting-druid" }];
const produceFlame = { isSpell: true, level: 0, classIdentifier: "druid", casterClasses: ["druid"] };
check("77 Talo druid cantrip +WIS",
  planRiders({ features: talo, item: produceFlame, rolls: fireRoll, abilities: { wis: 4 } }).bonuses,
  [{ roll: 0, value: 4, label: "Potent Spellcasting", type: null, key: "potent-spellcasting-druid" }]);
check("78 Talo levelled spell: nothing",
  planRiders({ features: talo, item: { ...produceFlame, level: 1 }, rolls: fireRoll, abilities: { wis: 4 } }).applied, []);
check("79 Talo cantrip with no class falls back to his only caster class",
  planRiders({ features: talo, item: { isSpell: true, level: 0, classIdentifier: "", casterClasses: ["druid"] }, rolls: fireRoll, abilities: { wis: 4 } }).applied,
  ["potent-spellcasting-druid"]);
check("80 a wizard cantrip on a druid/wizard: nothing",
  planRiders({ features: talo, item: { isSpell: true, level: 0, classIdentifier: "wizard", casterClasses: ["druid", "wizard"] }, rolls: fireRoll, abilities: { wis: 4 } }).applied, []);
check("81 Potent Spellcasting skips healing rolls",
  planRiders({ features: talo, item: produceFlame, rolls: [{ type: "healing", healing: true, types: ["healing"] }], abilities: { wis: 4 } }).applied, []);
check("82 zero modifier adds nothing",
  planRiders({ features: talo, item: produceFlame, rolls: fireRoll, abilities: { wis: 0 } }).skipped, [{ key: "potent-spellcasting-druid", why: "zero-modifier" }]);
check("86 a cantrip that already adds +WIS by hand: no second +WIS",
  planRiders({ features: talo, item: { ...produceFlame, carries: ["wis"] }, rolls: fireRoll, abilities: { wis: 5 } }),
  { dice: [], bonuses: [], ignoreResistance: [], applied: [], skipped: [{ key: "potent-spellcasting-druid", why: "already-in-formula" }] });
check("87 a hand-added +CHA does not block +WIS",
  planRiders({ features: talo, item: { ...produceFlame, carries: ["cha"] }, rolls: fireRoll, abilities: { wis: 5 } }).applied,
  ["potent-spellcasting-druid"]);
check("88 carriedAbilities: @abilities.wis.mod", carriedAbilities(["@abilities.wis.mod"], "wis"), ["wis"]);
check("89 carriedAbilities: bare @mod is the activity's ability", carriedAbilities(["", "1d4 + @mod"], "wis"), ["wis"]);
check("89a carriedAbilities: PHB cantrip has none", carriedAbilities(["", ""], "wis"), []);
check("89b carriedAbilities: @abilities.wis.modifier-ish names don't count", carriedAbilities(["@abilities.wis.value"], "wis"), []);
check("89d carriedAbilities: Sorcerous Burst's explode limit is not a bonus", carriedAbilities(["1d8x@mod=8"], "cha"), []);
check("89e carriedAbilities: custom formula that adds it", carriedAbilities(["1d8 + @abilities.wis.mod"], "wis"), ["wis"]);
check("89f Elemental Affinity is not skipped by a carried CHA (Alter Self, Green-Flame Blade add it legitimately)",
  planRiders({ features: [{ key: "elemental-affinity", types: ["fire"] }], item: { isSpell: true, level: 0, carries: ["cha"] },
    rolls: [{ type: "fire", healing: false, types: ["fire"] }], abilities: { cha: 5 } }).applied, ["elemental-affinity"]);
check("89c carriedAbilities: CHA by name", carriedAbilities(["@abilities.cha.mod"], "wis"), ["cha"]);
check("83 Healer: r1 on spell healing only",
  planRiders({ features: [{ key: "healer" }], item: { isSpell: true, level: 1 },
    rolls: [{ type: "healing", healing: true, types: ["healing"] }, { type: "fire", healing: false, types: ["fire"] }] }).dice,
  [{ roll: 0, modifier: "r1", types: null, key: "healer" }]);
check("85 Healer: not on temp HP or max HP spell rolls (they aren't HP restored)",
  planRiders({ features: [{ key: "healer" }], item: { isSpell: true, level: 1 },
    rolls: [{ type: "temphp", healing: true, types: ["temphp"] }, { type: "maximum", healing: true, types: ["maximum"] }] }).applied,
  []);
check("84 Healer: not on a potion",
  planRiders({ features: [{ key: "healer" }], item: { isSpell: false }, rolls: [{ type: "healing", healing: true, types: ["healing"] }] }).applied, []);

/* ── the message flag, the card note, once-per-casting (dnd5e 6 shapes) ───── */

const marrithPlan = planRiders({ features: marrith, item: fireball, rolls: fireRoll, abilities: { cha: 5 }, activityType: "save" });
const flag = riderFlag(marrithPlan, "usageCard0001");
check("110 riderFlag from Marrith's Fireball", flag, {
  applied: ["elemental-adept", "elemental-affinity"], ignoreResistance: ["fire"], origin: "usageCard0001",
  detail: { "elemental-adept": { modifier: "min2" }, "elemental-affinity": { bonus: 5 } }
});
check("111 riderFlag with no origin", riderFlag({ dice: [], bonuses: [], ignoreResistance: [], applied: [] }).origin, null);
check("112 note: Elemental Adept min2 + Elemental Affinity +5", noteParts(flag), [
  { key: "elemental-adept", label: "Elemental Adept", kind: "min", n: "2" },
  { key: "elemental-affinity", label: "Elemental Affinity", kind: "bonus", value: "+5" }
]);
check("113 note: Healer reroll", noteParts(riderFlag(planRiders({ features: [{ key: "healer" }], item: { isSpell: true, level: 1 },
  rolls: [{ type: "healing", healing: true, types: ["healing"] }] }))),
  [{ key: "healer", label: "Healer", kind: "reroll" }]);
check("114 note: negative bonus keeps its sign", noteParts({ applied: ["potent-spellcasting-druid"], detail: { "potent-spellcasting-druid": { bonus: -1 } } }),
  [{ key: "potent-spellcasting-druid", label: "Potent Spellcasting", kind: "bonus", value: "-1" }]);
check("115 note: flag without detail (written by 0.1.0) gives the label", noteParts({ applied: ["elemental-adept"] }),
  [{ key: "elemental-adept", label: "Elemental Adept", kind: "label" }]);
check("116 note: unknown key dropped, empty flag empty", [noteParts({ applied: ["nope"] }), noteParts(null), noteParts({})], [[], [], []]);

// ChatMessage stand-ins: dnd5e 6 keeps the usage card id in _source.system.origin (the live
// system.origin resolves to the ChatMessage document, so it never equals the id).
const usageDoc = { id: "usageCard0001" };
const msg = (origin, applied, liveOrigin = usageDoc) => ({
  _source: { system: { origin } }, system: { origin: liveOrigin },
  flags: applied ? { [MOD]: { applied } } : {}
});
const log = [
  msg("usageCard0001", ["elemental-adept", "elemental-affinity"]),
  msg("usageCard0001", ["elemental-adept"]),
  msg("otherCard0002", ["healer"]),
  msg("usageCard0001", null),
  { flags: { [MOD]: { applied: ["potent-spellcasting-druid"] } } },
  { _source: { system: {} }, flags: { dnd5e: { originatingMessage: "usageCard0001" }, [MOD]: { applied: ["healer"] } } }
];
check("120 usedFromMessages by _source.system.origin", usedFromMessages(log, "usageCard0001"), ["elemental-adept", "elemental-affinity"]);
check("121 usedFromMessages other card", usedFromMessages(log, "otherCard0002"), ["healer"]);
check("122 usedFromMessages no origin", usedFromMessages(log, null), []);
check("123 usedFromMessages ignores the resolved live origin", usedFromMessages([msg("x", ["healer"], { id: "usageCard0001" })], "usageCard0001"), []);
check("124 usedFromMessages ignores the 5.x flag (the migration moves it)", usedFromMessages(log.slice(5), "usageCard0001"), []);
const secondRay = planRiders({ features: marrith, item: fireball, rolls: fireRoll, abilities: { cha: 5 }, activityType: "attack",
  usedThisCasting: usedFromMessages(log, "usageCard0001") });
check("125 second Scorching Ray from the same card: no second CHA", [secondRay.bonuses.length, secondRay.skipped],
  [0, [{ key: "elemental-affinity", why: "once-per-casting" }]]);

/* ── Hit Dice and Battle Medic ────────────────────────────────────────────── */

const pools = [
  { id: "wiz", faces: 6, value: 3, spent: 2 },
  { id: "ftr", faces: 10, value: 0, spent: 4 },
  { id: "rog", faces: 8, value: 2, spent: 0 }
];
check("90 spend largest available", pickSpend(pools)?.id, "rog");
check("91 restore largest spent", pickRestore(pools)?.id, "ftr");
check("92 nothing to spend", pickSpend([{ id: "x", faces: 8, value: 0, spent: 3 }]), null);
check("93 nothing to restore", pickRestore([{ id: "x", faces: 8, value: 3, spent: 0 }]), null);
check("94 NPC pool", pickSpend([{ id: null, faces: 8, value: 5, spent: 0 }])?.faces, 8);
check("95 battle medic formula", battleMedicFormula(10, 4), "1d10r1 + 4");
check("96 battle medic formula no PB", battleMedicFormula(8, 0), "1d8r1");
check("97 parsed battle medic formula", parseFormula(battleMedicFormula(12, 5))[0], { kind: "die", number: 1, faces: 12, modifiers: ["r1"], flavor: "" });
check("98 clamp to die + PB", clampHeal(99, 10, 4), 14);
check("99 clamp negative", clampHeal(-3, 10, 4), 0);
check("100 clamp passes a real roll", clampHeal(9, 10, 4), 9);

/* ── report ───────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`riders-core: ${pass} passed, ${failures.length} FAILED\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`riders-core: ${pass} passed`);

// Ritual Adept fixtures (rituals-core.mjs) — exits 1 on its own failures.
await import("./rituals.mjs");

// Concentration summons + Argon tidy fixtures (table-core.mjs) — exits 1 on its own failures.
await import("./table.mjs");
