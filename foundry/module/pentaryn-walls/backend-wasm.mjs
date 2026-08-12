/**
 * WASM backend — loads the compiled Rust engine and registers it alongside the JS one.
 *
 * The JS engine stays the reference. This module only marshals: walls in as a flat i32
 * array, mutations out as another. It deliberately does NOT reproduce refusal *text* —
 * refusal positions are what `compare()` checks, and the diagnostic strings are cheap to
 * produce in JS if ever needed.
 *
 * Import for the side effect of registering:  `import "./backend-wasm.mjs";`
 * It is safe to import when the module has not been built — `available()` just stays false.
 */

import {register} from "./backends.mjs";
import {resolveConfig, analyze, lintOnly, SOLID, FLAG_SCOPE} from "./wall-engine.mjs";

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
    buf[o + 7] = (w.flags?.[FLAG_SCOPE]?.keepOpen === true) ? 1 : 0;
    buf[o + 8] = w.light ?? 20;
    buf[o + 9] = w.sound ?? 20;
    buf[o + 10] = w.move ?? 20;
  });
  return buf;
}

export function runWasm(walls, opts = {}) {
  if (!mod) throw new Error(`wasm backend not loaded${loadError ? `: ${loadError.message}` : ""}`);
  const cfg = resolveConfig(opts);
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
                  flags: {[FLAG_SCOPE]: {generated: true, run: opts.runId ?? "run"}}});
  }
  const updates = [];
  for (let i = 0; i < nu; i++, p += 5) {
    const w = walls[out[p]];
    updates.push({_id: w?._id ?? w?.id, c: [out[p + 1], out[p + 2], out[p + 3], out[p + 4]],
                  flags: {[FLAG_SCOPE]: {generated: true, run: opts.runId ?? "run"}}});
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

await load();

register({
  name: "wasm",
  run: runWasm,
  available: () => mod !== null
});
