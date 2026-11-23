// Telemetry and the circuit breaker's rule (0.8.0, telemetry-core): a ring buffer per client, a summary for the GM,
// the "that move was wrong" report text, and when the breaker trips.
import { test } from "node:test";
import assert from "node:assert/strict";
import { BREAKER, FAILED, TELEMETRY, breakerTrips, lineOf, push, reportText, ring, since, summarize } from "../telemetry-core.mjs";

test("the ring keeps the last `keep` events and counts every kind", () => {
  const r = ring(3);
  for (let k = 0; k < 5; k++) push(r, "plan", { ms: k }, k * 10);
  assert.deepEqual(r.events.map(e => e.ms), [2, 3, 4]);
  assert.equal(r.counts.plan, 5);
  assert.equal(r.events.at(-1).n, 5);
});

test("since: the events of the last ten seconds", () => {
  const r = ring();
  push(r, "stop", {}, 0);
  push(r, "cut", {}, 5000);
  push(r, "fire", {}, 12000);
  assert.deepEqual(since(r, 15000).map(e => e.kind), ["cut", "fire"]);
  assert.equal(TELEMETRY.windowMs, 10000);
});

test("the breaker: three errors, or six failed plans, in a session; core's move by design is no failure", () => {
  const r = ring();
  for (let k = 0; k < 20; k++) push(r, "fallback", { reason: "single" }, k);
  push(r, "fallback", { reason: "fightTier" }, 30);
  assert.equal(breakerTrips(r).trip, false, "expected core paths never trip it");
  for (let k = 0; k < BREAKER.fallbacks - 1; k++) push(r, "fallback", { reason: "budget" }, 40 + k);
  assert.equal(breakerTrips(r).trip, false);
  push(r, "fallback", { reason: "throw" }, 60);
  assert.deepEqual(breakerTrips(r), { trip: true, why: `${BREAKER.fallbacks} failed plans` });
  const e = ring();
  for (let k = 0; k < BREAKER.errors; k++) push(e, "error", { reason: "drop" }, k);
  assert.equal(breakerTrips(e).trip, true);
  assert.ok(FAILED.has("deliver") && !FAILED.has("single"));
});

test("summarize: plan time percentiles, fallbacks and notices by reason, fires per plan", () => {
  const r = ring();
  for (const ms of [10, 20, 30, 40, 200]) push(r, "plan", { ms }, 0);
  push(r, "fire", {}, 0);
  push(r, "fire", {}, 0);
  push(r, "fallback", { reason: "budget" }, 0);
  push(r, "notice", { notice: "short", reason: "tooNarrow" }, 0);
  const s = summarize(r);
  assert.deepEqual(s.plan, { n: 5, medianMs: 30, p95Ms: 200, maxMs: 200 });
  assert.equal(s.firesPerPlan, 0.4);
  assert.deepEqual(s.fallbacks, { budget: 1 });
  assert.deepEqual(s.notices, { tooNarrow: 1 });
});

test("reportText: a head, then one line per event, newest last, under the feedback cap", () => {
  const r = ring();
  push(r, "stop", { reason: "click", id: "abc" }, 1000);
  push(r, "cut", { reason: "wall", members: 2 }, 2500);
  const text = reportText("That move was wrong.", r.events, 3000);
  assert.equal(text, "That move was wrong.\n-2.0s stop reason=click id=abc\n-0.5s cut reason=wall members=2");
  assert.equal(lineOf({ n: 1, t: 0, kind: "plan", data: { a: 1 } }, 1000), "-1.0s plan data={\"a\":1}");
  const many = ring(1000);
  for (let k = 0; k < 900; k++) push(many, "fire", { id: `token${k}`, against: "someone" }, k);
  const long = reportText("head", many.events, 1000);
  assert.ok(long.length <= TELEMETRY.textMax && long.length < 4000, `${long.length} chars`);
  assert.ok(long.endsWith("against=someone"), "the newest kept");
  assert.equal(reportText("head", [], 0), "head\n(nothing recorded)");
});
