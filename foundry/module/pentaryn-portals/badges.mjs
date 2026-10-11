/**
 * Pentaryn Portal Cards — FEATURE: travel badges above the darkness, once seen; the hover card, the
 * GM right-click menu, and drag-to-move in edit mode.
 *
 * Why not a Tile: tiles sit on the primary canvas, so a scene at darkness 1 swallows them — the
 * travel-ring tiles on the Prison and Pit were there and invisible, and read as "deleted". A badge
 * on `canvas.interface` draws above lighting and vision, so it shows in the dark.
 *
 * Drawing above vision also means it would show through the fog from across the map, so a player
 * only sees a badge once its square has been seen: in sight now (lit, or within darkvision), or
 * already explored. Once seen it stays, like a map pin. The GM always sees every badge.
 *
 * It floats just above the region square, like a signpost, so it never sits over a token standing
 * on the trigger. Hit-testing is done in DOM space (pointermove / contextmenu on the board) rather
 * than with PIXI interactivity, so the badge can never swallow a click meant for a token.
 *
 * All badge state lives here and only here.
 */

import { cardHTML, esc, samplePoints as samplePointsAt } from "./portals-core.mjs";
import { cardFor, destinationsOf, lookAt, moveRegionDocs, teleportParty } from "./scene-adapter.mjs";
import { PortalCard, configureCardApp } from "./card-app.mjs";
import { BADGE_ROWS } from "./api-manifest.mjs";
import { toPlain } from "./lib/api.mjs";
import { refOf } from "./lib/resolve.mjs";

let badgeLayer = null;
/**
 * Bumped by every draw and by canvas teardown. drawBadges awaits each badge's texture; a scene
 * activation (canvasTearDown → badgeLayer = null) or a second draw (a region hook, canvasReady) in
 * that gap left the first draw adding to a null layer: "Cannot read properties of null (reading
 * 'addChild')" on the player client (usability Area 9). A draw that is no longer the latest stops.
 */
let drawRun = 0;
export const badges = []; // { region, x, y, r, cards, sprite }
/** Region uuids this client has seen in sight, so a badge stays once found even before fog saves. */
export const seen = new Set();
/** Region uuids whose Portal card window is in edit mode: their badge can be dragged. */
export const editing = new Set();
let tip = null;
let menu = null;
let drag = null;
/** The module's log, from install(). */
let log = null;
/** The hook registry's pass-through guard, from install(). */
let guard = (label, fn) => fn;

export function setEditing(region, on) {
  if (on) editing.add(region.uuid); else editing.delete(region.uuid);
  if (canvas?.ready) redrawNow();
}

/**
 * A fire-and-forget draw (edit toggle, canvasReady): nothing awaits it, so a failed draw warns
 * `pentaryn-portals | badge redraw failed` instead of an unattributed rejection (-27).
 */
function redrawNow() {
  drawBadges().catch(err => log?.warn("badge redraw failed", err));
}

export async function drawBadges() {
  const run = ++drawRun;
  try { badgeLayer?.destroy({ children: true }); } catch (err) { log?.debug("badge layer destroy", err); }
  badgeLayer = null;
  badges.length = 0;
  if (!canvas?.ready || !canvas.scene || !canvas.interface) return;
  const layer = badgeLayer = new PIXI.Container();
  layer.eventMode = "none";
  layer.zIndex = 1000;
  canvas.interface.addChild(layer);
  const stale = () => run !== drawRun || layer.destroyed || !canvas?.ready;
  const g = canvas.grid.size;
  for (const region of canvas.scene.regions) {
    const dests = destinationsOf(region);
    if (!dests.length) continue;
    if (region.hidden && !game.user.isGM) continue;
    const revealed = dests.every(d => d.behavior.system.revealed) || game.user.isGM;
    const b = region.bounds ?? region.object?.bounds;
    if (!b) continue;
    const r = g * 0.36;
    const x = b.x + b.width / 2, y = b.y - r * 0.55;
    const c = new PIXI.Container();
    c.position.set(x, y);
    c.alpha = region.hidden ? 0.35 : 1;
    const back = new PIXI.Graphics().beginFill(0x120a24, 0.9).drawCircle(0, 0, r).endFill();
    c.addChild(back);
    const first = cardFor(dests[0].region);
    if (revealed && first.img) {
      try {
        const tex = await foundry.canvas.loadTexture(first.img.split("?")[0]);
        if (tex) {
          const spr = new PIXI.Sprite(tex);
          const scale = (2 * r) / Math.min(tex.width, tex.height);
          spr.scale.set(scale);
          spr.anchor.set(0.5);
          const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0, 0, r - 3).endFill();
          c.addChild(spr, mask);
          spr.mask = mask;
        }
      } catch (err) {
        log?.warnOnce(`card image ${first.img}`, `card image ${first.img}`, err);
      }
    } else {
      const q = new PIXI.Text("?", { fontFamily: "Signika", fontSize: r * 1.1, fill: 0xd9c8ff });
      q.anchor.set(0.5);
      c.addChild(q);
    }
    const ring = new PIXI.Graphics().lineStyle(Math.max(3, g * 0.04), 0x8a5cff, 1).drawCircle(0, 0, r);
    // a small tail pointing down at the square it belongs to
    ring.beginFill(0x8a5cff).drawPolygon([-r * 0.22, r * 0.92, r * 0.22, r * 0.92, 0, r * 1.35]).endFill();
    c.addChild(ring);
    if (dests.length > 1) {
      const n = new PIXI.Text(String(dests.length), { fontFamily: "Signika", fontSize: r * 0.55, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 });
      n.anchor.set(0.5);
      n.position.set(r * 0.72, -r * 0.72);
      c.addChild(n);
    }
    if (editing.has(region.uuid)) {
      // edit mode: a dashed outline of the square it will move, and a move glyph
      const sq = new PIXI.Graphics().lineStyle(3, 0xffd34d, 0.9);
      // the badge sits r*0.55 above the region's top edge, so that edge is at +r*0.55 locally
      sq.drawRect(-b.width / 2, r * 0.55, b.width, b.height);
      const mv = new PIXI.Text("✥", { fontFamily: "Signika", fontSize: r * 0.6, fill: 0xffd34d, stroke: 0x000000, strokeThickness: 4 });
      mv.anchor.set(0.5); mv.position.set(-r * 0.72, -r * 0.72);
      c.addChild(sq, mv);
    }
    if (stale()) {
      try { c.destroy({ children: true }); } catch (err) { log?.debug("stale badge destroy", err); }
      return;
    }
    layer.addChild(c);
    badges.push({ region, x, y, r, revealed, bounds: b, sprite: c, cards: dests.map(d => cardFor(d.region)) });
  }
  refreshBadgeSight();
}

/** Sample points of a region's square(s) on the viewed canvas (core samplePoints). */
export const samplePoints = b => samplePointsAt(b, canvas.grid.size);

/** Players: show a badge only once its square has been in sight or explored. */
export function refreshBadgeSight() {
  for (const badge of badges) {
    if (game.user.isGM || seen.has(badge.region.uuid)) { badge.sprite.visible = true; continue; }
    const pts = samplePoints(badge.bounds);
    const now = pts.some(p => canvas.fog.isPointExplored(p))
      || canvas.visibility.testVisibility(pts, { tolerance: 0 });
    if (now) seen.add(badge.region.uuid);
    badge.sprite.visible = now;
  }
  const key = tip?.dataset.key;
  if (key && !badges.some(b => b.sprite.visible && b.region.uuid === key)) hideTip();
}

export function badgeAt(clientX, clientY) {
  if (!canvas?.ready || !badges.length) return null;
  const p = canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
  return badges.find(b => b.sprite.visible && Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.1) ?? null;
}

/* hover card */
export function showTip(badge, ev) {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "ppt-hover ppt-dialog";
    document.body.append(tip);
  }
  const key = badge.region.uuid;
  if (tip.dataset.key !== key) {
    tip.dataset.key = key;
    tip.innerHTML = badge.revealed
      ? `<div class="ppt-cards">${badge.cards.map(c => cardHTML(c)).join("")}</div>`
      : `<div class="ppt-card"><div class="ppt-text"><h4>A way onward</h4><p class="ppt-desc">You can't tell where it leads.</p></div></div>`;
  }
  tip.style.left = `${ev.clientX + 18}px`;
  tip.style.top = `${ev.clientY + 18}px`;
  tip.style.display = "block";
}
export function hideTip() { if (tip) { tip.style.display = "none"; tip.dataset.key = ""; } }

/* GM right-click menu */
export function closeMenu() { menu?.remove(); menu = null; }
export function openMenu(badge, ev) {
  closeMenu();
  hideTip();
  menu = document.createElement("nav");
  menu.className = "ppt-menu";
  const items = [];
  for (const c of badge.cards) {
    items.push({ icon: "fa-binoculars", label: `Look at ${c.title}`, run: () => lookAt(fromUuidSync(c.uuid)) });
    items.push({ icon: "fa-person-walking-arrow-right", label: `Teleport party → ${c.title}`, run: () => teleportParty(fromUuidSync(c.uuid)) });
  }
  items.push({ icon: "fa-eye", label: "Preview card (player view)", run: () => PortalCard.open(badge.region, { edit: false }) });
  items.push({ icon: "fa-pen", label: "Edit card", run: () => PortalCard.open(badge.region, { edit: true }) });
  items.push({ icon: "fa-gear", label: "Region settings", run: () => badge.region.sheet.render(true) });
  menu.innerHTML = items.map((it, i) => `<a data-i="${i}"><i class="fa-solid ${it.icon}"></i> ${esc(it.label)}</a>`).join("");
  menu.style.left = `${ev.clientX}px`;
  menu.style.top = `${ev.clientY}px`;
  menu.addEventListener("click", e => {
    const a = e.target.closest("a[data-i]");
    if (!a) return;
    closeMenu();
    items[Number(a.dataset.i)].run();
  });
  document.body.append(menu);
}

export function bindBoard() {
  const board = document.getElementById("board");
  if (!board || board.dataset.ppBound) return;
  board.dataset.ppBound = "1";
  // PIXI owns #board.style.cursor (it writes "var(--cursor-…)" and only rewrites on a mode change).
  // Touch it only while over an edit-mode badge, and put back exactly what was there on leaving;
  // writing "" on every move erased Foundry's hands and pentaryn-cursors' tool cursors.
  let priorCursor = null;
  board.addEventListener("pointermove", ev => {
    if (drag) return;
    const b = badgeAt(ev.clientX, ev.clientY);
    if (b) showTip(b, ev); else hideTip();
    const move = !!(b && editing.has(b.region.uuid));
    if (move) {
      if (board.style.cursor !== "move") { priorCursor = board.style.cursor; board.style.cursor = "move"; }
    } else if (!move && priorCursor !== null) {
      if (board.style.cursor === "move") board.style.cursor = priorCursor;
      priorCursor = null;
    }
  });
  // Drag a badge in edit mode. Capture phase + stopImmediatePropagation so the canvas never
  // starts a selection box or a token drag underneath it.
  board.addEventListener("pointerdown", ev => {
    if (!game.user.isGM || ev.button !== 0) return;
    const b = badgeAt(ev.clientX, ev.clientY);
    if (!b || !editing.has(b.region.uuid)) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    hideTip();
    const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    drag = { badge: b, start: p, bx: b.sprite.x, by: b.sprite.y };
    board.setPointerCapture?.(ev.pointerId);
  }, true);
  board.addEventListener("pointermove", ev => {
    if (!drag) return;
    ev.stopImmediatePropagation();
    const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    drag.badge.sprite.position.set(drag.bx + p.x - drag.start.x, drag.by + p.y - drag.start.y);
  }, true);
  board.addEventListener("pointerup", guard("badge drag release", async ev => {
    if (!drag) return;
    ev.stopImmediatePropagation();
    const d = drag; drag = null;
    const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    await moveRegion(d.badge.region, p.x - d.start.x, p.y - d.start.y);
  }), true);
  board.addEventListener("pointerleave", hideTip);
  board.addEventListener("contextmenu", ev => {
    if (!game.user.isGM) return;
    const b = badgeAt(ev.clientX, ev.clientY);
    if (!b) return;
    ev.preventDefault();
    ev.stopPropagation();
    openMenu(b, ev);
  }, true);
  document.addEventListener("pointerdown", ev => { if (menu && !menu.contains(ev.target)) closeMenu(); }, true);
}

/**
 * Move a travel spot by (dx, dy) (scene-adapter moveRegionDocs). A drag that snaps back to where
 * it was writes nothing, so redraw the badge the drag displaced.
 */
export async function moveRegion(region, dx, dy) {
  const moved = await moveRegionDocs(region, dx, dy);
  if (moved === false) return drawBadges();
}

/* -------------------------------------------- */

const REGION_HOOKS = ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"];
/** Region writes come in bursts (a spell template: create, aoe's ownership and attachment writes). */
const REDRAW_MS = 50;

/**
 * Finding -24, change 2 (the generation guard, change 1, shipped in U-9-6): the six region hooks
 * share one trailing 50 ms redraw, so a burst draws once. setEditing, canvasReady and the API's
 * redraw() stay immediate. No relevance filter: a badge shows its DESTINATION's card, so a write
 * to a region on another scene can change a badge here. Created at install (foundry.utils).
 */
let queueDraw = null;

function onCanvasTearDown() { queueDraw?.cancel(); hideTip(); closeMenu(); drawRun++; badges.length = 0; badgeLayer = null; }

/** The API rows this feature contributes (api-manifest BADGE_ROWS). */
export const contribution = () => ({ rows: BADGE_ROWS, impl: { open: PortalCard.open, redraw: drawBadges, badges: listBadges } });

/** The API's badges(): plain JSON of what is drawn on this client now. */
function listBadges() {
  return toPlain(badges.map(b => ({ region: refOf(b.region), revealed: !!b.revealed, visible: !!b.sprite.visible, cards: b.cards })));
}

/** Test seam: the module-private state. */
export const _state = () => ({ badgeLayer, drawRun, tip, menu, drag });

export function install(reg, ctx) {
  log = ctx.log;
  guard = reg.guard;
  configureCardApp({ setEditing, guard: reg.guard });
  queueDraw = foundry.utils.debounce(() => {
    if (canvas?.ready) redrawNow();
  }, REDRAW_MS);
  for (const h of REGION_HOOKS) reg.on(h, () => { if (canvas?.ready) queueDraw(); }, { guard: false, label: "badges redraw" });
  reg.on("canvasReady", () => { bindBoard(); redrawNow(); }, { guard: false, label: "badges draw" });
  // hot: badges — refreshBadgeSight walks only the badge list, never the scene
  reg.on("sightRefresh", () => { if (badges.length && !game.user.isGM) refreshBadgeSight(); }, { guard: false, label: "badges sight" });
  reg.on("canvasTearDown", onCanvasTearDown, { guard: false, label: "badges teardown" });
  return contribution();
}

/** Destroy the layer, hide the tip, close the menu. The #board listeners stay (dataset.ppBound). */
export function uninstall() {
  try { badgeLayer?.destroy({ children: true }); } catch (err) { log?.debug("badge layer destroy", err); }
  onCanvasTearDown();
}
