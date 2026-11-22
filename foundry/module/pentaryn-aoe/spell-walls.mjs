/**
 * B2 — wall spells raise real, breakable walls (feedback 8t6Nn1; Joe's ruling 2026-11-21).
 *
 * Walls are for storytelling and behave like the real thing: a party that puts up a Wall of Stone
 * does not know what is happening on the other side. With the world setting spellWalls (default on),
 * a wall spell's template region gets Wall documents along each panel (core.wallPlan), one per
 * 10-foot break section on the panel's centre line, flagged `{ regionId, panel, section, spell,
 * clipsAreas }`:
 *   Wall of Stone, Wall of Ice — block movement and sight;
 *   Wall of Force               — blocks movement only (invisible), and still stops other spell areas;
 *   Wall of Fire                — blocks sight only;
 *   Blade Barrier, Wind Wall    — no walls (core.SPELL_WALLS).
 * A round wall (Wall of Force's sphere, Wall of Ice's globe, Wall of Fire's ring) gets a ring of chords.
 *
 * Who writes: players cannot create Walls, so the active GM's client does, on the region hooks every
 * client sees (createRegion, updateRegion — a handle drag moves the region's shapes —, deleteRegion,
 * so the walls go with the region and with concentration through Part A's cleanup). Each sync diffs the
 * region's walls against its plan (core.diffWalls). Wall ids are fixed per region, panel and section
 * (core.wallId). Only the lead session of the active GM's account writes (sessions.mjs, R2-2: two
 * sessions of one GM both wrote, and every refused duplicate was a red toast). Syncs of one region run
 * one at a time. On canvasReady the GM re-syncs the viewed scene and deletes walls whose
 * region is gone.
 *
 * Breaking (GM only): every section has a small break control on the map, drawn in canvas.controls
 * (always interactive, like core's door controls). Click: that section is knocked out — a line panel's
 * shape is cut (core.breakSection), so the region shows the gap and its creatures follow; a round wall's
 * chord is listed in flags.pentaryn-aoe.wallBroken. The first break keeps the whole wall in
 * flags.pentaryn-aoe.wallOriginal (with its handle's position), and right-click on any control of that
 * wall puts it back (repairWall). Breaking the last section deletes the region. Deleting spell walls on
 * the Walls layer breaks those sections the same way (so a later drag does not bring them back).
 *
 * walls.mjs: a spell's own walls never clip its own area; a Wall of Force's walls clip other areas.
 * Out of scope: Wall of Stone becoming permanent after a full duration of concentration (its walls go
 * with concentration, as its region does).
 */

import { MODULE, aoeFlags, alreadyExists, breakSections, brokenLineSections, diffWalls, doesNotExist, isClearAll, isTemplateRegion, restoreShapes, sectionPixels, wallMidpoint, wallPlan, wallStanding } from "./core.mjs";
import { handleFor, shapesOf, spellWallsOf, wallKindOf } from "./scene-adapter.mjs";
import { onSettingChange, setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { FEATURE_ROWS } from "./api-manifest.mjs";

let log = makeLog(MODULE);   // the entry's ctx.log once installed

/** sessions.mjs through ctx.exposed (R2-2): the active GM's lead session; without it, activeGM.isSelf. */
let exposed = {};
const isLeadGM = () => (exposed.isLeadGM ? exposed.isLeadGM() : game.users?.activeGM?.isSelf === true);
const isLeadSession = () => (exposed.isLeadSession ? exposed.isLeadSession() : true);
const onBecomeLead = fn => exposed.onBecomeLead?.(fn);

/** Option on this module's own Wall writes: deleteWall then knows the delete is not a GM's break. */
const SYNC = "pentarynAoeWalls";

/** The active GM, and its account's lead session (R2-2: two sessions of one GM wrote every wall twice). */
const isActiveGM = () => isLeadGM();

/* -------------------------------------------- */
/*  The plan and the sync (active GM)           */
/* -------------------------------------------- */

/** The region's levels as ids (the source holds an array; a prepared document holds a Set). */
const levelsOf = region => [...(region?._source?.levels ?? region?.levels ?? [])];

/** The walls a region should have now; [] when it is not a wall spell or the setting is off. */
function planFor(region, shapes = null) {
  const scene = region?.parent;
  if (!scene || !setting("spellWalls")) return [];
  const kind = wallKindOf(region);
  if (!kind) return [];
  return wallPlan({
    regionId: region.id, shapes: shapesOf(region, shapes), kind, broken: aoeFlags(region).wallBroken ?? [],
    gridSize: scene.grid?.size, gridDistance: scene.grid?.distance, levels: levelsOf(region), module: MODULE,
  });
}

/** Create walls with their fixed ids; another GM session that made one first is not an error. */
async function createKept(scene, data) {
  try {
    return await scene.createEmbeddedDocuments("Wall", data, { keepId: true, [SYNC]: true });
  } catch (err) {
    if (!alreadyExists(err)) throw err;
  }
  const made = [];
  for (const d of data) {
    try {
      made.push(...await scene.createEmbeddedDocuments("Wall", [d], { keepId: true, [SYNC]: true }));
    } catch (err) {
      if (!alreadyExists(err)) throw err;
    }
  }
  return made;
}

/** Delete walls; one another session deleted first is not an error. */
async function deleteKept(scene, ids) {
  if (!ids.length) return;
  try {
    await scene.deleteEmbeddedDocuments("Wall", ids, { [SYNC]: true });
  } catch (err) {
    if (!doesNotExist(err)) throw err;
    for (const id of ids) {
      if (!scene.walls?.has?.(id)) continue;
      try { await scene.deleteEmbeddedDocuments("Wall", [id], { [SYNC]: true }); } catch (e) { if (!doesNotExist(e)) throw e; }
    }
  }
}

/** The plain fields diffWalls compares. */
const wallRow = w => ({ _id: w.id, c: [...(w._source?.c ?? w.c ?? [])], move: w.move, sight: w.sight, light: w.light, sound: w.sound, levels: [...(w._source?.levels ?? w.levels ?? [])], flags: w.flags });

/** Region id → the sync in flight (one at a time per region). */
const queues = new Map();

/**
 * Bring one region's walls in line with its plan. `gone`: the region was deleted (every wall goes).
 * Active GM only; returns `{ created, updated, deleted }`, or null on another client.
 */
export function syncRegion(region, { gone = false } = {}) {
  if (!isActiveGM() || !region?.id || !region.parent) return Promise.resolve(null);
  const prior = queues.get(region.id) ?? Promise.resolve();
  const run = prior.catch(() => null).then(async () => {
    const scene = region.parent;
    if (!scene.walls) return { created: 0, updated: 0, deleted: 0 };
    const live = !gone && scene.regions?.has?.(region.id);
    const planned = live ? planFor(scene.regions.get(region.id)) : [];
    const { create, update, remove } = diffWalls(spellWallsOf(scene, region.id).map(wallRow), planned, { module: MODULE });
    await deleteKept(scene, remove);
    if (update.length) await scene.updateEmbeddedDocuments("Wall", update, { [SYNC]: true });
    if (create.length) await createKept(scene, create);
    return { created: create.length, updated: update.length, deleted: remove.length };
  });
  queues.set(region.id, run);
  run.finally(() => { if (queues.get(region.id) === run) queues.delete(region.id); }).catch(() => null);
  return run;
}

/** Active GM: re-sync every template region of a scene and delete spell walls whose region is gone. */
export async function syncScene(scene = canvas?.scene) {
  const out = { regions: 0, created: 0, updated: 0, deleted: 0, orphans: 0 };
  if (!isActiveGM() || !scene?.walls) return out;
  const orphans = [...scene.walls].filter(w => { const id = w.flags?.[MODULE]?.regionId; return id && !scene.regions.has(id); }).map(w => w.id);
  if (orphans.length) {
    await deleteKept(scene, orphans);
    out.orphans = orphans.length;
  }
  for (const region of scene.regions) {
    if (!isTemplateRegion(region)) continue;
    if (!spellWallsOf(scene, region.id).length && !wallKindOf(region)) continue;
    const r = await syncRegion(region);
    if (!r) continue;
    out.regions++;
    out.created += r.created; out.updated += r.updated; out.deleted += r.deleted;
  }
  return out;
}

/* -------------------------------------------- */
/*  Breaking and repairing (GM)                 */
/* -------------------------------------------- */

/** A region from a document or an id (the viewed scene first, then every scene). */
function regionOf(ref) {
  if (ref?.documentName === "Region") return ref;
  if (ref?.document?.documentName === "Region") return ref.document;
  if (typeof ref !== "string") return null;
  const id = ref.split(".").pop();
  return canvas?.scene?.regions?.get(id) ?? game.scenes.find(s => s.regions.has(id))?.regions.get(id) ?? null;
}

const spellName = region => region?.flags?.dnd5e?.item ? (fromUuidSync(region.flags.dnd5e.item, { strict: false })?.name ?? region.name) : region?.name;

/** The handle's position now (repairWall moves the stored wall by however far it was dragged). */
function handleAt(region) {
  const h = handleFor(region);
  return h ? { x: h._source?.x ?? h.x, y: h._source?.y ?? h.y } : null;
}

/**
 * Region id → a break or repair in flight on this client. A second click (or a Walls-layer delete) on the
 * same wall before the first region.update returns would read the old shapes and section numbering: it
 * would put the first break back, or knock out the wrong stretch once a panel had been split. It is
 * dropped instead; the controls are redrawn from the new shapes when the update lands.
 */
const busy = new Set();

async function exclusive(region, fn) {
  if (busy.has(region.id)) {
    log.debug(`wall ${region.id}: a break or repair is still in flight, this one is dropped`);
    return null;
  }
  busy.add(region.id);
  try { return await fn(); } finally { busy.delete(region.id); }
}

/**
 * GM: knock sections out of a wall spell's region. `sections`: `[{ panel, section }]`. A line panel is
 * cut, a round wall's chord is listed as broken; the walls follow through updateRegion. The last section
 * gone deletes the region. Returns `{ regionId, broken, panels, destroyed }`, or null (not a GM, not a
 * wall spell, no such section, or a break or repair of this wall still in flight).
 */
export async function breakWall(ref, sections) {
  const region = regionOf(ref);
  if (!game.user?.isGM || !region || !wallKindOf(region)) return null;
  return exclusive(region, () => breakRegion(region, sections));
}

async function breakRegion(region, sections) {
  const scene = region.parent;
  const shapes = shapesOf(region);
  const secPx = sectionPixels(scene.grid?.size, scene.grid?.distance);
  const out = breakSections(shapes, sections, secPx);
  if (!out) return null;
  const name = spellName(region);
  const flags = aoeFlags(region);
  const broken = [...new Set([...(flags.wallBroken ?? []), ...out.broken])];
  // The last line panel gone, or a ring with every chord broken (0.8.1): no wall stands, the area goes.
  if (!out.shapes.length || !wallStanding(out.shapes, broken, secPx)) {
    await scene.deleteEmbeddedDocuments("Region", [region.id]);
    ui.notifications.info(_loc("PENTARYN_AOE.Walls.Destroyed", { spell: name }));
    log.info(`wall broken down: ${name} (${region.id})`);
    return { regionId: region.id, broken: out.applied, panels: 0, destroyed: true };
  }
  const update = { shapes: out.shapes };
  if (!flags.wallOriginal) update[`flags.${MODULE}.wallOriginal`] = { shapes, at: handleAt(region) };
  if (out.broken.length) update[`flags.${MODULE}.wallBroken`] = broken;
  await region.update(update);
  ui.notifications.info(_loc("PENTARYN_AOE.Walls.Broken", { spell: name }));
  log.info(`wall section broken: ${name} (${region.id}) ${sections.map(s => `${s.panel}:${s.section}`).join(", ")} — right-click a break control, or game.pentaryn.aoe.repairWall("${region.id}"), puts it back`);
  return { regionId: region.id, broken: out.applied, panels: out.shapes.length, destroyed: false };
}

/** GM: one section (the map control's click). */
export const breakWallSection = (ref, panel, section) => breakWall(ref, [{ panel: Number(panel), section: Number(section) }]);

/**
 * GM: put a broken wall back as it was before its first break (moved with its handle since). Returns
 * `{ regionId, panels }`, or null (not a GM, not a wall spell, nothing broken: an info toast).
 */
export async function repairWall(ref) {
  const region = regionOf(ref);
  if (!game.user?.isGM || !region || !wallKindOf(region)) return null;
  return exclusive(region, () => repairRegion(region));
}

async function repairRegion(region) {
  const flags = aoeFlags(region);
  if (!flags.wallOriginal && !(flags.wallBroken ?? []).length) {
    ui.notifications.info(_loc("PENTARYN_AOE.Walls.NothingToRepair", { spell: spellName(region) }));
    return null;
  }
  const shapes = flags.wallOriginal ? restoreShapes(flags.wallOriginal, handleAt(region)) : shapesOf(region);
  await region.update({ shapes, [`flags.${MODULE}.wallOriginal`]: null, [`flags.${MODULE}.wallBroken`]: [] });
  ui.notifications.info(_loc("PENTARYN_AOE.Walls.Repaired", { spell: spellName(region) }));
  return { regionId: region.id, panels: shapes.length };
}

/** The broken sections of a wall spell's region: its round chords and its cut line sections. */
function brokenOf(region, flags) {
  const out = [...(flags.wallBroken ?? [])];
  if (flags.wallOriginal) {
    const grid = region.parent?.grid;
    const lines = brokenLineSections(restoreShapes(flags.wallOriginal, handleAt(region)), shapesOf(region), sectionPixels(grid?.size, grid?.distance));
    for (const k of lines) if (!out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * GM, read: a region's wall spell, its walls, what is broken. null for anything that is not a wall spell.
 * `broken` lists the sections knocked out, as "panel:section" against the panels the wall was cast with:
 * a round wall's chords (its flags) and a line panel's cut sections (against its original shapes).
 */
export function wallsFor(ref) {
  const region = regionOf(ref);
  const kind = region ? wallKindOf(region) : null;
  if (!kind) return null;
  const flags = aoeFlags(region);
  return {
    regionId: region.id, spell: kind.id,
    blocks: { move: kind.move > 0, sight: kind.sight > 0, areas: kind.move > 0 && (kind.sight > 0 || kind.clipsAreas) },
    walls: spellWallsOf(region.parent, region.id).map(w => ({ id: w.id, panel: w.flags[MODULE].panel, section: w.flags[MODULE].section, c: [...(w._source?.c ?? w.c)] })),
    broken: brokenOf(region, flags), repairable: !!flags.wallOriginal || !!(flags.wallBroken ?? []).length,
  };
}

/** deleteWall batches: region id → the sections the GM deleted on the Walls layer, broken together. */
const deleted = new Map();

/** Scenes whose Clear All re-sync is already queued on this client (one per batch). */
const cleared = new Set();

function onDeleteWall(wall, options, userId) {
  if (options?.[SYNC] || !setting("spellWalls")) return;
  // Clear All on the Walls layer (core's deleteAll) is not a break of every wall spell on the scene: their
  // areas stay, and the active GM's client raises their walls again. Core 14's hooks never see the
  // deleteAll flag (core.isClearAll): an emptied single-level scene is the mark (0.8.1, live play-test).
  const scene = wall?.parent;
  if (isClearAll({ deleteAll: options?.deleteAll, levels: scene?.levels?.size ?? 1, wallsLeft: scene?.walls?.size ?? 1 })) {
    if (!isActiveGM() || !scene?.id || !wall?.flags?.[MODULE]?.regionId || cleared.has(scene.id)) return;
    cleared.add(scene.id);
    queueMicrotask(() => {
      cleared.delete(scene.id);
      syncScene(scene).catch(err => log.error("re-raise spell walls after Clear All", err));
    });
    return;
  }
  // spellWalls off (above): a leftover wall the GM deletes is just cleanup, never a break of the area.
  if (userId !== game.user?.id || !game.user?.isGM || !isLeadSession()) return;
  const f = wall?.flags?.[MODULE];
  const region = f?.regionId ? wall.parent?.regions?.get(f.regionId) : null;
  if (!region) return;
  const list = deleted.get(region.id) ?? [];
  list.push({ panel: f.panel, section: f.section });
  if (list.length > 1) return;
  deleted.set(region.id, list);
  queueMicrotask(() => {
    deleted.delete(region.id);
    breakWall(region, list).catch(err => log.error("break from the Walls layer", err));
  });
}

/**
 * updateRegion, every client: a round wall's break or a repair writes only flags (wallBroken,
 * wallOriginal) when its shapes do not change, and core refreshes a Region placeable for shape and
 * visibility changes only. Without this the ring kept its broken chord drawn and its break control
 * until the next redraw (0.8.1, live play-test). Asks for one refresh, which reruns refreshRegion.
 */
function onUpdateRegionFlags(region, changes) {
  const f = changes?.flags?.[MODULE];
  if (!f || !Object.keys(f).some(k => /wall(Broken|Original)$/.test(k))) return;
  region?.object?.renderFlags?.set?.({ refreshState: true });
}

/* -------------------------------------------- */
/*  The break controls (GM's map)               */
/* -------------------------------------------- */

const ROOT = Symbol.for(`${MODULE}.wallBreaks`);
const BREAK_FILL = 0x2b2e33;
const BREAK_RING = 0xff9829;

/** The container on canvas.controls that holds every region's controls (made on first use). */
function root() {
  const layer = canvas?.controls;
  if (!layer) return null;
  let c = layer[ROOT];
  if (!c || c.destroyed) {
    c = new PIXI.Container();
    c.eventMode = "passive";
    c.interactiveChildren = true;
    c.byRegion = new Map();
    layer.addChild(c);
    layer[ROOT] = c;
  }
  return c;
}

function dropControls(regionId) {
  const c = canvas?.controls?.[ROOT];
  const g = c?.byRegion?.get(regionId);
  if (!g) return;
  c.byRegion.delete(regionId);
  if (!g.destroyed) { g.parent?.removeChild?.(g); g.destroy({ children: true }); }
}

function dropAllControls() {
  const layer = canvas?.controls;
  const c = layer?.[ROOT];
  if (!c) return;
  delete layer[ROOT];
  if (!c.destroyed) { c.parent?.removeChild?.(c); c.destroy({ children: true }); }
}

/** One section's control: a dark disc with a crack, a hover label, click breaks, right-click repairs. */
function control(doc, panel, section, at) {
  const s = canvas.dimensions?.uiScale ?? 1;
  const r = 9 * s;
  const ctl = new PIXI.Container();
  const g = ctl.addChild(new PIXI.Graphics());
  g.lineStyle(2 * s, BREAK_RING, 0.9).beginFill(BREAK_FILL, 0.85).drawCircle(0, 0, r).endFill();
  g.lineStyle(1.5 * s, 0xffffff, 0.95).moveTo(-4 * s, -6 * s).lineTo(1 * s, -1 * s).lineTo(-2 * s, 1 * s).lineTo(4 * s, 6 * s);
  // The hover label is made on the first hover: a refresh during a drag must not rasterise text per section.
  let label = null;
  const showLabel = on => {
    if (on && !label) {
      const Text = foundry.canvas?.containers?.PreciseText ?? PIXI.Text;
      label = ctl.addChild(new Text(_loc("PENTARYN_AOE.Walls.Break"), Text.getTextStyle?.({ fontSize: 14 * s }) ?? undefined));
      label.anchor?.set?.(0.5, 1);
      label.position.set(0, -r - 3 * s);
    }
    if (label) label.visible = on;
  };
  ctl.position.set(at.x, at.y);
  ctl.alpha = 0.75;
  ctl.eventMode = "static";
  ctl.interactiveChildren = false;
  ctl.cursor = "pointer";
  ctl.hitArea = new PIXI.Circle(0, 0, r + 2 * s);
  ctl.on("pointerover", () => { ctl.alpha = 1; ctl.scale.set(1.25); showLabel(true); });
  ctl.on("pointerout", () => { ctl.alpha = 0.75; ctl.scale.set(1); showLabel(false); });
  ctl.on("pointerdown", ev => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    breakWallSection(doc, panel, section).catch(err => log.error("break a section", err));
  });
  ctl.on("rightdown", ev => {
    ev.stopPropagation();
    repairWall(doc).catch(err => log.error("repair a wall", err));
  });
  ctl.pentarynWall = { regionId: doc.id, panel, section };
  return ctl;
}

/** refreshRegion: the GM's break controls for a wall spell's region, where its sections are now. */
export function drawControls(region) {
  const doc = region?.document;
  // A drag preview (a clone with the same id) never owns the real region's controls, nor breaks through them.
  if (!doc?.id || region.isPreview) return null;
  if (!game.user?.isGM || !setting("spellWalls") || region.destroyed || region.visible === false) return dropControls(doc.id);
  const plan = planFor(doc, region.animationState?.shapes ?? null);
  if (!plan.length) return dropControls(doc.id);
  const c = root();
  if (!c) return null;
  // The same sections (a drag, a hover refresh): move the controls, keep the objects.
  const old = c.byRegion.get(doc.id);
  const same = old && !old.destroyed && old.children.length === plan.length
    && plan.every((w, i) => old.children[i]?.pentarynWall?.panel === w.flags[MODULE].panel && old.children[i]?.pentarynWall?.section === w.flags[MODULE].section);
  if (same) {
    plan.forEach((w, i) => { const at = wallMidpoint(w.c); old.children[i].position.set(at.x, at.y); });
    return old;
  }
  dropControls(doc.id);
  const g = new PIXI.Container();
  g.eventMode = "passive";
  for (const w of plan) g.addChild(control(doc, w.flags[MODULE].panel, w.flags[MODULE].section, wallMidpoint(w.c)));
  c.addChild(g);
  c.byRegion.set(doc.id, g);
  return g;
}

/* -------------------------------------------- */
/*  Wiring                                      */
/* -------------------------------------------- */

export function install(reg, ctx) {
  log = ctx.log;
  exposed = ctx.exposed ?? {};
  const sync = label => reg.guardSwallowAsync(label, (region, ...rest) => {
    if (!isTemplateRegion(region) || !isActiveGM()) return;
    return syncRegion(region, { gone: label === "deleteRegion(walls)" });
  });
  reg.on("createRegion", sync("createRegion(walls)"), { guard: false, label: "createRegion(walls)" });
  reg.on("updateRegion", sync("updateRegion(walls)"), { guard: false, label: "updateRegion(walls)" });
  reg.on("deleteRegion", sync("deleteRegion(walls)"), { guard: false, label: "deleteRegion(walls)" });
  reg.on("deleteRegion", reg.guardSwallowAsync("deleteRegion(wall controls)", region => dropControls(region?.id)), { guard: false, label: "deleteRegion(wall controls)" });
  reg.on("deleteWall", reg.guardSwallowAsync("deleteWall(break)", onDeleteWall), { guard: false, label: "deleteWall(break)" });
  reg.on("updateRegion", reg.guardSwallowAsync("updateRegion(wall redraw)", onUpdateRegionFlags), { guard: false, label: "updateRegion(wall redraw)" });
  reg.on("refreshRegion", reg.guardSwallowAsync("refreshRegion(wall controls)", drawControls), { guard: false, label: "refreshRegion(wall controls)" });
  reg.on("destroyRegion", reg.guardSwallowAsync("destroyRegion(wall controls)", region => (region?.isPreview ? null : dropControls(region?.document?.id))), { guard: false, label: "destroyRegion(wall controls)" });
  reg.on("canvasTearDown", reg.guardSwallowAsync("canvasTearDown(wall controls)", dropAllControls), { guard: false, label: "canvasTearDown(wall controls)" });
  reg.on("canvasReady", reg.guardSwallowAsync("canvasReady(walls)", c => { if (isActiveGM()) return syncScene(c?.scene); }), { guard: false, label: "canvasReady(walls)" });
  // The lead taken late (a new session settling, or an older one gone): catch up on the viewed scene.
  onBecomeLead(() => syncScene(canvas?.scene));
  onSettingChange("spellWalls", () => {
    for (const region of canvas?.regions?.placeables ?? []) {
      try { drawControls(region); } catch (err) { log.warn("wall controls", err); }
    }
    if (isActiveGM()) syncScene(canvas?.scene).catch(err => log.error("spellWalls change", err));
  });
  return { rows: FEATURE_ROWS.spellWalls, impl: { syncWalls: syncScene, breakWallSection, repairWall, wallsFor } };
}

/** The controls go with the hooks; the walls stay (they are scene data, removed with their regions). */
export function uninstall() {
  onSettingChange("spellWalls", null);
  try { dropAllControls(); } catch (err) { log.warn("wall controls uninstall", err); }
  deleted.clear();
  cleared.clear();
  busy.clear();
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only. Not part of the API.
export const _internals = { planFor, syncRegion, syncScene, breakWall, breakWallSection, repairWall, wallsFor, drawControls, dropControls, onDeleteWall, onUpdateRegionFlags, regionOf, SYNC, ROOT, queues, busy };
