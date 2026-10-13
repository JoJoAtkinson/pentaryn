// dropbin-EXT-8 [declared]: the corpse eye is the module's own asset. It loaded
// assets/tokens/custom/props/icon-eye.webp, one world's Data folder the module never shipped, so any other
// world (the tooling is world-agnostic) drew no eye. It now loads modules/pentaryn-dropbin/assets/icon-eye.webp,
// shipped inside the module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dropbinWorld } from "./fixtures/world.mjs";

const MOD = "pentaryn-dropbin";
const SRC = `modules/${MOD}/assets/icon-eye.webp`;
const F = await dropbinWorld();
const asked = [];
F.foundry.canvas.loadTexture = async src => { asked.push(src); return { src, baseTexture: {} }; };
await import("../dropbin.mjs");
F.fire("init");
F.fire("ready");
const flush = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};
await flush();
const { corpses } = game.pentaryn.dropbin;

test("dropbin-EXT-8: the eye texture is loaded from the module's own assets folder", async () => {
  const doc = { name: "Dead Kobold", flags: { [MOD]: { corpse: true } }, isSecret: false, getSize: () => ({ width: 100, height: 100 }) };
  const token = { document: doc, destroyed: false, effects: { zIndex: 1 }, addChild(c) { c.parent = this; return c; } };
  doc.object = token;
  F.piles.add(doc);
  F.canvas.tokens.placeables = [token];
  corpses.paintEye(token);
  await flush();
  assert.deepEqual(asked, [SRC], "one load, from the module's path, never a world's assets/ folder");
  assert.equal(token.pdLootEye?.visible, true, "the eye paints from the shipped texture");
});

test("dropbin-EXT-8: the module ships icon-eye.webp (a WebP image)", () => {
  const file = fileURLToPath(new URL("../assets/icon-eye.webp", import.meta.url));
  assert.ok(existsSync(file), "assets/icon-eye.webp is inside the module");
  const head = readFileSync(file).subarray(0, 12).toString("latin1");
  assert.ok(head.startsWith("RIFF") && head.endsWith("WEBP"), "a WebP file");
});
