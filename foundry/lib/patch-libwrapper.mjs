// pentaryn kit 1.0.1 · vendored from foundry/lib/patch-libwrapper.mjs — edit the canonical file, then run scripts/foundry/blueprint/vendor.py
/**
 * The libWrapper route for `wrapMethod`. Vendored only into a module whose module.json names
 * lib-wrapper in `relationships` (vendor.py refuses otherwise), because these bytes name the
 * package and the Saturday updater's exposure grep counts every file that does.
 *
 *   wrapMethod(MODULE, { target, name, marker, path, adjustments }, make, { via: libWrapperRoute() })
 *
 * Registration failure → warn and return null, so wrapMethod falls through to a direct wrap
 * (pentaryn-prompts' behaviour).
 */

export function libWrapperRoute({ g = globalThis, log = null } = {}) {
  return {
    name: "libWrapper",
    register(spec, make) {
      if (!(g.game?.modules?.get("lib-wrapper")?.active && g.libWrapper)) return null;
      if (!spec.path) return null;
      try {
        const id = g.libWrapper.register(spec.moduleId, spec.path, make, spec.type ?? "WRAPPER");
        return () => g.libWrapper.unregister(spec.moduleId, id ?? spec.path, false);
      } catch (err) {
        if (log) log.warn("libWrapper registration failed, wrapping by hand", err);
        else g.console?.warn(`${spec.moduleId} | libWrapper registration failed, wrapping by hand`, err);
        return null;
      }
    },
  };
}
