/**
 * Cross-module registration-order fixture. Two stub modules both listen to a vetoable pre-hook.
 * Registering at module scope (esmodule evaluation) runs before anything registered in `setup`,
 * so moving one module's registration to `setup` reorders the listeners — a behaviour change
 * when either can veto. Used by hooks.test.mjs; generalised in Wave 8 for combat/transform/riders.
 */

export function stubHooks() {
  const listeners = new Map();
  let seq = 0;
  let ran = [];
  const H = {
    on(name, fn) {
      const id = ++seq;
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push({ id, fn });
      return id;
    },
    once(name, fn) {
      const id = H.on(name, (...a) => {
        H.off(name, id);
        return fn(...a);
      });
      return id;
    },
    off(name, id) {
      const list = listeners.get(name) ?? [];
      const i = list.findIndex(l => l.id === id);
      if (i >= 0) list.splice(i, 1);
    },
    callAll(name, ...args) {
      for (const l of [...(listeners.get(name) ?? [])]) l.fn(...args);
      return true;
    },
    /** Foundry semantics: stops at the first `false` and returns false. `H.ran` says who ran. */
    call(name, ...args) {
      ran = [];
      for (const l of [...(listeners.get(name) ?? [])]) {
        if (l.fn(...args) === false) return false;
      }
      return true;
    },
    get ran() {
      return [...ran];
    },
    fire(name, ...args) {
      return H.callAll(name, ...args);
    },
    mark(who) {
      ran.push(who);
    },
    count() {
      return [...listeners.values()].reduce((n, l) => n + l.length, 0);
    },
  };
  return H;
}

/** Module A: vetoes the activity (a rider that refuses a use). */
export function moduleA(H, when) {
  const listen = () => H.on("dnd5e.preUseActivity", () => {
    H.mark("A");
    return false;
  });
  if (when === "module-scope") listen();
  else H.once("setup", listen);
}

/** Module B: observes the activity (and would do work A's veto should have prevented). */
export function moduleB(H, when) {
  const listen = () => H.on("dnd5e.preUseActivity", () => {
    H.mark("B");
  });
  if (when === "module-scope") listen();
  else H.once("setup", listen);
}
