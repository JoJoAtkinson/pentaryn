/**
 * Wall autocomplete (pentaryn-walls) — PURE core: constants, the HOOKS table, and the pure helpers
 * the glue renders with. No Foundry global at runtime, so every function here runs in node on
 * plain data. Glue files import from here; nothing here imports glue.
 *
 * Barrel: the engine and the backend registry are re-exported from here, so glue and tests import
 * one path.
 */

export * from "./wall-engine.mjs";
export { register, get, list, available, canonical, compare } from "./backends.mjs";

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
 */
export function readyLine(names) {
  return `ready — backends: ${names.join(", ")}. ` +
    `Alt+W run, Alt+Z undo, Alt+Shift+W preview. ` +
    `API: game.pentaryn.walls.preview() / .run() / .undo() / .makeMacro()`;
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
