/**
 * Argon, as hud.mjs uses it (enhancedcombathud 14 + its dnd5e panels). Stand-ins only: every
 * component owns an `element`; `render()` runs `_renderInner()` then `activateListeners()`;
 * ButtonPanelButton's render appends a fresh `_getPanel()`; ButtonPanel#toggle flips `show`.
 * Argon's dnd5e item button class is closure-private live; `DND5eItemButton` stands for it and is
 * only reachable through a weapon-set slot, as in the real bundle.
 */

export function installArgon(F, D) {
  const rendered = [];
  class ArgonComponent {
    constructor() { this.element = D.document.createElement("div"); }
    async render() {
      this.rendered = (this.rendered ?? 0) + 1;
      rendered.push(this);
      await this._renderInner();
      await this.activateListeners(this.element);
    }
    async _renderInner() {}
    async activateListeners() {}
    get hasTooltip() { return false; }
    get parent() { return this._parent ?? null; }
  }
  class ItemButton extends ArgonComponent {
    constructor({ item, isWeaponSet = false, inActionPanel } = {}) {
      super();
      this._item = item;
      this._isWeaponSet = isWeaponSet;
      this._inActionPanel = inActionPanel ?? isWeaponSet;
    }
    get item() { return this._item; }
    get label() { return this.item?.name; }
    get icon() { return this.item?.img; }
  }
  class ButtonPanelButton extends ArgonComponent {
    async _renderInner() {
      this.panel = await this._getPanel();
      this.element.appendChild(this.panel.element);
    }
    async _getPanel() { return null; }
  }
  class SplitButton extends ArgonComponent {
    constructor(button1, button2) {
      super();
      this.button1 = button1;
      this.button2 = button2;
    }
  }
  class ButtonPanel extends ArgonComponent {
    constructor({ id = null, buttons = [] } = {}) {
      super();
      this.id = id;
      this._buttons = buttons;
      this.element.classList.add("features-container");
    }
    toggle(force) { this.element.classList.toggle("show", force); }
  }
  class DND5eItemButton extends ItemButton {}

  F.CONFIG.ARGON = { MAIN: { BUTTONS: { ButtonPanelButton, ItemButton, SplitButton }, BUTTON_PANELS: { ButtonPanel } } };
  const collapsed = [];
  globalThis.ui.ARGON = {
    collapseAllPanels() { collapsed.push(1); },
    _token: null,
    _actor: null,
    _tooltip: null,
    components: { main: [], portrait: null }
  };

  /** An Action-panel stand-in with Argon's fields: label, _buttons, element, isActionUsed. */
  function panel(label, buttons, { attach = true } = {}) {
    const p = {
      label, _buttons: buttons, element: D.document.createElement("div"), isActionUsed: false,
      visibility: 0, actionUse: 0, renders: 0,
      updateVisibility() { this.visibility += 1; },
      updateActionUse() { this.actionUse += 1; },
      async render() { this.renders += 1; }
    };
    p.element.classList.add("action-panel");
    for (const b of buttons) { b._parent = p; p.element.appendChild(b.element); }
    if (attach) {
      const hud = D.document.querySelector(".extended-combat-hud") ?? D.el("div", "extended-combat-hud");
      hud.appendChild(p.element);
    }
    return p;
  }

  return { ArgonComponent, ItemButton, ButtonPanelButton, SplitButton, ButtonPanel, DND5eItemButton, panel, rendered, collapsed };
}
