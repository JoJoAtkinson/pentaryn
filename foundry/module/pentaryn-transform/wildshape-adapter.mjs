/**
 * Pentaryn Transform — ADAPTER: Wild Shape on live documents. The lookups (original, the Wild Shape
 * activity, the known forms), the shift and the revert with everything dnd5e leaves to the table,
 * the chat line, the bonus-action mark, and who runs the automatic endings.
 *
 * dnd5e 6 fires dnd5e.preUseActivity (return false cancels) and dnd5e.postUseActivity on the client
 * of the user who used the activity, so a player's click shifts and reverts with the player's own
 * permissions (Actor#revertOriginalForm refuses non-owners). The hooks are wildshape.mjs's.
 *
 * Session state kept here (never persisted): the bonus-action mark, the forms being reverted, the
 * shifts in flight and what the synchronous dnd5e.transformActor hook needs across the gap.
 */

import {
  MODULE, activitiesOf, isWildShapeActivity, shapingPlan, durationSeconds, formatDuration,
  usesLeft, useSyncUpdates, carriedConditions, endedInForm, attributeSync, shiftBlock, runnerIs, withArticle,
  formTempHP, withoutOrigin, pruneFavorites, findWildShapeItem, wildShapeActivityOf, refundUpdate, formEntries
} from "./transform-core.mjs";
import { makeLog } from "./lib/log.mjs";
import { dnd5eAllowsPolymorphing } from "./settings.mjs";

const log = makeLog(MODULE);

/** Re-prepare this actor's tokens from their source and end their animations, before dnd5e reads them. */
export function settleTokens(actor) {
  for (const t of actor?.getActiveTokens?.(false, false) ?? []) {
    try { t.stopAnimation?.({ reset: true }); } catch (err) { log.warn(`settling ${t.name} failed`, err); }
  }
}

/* ── lookups ─────────────────────────────────────────────────────────────── */

/** True when this item is the "return to normal form" ability. */
export function isRevertItem(item) {
  return item?.getFlag?.(MODULE, "revert") === true;
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
  return wildShapeActivityOf(original(actor)?.items);
}

/** The known forms: [{ id, name, uuid, actor }] — the activity's available profiles. */
export function forms(actor) {
  return formEntries(wildShapeActivity(actor)?.availableProfiles, uuid => fromUuidSync(uuid));   // one resolve per profile (-23)
}

/** True for a form made by the Wild Shape preset. */
export function isWildShapeForm(actor) {
  return !!actor?.isPolymorphed && actor.getFlag("dnd5e", "transformOptions")?.preset === "wildshape";
}

/** False for a stale document: a form the GM's revert already deleted, a token already replaced. */
export function exists(actor) {
  if (!actor) return false;
  if (actor.isToken) return !!actor.token?.parent?.tokens?.has(actor.token.id);
  return game.actors.get(actor.id) === actor;
}

/** The druid's live Wild Shape form, if one is out (linked druids only). */
export function activeFormOf(actor) {
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
  const allowed = game.user.isGM || dnd5eAllowsPolymorphing();
  return allowed && (!!actor?.isToken || game.user.can("ACTOR_CREATE"));
}

/**
 * Warn and return the reason when `body` (the druid, or the form they are in) can't shift now.
 * Runs before any use is spent. See shiftBlock() for what each reason guards against.
 */
export function blockedShift(body, wildShapeItem) {
  const why = shiftBlock({
    busy: inflight.has(original(body)?.uuid),
    canTransform: canTransform(body),
    incapacitated: !!body?.statuses?.has("incapacitated"),
    hp: body?.system?.attributes?.hp?.value ?? null,
    hasToken: (body?.getActiveTokens?.(true, true)?.length ?? 0) > 0,
    usesLeft: usesLeft(wildShapeItem?.system?.uses)
  });
  if (why) ui.notifications.warn(_loc(BLOCK_MESSAGES[why], { name: body?.name ?? "?" }));
  return why;
}

/* ── chat ────────────────────────────────────────────────────────────────── */

export function say(actor, content) {
  return ChatMessage.implementation.create({
    content: `<p class="pentaryn-transform-line">${content}</p>`,
    speaker: ChatMessage.implementation.getSpeaker({ actor })
  }).catch(err => log.warn("chat line failed", err));
}

export const RETURN_LINES = {
  manual: "PENTARYN_TRANSFORM.Chat.Return",
  zeroHP: "PENTARYN_TRANSFORM.Chat.ZeroHP",
  incapacitated: "PENTARYN_TRANSFORM.Chat.Incapacitated",
  expired: "PENTARYN_TRANSFORM.Chat.Expired",
  longRest: "PENTARYN_TRANSFORM.Chat.LongRest"
};

/* ── bonus-action bookkeeping ────────────────────────────────────────────── */
// Argon keeps "bonus action used" on the panel instance, and every shift or revert rebinds the HUD
// to a different actor, which builds fresh panels. The token survives both, so the mark is kept per
// token and per turn; hud-panels.mjs applies it when it composes the Bonus bar.

let bonusMark = null;

function tokensOf(actor) {
  return actor?.getActiveTokens?.(false, true) ?? [];
}

// `game.combat` is only the combat this client VIEWS (a GM activating another encounter flips every
// client's view), so the mark looks for the started combat whose current turn is this token's.
export function markBonusUsed(actor) {
  for (const token of tokensOf(actor)) {
    const c = [game.combat, ...(game.combats ?? [])].find(x => x?.started && x.combatant?.tokenId === token.id);
    if (c) return void (bonusMark = { combat: c.id, round: c.round, turn: c.turn, token: token.id });
  }
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
export async function endOnDruid(host, ids) {
  const plain = [];
  for (const id of ids) {
    const effect = host.effects.get(id);
    if (!effect) continue;
    if (effect.statuses?.has("concentrating") && typeof host.endConcentration === "function") await host.endConcentration(effect);
    else plain.push(id);
  }
  // One round trip (§5.9.1, C59) for those still here: ending Concentration deletes its dependents.
  const live = plain.filter(id => host.effects.has(id));
  if (live.length) await host.deleteEmbeddedDocuments("ActiveEffect", live);
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
    if (!quiet) ui.notifications.info(_loc("PENTARYN_TRANSFORM.NotTransformed", { name: actor?.name ?? "?" }));
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
    const ws = actor.getFlag(MODULE, "wildshape") ?? null;
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

    if (!quiet) say(back, _loc(RETURN_LINES[reason] ?? RETURN_LINES.manual, { name: back.name }));
    return back;
  } finally {
    reverting.delete(key);
  }
}

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
      ui.notifications.warn(_loc("PENTARYN_TRANSFORM.NoWildShape", { name: actor?.name ?? "?" }));
      return null;
    }
    if (!activity.availableProfiles.some(p => p._id === profileId)) {
      ui.notifications.warn(_loc("PENTARYN_TRANSFORM.UnknownForm"));
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
  const update = refundUpdate(item?.system.uses);
  if (update) await item.update(update);
}

/** What shaping() needs to know about the druid, read live (the transformActor hook's fallback). */
export function metaFor(host, extra = {}) {
  const wsItem = findWildShapeItem(host.items);
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
export function shaping({ meta, source, items, effects, keepWildShape = false }) {
  const seconds = meta.seconds;
  return shapingPlan({
    meta, items, effects, keepWildShape, now: game.time.worldTime,
    source: { name: source.name, img: source.img, uuid: source.uuid },
    end: seconds ? _loc("PENTARYN_TRANSFORM.Effect.Ends", { name: meta.hostName, duration: formatDuration(seconds) })
      : _loc("PENTARYN_TRANSFORM.Effect.EndsNoTime", { name: meta.hostName }),
    effectName: _loc("PENTARYN_TRANSFORM.Effect.Name", { form: source.name })
  });
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
  const update = { [`flags.${MODULE}.wildshape`]: plan.flag };
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
export async function doShift(host, activity, profileId, uuid) {
  const itemId = activity.item.id;
  // dnd5e 6 adds a "form" transform mode (effects on the actor, no new actor). Wild Shape in
  // 6.0.6 is still mode "cr"; a form-mode Wild Shape would half-shift here, so refuse it loudly.
  if (activity.transform?.mode === "form") {
    await refund(host, itemId);
    ui.notifications.warn(_loc("PENTARYN_TRANSFORM.FormMode", { name: activity.item.name }));
    return null;
  }
  const source = uuid ? await fromUuid(uuid) : null;
  if (!source) {
    await refund(host, itemId);
    ui.notifications.error(_loc("PENTARYN_TRANSFORM.SourceMissing"));
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
  const starry = host.effects.find(e => e.getFlag(MODULE, "starry"));
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
    ui.notifications.error(_loc("PENTARYN_TRANSFORM.ShiftFailed", { name: meta.hostName }));
    return null;
  }
  if (token) {
    // The shift happened: never refund past this point, even if the extras fail.
    await shapeTokenForm(form, source, meta).catch(err => log.error("shaping the token form failed", err));
  }
  const uses = (token ? form : host).items.get(itemId)?.system.uses;
  say(token ? form : host, _loc("PENTARYN_TRANSFORM.Chat.Shift", {
    name: meta.hostName, form: withArticle(source.name), left: usesLeft(uses) ?? 0, max: uses?.max ?? 0,
    duration: seconds ? formatDuration(seconds) : "—"
  }));
  return form;
}

/* ── ending without a click ──────────────────────────────────────────────── */

/** True on exactly one client for this actor: the active GM, else the first active owner. */
export function isRunner(actor) {
  const activeGMId = game.users.activeGM?.id ?? null;
  // A connected GM always wins pickRunner: no owner scan (transform-creatures-1).
  if (activeGMId) return runnerIs(game.user.id, { activeGMId, ownerIds: [] });
  const ownerIds = game.users.filter(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER")).map(u => u.id);
  return runnerIs(game.user.id, { activeGMId, ownerIds });
}

/* ── what the hooks (wildshape.mjs) read across the gap ──────────────────── */

/** True while this client's revert() of that form is running. */
export function isReverting(uuid) {
  return reverting.has(uuid);
}

/** The druid's shaping meta doShift() left for dnd5e.transformActor, if a shift is in flight. */
export function pendingMeta(uuid) {
  return pending.get(uuid);
}

/** Hand a shift started in dnd5e.postUseActivity to shift(), which awaits it; forgotten once settled. */
export function trackShift(uuid, job) {
  inflight.set(uuid, job);
  job.finally(() => { if (inflight.get(uuid) === job) inflight.delete(uuid); });
}
