/**
 * Pentaryn Transform — pure Wild Shape rules: activities, shaping the form, durations, uses, what
 * comes back on revert, whether a shift may start, and who runs the automatic endings.
 *
 * Plain data in, plain data out (no `game`, `foundry`, `CONFIG`). Shapes
 * ------
 * An **item** is an Item's source object (`item.toObject()`), or anything shaped like one:
 *
 *     { _id, name, type, system: { type: { value }, uses: { spent, max }, hd: { spent },
 *                                  activities: { [id]: { type, activation: { type },
 *                                                        consumption: { targets: [{ type, target }] },
 *                                                        transform: { preset } } } },
 *       flags: { "pentaryn-transform": { revert, keepInForm } } }
 *
 * `system.activities` may also be an array or a Map (a prepared Collection), so the HUD can pass
 * live items through the same functions.
 */

import { EFFECT_ID, MODULE, UNIT_SECONDS } from "./constants.mjs";

/* ── activities ──────────────────────────────────────────────────────────── */

/** The activities of an item, from source data (object or array) or a prepared Collection. */
export function activitiesOf(item) {
  const acts = item?.system?.activities;
  if (!acts) return [];
  if (Array.isArray(acts)) return acts;
  if (typeof acts.values === "function") return Array.from(acts.values());
  return Object.values(acts);
}

/** True for a dnd5e transform activity that uses the Wild Shape preset. */
export function isWildShapeActivity(activity) {
  return activity?.type === "transform" && activity?.transform?.preset === "wildshape";
}

/** The Wild Shape item among `items` (the first item owning a wildshape transform), or null. */
export function findWildShapeItem(items) {
  return (items ?? []).find(i => activitiesOf(i).some(isWildShapeActivity)) ?? null;
}

const consumptionTargets = a => a?.consumption?.targets ?? [];

/* ── shaping the form ────────────────────────────────────────────────────── */

/** The Circle of the Stars "Starry Form" feature: by identifier, else by name (starry.mjs starryItem). */
export function isStarryFormData(item) {
  return item?.system?.identifier === "starry-form" || item?.name === "Starry Form";
}

/**
 * Why an item of the host should not come along into the Wild Shape form, or null to keep it.
 *
 * The form must never carry a feature that spends Wild Shape uses or spell slots: dnd5e's revert
 * copies back only HP, temp HP and slots, so a use spent on the form's copy is lost. Species traits
 * with an activity go too — the 2024 rule retains creature type, not species traits.
 *
 * `keepWildShape` is for an unlinked token's form: dnd5e keeps no world actor for that druid, so the
 * form's own copy of Wild Shape is the one the HUD counts and Change Form uses (its uses are
 * carried back by id on revert).
 *
 * @param {object} item
 * @param {{ wildShapeIds: Set<string>|string[], keepWildShape?: boolean }} ctx
 * @returns {"wildshape"|"spends-wildshape"|"starry-form"|"spends-slots"|"species"|"no-spellcasting"|null}
 */
export function stripReason(item, { wildShapeIds = [], keepWildShape = false } = {}) {
  if (item?.type !== "feat") return null;
  if (item.flags?.[MODULE]?.keepInForm === true) return null;
  const ws = new Set(wildShapeIds);
  const acts = activitiesOf(item);
  if (ws.has(item._id) || acts.some(isWildShapeActivity)) return keepWildShape ? null : "wildshape";
  for (const a of acts) {
    for (const t of consumptionTargets(a)) {
      if (t?.type === "itemUses" && t.target && ws.has(t.target)) return "spends-wildshape";
    }
  }
  // Starry Form is taken "rather than shape-shifting" (PHB): never in a beast form, whatever its
  // "Consume Wild Shape" target says (PT3-4 — a target that is not this druid's Wild Shape id let
  // it through, a raw HUD button whose consume could not find its item).
  if (isStarryFormData(item)) return "starry-form";
  for (const a of acts) {
    if (consumptionTargets(a).some(t => t?.type === "spellSlots")) return "spends-slots";
  }
  if (item.system?.type?.value === "race" && acts.length > 0) return "species";
  // "You can't cast spells": the passive Spellcasting class feature only clutters the form's sheet.
  if (item.system?.type?.value === "class" && item.system?.identifier === "spellcasting" && !acts.length) return "no-spellcasting";
  return null;
}

/**
 * Split the form's item list into what stays and what is stripped. Only the host's own items are
 * considered — the beast's items are never stripped.
 *
 * @param {object[]} items                       the transform data's `d.items`
 * @param {{ wildShapeIds, hostItemIds, keepWildShape }} ctx  ids of the host's Wild Shape item(s) / of
 *        all its items; keepWildShape: see stripReason
 * @returns {{ keep: object[], stripped: { _id, name, reason }[] }}
 */
export function stripForForm(items, { wildShapeIds = [], hostItemIds = null, keepWildShape = false } = {}) {
  const host = hostItemIds ? new Set(hostItemIds) : null;
  const keep = [];
  const stripped = [];
  for (const item of items ?? []) {
    const reason = (!host || host.has(item?._id)) ? stripReason(item, { wildShapeIds, keepWildShape }) : null;
    if (reason) stripped.push({ _id: item._id, name: item.name, reason });
    else keep.push(item);
  }
  return { keep, stripped };
}

/**
 * The form's sheet favorites without the stripped items. dnd5e filters favorites before the
 * transformActor hook runs, so it never sees what the hook strips afterwards.
 *
 * @param {{ type: string, id: string }[]} favorites  `system.favorites` (ids are relative UUIDs)
 * @param {string[]} strippedIds
 * @returns {object[]}
 */
export function pruneFavorites(favorites, strippedIds) {
  const gone = new Set(strippedIds ?? []);
  if (!Array.isArray(favorites) || !gone.size) return favorites;
  return favorites.filter(f => {
    if (!["item", "activity"].includes(f?.type)) return true;
    const id = /\.Item\.([^.]+)/.exec(String(f.id ?? ""))?.[1];
    return !gone.has(id);
  });
}

/** True for the "return to normal form" item. */
export function isRevertData(item) {
  return item?.flags?.[MODULE]?.revert === true;
}

/** Label for the form's revert item: "Return to Talo". */
export function returnLabel(hostName) {
  return `Return to ${hostName}`;
}

/* ── durations ───────────────────────────────────────────────────────────── */

/** Seconds in a dnd5e duration ({ value, units }); null when it is not a finite time span. */
export function durationSeconds(duration) {
  const value = Number(duration?.value);
  const per = UNIT_SECONDS[duration?.units];
  if (!per || !Number.isFinite(value) || value <= 0) return null;
  return value * per;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "6 hours", "5 hours 59 minutes", "10 minutes", "0 minutes". Rounds up to the minute. */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.ceil((Number(seconds) || 0) / 60));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return plural(m, "minute");
  return m ? `${plural(h, "hour")} ${plural(m, "minute")}` : plural(h, "hour");
}

/** True once the form's end time has been reached. A form with no end time never expires. */
export function isExpired(endsAt, worldTime) {
  return Number.isFinite(endsAt) && Number.isFinite(worldTime) && worldTime >= endsAt;
}

/* ── uses ────────────────────────────────────────────────────────────────── */

/** Uses left on an item's `system.uses` ({ max, spent }); null when the item has no use limit. */
export function usesLeft(uses) {
  const max = Number(uses?.max);
  if (!Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, max - (Number(uses.spent) || 0));
}

/**
 * Item updates that copy the form's spent uses and spent Hit Dice back onto the original, for every
 * item present on both by id and type. dnd5e's own revert copies only HP, temp HP and spell slots.
 *
 * @param {object[]} formItems      the form's items before revert
 * @param {object[]} originalItems  the original's items after revert
 * @returns {object[]}  updates for `original.updateEmbeddedDocuments("Item", …)`
 */
export function useSyncUpdates(formItems, originalItems) {
  const originals = new Map((originalItems ?? []).map(i => [i._id, i]));
  const updates = [];
  for (const f of formItems ?? []) {
    const o = originals.get(f._id);
    if (!o || o.type !== f.type) continue;
    const u = { _id: f._id };
    const fs = f.system?.uses?.spent;
    if (Number(f.system?.uses?.max) > 0 && Number.isFinite(fs) && fs !== o.system?.uses?.spent) {
      u["system.uses.spent"] = fs;
    }
    const fh = f.system?.hd?.spent;
    if (f.type === "class" && Number.isFinite(fh) && fh !== o.system?.hd?.spent) {
      u["system.hd.spent"] = fh;
    }
    if (Object.keys(u).length > 1) updates.push(u);
  }
  return updates;
}

/** Statuses dnd5e drives from an actor attribute (exhaustion level): carried back as the attribute. */
const ATTRIBUTE_STATUSES = new Set(["exhaustion"]);

/**
 * Condition effects gained while in the form that the original should keep: a Stunned or
 * Unconscious druid is still stunned or unconscious when the form ends. Only effects that carry a
 * status, are not the beast's own, are not this module's duration effect, and whose statuses the
 * original does not already have.
 *
 * @param {object[]} formEffects  the form's effect source objects ({ _id, statuses: string[] })
 * @param {{ originalEffectIds, originalStatuses, sourceEffectIds }} ctx
 * @returns {object[]}  effect data for `original.createEmbeddedDocuments("ActiveEffect", …, { keepId })`
 */
export function carriedConditions(formEffects, { originalEffectIds = [], originalStatuses = [], sourceEffectIds = [] } = {}) {
  const skipIds = new Set([...originalEffectIds, ...sourceEffectIds, EFFECT_ID]);
  const have = new Set(originalStatuses);
  const out = [];
  for (const e of formEffects ?? []) {
    const statuses = Array.from(e?.statuses ?? []);
    if (!statuses.length || skipIds.has(e._id)) continue;
    if (statuses.some(s => ATTRIBUTE_STATUSES.has(s))) continue;
    if (statuses.every(s => have.has(s))) continue;
    statuses.forEach(s => have.add(s));
    out.push(e);
  }
  return out;
}

/**
 * A carried condition's data, ready to embed on the druid: a copy without its origin. The origin
 * points into the form actor, which the revert deletes. dnd5e 6 keeps a second, structured origin
 * on non-condition effects (`system.origin`: item, activity, actor…); both go.
 *
 * @param {object} effect  an effect source object
 * @returns {object}  a shallow copy (with a shallow-copied `system`) minus `origin` and `system.origin`
 */
export function withoutOrigin(effect) {
  const e = { ...effect };
  delete e.origin;
  if (e.system && typeof e.system === "object") {
    e.system = { ...e.system };
    delete e.system.origin;
  }
  return e;
}

/**
 * Effects the druid brought into the form that ended there — Concentration broken by damage, a
 * spell that was dispelled. dnd5e copies the druid's effects into the form under the same ids and
 * never back, so without this the druid returns still concentrating on a spell that already ended.
 *
 * @param {string[]} carriedIds        ids of the druid's effects that went into the form
 * @param {object[]} formEffects       the form's effects before revert ({ _id })
 * @param {object[]} originalEffects   the druid's effects after revert ({ _id, statuses })
 * @returns {string[]}  effect ids to delete from the druid
 */
export function endedInForm(carriedIds, formEffects, originalEffects) {
  const inForm = new Set((formEffects ?? []).map(e => e?._id));
  const orig = new Map((originalEffects ?? []).map(e => [e?._id, e]));
  return [...new Set(carriedIds ?? [])].filter(id => id !== EFFECT_ID && !inForm.has(id) && orig.has(id)
    && !Array.from(orig.get(id)?.statuses ?? []).some(s => ATTRIBUTE_STATUSES.has(s)));
}

/**
 * Exhaustion and Heroic Inspiration gained or spent in the form. dnd5e copies both into the form
 * and neither back. In dnd5e 6 the prepared level is read from the `dnd5eexhaustion` effect's
 * `system.level`, and writing `system.attributes.exhaustion` still turns into that effect
 * (`Actor5e#_onUpdateExhaustion` applies the delta), so the attribute is the one thing to write.
 *
 * @param {{ exhaustion?: number, inspiration?: boolean }} form
 * @param {{ exhaustion?: number, inspiration?: boolean }} original
 * @returns {object}  an update for the original actor (empty when nothing changed)
 */
export function attributeSync(form, original) {
  const u = {};
  if (Number.isFinite(form?.exhaustion) && form.exhaustion !== original?.exhaustion) {
    u["system.attributes.exhaustion"] = form.exhaustion;
  }
  if (typeof form?.inspiration === "boolean" && form.inspiration !== original?.inspiration) {
    u["system.attributes.inspiration"] = form.inspiration;
  }
  return u;
}

/* ── can the druid shift now ─────────────────────────────────────────────── */

/**
 * Why a shift must not start, or null. Checked before any use is spent.
 *
 * - busy: a shift for this druid is already in flight (a double-click would spend two uses).
 * - cannot: no permission to transform (dnd5e would refuse after the use is spent).
 * - incapacitated / zeroHP: the form would be created already over — dnd5e embeds the conditions at
 *   creation, which fires no effect hooks, so it would never end by itself.
 * - noToken: dnd5e swaps only tokens on the viewed scene; with none there the form is an orphan
 *   actor the GM sweep deletes, and the use is gone.
 * - noUses: none left (null uses = unlimited).
 *
 * @returns {"busy"|"cannot"|"incapacitated"|"zeroHP"|"noToken"|"noUses"|null}
 */
export function shiftBlock({ busy = false, canTransform = true, incapacitated = false, hp = null, hasToken = true, usesLeft = null } = {}) {
  if (busy) return "busy";
  if (!canTransform) return "cannot";
  if (incapacitated) return "incapacitated";
  if (Number.isFinite(hp) && hp <= 0) return "zeroHP";
  if (!hasToken) return "noToken";
  if (usesLeft === 0) return "noUses";
  return null;
}

/* ── who acts ────────────────────────────────────────────────────────────── */

/**
 * The one user whose client performs an automatic revert: the active GM, else the first active
 * owner by id. Every client sees the same hook; exactly one must act on it.
 *
 * @param {{ activeGMId: string|null, ownerIds: string[] }} who  ownerIds: active non-GM owners
 * @returns {string|null}
 */
export function pickRunner({ activeGMId = null, ownerIds = [] } = {}) {
  if (activeGMId) return activeGMId;
  return [...ownerIds].sort()[0] ?? null;
}

/** The Wild Shape activity among these items (the first item owning one), or null (transform-creatures-3). */
export function wildShapeActivityOf(items) {
  const item = findWildShapeItem(items);
  return item ? activitiesOf(item).find(isWildShapeActivity) ?? null : null;
}

/**
 * The known forms from the activity's profiles: `[{ id, name, uuid, actor }]`, the actor resolved
 * once per profile (transform-creatures-23); an empty profile name falls back to the actor's, then "?".
 * @param {{ _id, name, uuid }[]} profiles
 * @param {(uuid: string) => object|null} resolve
 */
export function formEntries(profiles, resolve) {
  return (profiles ?? []).map(p => {
    const actor = resolve(p.uuid) ?? null;
    return { id: p._id, name: p.name || actor?.name || "?", uuid: p.uuid, actor };
  });
}

/**
 * Giving one use back: the item update, or null when nothing was spent (spent not a finite number
 * above 0 — a string "1" stays non-refundable, as before). transform-creatures-4.
 * @param {{ spent?: number }} uses
 * @returns {{ "system.uses.spent": number }|null}
 */
export function refundUpdate(uses) {
  const spent = uses?.spent;
  return Number.isFinite(spent) && spent > 0 ? { "system.uses.spent": spent - 1 } : null;
}

/** True when `selfId` is the runner pickRunner elects (transform-creatures-1). */
export function runnerIs(selfId, who) {
  return pickRunner(who) === selfId;
}

/**
 * Can this client be the runner for ANY actor? Not while another user is the active GM: the GM
 * always wins pickRunner. With no active GM, possibly (an owner). transform-creatures-2.
 * @param {{ activeGMId: string|null, selfId: string }} who
 */
export function canRunAny({ activeGMId = null, selfId } = {}) {
  return !activeGMId || activeGMId === selfId;
}

/**
 * The actors the world-time fallback checks for an expired Wild Shape: every world actor, then the
 * unlinked tokens' actors on the viewed scene (transform-creatures-22; Starry keeps world actors).
 * @param {Iterable<object>} actors
 * @param {Iterable<{ actorLink: boolean, actor: object|null }>} sceneTokens
 */
export function worldTimeCandidates(actors, sceneTokens) {
  const out = [...(actors ?? [])];
  for (const t of sceneTokens ?? []) if (!t.actorLink && t.actor) out.push(t.actor);
  return out;
}

/**
 * One druid's shape state as plain JSON (transform-creatures-17, the API's inspect). Every input is
 * plain data the glue read; nothing here touches a document.
 *
 * @param {{ actor: object, original?: object|null, shifted?: boolean, wildShapeForm?: boolean,
 *   formName?: string|null, flag?: { profile?, source?, endsAt? }|null, worldTime?: number,
 *   wildShape?: { itemId: string, uses?: { max?, spent? } }|null, forms?: { id, name }[],
 *   starry?: { constellation: string, secondsLeft: number|null }|null }} input
 * @returns {{ actor, original, shifted, wildShapeForm, form, wildShape, starry, forms }}
 */
export function shapeStatus({ actor = null, original = null, shifted = false, wildShapeForm = false, formName = null,
  flag = null, worldTime = 0, wildShape = null, forms = [], starry = null } = {}) {
  const endsAt = Number.isFinite(flag?.endsAt) ? flag.endsAt : null;
  const max = Number(wildShape?.uses?.max);
  return {
    actor,
    original: original ?? null,
    shifted: !!shifted,
    wildShapeForm: !!wildShapeForm,
    form: shifted ? {
      name: formName ?? null,
      profileId: flag?.profile ?? null,
      sourceUuid: flag?.source ?? null,
      endsAt,
      secondsLeft: endsAt === null ? null : endsAt - worldTime
    } : null,
    wildShape: wildShape ? {
      itemId: wildShape.itemId ?? null,
      usesLeft: usesLeft(wildShape.uses),
      max: Number.isFinite(max) && max > 0 ? max : null
    } : null,
    starry: starry ? { constellation: starry.constellation ?? null, secondsLeft: starry.secondsLeft ?? null } : null,
    forms: (forms ?? []).map(f => ({ id: f.id, name: f.name }))
  };
}

/**
 * What the form gets on top of dnd5e's wildshape preset: the strip, the "Return to Talo" item, the
 * timed effect, and the flag the sweep, auto-revert, the HUD and inspect read. The glue passes the
 * world time and the three localized strings.
 *
 * @param {{ meta: object, source: { name, img, uuid }, items: object[], effects: object[],
 *   keepWildShape?: boolean, now: number, end: string, effectName: string }} args
 *        items/effects: the form's data as it will be created (linked) or as it was created (token)
 * @returns {{ keep: object[], stripped: object[], renames: object[], effect: object, flag: object }}
 */
export function shapingPlan({ meta, source, items, effects, keepWildShape = false, now, end, effectName }) {
  const { keep, stripped } = stripForForm(items, {
    wildShapeIds: [meta.wildShapeId].filter(Boolean), hostItemIds: meta.hostItemIds, keepWildShape
  });
  const renames = keep.filter(isRevertData).map(i => ({ _id: i._id, name: returnLabel(meta.hostName), img: meta.hostImg }));

  const seconds = meta.seconds;
  const effect = {
    _id: EFFECT_ID,
    name: effectName,
    img: source.img,
    transfer: false,
    disabled: false,
    ...(seconds ? { duration: { value: seconds, units: "seconds", expiry: null }, start: { time: now } } : {}),
    description: `<p>${end}</p>${meta.traitsHtml ?? ""}`,
    flags: { [MODULE]: { wildshape: true } }
  };

  const hostEffects = new Set(meta.hostEffectIds ?? []);
  const flag = {
    original: meta.hostId, source: source.uuid, profile: meta.profile ?? null,
    endsAt: seconds ? now + seconds : null,
    // The druid's effects that went into the form (same ids): revert ends those that ended here.
    carried: (effects ?? []).map(e => e?._id).filter(id => id && hostEffects.has(id))
  };
  return { keep, stripped, renames, effect, flag };
}
