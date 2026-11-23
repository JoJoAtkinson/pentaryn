# End-to-end browser testing (play-tests)

**Read this when:** you need to play-test a Foundry change in a real browser: feel, timing, smoothness, several players at once, or anything a unit test cannot show. **Not this file:** the headless GM bot that keeps the bridge connected → [`headless-gm.md`](headless-gm.md) · the movement acceptance criteria and play-test lists → [`../plans/pathfinding-2026-11.md`](../plans/pathfinding-2026-11.md).

Three ways to drive a real Foundry client. **All three are accepted for end-to-end testing** (Joe, 2026-11-23). Pick by what the test has to prove.

| Path | Renders on | Good for | Not for |
|---|---|---|---|
| **BOSS GPU Chrome** (Windows side, over CDP) | the real GTX 1660 Ti (ANGLE D3D11), ~60 fps | feel and timing, several clients at once, latency emulation, performance traces, real mouse input | the tunnel and Cloudflare Access (it talks to `127.0.0.1:30000`) |
| **The Mac** (Remote Control session `home-pro`, real Chrome over `vtt.atjoseph.com`) | the Mac's GPU, through the tunnel | the full player path: Access login, tunnel latency, a human-like browser | timing while Joe uses the Mac (his training runs load it; results under foreign load are void) |
| **WSL harness** (headless Chrome, software GL) | SwiftShader, ~3 fps | state checks: positions, documents, errors | anything about feel or timing |

## BOSS GPU Chrome

    automation/browser-test/wingpu-start.sh      # (re)starts it; prints "browserURL http://<WSL gateway>:9334"
    node automation/browser-test/gpucheck.mjs    # proves the GPU: renderer string and a ~60 fps rAF count

- Connect with puppeteer-core (`createRequire` from `automation/headless-gm/package.json`): `puppeteer.connect({ browserURL })`.
- **One Foundry client = one `browser.createBrowserContext()`** with its own page (1600×1000). Contexts do not share cookies, so each logs in as its own user (`POST /join {action:"join", userId, password:""}`, then `/game`).
- Background throttling is off, so every client stays live: two players acting "at the same moment" are two pages firing together.
- Use real input (`page.mouse` → CDP `Input` events), CDP `Network.emulateNetworkConditions` per page for latency (11–105 ms is the tunnel's range), and CDP Performance / long-animation-frame entries to attribute long frames.
- Test only as throwaway `ZZ ` users, actors and scenes, and delete them afterwards.
- Check `uptime` before timing runs: BOSS also hosts Foundry and the WSL harness, and a load over ~3 spoils timing.
- Nobody needs to be signed in to Windows.
- **Plumbing** (logged with undo commands in `C:\operations-win\logs\CHANGELOG.md`, 2026-11-23): Windows firewall rule "pentaryn CDP from WSL (test harness)" (TCP 9333/9334 from 172.16.0.0/12) and a `netsh portproxy` from the WSL gateway's :9334 to Chrome's localhost-only :9333. The gateway address can change after a WSL restart; the script re-reads it.

## The Mac

Send exact steps to `home-pro` by `SendMessage`. Its replies reach the session that sent the request, not a subagent, so ask it to write its report to BOSS (`ssh boss 'cat > …'`) as well. Its browser extension drives tabs in one window only, so background tabs are throttled; for two clients, use one Mac tab plus one BOSS page. Ask before using it while Joe is on the Mac.
