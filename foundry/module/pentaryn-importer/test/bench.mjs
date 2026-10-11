#!/usr/bin/env node
/**
 * Micro-benchmark for items-journal-7: the per-run slug index (`indexBySlug`) against the per-entry
 * world scan it replaced (`game.actors.find(a => getProperty(a, "flags.pentaryn.slug") === slug)`,
 * pasted below with the core's `getPath`, which has the same body for plain objects).
 *
 * Synthetic worlds only (C42): N world Actors, half of them carrying a slug, and a manifest of M
 * entries, half matching an existing Actor. For every size it checks that both lookups pick the same
 * Actor for every entry, then prints slug reads and wall time. Not part of `node test/run.mjs` (the
 * name does not end in .test.mjs); the deterministic read-count assertion is in index.test.mjs.
 *
 *   node test/bench.mjs              # default sweep
 *   node test/bench.mjs 20000 2000   # one extra world of 20000 actors, 2000 entries
 */
import { performance } from "node:perf_hooks";
import { FLAG_SCOPE, getPath, indexBySlug } from "../importer-core.mjs";

const world = n => Array.from({ length: n }, (_, i) =>
  ({ id: `a${i}`, flags: i % 2 ? {} : { [FLAG_SCOPE]: { slug: `npc-${i / 2}` } } }));
const manifest = (n, m) => Array.from({ length: m }, (_, j) => (j % 2 ? `new-${j}` : `npc-${(j * 7) % Math.ceil(n / 2)}`));

/** The pre-items-journal-7 lookup, one scan per entry, counting slug reads. */
function scan(actors, slugs) {
  let reads = 0;
  const slugOf = a => (reads++, getPath(a, `flags.${FLAG_SCOPE}.slug`));
  const found = slugs.map(slug => actors.find(a => slugOf(a) === slug));
  return { found, reads };
}

/** The items-journal-7 lookup: one index per run, a Map get per entry. */
function index(actors, slugs) {
  let reads = 0;
  const bySlug = indexBySlug(actors, a => (reads++, getPath(a, `flags.${FLAG_SCOPE}.slug`)));
  const found = slugs.map(slug => bySlug.get(slug));
  return { found, reads };
}

function time(fn, rounds = 5) {
  let best = Infinity, out;
  for (let r = 0; r < rounds; r++) {
    const t0 = performance.now();
    out = fn();
    best = Math.min(best, performance.now() - t0);
  }
  return { ...out, ms: best };
}

const extra = process.argv.slice(2).map(Number).filter(Boolean);
const sizes = [[100, 20], [1000, 100], [5000, 500], ...(extra.length === 2 ? [extra] : [])];

console.log("actors  entries  scan reads   index reads  scan ms   index ms  same");
console.log("-".repeat(70));
let allSame = true;
for (const [n, m] of sizes) {
  const actors = world(n), slugs = manifest(n, m);
  const a = time(() => scan(actors, slugs)), b = time(() => index(actors, slugs));
  const same = a.found.every((actor, i) => actor === b.found[i]);
  allSame &&= same;
  console.log([
    String(n).padEnd(7), String(m).padEnd(8), String(a.reads).padEnd(12), String(b.reads).padEnd(12),
    a.ms.toFixed(2).padEnd(9), b.ms.toFixed(2).padEnd(9), same ? "✓" : "✗ DIFFERENT"
  ].join(" "));
}
if (!allSame) throw new Error("the index picked a different actor than the scan for some entry");
