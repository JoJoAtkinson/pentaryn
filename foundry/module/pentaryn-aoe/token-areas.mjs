/**
 * Part A (continued) — spell areas that follow a token (feedback WSMeuV, 2026-10-19).
 *
 * dnd5e 6 attaches an emanation that is not `stationary` to its caster's token, and areas.mjs gives
 * such a region no handle (re-attaching it to a handle would strand it when the caster moves). Two
 * things follow from that:
 *   - an INSTANTANEOUS emanation (Thunder Step) is left unattached when it is created, so it stays
 *     where it was cast and gets a handle like any other area ([declared] aoe-instant-stationary);
 *   - a lasting one (Spirit Guardians) keeps following its caster, and the caster's Token HUD gets an
 *     eraser that removes the areas on that token ([declared] aoe-token-hud-remove).
 */

import { MODULE, attachedTokenId, instantSpellArea, isHandle, isTemplateRegion } from "./core.mjs";
import { removeArea } from "./scene-adapter.mjs";
import { setting } from "./settings.mjs";
import { makeLog } from "./lib/log.mjs";

let hooks = null;
let log = makeLog(MODULE);   // the entry's ctx.log once installed

/** A DOM listener wrapped like a hook (the kit's pass-through guard), once installed. */
const listenerGuard = (label, fn) => (hooks ? hooks.guardSwallowAsync(label, fn) : fn);

/**
 * Thunder Step's ring stayed on Marwen after she teleported and moved with her for the rest of the
 * session. It had no handle (it was attached to her), no Active Effect, and no damage was rolled,
 * so instantCleanup never ran either: nothing a player could find removed it.
 * `dnd5e.createMeasuredTemplate` hands us the region data before it is created: an instantaneous
 * activity's area is left unattached, where it was cast. areas.mjs then gives it a handle (drag it,
 * delete it), and it goes once its tray is applied. Only a spell's area: a monster feature dnd5e
 * marks "inst" can be a passive aura (a ghast's Stench) and keeps following its creature
 * (core.instantSpellArea). Setting stationaryInstantAreas (row dnd5e-instant-area-stationary).
 * Returns how many regions it changed (tests).
 */
function onCreateTemplate(activity, regionData) {
  if (!setting("stationaryInstantAreas") || !instantSpellArea(activity) || !Array.isArray(regionData)) return 0;
  let n = 0;
  for (const data of regionData) {
    if (!data?.attachment?.token) continue;
    data.attachment.token = null;
    n++;
  }
  return n;
}

/** The template regions attached to this token (not a handle): emanations that follow it. */
function areasOnToken(tokenDoc) {
  const scene = tokenDoc?.parent;
  if (!scene?.regions || isHandle(tokenDoc)) return [];
  return scene.regions.filter(r => isTemplateRegion(r) && attachedTokenId(r) === tokenDoc.id);
}

/**
 * Before this, a spell area that follows a token could only be removed with the card's eraser or
 * on the GM's Regions layer. The token's HUD gets an eraser button, "Remove the spell areas on this
 * token", when the token carries one this user may delete. A click deletes them (removeArea).
 */
function decorateTokenHUD(app, element) {
  const tokenDoc = app?.object?.document ?? app?.document ?? null;
  const regions = areasOnToken(tokenDoc).filter(r => r.canUserModify?.(game.user, "delete") ?? true);
  if (!regions.length) return;
  const root = element?.[0] ?? element;   // v14 hands an HTMLElement; a jQuery wrapper still works
  const col = root?.querySelector?.(".col.right") ?? root?.querySelector?.(".right");
  if (!col || col.querySelector("[data-pentaryn-aoe-action]")) return;
  const label = _loc("PENTARYN_AOE.RemoveTokenAreas");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon pa-hud-remove";
  btn.dataset.pentarynAoeAction = "remove-token-areas";
  btn.dataset.tooltip = label;
  btn.setAttribute("aria-label", label);
  btn.innerHTML = `<i class="fa-solid fa-eraser" inert></i>`;
  btn.addEventListener("click", listenerGuard("remove token areas", async ev => {
    ev.preventDefault();
    ev.stopPropagation();
    const live = areasOnToken(tokenDoc);
    if (!live.length) return;
    btn.disabled = true;
    try {
      const n = await removeArea(live, tokenDoc.parent);
      if (!n) ui.notifications.warn(_loc("PENTARYN_AOE.CannotRemove"));
      else app?.render?.();
    } finally {
      btn.disabled = false;
    }
  }));
  col.append(btn);
}

export function install(reg, ctx) {
  hooks = reg;
  log = ctx.log;
  // Synchronous and never a veto: dnd5e creates the regions right after this hook.
  reg.on("dnd5e.createMeasuredTemplate", (activity, regionData) => {
    try { onCreateTemplate(activity, regionData); } catch (err) { log.error("createMeasuredTemplate", err); }
  }, { guard: false, label: "createMeasuredTemplate(instant)" });
  reg.on("renderTokenHUD", reg.guardSwallowAsync("renderTokenHUD(remove)", decorateTokenHUD), { guard: false, label: "renderTokenHUD(remove)" });
}

/** Nothing of its own to undo: every hook went through the registry the entry unwinds. */
export function uninstall() {
  hooks = null;
}

// Test seam (characterisation checkpoint): tests import this through test/fixtures/seams.mjs only.
// Not part of the API.
export const _internals = { onCreateTemplate, areasOnToken, decorateTokenHUD };
