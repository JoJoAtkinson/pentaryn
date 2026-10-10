#!/usr/bin/env node
/**
 * Fixtures for table-core.mjs (concentration summons, Argon shared-uses badges). No
 * dependencies — `node test/table.mjs`; also run at the end of test/run.mjs. Synthetic fixtures.
 */

const { concentrationEffectFor, summonTokenIds, spendsUsesOf, MOD, SUMMON_FLAG } = await import("../table-core.mjs");

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

/* ── report ──────────────────────────────────────────────────────────────── */

if (failures.length) {
  console.error(`table-core: ${pass} passed, ${failures.length} FAILED\n${failures.join("\n")}`);
  process.exit(1);
}
console.log(`table-core: ${pass} passed`);
