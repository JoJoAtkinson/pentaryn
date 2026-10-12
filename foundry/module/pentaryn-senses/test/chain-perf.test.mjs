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

// Finding -20 (standalone): paint() updates its sprites in place; linkSpriteSpecs is pure.
test("linkSpriteSpecs: today's geometry for a 3-4-5 link at 28 px; null under a pixel", async () => {
  const { linkSpriteSpecs } = await import("../senses-core.mjs");
  const s = linkSpriteSpecs({ x: 0, y: 0 }, { x: 300, y: 400 }, 28, 96);
  assert.deepEqual(s.link, { width: 500, height: 28, rotation: Math.atan2(400, 300), scale: 28 / 96, x: 0, y: 0 });
  assert.deepEqual(s.shadow, { width: 500, height: 28, rotation: Math.atan2(400, 300), scale: 28 / 96, x: 2.8000000000000003, y: 4.48, tint: 0, alpha: 0.45 });
  assert.equal(linkSpriteSpecs({ x: 1, y: 1 }, { x: 1.5, y: 1 }, 28, 96), null);
});

test("a second paint constructs no sprite; a moved token moves its link in place; a broken chain destroys its two", async () => {
  F.frames.flush();
  await C().link(ID.tHulk, ID.tStake);
  C().repaint();
  F.frames.flush();
  const layer = F.canvas.primary.children[0];
  const [shadow, link] = layer.children;
  assert.equal(layer.children.length, 2);
  const built = F.pixi.sprites;
  C().repaint();
  F.frames.flush();
  assert.equal(F.pixi.sprites, built, "no new sprite");
  const hulk = game.scenes.get(ID.s1).tokens.get(ID.tHulk);
  hulk.x += 300;
  C().repaint();
  F.frames.flush();
  assert.equal(F.pixi.sprites, built);
  assert.deepEqual(layer.children, [shadow, link], "the same two sprites");
  assert.equal(link.width > 0 && shadow.width === link.width, true);
  hulk.x -= 300;
  await C().link(ID.tGob, ID.tHero);                   // a second chain: two more sprites, appended
  F.frames.flush();
  assert.equal(F.pixi.sprites, built + 2);
  assert.deepEqual(layer.children.slice(0, 2), [shadow, link]);
  const [gobShadow, gobLink] = layer.children.slice(2);
  await C().break(ID.tGob);                            // that pair goes; the first stays untouched
  F.frames.flush();
  assert.equal(gobShadow.destroyed && gobLink.destroyed, true);
  assert.deepEqual(layer.children, [shadow, link]);
  await C().break(ID.tHulk);
  F.frames.flush();
});
