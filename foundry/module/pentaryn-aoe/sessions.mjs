/**
 * R2-2 — one GM account, several sessions: only one of them writes.
 *
 * `game.users.activeGM.isSelf` is true on every session of the active GM's account (Joe with two tabs
 * open, or on two machines). Spell walls and handles have fixed ids, so the second session's writes
 * were refused by the server, and Foundry shows each refusal as a red toast (live R2-2: four at a Wall
 * of Stone cast, more at each break and repair). The sessions of the active GM user now elect one lead
 * over this module's socket (core.leadSession: the oldest live one). `isLeadGM()` replaces
 * `activeGM.isSelf` where this module writes scene data on its own (spell-walls.mjs, areas.mjs, through
 * ctx.exposed: isLeadGM, isLeadSession, onBecomeLead).
 *
 * A new session listens SESSION_SETTLE_MS for older ones before it may lead; the work it skipped then
 * (the startup sweep, the canvasReady wall sync) runs through onBecomeLead when it does take the lead,
 * also when an older session closes or goes quiet. Without a connected socket (tests, a client whose
 * socket is down) it is `activeGM.isSelf`, as before.
 */

import { MODULE, SESSION_BEAT_MS, SESSION_SETTLE_MS, SESSION_TTL_MS, leadSession, sessionKey } from "./core.mjs";
import { makeLog } from "./lib/log.mjs";

let log = makeLog(MODULE);
const CHANNEL = `module.${MODULE}`;

let me = null;                 // this session's key, while the election runs
let settled = false;
let wasLead = false;
let beat = null;
let settleTimer = null;
const peers = new Map();       // key → last heard (ms)
const leadFns = [];

const isActiveGM = () => game.users?.activeGM?.isSelf === true;

/** Is this client the one that writes for the active GM (the active GM, and its account's lead session)? */
export function isLeadGM() {
  if (!isActiveGM()) return false;
  if (!me) return true;
  return isLeadSession();
}

/**
 * Is this the lead session of this client's own account? For work the creating user's client does
 *  (userId === game.user.id), which every session of that account would otherwise do. A client with
 * no election running (no connected socket) is always its own lead. A player with two tabs elects too.
 */
export function isLeadSession() {
  if (!me) return true;
  if (!settled) return false;
  return leadSession(me, peers, Date.now(), SESSION_TTL_MS);
}

/** Run `fn` each time this client becomes the lead (after it settles, on a handover). */
export function onBecomeLead(fn) {
  if (typeof fn === "function") leadFns.push(fn);
}

function check() {
  const lead = isLeadGM();
  if (lead && !wasLead) {
    for (const fn of leadFns) {
      try { Promise.resolve(fn()).catch(err => log.error("lead handover", err)); }
      catch (err) { log.error("lead handover", err); }
    }
  }
  wasLead = lead;
}

function send(t) {
  if (!me) return;
  try { game.socket.emit(CHANNEL, { kind: "session", t, user: game.user?.id, key: me }); }
  catch (err) { log.debug("session emit", err); }
}

function onMessage(msg) {
  if (msg?.kind !== "session" || !me || msg.user !== game.user?.id || !msg.key || msg.key === me) return;
  if (msg.t === "bye") peers.delete(msg.key);
  else peers.set(msg.key, Date.now());
  if (msg.t === "hello") send("here");
  check();
}

const onPageHide = () => send("bye");

function start() {
  if (me || !game.user) return;
  const s = game.socket;
  // A stub or a socket that is down: no election, activeGM.isSelf decides (as before 0.8.3).
  if (!s?.connected || typeof s.on !== "function" || typeof s.emit !== "function") return;
  me = sessionKey(Date.now(), foundry.utils.randomID(8));
  game.socket.on(CHANNEL, onMessage);
  send("hello");
  settleTimer = setTimeout(() => { settled = true; check(); }, SESSION_SETTLE_MS);
  beat = setInterval(() => { send("here"); check(); }, SESSION_BEAT_MS);
  globalThis.addEventListener?.("pagehide", onPageHide);
}

export function install(reg, ctx) {
  log = ctx.log;
  if (game.ready) start();
  else reg.once("ready", start, { guard: false, label: "ready(sessions)" });
  // Another GM joins or leaves: the active GM may have changed hands.
  reg.on("userConnected", () => check(), { guard: false, label: "userConnected(sessions)" });
  ctx.expose({ isLeadGM, isLeadSession, onBecomeLead, sessions: () => ({ key: me, settled, lead: isLeadGM(), peers: [...peers.keys()] }) });
}

/** End this session's election (uninstall; a test's reset). The onBecomeLead list stays. */
function stop() {
  if (me) send("bye");
  try { if (me) game.socket?.off?.(CHANNEL, onMessage); } catch (err) { log.debug("session off", err); }
  globalThis.removeEventListener?.("pagehide", onPageHide);
  clearTimeout(settleTimer);
  clearInterval(beat);
  me = null; settled = false; wasLead = false; beat = null; settleTimer = null;
  peers.clear();
}

export function uninstall() {
  stop();
  leadFns.length = 0;
}

// Test seam: tests import this through test/fixtures/seams.mjs only. Not part of the API.
export const _internals = { onMessage, check, start, stop, CHANNEL, peers, state: () => ({ me, settled, wasLead }) , settle: () => { settled = true; check(); } };
