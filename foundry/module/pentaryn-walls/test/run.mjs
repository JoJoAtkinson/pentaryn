#!/usr/bin/env node
/**
 * Fixture runner for the wall-autocomplete engine. No dependencies — `node test/run.mjs`.
 *
 * Pass `-v` to dump the mutation log for every fixture, or a substring to run one.
 */

import {FLAG_SCOPE, SOLID} from "../wall-engine.mjs";
import {get as getBackend, available} from "../backends.mjs";
import {FIXTURES} from "./fixtures.mjs";

const argv = process.argv.slice(2);
const verbose = argv.includes("-v");
const only = argv.find(a => !a.startsWith("-"));

// Any registered backend can be validated against the whole corpus. The JS engine is the
// reference; a compiled backend is correct exactly insofar as it passes these same 44.
const backendName = (argv.find(a => a.startsWith("--backend=")) ?? "--backend=js").split("=")[1];
const backend = getBackend(backendName);
if (!backend) {
  console.error(`unknown backend "${backendName}" — available: ${available().map(b => b.name).join(", ")}`);
  process.exit(2);
}
if (!backend.available()) {
  console.error(`backend "${backendName}" is registered but not available (not built?)`);
  process.exit(2);
}
const runEngine = backend.run;
if (backendName !== "js") console.log(`running the corpus against backend: ${backendName}\n`);

const results = new Map();
let pass = 0, fail = 0;
const failures = [];

/** Fold an engine result back into a wall list, as Foundry would after committing. */
function applied(walls, res) {
  const out = walls.map(x => {
    const u = res.updates.find(u => u._id === x._id);
    return u ? {...x, c: u.c, flags: u.flags} : x;
  });
  let n = 0;
  for (const c of res.creates) out.push({_id: `gen${++n}`, ...SOLID, ...c});
  return out;
}

const sameSet = (a, b) => {
  const norm = xs => xs.map(x => JSON.stringify(x.c ?? x)).sort();
  const A = norm(a), B = norm(b);
  return A.length === B.length && A.every((v, i) => v === B[i]);
};

for (const fx of FIXTURES) {
  if (only && !fx.name.includes(only)) continue;

  let walls;
  if (fx.rerunOf) {
    const prev = results.get(fx.rerunOf);
    if (!prev) { console.log(`  SKIP ${fx.name} (needs "${fx.rerunOf}")`); continue; }
    walls = [...applied(prev.walls, prev.res), ...(fx.add ?? [])];
  } else {
    walls = fx.walls;
  }

  let res, err = null;
  try {
    res = runEngine(walls, {...fx.opts, runId: "test"});
  } catch (e) {
    err = e;
  }

  const problems = [];
  if (err) {
    problems.push(`threw: ${err.message}`);
  } else {
    results.set(fx.name, {walls, res});
    const e = fx.expect ?? {};
    const chk = (label, got, want) => {
      if (want !== undefined && got !== want) problems.push(`${label}: got ${got}, expected ${want}`);
    };
    chk("creates", res.creates.length, e.creates);
    chk("updates", res.updates.length, e.updates);
    chk("refusals", res.refusals.length, e.refusals);
    chk("iterations", res.report.iterations, e.iterations);

    chk("components", res.report.components.length, e.components);
    if (e.allClosed && res.report.components.some(c => !c.closed)) {
      problems.push(`components not all closed: ${JSON.stringify(res.report.components)}`);
    }
    for (const want of e.mustCreate ?? []) {
      if (!res.creates.some(c => JSON.stringify(c.c) === JSON.stringify(want))) {
        problems.push(`missing created wall ${JSON.stringify(want)}`);
      }
    }
    for (const no of e.mustNotCreate ?? []) {
      if (res.creates.some(c => JSON.stringify(c.c) === JSON.stringify(no))) {
        problems.push(`created a wall it should not have: ${JSON.stringify(no)}`);
      }
    }
    if (e.refusalMatches) {
      const hit = res.refusals.some(r => e.refusalMatches.test(r.why));
      if (!hit) problems.push(`no refusal matched ${e.refusalMatches} — got: ${res.refusals.map(r => r.why).join(" | ") || "(none)"}`);
    }
    for (const code of e.lintCodes ?? []) {
      if (!res.lints.some(l => l.code === code)) problems.push(`no ${code} lint — got ${[...new Set(res.lints.map(l => l.code))].join(",") || "(none)"}`);
    }
    if (e.sameCreatesAs) {
      const other = results.get(e.sameCreatesAs);
      if (!other) problems.push(`comparison fixture "${e.sameCreatesAs}" not run`);
      else if (!sameSet(res.creates, other.res.creates)) {
        problems.push(`creates differ from "${e.sameCreatesAs}"\n      this: ${res.creates.map(c => c.c.join(",")).sort().join(" | ")}\n      that: ${other.res.creates.map(c => c.c.join(",")).sort().join(" | ")}`);
      }
    }
    if (e.idempotent) {
      const second = runEngine(applied(walls, res), {...fx.opts, runId: "test2"});
      if (second.creates.length || second.updates.length) {
        problems.push(`not idempotent: second run made ${second.creates.length} creates, ${second.updates.length} updates`);
      }
    }
  }

  if (problems.length) {
    fail++;
    failures.push({fx, problems, res});
    console.log(`✗ ${fx.name}`);
    for (const p of problems) console.log(`    ${p}`);
  } else {
    pass++;
    console.log(`✓ ${fx.name}`);
  }

  if (verbose && res) {
    for (const l of res.log) console.log(`      ${l.iter}. ${l.rule}  ${JSON.stringify(l.walls)}`);
    for (const r of res.refusals) console.log(`      refused (${r.at}): ${r.why}`);
    for (const l of res.lints) console.log(`      lint ${l.code}: ${l.msg}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
