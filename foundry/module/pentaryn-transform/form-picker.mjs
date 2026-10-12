/**
 * Pentaryn Transform — UI: the Argon components the HUD adds (Wild Shape / Change Form and its
 * form picker, Return to <druid>, Starry Form and its constellations) and their tooltips.
 *
 * Argon exposes no "add a button to this panel" API; hud.mjs recomposes the bars and builds these.
 * Argon's dnd5e button class is closure-private (argon.mjs borrows it from a weapon-set slot).
 * Template rule: an Argon component renders partials/{ParentClassName}.hbs, so each class here
 * subclasses an Argon base directly (never two deep).
 */

import {
  MODULE, usesLeft, durationSeconds, formatDuration, formSummary, returnLabel, CONSTELLATIONS, STARRY_SECONDS,
  summaryFromSource, recoveryLines
} from "./transform-core.mjs";
import { shift, forms, wildShapeActivity, original, returnToNormal } from "./wildshape-adapter.mjs";
import {
  starryItem, wildShapeItemOf, hasTwinkling, constellationOf, starrySecondsLeft, constellationLabel, constellationImg,
  constellationText, assumeStarry, endStarry
} from "./starry-adapter.mjs";
import { dropTooltip, dropStaleTooltip, cancelTargetPicker } from "./argon.mjs";
import { paintBadge as paintArgonBadge } from "./lib/argon-kit.mjs";

let built = null;                // { WildShapeButton, FormTile, … }, built on first use

/** Wild Shape / Starry Form buttons, for badge refreshes (hud.mjs prunes and refreshes them). */
export const liveButtons = new Set();

/** Tooltip classes: compact grid (pentaryn-tt), or one detail per row (pentaryn-tt-list). */
export const TT = ["pentaryn-tt"];
const TT_LIST = ["pentaryn-tt", "pentaryn-tt-list"];

/** The uses badge, as ItemButton's `.quantity-1` markup (Argon's has-count class draws nothing). */
export function paintBadge(button, left) {
  paintArgonBadge(button, left, "ptf-empty");
}

/* ── normalising a beast for its tile tooltip ────────────────────────────── */

function recoveryText(item) {
  return recoveryLines(item.system.uses?.recovery, CONFIG.DND5E.limitedUsePeriods ?? {}, _loc("PENTARYN_TRANSFORM.Hud.All"));
}

/* ── components ──────────────────────────────────────────────────────────── */

/**
 * Argon slides a panel in from translateY(1000%) over 0.3 s; a click on a tile during the slide
 * lands on the map instead (the "first tile click did nothing" report). Our pickers appear in place
 * and only fade (styles/transform.css), so a tile is clickable the moment it is visible.
 */
function picker(panel) {
  panel.element.classList.add("ptf-picker");
  return panel;
}

export function argonClasses() {
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
      const current = hudActor?.getFlag?.(MODULE, "wildshape")?.profile;
      if (hudActor?.isPolymorphed && current === form.id) this.element.classList.add("ptf-current");
    }

    get hasTooltip() { return true; }

    async getTooltipData() {
      const src = this.form.actor ?? fromUuidSync(this.form.uuid);
      if (!src) return { title: this.form.name, description: "" };
      const f = formSummary(summaryFromSource(src, CONFIG.DND5E));
      return {
        title: this.form.name,
        subtitle: f.subtitle,
        description: "",
        details: f.details,
        propertiesLabel: "PENTARYN_TRANSFORM.Hud.Traits",
        properties: f.traits.map(label => ({ label, secondary: true })),
        footerText: _loc("PENTARYN_TRANSFORM.Hud.TileHint"),
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
      return { title: this.label, subtitle: _loc("PENTARYN_TRANSFORM.Hud.BonusAction"), description: "", classes: TT };
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
        title: _loc(this.label),
        subtitle: _loc("PENTARYN_TRANSFORM.Hud.FormsKnown", { n: this.activity?.availableProfiles?.length ?? 0 }),
        description: `<p>${_loc(this.shifted ? "PENTARYN_TRANSFORM.Hud.ChangeFormText" : "PENTARYN_TRANSFORM.Hud.WildShapeText", { temp: temp ?? "—" })}</p>`,
        details: [
          { label: _loc("PENTARYN_TRANSFORM.Hud.Uses"), value: `${usesLeft(uses) ?? "—"} / ${uses?.max ?? "—"}` },
          { label: _loc("PENTARYN_TRANSFORM.Hud.Duration"), value: seconds ? formatDuration(seconds) : "—" },
          { label: _loc("PENTARYN_TRANSFORM.Hud.Recovery"), value: recoveryText(item) || "—" },
          { label: _loc("PENTARYN_TRANSFORM.Hud.Cost"), value: _loc("PENTARYN_TRANSFORM.Hud.BonusAction") }
        ],
        footerText: _loc("PENTARYN_TRANSFORM.Hud.WildShapeHint"),
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
        ui.notifications.warn(_loc("PENTARYN_TRANSFORM.NoUses"));
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
          name: end ? _loc("PENTARYN_TRANSFORM.Starry.EndShort") : constellationLabel(constellation),
          img: end ? "icons/svg/cancel.svg" : constellationImg(hudActor, constellation)
        },
        inActionPanel: false
      });
      this.constellation = constellation;
      this.hudActor = hudActor;
      if (!end && constellationOf(hudActor) === constellation) this.element.classList.add("ptf-current");
    }

    get hasTooltip() { return true; }

    async getTooltipData() {
      const actor = this.hudActor;
      if (this.constellation === "end") {
        return { title: _loc("PENTARYN_TRANSFORM.Starry.End"), description: `<p>${_loc("PENTARYN_TRANSFORM.Starry.EndText")}</p>`, classes: TT };
      }
      const current = constellationOf(actor);
      const free = !!current && hasTwinkling(actor);
      const cost = current === this.constellation ? _loc("PENTARYN_TRANSFORM.Starry.CostCurrent")
        : free ? _loc("PENTARYN_TRANSFORM.Starry.CostFree") : _loc("PENTARYN_TRANSFORM.Starry.CostUse");
      return {
        title: constellationLabel(this.constellation),
        subtitle: _loc("PENTARYN_TRANSFORM.Starry.Title"),
        description: `<p>${constellationText(actor, this.constellation)}</p>`,
        details: [{ label: _loc("PENTARYN_TRANSFORM.Hud.Cost"), value: cost }],
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
      return c ? `${_loc("PENTARYN_TRANSFORM.Starry.Title")}: ${constellationLabel(c)}` : _loc("PENTARYN_TRANSFORM.Starry.Title");
    }
    get icon() { return this.constellation ? constellationImg(this.hudActor, this.constellation) : (this.item?.img ?? ""); }
    get colorScheme() { return 1; }
    get hasTooltip() { return true; }

    async getTooltipData() {
      const uses = this.wildShapeItem?.system.uses;
      const c = this.constellation;
      const left = starrySecondsLeft(this.hudActor);
      const details = [
        { label: _loc("PENTARYN_TRANSFORM.Hud.Uses"), value: `${usesLeft(uses) ?? "—"} / ${uses?.max ?? "—"}` },
        { label: c ? _loc("PENTARYN_TRANSFORM.Hud.TimeLeftLabel") : _loc("PENTARYN_TRANSFORM.Hud.Duration"),
          value: formatDuration(c && left !== null ? left : STARRY_SECONDS) },
        { label: _loc("PENTARYN_TRANSFORM.Starry.Light"), value: _loc("PENTARYN_TRANSFORM.Starry.LightValue") },
        { label: _loc("PENTARYN_TRANSFORM.Hud.Cost"), value: _loc("PENTARYN_TRANSFORM.Hud.BonusAction") }
      ];
      return {
        title: this.label,
        subtitle: c ? _loc("PENTARYN_TRANSFORM.Starry.Active") : _loc("PENTARYN_TRANSFORM.Starry.Spends"),
        description: `<p>${c ? constellationText(this.hudActor, c) : _loc("PENTARYN_TRANSFORM.Starry.Text")}</p>`,
        details,
        footerText: _loc(c ? (hasTwinkling(this.hudActor) ? "PENTARYN_TRANSFORM.Starry.HintActiveFree" : "PENTARYN_TRANSFORM.Starry.HintActive")
          : "PENTARYN_TRANSFORM.Starry.Hint"),
        classes: TT
      };
    }

    refreshCount() {
      paintBadge(this, usesLeft(this.wildShapeItem?.system.uses));
      this.element.classList.toggle("ptf-starry-on", !!this.constellation);
      // Spent out but the form is up: still clickable (change constellation / end).
      if (this.constellation) this.element.classList.remove("ptf-empty");
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
        ui.notifications.warn(_loc("PENTARYN_TRANSFORM.NoUses"));
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
