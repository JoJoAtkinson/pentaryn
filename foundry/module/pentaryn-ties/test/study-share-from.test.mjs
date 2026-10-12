/**
 * Final review (ties-study, rob-6): shareFact's `from` given as a character-id string — the
 * bridge/console form, since opts are not ref-resolved — must mark the share as told exactly as an
 * Actor `from` does (shareFact docblock: "marked as told (`total: null`, `from`)"; grantKind's
 * sibling contract: "`from` is a share's provenance (a character id or "gm")"). Fresh world so
 * study-cascade's sequential state is untouched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const NPC = "zzNpc00000000001";

const REGISTRY = [
  { id: "city", title: "Vel", category: "City", secret: true, dc: 12, skill: "his", reveal: "<p>From Vel.</p>", miss: "<p>A Vel accent?</p>" },
];

await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: PC2, name: "ZZ Wren", type: "character" },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          attributes: ["city"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>He owes the guild.</p>", miss: "<p>Shifty eyes.</p>" }],
        },
      },
    },
  ],
  tokens: [{ id: "zzTokNpc00000001", actorId: NPC }],
});
const Study = await import("../study.mjs");
const get = id => game.actors.get(id);
const beliefs = () => get(NPC).flags["pentaryn-ties"].beliefs ?? {};

test("shareFact: a character-id string `from` marks the share as told", async () => {
  const ident = { ns: "ident", subjectId: NPC, attrId: "city" };
  assert.ok(!["passed", "told", "held"].includes(Study.factStatus(ident, get(PC2)).status), "precondition: PC2 does not know Vel");
  const res = await settle(Study.shareFact(ident, [get(PC2)], { from: PC, notify: false }));
  assert.deepEqual(res.shared, [PC2]);
  assert.equal(beliefs()[PC2]["attr:city:#id"].from, PC);
  assert.equal(Study.factStatus(ident, get(PC2)).status, "told");
  assert.equal((await settle(Study.forgetFact(ident, get(PC2)))).ok, true);

  const lore = { ns: "lore", subjectId: NPC, factId: "l1" };
  assert.ok(!["passed", "told", "held"].includes(Study.factStatus(lore, get(PC2)).status), "precondition: PC2 does not know the debts");
  await settle(Study.shareFact(lore, [get(PC2)], { from: PC, notify: false }));
  assert.equal(beliefs()[PC2][`lore:${NPC}:l1`].from, PC);
  assert.equal(Study.factStatus(lore, get(PC2)).status, "told");
});
