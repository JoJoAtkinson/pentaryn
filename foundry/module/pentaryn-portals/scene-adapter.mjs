/**
 * Pentaryn Portal Cards — ADAPTER: Foundry documents ↔ the plain data portals-core reads, and the
 * GM's scene writes (snapshot, region move, party teleport, linking).
 *
 * The only file that touches game.itempiles. May import core and lib only; the setting reader and
 * the module's log arrive through configureSceneAdapter() (called by the entry at evaluation,
 * before any hook can fire).
 */

import { MODULE, SNAP_DIR, esc, cardData, dialogIdParts, cropWindow, translateShapes, blockingWallCoords, tokenBox,
  occupiedBy, summonerActorId, playerOwners, isScenery, partySelection, ringSpots, wallBlocker, assignSpots,
  partyPreview, hasDestination, withoutDestination } from "./portals-core.mjs";

const deps = { setting: () => undefined, log: null };

/** The entry hands over the setting reader and the module's one log. */
export function configureSceneAdapter({ setting, log } = {}) {
  if (setting) deps.setting = setting;
  if (log) deps.log = log;
}

/* -------------------------------------------- */
/*  Cards and destinations                      */
/* -------------------------------------------- */

/** Card data for one destination region, with fallbacks (core cardData); null for no region. */
export function cardFor(region) {
  if (!region) return null;
  const scene = region.parent;
  return cardData({
    flags: region?.flags?.[MODULE],
    uuid: region.uuid,
    sceneNavName: scene?.navName, sceneName: scene?.name, sceneThumb: scene?.thumb,
    regionName: region.name
  });
}

/** The core dialog's id is `dialog-<behaviorUuid>-<tokenId>`: → its teleport behavior, or null. */
export function behaviorOf(app) {
  const parts = dialogIdParts(app?.id ?? "");
  if (!parts) return null;
  const behavior = fromUuidSync(parts.behaviorUuid);
  return behavior?.type === "teleportToken" ? behavior : null;
}

export function teleportBehaviors(region) {
  return region.behaviors.filter(b => b.type === "teleportToken" && !b.disabled);
}

/** Core 14.368+ stores a same-scene destination relative to its behavior; resolve against it. */
export const toAbsolute = behavior => u => foundry.utils.parseUuid(u, { relative: behavior })?.uuid ?? null;

export function destinationsOf(region) {
  const out = [];
  for (const b of teleportBehaviors(region)) for (const u of b.system.destinations ?? []) {
    const d = fromUuidSync(u, { relative: b });
    if (d) out.push({ region: d, behavior: b });
  }
  return out;
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
export async function snapshot(regionOrUuid, { squaresWide = 8, squaresHigh = 5 } = {}) {
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
    i.onerror = cause => reject(new Error(`portal snapshot: cannot load ${src}`, { cause }));
    i.src = src;
  });
  const { x, y, w, h, outW, outH, mx, my, markR } = cropWindow({
    cx, cy, dims: scene.dimensions, natural: { w: img.naturalWidth, h: img.naturalHeight }, squaresWide, squaresHigh });
  const c = document.createElement("canvas");
  c.width = outW; c.height = outH;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, x, y, w, h, 0, 0, outW, outH);
  // Mark the arrival square so the thumbnail says *where*, not just *what*.
  ctx.strokeStyle = "rgba(255,255,255,0.85)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(mx, my, markR, 0, Math.PI * 2); ctx.stroke();

  const blob = await new Promise(r => c.toBlob(r, "image/webp", 0.88));
  const name = `${scene.id}-${region.id}.webp`;
  const FP = foundry.applications.apps.FilePicker.implementation;
  // An existing folder is the normal case; anything else (a permission failure) is worth a line.
  await FP.createDirectory("data", SNAP_DIR).catch(err => {
    if (!/EEXIST|exists/i.test(err?.message ?? "")) deps.log?.warn("create dir", err);
  });
  const res = await FP.upload("data", SNAP_DIR, new File([blob], name, { type: "image/webp" }), {}, { notify: false });
  const path = res?.path ?? `${SNAP_DIR}/${name}`;
  // Cache-bust so a re-snapshot shows immediately.
  await region.update({ [`flags.${MODULE}.img`]: `${path}?v=${Date.now().toString(36)}` });
  return path;
}

/* -------------------------------------------- */
/*  Moving a travel spot                        */
/* -------------------------------------------- */

/**
 * Move a travel spot by (dx, dy), snapped so its bounds' corner lands on the grid. Every shape
 * moves together, and so does any travel-glyph tile tagged with this region's id.
 * @returns {Promise<boolean|null>} true when it wrote; false when the snap left it where it was
 *   (the caller redraws the badge it dragged); null with no shapes or no bounds
 */
export async function moveRegionDocs(region, dx, dy) {
  const scene = region.parent;
  // Snap the region's BOUNDS, not a shape's x/y: in v14 a rectangle shape's x/y is its centre,
  // so snapping that to a grid vertex leaves the square half a cell off.
  const bounds = region.bounds;
  if (!region.shapes.length || !bounds) return null;
  const ox = bounds.x, oy = bounds.y;
  const snapped = scene.grid.getSnappedPoint({ x: ox + dx, y: oy + dy }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
  const sx = snapped.x - ox, sy = snapped.y - oy;
  if (!sx && !sy) return false;
  const shapes = translateShapes(region.shapes.map(sh => sh.toObject?.() ?? foundry.utils.deepClone(sh)), sx, sy);
  await region.update({ shapes });
  const tiles = scene.tiles.filter(t => t.flags?.pentaryn?.travel?.regionId === region.id);
  if (tiles.length) await scene.updateEmbeddedDocuments("Tile", tiles.map(t => ({ _id: t.id, x: t.x + sx, y: t.y + sy })));
  return true;
}

/* -------------------------------------------- */
/*  GM: move the whole party, and everyone's view */
/* -------------------------------------------- */

/**
 * GM only: go and look at a destination without moving anyone. Your view only; players stay put.
 * The destination's own badge (if it links back) is the way home, or the scene nav.
 */
export async function lookAt(destRegion) {
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

export function folderNames(actor) {
  const out = [];
  for (let f = actor?.folder; f; f = f.folder) out.push(f.name);
  return out;
}

/** The GM users' ids, once per pass (finding -36: recordOf used to scan the users per token). */
export const gmUserIds = () => game.users.filter(u => u.isGM).map(u => u.id);

/**
 * The plain record the party rules read (portals-core). Pass `{ gmIds }` when building many: the
 * second argument is an options object, so `tokens.map(recordOf)` (an index there) still works.
 *
 * Item Piles: `isValidItemPile(actor)` with no flag fallback, unlike pentaryn-aoe's resolve.mjs
 * (token document, falls back to flags). Deliberate: aoe excludes creatures and tolerates a false
 * positive; portals must never leave a pile-PC behind. Unifying them is a decision for Joe.
 */
export function recordOf(t, { gmIds = gmUserIds() } = {}) {
  const a = t.actor;
  let pile = false;
  try { pile = !!(a && game.itempiles?.API?.isValidItemPile?.(a)); } catch (err) { deps.log?.debug("item piles check", err); }
  return {
    id: t.id,
    name: t.name,
    actorId: a?.id ?? t.actorId ?? null,
    type: a?.type ?? null,
    linked: !!t.actorLink,
    pile,
    excluded: !a || isScenery({ name: t.name, folders: folderNames(a) }) || isScenery({ name: a.name, folders: [] }),
    owners: playerOwners(a?.ownership, gmIds),
    summoner: summonerActorId(a?.getFlag?.("dnd5e", "summon.origin")),
    polymorphed: !!a?.getFlag?.("dnd5e", "isPolymorphed"),
    // pentaryn-aoe's area handle: owned by everyone, its area stays put (usability Area 8, L11).
    handle: !!(t.flags?.["pentaryn-aoe"]?.handle || a?.flags?.["pentaryn-aoe"]?.handleActor),
    doc: t
  };
}

/**
 * Everyone who travels when the GM moves the party: linked PCs, plus every token a player owns
 * or a PC summoned (skeletons, familiars, Arcane Eye, steeds, transformed forms). Never item
 * piles, Markers or crowd.
 */
export function partyRecords(scene) {
  const gmIds = gmUserIds();
  return partySelection(scene.tokens.map(t => recordOf(t, { gmIds })));
}

/**
 * Snapped top-left positions for `toks`, filled outward from (cx, cy) on `dest`. With `party`
 * (the partySelection records for `toks`, same order) each follower lands beside its PC.
 */
export function landingPlaces(dest, toks, cx, cy, party = null) {
  const g = dest.grid.size;
  // Skip squares a wall cuts off from the landing (the pit wall, a cell's bars). Tested against
  // the destination's wall documents, because that scene may not be on the canvas.
  const walls = blockingWallCoords(dest.walls);
  // Don't land on someone already standing there (the PC who just arrived, a guard).
  const moving = new Set(toks.map(t => t.id));
  const occupied = occupiedBy(dest.tokens.filter(t => !moving.has(t.id)).map(t => tokenBox(t, g)));
  const grouped = party?.length === toks.length;
  // A few spare squares let a follower pick one touching its PC rather than the next in the ring.
  const ring = ringSpots(cx, cy, g, toks.length + (grouped ? 8 : 0), { blocked: wallBlocker(walls), occupied });
  const spots = grouped ? assignSpots(ring, party) : ring;
  return toks.map((t, i) => {
    const w = t.width * g, h = t.height * g;
    const s = dest.grid.getSnappedPoint({ x: spots[i].x - w / 2, y: spots[i].y - h / 2 }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
    return { x: s.x, y: s.y };
  });
}

/** GM: move tokens to another scene around (cx, cy). Plain create + delete, no `replacements`, so
 *  this never re-triggers the follow hook (party.mjs). */
export async function carryTo(toks, dest, cx, cy, party = null) {
  if (!toks.length) return;
  const from = toks[0].parent;
  const places = landingPlaces(dest, toks, cx, cy, party);
  const data = toks.map((t, i) => ({ ...t.toObject(), ...places[i] }));
  await dest.createEmbeddedDocuments("Token", data, { keepId: true });
  await from.deleteEmbeddedDocuments("Token", toks.map(t => t.id));
}

/**
 * GM: who is about to move, before anything moves (usability Area 8, L11: an everyone-owned
 * scenery token joined the party silently). → true to go ahead.
 */
export async function confirmParty(party, title) {
  if (!deps.setting("confirmPartyTeleport")) return true;
  if (!party.length) {
    ui.notifications.warn("Teleport party: nobody on this scene counts as the party.");
    return false;
  }
  const rows = partyPreview(party).map(r => `<li>${esc(r.name)}${r.follower
    ? ` <span class="ppt-follows">${r.leaderName ? `lands beside ${esc(r.leaderName)}` : "follower"}</span>` : ""}</li>`).join("");
  return foundry.applications.api.DialogV2.confirm({
    window: { title: "Teleport party", icon: "fa-solid fa-person-walking-arrow-right" },
    content: `<p>Move ${party.length === 1 ? "this token" : `these ${party.length} tokens`} to <strong>${esc(title)}</strong>?</p>
      <ul class="ppt-party">${rows}</ul>`,
    yes: { label: "Teleport", icon: "fa-solid fa-check", default: true },
    no: { label: "Cancel" },
    rejectClose: false
  }).catch(err => { deps.log?.warn("party confirm failed", err); return false; });
}

/**
 * GM: move the party on canvas.scene to `destRegion`'s centre. → `{ moved, cancelled }` (moved =
 * tokens moved; cancelled = the GM said no, or nobody counts as party); undefined for a player or
 * no region.
 */
export async function teleportParty(destRegion, { confirm = true } = {}) {
  if (!game.user.isGM || !destRegion) return;
  const from = canvas.scene;
  const dest = destRegion.parent;
  const party = partyRecords(from);
  if (confirm && !(await confirmParty(party, cardFor(destRegion).title))) return { moved: 0, cancelled: true };
  const toks = party.map(r => r.doc);
  const b = destRegion.bounds;
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  if (dest === from) {
    const places = landingPlaces(dest, toks, cx, cy, party);
    await from.updateEmbeddedDocuments("Token", toks.map((t, i) => ({ _id: t.id, ...places[i] })), { teleport: true, animate: false });
  } else {
    await carryTo(toks, dest, cx, cy, party);
    dest.pullUsers(game.users.filter(u => !u.isGM && u.active));
    await dest.view();
  }
  ui.notifications.info(`${toks.length} party token${toks.length === 1 ? "" : "s"} moved to ${cardFor(destRegion).title}.`);
  return { moved: toks.length, cancelled: false };
}

/* -------------------------------------------- */
/*  Linking                                     */
/* -------------------------------------------- */

/**
 * Make `from` lead to `to`: add it to from's teleport behavior, creating one (asking first,
 * revealed, fading) if from has none yet.
 */
export async function linkRegions(from, to) {
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

/** The enabled teleport behaviors of `from` that lead to `dest` (a relative or absolute entry). */
export function behaviorsLeadingTo(from, dest) {
  return teleportBehaviors(from).filter(b => hasDestination(b.system.destinations, dest.uuid, toAbsolute(b)));
}

/**
 * `from` no longer leads to `dest`: drop the entry (relative or absolute) from every teleport
 * behavior. → how many behaviors changed.
 */
export async function unlinkRegion(from, dest) {
  let changed = 0;
  for (const b of teleportBehaviors(from)) {
    const next = withoutDestination(b.system.destinations, dest.uuid, toAbsolute(b));
    if (next.length !== b.system.destinations.size) { await b.update({ "system.destinations": next }); changed++; }
  }
  return changed;
}
