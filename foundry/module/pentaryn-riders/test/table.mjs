#!/usr/bin/env node
/**
 * Fixtures for table-core.mjs (concentration summons, Argon shared-uses badges). No
 * dependencies — `node test/table.mjs`; a LEGACY suite of test/run.mjs. Synthetic fixtures.
 */

const { concentrationEffectFor, summonTokenIds, spendsUsesOf, MOD, SUMMON_FLAG, skipsTargetPicker, restoreSlotScaling,
  placeSummonsDefault, isWildcardPath, concentrationResult, arcaneRecoveryCap, arcaneRecoveryDefault, arcaneRecoveryCheck, isArcaneRecovery } = await import("../table-core.mjs");

let pass = 0;
const failures = [];
function check(name, got, want) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; return; }
  failures.push(`  ${name}\n    expected ${w}\n    got      ${g}`);
}

const conc = (id, itemId, { statuses = ["concentrating"], legacy = false } = {}) => ({
  id, uuid: `Actor.A.ActiveEffect.${id}`, statuses: new Set(statuses),
  flags: { dnd5e: { item: legacy ? { data: { _id: itemId } } : { id: itemId, type: "spell" } } }
});

/* ── concentrationEffectFor ──────────────────────────────────────────────── */

const effects = [conc("e1", "sphere"), conc("e2", "fly"), { id: "x", statuses: new Set(), flags: {} }];
check("1 finds the cast's effect", concentrationEffectFor(effects, "sphere")?.id, "e1");
check("2 other item", concentrationEffectFor(effects, "fly")?.id, "e2");
check("3 no effect for an item not concentrated on", concentrationEffectFor(effects, "fireball"), null);
check("4 no item id", concentrationEffectFor(effects, ""), null);
check("5 not a concentration effect (no status)", concentrationEffectFor([conc("e3", "sphere", { statuses: [] })], "sphere"), null);
check("6 re-cast: the newest effect wins", concentrationEffectFor([conc("old", "sphere"), conc("new", "sphere")], "sphere")?.id, "new");
check("7 statuses as an array", concentrationEffectFor([{ ...conc("e4", "sphere"), statuses: ["concentrating"] }], "sphere")?.id, "e4");
check("8 legacy item data (cached copy)", concentrationEffectFor([conc("e5", "sphere", { legacy: true })], "sphere")?.id, "e5");
check("9 custom status id", concentrationEffectFor([conc("e6", "sphere", { statuses: ["conc"] })], "sphere", "conc")?.id, "e6");
check("10 null effects", concentrationEffectFor(null, "sphere"), null);

/* ── summonTokenIds ──────────────────────────────────────────────────────── */

const tok = (id, uuid) => ({ id, flags: uuid ? { [MOD]: { [SUMMON_FLAG]: uuid } } : {} });
const tokens = [tok("t1", "Actor.A.ActiveEffect.e1"), tok("t2", "Actor.A.ActiveEffect.e2"), tok("t3", null), tok("t4", "Actor.A.ActiveEffect.e1")];
check("11 only the ended effect's summons", summonTokenIds(tokens, "Actor.A.ActiveEffect.e1"), ["t1", "t4"]);
check("12 unstamped summons never match", summonTokenIds([tok("t3", null)], "Actor.A.ActiveEffect.e1"), []);
check("13 no uuid → nothing", summonTokenIds(tokens, ""), []);
check("14 another actor's effect id with the same short id", summonTokenIds([tok("t5", "Actor.B.ActiveEffect.e1")], "Actor.A.ActiveEffect.e1"), []);
check("15 null tokens", summonTokenIds(null, "x"), []);

/* ── spendsUsesOf ────────────────────────────────────────────────────────── */

const item = (...targets) => ({ system: { activities: new Map([["a1", { consumption: { targets } }]]).values() } });
const mk = (...targets) => ({ system: { activities: [{ consumption: { targets } }] } });
check("16 Metamagic spends Font of Magic", spendsUsesOf(mk({ type: "itemUses", target: "font", value: "1" }), "font"), true);
check("17 own uses (blank target) is not another item", spendsUsesOf(mk({ type: "itemUses", target: "", value: "1" }), "font"), false);
check("18 spell slots only", spendsUsesOf(mk({ type: "spellSlots", target: "1", value: "1" }), "font"), false);
check("19 second target counts (Sorcery Incarnate)", spendsUsesOf(mk({ type: "itemUses", target: "font" }, { type: "itemUses", target: "innate" }), "innate"), true);
check("20 no activities", spendsUsesOf({ system: {} }, "font"), false);
check("21 iterable activities (Collection-like)", spendsUsesOf(item({ type: "itemUses", target: "font" }), "font"), true);
check("22 null item", spendsUsesOf(null, "font"), false);
check("23 no target id", spendsUsesOf(mk({ type: "itemUses", target: "font" }), ""), false);

/* ── usability Area 5 re-run ─────────────────────────────────────────────── */

check("24 Metamagic skips Argon's target picker; a spell or another feature does not",
  [skipsTargetPicker({ system: { identifier: "careful-spell" } }), skipsTargetPicker({ system: { identifier: "twinned-spell" } }),
   skipsTargetPicker({ system: { identifier: "fireball" } }), skipsTargetPicker({ system: {} }), skipsTargetPicker(null)],
  [true, true, false, false, false]);
const pearl = [{ type: "itemUses", value: "1", target: "" }, { type: "spellSlots", value: "-1", target: "1" }];
const slots = { 1: { value: 5, max: 4 }, 2: { value: 2, max: 3 }, 3: { value: 2, max: 3 }, 4: { value: 0, max: 3 }, 5: { value: 1, max: 2 } };
check("25 Pearl of Power opens on the highest spent slot at or below 3rd (Marrith: 3rd)",
  restoreSlotScaling({ targets: pearl, scaling: { allowed: true, max: "3" }, slots }), 2);
check("26 only 1st spent → 1st (scaling 0); nothing spent → dnd5e's default",
  [restoreSlotScaling({ targets: pearl, scaling: { allowed: true, max: "3" }, slots: { 1: { value: 3, max: 4 }, 2: { value: 3, max: 3 }, 3: { value: 3, max: 3 } } }),
   restoreSlotScaling({ targets: pearl, scaling: { allowed: true, max: "3" }, slots: { 1: { value: 4, max: 4 }, 2: { value: 3, max: 3 }, 3: { value: 3, max: 3 } } })],
  [0, null]);
check("27 Font of Magic (cost grows with the level) and slot → points (spends a slot) are left alone",
  [restoreSlotScaling({ targets: [{ type: "itemUses", value: "1 + @scaling + floor(@scaling / 3)" }, { type: "spellSlots", value: "-1", target: "1" }], scaling: { allowed: true, max: "5" }, slots }),
   restoreSlotScaling({ targets: [{ type: "spellSlots", value: "1", target: "1" }, { type: "itemUses", value: "-1" }], scaling: { allowed: true, max: "9" }, slots })],
  [null, null]);
check("28 no scaling, a 'spellN' target, an uncapped slider",
  [restoreSlotScaling({ targets: pearl, scaling: { allowed: false }, slots }),
   restoreSlotScaling({ targets: [{ type: "spellSlots", value: "-1", target: "spell2" }], scaling: { allowed: true, max: "2" }, slots }),
   restoreSlotScaling({ targets: pearl, scaling: { allowed: true, max: "" }, slots })],
  [null, 1, 4]);

/* ── Area 6 re-run (wizard) ──────────────────────────────────────────────── */

check("29 Summon Undead (prompt off) → Place Summons ticked; no scene, no right, no profiles, not a summon → left",
  [placeSummonsDefault({ type: "summon", create: false, canSummon: true, hasScene: true, profiles: 3 }),
   placeSummonsDefault({ type: "summon", create: false, canSummon: true, hasScene: false, profiles: 3 }),
   placeSummonsDefault({ type: "summon", create: false, canSummon: false, hasScene: true, profiles: 3 }),
   placeSummonsDefault({ type: "summon", create: false, canSummon: true, hasScene: true, profiles: 0 }),
   placeSummonsDefault({ type: "utility", create: false, canSummon: true, hasScene: true, profiles: 1 }),
   placeSummonsDefault({ type: "summon", create: true, canSummon: true, hasScene: true, profiles: 1 })],
  [true, false, false, false, false, false]);
check("30 wildcard paths", [isWildcardPath("modules/x/tokens/skeleton-*.webp"), isWildcardPath("a/b.webp"), isWildcardPath(null)], [true, false, false]);
check("31 concentration: failed vs DC 10 → ended; success → kept; DC shown",
  [concentrationResult({ total: 9, dc: 10, canBreak: true }), concentrationResult({ total: 14, dc: 10, canBreak: false })],
  [{ dc: 10, failed: true, autoBreak: true }, { dc: 10, failed: false, autoBreak: false }]);
check("32 concentration: setting off, Legendary Resistance left, Indomitable, Bardic Inspiration → button only",
  [concentrationResult({ total: 2, dc: 10, canBreak: true, auto: false }).autoBreak,
   concentrationResult({ total: 2, dc: 10, canBreak: true, canResist: true }).autoBreak,
   concentrationResult({ total: 2, dc: 10, canBreak: true, features: ["second-wind", "indomitable"] }).autoBreak,
   concentrationResult({ total: 2, dc: 10, canBreak: true, features: ["bardic-inspiration"] }).autoBreak,
   concentrationResult({ total: 2, dc: 10, canBreak: false }).autoBreak],
  [false, false, false, false, false]);
check("33 concentration: no DC on the roll → failure only as dnd5e says", concentrationResult({ total: 9, dc: null, canBreak: true }), { dc: null, failed: true, autoBreak: true });
const ar = { 1: { value: 1, max: 4 }, 2: { value: 0, max: 3 }, 3: { value: 0, max: 3 }, 4: { value: 0, max: 3 }, 5: { value: 1, max: 2 }, 6: { value: 0, max: 1 } };
check("34 Arcane Recovery budget: half the Wizard level, rounded up", [arcaneRecoveryCap(12), arcaneRecoveryCap(5), arcaneRecoveryCap(1), arcaneRecoveryCap(0)], [6, 3, 1, 0]);
check("35 default fills the highest spent slots first, never 6th", arcaneRecoveryDefault(ar, 6), { 1: 1, 5: 1 });
check("36 level 4 wizard (2 levels): one 2nd", arcaneRecoveryDefault({ 1: { value: 0, max: 3 }, 2: { value: 0, max: 2 } }, 2), { 2: 1 });
check("37 nothing spent → nothing", arcaneRecoveryDefault({ 1: { value: 4, max: 4 } }, 6), {});
check("38 checks: ok, over the cap, 6th level, more than spent",
  [arcaneRecoveryCheck({ 3: 2 }, ar, 6), arcaneRecoveryCheck({ 4: 1, 3: 1 }, ar, 6), arcaneRecoveryCheck({ 6: 1 }, ar, 6), arcaneRecoveryCheck({ 1: 4 }, ar, 6)],
  [{ ok: true, used: 6, reason: null }, { ok: false, used: 7, reason: "cap" }, { ok: false, used: 0, reason: "level" }, { ok: false, used: 0, reason: "spent" }]);
check("39 Arcane Recovery by identifier or name; a spell named so is not",
  [isArcaneRecovery({ type: "feat", identifier: "arcane-recovery" }), isArcaneRecovery({ type: "feat", name: "Arcane Recovery" }), isArcaneRecovery({ type: "spell", name: "Arcane Recovery" })],
  [true, true, false]);

/* ── report ──────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`table-core: ${pass} passed, ${failures.length} FAILED\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`table-core: ${pass} passed`);
