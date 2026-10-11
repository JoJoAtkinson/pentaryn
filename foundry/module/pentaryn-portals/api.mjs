/**
 * Pentaryn Portal Cards — the API: the manifest's own rows, inspect(), the kit members, describe().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. The features' rows and
 * implementations arrive as contributions from their install() (ctx.contributions).
 */

import { HOOKS, NS } from "./portals-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { behaviorsLeadingTo, cardFor, destinationsOf, linkRegions, lookAt, snapshot, teleportParty, unlinkRegion } from "./scene-adapter.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { fail, ok, toFail } from "./lib/errors.mjs";
import { publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

/** One entry per destination of each enabled teleport behavior. */
function destinationList(region) {
  return destinationsOf(region).map(({ region: d, behavior: b }) => ({
    uuid: d.uuid,
    scene: refOf(d.parent),
    name: d.name,
    card: cardFor(d),
    revealed: !!b.system.revealed,
    choice: !!b.system.choice,
    behavior: b.id,
  }));
}

function destinations(region) {
  return toPlain(destinationList(region), { maxDepth: 4 });
}

/**
 * @param {*} ref  a region ref (resolve: false in the manifest, so the root game.pentaryn.inspect,
 *                 which hands every namespace an actor, gets null here instead of an error)
 * @param {{ sceneId?: string, as?: * }} opts
 */
function inspect(ref, { sceneId, as } = {}) {
  const kind = ref?.documentName ?? ref?.document?.documentName;
  if (kind === "Actor" || kind === "Token") return null;
  const region = resolveRef(ref, "region", { sceneId });
  const viewer = as === undefined || as === null ? game.user : resolveRef(as, "user");
  const gmView = viewer?.isGM === true;
  const list = destinationList(region);
  const revealed = list.every(d => d.revealed);
  const shown = gmView || (!region.hidden && revealed);
  return toPlain({
    region: gmView ? refOf(region) : { ...refOf(region), name: null },   // the passage name is GM-only
    hidden: !!region.hidden,
    card: cardFor(region),
    revealed,
    destinations: shown ? list : null,
  });
}

/** The other end of a link: any region ref (a uuid is the reliable form across scenes). */
function otherEnd(to) {
  return resolveRef(to, "region");
}

async function link(from, ctx, { to, twoWay = false, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM links regions");
  let dest;
  try { dest = otherEnd(to); } catch (err) { return toFail(err); }
  if (dest === from) return fail("BAD_ARGS", "a region cannot lead to itself");
  const out = { from: refOf(from), to: refOf(dest), twoWay: !!twoWay };
  if (dryRun) return ok({ dryRun: true, ...out });
  try {
    await linkRegions(from, dest);
    if (twoWay) await linkRegions(dest, from);
  } catch (err) {
    ctx.log.error("link failed", err);
    return toFail(err);
  }
  ctx.log.info("link", { uuid: from.uuid, ids: [from.id, dest.id], by: game.user.id });
  return ok(out);
}

async function unlink(from, ctx, { to, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM unlinks regions");
  let dest;
  try { dest = otherEnd(to); } catch (err) { return toFail(err); }
  const out = { from: refOf(from), to: refOf(dest) };
  if (dryRun) return ok({ dryRun: true, ...out, removed: behaviorsLeadingTo(from, dest).length });
  let removed;
  try {
    removed = await unlinkRegion(from, dest);
  } catch (err) {
    ctx.log.error("unlink failed", err);
    return toFail(err);
  }
  ctx.log.info("unlink", { uuid: from.uuid, ids: [from.id, dest.id], by: game.user.id });
  return ok({ ...out, removed });
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    snapshot, cardFor, teleportParty, lookAt,
    inspect: (ref, opts = {}) => inspect(ref, opts ?? {}),
    destinations: region => destinations(region),
    link: (region, opts = {}) => link(region, ctx, opts ?? {}),
    unlink: (region, opts = {}) => unlink(region, ctx, opts ?? {}),
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
