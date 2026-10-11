/**
 * Finding -19 (standalone): refreshToken fires per token per animation frame. With no chain drawn
 * it used to rebuild the scene's chain pairs every time; it now reads a per-scene cache that the
 * token create/delete, chain-flag update and canvas hooks drop.
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { boot, settle, ID, NOW } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot();
await settle(mock);
const C = () => game.pentaryn.chain;
const s1 = game.scenes.get(ID.s1);

let reads = 0;
const contents = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(s1.tokens), "contents").get;
Object.defineProperty(s1.tokens, "contents", { get() { reads++; return contents.call(this); }, configurable: true });

test("no chain drawn: 50 refreshTokens build the pairs once; a chain flag change rebuilds them", async () => {
  await C().break(ID.tHulk);                           // no chain left: no layer
  F.frames.flush();
  reads = 0;
  for (let i = 0; i < 50; i++) F.fire("refreshToken");
  assert.equal(reads, 1, "one build for the burst");
  assert.equal(F.frames.pending(), 0, "nothing to draw");
  await C().link(ID.tHulk, ID.tStake);                 // updateToken with the chain flag: cache dropped
  F.frames.flush();
  reads = 0;
  F.fire("canvasTearDown");                            // forget the layer and the cache
  for (let i = 0; i < 50; i++) F.fire("refreshToken");
  assert.equal(reads, 1);
  assert.equal(F.frames.pending(), 1, "the new chain is seen");
  F.frames.flush();
});

test("create/delete token drop the scene's cached pairs", () => {
  F.fire("canvasTearDown");
  F.fire("refreshToken");
  reads = 0;
  F.fire("refreshToken");
  assert.equal(reads, 0, "cached");
  F.fire("createToken", { parent: s1 });
  reads = 0;
  F.fire("refreshToken");
  assert.equal(reads, 1, "rebuilt after createToken");
  F.fire("deleteToken", { parent: s1 });
  reads = 0;
  F.fire("refreshToken");
  assert.equal(reads, 1, "rebuilt after deleteToken");
  F.frames.flush();
});
