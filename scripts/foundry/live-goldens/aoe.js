// Live golden — pentaryn-aoe (`game.pentaryn.aoe`). Body of an async function for the foundry
// `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM tab
// (a second GM tab doubles the handle create race the server settles, areas.mjs), no player
// connected, the world's "Area handle" actor present (else `skipped`). Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.3.1 code ("before") and the wave-4 code ("after")
//     both have: on a ZZ scratch scene, two spell-template regions (dnd5e 6 flags: activity + item)
//     and one plain region. The template regions get OWNER ownership and a handle token (the
//     handle's id is the region's id; the region attached to it); areasFor / spellAreas / handleFor
//     find exactly the template regions; a sweep of a clean scene does nothing; ending a
//     concentration effect removes that spell's area and its handle (concentrationCleanup); removeArea
//     removes a template region and, through deleteRegion, its handle, and refuses a plain region;
//     every setting's value; activePlacement() is null. A difference is a regression until explained.
//   - `golden.declared`: D-A3 + W2-K1 (kit surface, `module.api`, frozen, contract, describe rows),
//     the 0.4.0 rows that only the after side has (isHandle, inspect, summary, resolution,
//     latestResolution), and the hook names (the 8.5 / 8.6 splits may move a registration; their
//     count and order are pinned offline by golden/hooks.json).
// Never: uninstall() (it unhooks the live module; the hot-patch recipe is live check 4), resolve /
// applyRows / rollNpcSaves / rollForPlayer / pingPlayers / setRow / selfApply (they need a real damage
// roll and post chat; live check 2), ensureHandleActor (a GM call repairs the real actor), the
// eraser button. Foundry 14.369: one throwaway scene-flag update runs before the first region.
// The scene (with its regions and handles) and the two ZZ actors are deleted at the end.
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
/** Live only: poll until pred() holds or ms passes (handles are created from createRegion, unawaited). */
const settle = async (pred, ms = 6000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const MOD = "pentaryn-aoe";
const LEGACY = ["areasFor", "spellAreas", "handleFor", "removeArea", "sweep", "resolve", "applyRows", "rollNpcSaves", "rollForPlayer",
  "pingPlayers", "setRow", "ensureHandleActor", "createHandle", "selfApply", "pendingFor", "cardEffects", "activePlacement", "setting", "hookIds", "uninstall"];
const ADDED = ["isHandle", "inspect", "summary", "resolution", "latestResolution", "describe", "settings", "trace"];
const rawSetting = k => { try { return game.settings.get(MOD, k); } catch { return "unregistered"; } };
const SETTING_KEYS = () => [...game.settings.settings.keys()].filter(k => k.startsWith(`${MOD}.`)).map(k => k.slice(MOD.length + 1)).sort();

const out = { module: "aoe", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const A = game.pentaryn?.aoe;
const mod = game.modules.get(MOD);
const settingsBefore = Object.fromEntries(SETTING_KEYS().map(k => [k, rawSetting(k)]));
const handleActor = game.actors.find(a => a.flags?.[MOD]?.handleActor) ?? null;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: A?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name), activeGM: !!game.users.activeGM?.isSelf,
  handleActor: handleActor ? { id: handleActor.id, fixedId: handleActor.id === "pentarynAoeHndl0", count: game.actors.filter(a => a.flags?.[MOD]?.handleActor).length } : null,
  settings: settingsBefore
};
if (handleActor) tag(handleActor.id, "handleActor");
const S = out.golden.shared, D = out.golden.declared;

const regionOut = r => r ? {
  name: r.name, ownershipDefault: r.ownership?.default ?? null, attachedTo: r._source?.attachment?.token ?? null,
  handleFlag: r.flags?.[MOD]?.handle ?? null, shapes: r.shapes?.length ?? 0
} : null;
const tokenOut = t => t ? {
  id: t.id, name: t.name, actorId: t.actorId, actorLink: t.actorLink, width: t.width, height: t.height, x: t.x, y: t.y,
  disposition: t.disposition, hidden: t.hidden, lockRotation: t.lockRotation,
  flags: { aoe: t.flags?.[MOD] ?? null, lockSize: t.flags?.dnd5e?.lockSize ?? null }
} : null;
const idsOf = list => Array.isArray(list) ? list.map(d => d?.id ?? d).sort() : list;

let scene = null, caster = null;
try {
  if (!A) throw new Error("game.pentaryn.aoe is missing");
  if (!handleActor || !game.users.activeGM?.isSelf) {
    out.skipped = !handleActor ? "the world has no pentaryn-aoe handle actor" : "this tab is not the active GM";
    throw Object.assign(new Error(out.skipped), { skip: true });
  }

  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof A[k]]));
  let described = "absent";
  if (typeof A.describe === "function") { const d = A.describe(); described = { namespace: d.namespace, contract: d.contract, paths: (d.methods ?? []).map(m => m.path).sort(), settings: (d.settings ?? []).length }; }
  D.surface = {
    keys: keysOf(A), moduleApi: mod?.api === A ? "same" : typeof mod?.api, frozen: Object.isFrozen(A),
    rootFrozen: Object.isFrozen(game.pentaryn), contract: A.contract ?? null, describe: described,
    added: Object.fromEntries(ADDED.map(k => [k, typeof A[k]]))
  };
  S.settings = Object.fromEntries(SETTING_KEYS().map(k => [k, A.setting(k)]));
  S.settingUnknown = A.setting("zzNoSuchSetting") ?? "undefined";
  S.activePlacement = A.activePlacement() ?? null;
  const hk = await probe(() => A.hookIds());
  D.hookNames = Array.isArray(hk) ? hk.map(h => h.name) : hk;

  // ── the scratch caster: two spells, one with concentration ──────────────────
  caster = await Actor.create({ name: "ZZ Golden Aoe Caster", type: "npc" });
  tag(caster.id, "caster");
  const spell = (name, concentration) => {
    const id = foundry.utils.randomID();
    return { name, type: "spell", system: { level: 3, properties: concentration ? ["concentration"] : [],
      activities: { [id]: { _id: id, type: "save", name: "", save: { ability: ["dex"], dc: { calculation: "", formula: "13" } },
        target: { template: { type: "sphere", size: "20", units: "ft" } } } } } };
  };
  const [burst] = await caster.createEmbeddedDocuments("Item", [spell("ZZ Golden Burst", false)]);
  const [cloud] = await caster.createEmbeddedDocuments("Item", [spell("ZZ Golden Cloud", true)]);
  tag(burst.id, "burst"); tag(cloud.id, "cloud");
  const burstAct = burst.system.activities.contents[0], cloudAct = cloud.system.activities.contents[0];
  tag(burstAct.id, "burstActivity"); tag(cloudAct.id, "cloudActivity");

  // ── the scratch scene: two template regions and a plain one, one create each ─
  scene = await Scene.create({ name: "ZZ live-goldens aoe", width: 1500, height: 1000, padding: 0, grid: { size: 100 } });
  tag(scene.id, "scene");
  await scene.update({ "flags.world.zzWarm": 1 });                                  // 14.369: first change on a new scene
  const VIS = CONST.REGION_VISIBILITY?.LAYER_UNLOCKED ?? 0;
  const rect = (x, y) => ({ type: "rectangle", x, y, width: 400, height: 400, rotation: 0, hole: false });
  const template = (name, item, act, x) => ({ name, shapes: [rect(x, 100)], visibility: VIS,
    flags: { dnd5e: { activity: act.uuid, item: item.uuid } } });
  const [r1] = await scene.createEmbeddedDocuments("Region", [template("ZZ Burst area", burst, burstAct, 100)]);
  tag(r1.id, "burstRegion");
  const [r2] = await scene.createEmbeddedDocuments("Region", [template("ZZ Cloud area", cloud, cloudAct, 600)]);
  tag(r2.id, "cloudRegion");
  const [plain] = await scene.createEmbeddedDocuments("Region", [{ name: "ZZ Plain", shapes: [rect(1100, 100)], visibility: VIS }]);
  tag(plain.id, "plainRegion");
  const live = id => scene.regions.get(id);
  S.handlesSettled = await settle(() => !!A.handleFor(live(r1.id)) && !!A.handleFor(live(r2.id)));
  await sleep(200);
  S.regions = { burst: regionOut(live(r1.id)), cloud: regionOut(live(r2.id)), plain: regionOut(live(plain.id)) };
  S.handles = scene.tokens.contents.map(tokenOut).sort((a, b) => a.name.localeCompare(b.name));

  // ── finding areas ────────────────────────────────────────────────────────────
  S.find = {
    areasForBurst: idsOf(A.areasFor(burstAct.uuid, scene)),
    areasForBurstAllScenes: idsOf(A.areasFor(burstAct.uuid)),
    areasForNull: idsOf(A.areasFor(null)),
    spellAreasCloud: idsOf(A.spellAreas({ itemUuid: cloud.uuid }, scene)),
    spellAreasByActivity: idsOf(A.spellAreas({ activityUuid: burstAct.uuid }, scene)),
    spellAreasNone: idsOf(A.spellAreas({}, scene)),
    handleForBurst: A.handleFor(live(r1.id))?.id ?? null,
    handleForPlain: A.handleFor(live(plain.id))?.id ?? null,
    handleForNull: await probe(() => A.handleFor(null)) ?? null
  };
  S.cardEffectsNull = await probe(() => A.cardEffects(null));
  S.sweepClean = await probe(() => A.sweep(scene));

  // ── declared: the 0.4.0 rows ─────────────────────────────────────────────────
  const handleDoc = A.handleFor(live(r1.id));
  D.added = {
    isHandleToken: typeof A.isHandle === "function" ? A.isHandle(handleDoc) : "absent",
    isHandleActor: typeof A.isHandle === "function" ? A.isHandle(handleActor) : "absent",
    isHandleCaster: typeof A.isHandle === "function" ? A.isHandle(caster) : "absent",
    inspectHandle: typeof A.inspect === "function" ? await probe(() => A.inspect(handleDoc)) : "absent",
    inspectCaster: typeof A.inspect === "function" ? await probe(() => A.inspect(caster)) : "absent",
    summaryNull: typeof A.summary === "function" ? await probe(() => A.summary("zzNoSuchMessage0")) ?? "null" : "absent",
    resolutionNull: typeof A.resolution === "function" ? await probe(() => A.resolution("zzNoSuchMessage0")) ?? "null" : "absent",
    latestOnScene: typeof A.latestResolution === "function" ? await probe(() => A.latestResolution({ sceneId: scene.id })) ?? "null" : "absent"
  };

  // timings while the scene holds both areas (sweep has nothing to do: read-only)
  out.timings.areasFor = await timeIt(() => A.areasFor(burstAct.uuid), 9, 200);
  out.timings.spellAreas = await timeIt(() => A.spellAreas({ itemUuid: cloud.uuid }), 9, 200);
  out.timings.handleFor = await timeIt(() => A.handleFor(live(r1.id)), 9, 500);
  out.timings.setting = await timeIt(() => A.setting("handleTokens"), 9, 1000);
  out.timings.sweepClean = await timeIt(() => A.sweep(scene), 5, 1);

  // ── concentration ends → the cloud's area and handle go (active GM) ─────────
  const [conc] = await caster.createEmbeddedDocuments("ActiveEffect", [{ name: "ZZ Concentrating", img: "icons/svg/aura.svg",
    statuses: ["concentrating"], origin: cloud.uuid }]);
  tag(conc.id, "concentration");
  await sleep(100);
  await conc.delete();
  S.concentrationCleanup = {
    setting: A.setting("concentrationCleanup"),
    regionGone: await settle(() => !scene.regions.has(r2.id)),
    handleGone: await settle(() => !scene.tokens.has(r2.id)),
    burstKept: scene.regions.has(r1.id)
  };

  // ── removeArea: a plain region is refused, the burst goes with its handle ───
  S.removePlain = await probe(() => A.removeArea([plain.id], scene));
  S.removeBurst = await probe(() => A.removeArea([r1.id], scene));
  S.afterRemove = {
    handleGone: await settle(() => !scene.tokens.has(r1.id)),
    regions: scene.regions.contents.map(r => r.name).sort(),
    tokens: scene.tokens.contents.map(t => t.name).sort()
  };
  S.removeAgain = await probe(() => A.removeArea([r1.id], scene));
} catch (e) {
  if (!e?.skip) S.error = caught(e);
} finally {
  await sleep(300);
  if (scene && game.scenes.get(scene.id)) await safely("scene", () => scene.delete());
  if (caster && game.actors.get(caster.id)) await safely("caster", () => caster.delete());
  Object.assign(out.cleanup, {
    zzLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length,
    handleActorsLeft: Math.max(0, game.actors.filter(a => a.flags?.[MOD]?.handleActor).length - (out.env.handleActor?.count ?? 0)),
    settingsRestored: JSON.stringify(Object.fromEntries(SETTING_KEYS().map(k => [k, rawSetting(k)]))) === JSON.stringify(settingsBefore)
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
