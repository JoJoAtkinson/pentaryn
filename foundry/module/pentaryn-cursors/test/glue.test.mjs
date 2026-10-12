// Glue characterisation (guide step 1.5, cases (a)–(j) except (i), which is publish.test.mjs;
// findings -30, -31, -32 test halves). The entry is loaded exactly as Foundry would and driven only
// through its hooks, the setting's onChange, the wrapped control/tool onChange, the region-preview
// listeners, the MutationObserver callback and the published API — no test seam — so the pins
// survive the step-5 split into board.mjs unchanged.
//
// The API is read only after ready PLUS a tick, and its legacy keys are checked as a floor (never
// an exact key list). module.api is not pinned here: api.test.mjs pins it as the canonical surface.
//
// Timers are mocked (the ready tick and canvasReady's resync tick); nothing waits on real time.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { cursorWorld, flush, hookSequence } from "./fixtures/board.mjs";
import { KEYS, MODULE, VARS, cursorValues } from "../cursors-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const F = await cursorWorld();
const { el, events, observers, setTool } = F;
const warns = [];
console.warn = (...args) => warns.push(args);

await import("../cursors.mjs");
const hooksAtLoad = F.hooks.slice();
const BASE = "/modules/pentaryn-cursors";
const values = key => cursorValues(key, BASE, false);
const NO_VARS = Object.fromEntries(VARS.map(v => [v, null]));
const api = () => game.pentaryn.cursors;
/** The wrapped onChange of a fake control set (getSceneControlButtons), for driving tool changes. */
let controls = null;
/** Throw from every read of ui.controls (refresh reads it once the setting and canvas allow). */
function breakControls() {
  const saved = ui.controls;
  Object.defineProperty(ui, "controls", { get() { throw new Error("controls broke"); }, configurable: true });
  return () => Object.defineProperty(ui, "controls", { value: saved, writable: true, configurable: true, enumerable: true });
}

test("foundry.utils is Foundry's own common/ code", () => {
  console.log(`# foundry ${F.foundryBuild ?? "unknown"} · utils from ${F.utilsSource}`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("hook registration manifest at load (golden/hooks.json)", () => {
  // Consecutive identical rows collapse: board.mjs (the ready attach) and the entry (the ready
  // publish) each register a `once ready` listener, and hookSequence folds the pair into one row.
  pinJSON("hooks", hookSequence(hooksAtLoad), import.meta.url);
  assert.deepEqual(hookSequence(hooksAtLoad).map(h => `${h.kind} ${h.name}`), [
    "once init", "on getSceneControlButtons", "on renderSceneControls", "on activateCanvasLayer",
    "on canvasReady", "on canvasTearDown", "once ready",
  ]);
  assert.equal(game.pentaryn, undefined, "nothing is published at load");
  assert.equal(observers.length, 0, "nothing touches the board at load");
});

test("(a) init registers pentaryn-cursors.enabled exactly, plus an onChange", () => {
  F.fire("init");
  const reg = F.calls.filter(c => c.op === "settings.register").map(c => c.id);
  assert.deepEqual(reg, [`${MODULE}.enabled`]);
  const { namespace, key, onChange, ...config } = game.settings.settings.get(`${MODULE}.enabled`);
  assert.deepEqual([namespace, key], [MODULE, "enabled"]);
  assert.deepEqual(config, {
    name: "PENTARYN_CURSORS.Setting.enabled.Name", hint: "PENTARYN_CURSORS.Setting.enabled.Hint",
    scope: "client", config: true, type: Boolean, default: true,
  });
  assert.equal(typeof onChange, "function");
});

test("(b) ready + one tick: the legacy API (a floor), one observer on #board, two preview listeners", async () => {
  F.fire("ready");
  mock.timers.tick(0);
  await flush();
  const a = api();
  assert.ok(a, "game.pentaryn.cursors is published after ready plus a tick");
  for (const k of ["refresh", "current", "keys", "keyFor"]) assert.ok(k in a, k);
  for (const k of ["refresh", "current", "keyFor"]) assert.equal(typeof a[k], "function", k);
  assert.deepEqual(a.keys, KEYS);
  assert.deepEqual(Object.keys(a.keys), ["target", "ruler", "aoe", "note", "draw"]);
  // finding -31's counts
  assert.equal(observers.length, 1);
  assert.equal(observers[0].observed.length, 1);
  assert.equal(observers[0].observed[0].target, el);
  assert.deepEqual(observers[0].observed[0].options, { attributes: true, attributeFilter: ["style"] });
  assert.deepEqual(F.preview.onCalls, ["childAdded", "childRemoved"]);
  // tokens.select: the system arrow, nothing set, style.cursor untouched, no resync needed
  assert.equal(a.current(), null);
  assert.deepEqual(el.vars(), NO_VARS);
  assert.equal(el.dataset.pentarynCursor, undefined);
  assert.equal(el.style.cursor, "var(--cursor-default)");
  assert.deepEqual(events.setCursorCalls, []);
  assert.deepEqual(warns, []);
});

test("keyFor and keys through the API (the live golden's keyForTable)", () => {
  const tools = [["tokens", "select"], ["tokens", "target"], ["tokens", "ruler"], ["notes", "journal"], ["drawings", "rect"]];
  const got = tools.map(([control, tool]) => api().keyFor({ control, tool }))
    .concat(api().keyFor({ control: "tokens", tool: "select", templatesActive: true }));
  assert.deepEqual(got, [null, "target", "ruler", "note", "draw", "aoe"]);
});

test("(c) tokens.target: refresh() → \"target\", exactly the four vars, dataset; a repeat writes nothing", () => {
  setTool("tokens", "target");
  assert.equal(api().refresh(), "target");
  assert.deepEqual(el.props(), values("target"));
  assert.equal(el.dataset.pentarynCursor, "target");
  assert.equal(api().current(), "target");
  assert.equal(el.style.cursor, "var(--cursor-default)", "style.cursor is Foundry's, never ours");
  const n = el.styleCalls.length;
  assert.equal(api().refresh(), "target");
  assert.equal(el.styleCalls.length, n, "same key, same dataset → apply() short-circuits");
  // a key change removes all four, then sets all four
  setTool("tokens", "ruler");
  assert.equal(api().refresh(), "ruler");
  assert.deepEqual(el.styleCalls.slice(n), [...VARS.map(v => ["remove", v]), ...VARS.map(v => ["set", v])]);
  assert.deepEqual(el.props(), values("ruler"));
});

test("the dataset is the second half of apply()'s short-circuit: a cleared dataset is rewritten", () => {
  setTool("tokens", "ruler");
  delete el.dataset.pentarynCursor;
  const n = el.styleCalls.length;
  assert.equal(api().refresh(), "ruler");
  assert.equal(el.styleCalls.length, n + 8);
  assert.equal(el.dataset.pentarynCursor, "ruler");
});

test("each tool → key, through the hooks that refresh", () => {
  const rows = [];
  for (const [control, tool, hook] of [
    ["tokens", "select", "renderSceneControls"], ["notes", "journal", "renderSceneControls"],
    ["drawings", "rect", "activateCanvasLayer"], ["drawings", "select", "activateCanvasLayer"],
    ["walls", "walls", "renderSceneControls"], ["tokens", "target", "activateCanvasLayer"],
  ]) {
    setTool(control, tool);
    F.fire(hook);
    rows.push([control, tool, api().current(), el.dataset.pentarynCursor ?? null]);
  }
  assert.deepEqual(rows, [
    ["tokens", "select", null, null], ["notes", "journal", "note", "note"],
    ["drawings", "rect", "draw", "draw"], ["drawings", "select", null, null],
    ["walls", "walls", null, null], ["tokens", "target", "target", "target"],
  ]);
  assert.deepEqual(el.props(), values("target"));
});

test("(f) getSceneControlButtons wraps controls and modal tools once; the wrap refreshes after the original", () => {
  const seen = [];
  const original = function (...args) { seen.push(["tokens", this === controls.tokens, args]); };
  const rulerOriginal = () => seen.push(["ruler"]);
  const toggleOnChange = () => seen.push(["toggle"]);
  const toggle = { toggle: true, onChange: toggleOnChange };
  const button = { button: true };
  controls = {
    tokens: { onChange: original, tools: { ruler: { onChange: rulerOriginal }, target: {}, toggle, clear: button } },
    notes: { tools: { journal: {} } },
    junk: null,
    word: "not a control",
  };
  F.fire("getSceneControlButtons", controls);
  const first = { tokens: controls.tokens.onChange, ruler: controls.tokens.tools.ruler.onChange, target: controls.tokens.tools.target.onChange, notes: controls.notes.onChange, journal: controls.notes.tools.journal.onChange };
  for (const [k, fn] of Object.entries(first)) assert.equal(typeof fn, "function", `${k} wrapped (absent onChange included)`);
  assert.notEqual(first.tokens, original);
  assert.notEqual(first.ruler, rulerOriginal);
  assert.equal(toggle.onChange, toggleOnChange, "toggle tools are not wrapped");
  assert.equal("onChange" in button, false, "button tools are not wrapped");
  assert.equal(controls.junk, null);
  F.fire("getSceneControlButtons", controls);
  assert.equal(controls.tokens.onChange, first.tokens, "a second fire does not wrap again");
  assert.equal(controls.tokens.tools.ruler.onChange, first.ruler);
  F.fire("getSceneControlButtons", undefined);   // tolerated

  // the original runs with its this and args, then refresh() (SF8: the tool change is seen through
  // onChange before renderSceneControls)
  setTool("tokens", "ruler");
  controls.tokens.tools.ruler.onChange({ e: 1 }, true);
  assert.deepEqual(seen, [["ruler"]]);
  assert.equal(api().current(), "ruler");
  setTool("notes", "journal");
  controls.tokens.onChange.call(controls.tokens, "x", 2);
  assert.deepEqual(seen.at(-1), ["tokens", true, ["x", 2]]);
  assert.equal(api().current(), "note");
  setTool("tokens", "target");
  assert.equal(controls.tokens.tools.target.onChange(), undefined, "absent original → undefined");
  assert.equal(api().current(), "target");
  // the original's return value passes through
  const ret = { onChange: () => "value" };
  F.fire("getSceneControlButtons", { x: ret });
  assert.equal(ret.onChange(), "value");
});

test("(f) a throwing original onChange propagates, and refresh() still ran", () => {
  const ctl = { onChange: () => { throw new Error("original broke"); }, tools: {} };
  F.fire("getSceneControlButtons", { ctl });
  setTool("tokens", "ruler");
  assert.equal(api().current(), "target");
  assert.throws(() => ctl.onChange(), /original broke/);
  assert.equal(api().current(), "ruler");
});

test("(e) resync: a blanked style.cursor re-issues Foundry's mode once; otherwise nothing", () => {
  const fire = () => observers[0].callback([], observers[0]);
  events.currentCursor = "pointer";
  el.style.cursor = "var(--cursor-pointer)";
  fire();
  assert.deepEqual(events.setCursorCalls, [], "style.cursor non-empty → no call");
  el.style.cursor = "";
  fire();
  assert.deepEqual(events.setCursorCalls, [{ mode: "pointer", currentBefore: null }], "currentCursor nulled, then setCursor(mode)");
  assert.equal(events.currentCursor, "pointer");
  events.setCursorCalls.length = 0;
  events.currentCursor = null;
  fire();
  assert.deepEqual(events.setCursorCalls, [], "no current mode → no call");
  // a setCursor that is not a function: nothing, and currentCursor is left alone
  events.currentCursor = "default";
  const real = events.setCursor;
  events.setCursor = "nope";
  fire();
  assert.equal(events.currentCursor, "default");
  events.setCursor = real;
  el.style.cursor = "var(--cursor-default)";
  assert.deepEqual(warns, []);
});

test("(g) a throwing resync inside the observer warns `resync failed`; currentCursor is left null", () => {
  el.style.cursor = "";
  events.currentCursor = "default";
  events.throwOnSetCursor = true;
  observers[0].callback([], observers[0]);
  events.throwOnSetCursor = false;
  assert.equal(warns.length, 1);
  assert.equal(warns[0].length, 2);
  assert.equal(warns[0][0], "pentaryn-cursors | resync failed");
  assert.match(String(warns[0][1]?.message), /setCursor broke/);
  assert.equal(events.currentCursor, null, "quirk: the nulled mode is not put back when setCursor throws");
  el.style.cursor = "var(--cursor-default)";
  events.setCursorCalls.length = 0;
  warns.length = 0;
});

test("(g) a throwing refresh inside the preview listener and inside the wrapped onChange warns `refresh failed`", () => {
  const ctl = { onChange: () => "kept", tools: {} };
  F.fire("getSceneControlButtons", { ctl });
  const restore = breakControls();
  try {
    F.preview.emit("childAdded", {});
    F.preview.emit("childRemoved", {});
    assert.equal(ctl.onChange(), "kept", "the original's value still returns");
  } finally {
    restore();
  }
  assert.deepEqual(warns.map(w => w[0]), ["pentaryn-cursors | refresh failed", "pentaryn-cursors | refresh failed", "pentaryn-cursors | refresh failed"]);
  assert.ok(warns.every(w => w.length === 2 && /controls broke/.test(w[1]?.message)));
  warns.length = 0;
});

test("a throwing refresh inside a raw hook handler is Foundry's to report (no guard today)", () => {
  const caught = F.hookErrors.length;
  const restore = breakControls();
  const err = console.error;
  console.error = () => {};
  try {
    F.fire("renderSceneControls");
    F.fire("activateCanvasLayer");
  } finally {
    restore();
    console.error = err;
  }
  assert.deepEqual(F.hookErrors.slice(caught).map(e => [e.hook, e.error.message]), [
    ["renderSceneControls", "controls broke"], ["activateCanvasLayer", "controls broke"],
  ]);
  assert.deepEqual(warns.map(w => String(w[0]).startsWith("Foundry VTT | Error thrown in hooked function")), [true, true]);
  assert.ok(warns.every(w => !String(w[0]).startsWith(MODULE)), "nothing logged under the module prefix");
  warns.length = 0;
});

test("spell-area placement: the preview listeners switch to aoe and back", () => {
  setTool("tokens", "select");
  F.fire("renderSceneControls");
  assert.equal(api().current(), null);
  const placing = { id: "preview" };
  canvas.regions._placementContext = { preview: placing };
  F.preview.emit("childAdded", placing);
  assert.equal(api().current(), null, "context set, preview not yet in the container");
  F.preview.children.push(placing);
  F.preview.emit("childAdded", placing);
  assert.equal(api().current(), "aoe");
  assert.deepEqual(el.props(), values("aoe"));
  F.preview.children.length = 0;
  F.preview.emit("childRemoved", placing);
  assert.equal(api().current(), null, "cancel: the preview leaves while the context is still set");
  canvas.regions._placementContext = null;
  // a GM drag-drawing a region fills the container without a context: not aoe
  F.preview.children.push({ id: "gm" });
  F.preview.emit("childAdded");
  assert.equal(api().current(), null);
  F.preview.children.length = 0;
});

test("(d) setting false: onChange clears the vars and dataset; refresh() → null; resync is gated", async () => {
  setTool("tokens", "target");
  api().refresh();
  assert.equal(api().current(), "target");
  await game.settings.set(MODULE, "enabled", false);
  assert.deepEqual(el.vars(), NO_VARS);
  assert.deepEqual(el.props(), {});
  assert.equal(el.dataset.pentarynCursor, undefined);
  assert.equal(api().current(), null);
  assert.equal(api().refresh(), null);
  // keyFor is pure and ignores the setting
  assert.equal(api().keyFor({ control: "tokens", tool: "target" }), "target");
  // disabled: a blanked cursor is not repaired
  el.style.cursor = "";
  events.currentCursor = "pointer";
  observers[0].callback([], observers[0]);
  assert.deepEqual(events.setCursorCalls, []);
  // back on: onChange refreshes, then resyncs the blanked cursor
  await game.settings.set(MODULE, "enabled", true);
  assert.equal(api().current(), "target");
  assert.deepEqual(el.props(), values("target"));
  assert.deepEqual(events.setCursorCalls, [{ mode: "pointer", currentBefore: null }]);
  el.style.cursor = "var(--cursor-default)";
  events.setCursorCalls.length = 0;
});

test("(j) game.settings.get throwing → treated as enabled", () => {
  const get = game.settings.get;
  game.settings.get = () => { throw new Error("not registered"); };
  try {
    setTool("tokens", "ruler");
    assert.equal(api().refresh(), "ruler");
    setTool("tokens", "target");
    assert.equal(api().refresh(), "target");
  } finally {
    game.settings.get = get;
  }
  assert.deepEqual(warns, []);
});

test("canvas not ready → null; no board element → null without touching the old board", () => {
  setTool("tokens", "target");
  api().refresh();
  canvas.ready = false;
  assert.equal(api().refresh(), null);
  assert.deepEqual(el.props(), {}, "not ready: the board is cleared");
  canvas.ready = true;
  assert.equal(api().refresh(), "target");
  const app = canvas.app;
  canvas.app = undefined;
  assert.equal(api().refresh(), null);
  assert.equal(api().current(), null);
  assert.deepEqual(el.props(), values("target"), "no element: the old board keeps its vars");
  canvas.app = { view: el };                       // the fallback: canvas.app.view
  assert.equal(api().refresh(), "target");
  canvas.app = app;
});

test("canvasReady: guards once per element, watches each new preview container, resyncs a tick later", () => {
  const before = F.preview.onCalls.length;
  el.style.cursor = "";                            // e.g. Monk's Active Tiles blanks it on canvasReady
  events.currentCursor = "default";
  F.fire("canvasReady");
  assert.equal(observers.length, 1, "the same #board is not observed twice");
  assert.equal(F.preview.onCalls.length, before, "the same container is not watched twice");
  assert.deepEqual(events.setCursorCalls, [], "resync waits a tick");
  mock.timers.tick(0);
  assert.deepEqual(events.setCursorCalls, [{ mode: "default", currentBefore: null }]);
  events.setCursorCalls.length = 0;
  el.style.cursor = "var(--cursor-default)";

  // the region layer rebuilds its preview container per draw
  const old = canvas.regions.preview;
  const fresh = { children: [], onCalls: [], on(ev) { fresh.onCalls.push(ev); } };
  canvas.regions.preview = fresh;
  F.fire("canvasReady");
  assert.deepEqual(fresh.onCalls, ["childAdded", "childRemoved"]);
  mock.timers.tick(0);
  canvas.regions.preview = old;
});

test("(h) canvasTearDown clears the vars and current(); a later canvasReady re-applies", () => {
  setTool("drawings", "rect");
  api().refresh();
  assert.deepEqual(el.props(), values("draw"));
  F.fire("canvasTearDown");
  assert.deepEqual(el.props(), {});
  assert.equal(el.dataset.pentarynCursor, undefined);
  assert.equal(api().current(), null);
  F.fire("canvasReady");
  assert.equal(api().current(), "draw");
  mock.timers.tick(0);
  // tear-down with no board: current() still clears
  const app = canvas.app;
  canvas.app = undefined;
  F.fire("canvasTearDown");
  assert.equal(api().current(), null);
  canvas.app = app;
  assert.deepEqual(warns, []);
});
