// pentaryn kit 1.0.1 · vendored from foundry/lib/hooks.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * Hook registration that remembers what it registered, and the one way a module emits its own hooks.
 *
 * `reg.on/once` record `{kind, name, id, label}` in order. That record is the registration manifest:
 * `test/golden/hooks.json` pins it, `describe().hooks` reports it, and `reg.offAll()` unwinds it so a
 * hot-patched copy never stacks a second listener.
 */

import { codedError } from "./errors.mjs";

export function hookRegistry(moduleId, log = null, { g = globalThis } = {}) {
  const records = [];
  const report = (label, err, level = "error") => {
    const lvl = level === "warn" ? "warn" : "error";
    if (log) log[lvl](label, err);
    else g.console?.[lvl](`${moduleId} | ${label}`, err);
  };

  const reg = {
    /**
     * PASS-THROUGH guard: the handler's return value reaches Foundry unchanged, so a `false` veto
     * from a pre-hook still vetoes. A sync throw is logged and becomes `undefined`; a rejected
     * promise is logged (the promise itself is still returned).
     * `level: "warn"` logs at warn instead of error (senses' handlers always warned).
     */
    guard(label, fn, { level = "error" } = {}) {
      return function guarded(...args) {
        try {
          const out = fn.apply(this, args);
          if (out && typeof out.then === "function") out.then(undefined, err => report(label, err, level));
          return out;
        } catch (err) {
          report(label, err, level);
          return undefined;
        }
      };
    },

    /**
     * pentaryn-aoe's original guard, kept verbatim until aoe is re-characterised: a promise is
     * swallowed (the hook sees `undefined`), so an async handler can never veto.
     */
    guardSwallowAsync(label, fn) {
      return (...args) => {
        try {
          const out = fn(...args);
          if (out instanceof Promise) out.catch(err => report(label, err));
          return out instanceof Promise ? undefined : out;
        } catch (err) {
          report(label, err);
        }
      };
    },

    /** `guard`: true (log at error, the default), "warn" (log at warn) or false (raw handler). */
    on(name, fn, { guard = true, label = name } = {}) {
      const id = g.Hooks.on(name, wrap(label, fn, guard));
      records.push({ kind: "on", name, id, label });
      return id;
    },

    once(name, fn, { guard = true, label = name } = {}) {
      const id = g.Hooks.once(name, wrap(label, fn, guard));
      records.push({ kind: "once", name, id, label });
      return id;
    },

    off(id) {
      const i = records.findIndex(r => r.id === id);
      if (i < 0) return false;
      const [r] = records.splice(i, 1);
      g.Hooks.off(r.name, r.id);
      return true;
    },

    offAll() {
      for (const r of records.splice(0).reverse()) g.Hooks.off(r.name, r.id);
    },

    ids() {
      return records.map(r => ({ ...r }));
    },
  };
  const wrap = (label, fn, guard) => {
    if (!guard) return fn;
    return reg.guard(label, fn, { level: guard === "warn" ? "warn" : "error" });
  };
  return reg;
}

/** "pentaryn-combat 0.8" → ["pentaryn-combat", [0, 8]]; anything else → null. */
function parseUntil(until) {
  const m = /^(\S+)\s+v?(\d+(?:\.\d+)*)$/.exec(String(until ?? "").trim());
  return m ? [m[1], m[2].split(".").map(Number)] : null;
}

function atLeast(version, target) {
  const v = String(version ?? "").split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(v.length, target.length); i++) {
    const a = v[i] ?? 0, b = target[i] ?? 0;
    if (a !== b) return a > b;
  }
  return true;
}

/**
 * `emit(key, ...args)` for the module's own events. `HOOKS[key]` =
 * `{ name, pre, args, legacyName?, until? }`.
 *  - pre rows go through `Hooks.call` (vetoable): `name` first, then `legacyName`; a veto by either → false.
 *  - other rows go through `Hooks.callAll` on both names.
 *  - a `legacyName` whose `until` ("<module id> <version>") has been reached still fires, and
 *    warns once that it is due for removal.
 */
export function emitter(moduleId, HOOKS, { g = globalThis, log = null, version = null } = {}) {
  const overdue = row => {
    const u = parseUntil(row.until);
    if (!u) return false;
    const current = version ?? g.game?.modules?.get?.(u[0])?.version;
    return current != null && atLeast(current, u[1]);
  };

  return function emit(key, ...args) {
    const row = HOOKS?.[key];
    if (!row?.name) throw codedError("BAD_ARGS", `${moduleId}: unknown hook ${key}`);
    if (row.legacyName && overdue(row)) {
      const msg = `legacy hook ${row.legacyName} is past ${row.until}; remove it`;
      if (log) log.warnOnce(`legacy:${row.legacyName}`, msg);
      else g.console?.warn(`${moduleId} | ${msg}`);
    }
    if (row.pre) {
      if (g.Hooks.call(row.name, ...args) === false) return false;
      if (row.legacyName && g.Hooks.call(row.legacyName, ...args) === false) return false;
      return true;
    }
    g.Hooks.callAll(row.name, ...args);
    if (row.legacyName) g.Hooks.callAll(row.legacyName, ...args);
    return true;
  };
}
