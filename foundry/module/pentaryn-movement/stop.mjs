/**
 * Pentaryn Movement — the feature: click to stop (0.4.0, plan context/plans/pathfinding-2026-11.md
 * §12 "Click-to-stop", §13). A left click on a token that is moving stops it, then selects it as
 * usual; a double click's second press finds it stopped and opens the sheet.
 *
 * GLUE, one feature. Wraps Token#_onClickLeft on the configured token class. What a click does is
 * motion-core's clickStop table:
 *   displace  out of combat: the token is put where it is drawn (animate: false, the displace action:
 *             no walls, no cost, nothing recorded outside combat). Any owner may; the move's own
 *             continuation sees a newer movement and gives up.
 *   stop      in combat, this client started the move: stopMovement(). The token finishes the cell it
 *             is in (the drop committed a checkpoint at every cell, group.mjs), and dnd5e records
 *             exactly the cells walked. Never a displace in combat.
 *   query     in combat, another user started it. A player asks the active GM (the kit's relay
 *             row `stop`), which stops it when it is the one that started the move. A GM asks the
 *             user who started it directly (STOP_OWN, a hand-written CONFIG.queries handler: the
 *             kit's queries only reach the active GM; exceptions.json C56, Fable's verdict
 *             2026-11-21 "let the GM stop any move in combat"). 400 ms, and on any failure nothing
 *             happens.
 * A click is armed only once the move has run MOTION.armMs (400 ms): the click that follows a drop
 * out of habit, or the first press of a double click, is core's own (Fable's verdict). The start is
 * when this client saw the drop (noteDrop) or the move's first moveToken; a move it never saw start
 * is armed. The API's stop() is never held back.
 * When the client that sent a group stops one member, only that member stops (live H1-05); the others
 * walk round it out of combat (group.mjs groupStopOne).
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
import { MOTION, clickStop } from "./motion-core.mjs";
import { clearOfWalls, continuationInFlight, drawnPosition, gridSize, inCombat, movementFacts, stopWhereDrawn } from "./group-adapter.mjs";
import { setting } from "./settings.mjs";
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

/** This client dropped these tokens just now (group.mjs, every drop). */
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
  starts.set(doc.id, { id: first, at: clock() });
  if (starts.size > 500) starts.delete(starts.keys().next().value);
}

/** ms since this token's current move started, Infinity when this client never saw it start. */
function elapsedOf(doc) {
  const rec = starts.get(doc?.id);
  if (!rec) return Infinity;
  const first = firstIdOf(doc.movement);
  if (rec.id && first && rec.id !== first) return Infinity;
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
    const links = Array.isArray(ctx?.chain) ? ctx.chain.splice(0) : [];
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
 * Put a token where it is drawn, out of combat (one frame here: the tween stops before the write).
 * When the write is refused or fails, the token is put back where the server has it (a full
 * stopAnimation resets it to its source), so this client never shows it frozen somewhere it is not.
 * When it succeeds, the drawn position is checked against the source once the write is in and again
 * RESYNC_MS later (resync).
 */
/** Where a click-stop out of combat puts a token: where it is drawn, or the nearest clear cell (live R4-5). */
function stopSpot(token) {
  const drawn = drawnPosition(token);
  let p = drawn;
  try { p = clearOfWalls(token, p); } catch (err) { log?.debug?.("clearOfWalls", err); }
  return { drawn, p };
}

function displace(token, at = stopSpot(token)) {
  const doc = token.document;
  // Never at rest inside a solid wall: stopped in a doorway, it steps onto the nearest clear cell (live R4-5).
  const { drawn, p } = at;
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
  const wp = { x: p.x, y: p.y, elevation: p.elevation, action: "displace", snapped: false, explicit: true, checkpoint: true };
  const reset = () => {
    try { if (!token.destroyed) token.stopAnimation?.(); } catch (err) { log.debug?.("stopAnimation reset", err); }
  };
  let pending;
  try { pending = Promise.resolve(doc.move([wp], { animate: false, method: "api" })); }
  catch (err) { pending = Promise.reject(err); }
  return pending
    .then(moved => {
      if (moved === false) reset();
      else {
        resync(token);
        setTimeout(() => resync(token), RESYNC_MS);
      }
      return moved;
    })
    .catch(err => {
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
    enabled: !!setting("clickToStop"), tool, modifiers, canControl,
    state: facts.state, animating: facts.animating, combat: inCombat(doc), initiatorSelf: facts.initiatorSelf,
    elapsed: armed ? Infinity : elapsedOf(doc),
  });
}

/**
 * Stop `token`, and only it (live H1-05: a click on one member froze the whole group mid-room; Joe: only
 * the clicked one stops). When this client sent its group, that member leaves it; out of combat the
 * others still walking through where it now rests walk round it (group.mjs groupStopOne).
 */
function stopToken(token, how) {
  const doc = token.document;
  lastStop = { at: new Date().toISOString(), tokenId: doc.id, how };
  if (how === "displace") {
    const at = stopSpot(token);
    const out = [displace(token, at)];
    try { lastStop.rerouted = feature.exposed.groupStopOne?.(doc.id, at.p)?.length ?? 0; } catch (err) { log?.debug?.("stop one", err); }
    return out;
  }
  if (how === "stop") { try { feature.exposed.groupStopOne?.(doc.id, null); } catch (err) { log?.debug?.("stop one", err); } }
  return [act(token, how)];
}

function onClick(token, event) {
  lastNative = event?.nativeEvent ?? null;
  const how = decide(token, {
    modifiers: !!(event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey),
  });
  if (how) stopToken(token, how);
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
    stopToken(hit.token, hit.how);
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
    if (event?.button !== 0 || !feature || !setting("clickToStop")) return;
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
    stopToken(hit.token, hit.how);
    if (!hit.token.controlled) hit.token.control?.({ releaseOthers: true });
  } catch (err) { log.warnOnce("stop-door", "click to stop over a door skipped (further errors suppressed)", err); }
}

/** How far beyond a moving token's drawn circle a press on a door icon still stops it (squares). */
const DOOR_SLACK = 0.4;

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
    animFrames.push(frame);
    let out;
    try { out = wrapped(attributes, options); }
    finally { animFrames.pop(); }
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
    feature.exposed.groupCancel?.(doc.id, { only: true });
    return { ok: await stopSafely(doc), how: "stop", tokenId: doc.id };
  }
  const token = doc?.object;
  if (!token) return { ok: false, code: "NOT_DRAWN", reason: "the token is not drawn on this canvas" };
  const how = decide(token, { tool: "select", armed: true });
  if (!how) return { ok: false, code: "NOT_MOVING", reason: "the token is not moving, or you cannot control it" };
  const results = await Promise.all(stopToken(token, how));
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
  // Only that token (live H1-05): it leaves this client's group, the others carry on.
  try { feature?.exposed?.groupStopOne?.(doc.id, null); } catch (err) { log?.debug?.("stop one", err); }
  const ok = await stopSafely(doc);
  lastStop = { at: new Date().toISOString(), tokenId: doc.id, how: "stopOwn", by: sender.id ?? null };
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
  if (ctx.late) { listenBoard(); listenDoors(); }
  // The kit's queries reach only the active GM (guarded / relayed both refuse a player receiver); this
  // one is sent to a named user, and checks its GM sender itself (header; exceptions.json C30, C56).
  if (globalThis.CONFIG?.queries) globalThis.CONFIG.queries[STOP_OWN] = stopOwn;
  ctx.expose({ stop, stopSafely, stopPatched: () => clickPatched, stopLast: () => (lastStop ? { ...lastStop } : null), noteDrop });
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
  unlistenBoard();
  starts.clear();
  for (const w of watches.values()) clearTimeout(w.timer);
  watches.clear();
  if (globalThis.CONFIG?.queries?.[STOP_OWN] === stopOwn) delete globalThis.CONFIG.queries[STOP_OWN];
  feature = null;
}
