// pentaryn kit 1.2.0 · vendored from foundry/lib/perf.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Three helpers core does not have. For debounce and throttle use core's
 * `foundry.utils.debounce` / `foundry.utils.throttle`.
 *
 *   memo      cache a pure-ish read per key (a hot hook reading per-token state)
 *   coalesce  callers during one in-flight run share its promise (a rebuild several hooks ask for)
 *   perFrame  run at most once per animation frame with the latest args (refreshToken, pointermove)
 */

/**
 * Key by a string: pass a keyFn that returns a uuid or id, never a placeable — the cache is a
 * plain Map, so an object key is held strongly and outlives a canvas redraw. Eviction is FIFO
 * (oldest first insertion; a hit does not refresh it) once more than `max` keys are held,
 * default max 500. (1.2.0 kit-perf-2)
 *
 * @param {Function} fn
 * @param {(...args) => *} [keyFn]  default: the first argument — pass one returning a string
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
 * ignored), including a call from inside fn's own synchronous prefix. The next call after it
 * settles starts a fresh run.
 */
export function coalesce(fn) {
  let inflight = null;
  return function (...args) {
    if (inflight) return inflight;
    let resolve, reject;
    const run = new Promise((res, rej) => { resolve = res; reject = rej; });
    inflight = run;
    (async () => {
      try {
        resolve(await fn.apply(this, args));
      } catch (err) {
        reject(err);
      } finally {
        if (inflight === run) inflight = null;
      }
    })();
    return run;
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
