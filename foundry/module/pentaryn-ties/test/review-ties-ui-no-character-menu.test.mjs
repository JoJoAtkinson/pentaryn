/**
 * Final code review (ties-ui-E7): a player with no assigned character got no double-click menu at
 * all — openLookMenu returned early when `inspectorFor()` was null, so the tie and notebook items
 * (which work, or warn 'needCharacter', on their own) were unreachable too.
 * Ruling [declared]: build the menu whenever mayWrite() and a subject exist; the two Look items
 * (closer look, what I know) only when there is an inspector; the tie and notebook items always.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bootWorld } from "./fixtures/world.mjs";

const PC = "zzE7Pc0000000001";
const NPC = "zzE7Npc000000001";
const PLAYER = "zzE7PlayerUser01";

const F = await bootWorld({
  user: { id: PLAYER, name: "ZZ E7 Player", isGM: false },
  users: [{ id: "zzE7GmUser000001", name: "ZZ E7 GM", isGM: true, active: true }],
  actors: [
    { id: PC, name: "ZZ E7 Pc", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: NPC, name: "ZZ E7 Npc", isOwner: false },
  ],
  tokens: [{ id: "zzE7TokNpc000001", actorId: NPC, x: 300, y: 100 }],
  before: F => { F.game.user.character = null; },
});

const menus = () => document.body.children.filter(c => c.classList?.contains?.("pt-look-menu"));
const escape = () => document.listeners.filter(l => l.type === "keydown").forEach(l => l.fn({ key: "Escape" }));
const openMenu = async () => {
  if (!canvas.app.view.listeners.dblclick?.length) F.fire("canvasReady");
  await canvas.app.view.dispatch("dblclick", { clientX: 5, clientY: 5 });
  return menus().at(-1) ?? null;
};
const icons = m => m.children.map(b => b.innerHTML.match(/fa-solid ([\w-]+)/)?.[1]);

test("ties-ui-E7 a player with no assigned character still gets the menu: tie and notebook only", async () => {
  game.user.character = null;
  try {
    const m = await openMenu();
    assert.ok(m, "a menu opens for a player with no character");
    assert.deepEqual(icons(m), ["fa-people-arrows", "fa-feather-pointed"]);
  } finally {
    escape();
  }
});

test("ties-ui-E7 with a character the menu keeps all four items, Look items first", async () => {
  game.user.character = game.actors.get(PC);
  try {
    const m = await openMenu();
    assert.deepEqual(icons(m), ["fa-eye", "fa-book-open-reader", "fa-people-arrows", "fa-feather-pointed"]);
  } finally {
    escape();
    game.user.character = null;
  }
});
