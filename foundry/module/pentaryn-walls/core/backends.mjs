/**
 * Backend registry — lets a second implementation of the engine run side by side with the
 * JS one and be proved identical against the same fixture corpus.
 *
 * The JS engine is the **reference**. Any other backend is correct exactly insofar as it
 * produces byte-identical mutations for the same input; `compare()` is what decides that,
 * and `test/run.mjs --backend=<name>` runs all fixtures against it.
 *
 * A backend is `{name, run(walls, opts) -> result, available() -> bool, accepts?(walls) -> bool}`
 * where `result` has the same shape `runEngine` returns. `accepts` is optional: a backend that
 * returns false for some walls (wasm on a Levels scene) is passed over for js by the glue.
 */

import {runEngine, stampOf, wallCategory} from "./engine.mjs";

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

// The compiled backend is registered by backend-wasm.mjs (the adapter that loads the .wasm).
// Until its bytes load, or when they fail to, it reports itself unavailable and the glue's
// pickBackend falls back to "js".

/* -------------------------------------------- */
/*  Comparison                                  */
/* -------------------------------------------- */

/**
 * Canonical, order-independent form of a result's mutations, for exact comparison: coordinates,
 * wall kind and refusal positions. `compare()` gates on exactly these three.
 *
 * `{extended: true}` adds two diagnostic fields compare() does NOT gate on (senses-walls-cursors-3):
 * `createLevels` (each create's segment with its levels) and `updateRules` (each update's id with
 * the rule stamped on it). The wasm backend stamps every update "X1" — it does not reproduce the
 * rule, nor the kind/sources flags or the log (see backend-wasm.mjs) — so `updateRules` can differ
 * between backends while the geometry agrees.
 */
export function canonical(result, {extended = false} = {}) {
  const seg = c => {
    const [a, b, x, y] = c;
    return (a < x || (a === x && b < y)) ? `${a},${b},${x},${y}` : `${x},${y},${a},${b}`;
  };
  const out = {
    creates: result.creates.map(c => `${seg(c.c)}:${wallCategory(c)}`).sort(),
    updates: result.updates.map(u => `${u._id}:${seg(u.c)}`).sort(),
    refusals: result.refusals.map(r => `${r.at[0]},${r.at[1]}`).sort()
  };
  if (!extended) return out;
  return {
    ...out,
    createLevels: result.creates.map(c => `${seg(c.c)}:${JSON.stringify([...(c.levels ?? [])].sort())}`).sort(),
    updateRules: result.updates.map(u => `${u._id}:${stampOf(u).rule ?? null}`).sort()
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
