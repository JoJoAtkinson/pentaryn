// Live golden — pentaryn-transform (`game.pentaryn.transform`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab (W4-T1: the automatic endings run in every tab of the runner), no player connected. Returns a
// JSON string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.3.3 code ("before") and the wave-4 code ("after",
//     the wildshape / starry / sweep adapters and argon-kit) both have, called with Documents (the
//     legacy convention): on a ZZ druid npc with a Wild Shape transform activity whose one profile
//     is a ZZ beast, forms(), wildShapeActivity(), original() and isRevertItem(); every refusal of
//     shift() that happens before a use is spent — an unknown profile, an actor with no Wild Shape,
//     and the known form while the druid has no token (`noToken`) — with its toast and the Wild Shape
//     uses unchanged; revert() of an actor that is not transformed (the info toast). A difference is
//     a regression until explained.
//   - `golden.declared`: T-D1 + W2-K1 (kit surface, `module.api`, frozen, contract, describe rows),
//     the 0.4.0 rows that only the after side has (inspect, selftest), and `starry.*` on the API
//     (before: absent; after: active / constellation answer null for the druid), plus the legacy
//     rows given a name instead of a Document.
// Never: a real shift or revert (a form actor, a token swap and chat lines; live checks 2–6, 8 and
// 10 in the wave-4 live plan), sweepSpentForms (it deletes every spent form in the world), the
// starry assume / end writes. The druid and the beast are deleted at the end.
// Wave 4 live plan: context/plans/addon-blueprint-2026-10/wave-4-live-plan.md.

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
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-transform";
const LEGACY = ["shift", "revert", "forms", "wildShapeActivity", "original", "isRevertItem", "sweepSpentForms"];
const ADDED = ["inspect", "selftest", "starry", "describe", "settings", "trace", "uninstall"];

const out = { module: "transform", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const T = game.pentaryn?.transform;
const mod = game.modules.get(MOD);
const formsInWorld = () => game.actors.filter(a => a.getFlag?.("dnd5e", "originalActor")).length;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: T?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name), formActors: formsInWorld()
};
const S = out.golden.shared, D = out.golden.declared;

// toasts, through a pass-through spy removed in `finally`
const toasts = [];
const notes = ui.notifications;
const spied = {};
for (const lvl of ["info", "warn", "error"]) {
  spied[lvl] = { fn: notes[lvl], own: Object.hasOwn(notes, lvl) };
  notes[lvl] = function (message, options) { toasts.push(`${lvl}: ${options?.localize ? game.i18n.localize(message) : message}`); return spied[lvl].fn.call(this, message, options); };
}
const takeToasts = () => toasts.splice(0);
const formOut = list => Array.isArray(list) ? list.map(f => ({ id: f.id, name: f.name, uuid: f.uuid, actor: f.actor?.name ?? null })) : list;
const activityOut = a => (a && !a.threw) ? { id: a.id, type: a.type, preset: a.transform?.preset ?? null, item: a.item?.name ?? null,
  profiles: (a.profiles ?? []).map(p => p._id), available: (a.availableProfiles ?? []).map(p => p._id) } : (a ?? null);
const docName = d => (d && !d.threw) ? (d.documentName ? `${d.documentName}:${d.name}` : d) : (d ?? null);
const usesOf = item => { const u = item?.system?.uses; return u ? { max: u.max ?? null, spent: u.spent ?? 0, value: u.value ?? null } : null; };

let druid = null, beast = null, bystander = null;
try {
  if (!T) throw new Error("game.pentaryn.transform is missing");

  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof T[k]]));
  let described = "absent";
  if (typeof T.describe === "function") {
    const d = T.describe();
    described = { namespace: d.namespace, contract: d.contract, paths: (d.methods ?? []).map(m => m.path).sort(), hooks: (d.hooks ?? []).length, patches: (d.patches ?? []).map(p => p.adjustments ?? p.label) };
  }
  D.surface = {
    keys: keysOf(T), moduleApi: mod?.api === T ? "same" : typeof mod?.api, frozen: Object.isFrozen(T),
    rootFrozen: Object.isFrozen(game.pentaryn), contract: T.contract ?? null, describe: described,
    added: Object.fromEntries(ADDED.map(k => [k, typeof T[k]])), starryKeys: keysOf(T.starry)
  };

  // ── the scratch beast and druid (one create per document: Foundry 14 batch order) ─
  beast = await Actor.create({ name: "ZZ Golden Wolf", type: "npc", system: { details: { cr: 0.25, type: { value: "beast" } }, traits: { size: "med" } } });
  tag(beast.id, "beast");
  druid = await Actor.create({ name: "ZZ Golden Druid", type: "npc", system: { details: { cr: 2 }, attributes: { hp: { value: 20, max: 20 } } } });
  tag(druid.id, "druid");
  bystander = await Actor.create({ name: "ZZ Golden Bystander", type: "npc" });
  tag(bystander.id, "bystander");
  const actId = foundry.utils.randomID(), profileId = foundry.utils.randomID();
  tag(actId, "wildShapeActivity"); tag(profileId, "wolfProfile");
  const [ws] = await druid.createEmbeddedDocuments("Item", [{ name: "Wild Shape", type: "feat", img: "icons/svg/pawprint.svg",
    system: { type: { value: "class" }, identifier: "wild-shape", uses: { max: "2", spent: 0, recovery: [{ period: "sr", type: "recoverAll" }] },
      activities: { [actId]: { _id: actId, type: "transform", name: "", activation: { type: "bonus", value: 1 },
        consumption: { targets: [{ type: "itemUses", target: "", value: "1" }] },
        transform: { preset: "wildshape" },
        profiles: [{ _id: profileId, name: "", uuid: beast.uuid, cr: "", level: { min: null, max: null }, sizes: [], types: [], movement: [] }] } } } }]);
  tag(ws.id, "wildShapeItem");
  const [ret] = await druid.createEmbeddedDocuments("Item", [{ name: "ZZ Return", type: "feat", flags: { [MOD]: { revert: true } } }]);
  tag(ret.id, "revertItem");
  const [plainFeat] = await druid.createEmbeddedDocuments("Item", [{ name: "ZZ Plain Feat", type: "feat" }]);
  tag(plainFeat.id, "plainFeat");
  S.created = { items: druid.items.map(i => i.name).sort(), uses: usesOf(druid.items.get(ws.id)), toasts: takeToasts() };

  // ── lookups ──────────────────────────────────────────────────────────────────
  S.forms = formOut(await probe(() => T.forms(druid)));
  S.formsBystander = formOut(await probe(() => T.forms(bystander)));
  S.wildShapeActivity = activityOut(await probe(() => T.wildShapeActivity(druid)));
  S.wildShapeActivityNone = activityOut(await probe(() => T.wildShapeActivity(bystander)));
  S.original = { druid: docName(await probe(() => T.original(druid))), null: docName(await probe(() => T.original(null))) };
  S.isRevertItem = {
    flagged: await probe(() => T.isRevertItem(druid.items.get(ret.id))),
    plain: await probe(() => T.isRevertItem(druid.items.get(plainFeat.id))),
    null: await probe(() => T.isRevertItem(null))
  };

  // ── refusals before any use is spent ─────────────────────────────────────────
  takeToasts();
  S.shiftUnknownProfile = { result: docName(await probe(() => T.shift(druid, "zzNoSuchProfile0"))), toasts: takeToasts() };
  S.shiftNoWildShape = { result: docName(await probe(() => T.shift(bystander, profileId))), toasts: takeToasts() };
  S.shiftNoToken = { result: docName(await probe(() => T.shift(druid, profileId))), toasts: takeToasts() };
  S.shiftNull = { result: docName(await probe(() => T.shift(null, profileId))), toasts: takeToasts() };
  S.revertNotTransformed = { result: docName(await probe(() => T.revert(druid))), toasts: takeToasts() };
  S.revertQuiet = { result: docName(await probe(() => T.revert(druid, { quiet: true }))), toasts: takeToasts() };
  await sleep(150);
  S.afterRefusals = { uses: usesOf(druid.items.get(ws.id)), polymorphed: !!druid.isPolymorphed, formActors: formsInWorld() - out.env.formActors,
    zzMessages: game.messages.filter(m => (m.speaker?.alias ?? "").startsWith("ZZ ")).length };

  // ── declared: refs, starry on the API, the after-only rows ───────────────────
  D.refs = {
    formsByName: formOut(await probe(() => T.forms(druid.name))),
    originalByName: docName(await probe(() => T.original(druid.name)))
  };
  D.starry = T.starry ? {
    active: docName(await probe(() => T.starry.active(druid))),
    constellation: await probe(() => T.starry.constellation(druid)) ?? "null"
  } : "absent";
  D.inspect = typeof T.inspect === "function" ? await probe(() => T.inspect(druid)) : "absent";
  D.inspectMiss = typeof T.inspect === "function" ? await probe(() => T.inspect("ZZ no such transform actor zzz")) : "absent";
  D.selftest = typeof T.selftest === "function" ? await probe(() => T.selftest()) : "absent";
  D.toasts = takeToasts();

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.forms = await timeIt(() => T.forms(druid), 9, 200);
  out.timings.wildShapeActivity = await timeIt(() => T.wildShapeActivity(druid), 9, 500);
  out.timings.original = await timeIt(() => T.original(druid), 9, 1000);
  out.timings.isRevertItem = await timeIt(() => T.isRevertItem(ret), 9, 1000);
} catch (e) {
  S.error = caught(e);
} finally {
  for (const [lvl, s] of Object.entries(spied)) { if (s.own) notes[lvl] = s.fn; else delete notes[lvl]; }
  const actorIds = [druid, beast, bystander].filter(a => a && game.actors.get(a.id)).map(a => a.id);
  if (actorIds.length) await safely("actors", () => Actor.deleteDocuments(actorIds));
  await sleep(100);
  Object.assign(out.cleanup, {
    toastsRestored: ["info", "warn", "error"].every(l => ui.notifications[l] === spied[l].fn),
    zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length,
    zzMessagesLeft: game.messages.filter(m => (m.speaker?.alias ?? "").startsWith("ZZ ")).length,
    formActorsLeft: Math.max(0, formsInWorld() - out.env.formActors)
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
