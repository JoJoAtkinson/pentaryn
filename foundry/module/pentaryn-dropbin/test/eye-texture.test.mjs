// dropbin-R8 [declared]: a failed eye-texture load (missing file or a rejected load) is remembered; every later
// paintEye returns without asking the loader again (one warning per attempt, not one per frame) until
// canvasReady clears the failure and the next paint tries once more.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dropbinWorld } from "./fixtures/world.mjs";

const MOD = "pentaryn-dropbin";
const F = await dropbinWorld();
let loads = 0;
let next = async () => null;                                   // the texture file is missing
F.foundry.canvas.loadTexture = src => { loads++; return next(src); };
await import("../dropbin.mjs");
F.fire("init");
F.fire("ready");
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
await flush();
const { corpses } = game.pentaryn.dropbin;

const corpseToken = name => {
  const doc = { name, flags: { [MOD]: { corpse: true } }, isSecret: false, getSize: () => ({ width: 100, height: 100 }) };
  const token = { document: doc, destroyed: false, effects: { zIndex: 1 }, addChild(c) { c.parent = this; return c; } };
  doc.object = token;
  F.piles.add(doc);
  return token;
};

const watchWarnings = async fn => {
  const real = console.warn;
  const warns = [];
  console.warn = (...a) => warns.push(a.map(String).join(" "));
  try { await fn(); } finally { console.warn = real; }
  return warns.filter(w => w.includes("eye texture"));
};

test("dropbin-R8: a missing eye texture is loaded once and warned once, not on every paint", async () => {
  const token = corpseToken("Dead Kobold");
  F.canvas.tokens.placeables = [token];
  loads = 0;
  const warns = await watchWarnings(async () => {
    for (let i = 0; i < 20; i++) { corpses.paintEye(token); await flush(); }
  });
  assert.equal(loads, 1, "no reload per paint after a failed load");
  assert.equal(warns.length, 1, "one 'eye texture missing' warning per attempt");
  assert.equal(token.pdLootEye, undefined, "nothing painted without a texture");
});

test("dropbin-R8: canvasReady clears the failure; the next paint tries once more and paints when it loads", async () => {
  const token = corpseToken("Dead Gnoll");
  F.canvas.tokens.placeables = [token];
  loads = 0;
  next = async () => { throw new Error("404"); };            // a rejected load is remembered too
  const warns = await watchWarnings(async () => {
    F.fire("canvasReady", F.canvas);
    await flush();
    for (let i = 0; i < 10; i++) { corpses.paintEye(token); await flush(); }
  });
  assert.equal(loads, 1, "one retry after canvasReady, then none while it keeps failing");
  assert.equal(warns.length, 1, "one warning for the retry");
  next = async src => ({ src, baseTexture: {} });
  corpses.paintEye(token);
  await flush();
  assert.equal(loads, 1, "still remembered until the next canvasReady");
  F.fire("canvasReady", F.canvas);
  await flush();
  assert.equal(loads, 2);
  assert.equal(token.pdLootEye?.visible, true, "the eye paints once the texture loads");
});
