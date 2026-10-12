/**
 * A stand-in for Argon (enhancedcombathud + its dnd5e panels), as much as pentaryn-combat touches:
 * `CONFIG.ARGON.MAIN.BUTTONS.ItemButton`, `CONFIG.ARGON.MAIN.ActionPanel`,
 * `CONFIG.ARGON.PORTRAIT.PortraitPanel`, and `ui.ARGON` with `_actor`, `_token`, `_tooltip`,
 * `components.{main, weaponSets, movement}`, `bind`, `render`, `collapseAllPanels`, `_hudState`,
 * `_itemButtons`. Every effect lands on `F.calls` as `{ op: "argon.<what>", … }`.
 *
 * `ActionPanel#updateActionUse` reproduces Argon's settle bug when `panel._argonBug` is set: if the
 * pip container's child count differs from `maxActions`, it rebuilds the pips and marks the OLD list
 * (so the new pips stay unmarked); a second call then marks them.
 */

export function installArgon(F) {
  const log = (op, extra = {}) => F.calls.push({ op: `argon.${op}`, ...extra });

  class ItemButton {
    constructor({ item = null, inActionPanel = false } = {}) {
      this.item = item;
      this.inActionPanel = inActionPanel;
      this.element = document.createElement("div");
      this.element.className = "feature-element";
      this.rendered = 0;
    }
    get label() { return this.item?.name ?? ""; }
    get actor() { return globalThis.ui.ARGON?._actor ?? null; }
    get hasTooltip() { return false; }
    async render() {
      this.rendered += 1;
      await this._renderInner();
      if (this.hasTooltip) await this.activateTooltipListeners();
      F.Hooks.callAll("renderItemButtonArgonComponent", this, this.element, this.actor);
      return this;
    }
    async _renderInner() {}
    async activateTooltipListeners() { this._tooltipListeners = (this._tooltipListeners ?? 0) + 1; }
    async getTooltipData() { return null; }
    async _onLeftClick() { log("leftClick", { id: this.item?.id ?? null }); }
    async _onRightClick() {}
    /** Argon opens its target picker here, then calls `_onLeftClick` if the pick completed. */
    async _onPreLeftClick(event) {
      const A = globalThis.ui.ARGON;
      log("preLeftClick", { id: this.item?.id ?? null, targets: this.targets ?? null, ranges: this.ranges ?? null, event: event?.type ?? null });
      const pick = A.pickScript.shift();
      if (pick === undefined || pick === null) return;   // cancelled (right-click)
      for (const t of pick) globalThis.game.user.targets.add(t);
      await this._onLeftClick(event);
    }
  }

  /** Argon dnd5e's closure-private item button: the weapon-set slot is one of these. */
  class DND5eItemButton extends ItemButton {
    constructor(opts = {}) {
      super(opts);
      this._isWeaponSet = !!opts.isWeaponSet;
      this.hookId = opts.hookId;
    }
    static consumeActionEconomy(activity) { log("consumeActionEconomy", { activity: activity?.uuid ?? null }); }
    async _onSetChange(data) { log("onSetChange", { id: this.item?.id ?? null, data }); }
    get activity() { return this._activity ?? null; }
  }

  class ActionPanel {
    constructor({ label, buttons = [], max = 1 } = {}) {
      this.label = label;
      this._buttons = buttons;
      this._max = max;
      this.isActionUsed = false;
      this.element = document.createElement("div");
      this.element.className = "actions-container";
      this.uses = document.createElement("div");
      this.uses.className = "actions-uses-container";
      this.element.append(this.uses);
      this.updates = 0;
      this.visibility = 0;
      this.renders = 0;
    }
    get actor() { return globalThis.ui.ARGON?._actor ?? null; }
    get maxActions() { return this._max; }
    get currentActions() { return this.isActionUsed ? 0 : this.maxActions; }
    updateVisibility() { this.visibility += 1; }
    updateActionUse() {
      this.updates += 1;
      const max = this.maxActions;
      if (this._argonBug && this.uses.children.length !== max) {
        const old = this.uses.children;
        this.uses.textContent = "";
        for (let i = 0; i < max; i++) {
          const pip = document.createElement("div");
          pip.className = "action-pip";
          this.uses.append(pip);
        }
        this._marked = old.map(p => p.classList.contains("used"));
        return "rebuilt";
      }
      const used = max - this.currentActions;
      this.uses.children.forEach((p, i) => p.classList.toggle("used", i < used));
      return "marked";
    }
    async render() {
      this.renders += 1;
      log("panel.render", { label: this.label });
      F.Hooks.callAll("renderActionPanelArgonComponent", this, this.element, this.actor);
      return this;
    }
  }

  class PortraitPanel {
    constructor(actor, effects = []) { this._actor = actor; this._effects = effects; }
    get actor() { return this._actor; }
    async getEffects() { return [...this._effects]; }
  }

  /** A drawer button (Use Feature, Cast Spell …): its panel toggles open. */
  class ButtonPanel {
    constructor() {
      this.element = document.createElement("div");
      this.element.className = "features-container";
      this.toggles = 0;
    }
    toggle(open) {
      this.toggles += 1;
      this.element.classList.toggle("show", open ?? !this.element.classList.contains("show"));
      return "toggled";
    }
  }

  const ARGON = {
    _actor: null,
    _token: null,
    _tooltip: null,
    enabled: true,
    pickScript: [],
    _hudState: new Map(),
    _itemButtons: new Set(),
    components: { main: [], weaponSets: null, movement: null },
    bind(token) { log("bind", { token: token?.id ?? null }); this._token = token; this._actor = token?.actor ?? null; },
    render() { log("render"); },
    collapseAllPanels() { log("collapseAllPanels"); },
  };

  globalThis.ui.ARGON = ARGON;
  globalThis.CONFIG.ARGON = {
    MAIN: { BUTTONS: { ItemButton }, ActionPanel },
    PORTRAIT: { PortraitPanel },
  };
  return { ARGON, ItemButton, DND5eItemButton, ActionPanel, PortraitPanel, ButtonPanel };
}

/** A tooltip Argon shows for a trigger element. */
export function argonTooltip(F, trigger, { locked = false } = {}) {
  const el = document.createElement("div");
  el.className = "ech-tooltip";
  document.body.append(el);
  return {
    _triggerElement: trigger,
    _locked: locked,
    element: el,
    _tooltipData: null,
    async render() { F.calls.push({ op: "argon.tooltip.render", data: F.plain(this._tooltipData) }); },
    _destroy(force) { F.calls.push({ op: "argon.tooltip.destroy", force: !!force }); el.remove(); },
  };
}
