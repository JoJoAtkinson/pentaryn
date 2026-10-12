import { test } from "node:test";
import assert from "node:assert/strict";
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
