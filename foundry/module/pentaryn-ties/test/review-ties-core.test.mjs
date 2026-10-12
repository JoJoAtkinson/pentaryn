/**
 * Final code review (ties-core, 2026-10-12): edge cases against promises the module already makes.
 * Each block is standalone (its own world) and pins no golden rows.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";
import { clampAttribute, readRegistry, resolveAttrRef } from "../known-core.mjs";

const PLAYER = "zzPlayerUser0001";
const PC = "zzReviewPc000001";

await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  settings: { "pentaryn-ties.attributes": [{ id: "guild", title: "Salt Guild", category: "Guild" }] },
  actors: [{ id: PC, name: "ZZ Review PC", type: "character", ownership: { default: 0, [PLAYER]: 3 }, system: { details: { type: { value: "humanoid" } }, traits: { size: "med" } } }],
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

test("grantKnowledge with null opts behaves like omitted opts (writes never throw)", async () => {
  const pc = game.actors.get(PC);
  const omitted = await A().tell(pc, "guild");
  const nulled = await A().tell(pc, "guild", null);
  assert.equal(nulled.ok, true);
  assert.deepEqual(nulled.ids, omitted.ids);
});

test("selectAttributes with null opts adds like omitted opts (writes never throw)", async () => {
  const out = await A().select(["guild"], null);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, (await A().select(["guild"])).ids);
});

test("clampAttribute keeps a kind: actor id verbatim", () => {
  const KIND = "kind:AbC123def456GHI7";
  assert.equal(clampAttribute({ id: KIND, title: "Goblin" }).id, KIND);
  assert.equal(readRegistry([{ id: KIND }])[0].id, KIND);
  assert.equal(resolveAttrRef(KIND, readRegistry([{ id: KIND, title: "Goblin" }])).id, KIND);
});
