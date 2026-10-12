/**
 * WASM backend — loads the compiled Rust engine and registers it alongside the JS one.
 *
 * The JS engine stays the reference. This module only marshals: walls in as a flat i32
 * array, mutations out as another. Refusals (positions and wording) are recomputed by the
 * JS `analyze()` over the applied result, and only when the wasm reports any (nr > 0); the
 * wasm's own refusal positions are skipped, so the wording can never drift from JS.
 *
 * What it does not reproduce (senses-walls-cursors-3; `canonical(r, {extended: true})` shows the
 * first two): the `rule` stamp on updates (always "X1" here), Levels (a scene with any levels runs
 * on the JS engine instead, senses-walls-cursors-2), the `kind`/`rule`/`sources` flags on creates,
 * and the mutation `log` (always []). None of these change the walls written.
 *
 * Import for the side effect of registering:  `import "./backend-wasm.mjs";`
 * It is safe to import when the module has not been built — `available()` just stays false.
 */

import {register, resolveConfig, analyze, lintOnly, runEngine, stampOf, historyOf, runKey, FLAG_SCOPE} from "./walls-core.mjs";

let mod = null;
let loadError = null;

/** Locate and instantiate the .wasm. Works in Node and in the browser/Foundry. */
export async function load(url) {
  if (mod) return mod;
  try {
    const here = new URL("./wall-engine.wasm", import.meta.url);
    const target = url ?? here;
    let bytes;
    if (typeof fetch === "function" && String(target).startsWith("http")) {
      bytes = await (await fetch(target)).arrayBuffer();
    } else {
      const {readFile} = await import("node:fs/promises");
      bytes = await readFile(new URL(target));
    }
    const {instance} = await WebAssembly.instantiate(bytes, {});
    mod = instance.exports;
    return mod;
  } catch (err) {
    loadError = err;
    return null;
  }
}

/** Why the .wasm did not load (its error message), or null when it loaded or is still loading. */
export function loadErrorMessage() {
  return loadError ? String(loadError.message ?? loadError) : null;
}

/** Flat i32 layout, mirroring `run()` in lib.rs. */
function marshal(walls) {
  const buf = new Int32Array(1 + walls.length * 11);
  buf[0] = walls.length;
  walls.forEach((w, i) => {
    const o = 1 + i * 11;
    buf[o] = w.c[0]; buf[o + 1] = w.c[1]; buf[o + 2] = w.c[2]; buf[o + 3] = w.c[3];
    buf[o + 4] = w.door ?? 0;
    buf[o + 5] = w.sight ?? 20;
    buf[o + 6] = w.dir ?? 0;
    buf[o + 7] = (stampOf(w).keepOpen === true) ? 1 : 0;
    buf[o + 8] = w.light ?? 20;
    buf[o + 9] = w.sound ?? 20;
    buf[o + 10] = w.move ?? 20;
  });
  return buf;
}

/**
 * The compiled engine has no notion of Levels: marshal() sends none and creates come back with
 * levels []. The JS engine partitions by level, so a scene that uses Levels runs there
 * (senses-walls-cursors-2); level-less scenes, the common case, stay on the fast path. The
 * registry row's `accepts` lets the glue pick js up front and report the backend that ran.
 */
const usesLevels = walls => walls.some(w => (w.levels ?? []).length);

/**
 * Tolerances lib.rs hard-codes rather than takes over the ABI (walls-EXT-1). A run that overrides
 * one goes to js, as a Levels scene does, so the card's echoed config is the one that ran.
 */
const NOT_IN_ABI = ["weldEps", "pinEps"];
const overridesAbi = opts => NOT_IN_ABI.some(k => opts?.[k] !== undefined);

/** False when the compiled engine cannot reproduce js for these walls and opts. */
export const accepts = (walls, opts = {}) => !usesLevels(walls) && !overridesAbi(opts);

export function runWasm(walls, opts = {}) {
  if (!accepts(walls, opts)) return runEngine(walls, opts);   // a direct caller; the glue never gets here
  if (!mod) throw new Error(`wasm backend not loaded${loadError ? `: ${loadError.message}` : ""}`);
  const cfg = resolveConfig(opts);
  const runId = runKey(opts.runId);
  const input = marshal(walls);

  const ptr = mod.alloc_in(input.length);
  new Int32Array(mod.memory.buffer, ptr, input.length).set(input);

  const len = mod.run(cfg.gridSize, cfg.gapMax, cfg.cornerMax, cfg.extMax,
                      cfg.collEps, cfg.glanceSin, cfg.trim ? 1 : 0, cfg.iterCap);
  if (len < 0) throw new Error("wasm engine reported an unsound rule set (D did not fall)");

  const out = new Int32Array(mod.memory.buffer, mod.out_ptr(), len);
  const [nc, nu, nr, iterations, nComp] = out;

  let p = 5;
  const creates = [];
  for (let i = 0; i < nc; i++, p += 8) {
    creates.push({c: [out[p], out[p + 1], out[p + 2], out[p + 3]],
                  light: out[p + 4], sight: out[p + 5], sound: out[p + 6], move: out[p + 7],
                  door: 0, ds: 0, dir: 0, levels: [],
                  flags: {[FLAG_SCOPE]: {generated: true, run: runId}}});
  }
  const updates = [];
  for (let i = 0; i < nu; i++, p += 5) {
    const w = walls[out[p]];
    // priorC comes from the input wall — the compiled side never needs to carry it, but
    // without it a trim or weld on the wasm path could not be undone at all. Same per-run shape as
    // the js engine: `moves.<run>`, never the creating `run` (walls-edge-2).
    const known = w && Object.hasOwn(historyOf(w).moves, runId);
    updates.push({_id: w?._id ?? w?.id, c: [out[p + 1], out[p + 2], out[p + 3], out[p + 4]],
                  flags: {[FLAG_SCOPE]: {rule: "X1",
                                         ...(known ? {} : {moves: {[runId]: w ? [...w.c] : null}})}}});
  }
  p += nr * 2;   // positions only; reasons come from JS below, and only if there are any
  const components = [];
  for (let i = 0; i < nComp; i++, p += 2) {
    components.push({walls: out[p], dangling: out[p + 1], closed: out[p + 1] === 0});
  }

  // Hybrid split, by cost rather than by convenience. Components are cheap over a graph the
  // engine already has, so they are computed in wasm. Refusal *reasons* need a JS graph
  // build — the single most expensive thing here — so they are computed only when there is
  // actually something to explain, which on a settled scene is nothing. Wording therefore
  // can never drift from the reference, and a clean run pays nothing for the guarantee.
  const lints = lintOnly(walls, opts);
  let refusals = [];
  if (nr > 0) {
    const applied = walls.map(w => {
      const u = updates.find(u => u._id === (w._id ?? w.id));
      return u ? {...w, c: u.c} : w;
    }).concat(creates.map((c, i) => ({_id: `gen-${i}`, ...c})));
    refusals = analyze(applied, opts).refusals;
  }

  return {
    creates, updates, refusals, lints, log: [],
    report: {iterations, created: creates.length, moved: updates.length,
             refused: refusals.length, components,
             config: {gridSize: cfg.gridSize, weldEps: cfg.weldEps, collEps: cfg.collEps,
                      pinEps: cfg.pinEps, gapMax: cfg.gapMax, cornerMax: cfg.cornerMax,
                      extMax: cfg.extMax}}
  };
}

// Registration is SYNCHRONOUS and the load is fire-and-forget. A top-level `await` here
// suspends evaluation of every module that imports this one — which delayed
// pentaryn-walls.mjs past Foundry's `ready` hook, so the API was never attached. The
// backend simply reports itself unavailable until the bytes arrive, and `pickBackend`
// falls back to JS for any run in that window.
export const ready = load();

register({
  name: "wasm",
  run: runWasm,
  available: () => mod !== null,
  accepts
});
