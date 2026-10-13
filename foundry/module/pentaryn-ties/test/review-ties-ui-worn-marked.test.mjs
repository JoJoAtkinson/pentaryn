/**
 * Final code review (ties-ui-perf-10): the worn painter read every placeable's flags on every GM
 * frame, and every token's every animation step (refreshToken) asked for that frame — marked or not.
 * Ruling [declared]: worn keeps the ids of the marked tokens, rebuilt on canvasReady and kept by
 * createToken, deleteToken and updateToken (flag writes); refreshToken asks for a frame only when the
 * refreshed token is in that set. The new createToken hook changes golden/hooks-after-init.json.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld, makePlaceable } from "./fixtures/world.mjs";

const MARKED = "zzTokWorn0000001";
const PLAIN = "zzTokPlain000001";
const F = await bootWorld({
  actors: [{ id: "zzNpc00000000001", name: "ZZ Harl" }],
  tokens: [
    { id: MARKED, actorId: "zzNpc00000000001", x: 0, y: 0, flags: { "pentaryn-ties": { worn: { by: "Oz", note: "" } } } },
    { id: PLAIN, actorId: "zzNpc00000000001", x: 200, y: 0 },
  ],
});
const Worn = await import("../worn.mjs");

/** Fire a hook from a quiet frame queue and count what it asked for. */
const framesFrom = (hook, ...args) => {
  F.flushFrames();
  F.frames.length = 0;
  F.fire(hook, ...args);
  const n = F.frames.length;
  F.flushFrames();
  return n;
};

F.fire("canvasReady", canvas);
F.flushFrames();

test("ties-ui-perf-10: refreshToken on an unmarked token asks for no badge frame; on a marked one, it does", () => {
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(PLAIN)), 0, "an unmarked token's animation step paints nothing");
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(MARKED)), 1, "a marked token's badge rides it");
});

test("ties-ui-perf-10: a flag write moves a token in and out of the set", async () => {
  const doc = canvas.tokens.get(PLAIN).document;
  F.flushFrames();
  F.frames.length = 0;
  await Worn.setWorn(doc, { by: "Vesh", note: "" });
  assert.equal(F.frames.length, 1, "the mark itself repaints");
  F.flushFrames();
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(PLAIN)), 1, "now marked: its steps repaint");

  await Worn.clearWorn(doc);
  F.flushFrames();
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(PLAIN)), 0, "cleared: back to nothing");
});

test("ties-ui-perf-10: a token created already marked (a paste of a marked token) joins the set", () => {
  const p = makePlaceable(F, { id: "zzTokPaste000001", actorId: "zzNpc00000000001", x: 400, y: 0, scene: canvas.scene, flags: { "pentaryn-ties": { worn: { by: "Oz", note: "" } } } });
  canvas.tokens.placeables.push(p);
  canvas.scene.tokens.set(p.id, p.document);
  assert.equal(framesFrom("createToken", p.document, {}, game.user.id), 1, "a marked arrival paints its badge");
  assert.equal(framesFrom("refreshToken", p), 1, "and its animation steps keep it riding");

  const q = makePlaceable(F, { id: "zzTokPaste000002", actorId: "zzNpc00000000001", x: 600, y: 0, scene: canvas.scene });
  canvas.tokens.placeables.push(q);
  canvas.scene.tokens.set(q.id, q.document);
  assert.equal(framesFrom("createToken", q.document, {}, game.user.id), 0, "an unmarked arrival paints nothing");
  assert.equal(framesFrom("refreshToken", q), 0);
});

test("ties-ui-perf-10: a deleted marked token leaves the set (its badge goes with the repaint)", () => {
  const p = canvas.tokens.get("zzTokPaste000001");
  canvas.tokens.placeables.splice(canvas.tokens.placeables.indexOf(p), 1);
  canvas.scene.tokens.delete(p.id);
  assert.equal(framesFrom("deleteToken", p.document, {}, game.user.id), 1);
  assert.equal(framesFrom("refreshToken", p), 0, "a stray step from the gone token paints nothing");
});

test("ties-ui-perf-10: canvasReady rebuilds the set from the scene's tokens", () => {
  const doc = canvas.tokens.get(PLAIN).document;
  // a mark that arrived without a hook this client saw (e.g. while on another scene)
  doc.flags["pentaryn-ties"] = { worn: { by: "Kest", note: "" } };
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(PLAIN)), 0, "not yet known");
  framesFrom("canvasReady", canvas);
  assert.equal(framesFrom("refreshToken", canvas.tokens.get(PLAIN)), 1, "known after the canvas is ready");
  delete doc.flags["pentaryn-ties"];
  framesFrom("canvasReady", canvas);
});

test("ties-ui-perf-10: a player keeps no set and schedules nothing", () => {
  const gm = game.user;
  const player = { id: "zzPlayerUser0001", isGM: false };
  game.user = player;
  try {
    assert.equal(framesFrom("canvasReady", canvas), 0);
    assert.equal(framesFrom("refreshToken", canvas.tokens.get(MARKED)), 0);
  } finally {
    game.user = gm;
  }
});
