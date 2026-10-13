/**
 * EXT-12 (final review 2026-10-12, prompts-adapters, [declared]): crops-adapter re-derived token
 * footprints as `width × grid` and the token image by hand, so on a hex grid its boxes disagreed
 * with the scene model's (which asks core's Token#getSize). scene-adapter now exports
 * `footprintRect`, `tokenImg` and `EYE`; crops boxes the same rect the gather measures, for prompt
 * and built tokens alike, and a note with no icon is drawn with the same eye.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, addScene, captureConsole } from "./fixtures/world.mjs";

const F = await installWorld();
const S = await import("../scene-adapter.mjs");
const { renderCrops } = await import("../crops-adapter.mjs");

const ops = [];
const fetched = [];
globalThis.OffscreenCanvas = class {
  constructor(w, h) { ops.push(["canvas", w, h]); }
  getContext() {
    const rec = name => (...a) => ops.push([name, ...a.map(v => (typeof v === "number" ? Math.round(v * 100) / 100 : v?.tag ?? v))]);
    const ctx = { measureText: t => ({ width: String(t).length * 7 }) };
    for (const m of ["fillRect", "drawImage", "beginPath", "moveTo", "lineTo", "setLineDash", "stroke", "strokeRect", "fillText", "closePath", "fill"]) ctx[m] = rec(m);
    return ctx;
  }
  async convertToBlob() { return { type: "image/webp", arrayBuffer: async () => new Uint8Array([1]).buffer }; }
};
globalThis.createImageBitmap = async blob => ({ tag: `bitmap(${blob.src})`, width: 2000, height: 1000 });
globalThis.fetch = async url => { fetched.push(url); return { ok: true, blob: async () => ({ src: url }) }; };

// a hex grid: core's real footprint of a 1×1 token is 87 × 100, not 100 × 100
const hexTok = (id, extra = {}) => ({ id, documentName: "Token", flags: {}, actorId: null, name: id, x: 400, y: 300, width: 1, height: 1,
  elevation: 0, texture: { src: `art/${id}.webp` }, getSize: () => ({ width: 87, height: 100 }), ...extra });

test("EXT-12: scene-adapter exports footprintRect, tokenImg and EYE", () => {
  assert.equal(typeof S.footprintRect, "function", "EXT-12: footprintRect is exported");
  assert.equal(typeof S.tokenImg, "function", "EXT-12: tokenImg is exported");
  assert.equal(S.EYE, "assets/tokens/custom/props/icon-eye.webp");
  assert.deepEqual(S.footprintRect(hexTok("a"), 100), { x: 400, y: 300, w: 87, h: 100 });
  assert.deepEqual(S.footprintRect({ x: 1, y: 2, width: 2, height: 3 }, 100), { x: 1, y: 2, w: 200, h: 300 });
  assert.equal(S.tokenImg({ ring: { enabled: true, subject: { texture: "ring.webp" } }, texture: { src: "t.webp" } }), "ring.webp");
  assert.equal(S.tokenImg({}), "");
});

test("EXT-12: on a hex grid the crop boxes each token's real footprint, the rect the gather measures", async () => {
  const s = addScene(F, { id: "sHex", name: "ZZ Hex", tokens: [], background: { src: "bg/hex.webp" },
    notes: [{ id: "noteHex000000001", x: 700, y: 350, text: "N", texture: { src: "" } }] });
  s.tokens.set("hp", hexTok("hp"));
  s.tokens.set("hb", hexTok("hb", { x: 600, ring: { enabled: true, subject: { texture: "art/ring.webp" } } }));
  const manifest = {
    scenes: { s1: "sHex" },
    encounters: { E1: { sceneId: "sHex", rect: { x: 400, y: 300, w: 300, h: 100 }, members: ["p1", "t1"] } },
    prompts: { p1: { sceneId: "sHex", markerId: "hp", x: 0, y: 0, w: 100, h: 100 } },
    built: { t1: { sceneId: "sHex", docName: "Token", id: "hb" }, t2: { sceneId: "sHex", docName: "Note", id: "noteHex000000001" } }
  };
  const gathered = Object.fromEntries(S.sceneItems(s).filter(i => i.docName === "Token").map(i => [i.id, i.rect]));
  ops.length = 0;
  fetched.length = 0;
  const { value } = await captureConsole(() => renderCrops(manifest, ["E1"]));
  assert.equal(value[0].error, undefined);
  // the crop is 900 × 800 px (the box plus 15 ft, at least 8 squares) drawn 768 px wide
  const k = 768 / 900;
  const boxes = ops.filter(o => o[0] === "strokeRect").map(o => o.slice(3));
  const want = r => [Math.round(r.w * k * 100) / 100, Math.round(r.h * k * 100) / 100];
  assert.deepEqual(boxes.slice(0, 2), [want(gathered.hp), want(gathered.hb)], "EXT-12: crop boxes match the gather's getSize rect");
  assert.deepEqual(boxes.slice(0, 2), [[74.24, 85.33], [74.24, 85.33]]);
  assert.ok(ops.some(o => o[0] === "drawImage" && o[1] === "bitmap(/art/ring.webp)" && o[4] === 74.24 && o[5] === 85.33), "EXT-12: built art drawn over the real footprint");
  assert.ok(fetched.includes(`/${S.EYE}`), "EXT-12: a note with no icon is drawn with the scene model's eye");
  F.game.scenes.delete("sHex");
});
