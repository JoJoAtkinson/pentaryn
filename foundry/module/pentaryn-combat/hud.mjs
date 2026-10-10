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
import { setting, riderMode, setRiderMode } from "./settings.mjs";
import {
  weaponsOf, featuresOf, countFor, multiattackOf, usesMultiattack, combatContext, turnOf, newTurn, attackActivityOf,
  unarmedStrike, focusLeft, turnSettled, setPrimaryId, chosenWeapon
} from "./shapes.mjs";
import { runSwings, runFollowUp, fullAttackPlan, running, abortFor, registerTargetPicker } from "./sequence.mjs";
import { pickWeapon } from "./strip.mjs";
import { riderDiceFor, isReckless, setReckless } from "./riders.mjs";

const MOD = core.MOD;
const ARGON = "enhancedcombathud";
const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const FALLBACK_IMG = "icons/skills/melee/blade-tips-triple-steel.webp";

let DND5eItemButton = null;      // Argon dnd5e's closure-private button class, borrowed from the weapon-set slot
let built = null;
const liveButtons = new Set();

/* ── small helpers (copied from pentaryn-transform/hud.mjs on purpose: no cross-module import) ── */

function dropTooltip() {
  try {
    game.tooltip?.deactivate?.();
    if (ui.ARGON?._tooltip) ui.ARGON._tooltip = null;
  } catch { /* never let tooltip hygiene break a click */ }
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
  panel.updateVisibility();
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

const TT = ["pentaryn-tt"];

/* ── which weapon, how many swings ───────────────────────────────────────── */

function multiattack(actor) {
  return usesMultiattack(actor) && setting("multiattack") ? multiattackOf(actor) : null;
}

/** Everything the Full Attack button and the pips read, in one place. */
function fullAttackState(actor) {
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const ma = multiattack(actor);
  const pick = ma ? { "*": actor.getFlag(MOD, "last")?.weapon ?? null } : null;
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
  const id = await pickWeapon(tiles, { title: T("PENTARYN_COMBAT.Picker.Title") });
  if (id) await actor.setFlag(MOD, "last.weapon", id);
  return id;
}

/* ── Argon's target picker, reused through a hidden button ───────────────── */

function argonPickerOn() {
  try { return !!game.settings.get(ARGON, "rangepicker"); } catch { return false; }
}

registerTargetPicker(async (activity) => {
  const C = argonClasses();
  if (!C || !argonPickerOn() || !ui.ARGON?._token) return undefined;
  const probe = new C.PickerProbe({ activity });
  let picked = false;
  probe._onLeftClick = async () => { picked = true; };
  await probe._onPreLeftClick(new MouseEvent("mouseup", { button: 0 }));
  return picked && game.user.targets.size > 0;
});

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
      super({ item: { id: "pentaryn-combat-full-attack", name: T("PENTARYN_COMBAT.FullAttack"), img: first?.img || FALLBACK_IMG }, inActionPanel: true });
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
      const what = st.ma ? names.join(", ") : T("PENTARYN_COMBAT.Hud.WithWeapon", { weapon: first?.name ?? "—" });
      return {
        title: T("PENTARYN_COMBAT.FullAttack"),
        subtitle: T("PENTARYN_COMBAT.Hud.SwingsLeft", { left: st.plan.swings.length, total: st.count }),
        description: `<p>${T("PENTARYN_COMBAT.Hud.FullAttackText", { what })}</p>`,
        details: [
          { label: T("PENTARYN_COMBAT.Hud.ToHit"), value: act?.labels?.toHit ?? "—" },
          { label: T("PENTARYN_COMBAT.Hud.Swings"), value: String(st.plan.swings.length) }
        ],
        footerText: T("PENTARYN_COMBAT.Hud.FullAttackHint"),
        classes: TT
      };
    }

    refresh() {
      const st = this.state;
      paintBadge(this, st.ctx.inCombat ? st.plan.swings.length : st.count);
    }

    async _renderInner() {
      await super._renderInner();
      this.refresh();
    }

    async _onLeftClick(event) {
      dropTooltip();
      const actor = this.hudActor;
      // Nothing remembered and no weapon set: ask once which weapon (the choice is remembered).
      if (!actor.getFlag(MOD, "last")?.weapon && !setPrimaryId(actor) && !multiattack(actor)) {
        const candidates = weaponsOf(actor).filter(core.canSwing);
        if (candidates.length > 1 && !(await chooseWeapon(actor))) return;
      }
      const st = this.state;
      if (!st.plan.swings.length) {
        ui.notifications.warn(T("PENTARYN_COMBAT.Hud.NoSwingsLeft"));
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
      const label = T(`PENTARYN_COMBAT.FollowUp.${followUp.kind}`, { weapon: w?.name ?? "" });
      super({ item: { id: `pentaryn-combat-${followUp.kind}`, name: label, img: w?.img || FALLBACK_IMG }, inActionPanel: true });
      this.hudActor = hudActor;
      this.followUp = followUp;
      this.element.classList.add("pentaryn-combat-followup");
      if (followUp.disabled) this.element.classList.add("pentaryn-combat-disabled");
    }

    get hasTooltip() { return true; }
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
          title: T(`PENTARYN_COMBAT.FollowUp.${k}`, { weapon: "" }),
          description: `<p>${T("PENTARYN_COMBAT.FollowUp.NoFocus")}</p>`,
          classes: TT
        };
      }
      return {
        title: T(`PENTARYN_COMBAT.FollowUp.${k}`, { weapon: this.hudActor.items.get(this.followUp.weaponId)?.name ?? "" }),
        description: `<p>${T(`PENTARYN_COMBAT.FollowUpText.${k}`, { n: this.followUp.count ?? 1 })}</p>`,
        details: [{ label: T("PENTARYN_COMBAT.Hud.Cost"), value: T(this.followUp.free ? "PENTARYN_COMBAT.Hud.Free" : "PENTARYN_COMBAT.Hud.BonusAction") }],
        classes: TT
      };
    }

    async _onLeftClick(event) {
      dropTooltip();
      if (this.followUp.disabled) { ui.notifications.warn(T("PENTARYN_COMBAT.FollowUp.NoFocus")); return; }
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
    try { if (sig(actor, p) !== p._pcSig) stale.push(label); } catch { /* next render recomposes */ }
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
  const list = core.followUps({
    turn, weapons, features,
    enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding"),
    bonusFree, focus, unarmedId: unarmed?.id ?? null, isOwnTurn: ctx.isOwnTurn
  });
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
    ui.notifications.info(T("PENTARYN_COMBAT.Hud.PoleStrikeGated"));
  }, true);
  if (typeof button.getTooltipData === "function") {
    const own = button.getTooltipData.bind(button);
    button.getTooltipData = async (...args) => {
      const data = await own(...args);
      if (!data || !el.classList.contains("pentaryn-combat-gated")) return data;
      return { ...data, description: `<p><strong>${T("PENTARYN_COMBAT.Hud.PoleStrikeGated")}</strong></p>${data.description ?? ""}` };
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
    return;
  }
  const fresh = fu.map(f => new C.FollowUpButton({ hudActor: actor, followUp: f }));
  applyButtons(panel, [...fresh, ...kept], fresh);
  pulseNew(panel, actor, fresh);
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
    b.element.classList.add("pentaryn-combat-new");
    setTimeout(() => b.element.classList.remove("pentaryn-combat-new"), 4000);
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
      const name = T(`PENTARYN_COMBAT.Rider.Name.${r.key}`);
      fresh.push(new C.CommandButton({
        id: `pentaryn-combat-rider-${r.key}`,
        name: T("PENTARYN_COMBAT.Rider.Toggle", { name, mode: T(`PENTARYN_COMBAT.Rider.Mode.${mode}`) }),
        img: actor.items.find(i => r.identifiers.includes(i.system?.identifier))?.img ?? FALLBACK_IMG,
        tooltip: T(`PENTARYN_COMBAT.Rider.ToggleHint.${mode}`, { name, dice: riderDiceFor(actor, r) }),
        onClick: async () => { await setRiderMode(r.key, mode === "auto" ? "ask" : "auto"); rerender(["DND5E.Special"]); }
      }));
    }
  }
  if (recklessShown(actor)) {
    const on = isReckless(actor);
    const state = on ? "on" : "off";
    fresh.push(new C.CommandButton({
      id: "pentaryn-combat-reckless",
      name: T("PENTARYN_COMBAT.Reckless.Toggle", { state: T(`PENTARYN_COMBAT.Reckless.State.${state}`) }),
      img: actor.items.find(i => i.system?.identifier === "reckless-attack")?.img ?? FALLBACK_IMG,
      tooltip: T(`PENTARYN_COMBAT.Reckless.Hint.${state}`),
      active: on,
      onClick: async () => {
        const now = await setReckless(actor, !on);
        if (now) ui.notifications.info(T("PENTARYN_COMBAT.Reckless.On"));
        rerender(["DND5E.Special"]);
      }
    }));
  }
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const touched = turn.attackAction.swings || Object.keys(turn.riders).length || turn.followUps.length || turn.nick;
  if (!ctx.inCombat && touched) {
    fresh.push(new C.CommandButton({
      id: "pentaryn-combat-new-turn", name: T("PENTARYN_COMBAT.Hud.NewTurn"), img: "icons/svg/clockwork.svg",
      tooltip: T("PENTARYN_COMBAT.Hud.NewTurnHint"),
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
    console.error(`${MOD} | HUD composition failed`, err);
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
    } catch { /* best effort */ }
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
    for (const label of now) {
      const p = mainPanel(label);
      if (!p?.render) continue;
      forgetButtons(p);
      Promise.resolve(p.render())
        .then(() => refillWeaponSlots(p))
        .catch(err => console.warn(`${MOD} | ${label} re-render`, err));
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
  if (!foundry.utils.hasProperty(changes, `flags.${MOD}`)) return;
  refreshAll();
  // Follow-ups appear as soon as they are earned (also mid-sequence: Hew after a crit on swing 1);
  // a bar is rebuilt only when what it shows changed.
  checkBars(actor);
});

// The last swing's flag write can land after the sequence ended; re-check once it has.
Hooks.on("pentarynCombat.sequenceEnd", (actor) => {
  if (!actor || actor !== ui.ARGON?._actor) return;
  turnSettled(actor).then(() => { refreshAll(); checkBars(actor); });
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
  } catch (err) { console.warn(`${MOD} | action economy`, err); }
});

// Out of combat Argon shows no pips and never resets them, so nothing is marked there.
Hooks.on("pentarynCombat.bonusSpent", (actor) => {
  if (!setting("offhandPip") || actor !== ui.ARGON?._actor || !combatContext(actor).inCombat) return;
  const bonus = mainPanel("DND5E.BonusAction");
  if (!bonus) return;
  bonus.isActionUsed = true;
  bonus.updateActionUse();
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
  try { gatePoleStrike(button, actor ?? ui.ARGON?._actor); } catch { /* never break Argon's render */ }
});

// A shift or revert (a new body) ends a running sequence.
Hooks.on("updateToken", (doc, changes) => {
  if (!running() || !("actorId" in (changes ?? {}))) return;
  abortFor(running().actor);
});
