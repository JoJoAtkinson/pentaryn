import { test } from "node:test";
import assert from "node:assert/strict";
import { logOrConsole, makeLog } from "../log.mjs";

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

test("notify: one toast with console:false plus one console line; no toast without ui", () => {
  const { c, lines } = sink();
  const toasts = [];
  const g = { ui: { notifications: { warn: (m, o) => toasts.push([m, o]) } } };
  const log = makeLog("m", { console: c, g });
  log.notify("warn", "Careful", { permanent: true });
  assert.deepEqual(toasts, [["Careful", { console: false, permanent: true }]]);
  assert.deepEqual(lines, [["warn", "m | Careful"]]);
  assert.equal(makeLog("m", { console: c, g: {} }).notify("warn", "x"), undefined);
});

// kit-edge-8 (defect wave 2, Joe 2026-10-12): the console line is written first, unconditionally.
test("kit-edge-8: notify without ui.notifications still writes its console line and returns undefined", () => {
  const { c, lines } = sink();
  assert.equal(makeLog("m", { console: c, g: {} }).notify("warn", "No ui"), undefined);
  assert.equal(makeLog("m", { console: c, g: { ui: {} } }).notify("error", "No toasts"), undefined);
  const g = { ui: { notifications: { warn: () => "toast" } } };
  assert.equal(makeLog("m", { console: c, g }).notify("info", "No info method"), undefined);
  assert.equal(makeLog("m", { console: c, g }).notify("warn", "Shown"), "toast");
  assert.deepEqual(lines, [
    ["warn", "m | No ui"], ["error", "m | No toasts"], ["info", "m | No info method"], ["warn", "m | Shown"],
  ]);
});

// kit-ext-2 (defect wave 2, Joe 2026-10-12): the one "log or console" fallback the kit shares.
test("kit-ext-2: logOrConsole returns the log as given, else a console stand-in that warns once per key", () => {
  const log = makeLog("m", { console: sink().c, g: {} });
  assert.equal(logOrConsole("m", log), log);
  const { c, lines } = sink();
  const out = logOrConsole("pentaryn-x", null, { g: { console: c } });
  const err = new Error("e");
  out.error("boom", err);
  out.warn("careful");
  out.warnOnce("k", "once");
  out.warnOnce("k", "once again");
  assert.deepEqual(lines, [["error", "pentaryn-x | boom", err], ["warn", "pentaryn-x | careful"], ["warn", "pentaryn-x | once"]]);
  assert.doesNotThrow(() => logOrConsole("m", null, { g: {} }).warnOnce("k", "no console"));
});
