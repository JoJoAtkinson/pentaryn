// Live golden — pentaryn-movement (`game.pentaryn.movement`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, with no
// player connected (a policy change toasts on players' clients). Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.1.2 code ("before") and the wave-2 code ("after")
//     both have. A difference there is a regression until explained.
//   - `golden.declared`: D-M2 (kit surface, `module.api`, frozen), the `status()` keys appended
//     after the historic ones (sceneId, version, settings), `status({sceneId})` answering for any
//     scene, the published `core` key list. Expected to differ.
// What it exercises (the real glue): a ZZ scratch scene (padding 0, grid 100) holding a visible
// and a hidden token of one ZZ npc and two notes, one under the visible token; pinsUnderTokens on
// it; combatActive on it with no combat, a combat whose only combatant is hidden (an ambush: does
// not count), then revealed (counts); ghostFor on its token as the GM; setPolicy round trip
// (off → always → the original) and setGhost (the GM's client setting), both restored in `finally`;
// the pure core rules over fixed inputs. The combat, scene and actor are deleted at the end.
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
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-movement";
const HISTORIC = ["policy", "combatOnScene", "allowed", "reason", "wish", "ghost", "ownedOnTop", "patched"];
const pick = (o, ks) => (o && typeof o === "object" && !o.threw) ? Object.fromEntries(ks.map(k => [k, o[k]])) : o;

const out = { module: "movement", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const M = game.pentaryn?.movement;
const mod = game.modules.get(MOD);
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: M?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name),
  activeCombats: game.combats.filter(c => c.active).length
};
const S = out.golden.shared, D = out.golden.declared;
const saved = {};
let scene = null, actor = null, combat = null;
try {
  if (!M) throw new Error("game.pentaryn.movement is missing");
  saved.policy = game.settings.get(MOD, "ghostPolicy");
  saved.last = game.settings.get(MOD, "ghostPolicyLast");
  saved.ghost = game.settings.get(MOD, "ghost");
  // creating an active scratch combat must not leave another combat's `active` changed
  saved.combats = game.combats.map(c => [c.id, !!c.active]);

  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["status", "ghostFor", "combatActive", "setGhost", "setPolicy", "pinsUnderTokens", "core"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof M[k]]));
  D.surface = { keys: keysOf(M), moduleApi: typeof mod?.api, frozen: Object.isFrozen(M), coreKeys: keysOf(M.core), contract: M.contract ?? null };

  // ── status() on the GM's current canvas, historic keys only ──────────────────
  const st = await probe(() => M.status());
  S.status = pick(st, HISTORIC);
  D.statusKeys = keysOf(st);

  // ── the pure core over fixed inputs (published as `core` in both builds) ─────
  const C = M.core ?? {};
  const call = (name, ...a) => typeof C[name] === "function" ? (() => { try { return C[name](...a); } catch (e) { return caught(e); } })() : `no core.${name}`;
  S.core = {
    POLICIES: C.POLICIES ? [...C.POLICIES] : null, DEFAULT_POLICY: C.DEFAULT_POLICY ?? null,
    normalizePolicy: ["off", "exploration", "always", "ALWAYS", " always ", null, undefined, "bogus", 3].map(v => call("normalizePolicy", v)),
    ghostAllowed: ["off", "exploration", "always"].flatMap(policy => [false, true].map(combatActive => ({ policy, combatActive, ...call("ghostAllowed", { policy, combatActive }) }))),
    ghostFor: [true, false].flatMap(isGM => ["exploration", "always"].flatMap(policy => [false, true].flatMap(combatActive => [false, true].map(wish =>
      ({ isGM, policy, combatActive, wish, isOwner: true, v: call("ghostFor", { isGM, policy, combatActive, wish, isOwner: true }) }))))),
    flipPolicy: [["off", "always", true], ["exploration", "always", false], ["always", "exploration", false], ["off", "off", true]].map(([p, l, on]) => call("flipPolicy", p, l, on)),
    combatOnScene: [
      call("combatOnScene", [], "s1"),
      call("combatOnScene", [{ active: true, sceneId: "s1", started: false, combatantSceneIds: [] }], "s1"),
      call("combatOnScene", [{ active: true, sceneId: "s1", started: true, combatantSceneIds: [] }], "s1"),
      call("combatOnScene", [{ active: true, sceneId: null, started: false, combatantSceneIds: ["s2"] }], "s2"),
      call("combatOnScene", [{ active: false, sceneId: "s1", started: true, combatantSceneIds: ["s1"] }], "s1"),
      call("combatOnScene", [{ active: true, sceneId: "s1", started: true }], null)
    ],
    pinsUnderTokens: call("pinsUnderTokens",
      [{ id: "n1", x: 150, y: 150, label: "A" }, { id: "n2", x: 900, y: 900, label: "B" }, { id: "n3", x: 350, y: 150, label: "" }],
      [{ id: "t1", name: "PC", x: 100, y: 100, w: 100, h: 100, playerOwned: true }, { id: "t2", name: "Ogre", x: 300, y: 100, w: 200, h: 200, playerOwned: false }])
  };

  // ── scratch scene: tokens, notes, pinsUnderTokens ────────────────────────────
  scene = await Scene.create({ name: "ZZ live-goldens movement", width: 1000, height: 1000, padding: 0, grid: { size: 100 } });
  actor = await Actor.create({ name: "ZZ Golden Movement Mover", type: "npc" });
  tag(scene.id, "scene"); tag(actor.id, "actor");
  const base = (await actor.getTokenDocument({ x: 200, y: 200 })).toObject();
  delete base._id;
  const [tokA, tokHidden] = await scene.createEmbeddedDocuments("Token", [
    { ...base, name: "ZZ Visible", x: 200, y: 200 },
    { ...base, name: "ZZ Hidden", x: 600, y: 600, hidden: true }
  ]);
  tag(tokA.id, "tokA"); tag(tokHidden.id, "tokHidden");
  const [noteUnder, noteClear, noteHidden] = await scene.createEmbeddedDocuments("Note", [
    { x: 250, y: 250, text: "ZZ pin under" },
    { x: 850, y: 150, text: "ZZ pin clear" },
    { x: 650, y: 650, text: "ZZ pin under hidden" }
  ]);
  tag(noteUnder.id, "noteUnder"); tag(noteClear.id, "noteClear"); tag(noteHidden.id, "noteHidden");
  S.pinsUnderTokens = await probe(() => M.pinsUnderTokens(scene));
  S.pinsNoScene = await probe(() => M.pinsUnderTokens(null));

  // ── combatActive / ghostFor on the scratch scene ─────────────────────────────
  const fakeToken = { document: tokA };
  S.combat = { none: await probe(() => M.combatActive(scene.id)), ghostForNone: await probe(() => M.ghostFor(fakeToken)) };
  combat = await Combat.create({ scene: scene.id, active: true });
  tag(combat.id, "combat");
  const [cb] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: tokA.id, sceneId: scene.id, actorId: actor.id, hidden: true }]);
  tag(cb.id, "combatant");
  S.combat.hiddenOnly = await probe(() => M.combatActive(scene.id));
  await cb.update({ hidden: false });
  S.combat.revealed = await probe(() => M.combatActive(scene.id));
  S.combat.ghostForInCombat = await probe(() => M.ghostFor(fakeToken));
  S.combat.otherScene = await probe(() => M.combatActive("zzNoSuchScene000"));
  S.combat.ghostForNoDoc = await probe(() => M.ghostFor({}));
  D.statusForScene = await probe(() => pick(M.status({ sceneId: scene.id }), [...HISTORIC, "sceneId"]));
  await combat.delete(); combat = null;
  S.combat.afterDelete = await probe(() => M.combatActive(scene.id));

  // ── setPolicy round trip (GM) and setGhost (the GM's client setting) ─────────
  const read = () => ({ policy: game.settings.get(MOD, "ghostPolicy"), last: game.settings.get(MOD, "ghostPolicyLast") });
  S.setPolicy = {};
  for (const v of ["off", "always", "exploration", "ALWAYS", "bogus"]) {
    const r = await probe(() => M.setPolicy(v));
    await sleep(80); // the onChange refresh is debounced 50 ms
    S.setPolicy[v] = { threw: !!r?.threw, ...read(), status: pick(await probe(() => M.status()), ["policy", "allowed", "reason"]) };
  }
  S.setGhost = {};
  for (const v of [true, false]) {
    await probe(() => M.setGhost(v));
    await sleep(80);
    S.setGhost[String(v)] = { setting: game.settings.get(MOD, "ghost"), status: pick(await probe(() => M.status()), ["wish", "ghost"]) };
  }

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.status = await timeIt(() => M.status(), 9, 200);
  out.timings.ghostFor = await timeIt(() => M.ghostFor(fakeToken), 9, 200);
  out.timings.combatActive = await timeIt(() => M.combatActive(scene.id), 9, 200);
  out.timings.pinsUnderTokens = await timeIt(() => M.pinsUnderTokens(scene), 9, 50);
} catch (e) {
  S.error = caught(e);
} finally {
  if (combat && game.combats.get(combat.id)) await combat.delete();
  for (const [id, was] of saved.combats ?? []) {
    const c = game.combats.get(id);
    if (c && !!c.active !== was) await c.update({ active: was });
  }
  if ("policy" in saved) {
    if (game.settings.get(MOD, "ghostPolicy") !== saved.policy) await game.settings.set(MOD, "ghostPolicy", saved.policy);
    if (game.settings.get(MOD, "ghostPolicyLast") !== saved.last) await game.settings.set(MOD, "ghostPolicyLast", saved.last);
    if (game.settings.get(MOD, "ghost") !== saved.ghost) await game.settings.set(MOD, "ghost", saved.ghost);
  }
  if (scene && game.scenes.get(scene.id)) await scene.delete();
  if (actor && game.actors.get(actor.id)) await actor.delete();
  out.cleanup = {
    settingsRestored: "policy" in saved ? (game.settings.get(MOD, "ghostPolicy") === saved.policy
      && game.settings.get(MOD, "ghostPolicyLast") === saved.last && game.settings.get(MOD, "ghost") === saved.ghost) : null,
    zzLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length
      + game.combats.filter(c => c.scene?.name?.startsWith?.("ZZ ")).length,
    combatsActiveRestored: (saved.combats ?? []).every(([id, was]) => !game.combats.get(id) || !!game.combats.get(id).active === was)
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
