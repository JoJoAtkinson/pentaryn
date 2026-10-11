// Oracle: verbatim copies of the pure rules in names.mjs as of the characterisation checkpoint
// (names.mjs:7-16, unchanged since snapshot ee505c2), and of the token loop inside sync()
// (names.mjs:25-31) wrapped as a planner. Never edit these bodies: every later step is checked
// against them (guide step 2 asserts core.fn deep-equals oracle.fn row by row).

/** "Glubbek, Kuo-toa Net-Mender" -> "Glubbek". */
export function shortName(name) {
  return String(name ?? "").split(",")[0].trim();
}

/** The new label for a token, or null when the token's label is a nickname. */
export function relabel(label, oldName, newName) {
  if (label === oldName) return newName;
  if (label === shortName(oldName) && shortName(oldName) !== oldName) return shortName(newName);
  return null;
}

/**
 * names.mjs:26-31 for one scene's tokens. `canEdit(t)` stands in for
 * `t.canUserModify(game.user, "update")`. Returns the `updates` array sync() would send.
 */
export function legacyPlan(tokens, { actorId, oldName, newName, canEdit }) {
  const updates = [];
  for (const t of tokens) {
    if (t.actorId !== actorId || !canEdit(t)) continue;
    const label = relabel(t.name, oldName, newName);
    if (label !== null && label !== t.name) updates.push({ _id: t.id, name: label });
  }
  return updates;
}
