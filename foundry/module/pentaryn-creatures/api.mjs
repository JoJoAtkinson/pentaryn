/**
 * Pentaryn Creatures — the API: implementations for the manifest rows.
 *
 * GLUE. Imports core, the adapter, settings and lib — never a feature file. The features' state
 * reaches this file through `ctx.exposed` (what each passed to `ctx.expose()` in install()).
 */

import * as core from "./creatures-core.mjs";
import { HOOKS, LIGHT_FLAG, MODULE, NS, VERSION, countLit, isPlayerCreature, readOurLight, shouldShowStrip, switchedOff } from "./creatures-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, setting, settingsSnapshot } from "./settings.mjs";
import { summarize } from "./tokens-adapter.mjs";
import { buildApi } from "./lib/api.mjs";
import { isActiveGM } from "./lib/election.mjs";
import { patches } from "./lib/patch.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef, toIdSet } from "./lib/resolve.mjs";

/** How many tokens, on every scene, carry a light we set (`flags.pentaryn-creatures.light` = {bright, dim}). */
function litCount() {
  const flags = [];
  for (const scene of game.scenes) for (const t of scene.tokens) flags.push(t.flags?.[MODULE]?.[LIGHT_FLAG]);
  return countLit(flags);
}

/** One read of this client's state (transform-creatures-31): wrap, settings, writer, lit tokens. */
function status(ctx) {
  return {
    patchedWith: ctx.exposed.patchedWith(),
    ownerSees: setting("ownerSees"),
    lightRadius: setting("lightRadius"),
    showStrip: setting("showStrip"),
    floatOverHud: setting("floatOverHud"),
    writer: isActiveGM(),
    lit: litCount(),
    version: VERSION,
  };
}

/** Would `user`'s strip show this token? Never for a GM, and only once the strip shows (2+ entries). */
function inStrip(ctx, doc, user) {
  if (user.isGM || !doc.parent) return false;
  const entries = ctx.exposed.list(user, doc.parent);
  return shouldShowStrip(entries) && entries.some(e => e.id === doc.id);
}

/** inspect(ref, { as }): one token, as plain JSON (depth ≤ 4). The kit resolved `ref` to a TokenDocument. */
function inspect(ctx, doc, opts = {}) {
  const as = opts?.as == null ? game.user : resolveRef(opts.as, "user");
  const num = v => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    token: refOf(doc),
    actorType: doc.actor?.type ?? null,
    qualifies: isPlayerCreature(summarize(doc)),
    light: { bright: num(doc.light?.bright), dim: num(doc.light?.dim) },
    ourLight: readOurLight(doc),
    switchedOff: switchedOff(doc),
    ownerSees: ctx.exposed.ownerSees(doc.object ?? doc),
    inStrip: inStrip(ctx, doc, as),
  };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  const x = ctx.exposed;
  return buildApi(MANIFEST, {
    // a string user/scene (id, uuid or exact name — what the bridge sends) resolves first; documents pass through;
    // null counts as omitted (this client's user, the viewed scene)
    list: (user, scene) => x.list(
      typeof user === "string" ? resolveRef(user, "user") : user ?? undefined,
      typeof scene === "string" ? resolveRef(scene, "scene") : scene ?? undefined,
    ),
    render: () => x.render(),
    // the scene (a Scene, or its id, uuid or exact name) resolves first, on every client: a missing one rejects
    // NOT_FOUND / BAD_ARGS (creatures-rob-4). ids at the boundary: an array, a Set (copied), one id or token
    // documents → a Set; null/undefined = all
    syncScene: async (scene, ids) => x.syncScene(resolveRef(scene, "scene"), ids == null ? null : toIdSet(ids)),
    syncAll: () => x.syncAll(),
    // a Token placeable answers through its document (token-level flags live there); null/undefined → false
    // (creatures-rob-5)
    isCreature: (tokenDoc) => {
      const doc = tokenDoc?.document ?? tokenDoc;
      return doc ? isPlayerCreature(summarize(doc)) : false;
    },
    // a TokenDocument answers for its placeable on the viewed scene (a document off-canvas: false)
    ownerSees: (token) => x.ownerSees(token?.object ?? token),
    patchedWith: () => x.patchedWith(),
    status: () => status(ctx),
    inspect: (doc, opts) => inspect(ctx, doc, opts),
    core,
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
      patches: patches().filter(p => p.moduleId === MODULE),
      published: publishedOf(NS),
    }),
  });
}
