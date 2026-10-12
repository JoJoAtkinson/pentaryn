/**
 * No comment-only catch (guide step 7, C24, prompts-lookup-17, [declared] DP9 — console only):
 * a core token API that throws falls back as before and warns once per page; an absent one stays
 * silent; the swallowed failures print debug lines only behind CONFIG.debug["pentaryn-prompts"].
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installWorld, captureConsole, addScene, MODULE } from "./fixtures/world.mjs";

const F = await installWorld();
const M = await import("../scene-adapter.mjs");
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

test("DP9: an @Embed that fails to resolve prints a debug line only with debug on", async () => {
  const prev = globalThis.fromUuid;
  globalThis.fromUuid = async uuid => {
    if (uuid.startsWith("Compendium.x.y.JournalEntry.zz")) throw new Error("gone");
    return prev(uuid);
  };
  try {
    let html;
    const off = await debugLines(async () => { html = await M.resolveEmbeds("@Embed[Compendium.x.y.JournalEntry.zz1]"); });
    assert.deepEqual(off, []);
    assert.equal(html, "");
    F.CONFIG.debug[MODULE] = true;
    const on = await debugLines(async () => { html = await M.resolveEmbeds("@Embed[Compendium.x.y.JournalEntry.zz2]"); });
    assert.deepEqual(on, ["pentaryn-prompts | @Embed Compendium.x.y.JournalEntry.zz2 not resolved (shown blank) Error(gone)"]);
    assert.equal(html, "");
  } finally {
    delete F.CONFIG.debug[MODULE];
    globalThis.fromUuid = prev;
  }
});

test("DP9: a hex grid whose getOffset throws keeps the item's squares and prints a debug line only with debug on", async () => {
  const grid = { distance: 5, size: 100, isHexagonal: true, isGridless: false,
    getOffset() { throw new Error("no offset"); }, offsetToCube: o => ({ q: o.i, r: o.j }) };
  const s = addScene(F, { id: "sHexDbg", name: "HexDbg", grid, notes: [{ id: "n1", x: 150, y: 150, text: "a note" }] });
  try {
    let items;
    const off = await debugLines(() => { items = M.sceneItems(s); });
    assert.deepEqual(off, []);
    const before = items.map(it => it.squares);
    F.CONFIG.debug[MODULE] = true;
    const on = await debugLines(() => { items = M.sceneItems(s); });
    assert.ok(on.length >= 1);
    assert.ok(on.every(l => l === "pentaryn-prompts | hex offset of an item centre (using its squares) Error(no offset)"), on.join("\n"));
    assert.deepEqual(items.map(it => it.squares), before);
  } finally {
    delete F.CONFIG.debug[MODULE];
    F.game.scenes.delete("sHexDbg");
  }
});
