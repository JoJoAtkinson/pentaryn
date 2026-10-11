// Badges: the travel badge layer on canvas.interface, sight gating for players, the hover card,
// the GM menu, the #board pointer wiring (hover, cursor, drag-to-move, context menu), moveRegion,
// and the canvas hooks. Characterisation of 0.4.4: unchanged code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pinJSON } from "./kit/harness.mjs";
import { boot, pixiTree, P1, GM } from "./fixtures/world.mjs";
import { places } from "./fixtures/places.mjs";

const { F, S, W } = await boot();
await W.tick();
W.textures["cards/pit.webp"] = { src: "cards/pit.webp", width: 200, height: 100 };
W.textures["thumbs/pit.webp"] = { src: "thumbs/pit.webp", width: 100, height: 100 };

let seq = 0;
/** A fresh copy of the standard world on the canvas. */
function onCanvas() {
  const P = places(W, `B${++seq}`);
  F.canvas.ready = true;
  F.canvas.scene = P.prison;
  return P;
}
const summary = () => S.badges.map(b => ({ region: b.region.name, x: b.x, y: Math.round(b.y * 1000) / 1000, r: b.r, revealed: b.revealed, visible: b.sprite.visible, cards: b.cards.map(c => c.title) }));
const layer = () => S.state().badgeLayer;
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test("GM: a badge per region with a destination, above the square; hidden ones faint (golden/badges-gm.json)", async () => {
  onCanvas();
  await S.drawBadges();
  assert.deepEqual(summary()[0], { region: "Passage → Pit", x: 150, y: 180.2, r: 36, revealed: true, visible: true, cards: ["The Fighting Pit"] });
  assert.equal(S.badges[2].sprite.alpha, 0.35);
  assert.equal(layer().eventMode, "none");
  assert.equal(layer().zIndex, 1000);
  assert.deepEqual(F.canvas.interface.children, [layer()]);
  pinJSON("badges-gm", { badges: summary(), layer: pixiTree(layer()) }, import.meta.url);
});

test("player: a hidden region gets no badge; an unrevealed one shows '?'; none visible before it is seen", async () => {
  const P = onCanvas();
  W.behavior(P.cell, { id: `BhvCellQ${seq}`, revealed: false, destinations: [P.stair.uuid] });
  F.become({ userId: P1 });
  await S.drawBadges();
  F.become({ userId: GM });
  assert.deepEqual(summary().map(b => [b.region, b.revealed, b.visible]), [["Passage → Pit", true, false], ["Fork", true, false], ["Cell", false, false]]);
  const q = S.badges[2].sprite.children.find(c => c.text === "?");
  assert.deepEqual([q.style, q.anchor.x], [{ fontFamily: "Signika", fontSize: 39.6, fill: 0xd9c8ff }, 0.5]);
  assert.equal(S.badges[1].sprite.children.some(c => c.text === "2"), true, "two destinations: a count");
});

test("no canvas, no scene or no interface → no layer, badges cleared", async () => {
  onCanvas();
  await S.drawBadges();
  F.canvas.ready = false;
  await S.drawBadges();
  assert.equal(layer(), null);
  assert.deepEqual(S.badges, []);
});

test("concurrent draws: one live container per region, the earlier draw stops (U-9-6 generation guard)", async () => {
  const s = W.scene({ id: "ScnOne", name: "One", regions: [{ id: "RegOne", name: "One", bounds: { x: 100, y: 200, width: 100, height: 100 }, behaviors: [{ id: "BhvOne", destinations: ["Scene.ScnTwo.Region.RegTwo"] }] }] });
  W.scene({ id: "ScnTwo", name: "Two", regions: [{ id: "RegTwo", name: "Two", flags: { "pentaryn-portals": { img: "slow.webp" } } }] });
  F.canvas.ready = true;
  F.canvas.scene = s;
  const d = deferred();
  W.textures["slow.webp"] = d.promise;
  const first = S.drawBadges();
  const firstLayer = layer();
  const second = S.drawBadges();
  d.resolve({ src: "slow.webp", width: 100, height: 100 });
  await Promise.all([first, second]);
  assert.equal(S.badges.length, 1);
  assert.equal(firstLayer.destroyed, true);
  assert.equal(layer().children.length, 1);
  assert.deepEqual(F.canvas.interface.children, [layer()]);
});

test("a canvasTearDown during the texture wait leaves no badge and no throw", async () => {
  const d = deferred();
  W.textures["slow.webp"] = d.promise;
  const draw = S.drawBadges();
  F.fire("canvasTearDown");
  d.resolve({ src: "slow.webp", width: 100, height: 100 });
  await draw;
  assert.deepEqual(S.badges, []);
  assert.equal(layer(), null);
});

test("a texture that fails to load, or a layer that fails to destroy: the badge still draws, nothing throws", async () => {
  const P = onCanvas();
  W.textures["cards/pit.webp"] = "reject";
  await S.drawBadges();
  W.textures["cards/pit.webp"] = { src: "cards/pit.webp", width: 200, height: 100 };
  assert.equal(S.badges.length, 3);
  assert.equal(S.badges[0].sprite.children.some(c => c.constructor.name === "Sprite"), false);
  PIXI.throwOnDestroy = true;
  try { await S.drawBadges(); } finally { PIXI.throwOnDestroy = false; }
  assert.equal(S.badges.length, 3);
  void P;
});

test("edit mode: setEditing redraws with a dashed square and a move glyph; off removes them", async () => {
  const P = onCanvas();
  S.setEditing(P.passage, true);
  await W.flush();
  assert.deepEqual([...S.editing], [P.passage.uuid]);
  const kids = S.badges[0].sprite.children;
  const r3 = v => (typeof v === "number" ? Math.round(v * 1000) / 1000 : v);
  assert.deepEqual(kids.at(-2).ops.map(o => o.map(r3)), [["lineStyle", 3, 0xffd34d, 0.9], ["drawRect", -50, 19.8, 100, 100]]);
  assert.equal(kids.at(-1).text, "✥");
  S.setEditing(P.passage, false);
  await W.flush();
  assert.deepEqual([...S.editing], []);
  assert.equal(S.badges[0].sprite.children.some(c => c.text === "✥"), false);
  F.canvas.ready = false;
  const runs = S.state().drawRun;
  S.setEditing(P.passage, true);
  assert.equal(S.state().drawRun, runs, "canvas down: remembered, not drawn");
  S.setEditing(P.passage, false);
});

test("samplePoints: centre plus a quarter-square in from each corner", () => {
  F.canvas.grid.size = 100;
  assert.deepEqual(S.samplePoints({ x: 0, y: 0, width: 100, height: 100 }), [
    { x: 50, y: 50 }, { x: 25, y: 25 }, { x: 75, y: 25 }, { x: 25, y: 75 }, { x: 75, y: 75 },
  ]);
  assert.deepEqual(S.samplePoints({ x: 0, y: 0, width: 40, height: 200 }), [
    { x: 20, y: 100 }, { x: 10, y: 10 }, { x: 30, y: 10 }, { x: 10, y: 190 }, { x: 30, y: 190 },
  ]);
});

test("refreshBadgeSight: GM sees all; a player sees a badge once explored or in sight, and it stays (seen)", async () => {
  const P = onCanvas();
  await S.drawBadges();
  F.become({ userId: P1 });
  W.explored = p => p.x === 150 && p.y === 250;            // the passage's centre
  W.visible = () => false;
  const n = F.calls.length;
  S.refreshBadgeSight();
  assert.deepEqual(S.badges.map(b => b.sprite.visible), [true, false, false]);
  assert.deepEqual(W.callsSince(n, ["testVisibility"]).map(c => [c.n, c.opts]), [[5, { tolerance: 0 }], [5, { tolerance: 0 }]]);
  W.explored = () => false;
  S.refreshBadgeSight();
  assert.equal(S.badges[0].sprite.visible, true, "seen stays");
  assert.equal(S.seen.has(P.passage.uuid), true);
  W.visible = pts => pts[0].x === 550;                      // the fork, in sight now
  S.refreshBadgeSight();
  assert.deepEqual(S.badges.map(b => b.sprite.visible), [true, true, false]);
  F.become({ userId: GM });
  S.refreshBadgeSight();
  assert.deepEqual(S.badges.map(b => b.sprite.visible), [true, true, true]);
});

test("sightRefresh hook: players only, and only with badges", async () => {
  onCanvas();
  await S.drawBadges();
  let n = F.calls.length;
  F.fire("sightRefresh");
  assert.equal(W.callsSince(n, ["testVisibility"]).length, 0, "GM: skipped");
  F.become({ userId: P1 });
  n = F.calls.length;
  F.fire("sightRefresh");
  assert.ok(W.callsSince(n, ["testVisibility"]).length > 0);
  S.badges.length = 0;
  n = F.calls.length;
  F.fire("sightRefresh");
  assert.equal(W.callsSince(n, ["testVisibility"]).length, 0, "no badges: skipped");
  F.become({ userId: GM });
});

test("badgeAt: a visible badge within 1.1 r of the pointer", async () => {
  onCanvas();
  await S.drawBadges();
  assert.equal(S.badgeAt(150, 180)?.region.name, "Passage → Pit");
  assert.equal(S.badgeAt(150 + 39, 180.2)?.region.name, "Passage → Pit");
  assert.equal(S.badgeAt(150 + 40, 180.2), null);
  S.badges[0].sprite.visible = false;
  assert.equal(S.badgeAt(150, 180), null);
  F.canvas.ready = false;
  assert.equal(S.badgeAt(550, 180), null);
});

test("hover card: cards when revealed, 'A way onward' when not; follows the pointer; hides (golden/hover.json)", async () => {
  const P = onCanvas();
  await S.drawBadges();
  S.showTip(S.badges[1], { clientX: 10, clientY: 20 });
  const tip = S.state().tip;
  assert.equal(tip.parentNode, W.doc.body);
  assert.deepEqual([tip.className, tip.style.left, tip.style.top, tip.style.display, tip.dataset.key], ["ppt-hover ppt-dialog", "28px", "38px", "block", P.fork.uuid]);
  const revealed = tip.innerHTML;
  S.badges[2].revealed = false;
  S.showTip(S.badges[2], { clientX: 0, clientY: 0 });
  pinJSON("hover", { revealed, unrevealed: tip.innerHTML }, import.meta.url);
  S.hideTip();
  assert.deepEqual([tip.style.display, tip.dataset.key], ["none", ""]);
  F.become({ userId: P1 });
  S.showTip(S.badges[0], { clientX: 0, clientY: 0 });
  S.badges[0].sprite.visible = false;
  S.seen.delete(S.badges[0].region.uuid);
  W.explored = () => false;
  W.visible = () => false;
  S.refreshBadgeSight();
  assert.equal(tip.style.display, "none", "its badge went out of sight: the tip hides");
  F.become({ userId: GM });
});

test("GM menu: look / teleport per card, preview, edit, region settings (golden/menu.json); a click runs one and closes", async () => {
  const P = onCanvas();
  await S.drawBadges();
  S.openMenu(S.badges[1], { clientX: 300, clientY: 40 });
  const menu = S.state().menu;
  assert.equal(menu.parentNode, W.doc.body);
  assert.deepEqual([menu.style.left, menu.style.top], ["300px", "40px"]);
  pinJSON("menu", menu.outerHTML, import.meta.url);
  const n = F.calls.length;
  await menu.fire("click", { target: menu.querySelector('a[data-i="6"]') });
  assert.deepEqual(W.callsSince(n, ["sheet.render"]), [{ op: "sheet.render", uuid: P.fork.uuid, force: true }]);
  assert.equal(S.state().menu, null);
  assert.equal(menu.parentNode, null);
  S.openMenu(S.badges[0], { clientX: 0, clientY: 0 });
  const m2 = S.state().menu;
  await m2.fire("click", { target: m2 });
  assert.equal(S.state().menu, m2, "a click off an item does nothing");
  await m2.fire("click", { target: m2.querySelector('a[data-i="0"]') });
  await W.flush();
  assert.equal(F.calls.some(c => c.op === "scene.view" && c.scene === P.pit.id), true, "Look at → lookAt");
  F.canvas.scene = P.prison;
  S.closeMenu();
});

test("menu items: Teleport party → teleportParty; Preview and Edit → PortalCard.open", async () => {
  const P = onCanvas();
  await S.drawBadges();
  const pick = async i => {
    S.openMenu(S.badges[0], { clientX: 0, clientY: 0 });
    const m = S.state().menu;
    await m.fire("click", { target: m.querySelector(`a[data-i="${i}"]`) });
    await W.flush();
  };
  let n = F.calls.length;
  await pick(1);
  assert.deepEqual(W.callsSince(n, ["notify"]).map(c => c.message), ["Teleport party: nobody on this scene counts as the party."], "→ teleportParty (no actors here)");
  n = F.calls.length;
  await pick(2);
  assert.deepEqual(W.callsSince(n, ["app.render"]).map(c => c.id), [`pentaryn-portal-card-${P.passage.id}`]);
  assert.equal(S.editing.has(P.passage.uuid), false, "preview: not editing");
  n = F.calls.length;
  await pick(3);
  assert.equal(S.editing.has(P.passage.uuid), true, "edit: editing");
  S.editing.delete(P.passage.uuid);
});

test("bindBoard: once per board; hover shows the tip; pointerleave hides it", async () => {
  onCanvas();
  await S.drawBadges();
  S.bindBoard();
  const count = W.board.listeners.length;
  S.bindBoard();
  assert.equal(W.board.listeners.length, count);
  assert.equal(W.board.dataset.ppBound, "1");
  assert.deepEqual(W.board.listeners.map(l => [l.type, l.capture]), [
    ["pointermove", false], ["pointerdown", true], ["pointermove", true], ["pointerup", true], ["pointerleave", false], ["contextmenu", true],
  ]);
  await W.board.fire("pointermove", { clientX: 150, clientY: 180 });
  assert.equal(S.state().tip.style.display, "block");
  await W.board.fire("pointermove", { clientX: 900, clientY: 900 });
  assert.equal(S.state().tip.style.display, "none");
  await W.board.fire("pointermove", { clientX: 150, clientY: 180 });
  await W.board.fire("pointerleave", {});
  assert.equal(S.state().tip.style.display, "none");
});

test("bindBoard: over an edit-mode badge the cursor is 'move'; leaving restores exactly the prior cursor", async () => {
  const P = onCanvas();
  S.editing.add(P.passage.uuid);
  await S.drawBadges();
  W.board.style.cursor = "var(--cursor-default)";
  await W.board.fire("pointermove", { clientX: 150, clientY: 180 });
  assert.equal(W.board.style.cursor, "move");
  await W.board.fire("pointermove", { clientX: 900, clientY: 900 });
  assert.equal(W.board.style.cursor, "var(--cursor-default)");
  W.board.style.cursor = "var(--cursor-ruler)";
  await W.board.fire("pointermove", { clientX: 900, clientY: 900 });
  assert.equal(W.board.style.cursor, "var(--cursor-ruler)", "never written when not over a badge");
  S.editing.delete(P.passage.uuid);
});

test("bindBoard: drag an edit-mode badge (GM, left button) → the sprite follows, release moves the region", async () => {
  const P = onCanvas();
  S.editing.add(P.passage.uuid);
  await S.drawBadges();
  const down = await W.board.fire("pointerdown", { clientX: 150, clientY: 180, button: 0, pointerId: 7 });
  assert.equal(down.event.defaultPrevented, true);
  assert.equal(down.event.immediateStopped, true);
  assert.equal(W.board.pointerCapture, 7);
  const move = await W.board.fire("pointermove", { clientX: 260, clientY: 190 });
  assert.equal(move.event.immediateStopped, true, "the tip listener never sees a drag move");
  assert.deepEqual([S.badges[0].sprite.x, S.badges[0].sprite.y], [260, 190.2]);
  const n = F.calls.length;
  await W.board.fire("pointerup", { clientX: 260, clientY: 190 });
  assert.equal(S.state().drag, null);
  assert.deepEqual(W.callsSince(n, ["update"]).map(c => [c.uuid, c.changes.shapes[0].x, c.changes.shapes[0].y]), [[P.passage.uuid, 250, 250]]);
  S.editing.delete(P.passage.uuid);
});

test("bindBoard: no drag for a player, a right button, or a badge not in edit mode; pointerup without a drag is ignored", async () => {
  onCanvas();
  await S.drawBadges();
  let r = await W.board.fire("pointerdown", { clientX: 150, clientY: 180, button: 0 });
  assert.equal(r.event.defaultPrevented, false, "not in edit mode");
  S.editing.add(S.badges[0].region.uuid);
  r = await W.board.fire("pointerdown", { clientX: 150, clientY: 180, button: 2 });
  assert.equal(r.event.defaultPrevented, false, "right button");
  F.become({ userId: P1 });
  r = await W.board.fire("pointerdown", { clientX: 150, clientY: 180, button: 0 });
  F.become({ userId: GM });
  assert.equal(r.event.defaultPrevented, false, "player");
  r = await W.board.fire("pointerup", { clientX: 150, clientY: 180 });
  assert.equal(r.event.immediateStopped, false);
  S.editing.clear();
});

test("bindBoard: right-click a badge opens the GM menu (players: nothing); an outside pointerdown closes it", async () => {
  onCanvas();
  await S.drawBadges();
  F.become({ userId: P1 });
  let r = await W.board.fire("contextmenu", { clientX: 150, clientY: 180 });
  F.become({ userId: GM });
  assert.equal(S.state().menu, null);
  assert.equal(r.event.defaultPrevented, false);
  r = await W.board.fire("contextmenu", { clientX: 900, clientY: 900 });
  assert.equal(S.state().menu, null);
  r = await W.board.fire("contextmenu", { clientX: 150, clientY: 180 });
  assert.deepEqual([r.event.defaultPrevented, r.event.propagationStopped], [true, true]);
  const menu = S.state().menu;
  assert.ok(menu);
  await W.doc.fire("pointerdown", { target: menu.firstElementChild });
  assert.equal(S.state().menu, menu, "inside the menu: stays");
  await W.doc.fire("pointerdown", { target: W.board });
  assert.equal(S.state().menu, null);
});

test("moveRegion: snaps the bounds' corner, moves every shape and the region's travel tiles (golden/move-region.json)", async () => {
  const s = W.scene({
    id: "ScnMove", name: "Move",
    tiles: [{ id: "TileGlyph", x: 120, y: 220, flags: { pentaryn: { travel: { regionId: "RegMove" } } } }, { id: "TileOther", x: 0, y: 0 }],
  });
  const r = W.region(s, {
    id: "RegMove", name: "Move", bounds: { x: 100, y: 200, width: 100, height: 100 },
    shapes: [
      { type: "rectangle", x: 150, y: 250, width: 100, height: 100 },
      { type: "polygon", points: [100, 200, 200, 200, 200, 300] },
      { type: "ellipse", x: null, y: 250, radiusX: 50 },
    ],
  });
  const n = F.calls.length;
  await S.moveRegion(r, 130, 40);
  const writes = W.callsSince(n, ["getSnappedPoint", "update", "updateEmbedded"]);
  pinJSON("move-region", writes, import.meta.url);
  assert.deepEqual(writes[1].changes.shapes[2], { type: "ellipse", x: null, y: 250, radiusX: 50 });
});

test("moveRegion: a sub-square nudge redraws instead of writing; no shapes or no bounds → nothing", async () => {
  onCanvas();
  const s = W.scene({ id: "ScnNudge", name: "Nudge" });
  const r = W.region(s, { id: "RegNudge", name: "Nudge", bounds: { x: 100, y: 200, width: 100, height: 100 } });
  let runs = S.state().drawRun;
  let n = F.calls.length;
  await S.moveRegion(r, 10, -20);
  assert.equal(W.callsSince(n, ["update", "updateEmbedded"]).length, 0);
  assert.equal(S.state().drawRun, runs + 1);
  r.shapes = [];
  n = F.calls.length;
  runs = S.state().drawRun;
  await S.moveRegion(r, 300, 0);
  assert.deepEqual(W.callsSince(n), []);
  assert.equal(S.state().drawRun, runs);
});

test("canvasReady binds the board and draws; canvasTearDown hides the tip, closes the menu, drops the badges", async () => {
  onCanvas();
  const runs = S.state().drawRun;
  F.fire("canvasReady");
  await W.flush();
  assert.equal(S.state().drawRun, runs + 1);
  assert.equal(S.badges.length, 3);
  S.showTip(S.badges[0], { clientX: 0, clientY: 0 });
  S.openMenu(S.badges[0], { clientX: 0, clientY: 0 });
  F.fire("canvasTearDown");
  assert.equal(S.state().tip.style.display, "none");
  assert.equal(S.state().menu, null);
  assert.equal(S.state().drawRun, runs + 2);
  assert.deepEqual(S.badges, []);
  assert.equal(layer(), null);
});

test("gaps: moveRegion uses a shape's own toObject() when it has one", async () => {
  const s = W.scene({ id: "ScnShape", name: "Shape" });
  const shape = { type: "rectangle", x: 150, y: 250, width: 100, height: 100, toObject: () => ({ type: "rectangle", x: 150, y: 250, width: 100, height: 100, fromToObject: true }) };
  const r = W.region(s, { id: "RegShape", name: "Shape", bounds: { x: 100, y: 200, width: 100, height: 100 }, shapes: [shape] });
  const n = F.calls.length;
  await S.moveRegion(r, 100, 100);
  assert.deepEqual(W.callsSince(n, ["update"]).map(c => c.changes.shapes), [[{ type: "rectangle", x: 250, y: 350, width: 100, height: 100, fromToObject: true }]]);
});
