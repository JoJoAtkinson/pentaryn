/**
 * Pure helpers for pentaryn-creatures. No Foundry globals, so the tests prove them in node.
 * Everything here takes plain summaries or plain flag objects, never documents.
 *
 *   token.flags["pentaryn-creatures"].light = { bright, dim }   // the light WE set, or null
 *   token.flags["pentaryn-creatures"].light = false              // our light was switched off by hand: hands off
 *
 * The flag is the only thing that lets us remove a light: a token without it is never darkened.
 */

export const MODULE = "pentaryn-creatures";
export const SHORT = "creatures";
export const NS = "creatures";
export const VERSION = "0.5.0";
export const CONTRACT = "pentaryn-creatures/api@1";
export const I18N = "PENTARYN_CREATURES";
export const CSS = "pcr-";
export const FLAG_SCOPE = MODULE;
/** This module emits no hooks of its own. */
export const HOOKS = Object.freeze({});
export const LIGHT_FLAG = "light";

/* -------------------------------------------- */
/*  Other modules' flags (hand copies, tested)  */
/* -------------------------------------------- */

/**
 * A pentaryn-aoe spell-area handle: an `npc` every player owns (`default: OWNER`), so it would
 * otherwise count as a player's creature. A hand copy of pentaryn-aoe/core.mjs `isHandleTarget`
 * (the token flag `handle`, or the actor flag `handleActor`) WITHOUT aoe's `doc.token` branch:
 * module isolation forces the copy, and adding that branch would change behaviour
 * (transform-creatures-30). If aoe changes its handle flags, change this and its fixture together.
 * @param {object} [tokenFlags]  the token's `flags`
 * @param {object} [actorFlags]  its actor's `flags`
 */
export function isAoeHandle(tokenFlags, actorFlags) {
  return !!(tokenFlags?.["pentaryn-aoe"]?.handle || actorFlags?.["pentaryn-aoe"]?.handleActor);
}

/** An Item Piles pile: `flags.item-piles.data.enabled` on the token or its actor. */
export function isItemPile(tokenFlags, actorFlags) {
  return !!(tokenFlags?.["item-piles"]?.data?.enabled || actorFlags?.["item-piles"]?.data?.enabled);
}

const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Does this token get the creature light? A token a player owns whose actor is a creature (`npc`):
 * summons, familiars, skeletons, Arcane Eye, a steed. Never a PC: `character` covers the PC and its
 * Wild Shape / Polymorph form (dnd5e keeps the actor type on a transformed copy). Never a group,
 * vehicle, Item Piles pile, or prop (`isProp`: a pentaryn-aoe spell-area handle, an `npc` every
 * player owns through `default: OWNER`).
 * @param {{actorType?: string, hasPlayerOwner?: boolean, isPile?: boolean, isProp?: boolean}} t
 */
export function isPlayerCreature(t) {
  if (!t || t.isPile || t.isProp) return false;
  return t.actorType === "npc" && t.hasPlayerOwner === true;
}

/** The {bright, dim} we wrote, from a token's flags, or null. Never throws. */
export function readOurLight(doc) {
  let raw;
  try { raw = doc?.flags?.[MODULE]?.[LIGHT_FLAG]; } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return { bright: num(raw.bright), dim: num(raw.dim) };
}

/** Was our light switched off by hand (flag `false`)? Never throws. */
export function switchedOff(doc) {
  try { return doc?.flags?.[MODULE]?.[LIGHT_FLAG] === false; } catch { return false; }
}

/**
 * The flattened token update that brings one token in line, or null when nothing should change.
 *
 * - Qualifies, no light of its own → light it (bright = dim = radius) and flag it.
 * - Qualifies, already has some other light (a torch, a flame sphere, set by hand) → leave it.
 * - Our light, radius setting changed → move it to the new radius.
 * - No longer qualifies (ownership gone, setting 0) and the light is still exactly ours → darken it.
 * - Someone replaced our light with another (a torch, a light set by hand) → drop our flag only and
 *   leave that light alone. If the token goes dark again later (torch dropped), it is lit again.
 * - Someone set our light to 0 by hand → flag `false`: that token is never lit again.
 *
 * @param {{light?: {bright?: number, dim?: number}, flags?: object}} token
 * @param {{qualifies: boolean, radius: number}} want
 */
export function lightUpdate(token, { qualifies, radius } = {}) {
  const r = num(radius);
  const on = !!qualifies && r > 0;
  const cur = { bright: num(token?.light?.bright), dim: num(token?.light?.dim) };
  const dark = cur.bright === 0 && cur.dim === 0;
  const flagKey = `flags.${MODULE}.${LIGHT_FLAG}`;
  if (switchedOff(token)) return null;                        // the GM turned it off: hands off
  const ours = readOurLight(token);
  const isOurs = ours && cur.bright === ours.bright && cur.dim === ours.dim;

  if (ours && !isOurs) return { [flagKey]: dark ? false : null }; // hand-edited since: let go
  if (on) {
    if (isOurs) {
      if (ours.bright === r && ours.dim === r) return null;   // already right
      return { "light.bright": r, "light.dim": r, [flagKey]: { bright: r, dim: r } };
    }
    if (!dark) return null;                                   // has a light of its own
    return { "light.bright": r, "light.dim": r, [flagKey]: { bright: r, dim: r } };
  }
  if (isOurs) return { "light.bright": 0, "light.dim": 0, [flagKey]: null };
  return null;
}

/**
 * Should this client draw a token it would otherwise not see? Only for a player who owns it, and
 * only when the reason it is unseen is darkness, distance or invisibility. Never against the GM's
 * hide, the token config preview, a filter, or a token on another level.
 */
export function ownerShouldSee(s) {
  if (!s || !s.enabled) return false;
  if (s.isGM || !s.isOwner) return false;
  if (s.hidden || s.configPreview || s.filteredOut || s.culled) return false;
  return true;
}

const VIDEO = /\.(webm|mp4|m4v|ogv|ogg)(\?.*)?$/i;

/**
 * The strip, in order: the user's own character first (or its Wild Shape form), then other
 * characters they own, then everything else; by name, then id, within each group. Tokens the GM
 * has hidden, tokens without an actor, Item Piles piles and props (spell-area handles) are left out.
 *
 * @param {Iterable<{id: string, name?: string, img?: string, actorImg?: string, actorId?: string,
 *   originalActorId?: string, actorType?: string, isOwner?: boolean, hidden?: boolean,
 *   isPile?: boolean, isProp?: boolean}>} tokens
 * @param {{characterId?: string|null}} [opts]
 * @returns {{id: string, name: string, img: string, rank: number}[]}
 */
export function stripEntries(tokens, { characterId = null } = {}) {
  const out = [];
  for (const t of tokens ?? []) {
    if (!t || typeof t.id !== "string" || !t.isOwner || t.hidden || t.isPile || t.isProp || !t.actorId) continue;
    const mine = characterId && (t.actorId === characterId || t.originalActorId === characterId);
    const rank = mine ? 0 : t.actorType === "character" ? 1 : 2;
    const img = t.img && !VIDEO.test(t.img) ? t.img : (t.actorImg || t.img || "icons/svg/mystery-man.svg");
    out.push({ id: t.id, name: String(t.name ?? ""), img, rank });
  }
  return out.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The strip only earns its space once there is something to switch between. */
export function shouldShowStrip(entries) {
  return Array.isArray(entries) && entries.length >= 2;
}

/** A cheap fingerprint so a token that only moved does not rebuild the strip. */
export function stripSignature(entries) {
  return (entries ?? []).map(e => `${e.id}|${e.name}|${e.img}|${e.rank}`).join("\n");
}

/**
 * Where the strip floats while the Combat HUD (Argon) is up, or null to stay docked above the
 * hotbar. The HUD covers the hotbar area, and the docked strip sat behind its action bars: a click
 * meant for a summon's portrait landed on Projected Ward (usability Area 6 re-run, W8). Floated,
 * the strip sits `gap` px above the HUD's top edge, left-aligned with it.
 * @param {{top:number,left:number,width:number,height:number}|null} hud  the HUD's action bar rect
 * @param {number} viewH  window.innerHeight
 * @returns {{bottom:number,left:number}|null}
 */
export function stripDock(hud, viewH, { gap = 8 } = {}) {
  if (!hud || !(hud.height > 0) || !(hud.width > 0) || !(viewH > 0)) return null;
  if (hud.top >= viewH) return null;                       // collapsed off-screen
  return { bottom: Math.round(Math.max(0, viewH - hud.top + gap)), left: Math.round(Math.max(8, hud.left)) };
}

/** `"bottom,left"` for a dock, or null when docked: write the strip's styles only when this changes. */
export function dockKey(dock) {
  return dock ? `${dock.bottom},${dock.left}` : null;
}

/**
 * Is the 500 ms dock poll worth running? Only while the strip is on the page, the GM has
 * `floatOverHud` on and Argon's Combat HUD module is active (transform-creatures-40).
 */
export function shouldPollDock({ stripPresent, floatOverHud, argonActive } = {}) {
  return stripPresent === true && floatOverHud === true && argonActive === true;
}

/* -------------------------------------------- */
/*  Which document changes matter               */
/* -------------------------------------------- */

const keysOf = changes => (changes && typeof changes === "object" ? changes : {});

/** Token changes that can turn the creature light on or off. A token that only moved is skipped. */
export const LIGHT_KEYS = Object.freeze(["light", "actorId", "actorLink", "delta", "flags"]);

/**
 * Should an `updateToken` queue the token for a light pass? Not for our own write (it carries
 * `options.pentarynCreatures`), and not for a change no light rule reads (transform-creatures-27).
 */
export function shouldQueueLight(changes, options) {
  if (options?.pentarynCreatures) return false;
  const c = keysOf(changes);
  return LIGHT_KEYS.some(k => k in c);
}

/** Token fields the strip's summary reads (summarize: name, image, actor, hidden, pile/handle flags). */
export const STRIP_KEYS = Object.freeze(["name", "texture", "hidden", "actorId", "actorLink", "delta", "flags"]);

/** Can this `updateToken` change what the strip shows? A move (x, y, elevation, rotation) cannot. */
export function stripMayChange(changes) {
  const c = keysOf(changes);
  return STRIP_KEYS.some(k => k in c);
}

/* -------------------------------------------- */
/*  Timing, failure and counting seams          */
/* -------------------------------------------- */

/**
 * One timer that runs `run` after `delayMs`. `mode: "debounce"` re-arms on every `arm()` (steady
 * traffic pushes the run back); `mode: "window"` arms once and is never pushed back, so the run
 * happens at most `delayMs` after the first `arm()` (transform-creatures-26). The timers are
 * passed in, so the core stays pure and the tests drive a fake clock.
 * @param {number} delayMs
 * @param {() => *} run
 * @param {{ setTimeout: Function, clearTimeout: Function, mode?: "debounce"|"window" }} timers
 */
export function makeCoalescer(delayMs, run, { setTimeout: set, clearTimeout: clear, mode = "debounce" }) {
  let timer = null;
  const fire = () => {
    timer = null;
    return run();
  };
  return {
    arm() {
      if (mode === "window") {
        if (timer === null) timer = set(fire, delayMs);
        return;
      }
      clear(timer);
      timer = set(fire, delayMs);
    },
    cancel() {
      clear(timer);
      timer = null;
    },
    get pending() {
      return timer !== null;
    },
  };
}

/**
 * Run `fn`; on a throw call `onError(err)` and return `fallback`. For the visibility override,
 * which core calls inside a getter and which must never throw (transform-creatures-29).
 */
export function safely(fn, onError, fallback = false) {
  try {
    return fn();
  } catch (err) {
    onError?.(err);
    return fallback;
  }
}

/** How many of these `flags["pentaryn-creatures"].light` values are a light we set (an object). */
export function countLit(lightFlags) {
  let n = 0;
  for (const v of lightFlags ?? []) if (v && typeof v === "object" && !Array.isArray(v)) n++;
  return n;
}

/* -------------------------------------------- */
/*  Summon library (feedback Swrl5M / UQSJ0v)   */
/* -------------------------------------------- */

/*
 * A player without core's Create New Actors permission cannot summon from a compendium: dnd5e's
 * `Actor5e.fetchExisting` must import the summon into the world first, and throws
 * "You must have 'Create New Actors' permission…". The summon library asks the active GM to make
 * that copy instead, owned by the player, in the character's library folder
 * `<LIBRARY_ROOT>/<First name> — summons & forms`. dnd5e then reuses that copy on every later
 * summon (it looks for an owned, auto-imported actor from the same source before importing).
 * A player who may create actors imports the copy through dnd5e itself; that copy is filed into the
 * same folder afterwards (`libraryFiling`, 0.3.0).
 */

/** The API row (and so the relay query `pentaryn-creatures.summonActor`). */
export const SUMMON_ROW = "summonActor";
/** The folder every character's library sits in (the table's existing convention). */
export const LIBRARY_ROOT = "PC Summons & Forms";
export const LIBRARY_SUFFIX = " — summons & forms";
/** dnd5e's summon origin key: placeSummons passes `{ origin: { key, value: item.uuid } }` to fetchExisting. */
export const SUMMON_ORIGIN_KEY = "flags.dnd5e.summon.origin";

/** `Marwen Ashcroft` → `Marwen — summons & forms`; a nameless actor → `Summons — summons & forms`. */
export function libraryFolderName(actorName) {
  const first = String(actorName ?? "").trim().split(/\s+/)[0];
  return `${first || "Summons"}${LIBRARY_SUFFIX}`;
}

const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * A Foundry document id (16 of [A-Za-z0-9]) that is always the same for the same seed. Two GM tabs
 * answering one relay create the same `_id` with `keepId`: the server refuses the second create (the
 * id exists), and that tab finds the first tab's document by the same id and answers with it, so
 * there is never a duplicate (blueprint §5.9.2). Not cryptographic.
 */
export function stableId(seed) {
  const s = String(seed);
  let h1 = 0xdeadbeef ^ s.length;
  let h2 = 0x41c6ce57 ^ s.length;
  let out = "";
  for (let round = 0; out.length < 16; round++) {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i) + round;
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    for (const h of [h1, h2]) {
      let v = h >>> 0;
      for (let k = 0; k < 4 && out.length < 16; k++) {
        out += ID_CHARS[v % 62];
        v = Math.floor(v / 62);
      }
    }
  }
  return out;
}

/**
 * The library copy's id: one per character and source. A linked source (actorLink) also keys on the
 * summoning item, because dnd5e reuses a linked copy only for the item it came from.
 */
export function libraryActorId({ summonerId, sourceUuid, originUuid = null } = {}) {
  return stableId(`pentaryn-creatures|actor|${summonerId}|${sourceUuid}|${originUuid ?? ""}`);
}

/** The character's library folder id, when we have to create it. */
export function libraryFolderId(summonerId) {
  return stableId(`pentaryn-creatures|folder|${summonerId}`);
}

/** The root folder's id, when we have to create it. */
export function libraryRootId() {
  return stableId(`pentaryn-creatures|folder|${LIBRARY_ROOT}`);
}

/**
 * The copy's ownership: nobody by default; every user who owns the character (level 3) and the
 * player who summoned it own the copy. Keys sorted, so both GM tabs send the same data.
 */
export function libraryOwnership(summonerOwnership, senderId) {
  const out = { default: 0 };
  const owners = Object.entries(summonerOwnership ?? {})
    .filter(([k, v]) => k !== "default" && v === 3).map(([k]) => k);
  if (senderId) owners.push(senderId);
  for (const k of [...new Set(owners)].sort()) out[k] = 3;
  return out;
}

/**
 * Should a failed `fetchExisting` be retried through the GM? Only dnd5e's Create New Actors refusal
 * (`refused`; any other error is dnd5e's to show as it is), only for a player (never a GM, never a
 * user who may create actors: their error is a real one), with the setting on, and only for dnd5e's
 * own summon call (it names the summoning item as the origin).
 */
export function shouldRelaySummon({ isGM, canCreate, enabled, originKey, originValue, refused } = {}) {
  if (refused !== true || isGM || canCreate || enabled === false) return false;
  return originKey === SUMMON_ORIGIN_KEY && typeof originValue === "string" && originValue.length > 0;
}

/**
 * May the GM copy `target` for a summon from this item? The GM never hands a player an arbitrary
 * actor: the source must be what one of the item's summon activities can summon.
 *  - mode "cr" (Find Familiar): a compendium npc whose CR is at most the profile's and whose
 *    creature type is one of the profile's (no types: any);
 *  - otherwise: the source uuid is one of the activity's profiles. A copy can name two sources
 *    (`uuids`: its compendium source and, for dnd5e's clone of a linked world actor, the world actor
 *    dnd5e actually fetched); either one matching a profile is enough.
 * @param {{ mode?: string, profiles: { uuid?: string|null, cr?: number|null, types?: string[] }[] }[]} activities
 * @param {{ uuid: string, uuids?: string[], inPack: boolean, actorType?: string, cr?: number|null, creatureType?: string|null }} target
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function summonAllowed(activities, target) {
  const list = Array.isArray(activities) ? activities : [];
  if (!list.length) return { ok: false, reason: "the item has no summon activity" };
  if (!target?.uuid) return { ok: false, reason: "no source actor" };
  const uuids = new Set([target.uuid, ...(Array.isArray(target.uuids) ? target.uuids : [])].filter(Boolean));
  for (const a of list) {
    const profiles = Array.isArray(a?.profiles) ? a.profiles : [];
    if (a?.mode === "cr") {
      if (!target.inPack || target.actorType !== "npc") continue;
      const fits = profiles.some(p => {
        const crOk = p?.cr == null || !Number.isFinite(p.cr) || (Number.isFinite(target.cr) && target.cr <= p.cr);
        const types = Array.isArray(p?.types) ? p.types : [];
        return crOk && (!types.length || types.includes(target.creatureType));
      });
      if (fits) return { ok: true };
    } else if (profiles.some(p => p?.uuid && uuids.has(p.uuid))) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "that actor is not one this item can summon" };
}

/**
 * May this user be handed a copy of the source at all, whatever the item says? Never a player
 * character, and only a source the user can already see in full: a world actor they may observe, an
 * actor in a compendium they may observe (`visible`, read by the caller). The item is the player's
 * own and they can edit its summon profiles, so the item alone never decides this.
 * @param {{ actorType?: string|null, visible?: boolean }} source
 * @returns {string|null}  the refusal, or null when the source may be copied
 */
export function summonSourceRefusal({ actorType, visible } = {}) {
  if (actorType === "character") return "a player character is never copied";
  if (visible !== true) return "the summoner cannot see that actor";
  return null;
}

/**
 * `summonAllowed`, preferring the summoning item's compendium original (`original`: its activities,
 * null when the item has none or it is not found) over the world item (`world`), which its owner can
 * edit. A compendium source must be one the original can summon (an edited profile uuid or CR does
 * not count); a world source may also come from the world item's profiles, the GM's own pointers at
 * world actors (the library convention), still behind `summonSourceRefusal`. No original: the world
 * item decides.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function summonAllowedFrom({ original = null, world = [] } = {}, target) {
  if (!Array.isArray(original) || !original.length) return summonAllowed(world, target);
  const r = summonAllowed(original, target);
  if (r.ok) return r;
  if (!target?.inPack) return summonAllowed(world, target);
  return { ok: false, reason: "that actor is not one this item's compendium original can summon" };
}

/**
 * Is this world actor a summon copy dnd5e (or the library) imported: `flags.dnd5e.isAutoImported`
 * (or dnd5e's older `summonedCopy`) and the source uuid it was imported from?
 * @param {{ autoImported?: boolean, source?: string|null }} copy
 */
export function isSummonCopy(copy) {
  return copy?.autoImported === true && typeof copy.source === "string" && copy.source.length > 0;
}

/**
 * The update that files a summon copy into a character's library, or null when it is already filed.
 * Never takes anything away: ownership only gains the character's owners (level 3); the folder, the
 * library flag and, for a linked copy with a known summoning item, dnd5e's summon origin (without it
 * dnd5e never reuses a linked copy) are set when they differ. Flat dotted keys, for `Actor#update`.
 * @param {{ folderId?: string|null, ownership?: object, library?: string|null, linked?: boolean, origin?: string|null }} copy
 * @param {{ summonerId: string, summonerOwnership?: object, folderId?: string|null, originUuid?: string|null }} to
 * @returns {object|null}
 */
export function libraryFiling(copy, { summonerId, summonerOwnership, folderId = null, originUuid = null } = {}) {
  if (!copy || !summonerId) return null;
  const out = {};
  if (folderId && copy.folderId !== folderId) out.folder = folderId;
  if (copy.library !== summonerId) out[`flags.${MODULE}.library`] = summonerId;
  if (copy.linked === true && originUuid && copy.origin !== originUuid) out[SUMMON_ORIGIN_KEY] = originUuid;
  const owners = Object.entries(summonerOwnership ?? {})
    .filter(([k, v]) => k !== "default" && v === 3).map(([k]) => k).sort();
  for (const k of owners) if ((copy.ownership?.[k] ?? 0) < 3) out[`ownership.${k}`] = 3;
  return Object.keys(out).length ? out : null;
}

/**
 * May this copy be filed to `summonerId` (the summoning item's character)? dnd5e's fetchExisting reuses
 * any auto-imported copy of the same source its user owns, and the GM owns them all: a GM casting from
 * one character's sheet can be handed another character's copy. So a copy already filed to a
 * different character is never re-filed, and a loose copy is claimed only when it is plausibly the
 * summoner's: its player owners overlap the summoner's, the sender owns it as a player, or no player
 * owns it at all (a fresh import, nobody else's yet).
 * @param {{ library?: string|null, copyOwners?: string[], summonerId: string, summonerOwners?: string[], senderOwnsAsPlayer?: boolean }} o
 * @returns {string|null}  the refusal, or null when the copy may be filed
 */
export function filingRefusal({ library = null, copyOwners = [], summonerId, summonerOwners = [], senderOwnsAsPlayer = false } = {}) {
  if (library && library !== summonerId) return `already filed to another character (${library})`;
  if (library === summonerId || senderOwnsAsPlayer === true || !copyOwners.length) return null;
  const theirs = new Set(summonerOwners);
  if (copyOwners.some(u => theirs.has(u))) return null;
  return "another player's copy (no owner in common with the summoner)";
}

/**
 * Whose summon is this loose copy? The sweep's answer when nothing names the summoning item: the one
 * character that can summon its source (`canSummon`) and shares an owner with the copy (the caster
 * owns what dnd5e imported). Anything else is left for the GM to file by hand.
 * @param {{ copyOwners: string[], candidates: { id: string, owners: string[], canSummon: boolean }[] }} o
 * @returns {{ id: string } | { reason: string }}
 */
export function pickSummoner({ copyOwners = [], candidates = [] } = {}) {
  const mine = new Set(copyOwners);
  if (!mine.size) return { reason: "no player owns the copy" };
  const fits = candidates.filter(c => c?.canSummon && (c.owners ?? []).some(u => mine.has(u)));
  if (fits.length === 1) return { id: fits[0].id };
  if (!fits.length) return { reason: "no character of its owner can summon it" };
  return { reason: `more than one character could have summoned it (${fits.map(c => c.id).sort().join(", ")})` };
}

/* -------------------------------------------- */
/*  Dormant until combat (0.4.0)                */
/* -------------------------------------------- */

/*
 * A creature that sits on the map as a prop (a statue, a suit of armour, a corpse) until a fight
 * starts. Arming a token stores its real look in `flags.pentaryn-creatures.dormant = { look, disguise }`
 * and puts the disguise on: prop art with the ring off, a prop name on the token AND its unlinked
 * actor (the name and portrait a player's double-click Look window shows), no nameplate or bars,
 * and the SECRET disposition (core then draws no hover border, nameplate, bars, effects or target
 * pips for a non-owner, and a player cannot hover or target it). Waking writes the stored look back
 * and sets the flag to null. `hidden` is recorded but never written: whether the token shows is
 * the GM's call, before and after.
 */

export const DORMANT_FLAG = "dormant";
/** CONST.TOKEN_DISPOSITIONS (core never imported here). */
export const DISPOSITIONS = Object.freeze({ SECRET: -2, HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });
/** CONST.TOKEN_DISPLAY_MODES.NONE */
export const DISPLAY_NONE = 0;
/** The disguise when the caller names none: a stone statue (Forgotten Adventures, in this install's assets). */
export const DORMANT_DEFAULTS = Object.freeze({
  name: "Statue",
  img: "assets/tiles/tiles-03/fa/dwarf-settlement/structures/statues/statue-stone-slate-dwarf-hammer-a-2x2.webp",
  disposition: DISPOSITIONS.SECRET,
});

const plainCopy = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const nonEmpty = v => typeof v === "string" && v.trim() !== "";

/**
 * The token's own look, from its source data: everything a disguise changes, plus `hidden` (kept for
 * the record, never restored), plus the art scale and rotation lock, so a prop shrunk or turned by hand
 * wakes at the creature's own size and upright. `delta` is the unlinked actor's override of name and
 * portrait (null = the world actor's).
 */
export function lookOf(src) {
  return {
    name: src?.name ?? "",
    displayName: src?.displayName ?? DISPLAY_NONE,
    displayBars: src?.displayBars ?? DISPLAY_NONE,
    disposition: src?.disposition ?? DISPOSITIONS.NEUTRAL,
    hidden: src?.hidden === true,
    texture: { src: src?.texture?.src ?? null, scaleX: src?.texture?.scaleX ?? 1, scaleY: src?.texture?.scaleY ?? 1 },
    lockRotation: src?.lockRotation === true,
    ring: plainCopy(src?.ring ?? {}),
    delta: { name: src?.delta?.name ?? null, img: src?.delta?.img ?? null },
  };
}

/** The dormant flag `{ look, disguise }` from a token (document or source), or null. Never throws. */
export function readDormant(doc) {
  let raw;
  try { raw = doc?.flags?.[MODULE]?.[DORMANT_FLAG]; } catch { return null; }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !raw.look || typeof raw.look !== "object") return null;
  return raw;
}

/**
 * The flattened update that disguises a token. Re-arming an armed token keeps the look stored the
 * first time (never the disguise) and only changes the disguise. Throws a plain Error on bad options.
 * @param {object} src  the token's source data
 * @param {{ name?: string, img?: string, disposition?: number }} [opts]
 */
export function disguiseUpdate(src, opts = {}) {
  const prior = readDormant(src);
  const look = prior?.look ?? lookOf(src);
  const pick = k => opts?.[k] ?? prior?.disguise?.[k] ?? DORMANT_DEFAULTS[k];
  const disguise = { name: pick("name"), img: pick("img"), disposition: pick("disposition") };
  if (!nonEmpty(disguise.name)) throw new Error("name must be a non-empty string");
  if (!nonEmpty(disguise.img)) throw new Error("img must be a non-empty path");
  if (!Object.values(DISPOSITIONS).includes(disguise.disposition)) throw new Error("disposition must be -2, -1, 0 or 1");
  return {
    name: disguise.name,
    displayName: DISPLAY_NONE,
    displayBars: DISPLAY_NONE,
    disposition: disguise.disposition,
    "texture.src": disguise.img,
    "ring.enabled": false,
    "delta.name": disguise.name,
    "delta.img": disguise.img,
    [`flags.${MODULE}.${DORMANT_FLAG}`]: { look, disguise },
  };
}

/**
 * The flattened update that puts the stored look back and clears the flag, or null when not dormant.
 * Scale and rotation lock are restored only when the look has them (looks stored before 0.4.1 do not).
 */
export function wakeUpdate(src) {
  const d = readDormant(src);
  if (!d) return null;
  const L = d.look;
  return {
    name: L.name,
    displayName: L.displayName,
    displayBars: L.displayBars,
    disposition: L.disposition,
    "texture.src": L.texture?.src ?? null,
    ...(typeof L.texture?.scaleX === "number" ? { "texture.scaleX": L.texture.scaleX } : {}),
    ...(typeof L.texture?.scaleY === "number" ? { "texture.scaleY": L.texture.scaleY } : {}),
    ...(typeof L.lockRotation === "boolean" ? { lockRotation: L.lockRotation } : {}),
    ring: plainCopy(L.ring ?? {}),
    "delta.name": L.delta?.name ?? null,
    "delta.img": L.delta?.img ?? null,
    [`flags.${MODULE}.${DORMANT_FLAG}`]: null,
  };
}

/**
 * Combatant relabels after a wake: core derives a combatant's empty name and image from its token
 * once, at prepare time, so the tracker would keep the disguise. Each combatant of `tokenId` whose
 * stored name/img is empty or the disguise's gets the real one written.
 * @param {{ id: string, tokenId: string, name?: string, img?: string }[]} combatants  source values
 * @param {string} tokenId
 * @param {{ look: object, disguise?: object }} flag  the dormant flag read BEFORE the wake
 * @returns {{ _id: string, name?: string, img?: string }[]}
 */
export function combatantRelabels(combatants, tokenId, flag) {
  const out = [];
  const dName = flag?.disguise?.name;
  const dImg = flag?.disguise?.img;
  for (const c of combatants ?? []) {
    if (!c || c.tokenId !== tokenId) continue;
    const u = { _id: c.id };
    if (!c.name || c.name === dName) u.name = flag.look.name;
    if (!c.img || c.img === dImg) u.img = flag.look.texture?.src ?? null;
    if ("name" in u || "img" in u) out.push(u);
  }
  return out;
}

/* -------------------------------------------- */
/*  Public and hidden markers (unit N)          */
/* -------------------------------------------- */

/*
 * Which status markers a player sees on a creature they do not observe. dnd5e decides per effect
 * and per viewer with ActiveEffect5e#isConcealed (a concealed effect draws no token icon, no sheet
 * row, no combat-tracker icon and no scrolling text); markers.mjs wraps it and asks concealFor. The
 * line is "what you could see across a real table": a prone or bloodied goblin is visible, a charmed
 * or poisoned one is not, and an enemy's Mage Armor or Bless is the GM's to describe. The effect data
 * still reaches every client; only the drawing is hidden.
 *
 * Stored in the world setting `markerTable` as overrides only: { statuses: { id: "public"|"gm" },
 * other: "public"|"gm", friendlyAll: boolean }. A status the stored value does not name falls back
 * to MARKER_PUBLIC_DEFAULTS (Public) or GM only.
 */

export const MARKER_PUBLIC = "public";
export const MARKER_GM = "gm";
export const MARKER_VALUES = Object.freeze([MARKER_PUBLIC, MARKER_GM]);

/** The statuses Public by default (Joe, 2026-11-21); every other status is GM only on a non-friendly token. */
export const MARKER_PUBLIC_DEFAULTS = Object.freeze([
  "bloodied", "dead", "unconscious", "prone", "grappled", "restrained", "paralyzed", "petrified", "stunned",
  "incapacitated", "sleeping", "burning", "bleeding", "flying", "hovering", "burrowing", "dodging",
  "transformed", "invisible",
]);

/** The defaults of the two rows that are not a status. */
export const MARKER_DEFAULTS = Object.freeze({ other: MARKER_GM, friendlyAll: true });

const markerValue = (v, fallback) => (MARKER_VALUES.includes(v) ? v : fallback);
const statusDefault = id => (MARKER_PUBLIC_DEFAULTS.includes(id) ? MARKER_PUBLIC : MARKER_GM);

/**
 * The effective table: one Public / GM only per status id the world has (CONFIG.statusEffects), the
 * "other spell and item effects" row and the friendly toggle. Junk in the stored value is ignored.
 * @param {string[]} statusIds  every CONFIG.statusEffects id, in the world's order
 * @param {object} [stored]     the `markerTable` setting
 * @returns {{ statuses: Record<string, "public"|"gm">, other: "public"|"gm", friendlyAll: boolean }}
 */
export function markerTable(statusIds, stored = {}) {
  const s = stored && typeof stored === "object" ? stored : {};
  const overrides = s.statuses && typeof s.statuses === "object" ? s.statuses : {};
  const statuses = {};
  for (const id of statusIds ?? []) {
    if (typeof id !== "string" || !id) continue;
    statuses[id] = markerValue(overrides[id], statusDefault(id));
  }
  return {
    statuses,
    other: markerValue(s.other, MARKER_DEFAULTS.other),
    friendlyAll: typeof s.friendlyAll === "boolean" ? s.friendlyAll : MARKER_DEFAULTS.friendlyAll,
  };
}

/**
 * The value to store for an effective table: only the rows that differ from the defaults, so a
 * status added later by dnd5e or a module picks up its own default.
 * @param {{ statuses?: object, other?: string, friendlyAll?: boolean }} table
 */
export function markerOverrides(table = {}) {
  const statuses = {};
  for (const [id, v] of Object.entries(table?.statuses ?? {})) {
    if (MARKER_VALUES.includes(v) && v !== statusDefault(id)) statuses[id] = v;
  }
  const out = { statuses };
  if (MARKER_VALUES.includes(table?.other) && table.other !== MARKER_DEFAULTS.other) out.other = table.other;
  if (typeof table?.friendlyAll === "boolean" && table.friendlyAll !== MARKER_DEFAULTS.friendlyAll) out.friendlyAll = table.friendlyAll;
  return out;
}

/**
 * Should this effect's marker be hidden from this viewer?
 *
 * - A GM, or a viewer who owns or observes the creature, sees everything (dnd5e's own OBSERVER rule).
 * - A dormant token (disguised as a prop) shows nothing at all until it wakes.
 * - A friendly token shows everything while `friendlyAll` is on.
 * - An effect that carries at least one status the table knows is shown when any of those statuses
 *   is Public (a Hold Person effect carrying `paralyzed` shows: the paralysis is visible).
 * - An effect with no known status (Mage Armor, Bless, Hex) follows the `other` row.
 *
 * @param {Iterable<string>} statusIds  the effect's statuses
 * @param {{ isGM?: boolean, isObserver?: boolean }} viewer
 * @param {{ dormant?: boolean, friendly?: boolean }} token
 * @param {{ statuses: object, other: string, friendlyAll: boolean }} settings  markerTable()'s result
 */
export function concealFor(statusIds, viewer = {}, token = {}, settings = {}) {
  if (viewer?.isGM || viewer?.isObserver) return false;
  if (token?.dormant) return true;
  if (token?.friendly && settings?.friendlyAll !== false) return false;
  const table = settings?.statuses ?? {};
  const known = [...(statusIds ?? [])].filter(id => Object.hasOwn(table, id));
  if (!known.length) return (settings?.other ?? MARKER_DEFAULTS.other) !== MARKER_PUBLIC;
  return !known.some(id => table[id] === MARKER_PUBLIC);
}

/**
 * Combine dnd5e's answer with ours. dnd5e's own reasons (an unidentified item, a disabled origin,
 * `system.isConcealed`) always stand; its Bloodied rule (`dnd5e.bloodied = "player"`) is replaced by
 * the table, so Bloodied follows its own row whatever that setting says.
 * @param {{ base: boolean, bloodiedRuleOnly?: boolean, ours?: boolean }} s
 */
export function finalConceal({ base, bloodiedRuleOnly = false, ours = false } = {}) {
  return (!!base && !bloodiedRuleOnly) || !!ours;
}

/**
 * The status ids of a CONFIG.statusEffects value: dnd5e keeps an object keyed by id, core an array
 * of `{ id }`. Entries without an id are skipped.
 */
export function statusIdsOf(statusEffects) {
  if (Array.isArray(statusEffects)) return statusEffects.map(s => s?.id).filter(id => typeof id === "string" && id);
  if (!statusEffects || typeof statusEffects !== "object") return [];
  return Object.entries(statusEffects).map(([k, s]) => s?.id ?? k).filter(id => typeof id === "string" && id);
}

/**
 * The menu's status rows: `{ id, name, img, value }` per CONFIG.statusEffects entry, in the
 * world's order. `name` is the raw label (an i18n key or text); the menu localizes it.
 */
export function markerMenuRows(statusEffects, table) {
  const list = Array.isArray(statusEffects)
    ? statusEffects
    : Object.entries(statusEffects ?? {}).map(([k, s]) => ({ ...s, id: s?.id ?? k }));
  return list
    .filter(s => typeof s?.id === "string" && s.id)
    .map(s => ({
      id: s.id,
      name: s.name ?? s.label ?? s.id,
      img: s.img ?? s.icon ?? null,
      value: table?.statuses?.[s.id] ?? statusDefault(s.id),
    }));
}

/**
 * The effective table from the menu's submitted form (flat keys): `status.<id>` → "public"|"gm",
 * `other` → "public"|"gm", `friendlyAll` → boolean (absent = an unchecked box = false). Status or
 * `other` rows the form leaves out keep their default.
 */
export function markerTableFromForm(flat, statusIds) {
  const f = flat && typeof flat === "object" ? flat : {};
  const statuses = {};
  for (const id of statusIds ?? []) statuses[id] = markerValue(f[`status.${id}`], statusDefault(id));
  return {
    statuses,
    other: markerValue(f.other, MARKER_DEFAULTS.other),
    friendlyAll: typeof f.friendlyAll === "boolean" ? f.friendlyAll : f.friendlyAll === "true" || f.friendlyAll === "on",
  };
}

/** Does a token update change what concealFor answers (the dormant flag, the disposition)? */
export function markersMayChange(changes) {
  if (!changes || typeof changes !== "object") return false;
  if ("disposition" in changes) return true;
  const f = changes.flags?.[MODULE];
  return !!f && typeof f === "object" && (DORMANT_FLAG in f || `-=${DORMANT_FLAG}` in f);
}
