/**
 * Pentaryn Movement — adapter: Foundry documents → the plain inputs movement-core reads.
 *
 * Reads only; never writes, never hooks. Everything it returns is plain data.
 */

import { GHOST_COMBAT_FLAG, MODULE, ghostInCombat } from "./movement-core.mjs";
import { readFlag } from "./lib/flags.mjs";

/** Does this actor's nature (an incorporeal feat) or the GM's flag let it ghost during a fight? */
export function exemptActor(actor) {
  return ghostInCombat(exemptInputs(actor) ?? {});
}

/**
 * The ids of the tokens this user owns on `scene` whose actor is exempt (I1). Asked only while a
 * fight runs on the scene, once per change — never from a per-token path. A Scene, or nothing → [].
 */
export function exemptTokenIds(scene) {
  return ownedTokenActors(scene).filter(t => ghostInCombat(t.inputs)).map(t => t.id);
}

/**
 * The ghost-in-combat inputs of an actor, as movement-core's ghostInCombat reads them: its items
 * (`{ type, name }` — the Item documents themselves qualify) and our own `ghostInCombat` flag. A
 * token's synthetic actor carries its delta's flags, so an unlinked summon reads its own. null
 * without an actor.
 * @returns {{ items: object[], flag: boolean } | null}
 */
export function exemptInputs(actor) {
  if (!actor) return null;
  const items = actor.items?.contents ?? (Array.isArray(actor.items) ? actor.items : []);
  return { items, flag: readFlag(actor, MODULE, GHOST_COMBAT_FLAG) === true };
}

/**
 * The tokens on a scene this user owns, each with its ghost-in-combat inputs (tokens without an
 * actor are left out). A Scene document, or nothing → [].
 * @returns {{ id: string, name: string, inputs: { items: object[], flag: boolean } }[]}
 */
export function ownedTokenActors(scene) {
  const docs = scene?.tokens?.contents ?? (Array.isArray(scene?.tokens) ? scene.tokens : []);
  const out = [];
  for (const t of docs) {
    if (!t?.isOwner) continue;
    const inputs = exemptInputs(t.actor);
    if (inputs) out.push({ id: t.id, name: t.name ?? "", inputs });
  }
  return out;
}

/**
 * Plain summaries of the world's combats for movement-core. Hidden combatants are left out: players'
 * clients receive them, and counting them would switch ghost off (with a "fight started" toast) the
 * moment the GM adds a hidden ambush to the tracker, before anything is revealed or started.
 * @returns {{ active: boolean, sceneId: string|null, started: boolean, combatantSceneIds: string[] }[]}
 */
export function combatSummaries(combats = game.combats?.contents) {
  return (combats ?? []).map(c => ({
    active: !!c.active,
    sceneId: c.scene?.id ?? c._source?.scene ?? null,
    started: !!c.started,
    combatantSceneIds: (c.combatants?.contents ?? []).filter(cb => !cb.hidden)
      .map(cb => cb.sceneId ?? cb.token?.parent?.id).filter(Boolean)
  }));
}

/**
 * A scene argument as the API takes it: a Scene document, or a scene id string resolved through
 * `game.scenes` (rob-1, rob-3). An unknown id, an empty string or nothing answers null.
 * @param {object|string|null|undefined} scene
 * @returns {object|null}
 */
export function sceneOf(scene) {
  if (typeof scene === "string") return (scene && game.scenes?.get(scene)) || null;
  return scene && typeof scene === "object" ? scene : null;
}

/**
 * The id of a scene argument: a scene id string as given, or a Scene document's id (rob-1, rob-3).
 * Anything else answers null.
 * @param {object|string|null|undefined} scene
 * @returns {string|null}
 */
export function sceneIdOf(scene) {
  if (typeof scene === "string") return scene || null;
  return (scene && typeof scene === "object" && typeof scene.id === "string" && scene.id) || null;
}

/**
 * The pins-under-tokens inputs for a scene: its notes (pin centres) and its visible tokens as
 * pixel rectangles, each flagged when a non-GM user owns it. Foundry 14 scene levels: each note
 * carries the level ids it shows on ([] = every level), each token its level or null (movement-edge-5).
 * @returns {{ notes: object[], tokens: object[] }}
 */
export function pinInputs(scene) {
  const size = scene.grid?.size ?? canvas?.grid?.size ?? 100;
  const notes = scene.notes.map(n => ({ id: n.id, x: n.x, y: n.y, label: n.text || n.entry?.name || n.label || "",
    levels: Array.from(n.levels ?? []) }));
  // TokenDocument#getSize applies the hex correction; on square and gridless grids it equals width × size.
  const tokens = scene.tokens.filter(t => !t.hidden).map(t => {
    const s = typeof t.getSize === "function" ? t.getSize() : null;
    return {
      id: t.id, name: t.name, x: t.x, y: t.y,
      w: s?.width ?? (t.width ?? 1) * size, h: s?.height ?? (t.height ?? 1) * size,
      playerOwned: game.users.some(u => !u.isGM && t.testUserPermission?.(u, "OWNER")),
      level: t.level ?? null
    };
  });
  return { notes, tokens };
}
