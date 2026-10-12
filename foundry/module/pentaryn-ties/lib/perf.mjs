// pentaryn kit 1.1.0 · vendored from foundry/lib/perf.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Three helpers core does not have. For debounce and throttle use core's
 * `foundry.utils.debounce` / `foundry.utils.throttle`.
 *
 *   memo      cache a pure-ish read per key (a hot hook reading per-token state)
 *   coalesce  callers during one in-flight run share its promise (a rebuild several hooks ask for)
 *   perFrame  run at most once per animation frame with the latest args (refreshToken, pointermove)
 */

/**
 * @param {Function} fn
 * @param {(...args) => *} [keyFn]  default: the first argument
 * @param {{ ttlMs?: number, max?: number, now?: () => number }} [opts]
 */
export function memo(fn, keyFn = (...args) => args[0], { ttlMs = Infinity, max = 500, now = () => Date.now() } = {}) {
  const cache = new Map();
  const wrapped = function (...args) {
    const key = keyFn(...args);
    const hit = cache.get(key);
    if (hit && now() - hit.at < ttlMs) return hit.value;
    const value = fn.apply(this, args);
    cache.delete(key);
    cache.set(key, { value, at: now() });
    while (cache.size > max) cache.delete(cache.keys().next().value);
    return value;
  };
  wrapped.clear = () => cache.clear();
  wrapped.size = () => cache.size;
  return wrapped;
}

/**
 * One run at a time: a call while a run is in flight gets that run's promise (its own args are
 * ignored). The next call after it settles starts a fresh run.
 */
export function coalesce(fn) {
  let inflight = null;
  return function (...args) {
    if (inflight) return inflight;
    inflight = (async () => fn.apply(this, args))().finally(() => {
      inflight = null;
    });
    return inflight;
  };
}

/** At most one run per animation frame (`setTimeout 0` where there is no rAF); the latest args win. */
export function perFrame(fn, { g = globalThis } = {}) {
  let scheduled = false;
  let lastArgs = [];
  let lastThis;
  const schedule = g.requestAnimationFrame ? cb => g.requestAnimationFrame(cb) : cb => g.setTimeout(cb, 0);
  return function (...args) {
    lastArgs = args;
    lastThis = this;
    if (scheduled) return;
    scheduled = true;
    schedule(() => {
      scheduled = false;
      fn.apply(lastThis, lastArgs);
    });
  };
}
