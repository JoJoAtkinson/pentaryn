// Characterisation pins (cleanup pass, 0.10.2): the glue around the drag help, asserted as it behaves NOW.
// settings.mjs · telemetry-core.mjs / telemetry.mjs · api.mjs / api-manifest.mjs · movement.mjs (the entry) · ghost.mjs ·
// ghost-combat.mjs · file.mjs · drop.mjs (notices, the cap, fellBack, planLater / launchLater) · combat-adapter.mjs ·
// group-adapter.mjs inCombat. A behaviour that looks wrong is pinned all the same and marked ODD.
//
// One process, one stand-in world; the sections run in this order: (1) no feature installed (settings, adapters, the
// pure telemetry core) · (2) the real entry booted (API rows, selftest, the toolbar buttons, setGhost(ref)) · (3) the
// entry's lifecycle by hot re-import · (4) features installed one by one on a mini ctx (telemetry and the breaker,
// file.mjs, drop.mjs with a stubbed planner) · (5) the manifest drift, last (its entry cannot be uninstalled).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { GM, OTHER, PLAYER, SCENE, actor, combat, drop as coreDrop, movementWorld, token } from "./fixtures/world.mjs";
import { makeUser } from "./kit/foundry-stub.mjs";
import { ASSIST_KEYS, DEFAULT_POLICY, MODULE as MOD, NS, VERSION } from "../movement-core.mjs";
import { DEFAULT_PATHFIND } from "../pathfind-core.mjs";
import { MANIFEST } from "../api-manifest.mjs";
import {
  KEYBINDINGS, RETIRED, SETTINGS, assistTripped, dnd5eMovementAutomation, migrateSettings, onKey, policyWrite, registerSettings,
  setting, settingsMigrated, settingsSnapshot, tripAssist, unreadableSettings, untripAssist,
} from "../settings.mjs";
import { BREAKER, FAILED, KINDS, TELEMETRY, breakerTrips, lineOf, push, reportText, ring, since, summarize } from "../telemetry-core.mjs";
import { combatSummaries, exemptActor, exemptInputs, exemptTokenIds, ownedTokenActors, sceneIdOf, sceneOf } from "../combat-adapter.mjs";
import { inCombat } from "../group-adapter.mjs";
import { hookRegistry } from "../lib/hooks.mjs";

const T0 = Date.parse("2026-11-25T12:00:00.000Z");
mock.timers.enable({ apis: ["setTimeout", "Date"], now: T0 });
/** The page clock the telemetry and the planners read (performance.now): moved only by the tests. */
const clock = { t: 0 };
Object.defineProperty(globalThis, "performance", { value: { now: () => clock.t }, configurable: true, writable: true });

const F = await movementWorld();
// The features read `foundry` when they load: after the stand-in world is up.
const ghost = await import("../ghost.mjs");
const telemetry = await import("../telemetry.mjs");
const file = await import("../file.mjs");
const dropFeature = await import("../drop.mjs");
const chats = [];
globalThis.ChatMessage = { create: async data => { chats.push(data); return data; } };

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
/** Let every queued debounce (and the refreshes it causes) run to the end. */
async function settle() {
  for (let i = 0; i < 6; i++) { mock.timers.tick(60); await flush(); }
}
const mark = () => F.calls.length;
const since_ = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const toasts = from => since_(from, "notify").map(c => [c.level, c.message, c.opts]);
const asPlayer = () => F.become({ userId: PLAYER });
const asGM = () => F.become({ userId: GM });
const me = () => game.user;
const gmUser = () => game.users.get(GM);
const loc = key => game.i18n.localize(key);
/** A second GM with the lower id: the active one (highest role, then lowest id), so the stub GM user is not. */
const GM0 = "gmUser0000000000";
function addGM0() { if (!game.users.get(GM0)) game.users.set(GM0, makeUser({ id: GM0, name: "Gamemaster Zero", isGM: true })); }
function removeGM0() { game.users.delete(GM0); }
async function set(key, value) { await game.settings.set(MOD, key, value); await settle(); }
async function resetSettings() {
  asPlayer();
  gmUser().active = true;
  removeGM0();
  for (const r of SETTINGS) await game.settings.set(MOD, r.key, r.default);
  game.combats.contents = [];
  untripAssist();
  await settle();
}

registerSettings();

/* ============================================================================================================ */
/*  1. settings.mjs                                                                                              */
/* ============================================================================================================ */

test("SETTINGS: eight rows in order with scope, config, type and default; the drag rows default everyone / true / true", () => {
  assert.ok(Object.isFrozen(SETTINGS));
  assert.deepEqual(SETTINGS.map(r => [r.key, r.scope, r.config, r.type.name, r.default]), [
    ["ghostPolicy", "world", true, "String", "exploration"],
    ["ghostPolicyLast", "world", false, "String", "exploration"],
    ["ghost", "client", false, "Boolean", false],
    ["ownedOnTop", "client", true, "Boolean", true],
    ["pathfinding", "world", true, "String", "everyone"],
    ["pathfindMine", "client", true, "Boolean", true],
    ["groupDrags", "world", true, "Boolean", true],
    ["assist", "world", true, "Boolean", true],
  ]);
  assert.equal(DEFAULT_POLICY, "exploration");
  assert.equal(DEFAULT_PATHFIND, "everyone");
  assert.deepEqual(Object.keys(SETTINGS.find(r => r.key === "ghostPolicy").choices), ["off", "exploration", "always"]);
  assert.deepEqual(Object.keys(SETTINGS.find(r => r.key === "pathfinding").choices), ["everyone", "gm", "off"]);
  assert.deepEqual(SETTINGS.filter(r => typeof r.onChange === "function").map(r => r.key),
    ["ghostPolicy", "ghost", "ownedOnTop", "pathfinding", "pathfindMine", "groupDrags", "assist"], "ghostPolicyLast has no onChange");
  for (const r of SETTINGS) assert.ok(r.name?.startsWith("PENTARYN_MOVEMENT.") && r.hint?.startsWith("PENTARYN_MOVEMENT.") && r.doc, r.key);
});

test("registerSettings: registers every row once (a second call registers nothing) and the Alt+W keybinding", () => {
  const rows = [...game.settings.settings.values()].filter(s => s.namespace === MOD).map(s => s.key);
  assert.deepEqual(rows, SETTINGS.map(r => r.key));
  const before = F.calls.filter(c => c.op === "settings.register").length;
  registerSettings();
  assert.equal(F.calls.filter(c => c.op === "settings.register").length, before, "already registered rows are skipped");
  const kb = game.keybindings.actions.get(`${MOD}.wrongMove`);
  assert.ok(kb);
  assert.deepEqual(kb.editable, [{ key: "KeyW", modifiers: ["Alt"] }]);
});

test("KEYBINDINGS: one row, wrongMove on Alt+KeyW; onDown forwards to what onKey registered, false with none", () => {
  assert.equal(KEYBINDINGS.length, 1);
  const [row] = KEYBINDINGS;
  assert.equal(row.key, "wrongMove");
  assert.deepEqual(row.editable, [{ key: "KeyW", modifiers: ["Alt"] }]);
  assert.equal(row.name, "PENTARYN_MOVEMENT.telemetry.wrongMove.name");
  assert.equal(row.onDown(), false, "no handler registered: false");
  onKey("wrongMove", () => "consumed");
  assert.equal(row.onDown(), "consumed");
  onKey("wrongMove", null);
  assert.equal(row.onDown(), false, "null removes it");
});

test("setting(): with assist false, pathfinding reads off and groupDrags false whatever is stored; other keys are not affected", async () => {
  await resetSettings();
  await set("pathfinding", "gm");
  assert.equal(setting("pathfinding"), "gm");
  assert.equal(setting("groupDrags"), true);
  await set("assist", false);
  assert.equal(setting("pathfinding"), "off");
  assert.equal(setting("groupDrags"), false);
  assert.equal(game.settings.get(MOD, "pathfinding"), "gm", "the stored value is untouched");
  assert.equal(game.settings.get(MOD, "groupDrags"), true);
  assert.equal(setting("ghostPolicy"), "exploration", "a non-assisted key is unaffected");
  assert.equal(setting("pathfindMine"), true);
  assert.equal(setting("assist"), false);
  assert.equal(settingsSnapshot().pathfinding, "gm", "the snapshot is the raw stored value");
  assert.equal(setting("nosuchkey"), undefined);
  await set("assist", true);
  assert.equal(setting("pathfinding"), "gm");
  assert.equal(setting("groupDrags"), true);
  await resetSettings();
});

test("tripAssist / untripAssist / assistTripped: a trip reads like assist off, until untripped; assistTripped is a copy", async () => {
  await resetSettings();
  assert.equal(assistTripped(), null);
  const at = new Date(Date.now()).toISOString();
  tripAssist("x");
  assert.equal(setting("pathfinding"), "off");
  assert.equal(setting("groupDrags"), false);
  assert.equal(setting("ghostPolicy"), "exploration");
  const t = assistTripped();
  assert.deepEqual(t, { at, why: "x" });
  t.why = "mutated";
  t.extra = 1;
  assert.deepEqual(assistTripped(), { at, why: "x" }, "mutating the copy changes nothing");
  untripAssist();
  assert.equal(setting("pathfinding"), "everyone");
  assert.equal(setting("groupDrags"), true);
  assert.equal(assistTripped(), null);
  tripAssist();
  assert.equal(assistTripped().why, "errors", "the default reason");
  untripAssist();
});

test("RETIRED: groupMovement became groupDrags; fightGroupDrags and groupStagger are gone; smoothCorners and clickToStop were folded in", () => {
  assert.deepEqual(RETIRED.world, { groupMovement: "groupDrags", fightGroupDrags: null, groupStagger: null });
  assert.deepEqual(RETIRED.client, { smoothCorners: null, clickToStop: null });
  assert.ok(Object.isFrozen(RETIRED));
});

/** Run `fn` as this identity for the migration: "active" GM, "second" GM (another one is active) or "player". */
async function migrating(who, fn) {
  const user = me();
  const wasGM = user.isGM;
  const savedStorage = game.settings.storage;
  const savedLocal = globalThis.localStorage;
  if (who === "active") { asGM(); gmUser().active = true; }
  else if (who === "second") { asGM(); addGM0(); }
  else asPlayer();
  try { return await fn(); }
  finally {
    removeGM0();
    asPlayer();
    user.isGM = wasGM;
    if (savedStorage === undefined) delete game.settings.storage; else game.settings.storage = savedStorage;
    if (savedLocal === undefined) delete globalThis.localStorage; else globalThis.localStorage = savedLocal;
    await resetSettings();
  }
}
/** A world-settings store with the given old rows ({ key: stored JSON string }); deletions land in `deleted`. */
function worldStore(rows, deleted) {
  game.settings.storage = new Map([["world", { getSetting: key => {
    const name = key.replace(`${MOD}.`, "");
    return name in rows ? { value: rows[name], delete: async () => { deleted.push(name); } } : null;
  } }]]);
}

test("migrateSettings as the active GM: groupMovement false moves to groupDrags, the old row is deleted; the null targets are only deleted", async () => {
  await migrating("active", async () => {
    const deleted = [];
    worldStore({ groupMovement: "false", fightGroupDrags: "true", groupStagger: "false" }, deleted);
    const from = mark();
    const out = await migrateSettings();
    assert.deepEqual(out.world, {
      groupMovement: { value: false, to: "groupDrags", moved: true },
      fightGroupDrags: { value: true, to: null, moved: true },
      groupStagger: { value: false, to: null, moved: true },
    });
    assert.deepEqual(out.client, {});
    assert.equal(game.settings.get(MOD, "groupDrags"), false);
    assert.deepEqual(deleted, ["groupMovement", "fightGroupDrags", "groupStagger"]);
    assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.groupDrags`, false]], "only groupDrags is written");
    assert.equal(settingsMigrated(), out, "settingsMigrated() is the last result");
  });
});

test("migrateSettings as a non-GM, and as a GM that is not the active one: reported, moved false, nothing written or deleted", async () => {
  for (const who of ["player", "second"]) {
    await migrating(who, async () => {
      const deleted = [];
      worldStore({ groupMovement: "false" }, deleted);
      const from = mark();
      const out = await migrateSettings();
      assert.deepEqual(out.world, { groupMovement: { value: false, to: "groupDrags", moved: false } }, who);
      assert.deepEqual(deleted, [], who);
      assert.deepEqual(since_(from, "settings.set"), [], who);
      assert.equal(game.settings.get(MOD, "groupDrags"), true, who);
    });
  }
});

test("migrateSettings ODD: a non-boolean stored value is not copied, yet the old document is still deleted and reported moved", async () => {
  await migrating("active", async () => {
    const deleted = [];
    worldStore({ groupMovement: "\"yes\"" }, deleted);
    const from = mark();
    let out = await migrateSettings();
    assert.deepEqual(out.world, { groupMovement: { value: "yes", to: "groupDrags", moved: true } });
    assert.deepEqual(deleted, ["groupMovement"]);
    assert.deepEqual(since_(from, "settings.set"), [], "groupDrags was not written");
    // Not JSON at all: the raw string. A value that is already a boolean (not a string) is read as it is.
    deleted.length = 0;
    worldStore({ groupMovement: "maybe" }, deleted);
    out = await migrateSettings();
    assert.deepEqual(out.world.groupMovement, { value: "maybe", to: "groupDrags", moved: true });
    deleted.length = 0;
    worldStore({ groupMovement: false }, deleted);
    out = await migrateSettings();
    assert.deepEqual(out.world.groupMovement, { value: false, to: "groupDrags", moved: true });
    assert.equal(game.settings.get(MOD, "groupDrags"), false);
  });
});

test("migrateSettings: the folded client rows are dropped from this browser's storage and reported { value, folded: true }; no storage, nothing", async () => {
  await migrating("player", async () => {
    let out = await migrateSettings();
    assert.deepEqual(out, { world: {}, client: {} }, "no storage at all");
    const local = new Map([[`${MOD}.clickToStop`, "false"], [`${MOD}.smoothCorners`, "true"], [`${MOD}.pathfindMine`, "true"], [`${MOD}.other`, "x"]]);
    const removed = [];
    globalThis.localStorage = { getItem: k => (local.has(k) ? local.get(k) : null), removeItem: k => { removed.push(k); local.delete(k); } };
    out = await migrateSettings();
    assert.deepEqual(out.client, { smoothCorners: { value: true, folded: true }, clickToStop: { value: false, folded: true } });
    assert.deepEqual(removed, [`${MOD}.smoothCorners`, `${MOD}.clickToStop`], "in RETIRED.client order");
    assert.deepEqual([...local.keys()].sort(), [`${MOD}.other`, `${MOD}.pathfindMine`], "only the folded rows go");
    assert.equal(out.error, undefined);
    out = await migrateSettings();
    assert.deepEqual(out.client, {}, "once");
    local.set(`${MOD}.clickToStop`, "not json");
    out = await migrateSettings();
    assert.deepEqual(out.client.clickToStop, { value: "not json", folded: true });
  });
});

test("migrateSettings: a throwing store sets out.error and never throws; the client rows still fold; the first error is kept", async () => {
  await migrating("active", async () => {
    game.settings.storage = { get: () => { throw new Error("store down"); } };
    const local = new Map([[`${MOD}.clickToStop`, "true"]]);
    globalThis.localStorage = { getItem: k => (local.has(k) ? local.get(k) : null), removeItem: k => local.delete(k) };
    let out = await migrateSettings();
    assert.equal(out.error, "store down");
    assert.deepEqual(out.client, { clickToStop: { value: true, folded: true } });
    assert.equal(settingsMigrated(), out);
    // Both stores throw: the first message stays.
    game.settings.storage = { get: () => { throw new Error("first"); } };
    globalThis.localStorage = { getItem: () => { throw new Error("second"); }, removeItem() {} };
    out = await migrateSettings();
    assert.equal(out.error, "first");
    // A doc whose delete throws also lands in error, and the rest of the world rows are not reached.
    const deleted = [];
    game.settings.storage = new Map([["world", { getSetting: key => (key.endsWith("groupMovement") ? { value: "true", delete: async () => { throw new Error("delete refused"); } } : { value: "true", delete: async () => { deleted.push(key); } }) }]]);
    delete globalThis.localStorage;
    out = await migrateSettings();
    assert.equal(out.error, "delete refused");
    assert.deepEqual(out.world.groupMovement, { value: true, to: "groupDrags", moved: false });
    assert.deepEqual(deleted, [], "the loop stopped at the first throw");
  });
});

test("unreadableSettings(): empty when every row reads as its default's type; an unregistered key, a wrong type and a throwing read are listed", async () => {
  await resetSettings();
  assert.deepEqual(unreadableSettings(), []);
  await game.settings.set(MOD, "ghostPolicy", 5);
  await game.settings.set(MOD, "ghost", "yes");
  assert.deepEqual(unreadableSettings(), ["ghostPolicy", "ghost"], "another type than the default");
  await resetSettings();
  const id = `${MOD}.assist`;
  const row = game.settings.settings.get(id);
  game.settings.settings.delete(id);
  assert.deepEqual(unreadableSettings(), ["assist"], "unregistered");
  game.settings.settings.set(id, row);
  const realGet = game.settings.get;
  game.settings.get = (ns, key) => { if (key === "pathfindMine") throw new Error("unreadable"); return realGet.call(game.settings, ns, key); };
  try { assert.deepEqual(unreadableSettings(), ["pathfindMine"], "a read that throws"); }
  finally { game.settings.get = realGet; }
  assert.deepEqual(unreadableSettings(), []);
});

test("dnd5eMovementAutomation(): 'none' when the dnd5e setting is unreadable, else its value", () => {
  assert.equal(dnd5eMovementAutomation(), "none");
  game.settings.register("dnd5e", "movementAutomation", { scope: "world", config: false, type: String, default: "full" });
  try {
    assert.equal(dnd5eMovementAutomation(), "full");
    const realGet = game.settings.get;
    game.settings.get = () => { throw new Error("nope"); };
    try { assert.equal(dnd5eMovementAutomation(), "none"); } finally { game.settings.get = realGet; }
  } finally { game.settings.settings.delete("dnd5e.movementAutomation"); }
});

test("policyWrite: two concurrent writes run in call order; a rejection rejects only its own caller", async () => {
  const order = [];
  let release;
  const gate = new Promise(r => { release = r; });
  const a = policyWrite(async () => { order.push("a1"); await gate; order.push("a2"); return "A"; });
  const b = policyWrite(async () => { order.push("b"); return "B"; });
  await flush();
  assert.deepEqual(order, ["a1"], "the second waits for the first to finish");
  release();
  assert.deepEqual(await Promise.all([a, b]), ["A", "B"]);
  assert.deepEqual(order, ["a1", "a2", "b"]);
  const c = policyWrite(async () => { throw new Error("c failed"); });
  const d = policyWrite(async () => "D");
  await assert.rejects(c, { message: "c failed" });
  assert.equal(await d, "D", "later writes still run");
  assert.equal(await policyWrite(() => "sync"), "sync");
});

/* ============================================================================================================ */
/*  1b. combat-adapter.mjs and group-adapter.mjs inCombat                                                         */
/* ============================================================================================================ */

test("combat-adapter exemption table (golden): the incorporeal feats, the GM flag, neither", () => {
  const rows = [
    ["Incorporeal Passage feat", { feats: ["Incorporeal Passage"] }],
    ["Incorporeal Movement feat", { feats: ["Incorporeal Movement"] }],
    ["Ethereal feat", { feats: ["Ethereal"] }],
    ["Etherealness feat (matches /Ethereal/)", { feats: ["Etherealness"] }],
    ["lower case", { feats: ["incorporeal movement"] }],
    ["Incorporeal alone", { feats: ["Incorporeal"] }],
    ["Etherealness SPELL", { spells: ["Etherealness"] }],
    ["Incorporeal Passage SPELL", { spells: ["Incorporeal Passage"] }],
    ["the GM flag", { flag: true }],
    ["flag false", { flag: false }],
    ["neither", { feats: ["Arcane Recovery"], spells: ["Shield"] }],
    ["feat and flag", { feats: ["Ethereal"], flag: true }],
  ];
  const got = rows.map(([label, spec]) => {
    const a = actor(spec);
    const inp = exemptInputs(a);
    return [label, exemptActor(a), inp.flag, inp.items.map(i => `${i.type}:${i.name}`)];
  });
  assert.deepEqual(got, [
    ["Incorporeal Passage feat", true, false, ["feat:Incorporeal Passage"]],
    ["Incorporeal Movement feat", true, false, ["feat:Incorporeal Movement"]],
    ["Ethereal feat", true, false, ["feat:Ethereal"]],
    ["Etherealness feat (matches /Ethereal/)", true, false, ["feat:Etherealness"]],
    ["lower case", true, false, ["feat:incorporeal movement"]],
    ["Incorporeal alone", false, false, ["feat:Incorporeal"]],
    ["Etherealness SPELL", false, false, ["spell:Etherealness"]],
    ["Incorporeal Passage SPELL", false, false, ["spell:Incorporeal Passage"]],
    ["the GM flag", true, true, []],
    ["flag false", false, false, []],
    ["neither", false, false, ["feat:Arcane Recovery", "spell:Shield"]],
    ["feat and flag", true, true, ["feat:Ethereal"]],
  ]);
  assert.equal(exemptInputs(null), null);
  assert.equal(exemptActor(null), false);
  assert.equal(exemptActor(undefined), false);
  assert.deepEqual(exemptInputs({ flags: { [MOD]: { ghostInCombat: "yes" } }, items: [{ type: "feat", name: "x" }] }), { items: [{ type: "feat", name: "x" }], flag: false }, "only === true counts, items as a plain array");
  assert.deepEqual(exemptInputs({ flags: {} }), { items: [], flag: false });
});

test("exemptTokenIds / ownedTokenActors: only the owned tokens of the scene whose actor is exempt; tokens without an actor are left out", () => {
  const tok = (id, owner, a, name) => ({ id, isOwner: owner, actor: a, name });
  const scene = { tokens: { contents: [
    tok("spirit", true, actor({ feats: ["Incorporeal Passage"] }), "Spirit"),
    tok("flagged", true, actor({ flag: true })),
    tok("plain", true, actor({})),
    tok("theirs", false, actor({ feats: ["Ethereal"] })),
    tok("bare", true, null),
  ] } };
  assert.deepEqual(exemptTokenIds(scene), ["spirit", "flagged"]);
  assert.deepEqual(ownedTokenActors(scene).map(t => [t.id, t.name]), [["spirit", "Spirit"], ["flagged", ""], ["plain", ""]]);
  assert.deepEqual(exemptTokenIds({ tokens: [tok("a", true, actor({ flag: true }))] }), ["a"], "an array of tokens works");
  assert.deepEqual(exemptTokenIds(null), []);
  assert.deepEqual(exemptTokenIds({}), []);
});

test("combatSummaries, sceneOf, sceneIdOf: hidden combatants are left out; ids and documents are accepted", () => {
  const list = combatSummaries([
    combat({ combatants: [{ sceneId: SCENE }, { sceneId: OTHER, hidden: true }, { sceneId: undefined, token: { parent: { id: OTHER } } }] }),
    combat({ sceneId: null, active: false, started: false, combatants: [] }),
  ]);
  assert.deepEqual(list, [
    { active: true, sceneId: SCENE, started: true, combatantSceneIds: [SCENE, OTHER] },
    { active: false, sceneId: null, started: false, combatantSceneIds: [] },
  ]);
  assert.deepEqual(combatSummaries(null), []);
  const sc = { id: "scene123", name: "S" };
  game.scenes.set(sc.id, sc);
  assert.equal(sceneOf("scene123"), sc);
  assert.equal(sceneOf("nope"), null);
  assert.equal(sceneOf(""), null);
  assert.equal(sceneOf(sc), sc);
  assert.equal(sceneOf(42), null);
  assert.equal(sceneIdOf("abc"), "abc");
  assert.equal(sceneIdOf(""), null);
  assert.equal(sceneIdOf(sc), "scene123");
  assert.equal(sceneIdOf({ id: 5 }), null);
  assert.equal(sceneIdOf(null), null);
  game.scenes.delete(sc.id);
});

test("group-adapter inCombat: a started combat with the token's combatant is a fight; an unstarted or inactive one is not; the GM viewing another scene still reads game.combats (AR2-01)", () => {
  const doc = (extra = {}) => ({ id: "tokA", parent: { id: SCENE }, ...extra });
  const fight = ({ started = true, active = true, scene = SCENE, combatants = [{ tokenId: "tokA", sceneId: SCENE }] } = {}) =>
    ({ active, started, scene: scene ? { id: scene } : null, _source: { scene }, combatants: { contents: combatants } });
  const saved = game.combats.contents;
  const savedScene = canvas.scene;
  try {
    game.combats.contents = [fight()];
    assert.equal(inCombat(doc()), true);
    game.combats.contents = [fight({ started: false })];
    assert.equal(inCombat(doc()), false, "an unstarted combat");
    game.combats.contents = [fight({ active: false })];
    assert.equal(inCombat(doc()), false, "an inactive one");
    game.combats.contents = [fight({ combatants: [{ tokenId: "someoneElse", sceneId: SCENE }] })];
    assert.equal(inCombat(doc()), false, "its combatant is not in it");
    game.combats.contents = [fight({ scene: OTHER, combatants: [{ tokenId: "tokA", sceneId: OTHER }] })];
    assert.equal(inCombat(doc()), false, "a combat on another scene");
    game.combats.contents = [fight({ scene: null, combatants: [{ tokenId: "tokA" }] })];
    assert.equal(inCombat(doc()), true, "a combat with no scene: the combatant's own scene falls back to the token's");
    // Core's own test wins; one that throws falls through to the combats.
    game.combats.contents = [];
    assert.equal(inCombat(doc({ _shouldRecordMovementHistory: () => true })), true);
    assert.equal(inCombat(doc({ _shouldRecordMovementHistory: () => false })), false);
    game.combats.contents = [fight()];
    const quiet = mock.method(console, "debug", () => {});
    try { assert.equal(inCombat(doc({ _shouldRecordMovementHistory: () => { throw new Error("x"); } })), true); } finally { quiet.mock.restore(); }
    // AR2-01: the GM views another scene, core's game.combat reads none there: the scene's own combat counts.
    canvas.scene = { id: OTHER };
    assert.equal(inCombat(doc({ _shouldRecordMovementHistory: () => false })), true);
    assert.equal(inCombat({ id: "tokA" }), false, "a token with no scene");
    assert.equal(inCombat(null), false);
    game.combats.contents = [];
  } finally { game.combats.contents = saved; canvas.scene = savedScene; }
});

/* ============================================================================================================ */
/*  1c. telemetry-core.mjs                                                                                        */
/* ============================================================================================================ */

test("telemetry-core constants: TELEMETRY, BREAKER, the event kinds and the failed fallback reasons", () => {
  assert.deepEqual({ ...TELEMETRY }, { keep: 400, windowMs: 10000, stallMs: 150, textMax: 3600 });
  assert.deepEqual({ ...BREAKER }, { errors: 3, fallbacks: 6 });
  assert.deepEqual([...KINDS], ["plan", "fire", "yield", "fallback", "stall", "lostRace", "stop", "cut", "notice", "error", "queue", "breaker", "wave"]);
  assert.deepEqual([...FAILED].sort(), ["budget", "deliver", "error", "noPlan", "noAnchor", "throw"].sort());
});

test("breakerTrips: 3 errors trip, 6 failed plans trip, 2 and 5 do not; errors are looked at first", () => {
  const r = ring();
  r.failures.errors = 2;
  assert.deepEqual(breakerTrips(r), { trip: false, why: null });
  r.failures.errors = 3;
  assert.deepEqual(breakerTrips(r), { trip: true, why: "3 errors" });
  r.failures = { errors: 0, fallbacks: 5 };
  assert.deepEqual(breakerTrips(r), { trip: false, why: null });
  r.failures.fallbacks = 6;
  assert.deepEqual(breakerTrips(r), { trip: true, why: "6 failed plans" });
  r.failures = { errors: 9, fallbacks: 9 };
  assert.equal(breakerTrips(r).why, "9 errors");
  assert.deepEqual(breakerTrips(ring(), { errors: 1, fallbacks: 1 }), { trip: false, why: null }, "custom limits");
  assert.equal(breakerTrips({ failures: { errors: 1, fallbacks: 0 } }, { errors: 1, fallbacks: 1 }).trip, true);
});

test("push counts failures: budget, throw, noPlan, noAnchor, error and deliver fallbacks count; single, ghost and tooMany do not", () => {
  const r = ring();
  for (const reason of ["budget", "throw", "noPlan", "noAnchor", "error", "deliver"]) push(r, "fallback", { reason });
  assert.deepEqual(r.failures, { errors: 0, fallbacks: 6 });
  for (const reason of ["single", "ghost", "tooMany", undefined]) push(r, "fallback", { reason });
  assert.deepEqual(r.failures, { errors: 0, fallbacks: 6 }, "by design: core's own paths");
  assert.equal(r.counts.fallback, 10, "all are counted as events");
  push(r, "error", { reason: "drop" });
  push(r, "notice", { reason: "budget" });
  assert.deepEqual(r.failures, { errors: 1, fallbacks: 6 });
  assert.equal(r.seq, 12);
  assert.deepEqual(push(r, "plan", { ms: 3 }, 500), { ms: 3, n: 13, t: 500, kind: "plan" });
  assert.equal(push(r, "nosuchkind").kind, "nosuchkind");
  assert.equal(r.counts.nosuchkind, 1, "an unknown kind is counted too");
});

test("ring keeps the last 400 events (older ones leave, the sequence and the counts keep going); a custom keep", () => {
  const r = ring();
  for (let i = 1; i <= 450; i++) push(r, "plan", { ms: i }, i);
  assert.equal(r.events.length, 400);
  assert.equal(r.events[0].n, 51);
  assert.equal(r.events.at(-1).n, 450);
  assert.equal(r.seq, 450);
  assert.equal(r.counts.plan, 450);
  const small = ring(3);
  for (let i = 1; i <= 5; i++) push(small, "stop", {}, i);
  assert.deepEqual(small.events.map(e => e.n), [3, 4, 5]);
});

test("since(): the events within the window before now (the boundary included)", () => {
  const r = ring();
  for (const t of [100, 5000, 9000, 10000]) push(r, "stop", {}, t);
  assert.deepEqual(since(r, 10000).map(e => e.t), [100, 5000, 9000, 10000], "10000 - 100 is within the default ten seconds");
  assert.deepEqual(since(r, 10000, 1000).map(e => e.t), [9000, 10000]);
  assert.deepEqual(since(r, 10000, 5000).map(e => e.t), [5000, 9000, 10000]);
  assert.deepEqual(since(r, 20000).map(e => e.t), [10000]);
});

test("summarize (golden): counts per kind, plan median / p95 / max, fallbacks and notices by reason, fires per plan, failures", () => {
  const r = ring();
  for (const ms of [12, 4, 30, 8, 50, 7, 100, 22, 3, 15]) push(r, "plan", { mode: "file", ms }, ms);
  push(r, "plan", { mode: "core", reason: "single" });
  for (let i = 0; i < 5; i++) push(r, "fire", {});
  push(r, "yield", {});
  push(r, "yield", {});
  for (const reason of ["budget", "budget", "noPlan", "throw", "single", undefined]) push(r, "fallback", { reason });
  for (const reason of ["noRoute", "noRoute", "short"]) push(r, "notice", { notice: "x", reason });
  push(r, "error", { reason: "drop" });
  push(r, "stall", { ms: 200 });
  assert.deepEqual(summarize(r), {
    counts: { plan: 11, fire: 5, yield: 2, fallback: 6, stall: 1, lostRace: 0, stop: 0, cut: 0, notice: 3, error: 1, queue: 0, breaker: 0, wave: 0 },
    plan: { n: 10, medianMs: 15, p95Ms: 100, maxMs: 100 },
    fallbacks: { budget: 2, noPlan: 1, throw: 1, single: 1, "?": 1 },
    notices: { noRoute: 2, short: 1 },
    firesPerPlan: 0.45,
    failures: { errors: 1, fallbacks: 4 },
  });
  assert.deepEqual(summarize(ring()), {
    counts: Object.fromEntries(KINDS.map(k => [k, 0])), plan: { n: 0, medianMs: null, p95Ms: null, maxMs: null },
    fallbacks: {}, notices: {}, firesPerPlan: null, failures: { errors: 0, fallbacks: 0 },
  });
  const one = ring();
  push(one, "plan", { ms: 9 });
  assert.deepEqual(summarize(one).plan, { n: 1, medianMs: 9, p95Ms: 9, maxMs: 9 });
});

test("lineOf / reportText: one short line per event; the oldest lines go first when the report is clipped", () => {
  assert.equal(lineOf({ n: 1, t: 8500, kind: "fallback", reason: "budget", ms: 12, skip: null, none: "", o: { a: 1 } }, 10000), "-1.5s fallback reason=budget ms=12 o={\"a\":1}");
  assert.equal(lineOf({ n: 2, t: 10000, kind: "stop" }, 10000), "-0.0s stop");
  const events = [{ n: 1, t: 1000, kind: "plan", ms: 5 }, { n: 2, t: 2000, kind: "stop" }, { n: 3, t: 3000, kind: "cut", reason: "wave" }];
  assert.equal(reportText("HEAD", events, 4000), "HEAD\n-3.0s plan ms=5\n-2.0s stop\n-1.0s cut reason=wave");
  assert.equal(reportText("HEAD", [], 4000), "HEAD\n(nothing recorded)");
  assert.equal(reportText("HEAD", events, 4000, 40), "HEAD\n-2.0s stop\n-1.0s cut reason=wave".slice(0, 40), "clipped from the front, then to max");
  assert.equal(reportText("HEAD", events, 4000, 10).length, 10);
});

/* ============================================================================================================ */
/*  2. The real entry: boot, API rows, selftest, the toolbar buttons, setGhost(ref)                              */
/* ============================================================================================================ */

let api = null;
test("boot: the entry loaded as Foundry loads it (init, setup, drawTokenLayer, ready) publishes game.pentaryn.movement", async () => {
  await import("../movement.mjs");
  F.fire("init");
  F.fire("setup");
  F.fire("drawTokenLayer", canvas.tokens);
  F.fire("ready");
  api = game.pentaryn.movement;
  assert.equal(game.modules.get(MOD).api, api);
  assert.equal(api.version, VERSION);
  assert.equal(NS, "movement");
  await settle();
});

test("API: the non-legacy rows are exactly inspect, pathfind.status, pathfind.route, planGroup, stop, telemetry, reportTelemetry, fileWrongMove, selftest", () => {
  assert.deepEqual(MANIFEST.rows.filter(r => !r.legacy).map(r => r.path),
    ["inspect", "pathfind.status", "pathfind.route", "planGroup", "stop", "telemetry", "reportTelemetry", "fileWrongMove", "selftest"]);
  assert.deepEqual(MANIFEST.rows.filter(r => r.legacy).map(r => r.path), ["status", "ghostFor", "combatActive", "setGhost", "setPolicy", "pinsUnderTokens"]);
  assert.deepEqual(MANIFEST.unlisted, ["core"]);
  assert.deepEqual(api.describe().methods.map(m => m.path), MANIFEST.rows.map(r => r.path));
});

test("selftest: ok with every setting readable; false, naming the unreadable keys, when one is not", async () => {
  await resetSettings();
  const ok = api.selftest();
  assert.equal(ok.ok, true, JSON.stringify(ok.checks.filter(c => !c.ok)));
  assert.deepEqual(ok.checks.map(c => c.label), [
    "published as module.api", `game.pentaryn.${NS} is this API`, "settings readable", "Token#_getDragConstrainOptions wrapped",
    "TokenLayer#_prepareKeyboardMovementUpdates wrapped", "Token#findMovementPath wrapped (drag pathfinding)",
    "Token#_prepareDragLeftDropUpdates wrapped (group movement)", "Token#_onClickLeft wrapped (click to stop)", "hooks registered"]);
  assert.deepEqual(ok.checks.find(c => c.label === "settings readable"), { label: "settings readable", ok: true, detail: [] });
  assert.ok(ok.checks.every(c => "detail" in c));
  const id = `${MOD}.assist`;
  const row = game.settings.settings.get(id);
  await game.settings.set(MOD, "ghostPolicy", 5);
  game.settings.settings.delete(id);
  try {
    const bad = api.selftest();
    assert.equal(bad.ok, false);
    assert.deepEqual(bad.checks.filter(c => !c.ok).map(c => [c.label, c.detail]), [["settings readable", ["ghostPolicy", "assist"]]]);
  } finally { game.settings.settings.set(id, row); await resetSettings(); }
  assert.equal(api.selftest().ok, true);
});

/** The toolbar's tools as the current identity and state build them. */
function tools() {
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  return controls.tokens.tools;
}

test("onAssistFlip: the GM's button writes the assist setting and toasts assist.on / assist.off; a player's call is a no-op", async () => {
  await resetSettings();
  asGM();
  const t = tools().pentarynDragAssist;
  assert.equal(t.active, true);
  assert.equal(t.title, ASSIST_KEYS.on);
  let from = mark();
  await t.onChange(null, false);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.assist`, false]]);
  assert.deepEqual(toasts(from), [["info", "Drag help off: plain Foundry dragging for everyone", null]]);
  assert.equal(setting("pathfinding"), "off", "the table's drag help is off");
  assert.equal(tools().pentarynDragAssist.active, false);
  assert.equal(tools().pentarynDragAssist.title, ASSIST_KEYS.off);
  from = mark();
  await t.onChange(null, true);
  assert.deepEqual(toasts(from), [["info", "Drag help on: paths round walls, groups walk together", null]]);
  assert.equal(game.settings.get(MOD, "assist"), true);
  asPlayer();
  from = mark();
  await t.onChange(null, false);
  assert.deepEqual(since_(from, "settings.set"), [], "no write from a player");
  assert.deepEqual(toasts(from), []);
  assert.equal(game.settings.get(MOD, "assist"), true);
  assert.equal(tools().pentarynDragAssist, undefined, "a player is not given the button");
  await resetSettings();
});

test("onAssistFlip: a failed write is a warning, not a throw", async () => {
  await resetSettings();
  asGM();
  const t = tools().pentarynDragAssist;
  const realSet = game.settings.set;
  const warns = [];
  const savedWarn = console.warn;
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  game.settings.set = async () => { throw new Error("write refused"); };
  try {
    const from = mark();
    await t.onChange(null, false);
    assert.deepEqual(toasts(from), []);
    assert.match(warns[0], /^pentaryn-movement \| drag help flip failed/);
  } finally { game.settings.set = realSet; console.warn = savedWarn; await resetSettings(); }
});

test("onPlayerToggle under policy off: the NOTIFY_BLOCKED.off warning, ghost written false, the controls redrawn; allowed, it writes the wish", async () => {
  await resetSettings();
  const t = tools().pentarynGhost;
  assert.ok(t, "the player's button is there while the policy allows");
  await set("ghostPolicy", "off");
  let from = mark();
  await t.onChange(null, true);
  assert.deepEqual(toasts(from), [["warn", "PENTARYN_MOVEMENT.notify.blocked.off", { localize: true }]]);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghost`, false]]);
  assert.equal(since_(from, "controls.render").length >= 1, true);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await set("ghostPolicy", "exploration");
  from = mark();
  await t.onChange(null, true);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghost`, true]]);
  assert.deepEqual(toasts(from), []);
  await t.onChange(null, false);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await resetSettings();
});

test("onGmFlip: off and back on round-trips through ghostPolicyLast, for exploration and for always; each toast names the mode now in effect", async () => {
  await resetSettings();
  asGM();
  const flip = tools().pentarynGhostPolicy.onChange;
  // exploration: last already exploration, so only the policy is written.
  let from = mark();
  await flip(null, false);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "off"]]);
  assert.deepEqual(toasts(from).map(t => t[1]), ["Player ghost movement: OFF (click to allow)"]);
  from = mark();
  await flip(null, true);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "exploration"]]);
  assert.equal(toasts(from)[0][1], loc("PENTARYN_MOVEMENT.gm.exploration"));
  // always: remembered in ghostPolicyLast on the way off, restored on the way on.
  await set("ghostPolicy", "always");
  from = mark();
  await flip(null, false);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicyLast`, "always"], [`${MOD}.ghostPolicy`, "off"]]);
  assert.equal(game.settings.get(MOD, "ghostPolicyLast"), "always");
  from = mark();
  await flip(null, true);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "always"]]);
  assert.equal(toasts(from)[0][1], loc("PENTARYN_MOVEMENT.gm.always"));
  // Turned on while it is already on: nothing to restore, the policy is written as it is.
  from = mark();
  await flip(null, true);
  assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "always"]]);
  asPlayer();
  from = mark();
  await flip(null, false);
  assert.deepEqual(since_(from, "settings.set"), [], "a player cannot flip it");
  await resetSettings();
});

test("setGhost(ref, { combat }): a player is refused NOT_GM; opts.combat must be a boolean; bad and unknown refs are refusal objects", async () => {
  await resetSettings();
  const calls = [];
  const guard = actor({ id: "guard00000000001", name: "Guard", calls });
  assert.deepEqual(await api.setGhost(guard, { combat: true }), { ok: false, code: "NOT_GM", reason: "GM only" });
  assert.deepEqual(calls, []);
  asGM();
  assert.deepEqual(await api.setGhost(guard, { combat: "yes" }), { ok: false, code: "BAD_ARGS", reason: "opts.combat must be true or false" });
  assert.deepEqual(await api.setGhost(guard), { ok: false, code: "BAD_ARGS", reason: "opts.combat must be true or false" });
  const nf = await api.setGhost("nobodyByThisName", { combat: true });
  assert.equal(nf.ok, false);
  assert.equal(nf.code, "NOT_FOUND");
  assert.equal((await api.setGhost({ not: "a document" }, { combat: true })).code, "BAD_ARGS", "the resolver's own code");
  assert.deepEqual(calls, []);
  await resetSettings();
});

test("setGhost(ref, { combat }): the flag write throwing is INTERNAL; a flag already at that value is not written; otherwise ok with one console audit line", async () => {
  await resetSettings();
  asGM();
  const calls = [];
  const a = actor({ id: "guard00000000002", name: "Guard Two", calls });
  const info = [];
  const savedInfo = console.info;
  const savedWarn = console.warn;
  console.info = (...x) => info.push(x.map(v => (typeof v === "string" ? v : JSON.stringify(v))).join(" "));
  const warns = [];
  console.warn = (...x) => warns.push(x.map(String).join(" "));
  try {
    const realSet = a.setFlag;
    a.setFlag = async () => { throw new Error("db down"); };
    assert.deepEqual(await api.setGhost(a, { combat: true }), { ok: false, code: "INTERNAL", reason: "db down" });
    assert.match(warns[0], /ghostInCombat write failed/);
    assert.deepEqual(info, [], "no audit line for a write that failed");
    a.setFlag = realSet;
    const r = await api.setGhost(a, { combat: true });
    assert.deepEqual(r, { ok: true, uuid: "Actor.guard00000000002", name: "Guard Two", ghostInCombat: true, feat: null });
    assert.equal(info.length, 1);
    assert.match(info[0], /^pentaryn-movement \| ghostInCombat \{"uuid":"Actor\.guard00000000002","on":true,"by":"gmUser0000000001"\}$/);
    // Already that value: ok, no write, no second audit line.
    assert.equal((await api.setGhost(a, { combat: true })).ok, true);
    assert.equal(calls.length, 1);
    assert.equal(info.length, 1);
    // Off when it was never on is also no write.
    const b = actor({ id: "guard00000000003", name: "Guard Three", calls });
    assert.equal((await api.setGhost(b, { combat: false })).ghostInCombat, false);
    assert.equal(calls.length, 1);
    // The feat is reported with the answer.
    const spirit = actor({ id: "spirit0000000009", name: "Spirit", feats: ["Incorporeal Passage"] });
    assert.equal((await api.setGhost(spirit, { combat: true })).feat, "Incorporeal Passage");
  } finally { console.info = savedInfo; console.warn = savedWarn; await resetSettings(); }
});

/* ============================================================================================================ */
/*  3. The entry's lifecycle (hot re-import: wiring only)                                                         */
/* ============================================================================================================ */

test("uninstall(): the features are uninstalled in reverse (telemetry, then file, then ghost) and the registry leaves no hook", async () => {
  const order = [];
  canvas.app = { ticker: { add() {}, remove() { order.push("telemetry: ticker"); } } };
  F.fire("canvasReady");                                   // telemetry starts listening for stalls
  globalThis.window = { addEventListener() {}, removeEventListener: t => order.push(`ghost: window ${t}`) };
  globalThis.document = { addEventListener() {}, removeEventListener: t => order.push(`file: document ${t}`) };
  try {
    assert.ok(api.describe().hooks.length > 10, "hooks are registered before");
    api.uninstall();
  } finally { delete globalThis.window; delete globalThis.document; }
  assert.deepEqual(order, ["telemetry: ticker", "file: document visibilitychange", "ghost: window storage"]);
  assert.deepEqual(api.describe().hooks, []);
  assert.deepEqual(api.describe().patches, [], "every wrap is taken off");
  assert.deepEqual(F.listeners(), {}, "no listener of the module is left on any hook");
  assert.equal(api.selftest().ok, false, "nothing is wrapped any more");
});

test("a late load (the world is ready): onInit, then install, then onReady, in that order; the API is published again", async () => {
  const phases = [];
  const note = p => { if (phases.at(-1) !== p && !phases.includes(p)) phases.push(p); };
  const realRegister = game.settings.register;
  const realOn = F.Hooks.on;
  const realCallAll = F.Hooks.callAll;
  game.settings.register = (ns, key, cfg) => { if (ns === MOD) note("onInit: settings registered"); return realRegister.call(game.settings, ns, key, cfg); };
  F.Hooks.on = (name, fn) => { note("install: hooks registered"); return realOn(name, fn); };
  F.Hooks.callAll = (name, ...a) => { if (name === `${MOD}.ready`) note("onReady: published"); return realCallAll(name, ...a); };
  for (const id of [...game.settings.settings.keys()]) if (id.startsWith(`${MOD}.`)) game.settings.settings.delete(id);
  try {
    assert.equal(game.ready, true);
    await import("../movement.mjs?v=late");
  } finally { game.settings.register = realRegister; F.Hooks.on = realOn; F.Hooks.callAll = realCallAll; }
  assert.deepEqual(phases, ["onInit: settings registered", "install: hooks registered", "onReady: published"]);
  api = game.pentaryn.movement;
  assert.equal(game.modules.get(MOD).api, api);
  assert.equal(api.selftest().ok, true, JSON.stringify(api.selftest().checks.filter(c => !c.ok)));
  assert.deepEqual(unreadableSettings(), []);
  await settle();
  api.uninstall();
  assert.deepEqual(F.listeners(), {});
});

/* ============================================================================================================ */
/*  4. Features on a mini ctx                                                                                     */
/* ============================================================================================================ */

/** Install `features` on a ctx of this file's own (hooks through a registry; `exposed` is the object the features share). */
function stack(features, { late = true } = {}) {
  const exposed = {};
  const logged = [];
  const once = new Set();
  const log = {
    debug() {}, traces: () => [],
    info: (...a) => logged.push({ level: "info", a }),
    warn: (...a) => logged.push({ level: "warn", a }),
    warnOnce: (key, ...a) => { if (!once.has(key)) { once.add(key); logged.push({ level: "warnOnce", key, a }); } },
    error: (...a) => logged.push({ level: "error", a }),
  };
  const reg = hookRegistry(MOD, log);
  const ctx = { log, reg, setting, onSettingChange: undefined, late, api: null, contributions: [], exposed, expose: a => Object.assign(exposed, a), uninstall() {} };
  ctx.onSettingChange = (key, fn) => settingsModule.onSettingChange(key, fn);
  for (const f of features) f.install(reg, ctx);
  return { ctx, exposed, logged, reg, down() { for (const f of [...features].reverse()) f.uninstall(); reg.offAll(); } };
}
const settingsModule = await import("../settings.mjs");

const BREAKER_FLAG = `${MOD}.breaker`;
const guardedBreaker = async fn => {
  F.CONFIG.debug[BREAKER_FLAG] = true;
  try { return await fn(); } finally { F.CONFIG.debug[BREAKER_FLAG] = false; untripAssist(); await resetSettings(); chats.length = 0; }
};

test("telemetry(): this client's events with their age, the summary, the trip and the last filing; { seconds } keeps only that window", async () => {
  await resetSettings();
  const s = stack([telemetry]);
  try {
    clock.t = 1000; s.exposed.tele("plan", { ms: 5 });
    clock.t = 5000; s.exposed.tele("stop");
    clock.t = 9000; s.exposed.tele("cut", { reason: "wave" });
    clock.t = 10000;
    const all = s.exposed.telemetry();
    assert.equal(all.user, PLAYER);
    assert.equal(all.tripped, null);
    assert.equal(all.filed, null);
    assert.deepEqual(all.events, [
      { ms: 5, n: 1, t: 1000, kind: "plan", ago: 9000 },
      { n: 2, t: 5000, kind: "stop", ago: 5000 },
      { reason: "wave", n: 3, t: 9000, kind: "cut", ago: 1000 },
    ]);
    assert.deepEqual(all.summary.counts, { plan: 1, fire: 0, yield: 0, fallback: 0, stall: 0, lostRace: 0, stop: 1, cut: 1, notice: 0, error: 0, queue: 0, breaker: 0, wave: 0 });
    assert.deepEqual(s.exposed.telemetry({ seconds: 2 }).events.map(e => e.n), [3], "only the last two seconds");
    assert.deepEqual(s.exposed.telemetry({ seconds: 5 }).events.map(e => e.n), [2, 3], "the boundary is inside");
    assert.equal(s.exposed.telemetry({ seconds: null }).events.length, 3);
    assert.equal(s.exposed.telemetry({ seconds: Number.NaN }).events.length, 3, "a non-number is all");
    assert.equal(s.exposed.telemetry({}).events.length, 3);
    assert.deepEqual(s.exposed.telemetry({ seconds: 0 }).events, [], "zero seconds is nothing");
    for (let i = 0; i < 450; i++) s.exposed.tele("yield");
    assert.equal(s.exposed.telemetry().events.length, 400, "the ring keeps 400");
  } finally { s.down(); }
  const fresh = stack([telemetry]);
  assert.equal(fresh.exposed.telemetry().events.length, 0, "uninstall emptied the ring");
  fresh.down();
});

test("tele never throws: a bad event goes to the debug log", () => {
  const s = stack([telemetry]);
  try {
    assert.doesNotThrow(() => s.exposed.tele(undefined, undefined));
    assert.doesNotThrow(() => s.exposed.tele("plan", null));
  } finally { s.down(); }
});

test("circuit breaker on the active GM's client: tripAssist, a permanent warning (breaker.gm), assist written false; 3 errors, then 2 are not enough", () => guardedBreaker(async () => {
  asGM();
  const s = stack([ghost, telemetry]);
  try {
    const from = mark();
    s.exposed.tele("error", { reason: "drop" });
    s.exposed.tele("error", { reason: "drop" });
    assert.equal(assistTripped(), null, "two errors: no trip");
    s.exposed.tele("error", { reason: "drop" });
    assert.equal(assistTripped().why, "3 errors");
    const t = since_(from, "notify");
    assert.deepEqual(t.map(c => [c.level, c.message, c.opts]), [["warn", "Drag help switched itself off after repeated failures (3 errors). Plain Foundry dragging until you turn it back on (route icon, Token controls).", { permanent: true }]]);
    assert.deepEqual(since_(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.assist`, false]]);
    assert.equal(game.settings.get(MOD, "assist"), false);
    assert.equal(setting("pathfinding"), "off");
    assert.deepEqual(s.logged.filter(l => l.level === "warn").map(l => l.a[0]),
      ["drag help switched itself off after repeated failures (3 errors); plain Foundry dragging until a reload or the GM turns it back on"]);
    assert.equal(s.exposed.telemetry().summary.counts.breaker, 1);
    assert.equal(s.exposed.telemetry().events.at(-1).kind, "breaker");
    assert.equal(s.exposed.telemetry().events.at(-1).reason, "3 errors");
    assert.equal(s.exposed.telemetry().tripped.why, "3 errors");
  } finally { s.down(); }
}));

test("circuit breaker: 6 failed plans trip it ('6 failed plans'); 5 do not, and fallbacks by design (single, ghost, tooMany) never count", () => guardedBreaker(async () => {
  asGM();
  const s = stack([ghost, telemetry]);
  try {
    for (let i = 0; i < 20; i++) s.exposed.tele("fallback", { reason: ["single", "ghost", "tooMany"][i % 3] });
    assert.equal(assistTripped(), null);
    for (let i = 0; i < 5; i++) s.exposed.tele("fallback", { reason: "budget" });
    assert.equal(assistTripped(), null, "five failed plans");
    s.exposed.tele("fallback", { reason: "throw" });
    assert.equal(assistTripped().why, "6 failed plans");
  } finally { s.down(); }
}));

test("circuit breaker after a trip: counting restarts from tripBase; turning assist back on clears the trip, and two more errors are not enough", () => guardedBreaker(async () => {
  asGM();
  const s = stack([ghost, telemetry]);
  try {
    for (let i = 0; i < 3; i++) s.exposed.tele("error");
    assert.equal(assistTripped().why, "3 errors");
    await game.settings.set(MOD, "assist", true);           // the GM turns the drag help back on: ghost's handler untrips
    await settle();
    assert.equal(assistTripped(), null, "turning assist back on clears the breaker");
    s.exposed.tele("error");
    s.exposed.tele("error");
    assert.equal(assistTripped(), null, "counted afresh: two errors since the trip");
    s.exposed.tele("error");
    assert.equal(assistTripped().why, "3 errors", "the third since the trip trips it again; the label counts from tripBase");
  } finally { s.down(); }
}));

test("circuit breaker: further failures while tripped never trip again (one breaker event); ODD: they still count after assist is turned back on", () => guardedBreaker(async () => {
  asGM();
  const s = stack([ghost, telemetry]);
  try {
    for (let i = 0; i < 3; i++) s.exposed.tele("error");
    const from = mark();
    for (let i = 0; i < 5; i++) s.exposed.tele("error");
    assert.equal(s.exposed.telemetry().summary.counts.breaker, 1, "tripped already: no second trip");
    assert.deepEqual(since_(from, "notify"), []);
    assert.deepEqual(since_(from, "settings.set"), []);
    await game.settings.set(MOD, "assist", true);
    await settle();
    assert.equal(assistTripped(), null);
    s.exposed.tele("error");
    assert.equal(assistTripped().why, "6 errors", "the five that came while tripped count from tripBase (3): the next error trips again, at once, as '6 errors'");
  } finally { s.down(); }
}));

test("circuit breaker on a GM that is not the active one: the warning, no write to the assist setting", () => guardedBreaker(async () => {
  asGM();
  addGM0();
  const s = stack([ghost, telemetry]);
  try {
    const from = mark();
    for (let i = 0; i < 3; i++) s.exposed.tele("error");
    assert.equal(assistTripped().why, "3 errors");
    assert.equal(toasts(from).length, 1);
    assert.equal(toasts(from)[0][0], "warn");
    assert.deepEqual(since_(from, "settings.set"), []);
    assert.equal(game.settings.get(MOD, "assist"), true, "the table's switch is the active GM's to write");
    assert.equal(setting("groupDrags"), false, "but this client's drag help is off");
  } finally { s.down(); removeGM0(); }
}));

test("circuit breaker on a player's client: a whisper ChatMessage to the active GMs (breaker.player), nothing on screen, nothing written", () => guardedBreaker(async () => {
  asPlayer();
  const s = stack([ghost, telemetry]);
  try {
    const from = mark();
    for (let i = 0; i < 3; i++) s.exposed.tele("error");
    await flush();
    assert.equal(assistTripped().why, "3 errors");
    assert.equal(chats.length, 1);
    const text = "Drag help switched itself off on Pat's screen after repeated failures (3 errors). It is back after their page reloads.";
    assert.deepEqual(chats[0], { content: `<p>${foundry.utils.escapeHTML(text)}</p>`, whisper: [GM], speaker: { alias: "Pentaryn Movement" } });
    assert.deepEqual(since_(from, "notify"), []);
    assert.deepEqual(since_(from, "settings.set"), []);
  } finally { s.down(); }
}));

test("circuit breaker with no GM online: tripped on this client, nobody is told", () => guardedBreaker(async () => {
  asPlayer();
  gmUser().active = false;
  const s = stack([ghost, telemetry]);
  try {
    for (let i = 0; i < 3; i++) s.exposed.tele("error");
    await flush();
    assert.equal(assistTripped().why, "3 errors");
    assert.deepEqual(chats, []);
  } finally { s.down(); gmUser().active = true; }
}));

test("circuit breaker: CONFIG.debug['pentaryn-movement.breaker'] === false never trips it; unset, it does", async () => {
  await resetSettings();
  asGM();
  const s = stack([ghost, telemetry]);
  try {
    assert.equal(F.CONFIG.debug[BREAKER_FLAG], false, "the fixture world switches it off");
    for (let i = 0; i < 12; i++) s.exposed.tele("error");
    assert.equal(assistTripped(), null);
    assert.equal(s.exposed.telemetry().summary.failures.errors, 12, "counted, not acted on");
    delete F.CONFIG.debug[BREAKER_FLAG];
    s.exposed.tele("error");
    assert.equal(assistTripped().why, "13 errors", "unset: on");
  } finally { s.down(); F.CONFIG.debug[BREAKER_FLAG] = false; untripAssist(); await resetSettings(); }
});

/** A canvas ticker the stall listener adds to, and a token this client's own move animates on. */
function tickerStub() {
  const t = { fns: [], added: 0, removed: 0, deltaMS: 0, add(fn) { this.added += 1; this.fns.push(fn); }, remove(fn) { this.removed += 1; this.fns = this.fns.filter(f => f !== fn); }, frame(ms) { this.deltaMS = ms; for (const f of [...this.fns]) f(); } };
  return t;
}
const walkingToken = (isSelf = true, animating = true) => ({
  document: { movement: { user: { isSelf }, state: "pending" } },
  movementAnimationName: "walk",
  animationContexts: new Map(animating ? [["walk", {}]] : []),
});

test("stall telemetry: a frame of 150 ms or more while a move this client started animates records a stall {ms rounded}; shorter, or nothing moving, records nothing", () => {
  const savedApp = canvas.app, savedPlaceables = canvas.tokens.placeables;
  const ticker = tickerStub();
  canvas.app = { ticker };
  const s = stack([telemetry]);
  try {
    F.fire("canvasReady");
    assert.equal(ticker.fns.length, 1, "the listener is on the ticker");
    canvas.tokens.placeables = [walkingToken()];
    ticker.frame(149.9);
    assert.equal(s.exposed.telemetry().events.length, 0, "under 150: no event");
    ticker.frame(150);
    ticker.frame(212.6);
    assert.deepEqual(s.exposed.telemetry().events.map(e => [e.kind, e.ms]), [["stall", 150], ["stall", 213]]);
    ticker.deltaMS = undefined;
    for (const f of ticker.fns) f();
    assert.equal(s.exposed.telemetry().events.length, 2, "no delta: 0 ms");
    canvas.tokens.placeables = [walkingToken(true, false)];
    ticker.frame(400);
    canvas.tokens.placeables = [walkingToken(false, true)];
    ticker.frame(400);
    canvas.tokens.placeables = [];
    ticker.frame(400);
    assert.equal(s.exposed.telemetry().events.length, 2, "nothing this client moves: no event");
    assert.equal(s.exposed.telemetry().summary.counts.stall, 2);
  } finally { s.down(); canvas.app = savedApp; canvas.tokens.placeables = savedPlaceables; }
  assert.equal(ticker.removed, 1, "uninstall takes the listener off");
});

test("listenStalls is idempotent per ticker: the same ticker is added to once; a new ticker moves the listener", () => {
  const savedApp = canvas.app;
  const first = tickerStub(), second = tickerStub();
  canvas.app = { ticker: first };
  const s = stack([telemetry], { late: true });
  try {
    assert.equal(first.added, 1, "installed late: listening at once");
    F.fire("canvasReady");
    F.fire("canvasReady");
    assert.equal(first.added, 1);
    assert.equal(first.fns.length, 1);
    canvas.app = { ticker: second };
    F.fire("canvasReady");
    assert.equal(first.removed, 1, "the old ticker lost it");
    assert.equal(second.added, 1);
    canvas.app = { ticker: {} };
    F.fire("canvasReady");
    assert.equal(second.removed, 0, "a ticker without add() is ignored: the listener stays where it was");
  } finally { s.down(); canvas.app = savedApp; }
  assert.equal(second.removed, 1);
});

test("reportTelemetry whispers the summary to the GMs; with no GM logged in it answers NO_GM and sends nothing", async () => {
  await resetSettings();
  const s = stack([telemetry]);
  try {
    clock.t = 100; s.exposed.tele("plan", { ms: 10 });
    clock.t = 200; s.exposed.tele("plan", { ms: 20 });
    s.exposed.tele("fallback", { reason: "budget" });
    chats.length = 0;
    const r = await s.exposed.reportTelemetry();
    assert.equal(r.ok, true);
    assert.equal(r.to, 1);
    assert.equal(r.summary.plan.n, 2);
    assert.equal(chats.length, 1);
    assert.deepEqual(chats[0].whisper, [GM]);
    assert.deepEqual(chats[0].speaker, { alias: "Pentaryn Movement" });
    const c = chats[0].content;
    assert.match(c, /^<p><strong>Movement report from Pat<\/strong><\/p><table>/);
    assert.deepEqual([...c.matchAll(/<tr><td>([^<]*)<\/td>/g)].map(m => m[1]),
      ["plans", "guard fires", "yields", "fallbacks", "stalls", "lost races", "stops", "cuts", "notices", "errors", "breaker"]);
    assert.ok(c.includes("<td>2 (median 20 ms, p95 20 ms, max 20 ms)</td>"));
    assert.ok(c.includes(`<td>${foundry.utils.escapeHTML(JSON.stringify({ budget: 1 }))}</td>`));
    assert.ok(c.includes("<td>breaker</td><td>-</td>"));
    gmUser().active = false;
    chats.length = 0;
    assert.deepEqual(await s.exposed.reportTelemetry(), { ok: false, code: "NO_GM", reason: "no GM is logged in" });
    assert.deepEqual(chats, []);
  } finally { s.down(); gmUser().active = true; chats.length = 0; }
});

test("fileWrongMove with pentaryn-feedback absent: its coded failure and a warning toast; with it, a bug filed with the last ten seconds", async () => {
  await resetSettings();
  game.pentaryn ??= {};
  delete game.pentaryn.feedback;
  const s = stack([telemetry]);
  try {
    let from = mark();
    assert.deepEqual(await s.exposed.fileWrongMove(), { ok: false, code: "NO_FEEDBACK", reason: "pentaryn-feedback is not active" });
    assert.deepEqual(toasts(from), [["warn", "PENTARYN_MOVEMENT.telemetry.noFeedback", undefined]].map(([a, b]) => [a, b, { localize: true }]));
    assert.equal(s.exposed.telemetry().filed, null);
    // With feedback: the head, the last drop's record, then the events of the last ten seconds (older ones are not in it).
    const filed = [];
    game.pentaryn.feedback = { submit: async draft => { filed.push(draft); return { ok: true, id: "fb1", status: "filed" }; } };
    s.exposed.groupStatus = () => ({ last: { mode: "file", reason: null } });
    clock.t = 1000; s.exposed.tele("plan", { ms: 99 });
    clock.t = 30000; s.exposed.tele("plan", { ms: 7 });
    clock.t = 31000; s.exposed.tele("cut", { reason: "wave" });
    clock.t = 32000;
    const r = await s.exposed.fileWrongMove();
    assert.deepEqual(r, { ok: true, id: "fb1", status: "filed" });
    assert.equal(filed.length, 1);
    assert.equal(filed[0].category, "bug");
    const head = `${loc("PENTARYN_MOVEMENT.telemetry.text")}\nlast drop: {"mode":"file","reason":null}`;
    assert.equal(filed[0].text, `${head}\n-2.0s plan ms=7\n-1.0s cut reason=wave`);
    assert.deepEqual(s.exposed.telemetry().filed, { at: new Date(Date.now()).toISOString(), id: "fb1", ok: true });
    // No usable answer: id null, ok false.
    game.pentaryn.feedback = { submit: async () => ({ ok: false, code: "X" }) };
    assert.deepEqual((await s.exposed.fileWrongMove()), { ok: false, code: "X" });
    assert.equal(s.exposed.telemetry().filed.id, null);
    assert.equal(s.exposed.telemetry().filed.ok, false);
    // A group status that throws is left out of the report.
    s.exposed.groupStatus = () => { throw new Error("no status"); };
    game.pentaryn.feedback = { submit: async draft => { filed.push(draft); return { ok: true, id: "fb2" }; } };
    await s.exposed.fileWrongMove();
    assert.match(filed.at(-1).text, /\nlast drop: \{\}\n/);
    assert.ok(filed.at(-1).text.length <= 3600);
  } finally { s.down(); delete game.pentaryn.feedback; }
});

test("Alt+W: the keybinding's handler starts fileWrongMove and consumes the key; a filing that throws is one suppressed warning", async () => {
  await resetSettings();
  game.pentaryn ??= {};
  const s = stack([telemetry]);
  try {
    const filed = [];
    game.pentaryn.feedback = { submit: async d => { filed.push(d); return { ok: true, id: "k1" }; } };
    assert.equal(KEYBINDINGS[0].onDown(), true, "consumed at once");
    assert.equal(filed.length, 0, "filing starts a tick later");
    await flush();
    assert.equal(filed.length, 1);
    assert.equal(s.exposed.telemetry().filed.id, "k1");
    game.pentaryn.feedback = { submit: async () => { throw new Error("feedback down"); } };
    assert.equal(KEYBINDINGS[0].onDown(), true);
    await flush();
    assert.deepEqual(s.logged.filter(l => l.level === "warnOnce").map(l => [l.key, l.a[0]]), [["telemetry-file", "could not file that move (further errors suppressed)"]]);
  } finally { s.down(); delete game.pentaryn.feedback; }
  assert.equal(KEYBINDINGS[0].onDown(), false, "uninstall takes the handler off");
});

/* ============================================================================================================ */
/*  4b. file.mjs: the groups this client holds, their waves, the fight queues, the group tags                     */
/* ============================================================================================================ */

/** A scene with the given token ids, each a document at rest that this user's client moves (isSelf) and draws. */
function sceneOfTokens(ids, extra = {}) {
  const tokens = new Map();
  const scene = { id: SCENE, tokens, ...extra };
  for (const id of ids) {
    tokens.set(id, { id, name: id, parent: scene, hidden: false, _source: { x: 0, y: 0, width: 1, height: 1 }, movement: { state: "completed", user: { isSelf: true } },
      object: { destroyed: false, document: null, animationContexts: new Map() } });
    tokens.get(id).object.document = tokens.get(id);
  }
  return scene;
}
const visStub = () => {
  const d = { visibilityState: "visible", listeners: [], addEventListener(t, fn) { if (t === "visibilitychange") d.listeners.push(fn); }, removeEventListener(t, fn) { d.listeners = d.listeners.filter(f => f !== fn); } };
  d.hide = () => { d.visibilityState = "hidden"; for (const fn of [...d.listeners]) fn(); d.visibilityState = "visible"; };
  d.hideStay = () => { d.visibilityState = "hidden"; for (const fn of [...d.listeners]) fn(); };
  return d;
};
/** A file stack that records its tele calls. */
function fileStack() {
  const s = stack([file]);
  s.tele = [];
  s.exposed.tele = (k, d) => s.tele.push([k, d]);
  return s;
}

test("file: a wave whose send throws is one suppressed warning ('file-wave') and a tele error {reason 'wave'}; later waves still fire", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b", "c"]);
    const gid = s.exposed.groupHold(["a", "b", "c"], scene);
    const sent = [];
    const send = ids => { sent.push(["sent", ids]); if (ids.includes("a")) throw new Error("wave boom"); };
    const n = s.exposed.groupWaves(gid, [{ at: 100, ids: ["a"] }, { at: 200, ids: ["b"] }, { at: 300, ids: ["c"] }, { at: 0, ids: ["z"] }, { at: 400, ids: [] }], send);
    assert.equal(n, 3, "a wave at 0 (the drop's own update) and an empty one are not scheduled");
    mock.timers.tick(100);
    assert.deepEqual(sent.map(x => x[1]), [["a"]]);
    assert.deepEqual(s.logged.filter(l => l.level === "warnOnce").map(l => [l.key, l.a[0]]), [["file-wave", "a wave of a group drag could not be sent (further errors suppressed)"]]);
    assert.deepEqual(s.tele, [["error", { reason: "wave", message: "wave boom" }]]);
    mock.timers.tick(100);
    mock.timers.tick(100);
    assert.deepEqual(sent.map(x => x[1]), [["a"], ["b"], ["c"]], "the later waves fire");
    assert.equal(s.exposed.groupPending().length, 0);
    assert.equal(s.exposed.groupWaves("unknown", [{ at: 10, ids: ["a"] }], send), 0, "no such group: nothing scheduled");
    assert.equal(s.exposed.groupWaves(gid, [{ at: 10, ids: ["a"] }], "not a function"), 0, "no sender: nothing scheduled");
  } finally { s.down(); }
});

test("onVisibility to hidden: waves due within 3 s of the drop keep their timers; later ones are re-timed to drop + 3000 ms; status().group.flushed { kept, retimed }", () => {
  const d = visStub();
  globalThis.document = d;
  const s = stack([dropFeature, file]);
  s.tele = [];
  s.exposed.tele = (k, d) => s.tele.push([k, d]);
  try {
    assert.equal(s.exposed.groupStatus().flushed, null);
    const scene = sceneOfTokens(["a", "b", "c", "d"]);
    const gid = s.exposed.groupHold(["a", "b", "c", "d"], scene);
    const t0 = Date.now();
    const sent = [];
    s.exposed.groupWaves(gid, [{ at: 1000, ids: ["a"] }, { at: 3000, ids: ["b"] }, { at: 3500, ids: ["c", "d"] }], ids => sent.push([Date.now() - t0, ids]));
    assert.deepEqual(s.exposed.groupStatus().pending.map(w => [w.at, w.ids]), [[1000, ["a"]], [3000, ["b"]], [3500, ["c", "d"]]], "status().group.pending");
    mock.timers.tick(500);
    d.visibilityState = "visible";
    for (const fn of d.listeners) fn();                                   // visible: ignored
    assert.equal(s.exposed.groupStatus().flushed, null, "going visible does nothing");
    d.hide();
    assert.deepEqual(s.exposed.groupStatus().flushed, { at: new Date(Date.now()).toISOString(), members: 4, kept: 2, retimed: 2 });
    assert.deepEqual(s.tele, [["flush", { members: 4 }]]);
    mock.timers.tick(500);                                                // now t0 + 1000
    assert.deepEqual(sent, [[1000, ["a"]]], "a kept its own timer");
    mock.timers.tick(1999);
    assert.deepEqual(sent, [[1000, ["a"]]], "nothing before 3000");
    mock.timers.tick(1);                                                  // now t0 + 3000
    assert.deepEqual(sent, [[1000, ["a"]], [3000, ["b"]], [3000, ["c", "d"]]], "the last wave went at 3000, not 3500; one wave keeps its members together");
    // Nothing left to flush: no new record.
    const before = s.exposed.groupStatus().flushed;
    d.hide();
    assert.deepEqual(s.exposed.groupStatus().flushed, before);
    assert.equal(s.tele.length, 1);
  } finally { s.down(); delete globalThis.document; }
  assert.equal(d.listeners.length, 0, "uninstall removes the listener");
});

test("onVisibility: a wave already past 3 s when the tab hides is sent at once (timed for drop + 3000 ms, which is behind it)", () => {
  const d = visStub();
  globalThis.document = d;
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a"]);
    const gid = s.exposed.groupHold(["a"], scene);
    const t0 = Date.now();
    const sent = [];
    s.exposed.groupWaves(gid, [{ at: 3900, ids: ["a"] }], ids => sent.push([Date.now() - t0, ids]));
    mock.timers.tick(3500);
    d.hide();
    assert.deepEqual(s.exposed.groupFlushed().retimed, 1);
    mock.timers.tick(0);
    assert.deepEqual(sent, [[3500, ["a"]]], "max(0, drop + 3000 - now) = 0");
  } finally { s.down(); delete globalThis.document; }
});

test("pendingEnds() lists { id, x, y } for each unsent wave member that has an end; pendingWaves() lists the waves; both empty once sent", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b", "c"]);
    const gid = s.exposed.groupHold(["a", "b", "c"], scene);
    assert.deepEqual(s.exposed.groupPending(), []);
    assert.deepEqual(s.exposed.groupPendingEnds(), []);
    const ends = new Map([["a", { x: 100, y: 200 }], ["b", { x: 300, y: 400 }]]);
    s.exposed.groupWaves(gid, [{ at: 500, ids: ["a", "c"] }, { at: 900, ids: ["b"] }], () => {}, ends);
    assert.deepEqual(s.exposed.groupPending(), [{ gid, at: 500, ids: ["a", "c"] }, { gid, at: 900, ids: ["b"] }]);
    assert.deepEqual(s.exposed.groupPendingEnds(), [{ id: "a", x: 100, y: 200 }, { id: "b", x: 300, y: 400 }], "c has no end: left out");
    mock.timers.tick(500);
    assert.deepEqual(s.exposed.groupPendingEnds(), [{ id: "b", x: 300, y: 400 }]);
    assert.deepEqual(s.exposed.groupPending().map(w => w.ids), [["b"]]);
    mock.timers.tick(400);
    assert.deepEqual(s.exposed.groupPendingEnds(), []);
    assert.deepEqual(s.exposed.groupPending(), []);
    // Waves scheduled without ends: nothing to list.
    const gid2 = s.exposed.groupHold(["a"], scene);
    s.exposed.groupWaves(gid2, [{ at: 50, ids: ["a"] }], () => {});
    assert.deepEqual(s.exposed.groupPendingEnds(), []);
    assert.equal(s.exposed.groupPending().length, 1);
  } finally { s.down(); }
});

test("groupCancel(tokenId, { why }) drops the group and its unsent waves (their timers never fire) and returns its members; groupMembers lists the group while held", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b", "c", "x"]);
    const gid = s.exposed.groupHold(["a", "b", "c"], scene);
    const sent = [];
    s.exposed.groupWaves(gid, [{ at: 100, ids: ["b"] }, { at: 200, ids: ["c"] }], ids => sent.push(ids));
    assert.deepEqual(s.exposed.groupMembers("a"), { held: true, ids: ["a", "b", "c"], sender: PLAYER });
    assert.deepEqual(s.exposed.groupMembers("c"), { held: true, ids: ["a", "b", "c"], sender: PLAYER });
    assert.deepEqual(s.exposed.groupMembers("x"), { held: false, ids: [], sender: null }, "a token in no group");
    assert.equal(s.exposed.groupHeld(), 1);
    assert.deepEqual(s.exposed.groupCancel("b", { why: "click" }), ["a", "b", "c"]);
    assert.deepEqual(s.exposed.groupMembers("a"), { held: false, ids: [], sender: null });
    assert.equal(s.exposed.groupHeld(), 0);
    mock.timers.tick(500);
    assert.deepEqual(sent, [], "the unsent waves went with it");
    assert.deepEqual(s.exposed.groupCancel("b"), [], "a second cancel: nothing to drop");
    assert.deepEqual(s.exposed.groupCancel("nobody"), []);
    // A fight queue goes too, told why.
    const gid2 = s.exposed.groupHold(["a", "b"], scene);
    const cancelled = [];
    assert.equal(s.exposed.groupQueue(gid2, { cancel: why => cancelled.push(why) }), true);
    assert.equal(s.exposed.groupQueue("nope", {}), false);
    assert.deepEqual(s.exposed.groupCancel("a", { why: "turn" }), ["a", "b"]);
    assert.deepEqual(cancelled, ["turn"]);
    assert.deepEqual(s.exposed.groupCancel("a"), []);
    // A new hold of a token moves it out of its old group.
    const g3 = s.exposed.groupHold(["a", "b"], scene);
    const g4 = s.exposed.groupHold(["b", "c"], scene);
    assert.notEqual(g3, g4);
    assert.deepEqual(s.exposed.groupMembers("a").ids, ["a"], "b left a's group");
    assert.deepEqual(s.exposed.groupMembers("b").ids, ["b", "c"]);
  } finally { s.down(); }
});

test("a group is held only while it has work or its members move: idle and unmoved for 1.5 s it is forgotten; never past HOLD_MS (60 s)", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b"]);
    s.exposed.groupHold(["a", "b"], scene);
    mock.timers.tick(1400);
    assert.equal(s.exposed.groupHeld(), 1, "within 1.5 s");
    mock.timers.tick(200);
    assert.equal(s.exposed.groupHeld(), 0, "idle, nobody moving");
    s.exposed.groupHold(["a", "b"], scene);
    scene.tokens.get("a").movement.state = "pending";
    mock.timers.tick(30000);
    assert.equal(s.exposed.groupHeld(), 1, "a member still moving keeps it");
    mock.timers.tick(31000);
    assert.equal(s.exposed.groupHeld(), 0, "but never past 60 s");
    // Planning keeps it too.
    const gid = s.exposed.groupHold(["a"], scene);
    assert.equal(s.exposed.groupPlanning(gid, true), true);
    scene.tokens.get("a").movement.state = "completed";
    mock.timers.tick(5000);
    assert.equal(s.exposed.groupHeld(), 1, "a plan still running");
    assert.equal(s.exposed.groupAlive(gid), true);
    s.exposed.groupPlanning(gid, false);
    assert.equal(s.exposed.groupPlanning("nope", true), false);
    mock.timers.tick(2000);
    assert.equal(s.exposed.groupHeld(), 0);
    assert.equal(s.exposed.groupAlive(gid), false);
  } finally { s.down(); }
});

test("onCombatChange: a turn or round change cancels the fight queues; so does a deleted combat; other changes do not", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b"]);
    const cancelled = [];
    const queue = () => {
      const gid = s.exposed.groupHold(["a", "b"], scene);
      s.exposed.groupQueue(gid, { cancel: why => cancelled.push(why) });
      return gid;
    };
    queue();
    F.fire("updateCombat", {}, { name: "renamed" });
    assert.deepEqual(cancelled, [], "an unrelated change");
    F.fire("updateCombat", {}, { turn: 2 });
    assert.deepEqual(cancelled, ["turn"]);
    queue();
    F.fire("updateCombat", {}, { round: 3 });
    queue();
    F.fire("updateCombat", {}, { started: true });
    queue();
    F.fire("updateCombat", {}, { active: false });
    queue();
    F.fire("updateCombat", {});
    queue();
    F.fire("deleteCombat", {});
    assert.deepEqual(cancelled, ["turn", "turn", "turn", "turn", "turn", "turn"], "round, started, active, no changes at all, and deleteCombat");
    F.fire("updateCombat", {}, { turn: 4 });
    assert.equal(cancelled.length, 6, "no queue left to cancel");
    // cancelQueues says whose they were.
    const gid = queue();
    assert.deepEqual(s.exposed.groupCancelQueues("x"), [{ gid, ids: ["a", "b"] }]);
    assert.equal(cancelled.at(-1), "x");
  } finally { s.down(); }
});

test("deleting a member ends its fight queue; a deleted token of no queue does nothing; groupQueueDone frees the group", () => {
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b", "z"]);
    const gid = s.exposed.groupHold(["a", "b"], scene);
    const cancelled = [];
    const q = { cancel: why => cancelled.push(why) };
    s.exposed.groupQueue(gid, q);
    F.fire("deleteToken", { id: "z" });
    F.fire("deleteToken", { id: "nobody" });
    F.fire("deleteToken", {});
    assert.deepEqual(cancelled, []);
    F.fire("deleteToken", { id: "b" });
    assert.deepEqual(cancelled, ["deleted"]);
    F.fire("deleteToken", { id: "a" });
    assert.deepEqual(cancelled, ["deleted"], "the queue is gone: once");
    const g2 = s.exposed.groupHold(["a"], scene);
    const q2 = { cancel() {} };
    s.exposed.groupQueue(g2, q2);
    mock.timers.tick(5000);
    assert.equal(s.exposed.groupHeld(), 1, "a running queue keeps the group");
    s.exposed.groupQueueDone(g2, {});
    assert.equal(s.exposed.groupHeld(), 1, "a different queue's end does not free it");
    s.exposed.groupQueueDone(g2, q2);
    mock.timers.tick(2000);
    assert.equal(s.exposed.groupHeld(), 0, "done: held only while its members walk");
  } finally { s.down(); }
});

test("onGroupTag: another user's write of a tagged member within HOLD_MS makes the dragger's screen stop the rest; groupMembers reads the tags", () => {
  const s = fileStack();
  const stops = [];
  s.exposed.stopDisplace = (obj, group) => { stops.push(obj.document.id); group.skip.size; };
  s.exposed.stopAlso = () => [];
  try {
    const scene = sceneOfTokens(["a", "b", "c"]);
    for (const id of ["b", "c"]) { scene.tokens.get(id).movement.state = "pending"; }     // walking now
    s.exposed.groupHold(["a", "b", "c"], scene);
    const a = scene.tokens.get("a");
    // Tags: every client learns a group from its move's option and who sent it.
    F.fire("updateToken", a, {}, { pentarynMovementGroup: "gidX" }, "userZ");
    F.fire("updateToken", scene.tokens.get("b"), {}, { pentarynMovementGroup: "gidX" }, "userZ");
    F.fire("updateToken", scene.tokens.get("c"), {}, { pentarynMovementGroup: "gidOther" }, "userY");
    assert.equal(s.exposed.groupMembers("a").held, true, "held here: this client's own record wins");
    // Another user's stop write of a: the group stops here.
    F.fire("updateToken", a, {}, { pentarynMovementStop: true }, "userZ");
    assert.deepEqual(stops, ["b", "c"], "every other member still walking is stopped where it is drawn");
    assert.equal(s.exposed.groupStopped().why, "foreign");
    assert.equal(s.exposed.groupStopped().members, 3);
    assert.equal(s.exposed.groupStopped().whole, true);
    assert.deepEqual(s.exposed.groupMembers("a"), { held: false, ids: ["a", "b"], sender: "userZ" }, "now only the tags of its group (ids tagged gidX)");
    assert.deepEqual(s.exposed.groupMembers("c"), { held: false, ids: ["c"], sender: "userY" });
    // Our own stop write, or no stop option, or an untracked token: ignored.
    stops.length = 0;
    s.exposed.groupHold(["a", "b", "c"], scene);
    F.fire("updateToken", a, {}, { pentarynMovementStop: true }, PLAYER);
    F.fire("updateToken", a, {}, {}, "userZ");
    F.fire("updateToken", sceneOfTokens(["q"]).tokens.get("q"), {}, { pentarynMovementStop: true }, "userZ");
    assert.deepEqual(stops, []);
    // After HOLD_MS (60 s) the tags are stale: ignored, and the group is no longer held.
    mock.timers.tick(61000);
    assert.deepEqual(s.exposed.groupMembers("c"), { held: false, ids: [], sender: null });
    assert.equal(s.exposed.groupHeld(), 0);
    F.fire("updateToken", a, {}, { pentarynMovementStop: true }, "userZ");
    assert.deepEqual(stops, [], "no group held any more: another user's stop of a member is nobody's to carry on");
  } finally { s.down(); }
});

test("onGroupTag ODD: the 60 s limit is enforced when something reads the groups, not by the stop itself; a stop that arrives first still stops a stale group", () => {
  const s = fileStack();
  const stops = [];
  s.exposed.stopDisplace = obj => { stops.push(obj.document.id); };
  s.exposed.stopAlso = () => [];
  try {
    const scene = sceneOfTokens(["a", "b"]);
    scene.tokens.get("b").movement.state = "pending";
    s.exposed.groupHold(["a", "b"], scene);
    mock.timers.tick(61000);                                               // nothing has pruned it yet
    F.fire("updateToken", scene.tokens.get("a"), {}, { pentarynMovementStop: true }, "userZ");
    assert.deepEqual(stops, ["b"]);
  } finally { s.down(); }
});

test("a late stop: a member whose wave write was on its way is stopped where it is drawn when its move comes back; marked by the group's cancel", async () => {
  const s = fileStack();
  const stops = [];
  s.exposed.groupInFlight = () => [{ id: "b" }, { id: "c" }, { id: "zz" }];
  s.exposed.stopDisplace = (obj, group) => { stops.push(obj.document.id); };
  s.exposed.stopAlso = () => [];
  try {
    const scene = sceneOfTokens(["a", "b", "c"]);
    scene.tokens.get("c").movement.state = "pending";                      // already walking: not late
    const gid = s.exposed.groupHold(["a", "b", "c"], scene);
    assert.ok(gid);
    s.exposed.groupCancel("a", { why: "click" });
    // b's write comes back (our own, no stop option): stopped, in one batch next tick.
    F.fire("updateToken", scene.tokens.get("b"), {}, {}, PLAYER);
    F.fire("updateToken", scene.tokens.get("c"), {}, {}, PLAYER);
    assert.deepEqual(stops, [], "the batch runs on a timer");
    mock.timers.tick(0);
    assert.deepEqual(stops, ["b"]);
    assert.deepEqual(s.exposed.groupStopped(), null, "nothing recorded by a stop that file.mjs did not make");
    s.exposed.groupNoteStop({ why: "click", members: 2, whole: false });
    mock.timers.tick(0);
    assert.equal(s.exposed.groupStopped().lateTotal, 1);
    assert.equal(s.exposed.groupStopped().why, "click");
  } finally { s.down(); }
});

test("uninstall clears file.mjs's state: groups, tags, waves, the flush record and the stop record", () => {
  const d = visStub();
  globalThis.document = d;
  const s = fileStack();
  try {
    const scene = sceneOfTokens(["a", "b"]);
    const gid = s.exposed.groupHold(["a", "b"], scene);
    const sent = [];
    s.exposed.groupWaves(gid, [{ at: 4000, ids: ["a"] }], ids => sent.push(ids));
    d.hide();
    s.exposed.groupNoteStop({ why: "click", members: 1, whole: true });
    assert.ok(s.exposed.groupFlushed());
    F.fire("updateToken", scene.tokens.get("a"), {}, { pentarynMovementGroup: "g" }, "u");
  } finally { s.down(); delete globalThis.document; }
  const again = fileStack();
  try {
    assert.equal(again.exposed.groupFlushed(), null);
    assert.equal(again.exposed.groupStopped(), null);
    assert.equal(again.exposed.groupHeld(), 0);
    assert.deepEqual(again.exposed.groupMembers("a"), { held: false, ids: [], sender: null });
    mock.timers.tick(5000);
  } finally { again.down(); }
});

/* ============================================================================================================ */
/*  4c. drop.mjs: notices, the cap, fellBack, a plan in slices, the none paths (the planner is stubbed)            */
/* ============================================================================================================ */

const S = 100;
const Token5e = F.CONFIG.Token.objectClass;
const dgrid = { size: S, distance: 5, type: 1 };
const dtokens = new Map();
const dscene = {
  id: SCENE, grid: dgrid, regions: [], tokens: dtokens, walls: [], sent: [],
  async updateEmbeddedDocuments(type, updates, options) { this.sent.push({ type, ids: updates.map(u => u._id), options }); return updates; },
};
const layer = { _draggedToken: null, _movementPlanningContext: null };
const fight = { on: false };
const wp = (x, y, extra = {}) => ({ x, y, elevation: 0, width: 1, height: 1, level: "L", action: "walk", snapped: true, explicit: true, checkpoint: true, ...extra });

function dToken(id, x, y, { owner = true, name = id, displayName = 0 } = {}) {
  const t = Object.create(Token5e.prototype);
  t.layer = layer;
  t.movementAnimationName = `Token.${id}.animateMovement`;
  t.animationContexts = new Map();
  t.document = {
    documentName: "Token", id, name, displayName, isOwner: owner, hidden: false, parent: dscene, movementAction: "walk",
    _source: { x, y, elevation: 0, width: 1, height: 1, level: "L" }, x, y, elevation: 0,
    movement: { state: "completed", user: { isSelf: true } }, object: t,
    _shouldRecordMovementHistory: () => fight.on, testUserPermission: () => true,
  };
  dtokens.set(id, t.document);
  return t;
}
function contextsFor(tokens, dx, dy) {
  const out = {};
  for (const t of tokens) {
    const src = t.document._source;
    const dest = wp(src.x + dx, src.y + dy);
    out[t.document.id] = { token: t, destination: dest, foundPath: [wp(src.x, src.y, { snapped: false, explicit: false, checkpoint: false }), dest], waypoints: [] };
  }
  return out;
}
function coreResult(contexts) {
  const updates = [], movement = {};
  for (const [id, c] of Object.entries(contexts)) { updates.push({ _id: id }); movement[id] = { waypoints: c.foundPath.slice(1), planned: false }; }
  return [updates, { constrainOptions: {}, terrainOptions: {}, measureOptions: {}, method: "dragging", movement }];
}
/** A drop of `tokens` by (dx, dy): what core would return, then ours. */
function dropOf(tokens, dx, dy) {
  const contexts = contextsFor(tokens, dx, dy);
  const core = coreResult(contexts);
  coreDrop.result = core;
  const out = tokens[0]._prepareDragLeftDropUpdates({ interactionData: { contexts } });
  return { out, core, contexts };
}
function dReset() {
  dtokens.clear();
  dscene.sent.length = 0;
  dscene.walls = [];
  fight.on = false;
  canvas.tokens.placeables = [];
  mock.timers.tick(5000);
}
const dropStack = () => {
  Object.assign(canvas, { grid: dgrid, dimensions: { rect: { x: 0, y: 0, width: 5000, height: 5000, contains: () => true } } });
  canvas.scene = dscene;
  game.activeTool = "select";
  const s = stack([dropFeature, file, telemetry]);
  s.tele = () => s.exposed.telemetry().events;
  return s;
};
const warnTexts = from => since_(from, "notify").filter(c => c.level === "warn").map(c => c.message);
const notices = (s) => s.exposed.groupStatus().told;
/** A plan done: every slice of a plan run in slices has run. */
async function planned(s) {
  for (let k = 0; k < 400 && s.exposed.groupStatus().sliced?.state === "planning"; k++) { mock.timers.tick(1); await new Promise(r => setImmediate(r)); }
}
const WAY = (x, y) => [wp(x, y)];

test("drop notices: tell('noRoute') -> 'No route there.', tell('short') -> 'Stopped short, way blocked.', tell('fight') -> 'In a fight, drag one token at a time.'", () => {
  assert.equal(loc("PENTARYN_MOVEMENT.notify.noRoute"), "No route there.");
  assert.equal(loc("PENTARYN_MOVEMENT.notify.stoppedShort"), "Stopped short, way blocked.");
  assert.equal(loc("PENTARYN_MOVEMENT.notify.fightGroup"), "In a fight, drag one token at a time.");
});

test("over the cap in a fight (25 members): 'In a fight, drag one token at a time.', nothing moves, the drop is refused", () => {
  dReset();
  const s = dropStack();
  try {
    fight.on = true;
    const ts = Array.from({ length: 25 }, (_, i) => dToken(`m${String(i).padStart(2, "0")}`, (i % 10) * S, Math.floor(i / 10) * S));
    const from = mark();
    const { out } = dropOf(ts, 0, 1000);
    assert.equal(out, null, "nothing moves");
    assert.deepEqual(dscene.sent, []);
    assert.deepEqual(since_(from, "notify").map(c => [c.level, c.message, c.opts]), [["warn", "PENTARYN_MOVEMENT.notify.fightGroup", { localize: true }]]);
    const g = s.exposed.groupStatus();
    assert.deepEqual([g.last.mode, g.last.reason, g.last.result, g.last.combat, g.last.members], ["refused", "fightGroup", "none", true, 25]);
    assert.deepEqual(g.told.map(({ at, ...t }) => t), [{ kind: "fight", reason: "fightGroup" }]);
    assert.deepEqual(s.tele().filter(e => e.kind === "plan").map(({ n, t, ago, ...e }) => e), [{ mode: "refused", reason: "fightGroup", members: 25, combat: true, kind: "plan" }]);
    assert.equal(g.queue, null, "no fight queue was made");
  } finally { s.down(); dReset(); }
});

test("over the cap out of combat (25 members): core's own move, reason tooMany, no notice", () => {
  dReset();
  const s = dropStack();
  try {
    const ts = Array.from({ length: 25 }, (_, i) => dToken(`o${String(i).padStart(2, "0")}`, (i % 10) * S, Math.floor(i / 10) * S));
    const from = mark();
    const { out, core } = dropOf(ts, 0, 1000);
    assert.equal(out, core, "core's result, untouched");
    assert.deepEqual(warnTexts(from), []);
    const g = s.exposed.groupStatus();
    assert.deepEqual([g.last.mode, g.last.reason, g.last.result, g.last.combat, g.last.members], ["core", "tooMany", "core", false, 25]);
    assert.deepEqual(s.tele().filter(e => e.kind === "plan").map(({ n, t, ago, ...e }) => e), [{ mode: "core", reason: "tooMany", members: 25, combat: false, kind: "plan" }]);
    assert.equal(g.limits.maxMembers, 24);
    assert.equal(g.enabled, true);
    assert.deepEqual(g.patched, { drop: true, click: false });
  } finally { s.down(); dReset(); }
});

test("a group drag with the drag help off (groupDrags false) is core's move in a fight too: reason off, never refused", async () => {
  dReset();
  const s = dropStack();
  try {
    await game.settings.set(MOD, "groupDrags", false);
    fight.on = true;
    const ts = [dToken("p1", 0, 0), dToken("p2", 100, 0)];
    const { out } = dropOf(ts, 0, 300);
    assert.notEqual(out, null);
    assert.deepEqual([s.exposed.groupStatus().last.mode, s.exposed.groupStatus().last.reason], ["core", "off"]);
    assert.equal(s.exposed.groupStatus().enabled, false);
    assert.equal(s.exposed.groupStatus().fight, false);
  } finally { s.down(); dReset(); await resetSettings(); }
});

test("tell('short'): a move this client sent that would enter a wall or a standing token in a fight is stopped (preMoveToken false) with 'Stopped short, way blocked.'; status().group.step names why", () => {
  dReset();
  const s = dropStack();
  try {
    fight.on = true;
    const walker = dToken("w1", 0, 0);
    walker.document.rendered = true;
    const blocker = dToken("w2", 0, 200);
    blocker.visible = true;
    canvas.tokens.placeables = [walker, blocker];
    const move = { method: "dragging", id: "mv1", origin: { x: 0, y: 0 }, destination: { x: 0, y: 500, width: 1, height: 1 }, passed: { waypoints: [] } };
    let from = mark();
    assert.equal(F.fireCall("preMoveToken", walker.document, move, {}), false);
    assert.deepEqual(since_(from, "notify").map(c => [c.level, c.message, c.opts]), [["warn", "PENTARYN_MOVEMENT.notify.stoppedShort", { localize: true }]]);
    assert.equal(loc("PENTARYN_MOVEMENT.notify.stoppedShort"), "Stopped short, way blocked.");
    let g = s.exposed.groupStatus();
    assert.deepEqual({ ...g.step, at: null }, { at: null, id: "w1", name: "w1", why: "standing", fight: true, hit: "w2" });
    assert.deepEqual(strip(g.told).slice(0, 1), [{ kind: "short", reason: "step:standing" }]);
    assert.deepEqual(teleOf(s, "cut"), [{ reason: "step:standing", id: "w1" }]);
    // A wall across the step, no token in the way.
    mock.timers.tick(2000);
    canvas.tokens.placeables = [walker];
    dscene.walls = [{ c: [-100, 250, 300, 250], move: 20, door: 0, ds: 0 }];
    from = mark();
    assert.equal(F.fireCall("preMoveToken", walker.document, move, {}), false);
    g = s.exposed.groupStatus();
    assert.equal(g.step.why, "wall");
    assert.equal(g.step.hit, null);
    assert.deepEqual(strip(g.told).slice(0, 1), [{ kind: "short", reason: "step:wall" }]);
    assert.equal(warnTexts(from).length, 1);
    // A free way, a move that is not ours, and a fall back to ignoring walls all go through.
    dscene.walls = [];
    canvas.tokens.placeables = [walker];
    assert.equal(F.fireCall("preMoveToken", walker.document, move, {}), true);
    dscene.walls = [{ c: [-100, 250, 300, 250], move: 20, door: 0, ds: 0 }];
    assert.equal(F.fireCall("preMoveToken", walker.document, { ...move, method: "keyboard" }, {}), true, "not a move this module drove");
    assert.equal(F.fireCall("preMoveToken", walker.document, { ...move, constrainOptions: { ignoreWalls: true } }, {}), true);
  } finally { s.down(); dReset(); }
});

test("tellStayed (exposed as groupTellStayed): 'Stayed where they stand, with no free spot they can reach: {names}.' with a comma list; the other keys; the told record keeps kind, reason and text", () => {
  dReset();
  const s = dropStack();
  try {
    const a = dToken("a", 0, 0, { name: "Aldo" }).document, b = dToken("b", 100, 0, { name: "Brea" }).document;
    const from = mark();
    s.exposed.groupTellStayed([a, b]);
    assert.deepEqual(warnTexts(from), ["Stayed where they stand, with no free spot they can reach: Aldo, Brea."]);
    s.exposed.groupTellStayed([a], "wave", "notSent");
    s.exposed.groupTellStayed([a], "x", "stopInside");
    s.exposed.groupTellStayed([b], "x", "walkedOn");
    s.exposed.groupTellStayed([a, b], "fight:speed", "speed");
    s.exposed.groupTellStayed([a], "unknown key", "nosuchkey");
    assert.deepEqual(warnTexts(from).slice(1), [
      "Did not move, the group's walk was ended: Aldo.",
      "Stopped on another token, with no free spot along its own way: Aldo. Drag it clear.",
      "Could not stop clear of another token, so walked on to its own square: Brea.",
      "Out of movement this turn, stopped short: Aldo, Brea.",
      "Stayed where they stand, with no free spot they can reach: Aldo.",
    ]);
    const told = notices(s);
    assert.deepEqual(told.map(({ at, ...t }) => t)[5], { kind: "stayed", reason: "stayed", text: "Stayed where they stand, with no free spot they can reach: Aldo, Brea." }, "newest first");
    assert.deepEqual(s.tele().filter(e => e.kind === "notice").at(0).members, 2);
    assert.deepEqual(s.tele().filter(e => e.kind === "notice").at(0).notice, "stayed");
    // The told list keeps the last eight.
    for (let i = 0; i < 6; i++) s.exposed.groupTellStayed([a], `r${i}`);
    assert.equal(notices(s).length, 8);
    assert.equal(notices(s)[0].reason, "r5");
  } finally { s.down(); dReset(); }
});

test("a token's name in a notice is read as this user may read it: the GM, an owner, or a nameplate shown to everyone; else 'a token'", () => {
  dReset();
  const s = dropStack();
  try {
    const hidden = dToken("h", 0, 0, { owner: false, name: "Secret", displayName: 0 }).document;
    const hover = dToken("v", 0, 0, { owner: false, name: "Hovered", displayName: 30 }).document;
    const always = dToken("w", 0, 0, { owner: false, name: "Plated", displayName: 50 }).document;
    const owned = dToken("o", 0, 0, { owner: true, name: "Mine", displayName: 0 }).document;
    const from = mark();
    s.exposed.groupTellStayed([hidden, hover, always, owned]);
    assert.deepEqual(warnTexts(from), ["Stayed where they stand, with no free spot they can reach: a token, Hovered, Plated, Mine."]);
    asGM();
    s.exposed.groupTellStayed([hidden]);
    assert.equal(warnTexts(from).at(-1), "Stayed where they stand, with no free spot they can reach: Secret.");
  } finally { asPlayer(); s.down(); dReset(); }
});

/** What a stubbed planner hands the drop: plan, members, timing, as file-core's planLead would. */
function stubPlan(s, ids, { none = false, blocker = null, stayed = [], delays = {}, ways = {}, shape = "march" } = {}, { later = true } = {}) {
  const real = { steps: s.exposed.groupPlanSteps, plan: s.exposed.groupPlan, way: s.exposed.groupWaypoints };
  const out = {
    plan: { shape, leader: ids[0], target: null, none, blocker, stayed, members: Object.fromEntries(ids.map(id => [id, { id }])), order: ids, ms: 1, searches: 2, failed: 0, choke: null },
    members: ids.map(id => ({ id, token: dtokens.get(id)?.object })),
    timing: { delays, total: Math.max(0, ...Object.values(delays)), pack: 0, ms: 0, crowded: [] },
  };
  s.exposed.groupWaypoints = (m, e) => ways[m?.id ?? e?.id] ?? [];
  if (later) {
    s.exposed.groupPlanSteps = function* () { yield { lead: { atStart: true } }; yield {}; return out; };
    F.CONFIG.debug[`${MOD}.planSteps`] = 1;
  } else {
    delete s.exposed.groupPlanSteps;
    s.exposed.groupPlan = () => out;
  }
  return { out, restore() { Object.assign(s.exposed, { groupPlanSteps: real.steps, groupPlan: real.plan, groupWaypoints: real.way }); delete F.CONFIG.debug[`${MOD}.planSteps`]; } };
}
const idsOfTokens = ts => ts.map(t => t.document.id);

/** One out-of-combat drop of tokens at (0,0), (100,0) ... through a stubbed plan, sliced or in the drop's own slice. */
async function fileDrop(s, plan, { later = true, count = 3, tokenOpts = {}, setup = null } = {}) {
  dReset();
  mock.timers.tick(2000);                                              // a notice of the same kind within 1 s is shown once
  const ts = Array.from({ length: count }, (_, i) => dToken(`g${i}`, i * S, 0, tokenOpts[i] ?? {}));
  setup?.();
  canvas.tokens.placeables = ts;
  const ids = idsOfTokens(ts);
  const spec = typeof plan === "function" ? plan(ids) : plan;
  const stub = stubPlan(s, ids, spec, { later });
  const from = mark();
  try {
    const { out, core } = dropOf(ts, 0, 500);
    await planned(s);
    return { ts, ids, out, core, from, stub, g: s.exposed.groupStatus() };
  } finally { stub.restore(); }
}

const strip = list => list.map(({ at, ...t }) => t);
const teleOf = (s, kind) => s.tele().filter(e => e.kind === kind).map(({ n, t, ago, kind: _k, ...e }) => e);
const NO_ROUTE_BY = name => `No route there: ${name} is in the way. The ghost button under the Ruler lets you pass.`;

test("none paths (launchLater, and launch in the drop's own slice): plan.none with a blocker names it; an unseen or unknown blocker is 'a token'", async () => {
  const s = dropStack();
  try {
    for (const later of [true, false]) {
      let r = await fileDrop(s, { none: true, blocker: "blk" }, { later, setup: () => dToken("blk", 300, 300, { owner: false, name: "Boulder", displayName: 0 }) });
      assert.deepEqual(warnTexts(r.from), [NO_ROUTE_BY("a token")], `unseen, later=${later}`);
      assert.deepEqual(strip(r.g.told).slice(0, 1), [{ kind: "noRoute", reason: "blockedBy", text: NO_ROUTE_BY("a token") }], "the newest first");
      assert.deepEqual([r.g.last.result, r.g.last.async], ["none", later]);
      assert.equal(r.out, null, "nobody moves");
      assert.deepEqual(dscene.sent, []);
      assert.deepEqual(teleOf(s, "notice").at(-1), { notice: "noRoute", reason: "blockedBy" });
      r = await fileDrop(s, { none: true, blocker: "blk" }, { later, setup: () => dToken("blk", 300, 300, { owner: true, name: "Boulder" }) });
      assert.deepEqual(warnTexts(r.from), [NO_ROUTE_BY("Boulder")], `seen, later=${later}`);
      r = await fileDrop(s, { none: true, blocker: "gone" }, { later });
      assert.deepEqual(warnTexts(r.from), [NO_ROUTE_BY("a token")], "a blocker that is not on the scene");
    }
  } finally { s.down(); dReset(); }
});

test("none paths: none without a blocker, or nobody moves and nobody stayed, is 'No route there' (groupNoRoute); nobody moves and some stayed is the stayed notice", async () => {
  const s = dropStack();
  try {
    for (const later of [true, false]) {
      for (const spec of [{ none: true }, { stayed: [] }]) {
        const r = await fileDrop(s, spec, { later });
        assert.deepEqual(since_(r.from, "notify").map(c => [c.level, c.message, c.opts]), [["warn", "PENTARYN_MOVEMENT.notify.noRoute", { localize: true }]], `${JSON.stringify(spec)} later=${later}`);
        assert.deepEqual(strip(r.g.told).slice(0, 1), [{ kind: "noRoute", reason: "groupNoRoute" }]);
        assert.equal(r.g.last.result, "none");
        assert.deepEqual(teleOf(s, "notice").at(-1), { notice: "noRoute", reason: "groupNoRoute" });
        assert.deepEqual(dscene.sent, []);
      }
      const r = await fileDrop(s, ids => ({ stayed: [ids[1], ids[2]] }), { later });
      assert.deepEqual(warnTexts(r.from), ["Stayed where they stand, with no free spot they can reach: g1, g2."]);
      assert.deepEqual(strip(r.g.told).slice(0, 1), [{ kind: "stayed", reason: "stayed", text: "Stayed where they stand, with no free spot they can reach: g1, g2." }]);
      assert.equal(r.g.last.result, "none");
      assert.deepEqual(teleOf(s, "notice").at(-1), { notice: "stayed", reason: "stayed", members: 2 });
      // none with stayed members still says no route (the leader has none).
      const r2 = await fileDrop(s, ids => ({ none: true, stayed: [ids[1]] }), { later });
      assert.deepEqual(strip(r2.g.told).slice(0, 1), [{ kind: "noRoute", reason: "groupNoRoute" }]);
    }
  } finally { s.down(); dReset(); }
});

test("none paths: members that stayed alongside movers are named once, and the movers go in one update with the leader drawn on top", async () => {
  const s = dropStack();
  try {
    for (const later of [true, false]) {
      const r = await fileDrop(s, ids => ({ stayed: [ids[2]], ways: { [ids[0]]: WAY(0, 500), [ids[1]]: WAY(100, 500) } }), { later });
      assert.deepEqual(warnTexts(r.from), ["Stayed where they stand, with no free spot they can reach: g2."], `named once, later=${later}`);
      assert.equal(r.g.last.result, "plan");
      assert.deepEqual([r.g.last.leader, r.g.last.stayed, r.g.last.waves, r.g.last.shape], ["g0", ["g2"], 1, "march"]);
      assert.deepEqual(teleOf(s, "plan").at(-1), { mode: "file", shape: "march", members: 3, ms: 1, searches: 2, failed: 0, stayed: 1, waves: 1, total: 0 });
      const sent = later ? dscene.sent : [{ ids: r.out[0].map(u => u._id), options: r.out[1] }];
      assert.deepEqual(sent.map(x => x.ids), [["g0", "g1"]], "g2 stays; the other two go together");
      assert.deepEqual(sent[0].options.pentarynMovementLead, ["g0"], "the leader's id names who is drawn on top");
      assert.deepEqual(Object.keys(sent[0].options.movement), ["g0", "g1"]);
      assert.deepEqual(sent[0].options.movement.g0.waypoints.map(p => [p.x, p.y]), [[0, 500]]);
    }
  } finally { s.down(); dReset(); }
});

test("a notice of one kind twice within a second is shown once (the told record and the telemetry still have both); a second later it shows again", async () => {
  const s = dropStack();
  try {
    let r = await fileDrop(s, { none: true }, { later: false });
    const again = mark();
    const ts = r.ts;
    const stub = stubPlan(s, idsOfTokens(ts), { none: true }, { later: false });
    try {
      for (const t of ts) { t.document._source.x = t.document._source.x; }
      dropOf(ts, 0, 700);                                                // the same kind, no time between
    } finally { stub.restore(); }
    assert.deepEqual(warnTexts(again), [], "within NOTICE_GAP_MS: not shown");
    assert.equal(s.exposed.groupStatus().told.length, 2, "but recorded");
    assert.equal(teleOf(s, "notice").length, 2);
    mock.timers.tick(1000);
    const stub2 = stubPlan(s, idsOfTokens(ts), { none: true }, { later: false });
    try { dropOf(ts, 0, 800); } finally { stub2.restore(); }
    assert.equal(warnTexts(again).length, 1, "a second later it shows again");
  } finally { s.down(); dReset(); }
});

test("fellBack('throw'): a forced planner throw is core's move with one warning, status().group.last.reason throw, a tele fallback; it counts for the breaker, 'single' does not", async () => {
  const s = dropStack();
  try {
    dReset();
    const ts = [dToken("t0", 0, 0), dToken("t1", 100, 0)];
    F.CONFIG.debug[`${MOD}.throw`] = true;
    let out, core;
    try { ({ out, core } = dropOf(ts, 0, 500)); } finally { delete F.CONFIG.debug[`${MOD}.throw`]; }
    assert.equal(out, core, "core's own drop");
    const g = s.exposed.groupStatus();
    assert.equal(g.fallbacks.length, 1);
    assert.equal(g.fallbacks[0].reason, "throw");
    assert.equal(g.fallbacks[0].at, new Date(Date.now()).toISOString());
    assert.deepEqual([g.last.mode, g.last.reason, g.last.result], ["core", "throw", "core"]);
    assert.deepEqual(s.logged.filter(l => l.level === "warnOnce").map(l => [l.key, l.a[0]]), [["group", "drop help skipped; the move goes as core's (further errors suppressed)"]]);
    assert.deepEqual(teleOf(s, "error"), [{ reason: "drop", message: "debug: forced planner throw" }]);
    assert.deepEqual(teleOf(s, "fallback"), [{ reason: "throw" }]);
    assert.deepEqual(s.exposed.telemetry().summary.failures, { errors: 1, fallbacks: 1 }, "the throw counts");
    s.exposed.tele("fallback", { reason: "single" });
    assert.deepEqual(s.exposed.telemetry().summary.failures, { errors: 1, fallbacks: 1 }, "single does not");
    assert.deepEqual(s.exposed.telemetry().summary.fallbacks, { throw: 1, single: 1 });
    // A second one is not warned about again; the fallbacks list keeps the newest first, at most eight.
    F.CONFIG.debug[`${MOD}.throw`] = true;
    try { for (let i = 0; i < 9; i++) dropOf(ts, 0, 600 + i * 100); } finally { delete F.CONFIG.debug[`${MOD}.throw`]; }
    assert.equal(s.logged.filter(l => l.level === "warnOnce").length, 1);
    assert.equal(s.exposed.groupStatus().fallbacks.length, 8);
  } finally { s.down(); dReset(); }
});

test("fellBack('noPlan'): a planner that gives nothing sends core's move and counts as a failed plan", async () => {
  const s = dropStack();
  try {
    for (const later of [false, true]) {
      dReset();
      mock.timers.tick(2000);
      const ts = [dToken("n0", 0, 0), dToken("n1", 100, 0)];
      canvas.tokens.placeables = ts;
      const real = { steps: s.exposed.groupPlanSteps, plan: s.exposed.groupPlan };
      if (later) {
        s.exposed.groupPlanSteps = function* () { yield { lead: { atStart: true } }; return null; };
        F.CONFIG.debug[`${MOD}.planSteps`] = 1;
      } else { delete s.exposed.groupPlanSteps; s.exposed.groupPlan = () => null; }
      try {
        const { out, core } = dropOf(ts, 0, 500);
        await planned(s);
        if (later) {
          assert.equal(out, null, "nothing at the drop: core's update goes out when the plan is done");
          assert.deepEqual(dscene.sent.map(x => x.ids), [["n0", "n1"]]);
          assert.equal(dscene.sent[0].options, core[1], "core's own options");
        } else assert.equal(out, core);
        const g = s.exposed.groupStatus();
        assert.equal(g.fallbacks[0].reason, "noPlan");
        assert.equal(g.last.result, "core");
      } finally { Object.assign(s.exposed, { groupPlanSteps: real.steps, groupPlan: real.plan }); delete F.CONFIG.debug[`${MOD}.planSteps`]; }
    }
    assert.equal(s.exposed.telemetry().summary.failures.fallbacks, 2);
  } finally { s.down(); dReset(); }
});

test("planLater failure: the plan throws in a later slice before anything was sent -> core's move for the whole group (fellBack 'throw'), a failed('plan') tele error, planLast.state 'failed'", async () => {
  const s = dropStack();
  try {
    dReset();
    const ts = [dToken("f0", 0, 0), dToken("f1", 100, 0), dToken("f2", 200, 0)];
    canvas.tokens.placeables = ts;
    const real = s.exposed.groupPlanSteps;
    s.exposed.groupPlanSteps = function* () { yield { lead: { atStart: true } }; throw new Error("plan boom"); };
    F.CONFIG.debug[`${MOD}.planSteps`] = 1;
    try {
      const { out, core } = dropOf(ts, 0, 500);
      assert.equal(out, null, "the drop sends nothing of its own: the plan runs on");
      assert.equal(s.exposed.groupStatus().last.result, "planning");
      assert.equal(s.exposed.groupStatus().sliced.state, "planning");
      await planned(s);
      const g = s.exposed.groupStatus();
      assert.equal(g.sliced.state, "failed");
      assert.equal(g.sliced.early, false);
      assert.deepEqual(dscene.sent.map(x => x.ids), [["f0", "f1", "f2"]], "core's move for the whole group");
      assert.equal(dscene.sent[0].options, core[1]);
      assert.equal(dscene.sent[0].type, "Token");
      assert.equal(g.last.result, "core");
      assert.equal(g.fallbacks[0].reason, "throw");
      assert.deepEqual(teleOf(s, "error"), [{ reason: "plan", message: "plan boom" }]);
      assert.deepEqual(teleOf(s, "fallback"), [{ reason: "throw" }]);
      assert.deepEqual(s.logged.filter(l => l.level === "warnOnce").map(l => l.key), ["single-plan"]);
      mock.timers.tick(2000);
      assert.equal(s.exposed.groupHeld(), 0, "the group is no longer planning");
    } finally { s.exposed.groupPlanSteps = real; delete F.CONFIG.debug[`${MOD}.planSteps`]; }
  } finally { s.down(); dReset(); }
});

test("planLater failure after the leader was already sent: nothing more is sent, no core fallback", async () => {
  const s = dropStack();
  try {
    dReset();
    const ts = [dToken("e0", 0, 0), dToken("e1", 100, 0), dToken("e2", 200, 0)];
    canvas.tokens.placeables = ts;
    const real = { steps: s.exposed.groupPlanSteps, way: s.exposed.groupWaypoints };
    s.exposed.groupWaypoints = (m, e) => (m === null && e?.id === "e0" ? WAY(0, 500) : []);
    s.exposed.groupPlanSteps = function* () {
      yield { free: true, lead: { id: "e0", atStart: false, points: [{ x: 0, y: 0 }, { x: 0, y: 5 }], stay: false } };
      yield {};
      throw new Error("later boom");
    };
    F.CONFIG.debug[`${MOD}.planSteps`] = 1;
    try {
      const { out } = dropOf(ts, 0, 500);
      assert.deepEqual(out[0].map(u => u._id), ["e0"], "the leader goes in the drop's own update");
      assert.deepEqual(out[1].pentarynMovementLead, ["e0"]);
      assert.deepEqual(out[1].movement.e0.waypoints.map(p => [p.x, p.y]), [[0, 500]]);
      await planned(s);
      const g = s.exposed.groupStatus();
      assert.equal(g.sliced.state, "failed");
      assert.equal(g.sliced.early, true);
      assert.deepEqual(dscene.sent, [], "nothing more is sent");
      assert.deepEqual(g.fallbacks, [], "no fall back to core: the leader is already walking");
      assert.deepEqual(teleOf(s, "error"), [{ reason: "plan", message: "later boom" }]);
      assert.deepEqual(teleOf(s, "fallback"), []);
    } finally { Object.assign(s.exposed, { groupPlanSteps: real.steps, groupWaypoints: real.way }); delete F.CONFIG.debug[`${MOD}.planSteps`]; }
  } finally { s.down(); dReset(); }
});

test("a plan in slices stopped by a click on a member (groupCancel) ends quietly: state superseded, last.result stopped, nothing sent", async () => {
  const s = dropStack();
  try {
    dReset();
    const ts = [dToken("s0", 0, 0), dToken("s1", 100, 0)];
    canvas.tokens.placeables = ts;
    const real = s.exposed.groupPlanSteps;
    let slices = 0;
    s.exposed.groupPlanSteps = function* () { yield { lead: { atStart: true } }; for (;;) { slices += 1; yield {}; if (slices > 500) return null; } };
    F.CONFIG.debug[`${MOD}.planSteps`] = 1;
    try {
      dropOf(ts, 0, 500);
      mock.timers.tick(1);
      await new Promise(r => setImmediate(r));
      assert.equal(s.exposed.groupStatus().sliced.state, "planning");
      assert.ok(slices >= 1);
      assert.deepEqual(s.exposed.groupCancel("s0", { why: "click" }), ["s0", "s1"]);
      await planned(s);
      const g = s.exposed.groupStatus();
      assert.equal(g.sliced.state, "superseded");
      assert.equal(g.last.result, "stopped");
      assert.deepEqual(dscene.sent, []);
      const seen = slices;
      mock.timers.tick(10);
      await new Promise(r => setImmediate(r));
      assert.equal(slices, seen, "the plan took no more steps");
      assert.deepEqual(s.exposed.groupStatus().fallbacks, [], "no core fallback for a stopped plan");
    } finally { s.exposed.groupPlanSteps = real; delete F.CONFIG.debug[`${MOD}.planSteps`]; }
  } finally { s.down(); dReset(); }
});

/* ============================================================================================================ */
/*  5. Manifest drift (last: the entry it loads cannot be uninstalled afterwards)                                 */
/* ============================================================================================================ */

test("buildApiFor drift: log.error 'API manifest drift — not published' and no namespace is published (the settings migration is not run)", async () => {
  const bogus = { path: "bogus", params: [], returns: "nothing", gm: false, writes: false, doc: "a row with no implementation" };
  const errors = [];
  const savedError = console.error;
  console.error = (...a) => errors.push(a);
  delete game.pentaryn.movement;
  delete game.modules.get(MOD).api;
  const migratedBefore = settingsMigrated();
  const from = mark();
  MANIFEST.rows.push(bogus);
  try {
    assert.equal(game.ready, true, "a late load: onInit, install, onReady");
    await import("../movement.mjs?v=drift");
  } finally {
    MANIFEST.rows.splice(MANIFEST.rows.indexOf(bogus), 1);
    console.error = savedError;
  }
  await flush();
  assert.equal(errors.length, 1);
  assert.equal(errors[0][0], "pentaryn-movement | API manifest drift — not published");
  assert.ok(errors[0][1] instanceof Error);
  assert.match(errors[0][1].message, /API row "bogus" has no implementation/);
  assert.equal(game.pentaryn.movement, undefined, "nothing published under game.pentaryn");
  assert.equal(game.modules.get(MOD).api, undefined, "nor as module.api");
  assert.deepEqual(since_(from, "Hooks.callAll").map(c => c.name), [], "no ready hook fired");
  assert.equal(settingsMigrated(), migratedBefore, "onReady stopped before the migration");
});
