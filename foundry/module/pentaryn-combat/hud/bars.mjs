/**
 * The Argon bars (feature). Argon has no "add a button" API, but every panel fires
 * render{ParentClass}ArgonComponent after rendering, its button list is a plain array and its
 * buttons are plain elements, so the bars are recomposed in that hook. Nothing in Argon's files is
 * edited.
 *
 *   Action bar   Full Attack (first, only when the actor gets 2+ swings); the Action pips count swings
 *   Bonus bar    Off-hand / Flurry / Martial Arts / Hew follow-ups; Pole Strike gated until earned
 *   Special bar  Nick (free), "Sneak Attack: ask/auto" toggle, "Reckless Attack: on/off", "New turn" out of combat
 *   Pips         the pip each kind of use spends (Bonus, Action, Reaction), repainted on a re-bound HUD
 *
 * Registration order is kept literally (the hooks golden pins it): the composition listener, the
 * bar re-checks, the pip listeners (with their own render and round listeners), then Argon's own
 * item buttons and the shape-change abort.
 */

import * as core from "../combat-core.mjs";
import { MODULE } from "../combat-core.mjs";
import { makeLog } from "../lib/log.mjs";
import { setting, riderMode, setRiderMode } from "../settings.mjs";
import { weaponsOf, featuresOf, combatContext, turnOf, newTurn, turnSettled, isReckless, riderDiceFor, followUpsFor } from "../shapes.mjs";
import { applyButtons, dropStrayTooltip, itemButtonClass, mainPanel, protoDescriptor, settlePips } from "../argon.mjs";
import { FALLBACK_IMG, argonClasses, fullAttackState, liveButtons, stateBurst, wireButtons } from "./buttons-ui.mjs";
import { onBonusAction, onBonusSpent, onOffhand, onOtherAction, onPanelRenderedPips, onReaction, onRoundPips, onUsage } from "./pips-bar.mjs";
import { running, abortFor, pruneSession as pruneRolls } from "../sequence.mjs";
import { setReckless, pruneSession as pruneRiders } from "../turn-riders.mjs";
import { placeOpenDrawers } from "../turnflow/drawers.mjs";

const log = makeLog(MODULE);

/* ── the Action bar: Full Attack + swing pips ────────────────────────────── */

function overridePips(panel, actor) {
  if (!setting("swingPips")) return;
  const maxD = protoDescriptor(panel, "maxActions");
  const curD = protoDescriptor(panel, "currentActions");
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
  settlePips(panel);
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
  const fu = setting("followUps") ? bonusFollowUps(actor, panel).map(f => [f.kind, f.weaponId, f.count ?? null, f.disabled ?? null]) : [];
  return JSON.stringify([gate, fu]);
}

// Anything this turn already spent or offered: out of combat, it is what puts "New turn" on the Special bar.
const turnTouched = (turn) => !!(turn.attackAction.swings || Object.keys(turn.riders).length || turn.followUps.length || turn.nick);

function specialSig(actor) {
  const fu = setting("followUps") ? freeFollowUps(actor).map(f => [f.kind, f.weaponId]) : [];
  const riders = setting("riderOffers") ? core.ridersFor(featuresOf(actor)).filter(r => r.auto).map(r => [r.key, riderMode(r.key)]) : [];
  const turn = turnOf(actor);
  const touched = turnTouched(turn);
  const reckless = recklessShown(actor) ? isReckless(actor) : null;
  return JSON.stringify([fu, riders, !combatContext(actor).inCombat && touched, reckless]);
}

function recklessShown(actor) {
  return setting("recklessToggle") && featuresOf(actor).has("reckless-attack");
}

// Each bar by its label: its signature and its composer (function declarations, hoisted). Insertion
// order is the order checkBars re-renders stale bars in: Action, Bonus, Special.
const BARS = {
  "DND5E.Action": { sig: (a) => actionSig(a), compose: composeActionBar },
  "DND5E.BonusAction": { sig: (a, p) => bonusSig(a, p), compose: composeBonusBar },
  "DND5E.Special": { sig: (a) => specialSig(a), compose: composeSpecialBar }
};

/** Re-render the bars whose signature changed since they were composed. */
function checkBars(actor) {
  if (!actor || actor !== ui.ARGON?._actor) return;
  const stale = [];
  for (const [label, { sig }] of Object.entries(BARS)) {
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
  applyButtons(panel, next, [b], placeOpenDrawers);
}

/* ── the Bonus and Special bars ──────────────────────────────────────────── */

function followUpsNow(actor, bonusPanel) {
  // Argon resets its Bonus pip only on a new combat round: out of combat it would stay spent forever
  // (and "New turn" can't clear it), so out of combat only the turn flag says whether Bonus is free.
  const bonusFree = !combatContext(actor).inCombat || !bonusPanel || bonusPanel.currentActions !== 0;
  return followUpsFor(actor, { bonusFree });
}

/** The follow-ups that cost a bonus action (the Bonus bar's) and the free ones (the Special bar's). */
function bonusFollowUps(actor, bonusPanel) { return followUpsNow(actor, bonusPanel).filter(f => !f.free); }
function freeFollowUps(actor) { return followUpsNow(actor, mainPanel("DND5E.BonusAction")).filter(f => f.free); }

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
  const fu = bonusFollowUps(actor, panel);
  const kept = panel._buttons.filter(b => !(b instanceof C.FollowUpButton));
  if (!fu.length) {
    panel._pcFuSeen = { actor: actor.uuid, keys: new Set() };
    if (kept.length !== panel._buttons.length) applyButtons(panel, kept, [], placeOpenDrawers);
    hideDuplicateSlots(panel, fu, actor);
    return;
  }
  const fresh = fu.map(f => new C.FollowUpButton({ hudActor: actor, followUp: f }));
  applyButtons(panel, [...fresh, ...kept], fresh, placeOpenDrawers);
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
    setTimeout(stop, core.DELAYS.pulse);
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
    for (const f of freeFollowUps(actor)) fresh.push(new C.FollowUpButton({ hudActor: actor, followUp: f }));
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
  const touched = turnTouched(turn);
  if (!ctx.inCombat && touched) {
    fresh.push(new C.CommandButton({
      id: "pentaryn-combat-new-turn", name: _loc("PENTARYN_COMBAT.Hud.NewTurn"), img: "icons/svg/clockwork.svg",
      tooltip: _loc("PENTARYN_COMBAT.Hud.NewTurnHint"),
      onClick: async () => { await newTurn(actor); }
    }));
  }
  if (!fresh.length && kept.length === panel._buttons.length) return;
  applyButtons(panel, [...kept, ...fresh], fresh, placeOpenDrawers);
}

/* ── hooks ───────────────────────────────────────────────────────────────── */

const onPanelRendered = (panel, element, actor) => {
  try {
    const a = actor ?? panel.actor;
    if (!a) return;
    itemButtonClass(panel);
    if (Object.hasOwn(BARS, panel?.label)) BARS[panel.label].compose(panel, a);
  } catch (err) {
    log.error("HUD composition failed", err);
  }
};

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

/** Re-render some bars of the HUD (batched): a turn-flag write lands as several updates. */
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
  }, core.DELAYS.rerender);
}

function refreshAll() {
  for (const b of liveButtons) {
    if (!b.element.isConnected) { liveButtons.delete(b); continue; }
    b.refresh();
  }
  const action = mainPanel("DND5E.Action");
  if (action?._pentarynPips) settlePips(action);
}

const onActorUpdated = (actor, changes) => {
  if (actor !== ui.ARGON?._actor) return;
  if (!foundry.utils.hasProperty(changes, `flags.${MODULE}`)) return;
  // Your turn began and the Reaction came back (Argon itself relights it only at a new round).
  if (foundry.utils.getProperty(changes, `flags.${MODULE}.reaction`) === null && setting("spellPips")) {
    const reaction = mainPanel("DND5E.Reaction");
    if (reaction?.isActionUsed) { reaction.isActionUsed = false; reaction.updateActionUse(); }
  }
  // Follow-ups appear as soon as they are earned (also mid-sequence: Hew after a crit on swing 1);
  // a bar is rebuilt only when what it shows changed. One burst: fullAttackState is worked out once (perf-1).
  stateBurst(() => { refreshAll(); checkBars(actor); recheckSlots(actor); });
};

/** Nick spent leaves the Bonus bar's buttons unchanged, so its off-hand slot is re-checked on its own. */
function recheckSlots(actor) {
  try {
    const bonus = mainPanel("DND5E.BonusAction");
    if (bonus && setting("followUps")) hideDuplicateSlots(bonus, bonusFollowUps(actor, bonus), actor);
  } catch (err) { log.debug("off-hand slot re-check (the next render re-checks)", err); }
}

// The last swing's flag write can land after the sequence ended; re-check once it has.
const onSequenceEnd = (actor) => {
  if (!actor || actor !== ui.ARGON?._actor) return;
  turnSettled(actor).then(() => stateBurst(() => { refreshAll(); checkBars(actor); recheckSlots(actor); }));
};

const onCombatUpdated = (combat, changes) => {
  if (!("turn" in changes) && !("round" in changes)) return;
  // combat-riders-29: the session maps' stale entries go at each turn change.
  pruneRiders();
  pruneRolls();
  // The turn moved on under a running or paused sequence: its remaining swings belong to that turn.
  const r = running();
  if (r?.actor) { const c = combatContext(r.actor); if (c.inCombat && !c.isOwnTurn) abortFor(r.actor); }
  const actor = ui.ARGON?._actor;
  if (!actor) return;
  stateBurst(() => { refreshAll(); checkBars(actor); });
};

// Combat over (in-combat → nocombat key, "New turn" may appear); a weapon equipped or a Focus Point
// spent elsewhere (follow-ups depend on both).
const onCombatDeleted = () => { const a = ui.ARGON?._actor; if (a) setTimeout(() => { refreshAll(); checkBars(a); }, core.DELAYS.afterArgon); };
const onItemUpdated = (item) => { const a = ui.ARGON?._actor; if (a && item?.parent === a) checkBars(a); };
// Reckless on/off (from our toggle, the sheet, or its expiry at turn start) flips the Special-bar toggle.
const onEffectChanged = (effect) => { const a = ui.ARGON?._actor; if (a && effect?.parent === a) checkBars(a); };

// Pole Strike inside Argon's "Use Feature" drawer: gated when the drawer's buttons render.
const onItemButtonRendered = (button, element, actor) => {
  try { gatePoleStrike(button, actor ?? ui.ARGON?._actor); } catch (err) { log.debug("Pole Strike gate", err); }   // never break Argon's render
  try {
    if (!button?._isWeaponSet || !setting("followUps")) return;
    const bonus = mainPanel("DND5E.BonusAction");
    const a = actor ?? ui.ARGON?._actor;
    if (!bonus || !a || !bonus._buttons?.includes(button)) return;
    hideDuplicateSlots(bonus, bonusFollowUps(a, bonus), a);
  } catch (err) { log.debug("off-hand slot check", err); }   // never break Argon's render
};

// A shift or revert (a new body) of the running creature's own token ends its sequence (edge-2).
const onTokenUpdated = (doc, changes) => {
  const r = running();
  if (!r || !("actorId" in (changes ?? {})) || !r.tokenIds?.has(doc?.id)) return;
  abortFor(r.actor);
};

/* ── install ─────────────────────────────────────────────────────────────── */

const opts = label => ({ label });   // guarded (S11, D-c1): a throw is logged with the label; return values pass through

export function install(reg) {
  wireButtons({ rerender });
  // hot: composition reads the HUD's actor and its items only (no world iteration)
  reg.on("renderActionPanelArgonComponent", onPanelRendered, opts("compose the bars"));
  reg.on("updateActor", onActorUpdated, opts("bars: turn flag"));
  reg.on("pentarynCombat.sequenceEnd", onSequenceEnd, opts("bars: sequence ended"));
  reg.on("updateCombat", onCombatUpdated, opts("bars: turn moved"));
  reg.on("deleteCombat", onCombatDeleted, opts("bars: combat over"));
  reg.on("updateItem", onItemUpdated, opts("bars: item changed"));
  for (const hook of ["createActiveEffect", "deleteActiveEffect", "updateActiveEffect"]) {
    reg.on(hook, onEffectChanged, opts("bars: effect changed"));
  }
  // The pip listeners stay on the legacy event names until core HOOKS' `until` (pentaryn-combat
  // 0.4.0): emit fires both names, so each runs once; outside listeners get the new name first.
  reg.on("pentarynCombat.usage", onUsage, opts("pips: a sequence used the item"));
  reg.on("pentarynCombat.bonusSpent", onBonusSpent, opts("pips: Bonus spent"));
  reg.on("pentarynCombat.bonusAction", onBonusAction, opts("pips: Bonus action"));
  reg.on("pentarynCombat.otherAction", onOtherAction, opts("pips: other Action"));
  reg.on("pentarynCombat.reaction", onReaction, opts("pips: Reaction"));
  // hot: restorePips reads the HUD's actor flags only
  reg.on("renderActionPanelArgonComponent", onPanelRenderedPips, opts("pips: repaint on render"));
  reg.on("updateCombat", onRoundPips, opts("pips: repaint at a new round"));
  reg.on("pentarynCombat.offhand", onOffhand, opts("pips: off-hand by hand gives the Action back"));
  reg.on("renderItemButtonArgonComponent", onItemButtonRendered, opts("Argon item buttons: Pole Strike gate, duplicate slot"));
  reg.on("updateToken", onTokenUpdated, opts("a shape change ends a running sequence"));
}

export function uninstall() {
  queued = null;
  liveButtons.clear();
}
