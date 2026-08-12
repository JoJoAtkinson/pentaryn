#!/usr/bin/env node
/**
 * Scaling benchmark. Answers the only question that decides whether a compiled backend is
 * worth building: **at what map size does this stop being instant?**
 *
 * Runs every registered backend over grids of rooms of increasing size and prints the curve.
 * With only the JS backend registered it measures JS; once a WASM backend registers itself
 * the same table gains a column and a verdict on whether the two agree.
 *
 *   node test/bench.mjs            # default sweep
 *   node test/bench.mjs 20         # include a 20x20 grid (1600 walls in)
 */

import {ready as wasmReady} from "../backend-wasm.mjs";
await wasmReady;   // the backend loads async; wait before asking if it is available
import {available, compare} from "../backends.mjs";

const w = (id, c) => ({_id: id, c, light: 20, move: 20, sight: 20, sound: 20,
                       door: 0, ds: 0, dir: 0, levels: []});

/** A grid of rooms, each hinted on all four sides — the densest realistic authoring. */
function rooms(n) {
  const out = [];
  let k = 0;
  const S = 400;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = c * S + 100, y = r * S + 100;
      out.push(w(`a${k++}`, [x + 80, y, x + 220, y]));
      out.push(w(`a${k++}`, [x + 300, y + 80, x + 300, y + 220]));
      out.push(w(`a${k++}`, [x + 80, y + 300, x + 220, y + 300]));
      out.push(w(`a${k++}`, [x, y + 80, x, y + 220]));
    }
  }
  return out;
}

const extra = process.argv.slice(2).map(Number).filter(Boolean);
const sizes = [...new Set([3, 5, 8, 10, 14, ...extra])].sort((a, b) => a - b);

const backends = available().map(b => b.name);
console.log(`backends: ${backends.join(", ")}${backends.length === 1 ? "  (wasm not built)" : ""}\n`);

const head = ["rooms", "walls in", "walls out", "passes", ...backends.map(b => `${b} (ms)`)];
console.log(head.join("  ").padEnd(10));
console.log("-".repeat(head.join("  ").length + 10));

for (const n of sizes) {
  const walls = rooms(n);
  const {rows, identical, diff} = compare(walls, {gridSize: 100, runId: "bench"});
  const ref = rows[0].result;
  const cells = [
    `${n}x${n}`.padEnd(7),
    String(walls.length).padEnd(9),
    String(walls.length + ref.creates.length).padEnd(10),
    String(ref.report.iterations).padEnd(7),
    ...rows.map(r => (r.error ? "ERR" : r.ms.toFixed(0)).padEnd(9))
  ];
  console.log(cells.join(" ") + (backends.length > 1 ? (identical ? "  ✓ identical" : `  ✗ ${diff}`) : ""));
}

console.log(`
Reading this: the per-pass work is quadratic in wall count, so the ms column should grow
roughly 4x each time the wall count doubles. A compiled backend moves the whole column down
by a constant factor; it does not change that shape. If the sizes you actually draw are
already in the low tens of ms, a compiled backend buys nothing you can perceive.`);
