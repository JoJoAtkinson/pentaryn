// Glue characterisation (guide S1, findings -18, -22, -23 test halves, -42 KNOWN row). The entry is
// loaded exactly as Foundry would and driven only through its hooks, its settings' onChange and the
// published API — no test seam — so the pins survive the S4 split unchanged.
//
// Timers are mocked (the 50 ms refresh debounce and the ready tick); nothing waits on real time.
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { GM, PLAYER, SCENE, OTHER, combat, keyboard, movementWorld, token } from "./fixtures/world.mjs";
import { RAISE, meshSort } from "../movement-core.mjs";

mock.timers.enable({ apis: ["setTimeout"] });

const MOD = "pentaryn-movement";
const F = await movementWorld();
await import("../movement.mjs");

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};
/** Let every queued debounce (and the refreshes it causes) run to the end. */
async function settle() {
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(60);
    await flush();
  }
}
const mark = () => F.calls.length;
const since = (from, op) => F.calls.slice(from).filter(c => !op || c.op === op);
const toasts = from => since(from, "notify").map(c => [c.level, c.message, c.opts]);
const asPlayer = () => F.become({ userId: PLAYER });
const asGM = () => F.become({ userId: GM });
async function set(key, value) {
  await game.settings.set(MOD, key, value);
  await settle();
}
/** Back to: player, policy exploration, ghost off, owned-on-top on, no combat. */
async function reset() {
  asPlayer();
  game.combats.contents = [];
  await set("ghostPolicy", "exploration");
  await set("ghost", false);
  await set("ownedOnTop", true);
  await settle();
}

test("foundry.utils is Foundry's own common/ code", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("init registers the four settings (golden/settings-register.json)", () => {
  F.fire("init");
  const rows = [...game.settings.settings.values()].filter(s => s.namespace === MOD).map(s => ({
    key: s.key, scope: s.scope, config: s.config, type: s.type?.name ?? null, default: s.default,
    choices: s.choices ?? null, name: s.name ?? null, hint: s.hint ?? null, onChange: typeof s.onChange === "function",
  }));
  pinJSON("settings-register", rows, import.meta.url);
  assert.deepEqual(rows.map(r => r.key), ["ghostPolicy", "ghostPolicyLast", "ghost", "ownedOnTop"]);
});

test("setup wraps both prototypes and marks them __pentarynMovement", () => {
  const drag = CONFIG.Token.objectClass.prototype._getDragConstrainOptions;
  const kb = CONFIG.Canvas.layers.tokens.layerClass.prototype._prepareKeyboardMovementUpdates;
  F.fire("setup");
  const drag2 = CONFIG.Token.objectClass.prototype._getDragConstrainOptions;
  const kb2 = CONFIG.Canvas.layers.tokens.layerClass.prototype._prepareKeyboardMovementUpdates;
  assert.notEqual(drag2, drag);
  assert.notEqual(kb2, kb);
  assert.equal(drag2.__pentarynMovement, true);
  assert.equal(kb2.__pentarynMovement, true);
});

test("ready publishes game.pentaryn.movement after one tick: the legacy keys (a floor)", async () => {
  F.fire("ready");
  mock.timers.tick(0);
  await flush();
  const api = game.pentaryn.movement;
  const legacy = ["status", "ghostFor", "combatActive", "setGhost", "setPolicy", "pinsUnderTokens", "core"];
  for (const k of legacy) assert.ok(k in api, k);
  assert.deepEqual(Object.keys(api).filter(k => legacy.includes(k)), legacy);
  for (const k of legacy.slice(0, 6)) assert.equal(typeof api[k], "function", k);
  assert.equal(api.core.MODULE, MOD);
  assert.equal(typeof api.core.ghostFor, "function");
});

test("drag wrap: owner + ghost gets the three flags; GM, non-owner and ghost off get the base", async () => {
  await reset();
  const drag = CONFIG.Token.objectClass.prototype._getDragConstrainOptions;
  const base = JSON.stringify({ ignoreWalls: false, k: 1 });
  assert.equal(JSON.stringify(drag.call(token({ owner: true }))), base, "ghost off");
  await set("ghost", true);
  assert.equal(JSON.stringify(drag.call(token({ owner: true }))),
    JSON.stringify({ ignoreWalls: true, k: 1, ignoreCost: true, ignoreTokens: true }));
  assert.equal(JSON.stringify(drag.call(token({ owner: false }))), base, "non-owner");
  asGM();
  assert.equal(JSON.stringify(drag.call(token({ owner: true }))), base, "GM");
  asPlayer();
  assert.equal(JSON.stringify(drag.call({})), base, "no document");
});

test("keyboard wrap (finding -18 table)", async () => {
  await reset();
  await set("ghost", true);
  const kb = CONFIG.Canvas.layers.tokens.layerClass.prototype._prepareKeyboardMovementUpdates;
  const r = ["x", { movement: {
    a: { constrainOptions: { ignoreWalls: false, k: 1 } },
    b: { constrainOptions: { ignoreWalls: false } },
  } }];
  keyboard.result = r;
  const objs = [token({ id: "a", owner: true }), token({ id: "b", owner: false }), token({ id: "c", owner: true })];
  const out = kb.call({}, objs);
  assert.equal(out, r, "the same array, mutated in place");
  assert.equal(JSON.stringify(r[1].movement.a.constrainOptions),
    JSON.stringify({ ignoreWalls: true, k: 1, ignoreCost: true, ignoreTokens: true }));
  assert.deepEqual(r[1].movement.b.constrainOptions, { ignoreWalls: false });
  assert.equal(Object.keys(r[1].movement).length, 2, "c (not in movement) adds nothing");
  keyboard.result = undefined;
  assert.equal(kb.call({}, objs), undefined);
  keyboard.result = [1, {}];
  assert.deepEqual(kb.call({}, objs), [1, {}]);
  const r2 = ["x", { movement: { a: { constrainOptions: { k: 2 } } } }];
  keyboard.result = r2;
  kb.call({}, null);
  assert.deepEqual(r2[1].movement.a.constrainOptions, { k: 2 }, "objects null leaves movement unchanged");
});

test("layer sort (finding -22): owned lifted between elevation and sort; ownedOnTop off → core keys only", async () => {
  await reset();
  const friend = { name: "friend", document: { elevation: 0, sort: 9, isOwner: false }, zIndex: 0 };
  const mine = { name: "mine", document: { elevation: 0, sort: 2, isOwner: true }, zIndex: 0 };
  const flyer = { name: "flyer", document: { elevation: 30, sort: 0, isOwner: false }, zIndex: 0 };
  const layer = { objects: { sortDirty: false, children: [friend, mine, flyer] } };
  F.fire("drawTokenLayer", layer);
  assert.equal(layer.objects.sortDirty, true);
  assert.equal(layer.objects.sortChildren.__pentarynMovement, true);
  layer.objects.sortChildren();
  assert.deepEqual(layer.objects.children.map(c => c.name), ["friend", "mine", "flyer"]);
  assert.equal(layer.objects.sortDirty, false);
  await set("ownedOnTop", false);
  layer.objects.children = [friend, mine, flyer];
  layer.objects.sortChildren();
  assert.deepEqual(layer.objects.children.map(c => c.name), ["mine", "friend", "flyer"]);
  const installed = layer.objects.sortChildren;
  F.fire("drawTokenLayer", layer);
  assert.equal(layer.objects.sortChildren, installed, "installed once (marker)");
});

test("ownedOnTop onChange re-flags every token and dirties the layer sort", async () => {
  await reset();
  const from = mark();
  await set("ownedOnTop", false);
  assert.deepEqual(since(from, "setAllRenderFlags").map(c => c.flags), [{ refreshState: true, refreshMesh: true }]);
  assert.equal(canvas.tokens.objects.sortDirty, true);
});

test("refreshToken: owned ghost token is lifted and faded; destroyed token untouched", async () => {
  await reset();
  await set("ghost", true);
  const t = token({ owner: true, sort: 4, alpha: 0.8, docAlpha: 0.5 });
  F.fire("refreshToken", t, { refreshState: true });
  assert.equal(t.mesh.alpha, 0.8 * 0.5 * 0.55);
  assert.equal(t.mesh.sort, meshSort(4, 1));
  assert.equal(t.mesh.sort, 4 + RAISE);
  const plain = token({ owner: false, sort: 4, alpha: 0.8 });
  F.fire("refreshToken", plain, { refreshState: true });
  assert.equal(plain.mesh.alpha, 0.8, "not ghosted: alpha kept");
  assert.equal(plain.mesh.sort, 4);
  const noFlags = token({ owner: true, sort: 1 });
  F.fire("refreshToken", noFlags, { refreshPosition: true });
  assert.equal(noFlags.mesh.alpha, 1, "only refreshState/refreshMesh fade");
  const dead = token({ owner: true });
  dead._destroyed = true;
  F.fire("refreshToken", dead, { refreshState: true });
  assert.deepEqual(dead.mesh, { alpha: 1, sort: null });
  F.fire("refreshToken", { mesh: null }, { refreshState: true });   // no mesh: nothing, no throw
  assert.equal(F.hookErrors.length, 0);
});

test("status() key order and the two finding -23 cases (prefix: later keys may follow)", async () => {
  await reset();
  const KEYS = ["policy", "combatOnScene", "allowed", "reason", "wish", "ghost", "ownedOnTop", "patched"];
  game.combats.contents = [combat()];
  await game.settings.set(MOD, "ghost", true);      // read before the queued refresh clears it
  const s1 = game.pentaryn.movement.status();
  assert.deepEqual(Object.keys(s1).slice(0, 8), KEYS);
  assert.deepEqual(Object.fromEntries(KEYS.map(k => [k, s1[k]])), {
    policy: "exploration", combatOnScene: true, allowed: false, reason: "combat", wish: true, ghost: false,
    ownedOnTop: true, patched: { drag: true, keyboard: true },
  });
  await game.settings.set(MOD, "ghostPolicy", "always");
  const s2 = game.pentaryn.movement.status();
  assert.equal(s2.ghost, true);
  assert.equal(s2.allowed, true);
  assert.equal(s2.reason, null);
  asGM();
  assert.equal(game.pentaryn.movement.status().ghost, false, "a GM never ghosts through this module");
  await reset();
});

test("combatActive(sceneId): hidden combatants do not count; unlinked combats count where a combatant stands", async () => {
  await reset();
  const api = game.pentaryn.movement;
  game.combats.contents = [combat({ combatants: [{ sceneId: SCENE, hidden: true }], started: false })];
  assert.equal(api.combatActive(), false, "a hidden ambush does not switch ghost off");
  game.combats.contents = [combat({ sceneId: null, combatants: [{ sceneId: OTHER }] })];
  assert.equal(api.combatActive(), false);
  assert.equal(api.combatActive(OTHER), true);
  game.combats.contents = [{ active: true, started: true, scene: null, _source: { scene: SCENE }, combatants: { contents: [] } }];
  assert.equal(api.combatActive(), true, "falls back to _source.scene");
  game.combats.contents = [combat({ combatants: [{ token: { parent: { id: SCENE } } }], started: false })];
  assert.equal(api.combatActive(), true, "combatant scene from token.parent");
  await reset();
});

test("ghostFor through the API", async () => {
  await reset();
  await set("ghost", true);
  assert.equal(game.pentaryn.movement.ghostFor(token({ owner: true })), true);
  assert.equal(game.pentaryn.movement.ghostFor(token({ owner: false })), false);
  assert.equal(game.pentaryn.movement.ghostFor(null), false);
});

test("setPolicy: a player rejects 'GM only'; a GM writes ghostPolicyLast then ghostPolicy; 'off' writes one", async () => {
  await reset();
  await assert.rejects(game.pentaryn.movement.setPolicy("always"), { message: "GM only" });
  asGM();
  let from = mark();
  await game.pentaryn.movement.setPolicy("always");
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [
    [`${MOD}.ghostPolicyLast`, "always"], [`${MOD}.ghostPolicy`, "always"],
  ]);
  from = mark();
  await game.pentaryn.movement.setPolicy("off");
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "off"]]);
  from = mark();
  await game.pentaryn.movement.setPolicy("bogus");
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [
    [`${MOD}.ghostPolicyLast`, "exploration"], [`${MOD}.ghostPolicy`, "exploration"],
  ], "unknown values normalise to the default");
  await reset();
});

test("refresh: wish on + policy off → one cleared.off toast (localize) and ghost set false", async () => {
  await reset();
  await set("ghost", true);
  await game.settings.set(MOD, "ghostPolicy", "off");
  const from = mark();
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.cleared.off", { localize: true }]]);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghost`, false]]);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await reset();
});

test("combat updates that do not change the button state redraw nothing", async () => {
  await reset();
  await settle();
  const from = mark();
  F.fire("updateCombat");
  F.fire("updateCombatant");
  await settle();
  assert.deepEqual(since(from, "controls.render"), []);
  assert.deepEqual(since(from, "setAllRenderFlags"), []);
});

test("a change of button state redraws controls (reset) and re-flags tokens once", async () => {
  await reset();
  const from = mark();
  game.combats.contents = [combat()];
  F.fire("createCombat");
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(since(from, "controls.render").map(c => c.opts), [{ reset: true }]);
  assert.equal(since(from, "recalculatePlannedMovementPaths").length, 1);
  assert.equal(since(from, "setAllRenderFlags").length, 1);
  await reset();
});

test("ghost-back sequence (U-8-7): cleared by combat, told once when the fight ends", async () => {
  await reset();
  await set("ghost", true);
  let from = mark();
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.cleared.combat", { localize: true }]]);
  assert.equal(game.settings.get(MOD, "ghost"), false);

  from = mark();
  game.combats.contents = [];
  F.fire("deleteCombat");
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.combat", { localize: true }]]);

  from = mark();
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(toasts(from), [], "once only");
});

test("ghost-back: turning the wish back on before the fight ends suppresses the back toast", async () => {
  await reset();
  await set("ghost", true);
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();                                     // cleared.combat
  const from = mark();
  await game.settings.set(MOD, "ghost", true);        // the player clicks …
  game.combats.contents = [];                         // … and the fight ends inside the same debounce
  F.fire("deleteCombat");
  await settle();
  await set("ghost", false);
  assert.deepEqual(toasts(from), []);
  await reset();
});

// aoe-movement-portals-42 (fixed, F-M2 [declared]) — cleared by combat, then the GM picks "Always allowed"
// mid-fight: the toast was "The fight is over" (notify.back.combat); it now names the GM (notify.back.off).
test("aoe-movement-portals-42: GM allows ghost mid-fight → the toast is notify.back.off", async () => {
  await reset();
  await set("ghost", true);
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  const from = mark();
  await set("ghostPolicy", "always");
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.off", { localize: true }]]);
  await reset();
});

// movement-edge-1 (fixed [declared]) — cleared by a fight on scene A, then the player views scene B while
// that fight still runs: the toast was "The fight is over" (notify.back.combat) and it used up the one-time
// toast. Now B says nothing, and back.combat fires once, when A's fight really ends.
test("movement-edge-1: viewing another scene mid-fight says nothing; back.combat fires once when that fight ends", async t => {
  t.after(() => { canvas.scene = { id: SCENE }; });
  await reset();
  await set("ghost", true);
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();                                     // cleared.combat on SCENE

  let from = mark();
  canvas.scene = { id: OTHER };
  F.fire("canvasReady");
  await settle();
  assert.deepEqual(toasts(from), [], "the fight on the cleared scene still runs");

  from = mark();
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(toasts(from), [], "still running");

  from = mark();
  game.combats.contents = [];
  F.fire("deleteCombat");
  await settle();
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.combat", { localize: true }]]);

  from = mark();
  F.fire("updateCombat");
  await settle();
  assert.deepEqual(toasts(from), [], "once only");
  canvas.scene = { id: SCENE };
  await reset();
});

test("movement-edge-1: on another scene, the GM allowing ghost mid-fight still toasts back.off", async t => {
  t.after(() => { canvas.scene = { id: SCENE }; });
  await reset();
  await set("ghost", true);
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  canvas.scene = { id: OTHER };
  F.fire("canvasReady");
  await settle();
  const from = mark();
  await set("ghostPolicy", "always");
  assert.deepEqual(toasts(from), [["info", "PENTARYN_MOVEMENT.notify.back.off", { localize: true }]]);
  canvas.scene = { id: SCENE };
  await reset();
});

test("a GM never gets the cleared or the back toast", async () => {
  await reset();
  asGM();
  await set("ghost", true);
  const from = mark();
  game.combats.contents = [combat()];
  F.fire("createCombat");
  await settle();
  game.combats.contents = [];
  F.fire("deleteCombat");
  await settle();
  assert.deepEqual(toasts(from), []);
  assert.equal(game.settings.get(MOD, "ghost"), true, "a GM's wish is never cleared");
  await reset();
});

test("toolbar (getSceneControlButtons): player and GM tools pinned (golden/toolbar.json)", async () => {
  const shot = () => {
    const controls = { tokens: { tools: {} } };
    F.fire("getSceneControlButtons", controls);
    return controls.tokens.tools;
  };
  const rows = {};
  await reset();
  rows.playerReady = shot();
  await set("ghost", true);
  rows.playerOn = shot();
  game.combats.contents = [combat()];
  rows.playerCombat = shot();
  await reset();
  await set("ghostPolicy", "off");
  rows.playerOff = shot();
  asGM();
  rows.gmOff = shot();
  await set("ghostPolicy", "always");
  rows.gmAlways = shot();
  await reset();
  F.fire("getSceneControlButtons", {});                 // no tokens group: nothing, no throw
  pinJSON("toolbar", rows, import.meta.url);
  assert.deepEqual(Object.keys(rows.playerOff), []);
  assert.deepEqual(Object.keys(rows.gmAlways), ["pentarynGhostPolicy"]);
});

test("player button onChange: blocked by combat → warn, ghost false, forced redraw", async () => {
  await reset();
  game.combats.contents = [combat()];
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const from = mark();
  await controls.tokens.tools.pentarynGhost.onChange(null, true);
  assert.deepEqual(toasts(from), [["warn", "PENTARYN_MOVEMENT.notify.blocked.combat", { localize: true }]]);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghost`, false]]);
  assert.equal(since(from, "controls.render").length, 1);
  await reset();
  const c2 = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", c2);
  await c2.tokens.tools.pentarynGhost.onChange(null, true);
  assert.equal(game.settings.get(MOD, "ghost"), true);
  await game.pentaryn.movement.setGhost(false);
  assert.equal(game.settings.get(MOD, "ghost"), false);
  await reset();
});

test("GM button onChange flips the policy off and back and toasts the localized mode", async () => {
  await reset();
  await set("ghostPolicy", "always");
  asGM();
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  let from = mark();
  await controls.tokens.tools.pentarynGhostPolicy.onChange(null, false);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [
    [`${MOD}.ghostPolicyLast`, "always"], [`${MOD}.ghostPolicy`, "off"],
  ]);
  assert.deepEqual(toasts(from), [["info", "Player ghost movement: OFF (click to allow)", null]]);
  from = mark();
  await controls.tokens.tools.pentarynGhostPolicy.onChange(null, true);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [[`${MOD}.ghostPolicy`, "always"]]);
  asPlayer();
  from = mark();
  await controls.tokens.tools.pentarynGhostPolicy.onChange(null, false);
  assert.deepEqual(since(from, "settings.set"), [], "a player cannot flip it");
  await reset();
});

test("movement-async-1: a quick GM double flip and setPolicy queue; each toast names the mode in effect", async () => {
  await reset();
  const lastBefore = game.settings.get(MOD, "ghostPolicyLast");
  await set("ghostPolicy", "always");
  await set("ghostPolicyLast", "exploration");
  asGM();
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const flip = controls.tokens.tools.pentarynGhostPolicy.onChange;
  let from = mark();
  // Double click: off then on, the second fired before the first's writes land.
  await Promise.all([flip(null, false), flip(null, true)]);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [
    [`${MOD}.ghostPolicyLast`, "always"], [`${MOD}.ghostPolicy`, "off"], [`${MOD}.ghostPolicy`, "always"],
  ], "the second flip reads the first flip's result");
  assert.equal(game.settings.get(MOD, "ghostPolicy"), "always");
  assert.deepEqual(toasts(from).map(t => t[1]), [
    "Player ghost movement: OFF (click to allow)",
    "Player ghost movement: always allowed (click to turn off)",
  ], "the last toast names the mode actually in effect");
  // setPolicy shares the queue: a flip fired while setPolicy writes sees setPolicy's result.
  await set("ghostPolicy", "off");
  from = mark();
  await Promise.all([game.pentaryn.movement.setPolicy("exploration"), flip(null, false)]);
  assert.deepEqual(since(from, "settings.set").map(c => [c.id, c.value]), [
    [`${MOD}.ghostPolicyLast`, "exploration"], [`${MOD}.ghostPolicy`, "exploration"], [`${MOD}.ghostPolicy`, "off"],
  ]);
  assert.equal(game.settings.get(MOD, "ghostPolicy"), "off");
  assert.deepEqual(toasts(from).map(t => t[1]), ["Player ghost movement: OFF (click to allow)"]);
  // A player is still refused with "GM only", before anything is queued.
  asPlayer();
  from = mark();
  await assert.rejects(game.pentaryn.movement.setPolicy("always"), { message: "GM only" });
  assert.deepEqual(since(from, "settings.set"), []);
  await set("ghostPolicyLast", lastBefore);
  await reset();
});

test("renderSceneControls toggles pm-blocked on the player button only in the combat state", async () => {
  await reset();
  const toggles = [];
  const btn = { classList: { toggle: (c, on) => toggles.push([c, on]) } };
  const el = { querySelector: sel => (sel === 'button.tool[data-tool="pentarynGhost"]' ? btn : null) };
  F.fire("renderSceneControls", null, el);
  game.combats.contents = [combat()];
  F.fire("renderSceneControls", null, el);
  F.fire("renderSceneControls", null, { querySelector: () => null });
  F.fire("renderSceneControls", null, { querySelector: () => { throw new Error("dom gone"); } });
  assert.deepEqual(toggles, [["pm-blocked", false], ["pm-blocked", true]]);
  assert.equal(F.hookErrors.length, 0, "the bare catch swallows it today (finding -20)");
  await reset();
});

test("updateActor (ownership) re-flags its tokens; updateToken (sort/elevation) dirties the sort", async () => {
  await reset();
  const flagged = [];
  const actor = { getActiveTokens: () => [{ renderFlags: { set: f => flagged.push(f) } }] };
  canvas.tokens.objects.sortDirty = false;
  F.fire("updateActor", actor, { name: "x" });
  assert.deepEqual(flagged, []);
  assert.equal(canvas.tokens.objects.sortDirty, false);
  F.fire("updateActor", actor, { ownership: { default: 3 } });
  assert.deepEqual(flagged, [{ refreshState: true }]);
  assert.equal(canvas.tokens.objects.sortDirty, true);
  canvas.tokens.objects.sortDirty = false;
  F.fire("updateToken", {}, { x: 5 });
  assert.equal(canvas.tokens.objects.sortDirty, false);
  F.fire("updateToken", {}, { elevation: 5 });
  assert.equal(canvas.tokens.objects.sortDirty, true);
  canvas.tokens.objects.sortDirty = false;
  F.fire("updateToken", {}, { sort: 2 });
  assert.equal(canvas.tokens.objects.sortDirty, true);
});

test("canvasReady installs the layer sort on canvas.tokens and queues a refresh", async () => {
  await reset();
  canvas.tokens.objects.sortChildren = undefined;
  F.fire("canvasReady");
  assert.equal(canvas.tokens.objects.sortChildren.__pentarynMovement, true);
  assert.equal(canvas.tokens.objects.sortDirty, true);
  await settle();
});

test("pinsUnderTokens(scene) on a synthetic scene (golden/pins.json)", () => {
  const player = game.users.get(PLAYER);
  const t = (id, name, x, y, o = {}) => ({ id, name, x, y, width: 1, height: 1, hidden: false,
    testUserPermission: u => u.id === PLAYER && !!o.pc, ...o });
  const scene = {
    grid: { size: 100 },
    notes: [
      { id: "n1", x: 150, y: 150, text: "Under the hero" },
      { id: "n2", x: 450, y: 450, entry: { name: "Journal-named" } },
      { id: "n3", x: 750, y: 750, label: "Under a hidden token" },
      { id: "n4", x: 950, y: 950 },
    ],
    tokens: [
      t("pc", "Hero", 100, 100, { pc: true }),
      t("npc", "Ogre", 400, 400, { width: 2, height: 2 }),
      t("hid", "Lurker", 700, 700, { hidden: true }),
      t("far", "Edge", 900, 900),
    ],
  };
  const out = game.pentaryn.movement.pinsUnderTokens(scene);
  pinJSON("pins", out, import.meta.url);
  assert.equal(out[0].noteId, "n1");
  assert.equal(out[0].playerOwned, true);
  assert.ok(!out.some(h => h.noteId === "n3"), "hidden tokens are skipped");
  assert.ok(player);
  canvas.scene = null;
  assert.deepEqual(game.pentaryn.movement.pinsUnderTokens(), []);
  canvas.scene = { id: SCENE };
});

test("pinsUnderTokens takes a scene id too: resolved through game.scenes; an unknown id answers [] (rob-1)", () => {
  const scene = {
    id: "zzPins", grid: { size: 100 },
    notes: [{ id: "n1", x: 150, y: 150, text: "Under the hero" }],
    tokens: [{ id: "pc", name: "Hero", x: 100, y: 100, width: 1, height: 1, hidden: false,
      testUserPermission: u => u.id === PLAYER }],
  };
  game.scenes.set("zzPins", scene);
  try {
    const byDoc = game.pentaryn.movement.pinsUnderTokens(scene);
    assert.equal(byDoc.length, 1);
    assert.deepEqual(game.pentaryn.movement.pinsUnderTokens("zzPins"), byDoc);
    assert.deepEqual(game.pentaryn.movement.pinsUnderTokens("noSuchScene"), []);
    assert.deepEqual(game.pentaryn.movement.pinsUnderTokens(""), []);
    assert.deepEqual(game.pentaryn.movement.pinsUnderTokens(null), []);
  } finally {
    game.scenes.delete("zzPins");
  }
});
