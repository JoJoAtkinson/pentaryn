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
 * The pins-under-tokens inputs for a scene: its notes (pin centres) and its visible tokens as
 * pixel rectangles, each flagged when a non-GM user owns it.
 * @returns {{ notes: object[], tokens: object[] }}
 */
export function pinInputs(scene) {
  const size = scene.grid?.size ?? canvas?.grid?.size ?? 100;
  const notes = scene.notes.map(n => ({ id: n.id, x: n.x, y: n.y, label: n.text || n.entry?.name || n.label || "" }));
  const tokens = scene.tokens.filter(t => !t.hidden).map(t => ({
    id: t.id, name: t.name, x: t.x, y: t.y, w: (t.width ?? 1) * size, h: (t.height ?? 1) * size,
    playerOwned: game.users.some(u => !u.isGM && t.testUserPermission?.(u, "OWNER"))
  }));
  return { notes, tokens };
}
