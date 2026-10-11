// Live golden — pentaryn-lookup (`game.pentaryn.rules`). Body of an async function for the foundry
// `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only. Returns a JSON
// string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared` is the public behaviour the deployed 0.3.0 code ("before") and the wave-2
//     code ("after") both have; a difference there is a regression until explained.
//   - `golden.declared` holds the probes the wave changed on purpose, each keyed by its id
//     (DL1 frozen LIMITS copy, DL4 JournalEntry-uuid warning, the names("constructor") fix
//     055586bb, the kit surface). They are expected to differ.
//   - `timings` are medians of N runs (performance.now). DL5 (books cached per session) makes the
//     "after" warm search much faster; the first-call number is only "first in this script".
// Read-only: no document is created, so there is nothing to clean up. Long texts are clipped to
// { head, len, fnv } so the whole page/feature text is still compared by its hash.
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
const DROP = new Set(["t", "at", "age", "ms", "_stats"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
const fnv = s => { let h = 0x811c9dc5; s = String(s ?? ""); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
/** A long string as { head, len, fnv }: small output, full-text equality still checked. */
const clip = (s, n = 160) => (typeof s === "string" && s.length > n) ? { head: s.slice(0, n), len: s.length, fnv: fnv(s) } : s;
/** Run a probe; a throw becomes a value so one bad probe does not hide the rest. */
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();

const out = { module: "lookup", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const R = game.pentaryn?.rules;
const mod = game.modules.get("pentaryn-lookup");
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active,
  apiVersion: R?.version ?? null, describeVersion: typeof R?.describe === "function" ? (await probe(() => R.describe().version)) : null
};
const S = out.golden.shared, D = out.golden.declared;
if (!R) {
  S.error = "game.pentaryn.rules is missing";
} else {
  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["LIMITS", "monster", "monsters", "names", "onList", "packs", "page", "search", "selftest", "spellList", "toPlainText"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof R[k]]));
  S.limits = { ...R.LIMITS };
  D.surface = { keys: keysOf(R), moduleApi: typeof mod?.api, contract: R.contract ?? null };
  D.DL1 = { apiFrozen: Object.isFrozen(R), limitsFrozen: Object.isFrozen(R.LIMITS) };

  // ── packs and search ─────────────────────────────────────────────────────────
  S.packs = await probe(() => R.packs());
  const clipHits = r => (r && Array.isArray(r.hits)) ? { ...r, hits: r.hits.map(h => ({ ...h, snippet: clip(h.snippet) })) } : r;
  const half = await probe(() => R.search("half cover"));
  S.search = {
    halfCover: clipHits(half),
    grappleAll: clipHits(await probe(() => R.search("grapple", { books: "all", limit: 3, snippet: 120 }))),
    regex: clipHits(await probe(() => R.search("cover|grapple", { regex: true, limit: 3 }))),
    monstersBooks: clipHits(await probe(() => R.search("legendary resistance", { books: "monsters", limit: 2 }))),
    nothing: await probe(() => R.search("zz-no-such-phrase-xq"))
  };

  // ── page ─────────────────────────────────────────────────────────────────────
  const pageOut = p => (p && typeof p === "object") ? {
    ...p, text: clip(p.text), raw: clip(p.raw),
    tables: Array.isArray(p.tables) ? p.tables.map(t => ({ name: t.name ?? null, formula: t.formula ?? null, uuid: t.uuid, rows: Array.isArray(t.rows) ? t.rows.length : null, error: t.error ?? null })) : p.tables
  } : p;
  const hitUuid = half?.hits?.[0]?.uuid ?? null;
  S.page = {
    byHitUuid: hitUuid ? pageOut(await probe(() => R.page(hitUuid, { maxChars: 400 }))) : "no hit",
    byHitUuidOffset: hitUuid ? pageOut(await probe(() => R.page(hitUuid, { maxChars: 200, offset: 200 }))) : "no hit",
    byName: pageOut(await probe(() => R.page("Study", { maxChars: 300 }))),
    raw: pageOut(await probe(() => R.page("Study", { raw: true }))),
    artifacts: pageOut(await probe(() => R.page("Artifacts", { books: ["dnd-dungeon-masters-guide.content"], maxChars: 200 }))),
    notFound: pageOut(await probe(() => R.page("zz no such page xq"))),
    empty: await probe(() => R.page("")),
    badUuid: await probe(() => R.page("Compendium.zz-no-such.pack.JournalEntryPage.zzzzzzzzzzzzzzzz"))
  };
  // DL4: a JournalEntry uuid (not a page) gains `warning`; text/uuid/journal unchanged
  const entryUuid = hitUuid?.includes(".JournalEntryPage.") ? hitUuid.slice(0, hitUuid.indexOf(".JournalEntryPage.")) : null;
  const entryPage = entryUuid ? await probe(() => R.page(entryUuid, { maxChars: 100 })) : null;
  S.pageOfEntry = entryPage && typeof entryPage === "object"
    ? { text: clip(entryPage.text), uuid: entryPage.uuid ?? null, journal: entryPage.journal ?? null, error: entryPage.error ?? null } : entryPage;
  D.DL4 = { warning: entryPage?.warning ?? null, keys: keysOf(entryPage) };

  // ── monsters ─────────────────────────────────────────────────────────────────
  const monsterOut = m => (m && Array.isArray(m.features)) ? { ...m, features: m.features.map(f => ({ ...f, text: clip(f.text) })) } : m;
  S.monster = {
    goblin: monsterOut(await probe(() => R.monster("Goblin"))),
    goblinBossText: monsterOut(await probe(() => R.monster("Goblin Boss", { text: true }))),
    notFound: await probe(() => R.monster("zz no such monster xq")),
    empty: await probe(() => R.monster(""))
  };
  S.monsters = {
    constructs: await probe(() => R.monsters({ size: "large", type: "construct", cr: "5-8" })),
    goblinName: await probe(() => R.monsters({ name: "goblin", limit: 3 })),
    crRange: await probe(() => R.monsters({ minCr: 20, maxCr: 30, limit: 5 })),
    none: await probe(() => R.monsters({ type: "zz-no-such-type" }))
  };

  // ── names and spell lists ────────────────────────────────────────────────────
  const namesAll = await probe(() => R.names());
  S.names = {
    all: namesAll?.classes ? {
      classes: namesAll.classes, species: namesAll.species.length, speciesHead: namesAll.species.slice(0, 5),
      backgrounds: namesAll.backgrounds.length, subclassKeys: keysOf(namesAll.subclasses),
      featKeys: keysOf(namesAll.feats), featCounts: Object.fromEntries(keysOf(namesAll.feats).map(k => [k, namesAll.feats[k].length])),
      fnv: fnv(JSON.stringify(namesAll))
    } : namesAll,
    subclass: await probe(async () => { const r = await R.names("subclass"); return { keys: keysOf(r), fnv: fnv(JSON.stringify(r)) }; }),
    race: await probe(async () => { const r = await R.names("race"); return { keys: keysOf(r), count: r.species?.length ?? null }; }),
    unknownKind: await probe(async () => { const r = await R.names("zz-kind"); return { keys: keysOf(r) }; })
  };
  // 055586bb [declared]: names("constructor") was a junk one-key object; now it answers everything
  D.namesConstructor = await probe(async () => { const r = await R.names("constructor"); return { keys: keysOf(r) }; });

  S.onList = {
    fireballWizard: await probe(() => R.onList("Fireball", "wizard")),
    fireballCleric: await probe(() => R.onList("Fireball", "cleric")),
    noSuchList: await probe(() => R.onList("Fireball", "zz-no-such-class")),
    noSuchSpell: await probe(() => R.onList("Zz No Such Spell", "wizard"))
  };
  S.spellList = {
    wizard3: await probe(async () => { const r = await R.spellList("wizard", { level: 3 }); return r?.spells ? { list: r.list, count: r.count, head: r.spells.slice(0, 5), fnv: fnv(JSON.stringify(r.spells)) } : r; }),
    cleric: await probe(async () => { const r = await R.spellList("cleric"); return r?.spells ? { count: r.count, fnv: fnv(JSON.stringify(r.spells)) } : r; }),
    noSuch: await probe(() => R.spellList("zz-no-such-class"))
  };
  S.toPlainText = [
    await probe(() => R.toPlainText("<p>Hello <strong>world</strong></p><p>Two</p>")),
    await probe(() => R.toPlainText("")),
    await probe(() => R.toPlainText("<p>@UUID[Compendium.x.y.Item.z]{Fireball} and [[/r 1d6]]</p>"))
  ];

  // ── selftest (the check list may grow; the verdict and the failures must not change) ──
  const st = await probe(() => R.selftest());
  S.selftest = st?.checks ? { ok: st.ok, failed: st.checks.filter(c => !c.ok).map(c => c.label) } : st;
  D.selftestLabels = st?.checks ? st.checks.map(c => c.label) : null;

  // ── timings ──────────────────────────────────────────────────────────────────
  const t0 = performance.now();
  await R.search("zz timing first call");
  out.timings.searchFirstCallInScript = { ms: Math.round((performance.now() - t0) * 1e4) / 1e4 };
  out.timings.searchHalfCover = await timeIt(() => R.search("half cover"), N);
  out.timings.searchAllBooks = await timeIt(() => R.search("grapple", { books: "all", limit: 3 }), N);
  if (hitUuid) out.timings.pageByUuid = await timeIt(() => R.page(hitUuid, { maxChars: 400 }), N);
  out.timings.pageByName = await timeIt(() => R.page("Study", { maxChars: 300 }), N);
  out.timings.monster = await timeIt(() => R.monster("Goblin"), N);
  out.timings.monsterText = await timeIt(() => R.monster("Goblin Boss", { text: true }), N);
  out.timings.monsters = await timeIt(() => R.monsters({ size: "large", type: "construct", cr: "5-8" }), N);
  out.timings.names = await timeIt(() => R.names(), N);
  out.timings.onList = await timeIt(() => R.onList("Fireball", "wizard"), N);
  out.timings.packs = await timeIt(() => R.packs(), N);
  out.timings.toPlainText = await timeIt(() => R.toPlainText("<p>Hello <strong>world</strong></p>"), 9, 1000);
}
out.cleanup = { wrote: "nothing" };
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
