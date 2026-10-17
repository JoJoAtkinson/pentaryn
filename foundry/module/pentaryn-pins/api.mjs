/**
 * Pentaryn Pins — the API: implementations for the manifest rows, inspect(), selftest().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Since 0.2.0 no feature
 * exposes state here: the GM moves a pinned player with core's own pull (`pin`, `teleport` through
 * portals' `pull`), so nothing on the player's client is read by the API.
 */

import { HOOKS, MODULE, NS, pickToken } from "./pins-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { PIN_PATH, auditWorld, listOf, observes, pinOfUser, pinTargets, pinnedUsers, pullToPin, resolvePin, rootOfActor,
  tokensByRoots, tokensOfRoot } from "./world-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { codedError, errorCode, fail, ok, toFail } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { apiOf, publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

const PORTALS = "pentaryn-portals";
const PATCH_IDS = ["pins-scene-activate"];

/** A uuid (the kit's resolve.mjs shape): a world `Type.<16-char id>…` or any Compendium path. */
const UUID = /^(?:Compendium\.|[A-Z][A-Za-z]+\.[A-Za-z0-9]{16}(?:\.|$))/;

const userRef = u => (u ? { id: u.id, name: u.name, active: !!u.active } : null);
const actorRef = a => (a ? { id: a.id, name: a.name } : null);

async function pin(user, ctx, { actor: actorRefIn, replace = false, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM pins characters");
  if (user.isGM) return fail("BAD_ARGS", `${user.name} is a GM: only a player can be pinned`);
  if (actorRefIn === undefined || actorRefIn === null || actorRefIn === "") return fail("BAD_ARGS", "opts.actor is required");
  let actor;
  try {
    actor = resolveRef(actorRefIn, "actor", { base: true });
  } catch (err) {
    return toFail(err);
  }
  const root = rootOfActor(actor);
  if (!root) return fail("BAD_ARGS", `actor ${actor?.name ?? actorRefIn} has no id`);
  const rootActor = game.actors.get(root) ?? actor;
  const others = listOf(game.users).filter(u => u.id !== user.id && pinOfUser(u) === root);
  if (others.length && !replace) {
    return fail("CONFLICT", `${rootActor.name} is pinned to ${others.map(u => u.name).join(", ")} (pass replace: true to move it)`);
  }
  const previous = pinOfUser(user);
  const out = { user: userRef(user), actor: actorRef(rootActor), previous, cleared: others.map(u => u.id) };
  // the player gets levels and vision only from tokens they observe: say so, never refuse (a GM may mean it)
  if (observes(user, rootActor) === false) out.warning = "NOT_OWNER";
  if (dryRun) return ok({ dryRun: true, ...out });
  // the other pins first, so no moment has two users on one actor. A write that throws, or that a
  // preUpdateUser hook vetoes (core skips it and resolves undefined, client-backend.mjs:239-242), must
  // not leave the actor pinned to nobody: the flags are read back and the cleared pins put back (D6).
  let failure = null;
  try {
    // allSettled: every clear has landed (or failed) before the flags are read back below
    const cleared = await Promise.allSettled(others.map(u => u.update({ [PIN_PATH]: _del })));
    const rejected = cleared.find(r => r.status === "rejected");
    if (rejected) throw rejected.reason;
    await user.update({ [PIN_PATH]: root });
  } catch (err) {
    failure = toFail(err);
  }
  const stuck = others.filter(u => pinOfUser(u) === root);
  if (!failure && (pinOfUser(user) !== root || stuck.length)) {
    failure = fail("REFUSED", `the pin write was refused (a preUpdateUser hook vetoed it): ${pinOfUser(user) !== root ? user.name : stuck.map(u => u.name).join(", ")}`);
  }
  if (failure) {
    const back = others.filter(o => pinOfUser(o) !== root);
    const settled = await Promise.allSettled(back.map(u => u.update({ [PIN_PATH]: root })));
    for (const r of settled) if (r.status === "rejected") ctx.log.error("pin rollback failed", r.reason);
    const restored = back.filter(u => pinOfUser(u) === root).map(u => u.id);
    // a vetoed clear with a set that went through: two users on one actor, so the set is undone
    if (stuck.length && pinOfUser(user) === root && previous !== root) {
      try {
        await user.update({ [PIN_PATH]: previous ?? _del });
      } catch (err) {
        ctx.log.error("pin rollback failed", err);
      }
    }
    ctx.log.error("pin write failed", { code: failure.code, reason: failure.reason, restored });
    return { ...failure, restored };
  }
  ctx.log.info("pin", { uuid: user.uuid, ids: [user.id, root, ...others.map(u => u.id)], by: game.user.id });
  // the switch on and the player online: pull them to their token (replaces 0.1.0's player-side follow).
  // Re-pinning the actor they already have changes nothing, so it pulls nobody (code review CR9).
  if (ctx.setting("pinning") && user.active && previous !== root) pullToPin(user, ctx.log);
  return ok({ ...out, audit: audit(ctx) });
}

async function unpin(user, ctx, { dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM unpins characters");
  const previous = pinOfUser(user);
  if (!previous) return ok({ user: userRef(user), previous: null, ...(dryRun ? { dryRun: true } : {}) });
  if (dryRun) return ok({ dryRun: true, user: userRef(user), previous });
  try {
    await user.update({ [PIN_PATH]: _del });
  } catch (err) {
    ctx.log.error("unpin write failed", err);
    return toFail(err);
  }
  ctx.log.info("unpin", { uuid: user.uuid, ids: [user.id, previous], by: game.user.id });
  return ok({ user: userRef(user), previous });
}

function pins() {
  const pinned = pinnedUsers();
  const byRoot = tokensByRoots(pinned.map(p => p.root));
  return toPlain(pinned.map(({ user, root }) => ({
    user: userRef(user),
    actor: actorRef(game.actors.get(root)),
    tokens: (byRoot[root] ?? []).map(t => ({ id: t.id, scene: t.scene, level: t.level, form: t.form })),
  })));
}

/** The token a user's view follows (the viewed-scene tie-break applies only to this client's own user). */
function followedToken(user) {
  const self = user.id === game.user?.id;
  return resolvePin(user, self ? { viewedSceneId: globalThis.canvas?.scene?.id ?? null } : {});
}

/** The published shape of a followed token (pinnedToken, pinnedTokens). */
function targetOut(root, token) {
  return {
    token: token.uuid,
    actor: game.actors.get(root)?.uuid ?? `Actor.${root}`,
    scene: String(token.scene),
    level: token.level ? String(token.level) : null,
    x: token.x, y: token.y,
  };
}

function pinnedToken(user, ctx) {
  if (!ctx.setting("pinning") || user.isGM) return null;   // a GM is never followed (follow.mjs target)
  const { root, token } = followedToken(user);
  if (!root || !token) return null;
  return targetOut(root, token);
}

/** Every pinned player's pinnedToken in one token walk (code review CR3): `{ [userId]: … }`; {} while off. */
function pinnedTokens(ctx) {
  if (!ctx.setting("pinning")) return {};
  const targets = pinTargets({ selfViewedSceneId: globalThis.canvas?.scene?.id ?? null });
  return Object.fromEntries(Object.entries(targets).map(([id, { root, token }]) => [id, targetOut(root, token)]));
}

/** No depth cap: the token records sit at depth 4 and the cap's "[max depth]" ate them (M1/E1). */
function audit(ctx) {
  return toPlain({ enabled: !!ctx.setting("pinning"), ...auditWorld() }, { maxDepth: Infinity });
}

async function teleport(user, ctx, { x, y, scene, level, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM teleports characters");
  const root = pinOfUser(user);
  if (!root) return fail("BAD_ARGS", `${user.name} has no pinned character`);
  const cands = tokensOfRoot(root);
  if (cands.length === 0) return fail("NOT_FOUND", `${game.actors.get(root)?.name ?? root} has no token on any scene`);
  if (cands.length > 1) return fail("AMBIGUOUS", `${game.actors.get(root)?.name ?? root} has ${cands.length} tokens (${cands.map(c => c.sceneName).join(", ")})`);
  const portals = apiOf(PORTALS);
  if (typeof portals?.teleportToken !== "function") return fail("UNSUPPORTED", "pentaryn-portals (teleportToken) is not active");
  const token = cands[0];
  const enabled = !!ctx.setting("pinning");
  const online = !!user.active;
  let res;
  try {
    // the switch on and the player online: portals pulls them on a cross-scene move, whatever core's
    // Teleport Token rule says (pentaryn-portals ≥ 0.7.0 `pull`; an older portals ignores it)
    res = await portals.teleportToken(token.doc, { x, y, scene, level, pull: enabled && online ? [user.id] : [], dryRun });
  } catch (err) {
    ctx.log.error("teleport failed", err);
    return toFail(err);
  }
  if (!res?.ok) return res ?? fail("INTERNAL", "teleportToken returned nothing");
  const crossScene = !!res.to?.scene && res.to.scene !== token.scene;
  // cross-scene: the view follows only if portals pulled the player (`pulled`). Same scene: portals
  // never pulls there, so pins always pulls them to the token's scene and level — never skipped on
  // the GM's copy of `viewedScene`, which lags a draw in progress (review F1, code review CR2); core's
  // Scene#view of the scene and level already drawn draws nothing. A dryRun predicts it: on and online.
  let viewFollows;
  if (dryRun) viewFollows = enabled && online;
  else if (crossScene) viewFollows = Array.isArray(res.pulled) && res.pulled.some(p => (p?.id ?? p) === user.id);
  else if (!enabled || !online) viewFollows = false;
  else viewFollows = pullToPin(user, ctx.log);
  const out = { ...res, user: userRef(user), viewFollows, online };
  // an offline player with the switch on lands on the token's scene at login (resume): no warning
  if (crossScene && !viewFollows && (online || !enabled)) out.warning = "VIEW_UNCHANGED";
  if (!dryRun) ctx.log.info("teleport", { uuid: user.uuid, ids: [user.id, root, token.id], by: game.user.id });
  return out;
}

/** A user or an actor ref: a Document by its type; an id or a name as a user first, then an actor. */
function userOrActor(ref) {
  if (ref && typeof ref === "object") {
    const doc = ref.documentName ? ref : ref.document;
    if (doc?.documentName === "User") return { user: doc };
    return { actor: resolveRef(ref, "actor") };
  }
  // only a uuid goes straight to its kind: a name may hold a period ("Mr. Talo") and is a user first (D4)
  if (typeof ref === "string" && UUID.test(ref)) return /^User\./.test(ref) ? { user: resolveRef(ref, "user") } : { actor: resolveRef(ref, "actor") };
  try {
    return { user: resolveRef(ref, "user") };
  } catch (err) {
    if (errorCode(err) !== "NOT_FOUND") throw err;
  }
  return { actor: resolveRef(ref, "actor") };
}

/**
 * Options are ignored: the root `game.pentaryn.inspect(ref, opts)` hands every namespace the same
 * normalised opts (`kind`, `sceneId`, `base`: KIT-R2), and the session tie-breaks a client-side `as`
 * would want exist only on the pinned client itself (M2/E3/D5).
 */
function inspect(ref, ctx) {
  const hit = userOrActor(ref);
  let user = hit.user ?? null;
  let root;
  if (user) root = pinOfUser(user);
  else {
    root = rootOfActor(hit.actor);
    user = pinnedUsers().find(p => p.root === root)?.user ?? null;
  }
  if (!user && !root) throw codedError("NOT_FOUND", String(ref));
  const cands = root ? tokensOfRoot(root) : [];
  const token = user ? followedToken(user).token : pickToken(cands);
  return toPlain({
    user: refOf(user),
    actor: refOf(root ? game.actors.get(root) : null),
    root: root ?? null,
    enabled: !!ctx.setting("pinning"),
    token: token ? { uuid: token.uuid, scene: token.scene, level: token.level, form: token.form } : null,
    ok: !!root && cands.length === 1,
  });
}

function selftest(ctx) {
  const mine = patches().filter(p => p.moduleId === MODULE).map(p => p.adjustments);
  const checks = [
    { label: "published as module.api", ok: game.modules.get(MODULE)?.api === ctx.api },
    { label: `game.pentaryn.${NS} is this API`, ok: game.pentaryn?.[NS] === ctx.api },
    { label: "pinning setting readable", ok: typeof ctx.setting("pinning") === "boolean" },
    { label: "Scene#_onActivate patched", ok: PATCH_IDS.every(id => mine.includes(id)), detail: mine.join(", ") },
    { label: "pentaryn-portals teleportToken present", ok: typeof apiOf(PORTALS)?.teleportToken === "function" },
    { label: "hooks registered", ok: ctx.reg.ids().length > 0, detail: ctx.reg.ids().length },
  ];
  return { ok: checks.every(c => c.ok), checks: checks.map(c => ({ detail: null, ...c })) };
}

/** Build the frozen API. Throws (at ready, in node too) when manifest and implementations drift. */
export function buildApiFor(ctx) {
  return buildApi(MANIFEST, {
    pin: (user, opts = {}) => pin(user, ctx, opts ?? {}),
    unpin: (user, opts = {}) => unpin(user, ctx, opts ?? {}),
    pins: () => pins(),
    pinnedToken: user => pinnedToken(user, ctx),
    pinnedTokens: () => pinnedTokens(ctx),
    audit: () => audit(ctx),
    teleport: (user, opts = {}) => teleport(user, ctx, opts ?? {}),
    inspect: ref => inspect(ref, ctx),
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
