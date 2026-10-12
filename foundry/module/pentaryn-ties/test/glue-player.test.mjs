/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 1, player half): the entry's glue on a
 * PLAYER client with a GM online. The ready steps a player skips, every key with a hovered NPC, the
 * kill-switch, the Token HUD on their own token, the sheet tabs on their character and not on an NPC
 * they do not own, and the double-click Look menu with each of its four items. Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const PLAYER = "zzPlayerUser0001";

const socketOn = [];
const F = await bootWorld({
  user: { id: PLAYER, name: "ZZ Player", isGM: false },
  users: [{ id: "zzGmUser00000001", name: "ZZ GM", isGM: true, active: true }],
  actors: [
    { id: PC, name: "ZZ Caven", type: "character", ownership: { default: 0, [PLAYER]: 3 } },
    { id: NPC, name: "ZZ Brakka", isOwner: false },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 100, y: 100, isOwner: true },
    { id: "zzTokNpc00000001", actorId: NPC, x: 300, y: 100 },
  ],
  before: F => {
    F.game.socket.on = (channel, fn) => {
      socketOn.push({ channel, fn });
      F.calls.push({ op: "socket.on", channel });
    };
    F.game.user.character = null; // set below, once the actors exist
  },
});
game.user.character = game.actors.get(PC);
canvas.tokens.get("zzTokNpc00000001").document.sort = 1; // the NPC is drawn on top
const T = () => game.pentaryn.ties;
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const tok = id => canvas.tokens.get(id);

test("boot as a player: no macro, no migration, both socket handlers still registered", () => {
  pinJSON("glue-boot-player", F.calls, import.meta.url);
  assert.equal(F.calls.filter(c => c.op === "Macro.create").length, 0);
  assert.deepEqual(socketOn.map(s => s.channel), ["module.pentaryn-ties", "module.pentaryn-ties"]);
  assert.deepEqual(F.console, []);
});

test("keys as a player, hovering the NPC: what each one does", async () => {
  canvas.tokens.hover = tok("zzTokNpc00000001");
  const rows = [];
  for (const id of ["showWeb", "addTie", "fileKnown", "inspect", "showOneTie", "showDescription"]) {
    const mark = F.calls.length;
    const c0 = F.console.length;
    const out = game.keybindings.actions.get(`pentaryn-ties.${id}`).onDown();
    await settle(flush(10));
    rows.push({ id, out, calls: F.calls.slice(mark), console: F.console.slice(c0) });
  }
  canvas.tokens.hover = null;
  pinJSON("glue-keys-player", rows, import.meta.url);
});

test("playerAccess off: the writing keys, the HUD and the sheet tabs all go quiet", async () => {
  await game.settings.set("pentaryn-ties", "playerAccess", false);
  canvas.tokens.hover = tok("zzTokNpc00000001");
  const mark = F.calls.length;
  for (const id of ["addTie", "fileKnown", "inspect"]) game.keybindings.actions.get(`pentaryn-ties.${id}`).onDown();
  await settle(flush(10));
  const keys = F.calls.slice(mark);
  const hud = el("div", { children: [el("div", { className: "col left" })] });
  F.fire("renderTokenHUD", { object: tok("zzTokPc000000001") }, hud);
  const sheet = el("div", { children: [el("header", { className: "window-header" }), el("nav", { className: "tabs" }), el("div", { className: "tab-body" })] });
  F.fire("renderCharacterActorSheet", { document: game.actors.get(PC), tabGroups: {} }, sheet);
  const dbl = F.calls.length;
  await canvas.app.view.dispatch("dblclick", { clientX: 5, clientY: 5 });
  const dblclick = F.calls.slice(dbl);
  canvas.tokens.hover = null;
  await game.settings.set("pentaryn-ties", "playerAccess", true);
  pinJSON("glue-player-access-off", { keys, hud: serialise(hud), sheet: serialise(sheet), dblclick, menus: document.body.children.length }, import.meta.url);
});

test("renderTokenHUD as a player on their own token: the tie button only (no preview, no worn, no eye on yourself)", () => {
  const left = el("div", { className: "col left" });
  const right = el("div", { className: "col right" });
  const root = el("div", { children: [left, right] });
  F.fire("renderTokenHUD", { object: tok("zzTokPc000000001") }, root);
  pinJSON("glue-token-hud-player", serialise(root), import.meta.url);
});

test("sheet render as a player: tabs on their own character; nothing on an NPC they do not own", () => {
  const sheet = () =>
    el("div", {
      children: [
        el("header", { className: "window-header" }),
        el("nav", { className: "tabs", dataset: { group: "primary" } }),
        el("div", { className: "tab-body" }),
      ],
    });
  const own = sheet();
  F.fire("renderCharacterActorSheet", { document: game.actors.get(PC), tabGroups: {} }, own);
  const npc = sheet();
  F.fire("renderNPCActorSheet", { document: game.actors.get(NPC), tabGroups: {} }, npc);
  assert.deepEqual(F.console, []);
  pinJSON("glue-sheet-player", { own: serialise(own), npc: serialise(npc) }, import.meta.url);
});

test("double-click Look menu: opens over the NPC, four items, each click's effects; closes on outside pointerdown, Escape, pan", async () => {
  T().study.clearScoping();
  const open = async () => {
    await canvas.app.view.dispatch("dblclick", { clientX: 1180, clientY: 790 });
    return document.body.children.at(-1) ?? null;
  };
  F.fire("canvasReady"); // wires the view listener
  const menu = await open();
  const shape = serialise(menu);
  const items = [];
  for (let i = 0; i < 4; i++) {
    const m = await open();
    const mark = F.calls.length;
    const c0 = F.console.length;
    const seen = await settle(m.children[i].dispatch("click"));
    await settle(flush(10));
    items.push({ item: i, label: m.children[i].innerHTML, seen, menuOpen: document.body.children.includes(m), calls: F.calls.slice(mark), console: F.console.slice(c0) });
  }
  const closers = {};
  const fireDoc = (type, ev) => document.listeners.filter(l => l.type === type).forEach(l => l.fn(ev));
  let m = await open();
  fireDoc("pointerdown", { target: m.children[0] });
  closers.pointerdownInside = document.body.children.includes(m);
  fireDoc("pointerdown", { target: el("div") });
  closers.pointerdownOutside = document.body.children.includes(m);
  m = await open();
  fireDoc("keydown", { key: "Enter" });
  closers.enter = document.body.children.includes(m);
  fireDoc("keydown", { key: "Escape" });
  closers.escape = document.body.children.includes(m);
  m = await open();
  F.fire("canvasPan");
  closers.canvasPan = document.body.children.includes(m);
  m = await open();
  F.fire("canvasTearDown");
  closers.canvasTearDown = document.body.children.includes(m);
  pinJSON("glue-look-menu", { shape, items, closers }, import.meta.url);
});

test("double-click: your own token on top opens no menu; an item pile is skipped", async () => {
  const npc = tok("zzTokNpc00000001");
  npc.document.sort = -1; // the PC is now on top
  const before = document.body.children.length;
  await canvas.app.view.dispatch("dblclick", { clientX: 5, clientY: 5 });
  const ownOnTop = document.body.children.length - before;
  npc.document.sort = 1;
  npc.document.flags["item-piles"] = { data: { enabled: true } };
  await canvas.app.view.dispatch("dblclick", { clientX: 5, clientY: 5 });
  const pile = document.body.children.length - before;
  delete npc.document.flags["item-piles"];
  assert.deepEqual({ ownOnTop, pile }, { ownOnTop: 0, pile: 0 });
});

test("double-click: the look menu opens in a world without item-piles", async () => {
  const menus = () => document.body.children.filter(c => c.classList?.contains?.("pt-look-menu")).length;
  if (!canvas.app.view.listeners.dblclick?.length) F.fire("canvasReady"); // run alone: wire the view
  const before = menus();
  F.activeScopes.delete("item-piles");
  try {
    await canvas.app.view.dispatch("dblclick", { clientX: 5, clientY: 5 });
    await flush();
    assert.equal(menus() - before, 1);
  } finally {
    document.listeners.filter(l => l.type === "keydown").forEach(l => l.fn({ key: "Escape" }));
    F.activeScopes.add("item-piles");
  }
});

test("study.look and describe through the API as a player", async () => {
  const mark = F.calls.length;
  const look = T().study.look(game.actors.get(NPC));
  const lookSelf = T().study.look(game.actors.get(PC));
  const describe = await T().describeCard(); // B1 [declared]: was T().describe()
  pinJSON("glue-api-player-windows", { look: look?.constructor?.name ?? null, lookSelf, describe, calls: F.calls.slice(mark) }, import.meta.url);
});
