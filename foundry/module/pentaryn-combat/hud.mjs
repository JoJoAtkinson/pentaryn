// Pentaryn Combat — the Argon Combat HUD.
//
// Same idiom as pentaryn-transform/hud.mjs: Argon has no "add a button" API, but every panel fires
// render{ParentClass}ArgonComponent after rendering, its button list is a plain array and its
// buttons are plain elements. So the bars are recomposed in that hook. No lib-wrapper, and nothing
// in Argon's files is edited. Each class subclasses an Argon base directly (Argon renders
// partials/{ParentClassName}.hbs, so a class two deep would look for a template that isn't there).
//
//   Action bar   Full Attack (first, only when the actor gets 2+ swings); the Action pips count swings
//   Bonus bar    Off-hand / Flurry / Martial Arts / Hew follow-ups; Pole Strike gated until earned
//   Special bar  Nick (free), "Sneak Attack: ask/auto" toggle, "Reckless Attack: on/off", "New turn" out of combat

import * as core from "./combat-core.mjs";
import { MODULE } from "./combat-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { setting, riderMode, setRiderMode, argonSetting, setArgonSetting, hasArgonSetting } from "./settings.mjs";
import {
  weaponsOf, featuresOf, countFor, multiattackOf, usesMultiattack, combatContext, turnOf, newTurn, attackActivityOf,
  unarmedStrike, focusLeft, turnSettled, setPrimaryId, chosenWeapon, featureItem
} from "./shapes.mjs";
import { runSwings, runFollowUp, fullAttackPlan, running, abortFor, registerTargetPicker } from "./sequence.mjs";
import { pickWeapon } from "./strip.mjs";
import { riderDiceFor, isReckless, setReckless } from "./turn-riders.mjs";
import { placeOpenDrawers } from "./turnflow/drawers.mjs";
import { installFeature, reg } from "./context.mjs";
// Turn flow (special actions, Opportunity Attack, Esc, death saves, portrait, follow …): features
// installed here, first, in the order turnflow.mjs registered them before the split. Loaded through
// this entry, not listed in module.json, so a world relaunch was not needed to load them.
import * as actionButtons from "./turnflow/action-buttons.mjs";
import * as boundaries from "./turnflow/boundaries.mjs";
import * as helperToken from "./turnflow/helper-token.mjs";
import * as dialogs from "./turnflow/dialogs.mjs";
import * as death from "./turnflow/death.mjs";
import * as portrait from "./turnflow/portrait.mjs";
import * as patches from "./patches.mjs";
import * as manualDice from "./turnflow/manual-dice.mjs";
import * as effects from "./turnflow/effects.mjs";
import * as drawers from "./turnflow/drawers.mjs";
import * as movement from "./turnflow/movement.mjs";

const log = makeLog(MODULE);

for (const feature of [actionButtons, boundaries, helperToken, dialogs, death, portrait, patches, manualDice, effects, drawers]) installFeature(feature);
patches.installReady(reg, null);
installFeature(movement);

const FALLBACK_IMG = "icons/skills/melee/blade-tips-triple-steel.webp";

let DND5eItemButton = null;      // Argon dnd5e's closure-private button class, borrowed from the weapon-set slot
let built = null;
const liveButtons = new Set();

/* ── small helpers (copied from pentaryn-transform/hud.mjs on purpose: no cross-module import) ── */

function dropTooltip() {
  try {
    game.tooltip?.deactivate?.();
    if (ui.ARGON?._tooltip) ui.ARGON._tooltip = null;
  } catch (err) { log.debug("drop tooltip", err); }   // never let tooltip hygiene break a click
}

/** Argon's hover tooltip, when it belongs to this button. */
function ownTooltip(button) {
  const t = ui.ARGON?._tooltip;
  return t && t._triggerElement === button?.element ? t : null;
}

/**
 * Area 2 (A0/A4): a tooltip open while the turn flag changed (a swing by hand, a swing of the
 * sequence) kept its old numbers ("2 of 2" after a hand swing) until the next hover. Re-render it
 * in place with fresh data.
 */
function refreshOwnTooltip(button) {
  const t = ownTooltip(button);
  if (!t || !setting("fullAttack")) return;
  Promise.resolve(button.getTooltipData()).then(data => {
    if (!data || ui.ARGON?._tooltip !== t) return;
    t._tooltipData = data;
    return t.render();
  }).catch(err => { log.debug("tooltip refresh", err); return null; });
}

/**
 * Argon commented out its own mouseleave (core's TooltipManager closes an un-annotated trigger's
 * tooltip only once the pointer enters another element), so ours closed late or not at all and
 * lingered over the roll window. Our buttons close their own tooltip on leave.
 */
function bindTooltipLeave(button) {
  const el = button?.element;
  if (!el || el._pcLeave) return;
  el._pcLeave = true;
  el.addEventListener("mouseleave", () => { if (ownTooltip(button)) dropTooltip(); });
}

/**
 * Area 10: Argon's own buttons (Action Surge, a weapon slot) never close their hover tooltip (Argon
 * commented its mouseleave out), so it stayed on screen after a click, a bar re-render or a turn
 * change. Any Argon tooltip closes once the pointer is over something that is neither its button nor
 * the tooltip itself, or once its button has left the page. A locked (pinned) tooltip stays.
 * Pure bug fix, no setting.
 */
function dropStrayTooltip(target = null) {
  try {
    const t = ui.ARGON?._tooltip;
    if (!t || t._locked) return;
    const trigger = t._triggerElement;
    const gone = !trigger?.isConnected;
    const away = target instanceof Node && !trigger?.contains?.(target) && !game.tooltip?.tooltip?.contains?.(target)
      && !t.element?.contains?.(target);
    if (!gone && !away) return;
    t._destroy?.(true);
    if (ui.ARGON._tooltip === t) ui.ARGON._tooltip = null;
    if (game.tooltip?.element === trigger || gone) game.tooltip?.deactivate?.();
  } catch (err) { log.debug("stray tooltip", err); }   // never let tooltip hygiene break anything
}
document.addEventListener("pointerover", (ev) => { if (ui.ARGON?._tooltip) dropStrayTooltip(ev.target); }, { capture: true, passive: true });

// A roll window (or the manual-dice Roll Resolution window) opening drops any Argon hover tooltip:
// it sat on top of the window it opened. Usability Area 3: also every dnd5e dialog (Rage's and
// Divine Smite's usage dialog) and the activity chooser (Lay on Hands: Heal / Remove Poison) — the
// Rage / Flurry / Monk's Focus tooltip covered their confirm button.
for (const hook of ["renderRollConfigurationDialog", "renderRollResolver", "renderDialog5e", "renderActivityChoiceDialog", "renderDialogV2"]) {
  Hooks.on(hook, () => { if (ui.ARGON?._tooltip && setting("fullAttack")) dropTooltip(); });
}

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
  button.element.classList.toggle("pentaryn-combat-empty", left === 0);
}

function applyButtons(panel, next, fresh) {
  for (const old of panel._buttons) if (!next.includes(old)) old.element.remove();
  for (const b of next) {
    b._parent = panel;
    panel.element.appendChild(b.element);
  }
  panel._buttons = next;
  for (const b of fresh) b.render();
  // Argon never attaches a panel that had no buttons when the HUD was built (a Rogue or Barbarian has no
  // Special-activation item), so our Sneak Attack / Reckless toggles sat in a detached panel (usability re-run, U-3-7).
  if (next.length && !panel.element.isConnected) {
    const main = ui.ARGON?.components?.main ?? [];
    const after = main.slice(main.indexOf(panel) + 1).find(p => p?.element?.isConnected);
    const before = after?.element ?? main.findLast?.(p => p?.element?.isConnected)?.element?.nextSibling ?? null;
    const host = after?.element.parentElement ?? main.find(p => p?.element?.isConnected)?.element.parentElement;
    if (host) host.insertBefore(panel.element, before);
  }
  panel.updateVisibility();
  // A button added in front (Pole Strike, Off-hand) moves the others: an open drawer follows its own.
  placeOpenDrawers(panel);
}

function itemButtonClass(panel) {
  if (DND5eItemButton) return DND5eItemButton;
  const base = CONFIG.ARGON?.MAIN?.BUTTONS?.ItemButton;
  const slot = base && panel._buttons.find(b => b instanceof base && b._isWeaponSet);
  if (slot) DND5eItemButton = slot.constructor;
  return DND5eItemButton;
}

function mainPanel(label) {
  return ui.ARGON?.components?.main?.find?.(p => p.label === label) ?? null;
}

const TT = ["pentaryn-tt", "pentaryn-combat-tt"];   // shared tooltip layout + combat's own (subtitle wrap, PT1-6)

/* ── which weapon, how many swings ───────────────────────────────────────── */

function multiattack(actor) {
  return usesMultiattack(actor) && setting("multiattack") ? multiattackOf(actor) : null;
}

/** Everything the Full Attack button and the pips read, in one place. */
function fullAttackState(actor) {
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const ma = multiattack(actor);
  const pick = ma ? { "*": actor.getFlag(MODULE, "last")?.weapon ?? null } : null;
  const weaponId = ma ? null : chosenWeapon(actor);
  const count = ma ? ma.total : countFor(actor, weaponId);
  const plan = fullAttackPlan(actor, { weaponId, turn, inCombat: ctx.inCombat, multiattack: ma, count, pick });
  const weapons = weaponsOf(actor);
  const nick = !ma && weaponId ? core.extraSwings({ main: weapons.find(w => w.id === weaponId), weapons, turn,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") }).length : 0;
  // The pips count the Attack action's swings with any weapon: a Loading crossbow alone gives 1, but
  // a Fighter 5 holding one still has a second swing to make with something else.
  const pipCount = ma ? ma.total : Math.max(count, countFor(actor, null));
  // Shown whenever the Attack action has 2+ swings with some weapon, so right-click can still switch
  // away from a remembered Loading crossbow (1 swing).
  return { ctx, turn, ma, weaponId, count, pipCount, plan, worth: pipCount >= 2 || nick > 0 };
}

function weaponTile(actor, w, swings) {
  const act = attackActivityOf(actor.items.get(w.id));
  const dmg = act?.labels?.damage ?? act?.labels?.damages ?? [];
  return {
    id: w.id, name: w.name, img: w.img || FALLBACK_IMG,
    toHit: act?.labels?.toHit ?? "",
    damage: (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + "),
    swings
  };
}

async function chooseWeapon(actor) {
  const ma = multiattack(actor);
  let tiles;
  if (ma) {
    const g = ma.groups.find(x => x.choices.length > 1) ?? ma.groups[0];
    tiles = g.choices.map(id => actor.items.get(id)).filter(Boolean).map(i => weaponTile(actor, { id: i.id, name: i.name, img: i.img }, g.count));
  } else {
    tiles = weaponsOf(actor).filter(core.canSwing).map(w => weaponTile(actor, w, countFor(actor, w.id)));
  }
  if (tiles.length < 2) return tiles[0]?.id ?? null;
  const id = await pickWeapon(tiles, { title: _loc("PENTARYN_COMBAT.Picker.Title") });
  if (id) await actor.setFlag(MODULE, "last.weapon", id);
  return id;
}

/* ── Argon's target picker, reused through a hidden button ───────────────── */

function argonPickerOn() {
  return !!argonSetting("rangepicker", () => false);
}

/** Release this user's targets (the sequence restores them if the pick is then cancelled). */
function releaseTargets() {
  if (!game.user.targets.size) return;
  if (canvas.tokens?.setTargets) canvas.tokens.setTargets([], { mode: "replace" });
  else for (const t of [...game.user.targets]) t.setTarget(false, { releaseOthers: false });
}

registerTargetPicker(async (activity) => {
  const C = argonClasses();
  if (!C || !argonPickerOn() || !ui.ARGON?._token) return undefined;
  // "New target" means a new one. With Argon's rangepickerclear off (U-R-1: a pre-set target is
  // kept for weapons clicked by hand) its picker would see the old target, call 1/1 done and end at
  // once, so the swing would go to the old target. Clear first, whatever that setting says.
  releaseTargets();
  const probe = new C.PickerProbe({ activity });
  let picked = false;
  probe._onLeftClick = async () => { picked = true; };
  await probe._onPreLeftClick(new MouseEvent("mouseup", { button: 0 }));
  return picked && game.user.targets.size > 0;
});

/* ── Argon's Target Picker Tutorial (U-R-2, setting skipPickerGuide) ─────── */
// Argon shows a one-time "Target Picker Tutorial" dialog (Confirm to continue) the first time a
// browser opens its picker, usually mid-combat. Its flag is a client setting, so every client marks
// it seen on ready. The tutorial's one tip a player needs at the moment of picking, right-click
// cancels, goes on Argon's own cursor label instead (CSS ::after, styles/combat.css).

function applyPickerGuide() {
  const on = !!setting("skipPickerGuide");
  try {
    document.body.classList.toggle("pentaryn-combat-picker-cue", on);
    if (on) document.body.style.setProperty("--pentaryn-combat-picker-cue", JSON.stringify(_loc("PENTARYN_COMBAT.Hud.PickerCue")));
  } catch (err) { log.debug("picker cue (no body yet)", err); }
  if (!on || !hasArgonSetting("targetPickerGuideShown")) return;
  try {
    if (!argonSetting("targetPickerGuideShown")) setArgonSetting("targetPickerGuideShown", true);
  } catch (err) { log.warn("marking Argon's picker tutorial seen failed", err); }
}

Hooks.once("ready", applyPickerGuide);

/**
 * Area 2 (A2): Argon's "0/1 Targets" label is created empty at the page's top-left and only moves
 * (and gets its text) on the first mousemove, so a player who had not moved yet saw the cue pinned
 * in the corner. Place it at the pointer (where the HUD button was clicked) with a starting text.
 */
let pointer = null;
document.addEventListener("pointermove", (ev) => { pointer = { x: ev.clientX, y: ev.clientY }; }, { capture: true, passive: true });
document.addEventListener("pointerdown", (ev) => { pointer = { x: ev.clientX, y: ev.clientY }; }, { capture: true, passive: true });
Hooks.once("ready", () => new MutationObserver((records) => {
  if (!document.body.classList.contains("pentaryn-combat-picker-cue")) return;
  for (const r of records) for (const n of r.addedNodes) {
    if (!(n instanceof HTMLElement) || !n.classList.contains("ech-target-picker")) continue;
    if (pointer && !n.style.left) { n.style.left = `${pointer.x + 20}px`; n.style.top = `${pointer.y}px`; }
    if (!n.textContent) n.textContent = _loc("PENTARYN_COMBAT.Hud.PickerStart");
  }
}).observe(document.body, { childList: true }));
// The first change from the default creates the Setting document; later ones update it.
for (const hook of ["createSetting", "updateSetting"]) {
  Hooks.on(hook, (s) => { if (s?.key === `${MODULE}.skipPickerGuide`) applyPickerGuide(); });
}

/* ── components ──────────────────────────────────────────────────────────── */

function argonClasses() {
  if (built) return built;
  const A = CONFIG.ARGON;
  const ItemButton = A?.MAIN?.BUTTONS?.ItemButton;
  if (!ItemButton) return null;

  /** Full Attack: every swing the Attack action gives, one dialog each. */
  class FullAttackButton extends ItemButton {
    constructor({ hudActor }) {
      const st = fullAttackState(hudActor);
      const first = hudActor.items.get(st.plan.weaponId ?? st.weaponId);
      super({ item: { id: "pentaryn-combat-full-attack", name: _loc("PENTARYN_COMBAT.FullAttack"), img: first?.img || FALLBACK_IMG }, inActionPanel: true });
      this.hudActor = hudActor;
      this.element.classList.add("pentaryn-combat-full");
      liveButtons.add(this);
    }

    get state() { return fullAttackState(this.hudActor); }
    get activity() {
      const st = this.state;
      return attackActivityOf(this.hudActor.items.get(st.plan.swings[0]?.weaponId ?? st.weaponId));
    }
    // Argon opens its target picker before _onLeftClick only when this is > 0: once, and never
    // when something is already targeted (its picker would clear the target first).
    get targets() { return game.user.targets.size || running() ? 0 : 1; }
    get ranges() {
      const a = this.activity;
      const reach = a?.item?.system?.range?.reach;
      return { normal: a?.range?.value ?? reach ?? canvas?.scene?.grid?.distance ?? 5, long: a?.range?.long ?? null };
    }
    get hasTooltip() { return true; }

    async getTooltipData() {
      const st = this.state;
      const first = this.hudActor.items.get(st.plan.swings[0]?.weaponId ?? st.weaponId);
      const act = attackActivityOf(first);
      const names = st.plan.swings.map(s => this.hudActor.items.get(s.weaponId)?.name).filter(Boolean);
      // Main swings of the Attack action ("2 of 2"), the Nick swing named on its own ("+ Nick: Dagger").
      const sum = core.planSummary(st.plan.swings, st.ma ? st.plan.count : st.count);
      const nick = sum.extras.find(x => x.kind === "nick");
      const nickName = nick ? this.hudActor.items.get(nick.weaponId)?.name ?? "" : "";
      const mainName = this.hudActor.items.get(sum.mainIds[0] ?? st.weaponId)?.name ?? first?.name ?? "—";
      const what = st.ma ? names.join(", ")
        : nick ? _loc("PENTARYN_COMBAT.Hud.WithNick", { weapon: mainName, nick: nickName })
        : _loc("PENTARYN_COMBAT.Hud.WithWeapon", { weapon: mainName });
      const left = _loc("PENTARYN_COMBAT.Hud.SwingsLeft", { left: sum.left, total: sum.total });
      return {
        title: _loc("PENTARYN_COMBAT.FullAttack"),
        subtitle: nick ? _loc("PENTARYN_COMBAT.Hud.PlusNick", { left, weapon: nickName }) : left,
        description: `<p>${_loc("PENTARYN_COMBAT.Hud.FullAttackText", { what })}</p>`,
        details: [
          { label: _loc("PENTARYN_COMBAT.Hud.ToHit"), value: act?.labels?.toHit ?? "—" },
          { label: _loc("PENTARYN_COMBAT.Hud.Swings"), value: String(st.plan.swings.length) }
        ],
        footerText: _loc("PENTARYN_COMBAT.Hud.FullAttackHint"),
        classes: TT
      };
    }

    refresh() {
      const st = this.state;
      paintBadge(this, st.ctx.inCombat ? st.plan.swings.length : st.count);
      refreshOwnTooltip(this);
    }

    async activateTooltipListeners() {
      await super.activateTooltipListeners();
      bindTooltipLeave(this);
    }

    async _renderInner() {
      await super._renderInner();
      this.refresh();
    }

    async _onLeftClick(event) {
      dropTooltip();
      const actor = this.hudActor;
      // Nothing remembered and no weapon set: ask once which weapon (the choice is remembered).
      if (!actor.getFlag(MODULE, "last")?.weapon && !setPrimaryId(actor) && !multiattack(actor)) {
        const candidates = weaponsOf(actor).filter(core.canSwing);
        if (candidates.length > 1 && !(await chooseWeapon(actor))) return;
      }
      const st = this.state;
      if (!st.plan.swings.length) {
        ui.notifications.warn(_loc("PENTARYN_COMBAT.Hud.NoSwingsLeft"));
        return;
      }
      await runSwings(actor, st.plan.swings, { event });
      this.refresh();
    }

    async _onRightClick() {
      dropTooltip();
      const id = await chooseWeapon(this.hudActor);
      if (id) rerender(["DND5E.Action"]);        // the button's icon is the chosen weapon's
    }
  }

  /** One follow-up (Off-hand, Nick, Flurry, Martial Arts, Hew). */
  class FollowUpButton extends ItemButton {
    constructor({ hudActor, followUp }) {
      const w = hudActor.items.get(followUp.weaponId);
      const label = _loc(core.keyFor("FollowUp", followUp.kind), { weapon: w?.name ?? "" });
      super({ item: { id: `pentaryn-combat-${followUp.kind}`, name: label, img: w?.img || FALLBACK_IMG }, inActionPanel: true });
      this.hudActor = hudActor;
      this.followUp = followUp;
      this.element.classList.add("pentaryn-combat-followup");
      if (followUp.disabled) this.element.classList.add("pentaryn-combat-disabled");
    }

    get hasTooltip() { return true; }
    async activateTooltipListeners() { await super.activateTooltipListeners(); bindTooltipLeave(this); }
    // A greyed button (Flurry with no Focus) warns at once: no target picker first.
    get targets() { return this.followUp.disabled || game.user.targets.size || running() ? 0 : 1; }
    get ranges() {
      const a = attackActivityOf(this.hudActor.items.get(this.followUp.weaponId));
      return { normal: a?.range?.value ?? a?.item?.system?.range?.reach ?? 5, long: a?.range?.long ?? null };
    }

    async getTooltipData() {
      const k = this.followUp.kind;
      if (this.followUp.disabled) {
        return {
          title: _loc(core.keyFor("FollowUp", k), { weapon: "" }),
          description: `<p>${_loc("PENTARYN_COMBAT.FollowUp.NoFocus")}</p>`,
          classes: TT
        };
      }
      return {
        title: _loc(core.keyFor("FollowUp", k), { weapon: this.hudActor.items.get(this.followUp.weaponId)?.name ?? "" }),
        description: `<p>${_loc(core.keyFor("FollowUpText", k === "offhand" && this.followUp.via === "dual-wielder" ? "offhand-dual-wielder" : k), { n: this.followUp.count ?? 1 })}</p>`,
        details: [{ label: _loc("PENTARYN_COMBAT.Hud.Cost"), value: _loc(this.followUp.free ? "PENTARYN_COMBAT.Hud.Free" : "PENTARYN_COMBAT.Hud.BonusAction") }],
        classes: TT
      };
    }

    async _onLeftClick(event) {
      dropTooltip();
      if (this.followUp.disabled) { ui.notifications.warn(_loc("PENTARYN_COMBAT.FollowUp.NoFocus")); return; }
      await runFollowUp(this.hudActor, this.followUp, { event });
    }
  }

  /** A small toggle or command on the Special bar. */
  class CommandButton extends ItemButton {
    constructor({ id, name, img, onClick, tooltip, active = false }) {
      super({ item: { id, name, img }, inActionPanel: true });
      this._run = onClick;
      this._tip = tooltip;
      this.element.classList.add("pentaryn-combat-command");
      if (active) this.element.classList.add("pentaryn-combat-active");
    }
    get hasTooltip() { return !!this._tip; }
    async activateTooltipListeners() { await super.activateTooltipListeners(); bindTooltipLeave(this); }
    async getTooltipData() { return { title: this.label ?? "", description: `<p>${this._tip}</p>`, classes: TT }; }
    async _onLeftClick() { dropTooltip(); await this._run?.(); }
  }

  /** Never rendered: only its _onPreLeftClick is used, to open Argon's target picker for a Retarget. */
  class PickerProbe extends ItemButton {
    constructor({ activity }) {
      super({ item: { id: "pentaryn-combat-probe", name: "", img: FALLBACK_IMG }, inActionPanel: false });
      this._activity = activity;
    }
    get targets() { return 1; }
    get ranges() {
      const a = this._activity;
      return { normal: a?.range?.value ?? a?.item?.system?.range?.reach ?? 5, long: a?.range?.long ?? null };
    }
  }

  built = { FullAttackButton, FollowUpButton, CommandButton, PickerProbe, ItemButton };
  return built;
}

/* ── the Action bar: Full Attack + swing pips ────────────────────────────── */

function overridePips(panel, actor) {
  if (!setting("swingPips")) return;
  const find = (name) => {
    for (let p = Object.getPrototypeOf(panel); p; p = Object.getPrototypeOf(p)) {
      const d = Object.getOwnPropertyDescriptor(p, name);
      if (d) return d;
    }
    return null;
  };
  const maxD = find("maxActions");
  const curD = find("currentActions");
  if (!maxD?.get || !curD?.get) return;
  // null = not ours (fewer than 2 swings): Argon's own single pip and its isActionUsed apply.
  const pips = (self) => {
    try {
      const a = self?.actor ?? actor;
      const st = fullAttackState(a);
      if (st.pipCount < 2) return null;
      return core.pipState({ count: st.pipCount, turn: st.turn, inCombat: st.ctx.inCombat });
    } catch { return null; }
  };
  Object.defineProperty(panel, "maxActions", { configurable: true, get() { const s = pips(this); return s ? s.max : maxD.get.call(this); } });
  Object.defineProperty(panel, "currentActions", { configurable: true, get() { const s = pips(this); return s ? s.current : curD.get.call(this); } });
  // A function, not a flag: the override is installed for every actor, but only counts for 2+ swings.
  // A Rogue with a Nick pair (1 swing + Nick) keeps Argon's pip, which our usage hook must then spend.
  panel._pentarynPips = () => !!pips(panel);
  // Argon's updateActionUse paints used pips only when the pip count didn't change; twice settles it.
  panel.updateActionUse();
  panel.updateActionUse();
}

/* ── bar signatures: re-render a bar only when what we put on it changed ─── */
// Every swing writes the turn flag. Re-rendering the Bonus/Special bars on each write rebuilt all of
// Argon's drawers (and leaked their panels and weapon-set hooks); now a bar re-renders only when its
// follow-ups, gate or commands actually differ from what was composed.

function actionSig(actor) {
  if (!setting("fullAttack")) return "off";
  const st = fullAttackState(actor);
  return JSON.stringify([!!(st.worth && (st.weaponId || st.ma)), st.weaponId ?? st.plan.weaponId ?? null]);
}

function bonusSig(actor, panel) {
  const gate = setting("gateFollowUps") ? core.poleStrikeOpen({ turn: turnOf(actor), weapons: weaponsOf(actor) }) : null;
  const fu = setting("followUps") ? followUpsNow(actor, panel).filter(f => !f.free).map(f => [f.kind, f.weaponId, f.count ?? null, f.disabled ?? null]) : [];
  return JSON.stringify([gate, fu]);
}

function specialSig(actor) {
  const fu = setting("followUps") ? followUpsNow(actor, mainPanel("DND5E.BonusAction")).filter(f => f.free).map(f => [f.kind, f.weaponId]) : [];
  const riders = setting("riderOffers") ? core.ridersFor(featuresOf(actor)).filter(r => r.auto).map(r => [r.key, riderMode(r.key)]) : [];
  const turn = turnOf(actor);
  const touched = !!(turn.attackAction.swings || Object.keys(turn.riders).length || turn.followUps.length || turn.nick);
  const reckless = recklessShown(actor) ? isReckless(actor) : null;
  return JSON.stringify([fu, riders, !combatContext(actor).inCombat && touched, reckless]);
}

function recklessShown(actor) {
  return setting("recklessToggle") && featuresOf(actor).has("reckless-attack");
}

const SIGS = { "DND5E.Action": (a) => actionSig(a), "DND5E.BonusAction": (a, p) => bonusSig(a, p), "DND5E.Special": (a) => specialSig(a) };

/** Re-render the bars whose signature changed since they were composed. */
function checkBars(actor) {
  if (!actor || actor !== ui.ARGON?._actor) return;
  const stale = [];
  for (const [label, sig] of Object.entries(SIGS)) {
    const p = mainPanel(label);
    if (!p || p._pcSig === undefined) continue;
    try { if (sig(actor, p) !== p._pcSig) stale.push(label); } catch (err) { log.debug("bar signature (next render recomposes)", err); }
  }
  if (stale.length) rerender(stale);
}

function composeActionBar(panel, actor) {
  overridePips(panel, actor);
  panel._pcSig = actionSig(actor);
  if (!setting("fullAttack")) return;
  const C = argonClasses();
  if (!C) return;
  const st = fullAttackState(actor);
  if (!st.worth || (!st.weaponId && !st.ma)) return;
  const b = new C.FullAttackButton({ hudActor: actor });
  const next = [b, ...panel._buttons.filter(x => !(x instanceof C.FullAttackButton))];
  applyButtons(panel, next, [b]);
}

/* ── the Bonus and Special bars ──────────────────────────────────────────── */

function followUpsNow(actor, bonusPanel) {
  const ctx = combatContext(actor);
  const weapons = weaponsOf(actor);
  const unarmed = unarmedStrike(actor);
  // Argon resets its Bonus pip only on a new combat round: out of combat it would stay spent forever
  // (and "New turn" can't clear it), so out of combat only the turn flag says whether Bonus is free.
  const bonusFree = !ctx.inCombat || !bonusPanel || bonusPanel.currentActions !== 0;
  const turn = turnOf(actor);
  const features = featuresOf(actor);
  const focus = focusLeft(actor);
  const pam = features.has("polearm-master") ? featureItem(actor, "polearm-master") : null;
  const list = core.followUps({
    turn, weapons, features,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding"),
    bonusFree, focus, unarmedId: unarmed?.id ?? null, isOwnTurn: ctx.isOwnTurn,
    poleStrikeId: pam && attackActivityOf(pam) ? pam.id : null
  });
  // Which rule each Off-hand is (Light property or Dual Wielder), for its tooltip (U-10-12).
  for (const f of list) {
    if (f.kind === "offhand") f.via = core.offhandVia({ weapon: weapons.find(w => w.id === f.weaponId) ?? null, turn, offered: list });
  }
  // Usability (area 3, C3): Flurry with no Focus left stays on the bar, greyed with its reason, instead of
  // vanishing — a player who sees Martial Arts but no Flurry wonders whether the feature broke.
  if (ctx.isOwnTurn && unarmed && features.has("monks-focus") && (focus ?? 0) < 1 && bonusFree && !turn.bonusUsed
    && !turn.followUps.includes("flurry") && !turn.followUps.includes("martial-arts")) {
    list.unshift({ kind: "flurry", weaponId: unarmed.id, count: features.has("heightened-focus") ? 3 : 2, disabled: "focus" });
  }
  return list;
}

/**
 * Polearm Master's Pole Strike (its bonus-action attack activity). Not the feat as a whole: its
 * Reactive Strike (reaction) must stay on the Reaction bar.
 */
function isPoleStrike(button) {
  if (!button || "hudActor" in button) return false;        // our own buttons
  let act = null;
  try { act = button?.activity ?? null; } catch { act = null; }
  if (!act || typeof act !== "object") return false;
  if (/pole strike/i.test(act.name ?? "")) return true;
  const ident = button?.item?.system?.identifier ?? act.item?.system?.identifier;
  return ident === "polearm-master" && act.activation?.type === "bonus" && act.type === "attack";
}

/**
 * Pole Strike before it is earned: greyed with the reason in its tooltip (it used to vanish, so a
 * player couldn't tell the feat was there or when it opens). A click on it warns instead of rolling.
 */
function gatePoleStrike(button, actor) {
  if (!setting("gateFollowUps") || !actor || !isPoleStrike(button)) return;
  const open = core.poleStrikeOpen({ turn: turnOf(actor), weapons: weaponsOf(actor) });
  const el = button.element;
  el.classList.toggle("pentaryn-combat-gated", !open);
  if (el._pcGateBound) return;
  el._pcGateBound = true;
  // Argon's buttons act on `onmouseup`; a capture listener on the element runs first and stops it.
  el.addEventListener("mouseup", (ev) => {
    if (!el.classList.contains("pentaryn-combat-gated") || ev.button !== 0) return;
    ev.stopImmediatePropagation();
    ev.preventDefault();
    ui.notifications.info(_loc("PENTARYN_COMBAT.Hud.PoleStrikeGated"));
  }, true);
  if (typeof button.getTooltipData === "function") {
    const own = button.getTooltipData.bind(button);
    button.getTooltipData = async (...args) => {
      const data = await own(...args);
      if (!data || !el.classList.contains("pentaryn-combat-gated")) return data;
      return { ...data, description: `<p><strong>${_loc("PENTARYN_COMBAT.Hud.PoleStrikeGated")}</strong></p>${data.description ?? ""}` };
    };
  }
}

function composeBonusBar(panel, actor) {
  panel._pcSig = bonusSig(actor, panel);
  // Pole Strike on the bar itself; inside Argon's "Use Feature" drawer it is gated at render below.
  for (const b of panel._buttons) gatePoleStrike(b, actor);
  if (!setting("followUps")) return;
  const C = argonClasses();
  if (!C) return;
  const fu = followUpsNow(actor, panel).filter(f => !f.free);
  const kept = panel._buttons.filter(b => !(b instanceof C.FollowUpButton));
  if (!fu.length) {
    panel._pcFuSeen = { actor: actor.uuid, keys: new Set() };
    if (kept.length !== panel._buttons.length) applyButtons(panel, kept, []);
    hideDuplicateSlots(panel, fu, actor);
    return;
  }
  const fresh = fu.map(f => new C.FollowUpButton({ hudActor: actor, followUp: f }));
  applyButtons(panel, [...fresh, ...kept], fresh);
  pulseNew(panel, actor, fresh);
  hideDuplicateSlots(panel, fu, actor);
}

/**
 * Area 2 (A7): with "Off-hand: Longsword" offered, Argon's own off-hand weapon-set slot for the
 * same Longsword sat next to it as a second, plain "Longsword" button. It is hidden while ours is
 * offered (ours presets the Offhand mode and spends the Bonus pip) and back as soon as it isn't.
 * The slot is filled after the bar composes, so its own render re-checks too (hook below).
 */
function hideDuplicateSlots(panel, fu, actor = null) {
  const offered = (fu ?? []).filter(f => f.kind === "offhand").map(f => f.weaponId);
  // Usability Area 3 (B7): once Nick (or the Bonus off-hand attack) used the Light property's extra
  // attack, Argon's plain off-hand slot stayed and invited a second, illegal one; it hides too.
  const turn = actor ? turnOf(actor) : null;
  for (const b of panel?._buttons ?? []) {
    if (!b?._isWeaponSet || !b.element) continue;
    const id = b.item?.id ?? null;
    b.element.classList.toggle("pentaryn-combat-dup", core.hideOffhandSlot({ turn, slotId: id, offered }));
  }
}

/**
 * A follow-up that appears mid-turn (Hew after the GM applies a kill, Off-hand after the Attack
 * action) pulses for a few seconds, so the player notices the Bonus bar changed. Not on the first
 * composition of a bar for an actor, not for a disabled (greyed) button.
 */
function pulseNew(panel, actor, buttons) {
  const keyOf = (b) => `${b.followUp.kind}|${b.followUp.weaponId}`;
  const prev = panel._pcFuSeen?.actor === actor.uuid ? panel._pcFuSeen.keys : null;
  panel._pcFuSeen = { actor: actor.uuid, keys: new Set(buttons.map(keyOf)) };
  if (!prev) return;
  for (const b of buttons) {
    if (prev.has(keyOf(b)) || b.followUp.disabled) continue;
    // Usability Area 3: 4 s ended with the chat pop-ups and was missed; it now pulses until the
    // pointer reaches the bar, or 12 s.
    const el = b.element;
    el.classList.add("pentaryn-combat-new");
    const stop = () => el.classList.remove("pentaryn-combat-new");
    setTimeout(stop, 12000);
    panel.element?.addEventListener?.("pointerenter", stop, { once: true });
  }
}

function composeSpecialBar(panel, actor) {
  panel._pcSig = specialSig(actor);
  const C = argonClasses();
  if (!C) return;
  const kept = panel._buttons.filter(b => !(b instanceof C.FollowUpButton) && !(b instanceof C.CommandButton));
  const fresh = [];
  if (setting("followUps")) {
    for (const f of followUpsNow(actor, mainPanel("DND5E.BonusAction")).filter(x => x.free)) fresh.push(new C.FollowUpButton({ hudActor: actor, followUp: f }));
  }
  if (setting("riderOffers")) {
    for (const r of core.ridersFor(featuresOf(actor))) {
      if (!r.auto) continue;
      const mode = riderMode(r.key);
      const name = _loc(core.keyFor("Rider.Name", r.key));
      fresh.push(new C.CommandButton({
        id: `pentaryn-combat-rider-${r.key}`,
        name: _loc("PENTARYN_COMBAT.Rider.Toggle", { name, mode: _loc(core.keyFor("Rider.Mode", mode)) }),
        img: actor.items.find(i => r.identifiers.includes(i.system?.identifier))?.img ?? FALLBACK_IMG,
        tooltip: _loc(core.keyFor("Rider.ToggleHint", mode), { name, dice: riderDiceFor(actor, r) }),
        onClick: async () => { await setRiderMode(r.key, mode === "auto" ? "ask" : "auto"); rerender(["DND5E.Special"]); }
      }));
    }
  }
  if (recklessShown(actor)) {
    const on = isReckless(actor);
    const state = on ? "on" : "off";
    fresh.push(new C.CommandButton({
      id: "pentaryn-combat-reckless",
      name: _loc("PENTARYN_COMBAT.Reckless.Toggle", { state: _loc(core.keyFor("Reckless.State", state)) }),
      img: actor.items.find(i => i.system?.identifier === "reckless-attack")?.img ?? FALLBACK_IMG,
      tooltip: _loc(core.keyFor("Reckless.Hint", state)),
      active: on,
      onClick: async () => {
        const now = await setReckless(actor, !on);
        if (now) ui.notifications.info(_loc("PENTARYN_COMBAT.Reckless.On"));
        rerender(["DND5E.Special"]);
      }
    }));
  }
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const touched = turn.attackAction.swings || Object.keys(turn.riders).length || turn.followUps.length || turn.nick;
  if (!ctx.inCombat && touched) {
    fresh.push(new C.CommandButton({
      id: "pentaryn-combat-new-turn", name: _loc("PENTARYN_COMBAT.Hud.NewTurn"), img: "icons/svg/clockwork.svg",
      tooltip: _loc("PENTARYN_COMBAT.Hud.NewTurnHint"),
      onClick: async () => { await newTurn(actor); }
    }));
  }
  if (!fresh.length && kept.length === panel._buttons.length) return;
  applyButtons(panel, [...kept, ...fresh], fresh);
}

/* ── hooks ───────────────────────────────────────────────────────────────── */

Hooks.on("renderActionPanelArgonComponent", (panel, element, actor) => {
  try {
    const a = actor ?? panel.actor;
    if (!a) return;
    itemButtonClass(panel);
    if (panel?.label === "DND5E.Action") composeActionBar(panel, a);
    else if (panel?.label === "DND5E.BonusAction") composeBonusBar(panel, a);
    else if (panel?.label === "DND5E.Special") composeSpecialBar(panel, a);
  } catch (err) {
    log.error("HUD composition failed", err);
  }
});

let queued = null;

/**
 * Forget a panel's old buttons before it re-renders: Argon's drawers append their panel element to
 * the HUD's button-panel container on every render and the weapon-set slots register a hook in their
 * constructor; neither is undone by a panel render (pentaryn-transform cleans up its own the same way).
 */
function forgetButtons(panel) {
  for (const b of panel?._buttons ?? []) {
    try {
      b.panel?.element?.remove?.();
      if (b._isWeaponSet && b.hookId !== undefined) Hooks.off("argon-onSetChangeUpdateItem", b.hookId);
      for (const x of [b, b.button1, b.button2]) if (x) ui.ARGON?._itemButtons?.delete?.(x);
    } catch (err) { log.debug("forget buttons", err); }   // best effort
  }
}

/**
 * A re-rendered panel builds a NEW weapon-set slot with no item: Argon fills slots only when the
 * WeaponSets component fires `argon-onSetChangeUpdateItem` (on its own render or a set click), so
 * after a panel-only render the main-hand slot (Action bar) and off-hand slot (Bonus bar) were
 * hidden — no way to swing one weapon by hand. Hand the new slots the current set directly (no
 * `onSetChange`, so no equip/unequip side effects).
 */
async function refillWeaponSlots(panel) {
  const slots = (panel?._buttons ?? []).filter(b => b?._isWeaponSet && typeof b._onSetChange === "function");
  const ws = ui.ARGON?.components?.weaponSets;
  if (!slots.length || typeof ws?.getSetData !== "function") return;
  const data = await ws.getSetData();
  for (const s of slots) await s._onSetChange(data);
}

/** Re-render some bars of the HUD (debounced): a turn-flag write lands as several updates. */
function rerender(labels = ["DND5E.Action", "DND5E.BonusAction", "DND5E.Special"]) {
  queued = new Set([...(queued ?? []), ...labels]);
  setTimeout(() => {
    if (!queued) return;
    const now = queued;
    queued = null;
    if (!ui.ARGON?._actor) return;   // the HUD was unbound meanwhile: Argon's panels would render with no actor
    for (const label of now) {
      const p = mainPanel(label);
      if (!p?.render) continue;
      forgetButtons(p);
      Promise.resolve(p.render())
        .then(() => { dropStrayTooltip(); return refillWeaponSlots(p); })
        .catch(err => log.warn(`${label} re-render`, err));
    }
  }, 60);
}

function refreshAll() {
  for (const b of liveButtons) {
    if (!b.element.isConnected) { liveButtons.delete(b); continue; }
    b.refresh();
  }
  const action = mainPanel("DND5E.Action");
  if (action?._pentarynPips) { action.updateActionUse(); action.updateActionUse(); }
}

Hooks.on("updateActor", (actor, changes) => {
  if (actor !== ui.ARGON?._actor) return;
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE}`)) return;
  // Your turn began and the Reaction came back (Argon itself relights it only at a new round).
  if (foundry.utils.getProperty(changes, `flags.${MODULE}.reaction`) === null && setting("spellPips")) {
    const reaction = mainPanel("DND5E.Reaction");
    if (reaction?.isActionUsed) { reaction.isActionUsed = false; reaction.updateActionUse(); }
  }
  refreshAll();
  // Follow-ups appear as soon as they are earned (also mid-sequence: Hew after a crit on swing 1);
  // a bar is rebuilt only when what it shows changed.
  checkBars(actor);
  recheckSlots(actor);
});

/** Nick spent leaves the Bonus bar's buttons unchanged, so its off-hand slot is re-checked on its own. */
function recheckSlots(actor) {
  try {
    const bonus = mainPanel("DND5E.BonusAction");
    if (bonus && setting("followUps")) hideDuplicateSlots(bonus, followUpsNow(actor, bonus).filter(f => !f.free), actor);
  } catch (err) { log.debug("off-hand slot re-check (the next render re-checks)", err); }
}

// The last swing's flag write can land after the sequence ended; re-check once it has.
Hooks.on("pentarynCombat.sequenceEnd", (actor) => {
  if (!actor || actor !== ui.ARGON?._actor) return;
  turnSettled(actor).then(() => { refreshAll(); checkBars(actor); recheckSlots(actor); });
});

Hooks.on("updateCombat", (combat, changes) => {
  if (!("turn" in changes) && !("round" in changes)) return;
  // The turn moved on under a running or paused sequence: its remaining swings belong to that turn.
  const r = running();
  if (r?.actor) { const c = combatContext(r.actor); if (c.inCombat && !c.isOwnTurn) abortFor(r.actor); }
  const actor = ui.ARGON?._actor;
  if (!actor) return;
  refreshAll();
  checkBars(actor);
});

// Combat over (in-combat → nocombat key, "New turn" may appear); a weapon equipped or a Focus Point
// spent elsewhere (follow-ups depend on both).
Hooks.on("deleteCombat", () => { const a = ui.ARGON?._actor; if (a) setTimeout(() => { refreshAll(); checkBars(a); }, 0); });
Hooks.on("updateItem", (item) => { const a = ui.ARGON?._actor; if (a && item?.parent === a) checkBars(a); });
// Reckless on/off (from our toggle, the sheet, or its expiry at turn start) flips the Special-bar toggle.
for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
  Hooks.on(hook, (effect) => { const a = ui.ARGON?._actor; if (a && effect?.parent === a) checkBars(a); });
}

// The sequence used the item directly, not Argon's button: spend the pip Argon would have.
Hooks.on("pentarynCombat.usage", (activity, kind) => {
  try {
    if (kind !== "main") return;
    const action = mainPanel("DND5E.Action");
    if (action?._pentarynPips?.()) return;        // our pips count this actor's swings
    DND5eItemButton?.consumeActionEconomy?.(activity);
  } catch (err) { log.warn("action economy", err); }
});

// Out of combat Argon shows no pips and never resets them, so nothing is marked there.
Hooks.on("pentarynCombat.bonusSpent", (actor) => {
  if (!setting("offhandPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const bonus = mainPanel("DND5E.BonusAction");
  if (!bonus) return;
  bonus.isActionUsed = true;
  bonus.updateActionUse();
});

// A Bonus-action feature or spell used on your turn (Rage, Steady Aim, Divine Smite…): Argon's item
// buttons never spent its pip (setting bonusPip; the turn flag was written in combat.mjs).
Hooks.on("pentarynCombat.bonusAction", (actor) => {
  if (!setting("bonusPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const bonus = mainPanel("DND5E.BonusAction");
  if (!bonus) return;
  bonus.isActionUsed = true;
  bonus.updateActionUse();
});

// A spell or feature that is an Action (Fire Bolt, Fireball, Magic): Argon's item buttons never spent its
// single Action pip (usability Area 5 re-run, S5). With 2+ swings our own pips already count it.
Hooks.on("pentarynCombat.otherAction", (actor) => {
  if (!setting("spellPips") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const action = mainPanel("DND5E.Action");
  if (!action || action._pentarynPips?.()) return;
  action.isActionUsed = true;
  action.updateActionUse();
});

// A Reaction (Counterspell, Shield…), on any turn (S14).
Hooks.on("pentarynCombat.reaction", (actor) => {
  if (!setting("spellPips") || actor !== ui.ARGON?._actor) return;
  const reaction = mainPanel("DND5E.Reaction");
  if (!reaction) return;
  reaction.isActionUsed = true;
  reaction.updateActionUse();
});

/**
 * A re-bound HUD builds new panels with every pip lit, and Argon lights every pip at a new round
 * (S5: "the Bonus pip display reset by itself"). Repaint Argon's own Action / Bonus / Reaction pips
 * from the turn flag and the Reaction flag.
 */
function restorePips(actor) {
  if (!setting("spellPips") || !actor || actor !== ui.ARGON?._actor) return;
  const ctx = combatContext(actor);
  if (!ctx.inCombat) return;
  const reaction = mainPanel("DND5E.Reaction");
  if (reaction && core.reactionSpent(actor.getFlag(MODULE, "reaction"), ctx.combat?.id) && !reaction.isActionUsed) {
    reaction.isActionUsed = true;
    reaction.updateActionUse();
  }
  if (!ctx.isOwnTurn) return;
  const spent = core.spentPips(turnOf(actor));
  const action = mainPanel("DND5E.Action");
  if (action && !action._pentarynPips?.() && spent.action && !action.isActionUsed) { action.isActionUsed = true; action.updateActionUse(); }
  const bonus = mainPanel("DND5E.BonusAction");
  if (bonus && spent.bonus && !bonus.isActionUsed) { bonus.isActionUsed = true; bonus.updateActionUse(); }
}

Hooks.on("renderActionPanelArgonComponent", (panel) => {
  if (!["DND5E.Action", "DND5E.BonusAction", "DND5E.Reaction"].includes(panel?.label)) return;
  try { restorePips(ui.ARGON?._actor); } catch (err) { log.debug("restore pips", err); }   // never break Argon's render
});
// Argon's own updateCombat handler (registered after ours) relights every pip at a new round.
Hooks.on("updateCombat", (combat, changes) => {
  if (!("round" in changes)) return;
  setTimeout(() => { try { restorePips(ui.ARGON?._actor); } catch (err) { log.debug("restore pips (HUD closed)", err); } }, 0);
});

// An off-hand swing clicked through Argon's weapon slot made Argon grey the Action pip (the weapon's
// activation is `action`); give it back when no Action was taken. A sequence swing never greyed it.
Hooks.on("pentarynCombat.offhand", (actor, { bySequence = false } = {}) => {
  if (bySequence || !setting("offhandPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const action = mainPanel("DND5E.Action");
  if (!action || action._pentarynPips?.()) return;
  const turn = turnOf(actor);
  if (turn.attackAction.swings === 0 && core.otherActionsOf(turn) === 0) {
    action.isActionUsed = false;
    action.updateActionUse();
  }
});

// Pole Strike inside Argon's "Use Feature" drawer: gated when the drawer's buttons render.
Hooks.on("renderItemButtonArgonComponent", (button, element, actor) => {
  try { gatePoleStrike(button, actor ?? ui.ARGON?._actor); } catch (err) { log.debug("Pole Strike gate", err); }   // never break Argon's render
  try {
    if (!button?._isWeaponSet || !setting("followUps")) return;
    const bonus = mainPanel("DND5E.BonusAction");
    const a = actor ?? ui.ARGON?._actor;
    if (!bonus || !a || !bonus._buttons?.includes(button)) return;
    hideDuplicateSlots(bonus, followUpsNow(a, bonus).filter(f => !f.free), a);
  } catch (err) { log.debug("off-hand slot check", err); }   // never break Argon's render
});

// A shift or revert (a new body) ends a running sequence.
Hooks.on("updateToken", (doc, changes) => {
  if (!running() || !("actorId" in (changes ?? {}))) return;
  abortFor(running().actor);
});
