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
 * Stop). Esc while paused stops it. Stop with a swing's dialog open closes it unrolled. Swings not rolled stay on the Action pips, so a player can stop
 * and click a weapon or a cantrip by hand.
 */

import * as core from "./combat-core.mjs";
import { HOOKS, MODULE, VERSION } from "./combat-core.mjs";
import { emitter } from "./lib/hooks.mjs";
import { makeLog } from "./lib/log.mjs";
import { attackActivityOf, weaponsOf, updateTurn, focusLeft, flurryActivity, unarmedStrike, turnOf, damageLabel, rememberWeapon, planFor } from "./shapes.mjs";
import { openRollResolvers, isOrphanCard } from "./dialog-adapter.mjs";
import { cancelWaits, choose, hide, onceCancel, picking, show, update, waitChoice } from "./strip.mjs";
import { quickMode, setQuickMode, setting } from "./settings.mjs";

const log = makeLog(MODULE);

/** The module's events (core HOOKS rows, legacy name too): ctx.emit once installed. */
let emit = emitter(MODULE, HOOKS, { log, version: VERSION });

/**
 * Temporary hooks (one roll, one pick, one dialog) go through the registry the feature was
 * installed with, so uninstall() unwinds a stray one; before install they fall back to Hooks.
 */
let hooks = null;
const temp = {
  on: (name, fn, label) => (hooks ? hooks.on(name, fn, { label }) : Hooks.on(name, fn)),
  off: (name, id) => (hooks ? hooks.off(id) : Hooks.off(name, id)),
};


let current = null;            // the running sequence on this client (one at a time)
let tag = null;                // { activityUuid, kind } for the attack roll in flight

/**
 * A kind announced for this activity's NEXT attack roll by a button outside the sequence (the
 * Reaction bar's Opportunity Attack). dnd5e starts that roll after `activity.use()` returns, without
 * awaiting it, so a tag around the click would be gone by then. Read (and dropped) in
 * dnd5e.preRollAttackV2; stale after two minutes.
 */
const expected = new Map();     // activityUuid → { kind, at }

/** How long an announced roll (expectRoll) stays good: two minutes (combat-core-M5). */
const EXPECT_TTL_MS = 120000;

export function expectRoll(activityUuid, kind) {
  if (activityUuid) expected.set(activityUuid, { kind, at: Date.now() });
}

/** combat-riders-29: forget announced rolls past the two-minute window (taggedKind ignores them). */
export function pruneSession(now = Date.now()) {
  return core.pruneOlder(expected, now, EXPECT_TTL_MS, v => v.at);
}

export function forgetRoll(activityUuid) {
  expected.delete(activityUuid);
}

/** The kind our sequence (or an expectRoll) assigned to the attack roll now in flight for this activity, if any. */
export function taggedKind(activityUuid) {
  if (tag && tag.activityUuid === activityUuid) return tag.kind;
  const e = expected.get(activityUuid);
  if (e && Date.now() - e.at < EXPECT_TTL_MS) return e.kind;
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
    } catch (err) { log.warn("Argon target picker failed", err); }
  }
  return new Promise(resolve => {
    ui.notifications.info(_loc("PENTARYN_COMBAT.Strip.PickTarget"));
    const id = temp.on("targetToken", (user, token, targeted) => {
      if (user !== game.user || !targeted) return;
      temp.off("targetToken", id);
      resolve(true);
    }, "Retarget: wait for a target");
    onceCancel(() => { temp.off("targetToken", id); resolve(false); });
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
  } catch (err) { log.warn("target restore failed", err); }
}

function targetName() {
  const t = game.user.targets.first?.() ?? [...game.user.targets][0];
  if (!t) return null;
  const n = game.user.targets.size;
  return n > 1 ? _loc("PENTARYN_COMBAT.Strip.Targets", { n }) : t.name;
}

/* ── keeping swing → damage → swing in order ─────────────────────────────── */
// pentaryn-aoe's auto-damage starts inside rollAttack's postRollAttack hook and is not awaited by
// it. For a player on Manual dice the next swing's d20 resolver would open on top of this swing's
// damage resolver. So after each swing the loop waits for that damage roll to finish (its
// dnd5e.rollDamageV2), or for no RollResolver to be open (a cancelled resolver fires no hook).

function resolverOpen() {
  return openRollResolvers().length > 0;
}

function watchDamage(activity) {
  const w = { started: false, done: false };
  const pre = temp.on("dnd5e.preRollDamageV2", (config) => { if (config?.subject?.uuid === activity.uuid) w.started = true; }, "swing damage: started");
  const post = temp.on("dnd5e.rollDamageV2", (rolls, { subject } = {}) => { if (subject?.uuid === activity.uuid) w.done = true; }, "swing damage: done");
  w.stop = () => { temp.off("dnd5e.preRollDamageV2", pre); temp.off("dnd5e.rollDamageV2", post); };
  return w;
}

/** The longest a swing waits on its damage roll before the next swing goes (combat-core-M5). */
const DAMAGE_WAIT_MS = 120000;
/** Polls in a row with no RollResolver open before the wait gives up early... */
const IDLE_POLLS = 4;
/** ...and only once this long has passed since the wait began (~0.6 s). */
const IDLE_MIN_MS = 600;

async function settleDamage(w, { limitMs = DAMAGE_WAIT_MS } = {}) {
  try {
    if (!w.started) return;
    const t0 = Date.now();
    let idle = 0;
    while (!w.done && Date.now() - t0 < limitMs && !current?.abort) {
      await new Promise(r => setTimeout(r, core.DELAYS.damagePoll));
      idle = resolverOpen() ? 0 : idle + 1;
      if (idle >= IDLE_POLLS && Date.now() - t0 > IDLE_MIN_MS) break;   // nothing to wait on: no resolver, ~0.6 s gone
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
    stats = [act?.labels?.toHit ?? "", damageLabel(act)].filter(Boolean).join(" · ");
  } catch (err) { log.debug("swap tile stats (the name alone)", err); }
  return { id: w.id, name: w.name, img: w.img, stats };
}

function render() {
  if (current) update(stripContext());
}

/**
 * Stop (or an abort) with this swing's roll window still open closes it unrolled (usability A11:
 * "the sequence ends, no stray dialog"; U-10-11). Only the attack window of the swing in flight —
 * never a damage window or a manual-dice Roll Resolution already being filled in.
 */
function closeSwingWindow() {
  const uuid = tag?.activityUuid;
  if (!uuid) return 0;
  let n = 0;
  for (const app of [...(foundry.applications.instances?.values?.() ?? [])]) {
    if (!app?.element?.classList?.contains("roll-configuration")) continue;
    let subject = null;
    try { subject = app.config?.subject ?? null; } catch { subject = null; }
    if (subject?.uuid !== uuid) continue;
    app.close().catch?.(err => { log.debug("close swing window", err); return null; });
    n++;
  }
  return n;
}

/**
 * A usage card this sequence posted that ended with nothing rolled under it and nothing consumed
 * (Esc on the Nick swing, then Stop: the Dagger card stayed — usability Area 2 re-run). The
 * tidyCancelledAttacks hook keeps such a card while the sequence may still use it; this is the end.
 */
function tidyOrigins(ids) {
  if (!setting("tidyCancelledAttacks")) return;
  for (const id of ids) {
    const msg = id ? game.messages.get(id) : null;
    if (!msg || msg.type !== "usage") continue;
    if (isOrphanCard(msg, { sequence: false })) msg.delete().catch(err => log.warn("tidy usage card", err));
  }
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
    ui.notifications.warn(_loc("PENTARYN_COMBAT.Strip.AlreadyRunning"));
    return { rolled: 0, status: "busy" };
  }
  if (!actor?.isOwner || !swings?.length) return { rolled: 0, status: "done" };

  // A modifier key on the click (dnd5e's fast-forward keys) carries to every swing of this sequence.
  const keyed = !!(event && (event.shiftKey || event.altKey || event.ctrlKey || event.metaKey));
  current = {
    actor,
    // edge-2: the creature's own token(s), so another token's shape change leaves this sequence alone
    tokenIds: new Set([actor.token?.id, ...(actor.getActiveTokens?.() ?? []).map(t => t.id)].filter(Boolean)),
    state: core.sequenceReducer(null, { type: "start", swings }),
    origins: new Map(origins ?? []),
    title: title ?? _loc("PENTARYN_COMBAT.FullAttack"),
    swappable,
    paid,
    abort: false,
    lastAdv: null,
    created: new Set()      // usage cards this sequence posted (Flurry's own card is passed in, not ours)
  };
  const dispatch = (action) => { current.state = core.sequenceReducer(current.state, action); render(); };
  show(stripContext(), {
    onAdv: (value) => dispatch({ type: "adv", value }),
    onStop: () => { dispatch({ type: "stop" }); closeSwingWindow(); choose({ type: "stop" }); },
    onQuick: async (on) => { await setQuickMode(on); render(); }
  });

  try {
    while (current.state.status === "running" || current.state.status === "paused") {
      if (current.abort) { dispatch({ type: "stop" }); break; }

      if (current.state.status === "paused") {
        const choice = await waitChoice(stripContext());
        if (current.abort || !choice || choice.type === "stop") { dispatch({ type: "stop" }); break; }
        if (choice.type === "swap") dispatch({ type: "swap", weaponId: choice.weaponId, extras: swapExtras(actor, choice.weaponId) });
        if (choice.type === "retarget") {
          const swing = current.state.swings[current.state.index];
          const act = attackActivityOf(actor.items.get(swing.weaponId));
          const before = [...game.user.targets];
          picking(true);
          let picked;
          try { picked = await pickTarget(act); } finally { picking(false); }
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
        ui.notifications.warn(_loc("PENTARYN_COMBAT.Strip.NoWeapon"));
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
        if (origin) current.created.add(origin);
        emit("usage", activity, swing.kind);
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
          flags: { [MODULE]: { swing: { i: s.index + 1, n: s.swings.length, kind: swing.kind } } }
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
      // W4-C1 [declared]: Adv / Dis pressed while this swing's window was open is for the NEXT swing
      // (what the strip's hint says); "rolled" clears the toggle, so it is put back for that swing.
      const pressedDuringRoll = current.state.adv && current.state.adv !== s.adv ? current.state.adv : null;
      dispatch({ type: "rolled", crit: !!r.isCritical });
      if (pressedDuringRoll) dispatch({ type: "adv", value: pressedDuringRoll });
    }
    return { rolled: current.state.rolled, status: current.state.status };
  } finally {
    const first = current?.state?.swings?.[0];
    if (first?.kind === "main" && actor.isOwner && actor.items.get(first.weaponId)) {
      rememberWeapon(actor, first.weaponId).catch(err => { log.warn("remember weapon", err); return null; });
    }
    const created = [...(current?.created ?? [])];
    current = null;
    // After dnd5e has posted any last attack (and the tidy hook's own 250 ms look).
    if (created.length) setTimeout(() => { try { tidyOrigins(created); } catch (err) { log.warn("tidy usage card", err); } }, core.DELAYS.tidyAfterSequence);
    hide();
    // The bars re-check their follow-ups (Off-hand, Hew, Nick…) once the last swing's flag lands.
    emit("sequenceEnd", actor);
  }
}

/** The HUD's token became another body (Wild Shape, revert) — the sequence is stale. */
export function abortFor(actor) {
  if (!current) return;
  if (!actor || current.actor === actor || current.actor?.uuid === actor?.uuid) {
    current.abort = true;
    closeSwingWindow();
    choose({ type: "stop" });
    cancelWaits();   // a fallback Retarget wait (pickTarget) settles too
  }
}

/* ── follow-ups ──────────────────────────────────────────────────────────── */

/**
 * One Bonus-bar (or free) follow-up.
 * @param {Actor} actor
 * @param {{kind: string, weaponId: string, count?: number}} f
 */
export async function runFollowUp(actor, f, { event = null } = {}) {
  if (!f || typeof f !== "object") return { rolled: 0, status: "unknown" };   // a console caller's bad argument (combat-core-ROB-6)
  const label = _loc(core.keyFor("FollowUp", f.kind), { weapon: actor.items.get(f.weaponId)?.name ?? "" });
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
    if ((focusLeft(actor) ?? 0) < 1) { ui.notifications.warn(_loc("PENTARYN_COMBAT.FollowUp.NoFocus")); return { rolled: 0, status: "empty" }; }
    // Flurry's own card spends the Focus Point; the strikes thread under it.
    const res = await act.use({ subsequentActions: false }, { configure: false }, { create: true });
    if (!res) return { rolled: 0, status: "cancelled" };
    await updateTurn(actor, t => core.recordFollowUp(t, "flurry"));
    emit("bonusSpent", actor, "flurry");
    const n = f.count ?? 2;
    const swings = Array.from({ length: n }, () => ({ weaponId: unarmed.id, mode: null, kind: "bonus" }));
    return runSwings(actor, swings, { event, title: label, origins: new Map([[unarmed.id, res.message?.id]]), swappable: false, paid: true });
  }
  // Pole Strike: the Polearm Master item's own attack activity (its usage card, its 1d4 Bludgeoning).
  if (f.kind === "martial-arts" || f.kind === "hew" || f.kind === "pole-strike") {
    const out = await runSwings(actor, [{ weaponId: f.weaponId, mode: null, kind: "bonus" }], { event, title: label, swappable: false });
    if (out.rolled) {
      await updateTurn(actor, t => core.recordFollowUp(t, f.kind));
      emit("bonusSpent", actor, f.kind);
    }
    return out;
  }
  return { rolled: 0, status: "unknown" };
}


/* ── install ─────────────────────────────────────────────────────────────── */

/**
 * The runner registers no hook of its own: it keeps the registry for its temporary hooks, exposes
 * `running` (ctx.exposed) and contributes the fullAttack, followUp, running and abort rows' impls.
 */
export function install(reg, ctx) {
  hooks = reg;
  if (ctx?.emit) emit = ctx.emit;
  ctx?.expose?.({ running });
  return { impl: { fullAttack, followUp: runFollowUp, running, abort: abortFor } };
}

/** api.fullAttack: run the plan api.plan would answer. */
async function fullAttack(actor, weaponId, opts = {}) {
  const p = planFor(actor, weaponId, { multiattackOn: setting("multiattack") });
  return runSwings(actor, p.swings, opts);
}

/** A running sequence is stopped (its strip goes, its roll window closes); session maps cleared. */
export function uninstall() {
  if (current) abortFor(null);
  hooks = null;
  expected.clear();
  picker = null;
}

/** The swings a Full Attack would make right now (core.fullAttackPlanFrom with this actor's weapons). */
export { fullAttackPlanOf as fullAttackPlan } from "./shapes.mjs";
