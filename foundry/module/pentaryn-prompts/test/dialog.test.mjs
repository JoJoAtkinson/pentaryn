/**
 * Characterisation (prompts checkpoint, wave 3): the prompt dialog (dialog.mjs) on the stub
 * ApplicationV2 and fake DOM of test/fixtures/world.mjs — opening (guards, reuse, placement, a
 * failed render), the context, autosave, keys, the type-ahead hand-over, the focus guard, closing
 * (save, discard, the empty fresh marker), a marker deleted elsewhere, the size chips (the swapped
 * token's data, prompts-lookup-24), delete, row clicks, "more", and the side panel's HTML.
 * Frozen once committed.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { installWorld, captureConsole, FakeElement, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const NOW = 1760000000000;
const F = await installWorld();
await captureConsole(() => import("../prompts.mjs"));
F.fire("init");
const { PromptDialog } = await import("../dialog.mjs");
const T = await import("../typeahead.mjs");

const m1 = () => F.s1.tokens.get("m1");
const ta = app => app.element.querySelector("textarea[name=prompt]");
const key = (app, k, o = {}) => {
  let prevented = 0;
  app.element.dispatch("keydown", { key: k, shiftKey: false, metaKey: false, ctrlKey: false, isComposing: false, ...o,
    preventDefault: () => prevented++, stopPropagation: () => prevented++ });
  return prevented;
};
const updates = () => F.calls.filter(c => c.op === "update" && c.documentName === "Token");
async function fresh(id = "fresh", text = "") {
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1200, y: 600, flags: { [MODULE]: { prompt: text } } }], { pentarynPrompts: { test: id } });
  return tok;
}

test("open: refused for a player, a missing doc or a non-marker (its ticket cancelled, text an orphan)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  assert.equal(await PromptDialog.open(m1()), null);
  F.game.user = gm;
  assert.equal(await PromptDialog.open(null), null);
  assert.equal(await PromptDialog.open(F.s1.tokens.get("tokOrdinary00001")), null);
  assert.equal(T.isCapturing(), false);
});

test("open: context (golden dialog-context), position beside the token, focus with the caret at the end; a second open of the same marker reuses it", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const app = await PromptDialog.open(m1());
  assert.equal(PromptDialog.current, app);
  const r = app.renders[0];
  pinJSON("dialog-context", { context: r.context, options: r.options, title: app.title }, import.meta.url);
  assert.equal(ta(app).value, "a lantern");
  assert.equal(ta(app).focused, 1);
  assert.deepEqual(ta(app).selection, [9, 9]);
  const again = await PromptDialog.open(m1());
  assert.equal(again, app);
  assert.equal(F.calls.at(-1).op, "app.bringToFront");
  assert.equal(ta(app).focused, 2);
  assert.equal(app.edits(m1()), true);
  assert.equal(app.edits(F.s1.tokens.get("m2")), false);
  await app.close();
  assert.equal(PromptDialog.current, null);
});

test("open: off the viewed scene, or with no token rectangle, it centres on the window; a remembered size is reused", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  F.canvas.scene = null;
  const app = await PromptDialog.open(m1());
  assert.deepEqual(app.renders[0].options.position, { left: 514, top: 410, width: 620, height: 320 });
  app._onPosition({ width: 700, height: 400 });
  app._onPosition({ width: 200, height: 400 });   // too small: ignored
  await app.close();
  const next = await PromptDialog.open(m1());
  assert.deepEqual([next.renders[0].options.position.width, next.renders[0].options.position.height], [700, 400]);
  next._onPosition({ width: 620, height: 320 });
  await next.close();
  F.canvas.scene = F.s1;
});

test("open: a render that throws is logged, forgotten, and its ticket cancelled", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const saved = PromptDialog.prototype._prepareContext;
  PromptDialog.prototype._prepareContext = async () => { throw new Error("template missing"); };
  const ticket = T.start();
  const { value, out } = await captureConsole(() => PromptDialog.open(m1(), { ticket }));
  PromptDialog.prototype._prepareContext = saved;
  assert.equal(value, null);
  assert.equal(PromptDialog.current, null);
  assert.equal(T.isCapturing(), false);
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | the prompt dialog failed to render Error(template missing)"]);
});

test("autosave: 600 ms after the last input the text, time, nameplate and tint are written; unchanged text writes nothing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const app = await PromptDialog.open(m1());
  const n0 = updates().length;
  ta(app).value = "a lantern, lit";
  ta(app).dispatch("input");
  t.mock.timers.tick(599);
  await flush();
  assert.equal(updates().length, n0);
  t.mock.timers.tick(1);
  await flush();
  assert.deepEqual(updates().slice(n0).map(c => c.changes), [{ "flags.pentaryn-prompts.prompt": "a lantern, lit", "flags.pentaryn-prompts.updatedAt": NOW + 600,
    name: "✎ a lantern, lit", "texture.tint": "#ffffff" }]);
  ta(app).dispatch("input");
  t.mock.timers.tick(600);
  await flush();
  assert.equal(updates().length, n0 + 1, "same text: no write");
  ta(app).value = "a lantern";
  await app.close();
  assert.equal(updates().at(-1).changes["flags.pentaryn-prompts.prompt"], "a lantern");
});

test("keys: Esc saves and closes; Shift+Esc puts the opened text back; Cmd/Ctrl+Enter saves; plain Enter and composing keys pass", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  let app = await PromptDialog.open(m1());
  assert.equal(key(app, "Enter"), 0);
  assert.equal(key(app, "Escape", { isComposing: true }), 0);
  ta(app).value = "a lantern, hooded";
  assert.equal(key(app, "Escape"), 2);
  await flush(); await flush();
  assert.equal(m1().flags[MODULE].prompt, "a lantern, hooded");
  app = await PromptDialog.open(m1());
  ta(app).value = "scribbles";
  assert.equal(key(app, "Escape", { shiftKey: true }), 2);
  await flush(); await flush();
  assert.equal(m1().flags[MODULE].prompt, "a lantern, hooded");
  app = await PromptDialog.open(m1());
  ta(app).value = "a lantern";
  assert.equal(key(app, "Enter", { ctrlKey: true }), 2);
  await flush(); await flush();
  assert.equal(m1().flags[MODULE].prompt, "a lantern");
});

test("type-ahead: text typed before focus is appended on focus and saved; a buffered Esc closes; Shift+Esc discards", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const L = F.dom.window.listeners;
  const type = s => [...s].forEach(k => L.keydown?.at(-1)?.fn({ key: k, code: `Key${k}`, metaKey: false, ctrlKey: false, shiftKey: false, isComposing: false, preventDefault() {}, stopImmediatePropagation() {} }));
  let ticket = T.start();
  type(" lit");
  let app = await PromptDialog.open(m1(), { ticket });
  assert.equal(ta(app).value, "a lantern lit");
  t.mock.timers.tick(600);
  await flush();
  assert.equal(m1().flags[MODULE].prompt, "a lantern lit");
  ta(app).value = "a lantern";
  await app.close();
  ticket = T.start();
  type("!");
  L.keydown.at(-1).fn({ key: "Escape", code: "Escape", shiftKey: true, metaKey: false, ctrlKey: false, isComposing: false, preventDefault() {}, stopImmediatePropagation() {} });
  app = await PromptDialog.open(m1(), { ticket });
  await flush(); await flush();
  assert.equal(app.rendered, false, "the buffered Esc closed it");
  assert.equal(m1().flags[MODULE].prompt, "a lantern", "Shift+Esc: the opened text");
});

test("takeOrphan: unclaimed text goes into the open box (true), else false", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  assert.equal(PromptDialog.takeOrphan("x"), false);
  const app = await PromptDialog.open(m1());
  assert.equal(PromptDialog.takeOrphan(" more"), true);
  assert.equal(ta(app).value, "a lantern more");
  ta(app).value = "a lantern";
  await app.close();
});

test("focus guard: inside 1.2 s, focus dropped to the page comes back; focus moved into another field stays there", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const app = await PromptDialog.open(m1());
  const before = ta(app).focused;
  F.dom.document.activeElement = F.dom.document.body;
  ta(app).dispatch("blur", { relatedTarget: null });
  t.mock.timers.tick(0);
  assert.equal(ta(app).focused, before + 1);
  const field = new FakeElement("input");
  field.closest = () => field;
  ta(app).dispatch("blur", { relatedTarget: field });
  t.mock.timers.tick(0);
  assert.equal(ta(app).focused, before + 1);
  F.dom.document.activeElement = field;
  ta(app).dispatch("blur", { relatedTarget: null });
  t.mock.timers.tick(0);
  assert.equal(ta(app).focused, before + 1, "something real has focus");
  F.dom.document.activeElement = F.dom.document.body;
  await app.close();
});

test("closing a fresh marker empty deletes it with a notice; with the setting off it stays; a save error is reported", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh();
  let app = await PromptDialog.open(tok, { fresh: true });
  assert.equal(app.renders[0].context.hint, "Esc saves · ⌘⏎ saves · ⇧Esc removes this new marker");
  await app.close();
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").at(-1), { op: "notify", level: "info", message: "Prompt marker removed (empty)." });
  await F.game.settings.set(MODULE, "deleteEmptyOnClose", false);
  const kept = await fresh("kept");
  app = await PromptDialog.open(kept, { fresh: true });
  assert.equal(app.renders[0].context.hint, "Esc saves · ⌘⏎ saves · ⇧Esc puts the text back");
  await app.close();
  assert.ok(F.s1.tokens.get(kept.id));
  await F.game.settings.set(MODULE, "deleteEmptyOnClose", true);
  app = await PromptDialog.open(kept);
  kept.update = async () => { throw new Error("locked"); };
  ta(app).value = "words";
  const { out } = await captureConsole(() => app.close());
  delete kept.update;
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | saving the prompt failed Error(locked)"]);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").at(-1), { op: "notify", level: "error", message: "The prompt could not be saved; see the console." });
  await F.s1.deleteEmbeddedDocuments("Token", [kept.id]);
});

test("close before focus keeps what was typed for it; opening another box closes this one (saving)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const app = await PromptDialog.open(m1());
  const ticket = T.start();
  const L = F.dom.window.listeners;
  [..."zz"].forEach(k => L.keydown.at(-1).fn({ key: k, code: `Key${k}`, preventDefault() {}, stopImmediatePropagation() {} }));
  // a second, unrendered box for m2 holding the ticket: closed at once
  const m2 = F.s1.tokens.get("m2");
  const before = m2.flags[MODULE].prompt;
  const second = await PromptDialog.open(m2, { ticket: null });
  assert.equal(app.rendered, false, "the first box closed when the second opened");
  await second.close();
  assert.equal(m2.flags[MODULE].prompt, before);
  T.cancel(ticket);
});

test("onTokenDeleted: a box whose marker is deleted elsewhere closes without saving", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("gone", "words");
  const app = await PromptDialog.open(tok);
  ta(app).value = "typed into nothing";
  const n0 = updates().length;
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
  await flush(); await flush();
  assert.equal(app.rendered, false);
  assert.equal(updates().length, n0);
});

test("size chips: the marker is swapped for the other size's actor, centred, text carried, swappedFrom set (golden dialog-swap)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("swap", "a cart");
  tok.level = "L1";
  tok.elevation = 10;
  const app = await PromptDialog.open(tok);
  const size = PromptDialog.DEFAULT_OPTIONS.actions.size;
  const n0 = F.calls.length;
  await size.call(app, {}, { dataset: { size: "mid" } });   // same size: nothing
  await size.call(app, {}, { dataset: { size: "huge" } });   // not a size: nothing
  assert.equal(F.calls.length, n0);
  await size.call(app, {}, { dataset: { size: "large" } });
  const create = F.calls.slice(n0).find(c => c.op === "createEmbeddedDocuments");
  const swap = { data: create.data, options: create.options, render: F.calls.slice(n0).filter(c => c.op === "app.render") };
  pinJSON("dialog-swap", JSON.parse(JSON.stringify(swap).split(tok.id).join("<the old marker's id>")), import.meta.url);
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.equal(app.rendered, true, "the old token's delete did not close the box");
  assert.equal(app.token.flags[MODULE].marker, "large");
  // no actor for that size: a warning
  const xl = F.game.actors.get("markerActorxl000");
  F.game.actors.delete(xl.id);
  await size.call(app, {}, { dataset: { size: "xl" } });
  F.game.actors.set(xl.id, xl);
  assert.deepEqual(F.calls.filter(c => c.op === "notify").at(-1).message, "No \"Prompt · xl\" actor in this world. Reload as GM to recreate it.");
  const swapped = app.token.id;
  await app.close();
  await F.s1.deleteEmbeddedDocuments("Token", [swapped]);
});

test("delete: the marker is deleted and the box closes without saving", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const tok = await fresh("del", "x");
  const app = await PromptDialog.open(tok);
  ta(app).value = "changed";
  const n0 = updates().length;
  await PromptDialog.DEFAULT_OPTIONS.actions.deleteMarker.call(app);
  assert.equal(F.s1.tokens.get(tok.id), undefined);
  assert.equal(app.rendered, false);
  assert.equal(updates().length, n0);
});

test("side panel: rows nearest first, the door line, out of sight (golden dialog-panel); a failure says so", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  await F.game.settings.set(MODULE, "panelRows", 1);
  // a marker behind the closed door, within 60 ft
  const [behind] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActorsmall", x: 1100, y: 400, flags: { [MODULE]: { prompt: "a sentry" } } }], { pentarynPrompts: { t: 1 } });
  const app = await PromptDialog.open(F.s1.tokens.get("m2"));
  t.mock.timers.tick(16);
  await flush(); await flush();
  const html = app.element.querySelector("[data-panel]").innerHTML.replace(/\d{16}/g, "<id>");
  pinJSON("dialog-panel", html.split("\n").map(l => l.trim()), import.meta.url);
  // row clicks: a plain click pans; with Cmd a prompt row opens that marker's box, a token row its actor's sheet
  const row = PromptDialog.DEFAULT_OPTIONS.actions.row;
  const n0 = F.calls.length;
  row.call(app, {}, { dataset: { key: "Token.m1" } });
  assert.deepEqual(F.calls.slice(n0).filter(c => c.op === "canvas.animatePan"), [{ op: "canvas.animatePan", x: 250, y: 250, duration: 300 }]);
  const guard = F.game.actors.get("actorGuard000001");
  let sheet = 0;
  guard.sheet = { render: () => sheet++ };
  row.call(app, { metaKey: true }, { dataset: { key: "Token.tokOrdinary00001" } });
  assert.equal(sheet, 1);
  row.call(app, {}, { dataset: { key: "Token.unknown" } });
  const opened = await row.call(app, { ctrlKey: true }, { dataset: { key: "Token.m1" } });
  assert.equal(opened.edits(m1()), true);
  // "+N more": the hidden rows shown, the button removed
  const extra = new FakeElement("li");
  extra.className = "pp-row pp-extra";
  opened.element.appendChild(extra);
  const btn = new FakeElement("button");
  PromptDialog.DEFAULT_OPTIONS.actions.more.call(opened, {}, btn);
  assert.equal(extra.className, "pp-row");
  assert.equal(btn.removed, true);
  // a panel that throws
  const saved = F.s1.walls;
  F.s1.walls = { some() { throw new Error("walls gone"); } };
  const { out } = await captureConsole(async () => { PromptDialog.refreshPanels("s1"); t.mock.timers.tick(250); await flush(); await flush(); });
  F.s1.walls = saved;
  assert.equal(opened.element.querySelector("[data-panel]").innerHTML, "<p class=\"pp-empty\">Could not compute what this marker sees; see the console.</p>");
  // the box's own first draw (16 ms after opening) and the refresh both fail
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | side panel failed Error(walls gone)", "pentaryn-prompts | side panel failed Error(walls gone)"]);
  await opened.close();
  await F.game.settings.set(MODULE, "panelRows", 12);
  await F.s1.deleteEmbeddedDocuments("Token", [behind.id]);
});

test("_updatePosition: a window whose element left the document keeps its position untouched", async () => {
  const app = new PromptDialog();
  assert.deepEqual(app._updatePosition({ left: 1 }), { left: 1 });
  app.element = new FakeElement("div");
  app.element.removed = true;
  assert.deepEqual(app._updatePosition({ left: 2 }), { left: 2 });
});
