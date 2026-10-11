// Core additions of the migration (guide S3, findings -18, -21, -23): constants, the literal key
// maps, ghostKeyboardMovement and statusFrom. movement-core.mjs is imported first and bare.
import * as core from "../movement-core.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf } from "./kit/harness.mjs";

const { POLICIES, TOOL_KEYS, TOOL_CLIP_KEYS, GM_KEYS, GM_CLIP_KEYS, NOTIFY_BLOCKED, NOTIFY_CLEARED, NOTIFY_BACK,
  ghostKeyboardMovement, statusFrom, playerTool, gmTool, ghostAllowed, wishToClear } = core;
const same = (got, want) => assert.equal(JSON.stringify(got), JSON.stringify(want));

test("core stays pure (no Foundry globals at import)", () => {
  for (const g of ["game", "canvas", "ui", "foundry", "CONFIG", "Hooks"]) assert.equal(globalThis[g], undefined, g);
});

test("VERSION === module.json version; identity constants", () => {
  assert.equal(core.VERSION, manifestOf(new URL("..", import.meta.url)).version);
  assert.equal(core.MODULE, "pentaryn-movement");
  assert.equal(core.SHORT, "movement");
  assert.equal(core.NS, "movement");
  assert.equal(core.CONTRACT, "pentaryn-movement/api@1");
  assert.equal(core.I18N, "PENTARYN_MOVEMENT");
  assert.deepEqual(core.CSS, { blocked: "pm-blocked" });
  assert.deepEqual(core.HOOKS, {});
  assert.ok(Object.isFrozen(core.HOOKS));
});

/* ── literal key maps: the keys the old template literals built ─────────── */

test("TOOL_KEYS / TOOL_CLIP_KEYS cover every playerTool state, byte for byte", () => {
  const states = new Set();
  for (const isGM of [false, true]) for (const policy of [...POLICIES, "junk"]) for (const combatActive of [false, true])
    for (const wish of [false, true]) states.add(playerTool({ isGM, policy, combatActive, wish }).state);
  assert.deepEqual([...states].sort(), ["combat", "off", "on", "ready"]);
  for (const s of states) {
    assert.equal(TOOL_KEYS[s], `PENTARYN_MOVEMENT.tool.${s}`);
    assert.equal(TOOL_CLIP_KEYS[s], `PENTARYN_MOVEMENT.tool.clip.${s}`);
  }
  assert.equal(TOOL_CLIP_KEYS.what, "PENTARYN_MOVEMENT.tool.clip.what");
  assert.equal(TOOL_CLIP_KEYS.vision, "PENTARYN_MOVEMENT.tool.clip.vision");
});

test("GM_KEYS cover every gmTool state and flip result; GM_CLIP_KEYS keep today's order", () => {
  for (const policy of [...POLICIES, "junk"]) {
    const { state } = gmTool({ isGM: true, policy });
    assert.equal(GM_KEYS[state], `PENTARYN_MOVEMENT.gm.${state}`);
  }
  assert.deepEqual(Object.keys(GM_KEYS), [...POLICIES]);
  assert.deepEqual(GM_CLIP_KEYS, ["PENTARYN_MOVEMENT.gm.clip.what", "PENTARYN_MOVEMENT.gm.clip.modes", "PENTARYN_MOVEMENT.gm.clip.combat"]);
});

test("NOTIFY_* cover every ghostAllowed / wishToClear reason and both ghost-back reasons", () => {
  const reasons = new Set();
  for (const policy of [...POLICIES, "junk"]) for (const combatActive of [false, true]) {
    const r = ghostAllowed({ policy, combatActive }).reason;
    if (r) reasons.add(r);
    const c = wishToClear({ policy, combatActive, wish: true });
    if (c) reasons.add(c);
  }
  assert.deepEqual([...reasons].sort(), ["combat", "off"]);
  for (const r of reasons) {
    assert.equal(NOTIFY_BLOCKED[r], `PENTARYN_MOVEMENT.notify.blocked.${r}`);
    assert.equal(NOTIFY_CLEARED[r], `PENTARYN_MOVEMENT.notify.cleared.${r}`);
    assert.equal(NOTIFY_BACK[r], `PENTARYN_MOVEMENT.notify.back.${r}`);
  }
  for (const m of [TOOL_KEYS, TOOL_CLIP_KEYS, GM_KEYS, GM_CLIP_KEYS, NOTIFY_BLOCKED, NOTIFY_CLEARED, NOTIFY_BACK]) {
    assert.ok(Object.isFrozen(m));
  }
});

/* ── ghostKeyboardMovement (finding -18's table) ─────────────────────────── */

test("ghostKeyboardMovement: ghosted objects gain the flags in place; the rest untouched", () => {
  const r = ["x", { movement: { a: { constrainOptions: { ignoreWalls: false, k: 1 } }, b: { constrainOptions: { ignoreWalls: false } } } }];
  const objs = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const out = ghostKeyboardMovement(r, objs, o => o.id === "a");
  assert.equal(out, r);
  same(r[1].movement.a.constrainOptions, { ignoreWalls: true, k: 1, ignoreCost: true, ignoreTokens: true });
  same(r[1].movement.b.constrainOptions, { ignoreWalls: false });
  assert.deepEqual(Object.keys(r[1].movement), ["a", "b"]);
});

test("ghostKeyboardMovement: no result, no movement, no objects", () => {
  assert.equal(ghostKeyboardMovement(undefined, [{ id: "a" }], () => true), undefined);
  assert.deepEqual(ghostKeyboardMovement([1, {}], [{ id: "a" }], () => true), [1, {}]);
  const r2 = ["x", { movement: { a: { constrainOptions: { k: 2 } } } }];
  ghostKeyboardMovement(r2, null, () => true);
  assert.deepEqual(r2[1].movement.a.constrainOptions, { k: 2 });
  const r3 = ["x", { movement: { a: {} } }];
  ghostKeyboardMovement(r3, [{ id: "a" }, null], () => true);
  same(r3[1].movement.a.constrainOptions, { ignoreWalls: true, ignoreCost: true, ignoreTokens: true });
});

test("ghostKeyboardMovement: an isGhost throw propagates after the earlier objects were changed (glue catches)", () => {
  const r = ["x", { movement: { a: { constrainOptions: {} }, b: { constrainOptions: {} } } }];
  assert.throws(() => ghostKeyboardMovement(r, [{ id: "a" }, { id: "b" }], o => {
    if (o.id === "b") throw new Error("boom");
    return true;
  }), /boom/);
  assert.equal(r[1].movement.a.constrainOptions.ignoreWalls, true);
  assert.deepEqual(r[1].movement.b.constrainOptions, {});
});

/* ── statusFrom (finding -23) ─────────────────────────────────────────────── */

test("statusFrom: today's status() shape and key order", () => {
  same(statusFrom({ policy: "exploration", combat: true, wish: true, isGM: false, ownedOnTop: true, patched: { drag: true, keyboard: false } }), {
    policy: "exploration", combatOnScene: true, allowed: false, reason: "combat", wish: true, ghost: false,
    ownedOnTop: true, patched: { drag: true, keyboard: false },
  });
  const s2 = statusFrom({ policy: "always", combat: true, wish: true, isGM: false });
  assert.equal(s2.ghost, true);
  assert.equal(s2.allowed, true);
  assert.equal(s2.reason, null);
  assert.deepEqual(s2.patched, { drag: false, keyboard: false });
  assert.equal(statusFrom({ policy: "always", combat: false, wish: true, isGM: true }).ghost, false);
  assert.equal(statusFrom({ policy: "junk" }).policy, "exploration");
  same(Object.keys(statusFrom()), ["policy", "combatOnScene", "allowed", "reason", "wish", "ghost", "ownedOnTop", "patched"]);
});
