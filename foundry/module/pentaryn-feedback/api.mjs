/**
 * Pentaryn Feedback — the API: implementations for the manifest rows, inspect(), selftest().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Feature state reaches
 * this file through `ctx.exposed` (what a feature passed to `ctx.expose()` in its install()).
 */

import { FLAG_SCOPE, HOOKS, MODULE, NS, noteText } from "./feedback-core.mjs";
import { hpOf } from "./feedback-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { fail, ok, toFail } from "./lib/errors.mjs";
import { flagPath, readFlag } from "./lib/flags.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/**
 * @param {object} actor  already resolved by buildApi (the row's first param is `ref`; buildApi
 *                        applied this call's `opts.sceneId` / `opts.base` while resolving it)
 * @param {{ as?: * }} opts  `as`: a user ref — answer with what that user may see. The GM note and
 *                        session state are GM-only; actor stats need OBSERVER on the actor.
 */
function inspect(actor, ctx, { as } = {}) {
  const viewer = as === undefined || as === null ? null : resolveRef(as, "user");
  const gmView = !viewer || viewer.isGM === true;
  const observes = gmView || actor.testUserPermission?.(viewer, "OBSERVER") === true;
  return toPlain({
    actor: refOf(actor),
    note: gmView ? readFlag(actor, FLAG_SCOPE, "note") ?? null : null,
    lastSeen: gmView ? ctx.exposed.lastSeen?.(actor.id) ?? null : null,
    hp: observes ? hpOf(actor) : null,
  });
}

async function note(actor, ctx, { text = "", dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM writes notes");
  const value = noteText(text);
  const path = flagPath(FLAG_SCOPE, "note");
  if (dryRun) return ok({ dryRun: true, actor: refOf(actor), note: value });
  try {
    await actor.update({ [path]: value === null ? _del : value });
  } catch (err) {
    ctx.log.error("note write failed", err);
    return toFail(err);
  }
  ctx.log.info("note", { uuid: actor.uuid, ids: [actor.id], by: game.user.id });
  return ok({ actor: refOf(actor), note: value });
}

function selftest(ctx) {
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "settings readable", ok: typeof ctx.setting("enabled") === "boolean" },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    inspect: (actor, opts = {}) => inspect(actor, ctx, opts),
    selftest: () => selftest(ctx),
    note: (actor, opts = {}) => note(actor, ctx, opts),
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
      patches: [],
      published: publishedOf(NS),
    }),
  });
}
