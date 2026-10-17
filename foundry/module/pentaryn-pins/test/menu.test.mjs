// Glue for the GM-side features (plan §3 "Pins tests", glue cases 16–19): the "Pinned to" sheet
// badge, and the GM right-click canvas menu (event order on Windows and macOS, every gate, Prompt
// note through pentaryn-prompts' `place`, Teleport through pentaryn-portals' `teleportToken`).
// The DOM is the small stand-in in fixtures/dom.mjs; prompts and portals are stubs of their
// published shapes (portals' is pinned by its describe golden: teleportToken's row).
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { IDS, flush, pinsWorld } from "./fixtures/actors.mjs";
import { FakeElement, dispatch, installDom } from "./fixtures/dom.mjs";
import { makeUser } from "./kit/foundry-stub.mjs";
import { MODULE } from "../pins-core.mjs";

const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);
console.info = () => undefined;
const { doc, board, wrap } = installDom();

const placed = [];
const teleported = [];
let portalsAnswer = null;
/** pentaryn-portals' teleportToken success: the keys the menu toast reads, checked against portals' describe golden below. */
const portalsOk = (token, opts) => ({ ok: true, token: { documentName: "Token", id: token.id, uuid: token.uuid, name: token.name },
  from: token.parent.id, to: { scene: opts.scene, x: opts.x, y: opts.y, level: opts.level },
  followers: [{ id: "spiritTok0000001", name: "Spirit" }], moved: 2 });
game.modules.set("pentaryn-prompts", { id: "pentaryn-prompts", active: true, api: { place: (size, opts) => { placed.push([size, opts]); return {}; } } });
game.modules.set("pentaryn-portals", { id: "pentaryn-portals", active: true, api: {
  teleportToken: async (token, opts) => {
    teleported.push([token.uuid, opts]);
    return portalsAnswer ?? portalsOk(token, opts);
  },
} });

// PIXI's EventSystem: a capture pointerdown on #board added when the renderer is made, long before
// canvasReady. A right press claims the stage's MouseInteractionManager (canvas.currentMouseManager)
// BEFORE any #board listener pins could add later runs; the up releases it.
board.addEventListener("pointerdown", ev => {
  if (ev.button === 2 && canvas.currentMouseManager == null) canvas.currentMouseManager = { stage: true, state: 2 };
}, true);
board.addEventListener("pointerup", ev => {
  if (ev.button === 2 && canvas.currentMouseManager?.stage) canvas.currentMouseManager = null;
}, true);

await import("../pins.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");
const B = game.scenes.get(IDS.sceneB);
Object.assign(canvas, { ready: true, scene: B, level: { id: IDS.levelB2 } });
F.fire("canvasReady", canvas);

const toasts = () => F.calls.filter(c => c.op === "notify").map(c => [c.level, c.message]);
const menuEl = () => doc.body.querySelector("nav.ppi-menu");
const close = () => dispatch(doc.body, "keydown", { key: "Escape" });

/** A right click at (x, y) released at (x + dx, y + dy), in Windows (up, contextmenu) or macOS (contextmenu, up) order. */
function rightClick({ x = 400, y = 300, dx = 0, dy = 0, order = "win", buttons = 2, target = board } = {}) {
  dispatch(board, "pointerdown", { button: 2, buttons, clientX: x, clientY: y });
  const up = () => dispatch(board, "pointerup", { button: 2, buttons: 0, clientX: x + dx, clientY: y + dy });
  const cm = () => dispatch(target, "contextmenu", { button: 2, clientX: x, clientY: y });
  if (order === "win") { up(); cm(); } else { cm(); up(); }
}

/* ── sheet badge (case 16) ─────────────────────────────────────────────── */

function sheetFor(actorId) {
  const element = new FakeElement("div", doc);
  const header = new FakeElement("header", doc);
  header.className = "window-header";
  const title = new FakeElement("h1", doc);
  title.className = "window-title";
  const toggle = new FakeElement("button", doc);
  toggle.dataset.action = "toggleControls";
  header.append(title, toggle);
  element.appendChild(header);
  const actor = game.actors.get(actorId);
  return { app: { actor, document: actor, element, rendered: true }, header };
}
const render = s => F.fire("renderBaseActorSheet", s.app, s.app.element, {}, {});
const badges = s => s.header.querySelectorAll(".ppi-pinned");

test("16 sheet badge: before the header controls, idempotent, hidden while off, text not HTML, on a form's sheet", async () => {
  const talo = sheetFor(IDS.talo);
  render(talo);
  render(talo);
  assert.equal(badges(talo).length, 1, "one badge across re-renders");
  const [badge] = badges(talo);
  assert.equal(badge.textContent, "Pinned to Talo's player");
  assert.equal(badge.getAttribute("aria-label"), "Pinned to Talo's player");
  assert.equal(talo.header.children.indexOf(badge), 1, "after the title, before the controls");
  assert.equal(talo.header.children[2].dataset.action, "toggleControls");

  const mira = sheetFor(IDS.mira);
  render(mira);
  assert.equal(badges(mira).length, 0, "Mira is not pinned");

  const wolf = sheetFor(IDS.wolf);
  render(wolf);
  assert.equal(badges(wolf)[0]?.textContent, "Pinned to Talo's player", "a wild-shaped form's sheet");

  const user = game.users.get(IDS.taloUser);
  user.name = "<img src=x onerror=alert(1)>";
  render(talo);
  const [b2] = badges(talo);
  assert.equal(b2.textContent, "Pinned to <img src=x onerror=alert(1)>");
  assert.deepEqual(b2.children.map(c => c.tagName), ["I", "SPAN"], "no element made from the name");
  user.name = "Talo's player";

  const r = game.settings.settings.get(`${MODULE}.pinning`);
  const onChange = r.onChange;
  r.onChange = undefined;
  await game.settings.set(MODULE, "pinning", false);
  render(talo);
  assert.equal(badges(talo).length, 0, "hidden while the switch is off");
  await game.settings.set(MODULE, "pinning", true);
  r.onChange = onChange;
  assert.deepEqual(consoleLines, []);
});

test("16 open sheets refresh their badge by themselves, in place (review F2: never a full app.render): the switch flips, the pin changes, the pinned user is renamed, promoted or deleted", async () => {
  const talo = sheetFor(IDS.talo);
  const wolf = sheetFor(IDS.wolf);
  let renders = 0;
  for (const s of [talo, wolf]) s.app.render = () => { renders++; render(s); };
  const closed = sheetFor(IDS.talo);
  Object.assign(closed.app, { rendered: false, render: () => assert.fail("a closed sheet is not rendered") });
  const journal = { document: { documentName: "JournalEntry" }, rendered: true, render: () => assert.fail("only actor sheets") };
  foundry.applications.instances = new Map([["a", talo.app], ["b", wolf.app], ["c", closed.app], ["d", journal]]);
  const r = game.settings.settings.get(`${MODULE}.pinning`);
  const flip = async value => {
    const onChange = r.onChange;
    r.onChange = undefined;
    await game.settings.set(MODULE, "pinning", value);
    r.onChange = onChange;
    onChange(value, {}, IDS.gm);
  };
  const user = game.users.get(IDS.taloUser);
  const text = s => badges(s).map(b => b.textContent);
  try {
    render(talo);
    render(wolf);
    await flip(false);
    assert.deepEqual([text(talo), text(wolf)], [[], []], "switched off: both badges gone");
    await flip(true);
    assert.deepEqual([text(talo), text(wolf)], [["Pinned to Talo's player"], ["Pinned to Talo's player"]]);
    const pin = user.flags[MODULE];
    delete user.flags[MODULE];
    F.fire("updateUser", user, { flags: { [MODULE]: { "-=actor": null } } }, {}, IDS.gm);
    assert.deepEqual(text(talo), [], "unpinned");
    user.flags[MODULE] = pin;
    F.fire("updateUser", user, { flags: { [MODULE]: { actor: IDS.talo } } }, {}, IDS.gm);
    assert.deepEqual(text(talo), ["Pinned to Talo's player"], "pinned again");
    user.name = "Talo (Sam)";
    F.fire("updateUser", user, { name: "Talo (Sam)" }, {}, IDS.gm);
    assert.deepEqual(text(talo), ["Pinned to Talo (Sam)"], "renamed");
    user.name = "Talo's player";
    F.fire("updateUser", user, { name: "Talo's player" }, {}, IDS.gm);
    user.isGM = true;
    F.fire("updateUser", user, { role: 4 }, {}, IDS.gm);
    assert.deepEqual(text(talo), [], "promoted to GM: not a pinned player");
    user.isGM = false;
    F.fire("updateUser", user, { role: 1 }, {}, IDS.gm);
    game.users.delete(IDS.taloUser);
    F.fire("deleteUser", user, {}, IDS.gm);
    assert.deepEqual(text(talo), [], "deleted");
    game.users.set(IDS.taloUser, user);
    F.fire("updateUser", user, { flags: { [MODULE]: { actor: IDS.talo } } }, {}, IDS.gm);
    const [kept] = badges(talo);
    F.fire("updateUser", game.users.get(IDS.miraUser), { name: "Mira" }, {}, IDS.gm);
    F.fire("updateUser", user, { flags: { other: {} } }, {}, IDS.gm);
    assert.equal(badges(talo)[0], kept, "an unpinned user renamed, another flag scope: no refresh");
    render(talo);
    assert.deepEqual(text(talo), ["Pinned to Talo's player"]);
    assert.equal(renders, 0, "F2: no open sheet was fully re-rendered");
    assert.equal(badges(closed).length, 0, "a closed sheet is not touched");
  } finally {
    delete foundry.applications.instances;
  }
});

/* ── the menu (cases 17–19) ────────────────────────────────────────────── */

const pins = () => ({ root: doc.documentElement.listeners });
test("17 binding: capture pointerdown/pointermove ABOVE #board (before PIXI's), capture pointerup on #board, a bubble contextmenu on its parent; once per board", () => {
  assert.deepEqual(board.listeners.slice(2).map(l => [l.type, l.capture]), [["pointerup", true]]);
  assert.deepEqual(pins().root.filter(l => l.capture).map(l => l.type).sort(), ["keydown", "pointerdown", "pointerdown", "pointermove"]);
  assert.deepEqual(wrap.listeners.filter(l => l.type === "contextmenu").map(l => l.capture), [false]);
  F.fire("canvasReady", canvas);
  assert.equal(board.listenerCount("pointerup"), 2, "dataset.ppiBound: bound once (PIXI's and pins')");
  assert.equal(pins().root.filter(l => l.type === "pointermove").length, 1);
});

test("17 Windows order (down, up, contextmenu) with no drag opens it, although PIXI claimed the stage's mouse manager first", () => {
  rightClick({ order: "win" });
  const nav = menuEl();
  assert.ok(nav, "the menu is open");
  assert.deepEqual([nav.style.left, nav.style.top], ["400px", "300px"]);
  const ev = close();
  assert.equal(menuEl(), null, "Escape closes it");
  assert.equal(ev.stopped, true, "… and stops there: core's Dismiss would close every open window");
  assert.equal(ev.defaultPrevented, true);
  assert.equal(close().stopped, false, "with no menu open, Escape is core's");
});

test("17 macOS order (down, contextmenu, up) opens it at the up", () => {
  dispatch(board, "pointerdown", { button: 2, buttons: 2, clientX: 50, clientY: 60 });
  dispatch(board, "contextmenu", { button: 2, clientX: 50, clientY: 60 });
  assert.equal(menuEl(), null, "not at the contextmenu: the up decides the distance");
  dispatch(board, "pointerup", { button: 2, clientX: 52, clientY: 61 });
  assert.deepEqual([menuEl()?.style.left, menuEl()?.style.top], ["52px", "61px"]);
  dispatch(doc.body, "pointerdown", { button: 0 });
  assert.equal(menuEl(), null, "a pointerdown outside closes it");
});

test("17 refusals: a right-drag pan, a chord, a live drag, a stale record, a token, a badge, a player, off, another layer", async () => {
  const refuse = (why, opts = {}) => {
    rightClick(opts);
    assert.equal(menuEl(), null, why);
  };
  refuse("a 30 px drag, Windows order", { dx: 30 });
  refuse("a 10 px drag (core pans from 10 px)", { dx: 10 });
  refuse("a 30 px drag, macOS order", { dx: 0, dy: 30, order: "mac" });
  refuse("a right press chorded into a left drag", { buttons: 3 });

  canvas.currentMouseManager = { state: 2 };
  dispatch(board, "pointerdown", { button: 2, buttons: 2, clientX: 1, clientY: 1 });
  canvas.currentMouseManager = null;                 // core cancels the drag at contextmenu, first
  dispatch(board, "pointerup", { button: 2, clientX: 1, clientY: 1 });
  dispatch(board, "contextmenu", {});
  assert.equal(menuEl(), null, "a drag live at the down");

  dispatch(board, "pointerdown", { button: 2, buttons: 2, clientX: 400, clientY: 300 });
  dispatch(board, "pointermove", { clientX: 700, clientY: 300 });
  dispatch(board, "pointerup", { button: 2, clientX: 401, clientY: 300 });
  dispatch(board, "contextmenu", {});
  assert.equal(menuEl(), null, "a 300 px pan that came back to where it started");

  canvas.tokens._placementContext = { index: 0 };     // dnd5e TokenPlacement → canvas.tokens.placeTokens
  refuse("core's token placement: the right click skipped a summon preview");
  delete canvas.tokens._placementContext;
  canvas.regions = { _placementContext: { shape: "circle" } };
  refuse("core's region placement");
  delete canvas.regions;

  rightClick({ dx: 40 });                             // refused and cleared …
  dispatch(board, "contextmenu", {});                 // … so a later lone contextmenu cannot pass
  dispatch(board, "pointerup", { button: 2, clientX: 400, clientY: 300 });
  assert.equal(menuEl(), null, "a stale record after a refused contextmenu");

  const under = (x, y) => x === 400 && y === 300;
  canvas.tokens.placeables = [{ bounds: { contains: under } }];
  refuse("on a token (the HUD's)");
  canvas.tokens.placeables = [{ bounds: { contains: under }, document: { hidden: true, level: IDS.levelB2 }, visible: true, isVisible: true }];
  refuse("on a hidden token the GM sees");
  canvas.tokens.placeables = [];

  canvas.walls.placeables = [{ isDoor: true, doorControl: { visible: true }, midpoint: [410, 310] }];
  refuse("on a door control");
  canvas.walls.placeables = [];

  const stop = ev => ev.stopPropagation();          // pentaryn-portals' badge listener (capture, stops)
  board.addEventListener("contextmenu", stop, true);
  refuse("on a portal badge (propagation stopped before the parent)");
  board.removeEventListener("contextmenu", stop, true);

  F.become({ userId: IDS.taloUser });
  refuse("a player");
  F.become({ userId: IDS.gm });

  canvas.tokens.active = false;
  refuse("another layer");
  canvas.tokens.active = true;

  const r = game.settings.settings.get(`${MODULE}.pinning`);
  const onChange = r.onChange;
  r.onChange = undefined;
  await game.settings.set(MODULE, "pinning", false);
  // review F4: with a cheap gate closed the hit test (a walk of every token and door) never runs
  const tokensLayer = canvas.tokens;
  let walked = 0;
  const placeables = Object.getOwnPropertyDescriptor(tokensLayer, "placeables");
  Object.defineProperty(tokensLayer, "placeables", { configurable: true, get: () => { walked++; return placeables?.get ? placeables.get.call(tokensLayer) : placeables?.value ?? []; } });
  try {
    refuse("the switch is off");
    assert.equal(walked, 0, "F4: no hit test while the switch is off");
  } finally {
    if (placeables) Object.defineProperty(tokensLayer, "placeables", placeables);
    else delete tokensLayer.placeables;
  }
  await game.settings.set(MODULE, "pinning", true);
  r.onChange = onChange;

  rightClick();
  assert.ok(menuEl(), "and a plain right click still opens it");
  close();
});

test("17 opens on what the GM sees as empty floor: a token on another level, one not drawn here; a 7 px drift", () => {
  const under = { contains: (x, y) => x === 400 && y === 300 };
  const opens = (why, opts = {}) => {
    rightClick(opts);
    assert.ok(menuEl(), why);
    close();
  };
  canvas.tokens.placeables = [{ bounds: under, document: { level: IDS.levelB1 }, visible: false, isVisible: false }];
  opens("a ground-floor goblin under the upper floor the GM views");
  canvas.tokens.placeables = [{ bounds: under, document: { level: IDS.levelB2 }, visible: false, isVisible: false }];
  opens("a monster out of the controlled PC's sight, or filtered out");
  canvas.tokens.placeables = [];
  opens("a press that drifted 7 px (core does not pan below 10)", { dx: 7 });
});

test("17 the menu closes on a canvas pan (wheel zoom, keyboard pan): its items act on the point it opened at", () => {
  rightClick();
  assert.ok(menuEl());
  F.fire("canvasPan", canvas, { x: 0, y: 0, scale: 1 });
  assert.equal(menuEl(), null);
});

test("17 near the window's edge: the menu is shifted inside and the submenu flips left and up", () => {
  FakeElement.sizes.NAV = { w: 220, h: 60 };
  try {
    rightClick({ x: 1800, y: 1050 });
    const nav = menuEl();
    assert.deepEqual([nav.style.left, nav.style.top], ["1696px", "1016px"]);
    assert.deepEqual(["ppi-flip-x", "ppi-flip-y"].map(c => nav.classList.contains(c)), [true, true]);
    close();
    rightClick({ x: 400, y: 300 });
    assert.deepEqual([menuEl().style.left, menuEl().style.top], ["400px", "300px"]);
    assert.deepEqual(["ppi-flip-x", "ppi-flip-y"].map(c => menuEl().classList.contains(c)), [false, false]);
    close();
  } finally {
    delete FakeElement.sizes.NAV;
  }
});

const items = () => menuEl().querySelectorAll("a.ppi-item");
const labelOf = a => a.querySelector("span.ppi-label")?.textContent;
const click = a => dispatch(a, "click", {});

test("18 Prompt note calls prompts' place(null, { at }) with the clicked CANVAS point; hidden without prompts", async () => {
  canvas.offset = { x: 1000, y: 2000 };
  rightClick({ x: 400, y: 300 });
  const prompt = items().find(a => labelOf(a) === "Prompt note");
  assert.ok(prompt);
  click(prompt);
  assert.equal(menuEl(), null, "closed before the action runs");
  await flush();
  assert.deepEqual(placed, [[null, { at: { x: 1400, y: 2300 } }]]);
  canvas.offset = { x: 0, y: 0 };

  const prompts = game.modules.get("pentaryn-prompts");
  game.modules.delete("pentaryn-prompts");
  rightClick();
  assert.equal(items().some(a => labelOf(a) === "Prompt note"), false, "hidden without prompts");
  assert.equal(items().some(a => labelOf(a) === "Teleport pinned character"), true);
  close();
  game.modules.set("pentaryn-prompts", prompts);
});

test("19 Teleport ▸ lists only logged-in players; a pick calls portals teleportToken with { x, y, scene, level, pull: [the player] }", async () => {
  game.users.get(IDS.miraUser).active = false;
  game.users.set("zedUser000000001", makeUser({ id: "zedUser000000001", name: "Zed" }));
  rightClick({ x: 700, y: 800 });
  const sub = menuEl().querySelector("div.ppi-sub").querySelectorAll("a.ppi-item");
  assert.deepEqual(sub.map(labelOf), ["Talo's player — Talo", "Zed"]);
  assert.equal(sub[1].classList.contains("ppi-disabled"), true);
  assert.equal(sub[1].querySelector("span.ppi-note").textContent, "no pin");
  click(sub[1]);
  assert.ok(menuEl(), "a disabled row does nothing");
  click(sub[0]);
  assert.equal(menuEl(), null);
  await flush();
  await flush();
  assert.deepEqual(teleported, [[`Scene.${IDS.sceneB}.Token.${IDS.taloTok}`,
    { x: 700, y: 800, scene: IDS.sceneB, level: IDS.levelB2, pull: [IDS.taloUser], dryRun: false }]]);
  assert.deepEqual(toasts().at(-1), ["info", "Talo (+1) → Lighthouse"]);
  game.users.delete("zedUser000000001");
  game.users.get(IDS.miraUser).active = true;
});

test("19 a wild-shaped PC is still offered, under the original's name, and its form token is the one moved", async () => {
  const tok = B.tokens.get(IDS.taloTok);
  tok.actorId = IDS.wolf;
  tok.flags = { dnd5e: { originalActor: IDS.talo } };
  teleported.length = 0;
  rightClick();
  const row = menuEl().querySelector("div.ppi-sub").querySelectorAll("a.ppi-item").find(a => labelOf(a).startsWith("Talo's player"));
  assert.equal(labelOf(row), "Talo's player — Talo");
  assert.equal(row.classList.contains("ppi-disabled"), false);
  click(row);
  await flush();
  await flush();
  assert.equal(teleported[0][0], tok.uuid);
  tok.actorId = IDS.talo;
  tok.flags = {};
});

test("19 a failed teleport toasts why (reason, else code); the success keys the toast reads are portals' documented ones", async () => {
  const pickTalo = async () => {
    rightClick();
    click(menuEl().querySelector("div.ppi-sub").querySelectorAll("a.ppi-item").find(a => labelOf(a).startsWith("Talo's player")));
    await flush();
    await flush();
  };
  portalsAnswer = { ok: false, code: "CONFLICT", reason: "another session moved it first" };
  await pickTalo();
  assert.deepEqual(toasts().at(-1), ["warn", "Talo's player — Talo not moved: another session moved it first"]);
  portalsAnswer = { ok: false, code: "REFUSED" };
  await pickTalo();
  assert.deepEqual(toasts().at(-1), ["warn", "Talo's player — Talo not moved: REFUSED"]);
  portalsAnswer = null;
  assert.equal(consoleLines.filter(([level, line]) => level === "warn" && /not moved/.test(line)).length, 2);
  consoleLines.length = 0;                           // the two expected warn toasts, logged
});

test("contract: the portals stub's success keys are the ones portals' describe golden documents for teleportToken", t => {
  const golden = new URL("../../pentaryn-portals/test/golden/describe.json", import.meta.url);
  if (!existsSync(golden)) return t.skip("pentaryn-portals is not beside this module");
  const row = JSON.parse(readFileSync(golden, "utf8")).methods.find(m => m.path === "teleportToken");
  const ok = row.returns.split(" | { ok: false")[0];
  const stub = portalsOk({ id: "x", uuid: "x", name: "x", parent: { id: "s" } }, {});
  for (const key of Object.keys(stub)) assert.match(ok, new RegExp(`\\b${key}\\b`), key);
  for (const key of Object.keys(stub.token)) assert.match(ok, new RegExp(`\\b${key}\\b`), `token.${key}`);
  assert.match(ok, /followers: \[\{ id, name \}\]/, "the menu counts followers");
});

test("19 wild-shaped the dnd5e 6.0.6 linked way (token → form actor, actorLink, NO token flag): still offered, the form token moved", async () => {
  const tok = B.tokens.get(IDS.taloTok);
  tok.actorId = IDS.wolf;
  tok.actorLink = true;
  tok.flags = {};
  teleported.length = 0;
  rightClick();
  const row = menuEl().querySelector("div.ppi-sub").querySelectorAll("a.ppi-item").find(a => labelOf(a).startsWith("Talo's player"));
  assert.equal(labelOf(row), "Talo's player — Talo");
  assert.equal(row.classList.contains("ppi-disabled"), false);
  click(row);
  await flush();
  await flush();
  assert.equal(teleported[0]?.[0], tok.uuid);
  tok.actorId = IDS.talo;
});

test("canvasTearDown closes the menu; no errors on the way", () => {
  rightClick();
  assert.ok(menuEl());
  F.fire("canvasTearDown", canvas);
  assert.equal(menuEl(), null);
  assert.deepEqual(F.hookErrors, []);
  assert.deepEqual(consoleLines, []);
});

test("uninstall removes the board listeners", () => {
  game.modules.get(MODULE).api.uninstall();
  assert.equal(board.listenerCount("pointerup"), 1, "only PIXI's stand-in is left");
  assert.equal(doc.documentElement.listeners.length, 0);
  assert.equal(wrap.listenerCount("contextmenu"), 0);
  assert.equal(board.dataset.ppiBound, undefined);
});
