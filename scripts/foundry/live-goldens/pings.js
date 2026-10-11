// Live golden — pentaryn-pings. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup }: `golden` is deterministic (ids normalised, timestamps
// dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs): the patched ControlsLayer#handlePing on the GM's
// live canvas layer, called with `{scene: <ZZ scene id>}` so the record is filed against a ZZ
// scratch scene (4000×3000, padding 0.25, grid 100 — the guide's fixture world) while core draws
// nothing (the GM is viewing another scene). Captured: last() straight after the call (before the
// 250 ms flush) and after it, a same-spot repeat inside 400 ms (dedupe), and Foundry's own
// scene.dimensions next to the module's imageOffset arithmetic.
// `lastImmediateIsScratch` depends on world state, not on the code: true while the module's buffer
// still aliases the array game.settings.get returns (before the first flush and below the cap),
// false after (wave-1-baseline.md SF3). Compare it across runs only with the ring in the same state.
//
// ⚠ Side effect that cannot be undone from outside the module: the scratch pings (1 + N timing
// pings) stay in the world's ping ring (setting pentaryn-pings.log, capped at `max`), labelled with
// the deleted ZZ scene's name. The module keeps a private buffer, so restoring the setting would be
// overwritten by the next flush; only clear() empties both, and that would drop real history.

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
/** Live only: poll until pred() holds or ms passes. */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await new Promise(r => setTimeout(r, 10)); }
  return !!pred();
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const out = { module: "pings", golden: {}, timings: {}, cleanup: {} };
const API = game.pentaryn.pings;
const MOD = "pentaryn-pings";
let scene = null;
try {
  const layer = canvas.controls;
  out.golden.patch = {
    layerClass: layer.constructor.name,
    patchedOnInstanceProto: !!layer.handlePing?.__pentarynPatched,
    ownInstanceProperty: Object.hasOwn(layer, "handlePing"),
    patchedOn: (() => { let p = layer, d = 0; while (p && !Object.hasOwn(p, "handlePing")) { p = Object.getPrototypeOf(p); d++; } return p ? `${p.constructor.name} (depth ${d})` : null; })(),
    surface: Object.keys(API ?? {}).sort(),
    moduleApi: typeof game.modules.get(MOD)?.api,
    max: game.settings.get(MOD, "max")
  };
  scene = await Scene.create({ name: "ZZ live-goldens pings", width: 4000, height: 3000, padding: 0.25, grid: { size: 100 } });
  tag(scene.id, "scene"); tag(game.user.id, "gm");

  const logBefore = game.settings.get(MOD, "log");
  const ret = layer.handlePing(game.user, { x: 1050.4, y: 849.6 }, { scene: scene.id });
  layer.handlePing(game.user, { x: 1050, y: 850 }, { scene: scene.id }); // same spot inside 400 ms
  const lastImmediate = API.last();
  await sleep(400); // past the 250 ms flush
  const lastAfter = API.last();
  const d = scene.dimensions;
  out.golden.ping = {
    handlePingReturns: ret?.then ? "Promise" : typeof ret,
    // the guide's stub expects false here (read lag before the flush) — see wave-1-baseline.md
    lastImmediateIsScratch: lastImmediate?.sceneId === scene.id,
    settingGetReturnsSameArray: game.settings.get(MOD, "log") === game.settings.get(MOD, "log"),
    settingArrayReplacedByFlush: game.settings.get(MOD, "log") !== logBefore,
    lastAfter,
    scratchRecordsInLog: game.settings.get(MOD, "log").filter(r => r.sceneId === scene.id).length,
    foundryDims: { sceneX: d.sceneX, sceneY: d.sceneY, size: d.size, width: d.width, height: d.height, sceneWidth: d.sceneWidth, sceneHeight: d.sceneHeight },
    imageMatchesFoundry: lastAfter ? (lastAfter.image.x === 1050 - d.sceneX && lastAfter.image.y === 850 - d.sceneY) : null
  };
  out.golden.recentShape = API.recent(2).map(r => Object.keys(r));

  // timings: the patched handlePing (record + core early-return), and last() (a settings read + decorate)
  // per sample: one recorded ping then 49 de-duplicated repeats of it (only N records reach the ring)
  out.timings.handlePing = await timeIt(i => layer.handlePing(game.user, { x: 1500 + i * 100, y: 1500 }, { scene: scene.id }), N, 50);
  await sleep(400);
  out.timings.last = await timeIt(() => API.last(), 9, 200);
  out.timings.recent10 = await timeIt(() => API.recent(10), 9, 50);
} catch (e) {
  out.golden.error = caught(e);
} finally {
  if (scene && game.scenes.get(scene.id)) await scene.delete();
  out.cleanup = { zzScenesLeft: game.scenes.filter(s => s.name.startsWith("ZZ ")).length };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
