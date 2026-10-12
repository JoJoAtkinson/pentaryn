/**
 * ES-1 + ES-2 (final review 2026-10-12, ties-study): a bare claim row — the stake a GM client
 * writes before the dice fall, left behind when that client dies mid-roll or still in flight —
 * is not a held reveal.
 *
 * ES-1: pending() listed a kind or lore claim row as an undelivered reveal (readBeliefs strips
 * `claim`, so the stake read as an empty held row). It now skips it, as the attribute plane
 * always did.
 * ES-2: Deliver on a claim row wrote the player's lock, stamped the row delivered and handed
 * over nothing — the roll was spent for no answer. It now refuses with noPending and writes
 * nothing; `reset` stays the cure for a stranded claim. Fresh world so no other file's
 * sequential state is touched.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const KIND = "zzKind0000000001";
const STAKE = { claim: "zzSession0000001", when: 1 };

const F = await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      {
        id: "guild",
        title: "The Guild",
        category: "Guild",
        dc: 14,
        skill: "his",
        reveal: "<p>Guild hands.</p>",
        miss: "",
        lore: [{ id: "g2", label: "Held oath", dc: 10, skill: "rel", text: "<p>Second oath.</p>", miss: "", hold: true }],
      },
    ],
    "pentaryn-ties.attributeBeliefs": {
      [`attr:guild:g2:${PC}`]: { text: "", total: null, when: 1, delivered: null, claim: "zzSession0000001" },
    },
  },
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" } } } },
    {
      id: NPC,
      name: "ZZ Brakka",
      flags: {
        "pentaryn-ties": {
          kindOf: KIND,
          attributes: ["guild"],
          lore: [{ id: "l1", label: "Debts", dc: 12, skill: "ins", text: "<p>Owes.</p>", miss: "" }],
          beliefs: { [PC]: { kind: { ...STAKE }, [`lore:${NPC}:l1`]: { ...STAKE } } },
        },
      },
    },
  ],
});
const Study = await import("../study.mjs");
const get = id => game.actors.get(id);

test("ES-1: pending() does not list a bare kind or lore claim row as a held reveal", () => {
  assert.deepEqual(Study.pending(), []);
});

for (const [label, args] of [
  ["a kind", []],
  ["a lore", ["l1"]],
  ["an attribute", ["g2", "guild"]],
]) {
  test(`ES-2: Deliver on ${label} claim row refuses (noPending) and spends nothing`, async () => {
    const mark = F.calls.length;
    const ok = await Study.deliver(get(PC), get(NPC), ...args);
    const calls = F.calls.slice(mark);
    assert.equal(ok, false);
    assert.ok(
      calls.some(c => c.op === "notify" && c.level === "warn" && /Nothing is pending/.test(c.message)),
      "the GM is told nothing is pending"
    );
    assert.deepEqual(calls.filter(c => c.op !== "notify"), [], "no document or setting is written");
  });
}
