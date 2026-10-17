/**
 * Pentaryn Portal Cards — the API: the manifest's own rows, inspect(), the kit members, describe().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. The features' rows and
 * implementations arrive as contributions from their install() (ctx.contributions).
 */

import { HOOKS, NS, landingCandidate } from "./portals-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { behaviorsLeadingTo, cardFor, destinationsOf, linkPair, lookAt, moveCompany, passageRevealed, snapshot, teleportParty, unlinkRegion } from "./scene-adapter.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { codedError, fail, ok, toFail } from "./lib/errors.mjs";
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
  const revealed = passageRevealed(region);
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
  if (!landingCandidate(dest)) return fail("BAD_ARGS", `not a landing spot: ${dest.name} has non-teleport behaviors`);   // EXT-9: the card's rule
  const out = { from: refOf(from), to: refOf(dest), twoWay: !!twoWay };
  if (dryRun) return ok({ dryRun: true, ...out });
  try {
    await linkPair(from, dest, twoWay);
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

/**
 * teleportToken's ref (review C6): the kit's resolver, except that a bare 16-character id held by
 * more than one scene (a duplicated scene keeps its token ids) is AMBIGUOUS unless opts.sceneId
 * names the scene. resolveRef alone would take the first scene's token and move the wrong one.
 */
function tokenRef(ref, { sceneId } = {}) {
  if (typeof ref === "string" && /^[A-Za-z0-9]{16}$/.test(ref) && (sceneId === undefined || sceneId === null)) {
    const holders = (game.scenes?.contents ?? [...(game.scenes ?? [])]).filter(s => s?.tokens?.get?.(ref));
    if (holders.length > 1) {
      throw codedError("AMBIGUOUS", `token ${ref} is on ${holders.length} scenes (${holders.map(s => s.name).join(", ")}); pass opts.sceneId`);
    }
  }
  return resolveRef(ref, "token", { sceneId });
}

/**
 * opts.pull (0.7.0): an array of User documents or user ids → the User documents; null when it is
 * not one (BAD_ARGS). Validated before anything moves.
 */
function pullUsersOf(pull) {
  if (pull === undefined || pull === null) return [];
  if (!Array.isArray(pull)) return null;
  const users = pull.map(u => (typeof u === "string" ? game.users?.get?.(u) : u?.documentName === "User" ? u : null));
  return users.every(Boolean) ? users : null;
}

/**
 * teleportToken (0.6.0): one token, and a PC's company, to a point on its own scene or another.
 * Runs on the calling GM client (no query: a User#query runs in every socket of the recipient).
 * The moving is scene-adapter moveCompany, which reuses the follower code; party.mjs (portal-hop
 * follow) is not involved and not changed. 0.7.0: on another scene the move ends with one pull —
 * core's Teleport Token rule plus `pull` (pins rebuild 2026-10-17 §2) — reported as `pulled`.
 */
async function teleportToken(token, ctx, { x, y, scene, level: wanted, pull, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM teleports tokens");
  const extra = pullUsersOf(pull);
  if (!extra) return fail("BAD_ARGS", "pull must be an array of users or user ids");
  const from = token.parent;
  let dest;
  // the kit's one resolver (review R1): a Scene, id, uuid or exact name; another kind → BAD_ARGS
  try { dest = scene === undefined || scene === null ? from : resolveRef(scene, "scene"); } catch (err) { return toFail(err); }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("BAD_ARGS", "x and y must be finite numbers");
  if (wanted !== undefined && wanted !== null && !dest.levels?.has?.(wanted)) return fail("BAD_ARGS", `level ${wanted} is not on ${dest.name}`);
  // Resolved here, never left to core: a bridge call to another scene must not carry the source level
  // id across, and a token stranded on a level its own scene no longer has goes to the initial one
  // (review A2-4: core refuses any move that keeps a missing level, "level must exist").
  const own = token._source?.level ?? token.level ?? null;
  const level = wanted ?? (dest === from && dest.levels?.has?.(own) ? own : dest.initialLevel?.id ?? dest.firstLevel?.id) ?? null;
  const to = { scene: dest.id, x, y, level };
  let moved;
  try {
    moved = await moveCompany(token, dest, { x, y, level }, { dryRun, pull: extra });
  } catch (err) {
    ctx.log.error("teleportToken failed", err);
    return toFail(err);
  }
  if (moved.ok === false) return moved;
  const out = { token: refOf(dest.tokens.get(token.id) ?? token), from: from.id, to, followers: moved.followers, moved: moved.moved };
  if (dryRun) return ok({ dryRun: true, ...out });
  out.pulled = moved.pulled ?? [];
  ctx.log.info("teleportToken", { uuid: token.uuid, ids: [token.id, ...moved.followers.map(f => f.id)], pulled: out.pulled.map(u => u.id), by: game.user.id });
  return ok(out);
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    snapshot, cardFor, teleportParty, lookAt,
    inspect: (ref, opts = {}) => inspect(ref, opts ?? {}),
    destinations: region => destinations(region),
    link: (region, opts = {}) => link(region, ctx, opts ?? {}),
    unlink: (region, opts = {}) => unlink(region, ctx, opts ?? {}),
    teleportToken: (ref, opts = {}) => {
      let token;
      try { token = tokenRef(ref, opts ?? {}); } catch (err) { return toFail(err); }
      return teleportToken(token, ctx, opts ?? {});
    },
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
