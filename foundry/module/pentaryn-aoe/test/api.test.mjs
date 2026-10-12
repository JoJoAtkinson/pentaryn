// The kit-built API (S7): published at ready as module.api and game.pentaryn.aoe, rows ↔
// implementations, the describe/surface goldens, legacy rows, the -10 reads, inspect (depth ≤ 4,
// coded errors, the `as` view), the kit members.
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, maxDepth, normaliseDescribe, pinJSON } from "./kit/harness.mjs";
import { boot, flush, advance, MODULE } from "./fixtures/world.mjs";
import { fireball, damage, IDS, PLAYER_ID } from "./fixtures/fireball.mjs";

const ROOT = new URL("..", import.meta.url);
const { F, W } = await boot({ entry: true });
const api = game.modules.get(MODULE).api;
const { MANIFEST, FEATURE_ROWS } = await import("../api-manifest.mjs");
const { buildApi, surfaceOf } = await import("../lib/api.mjs");
const ctx = fireball(W, F);
const msg = damage(W, ctx, { hook: true });
await advance(800);
await flush(8);

test("published as module.api and game.pentaryn.aoe, frozen; every described method is a function", () => {
  assert.equal(game.pentaryn.aoe, api);
  assert.equal(Object.isFrozen(api), true);
  for (const path of api.describe().methods.map(m => m.path)) assert.equal(typeof api[path], "function", path);
});

test("drift fails at build: a manifest row without an implementation; an implementation without a row", () => {
  assert.throws(() => buildApi(MANIFEST, {}), /has no implementation/);
  assert.throws(() => buildApi({ ...MANIFEST, rows: [] }, { stray: () => 1 }), /has no API row/);
});

test("describe() equals golden/describe.json (version, kit, published excluded)", () => {
  pinJSON("describe", normaliseDescribe(api.describe()), import.meta.url);
});

test("surface equals golden/surface.json", () => {
  pinJSON("surface", surfaceOf(api), import.meta.url);
});

test("version and contract; VERSION === module.json", () => {
  assert.equal(api.version, manifestOf(ROOT).version);
  assert.equal(api.contract, "pentaryn-aoe/api@1");
});

test("every pre-migration row is legacy with resolve: false params; the -10 reads are not", () => {
  const rows = Object.fromEntries(api.describe().methods.map(m => [m.path, m]));
  const fresh = ["resolution", "latestResolution", "summary", "isHandle", "inspect"];
  assert.equal(Object.keys(rows).length, 24);
  for (const [path, m] of Object.entries(rows)) {
    assert.equal(!!m.legacy, !fresh.includes(path), path);
    for (const p of m.params) assert.equal(p.resolve, false, `${path}.${p.name}`);
  }
  assert.deepEqual(Object.values(FEATURE_ROWS).flat().map(r => r.path).sort(),
    ["activePlacement", "applyRows", "createHandle", "ensureHandleActor", "pendingFor", "pingPlayers", "resolve", "rollForPlayer", "rollNpcSaves", "selfApply", "setRow", "sweep"]);
  for (const p of ["resolve", "applyRows", "rollNpcSaves", "rollForPlayer", "pingPlayers", "setRow", "sweep"]) assert.equal(rows[p].gm, true, p);
});

test("the flags contract: what aoe writes, what it reads", () => {
  const { flags } = api.describe();
  assert.ok(flags.writes.includes("flags.pentaryn-aoe.handle") && flags.writes.includes("flags.pentaryn-aoe.resolution"));
  assert.equal(flags.writes.length, 9);
  assert.deepEqual(flags.reads, ["flags.dnd5e.*", "flags.item-piles.data.enabled"]);
});

test("describe().patches lists nothing until Argon or Part G is patched; hooks are the registration manifest", () => {
  const d = api.describe();
  assert.ok(d.patches.every(p => ["aoe-argon-handle-bind", "aoe-self-area-aim"].includes(p.adjustments)));
  assert.equal(d.hooks.length, api.hookIds().length);
  assert.deepEqual(d.settings.map(s => s.key).slice(-1), ["npcSaveRollMode"]);
});

/* ── the -10 reads ──────────────────────────────────────────────────────────────────────────── */

test("-10 resolution: a deep copy of the tray state; null for no message or none", () => {
  const r = api.resolution(msg.id);
  assert.deepEqual(r, msg.flags[MODULE].resolution);
  assert.notEqual(r, msg.flags[MODULE].resolution);
  assert.deepEqual(api.resolution(msg), r);
  assert.equal(api.resolution("missingMessage01"), null);
  assert.equal(api.resolution(ctx.usage.id), null);
});

test("-10 summary: core.summariseResolution of the flag", () => {
  const s = api.summary(msg.id);
  assert.equal(s.item, "Fireball");
  assert.equal(s.applicable, 2, "the two goblins with a save; Caven still waits");
  assert.deepEqual(s.rows.map(r => r.id), [IDS.g1, IDS.g2, IDS.cv, IDS.mr, IDS.dead, IDS.hid]);
  assert.equal(s.playerStatus, "waiting");
  assert.equal(api.summary("missingMessage01"), null);
});

test("-10 latestResolution: the newest live tray, optionally on one scene", () => {
  assert.deepEqual(api.latestResolution(), { messageId: msg.id, resolution: msg.flags[MODULE].resolution });
  assert.equal(api.latestResolution({ sceneId: IDS.scene }).messageId, msg.id);
  assert.equal(api.latestResolution({ sceneId: "otherScene000001" }), null);
  F.canvas.scene = ctx.s;
  assert.equal(api.latestResolution({ sceneId: "current" }).messageId, msg.id);
});

test("-10 isHandle: core.isHandleTarget", () => {
  assert.equal(api.isHandle(ctx.s.tokens.get(IDS.handle)), true);
  assert.equal(api.isHandle(ctx.s.tokens.get(IDS.g1)), false);
  assert.equal(api.isHandle(game.actors.find(a => a.flags?.[MODULE]?.handleActor)), true);
});

/* ── inspect ────────────────────────────────────────────────────────────────────────────────── */

test("inspect(message): the tray summary, npcSave, effectsApplied; depth ≤ 4", () => {
  const out = api.inspect(msg.id);
  assert.equal(out.message.id, msg.id);
  assert.equal(out.resolution.item, "Fireball");
  assert.equal(out.npcSave, false);
  assert.ok(maxDepth(out) <= 4);
  const npc = game.messages.contents.find(m => m.flags?.[MODULE]?.npcSave);
  assert.equal(api.inspect(npc).npcSave, true);
});

test("inspect(token | actor): handle, region, handleActor, careful; depth ≤ 4", () => {
  const h = api.inspect(ctx.s.tokens.get(IDS.handle));
  assert.deepEqual([h.isHandle, h.region, h.handleActor], [true, IDS.region, true]);
  const g = api.inspect(ctx.s.tokens.get(IDS.g1));
  assert.deepEqual([g.isHandle, g.region, g.handleActor, g.careful], [false, null, false, null]);
  const a = api.inspect("Marrith");
  assert.equal(a.actor.name, "Marrith");
  assert.equal("token" in a, false);
  for (const o of [h, g, a]) assert.ok(maxDepth(o) <= 4);
});

test("inspect: an unknown ref throws NOT_FOUND (coded)", () => {
  assert.throws(() => api.inspect("Nobody At All"), /^PentarynError: NOT_FOUND|NOT_FOUND/);
  assert.throws(() => api.inspect("Scene.FireScene0000001.Token.missingToken0001"), /NOT_FOUND/);
});

test("inspect(…, { as: a player }): no tray summary; Careful Spell only on an actor they own", async () => {
  await ctx.wizard.update({ [`flags.${MODULE}.careful`]: { at: Date.now(), key: null, usage: null } });
  const gm = api.inspect(ctx.wizard);
  assert.deepEqual(gm.careful, { at: Date.now(), key: null, usage: null });
  assert.deepEqual(api.inspect(ctx.wizard, { as: PLAYER_ID }).careful, gm.careful, "the player owns Marrith");
  const goblin = api.inspect(ctx.g1, { as: PLAYER_ID });
  assert.equal(goblin.careful, null);
  const view = api.inspect(msg.id, { as: PLAYER_ID });
  assert.deepEqual(view.resolution, { playerStatus: "waiting" });
});

/* ── kit members ────────────────────────────────────────────────────────────────────────────── */

test("settings() is every SETTINGS row's live value", () => {
  const s = api.settings();
  assert.equal(Object.keys(s).length, 17);
  assert.equal(s.npcSaveRollMode, "gm");
  assert.equal(s.handleTokens, true);
});

test("trace() is the log's ring (empty unless CONFIG.debug['pentaryn-aoe'])", () => {
  assert.deepEqual(api.trace(), []);
});

test("uninstall() removes every hook the module registered", () => {
  api.uninstall();
  assert.deepEqual(api.hookIds(), []);
  assert.deepEqual(F.listeners(), {});
});
