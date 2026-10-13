// The backend registry and the wasm adapter (standalone findings, guide steps 3 and 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceScan } from "./kit/harness.mjs";
import * as core from "./fixtures/engine.mjs";

const ROOT = new URL("..", import.meta.url);

const STALE = ["WASM", "STATUS"].join("_");

test("senses-walls-cursors-7: the stale wasm placeholder export is gone (module sources and tests)", () => {
  assert.deepEqual(sourceScan(ROOT, new RegExp(STALE), { exclude: ["lib/", "test/kit/"] }), []);
  assert.equal(STALE in core, false);
});

test("senses-walls-cursors-37: readyLine appends why wasm is missing, and only then", async () => {
  // walls-EXT-11: the paths and keys are arguments now, before the wasm error.
  const line = (names, err) => core.readyLine(names, ["run"], [{ action: "run", editable: [{ key: "KeyW", modifiers: ["Alt"] }] }], err);
  const healthy = line(["js", "wasm"], null);
  assert.equal(healthy, line(["js", "wasm"]));
  assert.equal(line(["js"], "ENOENT: no such file"), `${line(["js"])} (wasm unavailable: ENOENT: no such file)`);
});

test("senses-walls-cursors-37: loadErrorMessage() is null when the .wasm loaded", async () => {
  const { loadErrorMessage, ready } = await import("../backend-wasm.mjs");
  await ready;
  assert.equal(loadErrorMessage(), null);
});

test("senses-walls-cursors-37: a copy without the .wasm loads js only and reports ENOENT", async () => {
  const { cpSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "walls-nowasm-"));
  try {
    const src = fileURLToPath(ROOT);
    for (const f of ["backend-wasm.mjs", "walls-core.mjs", "core"]) cpSync(join(src, f), join(dir, f), { recursive: true });
    const copy = await import(pathToFileURL(join(dir, "backend-wasm.mjs")).href);
    await copy.ready;
    assert.match(copy.loadErrorMessage(), /ENOENT/);
    const reg = await import(pathToFileURL(join(dir, "walls-core.mjs")).href);
    assert.deepEqual(reg.available().map(b => b.name), ["js"]);
    assert.equal(reg.get("wasm").available(), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("walls-rob-10: a browser fetch that 404s reports the HTTP status, not a CompileError", async () => {
  const { cpSync, mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { fileURLToPath, pathToFileURL } = await import("node:url");
  const dir = mkdtempSync(join(tmpdir(), "walls-404-"));
  const realFetch = globalThis.fetch;
  try {
    const src = fileURLToPath(ROOT);
    for (const f of ["backend-wasm.mjs", "walls-core.mjs", "core"]) cpSync(join(src, f), join(dir, f), { recursive: true });
    const copy = await import(pathToFileURL(join(dir, "backend-wasm.mjs")).href);
    await copy.ready;
    const target = "https://vtt.example/modules/pentaryn-walls/wall-engine.wasm";
    globalThis.fetch = async () => ({ ok: false, status: 404,
      arrayBuffer: async () => new TextEncoder().encode("<html>Not Found</html>").buffer });
    assert.equal(await copy.load(target), null);
    assert.equal(copy.loadErrorMessage(), `fetch ${target} \u2192 HTTP 404`);
  } finally {
    globalThis.fetch = realFetch;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("senses-walls-cursors-3: canonical(r, {extended}) adds createLevels/updateRules, order-independent", async () => {
  const r = {
    creates: [{ c: [100, 0, 0, 0], levels: ["L2", "L1"] }, { c: [0, 0, 0, 100] }],
    updates: [{ _id: "b", c: [5, 5, 1, 1], flags: { "wall-autocomplete": { rule: "W1" } } }, { _id: "a", c: [1, 1, 2, 2] }],
    refusals: [],
  };
  const plain = core.canonical(r);
  const ext = core.canonical(r, { extended: true });
  assert.deepEqual(Object.keys(plain), ["creates", "updates", "refusals"]);
  assert.deepEqual({ creates: ext.creates, updates: ext.updates, refusals: ext.refusals }, plain);
  assert.deepEqual(ext.createLevels, ['0,0,0,100:[]', '0,0,100,0:["L1","L2"]']);
  assert.deepEqual(ext.updateRules, ["a:null", "b:W1"]);
  const reversed = { ...r, creates: [...r.creates].reverse(), updates: [...r.updates].reverse() };
  assert.deepEqual(core.canonical(reversed, { extended: true }), ext);
});

test("senses-walls-cursors-3: over the corpus, levels agree across backends; rule drift is what backend-drift.json records", async () => {
  const { readJSON } = await import("./kit/harness.mjs");
  const { runCorpus } = await import("./fixtures/runner.mjs");
  await core.wasmReady;
  const js = runCorpus(core.get("js").run), wasm = runCorpus(core.get("wasm").run);
  const ruleDrift = [];
  for (let i = 0; i < js.length; i++) {
    if (!js[i].res) continue;
    const a = core.canonical(js[i].res, { extended: true }), b = core.canonical(wasm[i].res, { extended: true });
    assert.deepEqual(b.createLevels, a.createLevels, js[i].name);
    if (JSON.stringify(a.updateRules) !== JSON.stringify(b.updateRules)) ruleDrift.push(js[i].name);
  }
  const drift = readJSON(new URL("test/golden/backend-drift.json", ROOT));
  assert.deepEqual(ruleDrift, Object.keys(drift).filter(k => drift[k].updateRules));
});

test("walls-rob-1: wasm honours the iteration cap — it throws js's exact message instead of committing a partial result", async () => {
  const { FIXTURES } = await import("./fixtures/corpus.mjs");
  await core.wasmReady;
  const js = core.get("js").run, wasm = core.get("wasm").run;
  // Any corpus scene that needs two or more passes overflows a cap of 1.
  const fx = FIXTURES.find(f => f.walls && (f.expect?.iterations ?? 0) >= 2 && core.get("wasm").accepts(f.walls, f.opts));
  assert.ok(fx, "the corpus has a multi-pass scene the wasm accepts");
  const opts = { ...fx.opts, runId: "rob1", iterCap: 1 };
  const want = "wall-autocomplete: hit the 1-iteration cap; nothing was committed.";
  assert.throws(() => js(fx.walls, opts), { message: want });
  assert.throws(() => wasm(fx.walls, opts), { message: want });
  // Uncapped, the same scene still runs on both.
  assert.doesNotThrow(() => wasm(fx.walls, { ...fx.opts, runId: "rob1" }));
});

test("walls-rob-2: compare() reports js throwing as a diff instead of a TypeError when another backend runs", async () => {
  const { FIXTURES } = await import("./fixtures/corpus.mjs");
  await core.wasmReady;
  // A stand-in backend that never throws, switched on only for this test.
  let on = true;
  core.register({ name: "rob2-stub", available: () => on, run: () => ({ creates: [], updates: [], refusals: [] }) });
  try {
    const fx = FIXTURES.find(f => f.walls && (f.expect?.iterations ?? 0) >= 2);
    assert.ok(fx, "the corpus has a multi-pass scene");
    const opts = { ...fx.opts, runId: "rob2", iterCap: 1 };   // js throws the cap error
    const out = core.compare(fx.walls, opts);
    assert.equal(out.identical, false);
    assert.equal(out.diff, "js threw: wall-autocomplete: hit the 1-iteration cap; nothing was committed.");
    const js = out.rows.find(r => r.backend === "js");
    assert.ok(js.error);
    assert.ok(out.rows.find(r => r.backend === "rob2-stub").result, "the stub's row is still reported");
  } finally {
    on = false;
  }
});

test("walls-edge-6: an empty scene reports the same result on wasm as on js (0 passes, not 1)", async () => {
  await core.wasmReady;
  const js = core.get("js").run([], { runId: "edge6" });
  const wasm = core.get("wasm").run([], { runId: "edge6" });
  assert.equal(js.report.iterations, 0);
  assert.deepEqual(wasm, js);
  assert.equal(core.compare([], { runId: "edge6" }).identical, true);
});
