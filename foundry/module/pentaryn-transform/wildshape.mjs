/**
 * Pentaryn Transform — FEATURE: Wild Shape's hooks. Use (shift on the Wild Shape activity, revert on
 * the revert item), shaping the linked form, ending without a click (0 HP, Incapacitated, the
 * duration, world time) and rests. The work is wildshape-adapter.mjs's.
 *
 * Listener order matters (golden/hooks.json): dnd5e.preUseActivity and dnd5e.postUseActivity also
 * have starry.mjs's and hud-panels.mjs's listeners after these.
 */

import { MODULE, EFFECT_ID, isWildShapeActivity, isExpired, pruneFavorites, formTempHP, worldTimeCandidates, canRunAny, handLight } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import {
  isRevertItem, original, wildShapeActivity, isWildShapeForm, exists, activeFormOf, blockedShift, say, RETURN_LINES,
  revert, returnToNormal, endOnDruid, doShift, metaFor, shaping, isRunner, isReverting, pendingMeta, trackShift
} from "./wildshape-adapter.mjs";

const log = makeLog(MODULE);

// A revert this module did not start — the sheet's Restore Transformation, the sidebar's context
// menu, a macro — still says so in chat, as the shift did (PT3-7). dnd5e fires this just before the
// revert, on the reverting client only. revert() marks its form in `reverting` first and posts its
// own line (or stays quiet for Change Form), so each revert gets one line at most.
function onOutsideRevert(actor) {
  try {
    if (!isWildShapeForm(actor) || isReverting(actor.uuid)) return;
    const host = game.actors.get(actor.getFlag("dnd5e", "originalActor"))
      ?? (actor.isToken ? game.actors.get(actor.token?.actorId) : null);
    if (!host) return;                                    // dnd5e warns and does not revert
    const name = (actor.isToken ? actor.token?.getFlag?.("dnd5e", "previousActorData")?.name : null) ?? host.name;
    say(host, _loc(RETURN_LINES.manual, { name }));
  } catch (err) {
    log.warn("chat line failed", err);
  }
}

/* ── dnd5e hooks: use ────────────────────────────────────────────────────── */

function onPreUse(activity, usageConfig, dialogConfig, messageConfig) {
  const actor = activity?.actor;
  if (isRevertItem(activity?.item)) {
    messageConfig.create = false;                         // our one-line message replaces the card
    return;
  }
  if (activity?.type !== "transform") return;
  if (!isWildShapeActivity(activity)) {
    // A transform from inside a transform nests a copy of the copy ("Talo (Badger) (Badger)").
    if (actor?.isPolymorphed) {
      ui.notifications.warn(_loc("PENTARYN_TRANSFORM.AlreadyTransformed", { name: actor.name }));
      return false;
    }
    return;
  }
  // Wild Shape on a form (an unlinked token's form, or one made before 0.2), or on the druid's own
  // sheet while a form is out (the player's character sheet is the druid, not the form): the 2024
  // "use Wild Shape again". Change form the safe way — end the form, then dnd5e's form dialog.
  const form = actor?.isPolymorphed ? actor : activeFormOf(actor);
  if (blockedShift(form ?? actor, activity.item)) return false;
  if (form) {
    revert(form, { quiet: true })
      .then(host => wildShapeActivity(host)?.use({}, {}, { create: false }))
      .catch(err => log.warn("change form failed", err));
    return false;
  }
  messageConfig.create = false;                           // no card: the shift happens on use
}

function onPostUse(activity, usageConfig, results) {
  if (isRevertItem(activity?.item)) {
    returnToNormal(activity.actor);
    return;
  }
  if (!isWildShapeActivity(activity) || activity.actor?.isPolymorphed) return;
  const host = activity.actor;
  const profileId = usageConfig?.transform?.profile;
  const uuid = foundry.utils.getProperty(results?.message ?? {}, "flags.dnd5e.transform.uuid")
    ?? activity.availableProfiles.find(p => p._id === profileId)?.uuid;
  const job = doShift(host, activity, profileId, uuid).catch(err => {
    log.error("shift failed", err);
    return null;
  });
  trackShift(host.uuid, job);
}

/* ── dnd5e hook: shape the form ──────────────────────────────────────────── */

// Linked actors only: dnd5e fires this after its own item/effect filtering, before Actor.create.
function onTransformActor(host, source, d, settings) {
  if (settings?.preset !== "wildshape") return;
  try {
    const meta = pendingMeta(host.uuid) ?? metaFor(host);
    const plan = shaping({ meta, source, items: d.items, effects: d.effects });

    d.items = plan.keep;
    if (plan.stripped.length) {
      log.debug("not carried into the form:", plan.stripped.map(s => `${s.name} (${s.reason})`).join(", "));
      if (Array.isArray(d.system?.favorites)) d.system.favorites = pruneFavorites(d.system.favorites, plan.stripped.map(s => s._id));
    }
    // The revert item reads "Return to Talo" with Talo's portrait; Argon labels from the item.
    for (const r of plan.renames) {
      const item = d.items.find(i => i._id === r._id);
      if (item) Object.assign(item, { name: r.name, img: r.img });
    }
    // The duration effect: what Argon's portrait strip shows while shifted.
    d.effects = (d.effects ?? []).filter(e => e._id !== EFFECT_ID);
    d.effects.push(plan.effect);
    // Temp HP don't stack: dnd5e's preset overwrites the druid's temp HP with the grant (12), so a
    // druid already holding more would lose them. Keep the better of the two.
    const hp = d.system?.attributes?.hp;
    if (hp) hp.temp = formTempHP(host.system?.attributes?.hp?.temp, hp.temp);
    // What the form remembers about itself (the GM sweep, auto-revert and the HUD read this).
    foundry.utils.setProperty(d, `flags.${MODULE}.wildshape`, plan.flag);
  } catch (err) {
    // Never block the transform over the extras.
    log.error("shaping the form failed", err);
  }
}

/* ── the token's own light (light-roundtrip) ─────────────────────────────── */

// dnd5e rebuilds the druid's token from the prototype on revert and merges its own snapshot,
// flags.dnd5e.previousTokenData, over it — but that snapshot holds no light, so a light set by hand on
// the token came back as the prototype's (PT TF-2). On a Wild Shape shift's token swap (this client's
// doShift is in flight for the token's actor) the token's own light joins that snapshot, in the same
// write; every revert path (linked, unlinked, restoreTokensElsewhere) then brings it back. [declared]
function onPreSwapToken(doc, changes) {
  try {
    if (!pendingMeta(doc?.actor?.uuid)) return;
    const prev = foundry.utils.getProperty(changes ?? {}, "flags.dnd5e.previousTokenData");
    if (!prev || typeof prev !== "object" || Object.hasOwn(prev, "light")) return;
    const light = handLight(doc._source ?? doc);
    if (light) prev.light = light;
  } catch (err) {
    log.warn("keeping the token's own light failed", err);
  }
}

/* ── ending without a click ──────────────────────────────────────────────── */

/** End a Wild Shape form on the runner's client, once (the shared path of every automatic ending). */
function maybeAutoRevert(actor, reason) {
  // exists(): the effect-expiry update and the world-time check can both fire for one ending; the
  // second must not run dnd5e's revert again on the already-deleted form.
  if (!exists(actor) || !isWildShapeForm(actor) || isReverting(actor.uuid) || !isRunner(actor)) return;
  revert(actor, { reason }).catch(err => log.warn("auto-revert failed", err));
}

// 0 HP: the 2024 form uses the druid's own HP; at 0 they are Unconscious, so the form ends.
function onZeroHP(actor, changes) {
  if (!foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;
  if ((actor.system.attributes.hp?.value ?? 1) <= 0) maybeAutoRevert(actor, "zeroHP");
}

// Incapacitated (or any condition that implies it). Checked after the effect lands on the actor.
function onEffectChange(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !isWildShapeForm(actor)) return;
  setTimeout(() => {
    if (actor.statuses?.has("incapacitated")) maybeAutoRevert(actor, "incapacitated");
  }, 0);
}
function onEffectUpdate(effect, changes) {
  // Foundry v14's effect registry marks a lapsed duration expired; that is the form running out.
  if (effect.id === EFFECT_ID && foundry.utils.getProperty(changes, "duration.expired") === true) {
    maybeAutoRevert(effect.parent, "expired");
    return;
  }
  onEffectChange(effect);
}
function onEffectDelete(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !exists(actor) || !isWildShapeForm(actor)) return;
  // Deleting the Wild Shape effect (Argon: right-click on it) ends the form.
  if (effect.id === EFFECT_ID) {
    const endsAt = actor.getFlag(MODULE, "wildshape")?.endsAt;
    maybeAutoRevert(actor, isExpired(endsAt, game.time.worldTime) ? "expired" : "manual");
    return;
  }
  // One of the druid's own effects ended in the form — Concentration broken by damage to the beast.
  // End the druid's copy now: dnd5e's dependents registry tracks the druid's copy, not the form's,
  // and otherwise the druid returns still concentrating on a spell that already ended.
  const carried = actor.getFlag(MODULE, "wildshape")?.carried ?? [];
  if (!carried.includes(effect.id) || isReverting(actor.uuid) || !isRunner(actor)) return;
  const host = original(actor);
  if (!host || host === actor) return;                    // a token's form: revert carries it back
  endOnDruid(host, [effect.id])
    .catch(err => log.warn(`ending ${effect.name} on ${host.name} failed`, err));
}

// Duration: the effect registry covers it; this covers time moved while no GM is connected and
// keeps working if a world sets CONFIG.ActiveEffect.expiryAction to something else.
function onWorldTime(worldTime) {
  // hot: no cache — game.actors + the viewed scene's unlinked tokens, every tick, but only on a client
  // that can be the runner: while another user is the active GM nothing here could act (-2).
  if (!canRunAny({ activeGMId: game.users.activeGM?.id ?? null, selfId: game.user.id })) return;
  for (const actor of worldTimeCandidates(game.actors, canvas.scene?.tokens)) {
    if (!isWildShapeForm(actor)) continue;
    if (isExpired(actor.getFlag(MODULE, "wildshape")?.endsAt, worldTime)) maybeAutoRevert(actor, "expired");
  }
}

/* ── rests ───────────────────────────────────────────────────────────────── */

// Marks the druid-side short rest this module starts itself, so it is not redirected again. No dot
// in the key: initiateRest runs the config through mergeObject, which expands dotted keys.
const REST_SYNC = "pentarynTransformRestSync";

// Long Rest while shifted — on the form, or on the druid while a form is out (a party rest
// request lists the druid, not the form): the form ends, then the druid rests. Hooked after the
// rest dialog, so cancelling it leaves the form alone. Without this, a rest on the druid is undone
// at revert, which copies the form's HP and Hit Dice back over it.
function onLongRest(actor, config) {
  const form = isWildShapeForm(actor) ? actor : activeFormOf(actor);
  if (!form) return;
  const { type, ...rest } = config ?? {};
  revert(form, { reason: "longRest" })
    .then(host => host?.longRest({ ...rest, dialog: false }))
    .catch(err => log.warn("long rest after revert failed", err));
  return false;
}

// Short Rest on the druid while a form is out: the form is the body that rests (its HP, its Hit
// Dice, which revert carries back); the druid's own recovery follows from restCompleted below.
function onPreShortRest(actor, config) {
  if (config?.[REST_SYNC]) return;
  const form = activeFormOf(actor);
  if (!form?.isOwner) return;
  const { type, ...rest } = config ?? {};
  form.shortRest(rest).catch(err => log.warn("short rest on the form failed", err));
  return false;
}

// Short Rest while shifted: allowed; the druid regains their one Wild Shape use (it lives on them,
// not on the form). Hit Dice spent on the form come back with the revert's use-sync.
function onRestCompleted(actor, result, config) {
  if (config?.type !== "short" || config?.[REST_SYNC] || !isWildShapeForm(actor)) return;
  const host = original(actor);
  if (!host || host === actor || !host.isOwner) return;   // a token's form rested its own Wild Shape
  host.shortRest({
    dialog: false, chat: false, autoHD: false, advanceTime: false, advanceBastionTurn: false, newDay: false,
    request: config.request,                              // a requested rest passes allowRests = off
    [REST_SYNC]: true
  }).catch(err => log.warn("short rest on the original failed", err));
}

export function install(reg) {
  reg.on("dnd5e.revertOriginalForm", onOutsideRevert, { label: "dnd5e.revertOriginalForm: chat line for an outside revert" });
  reg.on("dnd5e.preUseActivity", onPreUse, { label: "dnd5e.preUseActivity: Wild Shape / revert item" });
  reg.on("dnd5e.postUseActivity", onPostUse, { label: "dnd5e.postUseActivity: shift / revert" });
  reg.on("dnd5e.transformActor", onTransformActor, { label: "dnd5e.transformActor: shape the form" });
  reg.on("preUpdateToken", onPreSwapToken, { label: "preUpdateToken: a shift keeps the token's own light for the revert" });
  reg.on("updateActor", onZeroHP, { label: "updateActor: 0 HP" });
  reg.on("createActiveEffect", onEffectChange, { label: "createActiveEffect: incapacitated" });
  reg.on("updateActiveEffect", onEffectUpdate, { label: "updateActiveEffect: expired / incapacitated" });
  reg.on("deleteActiveEffect", onEffectDelete, { label: "deleteActiveEffect: form effect / carried effect" });
  reg.on("updateWorldTime", onWorldTime, { label: "updateWorldTime: form expiry" });
  reg.on("dnd5e.longRest", onLongRest, { label: "dnd5e.longRest: revert, then rest" });
  reg.on("dnd5e.preShortRest", onPreShortRest, { label: "dnd5e.preShortRest: the form rests" });
  reg.on("dnd5e.restCompleted", onRestCompleted, { label: "dnd5e.restCompleted: the druid's short rest" });
}

export function uninstall() {}
