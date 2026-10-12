// Pentaryn Transform — Wild Shape on the Argon Combat HUD.
//
// Argon exposes no "add a button to this panel" API, but every component fires
// render{ParentClass}ArgonComponent after it renders, and the dnd5e panels' parent is
// ActionPanel. So the Bonus and Action bars are recomposed in that hook: the panel's
// button list is a plain array and its buttons are plain elements. No lib-wrapper.
//
// Argon's dnd5e button class is closure-private; the weapon-set slot every Action/Bonus panel
// starts with is an instance of it, so its constructor is borrowed from there.
// Template rule: an Argon component renders partials/{ParentClassName}.hbs, so each class here
// subclasses an Argon base directly (never two deep).

import {
  MODULE_ID, EFFECT_ID, activitiesOf, isWildShapeActivity, usesLeft, durationSeconds, formatDuration,
  formSummary, planBonusBar, planWithout, frontRowItems, coveredPanel, hpText, returnLabel, CONSTELLATIONS, STARRY_SECONDS
} from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { shift, forms, wildShapeActivity, original, isRevertItem, bonusUsedNow, returnToNormal, isWildShapeForm } from "./transform.mjs";
import {
  STARRY_EFFECT_ID, starryItem, wildShapeItemOf, hasTwinkling, activeStarry, constellationOf, starrySecondsLeft,
  constellationLabel, constellationImg, constellationText, constellationActivity, assumeStarry, endStarry
} from "./starry.mjs";

const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const log = makeLog(MODULE_ID);

let DND5eItemButton = null;      // borrowed from the weapon-set slot, once seen
let built = null;                // { WildShapeButton, FormTile, … }, built on first use
const liveButtons = new Set();   // Wild Shape / Starry Form buttons, for badge refreshes

/* ── tooltips ────────────────────────────────────────────────────────────── */
// Argon shows its tooltips through Foundry's TooltipManager, anchored to the hovered button. Every
// shift and revert rebuilds the HUD, so that button leaves the DOM without a pointerleave and the
// tooltip stayed on screen until the mouse found another tooltipped element. Any tooltip whose
// anchor is gone is dropped: after each HUD render, and on the next pointer move.

function dropTooltip() {
  try {
    game.tooltip?.deactivate?.();
    if (ui.ARGON?._tooltip) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("tooltip hygiene", err); }   // never let tooltip hygiene break a click
}

function dropStaleTooltip() {
  const anchor = game.tooltip?.element;
  if (anchor && !anchor.isConnected) dropTooltip();
}

let staleCheckQueued = false;
document.addEventListener("pointermove", () => {
  if (staleCheckQueued) return;
  staleCheckQueued = true;
  setTimeout(() => { staleCheckQueued = false; dropStaleTooltip(); }, 60);
}, { passive: true, capture: true });

/* ── Argon's target picker ───────────────────────────────────────────────── */
// Clicking an attack opens Argon's "0/1 Targets" picker: it switches the canvas to the Target tool
// and waits for a target. It is bound to the button that opened it, so a shift or revert in the
// meantime left it on screen with the canvas still in Target mode — later clicks targeted tokens
// instead of selecting them, and the attack it finally ran was the old form's. Argon's only cancel
// is a right-click (its picker listens for a right-button mouseup on the document) and the picker
// instance is private to Argon's bundle, so the same right-button mouseup is sent to cancel it:
// when the HUD's token changes body, when a Wild Shape/Starry button is clicked, and on Escape.

function pickerOpen() {
  return !!document.querySelector(".ech-target-picker");
}

export function cancelTargetPicker() {
  if (!pickerOpen()) return false;
  try {
    document.dispatchEvent(new MouseEvent("mouseup", { button: 2, buttons: 0, bubbles: true, cancelable: true }));
  } catch (err) {
    log.warn("cancelling Argon's target picker failed", err);
  }
  return !pickerOpen();
}

/** The HUD's token became another body (a shift, a revert, a token swap): its pending pick is stale. */
function onTokenBody(doc, changes) {
  if (!pickerOpen()) return;
  if (!("actorId" in (changes ?? {})) && !("name" in (changes ?? {})) && changes !== null) return;
  const hudToken = ui.ARGON?._token?.document ?? null;
  if (doc === hudToken || doc?.object?.controlled) cancelTargetPicker();
}
Hooks.on("updateToken", onTokenBody);
Hooks.on("deleteToken", (doc) => onTokenBody(doc, null));

/** Close the module's own open pickers (Change Form / Wild Shape forms, constellations). */
function closeOwnPickers() {
  const open = document.querySelectorAll(".pentaryn-picker.show");
  for (const el of open) el.classList.remove("show");   // what ButtonPanel#toggle(false) does; no saved state (id null)
  return open.length > 0;
}

// Escape cancels the target picker, else closes an open Wild Shape / Starry Form picker (PT3-6);
// either otherwise fell through to core's dismiss and opened the game menu. With nothing open it
// returns false, so Escape still reaches core. Synchronous on purpose: an async onDown returns a
// Promise, which always counts as consumed.
Hooks.once("init", () => {
  try {
    game.keybindings.register(MODULE_ID, "cancelTargetPicker", {
      name: "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Name",
      hint: "PENTARYN_TRANSFORM.Keybinding.CancelPicker.Hint",
      editable: [{ key: "Escape" }],
      onDown: () => {
        if (pickerOpen()) { cancelTargetPicker(); return true; }
        return closeOwnPickers();
      },
      precedence: CONST.KEYBINDING_PRECEDENCE.PRIORITY
    });
  } catch (err) {
    log.warn("Escape-cancels-target-picker keybinding not registered", err);
  }
});

/** Tooltip classes: compact grid (pentaryn-tt), or one detail per row (pentaryn-tt-list). */
const TT = ["pentaryn-tt"];
const TT_LIST = ["pentaryn-tt", "pentaryn-tt-list"];

/** The uses badge, as ItemButton's `.quantity-1` markup (Argon's has-count class draws nothing). */
function paintBadge(button, left) {
  let badge = button.element.querySelector(":scope > .quantity-1");
  if (left === null || left === undefined) badge?.remove();
  else {
    if (!badge) {
      badge = document.createElement("div");
      badge.className = "quantity-1";
      badge.innerHTML = `<div class="border-triangle"></div><span></span>`;
      button.element.prepend(badge);
    }
    badge.querySelector("span").textContent = String(left);
  }
  button.element.classList.toggle("pentaryn-empty", left === 0);
}

/* ── normalising a beast for its tile tooltip ────────────────────────────── */

function summaryInput(src) {
  const s = src.system;
  const attacks = [];
  const traits = [];
  for (const item of src.items) {
    const acts = activitiesOf(item);
    const attack = acts.find(a => a.type === "attack");
    if (item.type === "weapon" || attack) {
      const a = attack ?? acts[0];
      const dmg = a?.labels?.damage ?? item.labels?.damages ?? [];
      attacks.push({
        name: item.name,
        toHit: a?.labels?.toHit ?? item.labels?.toHit ?? "",
        damage: (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ")
      });
    } else if (item.type === "feat" && item.system.type?.value === "monster" && !acts.length) {
      traits.push(item.name);                 // passive only: Multiattack and Web are front-row buttons
    }
  }
  return {
    cr: s.details?.cr,
    sizeLabel: CONFIG.DND5E.actorSizes[s.traits?.size]?.label ?? "",
    typeLabel: CONFIG.DND5E.creatureTypes[s.details?.type?.value]?.label ?? s.details?.type?.value ?? "",
    ac: s.attributes?.ac?.value,
    movement: s.attributes?.movement ?? {},
    units: s.attributes?.movement?.units || "ft",
    senses: s.attributes?.senses?.ranges ?? {},
    attacks, traits
  };
}

function recoveryText(item) {
  const periods = CONFIG.DND5E.limitedUsePeriods ?? {};
  return (item.system.uses?.recovery ?? []).map(r => {
    const when = periods[r.period]?.label ?? r.period;
    const what = r.type === "recoverAll" ? T("PENTARYN_TRANSFORM.Hud.All") : (r.formula || "1");
    return `${when}: ${what}`;
  }).join(" · ");
}

/* ── components ──────────────────────────────────────────────────────────── */

/**
 * Argon slides a panel in from translateY(1000%) over 0.3 s; a click on a tile during the slide
 * lands on the map instead (the "first tile click did nothing" report). Our pickers appear in place
 * and only fade (styles/transform.css), so a tile is clickable the moment it is visible.
 */
function picker(panel) {
  panel.element.classList.add("pentaryn-picker");
  return panel;
}

function argonClasses() {
  if (built) return built;
  const A = CONFIG.ARGON;
  const ButtonPanelButton = A?.MAIN?.BUTTONS?.ButtonPanelButton;
  const ItemButton = A?.MAIN?.BUTTONS?.ItemButton;
  const ButtonPanel = A?.MAIN?.BUTTON_PANELS?.ButtonPanel;
  if (!ButtonPanelButton || !ItemButton || !ButtonPanel) return null;

  /** One known form in the picker. A pseudo-item keeps ItemButton's label/icon/visible working. */
  class FormTile extends ItemButton {
    constructor({ form, hudActor }) {
      super({ item: { id: form.id, name: form.name, img: form.actor?.img || "icons/svg/mystery-man.svg" }, inActionPanel: false });
      this.form = form;
      this.hudActor = hudActor;
      const current = hudActor?.getFlag?.(MODULE_ID, "wildshape")?.profile;
      if (hudActor?.isPolymorphed && current === form.id) this.element.classList.add("pentaryn-current");
    }

    get hasTooltip() { return true; }

    async getTooltipData() {
      const src = this.form.actor ?? fromUuidSync(this.form.uuid);
      if (!src) return { title: this.form.name, description: "" };
      const f = formSummary(summaryInput(src));
      return {
        title: this.form.name,
        subtitle: f.subtitle,
        description: "",
        details: f.details,
        propertiesLabel: "PENTARYN_TRANSFORM.Hud.Traits",
        properties: f.traits.map(label => ({ label, secondary: true })),
        footerText: T("PENTARYN_TRANSFORM.Hud.TileHint"),
        classes: TT_LIST
      };
    }

    async _onLeftClick(event) {
      dropTooltip();
      cancelTargetPicker();
      ui.ARGON?.collapseAllPanels();
      await shift(this.hudActor, this.form.id);
      dropStaleTooltip();
    }

    async _onRightClick(event) {
      (this.form.actor ?? fromUuidSync(this.form.uuid))?.sheet?.render(true);
    }
  }

  /**
   * "Return to Talo" for a form with no revert item (PT3-3): the item's label and portrait, and the
   * item's revert path (returnToNormal). A pseudo-item keeps ItemButton's label/icon/visible working.
   */
  class ReturnButton extends ItemButton {
    constructor({ hudActor }) {
      const host = game.actors.get(hudActor?.getFlag?.("dnd5e", "originalActor")) ?? null;
      super({
        item: { id: "pentarynReturn00", name: returnLabel(host?.name ?? hudActor?.name ?? "?"), img: host?.img || hudActor?.img },
        inActionPanel: true
      });
      this.hudActor = hudActor;
    }

    get hasTooltip() { return true; }

    async getTooltipData() {
      return { title: this.label, subtitle: T("PENTARYN_TRANSFORM.Hud.BonusAction"), description: "", classes: TT };
    }

    async _onLeftClick(event) {
      dropTooltip();
      cancelTargetPicker();
      ui.ARGON?.collapseAllPanels?.();
      await returnToNormal(this.hudActor);
      dropStaleTooltip();
    }
  }

  /** "Wild Shape" in normal form, "Change Form" in a form: uses badge, opens the picker. */
  class WildShapeButton extends ButtonPanelButton {
    constructor({ hudActor }) {
      super();
      this.hudActor = hudActor;
      liveButtons.add(this);
    }

    get shifted() { return !!this.hudActor?.isPolymorphed; }
    get activity() { return wildShapeActivity(this.hudActor); }
    get wildShapeItem() { return this.activity?.item ?? null; }
    get label() { return this.shifted ? "PENTARYN_TRANSFORM.Hud.ChangeForm" : "PENTARYN_TRANSFORM.Hud.WildShape"; }
    get icon() { return this.wildShapeItem?.img ?? ""; }
    get colorScheme() { return 1; }
    get hasTooltip() { return true; }

    async getTooltipData() {
      const item = this.wildShapeItem;
      if (!item) return null;
      const uses = item.system.uses;
      const seconds = durationSeconds(this.activity.duration);
      // The feature's full text is ~2000px of scroll; the tooltip says what a click does and the
      // four numbers that matter. The full text stays on the sheet (right-click).
      const temp = original(this.hudActor)?.classes?.druid?.system?.levels;
      return {
        title: T(this.label),
        subtitle: T("PENTARYN_TRANSFORM.Hud.FormsKnown", { n: forms(this.hudActor).length }),
        description: `<p>${T(this.shifted ? "PENTARYN_TRANSFORM.Hud.ChangeFormText" : "PENTARYN_TRANSFORM.Hud.WildShapeText", { temp: temp ?? "—" })}</p>`,
        details: [
          { label: T("PENTARYN_TRANSFORM.Hud.Uses"), value: `${usesLeft(uses) ?? "—"} / ${uses?.max ?? "—"}` },
          { label: T("PENTARYN_TRANSFORM.Hud.Duration"), value: seconds ? formatDuration(seconds) : "—" },
          { label: T("PENTARYN_TRANSFORM.Hud.Recovery"), value: recoveryText(item) || "—" },
          { label: T("PENTARYN_TRANSFORM.Hud.Cost"), value: T("PENTARYN_TRANSFORM.Hud.BonusAction") }
        ],
        footerText: T("PENTARYN_TRANSFORM.Hud.WildShapeHint"),
        classes: TT
      };
    }

    /**
     * The uses badge. Argon paints counts only through ItemButton's `.quantity-1` markup — its
     * `has-count` class + data-item-count draw nothing — so the same markup goes in here.
     */
    refreshCount() {
      paintBadge(this, usesLeft(this.wildShapeItem?.system.uses));
    }

    async _renderInner() {
      // ButtonPanelButton appends a fresh panel on every render; drop the old one first.
      this.panel?.element?.remove();
      await super._renderInner();
      this.refreshCount();
    }

    async _onClick(event) {
      event.preventDefault();
      event.stopPropagation();
      // The button's own tooltip would sit over the picker it opens (and catch the tile click).
      dropTooltip();
      cancelTargetPicker();
      if (usesLeft(this.wildShapeItem?.system.uses) === 0) {   // null = no use limit
        ui.notifications.warn(T("PENTARYN_TRANSFORM.NoUses"));
        return;
      }
      this.panel.toggle();
    }

    async _onRightClick() { this.wildShapeItem?.sheet?.render(true); }

    async activateListeners(html) {
      await super.activateListeners(html);
      this.element.oncontextmenu = (ev) => { ev.preventDefault(); this._onRightClick(ev); };
    }

    async _getPanel() {
      // No panel id: Argon would otherwise remember it open and reopen it after the shift rebinds.
      return picker(new ButtonPanel({ id: null, buttons: forms(this.hudActor).map(form => new FormTile({ form, hudActor: this.hudActor })) }));
    }
  }

  /** One constellation in the Starry Form picker, or "End Starry Form". */
  class ConstellationTile extends ItemButton {
    constructor({ constellation, hudActor }) {
      const end = constellation === "end";
      super({
        item: {
          id: `pentaryn-starry-${constellation}`,
          name: end ? T("PENTARYN_TRANSFORM.Starry.EndShort") : constellationLabel(constellation),
          img: end ? "icons/svg/cancel.svg" : constellationImg(hudActor, constellation)
        },
        inActionPanel: false
      });
      this.constellation = constellation;
      this.hudActor = hudActor;
      if (!end && constellationOf(hudActor) === constellation) this.element.classList.add("pentaryn-current");
    }

    get hasTooltip() { return true; }

    async getTooltipData() {
      const actor = this.hudActor;
      if (this.constellation === "end") {
        return { title: T("PENTARYN_TRANSFORM.Starry.End"), description: `<p>${T("PENTARYN_TRANSFORM.Starry.EndText")}</p>`, classes: TT };
      }
      const current = constellationOf(actor);
      const free = !!current && hasTwinkling(actor);
      const cost = current === this.constellation ? T("PENTARYN_TRANSFORM.Starry.CostCurrent")
        : free ? T("PENTARYN_TRANSFORM.Starry.CostFree") : T("PENTARYN_TRANSFORM.Starry.CostUse");
      return {
        title: constellationLabel(this.constellation),
        subtitle: T("PENTARYN_TRANSFORM.Starry.Title"),
        description: `<p>${constellationText(actor, this.constellation)}</p>`,
        details: [{ label: T("PENTARYN_TRANSFORM.Hud.Cost"), value: cost }],
        classes: TT_LIST
      };
    }

    async _onLeftClick() {
      dropTooltip();
      cancelTargetPicker();
      ui.ARGON?.collapseAllPanels();
      if (this.constellation === "end") await endStarry(this.hudActor);
      else await assumeStarry(this.hudActor, this.constellation);
      dropStaleTooltip();
    }

    async _onRightClick() { starryItem(this.hudActor)?.sheet?.render(true); }
  }

  /** "Starry Form" (or "Starry Form: Archer" while it lasts): Wild Shape uses badge, opens the constellations. */
  class StarryFormButton extends ButtonPanelButton {
    constructor({ hudActor }) {
      super();
      this.hudActor = hudActor;
      liveButtons.add(this);
    }

    get item() { return starryItem(this.hudActor); }
    get wildShapeItem() { return wildShapeItemOf(this.hudActor); }
    get constellation() { return constellationOf(this.hudActor); }
    get label() {
      const c = this.constellation;
      return c ? `${T("PENTARYN_TRANSFORM.Starry.Title")}: ${constellationLabel(c)}` : T("PENTARYN_TRANSFORM.Starry.Title");
    }
    get icon() { return this.constellation ? constellationImg(this.hudActor, this.constellation) : (this.item?.img ?? ""); }
    get colorScheme() { return 1; }
    get hasTooltip() { return true; }

    async getTooltipData() {
      const uses = this.wildShapeItem?.system.uses;
      const c = this.constellation;
      const left = starrySecondsLeft(this.hudActor);
      const details = [
        { label: T("PENTARYN_TRANSFORM.Hud.Uses"), value: `${usesLeft(uses) ?? "—"} / ${uses?.max ?? "—"}` },
        { label: c ? T("PENTARYN_TRANSFORM.Hud.TimeLeftLabel") : T("PENTARYN_TRANSFORM.Hud.Duration"),
          value: formatDuration(c && left !== null ? left : STARRY_SECONDS) },
        { label: T("PENTARYN_TRANSFORM.Starry.Light"), value: T("PENTARYN_TRANSFORM.Starry.LightValue") },
        { label: T("PENTARYN_TRANSFORM.Hud.Cost"), value: T("PENTARYN_TRANSFORM.Hud.BonusAction") }
      ];
      return {
        title: this.label,
        subtitle: c ? T("PENTARYN_TRANSFORM.Starry.Active") : T("PENTARYN_TRANSFORM.Starry.Spends"),
        description: `<p>${c ? constellationText(this.hudActor, c) : T("PENTARYN_TRANSFORM.Starry.Text")}</p>`,
        details,
        footerText: T(c ? (hasTwinkling(this.hudActor) ? "PENTARYN_TRANSFORM.Starry.HintActiveFree" : "PENTARYN_TRANSFORM.Starry.HintActive")
          : "PENTARYN_TRANSFORM.Starry.Hint"),
        classes: TT
      };
    }

    refreshCount() {
      paintBadge(this, usesLeft(this.wildShapeItem?.system.uses));
      this.element.classList.toggle("pentaryn-starry-on", !!this.constellation);
      // Spent out but the form is up: still clickable (change constellation / end).
      if (this.constellation) this.element.classList.remove("pentaryn-empty");
    }

    async _renderInner() {
      this.panel?.element?.remove();
      await super._renderInner();
      this.refreshCount();
    }

    async _onClick(event) {
      event.preventDefault();
      event.stopPropagation();
      dropTooltip();
      cancelTargetPicker();
      if (!this.constellation && usesLeft(this.wildShapeItem?.system.uses) === 0) {
        ui.notifications.warn(T("PENTARYN_TRANSFORM.NoUses"));
        return;
      }
      this.panel.toggle();
    }

    async _onRightClick() { this.item?.sheet?.render(true); }

    async activateListeners(html) {
      await super.activateListeners(html);
      this.element.oncontextmenu = (ev) => { ev.preventDefault(); this._onRightClick(ev); };
    }

    async _getPanel() {
      const tiles = CONSTELLATIONS.map(constellation => new ConstellationTile({ constellation, hudActor: this.hudActor }));
      if (this.constellation) tiles.push(new ConstellationTile({ constellation: "end", hudActor: this.hudActor }));
      return picker(new ButtonPanel({ id: null, buttons: tiles }));
    }
  }

  built = { WildShapeButton, FormTile, StarryFormButton, ReturnButton, ItemButton, SplitButton: A.MAIN.BUTTONS.SplitButton };
  return built;
}

function itemButtonClass(panel) {
  if (DND5eItemButton) return DND5eItemButton;
  const base = CONFIG.ARGON?.MAIN?.BUTTONS?.ItemButton;
  const slot = base && panel._buttons.find(b => b instanceof base && b._isWeaponSet);
  if (slot) DND5eItemButton = slot.constructor;
  return DND5eItemButton;
}

/* ── composing the bars ──────────────────────────────────────────────────── */

function describe(button, { ItemButton, SplitButton }) {
  if (button?._isWeaponSet) return { kind: "weaponSet" };
  if (button instanceof ItemButton) return { kind: "item", id: button.item?.id ?? null };
  if (SplitButton && button instanceof SplitButton) return { kind: "split", ids: [button.button1?.item?.id, button.button2?.item?.id] };
  return { kind: "other" };
}

/** Replace the panel's buttons with `next`, in order, rendering only the new ones. */
function applyButtons(panel, next, fresh) {
  for (const old of panel._buttons) if (!next.includes(old)) old.element.remove();
  for (const b of next) {
    b._parent = panel;
    panel.element.appendChild(b.element);
  }
  panel._buttons = next;
  for (const b of fresh) b.render();
  panel.updateVisibility();
}

function composeBonusBar(panel, actor) {
  const C = argonClasses();
  const ItemBtn = itemButtonClass(panel);
  if (!C || !ItemBtn || !actor) return;
  const shifted = !!actor.isPolymorphed;
  const hasWildShape = !!wildShapeActivity(actor) && !!original(actor);
  const revertItems = actor.items.filter(isRevertItem);
  if (!hasWildShape && !revertItems.length) return;
  const ownWs = actor.items.find(i => activitiesOf(i).some(isWildShapeActivity));
  // Shifted, planBonusBar drops a carried Starry Form's button instead of replacing it (PT3-4).
  const starry = starryItem(actor);

  const plan = planBonusBar(panel._buttons.map(b => describe(b, C)), {
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
    if (p.highlight) b.element.classList.add("pentaryn-return");
    fresh.push(b);
    next.push(b);
    // While the Archer or the Chalice glimmers, its use sits right beside the form.
    const c = p.starry ? constellationOf(actor) : null;
    const act = c && c !== "dragon" ? constellationActivity(actor, c) : null;
    if (act) {
      const ab = new ItemBtn({ item: act, inActionPanel: true });
      ab.element.classList.add("pentaryn-starry-act");
      if (c === "chalice") {
        ab.element.classList.add("pentaryn-starry-chalice");
        ab.element.classList.toggle("pentaryn-chalice-ready", chaliceReady.has(actor.uuid));
      }
      fresh.push(ab);
      next.push(ab);
    }
  }
  applyButtons(panel, next, fresh);

  // The shift or revert this turn spent the Bonus Action on a HUD that no longer exists.
  if (bonusUsedNow(ui.ARGON?._token?.id)) {
    panel.isActionUsed = true;
    panel.updateActionUse();
  }
}

/**
 * U-4-1: the form's Multiattack item when pentaryn-combat's Full Attack already runs it (Full Attack
 * shown for this form, its Multiattack parsed from that item), so the text-only Multiattack button
 * beside Full Attack can go. null = keep it (module off, a setting off, an unparsed Multiattack).
 */
function multiattackCoveredByFullAttack(actor) {
  try {
    if (!game.modules.get("pentaryn-combat")?.active) return null;
    if (!game.settings.get("pentaryn-combat", "fullAttack") || !game.settings.get("pentaryn-combat", "multiattack")) return null;
    const ma = game.pentaryn?.combat?.multiattack?.(actor);
    if (!ma || ma.source === "flag" || (ma.total ?? 0) < 2 || !actor.items.get(ma.source)) return null;
    return ma.source;
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
  slot?.element.classList.add("pentaryn-hidden");
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
  const ItemBtn = itemButtonClass(panel) ?? DND5eItemButton;
  if (!C || !ItemBtn) return;
  const plan = planWithout(panel._buttons.map(b => describe(b, C)), [starry.id]);
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

Hooks.on("renderActionPanelArgonComponent", (panel, element, actor) => {
  try {
    const a = actor ?? panel.actor;
    if (panel?.label === "DND5E.BonusAction") composeBonusBar(panel, a);
    else if (panel?.label === "DND5E.Action") composeActionBar(panel, a);
    else if (panel?.label === "DND5E.Special") composeSpecialBar(panel, a);
  } catch (err) {
    log.error("HUD composition failed", err);
  }
  setTimeout(dropStaleTooltip, 0);
});

// In a beast form the Reaction bar's weapon slot is the Opportunity Attack, not a second Bite.
Hooks.on("renderItemButtonArgonComponent", (button) => {
  if (!button?._isWeaponSet || button.parent?.label !== "DND5E.Reaction") return;
  const actor = ui.ARGON?._actor;
  if (!actor?.isPolymorphed || !button.item) return;
  const title = button.element.querySelector(".feature-element-title, .action-element-title");
  if (title) title.textContent = T("PENTARYN_TRANSFORM.Hud.OpportunityAttack", { name: button.item.name });
});

/* ── the portrait: what Talo is, and for how long ────────────────────────── */
// dnd5e's portrait line for a character is "Level 12 Druid (<species>)"; a Wild Shape form drops
// the species, so it read "(null)". While a form or Starry Form is up, the line says that instead.

function portraitLine(actor) {
  if (!actor) return null;
  const ws = actor.isPolymorphed ? actor.effects.get(EFFECT_ID) : null;
  if (ws) {
    const endsAt = actor.getFlag(MODULE_ID, "wildshape")?.endsAt;
    const left = Number.isFinite(endsAt) ? formatDuration(endsAt - game.time.worldTime) : null;
    return left ? T("PENTARYN_TRANSFORM.Hud.PortraitLeft", { what: ws.name, left }) : ws.name;
  }
  const starry = activeStarry(actor);
  if (starry) {
    const left = starrySecondsLeft(actor);
    return left !== null ? T("PENTARYN_TRANSFORM.Hud.PortraitLeft", { what: starry.name, left: formatDuration(left) }) : starry.name;
  }
  return null;
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
  first.dataset.tooltip = T("PENTARYN_TRANSFORM.Hud.HPTemp", { value: hp.value, temp: hp.temp });
  first.classList.add("pentaryn-hp-temp");
}

function paintPortrait(element, actor) {
  try { paintHP(element, actor); } catch (err) { log.warn("portrait HP failed", err); }
  const detail = element?.querySelector?.(".player-detail");
  if (!detail) return;
  const line = portraitLine(actor);
  if (line) {
    if (detail.dataset.pentarynOriginal === undefined) detail.dataset.pentarynOriginal = detail.textContent.trim();
    detail.textContent = line;
    detail.classList.add("pentaryn-form-line");
  } else if (detail.classList.contains("pentaryn-form-line")) {
    detail.textContent = detail.dataset.pentarynOriginal ?? "";
    detail.classList.remove("pentaryn-form-line");
  }
}

Hooks.on("renderPortraitPanelArgonComponent", (panel, element, actor) => {
  try { paintPortrait(element, actor ?? panel.actor); } catch (err) { log.warn("portrait line failed", err); }
  setTimeout(dropStaleTooltip, 0);
});

Hooks.on("updateWorldTime", () => {
  const portrait = ui.ARGON?.components?.portrait;
  if (portrait?.element && ui.ARGON?._actor) paintPortrait(portrait.element, ui.ARGON._actor);
});

/* ── the Wild Shape / Starry Form effect on the portrait: bigger, live time left ── */

function onEffectRender(component) {
  const uuid = component?.effect?.uuid ?? "";
  const isWs = uuid.endsWith(`ActiveEffect.${EFFECT_ID}`);
  const isStarry = uuid.endsWith(`ActiveEffect.${STARRY_EFFECT_ID}`);
  if (!isWs && !isStarry) return;
  component.element.classList.add("pentaryn-effect");
  component.getTooltipData = async function () {
    const actor = ui.ARGON?._actor;
    let secs = null;
    if (isWs) {
      const endsAt = actor?.getFlag(MODULE_ID, "wildshape")?.endsAt;
      if (Number.isFinite(endsAt)) secs = endsAt - game.time.worldTime;
    } else secs = starrySecondsLeft(actor);
    const left = secs !== null ? `<p><strong>${T("PENTARYN_TRANSFORM.Hud.TimeLeft")}</strong> ${formatDuration(secs)}</p>` : "";
    return { title: this.label, description: left + (this.effect.tooltip ?? ""), classes: TT };
  };
}
Hooks.on("renderEffectArgonComponent", onEffectRender);

/* ── badge refresh: the Wild Shape item lives on the original, not the bound form ── */

function refreshLive(item) {
  for (const b of liveButtons) {
    if (!b.element.isConnected) { if (b.panel) liveButtons.delete(b); continue; }
    if (!item || b.wildShapeItem === item) b.refreshCount();
  }
}
Hooks.on("updateItem", (item) => {
  if (activitiesOf(item).some(isWildShapeActivity)) refreshLive(item);
});

// Starry Form on or off: the button's label, icon and constellation button change; rebuild the bar.
function onStarryChange(effect) {
  if (!effect?.getFlag?.(MODULE_ID, "starry")) return;
  if (effect.parent !== ui.ARGON?._actor) return;
  const bonus = ui.ARGON?.components?.main?.find(p => p.label === "DND5E.BonusAction");
  if (!bonus?.render) return;
  for (const b of bonus._buttons ?? []) if (liveButtons.has(b)) { b.panel?.element?.remove(); liveButtons.delete(b); }
  bonus.render();
  setTimeout(dropStaleTooltip, 50);
}
for (const h of ["createActiveEffect", "updateActiveEffect", "deleteActiveEffect"]) Hooks.on(h, onStarryChange);

/* ── Chalice: offered when it is earned (Area 4, D6) ─────────────────────── */
// "Whenever you cast a spell using a spell slot that restores Hit Points to a creature, you or
// another creature within 30 feet of you can regain Hit Points equal to 1d8 + WIS" (2024 PHB). The
// Chalice button sat beside Starry Form with nothing saying the second heal was there to take, so it
// was missed. After such a spell, the Chalice button pulses until it is used or a minute passes.
// The player still clicks it and rolls (own dice stay possible); nothing is rolled for them.

const chaliceReady = new Map();   // actor uuid → timer

function paintChalice(actor) {
  if (actor !== ui.ARGON?._actor) return;
  const on = chaliceReady.has(actor.uuid);
  for (const el of document.querySelectorAll(".extended-combat-hud .pentaryn-starry-chalice")) {
    el.classList.toggle("pentaryn-chalice-ready", on);
  }
}

function setChalice(actor, on) {
  clearTimeout(chaliceReady.get(actor.uuid));
  if (on) chaliceReady.set(actor.uuid, setTimeout(() => { chaliceReady.delete(actor.uuid); paintChalice(actor); }, 60_000));
  else chaliceReady.delete(actor.uuid);
  paintChalice(actor);
}

/** A leveled spell cast with a slot that has a healing activity part. */
function earnsChalice(activity, usageConfig) {
  const item = activity?.item;
  if (item?.type !== "spell" || !(Number(item.system?.level) > 0)) return false;
  if (usageConfig?.consume?.spellSlot === false) return false;
  if (activity.type === "heal") return true;
  const parts = activity.damage?.parts ?? [];
  return parts.some(p => (p.types instanceof Set ? [...p.types] : (p.types ?? [])).some(t => t === "healing" || t === "temphp"));
}

Hooks.on("dnd5e.postUseActivity", (activity, usageConfig) => {
  try {
    const actor = activity?.actor;
    if (!actor || constellationOf(actor) !== "chalice") return;
    if (activity.item?.id === starryItem(actor)?.id && activity.id === constellationActivity(actor, "chalice")?.id) {
      setChalice(actor, false);
      return;
    }
    if (earnsChalice(activity, usageConfig)) setChalice(actor, true);
  } catch (err) { log.warn("Chalice offer skipped", err); }
});

// Starry Form ended or changed constellation: no Chalice to take.
Hooks.on("deleteActiveEffect", (effect) => {
  if (effect?.getFlag?.(MODULE_ID, "starry") && effect.parent instanceof Actor) setChalice(effect.parent, false);
});