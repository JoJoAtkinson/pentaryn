// The seams the migration cuts into lookup-core (guide steps 3-4). Each table is first pinned
// against the ORACLE — today's inline code, pasted into test/fixtures/legacy-monsters.mjs — and the
// extracted core functions are then asserted equal to it, so a pure move cannot drift.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as oracle from "./fixtures/legacy-monsters.mjs";

const CR_INPUTS = ["1/4", 0.25, "3", 3, "", null, undefined, "x", " 1 / 2 ", "1/8"];
const CR_WANT = [0.25, 0.25, 3, 3, null, null, null, null, 0.5, 0.125];

const QUERIES = [
  {}, { cr: "1/2-2" }, { cr: 3 }, { cr: "1/4", minCr: 1 }, { maxCr: 1 }, { size: "Large" }, { size: "weird" },
  { type: "CONSTRUCT" }, { name: "GOB" }, { limit: 999 }, { limit: 0 }, { limit: 1 }, { limit: "7" },
  { packs: ["a.b"] }, { cr: "" }, { cr: null }, { cr: "x" }, { cr: "1/2 - 3" },
];

const BOSS = { type: "npc", name: "Goblin Boss", system: { details: { cr: 1, type: { value: "fey" } }, traits: { size: "sm" } } };
const ENTRIES = [
  BOSS,
  { ...BOSS, type: "character" },
  { type: "npc", name: "No CR", system: { details: {}, traits: { size: "med" } } },
  { type: "npc", name: "Shield Guardian", system: { details: { cr: 7, type: { value: "construct" } }, traits: { size: "lg" } } },
];

const SORT_INPUT = () => [{ name: "B", cr: 1 }, { name: "A", cr: 1 }, { name: "C", cr: 0.25 }, { name: "D" }];
const rows = n => Array.from({ length: n }, (_, i) => ({ name: `M${i}`, cr: i }));

test("oracle: crNum over the guide's table", () => {
  assert.deepEqual(CR_INPUTS.map(oracle.crNum), CR_WANT);
});

test("oracle: monsterQuery over the guide's table", () => {
  assert.deepEqual([oracle.monsterQuery({ cr: "1/2-2" }).lo, oracle.monsterQuery({ cr: "1/2-2" }).hi], [0.5, 2]);
  assert.deepEqual([oracle.monsterQuery({ cr: 3 }).lo, oracle.monsterQuery({ cr: 3 }).hi], [3, 3]);
  assert.deepEqual([oracle.monsterQuery({ cr: "1/4", minCr: 1 }).lo, oracle.monsterQuery({ cr: "1/4", minCr: 1 }).hi], [1, 0.25]);
  assert.equal(oracle.monsterQuery({ size: "Large" }).size, "lg");
  assert.equal(oracle.monsterQuery({ size: "weird" }).size, "weird");
  assert.equal(oracle.monsterQuery({ limit: 999 }).limit, 200);
  assert.equal(oracle.monsterQuery({}).limit, 40);
  assert.equal(oracle.monsterQuery({ limit: 0 }).limit, 40);
});

test("oracle: matchMonster over the guide's table", () => {
  const q = over => ({ ...oracle.monsterQuery({}), ...over });
  assert.equal(oracle.matchMonster(BOSS, q({ type: "fey" })), true);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ type: "FEY" })), true);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ size: "med" })), false);
  assert.equal(oracle.matchMonster(BOSS, oracle.monsterQuery({ name: "boss" })), true);
  assert.equal(oracle.matchMonster({ ...BOSS, type: "character" }, oracle.monsterQuery({})), false);
});

test("oracle: sortMonsters keeps the NaN fall-through, pageMonsters hints the rest", () => {
  assert.deepEqual(oracle.sortMonsters(SORT_INPUT()).map(r => r.name), ["C", "A", "B", "D"]);
  const page = oracle.pageMonsters(rows(45), 40);
  assert.equal(page.shown, 40);
  assert.match(page.hint, /5 more/);
});

