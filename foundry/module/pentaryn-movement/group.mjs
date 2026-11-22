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

const now = () => globalThis.performance?.now?.() ?? Date.now();
/** One async planning slice (ms), as the pathfinder's. */
const SLICE_MS = 8;
/** The most one route search may take (ms): under GROUP_LIMITS.memberMs, so a capped search is a member left to core, not a budget fallback. */
const ROUTE_MS = Math.round(GROUP_LIMITS.memberMs * 0.8);

/** The scene a drop was made on (waves and late commits go there, not to whatever the canvas shows then). */
const sceneById = id => globalThis.game?.scenes?.get?.(id) ?? (globalThis.canvas?.scene?.id === id ? globalThis.canvas.scene : null);
/** Members still where the drop found them (nobody moved them while the plan or a wave waited). */
const unmoved = (scene, starts, ids) => ids.filter(id => {
  const doc = scene?.tokens?.get(id);
  const at = starts.get(id);
  return doc && at && doc._source.x === at.x && doc._source.y === at.y;
});
const startsOf = members => new Map(members.map(m => [m.id, { x: m.token.document._source.x, y: m.token.document._source.y }]));

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
  // The drops groupMode leaves to core keep the 0.3 per-token pathfinding: explicit waypoints, a planned
  // or direct movement (review-correctness: these drags lost their followers' pathfinding).
  if (token.layer?._movementPlanningContext) return false;
  if (Object.values(contexts).some(c => c?.waypoints?.length)) return false;
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
    // A planned movement (core's planMovement) keeps its waypoints: core already stored them as the plan's result.
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
  const route = (m, from, to, { avoid = [] } = {}) => {
    const rec = byId.get(m.id);
    const doc = rec.token.document;
    const origin = feature.exposed.pathfindOrigin(doc);
    const tl = toTopLeft(to, rec.w, rec.h, s);
    const atFormation = tl.x === Math.round(rec.dest.x) && tl.y === Math.round(rec.dest.y);
    const last = rec.corePathRaw?.at(-1) ?? {};
    // The grabbed token's drag already found its route (the ruler the user saw): reuse it when it reached
    // the drop point, instead of searching it again synchronously inside the drop (review-correctness).
    if (rec.id === anchor.id && !avoid.length && atFormation && !rec.searching && rec.corePathRaw?.length >= 2
      && Math.round(last.x) === tl.x && Math.round(last.y) === tl.y) {
      const path = rec.corePathRaw.map(p => ({ ...p }));
      const pts = path.map(p => toSquares(p, rec.w, rec.h, s));
      let length = 0;
      for (let k = 1; k < pts.length; k++) length += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].y - pts[k - 1].y);
      let cost = null;
      try { cost = rec.token.measureMovementPath(path, { preview: true })?.cost ?? null; } catch { cost = null; }
      return { points: pts, length, data: { path, cost } };
    }
    const dest = {
      ...origin, x: tl.x, y: tl.y, elevation: rec.dest.elevation ?? origin.elevation,
      action: last.action ?? doc.movementAction, snapped: combat || (atFormation && !!rec.dest.snapped),
      explicit: true, checkpoint: true,
    };
    const r = feature.exposed.pathfindRouteTo(rec.token, origin, dest, {
      preview: true, avoid: avoid.map(c => ({ x: c.x * s, y: c.y * s, r: c.r * s })), constrainOptions: constrain ?? {},
      // One route call cannot be interrupted: cap it under the member budget, so no slice blocks for the
      // pathfinder's whole 1.5 s (review-correctness: "never freeze the UI").
      budgetMs: ROUTE_MS,
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
  return { first: [first.updates, { ...base, movement: first.movement }], later, base };
}

/** Send the later waves from this client; each checks the group was not stopped and its members have not moved. */
function schedule(later, base, members, sceneId, starts = startsOf(members)) {
  if (!later.length) return;
  const gid = foundry.utils.randomID();
  const group = { ids: new Set(members.map(m => m.id)), timers: [], stopped: false };
  groups.set(gid, group);
  for (const id of group.ids) groupOf.set(id, gid);
  let left = later.length;
  for (const wave of later) {
    group.timers.push(setTimeout(() => {
      left -= 1;
      if (left <= 0) forget(gid);
      if (group.stopped) return;
      const scene = sceneById(sceneId);
      const ids = unmoved(scene, starts, wave.ids.filter(id => group.ids.has(id)));
      if (!ids.length) return;
      const updates = wave.updates.filter(u => ids.includes(u._id));
      const movement = Object.fromEntries(ids.map(id => [id, wave.movement[id]]));
      scene.updateEmbeddedDocuments("Token", updates, { ...base, movement })
        .catch(err => log.warnOnce("group-wave", "a group wave failed (further errors suppressed)", err));
    }, wave.at));
  }
}

function forget(gid) {
  const g = groups.get(gid);
  if (!g) return;
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
  for (const t of g.timers) clearTimeout(t);
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
  const info = modeFor(grabbed, contexts);
  const t0 = now();
  const sceneId = grabbed.document.parent?.id ?? globalThis.canvas?.scene?.id;
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
  const starts = startsOf(prep.members);

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

  const step = runPlan(prep.gen, GROUP_LIMITS.syncMs, now);
  if (step.done) {
    const b = finish(step.value);
    schedule(b.later, b.base, prep.members, sceneId, starts);
    return b.first[0].length ? b.first : null;
  }

  // Async: finish in timer slices, then commit the same shape core would have.
  last.async = true;
  // A late commit only moves members still where the drop found them, on the drop's scene: a token
  // dragged again (or moved by someone else) during the plan keeps its newer move (review-correctness).
  const commit = ([updates, options]) => {
    const scene = sceneById(sceneId);
    const ids = unmoved(scene, starts, updates.map(u => u._id));
    if (!ids.length) return;
    const movement = Object.fromEntries(Object.entries(options.movement ?? {}).filter(([id]) => ids.includes(id)));
    scene.updateEmbeddedDocuments("Token", updates.filter(u => ids.includes(u._id)), { ...options, movement })
      .catch(err => log.warnOnce("group-commit", "a group move failed (further errors suppressed)", err));
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
    schedule(b.later, b.base, prep.members, sceneId, starts);
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
  feature = null;
}
