/**
 * ES-7 + M10 (final review 2026-10-12, ties-study): `putBelief(fact, id, null)` dropped the row and
 * stopped, so clearing the last row on a creature left `beliefs: {}` behind — litter in every
 * export and diff. `releaseInspect` and `resetIdentification` each carried their own copy of the
 * "unset the whole flag when the last row goes" rule; `releaseClaim` and `forgetFact`'s ident
 * branch had none. One `dropBeliefRow(ledger, characterId, key)` in claim.mjs now does it for all
 * five callers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";
const NPC3 = "zzNpc00000000003";

const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: PC2, name: "ZZ Talo", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { beliefs: { [PC]: { kind: { text: "x", tier: 10 } } } } } },
    {
      id: NPC2,
      name: "ZZ Orla",
      flags: { "pentaryn-ties": { beliefs: { [PC]: { kind: { text: "x" } }, [PC2]: { kind: { text: "y" } } } } },
    },
    { id: NPC3, name: "ZZ Fen" },
  ],
});
const Claim = await import("../study/claim.mjs");
const { putBelief } = await import("../study/apply.mjs");
const get = id => game.actors.get(id);
const beliefs = id => get(id).flags?.["pentaryn-ties"]?.beliefs;

test("ES-7: putBelief(null) on the last row of the last character unsets the beliefs flag, not {}", async () => {
  await putBelief({ ns: "kind", ledger: get(NPC), beliefKey: "kind" }, PC, null);
  assert.equal(beliefs(NPC), undefined, `beliefs left behind: ${JSON.stringify(beliefs(NPC))}`);
  assert.equal("beliefs" in (get(NPC).flags["pentaryn-ties"] ?? {}), false);
});

test("ES-7: putBelief(null) keeps another character's rows", async () => {
  await putBelief({ ns: "kind", ledger: get(NPC2), beliefKey: "kind" }, PC, null);
  assert.deepEqual(beliefs(NPC2), { [PC2]: { kind: { text: "y" } } });
});

test("ES-7: a released flag-plane claim that was the only row unsets the flag (releaseClaim)", async () => {
  const fact = { ns: "kind", ledger: get(NPC3), beliefKey: "kind" };
  assert.equal(await settle(Claim.claimFact(fact, PC, 1)), true);
  assert.ok(beliefs(NPC3)?.[PC]?.kind?.claim);
  await Claim.releaseFact(fact, PC);
  assert.equal(beliefs(NPC3), undefined, `beliefs left behind: ${JSON.stringify(beliefs(NPC3))}`);
});

test("M10: dropBeliefRow is the one drop — row, then character entry, then the whole flag", async () => {
  assert.equal(typeof Claim.dropBeliefRow, "function");
  const doc = get(NPC3);
  await doc.update({ "flags.pentaryn-ties.beliefs": { [PC]: { a: { text: "1" }, b: { text: "2" } }, [PC2]: { a: { text: "3" } } } });
  assert.equal(await Claim.dropBeliefRow(doc, PC, "missing"), false, "an absent row is a no-op");
  assert.equal(await Claim.dropBeliefRow(doc, PC, "a"), true);
  assert.deepEqual(beliefs(NPC3), { [PC]: { b: { text: "2" } }, [PC2]: { a: { text: "3" } } });
  await Claim.dropBeliefRow(doc, PC, "b");
  assert.deepEqual(beliefs(NPC3), { [PC2]: { a: { text: "3" } } });
  await Claim.dropBeliefRow(doc, PC2, "a");
  assert.equal(beliefs(NPC3), undefined);
  const last = F.calls.filter(c => c.op === "update" && c.uuid === `Actor.${NPC3}`).at(-1);
  assert.deepEqual(Object.keys(last.changes), ["flags.pentaryn-ties.beliefs"], "the whole flag, by _del (ES-6)");
});

test("M10: the inline unset-when-last copies are gone; every beliefs row drop goes through dropBeliefRow", () => {
  const count = (f, re) => (readFileSync(new URL(`../study/${f}`, import.meta.url), "utf8").match(re) ?? []).length;
  const LAST = /!others\.length && !rest\.length/g;
  const UNSET = /unsetFlag\(MODULE, BELIEFS_FLAG\)/g;
  const WHOLE = /\{ \[base\]: _del \}/g;
  const DROP = /\bdropRow\(/g;
  // claim.mjs: once each, inside dropBeliefRow (dropRow also appears at its own definition)
  assert.equal(count("claim.mjs", LAST), 1, "claim.mjs: one unset-when-last rule");
  assert.equal(count("claim.mjs", WHOLE), 1, "claim.mjs: one whole-flag _del");
  assert.equal(count("claim.mjs", UNSET), 0, "claim.mjs: the whole flag goes with _del (ES-6), not unsetFlag");
  assert.equal(count("claim.mjs", DROP), 2, "claim.mjs: dropRow defined once, called once (by dropBeliefRow)");
  for (const f of ["cascade.mjs", "apply.mjs", "share.mjs"]) {
    assert.equal(count(f, LAST), 0, `${f} still carries an inline copy`);
    assert.equal(count(f, UNSET), 0, `${f} unsets the beliefs flag itself`);
    assert.equal(count(f, DROP), 0, `${f} drops a beliefs row without dropBeliefRow`);
  }
});
