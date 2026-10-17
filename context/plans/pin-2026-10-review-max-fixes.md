---
title: Pentaryn Pins — code review (max) fix ledger
status: fixes applied 2026-10-17, uncommitted; review fixes synced and live-green (pins-live 15:33, S01-S18 pass); polish pass not synced
last_modified: 2026-10-17
tags: [foundry, module, plan, review, pentaryn-pins, pentaryn-portals, pentaryn-prompts, pentaryn-resume]
---

# Pentaryn Pins — code review (max) fix ledger

**Read this when:** you are doing the follow-up review of the 2026-10-17 `/code-review max` pass
over pentaryn-pins 0.1.0, pentaryn-portals 0.6.0, pentaryn-prompts 0.4.6, pentaryn-resume 0.1.1,
the live runner and the headless-GM hand-off, and want to know what happened to each finding.
**Not this file:** using pins → [`../foundry/pins.md`](../foundry/pins.md); the design →
[`pin-2026-10.md`](pin-2026-10.md).

This is history. One row per review id. Ids that were duplicates share one fix and point to it.
The verdicts are from the review's verify pass: CONFIRMED, PLAUSIBLE, REFUTED, or "—" where the
candidate never got a verdict. All module paths are under `foundry/module/`.

## State at the end of the pass

- **Not committed; synced and run live.** No `module.json` version was bumped (pins 0.1.0, portals
  0.6.0, prompts 0.4.6, resume 0.1.1). The fixes were synced and Foundry restarted after this pass.
- Gates, all green: node tests for pins (101), portals (282), prompts (325) and resume (29), with
  `FOUNDRY_APP_ROOT` set; `make foundry-{pins,portals,prompts,resume}-check`;
  `make foundry-conformance M=<each>` at 100 % (portals keeps warn-class C10 scene-adapter size,
  C36 card-app literal, C59 party batch); `make foundry-lib-check` (149); runner tests
  `automation/smoke/pins-live.test.mjs` (36); `make foundry-adjustments-check`; `make test`.
- **Live: green.** `automation/smoke/pins-live.mjs` ran on the synced fixes at 2026-10-17 15:33:
  S01-S18 pass, S19 skipped by design (bot offline), 0 failed, restore ok. (A later wrap-up wrongly
  wrote that S12 failed and S13-S18 were unverified: it read a stale `.state/pins-live.jsonl` from a
  run stopped at 13:34. Corrected in `pin-2026-10.md` and `../foundry/pins.md`. Since the polish pass the
  runner truncates `.state/pins-live.jsonl` at the start of each run and opens it with a run header, so a stale
  file can no longer pass for a new run.) The `reading 'controlled'` page errors on the no-canvas client come
  from wall-height 7.0.8, not pins.
- **Polish pass (below): working tree only.** Its module fixes (pins P1, P2, L4; portals T1) were not synced;
  they need `make foundry-pins-sync foundry-portals-sync` and a reload (no `module.json` change, so no restart).

## Behaviour changes to check live

1. Same-scene Teleport party now changes floor when the destination region is on exactly one
   level (A2-1).
2. Elevation is mapped whenever a token changes scene, even with the same level id (A2-5; a
   `[declared]` guard was flipped).
3. `teleportToken` `opts.scene` takes an exact scene name; a bare token id on two scenes is
   `AMBIGUOUS` without `opts.sceneId` (R1, C6).
4. A redirected or re-levelled view controls the pinned token only when the asked view named
   `controlledTokens` (E2/B4). An observer-only pin no longer sends `controlledTokens: []`.
5. The off-screen pan is core's `Token#panCanvas`, only for a drawn, uncontrolled token (R2).
6. Sheet badges redraw in place, never a full sheet render (F2).
7. Runner: exit 1 on a failed restore (stash kept), exit 2 `busy` lock, scenario cancellation on
   timeout, Ctrl-C restores (S1–S6). S17 now starts everyone on North (S7).
8. `headless-gm cookie` refuses fds 0–2, TCP sockets, terminals and regular files on `/dev/fd/N`
   (K1, A2-2).

## Ledger

### pentaryn-portals

| Id | Verdict | Status | Files | Guarded by |
|---|---|---|---|---|
| A2-1 | CONFIRMED | fixed: the same-scene Teleport party path uses the cross-scene arrival rule (the region's one floor, else the token's own level, else the initial level), mapped elevation, landing on that floor; a token on a deleted level goes to the initial level | `pentaryn-portals/scene-adapter.mjs` | `test/teleport-token.test.mjs` "review A2-1/L2 …", "review A2-1: … stranded on a deleted level" |
| L2 | — (dup A2-1/A2-5) | fixed: one `arrivals()` rule for both `carryTo` branches, `moveCompany` and same-scene Teleport party | `pentaryn-portals/scene-adapter.mjs` | covered by the A2-1/L2 test |
| A2-4 / C5 | CONFIRMED low | fixed: no-level same-scene `teleportToken` uses the token's level only when the scene still has it, else the initial level, else the first | `pentaryn-portals/api.mjs` | `teleport-token.test.mjs` "review A2-4 …" |
| A2-5 | PLAUSIBLE | fixed (cheap): elevation is mapped whenever the scene changes. v14 default level top is 4 grid units, so two `defaultLevel0000` levels can differ | `pentaryn-portals/scene-adapter.mjs` | `teleport-token.test.mjs` "review A2-5 …" (old guard flipped, `[declared]`) |
| L3 | PLAUSIBLE | fixed (cheap): Teleport party to a scene that already holds a mover's id warns `Notify.IdClash` and returns `{ moved: 0, cancelled: true }`; portal-hop follow leaves such a follower behind (`heldIds` read in the delete hook) | `pentaryn-portals/scene-adapter.mjs`, `party.mjs`, `lang/en.json` | `teleport-token.test.mjs` "review L3: …" (3 tests) |
| C6 | CONFIRMED | fixed: `teleportToken`'s ref is resolved by the module (`resolve: false`); a bare 16-character id held by more than one scene is `AMBIGUOUS` unless `opts.sceneId` is given. A uuid or document is never ambiguous | `pentaryn-portals/api.mjs`, `api-manifest.mjs`, `test/golden/describe.json` | `teleport-token.test.mjs` "review C6: …" |
| C7 | CONFIRMED | fixed: `flags.reads` adds `flags.dnd5e.originalActor` and `previousActorIds`; `adjustments.yml` `dnd5e-pins-transform-root` names pentaryn-portals, `foundry/lib/root-actor.mjs` and the vendored copy, check `make foundry-pins-check foundry-portals-check` | `pentaryn-portals/api-manifest.mjs`, `foundry/adjustments.yml`, `test/golden/describe.json` | `api.test.mjs` describe golden; `make foundry-adjustments-check` (markers present) |
| R1 (reuse) | CONFIRMED | fixed: `sceneOf` deleted; `opts.scene` goes through the kit's `resolveRef` (exact name works; a token uuid is `BAD_ARGS`) | `pentaryn-portals/api.mjs`, manifest, README, describe golden | `teleport-token.test.mjs` "review R1: opts.scene …" |
| R1 (earlier pass) | open item | fixed: a core test isolates `leaderOf`'s `rootActorId` branch | `pentaryn-portals/test/core.test.mjs` | "leaderOf: a summon naming a wild-shaped PC's ORIGINAL actor …" |
| R3 | CONFIRMED | fixed: `carryTo`, `moveCompany` and the same-scene paths share `arrivals()` / `moveOnScene()`; `displaceToLevel` folded into `displaceOptions` (a move with neither level nor elevation still gives exactly `{x,y,action}`) | `pentaryn-portals/scene-adapter.mjs`, `portals-core.mjs` | `teleport-token.test.mjs` "guard: displaceOptions …"; `party.test.mjs` goldens unchanged |
| R8 | CONFIRMED | fixed: `wallOnLevel` removed; landing uses core's `CanvasDocument#includedInLevel` | `pentaryn-portals/portals-core.mjs`, `scene-adapter.mjs` | `teleport-token.test.mjs` "landingPlaces { level } …"; `core.test.mjs` asserts `wallOnLevel` is gone |
| F3 | REFUTED | no change | — | — |
| L6 | — | skipped: `rootActorId` OR'd into three rules; an unlinked character leads via portal/teleportToken but follows in Teleport party. This is a policy choice for Joe, not a defect with a verdict | — | — |
| L7 | — | skipped: the API row name `teleportToken` equals core's RegionBehavior type literal. Renaming a published 0.6.0 method would break pins (`api:pentaryn-portals.teleportToken`) and bridge callers; the guard's exemption covers two exact sites only | — | `core.test.mjs` EXT-2 |

### pentaryn-pins

| Id | Verdict | Status | Files | Guarded by |
|---|---|---|---|---|
| M1 / E1 | CONFIRMED | fixed: `audit()` and `pin().audit` use `toPlain(…, { maxDepth: Infinity })`; `violations[].tokens[]` are intact | `pentaryn-pins/api.mjs`, `api-manifest.mjs` | `test/api.test.mjs` "audit: a form-only token is ok; …" |
| M2 / E3 / D5 / C3 | CONFIRMED | fixed: `inspect` ignores options (`as` included), so the root `game.pentaryn.inspect(ref, { kind })` works | `pentaryn-pins/api.mjs`, manifest, README | `api.test.mjs` "inspect through the root game.pentaryn.inspect …" |
| D4 / A1-4 | CONFIRMED | fixed: only a real uuid goes straight to its kind (`User.*` a user, else an actor); names and ids, dots included, are tried as a user first | `pentaryn-pins/api.mjs` | `api.test.mjs` "a name with a dot is a user first …" |
| D6 | PLAUSIBLE low | fixed (cheap): `pin` with `replace` reads the flags back; a vetoed write is `REFUSED`, a thrown one `INTERNAL`, and cleared pins are put back (`restored`) | `pentaryn-pins/api.mjs`, manifest, README | `api.test.mjs` "pin: a vetoed or failed write is REFUSED/INTERNAL …" (3 cases) |
| E2 / B4 | CONFIRMED | fixed: `followOptions()` sets `controlledTokens` to the pinned token (when this user owns it) on a redirect, a re-levelled pass and follow requests, only when the asked view named `controlledTokens` | `pentaryn-pins/follow.mjs` | `test/glue.test.mjs` "E2/B4 a redirected or re-levelled view …", "E2 a pull to another level …" |
| A1-3 / pins-delete-level | CONFIRMED | fixed: the `deleteToken` follow checks scene and level through `followNeeded` (incl. copy on L1, original on L2 deleted). Removed from pins.md Known gaps | `pentaryn-pins/follow.mjs`, `context/foundry/pins.md` | `glue.test.mjs` "A1-3 a move within the scene to another level …" |
| B1 | CONFIRMED | fixed: `target()` checks the token's level against `scene.levels` (`levelOn`); an orphan level id is followed by scene only, so there is no endless redraw. Documented in pins.md Known gaps | `pentaryn-pins/follow.mjs`, `context/foundry/pins.md` | `glue.test.mjs` "B1 a token on an orphan level …" |
| B2 | — | skipped: the Teleport Token transition is lost for pinned players. The only fix writes core's internal `canvas._viewOptions` mid-draw (timing-dependent). Kept as the "Region transition animation" Known gap in pins.md | — | — |
| B5 | REFUTED | no change (level changes are unanimated; stairs wait for the walk) | — | — |
| R2 (reuse) | CONFIRMED | fixed: `panIfOffScreen` calls core's `Token#panCanvas`, only for a drawn, uncontrolled token (core already pans a controlled one; no double `animatePan`) | `pentaryn-pins/follow.mjs` | `glue.test.mjs` "pinned player: a token moved by someone else pans through core's Token#panCanvas, once" |
| R2 (earlier pass) | open item | fixed: glue tests 7b and 8b restore `canvas.loading`, `F.autoDraw` and hung draws in `try/finally` (one failure no longer cascades) | `pentaryn-pins/test/glue.test.mjs` | the 7b/8b tests themselves |
| R4 | CONFIRMED | fixed in part: one `transformOf(actor)` reader for `rootOfToken` and `rootOfActor`. Not done: the `pins-core` `isId` copy. Core may import only core (blueprint C16) and the kit's `root-actor.mjs` does not export `isId`, so it needs a kit change | `pentaryn-pins/world-adapter.mjs` | `test/world-adapter.test.mjs` "rootOfActor and tokensOfRoot share …" |
| R5 | CONFIRMED | fixed in part: `tokensOfRoot` uses `tokensByRoots([rootId])`. Not done: `listOf` (its other copy is private inside the vendored `lib/resolve.mjs`, a kit change) and the `hopOf` copy | `pentaryn-pins/world-adapter.mjs` | `world-adapter.test.mjs` (`tokensOfRoot` equals `tokensByRoots`) |
| R6 | CONFIRMED | fixed in part: dead `menuElement` export removed. Not done: one menu widget shared with portals badges and look-menu, which is a kit-level change in `foundry/lib` | `pentaryn-pins/menu-ui.mjs` | suite green |
| F1 | CONFIRMED | fixed: `updateToken` returns for plain moves before the world walk unless someone else moved a drawn, uncontrolled token on the viewed scene | `pentaryn-pins/follow.mjs` | the R2 pan test and existing glue cases |
| F2 | CONFIRMED | fixed: a pin, rename, promotion, deletion or switch change redraws the badge in place (`decorate(app, app.element)`); no full `app.render()` of every open sheet | `pentaryn-pins/sheet.mjs` | `test/menu.test.mjs` "16 open sheets refresh their badge by themselves, in place (review F2 …)" asserts zero `render()` calls |
| F4 | PLAUSIBLE | fixed (cheap): the canvas menu's hit test runs only when GM, switch and token-layer gates pass | `pentaryn-pins/canvas-menu.mjs` | `menu.test.mjs` "17 refusals …" (no `placeables` walk with the switch off; fails without the fix) |
| F5 | PLAUSIBLE (negligible) | skipped: `inspect` walks the world twice. `followedToken` applies the switch/GM/level rules that `pickToken` does not, and merging them risks drift for a one-off diagnostic call | — | — |
| L1 | — | skipped: the menu re-derives core's right-click decision from DOM events. The better design wraps `TokenLayer#_onClickRight` or the stage MIM, which needs a new core patch, an adjustments entry and a fresh live check of what S-scenarios already cover | — | `menu.test.mjs` 17-series; pins-live S-scenarios |
| L4 | CONFIRMED low | skipped here, fixed in the polish pass (a `deleteLevel` mark, no patch). Original reason: "chosen" level is inferred as "not imposed", so core's deleted-level fallback (`level.mjs:104`) or a resume restore counts as the player's choice. Fixing it needs a new patch on `Level._onDeleteOperation` (manifest patch, adjustments row, live check). Low impact: the player lands on the initial level of the scene they are already on | — | — |
| L5 | — | skipped: resume is coupled to pins; the deeper fix (an imposed-view marker shared by both) is a design change | — | — |
| Kx | CONFIRMED | fixed: the plan's go-live §3.4 and the browser-acceptance doc now say **Pinning** (Configure Settings → Pentaryn Pins), the real label | `context/plans/pin-2026-10.md`, `context/plans/pin-2026-10-browser-acceptance.md` | — (doc) |

### Live runner (`automation/smoke/pins-live.mjs`)

| Id | Verdict | Status | Files | Guarded by |
|---|---|---|---|---|
| S1 / D2 | CONFIRMED | fixed: `withDeadline(work(signal))` aborts the signal on timeout; world, gmOp, gmPage, waits and sleeps check it; the runner waits up to 30 s for the scenario to stop; `out.pass` comes only from checks returned in time | `automation/smoke/pins-live.mjs` | `pins-live.test.mjs` "withDeadline cancels a timed-out scenario …" |
| S2 | CONFIRMED (SIGTERM part wrong) | fixed: puppeteer's own SIGINT/SIGTERM/SIGHUP handlers are off; the first signal stops after the current step and restores, a second exits 130 | `pins-live.mjs` | `pins-live.test.mjs` "withDeadline: a parent abort … cancels the child" |
| S3 | CONFIRMED | fixed: `opRestore` keeps the stash on `pinningError`; a failed restore in `--cleanup` keeps the stash scene and exits 1; a `--run` with a failed restore exits 1. Since the polish pass (H2, #8) this holds for the run's OWN stash only: a stopped run's stash never writes the switch, so `--cleanup` after a crash reports it and exits 0 | `pins-live.mjs` | `pins-live.test.mjs` "restoreSucceeded: a switch that could not be put back is a failure" |
| S4 | PLAUSIBLE | skipped here; superseded by the polish pass H2: the stash carries a run id and a stopped run's switch value is never written back (reported instead) | — | — |
| S5 | PLAUSIBLE | fixed: `acquireLock` takes an O_EXCL lock `.state/pins-live.lock` (pid only; a dead pid's lock is taken over); a second run is refused `busy`, exit 2 | `pins-live.mjs` | `pins-live.test.mjs` "acquireLock: one run at a time …" |
| S6 | CONFIRMED | fixed: `--timeout` limited to 30–86400 s | `pins-live.mjs` | `pins-live.test.mjs` parseArgs test (2147484 and MAX+1 refused) |
| S7 | CONFIRMED low | fixed for S17: everyone starts on North, so "B follows the activation to South" can fail. S06's "B stays on South" kept (not wrong, can't fail; a meaningful check needs a canvas-redraw probe checked live) | `pins-live.mjs` | `pins-live.test.mjs` "S17 starts B on North …" |
| R7 | CONFIRMED | fixed in part: Chrome lookup order now matches the watchdog (`CHROME_PATH`, then `PENTARYN_HEADLESS_CHROME`, then system installs). Not done: sharing `loadEnvFile`/`runHelper`/`launch`/`controlCall` with `automation/headless-gm/watchdog.mjs`, which has no exports and runs as the bot's systemd service; extracting a module needs a bot restart and live check | `pins-live.mjs` | runner suite green |
| D7 | REFUTED | no change | — | — |
| C2 | CONFIRMED | fixed: the node test title no longer names the package id `dice-so-nice` (now "the Dice So Nice overlay"), so the updater's exposure grep has no false positive | `automation/smoke/pins-live.test.mjs` | `scripts/tests/test_update_escalation.py::test_real_exposure_has_no_known_false_positives` |

### Headless GM hand-off (`scripts/foundry/ops/headless_gm.py`)

| Id | Verdict | Status | Files | Guarded by |
|---|---|---|---|---|
| K1 / A2-3 / B3 / C4 / D1 / S8 | CONFIRMED | fixed: `_claim_fd` refuses fds 0–2 (own stdio), so the session cookie and bot password never reach stdout or stderr | `scripts/foundry/ops/headless_gm.py` | `scripts/tests/test_headless_gm.py::test_fd_hand_off_refuses_own_stdio[0,1,2]` |
| A2-2 / D3 | CONFIRMED | fixed: `cookie()` claims `/dev/fd/N` before any network or Infisical call; only a FIFO or AF_UNIX socket is accepted (TCP sockets, terminals, regular files, closed fds refused); the fd is re-checked by st_dev/st_ino at write time; no double close | `headless_gm.py` | `test_headless_gm.py` `test_fd_hand_off_refuses_a_tcp_socket`, `…_to_a_pipe_and_an_af_unix_socketpair`, `…_refuses_a_closed_fd_and_a_regular_file`, `…_refuses_an_fd_replaced_after_the_claim` |
| L8 | — | no change: the file branch unlinks first and creates a 0600 file, so it never writes through a symlink (by design); `/proc/self/fd/N` fails at unlink with an OSError that `_hand_off` reports without the payload | — | — |

### Repo, docs and gates

| Id | Verdict | Status | Files | Guarded by |
|---|---|---|---|---|
| C1 | CONFIRMED | fixed: `make foundry-pins-check` added to `MAKE_CHECKS_PIN` | `scripts/tests/test_update_escalation.py` | `test_update_escalation.py::test_make_checks_pinned` |
| C1 follow-on | (found running the gate) | fixed: `test_make_targets` module_index rows failed under `make test` because the outer make's MAKELEVEL/MAKEFLAGS leaked into the nested make; `_index_run` drops them | `scripts/tests/test_make_targets.py` | `test_make_targets.py::test_foundry_module_index_*` |
| gate: mcp-fork route | (found running the gate) | fixed: `test_the_fork_has_a_use_doc_and_routes_to_it` failed on HEAD since 2f0715e1 routed CLAUDE.md through skills. The test now accepts the `mcp-fork` skill (`.claude/skills/mcp-fork/SKILL.md`) or a CLAUDE.md row. CLAUDE.md itself was not touched | `scripts/tests/test_foundry_ops.py` | the test itself |
| K2 | PLAUSIBLE | skipped: `pin-2026-10-browser-acceptance.md` stays in `context/plans` as the one-time go-live record (the repo keeps similar docs there). The doc now says so and points to pins.md for repeatable checks; the plan's go-live §4 links to it | `context/plans/pin-2026-10-browser-acceptance.md`, `pin-2026-10.md` | — |
| K3 | CONFIRMED | other session: `context/foundry/props.md` (world id and campaign state in a use-doc) belongs to another session's work and was not edited | — | — |
| K4 | PLAUSIBLE / stale part CONFIRMED | fixed: `context/pentaryn.md` drops "built, needs a restart … Not synced"; a "Pinning live (2026-10-17)" bullet says the four modules are synced and enabled, Pinning is ON and the six players are pinned (keep it so); live checks point to pins.md | `context/pentaryn.md` | — (doc) |
| docs | — | the pins README API rows for `pin` (REFUSED/INTERNAL, `restored`) and `inspect` (uuid rule, options ignored); pins.md runner exit codes, lock, cancellation and Ctrl-C; changelogs for pins and portals list the review fixes | `pentaryn-pins/README.md`, `pentaryn-pins/CHANGELOG.md`, `pentaryn-portals/CHANGELOG.md`, `context/foundry/pins.md` | — |
| D1 (follow-up) | — | fixed: the plan's Regression guard table, D5 and step 8 now state the deliberate portal-hop follow and `carryTo` changes (level/elevation, `preferLevel`, `heldIds`, `rootActorId`) with the test guarding each row | `context/plans/pin-2026-10.md` | — (doc) |
| D2 (follow-up, docs) | — | fixed: the false "S12 failed, S13-S18 unverified" statements corrected to the 15:33 result in the plan, `pins.md` and this ledger; the client-C `reading 'controlled'` errors traced to wall-height 7.0.8; pins.md exit codes now match `main()` (2 also covers bad args, a real player online, not seeded, a first Ctrl-C; 130 a second); the plan's pins-delete-level, S12-updateToken and R1 items closed, its "Wild-shaped druid's summons" gap marked fixed (finding 4) | `context/plans/pin-2026-10.md`, `context/foundry/pins.md`, this file | — (doc) |

## Polish pass (2026-10-17, after the live run)

A last pass over the open items and the repros that were still broken. Working tree only: nothing was
synced, committed or run live; no `module.json` version changed. Each item was checked against the code
before it was fixed.

| Item | Status | What changed | Files | Guarded by |
|---|---|---|---|---|
| P1 F-follow-ctl | fixed | `request(t, reason)` always builds `wantOf(t)` plus `followOptions(t)`: the same-scene level follow, the `actorId` transform, the pin change, switch-on and the settle/tick retry now name the pinned token in `controlledTokens` when the player owns it (observer-only pins still leave it out, so core's fallback can pan) | `pentaryn-pins/follow.mjs`, `test/glue.test.mjs`, CHANGELOG | `glue.test.mjs` "A1-3 …" (same-scene level follow) and 10, 11, 12, 13, 13c, 13d, updateUser, 20 via `ctl(level)` |
| P2 api.test isolation | fixed | the two tests that relied on an earlier test's portals stub call `installPortals()` themselves | `pentaryn-pins/test/api.test.mjs` | each test passes alone (`--test-name-pattern`) |
| H1 R-sighup | fixed | `STOP_SIGNALS = [SIGINT, SIGTERM, SIGHUP]`; puppeteer gets `PUPPETEER_SIGNAL_OPTIONS`; `installStopHandlers()` handles all three; stdout/stderr get no-op `error` listeners while a mode runs | `automation/smoke/pins-live.mjs` | `pins-live.test.mjs` "every signal puppeteer is told to leave alone …", "installStopHandlers: …" |
| H2 R2 | fixed | the stash carries a per-process `runId`; only the run that wrote it puts the switch back. A stale or pre-runId stash never writes the live switch (Joe's ON with 6 pinned stays ON): `pinningLeft` / `staleStash` and a stderr note instead. `opStash` replaces a stopped run's stash with the live value and keeps its real scene and GM resume view | `pins-live.mjs` | `pins-live.test.mjs` "opRestore: this run's own stash …", "… a stopped run's stash never writes the switch …", "opStash: …" (2) |
| H3 docs-runner-exit2 | fixed | one `exitCodeFor()`; the header has an Exit codes table (0, 1, 2 with every refusal code, 3, 130); a signal during the last scenario is `interrupted`, exit 2 | `pins-live.mjs`, `../foundry/pins.md` | `pins-live.test.mjs` "exitCodeFor: …", "the header documents every exit code …" |
| T1 A2-5-flying-clamp | fixed | `elevationOnLevel(…, srcClamp)`: a token outside its own floor's range (flying, burrowing, head through the ceiling) keeps its height above the base, unclamped; one inside its floor is mapped and clamped as before | `pentaryn-portals/portals-core.mjs`, `scene-adapter.mjs`, `api-manifest.mjs`, describe golden, README, CHANGELOG | `teleport-token.test.mjs` "review T1: …" (2); `core.test.mjs` 4 `elevationOnLevel` assertions |
| D1 R1 | fixed | the plan's Regression guard table states what changed on purpose in portal-hop follow and Teleport party, each row with its tests and live scenario | `pin-2026-10.md` | — (doc) |
| D2 | fixed | docs: the stale "S12 failed, S13-S18 unverified" claim corrected to the 15:33 result in the plan, pins.md and this file. Runner: `openRunLog()` truncates `.state/pins-live.jsonl` at the start of `--seed`/`--run`/`--cleanup` (after the lock, so a `busy` refusal never clobbers a live run's file) and writes a `{ run, mode, runId, pid, startedAt }` header | `pin-2026-10.md`, `../foundry/pins.md`, this file, `pins-live.mjs` | `pins-live.test.mjs` "openRunLog …" (2), "main: a run refused as busy leaves the live run's lines file alone" |
| #8 (S3) cleanup, pins disabled | fixed (by design + message) | under H2 a crashed run's stash never writes the switch, so `--cleanup` cannot fail on it and exits 0. What was wrong: with pentaryn-pins disabled the note printed "OFF" for an unreadable switch. `opRestore` now reads the STORED value from the world's Setting document (`pinsActive: false`), `pinningLeftMessage()` says the module is not active and names the stored value, and the cleanup summary's `stashKept` is true only when the stash scene really survived | `pins-live.mjs` | `pins-live.test.mjs` "opRestore (#8): pentaryn-pins disabled …", "pinningLeftMessage (#8): …" |
| #14 (C7) dnd5e bundle | fixed | `build_bundle` no longer drops the rows listed last whole: when the files overflow `BUNDLE_TOTAL_CAP` they share it (water-filling, `_fair_share`), each file over the share trimmed to the lines around its mentions (`_trim` narrows ±80 → 0 lines before cutting). `checks_for(files, rows)` also offers the make targets a row's `check` field names | `scripts/foundry/update/escalate.py` | `test_update_escalation.py` "…over_the_cap_trims_every_file…", "…trim_narrows…", "…fair_share…", "…checks_for_adds_the_rows_check_targets" |
| L4 deleted-level fallback | fixed | a `deleteLevel` hook marks the scene when the deleted level is the one viewed (and forgets a chosen level that was deleted); core's following `scene.view({ level: initial })` is then not the player's choice and goes to the token's level. Cleared at `canvasReady` (core's `unview` branch) and on uninstall. One hook, no patch, no adjustments row | `pentaryn-pins/follow.mjs`, hooks/describe goldens, `test/hooks.test.mjs`, README, CHANGELOG | `glue.test.mjs` "L4 the viewed level is deleted …" (fails without the fix) |

### Repros rerun

| Finding | Repro | Before | After |
|---|---|---|---|
| #8 (S3) | `verify-pins-stash/sim.polish.mjs` (the `sim.fixed.mjs` world plus a Setting-document store) | note "the Pinning switch is OFF and was LEFT as is" while the stored value was ON; `stashKept: true` after the stash scene was deleted | note "pentaryn-pins is not active … its stored value is ON; a stopped run's stash … recorded it OFF"; `pinningLeft { now: true, stashed: false, pinsActive: false }`; `stashKept: false`; switch untouched, exit 0 |
| #14 (C7) | `verify-c6c7l3/scripts/c7_bundle.py`, `c7_bundle2.py` | portals files `[]`, pins world-adapter absent, checks `[]`; 402331 chars, 26 files, 33 omitted | `pentaryn-portals/lib/root-actor.mjs` in, pins world-adapter in, checks `make foundry-pins-check`, `make foundry-portals-check`; 344343 chars, 59 files, none omitted |
| L4 | `d7check/l4real.hook.mjs` (`l4real.mjs` firing `deleteLevel` before core's fallback view, as client-backend.mjs:466/478 do) | "STILL-BROKEN: player left on levelB3000000001" | "FIXED: back on the token's level" (core views `[[B, { level: B2 }]]`) |

### Gates (polish pass, all green)

Node tests with `FOUNDRY_APP_ROOT` set: pins 102, portals 284, prompts 325, resume 29 (0 failed);
`make foundry-{pins,portals,prompts,resume}-check` and `make foundry-conformance M=<each>` at 100 % (portals
warn C10, C36, C59; prompts warn C10, C59); `make foundry-lib-check` 149; `make foundry-adjustments-check`;
`node --test automation/smoke/pins-live.test.mjs` 50; `make test` 2363 passed, 9 skipped, 4 xfailed.
