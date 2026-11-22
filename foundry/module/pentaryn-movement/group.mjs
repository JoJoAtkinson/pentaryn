/**
 * Pentaryn Movement — the feature: group movement (0.4.0, plan context/plans/pathfinding-2026-11.md
 * §12–13). A multi-token drag drops with each member on its own route to its own rest slot, started
 * in waves so the circles keep apart, and an in-combat drop commits a checkpoint at every cell so
 * click-to-stop (stop.mjs) can halt it honestly.
 *
 * GLUE, one feature. Wraps Token#_prepareDragLeftDropUpdates on the configured token class: core's
 * own [updates, options] come back first, then
 *   - two or more contexts, no skip reason (motion-core groupMode): group-core plans slots, routes
 *     (the pathfinder's routeTo, through dnd5e's constrain) and start delays; wave 0 goes out as the
 *     drop's own update, later waves as timers on this client, one batched update per 150 ms;
 *   - ghost / unconstrained out of combat: core's straight lines, only a rest overlap nudged;
 *   - anything else: core's updates, with per-cell checkpoints for members in a started combat.
 * Any throw, an over-budget plan or an unverifiable route means core's own updates for that drop
 * (or member), with one warning. A plan that does not finish in GROUP_LIMITS.syncMs finishes in
 * timer slices; the drop then returns no updates and the same shape is committed when it is ready.
 *
 * While a group is dragged only the grabbed token is pathfound (groupFollower, read by pathfind.mjs):
 * the plan at the drop replaces the others' previews anyway.
 */

import { MODULE } from "./movement-core.mjs";
import { MOTION, cellChain, groupMode, waves } from "./motion-core.mjs";
import { GROUP_LIMITS, flood, planGroup, runPlan } from "./group-core.mjs";
import { skipReason } from "./pathfind-core.mjs";
import { gridSize, inCombat, memberOf, narrowPoints, othersOf, restWalkable, toSquares, toTopLeft } from "./group-adapter.mjs";
import { fieldFor } from "./pathfind-adapter.mjs";
import { dnd5eMovementAutomation, setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { resolveRef } from "./lib/resolve.mjs";
import { errorCode } from "./lib/errors.mjs";

let log = null;
let feature = null;
let dropHandle = null;
let dropPatched = false;

/** Groups this client committed: id → { ids, timers, stopped }. */
const groups = new Map();
const groupOf = new Map();                 // token id → group id
let last = null;                           // the last drop, for status()
const fallbacks = [];                      // the last few reasons a drop went to core
/** token id → the sequence number of this client's latest drop of it: an older plan or wave never overrides a newer drop. */
const latestDrop = new Map();
let dropSeq = 0;

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One async planning slice (ms), as the pathfinder's. */
const SLICE_MS = 8;
/** One route call's wall-clock cap: under the per-member budget, so a long or impossible route excludes that member instead of freezing the drop. */
const ROUTE_MS = Math.max(GROUP_LIMITS.memberMs - 30, 20);
/** How long after its last member should be at rest a group is still held as one (ms). */
const GROUP_HOLD_MS = 1000;

function fellBack(reason) {
  fallbacks.unshift({ at: new Date().toISOString(), reason });
  fallbacks.length = Math.min(fallbacks.length, 8);
}

/* -------------------------------------------- */
/*  Reads                                       */
/* -------------------------------------------- */

const contextsOf = event => Object.values(event?.interactionData?.contexts ?? {});

/** During a group drag, is this token one of the followers (pathfinding waits for the drop)? */
function groupFollower(token) {
  if (!setting("groupMovement")) return false;
  const dragged = token?.layer?._draggedToken;
  if (!dragged || dragged === token) return false;
  const contexts = dragged.mouseInteractionManager?.interactionData?.contexts ?? {};
  const n = Object.keys(contexts).length;
  if (n < 2 || n > GROUP_LIMITS.maxMembers || !(token.document?.id in contexts)) return false;
  // A drop core will commit anyway (Ctrl-click waypoints, a direct or planned move) keeps every
  // member's own pathfinding, as before 0.4.0: otherwise its followers would stop at the first wall.
  const planning = token.layer?._movementPlanningContext;
  if (planning || Object.values(contexts).some(c => c?.waypoints?.length)) return false;
  return (token.document?.parent?.grid?.type ?? globalThis.canvas?.grid?.type) === 1;
}

function modeFor(grabbed, contexts) {
  const planning = grabbed.layer?._movementPlanningContext ?? null;
  const constrain = grabbed._getDragConstrainOptions?.() ?? {};
  const ghost = !!feature.exposed.ghostFor?.(grabbed);
  const gridType = grabbed.document?.parent?.grid?.type ?? globalThis.canvas?.grid?.type;
  const combat = contexts.some(c => inCombat(c.token?.document));
  const pathfind = skipReason({
    mode: setting("pathfinding"), mine: !!setting("pathfindMine"), isGM: !!game.user?.isGM, gridType, constrain: {}, waypoints: 2,
  });
  return {
    combat, constrain,
    ...groupMode({
      enabled: !!setting("groupMovement"), members: contexts.length, gridType,
      direct: !!planning?.direct, planned: !!planning, waypoints: contexts.some(c => c.waypoints?.length),
      ghost, unconstrained: !!constrain.ignoreWalls && !ghost, combat, pathfind: pathfind === "grid" ? null : pathfind,
    }),
  };
}

/* -------------------------------------------- */
/*  In combat: a checkpoint at every cell        */
/* -------------------------------------------- */

/**
 * The waypoints after `path[0]` with every cell between lattice neighbours inserted as a snapped
 * checkpoint. Kept only when core measures the expanded path at exactly the same cost.
 */
function withCheckpoints(token, path) {
  const s = gridSize(token);
  const out = [];
  for (let k = 1; k < path.length; k++) {
    const a = path[k - 1], b = path[k];
    const di = (b.y - a.y) / s, dj = (b.x - a.x) / s;
    const flat = ["elevation", "width", "height", "level", "action"].every(f => a[f] === undefined || b[f] === undefined || a[f] === b[f]);
    if (flat && Number.isInteger(di) && Number.isInteger(dj)) {
      const cells = cellChain([{ i: 0, j: 0 }, { i: di, j: dj }]);
      for (const c of cells.slice(1, -1)) {
        out.push({ ...b, x: a.x + c.j * s, y: a.y + c.i * s, snapped: true, explicit: false, checkpoint: c.checkpoint });
      }
    }
    out.push({ ...b, checkpoint: true });
  }
  try {
    const before = token.measureMovementPath(path, { preview: false })?.cost;
    const after = token.measureMovementPath([path[0], ...out], { preview: false })?.cost;
    if (!Number.isFinite(before) || Math.abs(before - after) > 1e-6) return path.slice(1);
  } catch {
    return path.slice(1);
  }
  return out;
}

/** In combat, give every member's committed waypoints their cell checkpoints. */
function checkpointAll(contexts, options) {
  if (!setting("clickToStop")) return;
  for (const c of contexts) {
    const id = c.token?.document?.id;
    const m = options.movement?.[id];
    // A planned move (the planning API) keeps its waypoints: its caller holds them as the plan's result.
    if (!m?.waypoints?.length || m.planned || !inCombat(c.token.document)) continue;
    const origin = feature.exposed.pathfindOrigin?.(c.token.document) ?? c.foundPath?.[0];
    m.waypoints = withCheckpoints(c.token, [origin, ...m.waypoints]);
  }
}

/* -------------------------------------------- */
/*  The plan                                    */
/* -------------------------------------------- */

/** The oracles group-core asks, for these members on this canvas. */
function oraclesFor(members, anchor, { combat, constrain }) {
  const s = gridSize(anchor.token);
  const byId = new Map(members.map(m => [m.id, m]));
  // Walk distances from the anchor's drop point, on its own lattice (walls and blocking creatures;
  // no cost, which the flood does not need). Built on first use: a straight (ghost) drop never asks.
  let f = null, walk = null;
  const walkDistance = c => {
    if (!walk) {
      f = fieldFor(anchor.token, anchor.dest, anchor.dest, { preview: true, constrain: constrain ?? {}, automation: dnd5eMovementAutomation() });
      const rmax = Math.max(...members.map(m => m.r));
      walk = flood({ i: 0, j: 0 }, (a, b) => !f.blocked(b) && f.wall(a, b), Math.ceil(GROUP_LIMITS.rings * (2 * rmax + MOTION.restGap)) + 2);
    }
    const n = f.nodeOf(toTopLeft(c, anchor.w, anchor.h, s));
    return walk.get(`${n.i},${n.j}`) ?? null;
  };
  const restMemo = new Map();
  const walkable = (m, c) => {
    const rec = byId.get(m.id) ?? m;
    const k = `${rec.w}x${rec.h}|${c.x.toFixed(3)},${c.y.toFixed(3)}`;
    if (!restMemo.has(k)) restMemo.set(k, restWalkable(rec, c, s));
    return restMemo.get(k);
  };
  const measured = path => {
    const pts = path.map(p => toSquares(p, anchor.w, anchor.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    let cost = null;
    try { cost = anchor.token.measureMovementPath(path, { preview: true })?.cost ?? null; } catch { cost = null; }
    return { points: pts, length, data: { path, cost } };
  };
  const route = (m, from, to, { avoid = [] } = {}) => {
    const rec = byId.get(m.id);
    const doc = rec.token.document;
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    // The grabbed token to its drop point: the route its drag preview showed (already pathfound and
    // constrained while dragging), so it walks what the player saw and the drop never searches it again.
    const shown = rec.corePathRaw ?? [];
    const src = doc._source;
    // A search the drag had not finished (`searching`) is never reused.
    if (m.id === anchor.id && !avoid.length && atFormation && !rec.searching && shown.length >= 2
      && Math.round(last.x) === tl.x && Math.round(last.y) === tl.y
      && shown[0].x === src.x && shown[0].y === src.y) return measured(shown.map(p => ({ ...p })));
    const origin = feature.exposed.pathfindOrigin(doc);
    const dest = {
      ...origin, x: tl.x, y: tl.y, elevation: rec.dest.elevation ?? origin.elevation,
      action: last.action ?? doc.movementAction, snapped: combat || (atFormation && !!rec.dest.snapped),
      explicit: true, checkpoint: true,
    };
    const r = feature.exposed.pathfindRouteTo(rec.token, origin, dest, {
      preview: true, avoid: avoid.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      maxMs: ROUTE_MS,
    });
    if (!r?.reached || !r.path?.length) return null;
    const pts = r.path.map(p => toSquares(p, rec.w, rec.h, s));
    let length = 0;
    for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    return { points: pts, length, data: { path: r.path, cost: r.cost } };
  };
  return {
    walkable,
    walkDistance,
    route,
    narrow: (points, r) => narrowPoints(anchor.token, points, r, s),
    now,
  };
}

/** Members, the anchor and the plan generator for a drop (or a dry run). */
function prepare(grabbed, contexts, info) {
  const s = gridSize(grabbed);
  const members = contexts.map(c => ({ ...memberOf(c, s), corePathRaw: c.foundPath ?? [], searching: !!c.searching }));
  const anchor = members.find(m => m.id === grabbed.document.id);
  if (!anchor) return null;
  const spec = { members, anchorId: anchor.id, combat: info.combat, mode: info.mode, others: othersOf(members, s) };
  return { members, anchor, gen: planGroup(spec, oraclesFor(members, anchor, info)) };
}

/**
 * Turn a finished plan into update batches: { first: [updates, options], later: [{ at, ids, updates, movement }] }.
 * A planned member's waypoints are its route (in combat with cell checkpoints); a member left to core
 * keeps core's entry. A member whose route is missing falls back to core's entry too.
 */
function batches(plan, members, [updates, options], combat) {
  const movement = { ...options.movement };
  const delays = {};
  for (const m of members) {
    const e = plan.members[m.id];
    delays[m.id] = e?.delay ?? 0;
    if (plan.straight && e && movement[m.id]?.waypoints?.length) {
      // Ghost / unconstrained: core's straight line; a nudged member only gets its end moved.
      const tl = toTopLeft(e.slot, m.w, m.h, gridSize(m.token));
      const wps = movement[m.id].waypoints.slice();
      const end = wps.at(-1);
      if (end.x !== tl.x || end.y !== tl.y) wps[wps.length - 1] = { ...end, x: tl.x, y: tl.y, snapped: false };
      movement[m.id] = { ...movement[m.id], waypoints: wps };
      continue;
    }
    if (!e || e.core || !e.data?.path?.length) continue;
    const path = e.data.path;
    if (path.length < 2) { delete movement[m.id]; continue; }      // already there
    let wps = combat ? withCheckpoints(m.token, path) : path.slice(1);
    if (!plan.straight && !combat) wps = wps.map((w, k) => (k === wps.length - 1 ? w : { ...w, checkpoint: false }));
    wps[wps.length - 1] = { ...wps.at(-1), explicit: true, checkpoint: true };
    movement[m.id] = { ...(movement[m.id] ?? { planned: false }), waypoints: wps };
  }
  const ids = Object.keys(movement);
  const byWave = waves(Object.fromEntries(ids.map(id => [id, delays[id] ?? 0])));
  const base = { ...options };
  delete base.movement;
  const cut = list => ({
    updates: list.map(id => updates.find(u => u._id === id) ?? { _id: id }),
    movement: Object.fromEntries(list.map(id => [id, movement[id]])),
  });
  const first = byWave[0]?.at === 0 ? cut(byWave[0].ids) : { updates: [], movement: {} };
  const later = byWave.filter(w => w.at > 0).map(w => ({ at: w.at, ids: w.ids, ...cut(w.ids) }));
  // When the last member should be at rest (ms after the drop): the group is stoppable as one until then.
  let endMs = 0;
  for (const m of members) {
    const e = plan.members[m.id];
    const pts = e?.points ?? [];
    let len = 0;
    for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
    endMs = Math.max(endMs, (e?.delay ?? 0) + (len / (m.speed > 0 ? m.speed : MOTION.speed)) * 1000);
  }
  return { first: [first.updates, { ...base, movement: first.movement }], later, base, endMs };
}

/**
 * Which of `ids` may still be sent for drop `seq`: on `scene`, not moved since the drop
 * (`starts`), and not dropped again by this client since (a newer drop always wins).
 */
function stillOurs(ids, scene, starts, seq) {
  return ids.filter(id => {
    const doc = scene?.tokens?.get(id);
    const at = starts.get(id);
    return doc && at && latestDrop.get(id) === seq && doc._source.x === at.x && doc._source.y === at.y;
  });
}

/** Send one batch for drop `seq`, only for the members still ours. */
function send(scene, seq, starts, updates, options, what) {
  const ids = stillOurs(updates.map(u => u._id), scene, starts, seq);
  if (!ids.length) return;
  const movement = Object.fromEntries(ids.map(id => [id, options.movement?.[id]]).filter(([, m]) => m));
  scene.updateEmbeddedDocuments("Token", updates.filter(u => ids.includes(u._id)), { ...options, movement })
    .catch(err => log.warnOnce(`group-${what}`, `a group ${what} failed (further errors suppressed)`, err));
}

/**
 * Hold this client's group until its last member should be at rest (so a click on any member stops
 * them all, plan §12), and send the later waves; each checks the group was not stopped and its
 * members have not moved or been dropped again. Waves go to the drop's own scene, also when this
 * client has switched to another view meanwhile.
 */
function schedule(later, base, members, { scene, seq, starts, endMs = 0 }) {
  if (!base || members.length < 2) return;
  const gid = foundry.utils.randomID();
  const group = { ids: new Set(members.map(m => m.id)), timers: [], stopped: false };
  groups.set(gid, group);
  for (const id of group.ids) groupOf.set(id, gid);
  const lastWave = later.at(-1)?.at ?? 0;
  group.timers.push(setTimeout(() => forget(gid), Math.max(endMs, lastWave) + GROUP_HOLD_MS));
  for (const wave of later) {
    group.timers.push(setTimeout(() => {
      if (group.stopped) return;
      // A member a relay stop took out of the group (groupCancel only) is not sent.
      const updates = wave.updates.filter(u => group.ids.has(u._id));
      if (updates.length) send(scene, seq, starts, updates, { ...base, movement: wave.movement }, "wave");
    }, wave.at));
  }
}

function forget(gid) {
  const g = groups.get(gid);
  if (!g) return;
  for (const t of g.timers) clearTimeout(t);
  for (const id of g.ids) if (groupOf.get(id) === gid) groupOf.delete(id);
  groups.delete(gid);
}

/**
 * Stop the rest of a group this client sent (click-to-stop): cancel the unsent waves. Returns the
 * ids of the group's members (the caller stops those already moving), or [] when this client holds
 * no group for the token. `only` cancels just that token's own wave entry.
 */
function groupCancel(tokenId, { only = false } = {}) {
  const gid = groupOf.get(tokenId);
  const g = gid ? groups.get(gid) : null;
  if (!g) return [];
  if (only) { g.ids.delete(tokenId); groupOf.delete(tokenId); return [tokenId]; }
  g.stopped = true;
  const ids = [...g.ids];
  forget(gid);
  return ids;
}

/* -------------------------------------------- */
/*  The drop                                    */
/* -------------------------------------------- */

function debugThrow() {
  if (globalThis.CONFIG?.debug?.[`${MODULE}.throw`]) throw new Error("debug: forced planner throw");
}

/** The wrap's body: core's result in, the drop's result out (null while an async plan runs). */
function onDrop(grabbed, event, result) {
  if (!Array.isArray(result) || !Array.isArray(result[0]) || !result[1]?.movement) return result;
  const contexts = contextsOf(event).filter(c => c?.token?.document);
  if (!contexts.length) return result;
  // Every drop, whatever its mode, supersedes this client's pending plan or waves for those tokens.
  const seq = ++dropSeq;
  for (const c of contexts) latestDrop.set(c.token.document.id, seq);
  const info = modeFor(grabbed, contexts);
  const t0 = now();
  last = { at: new Date().toISOString(), mode: info.mode, reason: info.reason, combat: info.combat, members: contexts.length,
    result: null, ms: null, async: false, relaxed: 0, replans: 0, waves: 0 };

  if (info.mode === "core") {
    if (info.combat) checkpointAll(contexts, result[1]);
    last.result = "core";
    return result;
  }
  debugThrow();
  const prep = prepare(grabbed, contexts, info);
  if (!prep) { fellBack("noAnchor"); return result; }

  const finish = plan => {
    last.ms = Math.round((now() - t0) * 10) / 10;
    if (plan?.result !== "plan") {
      fellBack(plan?.reason ?? "noPlan");
      last.result = "core";
      last.reason = plan?.reason ?? "noPlan";
      if (info.combat) checkpointAll(contexts, result[1]);
      return { first: result, later: [], base: null };
    }
    last.result = "plan";
    Object.assign(last, { relaxed: plan.relaxed, replans: plan.replans, constricted: plan.constricted,
      formation: plan.formation, excluded: plan.excluded, planMs: plan.ms });
    const b = batches(plan, prep.members, result, info.combat);
    last.waves = b.later.length + 1;
    return b;
  };

  const scene = grabbed.document.parent ?? canvas.scene;
  const starts = new Map(prep.members.map(m => [m.id, { x: m.token.document._source.x, y: m.token.document._source.y }]));
  const hold = b => ({ scene, seq, starts, endMs: b.endMs ?? 0 });
  const step = runPlan(prep.gen, GROUP_LIMITS.syncMs, now);
  if (step.done) {
    const b = finish(step.value);
    schedule(b.later, b.base, prep.members, hold(b));
    return b.first[0].length ? b.first : null;
  }

  // Async: finish in timer slices, then commit the same shape core would have, for the members
  // nobody moved and this client did not drop again in the meantime.
  last.async = true;
  const commit = ([updates, options]) => {
    if (updates.length) send(scene, seq, starts, updates, options, "move");
  };
  const tick = () => {
    if (!feature) return;                  // uninstalled while planning: nothing is sent
    let b;
    try {
      if (now() - t0 > GROUP_LIMITS.totalMs) b = finish({ result: "core", reason: "budget" });
      else {
        const r = runPlan(prep.gen, SLICE_MS, now);
        if (!r.done) { setTimeout(tick, 0); return; }
        b = finish(r.value);
      }
    } catch (err) {
      log.warnOnce("group-plan", "group planning failed; the move goes as core's (further errors suppressed)", err);
      fellBack("throw");
      b = { first: result, later: [], base: null };
    }
    commit(b.first);
    schedule(b.later, b.base, prep.members, hold(b));
  };
  setTimeout(tick, 0);
  return null;
}

/* -------------------------------------------- */
/*  The wrap                                    */
/* -------------------------------------------- */

function patchDrop() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._prepareDragLeftDropUpdates !== "function") {
    log.warn("no Token#_prepareDragLeftDropUpdates; group movement disabled");
    return false;
  }
  dropHandle = wrapMethod(MODULE, {
    target: proto, name: "_prepareDragLeftDropUpdates", label: "Token#_prepareDragLeftDropUpdates",
    marker: "__pentarynMovementGroup", adjustments: "movement-group-drop",
  }, function (wrapped, event) {
    const result = wrapped(event);
    try { return onDrop(this, event, result); }
    catch (err) {
      log.warnOnce("group", "group movement skipped; the move goes as core's (further errors suppressed)", err);
      fellBack("throw");
      return result;
    }
  });
  return true;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

function groupStatus() {
  const controlled = globalThis.canvas?.tokens?.controlled ?? [];
  return {
    enabled: !!setting("groupMovement"),
    clickToStop: !!setting("clickToStop"),
    patched: { drop: dropPatched, click: !!feature?.exposed?.stopPatched?.() },
    regime: controlled.some(t => inCombat(t.document)) ? "combat" : "free",
    limits: { ...GROUP_LIMITS, motion: { ...MOTION } },
    groups: groups.size,
    last: last ? { ...last } : null,
    fallbacks: fallbacks.map(f => ({ ...f })),
  };
}

/**
 * Dry run: what a drop of these tokens at `point` (the first token's destination, top-left pixels;
 * the others keep their offsets) would do. Nothing moves.
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
    const origin = feature.exposed.pathfindOrigin(t.document);
    const dest = { ...origin, x: origin.x + dx, y: origin.y + dy, snapped: true, explicit: true, checkpoint: true };
    return { token: t, destination: dest, foundPath: [origin], waypoints: [] };
  });
  const info = modeFor(tokens[0], contexts);
  if (info.mode === "core" && tokens.length > 1) return { ok: true, result: "core", reason: info.reason, members: [] };
  const prep = prepare(tokens[0], contexts, { ...info, mode: info.mode === "core" ? "plan" : info.mode });
  let r = runPlan(prep.gen, GROUP_LIMITS.totalMs, now);
  while (!r.done) r = runPlan(prep.gen, GROUP_LIMITS.totalMs, now);
  const plan = r.value;
  if (plan.result !== "plan") return { ok: true, result: "core", reason: plan.reason, members: [] };
  const s = gridSize(tokens[0]);
  return {
    ok: true, result: "plan", reason: info.reason, combat: info.combat, constricted: plan.constricted,
    formation: plan.formation, replans: plan.replans, relaxed: plan.relaxed, ms: plan.ms,
    members: prep.members.map(m => {
      const e = plan.members[m.id];
      return {
        id: m.id, name: m.token.document.name, core: !!e?.core, level: e?.level ?? null, delay: e?.delay ?? 0,
        slot: e ? toTopLeft(e.slot, m.w, m.h, s) : null, waypoints: e?.data?.path?.length ?? e?.points?.length ?? 0,
      };
    }),
  };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  if (ctx.late) dropPatched = patchDrop();
  else reg.once("setup", () => { dropPatched = patchDrop(); }, { guard: false, label: "setup: wrap _prepareDragLeftDropUpdates (group movement)" });
  ctx.expose({ groupFollower, groupCancel, groupStatus, groupDryRun: dryRun, groupPatched: () => dropPatched });
}

export function uninstall() {
  dropHandle?.unwrap();
  dropHandle = null;
  dropPatched = false;
  for (const gid of [...groups.keys()]) {
    for (const t of groups.get(gid).timers) clearTimeout(t);
    forget(gid);
  }
  last = null;
  fallbacks.length = 0;
  latestDrop.clear();
  feature = null;
}
