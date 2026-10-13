/**
 * R1 [declared] (final review ties-core, 2026-10-12; defect wave 2): a `kind:` id is an ACTOR id, so
 * `clampAttribute` keeps its case — sanitised to `[A-Za-z0-9]` and cut at 64, nothing else. Before,
 * it was lowercased, so "Write an entry for this" on a kind row stored a dead id that never matched
 * the actor. The GM ready step `repairKindIds` rewrites those dead rows to the one actor id they
 * match ignoring case; an ambiguous, unmatched or already-authored row is left alone.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { clampAttribute, planKindIdRepairs, readRegistry } from "../known-core.mjs";

const GOBLIN = "zzKindGoblinAb01";
const ORC = "zzKindOrcAbcd001";
const TWIN_A = "zzTwinAAAAAAAA01";
const TWIN_B = "ZZtwinaaaaaaaa01";
const FRESH = "zzKindFreshAb001";
const PLAYER = "zzPlayerUser0001";

const REGISTRY = [
  { id: "kind:zzkindgoblinab01", title: "Goblin Kind" }, // dead, one match → repaired
  { id: "kind:zzkindorcabcd001", title: "Orc Kind (old)" }, // dead, but the real id is authored → left
  { id: `kind:${ORC}`, title: "Orc Kind" },
  { id: "kind:zzTWINaaaaaaaa01", title: "Twin Kind" }, // two actors match ignoring case → left
  { id: "kind:zznoactor0000001", title: "Ghost Kind" }, // no actor at all → left
  { id: "goblinlore", title: "Goblin Lore", parent: "kind:zzkindgoblinab01" }, // follows its parent
];

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [GOBLIN, ORC, TWIN_A, TWIN_B, FRESH].map(id => ({ id, name: `ZZ ${id}`, system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } })),
});
const At = await import("../attributes.mjs");

test("R1: clampAttribute keeps a kind: actor id's case, still sanitised and capped", () => {
  assert.equal(clampAttribute({ id: `kind:${GOBLIN}` }).id, `kind:${GOBLIN}`);
  assert.equal(clampAttribute({ id: ` kind:Ab-C 1<b>2\n` }).id, "kind:AbC1b2");
  assert.equal(clampAttribute({ id: `kind:${"Ab".repeat(40)}` }).id, `kind:${"Ab".repeat(32)}`);
  assert.equal(clampAttribute({ id: "kind:!!!" }), null);
  // two ids that differ only in case are two actors, so two entries
  assert.deepEqual(readRegistry([{ id: "kind:AbC" }, { id: "kind:abc" }]).map(e => e.id), ["kind:AbC", "kind:abc"]);
  // the other namespaces are unchanged
  assert.equal(clampAttribute({ id: "species:High Elf" }).id, "species:highelf");
  assert.equal(clampAttribute({ id: "Salt Guild" }).id, "saltguild");
});

test("R1: planKindIdRepairs maps only a dead kind row with exactly one case-insensitive actor match", () => {
  assert.deepEqual(planKindIdRepairs(REGISTRY, [GOBLIN, ORC, TWIN_A, TWIN_B]), [{ from: "kind:zzkindgoblinab01", to: `kind:${GOBLIN}` }]);
  // two dead spellings of one actor: the first takes the id, the second is left alone
  assert.deepEqual(planKindIdRepairs([{ id: "kind:abc" }, { id: "kind:ABC" }], ["AbC"]), [{ from: "kind:abc", to: "kind:AbC" }]);
  assert.deepEqual(planKindIdRepairs(null, [GOBLIN]), []);
});

test("R1: the GM ready step repaired the dead goblin row (and its child's parent), nothing else", () => {
  const ids = At.registry().map(e => e.id);
  assert.deepEqual(ids, [`kind:${GOBLIN}`, "kind:zzkindorcabcd001", `kind:${ORC}`, "kind:zzTWINaaaaaaaa01", "kind:zznoactor0000001", "goblinlore"]);
  assert.equal(At.attributeById(`kind:${GOBLIN}`).title, "Goblin Kind");
  assert.equal(At.attributeById("goblinlore").parent, `kind:${GOBLIN}`);
});

test("R1: a re-run repairs nothing; a player repairs nothing", async () => {
  assert.equal(await At.repairKindIds(), 0);
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    assert.equal(await At.repairKindIds(), 0);
  } finally {
    game.user = gm;
  }
});

test("R1: authoring an entry for a kind row stores the actor's own id, and a second click is the ordinary collision", async () => {
  const made = await At.authorEntry({ id: `kind:${FRESH}`, title: "Fresh Kind" });
  assert.equal(made.ok, true);
  assert.equal(made.entry.id, `kind:${FRESH}`);
  assert.equal(At.attributeById(`kind:${FRESH}`).title, "Fresh Kind");
  const again = await At.authorEntry({ id: `kind:${FRESH}`, title: "Fresh Kind" });
  assert.equal(again.reason, "collision");
  assert.equal(again.existing.id, `kind:${FRESH}`);
});
