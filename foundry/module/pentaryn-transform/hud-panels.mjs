/**
 * Pentaryn Transform — FEATURE: Wild Shape and Starry Form on the Argon Combat HUD.
 *
 * Argon exposes no "add a button to this panel" API, but every component fires
 * render{ParentClass}ArgonComponent after it renders, and the dnd5e panels' parent is ActionPanel.
 * So the Bonus and Action bars are recomposed in that hook: the panel's button list is a plain
 * array and its buttons are plain elements. No lib-wrapper. The components are form-picker.mjs's,
 * Argon's private state is read through argon.mjs.
 *
 * Listener order matters (golden/hooks.json): pentaryn-combat recomposes the same Action panel in
 * its own renderActionPanelArgonComponent listeners.
 */

import {
  MODULE, EFFECT_ID, activitiesOf, isWildShapeActivity, findWildShapeItem, planBonusBar, planWithout, frontRowItems,
  coveredPanel, hpText, portraitText, earnsChalice, formatDuration, pruneDisconnected
} from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { registerKeybindings } from "./settings.mjs";
import { apiOf } from "./lib/publish.mjs";
import { wildShapeActivity, original, isRevertItem, bonusUsedNow, isWildShapeForm } from "./wildshape-adapter.mjs";
import {
  STARRY_EFFECT_ID, starryItem, activeStarry, constellationOf, starrySecondsLeft, constellationActivity
} from "./starry-adapter.mjs";
import {
  onPointerMove, dropStaleTooltip, pickerOpen, cancelTargetPicker, closeOwnPickers,
  hudActor, hudTokenDoc, hudTokenId, hudPortrait, hudPanel
} from "./argon.mjs";
import { applyButtons, itemButtonClass, slotKind } from "./lib/argon-kit.mjs";
import { argonClasses, liveButtons, TT } from "./form-picker.mjs";

const log = makeLog(MODULE);

/* ── the target picker: cancelled when the HUD's token changes body, and on Escape ── */
// Tooltip hygiene lives in argon.mjs.

/** The HUD's token became another body (a shift, a revert, a token swap): its pending pick is stale. */
function onTokenBody(doc, changes) {
  if (!("actorId" in (changes ?? {})) && !("name" in (changes ?? {})) && changes !== null) return;
  if (!pickerOpen()) return;
  const hudToken = hudTokenDoc() ?? null;
  if (doc === hudToken || doc?.object?.controlled) cancelTargetPicker();
}
function onTokenDelete(doc) {
  onTokenBody(doc, null);
}

// Escape cancels the target picker, else closes an open Wild Shape / Starry Form picker (PT3-6);
// either otherwise fell through to core's dismiss and opened the game menu. With nothing open it
// returns false, so Escape still reaches core. Synchronous on purpose: an async onDown returns a
// Promise, which always counts as consumed.
function registerEscape() {
  registerKeybindings({
    onDown: () => {
      if (pickerOpen()) { cancelTargetPicker(); return true; }
      return closeOwnPickers();
    }
  });
}

/* ── composing the bars ──────────────────────────────────────────────────── */

function composeBonusBar(panel, actor) {
  pruneDisconnected(liveButtons);             // the buttons Argon's last rebuild left behind (-10)
  const C = argonClasses();
  const ItemBtn = itemButtonClass(panel);
  if (!C || !ItemBtn || !actor) return;
  const shifted = !!actor.isPolymorphed;
  const hasWildShape = !!wildShapeActivity(actor) && !!original(actor);
  const revertItems = actor.items.filter(isRevertItem);
  if (!hasWildShape && !revertItems.length) return;
  const ownWs = findWildShapeItem(actor.items);
  // Shifted, planBonusBar drops a carried Starry Form's button instead of replacing it (PT3-4).
  const starry = starryItem(actor);

  const plan = planBonusBar(panel._buttons.map(b => slotKind(b, C)), {
    wildShapeId: ownWs?.id ?? null,
    revertIds: revertItems.map(i => i.id),
    shifted,
    revertId: shifted ? (revertItems[0]?.id ?? null) : null,
    ownReturn: isWildShapeForm(actor),          // a Polymorph spell is not ended as a Bonus Action
    hasWildShape,
    starryId: starry?.id ?? null
  });
  const fresh = [];
  const next = [];
  for (const p of plan) {
    if ("keep" in p) { next.push(panel._buttons[p.keep]); continue; }
    let b;
    if (p.wildshape) b = new C.WildShapeButton({ hudActor: actor });
    else if (p.starry) b = new C.StarryFormButton({ hudActor: actor });
    else if (p.revert) b = new C.ReturnButton({ hudActor: actor });
    else b = new ItemBtn({ item: actor.items.get(p.item), inActionPanel: true });
    if (p.highlight) b.element.classList.add("ptf-return");
    fresh.push(b);
    next.push(b);
    // While the Archer or the Chalice glimmers, its use sits right beside the form.
    const c = p.starry ? constellationOf(actor) : null;
    const act = c && c !== "dragon" ? constellationActivity(actor, c) : null;
    if (act) {
      const ab = new ItemBtn({ item: act, inActionPanel: true });
      ab.element.classList.add("ptf-starry-act");
      if (c === "chalice") {
        ab.element.classList.add("ptf-starry-chalice");
        ab.element.classList.toggle("ptf-chalice-ready", chaliceReady.has(actor.uuid));
      }
      fresh.push(ab);
      next.push(ab);
    }
  }
  applyButtons(panel, next, fresh);

  // The shift or revert this turn spent the Bonus Action on a HUD that no longer exists.
  if (bonusUsedNow(hudTokenId())) {
    panel.isActionUsed = true;
    panel.updateActionUse();
  }
}

/**
 * U-4-1: the form's Multiattack item when pentaryn-combat's Full Attack already runs it, so the
 * text-only Multiattack button beside Full Attack can go — combat's own published answer,
 * coversMultiattack(actor) (transform-creatures-13 step 3; its fullAttack / multiattack settings and
 * the parsed Multiattack are combat's business). null = keep it (combat off or not yet published, a
 * setting off, an unparsed Multiattack); a failing call warns once and keeps it.
 */
function multiattackCoveredByFullAttack(actor) {
  try {
    if (!game.modules.get("pentaryn-combat")?.active) return null;
    return apiOf("pentaryn-combat")?.coversMultiattack?.(actor) ?? null;
  } catch (err) {
    log.warnOnce("combat-multiattack", "combat multiattack read failed", err);
    return null;
  }
}

function composeActionBar(panel, actor) {
  if (!actor?.isPolymorphed) return;
  const C = argonClasses();
  const ItemBtn = itemButtonClass(panel);
  if (!C || !ItemBtn) return;
  const slot = panel._buttons.find(b => b._isWeaponSet);
  const onBar = panel._buttons.filter(b => b instanceof C.ItemButton && !b._isWeaponSet).map(b => b.item?.id);
  const covered = multiattackCoveredByFullAttack(actor);
  const ids = frontRowItems(actor.items.contents, onBar).filter(id => id !== covered);
  // The beast's attacks replace the weapon-set slot; showing both would list Bite twice.
  slot?.element.classList.add("ptf-hidden");
  // Argon's "Use Feature" panel lists the beast's action features (a Brown Bear's Multiattack) that
  // are already front-row buttons: a second way to the same thing. A panel holding nothing else goes.
  const front = [...onBar, ...ids, ...(covered ? [covered] : [])];
  const PanelBtn = CONFIG.ARGON?.MAIN?.BUTTONS?.ButtonPanelButton;
  const kept = panel._buttons.filter(b => {
    if (!PanelBtn || !(b instanceof PanelBtn) || liveButtons.has(b) || !Array.isArray(b.items)) return true;
    return !coveredPanel(b.items.map(i => i?.item?.id ?? i?.id), front);
  });
  if (!ids.length && kept.length === panel._buttons.length) return panel.updateVisibility();
  const fresh = ids.map(id => new ItemBtn({ item: actor.items.get(id), inActionPanel: true }));
  const next = [...kept];
  next.splice(slot ? next.indexOf(slot) + 1 : 0, 0, ...fresh);
  applyButtons(panel, next, fresh);
}

/** Starry Form lives on the Bonus bar only: drop it from the Special bar (Chalice/Dragon are "special"). */
function composeSpecialBar(panel, actor) {
  const starry = starryItem(actor);
  if (!starry) return;
  const C = argonClasses();
  const ItemBtn = itemButtonClass(panel);
  if (!C || !ItemBtn) return;
  const plan = planWithout(panel._buttons.map(b => slotKind(b, C)), [starry.id]);
  if (!plan) return;
  const fresh = [];
  const next = plan.map(p => {
    if ("keep" in p) return panel._buttons[p.keep];
    const b = new ItemBtn({ item: actor.items.get(p.item), inActionPanel: true });
    fresh.push(b);
    return b;
  });
  applyButtons(panel, next, fresh);
}

function onActionPanelRender(panel, element, actor) {
  // hot: the panel's actor only (its items/effects, map lookups, combat's coversMultiattack); no world iteration
  try {
    const a = actor ?? panel.actor;
    if (panel?.label === "DND5E.BonusAction") composeBonusBar(panel, a);
    else if (panel?.label === "DND5E.Action") composeActionBar(panel, a);
    else if (panel?.label === "DND5E.Special") composeSpecialBar(panel, a);
  } catch (err) {
    log.error("HUD composition failed", err);
  }
  setTimeout(dropStaleTooltip, 0);
}

// In a beast form the Reaction bar's weapon slot is the Opportunity Attack, not a second Bite.
function onItemButtonRender(button) {
  if (!button?._isWeaponSet || button.parent?.label !== "DND5E.Reaction") return;
  const actor = hudActor();
  if (!actor?.isPolymorphed || !button.item) return;
  const title = button.element.querySelector(".feature-element-title, .action-element-title");
  if (title) title.textContent = _loc("PENTARYN_TRANSFORM.Hud.OpportunityAttack", { name: button.item.name });
}

/* ── the portrait: what Talo is, and for how long ────────────────────────── */
// dnd5e's portrait line for a character is "Level 12 Druid (<species>)"; a Wild Shape form drops
// the species, so it read "(null)". While a form or Starry Form is up, the line says that instead.

function portraitLine(actor) {
  if (!actor) return null;
  const ws = actor.isPolymorphed ? actor.effects.get(EFFECT_ID) : null;
  const starry = ws ? null : activeStarry(actor);
  const p = portraitText({
    ws, endsAt: ws ? actor.getFlag(MODULE, "wildshape")?.endsAt : null,
    starry, starryLeft: starry ? starrySecondsLeft(actor) : null, worldTime: game.time.worldTime
  });
  if (!p) return null;
  return p.left === null ? p.what : _loc("PENTARYN_TRANSFORM.Hud.PortraitLeft", { what: p.what, left: p.left });
}

/**
 * Argon prints HP as value + temp over max, so a druid back from a form with the Wild Shape temp HP
 * (which last until spent or a Long Rest) read "111/99". For a Wild Shape druid or form: "99+12/99".
 */
function paintHP(element, actor) {
  const hp = actor?.system?.attributes?.hp;
  if (!hp || !wildShapeActivity(actor)) return;
  // Argon appends one .portrait-stat-block per stat after the name block (also a .portrait-stat-block):
  // the HP one is [value+temp, "/", max, "HP"].
  const block = [...(element?.querySelectorAll?.(".portrait-stat-block:not(.player-details)") ?? [])]
    .find(b => b.children.length >= 3 && b.children[1]?.textContent?.trim() === "/");
  const first = block?.children?.[0];
  if (!first) return;
  const t = hpText(hp);
  if (!t.hasTemp) return;
  first.textContent = t.current;
  first.dataset.tooltip = _loc("PENTARYN_TRANSFORM.Hud.HPTemp", { value: hp.value, temp: hp.temp });
  first.classList.add("ptf-hp-temp");
}

function paintPortrait(element, actor) {
  try { paintHP(element, actor); } catch (err) { log.warn("portrait HP failed", err); }
  const detail = element?.querySelector?.(".player-detail");
  if (!detail) return;
  const line = portraitLine(actor);
  if (line) {
    if (detail.dataset.pentarynOriginal === undefined) detail.dataset.pentarynOriginal = detail.textContent.trim();
    detail.textContent = line;
    detail.classList.add("ptf-form-line");
  } else if (detail.classList.contains("ptf-form-line")) {
    detail.textContent = detail.dataset.pentarynOriginal ?? "";
    detail.classList.remove("ptf-form-line");
  }
}

function onPortraitRender(panel, element, actor) {
  try { paintPortrait(element, actor ?? panel.actor); } catch (err) { log.warn("portrait line failed", err); }
  setTimeout(dropStaleTooltip, 0);
}

function onWorldTime() {
  // hot: reads only the HUD's own actor (ui.ARGON._actor); display only, every client.
  const portrait = hudPortrait();
  if (portrait?.element) { const actor = hudActor(); if (actor) paintPortrait(portrait.element, actor); }
}

/* ── the Wild Shape / Starry Form effect on the portrait: bigger, live time left ── */

function onEffectRender(component) {
  const uuid = component?.effect?.uuid ?? "";
  const isWs = uuid.endsWith(`ActiveEffect.${EFFECT_ID}`);
  const isStarry = uuid.endsWith(`ActiveEffect.${STARRY_EFFECT_ID}`);
  if (!isWs && !isStarry) return;
  component.element.classList.add("ptf-effect");
  component.getTooltipData = async function () {
    const actor = hudActor();
    let secs = null;
    if (isWs) {
      const endsAt = actor?.getFlag(MODULE, "wildshape")?.endsAt;
      if (Number.isFinite(endsAt)) secs = endsAt - game.time.worldTime;
    } else secs = starrySecondsLeft(actor);
    const left = secs !== null ? `<p><strong>${_loc("PENTARYN_TRANSFORM.Hud.TimeLeft")}</strong> ${formatDuration(secs)}</p>` : "";
    return { title: this.label, description: left + (this.effect.tooltip ?? ""), classes: TT };
  };
}

/* ── badge refresh: the Wild Shape item lives on the original, not the bound form ── */

function refreshLive(item) {
  pruneDisconnected(liveButtons);
  for (const b of liveButtons) {
    if (!b.element.isConnected) continue;
    if (!item || b.wildShapeItem === item) b.refreshCount();
  }
}
function onItemUpdate(item) {
  if (activitiesOf(item).some(isWildShapeActivity)) refreshLive(item);
}

// Starry Form on or off: the button's label, icon and constellation button change; rebuild the bar.
function onStarryChange(effect) {
  if (!effect?.getFlag?.(MODULE, "starry")) return;
  if (effect.parent !== hudActor()) return;
  const bonus = hudPanel("DND5E.BonusAction");
  if (!bonus?.render) return;
  for (const b of bonus._buttons ?? []) if (liveButtons.has(b)) { b.panel?.element?.remove(); liveButtons.delete(b); }
  bonus.render();
  setTimeout(dropStaleTooltip, 50);
}

// A combat tick writes only the time left (D8-starry): nothing on the bar changes, so no rebuild
// (a rebuild every round would also close an open Wild Shape or Starry picker).
const STARRY_LEFT = `flags.${MODULE}.starry.left`;
function onStarryUpdate(effect, changes) {
  const paths = Object.keys(foundry.utils.flattenObject(changes ?? {})).filter(k => k !== "_id" && !k.startsWith("_stats"));
  if (paths.length && paths.every(k => k === STARRY_LEFT)) return;
  onStarryChange(effect);
}

/* ── Chalice: offered when it is earned (Area 4, D6) ─────────────────────── */
// "Whenever you cast a spell using a spell slot that restores Hit Points to a creature, you or
// another creature within 30 feet of you can regain Hit Points equal to 1d8 + WIS" (2024 PHB). The
// Chalice button sat beside Starry Form with nothing saying the second heal was there to take, so it
// was missed. After such a spell, the Chalice button pulses until it is used or a minute passes.
// The player still clicks it and rolls (own dice stay possible); nothing is rolled for them.

const chaliceReady = new Map();   // actor uuid → timer

function paintChalice(actor) {
  if (actor !== hudActor()) return;
  const on = chaliceReady.has(actor.uuid);
  for (const el of document.querySelectorAll(".extended-combat-hud .ptf-starry-chalice")) {
    el.classList.toggle("ptf-chalice-ready", on);
  }
}

function setChalice(actor, on) {
  clearTimeout(chaliceReady.get(actor.uuid));
  if (on) chaliceReady.set(actor.uuid, setTimeout(() => { chaliceReady.delete(actor.uuid); paintChalice(actor); }, 60_000));
  else chaliceReady.delete(actor.uuid);
  paintChalice(actor);
}

function onChaliceUse(activity, usageConfig) {
  try {
    const actor = activity?.actor;
    if (!actor || constellationOf(actor) !== "chalice") return;
    if (activity.item?.id === starryItem(actor)?.id && activity.id === constellationActivity(actor, "chalice")?.id) {
      setChalice(actor, false);
      return;
    }
    if (earnsChalice(activity, usageConfig)) setChalice(actor, true);
  } catch (err) { log.warn("Chalice offer skipped", err); }
}

// Starry Form ended or changed constellation: no Chalice to take.
function onStarryEnd(effect) {
  if (effect?.getFlag?.(MODULE, "starry") && effect.parent instanceof Actor) setChalice(effect.parent, false);
}

const POINTER = { passive: true, capture: true };

export function install(reg) {
  document.addEventListener("pointermove", onPointerMove, POINTER);
  reg.on("updateToken", onTokenBody, { label: "updateToken: the HUD's token changed body" });
  reg.on("deleteToken", onTokenDelete, { label: "deleteToken: the HUD's token is gone" });
  reg.once("init", registerEscape, { label: "init: Escape keybinding" });
  reg.on("renderActionPanelArgonComponent", onActionPanelRender, { label: "renderActionPanelArgonComponent: Bonus / Action / Special bars" });
  reg.on("renderItemButtonArgonComponent", onItemButtonRender, { label: "renderItemButtonArgonComponent: Opportunity Attack label" });
  reg.on("renderPortraitPanelArgonComponent", onPortraitRender, { label: "renderPortraitPanelArgonComponent: form line and HP" });
  reg.on("updateWorldTime", onWorldTime, { label: "updateWorldTime: repaint the portrait" });
  reg.on("renderEffectArgonComponent", onEffectRender, { label: "renderEffectArgonComponent: the form's effect" });
  reg.on("updateItem", onItemUpdate, { label: "updateItem: Wild Shape uses badge" });
  reg.on("createActiveEffect", onStarryChange, { label: "createActiveEffect: Starry Form rebuilds the Bonus bar" });
  reg.on("updateActiveEffect", onStarryUpdate, { label: "updateActiveEffect: Starry Form rebuilds the Bonus bar" });
  reg.on("deleteActiveEffect", onStarryChange, { label: "deleteActiveEffect: Starry Form rebuilds the Bonus bar" });
  reg.on("dnd5e.postUseActivity", onChaliceUse, { label: "dnd5e.postUseActivity: Chalice offer" });
  reg.on("deleteActiveEffect", onStarryEnd, { label: "deleteActiveEffect: no Chalice to take" });
}

/** Remove the pointer listener; drop the live buttons and the Chalice offers (and their timers). */
export function uninstall() {
  document.removeEventListener("pointermove", onPointerMove, POINTER);
  liveButtons.clear();
  for (const t of chaliceReady.values()) clearTimeout(t);
  chaliceReady.clear();
}
