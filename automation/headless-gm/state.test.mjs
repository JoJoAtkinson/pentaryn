// node --test automation/headless-gm/state.test.mjs — the watchdog's decisions, no browser.
import test from "node:test";
import assert from "node:assert/strict";

import { BOOTSTRAP_MIN_GAP_MS, COOKIE_REFRESH_MS, LOGIN_MIN_GAP_MS, READY_TIMEOUT_MS,
         RESTART_MAX_BACKOFF_MS, RESTART_MIN_GAP_MS, afterBootstrap, afterConnected, afterLogin,
         afterRestart, bootDecision, freshMemory, nextAction, trackReady, SAME_BOOT_MS,
         UNPAUSE_WINDOW_MS } from "./state.mjs";

const T0 = 1_000_000_000;
const page = (over = {}) => ({ open: true, onGame: true, ready: true, isGM: true, world: "w", ...over });
const obs = (over = {}) => ({ foundryUp: true, world: "w", page: page(), broker: true,
                              bridge: { enabled: true, connected: true }, ...over });
const loggedIn = () => afterLogin(freshMemory(), T0, { ok: true, world: "w" });

test("Foundry down closes an open page, idles without one", () => {
  assert.deepEqual(
    [nextAction(obs({ foundryUp: false }), loggedIn(), T0).action,
     nextAction(obs({ foundryUp: false, page: null }), freshMemory(), T0).action],
    ["close", "idle"]);
  assert.equal(nextAction(obs({ foundryUp: false }), loggedIn(), T0).state, "FOUNDRY_DOWN");
});

test("no active world closes the page", () => {
  const d = nextAction(obs({ world: null }), loggedIn(), T0);
  assert.equal(d.state, "NO_WORLD");
  assert.equal(d.action, "close");
});

test("no page → login", () => {
  const d = nextAction(obs({ page: null, bridge: null }), freshMemory(), T0);
  assert.equal(d.action, "login");
});

test("a world change triggers LOGIN", () => {
  const d = nextAction(obs({ world: "other" }), loggedIn(), T0 + 60_000);
  assert.equal(d.state, "LOGIN");
  assert.equal(d.action, "login");
  assert.match(d.reason, /world changed w → other/);
});

test("login is rate limited", () => {
  const mem = afterLogin(freshMemory(), T0, { ok: false, world: "w" });
  assert.equal(nextAction(obs({ page: null }), mem, T0 + 1000).action, "wait");
  assert.equal(nextAction(obs({ page: null }), mem, T0 + LOGIN_MIN_GAP_MS + 1).action, "login");
});

test("the session is refreshed after 20 h", () => {
  const mem = loggedIn();
  assert.equal(nextAction(obs(), mem, T0 + COOKIE_REFRESH_MS - 1).action, "none");
  const d = nextAction(obs(), mem, T0 + COOKIE_REFRESH_MS + 1);
  assert.equal(d.action, "login");
  assert.match(d.reason, /20 h/);
});

test("game.ready stuck for 120 s → login again; before that, wait", () => {
  const mem = loggedIn();
  trackReady(mem, T0, page({ ready: false }));
  const p = page({ ready: false });
  assert.equal(nextAction(obs({ page: p }), mem, T0 + 5000).action, "wait");
  assert.equal(nextAction(obs({ page: p }), mem, T0 + READY_TIMEOUT_MS + LOGIN_MIN_GAP_MS).action, "login");
});

test("a ready page that is not a GM logs in again", () => {
  const d = nextAction(obs({ page: page({ isGM: false }) }), loggedIn(), T0 + 60_000);
  assert.equal(d.action, "login");
});

test("connected → nothing to do", () => {
  const d = nextAction(obs(), loggedIn(), T0 + 1000);
  assert.deepEqual([d.state, d.action], ["CONNECTED", "none"]);
});

test("no broker → wait, never restart", () => {
  const d = nextAction(obs({ broker: false, bridge: { enabled: true, connected: false } }),
                       loggedIn(), T0 + 3600_000);
  assert.deepEqual([d.state, d.action], ["BRIDGE_DOWN", "wait"]);
});

test("broker up, bridge down → restart, then back off doubling to 2 min", () => {
  const o = obs({ bridge: { enabled: true, connected: false } });
  const mem = loggedIn();
  let now = T0 + 1000;
  assert.equal(nextAction(o, mem, now).action, "restart-bridge");
  afterRestart(mem, now, false);
  assert.equal(mem.restartBackoffMs, RESTART_MIN_GAP_MS * 2);
  assert.equal(nextAction(o, mem, now + RESTART_MIN_GAP_MS).action, "wait");
  assert.equal(nextAction(o, mem, now + RESTART_MIN_GAP_MS * 2).action, "restart-bridge");
  for (let i = 0; i < 10; i++) afterRestart(mem, now, false);
  assert.equal(mem.restartBackoffMs, RESTART_MAX_BACKOFF_MS);
  afterConnected(mem);
  assert.equal(mem.restartBackoffMs, RESTART_MIN_GAP_MS);
  afterRestart(mem, now, true);
  assert.equal(mem.restartBackoffMs, RESTART_MIN_GAP_MS);
});

test("bridge disabled in the world → no restart loop", () => {
  const d = nextAction(obs({ bridge: { enabled: false, connected: false } }), loggedIn(), T0 + 1e6);
  assert.deepEqual([d.state, d.action], ["BRIDGE_DISABLED", "none"]);
});

test("bridge module absent → reported, not restarted", () => {
  const d = nextAction(obs({ bridge: null }), loggedIn(), T0 + 1000);
  assert.equal(d.state, "BRIDGE_MISSING");
});

test("bot missing → bootstrap, rate limited; blocked stays blocked; another world is fresh", () => {
  const mem = afterLogin(freshMemory(), T0, { ok: false, world: "w", botMissing: true });
  assert.equal(nextAction(obs({ page: null }), mem, T0).action, "bootstrap");
  afterBootstrap(mem, T0, { ok: false, world: "w" });
  assert.equal(nextAction(obs({ page: null }), mem, T0 + 1000).action, "wait");
  assert.equal(nextAction(obs({ page: null }), mem, T0 + BOOTSTRAP_MIN_GAP_MS + 1).action, "bootstrap");
  afterBootstrap(mem, T0, { ok: false, world: "w", blocked: true });
  assert.equal(nextAction(obs({ page: null }), mem, T0 + 10 * BOOTSTRAP_MIN_GAP_MS).action, "wait");
  assert.equal(nextAction(obs({ page: null, world: "x" }), mem, T0 + 10 * BOOTSTRAP_MIN_GAP_MS).action, "login");
});

test("a successful bootstrap goes straight to login", () => {
  const mem = afterLogin(freshMemory(), T0, { ok: false, world: "w", botMissing: true });
  afterBootstrap(mem, T0 + 10, { ok: true, world: "w" });
  assert.equal(nextAction(obs({ page: null }), mem, T0 + 20).action, "login");
});

test("bootDecision: a paused world just after a boot is unpaused, once per boot", () => {
  const boot = T0 - 90_000;                                   // Foundry up for 90 s
  const o = obs({ bootAt: boot, page: page({ paused: true }) });
  const mem = freshMemory();
  assert.deepEqual(bootDecision(o, mem, T0), { boot, unpause: true });
  mem.handledBootAt = boot;
  // the GM pauses again later in the same boot: never undone (uptime jitter is the same boot)
  assert.equal(bootDecision(obs({ bootAt: boot + 40, page: page({ paused: true }) }), mem, T0 + 60_000), null);
  // the next restart is a new boot
  const next = T0 + 86_400_000;
  assert.deepEqual(bootDecision(obs({ bootAt: next - 60_000, page: page({ paused: true }) }), mem, next),
                   { boot: next - 60_000, unpause: true });
  assert.ok(SAME_BOOT_MS < 86_400_000);
});

test("bootDecision: an old boot or a running world is recorded, never unpaused", () => {
  const old = T0 - UNPAUSE_WINDOW_MS - 1;                      // watchdog restarted mid-day
  assert.deepEqual(bootDecision(obs({ bootAt: old, page: page({ paused: true }) }), freshMemory(), T0),
                   { boot: old, unpause: false });
  assert.deepEqual(bootDecision(obs({ bootAt: T0 - 1000, page: page({ paused: false }) }), freshMemory(), T0),
                   { boot: T0 - 1000, unpause: false });
});

test("bootDecision: nothing to decide until the page is ready as a GM in this world", () => {
  const boot = T0 - 1000;
  for (const p of [null, page({ ready: false }), page({ isGM: false }), page({ world: "other" })]) {
    assert.equal(bootDecision(obs({ bootAt: boot, page: p }), freshMemory(), T0), null);
  }
  assert.equal(bootDecision(obs({ bootAt: 0, page: page({ paused: true }) }), freshMemory(), T0), null);
});
