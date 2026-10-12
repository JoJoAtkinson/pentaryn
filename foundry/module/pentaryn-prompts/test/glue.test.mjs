/**
 * Characterisation (prompts checkpoint, wave 3; guide step 2): the entry `prompts.mjs` against the
 * stub world — what it registers at import, at init, setup and ready, the console texts, the
 * published `game.pentaryn.prompts` surface, and every hook handler and keybinding as they behave
 * today. Frozen once committed: a refactor may change import paths only.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON, readJSON } from "./kit/harness.mjs";
import { installWorld, captureConsole, FakeElement, MODULE } from "./fixtures/world.mjs";

const flush = () => new Promise(r => setImmediate(r));
const NOW = 1760000000000;

const F = await installWorld();
const imported = await captureConsole(() => import("../prompts.mjs"));
const { PromptDialog } = await import("../dialog.mjs");

test("import: prints nothing, adds one capturing keyup listener and (DP5) one blur listener to window", () => {
  assert.deepEqual(imported.out, []);
  assert.deepEqual(Object.keys(F.dom.window.listeners), ["keyup", "blur"]);
  assert.equal(F.dom.window.listeners.blur.length, 1);
  assert.equal(F.dom.window.listeners.keyup.length, 1);
  assert.equal(F.dom.window.listeners.keyup[0].capture, true);
});

test("hooks registered at import, in order (20 rows)", () => {
  const rows = F.hooks.map(({ kind, name }) => ({ kind, name }));
  assert.equal(rows.length, 20);
  pinJSON("hooks", rows, import.meta.url);
});

test("init: settings (ids, order, configs), keybindings, query names", () => {
  F.fire("init");
  const ids = F.calls.filter(c => c.op === "settings.register").map(c => c.id);
  const configs = ids.map(id => {
    const s = F.game.settings.settings.get(id);
    return { id, name: s.name ?? null, hint: s.hint ?? null, scope: s.scope, config: s.config, type: s.type?.name ?? null,
      default: s.default, range: s.range ?? null, choices: s.choices ?? null };
  });
  pinJSON("settings", configs, import.meta.url);
  const keys = F.calls.filter(c => c.op === "keybindings.register");
  assert.deepEqual(keys.map(k => [k.id, k.name]), [
    ["pentaryn-prompts.place", "PENTARYN_PROMPTS.keybind.place"],
    ["pentaryn-prompts.edit", "PENTARYN_PROMPTS.keybind.edit"]
  ]);
  const place = F.game.keybindings.actions.get("pentaryn-prompts.place");
  const edit = F.game.keybindings.actions.get("pentaryn-prompts.edit");
  assert.deepEqual([place.editable, place.restricted, place.hint], [[{ key: "KeyP" }], true, "PENTARYN_PROMPTS.keybind.placeHint"]);
  assert.deepEqual([edit.editable, edit.restricted, edit.hint], [[{ key: "KeyP", modifiers: ["Shift"] }], true, "PENTARYN_PROMPTS.keybind.editHint"]);
  assert.deepEqual(Object.keys(F.CONFIG.queries), ["list", "gather", "crops", "replace", "show"].map(n => `${MODULE}.${n}`));
  for (const fn of Object.values(F.CONFIG.queries)) assert.equal(typeof fn, "function");
});

test("setup: without lib-wrapper the configured Token class's _onClickLeft2 is wrapped by hand", async () => {
  const proto = F.CONFIG.Token.objectClass.prototype;
  const before = proto._onClickLeft2;
  const { out } = await captureConsole(() => F.fire("setup"));
  assert.deepEqual(out, []);
  assert.notEqual(proto._onClickLeft2, before);
  // an ordinary token: the original runs with the event
  const guard = { document: F.s1.tokens.get("tokOrdinary00001") };
  assert.equal(proto._onClickLeft2.call(guard, { type: "dbl" }), "original");
  assert.deepEqual(F.calls.at(-1), { op: "Token#_onClickLeft2 (original)", token: "tokOrdinary00001", event: { type: "dbl" } });
});

test("ready: publishes game.pentaryn.prompts synchronously (DP1) into a plain root, frozen (DP2); ensureMarkers repairs nothing", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  F.game.pentaryn = { importer: { keep: 1 } };
  const { out } = await captureConsole(async () => { F.fire("ready"); await flush(); });
  assert.deepEqual(out, []);
  assert.notEqual(F.game.pentaryn.prompts, undefined, "published synchronously in ready (DP1)");
  t.mock.timers.tick(0);
  assert.deepEqual(F.game.pentaryn.importer, { keep: 1 });
  const api = F.game.pentaryn.prompts;
  // [declared] DP1: the legacy surface is a subset of the kit-built API, every key with its old typeof
  const legacy = readJSON(new URL("golden/legacy-surface.json", import.meta.url));
  for (const [k, type] of legacy.keys) assert.equal(typeof api[k], type, k);
  assert.equal(api.version, legacy.version);
  assert.equal(api.version, "0.4.5");
  assert.equal(Object.isFrozen(api), true, "[declared] DP2: the API object is frozen");
  // nothing created or repaired: the six actors already hold what ensureMarkers wants
  assert.equal(F.calls.filter(c => ["Actor.createDocuments", "Folder.create", "update"].includes(c.op)).length, 0);
});

test("status(): version, listed, npcBridge, party, specDir, doubleClick, six marker ids", () => {
  const api = F.game.pentaryn.prompts;
  assert.deepEqual(api.status(), {
    version: "0.4.5", listed: null, npcBridge: false, party: "none set",
    specDir: "pentaryn-prompts-specs/ (under the Foundry Data dir; replaceMany({specFile: \"pentaryn-prompts-specs/<name>.json\"}))",
    doubleClick: "direct",
    markers: [["tiny", "markerActortiny0"], ["small", "markerActorsmall"], ["mid", "markerActormid00"], ["large", "markerActorlarge"],
      ["xl", "markerActorxl000"], ["xxl", "markerActorxxl00"]]
  });
  F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"] = async () => ({});
  F.game.settings.set(MODULE, "party", "4x5");
  F.game.modules.set(MODULE, { id: MODULE, version: "0.4.4", active: true });
  const s = api.status();
  assert.deepEqual([s.npcBridge, s.party, s.listed], [true, "4x5", "0.4.4"]);
  delete F.CONFIG.queries["foundry-mcp-bridge.createNpcActor"];
  F.game.settings.set(MODULE, "party", "");
  F.game.modules.delete(MODULE);
});

test("api.model: a scene by id, the viewed scene by default, SCENE_UNKNOWN otherwise", () => {
  const api = F.game.pentaryn.prompts;
  const m = api.model("s1");
  assert.equal(m.key, "s1");
  assert.deepEqual(m.items.map(i => i.key), ["Token.m1", "Token.m2", "Token.tokOrdinary00001"]);
  assert.equal(typeof m.rel, "function");
  assert.equal(api.model().key, "s1");
  assert.throws(() => api.model("nope"), { code: "SCENE_UNKNOWN", message: "SCENE_UNKNOWN: nope" });
});

/* ── preCreateToken ─────────────────────────────────────────────────────── */

test("preCreateToken: a marker token is born hidden, sightless, size-locked, flagged, named and tinted by its text", async () => {
  const [full] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 0, y: 0, flags: { [MODULE]: { prompt: "  two\n\n\nwords  " } } }], { pentarynPrompts: { test: true } });
  assert.deepEqual({ hidden: full.hidden, sight: full.sight, lockSize: full.flags.dnd5e.lockSize, marker: full.flags[MODULE].marker,
    name: full.name, tint: full.texture.tint }, { hidden: true, sight: { enabled: false }, lockSize: true, marker: "mid",
    name: "✎ two / words", tint: "#ffffff" });
  const [empty] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActorlarge", x: 0, y: 0 }], { pentarynPrompts: { test: true } });
  assert.deepEqual([empty.name, empty.texture.tint, empty.flags[MODULE].marker], ["Prompt · large — empty", "#ff6b6b", "large"]);
  const [plain] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "actorGuard000001", x: 0, y: 0, name: "Guard" }], { pentarynPrompts: { test: true } });
  assert.deepEqual([plain.hidden, plain.name, plain.flags[MODULE]], [false, "Guard", undefined]);
  await F.s1.deleteEmbeddedDocuments("Token", [full.id, empty.id, plain.id]);
  // a throw inside is caught and warned
  const { out } = await captureConsole(() => F.fire("preCreateToken", { flags: { [MODULE]: { marker: "mid" } } }, {}));
  assert.deepEqual(out.map(o => [o.level, o.text.split(" Error(")[0]]), [["warn", "pentaryn-prompts | preCreateToken"]]);
});

/* ── drop → create → dialog ─────────────────────────────────────────────── */

const opened = () => F.calls.filter(c => c.op === "app.render").length;

test("dropCanvasData then createToken near the drop opens the box fresh; elsewhere, late, or another user's does not", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const n0 = opened();
  F.fire("dropCanvasData", F.canvas, { type: "Actor", uuid: "Actor.markerActormid00", x: 250, y: 250 }, { clientX: 300, clientY: 310 });
  // far from the drop: not this drop's token
  const [far] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 1500, y: 800 }]);
  await flush();
  assert.equal(opened(), n0);
  // another user's creation: ignored
  F.Hooks.callAll("createToken", far, {}, "someoneElse00001");
  assert.equal(opened(), n0);
  const [near] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 200, y: 200 }]);
  await flush();
  assert.equal(opened(), n0 + 1);
  assert.equal(PromptDialog.current.edits(near), true);
  const r = PromptDialog.current.renders.at(-1);
  assert.equal(r.context.hint, "Esc saves · ⌘⏎ saves · ⇧Esc removes this new marker");
  assert.deepEqual(r.options.position, { left: 324, top: 270, width: 620, height: 320 });
  // a second token for the same drop: the drop was used up
  const [again] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 200, y: 200 }]);
  await flush();
  assert.equal(opened(), n0 + 1);
  // a drop that never makes a token is forgotten after 3,100 ms
  F.fire("dropCanvasData", F.canvas, { type: "Actor", id: "markerActormid00", x: 250, y: 250 }, {});
  t.mock.timers.tick(3100);
  const [late] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 200, y: 200 }]);
  await flush();
  assert.equal(opened(), n0 + 1);
  // not a marker actor, not an Actor drop, a throwing lookup: nothing, no throw
  F.fire("dropCanvasData", F.canvas, { type: "Actor", id: "actorGuard000001" }, {});
  F.fire("dropCanvasData", F.canvas, { type: "Item", id: "x" }, {});
  F.fire("dropCanvasData", F.canvas, null, {});
  assert.deepEqual(F.hookErrors, []);
  await PromptDialog.current?.close();
  await F.s1.deleteEmbeddedDocuments("Token", [far.id, near.id, again.id, late.id].filter(id => F.s1.tokens.get(id)));
});

test("createToken with the module's own option (place, swap) never opens from a pending drop", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const n0 = opened();
  F.fire("dropCanvasData", F.canvas, { type: "Actor", uuid: "Actor.markerActormid00", x: 250, y: 250 }, {});
  const [tok] = await F.s1.createEmbeddedDocuments("Token", [{ actorId: "markerActormid00", x: 200, y: 200 }], { pentarynPrompts: { swap: true } });
  await flush();
  assert.equal(opened(), n0);
  t.mock.timers.tick(3100);
  await F.s1.deleteEmbeddedDocuments("Token", [tok.id]);
});

/* ── renderTokenHUD ─────────────────────────────────────────────────────── */

function hud() {
  const root = new FakeElement("div");
  const col = root.appendChild(new FakeElement("div"));
  col.className = "col right";
  return { root, col };
}

test("renderTokenHUD: one 'Edit prompt' button on a marker's HUD; none on others; a click opens the box", async () => {
  const m1 = F.s1.tokens.get("m1");
  const { root, col } = hud();
  F.fire("renderTokenHUD", { object: { document: m1 } }, root);
  F.fire("renderTokenHUD", { object: { document: m1 } }, [root]);   // jQuery-style, already has one
  assert.equal(col.children.length, 1);
  const btn = col.children[0];
  assert.deepEqual({ tag: btn.tagName, type: btn.type, cls: btn.className, tip: btn.dataset.tooltip, aria: btn.attrs["aria-label"], html: btn.innerHTML },
    { tag: "BUTTON", type: "button", cls: "control-icon pp-hud-btn", tip: "Edit prompt", aria: "Edit prompt", html: '<i class="fa-solid fa-comment-dots"></i>' });
  const plain = hud();
  F.fire("renderTokenHUD", { document: F.s1.tokens.get("tokOrdinary00001") }, plain.root);
  assert.equal(plain.col.children.length, 0);
  const n0 = opened();
  let stopped = 0;
  btn.dispatch("click", { preventDefault: () => stopped++, stopPropagation: () => stopped++ });
  await flush();
  assert.equal(stopped, 2);
  assert.equal(opened(), n0 + 1);
  assert.equal(PromptDialog.current.edits(m1), true);
  await PromptDialog.current.close();
  // a throw is warned, not raised
  const bad = { querySelector() { throw new Error("boom"); } };
  Object.setPrototypeOf(bad, FakeElement.prototype);
  const { out } = await captureConsole(() => F.fire("renderTokenHUD", { object: { document: m1 } }, bad));
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | HUD button skipped Error(boom)"]);
});

/* ── hover tip ──────────────────────────────────────────────────────────── */

test("hoverToken: a tip with the text, size and footprint, then 'sees N' a tick later; it goes on unhover, pan, teardown, dialog render, delete", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m1 = F.s1.tokens.get("m1");
  const body = F.dom.document.body;
  F.fire("hoverToken", { id: "m1", document: m1 }, true);
  assert.equal(body.children.length, 1);
  const tip = body.children[0];
  assert.equal(tip.className, "pentaryn-prompts-tip");
  assert.equal(tip.innerHTML, `<div class="pp-tip-text">a lantern</div>
    <div class="pp-tip-meta">mid · Medium 5x5 ft · <span data-sees>…</span></div>`);
  assert.deepEqual(tip.style, { left: `${Math.round(300 / 2 + 10 + 12)}px`, top: `${Math.round(200 / 2 + 20)}px` });
  t.mock.timers.tick(0);
  assert.equal(tip.querySelector("[data-sees]").textContent, "sees 2");
  for (const hook of [["hoverToken", { id: "m1", document: m1 }, false], ["canvasPan"], ["canvasTearDown"], ["renderPromptDialog"], ["deleteToken", m1]]) {
    F.fire("hoverToken", { id: "m1", document: m1 }, true);
    const cur = body.children.at(-1);
    F.fire(...hook);
    assert.equal(cur.removed, true, `${hook[0]} hides the tip`);
  }
  // unhovering a different token leaves the tip alone
  F.fire("hoverToken", { id: "m1", document: m1 }, true);
  const keep = body.children.at(-1);
  F.fire("hoverToken", { id: "m2", document: F.s1.tokens.get("m2") }, false);
  assert.equal(keep.removed, false);
  F.fire("canvasPan");
  // an empty marker shows the (empty) line; a long text is cut at 600 with an ellipsis; an ordinary token shows nothing
  const m2 = F.s1.tokens.get("m2");
  const saved = m2.flags[MODULE].prompt;
  m2.flags[MODULE].prompt = "";
  F.fire("hoverToken", { id: "m2", document: m2 }, true);
  assert.match(body.children.at(-1).innerHTML, /^<div class="pp-tip-text"><em>\(empty\)<\/em><\/div>/);
  m2.flags[MODULE].prompt = `${"word ".repeat(200)}`;
  F.fire("hoverToken", { id: "m2", document: m2 }, true);
  assert.match(body.children.at(-1).innerHTML, /^<div class="pp-tip-text">(word ){119}word…<\/div>/);
  m2.flags[MODULE].prompt = saved;
  F.fire("canvasPan");
  const before = body.children.length;
  F.fire("hoverToken", { id: "tokOrdinary00001", document: F.s1.tokens.get("tokOrdinary00001") }, true);
  assert.equal(body.children.length, before);
});

test("hoverToken: no tip while that marker's own box is open; none for a player", async () => {
  const m1 = F.s1.tokens.get("m1");
  await PromptDialog.open(m1);
  const before = F.dom.document.body.children.length;
  F.fire("hoverToken", { id: "m1", document: m1 }, true);
  assert.equal(F.dom.document.body.children.length, before);
  await PromptDialog.current.close();
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  F.fire("hoverToken", { id: "m1", document: m1 }, true);
  assert.equal(F.dom.document.body.children.length, before);
  F.game.user = gm;
});

/* ── panel refresh hooks ────────────────────────────────────────────────── */

test("wall, door, note and token hooks refresh the open box's panel (250 ms debounce); a token update only when it moved or renamed", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const m1 = F.s1.tokens.get("m1");
  const app = await PromptDialog.open(m1);
  t.mock.timers.tick(16);
  await flush();
  const panel = () => app.element.querySelector("[data-panel]").innerHTML;
  const first = panel();
  assert.match(first, /^<header class="pp-head"><span>In sight · 2<\/span><span class="pp-map">100 × 50 ft<\/span><\/header>/);
  const wall = { parent: F.s1 };
  for (const h of ["createWall", "updateWall", "deleteWall", "createNote", "deleteNote"]) {
    app.element.querySelector("[data-panel]").innerHTML = "stale";
    F.fire(h, wall);
    t.mock.timers.tick(249);
    assert.equal(panel(), "stale", `${h}: debounced`);
    t.mock.timers.tick(1);
    await flush();
    assert.equal(panel(), first, `${h}: redrawn`);
  }
  app.element.querySelector("[data-panel]").innerHTML = "stale";
  // [declared] PT 2026-10-12 (DP8 live check): a rename now redraws (panel-refresh.test); a change
  // no row shows still does not
  F.fire("updateToken", F.s1.tokens.get("m2"), { flags: { x: 1 } });
  t.mock.timers.tick(300);
  await flush();
  assert.equal(panel(), "stale");
  F.fire("updateToken", F.s1.tokens.get("m2"), { level: "L2" });
  t.mock.timers.tick(250);
  await flush();
  assert.equal(panel(), first);
  // another scene's change, or a doc with no parent: nothing, no throw
  app.element.querySelector("[data-panel]").innerHTML = "stale";
  F.fire("createWall", { parent: { id: "other" } });
  F.fire("createWall", {});
  t.mock.timers.tick(300);
  await flush();
  assert.equal(panel(), "stale");
  await app.close();
  assert.deepEqual(F.hookErrors, []);
});

/* ── keybindings ────────────────────────────────────────────────────────── */

test("keybinding place: a default-size marker under the cursor, snapped, the box opened; false for a player or no canvas", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const place = F.game.keybindings.actions.get("pentaryn-prompts.place");
  const n0 = opened();
  assert.equal(place.onDown(), true);
  await flush(); await flush();
  const create = F.calls.filter(c => c.op === "createEmbeddedDocuments").at(-1);
  pinJSON("place-token-data", { data: create.data, options: create.options }, import.meta.url);
  assert.equal(opened(), n0 + 1);
  const app = PromptDialog.current;
  assert.equal(app.renders.at(-1).context.size, "mid");
  await app.close();
  // empty and fresh: deleted on close
  assert.equal(F.s1.tokens.get(app.token?.id ?? "gone"), undefined);
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  assert.equal(place.onDown(), false);
  F.game.user = gm;
  F.canvas.ready = false;
  assert.equal(place.onDown(), false);
  F.canvas.ready = true;
  t.mock.timers.tick(4000);
});

test("keybinding edit: opens the hovered marker's box; false when nothing or a non-marker is hovered", async () => {
  const edit = F.game.keybindings.actions.get("pentaryn-prompts.edit");
  F.canvas.tokens.hover = null;
  assert.equal(edit.onDown(), false);
  F.canvas.tokens.hover = { document: F.s1.tokens.get("tokOrdinary00001") };
  assert.equal(edit.onDown(), false);
  F.canvas.tokens.hover = { document: F.s1.tokens.get("m2") };
  assert.equal(edit.onDown(), true);
  await flush();
  assert.equal(PromptDialog.current.edits(F.s1.tokens.get("m2")), true);
  await PromptDialog.current.close();
  F.canvas.tokens.hover = null;
});

/* ── the double-click wrap ─────────────────────────────────────────────── */

test("double-click on a marker opens its box instead of the sheet (GM only)", async () => {
  const proto = F.CONFIG.Token.objectClass.prototype;
  const m1 = F.s1.tokens.get("m1");
  const n0 = F.calls.length;
  assert.equal(proto._onClickLeft2.call({ document: m1 }, {}), undefined);
  await flush();
  assert.equal(F.calls.slice(n0).some(c => c.op === "Token#_onClickLeft2 (original)"), false);
  assert.equal(PromptDialog.current.edits(m1), true);
  await PromptDialog.current.close();
  const gm = F.game.user;
  F.game.user = { id: "player0000000001", isGM: false };
  assert.equal(proto._onClickLeft2.call({ document: m1 }, {}), "original");
  F.game.user = gm;
});

/* ── api.open / api.place ───────────────────────────────────────────────── */

test("api.open: a token id on the viewed scene or any scene, a document, a placeable; null for an unknown id", async () => {
  const api = F.game.pentaryn.prompts;
  for (const ref of ["m1", F.s1.tokens.get("m1"), { document: F.s1.tokens.get("m1") }]) {
    const app = await api.open(ref);
    assert.equal(app.edits(F.s1.tokens.get("m1")), true);
    await app.close();
  }
  F.canvas.scene = null;
  const app = await api.open("m2");
  assert.equal(app.edits(F.s1.tokens.get("m2")), true);
  await app.close();
  F.canvas.scene = F.s1;
  assert.equal(await api.open("nope"), null);
});

test("api.place(size): that size (an unknown size falls back to the client default), level and elevation from the canvas level", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const api = F.game.pentaryn.prompts;
  F.canvas.level = { id: "L1", elevation: { base: 10 } };
  const tok = await api.place("large");
  const data = F.calls.filter(c => c.op === "createEmbeddedDocuments").at(-1).data[0];
  assert.deepEqual([data.actorId, data.x, data.y, data.elevation, data.level, "_id" in data], ["markerActorlarge", 450, 250, 10, "L1", false]);
  await PromptDialog.current.close();
  assert.equal(F.s1.tokens.get(tok.id), undefined, "fresh and empty: removed on close");
  F.canvas.level = null;
  const tok2 = await api.place("bogus");
  assert.equal(F.calls.filter(c => c.op === "createEmbeddedDocuments").at(-1).data[0].actorId, "markerActormid00");
  assert.equal("level" in F.calls.filter(c => c.op === "createEmbeddedDocuments").at(-1).data[0], false);
  await PromptDialog.current.close();
  assert.equal(F.s1.tokens.get(tok2.id), undefined);
  t.mock.timers.tick(4000);
});

test("api.place: no marker actor → a warning and null; a failed create → console error and null; no scene → null", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
  const api = F.game.pentaryn.prompts;
  const xl = F.game.actors.get("markerActorxl000");
  F.game.actors.delete(xl.id);
  assert.equal(await api.place("xl"), null);
  assert.deepEqual(F.calls.at(-1), { op: "notify", level: "warn", message: "No \"Prompt · xl\" actor in this world. Reload as GM to recreate it." });
  F.game.actors.set(xl.id, xl);
  F.s1.fail.Token = "all";
  const { value, out } = await captureConsole(() => api.place("mid"));
  delete F.s1.fail.Token;
  assert.equal(value, null);
  assert.deepEqual(out.map(o => o.text), ["pentaryn-prompts | placing a prompt marker failed Error(stub: Token create refused)"]);
  F.canvas.scene = null;
  assert.equal(await api.place("mid"), null);
  F.canvas.scene = F.s1;
  t.mock.timers.tick(4000);
});

/* ── load-order and patch variants (fresh entry imports) ────────────────── */

async function freshEntry(tag, setup = () => {}) {
  const W = await installWorld();
  setup(W);
  const { out: importOut } = await captureConsole(() => import(`../prompts.mjs?${tag}`));
  W.fire("init");
  const { out } = await captureConsole(() => W.fire("setup"));
  return { W, out: [...importOut, ...out] };
}

test("setup with lib-wrapper active: registered MIXED on the configured class path", async () => {
  const regs = [];
  const { W, out } = await freshEntry("libwrapper", W => {
    W.game.modules.set("lib-wrapper", { id: "lib-wrapper", active: true });
    globalThis.libWrapper = { register: (...a) => regs.push(a) };
  });
  delete globalThis.libWrapper;
  assert.deepEqual(out, []);
  assert.deepEqual(regs.map(r => [r[0], r[1], typeof r[2], r[3]]), [[MODULE, "CONFIG.Token.objectClass.prototype._onClickLeft2", "function", "MIXED"]]);
  // the wrapper: a marker is intercepted, anything else calls wrapped
  const calls = [];
  const wrapped = ev => (calls.push(ev), "wrapped");
  assert.equal(regs[0][2].call({ document: W.s1.tokens.get("tokOrdinary00001") }, wrapped, "e1"), "wrapped");
  assert.equal(regs[0][2].call({ document: W.s1.tokens.get("m1") }, wrapped, "e2"), undefined);
  assert.deepEqual(calls, ["e1"]);
});

test("setup: a throwing libWrapper.register warns and wraps by hand; a missing method warns and leaves double-click alone", async () => {
  const a = await freshEntry("libwrapper-throws", W => {
    W.game.modules.set("lib-wrapper", { id: "lib-wrapper", active: true });
    globalThis.libWrapper = { register: () => { throw new Error("nope"); } };
  });
  delete globalThis.libWrapper;
  assert.deepEqual(a.out.map(o => [o.level, o.text]), [["warn", "pentaryn-prompts | libWrapper registration failed, wrapping by hand Error(nope)"]]);
  assert.notEqual(a.W.CONFIG.Token.objectClass.prototype._onClickLeft2.name, "original");
  const b = await freshEntry("no-method", W => { delete W.CONFIG.Token.objectClass.prototype._onClickLeft2; });
  assert.deepEqual(b.out.map(o => [o.level, o.text]), [["warn", "pentaryn-prompts | Token#_onClickLeft2 not found; double-click will open the sheet"]]);
});

test("ready with no game.pentaryn: the root is created; with a frozen root the publish fails with one error line (DP1)", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const a = await freshEntry("no-root");
  delete a.W.game.pentaryn;
  await captureConsole(async () => { a.W.fire("ready"); await flush(); });
  t.mock.timers.tick(0);
  assert.equal(typeof a.W.game.pentaryn.prompts.gather, "function");
  const b = await freshEntry("frozen-root");
  b.W.game.pentaryn = Object.freeze({ importer: {} });
  const { out } = await captureConsole(async () => { b.W.fire("ready"); await flush(); });
  // [declared] DP1: the synchronous publish throws inside ready, is logged, and the markers are still ensured
  assert.deepEqual(out.map(o => [o.level, o.text.split(" Error(")[0]]), [["error", "pentaryn-prompts | publish failed"]]);
  t.mock.timers.tick(0);
  assert.equal(b.W.game.pentaryn.prompts, undefined);
});

test("ready: an ensureMarkers throw is logged 'ensureMarkers failed'", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const { W } = await freshEntry("ensure-throws");
  W.game.folders = null;
  const { out } = await captureConsole(async () => { W.fire("ready"); await flush(); });
  t.mock.timers.tick(0);
  assert.deepEqual(out.map(o => [o.level, o.text.split(" Error(")[0]]), [["error", "pentaryn-prompts | ensureMarkers failed"]]);
});
