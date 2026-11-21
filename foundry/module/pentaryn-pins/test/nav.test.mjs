// Triage A (`fpnsNR`): the "⟵ {character}" tab in core's scene navigation, on a pinned PLAYER's
// client only. Core v14 lists a scene for a player only when it is active, viewed, or has
// `navigation && visible`, so a pinned map with navigation off loses its tab the moment the player
// clicks another one. The tab is DOM only; its click is a Scene#view of the token's scene and level
// with the token controlled (the stub records it in F.views), never pins' viewTo().
import { test } from "node:test";
import assert from "node:assert/strict";
import { IDS, flush, pinsWorld } from "./fixtures/actors.mjs";
import { FakeElement, dispatch, installDom } from "./fixtures/dom.mjs";
import { MODULE } from "../pins-core.mjs";

const F = await pinsWorld(MODULE, { settings: { [`${MODULE}.pinning`]: true } });
const consoleLines = [];
for (const level of ["warn", "error"]) console[level] = (...args) => consoleLines.push([level, String(args[0])]);
console.info = () => undefined;
const { doc } = installDom();

const A = game.scenes.get(IDS.sceneA), B = game.scenes.get(IDS.sceneB), C = game.scenes.get(IDS.sceneC);

F.become({ userId: IDS.taloUser });
await import("../pins.mjs");
F.fire("init");
F.fire("setup");
F.fire("ready");

const navRenders = [];
ui.nav = { render: (...args) => void navRenders.push(args) };

/** Put this client on a scene and level without a draw. */
const at = (scene, level = null) => Object.assign(canvas, { scene, level: level ? F.level(level) : null, loading: false, ready: true });

/** Core's #scene-navigation as scene-navigation.hbs draws it: the viewed scene, then the active menu. */
function nav() {
  const element = new FakeElement("nav", doc);
  element.id = "scene-navigation";
  const viewed = new FakeElement("menu", doc);
  viewed.id = "scene-navigation-viewed";
  if (canvas.scene) {
    const li = new FakeElement("li", doc);
    li.className = "ui-control flexrow scene view";
    li.dataset.sceneId = canvas.scene.id;
    li.dataset.action = "viewScene";
    viewed.appendChild(li);
  }
  const active = new FakeElement("menu", doc);
  active.id = "scene-navigation-active";
  for (const s of game.scenes.contents.filter(x => x.active && x !== canvas.scene)) {
    const li = new FakeElement("li", doc);
    li.className = "ui-control flexrow scene";
    li.dataset.sceneId = s.id;
    li.dataset.action = "viewScene";
    active.appendChild(li);
  }
  const inactive = new FakeElement("menu", doc);
  inactive.id = "scene-navigation-inactive";
  element.append(viewed, active, inactive);
  return { app: { element, rendered: true }, element, active };
}
const render = n => F.fire("renderSceneNavigation", n.app, n.element, {}, {});
const tabs = n => n.element.querySelectorAll(".ppi-nav-back");
const reset = () => {
  F.views.length = 0;
  navRenders.length = 0;
  consoleLines.length = 0;
};

test("a pinned player peeking at the active lobby gets '⟵ Talo', first in the active menu", () => {
  at(A);
  const n = nav();
  render(n);
  const [tab] = tabs(n);
  assert.ok(tab, "a tab");
  assert.equal(tab.textContent, "⟵ Talo");
  assert.equal(tab.getAttribute("aria-label"), "Back to Talo: the map your character is on");
  assert.equal(tab.dataset.tooltip, "", "core's tooltip reads the aria-label");
  assert.equal(n.active.children[0], tab, "before core's own active tabs");
  assert.equal(tab.dataset.action, undefined, "never core's viewScene action");
  assert.equal(tab.dataset.sceneId, undefined, "not dressed as core's tab");
  assert.equal(tab.dataset.ppiScene, IDS.sceneB);
  render(n);
  assert.equal(tabs(n).length, 1, "one tab across re-renders");
});

test("the click views the token's scene and level with the token controlled (onActivate's view)", async () => {
  reset();
  at(A);
  const n = nav();
  render(n);
  const ev = dispatch(tabs(n)[0], "click");
  assert.equal(ev.defaultPrevented, true);
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [IDS.taloTok], level: IDS.levelB2 }]]);
  await flush();
  await flush();
  await flush();
  assert.equal(canvas.scene, B, "landed on the pinned map");
  assert.equal(canvas.level?.id, IDS.levelB2, "on the token's level");
  assert.deepEqual(consoleLines, []);
});

test("a pull this client received earlier never drops the click (scene.view, not viewTo)", () => {
  reset();
  at(A);
  F.socketFire("pullToScene", A.id, {});       // honoured by core: pins' lastPull is now newer than any seq
  F.views.length = 0;
  const n = nav();
  render(n);
  dispatch(tabs(n)[0], "click");
  assert.deepEqual(F.views, [[IDS.sceneB, { controlledTokens: [IDS.taloTok], level: IDS.levelB2 }]]);
});

test("no tab while viewing the pinned scene, on any of its levels", () => {
  for (const level of [IDS.levelB1, IDS.levelB2]) {
    at(B, level);
    const n = nav();
    render(n);
    assert.equal(tabs(n).length, 0, level);
  }
});

test("no tab when core already lists the pinned scene: active, or navigation on and visible", () => {
  at(A);
  for (const patch of [{ active: true }, { navigation: true, visible: true }]) {
    const saved = Object.fromEntries(Object.keys(patch).map(k => [k, B[k]]));
    Object.assign(B, patch);
    const n = nav();
    render(n);
    assert.equal(tabs(n).length, 0, JSON.stringify(patch));
    Object.assign(B, saved);
  }
  // navigation on but the player cannot see it: core draws nothing, so the tab is there
  Object.assign(B, { navigation: true, visible: false });
  const n = nav();
  render(n);
  assert.equal(tabs(n).length, 1);
  Object.assign(B, { navigation: undefined, visible: undefined });
});

test("a tab already carrying the pinned scene's id (another module drew one): none added", () => {
  at(A);
  const n = nav();
  const li = new FakeElement("li", doc);
  li.className = "ui-control flexrow scene";
  li.dataset.sceneId = IDS.sceneB;
  n.active.appendChild(li);
  render(n);
  assert.equal(tabs(n).length, 0);
});

test("a GM, an unpinned player and the switch off see core's nav unchanged; a stale tab is removed", async () => {
  at(C);
  const n = nav();
  render(n);
  assert.equal(tabs(n).length, 1, "Talo, pinned, on C");
  for (const userId of [IDS.gm, IDS.bot, IDS.miraUser]) {
    F.become({ userId });
    render(n);
    assert.equal(tabs(n).length, 0, userId);
  }
  F.become({ userId: IDS.taloUser });
  const row = game.settings.settings.get(`${MODULE}.pinning`);
  const onChange = row.onChange;
  row.onChange = undefined;
  await game.settings.set(MODULE, "pinning", false);
  row.onChange = onChange;
  render(n);
  assert.equal(tabs(n).length, 0, "switch off");
  await game.settings.set(MODULE, "pinning", true);
  render(n);
  assert.equal(tabs(n).length, 1, "switch on again");
});

test("switching pinning redraws the nav (the tab follows the switch without a reload)", () => {
  reset();
  game.settings.settings.get(`${MODULE}.pinning`).onChange(true, {}, IDS.gm);
  assert.equal(navRenders.length, 1);
});

test("the pin lost between render and click: no view, the nav is redrawn without the tab", () => {
  reset();
  at(A);
  const n = nav();
  render(n);
  const [tok] = B.tokens.contents;
  B.tokens.delete(tok.id);
  dispatch(tabs(n)[0], "click");
  assert.deepEqual(F.views, []);
  assert.equal(navRenders.length, 1);
  B.tokens.set(tok.id, tok);
});

test("a token the player cannot own: the click views its scene and level, core picks what to pan to", () => {
  reset();
  at(A);
  const [tok] = B.tokens.contents;
  const own = Object.getOwnPropertyDescriptor(tok, "testUserPermission");
  Object.defineProperty(tok, "testUserPermission", { value: () => false, configurable: true });
  const n = nav();
  render(n);
  dispatch(tabs(n)[0], "click");
  assert.deepEqual(F.views, [[IDS.sceneB, { level: IDS.levelB2 }]]);
  Object.defineProperty(tok, "testUserPermission", own);
});
