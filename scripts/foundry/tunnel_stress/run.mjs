#!/usr/bin/env node
// Tunnel transport stress test — no Foundry involved.
//
// Starts a local WebSocket echo server, exposes it through a throwaway cloudflared QUICK tunnel
// (trycloudflare.com) on the chosen edge protocol, drives N WebSocket clients through the public
// URL with a 1 s heartbeat, and writes a summary (JSON + markdown): disconnects, stalls > 2 s,
// slow echoes, the quick tunnel's own transport errors and its precheck "UDP Connectivity" lines.
// A 1/s UDP probe (DNS to 1.1.1.1) and the http2-vs-quic pair tell a path blip from a QUIC one.
//
//   node scripts/foundry/tunnel_stress/run.mjs quic  [--duration 1800] [--clients 20]
//   node scripts/foundry/tunnel_stress/run.mjs http2 [--duration 1800] [--clients 20]
//   … --payload 65536   pads every heartbeat (echoed back): 20 clients × 64 KB/s ≈ 1.3 MB/s each way
//   node scripts/foundry/tunnel_stress/run.mjs --url wss://x.trycloudflare.com --label win  (clients only)
//
// Never touches the live tunnel, its config or port 30000. README.md has the reading guide.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : dflt; };
const proto = ['quic', 'http2'].includes(argv[0]) ? argv[0] : null;
const extUrl = opt('url', null);
if (!proto && !extUrl) { console.error('usage: run.mjs <quic|http2> [--duration s] [--clients n] [--out dir] | --url wss://… [--label x]'); process.exit(2); }
const duration = +opt('duration', 1800), N = +opt('clients', 20), SLOW = 2000;
const pad = 'x'.repeat(+opt('payload', 0)); // extra bytes per heartbeat, echoed back (load test)
const label = opt('label', proto ?? 'ext');
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = opt('out', path.join(repo, '.output', 'tunnel-stress', `${stamp}-${label}`));
fs.mkdirSync(outDir, { recursive: true });
const events = fs.createWriteStream(path.join(outDir, 'events.jsonl'));
const ev = (o) => events.write(JSON.stringify({ t: new Date().toISOString(), ...o }) + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── echo server (only with a protocol; --url mode drives someone else's tunnel) ──
let server, cf, cfLog = '', publicUrl = extUrl;
if (proto) {
  const { WebSocketServer } = createRequire(path.join(repo, 'automation/headless-gm/'))('ws');
  server = createServer((q, r) => { r.writeHead(200); r.end('ok'); });
  new WebSocketServer({ server }).on('connection', (ws) => ws.on('message', (m) => { try { ws.send(m.toString()); } catch {} }));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  cf = spawn(opt('cloudflared', 'cloudflared'), ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--protocol', proto], { stdio: ['ignore', 'pipe', 'pipe'] });
  const logFile = fs.createWriteStream(path.join(outDir, 'cloudflared.log'));
  for (const s of [cf.stdout, cf.stderr]) s.on('data', (d) => { cfLog += d; logFile.write(d); });
  cf.on('exit', (code) => ev({ ev: 'cloudflared-exit', code }));
  for (let i = 0; i < 60 && !publicUrl; i++) { await sleep(500); publicUrl = cfLog.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0]?.replace('https', 'wss'); }
  if (!publicUrl) { console.error('no quick-tunnel URL after 30 s:\n' + cfLog); cf.kill(); process.exit(1); }
  for (let i = 0; i < 40 && !/Registered tunnel connection/.test(cfLog); i++) await sleep(500);
  await sleep(8000); // DNS for the new hostname + the precheck table
}
console.error(`▸ ${label}: ${N} clients → ${publicUrl} for ${duration} s  (out: ${outDir})`);

// ── clients ──
const st = { sent: 0, recv: 0, closes: 0, stalls: 0, slow: 0, errors: 0, reconnects: 0, connectFails: 0, maxDownMs: 0, rtts: [] };
let done = false; const stops = [];
function client(i) {
  let ws, seq = 0, timer, stalled = false, downSince = null, everOpen = false; const pending = new Map();
  const connect = () => {
    if (done) return;
    ws = new WebSocket(`${publicUrl}/c${i}`);
    ws.onopen = () => {
      if (downSince) { const downMs = Date.now() - downSince; st.reconnects++; st.maxDownMs = Math.max(st.maxDownMs, downMs); ev({ ev: 'reconnected', i, downMs }); downSince = null; }
      everOpen = true; pending.clear(); stalled = false;
      timer = setInterval(() => {
        const now = Date.now(), oldest = pending.values().next().value;
        if (oldest && now - oldest > SLOW && !stalled) { stalled = true; st.stalls++; ev({ ev: 'stall-start', i, ageMs: now - oldest }); }
        if (ws.readyState === 1) { pending.set(++seq, now); st.sent++; ws.send(JSON.stringify({ seq, t: now, pad })); }
      }, 1000);
    };
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data), rtt = Date.now() - d.t;
      pending.delete(d.seq); st.recv++; st.rtts.push(rtt);
      if (rtt > SLOW) { st.slow++; ev({ ev: 'slow', i, rtt }); }
      if (stalled && pending.size === 0) { stalled = false; ev({ ev: 'stall-end', i, rtt }); }
    };
    ws.onerror = (e) => { st.errors++; ev({ ev: 'error', i, msg: String(e.message ?? 'error') }); };
    ws.onclose = (e) => {
      clearInterval(timer); if (done) return;
      if (downSince === null) { downSince = Date.now(); if (everOpen) { st.closes++; ev({ ev: 'close', i, code: e.code, lostPending: pending.size }); } else { st.connectFails++; ev({ ev: 'connect-fail', i, code: e.code }); } }
      else st.connectFails++;
      setTimeout(connect, 500);
    };
  };
  setTimeout(connect, i * 100);
  stops.push(() => { clearInterval(timer); try { ws.close(); } catch {} });
}
for (let i = 0; i < N; i++) client(i);

// ── UDP path probe: one DNS query a second to 1.1.1.1 ──
const udp = { sent: 0, recv: 0, lost: 0, slow: 0 }; const usock = dgram.createSocket('udp4'); const upend = new Map(); let uid = 0;
const dnsq = (id) => Buffer.concat([Buffer.from([id >> 8, id & 255, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 7]), Buffer.from('example'), Buffer.from([3]), Buffer.from('com'), Buffer.from([0, 0, 1, 0, 1])]);
usock.on('message', (m) => { const t = upend.get(m.readUInt16BE(0)); if (!t) return; upend.delete(m.readUInt16BE(0)); udp.recv++; if (Date.now() - t > 1000) { udp.slow++; ev({ ev: 'udp-slow', rtt: Date.now() - t }); } });
usock.on('error', () => {});
const uiv = setInterval(() => { const now = Date.now(); for (const [i, t] of upend) if (now - t > 3000) { upend.delete(i); udp.lost++; ev({ ev: 'udp-lost', sentAt: new Date(t).toISOString() }); } uid = (uid + 1) & 0xffff; upend.set(uid, now); udp.sent++; usock.send(dnsq(uid), 53, '1.1.1.1'); }, 1000);

// ── finish ──
let finishing = false;
async function finish() {
  if (finishing) return; finishing = true; done = true; clearInterval(uiv); stops.forEach((s) => s()); usock.close();
  await sleep(500);
  if (cf) { cf.kill('SIGTERM'); await sleep(1500); }
  server?.close();
  const r = st.rtts.sort((a, b) => a - b), p = (q) => r.length ? r[Math.min(r.length - 1, Math.floor(q * r.length))] : null;
  const preShutdown = cfLog.split('Initiating graceful shutdown')[0].split('\n');
  const count = (re) => preShutdown.filter((l) => re.test(l)).length;
  const summary = {
    label, protocol: proto, url: publicUrl, host: os.hostname(), platform: process.platform, startedAt: stamp, durationS: duration, clients: N, payloadBytes: pad.length,
    heartbeats: { sent: st.sent, echoed: st.recv, lost: st.sent - st.recv },
    disconnects: st.closes, reconnects: st.reconnects, connectFails: st.connectFails, maxDownMs: st.maxDownMs,
    stallsOver2s: st.stalls, slowEchoesOver2s: st.slow, rttMs: { p50: p(0.5), p99: p(0.99), p999: p(0.999), max: r.at(-1) ?? null },
    udpProbe: udp,
    cloudflared: proto ? {
      version: cfLog.match(/Version (\S+)/)?.[1] ?? null,
      registered: cfLog.match(/Registered tunnel connection.*protocol=(\w+)/)?.[1] ?? null,
      registrations: count(/Registered tunnel connection/),
      precheckUdp: [...new Set(preShutdown.filter((l) => /\|\s+UDP Connectivity/.test(l)).map((l) => l.replace(/^.*?\|\s*/, '').replace(/\s*\|\s*$/, '').replace(/\s{2,}/g, ' ')))],
      precheckSummary: preShutdown.find((l) => /SUMMARY:/.test(l))?.replace(/^.*SUMMARY:\s*/, '').replace(/\s*\|\s*$/, '') ?? null,
      quicDialFailures: count(/Failed to dial a quic connection/),
      noRecentNetworkActivity: count(/no recent network activity/),
      datagramManagerErrors: count(/datagram manager error/),
      retryingConnection: count(/Retrying connection/),
      connectionTerminated: count(/Connection terminated/),
      errLines: count(/ ERR /), wrnLines: count(/ WRN /),
    } : null,
  };
  summary.clean = summary.disconnects === 0 && summary.stallsOver2s === 0 && summary.connectFails === 0 && summary.heartbeats.lost <= N
    && (!proto || (summary.cloudflared.registrations === 1 && summary.cloudflared.retryingConnection === 0));
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  const c = summary.cloudflared;
  const md = [`# Tunnel stress — ${label} — ${stamp}Z`, '',
    `${N} clients, 1 s heartbeat${pad.length ? ` + ${pad.length} B payload` : ''}, ${duration} s, ${summary.platform} on ${summary.host}. **${summary.clean ? 'CLEAN' : 'NOT CLEAN'}**`, '',
    '| Measure | Value |', '|---|---|',
    `| Disconnects / reconnects / failed connects | ${summary.disconnects} / ${summary.reconnects} / ${summary.connectFails} |`,
    `| Longest outage | ${summary.maxDownMs} ms |`,
    `| Stalls > 2 s / slow echoes > 2 s | ${summary.stallsOver2s} / ${summary.slowEchoesOver2s} |`,
    `| Heartbeats sent / echoed / lost | ${st.sent} / ${st.recv} / ${st.sent - st.recv} |`,
    `| RTT p50 / p99 / p99.9 / max (ms) | ${summary.rttMs.p50} / ${summary.rttMs.p99} / ${summary.rttMs.p999} / ${summary.rttMs.max} |`,
    `| UDP probe 1.1.1.1 sent / lost / slow | ${udp.sent} / ${udp.lost} / ${udp.slow} |`,
    ...(c ? [`| cloudflared | ${c.version}, registered ${c.registered} ×${c.registrations} |`,
      `| Precheck UDP | ${c.precheckUdp.join('; ') || '(none logged)'} |`,
      `| Precheck summary | ${c.precheckSummary ?? '(none logged)'} |`,
      `| QUIC dial failures / "no recent network activity" / datagram manager errors | ${c.quicDialFailures} / ${c.noRecentNetworkActivity} / ${c.datagramManagerErrors} |`,
      `| "Retrying connection" / "Connection terminated" / ERR / WRN lines | ${c.retryingConnection} / ${c.connectionTerminated} / ${c.errLines} / ${c.wrnLines} |`] : []), ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'summary.md'), md);
  await new Promise((r) => events.end(r));
  console.log(JSON.stringify(summary)); console.error(`▸ wrote ${path.join(outDir, 'summary.md')}`);
  process.exit(summary.clean ? 0 : 1);
}
setTimeout(finish, duration * 1000);
process.on('SIGINT', finish); process.on('SIGTERM', finish);
