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
 * When the client that sent a group stops one member, the whole group stops and its unsent waves
 * are cancelled (group.mjs groupCancel).
 */

import { MODULE } from "./movement-core.mjs";
import { MOTION, clickStop } from "./motion-core.mjs";
import { drawnPosition, inCombat, movementFacts } from "./group-adapter.mjs";
import { setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { queryGM } from "./lib/queries.mjs";

let log = null;
let feature = null;
let clickHandle = null;
let clickPatched = false;
let lastStop = null;

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
 * Put a token where it is drawn, out of combat (one frame here: the tween stops before the write).
 * When the write is refused or fails, the token is put back where the server has it (a full
 * stopAnimation resets it to its source), so this client never shows it frozen somewhere it is not.
 */
function displace(token) {
  const doc = token.document;
  const p = drawnPosition(token);
  // This client's own move with checkpoints still to go: stop it first. stopAnimation resolves the
  // animation promise the continuation waits on, and that continuation would otherwise race the
  // displace to the server and carry the token on past where it was clicked (review-correctness).
  const m = doc.movement;
  if (m?.user?.isSelf && (m.state === "pending" || m.state === "paused")) {
    try { doc.stopMovement(); } catch (err) { log.debug?.("stopMovement before displace", err); }
  }
  try { token.stopAnimation?.({ reset: false }); } catch (err) { log.debug?.("stopAnimation", err); }
  const wp = { x: p.x, y: p.y, elevation: p.elevation, action: "displace", snapped: false, explicit: true, checkpoint: true };
  const resync = () => {
    try { if (!token.destroyed) token.stopAnimation?.(); } catch (err) { log.debug?.("stopAnimation reset", err); }
  };
  let pending;
  try { pending = Promise.resolve(doc.move([wp], { animate: false, method: "api" })); }
  catch (err) { pending = Promise.reject(err); }
  return pending
    .then(moved => {
      if (moved === false) resync();
      return moved;
    })
    .catch(err => {
      resync();
      log.warnOnce("stop-displace", "could not stop a token where it was drawn (further errors suppressed)", err);
    });
}

/** Stop one token by the table's decision. */
function act(token, how) {
  const doc = token.document;
  if (how === "displace") return displace(token);
  if (how === "stop") return Promise.resolve(doc.stopMovement());
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

/** Stop `token`; if this client sent its group, stop every member and cancel the unsent waves. */
function stopToken(token, how) {
  const doc = token.document;
  lastStop = { at: new Date().toISOString(), tokenId: doc.id, how };
  const group = how === "query" ? [] : (feature.exposed.groupCancel?.(doc.id) ?? []);
  const out = [act(token, how)];
  for (const id of group) {
    if (id === doc.id) continue;
    const other = doc.parent?.tokens?.get(id)?.object;
    if (!other) continue;
    const next = decide(other, { tool: "select", armed: true });
    if (next === "displace" || next === "stop") out.push(act(other, next));
  }
  return out;
}

function onClick(token, event) {
  const how = decide(token, {
    modifiers: !!(event?.shiftKey || event?.ctrlKey || event?.metaKey || event?.altKey),
  });
  if (how) stopToken(token, how);
}

/* -------------------------------------------- */
/*  The wrap                                    */
/* -------------------------------------------- */

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
    return { ok: doc.stopMovement() === true, how: "stop", tokenId: doc.id };
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
 * STOP_OWN, on the client that started a move: a GM asks it to stop that token (and, when this
 * client sent its group, the group). Only a GM sender; only a move this client started.
 */
async function stopOwn(data = {}, qctx = {}) {
  const sender = qctx?.user ?? null;
  if (!sender?.isGM) return { ok: false, code: "NOT_GM", reason: "only a GM may ask" };
  let doc = null;
  try { doc = typeof data?.ref === "string" ? globalThis.fromUuidSync?.(data.ref) ?? null : null; } catch { doc = null; }
  if (doc?.documentName !== "Token") return { ok: false, code: "NOT_FOUND", reason: "no such token" };
  if (!doc.movement?.user?.isSelf) return { ok: false, code: "NOT_INITIATOR", reason: "this client did not start that move" };
  const ids = feature?.exposed?.groupCancel?.(doc.id) ?? [];
  let ok = false;
  for (const id of new Set([doc.id, ...ids])) {
    const d = id === doc.id ? doc : doc.parent?.tokens?.get(id);
    if (!d?.movement?.user?.isSelf) continue;
    try { if (d.stopMovement() === true && id === doc.id) ok = true; } catch (err) { log?.debug?.("stopOwn", err); }
  }
  lastStop = { at: new Date().toISOString(), tokenId: doc.id, how: "stopOwn", by: sender.id ?? null };
  return { ok, how: "stop", tokenId: doc.id };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  if (ctx.late) clickPatched = patchClick();
  else reg.once("setup", () => { clickPatched = patchClick(); }, { guard: false, label: "setup: wrap _onClickLeft (click to stop)" });
  reg.on("moveToken", (doc, movement) => onMoveToken(doc, movement), { label: "moveToken: when a move started (click-to-stop arming)" });
  // The kit's queries reach only the active GM (guarded / relayed both refuse a player receiver); this
  // one is sent to a named user, and checks its GM sender itself (header; exceptions.json C30, C56).
  if (globalThis.CONFIG?.queries) globalThis.CONFIG.queries[STOP_OWN] = stopOwn;
  ctx.expose({ stop, stopPatched: () => clickPatched, stopLast: () => (lastStop ? { ...lastStop } : null), noteDrop });
}

export function uninstall() {
  clickHandle?.unwrap();
  clickHandle = null;
  clickPatched = false;
  lastStop = null;
  starts.clear();
  if (globalThis.CONFIG?.queries?.[STOP_OWN] === stopOwn) delete globalThis.CONFIG.queries[STOP_OWN];
  feature = null;
}
