// Round-ID comments are regression tests (0.8.0, Fable's review §4: "each round-ID comment becomes a named regression
// test"). Every live-round ID a source comment cites (S1R1-02, FR2-09, H3-05, R7-2, D-4 ...) must name a test: its ID in
// a test's title, in any suite. PENDING lists the ones still waiting for theirs (the list may only shrink: a new
// comment that cites a round needs its test in the same change).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../", import.meta.url);
const ID = /\b(AR[1-9]-\d{2}|S[1-3]R[1-3]-\d{2}|FR[12]-\d{2}|HX[12]-\d{2}|H[1-5]-\d{2}|R[1-7]-\d{1,2}|D-\d{1,2})\b/g;

/** Cited in a comment, not yet the title of a test (2026-11-23, 0.8.0). */
/** 2026-11-24 (0.9.0 cleanup): the five below were the names of tests of the planner, the guard and the tier C stop that step 6 deleted. */
const PENDING = new Set(["H2-01", "H4-01", "H4-03", "HX1-01", "S1R2-05", "D-9", "D-10", "FR1-12", "H2-06", "H2-14", "H4-14",
  "R3-3", "R4-5", "R7-2", "R7-4"]);

function sources() {
  return readdirSync(root).filter(f => f.endsWith(".mjs")).map(f => readFileSync(new URL(f, root), "utf8"));
}
function titles() {
  const dir = new URL("./", import.meta.url);
  const out = [];
  for (const f of readdirSync(dir).filter(n => n.endsWith(".test.mjs"))) {
    const s = readFileSync(new URL(f, dir), "utf8");
    for (const m of s.matchAll(/^\s*test\((["`])([\s\S]*?)\1\s*,/gm)) out.push(m[2]);
  }
  return out;
}

test("every round ID a source comment cites names a regression test (or is listed PENDING)", () => {
  const cited = new Set(sources().flatMap(s => [...s.matchAll(ID)].map(m => m[1])));
  const named = new Set(titles().flatMap(t => [...t.matchAll(ID)].map(m => m[1])));
  const missing = [...cited].filter(id => !named.has(id) && !PENDING.has(id)).sort();
  assert.deepEqual(missing, [], `cited in a comment with no test named for it: ${missing.join(", ")}`);
  const stale = [...PENDING].filter(id => named.has(id) || !cited.has(id)).sort();
  assert.deepEqual(stale, [], `PENDING entries that now have a test, or are cited nowhere (take them off): ${stale.join(", ")}`);
});
