/**
 * Pure policy logic for pentaryn-movement. No Foundry globals: `node test/run.mjs` imports this
 * bare, and that import is itself the proof that it stays pure.
 *
 * Three things live here:
 *   1. Ghost policy: may this user, right now, move this token ignoring walls and creatures?
 *   2. Owned-on-top ranking: the sort keys that lift a player's own tokens above everyone else's,
 *      on that player's screen only.
 *   3. Pins under tokens: the placement-rule check (plan D5), since owned-on-top makes a pin under
 *      your own token unclickable for good.
 */

export const MODULE = "pentaryn-movement";

/** World setting values, in the order the settings dropdown lists them. */
export const POLICIES = Object.freeze(["off", "exploration", "always"]);
export const DEFAULT_POLICY = "exploration";

/** Anything unknown (a typo, an old value, a failed read) falls back to the default. */
export function normalizePolicy(value) {
  return POLICIES.includes(value) ? value : DEFAULT_POLICY;
}

/**
 * Does a combat stop ghost movement on this scene?
 *
 * `combats` are plain summaries: { active, sceneId, started, combatantSceneIds: string[] }, where
 * combatantSceneIds lists only combatants the players can see (the caller drops hidden ones).
 *  - Only `active` encounters count (an encounter the GM has prepared but not activated doesn't).
 *  - A combat linked to a scene counts on that scene once it has a combatant or has started.
 *  - An unlinked combat (sceneId null) counts on any scene where one of its combatants stands.
 * An empty encounter made by mistake does not switch ghost off.
 */
export function combatOnScene(combats, sceneId) {
  if (!sceneId) return false;
  for (const c of combats ?? []) {
    if (!c || !c.active) continue;
    const where = Array.isArray(c.combatantSceneIds) ? c.combatantSceneIds : [];
    if (c.sceneId) {
      if (c.sceneId === sceneId && (c.started || where.length > 0)) return true;
    } else if (where.includes(sceneId)) {
      return true;
    }
  }
  return false;
}

/**
 * May players ghost at all, given the GM policy and whether a combat is running here?
 * Returns { allowed, reason } where reason is "off" | "combat" | null.
 */
export function ghostAllowed({ policy, combatActive } = {}) {
  const p = normalizePolicy(policy);
  if (p === "off") return { allowed: false, reason: "off" };
  if (p === "exploration" && combatActive) return { allowed: false, reason: "combat" };
  return { allowed: true, reason: null };
}

/**
 * Is ghost movement in effect for this token on this client?
 * The GM never gets it from here: the GM has core's own Unconstrained Movement tool.
 */
export function ghostFor({ isGM, policy, combatActive, wish, isOwner } = {}) {
  if (isGM || !wish || !isOwner) return false;
  return ghostAllowed({ policy, combatActive }).allowed;
}

/**
 * The constrain options for a move. With ghost on, the same three flags the GM's unconstrained
 * tool sets: walls (core), movement cost (core) and creature blocking (dnd5e's `ignoreTokens`).
 * Never mutates `base`.
 */
export function constrainFor(base, ghost) {
  const out = { ...(base ?? {}) };
  if (ghost) Object.assign(out, { ignoreWalls: true, ignoreCost: true, ignoreTokens: true });
  return out;
}

/**
 * What the player's toolbar button shows. `state` is what drives the title, the toolclip text and
 * the dimmed look; `active` is the pressed state, which is the effective ghost, never just the wish.
 */
export function playerTool({ isGM, policy, combatActive, wish } = {}) {
  const p = normalizePolicy(policy);
  const { allowed, reason } = ghostAllowed({ policy: p, combatActive });
  const visible = !isGM && p !== "off";
  const active = visible && allowed && !!wish;
  const state = !allowed ? (reason ?? "off") : active ? "on" : "ready";
  return { visible, active, state };
}

/** The GM's flip button: pressed whenever players may ghost at all. */
export function gmTool({ isGM, policy } = {}) {
  const p = normalizePolicy(policy);
  return { visible: !!isGM, active: p !== "off", state: p };
}

/**
 * Flip the GM switch. Turning it off remembers the mode it was in; turning it back on restores
 * that mode (Exploration only or Always allowed), defaulting to Exploration only.
 * Returns the new { policy, last }.
 */
export function flipPolicy(policy, last, on) {
  const p = normalizePolicy(policy);
  const remembered = last === "always" || last === "exploration" ? last : DEFAULT_POLICY;
  if (on) return { policy: p === "off" ? remembered : p, last: p === "off" ? remembered : p };
  return { policy: "off", last: p === "off" ? remembered : p };
}

/**
 * Should the player's stored wish be cleared? Yes when it is on but no longer allowed, so the
 * button never sits pressed while doing nothing, and ghost never comes back on by itself after a
 * fight. Returns the reason ("off" | "combat") or null.
 */
export function wishToClear({ policy, combatActive, wish } = {}) {
  if (!wish) return null;
  const { allowed, reason } = ghostAllowed({ policy, combatActive });
  return allowed ? null : reason;
}

/**
 * After a fight (or the GM) switched a player's ghost off, tell them once when it is allowed again
 * (usability Area 8, L7: the button stays off after the fight and is easy to forget). Nothing is
 * switched back on by itself. `cleared` is the reason it was switched off on this client, or null.
 */
export function ghostBack({ cleared, policy, combatActive, wish } = {}) {
  if (!cleared || wish) return false;
  return ghostAllowed({ policy, combatActive }).allowed;
}

/* -------------------------------------------- */
/*  Owned on top                                */
/* -------------------------------------------- */

/** Added to the mesh sort of a raised token. Token document sorts are small integers. */
export const RAISE = 1e9;

/** 1 when this client should lift the token, else 0. Never for the GM (who owns everything). */
export function ownedRank({ isGM, enabled, isOwner } = {}) {
  return !isGM && enabled !== false && isOwner ? 1 : 0;
}

/** The mesh sort for the primary canvas group: elevation still wins, then owned, then sort. */
export function meshSort(docSort, rank) {
  const s = Number.isFinite(docSort) ? docSort : 0;
  return rank ? s + RAISE : s;
}

/**
 * Comparator for the token layer's interaction order (what takes the click). Mirrors core's
 * placeables sort (elevation, sort, zIndex, last index) with the owned rank between elevation and
 * sort. Items: { elevation, rank, sort, zIndex, index }.
 */
export function compareTokens(a, b) {
  const n = v => (Number.isFinite(v) ? v : 0);
  return (n(a.elevation) - n(b.elevation))
    || (n(a.rank) - n(b.rank))
    || (n(a.sort) - n(b.sort))
    || (n(a.zIndex) - n(b.zIndex))
    || (n(a.index) - n(b.index));
}

/* -------------------------------------------- */
/*  Pins under tokens (placement rule D5)        */
/* -------------------------------------------- */

/**
 * Every pin whose centre lies inside a token's square(s).
 * notes:  [{ id, x, y, label }]                    (Note x/y is the pin's centre)
 * tokens: [{ id, name, x, y, w, h, playerOwned }]  (x/y top-left, w/h in pixels)
 * Returns [{ noteId, label, tokenId, tokenName, playerOwned }], player-owned tokens first.
 * Edges count as inside; a pin on the border still loses the click.
 */
export function pinsUnderTokens(notes, tokens) {
  const out = [];
  for (const n of notes ?? []) {
    if (!n || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
    for (const t of tokens ?? []) {
      if (!t || ![t.x, t.y, t.w, t.h].every(Number.isFinite)) continue;
      if (n.x >= t.x && n.x <= t.x + t.w && n.y >= t.y && n.y <= t.y + t.h) {
        out.push({ noteId: n.id, label: n.label ?? "", tokenId: t.id, tokenName: t.name ?? "",
          playerOwned: !!t.playerOwned });
      }
    }
  }
  return out.sort((a, b) => Number(b.playerOwned) - Number(a.playerOwned));
}
