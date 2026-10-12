/**
 * Argon's six built-in actions and the Reaction bar's weapon (feature; settings specialActions,
 * reactionSlot). Argon dnd5e calls consumeActionEconomy(this.item) with a temporary Item that has no
 * activation, so no pip was ever spent; Dash and Disengage only posted a card; Dodge's status never
 * ended; Hide rolled nothing. The Reaction bar's weapon reads "Opportunity Attack" and spends the
 * Reaction, not a swing. Argon's buttons are wrapped per instance in its own render hook: ONE
 * renderActionPanelArgonComponent listener (splitting it would change the per-hook listener list).
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting } from "../settings.mjs";
import { combatContext, turnOf, updateTurn, countFor, chosenWeapon } from "../shapes.mjs";
import { mainPanel, settlePips } from "../argon.mjs";
import { expectRoll, forgetRoll } from "../sequence.mjs";

const log = makeLog(MODULE);

/**
 * Temporary hooks (one roll, one pick, one dialog) go through the registry the feature was
 * installed with, so uninstall() unwinds a stray one; before install they fall back to Hooks.
 */
let hooks = null;
const temp = {
  on: (name, fn, label) => (hooks ? hooks.on(name, fn, { guard: false, label }) : Hooks.on(name, fn)),
  off: (name, id) => (hooks ? hooks.off(id) : Hooks.off(name, id)),
};

/** Argon's updateActionUse paints used pips only when the pip count didn't change; twice settles it. */
function paint(panel) {
  try { settlePips(panel); } catch (err) { log.debug("paint pips (HUD closed)", err); }
}

/* ── Argon's six built-in actions ────────────────────────────────────────── */
// Argon dnd5e calls consumeActionEconomy(this.item) with a temporary Item that has no activation, so
// no pip was ever spent; Dash and Disengage only posted a card; Dodge's status never ended; Hide
// rolled nothing.

function specialNames() {
  return Object.fromEntries(core.SPECIAL_ACTIONS.map(k => [k, game.i18n.localize(`enhancedcombathud-dnd5e.items.${k}.name`)]));
}

function swingsPerAction(actor) {
  try { return countFor(actor, chosenWeapon(actor)); } catch { return 1; }
}

async function addTurnEffect(actor, kind, img) {
  const changes = kind === "dash" ? dashBase(actor) : [];
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: _loc(core.keyFor("Turn.Effect", kind)),
    img: img || "icons/svg/wingfoot.svg",
    description: `<p>${_loc(core.keyFor("Turn.EffectText", kind))}</p>`,
    transfer: false,
    origin: actor.uuid,
    system: { changes },
    flags: { [MODULE]: { until: "turnEnd", special: kind }, dnd5e: { isTemporary: true } }
  }]);
}

/** Dash adds your Speed after modifiers; a second Dash this turn adds the same again, not double. */
function dashBase(actor) {
  const earlier = actor.effects.find(e => e.getFlag(MODULE, "special") === "dash");
  const had = earlier?.system?.changes;
  if (Array.isArray(had) && had.length) return had.map(c => ({ key: c.key, type: c.type ?? "add", value: c.value }));
  return core.dashChanges(actor.system?.attributes?.movement ?? {});
}

async function rollHide(actor) {
  let rolls = null;
  try { rolls = await actor.rollSkill({ skill: "ste", target: 15 }); } catch (err) { log.warn("Hide roll", err); }
  const roll = Array.isArray(rolls) ? rolls[0] : rolls;
  const total = roll?.total;
  const hidden = Number.isFinite(total) && total >= 15;
  if (hidden) {
    if (!actor.statuses?.has?.("hiding")) await actor.toggleStatusEffect("hiding", { active: true });
    ui.notifications.info(_loc("PENTARYN_COMBAT.Turn.Hidden", { total }));
  } else {
    if (actor.statuses?.has?.("hiding")) await actor.toggleStatusEffect("hiding", { active: false });
    ui.notifications.info(Number.isFinite(total) ? _loc("PENTARYN_COMBAT.Turn.NotHidden", { total }) : _loc("PENTARYN_COMBAT.Turn.HideCancelled"));
  }
}

async function afterSpecial(actor, kind, btn) {
  const ctx = combatContext(actor);
  const mine = ctx.inCombat && ctx.isOwnTurn;
  // Spend the Action pip Argon meant to spend (pentaryn's swing pips read the turn flag below).
  if (mine && kind !== "shove") {
    const action = mainPanel("DND5E.Action");
    if (action) { action.isActionUsed = true; paint(action); }
  }
  // An item the actor owns ran through dnd5e: postUseActivity already counted it; only the pip was missing.
  if (btn.actorItem) return;
  if (mine) await updateTurn(actor, t => core.recordSpecialAction(t, kind));
  if (kind === "dash" && mine) await addTurnEffect(actor, "dash", btn.item?.img);
  if (kind === "disengage" && mine) await addTurnEffect(actor, "disengage", btn.item?.img);
  // Argon toggles Dodging: a second Dodge would have switched it off.
  if (kind === "dodge" && !actor.statuses?.has?.("dodging")) await actor.toggleStatusEffect("dodging", { active: true });
  if (kind === "hide") await rollHide(actor);
}

function wrapSpecial(btn) {
  if (!btn || btn._pcSpecial !== undefined || typeof btn.createChatMessage !== "function") return;
  const kind = core.specialActionOf(btn.item?.name ?? btn.label, specialNames());
  btn._pcSpecial = kind;
  if (!kind) return;
  const own = btn._onLeftClick;
  btn._onLeftClick = async (event) => {
    if (!setting("specialActions")) return own.call(btn, event);
    const actor = btn.actor;
    const ctx = combatContext(actor);
    if (ctx.inCombat && ctx.isOwnTurn) {
      const turn = turnOf(actor);
      const left = core.actionsLeft(turn, swingsPerAction(actor));
      const shoveOk = kind === "shove" && core.swingsLeft(swingsPerAction(actor), turn, { inCombat: true }) > 0;
      if (!left && !shoveOk) ui.notifications.warn(_loc("PENTARYN_COMBAT.Turn.NoActionLeft", { action: btn.label }));
    }
    await own.call(btn, event);
    try { await afterSpecial(actor, kind, btn); } catch (err) { log.warn(`${kind}`, err); }
  };
}

/* ── the Reaction bar's weapon: Opportunity Attack ───────────────────────── */

function protoGetter(obj, name) {
  for (let p = Object.getPrototypeOf(obj); p; p = Object.getPrototypeOf(p)) {
    const d = Object.getOwnPropertyDescriptor(p, name);
    if (d?.get) return d.get;
  }
  return null;
}

function wrapReactionSlot(btn) {
  if (!btn?._isWeaponSet || btn._pcOA) return;
  btn._pcOA = true;
  const ownLabel = protoGetter(btn, "label");
  Object.defineProperty(btn, "label", {
    configurable: true,
    get() {
      const base = ownLabel ? ownLabel.call(this) : this.item?.name;
      return setting("reactionSlot") && this.item?.name ? _loc("PENTARYN_COMBAT.Turn.OA", { weapon: this.item.name }) : base;
    }
  });
  const own = btn._onLeftClick;
  btn._onLeftClick = async (event) => {
    if (!setting("reactionSlot")) return own.call(btn, event);
    const actor = btn.actor;
    let activity = null;
    try { activity = btn.activity ?? null; } catch { activity = null; }
    const action = mainPanel("DND5E.Action");
    const reaction = mainPanel("DND5E.Reaction");
    const actionWas = action?.isActionUsed;
    // The attack roll dnd5e starts after use() is a reaction: never one of the Attack action's swings.
    if (activity?.uuid) expectRoll(activity.uuid, "reaction");
    let used = false;
    const hook = temp.on("dnd5e.postUseActivity", (a) => { if (a?.uuid && a.uuid === activity?.uuid) used = true; }, "Opportunity Attack: was it used");
    try { await own.call(btn, event); } finally { temp.off("dnd5e.postUseActivity", hook); }
    if (!used) { forgetRoll(activity?.uuid); return; }
    // Argon spends the weapon's own activation (the Action) on your own turn: give it back, spend the Reaction.
    if (action && action.isActionUsed !== actionWas) { action.isActionUsed = actionWas; paint(action); }
    if (reaction && combatContext(actor).inCombat) { reaction.isActionUsed = true; paint(reaction); }
  };
  if (btn.element?.isConnected) btn.render?.();
}

const onActionPanel = (panel) => {
  try {
    for (const b of panel?._buttons ?? []) {
      if (panel.label === "DND5E.Reaction") wrapReactionSlot(b);
      if (panel.label === "DND5E.Action") for (const x of [b, b?.button1, b?.button2]) wrapSpecial(x);
    }
  } catch (err) { log.warn("turn-flow buttons", err); }
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ guard: false, label });

// hot: per-button markers (_pcSpecial, _pcOA); no world iteration
export function install(reg) {
  hooks = reg;
  reg.on("renderActionPanelArgonComponent", onActionPanel, opts("turn flow: special actions, Opportunity Attack"));
}

export function uninstall() {
  hooks = null;
}
