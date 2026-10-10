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
 * cone/line/anything else: the shape origin (the caster's end).
 */
export function centreOf(shape) {
  if (!shape) return { x: 0, y: 0 };
  switch (shape.type) {
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
 * Was this template region placed by this spell? `flags5e` is the region's flags.dnd5e
 * ({ item, origin }). Matches by the spell item, so a spell with two template activities is
 * cleared by one press; the activity uuid is the fallback for a region without an item flag.
 */
export function regionFromSpell(flags5e, { itemUuid = null, activityUuid = null } = {}) {
  if (!flags5e) return false;
  if (itemUuid && flags5e.item === itemUuid) return true;
  if (activityUuid && flags5e.origin === activityUuid) return true;
  return !!itemUuid && typeof flags5e.origin === "string" && flags5e.origin.startsWith(`${itemUuid}.Activity.`);
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

/**
 * The dnd5e area template whose placement Escape should cancel, or null.
 * `children` is canvas.templates.preview.children: dnd5e 5.3.3 AbilityTemplate#drawPreview adds
 * the template itself there and _finishPlacement clears it, so a child that can still cancel
 * itself (has _onCancelPlacement, not destroyed) means a placement is in progress. The newest
 * one wins, the one following the mouse. Anything else in the container (a core drag preview)
 * is not ours to cancel.
 */
export function placingTemplate(children) {
  const list = Array.isArray(children) ? children : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const c = list[i];
    if (c && !c.destroyed && typeof c._onCancelPlacement === "function") return c;
  }
  return null;
}
