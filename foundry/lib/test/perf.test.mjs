import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { coalesce, memo, perFrame } from "../perf.mjs";

test("memo caches per key, honours ttl and max, and clears", () => {
  let t = 0, runs = 0;
  const f = memo(x => (runs++, x * 2), undefined, { ttlMs: 10, max: 2, now: () => t });
  assert.equal(f(1), 2);
  assert.equal(f(1), 2);
  assert.equal(runs, 1);
  t = 11;
  f(1);
  assert.equal(runs, 2);
  f(2); f(3);
  assert.equal(f.size(), 2);
  f.clear();
  assert.equal(f.size(), 0);
});

// kit-perf-2 (final review 2026-10-12): memo holds its keys strongly in a Map and evicts in
// insertion order (FIFO), default max 500. Ruling: no code change until a consumer exists — the
// memo JSDoc and the README perf.mjs row must say callers key by a string (uuid/id) via keyFn,
// never by a placeable, and that eviction is FIFO with a max of 500.
test("kit-perf-2: memo's JSDoc and the README perf.mjs row say key by a string via keyFn, never a placeable; FIFO, max 500", () => {
  const src = readFileSync(fileURLToPath(new URL("../perf.mjs", import.meta.url)), "utf8");
  const doc = src.slice(0, src.indexOf("export function memo")).split("/**").pop();
  const readme = readFileSync(fileURLToPath(new URL("../README.md", import.meta.url)), "utf8");
  const row = readme.split("\n").find(l => l.startsWith("| `perf.mjs` |"));
  assert.ok(row, "README.md has no perf.mjs row");
  for (const [where, text] of [["memo JSDoc", doc], ["README perf.mjs row", row]]) {
    for (const needle of ["string", "keyFn", "never a placeable", "FIFO", "500"]) {
      assert.ok(text.includes(needle), `${where} does not mention "${needle}"`);
    }
  }
  // and the documented behaviour is the real one: FIFO by first insertion — a hit does not refresh
  let runs = 0;
  const f = memo(k => (runs++, k), undefined, { max: 2 });
  f("a"); f("b"); f("a"); f("c");
  assert.equal(runs, 3);
  f("a");
  assert.equal(runs, 4, "a hit refreshed 'a' — eviction is no longer FIFO; fix the docs");
});

test("coalesce shares the in-flight promise, then starts fresh", async () => {
  let runs = 0;
  let release;
  const f = coalesce(() => new Promise(r => { runs++; release = r; }));
  const a = f(), b = f();
  assert.equal(a, b);
  release(1);
  assert.equal(await a, 1);
  const c = f();
  assert.notEqual(c, a);
  release(2);
  assert.equal(await c, 2);
  assert.equal(runs, 2);
});

test("kit-edge-4: a call from inside fn's synchronous prefix shares the run, and no settle clears a newer run", async () => {
  let runs = 0;
  let inner;
  const releases = [];
  const f = coalesce(() => {
    runs++;
    if (runs === 1) inner = f();
    return new Promise(r => releases.push(r));
  });
  const a = f();
  assert.equal(runs, 1);
  assert.equal(inner, a);
  assert.equal(f(), a);
  releases[0]("one");
  assert.equal(await a, "one");
  assert.equal(await inner, "one");
  const b = f();
  assert.notEqual(b, a);
  assert.equal(f(), b);
  releases[1]("two");
  assert.equal(await b, "two");
  assert.equal(runs, 2);
});

test("coalesce: a throwing fn rejects the shared run, then the next call starts fresh", async () => {
  let runs = 0;
  const f = coalesce(() => {
    runs++;
    if (runs === 1) throw new Error("boom");
    return "ok";
  });
  await assert.rejects(f(), /boom/);
  assert.equal(await f(), "ok");
  assert.equal(runs, 2);
});

test("perFrame runs once per frame with the latest args", () => {
  const frames = [];
  const seen = [];
  const f = perFrame(x => seen.push(x), { g: { requestAnimationFrame: cb => frames.push(cb) } });
  f(1); f(2); f(3);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.deepEqual(seen, [3]);
  f(4);
  frames.shift()();
  assert.deepEqual(seen, [3, 4]);
});

test("perFrame falls back to setTimeout 0 in node", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const seen = [];
  const f = perFrame(x => seen.push(x), { g: { setTimeout } });
  f("a"); f("b");
  t.mock.timers.tick(0);
  assert.deepEqual(seen, ["b"]);
});
