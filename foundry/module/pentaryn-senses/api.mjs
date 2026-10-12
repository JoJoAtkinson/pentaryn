/**
 * Pentaryn Senses — the API: the manifest rows bound to what the features exposed.
 *
 * GLUE. Imports core, settings, the manifest and lib — never a feature file. The features reach
 * this file through `ctx.exposed` (what each passed to `ctx.expose()` in its install()):
 *   carried  syncLight, carriedLight, syncAll
 *   migrate  resetSight
 *   light    light  = { cast, end, pick, toggle, hood, profileFor, sweep, setup, onMe, prompt, reconcile, recent }
 *   chain    chain  = { link, break, links, repaint }
 * The functions are published as they are (no wrappers), so their names are today's.
 */

import { HOOKS, NS, PHB_LIGHT_ACTOR, SPELL_LIGHT, inspectShape, lightStatus } from "./senses-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { errorCode } from "./lib/errors.mjs";
import { resolveRef } from "./lib/resolve.mjs";

/** A token ref (id, uuid, name, document, placeable) → {token, actor}; failing that, an actor ref. */
function subjectOf(ref, { sceneId, base } = {}) {
  let token = null;
  try {
    token = resolveRef(ref, "token", { required: false, sceneId });
  } catch (err) {
    if (errorCode(err) !== "BAD_ARGS") throw err;   // an Actor document is not a token: try it as an actor
  }
  if (token) return { token, actor: base ? game.actors?.get(token.actorId) ?? null : token.actor ?? null };
  return { token: null, actor: resolveRef(ref, "actor", { sceneId, base }) };
}

/**
 * Read-only, plain JSON, depth ≤ 4 (finding -25): the token's light and who owns it, the carried
 * light, the chain, the Light cantrips. `opts.as` (a user ref): a player without OBSERVER on the
 * actor gets `actor: null` and no `lightSpells` (the inventory is the owner's business).
 */
export function inspect(ref, opts = {}) {
  opts ??= {};
  const { token, actor } = subjectOf(ref, opts);
  const user = opts.as ? resolveRef(opts.as, "user") : game.user;
  const sees = !!actor && (user?.isGM === true || actor.testUserPermission?.(user, "OBSERVER") === true);
  return toPlain(inspectShape({
    token,
    actor: sees ? actor : null,
    items: sees ? actor.items ?? [] : [],
    sceneTokens: token?.parent?.tokens ?? [],
    scenes: game.scenes ?? [],
  }));
}

/** `{ cast, litBy }` of one Light cantrip item (already resolved from its ref by the kit). */
function status(item) {
  return toPlain(lightStatus(item, game.scenes ?? []));
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const ex = ctx.exposed;
  const light = ex.light, chain = ex.chain;
  return buildApi(MANIFEST, {
    syncLight: ex.syncLight,
    carriedLight: ex.carriedLight,
    resetSight: ex.resetSight,
    ...Object.fromEntries(Object.entries(light).map(([k, fn]) => [`light.${k}`, fn])),
    setupLight: light.setup,
    syncAll: ex.syncAll,
    ...Object.fromEntries(Object.entries(chain).map(([k, fn]) => [`chain.${k}`, fn])),
    inspect,
    "light.status": status,
    "light.SPELL_LIGHT": SPELL_LIGHT,
    "light.PHB_LIGHT_ACTOR": PHB_LIGHT_ACTOR,
  }, {
    members: {
      settings: () => settingsSnapshot(),
      trace: () => ctx.log.traces(),
      uninstall: () => ctx.uninstall(),
    },
    extras: () => ({
      settings: SETTINGS,
      events: HOOKS,
      hooks: ctx.reg.ids(),
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
