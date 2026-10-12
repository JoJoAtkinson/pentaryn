---
title: Merge and go-live, 2026-10-11
tags: ["plan", "foundry", "record", "deploy"]
---

# Merge and go-live, 2026-10-11

**Read this when:** you need to know what was merged into `main` and deployed live on
2026-10-11 (wave 2, feedback, rclone, background upload), how it was checked, or what is still
open after it. History, not instructions: to operate anything, use the domain docs
([`../foundry/README.md`](../foundry/README.md), [`../foundry/ops.md`](../foundry/ops.md),
[`../foundry/feedback.md`](../foundry/feedback.md), [`../foundry/mcp-fork.md`](../foundry/mcp-fork.md)).

## 1. Merges into `main`

| Merge | What |
|---|---|
| `692e8f60` `migrate/wave-2` | Blueprint wave 2 (lookup, movement, walls, attunement, journal, dropbin; kit 1.0.2; bridge lane). Includes the play-test fixes via `931203a5` (`fix/playtest-2026-10-11`, see [`addon-blueprint-2026-10/wave-1-playtest.md`](addon-blueprint-2026-10/wave-1-playtest.md) "Fixes on fix/playtest-2026-10-11") |
| `24646fdf` `feature/pentaryn-feedback` | The bug-report module and its `feedback_*` MCP tools ([`feedback-module-2026-10.md`](feedback-module-2026-10.md)) |
| `dc3235e0` `feature/rclone-hosts` | Two hosts, one cloud over rclone ([`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md)) |
| `6e2b6628` (direct) | Boot fix: a pending "cannot tell" notice keeps local as the Enter default [declared] |
| `bb74bf6b` (direct) | `foundry-clean`'s verify reads a Cloudflare Access login redirect as Access, not as the file still served |
| `938c36d4` `feature/vtt-down-background-upload` | `make vtt-down` returns once the tar is built; a detached uploader sends it (ops.md §2). pytest 1199 passed / 2 skipped / 3 xfailed after the merge; `make check-context` only the 4 old warnings |

Fork (`foundry-vtt-mcp`, branch `pentaryn`): `59ffcf2` merges `migrate/wave-2` (bridge lane,
`pentaryn-read` / `pentaryn-write`). Version **0.8.3-pentaryn.2**.

## 2. Live deploy (world pentaryn, Mac, local, no tunnel)

- First rclone boot, `FROM=local`. First Mac snapshot over rclone:
  `world-2026-10-11-212143-fvtt14.369-mac.tar.gz`, **3.24 GB**. `make foundry-cloud` reads
  `rclone onedrive:DnD/foundry`, host mac (primary), based on that snapshot.
- 13 module syncs plus the importer, and the new bridge 0.8.3-pentaryn.2 (built 17:21, backend
  restarted 17:23; `Data/modules` copy byte-identical to the build).
- `pentaryn-feedback` enabled. `pentaryn-walls` stays off: migrated, never live-tested.
- Rollback material kept: `.state/live-rollback/wave2/` (old bridge folder), the fork's previous
  build = first parent of `59ffcf2`.

## 3. Bridge parity

Every existing read tool was called and matched eval-js; every write tool ran on throwaway
"ZZ test" documents and was cleaned up. Tool list = previous build (`59c781e`) plus
`pentaryn-read` / `pentaryn-write`. Fork tests: server 275/275, module 43/43. `pentaryn-read`
lists 10 modules (no walls); all rows, refusals (BAD_ARGS / NOT_FOUND / "eval-js only") and dry
runs behaved as designed; real writes logged to `mcp-2026-10.jsonl`. Player tab queries were
refused with NOT_GM. **No regression.**

Non-regression findings (open):
- `toggle-token-condition` without `active` fails ("active must be a boolean") — upstream bug,
  already in the old build.
- Root `inspect` with an Actor ref: feedback's entry returns BAD_ARGS (expects a User).
- `pentaryn-write` log lines have `ids: []` unless the module result has its own `ids`.
- eval-js argument errors: the action-log line has no `phase` and a raw multi-line `error`.
- `importer.import` dry run on the default path → INTERNAL (404; file is deleted after import by
  design; the importer's abort error has no code).

## 4. Modules live

- Console on three GM reloads: no pentaryn-* or bridge errors.
- Live goldens before/after (`.state/live-goldens/wave2/`): all 11 modules pass; every difference
  is declared. Two golden-script faults fixed in `825cc80e` (importer batch order, pings `ageMs`).
- Ownership-leak scan `[]` before and after.
- Play-test checks pass: pings PT3-2, transform PT3-3/4/6/7, prompts PT2-2/PT2-5, combat PT1-6,
  names PT3-9, bug-reporter button and dialog, report → `feedback_*` round trip.
- Two failures, neither a regression, then fixed (§5): dropbin PT3-1 (revived NPC stayed
  player-observable) and `/bug` in chat.

## 5. Fixes after the live check

| Commit | Fix | Re-checked live |
|---|---|---|
| `de9173ce` dropbin 0.2.3 | `fromCorpse` clears the corpse map with a ForcedDeletion (a plain null was a server no-op when the server had dropped the map) | HUD revive 4/4, heal revive 2/2, revert+heal 3/3, re-pile+heal 2/2 clean |
| `ccf8e4cf` feedback 0.1.1 | `/bug` parses Foundry 14's `<p>`-wrapped chat HTML | `/bug ZZ live check` opens the dialog |
| `7d855259` prompts 0.4.5 | A cut token-own biography points at the token, not the base actor | pointer returns the token's text |
| `42dec260` | Module index updated | — |

## 6. What remains

- **BOSS go-live** per [`rclone-two-hosts-2026-10.md`](rclone-two-hosts-2026-10.md) §15. BOSS's
  rclone `onedrive:` remote already works.
- **Untagged snapshots:** 10 untagged snapshots sit in `world-backups/`; pruning them is Joe's call.
- **Walls:** migrated in wave 2, never live-tested, off. Do not sync or enable it without Joe.
- **Foundry 14.369 server bug** (found during the PT3-1 fix): on a scene created since the server
  last started, a token's first delta change is broadcast but not kept server-side. A kill can be
  lost on reload. Options: report upstream, or restart/warm up new scenes before play.
- **space-journey** was launched briefly by a `make login` without WORLD (no one joined); check it
  before next use if that matters.
- Ping history: golden runs pushed real ping records out of the 50-entry log; the pings golden
  should save and restore the log.
- ties' `game.pentaryn.ties.describe` is the GM description-card toggle, not the kit `describe()`;
  rename at ties' migration.
- Gather pointer for a token's own description is an eval-js expression; a fork tool (or
  `get-character` accepting a token uuid) would be cleaner.
- The open rows in [`addon-blueprint-2026-10/wave-2-report.md`](addon-blueprint-2026-10/wave-2-report.md)
  "Open for Joe" (W2-K1, W2-B1, W2-B2, W2-A1, W2-WALLS-1..3, W2-MOV-1, W2-A2, W2-J1..J3, …).
  W2-B2 (read log lines in `mcp-<YYYY-MM>.jsonl`) is live as planned and awaits confirmation.
- Not checked live: feedback offline queue (needs every GM client gone), tool filter
  `FOUNDRY_MCP_TOOL_FILTER` (needs a backend restart), tool-list poll/schema hash, F3 month change.

## 7. Optional fixes (fix/optional-2026-10-11)

Code-only fixes for the §3 findings and two §6 items, approved by Joe. **Not deployed**: they go
live with wave 3's live phase. Branch `fix/optional-2026-10-11` in both repos (pentaryn from
`a5a1a906`, fork from `59ffcf2`).

| # | Item | Commit | Version |
|---|---|---|---|
| 1 | `toggle-token-condition` without `active` toggles (fork `guardBridgeQueries` fills it from the token's effects; no upstream file touched) | fork `81381c4` | fork unreleased (CHANGELOG "Unreleased") |
| 2 | `pentaryn-write` log `ids` from the documents a result returns (`uuid` / `_id` / Foundry-shaped `id`, depth ≤ 4, ≤ 50) | fork `a325c67` | 〃 |
| 3 | eval-js argument rejection: action-log line gets `phase: "args"` and the one-line error | fork `6da5c3d` | 〃 |
| 4 | Importer aborts carry kit codes (`NOT_FOUND` for a missing file, `NOT_GM`, `BAD_ARGS`, `CONFLICT`, `TIMEOUT`, else `REFUSED`); messages and frozen goldens unchanged | `824ff367` | importer 1.1.0 → **1.1.1** |
| 5 | `feedback.inspect` accepts an Actor/Token (non-GM owners + assigned character) → `{actor, users, pending, reports, …}`; async, adds `reports` | `0e10f33e` | feedback 0.1.1 → **0.1.2** |
| 6 | Pings live golden saves and restores the ping log (hot patch: `uninstall`, write, re-import) | `90d54e99` | — (script + `scripts/tests/test_live_golden_pings.py`) |
| 7 | W2-B2: code and docs agree — read lines go to `mcp-<YYYY-MM>.jsonl` (the `actions` stream); the log section of `mcp-fork.md` now says so | `b8ac054d`, fork `9569396` | — |

Gates: fork server vitest 281/281, module 49/49, module typecheck clean, server typecheck clean
with `@foundry-mcp/shared` mapped to source (the worktree has no `shared/dist`; no dist was
built), `fork-footprint.sh` ✓. Pentaryn: importer 93, feedback 118, pings 67 node tests pass;
`vendor.py check --all` ✓; conformance importer 97.6 % (C07, unchanged), feedback 100 %; pytest
1202 passed / 2 skipped / 3 xfailed; `make check-context` only the 4 old warnings.

Deploy (fold into wave 3's live phase):
1. Fork: merge into `pentaryn`, `npm run build:server`, `kill -9` the stale backend;
   `npm run build:foundry`, copy into `Data/modules/foundry-mcp-bridge`, reload the GM tab.
2. Pentaryn: merge into `main`, install `pentaryn-importer` (`make foundry-importer-install`) and sync `pentaryn-feedback`. Both
   `module.json` versions changed → **Foundry restart**, then reload.
3. Live checks:
   - `toggle-token-condition {tokenId, conditionId: "prone"}` with no `active` on a ZZ token: on,
     then again: off; each call's `isActive` matches the token.
   - A `pentaryn-write` that creates something without its own `ids` (e.g. `dropbin.restoreResult`
     on a ZZ actor): its `mcp-<month>.jsonl` line has the item's and actor's uuids.
   - `eval-js` with `timeoutMs: 500`: the `mcp-` line has `phase: "args"` and a one-line `error`.
   - `pentaryn-write {ns: "importer", path: "import", dryRun: true}` with no actors.json →
     `code: "NOT_FOUND"`; `describe().version` 1.1.1.
   - `pentaryn-read {ns: "*", path: "inspect", ref: "<ZZ PC name>"}` (a ZZ PC-type actor with a
     throwaway ZZ player user assigned as its non-GM owner; never a real PC) → `feedback` is
     `{actor, users: [<the ZZ player>], pending, reports}`, not BAD_ARGS; an NPC → empty lists;
     feedback `describe().version` 0.1.2, `selftest().ok`.
   - Pings golden before/after: `cleanup.pingLogRestored: true`, `pingScratchLeft: 0`, and
     `game.pentaryn.pings.all()` unchanged across the run.
   - W2-B2 still needs Joe's confirmation (wave-2-report "Open for Joe").

## W3L fix round (2026-10-12, overnight)

Three non-regression findings from the wave-3 live checks, fixed on main, code-only (no
`module.json` change → sync + one GM tab reload, no restart). Rollback copies of the deployed
post-merge modules: `.state/live-rollback/W3L-fix/`; the pre-merge copies in
`.state/live-rollback/W3L/pentaryn-{ties,senses,feedback}` were rebuilt from git `b7b625a7` (the
originals were overwritten by this round's first copy — a stamp in each folder says so).

| Finding | Fix | Re-check |
|---|---|---|
| `pentaryn-read {ns:"senses", path:"inspect", ref:<token uuid>}` → BAD_ARGS "eval-js only" (wave-3 live plan §7 row 6) | `43c6e628` [declared]: the manifest `ref` gains `type: "Token\|Actor\|uuid\|id\|exact name"`, so the bridge passes strings through | passes: plain JSON `{token, actor, chain, lightSpells}`, no `[max depth]` |
| `pentaryn-read {ns:"feedback", path:"inspect", ref:"Actor.<id>"}` → "expected User, got Actor"; an actor name → NOT_FOUND user (§7 item 5) | `c18b74ec` [declared]: a string ref is a user first, else an Actor/Token uuid or an actor id / exact name means that actor's players; manifest type adds `uuid` | passes: Actor uuid and Token uuid → `{actor, users, pending, reports}`; `"Gamemaster"` still the user |
| ties timings x2–x6 after the ties-19 memo (structuredClone of the 70 KB registry per call) | `69bfc641`: resolve reads the memo uncopied; `list()` copies by a fresh clamp (pre-ties-19 path); one-entry clone kept | golden identical; resolve 0.1255 → 0.0275 ms, describe 0.123 → 0.0255, list 0.1175 → 0.021 (pre-wave-3: 0.05 / 0.0605 / 0.02). `.state/live-goldens/wave3/after-w3l/ties.run1.json` |

## W3L — wave 3 + optional fixes live (overnight)

Wave 3 (portals, creatures, senses, prompts, ties, a comment-only lookup change) and the §7
optional fixes went live together on the Mac (FROM=local, tunnel down, one GM tab, world
`pentaryn`). One Foundry restart, because the importer and feedback `module.json` versions
changed and wave 3 changes lang and CSS files.

**Merged**
- pentaryn `migrate/wave-3`: `dc7cf6a5` (main/bundles `b7b625a7` merged in) and `768b8645`
  (`fix/optional-2026-10-11` `85fbcbf9` merged in). Merged into main no-ff as **`880de701`**.
- Fork `migrate/wave-3` `cad2401` (`a5ce74c` plus the optional `81381c4` `a325c67` `6da5c3d`
  `9569396`). Merged into `pentaryn` no-ff as **`2fd6eb0`**.
- Fix round on main (previous section): `69bfc641`, `43c6e628`, `c18b74ec`, plus docs `fdde87e4`.

**Deployed** (sync stamps `880de701`; ties, senses and feedback re-synced at `c18b74ec`, code-only,
one GM tab reload): portals 0.4.4, creatures 0.1.1, senses 0.4.1, prompts 0.4.5, ties 0.19.4,
lookup 0.3.0, **importer 1.1.0 → 1.1.1**, **feedback 0.1.1 → 0.1.2**. walls was not synced and
stays off. `make foundry-importer-sync` does not exist (module-sync refuses importer), so it was
`ops module-check importer` followed by `ops.modules.install(cmd='stage')` with no actors.json
staged. Bridge: `build:server` + `build:foundry`, the `dist/` was rsynced into
`Data/modules/foundry-mcp-bridge` (only `fork/handlers.*` and the new `fork/toggle-condition.*`
differ), the backend was killed with `kill -9` (pid 73217 replaced by 91021), and the session's
tools stayed up. Bridge `module.json` is still 0.8.3-pentaryn.2. For the 6 wave-3 modules the
`module.json` diff against the rollback copies is empty.

**Gates.** Code: every `pentaryn-*/test/run.mjs` exits 0, pytest 1480/2 skipped/6 xfailed,
`foundry-modules-check` 20/20, check-context passes with the old warnings, `vendor.py check --all`
passes. Fork: server vitest 281/281, module vitest 49/49, both typechecks pass,
`fork-footprint.sh` passes.

**Goldens** (`.state/live-goldens/wave3/`, before and after each run twice; run1 vs run2 shared is
identical on both sides):
- portals, creatures, senses: shared is identical, diff.mjs exits 0, and the declared
  differences (42 / 56 / 38) match wave-3 live plan §6.
- prompts: `moduleApi` and `surface` differ, both listed in the §6 table. Everything else is
  identical and `ringRestored` is true.
- ties: `surface.top/study/attributes`, `d1` (attributes.describe, study.inspect → undefined),
  `frozen` and `moduleApi` differ, all listed in the table. registry, link, resolve*, ids, of and
  flag are identical.
- importer: the only difference is `root.keysInPublishOrder`. The key set is the same 24 keys,
  but creatures, portals and prompts now publish earlier on the kit's schedule. The importer
  reads none of this, so it is a side effect of wave 3, not an importer change. The plan
  expected "identical": see follow-ups.
- pings: identical, cleanup clean on both sides, `pingLogRestored` true. The before-side run 2
  left 6 scratch records in the aliased settings cache only, on a hidden tab; they were cleaned
  by hand and never reached the store.
- Timings (run2 vs run2): only ties was flagged (resolve ×2.5, describe ×2.0, list ×5.9). Fixed
  by `69bfc641`: resolve 0.0275, describe 0.0255, list 0.021 ms (`after-w3l/ties.run1.json`).
  Nothing else was flagged.

**Boot probe:** `probes.json` against `probes-before.json`. The wave-3 five are active and each
has `moduleApi` "same", versionMatches, frozen, notFunctions `[]` and contract
`pentaryn-<m>/api@1`. Selftests ok. senses chainAlias "same" / chainUninstall "undefined",
rootFrozen false, importer 1.1.1, feedback 0.1.2. Every other module matches the before probe.
Console clean (only third-party v13 deprecations) and the server log has no errors.

**Live checks.** Wave-3 §7 rows 1–13 (`reads.md`): all pass, except row 6 (senses.inspect via
pentaryn-read gave BAD_ARGS), which the fix round fixed. Row 8 read Talo's ties (read only, empty).
Row 13 used a throwaway ZZ player user and a second tab; both were deleted and closed. Optional
§7 checks:
- toggle-token-condition prone with no `active` on a ZZ token: on, then off. The first call
  failed until the GM tab viewed the ZZ scene, because the tool only looks in the current scene.
- `dropbin.restoreResult` logs ids `[Actor…Item…, Actor…]`.
- eval-js `timeoutMs: 500` → `phase: "args"` with a one-line error.
- importer dry-run import → `NOT_FOUND`.
- feedback.inspect: the ZZ npc gives empty lists (eval-js). Through pentaryn-read, an actor
  uuid or name was refused; the fix round fixed this in `c18b74ec`.

Wave-3 §8 table checks were not run: they need Joe's eyes ("Open for Joe"). The two-tab checks
(W3-L2) and the W3-L3 prompt-markers run were skipped.

**Pushes:** pentaryn main `b7b625a7..fdde87e4` (fix round), then this record. Fork `pentaryn`
`59ffcf2..2fd6eb0`. No reverts.

**Exit state (verified):** Foundry up (FROM=local), tunnel down, world `pentaryn`, only the
Gamemaster active, one Foundry tab (localhost), `get-world-info` answers, 15 namespaces answer
`describe()`. No ZZ actors, scenes, items, journals or users, and 0 combats. The older "ZZ test
Player's Journal" is gone too. Rollback copies: `.state/live-rollback/W3L/` (world, Config, the
8 modules, the bridge, the old fork dist) and `.state/live-rollback/W3L-fix/`.

**Follow-ups**
- Fix the importer golden (`importer.js`): sort `root.keysInPublishOrder`, or move it to declared.
  It records publish order, which other modules change. Done on `fix/overnight-2026-10-12`
  (moved out of `golden` to a top-level `publishOrder`).
- `pings.js`: read and restore through the stored Setting `_source`, not the aliased cache, so a
  run on a hidden tab cannot leave scratch records or report `pingLogRestored` false. Done on
  `fix/overnight-2026-10-12` (the pytest now runs a hidden-tab model too).
- Add a `make foundry-importer-install` target (module-check + install, no actors.json). Done on
  `fix/overnight-2026-10-12`.
- Wave-3 live plan: senses `timeoutMs` 90000 is over the eval-js cap of 60000. §4 says "no
  restart" and "no bridge build", which is wrong when the optional fixes ride along. The §5
  `want` map has no feedback entry. §7 row 8 and §7.3 here name real PCs; use a ZZ PC-type actor.
  Done on `fix/overnight-2026-10-12` (wave-3 live plan §0, §4 addendum, §5, §7; §7.3 here).
- Add a kit conformance test: a Document-kind manifest param with `resolve:false` must name its
  string forms in `type` (this would have caught the senses.inspect refusal). Done on
  `fix/overnight-2026-10-12` as conformance rule C62; attunement fails it (stash, releaseAway take
  live Actors: an `eval-js only` marker is the fix, not string forms).
- toggle-token-condition only searches the viewed scene: document it in `mcp-fork.md`, or
  resolve the token by uuid. Documented in `mcp-fork.md` on `fix/overnight-2026-10-12`.
- feedback 0.1.2 has an "Unreleased" CHANGELOG entry (`c18b74ec`), so the version bump waits for
  the next restart batch.
- For Joe: the wave-3 §8 table checks, and W2-B2 confirmation (§7).

## W4L — wave 4 + fixes batch 1 live (overnight)

Wave 4 (riders, aoe, combat, transform get the blueprint kit: `describe()`, frozen api, contract
`pentaryn-<m>/api@1`), fixes batch 1 (`fix/overnight-2026-10-12`: senses `syncAll` batching, the
importer and pings golden fixes, `make foundry-importer-install`, conformance rule C62) and a
comment-only cursors change went live together on the Mac (FROM=local, tunnel down, one GM tab,
world `pentaryn`). One Foundry restart: no `module.json` changed, but aoe's `lang/en.json`,
combat's and transform's `styles/*.css` and the new `lib/argon-tooltip.css` did.

**Merged**
- pentaryn `migrate/wave-4`: `ff42b1d2` (origin/main `6969aa91` merged in: module index
  regenerated, `adjustments.yml` keeps both sides, the contract test repointed to senses'
  `core/light.mjs`), `72c495c1` (`fix/overnight-2026-10-12` merged in, clean), `ef7300a4` (bug
  fix, below). Merged into main no-ff as **`272f62fc`** (tree identical to `ef7300a4`, no
  `foundry/logs` hunks).
- Fork `migrate/wave-4`: `5cce276` (origin/pentaryn `2fd6eb0` merged in), `f533f34`
  (pentaryn-read description: every module namespace publishes `describe()`, only the chain alias
  has none; a unit test checks it names none of combat, riders, transform, aoe, ties, prompts).
  Merged into `pentaryn` no-ff as **`7712417`**. Diff vs `2fd6eb0`: 2 files, both in
  `packages/mcp-server`.

**Bug found and fixed (`ef7300a4`).** `scripts/tests/test_foundry_ops.py::test_every_subcommand_routes`
left `pipeline.install_importer` unstubbed (from `fd84e1d7`, fixes batch 1), so every full pytest
run installed `pentaryn-importer` into the live Data folder while Foundry ran. Proved by bisecting
on the stamp's mtime. The code digest was unchanged (`db5d4d5b…`), so only the stamp's `git` field
moved. The fix stubs it and makes `pipeline.install` / `modules.install` raise in that test; the
guard fails before and passes after, and the pytest run on main left the stamp's mtime untouched.

**Deployed** (sync stamps `272f62fc`, dirty false, `make foundry-<m>-sync` from main): riders 0.2.0,
aoe 0.3.1, combat 0.2.5, transform 0.3.3, senses 0.4.1, cursors 0.2.0 (version numbers unchanged;
every `module.json` identical to its rollback copy). walls not synced. Importer not re-synced (code
identical). Bridge: `build:shared`, typecheck, tests, `build:server`, `fork-footprint.sh`; no
`build:foundry` and no copy into `Data/modules/foundry-mcp-bridge` (packages/foundry-module
unchanged, live plan §4.3). Backend `kill -9` (pid 91021 → 43353). Bridge module still
0.8.3-pentaryn.2. The backend serves the new pentaryn-read text; the wrapper logged "tools/list
changed; notified the client" at 06:05:40Z.

**Gates.** pytest 1523 passed / 2 skipped / 6 xfailed (on the branch and again on main); all 20
modules' node tests pass (walls keeps its 1 todo); every `make foundry-<m>-check` 0;
`foundry-modules-check`, `foundry-lib-check`, `check-context` (5 old warnings),
`foundry-adjustments-check`, `vendor.py check --all` green. Conformance: the fail sets equal the
baseline (riders C07 C09 C37 C56; aoe C07 C09 C37; combat C07 C21 C23; transform C07 C37), plus
attunement's known C62. Fork: server vitest 282/282, module 49/49, typecheck 0, footprint passes.

**Goldens** (`.state/live-goldens/wave4/`, before and after, each twice, in order aoe, riders,
combat, transform, senses, cursors; run1 vs run2 shared identical on both sides; diff.mjs
before → after exits 0 for all six, cleanup clean). Declared differences match wave-4 live plan §6:
- riders: 13 paths, 4 patches, 1 query; the `previewAtArgument` @ fix; `legacyRefs` filled.
- aoe: 24 paths, 17 settings; `inspectHandle` has the expected shape; handles settled on a hidden tab.
- combat: 25 paths, 7 events, 8 patches, 30 settings; `planNoActor` TypeError → "null"; the
  ByName/ByUuid refs now equal the shared count, plan and weapons (3).
- transform: 13 paths, 1 patch; `inspect` returns plain JSON. No forms difference (`796fdf63`
  counts as declared).
- senses: only the scratch AmbientLight id differs (it differs run to run before, too).
- cursors: identical.
- pings (after only): `pingLogRestored` true, scratch records 0, on a hidden tab; shared equals
  the wave-3 after run. importer (after only): `publishOrder` is top level, outside `golden`.
- No timing call flagged.

**Boot probe** (`probes.json` vs `probes-before.json`): pentaryn-read `{ns:"*",path:"describe"}`
answers for 19 namespaces, all kit 1.0.2 (walls absent). The four wave-4 modules are active,
`moduleApi` "same", versionMatches, frozen, `notFunctions []`, contract `pentaryn-<m>/api@1`;
selftest ok for riders, transform, combat (aoe has none). rootFrozen false, chainAlias "same" with
no `describe()`, as designed. Every other module equals the before probe. Tooltip CSS: 22
`.pentaryn-tt` rules (11 before), from combat's and transform's own `@import`ed
`lib/argon-tooltip.css`, each fetched once. Console from the Cmd-Shift-R reload: no errors, only
third-party v13 deprecations; `debug.2026-10-12.log` has no error lines.

**Live checks** (`reads.md`): wave-4 live plan §7 rows 1–10 pass with the npc "ZZ Wave4 Reader"
(deleted): each module's paths equal its `test/golden/describe.json`; the four inspects return
plain JSON; combat plan has 2 swings, `coversMultiattack` gives the Multiattack id, riderMode
"ask"; transform forms → BAD_ARGS (live Document, eval-js only); the four write dryRuns →
BAD_ARGS "no dry run", nothing changed; wrong-tool calls → BAD_ARGS, unknown ns → NOT_FOUND.
Fixes batch 1: senses `syncAll` on the converged world returns 0; a ZZ torch actor with 2 linked
tokens set to 0/0 returns 3 (one Actor update of 1, one token batch of 2; both tokens 20/40),
rerun 0. D7: removing transform's import from the CSSOM leaves combat's `.ech-tooltip.pentaryn-tt`
styled (pointer-events none, 340px, 2-column grid); removing both falls back to Argon's defaults;
both restored. Bridge smoke: get-world-info, list-characters, get-character, list-scenes,
search-compendium, read-only eval-js, describe/selftest on the four, feedback.submit dryRun, the
refusals. The two-GM-tab checks (W4-L2) were skipped. §8 table checks need Joe's eyes.

**Fixes:** none needed in the live loop (no fix round, no `W4L-fix/`).

**Pushes:** pentaryn main `6969aa91..272f62fc`, then this record. Fork `pentaryn`
`2fd6eb0..7712417`. No reverts.

**Exit state (verified):** Foundry up (FROM=local), tunnel down, updater paused, world `pentaryn`,
only the Gamemaster active, one Foundry tab (localhost), `get-world-info` answers. Zero ZZ
documents or chat lines, 0 combats. Rollback copies: `.state/live-rollback/W4L/` (world, Config,
the 6 modules, the bridge, the old fork dist, fork commit `2fd6eb0` in README.txt).

**Follow-ups**
- Cherry-pick `ef7300a4` onto `fix/overnight-2026-10-12`; until then a pytest run from that branch
  reinstalls the live importer. Optional hardening: an autouse conftest fixture that points the
  Foundry Data modules dir at `tmp_path` for every test.
- Wave-4 live plan §5: the top-level `tooltipRules` flag is always false on Foundry 14 (module CSS
  is nested in `@import`/`@layer`); replace it with the recursive `.pentaryn-tt` count (22 after).
  Drop `argonKitScripts` (`document.scripts` never lists an ES-module import).
- Wave-4 live plan §6: transform's `starry`/`starryKeys` were already present on 0.3.3 (the
  "absent → …" row is stale); combat `coreKeys` rose 81 → 95 (turnflow/hud splits).
- senses golden: normalise `inspectCarrier.lightSpells[0].litBy[0]` and `lightStatus.litBy[0].id`
  (raw random ids give 2 declared differences in a before-vs-before self-diff).
- The overnight lane template asked for `build:foundry` plus a bridge copy; live plan §4.3 says a
  server-side-only fork diff needs neither. Make the template agree.
- For Joe: attunement fails C62 (`stash`, `releaseAway` take live Actors; an eval-js-only marker is
  the fix — your call). D8 / tc-22, observed only: on the world-time fallback, a lapsed Starry Form
  ends on a linked druid but not on an unlinked token druid; core's own expiry path needs a real
  clock advance. D7: look at the real Argon HUD tooltips at the table. A third-party update dialog
  for "Argon - Combat HUD" is open on the GM tab, left alone. Run `/mcp` in long-running sessions
  to pick up the new pentaryn-read description.

## W5L — attunement golden-diff re-check (2026-10-12, overnight)

Main `56c2f39a`, attunement 0.3.0 deployed. A 5th after-run of `live-goldens/attunement.js`
gives the same golden as the 4 earlier runs (`after-fix3/attunement.recheck.json`). `diff.mjs`
against both 0.2.1 before-runs shows the env version (0.2.1 → 0.3.0), the 23 shared W2-A1 paths and
`stashDetail.created[0]` → `<charmCopy0>`, and nothing else. Each one matches the declared row in
`wave-5-live-plan.md` §10.2 (ab677200). `chestCurrency` is `{}`, so the purse paid once, and cleanup
is clean. No timing flag: every before median is below 0.05 ms. `diff.mjs` exits 1 because it
counts every shared difference as a failure. By §9 that is green: only `[declared]` lines differ.
Main pushed.

Follow-up (FX): `diff.mjs` could take a declared-paths allowlist so that an all-declared diff
exits 0.

## W5L — wave 5 restart batch + fixes batch 2 live (overnight)

Wave 5 (the Wave 7 restart batch: blueprint kit 1.1.0 for all 19 modules, `styles/` moves, lang
files, strict gates) and fixes batch 2 (`fix/overnight-2-2026-10-12`: senses SE4, attunement A1/A2)
went live together on the Mac. Conditions: FROM=local, tunnel down, updater paused, one GM tab,
world `pentaryn`. There was one Foundry restart, because every manifest changed.

**Merged**
- `migrate/wave-5` took fixes batch 2 as `0ef92fb4`. That merge had three doc conflicts and no
  code conflicts. Then:
  - `ee87ec60` re-vendors kit `election.mjs` at 1.1.0; fx2 had vendored the 1.0.2 copy.
  - `8f6a8924` [declared] releases senses 0.4.1 → **0.5.0** and attunement 0.2.1 → **0.3.0**.
  - `acc8636f` and `913350fd` are docs and the module index.
- Merged into main no-ff as **`380a5348`**. The tree equals `913350fd`, with no `foundry/logs`
  hunks.
- Fix round 1, golden script only: `85af01b5`. It merged as **`13c53cbb`**.
- Fix round 2, golden script and plan row: `df161e4d` and `ab677200`. They merged as **`56c2f39a`**.
- `fb40383c` is the attunement re-check note above.
- Fork unchanged at `7712417` on `pentaryn`; it was not built and not pushed.

**Deployed**, all from main `380a5348`. Every stamp is dirty false, and every `module.json`
equals the repo copy:

| Module | Version | | Module | Version |
|---|---|---|---|---|
| aoe | 0.4.0 | | movement | 0.1.2 |
| attunement | 0.3.0 | | names | 0.1.1 |
| combat | 0.3.0 | | pings | 0.1.1 |
| creatures | 0.1.1 | | portals | 0.5.0 |
| cursors | 0.2.0 | | prompts | 0.4.5 |
| dropbin | 0.2.3 | | riders | 0.3.0 |
| feedback | 0.1.2 | | senses | 0.5.0 |
| importer | 1.1.1 | | ties | 0.19.4 |
| journal | 0.1.0 | | transform | 0.4.0 |
| lookup | 0.3.0 | | | |

- 18 modules went in with `make foundry-<m>-sync`; importer used `make foundry-importer-install`.
- Walls was not synced and is still 0.2.0 and off. Its folder equals the rollback copy.
- The 7 old CSS paths are gone.
- The bridge module is unchanged at 0.8.3-pentaryn.2.
- Snapshot before the deploy: `world-2026-10-12-073936-fvtt14.369-mac.tar.gz` (19.5 MB, bundled).
- Rollback copies are in `.state/live-rollback/W5L/`: world and Config, every module, the bridge,
  and the fork dist. The fix rounds re-synced no module, so there is no `W5L-fix/`.

**Gates on main**, strict, all green both at `380a5348` and at `56c2f39a`:
- pytest: 1538 passed at the merge, 1542 after the new golden tests (2 skipped, 5 xfailed).
- Node tests: 20 of 20 modules pass.
- `foundry-modules-check` passes all 20. `foundry-lib-check` gives 93 pass, 0 fail.
- `check-context`, `foundry-adjustments-check`, `vendor.py check --all` and conformance all exit 0.
- Attunement's C35 exception stays, because fx2 did not do the `_loc` switch.

**Boot probe** (`.state/live-goldens/wave5/probes.json`): all 19 modules pass.
- Each is active, `moduleApi` same, frozen, `notFunctions []`, versionMatches.
- Kit 1.1.0, contract `pentaryn-<m>/api@1`, flags equal the module id.
- Importer `import` has dryRun. Names `sync.ref` is `resolve:"self"`.
- Selftest is ok for all 12 modules that have one.
- Walls is off with scope `wall-autocomplete`. `rootFrozen` false, chainAlias "same", and the
  root keys equal the before probe.
- The console from load is clean: no errors, no 404s, no missing-localization lines. The Foundry
  log has no error or warn line since the restart.

**Lang** (`lang-gm.json`, `lang-player.json`): all 17 lang files return 200 with nothing missing.
There were zero raw `PENTARYN_` keys on any GM surface: settings, controls, the hero sheet, the
token HUD, scene controls, the Portal card, the feedback dialog and chat. There were also zero on
the player tab: user Talo on `zz1.localhost`, opened and then closed.

**Styles** (`styles.json`): all 16 `styles` entries are loaded, and no old path is.
- Each moved file keeps its rule count. Combat stays at 43 and transform at 16, because the walk had
  already credited the old `@import` to `lib/argon-tooltip.css`, 11 rules each.
- `.pentaryn-tt` went from 22 to 33 rules: pointer-events none, max-width 340px, clickThrough true.
- D7 isolation: any one of the three `argon-tooltip.css` copies carries the styling alone.

**Goldens** (`.state/live-goldens/wave5/before|after/`): 18 modules × 2 runs on each side.

| Result | Modules |
|---|---|
| Shared identical, no declared difference | aoe, combat, creatures, cursors, dropbin, importer, journal, lookup, names, portals, prompts, riders, ties, transform |
| Declared only: the scratch AmbientLight id, known noise | senses |
| Identical to before after fix round 1 | movement |
| Run-to-run noise (below) | pings |
| 23 shared W2-A1 paths, declared | attunement |

- **movement:** the after runs first read `pinsUnderTokens[0].noteId` as `<noteClear>`, then as
  `<noteUnder>`. Cause: a batch `createEmbeddedDocuments` returns in no fixed order on Foundry 14.
  `85af01b5` creates the documents one per call and adds a test that no golden destructures a
  multi-document create. After that, 3 runs matched the before hash `1f7f4313…`.
- **pings:** `ping.settingArrayReplacedByFlush` is true only in before run1. Before runs 2–4 and
  both after runs are false, and after run1 is shared-identical to before run2. This is
  timing/cache noise in the golden, not a code change.
- **attunement:** the 23 shared paths are the [declared] W2-A1 change. A purse in a non-pile chest
  is now paid out after the 750 ms claim instead of at once.
  - `df161e4d` takes the purse home before the claim settles. It adds `purseHome.chestCurrency`,
    which comes out `{}`, so there is no double payment. It also tags the stash copy ids.
  - `ab677200` lists the exact diff in live plan §10.2.
  - 5 runs gave one hash, `dcddcbe0…`. Only the declared lines differ.
- No timing flag. Every cleanup was clean.

**Reads** (`reads.md`): §10.3 rows 1–9, the three refusals and the bridge smoke all pass.
- Describe answers for 19 namespaces at kit 1.1.0.
- Importer `import` dryRun returns NOT_FOUND (actors.json 404).
- Names sync takes the string ref.
- Attunement's `stash` and `releaseAway` docs say eval-js only.
- The 12 selftests pass, inspect returns plain JSON, and walls gives NOT_FOUND.

**Fixes batch 2 live** (`fx2.md`, on ZZ Wave5 Scene after one throwaway token change). The screen
was locked, so every tab was hidden and timings are bounded only to whole seconds.
- **SE4 passes.** The chain sprite was counted for the GM / the player:
  - both tokens visible: 2 / 2;
  - anchor hidden: 2 / 0;
  - anchor unhidden: back to 2 for the player;
  - chained token hidden: 2 / 0;
  - chain broken: 0 for the GM.
- **A2 passes.** A forced shortfall rejects with `rolledBack: true` and `created` naming the copy
  that landed. The container ends with 0 items, the owner keeps both originals, and the console has
  exactly one `pentaryn-attunement |` error line.
- **A1 passes.** The purse carries `claims.coinBack`. gp is unchanged at about 1 s and paid once by
  2 s (12 gp), then the purse deletes itself. There is one toast, and an item pile never pays.

**Pushes:** pentaryn main `7b444c6f..fb40383c`, then this record. Fork not pushed (unchanged).
No reverts.

**Exit state (verified at close):**
- Foundry is up (FROM=local), the tunnel is down and the updater is paused.
- World `pentaryn`. Only the Gamemaster is active, in one Foundry tab (localhost:30000/game), and
  `get-world-info` answers.
- 0 ZZ documents, 0 ZZ chat lines, 0 combats. Walls is inactive.
- Every pentaryn stamp is `380a5348`, dirty false.

**Follow-ups (FX, no-downside)**
- Wave-5 live plan §9, the styles probe:
  - Strip `modules/<id>/` before the `loaded` test. As written, every entry reads not loaded.
  - The "styles/<m>.css = before − 11" row is wrong; the counts stay the same.
  - D7 isolation needs `deleteRule`/`insertRule`, one case per eval, and no timers.
    `sheet.disabled` does nothing on an `@import`ed sheet.
- §8.4: the player tab should call `scene.view()` itself. The GM's `pullToScene` throws a core
  TypeError in a hidden tab.
- Add pings `settingArrayReplacedByFlush` to the known run-to-run noise. Senses' light id and
  attunement's `stashDetail.created[0]` are already handled.
- `diff.mjs`: take a declared-paths allowlist, so that an all-declared diff exits 0.
- `vendor.py check`: name a header kit version that differs from `kit.lock.json`.
- Goldens and probes run by eval-js: avoid `requestAnimationFrame` and timers, because a hidden or
  locked tab throttles them.
- Attunement `bonds.mjs`: clear a stale `claims.coinBack` in `restoreBond`, with a unit test. A copy
  taken inside the 750 ms window keeps the stamp of the tab that set it.

**For Joe**
- Attunement's `_loc` switch (guide step 8) is still open, and its C35 exception stays.
- `make vtt-status` says "public: reachable (HTTP 302)" while the tunnel is down. That is most
  likely the Cloudflare Access redirect, but it was not checked.
