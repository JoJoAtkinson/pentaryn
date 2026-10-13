// Live golden — pentaryn-combat (`game.pentaryn.combat`). Body of an async function for the foundry
// `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM tab, no
// player connected, **no started combat in the world** (the turn key reads the started combats;
// the run records `env.startedCombats` and is `skipped` when one is running). Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.2.5 code ("before", the flat files) and the wave-4
//     code ("after", turnflow/ and hud/ splits, argon-kit) both have, called with Documents (the
//     legacy convention): on a ZZ npc with two weapons, a dagger stack of two and a Multiattack
//     written with item links — weapons() (every weapon shape), count() per weapon, multiattack(),
//     plan(), turn() before and after newTurn() (the turn-flag replace write), reckless(), running(),
//     this user's quick() and riderMode() (read only), report() and fixFeats() (report only),
//     seedWeaponSets() on an npc (null), and every setting's value. A difference is a regression
//     until explained.
//   - `golden.declared`: the kit surface (`module.api`, frozen, contract, describe rows, events) and
//     W2-K1; D-c2 (`plan()` with no actor — before a TypeError, after null — and a name / uuid ref
//     resolved by the member itself, before a TypeError or a wrong answer); the after-only rows
//     inspect(), selftest() and coversMultiattack() (combat↔transform, -13 step 3).
// Never: fullAttack / followUp / rollRider / setReckless / abort (they roll, post chat or need a HUD;
// live checks B2, W4-C1, D-c3), setQuick / setRiderMode (the GM user's own flags), seedAll (every
// character in the world). The npc is deleted at the end.
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
/** One macrotask through a shared MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). One channel per golden; each message wakes the oldest waiting tick (perf-1). ref/unref exist only in Node (the offline tests), where an idle listening port would hold the process open. */
const tickQ = [];
const tickChan = new MessageChannel();
tickChan.port1.onmessage = () => { tickQ.shift()?.(); if (!tickQ.length) tickChan.port1.unref?.(); };
tickChan.port1.unref?.();
const tick = () => new Promise(r => { tickQ.push(r); tickChan.port1.ref?.(); tickChan.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-combat";
const LEGACY = ["count", "plan", "turn", "newTurn", "multiattack", "weapons", "offers", "fullAttack", "followUp", "rollRider", "reckless",
  "setReckless", "running", "abort", "quick", "setQuick", "riderMode", "setRiderMode", "report", "fixFeats", "seedWeaponSets", "seedAll"];
const ADDED = ["inspect", "selftest", "coversMultiattack", "describe", "settings", "trace", "uninstall"];
const RIDERS = ["sneak-attack", "frenzy", "colossus-slayer", "divine-strike"];
const rawSetting = k => { try { return game.settings.get(MOD, k); } catch { return "unregistered"; } };
const SETTING_KEYS = () => [...game.settings.settings.keys()].filter(k => k.startsWith(`${MOD}.`)).map(k => k.slice(MOD.length + 1)).sort();

const out = { module: "combat", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const C = game.pentaryn?.combat;
const mod = game.modules.get(MOD);
const settingsBefore = Object.fromEntries(SETTING_KEYS().map(k => [k, rawSetting(k)]));
const userFlagsBefore = JSON.stringify(game.user.flags?.[MOD] ?? null);
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: C?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name),
  startedCombats: game.combats.filter(c => c.started).length, argon: !!game.modules.get("enhancedcombathud")?.active,
  settings: settingsBefore
};
const S = out.golden.shared, D = out.golden.declared;

/** report()/seed print to the console; keep the bridge tab's console quiet while they run. */
const quiet = async fn => {
  const t = console.table, l = console.log, i = console.info;
  try { console.table = () => {}; console.log = () => {}; console.info = () => {}; return await fn(); } finally { console.table = t; console.log = l; console.info = i; }
};
const plain = v => (v && typeof v === "object" && !v.threw) ? JSON.parse(JSON.stringify(v, (k, x) => (x?.documentName ? `<doc ${x.documentName} ${x.name ?? x.id}>` : x))) : v;

let npc = null;
try {
  if (!C) throw new Error("game.pentaryn.combat is missing");
  if (out.env.startedCombats) { out.skipped = "a combat is running: the turn key would differ between runs"; throw Object.assign(new Error(out.skipped), { skip: true }); }

  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof C[k]]));
  let described = "absent";
  if (typeof C.describe === "function") {
    const d = C.describe();
    described = { namespace: d.namespace, contract: d.contract, paths: (d.methods ?? []).map(m => m.path).sort(),
      events: (d.events ?? []).map(e => `${e.name}|${e.legacyName ?? ""}`).sort(), patches: (d.patches ?? []).length, settings: (d.settings ?? []).length };
  }
  D.surface = {
    keys: keysOf(C), moduleApi: mod?.api === C ? "same" : typeof mod?.api, frozen: Object.isFrozen(C),
    rootFrozen: Object.isFrozen(game.pentaryn), contract: C.contract ?? null, describe: described,
    added: Object.fromEntries(ADDED.map(k => [k, typeof C[k]])), coreKeys: keysOf(C.core).length
  };
  S.settings = settingsBefore;
  S.user = { quick: await probe(() => C.quick()), riderModes: Object.fromEntries(RIDERS.map(k => [k, C.riderMode(k)])) };
  S.runningIdle = C.running() ?? null;

  // ── the scratch fighter: one create per item (Foundry 14 batch order) ────────
  npc = await Actor.create({ name: "ZZ Golden Combat Fighter", type: "npc",
    system: { abilities: { str: { value: 16 }, dex: { value: 14 } }, details: { cr: 2 } } });
  tag(npc.id, "npc");
  const attack = (ability, value) => { const id = foundry.utils.randomID(); return { [id]: { _id: id, type: "attack", name: "", ability,
    attack: { type: { value, classification: "weapon" } }, damage: { includeBase: true, parts: [] } } }; };
  const weapon = (name, extra) => ({ name, type: "weapon", img: "icons/svg/sword.svg", system: { equipped: true, proficient: 1, ...extra } });
  const made = {};
  for (const [label, data] of [
    ["longsword", weapon("ZZ Longsword", { type: { value: "martialM", baseItem: "longsword" }, properties: ["ver"],
      damage: { base: { number: 1, denomination: 8, types: ["slashing"] }, versatile: { number: 1, denomination: 10, types: ["slashing"] } },
      activities: attack("str", "melee") })],
    ["daggers", weapon("ZZ Dagger", { type: { value: "simpleM", baseItem: "dagger" }, properties: ["fin", "lgt", "thr"], quantity: 2,
      damage: { base: { number: 1, denomination: 4, types: ["piercing"] } }, range: { value: 20, long: 60, units: "ft" },
      activities: attack("dex", "melee") })],
    ["torch", { name: "ZZ Torch", type: "consumable", system: { activities: attack("str", "melee") } }]
  ]) {
    const [doc] = await npc.createEmbeddedDocuments("Item", [data]);
    made[label] = doc; tag(doc.id, label);
    for (const a of doc.system.activities?.contents ?? []) tag(a.id, `${label}Attack`);
  }
  const [ma] = await npc.createEmbeddedDocuments("Item", [{ name: "Multiattack", type: "feat", system: { type: { value: "monster" },
    description: { value: `<p>The fighter makes three attacks, using [[/item .${made.longsword.id}]] or [[/item .${made.daggers.id}]] in any combination.</p>` } } }]);
  tag(ma.id, "multiattack");

  // ── reads ────────────────────────────────────────────────────────────────────
  S.weapons = plain(await probe(() => C.weapons(npc)));
  S.count = {
    default: await probe(() => C.count(npc)),
    longsword: await probe(() => C.count(npc, made.longsword.id)),
    daggers: await probe(() => C.count(npc, made.daggers.id)),
    torch: await probe(() => C.count(npc, made.torch.id))
  };
  S.multiattack = plain(await probe(() => C.multiattack(npc)));
  S.multiattackNull = await probe(() => C.multiattack(null)) ?? "null";
  S.plan = plain(await probe(() => C.plan(npc)));
  S.planDaggers = plain(await probe(() => C.plan(npc, made.daggers.id)));
  S.turnFresh = plain(await probe(() => C.turn(npc)));
  S.reckless = await probe(() => C.reckless(npc));
  S.fixFeats = plain(await probe(() => C.fixFeats(npc)));
  S.fixFeatsApply = plain(await probe(() => C.fixFeats(npc, { apply: true })));
  S.report = plain(await quiet(() => probe(() => C.report(npc))));
  S.seedWeaponSets = plain(await quiet(() => probe(() => C.seedWeaponSets(npc))));

  // ── the one write: a fresh out-of-combat turn (flags.pentaryn-combat.turn, replaced) ──
  const nt = await probe(() => C.newTurn(npc));
  S.newTurn = nt?.threw ? nt : { returnsActor: nt?.id === npc.id || nt === npc };
  await sleep(100);
  S.turnAfterNewTurn = plain(await probe(() => C.turn(npc)));
  S.turnFlag = plain(npc.getFlag(MOD, "turn") ?? null);
  S.runningAfter = C.running() ?? null;

  // ── declared: D-c2 refs, the after-only rows ─────────────────────────────────
  D.refs = {
    planNoActor: plain(await probe(() => C.plan())) ?? "null",
    planByName: plain(await probe(() => C.plan(npc.name))),
    planByUuid: plain(await probe(() => C.plan(npc.uuid))),
    countByName: await probe(() => C.count(npc.name)),
    turnByName: plain(await probe(() => C.turn(npc.name))),
    weaponsByName: plain(await probe(() => C.weapons(npc.name)))?.length ?? null,
    multiattackMiss: plain(await probe(() => C.multiattack("ZZ no such combat actor zzz"))) ?? "null"
  };
  D.inspect = typeof C.inspect === "function" ? plain(await probe(() => C.inspect(npc))) : "absent";
  D.inspectMiss = typeof C.inspect === "function" ? await probe(() => C.inspect("ZZ no such combat actor zzz")) : "absent";
  D.coversMultiattack = typeof C.coversMultiattack === "function" ? await probe(() => C.coversMultiattack(npc)) ?? "null" : "absent";
  D.selftest = typeof C.selftest === "function" ? plain(await probe(() => C.selftest())) : "absent";

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.weapons = await timeIt(() => C.weapons(npc), 9, 200);
  out.timings.count = await timeIt(() => C.count(npc), 9, 200);
  out.timings.multiattack = await timeIt(() => C.multiattack(npc), 9, 200);
  out.timings.plan = await timeIt(() => C.plan(npc), 9, 100);
  out.timings.turn = await timeIt(() => C.turn(npc), 9, 500);
} catch (e) {
  if (!e?.skip) S.error = caught(e);
} finally {
  if (npc && game.actors.get(npc.id)) await safely("npc", () => npc.delete());
  await sleep(100);
  Object.assign(out.cleanup, {
    zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length,
    zzMessagesLeft: game.messages.filter(m => (m.speaker?.alias ?? "").startsWith("ZZ ")).length,
    settingsRestored: JSON.stringify(Object.fromEntries(SETTING_KEYS().map(k => [k, rawSetting(k)]))) === JSON.stringify(settingsBefore),
    userFlagsRestored: JSON.stringify(game.user.flags?.[MOD] ?? null) === userFlagsBefore
  });
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
