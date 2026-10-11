// Live golden — pentaryn-attunement (`game.pentaryn.attunement`). Body of an async function for the
// foundry `eval-js` MCP tool (paste the file as `script`, timeoutMs 60000). GM client only, and
// ONE GM tab (the bridge tab): with a second GM tab open the coin purse's way home pays twice
// (W2-A1, open). Returns a JSON string of { module, env, golden: { shared, declared }, timings, cleanup }:
//   - `golden.shared`: behaviour the deployed 0.2.1 code ("before") and the wave-2 code ("after")
//     both have: slots, report, stash (tags, bonds, merged stacks, the coin purse, away list and
//     the slot the away item keeps), an item coming home (name, attuned, equipped and its slot
//     restored, bond cleared), the purse paying back and deleting itself, releaseAway.
//   - `golden.declared`: D-A1 (kit surface, `module.api`, frozen; computeSlots/away take an id —
//     "before" throws on an id), stash's `{detail}` (items-journal-16), D-A4 (stash of unknown ids).
// The owner is a ZZ **npc**, not a character, on purpose: pentaryn-dropbin records every item
// deleted off a *character* into its ledger, and stash deletes the owner's items. The container is
// a second ZZ npc (not an Item Piles pile). Both are deleted at the end; random bond keys are
// normalised to <key:item name>.
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
/** Live only: poll until pred() holds or ms passes (the bond's way home runs from createItem, unawaited). */
const settle = async (pred, ms = 3000) => {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) { if (pred()) return true; await tick(); }
  return !!pred();
};

const MOD = "pentaryn-attunement";
const out = { module: "attunement", env: {}, golden: { shared: {}, declared: {} }, timings: {}, cleanup: {} };
const A = game.pentaryn?.attunement;
const mod = game.modules.get(MOD);
out.env = {
  world: game.world.id, foundry: game.version, system: `${game.system.id} ${game.system.version}`,
  manifestVersion: mod?.version ?? null, active: !!mod?.active, apiVersion: A?.version ?? null,
  itemPiles: !!game.modules.get("item-piles")?.active
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

/** Tag every random bond key by the item it belongs to, so goldens compare across runs. */
const tagKeys = (...actors) => {
  for (const a of actors) for (const i of a.items) {
    const b = i.flags?.[MOD]?.bond;
    if (b?.key) tag(b.key, `key:${b.name ?? i.name}`);
  }
};
const flagsOf = a => ({ slots: a.flags?.[MOD]?.slots ?? null, away: (a.flags?.[MOD]?.away ?? []).map(x => ({ key: x.key, name: x.name })) });
const itemsOf = a => a.items.map(i => ({
  id: i.id, name: i.name, type: i.type, qty: i.system?.quantity ?? null, attuned: !!i.system?.attuned,
  equipped: i.system?.equipped ?? null, attunement: i.system?.attunement ?? null,
  bond: i.flags?.[MOD]?.bond ? { ...i.flags[MOD].bond } : null
})).sort((x, y) => x.name.localeCompare(y.name) || (x.qty ?? 0) - (y.qty ?? 0));
const reportOut = r => (r && typeof r === "object" && !r.threw) ? { ...r } : r ?? null;

let owner = null, chest = null, stranger = null;
try {
  if (!A) throw new Error("game.pentaryn.attunement is missing");

  // ── surface ──────────────────────────────────────────────────────────────────
  const LEGACY = ["report", "computeSlots", "stash", "releaseAway", "away"];
  S.legacySurface = Object.fromEntries(LEGACY.map(k => [k, typeof A[k]]));
  D.surface = { keys: keysOf(A), moduleApi: typeof mod?.api, frozen: Object.isFrozen(A), contract: A.contract ?? null };

  // ── scratch actors ───────────────────────────────────────────────────────────
  owner = await Actor.create({ name: "ZZ Golden Attunement Owner", type: "npc", system: { currency: { gp: 12, sp: 3 } } });
  chest = await Actor.create({ name: "ZZ Golden Attunement Chest", type: "npc" });
  stranger = await Actor.create({ name: "ZZ Golden Attunement Stranger", type: "npc" });
  tag(owner.id, "owner"); tag(chest.id, "chest"); tag(stranger.id, "stranger");
  const magic = (name, kind, extra = {}) => ({ name, type: "equipment", img: "icons/svg/item-bag.svg",
    system: { type: { value: kind }, attunement: "required", attuned: true, equipped: true, properties: ["mgc"], quantity: 1, ...extra } });
  // one create per item: a batch create comes back (and lands in actor.items) in no fixed order on
  // Foundry 14, which made the destructure below pick the wrong item on some runs
  const made = [];
  for (const data of [
    magic("ZZ Ring of Golden Test", "ring"),
    magic("ZZ Trinket of Golden Test", "trinket"),
    magic("ZZ Unattuned Charm", "trinket", { attuned: false, equipped: false }),
    { name: "ZZ Torch", type: "loot", system: { quantity: 2 } },
    { name: "ZZ Torch", type: "loot", system: { quantity: 3 } }
  ]) made.push(...await owner.createEmbeddedDocuments("Item", [data]));
  const [ring, trinket, charm, torch1, torch2] = made;
  for (const [i, l] of [[ring, "ring"], [trinket, "trinket"], [charm, "charm"], [torch1, "torch1"], [torch2, "torch2"]]) tag(i.id, l);
  S.created = { items: itemsOf(owner), toasts: takeToasts() };

  // a stored slot order with the trinket first, then reconciled
  await owner.setFlag(MOD, "slots", [trinket.id, null, ring.id]);
  S.slotsStored = await probe(() => A.computeSlots(owner));
  S.report = reportOut(await probe(() => A.report(owner)));
  S.reportByName = reportOut(await probe(() => A.report(owner.name)));
  S.reportById = reportOut(await probe(() => A.report(owner.id)));
  S.awayEmpty = await probe(() => A.away(owner));
  S.awayNull = await probe(() => A.away(null));

  // ── stash: the ring (attuned), both torch stacks (merged), the coin ──────────
  takeToasts();
  const stashed = await probe(() => A.stash(owner, chest, [ring.id, torch1.id, torch2.id], { tag: "Golden", currency: true }));
  tagKeys(chest);
  S.stash = {
    returned: stashed,
    owner: itemsOf(owner), ownerFlags: flagsOf(owner), ownerCurrency: { ...owner.system.currency },
    chest: itemsOf(chest).map(i => ({ ...i, id: undefined })),
    slots: await probe(() => A.computeSlots(owner)),
    away: await probe(() => A.away(owner)),
    toasts: takeToasts()
  };

  // ── the ring comes home (a Take: created on the owner, deleted from the chest) ──
  const chestRing = chest.items.find(i => i.name.startsWith("ZZ Ring"));
  const ringData = chestRing.toObject(); delete ringData._id;
  const [home] = await owner.createEmbeddedDocuments("Item", [ringData]);
  tag(home.id, "ringHome");
  await chestRing.delete();
  await settle(() => (owner.flags?.[MOD]?.away ?? []).length === 0 && !owner.items.get(home.id)?.flags?.[MOD]?.bond);
  await sleep(100);
  S.ringHome = {
    item: itemsOf(owner).find(i => i.id === home.id) ?? null, ownerFlags: flagsOf(owner),
    slots: await probe(() => A.computeSlots(owner)), toasts: takeToasts()
  };

  // ── the purse comes home: the coin is paid back and the purse deletes itself ──
  const chestPurse = chest.items.find(i => i.flags?.[MOD]?.bond?.currency);
  if (chestPurse) {
    const purseData = chestPurse.toObject(); delete purseData._id;
    const [p] = await owner.createEmbeddedDocuments("Item", [purseData]);
    tag(p.id, "purseHome");
    await chestPurse.delete();
    await settle(() => !owner.items.get(p.id) && (owner.system.currency?.gp ?? 0) > 0);
    await sleep(100);
    S.purseHome = { purseLeft: !!owner.items.get(p.id), ownerCurrency: { ...owner.system.currency }, toasts: takeToasts() };
  } else S.purseHome = "no purse in the chest";

  // ── an away item handed to someone else keeps its bond; the owner then releases it ──
  await probe(() => A.stash(owner, chest, [trinket.id], { tag: "Golden" }));
  tagKeys(chest);
  const chestTrinket = chest.items.find(i => i.name.startsWith("ZZ Trinket"));
  const tData = chestTrinket.toObject(); delete tData._id;
  const [given] = await stranger.createEmbeddedDocuments("Item", [tData]);
  tag(given.id, "trinketGiven");
  await sleep(150);
  const awayKey = (owner.flags?.[MOD]?.away ?? [])[0]?.key ?? null;
  S.handedOver = { stranger: itemsOf(stranger), ownerAway: flagsOf(owner).away, toasts: takeToasts() };
  if (awayKey) await probe(() => A.releaseAway(owner, awayKey));
  S.released = { ownerFlags: flagsOf(owner), slots: await probe(() => A.computeSlots(owner)), toasts: takeToasts() };
  S.releaseUnknown = await probe(async () => { await A.releaseAway(owner, "zz-no-such-key"); return flagsOf(owner).away; });

  // ── declared ─────────────────────────────────────────────────────────────────
  D.computeSlotsById = await probe(() => A.computeSlots(owner.id));
  D.awayById = await probe(() => A.away(owner.id));
  D.stashUnknownIds = await probe(() => A.stash(owner, chest, ["zzNoSuchItem0000"], { tag: "Golden" }));
  D.stashDetail = await probe(async () => {
    const r = await A.stash(owner, chest, [charm.id], { tag: "Golden", detail: true });
    tagKeys(chest);
    return r;
  });
  D.toasts = takeToasts();

  // ── timings ──────────────────────────────────────────────────────────────────
  out.timings.computeSlots = await timeIt(() => A.computeSlots(owner), 9, 200);
  out.timings.away = await timeIt(() => A.away(owner), 9, 500);
  const quiet = console.table, quietLog = console.log;
  try {
    console.table = () => {}; console.log = () => {};
    out.timings.report = await timeIt(() => A.report(owner), 9, 50);
  } finally { console.table = quiet; console.log = quietLog; }
} catch (e) {
  S.error = caught(e);
} finally {
  for (const [lvl, s] of Object.entries(spied)) { if (s.own) notes[lvl] = s.fn; else delete notes[lvl]; }
  for (const a of [owner, chest, stranger]) if (a && game.actors.get(a.id)) await a.delete();
  out.cleanup = {
    toastsRestored: ["info", "warn", "error"].every(l => ui.notifications[l] === spied[l].fn),
    zzActorsLeft: game.actors.filter(a => a.name.startsWith("ZZ ")).length
  };
}
out.golden = norm(out.golden);
// a string, not the object: the eval bridge truncates nested results at a fixed depth
return JSON.stringify(out);
