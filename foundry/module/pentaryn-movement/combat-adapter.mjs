/**
 * Pentaryn Movement — adapter: Foundry documents → the plain inputs movement-core reads.
 *
 * Reads only; never writes, never hooks. Everything it returns is plain data.
 */

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
