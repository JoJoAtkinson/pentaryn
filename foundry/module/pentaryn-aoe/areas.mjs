/**
 * Part A — spell areas everyone can move and delete.
 *
 * On Foundry v14 a dnd5e spell template is a Region (dnd5e 6: flags.dnd5e.activity; placed under
 * 5.3.3: flags.core.MeasuredTemplate). Core makes it owned by its author only and puts it on the
 * Regions layer, so nobody else can touch it and the author has to change layers to. This file:
 *
 *  - makes every template region ownership.default OWNER (preCreate on the creator, GM backstop);
 *  - drops a small owned "handle" token at its centre and ATTACHES the region to it — core then
 *    drags the region with the token and deletes the region when the token is deleted;
 *  - deletes the handle when the region is deleted any other way;
 *  - adds a "Remove all templates" icon next to the spell card's Place Template icon;
 *  - removes a concentration spell's areas when concentration ends.
 *
 * Only template regions (core.isTemplateRegion) are ever touched — portal/scene-link regions are
 * not. A template dnd5e attached to a token itself (an emanation such as Spirit Guardians follows
 * its caster) gets no handle: re-attaching it to a handle would leave it behind when the caster moves.
 */

import { MODULE, aoeFlags, centreOf, handleTopLeft, isTemplateRegion, attachedToOther, handleVertical, stillListing, isHandle, alreadyExists, doesNotExist } from "./core.mjs";
import { handleActor, handleFor, removeArea, spellAreas } from "./scene-adapter.mjs";
import { activityOf } from "./messages-adapter.mjs";
import { setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { FEATURE_ROWS } from "./api-manifest.mjs";

const OWNER = 3;
const HANDLE_ICON = "icons/svg/target.svg";
/** The handle actor's and its prototype token's name (aoe-mnt-10: written once). */
const HANDLE_NAME = "Area handle";
/** The handle actor's fixed id (16 alphanumerics): two sessions creating it at once make one actor. */
const HANDLE_ACTOR_ID = "pentarynAoeHndl0";

/** A DOM listener wrapped like a hook (the kit's pass-through guard), once installed. */
const listenerGuard = (label, fn) => (hooks ? hooks.guard(label, fn) : fn);

/** A template region dnd5e attached to a token that is not our handle (an emanation on its caster). */
const attachedElsewhere = region => attachedToOther(region, id => region?.parent?.tokens?.get(id));

/* -------------------------------------------- */
/*  Handle actor                                */
/* -------------------------------------------- */

function handlePrototype() {
  return {
    name: HANDLE_NAME,
    width: 0.5, height: 0.5,
    texture: { src: HANDLE_ICON },
    displayName: CONST.TOKEN_DISPLAY_MODES.HOVER,
    displayBars: CONST.TOKEN_DISPLAY_MODES.NONE,
    disposition: CONST.TOKEN_DISPOSITIONS.SECRET,
    actorLink: false,
    lockRotation: true,
    movementAction: "displace",
    sight: { enabled: false },
    light: { dim: 0, bright: 0 },
    ring: { enabled: false },
    flags: { [MODULE]: { handle: true }, dnd5e: { lockSize: true } }
  };
}

/**
 * dnd5e 6 tokenSizeSync has the active GM write the size category's width/height onto placed
 * creature tokens (Token5e._onOverrideSize). The handle is 0.5: "tiny" makes the sync a no-op and
 * flags.dnd5e.lockSize opts out of it outright. hover exempts the handle from movementAutomation's
 * Falling when its region sits at an elevation. Adjustment row dnd5e-token-size-lock.
 * The one source for these: handleActorData builds the new actor's system from it and
 * handleActorRepairs checks an existing actor against it (aoe-mnt-10).
 */
const HANDLE_SYSTEM = Object.freeze({ "system.traits.size": "tiny", "system.attributes.movement.hover": true });

function handleActorRepairs(actor) {
  const update = {};
  for (const [path, value] of Object.entries(HANDLE_SYSTEM)) {
    if (foundry.utils.getProperty(actor._source, path) !== value) update[path] = value;
  }
  if (actor._source.prototypeToken?.flags?.dnd5e?.lockSize !== true) update["prototypeToken.flags.dnd5e.lockSize"] = true;
  return update;
}

/** GM only, idempotent: the one shared world actor every handle token points at. */
export async function ensureHandleActor() {
  const existing = handleActor();
  if (existing && game.user.isGM) {
    const update = handleActorRepairs(existing);
    if (!foundry.utils.isEmpty(update)) await existing.update(update);
  }
  if (existing || !game.user.isGM) return existing;
  const folder = game.folders.find(f => f.type === "Actor" && f.name === "Scene Props");
  // -7: a fixed id with keepId. Two GM sessions at ready (the bridge tab and a GM browser tab) both
  // get here on a world without the actor. v14 does not refuse a world document whose id exists
  // (only embedded ones, as createHandle's tokens): the later create replaces the record with the
  // same data and clients see createActor twice. One actor results; no listener cares (npc).
  try {
    return await Actor.implementation.create({
      _id: HANDLE_ACTOR_ID,
      ...handleActorData(folder)
    }, { keepId: true });
  } catch (err) {
    if (alreadyExists(err)) return handleActor();   // fallback: a server that refuses
    throw err;
  }
}

function handleActorData(folder) {
  return {
    name: HANDLE_NAME,
    type: "npc",
    img: HANDLE_ICON,
    folder: folder?.id ?? null,
    ownership: { default: OWNER },
    // hp first keeps the key order attributes{hp, movement}, traits — whatever HANDLE_SYSTEM's order
    system: foundry.utils.expandObject({ "system.attributes.hp.value": 0, "system.attributes.hp.max": 0, ...HANDLE_SYSTEM }).system,
    prototypeToken: handlePrototype(),
    flags: { [MODULE]: { handleActor: true } }
  };
}

/* -------------------------------------------- */
/*  Handle tokens                               */
/* -------------------------------------------- */

const pending = new Set();   // region ids whose handle is being created on this client
/** The registry install() was given: listenerGuard wraps the handle-repair listeners with it. */
let hooks = null;
let log = makeLog(MODULE);   // the entry's ctx.log once installed

/**
 * The spell's name for the handle label. dnd5e 6: flags.dnd5e.item is the item and
 * flags.dnd5e.origin the caster's TOKEN; 5.3.3: flags.dnd5e.origin is the activity.
 */
function spellName(region) {
  const f = region.flags?.dnd5e ?? {};
  const item = f.item ? fromUuidSync(f.item, { strict: false }) : null;
  if (item?.name) return item.name;
  for (const uuid of [f.activity, f.origin]) {
    const doc = uuid ? fromUuidSync(uuid, { strict: false }) : null;
    if (doc?.item?.name) return doc.item.name;
  }
  return region.name;
}

/**
 * The caster's TOKEN name for the handle label (AO-3-handle-dark: dnd5e's chip shows the handle's
 * name, which is public — never an actor name). dnd5e 6: flags.dnd5e.origin is the caster's token;
 * 5.3.3: the activity, whose actor's token on the region's scene is the caster (a synthetic actor
 * is its own token). Null when no token is found.
 */
function casterTokenName(region) {
  const f = region.flags?.dnd5e ?? {};
  const origin = f.origin ? fromUuidSync(f.origin, { strict: false }) : null;
  if (origin?.documentName === "Token") return origin.name ?? null;
  const item = origin?.item ?? (f.item ? fromUuidSync(f.item, { strict: false }) : null);
  const actor = item?.actor ?? item?.parent ?? null;
  if (!actor) return null;
  const token = actor.token ?? region.parent?.tokens?.find(t => t.actorId === actor.id && !isHandle(t));
  return token?.name ?? null;
}

/** A template region that has no handle yet and may get one (not an emanation, not in flight here). */
const wantsHandle = region => isTemplateRegion(region) && !attachedElsewhere(region) && !pending.has(region.id) && !handleFor(region);

/**
 * A region's handle token data and the level it was placed on (null: none given). The handle's id
 * IS the region's id (tokens and regions are separate collections). Two clients logged in as the
 * same user — the GM bridge tab plus a GM browser tab — both create it; the server serialises
 * creates and refuses a second token with an existing _id, so exactly one wins.
 */
function handleData(region, actor) {
  const scene = region.parent;
  const shape = region.shapes?.[0];
  const centre = centreOf(shape, { gridSize: scene.grid.size });
  // [declared] aoe-drag-snap: a spot core's drag snapping can return to (core.handleTopLeft).
  const { x, y } = handleTopLeft(centre, { gridSize: scene.grid.size, square: squareGrid(scene) });
  const authorId = Object.entries(region.ownership ?? {}).find(([k, v]) => k !== "default" && v === OWNER)?.[0];
  const who = casterTokenName(region) ?? game.users.get(authorId)?.name ?? game.user.name;
  const proto = actor.prototypeToken.toObject();
  // Never the prepared region.elevation.bottom: a dnd5e 6 region has none, which prepares as
  // -Infinity and fails Token validation (core.handleVertical).
  const { level, elevation } = handleVertical({
    regionLevels: region._source?.levels ?? region.levels ?? [],
    sceneHasLevel: id => !!scene.levels?.has?.(id),
    sourceBottom: region._source?.elevation?.bottom ?? null,
    levelBase: id => scene.levels?.get?.(id)?.elevation?.base
  });
  const data = {
    ...proto,
    _id: region.id,
    actorId: actor.id,
    x,
    y,
    elevation,
    ...(level ? { level } : {}),
    hidden: !!region.hidden,
    // AO-3-handle-dark: a faint dim light of half a square, so the handle and the area's outline
    // show in darkness to everyone who can see that spot (the handle has no sight of its own).
    light: { ...(proto.light ?? {}), dim: scene.grid.distance / 2, bright: 0 },
    name: `${spellName(region)} (${who})`,
    flags: { ...(proto.flags ?? {}), dnd5e: { ...(proto.flags?.dnd5e ?? {}), lockSize: true }, [MODULE]: { handle: true, region: region.id } }
  };
  return { data, level };
}

/** A square grid (CONST.GRID_TYPES.SQUARE = 1; a scene with no grid type given counts as square). */
function squareGrid(scene) {
  const g = scene?.grid ?? {};
  if (typeof g.isSquare === "boolean") return g.isSquare;
  return (g.type ?? 1) === 1;
}

/** The region change that attaches it to its handle token. */
function attachUpdate(token, level) {
  const update = { attachment: { token: token.id }, [`flags.${MODULE}.handle`]: token.id };
  // A region with no level (placed under 5.3.3) joins the handle's; a dnd5e 6 region keeps the
  // level it was placed on, which the handle was created on above.
  if (token.level && !level) update.levels = [token.level];
  return update;
}

/** Create the handle token for a template region and attach the region to it. */
export async function createHandle(region) {
  if (!wantsHandle(region)) return null;
  const actor = handleActor();
  if (!actor) return null;
  pending.add(region.id);
  try {
    const { data, level } = handleData(region, actor);
    let token;
    try {
      [token] = await region.parent.createEmbeddedDocuments("Token", [data], { keepId: true });
    } catch (err) {
      if (alreadyExists(err)) return null;   // the other client won
      throw err;
    }
    if (!token) return null;
    await region.update(attachUpdate(token, level));
    return token;
  } finally {
    pending.delete(region.id);
  }
}

/**
 * The sweep's handles ([declared] AC-7): every missing handle in ONE Token create (keepId), then
 * every attachment in ONE Region update. A second GM session that made one of them first gets the
 * whole create refused ("already exists"): the rest are then created one by one, that refusal
 * swallowed per id, and every handle that exists is attached (the same values the other session
 * writes). Returns the handle tokens this client created.
 */
async function createHandles(scene, regions) {
  const actor = handleActor();
  const todo = actor ? regions.filter(wantsHandle) : [];
  if (!todo.length) return [];
  for (const r of todo) pending.add(r.id);
  try {
    const rows = todo.map(region => ({ region, ...handleData(region, actor) }));
    let made;
    try {
      made = await scene.createEmbeddedDocuments("Token", rows.map(r => r.data), { keepId: true });
    } catch (err) {
      if (!alreadyExists(err)) throw err;
      made = [];
      for (const { data } of rows) {
        try {
          made.push(...await scene.createEmbeddedDocuments("Token", [data], { keepId: true }));
        } catch (e) {
          if (!alreadyExists(e)) throw e;   // the other session made this one
        }
      }
    }
    const updates = rows.flatMap(({ region, level }) => {
      const token = scene.tokens.get(region.id);
      return token ? [{ _id: region.id, ...attachUpdate(token, level) }] : [];
    });
    if (updates.length) await scene.updateEmbeddedDocuments("Region", updates);
    return made.filter(Boolean);
  } finally {
    for (const r of todo) pending.delete(r.id);
  }
}

/* -------------------------------------------- */
/*  Removing handles, repairing a scene         */
/* -------------------------------------------- */

/**
 * Delete embedded documents; a "does not exist" refusal is success — with two GM sessions the
 * other one already deleted them ([declared] aoe-edge-4). Returns the deleted docs, or null then.
 */
async function deleteGone(parent, name, ids) {
  try {
    return await parent.deleteEmbeddedDocuments(name, ids);
  } catch (err) {
    if (doesNotExist(err)) return null;
    throw err;
  }
}

async function deleteHandlesOf(region) {
  const scene = region.parent;
  const handles = () => scene.tokens.filter(tk => isHandle(tk) && aoeFlags(tk).region === region.id
    && tk.canUserModify(game.user, "delete"));
  if (!handles().length) return;
  // Core's active GM drops the deleted region from every token inside it (an update of `_regions`,
  // sent with noHook) right after the deletion. The handle sits inside its own region, so deleting
  // it first made that update fail on the server ("does not exist", Area 4 D10). Wait for it (≤1.5 s).
  const until = Date.now() + 1500;
  while (game.users.activeGM && Date.now() < until
    && stillListing(handles().map(tk => ({ id: tk.id, _regions: tk._source._regions })), region.id).length) {
    await new Promise(r => setTimeout(r, 100));
  }
  const ids = handles().map(tk => tk.id);
  if (ids.length) await deleteGone(scene, "Token", ids);
}

/**
 * Repair one scene (active GM): delete handles whose region is gone, give template regions the
 * shared ownership and a handle if they have none (all in one create + one attach, AC-7). Returns
 * what it did (orphans another GM session deleted first, and handles it made first, are not counted).
 */
export async function sweep(scene = canvas.scene) {
  const out = { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0, sizeLocked: 0 };
  if (!scene || !game.user.isGM) return out;
  const orphans = scene.tokens.filter(tk => isHandle(tk) && !scene.regions.has(aoeFlags(tk).region)).map(tk => tk.id);
  if (orphans.length && await deleteGone(scene, "Token", orphans)) out.orphansDeleted = orphans.length;
  // Handles placed before dnd5e-token-size-lock: opt them out of tokenSizeSync (idempotent).
  const unlocked = scene.tokens.filter(tk => isHandle(tk) && tk._source.flags?.dnd5e?.lockSize !== true)
    .map(tk => ({ _id: tk.id, "flags.dnd5e.lockSize": true }));
  if (unlocked.length) {
    await scene.updateEmbeddedDocuments("Token", unlocked);
    out.sizeLocked = unlocked.length;
  }
  // One batched write for every template region still owned by its author alone (§5.9.1, C59).
  const unshared = scene.regions.filter(r => isTemplateRegion(r) && r.ownership.default !== OWNER)
    .map(r => ({ _id: r.id, "ownership.default": OWNER }));
  if (unshared.length) {
    await scene.updateEmbeddedDocuments("Region", unshared);
    out.ownershipFixed = unshared.length;
  }
  if (setting("handleTokens")) {
    const bare = scene.regions.filter(r => isTemplateRegion(r) && r.shapes.length === 1);
    out.handlesCreated = (await createHandles(scene, bare)).length;
  }
  return out;
}

/* -------------------------------------------- */
/*  "Remove all templates" on the spell card    */
/* -------------------------------------------- */

/**
 * The icon sits right after dnd5e's Place Template icon in the usage card's action row
 * (section.icon-row, card-buttons.hbs), so placing and clearing are side by side. It clears that
 * spell's templates on the scene being viewed. A card with no visible actions gets the row built
 * the way card-buttons.hbs builds it.
 */
function decorateCard(message, html) {
  if (!setting("removeAreaButton") || message?.type !== "usage") return;
  const activityUuid = message.system?.activity?.uuid ?? null;
  if (!activityUuid || html.querySelector("[data-pentaryn-aoe-action]")) return;
  const place = html.querySelector('[data-action="placeTemplate"]');
  const activity = activityOf(message);
  if (!place && !activity?.target?.template?.type) return;     // only cards that place an area
  const itemUuid = message.system?.item?.uuid ?? activity?.item?.uuid ?? null;
  const label = _loc("PENTARYN_AOE.RemoveAllTemplates");
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "icon";
  btn.dataset.pentarynAoeAction = "remove";
  btn.dataset.tooltip = "";
  btn.setAttribute("aria-label", label);
  btn.innerHTML = `<i class="fa-solid fa-eraser" inert></i>`;
  li.append(btn);
  // -9: a rejected removal is logged with the module prefix, not an unattributed rejection.
  btn.addEventListener("click", listenerGuard("remove all templates", async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const scene = canvas.scene;
    // No viewed scene → nothing; spellAreas(…, null) would mean every scene.
    const regions = scene ? spellAreas({ itemUuid, activityUuid }, scene) : [];
    if (!regions.length) return ui.notifications.info(_loc("PENTARYN_AOE.NoArea"));
    btn.disabled = true;
    try {
      const n = await removeArea(regions, scene);
      if (!n) ui.notifications.warn(_loc("PENTARYN_AOE.CannotRemove"));
    } finally {
      btn.disabled = false;
    }
  }));
  const placeLi = place?.closest("li");
  if (placeLi) return placeLi.after(li);
  actionRow(html)?.append(li);
}

/**
 * The usage card's action list (section.icon-row > ul.unlist), built like card-buttons.hbs when
 * absent. card-rows.hbs renders the Properties row (and grouped-button rows) as
 * section.icon-row > ul.pills.unlist ABOVE the actions, so a bare "section.icon-row ul.unlist"
 * would land the icon in the pill list — on every card whose buttons this viewer cannot see.
 */
function actionRow(html) {
  const card = html.querySelector(".chat-card");
  const existing = [...(card ?? html).querySelectorAll("section.icon-row > ul.unlist")]
    .find(ul => !ul.classList.contains("pills"));
  if (existing) return existing;
  if (!card) return null;
  const section = document.createElement("section");
  section.className = "icon-row";
  const actions = foundry.utils.escapeHTML(game.i18n.localize("DND5E.CHATMESSAGE.Row.Actions"));
  section.innerHTML = `<i class="fa-solid fa-fw fa-circle-play" aria-label="${actions}"></i><ul class="unlist"></ul>`;
  card.append(section);
  return section.querySelector("ul");
}

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

export function install(reg, ctx) {
  hooks = reg;
  log = ctx.log;
  // Ownership on the creating client, before the document exists.
  reg.on("preCreateRegion", reg.guardSwallowAsync("preCreateRegion", (doc, data) => {
    if (!isTemplateRegion(data)) return;
    doc.updateSource({ "ownership.default": OWNER });
  }), { guard: false, label: "preCreateRegion" });

  reg.on("createRegion", reg.guardSwallowAsync("createRegion", async (region, options, userId) => {
    if (!isTemplateRegion(region)) return;
    const gm = game.users.activeGM?.isSelf;
    if (gm && region.ownership.default !== OWNER) await region.update({ "ownership.default": OWNER });
    if (!setting("handleTokens") || region.shapes.length !== 1 || attachedElsewhere(region)) return;
    if (userId === game.user.id) await createHandle(region);
    else if (gm) {
      // Backstop for a creator whose client has no module (or no handle actor): wait, then repair.
      setTimeout(() => {
        const live = region.parent?.regions.get(region.id);
        if (live && !handleFor(live)) createHandle(live).catch(err => log.error("backstop handle", err));
      }, 2500);
    }
  }), { guard: false, label: "createRegion" });

  // Region deleted another way → its handle goes too. The deleting client acts at once; the GM
  // repeats it shortly after in case that client couldn't.
  reg.on("deleteRegion", reg.guardSwallowAsync("deleteRegion", async (region, options, userId) => {
    if (!isTemplateRegion(region)) return;
    if (userId === game.user.id) await deleteHandlesOf(region);
    else if (game.users.activeGM?.isSelf) {
      // -9: the handle is often gone already (the deleting client got there); deleteHandlesOf
      // takes that as success, so only another error is news.
      setTimeout(() => deleteHandlesOf(region).catch(err => log.warn("backstop handle delete", err)), 1500);
    }
  }), { guard: false, label: "deleteRegion" });

  // Handles are never combatants and never stay targeted.
  reg.on("preCreateCombatant", (combatant, data) => {
    const tk = combatant.token ?? combatant.parent?.scene?.tokens?.get(data?.tokenId);
    if (tk && isHandle(tk)) return false;
  }, { guard: false, label: "preCreateCombatant" });
  reg.on("targetToken", reg.guardSwallowAsync("targetToken", (user, token, targeted) => {
    if (targeted && user === game.user && isHandle(token.document)) token.setTarget(false, { releaseOthers: false });
  }), { guard: false, label: "targetToken" });

  // A handle drag moves its area, never turns it ([declared], PT AO-3). Core's tokenAutoRotate
  // turns a dragged token to face the way it went (lockRotation only stops the mesh turning), and
  // an attached region turns with its token: a Burning Hands cone aimed south-east swung north when
  // its handle was dragged north-east. Row core-token-auto-rotate-handle.
  reg.on("preMoveToken", (token, movement) => {
    if (movement?.autoRotate && isHandle(token)) movement.autoRotate = false;
  }, { guard: false, label: "preMoveToken" });

  reg.on("dnd5e.renderChatMessage", reg.guardSwallowAsync("renderChatMessage(remove)", decorateCard), { guard: false, label: "renderChatMessage(remove)" });

  // Concentration ends → that spell's areas go, on every scene.
  reg.on("deleteActiveEffect", reg.guardSwallowAsync("deleteActiveEffect", async (effect, options, userId) => {
    if (!game.users.activeGM?.isSelf || !setting("concentrationCleanup")) return;
    if (!effect.statuses?.has?.(CONFIG.specialStatusEffects.CONCENTRATING ?? "concentrating")) return;
    const itemUuid = concentrationItemUuid(effect);
    if (!itemUuid) return;
    for (const s of game.scenes) {
      const ids = spellAreas({ itemUuid }, s).map(r => r.id);
      if (ids.length) await deleteGone(s, "Region", ids);
    }
  }), { guard: false, label: "deleteActiveEffect" });

  // A new scene is swept by whoever is the active GM then ([declared] aoe-edge-3): wired here on
  // every client, not after readyAreas' awaits, so a failed startup or a GM handover keeps it.
  reg.on("canvasReady", reg.guardSwallowAsync("canvasReady", c => game.users.activeGM?.isSelf && sweep(c.scene)), { guard: false, label: "canvasReady" });

  return { rows: FEATURE_ROWS.areas, impl: { sweep, ensureHandleActor, createHandle } };
}

/**
 * The item a concentration effect is for, as an absolute uuid. dnd5e 6 writes the item uuid in
 * system.origin.item (relative to the effect when it can be), and still as the core origin and in
 * flags.dnd5e.item; an effect migrated from 5.3.3 has origin null.
 */
function concentrationItemUuid(effect) {
  for (const uuid of [effect.system?.origin?.item, effect.origin, effect.flags?.dnd5e?.item?.uuid]) {
    if (!uuid || typeof uuid !== "string") continue;
    if (!uuid.startsWith(".")) return uuid;
    const doc = fromUuidSync(uuid, { relative: effect, strict: false });
    if (doc?.uuid) return doc.uuid;
  }
  return null;
}

/** Startup work for the active GM: the actor, then a sweep of the viewed scene (install() wires later scenes). */
export async function readyAreas({ sweepOnReady = true } = {}) {
  if (!game.users.activeGM?.isSelf) return;
  await ensureHandleActor();
  if (sweepOnReady) await sweep(canvas.scene);
}

/** Nothing of its own to undo: every hook went through the registry the entry unwinds. */
export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { HANDLE_NAME, HANDLE_SYSTEM, handlePrototype, handleActorData, handleActorRepairs, spellName, deleteHandlesOf, decorateCard, actionRow, concentrationItemUuid, attachedElsewhere, pending, squareGrid };
