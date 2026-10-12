/**
 * The performance findings, each proven neutral on output (or declared where it is not):
 * ties-24 worn badges (badgePlan; players schedule no frame — B7), and the others as they land.
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
