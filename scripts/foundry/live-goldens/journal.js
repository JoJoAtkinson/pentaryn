// Live golden — pentaryn-journal (`game.pentaryn.journal`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab (W2-J4: a second GM tab doubles journal creation), no player connected. Returns a JSON
// string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.1.0 code ("before") and the wave-2 code ("after")
//     both have: report(), who gets the bar (shouldShowBar for the GM and for a real player,
//     read-only), add/status on a ZZ source journal through the GM's own journal (gmButton on),
//     the second add that changes nothing, an edited source reading "changed" and updating,
//     open(), ensure() refusing a GM and returning a player's existing journal.
//   - `golden.declared`: D-J1 (kit surface, `module.api`, frozen), the `core` key list, the new
//     reads (inspect/entriesOf/statusFor/lastReason, items-journal-35), D-J6 (inspect takes an
//     Actor). D-J3/-J4/-J5 are not reachable from one GM tab and are live checks, not goldens.
// Side effects, all undone in `finally`: the world setting gmButton is switched on and restored;
// the GM's personal journal gains pages (deleted), and is created first if the GM had none
// (then deleted, with the Player Journals folder if this run created it); the ZZ source
// journals are deleted; sheets this run opened are closed. A player's journal is only read:
// ensure() is called only for a player who already has one.
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
const DROP = new Set(["t", "at", "age", "ms", "_stats", "savedAt", "updatedAt", "worldTime"]);
const strip = v => Array.isArray(v) ? v.map(strip)
  : (v && typeof v === "object") ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, strip(x)]))
  : v;
const norm = v => { let s = JSON.stringify(strip(v) ?? null); for (const [id, l] of ids) s = s.split(id).join(`<${l}>`); return JSON.parse(s); };
const caught = e => ({ threw: true, name: e?.name ?? null, ctor: e?.constructor?.name ?? null, message: String(e?.message ?? e) });
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();
const fnv = s => { let h = 0x811c9dc5; s = String(s ?? ""); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, "0"); };
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-journal";
const OWN = CONST.DOCUMENT_OWNERSHIP_LEVELS;
const out = { module: "journal", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const J = game.pentaryn?.journal;
const mod = game.modules.get(MOD);
const player = game.users.find(u => !u.isGM) ?? null;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: J?.version ?? null,
  player: player?.name ?? null, playersOnline: game.users.filter(u => !u.isGM && u.active).map(u => u.name),
  gmTabsNote: "run with one GM tab (W2-J4)"
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

const saved = {};
let src = null, owned = null, gmJournal = null, createdGmJournal = false, createdFolder = null;
const pagesBefore = new Set();
const openedBefore = new Set([...foundry.applications.instances.values()].filter(a => a.rendered).map(a => a.id));
const pageRows = j => (j?.pages.contents ?? []).filter(p => !pagesBefore.has(p.id)).sort((a, b) => a.sort - b.sort).map(p => ({
  name: p.name, type: p.type, bodyFnv: fnv(p.text?.content ?? ""), bodyLen: (p.text?.content ?? "").length,
  source: p.flags?.[MOD]?.source ? keysOf(p.flags[MOD].source) : null, key: p.flags?.[MOD]?.source?.key ?? null
}));
const addOut = r => (r && typeof r === "object" && !r.threw) ? { journal: r.journal?.id ?? null, pageIds: r.pageIds, created: r.created, updated: r.updated } : r ?? null;
try {
  if (!J) throw new Error("game.pentaryn.journal is missing");
  saved.gmButton = game.settings.get(MOD, "gmButton");

  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["personal", "add", "status", "open", "shouldShowBar", "ensure", "ensureAll", "report", "core"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof J[k]]));
  S.coreShared = ["MOD", "MAX_BODY", "SORT_DENSITY", "escapeHTML", "fnv1a", "stripSecrets", "sanitize", "status", "validateEnsure", "hashOf", "findSaved", "planSave"]
    .map(k => [k, typeof J.core?.[k]]);
  D.surface = { keys: keysOf(J), coreKeys: keysOf(J.core), moduleApi: typeof mod?.api, frozen: Object.isFrozen(J), contract: J.contract ?? null };

  // ── the GM's journal and the folder, as found ────────────────────────────────
  gmJournal = J.personal();
  if (gmJournal) { tag(gmJournal.id, "gmJournal"); for (const p of gmJournal.pages) pagesBefore.add(p.id); }
  const rep0 = await probe(() => J.report());
  if (rep0?.folder) tag(rep0.folder, "folder");
  for (const u of rep0?.users ?? []) if (u.journalId) tag(u.journalId, `journal:${u.user}`);
  S.report = rep0;
  S.core = {
    escapeHTML: await probe(() => J.core.escapeHTML(`<b a="1">&'</b>`)),
    fnv1a: await probe(() => J.core.fnv1a("pentaryn")),
    sanitize: await probe(() => J.core.sanitize(`<p>ok</p><section class="secret"><p>gm</p></section><script>x()</script><p onclick="y()">z</p>`, { resolve: u => u, embeddedLabel: "embedded" })),
    validateEnsure: [await probe(() => J.core.validateEnsure(null, null)), await probe(() => J.core.validateEnsure({ id: "u1", isGM: true }, null)),
      await probe(() => J.core.validateEnsure({ id: "u1", isGM: false }, "j1")), await probe(() => J.core.validateEnsure({ id: "u1", isGM: false }, null))]
  };

  // ── ZZ sources ───────────────────────────────────────────────────────────────
  src = await JournalEntry.create({
    name: "ZZ Golden Journal Source", ownership: { default: OWN.OBSERVER },
    pages: [
      { name: "ZZ Page One", type: "text", text: { content: "<p>Golden one.</p>" }, sort: 100 },
      { name: "ZZ Page Two", type: "text", text: { content: `<p>Golden <strong>two</strong>.</p><section class="secret"><p>GM only</p></section>` }, sort: 200 }
    ]
  });
  owned = await JournalEntry.create({ name: "ZZ Golden Journal Owned", ownership: { default: OWN.OWNER }, pages: [{ name: "ZZ Owned", type: "text", text: { content: "<p>mine</p>" } }] });
  tag(src.id, "src"); tag(owned.id, "owned");
  const [p1, p2] = src.pages.contents.sort((a, b) => a.sort - b.sort);
  tag(p1.id, "srcPage1"); tag(p2.id, "srcPage2");

  // who gets the bar (read-only, for the GM and for a real player)
  S.bar = {
    gmButton: saved.gmButton,
    gmSrc: await probe(() => J.shouldShowBar(src)),
    playerSrc: player ? await probe(() => J.shouldShowBar(src, player)) : "no player",
    playerOwned: player ? await probe(() => J.shouldShowBar(owned, player)) : "no player",
    playerOwnJournal: player && J.personal(player) ? await probe(() => J.shouldShowBar(J.personal(player), player)) : "no player journal",
    none: await probe(() => J.shouldShowBar(null))
  };

  // gmButton off: nothing to add
  if (saved.gmButton) await game.settings.set(MOD, "gmButton", false);
  S.gmButtonOff = { add: addOut(await probe(() => J.add(src))), status: await probe(() => J.status(src)), toasts: takeToasts() };

  // gmButton on: the GM saves through their own journal
  await game.settings.set(MOD, "gmButton", true);
  const folderBefore = (await probe(() => J.report()))?.folder ?? null;
  S.statusBefore = { entry: await probe(() => J.status(src)), page: await probe(() => J.status(p1)) };
  const first = await probe(() => J.add(src));
  if (!gmJournal) {
    gmJournal = J.personal();
    if (gmJournal) { createdGmJournal = true; tag(gmJournal.id, "gmJournal"); }
  }
  const folderAfter = (await probe(() => J.report()))?.folder ?? null;
  if (!folderBefore && folderAfter) { createdFolder = folderAfter; tag(folderAfter, "folder"); }
  for (const id of first?.pageIds ?? []) tag(id, `saved:${gmJournal?.pages.get(id)?.name ?? id}`);
  await sleep(150);
  S.add = { result: addOut(first), journalCreated: createdGmJournal, pages: pageRows(gmJournal), toasts: takeToasts() };
  S.statusSaved = { entry: await probe(() => J.status(src)), page1: await probe(() => J.status(p1)), page2: await probe(() => J.status(p2)) };
  S.addAgain = { result: addOut(await probe(() => J.add(src))), pages: pageRows(gmJournal).length, toasts: takeToasts() };

  // the source changes: "changed", then an update
  await p1.update({ "text.content": "<p>Golden one, revised.</p>" });
  S.statusChanged = { entry: await probe(() => J.status(src)), page1: await probe(() => J.status(p1)), page2: await probe(() => J.status(p2)) };
  const upd = await probe(() => J.add(src));
  for (const id of upd?.pageIds ?? []) if (!ids.has(id)) tag(id, `saved:${gmJournal?.pages.get(id)?.name ?? id}`);
  await sleep(150);
  S.update = { result: addOut(upd), pages: pageRows(gmJournal), statusAfter: await probe(() => J.status(src)), toasts: takeToasts() };
  S.ownedSrc = { add: addOut(await probe(() => J.add(owned))), status: await probe(() => J.status(owned)) };

  // open(): the GM's journal on a page
  const firstSaved = (first?.pageIds ?? [])[0] ?? null;
  const sheet = await probe(() => J.open(firstSaved));
  S.open = { ctor: sheet?.constructor?.name ?? (sheet?.threw ? sheet : null), rendered: !!sheet?.rendered, document: sheet?.document?.id ?? null };

  // ensure(): a GM is refused; a player who has a journal gets it back
  S.ensureGM = await probe(async () => (await J.ensure(game.user))?.id ?? null);
  const pj = player ? J.personal(player) : null;
  S.ensurePlayer = pj ? await probe(async () => (await J.ensure(player))?.id ?? null) : "no player journal";
  S.reportAfter = await probe(() => J.report());

  // ── declared ─────────────────────────────────────────────────────────────────
  D.reads = {
    inspect: typeof J.inspect === "function" ? await probe(() => { const r = J.inspect(game.user); return r ? { keys: keysOf(r), entries: (r.entries ?? []).length } : r; }) : "absent",
    inspectActor: typeof J.inspect === "function" && player?.character ? await probe(() => { const r = J.inspect(player.character); return r ? { user: r.user ?? null } : r; }) : "absent",
    entriesOf: typeof J.entriesOf === "function" ? await probe(() => (J.entriesOf(game.user) ?? []).length) : "absent",
    statusFor: typeof J.statusFor === "function" ? await probe(() => J.statusFor(src)) : "absent",
    lastReason: typeof J.lastReason === "function" ? await probe(() => J.lastReason()) : "absent"
  };

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.shouldShowBar = await timeIt(() => J.shouldShowBar(src), 9, 500);
  if (player) out.timings.shouldShowBarPlayer = await timeIt(() => J.shouldShowBar(src, player), 9, 500);
  out.timings.status = await timeIt(() => J.status(src), 9, 50);
  out.timings.personal = await timeIt(() => J.personal(), 9, 500);
  out.timings.report = await timeIt(() => J.report(), 9, 50);
  out.timings.addNoChange = await timeIt(() => J.add(src), N);
} catch (e) {
  S.error = caught(e);
} finally {
  for (const [lvl, s] of Object.entries(spied)) { if (s.own) notes[lvl] = s.fn; else delete notes[lvl]; }
  if ("gmButton" in saved && game.settings.get(MOD, "gmButton") !== saved.gmButton) await game.settings.set(MOD, "gmButton", saved.gmButton);
  for (const app of [...foundry.applications.instances.values()]) {
    if (app.rendered && !openedBefore.has(app.id) && [src?.id, owned?.id, gmJournal?.id].includes(app.document?.id)) await app.close();
  }
  let pagesDeleted = 0;
  if (gmJournal && game.journal.get(gmJournal.id)) {
    if (createdGmJournal) await gmJournal.delete();
    else {
      const mine = gmJournal.pages.contents.filter(p => !pagesBefore.has(p.id)).map(p => p.id);
      if (mine.length) await gmJournal.deleteEmbeddedDocuments("JournalEntryPage", mine);
      pagesDeleted = mine.length;
    }
  }
  if (createdFolder && game.folders.get(createdFolder) && !game.folders.get(createdFolder).contents.length) await game.folders.get(createdFolder).delete();
  for (const j of [src, owned]) if (j && game.journal.get(j.id)) await j.delete();
  out.cleanup = {
    gmButtonRestored: "gmButton" in saved ? game.settings.get(MOD, "gmButton") === saved.gmButton : null,
    toastsRestored: ["info", "warn", "error"].every(l => ui.notifications[l] === spied[l].fn),
    gmJournal: createdGmJournal ? "created and deleted" : `kept, ${pagesDeleted} page(s) removed`,
    gmJournalPagesNow: gmJournal && game.journal.get(gmJournal.id) ? game.journal.get(gmJournal.id).pages.size : null,
    gmJournalPagesBefore: pagesBefore.size,
    folder: createdFolder ? (game.folders.get(createdFolder) ? "created, NOT deleted (not empty)" : "created and deleted") : "untouched",
    zzJournalsLeft: game.journal.filter(j => j.name.startsWith("ZZ ")).length
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
