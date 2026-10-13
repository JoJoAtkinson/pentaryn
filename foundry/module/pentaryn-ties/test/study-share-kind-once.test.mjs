/**
 * perf-4 (final review 2026-10-12, ties-study): a kind Share called `grantKind` once per recipient,
 * and each call composed the tier-25 payload again (`composeStudyPayload`: a biography enrichment
 * plus one per attack). Ruling: a Share is the GM telling the table one thing, so every recipient
 * gets the same words — `shareFact` composes once and hands the text to `grantKind` (`text` option);
 * `grantKind` composes only when no text is given.
 *
 * The fixture's enricher stamps each call with a counter, standing in for an inline roll resolving
 * differently per enrichment: one compose means one stamp, and every recipient reads it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, settle } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const PC2 = "zzPc000000000002";
const PC3 = "zzPc000000000003";
const KIND = "zzKind0000000001";

await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: PC2, name: "ZZ Wren", type: "character" },
    { id: PC3, name: "ZZ Talo", type: "character" },
    { id: KIND, name: "ZZ Ghoul", system: { details: { type: { value: "undead" }, biography: { value: "<p>Grey hunters.</p>" } } } },
  ],
});
const Study = await import("../study.mjs");
const get = a => game.actors.get(a);

const TE = foundry.applications.ux.TextEditor.implementation;
let enrichCalls = 0;
TE.enrichHTML = async html => `${html}<p>stamp ${++enrichCalls}</p>`;

test("perf-4: a kind Share to three composes the tier-25 payload once, and all three get the same words", async () => {
  enrichCalls = 0;
  const out = await settle(Study.shareFact({ ns: "kind", subjectId: KIND }, [get(PC), get(PC2), get(PC3)], { notify: false }));
  assert.deepEqual(out.shared, [PC, PC2, PC3]);
  assert.equal(enrichCalls, 1, `enrichHTML calls: ${enrichCalls} (one compose = one biography enrichment)`);
  const texts = [PC, PC2, PC3].map(p => get(KIND).flags["pentaryn-ties"].beliefs[p].kind.text);
  assert.match(texts[0], /Grey hunters\./);
  assert.match(texts[0], /stamp 1/);
  assert.deepEqual(texts, [texts[0], texts[0], texts[0]]);
  for (const p of [PC, PC2, PC3]) assert.equal(get(KIND).flags["pentaryn-ties"].beliefs[p].kind.tier, 25);
});

test("perf-4: grantKind with no text still composes its own", async () => {
  await get(KIND).update({ "flags.pentaryn-ties.beliefs": null });
  enrichCalls = 0;
  assert.equal(await settle(Study.grantKind(get(PC), get(KIND), 20, { quiet: true })), true);
  assert.equal(enrichCalls, 1);
  assert.match(get(KIND).flags["pentaryn-ties"].beliefs[PC].kind.text, /stamp 1/);
});
