/**
 * The performance findings, each proven neutral on output (or declared where it is not):
 * ties-24 worn badges (badgePlan; players schedule no frame — B7; an unchanged plan is not rebuilt),
 * and the others as they land.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PLAYER = "zzPlayerUser0001";
const F = await bootWorld({
  users: [{ id: PLAYER, name: "ZZ Player", isGM: false }],
  actors: [{ id: "zzNpc00000000001", name: "ZZ Brakka" }],
  tokens: [{ id: "zzTokNpc00000001", actorId: "zzNpc00000000001", x: 200, y: 300 }],
});
const Worn = await import("../worn.mjs");

test("ties-24: badgePlan — the corner, the radius and the initial, from the document's position", () => {
  const p = (id, x, y, by, w = 100) => ({ id, w, document: { id, x, y, getFlag: (s, k) => (k === "worn" && by !== null ? { by, note: "" } : undefined) } });
  assert.deepEqual(Worn.badgePlan([p("a", 200, 300, "ozmandius")], 100), [{ tokenId: "a", x: 200 + 100 - 17.25, y: 300 + 17.25, r: 15, letter: "O" }]);
  assert.equal(Worn.badgePlan([p("b", 0, 0, "   ")], 100).length, 0, "a blank mark is no mark");
  assert.equal(Worn.badgePlan([p("c", 0, 0, null)], 100).length, 0);
  assert.equal(Worn.badgePlan([p("d", 0, 0, "x", 50)], 40)[0].r, 8, "never under 8 px");
  assert.equal(Worn.badgePlan([p("e", 0, 0, "  vesh")], 100)[0].letter, "V");
});

test("ties-24 / B7 [declared]: a player's drawBadges schedules no frame; the GM's schedules one", () => {
  const gm = game.user;
  game.user = game.users.get(PLAYER);
  F.frames.length = 0;
  Worn.drawBadges();
  assert.equal(F.frames.length, 0, "players never paint the badge layer, so never queue it");
  game.user = gm;
  Worn.drawBadges();
  assert.equal(F.frames.length, 1);
  F.flushFrames();
});

test("ties-24 item 3: planKey names every field a badge is drawn from", () => {
  const b = { tokenId: "a", x: 1, y: 2, r: 15, letter: "O" };
  assert.equal(Worn.planKey([]), "");
  assert.equal(Worn.planKey([b]), Worn.planKey([{ ...b }]));
  for (const [k, v] of Object.entries({ tokenId: "b", x: 9, y: 9, r: 8, letter: "V" })) {
    assert.notEqual(Worn.planKey([b]), Worn.planKey([{ ...b, [k]: v }]), `${k} changes the key`);
  }
  assert.notEqual(Worn.planKey([b, { ...b, tokenId: "c" }]), Worn.planKey([b]), "a second badge changes the key");
});

test("ties-24 item 3: an unchanged plan is not rebuilt; a move, a teardown or a failed paint rebuilds", async () => {
  const doc = canvas.tokens.get("zzTokNpc00000001").document;
  const news = () => F.pixi.filter(c => c.call === "new" && c.id.startsWith("Graphics")).length;
  const paint = () => (Worn.drawBadges(), F.flushFrames());
  await Worn.setWorn(doc, { by: "Oz", note: "" });
  F.flushFrames();
  paint();
  const first = news();
  assert.ok(first >= 1, "the marked token gets a disc");
  paint();
  paint();
  assert.equal(news(), first, "same plan, live layer: nothing destroyed or recreated");

  const x = doc.x;
  doc.x = x + 100;
  paint();
  assert.equal(news(), first + 1, "the badge moved, so the layer is redrawn");
  doc.x = x;
  paint();
  assert.equal(news(), first + 2);

  F.fire("canvasTearDown");
  paint();
  assert.equal(news(), first + 3, "a torn-down canvas gets a fresh layer even with the same plan");

  // a throw mid-paint must not record the plan as painted
  const Graphics = PIXI.Graphics;
  const warn = console.warn;
  console.warn = () => {};
  PIXI.Graphics = function () {
    throw new Error("boom");
  };
  doc.x = x + 50;
  paint();
  PIXI.Graphics = Graphics;
  console.warn = warn;
  paint();
  assert.equal(news(), first + 4, "the frame after a failed paint redraws the same plan");
  doc.x = x;
  await Worn.clearWorn(doc);
  F.flushFrames();
});

test("ties-24 item 3: a paint that fails partway forgets the last good plan, so going back to it redraws", async () => {
  const doc = canvas.tokens.get("zzTokNpc00000001").document;
  const news = () => F.pixi.filter(c => c.call === "new" && c.id.startsWith("Graphics")).length;
  const paint = () => (Worn.drawBadges(), F.flushFrames());
  const x = doc.x;
  await Worn.setWorn(doc, { by: "Oz", note: "" });
  F.flushFrames();
  paint();
  const drawn = news(); // the plan at x is painted and remembered

  // the badge moves and that paint throws once the old discs are gone: the layer is half-built
  const Graphics = PIXI.Graphics;
  const warn = console.warn;
  try {
    console.warn = () => {};
    PIXI.Graphics = function () {
      throw new Error("boom");
    };
    doc.x = x + 50;
    paint();
  } finally {
    PIXI.Graphics = Graphics;
    console.warn = warn;
  }
  // the token comes back: the remembered plan matches again, but the layer no longer shows it
  doc.x = x;
  paint();
  assert.equal(news(), drawn + 1, "the old plan is redrawn, not skipped as already painted");
  await Worn.clearWorn(doc);
  F.flushFrames();
});

test("ties-26 / B7 [declared]: one sheet render through the four hooks injects once; a later render runs again", async () => {
  const { el } = await import("./fixtures/dom.mjs");
  const actor = game.actors.get("zzNpc00000000001");
  const reads = [];
  const get = game.settings.get.bind(game.settings);
  game.settings.get = (ns, key) => (reads.push(key), get(ns, key));
  const sheet = () => el("div", { children: [el("header", { className: "window-header" }), el("nav", { className: "tabs", dataset: { group: "primary" } }), el("div", { className: "tab-body" })] });
  const root = sheet();
  const app = { document: actor, tabGroups: { primary: "details" } };
  for (const hook of ["renderNPCActorSheet", "renderActorSheetV2", "renderActorSheet"]) F.fire(hook, app, root);
  const first = reads.filter(k => k === "sheetTab").length;
  await Promise.resolve();
  F.fire("renderActorSheetV2", app, root);
  const second = reads.filter(k => k === "sheetTab").length - first;
  game.settings.get = get;
  assert.equal(first, 1, "the chain's other two hooks returned before reading anything");
  assert.equal(second, 1, "a later render (next microtask) is handled");
  assert.equal(root.querySelectorAll('nav.tabs [data-tab="ties"]').length, 1, "each tab once");
});

test("ties-25: drawWires schedules nothing with no card and no wire layer; one card schedules one frame", async () => {
  const Overlay = await import("../overlay.mjs");
  const Cards = await import("../popups.mjs");
  F.frames.length = 0;
  for (let i = 0; i < 100; i++) Overlay.drawWires();
  assert.equal(Cards.size(), 0);
  assert.equal(F.frames.length, 0);
});

test("ties-19: the clamped registry is memoised on the setting's value; callers get copies; a write re-reads", async () => {
  const A = await import("../attributes.mjs");
  const reg = [{ id: "guild", title: "Guild", category: "guild", lore: [] }, { id: "city", title: "City", lore: [] }];
  // a value object that stays the same between reads, as Foundry's Setting#value does
  const get = game.settings.get.bind(game.settings);
  let value = reg;
  game.settings.get = (ns, key) => (key === "attributes" ? value : get(ns, key));
  try {
    const one = A.registry();
    one.push({ id: "x" });
    one[0].title = "changed";
    assert.equal(A.registry().length, 2, "a push on a returned copy does not leak");
    assert.equal(A.registry()[0].title, "Guild", "nor an edit");
    const e = A.attributeById("guild");
    e.lore.push({ id: "q" });
    assert.equal(A.attributeById("guild").lore.length, 0, "attributeById copies too");
    assert.equal(A.attributeById("nope"), null);
    value = [{ id: "guild", title: "Guild Renamed", lore: [] }];
    assert.equal(A.registry()[0].title, "Guild Renamed", "a new value is re-read");
    assert.equal(A.describeAttribute("guild").title, "Guild Renamed");
  } finally {
    game.settings.get = get;
  }
});

test("ties-19 (W3L): resolve, lookup and list never structuredClone the whole registry", async () => {
  // Live timings (wave-3 §6) showed a full-registry structuredClone per call cost ~0.1 ms — more than
  // the clamp it replaced. resolve only reads ids (resolveAttrRef re-clamps), so it needs no copy;
  // list's copy is a fresh clamp, as it was before the memo; lookup clones one entry at most.
  const A = await import("../attributes.mjs");
  const reg = [{ id: "guild", title: "Guild", lore: [{ id: "a", text: "x" }] }, { id: "city", title: "City", lore: [] }];
  const get = game.settings.get.bind(game.settings);
  game.settings.get = (ns, key) => (key === "attributes" ? reg : get(ns, key));
  const sc = globalThis.structuredClone;
  const whole = [];
  globalThis.structuredClone = v => (Array.isArray(v) && whole.push(v), sc(v));
  try {
    assert.equal(A.resolveAttribute("Guild"), "guild");
    assert.equal(A.describeRef("City").title, "City");
    const list = A.registry();
    assert.equal(whole.length, 0, "no whole-registry structuredClone on resolve / lookup / list");
    list[0].lore.push({ id: "q" });
    list.push({ id: "x" });
    assert.equal(A.registry().length, 2, "list still hands back a copy");
    assert.equal(A.registry()[0].lore.length, 1, "a deep copy");
  } finally {
    globalThis.structuredClone = sc;
    game.settings.get = get;
  }
});

test("ties-22: one Ties-tab paint (build, then bind) scans the world's actors for inbound ties once", async () => {
  const { buildHTML, bind } = await import("../editor.mjs");
  const { el } = await import("./fixtures/dom.mjs");
  const actor = game.actors.get("zzNpc00000000001");
  const coll = game.actors;
  const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(coll), "contents") ?? Object.getOwnPropertyDescriptor(coll, "contents");
  let scans = 0;
  const real = () => (desc.get ? desc.get.call(coll) : desc.value);
  Object.defineProperty(coll, "contents", { get: () => (scans++, real()), configurable: true });
  try {
    const html = buildHTML(actor);
    const root = el("div");
    root.innerHTML = html;
    const before = scans;
    bind(root.firstElementChild ?? root, actor, () => {});
    assert.equal(scans - before, 0, "bind reuses the build's inbound rows");
    assert.ok(before >= 1);
  } finally {
    delete coll.contents;
  }
});

test("ties-17: the Attributes tab's granted cards are the Known tab's region (one copy of the markup)", async () => {
  const { grantedRegion } = await import("../known-ui.mjs");
  const { sourceScan } = await import("./kit/harness.mjs");
  assert.equal(grantedRegion([]), "");
  assert.equal(grantedRegion([{ text: "<p></p>", source: "x" }]), "", "only blank cards: no region");
  assert.match(grantedRegion([{ text: "Owes.", source: "Debts", icon: "i.webp" }]), /pt-granted-head[\s\S]*pt-grant-source">Debts[\s\S]*Owes\./);
  assert.deepEqual(sourceScan(new URL("..", import.meta.url), /function grantedBlock/), []);
});
