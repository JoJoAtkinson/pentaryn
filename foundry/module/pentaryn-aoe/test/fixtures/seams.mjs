/**
 * The one place the tests reach module code other than the entry (../../aoe.mjs) and the pure core
 * (../../core.mjs). Grouped by the files of the 0.3.1 checkpoint. When the blueprint refactor moves
 * a function (S4 adapters, S5 kit hooks, S6 argon.mjs), this shim re-exports the same name from its
 * new home, and no test changes. Each group is the file's public exports plus its `_internals` seam.
 *
 *   S4: areas  = areas.mjs + scene-adapter.mjs (finders, removeArea) + argon.mjs + core isHandle/isTemplateRegion
 *       resolve = resolve.mjs + messages-adapter.mjs (activityOf, usageIdOf) + scene-adapter isPile + core multiplierFor
 *       effects = effects.mjs + messages-adapter.mjs (cardEffects, spellOf)
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
  const [hooks, settings, areas, resolve, tray, attacks, effects, escape, refund, aim, scene, messages, argon, core] = await Promise.all([
    import("../../hooks.mjs"), import("../../settings.mjs"), import("../../areas.mjs"), import("../../resolve.mjs"),
    import("../../tray.mjs"), import("../../attacks.mjs"), import("../../effects.mjs"), import("../../escape.mjs"),
    import("../../refund.mjs"), import("../../aim.mjs"), import("../../scene-adapter.mjs"), import("../../messages-adapter.mjs"),
    import("../../argon.mjs"), import("../../core.mjs"),
  ]);
  const { isHandle, isTemplateRegion, multiplierFor } = core;
  const { activityOf, usageIdOf, cardEffects, spellOf } = messages;
  return {
    hooks: group(hooks), settings: group(settings),
    areas: { ...group(scene), ...group(argon), isHandle, isTemplateRegion, ...group(areas) },
    resolve: { activityOf, usageIdOf, isPile: scene.isPile, multiplierFor, ...group(resolve) },
    tray: group(tray), attacks: group(attacks),
    effects: { cardEffects, spellOf, ...group(effects) },
    escape: group(escape), refund: group(refund), aim: group(aim),
  };
}
