# tunnel_stress — is the tunnel transport dropping clients?

A stress test for the cloudflared edge transport (QUIC vs HTTP/2) that never touches Foundry, the live tunnel, its config or port 30000. It starts a local WebSocket echo server on a free localhost port, publishes it through a throwaway cloudflared **quick tunnel** (`*.trycloudflare.com`, no account, gone when the run ends), and drives N WebSocket clients through the public URL with a one-second heartbeat.

## Run it

```bash
export PATH=$HOME/.nvm/versions/node/v24.22.3/bin:$PATH    # Node 22+ (built-in WebSocket)

# one command per protocol; run both at once in two shells so a path blip shows on both
node scripts/foundry/tunnel_stress/run.mjs quic  --duration 1800 --clients 20
node scripts/foundry/tunnel_stress/run.mjs http2 --duration 1800 --clients 20

# same, under load: every heartbeat carries 64 KB and is echoed back (about 1.3 MB/s each way)
node scripts/foundry/tunnel_stress/run.mjs quic  --duration 600 --clients 20 --payload 65536
```

Defaults: 1800 s, 20 clients. Each run writes `.output/tunnel-stress/<UTC stamp>-<label>/` with `summary.md`, `summary.json`, `events.jsonl` (every disconnect, stall, slow echo, lost UDP probe) and `cloudflared.log`. The summary JSON is also printed on stdout. Exit code 0 means clean, 1 means not clean. Ctrl+C ends a run early and still writes the summary.

Other options: `--label x` (names the output folder), `--out dir`, `--cloudflared /path/to/binary` (test another release), `--url wss://… --label x` (clients only, against a tunnel started elsewhere — for example a native Windows `cloudflared.exe`).

## Read it

| Field | Meaning |
|---|---|
| `disconnects`, `reconnects`, `maxDownMs` | WebSockets that closed mid-run and how long the longest was away. This is what a player sees as "lost connection" |
| `stallsOver2s`, `slowEchoesOver2s` | The socket stayed open but a heartbeat took more than 2 s |
| `heartbeats.lost` | Sent minus echoed. Up to one per client is normal (in flight when the run ends) |
| `udpProbe` | One DNS query a second to 1.1.1.1 over UDP from the same machine. Losses here are the network path, not the tunnel |
| `cloudflared.precheckUdp` | The quick tunnel's own startup precheck lines for UDP/QUIC |
| `cloudflared.registrations` | 1 is right. More means the edge connection was lost and re-registered |
| `quicDialFailures`, `noRecentNetworkActivity`, `datagramManagerErrors`, `retryingConnection` | Counts of the same error lines the live tunnel log (`make tunnel-logs`) shows when QUIC flaps |
| `clean` | No disconnects, no stalls, no failed connects, one registration, no retries |

**Telling causes apart:** drops in the `quic` run but not in the `http2` run at the same time point at the QUIC/UDP transport. Drops in both at the same seconds, or `udpProbe.lost` above zero, point at the machine's network path (NIC, router, ISP), which no tunnel setting fixes. A clean pair says the transport is fine on this network.

The baseline and what it settled: `context/foundry/ops.md`, Gotchas, "The tunnel on QUIC…".
