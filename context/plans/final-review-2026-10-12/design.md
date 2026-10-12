---
title: Final code review 2026-10-12 — the recurring sign-off process (design, nothing registered)
status: draft — Joe reviews before anything is registered
last_modified: 2026-10-12
tags: [plan, workflow, orchestration, review]
---

# Final code review — one area at a time, behaviour-preserving, 8 hours

**Read this when:** you are the main session (or a tick of the review cron) driving the final
code review, or you want to know why it is shaped this way. State lives in
`scratchpad/review-cron/review-state.json`; this file is the rules. Once Joe approves, copy this
file to `context/plans/final-review-2026-10-12/README.md` and point `review-state.json.plan` at it.

Written 2026-10-12 06:35 EDT against: the overnight plan (`context/plans/overnight-2026-10-11.md`,
whose lock/lease/launch-token patterns this reuses), `chain-state.json` (PT running, LIVE+MAIN held
until 09:49), the PT journal (21 of 40 items done, RD-1 in flight, 3 fix commits on main), the
blueprint (`context/foundry/addon-blueprint.md` §5.5, §5.9.4, §6, §9, §10), the Makefile, the
fork's `FORK.md`, and the real workflow scripts (`overnight-fx-l`, `pt.js`).

## 0. Joe's ask, and the four decisions that shape the design

> As areas pass and are fixed, once fully handed off, a 10-minute cron takes one area at a time and
> does the final code review: maintainability, robustness, extendability, edge cases. Not a world
> test (done), no behaviour change. Changes get a unit test for the edge case, or a behaviour-safe
> refactor validated by the existing tests. Knows whether the play test is running. 8 hours.

1. **Reviews are code lanes; only integration is a live lane.** A review runs in its own worktree
   off `origin/main`, never touches Foundry, the main checkout or the locks — so it is *safe* to
   run while PT holds LIVE and MAIN. The readiness rule (§2) is therefore about not wasting a
   review on code PT is about to change, not about safety. Everything that touches main or the
   live world happens in one **merge-window lane (INT)** that only runs when PT is terminal.
2. **Re-sync and reload only, never a restart.** A review may not touch `module.json`, `lang/`,
   goldens, `lib/` (vendored kit), settings defaults, flag names, data formats or the described API
   surface. So every merged review deploys as `make foundry-<m>-sync` + one GM-tab reload
   (blueprint §10), with a boot probe and a **live-goldens before/after diff that must be empty**
   (no `[declared]` allowed — this process declares nothing). Anything needing more is recorded
   for Joe, not done.
3. **Behaviour-preserving has a test.** The definition (§3.2) is strict and the verifier is
   independent: a change survives only if an adversarial pass cannot show it alters an observable
   result, a failure path, timing of a write, or an async guarantee. "If in doubt, record it."
4. **Nothing waits on a person or a notification.** Every transition is driven by files the tick
   re-reads: `review-state.json`, `chain-state.json`, the PT journal, `git log`, per-area result
   files written by the workflow's last agent (`results/<area>.json`), heartbeats. A workflow
   notification is a fast path, never the only path.

## 1. Areas (the unit of review) and the order

One area = a disjoint set of paths with one gate command. 33 areas (32 + the optional updater); `order` is the priority the
tick uses when more areas are ready than slots are free (big and risky first, then shared code,
then the small modules). Sub-areas of one module never run at the same time (§5).

| # | Area | Kind | Paths (relative to the repo) | Gate | PT tokens |
|---|---|---|---|---|---|
| 1 | ties-core | module ties | `pentaryn-ties.mjs ties-core.mjs ties-api.mjs api.mjs api-manifest.mjs ties-adapter.mjs settings.mjs relay.mjs socket-adapter.mjs conduit.mjs core/** attributes.mjs facts.mjs known-core.mjs known-data.mjs item-marks.mjs` | `make foundry-ties-check` | ties |
| 2 | ties-study | module ties | `study.mjs study/**` | same | ties |
| 3 | ties-ui | module ties | `attributes-ui.mjs authoring-ui.mjs known-ui.mjs lore-ui.mjs review-ui.mjs look-app.mjs look-menu.mjs preview-app.mjs describe-dialog.mjs tie-dialog.mjs editor.mjs overlay.mjs popups.mjs sheet.mjs token-hud.mjs worn.mjs styles/ties.css` | same | ties |
| 4 | combat-core | module combat | `combat.mjs combat-core.mjs api.mjs api-manifest.mjs context.mjs core/** counting.mjs sequence.mjs shapes.mjs strip.mjs turn-riders.mjs offhand.mjs patches.mjs settings.mjs dialog-adapter.mjs roll-dock.mjs` | `make foundry-combat-check` | combat |
| 5 | combat-hud | module combat | `hud.mjs hud/** turnflow/** argon.mjs styles/combat.css` | same | combat |
| 6 | prompts-core | module prompts | `prompts.mjs prompts-core.mjs api.mjs api-manifest.mjs core/** build-core.mjs npc-core.mjs readback-core.mjs geometry-core.mjs typeahead-core.mjs cache.mjs gather.mjs replace.mjs placement.mjs settings.mjs patches.mjs marker-guard.mjs` | `make foundry-prompts-check` | prompts |
| 7 | prompts-adapters | module prompts | `*-adapter.mjs dialog.mjs panels.mjs hud-button.mjs tip-ui.mjs tooltip.mjs typeahead.mjs styles/prompts.css templates/**` | same | prompts |
| 8 | transform-core | module transform | `transform.mjs transform-core.mjs api.mjs api-manifest.mjs core/** wildshape.mjs starry.mjs bodyswap.mjs sweep.mjs settings.mjs patches.mjs wiring.mjs` | `make foundry-transform-check` | transform |
| 9 | transform-ui | module transform | `hud.mjs hud-panels.mjs form-picker.mjs starry-dialog.mjs *-adapter.mjs argon.mjs styles/transform.css` | same | transform |
| 10 | riders | module | `foundry/module/pentaryn-riders/**` | `make foundry-riders-check` | riders |
| 11 | aoe | module | `foundry/module/pentaryn-aoe/**` | `make foundry-aoe-check` | aoe |
| 12 | senses | module | `foundry/module/pentaryn-senses/**` | `make foundry-senses-check` | senses |
| 13 | kit | kit | `foundry/lib/**` (tests only by default, §3.4) | `make foundry-lib-check` (+ `foundry-modules-check` if source changed) | — |
| 14 | fork | fork | `packages/mcp-server/src/fork/** packages/foundry-module/src/fork/**` in `/Users/joe/Documents/GitHub/foundry-vtt-mcp` | `npm run typecheck`, `npm test -w packages/mcp-server -- --run`, `npm test -w packages/foundry-module -- --run`, `scripts/fork-footprint.sh` | mcp-fork |
| 15 | py-cloud | python | `scripts/foundry/{cloud,storage,bundles,boot,bootstate,uploadq,host}.py` + their tests in `scripts/tests/` | `make test` | ops/bundles |
| 16 | py-ops | python | `scripts/foundry/ops/**` + `scripts/tests/test_foundry_ops.py test_module_*.py test_evallog.py test_bridge_orphans.py test_make_targets.py test_role_gates.py` | `make test`, `make foundry-modules-check` (it is the gate runner) | ops |
| 17 | py-blueprint | python | `scripts/foundry/blueprint/**` | `make test`, `make foundry-modules-check` | — |
| 18 | py-mcp | python | `scripts/mcp/server.py scripts/tests/test_dnd_scripts_contracts.py test_server_discovery.py test_actions_contract.py` | `make test` | — |
| 19 | attunement | module | `foundry/module/pentaryn-attunement/**` | `make foundry-attunement-check` | attunement |
| 20 | portals | module | `foundry/module/pentaryn-portals/**` | … | portals |
| 21 | feedback | module | `foundry/module/pentaryn-feedback/**` | … | feedback |
| 22 | dropbin | module | `foundry/module/pentaryn-dropbin/**` | … | dropbin |
| 23 | journal | module | `foundry/module/pentaryn-journal/**` | … | journal |
| 24 | creatures | module | `foundry/module/pentaryn-creatures/**` | … | creatures |
| 25 | lookup | module | `foundry/module/pentaryn-lookup/**` | … | lookup |
| 26 | movement | module | `foundry/module/pentaryn-movement/**` | … | movement |
| 27 | pings | module | `foundry/module/pentaryn-pings/**` | … | pings |
| 28 | names | module | `foundry/module/pentaryn-names/**` | … | names |
| 29 | cursors | module | `foundry/module/pentaryn-cursors/** scripts/foundry/cursors/**` | … | cursors |
| 30 | importer | module | `foundry/module/pentaryn-importer/**` | … | importer |
| 31 | walls | module | `foundry/module/pentaryn-walls/**` (off in the world; wasm untouched) | `make foundry-walls-check` | walls |
| 32 | live-goldens | tooling | `scripts/foundry/live-goldens/**` + `scripts/tests/test_live_golden*.py` | `make test` | — |
| 33 | py-update | python, **optional** | `scripts/foundry/update/**` + `scripts/tests/test_update_*.py` | `make test` | — |

Sub-area paths are relative to the module folder; `test/**` of a module belongs to every sub-area
of that module (new tests go in `test/review-<area>.test.mjs`; existing test files may be edited).
`py-update` (the paused Saturday updater) is **optional**: launched only when every other area is
terminal and the deadline is more than 90 min away. Out of scope on purpose: vault tooling
(`scripts/lore.py`, `srd5_2.py`, `timeline_svg/`, `research_curve.py`), the Makefile, Cloudflare,
the updater's launchd side, Argon, `foundry/build/`.

## 2. Readiness — "fully handed off"

An area is **ready** when all of these hold (the tick computes it from files, every tick):

1. `state == pending` (or `reopened`, §6).
2. **PT clear**, one of:
   - PT is terminal (`chain-state.json` → `lanes.PT.state ∈ {green, parked, skipped}`), or
   - **journal rule:** every item in the PT run list (`order[0:40]` of the inventory row in the PT
     journal) whose `module` field maps to this area (table §1, "PT tokens"; `ops/bundles` →
     py-cloud, `ops` → py-ops, `mcp-fork*` → fork, `senses/creatures` → both, `combat/transform/riders`
     → all three; `all (…)` maps to nothing) has a `result` row. A `started` row without its
     `result` is in flight → not clear. Items outside the run list (not reached, not testable)
     never run and never block.
   - **and the git rule:** every commit on `main` since PT's `launched_at` that touches the area's
     paths appears in the `commits` array of some PT `result` row. A commit no result accounts for
     is an in-flight fix (PT fixed senses while testing a transform item tonight: `8130c2b2` under
     TF-2) → not clear. Timestamp-free on purpose: journal rows carry no time.
3. **Module exclusion:** no running review has the same `module` (ties-core / ties-study / ties-ui
   run one after another, never together: one worktree per area, shared `test/` and goldens).
4. **Kit exclusion:** only if `kit_source_changes` is true (§3.4): the kit runs with no module
   review in flight, and no module review starts while it runs.
5. **Deadline:** `now + 100 min ≤ deadline` (a review needs ~50–70 min; the lease is 100).
6. **Not reopened twice** (§6).

Areas PT never touches (walls, names, pings, movement, importer, kit, py-blueprint, py-mcp,
live-goldens) are ready at once. Right now (06:35) **14 areas are ready** and **18 are PT-blocked**
(`review-state.json` lists each with its blocking items).

## 3. The review workflow for one area (`review-area.js`)

`args = {area, module, kind, paths, worktree, branch, gate, base_ref, pt_running, now_iso,
lease_until, deadline_iso, kit_source_changes, verify_model, heartbeat, result_file, record_file}`.
Each agent `touch`es `heartbeat` at start and after each step. Models follow Joe's tiers: Opus
builds and reviews (finders, triage, apply), Sonnet verifies (gates, adversarial verify at `xhigh`),
effort set per step.

| Phase | Agents | What |
|---|---|---|
| Prepare | 1 (sonnet, low) | `git fetch origin`; `git worktree add <worktree> -b <branch> origin/main` (fork: off `origin/pentaryn`, then `npm ci`); record `base_sha`; run the gate once → **baseline must be green**, else return `baseline_red` (the tick parks the area as NEEDS-JOE: main is red under this area, which no review may paper over). |
| Find | 6 in parallel (opus, high), read-only | One finder per lens: **maintainability** (duplication, dead code, naming, module boundaries, README/code drift), **robustness** (null/undefined paths, error codes vs throws, `codedError` use, logging via the kit), **extendability** (hard-coded lists that should be tables, adapters vs core purity, manifest rows), **edge cases** (empty/one/many, unlinked tokens, synthetic actors, deleted docs mid-await, missing flags, two tabs on the GM account, player vs GM client), **async/concurrency** (blueprint §5.9.4 checklist line by line: sync `pre*` listeners, one-client reactions with `isActiveGM`/claims, batch writes, `serialStore` per key, query `timeout`, idempotent relayed writes, hot hooks deferred, `app.element` after render), **performance** (§5.5: per-frame work, caches, debounce/coalesce, O(n²) over tokens/items, repeated `game.actors.get` in loops). Each finding: `{id, file, line, lens, severity, kind ∈ {edge-fix, refactor, behaviour-change, note}, claim, evidence, proposal, test_idea}`. Barrier here is justified: triage needs the whole set to dedup and rank. |
| Triage | 1 (opus, high) | Dedup; classify each finding exactly once: **DO-EDGE** (test first, §3.2 passes), **DO-REFACTOR** (pure, existing tests + goldens prove it), **RECORD** (behaviour change, manifest/lang/golden/kit/API change, or anything a 5e rule or README decides), **DROP** (wrong or not worth it). Order DO items by value ÷ blast radius; cap at 10; forbid the untouchables (§3.3). |
| Apply | sequential loop, 1 agent per DO item (opus, high) | One worktree → never parallel. DO-EDGE: write the failing test (`node --test test/<file>` red), fix, green, commit `-- <paths>` as `fix(<m>): <what> (edge case, behaviour-preserving)`. DO-REFACTOR: refactor, `node test/run.mjs` green, **goldens byte-identical** (`git diff --quiet origin/main -- '**/golden/**'`), commit as `refactor(<m>): …`. Can't finish cleanly in its budget → `git checkout -- <files>` *in the worktree* and record `abandoned`. |
| Gate | 1 (sonnet, low) | The area's gate (strict), `make foundry-lib-check` if the kit, `make check-context`; the diff vs `origin/main` touches only `paths` + the module's `test/**` + the record file; no `module.json`, `lang/`, `golden/`, `lib/`, `CHANGELOG.md` hunks; goldens byte-identical. Red → return the failing step (the tick counts an attempt). |
| Verify | 1 per commit in parallel (sonnet, xhigh), read-only, then 1 applier (opus, medium) | Each verifier is told to **refute**: "prove this commit changes an observable result, a failure path, the order or count of document writes, a hook's veto, timing, or an async guarantee; or that its test does not pin the edge case it claims." Verdict `keep` / `revert` with the reason. The applier `git revert`s every `revert` on the branch, re-runs the gate once. A commit reverted is recorded as RECORD (the finding stands, the change did not survive). |
| Sign-off | 1 (opus, medium) | Writes `context/plans/final-review-2026-10-12/<area>.md` (frontmatter, Read-this-when, verdict, findings table by lens, changes with commit SHAs and the test that pins each, RECORD list for Joe, verify results, gate output summary), commits it, `git push -u origin <branch>`, writes `results/<area>.json` (the structured return, same object), returns it. |

Return: `{ok, area, verdict, branch, base_sha, head_sha, commits[], changed_paths[], deploy:
{modules[], fork, python}, needs_restart:false, record_for_joe[], notes}`.

**Verdicts** (all three are *green* for the orchestrator — the branch merges; `ok:false` is the
only not-green): **SIGNED-OFF** (nothing left open); **SIGNED-OFF-WITH-NOTES** (RECORD items exist
but none is a defect); **NEEDS-JOE** (the reviewer believes a real defect exists whose fix would
change behaviour — the branch still merges what was safe; the defect is the first line of the
record).

### 3.2 What "behaviour-preserving" means here (the one judgment call)

Blueprint §9: a change a player or GM could notice, **or that changes a failure path**, is
declared — and this process declares nothing. So:

- **DO-EDGE is allowed** only when the code already *promises* the behaviour (README, `describe()`,
  a golden, a `[declared]` line, a test name) and a specific input breaks that promise today
  (TypeError on a null actor, an unhandled rejection, a double-fire with two GM tabs, a race on
  `await`), **and** the fix does not change any golden byte, any documented message or code, or
  what a user sees on the happy path. The test is the proof: it fails on `origin/main` and passes
  after.
- **A crash that becomes a clean `codedError` is a failure-path change** → RECORD, not DO (the
  verifier is told exactly this).
- **DO-REFACTOR** must leave `node test/run.mjs`, every golden and `describe()` byte-identical,
  and must not reorder or re-count document writes, hook registrations or query handlers.
- If a finder and the verifier disagree, the verifier wins and the change is reverted.

### 3.3 Untouchables (hard, checked by the Gate step)

`module.json`, `lang/*.json`, `test/golden/**`, `lib/**` (vendored kit), `CHANGELOG.md`,
`README.md` except a Pitfalls/Extending line that documents a finding, settings defaults and keys,
flag scopes and keys, `api-manifest.mjs` rows, CSS selectors other packages' DOM, Argon files,
anything in `foundry/logs/**`, the Makefile, `scripts/foundry/blueprint/exceptions.json` (no new
rows — a red rule is a finding, not an exception), secrets, anything outside `paths`.

### 3.4 The kit is findings-and-tests only by default

A kit source change re-vendors into 19 modules (`make foundry-lib-vendor`), changes every
module's `lib/`, and means re-syncing every module live. That blast radius is Joe's call, so
`kit_source_changes: false` in `review-state.json`: the kit review may add tests under
`foundry/lib/test/`, and every source finding is RECORD. If Joe flips it to true, the kit area
becomes exclusive (§2.4), re-vendors in its own branch, and runs `make foundry-modules-check`.

## 4. Integration and deploy — the merge-window lane (`integrate.js`)

**Chosen: a merge-window lane that batches after PT, re-sync + reload only.** Why not the others:
batching alone with no live step would leave main ahead of the world (the exact state the
overnight plan forbids: main never moves under a live lane, and nothing is pushed unverified);
"re-sync only" without a window would collide with PT, which holds LIVE and MAIN and re-syncs the
modules it fixes. A window that takes both locks, exactly like W3L/W4L/FX-L did, is the pattern
that already works tonight.

INT launches when **all** hold: PT terminal; `live_owner` and `main_owner` null in
`chain-state.json`; no INT running; and a batch is worth a reload: ≥ 3 green-unmerged areas, or
the oldest green-unmerged is > 45 min old, or the stop window (§7) has begun and ≥ 1 is waiting.
INT registers itself in `chain-state.json` (`lanes.INT` running + both locks with its `run_id`) so
the overnight cron's leak rule sees a live run behind the locks, not a leak. Lease 60 min.

| Phase | What |
|---|---|
| Preflight | Reality check (overnight §5 step 1): tunnel down; only the Gamemaster active (stale non-GM users are the §5 rule — block at most one tick); upload queue empty; **Foundry up** (down → one `make foundry-up FROM=local`; still down → return not-green, nothing merged; the tick parks INT with "Foundry down — Joe" and reviews continue as code lanes); PT terminal re-read from the file; deployed `.pentaryn-sync.json` stamps noted. |
| Merge | Per area in batch order: in the review worktree `git merge origin/main` (resolve, re-run the area's gate; a conflict that can't be resolved cleanly → that area **parked** `merge-conflict`, skip); then in the main checkout `git merge --no-ff review/<area>` (never stash/reset/clean there; the merge touches no `foundry/logs/**` because reviews never do). |
| Gates on main | `make foundry-modules-check` (strict, every module), `make foundry-lib-check`, `make test`, `make check-context`, fork: its four gates. Red → `git revert -m 1` the last area's merge, re-run; repeat until green (each reverted area parks as `gates-red-on-main` with the revert SHA in its record). |
| Deploy | Before-goldens (`scripts/foundry/live-goldens/<m>.js`) for every module in the batch that has one; rollback copies to `.state/live-rollback/INT-<tag>/`; `make foundry-<m>-sync` per module; fork: `npm run build:server` + `kill -9` the backend if `packages/mcp-server` changed, `npm run build:foundry` + the bridge-module copy if `packages/foundry-module` changed (per `context/foundry/mcp-fork.md`); **one GM-tab reload, never a restart** (no `module.json` changed — the Gate step guarantees it); boot probe per synced module: `game.pentaryn.<ns>.describe().version === module.json`, every described path a function, `selftest().ok` where present, console clean; after-goldens; **diff must be empty** — no `--declared` allowlist. Any failure: fix = `git revert -m 1` that area's merge, re-sync that module, re-probe (a behaviour-preserving change never needs a forward fix — the revert is the fix); ≤ 2 rounds; the Foundry-won't-load path is overnight §11 (diagnose, one retry, bisect by module, rung 1 copies), and INT ends with the exit invariant: Foundry up, one GM tab answering. Python areas deploy by being on main (nothing to sync; `server.py` changes take effect at the next MCP server restart — noted for Joe). |
| Record | Push main (and the fork's `pentaryn` branch) only when green; append the batch to `context/plans/final-review-2026-10-12/README.md` §Integration (areas, merge SHAs, synced modules, probe results, reverts); `git worktree remove` each merged area's worktree (branches kept); write `results/INT-<tag>.json`; return. |

## 5. Concurrency, launch, leases

- **Slots:** `max_running = 3` while PT runs (PT is itself fanning agents), `4` after. One review
  fans out ~6 finders + the verifiers, so 4 reviews ≈ 25–30 concurrent agents at peak. A tick
  fills every free slot in `order`, writing state before each launch.
- **Idempotent launch** (overnight §4 step 4 / §11): the tick writes `state: running`, a fresh
  `launch_token` (`<area>-<attempt>`), `launched_at`, `lease_until`, `worktree`, `branch` **before**
  calling `Workflow`, and `run_id` when the call returns. A second tick sees `running` and does
  nothing. `run_id` empty and `launched_at` > 5 min ago → the launch never happened → `pending`.
- **Leases and heartbeats:** review lease 100 min; INT 60 min. A running area whose lease has
  passed with a heartbeat older than 30 min and no result file → dead: `attempts + 1`, relaunch with
  `resumeFromRunId` (cached prefix replays; the worktree is reused — the Prepare agent skips
  creation when it exists). Lease passed but heartbeat fresh → extend by 45 min, log it.
- **Not green** (gate red, verify applier failed, agent died with `ok:false`): `attempts + 1`;
  relaunch the same script with `resumeFromRunId` (the cached Find/Triage replay, Apply re-runs on
  the existing branch); `attempts ≥ 2` → **parked** with the reason; the branch stays pushed if it
  was; the record file, if written, says PARKED.
- **Results without notifications:** the Sign-off agent writes `results/<area>.json` as its last
  act; the tick reads it even if the main session never saw the completion message (compaction).
- **Two crons, one session:** the overnight cron (30 min) and this one (10 min) only run while
  the session is idle, so `chain-state.json` is never written concurrently. This cron writes to
  `chain-state.json` only `lanes.INT`, `live_owner`, `main_owner`, and (last resort) the PT leak
  rule below; everything else lives in `review-state.json`.

## 6. Re-open: PT (or anything) changes code in a reviewed area

Every tick, for each area in `green` (signed off, unmerged) or `merged`: `git log <base_sha>..origin/main -- <paths>` excluding this process's own merge commits.

- `green` and main moved under it → nothing now; INT's Merge phase merges main into the branch
  and re-runs the gate (a conflict parks it). The record gets a "main moved: <SHAs>" line.
- `merged` and main moved under it (PT fixed something after the review, or Joe did) →
  `reopened` (`reopen_count + 1`, `attempts 0`, new branch `review/<area>-r2`), reviewed again as a
  normal area, in order, **once**. A second move → `SIGNED-OFF-WITH-NOTES: main moved again after
  review (<SHAs>), not re-reviewed` in the final summary.
- `running` and main moved under it → let it finish; the Gate step's diff check will not see the
  new commits (it diffs against the branch's own base); INT's merge-main step handles it.

## 7. Stop condition and the final summary

`deadline = registered_at + 8 h`; `hard_stop = deadline + 60 min`.

- No review launches when `now + 100 min > deadline` (§2.5). INT keeps running batches.
- **Done** when every area is terminal (`merged`, `parked`, `skipped`) and no INT is pending or
  running — or when `now ≥ deadline` and nothing is running — or at `hard_stop` regardless
  (anything still running is listed as "still running at hard stop: <run_id>"; its notification,
  if it comes, is handled by the main session and appended to the summary by hand).
- The last tick: launches a final INT if anything green is unmerged and the locks are free (and
  then waits for *that* through further ticks, at most until `hard_stop`); then writes
  `context/plans/final-review-2026-10-12/README.md` (this design's §Summary: per area verdict,
  commits, merged/parked/reopened, RECORD items for Joe grouped by module, what was deployed, what
  is still unmerged and why, SHAs), commits it on main **only if `main_owner` is null** (else
  leaves it uncommitted in the main checkout and says so), pushes if green, and **deletes the cron**.

## 8. States and transitions

`pending → running → green → merged` (the happy path), with `reopened` (= pending with a count),
`parked` (terminal, reason), `skipped` (terminal: optional area not reached, or `baseline_red`).
INT has its own `int` record: `idle → running → idle`, with a `batches[]` log.

| From | Event | To | Action |
|---|---|---|---|
| pending / reopened | ready (§2) and a slot is free | running | state + token + lease first, then launch, then `run_id` |
| running | `results/<area>.json` with `ok:true` (or the notification) | green | record verdict, `head_sha`, deploy needs, `signed_at` |
| running | `ok:false` / `baseline_red` / dead lease | running (attempt + 1) or parked / skipped | relaunch with `resumeFromRunId`; `attempts ≥ 2` → parked; `baseline_red` → skipped + NEEDS-JOE line |
| green | INT merged and deployed it | merged | record merge SHA and synced modules |
| green | INT parked it (conflict, red gates, probe) | parked | reason + revert SHA |
| merged | main moved under its paths (§6) | reopened | once |
| any non-terminal | hard stop | listed in the summary | — |

## 9. Edge cases → next step (nothing waits for Joe)

| Situation | Next step |
|---|---|
| PT runs past its lease (09:49) | The overnight cron's rule (§3 there) owns PT. This tick only treats PT as terminal when the lease is passed **and** `heartbeat-PT` is > 45 min stale **and** the PT journal has not grown for 45 min — then it writes `lanes.PT.state = parked` with a note and clears both locks (the same leak rule, applied last). Until then INT waits; reviews continue. |
| PT fixes code in an area under review | The Gate step's diff is against the branch base, so the review finishes; INT merges main into the branch first and re-gates. A conflict parks the area (record says which PT commit). |
| PT fixes code in an area already merged | §6 reopen, once. |
| A review's gate is red on `origin/main` itself (`baseline_red`) | `skipped` + a NEEDS-JOE line; nothing is papered over; the tick logs it. |
| A finder proposes a kit change | RECORD (§3.4) unless `kit_source_changes` is true. |
| A refactor breaks loading live (boot probe) | INT reverts that area's merge, re-syncs, re-probes; the area parks with the revert SHA; the record says what the probe saw. |
| Live goldens differ after deploy | Same as above — this process never declares; a diff is a revert. |
| Foundry down at INT preflight | one `make foundry-up FROM=local`; still down → INT parks "Foundry down — Joe", locks released, reviews continue; the summary leads with it. |
| Players online | overnight §5 step 1: tunnel down ⇒ stale or ours; close our tabs; blocks at most one INT tick. |
| Fork `npm ci` fails in the worktree | fork area parks `deps` after 1 retry; nothing else is affected. |
| The verifier reverts everything | The area still signs off (SIGNED-OFF-WITH-NOTES); every reverted change is a RECORD item with the verifier's reason. |
| A workflow script fails to parse or throws at launch | fix the script once (the tick may edit `review-area.js` / `integrate.js`), relaunch; second failure → park with the error. |
| `Workflow` returns an error within 2 min and no agent ran | counts as a launch failure (above), not an attempt. |
| Session compaction | `review-state.json` + this file + `chain-state.json` + the journals + `results/` are the truth; `run_id` identifies running work. |
| Out of disk (worktrees are ~250 MB each, the fork's `node_modules` ~600 MB) | INT removes merged worktrees; the tick checks `df` ≥ 10 GB before a launch, else logs and waits. |
| Infisical auth fails (INT only, if a step needs it — none should) | park INT, record "Joe: infisical login". |
| caffeinate expired (08:49) | every tick re-arms it (`pgrep caffeinate || caffeinate -dimsu -t 43200 &`). |
| The Mac slept | the next tick runs the lease/heartbeat check and continues. |
| Two ticks could launch the same area | state written `running` + token before launch (§5). |
| The optional `py-update` | launched only when everything else is terminal and `deadline − now > 90 min`; else `skipped: optional, not reached`. |

## 10. What Joe must decide (defaults in brackets, all safe)

1. `kit_source_changes` [false] — allow kit refactors with full re-vendor and a 19-module re-sync?
2. `verify_model` [sonnet, xhigh] — Joe's tier rule says Sonnet verifies; for an adversarial pass
   on refactors of combat/ties, Opus at xhigh is the stronger reviewer at ~2× the cost.
3. `max_running` [3 during PT, 4 after].
4. Whether `py-update` is in scope [optional, last].
5. Whether INT may `kill -9` the MCP backend to deploy a fork change while Joe is using the
   bridge this morning [yes — the wrapper reconnects; the alternative is parking the fork area's
   deploy as "merged, not rebuilt"]. If Joe is at the table, set `fork_deploy: false`.
6. The sign-off records' home: `context/plans/final-review-2026-10-12/` [yes] — plans are history,
   and these are the record of what was signed off, not instructions.

## 11. What could still stall (honest list)

- **INT is serialized behind PT and behind itself.** If PT runs to its lease (09:49) and the
  overnight cron takes one more tick to release the locks, the first merge window is ~10:20. Then
  each batch is 20–40 min (goldens + sync + probe). Reviews never stall on it, but the *merged*
  count at the deadline depends on it. Mitigation already in: batching and the 45-min rule.
- **The ties chain** (3 sub-areas, sequential, each ~50–70 min) is the critical path and can only
  start once TIE-4 is done (item 31 of 40 — PT is at 22). Expect ties to begin ~08:30 and end
  ~11:30; fine for a ~14:45 deadline, tight if a sub-area needs a second attempt.
- **Agent count.** 4 reviews × ~10 agents plus INT: well under the per-workflow cap, but API rate
  limits would show up as dead leases; the relaunch path handles it at the cost of a tick.
- **`baseline_red`.** If PT's last Record step leaves a gate red on main (it runs the strict gates
  before pushing, so it should not), every module area would skip. The summary would say so.
