// Live golden — pentaryn-cursors. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup } (or { module, skipped } when game.pentaryn.cursors is
// missing): `golden` is deterministic (ids normalised, timestamps
// dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs): the GM's own scene controls are switched through
// ui.controls.activate() to five tools (tokens.select / target / ruler, notes.journal,
// drawings.rect); after each, game.pentaryn.cursors.current(), the four --cursor-* variables
// inline on #board, its data-pentaryn-cursor and its style.cursor are read back. The control and
// tool the GM had are restored at the end. Per-client only: no documents are written.

const N = 5;
const median = xs => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
/** Median per-call ms over n samples; each sample times `reps` back-to-back calls (performance.now is ~0.1 ms coarse). */
async function timeIt(fn, n = N, reps = 1) {
  const xs = [];
  for (let i = 0; i < n; i++) {
    const t0 = performance.now();
    for (let k = 0; k < reps; k++) { const v = fn(i, k); if (v?.then) await v; }
    xs.push((performance.now() - t0) / reps);
  }
  const r = x => Math.round(x * 1e4) / 1e4;
  return { n, reps, medianMs: r(median(xs)), minMs: r(Math.min(...xs)), maxMs: r(Math.max(...xs)) };
}
const ids = new Map();
const tag = (id, label) => { if (id) ids.set(id, label); };
const DROP = new Set(["t", "at", "age", "ms", "_stats"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
/** Cleanup: run one step; a failure becomes a `NOT ` string diff.mjs fails on, and the next step still runs (LG-R8). */
const safely = async (name, fn) => { try { await fn(); } catch (e) { out.cleanup[`${name}CleanupError`] = `NOT done: ${e?.message ?? e}`; } };
/** One macrotask through a shared MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). One channel per golden; each message wakes the oldest waiting tick (perf-1). ref/unref exist only in Node (the offline tests), where an idle listening port would hold the process open. */
const tickQ = [];
const tickChan = new MessageChannel();
tickChan.port1.onmessage = () => { tickQ.shift()?.(); if (!tickQ.length) tickChan.port1.unref?.(); };
tickChan.port1.unref?.();
const tick = () => new Promise(r => { tickQ.push(r); tickChan.port1.ref?.(); tickChan.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };
/** Live only: poll until pred() holds or ms passes. */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const out = { module: "cursors", golden: {}, timings: {}, cleanup: {} };
const API = game.pentaryn?.cursors;
// module disabled: skip before any control switch, as walls.js does (LG-R4)
if (!API) {
  out.skipped = "pentaryn-cursors API is missing";
  return JSON.stringify(out);
}
const VARS = ["--cursor-default", "--cursor-default-down", "--cursor-pointer", "--cursor-pointer-down"];
const TOOLS = [["tokens", "select"], ["tokens", "target"], ["tokens", "ruler"], ["notes", "journal"], ["drawings", "rect"]];
const start = { control: ui.controls?.control?.name, tool: ui.controls?.tool?.name };
const board = () => canvas?.app?.renderer?.events?.domElement ?? canvas?.app?.view ?? null;
const read = () => {
  const el = board();
  return {
    control: ui.controls?.control?.name ?? null,
    tool: ui.controls?.tool?.name ?? null,
    current: API?.current?.() ?? null,
    dataset: el?.dataset?.pentarynCursor ?? null,
    styleCursor: el?.style?.cursor ?? null,
    vars: Object.fromEntries(VARS.map(v => [v, el?.style?.getPropertyValue(v) || null]))
  };
};
const go = async (control, tool) => { await ui.controls.activate({ control, tool }); await sleep(60); };
try {
  const el = board();
  out.golden.env = {
    surface: Object.keys(API ?? {}).sort(),
    keys: Object.keys(API?.keys ?? {}),
    moduleApi: typeof game.modules.get("pentaryn-cursors")?.api,
    boardId: el?.id ?? null, boardTag: el?.tagName ?? null,
    route: foundry.utils.getRoute("modules/pentaryn-cursors"),
    imageSetSupported: !!globalThis.CSS?.supports?.("cursor", 'image-set(url("x.png") 1x) 0 0, auto'),
    rootVarDefault: getComputedStyle(document.documentElement).getPropertyValue("--cursor-default").trim() || null,
    enabled: game.settings.get("pentaryn-cursors", "enabled")
  };
  out.golden.tools = [];
  for (const [c, t] of TOOLS) { await go(c, t); out.golden.tools.push(read()); }
  out.golden.keyForTable = TOOLS.map(([control, tool]) => API.keyFor({ control, tool })).concat(API.keyFor({ control: "tokens", tool: "select", templatesActive: true }));

  // timings: refresh() under the target tool (the hot path every control change runs), and a tool
  // switch through ui.controls until current() reports the new key
  await go("tokens", "target");
  out.timings.refresh = await timeIt(() => API.refresh(), 9, 100);
  out.timings.toolSwitch = await timeIt(async i => {
    const tool = i % 2 ? "target" : "ruler";
    await ui.controls.activate({ control: "tokens", tool });
    await settle(() => API.current() === tool, 1000);
  }, 6);
} catch (e) {
  out.golden.error = caught(e);
} finally {
  await safely("tool", async () => { await ui.controls.activate({ control: start.control ?? "tokens", tool: start.tool ?? "select" }); await sleep(60); });
  const restored = read();
  Object.assign(out.cleanup, {
    toolRestored: restored.control === (start.control ?? "tokens") && restored.tool === (start.tool ?? "select"),
    restored, wanted: start
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
