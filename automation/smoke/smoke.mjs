/**
 * Client-side smoke test for a Foundry world, run after an unattended update.
 *
 * The server-side checks (world launches, no new errors in the server log, no package
 * warnings) are blind to the failure that actually ruins a session: a module that
 * throws in the browser and leaves the canvas blank. The server is perfectly happy.
 * This is the cheapest honest way to catch that.
 *
 * It is also what forces dnd5e's *client-side* world migration to happen now, inside
 * the window where the backups are fresh and a rollback is one command — rather than at
 * the GM's next login, days later, with no snapshot taken since.
 *
 * Login needs no *user* password. The caller (smoke.py) has already authenticated as
 * server admin over 127.0.0.1 and hands the session cookie in on a 0600 temp file;
 * `sessions.loginAsUser` then permits logging in as any user without that user's own
 * password. It genuinely requires the admin session: `authenticateAdmin` returns
 * success without setting `session.admin` when no admin password is configured, so
 * this path 403s (`USERS.LoginAsGMRequired`) unless one is set. The cookie is passed
 * by file, not argument — it is a bearer credential and argv is world-readable.
 *
 * Because the Cloudflare tunnel 403s /auth and /setup, admin is a localhost-only
 * capability by construction, which is the "admin only on the local port" model this
 * setup wants.
 *
 * Chrome runs headful but positioned off-screen: Foundry's canvas is WebGL, headless
 * SwiftShader is a different renderer than the one Joe's players use, and a LaunchAgent
 * runs in the GUI session so a real window is available. Testing on the same renderer
 * the table uses is the point.
 *
 * Usage:
 *   node smoke.mjs --url http://127.0.0.1:30000 --world space-journey \
 *                  --dwell 60 --out result.json [--ignore "substr" ...]
 * Exit code is always 0; the verdict is in the JSON. A crash here is a smoke-test
 * failure, not an update failure, and the caller decides what that is worth.
 */

import { createRequire } from "node:module";
import { writeFileSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const GAMEMASTER_ROLE = 4;

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function argAll(name) {
  const out = [];
  process.argv.forEach((a, i) => { if (a === `--${name}`) out.push(process.argv[i + 1]); });
  return out;
}

const baseUrl = arg("url", "http://127.0.0.1:30000").replace(/\/$/, "");
const world = arg("world", null);
const dwellMs = Number(arg("dwell", "60")) * 1000;
const outPath = arg("out", null);
const ignores = argAll("ignore");
const profileDir = arg("profile", "/tmp/vtt-smoke-chrome");

const result = {
  ok: false, world, stage: "start", errors: [], warnings: [],
  gameReady: false, canvasReady: false, activeModules: [], scene: null,
  durationMs: 0, note: null,
};

const started = Date.now();
let browser;

const ignored = (text) => ignores.some((p) => p && text.includes(p));

try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    // Off-screen rather than headless: same renderer as the players, no window in the
    // way if Joe happens to be at the machine.
    args: [
      "--window-position=-4000,-4000", "--window-size=1600,1000",
      "--no-first-run", "--no-default-browser-check",
      "--disable-features=Translate,MediaRouter",
    ],
    userDataDir: profileDir,
    protocolTimeout: 300000,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1600, height: 1000 });

  // The admin session, minted by smoke.py over 127.0.0.1 and handed over by file.
  const cookiePath = arg("cookies", null);
  if (cookiePath) {
    const cookies = JSON.parse(readFileSync(cookiePath, "utf8"));
    if (cookies.length) {
      await browser.setCookie(...cookies.map((c) => ({ ...c, url: baseUrl })));
    }
  }

  page.on("pageerror", (err) => {
    const text = String(err?.message || err);
    if (!ignored(text)) result.errors.push({ type: "pageerror", text: text.slice(0, 800) });
  });
  page.on("console", (msg) => {
    const text = msg.text();
    if (ignored(text)) return;
    if (msg.type() === "error") result.errors.push({ type: "console", text: text.slice(0, 800) });
    else if (msg.type() === "warning") result.warnings.push(text.slice(0, 400));
  });

  // 1. Land on /join so the page's own client data (game.users, with roles) is available.
  result.stage = "join";
  await page.goto(`${baseUrl}/join`, { waitUntil: "networkidle2", timeout: 120000 });
  await page.waitForFunction("typeof game !== 'undefined' && !!game.users", { timeout: 60000 });

  const users = await page.evaluate(() =>
    game.users.map((u) => ({ id: u._id || u.id, name: u.name, role: u.role })));
  const gm = users.find((u) => u.role === GAMEMASTER_ROLE) || users[0];
  if (!gm) throw new Error("no users in this world to log in as");
  result.loggedInAs = gm.name;

  // 2. Log in as the GM. The session is already admin via the cookie, so this
  //    needs no user password.
  result.stage = "login";
  const login = await page.evaluate(async (userId) => {
    // No /auth call here: the session cookie already carries admin. Posting /auth
    // again with an empty body would only re-run the password check and fail.
    const r = await fetch("/join", {
      method: "POST", credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "loginAs", userId }),
    });
    return { status: r.status, body: await r.text() };
  }, gm.id);
  if (login.status !== 200) {
    throw new Error(`loginAs failed: HTTP ${login.status} ${login.body.slice(0, 200)}`);
  }

  // 3. The real test. A world with a broken module usually dies between `game.ready`
  //    and `canvas.ready`, so both are checked, separately.
  result.stage = "game";
  await page.goto(`${baseUrl}/game`, { waitUntil: "domcontentloaded", timeout: 180000 });

  await page.waitForFunction("typeof game !== 'undefined' && game.ready === true",
    { timeout: 240000, polling: 1000 });
  result.gameReady = true;

  try {
    await page.waitForFunction("typeof canvas !== 'undefined' && canvas.ready === true",
      { timeout: 120000, polling: 1000 });
    result.canvasReady = true;
  } catch {
    // A world whose every scene is unset has no canvas to draw. That is a legitimate
    // state, not a failure — record it rather than failing the update over it.
    const anyScene = await page.evaluate(() => !!game.scenes?.size).catch(() => false);
    result.note = anyScene
      ? "canvas never became ready despite the world having scenes"
      : "no active scene — canvas readiness not applicable";
    if (anyScene) result.errors.push({ type: "canvas", text: result.note });
  }

  // 4. Sit there. Module errors frequently arrive well after ready, on the first
  //    render tick or the first hook that fires.
  result.stage = "dwell";
  await new Promise((r) => setTimeout(r, dwellMs));

  Object.assign(result, await page.evaluate(() => ({
    activeModules: game.modules.filter((m) => m.active).map((m) => `${m.id}@${m.version}`),
    scene: game.scenes?.active?.name ?? null,
    systemVersion: game.system?.version ?? null,
    coreVersion: game.version ?? game.release?.version ?? null,
  })));

  result.stage = "done";
  result.ok = result.errors.length === 0;
} catch (err) {
  result.errors.push({ type: "fatal", text: String(err?.message || err).slice(0, 1000) });
  result.ok = false;
} finally {
  result.durationMs = Date.now() - started;
  if (browser) { try { await browser.close(); } catch { /* already gone */ } }
}

const json = JSON.stringify(result, null, 2);
if (outPath) writeFileSync(outPath, json);
process.stdout.write(json + "\n");
