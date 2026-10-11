// Ghost context cache (standalone finding aoe-movement-portals-19, F-M1): cached equals live over
// finding -19's 480-case matrix, and the per-token hot paths read settings and combats once per
// change instead of once per token (a read counter stands in for a benchmark).
import * as core from "../movement-core.mjs";
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { SCENE, combat, movementWorld, token } from "./fixtures/world.mjs";

const { buildGhostContext, combatOnScene, combatSceneIds, ghostFor, ghostForCtx, normalizePolicy } = core;

/* ── pure: the equivalence matrix ─────────────────────────────────────────── */

const S = "sceneA", T = "sceneB";
const linked = (o = {}) => ({ active: true, sceneId: S, started: false, combatantSceneIds: [S], ...o });
const COMBATS = [
  [],
  [linked()],
  [linked({ active: false })],
  [{ active: true, sceneId: null, started: true, combatantSceneIds: [T] }],
  [linked({ combatantSceneIds: [] })],
];

test("ghostForCtx(buildGhostContext(…)) equals ghostFor(…) over finding -19's 480 cases", () => {
  let n = 0;
  for (const policy of ["off", "exploration", "always", "junk"]) for (const wish of [true, false])
    for (const isGM of [true, false]) for (const isOwner of [true, false]) for (const combats of COMBATS)
      for (const sceneId of [S, T, null]) {
        const cached = ghostForCtx(buildGhostContext({ isGM, policy, wish, ownedOnTop: true, combats }), { isOwner, sceneId });
        const live = ghostFor({ isGM, policy: normalizePolicy(policy), wish, isOwner, combatActive: combatOnScene(combats, sceneId) });
        assert.equal(cached, live, JSON.stringify({ policy, wish, isGM, isOwner, combats, sceneId }));
        n += 1;
      }
  assert.equal(n, 480);
});

test("combatSceneIds contains a scene exactly when combatOnScene is true", () => {
  const extra = [
    [null, {}, { active: true }],
    [{ active: true, sceneId: null, started: true, combatantSceneIds: ["", T, S, null] }],
    [linked({ started: true, combatantSceneIds: [] }), linked({ sceneId: T, active: false })],
  ];
  for (const combats of [...COMBATS, ...extra]) {
    const ids = combatSceneIds(combats);
    for (const sceneId of [S, T, null, "", "sceneC"]) {
      assert.equal(ids.has(sceneId), combatOnScene(combats, sceneId), JSON.stringify({ combats, sceneId }));
    }
  }
  assert.deepEqual([...combatSceneIds(undefined)], []);
});

test("buildGhostContext normalises, is frozen, and an explicit isGM overrides the cached one", () => {
  const ctx = buildGhostContext({ isGM: false, policy: "junk", wish: 1, ownedOnTop: false, combats: [] });
  assert.equal(ctx.policy, "exploration");
  assert.equal(ctx.wish, true);
  assert.equal(ctx.ownedOnTop, false);
  assert.ok(Object.isFrozen(ctx));
  assert.equal(ghostForCtx(ctx, { isOwner: true, sceneId: S }), true);
  assert.equal(ghostForCtx(ctx, { isOwner: true, sceneId: S, isGM: true }), false);
  assert.equal(ghostForCtx(null, { isOwner: true, sceneId: S }), false);
});

/* ── glue: reads per refresh (the performance half) ──────────────────────── */

mock.timers.enable({ apis: ["setTimeout"] });
const F = await movementWorld();
await import("../movement.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const reads = { combats: 0, settings: 0 };
const list = [combat({ sceneId: "elsewhere", combatants: Array.from({ length: 12 }, () => ({ sceneId: "elsewhere" })) })];
game.combats = { get contents() { reads.combats += 1; return list; } };
const get = game.settings.get.bind(game.settings);
game.settings.get = (ns, key) => { reads.settings += 1; return get(ns, key); };
const settle = async () => {
  for (let i = 0; i < 6; i++) {
    mock.timers.tick(60);
    for (let j = 0; j < 20; j++) await Promise.resolve();
  }
};

test("40 token refreshes read the combats once and three settings, not once per token", async () => {
  await game.settings.set("pentaryn-movement", "ghost", true);
  await settle();
  const tokens = Array.from({ length: 40 }, (_, i) => token({ id: `t${i}`, owner: i % 2 === 0, sort: i }));
  reads.combats = reads.settings = 0;
  for (const t of tokens) F.fire("refreshToken", t, { refreshState: true });
  assert.deepEqual(reads, { combats: 1, settings: 3 });
  assert.equal(tokens[0].mesh.alpha, 0.55, "an owned token still ghosts");
  assert.equal(tokens[1].mesh.alpha, 1);

  reads.combats = reads.settings = 0;
  for (const t of tokens) F.fire("refreshToken", t, { refreshState: true });
  assert.deepEqual(reads, { combats: 0, settings: 0 }, "a second frame reads nothing");
});

test("a combat hook drops the cache before the refresh: the next frame sees the fight", async () => {
  list.push(combat({ sceneId: SCENE }));
  F.fire("createCombat");
  const t = token({ owner: true });
  reads.combats = 0;
  F.fire("refreshToken", t, { refreshState: true });
  assert.equal(reads.combats, 1);
  assert.equal(t.mesh.alpha, 1, "exploration only: the fight here stops ghosting at once");
  await settle();
  list.pop();
  F.fire("deleteCombat");
  await settle();
});

test("each setting's onChange drops the cache (policy, wish, owned-on-top)", async () => {
  const t = () => token({ owner: true, sort: 1 });
  await game.settings.set("pentaryn-movement", "ghostPolicy", "always");
  await game.settings.set("pentaryn-movement", "ghost", true);
  const a = t();
  F.fire("refreshToken", a, { refreshState: true });
  assert.equal(a.mesh.alpha, 0.55);
  await game.settings.set("pentaryn-movement", "ghostPolicy", "off");
  const b = t();
  F.fire("refreshToken", b, { refreshState: true });
  assert.equal(b.mesh.alpha, 1, "policy off");
  await game.settings.set("pentaryn-movement", "ownedOnTop", false);
  const c = t();
  F.fire("refreshToken", c, { refreshState: true });
  assert.equal(c.mesh.sort, 1, "owned-on-top off: no lift");
  await settle();
});
