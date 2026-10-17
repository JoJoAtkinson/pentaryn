#!/usr/bin/env node
/**
 * Live multi-login scenario runner for pentaryn-pins (with pentaryn-portals 0.6.0 teleportToken,
 * pentaryn-prompts 0.4.6 placeAt and pentaryn-resume 0.1.1) against the LOCAL Foundry.
 * Design and go-live checklist: context/plans/pin-2026-10.md. Use-doc: context/foundry/pins.md.
 *
 *   node automation/smoke/pins-live.mjs --seed             create the PinTest fixture (idempotent; a stopped
 *                                                          run's leftovers are cleared first: see seedMode)
 *   node automation/smoke/pins-live.mjs --run [S06 S08 ..] run scenarios (all by default)
 *   node automation/smoke/pins-live.mjs --cleanup          delete everything named PinTest* (idempotent)
 *   node automation/smoke/pins-live.mjs --list             the scenario table
 *   options: --url http://127.0.0.1:30000 (localhost only)   --timeout <s per scenario, default 300>
 *
 * stdout is JSON lines only: one per scenario `{id, pass, skipped, evidence, error}`, then a summary
 * line (`{summary: true, ...}`). Progress goes to stderr. --seed, --run and --cleanup also write the
 * same lines to .state/pins-live.jsonl, TRUNCATED at the start of each run (once the lock is held)
 * and opened by a header `{run: true, mode, runId, pid, startedAt, ids}`: that file is only ever the
 * latest run, and one with no summary line was stopped (or is still running: see the lock).
 *
 * Exit codes (exitCodeFor; the summary line says which):
 *   0    all passed or skipped and everything put back; --seed complete; --cleanup restored; --list, --help
 *   1    a scenario failed, --seed left the fixture incomplete, or the restore did not put everything
 *        back (this wins over a refusal: run --cleanup, the stash scene is kept for it)
 *   2    refused or stopped: badArgs, busy (another run holds .state/pins-live.lock), realPlayerOnline,
 *        notSeeded, interrupted (a signal during --run), bridgeConnected, modulesNotLive, noChrome,
 *        another runner error, or fatal (an unexpected throw)
 *   3    infisicalLogin: run `infisical login`
 *   130  a second SIGINT/SIGTERM/SIGHUP: exited at once, without the restore
 * A scenario past --timeout is cancelled (no further world action) and waited out before the next
 * one. SIGINT (Ctrl-C), SIGTERM or SIGHUP during --run stops after the current step and still restores
 * (exit 2); during --seed or --cleanup the mode finishes (both are short and end in a consistent state).
 *
 * Who is who
 * - GM: Joe's role-4 user, in a throwaway incognito context. The session comes from
 *   `python -m scripts.foundry.ops headless-gm cookie --as gm --out /dev/fd/3` (admin + loginAs, the
 *   same path as the bot's bootstrap). The helper writes the session to fd 3, a pipe this process
 *   opened for it and reads into memory: never a file, argv, stdout, stderr or a log. Puppeteer's
 *   DEBUG protocol logging (which would print the cookie and the passwords) is switched off for the
 *   run. The cookie goes only into the GM page's incognito context. While that page is open it is game.users.activeGM (role 4 outranks the role-3 bot). The
 *   page blocks the MCP bridge before load (WebSocket and fetch to :31414-31416 throw), and every
 *   scenario asserts foundryMCPBridge.getStatus().connected !== true: the bot stays the only peer.
 * - Players: PinTest-A, PinTest-B, PinTest-C, each in its own incognito context, logged in through
 *   POST /join with their own password (FoundryAdmin.join's route; never admin loginAs). Passwords
 *   come from crypto.randomBytes, are set by the GM page through page.evaluate arguments, live in
 *   this process's memory only and are never printed, logged or put in an eval-js script.
 *   C runs with core.noCanvas; A and B have canvases. One browser, 800x600 viewports.
 * - S18 closes the GM page so the bot "Claude" is the active GM, and issues the world actions
 *   through the broker's control channel (127.0.0.1:31414 call_tool eval-js). Those scripts carry
 *   no secret; they are logged verbatim to foundry/logs/eval-*.jsonl like any eval-js.
 *
 * Safety
 * - Refuses (`realPlayerOnline`) when any non-GM user not named PinTest* is logged in, before the
 *   run and again before every scenario: activations and pulls would move a real player.
 * - Touches only documents named PinTest*. The exceptions, all restored at the end of the run from a
 *   stash kept on the PinTest North scene: the world setting pentaryn-pins.pinning, which scene is
 *   active, and the GM user's own pentaryn-resume view flag (the GM page's resume saves it).
 * - The stash carries the run's id, and only the run that wrote it puts the pinning switch back (R2).
 *   A stopped run's stash (found by --seed, --run or --cleanup) never writes the live switch: its value
 *   is from when that run started and Joe may have changed it since. The runner reports it on stderr
 *   and in the output's `pinningLeft` / `stale`; a PinTest scene left active is still put back to the
 *   stash's real one (only a run makes a PinTest scene active).
 *   With pentaryn-pins disabled the switch is not registered: `pinningLeft.now` is then the value
 *   stored in the world's Setting document (`pinsActive: false`), read, never written, and always noted.
 * - --cleanup deletes by NAME PREFIX, never by saved ids, so it works after a crash.
 */

import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

/* ── fixture: pure data ─────────────────────────────────────────────────── */

export const PREFIX = "PinTest";
export const BRIDGE_PORTS = Object.freeze([31414, 31415, 31416]);
export const CONTROL_PORT = 31414;
export const VIEWPORT = Object.freeze({ width: 800, height: 600 });
export const TEXT = Object.freeze({
  promptNote: "Prompt note",
  teleport: "Teleport pinned character",
  follows: /Your view follows/i,
  cannotSwitch: /cannot switch Scenes/i,
  canvasDisabled: "INFO.SceneViewCanvasDisabled",
  auditToast: /^Pinning on:/,
});

export const FIX = Object.freeze({
  prefix: PREFIX,
  users: { A: "PinTest-A", B: "PinTest-B", C: "PinTest-C" },
  actors: {
    alpha: { name: "PinTest Alpha", type: "character", owner: "A", link: true },
    // a summon: flags.dnd5e.summon.origin names Alpha (portals followersOf: `summoner`). Friendly,
    // as dnd5e makes a summon (the summoner's disposition): an npc's default is HOSTILE, and dnd5e's
    // movement automation then blocks a walk through its square — on a client with a canvas, a
    // plain update past the summon was constrained to no movement at all (S08, 2026-10-17).
    summon: { name: "PinTest Alpha Summon", type: "npc", owner: "A", link: false, summonOf: "alpha", disposition: "FRIENDLY" },
    // a pet: owned by A alone, no summon flag (followersOf: every owner also owns the leader); friendly
    pet: { name: "PinTest Alpha Pet", type: "npc", owner: "A", link: true, disposition: "FRIENDLY" },
    beta: { name: "PinTest Beta", type: "character", owner: "B", link: true },
    gamma: { name: "PinTest Gamma", type: "character", owner: "C", link: true },
    // S16's polymorph target, never placed
    wolf: { name: "PinTest Wolf", type: "npc", owner: null, link: false },
  },
  scenes: {
    north: { name: "PinTest North", width: 1400, height: 1000, grid: 100 },
    south: { name: "PinTest South", width: 1400, height: 1000, grid: 100,
      levels: [{ name: "Ground", elevation: { bottom: 0, top: 10 } }, { name: "Upper", elevation: { bottom: 10, top: 20 } }] },
  },
  portal: {
    north: { name: "PinTest Portal North", rect: { x: 1100, y: 400, width: 200, height: 200 } },
    south: { name: "PinTest Portal South", rect: { x: 100, y: 400, width: 200, height: 200 }, level: "Ground" },
  },
  pins: { A: "alpha", B: "beta" },
  summonItem: "PinTestSummon000",
});
const GRID = 100;

/** Token top-left positions (padding 0: canvas = scene coordinates). */
export const POS = Object.freeze({
  alphaN: { scene: "north", x: 200, y: 200 }, summonN: { scene: "north", x: 300, y: 200 }, petN: { scene: "north", x: 200, y: 300 },
  betaN: { scene: "north", x: 500, y: 200 }, gammaN: { scene: "north", x: 700, y: 200 },
  alphaS: { scene: "south", x: 900, y: 200 }, summonS: { scene: "south", x: 1000, y: 200 }, petS: { scene: "south", x: 900, y: 300 },
  betaS: { scene: "south", x: 600, y: 200 }, gammaS: { scene: "south", x: 700, y: 700 },
});
export const LAYOUT = Object.freeze({
  home: { alpha: POS.alphaN, summon: POS.summonN, pet: POS.petN, beta: POS.betaS, gamma: POS.gammaN },
  allNorth: { alpha: POS.alphaN, summon: POS.summonN, pet: POS.petN, beta: POS.betaN, gamma: POS.gammaN },
  allSouth: { alpha: POS.alphaS, summon: POS.summonS, pet: POS.petS, beta: POS.betaS, gamma: POS.gammaS },
});
export const SPOTS = Object.freeze({
  portalWalk: { x: 1150, y: 450 },                       // top-left: the token's centre lands mid-region
  sameScene: { scene: "north", x: 600, y: 750 },          // canvas points (a centre)
  crossScene: { scene: "south", x: 1000, y: 750 },
  copy: { scene: "south", x: 1100, y: 800 },
  emptyNorth: { x: 1000, y: 850 },
});

/* ── pure helpers (unit-tested in pins-live.test.mjs) ───────────────────── */

export class SkipError extends Error {}
export class RunnerError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const isTestName = (name, prefix = PREFIX) => typeof name === "string" && name.startsWith(prefix);

/** Active non-GM users that are not PinTest*: anyone an activation or a pull would move for real. */
export function realPlayersOnline(users, prefix = PREFIX) {
  return (users ?? []).filter(u => u?.active && !u.isGM && !isTestName(u.name, prefix)).map(u => u.name);
}

/** Only a loopback Foundry: the Cloudflare hostname 403s /join anyway, and admin is localhost-only. */
export function isLocalUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === "http:" || u.protocol === "https:") && ["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname);
  } catch {
    return false;
  }
}

/** "s6", "6", "S06" → "S06"; null when not a scenario id shape. */
export function normalizeId(raw) {
  const m = String(raw ?? "").trim().match(/^s?(\d{1,2})$/i);
  return m ? `S${m[1].padStart(2, "0")}` : null;
}

/** --timeout's ceiling: one day, far inside setTimeout's 2^31-1 ms. */
export const MAX_TIMEOUT_S = 86_400;

export function parseArgs(argv, known = Object.keys(SCENARIOS)) {
  const out = { mode: null, ids: [], url: null, timeoutS: 300, help: false };
  const modes = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--seed" || a === "--cleanup" || a === "--list") modes.push(a.slice(2));
    else if (a === "--run") {
      modes.push("run");
      while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        const id = normalizeId(argv[++i]);
        if (!id || !known.includes(id)) throw new Error(`unknown scenario ${argv[i]} (known: ${known.join(" ")})`);
        if (!out.ids.includes(id)) out.ids.push(id);
      }
    } else if (a === "--url") out.url = argv[++i] ?? null;
    else if (a === "--timeout") out.timeoutS = Number(argv[++i]);
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (out.help) return out;
  if (modes.length !== 1) throw new Error("pass exactly one of --seed, --run [ids...], --cleanup, --list");
  out.mode = modes[0];
  if (out.mode === "run" && !out.ids.length) out.ids = [...known];
  out.ids = known.filter(id => out.ids.includes(id));           // the table's order, whatever the argv order
  // setTimeout's delay is a signed 32-bit ms count: past ~24.8 days it fires at once (S6)
  if (!Number.isFinite(out.timeoutS) || out.timeoutS < 30 || out.timeoutS > MAX_TIMEOUT_S) {
    throw new Error(`--timeout takes seconds (30 to ${MAX_TIMEOUT_S})`);
  }
  if (out.url !== null && !isLocalUrl(out.url)) throw new Error(`--url must be a localhost Foundry URL, not ${out.url}`);
  return out;
}

/** The GM session hand-off: the helper writes it to fd 3, a pipe this process holds (runHelper secretFd). */
export const GM_COOKIE_ARGS = Object.freeze(["cookie", "--as", "gm", "--out", "/dev/fd/3"]);

/** What a failed `headless-gm cookie --as gm` means for the run. Never carries a secret. */
export function helperFailure(code, json = null, err = "") {
  const text = `${json?.error ?? ""} ${err ?? ""}`;
  if ((code === 5 || /infisical/i.test(text)) && /authenticat|infisical login/i.test(text)) {
    return { code: "infisicalLogin", message: "Infisical could not authenticate: Joe must run `infisical login` (in WSL), then re-run." };
  }
  if (code === 5) return { code: "adminPasswordUnavailable", message: `admin password unavailable: ${String(json?.error ?? err).slice(0, 200)}` };
  if (code === 2) return { code: "noWorld", message: "Foundry has no active world" };
  if (code === 4) return { code: "noGm", message: "the world has no Gamemaster (role 4) user" };
  return { code: "helperFailed", message: `headless-gm cookie --as gm exited ${code}: ${String(json?.error ?? err ?? "no output").slice(0, 200)}` };
}

export const newPassword = () => randomBytes(24).toString("base64url");

/** The broker's call_tool reply for eval-js → the script's return value; throws on any failure. */
export function parseEvalReply(msg) {
  if (msg?.error) throw new Error(`control channel: ${msg.error.message ?? "error"}`);
  const res = msg?.result;
  const text = Array.isArray(res?.content) ? res.content.find(c => c?.type === "text")?.text ?? null : null;
  if (res?.isError) throw new Error(String(text ?? "eval-js failed").slice(0, 500));
  let ev;
  try { ev = JSON.parse(text); } catch { throw new Error(`eval-js: unreadable reply ${String(text).slice(0, 200)}`); }
  if (!ev?.ok) throw new Error(`eval-js ${ev?.phase ?? "?"}: ${ev?.error ?? "failed"}${ev?.timedOut ? " (timed out)" : ""}`);
  return ev.result;
}

/** Submenu rows ("PinTest-A — PinTest Alpha") → { user, actor, enabled, note }. */
export function submenuUsers(sub) {
  return (sub ?? []).map(s => {
    const [user, ...rest] = String(s?.label ?? "").split(" — ");
    return { user: user.trim(), actor: rest.length ? rest.join(" — ").trim() : null, enabled: !s?.disabled, note: s?.note ?? null };
  });
}

/** Audit violations that concern the given users or actors (real pins may also be in the world). */
export function violationsFor(audit, { userIds = [], actorIds = [] } = {}) {
  const u = new Set(userIds), a = new Set(actorIds);
  return (audit?.violations ?? []).filter(v => u.has(v?.user?.id) || a.has(v?.actor?.id));
}

export const sceneKeyOf = (ids, sceneId) =>
  Object.entries(ids?.scenes ?? {}).find(([, id]) => id === sceneId)?.[0] ?? sceneId ?? null;

/** layoutState → { alpha: ["north 200,200"], ... } for evidence. */
export function compactLayout(layout, ids) {
  const out = {};
  for (const [k, toks] of Object.entries(layout ?? {})) {
    out[k] = toks === null ? null : toks.map(t => `${sceneKeyOf(ids, t.scene)} ${t.x},${t.y}`);
  }
  return out;
}

/**
 * Tokens of `layout` standing on a level their scene does not have (`ids` = opState: scenes and
 * levels by key). Core refuses every later move of such a token ("level must exist").
 * → [`<key> <sceneKey> <level>`], empty when all stand on a real floor.
 */
export function offFloor(layout, ids) {
  const byScene = Object.fromEntries(Object.entries(ids?.scenes ?? {}).map(([k, id]) => [id, (ids.levels?.[k] ?? []).map(l => l.id)]));
  const out = [];
  for (const [key, toks] of Object.entries(layout ?? {})) {
    for (const t of toks ?? []) {
      const have = byScene[t.scene];
      if (have && !have.includes(t.level)) out.push(`${key} ${sceneKeyOf(ids, t.scene)} ${t.level}`);
    }
  }
  return out;
}

export const tokensOn = (layout, key, sceneId) => (layout?.[key] ?? []).filter(t => t.scene === sceneId);
export const centreOf = (t, g = GRID) => ({ x: t.x + (t.w ?? 1) * g / 2, y: t.y + (t.h ?? 1) * g / 2 });
export const chebyshev = (p, q) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y));

/** C has no canvas, so Scene#view only toasts INFO.SceneViewCanvasDisabled naming the scene. */
export const sawCanvasDisabled = (toasts, sceneName) =>
  (toasts ?? []).some(t => t.raw === TEXT.canvasDisabled && (t.name === sceneName || String(t.text).includes(sceneName)));
export const cannotSwitchToasts = toasts => (toasts ?? []).filter(t => TEXT.cannotSwitch.test(`${t.raw} ${t.text}`));
export const followToasts = toasts => (toasts ?? []).filter(t => TEXT.follows.test(`${t.raw} ${t.text}`));

/**
 * What --seed removes before it seeds, from opSeedSnapshot's plain snapshot: a stopped run's
 * leftovers (duplicates, a transformed form, a scene with the wrong floors, a moved portal, prompt
 * tokens, journals, stray PinTest tokens or regions on real scenes) and every fixture token, which
 * the seed then lays fresh from the prototype (no stale level, elevation, flags or form).
 * A test document is one named PinTest*, a form whose flags.dnd5e.originalActor is a test actor, or
 * a token of one; an actorless token on a PinTest scene is one too. Nothing else is ever listed: a
 * real actor's token on a PinTest scene is reported in `kept`.
 * → { tokens: [{scene, ids}], regions: [{scene, ids}], scenes, actors, journals, resumeUsers, kept, reasons }
 */
export function stalePlan(snap, fix = FIX) {
  const isTest = n => typeof n === "string" && n.startsWith(fix.prefix);
  const plan = { tokens: [], regions: [], scenes: [], actors: [], journals: [], resumeUsers: [], kept: [], reasons: [] };
  const actors = snap?.actors ?? [];
  const testActor = new Set(actors.filter(a => isTest(a.name)).map(a => a.id));
  for (const a of actors) if (a.originalActor && testActor.has(a.originalActor)) testActor.add(a.id);
  const fixActorNames = new Set(Object.values(fix.actors).map(a => a.name));
  const keptActor = new Set();
  for (const a of actors) {
    if (!testActor.has(a.id)) continue;
    if (fixActorNames.has(a.name) && !a.originalActor && !keptActor.has(a.name)) { keptActor.add(a.name); continue; }
    plan.actors.push(a.id);
    plan.reasons.push(`actor ${a.name}: ${a.originalActor ? "a transformed form" : fixActorNames.has(a.name) ? "a duplicate" : "not in the fixture"}`);
  }
  const sceneKey = Object.fromEntries(Object.entries(fix.scenes).map(([k, sc]) => [sc.name, k]));
  const keptScene = new Set();
  const sameList = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const isTestToken = t => isTest(t.name) || testActor.has(t.actorId) || (!!t.originalActor && testActor.has(t.originalActor));
  for (const sc of snap?.scenes ?? []) {
    const test = isTest(sc.name);
    const key = test ? sceneKey[sc.name] : undefined;
    if (test) {
      const spec = key ? fix.scenes[key] : null;
      const want = spec?.levels?.map(l => l.name) ?? null;
      let why = null;
      if (!spec) why = "not in the fixture";
      else if (keptScene.has(sc.name)) why = "a duplicate";
      else if (want && !sameList(sc.levels ?? [], want)) why = `levels [${(sc.levels ?? []).join(", ")}] where the fixture has [${want.join(", ")}]`;
      if (why) { plan.scenes.push(sc.id); plan.reasons.push(`scene ${sc.name}: ${why}`); continue; }
      keptScene.add(sc.name);
    }
    const toks = [];
    for (const t of sc.tokens ?? []) {
      if (isTestToken(t) || (test && !t.actorId)) toks.push(t.id);
      else if (test) plan.kept.push(`token ${t.name} (actor ${t.actorId}) on ${sc.name}: not a PinTest document`);
    }
    if (toks.length) plan.tokens.push({ scene: sc.id, ids: toks });
    const regs = [];
    const portal = key ? fix.portal[key] : null;
    let portalKept = false;
    for (const r of sc.regions ?? []) {
      if (!test) {
        if (isTest(r.name)) { regs.push(r.id); plan.reasons.push(`region ${r.name} on ${sc.name}: a stray`); }
        continue;
      }
      let why = null;
      if (!portal || r.name !== portal.name) why = "not in the fixture";
      else if (portalKept) why = "a duplicate";
      else {
        const sh = r.shapes ?? [];
        const rect = sh.length === 1 && sh[0].type === "rectangle"
          && ["x", "y", "width", "height"].every(k => sh[0][k] === portal.rect[k]);
        const wantLv = portal.level && (sc.levels ?? []).length > 1 ? [portal.level] : [];
        if (!rect) why = "moved or reshaped";
        else if (!sameList(r.levels ?? [], wantLv)) why = `on levels [${(r.levels ?? []).join(", ")}], not [${wantLv.join(", ")}]`;
        else if (!(r.behaviors ?? []).includes("teleportToken")) why = "no Teleport Token behaviour";
      }
      if (why) { regs.push(r.id); plan.reasons.push(`region ${r.name} on ${sc.name}: ${why}`); } else portalKept = true;
    }
    if (regs.length) plan.regions.push({ scene: sc.id, ids: regs });
  }
  for (const j of snap?.journals ?? []) if (isTest(j.name)) { plan.journals.push(j.id); plan.reasons.push(`journal ${j.name}`); }
  for (const u of snap?.users ?? []) if (isTest(u.name) && !u.isGM && u.resumeView) plan.resumeUsers.push(u.id);
  return plan;
}

/** opRestore's result → did it put everything back? (no stash = nothing to put back) */
export function restoreSucceeded(restored) {
  if (restored == null) return true;
  return !restored.error && restored.pinningError === undefined;
}

/**
 * The process exit code (the header's "Exit codes"). A restore that did not put everything back wins
 * (1: run --cleanup), then a refusal (2; 3 for `infisical login`), then a failed scenario or an
 * incomplete --seed (1).
 */
export function exitCodeFor({ refused = null, failed = 0, restoreOk = true, ok = true } = {}) {
  if (refused?.code === "infisicalLogin") return 3;
  if (!restoreOk) return 1;
  if (refused) return 2;
  return failed || !ok ? 1 : 0;
}

export function summarize(results) {
  const passed = results.filter(r => r.pass).length;
  const skipped = results.filter(r => r.skipped).length;
  return { total: results.length, passed, skipped, failed: results.length - passed - skipped,
    failedIds: results.filter(r => !r.pass && !r.skipped).map(r => r.id) };
}

const TIMED_OUT = Symbol("timedOut");

/**
 * `work(signal)` with a deadline (S1). On timeout `signal` is aborted — every Ctx world action,
 * GM-page gesture and wait checks it, so a timed-out scenario stops writing — and the caller waits
 * up to `graceMs` for `work` to settle, so nothing of it lands after the run moves on (the next
 * scenario, or the restore). Rejects with `message` (`err.timedOut`, `err.settled`). `parent`: an
 * outer signal (Ctrl-C, or S18's own deadline) that aborts this one too.
 */
export async function withDeadline(work, ms, message, { graceMs = 30_000, parent = null } = {}) {
  const ac = new AbortController();
  const onParent = () => ac.abort(parent.reason ?? new Error("aborted"));
  if (parent?.aborted) onParent();
  else parent?.addEventListener?.("abort", onParent, { once: true });
  const p = Promise.resolve().then(() => work(ac.signal));
  const outcome = p.then(v => ({ v }), e => ({ e }));
  let timer;
  const deadline = new Promise(r => { timer = setTimeout(() => r(TIMED_OUT), ms); });
  const aborted = new Promise(r => ac.signal.addEventListener("abort", () => r(TIMED_OUT), { once: true }));
  try {
    const first = await Promise.race([outcome, deadline, aborted]);
    if (first !== TIMED_OUT) {
      if ("e" in first) throw first.e;
      return first.v;
    }
    const why = parent?.aborted ? String(parent.reason?.message ?? parent.reason ?? "aborted") : message;
    if (!ac.signal.aborted) ac.abort(new Error(why));
    let g;
    const settled = await Promise.race([outcome.then(() => true), new Promise(r => { g = setTimeout(() => r(false), graceMs); })]);
    clearTimeout(g);
    const err = new Error(settled ? why : `${why} (still running after ${Math.round(graceMs / 1000)} s grace)`);
    err.timedOut = true;
    err.settled = settled;
    throw err;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener?.("abort", onParent);
  }
}

/** A sleep that ends early (rejecting) when `signal` aborts. */
export function sleepFor(ms, signal = null) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("aborted"));
    const t = setTimeout(() => { signal?.removeEventListener?.("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(signal.reason ?? new Error("aborted")); };
    signal?.addEventListener?.("abort", onAbort, { once: true });
  });
}

/**
 * One runner at a time (S5): an O_EXCL lock file holding the pid. A lock whose pid is gone is
 * stale and taken over. → a release function; throws RunnerError("busy") while another run lives.
 */
export function acquireLock(file, { pid = process.pid, alive = pidAlive } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, "wx", 0o600);
      writeSync(fd, String(pid));
      closeSync(fd);
      return () => {
        try { if (readFileSync(file, "utf8").trim() === String(pid)) unlinkSync(file); } catch { /* gone */ }
      };
    } catch (err) {
      if (err?.code !== "EEXIST") throw err;
      let holder = NaN;
      try { holder = Number(readFileSync(file, "utf8").trim()); } catch { /* vanished: retry */ }
      if (Number.isInteger(holder) && holder > 0 && holder !== pid && alive(holder)) {
        throw new RunnerError("busy", `another pins-live run (pid ${holder}) holds ${file}: it shares the stash and the fixture`);
      }
      try { unlinkSync(file); } catch { /* raced away */ }
    }
  }
  throw new RunnerError("busy", `could not take ${file}`);
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (err) { return err?.code === "EPERM"; }
}

/** The repo's .state/ (gitignored); PINS_LIVE_STATE_DIR moves it (the unit tests). Nothing secret goes there. */
const stateDir = () => { const d = process.env.PINS_LIVE_STATE_DIR || path.join(REPO, ".state"); mkdirSync(d, { recursive: true }); return d; };
/** The lock holds a pid. */
export const lockPath = () => path.join(stateDir(), "pins-live.lock");
/** This run's JSON lines (the same lines as stdout, after a header), rewritten by every --seed/--run/--cleanup. */
export const runLogPath = () => path.join(stateDir(), "pins-live.jsonl");

/**
 * Open `file` for this run's JSON lines (D2): truncated first, so a stopped run's lines can never pass
 * for this run's, then `header` (`{run: true, mode, runId, startedAt, ...}`). A file with a header and
 * no `summary` line is a run that was stopped (or is still running: see the lock). When stdout is
 * already redirected to `file` (`> .state/pins-live.jsonl`) nothing is mirrored: the shell truncated
 * it and stdout writes every line. Writes are best effort: the log never fails the run.
 */
export function openRunLog(file, header, { stdoutFd = 1 } = {}) {
  const off = { file, mirrored: false, write() {}, close() {} };
  try {
    if (stdoutFd != null) {
      const a = fstatSync(stdoutFd), b = statSync(file);
      if (a.dev === b.dev && a.ino === b.ino) return off;
    }
  } catch { /* no such file yet, or stdout is not a file */ }
  let fd;
  try { fd = openSync(file, "w", 0o600); } catch { return off; }
  const write = obj => { try { writeSync(fd, JSON.stringify(obj) + "\n"); } catch { /* best effort */ } };
  write(header);
  return { file, mirrored: true, write, close: () => { try { closeSync(fd); } catch { /* closed */ } } };
}

/**
 * The signals that stop a run and still restore (S2, R-sighup). Puppeteer's own handlers for each are
 * off (PUPPETEER_SIGNAL_OPTIONS), so each must be the runner's, or Node's default kills it unrestored.
 */
export const STOP_SIGNALS = Object.freeze(["SIGINT", "SIGTERM", "SIGHUP"]);
export const PUPPETEER_SIGNAL_OPTIONS = Object.freeze({ handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false });

/** `onSignal(sig)` for every STOP_SIGNALS on `proc`; → a function that takes them off again. */
export function installStopHandlers(onSignal, proc = process) {
  const handlers = STOP_SIGNALS.map(sig => [sig, () => onSignal(sig)]);
  for (const [sig, h] of handlers) proc.on(sig, h);
  return () => { for (const [sig, h] of handlers) proc.off(sig, h); };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── code that runs in a page (serialised; no closures over this module) ── */

/**
 * Blocks the MCP bridge on a GM-level page: WebSocket and fetch to the broker ports throw. Installed
 * with evaluateOnNewDocument, so it is in place before any module script runs.
 */
export function installBridgeGuard(ports, w = globalThis) {
  const blocked = url => {
    try {
      const u = new URL(String(url), w.location?.href ?? "http://127.0.0.1/");
      return ports.includes(Number(u.port));
    } catch {
      return false;
    }
  };
  const Native = w.WebSocket;
  if (typeof Native === "function" && !Native.__pinsLiveGuard) {
    const Guarded = function WebSocket(url, protocols) {
      if (blocked(url)) throw new DOMException(`pins-live: the MCP bridge is blocked on this page (${url})`, "SecurityError");
      return protocols === undefined ? new Native(url) : new Native(url, protocols);
    };
    Guarded.prototype = Native.prototype;
    for (const k of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) Guarded[k] = Native[k];
    Guarded.__pinsLiveGuard = true;
    w.WebSocket = Guarded;
  }
  const nativeFetch = w.fetch;
  if (typeof nativeFetch === "function" && !nativeFetch.__pinsLiveGuard) {
    const guardedFetch = function fetch(input, init) {
      const url = typeof input === "string" ? input : input?.url;
      if (blocked(url)) return Promise.reject(new TypeError("pins-live: the MCP bridge's signalling is blocked on this page"));
      return nativeFetch.call(w, input, init);
    };
    guardedFetch.__pinsLiveGuard = true;
    w.fetch = guardedFetch;
  }
  return blocked;
}

/**
 * Every page: records each ui.notifications toast (raw key, format name, text, seq) in
 * window.__pinsLive, and on the GM page counts the right-click events that reach #board.
 * `noCanvas` sets Foundry's own client switch (localStorage core.noCanvas) before the game loads.
 */
export function installPageProbes(opts = {}, w = globalThis) {
  try {
    if (typeof opts.noCanvas === "boolean") w.localStorage?.setItem("core.noCanvas", opts.noCanvas ? "true" : "false");
  } catch { /* storage blocked */ }
  if (w.__pinsLive) return w.__pinsLive;
  // GM page: dice-so-nice's 3D dice overlay. A persistent die left on the GM user's dice table (a
  // world flag this runner never touches) sits over the board; a right press on it is the die's
  // (dice-so-nice grabs it and captures the pointer to <html>), so the release never reaches
  // #board and no canvas menu can open there. Hidden on this page only, by CSS: nothing is written.
  if (opts.hideDice && w.document?.addEventListener) {
    w.document.addEventListener("DOMContentLoaded", () => {
      const st = w.document.createElement("style");
      st.dataset.pinsLive = "hide-dice";
      st.textContent = "#dice-box-canvas { display: none !important; }";
      w.document.head?.append(st);
    });
  }
  const store = { seq: 0, toasts: [], board: { down: 0, up: 0, contextmenu: 0 } };
  w.__pinsLive = store;
  const wrap = () => {
    const n = w.ui?.notifications;
    if (!n || typeof n.notify !== "function" || n.__pinsLiveWrapped) return;
    const orig = n.notify;
    n.notify = function notify(message, type = "info", options = {}) {
      let text = String(message);
      try {
        if (options?.format || options?.localize) text = w.game.i18n.format(String(message), options.format ?? {});
      } catch { /* i18n not ready */ }
      store.toasts.push({ seq: ++store.seq, t: Date.now(), type, raw: String(message).slice(0, 200),
        name: options?.format?.name ?? null, text: String(text).slice(0, 300) });
      return orig.call(this, message, type, options);
    };
    n.__pinsLiveWrapped = true;
  };
  wrap();
  if (typeof w.setInterval === "function") w.setInterval(wrap, 50);
  if (opts.board && typeof w.addEventListener === "function") {
    const count = k => ev => { if (ev?.target?.id === "board") store.board[k] += 1; };
    w.addEventListener("pointerdown", count("down"), true);
    w.addEventListener("pointerup", count("up"), true);
    w.addEventListener("contextmenu", count("contextmenu"), true);
    // evidence only: where the last right press and release really landed
    const where = ev => { const t = ev?.target; return t ? `${t.tagName ?? "?"}#${t.id ?? ""}.${String(t.className ?? "").slice(0, 60)}` : null; };
    for (const type of ["pointerdown", "pointerup", "contextmenu"]) {
      w.addEventListener(type, ev => { if (ev?.button === 2 || type === "contextmenu") store.last = { ...(store.last ?? {}), [type]: where(ev) }; }, true);
    }
  }
  return store;
}

export const bridgeGuardSource = () => `(${installBridgeGuard.toString()})(${JSON.stringify(BRIDGE_PORTS)});`;
export const probesSource = opts => `(${installPageProbes.toString()})(${JSON.stringify(opts ?? {})});`;

/** Helpers every op gets as `H`. Runs in the client (GM page, a player page, or the bot via eval-js). */
function clientHelpers(FIX) {
  const P = FIX.prefix;
  const isTest = n => typeof n === "string" && n.startsWith(P);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const scene = k => game.scenes.find(s => s.name === FIX.scenes[k]?.name) ?? null;
  const actor = k => game.actors.find(a => a.name === FIX.actors[k]?.name) ?? null;
  const user = k => game.users.find(u => u.name === FIX.users[k]) ?? null;
  const region = k => scene(k)?.regions.find(r => r.name === FIX.portal[k]?.name) ?? null;
  // a wild-shaped token points at its form actor and names the original in flags.dnd5e.originalActor
  const tokensOf = actorId => {
    const out = [];
    for (const s of game.scenes) {
      for (const t of s.tokens) if (t.actorId === actorId || t.flags?.dnd5e?.originalActor === actorId) out.push(t);
    }
    return out;
  };
  const levelId = (s, name) => {
    if (!s) return null;
    if (name) return s.levels?.find?.(l => l.name === name)?.id ?? null;
    return s.initialLevel?.id ?? s.levels?.contents?.[0]?.id ?? null;
  };
  const info = t => (t ? { id: t.id, scene: t.parent?.id ?? null, x: t.x, y: t.y, w: t.width, h: t.height,
    level: t.level ?? null, actorId: t.actorId, name: t.name } : null);
  const displace = (id, x, y, level) => ({ animate: false,
    movement: { [id]: { waypoints: [{ x, y, action: "displace", ...(level ? { level } : {}) }] } } });
  const waitFor = async (pred, ms = 10000, step = 100) => {
    const end = Date.now() + ms;
    let v = null;
    while (Date.now() < end) {
      try { v = await pred(); } catch { v = null; }
      if (v) return v;
      await sleep(step);
    }
    return v;
  };
  const layoutState = () => {
    const out = {};
    for (const k of Object.keys(FIX.actors)) {
      const a = actor(k);
      out[k] = a ? tokensOf(a.id).map(info) : null;
    }
    return out;
  };
  const viewScene = async k => {
    const s = scene(k);
    if (!s) throw new Error(`no scene ${k}`);
    if (globalThis.canvas?.scene?.id !== s.id) await s.view();
    await waitFor(() => canvas.ready && canvas.scene?.id === s.id && !canvas.loading, 30000);
    return s;
  };
  const plain = v => JSON.parse(JSON.stringify(v ?? null));
  return { FIX, P, isTest, sleep, scene, actor, user, region, tokensOf, levelId, info, displace, waitFor, layoutState, viewScene, plain };
}

/** One expression that runs `fn(H, args)` in the client and resolves to its JSON string. */
export function composeExpression(fn, args = {}, fix = FIX) {
  return `(async () => { const H = (${clientHelpers.toString()})(${JSON.stringify(fix)}); `
    + `const R = await (${fn.toString()})(H, ${JSON.stringify(args ?? {})}); `
    + "return JSON.stringify(R === undefined ? null : R); })()";
}

/* ── ops: world actions, run by the GM page or (S18) the bot ───────────── */

async function opPreflight(H) {
  const mods = {};
  for (const id of ["pentaryn-pins", "pentaryn-portals", "pentaryn-prompts", "pentaryn-resume", "foundry-mcp-bridge", "lib-wrapper"]) {
    const m = game.modules.get(id);
    mods[id] = m ? { active: !!m.active, version: m.version } : null;
  }
  let pinning = null;
  try { pinning = game.settings.get("pentaryn-pins", "pinning"); } catch { /* not registered */ }
  return {
    world: game.world.id, user: game.user.name, role: game.user.role, isGM: !!game.user.isGM,
    activeGM: game.users.activeGM?.name ?? null, core: game.version, system: `${game.system.id}@${game.system.version}`,
    mods, pinning,
    pinsApi: typeof game.pentaryn?.pins?.teleport === "function",
    portalsTeleportToken: typeof game.pentaryn?.portals?.teleportToken === "function",
    portalsTeleportParty: typeof game.pentaryn?.portals?.teleportParty === "function",
    promptsPlace: typeof game.pentaryn?.prompts?.place === "function",
    activeScene: game.scenes.active ? { id: game.scenes.active.id, name: game.scenes.active.name } : null,
    realOnline: game.users.filter(u => u.active && !u.isGM && !H.isTest(u.name)).map(u => u.name),
    otherGmsOnline: game.users.filter(u => u.active && u.isGM && u.id !== game.user.id).map(u => u.name),
    bridgeConnected: globalThis.foundryMCPBridge?.getStatus?.()?.connected === true,
  };
}

async function opState(H) {
  const F = H.FIX;
  const missing = [];
  const users = {}, actors = {}, scenes = {}, regions = {}, levels = {}, pins = {};
  for (const k of Object.keys(F.users)) { const u = H.user(k); if (u) users[k] = u.id; else missing.push(F.users[k]); }
  for (const k of Object.keys(F.actors)) { const a = H.actor(k); if (a) actors[k] = a.id; else missing.push(F.actors[k].name); }
  for (const k of Object.keys(F.scenes)) {
    const s = H.scene(k);
    if (!s) { missing.push(F.scenes[k].name); continue; }
    scenes[k] = s.id;
    levels[k] = s.levels.contents.map(l => ({ id: l.id, name: l.name }));
    const r = H.region(k);
    if (r) regions[k] = r.uuid; else missing.push(F.portal[k].name);
  }
  for (const [uk, ak] of Object.entries(F.pins)) {
    let flag = null;
    try { flag = H.user(uk)?.getFlag("pentaryn-pins", "actor") ?? null; } catch { /* pins inactive */ }
    pins[uk] = flag;
    if (actors[ak] && flag !== actors[ak]) missing.push(`pin ${F.users[uk]} → ${F.actors[ak].name}`);
  }
  const sceneNames = Object.fromEntries(Object.entries(F.scenes).map(([k, s]) => [k, s.name]));
  return { ok: missing.length === 0, missing, users, actors, scenes, sceneNames, regions, levels, pins };
}

async function opSeed(H) {
  const F = H.FIX;
  const notes = [];
  const OWNER = CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
  for (const [key, spec] of Object.entries(F.actors)) {
    const owner = spec.owner ? H.user(spec.owner) : null;
    if (spec.owner && !owner) throw new Error(`no user ${F.users[spec.owner]}`);
    const ownership = { default: 0, ...(owner ? { [owner.id]: OWNER } : {}) };
    const disp = spec.disposition ? { disposition: CONST.TOKEN_DISPOSITIONS[spec.disposition] } : {};
    const a = H.actor(key);
    if (!a) await Actor.create({ name: spec.name, type: spec.type, ownership, prototypeToken: { name: spec.name, actorLink: !!spec.link, ...disp } });
    else await a.update({ ownership, "prototypeToken.actorLink": !!spec.link, ...(spec.disposition ? { "prototypeToken.disposition": disp.disposition } : {}) });
  }
  for (const [key, spec] of Object.entries(F.actors)) {
    if (!spec.summonOf) continue;
    await H.actor(key).update({ "flags.dnd5e.summon.origin": `Actor.${H.actor(spec.summonOf).id}.Item.${F.summonItem}` });
  }
  for (const [key, spec] of Object.entries(F.scenes)) {
    if (H.scene(key)) continue;
    const base = { name: spec.name, width: spec.width, height: spec.height, padding: 0, grid: { size: spec.grid },
      tokenVision: false, navigation: true, fog: { exploration: false } };
    if (!spec.levels) { await Scene.create(base); continue; }
    try {
      await Scene.create({ ...base, levels: spec.levels });
    } catch (err) {
      notes.push(`${spec.name}: two levels refused (${String(err?.message ?? err).slice(0, 120)}); created with one`);
      if (!H.scene(key)) await Scene.create(base);
    }
  }
  const behavior = { name: "Teleport", type: "teleportToken",
    system: { destinations: [], placement: "center", snap: true, choice: false, revealed: true, transition: { type: null, duration: 0 } } };
  for (const [key, spec] of Object.entries(F.portal)) {
    const s = H.scene(key);
    if (H.region(key)) continue;
    const levelIds = spec.level && s.levels.size > 1 ? [H.levelId(s, spec.level)].filter(Boolean) : [];
    await s.createEmbeddedDocuments("Region", [{ name: spec.name, color: "#8a5cff",
      shapes: [{ type: "rectangle", ...spec.rect, rotation: 0 }], levels: levelIds,
      visibility: CONST.REGION_VISIBILITY.LAYER_UNLOCKED, behaviors: [behavior] }]);
  }
  // the two-way link, as context/foundry/scene-links.md builds it (no confirm dialog: choice false)
  for (const [key, other] of [["north", "south"], ["south", "north"]]) {
    const b = H.region(key).behaviors.find(x => x.type === "teleportToken");
    await b.update({ "system.destinations": [H.region(other).uuid], "system.choice": false });
  }
  return { notes, levels: Object.fromEntries(Object.keys(F.scenes).map(k => [k, H.scene(k).levels.size])) };
}

async function opPin(H) {
  const out = {};
  for (const [uk, ak] of Object.entries(H.FIX.pins)) {
    const r = await game.pentaryn.pins.pin(H.FIX.users[uk], { actor: H.actor(ak).id, replace: true });
    out[uk] = { ok: !!r?.ok, code: r?.code ?? null, warning: r?.warning ?? null };
  }
  return out;
}

/** Put each named actor's ONE token where the layout says (null: no token). Cross-scene = keepId create + delete. */
async function opArrange(H, a) {
  for (const [key, want] of Object.entries(a.layout ?? {})) {
    const act = H.actor(key);
    if (!act) throw new Error(`no actor for ${key}`);
    const toks = H.tokensOf(act.id);
    if (!want) {
      for (const t of toks) await t.parent.deleteEmbeddedDocuments("Token", [t.id]);
      continue;
    }
    const dest = H.scene(want.scene);
    if (!dest) throw new Error(`no scene ${want.scene}`);
    const level = H.levelId(dest, want.level ?? null);
    const spec = H.FIX.actors[key];
    const disp = spec.disposition ? CONST.TOKEN_DISPOSITIONS[spec.disposition] : null;
    let kept = toks.find(t => t.parent === dest) ?? null;
    if (kept && disp !== null && kept.disposition !== disp) await kept.update({ disposition: disp });
    if (kept) {
      const lv = want.level ? level : null;
      if (kept.x !== want.x || kept.y !== want.y || (lv && kept.level !== lv)) {
        await kept.update({ x: want.x, y: want.y, ...(lv ? { level: lv } : {}) }, H.displace(kept.id, want.x, want.y, lv));
      }
    } else {
      const src = toks[0] ?? null;
      const base = src ? src.toObject() : (await act.getTokenDocument({ x: want.x, y: want.y })).toObject();
      const data = { ...base, x: want.x, y: want.y, level, actorLink: !!spec.link, ...(disp !== null ? { disposition: disp } : {}) };
      const keepId = !!src && !dest.tokens.has(src.id);
      if (!keepId) delete data._id;
      [kept] = await dest.createEmbeddedDocuments("Token", [data], { keepId });
    }
    for (const t of toks) {
      if (t.parent === kept.parent && t.id === kept.id) continue;
      if (t.parent?.tokens?.has(t.id)) await t.parent.deleteEmbeddedDocuments("Token", [t.id]);
    }
  }
  await H.sleep(250);
  return H.layoutState();
}

async function opLayout(H) {
  return H.layoutState();
}

async function opCopyToken(H, a) {
  const act = H.actor(a.actor);
  const src = H.tokensOf(act.id)[0];
  if (!src) throw new Error(`${act.name} has no token to copy`);
  const dest = H.scene(a.scene);
  const data = { ...src.toObject(), x: a.x, y: a.y, level: H.levelId(dest, null) };
  delete data._id;
  const [t] = await dest.createEmbeddedDocuments("Token", [data]);
  return H.info(t);
}

async function opDeleteToken(H, a) {
  const s = game.scenes.get(a.scene);
  if (s?.tokens.has(a.id)) await s.deleteEmbeddedDocuments("Token", [a.id]);
  return H.layoutState();
}

async function opSetPinning(H, a) {
  const before = game.settings.get("pentaryn-pins", "pinning");
  if (before !== a.value) await game.settings.set("pentaryn-pins", "pinning", a.value);
  await H.sleep(300);
  return { before, after: game.settings.get("pentaryn-pins", "pinning") };
}

/** Activate a scene. Already active and `pullIfActive`: pull the PinTest players instead (a setup re-sync). */
async function opActivate(H, a) {
  const s = H.scene(a.scene);
  if (!s.active) await s.activate();
  else if (a.pullIfActive) s.pullUsers(game.users.filter(u => u.active && !u.isGM && H.isTest(u.name)));
  await H.sleep(200);
  return { active: game.scenes.active?.id ?? null };
}

async function opPull(H, a) {
  const users = a.users.map(k => H.user(k)).filter(u => u?.active);
  H.scene(a.scene).pullUsers(users);
  await H.sleep(200);
  return { pulled: users.map(u => u.name) };
}

/** A plain walk (not a displace): crossing a portal region fires core's Teleport Token. */
async function opWalk(H, a) {
  const act = H.actor(a.actor);
  const toks = H.tokensOf(act.id);
  if (toks.length !== 1) throw new Error(`${act.name} has ${toks.length} tokens`);
  const t = toks[0];
  const from = t.parent.id;
  await t.update({ x: a.x, y: a.y });
  const moved = await H.waitFor(() => (H.tokensOf(act.id).some(x => x.parent.id !== from) ? true : null), a.waitMs ?? 20000);
  return { moved: !!moved, from, layout: H.layoutState() };
}

/** Wait until every listed actor has a token on `scene` and none elsewhere. */
async function opWaitOn(H, a) {
  const sid = H.scene(a.scene).id;
  const ok = await H.waitFor(() => a.actors.every(k => {
    const toks = H.tokensOf(H.actor(k).id);
    return toks.length > 0 && toks.every(t => t.parent.id === sid);
  }) || null, a.waitMs ?? 15000);
  return { ok: !!ok, layout: H.layoutState() };
}

async function opPinsTeleport(H, a) {
  const s = H.scene(a.scene);
  const res = await game.pentaryn.pins.teleport(H.FIX.users[a.user],
    { x: a.x, y: a.y, scene: s.id, ...(a.level ? { level: H.levelId(s, a.level) } : {}) });
  await H.sleep(400);
  return { res: H.plain(res), layout: H.layoutState() };
}

/** GM page only: teleportParty reads canvas.scene. */
async function opTeleportParty(H, a) {
  await H.viewScene(a.from);
  const res = await game.pentaryn.portals.teleportParty(H.region(a.to), { confirm: false });
  await H.sleep(500);
  return { res: H.plain(res), layout: H.layoutState() };
}

async function opAudit(H) {
  return H.plain(game.pentaryn.pins.audit());
}

async function opInspect(H, a) {
  const ref = H.FIX.users[a.user];
  return { inspect: H.plain(game.pentaryn.pins.inspect(ref)), pinnedToken: H.plain(game.pentaryn.pins.pinnedToken(ref)) };
}

async function opActiveUsers(H) {
  return game.users.filter(u => u.active && !u.isGM).map(u => u.name);
}

async function opRealOnline(H) {
  return game.users.filter(u => u.active && !u.isGM && !H.isTest(u.name)).map(u => u.name);
}

/**
 * The originals the run changes, kept on PinTest North (with this run's id) so the end of the run, or
 * --cleanup after a crash, can put the active scene back. A stopped run's stash is replaced: the switch
 * value is read now (R2: the old value is history and Joe may have changed it since); its original real
 * scene and GM resume view are kept while a PinTest scene is still the active one.
 */
async function opStash(H, a) {
  const north = H.scene("north");
  let old = null;
  try { old = JSON.parse(north.getFlag("world", "pinsLiveStash") ?? "null"); } catch { /* garbled: replaced */ }
  if (old && a.runId && old.runId === a.runId) return { kept: true, stale: null, stash: old };
  const active = game.scenes.active;
  const real = active && !H.isTest(active.name) ? active : null;
  const stash = { runId: a.runId ?? null, at: new Date().toISOString(),
    active: real ? real.id : (old?.active ?? null), activeName: real ? real.name : (old?.activeName ?? null),
    pinning: game.settings.get("pentaryn-pins", "pinning"), gmResume: old ? (old.gmResume ?? null) : (a.gmResume ?? null) };
  await north.setFlag("world", "pinsLiveStash", JSON.stringify(stash));
  return { kept: false, stale: old ? { at: old.at ?? null, pinning: old.pinning ?? null, runId: old.runId ?? null } : null, stash };
}

async function opRestore(H, a) {
  const north = H.scene("north");
  let stash = null;
  try { stash = JSON.parse(north?.getFlag("world", "pinsLiveStash") ?? "null"); } catch { /* garbled */ }
  const out = { stash: !!stash };
  if (!stash) return out;
  out.own = !!a.runId && stash.runId === a.runId;
  if (out.own) {
    try {
      if (game.settings.get("pentaryn-pins", "pinning") !== stash.pinning) await game.settings.set("pentaryn-pins", "pinning", stash.pinning);
      out.pinning = stash.pinning;
    } catch (err) {
      out.pinningError = String(err?.message ?? err);
    }
  } else {
    // a stopped run's stash (R2): its switch value is from when THAT run started, and the live switch is
    // Joe's (ON, six real players pinned). It is never written back: reported, for a person to decide.
    let now = null, pinsActive = true;
    try { now = game.settings.get("pentaryn-pins", "pinning"); } catch { pinsActive = false; }
    if (!pinsActive) {
      // pentaryn-pins disabled: its setting is not registered, but the world's Setting document still
      // holds the stored value (JSON; none stored = the default, off). Read it, never write it (#8).
      try {
        const doc = game.settings.storage?.get?.("world")?.getSetting?.("pentaryn-pins.pinning");
        const raw = doc?._source?.value ?? null;
        now = doc ? (raw === null ? null : JSON.parse(raw)) : false;
      } catch { now = null; }
    }
    out.pinningLeft = { now, stashed: stash.pinning ?? null, at: stash.at ?? null, pinsActive };
  }
  const active = game.scenes.active;
  if (!active || H.isTest(active.name)) {
    const orig = stash.active ? game.scenes.get(stash.active) : null;
    if (orig) { await orig.activate(); out.active = orig.name; }
    else if (active) { await active.update({ active: false }); out.active = null; }
  } else out.active = active.name;
  out.gmResume = stash.gmResume ?? null;
  // a switch that could not be put back keeps the stash, so a later --cleanup / --seed can retry (S3)
  if (a.dropStash && out.pinningError === undefined) await north.unsetFlag("world", "pinsLiveStash");
  out.stashKept = out.pinningError !== undefined || !a.dropStash;
  return out;
}

/** Everything named PinTest*, by name. Strays (a PinTest token or region on another scene) too. */
async function opCleanup(H, a) {
  const done = { tokens: 0, regions: 0, scenes: 0, actors: 0, journals: 0, users: 0, keptStashScene: null };
  const testActorIds = new Set(game.actors.filter(a => H.isTest(a.name)).map(a => a.id));
  for (const s of game.scenes) {
    if (H.isTest(s.name)) continue;
    const toks = s.tokens.filter(t => H.isTest(t.name) || testActorIds.has(t.actorId)).map(t => t.id);
    if (toks.length) { await s.deleteEmbeddedDocuments("Token", toks); done.tokens += toks.length; }
    const regs = s.regions.filter(r => H.isTest(r.name)).map(r => r.id);
    if (regs.length) { await s.deleteEmbeddedDocuments("Region", regs); done.regions += regs.length; }
  }
  // a restore that failed keeps the scene holding the stash: deleting it would lose the originals (S3)
  const keep = a?.keepStash ? game.scenes.find(s => H.isTest(s.name) && s.getFlag("world", "pinsLiveStash")) : null;
  if (keep) done.keptStashScene = keep.name;
  const scenes = game.scenes.filter(s => H.isTest(s.name) && s.id !== keep?.id).map(s => s.id);
  if (scenes.length) { await Scene.deleteDocuments(scenes); done.scenes = scenes.length; }
  const actors = game.actors.filter(a => H.isTest(a.name)).map(a => a.id);
  if (actors.length) { await Actor.deleteDocuments(actors); done.actors = actors.length; }
  const journals = game.journal.filter(j => H.isTest(j.name)).map(j => j.id);
  if (journals.length) { await JournalEntry.deleteDocuments(journals); done.journals = journals.length; }
  const users = game.users.filter(u => H.isTest(u.name) && !u.isGM).map(u => u.id);
  if (users.length) { await User.deleteDocuments(users); done.users = users.length; }
  return done;
}

/** --seed: the world as plain ids and names, for stalePlan (in the runner). Read-only. */
async function opSeedSnapshot(H) {
  return {
    actors: game.actors.map(a => ({ id: a.id, name: a.name, originalActor: a.flags?.dnd5e?.originalActor ?? null })),
    scenes: game.scenes.map(s => ({ id: s.id, name: s.name, levels: (s.levels?.contents ?? []).map(l => l.name),
      tokens: s.tokens.map(t => ({ id: t.id, name: t.name, actorId: t.actorId ?? null, originalActor: t.flags?.dnd5e?.originalActor ?? null })),
      regions: s.regions.map(r => ({ id: r.id, name: r.name,
        shapes: (r.shapes ?? []).map(sh => ({ type: sh.type, x: sh.x, y: sh.y, width: sh.width, height: sh.height })),
        levels: [...(r.levels ?? [])].map(id => s.levels?.get?.(id)?.name ?? id), behaviors: r.behaviors.map(b => b.type) })) })),
    journals: game.journal.map(j => ({ id: j.id, name: j.name })),
    users: game.users.map(u => ({ id: u.id, name: u.name, isGM: !!u.isGM, resumeView: u.flags?.["pentaryn-resume"]?.view != null })),
  };
}

/** --seed: delete what stalePlan listed. Each document is checked again here: only PinTest ones go. */
async function opPrune(H, a) {
  const p = a.plan ?? {};
  const done = { tokens: 0, regions: 0, scenes: 0, actors: 0, journals: 0, resume: 0, refused: [] };
  const testActor = id => {
    const x = id ? game.actors.get(id) : null;
    if (!x) return false;
    if (H.isTest(x.name)) return true;
    const root = x.flags?.dnd5e?.originalActor ? game.actors.get(x.flags.dnd5e.originalActor) : null;
    return !!root && H.isTest(root.name);
  };
  for (const { scene, ids } of p.tokens ?? []) {
    const s = game.scenes.get(scene);
    if (!s) continue;
    const ok = ids.filter(id => {
      const t = s.tokens.get(id);
      if (!t) return false;
      const yes = H.isTest(t.name) || testActor(t.actorId) || testActor(t.flags?.dnd5e?.originalActor) || (H.isTest(s.name) && !t.actorId);
      if (!yes) done.refused.push(`token ${t.name} on ${s.name}`);
      return yes;
    });
    if (ok.length) { await s.deleteEmbeddedDocuments("Token", ok); done.tokens += ok.length; }
  }
  for (const { scene, ids } of p.regions ?? []) {
    const s = game.scenes.get(scene);
    if (!s) continue;
    const ok = ids.filter(id => {
      const r = s.regions.get(id);
      if (!r) return false;
      const yes = H.isTest(s.name) || H.isTest(r.name);
      if (!yes) done.refused.push(`region ${r.name} on ${s.name}`);
      return yes;
    });
    if (ok.length) { await s.deleteEmbeddedDocuments("Region", ok); done.regions += ok.length; }
  }
  const pick = (coll, ids, test, label) => (ids ?? []).filter(id => {
    const d = coll.get(id);
    if (!d) return false;
    if (!test(d)) { done.refused.push(`${label} ${d.name}`); return false; }
    return true;
  });
  const scenes = pick(game.scenes, p.scenes, d => H.isTest(d.name), "scene");
  if (scenes.length) { await Scene.deleteDocuments(scenes); done.scenes = scenes.length; }
  const actors = pick(game.actors, p.actors, d => testActor(d.id), "actor");
  if (actors.length) { await Actor.deleteDocuments(actors); done.actors = actors.length; }
  const journals = pick(game.journal, p.journals, d => H.isTest(d.name), "journal");
  if (journals.length) { await JournalEntry.deleteDocuments(journals); done.journals = journals.length; }
  for (const u of pick(game.users, p.resumeUsers, d => H.isTest(d.name) && !d.isGM, "user").map(id => game.users.get(id))) {
    await u.unsetFlag("pentaryn-resume", "view");
    done.resume += 1;
  }
  return done;
}

async function opUserActive(H, a) {
  return { active: !!H.user(a.user)?.active };
}

/* GM-page ops (DOM, canvas) */

async function opBoardPoint(H, a) {
  const s = await H.viewScene(a.scene);
  try { canvas.tokens.activate(); } catch { /* already */ }
  try { ui.sidebar?.collapse?.(); } catch { /* no sidebar */ }
  for (const app of [...(foundry.applications.instances?.values?.() ?? [])]) {
    if (app?.document?.documentName === "Actor" && app.rendered) { try { await app.close(); } catch { /* gone */ } }
  }
  try { canvas.hud?.token?.close?.(); } catch { /* none */ }
  await H.sleep(250);
  const board = document.getElementById("board");
  const g = s.grid.size;
  const inView = c => c.x > 8 && c.y > 8 && c.x < innerWidth - 8 && c.y < innerHeight - 8;
  const probeAt = async p => {
    canvas.pan({ x: p.x, y: p.y });
    await H.sleep(200);
    const c = canvas.clientCoordinatesFromCanvas(p);
    const el = document.elementFromPoint(c.x, c.y);
    return { client: { x: Math.round(c.x), y: Math.round(c.y) }, canvas: { x: p.x, y: p.y }, onBoard: el === board,
      element: el ? (el.id || el.tagName) : null };
  };
  if (a.want === "token") {
    const t = H.tokensOf(H.actor(a.actor).id).find(x => x.parent === s);
    if (!t) return { ok: false, reason: "no token on that scene" };
    const r = await probeAt({ x: t.x + t.width * g / 2, y: t.y + t.height * g / 2 });
    return { ok: r.onBoard && inView(r.client), ...r };
  }
  const boxes = s.tokens.map(t => ({ x: t.x, y: t.y, w: t.width * g, h: t.height * g }));
  const clear = p => !boxes.some(b => p.x > b.x - g && p.x < b.x + b.w + g && p.y > b.y - g && p.y < b.y + b.h + g);
  const cands = [];
  if (a.prefer) cands.push(a.prefer);
  for (let y = g * 1.5; y < s.height - g; y += g) for (let x = g * 1.5; x < s.width - g; x += g) cands.push({ x, y });
  let last = null;
  for (const p of cands.filter(clear).slice(0, 25)) {
    last = await probeAt(p);
    if (last.onBoard && inView(last.client)) return { ok: true, ...last };
  }
  return { ok: false, reason: "no empty board point in view", last };
}

async function opMenuState() {
  const nav = document.querySelector("nav.ppi-menu");
  if (!nav) return { open: false };
  const label = a => a?.querySelector(".ppi-label")?.textContent?.trim() ?? null;
  const top = [...nav.children].map(ch => (ch.matches("a") ? ch : ch.querySelector(":scope > a"))).filter(Boolean).map(label);
  const sub = [...nav.querySelectorAll(".ppi-sub a.ppi-item")].map(a => ({ label: label(a),
    disabled: a.classList.contains("ppi-disabled"), note: a.querySelector(".ppi-note")?.textContent?.trim() ?? null }));
  return { open: true, top, sub };
}

async function opBoardCounters() {
  return { ...(globalThis.__pinsLive?.board ?? {}) };
}

/** Evidence only: the targets of the last right press, release and contextmenu on the GM page. */
async function opLastRight() {
  return { ...(globalThis.__pinsLive?.last ?? {}) };
}

async function opCloseHud() {
  try { canvas.hud?.token?.close?.(); } catch { /* none */ }
  return true;
}

async function opClientOf(H, a) {
  const c = canvas.clientCoordinatesFromCanvas({ x: a.x, y: a.y });
  return { x: Math.round(c.x), y: Math.round(c.y) };
}

async function opMousePosition() {
  const m = canvas.mousePosition;
  return m ? { x: Math.round(m.x), y: Math.round(m.y) } : null;
}

async function opTokenIds(H, a) {
  return H.scene(a.scene).tokens.map(t => t.id);
}

async function opNewTokens(H, a) {
  const s = H.scene(a.scene);
  const before = new Set(a.before);
  await H.waitFor(() => (s.tokens.some(t => !before.has(t.id)) ? true : null), a.waitMs ?? 8000);
  await H.sleep(300);
  return s.tokens.filter(t => !before.has(t.id)).map(t => ({ ...H.info(t), actorName: t.actor?.name ?? null }));
}

async function opClosePromptDialogs(H) {
  let n = 0;
  for (const app of [...(foundry.applications.instances?.values?.() ?? [])]) {
    if (String(app?.id ?? "").startsWith("pentaryn-prompts-dialog")) { try { await app.close(); n += 1; } catch { /* gone */ } }
  }
  await H.sleep(400);
  return n;
}

async function opDeleteTokenIds(H, a) {
  const s = H.scene(a.scene);
  const ids = (a.ids ?? []).filter(id => s.tokens.has(id));
  if (ids.length) await s.deleteEmbeddedDocuments("Token", ids);
  return ids.length;
}

/** Any page: render the actor's sheet, read the pins badge, close it. */
async function opSheetBadge(H, a) {
  const act = H.actor(a.actor);
  if (!act) return { rendered: false, text: null, reason: "no actor" };
  const sheet = act.sheet;
  await sheet.render(true);
  const rendered = await H.waitFor(() => (sheet.rendered && sheet.element ? true : null), 15000);
  let text = null;
  const end = Date.now() + (a.waitMs ?? 4000);
  while (Date.now() < end) {
    const el = sheet.element?.querySelector?.(".ppi-pinned");
    if (el) { text = el.textContent.trim(); break; }
    await H.sleep(100);
  }
  try { await sheet.close(); } catch { /* gone */ }
  return { rendered: !!rendered, text };
}

async function opTransform(H, a) {
  const act = H.actor(a.actor), into = H.actor(a.into);
  if (typeof act?.transformInto !== "function") return { unsupported: "Actor#transformInto is not available" };
  await H.viewScene(a.scene);
  const before = H.tokensOf(act.id).map(H.info);
  let error = null;
  try {
    await act.transformInto(into, undefined, { renderSheet: false });
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 300);
  }
  const after = await H.waitFor(() => {
    const t = H.tokensOf(act.id);
    return t.length && t.every(x => x.actorId !== act.id) ? t.map(H.info) : null;
  }, 10000);
  const form = game.actors.find(x => x.getFlag?.("dnd5e", "originalActor") === act.id) ?? null;
  return { before, after: after ?? H.tokensOf(act.id).map(H.info), transformed: !!after,
    form: form ? { id: form.id, name: form.name } : null, error };
}

async function opRevert(H, a) {
  const act = H.actor(a.actor);
  await H.viewScene(a.scene);
  const errors = [];
  for (const f of game.actors.filter(x => x.getFlag?.("dnd5e", "originalActor") === act.id)) {
    try { await f.revertOriginalForm({ renderSheet: false }); } catch (err) { errors.push(String(err?.message ?? err).slice(0, 200)); }
  }
  const back = await H.waitFor(() => (H.tokensOf(act.id).every(t => t.actorId === act.id) ? true : null), 10000);
  return { reverted: !!back, tokens: H.tokensOf(act.id).map(H.info), errors };
}

async function opResumeRead() {
  try {
    if (!game.modules.get("pentaryn-resume")?.active) return { available: false, view: null };
    return { available: true, userId: game.user.id, view: game.user.getFlag("pentaryn-resume", "view") ?? null };
  } catch (err) {
    return { available: false, view: null, error: String(err?.message ?? err) };
  }
}

async function opResumeRestore(H, a) {
  await game.user.unsetFlag("pentaryn-resume", "view");
  if (a.view) await game.user.setFlag("pentaryn-resume", "view", a.view);
  return true;
}

export const OPS = Object.freeze({ opPreflight, opState, opSeed, opPin, opArrange, opLayout, opCopyToken, opDeleteToken,
  opSetPinning, opActivate, opPull, opWalk, opWaitOn, opPinsTeleport, opTeleportParty, opAudit, opInspect, opActiveUsers,
  opRealOnline, opStash, opRestore, opCleanup, opSeedSnapshot, opPrune, opUserActive, opBoardPoint, opMenuState, opBoardCounters, opCloseHud,
  opLastRight, opClientOf, opMousePosition, opTokenIds, opNewTokens, opClosePromptDialogs, opDeleteTokenIds, opSheetBadge,
  opTransform, opRevert, opResumeRead, opResumeRestore });

/** Page-only (never through eval-js): users are created and passwords set with page.evaluate ARGUMENTS. */
async function pageSetUsers(names, passwords, create) {
  const out = {};
  for (const [key, name] of Object.entries(names)) {
    if (!String(name).startsWith("PinTest")) throw new Error("refusing a user not named PinTest*");
    let u = game.users.find(x => x.name === name);
    if (u?.isGM) throw new Error(`${name} is a GM user: refusing`);
    if (!u) {
      if (!create) throw new Error(`no user ${name}: run --seed first`);
      u = await User.create({ name, role: CONST.USER_ROLES.PLAYER, password: passwords[key], color: "#5b3fb0" });
    } else {
      await u.update({ password: passwords[key] });
    }
    out[key] = u.id;
  }
  return out;
}

const probeFn = () => {
  const g = globalThis.game, c = globalThis.canvas;
  let noCanvas = null;
  try { noCanvas = !!g?.settings?.get("core", "noCanvas"); } catch { /* not ready */ }
  return { ready: !!g?.ready, user: g?.user?.name ?? null, scene: c?.scene?.id ?? null, level: c?.level?.id ?? null,
    loading: !!c?.loading, canvasReady: !!c?.ready, viewedScene: g?.user?.viewedScene ?? null,
    active: g?.scenes?.active?.id ?? null, activeGM: g?.users?.activeGM?.name ?? null, noCanvas,
    seq: globalThis.__pinsLive?.seq ?? 0 };
};

/* ── executors ──────────────────────────────────────────────────────────── */

class PageExec {
  constructor(getPage, label) { this.getPage = getPage; this.label = label; this.mode = "page"; }
  async run(fn, args = {}, tag = fn.name) {
    const page = await this.getPage();
    let s;
    try {
      s = await page.evaluate(composeExpression(fn, args));
    } catch (err) {
      throw new Error(`${this.label} ${tag}: ${String(err?.message ?? err).replace(/^Evaluation failed: /, "").slice(0, 400)}`);
    }
    return s == null ? null : JSON.parse(s);
  }
}

let controlSeq = 0;
/** One JSON-lines request on the broker's control channel; resolves with the matching reply. */
export function controlCall(method, params, { port = CONTROL_PORT, host = "127.0.0.1", timeoutMs = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    const id = `pins-live-${process.pid}-${++controlSeq}`;
    const sock = net.connect({ port, host });
    let buf = "", done = false;
    const finish = (fn, v) => { if (done) return; done = true; sock.destroy(); fn(v); };
    sock.setTimeout(timeoutMs, () => finish(reject, new Error(`control ${method}: no answer in ${timeoutMs} ms`)));
    sock.once("error", e => finish(reject, e));
    sock.once("connect", () => sock.write(JSON.stringify({ id, method, ...(params ? { params } : {}) }) + "\n"));
    sock.on("data", chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id !== undefined && msg.id !== id) continue;
        finish(resolve, msg);
        return;
      }
    });
  });
}

class BotExec {
  constructor() { this.label = "bot"; this.mode = "bot"; }
  async ping() {
    try {
      const msg = await controlCall("foundry_ping", undefined, { timeoutMs: 10000 });
      return msg?.result?.ok === true ? true : (msg?.result?.error ?? msg?.error?.message ?? "no ok");
    } catch (err) {
      return String(err?.message ?? err);
    }
  }
  async run(fn, args = {}, tag = fn.name, timeoutMs = 55000) {
    const script = `return await ${composeExpression(fn, args)};`;
    const msg = await controlCall("call_tool", {
      name: "eval-js",
      args: { script, purpose: `pins-live ${tag}`, timeoutMs },
      client: { pid: process.pid, ppid: process.ppid },
    }, { timeoutMs: timeoutMs + 15000 });
    const s = parseEvalReply(msg);
    return s == null ? null : JSON.parse(s);
  }
}

/* ── the scenario context ───────────────────────────────────────────────── */

class Ctx {
  constructor(env, id, exec, signal = null) {
    this.env = env;
    this.id = id;
    this.signal = signal;           // aborted when the scenario times out or the run is interrupted
    this.gm = exec;
    this.mode = exec.mode;
    this.evidence = {};
    this.marks = {};
    this.acted = null;
  }
  get ids() { return this.env.ids; }
  sid(key) { return this.env.ids.scenes[key]; }
  /** Throws once the scenario is cancelled: a timed-out scenario must not write any more (S1). */
  live() { this.signal?.throwIfAborted?.(); }
  sleep(ms) { return sleepFor(ms, this.signal); }
  async world(fn, args = {}, tag = fn.name) {
    this.live();
    const r = await this.gm.run(fn, args, `${this.id} ${tag}`);
    this.live();
    return r;
  }
  async gmOp(fn, args = {}, tag = fn.name) {
    this.live();
    if (this.mode !== "page") throw new Error(`${this.id}: ${tag} needs the GM page`);
    const r = await this.env.gmExec.run(fn, args, `${this.id} ${tag}`);
    this.live();
    return r;
  }
  gmPage() {
    this.live();
    if (this.mode !== "page" || !this.env.gm) throw new Error(`${this.id}: the GM page is not open`);
    return this.env.gm.page;
  }
  skip(reason) { return new SkipError(reason); }

  pinning(value) { return this.world(opSetPinning, { value }, `pinning=${value}`); }
  async arrange(layout) {
    const l = await this.world(opArrange, { layout }, "arrange");
    this.evidence.setupLayout = compactLayout(l, this.ids);
    return l;
  }
  activate(scene, pullIfActive = false) { return this.world(opActivate, { scene, pullIfActive }, `activate ${scene}`); }
  async expectViews(map) {
    for (const [key, scene] of Object.entries(map)) {
      this.live();
      const r = await this.env.waitView(key, this.sid(scene), 45000, { signal: this.signal });
      if (!r.ok) throw new Error(`setup: ${key} did not reach ${scene} (on ${sceneKeyOf(this.ids, r.probe?.scene)})`);
    }
  }
  async mark(...keys) {
    for (const k of keys) this.marks[k] = await this.env.toastSeq(k);
  }
  toasts(key) { return this.env.toastsSince(key, this.marks[key] ?? 0); }
  async viewOf(key, scene, ms = 30000) {
    this.live();
    const r = await this.env.waitView(key, this.sid(scene), ms, { signal: this.signal });
    return { ok: r.ok, got: sceneKeyOf(this.ids, r.probe?.scene), want: scene };
  }
  async stays(key, scene, dwell = 4000) {
    await this.sleep(dwell);
    const r = await this.env.waitView(key, this.sid(scene), 20000, { settleOnly: true, signal: this.signal });
    return { ok: r.probe?.scene === this.sid(scene) && !r.probe?.loading, got: sceneKeyOf(this.ids, r.probe?.scene), want: scene };
  }
  async cSaw(scene, ms = 15000) {
    const name = this.ids.sceneNames[scene];
    const end = Date.now() + ms;
    let toasts = [];
    while (Date.now() < end) {
      toasts = await this.toasts("C");
      if (sawCanvasDisabled(toasts, name)) return { ok: true, got: scene, want: scene };
      await this.sleep(250);
    }
    const p = await this.env.probe("C").catch(() => null);
    return { ok: false, got: { viewedScene: sceneKeyOf(this.ids, p?.viewedScene), toasts: toasts.map(t => t.text) }, want: scene };
  }
  async noCannotSwitch(key) {
    const bad = cannotSwitchToasts(await this.toasts(key));
    return { ok: bad.length === 0, got: bad.map(t => t.text), want: [] };
  }
  check(name, r) { return { name, ok: !!r?.ok, got: r?.got ?? null, want: r?.want ?? null }; }
  is(name, ok, got = null, want = null) { return { name, ok: !!ok, got, want }; }
}

/* ── GM menu gestures ───────────────────────────────────────────────────── */

async function rightClick(x, p) {
  const page = x.gmPage();
  const before = await x.gmOp(opBoardCounters);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await sleep(60);
  await page.mouse.up({ button: "right" });
  await sleep(600);
  const menu = await x.gmOp(opMenuState);
  const after = await x.gmOp(opBoardCounters);
  const targets = await x.gmOp(opLastRight);
  return { at: p, menu, targets, events: Object.fromEntries(Object.keys(after).map(k => [k, (after[k] ?? 0) - (before[k] ?? 0)])) };
}

async function rightDrag(x, p, { dx = 60, dy = 40 } = {}) {
  const page = x.gmPage();
  await page.mouse.move(p.x, p.y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(p.x + dx, p.y + dy, { steps: 10 });
  await page.mouse.up({ button: "right" });
  await sleep(600);
  return { at: p, menu: await x.gmOp(opMenuState) };
}

async function dismissMenu(x) {
  const m = await x.gmOp(opMenuState);
  if (m.open) {
    await x.gmPage().keyboard.press("Escape");
    await sleep(200);
  }
}

async function clickMenuItem(x, label) {
  const h = await x.gmPage().evaluateHandle(l => [...document.querySelectorAll("nav.ppi-menu a.ppi-item")]
    .find(a => a.querySelector(".ppi-label")?.textContent?.trim() === l) ?? null, label);
  const el = h.asElement();
  if (!el) return false;
  await el.click();
  return true;
}

/** Each PC company check: summon and pet on `sceneId`, none left elsewhere, all on Alpha's floor. */
function companyOn(x, layout, sceneId) {
  const where = k => (layout?.[k] ?? []).map(t => sceneKeyOf(x.ids, t.scene));
  const lv = k => tokensOn(layout, k, sceneId)[0]?.level ?? null;
  return [
    ...["alpha", "summon", "pet"].map(k => x.is(`${k} is on ${sceneKeyOf(x.ids, sceneId)} only`,
      tokensOn(layout, k, sceneId).length === 1 && (layout?.[k] ?? []).length === 1, where(k), [sceneKeyOf(x.ids, sceneId)])),
    x.is("the summon and the pet stand on Alpha's level", lv("alpha") !== null && lv("summon") === lv("alpha") && lv("pet") === lv("alpha"),
      { alpha: lv("alpha"), summon: lv("summon"), pet: lv("pet") }, "all equal"),
    floorCheck(x, layout),
  ];
}

/** Every PinTest token stands on a level its scene has (else core refuses its every later move). */
function floorCheck(x, layout) {
  const bad = offFloor(layout, x.ids);
  return x.is("every PinTest token stands on a level of its scene", bad.length === 0, bad, []);
}

/* ── the scenario table ─────────────────────────────────────────────────── */

const quietSetup = async (x, { layout, active, pinning, views }) => {
  await x.pinning(false);
  if (layout) await x.arrange(layout);
  if (active) await x.activate(active, true);
  if (pinning) await x.pinning(true);
  if (views) await x.expectViews(views);
};

export const SCENARIOS = {
  S01: {
    title: "switch OFF: activating North moves A, B and C (stock)",
    needs: { players: ["A", "B", "C"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.allSouth, active: "south", views: { A: "south", B: "south" } }); },
    async act(x) { await x.mark("C"); await x.activate("north"); },
    async assert(x) {
      return [
        x.check("A follows the activation to North", await x.viewOf("A", "north")),
        x.check("B follows the activation to North", await x.viewOf("B", "north")),
        x.check("C (no canvas) is sent to North", await x.cSaw("north")),
      ];
    },
  },
  S02: {
    title: "switch ON: the audit is clean",
    needs: { gmPage: true, players: ["A", "B"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home }); },
    async act(x) {
      await x.mark("GM");
      await x.pinning(true);
      await sleep(1500);
      return { audit: await x.world(opAudit), toasts: (await x.toasts("GM")).filter(t => TEXT.auditToast.test(t.text)) };
    },
    async assert(x) {
      const { audit, toasts } = x.acted;
      const mine = violationsFor(audit, { userIds: Object.values(x.ids.users), actorIds: Object.values(x.ids.actors) });
      x.evidence.audit = { ok: audit.ok, pins: audit.pins, violations: audit.violations.length, toast: toasts.map(t => t.text) };
      x.evidence.views = { A: await x.viewOf("A", "north"), B: await x.viewOf("B", "south") };
      return [
        x.is("audit reports the switch on", audit.enabled === true, audit.enabled, true),
        x.is("no audit problem for the PinTest pins", mine.length === 0, mine.map(v => `${v.code} ${v.actor?.name}`), []),
        x.is("the switching GM got the audit toast", toasts.length > 0, toasts.map(t => t.text), "Pinning on: …"),
      ];
    },
  },
  S03: {
    title: "audit flags a duplicated token and deletes nothing; removing the copy clears it",
    needs: { gmPage: true, players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home }); },
    async act(x) {
      const copy = await x.world(opCopyToken, { actor: "alpha", ...SPOTS.copy });
      await x.mark("GM");
      await x.pinning(true);
      await sleep(2000);
      const audit = await x.world(opAudit);
      const toasts = (await x.toasts("GM")).filter(t => TEXT.auditToast.test(t.text)).map(t => t.text);
      const afterAudit = await x.world(opLayout);
      const afterRemove = await x.world(opDeleteToken, { scene: copy.scene, id: copy.id });
      const audit2 = await x.world(opAudit);
      return { copy, audit, toasts, afterAudit, afterRemove, audit2 };
    },
    async assert(x) {
      const { audit, toasts, afterAudit, afterRemove, audit2 } = x.acted;
      const a = { userIds: [x.ids.users.A], actorIds: [x.ids.actors.alpha] };
      const v1 = violationsFor(audit, a), v2 = violationsFor(audit2, a);
      x.evidence.toasts = toasts;
      x.evidence.afterAudit = compactLayout(afterAudit, x.ids);
      return [
        x.is("audit flags Alpha's two tokens (MANY_TOKENS)", v1.some(v => v.code === "MANY_TOKENS"), v1.map(v => v.code), ["MANY_TOKENS"]),
        x.is("the audit deleted nothing (Alpha still has two tokens)", (afterAudit.alpha ?? []).length === 2, (afterAudit.alpha ?? []).length, 2),
        x.is("after the copy is removed Alpha has one token", (afterRemove.alpha ?? []).length === 1, (afterRemove.alpha ?? []).length, 1),
        x.is("after the copy is removed the audit is clean for Alpha", v2.length === 0, v2.map(v => v.code), []),
      ];
    },
  },
  S04: {
    title: "audit flags NO_TOKEN and deletes nothing",
    needs: { gmPage: true },
    async setup(x) { await quietSetup(x, { layout: { ...LAYOUT.home, beta: null } }); },
    async act(x) {
      await x.pinning(true);
      await sleep(1000);
      return { audit: await x.world(opAudit), layout: await x.world(opLayout) };
    },
    async assert(x) {
      const { audit, layout } = x.acted;
      const v = violationsFor(audit, { userIds: [x.ids.users.B], actorIds: [x.ids.actors.beta] });
      return [
        x.is("audit flags Beta with NO_TOKEN", v.some(y => y.code === "NO_TOKEN"), v.map(y => y.code), ["NO_TOKEN"]),
        x.is("nothing was deleted (Alpha's token is still there)", (layout.alpha ?? []).length === 1, (layout.alpha ?? []).length, 1),
      ];
    },
  },
  S05: {
    title: "sheet badge 'Pinned to PinTest-A' on Alpha's sheet, seen by the GM and by A",
    needs: { gmPage: true, players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, pinning: true }); },
    async act(x) {
      return {
        gm: await x.gmOp(opSheetBadge, { actor: "alpha" }),
        a: await x.env.playerExec("A").run(opSheetBadge, { actor: "alpha" }, `${x.id} A sheet`),
        gamma: await x.gmOp(opSheetBadge, { actor: "gamma", waitMs: 1500 }),
      };
    },
    async assert(x) {
      const want = `Pinned to ${FIX.users.A}`;
      const { gm, a, gamma } = x.acted;
      return [
        x.is("the GM sees the badge", gm.text === want, gm.text, want),
        x.is("A sees the badge", a.text === want, a.text, want),
        x.is("an unpinned character's sheet has no badge", gamma.rendered && gamma.text === null, gamma.text, null),
      ];
    },
  },
  S06: {
    title: "switch ON: activating South leaves A on North and B on South; C follows",
    needs: { players: ["A", "B", "C"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north", B: "south" } }); },
    async act(x) { await x.mark("A", "C"); await x.activate("south"); },
    async assert(x) {
      return [
        x.check("A stays on North (its token's scene)", await x.stays("A", "north")),
        x.check("B stays on South (its token's scene)", await x.stays("B", "south", 0)),
        x.check("C (unpinned) follows the activation", await x.cSaw("south")),
        x.check("A got no 'cannot switch Scenes' toast", await x.noCannotSwitch("A")),
      ];
    },
  },
  S07: {
    title: "'Pull users to scene' is ignored for pinned users (C is pulled)",
    needs: { players: ["A", "B", "C"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.allNorth, active: "north", pinning: true, views: { A: "north", B: "north" } }); },
    async act(x) { await x.mark("C"); return x.world(opPull, { scene: "south", users: ["A", "B", "C"] }); },
    async assert(x) {
      return [
        x.check("A ignores the pull", await x.stays("A", "north")),
        x.check("B ignores the pull", await x.stays("B", "north", 0)),
        x.check("C (unpinned) is pulled", await x.cSaw("south")),
      ];
    },
  },
  S08: {
    title: "GM walks Alpha into the North portal: A's view and the summon and pet follow to South",
    needs: { players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north" } }); },
    async act(x) {
      await x.mark("A");
      const walk = await x.world(opWalk, { actor: "alpha", ...SPOTS.portalWalk });
      const after = await x.world(opWaitOn, { scene: "south", actors: ["alpha", "summon", "pet"], waitMs: 20000 });
      return { walk, after };
    },
    async assert(x) {
      const { walk, after } = x.acted;
      x.evidence.layout = compactLayout(after.layout, x.ids);
      x.evidence.cannotSwitch = (await x.noCannotSwitch("A")).got;
      return [
        x.is("core teleported Alpha off North", walk.moved, walk.moved, true),
        ...companyOn(x, after.layout, x.sid("south")),
        x.check("A's view follows to South", await x.viewOf("A", "south")),
      ];
    },
  },
  S09: {
    title: "pins.teleport on the same scene brings the summon and pet",
    needs: { players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north" } }); },
    async act(x) {
      const { scene, ...pt } = SPOTS.sameScene;
      return x.world(opPinsTeleport, { user: "A", scene, ...pt });
    },
    async assert(x) {
      const { res, layout } = x.acted;
      const north = x.sid("north");
      const alpha = tokensOn(layout, "alpha", north)[0];
      const near = k => {
        const t = tokensOn(layout, k, north)[0];
        return !!t && !!alpha && chebyshev(centreOf(t), centreOf(alpha)) <= 2.5 * GRID;
      };
      x.evidence.res = { ok: res?.ok, code: res?.code ?? null, followers: res?.followers?.map(f => f.name), moved: res?.moved };
      x.evidence.layout = compactLayout(layout, x.ids);
      return [
        x.is("teleport ok", res?.ok === true, res?.code ?? res?.ok, true),
        x.is("Alpha lands on the point", !!alpha && chebyshev(centreOf(alpha), SPOTS.sameScene) <= GRID,
          alpha && centreOf(alpha), { x: SPOTS.sameScene.x, y: SPOTS.sameScene.y }),
        x.is("the summon and the pet come along", (res?.followers ?? []).length === 2 && near("summon") && near("pet"),
          res?.followers?.map(f => f.name), [FIX.actors.summon.name, FIX.actors.pet.name]),
        ...companyOn(x, layout, north),
        x.check("A stays on North", await x.stays("A", "north", 1500)),
      ];
    },
  },
  S10: {
    title: "pins.teleport to another scene: old tokens gone, summon and pet along, A's view follows, no toast",
    needs: { players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north" } }); },
    async act(x) {
      await x.mark("A");
      const { scene, ...pt } = SPOTS.crossScene;
      return x.world(opPinsTeleport, { user: "A", scene, ...pt });
    },
    async assert(x) {
      const { res, layout } = x.acted;
      x.evidence.res = { ok: res?.ok, code: res?.code ?? null, followers: res?.followers?.map(f => f.name), viewFollows: res?.viewFollows, warning: res?.warning ?? null };
      x.evidence.layout = compactLayout(layout, x.ids);
      const view = await x.viewOf("A", "south");
      await sleep(1500);
      return [
        x.is("teleport ok, view follows", res?.ok === true && res?.viewFollows === true, { ok: res?.ok, viewFollows: res?.viewFollows }, { ok: true, viewFollows: true }),
        ...companyOn(x, layout, x.sid("south")),
        x.check("A's view follows to South", view),
        x.check("A got no 'cannot switch Scenes' toast", await x.noCannotSwitch("A")),
      ];
    },
  },
  S11: {
    title: "Teleport party (portals) still moves every PinTest PC and its companions",
    needs: { gmPage: true, players: ["A", "B", "C"] },
    async setup(x) {
      await quietSetup(x, { layout: LAYOUT.allNorth, active: "north", pinning: true, views: { A: "north", B: "north" } });
      const api = await x.world(opPreflight);
      if (!api.portalsTeleportParty) throw x.skip("pentaryn-portals teleportParty is not available");
    },
    async act(x) {
      await x.mark("C");
      return x.gmOp(opTeleportParty, { from: "north", to: "south" });
    },
    async assert(x) {
      const { res, layout } = x.acted;
      const south = x.sid("south");
      x.evidence.res = res;
      x.evidence.layout = compactLayout(layout, x.ids);
      return [
        x.is("teleportParty moved at least the five PinTest tokens", (res?.moved ?? 0) >= 5 && res?.cancelled === false, res, { moved: ">= 5", cancelled: false }),
        ...companyOn(x, layout, south),
        x.is("Beta is on South only", tokensOn(layout, "beta", south).length === 1 && layout.beta.length === 1, compactLayout(layout, x.ids).beta, ["south"]),
        x.is("Gamma is on South only", tokensOn(layout, "gamma", south).length === 1 && layout.gamma.length === 1, compactLayout(layout, x.ids).gamma, ["south"]),
        floorCheck(x, layout),
        x.check("A is on South", await x.viewOf("A", "south")),
        x.check("B is on South", await x.viewOf("B", "south")),
        x.check("C is pulled to South", await x.cSaw("south")),
      ];
    },
  },
  S12: {
    title: "A logs out and in: lands on its token's scene (South), not the active one",
    needs: { players: ["A"] },
    async setup(x) {
      await quietSetup(x, { layout: { ...LAYOUT.home, alpha: POS.alphaS, summon: POS.summonS, pet: POS.petS },
        active: "north", pinning: true, views: { A: "south" } });
    },
    async act(x) {
      await x.env.logoutPlayer("A");
      await x.env.ensurePlayer("A");
      x.marks.A = 0;   // a fresh page: every toast since load counts
    },
    async assert(x) {
      const view = await x.viewOf("A", "south");
      await sleep(2000);
      return [
        x.check("A lands on South", view),
        x.check("A is still on South after settling", await x.stays("A", "south", 0)),
        x.check("A got no 'cannot switch Scenes' toast", await x.noCannotSwitch("A")),
      ];
    },
  },
  S13: {
    title: "C (unpinned, no canvas) logs out and in: stock",
    needs: { players: ["C"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true }); },
    async act(x) {
      await x.env.logoutPlayer("C");
      await x.env.ensurePlayer("C");
      x.marks.C = 0;
      await sleep(3000);
      return { probe: await x.env.probe("C"), pins: await x.world(opInspect, { user: "C" }) };
    },
    async assert(x) {
      const { probe, pins } = x.acted;
      const follows = followToasts(await x.toasts("C"));
      x.evidence.probe = { ...probe, viewedScene: sceneKeyOf(x.ids, probe.viewedScene), active: sceneKeyOf(x.ids, probe.active) };
      return [
        x.is("C is logged in", probe.ready, probe.ready, true),
        x.is("C runs with no canvas", probe.noCanvas === true && !probe.canvasReady, { noCanvas: probe.noCanvas, canvasReady: probe.canvasReady }, { noCanvas: true, canvasReady: false }),
        x.is("pins leaves C alone (no pinned token)", pins.pinnedToken === null && pins.inspect?.root === null, pins, { pinnedToken: null }),
        x.is("no 'Your view follows' toast for C", follows.length === 0, follows.map(t => t.text), []),
        x.is("C's client has North as the active scene", probe.active === x.sid("north"), sceneKeyOf(x.ids, probe.active), "north"),
      ];
    },
  },
  S14: {
    title: "GM right-click menu: empty canvas opens it (both items, logged-in players only); a token right-click and a right-drag do not",
    needs: { gmPage: true, players: ["A", "B", "C"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north", B: "south" } }); },
    async act(x) {
      const out = {};
      const empty = await x.gmOp(opBoardPoint, { scene: "north", want: "empty", prefer: SPOTS.emptyNorth });
      if (!empty.ok) throw new Error(`no empty board point on the GM page: ${JSON.stringify(empty).slice(0, 300)}`);
      out.empty = await rightClick(x, empty.client);
      out.activeUsers = await x.gmOp(opActiveUsers);
      await dismissMenu(x);
      out.escapeCloses = !(await x.gmOp(opMenuState)).open;
      await x.env.logoutPlayer("B");
      const e2 = await x.gmOp(opBoardPoint, { scene: "north", want: "empty", prefer: SPOTS.emptyNorth });
      out.afterLogout = await rightClick(x, e2.client);
      await dismissMenu(x);
      const tok = await x.gmOp(opBoardPoint, { scene: "north", want: "token", actor: "alpha" });
      out.tokenPoint = tok;
      out.token = await rightClick(x, tok.client);
      await dismissMenu(x);
      await x.gmOp(opCloseHud);
      const e3 = await x.gmOp(opBoardPoint, { scene: "north", want: "empty", prefer: SPOTS.emptyNorth });
      out.drag = await rightDrag(x, e3.client);
      await dismissMenu(x);
      return out;
    },
    async assert(x) {
      const a = x.acted;
      const m1 = a.empty.menu;
      const subs = submenuUsers(m1.sub);
      const enabled = subs.filter(s => s.enabled).map(s => s.user).sort();
      const listed = subs.map(s => s.user);
      const c = subs.find(s => s.user === FIX.users.C);
      const listed2 = submenuUsers(a.afterLogout.menu.sub).map(s => s.user);
      x.evidence.menu = m1;
      x.evidence.boardEvents = { empty: a.empty.events, afterLogout: a.afterLogout.events, token: a.token.events };
      x.evidence.afterLogout = { at: a.afterLogout.at, menu: a.afterLogout.menu };
      x.evidence.targets = { empty: a.empty.targets, afterLogout: a.afterLogout.targets, token: a.token.targets };
      return [
        x.is("right-click on empty canvas opens the menu", m1.open, m1.open, true),
        x.is("menu has 'Prompt note'", (m1.top ?? []).includes(TEXT.promptNote), m1.top, TEXT.promptNote),
        x.is("menu has 'Teleport pinned character'", (m1.top ?? []).includes(TEXT.teleport), m1.top, TEXT.teleport),
        x.is("enabled rows are the logged-in pinned players", JSON.stringify(enabled) === JSON.stringify([FIX.users.A, FIX.users.B]), enabled, [FIX.users.A, FIX.users.B]),
        x.is("every listed player is logged in", listed.every(n => a.activeUsers.includes(n)), listed, a.activeUsers),
        x.is("an unpinned logged-in player is greyed out", !!c && !c.enabled, c ?? null, { user: FIX.users.C, enabled: false }),
        x.is("Escape closes the menu", a.escapeCloses, a.escapeCloses, true),
        x.is("after B logs out, B is no longer listed", a.afterLogout.menu.open && !listed2.includes(FIX.users.B), listed2, `without ${FIX.users.B}`),
        x.is("right-click on a token opens no menu", a.tokenPoint.ok && !a.token.menu.open, { pointOk: a.tokenPoint.ok, open: a.token.menu.open }, { pointOk: true, open: false }),
        x.is("a right-drag opens no menu", !a.drag.menu.open, a.drag.menu.open, false),
      ];
    },
  },
  S15: {
    title: "menu 'Prompt note' places the same marker as P at that point (both deleted)",
    needs: { gmPage: true },
    async setup(x) {
      await quietSetup(x, { layout: LAYOUT.home, pinning: true });
      if (!(await x.world(opPreflight)).promptsPlace) throw x.skip("pentaryn-prompts place() is not available");
    },
    async act(x) {
      const page = x.gmPage();
      const pt = await x.gmOp(opBoardPoint, { scene: "north", want: "empty", prefer: SPOTS.emptyNorth });
      if (!pt.ok) throw new Error(`no empty board point: ${JSON.stringify(pt).slice(0, 300)}`);
      const out = { pt };
      try {
        const before = await x.gmOp(opTokenIds, { scene: "north" });
        out.rc = await rightClick(x, pt.client);
        out.clicked = out.rc.menu.open ? await clickMenuItem(x, TEXT.promptNote) : false;
        out.viaMenu = out.clicked ? await x.gmOp(opNewTokens, { scene: "north", before, waitMs: 8000 }) : [];
        await x.gmOp(opClosePromptDialogs);
        await x.gmOp(opDeleteTokenIds, { scene: "north", ids: out.viaMenu.map(t => t.id) });
        const before2 = await x.gmOp(opTokenIds, { scene: "north" });
        const cl = await x.gmOp(opClientOf, pt.canvas);
        await page.evaluate(() => document.activeElement?.blur?.());
        await page.mouse.move(cl.x + 3, cl.y);
        await page.mouse.move(cl.x, cl.y);
        await sleep(200);
        out.mouse = await x.gmOp(opMousePosition);
        await page.keyboard.press("KeyP");
        out.viaKey = await x.gmOp(opNewTokens, { scene: "north", before: before2, waitMs: 8000 });
        await x.gmOp(opClosePromptDialogs);
        await x.gmOp(opDeleteTokenIds, { scene: "north", ids: out.viaKey.map(t => t.id) });
        const now = await x.gmOp(opTokenIds, { scene: "north" });
        out.leftovers = now.filter(id => !before.includes(id));
      } finally {
        await x.gmOp(opClosePromptDialogs).catch(() => {});
      }
      return out;
    },
    async assert(x) {
      const a = x.acted;
      const m = a.viaMenu?.[0] ?? null, k = a.viaKey?.[0] ?? null;
      const same = !!m && !!k && m.x === k.x && m.y === k.y && m.actorId === k.actorId && m.w === k.w;
      x.evidence.viaMenu = a.viaMenu;
      x.evidence.viaKey = a.viaKey;
      x.evidence.mouse = a.mouse;
      return [
        x.is("the menu opened and 'Prompt note' was clicked", a.clicked, a.clicked, true),
        x.is("the menu placed one marker", (a.viaMenu ?? []).length === 1, (a.viaMenu ?? []).length, 1),
        x.is("P placed one marker", (a.viaKey ?? []).length === 1, (a.viaKey ?? []).length, 1),
        x.is("same marker, same square", same, { menu: m && [m.x, m.y, m.actorName], key: k && [k.x, k.y, k.actorName] }, "equal"),
        x.is("both markers were deleted", (a.leftovers ?? []).length === 0, a.leftovers, []),
      ];
    },
  },
  S16: {
    title: "Alpha wild-shaped/polymorphed keeps the pin (activation ignored, form token followed)",
    needs: { gmPage: true, players: ["A"] },
    async setup(x) { await quietSetup(x, { layout: LAYOUT.home, active: "north", pinning: true, views: { A: "north" } }); },
    async act(x) {
      const tf = await x.gmOp(opTransform, { actor: "alpha", into: "wolf", scene: "north" });
      if (tf.unsupported) throw x.skip(tf.unsupported);
      if (!tf.transformed) {
        await x.gmOp(opRevert, { actor: "alpha", scene: "north" }).catch(() => {});
        throw x.skip(`transformInto did not transform the token by script (${tf.error ?? "no error"})`);
      }
      const out = { tf };
      try {
        out.pins = await x.world(opInspect, { user: "A" });
        await x.activate("south");
        out.stay = await x.stays("A", "north");
      } finally {
        out.revert = await x.gmOp(opRevert, { actor: "alpha", scene: "north" });
      }
      return out;
    },
    async assert(x) {
      const { tf, pins, stay, revert } = x.acted;
      x.evidence.form = tf.form;
      x.evidence.inspect = pins.inspect;
      return [
        x.is("the token now stands for the form actor", (tf.after ?? []).every(t => t.actorId !== x.ids.actors.alpha), tf.after?.map(t => t.name), "form"),
        x.is("inspect: the pin still resolves to one token", pins.inspect?.ok === true && !!pins.inspect?.token?.form, pins.inspect, { ok: true, token: { form: "…" } }),
        x.is("pinnedToken follows the form token", !!pins.pinnedToken && pins.pinnedToken.scene === x.sid("north"), pins.pinnedToken, { scene: "north" }),
        x.check("A ignores the activation while transformed", stay),
        x.is("reverted cleanly", revert.reverted && revert.errors.length === 0, revert, { reverted: true }),
      ];
    },
  },
  S17: {
    title: "switch OFF: stock again (activation moves everyone), badge and menu gone",
    needs: { gmPage: true, players: ["A", "B", "C"] },
    // everyone starts on North (B too: with B's token on South, "B follows to South" proved nothing, S7)
    async setup(x) { await quietSetup(x, { layout: LAYOUT.allNorth, active: "north", pinning: true, views: { A: "north", B: "north" } }); },
    async act(x) {
      await x.pinning(false);
      const badge = await x.gmOp(opSheetBadge, { actor: "alpha", waitMs: 1500 });
      const pt = await x.gmOp(opBoardPoint, { scene: "north", want: "empty", prefer: SPOTS.emptyNorth });
      const rc = pt.ok ? await rightClick(x, pt.client) : null;
      if (rc?.menu?.open) await dismissMenu(x);
      await x.mark("C");
      await x.activate("south");
      return { badge, pt, rc };
    },
    async assert(x) {
      const { badge, pt, rc } = x.acted;
      return [
        x.is("no badge on Alpha's sheet", badge.rendered && badge.text === null, badge, { rendered: true, text: null }),
        x.is("right-click on empty canvas opens no menu", pt.ok && rc && !rc.menu.open, { pointOk: pt.ok, open: rc?.menu?.open ?? null }, { pointOk: true, open: false }),
        x.check("A follows the activation to South", await x.viewOf("A", "south")),
        x.check("B follows the activation to South", await x.viewOf("B", "south")),
        x.check("C follows the activation to South", await x.cSaw("south")),
      ];
    },
  },
  S18: {
    title: "with the GM page CLOSED (bot = active GM): S06, S08 and S10 again, world actions through the bot",
    needs: { players: ["A", "B", "C"] },
    subs: ["S06", "S08", "S10"],
    async setup(x) {
      const ping = await x.env.bot.ping();
      if (ping !== true) throw x.skip(`the MCP broker on :${CONTROL_PORT} cannot reach the bot (foundry_ping: ${ping})`);
      await x.env.closeGm();
      const gm = await x.env.waitActiveGm(x.env.botName, 30000);
      if (gm !== x.env.botName) {
        throw x.skip(`with this runner's GM page closed the active GM is ${gm ?? "nobody"}, not ${x.env.botName} (is another Gamemaster session open?)`);
      }
    },
    async act(x) {
      const subs = {};
      for (const id of SCENARIOS.S18.subs) {
        x.live();
        subs[id] = await x.env.runScenario(id, { exec: x.env.bot, label: `S18/${id}`, signal: x.signal });
      }
      return subs;
    },
    async assert(x) {
      x.evidence.subs = x.acted;
      return Object.entries(x.acted).map(([id, r]) => x.is(`${id} passes with ${x.env.botName} as the active GM`, r.pass,
        r.pass ? "pass" : (r.skipped ? `skipped: ${r.evidence?.skipReason}` : r.error ?? (r.evidence?.checks ?? []).filter(c => !c.ok).map(c => c.name)), "pass"));
    },
  },
  S19: {
    title: "bot offline",
    skip: "not tested: with no GM client connected nothing runs portal follow or the bridge; out of scope for this harness",
  },
};

/* ── the environment: browser, GM page, players ─────────────────────────── */

function note(msg) {
  process.stderr.write(`[pins-live ${new Date().toISOString().slice(11, 19)}] ${msg}\n`);
}

function loadEnvFile() {
  const file = process.env.PENTARYN_ENV_FILE || path.join(process.env.HOME || "", ".config/pentaryn/env");
  let text = "";
  try { text = readFileSync(file, "utf8"); } catch { return; }
  for (const raw of text.split("\n")) {
    const m = raw.trim().replace(/^export\s+/, "").match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2].trim();
    if (v.length >= 2 && v[0] === v.at(-1) && `"'`.includes(v[0])) v = v.slice(1, -1);
    if (v) process.env[m[1]] = v;
  }
}

/** The watchdog's order (automation/headless-gm/watchdog.mjs CHROME: CHROME_PATH, then
 *  PENTARYN_HEADLESS_CHROME; review R7), then the usual system installs. */
function chromePath() {
  const cands = [process.env.CHROME_PATH, process.env.PENTARYN_HEADLESS_CHROME,
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
  return cands.find(p => p && existsSync(p)) ?? null;
}

/**
 * Run the credentials helper (`python -m scripts.foundry.ops headless-gm ...args`; `command` replaces
 * that prefix in tests). With `secretFd`, the child gets a fourth stdio pipe, its fd 3: whatever it
 * writes there is read into memory and parsed as JSON into `secret` (null when empty or garbled),
 * and is never written anywhere. stdout's last line is the summary (`json`); `err` is stderr's tail.
 */
export function runHelper(args, { timeoutMs = 90_000, command = null, secretFd = false } = {}) {
  const [cmd, ...pre] = command
    ?? [process.env.PENTARYN_PYTHON || path.join(REPO, ".venv/bin/python"), "-m", "scripts.foundry.ops", "headless-gm"];
  return new Promise(resolve => {
    const child = spawn(cmd, [...pre, ...args], { cwd: REPO, stdio: ["ignore", "pipe", "pipe", ...(secretFd ? ["pipe"] : [])] });
    let out = "", err = "";
    let chunks = [];
    child.stdout.on("data", d => { out += d; });
    child.stderr.on("data", d => { err += d; });
    if (secretFd) child.stdio[3].on("data", d => { chunks.push(d); });
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    const finish = code => {
      clearTimeout(timer);
      let json = null, secret = null;
      try { json = JSON.parse(out.trim().split("\n").pop()); } catch { /* reported by the caller */ }
      if (chunks.length) {
        const buf = Buffer.concat(chunks);
        chunks = [];
        try { secret = JSON.parse(buf.toString("utf8")); } catch { secret = null; }   // never echoed
        buf.fill(0);
      }
      resolve({ code: code ?? 1, json, err: err.trim().split("\n").slice(-2).join(" | "), secret });
    };
    child.on("error", e => { err += `\n${e.code ?? "spawn failed"}`; });
    child.on("close", finish);
  });
}

/** A session as the world's first role-4 user, handed over on the helper's fd 3: cookies in memory only. */
export async function mintGmCookies(run = runHelper) {
  const r = await run([...GM_COOKIE_ARGS], { secretFd: true });
  const cookies = r.code === 0 && Array.isArray(r.secret?.cookies) && r.secret.cookies.length ? r.secret.cookies : null;
  if (!cookies) {
    const f = helperFailure(r.code, r.json, r.code === 0 ? (r.err || "no session on the hand-off pipe") : r.err);
    throw new RunnerError(f.code, f.message);
  }
  return cookies;
}

class Env {
  constructor({ base, timeoutMs }) {
    this.base = base;
    this.timeoutMs = timeoutMs;
    this.browser = null;
    this.gm = null;                 // { context, page, errors }
    this.players = {};              // key → { context, page, errors }
    this.ids = null;
    this.passwords = {};            // key → password, memory only
    this.gmResume = { captured: false, available: false, view: null };
    this.bot = new BotExec();
    this.botName = process.env.PENTARYN_BOT_USER || "Claude";
    this.gmExec = new PageExec(() => this.ensureGm(), "GM page");
    this.stop = new AbortController();   // Ctrl-C / SIGTERM / SIGHUP: cancel the scenario, then restore (S2)
    this.runId = randomBytes(8).toString("hex");   // marks this run's stash: only its own is restored (R2); not secret
  }

  get stopSignal() { return this.stop.signal; }

  async launch() {
    const exe = chromePath();
    if (!exe) throw new RunnerError("noChrome", "no Chrome: set PENTARYN_HEADLESS_CHROME (make foundry-headless-install) or CHROME_PATH");
    // puppeteer's DEBUG=puppeteer:* protocol log would print every CDP message: the GM cookie, the passwords
    delete process.env.DEBUG;
    const puppeteer = require("puppeteer-core");
    const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" };
    if (process.env.PENTARYN_HEADLESS_LIBS) {
      env.LD_LIBRARY_PATH = [process.env.PENTARYN_HEADLESS_LIBS, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
    }
    this.browser = await puppeteer.launch({
      executablePath: exe, headless: /chrome-headless-shell/.test(exe) ? "shell" : true, env, pipe: true,
      // the runner handles Ctrl-C itself (main): puppeteer's default exits 130 and skips the restore (S2)
      ...PUPPETEER_SIGNAL_OPTIONS,
      protocolTimeout: 240_000, defaultViewport: VIEWPORT,
      args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--mute-audio",
        "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        "--disable-backgrounding-occluded-windows", `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        "--no-first-run", "--no-default-browser-check", "--disable-features=Translate,MediaRouter"],
    });
    note(`browser: ${path.basename(exe)}`);
  }

  attach(rec) {
    rec.errors = [];
    rec.page.on("pageerror", e => rec.errors.push(String(e?.message ?? e).slice(0, 300)));
    rec.page.on("console", m => {
      if (m.type() !== "error") return;
      const t = m.text();
      if (/pins-live: the MCP bridge/.test(t)) return;   // our own guard, on the GM page
      rec.errors.push(t.slice(0, 300));
    });
  }

  async ensureGm() {
    if (this.gm && !this.gm.page.isClosed()) return this.gm.page;
    note("GM page: minting a session (headless-gm cookie --as gm)");
    const cookies = await mintGmCookies();
    const context = await this.browser.createBrowserContext();
    try {
      await context.setCookie(...cookies.map(({ name, value, path: p, httpOnly, secure }) =>
        ({ name, value, path: p || "/", httpOnly: !!httpOnly, secure: !!secure, url: this.base })));
      const page = await context.newPage();
      const rec = { key: "GM", context, page };
      this.attach(rec);
      await page.setViewport(VIEWPORT);
      await page.evaluateOnNewDocument(bridgeGuardSource());
      await page.evaluateOnNewDocument(probesSource({ board: true, hideDice: true }));
      await page.goto(`${this.base}/game`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForFunction("globalThis.game?.ready === true", { timeout: 240_000, polling: 500 });
      await page.waitForFunction("!globalThis.game.scenes.active || (globalThis.canvas?.ready === true && !canvas.loading)",
        { timeout: 120_000, polling: 500 }).catch(() => note("GM page: canvas not ready yet; going on"));
      const st = await page.evaluate(() => ({ user: game.user?.name, isGM: !!game.user?.isGM, role: game.user?.role,
        activeGM: game.users.activeGM?.name ?? null, self: game.users.activeGM?.id === game.user?.id,
        bridge: globalThis.foundryMCPBridge?.getStatus?.()?.connected === true }));
      if (st.bridge) throw new RunnerError("bridgeConnected", "the MCP bridge connected on the GM page despite the guard: stopping");
      if (!st.isGM) throw new RunnerError("notGm", `the minted session is ${st.user}, not a GM`);
      this.gm = { ...rec, status: st };
      if (!this.gmResume.captured) {
        const r = await page.evaluate(composeExpression(opResumeRead)).then(JSON.parse);
        this.gmResume = { captured: true, available: r.available, view: r.view };
      }
      note(`GM page: ${st.user} (role ${st.role}), activeGM ${st.activeGM}${st.self ? " (this page)" : ""}, bridge blocked`);
      return page;
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }
  }

  async assertBridgeOff() {
    if (!this.gm || this.gm.page.isClosed()) return;
    const on = await this.gm.page.evaluate(() => globalThis.foundryMCPBridge?.getStatus?.()?.connected === true);
    if (on) throw new RunnerError("bridgeConnected", "the MCP bridge connected on the GM page despite the guard: stopping");
  }

  /** Close the GM page; its own pentaryn-resume view flag is put back first. */
  async closeGm() {
    if (!this.gm) return;
    try {
      if (this.gmResume.available && !this.gm.page.isClosed()) {
        await this.gm.page.evaluate(composeExpression(opResumeRestore, { view: this.gmResume.view }));
      }
    } catch (err) {
      note(`GM page: could not restore its resume view flag (${String(err?.message ?? err).slice(0, 120)})`);
    }
    await this.gm.context.close().catch(() => {});
    this.gm = null;
    note("GM page closed");
  }

  playerExec(key) {
    return new PageExec(async () => (await this.ensurePlayer(key)), `player ${key}`);
  }

  async ensurePlayer(key) {
    const have = this.players[key];
    if (have && !have.page.isClosed()) return have.page;
    const name = FIX.users[key];
    const userId = this.ids?.users?.[key];
    const password = this.passwords[key];
    if (!userId || !password) throw new Error(`no id or password for ${name} in this run`);
    const context = await this.browser.createBrowserContext();
    try {
      const page = await context.newPage();
      const rec = { key, context, page };
      this.attach(rec);
      await page.setViewport(VIEWPORT);
      await page.evaluateOnNewDocument(probesSource({ noCanvas: key === "C" }));
      await page.goto(`${this.base}/join`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      // the /join form's own route (FoundryAdmin.join): the user's password, never admin loginAs
      const r = await page.evaluate(async (id, pw) => {
        const res = await fetch("/join", { method: "POST", credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "join", userid: id, userId: id, password: pw }) });
        let body = null;
        try { body = await res.json(); } catch { /* not JSON */ }
        return { status: res.status, ok: res.ok && body?.status === "success", message: body?.message ?? body?.error ?? null };
      }, userId, password);
      if (!r.ok) throw new Error(`join ${name} refused: HTTP ${r.status} ${String(r.message ?? "").slice(0, 120)}`);
      await page.goto(`${this.base}/game`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForFunction("globalThis.game?.ready === true", { timeout: 180_000, polling: 500 });
      if (key !== "C") {
        await page.waitForFunction("globalThis.canvas?.ready === true && !canvas.loading", { timeout: 120_000, polling: 500 })
          .catch(() => note(`${name}: canvas not ready after login`));
      }
      this.players[key] = rec;
      note(`${name} logged in`);
      return page;
    } catch (err) {
      await context.close().catch(() => {});
      throw err;
    }
  }

  async logoutPlayer(key) {
    const rec = this.players[key];
    if (!rec) return;
    await rec.context.close().catch(() => {});
    delete this.players[key];
    await this.waitUserActive(key, false, 20_000);
    note(`${FIX.users[key]} logged out`);
  }

  /** Any open page: the GM page first, else a player's. */
  anyPage() {
    if (this.gm && !this.gm.page.isClosed()) return this.gm.page;
    return Object.values(this.players).find(p => !p.page.isClosed())?.page ?? null;
  }

  async activeGmName() {
    const page = this.anyPage();
    return page ? page.evaluate(() => globalThis.game?.users?.activeGM?.name ?? null).catch(() => null) : null;
  }

  async waitActiveGm(name, ms) {
    const end = Date.now() + ms;
    let got = null;
    while (Date.now() < end) {
      got = await this.activeGmName();
      if (got === name) return got;
      await sleep(500);
    }
    return got;
  }

  async waitUserActive(key, active, ms) {
    const id = this.ids.users[key];
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const page = this.anyPage();
      const now = page ? await page.evaluate(i => !!globalThis.game?.users?.get(i)?.active, id).catch(() => null) : null;
      if (now === active) return true;
      await sleep(400);
    }
    return false;
  }

  async realOnline() {
    const page = this.anyPage();
    if (!page) return this.gmExec.run(opRealOnline, {}, "realOnline");
    return page.evaluate(p => (globalThis.game?.users ?? []).filter(u => u.active && !u.isGM && !String(u.name).startsWith(p))
      .map(u => u.name), PREFIX);
  }

  pageFor(key) {
    if (key === "GM") return this.gm?.page ?? null;
    return this.players[key]?.page ?? null;
  }

  async probe(key) {
    const page = this.pageFor(key);
    if (!page || page.isClosed()) throw new Error(`${key}'s page is not open`);
    return page.evaluate(probeFn);
  }

  async toastSeq(key) {
    const page = this.pageFor(key);
    return page ? page.evaluate(() => globalThis.__pinsLive?.seq ?? 0).catch(() => 0) : 0;
  }

  async toastsSince(key, seq) {
    const page = this.pageFor(key);
    return page ? page.evaluate(m => (globalThis.__pinsLive?.toasts ?? []).filter(t => t.seq > m), seq).catch(() => []) : [];
  }

  /** Poll a player's view until it shows `sceneId` (settled), or until `ms`. `settleOnly`: just wait out loading. */
  async waitView(key, sceneId, ms, { settleOnly = false, signal = null } = {}) {
    const end = Date.now() + ms;
    let probe = null;
    while (Date.now() < end) {
      probe = await this.probe(key).catch(() => null);
      if (probe && !probe.loading && (settleOnly || probe.scene === sceneId)) return { ok: probe.scene === sceneId, probe };
      await sleepFor(250, signal);
    }
    return { ok: false, probe };
  }

  errorMarks() {
    const marks = new Map();
    for (const rec of [this.gm, ...Object.values(this.players)].filter(Boolean)) marks.set(rec, rec.errors.length);
    return marks;
  }

  errorsSince(marks) {
    const out = {};
    for (const rec of [this.gm, ...Object.values(this.players)].filter(Boolean)) {
      const errs = rec.errors.slice(marks.get(rec) ?? 0);
      if (errs.length) out[rec.key] = { count: errs.length, first: errs.slice(0, 5) };
    }
    return out;
  }

  async runScenario(id, { exec = null, label = id, signal = null } = {}) {
    const sc = SCENARIOS[id];
    const x = new Ctx(this, label, exec ?? this.gmExec);
    const started = Date.now();
    const marks = this.errorMarks();
    const out = { id: label, pass: false, skipped: false, evidence: null, error: null };
    note(`${label}: ${sc.title}`);
    try {
      if (sc.skip) throw new SkipError(sc.skip);
      // the verdict is taken from the returned checks only once the scenario has finished in time:
      // a timed-out one is cancelled (x.signal) and can no longer turn its result green (S1/D2)
      const checks = await withDeadline(async ctl => {
        x.signal = ctl;
        if (x.mode === "page" && sc.needs?.gmPage) await this.ensureGm();
        for (const k of sc.needs?.players ?? []) await this.ensurePlayer(k);
        await this.assertBridgeOff();
        x.evidence.activeGMAtStart = await this.activeGmName();
        if (sc.setup) await sc.setup(x);
        x.live();
        x.acted = await sc.act(x);
        x.live();
        x.evidence.activeGM = await this.activeGmName();
        const got = await sc.assert(x);
        x.live();
        await this.assertBridgeOff();
        x.evidence.gmPageBridge = this.gm ? "blocked (connected !== true asserted)" : "no GM page open";
        return got;
      }, this.timeoutMs, `${label} did not finish in ${this.timeoutMs / 1000} s`, { parent: signal ?? this.stopSignal });
      x.evidence.checks = checks;
      out.pass = Array.isArray(checks) && checks.length > 0 && checks.every(c => c.ok);
    } catch (err) {
      if (err instanceof SkipError) {
        out.skipped = true;
        x.evidence.skipReason = err.message;
      } else {
        if (err instanceof RunnerError) throw err;   // bridge connected, Infisical: stop the run
        out.error = String(err?.message ?? err).slice(0, 600);
        if (err?.timedOut) x.evidence.cancelled = { settled: err.settled };
      }
    }
    if (x.evidence.activeGM === undefined) x.evidence.activeGM = await this.activeGmName().catch(() => null);
    const pageErrors = this.errorsSince(marks);
    if (Object.keys(pageErrors).length) x.evidence.pageErrors = pageErrors;
    x.evidence.ms = Date.now() - started;
    out.evidence = { title: sc.title, mode: x.mode, ...x.evidence };
    note(`${label}: ${out.skipped ? "skipped" : out.pass ? "pass" : "FAIL"}`);
    return out;
  }

  async shutdown() {
    for (const k of Object.keys(this.players)) await this.players[k].context.close().catch(() => {});
    this.players = {};
    await this.closeGm().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.browser = null;
  }
}

/* ── modes ──────────────────────────────────────────────────────────────── */

let runLog = null;   // this run's .state/pins-live.jsonl (main opens it once the lock is held)
const emit = obj => { process.stdout.write(JSON.stringify(obj) + "\n"); runLog?.write(obj); };

/**
 * The stderr note for a stopped run's stash (R2: never written back), or null when there is nothing to
 * say. `left`: opRestore's `pinningLeft` { now, stashed, at, pinsActive }. With pentaryn-pins disabled
 * `now` is the STORED value (null: unreadable), never a guess (#8).
 */
export function pinningLeftMessage(left) {
  if (!left) return null;
  const sw = v => (v === true ? "ON" : v === false ? "OFF" : "unknown");
  const fix = "If that run changed it and you want it back, set it yourself (Configure Settings > Pentaryn Pins).";
  if (left.pinsActive === false) {
    return `pentaryn-pins is not active, so the Pinning switch was LEFT as is: its stored value is ${sw(left.now)}; `
      + `a stopped run's stash (from ${left.at}) recorded it ${sw(left.stashed)} when that run started. ${fix.replace("set it yourself", "enable the module and set it yourself")}`;
  }
  if (left.now === left.stashed) return null;
  return `the Pinning switch is ${sw(left.now)} and was LEFT as is: a stopped run's stash (from ${left.at}) `
    + `recorded it ${sw(left.stashed)} when that run started. ${fix}`;
}

/** A stopped run's stash recorded another switch value (or pins is off): say so; never write it (R2). */
function notePinningLeft(restored) {
  const msg = pinningLeftMessage(restored?.pinningLeft);
  if (msg) note(msg);
}

async function preflight(env, { needPins = true } = {}) {
  const pre = await env.gmExec.run(opPreflight, {}, "preflight");
  if (pre.bridgeConnected) throw new RunnerError("bridgeConnected", "the MCP bridge is connected on the GM page");
  if (needPins && !(pre.mods["pentaryn-pins"]?.active && pre.pinsApi && pre.pinning !== null)) {
    throw new RunnerError("modulesNotLive", `pentaryn-pins is not live in ${pre.world} (module ${JSON.stringify(pre.mods["pentaryn-pins"])})`);
  }
  return pre;
}

async function seedMode(env) {
  await env.launch();
  const pre = await preflight(env);
  const pw = Object.fromEntries(Object.keys(FIX.users).map(k => [k, newPassword()]));   // never used: --run sets fresh ones
  await env.gm.page.evaluate(pageSetUsers, FIX.users, pw, true);
  // a stopped run's leftovers: put back the active scene and the GM's resume view its stash kept (never
  // the switch: R2, reported instead), then delete every stale or extra PinTest document and every
  // fixture token (laid fresh below)
  const restored = await env.gmExec.run(opRestore, { dropStash: true, runId: env.runId }, "seed restore");
  notePinningLeft(restored);
  if (restored?.stash && restored.gmResume !== undefined && env.gmResume.available) env.gmResume.view = restored.gmResume;
  const plan = stalePlan(await env.gmExec.run(opSeedSnapshot, {}, "seed snapshot"));
  const pruned = await env.gmExec.run(opPrune, { plan }, "seed prune");
  if (pruned.refused.length) note(`seed prune: refused ${pruned.refused.length} (not PinTest): ${pruned.refused.join("; ").slice(0, 300)}`);
  const seed = await env.gmExec.run(opSeed, {}, "seed");
  await env.gmExec.run(opArrange, { layout: LAYOUT.home }, "seed arrange");
  const pins = await env.gmExec.run(opPin, {}, "seed pin");
  const st = await env.gmExec.run(opState, {}, "seed state");
  return { mode: "seed", ok: st.ok, world: pre.world, missing: st.missing, notes: seed.notes, levels: seed.levels, pins,
    stale: { restored: restored?.stash ? restored : null, reasons: plan.reasons, kept: plan.kept, pruned },
    ids: { users: st.users, actors: st.actors, scenes: st.scenes } };
}

async function cleanupMode(env) {
  await env.launch();
  const pre = await preflight(env, { needPins: false });
  let restored = null;
  try {
    restored = await env.gmExec.run(opRestore, { dropStash: false, runId: env.runId }, "cleanup restore");
    notePinningLeft(restored);
    if (restored?.gmResume !== undefined && restored?.stash && env.gmResume.available) env.gmResume.view = restored.gmResume;
  } catch (err) {
    restored = { error: String(err?.message ?? err).slice(0, 200) };
  }
  const restoreOk = restoreSucceeded(restored);
  const deleted = await env.gmExec.run(opCleanup, { keepStash: !restoreOk }, "cleanup");
  // opRestore kept the stash (dropStash false), but the cleanup deletes its scene unless it was kept:
  // say what is true after the cleanup (#8: a stopped run's switch value lives on only in this summary)
  if (restored?.stash) restored.stashKept = !!deleted?.keptStashScene;
  const left = await env.gmExec.run(opState, {}, "cleanup state").catch(() => null);
  if (!restoreOk) note("cleanup: the restore failed, so the stash scene is KEPT: fix the cause (is pentaryn-pins enabled?) and re-run --cleanup");
  return { mode: "cleanup", ok: restoreOk, world: pre.world, restored, deleted,
    leftover: left ? { users: left.users, actors: left.actors, scenes: left.scenes } : null };
}

async function runMode(env, ids) {
  const results = [];
  let refused = null, restored = null, staleStash = null;
  await env.launch();
  const pre = await preflight(env);
  if (pre.realOnline.length) return { results, refused: { code: "realPlayerOnline", users: pre.realOnline }, pre };
  const st = await env.gmExec.run(opState, {}, "state");
  if (!st.ok) return { results, refused: { code: "notSeeded", missing: st.missing }, pre };
  try {
    env.ids = st;
    const stash = await env.gmExec.run(opStash, { gmResume: env.gmResume.view, runId: env.runId }, "stash");
    if (stash.stale) {
      staleStash = stash.stale;
      if (env.gmResume.available) env.gmResume.view = stash.stash.gmResume ?? null;   // a crashed run's original
      notePinningLeft({ pinningLeft: { now: stash.stash.pinning, stashed: stash.stale.pinning, at: stash.stale.at } });
    }
    env.passwords = Object.fromEntries(Object.keys(FIX.users).map(k => [k, newPassword()]));
    await env.gm.page.evaluate(pageSetUsers, FIX.users, env.passwords, false);
    await env.gmExec.run(opActivate, { scene: "north" }, "activate north");
    for (const [i, id] of ids.entries()) {
      const online = env.stopSignal.aborted ? [] : await env.realOnline();
      if (env.stopSignal.aborted || online.length) {
        const why = env.stopSignal.aborted ? "interrupted" : "realPlayerOnline";
        refused = env.stopSignal.aborted ? { code: "interrupted", before: id } : { code: "realPlayerOnline", users: online, before: id };
        for (const rest of ids.slice(i)) {
          const r = { id: rest, pass: false, skipped: true, evidence: { skipReason: why }, error: null };
          results.push(r);
          emit(r);
        }
        break;
      }
      const r = await env.runScenario(id);
      results.push(r);
      emit(r);
    }
    // a signal during the last scenario: still a stopped run (exit 2), not a clean one
    if (!refused && env.stopSignal.aborted) refused = { code: "interrupted", after: ids.at(-1) ?? null };
  } finally {
    // the GM page, else the bot: put back the switch and the active scene; the GM page's close puts back its resume flag
    try {
      restored = await env.gmExec.run(opRestore, { dropStash: true, runId: env.runId }, "restore");
    } catch (err) {
      note(`restore via the GM page failed (${String(err?.message ?? err).slice(0, 160)}); trying the bot`);
      restored = await env.bot.run(opRestore, { dropStash: true, runId: env.runId }, "restore").catch(e => ({ error: String(e?.message ?? e).slice(0, 200) }));
    }
  }
  return { results, refused, pre, restored, staleStash };
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    emit({ summary: true, ok: false, refused: { code: "badArgs", message: err.message } });
    return 2;
  }
  if (opts.help) {
    process.stderr.write(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0] + "*/\n");
    return 0;
  }
  if (opts.mode === "list") {
    for (const [id, s] of Object.entries(SCENARIOS)) emit({ id, title: s.title, needs: s.needs ?? null, skip: s.skip ?? null });
    return 0;
  }
  loadEnvFile();
  const base = (opts.url ?? `http://127.0.0.1:${process.env.FOUNDRY_PORT || "30000"}`).replace(/\/$/, "");
  const env = new Env({ base, timeoutMs: opts.timeoutS * 1000 });
  const started = Date.now();
  let release = null;
  // Ctrl-C / SIGTERM / SIGHUP: cancel the running scenario and restore before exiting; a second one exits now (S2)
  const onSignal = sig => {
    if (env.stopSignal.aborted) { note(`${sig} again: exiting without the restore`); process.exit(130); }
    note(`${sig}: stopping after the current step, then restoring (${sig} again to exit at once)`);
    env.stop.abort(new Error(`interrupted by ${sig}`));
  };
  const removeHandlers = installStopHandlers(onSignal);
  // after a SIGHUP the terminal is gone: a write to it must not crash the restore
  const quiet = () => {};
  process.stdout.on("error", quiet);
  process.stderr.on("error", quiet);
  try {
    release = acquireLock(lockPath());   // before the lines file: a refused run must not truncate a live run's
    runLog = openRunLog(runLogPath(), { run: true, mode: opts.mode, runId: env.runId, pid: process.pid,
      startedAt: new Date(started).toISOString(), ids: opts.mode === "run" ? opts.ids : null });
    if (opts.mode === "seed") {
      const r = await seedMode(env);
      emit(r);
      emit({ summary: true, mode: "seed", ok: r.ok, ms: Date.now() - started });
      return exitCodeFor({ ok: r.ok });
    }
    if (opts.mode === "cleanup") {
      const r = await cleanupMode(env);
      emit(r);
      emit({ summary: true, mode: "cleanup", ok: r.ok, ms: Date.now() - started });
      return exitCodeFor({ restoreOk: r.ok });
    }
    const { results, refused, pre, restored, staleStash } = await runMode(env, opts.ids);
    const s = summarize(results);
    const restoreOk = restoreSucceeded(restored);
    emit({ summary: true, mode: "run", ok: !refused && s.failed === 0 && restoreOk, world: pre?.world ?? null,
      versions: pre ? Object.fromEntries(Object.entries(pre.mods).map(([k, v]) => [k, v?.version ?? null])) : null,
      ...s, refused, restored, restoreOk, staleStash, ms: Date.now() - started });
    return exitCodeFor({ refused, failed: s.failed, restoreOk });
  } catch (err) {
    const code = err instanceof RunnerError ? err.code : "fatal";
    emit({ summary: true, mode: opts.mode, ok: false, refused: { code, message: String(err?.message ?? err).slice(0, 500) },
      ms: Date.now() - started });
    return exitCodeFor({ refused: { code } });
  } finally {
    await env.shutdown().catch(() => {});
    runLog?.close();
    runLog = null;
    release?.();
    removeHandlers();
    process.stdout.off("error", quiet);
    process.stderr.off("error", quiet);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => process.exit(code), err => {
    emit({ summary: true, ok: false, refused: { code: "fatal", message: String(err?.stack ?? err).slice(0, 500) } });
    process.exit(2);
  });
}
