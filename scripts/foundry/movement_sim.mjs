#!/usr/bin/env node
/**
 * The runner of pentaryn-movement's simulator (make foundry-movement-sim; the simulator itself is
 * foundry/module/pentaryn-movement/test/sim/, use-doc context/foundry/movement.md "The simulator"). A tool, not a
 * suite, so it lives outside the module's test/ (blueprint C43); its regression seeds run in the suite as
 * test/sim/sim.test.mjs.
 *
 * 0.9.0 (Fable's review 2 §4 step 5): the module's real cores (file-core planFile / staggerFile, sequence-core, the
 * pathfind-core A*) on the engine's virtual clients. Each seed FROM .. FROM+SEEDS-1 runs twice, as B1 (the file's start
 * delays) and as B0 (every delay 0), every hard invariant judged on both; mover-vs-mover overlap is reported as p95
 * depth and duration, B1 beside B0. Prints a line per failing run and a summary; exits 1 when any run fails.
 *
 *   node scripts/foundry/movement_sim.mjs [--seeds 2000] [--from 1] [--seed N] [--json] [--only inv1,inv2] [--map hard] [--opts JSON]
 *
 * --opts fixes scenario choices (scenario.mjs): combat, loss, fog, background, door, click, two, turn (booleans), b0
 * (only that mode). `--seed N` prints one seed's whole record (B1, or B0 with --opts '{"b0":true}').
 */

import { runSeed, pct } from "../../foundry/module/pentaryn-movement/test/sim/scenario.mjs";

const args = process.argv.slice(2);
const opt = (name, dflt) => { const k = args.indexOf(`--${name}`); return k >= 0 ? args[k + 1] : dflt; };
const flag = name => args.includes(`--${name}`);
const one = opt("seed", null);
const only = opt("only", null)?.split(",") ?? null;
const map = opt("map", undefined);
const extra = JSON.parse(opt("opts", "{}"));

if (one !== null) {
  const r = runSeed(Number(one), { map, events: true, ...extra });
  console.log(JSON.stringify(r, (k, v) => (v === Infinity ? "Infinity" : v), 2));
  process.exit(r.failures.length ? 1 : 0);
}

const N = Number(opt("seeds", 2000));
const FROM = Number(opt("from", 1));
const modes = "b0" in extra ? [extra.b0 ? "B0" : "B1"] : ["B1", "B0"];
const INVS = ["passThrough", "wallCross", "wrongCharge", "unsent", "restOverlap", "errors"];
const out = {};
for (const mode of modes) out[mode] = { byInv: Object.fromEntries(INVS.map(k => [k, []])), byKind: {}, movers: [], shortMate: [], waiting: [], unforeseen: [], seedsWithMover: 0, races: 0, unmoved: 0, named: 0, dropped: 0 };
const failing = [];
const t0 = Date.now();
for (let s = FROM; s < FROM + N; s++) {
  for (const mode of modes) {
    const o = out[mode];
    let r;
    try { r = runSeed(s, { map, ...extra, b0: mode === "B0" }); }
    catch (err) { r = { seed: s, meta: {}, movers: [], stats: {}, failures: [{ inv: "errors", err: String(err?.stack ?? err).split("\n").slice(0, 3).join(" | ") }] }; }
    const fs = only ? r.failures.filter(f => only.includes(f.inv)) : r.failures;
    const kind = `${r.meta.map ?? "?"}/${r.meta.combat ? "fight" : "explore"}`;
    const k = (o.byKind[kind] ??= { runs: 0, failed: 0 });
    k.runs += 1;
    for (const m of r.movers) (m.kind === "mover" ? o.movers : m.kind === "shortMate" ? o.shortMate : m.kind === "unforeseen" ? o.unforeseen : o.waiting).push(m);
    if (r.movers.some(m => m.kind === "mover")) o.seedsWithMover += 1;
    o.races += (r.stats.races?.length ?? 0) ? 1 : 0; o.unmoved += r.stats.unmoved ?? 0; o.named += r.stats.named ?? 0; o.dropped += r.stats.dropped ?? 0;
    if (!fs.length) continue;
    k.failed += 1;
    const invs = [...new Set(fs.map(f => f.inv))];
    for (const inv of invs) (o.byInv[inv] ??= []).push(s);
    failing.push({ seed: s, mode, kind, invs, first: fs[0], meta: r.meta });
  }
}
const ms = Date.now() - t0;
const sum = list => ({ episodes: list.length, p95Depth: +pct(list.map(m => m.depth), 0.95).toFixed(3), maxDepth: +Math.max(0, ...list.map(m => m.depth)).toFixed(3),
  p95Ms: Math.round(pct(list.map(m => m.ms), 0.95)), maxMs: Math.round(Math.max(0, ...list.map(m => m.ms))) });
const report = Object.fromEntries(Object.entries(out).map(([mode, o]) => [mode, {
  failedRuns: failing.filter(f => f.mode === mode).length,
  byInv: Object.fromEntries(Object.entries(o.byInv).map(([k, v]) => [k, v.length])),
  mover: { ...sum(o.movers), seeds: o.seedsWithMover }, shortMate: sum(o.shortMate), waiting: sum(o.waiting), unforeseen: sum(o.unforeseen),
  members: { dropped: o.dropped, unmoved: o.unmoved, named: o.named }, raceSeeds: o.races, byKind: o.byKind,
}]));
if (flag("json")) {
  console.log(JSON.stringify({ seeds: N, from: FROM, ms, report, failing, seedsByInv: Object.fromEntries(Object.entries(out).map(([m, o]) => [m, o.byInv])) }, null, 1));
} else {
  for (const f of failing) {
    const m = f.meta;
    const tags = [m.lossy && "loss", m.fog && "stalls", m.backgrounded && "background", m.dropped && `drop:${m.dropped}`, m.twoGroups && "two", m.doorShut && "door", m.clickAt && "click", m.turnAt && "turn", m.byPlayer && "player"].filter(Boolean).join(" ");
    console.log(`seed ${f.seed} ${f.mode}  ${f.kind}  [${tags}]  ${f.invs.join(",")}  ${JSON.stringify(f.first).slice(0, 240)}`);
  }
  console.log(`\n${N} seeds from ${FROM} × ${modes.join("+")} in ${(ms / 1000).toFixed(1)} s`);
  for (const [mode, r] of Object.entries(report)) {
    console.log(`${mode}: ${r.failedRuns} failing runs`);
    for (const inv of INVS) console.log(`  ${inv.padEnd(12)} ${String(r.byInv[inv] ?? 0).padStart(5)}  e.g. ${(out[mode].byInv[inv] ?? []).slice(0, 10).join(" ")}`);
    const mv = r.mover;
    console.log(`  mover overlap: ${mv.episodes} episodes in ${mv.seeds} seeds; depth p95 ${mv.p95Depth} max ${mv.maxDepth} sq; duration p95 ${mv.p95Ms} max ${mv.maxMs} ms`);
    console.log(`  past a mate waiting for its wave: ${r.waiting.episodes} (p95 ${r.waiting.p95Depth} sq, ${r.waiting.p95Ms} ms); past a mate stopped short: ${r.shortMate.episodes} (p95 ${r.shortMate.p95Depth} sq, ${r.shortMate.p95Ms} ms)`);
    console.log(`  through a token come to rest after the walk was sent (its sender could not know): ${r.unforeseen.episodes} (p95 ${r.unforeseen.p95Depth} sq, ${r.unforeseen.p95Ms} ms)`);
    console.log(`  rest overlap flagged as a same-instant race (not failed): ${r.raceSeeds} seeds`);
    console.log(`  members dropped ${r.members.dropped}, never moved ${r.members.unmoved}, named ${r.members.named}`);
  }
}
process.exit(failing.length ? 1 : 0);
