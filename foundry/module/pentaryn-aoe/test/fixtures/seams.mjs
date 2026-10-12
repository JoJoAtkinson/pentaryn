/**
 * The one place the tests reach module code other than the entry (../../aoe.mjs) and the pure core
 * (../../core.mjs). Grouped by today's file. When the blueprint refactor moves a function (S4
 * adapters, S5 kit hooks, S6 argon.mjs), this shim re-exports the same name from its new home, and
 * no test changes. Each group is the file's public exports plus its `_internals` seam.
 *
 * Importing is side-effect free (no feature file registers a hook at module scope); install the
 * Foundry stub first anyway, since some groups read globals as soon as they are called.
 */
const group = mod => {
  const { _internals = {}, ...pub } = mod;
  return { ...pub, ..._internals };
};

/**
 * A second copy of Part G, as a hot patch would load it (same core/settings/hooks instances, fresh
 * module state). -44's hot-patch pins use it.
 */
export async function freshAim(tag) {
  return group(await import(`../../aim.mjs?copy=${tag}`));
}

export async function seams() {
  const [hooks, settings, areas, resolve, tray, attacks, effects, escape, refund, aim] = await Promise.all([
    import("../../hooks.mjs"), import("../../settings.mjs"), import("../../areas.mjs"), import("../../resolve.mjs"),
    import("../../tray.mjs"), import("../../attacks.mjs"), import("../../effects.mjs"), import("../../escape.mjs"),
    import("../../refund.mjs"), import("../../aim.mjs"),
  ]);
  return {
    hooks: group(hooks), settings: group(settings), areas: group(areas), resolve: group(resolve), tray: group(tray),
    attacks: group(attacks), effects: group(effects), escape: group(escape), refund: group(refund), aim: group(aim),
  };
}
