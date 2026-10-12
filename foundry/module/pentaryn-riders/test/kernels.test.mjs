// Guide S7 (combat-riders-26 and its extension): the pure kernels, run from one table against
// verbatim copies of the glue they replace (use-doc §8 step 3). Pure: no Foundry global here.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readJSON } from "./kit/harness.mjs";

assert.equal(globalThis.game, undefined);
const core = await import("../riders-core.mjs");
const table = await import("../table-core.mjs");

/* ── legacy oracles: today's glue, verbatim, over plain stand-ins ─────────── */

function legacyHdPools(actor) {
  const sys = actor?.system;
  const hd = sys?.attributes?.hd;
  if (!hd) return [];
  if (sys.isNPC) {
    return [{ id: null, faces: Number(String(hd.denomination ?? "").replace(/^d/, "")) || 0, value: hd.value ?? 0, spent: hd.spent ?? 0 }];
  }
  return Object.values(actor.classes ?? {}).map(c => ({
    id: c.id,
    faces: Number(String(c.system?.hd?.denomination ?? "").replace(/^d/, "")) || 0,
    value: c.system?.hd?.value ?? 0,
    spent: c.system?.hd?.spent ?? 0
  }));
}
function legacyHdSummary(actor) {
  const pools = legacyHdPools(actor);
  return { value: pools.reduce((a, p) => a + p.value, 0), max: pools.reduce((a, p) => a + p.value + p.spent, 0) };
}
/** cast-flow's restore-slot builder (keyed by s.level, raw values). */
function legacyRestoreSlots(spells) {
  const slots = {};
  for (const [key, s] of Object.entries(spells)) {
    if (/^spell[1-9]$/.test(key) && Number.isFinite(s?.level)) slots[s.level] = { value: s.value, max: s.max };
  }
  return slots;
}
/** cast-flow's Arcane Recovery slotTable (spell1…9 by key, coerced). */
function legacySlotTable(spells) {
  const slots = {};
  for (let level = 1; level <= 9; level++) {
    const s = spells?.[`spell${level}`];
    if (s) slots[level] = { value: Number(s.value) || 0, max: Number(s.max) || 0 };
  }
  return slots;
}

const cls = (id, denomination, value, spent) => ({ id, system: { hd: { denomination, value, spent } } });
const ACTORS = {
  npc: { system: { isNPC: true, attributes: { hd: { denomination: "d8", value: 3, spent: 1 } } } },
  twoClass: { system: { attributes: { hd: {} } }, classes: { wizard: cls("w", "d6", 2, 3), fighter: cls("f", "d10", 1, 0) } },
  junk: { system: { isNPC: true, attributes: { hd: { denomination: "x" } } } },
  noHd: { system: { attributes: {} }, classes: { a: cls("a", "d8", 1, 0) } },
  classNoHd: { system: { attributes: { hd: {} } }, classes: { monk: { id: "m", system: {} } } },
  none: null,
};
const inputsOf = actor => ({
  isNPC: !!actor?.system?.isNPC,
  hd: actor?.system?.attributes?.hd ?? null,
  classes: Object.values(actor?.classes ?? {}).map(c => ({ id: c.id, hd: c.system?.hd })),
});

test("hdPoolsFrom / hdSummaryOf equal today's hdPools / hdSummary on every actor shape", () => {
  for (const [name, actor] of Object.entries(ACTORS)) {
    const pools = core.hdPoolsFrom(inputsOf(actor));
    assert.deepEqual(pools, legacyHdPools(actor), name);
    assert.deepEqual(core.hdSummaryOf(pools), legacyHdSummary(actor), name);
  }
  assert.deepEqual(core.hdPoolsFrom(inputsOf(ACTORS.npc)), [{ id: null, faces: 8, value: 3, spent: 1 }]);
  assert.deepEqual(core.hdPoolsFrom(inputsOf(ACTORS.junk))[0].faces, 0);
  assert.deepEqual(core.hdSummaryOf(core.hdPoolsFrom(inputsOf(ACTORS.twoClass))), { value: 3, max: 6 });
});

test("battleMedicBlockReason: the four refusals in order, null for the owner (or a GM online)", () => {
  const R = core.battleMedicBlockReason;
  assert.equal(R({}), "PENTARYN_RIDERS.battleMedic.needTarget");
  assert.equal(R({ hasTargetActor: true }), "PENTARYN_RIDERS.battleMedic.noHitDice");
  assert.equal(R({ hasTargetActor: true, hasHd: true }), "PENTARYN_RIDERS.battleMedic.noHitDice", "all spent");
  assert.equal(R({ hasTargetActor: true, hasHd: true, canSpend: true }), "PENTARYN_RIDERS.battleMedic.noGM");
  assert.equal(R({ hasTargetActor: true, hasHd: true, canSpend: true, ownsTarget: true }), null);
  assert.equal(R({ hasTargetActor: true, hasHd: true, canSpend: true, gmOnline: true }), null);
  assert.equal(R({ hasTargetActor: true, canSpend: true, ownsTarget: true }), "PENTARYN_RIDERS.battleMedic.noHitDice", "no hd data wins");
});

test("reportRow reproduces the checkpoint's report rows (golden/report-*.json) from plain inputs", () => {
  const sorc = readJSON(new URL("./golden/report-sorcerer.json", import.meta.url));
  assert.deepEqual([
    core.reportRow({ actor: "Ilsa Vantrel", rule: "elemental-adept", items: ["Elemental Adept (Fire)"], typed: true, types: ["fire"] }),
    core.reportRow({ actor: "Ilsa Vantrel", rule: "elemental-affinity", items: ["Elemental Affinity"], typed: true, types: [], manual: 2 }),
  ], sorc);
  assert.deepEqual(core.reportRow({ actor: "Bren Ashwood", rule: "potent-spellcasting-druid", items: ["Elemental Fury: Potent Spellcasting"], hand: { ability: "wis", spells: ["Thorn Whip"] } }),
    { actor: "Bren Ashwood", rule: "potent-spellcasting-druid", items: "Elemental Fury: Potent Spellcasting", status: "active", handAdded: "Thorn Whip already add WIS — rider skips them" });
  const bm = o => core.reportRow({ actor: "M", rule: "healer", items: ["Healer"], battleMedic: o }).battleMedic;
  assert.equal(bm({ installed: false }), "not installed — installBattleMedic(actor)");
  assert.equal(bm({ installed: true, kit: null }), "installed, no kit linked");
  assert.equal(bm({ installed: true, kit: "k1", kitFound: true, kitName: "Healer's Kit" }), "installed, kit Healer's Kit");
  assert.equal(bm({ installed: true, kit: "k1", kitFound: false }), "installed, kit k1 MISSING");
  assert.equal(core.reportRow({ actor: "A", rule: "r", items: [], hand: { ability: "wis", spells: [] } }).handAdded, undefined);
});

test("slotsFrom: spell1–9 by key, coerced; the same answers as both of today's builders for dnd5e's data", () => {
  const spells = { spell1: { level: 1, value: 1, max: 4 }, spell3: { level: 3, value: "0", max: "2" }, pact: { level: 3, value: 0, max: 1 } };
  assert.deepEqual(table.slotsFrom(spells), { 1: { value: 1, max: 4 }, 3: { value: 0, max: 2 } });
  assert.deepEqual(table.slotsFrom(undefined), {});
  const shapes = [
    spells,
    { spell1: { level: 1, value: 1, max: 4 }, spell2: { level: 2, value: 1, max: 3 }, spell3: { level: 3, value: 0, max: 2 }, spell4: { level: 4, value: 0, max: 0 }, spell5: { level: 5, value: 0, max: 0 }, pact: { level: 3, value: 0, max: 1 } },
    { spell1: { level: 1, value: 2, max: 2 }, spell6: { level: 6, value: 0, max: 1 } },
    { spell2: { level: 2, value: 0, max: 2 }, spell9: { level: 9, value: 0, max: 1 } },
  ];
  const restore = { targets: [{ type: "spellSlots", value: "-1", target: "spell1" }] };
  for (const s of shapes) {
    for (const max of ["", "1", "3", "9"]) {
      const scaling = { allowed: true, max };
      assert.equal(table.restoreSlotScaling({ ...restore, scaling, slots: table.slotsFrom(s) }), table.restoreSlotScaling({ ...restore, scaling, slots: legacyRestoreSlots(s) }), JSON.stringify([s, max]));
    }
    for (const cap of [0, 1, 3, 5, 10]) assert.deepEqual(table.arcaneRecoveryDefault(table.slotsFrom(s), cap), table.arcaneRecoveryDefault(legacySlotTable(s), cap));
    assert.deepEqual(table.slotsFrom(s), legacySlotTable(s));
  }
});

test("the concentration line's (failed, key) from concentrationResult equals today's inline reading", () => {
  const legacy = (total, dc) => {
    if (!Number.isFinite(Number(dc)) || dc === null) return null;
    return Number(total) < Number(dc);
  };
  const viaCore = (total, dc) => {
    // concentration.mjs passes Number(roll.total): an unevaluated roll reads NaN (not failed), as before
    const r = table.concentrationResult({ total: Number(total), dc });
    return r.dc === null ? null : !!r.failed;
  };
  for (const [total, dc] of [[8, 10], [12, 10], [10, 10], [8, null], [8, "10"], [8, "x"], [undefined, 10], [null, 10], ["7", 10], [8, ""], [8, undefined]]) {
    assert.equal(viaCore(total, dc), legacy(total, dc), JSON.stringify([total, dc]));
  }
});
