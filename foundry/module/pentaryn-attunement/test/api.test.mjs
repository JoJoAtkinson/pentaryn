// The kit-built API (guide step 5, items-journal-16): rows ↔ implementations, the describe/surface
// goldens, the legacy methods equal to the core for documents, the additive ref resolution, report's
// quiet, stash's detail, inspect (depth ≤ 4, the two counts) and selftest.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { attunementWorld, addItem, makeActor, MOD } from "./fixtures/world.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import { buildApi, surfaceOf } from "../lib/api.mjs";
import * as core from "../attunement-core.mjs";
import { buildApiFor } from "../api.mjs";
import * as sheet from "../sheet.mjs";
import * as bonds from "../bonds.mjs";

const manifest = manifestOf(new URL("..", import.meta.url));
const F = await attunementWorld();
const quiet = console.log;
console.log = () => {};
try {
  await import("../attunement.mjs");
  F.fire("init");
  F.fire("ready");
} finally {
  console.log = quiet;
}
const api = game.modules.get(MOD).api;

test("published at ready as module.api and game.pentaryn.attunement, frozen; ready hooks fired", () => {
  assert.equal(typeof api, "object");
  assert.equal(game.pentaryn.attunement, api);
  assert.equal(Object.isFrozen(api), true);
  const fired = F.calls.filter(c => c.op === "Hooks.callAll").map(c => c.name);
  assert.ok(fired.includes("pentaryn-attunement.ready"));
  assert.ok(fired.includes("pentaryn.ready"));
  for (const path of api.describe().methods.map(m => m.path)) assert.equal(typeof api[path], "function", path);
});

test("drift fails at build: a manifest row without an implementation", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
});

test("describe() equals golden/describe.json (version, kit, published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("version and contract; the five legacy methods keep their order", () => {
  assert.equal(api.version, manifest.version);
  assert.equal(api.describe().version, manifest.version);
  assert.equal(api.contract, "pentaryn-attunement/api@1");
  assert.deepEqual(Object.keys(api).slice(0, 5), ["report", "computeSlots", "stash", "releaseAway", "away"]);
  assert.deepEqual(api.describe().flags.writes,
    ["flags.pentaryn-attunement.slots", "flags.pentaryn-attunement.away", "flags.pentaryn-attunement.bond",
      "flags.pentaryn-attunement.claims.coinBack", "flags.pentaryn-attunement.claims.home"]);   // [declared] EXT-6
});

test("describe() reports the hook labels and the tooltip patch row", () => {
  const d = api.describe();
  assert.deepEqual(d.hooks.map(h => h.label), [
    "renderBaseActorSheet: strip", "preUpdateItem: over-cap warn", "preCreateItem: bond restore", "createItem: bond return",
  ]);
  assert.deepEqual(d.patches.map(p => [p.label, p.marker, p.adjustments]),
    [["Tooltips5e#_positionItemTooltip", "pentarynGuarded", "attunement-item-tooltip-anchor"]]);
});

const legacyShapes = () => {
  const actor = (attuned, slots, max = 3, away = []) => ({
    system: { attributes: { attunement: { max } } },
    items: attuned.map(id => ({ id, system: { attuned: true } })),
    getFlag: (_m, k) => (k === "away" ? away : slots),
  });
  return [actor([], undefined), actor(["a", "b", "c"], ["c", "a", "b"]), actor(["a"], ["gone", "a"]), actor(["a"], "corrupt"),
    actor(["a", "b", "c", "d"], undefined), actor(["a"], [], 0), actor(["a"], ["away:k"], 3, [{ key: "k" }])];
};

test("computeSlots/away: any object passes through — results equal the core's", () => {
  for (const a of legacyShapes()) {
    assert.deepEqual(api.computeSlots(a), core.computeSlots(a));
    assert.deepEqual(api.away(a), core.awayOf(a));
  }
});

test("computeSlots/away also take an id, a uuid or an exact name; a miss is null / []", () => {
  const actor = makeActor(F, { id: "actorRefs0000001", name: "Refs Quinn", flags: { [MOD]: { away: [{ key: "k", name: "Orb", img: "o" }] } },
    items: [{ id: "itemRefR00000001", name: "Ring", system: { attunement: "required", attuned: true } }] });
  const want = core.computeSlots(actor);
  for (const ref of [actor, actor.id, actor.uuid, "Refs Quinn"]) {
    assert.deepEqual(api.computeSlots(ref), want, String(ref?.id ?? ref));
    assert.deepEqual(api.away(ref), [{ key: "k", name: "Orb", img: "o" }]);
  }
  assert.equal(api.computeSlots("Nobody Here"), null);
  assert.deepEqual(api.away("Nobody Here"), []);
  assert.deepEqual(api.away(undefined), []);
});

test("report(target, { quiet: true }): the same result, no console output", () => {
  const actor = makeActor(F, { id: "actorQuet0000001", name: "Quiet One", attunement: { value: 1, max: 3 },
    items: [{ id: "itemQuet00000001", name: "Ring", system: { attunement: "required", attuned: true } }] });
  const lines = [];
  const keep = { log: console.log, table: console.table, warn: console.warn };
  for (const k of Object.keys(keep)) console[k] = (...a) => lines.push([k, ...a]);
  let loud, hushed, miss;
  try {
    loud = api.report(actor);
    const before = lines.length;
    hushed = api.report(actor, { quiet: true });
    miss = api.report("Nobody Here", { quiet: true });
    assert.equal(lines.length, before, "quiet prints nothing");
  } finally {
    Object.assign(console, keep);
  }
  assert.deepEqual(hushed, loud);
  assert.equal(miss, undefined);
});

test("stash(..., { detail: true }): count, the created ids and the new away keys; no options still resolves the count", async () => {
  F.resetIds();
  const mk = id => makeActor(F, { id, name: "Talo Detail", currency: {},
    items: [
      { id: "c", name: "Cloak", system: { attuned: true }, source: { name: "Cloak", system: { attuned: true, attunement: "required" } } },
      { id: "t", name: "Torch", type: "loot", system: { quantity: 1 } },
    ] });
  const box = makeActor(F, { id: "actorBoxD0000001", name: "Box" });
  box.createEmbeddedDocuments = async (type, data) => data.map((d, i) => ({ id: `made${i}`, ...d }));
  const out = await api.stash(mk("actorDetl0000001"), box, ["c", "t"], { detail: true });
  assert.deepEqual(out, { count: 2, created: ["made0", "made1"], away: ["r1"] });
  assert.equal(await api.stash(mk("actorDetl0000002"), box, ["c", "t"]), 2);
});

test("inspect(ref): slots, away, bonds and both counts; plain JSON, depth ≤ 4", async () => {
  const actor = makeActor(F, { id: "actorInsp0000001", name: "Inspect Me", attunement: { value: 1, max: 3 },
    flags: { [MOD]: { away: [{ key: "k1", name: "Staff", img: "s" }], slots: ["away:k1"] } },
    items: [{ id: "itemInsA00000001", name: "A", system: { attunement: "required", attuned: true } },
      { id: "itemInsB00000001", name: "B", system: { attunement: "required", attuned: true } }] });
  addItem(F, actor, { id: "itemInsP00000001", name: "Coin Purse", type: "loot",
    flags: { [MOD]: { bond: { actor: "someone", key: "kc", name: "Coin Purse", currency: { gp: 5 } } } } });
  const out = await api.inspect("Inspect Me");
  assert.ok(maxDepth(out) <= 4, `depth ${maxDepth(out)}`);
  assert.deepEqual(out.actor, { documentName: "Actor", id: "actorInsp0000001", uuid: "Actor.actorInsp0000001", name: "Inspect Me" });
  assert.deepEqual(out.slots, ["away:k1", "itemInsA00000001", "itemInsB00000001"]);
  assert.deepEqual([out.value, out.max, out.over], [3, 3, false]);
  assert.deepEqual(out.away, [{ key: "k1", name: "Staff", img: "s" }]);
  assert.deepEqual(out.bonds, [{ item: { documentName: "Item", id: "itemInsP00000001", uuid: "Actor.actorInsp0000001.Item.itemInsP00000001", name: "Coin Purse" },
    actor: "someone", key: "kc", name: "Coin Purse", currency: { gp: 5 } }]);
  assert.deepEqual(out.counts, { dnd5e: 1, away: 1, strip: 3, mismatch: true }, "items-journal-12: the warning would count 2, the strip 3");
  await assert.rejects(async () => api.inspect("Nobody Here"), /NOT_FOUND/);
});

test("selftest: every check passes on a loaded world", () => {
  const out = api.selftest();
  assert.deepEqual(out.checks.filter(c => !c.ok), []);
  assert.equal(out.ok, true);
});

// EXT-8: the hook check named no hooks, it counted (>= 4), so four records that are not the four
// this module registers passed. Each feature now exports the hook names it registers, and the check
// reports the missing names.
test("EXT-8: each feature exports the hook names its install registers, in order", () => {
  assert.deepEqual(sheet.HOOK_NAMES, ["renderBaseActorSheet"]);
  assert.deepEqual(bonds.HOOK_NAMES, ["preUpdateItem", "preCreateItem", "createItem"]);
  assert.equal(Object.isFrozen(sheet.HOOK_NAMES), true);
  assert.equal(Object.isFrozen(bonds.HOOK_NAMES), true);
  const names = [];
  const reg = { on: name => { names.push(name); } };
  sheet.install(reg);
  bonds.install(reg);
  assert.deepEqual(names, [...sheet.HOOK_NAMES, ...bonds.HOOK_NAMES]);
});

test("EXT-8: selftest's hook check names the missing hook even when four hooks are registered", () => {
  const records = ["renderBaseActorSheet", "preUpdateItem", "preCreateItem", "preCreateItem"]
    .map((name, id) => ({ kind: "on", name, id, label: name }));
  const ctx = { log: { traces: () => [] }, reg: { ids: () => records.map(r => ({ ...r })) }, api: null, uninstall: () => {},
    hookNames: ["renderBaseActorSheet", "preUpdateItem", "preCreateItem", "createItem"] };
  ctx.api = buildApiFor(ctx);
  const check = ctx.api.selftest().checks.find(c => /hook/.test(c.label));
  assert.equal(check.ok, false);
  assert.deepEqual(check.detail, ["createItem"]);
  const live = api.selftest().checks.find(c => /hook/.test(c.label));
  assert.deepEqual([live.ok, live.detail], [true, null]);
});

test("uninstall(): every module hook off, the tooltip guard unwrapped", () => {
  const proto = Object.getPrototypeOf(game.dnd5e.tooltips);
  assert.equal(proto._positionItemTooltip.pentarynGuarded, true);
  api.uninstall();
  assert.deepEqual(api.describe().hooks, []);
  assert.equal(proto._positionItemTooltip.pentarynGuarded, undefined);
  assert.equal(api.describe().patches.length, 0);
});
