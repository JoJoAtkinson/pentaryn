// Core characterisation (guide step 1; behaviour tests of transform-creatures-36 and the decorate half
// of -39). One table per pure function, run against every entry of fixtures/impls.mjs — the verbatim
// oracle and pings-core.mjs. Key order is compared with JSON.stringify where it is part of the record
// contract (the live golden's recentShape).
//
// Documented quirks are pinned as they are, not called bugs (guide §3 step 2: "do not fix"):
//   recentOf(list, 0) returns the whole list, recentOf(list, -1) drops the first record,
//   `snapped` is canvas-space floor(x / g) * g whatever the grid type, a fractional max below 1 never trims.
// The -39 pin and its target:
//   "pin transform-creatures-39: decorate has no numeric age" runs for the oracle only; core runs the
//   "transform-creatures-39 target" test instead (step 6: `ageMs` follows `age`). Every other decorate
//   assertion (here and in glue.test / golden/record.json) checks the leading keys only.
import { IMPLS } from "./fixtures/impls.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";

const same = (got, want, msg) => assert.equal(JSON.stringify(got), JSON.stringify(want), msg ?? "JSON differs");

/** `got` starts with exactly `want`'s keys, in order, with equal values. */
const head = (got, want) => {
  const keys = Object.keys(want);
  same(Object.keys(got).slice(0, keys.length), keys, "key order");
  same(Object.fromEntries(keys.map(k => [k, got[k]])), want);
};
const RECORD_KEYS = ["t", "userId", "userName", "sceneId", "sceneName", "x", "y", "canvas", "image", "gridSquare", "snapped", "age"];

test("the pure functions load and run with no Foundry globals", () => {
  for (const g of ["game", "foundry", "CONFIG", "Hooks", "ui", "canvas"]) assert.equal(g in globalThis, false, g);
});

for (const [label, M] of IMPLS) {
  test(`${label}: DEDUPE_MS is 400`, () => {
    assert.equal(M.DEDUPE_MS, 400);
  });

  test(`${label}: isDuplicate compares the last record only: user, scene, x, y, and a 400 ms window`, () => {
    const last = { userId: "u", sceneId: "s", x: 10, y: 20, t: 1000 };
    const rec = { userId: "u", sceneId: "s", x: 10, y: 20 };
    const W = M.DEDUPE_MS;
    assert.equal(M.isDuplicate(last, rec, 1399, W), true, "399 ms later");
    assert.equal(M.isDuplicate(last, rec, 1400, W), false, "400 ms later");
    assert.equal(M.isDuplicate(last, rec, 1000, W), true, "same instant");
    assert.equal(M.isDuplicate(last, rec, 900, W), true, "stamped before the last record");
    assert.equal(M.isDuplicate(last, { ...rec, userId: "v" }, 1100, W), false, "other user");
    assert.equal(M.isDuplicate(last, { ...rec, sceneId: "t" }, 1100, W), false, "other scene");
    assert.equal(M.isDuplicate(last, { ...rec, x: 11 }, 1100, W), false, "x off by one");
    assert.equal(M.isDuplicate(last, { ...rec, y: 19 }, 1100, W), false, "y off by one");
    assert.equal(M.isDuplicate(last, { ...rec, x: "10" }, 1100, W), false, "strict equality on x");
    assert.equal(M.isDuplicate(undefined, rec, 1100, W), false, "empty buffer");
    assert.equal(M.isDuplicate(null, rec, 1100, W), false, "null last");
    assert.equal(M.isDuplicate(last, rec, 1000, 0), false, "zero window");
  });

  test(`${label}: capLimit — default 50, ceiling 500, anything not finite and positive is 50`, () => {
    const rows = [
      ["x", 50], [0, 50], [-5, 50], [900, 500], [25, 25], [NaN, 50], ["30", 30], [500, 500], [501, 500],
      [Infinity, 50], [null, 50], [undefined, 50], ["", 50], [true, 1], ["1e2", 100], [0.5, 0.5], [2.5, 2.5],
    ];
    for (const [raw, want] of rows) assert.equal(M.capLimit(raw), want, `capLimit(${String(raw)})`);
  });

  test(`${label}: appendCapped pushes in place under the cap and returns a new array when it trims`, () => {
    const a = { id: "a" }, b = { id: "b" }, c = { id: "c" }, d = { id: "d" };
    const under = [a, b];
    const got = M.appendCapped(under, c, 50);
    assert.equal(got, under, "same array: the push mutates the buffer (live: the settings cache, SF3)");
    same(got, [a, b, c]);

    const full = [a, b, c];
    const trimmed = M.appendCapped(full, d, 3);
    assert.notEqual(trimmed, full, "a trim returns a fresh slice");
    same(trimmed, [b, c, d]);
    same(full, [a, b, c, d], "the input was pushed to before the trim");

    same(M.appendCapped([a, b], c, 2.5), [b, c], "fractional limit: slice(-2.5) keeps 2");
    // quirk: a fractional max below 1 never trims — slice(-0.5) is slice(-0), the whole buffer
    same(M.appendCapped([a, b], c, 0.5), [a, b, c]);
  });

  test(`${label}: imageOffset rounds the padding up to a whole grid square`, () => {
    same(M.imageOffset({ width: 4000, height: 3000, padding: 0.25, gridSize: 100 }), { x: 1000, y: 800 });
    same(M.imageOffset({ width: 4000, height: 3000, padding: 0.25 }), { x: 1000, y: 800 }, "gridSize missing → 100");
    same(M.imageOffset({ width: 3000, height: 2000, padding: 0.25, gridSize: 100 }), { x: 800, y: 500 });
    same(M.imageOffset({ width: 3100, height: 2000, padding: 0.25, gridSize: 150 }), { x: 900, y: 600 });
    same(M.imageOffset({ width: 2000, height: 1500, padding: 0, gridSize: 100 }), { x: 0, y: 0 });
    same(M.imageOffset(undefined), { x: 0, y: 0 }, "missing scene");
    same(M.imageOffset(null), { x: 0, y: 0 }, "null scene");
  });

  test(`${label}: decorate — canvas, image, gridSquare, snapped, age; rec keys first`, () => {
    const rec = { t: 0, x: 1050, y: 850, userId: "u", sceneId: "s" };
    const info = { offset: { x: 1000, y: 800 }, gridSize: 100 };
    const out = M.decorate(rec, info, 12000);
    // every pinned key, its value and its position; trailing keys are the named -39 pin's business
    head(out, {
      t: 0, x: 1050, y: 850, userId: "u", sceneId: "s",
      canvas: { x: 1050, y: 850 },
      image: { x: 50, y: 50 },
      gridSquare: { i: 0, j: 0 },
      snapped: { x: 1000, y: 800 },
      age: "12s ago",
    });
    same(rec, { t: 0, x: 1050, y: 850, userId: "u", sceneId: "s" }, "input untouched");

    const full = { t: 5, userId: "u", userName: "U", sceneId: "s", sceneName: "S", x: 1050, y: 850 };
    same(Object.keys(M.decorate(full, info, 12000)).slice(0, RECORD_KEYS.length), RECORD_KEYS, "live golden recentShape");

    assert.equal(M.decorate(undefined, info, 12000), null);
    assert.equal(M.decorate(null, info, 12000), null);
  });

  test(`${label}: decorate — left of and above the image, other grid sizes, default grid`, () => {
    const rec = { t: 0, x: 950, y: 750, userId: "u", sceneId: "s" };
    const out = M.decorate(rec, { offset: { x: 1000, y: 800 }, gridSize: 100 }, 0);
    same([out.image, out.gridSquare, out.snapped], [{ x: -50, y: -50 }, { i: -1, j: -1 }, { x: 900, y: 700 }]);

    const g150 = M.decorate({ t: 0, x: 1000, y: 700 }, { offset: { x: 900, y: 600 }, gridSize: 150 }, 0);
    same([g150.image, g150.gridSquare, g150.snapped], [{ x: 100, y: 100 }, { i: 0, j: 0 }, { x: 900, y: 600 }]);

    const g = M.decorate({ t: 0, x: 1250, y: 1349 }, { offset: { x: 1000, y: 800 } }, 0);
    same([g.image, g.gridSquare, g.snapped], [{ x: 250, y: 549 }, { i: 2, j: 5 }, { x: 1200, y: 1300 }], "gridSize missing → 100");

    const none = M.decorate({ t: 0, x: 1050, y: 850 }, { offset: { x: 0, y: 0 }, gridSize: 100 }, 0);
    same([none.image, none.gridSquare, none.snapped], [{ x: 1050, y: 850 }, { i: 10, j: 8 }, { x: 1000, y: 800 }], "no offset");
  });

  test(`${label}: decorate — age is whole seconds, Math.round, may be negative`, () => {
    const info = { offset: { x: 0, y: 0 }, gridSize: 100 };
    const age = (t, now) => M.decorate({ t, x: 0, y: 0 }, info, now).age;
    same([age(0, 0), age(0, 499), age(0, 500), age(0, 1499), age(0, 1500), age(0, 61000), age(2000, 0)],
      ["0s ago", "0s ago", "1s ago", "1s ago", "2s ago", "61s ago", "-2s ago"]);
  });

  // flipped in guide step 6 ([declared] P-D3): the pin stays true of the verbatim oracle only
  if (label === "oracle") test(`${label}: pin transform-creatures-39: decorate has no numeric age`, () => {
    const full = { t: 0, userId: "u", userName: "U", sceneId: "s", sceneName: "S", x: 1050, y: 850 };
    const out = M.decorate(full, { offset: { x: 1000, y: 800 }, gridSize: 100 }, 12000);
    same(Object.keys(out), RECORD_KEYS, "the key list ends at age");
    assert.equal("ageMs" in out, false);
  });

  if (label !== "oracle") test(`${label}: transform-creatures-39 target — decorate adds ageMs after age (guide step 6)`, () => {
    const out = M.decorate({ t: 0, x: 1050, y: 850, userId: "u", sceneId: "s" }, { offset: { x: 1000, y: 800 }, gridSize: 100 }, 12000);
    same(Object.keys(out).slice(-2), ["age", "ageMs"]);
    assert.equal(out.ageMs, 12000);
  });

  test(`${label}: recentOf — newest first, default 10`, () => {
    const [a, b, c] = ["a", "b", "c"];
    const list = [a, b, c];
    same(M.recentOf(list, 2), [c, b]);
    same(M.recentOf(list), [c, b, a]);
    same(M.recentOf(list, undefined), [c, b, a]);
    same(M.recentOf(list, 1), [c]);
    same(M.recentOf(list, 5), [c, b, a]);
    same(M.recentOf(list, "2"), [c, b], "string n");
    same(M.recentOf([], 3), []);
    same(list, [a, b, c], "input untouched");
    const twelve = Array.from({ length: 12 }, (_, i) => i);
    same(M.recentOf(twelve), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  });

  test(`${label}: recentOf quirks (transform-creatures-36, pinned, not fixed)`, () => {
    const list = ["a", "b", "c"];
    // KNOWN: transform-creatures-36 — slice(-0) is the whole list
    same(M.recentOf(list, 0), ["c", "b", "a"]);
    // KNOWN: transform-creatures-36 — a negative n drops records from the oldest end
    same(M.recentOf(list, -1), ["c", "b"]);
    same(M.recentOf(list, -3), []);
  });
}
