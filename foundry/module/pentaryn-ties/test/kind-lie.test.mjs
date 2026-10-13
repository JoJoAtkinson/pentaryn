/**
 * M11 (final review 2026-10-12, ties-study): the kind rung-0 lie rule. A failed kind row is a card
 * the player holds only when the kind has an authored rung 0 (the lie Joe wrote into the miss slot);
 * with none, a failed row hands over nothing — a legacy row may still hold the retired generic
 * "nothing about it means anything" line, which is no longer said.
 *
 * Deliver (gate.mjs) and Forget (share.mjs) must agree on it, and they now ask one `missedAndLie`.
 * The review's verifier found forcing `lie: false` left the whole suite green; these pins fail then.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const LIAR = "zzKind0000000001"; // a kind with an authored rung 0
const PLAIN = "zzKind0000000002"; // a kind with no rung 0
const NPC_L = "zzNpc00000000001";
const NPC_P = "zzNpc00000000002";

const bio = { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } };
const MISS = { text: "<p>A sick dog, surely.</p>", tier: 0, total: 6, when: 1, delivered: null };

await bootWorld({
  actors: [
    { id: PC, name: "ZZ Wren", type: "character" },
    { id: PC2, name: "ZZ Talo", type: "character" },
    {
      id: LIAR,
      name: "ZZ Ghoul",
      system: bio,
      flags: {
        "pentaryn-ties": {
          studyTiers: [{ min: 0, text: "<p>A sick dog, surely.</p>" }, { min: 15, text: "<p>A ghoul.</p>" }],
          beliefs: { [PC]: { kind: { ...MISS } }, [PC2]: { kind: { ...MISS, delivered: 1 } } },
        },
      },
    },
    {
      id: PLAIN,
      name: "ZZ Ghast",
      system: bio,
      flags: {
        "pentaryn-ties": {
          studyTiers: [{ min: 15, text: "<p>A ghast.</p>" }],
          beliefs: { [PC]: { kind: { ...MISS } }, [PC2]: { kind: { ...MISS, delivered: 1 } } },
        },
      },
    },
    { id: NPC_L, name: "ZZ Lurker", flags: { "pentaryn-ties": { kindOf: LIAR } } },
    { id: NPC_P, name: "ZZ Prowler", flags: { "pentaryn-ties": { kindOf: PLAIN } } },
  ],
});
const Study = await import("../study.mjs");
const get = id => game.actors.get(id);
const card = (pc, kindId) => get(pc).flags["pentaryn-ties"]?.granted?.[`kind:${kindId}`] ?? null;

test("M11: Deliver hands over a held kind miss only when the kind has an authored rung 0", async () => {
  assert.equal(await settle(Study.deliver(get(PC), get(NPC_L))), true);
  assert.match(card(PC, LIAR)?.text ?? "", /A sick dog/, "the authored lie is the card they hold");

  assert.equal(await settle(Study.deliver(get(PC), get(NPC_P))), true);
  assert.equal(card(PC, PLAIN), null, "no rung 0: the failure is silent, the legacy line is not said");
  assert.ok(get(PLAIN).flags["pentaryn-ties"].beliefs[PC].kind.delivered, "the row is spent all the same");
});

test("M11: Forget gives a kind miss's card back only when the kind has an authored rung 0", async () => {
  for (const [npc, kind] of [
    [NPC_L, LIAR],
    [NPC_P, PLAIN],
  ]) {
    const out = await settle(Study.shareFact({ ns: "kind", subjectId: npc }, [get(PC2)], { notify: false }));
    assert.deepEqual(out.shared, [PC2], `the share over ${kind}'s miss went through`);
    assert.equal(get(kind).flags["pentaryn-ties"].beliefs[PC2].kind.prior.total, 6, "the miss is kept as the prior");
    assert.deepEqual(await settle(Study.forgetFact({ ns: "kind", subjectId: npc }, get(PC2))), { ok: true });
    assert.equal(get(kind).flags["pentaryn-ties"].beliefs[PC2].kind.total, 6, "the miss row is back");
  }
  assert.match(card(PC2, LIAR)?.text ?? "", /A sick dog/, "the authored lie comes back as their card");
  assert.equal(card(PC2, PLAIN), null, "no rung 0: the failure's card is not handed back");
});

test("M11: Deliver and Forget ask one missedAndLie, not two copies of the rule", () => {
  const src = f => readFileSync(new URL(`../study/${f}`, import.meta.url), "utf8");
  assert.match(src("gate.mjs"), /^export function missedAndLie\(/m);
  for (const f of ["gate.mjs", "share.mjs"]) {
    assert.doesNotMatch(src(f), /const lie = \w+\.ns === "kind" && missed/, `${f} still computes the lie inline`);
    assert.match(src(f), /missedAndLie\(fact, (rec|prior)\)/, `${f} asks missedAndLie`);
  }
});
