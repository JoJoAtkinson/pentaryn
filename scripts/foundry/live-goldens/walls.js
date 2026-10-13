// Live golden — pentaryn-walls (`game.pentaryn.walls`).
//
// RUN ONLY WHEN JOE RE-ENABLES WALLS. walls is switched off in Joe's world; with the module
// inactive this script returns `{ skipped: "pentaryn-walls is not active (run only when Joe re-enables walls)" }`
// and writes nothing.
// Never enable the module to run it: enabling is a world-settings change and needs a reload.
//
// Body of an async function for the foundry `eval-js` MCP tool (paste the file as `script`,
// timeoutMs 60000). GM client only. Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.2.0 code ("before") and the wave-2 code ("after")
//     both have — the engine's answer on trace D1 (the square house) through runEngine, preview
//     and run on both backends, and the idempotent second run.
//   - `golden.declared`: undo (senses-walls-cursors-1: "before" throws, Foundry 14 rejects
//     getFlag("wall-autocomplete"); "after" removes the run), the kit surface (W-6), analyze()
//     (-33, new), the run lock (-9: a second call while one runs returns null "after").
// What it exercises (the real glue): a ZZ scratch scene (padding 0, grid 100, no Levels) holding
// the five D1 walls (two windows, a window, a door, a hint); preview({sceneId, backend}) for js
// and, when loaded, wasm; run({sceneId, backend: "js"}) twice; undo({sceneId}). The GM whisper
// cards it posts (this GM's own messages only) are captured, compared with the time stripped,
// and deleted. The scene (and its walls) is deleted at the end.
// Wave 2 live plan: context/plans/addon-blueprint-2026-10/wave-2-live-plan.md.

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
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();
/** One macrotask through a shared MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). One channel per golden; each message wakes the oldest waiting tick (perf-1). ref/unref exist only in Node (the offline tests), where an idle listening port would hold the process open. */
const tickQ = [];
const tickChan = new MessageChannel();
tickChan.port1.onmessage = () => { tickQ.shift()?.(); if (!tickQ.length) tickChan.port1.unref?.(); };
tickChan.port1.unref?.();
const tick = () => new Promise(r => { tickQ.push(r); tickChan.port1.ref?.(); tickChan.port2.postMessage(0); });
/** Live only: poll until pred() holds or ms passes. */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const MOD = "pentaryn-walls";
const RUN_ID = "ZZ-golden-run";
const out = { module: "walls", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const mod = game.modules.get(MOD);
const W = game.pentaryn?.walls;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: W?.version ?? null,
  levels: !!game.modules.get("levels")?.active
};
if (!mod?.active || !W) {
  out.skipped = "pentaryn-walls is not active (run only when Joe re-enables walls)";
  return JSON.stringify(out);
}
const S = out.golden.shared, D = out.golden.declared;

// Trace D1, the square house (test/fixtures/corpus.mjs): two windows on the north side, a window
// on the east, a door on the south, a hint on the west. Expected: 9 creates, 0 updates, closed.
const wall = (c, extra = {}) => ({ c, light: 20, move: 20, sight: 20, sound: 20, door: 0, dir: 0, ...extra });
const win = c => wall(c, { light: 30, sight: 30 });
const D1 = () => [
  win([200, 0, 400, 0]), win([600, 0, 800, 0]), win([1000, 300, 1000, 600]),
  wall([400, 1000, 600, 1000], { door: 1 }), wall([0, 400, 0, 600])
];
/** The engine's answer without ids, run stamps or timings: what the geometry is. */
const summary = r => (r && typeof r === "object" && !r.threw) ? {
  creates: (r.creates ?? []).map(w => ({ c: w.c, light: w.light, sight: w.sight, move: w.move, sound: w.sound, door: w.door, dir: w.dir ?? 0 }))
    .sort((a, b) => JSON.stringify(a.c).localeCompare(JSON.stringify(b.c))),
  updates: (r.updates ?? []).map(u => ({ c: u.c ?? null })).sort((a, b) => JSON.stringify(a.c).localeCompare(JSON.stringify(b.c))),
  refusals: (r.refusals ?? []).map(x => ({ at: x.at, why: x.why })),
  lints: (r.lints ?? []).map(l => l.code).sort(),
  report: r.report ? {
    created: r.report.created, moved: r.report.moved, iterations: r.report.iterations,
    components: (r.report.components ?? []).length, closed: (r.report.components ?? []).filter(c => c.closed).length,
    config: r.report.config ? { ...r.report.config, runId: undefined } : null
  } : null
} : r;
/** A chat card's text with the timing removed. */
const card = m => m ? String(m.content ?? "").replace(/<[^>]+>/g, " ").replace(/\bin \d+ ms\b/g, "in <ms> ms").replace(/\s+/g, " ").trim() : null;
const sceneWalls = scene => scene.walls.map(w => {
  const o = w.toObject();
  const stamp = o.flags?.["wall-autocomplete"] ?? o.flags?.[MOD] ?? null;
  return { c: o.c, door: o.door, light: o.light, sight: o.sight, stamped: !!stamp, generated: !!stamp?.generated };
}).sort((a, b) => JSON.stringify(a.c).localeCompare(JSON.stringify(b.c)));

const chats = [];
// only this GM's own messages: a player's card posted mid-run is never captured or deleted (LG-AC-1)
const hookId = Hooks.on("createChatMessage", (m, opts, userId) => { if (userId === game.user.id) chats.push(m.id); });
const lastCard = async n0 => { await settle(() => chats.length > n0, 2000); return chats.length > n0 ? card(game.messages.get(chats.at(-1))) : null; };
let scene = null;
try {
  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["preview", "run", "undo", "makeMacro", "runEngine", "backends"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof W[k]]));
  D.surface = { keys: keysOf(W), moduleApi: typeof mod?.api, frozen: Object.isFrozen(W), contract: W.contract ?? null };
  const backends = (await probe(() => W.backends())) ?? [];
  S.backends = Array.isArray(backends) ? backends.map(b => b.name).sort() : backends;
  const wasm = Array.isArray(backends) ? backends.find(b => b.name === "wasm") : null;

  // ── the engine, pure ─────────────────────────────────────────────────────────
  const fixture = () => D1().map((w, i) => ({ _id: `D1w${i}`, ...w, ds: 0, levels: [], flags: {} }));
  S.runEngine = summary(await probe(() => W.runEngine(fixture(), { gridSize: 100, runId: RUN_ID })));
  if (wasm) S.runWasm = summary(await probe(() => wasm.run(fixture(), { gridSize: 100, runId: RUN_ID })));

  // ── the glue on a scratch scene ──────────────────────────────────────────────
  scene = await Scene.create({ name: "ZZ live-goldens walls", width: 1000, height: 1000, padding: 0, grid: { size: 100 } });
  tag(scene.id, "scene");
  await scene.createEmbeddedDocuments("Wall", D1());
  S.drawn = sceneWalls(scene);

  let n0 = chats.length;
  S.previewJs = { result: summary(await probe(() => W.preview({ sceneId: scene.id, backend: "js" }))), card: await lastCard(n0), walls: scene.walls.size };
  if (wasm) {
    n0 = chats.length;
    S.previewWasm = { result: summary(await probe(() => W.preview({ sceneId: scene.id, backend: "wasm" }))), card: await lastCard(n0), walls: scene.walls.size };
  }
  n0 = chats.length;
  S.run = { result: summary(await probe(() => W.run({ sceneId: scene.id, backend: "js", runId: RUN_ID }))), card: await lastCard(n0) };
  S.afterRun = sceneWalls(scene);
  n0 = chats.length;
  S.rerun = { result: summary(await probe(() => W.run({ sceneId: scene.id, backend: "js", runId: `${RUN_ID}-2` }))), card: await lastCard(n0) };
  S.afterRerun = sceneWalls(scene);
  S.noScene = await probe(() => W.preview({ sceneId: "zzNoSuchScene000" }));

  // ── declared ─────────────────────────────────────────────────────────────────
  D.analyze = typeof W.analyze === "function" ? summary(await probe(() => W.analyze({ sceneId: scene.id, backend: "js" }))) : "absent";
  // -9: one run at a time for every caller; "after" answers the overlapping call with null
  D.overlap = await probe(async () => {
    const a = W.preview({ sceneId: scene.id, backend: "js" });
    const b = W.preview({ sceneId: scene.id, backend: "js" });
    const [ra, rb] = await Promise.all([a, b]);
    return { first: ra === null ? null : "result", second: rb === null ? null : "result" };
  });
  n0 = chats.length;
  D.undo = { result: await probe(() => W.undo({ sceneId: scene.id })), card: await lastCard(n0), walls: sceneWalls(scene) };

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.runEngineJs = await timeIt(() => W.runEngine(fixture(), { gridSize: 100, runId: RUN_ID }), 9, 20);
  if (wasm) out.timings.runEngineWasm = await timeIt(() => wasm.run(fixture(), { gridSize: 100, runId: RUN_ID }), 9, 20);
} catch (e) {
  S.error = caught(e);
} finally {
  Hooks.off("createChatMessage", hookId);
  await tick();
  const mine = chats.filter(id => game.messages.has(id));
  if (mine.length) await safely("chat", () => ChatMessage.deleteDocuments(mine));
  if (scene && game.scenes.get(scene.id)) await safely("scene", () => scene.delete());
  Object.assign(out.cleanup, {
    chatDeleted: mine.length,
    chatLeft: chats.filter(id => game.messages.has(id)).length,
    zzScenesLeft: game.scenes.filter(s => s.name.startsWith("ZZ ")).length
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
