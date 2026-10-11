// Glue characterisation on a player's client (guide step 1): owners-see-their-own (direct path —
// the libWrapper global exists but the lib-wrapper module is not active), the "Your creatures" strip
// (mount, entries, controls, re-render triggers) and the U-6-12 dock over Argon's Combat HUD with its
// 500 ms poll. A player never writes light. Timers are mocked.
//
// KNOWN rows (pinned as they are; each has its target as a todo test at the end):
//   transform-creatures-25  updateToken {x} on the viewed scene schedules a render that rebuilds nothing
//   transform-creatures-29  FIXED [declared]: an override failure still answers false, and warns once
//   transform-creatures-31  api.ownerSees(TokenDocument) is false; only a placeable works
//   transform-creatures-40  with no Argon on the page the poll still runs, two queries a tick
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { manifestOf, pinJSON } from "./kit/harness.mjs";
import { ALPHA, BETA, GM, LANG, MODULE, PLAYER, PLAYER2, drain, registerSelf, setupWorld } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "setInterval"] });

const manifest = manifestOf(new URL("..", import.meta.url));
const W = await setupWorld({ player: true, libWrapper: "global-only" });
const { F, D } = W;
registerSelf(F, manifest);

await import("../creatures.mjs");

const api = () => F.game.pentaryn.creatures;
const tick = async ms => {
  mock.timers.tick(ms);
  await drain();
};
const renders = () => W.reads.filter(r => r === `${MODULE}.showStrip`).length;   // render() reads showStrip once
const ids = () => W.strip().querySelectorAll(".pcr-token").map(b => b.dataset.tokenId);
const ARGON = ".extended-combat-hud .action-hud";
const BAR = { top: 700, left: 300, width: 900, height: 120 };

test("init, setup: the libWrapper global without the active module → direct; core's answer comes first", () => {
  F.fire("init");
  F.fire("setup");
  assert.deepEqual(W.wrapped, [], "libWrapper.register never called");
  assert.notEqual(Object.getOwnPropertyDescriptor(W.TokenClass.prototype, "isVisible").get, W.coreGetter);
  W.p("tGob").coreVisible = true;
  assert.equal(W.p("tGob").isVisible, true, "core yes, not owned: still yes");
  W.p("tGob").coreVisible = false;
  assert.deepEqual(W.lines(), []);
});

test("owners see their own: the override table (core said no)", () => {
  const t = id => W.p(id).isVisible;
  assert.deepEqual(
    Object.fromEntries(["tPC", "tImp", "tEye", "tTorch", "tHid", "tHandle", "tHandle2", "tPile", "tPile2", "tGob", "tMara", "tGhost"].map(id => [id, t(id)])),
    { tPC: true, tImp: true, tEye: true, tTorch: true, tHid: false, tHandle: false, tHandle2: false, tPile: true, tPile2: true, tGob: false, tMara: false, tGhost: false },
    "GM-hidden, props, not owned, no actor: no; owned piles: yes (isProp only drops handles)",
  );
  const imp = W.p("tImp");
  const row = o => {
    const p = W.placeable(imp.document, o);
    return p.isVisible;
  };
  assert.equal(row({ _preview: { _previewType: "config" } }), false, "token config preview");
  assert.equal(row({ _preview: { _previewType: "drag" } }), true, "other previews");
  assert.equal(row({ isFilteredOut: true }), false);
  assert.equal(row({ _testCulled: () => true }), false, "other level");
  assert.equal(row({ _testCulled: () => false }), true);
  assert.equal(row({ _testCulled: "nope" }), true, "not a function → not culled");
  assert.equal(row({ document: null }), false, "no document");
  assert.deepEqual(W.lines(), []);
});

test("transform-creatures-29 [declared]: a throw inside the override answers false and warns once per session", () => {
  const p = W.placeable(W.tok("tImp"), { _testCulled: () => { throw new Error("private API moved"); } });
  assert.equal(p.isVisible, false);
  const q = W.placeable(W.tok("tImp"));
  Object.defineProperty(q, "isFilteredOut", { get() { throw new Error("gone"); } });
  assert.equal(q.isVisible, false);
  assert.equal(p.isVisible, false);
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | owner override failed`, "Error: private API moved"]]);
});

test("ownerSees onChange: off stops the override and refreshes every placeable; on restores it", async () => {
  F.canvas.ready = true;
  W.flags = [];
  await F.game.settings.set(MODULE, "ownerSees", false);
  assert.equal(W.p("tImp").isVisible, false);
  assert.deepEqual(W.flags.map(f => f[0]), F.canvas.tokens.placeables.map(p => p.id));
  assert.ok(W.flags.every(f => f[1].refreshVisibility === true && Object.keys(f[1]).length === 1));
  await F.game.settings.set(MODULE, "ownerSees", "yes");
  assert.equal(W.p("tImp").isVisible, true, "anything but false is on");
});

test("ready (player): no light writes, no syncAll; strip after 60 ms; published at ready ([declared] C-D2)", async () => {
  W.reads.length = 0;
  F.fire("ready");
  await drain();
  assert.equal(W.strip(), null, "nothing drawn synchronously");
  assert.equal(typeof api(), "object", "[declared] C-D2: published synchronously at ready");
  assert.equal(api().patchedWith(), "direct");
  await tick(59);
  assert.equal(W.strip(), null);
  await tick(1);
  assert.ok(W.strip());
  assert.deepEqual(W.writes, []);
  assert.equal(W.passes(), 0);
});

test("strip DOM: nav#pentaryn-creatures before #hotbar, label then PC-first buttons (golden/strip.json)", () => {
  const el = W.strip();
  assert.equal(el.parentElement, D.uiBottom);
  assert.deepEqual(D.uiBottom.children.map(c => c.id), [MODULE, "hotbar"]);
  assert.equal(el.tagName, "NAV");
  assert.equal(el.getAttribute("aria-label"), LANG.PENTARYN_CREATURES.label);
  assert.deepEqual(Object.keys(el.listeners), ["click", "dblclick"]);
  // the nav's own class list is not pinned: guide step 6 adds the inert `pcr-strip` class for step 8
  const { className: _navClass, ...snap } = D.snapshot(el);
  assert.equal(el.classList.contains("pcr-floating"), false, "docked: no Argon on the page");
  pinJSON("strip", snap, import.meta.url);
  assert.deepEqual(ids(), ["tPC", "tEye", "tImp", "tTorch"]);
  const [label, pc, eye, imp] = el.children;
  assert.equal(label.className, "pcr-label");
  assert.equal(label.textContent, "Your creatures");
  assert.equal(pc.className, "pcr-token rank-0");
  assert.equal(eye.className, "pcr-token rank-2");
  assert.equal(eye.children[0].src, "actors/eye.webp", "video token image → actor image");
  assert.equal(imp.dataset.tooltipHtml, `<strong>Imp &lt;i&gt;&amp;</strong><br>${LANG.PENTARYN_CREATURES.hint}`);
  assert.equal(imp.getAttribute("aria-label"), "Imp <i>&", "aria-label is the raw name");
  assert.deepEqual([imp.type, imp.children[0].alt, imp.children[0].draggable], ["button", "", false]);
});

test("controlled tokens are marked; controlToken re-marks without rebuilding", () => {
  const el = W.strip();
  const before = el.calls.replaceChildren;
  W.p("tImp").controlled = true;
  F.fire("controlToken", W.p("tImp"), true);
  assert.deepEqual(el.querySelectorAll(".controlled").map(b => b.dataset.tokenId), ["tImp"]);
  W.p("tImp").controlled = false;
  F.fire("controlToken", W.p("tImp"), false);
  assert.deepEqual(el.querySelectorAll(".controlled"), []);
  assert.equal(el.calls.replaceChildren, before);
});

test("click selects (shift keeps others) and pans; activates the token layer once; a click off a button does nothing", () => {
  const el = W.strip();
  const imp = el.children[3];
  W.controls = [];
  const e1 = imp.children[0].dispatch("click");
  assert.equal(e1.defaultPrevented, true);
  assert.equal(W.activations, 1);
  const e2 = imp.dispatch("click", { shiftKey: true });
  assert.equal(e2.defaultPrevented, true);
  assert.equal(W.activations, 1, "already active");
  assert.deepEqual(W.controls, [["tImp", { releaseOthers: true }], ["tImp", { releaseOthers: false }]]);
  const c = W.p("tImp").center;
  assert.deepEqual(W.pans, [c, c]);
  const e3 = el.children[0].dispatch("click");
  assert.equal(e3.defaultPrevented, false);
  assert.equal(W.pans.length, 2);
});

test("double-click opens the actor's sheet with force; no sheet → nothing", () => {
  const el = W.strip();
  const e = el.children[1].dispatch("dblclick");
  assert.equal(e.defaultPrevented, true);
  assert.deepEqual(W.sheets, [{ actor: "aPC", opts: { force: true } }]);
  const sheet = F.game.actors.get("aEye").sheet;
  F.game.actors.get("aEye").sheet = null;
  const e2 = el.children[2].dispatch("dblclick");
  assert.equal(e2.defaultPrevented, false);
  assert.equal(W.sheets.length, 1);
  F.game.actors.get("aEye").sheet = sheet;
  assert.equal(el.dispatch("dblclick").defaultPrevented, false);
});

test("KNOWN transform-creatures-40: no Argon → the 500 ms poll still runs, querying both selectors each tick, armed once", async () => {
  // the strip mounted at t=60 armed the interval: ticks land at 560, 1060, …
  D.queries.length = 0;
  await tick(500);
  assert.deepEqual(D.queries, [ARGON, ".extended-combat-hud"]);
  api().render();
  api().render();
  D.queries.length = 0;
  await tick(500);
  assert.deepEqual(D.queries, [ARGON, ".extended-combat-hud"], "renders do not arm a second interval");
  assert.equal(W.strip().classList.contains("pcr-floating"), false);
  assert.deepEqual([W.strip().style.bottom, W.strip().style.left], ["", ""]);
});

test("dock: Argon's action bar up → float 8 px above it, left-aligned; hidden or gone → docked again on the next tick", async () => {
  const el = W.strip();
  D.argon(ARGON, BAR);
  await tick(499);
  assert.equal(el.classList.contains("pcr-floating"), false, "not before the tick");
  await tick(1);
  assert.equal(el.classList.contains("pcr-floating"), true);
  assert.deepEqual([el.style.bottom, el.style.left], ["208px", "300px"]);
  D.queries.length = 0;
  await tick(500);
  assert.deepEqual(D.queries, [ARGON], "the fallback selector is not read when the bar is found");

  D.argon(ARGON, BAR, { visible: false });
  await tick(500);
  assert.equal(el.classList.contains("pcr-floating"), false, "offsetParent null → docked");
  assert.deepEqual([el.style.bottom, el.style.left], ["", ""]);

  D.clearArgon();
  D.argon(".extended-combat-hud", { top: 600, left: -40, width: 900, height: 300 });
  await tick(500);
  assert.deepEqual([el.classList.contains("pcr-floating"), el.style.bottom, el.style.left], [true, "308px", "8px"], "the HUD root as fallback");

  D.window.innerHeight = 500;
  await tick(500);
  assert.equal(el.classList.contains("pcr-floating"), false, "HUD below the window → docked");
  D.window.innerHeight = 900;
});

test("floatOverHud false (no onChange): docked from the next tick, still polling; true floats again", async () => {
  const el = W.strip();
  D.clearArgon();
  D.argon(ARGON, BAR);
  await tick(500);
  assert.equal(el.classList.contains("pcr-floating"), true);
  await F.game.settings.set(MODULE, "floatOverHud", false);
  assert.equal(el.classList.contains("pcr-floating"), true, "nothing reacts to the change itself");
  D.queries.length = 0;
  await tick(500);
  assert.equal(el.classList.contains("pcr-floating"), false);
  assert.deepEqual(D.queries, [ARGON], "the bar is still read with the setting off");
  await F.game.settings.set(MODULE, "floatOverHud", true);
  await tick(500);
  assert.equal(el.classList.contains("pcr-floating"), true);
  D.clearArgon();
  await tick(500);
});

test("KNOWN transform-creatures-25: updateToken {x} on the viewed scene re-runs render (60 ms) and rebuilds nothing", async () => {
  const el = W.strip();
  const built = el.calls.replaceChildren;
  W.reads.length = 0;
  F.fire("updateToken", W.tok("tImp"), { x: 5 }, {}, GM);
  await tick(59);
  assert.equal(renders(), 0);
  await tick(1);
  assert.equal(renders(), 1);
  assert.equal(el.calls.replaceChildren, built, "same signature: no rebuild");
  F.fire("updateToken", W.tok("tImpB", BETA), { name: "x" }, {}, GM);
  await tick(60);
  assert.equal(renders(), 1, "another scene's token: nothing");
  for (let i = 0; i < 4; i++) {
    F.fire("updateToken", W.tok("tImp"), { x: i }, {}, GM);
    await tick(20);
  }
  await tick(60);
  assert.equal(renders(), 2, "a 60 ms debounce: a burst renders once");
});

test("re-render triggers: create/delete token on the viewed scene, actor name/img/ownership, own character, canvasReady", async () => {
  const el = W.strip();
  const count = async fire => {
    W.reads.length = 0;
    fire();
    await tick(60);
    return renders();
  };
  const imp = F.game.actors.get("aImp");
  const rows = {
    createToken: await count(() => F.fire("createToken", W.tok("tImp"), {}, GM)),
    deleteToken: await count(() => F.fire("deleteToken", W.tok("tImp"), {}, GM)),
    "createToken other scene": await count(() => F.fire("createToken", W.tok("tImpB", BETA), {}, GM)),
    "updateActor name": await count(() => F.fire("updateActor", imp, { name: "n" }, {}, GM)),
    "updateActor img": await count(() => F.fire("updateActor", imp, { img: "i" }, {}, GM)),
    "updateActor ownership": await count(() => F.fire("updateActor", imp, { ownership: {} }, {}, GM)),
    "updateActor system": await count(() => F.fire("updateActor", imp, { system: {} }, {}, GM)),
    "updateActor null": await count(() => F.fire("updateActor", imp, null, {}, GM)),
    "updateUser self character": await count(() => F.fire("updateUser", F.game.user, { character: "aPC" }, {}, PLAYER)),
    "updateUser self other": await count(() => F.fire("updateUser", F.game.user, { color: "#f00" }, {}, PLAYER)),
    "updateUser other character": await count(() => F.fire("updateUser", F.game.users.get(PLAYER2), { character: "aMara" }, {}, GM)),
  };
  assert.deepEqual(rows, {
    createToken: 1, deleteToken: 1, "createToken other scene": 0, "updateActor name": 1, "updateActor img": 1,
    "updateActor ownership": 1, "updateActor system": 0, "updateActor null": 0, "updateUser self character": 1,
    "updateUser self other": 0, "updateUser other character": 0,
  });
  const built = el.calls.replaceChildren;
  F.fire("canvasReady", F.canvas);
  await tick(60);
  assert.equal(el.calls.replaceChildren, built + 1, "canvasReady forgets the signature: rebuilt");
  W.tok("tEye").name = "Eye";
  api().render();
  assert.equal(el.calls.replaceChildren, built + 2, "a rename rebuilds");
  assert.deepEqual(ids(), ["tPC", "tEye", "tImp", "tTorch"]);
  api().render();
  assert.equal(el.calls.replaceChildren, built + 3, "api.render() always rebuilds");
  W.tok("tEye").name = "Arcane Eye";
  api().render();
});

test("showStrip off removes the strip; the dock interval is cleared on its next tick; on brings it back", async () => {
  await F.game.settings.set(MODULE, "showStrip", false);
  await tick(60);
  assert.equal(W.strip(), null);
  D.byId.length = 0;
  D.queries.length = 0;
  await tick(500);
  assert.deepEqual(D.byId, [MODULE], "one last look, then the interval is gone");
  assert.deepEqual(D.queries, []);
  await tick(1500);
  assert.deepEqual(D.byId, [MODULE]);
  await F.game.settings.set(MODULE, "showStrip", true);
  await tick(60);
  assert.ok(W.strip());
  D.byId.length = 0;
  await tick(500);
  assert.ok(D.byId.length > 0, "a fresh interval is armed with the new strip");
});

test("fewer than two entries hides the strip; no canvas hides it", async () => {
  for (const id of ["tEye", "tImp", "tTorch"]) W.tok(id).hidden = true;
  api().render();
  assert.equal(W.strip(), null, "PC alone: no strip");
  for (const id of ["tEye", "tImp", "tTorch"]) W.tok(id).hidden = false;
  api().render();
  assert.equal(ids().length, 4);
  F.canvas.ready = false;
  api().render();
  assert.equal(W.strip(), null);
  F.canvas.ready = true;
  api().render();
  assert.ok(W.strip());
});

test("mount fallbacks: no #hotbar → end of #ui-bottom; no #ui-bottom → body", async () => {
  const hotbar = D.uiBottom.children.find(c => c.id === "hotbar");
  W.strip().remove();
  hotbar.remove();
  api().render();
  assert.equal(W.strip().parentElement, D.uiBottom);
  W.strip().remove();
  D.uiBottom.remove();
  api().render();
  assert.equal(W.strip().parentElement, D.document.body);
  W.strip().remove();
  D.document.body.append(D.uiBottom);
  D.uiBottom.append(hotbar);
  api().render();
  assert.deepEqual(D.uiBottom.children.map(c => c.id), [MODULE, "hotbar"]);
});

test("a render failure inside the scheduled render is caught with a console line", async () => {
  const rook = F.game.user;
  const saved = rook.character;
  Object.defineProperty(rook, "character", { get() { throw new Error("no character"); }, configurable: true });
  F.fire("canvasReady", F.canvas);
  await tick(60);
  assert.deepEqual(W.lines(), [["warn", `${MODULE} | strip render failed`, "Error: no character"]]);
  Object.defineProperty(rook, "character", { value: saved, writable: true, configurable: true, enumerable: true });
});

test("api.list() is the viewed scene for this user; a player never writes light through the API", async () => {
  assert.deepEqual(api().list().map(e => e.id), ["tPC", "tEye", "tImp", "tTorch"]);
  assert.equal(await api().syncScene(W.scene(ALPHA)), 0);
  assert.equal(await api().syncAll(), 0);
  F.fire("updateToken", W.tok("tImp"), { flags: {} }, {}, GM);
  await tick(200);
  assert.deepEqual(W.writes, []);
});

test("KNOWN transform-creatures-31: ownerSees needs the placeable; a TokenDocument answers false", () => {
  assert.equal(api().ownerSees(W.p("tImp")), true);
  assert.equal(api().ownerSees(W.tok("tImp")), false);
  assert.equal(api().ownerSees(W.p("tGob")), false);
});

test("the Wild Shape form ranks as the PC (via flags.dnd5e.originalActor)", () => {
  const pc = W.tok("tPC");
  pc.actorId = "aWolf";
  assert.deepEqual(api().list().map(e => [e.id, e.rank]), [["tPC", 0], ["tEye", 2], ["tImp", 2], ["tTorch", 2]]);
  pc.actorId = "aPC";
});

test("a token with an actor but no actorId (synthetic) uses the actor's id", () => {
  // the stub's token resolves `actor` through game.actors.get(actorId): file the actor under "" too
  const eye = W.tok("tEye");
  F.game.actors.set("", eye.actor);
  eye.actorId = "";
  assert.deepEqual(api().list().map(e => e.id), ["tPC", "tEye", "tImp", "tTorch"]);
  assert.equal(api().isCreature(eye), true);
  eye.actorId = "aEye";
  F.game.actors.delete("");
});

test("throwing setting reads fall back to the defaults: showStrip and floatOverHud → true", async () => {
  const D2 = W.D;
  D2.argon(ARGON, BAR);
  W.failRead.add("showStrip");
  W.failRead.add("floatOverHud");
  api().render();
  assert.ok(W.strip(), "showStrip read threw → shown");
  assert.equal(W.strip().classList.contains("pcr-floating"), true, "floatOverHud read threw → floats");
  W.failRead.clear();
  D2.clearArgon();
  await tick(500);
});

/* ── the targets of the KNOWN rows (guide §4, steps 5 and 7) ─────────────── */
test.todo("transform-creatures-25: updateToken re-renders the strip only when stripMayChange(changes) — {x:5} schedules nothing");
test.todo("transform-creatures-31: api.ownerSees(TokenDocument) gives the same answer as for its placeable (step 7)");
test.todo("transform-creatures-40: no interval is armed without Argon on the page or with floatOverHud off; styles written only on change");
