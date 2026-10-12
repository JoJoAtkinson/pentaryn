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
const ADDED = [...ADDED_S2, ...ADDED_S4, ...ADDED_S8, ...ADDED_29, ...ADDED_37];

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
  assert.deepEqual(objects.map(([k]) => k).sort(), ["DELAYS", "HOOKS", "I18N_KEYS", "RECKLESS_CHANGE", "SPECIAL_ACTIONS", "TURN_RIDERS"]);
  const deepFrozen = v => !v || typeof v !== "object" || (Object.isFrozen(v) && Object.values(v).every(deepFrozen));
  for (const [k, v] of objects) assert.ok(deepFrozen(v), k);
});

test("module.json version is 0.2.5 (play-test fix PT1-6 kept)", () => {
  assert.equal(manifest.version, "0.2.5");
  assert.equal(manifest.id, core.MOD);
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

test("tidyDiceCount: a resolver that throws leaves the part alone", () => {
  assert.equal(core.tidyDiceCount("(@scale.barbarian.rage-damage)d6", () => { throw new Error("x"); }), "(@scale.barbarian.rage-damage)d6");
  assert.equal(core.tidyDiceCount("(@scale.barbarian.rage-damage)d6", () => "2"), "2d6");
  assert.equal(core.tidyDiceCount(7), 7);
});
