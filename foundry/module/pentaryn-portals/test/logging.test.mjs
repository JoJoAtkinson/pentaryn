// S4 (finding -27's C24 part): no silent catch. A broken card image warns once per path; the Item
// Piles probe and the other expected failures log at debug only (CONFIG.debug["pentaryn-portals"]);
// a party confirm that fails to render warns and still reads as Cancel.
import { test } from "node:test";
import assert from "node:assert/strict";
import { boot, console$, MODULE } from "./fixtures/world.mjs";

const { F, S, W } = await boot();
await W.tick();

const since = n => console$.slice(n).map(([level, text]) => [level, text]);

test("a card image that fails to load warns 'card image <path>' once; the badge still draws", async () => {
  const s = W.scene({ id: "LogScene", name: "Log", regions: [{ id: "LogFrom", name: "From", bounds: { x: 100, y: 200, width: 100, height: 100 }, behaviors: [{ id: "LogBhv", destinations: ["Scene.LogDest.Region.LogTo"] }] }] });
  W.scene({ id: "LogDest", name: "Dest", regions: [{ id: "LogTo", name: "To", flags: { [MODULE]: { img: "bad.webp" } } }] });
  W.textures["bad.webp"] = "reject";
  F.canvas.ready = true;
  F.canvas.scene = s;
  const n = console$.length;
  await S.drawBadges();
  await S.drawBadges();
  assert.deepEqual(since(n), [["warn", "pentaryn-portals | card image bad.webp"]]);
  assert.ok(console$.at(-1)[2] instanceof Error);
  assert.equal(S.badges.length, 1);
  F.canvas.ready = false;
});

test("a throwing isValidItemPile → pile false, silent unless debug is on, then one debug line", t => {
  W.actor({ id: "LOGPILE", name: "Loot" });
  const s = W.scene({ id: "PileScene", name: "Piles", tokens: [{ id: "tPileLog", name: "Loot", actorId: "LOGPILE" }] });
  const debug = t.mock.method(console, "debug", () => {});
  game.itempiles = { API: { isValidItemPile: () => { throw new Error("not ready"); } } };
  const n = console$.length;
  assert.equal(S.recordOf(s.tokens.get("tPileLog")).pile, false);
  assert.equal(debug.mock.callCount(), 0);
  CONFIG.debug[MODULE] = true;
  assert.equal(S.recordOf(s.tokens.get("tPileLog")).pile, false);
  CONFIG.debug[MODULE] = false;
  delete game.itempiles;
  assert.deepEqual(debug.mock.calls.map(c => c.arguments[0]), ["pentaryn-portals | item piles check"]);
  assert.deepEqual(since(n), []);
});

test("a party confirm dialog that fails warns 'party confirm failed' and resolves false (Cancel)", async () => {
  W.confirm = "reject";
  const n = console$.length;
  assert.equal(await S.confirmParty([{ id: "x", name: "X", type: "character", linked: true, owners: [] }], "Pit"), false);
  W.confirm = true;
  assert.deepEqual(since(n), [["warn", "pentaryn-portals | party confirm failed"]]);
});

test("a badge layer that fails to destroy logs at debug only", async t => {
  const debug = t.mock.method(console, "debug", () => {});
  CONFIG.debug[MODULE] = true;
  F.canvas.ready = true;
  F.canvas.scene = W.scene({ id: "LayerScene", name: "Layer" });
  await S.drawBadges();
  PIXI.throwOnDestroy = true;
  const n = console$.length;
  try { await S.drawBadges(); } finally { PIXI.throwOnDestroy = false; CONFIG.debug[MODULE] = false; F.canvas.ready = false; }
  assert.deepEqual(since(n), []);
  assert.deepEqual(debug.mock.calls.map(c => c.arguments[0]), ["pentaryn-portals | badge layer destroy"]);
});

/* ── finding -27, the rest: guarded UI listeners, the snapshot folder ─── */

test("a Portal card write that fails logs 'pentaryn-portals | card switch' at error (not an unattributed rejection)", async () => {
  const { places } = await import("./fixtures/places.mjs");
  const P = places(W, "G");
  const app = await S.PortalCard.open(P.fork, { edit: true });
  const el = app.element.querySelector('[data-set="name"]');
  P.fork.update = async () => { throw new Error("server said no"); };
  el.value = "North";
  const n = console$.length;
  const out = el.listeners.find(l => l.type === "change").fn();
  await assert.rejects(out, /server said no/, "pass-through: the listener's own promise still rejects");
  await W.flush();
  assert.deepEqual(since(n), [["error", "pentaryn-portals | card switch"]]);
  await app.close();
});

test("the snapshot folder: an existing one is silent; any other createDirectory failure warns 'create dir' and the upload goes on", async t => {
  const { places } = await import("./fixtures/places.mjs");
  const P = places(W, "C");
  t.mock.method(Date, "now", () => 1700000000000);
  W.images["maps/pit.webp"] = { naturalWidth: 4000, naturalHeight: 2000 };
  const FP = foundry.applications.apps.FilePicker.implementation;
  const create = t.mock.method(FP, "createDirectory", async () => { throw new Error("EACCES: permission denied"); });
  const n = console$.length;
  assert.equal(typeof (await S.snapshot(P.pitGate)), "string");
  assert.deepEqual(since(n), [["warn", "pentaryn-portals | create dir"]]);
  create.mock.mockImplementation(async () => { throw new Error("EEXIST: directory exists"); });
  const m = console$.length;
  await S.snapshot(P.pitGate);
  assert.deepEqual(since(m), []);
});
