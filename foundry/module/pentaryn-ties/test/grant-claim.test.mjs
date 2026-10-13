/**
 * AC-3 (final review 2026-10-12, ties-study): a grant-only cascade rung wrote its ledger rows
 * without taking the `#inspect` claim, so every GM tab of one account performed it.
 *
 * The claim was taken only for a rung that rolls. A rung the planner hands over automatically (the
 * kin-sense bypass: the roller carries the attribute and it reads `auto`) went straight to
 * `writeIdentification` / `setKnowledge`, so the tab that lost arbitration wrote the rows and the
 * grant too. The claim is now taken before the first write of any kind. Fresh world so no other
 * file's sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "kin", title: "Kin", category: "People", secret: true, dc: 30, skill: "ins", reveal: "<p>One of us.</p>", whenKnown: "enables", whenCarried: "auto" },
    ],
  },
  actors: [
    { id: PC, name: "ZZ Wren", type: "character", flags: { "pentaryn-ties": { attributes: ["kin"] } } },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["kin"] } } },
  ],
});
const Study = await import("../study.mjs");
const { INSPECT_CLAIM_KEY } = await import("../core/rules.mjs");
const { identifiedKey } = await import("../core/ledgers.mjs");

test("AC-3: a tab that loses the #inspect claim writes nothing for a grant-only rung", async () => {
  const subject = game.actors.get(NPC);
  const update = subject.update.bind(subject);
  // another GM tab's stake lands last on every #inspect write, so this tab always loses
  subject.update = async (data, opts) => {
    const out = await update(data, opts);
    const row = subject.flags["pentaryn-ties"]?.beliefs?.[PC]?.[INSPECT_CLAIM_KEY];
    if (row && Object.keys(data).some(k => k.endsWith(INSPECT_CLAIM_KEY))) row.claim = "other-session";
    return out;
  };
  try {
    await settle(Study.inspectAs(game.actors.get(PC), subject));
  } finally {
    subject.update = update;
  }
  const beliefs = subject.flags["pentaryn-ties"]?.beliefs?.[PC] ?? {};
  assert.equal(beliefs[identifiedKey("kin")], undefined, "the losing tab wrote no identification row");
  assert.equal(beliefs[INSPECT_CLAIM_KEY]?.claim, "other-session", "the winner's claim is left alone");
  const granted = game.actors.get(PC).flags["pentaryn-ties"]?.granted ?? {};
  assert.equal(granted[identifiedKey("kin")], undefined, "and granted nothing to the player");
});
