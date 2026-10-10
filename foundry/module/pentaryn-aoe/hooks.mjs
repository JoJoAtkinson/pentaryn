/**
 * Hook registration that remembers its ids, so a hot-patched copy can be removed cleanly
 * (game.pentaryn.aoe.uninstall()) and a second install never stacks a duplicate.
 */

const registered = [];

export function on(name, fn) {
  const id = Hooks.on(name, fn);
  registered.push([name, id]);
  return id;
}

export function hookIds() {
  return registered.map(([name, id]) => ({ name, id }));
}

export function offAll() {
  for (const [name, id] of registered.splice(0)) Hooks.off(name, id);
}

/** Log and swallow: these run inside core/system hooks, where a throw breaks someone else's render. */
export function guard(label, fn) {
  return (...args) => {
    try {
      const out = fn(...args);
      if (out instanceof Promise) out.catch(err => console.error(`pentaryn-aoe | ${label}`, err));
      return out instanceof Promise ? undefined : out;
    } catch (err) {
      console.error(`pentaryn-aoe | ${label}`, err);
    }
  };
}
