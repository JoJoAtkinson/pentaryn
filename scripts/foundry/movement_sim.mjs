#!/usr/bin/env node
/**
 * The runner of pentaryn-movement's simulator (make foundry-movement-sim SEEDS=10000; the simulator itself is
 * foundry/module/pentaryn-movement/test/sim/, use-doc context/foundry/movement.md "The simulator"): seeds
 * FROM .. FROM+SEEDS-1, each one scenario (test/sim/scenario.mjs), every invariant judged. A tool, not a suite, so it
 * lives outside the module's test/ (blueprint C43); its regression seeds run in the suite as test/sim/sim.test.mjs.
 * Prints a line per failing seed and a summary by invariant; exits 1 when any seed fails. `--seed N` runs one seed and
 * prints its whole record (the scenario, every failure, the runs, the events).
 *
 *   node scripts/foundry/movement_sim.mjs [--seeds 2000] [--from 1] [--seed N] [--json] [--only inv1,inv2] [--map hard] [--opts JSON]
 *
 * --opts fixes scenario choices (scenario.mjs): combat, tierC, loss, fog, background, door, click, two (booleans), and
 * the model's switches that turn a fix off (noStay, noVet, noFlushFix; 0.8.3 noSequenced, noFollow, noStep; followGap; 0.8.4 noStays). A seed names a scenario only with its options.
 */

import { runSeed } from "../../foundry/module/pentaryn-movement/test/sim/scenario.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] : dflt; };
const flag = name => args.includes(`--${name}`);
const one = opt("seed", null);
const only = opt("only", null)?.split(",") ?? null;
const map = opt("map", undefined);
const extra = JSON.parse(opt("opts", "{}"));

if (one !== null) {
  const r = runSeed(Number(one), { map, ...extra });
  console.log(JSON.stringify(r, (k, v) => (v === Infinity ? "Infinity" : v), 2));
  process.exit(r.failures.length ? 1 : 0);
}

const N = Number(opt("seeds", 2000));
const FROM = Number(opt("from", 1));
const byInv = new Map();
const byKind = new Map();
const failing = [];
const t0 = Date.now();
for (let s = FROM; s < FROM + N; s++) {
  let r;
  try { r = runSeed(s, { map, ...extra }); }
  catch (err) { r = { seed: s, meta: {}, failures: [{ inv: "errors", err: String(err?.stack ?? err).split("\n").slice(0, 3).join(" | ") }] }; }
  const fs = only ? r.failures.filter(f => only.includes(f.inv)) : r.failures;
  const kind = `${r.meta.map ?? "?"}/${r.meta.combat ? (r.meta.tierC ? "fightC" : "fightCore") : "explore"}`;
  const k = byKind.get(kind) ?? { runs: 0, failed: 0 };
  k.runs += 1;
  if (fs.length) k.failed += 1;
  byKind.set(kind, k);
  if (!fs.length) continue;
  const invs = [...new Set(fs.map(f => f.inv))];
  for (const inv of invs) {
    if (!byInv.has(inv)) byInv.set(inv, []);
    byInv.get(inv).push(s);
  }
  failing.push({ seed: s, kind, invs, first: fs[0], meta: r.meta });
}
const ms = Date.now() - t0;
if (flag("json")) {
  console.log(JSON.stringify({ seeds: N, from: FROM, ms, failing, byInv: Object.fromEntries([...byInv].map(([k, v]) => [k, v])), byKind: Object.fromEntries(byKind) }, null, 1));
} else {
  for (const f of failing) {
    const m = f.meta;
    const tags = [m.lossy && "loss", m.fog && "stalls", m.backgrounded && "background", m.dropped && `drop:${m.dropped}`, m.twoGroups && "two", m.doorShut && "door", m.clickAt && "click", m.byPlayer && "player"].filter(Boolean).join(" ");
    console.log(`seed ${f.seed}  ${f.kind}  [${tags}]  ${f.invs.join(",")}  ${JSON.stringify(f.first).slice(0, 220)}`);
  }
  console.log(`\n${N} seeds from ${FROM} in ${(ms / 1000).toFixed(1)} s: ${failing.length} failing`);
  for (const [inv, seeds] of byInv) console.log(`  ${inv.padEnd(12)} ${String(seeds.length).padStart(5)}  e.g. ${seeds.slice(0, 12).join(" ")}`);
  console.log("  by map/mode:");
  for (const [k, v] of [...byKind].sort()) console.log(`    ${k.padEnd(24)} ${v.failed}/${v.runs}`);
}
process.exit(failing.length ? 1 : 0);
