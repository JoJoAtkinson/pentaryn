/**
 * The always-on headless Assistant-GM tab that keeps the Foundry MCP bridge connected on
 * this host. Use-doc: context/foundry/headless-gm.md. Runs under the systemd --user unit
 * foundry-headless-gm (automation/systemd/foundry-headless-gm.service).
 *
 * The bridge module only dials ws://localhost:31415 from a GM-level tab on the same machine
 * as the Claude session's broker, and it does not reconnect by itself. So this process
 * holds one such tab, logged in as the non-human user "Claude" (role 3, Assistant GM), and
 * every 10 s decides (state.mjs) whether to log in again, call foundryMCPBridge.restart(),
 * or leave it alone. Foundry restarts (the 03:00 nightly), world switches and Claude
 * sessions coming and going all fall out of that loop.
 *
 * Credentials never touch this process's argv or output: the Python helper
 * (scripts/foundry/ops/headless_gm.py) logs the bot in with its own password — on a session
 * that is never server-admin — and hands over the session cookie in a 0600 file under
 * $XDG_RUNTIME_DIR, which is read and deleted at once.
 *
 *   node watchdog.mjs                  run forever (the unit)
 *   node watchdog.mjs --once           one tick, print status.json, exit
 *   node watchdog.mjs --status         print the last status.json
 *   node watchdog.mjs --bootstrap-only create the bot user in the active world if missing
 */

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync,
         unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TICK_MS, afterBootstrap, bootDecision, afterConnected, afterLogin, afterRestart, forgetPage,
         freshMemory, nextAction, trackReady } from "./state.mjs";

const require = createRequire(import.meta.url);

// The unit gets ~/.config/pentaryn/env through EnvironmentFile; `make foundry-headless-ensure`
// at a terminal does not. Same precedence as scripts/foundry/host.py: the real environment
// wins, then the env file. KEY=value lines, # comments, optional `export`, one pair of quotes.
(function loadEnvFile() {
  const file = process.env.PENTARYN_ENV_FILE ||
               path.join(process.env.HOME || "", ".config/pentaryn/env");
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return; }
  for (const raw of text.split("\n")) {
    const m = raw.trim().replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (v.length >= 2 && v[0] === v.at(-1) && `"'`.includes(v[0])) v = v.slice(1, -1);
    if (v) process.env[m[1]] = v;
  }
})();
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");
const PORT = process.env.FOUNDRY_PORT || "30000";
// 127.0.0.1, not localhost: the session cookie the helper mints is scoped to that host.
const BASE = `http://127.0.0.1:${PORT}`;
const PY = process.env.PENTARYN_PYTHON || path.join(REPO, ".venv/bin/python");
const RUN_DIR = path.join(process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`,
                          "pentaryn-headless-gm");
const STATUS_FILE = path.join(RUN_DIR, "status.json");
const LOG_DIR = path.join(REPO, ".state/logs");
const PROFILE_DIR = path.join(REPO, ".state/headless-gm-profile");
const CHROME = process.env.CHROME_PATH || process.env.PENTARYN_HEADLESS_CHROME || null;
const BOT = process.env.PENTARYN_BOT_USER || "Claude";
// The canvas is off by default: SwiftShader rendering a scene measured 1280% CPU and the
// whole 1.5 GB MemoryMax on BOSS (2026-10-16). PENTARYN_HEADLESS_CANVAS=1 turns it back on.
const NO_CANVAS = !/^(1|true|yes)$/i.test(process.env.PENTARYN_HEADLESS_CANVAS || "");
const BROKER_PORTS = [31415, 31416];
const MAX_CONSECUTIVE_ERRORS = 5;

const argv = new Set(process.argv.slice(2));

// ── logging: one line per transition, never per tick ────────────────────────

function stamp(d = new Date()) {
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-";
  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
         `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ` +
         `${sign}${pad(Math.trunc(off / 60))}${pad(off % 60)}`;
}

function log(line) {
  const text = `${stamp()} [${process.pid}] ${line}`;
  console.log(text);
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    const d = new Date();
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    appendFileSync(path.join(LOG_DIR, `headless-gm-${month}.log`), text + "\n");
  } catch { /* journald still has it */ }
}

// ── the Python helper (credentials live there, not here) ────────────────────

function helper(args, timeoutMs = 90_000) {
  return new Promise((resolve) => {
    const child = spawn(PY, ["-m", "scripts.foundry.ops", "headless-gm", ...args],
                        { cwd: REPO, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { err += d; });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      let json = null;
      const last = out.trim().split("\n").pop();
      try { json = JSON.parse(last); } catch { /* reported below */ }
      resolve({ code: code ?? 1, json, err: err.trim().split("\n").slice(-3).join(" | ") });
    });
  });
}

/** Mint a session as `who` (bot|gm); returns {code, json, cookies, botPassword}. */
async function mintSession(who, { botPassword = false } = {}) {
  mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
  const file = path.join(RUN_DIR, `cookie-${who}-${process.pid}.json`);
  const args = ["cookie", "--as", who, "--out", file];
  if (botPassword) args.push("--bot-password");
  const r = await helper(args);
  let payload = null;
  try {
    if (r.code === 0 && existsSync(file)) payload = JSON.parse(readFileSync(file, "utf8"));
  } finally {
    try { unlinkSync(file); } catch { /* not written */ }
  }
  return { ...r, cookies: payload?.cookies || [], botPassword: payload?.botPassword || null };
}

// ── observation ─────────────────────────────────────────────────────────────

async function foundryStatus() {
  try {
    const r = await fetch(`${BASE}/api/status`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return { up: false, world: null, bootAt: 0 };
    const s = await r.json();
    // uptime is the server process's, in ms: boot time identifies this Foundry run
    const bootAt = Number.isFinite(s.uptime) ? Date.now() - s.uptime : 0;
    return { up: true, world: s.active && s.world ? s.world : null, bootAt };
  } catch {
    return { up: false, world: null, bootAt: 0 };
  }
}

function portOpen(port, host = "127.0.0.1", ms = 1500) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    const done = (v) => { sock.destroy(); resolve(v); };
    sock.setTimeout(ms, () => done(false));
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
  });
}

async function brokerUp() {
  for (const p of BROKER_PORTS) if (await portOpen(p)) return true;
  return false;
}

async function inspectPage(page) {
  if (!page || page.isClosed()) return { page: null, bridge: null };
  let url = "";
  try { url = page.url(); } catch { return { page: null, bridge: null }; }
  let onGame = false;
  try { onGame = new URL(url).pathname.endsWith("/game"); } catch { /* about:blank */ }
  let info = null;
  try {
    info = await page.evaluate((noCanvas) => {
      const g = globalThis.game;
      const ready = !!(g && g.ready);
      const b = globalThis.foundryMCPBridge;
      let bridge = null;
      if (ready && b?.getStatus) {
        const s = b.getStatus();
        bridge = { enabled: s.enabled, connected: s.connected, connectionState: s.connectionState };
      }
      return {
        ready, isGM: !!(ready && g.user?.isGM), userId: ready ? g.user?.id : null,
        user: ready ? g.user?.name : null, role: ready ? g.user?.role : null,
        world: ready ? g.world?.id : null,
        paused: ready ? !!g.paused : null,
        activeGM: ready ? (g.users?.activeGM?.name ?? null) : null,
        perms: ready ? { SETTINGS_MODIFY: g.user.can("SETTINGS_MODIFY"),
                         FILES_UPLOAD: g.user.can("FILES_UPLOAD") } : null,
        // false after an in-page reload (a world setting saved with "reload all clients",
        // a socket reconnect over 5 s) until the watchdog re-applies them
        patched: ready ? !((noCanvas && !Object.hasOwn(g.scenes, "current")) ||
                           g.tours?.activeTour) : null,
        bridge,
      };
    }, NO_CANVAS);
  } catch {
    info = { ready: false };
  }
  return { page: { open: true, onGame, ...info }, bridge: info?.bridge ?? null };
}

// ── browser ─────────────────────────────────────────────────────────────────

let puppeteer;
let browser = null;
let page = null;

async function launch() {
  if (browser) return browser;
  if (!CHROME) {
    throw new Error("no headless Chrome: set PENTARYN_HEADLESS_CHROME (make foundry-headless-install) " +
                    "or CHROME_PATH");
  }
  puppeteer ??= require("puppeteer-core");
  // With a session bus, Chrome calls systemd's StartTransientUnit and moves its main
  // process into its own app-org.chromium.Chromium-<pid>.scope — out of this unit's cgroup,
  // so MemoryMax, CPU accounting and the stop-time kill would miss it (seen 2026-10-16).
  // "disabled:" is a D-Bus address that never connects.
  const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" };
  if (process.env.PENTARYN_HEADLESS_LIBS) {
    env.LD_LIBRARY_PATH = [process.env.PENTARYN_HEADLESS_LIBS, env.LD_LIBRARY_PATH]
      .filter(Boolean).join(":");
  }
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "shell",
    userDataDir: PROFILE_DIR,
    env,
    // DevTools over a pipe, not a port: Chrome exits by itself when this process dies,
    // however it dies.
    pipe: true,
    protocolTimeout: 180_000,
    args: [
      "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio",
      // Load-bearing: a hidden tab's timers are otherwise throttled and the bridge's
      // heartbeat stalls.
      "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--window-size=1280,720", "--no-first-run", "--no-default-browser-check",
      "--disable-features=Translate,MediaRouter",
    ],
  });
  browser.on("disconnected", () => {
    if (shuttingDown) return;
    log("✗ CRASH browser disconnected — exiting for systemd to restart");
    process.exit(1);
  });
  return browser;
}

/**
 * Kill any Chrome still running on this profile from an earlier watchdog that died hard
 * (SIGKILL, OOM). Only the run-forever mode calls this: it owns the profile.
 */
function sweepOrphanChrome() {
  const marker = `--user-data-dir=${PROFILE_DIR}`;
  let killed = 0;
  let pids = [];
  try { pids = readdirSync("/proc").filter((d) => /^\d+$/.test(d)); } catch { return 0; }
  for (const pid of pids) {
    if (Number(pid) === process.pid) continue;
    let cmd = "";
    try { cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8"); } catch { continue; }
    if (!cmd.split("\0").includes(marker)) continue;
    try { process.kill(Number(pid), "SIGKILL"); killed += 1; } catch { /* gone */ }
  }
  return killed;
}

async function closePage() {
  if (page && !page.isClosed()) await page.close().catch(() => {});
  page = null;
}

async function openGamePage(context, cookies, { noCanvas = NO_CANVAS } = {}) {
  await context.setCookie(...cookies.map((c) => ({ ...c, url: BASE })));
  const p = await context.newPage();
  await p.setViewport({ width: 1280, height: 720 });
  // Foundry's own "disable canvas" client setting (client/game.mjs reads core.noCanvas from
  // localStorage). Set either way: the profile keeps localStorage between runs.
  // This runs on every load of the page, reloads included, so it also installs the client
  // patches (see applyClientPatches) and arms them for Hooks "ready".
  await p.evaluateOnNewDocument((off) => {
    try { localStorage.setItem("core.noCanvas", off ? "true" : "false"); } catch { /* ignore */ }
    globalThis.__pentarynHeadlessPatch = (noCanvas) => {
      const g = globalThis.game;
      try { g.tours?.activeTour?.exit?.(); } catch { /* none */ }
      if (noCanvas && g?.scenes && !Object.hasOwn(g.scenes, "current")) {
        Object.defineProperty(g.scenes, "current", {
          configurable: true, get() { return this.viewed ?? this.active; },
        });
      }
    };
    const arm = () => {
      if (!globalThis.Hooks?.once) return false;
      globalThis.Hooks.once("ready", () => globalThis.__pentarynHeadlessPatch(off));
      return true;
    };
    if (!arm()) { const t = setInterval(() => { if (arm()) clearInterval(t); }, 50); }
  }, noCanvas);
  await p.goto(`${BASE}/game`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  return p;
}

// ── actions ─────────────────────────────────────────────────────────────────

async function doLogin(world) {
  const r = await mintSession("bot");
  if (r.code === 3) return { ok: false, botMissing: true, reason: "bot user missing" };
  // 7: the bot exists but refused FOUNDRY_VTT_BOT_PW — the bootstrap (as the GM) re-sets it.
  if (r.code === 7) {
    return { ok: false, botMissing: true, reason: "bot refused its password; bootstrap re-sets it" };
  }
  if (r.code !== 0) {
    return { ok: false, reason: `helper exit ${r.code}: ${r.json?.error || r.err || "no output"}` };
  }
  await closePage();
  const b = await launch();
  page = await openGamePage(b.defaultBrowserContext(), r.cookies);
  page.on("error", (e) => {
    log(`✗ CRASH page crashed (${String(e?.message || e).slice(0, 120)}) — exiting`);
    process.exit(1);
  });
  try {
    await page.waitForFunction("globalThis.game?.ready === true", { timeout: 120_000, polling: 1000 });
  } catch {
    return { ok: true, reason: "page loaded; game.ready still pending" };
  }
  await applyClientPatches(page);
  const info = (await inspectPage(page)).page || {};
  if (info.perms && (!info.perms.SETTINGS_MODIFY || !info.perms.FILES_UPLOAD)) {
    log(`! PERM-GAP role ${info.role} in ${world}: SETTINGS_MODIFY=${info.perms.SETTINGS_MODIFY} ` +
        `FILES_UPLOAD=${info.perms.FILES_UPLOAD} — Configure Permissions, or raise the bot to role 4`);
  }
  return { ok: true, reason: `logged in as ${info.user} (${r.json?.user_id}) role ${info.role}` };
}

/**
 * The bot's client-side patches, defined in the page by openGamePage:
 * - A first login can start an onboarding tour; nobody is there to click through it.
 * - With no canvas, Scenes#current is `viewed`, and nothing is ever viewed (Scene#view() only
 *   flags a scene once the canvas draws it) — so every bridge tool that reads
 *   game.scenes.current (get-current-scene, token tools) saw no scene. On this client only,
 *   "current" falls back to the active scene: the one the table is on.
 * They live on `game`, so an in-page reload drops them; the "ready" hook re-applies them and
 * the tick re-applies them whenever inspectPage reports `patched: false`.
 */
async function applyClientPatches(p) {
  await p.evaluate((noCanvas) => globalThis.__pentarynHeadlessPatch?.(noCanvas), NO_CANVAS)
    .catch(() => {});
}

/** Create the bot user, as the world's Gamemaster, in a throwaway incognito context. */
async function doBootstrap(world) {
  const r = await mintSession("gm", { botPassword: true });
  if (r.code !== 0) {
    return { ok: false, reason: `helper exit ${r.code}: ${r.json?.error || r.err || "no output"}` };
  }
  const b = await launch();
  const ctx = await b.createBrowserContext();
  try {
    const p = await openGamePage(ctx, r.cookies, { noCanvas: true });
    await p.waitForFunction("globalThis.game?.ready === true", { timeout: 180_000, polling: 1000 });
    const res = await p.evaluate(async (name, password) => {
      const existing = game.users.getName(name);
      if (existing) {
        if (existing.role < CONST.USER_ROLES.ASSISTANT) {
          return { ok: false, blocked: true, id: existing.id, role: existing.role };
        }
        // The bot is here but refused its password (helper exit 7): make Infisical's
        // value the user's again. Harmless when they already match.
        await existing.update({ password });
        return { ok: true, id: existing.id, created: false };
      }
      const u = await User.create({ name, role: CONST.USER_ROLES.ASSISTANT, password,
                                    color: "#d97757" });
      return { ok: !!u, id: u?.id, created: true };
    }, BOT, r.botPassword);
    if (res.blocked) {
      return { ok: false, blocked: true,
               reason: `a user named ${BOT} already exists at role ${res.role} (${res.id}) — ` +
                       `not touching a human's user; rename it or set PENTARYN_BOT_USER` };
    }
    return { ok: res.ok, reason: res.created ? `created ${BOT} (${res.id}) as Assistant GM in ${world}`
                                             : `${BOT} already present (${res.id}); password re-set` };
  } finally {
    await ctx.close().catch(() => {});
  }
}

/** Foundry launches every world paused; after a restart the bot lifts it (bootDecision). */
async function doUnpause() {
  try {
    const paused = await page.evaluate(() => {
      globalThis.game.togglePause(false, { broadcast: true });
      return globalThis.game.paused;
    });
    return { ok: paused === false, reason: paused === false ? "world unpaused after the restart" : "still paused" };
  } catch (err) {
    return { ok: false, reason: `evaluate failed: ${err.message}` };
  }
}

async function doRestartBridge() {
  try {
    await page.evaluate(() => globalThis.foundryMCPBridge.restart());
  } catch (e) {
    return { ok: false, reason: String(e?.message || e).slice(0, 160) };
  }
  await new Promise((r) => setTimeout(r, 3000));
  const { bridge } = await inspectPage(page);
  return { ok: !!bridge?.connected, reason: `after restart: ${bridge?.connectionState ?? "?"}` };
}

// ── the loop ────────────────────────────────────────────────────────────────

const mem = freshMemory();
let last = { state: null, since: null, reason: null };
let shuttingDown = false;
let errors = 0;
let lastLoginFailure = null;
let patchLapsed = false;

function writeStatus(decision, obs) {
  const p = obs.page || {};
  const status = {
    state: decision.state, reason: decision.reason, since: last.since,
    world: obs.world, pageWorld: p.world ?? null, user: p.user ?? null, userId: p.userId ?? null,
    role: p.role ?? null, isGM: p.isGM ?? null, activeGM: p.activeGM ?? null,
    patched: p.patched ?? null,
    bridge: obs.bridge, broker: obs.broker, perms: p.perms ?? null,
    lastRestartAt: mem.lastRestartAt ? new Date(mem.lastRestartAt).toISOString() : null,
    loggedInAt: mem.loggedInAt ? new Date(mem.loggedInAt).toISOString() : null,
    noCanvas: NO_CANVAS, pid: process.pid, updatedAtMs: Date.now(),
  };
  try {
    mkdirSync(RUN_DIR, { recursive: true, mode: 0o700 });
    const tmp = STATUS_FILE + ".tmp";
    writeFileSync(tmp, JSON.stringify(status, null, 2));
    renameSync(tmp, STATUS_FILE);
  } catch { /* status is best effort */ }
  return status;
}

function transition(decision, obs) {
  if (decision.state === last.state && decision.reason === last.reason) return;
  const user = obs.page?.userId ?? "-";
  if (decision.state !== last.state) last.since = new Date().toISOString();
  last = { ...last, state: decision.state, reason: decision.reason };
  log(`${decision.state} world=${obs.world ?? "-"} user=${user} ${decision.reason}`);
}

async function tick() {
  const now = Date.now();
  const fs = await foundryStatus();
  const pg = fs.up && fs.world ? await inspectPage(page) : { page: page ? { open: true } : null, bridge: null };
  trackReady(mem, now, pg.page);
  const obs = { foundryUp: fs.up, world: fs.world, bootAt: fs.bootAt, page: pg.page, bridge: pg.bridge,
                broker: await brokerUp() };
  const d = nextAction(obs, mem, now);
  transition(d, obs);
  if (pg.page?.ready && pg.page.patched === false && page) {
    await applyClientPatches(page);
    // once per lapse: a tour that will not exit must not log every tick
    if (!patchLapsed) log("↻ PATCH re-applied the client patches (the page reloaded)");
    patchLapsed = true;
  } else if (pg.page?.patched) {
    patchLapsed = false;
  }

  switch (d.action) {
    case "close":
      await closePage(); forgetPage(mem); break;
    case "login": {
      const r = await doLogin(obs.world);
      afterLogin(mem, Date.now(), { ok: r.ok, world: obs.world, botMissing: r.botMissing });
      // A failing helper (Infisical down, Foundry mid-restart) retries on the login backoff;
      // log it once per distinct reason, not every 30 s.
      if (r.ok || r.reason !== lastLoginFailure) log(`${r.ok ? "✓" : "✗"} LOGIN ${r.reason}`);
      lastLoginFailure = r.ok ? null : r.reason;
      break;
    }
    case "bootstrap": {
      const r = await doBootstrap(obs.world);
      afterBootstrap(mem, Date.now(), { ok: r.ok, world: obs.world, blocked: r.blocked });
      log(`${r.ok ? "✓" : "✗"} BOOTSTRAP ${r.reason}`);
      break;
    }
    case "restart-bridge": {
      const r = await doRestartBridge();
      afterRestart(mem, Date.now(), r.ok);
      log(`${r.ok ? "✓" : "✗"} BRIDGE-RESTART ${r.reason}` +
          (r.ok ? "" : ` (next try in ${Math.round(mem.restartBackoffMs / 1000)} s)`));
      break;
    }
    case "none":
      if (d.state === "CONNECTED") afterConnected(mem);
      break;
    default: break;   // idle | wait
  }

  const boot = bootDecision(obs, mem, now);
  if (boot) {
    mem.handledBootAt = boot.boot;
    if (boot.unpause) {
      const r = await doUnpause();
      log(`${r.ok ? "✓" : "✗"} UNPAUSE ${r.reason}`);
    }
  }
  return writeStatus(d, obs);
}

async function shutdown(code = 0) {
  shuttingDown = true;
  try { await browser?.close(); } catch { /* already gone */ }
  process.exit(code);
}

async function main() {
  if (argv.has("--status")) {
    process.stdout.write(existsSync(STATUS_FILE) ? readFileSync(STATUS_FILE, "utf8") + "\n" : "{}\n");
    return;
  }
  process.on("SIGTERM", () => { log("SIGTERM — closing the browser"); shutdown(0); });
  process.on("SIGINT", () => shutdown(0));

  if (argv.has("--bootstrap-only")) {
    const e = await helper(["ensure"]);
    if (e.code !== 0 || !e.json?.ok) {
      console.error(`ensure failed (exit ${e.code}): ${e.json?.error || e.err}`);
      return shutdown(e.code || 1);
    }
    if (e.json.bot_id) {
      console.log(JSON.stringify({ ok: true, world: e.json.world, bot_id: e.json.bot_id, created: false }));
      return shutdown(0);
    }
    const r = await doBootstrap(e.json.world);
    log(`${r.ok ? "✓" : "✗"} BOOTSTRAP ${r.reason}`);
    const v = await helper(["ensure"]);
    console.log(JSON.stringify({ ok: r.ok && !!v.json?.bot_id, world: e.json.world,
                                 bot_id: v.json?.bot_id ?? null, created: r.ok }));
    return shutdown(r.ok && v.json?.bot_id ? 0 : 1);
  }

  log(`start: ${BOT} → ${BASE}, chrome=${CHROME ? path.basename(CHROME) : "none"}, ` +
      `noCanvas=${NO_CANVAS}`);
  if (argv.has("--once")) {
    const s = await tick();
    console.log(JSON.stringify(s, null, 2));
    return shutdown(0);
  }
  const swept = sweepOrphanChrome();
  if (swept) log(`! SWEEP killed ${swept} orphaned Chrome process(es) on ${PROFILE_DIR}`);
  for (;;) {
    try {
      await tick();
      errors = 0;
    } catch (e) {
      errors += 1;
      log(`✗ ERROR (${errors}/${MAX_CONSECUTIVE_ERRORS}) ${String(e?.message || e).slice(0, 200)}`);
      if (errors >= MAX_CONSECUTIVE_ERRORS) {
        log("✗ too many consecutive errors — exiting for systemd to restart");
        return shutdown(1);
      }
    }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
}

main().catch((e) => {
  log(`✗ FATAL ${String(e?.stack || e).slice(0, 400)}`);
  shutdown(1);
});
