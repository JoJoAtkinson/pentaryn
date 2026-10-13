/**
 * R8 [declared] (final review ties-core, 2026-10-12; defect wave 2): a refused `actor.update` no
 * longer escapes the Tie, Known and Mark-as-learned writes. `write()` and `writeKnown()` log a warning
 * and answer false; `markLearned` answers `{ ok: false, reason: "writeFailed" }`; `setTie` still
 * answers `wrote || mirrored`, so a refused mirror leaves a written forward side reporting true; and
 * `migrateLegacy` logs one actor's refusal and carries on with the rest — as the adapter's
 * "nothing in here throws" header always promised.
 * Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { write, setTie, migrateLegacy, read } from "../ties-adapter.mjs";
import { writeKnown, addKnown } from "../known-data.mjs";

const PC = "zzR8Pc0000000001";
const NPC = "zzR8Npc000000001";
const OLD1 = "zzR8Old000000001";
const OLD2 = "zzR8Old000000002";

const F = await bootWorld({
  settings: { "pentaryn-ties.attributes": [{ id: "guild", title: "Salt Guild", category: "Guild", lore: [{ id: "r", label: "Dues", text: "X", dc: 12, skill: "his" }] }] },
  actors: [
    { id: PC, name: "ZZ R8 PC", type: "character", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } },
    { id: NPC, name: "ZZ R8 NPC" },
    { id: OLD1, name: "ZZ R8 Old One", flags: { world: { ties: [{ id: PC, name: "ZZ R8 PC", word: "cousin" }] } } },
    { id: OLD2, name: "ZZ R8 Old Two", flags: { world: { ties: [{ id: PC, name: "ZZ R8 PC", word: "rival" }] } } },
  ],
});
const T = () => game.pentaryn.ties;

/** Make one actor's `update` reject, as a server refusal does, for the length of `fn`. */
const refusing = async (actor, fn) => {
  const real = actor.update;
  actor.update = async () => {
    throw new Error("ZZ refused");
  };
  try {
    return await fn();
  } finally {
    actor.update = real;
  }
};
const warnsSince = n => F.console.slice(n).filter(l => l.level === "warn");

test("R8: write() answers false and warns when the update is refused (before: threw)", async () => {
  const pc = game.actors.get(PC);
  const n = F.console.length;
  const out = await refusing(pc, () => write(pc, [{ id: NPC, name: "ZZ R8 NPC", word: "friend" }]));
  assert.equal(out, false);
  assert.equal(warnsSince(n).length, 1, "one warning for the refusal");
});

test("R8: writeKnown() answers false and warns when the update is refused (before: threw)", async () => {
  const pc = game.actors.get(PC);
  const n = F.console.length;
  assert.equal(await refusing(pc, () => writeKnown(pc, [])), false);
  assert.equal(warnsSince(n).length, 1);
  await assert.doesNotReject(refusing(pc, () => addKnown(pc, NPC)), "addKnown rides on writeKnown");
});

test("R8: setTie with a refused mirror still reports the written forward side (before: threw)", async () => {
  const pc = game.actors.get(PC);
  const npc = game.actors.get(NPC);
  const out = await refusing(npc, () => setTie(pc, npc, { word: "friend" }));
  assert.equal(out, true, "wrote || mirrored");
  assert.ok(read(pc).some(t => t.id === NPC), "the forward side landed");
  assert.equal(await refusing(pc, () => refusing(npc, () => setTie(pc, npc, { word: "foe" }))), false, "both refused → false");
});

test("R8: markLearned answers writeFailed when the update is refused (before: threw)", async () => {
  const pc = game.actors.get(PC);
  const n = F.console.length;
  assert.deepEqual(await refusing(pc, () => T().attributes.markLearned(pc, "guild")), { ok: false, reason: "writeFailed" });
  assert.equal(warnsSince(n).length, 1);
  assert.deepEqual((await T().attributes.markLearned(pc, "guild")).ok, true, "an accepted update still marks it");
});

test("R8: migrateLegacy logs one actor's refusal and migrates the rest (before: aborted)", async () => {
  const one = game.actors.get(OLD1);
  const two = game.actors.get(OLD2);
  // the ready hook already migrated both at boot; put them back the old way
  for (const [a, word] of [[one, "cousin"], [two, "rival"]]) {
    a.flags = { world: { ties: [{ id: PC, name: "ZZ R8 PC", word }] } };
  }
  const n = F.console.length;
  const out = await refusing(one, () => migrateLegacy());
  assert.equal(out.moved, 1, "the second actor still migrated");
  assert.equal(read(two)[0]?.word, "rival");
  assert.ok(Array.isArray(one.flags.world?.ties), "the refused actor keeps its legacy rows");
  assert.ok(warnsSince(n).some(l => l.text.includes("ZZ R8 Old One")), "the refusal names the actor");
});
