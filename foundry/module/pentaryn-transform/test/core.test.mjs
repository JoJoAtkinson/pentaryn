// The core is imported FIRST and BARE — no Foundry stub installed. If it touched a Foundry global
// at load, this file would fail before any test ran: that is the purity proof.
//
// Checkpoint (wave 4): the export list and constants of today's transform-core.mjs, plus the
// verbatim oracles (test/fixtures/legacy-*.mjs) pinned over their tables, so guide step 3's seams
// are proved against the code as it is now. The 155 legacy checks stay in core-legacy.mjs.
import * as core from "../transform-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise, manifestOf, pinJSON } from "./kit/harness.mjs";
import * as LT from "./fixtures/legacy-transform.mjs";
import * as LS from "./fixtures/legacy-starry.mjs";
import * as LH from "./fixtures/legacy-hud.mjs";

const ROOT = new URL("..", import.meta.url);
const file = import.meta.url;

test("core loads with no Foundry globals present", () => {
  for (const name of ["game", "canvas", "ui", "Hooks", "CONFIG", "foundry"]) {
    assert.equal(name in globalThis, false, `${name} is defined in a bare node process`);
  }
});

// Guide step 2's explicit additive delta: the blueprint constants. The checkpoint golden stays the 39 names.
const ADDED_S2 = ["CONTRACT", "CSS", "FLAG_SCOPE", "HOOKS", "I18N", "MODULE", "NS", "SHORT", "VERSION"];
const ADDED = [...ADDED_S2];

test("export list of transform-core.mjs (step 2's barrel must re-export every name)", () => {
  const names = Object.keys(core).sort();
  pinJSON("core-exports", names.filter(n => !ADDED.includes(n)).map(k => [k, typeof core[k]]), file);
  for (const n of ADDED) assert.ok(names.includes(n), n);
  assert.equal(names.length, 39 + ADDED.length);
});

test("constants: MODULE_ID is the manifest id; EFFECT_ID, Starry constants", () => {
  const manifest = manifestOf(ROOT);
  assert.equal(core.MODULE_ID, manifest.id);
  assert.equal(core.EFFECT_ID.length, 16);
  pinJSON("core-constants", {
    MODULE_ID: core.MODULE_ID, EFFECT_ID: core.EFFECT_ID, CONSTELLATIONS: core.CONSTELLATIONS,
    STARRY_LIGHT: core.STARRY_LIGHT, STARRY_SECONDS: core.STARRY_SECONDS,
    frozen: [Object.isFrozen(core.CONSTELLATIONS), Object.isFrozen(core.STARRY_LIGHT)]
  }, file);
});

test("manifest today: version 0.3.3, generation 14, flagScope 'transform' (C07, Wave 7)", () => {
  const m = manifestOf(ROOT);
  assert.equal(m.version, "0.3.3");
  assert.deepEqual(m.esmodules, ["transform.mjs", "hud.mjs"]);
  assert.deepEqual(m.flags.pentaryn, { flagScope: "transform", generation: 14 });
  assert.equal(m.compatibility.minimum, "13");
});

test("VERSION === module.json version", () => {
  assert.equal(core.VERSION, manifestOf(ROOT).version);
});

/* ── oracles: transform.mjs ───────────────────────────────────────────────── */

class Forced { constructor(v) { this.v = v; } }
const isForced = v => v instanceof Forced;
const valueOf = v => (v instanceof Forced ? v.v : v);
const describeOp = op => JSON.parse(JSON.stringify(op, (k, v) => (v instanceof Forced ? { forced: v.v } : v)));

test("oracle legacyUnwrap (transform.mjs:37-46): the -5 table", async () => {
  // Inputs are named builders: the loop mutates the operation, so each row is built fresh.
  const ops = {
    "mixed, recursive:false": () => ({ recursive: false, updates: [{ x: new Forced(100), y: new Forced(null), texture: new Forced({ src: "a" }), name: "n", elevation: new Forced(5) }] }),
    "recursive:true": () => ({ recursive: true, updates: [{ x: new Forced(100) }] }),
    "recursive unset": () => ({ updates: [{ x: new Forced(100) }] }),
    "no updates": () => ({ recursive: false }),
    "null entry, string, array": () => ({ recursive: false, updates: [null, { x: new Forced("s"), flags: new Forced([1]) }] }),
    "false and undefined": () => ({ recursive: false, updates: [{ hidden: new Forced(false), sort: new Forced(undefined) }] }),
    "null operation": () => null
  };
  const run = (name) => {
    const operation = ops[name]();
    const before = operation?.updates?.[0];
    const out = LT.legacyUnwrap(operation, { isForced, valueOf });
    return { returned: out ?? null, op: describeOp(operation), identity: operation?.updates?.[0] === before };
  };
  await characterise("oracle-unwrap", run, Object.keys(ops), { file });
});

test("oracle legacyWildShapeActivity / legacyForms (transform.mjs:102-117), with a resolver count (-23)", async () => {
  const ws = { _id: "ws", type: "transform", transform: { preset: "wildshape" },
    availableProfiles: [{ _id: "p1", name: "Dire Wolf", uuid: "A.wolf" }, { _id: "p2", name: "", uuid: "A.ape" }, { _id: "p3", name: "", uuid: "A.gone" }] };
  const other = { _id: "pm", type: "transform", transform: { preset: "polymorph" } };
  const host = items => ({ items });
  const item = (id, acts) => ({ id, system: { activities: acts } });
  await characterise("oracle-wildshape-activity", h => LT.legacyWildShapeActivity(h)?._id ?? null, [
    [host([item("a", [other]), item("b", { ws })])],
    [host([item("a", [ws]), item("b", [{ ...ws, _id: "ws2" }])])],
    [host([])],
    [null]
  ], { file });
  const actors = { "A.wolf": { name: "Dire Wolf (actor)" }, "A.ape": { name: "Ape" } };
  let resolves = 0;
  const resolve = uuid => { resolves++; return actors[uuid] ?? null; };
  const out = LT.legacyForms(ws, resolve);
  assert.deepEqual(out.map(f => [f.id, f.name, f.uuid, f.actor?.name ?? null]),
    [["p1", "Dire Wolf", "A.wolf", "Dire Wolf (actor)"], ["p2", "Ape", "A.ape", "Ape"], ["p3", "?", "A.gone", null]]);
  // KNOWN (-23): one resolve per profile for the actor, plus one more per profile with an empty name.
  assert.equal(resolves, 5);
  assert.deepEqual(LT.legacyForms(null, resolve), []);
});

test("oracle legacyRefund / legacyStarryRefund (transform.mjs:423-427, starry.mjs:257-259): same arithmetic", async () => {
  const inputs = [[{ spent: 2 }], [{ spent: 1 }], [{ spent: 0 }], [{ spent: -1 }], [{ spent: "1" }], [{}], [undefined], [{ spent: NaN }]];
  const rows = await characterise("oracle-refund", LT.legacyRefund, inputs, { file });
  for (const [i, [u]] of inputs.entries()) assert.deepEqual(LS.legacyStarryRefund(u), LT.legacyRefund(u), `row ${i}`);
  assert.equal(rows.length, inputs.length);
});

test("oracle legacyIsRunner (transform.mjs:646-649): the -1 / -2 table", async () => {
  const users = [
    { id: "p2", active: true, isGM: false }, { id: "p1", active: true, isGM: false },
    { id: "p3", active: false, isGM: false }, { id: "gm", active: true, isGM: true }
  ];
  const owners = new Set(["p1", "p2", "p3"]);
  const run = (activeGMId, selfId, ownerSet) => LT.legacyIsRunner({ users, testOwner: u => (ownerSet ?? [...owners]).includes(u.id), activeGMId, selfId });
  await characterise("oracle-is-runner", run, [
    ["gm", "gm"], ["gm", "p1"], [null, "p1"], [null, "p2"], [null, "p3"], [null, "gm"], [null, "p2", ["p2"]], [null, "p1", []]
  ], { file });
});

test("oracle legacyWorldTimeCandidates (transform.mjs:704-705): actors, then unlinked scene tokens with an actor", () => {
  const A = { id: "A" }, B = { id: "B" };
  const got = LT.legacyWorldTimeCandidates([{ id: "a1" }, { id: "a2" }],
    [{ actorLink: true, actor: A }, { actorLink: false, actor: B }, { actorLink: false, actor: null }]);
  assert.deepEqual(got.map(a => a.id), ["a1", "a2", "B"]);
  assert.deepEqual(LT.legacyWorldTimeCandidates([], undefined), []);
});

/* ── oracles: starry.mjs ──────────────────────────────────────────────────── */

test("oracle legacyStarrySecondsLeft (starry.mjs:81-87)", async () => {
  await characterise("oracle-starry-seconds", LS.legacyStarrySecondsLeft, [
    [{ start: { time: 100 }, _source: { duration: { value: 600 } } }, 400],
    [{ _source: { start: { time: 100 }, duration: { value: 600 } } }, 800],
    [{ start: { time: 100 }, _source: { duration: {} } }, 400],
    [{ start: {}, _source: { duration: { value: 600 } } }, 400],
    [null, 0],
    [{ start: { time: 0 }, _source: { duration: { value: 600 } } }, 600]
  ], { file });
});

test("oracle legacyConstellationImg (starry.mjs:98-102)", async () => {
  await characterise("oracle-constellation-img", LS.legacyConstellationImg, [
    ["custom.webp", "item.webp", "archer"],
    ["icons/svg/mystery-man.svg", "item.webp", "chalice"],
    ["systems/dnd5e/icons/svg/activity/attack.svg", "item.webp", "dragon"],
    ["", "item.webp", "archer"],
    [undefined, "item.webp", "nebula"],
    [null, undefined, "nebula"]
  ], { file });
});

test("oracle legacyBaseEffect (starry.mjs:121-128)", async () => {
  const fx = (name, changes = []) => ({ name, changes });
  const item = { effects: { contents: [fx("Starry Form"), fx("Starry Form: Dragon"), fx("Dragon (Twinkling)", [{ key: "system.attributes.movement.fly", value: "20" }])] } };
  const onlyFly = { effects: { contents: [fx("Dragon", [{ key: "system.attributes.movement.speeds.fly" }])] } };
  const run = (it, c, tw) => LS.legacyBaseEffect(it, c, tw)?.name ?? null;
  await characterise("oracle-base-effect", run, [
    [item, "dragon", true], [item, "dragon", false], [onlyFly, "dragon", false], [item, "archer", false],
    [{ effects: { contents: [fx("starry form")] } }, "chalice", false], [{ effects: { contents: [] } }, "archer", true], [null, "dragon", true]
  ], { file });
});

test("oracle legacyStarryEndKey (starry.mjs:233)", async () => {
  await characterise("oracle-starry-end-key", LS.legacyStarryEndKey, ["incapacitated", "expired", "manual", undefined, "longRest"], { file });
});

/* ── oracles: hud.mjs ─────────────────────────────────────────────────────── */

const CFG = {
  actorSizes: { lg: { label: "Large" }, med: { label: "Medium" } },
  creatureTypes: { beast: { label: "Beast" } }
};

test("oracle legacySummaryInput (hud.mjs:137-166) feeds formSummary", async () => {
  const acts = list => new Map(list.map(a => [a._id, a]));
  const wolf = {
    system: { details: { cr: 1, type: { value: "beast" } }, traits: { size: "lg" },
      attributes: { ac: { value: 14 }, movement: { walk: 50, units: "ft" }, senses: { ranges: { darkvision: 60 } } } },
    items: [
      { name: "Bite", type: "weapon", system: { activities: acts([{ _id: "b", type: "attack", labels: { toHit: "+5", damage: [{ label: "2d6 + 3" }] } }]) } },
      { name: "Claw", type: "weapon", labels: { toHit: "+4", damages: [{ formula: "1d6" }] }, system: { activities: acts([{ _id: "c", type: "utility" }]) } },
      { name: "Breath", type: "feat", system: { type: { value: "monster" }, activities: acts([{ _id: "br", type: "attack", labels: { damage: "x" } }]) } },
      { name: "Pack Tactics", type: "feat", system: { type: { value: "monster" } } },
      { name: "Multiattack", type: "feat", system: { type: { value: "monster" }, activities: acts([{ _id: "m", type: "utility" }]) } },
      { name: "Odd", type: "loot", system: {} }
    ]
  };
  const blob = { system: { details: { type: { value: "ooze" } }, attributes: {} }, items: [] };
  await characterise("oracle-summary-input", src => {
    const input = LH.legacySummaryInput(src, CFG);
    return { input, summary: core.formSummary(input) };
  }, [[wolf], [blob]], { file });
});

test("oracle legacyRecoveryText (hud.mjs:168-175)", async () => {
  const periods = { lr: { label: "Long Rest" }, sr: { label: "Short Rest" } };
  const run = recovery => LH.legacyRecoveryText({ system: { uses: { recovery } } }, periods, "all");
  await characterise("oracle-recovery-text", run, [
    [[{ period: "lr", type: "recoverAll" }, { period: "sr", type: "formula", formula: "1" }]],
    [[{ period: "dawn", type: "formula", formula: "" }]],
    [[]],
    [undefined]
  ], { file });
});

test("oracle legacyDescribe (hud.mjs:490-495)", () => {
  class ItemButton { constructor(item) { this.item = item; } }
  class SplitButton { constructor(a, b) { this.button1 = a; this.button2 = b; } }
  const C = { ItemButton, SplitButton };
  assert.deepEqual(LH.legacyDescribe({ _isWeaponSet: true }, C), { kind: "weaponSet" });
  assert.deepEqual(LH.legacyDescribe(new ItemButton({ id: "x" }), C), { kind: "item", id: "x" });
  assert.deepEqual(LH.legacyDescribe(new ItemButton(null), C), { kind: "item", id: null });
  assert.deepEqual(LH.legacyDescribe(new SplitButton(new ItemButton({ id: "a" }), null), C), { kind: "split", ids: ["a", undefined] });
  assert.deepEqual(LH.legacyDescribe(new SplitButton(), { ItemButton }), { kind: "other" });
  assert.deepEqual(LH.legacyDescribe(null, C), { kind: "other" });
});

test("oracle legacyCovered (hud.mjs:570-578): the -13 table", async () => {
  const has = id => id === "mmMulti";
  const run = (o) => LH.legacyCovered({ hasItem: has, ...o });
  await characterise("oracle-covered", run, [
    [{ active: false, fullAttack: true, multiattack: true, ma: { source: "mmMulti", total: 2 } }],
    [{ active: true, fullAttack: false, multiattack: true, ma: { source: "mmMulti", total: 2 } }],
    [{ active: true, fullAttack: true, multiattack: false, ma: { source: "mmMulti", total: 2 } }],
    [{ active: true, fullAttack: true, multiattack: true, ma: null }],
    [{ active: true, fullAttack: true, multiattack: true, ma: { source: "flag", total: 3 } }],
    [{ active: true, fullAttack: true, multiattack: true, ma: { source: "mmMulti", total: 1 } }],
    [{ active: true, fullAttack: true, multiattack: true, ma: { source: "mmMulti" } }],
    [{ active: true, fullAttack: true, multiattack: true, ma: { source: "gone", total: 2 } }],
    [{ active: true, fullAttack: true, multiattack: true, ma: { source: "mmMulti", total: 2 } }]
  ], { file });
  assert.equal(LH.legacyCovered({ active: true, fullAttack: true, multiattack: true, ma: { source: "x", total: 2 }, hasItem: () => { throw new Error("x"); } }), null);
});

test("oracle legacyPortraitLine (hud.mjs:650-664)", async () => {
  const format = (k, d) => `${k}|${d.what}|${d.left}`;
  const run = o => LH.legacyPortraitLine({ format, worldTime: 100, ...o });
  await characterise("oracle-portrait-line", run, [
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: 21700 }],
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: null }],
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: 50 }],
    [{ ws: null, starry: { name: "Starry Form: Archer" }, starryLeft: 540 }],
    [{ ws: null, starry: { name: "Starry Form: Archer" }, starryLeft: null }],
    [{ ws: null, starry: null }]
  ], { file });
});

test("oracle legacyLiveDecision (hud.mjs:734-739): the -10 prune table", () => {
  const item = { id: "ws" };
  const b = (connected, panel, wsItem) => ({ element: { isConnected: connected }, panel, wildShapeItem: wsItem });
  assert.equal(LH.legacyLiveDecision(b(false, {}, item), item), "delete");
  assert.equal(LH.legacyLiveDecision(b(false, null, item), item), "skip");
  assert.equal(LH.legacyLiveDecision(b(true, {}, item), item), "refresh");
  assert.equal(LH.legacyLiveDecision(b(true, {}, { id: "other" }), item), "keep");
  assert.equal(LH.legacyLiveDecision(b(true, {}, { id: "other" }), null), "refresh");
});

test("oracle legacyEarnsChalice (hud.mjs:781-788): the -6 table", async () => {
  const spell = (level, extra = {}) => ({ type: "spell", system: { level } , ...extra });
  const run = (activity, usage) => LH.legacyEarnsChalice(activity, usage);
  await characterise("oracle-earns-chalice", run, [
    [{ type: "heal", item: spell(1) }, {}],
    [{ type: "heal", item: spell(1) }, { consume: { spellSlot: false } }],
    [{ type: "heal", item: spell(0) }, {}],
    [{ type: "heal", item: spell("2") }, {}],
    [{ type: "heal", item: { type: "feat", system: { level: 1 } } }, {}],
    [{ type: "damage", item: spell(1), damage: { parts: [{ types: new Set(["healing"]) }] } }, {}],
    [{ type: "damage", item: spell(1), damage: { parts: [{ types: ["temphp"] }] } }, {}],
    [{ type: "damage", item: spell(1), damage: { parts: [{ types: ["fire"] }] } }, {}],
    [{ type: "damage", item: spell(1) }, undefined],
    [null, {}]
  ], { file, normalise: v => v });
});

test("oracle legacyPointerArms (hud.mjs:48-52): a move arms one check while none is queued (-11)", () => {
  assert.equal(LH.legacyPointerArms(false), true);
  assert.equal(LH.legacyPointerArms(true), false);
});
