/**
 * The HUD's own Argon buttons (ui): Full Attack, a follow-up (Off-hand, Nick, Flurry, Martial Arts,
 * Hew, Pole Strike), a Special-bar command (rider ask/auto, Reckless on/off, New turn) and the hidden
 * picker probe. Each class subclasses an Argon base directly (Argon renders
 * partials/{ParentClassName}.hbs, so a class two deep would look for a template that isn't there).
 * `fullAttackState` is everything the Full Attack button and the pips read, in one place.
 *
 * The bars feature (hud/bars.mjs) wires `rerender` in (wireButtons) — a ui file never imports a
 * feature for it; the runner (sequence.mjs) and the weapon picker (strip.mjs) are imported directly
 * (test/graph-allow.json).
 */

import * as core from "../combat-core.mjs";
import { setting } from "../settings.mjs";
import { weaponsOf, countFor, combatContext, turnOf, attackActivityOf, setPrimaryId, chosenWeapon, damageLabel, fullAttackPlanOf, multiattackFor, rememberedWeapon, rememberWeapon } from "../shapes.mjs";
import { bindTooltipLeave, dropTooltip, paintBadge, refreshOwnTooltip } from "../argon.mjs";
import { runSwings, runFollowUp, running } from "../sequence.mjs";
import { pickWeapon } from "../strip.mjs";

export const FALLBACK_IMG = "icons/skills/melee/blade-tips-triple-steel.webp";
export const TT = ["pentaryn-tt", "pentaryn-combat-tt"];   // shared tooltip layout + combat's own (subtitle wrap, PT1-6)

/** Full Attack buttons alive on the HUD (refreshAll repaints their badge and tooltip). */
export const liveButtons = new Set();

let built = null;
const wiring = { rerender: () => undefined };

/** The bars feature hands its re-render in at install. */
export function wireButtons({ rerender }) {
  wiring.rerender = rerender;
}

/* ── which weapon, how many swings ───────────────────────────────────────── */

export function multiattack(actor) {
  return multiattackFor(actor, { enabled: setting("multiattack") });
}

/** Everything the Full Attack button and the pips read, in one place. */
export function fullAttackState(actor) {
  const ctx = combatContext(actor);
  const turn = turnOf(actor);
  const ma = multiattack(actor);
  const pick = ma ? { "*": rememberedWeapon(actor) } : null;
  const weaponId = ma ? null : chosenWeapon(actor);
  const count = ma ? ma.total : countFor(actor, weaponId);
  const plan = fullAttackPlanOf(actor, { weaponId, turn, inCombat: ctx.inCombat, multiattack: ma, count, pick });
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
  return {
    id: w.id, name: w.name, img: w.img || FALLBACK_IMG,
    toHit: act?.labels?.toHit ?? "",
    damage: damageLabel(act),
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
  if (id) await rememberWeapon(actor, id);
  return id;
}

/* ── components ──────────────────────────────────────────────────────────── */

export function argonClasses() {
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
      refreshOwnTooltip(this, { enabled: setting("fullAttack") });
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
      if (!rememberedWeapon(actor) && !setPrimaryId(actor) && !multiattack(actor)) {
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
      if (id) wiring.rerender(["DND5E.Action"]);   // the button's icon is the chosen weapon's
    }
  }

  /** One follow-up (Off-hand, Nick, Flurry, Martial Arts, Hew, Pole Strike). */
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
