// Live golden — pentaryn-creatures (`game.pentaryn.creatures`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab (the light is written by the active GM's client; a second GM tab is another writer), no
// player connected (the scratch actors are owned by a player user for a few seconds). Needs at
// least one non-GM user in the world and this tab to be the active GM; otherwise returns
// { skipped }. Returns a JSON string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.1.1 code ("before", one `creatures.mjs`) and the
//     wave-3 code ("after") both have: the creature light rules end to end (who is lit, the light
//     and flag written, a hand switch-off sticks, a hand-set light is let go, losing the player
//     owner darkens it), how many token writes that took, isCreature, list (the strip entries) for
//     the player and for the GM, ownerSees on a GM client, patchedWith, and the pure core.
//   - `golden.declared`: C-D2 (kit surface, `module.api`, frozen, describe), C-D3 (`syncScene`
//     with an array or a bare id: before throws a TypeError, after a count; `status()`,
//     `inspect()` after only).
// What it exercises: a ZZ scratch scene (padding 0, grid 100, never viewed) holding one token each
// of: three player-owned ZZ npcs (summons), a GM-only npc, a player-owned character (a PC: never
// lit), a player-owned npc whose token carries pentaryn-aoe's `handle` flag (a prop: never lit),
// and a player-owned npc whose token already has a light of its own (left alone). The light
// follows from the module's own createToken / updateToken / updateActor hooks (a 200 ms timer:
// waited for with a MessageChannel poll, J20), then syncScene must find nothing left to do.
// World settings are read, never written (a lightRadius change re-syncs every scene in the world).
// Foundry 14.369 (merge-and-go-live §6): one throwaway world-flag update on the scene first.
// The scene and the actors are deleted at the end.
// Wave 3 live plan: context/plans/addon-blueprint-2026-10/wave-3-live-plan.md.

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
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };
/** Poll until pred() holds or ms passes; then one more quiet second so a trailing flush lands too. */
const settle = async (pred, ms = 8000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) { await sleep(1200); return true; } await tick(); }
  return !!pred();
};

const MOD = "pentaryn-creatures";
const LEGACY = ["list", "render", "syncScene", "syncAll", "isCreature", "ownerSees", "patchedWith", "core"];
const SETTINGS = ["lightRadius", "ownerSees", "floatOverHud", "showStrip"];
const setting = k => { try { return game.settings.get(MOD, k); } catch { return "unregistered"; } };

const out = { module: "creatures", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const M = game.pentaryn?.creatures;
const mod = game.modules.get(MOD);
const player = game.users.find(u => !u.isGM) ?? null;
const writer = game.users.activeGM?.isSelf === true;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: M?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name), writer, libWrapper: !!game.modules.get("lib-wrapper")?.active,
  settings: Object.fromEntries(SETTINGS.map(k => [k, setting(k)]))
};
if (!player || !writer || !M) {
  out.skipped = !M ? "game.pentaryn.creatures is missing" : !player ? "no non-GM user in the world" : "this tab is not the active GM";
  return JSON.stringify(out);
}
const S = out.golden.shared, D = out.golden.declared;
const FLAG = "light";
const lightOf = t => {
  const d = t?.parent?.tokens?.get(t.id) ?? t;
  const f = d?.flags?.[MOD]?.[FLAG];
  return { bright: d?.light?.bright ?? null, dim: d?.light?.dim ?? null, flag: f === undefined ? "unset" : f };
};
let scene = null, writes = 0, hookId = null;
const actors = [];
try {
  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof M[k]]));
  let described = "absent";
  if (typeof M.describe === "function") { const d = M.describe(); described = { namespace: d.namespace, paths: (d.methods ?? []).map(m => m.path).sort() }; }
  D.surface = { keys: keysOf(M), moduleApi: mod?.api === M ? "same" : typeof mod?.api, frozen: Object.isFrozen(M), contract: M.contract ?? null, describe: described, coreKeys: keysOf(M.core) };
  S.patchedWith = await probe(() => M.patchedWith());

  // ── the pure core (published as `core` in both builds) ───────────────────────
  const C = M.core ?? {};
  const call = (name, ...a) => typeof C[name] === "function" ? (() => { try { return C[name](...a); } catch (e) { return caught(e); } })() : `no core.${name}`;
  const radius = 5;
  S.core = {
    isPlayerCreature: [{ actorType: "npc", hasPlayerOwner: true }, { actorType: "character", hasPlayerOwner: true }, { actorType: "npc", hasPlayerOwner: false },
      { actorType: "npc", hasPlayerOwner: true, isPile: true }, { actorType: "npc", hasPlayerOwner: true, isProp: true }, null].map(t => call("isPlayerCreature", t)),
    lightUpdate: [
      [{ light: { bright: 0, dim: 0 } }, true], [{ light: { bright: 2, dim: 4 } }, true],
      [{ light: { bright: 5, dim: 5 }, flags: { [MOD]: { light: { bright: 5, dim: 5 } } } }, true],
      [{ light: { bright: 3, dim: 3 }, flags: { [MOD]: { light: { bright: 3, dim: 3 } } } }, true],
      [{ light: { bright: 5, dim: 5 }, flags: { [MOD]: { light: { bright: 5, dim: 5 } } } }, false],
      [{ light: { bright: 0, dim: 0 }, flags: { [MOD]: { light: { bright: 5, dim: 5 } } } }, true],
      [{ light: { bright: 10, dim: 20 }, flags: { [MOD]: { light: { bright: 5, dim: 5 } } } }, true],
      [{ light: { bright: 0, dim: 0 }, flags: { [MOD]: { light: false } } }, true]
    ].map(([t, q]) => call("lightUpdate", t, { qualifies: q, radius })),
    ownerShouldSee: [{ enabled: true, isOwner: true }, { enabled: true, isOwner: true, hidden: true }, { enabled: true, isGM: true, isOwner: true }, { enabled: false, isOwner: true }].map(s => call("ownerShouldSee", s)),
    stripEntries: call("stripEntries", [
      { id: "b", name: "Wolf", img: "w.webp", actorId: "a2", actorType: "npc", isOwner: true },
      { id: "a", name: "Hero", img: "h.webm", actorImg: "h.png", actorId: "pc", actorType: "character", isOwner: true },
      { id: "c", name: "Ally", img: "x.png", actorId: "a3", actorType: "character", isOwner: true },
      { id: "d", name: "Hidden", actorId: "a4", isOwner: true, hidden: true }, { id: "e", name: "Pile", actorId: "a5", isOwner: true, isPile: true },
      { id: "f", name: "Not mine", actorId: "a6", isOwner: false }], { characterId: "pc" }),
    shouldShowStrip: [[], [{}], [{}, {}], null].map(e => call("shouldShowStrip", e)),
    stripDock: [call("stripDock", null, 900), call("stripDock", { top: 700, left: 100, width: 600, height: 120 }, 900)]
  };

  // ── scratch scene and actors ─────────────────────────────────────────────────
  scene = await Scene.create({ name: "ZZ live-goldens creatures", width: 1000, height: 1000, padding: 0, grid: { size: 100 } });
  tag(scene.id, "scene");
  await scene.update({ "flags.world.zzWarm": 1 });
  hookId = Hooks.on("updateToken", doc => { if (doc.parent?.id === scene?.id) writes++; });
  const own = { default: 0, [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER };
  const mkActor = async (label, type, ownership) => {
    const a = await Actor.create({ name: `ZZ Golden Creatures ${label}`, type, ownership });
    actors.push(a); tag(a.id, `actor-${label}`); return a;
  };
  const mkToken = async (label, a, x, y, extra = {}) => {
    const data = (await a.getTokenDocument({ x, y })).toObject();
    delete data._id;
    const [t] = await scene.createEmbeddedDocuments("Token", [foundry.utils.mergeObject(data, { name: `ZZ ${label}`, x, y, ...extra })]);
    tag(t.id, `tok-${label}`); return t;
  };
  tag(player.id, "player");
  const tok = {};
  tok.summon = await mkToken("summon", await mkActor("Summon", "npc", own), 100, 100);
  tok.summon2 = await mkToken("summon2", await mkActor("Summon2", "npc", own), 300, 100);
  tok.summon3 = await mkToken("summon3", await mkActor("Summon3", "npc", own), 500, 100);
  tok.gmNpc = await mkToken("gmNpc", await mkActor("GmNpc", "npc", { default: 0 }), 100, 300);
  tok.pc = await mkToken("pc", await mkActor("Pc", "character", own), 300, 300);
  tok.handle = await mkToken("handle", await mkActor("Handle", "npc", own), 500, 300, { flags: { "pentaryn-aoe": { handle: true } } });
  tok.ownLight = await mkToken("ownLight", await mkActor("OwnLight", "npc", own), 700, 300, { light: { bright: 2, dim: 4 } });
  const want = foundry.utils.deepClone(out.env.settings.lightRadius);
  S.settledLit = await settle(() => ["summon", "summon2", "summon3"].every(k => scene.tokens.get(tok[k].id)?.flags?.[MOD]?.[FLAG]?.bright === want));
  const snapshot = () => Object.fromEntries(Object.entries(tok).map(([k, t]) => [k, lightOf(t)]));
  S.lit = snapshot();
  S.writesToLight = writes;
  S.isCreature = Object.fromEntries(Object.entries(tok).map(([k, t]) => [k, M.isCreature(scene.tokens.get(t.id))]));
  S.syncSceneConverged = await probe(() => M.syncScene(scene));
  S.syncSceneSet = await probe(() => M.syncScene(scene, new Set([tok.summon.id])));
  D.syncSceneArray = await probe(() => M.syncScene(scene, [tok.summon.id]));
  D.syncSceneString = await probe(() => M.syncScene(scene, tok.summon.id));
  S.listPlayer = await probe(() => M.list(player, scene));
  S.listGM = await probe(() => M.list(game.user, scene));
  S.ownerSees = { placeableLike: await probe(() => M.ownerSees({ document: scene.tokens.get(tok.summon.id) })), document: await probe(() => M.ownerSees(scene.tokens.get(tok.summon.id))) };
  S.render = await probe(() => M.render()) ?? "undefined";

  // ── the hands-off rules, live ────────────────────────────────────────────────
  writes = 0;
  await scene.tokens.get(tok.summon.id).update({ "light.bright": 0, "light.dim": 0 });            // the GM switched it off by hand
  S.switchedOffSettled = await settle(() => scene.tokens.get(tok.summon.id)?.flags?.[MOD]?.[FLAG] === false);
  await scene.tokens.get(tok.summon2.id).update({ "light.bright": 10, "light.dim": 20 });          // a torch replaced our light
  S.replacedSettled = await settle(() => scene.tokens.get(tok.summon2.id)?.flags?.[MOD]?.[FLAG] == null);
  await game.actors.get(scene.tokens.get(tok.summon3.id).actorId).update({ ownership: { [player.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE } });
  S.disownedSettled = await settle(() => scene.tokens.get(tok.summon3.id)?.light?.dim === 0);
  S.afterHands = snapshot();
  S.writesForHands = writes;
  S.syncSceneAfterHands = await probe(() => M.syncScene(scene));
  S.isCreatureAfterDisown = M.isCreature(scene.tokens.get(tok.summon3.id));

  // ── after-only rows (C-D3) ───────────────────────────────────────────────────
  if (typeof M.status === "function") {
    const st = await probe(() => M.status());
    D.status = st?.threw ? st : { keys: keysOf(st), patchedWith: st.patchedWith, writer: st.writer, version: st.version, litIsNumber: typeof st.lit === "number" };
    D.inspectSummon = await probe(() => M.inspect(scene.tokens.get(tok.summon.id)));
    D.inspectGmNpc = await probe(() => M.inspect(scene.tokens.get(tok.gmNpc.id).uuid));
    D.inspectAsPlayer = await probe(() => M.inspect(scene.tokens.get(tok.summon2.id), { as: player.id }));
  } else D.status = "absent";

  // ── timings ──────────────────────────────────────────────────────────────────
  const anyTok = scene.tokens.get(tok.summon2.id);
  out.timings.isCreature = await timeIt(() => M.isCreature(anyTok), 9, 200);
  out.timings.listPlayer = await timeIt(() => M.list(player, scene), 9, 100);
  out.timings.syncSceneConverged = await timeIt(() => M.syncScene(scene), 9, 10);
  out.timings.coreLightUpdate = await timeIt(() => C.lightUpdate({ light: { bright: 0, dim: 0 } }, { qualifies: true, radius: 5 }), 9, 500);
} catch (e) {
  S.error = caught(e);
} finally {
  await sleep(1500);                                                      // any trailing light flush lands first
  if (hookId !== null) Hooks.off("updateToken", hookId);
  if (scene && game.scenes.get(scene.id)) await safely("scene", () => scene.delete());
  const actorIds = actors.filter(a => game.actors.get(a.id)).map(a => a.id);
  if (actorIds.length) await safely("actors", () => Actor.deleteDocuments(actorIds));
  Object.assign(out.cleanup, {
    zzLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length,
    settingsRestored: JSON.stringify(Object.fromEntries(SETTINGS.map(k => [k, setting(k)]))) === JSON.stringify(out.env.settings)
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
