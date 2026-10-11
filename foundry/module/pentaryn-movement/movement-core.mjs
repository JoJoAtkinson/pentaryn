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
export const SHORT = "movement";
export const NS = "movement";                          // game.pentaryn.movement
export const VERSION = "0.1.2";                        // === module.json version (a test pins it)
export const CONTRACT = "pentaryn-movement/api@1";     // bump the major on a published-shape change
export const I18N = "PENTARYN_MOVEMENT";
export const CSS = Object.freeze({ blocked: "pm-blocked" });

/** Movement emits no events of its own. */
export const HOOKS = Object.freeze({});

/** Scene-control tool names (token tools) and the ghost look. */
export const TOOL = "pentarynGhost";
export const GM_TOOL = "pentarynGhostPolicy";
export const GHOST_ALPHA = 0.55;
export const GM_ICONS = Object.freeze({
  off: "fa-solid fa-road-barrier",
  exploration: "fa-solid fa-person-hiking",
  always: "fa-solid fa-person-walking-dashed-line-arrow-right"
});

/*
 * Every label key as a full literal, looked up by state, so the i18n gate proves each one exists.
 * The states are the ones playerTool / gmTool / ghostAllowed / wishToClear / ghostBack produce.
 */

/** The player's button title, by playerTool().state. */
export const TOOL_KEYS = Object.freeze({
  on: "PENTARYN_MOVEMENT.tool.on",
  ready: "PENTARYN_MOVEMENT.tool.ready",
  combat: "PENTARYN_MOVEMENT.tool.combat",
  off: "PENTARYN_MOVEMENT.tool.off"
});

/** The player's toolclip: `what`, then the state's line, then `vision`. */
export const TOOL_CLIP_KEYS = Object.freeze({
  what: "PENTARYN_MOVEMENT.tool.clip.what",
  on: "PENTARYN_MOVEMENT.tool.clip.on",
  ready: "PENTARYN_MOVEMENT.tool.clip.ready",
  combat: "PENTARYN_MOVEMENT.tool.clip.combat",
  off: "PENTARYN_MOVEMENT.tool.clip.off",
  vision: "PENTARYN_MOVEMENT.tool.clip.vision"
});

/** The GM button title (and the flip toast), by policy. */
export const GM_KEYS = Object.freeze({
  off: "PENTARYN_MOVEMENT.gm.off",
  exploration: "PENTARYN_MOVEMENT.gm.exploration",
  always: "PENTARYN_MOVEMENT.gm.always"
});

/** The GM toolclip, in order. */
export const GM_CLIP_KEYS = Object.freeze([
  "PENTARYN_MOVEMENT.gm.clip.what",
  "PENTARYN_MOVEMENT.gm.clip.modes",
  "PENTARYN_MOVEMENT.gm.clip.combat"
]);

/** Toasts, by ghostAllowed().reason / wishToClear() / the reason ghost was cleared. */
export const NOTIFY_BLOCKED = Object.freeze({
  off: "PENTARYN_MOVEMENT.notify.blocked.off",
  combat: "PENTARYN_MOVEMENT.notify.blocked.combat"
});
export const NOTIFY_CLEARED = Object.freeze({
  off: "PENTARYN_MOVEMENT.notify.cleared.off",
  combat: "PENTARYN_MOVEMENT.notify.cleared.combat"
});
export const NOTIFY_BACK = Object.freeze({
  combat: "PENTARYN_MOVEMENT.notify.back.combat",
  off: "PENTARYN_MOVEMENT.notify.back.off"
});

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
 * Every scene id where combatOnScene(combats, id) is true, as a Set — one pass over the combats
 * instead of one per token (finding -19).
 */
export function combatSceneIds(combats) {
  const out = new Set();
  for (const c of combats ?? []) {
    if (!c || !c.active) continue;
    const where = Array.isArray(c.combatantSceneIds) ? c.combatantSceneIds : [];
    if (c.sceneId) {
      if (c.started || where.length > 0) out.add(c.sceneId);
    } else {
      for (const id of where) if (id) out.add(id);
    }
  }
  return out;
}

/**
 * The ghost inputs that are the same for every token on this client, read once and kept until a
 * setting or a combat changes (finding -19). `isGM` is kept for completeness; the glue passes the
 * live value to ghostForCtx.
 */
export function buildGhostContext({ isGM, policy, wish, ownedOnTop, combats } = {}) {
  return Object.freeze({
    isGM: !!isGM, policy: normalizePolicy(policy), wish: !!wish, ownedOnTop,
    combatScenes: combatSceneIds(combats)
  });
}

/** ghostFor() for one token from a ghost context: equal to ghostFor() over the live inputs. */
export function ghostForCtx(ctx, { isOwner, sceneId, isGM = ctx?.isGM } = {}) {
  return ghostFor({
    isGM, policy: ctx?.policy, wish: ctx?.wish, isOwner,
    combatActive: !!sceneId && !!ctx?.combatScenes?.has(sceneId)
  });
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
 * Keyboard movement (finding -18): TokenLayer#_prepareKeyboardMovementUpdates returns
 * `[…, { movement: { [tokenId]: { constrainOptions } } }]`. For each moved object that ghosts,
 * its constrain options gain the three flags. Mutates `result` in place and returns it; anything
 * without that shape is returned untouched.
 */
export function ghostKeyboardMovement(result, objects, isGhost) {
  const movement = result?.[1]?.movement;
  if (!movement) return result;
  for (const o of objects ?? []) {
    const m = movement[o?.id];
    if (m && isGhost(o)) m.constrainOptions = constrainFor(m.constrainOptions, true);
  }
  return result;
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

/**
 * The console status (finding -23), from plain inputs. Key order is part of the contract: later
 * keys are only ever appended.
 */
export function statusFrom({ policy, combat, wish, isGM, ownedOnTop, patched } = {}) {
  const p = normalizePolicy(policy);
  const { allowed, reason } = ghostAllowed({ policy: p, combatActive: combat });
  return {
    policy: p, combatOnScene: !!combat, allowed, reason,
    wish: !!wish, ghost: !isGM && allowed && !!wish,
    ownedOnTop: !!ownedOnTop,
    patched: { drag: !!patched?.drag, keyboard: !!patched?.keyboard }
  };
}

/**
 * The "ghost is allowed again" toast for this client, or null (finding -42). Like ghostBack, but
 * it names why ghost is allowed NOW: cleared by a fight that is still running means the GM changed
 * the policy, so the toast is the GM one (`off`), not "the fight is over".
 */
export function ghostBackKey({ cleared, policy, combatActive, wish } = {}) {
  if (!ghostBack({ cleared, policy, combatActive, wish })) return null;
  if (cleared === "combat" && combatActive) return NOTIFY_BACK.off;
  return NOTIFY_BACK[cleared] ?? null;
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
