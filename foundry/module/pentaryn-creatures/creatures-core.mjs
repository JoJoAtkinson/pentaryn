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
export const VERSION = "0.2.0";
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
 * answering one relay create the same `_id` with `keepId`, so the second create replaces the first
 * with identical data instead of making a duplicate (blueprint §5.9.2). Not cryptographic.
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
 * Should a failed `fetchExisting` be retried through the GM? Only for a player (never a GM, never a
 * user who may create actors: their error is a real one), with the setting on, and only for dnd5e's
 * own summon call (it names the summoning item as the origin).
 */
export function shouldRelaySummon({ isGM, canCreate, enabled, originKey, originValue } = {}) {
  if (isGM || canCreate || enabled === false) return false;
  return originKey === SUMMON_ORIGIN_KEY && typeof originValue === "string" && originValue.length > 0;
}

/**
 * May the GM copy `target` for a summon from this item? The GM never hands a player an arbitrary
 * actor: the source must be what one of the item's summon activities can summon.
 *  - mode "cr" (Find Familiar): a compendium npc whose CR is at most the profile's and whose
 *    creature type is one of the profile's (no types: any);
 *  - otherwise: the source uuid is one of the activity's profiles.
 * @param {{ mode?: string, profiles: { uuid?: string|null, cr?: number|null, types?: string[] }[] }[]} activities
 * @param {{ uuid: string, inPack: boolean, actorType?: string, cr?: number|null, creatureType?: string|null }} target
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function summonAllowed(activities, target) {
  const list = Array.isArray(activities) ? activities : [];
  if (!list.length) return { ok: false, reason: "the item has no summon activity" };
  if (!target?.uuid) return { ok: false, reason: "no source actor" };
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
    } else if (profiles.some(p => p?.uuid && p.uuid === target.uuid)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: "that actor is not one this item can summon" };
}
