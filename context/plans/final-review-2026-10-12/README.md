## Integration

**Read this when:** you need what the final-review merge window INT-1228 merged, synced and proved live.

INT-1228 (2026-10-12): merged ties-core 106b4d81, prompts-core 5cb445eb, prompts-adapters c188ef5a,
transform-core 0f5fa86b, transform-ui 1af1efa6, riders 2b7b38c3. No `module.json` or fork change, so
no restart and no bridge rebuild. Gates on main green (modules-check, lib-check, test 1581 passed,
check-context). Synced ties, prompts, transform, riders; one GM-tab reload; boot probe and
`selftest().ok` true for all four. Live goldens: ties, prompts, transform diff empty. Riders: shared
identical; `declared` showed `describe().patches` / selftest patch details missing two Argon
item-button rows, which a control run (old code, freshly reloaded tab) reproduces identically to the
new code: those rows are installed lazily at Argon's first render, so the before-golden's long-lived
tab had them. Tab state, not code; no revert. Timing note: riders `featuresOf` median 6.5 us -> 17.5 us
(sub-millisecond, not gated). Reverts: none.

## Integration INT-1228

Final record for the merge window (green = true). Areas:

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| ties-core | merged | 106b4d81 | — | ties | — |
| prompts-core | merged | 5cb445eb | — | prompts | — |
| prompts-adapters | merged | c188ef5a | — | prompts | — |
| transform-core | merged | 0f5fa86b | — | transform | — |
| transform-ui | merged | 1af1efa6 | — | transform | — |
| riders | merged | 2b7b38c3 | — | riders | — |

**Probe (12:38Z, check only).** World pentaryn on dnd5e 6.0.6 / Foundry 14.369, Gamemaster the only
active user, one tab at `localhost:30000/game`, `get-world-info` answers. For ties 0.19.4, prompts
0.4.5, transform 0.4.0, riders 0.3.0: `describe().version` matches `module.json`, every described path
is a function (111/16/13/13), `selftest().ok` true. Deployed folders match main at 2b7b38c3 byte for
byte (`.pentaryn-sync.json`: git 2b7b38c3, dirty false); the tab loaded after the last riders sync
and runs the new riders code. No pentaryn-* console errors from this page load; no ZZ fixtures left.

**Goldens.** Diff empty for ties, prompts, transform. Riders: `golden.shared` identical; the
`declared` section lacked two lazily installed Argon patch rows in the freshly reloaded tab, and a
control golden of the old riders code in a fresh tab diffs empty against the new code — tab state,
not code, so no revert. Goldens under `.state/live-goldens/INT-1228/{before,after,control}`.

**Foundry state.** Up, world pentaryn loaded, one GM tab answering `get-world-info`. No restart, no
bridge rebuild (no `module.json` or fork change). Review worktrees for the six merged areas removed;
branches kept.

## Integration INT-1247

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| ties-study | merged | b2fa66a6 | — | ties | — |
| combat-core | merged | a8a079f9 | — | combat | — |
| aoe | merged | 2b2aadcd | — | aoe | — |

**Gates on main (2b2aadcd).** `make foundry-modules-check` (all 20 modules), `make foundry-lib-check`
(93), `make test` (1581 passed), `make check-context` all green. No fork area merged; no `module.json`
changed, so no restart and no bridge rebuild.

**Deploy.** Rollback copies of the three deployed folders in `.state/live-rollback/INT-1247/`; `make
foundry-{aoe,combat,ties}-sync` with `FROM=local`; one GM-tab reload. Boot probe: aoe 0.4.0, combat
0.3.0, ties 0.19.4 `describe().version` equals `module.json`, every described path (24/25/111) is a
function, `selftest().ok` true where present (combat, ties). Deployed folders match main byte for byte.

**Goldens.** Before (deployed code) and after (new code) run in the one GM tab and diffed in page:
aoe, combat and ties diff empty (`shared`, `declared`, env, cleanup clean, no ZZ fixtures left).
No allowlist used. Re-run with files (no restart, two GM-tab reloads): rollback copies restored,
before-goldens saved, the three syncs re-run (same digests: ties a56fbc19, combat 1ef0600d, aoe
263a207e), after-goldens saved to `.state/live-goldens/INT-1247/{before,after}/`; `diff.mjs` without
`--declared` exits 0 for all three. Nothing reverted.

**Foundry state.** Up, world pentaryn loaded, Gamemaster the only active user, one GM tab answering
`get-world-info`.

## Integration INT-1259

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| combat-hud | merged | 5993178a | — | combat | — |
| senses | merged | 4db133a1 | — | senses | — |
| kit | merged | ea8e9d8a | — | none (lib tests only) | — |

**Gates on main (ea8e9d8a).** `make foundry-modules-check` (20 modules), `foundry-lib-check`, `make test` (1581 passed), `check-context` all green. No fork area, no `module.json` change: no restart, no bridge rebuild.

**Deploy.** Rollback copies in `.state/live-rollback/INT-1259/`; `make foundry-{combat,senses}-sync` (FROM=local); one GM-tab reload. Boot probe: combat 0.3.0 and senses 0.5.0 `describe()` match `module.json`, every path a function, combat `selftest().ok` true.

**Goldens.** Before (deployed old code) and after (new code) in the one GM tab, diffed in page: combat and senses `shared`, `declared`, env all empty; cleanups clean. No allowlist. Reverted: none.

**Relaunch (13:10Z).** The first INT run saved no golden files, so the relaunch restored the rollback copies, reloaded, captured before-goldens, re-synced combat and senses (digests unchanged: combat 9b7e03d3, senses e6f875db), reloaded once and captured after-goldens in `.state/live-goldens/INT-1259/{before,after}/`. `diff.mjs before after` (no `--declared`) exits 0 for both modules; cleanups clean. Senses has no `selftest()`.

**Foundry state.** Up, no restart; world pentaryn, dnd5e 6.0.6, Foundry 14.369; one GM tab, Gamemaster the only active user; no ZZ documents or combats left behind.

## Integration INT-1327

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| ties-ui | merged | aeb31af6 | — | ties | — |
| fork | merged | 0bd2f94 (fork repo) | — | bridge (server + module handlers) | — |
| py-cloud | merged | 86c9ec78 | — | none (Python, live by being on main) | — |

**Gates.** On main: `foundry-modules-check`, `foundry-lib-check`, `make test` (1587 passed, 2 skipped,
5 xfailed), `check-context` green. Fork: typecheck, mcp-server and foundry-module vitest,
`fork-footprint.sh` green. No `module.json` changed, so no restart.

**Deploy.** Rollback copies of ties, the bridge module and the server `dist` in
`.state/live-rollback/INT-1327/`. `make foundry-ties-sync`; fork `build:server` and `build:foundry`
(only `dist/fork/handlers.*` differed, copied; deployed bridge dist equals the build), backend
`kill -9`, one GM-tab reload. Probe: ties 0.19.4 equals `module.json`, `selftest().ok` true; bridge
active and `pentaryn-read` answers. Ties live golden before vs after: identical (timings only differ).
Reverts: none. `server.py` of py-cloud is unchanged by this batch.
**Golden files (relaunch check, 13:38Z).** The first pass left only a hand-trimmed ties before-golden,
so it was re-done with files: before = `.state/live-goldens/INT-1247/after/ties.json` (the full golden
run on the deployed pre-merge build, ties digest a56fbc19 = this lane's rollback copy), after = a fresh
run in the GM tab loaded 13:34:07Z on the synced build (digest bdd41b82); both in
`.state/live-goldens/INT-1327/{before,after}/ties.json`. `diff.mjs` without `--declared`: shared
identical, cleanup clean, exit 0. A third GM-tab reload to take the before on restored code was refused
by the session's permission classifier; the rollback copy sat on disk for about a minute and the
re-sync put back the same digest, with no reload in between. Console: no pentaryn-* or bridge errors
since tracking started (after the load). Bridge: deployed module `dist` equals the build, backend
started 09:33:42 after the 09:33:28 server build, `get-world-info` and `pentaryn-read` answer.

## Integration INT-1349

| Area | Status | Merge SHA | Revert SHA | Synced modules | Reason |
|---|---|---|---|---|---|
| py-ops | merged | 1b7da6e2 | — | none (Python, live by being on main) | — |
| py-blueprint | merged | 48456679 | — | none (Python, live by being on main) | — |
| py-mcp | merged | d4b3a09e | — | none (Python, live by being on main) | — |

**Gates.** On main at d4b3a09e: `make test` (1626 passed, 2 skipped, 5 xfailed), `check-context`
(OK, 5 warnings), `foundry-modules-check` (all 20 modules pass), `foundry-lib-check` green. The three
merges touch only `scripts/**` and their review docs: no module, no `module.json`, no fork, so no
sync, no rebuild, no restart and no GM-tab reload; no module changed, so no live goldens and no
rollback copies were needed.

**Live check (13:56–14:05Z).** Tunnel down, Foundry up. `get-world-info` answers with one active
user (Gamemaster); one Foundry tab. `pentaryn-read {ns:"*", path:"describe"}` answers `ok`. Smoke of
the merged Python: `make vtt-status` (py-ops) and `scripts/mcp/server.py --list-tools` (py-mcp,
the dnd-scripts server picks it up at the next session start) both run. `make login NO_OPEN=1`
printed the URL and then timed out waiting for a browser to collect it, as designed when nothing
navigates (the existing GM tab was kept, not replaced); py-ops' only `login.py` change is the
`_choose` range check. Reverts: none. main was already on origin at d4b3a09e.
