/**
 * Pure helpers for pentaryn-aoe — no Foundry globals, so test/run.mjs can prove them in node.
 *
 * Everything that decides *who* is in an area, *what* a save is worth, and *whether* an
 * attack rolls damage lives here. The hook files only fetch documents and call these.
 */

export const MODULE = "pentaryn-aoe";

/** Read this module's flags without getFlag(): getFlag throws while the module is inactive (hot-patch). */
export function aoeFlags(doc) {
  return doc?.flags?.[MODULE] ?? {};
}

/**
 * Where the handle sits for a region shape, in scene pixels.
 * circle/ellipse: centre · rectangle: centre after rotation about its anchor · polygon: vertex mean ·
 * emanation (dnd5e 6, a stationary one; a moving one is attached to its caster and gets no handle):
 * the middle of its token-shaped base, whose width/height are in grid units, hence gridSize ·
 * cone/line/anything else: the shape origin (the caster's end).
 */
export function centreOf(shape, { gridSize = 100 } = {}) {
  if (!shape) return { x: 0, y: 0 };
  switch (shape.type) {
    case "emanation":
    case "token": {
      const b = shape.type === "token" ? shape : (shape.base ?? {});
      return { x: (b.x ?? 0) + ((b.width ?? 1) * gridSize) / 2, y: (b.y ?? 0) + ((b.height ?? 1) * gridSize) / 2 };
    }
    case "circle":
    case "ellipse":
    case "ring":
      return { x: shape.x, y: shape.y };
    case "rectangle": {
      const w = shape.width ?? 0, h = shape.height ?? 0;
      const ax = shape.anchorX ?? 0, ay = shape.anchorY ?? 0;
      // Offset from the anchor to the centre, rotated by the shape's rotation.
      const dx = (0.5 - ax) * w, dy = (0.5 - ay) * h;
      const r = ((shape.rotation ?? 0) * Math.PI) / 180;
      return {
        x: shape.x + dx * Math.cos(r) - dy * Math.sin(r),
        y: shape.y + dx * Math.sin(r) + dy * Math.cos(r)
      };
    }
    case "polygon": {
      const p = shape.points ?? [];
      if (p.length < 2) return { x: 0, y: 0 };
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i + 1 < p.length; i += 2) { sx += p[i]; sy += p[i + 1]; n++; }
      return { x: sx / n, y: sy / n };
    }
    default:
      return { x: shape.x ?? 0, y: shape.y ?? 0 };
  }
}

/** Damage multiplier from a save result. Fail → full; success → by the activity's onSave. */
export function multiplierFor(success, onSave) {
  if (success === null || success === undefined) return null;
  if (!success) return 1;
  return { half: 0.5, none: 0, full: 1 }[onSave] ?? 0.5;
}

/** The multipliers the tray offers, same set as dnd5e's DamageApplicationElement. */
export const MULTIPLIERS = [0, 0.25, 0.5, 1, 2];

/**
 * Is this token a creature that can be caught in an area?
 * `t` is a plain description so node can test it:
 *   { handle, actorType, hpMax, isPile, isHandleActor }
 */
export function isCreature(t) {
  if (!t || t.handle || t.isHandleActor || t.isPile) return false;
  if (!["character", "npc"].includes(t.actorType)) return false;
  return Number(t.hpMax) > 0;
}

/** manual = a player rolls it (PCs, their summons and forms); auto = the GM's client rolls it. */
export function rowKind(t) {
  return t.hasPlayerOwner ? "manual" : "auto";
}

/**
 * Build resolution rows from described tokens.
 * Unticked by default: the caster (Q3 — listed, GM ticks), a hidden token, and anyone at 0 HP.
 */
export function buildRows(tokens, { casterActorId = null } = {}) {
  const rows = [];
  const seen = new Set();
  for (const t of tokens) {
    if (!isCreature(t) || seen.has(t.id)) continue;
    seen.add(t.id);
    const isCaster = !!casterActorId && t.baseActorId === casterActorId;
    rows.push({
      id: t.id,
      actor: t.actorUuid,
      name: t.name,
      img: t.img ?? null,
      kind: rowKind(t),
      save: null,
      multiplier: null,
      apply: !(isCaster || t.hidden || Number(t.hpValue) <= 0),
      caster: isCaster,
      applied: false,
      applyMessage: null
    });
  }
  return rows;
}

/** Fill a row from a save result (mutates and returns the row). An overridden multiplier is kept. */
export function fillSave(row, { total, success, messageId = null }, onSave) {
  row.save = { total, success: !!success, messageId };
  if (!row.overridden) row.multiplier = multiplierFor(!!success, onSave);
  return row;
}

/** Rows Apply would act on now: ticked, not yet applied, with a known multiplier. */
export function applicableRows(rows, rowIds = null) {
  return rows.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined
    && (!rowIds || rowIds.includes(r.id)));
}

/** True once every ticked row has been applied (instantaneous areas are then removed). */
export function allApplied(rows) {
  const ticked = rows.filter(r => r.apply);
  return ticked.length > 0 && ticked.every(r => r.applied);
}

/**
 * Which manual row does a save-roll message answer?
 * res:  the resolution · info: { ability, actorUuid, actorId, tokenId, requestId, created }
 * Returns the row index or -1. A row already holding a save is never overwritten here.
 */
export function matchSave(res, info, { createdAfter = 0 } = {}) {
  if (!res || res.superseded) return -1;
  const viaRequest = !!info.requestId && info.requestId === res.request;
  if (!viaRequest) {
    if (info.ability !== res.ability) return -1;
    if ((info.created ?? 0) < createdAfter) return -1;
  }
  return res.rows.findIndex(r => r.kind === "manual" && !r.save && (
    (info.actorUuid && r.actor === info.actorUuid)
    || (info.tokenId && r.id === info.tokenId)
    || (info.actorId && r.actor?.endsWith?.(`Actor.${info.actorId}`) && !r.actor.includes(".Token."))
  ));
}

/**
 * Auto damage on hit: should this attack roll go straight to damage?
 * roll: { total, target, isCritical, isFumble }. No target AC known → roll damage anyway.
 */
export function shouldAutoDamage(roll) {
  if (!roll) return false;
  if (roll.isFumble) return false;
  if (roll.isCritical) return true;
  const known = Number.isFinite(roll.target);
  return !(known && roll.total < roll.target);
}

/** Pick the newest of several candidate regions: by createdTime, else the last in scene order. */
export function newestRegion(regions) {
  if (!regions.length) return null;
  let best = regions[regions.length - 1];
  let bestT = best._stats?.createdTime ?? -Infinity;
  for (const r of regions) {
    const t = r._stats?.createdTime ?? -Infinity;
    if (t > bestT) { best = r; bestT = t; }
  }
  return best;
}

/* -------------------------------------------- */
/*  Part A — which templates belong to a spell  */
/* -------------------------------------------- */

/**
 * Is this region a spell area template? dnd5e 6 marks its template regions with
 * flags.dnd5e.activity; regions placed under 5.3.3 carry core's flags.core.MeasuredTemplate instead
 * (the 6.0 migration does not rewrite them). Portal and scene-link regions have neither.
 */
export function isTemplateRegion(r) {
  return !!(r?.flags?.dnd5e?.activity || r?.flags?.core?.MeasuredTemplate);
}

/** The token id a region is attached to, or null (the live document holds a doc, the source an id). */
export function attachedTokenId(region) {
  const raw = region?._source?.attachment?.token ?? region?.attachment?.token ?? null;
  if (!raw) return null;
  return typeof raw === "string" ? raw : (raw.id ?? null);
}

/**
 * Is this region attached to a token that is not one of our handles? dnd5e 6 attaches an emanation
 * (Spirit Guardians) to its caster so it moves with them; giving it a handle would re-attach it to the
 * handle and strand it. `tokenById` looks the id up on the region's scene. A missing token counts as
 * "someone else's": we never steal an attachment we cannot see.
 */
export function attachedToOther(region, tokenById) {
  const id = attachedTokenId(region);
  if (!id) return false;
  const tk = tokenById?.(id);
  return !(tk && aoeFlags(tk).handle);
}

/**
 * Was this template region placed by this spell? `flags5e` is the region's flags.dnd5e:
 *   dnd5e 6:     { activity: <activity uuid>, item: <item uuid>, origin: <caster TOKEN uuid> }
 *   dnd5e 5.3.3: { item: <item uuid>, origin: <activity uuid> }
 * Matches by the spell item, so a spell with two template activities is cleared by one press; the
 * activity uuid (either field) is the fallback for a region without an item flag.
 */
export function regionFromSpell(flags5e, { itemUuid = null, activityUuid = null } = {}) {
  if (!flags5e) return false;
  if (itemUuid && flags5e.item === itemUuid) return true;
  if (activityUuid && (flags5e.activity === activityUuid || flags5e.origin === activityUuid)) return true;
  if (!itemUuid) return false;
  const prefix = `${itemUuid}.Activity.`;
  return [flags5e.activity, flags5e.origin].some(u => typeof u === "string" && u.startsWith(prefix));
}

/**
 * Is a region placement following the mouse on this RegionLayer? Core v14 keeps the placement's
 * context on `_placementContext` from RegionLayer#placeRegions until it is confirmed or cancelled,
 * and `_cancelPlacement` is what core's own Escape calls (escape.mjs, Part E).
 * @param {{ _placementContext?: object|null, _cancelPlacement?: Function }|null|undefined} layer
 */
export function placementInProgress(layer) {
  return !!layer?._placementContext && typeof layer._cancelPlacement === "function";
}

/**
 * Where a handle token goes vertically: { level, elevation }.
 *   dnd5e 6 (TemplatePlacement.fromActivity) creates the region with `levels: [the viewed level]`
 *   and no elevation, so its SOURCE bottom is null and the prepared `region.elevation.bottom` is
 *   -Infinity (core RegionDocument#prepareBaseData) — a token elevation must be a finite number,
 *   so handing that to Token creation fails validation and no handle is made. The handle goes on
 *   the region's level, at the region's finite source bottom, else that level's base, else 0.
 *   5.3.3 (core's MeasuredTemplate migration): bottom 0, no levels → level null (the token takes
 *   the scene's initial level and the caller gives the region that level, as before).
 * @param {{ regionLevels?: Iterable<string>, sceneHasLevel?: (id: string) => boolean,
 *           sourceBottom?: number|null, levelBase?: (id: string) => number|undefined }} input
 * @returns {{ level: string|null, elevation: number }}
 */
export function handleVertical({ regionLevels = [], sceneHasLevel = () => true, sourceBottom = null, levelBase = () => undefined } = {}) {
  const level = [...(regionLevels ?? [])].find(id => id && sceneHasLevel(id)) ?? null;
  const base = level ? levelBase(level) : undefined;
  const elevation = Number.isFinite(sourceBottom) ? sourceBottom : (Number.isFinite(base) ? base : 0);
  return { level, elevation };
}

/** Is this region the area of exactly this activity (Part B: whose area is the damage for)? */
export function regionOfActivity(flags5e, activityUuid) {
  if (!flags5e || !activityUuid) return false;
  return flags5e.activity === activityUuid || flags5e.origin === activityUuid;
}

/* -------------------------------------------- */
/*  Part D — effects that are meant for you     */
/* -------------------------------------------- */

/**
 * Should a usage card's effects go straight onto the caster? Returns why, or null.
 *   "self-only"     the activity can only affect its user (Shield) — whatever is targeted;
 *   "targeted-self" the card's one and only target is the caster (Mage Armor, Fly or
 *                   Invisibility on yourself). Not for attack or save activities, whose
 *                   effects are meant for the creature they hit.
 * Only a card with exactly one effect: several effects on one card are almost always a choice
 * (Guidance's 18 skills, Fire Shield's warm or chill, Aspect of the Wilds), and applying all of
 * them would be wrong. Those stay in the tray for someone to pick.
 */
export function selfApplyReason({ casterUuid = null, targetUuids = [], affectsType = null, activityType = null, effectCount = 0 } = {}) {
  if (!casterUuid || effectCount !== 1) return null;
  if (activityType === "enchant") return null;
  if (affectsType === "self") return "self-only";
  const unique = [...new Set((targetUuids ?? []).filter(Boolean))];
  if (unique.length !== 1 || unique[0] !== casterUuid) return null;
  if (activityType === "attack" || activityType === "save") return null;
  return "targeted-self";
}

/**
 * Effect ids on a card that nobody has applied yet. A card older than maxAgeMs counts as
 * settled, so last week's cards in the log don't light up. Once any one of a card's effects has
 * been applied the card is handled: several effects on a card are a choice (Guidance's skills,
 * Fire Shield's warm or chill), so the ones not picked must not stay "not applied" forever.
 */
export function pendingEffects(effectIds, appliedIds = [], { ageMs = 0, maxAgeMs = Infinity } = {}) {
  if (ageMs > maxAgeMs) return [];
  const done = new Set(appliedIds ?? []);
  const ids = [...new Set(effectIds ?? [])].filter(Boolean);
  if (ids.some(id => done.has(id))) return [];
  return ids;
}
