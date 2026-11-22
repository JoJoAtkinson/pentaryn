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
 *   query     in combat, another user started it: ask the active GM (the kit's relay row `stop`),
 *             which stops it when it is the one that started the move; 400 ms, and on any failure
 *             nothing happens.
 * When the client that sent a group stops one member, the whole group stops and its unsent waves
 * are cancelled (group.mjs groupCancel).
 */

import { MODULE } from "./movement-core.mjs";
import { clickStop } from "./motion-core.mjs";
import { drawnPosition, inCombat, movementFacts } from "./group-adapter.mjs";
import { setting } from "./settings.mjs";
import { wrapMethod } from "./lib/patch.mjs";
import { queryGM } from "./lib/queries.mjs";

let log = null;
let feature = null;
let clickHandle = null;
let clickPatched = false;
let lastStop = null;

/** Put a token where it is drawn, out of combat (one frame here: the tween stops before the write). */
function displace(token) {
  const doc = token.document;
  const p = drawnPosition(token);
  try { token.stopAnimation?.({ reset: false }); } catch (err) { log.debug?.("stopAnimation", err); }
  const wp = { x: p.x, y: p.y, elevation: p.elevation, action: "displace", snapped: false, explicit: true, checkpoint: true };
  return doc.move([wp], { animate: false, method: "api" })
    .catch(err => log.warnOnce("stop-displace", "could not stop a token where it was drawn (further errors suppressed)", err));
}

/** Stop one token by the table's decision. */
function act(token, how) {
  const doc = token.document;
  if (how === "displace") return displace(token);
  if (how === "stop") return Promise.resolve(doc.stopMovement());
  if (how === "query") {
    return queryGM(`${MODULE}.stop`, { ref: doc.uuid }, { timeout: 400 })
      .catch(err => { log.debug?.("stop query", err); return null; });
  }
  return Promise.resolve(null);
}

/** The table's inputs for a token on this client. */
function decide(token, { tool = game.activeTool, modifiers = false } = {}) {
  const doc = token.document;
  const facts = movementFacts(token);
  let canControl = false;
  try { canControl = token.can?.(game.user, "control") ?? !!doc.isOwner; } catch { canControl = !!doc?.isOwner; }
  return clickStop({
    enabled: !!setting("clickToStop"), tool, modifiers, canControl,
    state: facts.state, animating: facts.animating, combat: inCombat(doc), initiatorSelf: facts.initiatorSelf,
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
    const next = decide(other, { tool: "select" });
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
  const how = decide(token, { tool: "select" });
  if (!how) return { ok: false, code: "NOT_MOVING", reason: "the token is not moving, or you cannot control it" };
  const results = await Promise.all(stopToken(token, how));
  const r = results[0];
  if (how === "query") return r?.ok ? { ...r } : { ok: false, code: r?.code ?? "NO_ANSWER", reason: r?.reason ?? "the client that started the move did not stop it" };
  return { ok: true, how, tokenId: doc.id };
}

/* -------------------------------------------- */
/*  Install / uninstall                         */
/* -------------------------------------------- */

export function install(reg, ctx) {
  feature = ctx;
  log = ctx.log;
  if (ctx.late) clickPatched = patchClick();
  else reg.once("setup", () => { clickPatched = patchClick(); }, { guard: false, label: "setup: wrap _onClickLeft (click to stop)" });
  ctx.expose({ stop, stopPatched: () => clickPatched, stopLast: () => (lastStop ? { ...lastStop } : null) });
}

export function uninstall() {
  clickHandle?.unwrap();
  clickHandle = null;
  clickPatched = false;
  lastStop = null;
  feature = null;
}
