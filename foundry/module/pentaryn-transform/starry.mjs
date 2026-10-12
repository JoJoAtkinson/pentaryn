// Pentaryn Transform — Starry Form (Circle of the Stars): the hooks. The rule, the effect and the
// light live in starry-adapter.mjs, the sheet route's dialog in starry-dialog.mjs.

import { MODULE_ID, starryBlock, refundUpdate } from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { isRunner } from "./wildshape-adapter.mjs";
import {
  STARRY_EFFECT_ID, starryItem, wildShapeItemOf, hasTwinkling, isStarryConsume, constellationActivity, activeStarry,
  constellationOf, starrySecondsLeft, constellationLabel, constellationImg, constellationText, setLight, applyStarry,
  BLOCKS, assumeStarry, endStarry, announceStarryOn
} from "./starry-adapter.mjs";
import { pickConstellation } from "./starry-dialog.mjs";

export {
  STARRY_EFFECT_ID, starryItem, wildShapeItemOf, hasTwinkling, isStarryConsume, constellationActivity, activeStarry,
  constellationOf, starrySecondsLeft, constellationLabel, constellationImg, constellationText, assumeStarry, endStarry
};

const log = makeLog(MODULE_ID);

/* ── the sheet route: Starry Form → Consume Wild Shape ───────────────────── */

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
  if (!isStarryConsume(activity)) return;
  const actor = activity.actor;
  const why = starryBlock({ shifted: !!actor?.isPolymorphed, incapacitated: !!actor?.statuses?.has("incapacitated"), spends: false });
  if (why) {
    ui.notifications.warn(_loc(BLOCKS[why], { name: actor?.name ?? "?" }));
    return false;
  }
  messageConfig.create = false;                   // no card with effects to apply by hand
});

Hooks.on("dnd5e.postUseActivity", (activity, usageConfig) => {
  if (!isStarryConsume(activity) || usageConfig?.pentaryn?.starry) return;
  const actor = activity.actor;
  pickConstellation(actor).then(async c => {
    if (!c) {                                     // closed: the use comes back
      const ws = wildShapeItemOf(actor);
      const update = refundUpdate(ws?.system?.uses);
      if (update) await ws.update(update);
      return;
    }
    await applyStarry(actor, c);
    announceStarryOn(actor, c);
  }).catch(err => log.error("starry form failed", err));
});

/* ── ending without a click ──────────────────────────────────────────────── */

function maybeEnd(actor, reason) {
  if (!actor || !activeStarry(actor) || !isRunner(actor)) return;
  endStarry(actor, { reason }).catch(err => log.warn("ending starry form failed", err));
}

// Incapacitated (or anything that implies it).
function onEffectChange(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !activeStarry(actor)) return;
  setTimeout(() => { if (actor.statuses?.has("incapacitated")) maybeEnd(actor, "incapacitated"); }, 0);
}
Hooks.on("createActiveEffect", onEffectChange);
Hooks.on("updateActiveEffect", (effect, changes) => {
  if (effect.id === STARRY_EFFECT_ID && foundry.utils.getProperty(changes, "duration.expired") === true) {
    maybeEnd(effect.parent, "expired");
    return;
  }
  onEffectChange(effect);
});

// However it went (dismissed, expired, right-clicked off the HUD, deleted on the sheet): the light goes.
Hooks.on("deleteActiveEffect", (effect) => {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !effect.getFlag?.(MODULE_ID, "starry") || !isRunner(actor)) return;
  if (activeStarry(actor)) return;
  setLight(starryItem(actor), false).catch(err => log.warn("starry light off failed", err));
});

// 10 minutes of world time.
Hooks.on("updateWorldTime", () => {
  for (const actor of game.actors) {
    if (!activeStarry(actor)) continue;
    const left = starrySecondsLeft(actor);
    if (left !== null && left <= 0) maybeEnd(actor, "expired");
  }
});

// A Long Rest is far longer than 10 minutes; the light must not survive it.
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  if (config?.type === "long" && activeStarry(actor) && actor.isOwner) {
    endStarry(actor, { quiet: true }).catch(err => log.warn("ending starry form failed", err));
  }
});

/* ── API ─────────────────────────────────────────────────────────────────── */

Hooks.once("ready", () => {
  const api = game.pentaryn?.transform;
  if (api && Object.isExtensible(api)) {
    api.starry = { assume: assumeStarry, end: endStarry, active: activeStarry, constellation: constellationOf };
  }
});
