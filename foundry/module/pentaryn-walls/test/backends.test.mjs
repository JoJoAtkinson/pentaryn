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
  const { readyLine } = core;
  const healthy = readyLine(["js", "wasm"], null);
  assert.equal(healthy, readyLine(["js", "wasm"]));
  assert.equal(readyLine(["js"], "ENOENT: no such file"), `${readyLine(["js"])} (wasm unavailable: ENOENT: no such file)`);
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
