#!/usr/bin/env node
// Per-seed digest of pentaryn-movement's simulator: for each seed, sha1 of runSeed's whole record WITH its event log
// (plans, slots, sends, stops) — far stricter than the summary make foundry-movement-sim prints.
//   node sim-digest.mjs <repo> <from> <count>   → one line per seed: "<seed> <sha1> <failures>"
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const [repo, from = "1", count = "10000"] = process.argv.slice(2);
const { runSeed } = await import(pathToFileURL(`${repo}/foundry/module/pentaryn-movement/test/sim/scenario.mjs`).href);
const rep = (k, v) => (v === Infinity ? "Infinity" : v === -Infinity ? "-Infinity" : Number.isNaN(v) ? "NaN" : v instanceof Map ? [...v] : v instanceof Set ? [...v] : v);
const F = Number(from), N = Number(count);
for (let s = F; s < F + N; s++) {
  let line;
  try {
    const r = runSeed(s, { events: true });
    delete r.sc;
    const h = createHash("sha1").update(JSON.stringify(r, rep)).digest("hex");
    line = `${s} ${h} ${r.failures.length}`;
  } catch (err) { line = `${s} ERROR ${String(err?.message ?? err).replace(/\s+/g, " ").slice(0, 120)}`; }
  process.stdout.write(line + "\n");
}
