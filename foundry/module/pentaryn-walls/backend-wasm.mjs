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
import {resolveConfig, SOLID, FLAG_SCOPE} from "./wall-engine.mjs";

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
  const buf = new Int32Array(1 + walls.length * 8);
  buf[0] = walls.length;
  walls.forEach((w, i) => {
    const o = 1 + i * 8;
    buf[o] = w.c[0]; buf[o + 1] = w.c[1]; buf[o + 2] = w.c[2]; buf[o + 3] = w.c[3];
    buf[o + 4] = w.door ?? 0;
    buf[o + 5] = w.sight ?? 20;
    buf[o + 6] = w.dir ?? 0;
    buf[o + 7] = (w.flags?.[FLAG_SCOPE]?.keepOpen === true) ? 1 : 0;
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
  const [nc, nu, nr, iterations] = out;

  let p = 4;
  const creates = [];
  for (let i = 0; i < nc; i++, p += 4) {
    creates.push({c: [out[p], out[p + 1], out[p + 2], out[p + 3]], ...SOLID, levels: [],
                  flags: {[FLAG_SCOPE]: {generated: true, run: opts.runId ?? "run"}}});
  }
  const updates = [];
  for (let i = 0; i < nu; i++, p += 5) {
    const w = walls[out[p]];
    updates.push({_id: w?._id ?? w?.id, c: [out[p + 1], out[p + 2], out[p + 3], out[p + 4]],
                  flags: {[FLAG_SCOPE]: {generated: true, run: opts.runId ?? "run"}}});
  }
  const refusals = [];
  for (let i = 0; i < nr; i++, p += 2) {
    refusals.push({at: [out[p], out[p + 1]], wall: null, why: "(wasm backend: position only)"});
  }

  return {
    creates, updates, refusals, lints: [], log: [],
    report: {iterations, created: creates.length, moved: updates.length,
             refused: refusals.length, components: [], config: {gridSize: cfg.gridSize}}
  };
}

await load();

register({
  name: "wasm",
  run: runWasm,
  available: () => mod !== null
});
