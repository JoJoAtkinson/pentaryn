/**
 * The one place the tests reach module code other than the entry (../../aoe.mjs) and the pure core
 * (../../core.mjs). Grouped by the files of the 0.3.1 checkpoint. When the blueprint refactor moves
 * a function (S4 adapters, S5 kit hooks, S6 argon.mjs), this shim re-exports the same name from its
 * new home, and no test changes. Each group is the file's public exports plus its `_internals` seam.
 *
 *   S4: areas  = areas.mjs + scene-adapter.mjs (finders, removeArea) + argon.mjs + core isHandle/isTemplateRegion
 *       resolve = resolve.mjs + messages-adapter.mjs (activityOf, usageIdOf) + scene-adapter isPile + core multiplierFor
 *       effects = effects.mjs + messages-adapter.mjs (cardEffects, spellOf)
 *   8.6 split: resolve also = careful.mjs (carefulFor, onCarefulUsed), Careful Spell's own feature
 *
 *   S5: hooks.mjs is gone. `hooks` = the kit registry the features are installed with: the entry's
 *       when the entry has published (its legacy hookIds API row), else this shim's own registry,
 *       which `aim.installAim()` (now install(reg, ctx)) registers on. `guard` = the kit's
 *       guardSwallowAsync (aoe's old guard, verbatim); `claimMessage` = the kit's, scope pentaryn-aoe.
 *
 * Importing is side-effect free (no feature file registers a hook at module scope); install the
 * Foundry stub first anyway, since some groups read globals as soon as they are called.
 */
import { makeLog } from "../../lib/log.mjs";
import { hookRegistry } from "../../lib/hooks.mjs";
import { claimMessage } from "../../lib/election.mjs";

const MODULE = "pentaryn-aoe";
const log = makeLog(MODULE);
const reg = hookRegistry(MODULE, log);
const ctx = { log, reg, contributions: [], exposed: {}, expose(a) { Object.assign(ctx.exposed, a); } };
const ids = r => r.ids().map(({ name, id }) => ({ name, id }));

const hooks = {
  hookIds: () => (globalThis.game?.pentaryn?.aoe?.hookIds ? globalThis.game.pentaryn.aoe.hookIds() : ids(reg)),
  offAll: () => reg.offAll(),
  guard: (label, fn) => reg.guardSwallowAsync(label, fn),
  claimMessage: (message, key) => claimMessage(message, key, { scope: MODULE }),
};

const group = mod => {
  const { _internals = {}, ...pub } = mod;
  return { ...pub, ..._internals };
};

/** Part G as a group, with the old `installAim()` name installing on the shim's registry. */
const aimGroup = mod => ({ ...group(mod), installAim: () => mod.install(reg, ctx) });

/**
 * A second copy of Part G, as a hot patch would load it (same core/settings/lib instances, fresh
 * module state). -44's hot-patch pins use it.
 */
export async function freshAim(tag) {
  return aimGroup(await import(`../../aim.mjs?copy=${tag}`));
}

export async function seams() {
  const [settings, areas, resolve, tray, attacks, effects, escape, refund, aim, scene, messages, argon, core, careful, tokenAreas] = await Promise.all([
    import("../../settings.mjs"), import("../../areas.mjs"), import("../../resolve.mjs"),
    import("../../tray.mjs"), import("../../attacks.mjs"), import("../../effects.mjs"), import("../../escape.mjs"),
    import("../../refund.mjs"), import("../../aim.mjs"), import("../../scene-adapter.mjs"), import("../../messages-adapter.mjs"),
    import("../../argon.mjs"), import("../../core.mjs"), import("../../careful.mjs"), import("../../token-areas.mjs"),
  ]);
  const { isHandle, isTemplateRegion, multiplierFor } = core;
  const { activityOf, usageIdOf, cardEffects, spellOf } = messages;
  return {
    hooks, settings: group(settings),
    areas: { ...group(scene), ...group(argon), isHandle, isTemplateRegion, ...group(areas), ...group(tokenAreas) },
    resolve: { activityOf, usageIdOf, isPile: scene.isPile, multiplierFor, ...group(careful), ...group(resolve) },
    tray: group(tray), attacks: group(attacks),
    effects: { cardEffects, spellOf, ...group(effects) },
    escape: group(escape), refund: group(refund), aim: aimGroup(aim),
  };
}
