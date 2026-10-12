// Pentaryn Transform — Starry Form (Circle of the Stars) as one HUD click.
//
// PHB 2024: "As a Bonus Action, you can expend a use of your Wild Shape feature to take on a starry
// form rather than shape-shifting … Bright Light in a 10-foot radius and Dim Light for an additional
// 10 feet. The form lasts for 10 minutes. It ends early if you dismiss it (no action required), have
// the Incapacitated condition, or use this feature again." Twinkling Constellations (level 10): the
// dice become 2d8, the Dragon gives Fly 20 and hover, and "at the start of each of your turns while
// in your Starry Form, you can change which constellation glimmers on your body".
//
// The PHB item ships a "Consume Wild Shape" activity whose card lists three effects to apply by
// hand. Here one click on a constellation spends the use through that activity (no dialog, no card)
// and puts one effect on the druid: "Starry Form: Archer", timed 10 minutes, carrying the Dragon's
// roll floors (and Twinkling's flight) when the Dragon is chosen. The light is the feature item's
// flags.pentaryn-senses.light while the form lasts — pentaryn-senses' carried-light path writes it
// to every token of the druid and puts any hand-set light back afterwards.

import {
  MODULE_ID, activitiesOf, isWildShapeActivity, usesLeft, formatDuration, CONSTELLATIONS, STARRY_LIGHT,
  STARRY_SECONDS, constellationOfActivity, starryEffectData, starryBlock, grantsFly
} from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { say, isRunner, markBonusUsed } from "./transform.mjs";

const log = makeLog(MODULE_ID);

/** The druid's Starry Form effect. Static, 16 characters. */
export const STARRY_EFFECT_ID = "pentarynStarry00";

const SENSES = "pentaryn-senses";

/* ── lookups ─────────────────────────────────────────────────────────────── */

const byIdentifier = (actor, ident, name) =>
  actor?.items?.find(i => i.system?.identifier === ident) ?? actor?.items?.find(i => i.name === name) ?? null;

/** The Starry Form feature on this actor, or null. */
export function starryItem(actor) {
  return byIdentifier(actor, "starry-form", "Starry Form");
}

/** The Wild Shape item whose uses Starry Form spends. */
export function wildShapeItemOf(actor) {
  return actor?.items?.find(i => activitiesOf(i).some(isWildShapeActivity)) ?? null;
}

/** True when the druid has Twinkling Constellations (free constellation change, Dragon flight). */
export function hasTwinkling(actor) {
  return !!byIdentifier(actor, "twinkling-constellations", "Twinkling Constellations");
}

/** True for the activity that spends the Wild Shape use ("Consume Wild Shape"). */
export function isStarryConsume(activity) {
  if (!activity || constellationOfActivity(activity)) return false;
  // By id: dnd5e hands the hooks a clone of the item (and activity) while it is being used.
  const item = activity.item;
  if (!item?.id || item.id !== starryItem(item.actor)?.id) return false;
  return (activity.consumption?.targets ?? []).some(t => t?.type === "itemUses");
}

function consumeActivity(item) {
  return activitiesOf(item).find(isStarryConsume) ?? null;
}

/** The Archer / Chalice / Dragon activity of the feature. */
export function constellationActivity(actor, constellation) {
  return activitiesOf(starryItem(actor)).find(a => constellationOfActivity(a) === constellation) ?? null;
}

/** The druid's live Starry Form effect, or null. */
export function activeStarry(actor) {
  if (!actor?.effects) return null;
  return actor.effects.get(STARRY_EFFECT_ID)
    ?? actor.effects.find(e => e.getFlag?.(MODULE_ID, "starry")) ?? null;
}

/** "archer" | "chalice" | "dragon" | null. */
export function constellationOf(actor) {
  return activeStarry(actor)?.getFlag(MODULE_ID, "starry")?.constellation ?? null;
}

/** Seconds left on the form, or null. */
export function starrySecondsLeft(actor) {
  const e = activeStarry(actor);
  const start = e?.start?.time ?? e?._source?.start?.time;
  const secs = e?._source?.duration?.value;
  if (!Number.isFinite(start) || !Number.isFinite(secs)) return null;
  return start + secs - game.time.worldTime;
}

export const constellationLabel = c => _loc(`PENTARYN_TRANSFORM.Starry.${c[0].toUpperCase()}${c.slice(1)}`);

const IMG = {
  archer: "icons/weapons/bows/bow-ornamental-gold-blue.webp",
  chalice: "icons/magic/holy/chalice-glowing-yellow-blue.webp",
  dragon: "icons/creatures/reptiles/dragon-winged-blue.webp"
};

/** The constellation's picture: the activity's own image if someone set one, else a fixed one. */
export function constellationImg(actor, c) {
  const img = constellationActivity(actor, c)?.img;
  const generic = !img || img.includes("mystery-man") || img.startsWith("systems/dnd5e/icons/svg/activity");
  return generic ? (IMG[c] ?? starryItem(actor)?.img) : img;
}

const firstLabel = arr => (Array.isArray(arr) ? arr : []).map(d => d.label ?? d.formula).filter(Boolean).join(" + ");

/** One line on what the constellation does for this druid, with their numbers. */
export function constellationText(actor, c) {
  const a = constellationActivity(actor, c);
  if (c === "archer") {
    return _loc("PENTARYN_TRANSFORM.Starry.ArcherText", {
      toHit: a?.labels?.toHit ?? "", damage: firstLabel(a?.labels?.damage) || "1d8 Radiant"
    });
  }
  if (c === "chalice") {
    return _loc("PENTARYN_TRANSFORM.Starry.ChaliceText", { heal: firstLabel(a?.labels?.damage) || "1d8" });
  }
  return _loc("PENTARYN_TRANSFORM.Starry.DragonText") + (hasTwinkling(actor) ? ` ${_loc("PENTARYN_TRANSFORM.Starry.DragonFly")}` : "");
}

/** The item effect whose changes the constellation brings (the Dragon's floors), or the bare one. */
function baseEffect(item, c, twinkling) {
  const effects = item?.effects?.contents ?? [];
  if (c === "dragon") {
    const dragons = effects.filter(e => /dragon/i.test(e.name));
    return (twinkling ? dragons.find(grantsFly) : dragons.find(e => !grantsFly(e))) ?? dragons[0] ?? null;
  }
  return effects.find(e => /^starry form$/i.test(e.name)) ?? null;
}

/* ── putting the form on and off ─────────────────────────────────────────── */

const sensesActive = () => !!game.modules.get(SENSES)?.active;

async function setLight(item, on) {
  if (!item || !sensesActive()) return;
  const has = !!item.getFlag(SENSES, "light");
  if (on && !has) await item.setFlag(SENSES, "light", foundry.utils.deepClone(STARRY_LIGHT));
  else if (!on && has) await item.unsetFlag(SENSES, "light");
}

/** Put the constellation's effect on the druid: a fresh 10 minutes, or (keepTime) the time left. */
async function applyStarry(actor, c, { keepTime = false } = {}) {
  const item = starryItem(actor);
  const twinkling = hasTwinkling(actor);
  const base = baseEffect(item, c, twinkling)?.toObject() ?? null;
  const current = activeStarry(actor);
  const now = game.time.worldTime;
  const start = keepTime ? (current?._source?.start?.time ?? now) : now;
  const label = constellationLabel(c);
  const ends = _loc("PENTARYN_TRANSFORM.Starry.Ends");
  const data = starryEffectData({
    base, constellation: c, label, img: constellationImg(actor, c), now: start, seconds: STARRY_SECONDS,
    description: `<p>${constellationText(actor, c)}</p><p>${ends}</p>`, origin: item?.uuid, id: STARRY_EFFECT_ID
  });
  if (current) {
    const update = foundry.utils.deepClone(data);
    delete update._id;
    await current.update({ ...update, _id: current.id }, { diff: false, recursive: false });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [data], { keepId: true });
  }
  await setLight(item, true);
}

const BLOCKS = {
  shifted: "PENTARYN_TRANSFORM.Starry.BlockShifted",
  incapacitated: "PENTARYN_TRANSFORM.Block.Incapacitated",
  noUses: "PENTARYN_TRANSFORM.NoUses"
};

const busy = new Set();

/**
 * Take on the starry form with this constellation (the HUD's entry point). Spends a Wild Shape use,
 * unless the form is already up and the druid has Twinkling Constellations: then the constellation
 * just changes (the rule allows it at the start of each of the druid's turns).
 *
 * @returns {Promise<boolean>}  whether the form is now up with that constellation
 */
export async function assumeStarry(actor, constellation) {
  if (!CONSTELLATIONS.includes(constellation) || !actor) return false;
  const item = starryItem(actor);
  const act = consumeActivity(item);
  if (!item || !act) {
    ui.notifications.warn(_loc("PENTARYN_TRANSFORM.Starry.None", { name: actor.name }));
    return false;
  }
  if (busy.has(actor.uuid)) return false;
  busy.add(actor.uuid);
  try {
    const current = constellationOf(actor);
    if (current === constellation) return true;
    const free = !!current && hasTwinkling(actor);
    const ws = wildShapeItemOf(actor);
    const why = starryBlock({
      shifted: !!actor.isPolymorphed, incapacitated: !!actor.statuses?.has("incapacitated"),
      usesLeft: usesLeft(ws?.system?.uses), spends: !free
    });
    if (why) {
      ui.notifications.warn(_loc(BLOCKS[why], { name: actor.name }));
      return false;
    }
    if (free) {
      await applyStarry(actor, constellation, { keepTime: true });
      say(actor, _loc("PENTARYN_TRANSFORM.Chat.StarrySwap", { name: actor.name, constellation: constellationLabel(constellation) }));
      return true;
    }
    const used = await act.use(
      { consume: { resources: true }, pentaryn: { starry: constellation } },
      { configure: false },
      { create: false }
    );
    if (!used) return false;
    markBonusUsed(actor);
    await applyStarry(actor, constellation);
    const uses = wildShapeItemOf(actor)?.system?.uses;
    say(actor, _loc("PENTARYN_TRANSFORM.Chat.StarryOn", {
      name: actor.name, constellation: constellationLabel(constellation),
      left: usesLeft(uses) ?? 0, max: uses?.max ?? 0, duration: formatDuration(STARRY_SECONDS)
    }));
    return true;
  } finally {
    busy.delete(actor.uuid);
  }
}

/** Dismiss the starry form (no action required). */
export async function endStarry(actor, { quiet = false, reason = "manual" } = {}) {
  const effect = activeStarry(actor);
  if (!effect) return false;
  await effect.delete();
  if (!quiet) {
    const key = reason === "incapacitated" ? "StarryIncapacitated" : (reason === "expired" ? "StarryExpired" : "StarryEnd");
    say(actor, _loc(`PENTARYN_TRANSFORM.Chat.${key}`, { name: actor.name }));
  }
  return true;
}

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
      const spent = ws?.system?.uses?.spent;
      if (Number.isFinite(spent) && spent > 0) await ws.update({ "system.uses.spent": spent - 1 });
      return;
    }
    await applyStarry(actor, c);
    const uses = wildShapeItemOf(actor)?.system?.uses;
    say(actor, _loc("PENTARYN_TRANSFORM.Chat.StarryOn", {
      name: actor.name, constellation: constellationLabel(c),
      left: usesLeft(uses) ?? 0, max: uses?.max ?? 0, duration: formatDuration(STARRY_SECONDS)
    }));
  }).catch(err => log.error("starry form failed", err));
});

/** Three buttons, one per constellation. Resolves to the choice, or null when closed. */
async function pickConstellation(actor) {
  const DialogV2 = foundry.applications.api.DialogV2;
  return DialogV2.wait({
    window: { title: _loc("PENTARYN_TRANSFORM.Starry.Pick") },
    content: `<div class="pentaryn-starry-pick">${CONSTELLATIONS.map(c =>
      `<p><strong>${constellationLabel(c)}.</strong> ${constellationText(actor, c)}</p>`).join("")}</div>`,
    buttons: CONSTELLATIONS.map((c, i) => ({ action: c, label: constellationLabel(c), default: i === 0 })),
    rejectClose: false
  }).catch(err => {
    log.debug("constellation dialog failed", { actor: actor?.uuid ?? null }, err);
    return null;
  });
}

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
