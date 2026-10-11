// Verbatim oracles at the senses characterisation checkpoint (wave 3, base a5a1a906). Never
// imported by runtime. Plan step 2 moves `esc` and `unset` to core/util.mjs (finding -18, -10);
// step 5 replaces the predicates with the kit's election functions (-17); step 7 replaces the two
// hand-written publish guards with the kit's publishNamespace (-34). util.test.mjs pins these.

/** light.mjs:40 */
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** light.mjs:43–48 — `{path: delete}` in the v14 form, falling back to the older "-=" key. */
export function unset(path) {
  if (globalThis._del) return { [path]: globalThis._del };
  const i = path.lastIndexOf(".");
  return { [`${path.slice(0, i)}.-=${path.slice(i + 1)}`]: null };
}

/** chain.mjs:69 — break chain's literal: always the "-=" key. */
export const chainUnset = (MODULE, CHAIN_FLAG, _id) => ({ _id, [`flags.${MODULE}.-=${CHAIN_FLAG}`]: null });

/** senses.mjs:61 — the carried-light prior's deletion: `_del`, else a null VALUE on the plain key. */
export const priorDelete = () => globalThis._del ?? null;

/** senses.mjs:20–22 `isWriter` — the active GM, else any GM when none is active. */
export function isWriter(game) {
  return game.users.activeGM?.isSelf ?? game.user.isGM;
}
/** light.mjs:41 `isGM` — the active GM only (also resetSight, migrate.mjs:95). */
export const isGM = game => !!game.users?.activeGM?.isSelf;
/** chain.mjs:53/62/172/214, light.mjs:300/678 — any GM. */
export const anyGM = game => !!game.user?.isGM;

/** senses.mjs:120–125 (chain.mjs:263–271 is the same with `chain`) — the frozen-root publish guard. */
export function publish(game, key, api) {
  const current = game.pentaryn;
  if (current && !Object.isExtensible(current)) game.pentaryn = { ...current, [key]: api };
  else {
    game.pentaryn ??= {};
    game.pentaryn[key] = api;
  }
}
