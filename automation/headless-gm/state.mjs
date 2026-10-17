/**
 * The headless GM's decision, as a pure function — so it can be tested without a browser,
 * a Foundry or a broker. watchdog.mjs observes, calls nextAction(), acts, and records what
 * it did in `mem` with the helpers below. Use-doc: context/foundry/headless-gm.md.
 *
 * obs  = { foundryUp, world, bootAt, page: {open, onGame, ready, isGM, world, paused} | null,
 *          bridge: {enabled, connected, connectionState} | null, broker }
 * mem  = { world, loggedInAt, notReadySince, lastLoginAt, lastRestartAt, restartBackoffMs,
 *          botMissingWorld, lastBootstrapAt, bootstrapBlockedWorld, handledBootAt }
 * returns { state, action, reason }, action ∈
 *          idle | close | bootstrap | login | wait | restart-bridge | none
 */

export const TICK_MS = 10_000;
/** Foundry's session cookie lives 24 h (ClientSessions.COOKIE_MAX_AGE); re-login well before. */
export const COOKIE_REFRESH_MS = 20 * 3600_000;
/** A /game that has not reached game.ready in this long is wedged: log in again. */
export const READY_TIMEOUT_MS = 120_000;
/** Never re-run the whole login more often than this. */
export const LOGIN_MIN_GAP_MS = 30_000;
/** foundryMCPBridge.restart(): first retry after 15 s, doubling to 2 min. */
export const RESTART_MIN_GAP_MS = 15_000;
export const RESTART_MAX_BACKOFF_MS = 120_000;
/** A failed bootstrap (no GM, Infisical down) is retried this often, not every tick. */
export const BOOTSTRAP_MIN_GAP_MS = 5 * 60_000;
/** Foundry launches every world paused. A boot this recent is a restart (the 03:00 nightly
 *  relaunches within ~2 min): the bot unpauses it so players can explore without the GM. */
export const UNPAUSE_WINDOW_MS = 15 * 60_000;
/** Two boot times (now − /api/status uptime) this close are the same boot. */
export const SAME_BOOT_MS = 60_000;

export function freshMemory() {
  return {
    world: null, loggedInAt: 0, notReadySince: 0, lastLoginAt: 0,
    lastRestartAt: 0, restartBackoffMs: RESTART_MIN_GAP_MS,
    botMissingWorld: null, lastBootstrapAt: 0, bootstrapBlockedWorld: null, handledBootAt: 0,
  };
}

export function nextAction(obs, mem, now) {
  const pageOpen = !!obs.page?.open;
  if (!obs.foundryUp) {
    return { state: "FOUNDRY_DOWN", action: pageOpen ? "close" : "idle",
             reason: "Foundry is not answering /api/status" };
  }
  if (!obs.world) {
    return { state: "NO_WORLD", action: pageOpen ? "close" : "idle",
             reason: "no world is active" };
  }

  // The last login attempt said this world has no bot user: make one (rate-limited).
  if (mem.botMissingWorld === obs.world) {
    if (mem.bootstrapBlockedWorld === obs.world) {
      return { state: "BOT_MISSING", action: "wait",
               reason: "bootstrap refused for this world — see the log; fix by hand" };
    }
    if (now - (mem.lastBootstrapAt || 0) < BOOTSTRAP_MIN_GAP_MS) {
      return { state: "BOT_MISSING", action: "wait", reason: "bootstrap backoff" };
    }
    return { state: "BOT_MISSING", action: "bootstrap",
             reason: `no bot user in ${obs.world}` };
  }

  const p = obs.page;
  let why = null;
  if (!pageOpen) why = "no page";
  else if (mem.world !== obs.world) why = `world changed ${mem.world ?? "-"} → ${obs.world}`;
  else if (!p.onGame) why = "page is not on /game";
  else if (!p.ready && mem.notReadySince && now - mem.notReadySince > READY_TIMEOUT_MS) {
    why = "game.ready false for over 120 s";
  } else if (p.ready && !p.isGM) why = "logged in but not a GM";
  else if (p.ready && p.world && p.world !== obs.world) why = "page shows another world";
  else if (mem.loggedInAt && now - mem.loggedInAt > COOKIE_REFRESH_MS) why = "session older than 20 h";
  if (why) {
    if (now - (mem.lastLoginAt || 0) < LOGIN_MIN_GAP_MS) {
      return { state: "LOGIN", action: "wait", reason: `${why} (login backoff)` };
    }
    return { state: "LOGIN", action: "login", reason: why };
  }
  if (!p.ready) return { state: "LOGIN", action: "wait", reason: "waiting for game.ready" };

  const b = obs.bridge;
  if (!b) return { state: "BRIDGE_MISSING", action: "none",
                   reason: "foundryMCPBridge is not on the page (module disabled in this world?)" };
  if (b.connected) return { state: "CONNECTED", action: "none", reason: "bridge connected" };
  if (b.enabled === false) {
    return { state: "BRIDGE_DISABLED", action: "none",
             reason: "the bridge's world setting 'enabled' is off — not restarting" };
  }
  if (!obs.broker) {
    return { state: "BRIDGE_DOWN", action: "wait",
             reason: "no MCP broker on :31415/:31416 (no Claude session on this host)" };
  }
  if (now - (mem.lastRestartAt || 0) < (mem.restartBackoffMs || RESTART_MIN_GAP_MS)) {
    return { state: "BRIDGE_DOWN", action: "wait", reason: "broker up; restart backoff" };
  }
  return { state: "BRIDGE_DOWN", action: "restart-bridge", reason: "broker up, bridge not connected" };
}

/**
 * Once per Foundry boot, when the bot's page is first ready as a GM in the active world:
 * returns { boot, unpause } — `boot` to record in mem.handledBootAt, `unpause` true when the
 * world is paused and the boot is recent (a restart, not a pause the GM set later). Returns
 * null when there is nothing to decide: page not ready, or this boot already handled. Handling
 * a boot without unpausing (already running, or too old) still records it, so a pause the GM
 * sets afterwards is never undone — not even when the watchdog itself restarts later.
 */
export function bootDecision(obs, mem, now) {
  const p = obs.page;
  if (!obs.bootAt || !p?.ready || !p.isGM || (p.world && p.world !== obs.world)) return null;
  if (mem.handledBootAt && Math.abs(obs.bootAt - mem.handledBootAt) < SAME_BOOT_MS) return null;
  return { boot: obs.bootAt, unpause: p.paused === true && now - obs.bootAt < UNPAUSE_WINDOW_MS };
}

// ── what the watchdog records after acting ──────────────────────────────────

/** After a restart attempt: on success the backoff resets, on failure it doubles. */
export function afterRestart(mem, now, ok) {
  mem.lastRestartAt = now;
  mem.restartBackoffMs = ok ? RESTART_MIN_GAP_MS
    : Math.min(RESTART_MAX_BACKOFF_MS, (mem.restartBackoffMs || RESTART_MIN_GAP_MS) * 2);
  return mem;
}

/** A bridge seen connected resets the restart backoff. */
export function afterConnected(mem) {
  mem.restartBackoffMs = RESTART_MIN_GAP_MS;
  return mem;
}

/** After a login attempt. `botMissing` is the helper's exit 3 for this world. */
export function afterLogin(mem, now, { ok, world, botMissing = false }) {
  mem.lastLoginAt = now;
  if (ok) {
    mem.world = world; mem.loggedInAt = now; mem.notReadySince = now; mem.botMissingWorld = null;
  } else if (botMissing) {
    mem.botMissingWorld = world;
  }
  return mem;
}

/** After a bootstrap attempt. `blocked`: a non-bot user already holds the name. */
export function afterBootstrap(mem, now, { ok, world, blocked = false }) {
  mem.lastBootstrapAt = now;
  if (ok) { mem.botMissingWorld = null; mem.lastLoginAt = 0; }
  if (blocked) mem.bootstrapBlockedWorld = world;
  return mem;
}

/** Track how long the page has been short of game.ready. */
export function trackReady(mem, now, page) {
  if (page?.ready) mem.notReadySince = 0;
  else if (page?.open && !mem.notReadySince) mem.notReadySince = now;
  return mem;
}

/** Forget the page (closed, crashed, or Foundry gone) so the next tick logs in fresh. */
export function forgetPage(mem) {
  mem.world = null; mem.loggedInAt = 0; mem.notReadySince = 0;
  return mem;
}
