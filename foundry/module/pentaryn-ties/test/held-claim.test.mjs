/**
 * AC-1 (final review 2026-10-12, ties-study): a held cascade must not keep its `#inspect` claim
 * staked while the GM's Deliver/Later prompt is open.
 *
 * The prompt used to be awaited inside the cascade, so the guard's `finally` — the only place the
 * claim is handed back — ran only after the GM answered. While the dialog sat open the subject
 * carried a `#inspect` row for that character. The cascade now reports that it held, the guard
 * releases the claim, and only then asks the GM. Fresh world so no other file's sequential state
 * is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

const F = await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "guild", title: "Salt Guild", category: "Guild", secret: true, dc: 10, skill: "inv", reveal: "<p>Guild hands.</p>", hold: true },
    ],
  },
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["guild"] } } },
  ],
});
const Study = await import("../study.mjs");
const { INSPECT_CLAIM_KEY } = await import("../core/rules.mjs");
const { identifiedKey } = await import("../core/ledgers.mjs");
const inspectRow = () => game.actors.get(NPC).flags["pentaryn-ties"]?.beliefs?.[PC]?.[INSPECT_CLAIM_KEY] ?? null;

test("AC-1: the held-rung prompt opens only after the #inspect claim is released", async () => {
  const DialogV2 = foundry.applications.api.DialogV2;
  const confirm = DialogV2.confirm;
  const seen = [];
  DialogV2.confirm = async function (opts) {
    seen.push(structuredClone(inspectRow()));
    return confirm.call(this, opts);
  };
  try {
    F.rolls.push(17);
    F.dialogs.push(false); // Later
    await settle(Study.inspectAs(game.actors.get(PC), game.actors.get(NPC)));
  } finally {
    DialogV2.confirm = confirm;
  }
  assert.equal(seen.length, 1, "the held rung prompted the GM once");
  assert.equal(seen[0], null, "no #inspect claim is staked while the GM decides");
  assert.equal(inspectRow(), null, "and none is left behind afterwards");
  const held = game.actors.get(NPC).flags["pentaryn-ties"].beliefs[PC][identifiedKey("guild")];
  assert.equal(held.text, "<p>Guild hands.</p>");
  assert.equal(held.delivered, null, "Later leaves the rung held");
});
