// Live golden — pentaryn-importer. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup }: `golden` is deterministic (ids normalised, timestamps
// dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs):
//   1. the root namespace after every module's ready: Object.keys(game.pentaryn).sort(), frozen?
//      (the publish order is returned as `publishOrder`, outside `golden`: it is not compared)
//   2. import({dryRun:true}) against the world's default path (today: no actors.json → 404 abort)
//   3. import({dryRun:true}) against a synthetic ZZ manifest served by a fetch shim for ONE
//      scratch URL only, so the gate, the payload prep, findActorBySlug and the dry-run summary
//      run live: one would-create slug, one would-update (ZZ actor, hash differs), one skip
//      (ZZ actor, hash equal). Writes nothing; the two ZZ actors are deleted at the end.
// Not exercised: the version-gate / lint refusals (they raise a permanent error toast on the GM
// screen), and real writes.

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
const DROP = new Set(["t", "at", "age", "ms", "generatedAt", "_stats"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
/** Cleanup: run one step; a failure becomes a `NOT ` string diff.mjs fails on, and the next step still runs (LG-R8). */
const safely = async (name, fn) => { try { await fn(); } catch (e) { out.cleanup[`${name}CleanupError`] = `NOT done: ${e?.message ?? e}`; } };

const out = { module: "importer", golden: {}, timings: {}, cleanup: {} };
const P = game.pentaryn;
// Insertion order = the order the ready hooks published. Kept for reading, outside `golden`: it
// moves whenever another module's kit migration changes its ready path, so comparing it reported a
// false shared difference (overnight-2026-10-11 FX item 1).
out.publishOrder = Object.keys(P);

// 1 — root namespace
out.golden.root = {
  keys: Object.keys(P).sort(),
  frozen: Object.isFrozen(P),
  extensible: Object.isExtensible(P),
  importIsFunction: typeof P.import === "function",
  moduleId: P.moduleId ?? null,
  contract: P.contract ?? null,
  internalsKeys: Object.keys(P._internals ?? {}).sort(),
  internalsFrozen: Object.isFrozen(P._internals ?? {}),
  moduleApi: typeof game.modules.get("pentaryn-importer")?.api
};

// 2 — default path, as `make foundry-import` would call it after staging (here: nothing staged)
try { out.golden.dryRunDefault = norm(await P.import({ dryRun: true })); }
catch (e) { out.golden.dryRunDefault = caught(e); }
out.timings.dryRunDefault404 = await timeIt(async () => { try { await P.import({ dryRun: true }); } catch { /* expected */ } });

// 3 — synthetic manifest through a fetch shim for one scratch URL
const PATH = "zz-live-goldens/actors.json";
const URL_ = foundry.utils.getRoute(PATH);
const flags = game.modules.get("pentaryn-importer")?.flags?.pentaryn ?? {};
const sysMinor = String(game.system.version).split(".").slice(0, 2).join(".");
const entry = (slug, name, hash) => ({
  name, type: "npc",
  system: { attributes: { hp: { value: 7, max: 7 } } },
  flags: { pentaryn: { slug, contentHash: hash } },
  items: [{ name: "ZZ Bite", type: "weapon", flags: { pentaryn: { action: "bite" } } }]
});
const manifest = {
  $contract: flags.contract, targetSystem: game.system.id, targetSystemVersion: sysMinor,
  generation: game.release.generation, generator: "zz-live-goldens", generatorVersion: "0",
  generatedAt: "2026-01-01T00:00:00Z", sourceRevision: "zz", skipped: [],
  actors: [
    entry("zz-golden-new", "ZZ Golden New", "sha256:new"),
    entry("zz-golden-changed", "ZZ Golden Changed", "sha256:changed-v2"),
    entry("zz-golden-same", "ZZ Golden Same", "sha256:same")
  ]
};
const realFetch = globalThis.fetch;
const scratch = [];
try {
  // One at a time: a batch create comes back in no fixed order on Foundry 14 (as 3e170743).
  for (const data of [
    { name: "ZZ Golden Changed", type: "npc", flags: { pentaryn: { slug: "zz-golden-changed", contentHash: "sha256:changed-v1" } } },
    { name: "ZZ Golden Same", type: "npc", flags: { pentaryn: { slug: "zz-golden-same", contentHash: "sha256:same" } } }
  ]) scratch.push(await Actor.create(data));
  scratch.forEach((a, i) => tag(a.id, `zzActor${i + 1}`));
  out.golden.scratchFlagsStored = scratch.map(a => foundry.utils.getProperty(a, "flags.pentaryn.slug") ?? null);
  globalThis.fetch = async (input, init) => {
    const u = typeof input === "string" ? input : input?.url;
    if (u === URL_) return new Response(JSON.stringify(manifest), { status: 200, headers: { "Content-Type": "application/json" } });
    return realFetch(input, init);
  };
  const r = await P.import({ dryRun: true, path: PATH });
  out.golden.dryRunSynthetic = norm(r);
  out.golden.dryRunSyntheticOnly = norm(await P.import({ dryRun: true, path: PATH, only: ["zz-golden-same"] }));
  out.golden.dryRunSyntheticForce = norm(await P.import({ dryRun: true, path: PATH, force: true }));
  out.timings.dryRunSynthetic3 = await timeIt(() => P.import({ dryRun: true, path: PATH }));
  out.golden.wroteNothing = {
    newActorExists: !!game.actors.find(a => foundry.utils.getProperty(a, "flags.pentaryn.slug") === "zz-golden-new"),
    changedHashStill: foundry.utils.getProperty(scratch[0], "flags.pentaryn.contentHash")
  };
} catch (e) {
  out.golden.dryRunSynthetic = caught(e);
} finally {
  globalThis.fetch = realFetch;
  const left = scratch.filter(a => game.actors.get(a.id)).map(a => a.id);
  if (left.length) await safely("actors", () => Actor.deleteDocuments(left));
  Object.assign(out.cleanup, { zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ Golden")).length, fetchRestored: globalThis.fetch === realFetch });
}
out.timings.rootKeys = await timeIt(() => Object.keys(game.pentaryn).sort(), 9, 1000);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
