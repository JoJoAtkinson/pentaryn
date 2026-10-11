#!/usr/bin/env node
/**
 * Manual corpus runner for the wall-autocomplete engine — `node test/corpus.mjs`. The gate is
 * `node test/run.mjs` (test/corpus.test.mjs runs every fixture on every available backend).
 *
 * Pass `-v` to dump the mutation log for every fixture, a substring to run one, or
 * `--backend=<name>` to run another backend.
 */

import {wasmReady, get as getBackend, available} from "./fixtures/engine.mjs";
import {runCorpus} from "./fixtures/runner.mjs";
await wasmReady;   // the backend loads async; wait before asking if it is available

const argv = process.argv.slice(2);
const verbose = argv.includes("-v");
const only = argv.find(a => !a.startsWith("-"));

// Any registered backend can be validated against the whole corpus. The JS engine is the
// reference; a compiled backend is correct exactly insofar as it passes this same corpus.
const backendName = (argv.find(a => a.startsWith("--backend=")) ?? "--backend=js").split("=")[1];
const backend = getBackend(backendName);
if (!backend) {
  throw new Error(`unknown backend "${backendName}" — available: ${available().map(b => b.name).join(", ")}`);
}
if (!backend.available()) {
  throw new Error(`backend "${backendName}" is registered but not available (not built?)`);
}
const runEngine = backend.run;
if (backendName !== "js") console.log(`running the corpus against backend: ${backendName}\n`);

let pass = 0, fail = 0;
for (const {fx, name, problems, res, skipped} of runCorpus(runEngine, {only})) {
  if (skipped) { console.log(`  SKIP ${name} (${skipped})`); continue; }
  if (problems.length) {
    fail++;
    console.log(`✗ ${name}`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    pass++;
    console.log(`✓ ${name}`);
  }

  if (verbose && res) {
    for (const l of res.log) console.log(`      ${l.iter}. ${l.rule}  ${JSON.stringify(l.walls)}`);
    for (const r of res.refusals) console.log(`      refused (${r.at}): ${r.why}`);
    for (const l of res.lints) console.log(`      lint ${l.code}: ${l.msg}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
// A throw (not an exit call) marks failure: this is a manual CLI, not a self-running suite (C43).
if (fail) throw new Error(`${fail} fixture(s) failed`);
