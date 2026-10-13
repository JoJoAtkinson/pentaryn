/**
 * Final code review (ties-ui-EXT-16): five find-or-create idioms. TiesEditor scanned the instance
 * pool and only fronted, AttributeReview looked itself up by id and re-rendered, LookWindow kept a
 * pair map and maximized, and InspectPreview was not a singleton at all — every flask click on the
 * same token stacked another preview window.
 * Ruling [declared]: one `openOrFront(pool, match, make)` in core/html.mjs (front, maximize and
 * re-render an open window, else build one), used by all four; InspectPreview keeps one window per
 * subject in a Map, like LookWindow's pair map.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const NPC = "zzExt16Npc000001";
const NPC2 = "zzExt16Npc000002";

const F = await bootWorld({ actors: [{ id: NPC, name: "ZZ Ext16 One" }, { id: NPC2, name: "ZZ Ext16 Two" }] });
const html = await import("../core/html.mjs");
const { InspectPreview } = await import("../preview-app.mjs");
const { TiesEditor } = await import("../editor.mjs");
const { AttributeReview } = await import("../review-ui.mjs");

/** A window stub that records what openOrFront did to it. */
const stub = (tag, { minimized = false } = {}) => {
  const did = [];
  return {
    tag, did, minimized,
    maximize() { did.push("maximize"); this.minimized = false; },
    render(opts) { did.push(["render", opts]); return Promise.resolve(this); },
    bringToFront() { did.push("front"); },
  };
};

test("ties-ui-EXT-16: core/html.mjs has one openOrFront(pool, match, make)", () => {
  assert.equal(typeof html.openOrFront, "function");
});

test("ties-ui-EXT-16 openOrFront: an open match is maximized, re-rendered and fronted; nothing is made", () => {
  const a = stub("a");
  const b = stub("b", { minimized: true });
  let made = 0;
  const out = html.openOrFront([a, b], w => w.tag === "b", () => { made++; return stub("new"); });
  assert.equal(out, b);
  assert.equal(made, 0);
  assert.deepEqual(b.did, ["maximize", ["render", { force: true }], "front"]);
  assert.deepEqual(a.did, []);
});

test("ties-ui-EXT-16 openOrFront: no match builds one and renders it", () => {
  const fresh = stub("new");
  const out = html.openOrFront(new Map().values(), () => true, () => fresh);
  assert.equal(out, fresh);
  assert.deepEqual(fresh.did, [["render", { force: true }]]);
});

test("ties-ui-EXT-16 openOrFront: a failed render goes to onError, not an unhandled rejection", async () => {
  const seen = [];
  const bad = { render: () => Promise.reject(new Error("zz render")) };
  const out = html.openOrFront([], () => false, () => bad, { onError: err => seen.push(err.message) });
  assert.equal(out, bad);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(seen, ["zz render"]);
});

test("ties-ui-EXT-16 InspectPreview: one window per subject — a second click fronts and re-renders it", async () => {
  const one = game.actors.get(NPC);
  const a = await InspectPreview.open(one);
  const mark = F.calls.length;
  const b = await InspectPreview.open(one);
  assert.ok(a instanceof InspectPreview);
  assert.equal(b, a, "the same subject fronts the open preview");
  assert.deepEqual(
    F.calls.slice(mark).filter(c => c.op === "app.render").map(c => [c.app, c.opts]),
    [["InspectPreview", { force: true }]],
    "and re-renders it"
  );
  const c = await InspectPreview.open(game.actors.get(NPC2));
  assert.notEqual(c, a, "another subject gets its own window");
  a._onClose({});
  const d = await InspectPreview.open(one);
  assert.notEqual(d, a, "a closed preview is forgotten");
  for (const w of [c, d]) w._onClose({});
});

test("ties-ui-EXT-16 TiesEditor and AttributeReview: a second open re-renders and fronts the one window", async () => {
  const ed = await TiesEditor.open(game.actors.get(NPC));
  let mark = F.calls.length;
  assert.equal(await TiesEditor.open(game.actors.get(NPC)), ed);
  assert.deepEqual(F.calls.slice(mark).filter(c => c.op === "app.render").map(c => c.app), ["TiesEditor"]);
  const rv = await AttributeReview.open();
  mark = F.calls.length;
  assert.equal(await AttributeReview.open(), rv);
  assert.deepEqual(F.calls.slice(mark).filter(c => c.op === "app.render").map(c => c.app), ["AttributeReview"]);
  await rv._onClose?.({});
});
