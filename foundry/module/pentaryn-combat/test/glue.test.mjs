// Lifecycle characterisation on the active GM's client (guide S1, glue.test). Both entries load as
// Foundry loads them; init / setup / ready fire; their effects are pinned:
//   init   30 world settings in DEFAULTS order, option objects key by key (golden/settings-register.json)
//   setup  hooks only (hooks.test pins them), no calls
//   ready  the orphan-flag sweep, Argon's picker tutorial marked seen, the pip-settle and portrait
//          patches; publish ONE TICK later, then the weapon-set seed (golden/ready-calls.json)
// plus the legacy surface (golden/surface-legacy.json), setting() fallbacks, the settings onChange,
// and F.calls for one Full Attack by the Fighter in a started combat (golden/full-attack-calls.json).
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { MODULE, captureConsole, drain, makeCombat, makeToken, setupWorld } from "./fixtures/world.mjs";
import { fighter, wolf } from "./fixtures/actors.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });

const W = await setupWorld();
const { F, doc, argon } = W;
const lines = captureConsole();
const tick = async ms => { mock.timers.tick(ms); await drain(); };

// a character with no weapon-set flag (seeded at ready), and one with an orphan turn flag
const fig = fighter();
const orphan = wolf({ flags: { [MODULE]: { turn: { key: "gone0000000000001:1:x" }, reaction: { combatId: "gone0000000000001" } } } });

await import("../combat.mjs");
await import("../hud.mjs");
const settingsMod = await import("../settings.mjs");

test("utils are Foundry's own (common/), not the stub's shims", () => {
  assert.equal(F.utilsSource, "foundry");
});

test("import alone: no calls, no publish, no settings; Argon's DOM untouched", () => {
  assert.deepEqual(F.calls, []);
  assert.equal(F.game.pentaryn, undefined);
  assert.equal(F.game.settings.settings.has(`${MODULE}.fullAttack`), false);
  assert.equal(doc.body.className, "");
  assert.deepEqual(lines, []);
});

test("init: 30 world settings in DEFAULTS order with literal label keys (golden/settings-register.json)", () => {
  F.fire("init");
  const keys = Object.keys(settingsMod.DEFAULTS);
  assert.equal(keys.length, 30);
  assert.deepEqual(F.calls, keys.map(k => ({ op: "settings.register", id: `${MODULE}.${k}` })));
  const rows = keys.map(k => {
    const raw = F.game.settings.settings.get(`${MODULE}.${k}`);
    assert.deepEqual(Object.keys(raw), ["name", "hint", "scope", "config", "type", "default", "onChange", "namespace", "key"]);
    const { onChange, ...rest } = raw;
    return { ...rest, type: rest.type?.name, onChange: typeof onChange };
  });
  pinJSON("settings-register", rows, import.meta.url);
  for (const r of rows) {
    assert.equal(r.name, `PENTARYN_COMBAT.Setting.${r.key}.Name`);
    assert.equal(r.hint, `PENTARYN_COMBAT.Setting.${r.key}.Hint`);
    assert.deepEqual([r.scope, r.config, r.type, r.default, r.onChange], ["world", true, "Boolean", true, "function"]);
  }
  F.calls.length = 0;
});

test("registerSettings again skips the registered keys (no double register)", () => {
  settingsMod.registerSettings();
  assert.deepEqual(F.calls, []);
});

test("settings onChange: re-renders Argon only with a bound actor; a throwing render is swallowed", () => {
  const onChange = F.game.settings.settings.get(`${MODULE}.fullAttack`).onChange;
  argon.ARGON._actor = null;
  onChange(false);
  assert.deepEqual(F.calls, []);
  argon.ARGON._actor = fig;
  onChange(false);
  assert.deepEqual(F.calls, [{ op: "argon.render" }]);
  const render = argon.ARGON.render;
  argon.ARGON.render = () => { throw new Error("reading 'system' of null"); };
  assert.doesNotThrow(() => onChange(true));
  argon.ARGON.render = render;
  argon.ARGON._actor = null;
  F.calls.length = 0;
  assert.deepEqual(lines, []);
});

test("setting(): the stored value, else the default when unregistered or unreadable", async () => {
  assert.equal(settingsMod.setting("fullAttack"), true);
  await F.game.settings.set(MODULE, "fullAttack", false);
  assert.equal(settingsMod.setting("fullAttack"), false);
  await F.game.settings.set(MODULE, "fullAttack", true);
  assert.equal(settingsMod.setting("notAKey"), undefined, "unregistered and not in DEFAULTS");
  const get = F.game.settings.get;
  F.game.settings.get = () => { throw new Error("not ready"); };
  assert.equal(settingsMod.setting("swingPips"), true);
  F.game.settings.get = get;
  F.calls.length = 0;
});

test("per-user choices are user flags: quick (default off) and rider mode (ask unless 'auto')", async () => {
  assert.equal(settingsMod.quickMode(), false);
  await settingsMod.setQuickMode(1);
  assert.equal(settingsMod.quickMode(), true);
  assert.equal(F.game.user.flags[MODULE].quick, true);
  await settingsMod.setQuickMode(0);
  assert.equal(settingsMod.riderMode("sneak-attack"), "ask");
  await settingsMod.setRiderMode("sneak-attack", "auto");
  assert.equal(settingsMod.riderMode("sneak-attack"), "auto");
  await settingsMod.setRiderMode("sneak-attack", "bogus");
  assert.equal(settingsMod.riderMode("sneak-attack"), "ask");
  assert.deepEqual(F.calls.filter(c => c.op === "update").map(c => c.changes), [
    { [`flags.${MODULE}.quick`]: true }, { [`flags.${MODULE}.quick`]: false },
    { [`flags.${MODULE}.riders.sneak-attack`]: "auto" }, { [`flags.${MODULE}.riders.sneak-attack`]: "ask" },
  ]);
  F.calls.length = 0;
});

test("setup: registrations only, no calls", () => {
  F.fire("setup");
  assert.deepEqual(F.calls, []);
});

test("ready (active GM): sweep, picker tutorial, patches; publish and seed one tick later (golden/ready-calls.json)", async () => {
  F.fire("ready");
  await drain();
  assert.equal(F.game.pentaryn, undefined, "not published synchronously at ready");
  const atReady = F.calls.splice(0);
  await tick(0);
  const afterTick = F.calls.splice(0);
  pinJSON("ready-calls", { atReady, afterTick, console: lines.splice(0) }, import.meta.url);
  assert.ok(doc.body.classList.contains("pentaryn-combat-picker-cue"));
  assert.equal(doc.body.style["--pentaryn-combat-picker-cue"], JSON.stringify(F.game.i18n.localize("PENTARYN_COMBAT.Hud.PickerCue")));
  assert.equal(F.game.settings.get("enhancedcombathud", "targetPickerGuideShown"), true);
  assert.equal(orphan.flags[MODULE].turn, undefined, "orphan turn flag swept");
  assert.equal(orphan.flags[MODULE].reaction, undefined, "orphan reaction flag swept");
  assert.equal(typeof F.game.pentaryn.combat, "object");
  assert.deepEqual(Object.keys(fig.flags.enhancedcombathud.weaponSets), ["1", "2", "3"]);
  assert.equal(CONFIG.ARGON.MAIN.ActionPanel.prototype.updateActionUse._pcSettles, true);
  assert.equal(CONFIG.ARGON.PORTRAIT.PortraitPanel.prototype._pcConditions, true);
});

test("legacy surface: 23 members, core included (golden/surface-legacy.json)", async () => {
  const api = F.game.pentaryn.combat;
  const surface = Object.keys(api).map(k => [k, typeof api[k]]);
  pinJSON("surface-legacy", surface, import.meta.url);
  assert.equal(surface.length, 23);
  assert.equal(api.core, await import("../combat-core.mjs"), "core is the module namespace itself");
  assert.equal(Object.isFrozen(api), false, "the api object is a plain mutable object today");
  assert.equal(F.game.modules.get(MODULE).api, undefined, "no module.api");
  assert.equal(F.game.pentaryn.combat, api);
});

test("one Full Attack by the Fighter in a started combat: F.calls pinned (golden/full-attack-calls.json)", async () => {
  const tok = makeToken(fig, { id: "tokFighter000001" });
  const gob = wolf({ id: "goblin0000000001", name: "Goblin" });
  const gobTok = makeToken(gob, { id: "tokGoblin0000001", x: 1, disposition: -1 });
  F.game.user.targets.add(gobTok);
  makeCombat({ id: "c1", round: 1, turn: 0, entries: [{ id: "cb1", actor: fig, token: tok }, { id: "cb2", actor: gob, token: gobTok }] });
  F.calls.length = 0;
  const api = F.game.pentaryn.combat;
  assert.deepEqual(api.plan(fig).swings.map(s => s.weaponId), ["longsword0000001", "longsword0000001"]);
  const out = await api.fullAttack(fig);
  await tick(400);
  assert.deepEqual(out, { rolled: 2, status: "done" });
  const calls = F.calls.splice(0);
  pinJSON("full-attack-calls", { calls, console: lines.splice(0) }, import.meta.url);
  const turn = fig.flags[MODULE].turn;
  assert.equal(turn.key, "c1:1:cb1");
  assert.equal(turn.attackAction.swings, 2);
  assert.deepEqual(turn.attackAction.weapons, ["longsword0000001"], "distinct weapons");
  assert.equal(fig.flags[MODULE].last.weapon, "longsword0000001");
  assert.equal(api.running(), null);
  assert.equal(doc.getElementById("pentaryn-combat-strip"), null, "strip gone");
  assert.equal(F.game.messages.contents.filter(m => m.type === "usage").length, 1, "one usage card for the item");
});
