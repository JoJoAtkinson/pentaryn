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

import { MODULE, aoeFlags, centreOf, isTemplateRegion, attachedToOther, handleVertical, stillListing, isHandle } from "./core.mjs";
import { handleActor, handleFor, removeArea, spellAreas } from "./scene-adapter.mjs";
import { activityOf } from "./messages-adapter.mjs";
import { setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";
import { FEATURE_ROWS } from "./api-manifest.mjs";

const OWNER = 3;
const HANDLE_ICON = "icons/svg/target.svg";
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
    name: "Area handle",
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
 */
const HANDLE_SYSTEM = { "system.traits.size": "tiny", "system.attributes.movement.hover": true };

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
  // -7: a fixed id with keepId, as the handle tokens have. Two GM sessions at ready (the bridge tab
  // and a GM browser tab) both get here on a world without the actor; the server keeps one.
  try {
    return await Actor.implementation.create({
      _id: HANDLE_ACTOR_ID,
      ...handleActorData(folder)
    }, { keepId: true });
  } catch (err) {
    if (/already exists/i.test(err?.message ?? "")) return handleActor();   // the other session won
    throw err;
  }
}

function handleActorData(folder) {
  return {
    name: "Area handle",
    type: "npc",
    img: HANDLE_ICON,
    folder: folder?.id ?? null,
    ownership: { default: OWNER },
    system: { attributes: { hp: { value: 0, max: 0 }, movement: { hover: true } }, traits: { size: "tiny" } },
    prototypeToken: handlePrototype(),
    flags: { [MODULE]: { handleActor: true } }
  };
}

/* -------------------------------------------- */
/*  Handle tokens                               */
/* -------------------------------------------- */

const pending = new Set();   // region ids whose handle is being created on this client
/** The registry install() was given: readyAreas registers its canvasReady sweep through it too. */
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

/** Create the handle token for a template region and attach the region to it. */
export async function createHandle(region) {
  if (!isTemplateRegion(region) || attachedElsewhere(region) || pending.has(region.id) || handleFor(region)) return null;
  const actor = handleActor();
  if (!actor) return null;
  const scene = region.parent;
  pending.add(region.id);
  try {
    const shape = region.shapes?.[0];
    const { x, y } = centreOf(shape, { gridSize: scene.grid.size });
    const half = (scene.grid.size * 0.5) / 2;
    const authorId = Object.entries(region.ownership ?? {}).find(([k, v]) => k !== "default" && v === OWNER)?.[0];
    const who = game.users.get(authorId)?.name ?? game.user.name;
    const proto = actor.prototypeToken.toObject();
    // Never the prepared region.elevation.bottom: a dnd5e 6 region has none, which prepares as
    // -Infinity and fails Token validation (core.handleVertical).
    const { level, elevation } = handleVertical({
      regionLevels: region._source?.levels ?? region.levels ?? [],
      sceneHasLevel: id => !!scene.levels?.has?.(id),
      sourceBottom: region._source?.elevation?.bottom ?? null,
      levelBase: id => scene.levels?.get?.(id)?.elevation?.base
    });
    // The handle's id IS the region's id (tokens and regions are separate collections). Two
    // clients logged in as the same user — the GM bridge tab plus a GM browser tab — both pass
    // `userId === game.user.id` and both used to create a handle, leaving an orphan twin. The
    // server serialises creates and rejects a second token with an existing _id, so exactly
    // one wins; the loser's error is swallowed below.
    let token;
    try {
      [token] = await scene.createEmbeddedDocuments("Token", [{
        ...proto,
        _id: region.id,
        actorId: actor.id,
        x: Math.round(x - half),
        y: Math.round(y - half),
        elevation,
        ...(level ? { level } : {}),
        hidden: !!region.hidden,
        name: `${spellName(region)} (${who})`,
        flags: { ...(proto.flags ?? {}), dnd5e: { ...(proto.flags?.dnd5e ?? {}), lockSize: true }, [MODULE]: { handle: true, region: region.id } }
      }], { keepId: true });
    } catch (err) {
      if (/already exists/i.test(err?.message ?? "")) return null;   // the other client won
      throw err;
    }
    if (!token) return null;
    const update = { attachment: { token: token.id }, [`flags.${MODULE}.handle`]: token.id };
    // A region with no level (placed under 5.3.3) joins the handle's; a dnd5e 6 region keeps the
    // level it was placed on, which the handle was created on above.
    if (token.level && !level) update.levels = [token.level];
    await region.update(update);
    return token;
  } finally {
    pending.delete(region.id);
  }
}

/* -------------------------------------------- */
/*  Removing handles, repairing a scene         */
/* -------------------------------------------- */

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
  const ids = handles().map(tk => tk.id).filter(id => scene.tokens.has(id));
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids);
}

/**
 * Repair one scene (active GM): delete handles whose region is gone, give template regions the
 * shared ownership and a handle if they have none. Returns what it did.
 */
export async function sweep(scene = canvas.scene) {
  const out = { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0, sizeLocked: 0 };
  if (!scene || !game.user.isGM) return out;
  const orphans = scene.tokens.filter(tk => isHandle(tk) && !scene.regions.has(aoeFlags(tk).region)).map(tk => tk.id);
  if (orphans.length) {
    await scene.deleteEmbeddedDocuments("Token", orphans);
    out.orphansDeleted = orphans.length;
  }
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
  for (const r of scene.regions.filter(isTemplateRegion)) {
    if (setting("handleTokens") && !attachedElsewhere(r) && !handleFor(r) && r.shapes.length === 1) {
      if (await createHandle(r)) out.handlesCreated++;
    }
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
      // -9: the handle is often gone already (the deleting client got there): only another error is news.
      setTimeout(() => deleteHandlesOf(region).catch(err => (/does not exist/i.test(err?.message ?? "") ? null : log.warn("backstop handle delete", err))), 1500);
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

  reg.on("dnd5e.renderChatMessage", reg.guardSwallowAsync("renderChatMessage(remove)", decorateCard), { guard: false, label: "renderChatMessage(remove)" });

  // Concentration ends → that spell's areas go, on every scene.
  reg.on("deleteActiveEffect", reg.guardSwallowAsync("deleteActiveEffect", async (effect, options, userId) => {
    if (!game.users.activeGM?.isSelf || !setting("concentrationCleanup")) return;
    if (!effect.statuses?.has?.(CONFIG.specialStatusEffects.CONCENTRATING ?? "concentrating")) return;
    const itemUuid = concentrationItemUuid(effect);
    if (!itemUuid) return;
    for (const s of game.scenes) {
      const ids = spellAreas({ itemUuid }, s).map(r => r.id);
      if (ids.length) await s.deleteEmbeddedDocuments("Region", ids);
    }
  }), { guard: false, label: "deleteActiveEffect" });

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

/** Startup work for the active GM: the actor, then a sweep of the viewed scene. */
export async function readyAreas({ sweepOnReady = true } = {}) {
  if (!game.users.activeGM?.isSelf) return;
  await ensureHandleActor();
  if (sweepOnReady) {
    await sweep(canvas.scene);
    hooks?.on("canvasReady", hooks.guardSwallowAsync("canvasReady", c => game.users.activeGM?.isSelf && sweep(c.scene)), { guard: false, label: "canvasReady" });
  }
}

/** Nothing of its own to undo: every hook went through the registry the entry unwinds. */
export function uninstall() {}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only,
// so the blueprint refactor edits that shim, not the frozen tests. Not part of the API.
export const _internals = { handlePrototype, handleActorRepairs, spellName, deleteHandlesOf, decorateCard, actionRow, concentrationItemUuid, attachedElsewhere, pending };
