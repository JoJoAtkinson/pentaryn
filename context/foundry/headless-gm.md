---
title: "The headless GM — the always-on bridge peer on BOSS"
status: active
last_modified: 2026-10-16
tags: [context, foundry, mcp, bridge, systemd]
---

# The headless GM ("Claude")

**Read this when** the bridge says "module not connected" on BOSS, or you are touching the
headless GM bot: its user, its Chrome, its systemd unit, or its watchdog.
**Not this file:** adding a bridge tool → [`mcp-fork.md`](mcp-fork.md) · stale brokers →
[`README.md`](README.md#stale-bridge-processes-will-silently-break-every-mcp-tool).

## What it is

The bridge module connects only from a **GM-level browser tab on the same machine** as the
Claude session's broker (`ws://localhost:31415`). Joe's tab is usually on another machine, so
BOSS keeps a tab of its own. It is a headless Chrome logged into the active world as the
non-human user **`Claude`**, which is role 3, **Assistant GM**. It runs around the clock as
the systemd `--user` unit **`foundry-headless-gm`**, and nobody needs to be signed in to
Windows.

| Piece | Where |
|---|---|
| Watchdog: browser and state machine | `automation/headless-gm/watchdog.mjs`, with decisions in `state.mjs` (tested by `state.test.mjs`) |
| Credentials: the bot's password login, the bootstrap's admin `loginAs` | `scripts/foundry/ops/headless_gm.py` (`ops headless-gm ensure / cookie / status`), `FoundryAdmin.join` in `scripts/foundry/update/admin.py` |
| Unit | `automation/systemd/foundry-headless-gm.service`, installed to `~/.config/systemd/user/` |
| Installer | `automation/headless-gm/install.sh` (`make foundry-headless-install`) |
| Chrome | chrome-headless-shell in `~/.cache/pentaryn-chrome/` |
| Chrome's libraries | `libnss3`, `libnspr4` and `libasound2t64`, unpacked **without sudo** into `~/.cache/pentaryn-chrome/root/` and loaded through `PENTARYN_HEADLESS_LIBS`. `APT=1` installs them system-wide instead. |
| Env keys (`~/.config/pentaryn/env`) | `PENTARYN_HEADLESS_CHROME`, `PENTARYN_HEADLESS_LIBS`; optional `PENTARYN_BOT_USER`, `PENTARYN_HEADLESS_CANVAS`, `PENTARYN_INFISICAL_TOKEN_FILE` |
| Status file | `$XDG_RUNTIME_DIR/pentaryn-headless-gm/status.json`, rewritten every tick |
| Log | journald (`make foundry-headless-logs`) and `.state/logs/headless-gm-YYYY-MM.log`, one line per transition |
| Chrome profile | `.state/headless-gm-profile/` |

## Commands

    make foundry-headless-status     # first check when bridge tools fail on BOSS (JSON=1)
    make foundry-headless-logs       # N=200 for more
    make foundry-headless-restart    # fresh Chrome; reconnects in ~15 s
    make foundry-headless-stop / -start
    make foundry-headless-ensure     # create the bot user in the active world now, if missing
    make foundry-headless-install    # idempotent; NO_START=1 enables without starting, APT=1 uses apt
    make foundry-headless-test       # node --test of the state machine

## How it gets in, and what it holds

- **Login.** The bot logs in **with its own password**, like the `/join` form, on a fresh
  session that has never authenticated as server admin (`cookie --as bot` →
  `FoundryAdmin.join`). The session cookie reaches Node in a 0600 file under
  `$XDG_RUNTIME_DIR` (tmpfs), which Node deletes as soon as it has read it. It never appears
  in argv or stdout.
  - **Why not `loginAs`, as `make login` and the smoke test do.** `loginAs` needs an admin
    session, and the admin flag **stays on the session the browser gets**. Foundry can only
    drop it from the setup screen, so it would last the cookie's 24 h. With it, `/setup`
    accepts that page's `worldShutdown` without a password, so any `eval-js` calling
    `game.shutDown()` would shut the world down under the table, even though the bot is only
    role 3. Check it with `eval-js`: `game.socket.emit("getJoinData", r => r.isAdmin)` must be
    `false` (it was `true` before 2026-10-16).
- **Infisical under systemd.** A systemd service has no `WSLENV`, so it does not get the machine
  identity that `~/.boss-env` turns into `INFISICAL_TOKEN`. The helper therefore reads the token
  that `~/.boss-env` caches at `~/.cache/infisical-boss-token` into its own environment.
  - Every `WSLENV` shell refreshes that cache once it is more than 25 days old, and that
    includes the nightly, which Task Scheduler launches through `wsl.exe`.
  - If the cache goes stale, LOGIN logs `helper exit 5: admin password unavailable` and keeps
    retrying. Fix it by opening any WSL terminal (that refreshes the cache), or run
    `infisical login`.
- **The bot's password.** The bot user has a random password, `secrets.token_urlsafe(32)`,
  stored in Infisical as **`FOUNDRY_VTT_BOT_PW`** next to the grandmaster password.
  - It is what the bot logs in with. It also stops a player who gets past Cloudflare Access
    from picking "Claude" from the `/join` dropdown and becoming an Assistant GM.
  - It was generated during the bootstrap and written with `infisical secrets set --file
    /dev/stdin`, then read back to check it.
  - Do not use `NAME=@/dev/stdin`. CLI 0.43 stores that string literally.
  - If the user refuses it (someone changed it by hand, or the secret was rotated),
    `cookie --as bot` exits **7**. The watchdog then runs the bootstrap, which sets
    Infisical's value on the existing bot user again.
- **Bootstrap.** This runs when the active world has no user named `Claude` at role 3 or above.
  1. The watchdog mints a session as the world's first role-4 user.
  2. It opens a throwaway incognito context with no canvas.
  3. It runs `User.create({name, role: ASSISTANT, password})` there, or, when the bot exists
     but refused its password, `update({password})`. Then it closes the context.
     This is a second, short-lived session as Joe's GM user, minted with admin + `loginAs`
     (no GM password is stored). Foundry allows several sessions per user, and Joe's own tab is
     not affected. Its cookie dies with the context, and the bot never gets it.
  4. If a user called `Claude` already exists at a lower role, the watchdog **refuses** and logs
    it, because it will not promote a human's user. Rename that user, or set `PENTARYN_BOT_USER`.

## Role 3, and what it cannot do

The bot's session is an ordinary user session, not a server-admin one (see **Login** above),
so role 3 is all it holds. In particular `game.shutDown()` and anything else under `/setup`
are refused.

`User#isGM` is `hasRole(ASSISTANT)`, so every gate in the bridge (`isGMUser()`), in the fork's
handlers (`requireGM`) and in the pentaryn modules passes. A grep on 2026-10-16 found no
role-4-only check in `foundry/module`, `foundry/lib` or the bridge's `dist/`.

An Assistant GM **cannot**:
- write `core.permissions` (Configure Permissions);
- create or promote a Gamemaster;
- edit a role-4 user, or any user's `permissions`.

Claude needs none of these. Two things depend on the world's permission matrix:
`SETTINGS_MODIFY` (world-setting writes, including the bridge's own `lastActivity`) and
`FILES_UPLOAD` (map generation, uploads). The default matrix grants both to role 3. The watchdog
checks them at every login and logs **`PERM-GAP`** if a world has removed either one. Either
restore it in Configure Permissions or raise the bot to role 4. `status` shows both values.

**activeGM.** When Joe's role-4 tab is connected, it always outranks the bot as
`game.users.activeGM`, so `queryGM` calls and every `isActiveGM()`-gated automation
(`foundry/lib/election.mjs`) run in **Joe's** browser. When no full GM is connected, the bot
*is* the active GM, and pentaryn's active-GM automation runs headless on BOSS.

## No canvas, by default

With SwiftShader drawing a scene, the bot used about 1280% CPU and hit the 1.5 GB `MemoryMax`
(measured 2026-10-16). With the canvas off (`core.noCanvas`, set in the page before it loads),
it idles at about 0.5 GB and close to 0% CPU.

Without a canvas nothing is ever *viewed*, so `game.scenes.current` would be null, and
`get-current-scene` and the token tools would fail with "Scene not found". The watchdog
therefore redefines `current` **on the bot's client only** as `viewed ?? active`, meaning the
scene the table is on. `canvas.pan` and anything else that draws does nothing there.

That override, and the exit from any onboarding tour, live on `game`, so a reload of the page
drops them. Foundry reloads every client when a GM saves a setting that asks to "reload all
clients" (Manage Modules, for example), and after any socket reconnect that took 5 s or more.
So the page re-applies them on Hooks `ready` every time it loads, and the tick re-applies them
whenever `status.json` shows `patched: false`. The log line for that is `↻ PATCH`.

`PENTARYN_HEADLESS_CANVAS=1` in the env file turns the canvas back on. Restart the unit after
changing it.

## States

The watchdog ticks every 10 s, and the decision is `state.mjs nextAction()`.

| State | Meaning | It does |
|---|---|---|
| `FOUNDRY_DOWN` | `/api/status` does not answer (nightly, restart) | Closes the page and waits |
| `NO_WORLD` | Foundry is at setup | Closes the page and waits |
| `BOT_MISSING` | `cookie --as bot` exited 3 (no bot) or 7 (bot refused its password) | Bootstrap (create, or re-set the password), at most once every 5 min |
| `LOGIN` | No page, the world changed, not on `/game`, `game.ready` false for 120 s, not a GM, or the session is older than 20 h | Mints a cookie and loads `/game`; logins are at least 30 s apart |
| `CONNECTED` | `foundryMCPBridge.getStatus().connected`, and the broker's probe agrees (or cannot be asked) | Nothing |
| `BRIDGE_STALE` | The page says connected, but the broker's own round trip fails (control `:31414` `foundry_ping`, a fork method; checked every tick) | `foundryMCPBridge.restart()` on the restart backoff; after 3 restarts that do not fix it, a fresh login (page reload) |
| `BRIDGE_DOWN` | Not connected | If no broker is on :31415/:31416, it waits (no Claude session on BOSS). If a broker is there, it runs `foundryMCPBridge.restart()`, backing off from 15 s to 2 min |
| `BRIDGE_DISABLED` | The bridge's world setting `enabled` is off | Nothing, and does not loop |
| `BRIDGE_MISSING` | No `foundryMCPBridge` on the page (module off in this world) | Nothing |

- **Exits.** A page crash, a browser disconnect, or 5 errors in a row make the process exit 1,
  and `Restart=always` brings it back after 10 s. SIGTERM closes Chrome cleanly.
- **Chrome stays inside the unit.** Given a session bus, Chrome moves its main process into
  its own `app-org.chromium.Chromium-<pid>.scope`, outside `MemoryMax` and outside the
  stop-time kill. The watchdog therefore launches it with `DBUS_SESSION_BUS_ADDRESS=disabled:`
  and talks to it over a pipe (`pipe: true`), so Chrome also exits on its own when Node dies.
  As a backstop, the run-forever mode kills any process still running on
  `.state/headless-gm-profile` when it starts, and logs `! SWEEP`. Check it with
  `cat /proc/$(pgrep -f 'headless-gm-profile' | head -1)/cgroup`, which should end in
  `foundry-headless-gm.service`.
- **Foundry is never started by this unit.** It has `After=foundryvtt.service` and no
  `Wants=`. With `Wants=`, a restart of the bot's unit would have started Foundry again in the
  middle of the nightly's backup, or under a restore or an update.
- **Unpause after a restart.** Foundry launches every world paused, and no setting changes that.
  Once per Foundry boot, the first time the bot is ready as a GM, it unpauses the world, but only
  if Foundry booted less than 15 min ago (`UNPAUSE_WINDOW_MS`). The boot is identified as now
  minus `/api/status` `uptime`. Either way the boot is recorded, so a pause the GM sets later is
  never undone, even if the bot restarts. The decision is `state.mjs bootDecision()`, and the log
  line is `✓ UNPAUSE`. A world relaunched from `/setup` without a server restart stays paused.
- **Nightly.** At 03:00 the nightly runs `systemctl --user try-restart foundry-headless-gm`
  after it relaunches the world. This is not fatal, and it does nothing where the unit is not
  installed. The bot counts in the nightly's `users=`.

## Verified 2026-10-16 (pentaryn)

- `get-world-info` listed the bot among the active users.
- `eval-js` ran as `game.user.name === "Claude"`, role 3, `isGM: true`, with `activeGM` as Joe's
  `Gamemaster`.
- `pentaryn-read *.describe`, `get-current-scene` (28 tokens) and `list-scenes` all answered
  through the bot.
- `make foundry-headless-restart` went from SIGTERM back to CONNECTED in about 16 s.
- After the password-login change, `getJoinData` from the bot's page reported `isAdmin: false`.
  Before it, the value was `true`.
- The bot's tab was reloaded, and the scene override came back on `ready`. When the override
  was deleted by hand, the next tick logged `↻ PATCH` and put it back.
- `kill -9` of the watchdog took Chrome down with it. No `app-org.chromium.*` scope or orphan
  was left behind, and the unit was CONNECTED again about 26 s after the kill.

### Not yet exercised live

- **Exit 7, the bot refusing its password**, and the bootstrap re-setting it. This is covered
  by unit tests only.

- **The page says connected but the broker cannot reach it.** Seen 2026-10-17 after the 03:00
  nightly: every bridge tool said "module not connected" while the bot showed `CONNECTED`. Since
  then the watchdog asks the broker itself (`BRIDGE_STALE`). Live, a `kill -9` of the broker with
  the new watchdog recovered on its own (the page reconnected to the respawned broker, and the
  probe answered `ok: true`). The stale branch itself (restart, then reload) is covered by
  `state.test.mjs` only.
- **A broker that goes away and comes back (the normal case).** This happens naturally when Claude sessions end
  and start. Look in the log for `BRIDGE_DOWN … no MCP broker`, then `✓ BRIDGE-RESTART`, then
  `CONNECTED`.
- **A world switch and the no-world path.** These are covered by `state.test.mjs`. To test
  live, switch worlds from `/setup` while nobody is playing, then watch `make foundry-headless-logs`
  for `LOGIN … world changed`, and for `BOT_MISSING` → `BOOTSTRAP` in a world that has no bot yet.
- **WSL going idle with nobody signed in.** If the VM shuts down, Foundry stops too. The
  remedy would be a Task Scheduler S4U `wsl.exe -e sleep infinity` keepalive under
  `automation/windows/`, and that has not been built.
- **A second bridge peer.** This would happen if Joe opened a GM tab on BOSS itself. How the
  broker behaves with two peers has not been checked.
