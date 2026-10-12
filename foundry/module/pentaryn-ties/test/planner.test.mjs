/**
 * ties-20: planStep normalises its inputs once. Proven against the planner as it stood before
 * (planStepRef below, verbatim from core/ledgers.mjs at the wave-3 split, calling the public readers
 * per rung) over 300 seeded random registries, carried lists and ledgers. Pure; no Foundry.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  planStep, readRegistry, helpFor, identifiedState, knowsAttribute, failedAttribute, identificationLadder, identifiedKey
} from "../known-core.mjs";

// verbatim (comments dropped) from core/ledgers.mjs before ties-20
function planStepRef({ registry = [], carried = [], knowledge = {}, beliefs = {}, characterId = "", rollerCarries = [] } = {}) {
  const byId = new Map(readRegistry(registry).map(e => [e.id, e]));
  const mine = new Set(Array.isArray(rollerCarries) ? rollerCarries : []);
  const subjectHas = new Set(Array.isArray(carried) ? carried : []);
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret || !mine.has(attrId)) continue;
    if (helpFor(entry, { carried: true }) !== "auto") continue;
    if (identifiedState(beliefs, characterId, attrId).settled) continue;
    return { grant: attrId, entry, backfill: !knowsAttribute(knowledge, characterId, attrId), bypass: true };
  }
  for (const attrId of subjectHas) {
    const entry = byId.get(attrId);
    if (!entry?.secret) continue;
    for (const rung of identificationLadder(attrId, registry)) {
      if (!subjectHas.has(rung)) break;
      const already = identifiedState(beliefs, characterId, rung);
      if (already.settled) {
        if (!already.carries) break;
        continue;
      }
      const rungEntry = byId.get(rung);
      const iCarry = mine.has(rung);
      const help = helpFor(rungEntry, { carried: iCarry });
      const knows = knowsAttribute(knowledge, characterId, rung);
      if (!knows && failedAttribute(knowledge, characterId, rung)) break;
      if (help === "auto") return { grant: rung, entry: rungEntry, backfill: !knows, bypass: false };
      return { roll: rung, entry: rungEntry, backfill: !knows, advantage: help === "advantage" && (knows || iCarry) };
    }
  }
  return { done: true };
}

// a small seeded PRNG (mulberry32), so a failure reproduces
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function world(r) {
  const pick = list => list[Math.floor(r() * list.length)];
  const n = 2 + Math.floor(r() * 9);
  const ids = Array.from({ length: n }, (_, i) => `a${i}`);
  const registry = ids.map((id, i) => ({
    id,
    title: `T${id}`,
    secret: r() < 0.7,
    parent: i && r() < 0.6 ? ids[Math.floor(r() * i)] : r() < 0.1 ? "ghost" : null,
    dc: 10 + Math.floor(r() * 10),
    whenKnown: pick(["enables", "advantage", "auto"]),
    whenCarried: pick(["inherit", "advantage", "auto"]),
    lore: [],
  }));
  if (r() < 0.2) registry.push({ ...registry[0] }); // a duplicate id
  const carried = ids.filter(() => r() < 0.6);
  const rollerCarries = ids.filter(() => r() < 0.3);
  const knowledge = { pc: Object.fromEntries(ids.filter(() => r() < 0.4).map(id => [id, { failed: r() < 0.3, via: "roll", when: 1 }])) };
  const beliefs = {
    pc: Object.fromEntries(ids.filter(() => r() < 0.4).map(id => [identifiedKey(id), { text: r() < 0.6 ? "yes" : "", total: 12, when: 1, delivered: r() < 0.7 ? 2 : null }])),
  };
  return { registry, carried, knowledge, beliefs, characterId: "pc", rollerCarries };
}

test("ties-20: planStep equals the pre-change planner on 300 seeded random worlds", () => {
  const r = rng(20261011);
  for (let i = 0; i < 300; i++) {
    const w = world(r);
    assert.deepEqual(planStep(w), planStepRef(w), `world ${i}: ${JSON.stringify(w)}`);
  }
});

test("ties-20: the ladder and ancestors accept an index as well as a registry", async () => {
  const { indexRegistry, ancestorsOf } = await import("../known-core.mjs");
  const reg = [{ id: "city", title: "City", secret: true }, { id: "guild", title: "Guild", secret: true, parent: "city" }];
  assert.deepEqual(identificationLadder("guild", indexRegistry(reg)), identificationLadder("guild", reg));
  assert.deepEqual(ancestorsOf("guild", indexRegistry(reg)), ["city"]);
});
