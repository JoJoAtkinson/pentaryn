/**
 * Pentaryn Pins — the API: implementations for the manifest rows, inspect(), selftest().
 *
 * GLUE. May import core, adapters, settings and lib — never a feature file. Since 0.2.0 no feature
 * exposes state here: the GM moves a pinned player with core's own pull (`pin`, `teleport` through
 * portals' `pull`), so nothing on the player's client is read by the API.
 */

import { HOOKS, MODULE, NS, PRE_PULL_HOOK, gatherPlan, gatherResult, gatherRow, pickToken } from "./pins-core.mjs";
import { MANIFEST } from "./api-manifest.mjs";
import { SETTINGS, settingsSnapshot } from "./settings.mjs";
import { PIN_PATH, auditWorld, gatherInputs, gatherTarget, listOf, liveToken, observes, pinOfUser, pinTargets, pinnedUsers, pullToPin, resolvePin,
  rootOfActor, startedCombatTokens, tokensByRoots, tokensOfRoot, userOrActor } from "./world-adapter.mjs";
import { buildApi, toPlain } from "./lib/api.mjs";
import { codedError, fail, ok, toFail } from "./lib/errors.mjs";
import { patches } from "./lib/patch.mjs";
import { apiOf, publishedOf } from "./lib/publish.mjs";
import { refOf, resolveRef } from "./lib/resolve.mjs";

const PORTALS = "pentaryn-portals";
const PATCH_IDS = ["pins-scene-activate"];

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

async function teleport(user, ctx, opts = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM teleports characters");
  const root = pinOfUser(user);
  if (!root) return fail("BAD_ARGS", `${user.name} has no pinned character`);
  const cands = tokensOfRoot(root);
  if (cands.length === 0) return fail("NOT_FOUND", `${game.actors.get(root)?.name ?? root} has no token on any scene`);
  if (cands.length > 1) return fail("AMBIGUOUS", `${game.actors.get(root)?.name ?? root} has ${cands.length} tokens (${cands.map(c => c.sceneName).join(", ")})`);
  return moveTo(user, ctx, root, cands[0], opts);
}

/**
 * The move of a pin already resolved to its one token record (`teleport`; `gather`, from its plan's
 * one walk — code review G7). `gather` (only gather() passes it): portals ≥ 0.8.0's shared-companion
 * gather mode (plan §11), which also marks the carry's prePull (G6); a single move leaves it out.
 */
async function moveTo(user, ctx, root, token, { x, y, scene, level, gather, dryRun = false } = {}) {
  const portals = apiOf(PORTALS);
  if (typeof portals?.teleportToken !== "function") return fail("UNSUPPORTED", "pentaryn-portals (teleportToken) is not active");
  const enabled = !!ctx.setting("pinning"), online = !!user.active;
  let res;
  try {
    // the switch on and the player online: portals pulls them on a cross-scene move, whatever core's
    // Teleport Token rule says (portals ≥ 0.7.0 `pull`)
    res = await portals.teleportToken(token.doc, { x, y, scene, level, pull: enabled && online ? [user.id] : [], dryRun, ...(gather ? { gather } : {}) });
  } catch (err) {
    ctx.log.error("teleport failed", err);
    return toFail(err);
  }
  if (!res?.ok) return res ?? fail("INTERNAL", "teleportToken returned nothing");
  const crossScene = !!res.to?.scene && res.to.scene !== token.scene;
  // cross-scene: the view follows only if portals pulled the player (`pulled`). Same scene: portals
  // never pulls there, so pins pulls them to the token's scene and level, ALWAYS (CR2; code review
  // G1: never skipped on the GM's lagging copy of their view). Onto another floor core's own level
  // switch may run on their client too: a view of what is drawn draws nothing, and follow.mjs replays
  // a pull core dropped while loading only when it still changes the view. A dryRun predicts it: on and online.
  let viewFollows;
  if (dryRun) viewFollows = enabled && online;
  else if (crossScene) viewFollows = Array.isArray(res.pulled) && res.pulled.some(p => (p?.id ?? p) === user.id);
  else if (!enabled || !online) viewFollows = false;
  else viewFollows = pullToPin(user, ctx.log, { token: liveToken(token, root) });
  const out = { ...res, user: userRef(user), viewFollows, online };
  // an offline player with the switch on lands on the token's scene at login (resume): no warning
  if (crossScene && !viewFollows && (online || !enabled)) out.warning = "VIEW_UNCHANGED";
  if (!dryRun) ctx.log.info("teleport", { uuid: user.uuid, ids: [user.id, root, token.id], by: game.user.id });
  return out;
}

let gathering = false;   // one gather at a time on this client (gather plan §1.4), cleared in `finally`

/** The centre of token `id` on `scene` (where a held companion lands beside its owner), or null. */
function centreOn(scene, id) {
  const t = scene?.tokens?.get?.(id);
  if (!t) return null;
  const g = scene.grid?.size ?? 100;
  return { x: t.x + (t.width ?? 1) * g / 2, y: t.y + (t.height ?? 1) * g / 2 };
}

/**
 * Code review G5: the shared companions portals held for a later co-owner (`held`) that no later
 * move took — that owner's move failed — are carried alone, beside the last owner that moved (the
 * row that held them last), and listed in its `followers`; a carry that fails is a `failed` row
 * under that owner. `held`: Map<tokenId, { id, name, from, row }>.
 */
async function carryHeld(held, rows, { dest, level, x, y, dryRun }) {
  const portals = apiOf(PORTALS);
  for (const h of held.values()) {
    const doc = game.scenes.get(h.from)?.tokens?.get?.(h.id);
    if (!doc) continue;   // gone meanwhile, or carried by another move
    const lead = h.row.moved;
    const at = (!dryRun && centreOn(dest, lead.token?.id)) || { x, y };
    let r;
    try {
      r = await portals.teleportToken(doc, { x: at.x, y: at.y, scene: dest.id, level, pull: [], dryRun, gather: { later: [] } });
    } catch (err) {
      r = toFail(err);
    }
    if (r?.ok) lead.followers.push({ id: h.id, name: h.name });
    else rows.push({ failed: { user: lead.user, actor: { id: doc.actorId ?? null, name: h.name }, code: r?.code ?? "INTERNAL", reason: r?.reason ?? "teleportToken returned nothing" } });
  }
}

/** "Gather logged-in players here" (plan §1–§4): gatherPlan's members in order, onto one point and level, from ONE
 *  token walk (G7). Combat is read once before anything moves (§1.3); each member's call carries its own gather mark (G6). */
async function gather(ctx, { x, y, scene, level, dryRun = false } = {}) {
  if (!game.user?.isGM) return fail("NOT_GM", "only a GM gathers players");
  if (!ctx.setting("pinning")) return fail("REFUSED", "pinning is off");
  if (!Number.isFinite(x) || !Number.isFinite(y)) return fail("BAD_ARGS", "x and y must be finite numbers");
  const to = gatherTarget({ scene, level });
  if (!to.ok) return to;
  if (typeof apiOf(PORTALS)?.teleportToken !== "function") return fail("UNSUPPORTED", "pentaryn-portals (teleportToken) is not active");
  if (gathering) return fail("CONFLICT", "a gather is already running");
  gathering = true;
  try {
    const combat = startedCombatTokens();
    const inputs = gatherInputs();   // the gather's one token walk
    const plan = gatherPlan(inputs, { destSceneId: to.dest.id, point: { x, y }, grid: to.dest.grid?.size });
    const rows = [];
    const held = new Map();
    for (const [i, m] of plan.members.entries()) {
      let res;   // `later`: a companion shared with members still to move waits for the last of them (§11)
      const later = plan.members.slice(i + 1).map(n => ({ user: n.user.id, token: n.token.id }));
      try {   // a member that throws fails alone (§3.2)
        const user = game.users.get(m.user.id);
        // the plan's record as it stands now: an earlier member's carry may have taken it (keepId, §3.3)
        const token = user ? liveToken((inputs.tokensByRoot[m.root] ?? [])[0], m.root) : null;
        if (!user) res = fail("NOT_FOUND", `user ${m.user.id} is gone`);
        else if (!token) res = fail("NOT_FOUND", `${m.actor?.name ?? m.root} has no token now`);
        else res = await moveTo(user, ctx, m.root, token, { x, y, scene: to.dest.id, level: to.level, gather: { later }, dryRun });
      } catch (err) {
        res = toFail(err);
      }
      const row = gatherRow(m, res, combat.get(m.token.scene));
      rows.push(row);
      if (!row.moved) continue;
      for (const f of res.followers ?? []) held.delete(f?.id);
      for (const h of res.held ?? []) held.set(h.id, { id: h.id, name: h.name, from: res.from ?? m.token.scene, row });
    }
    await carryHeld(held, rows, { dest: to.dest, level: to.level, x, y, dryRun });
    const out = gatherResult({ to: { scene: to.dest.id, x, y, level: to.level }, plan, rows, dryRun });
    if (!dryRun) ctx.log.info("gather", { uuid: to.dest.uuid, ids: out.moved.map(r => r.user.id), by: game.user.id });
    return toPlain(out, { maxDepth: Infinity });   // followers/pulled entries sit at depth 4 (M1/E1)
  } catch (err) {
    ctx.log.error("gather failed", err);
    return toFail(err);
  } finally {
    gathering = false;
  }
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
    { label: "prePull listener registered", ok: ctx.reg.ids().some(r => r.name === PRE_PULL_HOOK), detail: PRE_PULL_HOOK },
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
    teleport: (user, opts = {}) => teleport(user, ctx, { ...(opts ?? {}), gather: undefined }),   // `gather` is gather()'s alone
    gather: (opts = {}) => gather(ctx, opts ?? {}),
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
