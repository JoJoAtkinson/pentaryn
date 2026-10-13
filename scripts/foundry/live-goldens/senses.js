// Live golden — pentaryn-senses (`game.pentaryn.senses`, alias `game.pentaryn.chain`). Body of an
// async function for the foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000 — the eval-js cap).
// GM client only, ONE GM tab (the Light reconcile runs on every tab of the active GM user: two
// tabs make two squares — wave-3 report, Open for Joe), no player connected (toggle() posts a chat
// line; the run deletes it). Needs this tab to be the active GM; otherwise returns { skipped }.
// Returns a JSON string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.4.1 code ("before") and the wave-3 code ("after")
//     both have: carried lights (a shard always, a torch while lit, the brightest wins, a hand-set
//     light kept as the prior and given back), the Light cantrip on a token and on a square and
//     ended (the token's own light restored, the square's AmbientLight removed), chains between
//     two token documents on a non-viewed scene, and the pure profile/carried-light rules.
//   - `golden.declared`: S-1/S-2 (kit surface, `module.api`, frozen, the `chain` alias identity,
//     `chain.uninstall` / `light.uninstall` gone), S-6 (`light.reconcile()` resolves to a summary,
//     before `undefined`), S-8 (`chain.link` with a Token uuid: before `false`, after `true`), and
//     the after-only reads (`inspect`, `light.status`, `light.recent`).
// Never called (world-wide writes): syncAll, setupLight / light.setup, light.sweep, resetSight. Never
// called (UI): light.pick, light.prompt, light.onMe (needs the viewed scene).
// What it exercises: a ZZ scratch scene (padding 0, grid 100, never viewed) with a linked ZZ npc
// "carrier" (its token hand-lit 2/4) and a ZZ npc "target" token (hand-lit 3/6). The carrier gets a
// shard (flags.pentaryn-senses.light 5/10) and a Torch (loot; no activities, so the createItem
// hook adds none), toggled lit and doused; then the shard is deleted. The carrier gets a Light
// cantrip (spell, identifier light) cast on the target token, then on a square, then ended. The
// module's own item/actor hooks do the writes (250 ms timers, waited for with a MessageChannel
// poll, J20); each step then calls the module once more and expects nothing left to do.
// Foundry 14.369 (merge-and-go-live §6): one throwaway world-flag update per token first.
// Chat lines posted for the ZZ actors are deleted; the scene and the actors are deleted.
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
/** Tag the AmbientLight ids a Light answer names: they are random per run, so without this a
 * before-vs-before self-diff shows 2 declared differences (W4L). `status.litBy[]` holds
 * `{kind, scene, id}`, `inspect.lightSpells[].litBy[]` holds "Scene.<id>.AmbientLight.<id>" uuids;
 * the token and scene ids in them are tagged already, so only an id not yet known is labelled. */
const tagLitBy = (status, inspect) => {
  const idsIn = [...(Array.isArray(status?.litBy) ? status.litBy : []).map(l => l?.id),
    ...(Array.isArray(inspect?.lightSpells) ? inspect.lightSpells : []).flatMap(s => (Array.isArray(s?.litBy) ? s.litBy : []).map(u => String(u).split(".").at(-1)))];
  let n = 0;
  for (const id of idsIn) if (id && !ids.has(id)) tag(id, `lit-${n++}`);
};
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
/** Poll until pred() holds or ms passes; then a quiet 1.2 s so a trailing debounced sync lands too. */
const settle = async (pred, ms = 8000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) { await sleep(1200); return true; } await tick(); }
  return !!pred();
};

const MOD = "pentaryn-senses";
const TOP = ["syncLight", "carriedLight", "resetSight", "light", "setupLight", "syncAll"];
const LIGHT = ["cast", "end", "pick", "toggle", "hood", "profileFor", "sweep", "setup", "onMe", "prompt", "reconcile"];
const CHAIN = ["link", "break", "links", "repaint"];

const out = { module: "senses", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const SN = game.pentaryn?.senses;
const CH = game.pentaryn?.chain;
const mod = game.modules.get(MOD);
const writer = game.users.activeGM?.isSelf === true;
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: SN?.version ?? null,
  players: game.users.filter(u => !u.isGM && u.active).map(u => u.name), writer
};
if (!SN || !writer) {
  out.skipped = !SN ? "game.pentaryn.senses is missing" : "this tab is not the active GM";
  return JSON.stringify(out);
}
const S = out.golden.shared, D = out.golden.declared;
const L = SN.light;
const pickLight = l => ({ bright: l?.bright ?? null, dim: l?.dim ?? null, color: l?.color == null ? null : String(l.color), animation: l?.animation?.type ?? null });
const live = t => t?.parent?.tokens?.get(t.id) ?? null;
const tokState = t => {
  const d = live(t), f = d?.flags?.[MOD] ?? {};
  return { light: pickLight(d?.light), itemLight: f.itemLight ?? "unset", prior: f.itemLightPrior ? pickLight(f.itemLightPrior) : null,
    spellLight: f.spellLight ? { source: f.spellLight.source ?? null, prior: f.spellLight.prior ? pickLight(f.spellLight.prior) : null } : null };
};
const msgsBefore = new Set(game.messages.map(m => m.id));
let scene = null, carrier = null, target = null;
try {
  // ── surface ──────────────────────────────────────────────────────────────────
  S.legacySurface = {
    top: Object.fromEntries(TOP.map(k => [k, typeof SN[k]])),
    light: Object.fromEntries(LIGHT.map(k => [k, typeof L?.[k]])),
    chain: Object.fromEntries(CHAIN.map(k => [k, typeof CH?.[k]])),
    SPELL_LIGHT: L?.SPELL_LIGHT ?? null, PHB_LIGHT_ACTOR: L?.PHB_LIGHT_ACTOR ?? null
  };
  let described = "absent";
  if (typeof SN.describe === "function") { const d = SN.describe(); described = { namespace: d.namespace, paths: (d.methods ?? []).map(m => m.path).sort() }; }
  D.surface = {
    keys: keysOf(SN), lightKeys: keysOf(L), chainKeys: keysOf(CH), moduleApi: mod?.api === SN ? "same" : typeof mod?.api,
    frozen: Object.isFrozen(SN), chainFrozen: Object.isFrozen(CH), contract: SN.contract ?? null, describe: described,
    sensesChainIsChain: SN.chain === undefined ? "no senses.chain" : SN.chain === CH,
    chainUninstall: typeof CH?.uninstall, lightUninstall: typeof L?.uninstall,
    setupLightIsLightSetup: SN.setupLight === L?.setup                    // the kit wraps each row: identity may differ
  };

  // ── pure rules over plain objects ────────────────────────────────────────────
  const item = (name, o = {}) => ({ name, type: "loot", system: { quantity: 1, ...(o.system ?? {}) }, flags: o.flags ?? {} });
  const F = f => ({ flags: { [MOD]: f } });
  S.profileFor = ["Torch", "Torches", "Candle", "Oil Lamp", "Lantern, Hooded", "Bullseye Lantern", "Rope"].map(n => L.profileFor(item(n)))
    .concat([L.profileFor({ name: "Light", type: "spell" }), L.profileFor(item("Glowstone", F({ lightItem: { bright: 1, dim: 2 } }))), L.profileFor(null)]);
  S.carriedLight = [
    [item("Torch")], [item("Torch", F({ lit: true }))], [item("Lantern, Hooded", F({ lit: true, hooded: true }))],
    [item("Shard", F({ light: { bright: 5, dim: 10 } })), item("Torch", F({ lit: true }))],
    [item("Shard", { ...F({ light: { bright: 5, dim: 10 } }), system: { quantity: 0 } })], []
  ].map(items => SN.carriedLight({ items }));

  // ── scratch scene, carrier and target ────────────────────────────────────────
  scene = await Scene.create({ name: "ZZ live-goldens senses", width: 1200, height: 1000, padding: 0, grid: { size: 100 } });
  tag(scene.id, "scene");
  carrier = await Actor.create({ name: "ZZ Golden Senses Carrier", type: "npc", prototypeToken: { actorLink: true } });
  target = await Actor.create({ name: "ZZ Golden Senses Target", type: "npc" });
  tag(carrier.id, "carrier"); tag(target.id, "target");
  const mkToken = async (a, label, x, y, light) => {
    const data = (await a.getTokenDocument({ x, y })).toObject();
    delete data._id;
    const [t] = await scene.createEmbeddedDocuments("Token", [foundry.utils.mergeObject(data, { name: `ZZ ${label}`, x, y, light })]);
    tag(t.id, `tok-${label}`);
    await t.update({ "flags.world.zzWarm": 1 });                         // 14.369: first change on a new scene
    return t;
  };
  const cTok = await mkToken(carrier, "carrier", 200, 200, { bright: 2, dim: 4 });
  const tTok = await mkToken(target, "target", 600, 200, { bright: 3, dim: 6 });
  await sleep(1200);                                                      // createToken's carried sync (nothing to carry)
  S.start = { carrier: tokState(cTok), target: tokState(tTok), syncLight: await probe(() => SN.syncLight(carrier)) };

  // ── carried lights ───────────────────────────────────────────────────────────
  const [shard] = await carrier.createEmbeddedDocuments("Item", [{ name: "ZZ Golden Shard", type: "loot", flags: { [MOD]: { light: { bright: 5, dim: 10, color: "#88ccff" } } } }]);
  tag(shard.id, "shard");
  S.shardSettled = await settle(() => live(cTok)?.flags?.[MOD]?.itemLight === true);
  S.withShard = { token: tokState(cTok), proto: pickLight(carrier.prototypeToken.light), carried: SN.carriedLight(carrier), syncLight: await probe(() => SN.syncLight(carrier)) };
  const [torch] = await carrier.createEmbeddedDocuments("Item", [{ name: "Torch", type: "loot", system: { quantity: 1 } }]);
  tag(torch.id, "torch");
  await sleep(1200);
  S.torchUnlit = { token: tokState(cTok), profile: L.profileFor(torch) };
  S.toggleOn = await probe(() => L.toggle(carrier.items.get(torch.id)));
  S.torchSettled = await settle(() => live(cTok)?.light?.dim === 40);
  S.withTorch = { token: tokState(cTok), lit: carrier.items.get(torch.id)?.flags?.[MOD]?.lit ?? null, carried: SN.carriedLight(carrier), syncLight: await probe(() => SN.syncLight(carrier)) };
  S.toggleOff = await probe(() => L.toggle(carrier.items.get(torch.id)));
  S.dousedSettled = await settle(() => live(cTok)?.light?.dim === 10);
  S.torchDoused = { token: tokState(cTok), flags: keysOf(carrier.items.get(torch.id)?.flags?.[MOD]).map(k => [k, carrier.items.get(torch.id).flags[MOD][k]]) };
  await shard.delete();
  S.shardGoneSettled = await settle(() => live(cTok)?.flags?.[MOD]?.itemLight === false);
  S.shardGone = { token: tokState(cTok), proto: pickLight(carrier.prototypeToken.light), carried: SN.carriedLight(carrier), syncLight: await probe(() => SN.syncLight(carrier)) };

  // ── the Light cantrip: on a token, on a square, ended ────────────────────────
  const [spell] = await carrier.createEmbeddedDocuments("Item", [{ name: "ZZ Golden Light", type: "spell", system: { identifier: "light", level: 0 } }]);
  tag(spell.id, "spell");
  const spellNow = () => carrier.items.get(spell.id);
  const lights = () => scene.lights.contents.map(l => ({ x: l.x, y: l.y, light: pickLight(l.config), source: l.flags?.[MOD]?.spellLight?.source ?? null }));
  S.castOnToken = await probe(() => L.cast(spellNow(), { scene: scene.id, token: tTok.id }));
  D.reconcileOnToken = await probe(() => L.reconcile(spellNow().uuid)) ?? "undefined";
  S.onTokenSettled = await settle(() => !!live(tTok)?.flags?.[MOD]?.spellLight);
  S.onToken = { target: tokState(tTok), cast: spellNow()?.flags?.[MOD]?.lightCast ?? null, lights: lights() };
  S.castOnSquare = await probe(() => L.cast(spellNow(), { scene: scene.id, x: 900, y: 700 }));
  D.reconcileOnSquare = await probe(() => L.reconcile(spellNow().uuid)) ?? "undefined";
  S.onSquareSettled = await settle(() => scene.lights.size === 1 && !live(tTok)?.flags?.[MOD]?.spellLight);
  S.onSquare = { target: tokState(tTok), cast: spellNow()?.flags?.[MOD]?.lightCast ?? null, lights: lights() };
  if (typeof L.status === "function") {
    D.lightStatus = await probe(() => L.status(spellNow()));
    D.inspectTarget = await probe(() => SN.inspect(live(tTok)));
    D.inspectCarrier = await probe(() => SN.inspect(live(cTok)));
    tagLitBy(D.lightStatus, D.inspectCarrier);
  } else D.lightStatus = "absent";
  S.end = await probe(() => L.end(spellNow()));
  D.reconcileEnd = await probe(() => L.reconcile(spellNow().uuid)) ?? "undefined";
  S.endedSettled = await settle(() => scene.lights.size === 0);
  S.ended = { target: tokState(tTok), cast: spellNow()?.flags?.[MOD]?.lightCast ?? null, lights: lights() };
  S.endAgain = await probe(() => L.end(spellNow()));
  if (typeof L.recent === "function") { const r = await probe(() => L.recent()); D.recent = Array.isArray(r) ? { isArray: true, last: r.at(-1) ?? null } : r; }

  // ── chains (token documents on a non-viewed scene) ───────────────────────────
  S.chain = {
    linkSelf: await probe(() => CH.link(live(cTok), live(cTok))),
    link: await probe(() => CH.link(live(tTok), live(cTok))),
    flag: live(tTok)?.flags?.[MOD]?.chain ?? null,
    links: await probe(() => CH.links(scene)),
    breakAnchor: await probe(() => CH.break(live(cTok)))
  };
  S.chain.linksAfterBreak = await probe(() => CH.links(scene));
  S.chain.flagAfterBreak = live(tTok)?.flags?.[MOD]?.chain ?? null;
  D.linkByUuid = await probe(() => CH.link(live(tTok).uuid, live(cTok)));
  D.linksAfterUuid = await probe(() => CH.links(scene));
  D.breakAfterUuid = await probe(() => CH.break(live(tTok)));

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.carriedLight = await timeIt(() => SN.carriedLight(carrier), 9, 200);
  out.timings.profileFor = await timeIt(() => L.profileFor(torch), 9, 500);
  out.timings.chainLinks = await timeIt(() => CH.links(scene), 9, 200);
  out.timings.syncLightConverged = await timeIt(() => SN.syncLight(carrier), 9, 5);
} catch (e) {
  S.error = caught(e);
} finally {
  await sleep(1500);                                                      // trailing carried-light / reconcile timers
  const zzActors = new Set([carrier?.id, target?.id].filter(Boolean));
  const chatIds = game.messages.filter(m => !msgsBefore.has(m.id) && zzActors.has(m.speaker?.actor)).map(m => m.id);
  out.cleanup.chatDeleted = chatIds.length;
  if (chatIds.length) await safely("chat", () => ChatMessage.deleteDocuments(chatIds));
  if (scene && game.scenes.get(scene.id)) await safely("scene", () => scene.delete());
  const actorIds = [carrier, target].filter(a => a && game.actors.get(a.id)).map(a => a.id);
  if (actorIds.length) await safely("actors", () => Actor.deleteDocuments(actorIds));
  out.cleanup.zzLeft = game.actors.filter(a => a.name.startsWith("ZZ ")).length + game.scenes.filter(s => s.name.startsWith("ZZ ")).length;
  out.cleanup.zzMessagesLeft = game.messages.filter(m => !msgsBefore.has(m.id) && zzActors.has(m.speaker?.actor)).length;
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
