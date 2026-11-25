// Playtest harness: one headless Chrome (canvas ON), one logged-in page per Foundry user.
// HTTP on 127.0.0.1:31999: POST /open {user}, POST /eval {user, code}, POST /shot {user, file, selector?}, POST /close {user}
import { createRequire } from "node:module";
import http from "node:http";
const require = createRequire("/home/joe/code/pentaryn/automation/headless-gm/package.json");
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:30000";
const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: "disabled:" };
if (process.env.PENTARYN_HEADLESS_LIBS) env.LD_LIBRARY_PATH = [process.env.PENTARYN_HEADLESS_LIBS, env.LD_LIBRARY_PATH].filter(Boolean).join(":");
const browser = await puppeteer.connect({ browserURL: process.env.GPU_URL || "http://172.19.80.1:9334", protocolTimeout: 180_000, defaultViewport: null });
const pages = {};
const logs = {};
// A page may run this module from a local folder instead of the server's copy (`override`: the folder; or the env
// ZZ_MODULE_OVERRIDE): its requests under /modules/pentaryn-movement/ are answered from there, nothing is deployed.
const MOD_PATH = "/modules/pentaryn-movement/";
const TYPES = { mjs: "text/javascript", js: "text/javascript", json: "application/json", css: "text/css", svg: "image/svg+xml", webp: "image/webp", png: "image/png" };
async function overrideModule(p, dir) {
  if (!dir) return;
  const fs = await import("node:fs"), path = await import("node:path");
  await p.setRequestInterception(true);
  p.on("request", req => {
    let u; try { u = new URL(req.url()); } catch { req.continue(); return; }
    if (!u.pathname.startsWith(MOD_PATH)) { req.continue(); return; }
    const f = path.join(dir, decodeURIComponent(u.pathname.slice(MOD_PATH.length)));
    if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { req.continue(); return; }
    req.respond({ status: 200, contentType: TYPES[f.split(".").pop()] ?? "application/octet-stream", headers: { "Cache-Control": "no-store" }, body: fs.readFileSync(f) });
  });
}
async function open(user, id, cookieFile, override = process.env.ZZ_MODULE_OVERRIDE || null) {
  if (pages[user]) { try { await pages[user].ctx.close(); } catch {} }
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1600, height: 1000 });
  await overrideModule(p, override);
  logs[user] = [];
  p.on("console", m => { if (["error", "warn"].includes(m.type())) logs[user].push(`${m.type()}: ${m.text()}`.slice(0, 500)); });
  p.on("pageerror", e => logs[user].push(`pageerror: ${e.message}`.slice(0, 500)));
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(e => logs[user].push("join goto: " + e.message));
  const r = cookieFile ? (await p.setCookie(...JSON.parse((await import("node:fs")).readFileSync(cookieFile,"utf8")).cookies.map(c=>({name:c.name,value:c.value,domain:"127.0.0.1",path:"/"}))), {ok:true}) : await p.evaluate(async (name) => {
    const res = await fetch("/join", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "join", userId: name, password: "" }) });
    return { ok: res.ok, status: res.status, body: (await res.text()).slice(0, 200) };
  }, id);
  if (!r.ok) throw new Error("join failed " + JSON.stringify(r));
  await p.evaluate(() => { try { localStorage.setItem("core.noCanvas", "false"); } catch {} });
  await p.goto(`${BASE}/game`, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(e => logs[user].push("game goto: " + e.message));
  pages[user] = { ctx, p };
  const ok = await p.waitForFunction("globalThis.game?.ready === true && globalThis.canvas?.ready === true", { timeout: 90_000, polling: 1000 }).then(() => true, () => false);
  if (!ok) return { ok: false, notReady: true, state: await p.evaluate(() => ({ ready: globalThis.game?.ready, canvas: globalThis.canvas?.ready, scene: globalThis.game?.scenes?.viewed?.name, windows: Object.values(globalThis.ui?.windows ?? {}).map(w => w.title).concat([...(globalThis.foundry?.applications?.instances?.values?.() ?? [])].map(a => a.title)).slice(0, 20), sidebarTab: globalThis.ui?.sidebar?.tabGroups?.primary })), logs: logs[user].slice(-15) };
  return { ok: true, scene: await p.evaluate(() => canvas.scene?.name), user: await p.evaluate(() => game.user.name) };
}
const INSTR = "";
async function openRaw(user, id, j) {
  if (pages[user]) { try { await pages[user].ctx.close(); } catch {} }
  const ctx = await browser.createBrowserContext();
  const p = await ctx.newPage();
  await p.setViewport({ width: 1600, height: 1000 });
  logs[user] = [];
  p.on("console", m => { if (["error", "warn"].includes(m.type())) logs[user].push(`${m.type()}: ${m.text()}`.slice(0, 500)); });
  p.on("pageerror", e => logs[user].push(`pageerror: ${e.message}`.slice(0, 500)));
  const cdp = await p.createCDPSession();
  if (j.cpu) await cdp.send("Emulation.setCPUThrottlingRate", { rate: j.cpu });
  if (j.latency) { await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: j.latency, downloadThroughput: (j.kbps||4000)*128, uploadThroughput: (j.kbps||4000)*128 }); }
  await p.evaluateOnNewDocument(INSTR);
  await p.goto(`${BASE}/join`, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(e => logs[user].push("join goto: " + e.message));
  const r = await p.evaluate(async (uid) => { const res = await fetch("/join", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", userId: uid, password: "" }) }); return res.status; }, id);
  await p.evaluate(() => { try { localStorage.setItem("core.noCanvas", "false"); } catch {} });
  p.goto(`${BASE}/game`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(e => logs[user].push("game goto: " + e.message));
  pages[user] = { ctx, p };
  return { joined: r };
}
async function run(user, code) {
  const p = pages[user].p;
  const before = logs[user].length;
  const v = await p.evaluate(`(async () => { ${code} })()`);
  return { value: v, newLogs: logs[user].slice(before).filter(l => !/deprecat|Tour|TokenLayer|V1 Application|foundry-mcp-bridge|Roboto/i.test(l)) };
}
let lastReq=0;
const server = http.createServer(async (req, res) => {
  lastReq = Date.now();
  let body = ""; req.on("data", c => body += c); await new Promise(r => req.on("end", r));
  let out;
  try {
    const j = body ? JSON.parse(body) : {};
    if (req.url === "/open") out = await open(j.user, j.id, j.cookieFile, j.override ?? process.env.ZZ_MODULE_OVERRIDE ?? null);
    else if (req.url === "/openraw") out = await openRaw(j.user, j.id, j);
    else if (req.url === "/eval") out = await run(j.user, j.code);
    else if (req.url === "/mouse") {
      // j.steps: [{move:[x,y], world:true?, steps?}, {down:"left"|"right"}, {up:..}, {wait:ms}, {key:"Escape"}, {keydown:"Shift"}, {keyup:"Shift"}]
      const p = pages[j.user].p; const before = logs[j.user].length; const trace = [];
      for (const st of j.steps) {
        if (st.tok) { const [x,y]=await p.evaluate((n)=>{const t=canvas.tokens.placeables.find(t=>t.name===n);const c=canvas.clientCoordinatesFromCanvas(t.center);return [c.x,c.y]}, st.tok); await p.mouse.move(x,y,{steps:2}); trace.push(["tok",Math.round(x),Math.round(y)]); }
        else if (st.move) { let [x, y] = st.move; if (st.world) { [x, y] = await p.evaluate(([a, b]) => { const c = canvas.clientCoordinatesFromCanvas({ x: a, y: b }); return [c.x, c.y]; }, [x, y]); } await p.mouse.move(x, y, { steps: st.steps ?? 1 }); trace.push([Math.round(x), Math.round(y)]); }
        else if (st.down) await p.mouse.down({ button: st.down });
        else if (st.up) await p.mouse.up({ button: st.up });
        else if (st.wait) await new Promise(r => setTimeout(r, st.wait));
        else if (st.key) await p.keyboard.press(st.key);
        else if (st.keydown) await p.keyboard.down(st.keydown);
        else if (st.keyup) await p.keyboard.up(st.keyup);
      }
      out = { ok: true, trace, newLogs: logs[j.user].slice(before) };
    }
    else if (req.url === "/profile") {
      const p = pages[j.user].p; const cdp = await p.createCDPSession();
      await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
      await cdp.send("Profiler.start");
      if (j.code) p.evaluate(`(async () => { ${j.code} })()`).catch(() => {});
      await new Promise(r => setTimeout(r, j.ms || 3000));
      const { profile } = await cdp.send("Profiler.stop");
      const self = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
      const dt = profile.timeDeltas; const counts = new Map();
      profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
      for (const [id, us] of counts) { const n = byId.get(id); const cf = n.callFrame; const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").slice(-3).join("/")}:${cf.lineNumber}`; self.set(key, (self.get(key) || 0) + us); }
      // inclusive time for pentaryn frames
      const parent = new Map(); for (const n of profile.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
      const incl = new Map();
      for (const [id, us] of counts) { const seen = new Set(); for (let x = id; x != null; x = parent.get(x)) { const cf = byId.get(x).callFrame; const key = `${cf.functionName || "(anon)"} ${cf.url.split("/").slice(-3).join("/")}:${cf.lineNumber}`; if (seen.has(key)) continue; seen.add(key); incl.set(key, (incl.get(key) || 0) + us); } }
      const top = m => [...m.entries()].sort((a, b) => b[1] - a[1]);
      out = { total: profile.endTime - profile.startTime, self: top(self).slice(0, 25).map(([k, v]) => [k, Math.round(v / 1000)]),
        modules: top(incl).filter(([k]) => /modules\/|systems\//.test(k)).slice(0, 40).map(([k, v]) => [k, Math.round(v / 1000)]) };
    }
    else if (req.url === "/cdp") { const p = pages[j.user].p; pages[j.user].cdp ??= await p.createCDPSession(); out = await pages[j.user].cdp.send(j.method, j.params || {}); }
    else if (req.url === "/hide") { const pg = pages[j.user]; const other = await pg.ctx.newPage(); await other.goto("about:blank"); await other.bringToFront(); const vis = await pg.p.evaluate(() => document.visibilityState);
      setTimeout(async () => { try { await other.close(); await pg.p.bringToFront(); } catch {} }, j.ms || 12000); out = { ok: true, vis }; }
    else if (req.url === "/reload") { const p = pages[j.user].p; await p.reload({ waitUntil: "domcontentloaded" }); const ok = await p.waitForFunction("globalThis.game?.ready === true && globalThis.canvas?.ready === true", { timeout: 90_000, polling: 500 }).then(() => true, () => false); out = { ok }; }
    else if (req.url === "/shot") {
      const p = pages[j.user].p;
      if (j.selector) { const el = await p.$(j.selector); await el.screenshot({ path: j.file }); }
      else await p.screenshot({ path: j.file });
      out = { ok: true, file: j.file };
    } else if (req.url === "/close") { await pages[j.user]?.ctx.close(); delete pages[j.user]; out = { ok: true }; }
    else if (req.url === "/quit") { res.end("{}"); for (const k of Object.keys(pages)) { try { await pages[k].ctx.close(); } catch {} } browser.disconnect(); process.exit(0); }
    else out = { users: Object.keys(pages) };
  } catch (e) { out = { error: String(e?.stack || e).slice(0, 1500) }; }
  res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(out)); lastReq = Date.now();
});
server.listen(31991, "127.0.0.1", () => console.log("zz-suite gpu harness on :31991"));
