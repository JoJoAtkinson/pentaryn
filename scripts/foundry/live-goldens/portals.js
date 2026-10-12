// Live golden — pentaryn-portals (`game.pentaryn.portals`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab, no player connected. Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.4.4 code ("before", one `portals.mjs`) and the
//     wave-3 code ("after", the blueprint split) both have. A difference is a regression until
//     explained.
//   - `golden.declared`: D-P1 (kit surface, `module.api`, frozen, describe), D-P5 `cardFor(null)`
//     (before throws a TypeError, after `null`), D-P6 `spreadArrival` past a handle flagged only on
//     its actor (before it steps off, after it stays; run only when the world already has an aoe
//     handle actor, so `handleActor()` in pentaryn-aoe never picks the scratch one), and the -32
//     additions (`inspect`, `destinations`, `link`, `unlink`, `badges`) that only the after side has.
// What it exercises (the real glue): two ZZ scratch scenes (padding 0, grid 100, never viewed).
// Scene B holds a flagged destination region (title, description, no image) and a bare one;
// scene A holds a region whose Teleport Token behaviour leads to the flagged one. cardFor on both
// (the fallbacks: navName, then the door icon), snapshot on a scene with no background (null and a
// warning toast, no upload), teleportParty(null) and lookAt(null) (no-ops; a real teleportParty
// moves PCs on the viewed scene and is never called), spreadArrival on scene B (a token landing on
// another steps off; a hidden occupant and a token-flagged aoe handle do not count), the pure core
// (imported from the module's own portals-core.mjs, which both builds ship with the same exports),
// and the after-only rows on scene A/B. Never: open() (a window), lookAt(region) (moves the GM's
// view), teleportParty(region), the region-config snapshot button.
// Foundry 14.369 (merge-and-go-live §6): a new scene's first token change may not persist server
// side; one throwaway world-flag update per scene runs before anything is asserted.
// Both scenes and the actors are deleted at the end.
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
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
/** Map an array; keep anything else (a caught `{threw, name, message}`, a "no x" string) as-is (LG-R7). */
const mapOr = (v, f) => Array.isArray(v) ? v.map(f) : (v ?? "undefined");
const keysOf = o => Object.keys(o ?? {}).sort();
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-portals";
const LEGACY = ["snapshot", "cardFor", "teleportParty", "lookAt", "open", "redraw", "spreadArrival"];
const ADDED = ["inspect", "destinations", "link", "unlink", "badges"];
const setting = k => { try { return game.settings.get(MOD, k); } catch { return "unregistered"; } };
const pos = t => (t?.threw ? t : { x: t?.x ?? null, y: t?.y ?? null });

const out = { module: "portals", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const P = game.pentaryn?.portals;
const mod = game.modules.get(MOD);
const realHandleActor = game.actors.find(a => a.flags?.["pentaryn-aoe"]?.handleActor) ?? null;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: P?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name),
  settings: { teleportDefault: setting("teleportDefault"), spreadArrivals: setting("spreadArrivals"), confirmPartyTeleport: setting("confirmPartyTeleport") },
  aoeHandleActor: !!realHandleActor
};
const S = out.golden.shared, D = out.golden.declared;
let sceneA = null, sceneB = null, actor = null, ghostActor = null;
try {
  if (!P) throw new Error("game.pentaryn.portals is missing");

  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof P[k]]));
  let described = "absent";
  if (typeof P.describe === "function") { const d = P.describe(); described = { namespace: d.namespace, paths: (d.methods ?? []).map(m => m.path).sort() }; }
  D.surface = {
    keys: keysOf(P), moduleApi: mod?.api === P ? "same" : typeof mod?.api, frozen: Object.isFrozen(P),
    contract: P.contract ?? null, describe: described, added: Object.fromEntries(ADDED.map(k => [k, typeof P[k]]))
  };

  // ── the pure core (portals-core.mjs exists in both builds; these exports are unchanged) ─────
  const C = await import(foundry.utils.getRoute(`modules/${MOD}/portals-core.mjs`));
  const call = (name, ...a) => typeof C[name] === "function" ? (() => { try { return C[name](...a); } catch (e) { return caught(e); } })() : `no ${name}`;
  const rec = (id, o = {}) => ({ id, name: id, type: "npc", linked: false, pile: false, excluded: false, handle: false, actorId: `a-${id}`, owners: [], summoner: null, ...o });
  const pcA = rec("pcA", { type: "character", linked: true, owners: ["u1"], actorId: "A1" });
  const pcB = rec("pcB", { type: "character", linked: true, owners: ["u2"], actorId: "A2" });
  const records = [rec("guard"), pcA, rec("wolf", { summoner: "A1" }), pcB, rec("hawk", { owners: ["u2"] }),
    rec("pileOfLoot", { pile: true, owners: ["u1"] }), rec("handle", { handle: true, owners: ["u1", "u2"] }), rec("stray", { summoner: "A9" }),
    rec("pilePC", { type: "character", linked: true, pile: true, owners: ["u1"] })];
  const party = call("partySelection", records);
  const toAbs = u => (u.startsWith(".") ? `Scene.s1${u}` : u);
  S.core = {
    OWNER: C.OWNER ?? null,
    summonerActorId: ["Actor.abc.Item.x", "Scene.s.Token.t.Actor.def", "Compendium.x.y", null, 5].map(v => call("summonerActorId", v)),
    playerOwners: call("playerOwners", { default: 3, gm1: 3, u1: 3, u2: 2, u3: 3 }, ["gm1"]),
    isScenery: [{ name: "Crowd (crowd)" }, { name: "Marker · 1" }, { name: "Guard", folders: ["NPCs", "Crowd Extras"] }, { name: "Guard", folders: ["Temp Markers"] }, { name: "Guard" }, undefined].map(v => call("isScenery", v)),
    partySelection: Array.isArray(party) ? party.map(r => r.id) : party,
    leaderOf: ["wolf", "hawk", "guard", "stray"].map(id => call("leaderOf", records.find(r => r.id === id), [pcA, pcB])),
    partyPreview: Array.isArray(party) ? call("partyPreview", party) : party,
    followersOf: mapOr(call("followersOf", [pcA], records), r => r.id),
    ringSpots: call("ringSpots", 500, 500, 100, 10, { occupied: (x, y) => x === 600 && y === 500 }),
    ringBlocked: call("ringSpots", 500, 500, 100, 4, { blocked: call("wallBlocker", [[550, 0, 550, 1000]]) }),
    assignSpots: Array.isArray(party) ? call("assignSpots", call("ringSpots", 500, 500, 100, party.length + 8), party) : party,
    crowded: [[{ x: 0, y: 0, w: 100, h: 100 }, [{ x: 50, y: 50, w: 100, h: 100 }]], [{ x: 0, y: 0, w: 100, h: 100 }, [{ x: 100, y: 0, w: 100, h: 100 }]], [{ x: 0, y: 0, w: 100, h: 100 }, []]].map(([b, o]) => call("crowded", b, o)),
    absoluteDestinations: call("absoluteDestinations", new Set([".Region.r1", "Scene.s2.Region.r2"]), toAbs),
    hasDestination: [call("hasDestination", [".Region.r1"], "Scene.s1.Region.r1", toAbs), call("hasDestination", [".Region.r1"], "Scene.s2.Region.r1", toAbs)],
    withoutDestination: call("withoutDestination", [".Region.r1", "Scene.s2.Region.r2"], "Scene.s1.Region.r1", toAbs)
  };

  // ── scratch scenes and regions (one create per document: Foundry 14 batch order) ─────────────
  sceneA = await Scene.create({ name: "ZZ live-goldens portals A", width: 1000, height: 1000, padding: 0, grid: { size: 100 } });
  sceneB = await Scene.create({ name: "ZZ live-goldens portals B", navName: "ZZ Golden Landing", width: 1000, height: 1000, padding: 0, grid: { size: 100 } });
  tag(sceneA.id, "sceneA"); tag(sceneB.id, "sceneB");
  const shape = (x, y) => ({ type: "rectangle", x, y, width: 200, height: 200, rotation: 0, hole: false });
  const VIS = CONST.REGION_VISIBILITY?.LAYER_UNLOCKED ?? 0;
  const [gate] = await sceneB.createEmbeddedDocuments("Region", [{ name: "ZZ Gate", shapes: [shape(100, 100)], visibility: VIS,
    flags: { [MOD]: { title: "  ZZ Golden Gate  ", description: "Line one\nLine <two>", img: "  " } } }]);
  const [bare] = await sceneB.createEmbeddedDocuments("Region", [{ name: "ZZ Bare", shapes: [shape(600, 600)], visibility: VIS }]);
  const [door] = await sceneA.createEmbeddedDocuments("Region", [{ name: "ZZ Door", shapes: [shape(100, 100)], visibility: VIS,
    behaviors: [{ name: "Teleport", type: "teleportToken", system: { destinations: [gate.uuid], placement: "center", snap: true, choice: true, revealed: true,
      dialog: { revealed: null, unrevealed: null }, transition: { type: "fade", duration: 1500 } } }] }]);
  tag(gate.id, "gate"); tag(bare.id, "bare"); tag(door.id, "door");
  for (const b of door.behaviors) tag(b.id, "doorBehavior");

  S.cardFor = { gate: await probe(() => P.cardFor(gate)), bare: await probe(() => P.cardFor(bare)) };
  D.cardForNull = await probe(() => P.cardFor(null));
  S.noops = { teleportPartyNull: await probe(() => P.teleportParty(null)) ?? "undefined", lookAtNull: await probe(() => P.lookAt(null)) ?? "undefined" };
  S.snapshotNoBackground = await probe(() => P.snapshot(gate)) ?? "undefined";
  S.snapshotByUuid = await probe(() => P.snapshot(bare.uuid)) ?? "undefined";
  S.doorBehaviors = door.behaviors.contents.map(b => ({ type: b.type, disabled: b.disabled, destinations: [...(b.system.destinations ?? [])] }));

  // ── spreadArrival on scene B ─────────────────────────────────────────────────
  actor = await Actor.create({ name: "ZZ Golden Portals Walker", type: "npc" });
  tag(actor.id, "actor");
  const base = (await actor.getTokenDocument({ x: 0, y: 0 })).toObject();
  delete base._id;
  const mk = async (name, x, y, extra = {}) => { const [t] = await sceneB.createEmbeddedDocuments("Token", [{ ...base, name, x, y, ...extra }]); tag(t.id, name); return t; };
  const warm = await mk("warm", 900, 900);
  await warm.update({ "flags.world.zzWarm": 1 });                       // 14.369: first change on a new scene
  await sceneA.update({ "flags.world.zzWarm": 1 });
  const occupant = await mk("occupant", 400, 400);
  const lander = await mk("lander", 400, 400);
  await mk("hiddenOccupant", 700, 100, { hidden: true });
  const besideHidden = await mk("besideHidden", 700, 100);
  await mk("handleOccupant", 100, 700, { flags: { "pentaryn-aoe": { handle: true } } });
  const besideHandle = await mk("besideHandle", 100, 700);
  const free = await mk("free", 900, 100);
  const r1 = await probe(() => P.spreadArrival(lander));
  S.spreadArrival = {
    returnsSameDoc: r1 === lander, crowdedMovedTo: pos(sceneB.tokens.get(lander.id)), occupantStays: pos(sceneB.tokens.get(occupant.id)),
    hiddenDoesNotCount: pos(await probe(() => P.spreadArrival(besideHidden))),
    tokenHandleDoesNotCount: pos(await probe(() => P.spreadArrival(besideHandle))),
    freeStays: pos(await probe(() => P.spreadArrival(free)))
  };
  if (realHandleActor) {
    ghostActor = await Actor.create({ name: "ZZ Golden Portals Handle", type: "npc", flags: { "pentaryn-aoe": { handleActor: true } } });
    tag(ghostActor.id, "ghostActor");
    const gb = (await ghostActor.getTokenDocument({ x: 300, y: 800 })).toObject();
    delete gb._id;
    const [ghostTok] = await sceneB.createEmbeddedDocuments("Token", [{ ...gb, name: "actorHandleOccupant", x: 300, y: 800 }]);
    tag(ghostTok.id, "actorHandleOccupant");
    const besideGhost = await mk("besideActorHandle", 300, 800);
    D.spreadPastActorHandle = pos(await probe(() => P.spreadArrival(besideGhost)));
  } else D.spreadPastActorHandle = "skipped: the world has no pentaryn-aoe handle actor";

  // ── after-only rows (-32): read on A/B, link/unlink on the scratch regions ───
  if (typeof P.destinations === "function") {
    const card = d => d && !d.threw ? { name: d.name, scene: d.scene, card: d.card, revealed: d.revealed, choice: d.choice } : d;
    D.destinations = mapOr(await probe(() => P.destinations(door.uuid)), card);
    D.inspectDoor = await probe(() => P.inspect(door.uuid));
    D.inspectActor = await probe(() => P.inspect(actor)) ?? "undefined";
    D.inspectMissing = await probe(() => P.inspect("ZZ no such region zzz"));
    D.linkDry = await probe(() => P.link(door.uuid, { to: bare.uuid, dryRun: true }));
    D.linkReal = await probe(() => P.link(door.uuid, { to: bare.uuid }));
    D.afterLink = mapOr(await probe(() => P.destinations(door.uuid)), d => d.name);
    D.linkAgain = await probe(() => P.link(door.uuid, { to: bare.uuid }));
    D.unlinkDry = await probe(() => P.unlink(door.uuid, { to: bare.uuid, dryRun: true }));
    D.unlinkReal = await probe(() => P.unlink(door.uuid, { to: bare.uuid }));
    D.afterUnlink = mapOr(await probe(() => P.destinations(door.uuid)), d => d.name);
    const bd = await probe(() => P.badges());
    D.badges = Array.isArray(bd) ? { isArray: true } : bd;
  } else D.destinations = "absent";

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.cardFor = await timeIt(() => P.cardFor(gate), 9, 200);
  out.timings.spreadArrivalFree = await timeIt(() => P.spreadArrival(free), 9, 20);
  out.timings.coreAssignSpots = await timeIt(() => C.assignSpots(C.ringSpots(500, 500, 100, 20), records), 9, 200);
  out.timings.redraw = await timeIt(() => P.redraw(), 5, 1);
  if (typeof P.destinations === "function") out.timings.destinations = await timeIt(() => P.destinations(door.uuid), 9, 50);
} catch (e) {
  S.error = caught(e);
} finally {
  await sleep(300);                                                       // D-P3's 50 ms region-hook debounce
  if (sceneA && game.scenes.get(sceneA.id)) await sceneA.delete();
  if (sceneB && game.scenes.get(sceneB.id)) await sceneB.delete();
  if (actor && game.actors.get(actor.id)) await actor.delete();
  if (ghostActor && game.actors.get(ghostActor.id)) await ghostActor.delete();
  out.cleanup = {
    zzLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length,
    settingsRestored: JSON.stringify({ teleportDefault: setting("teleportDefault"), spreadArrivals: setting("spreadArrivals"), confirmPartyTeleport: setting("confirmPartyTeleport") }) === JSON.stringify(out.env.settings)
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
