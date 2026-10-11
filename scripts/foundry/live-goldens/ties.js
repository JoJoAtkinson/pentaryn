// Live golden — pentaryn-ties. Body of an async function for the foundry `eval-js` MCP tool
// (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON string of
// { module, golden, timings, cleanup }: `golden` is deterministic (ids normalised, timestamps
// dropped), `timings` are medians of N runs (performance.now) — the performance baseline.
//
// What it exercises (the real glue, no stubs):
//   - the published surface: top-level keys and every member of known / study / attributes,
//     plus whether D1's new names (attributes.lookup, study.examine) exist yet;
//   - a lookup of a KNOWN attribute on a ZZ npc: the first registry entry by id (deterministic),
//     linked to the scratch actor with attributes.link (writes only that actor's flags), then
//     resolve (by id and by title), describe (today's name for D1's lookup), of() and ids();
//     plus the hostile reads describe("zz-no-such-attribute") and resolve(null).
// The registry is read, never written. The ZZ actor is deleted at the end.

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
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Live only: poll until pred() holds or ms passes. */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const out = { module: "ties", golden: {}, timings: {}, cleanup: {} };
const T = game.pentaryn.ties;
const keysOf = o => Object.keys(o ?? {}).sort();
let actor = null;
try {
  out.golden.surface = {
    top: keysOf(T),
    known: keysOf(T.known),
    study: keysOf(T.study),
    studyAudit: keysOf(T.study?.audit),
    attributes: keysOf(T.attributes),
    d1: {
      "attributes.lookup": typeof T.attributes?.lookup,
      "attributes.describe": typeof T.attributes?.describe,
      "study.examine": typeof T.study?.examine,
      "study.inspect": typeof T.study?.inspect,
      "describe (top, the card toggle)": typeof T.describe
    },
    moduleApi: typeof game.modules.get("pentaryn-ties")?.api,
    frozen: Object.isFrozen(T)
  };

  const reg = T.attributes.list();
  const entry = [...reg].sort((a, b) => a.id.localeCompare(b.id))[0];
  out.golden.registry = { count: reg.length, picked: entry ? { id: entry.id, title: entry.title, category: entry.category, parent: entry.parent ?? null } : null };

  actor = await Actor.create({ name: "ZZ Golden Ties Subject", type: "npc", system: { traits: { size: "med" }, details: { type: { value: "humanoid" } } } });
  tag(actor.id, "actor");
  const pick = r => r && ({ id: r.id, title: r.title, category: r.category, derived: r.derived, authored: r.authored, loreCount: r.loreCount, keys: Object.keys(r).sort() });

  out.golden.beforeLink = { ids: T.attributes.ids(actor), derived: T.attributes.derived(actor), of: T.attributes.of(actor).map(pick) };
  const link = await T.attributes.link(actor, entry.title);
  out.golden.link = link;
  out.golden.lookup = {
    resolveById: T.attributes.resolve(entry.id),
    resolveByTitle: T.attributes.resolve(entry.title),
    resolveLower: T.attributes.resolve(entry.title.toLowerCase()),
    resolveNull: T.attributes.resolve(null),
    describe: pick(T.attributes.describe(entry.id)),
    describeByTitle: pick(T.attributes.describe(entry.title)),
    describeMissing: T.attributes.describe("zz-no-such-attribute"),
    describeDerived: pick(T.attributes.describe("size:med")),
    ids: T.attributes.ids(actor),
    of: T.attributes.of(actor).map(pick),
    flag: actor.getFlag("pentaryn-ties", "attributes") ?? null
  };

  out.timings.resolve = await timeIt(() => T.attributes.resolve(entry.title), 9, 200);
  out.timings.describe = await timeIt(() => T.attributes.describe(entry.id), 9, 200);
  out.timings.of = await timeIt(() => T.attributes.of(actor), 9, 100);
  out.timings.ids = await timeIt(() => T.attributes.ids(actor), 9, 100);
  out.timings.list = await timeIt(() => T.attributes.list(), 9, 200);
} catch (e) {
  out.golden.error = caught(e);
} finally {
  if (actor && game.actors.get(actor.id)) await actor.delete();
  out.cleanup = { zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
