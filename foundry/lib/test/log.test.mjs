import { test } from "node:test";
import assert from "node:assert/strict";
import { makeLog } from "../log.mjs";

function sink() {
  const lines = [];
  const c = {};
  for (const m of ["error", "warn", "info", "debug"]) c[m] = (...a) => lines.push([m, ...a]);
  return { c, lines };
}

test("lines are `<module> | <event>` — byte-identical to the hand-written prefix", () => {
  const { c, lines } = sink();
  const g = { CONFIG: { debug: {} } };
  const log = makeLog("pentaryn-x", { console: c, g });
  const err = new Error("e");
  assert.equal(log.error("boom", err), err);
  assert.equal(log.error("no error arg").message, "no error arg");
  log.warn("careful", 1);
  log.info("audit", { uuid: "Actor.a", ids: ["a"], by: "u" });
  assert.deepEqual(lines.map(l => l.slice(0, 2)), [
    ["error", "pentaryn-x | boom"], ["error", "pentaryn-x | no error arg"],
    ["warn", "pentaryn-x | careful"], ["info", "pentaryn-x | audit"],
  ]);
});

test("debug, debug$ and trace are gated by CONFIG.debug[moduleId]", () => {
  const { c, lines } = sink();
  const g = { CONFIG: { debug: {} } };
  const log = makeLog("pentaryn-x", { console: c, g, traceSize: 2 });
  log.debug("hidden");
  log.trace("op", 1);
  assert.equal(log.debug$, undefined);
  assert.equal(lines.length, 0);
  assert.deepEqual(log.traces(), []);
  g.CONFIG.debug["pentaryn-x"] = true;
  log.debug$?.("shown");
  for (let i = 0; i < 3; i++) log.trace("op", i);
  assert.deepEqual(lines, [["debug", "pentaryn-x | shown"]]);
  assert.deepEqual(log.traces().map(t => t.data), [1, 2]);
});

test("warnOnce warns once per key", () => {
  const { c, lines } = sink();
  const log = makeLog("m", { console: c, g: {} });
  log.warnOnce("k", "a");
  log.warnOnce("k", "a");
  log.warnOnce("j", "b");
  assert.equal(lines.length, 2);
});

test("swallow returns the fallback for a throw and for a rejection", async () => {
  const log = makeLog("m", { console: sink().c, g: {} });
  assert.equal(log.swallow("x", () => { throw new Error("no"); }, 7), 7);
  assert.equal(log.swallow("x", () => 3, 7), 3);
  assert.equal(await log.swallow("x", async () => { throw new Error("no"); }, 8), 8);
  assert.equal(await log.swallow("x", async () => 4, 8), 4);
});

test("notify: one toast with console:false plus one console line; no-op without ui", () => {
  const { c, lines } = sink();
  const toasts = [];
  const g = { ui: { notifications: { warn: (m, o) => toasts.push([m, o]) } } };
  const log = makeLog("m", { console: c, g });
  log.notify("warn", "Careful", { permanent: true });
  assert.deepEqual(toasts, [["Careful", { console: false, permanent: true }]]);
  assert.deepEqual(lines, [["warn", "m | Careful"]]);
  assert.equal(makeLog("m", { console: c, g: {} }).notify("warn", "x"), undefined);
});
