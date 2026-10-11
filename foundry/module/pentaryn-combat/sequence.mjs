/**
 * The swing loop: one Full Attack (or follow-up) = one usage card per item, then one native
 * `rollAttack` per swing, each threaded under its usage card (`system.origin`) — so pentaryn-aoe's
 * auto-damage, the crit from that swing's d20 and the card's own Damage button all work per swing
 * with no custom card code.
 *
 * Every roll goes through dnd5e's own dialog and `Roll#evaluate`: a player on Manual dice gets the
 * RollResolver per swing. `configure:false` (quick mode) skips the dialog, never the resolver.
 *
 * Closing a swing's dialog PAUSES the sequence (the strip offers Resume / Retarget / another weapon /
 * Stop). Esc while paused stops it. Swings not rolled stay on the Action pips, so a player can stop
 * and click a weapon or a cantrip by hand.
 */

import * as core from "./combat-core.mjs";
import { attackActivityOf, weaponsOf, weaponShape, updateTurn, focusLeft, flurryActivity, unarmedStrike, turnOf } from "./shapes.mjs";
import * as strip from "./strip.mjs";
import { quickMode } from "./settings.mjs";

const MOD = core.MOD;
const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));

let current = null;            // the running sequence on this client (one at a time)
let tag = null;                // { activityUuid, kind } for the attack roll in flight

/**
 * A kind announced for this activity's NEXT attack roll by a button outside the sequence (the
 * Reaction bar's Opportunity Attack). dnd5e starts that roll after `activity.use()` returns, without
 * awaiting it, so a tag around the click would be gone by then. Read (and dropped) in
 * dnd5e.preRollAttackV2; stale after two minutes.
 */
const expected = new Map();     // activityUuid → { kind, at }

export function expectRoll(activityUuid, kind) {
  if (activityUuid) expected.set(activityUuid, { kind, at: Date.now() });
}

export function forgetRoll(activityUuid) {
  expected.delete(activityUuid);
}

/** The kind our sequence (or an expectRoll) assigned to the attack roll now in flight for this activity, if any. */
export function taggedKind(activityUuid) {
  if (tag && tag.activityUuid === activityUuid) return tag.kind;
  const e = expected.get(activityUuid);
  if (e && Date.now() - e.at < 120000) return e.kind;
  return null;
}

export function running() {
  return current;
}

/* ── targets ─────────────────────────────────────────────────────────────── */

let picker = null;   // hud.mjs registers Argon's target picker here

export function registerTargetPicker(fn) {
  picker = fn;
}

/** Ask for a target: Argon's picker when the HUD registered one, else the next targetToken. */
async function pickTarget(activity) {
  // The registered picker returns undefined when it can't run (Argon's picker switched off).
  if (picker) {
    try {
      const r = await picker(activity);
      if (r !== undefined) return r;
    } catch (err) { console.warn(`${MOD} | Argon target picker failed`, err); }
  }
  return new Promise(resolve => {
    ui.notifications.info(T("PENTARYN_COMBAT.Strip.PickTarget"));
    const id = Hooks.on("targetToken", (user, token, targeted) => {
      if (user !== game.user || !targeted) return;
      Hooks.off("targetToken", id);
      resolve(true);
    });
    strip.onceCancel(() => { Hooks.off("targetToken", id); resolve(false); });
  });
}

/** Put the targets back as they were (Argon's picker clears them before a pick that was then cancelled). */
function restoreTargets(before) {
  try {
    const now = [...game.user.targets];
    if (now.length === before.length && now.every(t => before.includes(t))) return;
    const ids = before.filter(t => t?.document && t.scene?.id === canvas.scene?.id).map(t => t.id);
    if (canvas.tokens?.setTargets) canvas.tokens.setTargets(ids, { mode: "replace" });
    else before.forEach((t, i) => t.setTarget(true, { releaseOthers: i === 0 }));
  } catch (err) { console.warn(`${MOD} | target restore failed`, err); }
}

function targetName() {
  const t = game.user.targets.first?.() ?? [...game.user.targets][0];
  if (!t) return null;
  const n = game.user.targets.size;
  return n > 1 ? T("PENTARYN_COMBAT.Strip.Targets", { n }) : t.name;
}

/* ── keeping swing → damage → swing in order ─────────────────────────────── */
// pentaryn-aoe's auto-damage starts inside rollAttack's postRollAttack hook and is not awaited by
// it. For a player on Manual dice the next swing's d20 resolver would open on top of this swing's
// damage resolver. So after each swing the loop waits for that damage roll to finish (its
// dnd5e.rollDamageV2), or for no RollResolver to be open (a cancelled resolver fires no hook).

function resolverOpen() {
  const R = foundry.applications?.dice?.RollResolver;
  if (!R) return false;
  for (const app of foundry.applications.instances?.values?.() ?? []) if (app instanceof R) return true;
  return false;
}

function watchDamage(activity) {
  const w = { started: false, done: false };
  const pre = Hooks.on("dnd5e.preRollDamageV2", (config) => { if (config?.subject?.uuid === activity.uuid) w.started = true; });
  const post = Hooks.on("dnd5e.rollDamageV2", (rolls, { subject } = {}) => { if (subject?.uuid === activity.uuid) w.done = true; });
  w.stop = () => { Hooks.off("dnd5e.preRollDamageV2", pre); Hooks.off("dnd5e.rollDamageV2", post); };
  return w;
}

async function settleDamage(w, { limitMs = 120000 } = {}) {
  try {
    if (!w.started) return;
    const t0 = Date.now();
    let idle = 0;
    while (!w.done && Date.now() - t0 < limitMs && !current?.abort) {
      await new Promise(r => setTimeout(r, 150));
      idle = resolverOpen() ? 0 : idle + 1;
      if (idle >= 4 && Date.now() - t0 > 600) break;   // nothing to wait on: no resolver, ~0.6 s gone
    }
  } finally {
    w.stop();
  }
}

/* ── the loop ────────────────────────────────────────────────────────────── */

/**
 * The Nick swing a swap's new main weapon earns (Area 10: swapping onto the Dagger kept the planned
 * "Nick: Dagger" swing, three Dagger swings). null = keep the old plan (a Multiattack sequence).
 */
function swapExtras(actor, weaponId) {
  try {
    const weapons = weaponsOf(actor);
    const main = weapons.find(w => w.id === weaponId);
    if (!main) return null;
    return core.extraSwings({ main, weapons, turn: turnOf(actor), enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") });
  } catch { return null; }
}

function stripContext() {
  const s = current.state;
  const swing = s.swings[Math.min(s.index, s.swings.length - 1)];
  const item = current.actor.items.get(swing?.weaponId);
  return {
    numbers: core.stripNumbers(s),
    status: s.status,
    adv: s.adv,
    weapon: item?.name ?? "—",
    kind: swing?.kind ?? "main",
    target: targetName(),
    quick: quickMode(),
    title: current.title,
    // What a closed roll leaves unspent (Flurry's Focus is already paid).
    note: core.pausedNote({ kinds: s.swings.map(x => x.kind), paid: current.paid }),
    weapons: current.swappable ? weaponsOf(current.actor).filter(core.canSwing).map(w => swapTile(current.actor, w)) : []
  };
}

/** A pause-bar weapon tile: name, icon and what it does ("+6 · 1d8 + 3 Slashing"). */
function swapTile(actor, w) {
  let stats = "";
  try {
    const act = attackActivityOf(actor.items.get(w.id));
    const dmg = act?.labels?.damage ?? act?.labels?.damages ?? [];
    const damage = (Array.isArray(dmg) ? dmg : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ");
    stats = [act?.labels?.toHit ?? "", damage].filter(Boolean).join(" · ");
  } catch { /* the name alone */ }
  return { id: w.id, name: w.name, img: w.img, stats };
}

function render() {
  if (current) strip.update(stripContext());
}

/**
 * Run a list of swings for an actor.
 * @param {Actor} actor
 * @param {{weaponId, mode, kind}[]} swings
 * @param {object} [opts]
 * @param {Event} [opts.event]       the click that started it (dnd5e's skip-dialog keys apply to swing 1)
 * @param {string} [opts.title]      the strip's heading ("Full Attack", "Flurry of Blows" …)
 * @param {Map} [opts.origins]       itemId → usage message id already posted (Flurry's card)
 * @param {boolean} [opts.swappable=true]
 * @param {boolean} [opts.paid=false]  a cost was already paid before swing 1 (Flurry's Focus Point)
 * @returns {Promise<{rolled: number, status: string}>}
 */
export async function runSwings(actor, swings, { event = null, title = null, origins = null, swappable = true, paid = false } = {}) {
  if (current) {
    ui.notifications.warn(T("PENTARYN_COMBAT.Strip.AlreadyRunning"));
    return { rolled: 0, status: "busy" };
  }
  if (!actor?.isOwner || !swings?.length) return { rolled: 0, status: "done" };

  // A modifier key on the click (dnd5e's fast-forward keys) carries to every swing of this sequence.
  const keyed = !!(event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey));
  current = {
    actor,
    state: core.sequenceReducer(null, { type: "start", swings }),
    origins: new Map(origins ?? []),
    title: title ?? T("PENTARYN_COMBAT.FullAttack"),
    swappable,
    paid,
    abort: false,
    lastAdv: null
  };
  const dispatch = (action) => { current.state = core.sequenceReducer(current.state, action); render(); };
  strip.show(stripContext(), {
    onAdv: (value) => dispatch({ type: "adv", value }),
    onStop: () => { dispatch({ type: "stop" }); strip.choose({ type: "stop" }); },
    onQuick: async (on) => { await game.user.setFlag(MOD, "quick", !!on); render(); }
  });

  try {
    while (current.state.status === "running" || current.state.status === "paused") {
      if (current.abort) { dispatch({ type: "stop" }); break; }

      if (current.state.status === "paused") {
        const choice = await strip.waitChoice(stripContext());
        if (current.abort || !choice || choice.type === "stop") { dispatch({ type: "stop" }); break; }
        if (choice.type === "swap") dispatch({ type: "swap", weaponId: choice.weaponId, extras: swapExtras(actor, choice.weaponId) });
        if (choice.type === "retarget") {
          const swing = current.state.swings[current.state.index];
          const act = attackActivityOf(actor.items.get(swing.weaponId));
          const before = [...game.user.targets];
          strip.picking(true);
          let picked;
          try { picked = await pickTarget(act); } finally { strip.picking(false); }
          if (current.abort || current.state.status === "stopped") continue;
          // Picker cancelled (right-click): stay paused on the old target, don't roll at nobody.
          if (!picked) { restoreTargets(before); render(); continue; }
        }
        if (choice.type === "adv") { dispatch({ type: "adv", value: choice.value }); continue; }
        dispatch({ type: "resume" });
        continue;
      }

      const s = current.state;
      const swing = s.swings[s.index];
      const item = actor.items.get(swing.weaponId);
      const activity = attackActivityOf(item);
      if (!activity) {
        ui.notifications.warn(T("PENTARYN_COMBAT.Strip.NoWeapon"));
        dispatch({ type: "stop" });
        break;
      }

      // One usage card per item: ammo/uses/the action economy go through dnd5e once, no auto roll.
      let origin = current.origins.get(item.id);
      if (!origin) {
        const results = await activity.use({ subsequentActions: false }, { configure: false }, { create: true });
        if (!results) { dispatch({ type: "cancel" }); continue; }
        origin = results.message?.id ?? null;
        current.origins.set(item.id, origin);
        Hooks.callAll("pentarynCombat.usage", activity, swing.kind);
      }

      const first = s.rolled === 0;
      const quick = !first && (quickMode() || keyed);
      const adv = s.adv ?? (quick ? current.lastAdv : null);
      const config = {};
      if (first && event) config.event = event;
      if (swing.mode) config.attackMode = swing.mode;
      else if (String(item.getFlag("dnd5e", `last.${activity.id}.attackMode`) ?? "").endsWith("offhand")) {
        // A main swing never inherits a remembered Offhand (also with offhandModeReset off); any
        // other remembered mode (Thrown, Two-Handed) stays the player's choice.
        const main = core.mainMode(item.system?.attackModes ?? []);
        if (main) config.attackMode = main;
      }
      // Only ever ADD advantage or disadvantage: a false here would erase a condition's own (Prone, Blinded…).
      if (adv) config.rolls = [{ options: { [adv]: true } }];
      const message = {
        data: {
          ...(origin ? { system: { origin } } : {}),
          flags: { [MOD]: { swing: { i: s.index + 1, n: s.swings.length, kind: swing.kind } } }
        }
      };

      render();
      tag = { activityUuid: activity.uuid, kind: swing.kind };
      const dmg = watchDamage(activity);
      let rolls = null;
      try {
        // Swing 1 leaves `configure` unset so dnd5e's fast-forward keys on the Full Attack click
        // (Shift / Alt / Ctrl) can skip its dialog too; an explicit `true` would override them.
        rolls = await activity.rollAttack(config, first ? {} : { configure: !quick }, message);
      } finally {
        tag = null;
      }
      await settleDamage(dmg);
      if (!rolls?.length) { dispatch({ type: "cancel" }); continue; }
      const r = rolls[0];
      current.lastAdv = r.hasAdvantage ? "advantage" : r.hasDisadvantage ? "disadvantage" : null;
      dispatch({ type: "rolled", crit: !!r.isCritical });
    }
    return { rolled: current.state.rolled, status: current.state.status };
  } finally {
    const first = current?.state?.swings?.[0];
    if (first?.kind === "main" && actor.isOwner && actor.items.get(first.weaponId)) {
      actor.setFlag(MOD, "last.weapon", first.weaponId).catch(() => null);
    }
    current = null;
    strip.hide();
    // The bars re-check their follow-ups (Off-hand, Hew, Nick…) once the last swing's flag lands.
    Hooks.callAll("pentarynCombat.sequenceEnd", actor);
  }
}

/** The HUD's token became another body (Wild Shape, revert) — the sequence is stale. */
export function abortFor(actor) {
  if (!current) return;
  if (!actor || current.actor === actor || current.actor?.uuid === actor?.uuid) {
    current.abort = true;
    strip.choose({ type: "stop" });
  }
}

/* ── follow-ups ──────────────────────────────────────────────────────────── */

/**
 * One Bonus-bar (or free) follow-up.
 * @param {Actor} actor
 * @param {{kind: string, weaponId: string, count?: number}} f
 */
export async function runFollowUp(actor, f, { event = null } = {}) {
  const label = T(`PENTARYN_COMBAT.FollowUp.${f.kind}`, { weapon: actor.items.get(f.weaponId)?.name ?? "" });
  if (f.kind === "offhand") {
    const out = await runSwings(actor, [{ weaponId: f.weaponId, mode: "offhand", kind: "offhand" }], { event, title: label, swappable: false });
    return out;
  }
  if (f.kind === "nick") {
    return runSwings(actor, [{ weaponId: f.weaponId, mode: "offhand", kind: "nick" }], { event, title: label, swappable: false });
  }
  if (f.kind === "flurry") {
    const act = flurryActivity(actor);
    const unarmed = unarmedStrike(actor);
    if (!act || !unarmed) return { rolled: 0, status: "missing" };
    if ((focusLeft(actor) ?? 0) < 1) { ui.notifications.warn(T("PENTARYN_COMBAT.FollowUp.NoFocus")); return { rolled: 0, status: "empty" }; }
    // Flurry's own card spends the Focus Point; the strikes thread under it.
    const res = await act.use({ subsequentActions: false }, { configure: false }, { create: true });
    if (!res) return { rolled: 0, status: "cancelled" };
    await updateTurn(actor, t => core.recordFollowUp(t, "flurry"));
    Hooks.callAll("pentarynCombat.bonusSpent", actor, "flurry");
    const n = f.count ?? 2;
    const swings = Array.from({ length: n }, () => ({ weaponId: unarmed.id, mode: null, kind: "bonus" }));
    return runSwings(actor, swings, { event, title: label, origins: new Map([[unarmed.id, res.message?.id]]), swappable: false, paid: true });
  }
  // Pole Strike: the Polearm Master item's own attack activity (its usage card, its 1d4 Bludgeoning).
  if (f.kind === "martial-arts" || f.kind === "hew" || f.kind === "pole-strike") {
    const out = await runSwings(actor, [{ weaponId: f.weaponId, mode: null, kind: "bonus" }], { event, title: label, swappable: false });
    if (out.rolled) {
      await updateTurn(actor, t => core.recordFollowUp(t, f.kind));
      Hooks.callAll("pentarynCombat.bonusSpent", actor, f.kind);
    }
    return out;
  }
  return { rolled: 0, status: "unknown" };
}

/* ── Full Attack ─────────────────────────────────────────────────────────── */

/**
 * The swings a Full Attack would make right now, for the button's badge and for start.
 * @returns {{swings: object[], count: number, left: number, weaponId: string|null}}
 */
export function fullAttackPlan(actor, { weaponId = null, turn = null, inCombat = false, multiattack = null, count = 1, pick = null } = {}) {
  if (multiattack) {
    const plan = pick ? core.multiattackPlan(multiattack, { pick }) : multiattack.plan;
    const total = plan.reduce((s, r) => s + r.count, 0);
    const done = inCombat ? (turn?.attackAction?.swings ?? 0) : 0;
    const swings = inCombat && core.attackActions(turn) === 0 ? [] : core.planSequence({ multiattack: plan, done });
    return { swings, count: total, left: swings.length, weaponId: plan[0]?.itemId ?? null };
  }
  const weapons = weaponsOf(actor);
  const main = weapons.find(w => w.id === weaponId) ?? null;
  const left = core.swingsLeft(count, turn, { inCombat });
  const extras = core.extraSwings({ main, weapons, turn, enhancedDualWielding: !!actor.getFlag?.("dnd5e", "enhancedDualWielding") });
  const swings = left > 0 ? core.planSequence({ weaponId, count: left, extras }) : [];
  return { swings, count, left, weaponId };
}

export { weaponShape };
