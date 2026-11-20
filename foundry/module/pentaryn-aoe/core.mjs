/**
 * Pure helpers for pentaryn-aoe — no Foundry globals, so test/run.mjs can prove them in node.
 *
 * Everything that decides *who* is in an area, *what* a save is worth, and *whether* an
 * attack rolls damage lives here. The hook files only fetch documents and call these.
 */

export const MODULE = "pentaryn-aoe";
export const SHORT = "aoe";
export const NS = "aoe";
export const VERSION = "0.6.3";                          // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-aoe/api@1";            // bump the major on a published-shape change
export const I18N = "PENTARYN_AOE";
export const CSS = "pa-";
export const FLAG_SCOPE = MODULE;
/** aoe emits no events of its own. */
export const HOOKS = Object.freeze({});

// Area geometry: centreOf, handleTopLeft, AREA_WALL_RULES, edgeClipsArea, areaClipOrigin, instantaneous,
// instantSpellArea.
export * from "./core/areas.mjs";

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

/** Damage multiplier from a save result. Fail → full; success → by the activity's onSave. */
export function multiplierFor(success, onSave) {
  if (success === null || success === undefined) return null;
  if (!success) return 1;
  return { half: 0.5, none: 0, full: 1 }[onSave] ?? 0.5;
}

/** The multipliers the tray offers, same set as dnd5e's DamageApplicationElement. */
export const MULTIPLIERS = [0, 0.25, 0.5, 1, 2];
/** EXT-3: the tray's label for each of MULTIPLIERS, kept beside them (test/multiplier-labels pins the coverage). */
export const MULTIPLIER_LABELS = Object.freeze({ 0: "×0", 0.25: "×¼", 0.5: "×½", 1: "×1", 2: "×2" });

/** How far back the GM's save matching and api.latestResolution look in the chat log (messages). */
export const RECENT_MESSAGES = 60;

/** Part I: how long a player's Apply waits for the active GM to land the rows they do not own (ms). */
export const RELAY_TIMEOUT_MS = 8000;

/** Part I: how long after a damage or healing card is posted its author's new targets still fill it (ms). */
export const LATE_TARGET_WINDOW_MS = 10 * 60_000;

/**
 * Part I: the dnd5e 6 message types that carry a `<damage-application>` tray. dnd5e types a healing
 * roll's card `healing` (`HealingMessageData`, the same damage-card template), not `damage`; 0.6.0 and
 * 0.6.1 asked for `damage` alone, so no healing card was wired, followed or relayed (playtest 2026-11-07).
 */
export const APPLY_CARD_TYPES = Object.freeze(["damage", "healing"]);
/** Is this message type a damage or healing card (one Apply from the card acts on)? */
export const isApplyCard = type => APPLY_CARD_TYPES.includes(type);

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

/**
 * Fill a row from a save result (mutates and returns the row). An overridden multiplier is kept.
 * R5: success null (no DC to judge it against) stays null, and so does the multiplier ('?').
 */
export function fillSave(row, { total, success, messageId = null }, onSave) {
  const passed = success === null || success === undefined ? null : !!success;
  row.save = { total, success: passed, messageId };
  if (!row.overridden) row.multiplier = multiplierFor(passed, onSave);
  return row;
}

/** Rows Apply would act on now: ticked, not yet applied, with a known multiplier. */
export function applicableRows(rows, rowIds = null) {
  return rows.filter(r => r.apply && !r.applied && r.multiplier !== null && r.multiplier !== undefined
    && (!rowIds || rowIds.includes(r.id)));
}

/**
 * aoe-edge-2: a tray whose area can no longer change — superseded, or any row already applied.
 * Re-resolving it would revive it or reset applied rows, so the same damage could land twice.
 */
export function areaLocked(res) {
  return !!res && (!!res.superseded || (res.rows ?? []).some(r => r.applied));
}

/** True once every ticked row has been applied (instantaneous areas are then removed). */
export function allApplied(rows) {
  const ticked = rows.filter(r => r.apply);
  return ticked.length > 0 && ticked.every(r => r.applied);
}

/**
 * Which manual row does a save-roll message answer?
 * res:  the resolution · info: { ability, actorUuid, actorId, tokenId, requestId, usageId, created }
 * Returns the row index or -1. A row already holding a save is never overwritten here.
 * J2: a save threaded under the spell's own usage card (`info.usageId === res.usage`, the card's
 * Saving Throw button) answers whenever it was rolled, before or after the damage; any other save
 * must be newer than the damage roll. The ability must match either way.
 */
export function matchSave(res, info, { createdAfter = 0 } = {}) {
  if (!res || res.superseded) return -1;
  const viaRequest = !!info.requestId && info.requestId === res.request;
  const viaUsage = !!info.usageId && info.usageId === res.usage;
  if (!viaRequest) {
    if (info.ability !== res.ability) return -1;
    if (!viaUsage && (info.created ?? 0) < createdAfter) return -1;
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

/**
 * J1: should using a save activity roll its damage at once (the sibling of shouldAutoDamage)?
 * Only a save activity with damage parts and at least one recorded target; never one that places
 * an area (its damage waits for the area, Part B lists who is inside), and a narrated use with no
 * target posts nothing extra.
 * @param {{type?: string, damageParts?: number, targets?: number, template?: string|null}} use
 */
export function shouldAutoDamageOnUse({ type = null, damageParts = 0, targets = 0, template = null } = {}) {
  if (type !== "save") return false;
  if (!(Number(damageParts) > 0) || !(Number(targets) > 0)) return false;
  return !template;
}

/** The rolled total of a card's damage descriptions (`[{ value, type }]`); 0 for none. */
export function damageTotal(damages) {
  return (damages ?? []).reduce((n, d) => n + (Number(d?.value) || 0), 0);
}

/**
 * B5: the same damage descriptions re-totalled to `amount` (a total the player reported from real
 * dice), each type keeping its share of the roll. Whole numbers that add up to `amount` exactly
 * (largest remainder); a roll with no total gives the whole amount to its first part. `amount`
 * null, undefined or not a finite number ≥ 0 → the input, unchanged. Never mutates.
 * @param {{value: number, type: string, properties?: *}[]} damages
 * @param {number|null|undefined} amount
 */
export function scaleDamages(damages, amount) {
  const list = damages ?? [];
  if (amount === null || amount === undefined || !Number.isFinite(Number(amount)) || Number(amount) < 0) return list;
  const target = Math.floor(Number(amount));
  const total = damageTotal(list);
  if (!list.length) return list;
  if (total <= 0) return list.map((d, i) => ({ ...d, value: i === 0 ? target : 0 }));
  const exact = list.map(d => (Math.max(0, Number(d.value) || 0) * target) / total);
  const floors = exact.map(v => Math.floor(v));
  let left = target - floors.reduce((n, v) => n + v, 0);
  const order = exact.map((v, i) => [v - floors[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of order) { if (left <= 0) break; floors[i] += 1; left -= 1; }
  return list.map((d, i) => ({ ...d, value: floors[i] }));
}

/**
 * B5: what a typed amount means for a row. `null` when the field is blank, not a number, negative,
 * or says the rolled total again (no override); else the whole number typed.
 * @param {string|number|null|undefined} raw   the field's value
 * @param {number} total                       the card's rolled total
 */
export function rowAmount(raw, total) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  const whole = Math.floor(n);
  return whole === Number(total) ? null : whole;
}

/**
 * Part I: the rows an Apply press lands here and the rows the active GM lands for this user.
 * A row with a 0 multiplier applies nothing and goes nowhere. Owned rows are local; the rest are
 * relayed (a GM owns everything, so a GM relays nothing).
 * @param {{uuid: string, owner: boolean, multiplier: number, amount?: number|null}[]} rows
 * @returns {{ local: object[], relay: object[] }}
 */
export function splitApplyRows(rows) {
  const out = { local: [], relay: [] };
  for (const r of rows ?? []) {
    if (!r?.uuid || !(Number(r.multiplier) > 0)) continue;
    (r.owner ? out.local : out.relay).push(r);
  }
  return out;
}

/**
 * Part I (late targets): the one damage or healing card (`isApplyCard`) this user's new targets fill — the
 * newest card they authored within `windowMs` that recorded no targets at use time (or that these late
 * targets already filled, `lateTargets`) and that nobody has applied yet. Plain descriptions:
 * `{ id, type, author, timestamp, targets, lateTargets, applied }`. Null when there is none.
 * @param {object[]} messages   oldest first, as the chat log holds them
 * @param {{ userId: string, now: number, windowMs?: number }} who
 */
export function lateTargetCard(messages, { userId, now, windowMs = LATE_TARGET_WINDOW_MS } = {}) {
  if (!userId) return null;
  for (let i = (messages ?? []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || !isApplyCard(m.type) || m.author !== userId || m.applied) continue;
    if (!(Number(m.targets) === 0 || m.lateTargets)) continue;
    if ((now ?? 0) - (m.timestamp ?? 0) > windowMs) continue;
    return m.id;
  }
  return null;
}

/**
 * Part I: which rows an Apply press on dnd5e's tray lands. The rows dnd5e lists (`listed`: the uuids
 * of its `<option>`s), always — what the tray shows is what Apply hits. The one fallback: dnd5e lists
 * nobody (the card recorded no targets and nothing is selected) and a player holds targets, then those
 * targets are the rows (`late: true`). A GM's habit is select, so a GM gets the empty list and nothing
 * lands; a card that recorded targets never falls back (the user switched to selected and selected
 * nobody: nothing lands, as dnd5e).
 * @param {{ listed?: string[], recorded?: number, targeted?: string[], isGM?: boolean }} o
 * @returns {{ uuids: string[], late: boolean }}
 */
export function applyTargets({ listed = [], recorded = 0, targeted = [], isGM = false } = {}) {
  const shown = (listed ?? []).filter(Boolean);
  if (shown.length || isGM || Number(recorded) > 0 || !(targeted ?? []).length) return { uuids: shown, late: false };
  return { uuids: targeted.filter(Boolean), late: true };
}

/**
 * Part I: the per-target apply options the relay carries (dnd5e's `DamageApplicationOptions` from the
 * sender's pill menu) as plain data for the socket: `ignore` maps each change (immunity, resistance,
 * vulnerability, modification) to `true` (every type) or the types ignored, or is `true` outright
 * (dnd5e 6.1: "ignore everything"); `downgrade` is the immunity types downgraded to resistance (and,
 * since 6.1, resistance downgraded away), or `true` for every type (6.1: the card's own
 * `applicationOptions` merged in by `getDamageApplicationOptions`, an "ALL" default). Sets become
 * arrays; nothing set → `{}` (the row carries no options).
 * @param {{ ignore?: true|Record<string, true|Set<string>|string[]>, downgrade?: true|Set<string>|string[] }} [options]
 * @returns {{ ignore?: true|Record<string, true|string[]>, downgrade?: true|string[] }}
 */
export function packApplyOptions(options) {
  const out = {};
  const ignore = options?.ignore;
  if (ignore === true) out.ignore = true;
  else if (ignore && typeof ignore === "object") {
    const packed = {};
    for (const [change, v] of Object.entries(ignore)) {
      if (v === true) packed[change] = true;
      else {
        const list = v instanceof Set ? [...v] : Array.isArray(v) ? v : [];
        if (list.length) packed[change] = [...list];
      }
    }
    if (Object.keys(packed).length) out.ignore = packed;
  }
  const dg = options?.downgrade;
  if (dg === true) out.downgrade = true;
  else {
    const list = dg instanceof Set ? [...dg] : Array.isArray(dg) ? dg : [];
    if (list.length) out.downgrade = [...list];
  }
  return out;
}

/**
 * Part I: the inverse of `packApplyOptions` on the GM: arrays back to the Sets dnd5e's
 * `calculateDamage` reads, `true` kept as `true`; anything that is not `true`, an array of strings or
 * a string is dropped.
 * @param {*} wire   the row's `options` from the request (untrusted)
 * @returns {{ ignore?: true|Record<string, true|Set<string>>, downgrade?: true|Set<string> }}
 */
export function unpackApplyOptions(wire) {
  const out = {};
  const strings = v => new Set((Array.isArray(v) ? v : []).filter(t => typeof t === "string"));
  const ig = wire?.ignore;
  if (ig === true) out.ignore = true;
  else if (ig && typeof ig === "object" && !Array.isArray(ig)) {
    const ignore = {};
    for (const [change, v] of Object.entries(ig)) {
      if (v === true) ignore[change] = true;
      else { const set = strings(v); if (set.size) ignore[change] = set; }
    }
    if (Object.keys(ignore).length) out.ignore = ignore;
  }
  if (wire?.downgrade === true) out.downgrade = true;
  else {
    const downgrade = strings(wire?.downgrade);
    if (downgrade.size) out.downgrade = downgrade;
  }
  return out;
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
 * The player chooses (careful.mjs's picker); this marks exactly those rows: an automatic success, and
 * no damage where a success halves it. A row that already had a save keeps it in `unprotected`, so
 * unprotectRow gives it back.
 * @param {object[]} rows
 * @param {string[]} ids  token ids
 * @param {string} onSave
 */
export function protectRows(rows, ids, onSave) {
  const set = new Set(ids ?? []);
  for (const row of rows ?? []) {
    if (!set.has(row.id) || row.protected || row.applied) continue;
    if (row.save) row.unprotected = { save: row.save, multiplier: row.multiplier ?? null };
    row.protected = true;
    row.save = { total: null, success: true, messageId: null, careful: true };
    const m = multiplierFor(true, onSave);
    row.multiplier = m === 0.5 ? 0 : m;
  }
  return rows;
}

/**
 * The GM takes Careful Spell off a row: back to the save it had (and its multiplier), else to no
 * save at all — a player row waits again, a monster row is rolled by the caller.
 * @returns {object} the row
 */
export function unprotectRow(row) {
  if (!row?.protected || row.applied) return row;
  const prev = row.unprotected ?? null;
  delete row.protected;
  delete row.unprotected;
  row.save = prev?.save ?? null;
  row.multiplier = prev ? prev.multiplier : null;
  return row;
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
      save: r.save ? { total: r.save.total ?? null, success: r.save.success ?? null } : null,
      multiplier: r.multiplier ?? null, amount: r.amount ?? null, applied: !!r.applied, hp: r.hp ?? null, caster: !!r.caster, protected: !!r.protected,
    })),
    careful: res.careful ?? null,
    playerStatus: playerStatus(res),
  };
}
