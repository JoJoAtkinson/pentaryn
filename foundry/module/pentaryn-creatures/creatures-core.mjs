/**
 * Pure helpers for pentaryn-creatures (creatures.mjs). No Foundry globals, so test/run.mjs proves
 * them in node. Everything here takes plain summaries built by creatures.mjs, never documents.
 *
 *   token.flags["pentaryn-creatures"].light = { bright, dim }   // the light WE set, or null
 *   token.flags["pentaryn-creatures"].light = false              // our light was switched off by hand: hands off
 *
 * The flag is the only thing that lets us remove a light: a token without it is never darkened.
 */

export const MODULE = "pentaryn-creatures";
export const LIGHT_FLAG = "light";

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
