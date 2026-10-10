/**
 * Part A — spell areas everyone can move and delete.
 *
 * On Foundry v14 a dnd5e spell template is a Region (flags.core.MeasuredTemplate). Core makes it
 * owned by its author only and puts it on the Regions layer, so nobody else can touch it and the
 * author has to change layers to. This file:
 *
 *  - makes every template region ownership.default OWNER (preCreate on the creator, GM backstop);
 *  - drops a small owned "handle" token at its centre and ATTACHES the region to it — core then
 *    drags the region with the token and deletes the region when the token is deleted;
 *  - deletes the handle when the region is deleted any other way;
 *  - adds "Remove all templates" under the spell card's Place Template button;
 *  - removes a concentration spell's areas when concentration ends.
 *
 * Only regions flagged core.MeasuredTemplate are ever touched — portal/scene-link regions are not.
 */

import { MODULE, aoeFlags, centreOf, regionFromSpell } from "./core.mjs";
import { setting } from "./settings.mjs";
import { on, guard } from "./hooks.mjs";

const OWNER = 3;
const HANDLE_ICON = "icons/svg/target.svg";

export const isTemplateRegion = r => !!r?.flags?.core?.MeasuredTemplate;
export const isHandle = t => !!aoeFlags(t).handle;
const t = (key, data) => (data ? game.i18n.format(`PENTARYN_AOE.${key}`, data) : game.i18n.localize(`PENTARYN_AOE.${key}`));

/* -------------------------------------------- */
/*  Handle actor                                */
/* -------------------------------------------- */

export function handleActor() {
  return game.actors.find(a => aoeFlags(a).handleActor) ?? null;
}

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
    flags: { [MODULE]: { handle: true } }
  };
}

/** GM only, idempotent: the one shared world actor every handle token points at. */
export async function ensureHandleActor() {
  const existing = handleActor();
  if (existing || !game.user.isGM) return existing;
  const folder = game.folders.find(f => f.type === "Actor" && f.name === "Scene Props");
  return Actor.implementation.create({
    name: "Area handle",
    type: "npc",
    img: HANDLE_ICON,
    folder: folder?.id ?? null,
    ownership: { default: OWNER },
    system: { attributes: { hp: { value: 0, max: 0 } } },
    prototypeToken: handlePrototype(),
    flags: { [MODULE]: { handleActor: true } }
  });
}

/* -------------------------------------------- */
/*  Handle tokens                               */
/* -------------------------------------------- */

export function handleFor(region) {
  const scene = region?.parent;
  if (!scene) return null;
  const id = region.attachment?.token?.id ?? region._source?.attachment?.token;
  const attached = id ? scene.tokens.get(id) : null;
  if (attached && isHandle(attached)) return attached;
  return scene.tokens.find(tk => aoeFlags(tk).region === region.id) ?? null;
}

const pending = new Set();   // region ids whose handle is being created on this client

/** Create the handle token for a template region and attach the region to it. */
export async function createHandle(region) {
  if (!isTemplateRegion(region) || pending.has(region.id) || handleFor(region)) return null;
  const actor = handleActor();
  if (!actor) return null;
  const scene = region.parent;
  pending.add(region.id);
  try {
    const shape = region.shapes?.[0];
    const { x, y } = centreOf(shape);
    const half = (scene.grid.size * 0.5) / 2;
    const origin = region.flags?.dnd5e?.origin ? fromUuidSync(region.flags.dnd5e.origin) : null;
    const authorId = Object.entries(region.ownership ?? {}).find(([k, v]) => k !== "default" && v === OWNER)?.[0];
    const who = game.users.get(authorId)?.name ?? game.user.name;
    const proto = actor.prototypeToken.toObject();
    const [token] = await scene.createEmbeddedDocuments("Token", [{
      ...proto,
      actorId: actor.id,
      x: Math.round(x - half),
      y: Math.round(y - half),
      elevation: region.elevation?.bottom ?? 0,
      hidden: !!region.hidden,
      name: `${origin?.item?.name ?? region.name} (${who})`,
      flags: { ...(proto.flags ?? {}), [MODULE]: { handle: true, region: region.id } }
    }]);
    if (!token) return null;
    const update = { attachment: { token: token.id }, [`flags.${MODULE}.handle`]: token.id };
    if (token.level) update.levels = [token.level];
    await region.update(update);
    return token;
  } finally {
    pending.delete(region.id);
  }
}

/* -------------------------------------------- */
/*  Finding and removing areas                  */
/* -------------------------------------------- */

/** Template regions created by an activity, on one scene (default: every scene). */
export function areasFor(activityUuid, scene = null) {
  if (!activityUuid) return [];
  const scenes = scene ? [scene] : game.scenes.contents;
  return scenes.flatMap(s => s.regions.filter(r => isTemplateRegion(r) && r.flags?.dnd5e?.origin === activityUuid));
}

/** Delete regions (and through the cascade their handles). Accepts ids on a scene, or documents. */
export async function removeArea(regions, scene = canvas.scene) {
  const docs = [regions].flat().map(r => (typeof r === "string" ? scene?.regions.get(r) : r)).filter(Boolean)
    .filter(isTemplateRegion);
  const byScene = new Map();
  for (const r of docs) {
    if (!r.canUserModify(game.user, "delete")) continue;
    const list = byScene.get(r.parent) ?? [];
    list.push(r.id);
    byScene.set(r.parent, list);
  }
  let n = 0;
  for (const [s, ids] of byScene) {
    const live = ids.filter(id => s.regions.has(id));
    if (!live.length) continue;
    await s.deleteEmbeddedDocuments("Region", live);
    n += live.length;
  }
  return n;
}

async function deleteHandlesOf(region) {
  const scene = region.parent;
  const ids = scene.tokens.filter(tk => isHandle(tk) && aoeFlags(tk).region === region.id
    && tk.canUserModify(game.user, "delete")).map(tk => tk.id);
  if (ids.length) await scene.deleteEmbeddedDocuments("Token", ids.filter(id => scene.tokens.has(id)));
}

/**
 * Repair one scene (active GM): delete handles whose region is gone, give template regions the
 * shared ownership and a handle if they have none. Returns what it did.
 */
export async function sweep(scene = canvas.scene) {
  const out = { orphansDeleted: 0, ownershipFixed: 0, handlesCreated: 0 };
  if (!scene || !game.user.isGM) return out;
  const orphans = scene.tokens.filter(tk => isHandle(tk) && !scene.regions.has(aoeFlags(tk).region)).map(tk => tk.id);
  if (orphans.length) {
    await scene.deleteEmbeddedDocuments("Token", orphans);
    out.orphansDeleted = orphans.length;
  }
  for (const r of scene.regions.filter(isTemplateRegion)) {
    if (r.ownership.default !== OWNER) { await r.update({ "ownership.default": OWNER }); out.ownershipFixed++; }
    if (setting("handleTokens") && !handleFor(r) && r.shapes.length === 1) {
      if (await createHandle(r)) out.handlesCreated++;
    }
  }
  return out;
}

/* -------------------------------------------- */
/*  "Remove all templates" on the spell card    */
/* -------------------------------------------- */

/**
 * Template regions placed by a spell on one scene (default: every scene). Matched by the spell
 * item, so every activity of that spell is covered; the activity uuid is the fallback.
 */
export function spellAreas({ itemUuid = null, activityUuid = null } = {}, scene = null) {
  if (!itemUuid && !activityUuid) return [];
  const scenes = scene ? [scene] : game.scenes.contents;
  return scenes.flatMap(s => s.regions.filter(r => isTemplateRegion(r)
    && regionFromSpell(r.flags?.dnd5e, { itemUuid, activityUuid })));
}

/**
 * The button sits directly under dnd5e's Place Template (same card, same column), so placing
 * and clearing are side by side. It clears that spell's templates on the scene being viewed.
 */
function decorateCard(message, html) {
  if (!setting("removeAreaButton")) return;
  const activityUuid = message.flags?.dnd5e?.activity?.uuid;
  if (!activityUuid || message.flags?.dnd5e?.roll) return;     // usage cards only, not roll messages
  const buttons = html.querySelector(".card-buttons");
  if (!buttons || buttons.querySelector("[data-pentaryn-aoe-action]")) return;
  const place = buttons.querySelector('[data-action="placeTemplate"]');
  const activity = fromUuidSync(activityUuid, { strict: false });
  if (!place && !activity?.target?.template?.type) return;     // only cards that place an area
  const itemUuid = message.flags?.dnd5e?.item?.uuid ?? activity?.item?.uuid ?? null;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.pentarynAoeAction = "remove";
  btn.innerHTML = `<i class="fa-solid fa-eraser" inert></i> <span>${t("RemoveAllTemplates")}</span>`;
  btn.addEventListener("click", async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const scene = canvas.scene;
    // No viewed scene → nothing; spellAreas(…, null) would mean every scene.
    const regions = scene ? spellAreas({ itemUuid, activityUuid }, scene) : [];
    if (!regions.length) return ui.notifications.info(t("NoArea"));
    btn.disabled = true;
    try {
      const n = await removeArea(regions, scene);
      if (!n) ui.notifications.warn(t("CannotRemove"));
    } finally {
      btn.disabled = false;
    }
  });
  if (place) place.after(btn);
  else buttons.append(btn);
}

/* -------------------------------------------- */
/*  Hook wiring                                 */
/* -------------------------------------------- */

export function installAreas() {
  // Ownership on the creating client, before the document exists.
  on("preCreateRegion", guard("preCreateRegion", (doc, data) => {
    if (!data?.flags?.core?.MeasuredTemplate) return;
    doc.updateSource({ "ownership.default": OWNER });
  }));

  on("createRegion", guard("createRegion", async (region, options, userId) => {
    if (!isTemplateRegion(region)) return;
    const gm = game.users.activeGM?.isSelf;
    if (gm && region.ownership.default !== OWNER) await region.update({ "ownership.default": OWNER });
    if (!setting("handleTokens") || region.shapes.length !== 1) return;
    if (userId === game.user.id) await createHandle(region);
    else if (gm) {
      // Backstop for a creator whose client has no module (or no handle actor): wait, then repair.
      setTimeout(() => {
        const live = region.parent?.regions.get(region.id);
        if (live && !handleFor(live)) createHandle(live).catch(err => console.error("pentaryn-aoe | backstop handle", err));
      }, 2500);
    }
  }));

  // Region deleted another way → its handle goes too. The deleting client acts at once; the GM
  // repeats it shortly after in case that client couldn't.
  on("deleteRegion", guard("deleteRegion", async (region, options, userId) => {
    if (!isTemplateRegion(region)) return;
    if (userId === game.user.id) await deleteHandlesOf(region);
    else if (game.users.activeGM?.isSelf) setTimeout(() => deleteHandlesOf(region).catch(() => {}), 1500);
  }));

  // Handles are never combatants and never stay targeted.
  on("preCreateCombatant", (combatant, data) => {
    const tk = combatant.token ?? combatant.parent?.scene?.tokens?.get(data?.tokenId);
    if (tk && isHandle(tk)) return false;
  });
  on("targetToken", guard("targetToken", (user, token, targeted) => {
    if (targeted && user === game.user && isHandle(token.document)) token.setTarget(false, { releaseOthers: false });
  }));

  on("dnd5e.renderChatMessage", guard("renderChatMessage(remove)", decorateCard));

  // Concentration ends → that spell's areas go, on every scene.
  on("deleteActiveEffect", guard("deleteActiveEffect", async (effect, options, userId) => {
    if (!game.users.activeGM?.isSelf || !setting("concentrationCleanup")) return;
    if (!effect.statuses?.has?.(CONFIG.specialStatusEffects.CONCENTRATING ?? "concentrating")) return;
    const itemUuid = effect.origin ?? effect.flags?.dnd5e?.item?.uuid;
    if (!itemUuid) return;
    for (const s of game.scenes) {
      const ids = s.regions.filter(r => isTemplateRegion(r) && r.flags?.dnd5e?.item === itemUuid).map(r => r.id);
      if (ids.length) await s.deleteEmbeddedDocuments("Region", ids);
    }
  }));
}

/** Startup work for the active GM: the actor, then a sweep of the viewed scene. */
export async function readyAreas({ sweepOnReady = true } = {}) {
  if (!game.users.activeGM?.isSelf) return;
  await ensureHandleActor();
  if (sweepOnReady) {
    await sweep(canvas.scene);
    on("canvasReady", guard("canvasReady", c => game.users.activeGM?.isSelf && sweep(c.scene)));
  }
}
