// Pentaryn Transform Controls — Wild Shape as one HUD click, revert from an item, and the
// end-of-form rules dnd5e leaves to the table.
//
// dnd5e 5.3.3 fires dnd5e.preUseActivity(activity, usageConfig, dialogConfig, messageConfig)
// (return false cancels) and dnd5e.postUseActivity(activity, usageConfig, results) on the
// client of the user who used the activity, so a player's click shifts and reverts with the
// player's own permissions — Actor#revertOriginalForm already refuses non-owners.
//
// Design and verified line references: WILDSHAPE-DESIGN.md (this folder).

import {
  MODULE_ID, EFFECT_ID, activitiesOf, isWildShapeActivity, stripForForm, isRevertData, returnLabel,
  durationSeconds, formatDuration, isExpired, usesLeft, useSyncUpdates, carriedConditions, endedInForm,
  attributeSync, pruneFavorites, shiftBlock, pickRunner, withArticle, formTempHP, withoutOrigin, isBodySwap
} from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";

const T = (key, data) => (data ? game.i18n.format(key, data) : game.i18n.localize(key));
const log = makeLog(MODULE_ID);

/* ── Foundry v14 core bug (seen v14.367, still present in v14.369): token swaps with operator-wrapped sizes ── */
// dnd5e's transformInto and revertOriginalForm swap the token with a non-recursive update
// ({diff: false, recursive: false}). Core v14 turns every root key of such an update into a
// ForcedReplacement operator, then TokenDocument._preUpdateOperation hands those raw operators to
// code that expects numbers: region identification does `point.x.almostEqual(...)` on an operator
// object and throws ("point.x.almostEqual is not a function"), aborting the update. On a scene with
// Regions (Drow Prison's passages), a druid whose form stands in one could not return to normal
// form: the token kept pointing at "Talo (Dire Wolf)". Movement-waypoint inference reads the same
// raw values. For a scalar field a ForcedReplacement means exactly "set this value", so unwrap scalars before
// core sees them. Object fields (texture, sight, ring, flags, delta) keep their operators.
// Re-checked 2026-10-10 on v14.369: DataModel still wraps every root key of a recursive:false
// update (common/abstract/data.mjs) and testInsideRegion still reads `data.x ?? _source.x` with no
// unwrap; a wrapped x/y at a region's centre tests outside. Remove only when that changes.
{
  const TD = foundry.documents?.TokenDocument;
  const Ops = foundry.data?.operators;
  const original = TD && Object.hasOwn(TD, "_preUpdateOperation") ? TD._preUpdateOperation : null;
  if (original && Ops?.ForcedReplacement && !original.pentarynUnwrapped) {
    const wrapped = function (documents, operation, user) {
      if (operation?.recursive === false) {
        for (const u of operation.updates ?? []) {
          for (const [k, v] of Object.entries(u ?? {})) {
            if (!(v instanceof Ops.ForcedReplacement)) continue;
            const plain = Ops.DataFieldOperator.get(v);
            if (plain === null || typeof plain !== "object") u[k] = plain;
          }
        }
      }
      return original.call(this, documents, operation, user);
    };
    wrapped.pentarynUnwrapped = true;
    TD._preUpdateOperation = wrapped;
  }
}

/* ── body swaps never animate (Area 4 live run, D4) ──────────────────────── */
// Core animates a token update and, on every frame, writes the animation's in-flight values back
// onto the TokenDocument (Token#animateFrame: mergeObject(this.document, animationData)). In a tab
// whose canvas is not ticking (the GM tab sits in the background at this table) a transform's
// animation never completes, so the document kept showing the FIRST form's art and size after a
// chain of shifts, and dnd5e, which reads previousTokenData from those prepared values, saved them
// for the revert. A body swap (transform/revert) now never animates, on every client: animate:false
// makes core stop the token's animations and re-sync from the fresh document instead.
// Adjustment row core-token-swap-no-animation.
{
  const Ops = foundry.data?.operators;
  const unwrap = (v) => (Ops?.DataFieldOperator && v instanceof Ops.DataFieldOperator ? Ops.DataFieldOperator.get(v) : v);
  Hooks.on("preUpdateToken", (doc, changes, options) => {
    try {
      if (options?.animate === false) return;
      if (isBodySwap(changes, { actorId: doc?._source?.actorId ?? doc?.actorId ?? null, unwrap })) options.animate = false;
    } catch (err) { log.warn("body-swap animation guard skipped", err); }
  });
}

/** Re-prepare this actor's tokens from their source and end their animations, before dnd5e reads them. */
function settleTokens(actor) {
  for (const t of actor?.getActiveTokens?.(false, false) ?? []) {
    try { t.stopAnimation?.({ reset: true }); } catch (err) { log.warn(`settling ${t.name} failed`, err); }
  }
}

/* ── lookups ─────────────────────────────────────────────────────────────── */

/** True when this item is the "return to normal form" ability. */
export function isRevertItem(item) {
  return item?.getFlag?.(MODULE_ID, "revert") === true;
}

/**
 * The actor a form was made from; the actor itself when it is not transformed.
 *
 * An unlinked token's form is its own original: dnd5e keeps the druid's earlier state in the
 * token's flags, not in a world actor (the `originalActor` flag names the shared base actor, whose
 * uses are not this token's). Such a form keeps its own Wild Shape item — see shaping().
 */
export function original(actor) {
  if (!actor?.isPolymorphed) return actor ?? null;
  if (actor.isToken) return actor;
  return game.actors.get(actor.getFlag("dnd5e", "originalActor")) ?? null;
}

/** The Wild Shape transform activity on this actor (or, for a form, on its original). */
export function wildShapeActivity(actor) {
  const host = original(actor);
  for (const item of host?.items ?? []) {
    const activity = activitiesOf(item).find(isWildShapeActivity);
    if (activity) return activity;
  }
  return null;
}

/** The known forms: [{ id, name, uuid, actor }] — the activity's available profiles. */
export function forms(actor) {
  const activity = wildShapeActivity(actor);
  return (activity?.availableProfiles ?? []).map(p => ({
    id: p._id, name: p.name || fromUuidSync(p.uuid)?.name || "?", uuid: p.uuid, actor: fromUuidSync(p.uuid) ?? null
  }));
}

/** True for a form made by the Wild Shape preset. */
export function isWildShapeForm(actor) {
  return !!actor?.isPolymorphed && actor.getFlag("dnd5e", "transformOptions")?.preset === "wildshape";
}

/** False for a stale document: a form the GM's revert already deleted, a token already replaced. */
function exists(actor) {
  if (!actor) return false;
  if (actor.isToken) return !!actor.token?.parent?.tokens?.has(actor.token.id);
  return game.actors.get(actor.id) === actor;
}

/** The druid's live Wild Shape form, if one is out (linked druids only). */
function activeFormOf(actor) {
  if (!actor || actor.isPolymorphed || actor.isToken) return null;
  return game.actors.find(a => isWildShapeForm(a) && a.getFlag("dnd5e", "originalActor") === actor.id) ?? null;
}

/* ── can the druid shift now ─────────────────────────────────────────────── */

const BLOCK_MESSAGES = {
  busy: "PENTARYN_TRANSFORM.Block.Busy",
  cannot: "PENTARYN_TRANSFORM.Block.Cannot",
  incapacitated: "PENTARYN_TRANSFORM.Block.Incapacitated",
  zeroHP: "PENTARYN_TRANSFORM.Block.ZeroHP",
  noToken: "PENTARYN_TRANSFORM.Block.NoToken",
  noUses: "PENTARYN_TRANSFORM.NoUses"
};

/** dnd5e's own test (TransformActivity#canTransform), minus ACTOR_CREATE for a token's form. */
function canTransform(actor) {
  const allowed = game.user.isGM || game.settings.get("dnd5e", "allowPolymorphing");
  return allowed && (!!actor?.isToken || game.user.can("ACTOR_CREATE"));
}

/**
 * Warn and return the reason when `body` (the druid, or the form they are in) can't shift now.
 * Runs before any use is spent. See shiftBlock() for what each reason guards against.
 */
function blockedShift(body, wildShapeItem) {
  const why = shiftBlock({
    busy: inflight.has(original(body)?.uuid),
    canTransform: canTransform(body),
    incapacitated: !!body?.statuses?.has("incapacitated"),
    hp: body?.system?.attributes?.hp?.value ?? null,
    hasToken: (body?.getActiveTokens?.(true, true)?.length ?? 0) > 0,
    usesLeft: usesLeft(wildShapeItem?.system?.uses)
  });
  if (why) ui.notifications.warn(T(BLOCK_MESSAGES[why], { name: body?.name ?? "?" }));
  return why;
}

/* ── chat ────────────────────────────────────────────────────────────────── */

export function say(actor, content) {
  return ChatMessage.implementation.create({
    content: `<p class="pentaryn-transform-line">${content}</p>`,
    speaker: ChatMessage.implementation.getSpeaker({ actor })
  }).catch(err => log.warn("chat line failed", err));
}

const RETURN_LINES = {
  manual: "PENTARYN_TRANSFORM.Chat.Return",
  zeroHP: "PENTARYN_TRANSFORM.Chat.ZeroHP",
  incapacitated: "PENTARYN_TRANSFORM.Chat.Incapacitated",
  expired: "PENTARYN_TRANSFORM.Chat.Expired",
  longRest: "PENTARYN_TRANSFORM.Chat.LongRest"
};

/* ── bonus-action bookkeeping ────────────────────────────────────────────── */
// Argon keeps "bonus action used" on the panel instance, and every shift or revert rebinds the HUD
// to a different actor, which builds fresh panels. The token survives both, so the mark is kept per
// token and per turn; hud.mjs applies it when it composes the Bonus bar.

let bonusMark = null;

function tokenOf(actor) {
  return actor?.getActiveTokens?.(false, true)?.[0] ?? null;
}

// `game.combat` is only the combat this client VIEWS (a GM activating another encounter flips every
// client's view), so the mark looks for the started combat whose current turn is this token's.
export function markBonusUsed(actor) {
  const token = tokenOf(actor);
  if (!token) return;
  const c = [game.combat, ...(game.combats ?? [])].find(x => x?.started && x.combatant?.tokenId === token.id);
  if (!c) return;
  bonusMark = { combat: c.id, round: c.round, turn: c.turn, token: token.id };
}

export function bonusUsedNow(tokenId) {
  const c = bonusMark ? game.combats?.get(bonusMark.combat) : null;
  return !!(bonusMark && c?.started && bonusMark.round === c.round
    && bonusMark.turn === c.turn && bonusMark.token === tokenId);
}

/* ── revert ──────────────────────────────────────────────────────────────── */

const reverting = new Set();   // form actor uuids

/**
 * dnd5e's revert moves back only the tokens on this client's canvas, then (as GM) deletes the
 * form — a token on any other scene is left pointing at a deleted actor. This happens to every
 * auto-revert the GM runs while looking at another scene. Point those tokens back first, the same
 * way dnd5e does it for the canvas (prototype token + the token's previousTokenData, x/y kept).
 */
async function restoreTokensElsewhere(form) {
  const host = game.actors.get(form.getFlag("dnd5e", "originalActor"));
  if (!host) return;
  const here = canvas.ready ? canvas.scene : null;
  for (const scene of game.scenes) {
    if (scene === here) continue;
    const tokens = scene.tokens.filter(t => t.actorId === form.id);
    if (!tokens.length) continue;
    const proto = (await host.getTokenDocument({}, { parent: scene })).toObject();
    const updates = tokens.map(t => {
      const u = foundry.utils.deepClone(proto);
      u._id = t.id;
      u.elevation = t.elevation;
      u.hidden = t.hidden;
      u.rotation = t.rotation;
      foundry.utils.mergeObject(u, t.getFlag("dnd5e", "previousTokenData") ?? {});
      if (t.level !== undefined) u.level = t.level;
      delete u.x;
      delete u.y;
      return u;
    });
    await scene.updateEmbeddedDocuments("Token", updates, { diff: false, recursive: false, animate: false });
  }
}

/**
 * End the druid's copies of effects that ended in the form. Concentration goes through dnd5e's
 * endConcentration so anything listening for dnd5e.endConcentration hears it on the druid.
 */
async function endOnDruid(host, ids) {
  for (const id of ids) {
    const effect = host.effects.get(id);
    if (!effect) continue;
    if (effect.statuses?.has("concentrating") && typeof host.endConcentration === "function") await host.endConcentration(effect);
    else await effect.delete();
  }
}

/**
 * Return a transformed actor to its original form, carrying back what dnd5e does not: item uses
 * and Hit Dice spent on the form, exhaustion and Heroic Inspiration, conditions gained there, and
 * the end of the druid's own effects that ended there (Concentration broken in beast form).
 *
 * @param {Actor} actor
 * @param {{ quiet?: boolean, reason?: keyof RETURN_LINES }} [options]
 * @returns {Promise<Actor|null>}  the original actor
 */
export async function revert(actor, { quiet = false, reason = "manual" } = {}) {
  if (!actor?.isPolymorphed) {
    if (!quiet) ui.notifications.info(T("PENTARYN_TRANSFORM.NotTransformed", { name: actor?.name ?? "?" }));
    return null;
  }
  if (!exists(actor)) return null;
  if (!actor.isOwner) {
    ui.notifications.warn("DND5E.TRANSFORM.Warning.NoOwnership", { localize: true });
    return null;
  }
  const key = actor.uuid;
  if (reverting.has(key)) return null;
  reverting.add(key);
  try {
    const ws = actor.getFlag(MODULE_ID, "wildshape") ?? null;
    const formItems = actor.items.map(i => i.toObject());
    const formEffects = actor.effects.map(e => e.toObject());
    const fa = actor.system.attributes ?? {};
    const formAttributes = { exhaustion: fa.exhaustion, inspiration: fa.inspiration };
    const sourceUuid = ws?.source;
    const sourceEffectIds = (sourceUuid ? fromUuidSync(sourceUuid)?.effects?.map(e => e.id) : null) ?? [];

    if (!actor.isToken) await restoreTokensElsewhere(actor);
    settleTokens(actor);

    const result = await actor.revertOriginalForm({ renderSheet: false });
    const back = result instanceof Actor ? result : (result?.actor ?? null);
    if (!back) return null;

    const updates = useSyncUpdates(formItems, back.items.map(i => i.toObject()));
    if (updates.length) await back.updateEmbeddedDocuments("Item", updates);
    const ba = back.system.attributes ?? {};
    const attributes = attributeSync(formAttributes, { exhaustion: ba.exhaustion, inspiration: ba.inspiration });
    if (!foundry.utils.isEmpty(attributes)) await back.update(attributes);

    // Effects only for Wild Shape forms this module shaped: it knows which effects went in and
    // which are the beast's own. A Polymorph form's beast effects must not land on the original.
    if (ws) {
      await endOnDruid(back, endedInForm(ws.carried, formEffects, back.effects.map(e => e.toObject())));
      const carried = carriedConditions(formEffects, {
        originalEffectIds: back.effects.map(e => e.id),
        originalStatuses: Array.from(back.statuses ?? []),
        sourceEffectIds
      }).map(withoutOrigin);
      if (carried.length) await back.createEmbeddedDocuments("ActiveEffect", carried, { keepId: true });
    }

    if (!quiet) say(back, T(RETURN_LINES[reason] ?? RETURN_LINES.manual, { name: back.name }));
    return back;
  } finally {
    reverting.delete(key);
  }
}

// A revert this module did not start — the sheet's Restore Transformation, the sidebar's context
// menu, a macro — still says so in chat, as the shift did (PT3-7). dnd5e fires this just before the
// revert, on the reverting client only. revert() marks its form in `reverting` first and posts its
// own line (or stays quiet for Change Form), so each revert gets one line at most.
Hooks.on("dnd5e.revertOriginalForm", (actor) => {
  try {
    if (!isWildShapeForm(actor) || reverting.has(actor.uuid)) return;
    const host = game.actors.get(actor.getFlag("dnd5e", "originalActor"))
      ?? (actor.isToken ? game.actors.get(actor.token?.actorId) : null);
    if (!host) return;                                    // dnd5e warns and does not revert
    const name = (actor.isToken ? actor.token?.getFlag?.("dnd5e", "previousActorData")?.name : null) ?? host.name;
    say(host, T(RETURN_LINES.manual, { name }));
  } catch (err) {
    log.warn("chat line failed", err);
  }
});

/**
 * "Return to <druid>" (Bonus Action): the revert item's use and the HUD's own Return button (a
 * druid with no revert item, PT3-3) both end the form here.
 */
export function returnToNormal(actor) {
  markBonusUsed(actor);
  return revert(actor).catch(err => {
    log.warn("revert failed", err);
    return null;
  });
}

/* ── shift ───────────────────────────────────────────────────────────────── */

// The transform runs inside dnd5e.postUseActivity, which dnd5e does not await. `inflight` hands the
// promise to shift() so a HUD click resolves only once the form exists. `pending` carries what the
// synchronous dnd5e.transformActor hook needs (enriched trait text, the end time) across the gap.
const inflight = new Map();   // druid actor uuid → Promise<Actor|null>
const pending = new Map();    // druid actor uuid → shaping meta (see doShift)
const shifting = new Set();   // actor uuids with a shift() call in progress (double-click guard)

/**
 * Shift into a known form. From a form, this is the 2024 "use Wild Shape again": the current form
 * ends and the new one begins, for one use.
 *
 * @param {Actor} actor       the druid, or the form they are in
 * @param {string} profileId  the transform profile's _id (see forms())
 * @returns {Promise<Actor|null>}  the new form actor
 */
export async function shift(actor, profileId) {
  const key = actor?.uuid;
  if (!key || shifting.has(key)) return null;   // the first click of a double-click is shifting
  shifting.add(key);
  try {
    let host = original(actor);
    let activity = wildShapeActivity(host);
    if (!host || !activity) {
      ui.notifications.warn(T("PENTARYN_TRANSFORM.NoWildShape", { name: actor?.name ?? "?" }));
      return null;
    }
    if (!activity.availableProfiles.some(p => p._id === profileId)) {
      ui.notifications.warn(T("PENTARYN_TRANSFORM.UnknownForm"));
      return null;
    }
    // The body that is out now: this form, or the druid's form elsewhere when the HUD is bound to
    // the druid itself (a second token, the actor). Shifting again ends it first.
    const body = actor.isPolymorphed ? actor : (activeFormOf(host) ?? actor);
    if (blockedShift(body, activity.item)) return null;
    if (body.isPolymorphed) {
      host = await revert(body, { quiet: true });
      if (!host) return null;
      activity = wildShapeActivity(host);
      if (!activity) return null;
    }
    await activity.use(
      { transform: { profile: profileId } },
      { configure: false },
      { create: false }
    );
    return (await inflight.get(host.uuid)) ?? null;
  } finally {
    shifting.delete(key);
  }
}

/** Normalised trait text for the form's duration effect, enriched against the beast. */
async function traitsHtml(source) {
  const TE = foundry.applications.ux.TextEditor.implementation;
  const parts = [];
  for (const item of source.items) {
    if (item.type !== "feat" || item.system.type?.value !== "monster") continue;
    if (activitiesOf(item).length) continue;               // passive traits only
    const html = await TE.enrichHTML(item.system.description?.value ?? "", {
      relativeTo: item, rollData: item.getRollData?.() ?? {}, secrets: false
    });
    parts.push(`<p><strong>${item.name}.</strong> ${html.replace(/^<p>|<\/p>$/g, "")}</p>`);
  }
  return parts.join("");
}

async function refund(host, itemId) {
  const item = host?.items.get(itemId);
  const spent = item?.system.uses?.spent;
  if (Number.isFinite(spent) && spent > 0) await item.update({ "system.uses.spent": spent - 1 });
}

/** What shaping() needs to know about the druid, read live (the transformActor hook's fallback). */
function metaFor(host, extra = {}) {
  const wsItem = host.items.find(i => activitiesOf(i).some(isWildShapeActivity));
  const act = wsItem ? activitiesOf(wsItem).find(isWildShapeActivity) : null;
  return {
    profile: null, wildShapeId: wsItem?.id ?? null, seconds: durationSeconds(act?.duration), traitsHtml: "",
    hostId: host.id, hostName: host.name, hostImg: host.img, hostTemp: host.system?.attributes?.hp?.temp ?? 0,
    hostItemIds: host.items.map(i => i.id), hostEffectIds: host.effects.map(e => e.id),
    ...extra
  };
}

/**
 * What the form gets on top of dnd5e's wildshape preset: the strip, the "Return to Talo" item, the
 * timed effect, and the flag the sweep, auto-revert and HUD read.
 *
 * @param {{ meta: object, source: Actor, items: object[], effects: object[], keepWildShape?: boolean }} args
 *        items/effects: the form's data as it will be created (linked) or as it was created (token)
 */
function shaping({ meta, source, items, effects, keepWildShape = false }) {
  const { keep, stripped } = stripForForm(items, {
    wildShapeIds: [meta.wildShapeId].filter(Boolean), hostItemIds: meta.hostItemIds, keepWildShape
  });
  const renames = keep.filter(isRevertData).map(i => ({ _id: i._id, name: returnLabel(meta.hostName), img: meta.hostImg }));

  const now = game.time.worldTime;
  const seconds = meta.seconds;
  const end = seconds ? T("PENTARYN_TRANSFORM.Effect.Ends", { name: meta.hostName, duration: formatDuration(seconds) })
    : T("PENTARYN_TRANSFORM.Effect.EndsNoTime", { name: meta.hostName });
  const effect = {
    _id: EFFECT_ID,
    name: T("PENTARYN_TRANSFORM.Effect.Name", { form: source.name }),
    img: source.img,
    transfer: false,
    disabled: false,
    ...(seconds ? { duration: { value: seconds, units: "seconds", expiry: null }, start: { time: now } } : {}),
    description: `<p>${end}</p>${meta.traitsHtml ?? ""}`,
    flags: { [MODULE_ID]: { wildshape: true } }
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

/**
 * An unlinked token's transform never fires dnd5e.transformActor (dnd5e updates the token in
 * place), so the same shaping is applied to the token's actor afterwards.
 */
async function shapeTokenForm(form, source, meta) {
  const plan = shaping({
    meta, source, keepWildShape: true,
    items: form.items.map(i => i.toObject()), effects: form.effects.map(e => e.toObject())
  });
  if (plan.stripped.length) await form.deleteEmbeddedDocuments("Item", plan.stripped.map(s => s._id));
  if (plan.renames.length) await form.updateEmbeddedDocuments("Item", plan.renames);
  await form.createEmbeddedDocuments("ActiveEffect", [plan.effect], { keepId: true });
  const update = { [`flags.${MODULE_ID}.wildshape`]: plan.flag };
  const temp = formTempHP(meta.hostTemp, form.system.attributes?.hp?.temp);
  if (temp !== (form.system.attributes?.hp?.temp ?? 0)) update["system.attributes.hp.temp"] = temp;
  const favorites = form.system.favorites;
  if (plan.stripped.length && Array.isArray(favorites)) {
    const pruned = pruneFavorites(favorites.map(f => ({ ...f })), plan.stripped.map(s => s._id));
    if (pruned.length !== favorites.length) update["system.favorites"] = pruned;
  }
  await form.update(update);
}

/** Transform `host` into the profile's source; refunds the use when the shift does not happen. */
async function doShift(host, activity, profileId, uuid) {
  const itemId = activity.item.id;
  // dnd5e 6 adds a "form" transform mode (effects on the actor, no new actor). Wild Shape in
  // 6.0.6 is still mode "cr"; a form-mode Wild Shape would half-shift here, so refuse it loudly.
  if (activity.transform?.mode === "form") {
    await refund(host, itemId);
    ui.notifications.warn(T("PENTARYN_TRANSFORM.FormMode", { name: activity.item.name }));
    return null;
  }
  const source = uuid ? await fromUuid(uuid) : null;
  if (!source) {
    await refund(host, itemId);
    ui.notifications.error(T("PENTARYN_TRANSFORM.SourceMissing"));
    return null;
  }
  const seconds = durationSeconds(activity.duration);
  // Snapshot the druid now: for an unlinked token, `host` IS the form once transformInto returns.
  const meta = metaFor(host, {
    profile: profileId, wildShapeId: itemId, seconds, traitsHtml: await traitsHtml(source).catch(err => {
      log.debug("traits enrichment failed", { source: source.uuid }, err);
      return "";
    })
  });
  pending.set(host.uuid, meta);
  // Starry Form is taken "rather than shape-shifting": a beast shift ends it (and its light).
  const starry = host.effects.find(e => e.getFlag(MODULE_ID, "starry"));
  if (starry) await starry.delete().catch(err => log.warn("ending Starry Form failed", err));
  // Mark the bonus action before the token swaps: Argon rebuilds the HUD as soon as it does.
  markBonusUsed(host);
  const token = host.isToken ? host.token : null;
  const before = new Set(game.actors.filter(a => a.getFlag("dnd5e", "originalActor") === host.id).map(a => a.id));
  let form = null;
  try {
    settleTokens(host);
    await host.transformInto(source, activity.settings, { renderSheet: false });
    if (token) form = token.actor?.isPolymorphed ? token.actor : null;
    else form = game.actors.find(a => a.isPolymorphed && a.getFlag("dnd5e", "originalActor") === host.id
      && !before.has(a.id)) ?? null;
  } catch (err) {
    log.error("transform failed", err);
  } finally {
    pending.delete(host.uuid);
  }
  if (!form) {
    await refund(host, itemId);
    ui.notifications.error(T("PENTARYN_TRANSFORM.ShiftFailed", { name: meta.hostName }));
    return null;
  }
  if (token) {
    // The shift happened: never refund past this point, even if the extras fail.
    await shapeTokenForm(form, source, meta).catch(err => log.error("shaping the token form failed", err));
  }
  const uses = (token ? form : host).items.get(itemId)?.system.uses;
  say(token ? form : host, T("PENTARYN_TRANSFORM.Chat.Shift", {
    name: meta.hostName, form: withArticle(source.name), left: usesLeft(uses) ?? 0, max: uses?.max ?? 0,
    duration: seconds ? formatDuration(seconds) : "—"
  }));
  return form;
}

/* ── dnd5e hooks: use ────────────────────────────────────────────────────── */

Hooks.on("dnd5e.preUseActivity", (activity, usageConfig, dialogConfig, messageConfig) => {
  const actor = activity?.actor;
  if (isRevertItem(activity?.item)) {
    messageConfig.create = false;                         // our one-line message replaces the card
    return;
  }
  if (activity?.type !== "transform") return;
  if (!isWildShapeActivity(activity)) {
    // A transform from inside a transform nests a copy of the copy ("Talo (Badger) (Badger)").
    if (actor?.isPolymorphed) {
      ui.notifications.warn(T("PENTARYN_TRANSFORM.AlreadyTransformed", { name: actor.name }));
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
});

Hooks.on("dnd5e.postUseActivity", (activity, usageConfig, results) => {
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
  inflight.set(host.uuid, job);
  job.finally(() => { if (inflight.get(host.uuid) === job) inflight.delete(host.uuid); });
});

/* ── dnd5e hook: shape the form ──────────────────────────────────────────── */

// Linked actors only: dnd5e fires this after its own item/effect filtering, before Actor.create.
Hooks.on("dnd5e.transformActor", (host, source, d, settings) => {
  if (settings?.preset !== "wildshape") return;
  try {
    const meta = pending.get(host.uuid) ?? metaFor(host);
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
    foundry.utils.setProperty(d, `flags.${MODULE_ID}.wildshape`, plan.flag);
  } catch (err) {
    // Never block the transform over the extras.
    log.error("shaping the form failed", err);
  }
});

/* ── ending without a click ──────────────────────────────────────────────── */

/** True on exactly one client for this actor: the active GM, else the first active owner. */
export function isRunner(actor) {
  const ownerIds = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id);
  return pickRunner({ activeGMId: game.users.activeGM?.id ?? null, ownerIds }) === game.user.id;
}

function maybeAutoRevert(actor, reason) {
  // exists(): the effect-expiry update and the world-time check can both fire for one ending; the
  // second must not run dnd5e's revert again on the already-deleted form.
  if (!exists(actor) || !isWildShapeForm(actor) || reverting.has(actor.uuid) || !isRunner(actor)) return;
  revert(actor, { reason }).catch(err => log.warn("auto-revert failed", err));
}

// 0 HP: the 2024 form uses the druid's own HP; at 0 they are Unconscious, so the form ends.
Hooks.on("updateActor", (actor, changes) => {
  if (!foundry.utils.hasProperty(changes, "system.attributes.hp.value")) return;
  if ((actor.system.attributes.hp?.value ?? 1) <= 0) maybeAutoRevert(actor, "zeroHP");
});

// Incapacitated (or any condition that implies it). Checked after the effect lands on the actor.
function onEffectChange(effect) {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !isWildShapeForm(actor)) return;
  setTimeout(() => {
    if (actor.statuses?.has("incapacitated")) maybeAutoRevert(actor, "incapacitated");
  }, 0);
}
Hooks.on("createActiveEffect", onEffectChange);
Hooks.on("updateActiveEffect", (effect, changes) => {
  // Foundry v14's effect registry marks a lapsed duration expired; that is the form running out.
  if (effect.id === EFFECT_ID && foundry.utils.getProperty(changes, "duration.expired") === true) {
    maybeAutoRevert(effect.parent, "expired");
    return;
  }
  onEffectChange(effect);
});
Hooks.on("deleteActiveEffect", (effect) => {
  const actor = effect?.parent;
  if (!(actor instanceof Actor) || !exists(actor) || !isWildShapeForm(actor)) return;
  // Deleting the Wild Shape effect (Argon: right-click on it) ends the form.
  if (effect.id === EFFECT_ID) {
    const endsAt = actor.getFlag(MODULE_ID, "wildshape")?.endsAt;
    maybeAutoRevert(actor, isExpired(endsAt, game.time.worldTime) ? "expired" : "manual");
    return;
  }
  // One of the druid's own effects ended in the form — Concentration broken by damage to the beast.
  // End the druid's copy now: dnd5e's dependents registry tracks the druid's copy, not the form's,
  // and otherwise the druid returns still concentrating on a spell that already ended.
  const carried = actor.getFlag(MODULE_ID, "wildshape")?.carried ?? [];
  if (!carried.includes(effect.id) || reverting.has(actor.uuid) || !isRunner(actor)) return;
  const host = original(actor);
  if (!host || host === actor) return;                    // a token's form: revert carries it back
  endOnDruid(host, [effect.id])
    .catch(err => log.warn(`ending ${effect.name} on ${host.name} failed`, err));
});

// Duration: the effect registry covers it; this covers time moved while no GM is connected and
// keeps working if a world sets CONFIG.ActiveEffect.expiryAction to something else.
Hooks.on("updateWorldTime", (worldTime) => {
  const candidates = [...game.actors];
  for (const t of canvas.scene?.tokens ?? []) if (!t.actorLink && t.actor) candidates.push(t.actor);
  for (const actor of candidates) {
    if (!isWildShapeForm(actor)) continue;
    if (isExpired(actor.getFlag(MODULE_ID, "wildshape")?.endsAt, worldTime)) maybeAutoRevert(actor, "expired");
  }
});

/* ── rests ───────────────────────────────────────────────────────────────── */

// Marks the druid-side short rest this module starts itself, so it is not redirected again. No dot
// in the key: initiateRest runs the config through mergeObject, which expands dotted keys.
const REST_SYNC = "pentarynTransformRestSync";

// Long Rest while shifted — on the form, or on the druid while a form is out (a party rest
// request lists the druid, not the form): the form ends, then the druid rests. Hooked after the
// rest dialog, so cancelling it leaves the form alone. Without this, a rest on the druid is undone
// at revert, which copies the form's HP and Hit Dice back over it.
Hooks.on("dnd5e.longRest", (actor, config) => {
  const form = isWildShapeForm(actor) ? actor : activeFormOf(actor);
  if (!form) return;
  const { type, ...rest } = config ?? {};
  revert(form, { reason: "longRest" })
    .then(host => host?.longRest({ ...rest, dialog: false }))
    .catch(err => log.warn("long rest after revert failed", err));
  return false;
});

// Short Rest on the druid while a form is out: the form is the body that rests (its HP, its Hit
// Dice, which revert carries back); the druid's own recovery follows from restCompleted below.
Hooks.on("dnd5e.preShortRest", (actor, config) => {
  if (config?.[REST_SYNC]) return;
  const form = activeFormOf(actor);
  if (!form?.isOwner) return;
  const { type, ...rest } = config ?? {};
  form.shortRest(rest).catch(err => log.warn("short rest on the form failed", err));
  return false;
});

// Short Rest while shifted: allowed; the druid regains their one Wild Shape use (it lives on them,
// not on the form). Hit Dice spent on the form come back with the revert's use-sync.
Hooks.on("dnd5e.restCompleted", (actor, result, config) => {
  if (config?.type !== "short" || config?.[REST_SYNC] || !isWildShapeForm(actor)) return;
  const host = original(actor);
  if (!host || host === actor || !host.isOwner) return;   // a token's form rested its own Wild Shape
  host.shortRest({
    dialog: false, chat: false, autoHD: false, advanceTime: false, advanceBastionTurn: false, newDay: false,
    request: config.request,                              // a requested rest passes allowRests = off
    [REST_SYNC]: true
  }).catch(err => log.warn("short rest on the original failed", err));
});

/* ── spent forms ─────────────────────────────────────────────────────────── */

// A player who reverts can't delete the form actor (dnd5e deletes it only "if possible"), so every
// Wild Shape left a "Talo (Dire Wolf)" behind in the player's sidebar. The active GM sweeps them:
// a transformed copy (flags.dnd5e.originalActor) with no token on any scene is spent.
// The age guard skips a form that was just created and hasn't been swapped onto its token yet;
// such a form is looked at again once it is old enough.
//
// Scheduling: one timer, never pushed back. (0.2.0 debounced on every token update, so steady token
// traffic — a player dragging a token, another module writing lights — kept postponing the sweep
// and a reverted form sat in the sidebar indefinitely.) A player's revert also shows up on the GM
// client as the form losing flags.dnd5e.isPolymorphed, which schedules a quick sweep directly.
const SWEEP_AGE_MS = 10_000;
export async function sweepSpentForms() {
  if (!game.users.activeGM?.isSelf) return;
  const placed = new Set();
  for (const s of game.scenes) for (const t of s.tokens) if (t.actorId) placed.add(t.actorId);
  const now = Date.now();
  const candidates = game.actors.filter(a => a.getFlag("dnd5e", "originalActor") && !placed.has(a.id));
  const spent = candidates.filter(a => now - (a._stats?.createdTime ?? 0) > SWEEP_AGE_MS);
  if (spent.length) await Actor.implementation.deleteDocuments(spent.map(a => a.id));
  const young = candidates.filter(a => !spent.includes(a));
  if (young.length) {
    const wait = Math.max(...young.map(a => SWEEP_AGE_MS - (now - (a._stats?.createdTime ?? now)))) + 500;
    scheduleSweep(wait);
  }
}
let sweepTimer = null;
let sweepAt = Infinity;
function scheduleSweep(ms = 3000) {
  if (!game.users.activeGM?.isSelf) return;
  const at = Date.now() + ms;
  if (sweepTimer && sweepAt <= at) return;           // an earlier sweep is already coming
  clearTimeout(sweepTimer);
  sweepAt = at;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    sweepAt = Infinity;
    sweepSpentForms().catch(err => log.warn("sweep failed", err));
  }, ms);
}
for (const h of ["updateToken", "deleteToken"]) Hooks.on(h, () => scheduleSweep(3000));
Hooks.on("updateActor", (actor, changes) => {
  if (!changes?.flags?.dnd5e || !actor.getFlag("dnd5e", "originalActor")) return;
  if (!actor.getFlag("dnd5e", "isPolymorphed")) scheduleSweep(1500);
});
Hooks.once("ready", () => scheduleSweep(3000));

// pentaryn-importer creates and FREEZES game.pentaryn, so a bare assignment throws in
// strict mode. Rebuild the namespace instead (same pattern as pentaryn-ties).
Hooks.once("ready", () => {
  const api = { shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms };
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, transform: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn.transform = api;
  }
});
