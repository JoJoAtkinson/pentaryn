/**
 * Pentaryn Movement — the feature: click to stop (0.4.0, plan context/plans/pathfinding-2026-11.md
 * §12 "Click-to-stop", §13). A left click on a token that is moving stops it, then selects it as
 * usual; a double click's second press finds it stopped and opens the sheet.
 *
 * GLUE, one feature. Wraps Token#_onClickLeft on the configured token class. What a click does is
 * motion-core's clickStop table:
 *   displace  out of combat: the token is put exactly where it is drawn (animate: false, the displace action:
 *             no walls, no cost, nothing recorded outside combat). Any owner may; the move's own
 *             continuation sees a newer movement and gives up.
 *   stop      in combat, this client started the move: stopMovement(). The token finishes the cell it
 *             is in (the drop committed a checkpoint at every cell, drop.mjs), and dnd5e records
 *             exactly the cells walked. Never a displace in combat.
 *   query     in combat, another user started it. A player asks the active GM (the kit's relay
 *             row `stop`), which stops it when it is the one that started the move. A GM asks the
 *             user who started it directly (STOP_OWN, a hand-written CONFIG.queries handler: the
 *             kit's queries only reach the active GM; exceptions.json C56, Fable's verdict
 *             2026-11-21 "let the GM stop any move in combat"). 400 ms, and on any failure nothing
 *             happens.
 * A click on a move this client dropped is armed only once the move has run MOTION.armMs (400 ms): the click
 * that follows a drop out of habit, or the first press of a double click, is core's own (Fable's verdict). The
 * start is when this client saw the drop (noteDrop). A move another user started is armed at once (0.8.4, AR2-08:
 * a player clicking its own token as the GM's group set off was ignored, and the token walked on); so is a move
 * this client never saw start. The API's stop() is never held back.
 * A click on one member of a group stops the whole group (decision 3 as revised 2026-11-24; 0.9.0 §4 step 3). On the
 * client that sent the group, every member and its unsent waves (or its fight queue). On any other client, the one
 * clicked: the dragger's screen sees that stop and stops the rest (file.mjs onGroupTag). When the dragger is no longer
 * there, the clicker stops every member it owns too. Out of combat each stops exactly where it is drawn; one whose body
 * is across a door's line is carried just past the line along its own route (Joe's decision 2 as revised 2026-11-23,
 * 0.8.0).
 *
 * The click also reaches a moving token core's MouseInteractionManager drops (0.4.1, live R1 D-2): a
 * DOM pointerdown on the board that the wrap did not see (the token's manager was not in its hover
 * state, or PIXI hit-tested a transform a frame old) is matched against the circles where the moving
 * tokens are drawn, and stops the nearest one this client could have clicked.
 * A stop never leaves this client showing a token off its server position (0.4.1, live R1 D-4): the
 * tween's queued links are emptied before it is terminated (a terminated tween still ticked once
 * resumed a link with no context: core's TypeError "reading 'chain'", which also wrote the old tween
 * values back onto the document), and once the token is at rest a drawn position that differs from
 * its source is reset to it.
 */

import { MODULE } from "./movement-core.mjs";
import { clearAlong, clickStop, radiusOf, routeAhead, stopOrder } from "./motion-core.mjs";
import { firstIntrusion } from "./group-core.mjs";
import { continuationInFlight, doorwayAt, drawnPosition, gridSize, holdPinned, inCombat, movementFacts, open as wallOpen, pinDrawn, stopWhereDrawn, unpin } from "./group-adapter.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { queryGM } from "./lib/queries.mjs";

let log = null;
let feature = null;
let clickHandle = null;
let defuseHandle = null;
let animHandle = null;
let clickPatched = false;
let lastStop = null;
/** The DOM pointerdown the click wrap saw last (the board listener leaves that one alone). */
let lastNative = null;
/** The board element the fallback listens on, and its listener. */
let board = null;
/** How long after a stop's write a drawn position is checked again against the source (ms). */
const RESYNC_MS = 250;

/** The query a GM sends to the user who started a move in combat (registered by hand: see the header). */
export const STOP_OWN = `${MODULE}.stopOwn`;

/* -------------------------------------------- */
/*  When did a move start (the arming delay)    */
/* -------------------------------------------- */

const clock = () => globalThis.performance?.now?.() ?? Date.now();
/** token id → { id: the move's first movement id (null: dropped here, not seen yet), at }. */
const starts = new Map();
/** How long a drop waits for its moveToken before the record is stale (ms). */
const DROP_WAIT_MS = 2000;

const firstIdOf = movement => movement?.chain?.[0] ?? movement?.id ?? null;

/** This client dropped these tokens just now (drop.mjs, every drop). */
function noteDrop(ids) {
  const t = clock();
  for (const id of ids ?? []) if (id) starts.set(id, { id: null, at: t });
}

/** The moveToken hook (every client): the first time a move (with its continuations) is seen. */
function onMoveToken(doc, movement) {
  const first = firstIdOf(movement);
  if (!doc?.id || !first) return;
  const rec = starts.get(doc.id);
  if (rec?.id === first) return;
  if (rec && rec.id === null && clock() - rec.at < DROP_WAIT_MS) { rec.id = first; return; }
  // A move this client did not drop (AR2-08): no click of this user's follows its drop, so it is armed at once.
  starts.set(doc.id, { id: first, at: clock(), foreign: true });
  if (starts.size > 500) starts.delete(starts.keys().next().value);
}

/** When (performance clock, ms) this client saw token `id`'s current move start (its drop, or its first moveToken), or null. */
const startedAt = id => starts.get(id)?.at ?? null;

/** ms since this token's current move started, Infinity when this client never saw it start. */
function elapsedOf(doc) {
  const rec = starts.get(doc?.id);
  if (!rec) return Infinity;
  const first = firstIdOf(doc.movement);
  if (rec.id && first && rec.id !== first) return Infinity;
  if (rec.foreign) return Infinity;
  return clock() - rec.at;
}

/**
 * Empty the queued links of a token's tweens before they are terminated, resolving each. A tween
 * terminated while its frame is still due this tick runs that frame once more; with links queued, its
 * completion resumes the next link although the context is gone, and core throws ("reading 'chain'")
 * after writing the old tween values onto the document (live R1 D-4). With no links it just ends.
 */
function defuse(token) {
  let contexts = [];
  try { contexts = [...(token.animationContexts?.values?.() ?? [])]; } catch { contexts = []; }
  for (const ctx of contexts) {
    let links = [];
    // A chain core froze is left as it is (FR1-12: an uncaught "Cannot assign to read only property" on a player tab).
    try { links = Array.isArray(ctx?.chain) && !Object.isFrozen(ctx.chain) ? ctx.chain.splice(0) : []; } catch (err) { log?.debug?.("defuse", err); links = []; }
    for (const link of links) {
      try { link?.resolve?.(); } catch (err) { log?.debug?.("defuse", err); }
    }
  }
}

/**
 * At rest, a token drawn anywhere but its source position is out of step with the server: reset it
 * (a full stopAnimation resets the document's derived position to its source). Never while a
 * movement tween runs, and never for a destroyed token.
 */
function resync(token) {
  try {
    if (!token || token.destroyed) return false;
    const doc = token.document;
    if (!doc?._source || movementFacts(token).animating) return false;
    if (Math.round(doc.x) === doc._source.x && Math.round(doc.y) === doc._source.y) return false;
    token.stopAnimation?.();
    return true;
  } catch (err) {
    log?.debug?.("resync", err);
    return false;
  }
}

/**
 * Where a click-stop out of combat puts a token (Joe's decision 2, revised 2026-11-23): exactly where it is drawn, no
 * snap. Carried on along its own route (forward at most PAST_DOOR_SQUARES, else back the way it came) to the first spot
 * that is clear when it is drawn
 *   - with its body across a door's line: just past the line;
 *   - inside a token at rest, or a spot a member of the same stop already took (`taken.resting`; 0.9.0 simulator,
 *     step 5: two members brushing as they walk, soft, were stopped where drawn and rested inside each other for good,
 *     hard): just clear of it. The leader of a moving group (0.10 R6, R7) inside its own members carries on along its
 *     way to the first free spot, however far.
 * A spot `taken` holds (resting, or drawn walking) is never used. With no clear spot along its own way it stays where
 * it is drawn, and when that is inside a token at rest it is named (0.10 L2 fix (a): 0.9's last resort, a straight
 * line to the nearest clear spot off its way, is gone). Returns { drawn, p, near, via, inside }: `near` (the drawn
 * spot) is set when the stop walks on from there to `p` through `via`; `inside`: it stays inside a token at rest.
 */
function stopSpot(token, taken = null) {
  const drawn = drawnPosition(token);
  let past = null;
  try { past = pastDoor(token, drawn, taken); } catch (err) { log?.debug?.("stop: past the door", err); }
  if (!past) return { drawn, p: drawn, near: null, via: [], inside: !!taken?.resting?.(drawn) };
  return { drawn, p: { ...drawn, x: past.p.x, y: past.p.y }, near: { x: drawn.x, y: drawn.y }, via: past.via, way: past.way };
}

/** How far a token across a door's line, or on one at rest, is carried along its route ahead to clear it, at most (squares). */
const PAST_DOOR_SQUARES = 1.5;

/**
 * A token drawn at `drawn` (top-left) with its body across a door's line, or inside a token at rest (`taken.resting`):
 * the first spot along its own route ahead (at most PAST_DOOR_SQUARES; else back along the way it came, as far as it
 * came) where its body is clear of every door line and of every token at rest, not on a spot `taken` holds: { p, via }
 * (via: the route's corners passed on the way), or null (nothing to clear, or nowhere).
 */
function pastDoor(token, drawn, taken) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const onRest = p => !!taken?.resting?.(p);
  if (!doorwayAt(token, centre(drawn)) && !onRest(drawn)) return null;
  const m = doc.movement;
  const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])]
    .filter(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
  const k = routeAhead(all, drawn, { near: 0.05 * s, end: 0.5 });
  const ahead = k === null ? [] : all.slice(k);
  const behind = (k === null ? all : all.slice(0, k)).reverse();
  // Clear of the door's line and of every token at rest; past a token still walking there, on (never the overlap);
  // never on through a wall that blocks movement now (a door shut since, the wall that cut it).
  const found = alongWay(token, drawn, { ahead, behind }, taken);
  return found ? { ...found, way: { ahead, behind } } : null;
}

/**
 * motion-core clearAlong as a stop runs it (pastDoor; the walk-on's second look): clear of a door's line and of every
 * token at rest; past a token still walking there, on (never the overlap); never on through a wall that blocks
 * movement now (a door shut since, the wall that cut it).
 */
function alongWay(token, drawn, { ahead, behind }, taken) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
  const centre = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const onRest = p => !!taken?.resting?.(p);
  return clearAlong(drawn, ahead, behind, {
    bad: p => doorwayAt(token, centre(p)) || onRest(p), taken, wallBetween: (a, b) => !wallOpen(token, centre(a), centre(b)),
    enters: taken?.enters ?? null,
    step: s / 20, aheadMax: onRest(drawn) && taken?.lead ? Infinity : PAST_DOOR_SQUARES * s, behindMax: onRest(drawn) ? Infinity : PAST_DOOR_SQUARES * s,
    snap: p => ({ x: Math.round(p.x), y: Math.round(p.y) }),
  });
}

/**
 * Spots this client's stops are carrying tokens on to (0.10 L3: the simulator's seed 1477): token id → { x, y, w, h,
 * at } (top-left pixels), until the walk on is sent and its write back. Another stop never rests a token there.
 */
const walkingOn = new Map();
const WALK_ON_MS = 3000;

function displace(token, at = stopSpot(token), extra = {}) {
  const doc = token.document;
  const { drawn } = at;
  let p = at.p;
  // This client's own move with checkpoints still to go: stop it first. stopAnimation resolves the
  // animation promise the continuation waits on, and that continuation would otherwise race the
  // displace to the server and carry the token on past where it was clicked (review-correctness).
  const m = doc.movement;
  // With its next segment already on the way to the server, no stopMovement (it would race that segment,
  // live R7-2): the displace is a newer movement and core stops the arriving segment itself.
  if (m?.user?.isSelf && (m.state === "pending" || m.state === "paused") && !continuationInFlight(doc)) {
    try { doc.stopMovement(); } catch (err) { log.debug?.("stopMovement before displace", err); }
  }
  defuse(token);
  try { stopWhereDrawn(token, drawn); } catch (err) { log.debug?.("stopAnimation", err); }
  // Carried past a door's line: where it is drawn first, then the short walk (HX1-07: never a jump). Two writes, as a
  // door cut does (R7-1).
  let near = at.near ?? null;
  const first = near ?? p;
  if (at.inside) {
    try { feature.exposed.groupTellStayed?.([doc], "stopInside", "stopInside"); } catch (err) { log.debug?.("stop: name it", err); }
  }
  pinDrawn(token, drawn, first);
  const wp = { x: first.x, y: first.y, elevation: p.elevation, action: "displace", snapped: false, explicit: true, checkpoint: true };
  const sz = { w: doc._source?.width ?? 1, h: doc._source?.height ?? 1 };
  if (near) walkingOn.set(doc.id, { x: p.x, y: p.y, ...sz, at: Date.now() });
  const walkOn = () => {
    // makeRoom (below) may have given it a walk on since its first write went: read `at` now.
    near = at.near ?? null; p = at.p;
    if (!near || !feature || token.destroyed) { walkingOn.delete(doc.id); return; }
    const z = p.elevation ?? doc._source.elevation ?? 0;
    try {
      // A wall raised or a door shut since the spot was chosen (a click a moment after a door shut, before this client
      // knew; 0.10 L3, seed 1477): the spot again along the same way, with the walls and the tokens as they are now;
      // with none, it stays where it is drawn, named when that is on another token.
      let to = p, via = at.via ?? [];
      const s = gridSize(token);
      const centre = q => ({ x: q.x + (sz.w * s) / 2, y: q.y + (sz.h * s) / 2 });
      const pts = [near, ...via, p];
      if (pts.some((q, k) => k > 0 && !wallOpen(token, centre(pts[k - 1]), centre(q)))) {
        walkingOn.delete(doc.id);
        const taken = takenAround(token, new Set([doc.id]), []);
        const again = at.way ? alongWay(token, near, at.way, taken) : null;
        if (!again) {
          if (taken.resting(near)) feature.exposed.groupTellStayed?.([doc], "stopInside", "stopInside");
          return;
        }
        to = { ...p, x: again.p.x, y: again.p.y };
        via = again.via;
      }
      // Just past the door's line along its own route (its corners passed on the way first), where it is, no snap.
      const wps = [...via, to].map((q, k, list) => ({ x: q.x, y: q.y, elevation: z, action: doc.movementAction ?? "walk", snapped: false,
        explicit: k === list.length - 1, checkpoint: k === list.length - 1 }));
      Promise.resolve(doc.move(wps, { method: "api", pentarynMovementStop: true }))
        .catch(err => log.debug?.("stop: walk to the square", err))
        .finally(() => walkingOn.delete(doc.id));
    } catch (err) { walkingOn.delete(doc.id); log.debug?.("stop: walk to the square", err); }
  };
  const reset = () => {
    unpin(token);
    try { if (!token.destroyed) token.stopAnimation?.(); } catch (err) { log.debug?.("stopAnimation reset", err); }
  };
  let pending;
  // Carried on: the stop's write names where it will rest (0.10 L2 fix (b)), so the dragger's screen, stopping the rest
  // of the group as it sees this write, never rests a mate there.
  const at2 = near ? { pentarynMovementStopAt: { x: p.x, y: p.y } } : {};
  try { pending = Promise.resolve(doc.move([wp], { animate: false, method: "api", pentarynMovementStop: true, ...at2, ...extra })); }
  catch (err) { pending = Promise.reject(err); }
  return pending
    .then(moved => {
      unpin(token);
      if (moved === false) { walkingOn.delete(doc.id); reset(); }
      else if (at.near) walkOn();
      else {
        resync(token);
        setTimeout(() => resync(token), RESYNC_MS);
      }
      return moved;
    })
    .catch(err => {
      walkingOn.delete(doc.id);
      reset();
      log.warnOnce("stop-displace", "could not stop a token where it was drawn (further errors suppressed)", err);
    });
}

/** How long after an unanimated move its token is watched, and how often (ms). */
const WATCH_MS = 3000;
const WATCH_EVERY_MS = 100;
/** token id → the watch on it (one per token; a newer unanimated move replaces it). */
const watches = new Map();

/**
 * After an unanimated move (a stop's displace, a teleport), until a newer movement starts or WATCH_MS
 * pass: a movement tween still running is a stray (the update stopped every tween; nothing may walk
 * the token on without a newer movement), so it is stopped at the source; at rest, a drawn position
 * off the source is reset to it. Live R3-2: the document stopped east of a door while the drawn token
 * walked on through it and stayed there; the 0 / 250 ms checks of 0.4.2 found it still animating and
 * never looked again.
 */
function settle(token, movementId) {
  try {
    if (!token || token.destroyed) return false;
    const doc = token.document;
    if (!doc?._source || (doc.movement?.id ?? null) !== movementId) return false;
    if (movementFacts(token).animating) {
      token.stopAnimation?.();
      return true;
    }
    return resync(token);
  } catch (err) {
    log?.debug?.("settle", err);
    return false;
  }
}

function watch(token) {
  const doc = token?.document;
  if (!doc?.id) return;
  const id = doc.id;
  const movementId = doc.movement?.id ?? null;
  const w = { movementId, left: Math.ceil(WATCH_MS / WATCH_EVERY_MS), timer: null };
  const prior = watches.get(id);
  if (prior) clearTimeout(prior.timer);
  watches.set(id, w);
  const tick = () => {
    if (watches.get(id) !== w) return;
    if (!feature || token.destroyed || (doc.movement?.id ?? null) !== movementId || w.left-- <= 0) {
      watches.delete(id);
      return;
    }
    settle(token, movementId);
    w.timer = setTimeout(tick, WATCH_EVERY_MS);
  };
  w.timer = setTimeout(tick, 0);
}

/** updateToken, every client: after an unanimated move (a stop's displace), watch the token until it is drawn where the server has it. */
function onUnanimatedMove(doc, changes, options) {
  if (options?.animate !== false || !changes || !("x" in changes || "y" in changes)) return;
  const token = doc?.object;
  if (!token) return;
  watch(token);
}

/** How long a stop waits for this client's in-flight continuation to land, and how often it looks (ms). */
const SAFE_WAIT_MS = 1500;
const SAFE_POLL_MS = 25;

/**
 * stopMovement, but never while this client's next segment of the move is on its way to the server
 * (continuationInFlight, live R7-2: a door shut mid-walk in a fight sent a member forward, back five
 * squares and forward again, and core logged "Cannot destructure property 'resolve'"). It waits for that
 * segment to land (at most SAFE_WAIT_MS), then stops the movement it started. `after(result)` runs as soon
 * as the stop is made (in the same call when nothing is in flight). Resolves true when stopped.
 */
function stopSafely(doc, after = null) {
  return new Promise(resolve => {
    const done = r => {
      try { after?.(r); } catch (err) { log?.debug?.("after a stop", err); }
      resolve(r);
    };
    const attempt = left => {
      if (!doc) return done(false);
      if (continuationInFlight(doc) && left > 0) { setTimeout(() => attempt(left - 1), SAFE_POLL_MS); return; }
      let ok = false;
      try { ok = doc.stopMovement() === true; } catch (err) { log?.debug?.("stopMovement", err); }
      done(ok);
    };
    attempt(Math.ceil(SAFE_WAIT_MS / SAFE_POLL_MS));
  });
}

/** Stop one token by the table's decision. */
function act(token, how) {
  const doc = token.document;
  if (how === "displace") return displace(token);
  if (how === "stop") return stopSafely(doc);
  if (how === "query") {
    // A GM asks whoever started the move (Fable's verdict: the GM may stop any move in combat).
    const starter = doc.movement?.user ?? null;
    if (game.user?.isGM && starter && !starter.isSelf && starter.active !== false && typeof starter.query === "function") {
      return Promise.resolve()
        .then(() => starter.query(STOP_OWN, { ref: doc.uuid }, { timeout: 400 }))
        .catch(err => { log.debug?.("stop query (starter)", err); return null; });
    }
    return queryGM(`${MODULE}.stop`, { ref: doc.uuid }, { timeout: 400 })
      .catch(err => { log.debug?.("stop query", err); return null; });
  }
  return Promise.resolve(null);
}

/** The table's inputs for a token on this client. */
function decide(token, { tool = game.activeTool, modifiers = false, armed = false } = {}) {
  const doc = token.document;
  const facts = movementFacts(token);
  let canControl = false;
  try { canControl = token.can?.(game.user, "control") ?? !!doc.isOwner; } catch { canControl = !!doc?.isOwner; }
  return clickStop({
    enabled: true, tool, modifiers, canControl,
    state: facts.state, animating: facts.animating, combat: inCombat(doc), initiatorSelf: facts.initiatorSelf,
    elapsed: armed ? Infinity : elapsedOf(doc),
  });
}

/**
 * Top-left `p` → would token `token` there come inside another token (at rest where the server has it, walking where
 * it is drawn) or a spot another member of this stop took (`claims`)? `skip`: the tokens this same stop stops (they
 * count by their claims). `.resting(p)`: the same without the walkers (a spot a stop must not rest inside, 0.9.0).
 */
function takenAround(token, skip, claims) {
  const doc = token.document;
  const scene = doc?.parent;
  const s = gridSize(token);
  const src = doc?._source ?? {};
  const w = src.width ?? 1, h = src.height ?? 1;
  const r = radiusOf(w, h) * s;
  // The leader of a moving group walks through its own members (0.10 R6): a stop carries it on through them.
  let lead = false, mates = null;
  try {
    lead = !!feature?.exposed?.leadingIds?.()?.includes?.(doc?.id);
    if (lead) mates = new Set(feature?.exposed?.groupMembers?.(doc.id)?.ids ?? []);
  } catch (err) { log?.debug?.("taken: the leader", err); }
  const circles = claims.filter(c => c.id !== doc?.id);
  const walkers = [];                        // where tokens still walking are drawn now (not at rest: soft)
  const all = typeof scene?.tokens?.values === "function" ? [...scene.tokens.values()] : [];
  for (const o of all) {
    if (!o?._source || o.id === doc.id || skip.has(o.id)) continue;
    if (o.hidden && !game.user?.isGM) continue;
    if (src.level !== undefined && o._source.level !== undefined && o._source.level !== src.level) continue;
    const ow = o._source.width ?? 1, oh = o._source.height ?? 1, orr = radiusOf(ow, oh) * s;
    const t = o.object;
    let walking = false;
    try { walking = !!t && !t.destroyed && movementFacts(t).animating; } catch { walking = false; }
    // One of this screen's own walkers counts where it is drawn, not where it is going (0.10 L3): if its way comes
    // into where this stop rests a token, the same stop stops it too (stopAlso).
    if (!(walking && o.movement?.user?.isSelf)) circles.push({ x: o._source.x + (ow * s) / 2, y: o._source.y + (oh * s) / 2, r: orr, id: o.id });
    // One still walking: where it is drawn now counts too.
    try {
      if (walking) {
        const d = drawnPosition(t);
        walkers.push({ x: d.x + (ow * s) / 2, y: d.y + (oh * s) / 2, r: orr });
      }
    } catch (err) { log?.debug?.("taken: a walking token", err); }
  }
  // Where this client's members still waiting for their wave will rest (0.10 L3).
  let pend = [];
  try { pend = feature?.exposed?.groupPendingEnds?.() ?? []; } catch (err) { log?.debug?.("taken: the pending waves", err); }
  for (const e of pend) {
    if (e.id === doc?.id || skip.has(e.id)) continue;
    const m = scene?.tokens?.get?.(e.id);
    const ow = m?._source?.width ?? 1, oh = m?._source?.height ?? 1;
    circles.push({ x: e.x + (ow * s) / 2, y: e.y + (oh * s) / 2, r: radiusOf(ow, oh) * s, id: e.id });
  }
  // Where this client's other stops are carrying tokens on to (0.10 L3).
  const tnow = Date.now();
  for (const [id, wo] of walkingOn) {
    if (tnow - wo.at > WALK_ON_MS) { walkingOn.delete(id); continue; }
    if (id === doc?.id || skip.has(id)) continue;
    circles.push({ x: wo.x + (wo.w * s) / 2, y: wo.y + (wo.h * s) / 2, r: radiusOf(wo.w, wo.h) * s, id });
  }
  // Where this client has just sent a mate, its write not back yet (drop.mjs groupInFlight).
  let flying = [];
  try { flying = feature?.exposed?.groupInFlight?.() ?? []; } catch (err) { log?.debug?.("taken: in flight", err); }
  for (const f of flying) {
    if (f.id === doc?.id || skip.has(f.id)) continue;
    circles.push({ x: f.x + (f.width * s) / 2, y: f.y + (f.height * s) / 2, r: radiusOf(f.width, f.height) * s });
  }
  const inside = list => p => {
    const cx = p.x + (w * s) / 2, cy = p.y + (h * s) / 2;
    return list.some(c => Math.hypot(cx - c.x, cy - c.y) < r + c.r - 1);
  };
  const taken = p => inside(circles)(p) || inside(walkers)(p);
  // A token at rest (where the server has it) or a spot this stop already gave out: never rest inside one (0.9.0).
  taken.resting = inside(circles);
  // Into a token at rest it was not inside at `from`: walking on would take it through that token.
  const within = (c, p) => Math.hypot(p.x + (w * s) / 2 - c.x, p.y + (h * s) / 2 - c.y) < r + c.r - 1;
  // (0.10 L3, simulator seed 4491: a brush at `from`, within 0.05 square, is not inside: a walk on that set off brushing
  // one went on through it.)
  const deep = (c, p) => Math.hypot(p.x + (w * s) / 2 - c.x, p.y + (h * s) / 2 - c.y) < r + c.r - 0.05 * s;
  taken.enters = (from, p) => circles.some(c => !mates?.has(c.id) && within(c, p) && !deep(c, from));
  taken.lead = lead;
  return taken;
}

/** The circle (pixels) a stop at `at` claims for token `t` (with the token and its stop, for makeRoom). */
function claimOf(t, at) {
  const d = t.document, s = gridSize(t), w = d._source.width ?? 1, h = d._source.height ?? 1;
  return { id: d.id, x: at.p.x + (w * s) / 2, y: at.p.y + (h * s) / 2, r: radiusOf(w, h) * s, token: t, at };
}

/**
 * A token of a stop with no clear spot along its own way, drawn inside members this same stop already rested and
 * nothing else (0.10 L3, the simulator's door cuts of a file: the one behind had a door shut behind it), rests where it
 * is drawn when each of those can be carried on along its own way clear of it (one more walk on each; never through a
 * wall or a token at rest). `claims`: the stop's. True when done.
 */
function makeRoom(token, at, taken, claims, skip) {
  const doc = token.document;
  const s = gridSize(token);
  const w = doc._source.width ?? 1, h = doc._source.height ?? 1, r = radiusOf(w, h) * s;
  const c = { x: at.drawn.x + (w * s) / 2, y: at.drawn.y + (h * s) / 2 };
  if (doorwayAt(token, c)) return false;
  const ys = claims.filter(k => k.id !== doc.id && Math.hypot(c.x - k.x, c.y - k.y) < r + k.r - 1);
  if (!ys.length || ys.some(y => !y.token || !y.at?.drawn)) return false;
  // Inside anything but those members (a token at rest, a spot given out elsewhere): no.
  const rest = takenAround(token, new Set([...skip, ...ys.map(y => y.id)]), claims.filter(k => !ys.includes(k)));
  if (rest.resting(at.drawn)) return false;
  const me = { id: doc.id, x: c.x, y: c.y, r };
  const moves = [];
  for (const y of ys) {
    const yt = y.token;
    let way = y.at.way ?? null;
    if (!way) {
      const m = yt.document.movement;
      const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])]
        .filter(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
      const k = routeAhead(all, y.at.drawn, { near: 0.05 * s, end: 0.5 });
      way = { ahead: k === null ? [] : all.slice(k), behind: (k === null ? all : all.slice(0, k)).reverse() };
    }
    const ty = takenAround(yt, skip, [...claims.filter(k => k !== y), me]);
    const again = alongWay(yt, y.at.drawn, way, ty);
    if (!again) return false;
    moves.push({ y, again, way });
  }
  for (const { y, again, way } of moves) {
    const yw = y.token.document._source.width ?? 1, yh = y.token.document._source.height ?? 1;
    y.at.p = { ...y.at.drawn, x: again.p.x, y: again.p.y };
    y.at.near = { x: y.at.drawn.x, y: y.at.drawn.y };
    y.at.via = again.via;
    y.at.way = way;
    y.x = again.p.x + (yw * s) / 2; y.y = again.p.y + (yh * s) / 2;
    walkingOn.set(y.id, { x: again.p.x, y: again.p.y, w: yw, h: yh, at: Date.now() });
  }
  return true;
}

/**
 * One token of a stop out of combat: where stopSpot puts it, or (0.10 L2 fix (a), R8) when that is inside a token at
 * rest with no clear spot along its own way, not stopped at all unless a wall cut it (`wall`): it walks on to the end
 * of its own move (where the document already is), named, when that end is clear; else it stays where it is drawn,
 * named (displace). A stop never rests two tokens inside each other when it can help it, and never searches
 * (decision 2). The claim of where it rests goes to `claims`. Returns the displace's promise, or null (walks on).
 */
function stopOne(token, taken, claims, { wall = false, rec = null, skip = null } = {}) {
  const at = stopSpot(token, taken);
  if (at.near && rec) rec.pastDoor = (rec.pastDoor ?? 0) + 1;
  // Inside only members this stop rested: they make room along their own ways, and it rests where it is drawn.
  if (at.inside) {
    let room = false;
    try { room = makeRoom(token, at, taken, claims, skip ?? new Set([token.document.id])); } catch (err) { log?.debug?.("stop: make room", err); }
    if (room) { at.inside = false; if (rec) rec.madeRoom = (rec.madeRoom ?? 0) + 1; }
  }
  if (at.inside && !wall) {
    const end = token.document._source;
    if (end && !taken.resting({ x: end.x, y: end.y })) {
      claims.push(claimOf(token, { p: { x: end.x, y: end.y } }));
      try { feature.exposed.groupTellStayed?.([token.document], "walkedOn", "walkedOn"); } catch (err) { log?.debug?.("stop: name it", err); }
      return null;
    }
  }
  claims.push(claimOf(token, at));
  return displace(token, at);
}

/**
 * Stop `token` out of combat where it is drawn (stopSpot: carried on just clear of a door's line, a token at rest or
 * a spot this same stop gave out). `group` ({ skip: Set of ids, claims: [], wall? }) is shared by every token one
 * stop stops (a wall cut, the dragger's screen stopping the rest of its group), so none rests inside another; `wall`:
 * a wall or door cut it (it cannot walk on).
 */
function displaceIn(token, group = null) {
  const skip = group?.skip ?? new Set([token.document.id]);
  const claims = group?.claims ?? [];
  return stopOne(token, takenAround(token, skip, claims), claims, { wall: !!group?.wall, skip });
}

/**
 * Tokens one stop settles, in the order it settles them (0.10 L3, motion-core stopOrder): the front ones first, so a
 * packed file is never rested back to front (the one in front finding the ones behind carried into its way). The
 * direction is the token's own route ahead of where it is drawn.
 */
const STOP_NEAR = 1.5;                       // squares: two this near each other settle front first (stopOrder's margin)
function orderForStop(tokens) {
  if (tokens.length < 2) return tokens;
  try {
    const items = tokens.map(t => {
      const doc = t.document, s = gridSize(t), w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
      const drawn = drawnPosition(t);
      const m = doc.movement;
      const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])]
        .filter(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
      const k = routeAhead(all, drawn, { near: 0.05 * s, end: 0.5 });
      const next = k === null ? null : all.slice(k).find(p => Math.hypot(p.x - drawn.x, p.y - drawn.y) > 1e-6);
      const L = next ? Math.hypot(next.x - drawn.x, next.y - drawn.y) : 0;
      return { id: doc.id, at: { x: drawn.x + (w * s) / 2, y: drawn.y + (h * s) / 2 }, r: radiusOf(w, h) * s,
        dir: L > 1e-9 ? { x: (next.x - drawn.x) / L, y: (next.y - drawn.y) / L } : null };
    });
    const by = new Map(tokens.map(t => [t.document.id, t]));
    return stopOrder(items, { margin: STOP_NEAR * gridSize(tokens[0]) }).map(id => by.get(id)).filter(Boolean);
  } catch (err) { log?.debug?.("stop: the order", err); return tokens; }
}

/** A walking token's way left (centres, pixels): where it is drawn, then its route's corners ahead. */
function wayLeft(t) {
  const doc = t.document, s = gridSize(t), w = doc._source?.width ?? 1, h = doc._source?.height ?? 1;
  const c = p => ({ x: p.x + (w * s) / 2, y: p.y + (h * s) / 2 });
  const drawn = drawnPosition(t);
  const m = doc.movement;
  const all = [m?.origin, ...(m?.passed?.waypoints ?? []), ...(m?.pending?.waypoints ?? [])]
    .filter(p => p && !p.intermediate && Number.isFinite(p.x) && Number.isFinite(p.y));
  const k = routeAhead(all, drawn, { near: 0.05 * s, end: 0.5 });
  return [c(drawn), ...(k === null ? [] : all.slice(k).map(c))];
}

/**
 * The same stop for this screen's own walkers whose way left comes into a spot it rests a token on, or that are
 * inside one now (0.10 L3; the simulator's door cut of a leader in front: a mate walked on onto it). Front first, until
 * none is left (each one stopped claims its spot too). `group`: the stop's { skip, claims, wall? }. Out of combat
 * only. The ids stopped.
 */
function stopAlso(group) {
  const out = [];
  const scene = globalThis.canvas?.scene;
  for (let round = 0; round < 6; round++) {
    const add = [];
    for (const o of scene?.tokens?.values?.() ?? []) {
      const t = o?.object;
      if (!t || t.destroyed || group.skip.has(o.id) || !o.movement?.user?.isSelf || !o.isOwner || inCombat(o)) continue;
      let walking = false;
      try { walking = movementFacts(t).animating; } catch { walking = false; }
      if (!walking) continue;
      try {
        const s = gridSize(t), r = radiusOf(o._source.width ?? 1, o._source.height ?? 1) * s;
        const cs = group.claims.filter(c => c.id !== o.id).map(c => ({ ...c, r: c.r - 0.05 * s }));
        const way = wayLeft(t);
        if (cs.some(c => Math.hypot(way[0].x - c.x, way[0].y - c.y) < r + c.r) || firstIntrusion(way, r, cs)) add.push(t);
      } catch (err) { log?.debug?.("stop: also", err); }
    }
    if (!add.length) break;
    for (const t of add) group.skip.add(t.document.id);
    for (const t of orderForStop(add)) {
      try { displaceIn(t, group); out.push(t.document.id); } catch (err) { log?.debug?.("stop: also", err); }
    }
  }
  return out;
}

/** Does this user own the token (a GM owns all)? */
function owns(token) {
  try { return !!(token.document.testUserPermission?.(game.user, "OWNER") ?? token.document.isOwner); } catch { return false; }
}

/**
 * Stop `token` by the table's decision `how`, and with it the rest of its group (decision 3 as revised 2026-11-24): on
 * the client that sent the group every member (its unsent waves and fight queue go too); elsewhere the one clicked,
 * the dragger's screen stopping the rest (every member this user owns when the dragger is gone). Out of combat each
 * stops exactly where it is drawn (one in a doorway just past the door's line); in a fight each finishes the square it
 * is in. Returns the stops' promises.
 */
function stopToken(token, how, via = "api") {
  const doc = token.document;
  // `via`: what asked (click, board, door, api), for status().stop (live H4-03: a token stopped with no record of why).
  // A member whose wave was on its way when its group was stopped is file.mjs's (lateStops), not a record here.
  const rec = (lastStop = { at: new Date().toISOString(), tokenId: doc.id, name: doc.name ?? null, how, via });
  try { feature.exposed.tele?.("stop", { reason: via, how, id: doc.id }); } catch (err) { log?.debug?.("stop: telemetry", err); }
  if (how === "query") return [act(token, how)];
  let held = false, ids = [], sender = null;
  try { ({ held, ids, sender = null } = feature.exposed.groupMembers?.(doc.id) ?? { held: false, ids: [] }); } catch (err) { log?.debug?.("group members", err); }
  const scene = doc.parent;
  const others = ids.filter(id => id !== doc.id).map(id => scene?.tokens?.get(id)?.object).filter(t => t && !t.destroyed);
  const whole = others.every(owns);
  // Not the dragger's: the dragger's screen stops the rest when it sees this stop, unless it is gone.
  const draggerHere = !held && !!sender && game.users?.get?.(sender)?.active !== false && sender !== game.user?.id;
  const list = draggerHere ? [token] : [token, ...others.filter(owns)];
  // The dragger's client: the whole group, its unsent waves and its fight queue too.
  if (held) { try { feature.exposed.groupCancel?.(doc.id, { why: "click" }); } catch (err) { log?.debug?.("stop the group", err); } }
  // Only the ones this stop stops leave the others' reckoning (they count by their claims); a mate at rest still
  // counts where it stands (0.9.0 simulator, step 5: one was skipped, and a member stopped inside it).
  const acts = list.map(t => ({ t, next: t === token ? how : decide(t, { tool: "select", armed: true }) }))
    .filter(x => x.next === "displace" || x.next === "stop");
  const skip = new Set(acts.map(x => x.t.document.id));
  const claims = [];
  const out = [];
  // The front ones first (0.10 L3); a fight's stops (stopMovement) in any order.
  const front = orderForStop(acts.filter(x => x.next === "displace").map(x => x.t));
  const rank = new Map(front.map((t, k) => [t.document.id, k]));
  acts.sort((a, b) => (rank.get(a.t.document.id) ?? -1) - (rank.get(b.t.document.id) ?? -1));
  for (const { t, next } of acts) {
    const tdoc = t.document;
    if (next === "displace") {
      const p = stopOne(t, takenAround(t, skip, claims), claims, { rec, skip });
      if (p) out.push(p);
      else rec.walkedOn = (rec.walkedOn ?? 0) + 1;
    } else {
      out.push(act(t, next));
    }
  }
  // This screen's other walkers whose way comes into a spot this stop rests a token on stop too (0.10 L3).
  if (acts.some(x => x.next === "displace")) {
    try { rec.also = stopAlso({ skip, claims }).length; } catch (err) { log?.debug?.("stop: also", err); }
  }
  rec.members = out.length;
  rec.whole = held || draggerHere || whole;
  if (list.length > 1 || held || draggerHere) {
    try { feature.exposed.groupNoteStop?.({ why: "click", members: out.length, whole: rec.whole }); } catch (err) { log?.debug?.("note the stop", err); }
  }
  return out;
}

function onClick(token, event) {
  lastNative = event?.nativeEvent ?? null;
  const how = decide(token, {
    modifiers: !!(event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey),
  });

  if (how) stopToken(token, how, "click");
}

/* -------------------------------------------- */
/*  The board fallback                          */
/* -------------------------------------------- */

/**
 * The moving token this client would stop at canvas point `p`: the nearest whose drawn circle
 * (its derived x / y: where the tween has it now) holds `p` and that the click table stops.
 * @returns {{ token, how } | null}
 */
export function movingTokenAt(p, { modifiers = false, slack = 0 } = {}) {
  let best = null, bestD = Infinity;
  for (const t of globalThis.canvas?.tokens?.placeables ?? []) {
    const doc = t?.document;
    if (!doc || t.isPreview || t.destroyed) continue;
    const s = gridSize(t);
    const w = doc._source?.width ?? doc.width ?? 1, h = doc._source?.height ?? doc.height ?? 1;
    const at = drawnPosition(t);
    const d = Math.hypot(p.x - (at.x + (w * s) / 2), p.y - (at.y + (h * s) / 2));
    if (d > (Math.max(w, h) * s) / 2 + slack * s || d >= bestD) continue;
    const how = decide(t, { modifiers });
    if (!how) continue;
    best = { token: t, how };
    bestD = d;
  }
  return best;
}

/** A pointerdown on the board the click wrap did not see: stop the moving token drawn under it. */
function onBoardDown(ev) {
  try {
    if (ev?.button !== 0 || !feature) return;
    if (lastNative && (lastNative === ev || (lastNative.timeStamp === ev.timeStamp && lastNative.type === ev.type))) return;
    const cv = globalThis.canvas;
    if (!cv?.ready || !cv.tokens?.active || typeof cv.canvasCoordinatesFromClient !== "function") return;
    const p = cv.canvasCoordinatesFromClient({ x: ev.clientX, y: ev.clientY });
    const hit = movingTokenAt(p, { modifiers: !!(ev.shiftKey || ev.ctrlKey || ev.metaKey || ev.altKey) });
    if (!hit) return;
    stopToken(hit.token, hit.how, "board");
    if (lastStop) lastStop.point = { x: Math.round(p.x), y: Math.round(p.y) };
    // As the click would have: the stopped token is selected (the canvas click just released the rest).
    if (!hit.token.controlled) hit.token.control?.({ releaseOthers: true });
  } catch (err) {
    log?.warnOnce("stop-board", "click to stop (board) skipped (further errors suppressed)", err);
  }
}

/** Listen on the board element (once per element; the app's view outlives every scene). */
function listenBoard() {
  const el = globalThis.canvas?.app?.view ?? null;
  if (!el || el === board || typeof el.addEventListener !== "function") return;
  unlistenBoard();
  el.addEventListener("pointerdown", onBoardDown);
  board = el;
}

function unlistenBoard() {
  try { board?.removeEventListener?.("pointerdown", onBoardDown); } catch (err) { log?.debug?.("board listener", err); }
  board = null;
}

/* -------------------------------------------- */
/*  The wrap                                    */
/* -------------------------------------------- */

/**
 * Every client: Token#stopAnimation empties each tween's queued links before core terminates them
 * (defuse). Core's own stopAnimation({ reset: false }) for an unanimated update (a stop's displace seen
 * by another client) left the links queued, and the terminated tween's last frame resumed one with no
 * context: the same TypeError "reading 'chain'" as D-4, now on the observing client (live R4-4). Core
 * resolves the links itself; this only empties the list first.
 */
function patchStopAnimation() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?.stopAnimation !== "function") {
    log.warn("no Token#stopAnimation; a stop seen by another client may log core's 'chain' TypeError");
    return null;
  }
  return wrapMethod(MODULE, {
    target: proto, name: "stopAnimation", label: "Token#stopAnimation",
    marker: "__pentarynMovementDefuse", adjustments: "movement-stop-animation-defuse",
  }, function (wrapped, ...args) {
    try { defuse(this); } catch (err) { log?.debug?.("defuse (stopAnimation)", err); }
    return wrapped(...args);
  });
}

/**
 * A left press on a door's icon while a token this client could stop is drawn under the pointer stops
 * the token and leaves the door alone (live R5-3: clicking a token as it crossed a door hit the door's
 * icon, which sits above the tokens, and shut the door on it; 8 of 8 runs). A press on the icon with no
 * moving token under it is core's toggle, as before; so is a token at rest on the icon. A capture-phase
 * listener on the canvas stage runs before the icon's own handler and, for a press whose target is a door
 * icon, stops the event there (a capture listener on canvas.controls.doors itself is never called on
 * core 14 / PIXI 7.4: checked live). Not a wrap of DoorControl#_onMouseDown: libWrapper keeps such a wrap innermost,
 * under another module's async wrapper (Monk's Active Tile Triggers), so it ran a frame late, after the
 * token had moved on, and the door still toggled (BOSS, 0.4.5 first build).
 */
function onDoorDown(event) {
  try {
    if (event?.button !== 0 || !feature) return;
    const DoorControl = globalThis.foundry?.canvas?.containers?.DoorControl;
    if (DoorControl && !(event.target instanceof DoorControl)) return;
    const tokens = globalThis.canvas?.tokens;
    let p = null;
    try { p = event.getLocalPosition?.(tokens) ?? null; } catch { p = null; }
    if (!p && Number.isFinite(event?.clientX)) p = globalThis.canvas?.canvasCoordinatesFromClient?.({ x: event.clientX, y: event.clientY }) ?? null;
    // Right beside it counts too (live R7-3: a press on the icon with the token's centre 50-80 px short
    // of it, under a tween a frame ahead of the pointer, still shut the door in 2 of 5 runs).
    const hit = p ? movingTokenAt(p, { modifiers: !!(event.shiftKey || event.ctrlKey || event.metaKey || event.altKey), slack: DOOR_SLACK }) : null;
    if (!hit) return;
    event.stopPropagation?.();                    // the icon's own handler never sees it: no toggle
    lastNative = event.nativeEvent ?? null;       // the board fallback leaves this press alone
    stopToken(hit.token, hit.how, "door");
    if (!hit.token.controlled) hit.token.control?.({ releaseOthers: true });
  } catch (err) { log.warnOnce("stop-door", "click to stop over a door skipped (further errors suppressed)", err); }
}

/** How far beyond a moving token's drawn circle a press on a door icon still stops it (squares). */
const DOOR_SLACK = 0.9;

/** The stage this client listens on for door icon presses. */
let doorLayer = null;
function listenDoors() {
  const c = globalThis.canvas?.stage ?? null;
  if (!c || typeof c.addEventListener !== "function") return;
  // The stage outlives a scene, but a canvas draw clears its listeners: add again on every canvasReady.
  unlistenDoors();
  c.addEventListener("pointerdown", onDoorDown, { capture: true });
  doorLayer = c;
}
function unlistenDoors() {
  try { doorLayer?.removeEventListener?.("pointerdown", onDoorDown, { capture: true }); } catch (err) { log?.debug?.("door listener", err); }
  doorLayer = null;
}

/**
 * Every client: CanvasAnimation.animate keeps the animation registered under its name that is actually
 * running (live H1-01, H1-02). Core registers an animation (`animations[name] = animation`) only after its
 * promise executor has run the first frame synchronously. A token's chained movement tween whose first
 * frame already completes it (a slow page: one 300-900 ms frame covers a whole segment) completes there and
 * starts the next link, which registers itself under the same name; then the outer call overwrites that
 * registration with its own, already completed, animation. The running link is registered nowhere, so
 * every later terminateAnimation(name) (stopAnimation, the next movement) misses it: it walks on after a
 * stop (a door cut drew the token on through the shut door, then the rest check snapped it back), writes
 * its frames onto the document, and when it ends with links still queued it resumes one whose context
 * is gone: core's TypeError "reading 'chain'", the token left frozen off its server position. After the
 * outer call, the name points back at the newest nested animation of that name while it still runs.
 */
const ANIM_LIVE = new Set([0, 1]);                 // CanvasAnimation.STATES.WAITING, RUNNING
const animFrames = [];
function patchCanvasAnimate() {
  const CA = globalThis.foundry?.canvas?.animation?.CanvasAnimation;
  if (typeof CA?.animate !== "function") {
    log.warn("no CanvasAnimation.animate; a stop on a slow page may miss a running tween");
    return null;
  }
  return wrapMethod(MODULE, {
    target: CA, name: "animate", label: "CanvasAnimation.animate",
    marker: "__pentarynMovementAnimReg", adjustments: "movement-canvas-animation-registration",
  }, function (wrapped, attributes, options = {}) {
    const name = options?.name;
    if (name === undefined || name === null) return wrapped(attributes, options);
    const frame = { name, nested: null };
    const began = clock();
    animFrames.push(frame);
    let out;
    try { out = wrapped(attributes, options); }
    finally { animFrames.pop(); }
    try { firstFrameFrom(this, this.animations?.[name], options, began); } catch (err) { log?.debug?.("animation first frame", err); }
    try {
      const reg = this.animations;
      const live = a => !!a && ANIM_LIVE.has(a.state);
      if (reg && frame.nested && frame.nested !== reg[name] && live(frame.nested) && !live(reg[name])) reg[name] = frame.nested;
      const outer = animFrames.findLast?.(f => f.name === name) ?? [...animFrames].reverse().find(f => f.name === name);
      if (outer && reg) outer.nested = reg[name];
    } catch (err) { log?.debug?.("animation registration", err); }
    return out;
  });
}

/**
 * S2R3-02: core adds a tween's ticker listener between frames (after its first frame ran synchronously), and the
 * first frame it then gets is the whole interval since the frame before: time from before the tween existed. On a
 * page stalling 415-684 ms a frame, a member whose move arrived just after a stalled frame was drawn up to that much
 * further on than its walk, onto the member before it in the file (-51 px for 2.3 s) while the others, already
 * walking, were credited only their own time. A fresh movement tween (`animation`, just registered by core; not a
 * chained link, whose carried time core already counts, nor any other animation) is credited at most the wall time
 * since it began in its first ticker frame (frames under 50 ms over are left alone); later frames are core's.
 */
const FIRST_FRAME_SLACK_MS = 50;
function firstFrameFrom(CA, animation, options, began) {
  const token = options?.context;
  if (!animation || typeof animation.fn !== "function" || animation.__pentarynFirstFrame) return;
  if (!token || options.name !== token.movementAnimationName || (options.time ?? 0) !== 0) return;
  if (!ANIM_LIVE.has(animation.state)) return;
  const fn = animation.fn;
  const fpms = globalThis.PIXI?.Ticker?.targetFPMS ?? 0.06;
  let first = true;
  animation.__pentarynFirstFrame = true;
  animation.fn = delta => {
    if (first) {
      first = false;
      const speed = CA.ticker?.speed ?? 1;
      const most = Math.max(0, clock() - began) * speed;
      if (delta / fpms > most + FIRST_FRAME_SLACK_MS) {
        firstFrameCuts += 1;
        delta = most * fpms;
      }
    }
    return fn(delta);
  };
}
let firstFrameCuts = 0;

function patchClick() {
  const proto = CONFIG.Token?.objectClass?.prototype;
  if (typeof proto?._onClickLeft !== "function") {
    log.warn("no Token#_onClickLeft; click to stop disabled");
    return false;
  }
  clickHandle = wrapMethod(MODULE, {
    target: proto, name: "_onClickLeft", label: "Token#_onClickLeft",
    marker: "__pentarynMovementStop", adjustments: "movement-click-stop",
  }, function (wrapped, event) {
    try { onClick(this, event); }
    catch (err) { log.warnOnce("stop", "click to stop skipped (further errors suppressed)", err); }
    return wrapped(event);
  });
  return true;
}

/* -------------------------------------------- */
/*  API                                         */
/* -------------------------------------------- */

/**
 * stop(ref): stop a token as a click would. Through the relay (`qctx` set, on the active GM): only
 * when this client started the move and the sender owns the token, and only that token.
 */
async function stop(doc, opts = {}, qctx = null) {
  if (qctx?.user) {
    if (!doc?.testUserPermission?.(qctx.user, "OWNER")) return { ok: false, code: "NOT_OWNER", reason: "the sender does not own that token" };
    if (!doc.movement?.user?.isSelf) return { ok: false, code: "NOT_INITIATOR", reason: "this client did not start that move" };
    // A click on any member stops the whole group (decision 3 as revised 2026-11-24): its fight queue empties too.
    feature.exposed.groupCancel?.(doc.id, { why: "click" });
    return { ok: await stopSafely(doc), how: "stop", tokenId: doc.id };
  }
  const token = doc?.object;
  if (!token) return { ok: false, code: "NOT_DRAWN", reason: "the token is not drawn on this canvas" };
  const how = decide(token, { tool: "select", armed: true });
  if (!how) return { ok: false, code: "NOT_MOVING", reason: "the token is not moving, or you cannot control it" };
  const results = await Promise.all(stopToken(token, how, "api"));
  const r = results[0];
  if (how === "query") return r?.ok ? { ...r } : { ok: false, code: r?.code ?? "NO_ANSWER", reason: r?.reason ?? "the client that started the move did not stop it" };
  return { ok: true, how, tokenId: doc.id };
}

/**
 * STOP_OWN, on the client that started a move: a GM asks it to stop that token (only that one, H1-05).
 * Only a GM sender; only a move this client started.
 */
async function stopOwn(data = {}, qctx = {}) {
  const sender = qctx?.user ?? null;
  if (!sender?.isGM) return { ok: false, code: "NOT_GM", reason: "only a GM may ask" };
  let doc = null;
  try { doc = typeof data?.ref === "string" ? globalThis.fromUuidSync?.(data.ref) ?? null : null; } catch { doc = null; }
  if (doc?.documentName !== "Token") return { ok: false, code: "NOT_FOUND", reason: "no such token" };
  if (!doc.movement?.user?.isSelf) return { ok: false, code: "NOT_INITIATOR", reason: "this client did not start that move" };
  // A GM owns every member: the whole group this client sent stops with it (decision 3).
  let ids = [];
  try { ids = feature?.exposed?.groupCancel?.(doc.id) ?? []; } catch (err) { log?.debug?.("stop the group", err); }
  let ok = false;
  const stopped = [];
  for (const id of new Set([doc.id, ...ids])) {
    const d = id === doc.id ? doc : doc.parent?.tokens?.get(id);
    if (!d) continue;
    if (id !== doc.id && (!d.movement?.user?.isSelf || d.movement.state === "completed" || d.movement.state === "stopped")) continue;
    const r = await stopSafely(d);
    if (r && id === doc.id) ok = true;
    stopped.push(id);
  }
  lastStop = { at: new Date().toISOString(), tokenId: doc.id, how: "stopOwn", by: sender.id ?? null };
  if (ids.length) { try { feature?.exposed?.groupNoteStop?.({ why: "gm", members: stopped.length, whole: true }); } catch (err) { log?.debug?.("note the stop", err); } }
  return { ok, how: "stop", tokenId: doc.id };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  const wrapAll = () => { clickPatched = patchClick(); defuseHandle = patchStopAnimation(); animHandle = patchCanvasAnimate(); };
  if (ctx.late) wrapAll();
  else reg.once("setup", wrapAll, { guard: false, label: "setup: wrap _onClickLeft (click to stop)" });
  reg.on("moveToken", (doc, movement) => onMoveToken(doc, movement), { label: "moveToken: when a move started (click-to-stop arming)" });
  // Every client: a stop's displace (an unanimated position write) must leave the token drawn where the
  // server has it here too, not only on the client that clicked (live R2-9: both clients showed it away
  // from its document after a stop; seen on a 3 FPS harness only). resync is a no-op when they agree.
  reg.on("updateToken", (doc, changes, options) => onUnanimatedMove(doc, changes, options), { label: "updateToken: resync after an unanimated move (stop)" });
  // After PIXI's own pointerdown listener (added when the app was made), so the wrap sees a click first.
  reg.on("canvasReady", () => { listenBoard(); listenDoors(); }, { label: "canvasReady: board pointerdown (click to stop, fallback)" });
  reg.on("refreshToken", token => { try { holdPinned(token); } catch (err) { log.debug?.("hold a stopped token", err); } },
    { label: "refreshToken: a stopped token stays drawn where it stopped until its displace lands (H4-06)" });
  if (ctx.late) { listenBoard(); listenDoors(); }
  // The kit's queries reach only the active GM (guarded / relayed both refuse a player receiver); this
  // one is sent to a named user, and checks its GM sender itself (header; exceptions.json C30, C56).
  if (globalThis.CONFIG?.queries) globalThis.CONFIG.queries[STOP_OWN] = stopOwn;
  ctx.expose({ stop, stopSafely, moveStartedAt: startedAt, stopPatched: () => clickPatched, stopLast: () => (lastStop ? { ...lastStop } : null), stopFirstFrames: () => firstFrameCuts, noteDrop, stopDisplace: displaceIn, stopOrderOf: orderForStop, stopAlso,
    stopWalkingOn: () => [...walkingOn].filter(([, wo]) => Date.now() - wo.at <= WALK_ON_MS).map(([id, wo]) => ({ id, ...wo })) });
}

export function uninstall() {
  clickHandle?.unwrap();
  clickHandle = null;
  defuseHandle?.unwrap();
  defuseHandle = null;
  animHandle?.unwrap();
  animHandle = null;
  animFrames.length = 0;
  unlistenDoors();
  clickPatched = false;
  lastStop = null;
  lastNative = null;
  walkingOn.clear();
  unlistenBoard();
  starts.clear();
  for (const w of watches.values()) clearTimeout(w.timer);
  watches.clear();
  if (globalThis.CONFIG?.queries?.[STOP_OWN] === stopOwn) delete globalThis.CONFIG.queries[STOP_OWN];
  feature = null;
}
