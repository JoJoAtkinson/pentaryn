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
  snapResolution, resolveConfig, FLAG_SCOPE, READ_SCOPES, stampOf, SOLID, lintOnly, analyze, runEngine, wallCategory
} from "./core/engine.mjs";
import { register, get, list, available, canonical, compare } from "./core/backends.mjs";
import { MODULE_SCOPE, LEGACY_SCOPE, MIGRATION_VERSION, planScopeMigration } from "./core/migrate.mjs";

export {
  snapResolution, resolveConfig, FLAG_SCOPE, READ_SCOPES, stampOf, SOLID, lintOnly, analyze, runEngine, wallCategory,
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
 * @param {string} sceneName
 * @param {{report, refusals, lints}} result  an engine result
 * @param {{committed: boolean, backend: string, ms: number}} meta
 * @returns {string} HTML
 */
export function reportHtml(sceneName, result, {committed, backend, ms}) {
  const {report: r, refusals, lints} = result;
  const lines = [];
  lines.push(`<p><strong>Wall autocomplete — ${sceneName}</strong></p>`);
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

/**
 * Which walls an undo touches. Reads the run stamps from PLAIN wall data (`toObject()`), never
 * `getFlag`, which throws for the non-package scope "wall-autocomplete" (senses-walls-cursors-1).
 * Stamps are read under every READ_SCOPES scope (stampOf), so a migrated wall undoes the same.
 *
 * The latest run is the greatest `run` stamp by string order (ISO timestamps sort by time). A
 * stamped wall marked `generated` is deleted; one with only a `priorC` was a user wall the run
 * trimmed or welded, and gets its coordinates back. `remaining` counts the other runs still applied.
 *
 * @param {{_id?: string, id?: string, flags?: object}[]} walls
 * @param {{all?: boolean}} [opts]  all: every run, not just the latest
 * @returns {{stamped: number, latest: string|null, generated: string[], restores: {_id: string, c: number[]}[], remaining: number}}
 *   restores carry only `_id` and `c`; the caller adds the flag deletion.
 */
export function planUndo(walls, {all = false} = {}) {
  const flag = (w, key) => stampOf(w)[key];
  const stamped = walls.filter(w => flag(w, "run"));
  if (!stamped.length) return {stamped: 0, latest: null, generated: [], restores: [], remaining: 0};
  const latest = stamped.map(w => flag(w, "run")).sort().at(-1);
  const targets = all ? stamped : stamped.filter(w => flag(w, "run") === latest);
  const generated = [], restores = [];
  for (const w of targets) {
    if (flag(w, "generated")) generated.push(w._id ?? w.id);
    else {
      const prior = flag(w, "priorC");
      if (prior) restores.push({_id: w._id ?? w.id, c: [...prior]});
    }
  }
  const remaining = new Set(stamped.map(w => flag(w, "run"))).size - 1;
  return {stamped: stamped.length, latest, generated, restores, remaining};
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
    let out;
    try {
      out = Promise.resolve(fn(...args));
    } catch (err) {
      out = Promise.reject(err);
    }
    return out.finally(() => { lock.busy = false; });
  };
}
