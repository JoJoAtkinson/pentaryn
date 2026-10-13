/**
 * The fixture-corpus loop, importable: `runCorpus(run, {only})` → `[{fx, name, problems, res, skipped}]`.
 * Moved verbatim from the old self-running test/run.mjs (now test/corpus.mjs, the manual CLI); the
 * only change is that results are collected instead of printed.
 */

import {SOLID} from "./engine.mjs";
import {FIXTURES, kindOf} from "./corpus.mjs";

/**
 * Merge an update's flags into a wall's, as Foundry's update does: per scope, key by key, and the
 * `moves` run history merged run by run (walls-edge-2) — an update never drops an earlier run's entry.
 */
export function mergeFlags(a = {}, b = {}) {
  const out = {...a};
  for (const [scope, f] of Object.entries(b ?? {})) {
    const prev = a?.[scope] ?? {};
    out[scope] = {...prev, ...f, ...((prev.moves || f?.moves) ? {moves: {...prev.moves, ...f?.moves}} : {})};
  }
  return out;
}

/** Fold an engine result back into a wall list, as Foundry would after committing. */
export function applied(walls, res) {
  const out = walls.map(x => {
    const u = res.updates.find(u => u._id === x._id);
    return u ? {...x, c: u.c, flags: mergeFlags(x.flags, u.flags)} : x;
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

export function runCorpus(runEngine, {only = null, fixtures = FIXTURES} = {}) {
  const out = [];
  const results = new Map();

  for (const fx of fixtures) {
    if (only && !fx.name.includes(only)) continue;

    let walls;
    if (fx.rerunOf) {
      const prev = results.get(fx.rerunOf);
      if (!prev) { out.push({fx, name: fx.name, problems: [], res: null, skipped: `needs "${fx.rerunOf}"`}); continue; }
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
      if (e.allCreatedKinds) {
        const wrong = res.creates.filter(c => kindOf(c) !== e.allCreatedKinds);
        if (wrong.length) {
          problems.push(`expected every created wall to be "${e.allCreatedKinds}", got ${[...new Set(wrong.map(kindOf))].join(", ")}`);
        }
      }
      if (e.createLevels) {
        const off = res.creates.filter(c => JSON.stringify(c.levels ?? []) !== JSON.stringify(e.createLevels));
        if (off.length) problems.push(`created walls with levels ${[...new Set(off.map(c => JSON.stringify(c.levels ?? [])))].join(", ")}, expected ${JSON.stringify(e.createLevels)}`);
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

    out.push({fx, name: fx.name, problems, res: res ?? null, skipped: null});
  }
  return out;
}
