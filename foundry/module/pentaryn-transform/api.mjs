/**
 * Pentaryn Transform — the API: implementations for the manifest rows, inspect(), selftest(),
 * buildApiFor(ctx).
 *
 * GLUE. May import core, adapters, settings, the manifest and lib — never a feature file. The Starry
 * rows arrive as starry.mjs's contribution (ctx.contributions).
 */

import { HOOKS, MODULE, NS, shapeStatus } from "./transform-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";
import {
  shift, revert, forms, wildShapeActivity, original, isRevertItem, isWildShapeForm, activeFormOf
} from "./wildshape-adapter.mjs";
import { formImageFor } from "./form-image-adapter.mjs";
import { sweepSpentForms } from "./sweep-adapter.mjs";
import { constellationOf, starrySecondsLeft } from "./starry-adapter.mjs";

/**
 * @param {object} asked  resolved by buildApi (the row's first param is `ref`)
 * @param {{ as?: * }} opts  a user ref: without OBSERVER on the actor that user sees `{ actor }` only
 */
function inspect(asked, opts) {
  const as = opts?.as;
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const sees = !viewer || viewer.isGM === true || asked.testUserPermission?.(viewer, "OBSERVER") === true;
  if (!sees) return toPlain({ actor: refOf(asked) });
  // A linked druid in a form: its name still resolves to the original, so read the body that is out.
  const actor = activeFormOf(asked) ?? asked;
  const host = original(actor);
  const activity = wildShapeActivity(actor);
  const wsItem = activity?.item ?? null;
  const constellation = constellationOf(actor);
  return toPlain(shapeStatus({
    actor: refOf(actor),
    original: host && host !== actor ? refOf(host) : null,
    shifted: !!actor.isPolymorphed,
    wildShapeForm: isWildShapeForm(actor),
    formName: actor.isPolymorphed ? actor.name : null,
    flag: actor.getFlag?.(MODULE, "wildshape") ?? null,
    worldTime: game.time.worldTime,
    wildShape: wsItem ? { itemId: wsItem.id, uses: wsItem.system?.uses } : null,
    forms: forms(actor),
    starry: constellation ? { constellation, secondsLeft: starrySecondsLeft(actor) } : null
  }));
}

function selftest(ctx) {
  const op = foundry.documents?.TokenDocument?._preUpdateOperation;
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
    { label: "TokenDocument._preUpdateOperation unwrap patch applied", ok: op?.pentarynUnwrapped === true },
    { label: "Starry Form rows contributed", ok: typeof ctx.api?.starry?.assume === "function" },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    shift, revert, forms, wildShapeActivity, original, isRevertItem, sweepSpentForms,
    formImage: opts => formImageFor(opts ?? {}),
    inspect: (actor, opts = {}) => inspect(actor, opts),
    selftest: () => selftest(ctx),
  }, {
    contributions: ctx.contributions,
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
}
