/**
 * Characterisation (ties checkpoint, wave 1): the published `game.pentaryn.ties` surface as a GM,
 * and the behaviour behind the two paths decision D1 renames — `attributes.describe` and
 * `study.inspect` — called THROUGH the published path, so a rename that keeps the old name as an
 * alias must leave these rows unchanged. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON } from "./kit/harness.mjs";
import { boot, surfaceOf } from "./fixtures/boot.mjs";
import { KIND_ACTOR, REGISTRY } from "./fixtures/registry.mjs";

const F = await boot({ settings: { "pentaryn-ties.attributes": REGISTRY }, actors: [KIND_ACTOR] });
const T = () => game.pentaryn.ties;

test("stub runs Foundry's own common/", () => {
  console.log(`  foundry build ${F.foundryBuild} (${F.utilsSource})`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("surface: every published path and its function name (GM, game.pentaryn absent before ready)", () => {
  pinJSON("surface-legacy", surfaceOf(T()), import.meta.url);
});

test("attributes.describe: authored (24 keys) and derived (10 keys) shapes, misses → null", async () => {
  await characterise("attributes-describe", ref => T().attributes.describe(ref), [
    "ashfallcompany",
    "Ashfall Company",
    "  ashfall company  ",
    { id: "ashfallcompany" },
    "greywatch",
    "size:med",
    "type:humanoid",
    "size:huge",
    "type:Fey Things",
    "species:Wood Elf",
    `kind:${KIND_ACTOR.id}`,
    "kind:zzNoSuchActor001",
    "Twin",
    "nope",
    "",
    "   ",
    [null],
    [undefined],
    42,
    "ashfallcompany:extra"
  ], { file: import.meta.url });
});

test("attributes.describe: an authored record has 24 keys, a derived one 10 (live SF9)", () => {
  assert.equal(Object.keys(T().attributes.describe("ashfallcompany")).length, 24);
  assert.equal(Object.keys(T().attributes.describe("type:humanoid")).length, 10);
});

test("study.inspect as GM: the refusals that return before any write", async () => {
  const owner = { id: "zzPc000000000001", isOwner: true, inCombat: false };
  const subject = { id: "zzNpc00000000001" };
  const before = F.calls.length;
  await characterise("study-inspect-gm", (c, s) => T().study.inspect(c, s), [
    [null, subject],
    [undefined, subject],
    [{ id: "zzPc000000000002", isOwner: false }, subject],
    [owner, null],
    [owner, undefined]
  ], { file: import.meta.url });
  assert.deepEqual(F.calls.slice(before), [], "a refusal writes, emits and notifies nothing");
});
