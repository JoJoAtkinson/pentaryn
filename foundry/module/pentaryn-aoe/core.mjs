/**
 * Pure helpers for pentaryn-aoe — no Foundry globals, so test/run.mjs can prove them in node.
 *
 * Everything that decides *who* is in an area, *what* a save is worth, and *whether* an
 * attack rolls damage lives here. The hook files only fetch documents and call these.
 */

export const MODULE = "pentaryn-aoe";
export const SHORT = "aoe";
export const NS = "aoe";
export const VERSION = "0.4.0";                          // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-aoe/api@1";            // bump the major on a published-shape change
export const I18N = "PENTARYN_AOE";
export const CSS = "pa-";
export const FLAG_SCOPE = MODULE;
/** aoe emits no events of its own. */
export const HOOKS = Object.freeze({});

/** Read this module's flags without getFlag(): getFlag throws while the module is inactive (hot-patch). */
export function aoeFlags(doc) {
  return doc?.flags?.[MODULE] ?? {};
}

/** Is this token (a TokenDocument) one of our area handles? The token flag only; see isHandleTarget. */
export const isHandle = t => !!aoeFlags(t).handle;

/** A server refusal because the document is already there (the other session's create won). */
export const alreadyExists = err => /already exists/i.test(err?.message ?? "");

/** A server refusal because the document is already gone (the other session's delete won). */
export const doesNotExist = err => /does not exist/i.test(err?.message ?? "");

/**
 * A resolution's stored damages as `actor.applyDamage` / `calculateDamage` want them: each row's
 * `properties` array becomes a Set. The input is not mutated; no damages → [].
 * @param {{value: number, type: string, properties?: string[]}[]|undefined|null} damages
 */
export function hydrateDamages(damages) {
  return (damages ?? []).map(d => ({ ...d, properties: new Set(d.properties ?? []) }));
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

/** How far back the GM's save matching and api.latestResolution look in the chat log (messages). */
export const RECENT_MESSAGES = 60;

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
  if (regionOfActivity(flags5e, activityUuid)) return true;
  if (!itemUuid) return false;
  const prefix = `${itemUuid}.Activity.`;
  return [flags5e.activity, flags5e.origin].some(u => typeof u === "string" && u.startsWith(prefix));
}

/**
 * Is a region placement following the mouse on this RegionLayer? Core v14 keeps the placement's
 * context on `_placementContext` from RegionLayer#placeRegions until it is confirmed or cancelled,
 * and `_cancelPlacement` is what core's own Escape calls (escape.mjs, Part E).
 *
 * -39: pentaryn-cursors reads the same internal for a different question — `placementActive`
 * (cursors-core.mjs, called from board.mjs) asks "is the preview drawn on the layer yet?" (false
 * until the first pointer move); this asks "can a placement be cancelled?" (true as soon as the
 * context exists). Do not merge them. One adjustments row covers both reads:
 * core-region-placement-escape.
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
export function selfApplyReason({ casterUuid = null, targetUuids = [], affectsType = null, activityType = null, effectCount = 0, rangeUnits = null, untargeted = false } = {}) {
  if (!casterUuid || effectCount !== 1) return null;
  if (activityType === "enchant") return null;
  if (affectsType === "self") return "self-only";
  if (activityType === "attack" || activityType === "save") return null;
  const unique = [...new Set((targetUuids ?? []).filter(Boolean))];
  // usability Area 6 re-run (W1): Mage Armor cast with nothing targeted spent the slot and applied
  // nothing, and a player has no tray to fix it. A touch (or self-range) spell for one willing
  // creature, cast at nobody, means the caster. `untargeted` is the setting that allows it.
  if (!unique.length) {
    return untargeted && UNTARGETED_AFFECTS.has(affectsType) && UNTARGETED_RANGES.has(rangeUnits) ? "untargeted-self" : null;
  }
  if (unique.length !== 1 || unique[0] !== casterUuid) return null;
  return "targeted-self";
}

/** Who an untargeted touch spell may default to the caster for (dnd5e target.affects.type). */
const UNTARGETED_AFFECTS = new Set(["creature", "willing", "ally"]);
/** Only a touch (or self) range: a ranged buff cast at nobody is a mistake to ask about, not a guess. */
const UNTARGETED_RANGES = new Set(["touch", "self"]);

/**
 * The same spell's effect already on the actor, to replace rather than stack (2024 PHB, Combining
 * Magical Effects: the effects of the same spell cast more than once don't combine). Shield cast
 * from a slot and then from a Ring of Spell Storing gave +10 AC: dnd5e refreshes an effect only
 * when it came from the same source effect, and the ring's Shield is another item.
 * @param {{name: string, spell: string|null}} incoming  the effect's name and its spell's identifier
 * @param {{id: string, name: string, spell: string|null, disabled?: boolean}[]} existing
 * @returns {string|null} the id of the effect to replace
 */
export function sameSpellEffect(incoming, existing = []) {
  if (!incoming?.spell || !incoming.name) return null;
  const hit = (existing ?? []).find(e => e && !e.disabled && e.spell === incoming.spell && e.name === incoming.name);
  return hit?.id ?? null;
}

/**
 * Aim a cone or line whose range is Self (Cone of Cold, Burning Hands, Lightning Bolt) from the
 * caster toward the pointer. Core's placement puts the shape's origin under the pointer with
 * rotation 0 (east), so the area left the caster entirely (usability Area 6 re-run, W13). The
 * origin is where the line from the token's centre toward the pointer leaves the token's box, so
 * the caster is not inside their own cone (PHB: a Cone's point of origin isn't in its area).
 * @param {{x:number,y:number}} centre   the caster token's centre (px)
 * @param {number} halfW                 half the token's width (px)
 * @param {number} halfH                 half the token's height (px)
 * @param {{x:number,y:number}} pointer  the pointer (px)
 * @returns {{x:number, y:number, rotation:number}}  rotation in degrees, 0 = east, clockwise
 */
export function aimFromCaster(centre, halfW, halfH, pointer) {
  const dx = (pointer?.x ?? centre.x) - centre.x, dy = (pointer?.y ?? centre.y) - centre.y;
  if (!dx && !dy) return { x: centre.x + halfW, y: centre.y, rotation: 0 };
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const t = Math.min(ax ? halfW / ax : Infinity, ay ? halfH / ay : Infinity);
  let rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  if (rotation < 0) rotation += 360;
  const r = v => Math.round(v * 1000) / 1000;
  return { x: r(centre.x + dx * t), y: r(centre.y + dy * t), rotation: r(rotation) };
}

/** Is this a Self-range cone or line that should be aimed from its caster? */
export function aimsFromCaster({ rangeUnits = null, templateType = null } = {}) {
  return rangeUnits === "self" && ["cone", "line", "ray"].includes(templateType);
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
 * Handle tokens that still list a just-deleted region in their `_regions`. Core's active GM drops
 * the region from every token inside it with one update right after the deletion; a handle deleted
 * before that update lands made the server log "undefined id [...] does not exist in the
 * EmbeddedCollection" (Area 4 live run, D10). The handle is deleted once this is empty.
 * @param {{id: string, _regions?: string[]}[]} tokens  source views of the handle tokens
 * @param {string} regionId
 * @returns {string[]}  ids still waiting
 */
export function stillListing(tokens, regionId) {
  return (tokens ?? []).filter(t => Array.isArray(t?._regions) && t._regions.includes(regionId)).map(t => t.id);
}

/** Is this Argon bind target (a Token, a TokenDocument or an Actor) one of our area handles? */
export function isHandleTarget(target, module = MODULE) {
  const doc = target?.document ?? target;
  const flag = (d) => !!d?.flags?.[module]?.handle;
  return flag(doc) || flag(doc?.token) || (!!doc?.flags?.[module]?.handleActor);
}

/* -------------------------------------------- */
/*  Usability Area 5 re-run (sorcerer)          */
/* -------------------------------------------- */

/**
 * Does a newer resolution make an older one stale? The same activity and the same area (a moved
 * area re-rolled, S3), or a re-roll from the same usage card after its area was removed (S16: the
 * older 5-row tray stayed live beside the new 1-row one, so the GM could have applied both).
 * @param {{activity?: string, region?: string|null, usage?: string|null, superseded?: boolean}} older
 * @param {{activity?: string, region?: string|null, usage?: string|null}} newer
 */
export function supersedes(older, newer) {
  if (!older || !newer || older.superseded || older.activity !== newer.activity) return false;
  if (older.region === newer.region) return true;
  return !!newer.usage && older.usage === newer.usage;
}

/**
 * Careful Spell (PHB 2024): "choose a number of those creatures up to your Charisma modifier
 * (minimum of one creature). A chosen creature automatically succeeds on its saving throw against the
 * spell, and it takes no damage if it would normally take half damage on a successful save."
 * We choose for the player: the caster's side (same token disposition) in the area, player
 * characters first, never the caster; the GM can change any row in the tray.
 * @param {object[]} tokens  describeToken() shapes, plus `disposition`
 * @param {{casterActorId?: string|null, casterDisposition?: number|null, max?: number}} o
 * @returns {string[]}  token ids
 */
export function carefulTargets(tokens, { casterActorId = null, casterDisposition = null, max = 1 } = {}) {
  if (casterDisposition === null || casterDisposition === undefined) return [];
  const n = Math.max(1, Math.floor(Number(max) || 1));
  const side = (tokens ?? []).filter(t => isCreature(t) && t.baseActorId !== casterActorId && t.disposition === casterDisposition && !t.hidden);
  side.sort((a, b) => Number(!!b.hasPlayerOwner) - Number(!!a.hasPlayerOwner));
  return side.slice(0, n).map(t => t.id);
}

/** Mark rows protected by Careful Spell: an automatic success, and no damage where a success halves it. */
export function protectRows(rows, ids, onSave) {
  const set = new Set(ids ?? []);
  for (const row of rows ?? []) {
    if (!set.has(row.id) || row.caster) continue;
    row.protected = true;
    row.save = { total: null, success: true, messageId: null, careful: true };
    const m = multiplierFor(true, onSave);
    row.multiplier = m === 0.5 ? 0 : m;
  }
  return rows;
}

/**
 * A Careful Spell use bound to a combat turn ("combatId:round:combatant") of a combat that was
 * deleted: it can never apply again, so it is cleared (usability Area 9 found one on Marrith).
 * An out-of-combat use (no key) expires by time and is left alone.
 */
export function carefulStale(flag, combatId) {
  return !!(combatId && flag && typeof flag === "object" && typeof flag.key === "string" && flag.key.startsWith(`${combatId}:`));
}

/**
 * Is a Careful Spell use still waiting for this cast? Metamagic ends after use (metamagic-disarm):
 * the caster's next spell cast takes it (binds it to that usage card), in or out of combat, with no
 * time window. In combat it is also bound to the turn it was used on. Re-rolling the bound card
 * keeps the protection; a later, different spell does not get it.
 * @param {{at?: number, key?: string|null, usage?: string|null}|null} flag
 * @param {{combatKey?: string|null, usage?: string|null}} o
 * @returns {boolean}
 */
export function carefulApplies(flag, { combatKey = null, usage = null } = {}) {
  if (!flag || typeof flag !== "object") return false;
  if (flag.usage && flag.usage !== usage) return false;
  if (flag.key) return flag.key === combatKey;
  return true;
}

/**
 * Was an area spell's placement cancelled (Escape, right-click) after its slot or charge was spent?
 * dnd5e 6 consumes before the area follows the mouse and offers only a Refund button on the card.
 * @param {{wanted?: boolean, placed?: number, canPlace?: boolean, consumed?: boolean}} o
 */
export function placementCancelled({ wanted = false, placed = 0, canPlace = true, consumed = false } = {}) {
  return !!wanted && !!canPlace && !(Number(placed) > 0) && !!consumed;
}

/**
 * What the caster's own damage card tells a player about the GM-only tray (no NPC numbers).
 * @returns {"waiting"|"applied"|"superseded"|null}
 */
export function playerStatus(res) {
  if (!res) return null;
  if (res.superseded) return "superseded";
  if (!res.rows?.some(r => r.apply)) return null;
  return allApplied(res.rows) ? "applied" : "waiting";
}

/**
 * A resolution as an LLM or the console reads it (finding -10): no images, no message ids, the
 * Apply count, and the players' status. null for no resolution. Plain data, depth 3.
 * @returns {{item: string, ability: string, dc: number|null, onSave: string, region: string|null,
 *   superseded: boolean, applicable: number, rows: object[], careful: object|null,
 *   playerStatus: "waiting"|"applied"|"superseded"|null}|null}
 */
export function summariseResolution(res) {
  if (!res) return null;
  const rows = res.rows ?? [];
  return {
    item: res.itemName ?? "",
    ability: res.ability ?? null,
    dc: res.dc ?? null,
    onSave: res.onSave ?? null,
    region: res.region ?? null,
    superseded: !!res.superseded,
    applicable: applicableRows(rows).length,
    rows: rows.map(r => ({
      id: r.id, name: r.name, kind: r.kind, apply: !!r.apply,
      save: r.save ? { total: r.save.total ?? null, success: !!r.save.success } : null,
      multiplier: r.multiplier ?? null, applied: !!r.applied, hp: r.hp ?? null, caster: !!r.caster, protected: !!r.protected,
    })),
    careful: res.careful ?? null,
    playerStatus: playerStatus(res),
  };
}
