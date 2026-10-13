/**
 * Characterisation (senses checkpoint, wave 3): token chains (chain.mjs) as the active GM — the
 * published `game.pentaryn.chain` calls, the Token HUD buttons (glue case g), and the drawing
 * (layer, sprites, repaint triggers). Frozen once committed: during the refactor only import paths
 * may change. Declared later and pinned here as today: -10 chain half (Break writes `-=`, not
 * `_del`), -26 (a Token uuid or another scene's ref is refused).
 */
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, flush, settle, since, captureConsole, tokenHUD, el, ID, MODULE, NOW, PLAYER, GM } from "./fixtures/world.mjs";

mock.timers.enable({ apis: ["setTimeout", "Date"], now: NOW });
const F = await boot();
await settle(mock);
const C = () => game.pentaryn.chain;
const s1 = () => game.scenes.get(ID.s1);
const s2 = () => game.scenes.get(ID.s2);
const tok = id => s1().tokens.get(id) ?? s2().tokens.get(id);
let hudClick = null;   // a Break chain button kept for the console-text test at the end

test("links(): pairs on the viewed scene, or a given scene; a broken scene warns and gives []", t => {
  const out = captureConsole(t);
  assert.deepEqual(C().links(), [{ chained: ID.tHulk, anchor: ID.tStake }]);
  assert.deepEqual(C().links(s2()), []);
  assert.deepEqual(C().links(null), []);
  assert.deepEqual(C().links({ get tokens() { throw new Error("gone"); } }), []);
  assert.deepEqual(out, [["warn", `${MODULE} | chain links`, "Error: gone"]]);
});

// [declared S-8, finding -26] flipped from "(-26 KNOWN) … tokenUuid: false, nothing written": a Token
// uuid now resolves through fromUuidSync, on any scene. A plain id still means the VIEWED scene.
test("link(): refusals return false and write nothing; a Token uuid resolves (any scene); ids resolve on the VIEWED scene only", async () => {
  const mark = F.calls.length;
  const rows = {
    nullRefs: await C().link(null, ID.tStake),
    self: await C().link(ID.tGob, ID.tGob),
    unknownId: await C().link("tokNope000000001", ID.tStake),
    otherScene: await C().link(tok(ID.tGob2), tok(ID.tStake)),
    // an id of a token on a scene that is not viewed
    idOffScene: await C().link(ID.tGob2, ID.tHero2),
    anchorNoId: await C().link(tok(ID.tGob), {}),
    chainedNoUpdate: await C().link({ id: "x", parent: s1() }, tok(ID.tStake)),
    actorUuid: await C().link(`Actor.${ID.goblin}`, ID.tStake),
  };
  assert.deepEqual(rows, { nullRefs: false, self: false, unknownId: false, otherScene: false, idOffScene: false, anchorNoId: false, chainedNoUpdate: false, actorUuid: false });
  assert.deepEqual(since(mark), []);
  // a Token uuid on the viewed scene, and two on another scene
  assert.equal(await C().link(`Scene.${ID.s1}.Token.${ID.tGob}`, ID.tStake), true);
  assert.equal(await C().link(`Scene.${ID.s2}.Token.${ID.tGob2}`, `Scene.${ID.s2}.Token.${ID.tHero2}`), true);
  assert.deepEqual(since(mark).filter(c => c.op === "update").map(c => [c.uuid, c.changes]), [
    [`Scene.${ID.s1}.Token.${ID.tGob}`, { [`flags.${MODULE}.chain`]: { anchor: ID.tStake } }],
    [`Scene.${ID.s2}.Token.${ID.tGob2}`, { [`flags.${MODULE}.chain`]: { anchor: ID.tHero2 } }],
  ]);
  assert.deepEqual(C().links(ID.s2), [{ chained: ID.tGob2, anchor: ID.tHero2 }], "links(sceneId)");
  assert.equal(await C().break(`Scene.${ID.s2}.Token.${ID.tGob2}`), 1);
});

test("link(): by id, by document, by placeable; the flag lands on the chained token", async () => {
  const mark = F.calls.length;
  assert.equal(await C().link(ID.tGob, ID.tStake), true);
  assert.equal(await C().link(tok(ID.tHero), { document: tok(ID.tStake) }), true);
  assert.equal(await C().link({ document: tok(ID.tHero) }, tok(ID.tHulk)), true, "re-chaining overwrites the anchor");
  pinJSON("chain-link", since(mark).filter(c => c.op === "update"), import.meta.url);
  assert.deepEqual(C().links(), [
    { chained: ID.tHero, anchor: ID.tHulk }, { chained: ID.tGob, anchor: ID.tStake }, { chained: ID.tHulk, anchor: ID.tStake },
  ]);
});

// [declared S-5, finding -10 chain half] flipped from "(-=, not _del)": the flag is deleted with `_del` (v14).
test("break(): every chain touching the token, as the chained end or the anchor, in one batch (_del)", async () => {
  const mark = F.calls.length;
  const rows = {
    none: await C().break(null),
    bystanderOtherScene: await C().break(tok(ID.tGob2)),
    anchor: await C().break(ID.tStake),
    again: await C().break(ID.tStake),
  };
  // a dangling flag (anchor gone) goes too
  tok(ID.tGob).flags[MODULE] = { chain: { anchor: "tokDeleted000001" } };
  rows.dangling = await C().break(tok(ID.tGob));
  rows.chainedEnd = await C().break({ document: tok(ID.tHero) });
  assert.deepEqual(rows, { none: 0, bystanderOtherScene: 0, anchor: 2, again: 0, dangling: 1, chainedEnd: 1 });
  pinJSON("chain-break", since(mark).filter(c => c.op === "updateEmbedded"), import.meta.url);
  assert.deepEqual(C().links(), []);
});

test("Token HUD (GM): Break chain on either end; Chain to <target> with exactly one other token targeted", async () => {
  await C().link(ID.tHulk, ID.tStake);
  const out = {};
  // chained end
  let h = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", h.app, h.element);
  out.chained = h.col.toJSON();
  const keep = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", keep.app, keep.element);
  hudClick = keep.col.querySelector(".ps-chain-btn");
  F.fire("renderTokenHUD", h.app, h.element);
  assert.equal(h.col.querySelectorAll(".ps-chain-btn").length, 1, "never twice");
  // anchor end, jQuery-style element
  const ha = tokenHUD(tok(ID.tStake));
  F.fire("renderTokenHUD", ha.app, [ha.element]);
  out.anchorEnd = ha.col.children.map(c => c.dataset.tooltip);
  // click Break chain
  const mark = F.calls.length;
  const ev = h.col.querySelector(".ps-chain-btn").click();
  await flush();
  out.breakClick = { prevented: ev.prevented, stopped: ev.stopped, renders: h.app.renders, calls: since(mark).filter(c => c.op !== "Hooks.callAll") };
  // unchained: no targets → nothing; one target → Chain to Stake; two → nothing; a target on another scene doesn't count
  const target = d => ({ document: d });
  const hulkHud = () => { const x = tokenHUD(tok(ID.tHulk)); F.fire("renderTokenHUD", x.app, x.element); return x; };
  game.user.targets = new Set();
  out.noTargets = hulkHud().col.children.length;
  game.user.targets = new Set([target(tok(ID.tStake)), target(tok(ID.tGob))]);
  out.twoTargets = hulkHud().col.children.length;
  game.user.targets = new Set([target(tok(ID.tGob2))]);
  out.otherSceneTarget = hulkHud().col.children.length;
  game.user.targets = new Set([target(tok(ID.tHulk))]);
  out.selfTarget = hulkHud().col.children.length;
  game.user.targets = new Set([target(tok(ID.tStake))]);
  h = hulkHud();
  out.oneTarget = h.col.toJSON();
  const mark2 = F.calls.length;
  h.col.querySelector(".ps-chain-btn").click();
  await flush();
  out.linkClick = { renders: h.app.renders, calls: since(mark2).filter(c => c.op !== "Hooks.callAll") };
  game.user.targets = new Set();
  // no right column, or a token with no scene → nothing
  const bare = el("div");
  F.fire("renderTokenHUD", { object: { document: tok(ID.tHulk) } }, bare);
  out.noColumn = bare.children.length;
  pinJSON("chain-hud", out, import.meta.url);
});

test("Token HUD: nothing for a player, even on a chained token", () => {
  F.become({ userId: PLAYER });
  const h = tokenHUD(tok(ID.tHulk));
  F.fire("renderTokenHUD", h.app, h.element);
  F.become({ userId: GM });
  assert.equal(h.col.children.length, 0);
});

test("drawing: texture first, then one layer under the tokens with a shadow and a link per pair", async t => {
  const out = captureConsole(t);
  F.frames.flush();
  const primary = F.canvas.primary;
  primary.children.length = 0;
  F.fire("canvasReady");
  assert.equal(F.frames.pending(), 1);
  F.fire("canvasReady");
  assert.equal(F.frames.pending(), 1, "one repaint per frame");
  F.frames.flush();                 // starts the texture load, draws nothing
  assert.equal(primary.children.length, 0);
  await flush();                    // the load resolves and queues a repaint
  F.frames.flush();
  const layer = primary.children[0];
  const sprite = s => ({ w: s.width, h: s.height, x: s.position.x, y: s.position.y, rot: Math.round(s.rotation * 1e6) / 1e6, scale: s.tileScale.x, anchor: [s.anchor.x, s.anchor.y], tint: s.tint, alpha: s.alpha });
  pinJSON("chain-draw", {
    textures: F.textures,
    layer: { sortLayer: layer.sortLayer, elevation: layer.elevation, eventMode: layer.eventMode, sort: layer.sort, sortDirty: primary.sortDirty },
    sprites: layer.children.map(sprite),
  }, import.meta.url);
  assert.deepEqual(out, []);
});

test("drawing: what triggers a repaint", () => {
  F.frames.flush();
  const rows = {};
  const fire = (name, ...args) => { F.fire(name, ...args); const n = F.frames.pending(); F.frames.flush(); return n; };
  rows.refreshToken_withLayer = fire("refreshToken");
  rows.destroyToken = fire("destroyToken");
  rows.createToken = fire("createToken", {});
  rows.deleteToken = fire("deleteToken", {});
  rows.updateToken_flag = fire("updateToken", {}, { flags: { [MODULE]: { chain: null } } });
  rows.updateToken_hidden = fire("updateToken", {}, { hidden: true });
  rows.updateToken_elevation = fire("updateToken", {}, { elevation: 5 });
  rows.updateToken_x = fire("updateToken", {}, { x: 5 });
  rows.updateToken_otherFlag = fire("updateToken", {}, { flags: { core: {} } });
  rows.updateToken_noChanges = fire("updateToken", {});
  rows.repaintApi = (C().repaint(), F.frames.pending());
  F.frames.flush();
  assert.deepEqual(rows, {
    refreshToken_withLayer: 1, destroyToken: 1, createToken: 1, deleteToken: 1, updateToken_flag: 1, updateToken_hidden: 1,
    updateToken_elevation: 1, updateToken_x: 0, updateToken_otherFlag: 0, updateToken_noChanges: 0, repaintApi: 1,
  });
});

test("drawing: a hidden chained token is drawn for the GM only; no chain left drops the layer", async () => {
  F.frames.flush();
  tok(ID.tHulk).hidden = true;
  F.become({ userId: PLAYER });
  C().repaint();
  F.frames.flush();
  const playerLayers = F.canvas.primary.children.length;
  F.become({ userId: GM });
  C().repaint();
  F.frames.flush();
  const gmSprites = F.canvas.primary.children[0]?.children.length ?? 0;
  tok(ID.tHulk).hidden = false;
  await C().break(ID.tHulk);
  F.frames.flush();
  assert.deepEqual({ playerLayers, gmSprites, afterBreak: F.canvas.primary.children.length }, { playerLayers: 0, gmSprites: 2, afterBreak: 0 });
});

test("drawing: a hidden ANCHOR hides the chain from players, the GM still sees it (W3-SE4)", async () => {
  F.frames.flush();
  await C().link(ID.tHulk, ID.tStake);
  tok(ID.tStake).hidden = true;
  F.become({ userId: PLAYER });
  C().repaint();
  F.frames.flush();
  const playerLayers = F.canvas.primary.children.length;
  F.become({ userId: GM });
  C().repaint();
  F.frames.flush();
  const gmSprites = F.canvas.primary.children[0]?.children.length ?? 0;
  tok(ID.tStake).hidden = false;
  await C().break(ID.tHulk);
  F.frames.flush();
  assert.deepEqual({ playerLayers, gmSprites }, { playerLayers: 0, gmSprites: 2 }, "a hidden anchor's square never shows on a player's screen");
});

test("drawing: refreshToken with no layer and no chain does not repaint; canvasTearDown forgets the layer", async () => {
  F.frames.flush();
  F.fire("refreshToken");
  assert.equal(F.frames.pending(), 0);
  await C().link(ID.tHulk, ID.tStake);
  F.frames.flush();
  const first = F.canvas.primary.children[0];
  F.fire("canvasTearDown");
  F.canvas.primary.children.length = 0;
  first.parent = null;
  C().repaint();
  F.frames.flush();
  assert.notEqual(F.canvas.primary.children[0], first, "a fresh layer after teardown");
  assert.equal(F.canvas.primary.children[0].children.length, 2);
});

test("drawing: live centres — the mesh while animating, the drag preview while dragged, else the document", () => {
  F.frames.flush();
  const hulk = tok(ID.tHulk), stake = tok(ID.tStake);
  hulk.object = { mesh: { x: 1000, y: 2000, transform: {}, destroyed: false }, center: { x: 1, y: 1 } };
  stake.object = { _preview: { mesh: null, center: { x: 77, y: 88 }, destroyed: false }, mesh: { x: 5, y: 5, transform: {} }, center: { x: 9, y: 9 } };
  C().repaint();
  F.frames.flush();
  const [shadow, link] = F.canvas.primary.children[0].children;
  delete hulk.object;
  delete stake.object;
  assert.deepEqual([link.position.x, link.position.y, link.width], [77, 88, Math.hypot(1000 - 77, 2000 - 88)]);
  assert.deepEqual([shadow.position.x, shadow.position.y], [77 + 28 * 0.1, 88 + 28 * 0.16]);
});

test("drawing: a missing texture warns and draws nothing; a paint error warns", async t => {
  const out = captureConsole(t);
  F.frames.flush();
  // drop the cached texture so it loads again, missing this time
  F.canvas.primary.children[0].children[0].texture.destroyed = true;
  F.textureMissing = true;
  C().repaint();
  F.frames.flush();
  await flush();
  F.textureMissing = false;
  const scene = F.canvas.scene;
  F.canvas.scene = { get tokens() { throw new Error("paint boom"); } };
  C().repaint();
  F.frames.flush();
  F.canvas.scene = scene;
  assert.deepEqual(out, [
    ["warn", `${MODULE} | chain texture missing: modules/${MODULE}/assets/chain-link.webp`],
    ["warn", `${MODULE} | chain links`, "Error: paint boom"],
  ]);
});

test("drawing: a paint that throws warns 'chain paint'; a layer that will not destroy warns 'chain teardown'", async t => {
  const out = captureConsole(t);
  F.frames.flush();
  await C().link(ID.tHulk, ID.tStake);
  F.frames.flush();                 // the texture was dropped by the missing-texture test: it loads again
  await flush();
  F.frames.flush();
  const layer = F.canvas.primary.children[0];
  // the next paint: the layer has lost its parent, so a new one is added — and adding throws
  layer.parent = null;
  const add = F.canvas.primary.addChild;
  F.canvas.primary.addChild = () => { throw new Error("no stage"); };
  C().repaint();
  F.frames.flush();
  F.canvas.primary.addChild = add;
  // no chain left: the layer is dropped, and destroying it throws
  F.canvas.primary.children.length = 0;
  C().repaint();
  F.frames.flush();
  const fresh = F.canvas.primary.children[0];
  fresh.destroy = () => { throw new Error("stuck"); };
  await C().break(ID.tHulk);
  F.frames.flush();
  F.canvas.primary.children.length = 0;   // the stuck layer stays on the stage; clear it for the next test
  assert.deepEqual(out, [
    ["warn", `${MODULE} | chain paint`, "Error: no stage"],
    ["warn", `${MODULE} | chain teardown`, "Error: stuck"],
  ]);
});

// [declared S-1] flipped from chain.uninstall() (a reserved name, C48, gone from the API): the kit
// member senses.uninstall() does the same for chain (and every other feature).
test("senses.uninstall(): cancels a queued repaint and drops the layer", () => {
  F.frames.flush();
  C().repaint();
  assert.equal(F.frames.pending(), 1);
  game.pentaryn.senses.uninstall();
  assert.equal(F.frames.pending(), 0);
  assert.equal(F.canvas.primary.children.length, 0);
  F.fire("canvasReady");
  assert.equal(F.frames.pending(), 0, "no listener left");
});

test("console text (i): a failing HUD click warns 'pentaryn-senses | chain hud click'", async t => {
  const out = captureConsole(t);
  // reinstalling is not possible after uninstall: drive the click handler captured before it
  assert.ok(hudClick, "captured in the HUD test");
  const s = s1();
  await C().link(ID.tHulk, ID.tStake);
  s.throwOnUpdate = "db down";
  hudClick.click();
  await flush();
  s.throwOnUpdate = null;
  await C().break(ID.tHulk);
  assert.deepEqual(out, [["warn", `${MODULE} | chain hud click`, "Error: db down"]]);
});
