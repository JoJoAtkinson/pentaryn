// The three pure cores, beyond the LEGACY fixture suites: they import with no Foundry globals, their
// export surfaces (golden/core-exports.json; S2 may only ADD constants), one module id, which object
// exports are frozen (S6's buildApi freezes a copy of `core`), and the once-per-casting guard over a
// long chat log (guide §4: the index by origin must give the same answer).
//
// Guide §2.1 note for S6: table-core's METAMAGIC is a mutable Set, not frozen. S6 kept it out of
// `api.core` (a frozen copy of riders-core's exports only); the Set itself is unchanged (pinned).
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, readJSON } from "./kit/harness.mjs";

assert.equal(globalThis.game, undefined);
assert.equal(globalThis.foundry, undefined);
const riders = await import("../riders-core.mjs");
const table = await import("../table-core.mjs");
const rituals = await import("../rituals-core.mjs");
const manifest = readJSON(new URL("../module.json", import.meta.url));

const surface = ns => Object.fromEntries(Object.keys(ns).sort().map(k => [k, Array.isArray(ns[k]) ? "array" : ns[k] instanceof Set ? "set" : typeof ns[k]]));

test("the cores load with no game / foundry / CONFIG globals", () => {
  assert.equal(globalThis.CONFIG, undefined);
  assert.equal(typeof riders.planRiders, "function");
});

test("export surfaces include everything recorded at the checkpoint (golden/core-exports.json), same kinds", () => {
  const now = { "riders-core": surface(riders), "table-core": surface(table), "rituals-core": surface(rituals) };
  if (process.env.GOLDEN_UPDATE === "1") pinJSON("core-exports", now, import.meta.url);
  const recorded = readJSON(new URL("./golden/core-exports.json", import.meta.url));
  for (const [file, exports] of Object.entries(recorded)) {
    for (const [name, kind] of Object.entries(exports)) assert.equal(now[file][name], kind, `${file}: ${name}`);
  }
});

test("one module id: riders-core and table-core name the same one, the manifest's", () => {
  assert.equal(riders.MOD, manifest.id);
  assert.equal(table.MOD, riders.MOD);
});

test("frozen object exports: the rule tables and type lists", () => {
  for (const [name, v] of Object.entries({ RULES: riders.RULES, ADEPT_TYPES: riders.ADEPT_TYPES, AFFINITY_TYPES: riders.AFFINITY_TYPES, AFTER_FAIL_FEATURES: table.AFTER_FAIL_FEATURES, LONG_ACTIVATIONS: rituals.LONG_ACTIVATIONS })) {
    assert.ok(Object.isFrozen(v), name);
  }
  for (const r of riders.RULES) assert.ok(Object.isFrozen(r), r.key);
});

test("KNOWN: table-core's METAMAGIC is a mutable Set (skipsTargetPicker reads it)", () => {
  assert.ok(table.METAMAGIC instanceof Set);
  assert.equal(Object.isFrozen(table.METAMAGIC), false);
  assert.equal(table.METAMAGIC.size, 10);
  assert.equal(table.skipsTargetPicker({ system: { identifier: "careful-spell" } }), true);
  assert.equal(table.skipsTargetPicker({ system: { identifier: "fire-bolt" } }), false);
  assert.equal(table.skipsTargetPicker(null), false);
});

test("usedFromMessages over a 200-message log: only the card's own damage messages count", () => {
  const log = [];
  for (let i = 0; i < 200; i++) {
    const origin = `card${String(i % 9).padStart(12, "0")}`;
    const applied = [["elemental-affinity"], [], ["healer", "elemental-adept"], ["healer"], []][(i % 9) % 5];
    log.push({ _source: { system: { origin: i % 11 === 0 ? undefined : origin } }, flags: i % 13 === 0 ? {} : { [riders.MOD]: { applied } } });
  }
  const answer = Object.fromEntries([0, 1, 2, 3, 4, 5, 6, 7, 8].map(n => [n, riders.usedFromMessages(log, `card${String(n).padStart(12, "0")}`)]));
  pinJSON("used-from-200", answer, import.meta.url);
  assert.deepEqual(riders.usedFromMessages(log, null), []);
  assert.deepEqual(riders.usedFromMessages(log, "nocard"), []);
  assert.deepEqual(riders.usedFromMessages(null, "card000000000000"), []);
});

test("S2: riders-core exports MODULE (MOD kept as its alias) and a version constant equal to the manifest's version", () => {
  assert.equal(riders.MODULE, manifest.id);
  assert.equal(riders.MOD, riders.MODULE);
  assert.equal(riders.VERSION, manifest.version);
});

test("S6: every object export reachable from api.core is frozen (METAMAGIC kept out or a frozen array)", () => {
  // api.core is a frozen copy of riders-core's exports (buildApi); riders-core's own object exports
  // are frozen too, and table-core's mutable METAMAGIC is not among them.
  for (const [name, v] of Object.entries(riders)) if (v && typeof v === "object") assert.ok(Object.isFrozen(v), name);
  assert.equal("METAMAGIC" in riders, false);
});

test("spell view (EBGqNA): inPreparedView hides only an unprepared levelled spell of a preparing method not cast from an item", () => {
  const rows = [
    [{ type: "spell", level: 1, canPrepare: true, prepared: 0 }, false],
    [{ type: "spell", level: 9, canPrepare: true, prepared: 0 }, false],
    [{ type: "spell", level: 1, canPrepare: true, prepared: 1 }, true],
    [{ type: "spell", level: 1, canPrepare: true, prepared: 2 }, true],
    [{ type: "spell", level: 0, canPrepare: true, prepared: 0 }, true],               // a cantrip
    [{ type: "spell", level: 3, canPrepare: false, prepared: 0 }, true],              // at-will, innate, ritual method
    [{ type: "spell", level: 3, canPrepare: true, prepared: 0, linked: true }, true], // cast from a staff
    [{ type: "weapon", level: 1, canPrepare: true, prepared: 0 }, true],
    [{}, true],
    [undefined, true],
  ];
  for (const [input, want] of rows) assert.equal(riders.inPreparedView(input), want, JSON.stringify(input));
  assert.deepEqual(riders.spellViewCounts(rows.map(r => r[0])), { total: 7, shown: 5, hidden: 2 });
  assert.deepEqual(riders.spellViewCounts(null), { total: 0, shown: 0, hidden: 0 });
  assert.deepEqual(["all", "prepared", "junk", undefined].map(riders.spellViewOf), ["all", "prepared", "prepared", "prepared"]);
  assert.ok(Object.isFrozen(riders.SPELL_VIEWS));
});
