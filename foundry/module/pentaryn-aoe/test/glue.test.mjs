// Glue: load the entry exactly as Foundry would (init → setup → ready, as the active GM), then pin
// EFFECTS — settings and keybinding registered, the namespace published, the startup work, the hook
// primitives (guard, claimMessage), uninstall and the hot-patch path. Unchanged 0.3.1 code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, advance, flush, out, lines, MODULE, GM_ID } from "./fixtures/world.mjs";
import { seams } from "./fixtures/seams.mjs";
import { surfaceOf } from "../lib/api.mjs";

const registered = [];
const argonBind = function bind(target) { return `bound:${target?.id ?? ""}`; };
const { F, W } = await boot({
  settings: { [`${MODULE}.npcSaveRollMode`]: "gmroll" },
  beforeEntry: (F, W) => {
    F.origPlace = F.RegionLayer.prototype.placeRegions;
    const reg = F.game.settings.register.bind(F.game.settings);
    F.game.settings.register = (ns, key, opts) => {
      registered.push({ ns, key, ...opts, type: opts.type?.name ?? null });
      return reg(ns, key, opts);
    };
    // the viewed scene at ready: one orphan handle, one handle with no lockSize, one template region with no handle
    const s = W.scene({ id: "SceneReady000001", name: "Ready", grid: { size: 100, distance: 5 } });
    W.token(s, { id: "orphan0000000001", name: "Orphan", flags: { [MODULE]: { handle: true, region: "gone000000000001" }, dnd5e: { lockSize: true } } });
    W.region(s, { id: "regionKeep000001", name: "Kept", flags: { dnd5e: { activity: "Item.x.Activity.y" } }, ownership: { default: 3 } });
    W.token(s, { id: "regionKeep000001", name: "Kept handle", flags: { [MODULE]: { handle: true, region: "regionKeep000001" } } });
    W.region(s, { id: "regionBare000001", name: "Bare", flags: { dnd5e: { activity: "Item.x.Activity.y" } }, ownership: { default: 0, [GM_ID]: 3 } });
    F.canvas.scene = s;
  },
});
const S = await seams();

// The lifecycle is fired by hand here so "before the tick" can be observed.
await import("../aoe.mjs");
const atLoad = F.hooks.slice();
F.fire("init");
F.fire("setup");
const beforeReady = F.calls.length;
F.fire("ready");
const publishedSync = game.pentaryn?.aoe;
await advance(0);
await flush(8);
const readyCalls = F.calls.slice(beforeReady);
const readyLines = lines();

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("module scope registers only once init, once setup, once ready", () => {
  assert.deepEqual(atLoad, [{ kind: "once", name: "init" }, { kind: "once", name: "setup" }, { kind: "once", name: "ready" }]);
});

test("settings register at init in BOOLS order, then npcSaveRollMode (golden/settings-register.json)", () => {
  pinJSON("settings-register", registered, import.meta.url);
  assert.deepEqual(registered.map(r => r.key), [
    "handleTokens", "removeAreaButton", "instantCleanup", "concentrationCleanup", "resolveSaves", "autoApplyNpc",
    "promptPlayers", "autoDamageOnHit", "autoApplySelf", "highlightUnapplied", "carefulSpell", "refundCancelledArea",
    "playerStatus", "untargetedSelf", "noSpellStacking", "aimSelfAreas", "npcSaveRollMode",
  ]);
});

test("the Escape keybinding registers once at init: PRIORITY, editable Escape, literal keys", () => {
  const regs = F.calls.filter(c => c.op === "keybindings.register");
  assert.deepEqual(regs.map(c => c.id), [`${MODULE}.cancelTemplate`]);
  const kb = game.keybindings.actions.get(`${MODULE}.cancelTemplate`);
  assert.deepEqual({ name: kb.name, hint: kb.hint, editable: kb.editable, precedence: kb.precedence, onDown: typeof kb.onDown },
    { name: "PENTARYN_AOE.Keybinding.cancelTemplate.Name", hint: "PENTARYN_AOE.Keybinding.cancelTemplate.Hint",
      editable: [{ key: "Escape" }], precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY, onDown: "function" });
});

test("-13 BOOLS is the literal 16-name list; DEFAULTS has 17 keys; npcSaveRollMode stays out of BOOLS", () => {
  const { BOOLS, DEFAULTS } = S.settings;
  assert.deepEqual(BOOLS, [
    "handleTokens", "removeAreaButton", "instantCleanup", "concentrationCleanup", "resolveSaves", "autoApplyNpc",
    "promptPlayers", "autoDamageOnHit", "autoApplySelf", "highlightUnapplied", "carefulSpell", "refundCancelledArea",
    "playerStatus", "untargetedSelf", "noSpellStacking", "aimSelfAreas",
  ]);
  assert.equal(typeof DEFAULTS.npcSaveRollMode, "string");
  assert.deepEqual({ ...DEFAULTS }, {
    handleTokens: true, removeAreaButton: true, instantCleanup: true, concentrationCleanup: true, resolveSaves: true,
    npcSaveRollMode: "gm", autoApplyNpc: false, promptPlayers: true, autoDamageOnHit: true, autoApplySelf: true,
    highlightUnapplied: true, carefulSpell: true, refundCancelledArea: true, playerStatus: true, untargetedSelf: true,
    noSpellStacking: true, aimSelfAreas: true,
  });
  assert.deepEqual(S.settings.LEGACY_ROLL_MODES, ["gmroll", "blindroll", "publicroll"]);
});

test("setting(): the stored value; the default when unregistered; undefined for an unknown key", async () => {
  assert.equal(S.settings.setting("autoApplyNpc"), false);
  await game.settings.set(MODULE, "autoApplyNpc", true);
  assert.equal(S.settings.setting("autoApplyNpc"), true);
  await game.settings.set(MODULE, "autoApplyNpc", false);
  assert.equal(S.settings.setting("nope"), undefined);
  const get = game.settings.get;
  game.settings.get = () => { throw new Error("not registered"); };
  assert.equal(S.settings.setting("handleTokens"), true);
  assert.equal(S.settings.setting("npcSaveRollMode"), "gm");
  game.settings.get = get;
});

test("registering again skips keys already registered", () => {
  const n = registered.length;
  S.settings.registerSettings();
  assert.equal(registered.length, n);
});

test("[declared] D-A3 ready: the API is published synchronously at ready, as module.api and game.pentaryn.aoe", () => {
  assert.ok(publishedSync);
  assert.equal(game.pentaryn.aoe, publishedSync);
  assert.equal(game.modules.get(MODULE).api, publishedSync);
  assert.equal(Object.isFrozen(publishedSync), true);
});

const LEGACY = [
  "activePlacement", "applyRows", "areasFor", "cardEffects", "createHandle", "ensureHandleActor", "handleFor", "hookIds",
  "pendingFor", "pingPlayers", "removeArea", "resolve", "rollForPlayer", "rollNpcSaves", "selfApply", "setRow",
  "setting", "spellAreas", "sweep", "uninstall",
];

test("[declared] D-A3 -10 the published API keeps the 20 legacy names and adds the kit members and the -10 reads", () => {
  assert.deepEqual(Object.keys(game.pentaryn.aoe).sort(), [...LEGACY,
    "contract", "describe", "inspect", "isHandle", "latestResolution", "resolution", "settings", "summary", "trace", "version",
  ].sort());
  for (const k of LEGACY) assert.equal(typeof game.pentaryn.aoe[k], "function", k);
});

test("the legacy surface (member → function name) equals golden/surface-legacy.json", () => {
  const surface = surfaceOf(game.pentaryn.aoe);
  pinJSON("surface-legacy", Object.fromEntries(LEGACY.map(k => [k, surface[k]])), import.meta.url);
});

test("ready (active GM): legacy roll mode migrated, handle actor created, viewed scene swept (golden/ready-calls.json)", () => {
  const pinned = readyCalls.filter(c => ["create", "createEmbedded", "deleteEmbedded", "updateEmbedded", "update", "settings.set"].includes(c.op));
  pinJSON("ready-calls", pinned, import.meta.url);
  assert.equal(game.settings.get(MODULE, "npcSaveRollMode"), "gm");
  assert.ok(readyLines.includes(`info: ${MODULE} | npcSaveRollMode gmroll → gm`), readyLines.join("\n"));
  // [declared] D-A6 (-7): the actor is created with the fixed id pentarynAoeHndl0 and keepId
  const create = readyCalls.find(c => c.op === "create" && c.documentName === "Actor");
  assert.equal(create.data._id, "pentarynAoeHndl0");
  assert.deepEqual(create.options, { keepId: true });
});

test("[declared] aoe-edge-3 a canvasReady sweep is registered through on() at setup (it is in hookIds)", () => {
  assert.ok(S.hooks.hookIds().some(h => h.name === "canvasReady"));
});

test("[declared] D-A4 ready without ui.ARGON: the once canvasReady fallback is registered through the registry (in hookIds)", () => {
  assert.equal(F.listeners("canvasReady"), 2);
  assert.equal(S.hooks.hookIds().filter(h => h.name === "canvasReady").length, 2);
});

test("hookIds() is [{ name, id }] in registration order, ids increasing", () => {
  const ids = S.hooks.hookIds();
  assert.ok(ids.length > 0);
  for (const h of ids) assert.deepEqual(Object.keys(h), ["name", "id"]);
  assert.deepEqual(ids.map(h => h.id), [...ids.map(h => h.id)].sort((a, b) => a - b));
  assert.deepEqual(game.pentaryn.aoe.hookIds(), ids);
});

test("the raw once canvasReady fallback runs guardArgonBind when Argon arrives late", async () => {
  F.ui.ARGON = { bind: () => "b" };
  F.fire("canvasReady", { scene: null });
  await flush();
  assert.equal(F.ui.ARGON.bind._aoeGuard, true);
  assert.equal(F.listeners("canvasReady"), 1, "the once listener is spent; the sweep stays");
  delete F.ui.ARGON;
});

/* ── guard (-9) ──────────────────────────────────────────────────────────────────────────────── */

test("-9 guard passes sync values through, logs and swallows a throw with the module prefix", async () => {
  const { guard } = S.hooks;
  out.length = 0;
  assert.equal(guard("x", () => false)(), false);
  assert.equal(guard("x", () => 7)(), 7);
  assert.equal(guard("x", (a, b) => a + b)(2, 3), 5);
  const boom = new Error("boom");
  assert.equal(guard("x", () => { throw boom; })(), undefined);
  assert.deepEqual(out.map(o => [o.level, o.text, o.args[1]]), [["error", `${MODULE} | x`, boom]]);
  out.length = 0;
  assert.equal(guard("y", async () => { throw boom; })(), undefined);
  assert.equal(out.length, 0, "an async rejection is logged after a microtask");
  await flush();
  assert.deepEqual(out.map(o => [o.level, o.text]), [["error", `${MODULE} | y`]]);
  out.length = 0;
  assert.equal(guard("z", async () => 5)(), undefined);
  await flush();
  assert.equal(out.length, 0);
});

/* ── claimMessage (-30): the legacy block, on mocked timers ───────────────────────────────────── */

test("-30 claimMessage: one client per job on one account (750 ms settle)", async () => {
  const { claimMessage } = S.hooks;
  // Two sessions on the GM account: one server-ordered message, per-client socket ids. The write
  // lands after a round trip (await null), so both clients read "unclaimed" first, as live.
  const setP = (o, path, val) => { const ks = path.split("."); let v = o; for (const k of ks.slice(0, -1)) v = v[k] ??= {}; v[ks.at(-1)] = val; };
  const msg = { id: "claimMsg00000001", flags: {}, async update(u) { await null; for (const [k, v] of Object.entries(u)) setP(msg, k, v); } };
  game.messages.set(msg.id, msg);
  const sock = game.socket.id;
  game.socket.id = "A";
  const pa = claimMessage(msg, "resolve");                 // client A sees the broadcast
  game.socket.id = "B";
  const pb = claimMessage(msg, "resolve");                 // client B a moment later
  let settled = false;
  Promise.all([pa, pb]).then(() => { settled = true; });
  await advance(700);
  assert.equal(settled, false, "still settling at 700 ms");
  await advance(100);
  const [a, b] = await Promise.all([pa, pb]);
  assert.deepEqual({ a, b }, { a: false, b: true }, "the last writer wins");
  assert.equal(msg.flags[MODULE].claims.resolve, "B");
  game.socket.id = "C";
  assert.equal(await claimMessage(msg, "resolve"), false, "a late client stands down at once");
  game.socket.id = "B";
  assert.equal(await claimMessage(msg, "resolve"), true, "the winner asking again still wins");
  const p = claimMessage(msg, "selfApply");
  await advance(800);
  assert.equal(await p, true, "another job on the same message is its own claim");
  game.socket.id = undefined;
  assert.equal(await claimMessage({ id: "x" }, "resolve"), true, "no socket id → act");
  game.socket.id = "A";
  assert.equal(await claimMessage({}, "resolve"), true, "no message id → act");
  game.socket.id = sock;
});

test("claimMessage re-reads through game.messages.get (a message gone meanwhile → false)", async () => {
  const { claimMessage } = S.hooks;
  const msg = W.message({ id: "claimGone0000001", type: "damage" });
  const p = claimMessage(msg, "resolve");
  await flush();
  game.messages.delete(msg.id);
  await advance(800);
  assert.equal(await p, false);
});

/* ── uninstall and the hot-patch path ─────────────────────────────────────────────────────────── */

test("uninstall(): every on() hook off, Escape slot emptied, request handler deleted", () => {
  const api = game.pentaryn.aoe;
  const names = [...new Set(S.hooks.hookIds().map(h => h.name))];
  assert.ok(CONFIG.DND5E.requests[`${MODULE}.save`]);
  assert.equal(typeof globalThis[Symbol.for(`${MODULE}.cancelTemplate`)], "function");
  api.uninstall();
  assert.deepEqual(S.hooks.hookIds(), []);
  for (const name of names) assert.equal(F.listeners(name), 0, name);
  assert.equal(globalThis[Symbol.for(`${MODULE}.cancelTemplate`)], undefined);
  assert.equal(CONFIG.DND5E.requests[`${MODULE}.save`], undefined);
});

test("[declared] D-A7 -44: uninstall() restores RegionLayer.prototype.placeRegions", () => {
  assert.equal(F.RegionLayer.prototype.placeRegions, F.origPlace);
});

test("hot patch: a copy imported with __pentarynAoeHot registers nothing at module scope", async () => {
  const n = F.hooks.length;
  globalThis.__pentarynAoeHot = true;
  const copy = await import("../aoe.mjs?hot=1");
  delete globalThis.__pentarynAoeHot;
  assert.equal(F.hooks.length, n);
  assert.equal(typeof copy.install, "function");
  assert.equal(copy.MODULE, MODULE);
});

test("[declared] W2-K1 hot patch: install({ sweepOnReady: false }) re-wires and publishes synchronously through publishNamespace, without a sweep", async () => {
  const { install } = await import("../aoe.mjs");
  const before = F.calls.length;
  const kb = F.calls.filter(c => c.op === "keybindings.register").length;
  out.length = 0;
  const old = game.pentaryn.aoe;
  const p = install({ sweepOnReady: false });
  const published = game.pentaryn.aoe;
  assert.notEqual(published, old, "a new API object, published in the same tick (no setTimeout on this path)");
  assert.equal(game.modules.get(MODULE).api, published);
  assert.equal(await p, published);
  await flush();
  const after = F.calls.slice(before);
  assert.equal(F.calls.filter(c => c.op === "keybindings.register").length, kb, "no second keybinding");
  assert.deepEqual(after.filter(c => ["createEmbedded", "deleteEmbedded", "updateEmbedded"].includes(c.op)), [], "no sweep");
  assert.ok(S.hooks.hookIds().length > 0);
  assert.equal(S.hooks.hookIds().some(h => h.name === "canvasReady"), true, "[declared] aoe-edge-3: the canvasReady sweep is wired by install, sweepOnReady only skips the startup sweep");
  assert.equal(typeof globalThis[Symbol.for(`${MODULE}.cancelTemplate`)], "function", "the Escape slot is this copy's again");
  assert.deepEqual(out, []);
});

test("install() twice does not stack hooks (installed gate)", async () => {
  const { install } = await import("../aoe.mjs");
  const n = S.hooks.hookIds().length;
  await install({ sweepOnReady: false });
  assert.equal(S.hooks.hookIds().length, n);
});

test("[declared] W2-K1 a frozen game.pentaryn (the old importer's) now makes the publish throw (kit 1.0.2, J10)", async () => {
  const { install } = await import("../aoe.mjs");
  const pentaryn = game.pentaryn;
  game.pentaryn = Object.freeze({ ...pentaryn });
  await assert.rejects(install({ sweepOnReady: false }), TypeError);
  game.pentaryn = pentaryn;
});
