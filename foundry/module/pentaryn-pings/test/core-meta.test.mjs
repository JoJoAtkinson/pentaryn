// Guide step 2 (transform-creatures-36): pings-core.mjs, imported bare. Its constants, the
// VERSION === module.json pin (C41), and a seeded sweep proving core against the verbatim oracle on
// inputs the hand tables in core.test.mjs do not list. core.test.mjs runs every table on both.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as core from "../pings-core.mjs";
import { oracle } from "./fixtures/impls.mjs";
import { manifestOf } from "./kit/harness.mjs";

const manifest = manifestOf(new URL("..", import.meta.url));

test("core loads with no Foundry globals and imports nothing", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(g in globalThis, false, g);
  const src = readFileSync(new URL("../pings-core.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(src, /^\s*import\b/m);
});

test("VERSION === module.json version; id, namespace and constants", () => {
  assert.equal(core.VERSION, manifest.version);
  assert.equal(core.MODULE, manifest.id);
  assert.deepEqual(
    [core.SHORT, core.NS, core.CONTRACT, core.I18N, core.CSS, core.FLAG_SCOPE],
    ["pings", "pings", "pentaryn-pings/api@1", "PENTARYN_PINGS", "ppg-", "pentaryn-pings"],
  );
  assert.deepEqual(core.HOOKS, {});
  assert.ok(Object.isFrozen(core.HOOKS));
  assert.deepEqual(
    [core.DEDUPE_MS, core.FLUSH_MS, core.DEFAULT_MAX, core.MAX_CAP, core.DEFAULT_GRID],
    [400, 250, 50, 500, 100],
  );
});

/** Deterministic LCG, so a failure names a reproducible case. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

test("seeded sweep: core equals the oracle on 2000 generated cases per function", () => {
  const r = rng(36);
  const pick = list => list[Math.floor(r() * list.length)];
  const int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  for (let i = 0; i < 2000; i++) {
    const gridSize = pick([undefined, 50, 100, 140, 150, 200]);
    const scene = { width: int(0, 6000), height: int(0, 6000), padding: pick([0, 0.1, 0.25, 0.33, 0.5]), gridSize };
    const offset = core.imageOffset(scene);
    same(offset, oracle.imageOffset(scene), `imageOffset #${i} ${JSON.stringify(scene)}`);

    const rec = { t: int(0, 1e6), userId: pick(["u", "v"]), sceneId: pick(["s", "t"]), x: int(-500, 8000), y: int(-500, 8000) };
    const now = rec.t + int(-3000, 120000);
    const { ageMs, ...rest } = core.decorate(rec, { offset, gridSize }, now);
    same(rest, oracle.decorate(rec, { offset, gridSize }, now), `decorate #${i}`);
    assert.equal(ageMs, now - rec.t, `decorate ageMs #${i} (step 6)`);

    const next = { userId: pick(["u", "v"]), sceneId: pick(["s", "t"]), x: rec.x + pick([0, 0, 1, -1]), y: rec.y + pick([0, 0, 1]) };
    const at = rec.t + int(-100, 800);
    assert.equal(core.isDuplicate(rec, next, at, 400), oracle.isDuplicate(rec, next, at, 400), `isDuplicate #${i}`);

    const raw = pick([int(-10, 900), String(int(0, 600)), "x", null, undefined, NaN, Infinity, r() * 3]);
    assert.equal(core.capLimit(raw), oracle.capLimit(raw), `capLimit #${i} ${String(raw)}`);

    const len = int(0, 8);
    const limit = pick([1, 2, 3, 5, 8, 0.5, 2.5]);
    const a = Array.from({ length: len }, (_, k) => k), b = Array.from({ length: len }, (_, k) => k);
    same(core.appendCapped(a, "n", limit), oracle.appendCapped(b, "n", limit), `appendCapped #${i}`);
    same(a, b, `appendCapped input #${i}`);

    const n = pick([undefined, 0, 1, 3, 10, 20, -1, -4, "2"]);
    const list = Array.from({ length: int(0, 15) }, (_, k) => k);
    same(n === undefined ? core.recentOf(list) : core.recentOf(list, n), n === undefined ? oracle.recentOf(list) : oracle.recentOf(list, n), `recentOf #${i}`);
  }
});

test("pinned quirk: recentOf with n = null or non-numeric returns the whole list, newest first", () => {
  const list = ["a", "b", "c"];
  for (const n of [null, "x"]) {
    assert.deepEqual(core.recentOf(list, n), ["c", "b", "a"], `core ${String(n)}`);
    assert.deepEqual(oracle.recentOf(list, n), ["c", "b", "a"], `oracle ${String(n)}`);
  }
  assert.deepEqual(list, ["a", "b", "c"]);
});
