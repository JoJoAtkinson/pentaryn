/**
 * Characterisation (prompts checkpoint, wave 3; guide step 3): gather.mjs and crops.mjs against the
 * stub world — scene order and lookup, paging by prompt count, the manifest ring, party and crops
 * options, the console summary line (prompts-lookup-18), crops as base64 or uploaded files, the
 * crop drawing on a recording OffscreenCanvas, the image URL rule (prompts-lookup-15, with its
 * KNOWN `data:` row), list / locate / show / docCentre. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, addScene, captureConsole, MODULE } from "./fixtures/world.mjs";
import { CURRENT_SCENE } from "../geometry-core.mjs";

const NOW = 1760000000000;
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const G = await import("../gather.mjs");
const { renderCrops } = await import("../crops-adapter.mjs");

/* ── a recording canvas, image loading and the file picker ─────────────── */

const ops = [];
const fetched = [];
let failCanvas = false;
class OffscreenCanvas {
  constructor(w, h) { ops.push(["canvas", w, h]); this.w = w; this.h = h; }
  getContext() {
    if (failCanvas) throw new Error("no 2d context");
    const rec = name => (...a) => ops.push([name, ...a.map(v => (typeof v === "number" ? Math.round(v * 100) / 100 : v?.tag ?? v))]);
    const ctx = { measureText: t => ({ width: String(t).length * 7 }) };
    for (const m of ["fillRect", "drawImage", "beginPath", "moveTo", "lineTo", "setLineDash", "stroke", "strokeRect", "fillText", "closePath", "fill"]) ctx[m] = rec(m);
    return new Proxy(ctx, { set: (o, k, v) => (ops.push([`${String(k)}=`, v]), (o[k] = v), true) });
  }
  async convertToBlob(opts) { ops.push(["convertToBlob", opts]); return { type: "image/webp", arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }; }
}
globalThis.OffscreenCanvas = OffscreenCanvas;
globalThis.createImageBitmap = async blob => ({ tag: `bitmap(${blob.src})`, width: 2000, height: 1000 });
globalThis.fetch = async url => { fetched.push(url); return { ok: !url.includes("missing"), blob: async () => ({ src: url }) }; };
const uploads = [];
const made = new Set();
F.foundry.applications.apps = { FilePicker: { implementation: {
  createDirectory: async (src, dir) => { if (made.has(dir)) throw new Error("exists"); made.add(dir); uploads.push(["mkdir", src, dir]); },
  upload: async (src, dir, file, body, opts) => {
    if (file.name.startsWith("E9")) throw new Error("disk full");
    uploads.push(["upload", src, dir, file.name, file.type, file.size, opts]);
    return { path: `${dir}/${file.name}` };
  }
} } };

/* ── s3: an encounter with art (the URL table), on a scene with a background ─ */

const art = ["maps/a.webp", "/maps/b.webp", "https://x/y.png", "data:x", "v.webm", "maps/a.webp", "maps/missing.webp"];
const s3 = addScene(F, {
  id: "s3", name: "ZZ Crops", navigation: true, navOrder: 3, background: { src: "bg/room.webp" }, backgroundColor: { css: "#123456" },
  tokens: [
    { id: "q1", name: "Prompt · mid", actorId: "markerActormid00", x: 300, y: 300, texture: { src: "modules/pentaryn-prompts/assets/marker-mid.webp" }, flags: { [MODULE]: { marker: "mid", prompt: "bandit" } } },
    { id: "q2", name: "Prompt · mid", actorId: "markerActormid00", x: 500, y: 300, texture: { src: "modules/pentaryn-prompts/assets/marker-mid.webp" }, flags: { [MODULE]: { marker: "mid", prompt: "bandit chief" } } },
    ...art.map((src, i) => ({ id: `art${i}`, name: `Art ${i}`, actorId: "actorGuard000001", x: 300 + 100 * i, y: 500, disposition: 0, texture: { src } }))
  ],
  walls: [
    { id: "w1", c: [200, 200, 900, 200], sight: 20, dir: 0, door: 0, ds: 0 },
    { id: "w2", c: [200, 200, 200, 700], sight: 0, dir: 0, door: 0, ds: 0 },
    { id: "d1", c: [900, 200, 900, 300], sight: 20, dir: 0, door: 1, ds: 1 },
    { id: "d2", c: [900, 300, 900, 400], sight: 20, dir: 0, door: 2, ds: 0 },
    { id: "d3", c: [900, 400, 900, 500], sight: 20, dir: 0, door: 1, ds: 0 },
    { id: "far", c: [1900, 900, 1950, 950], sight: 20, dir: 0, door: 0, ds: 0 }
  ],
  notes: [{ id: "noteCrop00000001", x: 700, y: 350, text: "N", texture: { src: "icons/note.webp" }, flags: { [MODULE]: { provenance: { markerId: "x", call: "c" } } } }],
  tiles: [{ id: "tileCrop00000001", x: 600, y: 600, width: 100, height: 100, texture: { src: "maps/a.webp" }, flags: { [MODULE]: { provenance: { markerId: "y", call: "c" } } } }]
});
s3.dimensions.sceneWidth = 2000;
s3.dimensions.sceneHeight = 1000;

const g = opts => captureConsole(() => G.gather(opts));

test("scenesInNavOrder: navigation first, then navOrder, name, id; resolveScene by id, uuid, name (exact, any case), nav name", () => {
  assert.deepEqual(G.scenesInNavOrder().map(s => s.id), ["s1", "s3"]);
  for (const ref of ["s1", "Scene.s1", "ZZ Characterisation", "zz characterisation", "char", F.s1]) assert.equal(G.resolveScene(ref)?.id, "s1", String(ref));
  assert.equal(G.resolveScene("nope"), null);
  assert.equal(G.resolveScene(""), null);
});

test("gather: the console summary line (prompts-lookup-18) and the result's shape", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { value, out } = await g({ scenes: ["s1"], crops: "off" });
  assert.deepEqual(out.map(o => o.text.replace(/\d+ ms$/, "<ms> ms")), [`pentaryn-prompts | gather ${value.call}: 2 prompts on 1 scene(s), 0 crop(s), <ms> ms`]);
  assert.deepEqual(Object.keys(value), ["call", "text", "counts", "manifest", "crops", "next", "ms", "version", "party", "partySource", "cropsNote"]);
  assert.deepEqual([value.cropsNote, value.party, value.partySource, value.next, value.version], ["crops: off", null, null, null, "0.4.5"]);
  assert.deepEqual(value.manifest.opts, { scenes: ["s1"], unseenWithinFt: 60, chars: 400, party: null });
  assert.equal(value.manifest.at, NOW);
});

test("gather: party from the call or the world setting; 'current' is the viewed scene; unknown scenes refuse", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const a = (await g({ scenes: "current", crops: "off", party: "4x5" })).value;
  assert.deepEqual([a.partySource, a.manifest.opts.scenes, a.counts.scenes], ["call", "current", 1]);
  assert.deepEqual(a.party, a.manifest.opts.party);
  await F.game.settings.set(MODULE, "party", "3x2");
  const b = (await g({ scenes: [CURRENT_SCENE], crops: "off" })).value;
  assert.equal(b.partySource, "setting");
  await F.game.settings.set(MODULE, "party", "");
  await assert.rejects(G.gather({ scenes: ["nope"] }), { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: nope" });
  F.canvas.scene = null;
  await assert.rejects(G.gather({ scenes: "current" }), { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: no scene is being viewed" });
  F.canvas.scene = F.s1;
});

test("gather: paging by prompt count — at least one scene, next names the first left out; from resumes; a foreign from refuses", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const first = (await g({ crops: "off", maxPrompts: 1 })).value;
  assert.deepEqual([first.counts.scenes, first.next, first.manifest.opts.scenes], [1, "s3", "all"]);
  const rest = (await g({ crops: "off", maxPrompts: 1, from: first.next })).value;
  assert.deepEqual([rest.counts.scenes, rest.next], [1, null]);
  const both = (await g({ crops: "off" })).value;
  assert.deepEqual([both.counts.scenes, both.counts.prompts, both.next], [2, 4, null]);
  await assert.rejects(G.gather({ crops: "off", from: "nope" }), { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: next scene nope is not in this gather" });
  // duplicates and Scene documents: one model each, ids in the stored opts
  const dup = (await g({ scenes: [F.s1, "s1", "Scene.s1"], crops: "off" })).value;
  assert.deepEqual([dup.counts.scenes, dup.manifest.opts.scenes], [1, ["s1"]]);
});

test("the manifest ring: newest first, five kept, a repeated call replaces its entry; manifestFor; a player's gather stores nothing", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  await F.game.settings.set(MODULE, "lastCalls", []);
  const calls = [];
  for (const [i, ref] of [["s1"], ["s3"], [F.s1, "s3"], ["s1"]].entries()) calls.push((await g({ scenes: ref, crops: "off", unseenWithinFt: 10 * (i + 1) })).value.call);
  const ring = G.manifests();
  assert.deepEqual(ring.map(m => m.call), [calls[3], calls[2], calls[1]].filter((c, i, a) => a.indexOf(c) === i));
  assert.equal(G.manifestFor(calls[1]).call, calls[1]);
  assert.equal(G.manifestFor("pm-none"), null);
  await F.game.settings.set(MODULE, "lastCalls", [1, 2, 3, 4, 5, 6].map(n => ({ call: `pm-${n}` })));
  await g({ scenes: ["s1"], crops: "off" });
  assert.equal(G.manifests().length, 5);
  await F.game.settings.set(MODULE, "lastCalls", "garbage");
  assert.deepEqual(G.manifests(), []);
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  await g({ scenes: ["s1"], crops: "off" });
  F.game.user = gm;
  assert.deepEqual(F.game.settings.get(MODULE, "lastCalls"), "garbage");
  await F.game.settings.set(MODULE, "lastCalls", []);
});

test("crops 'auto': one scene with art crops, none without; multi-scene off; the decision note", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const noArt = (await g({ scenes: ["s1"], crops: "auto" })).value;
  assert.deepEqual([noArt.cropsNote, noArt.crops], ["crops: skipped — the scene has no background image or tiles, a crop would be blank", []]);
  const multi = (await g({ scenes: ["s1", "s3"] })).value;
  assert.equal(multi.cropsNote, "crops: off for a multi-scene gather (crops: true to render)");
});

test("crops as base64 (the query path): the drawing on the canvas and the image row (goldens crop-ops, crop-row)", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  ops.length = 0;
  fetched.length = 0;
  const { value } = await g({ scenes: ["s3"], crops: "on", cropsAs: "base64" });
  assert.equal(value.crops.length, 1);
  pinJSON("crop-row", value.crops, import.meta.url);
  pinJSON("crop-ops", ops, import.meta.url);
  // prompts-lookup-15: relative paths get a leading slash, absolute and http(s) are kept, videos never fetched,
  // each src fetched once; [declared] DP7: a data: URI is fetched as it is (was "/data:x")
  assert.deepEqual(fetched, ["/bg/room.webp", "/maps/a.webp", "/maps/b.webp", "https://x/y.png", "data:x", "/maps/missing.webp", "/icons/note.webp"]);
});

test("crops as files (the eval-js path): uploaded under pentaryn-prompts-crops/<call>/, png dropped, path and dataPath", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { value } = await g({ scenes: ["s3"], crops: "on" });
  assert.deepEqual(value.crops, [{ encounter: "E1", scene: "s1", mime: "image/webp", mimeType: "image/webp", squares: value.crops[0].squares,
    path: `pentaryn-prompts-crops/${value.call}/E1.webp`, dataPath: `pentaryn-prompts-crops/${value.call}/E1.webp` }]);
  assert.deepEqual(uploads.slice(-3), [["mkdir", "data", "pentaryn-prompts-crops"], ["mkdir", "data", `pentaryn-prompts-crops/${value.call}`],
    ["upload", "data", `pentaryn-prompts-crops/${value.call}`, "E1.webp", "image/webp", 3, { notify: false }]]);
  assert.equal(G.CROP_DIR, "pentaryn-prompts-crops");
});

test("crops(): a stored call's encounters (files by default, base64 on request); CALL_UNKNOWN; BAD_SPEC for no such encounter", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { value: gathered } = await g({ scenes: ["s3"], crops: "off" });
  const files = await captureConsole(() => G.crops({ call: gathered.call }));
  assert.equal(files.value.crops[0].path, `pentaryn-prompts-crops/${gathered.call}/E1.webp`);
  const b64 = await captureConsole(() => G.crops({ call: gathered.call, encounters: ["E1", "E7"], cropsAs: "base64" }));
  assert.deepEqual(b64.value.crops.map(c => [c.encounter, c.png]), [["E1", "AQID"]]);
  await assert.rejects(G.crops({ call: "pm-none" }), { code: "CALL_UNKNOWN", message: "CALL_UNKNOWN: pm-none" });
  await assert.rejects(G.crops({ call: gathered.call, encounters: ["E7"] }), { code: "BAD_SPEC", message: "BAD_SPEC: no such encounter in this call" });
  await assert.rejects(G.crops(), { code: "CALL_UNKNOWN", message: "CALL_UNKNOWN: undefined" });
});

test("renderCrops: a gone scene and a failing canvas come back as error rows; an upload failure keeps the row with its error", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { value: gathered } = await g({ scenes: ["s3"], crops: "off" });
  const m = structuredClone(gathered.manifest);
  m.encounters.E9 = { ...m.encounters.E1, sceneId: "gone" };
  failCanvas = true;
  const { value, out } = await captureConsole(() => renderCrops(m, ["E1", "E9"]));
  failCanvas = false;
  assert.deepEqual(value, [{ encounter: "E1", scene: "s1", error: "no 2d context" }, { encounter: "E9", scene: null, error: "SCENE_UNKNOWN" }]);
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | crop E1 failed Error(no 2d context)"]);
  m.encounters.E9 = m.encounters.E1;
  const up = await captureConsole(() => G.crops({ call: gathered.call }));
  assert.ok(up.value.crops[0].path);
  await F.game.settings.set(MODULE, "lastCalls", [m]);
  const bad = await captureConsole(() => G.crops({ call: m.call, encounters: ["E9"] }));
  assert.deepEqual(bad.value.crops, [{ encounter: "E9", scene: "s1", mime: "image/webp", mimeType: "image/webp", squares: bad.value.crops[0].squares, error: "crop upload failed: disk full" }]);
});

test("list(): scenes with markers in nav order, with their empty count", async () => {
  F.s1.tokens.get("m2").flags[MODULE].prompt = "";
  assert.deepEqual(G.list(), { scenes: [
    { id: "s1", name: "ZZ Characterisation", nav: "Char", prompts: 2, empty: 1 },
    { id: "s3", name: "ZZ Crops", nav: "", prompts: 2, empty: 0 }] });
  F.s1.tokens.get("m2").flags[MODULE].prompt = "goblin boss";
});

test("locate: by call + id (prompt or built) or by sceneId + markerId; every refusal", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const { value: gathered } = await g({ scenes: ["s3"], crops: "off" });
  const m = gathered.manifest;
  const pid = Object.keys(m.prompts)[0];
  const tid = Object.keys(m.built)[0];
  assert.equal(G.locate({ call: m.call, id: pid }).doc.id, m.prompts[pid].markerId);
  assert.equal(G.locate({ call: m.call, id: pid }).entry, m.prompts[pid]);
  assert.equal(G.locate({ call: m.call, id: tid }).doc.id, m.built[tid].id);
  assert.equal(G.locate({ sceneId: "s1", markerId: "m1" }).doc.id, "m1");
  assert.equal(G.locate({ call: "pm-none", id: "p1", sceneId: "s1", markerId: "m1" }).doc.id, "m1");
  const refusals = [
    [{ call: "pm-none", id: "p1" }, "CALL_UNKNOWN: pm-none"],
    [{ call: m.call, id: "p99" }, `BAD_SPEC: p99 is not in ${m.call}`],
    [{ sceneId: "nope", markerId: "m1" }, "SCENE_UNKNOWN: nope"],
    [{ sceneId: "s1", markerId: "nope" }, "MARKER_GONE: nope"],
    [{}, "SCENE_UNKNOWN: undefined"]
  ];
  for (const [args, msg] of refusals) assert.throws(() => G.locate(args), { message: msg });
  const tok = s3.tokens.get(m.prompts[pid].markerId);
  s3.tokens.delete(tok.id);
  assert.throws(() => G.locate({ call: m.call, id: pid }), { code: "MARKER_GONE", message: `MARKER_GONE: ${pid} (${tok.id})` });
  s3.tokens.set(tok.id, tok);
  const saved = F.game.scenes.get("s3");
  F.game.scenes.delete("s3");
  assert.throws(() => G.locate({ call: m.call, id: pid }), { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: s3" });
  F.game.scenes.set("s3", saved);
});

test("show: views the marker's scene first, pans (scale at least 0.8), pings; a throwing ping is ignored", async () => {
  F.canvas.stage.scale.x = 0.5;
  const n0 = F.calls.length;
  F.canvas.ping = () => { throw new Error("no pings"); };
  assert.deepEqual(await G.show({ sceneId: "s3", markerId: "q1" }), { ok: true, sceneId: "s3", x: 350, y: 350 });
  assert.deepEqual(F.calls.slice(n0).filter(c => c.op !== "Hooks.call").map(c => c.op), ["scene.view", "canvas.animatePan"]);
  assert.deepEqual(F.calls.at(-1), { op: "canvas.animatePan", x: 350, y: 350, scale: 0.8, duration: 400 });
  F.canvas.scene = F.s1;
  F.canvas.stage.scale.x = 1;
});

test("docCentre: tokens and tiles from their top-left, everything else at its point", () => {
  assert.deepEqual(G.docCentre({ documentName: "Token", x: 100, y: 100, width: 2, height: 1 }, 100), { x: 200, y: 150 });
  assert.deepEqual(G.docCentre({ documentName: "Tile", x: 100, y: 100, width: 300, height: 100 }, 100), { x: 250, y: 150 });
  assert.deepEqual(G.docCentre({ documentName: "Note", x: 7, y: 9 }, 100), { x: 7, y: 9 });
});

test("gather: a single Scene document is stored as its id", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const v = (await g({ scenes: F.s1, crops: "off" })).value;
  assert.deepEqual(v.manifest.opts.scenes, ["s1"]);
  assert.deepEqual(G.manifests()[0].opts.scenes, ["s1"]);
});
