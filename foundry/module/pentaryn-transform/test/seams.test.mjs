// Guide step 3: the pure seams, each proved equal to the checkpoint's verbatim oracle
// (test/fixtures/legacy-*.mjs) row by row — the same inputs, checked against the same goldens
// (golden/oracle-*.json) core.test pinned for the oracles. Then the finding tables the oracles do
// not cover. No Foundry stub: the core is pure.
import * as core from "../transform-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { characterise } from "./kit/harness.mjs";
import * as LT from "./fixtures/legacy-transform.mjs";
import * as LS from "./fixtures/legacy-starry.mjs";
import * as LH from "./fixtures/legacy-hud.mjs";
import { pickRunner as kitPickRunner } from "../lib/election.mjs";

const file = import.meta.url;

/* ── -5 unwrapForcedScalars ───────────────────────────────────────────────── */

class Forced { constructor(v) { this.v = v; } }
const isForced = v => v instanceof Forced;
const valueOf = v => (v instanceof Forced ? v.v : v);
const describeOp = op => JSON.parse(JSON.stringify(op, (k, v) => (v instanceof Forced ? { forced: v.v } : v)));

test("-5 unwrapForcedScalars (behind the glue's recursive === false test) equals the oracle-unwrap rows", async () => {
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
    if (operation?.recursive === false) core.unwrapForcedScalars(operation, { isForced, valueOf });
    return { returned: null, op: describeOp(operation), identity: operation?.updates?.[0] === before };
  };
  await characterise("oracle-unwrap", run, Object.keys(ops), { file });
});

test("-5 unwrapForcedScalars: the finding's table (count, identity, undefined updates, null entries)", () => {
  const u = { x: new Forced(100), y: new Forced(null), texture: new Forced({ src: "a" }), name: "n" };
  const op = { recursive: false, updates: [u] };
  assert.equal(core.unwrapForcedScalars(op, { isForced, valueOf }), 2);
  assert.equal(op.updates[0], u);
  assert.deepEqual([u.x, u.y, u.name], [100, null, "n"]);
  assert.ok(u.texture instanceof Forced);
  assert.equal(core.unwrapForcedScalars({}, { isForced, valueOf }), 0);
  assert.equal(core.unwrapForcedScalars({ updates: [null, undefined] }, { isForced, valueOf }), 0);
  assert.equal(core.unwrapForcedScalars(null, { isForced, valueOf }), 0);
});

/* ── -3 wildShapeActivityOf, -23 formEntries ──────────────────────────────── */

test("-3 wildShapeActivityOf(items) equals the oracle-wildshape-activity rows; findWildShapeItem order", async () => {
  const ws = { _id: "ws", type: "transform", transform: { preset: "wildshape" },
    availableProfiles: [{ _id: "p1", name: "Dire Wolf", uuid: "A.wolf" }, { _id: "p2", name: "", uuid: "A.ape" }, { _id: "p3", name: "", uuid: "A.gone" }] };
  const other = { _id: "pm", type: "transform", transform: { preset: "polymorph" } };
  const host = items => ({ items });
  const item = (id, acts) => ({ id, system: { activities: acts } });
  await characterise("oracle-wildshape-activity", h => core.wildShapeActivityOf(h?.items)?._id ?? null, [
    [host([item("a", [other]), item("b", { ws })])],
    [host([item("a", [ws]), item("b", [{ ...ws, _id: "ws2" }])])],
    [host([])],
    [null]
  ], { file });
  // a Collection-like (only .find), and the WS activity on an item's second activity
  const coll = list => ({ find: fn => list.find(fn), [Symbol.iterator]: () => list[Symbol.iterator]() });
  const second = item("c", [other, ws]);
  assert.equal(core.wildShapeActivityOf(coll([item("a", [other]), second]))?._id, "ws");
  assert.equal(core.wildShapeActivityOf(undefined), null);
  assert.equal(core.findWildShapeItem([item("a", [ws]), item("b", [ws])]).id, "a", "the first item wins");
});

test("-23 formEntries: the oracle's output with one resolve per profile (3, not 5)", () => {
  const profiles = [{ _id: "p1", name: "Dire Wolf", uuid: "A.wolf" }, { _id: "p2", name: "", uuid: "A.ape" }, { _id: "p3", name: "", uuid: "A.gone" }];
  const actors = { "A.wolf": { name: "Dire Wolf (actor)" }, "A.ape": { name: "Ape" } };
  let n = 0;
  const resolve = uuid => { n++; return actors[uuid] ?? null; };
  const got = core.formEntries(profiles, resolve);
  assert.equal(n, 3);
  assert.deepEqual(got, LT.legacyForms({ availableProfiles: profiles }, uuid => actors[uuid] ?? null));
  assert.equal(got.length, profiles.length);
  assert.deepEqual(core.formEntries(undefined, resolve), []);
});

/* ── -4 refundUpdate ──────────────────────────────────────────────────────── */

test("-4 refundUpdate equals the oracle-refund rows (and the Starry copy)", async () => {
  const inputs = [[{ spent: 2 }], [{ spent: 1 }], [{ spent: 0 }], [{ spent: -1 }], [{ spent: "1" }], [{}], [undefined], [{ spent: NaN }]];
  await characterise("oracle-refund", core.refundUpdate, inputs, { file });
  for (const [u] of inputs) assert.deepEqual(core.refundUpdate(u), LS.legacyStarryRefund(u));
});

/* ── -1 runnerIs, -2 canRunAny, -22 worldTimeCandidates ───────────────────── */

test("-1 runnerIs over the oracle-is-runner rows (owner list built the same way)", async () => {
  const users = [
    { id: "p2", active: true, isGM: false }, { id: "p1", active: true, isGM: false },
    { id: "p3", active: false, isGM: false }, { id: "gm", active: true, isGM: true }
  ];
  const owners = new Set(["p1", "p2", "p3"]);
  const run = (activeGMId, selfId, ownerSet) => core.runnerIs(selfId, {
    activeGMId: activeGMId ?? null,
    ownerIds: users.filter(u => u.active && !u.isGM && (ownerSet ?? [...owners]).includes(u.id)).map(u => u.id)
  });
  await characterise("oracle-is-runner", run, [
    ["gm", "gm"], ["gm", "p1"], [null, "p1"], [null, "p2"], [null, "p3"], [null, "gm"], [null, "p2", ["p2"]], [null, "p1", []]
  ], { file });
  assert.equal(core.runnerIs("p1", { activeGMId: "gm", ownerIds: ["p1"] }), false);
  assert.equal(core.runnerIs("gm", { activeGMId: "gm", ownerIds: [] }), true);
  assert.equal(core.runnerIs("p1", { activeGMId: null, ownerIds: ["p2", "p1"] }), true);
});

test("-1 a GM always wins pickRunner; core's pickRunner equals the kit's election copy", () => {
  for (const ownerIds of [[], ["a", "b"], ["zz"]]) assert.equal(core.pickRunner({ activeGMId: "gm", ownerIds }), "gm");
  assert.equal(core.pickRunner({ activeGMId: null, ownerIds: ["p2", "p1"] }), "p1");
  for (const who of [{}, { activeGMId: "gm" }, { ownerIds: ["b", "a"] }, { activeGMId: null, ownerIds: [] }]) {
    assert.equal(core.pickRunner(who), kitPickRunner(who), JSON.stringify(who));
  }
});

test("-2 canRunAny: false only while another user is the active GM; equivalent to pickRunner", () => {
  assert.equal(core.canRunAny({ activeGMId: "gm", selfId: "p1" }), false);
  assert.equal(core.canRunAny({ activeGMId: "gm", selfId: "gm" }), true);
  assert.equal(core.canRunAny({ activeGMId: null, selfId: "p1" }), true);
  for (const selfId of ["p1", "p2", "zz"]) assert.equal(core.pickRunner({ activeGMId: "gm", ownerIds: [selfId] }) === selfId, false);
});

test("-22 worldTimeCandidates equals the oracle", () => {
  const A = { id: "A" }, B = { id: "B" };
  const actors = [{ id: "a1" }, { id: "a2" }];
  const tokens = [{ actorLink: true, actor: A }, { actorLink: false, actor: B }, { actorLink: false, actor: null }];
  assert.deepEqual(core.worldTimeCandidates(actors, tokens), LT.legacyWorldTimeCandidates(actors, tokens));
  assert.deepEqual(core.worldTimeCandidates(actors, tokens).map(a => a.id), ["a1", "a2", "B"]);
  assert.deepEqual(core.worldTimeCandidates([], undefined), []);
});

/* ── -17 shapeStatus ──────────────────────────────────────────────────────── */

test("-17 shapeStatus: Talo as a Dire Wolf; not shifted; no Wild Shape", () => {
  const actor = { id: "form1", name: "Talo (Dire Wolf)", uuid: "Actor.form1" };
  const got = core.shapeStatus({
    actor, original: { id: "talo", name: "Talo", uuid: "Actor.talo" }, shifted: true, wildShapeForm: true,
    formName: "Talo (Dire Wolf)", flag: { profile: "p1", source: "Actor.x", endsAt: 21600 }, worldTime: 60,
    wildShape: { itemId: "ws", uses: { max: 3, spent: 1 } }, forms: [{ id: "p1", name: "Dire Wolf", uuid: "u", actor: {} }], starry: null
  });
  assert.deepEqual(got, {
    actor, original: { id: "talo", name: "Talo", uuid: "Actor.talo" }, shifted: true, wildShapeForm: true,
    form: { name: "Talo (Dire Wolf)", profileId: "p1", sourceUuid: "Actor.x", endsAt: 21600, secondsLeft: 21540 },
    wildShape: { itemId: "ws", usesLeft: 2, max: 3 }, starry: null, forms: [{ id: "p1", name: "Dire Wolf" }]
  });
  const normal = core.shapeStatus({ actor, wildShape: { itemId: "ws", uses: { max: 3, spent: 3 } }, forms: [], starry: { constellation: "archer", secondsLeft: 540 } });
  assert.equal(normal.form, null);
  assert.deepEqual(normal.wildShape, { itemId: "ws", usesLeft: 0, max: 3 });
  assert.deepEqual(normal.starry, { constellation: "archer", secondsLeft: 540 });
  const none = core.shapeStatus({ actor });
  assert.equal(none.wildShape, null);
  assert.deepEqual(none.forms, []);
  assert.equal(core.shapeStatus({ shifted: true, flag: {} }).form.secondsLeft, null, "no end time");
  assert.equal(core.shapeStatus({ wildShape: { itemId: "x", uses: {} } }).wildShape.max, null, "no use limit");
});

/* ── -6 the HUD seams ─────────────────────────────────────────────────────── */

const CFG = {
  actorSizes: { lg: { label: "Large" }, med: { label: "Medium" } },
  creatureTypes: { beast: { label: "Beast" } }
};

test("-6 summaryFromSource equals the oracle-summary-input rows (fed to formSummary)", async () => {
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
    const input = core.summaryFromSource(src, CFG);
    return { input, summary: core.formSummary(input) };
  }, [[wolf], [blob]], { file });
});

test("-6 recoveryLines equals the oracle-recovery-text rows; the finding's line", async () => {
  const periods = { lr: { label: "Long Rest" }, sr: { label: "Short Rest" } };
  await characterise("oracle-recovery-text", recovery => core.recoveryLines(recovery, periods, "all"), [
    [[{ period: "lr", type: "recoverAll" }, { period: "sr", type: "formula", formula: "1" }]],
    [[{ period: "dawn", type: "formula", formula: "" }]],
    [[]],
    [undefined]
  ], { file });
  assert.equal(core.recoveryLines([{ period: "lr", type: "recoverAll" }, { period: "sr", formula: "1" }], periods, "all"), "Long Rest: all · Short Rest: 1");
});

test("-6 portraitText, localized as the glue does, equals the oracle-portrait-line rows", async () => {
  const format = (k, d) => `${k}|${d.what}|${d.left}`;
  const line = o => {
    const p = core.portraitText({ worldTime: 100, ...o });
    return p === null ? null : (p.left === null ? p.what : format("PENTARYN_TRANSFORM.Hud.PortraitLeft", p));
  };
  await characterise("oracle-portrait-line", line, [
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: 21700 }],
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: null }],
    [{ ws: { name: "Wild Shape: Dire Wolf" }, endsAt: 50 }],
    [{ ws: null, starry: { name: "Starry Form: Archer" }, starryLeft: 540 }],
    [{ ws: null, starry: { name: "Starry Form: Archer" }, starryLeft: null }],
    [{ ws: null, starry: null }]
  ], { file });
  assert.deepEqual(core.portraitText({ ws: { name: "W" }, endsAt: 21600, worldTime: 60 }), { what: "W", left: "5 hours 59 minutes" });
  assert.deepEqual(core.portraitText({ starry: { name: "S" }, starryLeft: 540 }), { what: "S", left: "9 minutes" });
});

test("-6 earnsChalice equals the oracle-earns-chalice rows", async () => {
  const spell = (level, extra = {}) => ({ type: "spell", system: { level }, ...extra });
  await characterise("oracle-earns-chalice", core.earnsChalice, [
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

test("-13 coveredMultiattackId equals the oracle-covered rows (a throwing read is the glue's to catch)", async () => {
  const has = id => id === "mmMulti";
  await characterise("oracle-covered", o => core.coveredMultiattackId({ hasItem: has, ...o }), [
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
  assert.throws(() => core.coveredMultiattackId({ active: true, fullAttack: true, multiattack: true, ma: { source: "x", total: 2 }, hasItem: () => { throw new Error("x"); } }));
});

test("-10 pruneDisconnected drops exactly what refreshLive deletes (the oracle's 'delete' rows)", () => {
  const item = { id: "ws" };
  const b = (connected, panel) => ({ element: { isConnected: connected }, panel, wildShapeItem: item });
  const kept = b(true, {}), gone = b(false, {}), unrendered = b(false, undefined);
  const set = new Set([kept, gone, unrendered]);
  assert.equal(core.pruneDisconnected(set), 1);
  assert.deepEqual([...set], [kept, unrendered]);
  for (const x of [kept, gone, unrendered]) {
    assert.equal(LH.legacyLiveDecision(x, item) === "delete", x === gone);
  }
  assert.equal(core.pruneDisconnected(new Set([{ element: null, panel: {} }])), 1, "no element: dropped");
});

test("-11 shouldQueueStaleCheck: only a disconnected anchor with no check queued", () => {
  assert.equal(core.shouldQueueStaleCheck({ anchor: null }), false);
  assert.equal(core.shouldQueueStaleCheck({ anchor: { isConnected: true } }), false);
  assert.equal(core.shouldQueueStaleCheck({ anchor: { isConnected: false }, queued: false }), true);
  assert.equal(core.shouldQueueStaleCheck({ anchor: { isConnected: false }, queued: true }), false);
  // today's arming decision is the queued flag alone (the oracle); the seam narrows it
  assert.equal(LH.legacyPointerArms(false), true);
});

/* ── -7 the Starry seams ──────────────────────────────────────────────────── */

test("-7 secondsLeft over the oracle-starry-seconds rows (start/seconds read as the glue reads them)", async () => {
  const run = (e, now) => core.secondsLeft({ start: e?.start?.time ?? e?._source?.start?.time, seconds: e?._source?.duration?.value, now });
  await characterise("oracle-starry-seconds", run, [
    [{ start: { time: 100 }, _source: { duration: { value: 600 } } }, 400],
    [{ _source: { start: { time: 100 }, duration: { value: 600 } } }, 800],
    [{ start: { time: 100 }, _source: { duration: {} } }, 400],
    [{ start: {}, _source: { duration: { value: 600 } } }, 400],
    [null, 0],
    [{ start: { time: 0 }, _source: { duration: { value: 600 } } }, 600]
  ], { file });
  assert.equal(core.secondsLeft({ start: 100, seconds: 600, now: 400 }), 300);
  assert.equal(core.secondsLeft({ start: undefined, seconds: 600, now: 0 }), null);
  assert.equal(core.secondsLeft({ start: 0, seconds: 600, now: 900 }), -300, "negatives kept");
});

test("-7 constellationImgOf / isGenericActivityImg equal the oracle-constellation-img rows", async () => {
  await characterise("oracle-constellation-img", core.constellationImgOf, [
    ["custom.webp", "item.webp", "archer"],
    ["icons/svg/mystery-man.svg", "item.webp", "chalice"],
    ["systems/dnd5e/icons/svg/activity/attack.svg", "item.webp", "dragon"],
    ["", "item.webp", "archer"],
    [undefined, "item.webp", "nebula"],
    [null, undefined, "nebula"]
  ], { file });
  for (const img of ["icons/svg/mystery-man.svg", "systems/dnd5e/icons/svg/activity/attack.svg", ""]) assert.equal(core.isGenericActivityImg(img), true, img);
  assert.equal(core.isGenericActivityImg("icons/x.webp"), false);
});

test("-7 pickStarryBase equals the oracle-base-effect rows", async () => {
  const fx = (name, changes = []) => ({ name, changes });
  const item = { effects: { contents: [fx("Starry Form"), fx("Starry Form: Dragon"), fx("Dragon (Twinkling)", [{ key: "system.attributes.movement.fly", value: "20" }])] } };
  const onlyFly = { effects: { contents: [fx("Dragon", [{ key: "system.attributes.movement.speeds.fly" }])] } };
  const run = (it, c, tw) => core.pickStarryBase(it?.effects?.contents ?? [], c, tw)?.name ?? null;
  await characterise("oracle-base-effect", run, [
    [item, "dragon", true], [item, "dragon", false], [onlyFly, "dragon", false], [item, "archer", false],
    [{ effects: { contents: [fx("starry form")] } }, "chalice", false], [{ effects: { contents: [] } }, "archer", true], [null, "dragon", true]
  ], { file });
});

test("-7 starryEndKey equals the oracle-starry-end-key rows", async () => {
  await characterise("oracle-starry-end-key", core.starryEndKey, ["incapacitated", "expired", "manual", undefined, "longRest"], { file });
});

/* ── 8.6 shapingPlan (the pure half of shaping the form) ──────────────────── */

test("shapingPlan: strip, rename, the timed effect and the form flag; no duration → no end time", () => {
  const ws = { _id: "ws", type: "feat", name: "Wild Shape", system: { activities: { a: { type: "transform", transform: { preset: "wildshape" } } } } };
  const rn = { _id: "rn", type: "feat", name: "Return to Normal Form", flags: { "pentaryn-transform": { revert: true } }, system: {} };
  const bite = { _id: "bite", type: "weapon", name: "Bite", system: {} };
  const meta = { wildShapeId: "ws", hostItemIds: ["ws", "rn"], hostName: "Talo", hostImg: "talo.webp", hostId: "talo",
    hostEffectIds: ["bless"], profile: "p1", seconds: 21600, traitsHtml: "<p>T</p>" };
  const plan = core.shapingPlan({ meta, source: { name: "Dire Wolf", img: "w.webp", uuid: "Actor.w" }, items: [ws, rn, bite],
    effects: [{ _id: "bless" }, { _id: "keen" }], now: 100, end: "END", effectName: "Wild Shape: Dire Wolf" });
  assert.deepEqual(plan.keep.map(i => i._id), ["rn", "bite"]);
  assert.deepEqual(plan.stripped, [{ _id: "ws", name: "Wild Shape", reason: "wildshape" }]);
  assert.deepEqual(plan.renames, [{ _id: "rn", name: "Return to Talo", img: "talo.webp" }]);
  assert.deepEqual(plan.effect, { _id: core.EFFECT_ID, name: "Wild Shape: Dire Wolf", img: "w.webp", transfer: false, disabled: false,
    duration: { value: 21600, units: "seconds", expiry: null }, start: { time: 100 }, description: "<p>END</p><p>T</p>",
    flags: { "pentaryn-transform": { wildshape: true } } });
  assert.deepEqual(plan.flag, { original: "talo", source: "Actor.w", profile: "p1", endsAt: 21700, carried: ["bless"] });
  const timeless = core.shapingPlan({ meta: { ...meta, seconds: null, traitsHtml: undefined }, source: { name: "X", img: "x", uuid: "u" },
    items: [], effects: undefined, now: 5, end: "E", effectName: "N" });
  assert.equal("duration" in timeless.effect, false);
  assert.equal(timeless.effect.description, "<p>E</p>");
  assert.equal(timeless.flag.endsAt, null);
  assert.deepEqual(timeless.flag.carried, []);
});
