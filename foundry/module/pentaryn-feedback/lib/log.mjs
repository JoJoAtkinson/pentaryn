// pentaryn kit 1.2.0 · vendored from foundry/lib/log.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * One logger per module. Every line starts `<moduleId> | <event>`, byte-identical to the
 * hand-written `console.warn(\`${MODULE} | …\`)` lines it replaces, so a glue test can pin them.
 *
 * Debug output and the trace ring are gated by `CONFIG.debug["<moduleId>"] === true`, which a GM
 * can flip from the console without a reload.
 */

/**
 * `log` when the caller passed one, else a console stand-in with the same `<moduleId> | <event>`
 * lines: `error/warn` and a `warnOnce` whose Set lives in this stand-in. The one fallback for kit
 * functions that take an optional `log` (hooks, patch, patch-libwrapper) — build it once per
 * closure so `warnOnce` keeps its promise. `g.console` is read at call time and may be absent.
 */
export function logOrConsole(moduleId, log, { g = globalThis } = {}) {
  if (log) return log;
  const warned = new Set();
  const line = event => `${moduleId} | ${event}`;
  return {
    error: (event, ...rest) => g.console?.error(line(event), ...rest),
    warn: (event, ...rest) => g.console?.warn(line(event), ...rest),
    warnOnce(key, event, ...rest) {
      if (warned.has(key)) return;
      warned.add(key);
      g.console?.warn(line(event), ...rest);
    },
  };
}

export function makeLog(moduleId, { console: c = globalThis.console, traceSize = 200, g = globalThis } = {}) {
  const warned = new Set();
  const ring = [];
  const line = event => `${moduleId} | ${event}`;

  const log = {
    get enabled() {
      return g.CONFIG?.debug?.[moduleId] === true;
    },

    /** `log.debug$?.(expensive())` — the argument is never built when debug is off. */
    get debug$() {
      return log.enabled ? log.debug : undefined;
    },

    /** Logs and returns an Error (the first rest arg when it is one), so `throw log.error(…)` reads well. */
    error(event, ...rest) {
      c.error(line(event), ...rest);
      return rest[0] instanceof Error ? rest[0] : new Error(event);
    },

    warn(event, ...rest) {
      c.warn(line(event), ...rest);
    },

    /** Warn once per key for the life of the page. */
    warnOnce(key, event, ...rest) {
      if (warned.has(key)) return;
      warned.add(key);
      c.warn(line(event), ...rest);
    },

    /** Audit lines for cross-user writes: pass `{uuid, ids, by}`. */
    info(event, ...rest) {
      c.info(line(event), ...rest);
    },

    debug(event, ...rest) {
      if (log.enabled) c.debug(line(event), ...rest);
    },

    trace(op, data) {
      if (!log.enabled) return;
      ring.push({ at: Date.now(), op, data });
      if (ring.length > traceSize) ring.splice(0, ring.length - traceSize);
    },

    traces() {
      return ring.map(t => ({ ...t }));
    },

    /**
     * Run `fn`; on a throw or a rejection log at debug and return `fallback`. For the places a
     * failure is expected and harmless — never for a write.
     */
    swallow(op, fn, fallback) {
      try {
        const out = fn();
        if (out && typeof out.then === "function") {
          return out.then(v => v, err => {
            log.debug(op, err);
            return fallback;
          });
        }
        return out;
      } catch (err) {
        log.debug(op, err);
        return fallback;
      }
    },

    /**
     * The one way to put a toast on screen. Always logs one console line first; the toast only
     * when `ui.notifications[level]` exists (its result, else undefined).
     */
    notify(level, message, opts = {}) {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "info";
      c[method](line(message));
      const n = g.ui?.notifications;
      if (typeof n?.[level] !== "function") return undefined;
      return n[level](message, { console: false, ...opts });
    },
  };
  return log;
}
