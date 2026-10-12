/**
 * Pentaryn Transform — ADAPTER: Starry Form (Circle of the Stars) on live documents.
 *
 * PHB 2024: "As a Bonus Action, you can expend a use of your Wild Shape feature to take on a starry
 * form rather than shape-shifting … Bright Light in a 10-foot radius and Dim Light for an additional
 * 10 feet. The form lasts for 10 minutes. It ends early if you dismiss it (no action required), have
 * the Incapacitated condition, or use this feature again." Twinkling Constellations (level 10): the
 * dice become 2d8, the Dragon gives Fly 20 and hover, and "at the start of each of your turns while
 * in your Starry Form, you can change which constellation glimmers on your body".
 *
 * The PHB item ships a "Consume Wild Shape" activity whose card lists three effects to apply by
 * hand. Here one click on a constellation spends the use through that activity (no dialog, no card)
 * and puts one effect on the druid: "Starry Form: Archer", 10 minutes of combat time (D8), carrying the Dragon's
 * roll floors (and Twinkling's flight) when the Dragon is chosen. The light is the feature item's
 * flags.pentaryn-senses.light while the form lasts — pentaryn-senses' carried-light path writes it
 * to every token of the druid and puts any hand-set light back afterwards.
 *
 * Imports wildshape-adapter.mjs (say, markBonusUsed): the Starry actions spend the Wild Shape use and
 * post through the same chat helper (test/graph-allow.json). The hooks are starry.mjs's.
 */

import {
  MODULE, activitiesOf, usesLeft, formatDuration, CONSTELLATIONS, STARRY_LIGHT, STARRY_SECONDS,
  constellationOfActivity, starryEffectData, starryBlock, findWildShapeItem, secondsLeft, constellationImgOf,
  pickStarryBase, starryEndKey, refundUpdate
} from "./transform-core.mjs";
import { readFlag, flagPath } from "./lib/flags.mjs";
import { say, markBonusUsed } from "./wildshape-adapter.mjs";

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
  return findWildShapeItem(actor?.items);
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
    ?? actor.effects.find(e => e.getFlag?.(MODULE, "starry")) ?? null;
}

/** "archer" | "chalice" | "dragon" | null. */
export function constellationOf(actor) {
  return activeStarry(actor)?.getFlag(MODULE, "starry")?.constellation ?? null;
}

/** Seconds of combat time left on the form, or null. A form put on before D8 is timed by world time. */
export function starrySecondsLeft(actor) {
  const e = activeStarry(actor);
  const left = e?.getFlag?.(MODULE, "starry")?.left;
  if (Number.isFinite(left)) return left;
  return secondsLeft({ start: e?.start?.time ?? e?._source?.start?.time, seconds: e?._source?.duration?.value, now: game.time.worldTime });
}

/**
 * The world clock moved dt seconds while the druid is in a started combat: count the form's time
 * down (D8: only combat time counts). "expired" when it has run out, "ticked" after the write,
 * null when there is no combat-timed form (none up, or one put on before D8).
 */
export async function tickStarry(actor, dt) {
  const effect = activeStarry(actor);
  const left = effect?.getFlag?.(MODULE, "starry")?.left;
  if (!Number.isFinite(left) || !Number.isFinite(dt) || dt === 0) return null;
  const next = Math.min(STARRY_SECONDS, left - dt);
  if (next <= 0) return "expired";
  await effect.update({ [flagPath(MODULE, "starry.left")]: next });
  return "ticked";
}

export const constellationLabel = c => _loc(`PENTARYN_TRANSFORM.Starry.${c[0].toUpperCase()}${c.slice(1)}`);

/** The constellation's picture: the activity's own image if someone set one, else a fixed one. */
export function constellationImg(actor, c) {
  return constellationImgOf(constellationActivity(actor, c)?.img, starryItem(actor)?.img, c);
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
  return pickStarryBase(item?.effects?.contents ?? [], c, twinkling);
}

/* ── putting the form on and off ─────────────────────────────────────────── */

const sensesActive = () => !!game.modules.get(SENSES)?.active;

export async function setLight(item, on) {
  if (!item || !sensesActive()) return;
  const has = !!readFlag(item, SENSES, "light");
  if (on && !has) await item.setFlag(SENSES, "light", foundry.utils.deepClone(STARRY_LIGHT));
  else if (!on && has) await item.update({ [flagPath(SENSES, "light")]: _del });   // a foreign scope: never unsetFlag (§5.8)
}

/** Put the constellation's effect on the druid: a fresh 10 minutes, or (keepTime) the time left. */
export async function applyStarry(actor, c, { keepTime = false } = {}) {
  const item = starryItem(actor);
  const twinkling = hasTwinkling(actor);
  const base = baseEffect(item, c, twinkling)?.toObject() ?? null;
  const current = activeStarry(actor);
  const now = game.time.worldTime;
  const start = keepTime ? (current?._source?.start?.time ?? now) : now;
  const label = constellationLabel(c);
  const ends = _loc("PENTARYN_TRANSFORM.Starry.Ends");
  const left = keepTime ? (starrySecondsLeft(actor) ?? STARRY_SECONDS) : STARRY_SECONDS;
  const data = starryEffectData({
    base, constellation: c, label, img: constellationImg(actor, c), now: start, seconds: left,
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

export const BLOCKS = {
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
    try {
      await applyStarry(actor, constellation);
    } catch (err) {
      // The use is spent but the form did not go up: it comes back, as a failed shift's does (doShift).
      // A form that is up (only its light failed) keeps the use.
      const update = constellationOf(actor) === constellation ? null : refundUpdate(ws?.system?.uses);
      if (update) await ws.update(update);
      throw err;
    }
    announceStarryOn(actor, constellation);
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
  if (!quiet) say(actor, _loc(`PENTARYN_TRANSFORM.Chat.${starryEndKey(reason)}`, { name: actor.name }));
  return true;
}

/** The "takes on a starry form" chat line, with the Wild Shape uses left (the HUD and the sheet route). */
export function announceStarryOn(actor, constellation) {
  const uses = wildShapeItemOf(actor)?.system?.uses;
  say(actor, _loc("PENTARYN_TRANSFORM.Chat.StarryOn", {
    name: actor.name, constellation: constellationLabel(constellation),
    left: usesLeft(uses) ?? 0, max: uses?.max ?? 0, duration: formatDuration(STARRY_SECONDS)
  }));
}
