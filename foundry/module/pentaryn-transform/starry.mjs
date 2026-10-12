/**
 * Pentaryn Transform — FEATURE: Starry Form (Circle of the Stars), the hooks. The rule, the effect and
 * the light live in starry-adapter.mjs, the sheet route's dialog in starry-dialog.mjs. Installed by
 * hud.mjs (esmodules[1]) right before the HUD panels, where its hooks always registered.
 */

import { MODULE, starryBlock, canRunAny } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { isRunner, refund } from "./wildshape-adapter.mjs";
import { claimed } from "./claim-adapter.mjs";
import {
  STARRY_EFFECT_ID, starryItem, wildShapeItemOf, isStarryConsume, activeStarry, constellationOf, tickStarry,
  setLight, applyStarry, BLOCKS, assumeStarry, endStarry, endStarryEffect, announceStarryOn
} from "./starry-adapter.mjs";
import { pickConstellation } from "./starry-dialog.mjs";
import { STARRY_ROWS } from "./api-manifest.mjs";

const log = makeLog(MODULE);

/* ── the sheet route: Starry Form → Consume Wild Shape ───────────────────── */

function onSheetPreUse(activity, usageConfig, dialogConfig, messageConfig) {
  if (!isStarryConsume(activity)) return;
  const actor = activity.actor;
  const why = starryBlock({ shifted: !!actor?.isPolymorphed, incapacitated: !!actor?.statuses?.has("incapacitated"), spends: false });
  if (why) {
    ui.notifications.warn(_loc(BLOCKS[why], { name: actor?.name ?? "?" }));
    return false;
  }
  messageConfig.create = false;                   // no card with effects to apply by hand
}

function onSheetPostUse(activity, usageConfig) {
  if (!isStarryConsume(activity) || usageConfig?.pentaryn?.starry) return;
  const actor = activity.actor;
  pickConstellation(actor).then(async c => {
    if (!c) return refund(actor, wildShapeItemOf(actor));   // closed: the use comes back
    await applyStarry(actor, c);
    announceStarryOn(actor, c);
  }).catch(err => log.error("starry form failed", err));
}

/* ── ending without a click ──────────────────────────────────────────────── */

// `effect`: the form the caller already looked up (perf-2), else it is looked up here.
function maybeEnd(actor, reason, effect = actor ? activeStarry(actor) : null) {
  if (!effect || !isRunner(actor)) return;
  // One tab of the runner user ends it (transform-core-async-2, [declared]); endStarryEffect re-checks.
  claimed(effect, "end", () => endStarryEffect(actor, effect, { reason })).catch(err => log.warn("ending starry form failed", err));
}

// Incapacitated (or anything that implies it).
function onEffectChange(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !activeStarry(actor)) return;
  setTimeout(() => { if (actor.statuses?.has("incapacitated")) maybeEnd(actor, "incapacitated"); }, 0);
}
function onEffectUpdate(effect, changes) {
  if (effect.id === STARRY_EFFECT_ID && foundry.utils.getProperty(changes, "duration.expired") === true) {
    maybeEnd(effect.parent, "expired");
    return;
  }
  onEffectChange(effect);
}

// However it went (dismissed, expired, right-clicked off the HUD, deleted on the sheet): the light goes.
function onStarryDelete(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !effect.getFlag?.(MODULE, "starry") || !isRunner(actor)) return;
  if (activeStarry(actor)) return;
  setLight(starryItem(actor), false).catch(err => log.warn("starry light off failed", err));
}

// 10 minutes of combat time (D8, Joe's ruling): out of combat there are no turns to track, so the form
// stays on; in combat the clock's advance counts down, for every druid in a started combat — a linked
// one and an unlinked token druid alike (a combatant's actor is the token's own).
function onWorldTime(worldTime, dt) {
  // hot: no cache — only started combats' combatants, and only on a client that can be the runner (-2).
  if (!canRunAny({ activeGMId: game.users.activeGM?.id ?? null, selfId: game.user.id })) return;
  const seen = new Set();
  for (const combat of game.combats ?? []) {
    if (!combat?.started) continue;
    for (const combatant of combat.combatants ?? []) {
      const actor = combatant?.actor;
      if (!actor || seen.has(actor.uuid)) continue;   // one druid, two tokens in the fight: counted once
      seen.add(actor.uuid);
      const effect = activeStarry(actor);             // perf-2: the one lookup this tick, handed down
      if (!effect || !isRunner(actor)) continue;
      // Unclaimed: two tabs of the runner write the same time left; the ending itself is claimed.
      tickStarry(actor, dt, effect)
        .then(done => { if (done === "expired") maybeEnd(actor, "expired", effect); })
        .catch(err => log.warn("starry form timing failed", err));
    }
  }
}

// A Long Rest is far longer than 10 minutes; the light must not survive it.
function onRestCompleted(actor, result, config) {
  if (config?.type === "long" && activeStarry(actor) && actor.isOwner) {
    endStarry(actor, { quiet: true }).catch(err => log.warn("ending starry form failed", err));
  }
}

export function install(reg) {
  reg.on("dnd5e.preUseActivity", onSheetPreUse, { label: "dnd5e.preUseActivity: Starry Form sheet route" });
  reg.on("dnd5e.postUseActivity", onSheetPostUse, { label: "dnd5e.postUseActivity: Starry Form sheet route" });
  reg.on("createActiveEffect", onEffectChange, { label: "createActiveEffect: incapacitated ends Starry Form" });
  reg.on("updateActiveEffect", onEffectUpdate, { label: "updateActiveEffect: Starry Form expired / incapacitated" });
  reg.on("deleteActiveEffect", onStarryDelete, { label: "deleteActiveEffect: the starlight goes" });
  reg.on("updateWorldTime", onWorldTime, { label: "updateWorldTime: Starry Form expiry" });
  reg.on("dnd5e.restCompleted", onRestCompleted, { label: "dnd5e.restCompleted: a Long Rest ends Starry Form" });
  // game.pentaryn.transform.starry: built into the one frozen API (transform-creatures-16).
  return {
    rows: STARRY_ROWS,
    impl: { "starry.assume": assumeStarry, "starry.end": endStarry, "starry.active": activeStarry, "starry.constellation": constellationOf }
  };
}

export function uninstall() {}
