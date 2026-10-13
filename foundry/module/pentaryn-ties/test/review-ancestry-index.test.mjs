/**
 * ties-core-U5 [declared] (final review ties-core, 2026-10-12; defect wave 2): `brokenAncestry` and
 * `staleCarriers` index the registry once per call. Before, each handed the raw registry to
 * `ancestorsOf` / `withAncestors`, which re-indexed it (a clamp of every entry) for every id checked —
 * O(ids × registry) per sheet check, O(actors × links × registry) per sweep. Both now build
 * `indexRegistry(reg)` once and pass the index down (ties-20 made both helpers accept one). Same
 * answers: pinned below against the rows the walk produced before. The count is of `indexRegistry`
 * runs, found by its `byId` Map's constructor frame on the stack. Standalone world; pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const NPC = "zzNpc00000000001";
const NPC2 = "zzNpc00000000002";
const NPC3 = "zzNpc00000000003";
const REGISTRY = [
  { id: "realm", title: "Old Realm", category: "Realm" },
  { id: "city", title: "Vel", category: "City", parent: "realm" },
  { id: "guild", title: "Salt Guild", category: "Guild", parent: "city" },
  { id: "cell", title: "Night Cell", category: "Cell", parent: "guild" },
  { id: "loner", title: "Loner", category: "Compact" },
  { id: "tide", title: "Tide Order", category: "Order" },
];

await bootWorld({
  settings: { "pentaryn-ties.attributes": REGISTRY },
  actors: [
    // broken: carries the cell but not the guild; a dangling id; a root
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { attributes: ["cell", "city", "realm", "ghost", "tide"] } } },
    // stale: carries the guild with the old ancestry plus an unrelated root
    { id: NPC2, name: "ZZ Second", flags: { "pentaryn-ties": { attributes: ["guild", "city", "loner"] } } },
    // whole: carries the guild with its full ancestry
    { id: NPC3, name: "ZZ Third", flags: { "pentaryn-ties": { attributes: ["guild", "city", "realm"] } } },
  ],
});
const A = await import("../attributes.mjs");
const get = id => game.actors.get(id);

Error.stackTraceLimit = 50;
const frames = () =>
  new Error().stack
    .split("\n")
    .slice(1)
    .map(l => l.trim().match(/^at (?:async )?(?:new )?([\w$.<>]+) \(/)?.[1] ?? "");

/** Count `indexRegistry` runs while `fn` runs: one `new Map(iterable)` made directly by it per run. */
function indexRuns(fn) {
  const Real = globalThis.Map;
  let n = 0;
  globalThis.Map = class CountingMap extends Real {
    constructor(...args) {
      super(...args);
      if (args.length) {
        const f = frames(); // [frames, CountingMap, its caller, …]
        if (f[f.indexOf("CountingMap") + 1] === "indexRegistry") n++;
      }
    }
  };
  let out;
  try {
    out = fn();
  } finally {
    globalThis.Map = Real;
  }
  return { n, out };
}

test("ties-core-U5: brokenAncestry indexes the registry once, however many ids the actor carries", () => {
  const { n, out } = indexRuns(() => A.brokenAncestry(get(NPC)));
  assert.equal(n, 1, `one index per call, not one per carried id (got ${n})`);
  const rows = out.map(r => JSON.stringify(r)).sort();
  assert.deepEqual(rows, [JSON.stringify({ id: "cell", missing: "guild" }), JSON.stringify({ id: "ghost", missing: null, dangling: true })].sort());
});

test("ties-core-U5: brokenAncestry on a whole sheet still finds nothing", () => {
  assert.deepEqual(A.brokenAncestry(get(NPC3)), []);
});

test("ties-core-U5: staleCarriers indexes the registry once, however many actors and links it walks", () => {
  const { n, out } = indexRuns(() => A.staleCarriers("Salt Guild"));
  assert.equal(n, 1, `one index per sweep, not one per actor link (got ${n})`);
  assert.deepEqual(
    out.map(r => ({ actor: r.actor.id, extra: r.extra, missing: r.missing })),
    [{ actor: NPC2, extra: ["loner"], missing: ["realm"] }]
  );
});

test("ties-core-U5: staleCarriers of an unknown ref is empty", () => {
  assert.deepEqual(A.staleCarriers("no such thing"), []);
});
