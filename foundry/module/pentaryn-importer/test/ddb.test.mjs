// DDB corrections — the glue: ddb-adapter.mjs (snapshot, lookups, batched writes, retype fallback,
// stamp) and ddb-corrections.mjs (the ddb-importer listener, the relay for a non-owner, the setting,
// the GM-ready sweep, one summary line per run that changed something, the API rows).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { installFoundry } from "./kit/foundry-stub.mjs";
import { manifestOf } from "./kit/harness.mjs";
import { DDB_DM, DDB_HB, DDB_MM, PHB_INDEX, SPELLS, fighter, liveActor, wizard } from "./fixtures/ddb.mjs";
import { applyPlan, lookupsFor, replacedSystem, snapshotOf, uuidKey } from "../ddb-adapter.mjs";
import { planCorrections } from "../ddb-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MODULE = "pentaryn-importer";
const HOOK = "ddb-importer.characterProcessDataComplete";
const ROOT = new URL("..", import.meta.url);
const manifest = manifestOf(ROOT);

const F = await installFoundry({
  user: { isGM: true, active: true },
  modules: [{ id: MODULE, version: manifest.version, flags: manifest.flags }],
});

/* the world: lookups, chat, a console that records */
globalThis.fromUuid = async uuid => (SPELLS[uuid] ? { name: SPELLS[uuid].name, _source: structuredClone(SPELLS[uuid]) } : null);
let packLookups = 0;
game.packs = new Map([["dnd-players-handbook.spells", { getIndex: async () => { packLookups++; return PHB_INDEX; } }]]);
const chat = [];
globalThis.getDocumentClass = name => (name === "ChatMessage" ? { create: async data => { chat.push(data); return data; } } : null);
const lines = [];
for (const k of ["log", "info", "warn", "error"]) console[k] = (...a) => lines.push([k, ...a.map(x => (x instanceof Error ? x.message : typeof x === "string" ? x : JSON.stringify(x)))]);

const actors = [];
function seed(...list) {
  actors.length = 0;
  actors.push(...list);
  game.actors = Object.assign(new Map(list.map(a => [a.id, a])), {
    contents: list,
    get: id => list.find(a => a.id === id),
    getName: n => list.find(a => a.name === n),
    find: fn => list.find(fn),
    filter: fn => list.filter(fn),
    [Symbol.iterator]: () => list.values(),
  });
}
seed();

await import("../pentaryn-importer.mjs");
F.fire("init");
F.fire("ready");
const api = game.modules.get(MODULE).api;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };
const reset = () => { lines.length = 0; chat.length = 0; };

/* adapter */

test("snapshotOf reads _source data, the importId and the stamp", () => {
  const a = liveActor(wizard({ importId: "imp9", stamp: { importId: "imp8" } }));
  const s = snapshotOf(a);
  assert.equal(s.ddb, true);
  assert.equal(s.importId, "imp9");
  assert.deepEqual(s.stamp, { importId: "imp8" });
  assert.equal(s.items.find(i => i._id === "fl1").system.method, "atwill");
  assert.equal(s.system.attributes.senses.ranges.darkvision, 60);
});

test("lookupsFor resolves the Cast spells and reads the PHB index once, only when needed", async () => {
  const before = packLookups;
  const l = await lookupsFor(snapshotOf(liveActor(wizard())));
  assert.deepEqual(Object.keys(l.spells).sort(), [DDB_DM, DDB_MM].sort());
  assert.equal(packLookups, before + 1);
  const none = await lookupsFor({ items: [] });
  assert.deepEqual(none, { spells: {}, phbSpells: null });
  assert.equal(packLookups, before + 1);
});

test("applyPlan batches the item updates into one call and stamps with the actor update", async () => {
  const a = liveActor(wizard());
  const snap = snapshotOf(a);
  const plan = planCorrections(snap, await lookupsFor(snap));
  const out = await applyPlan(a, plan, { importId: "imp1", at: 1, version: "1.2.0", changes: plan.changes.length });
  assert.deepEqual(out.errors, []);
  assert.equal(out.stamped, true);
  const ops = a.writes.map(w => w[0]);
  assert.deepEqual(ops, ["items.update", "dnd5e.cache.delete", "item.update", "item.update", "item.update", "item.update", "effects.create", "actor.update"]);
  assert.deepEqual(a.writes[0][1].map(u => u._id), ["fl1", "inv", "swa", "wand", "lens"]);
  assert.deepEqual(a.writes[1][1], ["dmCache"], "dnd5e removes the lens's old cached Detect Magic itself");
  assert.equal(ops.includes("items.delete"), false, "no delete of ours to race dnd5e's");
  assert.equal(a.items.has("dmCache"), false);
  const actorUpdate = a.writes.at(-1)[1];
  assert.equal(actorUpdate["system.attributes.senses.ranges.darkvision"], 0);
  assert.deepEqual(actorUpdate["flags.pentaryn-importer.ddbCorrections"].importId, "imp1");
  assert.equal(a.items.get("robe").type, "equipment");
  // and nothing is left to do
  const again = snapshotOf(a);
  assert.deepEqual(planCorrections(again, await lookupsFor(again)).changes, []);
});

test("review 2: a planned delete whose item another writer removed first is success, and the rest still go", async () => {
  const a = liveActor(wizard());
  const plan = { changes: [
    { op: "deleteItem", itemId: "notes", summary: "notes gone" },
    { op: "deleteItem", itemId: "oil", summary: "oil gone" },
  ] };
  const real = a.deleteEmbeddedDocuments;
  let first = true;
  a.deleteEmbeddedDocuments = async (kind, ids) => {
    if (first) {             // dnd5e (or another tab) deletes "notes" between our check and the server
      first = false;
      a.items.delete("notes");
    }
    return real(kind, ids);
  };
  const out = await applyPlan(a, plan, null);
  assert.deepEqual(out.errors, []);
  assert.deepEqual(out.applied, ["notes gone", "oil gone"]);
  assert.deepEqual(a.writes.filter(w => w[0] === "items.delete").map(w => w[1]), [["notes", "oil"], ["oil"]]);
  assert.equal(a.items.has("oil"), false);
  // any other refusal is still an error
  const b = liveActor(wizard());
  b.deleteEmbeddedDocuments = async () => { throw new Error("permission denied"); };
  const bad = await applyPlan(b, { changes: [{ op: "deleteItem", itemId: "oil", summary: "oil gone" }] }, null);
  assert.deepEqual(bad.errors, ["item deletes: permission denied"]);
});

test("review 2: snapshotOf keys uuids through Foundry's parseUuid (uuidKey), the raw uuid when it cannot", () => {
  const g = { foundry: { utils: { parseUuid: u => ({ uuid: u.replace("spells.phb", "spells.Item.phb") }) } } };
  assert.equal(uuidKey("Compendium.p.spells.phbX", { g }), "Compendium.p.spells.Item.phbX");
  assert.equal(uuidKey("Compendium.p.spells.phbX", { g: {} }), "Compendium.p.spells.phbX");
  assert.equal(uuidKey("x", { g: { foundry: { utils: { parseUuid: () => { throw new Error("no"); } } } } }), "x");
  assert.equal(uuidKey(null), null);
  const s = snapshotOf(liveActor(wizard()));
  const lens = s.items.find(i => i._id === "lens");
  assert.deepEqual(Object.keys(lens.castKeys), ["castDeMa"]);
  assert.equal(typeof s.items.find(i => i._id === "dmCache").sourceKey, "string");
});

test("a type change replaces system with core's ForcedReplacement operator, not the deprecated ==system", async () => {
  const a = liveActor(wizard());
  const snap = snapshotOf(a);
  await applyPlan(a, planCorrections(snap, await lookupsFor(snap)), null);
  const retypes = a.writes.filter(w => w[0] === "item.update");
  assert.equal(retypes.length, 4);
  for (const w of retypes) assert.deepEqual(w[3], ["type", "system"]);
  const FR = foundry.data.operators.ForcedReplacement;
  assert.ok(replacedSystem({ a: 1 }).system instanceof FR);
  assert.deepEqual(replacedSystem({ a: 1 }, { g: {} }), { "==system": { a: 1 } }, "a core without the operator");
  const created = [];
  class Real { static create(v) { created.push(v); return { real: v }; } }
  assert.deepEqual(replacedSystem({ b: 2 }, { g: { foundry: { data: { operators: { ForcedReplacement: Real } } } } }), { system: { real: { b: 2 } } });
  assert.deepEqual(created, [{ b: 2 }], "ForcedReplacement.create is preferred (v14 client: _replace)");
});

test("a refused type change falls back to recreating the item under the same id", async () => {
  const a = liveActor(wizard(), { failRetype: true });
  const snap = snapshotOf(a);
  const plan = planCorrections(snap, await lookupsFor(snap));
  const out = await applyPlan(a, plan, null);
  assert.deepEqual(out.errors, []);
  const creates = a.writes.filter(w => w[0] === "items.create");
  assert.deepEqual(creates.map(c => c[1][0]), [["robe", "equipment"], ["witch", "equipment"], ["notes", "equipment"], ["orcrobe", "equipment"]]);
  assert.ok(creates.every(c => c[2].keepId === true));
  assert.equal(out.stamped, false, "no stamp asked for");
});

test("a failed write is reported, the rest still run, and no stamp is written", async () => {
  const a = liveActor(wizard());
  a.items.get("stone").createEmbeddedDocuments = async () => { throw new Error("nope"); };
  const snap = snapshotOf(a);
  const out = await applyPlan(a, planCorrections(snap, await lookupsFor(snap)), { importId: "imp1" });
  assert.deepEqual(out.errors, ["Transmuter's Stone: effects: nope"]);
  assert.equal(out.stamped, false);
  assert.equal("flags.pentaryn-importer.ddbCorrections" in a.writes.at(-1)[1], false);
});

/* the feature */

test("the sync hook on an owner's client applies the corrections and reports once (console + GM whisper)", async () => {
  reset();
  const a = liveActor(wizard());
  seed(a);
  Hooks.callAll(HOOK, { actor: a, ddbCharacter: {} });
  await flush();
  assert.ok(a.writes.length > 0);
  const info = lines.filter(l => l[1].includes("DDB corrections — Test Wizard"));
  assert.equal(info.length, 1, JSON.stringify(lines));
  assert.match(info[0][1], /^pentaryn-importer \| DDB corrections — Test Wizard: \d+ change\(s\) — Robe: consumable\/trinket → equipment\/clothing;.*\(sync\)$/);
  assert.equal(chat.length, 1);
  assert.deepEqual(chat[0].whisper, [game.user.id]);
  // a second sync of an already-correct actor with the same import: silent, no writes but none needed
  reset();
  const n = a.writes.length;
  Hooks.callAll(HOOK, { actor: a, ddbCharacter: {} });
  await flush();
  assert.equal(a.writes.length, n, "already correct and stamped: nothing written");
  assert.deepEqual([lines.length, chat.length], [0, 0]);
});

test("a new import id with nothing to correct writes only the stamp, silently", async () => {
  const a = liveActor(fighter({ importId: "new", stamp: { importId: "old" } }));
  seed(a);
  reset();
  Hooks.callAll(HOOK, { actor: a });
  await flush();
  assert.deepEqual(a.writes.map(w => w[0]), ["actor.update"]);
  assert.deepEqual(Object.keys(a.writes[0][1]), ["flags.pentaryn-importer.ddbCorrections"]);
  assert.deepEqual([lines.length, chat.length], [0, 0]);
});

test("not a DDB actor, or the setting off: the hook does nothing", async () => {
  const plain = liveActor({ ...wizard(), ddb: false });
  Hooks.callAll(HOOK, { actor: plain });
  await flush();
  assert.deepEqual(plain.writes, []);
  await game.settings.set(MODULE, "ddbCorrections", false);
  try {
    const a = liveActor(wizard());
    Hooks.callAll(HOOK, { actor: a });
    await flush();
    assert.deepEqual(a.writes, []);
    assert.deepEqual(await api.ddbCorrections.plan(a).then(p => p.enabled), false);
  } finally {
    await game.settings.set(MODULE, "ddbCorrections", true);
  }
});

test("a client that cannot update the actor relays to the active GM (the apply query)", async () => {
  const a = liveActor(wizard(), { isOwner: false });
  seed(a);
  const sent = [];
  const handler = CONFIG.queries[`${MODULE}.ddbCorrections.apply`];
  assert.equal(typeof handler, "function");
  CONFIG.queries[`${MODULE}.ddbCorrections.apply`] = async (data, ctx) => { sent.push(data); return { ok: true }; };
  try {
    Hooks.callAll(HOOK, { actor: a });
    await flush();
    assert.deepEqual(sent, [{ ref: a.uuid }]);
    assert.deepEqual(a.writes, []);
  } finally {
    CONFIG.queries[`${MODULE}.ddbCorrections.apply`] = handler;
  }
});

test("api: plan is a dry run; apply writes; apply { dryRun } writes nothing; a non-DDB actor is refused", async () => {
  const a = liveActor(fighter());
  seed(a);
  const p = await api.ddbCorrections.plan(a);
  assert.deepEqual(p.changes, []);
  assert.equal(p.notes.length, 1);
  assert.equal(p.needsCorrection, true);
  assert.deepEqual(a.writes, []);
  const dry = await api.ddbCorrections.apply(a, { dryRun: true });
  assert.equal(dry.ok, true);
  assert.equal(dry.dryRun, true);
  assert.deepEqual(a.writes, []);
  const real = await api.ddbCorrections.apply("Test Fighter");
  assert.equal(real.ok, true);
  assert.equal(api.inspect(a).needsCorrection, false);
  const plain = liveActor({ ...fighter(), ddb: false });
  seed(plain);
  assert.equal((await api.ddbCorrections.apply(plain)).code, "BAD_ARGS");
  await assert.rejects(() => api.ddbCorrections.plan(plain), /BAD_ARGS/);
  assert.equal((await api.ddbCorrections.apply("nobody")).code, "NOT_FOUND");
});

test("api: the relay handler on the GM applies for a player sender who owns the actor", async () => {
  const a = liveActor(fighter({ importId: "r1" }), { owners: ["player1"] });
  seed(a);
  const out = await CONFIG.queries[`${MODULE}.ddbCorrections.apply`]({ ref: a.id }, { user: { id: "player1", isGM: false, name: "P" } });
  assert.equal(out.ok, true);
  assert.equal(out.reason, "relay");
});

test("api: the relay refuses a player sender who does not own the actor, and writes nothing", async () => {
  const a = liveActor(wizard({ importId: "r2" }), { owners: ["someoneElse"] });
  seed(a);
  const out = await CONFIG.queries[`${MODULE}.ddbCorrections.apply`]({ ref: a.id }, { user: { id: "player2", isGM: false, name: "Mallory" } });
  assert.equal(out.ok, false);
  assert.equal(out.code, "REFUSED");
  assert.match(out.reason ?? out.message ?? "", /Mallory does not own/);
  assert.deepEqual(a.writes, []);
});

test("inspect: the stamp, needsCorrection and frozen items; depth ≤ 4", () => {
  const a = liveActor(fighter({ frozenAxe: true, importId: "x", stamp: { importId: "y", at: 5, version: "1.2.0", changes: 0 } }));
  seed(a);
  const out = api.inspect(a);
  assert.deepEqual(out, {
    actor: { id: a.id, name: "Test Fighter" }, ddb: true, importId: "x",
    stamp: { importId: "y", at: 5, version: "1.2.0", changes: 0 }, needsCorrection: true,
    frozen: ["Axe of Resonant Provocation"],
  });
});

test("api.ddbCorrections.rules lists the rule ids", () => {
  assert.deepEqual(api.ddbCorrections.rules().map(r => r.id), ["apparel-as-equipment", "freecast-innate", "cast-self-uses", "stale-cast-cache", "transmuters-stone"]);
});

test("the GM-ready sweep corrects only DDB actors synced since their stamp", async () => {
  const due = liveActor(wizard({ importId: "n", stamp: { importId: "o" } }));
  const current = liveActor(fighter({ importId: "same", stamp: { importId: "same" } }));
  const plain = liveActor({ ...wizard(), id: "plainActor000001", ddb: false });
  seed(due, current, plain);
  reset();
  // the sweep is exposed to the entry only (ctx.exposed.ddb); the same feature instance, installed on a
  // throwaway registry with the module's own logger, hands it over
  const feature = await import("../ddb-corrections.mjs");
  const { log } = await import("../documents-adapter.mjs");
  const ctx = { log };
  feature.install({ on: () => 0 }, ctx);
  const { sweep } = ctx.exposed.ddb;
  const res = await sweep();
  assert.deepEqual(res, { checked: 1, corrected: ["Test Wizard"] });
  assert.ok(due.writes.length > 0);
  assert.deepEqual([current.writes, plain.writes], [[], []]);
});

test("a sync hook overlapping a correction already running for the actor is logged, not dropped silently", async () => {
  const a = liveActor(wizard({ importId: "c1" }));
  seed(a);
  reset();
  Hooks.callAll(HOOK, { actor: a });       // the first run is in flight (awaiting its lookups)
  Hooks.callAll(HOOK, { actor: a });       // the second finds it running: CONFLICT
  await flush();
  const warn = lines.filter(l => l[0] === "warn" && /skipped \(sync\), a correction is already running/.test(l[1]));
  assert.equal(warn.length, 1, JSON.stringify(lines));
  assert.ok(a.writes.length > 0, "the first run still corrected the actor");
});

test("the sweep re-corrects an actor stamped by an older module version, then restamps it", async () => {
  const { VERSION } = await import("../importer-core.mjs");
  const old = liveActor(fighter({ importId: "same", stamp: { importId: "same", version: "0.0.1" } }));
  seed(old);
  const feature = await import("../ddb-corrections.mjs");
  const { log } = await import("../documents-adapter.mjs");
  const ctx = { log };
  feature.install({ on: () => 0 }, ctx);
  const res = await ctx.exposed.ddb.sweep();
  assert.equal(res.checked, 1);
  assert.equal(old.flags["pentaryn-importer"].ddbCorrections.version, VERSION);
  assert.deepEqual(await ctx.exposed.ddb.sweep(), { checked: 0, corrected: [] }, "restamped: not due again");
});

test("selftest passes with the feature installed and the setting registered", () => {
  const out = api.selftest();
  assert.equal(out.ok, true, JSON.stringify(out.checks.filter(c => !c.ok)));
});
