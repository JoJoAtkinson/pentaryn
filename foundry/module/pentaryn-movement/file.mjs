/**
 * Pentaryn Movement — the feature: the file, a group drag out of combat (0.9.0, plan
 * context/plans/pathfinding-2026-11.md §17; Fable's review 2 §2 "Tier B, the file"). drop.mjs asks it through
 * ctx.exposed at run time (never an import between two features).
 *
 * B0, the floor (§4 step 2): at the drop, one pass (file-core planFile) gives every member its slot (the free spot
 * nearest its formation spot that it can reach) and an A* route round the tokens standing outside the drop and round
 * the slots already given out; drop.mjs sends them all in the drop's own batched update, with no stagger and no
 * timers. A member with no reachable slot stays where it stands and is named in a notice.
 *
 * Which tokens move together: this client holds every group it sent until its members are at rest (read when asked,
 * no timers), and every client learns a group's members from the update option its move carries (GROUP_OPT), so a
 * click on one member stops them all (decision 3 as revised 2026-11-24).
 */

import { planFile } from "./file-core.mjs";
import { flood } from "./group-core.mjs";
import { avoidDist } from "./pathfind-core.mjs";
import { gridSize, memberOf, othersOf, restWalkable, toSquares, toTopLeft } from "./group-adapter.mjs";
import { fieldFor, placesToAvoid } from "./pathfind-adapter.mjs";
import { dnd5eMovementAutomation } from "./settings.mjs";
import { resolveRef } from "./lib/resolve.mjs";
import { errorCode } from "./lib/errors.mjs";

let log = null;
let feature = null;
/** The update option that names the group a move belongs to, so every client knows its members (decision 3). */
const GROUP_OPT = "pentarynMovementGroup";

/** Groups this client sent: id → { ids: Set, scene, at }. */
const groups = new Map();
const groupOf = new Map();                 // token id → group id
/** Every client: token id → { gid, at } from the update options of a group's moves. */
const tagOf = new Map();
/** How long a group names its members (ms): longer than any walk it sends. */
const HOLD_MS = 60000;
let stopped = null;                        // the last stop of a group (stop.mjs), for status()

/** The most members a group drag plans (more: core's own drop). */
const FILE_MAX = 12;

/** A moving token: drawn walking, or between two squares of its move. */
function movingNow(doc) {
  const t = doc?.object;
  let animating = false;
  try { animating = !!t && !t.destroyed && [...(t.animationContexts?.values?.() ?? [])].length > 0; } catch { animating = false; }
  const st = doc?.movement?.state;
  return animating || st === "pending" || st === "paused";
}

/** Hold the members of a group this client just sent. Returns the group's id. */
function holdGroup(ids, scene) {
  const gid = foundry.utils.randomID();
  for (const id of ids) {
    const old = groupOf.get(id);
    if (old && groups.get(old)) groups.get(old).ids.delete(id);
    groupOf.set(id, gid);
  }
  groups.set(gid, { ids: new Set(ids), scene, at: Date.now() });
  prune();
  return gid;
}

/** Drop groups whose members are all at rest, or older than HOLD_MS (no timers: read when asked). */
function prune() {
  const t = Date.now();
  for (const [gid, g] of groups) {
    const alive = t - g.at <= 1500 || [...g.ids].some(id => movingNow(g.scene?.tokens?.get?.(id)));
    if (alive && t - g.at <= HOLD_MS && g.ids.size) continue;
    for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
    groups.delete(gid);
  }
}

/** How many groups this client holds now. */
function heldCount() { prune(); return groups.size; }

/**
 * Stop a group this client sent (click-to-stop): it is no longer held. Returns the ids of its members (the caller
 * stops those moving), or [] when this client holds no group for the token. `only` takes just that token out.
 */
function groupCancel(tokenId, { only = false } = {}) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  if (only) { g.ids.delete(tokenId); groupOf.delete(tokenId); return [tokenId]; }
  const ids = [...g.ids];
  for (const id of ids) if (groupOf.get(id) === gid) groupOf.delete(id);
  groups.delete(gid);
  return ids;
}

/** A click (or the API) stopped a group (stop.mjs): recorded for status().group.stopped. */
function groupNoteStop({ why = "click", members = 0, whole = false } = {}) {
  stopped = { at: new Date().toISOString(), why, members, whole };
}
const stoppedLast = () => (stopped ? { ...stopped } : null);

/**
 * The members of the group a token moves with: `held` when this client sent the group, else the tokens every client
 * saw tagged with the same group lately. `{ held: false, ids: [] }` when it is in no group.
 */
function groupMembers(tokenId) {
  prune();
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (g) return { held: true, ids: [...g.ids] };
  const tag = tagOf.get(tokenId);
  if (!tag || Date.now() - tag.at > HOLD_MS) return { held: false, ids: [] };
  const ids = [];
  for (const [id, t] of tagOf) if (t.gid === tag.gid && Date.now() - t.at <= HOLD_MS) ids.push(id);
  return { held: false, ids };
}

/** updateToken, every client: remember which group a move belongs to (its update option). */
function onGroupTag(doc, options) {
  const gid = options?.[GROUP_OPT];
  if (!doc?.id || typeof gid !== "string") return;
  tagOf.set(doc.id, { gid, at: Date.now() });
  if (tagOf.size > 500) tagOf.delete(tagOf.keys().next().value);
}

/* -------------------------------------------- */
/*  B0: slots and routes in one pass            */
/* -------------------------------------------- */

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One route search's wall-clock cap (ms): a long or impossible route rules that spot out instead of freezing the drop. */
const ROUTE_MS = 120;
/** How far (squares, rings of the flood) a slot may be walked from its formation spot. */
const REACH_RINGS = 9;

/**
 * Plan B0 for the leaders of a group drop (riders walk with their leaders, drop.mjs). `anchor` is the grabbed token
 * (or its leader). Returns { plan, members } (file-core's plan, the member records), or null when there is nothing to
 * plan. Reads only; never throws past the caller's catch (drop.mjs: core's drop).
 */
function planDrop(anchor, contexts, { constrain = {} } = {}) {
  if (!feature || !anchor || contexts.length < 1) return null;
  const s = gridSize(anchor);
  const ordered = [...contexts].sort((a, b) => (a.token === anchor ? -1 : b.token === anchor ? 1 : 0));
  const members = ordered.map(c => memberOf(c, s));
  const standing = othersOf(members, s);
  const origins = new Map(members.map(m => [m.id, feature.exposed.pathfindOrigin?.(m.token.document) ?? { ...m.token.document._source }]));
  const avoidMemo = new Map();
  const hazards = m => {
    if (!avoidMemo.has(m.id)) {
      let hz = null;
      try { hz = placesToAvoid(m.token, origins.get(m.id), { ...m.dest, width: m.w, height: m.h }, { preview: true }); } catch { hz = null; }
      avoidMemo.set(m.id, hz);
    }
    return avoidMemo.get(m.id);
  };
  const walkable = (m, c) => {
    try { return restWalkable(m, c, s) && !hazards(m)?.at?.(toTopLeft(c, m.w, m.h, s)); } catch { return false; }
  };
  // Walk distances from each member's formation spot (walls and blocking creatures), built on first use: the spots
  // are tried nearest by walking, never one round the far side of a wall (file-core candidatesFor).
  const floods = new Map();
  const walk = (m, c) => {
    if (!floods.has(m.id)) {
      try {
        const f = fieldFor(m.token, m.dest, m.dest, { preview: true, constrain, automation: dnd5eMovementAutomation() });
        floods.set(m.id, { f, walk: flood({ i: 0, j: 0 }, (a, b) => !f.blocked(b) && f.wall(a, b), REACH_RINGS) });
      } catch (err) { log?.debug?.("file: the walk from a formation spot", err); floods.set(m.id, null); }
    }
    const fl = floods.get(m.id);
    if (!fl) return Math.hypot(c.x - m.formation.x, c.y - m.formation.y);
    const n = fl.f.nodeOf(toTopLeft(c, m.w, m.h, s));
    return fl.walk.get(`${n.i},${n.j}`) ?? null;
  };
  const route = (m, from, to, avoid) => {
    const origin = origins.get(m.id);
    const tl = toTopLeft(to, m.w, m.h, s);
    const onGrid = tl.x % s === 0 && tl.y % s === 0;
    const dest = { ...origin, x: tl.x, y: tl.y, snapped: onGrid, explicit: true, checkpoint: true };
    const start = { x: from.x * s, y: from.y * s };
    const circles = avoid.map(o => ({ x: o.x * s, y: o.y * s, r: (o.r + m.r) * s - 1, box: true }))
      .filter(c => avoidDist(c, start, start) >= c.r);
    let r = null;
    try { r = feature.exposed.pathfindRouteTo?.(m.token, origin, dest, { preview: true, avoid: circles.length ? circles : null, maxMs: ROUTE_MS }); }
    catch (err) { log?.debug?.("file: a route", err); r = null; }
    if (!r?.reached || !(r.path?.length >= 2)) return null;
    const pts = r.path.map(p => toSquares(p, m.w, m.h, s));
    pts.px = r.path;
    return pts;
  };
  const plan = planFile({ members, anchorId: anchor.document.id, standing }, { walkable, walk, route, now });
  return { plan, members };
}

/** A member's waypoints (top-left pixels, after its origin) from its plan entry, or [] when it does not move. */
function waypointsFor(m, e) {
  if (!e || e.stay || !(e.points?.length >= 2)) return [];
  const px = e.points.px;
  if (!Array.isArray(px) || px.length < 2) return [];
  return px.slice(1).map((p, k, all) => (k === all.length - 1 ? { ...p, explicit: true, checkpoint: true } : { ...p, checkpoint: false }));
}

/**
 * Dry run: what a group drop of these tokens at `point` (the first token's destination, top-left pixels; the others
 * keep their offsets) would do. Nothing moves.
 */
function dryRun(refs, point) {
  if (!globalThis.canvas?.ready) return { ok: false, code: "NO_CANVAS", reason: "no drawn canvas (a browser tab, not the headless GM)" };
  let list;
  try { list = (Array.isArray(refs) ? refs : [refs]).map(r => resolveRef(r, "token")); }
  catch (err) { return { ok: false, code: errorCode(err) ?? "BAD_ARGS", reason: String(err?.message ?? err) }; }
  const tokens = list.map(d => d?.object).filter(Boolean);
  if (tokens.length !== list.length) return { ok: false, code: "NOT_FOUND", reason: "every token must be drawn on this canvas" };
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return { ok: false, code: "BAD_ARGS", reason: "point { x, y } (top-left pixels) is required" };
  const lead = tokens[0].document._source;
  const dx = point.x - lead.x, dy = point.y - lead.y;
  const contexts = tokens.map(t => {
    const src = t.document._source;
    return { token: t, destination: { ...src, x: src.x + dx, y: src.y + dy, snapped: true, explicit: true, checkpoint: true }, foundPath: [], waypoints: [] };
  });
  const out = planDrop(tokens[0], contexts, { constrain: tokens[0]._getDragConstrainOptions?.() ?? {} });
  if (!out) return { ok: true, result: "core", reason: "noPlan", members: [] };
  const { plan, members } = out;
  const s = gridSize(tokens[0]);
  return {
    ok: true, result: "plan", ms: plan.ms, passes: plan.passes, order: plan.order,
    members: members.map(m => {
      const e = plan.members[m.id];
      return { id: m.id, name: m.token.document.name, slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null,
        waypoints: waypointsFor(m, e).length, stay: e?.stay && e.stay !== "still" ? e.stay : null };
    }),
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  reg.on("updateToken", (doc, _changes, options) => onGroupTag(doc, options), { label: "updateToken: which group a move belongs to (click stops the group)" });
  ctx.expose({ groupCancel, groupMembers, groupNoteStop, groupHold: holdGroup, groupHeld: heldCount, groupStopped: stoppedLast,
    groupMax: () => FILE_MAX, groupPlan: planDrop, groupWaypoints: waypointsFor, groupDryRun: dryRun });
}

export function uninstall() {
  groups.clear();
  groupOf.clear();
  tagOf.clear();
  stopped = null;
  feature = null;
  log = null;
}
