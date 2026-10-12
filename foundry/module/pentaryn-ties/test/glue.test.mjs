/**
 * Characterisation (ties checkpoint, wave 3 — guide §3 S2 item 1): the entry's glue on a GM client.
 * init registrations (6 keybindings, 10 settings, exact configs), the ready steps (API, macro, the two
 * socket registrations), every keybinding's onDown, the scene-control button, the Token HUD buttons,
 * the sheet header button and the three injected tabs, the deleteActor sweep, and the tempo-clearing
 * hooks. Synthetic world; frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { bootWorld, settle } from "./fixtures/world.mjs";
import { el, serialise } from "./fixtures/dom.mjs";

const PC = "zzPc000000000001";
const NPC = "zzNpc00000000001";
const OTHER = "zzNpc00000000002";

const socketOn = [];
const F = await bootWorld({
  actors: [
    { id: PC, name: "ZZ Caven", type: "character" },
    { id: NPC, name: "ZZ Brakka", flags: { "pentaryn-ties": { ties: [{ id: PC, word: "debtor", stance: -1, strength: 4 }] } } },
    { id: OTHER, name: "ZZ Quill" },
  ],
  tokens: [
    { id: "zzTokPc000000001", actorId: PC, x: 100, y: 100 },
    { id: "zzTokNpc00000001", actorId: NPC, x: 300, y: 100 },
  ],
  before: F => {
    F.game.socket.on = (channel, fn) => {
      socketOn.push({ channel, fn });
      F.calls.push({ op: "socket.on", channel });
    };
  },
});
const T = () => game.pentaryn.ties;
const flush = async (n = 6) => {
  for (let i = 0; i < n; i++) await new Promise(r => setImmediate(r));
};
const tok = id => canvas.tokens.get(id);

test("VERSION: module.json says 0.19.4 (C41; re-pointed at ties-core.VERSION in S3)", () => {
  assert.equal(manifestOf(new URL("..", import.meta.url)).version, "0.19.4");
});

test("stub runs Foundry's own common/", () => {
  if (process.env.PENTARYN_TEST_SHIMS !== "1") assert.equal(F.utilsSource, "foundry");
});

test("boot as GM: the ordered effect log of init → setup → ready", () => {
  pinJSON("glue-boot-gm", F.calls, import.meta.url);
  assert.deepEqual(
    F.calls.filter(c => c.op === "keybindings.register").map(c => c.id),
    ["showWeb", "addTie", "fileKnown", "inspect", "showOneTie", "showDescription"].map(k => `pentaryn-ties.${k}`)
  );
  assert.deepEqual(
    F.calls.filter(c => c.op === "settings.register").map(c => c.id.split(".")[1]),
    ["macroCreated", "playerAccess", "holdDefault", "attributes", "attributeBeliefs", "attributeKnowledge", "advantageStacking", "nearDistance", "pinnedCards", "sheetTab"]
  );
  assert.deepEqual(socketOn.map(s => s.channel), ["module.pentaryn-ties", "module.pentaryn-ties"], "relay first, study second");
  assert.deepEqual(F.console, [], "a clean GM boot logs nothing");
});

test("settings: every registered config, exactly", () => {
  const rows = {};
  for (const [id, s] of game.settings.settings) {
    rows[id] = { ...s, type: s.type?.name ?? null, onChange: typeof s.onChange };
  }
  pinJSON("glue-settings", rows, import.meta.url);
});

test("keybindings: every registered config (handlers by type)", () => {
  const rows = {};
  for (const [id, k] of game.keybindings.actions) rows[id] = { ...k, onDown: typeof k.onDown };
  pinJSON("glue-keybindings", rows, import.meta.url);
});

test("ready: the macro is created once (absent macro), and macroCreated is set", () => {
  const made = F.calls.filter(c => c.op === "Macro.create");
  assert.equal(made.length, 1);
  assert.equal(made[0].data.command, "game.pentaryn.ties.show();");
  assert.ok(F.calls.some(c => c.op === "settings.set" && c.id === "pentaryn-ties.macroCreated" && c.value === true));
});

test("keybinding onDown: each key with nothing hovered, as GM", async () => {
  const rows = [];
  for (const id of ["showWeb", "addTie", "fileKnown", "inspect", "showOneTie", "showDescription"]) {
    const mark = F.calls.length;
    const c0 = F.console.length;
    const out = game.keybindings.actions.get(`pentaryn-ties.${id}`).onDown();
    await flush();
    rows.push({ id, out, calls: F.calls.slice(mark), console: F.console.slice(c0) });
  }
  pinJSON("glue-keys-empty-gm", rows, import.meta.url);
});

test("keybinding 4 (inspect) as GM: the selected character inspects the hovered NPC", async () => {
  canvas.tokens.controlled = [tok("zzTokPc000000001")];
  canvas.tokens.hover = tok("zzTokNpc00000001");
  const mark = F.calls.length;
  const c0 = F.console.length;
  const out = game.keybindings.actions.get("pentaryn-ties.inspect").onDown();
  await settle(flush(10));
  pinJSON("glue-key-inspect-gm", { out, calls: F.calls.slice(mark), console: F.console.slice(c0), scoping: T().study.scoping() }, import.meta.url);
  canvas.tokens.controlled = [];
  canvas.tokens.hover = null;
});

test("tempo-clearing hooks: which events end a live run of looking (seeded through key 4)", async () => {
  const rows = [];
  for (const [label, hook, ...args] of [
    ["canvasReady", "canvasReady"],
    ["combatStart", "combatStart"],
    ["deleteCombat", "deleteCombat"],
    ["updateCombat round 1", "updateCombat", { previous: { round: 0 } }, { round: 1 }],
    ["updateCombat round 2 after round 1", "updateCombat", { previous: { round: 1 } }, { round: 2 }],
    ["updateCombat round 2, no previous", "updateCombat", { previous: {} }, { round: 2 }],
    ["updateCombat round 0", "updateCombat", { previous: {} }, { round: 0 }],
    ["updateCombat no round", "updateCombat", { previous: {} }, { turn: 2 }],
    ["canvasPan (closes the menu only)", "canvasPan"],
  ]) {
    // seed a run: the GM inspects through key 4, which counts the selected PC's look
    canvas.tokens.controlled = [tok("zzTokPc000000001")];
    canvas.tokens.hover = tok("zzTokNpc00000001");
    T().study.clearScoping();
    game.keybindings.actions.get("pentaryn-ties.inspect").onDown();
    await settle(flush(10));
    const before = T().study.scoping(PC);
    F.fire(hook, ...args);
    rows.push({ label, seeded: !!before, after: T().study.scoping(PC) });
  }
  canvas.tokens.controlled = [];
  canvas.tokens.hover = null;
  assert.deepEqual(F.hookErrors, []);
  pinJSON("glue-tempo-hooks", rows, import.meta.url);
});

test("getSceneControlButtons: the GM's review tool on token controls; absent controls are ignored", () => {
  const controls = { tokens: { tools: {} } };
  F.fire("getSceneControlButtons", controls);
  const tool = controls.tokens.tools.ptAttrReview;
  pinJSON("glue-scene-control", { ...tool, onChange: typeof tool.onChange }, import.meta.url);
  F.fire("getSceneControlButtons", {});
  F.fire("getSceneControlButtons", null);
  assert.deepEqual(F.hookErrors, []);
});

/** A Token HUD element: the left and right columns the two injectors look for. */
const hudElement = () => {
  const left = el("div", { className: "col left" });
  const right = el("div", { className: "col right" });
  return { root: el("div", { className: "token-hud", children: [left, right] }), left, right };
};

test("renderTokenHUD as GM: tie, preview and worn buttons; the inspect eye only with a selected character", () => {
  const rows = [];
  for (const [label, controlled, hovered] of [
    ["NPC token, nothing selected", [], "zzTokNpc00000001"],
    ["NPC token, PC selected", ["zzTokPc000000001"], "zzTokNpc00000001"],
    ["PC's own token, PC selected", ["zzTokPc000000001"], "zzTokPc000000001"],
  ]) {
    canvas.tokens.controlled = controlled.map(tok);
    const { root } = hudElement();
    F.fire("renderTokenHUD", { object: tok(hovered) }, root);
    F.fire("renderTokenHUD", { object: tok(hovered) }, root); // a second render adds nothing
    rows.push({ label, hud: serialise(root) });
  }
  canvas.tokens.controlled = [];
  const { root } = hudElement();
  F.fire("renderTokenHUD", { object: null }, root);
  rows.push({ label: "no token", hud: serialise(root) });
  F.fire("renderTokenHUD", { object: tok("zzTokNpc00000001") }, el("div"));
  assert.deepEqual(F.hookErrors, []);
  assert.deepEqual(F.console, []);
  pinJSON("glue-token-hud-gm", rows, import.meta.url);
});

test("renderTokenHUD buttons: what each click does, as GM", async () => {
  canvas.tokens.controlled = [tok("zzTokPc000000001")];
  const { root, left, right } = hudElement();
  F.fire("renderTokenHUD", { object: tok("zzTokNpc00000001") }, root);
  const rows = [];
  for (const btn of [...left.children, ...right.children]) {
    const mark = F.calls.length;
    const c0 = F.console.length;
    const seen = await settle(btn.dispatch("click"));
    await settle(flush(10));
    rows.push({ button: btn.className, seen, disabled: btn.disabled, calls: F.calls.slice(mark), console: F.console.slice(c0) });
  }
  canvas.tokens.controlled = [];
  pinJSON("glue-token-hud-clicks-gm", rows, import.meta.url);
});

/** A dnd5e v2 sheet's markup: header with a close button, the primary nav, the tab body. */
const sheetElement = () => {
  const close = el("button", { className: "header-control fa-xmark" });
  const header = el("header", { className: "window-header", children: [el("h1"), close] });
  const nav = el("nav", { className: "tabs", dataset: { group: "primary" }, children: [el("a", { className: "item active", dataset: { tab: "details" } })] });
  const body = el("div", { className: "tab-body", children: [el("section", { className: "tab active", dataset: { tab: "details" } })] });
  const root = el("div", { className: "application sheet tab-details", children: [header, nav, body] });
  return { root, header, nav, body };
};

test("sheet render as GM: header button and the Ties, Known (characters only) and Attributes tabs", () => {
  const rows = [];
  for (const [label, id, hook, primary] of [
    ["character sheet", PC, "renderCharacterActorSheet", "details"],
    ["NPC sheet", NPC, "renderNPCActorSheet", "details"],
    ["re-render while on Ties", NPC, "renderActorSheetV2", "ties"],
  ]) {
    const { root } = sheetElement();
    const app = { document: game.actors.get(id), tabGroups: { primary } };
    F.fire(hook, app, root);
    rows.push({ label, tabGroups: app.tabGroups, sheet: serialise(root) });
  }
  // not an Actor: nothing
  const { root } = sheetElement();
  F.fire("renderActorSheet", { document: { id: "x" } }, root);
  rows.push({ label: "not an Actor", sheet: serialise(root) });
  pinJSON("glue-sheet-gm", rows, import.meta.url);
  assert.deepEqual(F.hookErrors, []);
  assert.deepEqual(F.console, [], "no tab is skipped");
});

test("sheet render: a second render keeps one link and one section per tab; the tab link activates", async () => {
  const { root, nav, body } = sheetElement();
  const app = { document: game.actors.get(PC), tabGroups: { primary: "details" } };
  F.fire("renderActorSheetV2", app, root);
  F.fire("renderActorSheetV2", app, root);
  const links = nav.children.map(c => c.dataset.tab);
  const sections = body.children.map(c => c.dataset.tab);
  const seen = await nav.children.find(c => c.dataset.tab === "known").dispatch("click");
  pinJSON(
    "glue-sheet-activate",
    { links, sections, seen, tabGroups: app.tabGroups, rootClass: root.className, active: [...nav.children, ...body.children].filter(c => c.classList.contains("active")).map(c => `${c.tagName}:${c.dataset.tab}`) },
    import.meta.url
  );
});

test("sheet render: sheetTab off keeps the header button and drops the tabs; markup moved drops the tabs only", async () => {
  await game.settings.set("pentaryn-ties", "sheetTab", false);
  const a = sheetElement();
  F.fire("renderActorSheetV2", { document: game.actors.get(NPC), tabGroups: {} }, a.root);
  await game.settings.set("pentaryn-ties", "sheetTab", true);
  const b = el("div", { children: [el("header", { className: "window-header" })] });
  F.fire("renderActorSheetV2", { document: game.actors.get(NPC), tabGroups: {} }, b);
  pinJSON("glue-sheet-off", { sheetTabOff: serialise(a.root), noNav: serialise(b) }, import.meta.url);
});

test("deleteActor: forgets the editor's and the notebook's row state without error", () => {
  F.fire("deleteActor", { id: OTHER });
  assert.deepEqual(F.hookErrors, []);
});

test("document listeners: pointerdown (capture) and keydown are registered at load", () => {
  assert.deepEqual(
    document.listeners.map(l => ({ type: l.type, capture: l.capture })),
    [
      { type: "pointerdown", capture: true },
      { type: "keydown", capture: false },
    ]
  );
});

test("canvasReady: the double-click listener goes on the view once", () => {
  F.fire("canvasReady");
  F.fire("canvasReady");
  assert.equal(canvas.app.view.dataset.ptLook, "1");
  assert.equal(canvas.app.view.listeners.dblclick.length, 1);
});

test("double-click as GM does nothing (the GM has the HUD)", async () => {
  const mark = F.calls.length;
  await canvas.app.view.dispatch("dblclick", { clientX: 10, clientY: 10 });
  assert.deepEqual(F.calls.slice(mark), []);
  assert.equal(document.body.children.length, 0);
});
