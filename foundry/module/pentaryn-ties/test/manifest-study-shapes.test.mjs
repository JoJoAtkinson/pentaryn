/**
 * EXT-2 (final review 2026-10-12, ties-study): the study.* manifest rows misstated what five
 * methods return and left out writes three of them make. The rows now say the real shape — each
 * checked against what the implementation actually hands back in a booted world — and list the
 * missing side effects (share/inspectAs/deliverHeld write `known` and the attributeKnowledge setting;
 * deliver writes `studied`).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";

await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: NPC, name: "ZZ Brakka" },
  ],
});
const { MANIFEST } = await import("../api-manifest.mjs");
const T = () => game.pentaryn.ties;
const get = id => game.actors.get(id);
const row = path => MANIFEST.rows.find(r => r.path === path);
const KNOWLEDGE = "setting pentaryn-ties.attributeKnowledge";
const F = "flags.pentaryn-ties";

test("EXT-2: study.tiers returns the cleaned ladder (or false), and the row says so", async () => {
  const out = await T().study.tiers(get(NPC), [{ min: 15, text: "<p>A goblin.</p>" }]);
  assert.ok(Array.isArray(out) && out[0].min === 15 && typeof out[0].text === "string");
  assert.equal(row("study.tiers").returns, "Promise<[{ min, text }]|false>");
});

test("EXT-2: study.difficulty returns the cleaned offset (or false), and the row says so", async () => {
  assert.equal(await T().study.difficulty(get(NPC), "auto"), "auto");
  assert.equal(await T().study.difficulty(get(NPC), 0), 0);
  assert.equal(row("study.difficulty").returns, "Promise<number|\"auto\"|false>");
});

test("EXT-2: study.attrOffers / beliefs / whoKnows rows name the real fields", () => {
  assert.equal(row("study.attrOffers").returns, "[{ id, title, icon, rows }]");
  assert.match(row("study.beliefs").returns, /^\[\{ ns, factId, fact, character, characterId, tier, total, when, delivered, … \}\]$/);
  const st = T().study.whoKnows({ ns: "kind", subjectId: NPC }, get(PC));
  assert.deepEqual(Object.keys(st).sort(), ["belief", "dc", "from", "key", "status", "tier", "total"]);
  assert.equal(row("study.whoKnows").returns, "{ status, key, belief, tier, total, from, dc }");
  assert.equal(row("study.factStatus").returns, row("study.whoKnows").returns, "the alias says the same");
});

test("EXT-2: share / inspectAs / deliverHeld declare the Known list and the knowledge setting; deliver declares studied", () => {
  for (const path of ["study.share", "study.shareFact", "study.inspectAs", "study.deliverHeld"]) {
    const fx = row(path).sideEffects;
    assert.ok(fx.includes(`${F}.known`), `${path} writes known`);
    assert.ok(fx.includes(KNOWLEDGE), `${path} writes the knowledge setting`);
  }
  assert.ok(row("study.deliver").sideEffects.includes(`${F}.studied`));
});
