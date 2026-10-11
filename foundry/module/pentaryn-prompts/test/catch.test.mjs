/**
 * No comment-only catch (guide step 7, C24, prompts-lookup-17, [declared] DP9 — console only):
 * a core token API that throws falls back as before and warns once per page; an absent one stays
 * silent; the swallowed failures print debug lines only behind CONFIG.debug["pentaryn-prompts"].
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, addScene, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
const M = await import("../model.mjs");
const G = await import("../gather.mjs");

function debugLines(fn) {
  const saved = console.debug;
  const out = [];
  console.debug = (...a) => out.push(a.map(x => (x instanceof Error ? `Error(${x.message})` : String(x))).join(" "));
  return Promise.resolve().then(fn).finally(() => { console.debug = saved; }).then(() => out);
}

test("DP9: a throwing Token#getSize falls back and warns once; an absent method is silent", async () => {
  const tok = { id: "geo", documentName: "Token", flags: {}, actorId: null, name: "g", x: 0, y: 0, width: 1, height: 1, elevation: 0,
    getSize() { throw new Error("drift"); } };
  const s = addScene(F, { id: "sGeo", name: "Geo", tokens: [] });
  s.tokens.set("geo", tok);
  const { value, out } = await captureConsole(() => [M.sceneItems(s), M.sceneItems(s)]);
  assert.deepEqual(value[0][0].rect, { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(out, [{ level: "warn", text: "pentaryn-prompts | Token#getSize: core API failed, using the fallback Error(drift)" }]);
  delete tok.getSize;
  const again = await captureConsole(() => M.sceneItems(s));
  assert.deepEqual(again.out, []);
  F.game.scenes.delete("sGeo");
});

test("debug lines only with CONFIG.debug on: show()'s failed ping", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const ping = F.canvas.ping;
  F.canvas.ping = () => { throw new Error("no ping"); };
  try {
    const off = await debugLines(() => G.show({ sceneId: "s1", markerId: "m1" }));
    assert.deepEqual(off, []);
    F.CONFIG.debug[MODULE] = true;
    const on = await debugLines(() => G.show({ sceneId: "s1", markerId: "m1" }));
    assert.deepEqual(on, ["pentaryn-prompts | show: ping (a nicety) Error(no ping)"]);
  } finally {
    delete F.CONFIG.debug[MODULE];
    F.canvas.ping = ping;
  }
});
