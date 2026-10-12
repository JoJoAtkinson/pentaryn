/**
 * Wall autocomplete (pentaryn-walls) — PURE core: constants, the HOOKS table, and the pure helpers
 * the glue renders with. No Foundry global at runtime, so every function here runs in node on
 * plain data. Glue files import from here; nothing here imports glue.
 *
 * Barrel: the engine and the backend registry are re-exported from here, so glue and tests import
 * one path. They are imported and then exported by name (not `export … from`) so the import-graph
 * tools see both files, and so this list is the core's whole surface.
 */

import {
  snapResolution, resolveConfig, FLAG_SCOPE, READ_SCOPES, stampOf, historyOf, runKey, SOLID, lintOnly, analyze, runEngine,
  wallCategory
} from "./core/engine.mjs";
import { register, get, list, available, canonical, compare } from "./core/backends.mjs";
import { MODULE_SCOPE, LEGACY_SCOPE, MIGRATION_VERSION, planScopeMigration } from "./core/migrate.mjs";

export {
  snapResolution, resolveConfig, FLAG_SCOPE, READ_SCOPES, stampOf, historyOf, runKey, SOLID, lintOnly, analyze,
  runEngine, wallCategory,
  register, get, list, available, canonical, compare,
  MODULE_SCOPE, LEGACY_SCOPE, MIGRATION_VERSION, planScopeMigration,
};

export const MODULE = "pentaryn-walls";
export const SHORT = "walls";
export const NS = "walls";
export const VERSION = "0.2.0";                       // === module.json version (a test pins it)
export const CONTRACT = "pentaryn-walls/api@1";       // bump the major on a published-shape change
export const I18N = "PENTARYN_WALLS";
export const CSS = "pw-";

/** Events this module emits: none. */
export const HOOKS = Object.freeze({});

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

/** HTML-escape text for a card, matching foundry.utils.escapeHTML (not available in node). */
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" };
const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ESCAPES[c]);

/**
 * The ready console line, without the `<module> |` prefix.
 * @param {string[]} names  the available backends, in registry order
 * @param {string|null} [wasmError]  why the compiled backend failed to load, if it did: appended so
 *   a missing or broken .wasm is visible in "auto" mode, which otherwise falls back silently
 */
export function readyLine(names, wasmError = null) {
  return `ready — backends: ${names.join(", ")}. ` +
    `Alt+W run, Alt+Z undo, Alt+Shift+W preview. ` +
    `API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()` +
    (wasmError ? ` (wasm unavailable: ${wasmError})` : "");
}

/**
 * The GM chat card for a preview or a run.
 * @param {string} sceneName  escaped here, so a scene name can't inject markup (walls-edge-7)
 * @param {{report, refusals, lints}} result  an engine result
 * @param {{committed: boolean, backend: string, ms: number}} meta
 * @returns {string} HTML
 */
export function reportHtml(sceneName, result, {committed, backend, ms}) {
  const {report: r, refusals, lints} = result;
  const lines = [];
  lines.push(`<p><strong>Wall autocomplete — ${escapeHtml(sceneName)}</strong></p>`);
  lines.push(`<p>${committed ? "Committed" : "<em>Preview — nothing was written.</em>"} ` +
             `${r.created} ${plural(r.created, "wall")} created, ${r.moved} moved, ` +
             `${r.iterations} ${plural(r.iterations, "pass", "passes")} in ${Math.round(ms)} ms ` +
             `<span style="opacity:.6">(${backend})</span>.</p>`);

  const closed = r.components.filter(c => c.closed).length;
  lines.push(`<p>${r.components.length} ${plural(r.components.length, "component")}: ` +
             `${closed} closed (inert), ${r.components.length - closed} still open.</p>`);

  if (lints.length) {
    lines.push(`<p><strong>Lint</strong></p><ul>` +
      lints.map(l => `<li><code>${l.code}</code> ${l.msg}</li>`).join("") + `</ul>`);
  }
  if (refusals.length) {
    lines.push(`<p><strong>Refused ${refusals.length} — finish these by hand</strong></p><ul>` +
      refusals.map(x => `<li>(${x.at[0]}, ${x.at[1]}) &mdash; ${x.why}</li>`).join("") + `</ul>`);
  }
  // The tolerances are echoed every run so the one fuzzy part of the engine stays visible.
  lines.push(`<p style="opacity:.7;font-size:.9em">grid ${r.config.gridSize}px &middot; ` +
             `weld ${r.config.weldEps}px &middot; collinear ${r.config.collEps}px &middot; ` +
             `pin ${r.config.pinEps}px &middot; gap/corner/reach ${r.config.gapMax}/${r.config.cornerMax}/${r.config.extMax} squares</p>`);
  return lines.join("");
}

/**
 * The GM chat card for an undo.
 * @param {{generated: number, restored: number, all: boolean, latest: string|null, remaining: number}} u
 * @returns {string} HTML
 */
export function undoHtml({generated, restored, all, latest, remaining}) {
  return `<p><strong>Wall autocomplete — undo</strong></p>` +
    `<p>Removed ${generated} generated ${plural(generated, "wall")} and ` +
    `restored ${restored} trimmed ${plural(restored, "wall")} ` +
    `${all ? "(everything)" : `from the run at ${latest}`}.</p>` +
    (!all && remaining > 0
      ? `<p style="opacity:.7">${remaining} earlier ${plural(remaining, "run")} still applied — undo again to peel back further.</p>` : "");
}

/** Every run id in a wall's history: its creating run, then each run that moved it. */
const runsOf = h => [...(h.created ? [h.created] : []), ...Object.keys(h.moves)];

/**
 * Which walls an undo touches. Reads the run stamps from PLAIN wall data (`toObject()`), never
 * `getFlag`, which throws for the non-package scope "wall-autocomplete" (senses-walls-cursors-1).
 * Stamps are read under every READ_SCOPES scope (historyOf), so a migrated wall undoes the same.
 *
 * Per-run history (walls-edge-2): the latest run is the greatest run id across every wall's
 * creating `run` and `moves` keys (string order; ISO timestamps sort by time). A generated wall
 * is deleted only when the latest run created it; any wall with a `moves[latest]` entry gets those
 * coordinates back — so undoing run 2 restores a run-1 wall run 2 moved, rather than deleting it.
 * `all` deletes every generated wall and restores every other one to its earliest run's prior.
 * `remaining` counts the other distinct runs still applied. Legacy flat stamps read as before.
 *
 * @param {{_id?: string, id?: string, flags?: object}[]} walls
 * @param {{all?: boolean}} [opts]  all: every run, not just the latest
 * @returns {{stamped: number, latest: string|null, generated: string[], restores: {_id: string, c: number[]}[], remaining: number}}
 *   restores carry only `_id` and `c`; the caller adds the flag deletion (undoDrops).
 */
export function planUndo(walls, {all = false} = {}) {
  const stamped = walls.map(w => ({w, h: historyOf(w)})).filter(({h}) => runsOf(h).length);
  if (!stamped.length) return {stamped: 0, latest: null, generated: [], restores: [], remaining: 0};
  const ids = new Set(stamped.flatMap(({h}) => runsOf(h)));
  const latest = [...ids].sort().at(-1);
  const generated = [], restores = [];
  for (const {w, h} of stamped) {
    const id = w._id ?? w.id;
    if (all ? h.generated : h.created === latest) { generated.push(id); continue; }
    const from = all ? Object.keys(h.moves).sort()[0] : latest;
    const prior = from !== undefined && Object.hasOwn(h.moves, from) ? h.moves[from] : null;
    if (prior) restores.push({_id: id, c: [...prior]});
  }
  return {stamped: stamped.length, latest, generated, restores, remaining: ids.size - 1};
}

/**
 * The flag paths an undo deletes from a wall it restores. Once no run is left on the wall, its whole
 * stamp under each scope it carries one in; otherwise only that run's entry — `moves.<run>`, or the
 * legacy flat `run` + `priorC` — so the runs before it still undo (walls-edge-2).
 * @param {{flags?: object}} w  plain wall data
 * @param {string} run  the run being undone
 * @param {{all?: boolean}} [opts]
 * @returns {string[]} dotted update keys, each to be set to the deletion operator
 */
export function undoDrops(w, run, {all = false} = {}) {
  const scopes = READ_SCOPES.filter(s => w?.flags?.[s]);
  const h = historyOf(w);
  if (all || runsOf(h).every(r => r === run)) return scopes.map(s => `flags.${s}`);
  return scopes.flatMap(s => {
    const f = w.flags[s];
    if (f.moves && Object.hasOwn(f.moves, run)) return [`flags.${s}.moves.${run}`];
    if (!h.generated && f.run === run) return [`flags.${s}.run`, `flags.${s}.priorC`];
    return [];
  });
}

/**
 * One call at a time. `exclusive(fn, {onBusy, lock})` returns a function that runs `fn` and
 * resolves to its result — or, while a previous call holding the same `lock` is still pending,
 * calls `onBusy()` and returns `null` without running. The lock is released when the call settles,
 * whether it resolved or threw. Wrappers that share one `lock` exclude each other.
 * @param {(...args) => *} fn
 * @param {{onBusy?: () => void, lock?: {busy: boolean}}} [opts]
 */
export function exclusive(fn, {onBusy, lock = {busy: false}} = {}) {
  return (...args) => {
    if (lock.busy) {
      onBusy?.();
      return null;
    }
    lock.busy = true;
    const gen = lock.gen = (lock.gen ?? 0) + 1;
    let out;
    try {
      out = Promise.resolve(fn(...args));
    } catch (err) {
      out = Promise.reject(err);
    }
    return out.finally(() => { if (lock.gen === gen) lock.busy = false; });
  };
}
