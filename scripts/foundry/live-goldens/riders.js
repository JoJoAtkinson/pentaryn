// Live golden — pentaryn-riders (`game.pentaryn.riders`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, ONE GM
// tab, no player connected. Returns a JSON string of
// { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.2.0 code ("before", one `riders.mjs`) and the wave-4
//     code ("after", the blueprint split) both have, called with Documents (the legacy calling
//     convention): the rules table, preview() oracles, featuresOf / report on a scratch caster
//     (typed rules with and without a type, a hand-added WIS spell, Healer), setType, retireManual
//     deleting a hand "+CHA" activity, installBattleMedic (create, then update), Hit Dice pools and
//     a spend / restore round trip, the Battle Medic relay registered. A difference is a regression
//     until explained.
//   - `golden.declared`: S6 (kit surface, `module.api`, frozen, contract, describe rows and patches),
//     W2-K1 (publishNamespace), -12 / D-r3 (legacy rows resolve a name, id or uuid; a miss answers
//     null — before, a string runs as an actor with no items: `[]`), the parseFormula `@` argument
//     fix (`preview("1d8x@mod=8")`), the METAMAGIC Set no longer reachable mutable, and the
//     after-only rows inspect() and selftest().
// What it never does: Battle Medic itself (it needs a target, a chat roll and possibly the relay;
// live check 3/4 in the wave-4 live plan), arcaneRecovery (a dialog), any chat message.
// The caster is a ZZ **npc**, not a character: pentaryn-dropbin records items deleted off a
// character, and retireManual deletes an activity. It is deleted at the end.
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
const probe = async fn => { try { return await fn(); } catch (e) { return caught(e); } };
const keysOf = o => Object.keys(o ?? {}).sort();
/** One macrotask through a MessageChannel: unlike setTimeout it is not throttled in a hidden tab (J20). */
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => { c.port1.close(); r(); }; c.port2.postMessage(0); });
/** Wait ms of wall time, yielding with tick() (a hidden tab clamps setTimeout to 1 s or more). */
const sleep = async ms => { const t0 = performance.now(); while (performance.now() - t0 < ms) await tick(); };

const MOD = "pentaryn-riders";
const LEGACY = ["featuresOf", "report", "setType", "retireManual", "installBattleMedic", "battleMedic", "spendHitDie", "restoreHitDie", "hdPools", "preview"];
const ADDED = ["inspect", "selftest", "arcaneRecovery", "describe", "settings", "trace", "uninstall"];
const setting = k => { try { return game.settings.get(MOD, k); } catch { return "unregistered"; } };
const SETTING_KEYS = () => [...game.settings.settings.keys()].filter(k => k.startsWith(`${MOD}.`)).map(k => k.slice(MOD.length + 1)).sort();

const out = { module: "riders", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const R = game.pentaryn?.riders;
const mod = game.modules.get(MOD);
const settingsBefore = Object.fromEntries(SETTING_KEYS().map(k => [k, setting(k)]));
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: R?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name), settings: settingsBefore
};
const S = out.golden.shared, D = out.golden.declared;

// toasts, through a pass-through spy removed in `finally`
const toasts = [];
const notes = ui.notifications;
const spied = {};
for (const lvl of ["info", "warn", "error"]) {
  spied[lvl] = { fn: notes[lvl], own: Object.hasOwn(notes, lvl) };
  notes[lvl] = function (message, options) { toasts.push(`${lvl}: ${message}`); return spied[lvl].fn.call(this, message, options); };
}
const takeToasts = () => toasts.splice(0);
/** report() prints a console.table; keep the bridge tab's console quiet while it runs. */
const quiet = async fn => {
  const t = console.table, l = console.log;
  try { console.table = () => {}; console.log = () => {}; return await fn(); } finally { console.table = t; console.log = l; }
};
const feats = list => Array.isArray(list) ? list.map(f => ({ key: f.key, items: (f.items ?? []).map(i => i?.name ?? String(i)), types: f.types ?? null })) : list;
const activityNames = item => (item?.system?.activities?.contents ?? []).map(a => ({ type: a.type, name: a.name, flow: a.flags?.[MOD]?.flow ?? null })).sort((a, b) => a.name.localeCompare(b.name));

let caster = null;
try {
  if (!R) throw new Error("game.pentaryn.riders is missing");

  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof R[k]]));
  S.rules = (R.rules ?? []).map(r => ({ key: r.key, label: r.label, types: r.types ? [...r.types] : null, effect: { ...r.effect } }));
  S.relayRegistered = typeof CONFIG.queries?.[`${MOD}.battleMedic`];
  let described = "absent";
  if (typeof R.describe === "function") {
    const d = R.describe();
    described = { namespace: d.namespace, contract: d.contract, paths: (d.methods ?? []).map(m => m.path).sort(), patches: (d.patches ?? []).map(p => p.adjustments ?? p.label).sort(), queries: d.queries ?? null };
  }
  D.surface = {
    keys: keysOf(R), moduleApi: mod?.api === R ? "same" : typeof mod?.api, frozen: Object.isFrozen(R),
    rootFrozen: Object.isFrozen(game.pentaryn), contract: R.contract ?? null, describe: described,
    added: Object.fromEntries(ADDED.map(k => [k, typeof R[k]])),
    rulesFrozen: Object.isFrozen(R.rules), metamagicMutable: R.core?.METAMAGIC instanceof Set && !Object.isFrozen(R.core.METAMAGIC)
  };

  // ── preview(): the pure formula rewrite ──────────────────────────────────────
  const pv = (f, o) => { try { return R.preview(f, o); } catch (e) { return caught(e); } };
  S.preview = [
    pv("1d6[fire]", { rollType: "damage", types: ["fire"], modifier: "min2" }),
    pv("8d6", { rollType: "fire", types: ["fire"], modifier: "min2", bonus: { value: 4, label: "Elemental Affinity", type: "fire" } }),
    pv("2d8[cold] + 1d6[fire]", { rollType: "cold", types: ["fire"], modifier: "min2" }),
    pv("1d8 + 3", { rollType: "healing", modifier: "r1" }),
    pv("1d8 + (2d4[fire]) + @abilities.wis.mod", { rollType: "fire", modifier: "min2" }),
    pv("2d6min3 + 1d4rr1", { rollType: "fire", modifier: "min2" }),
    pv("1d4rr1", { rollType: "healing", modifier: "r1" }),
    pv("1d10", { rollType: "fire", bonus: { value: -1, label: "Potent Spellcasting", type: "fire" } })
  ];
  D.previewAtArgument = [pv("1d8x@mod=8", { rollType: "force", modifier: "min2" }), pv("1d8x@mod=8 + 2d6", { rollType: "force", modifier: "min2" })];

  // ── the scratch caster (one create per item: Foundry 14 batch order) ─────────
  caster = await Actor.create({ name: "ZZ Golden Riders Caster", type: "npc",
    system: { abilities: { cha: { value: 16 }, wis: { value: 14 } }, attributes: { hp: { value: 10, max: 30, formula: "4d8+12" } }, details: { cr: 2 } } });
  tag(caster.id, "caster");
  const rid = () => foundry.utils.randomID();
  const feat = (name, extra = {}) => ({ name, type: "feat", img: "icons/svg/book.svg", system: { type: { value: "feat" }, ...extra } });
  const damageActivity = (name, bonus, types) => { const id = rid(); return { [id]: { _id: id, type: "damage", name, damage: { parts: [{ number: 1, denomination: 8, bonus, types }] } } }; };
  const made = {};
  for (const [label, data] of [
    ["adept", feat("Elemental Adept (Fire)")],
    ["affinity", feat("Elemental Affinity", { activities: damageActivity("ZZ +CHA Fire", "@abilities.cha.mod", ["fire"]) })],
    ["potent", feat("Elemental Fury: Potent Spellcasting")],
    ["healer", feat("Healer")],
    ["kit", { name: "ZZ Healer's Kit", type: "consumable", system: { uses: { max: "10", spent: 0 } } }],
    ["handSpell", { name: "ZZ Hand Thorn", type: "spell", system: { level: 0, activities: damageActivity("ZZ Thorn", "@abilities.wis.mod", ["piercing"]) } }]
  ]) {
    const [doc] = await caster.createEmbeddedDocuments("Item", [data]);
    made[label] = doc; tag(doc.id, label);
    for (const a of doc.system.activities?.contents ?? []) tag(a.id, `${label}Activity`);
  }
  S.created = { items: caster.items.map(i => i.name).sort(), toasts: takeToasts() };

  S.featuresOf = feats(await probe(() => R.featuresOf(caster)));
  S.report = await quiet(() => probe(() => R.report(caster)));
  S.setTypeAffinity = await probe(() => R.setType(caster, "fire", "elemental-affinity"));
  S.setTypeItem = await probe(() => R.setType(made.adept, "COLD"));
  S.setTypeEmpty = await probe(() => R.setType(caster, ""));
  S.featuresAfterSetType = feats(await probe(() => R.featuresOf(caster)));
  S.retireManual = await probe(() => R.retireManual(caster));
  S.affinityActivitiesAfter = activityNames(caster.items.get(made.affinity.id));
  S.affinityFlag = caster.items.get(made.affinity.id)?.getFlag(MOD, "damageType") ?? null;
  S.installBattleMedic = await probe(() => R.installBattleMedic(caster));
  S.installAgain = await probe(() => R.installBattleMedic(caster, { replace: false }));
  S.healerActivities = activityNames(caster.items.get(made.healer.id));
  for (const a of caster.items.get(made.healer.id)?.system.activities?.contents ?? []) tag(a.id, "battleMedicActivity");
  S.reportAfter = await quiet(() => probe(() => R.report(caster)));
  S.installNoHealer = await probe(async () => {
    const other = await Actor.create({ name: "ZZ Golden Riders Bystander", type: "npc" });
    tag(other.id, "bystander");
    try { return await R.installBattleMedic(other); } finally { await other.delete(); }
  });

  // ── Hit Dice ─────────────────────────────────────────────────────────────────
  S.hdPools = await probe(() => R.hdPools(caster));
  S.spend = await probe(() => R.spendHitDie(caster));
  S.poolsAfterSpend = await probe(() => R.hdPools(caster));
  S.restore = await probe(() => R.restoreHitDie(caster));
  S.poolsAfterRestore = await probe(() => R.hdPools(caster));
  S.hdPoolsNull = await probe(() => R.hdPools(null));
  S.toasts = takeToasts();

  // ── declared: legacy refs (-12 / D-r3) and the after-only rows ───────────────
  D.legacyRefs = {
    featuresByName: feats(await probe(() => R.featuresOf(caster.name))),
    featuresById: feats(await probe(() => R.featuresOf(caster.id))),
    reportByName: await quiet(() => probe(() => R.report(caster.name))),
    reportMiss: await quiet(() => probe(() => R.report("ZZ no such riders actor zzz"))) ?? "null",
    hdPoolsByUuid: await probe(() => R.hdPools(caster.uuid))
  };
  D.inspect = typeof R.inspect === "function" ? await probe(() => R.inspect(caster)) : "absent";
  D.inspectMiss = typeof R.inspect === "function" ? await probe(() => R.inspect("ZZ no such riders actor zzz")) : "absent";
  D.selftest = typeof R.selftest === "function" ? await probe(() => R.selftest()) : "absent";
  D.toasts = takeToasts();

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.featuresOf = await timeIt(() => R.featuresOf(caster), 9, 200);
  out.timings.hdPools = await timeIt(() => R.hdPools(caster), 9, 500);
  out.timings.preview = await timeIt(() => R.preview("8d6[fire] + 1d4", { rollType: "fire", types: ["fire"], modifier: "min2" }), 9, 500);
  out.timings.report = await quiet(() => timeIt(() => R.report(caster), 9, 50));
} catch (e) {
  S.error = caught(e);
} finally {
  for (const [lvl, s] of Object.entries(spied)) { if (s.own) notes[lvl] = s.fn; else delete notes[lvl]; }
  if (caster && game.actors.get(caster.id)) await caster.delete();
  await sleep(100);
  out.cleanup = {
    toastsRestored: ["info", "warn", "error"].every(l => ui.notifications[l] === spied[l].fn),
    zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length,
    zzMessagesLeft: game.messages.filter(m => (m.speaker?.alias ?? "").startsWith("ZZ ")).length,
    settingsRestored: JSON.stringify(Object.fromEntries(SETTING_KEYS().map(k => [k, setting(k)]))) === JSON.stringify(settingsBefore)
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
