// Live golden — pentaryn-dropbin (`game.pentaryn.dropbin`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab, no player connected (a player's drop during the run would land between the save and the
// put-back below; the run then refuses to put the ledger back and says so). Returns a JSON string
// of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed code ("before": 0.2.1 on main, or 0.2.2 if the
//     play-test fix was deployed) and the wave-2 code ("after") both have: the ledger reads
//     (all/list/get/search) on the real ledger, the delete capture (an item deleted off a ZZ
//     *character* becomes one "delete" entry with the full item source), restore(n) onto the ZZ
//     actor (no new entry), the refusals (unknown entry, unknown actor), and the corpse/loot
//     helpers that are pure reads (isDead, recipientFor as the GM).
//   - `golden.declared`: D-D1 (kit surface, `module.api`, frozen), `list(n, {brief})`,
//     restoreResult, inspect, selftest (items-journal-28), the GM ready line's ledger size.
// The ledger is a world setting with no per-entry delete. This run SAVES the `log` and `counter`
// settings first and, once its own entry is in, PUTS THEM BACK exactly (only when the ledger grew
// by exactly the run's one entry), then rewrites the JSON mirror with export(). It waits 2.5 s
// after the capture first, so the wave-2 build's trailing mirror write (items-journal-19) has
// fired before the put-back. The ZZ actor is deleted at the end.
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
const DROP = new Set(["t", "at", "age", "ms", "_stats", "iso"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
/** Cleanup: run one step; a failure becomes a `NOT ` string diff.mjs fails on, and the next step still runs (LG-R8). */
const safely = async (name, fn) => { try { await fn(); } catch (e) { out.cleanup[`${name}CleanupError`] = `NOT done: ${e?.message ?? e}`; } };
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();
const fnv = s => { let h = 0x811c9dc5; s = String(s ?? ""); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };
/** Live only: poll until pred() holds or ms passes (the capture hook does not await the write). */
const settle = async (pred, ms = 4000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const MOD = "pentaryn-dropbin";
const out = { module: "dropbin", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const B = game.pentaryn?.dropbin;
const mod = game.modules.get(MOD);
const classType = game.itempiles?.API?.ACTOR_CLASS_TYPE ?? null;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: B?.version ?? null,
  itemPiles: !!game.modules.get("item-piles")?.active, socketlib: !!game.modules.get("socketlib")?.active,
  actorClassType: classType, playersOnline: game.users.filter(u => !u.isGM && u.active).map(u => u.name)
};
const S = out.golden.shared, D = out.golden.declared;

const toasts = [];
const notes = ui.notifications;
const spied = {};
for (const lvl of ["info", "warn", "error"]) {
  spied[lvl] = { fn: notes[lvl], own: Object.hasOwn(notes, lvl) };
  notes[lvl] = function (message, options) { toasts.push(`${lvl}: ${message}`); return spied[lvl].fn.call(this, message, options); };
}
const takeToasts = () => toasts.splice(0);

/** An entry without its bulky item source (the source is compared by hash). */
const entryOut = e => (e && typeof e === "object" && !e.threw) ? {
  ...e, item: e.item ? { name: e.item.name, type: e.item.type, keys: keysOf(e.item), fnv: fnv(JSON.stringify({ ...e.item, _stats: undefined, _id: undefined })) } : e.item
} : e ?? null;
const readLog = () => { const v = game.settings.get(MOD, "log"); return Array.isArray(v) ? v : []; };

const saved = {};
let actor = null, putBack = "not attempted";
try {
  if (!B) throw new Error("game.pentaryn.dropbin is missing");
  saved.log = foundry.utils.deepClone(readLog());
  saved.counter = game.settings.get(MOD, "counter");
  const lastN = saved.log.at(-1)?.n ?? null;

  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["all", "list", "get", "search", "restore", "export", "clear", "corpses", "loot"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof B[k]]));
  S.corpsesSurface = keysOf(B.corpses).map(k => [k, typeof B.corpses[k]]);
  S.lootSurface = keysOf(B.loot).map(k => [k, typeof B.loot[k]]);
  D.surface = { keys: keysOf(B), moduleApi: typeof mod?.api, frozen: Object.isFrozen(B), contract: B.contract ?? null };

  // ── reads on the real ledger (no write) ──────────────────────────────────────
  S.ledger = {
    size: saved.log.length, counter: saved.counter, allSize: (await probe(() => B.all()))?.length ?? null,
    list3: (await probe(() => B.list(3)))?.map?.(entryOut) ?? null,
    listDefaultSize: (await probe(() => B.list()))?.length ?? null,
    getLast: lastN != null ? entryOut(await probe(() => B.get(lastN))) : "empty ledger",
    getLastAsString: lastN != null ? (await probe(() => B.get(String(lastN))))?.n ?? null : "empty ledger",
    getMissing: await probe(() => B.get(-1)),
    searchNone: await probe(() => B.search("zz-no-such-item-xq")),
    searchA: (await probe(() => B.search("a")))?.length ?? null
  };
  D.listBrief = await probe(() => (B.list(3, { brief: true }) ?? []).map(e => keysOf(e)));

  // ── pure corpse / loot reads ─────────────────────────────────────────────────
  const hp = (value, max) => ({ system: { attributes: { hp: { value, max } } }, statuses: new Set() });
  S.isDead = [hp(0, 10), hp(5, 10), hp(0, 0), hp(-3, 10), { system: {}, statuses: new Set(["dead"]) }, null]
    .map(a => { try { return String(B.corpses.isDead(a)); } catch (e) { return caught(e); } });
  S.recipientForGM = await probe(() => B.loot.recipientFor(null)?.id ?? null);

  // ── the delete capture, on a ZZ character ────────────────────────────────────
  actor = await Actor.create({ name: "ZZ Golden Dropbin Hero", type: "character" });
  tag(actor.id, "actor"); tag(actor.uuid, "actorUuid");
  const [item] = await actor.createEmbeddedDocuments("Item", [{ name: "ZZ Golden Dropbin Lantern", type: "loot", system: { quantity: 2, description: { value: "<p>golden</p>" } } }]);
  tag(item.id, "item");
  takeToasts();
  const t0 = performance.now();
  await item.delete();
  const captured = await settle(() => readLog().length > saved.log.length);
  out.timings.captureRoundTrip = { ms: Math.round((performance.now() - t0) * 10) / 10, captured };
  await sleep(2500); // the wave-2 mirror is written ~2 s after the last entry (items-journal-19)
  const grown = readLog();
  const mine = grown.slice(saved.log.length);
  const n = mine[0]?.n ?? null;
  // this run's ledger number differs run to run: shown as "<n>" (a number is never id-tagged)
  const relN = e => (e && typeof e === "object" && e.n === n) ? { ...e, n: "<n>" } : e;
  S.capture = {
    captured, entries: mine.length,
    entry: entryOut(relN(mine[0])), counterAfter: game.settings.get(MOD, "counter") - (saved.counter ?? 0),
    list1: (await probe(() => B.list(1)))?.map?.(e => entryOut(relN(e))) ?? null,
    get: n != null ? entryOut(relN(await probe(() => B.get(n)))) : null,
    search: (await probe(() => B.search("golden dropbin lantern")))?.map?.(e => relN(e).n) ?? null,
    toasts: takeToasts()
  };

  // ── restore(n) onto the ZZ actor: a new item, no new entry ───────────────────
  if (n != null) {
    const made = await probe(() => B.restore(n));
    await sleep(200);
    S.restore = {
      returned: made?.documentName ?? (made?.threw ? made : typeof made), name: made?.name ?? null,
      onActor: actor.items.map(i => ({ name: i.name, qty: i.system?.quantity ?? null })),
      ledgerGrew: readLog().length - grown.length, toasts: takeToasts()
    };
    // an unknown target name falls back to the actor the entry left (both builds): a second copy
    S.restoreUnknownTarget = await probe(async () => {
      const r = await B.restore(n, "zz-no-such-actor-xq");
      return { returned: r?.documentName ?? typeof r, onActor: actor.items.size, toasts: takeToasts() };
    });
  }
  S.restoreMissing = await probe(async () => {
    const r = await B.restore(999999999);
    return { returned: r?.documentName ?? typeof r, toasts: takeToasts() };
  });

  // ── declared ─────────────────────────────────────────────────────────────────
  D.restoreResult = typeof B.restoreResult === "function"
    ? { missing: await probe(() => B.restoreResult(999999999)), unknownTarget: n != null ? await probe(async () => { const r = await B.restoreResult(n, "zz-no-such-actor-xq"); return { ok: r.ok, reason: r.reason ?? null }; }) : null }
    : "absent";
  D.inspect = typeof B.inspect === "function" ? await probe(() => { const r = B.inspect(actor); return r && typeof r === "object" ? keysOf(r) : r; }) : "absent";
  D.selftest = typeof B.selftest === "function" ? await probe(async () => { const r = await B.selftest(); return { ok: r?.ok, failed: (r?.checks ?? []).filter(c => !c.ok).map(c => c.label) }; }) : "absent";

  // ── timings (reads only) ─────────────────────────────────────────────────────
  out.timings.all = await timeIt(() => B.all(), 9, 200);
  out.timings.list20 = await timeIt(() => B.list(20), 9, 200);
  out.timings.get = n != null ? await timeIt(() => B.get(n), 9, 200) : null;
  out.timings.search = await timeIt(() => B.search("a"), 9, 50);
  out.timings.isDead = await timeIt(() => B.corpses.isDead(actor), 9, 1000);
} catch (e) {
  S.error = caught(e);
} finally {
  // put the ledger back: only if it grew by exactly this run's own entries
  if ("log" in saved) {
    const now = readLog();
    const extra = now.slice(saved.log.length);
    const prefixSame = JSON.stringify(now.slice(0, saved.log.length).map(e => e.n)) === JSON.stringify(saved.log.map(e => e.n));
    if (!extra.length) putBack = "nothing to put back";
    else if (prefixSame && extra.every(e => (e.itemName ?? "").startsWith("ZZ ") && e.fromActorId === actor?.id)) {
      await safely("ledgerLog", () => game.settings.set(MOD, "log", saved.log));
      await safely("ledgerCounter", () => game.settings.set(MOD, "counter", saved.counter));
      let mirrored = false;
      await safely("mirror", async () => { mirrored = await B?.export?.(); });
      putBack = mirrored ? "restored, mirror rewritten" : "restored, mirror NOT rewritten (run export() by hand)";
    } else putBack = `REFUSED: the ledger holds ${extra.length} entr(ies) that are not this run's alone — review by hand`;
  }
  for (const [lvl, s] of Object.entries(spied)) { if (s.own) notes[lvl] = s.fn; else delete notes[lvl]; }
  if (actor && game.actors.get(actor.id)) await safely("actor", () => actor.delete());
  Object.assign(out.cleanup, {
    ledger: putBack,
    ledgerSizeNow: readLog().length, ledgerSizeBefore: saved.log?.length ?? null,
    counterNow: game.settings.get(MOD, "counter"), counterBefore: saved.counter ?? null,
    toastsRestored: ["info", "warn", "error"].every(l => ui.notifications[l] === spied[l].fn),
    zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
