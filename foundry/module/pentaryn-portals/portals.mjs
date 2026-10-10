/**
 * Pentaryn Portal Cards
 * =====================
 *
 * Foundry v14's Teleport Token behavior (core, no module) asks before it moves a token when
 * `choice` is on — but the question is a bare sentence, and with several destinations it is a
 * `<select>` of region names. Players choosing between two exits want to see where each one goes.
 *
 * This replaces the *content* of that dialog with a card per destination: a thumbnail of the
 * spot, a title, and a GM-written description. Nothing about the teleport itself is touched —
 * the dialog's own Yes/No buttons and its callback still decide, and the multi-destination case
 * still submits a form field called `destination`; it is just radio cards now instead of a select.
 *
 * The card lives on the DESTINATION region, because it describes the place you arrive:
 *
 *     region.flags["pentaryn-portals"] = { title, img, description }
 *
 * Every field is optional. Missing title → the destination scene's nav name. Missing image → the
 * scene thumbnail. Missing description → no paragraph.
 *
 * GM authoring is on the Region's own config window (Appearance tab, "Portal card" section), with
 * a **Snapshot this spot** button that crops the scene's background art around the region and
 * saves it as the card image. Console: game.pentaryn.portals.snapshot(region).
 *
 * ⚠ Respects `revealed: false`. The core dialog hides the destination from players then ("you feel
 * a pull"), and so does this — a hidden destination never gets a card on a player's screen.
 */

import { summonerActorId, playerOwners, isScenery, partySelection, followersOf, ringSpots, wallBlocker,
  hasDestination, withoutDestination } from "./portals-core.mjs";

const MODULE = "pentaryn-portals";
const SNAP_DIR = "assets/tokens/custom/portals";
const esc = s => foundry.utils.escapeHTML(String(s ?? ""));

/** Card data for one destination region, with fallbacks. */
function cardFor(region) {
  const f = region?.flags?.[MODULE] ?? {};
  const scene = region?.parent;
  return {
    uuid: region.uuid,
    title: f.title?.trim() || scene?.navName || scene?.name || region.name,
    img: f.img?.trim() || scene?.thumb || "icons/svg/door-exit.svg",
    description: f.description?.trim() || ""
  };
}

function cardHTML(c, { radio = false, checked = false } = {}) {
  // Plain text with line breaks: the GM writes it in a textarea, players only read it.
  const desc = c.description ? `<p class="pp-desc">${esc(c.description).replace(/\n/g, "<br>")}</p>` : "";
  const body = `<img class="pp-thumb" src="${esc(c.img)}" alt="">
    <div class="pp-text"><h4>${esc(c.title)}</h4>${desc}</div>`;
  if (!radio) return `<div class="pp-card">${body}</div>`;
  return `<label class="pp-card pp-choice"><input type="radio" name="destination" value="${esc(c.uuid)}" ${checked ? "checked" : ""}>${body}</label>`;
}

/** The core dialog's id is `dialog-<behaviorUuid>-<tokenId>`. */
function behaviorOf(app) {
  const id = app?.id ?? "";
  if (!id.startsWith("dialog-") || !id.includes(".RegionBehavior.")) return null;
  const uuid = id.slice("dialog-".length, id.lastIndexOf("-"));
  const behavior = fromUuidSync(uuid);
  return behavior?.type === "teleportToken" ? behavior : null;
}

function decorate(app, element) {
  const behavior = behaviorOf(app);
  if (!behavior) return;
  const sys = behavior.system;
  if (!sys.revealed && !game.user.isGM) return; // keep an unrevealed destination secret
  const root = element instanceof HTMLElement ? element : element?.[0];
  const content = root?.querySelector(".dialog-content");
  if (!content || content.querySelector(".pp-cards")) return;

  const dests = [...(sys.destinations ?? [])].map(u => fromUuidSync(u, { relative: behavior })).filter(Boolean).map(cardFor);
  if (!dests.length) return;

  const wrap = document.createElement("div");
  wrap.className = "pp-cards";
  const select = content.querySelector('select[name="destination"]');
  if (select) {
    // Several exits: radio cards submit the same field name the core callback reads.
    const current = select.value;
    wrap.innerHTML = dests.map(c => cardHTML(c, { radio: true, checked: c.uuid === current })).join("");
    select.replaceWith(wrap);
  } else {
    wrap.innerHTML = cardHTML(dests[0]);
    content.append(wrap);
  }
  root.classList.add("pentaryn-portal-dialog");
  app.setPosition?.({ width: Math.max(app.position?.width ?? 0, 460), height: "auto" });
}

/* -------------------------------------------- */
/*  Snapshot: crop the scene art around a region */
/* -------------------------------------------- */

/**
 * Crop the destination scene's background around a region and save it as the card image.
 * Reads the background file directly (not the canvas), so it works for any scene — including
 * one nobody is viewing — and shows the art as drawn, not as darkness and vision render it.
 *
 * @param {RegionDocument|string} regionOrUuid
 * @param {{squaresWide?: number, squaresHigh?: number}} [opts]  Size of the window, in grid squares.
 */
async function snapshot(regionOrUuid, { squaresWide = 8, squaresHigh = 5 } = {}) {
  if (!game.user.isGM) return null;
  const region = typeof regionOrUuid === "string" ? fromUuidSync(regionOrUuid) : regionOrUuid;
  const scene = region?.parent;
  const src = scene?.background?.src;
  if (!src) { ui.notifications.warn("That region's scene has no background image to snapshot."); return null; }

  const b = region.bounds ?? region.object?.bounds;
  const shape = region.shapes?.[0];
  const cx = b ? b.x + b.width / 2 : (shape?.x ?? 0) + (shape?.width ?? 0) / 2;
  const cy = b ? b.y + b.height / 2 : (shape?.y ?? 0) + (shape?.height ?? 0) / 2;

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const d = scene.dimensions;
  const sx = img.naturalWidth / d.sceneWidth;          // image px per canvas px
  const sy = img.naturalHeight / d.sceneHeight;
  const g = d.size;
  let w = squaresWide * g * sx, h = squaresHigh * g * sy;
  let x = (cx - d.sceneX) * sx - w / 2, y = (cy - d.sceneY) * sy - h / 2;
  x = Math.max(0, Math.min(img.naturalWidth - w, x));
  y = Math.max(0, Math.min(img.naturalHeight - h, y));

  const OUT_W = 480, OUT_H = Math.round(OUT_W * h / w);
  const c = document.createElement("canvas");
  c.width = OUT_W; c.height = OUT_H;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, OUT_W, OUT_H);
  // Mark the arrival square so the thumbnail says *where*, not just *what*.
  const mx = ((cx - d.sceneX) * sx - x) * OUT_W / w, my = ((cy - d.sceneY) * sy - y) * OUT_H / h;
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(mx, my, Math.max(10, g * sx * OUT_W / w * 0.45), 0, Math.PI * 2); ctx.stroke();

  const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.88));
  const name = `${scene.id}-${region.id}.webp`;
  const FP = foundry.applications.apps.FilePicker.implementation;
  await FP.createDirectory("data", SNAP_DIR).catch(() => {});
  const res = await FP.upload("data", SNAP_DIR, new File([blob], name, { type: "image/webp" }), {}, { notify: false });
  const path = res?.path ?? `${SNAP_DIR}/${name}`;
  // Cache-bust so a re-snapshot shows immediately.
  await region.update({ [`flags.${MODULE}.img`]: `${path}?v=${Date.now().toString(36)}` });
  return path;
}

/* -------------------------------------------- */
/*  GM authoring on the Region config           */
/* -------------------------------------------- */

function injectConfig(app, element) {
  if (!game.user.isGM) return;
  const region = app.document;
  const root = element instanceof HTMLElement ? element : element?.[0];
  const tab = root?.querySelector("section.tab.region-appearance, section.tab[data-tab='appearance']");
  if (!tab || tab.querySelector(".pp-config")) return;
  const f = region.flags?.[MODULE] ?? {};
  const card = cardFor(region);
  const fs = document.createElement("fieldset");
  fs.className = "pp-config";
  fs.innerHTML = `
    <legend>Portal card</legend>
    <p class="hint">Shown to a player choosing to travel <em>here</em> from a linked teleport region.</p>
    <div class="form-group"><label>Title</label>
      <div class="form-fields"><input type="text" name="flags.${MODULE}.title" value="${esc(f.title ?? "")}" placeholder="${esc(card.title)}"></div></div>
    <div class="form-group"><label>Image</label>
      <div class="form-fields"><input type="text" name="flags.${MODULE}.img" value="${esc(f.img ?? "")}" placeholder="scene thumbnail">
      <button type="button" class="pp-snap" data-tooltip="Crop the map art around this region and use it"><i class="fa-solid fa-camera"></i></button></div></div>
    <div class="form-group stacked"><label>Description</label>
      <textarea name="flags.${MODULE}.description" rows="4" placeholder="What players read before they choose.">${esc(f.description ?? "")}</textarea></div>
    <div class="pp-preview">${cardHTML(card)}</div>`;
  tab.append(fs);
  fs.querySelector(".pp-snap").addEventListener("click", async ev => {
    ev.preventDefault();
    const path = await snapshot(region);
    if (path) {
      fs.querySelector(`input[name="flags.${MODULE}.img"]`).value = region.flags?.[MODULE]?.img ?? path;
      fs.querySelector(".pp-preview").innerHTML = cardHTML(cardFor(region));
    }
  });
  app.setPosition?.({ height: "auto" });
}

/* -------------------------------------------- */
/*  Badges: above the darkness, once seen       */
/* -------------------------------------------- */

/*
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
 */

let badgeLayer = null;
const badges = []; // { region, x, y, r, cards, sprite }
/** Region uuids this client has seen in sight, so a badge stays once found even before fog saves. */
const seen = new Set();
/** Region uuids whose Portal card window is in edit mode: their badge can be dragged. */
const editing = new Set();
function setEditing(region, on) {
  if (on) editing.add(region.uuid); else editing.delete(region.uuid);
  if (canvas?.ready) drawBadges();
}

function teleportBehaviors(region) {
  return region.behaviors.filter(b => b.type === "teleportToken" && !b.disabled);
}

/** Core 14.368+ stores a same-scene destination relative to its behavior; resolve against it. */
const toAbsolute = behavior => u => foundry.utils.parseUuid(u, { relative: behavior })?.uuid ?? null;

function destinationsOf(region) {
  const out = [];
  for (const b of teleportBehaviors(region)) for (const u of b.system.destinations ?? []) {
    const d = fromUuidSync(u, { relative: b });
    if (d) out.push({ region: d, behavior: b });
  }
  return out;
}

async function drawBadges() {
  try { badgeLayer?.destroy({ children: true }); } catch {}
  badges.length = 0;
  if (!canvas?.ready || !canvas.scene || !canvas.interface) return;
  badgeLayer = new PIXI.Container();
  badgeLayer.eventMode = "none";
  badgeLayer.zIndex = 1000;
  canvas.interface.addChild(badgeLayer);
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
      } catch {}
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
    badgeLayer.addChild(c);
    badges.push({ region, x, y, r, revealed, bounds: b, sprite: c, cards: dests.map(d => cardFor(d.region)) });
  }
  refreshBadgeSight();
}

/** Sample points of a region's square(s): the centre, plus a point a quarter-square in from each corner. */
function samplePoints(b) {
  const q = Math.min(canvas.grid.size / 4, b.width / 4, b.height / 4);
  return [
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    { x: b.x + q, y: b.y + q }, { x: b.x + b.width - q, y: b.y + q },
    { x: b.x + q, y: b.y + b.height - q }, { x: b.x + b.width - q, y: b.y + b.height - q }
  ];
}

/** Players: show a badge only once its square has been in sight or explored. */
function refreshBadgeSight() {
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

function badgeAt(clientX, clientY) {
  if (!canvas?.ready || !badges.length) return null;
  const p = canvas.canvasCoordinatesFromClient({ x: clientX, y: clientY });
  return badges.find(b => b.sprite.visible && Math.hypot(p.x - b.x, p.y - b.y) <= b.r * 1.1) ?? null;
}

/* hover card */
let tip = null;
function showTip(badge, ev) {
  if (!tip) {
    tip = document.createElement("div");
    tip.className = "pp-hover pentaryn-portal-dialog";
    document.body.append(tip);
  }
  const key = badge.region.uuid;
  if (tip.dataset.key !== key) {
    tip.dataset.key = key;
    tip.innerHTML = badge.revealed
      ? `<div class="pp-cards">${badge.cards.map(c => cardHTML(c)).join("")}</div>`
      : `<div class="pp-card"><div class="pp-text"><h4>A way onward</h4><p class="pp-desc">You can't tell where it leads.</p></div></div>`;
  }
  tip.style.left = `${ev.clientX + 18}px`;
  tip.style.top = `${ev.clientY + 18}px`;
  tip.style.display = "block";
}
function hideTip() { if (tip) { tip.style.display = "none"; tip.dataset.key = ""; } }

/* GM right-click menu */
let menu = null;
function closeMenu() { menu?.remove(); menu = null; }
function openMenu(badge, ev) {
  closeMenu();
  hideTip();
  menu = document.createElement("nav");
  menu.className = "pp-menu";
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

function bindBoard() {
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
  board.addEventListener("pointerup", async ev => {
    if (!drag) return;
    ev.stopImmediatePropagation();
    const d = drag; drag = null;
    const p = canvas.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    await moveRegion(d.badge.region, p.x - d.start.x, p.y - d.start.y);
  }, true);
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

let drag = null;

/**
 * Move a travel spot by (dx, dy), snapped so its first shape's corner lands on the grid. Every
 * shape moves together, and so does any travel-glyph tile tagged with this region's id.
 */
async function moveRegion(region, dx, dy) {
  const scene = region.parent;
  // Snap the region's BOUNDS, not a shape's x/y: in v14 a rectangle shape's x/y is its centre,
  // so snapping that to a grid vertex leaves the square half a cell off.
  const bounds = region.bounds;
  if (!region.shapes.length || !bounds) return;
  const ox = bounds.x, oy = bounds.y;
  const snapped = scene.grid.getSnappedPoint({ x: ox + dx, y: oy + dy }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
  const sx = snapped.x - ox, sy = snapped.y - oy;
  if (!sx && !sy) return drawBadges();
  const shapes = region.shapes.map(sh => {
    const o = sh.toObject?.() ?? foundry.utils.deepClone(sh);
    if (Array.isArray(o.points)) o.points = o.points.map((v, i) => v + (i % 2 ? sy : sx));
    if ("x" in o && o.x != null) o.x += sx;
    if ("y" in o && o.y != null) o.y += sy;
    return o;
  });
  await region.update({ shapes });
  const tiles = scene.tiles.filter(t => t.flags?.pentaryn?.travel?.regionId === region.id);
  if (tiles.length) await scene.updateEmbeddedDocuments("Tile", tiles.map(t => ({ _id: t.id, x: t.x + sx, y: t.y + sy })));
}

/* -------------------------------------------- */
/*  GM: move the whole party, and everyone's view */
/* -------------------------------------------- */

/**
 * GM only: go and look at a destination without moving anyone. Your view only; players stay put.
 * The destination's own badge (if it links back) is the way home, or the scene nav.
 */
async function lookAt(destRegion) {
  if (!game.user.isGM || !destRegion) return;
  const b = destRegion.bounds;
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  if (canvas.scene?.id !== destRegion.parent.id) {
    await destRegion.parent.view(); // resolves once the new canvas is drawn
  }
  await canvas.animatePan({ x, y, scale: Math.max(canvas.stage.scale.x, 0.6), duration: 600 });
  // No canvas.ping here: pings broadcast, and a player on that scene would see the GM looking.
  ui.notifications.info(`Looking at ${cardFor(destRegion).title}. Nobody moved; players can't see this.`);
}

/* Who counts as party. The rules are pure (portals-core.mjs); this turns a TokenDocument into
 * the plain record they read. */

function folderNames(actor) {
  const out = [];
  for (let f = actor?.folder; f; f = f.folder) out.push(f.name);
  return out;
}

function recordOf(t) {
  const a = t.actor;
  const gmIds = game.users.filter(u => u.isGM).map(u => u.id);
  let pile = false;
  try { pile = !!(a && game.itempiles?.API?.isValidItemPile?.(a)); } catch {}
  return {
    id: t.id,
    actorId: a?.id ?? t.actorId ?? null,
    type: a?.type ?? null,
    linked: !!t.actorLink,
    pile,
    excluded: !a || isScenery({ name: t.name, folders: folderNames(a) }) || isScenery({ name: a.name, folders: [] }),
    owners: playerOwners(a?.ownership, gmIds),
    summoner: summonerActorId(a?.getFlag?.("dnd5e", "summon.origin")),
    polymorphed: !!a?.getFlag?.("dnd5e", "isPolymorphed"),
    doc: t
  };
}

/**
 * Everyone who travels when the GM moves the party: linked PCs, plus every token a player owns
 * or a PC summoned (skeletons, familiars, Arcane Eye, steeds, transformed forms). Never item
 * piles, Markers or crowd.
 */
function partyTokens(scene) {
  return partySelection(scene.tokens.map(recordOf)).map(r => r.doc);
}

/** Snapped top-left positions for `toks`, filled outward from (cx, cy) on `dest`. */
function landingPlaces(dest, toks, cx, cy) {
  const g = dest.grid.size;
  // Skip squares a wall cuts off from the landing (the pit wall, a cell's bars). Tested against
  // the destination's wall documents, because that scene may not be on the canvas.
  const walls = dest.walls.filter(w => w.move > 0 && !(w.door > 0 && w.ds === 1)).map(w => w.c);
  // Don't land on someone already standing there (the PC who just arrived, a guard).
  const moving = new Set(toks.map(t => t.id));
  const standing = dest.tokens.filter(t => !moving.has(t.id))
    .map(t => ({ x: t.x, y: t.y, w: t.width * g, h: t.height * g }));
  const occupied = (x, y) => standing.some(s => x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h);
  const spots = ringSpots(cx, cy, g, toks.length, { blocked: wallBlocker(walls), occupied });
  return toks.map((t, i) => {
    const w = t.width * g, h = t.height * g;
    const s = dest.grid.getSnappedPoint({ x: spots[i].x - w / 2, y: spots[i].y - h / 2 }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
    return { x: s.x, y: s.y };
  });
}

/** GM: move tokens to another scene around (cx, cy). Plain create + delete, no `replacements`, so
 *  this never re-triggers the follow hook below. */
async function carryTo(toks, dest, cx, cy) {
  if (!toks.length) return;
  const from = toks[0].parent;
  const places = landingPlaces(dest, toks, cx, cy);
  const data = toks.map((t, i) => ({ ...t.toObject(), ...places[i] }));
  await dest.createEmbeddedDocuments("Token", data, { keepId: true });
  await from.deleteEmbeddedDocuments("Token", toks.map(t => t.id));
}

async function teleportParty(destRegion) {
  if (!game.user.isGM || !destRegion) return;
  const from = canvas.scene;
  const dest = destRegion.parent;
  const toks = partyTokens(from);
  const b = destRegion.bounds;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  if (dest === from) {
    const places = landingPlaces(dest, toks, cx, cy);
    await from.updateEmbeddedDocuments("Token", toks.map((t, i) => ({ _id: t.id, ...places[i] })), { teleport: true, animate: false });
  } else {
    await carryTo(toks, dest, cx, cy);
    dest.pullUsers(game.users.filter(u => !u.isGM && u.active));
    await dest.view();
  }
  ui.notifications.info(`${toks.length} party token${toks.length === 1 ? "" : "s"} moved to ${cardFor(destRegion).title}.`);
}

/* -------------------------------------------- */
/*  Native teleport: summons follow their PC     */
/* -------------------------------------------- */

/*
 * When a player walks their PC through a link to another scene, core's Teleport Token behavior
 * creates the PC on the destination and deletes the old token with `replacements`. Their summons
 * stay behind. The active GM sees that delete and carries the PC's followers (its own summons, and
 * tokens only that player owns) to land around the PC.
 *
 * Only a real portal counts: the PC must have been standing in a region whose teleport leads to
 * the destination scene. A GM cut-and-paste of a PC between scenes, or dnd5e reverting a form,
 * also deletes with `replacements`, and does not drag anything along.
 */
/** Tokens deleted by one operation, gathered so a party walking through together is one pass. */
const pendingOps = new WeakMap();

function cameThroughPortal(token, destScene) {
  const scene = token.parent;
  const c = token.getCenterPoint?.() ?? { x: token.x, y: token.y };
  const p = { x: c.x, y: c.y, elevation: token.elevation ?? 0 };
  return scene.regions.some(r => {
    if (!destinationsOf(r).some(d => d.region.parent === destScene)) return false;
    try { if (r.testPoint(p)) return true; } catch {}
    return !!r.bounds?.contains?.(p.x, p.y);
  });
}

async function bringFollowers(scene, deleted, replacements) {
  const leaders = [];
  for (const t of deleted) {
    const newUuid = replacements[t.id];
    let arrived = newUuid ? fromUuidSync(newUuid) : null;
    if (!arrived && newUuid) arrived = await fromUuid(newUuid).catch(() => null);
    if (!arrived || arrived.parent === scene) continue;           // same scene: not a portal hop
    const r = recordOf(t);
    if (r.type !== "character" && !r.polymorphed) continue;       // only a PC brings company
    if (!cameThroughPortal(t, arrived.parent)) continue;
    leaders.push({ record: r, arrived });
  }
  if (!leaders.length) return;
  const gone = new Set(deleted.map(t => t.id));
  const remaining = scene.tokens.filter(t => !gone.has(t.id)).map(recordOf);
  // Each PC's own company lands around that PC. Then, if several PCs went through together to
  // one scene, whatever they co-own (a shared steed) lands around the first of them.
  const passes = leaders.map(l => ({ group: [l.record], arrived: l.arrived }));
  const sameDest = leaders.filter(l => l.arrived.parent === leaders[0].arrived.parent);
  if (sameDest.length > 1) passes.push({ group: sameDest.map(l => l.record), arrived: sameDest[0].arrived });
  for (const { group, arrived } of passes) {
    const followers = followersOf(group, remaining.filter(x => scene.tokens.has(x.id))).map(x => x.doc);
    if (!followers.length) continue;
    const dest = arrived.parent;
    const g = dest.grid.size;
    const cx = arrived.x + arrived.width * g / 2, cy = arrived.y + arrived.height * g / 2;
    await carryTo(followers, dest, cx, cy);
    const names = followers.map(f => f.name).join(", ");
    ui.notifications.info(`${arrived.name} brought ${names} to ${dest.navName || dest.name}.`);
  }
}

Hooks.on("deleteToken", (token, options) => {
  const replacements = options?.replacements;
  if (!replacements || !game.users.activeGM?.isSelf) return;
  // One delete operation calls this hook once per token with the same options object, and the
  // others are already out of scene.tokens by then: collect them, then act once.
  const batch = pendingOps.get(options);
  if (batch) { batch.push(token); return; }
  const deleted = [token];
  pendingOps.set(options, deleted);
  const scene = token.parent;
  setTimeout(() => bringFollowers(scene, deleted, replacements)
    .catch(err => console.warn(`${MODULE} | summons did not follow`, err)), 0);
});

/* -------------------------------------------- */
/*  The card window: preview, with an edit toggle */
/* -------------------------------------------- */

/**
 * Make `from` lead to `to`: add it to from's teleport behavior, creating one (asking first,
 * revealed, fading) if from has none yet.
 */
async function linkRegions(from, to) {
  const b = teleportBehaviors(from)[0];
  if (b) {
    if (!hasDestination(b.system.destinations, to.uuid, toAbsolute(b))) {
      await b.update({ "system.destinations": [...b.system.destinations, to.uuid] });
    }
    return;
  }
  await from.createEmbeddedDocuments("RegionBehavior", [{
    name: "Teleport", type: "teleportToken",
    system: { destinations: [to.uuid], placement: "center", snap: true, choice: true, revealed: true,
      dialog: { revealed: null, unrevealed: null }, transition: { type: "fade", duration: 1500 } }
  }]);
}

class PortalCard extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ["pentaryn-portal-card", "pentaryn-portal-dialog"],
    window: { title: "Portal card", icon: "fa-solid fa-door-open", resizable: true },
    position: { width: 600, height: "auto" }
  };

  static open(region, { edit = false } = {}) {
    if (!game.user.isGM) return null;
    return new PortalCard(region, edit).render(true);
  }

  constructor(region, edit) {
    super({ id: `pentaryn-portal-card-${region.id}` });
    this.region = region;
    this.edit = edit;
    setEditing(region, edit);
  }

  async close(options) {
    setEditing(this.region, false);
    return super.close(options);
  }

  get title() { return `Portal card — ${this.region.name}`; }

  async _renderHTML() {
    const dests = destinationsOf(this.region).map(d => d.region);
    const behaviors = teleportBehaviors(this.region);
    const revealedAll = behaviors.every(b => b.system.revealed);
    if (!this.edit) {
      const note = revealedAll ? "" : `<p class="hint"><i class="fa-solid fa-eye-slash"></i> This passage is <strong>unrevealed</strong>: players see no cards, only "a way onward".</p>`;
      const sealed = this.region.hidden ? `<p class="hint"><i class="fa-solid fa-lock"></i> <strong>Sealed:</strong> players can't see or use it.</p>` : "";
      return `<p class="hint">What a player sees on hover and in the travel prompt.</p>${sealed}${note}<div class="pp-cards">${dests.map(d => cardHTML(cardFor(d))).join("")}</div>`;
    }

    const sw = (key, on, label, hint) => `<label class="pp-switch" data-tooltip="${esc(hint)}">
      <input type="checkbox" data-set="${key}" ${on ? "checked" : ""}><span class="pp-slider"></span><span>${esc(label)}</span></label>`;
    const choice = behaviors.every(b => b.system.choice);
    const head = `<section class="pp-passage">
      <input class="pp-name" type="text" data-set="name" value="${esc(this.region.name)}" data-tooltip="Passage name (GM only)">
      <div class="pp-switches">
        ${sw("open", !this.region.hidden, "Open", "Off = sealed: players can't see the badge or use it")}
        ${sw("revealed", revealedAll, "Show where it leads", "Off = players see '?' and 'a way onward'")}
        ${sw("choice", choice, "Ask before moving", "Off = stepping on it moves them at once")}
      </div>
      <p class="hint"><i class="fa-solid fa-up-down-left-right"></i> Drag this passage's badge on the map to move it. Each card below is the place it leads to.</p>
    </section>`;

    const cards = dests.map(d => {
      const f = d.flags?.[MODULE] ?? {};
      const c = cardFor(d);
      return `<article class="pp-card pp-editcard" data-uuid="${esc(d.uuid)}">
        <figure class="pp-imgedit">
          <img class="pp-thumb" src="${esc(c.img)}" alt="">
          <div class="pp-imgtools">
            <button type="button" data-act="pick" data-tooltip="Choose an image"><i class="fa-solid fa-folder-open"></i></button>
            <button type="button" data-act="snap" data-tooltip="Snap it from the map around that spot"><i class="fa-solid fa-camera"></i></button>
            ${f.img ? `<button type="button" data-act="clearimg" data-tooltip="Back to the scene thumbnail"><i class="fa-solid fa-rotate-left"></i></button>` : ""}
          </div>
        </figure>
        <div class="pp-text">
          <input class="pp-title" type="text" data-f="title" value="${esc(f.title ?? "")}" placeholder="${esc(c.title)}">
          <textarea class="pp-descedit" data-f="description" rows="5" placeholder="What players read before they choose…">${esc(f.description ?? "")}</textarea>
          <div class="pp-meta"><i class="fa-solid fa-location-dot"></i> ${esc(d.parent.name)} · ${esc(d.name)}
            <a data-act="look" data-tooltip="Look there (only you)"><i class="fa-solid fa-binoculars"></i></a>
            <a data-act="unlink" data-tooltip="Remove this destination"><i class="fa-solid fa-link-slash"></i></a></div>
        </div>
      </article>`;
    }).join("");

    // Any other region in the world can be a landing spot.
    const taken = new Set([this.region.uuid, ...dests.map(d => d.uuid)]);
    const opts = game.scenes.contents.flatMap(sc => sc.regions.contents
      .filter(r => !taken.has(r.uuid) && !r.behaviors.some(b => b.type !== "teleportToken"))
      .map(r => `<option value="${esc(r.uuid)}">${esc(sc.name)} — ${esc(r.name)}</option>`)).join("");
    const add = `<section class="pp-add">
      <select data-act="addsel"><option value="">Add a destination…</option>${opts}</select>
      <label class="pp-switch" data-tooltip="Also make that spot lead back here"><input type="checkbox" data-act="twoway" checked><span class="pp-slider"></span><span>Two-way</span></label>
    </section>`;

    return head + `<div class="pp-cards">${cards || `<p class="hint">No destinations yet.</p>`}</div>` + add;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    if (!this.edit) return;
    const region = this.region;
    const behaviors = () => teleportBehaviors(region);

    for (const input of content.querySelectorAll("[data-set]")) {
      input.addEventListener("change", async () => {
        const k = input.dataset.set;
        if (k === "name") return region.update({ name: input.value });
        if (k === "open") return region.update({ hidden: !input.checked });
        for (const b of behaviors()) await b.update({ [`system.${k}`]: input.checked });
      });
    }

    for (const card of content.querySelectorAll(".pp-editcard")) {
      const dest = fromUuidSync(card.dataset.uuid);
      const setImg = async path => {
        await dest.update({ [`flags.${MODULE}.img`]: path });
        card.querySelector(".pp-thumb").src = cardFor(dest).img;
      };
      for (const input of card.querySelectorAll("[data-f]")) {
        input.addEventListener("change", () => dest.update({ [`flags.${MODULE}.${input.dataset.f}`]: input.value }));
      }
      card.querySelector('[data-act="snap"]').addEventListener("click", async () => {
        await snapshot(dest);
        card.querySelector(".pp-thumb").src = cardFor(dest).img;
      });
      const pick = () => new foundry.applications.apps.FilePicker.implementation({
        type: "image", current: dest.flags?.[MODULE]?.img ?? "", callback: setImg }).render(true);
      card.querySelector('[data-act="pick"]').addEventListener("click", pick);
      card.querySelector(".pp-thumb").addEventListener("click", pick);
      card.querySelector('[data-act="clearimg"]')?.addEventListener("click", async () => { await dest.update({ [`flags.${MODULE}.-=img`]: null }); this.render(); });
      card.querySelector('[data-act="look"]').addEventListener("click", () => lookAt(dest));
      card.querySelector('[data-act="unlink"]').addEventListener("click", async () => {
        for (const b of behaviors()) {
          const next = withoutDestination(b.system.destinations, dest.uuid, toAbsolute(b));
          if (next.length !== b.system.destinations.size) await b.update({ "system.destinations": next });
        }
        this.render();
      });
    }

    content.querySelector('[data-act="addsel"]')?.addEventListener("change", async ev => {
      const uuid = ev.target.value;
      if (!uuid) return;
      const dest = fromUuidSync(uuid);
      const twoWay = content.querySelector('[data-act="twoway"]')?.checked;
      await linkRegions(region, dest);
      if (twoWay) await linkRegions(dest, region);
      this.render();
    });
  }

  /** The dnd5e-style edit toggle, top-left of the window header. */
  async _renderFrame(options) {
    const frame = await super._renderFrame(options);
    const header = frame.querySelector(".window-header");
    const toggle = document.createElement("label");
    toggle.className = "pp-toggle";
    toggle.dataset.tooltip = "Toggle edit mode";
    toggle.innerHTML = `<input type="checkbox" ${this.edit ? "checked" : ""}><span class="pp-slider"></span>`;
    toggle.querySelector("input").addEventListener("change", ev => {
      this.edit = ev.target.checked;
      setEditing(this.region, this.edit); // edit on: drag the badge on the map to move this travel spot
      this.render();
    });
    header.prepend(toggle);
    return frame;
  }
}

/* -------------------------------------------- */

for (const h of ["createRegion", "updateRegion", "deleteRegion", "createRegionBehavior", "updateRegionBehavior", "deleteRegionBehavior"]) {
  Hooks.on(h, () => { if (canvas?.ready) drawBadges(); });
}
Hooks.on("canvasReady", () => { bindBoard(); drawBadges(); });
Hooks.on("sightRefresh", () => { if (badges.length && !game.user.isGM) refreshBadgeSight(); });
Hooks.on("canvasTearDown", () => { hideTip(); closeMenu(); badges.length = 0; badgeLayer = null; });

Hooks.on("renderDialogV2", (app, element) => {
  try { decorate(app, element); } catch (err) { console.warn(`${MODULE} | dialog decoration skipped`, err); }
});
Hooks.on("renderRegionConfig", (app, element) => {
  try { injectConfig(app, element); } catch (err) { console.warn(`${MODULE} | config injection skipped`, err); }
});

// pentaryn-importer replaces game.pentaryn with a frozen object in its own ready hook; defer a
// tick and rebuild rather than assign (same as pentaryn-dropbin / -attunement).
Hooks.once("ready", () => setTimeout(() => {
  const api = { snapshot, cardFor, teleportParty, lookAt, open: PortalCard.open, redraw: drawBadges };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, portals: api };
  else { game.pentaryn ??= {}; game.pentaryn.portals = api; }
}, 0));
