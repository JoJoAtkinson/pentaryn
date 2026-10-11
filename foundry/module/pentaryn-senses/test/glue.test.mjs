/**
 * Characterisation (senses checkpoint, wave 3): the entry's lifecycle as the ACTIVE GM — init
 * (glow animation, the sightReset setting), ready (publish `game.pentaryn.senses` and `.chain`, then
 * the GM chain resetSight → syncAll → sweep, in that order), the published surface, the hook
 * wrappers' console text, resetSight's refusals and setupLight. Frozen once committed: during the
 * refactor only import paths may change.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, standardWorld, makeActor, makeTok, flush, settle, since, captureConsole, ID, MODULE, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });

// The world: darkvision our retired 0.3 sync stored (Marrith's prototype and Cellar token), the
// Goblin's own lit torch, a Light cast on the Stake, and one old PHB Light summon on the floor.
const world = standardWorld({ heroProto: { sight: { enabled: true, visionMode: "darkvision", range: 60 } } });
const [hero] = world.actors;
const [s1, s2] = world.scenes;
s1.tokens.get(ID.tHero).sight = { enabled: true, visionMode: "darkvision", range: 60 };
s2.tokens.get(ID.tHero2)._source = { sight: { enabled: false, visionMode: "darkvision", range: 60 } }; // vision off: kept
hero.items.get(ID.light).flags[MODULE] = { lightCast: { scene: ID.s1, token: ID.tStake, x: null, y: null, at: 5 } };
const summon = makeActor({ id: "actOldSummon0001", name: "Light", type: "npc", flags: { dnd5e: { summon: { origin: `Actor.${ID.hero}.Item.${ID.light}` } } } });
world.actors.push(summon);
const floor = makeTok({ id: "tokOldSummon0001", name: "Light", actorId: summon.id, actorLink: true });
floor.parent = s1;
floor.collection = s1.tokens;
s1.tokens.set(floor.id, floor);

const F = await boot({ world, ready: false });

test("stub runs Foundry's own common/", () => {
  console.log(`  foundry build ${F.foundryBuild} (${F.utilsSource})`);
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("init: the broken glow animation and the sightReset setting, exactly as today", () => {
  const row = F.CONFIG.Canvas.lightAnimations["pentaryn-brokenglow"];
  // [declared, i18n -24 glow] the label is now the key; core's light-animation selects localize it
  assert.equal(row.label, "PENTARYN_SENSES.Glow.Label");
  assert.equal(F.game.i18n.localize(row.label), "Broken glow (wandering)");
  const { namespace, key, ...config } = F.game.settings.settings.get(`${MODULE}.sightReset`);
  assert.deepEqual([namespace, key], [MODULE, "sightReset"]);
  assert.deepEqual(config, { scope: "world", config: false, type: Number, default: 0 });
  assert.deepEqual(F.calls.filter(c => c.op === "settings.register"), [{ op: "settings.register", id: `${MODULE}.sightReset` }]);
  assert.equal(game.pentaryn, undefined, "nothing is published before ready");
});

test("ready (active GM): publish, then resetSight → syncAll → sweep, in that order", async t => {
  const out = captureConsole(t);
  const mark = F.calls.length;
  F.fire("ready");
  await flush();
  await settle(mock);
  const calls = since(mark);
  pinJSON("ready-gm", { calls, console: out }, import.meta.url);

  const at = pred => calls.findIndex(pred);
  const reset = at(c => c.op === "settings.set" && c.id === `${MODULE}.sightReset`);
  const protoReset = at(c => c.op === "Actor.updateDocuments");
  const carried = at(c => c.op === "updateEmbedded" && c.updates.some(u => `flags.${MODULE}.itemLight` in u));
  const spell = at(c => c.op === "update" && c.documentName === "Token" && c.changes[`flags.${MODULE}.spellLight`]);
  const tidy = at(c => c.op === "deleteEmbedded" && c.type === "Token");
  assert.ok(protoReset >= 0 && protoReset < reset, "sight batches before the setting");
  assert.ok(reset >= 0 && reset < carried, "reset before any carried-light write");
  assert.ok(carried < spell, "carried light before the Light reconcile");
  assert.ok(spell < tidy, "reconcile before the old summons go");
});

// [declared S-1, S-2, -26 alias] flipped from the checkpoint's keys: the API is kit-built (frozen, with
// version/contract/settings/trace/uninstall/describe and module.api); `chain.uninstall` and
// `light.uninstall` are gone (reserved, C48: senses.uninstall() replaces them); `senses.chain` exists
// and IS game.pentaryn.chain.
test("ready: the published keys (game.pentaryn.senses and game.pentaryn.chain; the full surface is api.test)", () => {
  assert.deepEqual(Object.keys(game.pentaryn.senses), [
    "syncLight", "carriedLight", "resetSight", "light", "setupLight", "syncAll", "chain", "inspect",   // + inspect (-25, additive)
    "version", "contract", "settings", "trace", "uninstall", "describe",
  ]);
  assert.deepEqual(Object.keys(game.pentaryn.chain), ["link", "break", "links", "repaint"]);
  assert.deepEqual(Object.keys(game.pentaryn.senses.light), [
    "cast", "end", "pick", "toggle", "hood", "profileFor", "sweep", "setup", "onMe", "prompt", "reconcile", "status", "SPELL_LIGHT", "PHB_LIGHT_ACTOR",
  ]);
  assert.equal(game.pentaryn.senses.setupLight, game.pentaryn.senses.light.setup);
  assert.equal(Object.isFrozen(game.pentaryn.senses), true);
  assert.equal(Object.isFrozen(game.pentaryn.chain), true);
  assert.equal(game.pentaryn.senses.chain, game.pentaryn.chain, "the alias is the same object");
  assert.equal(game.modules.get(MODULE).api, game.pentaryn.senses, "module.api is canonical");
});

test("resetSight: once per world; force runs it again; it refuses off the active GM's terms", async t => {
  const out = captureConsole(t);
  const S = game.pentaryn.senses;
  const rows = {};
  rows.again = await S.resetSight();
  rows.force = await S.resetSight({ force: true });
  F.game.settings.set("dnd5e", "senseVisionSync", false);
  rows.syncOff = await S.resetSight({ force: true });
  F.game.settings.set("dnd5e", "senseVisionSync", true);
  const sys = F.game.system;
  F.game.system = { id: "dnd5e", version: "5.2.4" };
  rows.dnd5e5 = await S.resetSight({ force: true });
  F.game.system = { id: "pf2e", version: "7.0.0" };
  rows.otherSystem = await S.resetSight({ force: true });
  F.game.system = sys;
  F.game.settings.settings.delete("dnd5e.senseVisionSync");
  rows.settingAbsent = await S.resetSight({ force: true });
  F.game.settings.settings.set("dnd5e.senseVisionSync", { namespace: "dnd5e", key: "senseVisionSync", type: Boolean, default: true });
  await settle(mock);
  assert.deepEqual(rows, { again: null, force: { prototypes: 0, tokens: 0 }, syncOff: null, dnd5e5: null, otherSystem: null, settingAbsent: null });
  assert.deepEqual(out, [
    ["info", `${MODULE} | sight reset: 0 prototype(s), 0 token(s) back to basic / 0`],
    ["warn", `${MODULE} | sight reset skipped: dnd5e senseVisionSync is off`],
    ["warn", `${MODULE} | sight reset skipped: dnd5e senseVisionSync is off`],
  ]);
});

test("syncAll / syncLight / carriedLight after ready: converged, nothing to write", async () => {
  const S = game.pentaryn.senses;
  const mark = F.calls.length;
  assert.equal(await S.syncAll(), 0);
  assert.equal(await S.syncLight(null), 0);
  assert.equal(await S.syncLight({ id: "x", pack: "world.actors" }), 0);
  assert.equal(S.carriedLight(hero), null);
  assert.equal(S.carriedLight(null), null);
  assert.deepEqual(S.carriedLight(s1.tokens.get(ID.tGob).actor), {
    bright: 20, dim: 40, angle: 360, color: "#ff9a3c", alpha: 0.4, luminosity: 0.5, negative: false, darkness: { min: 0, max: 1 },
    animation: { type: "torch", speed: 2, intensity: 2, reverse: false },
  });
  assert.deepEqual(since(mark), []);
});

test("hook wrappers: chain and light warn with their prefix and swallow; carried hooks are raw", t => {
  const out = captureConsole(t);
  const boom = { get object() { throw new Error("boom"); } };
  F.hookErrors.length = 0;
  assert.equal(F.fireCall("renderTokenHUD", boom, null), true);
  const throwingActivity = { get item() { throw new Error("bad activity"); } };
  assert.equal(F.fireCall("dnd5e.preUseActivity", throwingActivity, {}), true, "a throwing light handler is no veto");
  assert.deepEqual(F.hookErrors, [], "chain and light catch their own");
  const badItem = { get parent() { throw new Error("raw"); } };
  F.fire("createItem", badItem);
  assert.deepEqual(out.slice(0, 3), [
    ["warn", `${MODULE} | chain renderTokenHUD`, "Error: boom"],
    ["warn", `${MODULE} | light renderTokenHUD`, "Error: boom"],
    ["warn", `${MODULE} | light dnd5e.preUseActivity`, "Error: bad activity"],
  ]);
  // createItem has two listeners: light's (wrapped; isGM → ensureTorchActivity rejects → .catch warns)
  // and the carried path's (raw: Foundry's Hooks catches it)
  assert.deepEqual(F.hookErrors.map(e => [e.hook, e.error.message]), [["createItem", "raw"]]);
  assert.equal(out[3][0], "warn");
  assert.match(out[3][1], /^Foundry VTT \| Error thrown in hooked function '.*' for hook 'createItem'$/);
});

test("setupLight (GM): every torch the GM can reach gets the Light activity once; idempotent", async t => {
  const out = captureConsole(t);
  const mark = F.calls.length;
  const n1 = await game.pentaryn.senses.setupLight();
  const n2 = await game.pentaryn.senses.light.setup();
  await settle(mock);
  pinJSON("setup-light", { n1, n2, calls: since(mark), console: out }, import.meta.url);
  assert.equal(n2, 0);
});
