// Engine golden (guide step 1.6, finding -5 recipe) and the test-side half of senses-walls-cursors-3.
//  - golden/engine.json: a sha256 of every js result over the corpus and the bench rooms 3/5/8/10, so a
//    performance change to the engine (finding -5) must reproduce today's output byte for byte;
//  - golden/canonical.json: canonical() of every fixture on both backends;
//  - golden/backend-drift.json: the fields canonical()/compare() cannot see today (levels on creates,
//    the rule stamp on updates, log length, created flag keys), per fixture, js vs wasm.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pinJSON } from "./kit/harness.mjs";
import { canonical, get, runEngine, wasmReady } from "./fixtures/engine.mjs";
import { runCorpus } from "./fixtures/runner.mjs";
import { rooms } from "./fixtures/rooms.mjs";

await wasmReady;
const sha = r => createHash("sha256")
  .update(JSON.stringify({ creates: r.creates, updates: r.updates, refusals: r.refusals, lints: r.lints, log: r.log, report: r.report }))
  .digest("hex");

const js = runCorpus(get("js").run);
const wasm = runCorpus(get("wasm").run);

test("js engine output is byte-stable over the corpus and the bench rooms (golden/engine.json)", () => {
  const out = { corpus: {}, rooms: {} };
  for (const row of js) out.corpus[row.name] = row.res ? sha(row.res) : null;
  for (const n of [3, 5, 8, 10]) out.rooms[`${n}x${n}`] = sha(runEngine(rooms(n), { gridSize: 100, runId: "golden" }));
  pinJSON("engine", out, import.meta.url);
});

test("canonical() of every fixture on both backends (golden/canonical.json)", () => {
  const out = {};
  for (let i = 0; i < js.length; i++) {
    out[js[i].name] = { js: js[i].res && canonical(js[i].res), wasm: wasm[i].res && canonical(wasm[i].res) };
  }
  pinJSON("canonical", out, import.meta.url);
});

test("senses-walls-cursors-3: creates/updates/refusals agree js vs wasm for every fixture except the KNOWN levels ones", () => {
  for (let i = 0; i < js.length; i++) {
    if (js[i].fx.knownWasm) continue;
    assert.deepEqual(canonical(wasm[i].res), canonical(js[i].res), js[i].name);
  }
});

test("senses-walls-cursors-3: what compare() is blind to, per fixture (golden/backend-drift.json)", () => {
  const view = r => ({
    createLevels: r.creates.map(c => JSON.stringify(c.levels ?? null)).sort(),
    updateRules: r.updates.map(u => u.flags?.["wall-autocomplete"]?.rule ?? null).sort(),
    logLength: r.log.length,
    createFlagKeys: [...new Set(r.creates.flatMap(c => Object.keys(c.flags?.["wall-autocomplete"] ?? {})))].sort(),
  });
  const out = {};
  for (let i = 0; i < js.length; i++) {
    if (!js[i].res) continue;
    const a = view(js[i].res), b = view(wasm[i].res);
    const fields = Object.keys(a).filter(k => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
    if (fields.length) out[js[i].name] = Object.fromEntries(fields.map(k => [k, { js: a[k], wasm: b[k] }]));
  }
  pinJSON("backend-drift", out, import.meta.url);
});
