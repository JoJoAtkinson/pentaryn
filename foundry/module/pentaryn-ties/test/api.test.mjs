/**
 * Characterisation (ties checkpoint, wave 1): the published `game.pentaryn.ties` surface as a GM,
 * and the behaviour behind the two paths decision D1 renamed — `attributes.describe` (now
 * `attributes.lookup`) and `study.inspect` (now `study.examine`) — called THROUGH the published path.
 * Frozen once committed; D1 / B1b [declared] moved the calls to the new names (same goldens).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, pinJSON, readJSON } from "./kit/harness.mjs";
import { boot, surfaceOf } from "./fixtures/boot.mjs";
import { KIND_ACTOR, REGISTRY } from "./fixtures/registry.mjs";

const F = await boot({ settings: { "pentaryn-ties.attributes": REGISTRY }, actors: [KIND_ACTOR] });
const T = () => game.pentaryn.ties;

test("stub runs Foundry's own common/", () => {
  console.log(`  foundry build ${F.foundryBuild} (${F.utilsSource})`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

/*
 * Guide S8: once the API is kit-built it gains the kit's members (describe, version, contract,
 * settings, trace, uninstall, inspect, selftest) and later additive rows. So this pin checks that
 * every path in golden/surface-legacy.json survives with the same function name, and that each new
 * member is a kit member or a row the manifest describes. Before S8 it is exactly the old pin.
 */
const KIT_MEMBERS = new Set(["describe", "version", "contract", "settings", "trace", "uninstall", "inspect", "selftest"]);
test("surface: every published path and its function name (GM, game.pentaryn absent before ready)", () => {
  const legacy = readJSON(new URL("./golden/surface-legacy.json", import.meta.url));
  const now = surfaceOf(T());
  for (const [path, name] of Object.entries(legacy)) assert.equal(now[path], name, path);
  const described = new Set((typeof T().describe === "function" ? T().describe().methods : []).map(m => m.path));
  const added = Object.keys(now).filter(p => !(p in legacy) && !KIT_MEMBERS.has(p) && !described.has(p));
  assert.deepEqual(added, [], "a new member that is neither a kit member nor a described row");
});

test("attributes.describe: authored (24 keys) and derived (10 keys) shapes, misses → null", async () => {
  await characterise("attributes-describe", ref => T().attributes.lookup(ref), [
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
  assert.equal(Object.keys(T().attributes.lookup("ashfallcompany")).length, 24);
  assert.equal(Object.keys(T().attributes.lookup("type:humanoid")).length, 10);
});

test("study.inspect as GM: the refusals that return before any write", async () => {
  const owner = { id: "zzPc000000000001", isOwner: true, inCombat: false };
  const subject = { id: "zzNpc00000000001" };
  const before = F.calls.length;
  await characterise("study-inspect-gm", (c, s) => T().study.examine(c, s), [
    [null, subject],
    [undefined, subject],
    [{ id: "zzPc000000000002", isOwner: false }, subject],
    [owner, null],
    [owner, undefined]
  ], { file: import.meta.url });
  assert.deepEqual(F.calls.slice(before), [], "a refusal writes, emits and notifies nothing");
});
