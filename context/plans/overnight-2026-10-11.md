---
title: Overnight run 2026-10-11 → 12 — finish the migration, merge everything, play test
status: active
last_modified: 2026-10-11
tags: [plan, workflow, orchestration, migration]
---

# Overnight run 2026-10-11 → 12

**Read this when:** you are the main session (or a cron tick) driving the overnight chain, or you
want to know what ran overnight. State lives in the scratchpad `chain-state.json`; this file is
the rules. Reviewed 2026-10-11 20:55 against the Makefile, the blueprint README, the bundles plan
and the real branch list (§13 lists what was checked).

## Joe's instructions (2026-10-11, verbatim intent)

- Nobody is playing, the tunnel is down. Do **all** waves and make them **all live**.
- A 30-minute cron makes sure the next wave starts when the last ends: wave 4, wave 5.
- Also do optional fixes: bugs found along the way, and hardening with no downside.
- Merge everything down. Module bundles merges to main when its go-live is done. If it doesn't,
  set up a process that gets it to main. Other branches Joe built that aren't merged to main
  should all come together too.
- After wave 5, play test all of the changes. Big changes first, then random spot checks across
  everything. Judge per feature whether the bridge can test it fully, or whether it has real
  value as a one-at-a-time play test. A bug a play test finds gets fixed. Restarts are unlimited.
- Joe is asleep, so there's no rush. Nothing may reach a stop state that needs him before morning.

**Consequence:** the `gated_on_joe` list in the old `chain-state.json` is retired. Wave 3 live,
wave 4 live and every other lane here are **not** gated on Joe. The only thing that may wait for
Joe is an entry in the morning report.

## 1. Lanes and the two locks

- **Code lanes** run in their own git worktree and never touch Foundry, the main checkout or the
  real cloud. Several can run at once.
- **LIVE lock** (`live_owner`): at most one workflow at a time may stop, start or restart
  Foundry, sync modules, rebuild the bridge, use the browser, use `mcp__foundry__*` tools or
  touch the real OneDrive. Every go-live, every live phase, the play test.
- **MAIN lock** (`main_owner`): at most one workflow at a time may commit to `main` in the main
  checkout `/Users/joe/Documents/GitHub/pentaryn`, or to the fork's `pentaryn` branch in
  `/Users/joe/Documents/GitHub/foundry-vtt-mcp`. Every live workflow takes it. Code lanes never
  commit to main; they merge main into their own branch. `OB-m` (§6) takes MAIN alone.

A lock is a record, not a flag: `{lane, run_id, since, lease_until}`. It is **set by the main
session before the launch call** and cleared when the workflow's notification arrives **or** when
the leak rule (§3) fires. A lock without a live run behind it is a leak, never a reason to wait.

## 2. Lane order (the DAG)

| # | Lane | Kind | Starts when (all terminal = green, parked or skipped) | Ends with |
|---|---|---|---|---|
| B | module bundles go-live (`weyzkxnk1`) | live | running now | bundles merged to main, a confirmed bundled snapshot, pushed, **Foundry up** |
| W3c | wave 3 code (`wtxy9sows`) | code | running now | `migrate/wave-3` pushed, report + live plan |
| W4c | wave 4 code: riders, aoe, transform, combat (+ D7 tooltip wiring) | code | W3c terminal | `migrate/wave-4` pushed, report + live plan |
| W3L | wave 3 live, folding in `fix/optional-2026-10-11` (pentaryn + fork) | live | W3c green **and** B terminal | wave 3 + optional fixes on main, deployed, checked, pushed |
| OPT | `fix/optional-2026-10-11` alone (pentaryn + fork) | live | W3c **parked** and B terminal (only then; W3L carries it otherwise) | optional fixes on main, deployed, pushed |
| W5c | wave 5 code: the Wave 7 restart batch (module.json edits, lang, styles), strict gates | code | W4c terminal **and** W4L terminal (so main is final before the batch is cut) | `migrate/wave-5` pushed, live plan |
| W4L | wave 4 live | live | W4c green **and** W3L terminal (or OPT terminal when W3c parked) | wave 4 on main, deployed, checked, pushed |
| W5L | wave 5 live: one restart for the batch, then strict gates on | live | W5c green | everything on main, every module loads, pushed |
| FX-L | the fixes lane's own live run (only if items are left and no live lane is still pending) | live | W5L terminal, PT pending | fixes on main, deployed, pushed |
| PT | play test | live | B, W3L/OPT, W4L, W5L, FX-L all terminal — **never skipped**: it tests whatever is deployed | findings fixed, record |
| OB-c | old-branch triage, code only (worktree) | code | any time after W3c terminal | per-branch verdict + prepared branches `ob/<name>` |
| OB-m | old-branch merge step (main checkout, MAIN lock only) | main | OB-c green **and** no live lane running or pending (so main never moves under a live lane) | merged or recorded |
| FX | fixes collection: no-downside bugs and hardening found along the way | code | continuous; each live lane reads `fx_items` and ships what is green | fixed, shipped in the next live lane or FX-L |

Rules that keep the DAG honest:

- **W4c branches from `main`**, not from `migrate/wave-3`, and never merges `migrate/wave-3`
  directly. If wave 4 needs something that is only on `migrate/wave-3`, W4c records it; the
  dependent-on-parked rule (§3) then decides.
- Before any live lane merges its branch into main it merges main into the branch first (main
  moves: B, W3L, W4L all land on it) and re-runs every gate after that merge.
- **No cycles:** FX never creates a new lane except FX-L, which runs at most once before PT. PT
  fixes its own bugs inline (§7); nothing after PT re-opens a lane.
- Nothing is ever launched for a lane in `green`, `parked` or `skipped`.

## 3. Lane states and transitions (the state machine)

States: `pending` → `running` → `green` | `parked` | `skipped`. `running` also covers `stopped`
(a workflow returned not-green and the orchestrator has not yet relaunched or parked).

Per lane in `chain-state.json`: `state`, `run_id`, `launch_token`, `launched_at`, `lease_until`,
`attempts`, `infra_relaunches`, `note`, and for live lanes `heartbeat` (a file the lane's agents
`touch` at every step: `scratchpad/heartbeat-<lane>`).

| From | Event | To | Action |
|---|---|---|---|
| pending | prerequisites terminal and launch allowed (§4) | running | write `running` + new `launch_token` + `launched_at` + `lease_until` **first**, set the lock(s), then launch; write `run_id` when it returns |
| pending | a prerequisite is **parked** | see the dependent-on-parked rule below | — |
| running | notification: green | green | clear the lock(s); append the lane's FX items; log |
| running | notification: not green / `stopped` | running (attempt +1) | read the journal; launch a fix workflow or a narrower one (`resumeFromRunId` for code lanes; live lanes relaunch with a **reality check** first, see §5); attempts > 3 → parked |
| running | workflow dies / API error / rate limit (no result) | running (infra_relaunches +1) | relaunch at the **next cron tick** (30 min back-off), `resumeFromRunId`; infra_relaunches > 6 → parked |
| running | launch returned an error within 2 min and no step ran (script error) | running | the orchestrator fixes its own script once and relaunches; a second immediate failure → parked |
| running | `lease_until` passed **and** heartbeat older than 45 min **and** no notification | running (treated as stopped) | the run is dead: clear the lock(s), relaunch per the not-green row (counts as an attempt) |
| running | `lease_until` passed but heartbeat fresh | running | extend the lease by 1 h; log it; never kill a lane that is still working |
| running | after compaction the session has no memory of the run | running | the state file is the truth: if `run_id` is set, wait for its notification or the lease; if `run_id` is empty and `launched_at` > 5 min ago, the launch never happened → back to pending |
| any | attempts exhausted, merge unresolvable, Infisical down, world unrecoverable by the ladder (§5) | parked | record cause in `note` + the morning report; branch left unmerged; **Foundry up on the last good state** (§5 exit invariant); continue |
| pending | dependent-on-parked rule says skip | skipped | record "skipped: <prerequisite> parked" |

**Dependent-on-parked rule.** When a prerequisite is `parked`, a dependent lane:

1. **Code lane** (W4c, W5c, OB-c): runs anyway, against `main` as it is. It merges nothing from
   the parked branch.
2. **Live lane:** `skipped` **only if** its branch contains any commit of the parked branch
   (`git merge-base --is-ancestor <parked tip> <branch>` is true) or its live plan names the
   parked lane's modules as required; otherwise it runs. W5c **re-scopes** instead: the restart
   batch includes only modules whose code is on main; a module parked in W3/W4 keeps its old
   `module.json`, its `_loc`/lang switch is dropped from the batch (never shipped alone — players
   would see raw keys), and its strict gate stays advisory. If W4L parks **after** W5c was cut,
   W5c is relaunched re-scoped (not an attempt).
3. **B parked:** W3L/OPT, W4L, W5L run as planned on the old backup code; the morning report
   says bundles is unmerged.
4. **PT** is never skipped; its inventory is "what is deployed", read from main's merge list and
   the deploy records.
5. **OB-m** runs when no live lane is running or pending, parked lanes included.

Lease lengths: code lanes 4 h; W3L/W4L/W5L/OPT/FX-L 3 h; B 4 h; PT 5 h; OB-c 2 h; OB-m 1 h.

## 4. The cron tick (idempotent)

Each tick reads this file and `chain-state.json`, then:

1. **Housekeeping:** `pgrep caffeinate || (caffeinate -dimsu -t 43200 &)` — the one running now
   (`-t 43200`, started 20:49) expires at **08:49**. Record the tick in `tick_log` (keep the last 20).
2. **Migrate the state file** if it is the old shape (`wave3_code` → `W3c`, `bundles_go_live` →
   `B`, `wave4_code` → `W4c`, drop `gated_on_joe`; set `live_owner` = `main_owner` = B since B is
   live and running; every other lane `pending`, `attempts` 0).
3. **Leak check** for `live_owner` and `main_owner`: no lane in `running` with that `run_id` → clear it.
   Lease passed → §3 lease rows.
4. **Mid-launch guard:** a lane in `running` with an empty `run_id` and `launched_at` < 5 min ago
   belongs to a tick that is still launching → do nothing for it this tick. > 5 min → `pending`.
5. **For every `pending` lane whose prerequisites are terminal**, in table order: code lanes may
   launch together; a live lane launches only when `live_owner` is null (then it takes both locks);
   OB-m only when `main_owner` is null and no live lane is running or pending. One live launch per
   tick at most.
6. **Players check** before a live launch: §5 step 1.
7. Write the state file after every change, before the next external call.

A tick never waits on anything; if nothing can launch, it ends. The 7-day cron expiry is fine.
The tick also runs after every workflow notification (the main session calls the same logic).

## 5. Every live lane, same shape

Exact commands (checked against the Makefile — there is no `foundry-restart`, and `make
foundry-sync` is the *actor* staging target, not module sync):

- restart = `make foundry-down && make foundry-up FROM=local` (`foundry-boot` with `FROM=local`
  never asks; also export `PENTARYN_NONINTERACTIVE=1` in every live workflow as a belt).
- module sync = `make foundry-<m>-sync` per changed module (never `walls`).
- backup = `make foundry-backup REASON=<why>` (refuses while Foundry runs — stop first).
- restore = `make foundry-restore SNAP=<name>` (Foundry stopped), **never** `FROM=latest`, never a
  `-boss` snapshot.
- **`make vtt-up` / `make vtt-down` are forbidden all night** — they bring the tunnel up / run the
  lock check and background upload. Substitute the pieces above wherever a plan says vtt-*.
- GM tab: `make login NO_OPEN=1 USER_NAME=Gamemaster WORLD=pentaryn` prints the URL; navigate
  the one controlled Chrome tab to it. Before that, close every other Foundry tab (two GM tabs
  kick each other and break the bridge).

Steps:

1. **Preconditions** (the lane re-checks them itself; the cron checked them before launch):
   - **Tunnel down** (`make vtt-status`). If it is up, `make tunnel-down`, record it, continue.
   - **Users:** `get-world-info` shows only the Gamemaster active. With the tunnel down nobody can
     connect from outside, so any other active user is either a stray tab of ours or a stale flag:
     close our tabs; if the same non-GM users are still "active" on the next tick (`players_online_since`
     ≥ 30 min), treat them as stale, continue, and the restart clears them. "Players online" can
     therefore block at most one tick.
   - **Upload queue** empty: `.pentaryn-tmp/` has no `*.job.json` and `make foundry-cloud` shows no
     `upload` line (it is empty now, 20:50). If not: Foundry down, `./.venv/bin/python -m
     scripts.foundry.cloud upload-pending` (blocking), continue.
   - **Branch:** main merged into the branch, all gates green; the branch touches no
     `foundry/logs/**` (if it does, drop those hunks on the branch first — the main checkout has
     tracked, locally modified log files, and a merge that touches them is refused).
   - **Heartbeat** touched; lease recorded.
2. **Before:** before-goldens on the deployed code; rollback copies of every module about to
   change and of the bridge (`.state/live-rollback/<lane>/`); **a local copy of `Data/worlds` +
   `Config`** (~45 MB, taken while Foundry is down at the restart, `rsync -a`) into
   `.state/live-rollback/<lane>/world/`. This copy is rung 1 of the restore ladder.
   **Copies taken in a fix round** (step 7) go to `.state/live-rollback/<lane>-fix/`, never into
   `<lane>/`: the fix round's re-sync would otherwise overwrite the pre-merge copies with the
   post-merge build (it happened in W3L: the `W3L/` copies of ties, senses and feedback had to be
   rebuilt from git). One `-fix/` folder per lane; a later round adds `-fix2/`, and so on.
3. **Merge:** merge the branch into main, no-ff, in the main checkout. Never `git stash`,
   `git reset --hard`, `git checkout -- .` or `git clean` in the main checkout (the modified
   `foundry/logs/*.jsonl` are the bridge's live logs).
4. **Deploy:** sync the changed modules; the fork build plus `kill -9` of the backend if the fork
   changed; a `module.json` / lang / styles change or a new module → restart; code-only → one GM
   tab reload. One GM tab. **Fork diff scope:** `npm run build:foundry` and the bridge-module copy
   run only when the fork diff touches `packages/foundry-module`; a server-side-only diff (e.g. a
   tool description) is `build:server` plus the backend `kill -9` alone (wave-4 live plan §4.3, W4L).
5. **Boot probe:** for every module (`game.pentaryn.<ns>.describe()` answers, console clean).
6. **Checks:** after-goldens plus diffs (only `[declared]` changes may differ); the wave's live
   checks; bridge parity if the fork changed. **Foundry 14.369 bug:** the first token change on
   a new scene is not persisted — on any new ZZ scene make one throwaway token change (or reload
   once) before asserting persistence; a "bug" that disappears on retry is this and is not a bug.
7. **Fix loop:** up to 3 rounds (test first, rollback copies into `.state/live-rollback/<lane>-fix/`
   (step 2), re-sync, re-check).
8. **Green:** push main (and the fork's `pentaryn` branch). Record in
   `merge-and-go-live-2026-10-11.md` (append a section; conflicts there are resolved by keeping both).
9. **Not green after the fix loop:** restore ladder, then park (§10).

**Exit invariant — every path, including park, crash recovery and B:** the lane ends with Foundry
**up**, the world loaded, one GM tab answering `get-world-info`, the heartbeat touched and the
locks released by the orchestrator. A lane that cannot satisfy it climbs the ladder:

**Restore ladder** (stop at the first rung that gives a loading world):

> Joe, 2026-10-11: before climbing the ladder, diagnose (§11 "Foundry won't start"). A rung used
> as a debugging step (to isolate the cause) is followed by a fix and a re-apply, not by a park.
> The ladder is the end state only when diagnosis found no fix.

1. the local `world/` copy from step 2 (`rsync` back with Foundry down) plus the module rollback
   copies and the old bridge folder (`kill -9` the backend);
2. the newest **`-mac`** cloud snapshot via `make foundry-restore SNAP=<name>` (bundled or full,
   whichever the code on main at that moment can read — old code never restores a bundled one);
3. revert that lane's merge on main (`git revert -m 1 <merge>`; agents may do this, Joe never
   commits — blueprint README §4 and bundles plan §11 both name it the last resort), rebuild /
   re-sync from main, restart;
4. if the world still does not load: Foundry **down**, record "world unrecoverable overnight" in
   the morning report, park every remaining live lane as `skipped` ("Foundry down"), let the code
   lanes and OB-c finish. This is the one outcome that leaves Foundry down, and it is recorded,
   not waited on.

A reverted merge is pushed only after the boot probe passes on the reverted state (then main is
green again). The park record names the revert SHA: re-merging that branch later requires
`git revert <revert-sha>` first, or git drops the branch's changes silently.

**Relaunch of a live lane** never trusts cached steps blindly: its first step is a reality check
(Foundry up? which modules' `.pentaryn-sync.json` stamps changed? which merges are on main? does
the GM tab answer?) and it continues from what is actually true, not from the journal.

## 6. B — the bundles go-live, overnight scope

Bundles plan §15 steps **A–D only**. Never E (BOSS is Joe's machine; "Mac boots local" stands)
and never F (`foundry-prune-untagged` is interactive and Joe's decision). Substitutions:

- §10 step 2 "`make vtt-down WAIT=1`" → `make foundry-down` then `make foundry-backup
  REASON=first-bundled` (blocking).
- §10 step 3 launch test "`make vtt-up` … `make vtt-down`" → `make foundry-up FROM=local`, open
  the world, a seafoot map, a Monster Manual entry, `make foundry-down`, `make foundry-backup
  REASON=launch-test` → must say world only, 0 new bundles.
- §10 step 0 "no upload queued": true now; if one appears, drain with `upload-pending`.
- **Before the first bundled backup**, besides the step-2 local `world/` copy, keep a local copy of
  `Data/modules` and `Data/systems/dnd5e` (`rsync -a`, ~3.6 GB, 554 GB free) in
  `.state/live-rollback/B/`. Reason: that backup **coalesces away the only full `-mac` snapshot**
  (`world-2026-10-11-212143-fvtt14.369-mac.tar.gz`); if the bundled restore path is wrong, the
  cloud no longer holds a full copy of today's world, and the local copy is the way back.
  Optional, no downside: server-side `rclone copyto` of that tar and its `.parent` into
  `onedrive:DnD/foundry/major-release/` (never pruned) before step 2.
- §15 step D (dress rehearsal restore of the Mac's own newest bundled snapshot) runs only with
  the local copies in place; on any failure, rung 1 of the ladder, not the cloud.
- B ends with `make foundry-up FROM=local` and the exit invariant, on every path. "Foundry stays
  down from step 2 to step 5" is true only inside B, never at B's end.
- B's Joe questions Q1–Q6 were built with defaults; the defaults stand tonight.
- B not green after 3 attempts: park with Foundry up on the pre-B modules, main unchanged (B
  merges only when green), the local copies kept; the morning report says so.

## 7. Play test (PT)

1. **Inventory:** every user-visible change deployed tonight and today (waves 1–5 as merged, the
   play-test fixes, the bug reporter, the bridge tools, rclone, bundles). Read it from main's
   merge commits and the go-live records, not from memory.
2. **Classify each item** as exactly one of:
   - **bridge-testable:** a deterministic API, data or state change that `pentaryn-read` /
     `pentaryn-write` / MCP tools can drive and observe end to end — test it that way;
   - **play-test:** anything whose value is in the UI, HUD, dialogs, player-side visibility,
     multi-user or timing — one at a time in a zz player tab plus the GM tab;
   - **not testable tonight:** needs a real player, hardware, or Joe's judgement of "feel" —
     record it with the reason, no attempt.
   The test for the first two: "could a bridge assertion fail for the reason a player would
   complain about?" If no, it is a play-test item.
3. **Order:** big changes first (the ties split, prompts, combat, transform, riders, aoe, senses,
   the bundle restore), then random spot checks across the rest. Seeded sample (seed = the lane's
   `launch_token`), record the seed.
4. **Caps:** at most 40 items and the 5 h lease; items left are recorded as "not reached" (no
   silent cap). The lane ends itself when the cap is hit.
5. **Bugs:** a bug found gets a test first, then the fix, re-sync, a re-check and a record entry.
   Fix rounds per bug: 2; after that it is recorded. **Bug vs feature:** a bug is behaviour that
   contradicts the module's README, a golden, a `[declared]` line or a 5e rule; anything else is a
   feature → "Open for Joe". A known platform bug (14.369 first-token-change) is neither.
6. **Throwaway data only:** ZZ actors and scenes, never the real PCs or campaign scenes, all
   deleted afterwards (also on the park path).
7. PT never collides with a restart: it holds the LIVE lock, and inside PT a restart happens only
   between items, never while a player-tab step is open.

## 8. Old branches (OB) — OUT OF SCOPE (Joe, 2026-10-11)

Joe: the branches he meant are recent ones, "nothing older than a week". Checked 2026-10-11: the
only unmerged branches with commits in the last 7 days are `feature/module-bundles` (lane B),
`migrate/wave-3` (W3L) and `fix/optional-2026-10-11` (W3L / OPT) — all covered by their lanes.
Every other branch from the week is already on main. **OB-c and OB-m are `skipped`.** The older
branches (backup/local-main-2026-07-20, combat-grammar-cleanup, playtest-auto, review-context-fix,
tooling-update, origin/lore, origin/foundry-vtt-pipeline, origin/combat-command-grammar) are not
touched, merged, cherry-picked or deleted. Any NEW branch a lane creates tonight is merged by that
lane.

## 9. Definitions

- **Green:** every gate the lane names passes, goldens differ only in `[declared]` lines, boot
  probe clean, pushed.
- **No-downside hardening** (what FX may ship without asking): ≤ ~50 lines; adds a guard, an
  error code, a log line, a test, or a doc fix; changes **no** player- or GM-visible behaviour (so
  needs no `[declared]`); touches only the lane's modules or `scripts/foundry/live-goldens`; never
  `module.json`, settings defaults, data formats, the cloud layout, `cloud.py`, `storage.py`,
  `bundles.py`, `boot.py`, `uploadq.py`, the updater, secrets, the tunnel or Cloudflare; covered by
  a test that fails before and passes after. Anything else is a feature → "Open for Joe".
- **Bug found along the way:** behaviour contradicting a README, golden, `[declared]` line or
  rule, with a reproducing test. Fixed on `fix/overnight-2026-10-12` in the FX worktree.
- **Terminal state:** green, parked or skipped.

## 10. Hard rules (all lanes)

- **Mac boots local.** `FROM=local` always. The only restores allowed are inside B's acceptance
  test (§6) and the restore ladder (§5), both of the Mac's own snapshots or local copies.
- **Foundry access stays closed to outsiders.** Never `tunnel-up`, never `vtt-up`/`vtt-down`.
  The Saturday updater stays paused (`make vtt-update-status` says so; if not, `make vtt-update-pause`).
- **Foundry and game data:** exactly one GM tab; never Argon's files; never the real PCs (Caven,
  Marrith, Talo) or campaign scenes; walls stays off; `foundry-prune-untagged` never runs.
- **Secrets:** in Infisical; never print the rclone config; never write a secret anywhere.
- **Git:** commit small with `-- <paths>`; never commit `foundry/logs/**`; mark behaviour changes
  `[declared]`; push only green; never stash/reset/clean the main checkout; `git revert -m 1` of a
  merge is the last rung before "Foundry down", and its SHA goes in the park record.
- **Old branches:** never delete one; §8 is the policy.
- **Budget:** every workflow has its lease as a wall-clock cap and ends itself with a report when
  it is near; a lane may use at most ~60 agents per attempt; the orchestrator never waits past a
  lease. If the session's own context is nearly full, it writes the state file first and lets
  compaction happen — the next tick continues from the file.

## 11. Edge cases → next step (nothing waits for Joe)

| Situation | Next step |
|---|---|
| A workflow returns `stopped` or not green | §3 not-green row: journal → fix workflow / narrower workflow, ≤ 3 attempts; then park (record, branch unmerged, Foundry on the last good state, exit invariant) and continue with every lane the dependent-on-parked rule allows |
| A live regression that can't be fixed in 3 rounds | restore ladder rung 1 (rollback copies), then rung 3 (revert the merge), redeploy, verify the boot, park, continue |
| Foundry won't start or the world won't load | **Diagnose, then resolve (Joe, 2026-10-11).** (1) Light look first: Foundry's log (`~/Library/Application Support/FoundryVTT/Logs/`), the ops log, the console of the GM tab, what changed since the last good boot (which syncs, which merge). (2) One retry of `make foundry-down && make foundry-up FROM=local` (retry first is fine when the log is empty or the failure looks transient; then investigate). (3) No obvious lead → dig: bisect the lane's changes (restore one module's rollback copy at a time, or one sync at a time) until the cause is found; read that module's error; fix forward with a test, re-sync, restart. (4) A restore is a **debugging step to move forward**, not the outcome: restoring a rollback copy or snapshot is how you isolate the cause and get a working base; after it, fix the cause and re-apply the lane's change. Only when no fix is found after a real diagnosis (≥ 2 hypotheses tested and recorded) does the lane fall back to the ladder and park, with the diagnosis in the park record. |
| The bridge is broken after a fork build | old bridge folder back, rebuild the old fork commit, `kill -9` the backend, verify; park the fork part only |
| New MCP tools don't show in this session | the wrapper polls `tools/list_changed`; fallback `eval-js` / `game.pentaryn` directly; note for Joe's morning `/mcp` |
| "Players online" | §5 step 1: tunnel down ⇒ stale or ours; close our tabs; blocks at most one tick |
| Tunnel found up | `make tunnel-down`, record, continue |
| A merge conflict | resolve in the branch (code lane) with tests; never force; unresolvable → park the branch, record |
| A workflow agent dies, the API errors or rate-limits | relaunch at the next tick with `resumeFromRunId` (code) or a reality-check relaunch (live); `infra_relaunches` > 6 → park |
| A workflow script fails to parse or throws at launch | fix the script once, relaunch; second failure → park |
| `live_owner` / `main_owner` set with no running lane, or lease passed with a stale heartbeat | the leak rule: clear the lock, treat the lane as stopped |
| Two ticks could launch the same lane | the state file is written `running` + `launch_token` before the launch; a second tick sees `running` and does nothing; an empty `run_id` older than 5 min means the launch never happened |
| This session compacts | `chain-state.json` and this file are the truth; the cron prompt rereads both; running lanes are identified by `run_id` |
| A parked lane has dependents | the dependent-on-parked rule (§3): code lanes run, live lanes skip only if they contain the parked commits, W5c re-scopes, PT never skips |
| W4L parks after W5c was cut | W5c relaunched re-scoped to main (not an attempt) |
| B leaves Foundry down or coalesces the full snapshot | the exit invariant and B's local copies (§6) |
| Out of disk | clean `.pentaryn-tmp` staging and the scratch restore dirs, then retry |
| Infisical auth fails | the step can't run; park that lane; record "Joe: infisical login"; Foundry stays as it was (up if it was up) |
| B not green | fix workflows (≤ 3); then park with Foundry local and main unchanged; other lanes proceed |
| An old branch is stale or conflicts | §8 per-branch policy; merges only with green gates; otherwise the OB record |
| Play test finds a feature or a decision | "Open for Joe", continue |
| caffeinate expires (08:49) | every tick re-arms it (§4 step 1) |
| The Mac sleeps anyway | on wake the next tick runs the leak check and resumes |

## 12. Morning report (written by the last tick that finds every lane terminal)

Per lane: state, attempts, what landed on main (SHAs), what was deployed, what is parked and why,
the revert SHAs if any, Open-for-Joe items, OB per-branch verdicts, the PT seed and coverage,
whether the full `-mac` snapshot was coalesced and where the local copies are, and whether
Foundry is up. Appended to `merge-and-go-live-2026-10-11.md` as "§8 Overnight".

## 13. What was checked before the run (2026-10-11 20:55, read-only)

- Makefile: `foundry-up`/`foundry-down`/`foundry-boot`/`foundry-<m>-sync`/`foundry-backup`/
  `foundry-restore`/`foundry-cloud`/`tunnel-down`/`vtt-status`/`vtt-update-*` exist; **no**
  `foundry-restart`; `foundry-sync` is actor staging. `boot.py` with `FROM=local` or no TTY never
  asks. `foundry-bundles*` exist only on `feature/module-bundles`.
- Foundry and the MCP server are running; the tunnel is down; `.pentaryn-tmp/` is empty (no
  upload queued); `pentaryn-boot.json` is based on the full `-mac` snapshot of 21:21 UTC.
- `caffeinate -dimsu -t 43200` is running since 20:49 (expires 08:49).
- `git ls-remote` reaches both origins; local main is one docs commit ahead of `origin/main`.
- Worktrees: wave3, bundles, optfix, fixes, feedback, rclone, wave2; fork worktrees for optfix,
  wave2, wave3. The fork's `pentaryn` == its `migrate/wave-3`; `fix/optional` is 4 ahead there.
- Old branches: §8 table.
- The old `chain-state.json` has the retired `gated_on_joe` list and the old lane keys (§4 step 2).
