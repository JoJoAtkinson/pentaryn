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
   - `pentaryn-read {ns: "*", path: "inspect", ref: "Talo"}` → `feedback` is
     `{actor, users: [Talo's player], pending, reports}`, not BAD_ARGS; an NPC → empty lists;
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
  It records publish order, which other modules change.
- `pings.js`: read and restore through the stored Setting `_source`, not the aliased cache, so a
  run on a hidden tab cannot leave scratch records or report `pingLogRestored` false.
- Add a `make foundry-importer-install` target (module-check + install, no actors.json). Done on
  `fix/overnight-2026-10-12`.
- Wave-3 live plan: senses `timeoutMs` 90000 is over the eval-js cap of 60000. §4 says "no
  restart" and "no bridge build", which is wrong when the optional fixes ride along. The §5
  `want` map has no feedback entry. §7 row 8 and §7.3 here name real PCs; use a ZZ PC-type actor.
- Add a kit conformance test: a Document-kind manifest param with `resolve:false` must name its
  string forms in `type` (this would have caught the senses.inspect refusal).
- toggle-token-condition only searches the viewed scene: document it in `mcp-fork.md`, or
  resolve the token by uuid.
- feedback 0.1.2 has an "Unreleased" CHANGELOG entry (`c18b74ec`), so the version bump waits for
  the next restart batch.
- For Joe: the wave-3 §8 table checks, and W2-B2 confirmation (§7).
