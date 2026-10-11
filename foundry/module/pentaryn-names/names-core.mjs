/**
 * Pentaryn Token Name Sync — PURE core: constants, the HOOKS table, and the relabel rules.
 *
 * No Foundry global at runtime, so every rule here runs in node on plain fixtures. Glue files
 * import from here; nothing here imports glue.
 *
 * The rule: a token label follows an actor rename only if it was derived from the old name — the
 * full name, or the part before the first comma. Anything else is a nickname the GM chose and is
 * left alone.
 */

export const MODULE = "pentaryn-names";
export const SHORT = "names";
export const NS = "names";
export const VERSION = "0.1.0";                       // === module.json version (core-meta.test pins it)
export const CONTRACT = "pentaryn-names/api@1";       // bump the major on a published-shape change
export const I18N = "PENTARYN_NAMES";
export const CSS = "pnm-";
export const FLAG_SCOPE = MODULE;

/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

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
 * The token label writes one scene needs after a rename: `[{_id, name}]`, in token order. A token
 * of another actor, or one `canEdit(token)` refuses, is skipped (canEdit is asked only for this
 * actor's tokens); a label that is a nickname, or already right, is not written.
 * @param {Iterable<{id: string, actorId: string, name: string}>} tokens
 * @param {{actorId: string, oldName: string, newName: string, canEdit: (token: object) => boolean}} opts
 * @returns {{_id: string, name: string}[]}
 */
export function planTokenRelabels(tokens, { actorId, oldName, newName, canEdit }) {
  const updates = [];
  for (const t of tokens) {
    if (t.actorId !== actorId || !canEdit(t)) continue;
    const label = relabel(t.name, oldName, newName);
    if (label !== null && label !== t.name) updates.push({ _id: t.id, name: label });
  }
  return updates;
}
