// combat-core.mjs characterisation (guide S1, core.test). The 320+ rule fixtures stay in the LEGACY
// suite core-fixtures.mjs; this file pins what the refactor must keep: the core imports bare (no
// Foundry global), its export surface (81 names, combat-riders-20), which exports are frozen tables
// (S7's buildApi deep-freezes `core`), the module version, and the rows the legacy suite never reached.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";

const before = Object.keys(globalThis).sort();
const core = await import("../combat-core.mjs");
const manifest = manifestOf(new URL("..", import.meta.url));

test("imported bare: no Foundry global needed or added", () => {
  for (const g of ["game", "Hooks", "CONFIG", "ui", "canvas", "foundry", "document"]) assert.equal(globalThis[g], undefined, g);
  assert.deepEqual(Object.keys(globalThis).sort(), before);
});

// Guide S2's explicit additive delta: the blueprint constants. The S1 golden stays the 81 names.
const ADDED_S2 = ["CONTRACT", "CSS", "HOOKS", "I18N", "MODULE", "NS", "SHORT", "VERSION"];
// Guide S4's: the literal i18n key tables and their reader.
const ADDED_S4 = ["I18N_KEYS", "keyFor"];
// Guide S8's: the Full Attack plan moved out of sequence.mjs, the cancelled-area test out of combat.mjs.
const ADDED_S8 = ["areaPlacementSkipped", "fullAttackPlanFrom"];
// §4 combat-riders-29's pure session-map pruner.
const ADDED_29 = ["pruneOlder"];
// §4 combat-riders-37's named timer delays.
const ADDED_37 = ["DELAYS"];
// combat-core-EXT-11's shared lists: the Attack action's swing kinds and the five movement keys.
const ADDED_EXT11 = ["ATTACK_ACTION_KINDS", "MOVEMENT_KEYS"];
// combat-core-EXT-13's Argon package id, written once (settings.mjs re-exports it).
const ADDED_EXT13 = ["ARGON"];
// Wave 2 ext-8: the one builder for our until-turn-end effects (Dash, Disengage, Steady Aim).
const ADDED_EXT8 = ["turnEffectData"];
// Feedback triage 2026-11 (K, L6): the HP box's arithmetic and Roll manually's d20 dice configuration (core/dice-input.mjs).
const ADDED_TRIAGE = ["arithmeticAssignment", "arithmeticExpression", "manualDiceConfig"];
// 0.3.2: Multiattack "in any combination" — the swing strip's chooser for the swing about to be rolled.
const ADDED_MIX = ["swingChoices"];
// 0.3.4: the per-swing Multiattack picks remembered for the rest of a combat (decision 4, 2026-11-22).
const ADDED_PICKS = ["applySwingPicks", "swingPicksAfter"];
const ADDED = [...ADDED_S2, ...ADDED_S4, ...ADDED_S8, ...ADDED_29, ...ADDED_37, ...ADDED_EXT11, ...ADDED_EXT13, ...ADDED_EXT8, ...ADDED_TRIAGE, ...ADDED_MIX, ...ADDED_PICKS];

test("export surface (golden/core-exports.json): 81 names", () => {
  const names = Object.keys(core).sort();
  pinJSON("core-exports", names.filter(n => !ADDED.includes(n)), import.meta.url);
  assert.equal(names.length, 81 + ADDED.length);
  for (const n of ADDED) assert.ok(names.includes(n), n);
  assert.equal(core.MOD, "pentaryn-combat");
  assert.equal(core.MODULE, core.MOD);
});

test("object exports are frozen tables, rows and arrays included", () => {
  const objects = Object.entries(core).filter(([, v]) => v && typeof v === "object");
  assert.deepEqual(objects.map(([k]) => k).sort(), ["ATTACK_ACTION_KINDS", "DELAYS", "HOOKS", "I18N_KEYS", "MOVEMENT_KEYS", "RECKLESS_CHANGE", "SPECIAL_ACTIONS", "TURN_RIDERS"]);
  const deepFrozen = v => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));
  for (const [k, v] of objects) assert.ok(deepFrozen(v), k);
});

// [declared] Wave 7 batch (W4 version bumps, Joe 2026-10-12), flipped from "0.2.5 (play-test fix PT1-6
// kept)": combat ships the blueprint migration as 0.3.0, with combat-core VERSION. 0.3.1 (2026-11-07):
// feedback triage K (HP box arithmetic) and L6 (Roll manually); a patch, not a minor, because the
// legacy pentarynCombat.* event names sunset at 0.4.0 (HOOKS `until`) and that is its own declared change.
// 0.3.2 (2026-11-21): Multiattack "in any combination" — each swing's weapon is chosen on the strip.
// A patch again: 0.4.0 stays the declared legacy event sunset.
// 0.3.4 (2026-11-22): decision 4 — a Multiattack's per-swing picks are remembered for the rest of the combat.
// 0.3.5 (2026-11-23): FR2-01 — the HUD's Full Attack button applies and remembers them too.
test("module.json version is 0.3.5 (per-swing Multiattack picks remembered for the combat, from the HUD too)", () => {
  assert.equal(manifest.version, "0.3.5");
  assert.equal(core.VERSION, manifest.version);
  assert.equal(manifest.id, core.MOD);
});

/* ── core/dice-input.mjs (feedback triage 2026-11, K and L6): a fixture per rule ─────────────── */

test("arithmeticExpression: an operator inside and no leading sign; every existing form is not arithmetic", () => {
  assert.equal(core.arithmeticExpression("50-10"), "50-10");
  assert.equal(core.arithmeticExpression(" 2*(3+4) "), "2*(3+4)", "trimmed");
  assert.equal(core.arithmeticExpression("100 - 1"), "100 - 1", "spaces inside are fine");
  for (const left of ["=40", "-10", "+5", "50%", "40", "", "abc", "1d8+2", "50.5-10", "(50)", "50 10"]) {
    assert.equal(core.arithmeticExpression(left), null, JSON.stringify(left));
  }
  assert.equal(core.arithmeticExpression(40), null, "not a string");
  assert.equal(core.arithmeticExpression(null), null);
});

test("arithmeticAssignment: the evaluator's result rounded down as '=N'; null for non-arithmetic or a non-finite result; a throw is the caller's", () => {
  const evaluate = e => Function(`"use strict"; return (${e});`)();
  assert.equal(core.arithmeticAssignment("50-10", evaluate), "=40");
  assert.equal(core.arithmeticAssignment("7/2", evaluate), "=3", "D&D rounds down");
  assert.equal(core.arithmeticAssignment("2*(3+4)", evaluate), "=14");
  assert.equal(core.arithmeticAssignment("10-50", evaluate), "=-40", "the sign is the player's: core and dnd5e clamp as they do for =-40");
  assert.equal(core.arithmeticAssignment("1/0", evaluate), null, "Infinity is not a number to set");
  assert.equal(core.arithmeticAssignment("-10", evaluate), null, "a delta is left to core");
  assert.equal(core.arithmeticAssignment("50-10", () => "nope"), null);
  assert.throws(() => core.arithmeticAssignment("50-", evaluate), SyntaxError, "a trailing operator throws in the evaluator; the feature catches it");
});

test("manualDiceConfig: the d20 as Manual on a copy; every other denomination as configured", () => {
  const stored = { d6: "mersenne", default: "" };
  const out = core.manualDiceConfig(stored);
  assert.deepEqual(out, { d6: "mersenne", default: "", d20: "manual" });
  assert.deepEqual(stored, { d6: "mersenne", default: "" }, "the stored object is untouched");
  assert.deepEqual(core.manualDiceConfig({ d20: "mersenne" }), { d20: "manual" }, "a digital d20 is overridden for this roll");
  assert.deepEqual(core.manualDiceConfig(undefined), { d20: "manual" });
  assert.deepEqual(core.manualDiceConfig(null), { d20: "manual" });
});

test("VERSION === module.json version", () => {
  assert.equal(core.VERSION, manifest.version);
});

test("classifySwing: a reaction-activation attack on your own turn is a reaction", () => {
  assert.equal(core.classifySwing({ activation: "reaction", isOwnTurn: true, inCombat: true }), "reaction");
  assert.equal(core.classifySwing({ activation: "legendary" }), "other");
  assert.equal(core.classifySwing({ activation: "" }), "main");
});

test("riderEligibility for a plain weapon rider: offered, auto as the rider says, no checks", () => {
  const [, , colossus, divine] = core.TURN_RIDERS;
  assert.deepEqual(core.riderEligibility({ rider: colossus, weapon: { melee: true } }), { offer: true, auto: false, checks: [] });
  assert.deepEqual(core.riderEligibility({ rider: divine, weapon: { ranged: true } }), { offer: true, auto: true, checks: [] });
  assert.deepEqual(core.riderEligibility({ rider: divine, used: "used" }), { offer: false, auto: false, checks: [] });
});

test("riderDice: a scale value given as number + faces", () => {
  assert.equal(core.riderDice(core.riderByKey("sneak-attack"), { number: 4, faces: 6 }), "4d6");
  assert.equal(core.riderDice(core.riderByKey("sneak-attack"), { number: 4 }), "");
  assert.equal(core.riderDice(core.riderByKey("frenzy"), 3), "3d6");
  assert.equal(core.riderDice(null), "");
});

test("EC-5: Frenzy's dice are its Rage Damage bonus in d6s; no positive bonus is no dice, never 0d6", () => {
  const frenzy = core.riderByKey("frenzy");
  for (const none of [null, undefined, "", 0, "0", -1, 2.5, "x", { value: 0 }, { value: null }, { value: "" }]) {
    assert.equal(core.riderDice(frenzy, none), "", `scale ${JSON.stringify(none)}`);
  }
  assert.equal(core.riderDice(frenzy, 3), "3d6");
  assert.equal(core.riderDice(frenzy, { value: 3 }), "3d6");
  assert.equal(core.riderDice(frenzy, "4"), "4d6");
});

test("tidyDiceCount: a resolver that throws leaves the part alone", () => {
  assert.equal(core.tidyDiceCount("(@scale.barbarian.rage-damage)d6", () => { throw new Error("x"); }), "(@scale.barbarian.rage-damage)d6");
  assert.equal(core.tidyDiceCount("(@scale.barbarian.rage-damage)d6", () => "2"), "2d6");
  assert.equal(core.tidyDiceCount(7), 7);
});

test("combat-core-EXT-12: core.followUps greys Flurry itself when no Focus is left; the strike count lives in core once", () => {
  const turn = core.freshTurn("c1:1:cb1");
  const monk = { turn, features: ["monks-focus", "martial-arts"], focus: 0, unarmedId: "unarmed" };
  assert.deepEqual(core.followUps(monk), [
    { kind: "flurry", weaponId: "unarmed", count: 2, disabled: "focus" },
    { kind: "martial-arts", weaponId: "unarmed", count: 1 },
  ]);
  assert.deepEqual(core.followUps({ ...monk, features: ["monks-focus", "heightened-focus"], focus: null }),
    [{ kind: "flurry", weaponId: "unarmed", count: 3, disabled: "focus" }], "no Focus pool, Heightened Focus: 3, greyed");
  assert.deepEqual(core.followUps({ ...monk, focus: 1 })[0], { kind: "flurry", weaponId: "unarmed", count: 2 }, "Focus left: live");
  // Not greyed-offered when the live one would not be: off-turn, Bonus spent, no Unarmed Strike, Martial Arts or Flurry used.
  assert.deepEqual(core.followUps({ ...monk, isOwnTurn: false }), []);
  assert.deepEqual(core.followUps({ ...monk, bonusFree: false }), []);
  assert.deepEqual(core.followUps({ ...monk, turn: { ...turn, bonusUsed: true } }), []);
  assert.deepEqual(core.followUps({ ...monk, unarmedId: null }), []);
  assert.deepEqual(core.followUps({ ...monk, turn: core.recordFollowUp(turn, "martial-arts") }), []);
  assert.deepEqual(core.followUps({ ...monk, turn: core.recordFollowUp(turn, "flurry") }), []);
  assert.deepEqual(core.followUps({ ...monk, features: ["martial-arts"] }).map(f => f.kind), ["martial-arts"], "no Monk's Focus: no Flurry at all");
});

test("decision 4: a Multiattack's per-swing picks are remembered by place and reapplied where that swing offers them", () => {
  const mix = { kind: "main", mode: null, group: 0, choices: ["scim", "pistol"] };
  const swings = [{ ...mix, weaponId: "scim", result: "rolled" }, { ...mix, weaponId: "pistol", result: "rolled" }, { ...mix, weaponId: "pistol" }];
  const picks = core.swingPicksAfter(swings, 1, { 0: "scim" });
  assert.deepEqual(picks, { 0: "scim", 1: "scim", 2: "pistol" }, "rolled swings only, by their place in the whole Multiattack");
  const next = core.applySwingPicks([{ ...mix, weaponId: "scim" }, { ...mix, weaponId: "scim" }, { kind: "main", mode: null, weaponId: "bite" }], { 2: "pistol", 3: "pistol" }, 1);
  assert.deepEqual(next.map(s => s.weaponId), ["scim", "pistol", "bite"], "a swing that does not offer the pick keeps its weapon");
  assert.equal(core.applySwingPicks(swings, null, 0), swings, "no memory: unchanged");
});
