// Refusal output pinned on a refusal-heavy scene (final review perf-2): the refusal sweep may reuse
// work enumerate already did, but the text a GM reads must not move by a byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { analyze, runEngine } from "./fixtures/engine.mjs";

const w = (id, c) => ({_id: id, c, light: 20, move: 20, sight: 20, sound: 20,
                       door: 0, ds: 0, dir: 0, levels: []});

/** A 10x10 lattice of isolated stubs, 25 squares apart: nothing is in reach, so every end is refused. */
function stubs(n) {
  const out = [];
  let k = 0;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = c * 2500 + 100, y = r * 2500 + 100;
      out.push((r + c) % 2 ? w(`s${k++}`, [x, y, x + 100, y + 50]) : w(`s${k++}`, [x, y, x, y + 100]));
    }
  }
  return out;
}

test("refusal-heavy stub grid: runEngine and analyze output pinned", () => {
  const g = stubs(10);
  const run = runEngine(g, { gridSize: 100, runId: "r" });
  const an = analyze(g, { gridSize: 100 });
  assert.equal(run.creates.length + run.updates.length, 0);
  assert.equal(run.refusals.length, 200);
  // Captured before perf-2 (diagnose reusing enumerate's E1 ray).
  const hash = createHash("sha256").update(JSON.stringify({ run: run.refusals, analyze: an.refusals })).digest("hex");
  assert.equal(hash, "95e0e6127271521001e0b6bfd71ac5139c2780226d83dfff89baa74dfc117b4b");
});

test("refusal-heavy stub grid: analyze() refusals equal runEngine() refusals when no rule applies", () => {
  const g = stubs(10);
  assert.deepEqual(analyze(g, { gridSize: 100 }).refusals, runEngine(g, { gridSize: 100, runId: "r" }).refusals);
});

test("refusal sweep with iterCap 0 still diagnoses every end (no enumerate ran)", () => {
  const g = stubs(3);
  const capped = runEngine(g, { gridSize: 100, runId: "r", iterCap: 0 }).refusals;
  assert.deepEqual(capped, runEngine(g, { gridSize: 100, runId: "r" }).refusals);
});
