/**
 * Unit tests for pins-live.mjs's pure helpers. Nothing here starts a browser or talks to Foundry.
 *   node --test automation/smoke/pins-live.test.mjs
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FIX, GM_COOKIE_ARGS, LAYOUT, OPS, PREFIX, RunnerError, SCENARIOS, SPOTS, TEXT, BRIDGE_PORTS,
  cannotSwitchToasts, centreOf, chebyshev, compactLayout, composeExpression, followToasts, helperFailure,
  installBridgeGuard, installPageProbes, isLocalUrl, isTestName, mintGmCookies, newPassword, normalizeId, parseArgs,
  offFloor, parseEvalReply, realPlayersOnline, runHelper, stalePlan, sawCanvasDisabled, sceneKeyOf, submenuUsers, summarize,
  tokensOn, violationsFor, withDeadline, sleepFor, acquireLock, restoreSucceeded, MAX_TIMEOUT_S, bridgeGuardSource, probesSource,
  STOP_SIGNALS, PUPPETEER_SIGNAL_OPTIONS, installStopHandlers, exitCodeFor, openRunLog, main, pinningLeftMessage,
  POS, distanceFt, overlapping, userNames, testRows,
} from "./pins-live.mjs";

const IDS = Object.keys(SCENARIOS);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const VENV_PY = path.join(REPO, ".venv/bin/python");

test("the scenario table is S01..S27, each with a title and either a skip or act + assert", () => {
  assert.deepEqual(IDS, Array.from({ length: 27 }, (_, i) => `S${String(i + 1).padStart(2, "0")}`));
  for (const [id, s] of Object.entries(SCENARIOS)) {
    assert.ok(s.title, id);
    if (s.skip) continue;
    assert.equal(typeof s.act, "function", id);
    assert.equal(typeof s.assert, "function", id);
  }
  assert.match(SCENARIOS.S19.skip, /not tested/);
  assert.deepEqual(SCENARIOS.S18.subs, ["S06", "S08", "S10"]);
  // the bot re-runs must not need the GM page
  for (const id of SCENARIOS.S18.subs) assert.ok(!SCENARIOS[id].needs?.gmPage, id);
});

test("parseArgs: modes, ids normalised and in table order, localhost only", () => {
  assert.deepEqual(parseArgs(["--run"]).ids, IDS);
  assert.deepEqual(parseArgs(["--run", "s10", "6", "S08"]).ids, ["S06", "S08", "S10"]);
  assert.equal(parseArgs(["--seed"]).mode, "seed");
  assert.equal(parseArgs(["--cleanup"]).mode, "cleanup");
  assert.equal(parseArgs(["--list"]).mode, "list");
  assert.equal(parseArgs(["--run", "S01", "--timeout", "120"]).timeoutS, 120);
  assert.throws(() => parseArgs([]), /exactly one/);
  assert.throws(() => parseArgs(["--seed", "--run"]), /exactly one/);
  assert.throws(() => parseArgs(["--run", "S42"]), /unknown scenario/);
  assert.throws(() => parseArgs(["--run", "--bogus"]), /unknown argument/);
  assert.throws(() => parseArgs(["--run", "--url", "https://vtt.atjoseph.com"]), /localhost/);
  assert.throws(() => parseArgs(["--run", "--timeout", "5"]), /seconds/);
  // past setTimeout's 2^31-1 ms the timer fires at once and every scenario would run concurrently (S6)
  assert.throws(() => parseArgs(["--run", "--timeout", "2147484"]), /seconds/);
  assert.throws(() => parseArgs(["--run", "--timeout", String(MAX_TIMEOUT_S + 1)]), /seconds/);
  assert.equal(parseArgs(["--run", "--timeout", String(MAX_TIMEOUT_S)]).timeoutS, MAX_TIMEOUT_S);
  assert.equal(parseArgs(["--run", "--url", "http://127.0.0.1:30000"]).url, "http://127.0.0.1:30000");
});

test("normalizeId and isLocalUrl", () => {
  assert.equal(normalizeId("s6"), "S06");
  assert.equal(normalizeId("S18"), "S18");
  assert.equal(normalizeId("x"), null);
  assert.ok(isLocalUrl("http://127.0.0.1:30000"));
  assert.ok(isLocalUrl("http://localhost:30000/"));
  assert.ok(!isLocalUrl("https://vtt.atjoseph.com"));
  assert.ok(!isLocalUrl("not a url"));
});

test("realPlayersOnline: active non-GM users not named PinTest*", () => {
  const users = [
    { name: "PinTest-A", active: true, isGM: false },
    { name: "Talo", active: true, isGM: false },
    { name: "Caven", active: false, isGM: false },
    { name: "Gamemaster", active: true, isGM: true },
    { name: "Claude", active: true, isGM: true },
  ];
  assert.deepEqual(realPlayersOnline(users), ["Talo"]);
  assert.deepEqual(realPlayersOnline(users.filter(u => u.name !== "Talo")), []);
  assert.ok(isTestName("PinTest North"));
  assert.ok(!isTestName("Pintest North"));
});

test("every fixture document is named with the PinTest prefix", () => {
  const names = [...Object.values(FIX.users), ...Object.values(FIX.actors).map(a => a.name),
    ...Object.values(FIX.scenes).map(s => s.name), ...Object.values(FIX.portal).map(p => p.name)];
  for (const n of names) assert.ok(n.startsWith(PREFIX), n);
  assert.equal(FIX.prefix, PREFIX);
});

test("the GM session is handed over on an inherited pipe (fd 3): no path on disk, nothing secret in argv", () => {
  assert.deepEqual(GM_COOKIE_ARGS, ["cookie", "--as", "gm", "--out", "/dev/fd/3"]);
  const src = readFileSync(path.join(REPO, "automation/smoke/pins-live.mjs"), "utf8");
  assert.ok(!/XDG_RUNTIME_DIR|pins-live-gm\.json|readSecretFile|writeFileSync/.test(src), "no hand-off file anywhere in the runner");
});

test("runHelper: the secret arrives on fd 3, apart from the stdout summary, and is never in stdout or stderr", async () => {
  const script = `const fs = require("node:fs");
    fs.writeSync(3, JSON.stringify({ cookies: [{ name: "session", value: "SECRET-VALUE" }] })); fs.closeSync(3);
    process.stdout.write(JSON.stringify({ ok: true, user: "Gamemaster", out: "/dev/fd/3" }) + "\\n");`;
  const r = await runHelper(["ignored"], { command: [process.execPath, "-e", script, "--"], secretFd: true, timeoutMs: 10_000 });
  assert.equal(r.code, 0);
  assert.equal(r.secret.cookies[0].value, "SECRET-VALUE");
  assert.deepEqual(r.json, { ok: true, user: "Gamemaster", out: "/dev/fd/3" });
  assert.ok(!JSON.stringify({ json: r.json, err: r.err }).includes("SECRET"));
  // no secretFd: no fourth pipe and no secret
  const plain = await runHelper([], { command: [process.execPath, "-e", "console.log(JSON.stringify({ok:true}))"], timeoutMs: 10_000 });
  assert.equal(plain.secret, null);
  assert.deepEqual(plain.json, { ok: true });
});

test("runHelper: garbage on the pipe is dropped without echoing it", async () => {
  const script = `require("node:fs").writeSync(3, "not json SECRET"); console.log("{}");`;
  const r = await runHelper([], { command: [process.execPath, "-e", script], secretFd: true, timeoutMs: 10_000 });
  assert.equal(r.secret, null);
  assert.ok(!JSON.stringify(r).includes("SECRET"));
});

test("headless_gm._write_private writes to an inherited pipe for --out /dev/fd/N (no file)", { skip: !existsSync(VENV_PY) && "no .venv" }, async () => {
  const py = `from pathlib import Path
from scripts.foundry.ops.headless_gm import _write_private
_write_private(Path("/dev/fd/3"), {"cookies": [{"name": "session", "value": "PY-SECRET"}]})
print('{"ok": true}')`;
  const r = await runHelper([], { command: [VENV_PY, "-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(REPO)})\n${py}`], secretFd: true, timeoutMs: 30_000 });
  assert.equal(r.code, 0, r.err);
  assert.equal(r.secret.cookies[0].value, "PY-SECRET");
  assert.deepEqual(r.json, { ok: true });
});

test("headless_gm._write_private refuses an fd that is a regular file (or a terminal): the secret never lands", { skip: !existsSync(VENV_PY) && "no .venv" }, async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pins-live-test-"));
  const file = path.join(dir, "landed");
  const fd = openSync(file, "w", 0o600);
  try {
    const code = await new Promise(resolve => {
      const child = spawn(VENV_PY, ["-I", "-c", `import sys; sys.path.insert(0, ${JSON.stringify(REPO)})
from pathlib import Path
from scripts.foundry.ops.headless_gm import HandOffRefused, _write_private
try:
    _write_private(Path("/dev/fd/3"), {"cookies": [{"name": "session", "value": "PY-SECRET"}]})
except HandOffRefused:
    sys.exit(9)
sys.exit(0)`], { stdio: ["ignore", "ignore", "ignore", fd] });
      child.on("close", resolve);
    });
    assert.equal(code, 9);
    assert.equal(readFileSync(file, "utf8"), "");
  } finally {
    closeSync(fd);
    rmSync(dir, { recursive: true, force: true });
  }
});

test("mintGmCookies: the cookies from the pipe; a failed or empty hand-off is a named RunnerError with no secret", async () => {
  const calls = [];
  const ok = async (args, opts) => { calls.push({ args, opts }); return { code: 0, json: { ok: true }, err: "", secret: { cookies: [{ name: "session", value: "v" }] } }; };
  assert.deepEqual(await mintGmCookies(ok), [{ name: "session", value: "v" }]);
  assert.deepEqual(calls[0].args, GM_COOKIE_ARGS);
  assert.equal(calls[0].opts.secretFd, true);
  const infisical = async () => ({ code: 5, json: { ok: false, error: "admin password unavailable: infisical: run infisical login" }, err: "", secret: null });
  await assert.rejects(mintGmCookies(infisical), e => e instanceof RunnerError && e.code === "infisicalLogin");
  const empty = async () => ({ code: 0, json: { ok: true }, err: "", secret: null });
  await assert.rejects(mintGmCookies(empty), e => e instanceof RunnerError && e.code === "helperFailed");
  // a session that arrived with a failure exit is not used
  const late = async () => ({ code: 1, json: { ok: false, error: "boom" }, err: "", secret: { cookies: [{ name: "session", value: "LEAK" }] } });
  await assert.rejects(mintGmCookies(late), e => e.code === "helperFailed" && !e.message.includes("LEAK"));
});

test("stalePlan: a leftover PinTest set is pruned to a clean slate; nothing real is touched", () => {
  const rectN = { type: "rectangle", ...FIX.portal.north.rect };
  const rectS = { type: "rectangle", ...FIX.portal.south.rect };
  const portal = (id, name, shape, levels = []) => ({ id, name, shapes: [shape], levels, behaviors: ["teleportToken"] });
  const snap = {
    actors: [
      { id: "aA", name: "PinTest Alpha" }, { id: "aA2", name: "PinTest Alpha" },            // a duplicate
      { id: "aS", name: "PinTest Alpha Summon" }, { id: "aP", name: "PinTest Alpha Pet" },
      { id: "aB", name: "PinTest Beta" }, { id: "aG", name: "PinTest Gamma" }, { id: "aW", name: "PinTest Wolf" },
      { id: "aF", name: "PinTest Alpha (PinTest Wolf)", originalActor: "aA" },              // a crashed S16's form
      { id: "aF2", name: "Wolf form", originalActor: "aA" },                                // a form of a test actor, renamed
      { id: "aOld", name: "PinTest Leftover" },
      { id: "aT", name: "Talo" }, { id: "aTF", name: "Talo (Bear)", originalActor: "aT" },
    ],
    scenes: [
      { id: "real", name: "camp-site", levels: ["Ground"], tokens: [
          { id: "t1", name: "Talo", actorId: "aT" }, { id: "t2", name: "PinTest Alpha", actorId: "aA" },
          { id: "t3", name: "Wolf", actorId: "aF2", originalActor: "aA" }, { id: "t4", name: "Bear", actorId: "aTF", originalActor: "aT" }],
        regions: [portal("r1", "PinTest Portal North", rectN), portal("r2", "Door", rectN)] },
      { id: "N", name: "PinTest North", levels: ["Level 1"], tokens: [
          { id: "n1", name: "PinTest Alpha", actorId: "aA" }, { id: "n2", name: "PinTest Alpha", actorId: "aA" },
          { id: "n3", name: "Talo", actorId: "aT" }, { id: "n4", name: "Prompt", actorId: null }],
        regions: [portal("rn", "PinTest Portal North", rectN), portal("rn2", "PinTest Portal North", rectN), portal("rx", "Stray", rectS)] },
      { id: "N2", name: "PinTest North", levels: [], tokens: [], regions: [] },
      { id: "S", name: "PinTest South", levels: ["Ground"], tokens: [{ id: "s1", name: "PinTest Beta", actorId: "aB" }], regions: [] },
      { id: "X", name: "PinTest Old", levels: [], tokens: [], regions: [] },
    ],
    journals: [{ id: "j1", name: "PinTest note" }, { id: "j2", name: "Lore" }],
    users: [{ id: "uA", name: "PinTest-A", isGM: false, resumeView: true }, { id: "uB", name: "PinTest-B", isGM: false, resumeView: false },
      { id: "uT", name: "Talo", isGM: false, resumeView: true }],
  };
  const plan = stalePlan(snap);
  assert.deepEqual(plan.actors.sort(), ["aA2", "aF", "aF2", "aOld"].sort());
  assert.deepEqual(plan.scenes.sort(), ["N2", "S", "X"].sort());      // S: one level where the fixture has Ground + Upper
  assert.deepEqual(plan.journals, ["j1"]);
  assert.deepEqual(plan.resumeUsers, ["uA"]);
  const byScene = list => Object.fromEntries(list.map(e => [e.scene, [...e.ids].sort()]));
  assert.deepEqual(byScene(plan.tokens), { real: ["t2", "t3"], N: ["n1", "n2", "n4"] });   // every fixture token: --seed lays them fresh
  assert.deepEqual(byScene(plan.regions), { real: ["r1"], N: ["rn2", "rx"] });
  assert.ok(plan.kept.some(k => /Talo/.test(k) && /PinTest North/.test(k)), plan.kept.join(" | "));
  assert.ok(plan.reasons.some(r => /PinTest South/.test(r) && /level/.test(r)), plan.reasons.join(" | "));
  // nothing real anywhere in the plan
  const all = JSON.stringify(plan.tokens) + JSON.stringify(plan.regions) + plan.actors + plan.scenes + plan.journals + plan.resumeUsers;
  assert.ok(!plan.scenes.includes("real"));
  for (const id of ["aT", "aTF", "t1", "t4", "r2", "j2", "uT"]) assert.ok(!new RegExp(`"${id}"|\\b${id}\\b`).test(all), id);
});

test("stalePlan: a wrong portal is replaced; a clean seed only re-lays the fixture tokens", () => {
  const rectS = { type: "rectangle", ...FIX.portal.south.rect };
  const clean = {
    actors: Object.entries(FIX.actors).map(([k, a]) => ({ id: k, name: a.name })),
    scenes: [
      { id: "N", name: "PinTest North", levels: ["Level 1"], tokens: [{ id: "n1", name: "PinTest Alpha", actorId: "alpha" }],
        regions: [{ id: "rn", name: "PinTest Portal North", shapes: [{ type: "rectangle", ...FIX.portal.north.rect }], levels: [], behaviors: ["teleportToken"] }] },
      { id: "S", name: "PinTest South", levels: ["Ground", "Upper"], tokens: [],
        regions: [{ id: "rs", name: "PinTest Portal South", shapes: [rectS], levels: ["Ground"], behaviors: ["teleportToken"] }] },
    ],
    journals: [], users: [],
  };
  const p = stalePlan(clean);
  assert.deepEqual(p.actors, []);
  assert.deepEqual(p.scenes, []);
  assert.deepEqual(p.regions, []);
  assert.deepEqual(p.reasons, []);
  assert.deepEqual(p.tokens, [{ scene: "N", ids: ["n1"] }]);
  const moved = structuredClone(clean);
  moved.scenes[1].regions[0].shapes[0].x += 100;
  assert.deepEqual(stalePlan(moved).regions, [{ scene: "S", ids: ["rs"] }]);
  const wrongFloor = structuredClone(clean);
  wrongFloor.scenes[1].regions[0].levels = ["Upper"];
  assert.deepEqual(stalePlan(wrongFloor).regions, [{ scene: "S", ids: ["rs"] }]);
  const noBehavior = structuredClone(clean);
  noBehavior.scenes[0].regions[0].behaviors = [];
  assert.deepEqual(stalePlan(noBehavior).regions, [{ scene: "N", ids: ["rn"] }]);
});

test("helperFailure: Infisical auth means `infisical login`; other codes are named; no secret in the text", () => {
  const auth = helperFailure(5, { error: "admin password unavailable: Infisical could not authenticate. Run `infisical login` in WSL" });
  assert.equal(auth.code, "infisicalLogin");
  assert.match(auth.message, /infisical login/);
  assert.equal(helperFailure(5, { error: "admin password unavailable: the `infisical` CLI is not installed" }).code, "adminPasswordUnavailable");
  assert.equal(helperFailure(2, { error: "no active world" }).code, "noWorld");
  assert.equal(helperFailure(4).code, "noGm");
  assert.equal(helperFailure(1, null, "boom").code, "helperFailed");
});

test("newPassword: random, url-safe, long", () => {
  const a = newPassword(), b = newPassword();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{32}$/);
});

test("parseEvalReply: the eval result, or a thrown reason", () => {
  const wrap = obj => ({ id: "1", result: { content: [{ type: "text", text: JSON.stringify(obj) }] } });
  assert.equal(parseEvalReply(wrap({ ok: true, phase: "complete", result: "{\"a\":1}" })), "{\"a\":1}");
  assert.throws(() => parseEvalReply(wrap({ ok: false, phase: "runtime", error: "nope" })), /runtime: nope/);
  assert.throws(() => parseEvalReply(wrap({ ok: false, phase: "runtime", error: "slow", timedOut: true })), /timed out/);
  assert.throws(() => parseEvalReply({ id: "1", result: { content: [{ type: "text", text: "Error: Foundry VTT module not connected" }], isError: true } }), /not connected/);
  assert.throws(() => parseEvalReply({ id: "1", error: { message: "Unknown method" } }), /Unknown method/);
});

test("submenuUsers splits 'user — actor' rows", () => {
  const rows = submenuUsers([
    { label: "PinTest-A — PinTest Alpha", disabled: false },
    { label: "PinTest-C", disabled: true, note: "no pin" },
  ]);
  assert.deepEqual(rows, [
    { user: "PinTest-A", actor: "PinTest Alpha", enabled: true, note: null },
    { user: "PinTest-C", actor: null, enabled: false, note: "no pin" },
  ]);
});

test("violationsFor keeps only the given users' or actors' violations", () => {
  const audit = { violations: [
    { code: "MANY_TOKENS", user: { id: "uA" }, actor: { id: "aAlpha" } },
    { code: "NO_TOKEN", user: { id: "uTalo" }, actor: { id: "aTalo" } },
    { code: "SHARED_ACTOR", user: { id: "uX" }, actor: { id: "aBeta" } },
  ] };
  assert.deepEqual(violationsFor(audit, { userIds: ["uA"], actorIds: ["aBeta"] }).map(v => v.code), ["MANY_TOKENS", "SHARED_ACTOR"]);
  assert.deepEqual(violationsFor(null, {}), []);
});

test("layout helpers", () => {
  const ids = { scenes: { north: "N1", south: "S1" } };
  const layout = { alpha: [{ scene: "N1", x: 200, y: 200, w: 1, h: 1 }], beta: [], wolf: null };
  assert.equal(sceneKeyOf(ids, "S1"), "south");
  assert.equal(sceneKeyOf(ids, "zz"), "zz");
  assert.deepEqual(compactLayout(layout, ids), { alpha: ["north 200,200"], beta: [], wolf: null });
  assert.equal(tokensOn(layout, "alpha", "N1").length, 1);
  assert.equal(tokensOn(layout, "beta", "N1").length, 0);
  assert.deepEqual(centreOf({ x: 500, y: 700, w: 1, h: 1 }), { x: 550, y: 750 });
  assert.equal(chebyshev({ x: 0, y: 0 }, { x: 30, y: -80 }), 80);
});

test("offFloor: a token on a level its scene lacks is named; real floors and unknown scenes pass", () => {
  const ids = { scenes: { north: "N", south: "S" }, levels: { north: [{ id: "defaultLevel0000" }], south: [{ id: "G" }, { id: "U" }] } };
  const layout = {
    alpha: [{ scene: "S", level: "G" }], summon: [{ scene: "S", level: "defaultLevel0000" }],
    pet: [{ scene: "N", level: "defaultLevel0000" }], beta: [{ scene: "Elsewhere", level: "X" }], wolf: [], gamma: null,
  };
  assert.deepEqual(offFloor(layout, ids), ["summon south defaultLevel0000"]);
  assert.deepEqual(offFloor({}, ids), []);
});

test("fixture: the summon and the pet are friendly (an npc defaults to hostile, and dnd5e blocks a walk through a hostile square)", () => {
  assert.equal(FIX.actors.summon.disposition, "FRIENDLY");
  assert.equal(FIX.actors.pet.disposition, "FRIENDLY");
});

test("fixture geometry: start squares outside the portals, the teleport points clear of them", () => {
  const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
  for (const [name, layout] of Object.entries(LAYOUT)) {
    for (const [k, pos] of Object.entries(layout)) {
      if (!pos) continue;
      const c = centreOf({ ...pos, w: 1, h: 1 });
      assert.ok(!inRect(c, FIX.portal[pos.scene].rect), `${name}.${k} starts inside a portal`);
    }
  }
  assert.ok(inRect(centreOf({ ...SPOTS.portalWalk, w: 1, h: 1 }), FIX.portal.north.rect), "the walk ends inside the North portal");
  assert.ok(!inRect(SPOTS.sameScene, FIX.portal.north.rect));
  assert.ok(!inRect(SPOTS.crossScene, FIX.portal.south.rect));
});

test("toast filters", () => {
  const toasts = [
    { raw: "INFO.SceneViewCanvasDisabled", name: "PinTest South", text: "…PinTest South…" },
    { raw: "You cannot switch Scenes until resources finish loading for your current view.", text: "x" },
    { raw: "Your view follows PinTest Alpha.", text: "Your view follows PinTest Alpha." },
  ];
  assert.ok(sawCanvasDisabled(toasts, "PinTest South"));
  assert.ok(!sawCanvasDisabled(toasts, "PinTest North"));
  assert.equal(cannotSwitchToasts(toasts).length, 1);
  assert.equal(followToasts(toasts).length, 1);
  assert.ok(TEXT.auditToast.test("Pinning on: all 2 pins have one token."));
});

test("summarize counts pass, skip and fail", () => {
  const s = summarize([{ id: "S01", pass: true }, { id: "S02", pass: false, skipped: true }, { id: "S03", pass: false }]);
  assert.deepEqual(s, { total: 3, passed: 1, skipped: 1, failed: 1, failedIds: ["S03"] });
});

test("withDeadline passes a fast result and rejects a slow one", async () => {
  assert.equal(await withDeadline(async () => 7, 1000, "slow"), 7);
  await assert.rejects(withDeadline(() => new Promise(r => setTimeout(r, 200)), 20, "too slow", { graceMs: 500 }), /too slow/);
  await assert.rejects(withDeadline(async () => { throw new Error("boom"); }, 1000, "slow"), /boom/);
});

test("withDeadline cancels a timed-out scenario: no write after it rejects, no late verdict (S1/D2)", async () => {
  const writes = [];
  let verdict = null;
  const work = async signal => {
    for (let i = 0; i < 20; i++) {
      signal.throwIfAborted();                  // what Ctx.world / gmOp / gmPage do
      writes.push(i);
      await sleepFor(15, signal);
    }
    verdict = "pass";                           // the old runner set out.pass here, after the timeout
    return [{ ok: true }];
  };
  const err = await withDeadline(work, 40, "S99 did not finish", { graceMs: 1000 }).catch(e => e);
  assert.match(err.message, /S99 did not finish/);
  assert.equal(err.timedOut, true);
  assert.equal(err.settled, true);              // the caller waited for the work to stop
  const n = writes.length;
  await new Promise(r => setTimeout(r, 120));
  assert.equal(writes.length, n, "the cancelled work kept writing after the deadline");
  assert.equal(verdict, null);
});

test("withDeadline: a parent abort (Ctrl-C, S18's own deadline) cancels the child (S2)", async () => {
  const parent = new AbortController();
  let seen = null;
  const p = withDeadline(async signal => { await sleepFor(5000, signal).catch(e => { seen = signal.aborted; throw e; }); }, 10_000, "child", { parent: parent.signal, graceMs: 500 });
  setTimeout(() => parent.abort(new Error("interrupted by SIGINT")), 20);
  await assert.rejects(p, /interrupted by SIGINT/);
  assert.equal(seen, true);
  const pre = new AbortController();
  pre.abort(new Error("already"));
  await assert.rejects(withDeadline(async s => sleepFor(5000, s), 10_000, "x", { parent: pre.signal, graceMs: 200 }), /already/);
});

test("acquireLock: one run at a time; a dead holder's lock is taken over (S5)", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pins-lock-"));
  const file = path.join(dir, "lock");
  try {
    const release = acquireLock(file, { pid: 111, alive: () => true });
    assert.equal(readFileSync(file, "utf8"), "111");
    assert.throws(() => acquireLock(file, { pid: 222, alive: pid => pid === 111 }), e => e instanceof RunnerError && e.code === "busy");
    release();
    assert.equal(existsSync(file), false);
    acquireLock(file, { pid: 111, alive: () => true });
    const rel2 = acquireLock(file, { pid: 333, alive: () => false });   // 111 is gone: stale
    assert.equal(readFileSync(file, "utf8"), "333");
    rel2();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("restoreSucceeded: a switch that could not be put back is a failure (S3)", () => {
  assert.equal(restoreSucceeded(null), true);
  assert.equal(restoreSucceeded(undefined), true);
  assert.equal(restoreSucceeded({ stash: false }), true);
  assert.equal(restoreSucceeded({ stash: true, pinning: true, active: "camp-site" }), true);
  assert.equal(restoreSucceeded({ stash: true, pinningError: "not a registered game setting" }), false);
  assert.equal(restoreSucceeded({ error: "GM page closed" }), false);
});

test("S17 starts B on North, so 'B follows the activation to South' can fail (S7)", () => {
  const src = SCENARIOS.S17.setup.toString();
  assert.match(src, /LAYOUT\.allNorth/);
  assert.match(src, /B: "north"/);
});

test("installBridgeGuard blocks WebSocket and fetch to the broker ports only", async () => {
  const made = [];
  class FakeWS { constructor(url) { made.push(url); } }
  FakeWS.OPEN = 1;
  const fetched = [];
  const w = { location: { href: "http://127.0.0.1:30000/game" }, WebSocket: FakeWS,
    fetch: async url => { fetched.push(url); return "ok"; } };
  const blocked = installBridgeGuard(BRIDGE_PORTS, w);
  assert.ok(blocked("ws://localhost:31415"));
  assert.ok(blocked("http://localhost:31416/webrtc-offer"));
  assert.ok(blocked("ws://127.0.0.1:31414"));
  assert.ok(!blocked("ws://127.0.0.1:30000/socket.io/"));
  assert.throws(() => new w.WebSocket("ws://localhost:31415"), /MCP bridge is blocked/);
  const ok = new w.WebSocket("ws://127.0.0.1:30000/socket.io/");
  assert.ok(ok instanceof FakeWS);
  assert.ok(ok instanceof w.WebSocket);
  assert.equal(w.WebSocket.OPEN, 1);
  await assert.rejects(w.fetch("http://localhost:31416/x"), /signalling is blocked/);
  assert.equal(await w.fetch("/join"), "ok");
  assert.deepEqual(fetched, ["/join"]);
  assert.deepEqual(made, ["ws://127.0.0.1:30000/socket.io/"]);
  // idempotent: a second install does not wrap twice
  const before = w.WebSocket;
  installBridgeGuard(BRIDGE_PORTS, w);
  assert.equal(w.WebSocket, before);
});

test("installPageProbes records toasts with a sequence and sets core.noCanvas", () => {
  const store = {};
  const shown = [];
  const w = {
    localStorage: { setItem: (k, v) => { store[k] = v; } },
    ui: { notifications: { notify(message, type) { shown.push([message, type]); return { id: 1 }; } } },
    game: { i18n: { format: (k, f) => (k === "INFO.SceneViewCanvasDisabled" ? `Canvas disabled: ${f.name}` : k) } },
  };
  const probes = installPageProbes({ noCanvas: true }, w);
  assert.equal(store["core.noCanvas"], "true");
  w.ui.notifications.notify("INFO.SceneViewCanvasDisabled", "info", { format: { name: "PinTest South" } });
  w.ui.notifications.notify("plain text", "warning");
  assert.equal(shown.length, 2);
  assert.equal(probes.seq, 2);
  assert.deepEqual(probes.toasts.map(t => [t.seq, t.raw, t.name, t.text]), [
    [1, "INFO.SceneViewCanvasDisabled", "PinTest South", "Canvas disabled: PinTest South"],
    [2, "plain text", null, "plain text"],
  ]);
  assert.ok(sawCanvasDisabled(probes.toasts, "PinTest South"));
  assert.equal(installPageProbes({}, w), probes, "a second install keeps the same store");
});

test("installPageProbes hideDice: a style hiding the Dice So Nice overlay once the DOM loads; nothing else written", () => {
  const listeners = {};
  const head = [];
  const doc = {
    addEventListener: (t, fn) => { listeners[t] = fn; },
    createElement: tag => ({ tag, dataset: {}, textContent: "" }),
    head: { append: el => head.push(el) },
  };
  const w = { document: doc, localStorage: { setItem: () => { throw new Error("no storage write expected"); } } };
  installPageProbes({ hideDice: true }, w);
  assert.equal(head.length, 0, "nothing before DOMContentLoaded");
  listeners.DOMContentLoaded();
  assert.equal(head.length, 1);
  assert.match(head[0].textContent, /#dice-box-canvas\s*\{\s*display:\s*none !important;/);
  const w2 = { document: { addEventListener: () => assert.fail("no hideDice: no listener") } };
  installPageProbes({}, w2);
});

test("page sources and every op compose into valid JavaScript with no module-scope references", () => {
  for (const src of [bridgeGuardSource(), probesSource({ noCanvas: false, board: true })]) {
    assert.doesNotThrow(() => new Function(src));
  }
  for (const [name, fn] of Object.entries(OPS)) {
    const expr = composeExpression(fn, { layout: LAYOUT.home, scene: "north" });
    assert.doesNotThrow(() => new Function(`return ${expr};`), name);
    // the eval-js shape: the bridge wraps the script body in an async function
    assert.doesNotThrow(() => new Function(`return (async () => { return await ${expr}; })();`), name);
    const body = fn.toString();
    for (const outside of ["LAYOUT", "SPOTS", "POS.", "SCENARIOS", "TEXT.", "this.env", "note("]) {
      assert.ok(!body.includes(outside), `${name} references ${outside}, which does not exist in the page`);
    }
    assert.match(body, /^async function op/, `${name} must be a named async function (serialised by toString)`);
  }
});

test("a composed op runs against a stub client and returns JSON", async () => {
  const scenes = [{ name: "PinTest North", id: "N1", tokens: [], levels: { contents: [{ id: "L1", name: "Ground" }] }, regions: { find: () => ({ uuid: "Scene.N1.Region.R1" }) } }];
  const g = {
    scenes: { find: f => scenes.find(f), [Symbol.iterator]: () => scenes[Symbol.iterator]() },
    actors: { find: () => null },
    users: { find: () => null, filter: () => [] },
  };
  globalThis.game = g;
  try {
    const expr = composeExpression(OPS.opState, {});
    const out = JSON.parse(await (0, eval)(expr));
    assert.equal(out.ok, false);
    assert.equal(out.scenes.north, "N1");
    assert.ok(out.missing.includes("PinTest Alpha"));
    assert.ok(out.missing.includes("PinTest South"));
    assert.deepEqual(out.sceneNames, { north: "PinTest North", south: "PinTest South" });
  } finally {
    delete globalThis.game;
  }
});

test("opPrune checks every document again in the page: a plan naming real ones deletes only the PinTest ones", async () => {
  const coll = docs => Object.assign(new Map(docs.map(d => [d.id, d])), { find(f) { return [...this.values()].find(f); } });
  const deleted = { Token: [], Region: [], Scene: [], Actor: [], JournalEntry: [], unset: [] };
  const scene = (id, name, tokens, regions) => ({ id, name, tokens: coll(tokens), regions: coll(regions),
    deleteEmbeddedDocuments: async (type, ids) => { deleted[type].push(...ids.map(i => `${id}.${i}`)); } });
  const actors = coll([{ id: "aA", name: "PinTest Alpha", flags: {} }, { id: "aT", name: "Talo", flags: {} },
    { id: "aF", name: "Wolf form", flags: { dnd5e: { originalActor: "aA" } } }]);
  const scenes = coll([
    scene("real", "camp-site", [{ id: "t1", name: "Talo", actorId: "aT", flags: {} }, { id: "t2", name: "Wolf", actorId: "aF", flags: {} }],
      [{ id: "r1", name: "Door" }, { id: "r2", name: "PinTest Portal North" }]),
    scene("N", "PinTest North", [{ id: "n1", name: "Talo", actorId: "aT", flags: {} }, { id: "n2", name: "Prompt", actorId: null, flags: {} }], []),
  ]);
  const users = coll([{ id: "uT", name: "Talo", isGM: false, unsetFlag: async () => deleted.unset.push("uT") },
    { id: "uA", name: "PinTest-A", isGM: false, unsetFlag: async () => deleted.unset.push("uA") }]);
  const g = { actors, scenes, users, journal: coll([{ id: "j1", name: "Lore" }, { id: "j2", name: "PinTest note" }]) };
  const cls = type => ({ deleteDocuments: async ids => { deleted[type].push(...ids); } });
  Object.assign(globalThis, { game: g, Scene: cls("Scene"), Actor: cls("Actor"), JournalEntry: cls("JournalEntry") });
  try {
    const plan = { tokens: [{ scene: "real", ids: ["t1", "t2"] }, { scene: "N", ids: ["n1", "n2"] }],
      regions: [{ scene: "real", ids: ["r1", "r2"] }], scenes: ["real", "N"], actors: ["aT", "aA", "aF"],
      journals: ["j1", "j2"], resumeUsers: ["uT", "uA"] };
    const out = JSON.parse(await (0, eval)(composeExpression(OPS.opPrune, { plan })));
    assert.deepEqual(deleted.Token, ["real.t2", "N.n2"]);
    assert.deepEqual(deleted.Region, ["real.r2"]);
    assert.deepEqual(deleted.Scene, ["N"]);
    assert.deepEqual(deleted.Actor, ["aA", "aF"]);
    assert.deepEqual(deleted.JournalEntry, ["j2"]);
    assert.deepEqual(deleted.unset, ["uA"]);
    assert.equal(out.refused.length, 7, out.refused.join(" | "));
  } finally {
    for (const k of ["game", "Scene", "Actor", "JournalEntry"]) delete globalThis[k];
  }
});

/* ── R-sighup (H1): every signal puppeteer no longer handles is the runner's ── */

test("every signal puppeteer is told to leave alone is a stop signal the runner handles (SIGHUP too)", () => {
  const off = Object.entries(PUPPETEER_SIGNAL_OPTIONS).filter(([, v]) => v === false).map(([k]) => k.replace(/^handle/, ""));
  assert.deepEqual([...off].sort(), ["SIGHUP", "SIGINT", "SIGTERM"]);
  for (const sig of off) assert.ok(STOP_SIGNALS.includes(sig), `${sig} would get Node's default action and skip the restore`);
});

test("installStopHandlers: SIGINT, SIGTERM and SIGHUP each reach onSignal; the remover takes them all off", () => {
  const proc = new EventEmitter();
  const seen = [];
  const remove = installStopHandlers(sig => seen.push(sig), proc);
  for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) proc.emit(sig);
  assert.deepEqual(seen, ["SIGINT", "SIGTERM", "SIGHUP"]);
  remove();
  for (const sig of STOP_SIGNALS) assert.equal(proc.listenerCount(sig), 0, sig);
});

/* ── exit codes (H3): what the header says is what main returns ────────── */

test("exitCodeFor: 0 clean, 1 failed or not put back, 2 refused, 3 infisical login", () => {
  assert.equal(exitCodeFor({}), 0);
  assert.equal(exitCodeFor({ failed: 0, restoreOk: true }), 0);
  assert.equal(exitCodeFor({ failed: 2 }), 1);
  assert.equal(exitCodeFor({ ok: false }), 1);                                      // --seed incomplete
  assert.equal(exitCodeFor({ restoreOk: false }), 1);                               // --cleanup / --run restore failed
  assert.equal(exitCodeFor({ refused: { code: "busy" } }), 2);
  assert.equal(exitCodeFor({ refused: { code: "realPlayerOnline" }, failed: 1 }), 2);
  assert.equal(exitCodeFor({ refused: { code: "interrupted" } }), 2);
  assert.equal(exitCodeFor({ refused: { code: "fatal" } }), 2);
  // a restore that failed is the thing to act on (--cleanup), even after a refusal
  assert.equal(exitCodeFor({ refused: { code: "interrupted" }, restoreOk: false }), 1);
  assert.equal(exitCodeFor({ refused: { code: "infisicalLogin" } }), 3);
});

test("the header documents every exit code main can return", () => {
  const header = readFileSync(path.join(REPO, "automation/smoke/pins-live.mjs"), "utf8").split("*/")[0];
  const exits = header.slice(header.indexOf("Exit codes"));
  for (const code of ["0", "1", "2", "3", "130"]) assert.match(exits, new RegExp(`\\b${code}\\b`), `exit ${code}`);
  for (const why of ["busy", "realPlayerOnline", "notSeeded", "interrupted", "badArgs", "fatal", "SIGHUP"]) assert.ok(exits.includes(why), why);
});

/* ── the stash (R2/H2): a stopped run's switch value is never written back ── */

function stashWorld({ pinning, stash = null, active = "real" }) {
  const flags = new Map(stash ? [["pinsLiveStash", JSON.stringify(stash)]] : []);
  const writes = [];
  const north = { id: "N", name: "PinTest North", getFlag: (_s, k) => flags.get(k) ?? null,
    setFlag: async (_s, k, v) => { flags.set(k, v); }, unsetFlag: async (_s, k) => { flags.delete(k); },
    activate: async () => { g.scenes.active = north; writes.push("activate N"); } };
  const real = { id: "R", name: "camp-site", activate: async () => { g.scenes.active = real; writes.push("activate R"); } };
  const all = [north, real];
  const g = {
    scenes: { find: f => all.find(f), get: id => all.find(s => s.id === id) ?? null, active: active === "real" ? real : north,
      [Symbol.iterator]: () => all[Symbol.iterator]() },
    settings: { get: () => pinning, set: async (_m, _k, v) => { writes.push(`pinning=${v}`); pinning = v; } },
  };
  return { g, flags, writes, pinning: () => pinning };
}

async function runOp(g, op, args) {
  globalThis.game = g;
  try { return JSON.parse(await (0, eval)(composeExpression(op, args))); } finally { delete globalThis.game; }
}

test("opRestore: this run's own stash puts the switch back", async () => {
  const w = stashWorld({ pinning: false, active: "north",
    stash: { runId: "run1", at: "t0", active: "R", activeName: "camp-site", pinning: true, gmResume: null } });
  const out = await runOp(w.g, OPS.opRestore, { runId: "run1", dropStash: true });
  assert.equal(w.pinning(), true);
  assert.deepEqual(w.writes, ["pinning=true", "activate R"]);
  assert.equal(out.pinning, true);
  assert.equal(out.stashKept, false);
  assert.equal(w.flags.size, 0);
  assert.equal(restoreSucceeded(out), true);
});

test("opRestore: a stopped run's stash never writes the switch (Joe's ON with 6 pinned stays ON); it says so", async () => {
  for (const stash of [
    { runId: "old", at: "13:34", active: "R", pinning: false, gmResume: null },
    { at: "13:34", active: "R", pinning: false, gmResume: null },                     // a stash from before runIds
  ]) {
    const w = stashWorld({ pinning: true, active: "north", stash });
    const out = await runOp(w.g, OPS.opRestore, { runId: "run2", dropStash: true });
    assert.equal(w.pinning(), true, "the live switch is untouched");
    assert.ok(!w.writes.some(x => x.startsWith("pinning=")), w.writes.join());
    assert.deepEqual(out.pinningLeft, { now: true, stashed: false, at: "13:34", pinsActive: true });
    assert.equal(out.pinning, undefined);
    // a PinTest scene left active can only be the runner's doing: that is still put back
    assert.deepEqual(w.writes, ["activate R"]);
    assert.equal(restoreSucceeded(out), true);
    assert.equal(w.flags.size, 0);
  }
});

test("opRestore (#8): pentaryn-pins disabled, a stopped run's stash: the STORED switch is reported, never written", async () => {
  const unregistered = () => { throw new Error('"pentaryn-pins.pinning" is not a registered game setting'); };
  for (const [stored, now] of [[JSON.stringify(true), true], [JSON.stringify(false), false], [undefined, false], ["{garbled", null]]) {
    const w = stashWorld({ pinning: null, active: "north", stash: { runId: "old", at: "13:34", active: "R", pinning: false } });
    const doc = stored === undefined ? undefined : { key: "pentaryn-pins.pinning", _source: { value: stored } };
    w.g.settings.get = unregistered;
    w.g.settings.set = async () => { throw new Error("must not write"); };
    w.g.settings.storage = new Map([["world", { getSetting: k => (k === "pentaryn-pins.pinning" ? doc : undefined) }]]);
    const out = await runOp(w.g, OPS.opRestore, { runId: "cleanup", dropStash: false });
    assert.deepEqual(out.pinningLeft, { now, stashed: false, at: "13:34", pinsActive: false }, String(stored));
    assert.deepEqual(w.writes, ["activate R"], "only the PinTest scene left active is put back");
    assert.equal(restoreSucceeded(out), true);
  }
});

test("pinningLeftMessage (#8): names the real stored value, and says when pins is disabled", () => {
  assert.equal(pinningLeftMessage(null), null);
  assert.equal(pinningLeftMessage({ now: true, stashed: true, at: "t", pinsActive: true }), null, "nothing changed: no note");
  assert.match(pinningLeftMessage({ now: true, stashed: false, at: "t", pinsActive: true }), /switch is ON and was LEFT as is.*recorded it OFF/);
  const off = pinningLeftMessage({ now: true, stashed: false, at: "t", pinsActive: false });
  assert.match(off, /pentaryn-pins is not active/);
  assert.match(off, /stored value is ON/, "the stored ON, never 'OFF' for an unreadable switch");
  assert.match(off, /recorded it OFF/);
  // pins disabled: said even when the values agree (nobody can see the switch in Configure Settings)
  assert.match(pinningLeftMessage({ now: false, stashed: false, at: "t", pinsActive: false }), /stored value is OFF/);
  assert.match(pinningLeftMessage({ now: null, stashed: true, at: "t", pinsActive: false }), /stored value is unknown/);
});

test("opRestore: a stale stash leaves a real active scene alone", async () => {
  const w = stashWorld({ pinning: true, active: "real", stash: { runId: "old", at: "t", active: "R", pinning: false } });
  const out = await runOp(w.g, OPS.opRestore, { runId: "run2", dropStash: false });
  assert.deepEqual(w.writes, []);
  assert.equal(out.active, "camp-site");
  assert.equal(out.stashKept, true);
});

test("opStash: a stopped run's stash is replaced by this run's switch value (so the end restores ON, not the old OFF)", async () => {
  const w = stashWorld({ pinning: true, active: "north", stash: { runId: "old", at: "13:34", active: "R", activeName: "camp-site", pinning: false, gmResume: { scene: "R" } } });
  const out = await runOp(w.g, OPS.opStash, { runId: "run3", gmResume: { scene: "N" } });
  const st = JSON.parse(w.flags.get("pinsLiveStash"));
  assert.equal(st.runId, "run3");
  assert.equal(st.pinning, true);
  assert.equal(st.active, "R", "the stopped run's real scene is still the one to go back to");
  assert.deepEqual(st.gmResume, { scene: "R" }, "the stopped run's original resume view");
  assert.deepEqual(out.stale, { at: "13:34", pinning: false, runId: "old" });
  assert.equal(out.kept, false);
  // this run's own stash: kept as is
  const again = await runOp(w.g, OPS.opStash, { runId: "run3", gmResume: null });
  assert.equal(again.kept, true);
  assert.deepEqual(w.writes, []);
});

test("opStash: no stash yet records the live switch, the real active scene and this run's id", async () => {
  const w = stashWorld({ pinning: true, active: "real" });
  const out = await runOp(w.g, OPS.opStash, { runId: "run4", gmResume: null });
  assert.equal(out.stale, null);
  assert.deepEqual({ runId: out.stash.runId, active: out.stash.active, pinning: out.stash.pinning }, { runId: "run4", active: "R", pinning: true });
});

/* ── the run's own JSON lines file (D2): a stale file can never pass for this run ── */

test("openRunLog truncates a stopped run's lines, starts with a header, and mirrors each line", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pins-live-log-"));
  try {
    const file = path.join(dir, "pins-live.jsonl");
    writeFileSync(file, '{"id":"S12","pass":false}\n');
    const log = openRunLog(file, { run: true, mode: "run", runId: "abc", startedAt: "t" }, { stdoutFd: null });
    log.write({ id: "S01", pass: true });
    log.close();
    const lines = readFileSync(file, "utf8").trim().split("\n").map(l => JSON.parse(l));
    assert.deepEqual(lines, [{ run: true, mode: "run", runId: "abc", startedAt: "t" }, { id: "S01", pass: true }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("openRunLog: stdout already redirected to the file is not written twice", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pins-live-log-"));
  try {
    const file = path.join(dir, "pins-live.jsonl");
    const fd = openSync(file, "w");
    try {
      const log = openRunLog(file, { run: true }, { stdoutFd: fd });
      log.write({ id: "S01" });
      log.close();
      assert.equal(log.mirrored, false);
      assert.equal(readFileSync(file, "utf8"), "");
    } finally {
      closeSync(fd);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("main: a run refused as busy leaves the live run's lines file alone", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "pins-live-state-"));
  const saved = { state: process.env.PINS_LIVE_STATE_DIR, envFile: process.env.PENTARYN_ENV_FILE };
  const out = process.stdout.write;
  try {
    process.env.PINS_LIVE_STATE_DIR = dir;
    process.env.PENTARYN_ENV_FILE = "/dev/null";
    writeFileSync(path.join(dir, "pins-live.lock"), String(process.ppid));        // a live holder
    writeFileSync(path.join(dir, "pins-live.jsonl"), '{"run":true,"runId":"live"}\n');
    const printed = [];
    process.stdout.write = chunk => { printed.push(String(chunk)); return true; };
    const code = await main(["--run", "S01"]);
    process.stdout.write = out;
    assert.equal(code, 2);
    assert.match(printed.join(""), /"code":"busy"/);
    assert.equal(readFileSync(path.join(dir, "pins-live.jsonl"), "utf8"), '{"run":true,"runId":"live"}\n');
  } finally {
    process.stdout.write = out;
    for (const [k, v] of [["PINS_LIVE_STATE_DIR", saved.state], ["PENTARYN_ENV_FILE", saved.envFile]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

/* ── Gather (pins 0.3.0, plan pin-2026-10-gather.md §5.4) and the §11 co-owned steed rule ── */

test("--list prints S01..S27 in table order, with titles (the gather and steed scenarios included)", async () => {
  const out = process.stdout.write;
  const printed = [];
  try {
    process.stdout.write = chunk => { printed.push(String(chunk)); return true; };
    assert.equal(await main(["--list"]), 0);
  } finally {
    process.stdout.write = out;
  }
  const rows = printed.join("").trim().split("\n").map(l => JSON.parse(l));
  assert.deepEqual(rows.map(r => r.id), IDS);
  for (const id of ["S20", "S21", "S22", "S23"]) assert.match(rows.find(r => r.id === id).title, /gather/i, id);
  for (const id of ["S24", "S25", "S26", "S27"]) assert.match(rows.find(r => r.id === id).title, /steed/i, id);
});

test("S14 checks all three menu items, Gather between Prompt note and Teleport, with its member count", () => {
  assert.match(SCENARIOS.S14.title, /all three items/);
  const src = SCENARIOS.S14.assert.toString();
  assert.match(src, /TEXT\.gather/);
  assert.match(src, /TEXT\.promptNote/);
  assert.match(src, /TEXT\.teleport/);
  assert.match(src, /"2"/, "the count note when A and B are online");
  assert.equal(TEXT.gather, "Gather logged-in players here");
});

test("fixture: the steed is co-owned by A and B, and no older layout puts it on a map", () => {
  assert.deepEqual(FIX.actors.steed.owners, ["A", "B"]);
  assert.ok(FIX.actors.steed.name.startsWith(PREFIX));
  assert.equal(FIX.actors.steed.disposition, "FRIENDLY");
  for (const k of ["home", "allNorth", "allSouth"]) assert.equal(LAYOUT[k].steed, null, k);
});

test("distanceFt (code review G3): 5e distance — adjacent 5 ft, one square between 10 ft; the larger axis gap (a diagonal counts as one)", () => {
  const at = (x, y) => ({ x, y });
  assert.equal(distanceFt(at(0, 0), at(100, 0)), 5, "adjacent");
  assert.equal(distanceFt(at(0, 0), at(100, 100)), 5, "diagonal neighbour");
  assert.equal(distanceFt(at(0, 0), at(200, 0)), 10, "one square between");
  assert.equal(distanceFt(at(0, 0), at(300, 300)), 15);
  assert.equal(distanceFt(at(400, 0), at(0, 0)), 20);
  assert.equal(distanceFt({ x: 0, y: 0, w: 2, h: 2 }, at(300, 0)), 10, "a Large token: from its near edge");
});

test("steed geometry (5e distance): near is 10 ft from Alpha (comes), far 15 ft from Alpha and Beta (stays; the old raw-gap rule took it), tie touches both", () => {
  const box = p => ({ x: p.x, y: p.y });
  assert.equal(distanceFt(box(POS.steedNear), box(POS.alphaN)), 10, "one square between: the edge of the reach");
  assert.equal(distanceFt(box(POS.steedFar), box(POS.alphaN)), 15, "two squares between: just beyond");
  assert.ok(distanceFt(box(POS.steedFar), box(POS.betaN)) > 10);
  assert.ok(distanceFt(box(POS.petFar), box(POS.alphaN)) > 10, "the far pet tests 'single owner: any distance'");
  assert.equal(distanceFt(box(POS.steedTie), box(POS.alphaN)), distanceFt(box(POS.steedTie), box(POS.betaTie)));
  assert.equal(distanceFt(box(POS.steedTie), box(POS.alphaN)), 5, "touching both");
  assert.equal(LAYOUT.steedGather.steed, POS.steedFar);
  assert.equal(LAYOUT.steedNear.steed, POS.steedNear);
  assert.deepEqual([LAYOUT.steedFar.steed, LAYOUT.steedFar.pet], [POS.steedFar, POS.petFar]);
  assert.deepEqual([LAYOUT.steedTie.steed, LAYOUT.steedTie.beta], [POS.steedTie, POS.betaTie]);
  // no two tokens of one layout share a square
  for (const [name, layout] of Object.entries(LAYOUT)) {
    const toks = Object.entries(layout).filter(([, p]) => p).map(([k, p]) => ({ name: k, scene: p.scene, x: p.x, y: p.y, w: 1, h: 1 }));
    assert.deepEqual(overlapping(toks), [], name);
  }
  const inRect = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
  for (const k of ["gatherSouth", "gatherNorth", "tieB"]) assert.ok(!inRect(SPOTS[k], FIX.portal[SPOTS[k].scene].rect), k);
});

test("overlapping: boxes on one scene that share area; edges touching or another scene do not count", () => {
  const t = (name, x, y, scene = "S", w = 1) => ({ name, scene, x, y, w, h: w });
  assert.deepEqual(overlapping([t("a", 0, 0), t("b", 100, 0), t("c", 0, 100, "N")]), []);
  assert.deepEqual(overlapping([t("a", 0, 0), t("b", 50, 50), t("c", 300, 0)]), [["a", "b"]]);
  assert.deepEqual(overlapping([t("big", 0, 0, "S", 2), t("x", 100, 100)]), [["big", "x"]]);
});

test("userNames and testRows read gather rows ({ user: { id, name } }) and keep only PinTest users", () => {
  const rows = [{ user: { id: "1", name: "PinTest-B" }, code: "MANY_TOKENS" }, { user: { id: "2", name: "Talo" } }, { user: "PinTest-C" }, {}];
  assert.deepEqual(userNames(rows), ["PinTest-B", "Talo", "PinTest-C", null]);
  assert.deepEqual(testRows(rows).map(r => r.code ?? null), ["MANY_TOKENS", null]);
  assert.deepEqual(testRows(null), []);
});

test("installPageProbes counts core's pullToScene arrivals once the game socket exists (S23)", () => {
  const handlers = {};
  const w = { game: null };
  const probes = installPageProbes({}, w);
  assert.deepEqual(probes.pulls, []);
  w.game = { socket: { on: (ev, fn) => { (handlers[ev] ??= []).push(fn); } } };
  // attached by the probe's poll; here the poll is called by hand
  probes.poll();
  probes.poll();
  assert.equal(handlers.pullToScene?.length, 1, "attached once");
  handlers.pullToScene[0]("S1", { level: "U1", controlledTokens: ["t"] });
  handlers.pullToScene[0]("S2", undefined);
  assert.deepEqual(probes.pulls.map(p => [p.seq, p.scene, p.level]), [[1, "S1", "U1"], [2, "S2", null]]);
  assert.equal(probes.pullSeq, 2);
});

test("opResetOwnership puts each actor back to the fixture's owners, replacing (not merging) a grant", async () => {
  const updates = [];
  const users = [{ id: "uA", name: "PinTest-A" }, { id: "uB", name: "PinTest-B" }, { id: "uC", name: "PinTest-C" }];
  const actors = Object.entries(FIX.actors).map(([k, a]) => ({ id: `a-${k}`, name: a.name,
    update: async (data, opts) => { updates.push({ k, data, opts }); } }));
  const g = { users: { find: f => users.find(f) }, actors: { find: f => actors.find(f) } };
  Object.assign(globalThis, { game: g, CONST: { DOCUMENT_OWNERSHIP_LEVELS: { NONE: 0, OBSERVER: 2, OWNER: 3 } } });
  try {
    await (0, eval)(composeExpression(OPS.opResetOwnership, { actors: ["alpha", "steed", "wolf"] }));
    assert.deepEqual(updates.map(u => [u.k, u.data.ownership]), [
      ["alpha", { default: 0, uA: 3 }], ["steed", { default: 0, uA: 3, uB: 3 }], ["wolf", { default: 0 }]]);
    for (const u of updates) assert.deepEqual(u.opts, { diff: false, recursive: false }, u.k);
    updates.length = 0;
    await (0, eval)(composeExpression(OPS.opSetOwnership, { grants: [{ actor: "alpha", user: "B", level: "OBSERVER" }] }));
    assert.deepEqual(updates.map(u => [u.k, u.data]), [["alpha", { "ownership.uB": 2 }]]);
  } finally {
    for (const k of ["game", "CONST"]) delete globalThis[k];
  }
});

test("every scenario that counts a player's pulls marks them in its act first (S20: setup's own pulls were counted)", () => {
  for (const [id, s] of Object.entries(SCENARIOS)) {
    const src = ["setup", "act", "assert"].map(k => (typeof s[k] === "function" ? s[k].toString() : "")).join("\n");
    const counted = [...src.matchAll(/x\.pulls\("([A-Z])"\)/g)].map(m => m[1]);
    if (!counted.length) continue;
    const act = typeof s.act === "function" ? s.act.toString() : "";
    const marked = new Set([...act.matchAll(/x\.markPulls\(([^)]*)\)/g)].flatMap(m => [...m[1].matchAll(/"([A-Z])"/g)].map(k => k[1])));
    for (const k of counted) assert.ok(marked.has(k), `${id} counts ${k}'s pulls without x.markPulls("${k}") in its act`);
  }
});
