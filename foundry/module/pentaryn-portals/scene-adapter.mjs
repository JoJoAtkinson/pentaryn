/**
 * Pentaryn Portal Cards — ADAPTER: Foundry documents ↔ the plain data portals-core reads, and the
 * GM's scene writes (snapshot, region move, party teleport, linking).
 *
 * The only file that touches game.itempiles. May import core and lib only; the setting reader and
 * the module's log arrive through configureSceneAdapter() (called by the entry at evaluation,
 * before any hook can fire).
 */

import { MODULE, SNAP_DIR, esc, cardData, dialogIdParts, cropWindow, translateShapes, blockingWallCoords, tokenBox,
  occupiedBy, crowded, isAoeHandle, summonerActorId, playerOwners, isScenery, partySelection, ringSpots, wallBlocker, assignSpots,
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

/** One behavior's destination regions, resolved relative to it (core 14.368+), in order; unresolvable entries dropped. */
export const behaviorDestinations = behavior =>
  [...(behavior.system.destinations ?? [])].map(u => fromUuidSync(u, { relative: behavior })).filter(Boolean);

export function destinationsOf(region) {
  const out = [];
  for (const b of teleportBehaviors(region)) for (const d of behaviorDestinations(b)) out.push({ region: d, behavior: b });
  return out;
}

/**
 * The one "revealed" rule (EXT-1): every enabled teleport behavior with at least one resolvable
 * destination — what a player can actually travel through — is revealed. A stub with nowhere to go
 * does not count. The card's hint and switch, the badge and inspect() all read this.
 */
export function passageRevealed(region) {
  return destinationsOf(region).every(d => d.behavior.system.revealed);
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
  if (!src) { ui.notifications.warn(_loc("PENTARYN_PORTALS.Notify.NoBackground")); return null; }

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
  // ROB-1: no blob, or an upload that answers without a path, is a failure — warn, write nothing.
  const failed = () => {
    deps.log?.warn("snapshot upload failed");
    ui.notifications.warn(_loc("PENTARYN_PORTALS.Notify.SnapshotFailed"));
    return null;
  };
  if (!blob) return failed();
  const name = `${scene.id}-${region.id}.webp`;
  const FP = foundry.applications.apps.FilePicker.implementation;
  // An existing folder is the normal case; anything else (a permission failure) is worth a line.
  await FP.createDirectory("data", SNAP_DIR).catch(err => {
    if (!/EEXIST|exists/i.test(err?.message ?? "")) deps.log?.warn("create dir", err);
  });
  const res = await FP.upload("data", SNAP_DIR, new File([blob], name, { type: "image/webp" }), {}, { notify: false });
  const path = res?.path;
  if (!path) return failed();
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
  ui.notifications.info(_loc("PENTARYN_PORTALS.Notify.Looking", { title: cardFor(destRegion).title }));
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
    handle: isAoeHandle(t.flags, a?.flags),
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
 * Every token is tested by its whole footprint (portals-edge-2): a Large token never lands over a
 * stander or another arrival.
 */
export function landingPlaces(dest, toks, cx, cy, party = null) {
  const g = dest.grid.size;
  // Skip squares a wall cuts off from the landing (the pit wall, a cell's bars). Tested against
  // the destination's wall documents, because that scene may not be on the canvas.
  const walls = blockingWallCoords(dest.walls);
  // Don't land on someone already standing there (the PC who just arrived, a guard).
  const moving = new Set(toks.map(t => t.id));
  const occupied = occupiedBy(dest.tokens.filter(t => !moving.has(t.id)).map(t => tokenBox(t, g)));
  // toks[i]'s box centred on a ring spot, top-left snapped to the grid: what is tested is what lands.
  const boxes = new Map();
  const boxAt = ({ x, y }, i) => {
    const k = `${i}|${x},${y}`;
    if (!boxes.has(k)) {
      const w = toks[i].width * g, h = toks[i].height * g;
      const s = dest.grid.getSnappedPoint({ x: x - w / 2, y: y - h / 2 }, { mode: CONST.GRID_SNAPPING_MODES.TOP_LEFT_VERTEX });
      boxes.set(k, { x: s.x, y: s.y, w, h });
    }
    return boxes.get(k);
  };
  const clear = b => !occupied(b.x, b.y, b.w, b.h);
  const blocked = wallBlocker(walls);
  let spots;
  if (party?.length === toks.length) {
    // Spare squares let a follower pick one touching its PC, and cover the extra squares a big token fills.
    const n = toks.reduce((sum, t) => sum + Math.max(1, Math.ceil(t.width) * Math.ceil(t.height)), 0) + 8;
    const ring = ringSpots(cx, cy, g, n, { blocked, occupied });
    const fits = (s, i, out) => clear(boxAt(s, i)) && !crowded(boxAt(s, i), out.flatMap((o, j) => (o ? [boxAt(o, j)] : [])));
    spots = assignSpots(ring, party, { fits });
  } else {
    spots = ringSpots(cx, cy, g, toks.length, { blocked, occupied, footprint: (x, y, i) => boxAt({ x, y }, i) });
  }
  return toks.map((t, i) => { const b = boxAt(spots[i], i); return { x: b.x, y: b.y }; });
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
 * scenery token joined the party silently). → true to go ahead; an empty party → warn and false
 * even with the setting off (portals-edge-4).
 */
export async function confirmParty(party, title) {
  if (!party.length) {
    ui.notifications.warn(_loc("PENTARYN_PORTALS.Party.Nobody"));
    return false;
  }
  if (!deps.setting("confirmPartyTeleport")) return true;
  const rows = partyPreview(party).map(r => `<li>${esc(r.name)}${r.follower
    ? ` <span class="ppt-follows">${r.leaderName
      ? _loc("PENTARYN_PORTALS.Party.LandsBeside", { name: esc(r.leaderName) })
      : _loc("PENTARYN_PORTALS.Party.Follower")}</span>` : ""}</li>`).join("");
  return foundry.applications.api.DialogV2.confirm({
    window: { title: _loc("PENTARYN_PORTALS.Party.Title"), icon: "fa-solid fa-person-walking-arrow-right" },
    content: `<p>${party.length === 1
      ? _loc("PENTARYN_PORTALS.Party.ConfirmOne", { title: esc(title) })
      : _loc("PENTARYN_PORTALS.Party.ConfirmMany", { n: party.length, title: esc(title) })}</p>
      <ul class="ppt-party">${rows}</ul>`,
    yes: { label: _loc("PENTARYN_PORTALS.Party.Teleport"), icon: "fa-solid fa-check", default: true },
    no: { label: _loc("PENTARYN_PORTALS.Party.Cancel") },
    rejectClose: false
  }).catch(err => { deps.log?.warn("party confirm failed", err); return false; });
}

/**
 * GM: move the party on canvas.scene to `destRegion`'s centre. → `{ moved, cancelled }` (moved =
 * tokens moved; cancelled = the GM said no, nobody counts as party, or every party token was
 * deleted while the confirm was open); undefined for a player or no region.
 */
export async function teleportParty(destRegion, { confirm = true } = {}) {
  if (!game.user.isGM || !destRegion) return;
  const from = canvas.scene;
  const dest = destRegion.parent;
  let party = partyRecords(from);
  // portals-edge-4: an empty party never pulls players or moves the view, confirm or not.
  if ((confirm || !party.length) && !(await confirmParty(party, cardFor(destRegion).title))) return { moved: 0, cancelled: true };
  // ROB-2: a token deleted while the dialog was open is dropped, not recreated on the far side.
  const kept = party.filter(r => from.tokens.has(r.doc.id));
  if (kept.length < party.length) {
    if (!kept.length) {
      ui.notifications.warn(_loc("PENTARYN_PORTALS.Party.Nobody"));
      return { moved: 0, cancelled: true };
    }
    party = kept;
  }
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
  ui.notifications.info(_loc(toks.length === 1 ? "PENTARYN_PORTALS.Notify.PartyMovedOne" : "PENTARYN_PORTALS.Notify.PartyMovedMany",
    { n: toks.length, title: cardFor(destRegion).title }));
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

/** The card's Add a destination and api.link(): from → to, and back when twoWay. */
export async function linkPair(from, to, twoWay = false) {
  await linkRegions(from, to);
  if (twoWay) await linkRegions(to, from);
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
  const updates = [];
  for (const b of teleportBehaviors(from)) {
    const next = withoutDestination(b.system.destinations, dest.uuid, toAbsolute(b));
    if (next.length !== b.system.destinations.size) updates.push({ _id: b.id, "system.destinations": next });
  }
  // One batched write for every behaviour that changes (C59).
  if (updates.length) await from.updateEmbeddedDocuments("RegionBehavior", updates);
  return updates.length;
}
