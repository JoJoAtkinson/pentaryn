/**
 * M10 [declared] (final review ties-core, 2026-10-12; defect wave 2): `attributes.markLearned` keeps
 * the write contract. A missing character (null, undefined, "") is refused `invalid` — the table's
 * "no actor" — not `notFound`, which the table keeps for an attribute that matches nothing. `noLore`
 * (the attribute has no matching lore rows) is a documented row of the closed reason table, and every
 * reason `attributes.mjs` answers is in that table. The refused update answering `writeFailed` is
 * R8's test (review-write-refused.test.mjs). Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzM10Pc000000001";

await bootWorld({
  settings: {
    "pentaryn-ties.attributes": [
      { id: "guild", title: "Salt Guild", category: "Guild", lore: [{ id: "r", label: "Dues", text: "X", dc: 12, skill: "his" }] },
      { id: "bare", title: "Bare Thing", category: "Guild" },
    ],
  },
  actors: [{ id: PC, name: "ZZ M10 PC", type: "character", system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } }],
});
const T = () => game.pentaryn.ties;

test("M10: markLearned refuses a missing character invalid (before: notFound)", async () => {
  for (const missing of [null, undefined, ""]) {
    assert.deepEqual(await T().attributes.markLearned(missing, "guild"), { ok: false, reason: "invalid" }, String(missing));
  }
  assert.deepEqual(await T().attributes.markLearned(PC, "nope"), { ok: false, reason: "notFound" }, "an unknown attribute is still notFound");
});

test("M10: an attribute with no matching lore rows answers noLore, nothing written", async () => {
  assert.deepEqual(await T().attributes.markLearned(PC, "bare"), { ok: false, reason: "noLore" });
  assert.deepEqual(await T().attributes.markLearned(PC, "guild", ["zz-no-row"]), { ok: false, reason: "noLore" });
  assert.equal(game.actors.get(PC).getFlag("pentaryn-ties", "granted"), undefined);
});

test("M10: every reason attributes.mjs answers is a row of the closed reason table (before: noLore missing)", async () => {
  const src = await readFile(new URL("../attributes.mjs", import.meta.url), "utf8");
  const table = new Set([...src.matchAll(/^ \* \| `(\w+)` \|/gm)].map(m => m[1]));
  const used = new Set([...src.matchAll(/\bfail\("(\w+)"/g)].map(m => m[1]));
  assert.ok(table.size >= 8, "the reason table is found");
  for (const reason of used) assert.ok(table.has(reason), `reason "${reason}" is answered but not in the table`);
});
