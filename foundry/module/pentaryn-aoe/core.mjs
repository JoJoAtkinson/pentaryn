/**
 * Pure helpers for pentaryn-aoe — no Foundry globals, so test/run.mjs can prove them in node.
 *
 * Everything that decides *who* is in an area, *what* a save is worth, and *whether* an
 * attack rolls damage lives here. The hook files only fetch documents and call these.
 */

export const MODULE = "pentaryn-aoe";
export const SHORT = "aoe";
export const NS = "aoe";
export const VERSION = "0.8.8";                          // === module.json version (core.test pins it)
export const CONTRACT = "pentaryn-aoe/api@1";            // bump the major on a published-shape change
export const I18N = "PENTARYN_AOE";
export const CSS = "pa-";
export const FLAG_SCOPE = MODULE;
/** aoe emits no events of its own. */
export const HOOKS = Object.freeze({});

// Area geometry: centreOf, handleTopLeft, AREA_WALL_RULES, edgeClipsArea, areaClipOrigin, instantaneous,
// instantSpellArea.
export * from "./core/areas.mjs";
// B2 spell walls: SPELL_WALLS, spellWallKind, sectionPixels, panelSections, wallId, wallPlan, diffWalls,
// breakSection, restoreShapes, areaEdgeClips.
export * from "./core/spell-walls.mjs";

/** Read this module's flags without getFlag(): getFlag throws while the module is inactive (hot-patch). */
export function aoeFlags(doc) {
  return doc?.flags?.[MODULE] ?? {};
}

/** Is this token (a TokenDocument) one of our area handles? The token flag only; see isHandleTarget. */
export const isHandle = t => !!aoeFlags(t).handle;

/**
 * R2-2: one GM account open in two sessions (two tabs, two machines) is the active GM twice over:
 * `activeGM.isSelf` is true on both, so both wrote the same spell walls and handles and the server
 * refused the second (red "already exists" / "does not exist" toasts). The sessions of the active GM
 * user elect one lead over this module's socket: the oldest session (the smallest key) that has been
 * heard from within SESSION_TTL_MS. A background tab's timers can run once a minute, hence the long TTL;
 * a session that closes says so (pagehide), so the next takes over at once.
 */
export const SESSION_BEAT_MS = 20_000;
export const SESSION_TTL_MS = 150_000;
/** How long a new session listens for older ones before it may lead. */
export const SESSION_SETTLE_MS = 1500;

/** A session's election key: its start time (sortable base 36) and a random tail. */
export function sessionKey(at, rand) {
  return `${Math.max(0, Math.floor(Number(at) || 0)).toString(36).padStart(10, "0")}-${rand}`;
}

/**
 * R2-2: does the session `me` lead its user's sessions? `peers`: key → when it was last heard (ms).
 * A peer not heard within `ttl` is gone; the smallest live key leads.
 * @param {string} me
 * @param {Map<string, number>|Iterable<[string, number]>} peers
 * @param {number} now
 * @param {number} [ttl]
 */
export function leadSession(me, peers, now, ttl = SESSION_TTL_MS) {
  for (const [key, seen] of peers ?? []) {
    if (!(now - seen <= ttl)) continue;
    if (key < me) return false;
  }
  return true;
}

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

/**
 * Part I (0.7.1): after a relay TIMEOUT, how long the player's client keeps watching the card for the
 * GM's own "Applied by" entry (ms). A slow GM client lands the rows late; the toast waits for that.
 */
export const RELAY_LATE_WAIT_MS = 15_000;

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

/**
 * F0 (feedback GDJJdi): Empowered Spell rerolls damage dice only (PHB 2024), so the save stands. An
 * empowered damage card (pentaryn-riders' `flags.pentaryn-riders.empowered.from`) takes over the
 * superseded card's tray state instead of rolling new saves: each new row whose token was on the old
 * tray gets back its save, multiplier, tick and the GM's own edits (an overridden multiplier, Careful
 * Spell's protection); the area, the Careful Spell record and the players' request card come with
 * it, so a player's save still pending answers the new card (matchSave reads `request`). The new
 * card keeps its own damages: the caller never takes them from here. A row the old tray did not have
 * stays as built. Refused (null) when there is no old resolution or it is areaLocked (superseded,
 * or a row already applied): carrying it would revive a dead tray or apply the same save twice.
 * Never mutates its inputs.
 * @param {object|null|undefined} oldRes   the superseded card's resolution
 * @param {object[]} newRows               buildRows' rows for the new card
 * @returns {{ rows: object[], region: string|null, careful: object|null, request: string|null }|null}
 */
export function carryResolution(oldRes, newRows) {
  if (!oldRes || areaLocked(oldRes)) return null;
  const old = new Map((oldRes.rows ?? []).map(r => [r.id, r]));
  const rows = (newRows ?? []).map(row => {
    const was = old.get(row.id);
    const out = { ...row };
    if (!was) return out;
    out.save = was.save ? { ...was.save } : null;
    out.multiplier = was.multiplier ?? null;
    out.apply = !!was.apply;
    for (const k of ["overridden", "protected"]) {
      if (was[k]) out[k] = true;
      else delete out[k];
    }
    if (was.unprotected) out.unprotected = { save: was.unprotected.save ? { ...was.unprotected.save } : null, multiplier: was.unprotected.multiplier ?? null };
    else delete out.unprotected;
    return out;
  });
  return {
    rows,
    region: oldRes.region ?? null,
    careful: oldRes.careful ? { ...oldRes.careful } : null,
    request: oldRes.request ?? null,
  };
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
 * Part C (0.7.1, playtest 2026-11-21): which of an attack card's recorded targets the roll HIT, as the
 * auto-rolled damage card's targets. dnd5e's own rule (AttackMessageData#evaluatedTargets): `ac === null`
 * (total cover) is a miss; else a critical hits; else a fumble or a total under the AC misses. An unknown
 * AC (no number) is a hit, as dnd5e reads it, unless the roll fumbled. `null` when the card recorded no targets (the damage card
 * then keeps dnd5e's default: the roller's current targets); `[]` when every target was missed.
 * Pure: the descriptors are copied, never changed.
 * @param {{ac?: number|null}[]|null|undefined} targets   the attack card's system.targets
 * @param {{ total?: number, isCritical?: boolean, isFumble?: boolean }} roll
 * @returns {object[]|null}
 */
export function attackHitTargets(targets, { total = 0, isCritical = false, isFumble = false } = {}) {
  const list = [...(targets ?? [])].filter(Boolean);
  if (!list.length) return null;
  const missed = t => t.ac === null || (!isCritical && (!!isFumble || (Number.isFinite(t.ac) && Number(total) < t.ac)));
  return list.filter(t => !missed(t)).map(t => ({ ...t }));
}

/**
 * Part C (0.8.0, Joe 2026-11-21): may the auto damage roll go ahead, given attackHitTargets' answer?
 * Only with at least one target the roll hit. `null` (the card recorded no target: a natural 20 at
 * nobody) rolls nothing, as does `[]` (every target missed): dnd5e's Apply tray on such a card offers
 * whatever each viewer has selected, often the attacker. The card's Damage button stays.
 * @param {object[]|null} hits
 */
export function autoDamageHasTarget(hits) {
  return Array.isArray(hits) && hits.length > 0;
}

/**
 * D2 (feedback ORGqVN, hKDbzi): what an attack card says about hit or miss. `targets` are dnd5e's
 * evaluated targets (`message.system.evaluatedTargets`: `{ isMiss, ac }`; `ac === null` is total cover,
 * a miss); `visible` is whether this viewer may know the result (dnd5e's `attackRollVisibility` is not
 * `none`, and the card's content is visible to them). Nothing (null) when hidden or with no recorded
 * target (browser test T2's empty pane: no target, no claim). One target: its result goes in the card's
 * title ("Attack — Hit" / "— Miss"). Several: each pill carries its own result, no title suffix. A miss
 * line ("Miss — no damage") when every target was missed, so the turn visibly moves on; a following
 * damage card's title is coloured as a hit when any target was hit.
 * @param {{ targets?: {isMiss?: boolean, ac?: number|null}[], visible?: boolean }} o
 * @returns {{ outcome: "hit"|"miss"|"mixed", title: "hit"|"miss"|null, pills: boolean, missLine: boolean, hit: boolean }|null}
 */
export function attackOutcome({ targets = [], visible = false } = {}) {
  const list = (targets ?? []).filter(Boolean);
  if (!visible || !list.length) return null;
  const missed = list.map(t => !!t.isMiss || t.ac === null);
  const misses = missed.filter(Boolean).length;
  const outcome = misses === 0 ? "hit" : misses === list.length ? "miss" : "mixed";
  const one = list.length === 1;
  return { outcome, title: one ? outcome : null, pills: !one, missLine: outcome === "miss", hit: outcome !== "miss" };
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
 * targets already filled, `lateTargets`) and that nobody has applied yet. A card an area resolve has
 * stamped (`areaTargets`, Part B) is done too, whatever its `lateTargets` says: its `system.targets`
 * are the area's creatures, and the author's later targeting must not replace them (0.6.4 review).
 * Plain descriptions: `{ id, type, author, timestamp, targets, lateTargets, areaTargets, applied }`.
 * Null when there is none.
 * @param {object[]} messages   oldest first, as the chat log holds them
 * @param {{ userId: string, now: number, windowMs?: number }} who
 */
export function lateTargetCard(messages, { userId, now, windowMs = LATE_TARGET_WINDOW_MS } = {}) {
  if (!userId) return null;
  for (let i = (messages ?? []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || !isApplyCard(m.type) || m.author !== userId || m.applied || m.areaTargets) continue;
    if (!(Number(m.targets) === 0 || m.lateTargets)) continue;
    if ((now ?? 0) - (m.timestamp ?? 0) > windowMs) continue;
    return m.id;
  }
  return null;
}

/**
 * G1 (feedback SvOaxr): is this healing card from an activity that can only affect its user,
 * so its one target is the caster? dnd5e records the roller's current targets on every roll card
 * (`TargetsField.getDescriptors()`), or none, so Stone's Endurance with an enemy targeted offered to
 * heal the enemy (browser test T3), and with nothing targeted every viewer's tray listed their own
 * selection ("Caven +11"). True for an activity whose affects type is `self`, or whose range is Self
 * with no other affects type — and never for one that places an area (a Self-range cone, line or
 * emanation: Burning Hands, Thunderwave, Spirit Guardians, `aimsFromCaster`), has a save, or is an
 * attack (Booming Blade's Self range is the weapon's reach). Healing cards only: a Self-range DAMAGE
 * activity usually hurts someone else (Armor of Agathys and Fire Shield damage the attacker), so a damage
 * card keeps what dnd5e recorded. Plain description:
 * `{ type, activityType, rangeUnits, affectsType, templateType, hasSave }`.
 * @returns {boolean}
 */
export function selfTargetCard({ type = null, activityType = null, rangeUnits = null, affectsType = null, templateType = null, hasSave = false } = {}) {
  if (type !== "healing") return false;
  if (templateType || hasSave || activityType === "attack" || activityType === "save") return false;
  if (affectsType === "self") return true;
  return rangeUnits === "self" && !affectsType;
}

/** G2: the `showAppliedBy` setting's choices: who sees "Applied by … → …" under a card's tray. */
export const APPLIED_BY_MODES = Object.freeze(["gm", "owners", "all"]);

/**
 * G2: does this viewer see the "Applied by" line on a card? The GM always does. A player: never with
 * `gm`; with `owners` (the default) on a card they wrote or where they own a row's token; with `all`
 * on every card. An unknown mode reads as `owners`.
 * @param {string} mode
 * @param {{ isGM?: boolean, isAuthor?: boolean, ownsRow?: boolean }} viewer
 */
export function appliedByVisible(mode, { isGM = false, isAuthor = false, ownsRow = false } = {}) {
  if (isGM) return true;
  const m = APPLIED_BY_MODES.includes(mode) ? mode : "owners";
  if (m === "gm") return false;
  if (m === "all") return true;
  return !!(isAuthor || ownsRow);
}

/**
 * G2: the lines a viewer reads under a card's tray, from `flags.pentaryn-aoe.appliedLog` (one entry per
 * Apply press, keyed by a random id: `{ at, by, byName, rows: [{ token, name, delta, pc }] }`, `delta`
 * the HP change, negative for damage). Oldest first, one line per entry: `{ at, by, rows: [{ name, delta }] }`.
 * A player (`isGM` false) never reads a row for a creature no player owns (`pc` false) unless they own
 * its token: a monster's name or the damage it took after resistances is GM data, as the save tray is.
 * An entry left with no rows is dropped.
 * @param {Record<string, object>|null|undefined} log
 * @param {{ isGM?: boolean, owns?: (tokenUuid: string) => boolean }} viewer
 * @returns {{ at: number, by: string, rows: { name: string, delta: number }[] }[]}
 */
export function appliedByLines(log, { isGM = false, owns = () => false } = {}) {
  const entries = Object.values(log ?? {}).filter(e => e && Array.isArray(e.rows));
  entries.sort((a, b) => (Number(a.at) || 0) - (Number(b.at) || 0));
  const out = [];
  for (const e of entries) {
    const rows = e.rows.filter(r => r && (isGM || r.pc || owns(r.token)))
      .map(r => ({ name: String(r.name ?? ""), delta: Number(r.delta) || 0 }));
    if (rows.length) out.push({ at: Number(e.at) || 0, by: String(e.byName ?? e.by ?? ""), rows });
  }
  return out;
}

/**
 * Part I (0.7.1): did the GM's client land a relayed Apply after the query timed out? True when the
 * card's `appliedLog` holds an entry whose key was not there before the query (`before`) and whose rows
 * name any of the relayed token uuids. Pure.
 * @param {Record<string, object>|null|undefined} log   the card's flags.pentaryn-aoe.appliedLog now
 * @param {Iterable<string>} before                     the entry keys before the query
 * @param {Iterable<string>} uuids                      the relayed rows' token uuids
 */
export function relayLanded(log, before = [], uuids = []) {
  const seen = new Set(before);
  const wanted = new Set(uuids);
  if (!wanted.size) return false;
  return Object.entries(log ?? {}).some(([key, e]) => !seen.has(key) && Array.isArray(e?.rows)
    && e.rows.some(r => wanted.has(r?.token)));
}

/** G2: an HP change as the line shows it: `+11` healing, `-14` damage, `0`. */
export const fmtDelta = n => (n > 0 ? `+${n}` : n < 0 ? `-${-n}` : "0");

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
 * Part B: the rows whose tokens the module records as the damage card's `system.targets` when the
 * damage was resolved off an area — the rows buildRows ticks (the caster, a hidden token and anyone
 * at 0 HP are unticked) minus a Careful-protected row already at ×0 (protectRows on a half spell).
 * Why the ticked rows and not every creature inside: dnd5e's native Apply hits every listed token the
 * user owns and the GM owns everything, so an unticked row listed there would take the damage from a
 * GM's native Apply; and a hidden creature's name must not reach the players' card.
 * @param {object[]} rows  resolution rows (after carefulFor has protected its picks)
 * @returns {object[]} the rows to stamp, in tray order
 */
export function areaTargetRows(rows) {
  return (rows ?? []).filter(r => r?.apply && r.multiplier !== 0);
}

/**
 * Did this module write the card's `system.targets` — late targets (Part I, `lateTargets`) or the
 * area's creatures (Part B, `areaTargets`)? For both, the native tray's "selected" memory is flipped
 * to "targeted" once (apply.mjs onRowsBuilt), so dnd5e lists what was recorded, not the GM's selection.
 * @param {object} flags  the message's `flags["pentaryn-aoe"]` (aoeFlags)
 * @returns {boolean}
 */
export function moduleFilledTargets(flags) {
  return !!(flags?.lateTargets || flags?.areaTargets);
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

/* -------------------------------------------- */
/*  B1 / B3 — wall spells                       */
/* -------------------------------------------- */

/** B1: the thinnest a wall panel is drawn, as a fraction of a grid square (a fifth: 10 px on a 50 px grid). */
export const WALL_MIN_FRACTION = 1 / 5;

/**
 * B1 (feedback 8t6Nn1): how thick a wall spell's panel is DRAWN, in pixels: its real width, or a fifth
 * of a grid square when that is thinner. Wall of Stone's Long Panels are 0.25 ft thick, a 2.5 px line on
 * a 50 px grid, and Talo's dark green user colour on a dark map made the wall "disappear". The drawing
 * only: the shape's own width (which creatures the area holds) is never changed.
 * @param {number} width     the line shape's width (px)
 * @param {number} gridSize  the scene's grid size (px)
 */
export function wallThickness(width, gridSize) {
  return Math.max(Number(width) || 0, (Number(gridSize) || 0) * WALL_MIN_FRACTION);
}

/**
 * B1: a wall panel's outline as polygon points `[x0, y0, … x3, y3]`: core's line shape (it starts at
 * `x, y` and runs `length` px along `rotation` degrees, its width centred on that axis) drawn
 * `wallThickness` thick. Rounded to 1/1000 px.
 * @param {{x: number, y: number, length: number, width: number, rotation?: number}} line
 * @param {number} gridSize
 * @returns {number[]}
 */
export function wallPanelOutline({ x = 0, y = 0, length = 0, width = 0, rotation = 0 } = {}, gridSize = 0) {
  const t = wallThickness(width, gridSize) / 2;
  const a = (Number(rotation) || 0) * Math.PI / 180;
  const ux = Math.cos(a), uy = Math.sin(a);      // along the wall
  const nx = -uy, ny = ux;                       // across it
  const L = Number(length) || 0;
  const r = v => Math.round(v * 1000) / 1000 + 0;
  const pts = [
    [x + nx * t, y + ny * t], [x + ux * L + nx * t, y + uy * L + ny * t],
    [x + ux * L - nx * t, y + uy * L - ny * t], [x - nx * t, y - ny * t],
  ];
  return pts.flatMap(([px, py]) => [r(px), r(py)]);
}

/**
 * B1: is this region a wall spell's area (Wall of Stone, Wall of Fire, Blade Barrier)? A template
 * region whose every shape is a line, from an activity whose area type is dnd5e's `wall`. When the
 * activity cannot be read (`templateType` null: a deleted item, an unresolvable uuid), dnd5e's own
 * `flags.dnd5e.dimensions.height` decides: a wall has a height, a line spell (Lightning Bolt) none.
 * @param {{ template?: boolean, shapeTypes?: string[], templateType?: string|null, height?: number|null }} r
 */
export function wallSpellRegion({ template = false, shapeTypes = [], templateType = null, height = null } = {}) {
  if (!template || !shapeTypes?.length || !shapeTypes.every(t => t === "line")) return false;
  if (templateType) return templateType === "wall";
  return Number(height) > 0;
}

/**
 * B3: the placement counter for a multi-panel area (Wall of Stone's ten panels), or null for one shape.
 * `placed` counts the panels confirmed or skipped so far; the counter names the one being placed.
 * @returns {{ n: number, total: number }|null}
 */
export function panelCounter(placed, total) {
  const N = Number(total) || 0;
  const n = (Number(placed) || 0) + 1;
  if (N < 2 || n > N) return null;
  return { n, total: N };
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
