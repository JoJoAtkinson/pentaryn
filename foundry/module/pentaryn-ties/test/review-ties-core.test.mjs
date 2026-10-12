/**
 * Final code review (ties-core, 2026-10-12): edge cases against promises the module already makes.
 * Each block is standalone (its own world) and pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PLAYER = "zzPlayerUser0001";

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": [{ id: "guild", title: "Salt Guild", category: "Guild" }] },
  actors: [],
});
const A = () => game.pentaryn.ties.attributes;
const asPlayer = async fn => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  try {
    return await fn();
  } finally {
    game.user = gm;
  }
};

test("a null ref reads [] for a player too (READ_REF never throws)", async () => {
  assert.deepEqual(await A().of(null), []);
  assert.deepEqual(await A().ofEffective(null), []);
  assert.deepEqual(await asPlayer(() => A().of(null)), []);
  assert.deepEqual(await asPlayer(() => A().of(undefined)), []);
  assert.deepEqual(await asPlayer(() => A().ofEffective(null)), []);
  assert.deepEqual(await asPlayer(() => A().ofEffective(undefined)), []);
});
