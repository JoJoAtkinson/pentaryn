/**
 * Backend registry — lets a second implementation of the engine run side by side with the
 * JS one and be proved identical against the same fixture corpus.
 *
 * The JS engine is the **reference**. Any other backend is correct exactly insofar as it
 * produces byte-identical mutations for the same input; `compare()` is what decides that,
 * and `test/run.mjs --backend=<name>` runs all fixtures against it.
 *
 * A backend is `{name, run(walls, opts) -> result, available() -> bool}` where `result` has
 * the same shape `runEngine` returns.
 */

import {runEngine} from "./wall-engine.mjs";

const REGISTRY = new Map();

export function register(backend) {
  if (!backend?.name || typeof backend.run !== "function") {
    throw new Error("a backend needs {name, run(walls, opts)}");
  }
  REGISTRY.set(backend.name, {available: () => true, ...backend});
}

export const get = name => REGISTRY.get(name);
export const list = () => [...REGISTRY.values()];
export const available = () => list().filter(b => b.available());

register({name: "js", run: runEngine});

/* -------------------------------------------- */
/*  WASM backend (not yet built)                */
/* -------------------------------------------- */

/**
 * Placeholder so the toggle exists before the implementation does. `available()` is false
 * until a compiled module is registered, and every consumer checks it — so a missing WASM
 * build degrades to "only js listed", never to a broken run.
 *
 * To fill this in, call `register({name: "wasm", run, available})` from the glue that
 * instantiates the compiled module. Nothing else in the codebase needs to change.
 */
export const WASM_STATUS = Object.freeze({
  built: false,
  reason: "no compiled module yet — see README §Compiled backend"
});

/* -------------------------------------------- */
/*  Comparison                                  */
/* -------------------------------------------- */

/** Canonical, order-independent form of a result's mutations, for exact comparison. */
export function canonical(result) {
  const seg = c => {
    const [a, b, x, y] = c;
    return (a < x || (a === x && b < y)) ? `${a},${b},${x},${y}` : `${x},${y},${a},${b}`;
  };
  return {
    creates: result.creates.map(c => seg(c.c)).sort(),
    updates: result.updates.map(u => `${u._id}:${seg(u.c)}`).sort(),
    refusals: result.refusals.map(r => `${r.at[0]},${r.at[1]}`).sort()
  };
}

/**
 * Run every available backend over the same walls and report timing plus whether they agree.
 * Returns {rows, identical, diff} — `diff` names the first field that differs.
 */
export function compare(walls, opts = {}) {
  const rows = [];
  for (const b of available()) {
    const t0 = performance.now();
    let result = null, error = null;
    try { result = b.run(walls, opts); } catch (e) { error = e; }
    const ms = performance.now() - t0;
    rows.push({backend: b.name, ms, result, error, canon: result ? canonical(result) : null});
  }

  let identical = true, diff = null;
  const ref = rows.find(r => r.backend === "js");
  for (const row of rows) {
    if (row === ref) continue;
    if (row.error) { identical = false; diff = `${row.backend} threw: ${row.error.message}`; continue; }
    for (const field of ["creates", "updates", "refusals"]) {
      const a = ref.canon[field], c = row.canon[field];
      if (a.length !== c.length || a.some((v, i) => v !== c[i])) {
        identical = false;
        const firstBad = a.find((v, i) => v !== c[i]) ?? `(count ${a.length} vs ${c.length})`;
        diff = `${row.backend} differs in ${field}: ${firstBad}`;
        break;
      }
    }
  }
  return {rows, identical, diff};
}
