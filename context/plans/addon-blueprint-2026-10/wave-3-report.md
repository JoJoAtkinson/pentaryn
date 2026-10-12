---
title: Wave 3 report — addon blueprint migration
status: code phase closed
last_modified: 2026-10-11
tags: [foundry, modules, blueprint, plan, migration, report]
---

# Wave 3 report

**Read this when:** you need what wave 3 decided, what is still open, or which commit checkpointed a
module. Baseline: [`wave-3-baseline.md`](wave-3-baseline.md).

## Summary (code phase closed, 2026-10-11)

Wave 3 migrated five modules to the blueprint: **prompts and ties**, which finish Stage 2, and
**portals, creatures and senses**, the first three off the lifted WAIT list (`wait.json` history,
D9). Following Joe's rule of 2026-10-11, each module's performance, maintainability, hardening and
LLM-read findings were applied in the same wave. Nothing new was built as a feature. D6's growing
dialog and D8 are recorded as later work.

This was the **code phase only**. Nothing was synced, built into a deployed path, restarted or run
live, and nothing was merged into `main`. The live phase is written down but has not run:
[`wave-3-live-plan.md`](wave-3-live-plan.md).

- **Branches.** pentaryn `migrate/wave-3` is `wave-3-base` (`a5a1a906`, origin/main at the start)
  plus 299 commits before this report's own. The fork's `migrate/wave-3` is `origin/pentaryn`
  (`59ffcf2`) plus 1 commit (`a5ce74c`, a tool-description string).
- **Checkpoints.** prompts `bc12443e`, ties `7395a708`, portals `0ca63b97`, creatures `6e4c7d7c`,
  senses `5e76c4a1`.
  - The wave-1 checkpoints for prompts (`6cc5c50`) and ties (`9e955e0`) were replaced. Each pinned
    only a slice of its module, and the code had changed since (D1, D6, kit 1.0.2, J10, PT2).
  - Portals, creatures and senses had no checkpoint before this wave.
- **No module stopped.** No frozen test went red twice on the same step.
  - Every edit to a checkpoint test or golden falls into one of these groups: a `[declared]`
    commit or its golden commit; an import-path change; new tests added beside the old ones; a
    fixture that only adds a stub; or a change the guide planned. The integration review re-checked
    each one; the per-module table below lists them.
  - **Four pin flips carry no `[declared]` tag.** Treat them as declared when bisecting:
    - portals `a3ade332`: the clear-image write changes from `-=img` to `_del`;
    - senses `ff544d99`: the "200 epoch builds" pin becomes ≤ 40;
    - ties `ae89ff94` and `8f3e120e`: the golden commits of `[declared]` `2257ae61` and `171c6e4f`.
  - **Ties B3:** only `5b47b528` is tagged, but it covers four more additive commits (`7cb9e4f9`,
    `bf44258f`, `fbc7c696`, `1d660cc8`). Those commits touch only S8 goldens, which were never
    frozen.
- **65 `[declared]` behaviour commits** (prompts 12, ties 18, portals 10, creatures 12, senses 13)
  and 8 tagged golden commits. They are listed under "Commit lists" below, and each one goes to the
  live phase.
- **Conformance** (advisory) at wave-3-base → HEAD:
  - prompts 56.5 → **97.9 %**
  - ties 55.3 → **91.8 %**
  - portals 58.1 → **91.3 %**
  - creatures 57.8 → **93.8 %**
  - senses 51.1 → **93.6 %**

  What still fails:
  - prompts fails only C07. Ties, portals, creatures and senses fail C07, C09 and C37 (plus C51
    for portals), which wait for the Wave 7 `module.json` batch (C37 clears with each `cssPrefix`).
  - Ties also fails C05 (`ties-api.mjs`, W3-T6), and keeps C37 after Wave 7 for the card layer's
    `#pentaryn-ties-cards` alone (W3-T1; checked on a copy with `cssPrefix: "pt-"`).
- **Gates at the close** (`8d3d7736`, re-run for this report; all static):
  - `make foundry-modules-check`: all 20 modules pass their gates.
  - Each `node test/run.mjs` exits 0:
    - prompts 225 (219 pass, 6 fork checks skipped without `FOUNDRY_MCP_FORK`; 225/225 with it), plus legacy 415;
    - ties 250, plus legacy 183, 9 and reach;
    - portals 191, plus legacy 52;
    - creatures 105 (103 pass, 2 manifest pins skipped until Wave 7), plus legacy 73;
    - senses 150.
  - `pytest -q`: 1203 passed, 2 skipped, 3 xfailed (baseline 1199 / 2 / 3).
  - `make foundry-lib-check`: 82/82.
  - `make foundry-adjustments-check`: 112 rows, OK.
  - `make check-context`: OK, with 5 old warnings.
  - `vendor.py check --all`: every vendored kit is identical.
  - Fork, per the integration run (unchanged since): vitest 275 + 43, typecheck clean,
    `fork-footprint.sh` OK.
- **Open for Joe:** 21 rows, each with a recommended default (table below). 3 are already closed:
  W3-P3, W3-PR2 and W3-T4. None blocks the live phase except W3-L1…L3, which are choices to make
  before it runs.

## Per module

How each column was measured:
- **Frozen-test diff:** `git diff --stat <checkpoint>..HEAD -- foundry/module/pentaryn-<m>/test/`, with
  files counted as A (new) or M (a file that existed at the checkpoint). Kit copies are counted too.
- **Conformance:** `conformance.py --module <m>`, read at four points: wave-3-base → checkpoint →
  end of the module's lane → HEAD (after the integrator's adjustments rows and the scorer fixes).
- **Coverage:** lines / branches / functions over the module's own files (`lib/` and `test/`
  excluded). It is measured with `node --test --experimental-test-coverage` over every `*.test.mjs`
  (node:test only, not the LEGACY suites), with lcov merged per file. The checkpoint was measured on
  a `git archive` of the checkpoint and HEAD on the tree, both by this report. It is a gap finder,
  not a target. Lines and functions repeat exactly; node's branch figures move by about ±0.2 between
  runs of the same tree (re-measured at HEAD: prompts 86.07–86.15, ties 78.88–78.93).
- **Lane figures:** each lane's checkpoint record used a different method (some included LEGACY
  suites). Those figures are in the guide Results.

| Module | Checkpoint | Frozen-test diff | Conformance | Coverage L / B / F (checkpoint → HEAD) | node:test (checkpoint → HEAD) |
|---|---|---|---|---|---|
| prompts | `bc12443e` | 43 files (23 A, 20 M), +2044 −62 | 56.5 → 58.7 → 93.8 → **97.9 %**; fails C07 | 98.84 / 85.59 / 96.30 (16 files) → **98.83 / 85.94 / 96.99** (50 files) | 155 + 3 todo + 2 skip → 225 (6 skip, 0 todo); legacy 415 both |
| ties | `7395a708` | 56 files (26 A, 30 M), +4993 −125 | 55.3 → 61.7 → 87.8 → **91.8 %**; fails C05, C07, C09, C37 | 95.18 / 76.91 / 90.53 (21) → **96.37 / 78.97 / 91.50** (55) | 142 + 2 todo → 250 (0 todo); legacy 183 / 9 / reach both |
| portals | `0ca63b97` | 32 files (14 A, 18 M), +1400 −85 | 58.1 → 67.4 → 87.0 → **91.3 %**; fails C07, C09, C37, C51 | 100 / 97.80 / 100 (2) → **99.51 / 96.19 / 97.89** (10) | 113 (1 todo) → 191 (0 todo); legacy 52 both |
| creatures | `6e4c7d7c` | 15 files (11 A, 4 M), +1109 −84 | 57.8 → 64.4 → 89.6 → **93.8 %**; fails C07, C09, C37 | 100 / 90.42 / 92.75 (2) → **99.73 / 95.19 / 99.08** (10) | 61 + 7 todo → 105 (2 skip, 0 todo); legacy 73 both |
| senses | `5e76c4a1` | 40 files (11 A, 29 M), +1661 −207 | 51.1 → 55.6 → 91.5 → **93.6 %**; fails C07, C09, C37 | 98.96 / 91.46 / 98.64 (7) → **99.61 / 92.03 / 98.94** (20) | 104 (1 todo) → 150 (0 todo) |

**Coverage before the wave** (setup baseline, the old suites only):

| Module | Lines / branches / functions | What it covered |
|---|---|---|
| prompts | 98.61 / 79.11 / 96.48 | 12 of 16 files ever loaded |
| ties | 61.44 / 84.58 / 53.65 | |
| portals | 100 / 92.19 / 100 | core only; `portals.mjs` never loaded |
| creatures | 100 / 97.00 / 100 | core only |
| senses | 91.40 / 90.79 / 95.83 | 3 pure files only |

The checkpoint and HEAD file counts differ because the refactor split each module into more files.
Ties' branch rate is the lowest. Its UI files hold most of the untested branches: `tie-dialog`,
`attributes-ui`, `overlay` and `worn`, mostly PIXI 7 paths and re-aim/draft branches.

Each module's full record is in its guide's **Result** and its audit's **Status**: commits by step,
deviations, and live checks.

### prompts — `prompts-lookup-7…33`, mcp-fork-2/-10/-15/-20/-24, aoe-movement-portals-38

**Frozen files touched** (20 M). Nothing else changed.
- **Import paths only:** step 10 `ec66c6df` touched 13 test files, and step 11 `bc8ef0f3` touched
  `dialog`, `i18n`, `surface` and `typeahead` (plus the new `typeahead-core.test`).
- **`contract.test`** reads the query names from the manifest (DP3 `876f2899`), and `3451fdb7` adds
  `KNOWN_DRIFT`.
- **One fixture** gains `Actor.updateDocuments` (`30c47bf2`). No assertion changed.
- **Pin flips, each in a `[declared]` commit:**
  - `glue.test` (DP1/DP2 `a86a769e`, DP5 `1ea35e09`);
  - `typeahead.test` (DP5);
  - `replace.test` (DP6 `1e376f51`);
  - `gather-glue.test` with `crop-ops.json` (DP7 `e00bb70f`);
  - `patch.test` with `replace-encounters.json` and `replace-real-actor.json` (fractional CR `0dfb854a`);
  - `ensure-markers-create.json` (DP11 `e451d4a7`).
- `legacy-surface.json` is unchanged. It is now checked as a subset of the new API.

**Findings → commits.** The full table is the audit's "Status — wave 3 migration".
- -7 `ce91ee83`
- -8 `aa12d127` (DP8, narrower: the hover tip uses the cache, the panel always builds fresh)
- -9 `a4f3d32c`
- -10 `9b597ba3`, `ee0108a9`
- -11 module half `452f1465`, `3451fdb7`
- -12 module half `876f2899`
- -13 `5a759893`
- -14 `1e376f51`
- -15 `e00bb70f`
- -16 `5ba6516c`
- -17 `f131b6ee`
- -18 `25fd3172` (debug lines only)
- -19 `a86a769e`
- -20 `b60f4dd4`
- -21 `a4f3d32c`
- -22 `9b597ba3`
- -23 `2bf05359`
- -24 `7130fade`
- -27 `f1b06537`; the routing rows for prompts and lookup (`prompt-markers.md`, `rules-lookup.md`)
  were already in `context/foundry/README.md` before wave 3, and `ff72c4d4` updates the
  `prompt-markers.md` use-doc
- -28 pinned at the checkpoint
- -31 `bc8ef0f3`
- -32 item 2 `1ea35e09`, item 3 `f1b06537`
- -33 `be5c783b`
- mcp-fork-24 `876f2899`
- mcp-fork-2 module half `1fb8c610`
- mcp-fork-10 parity `c56d3196`
- mcp-fork-15 module half (KINDS/PATCH_KEYS, contract test)
- mcp-fork-20: no module half; the index row is `e064e930`
- aoe-movement-portals-38 prompts half `020bde4c`, table `e0444215`

**Skipped or open:**
- -32 item 1, the type-ahead listener uninstall (W3-PR1).
- The fork halves of -11, -12 and mcp-fork-15 (W3-PR4).

**Known bugs fixed**, one `[declared]` commit each:
- DP6 `1e376f51`: `replaceMany` rejected a bare TypeError instead of `BAD_SPEC`.
- DP7 `e00bb70f`: a `data:` image was fetched as `/data:…`.
- `0dfb854a`: a patch's `cr: "1/2"` was written as NaN, so the real run's XP was below its dry run's.
- `35ff884c`: two parallel gathers dropped a manifest.
- DP11 `e451d4a7`: two GM tabs duplicated the marker actors and the folder.

**Async (§5.9).**
- Fixed:
  - `ensureMarkers` repairs are batched (`30c47bf2`).
  - The manifest ring writes through one `serialStore` (`35ff884c`).
  - DP11 creates with a deterministic `_id` and `keepId` (`e451d4a7`). It relies on the §5.9.2
    keepId probe, which has not run live.
- Open: the `replace` query is not idempotent across GM tabs (W3-PR3).

### ties — `ties-1…46`

**Frozen files touched** (30 M).
- **Import paths only:** S12 renames `cb65b749` (`look.mjs` → the `-app`/`-ui` names, in the
  `ui-*` tests and `i18n.test`).
- **Format-only fixtures:** S10 `771f1716` (`boot.mjs`, `world.mjs`) and `a673a72b` (`stubs.mjs`).
- **S8's survival check** in `api.test`, as the guide planned (`2a006ff8`).
- **The declared flips:**
  - B1b `0b322d2e` / `99d13957` (`api`, `d1-rename`, `inspect-player`, `surface-legacy.json`);
  - B1 `fc593f98` / `c32fc76b` (`glue-player`, `ui-canvas`);
  - B11 `a0985d1f` / `c6222b13` (boot goldens);
  - B2 `468c4eee` / `1693599c`;
  - B3 `5b47b528` / `9bbca55a`;
  - B4 `c31bd116` / `c9f3e284`;
  - B6 `f7aa8929` / `8bf658c6`;
  - B7 `ff8f3242`;
  - ties-46 `28b913e2` / `313c7df8`;
  - ties-44 `a337f1fb` (the i18n key-count pin goes from 473 to 533);
  - the two todo pins: `2257ae61` / `ae89ff94` and `171c6e4f` / `8f3e120e`.
- `declared.test.mjs` holds each "before" half, which its `[declared]` commit flips.

**Findings → commits.** Each finding's Status line in `code-audit-2026-10/ties.md`:
- -1 `58af29d1` (wave 2)
- -3 `7cb9e4f9`
- -4 B2 `468c4eee`
- -5 and -6 `bf44258f`
- -7 `5c5821f4`
- -8 `fbc7c696`
- -9 `1d660cc8`, `f6de047c`
- -10 B3 `5b47b528`
- -12 `44c8d9ea`, `8920256f`
- -13 `f1e4891a`
- -14 `b4479e1a`
- -15 `f6de047c`, `b0cbfeea`, `1d7f327d`, `372071ed`, `607bc494`
- -16 and -18 `3efd5a15`
- -17 `a5150027`
- -19 `e61d90df`
- -20 `3d0adb60`
- -21 `acca4b22`
- -22 `5a3c9e8b`
- -23 `ccdbc09f`
- -24 B7 `697b7330`, plus item 3 `6f1fca29`
- -25 B7 `ff8f3242`
- -26 B7 `ade1a595`
- -27 `f3a707a4`
- -28 `6a97fae5` (savings pinned by `cad6f949`)
- -29 B4 `c31bd116`
- -30 B5 `77be499b`
- -31 `43c4c6a5`
- -32 B6 `f7aa8929`
- -33 `0ff23728`
- -34 `4312f33a`, `b0cbfeea`
- -35 `29560557`, `e688e96f`
- -36 `c9276cb8`
- -37: the wave-1 checkpoint
- -38 partly: `4502d41f` (W3-T2)
- -39 `0eb4f394`
- -40 `691f89e1`
- -41 `34c9144c`
- -42 `3b9976ba`, `b0785d60`, `d3fb7630`
- -43 `c5b5fb7b`
- -44 `607bc494`, `a337f1fb`
- -45 `0d28d169`, `a029b6b9`, `c5b5fb7b`
- -46 `28b913e2`

**Skipped:**
- -38's socket merge (W3-T2).
- B10 (blueprint gap G3, W3-T3).

**Review fixes after the lane:**
- `[declared]` `6cf45894`: a hot re-import re-wires the look menu's double-click (dev path).
- `[declared]` `e45a3a96` / `aa63fff2`: `describe()` lists the `attrSelected` User flag it writes.
- `af666f5b`: literal key maps.
- `32aa2d24`: entry header.
- `cad6f949` and `d3bd0e51`: tests for the perf savings and for ties-24 item 3.
- `41fa7d31`: an orphaned comment.
- `9ec64a79`: comments use the S12 file names.

**Known bugs fixed**, each a `[declared]` commit:
- `2257ae61`: `readBeliefs` turned a null tier into rung 0.
- `171c6e4f`: the clamps read a missing strength as 1 instead of 3.
- B4 `c31bd116`: a missing roll-mode API stranded the claim.
- B6 `f7aa8929`: describe-card art was not escaped.
- `6cf45894`: the hot re-import left the double-click dead.

**Async (§5.9).**
- The conduit claim (`stakeAndConfirm`, ties-39) elects one *tab*.
- B5 serialises knowledge writes.
- The relay only fills blanks, so it is idempotent.
- Open: C59 for Share and `migrateLegacy` (W3-T5), and -38 (W3-T2).

### portals — `aoe-movement-portals-24…43`

**Frozen files touched** (18 M).
- `seams.mjs` (S3, import paths).
- The `core.test` todo flip (`b870dc71`).
- D-P1 `d132395c`: `glue.test` and `publish.test`.
- S7 `2e15ab61`: `pp-` → `ppt-` selector renames and nine HTML goldens (rename only, checked line by line).
- The hygiene commit `a3ade332`: clear-image payload (untagged).
- -27 `6b892145`: the snapshot KNOWN.
- D-P3 `0f06790a`: the hooks pin.
- D-P4 `0fe9e4b8`.
- D-P5 `59a1e99b`, `413fed02`.
- D-P6 `8a060d21`.
- C59 `be2573e3`, `5c34cda8`: `card-app`, plus a world-fixture stub.
- One undeclared loosening: `fe8938fe` makes the D-P1 key-list pin a subset check. The exact list
  lives in `golden/surface.json`.

**Findings → commits** (the audit's "Wave 3 status" table):
- -24 D-P3 `0f06790a`
- -25 `f6bbd2dc`
- -26 `a5a52410`, `ff66ad35`
- -27 `38c366fd`, `6d2785e4`, `6b892145`, `09ec04f9`, `7f50014c`
- -28 D-P4 `0fe9e4b8`
- -31 rows `b3812eda` (integrator)
- -32 `bf362fd4`, `d132395c`, `fe8938fe`, D-P5 `59a1e99b` and `413fed02` (rest: W3-P2)
- -33 `186cdfb1`, `14f86c48`
- -36 `477e39e2`, `24cc1b58` (unifying with aoe: W3-P1)
- -38 `b87d8c15`, table `e0444215`
- -43 `ae936c07`, D-P6 `8a060d21`
- C59 `be2573e3`, `5c34cda8`, `05b79e3e`

**Skipped:** -29 waits for Wave 7, because the `languages` entry is a `module.json` edit.

**Known bugs fixed:**
- D-P5 `59a1e99b`: `cardFor(null)` threw.
- D-P6 `8a060d21`: an actor-flagged aoe handle crowded arrivals.
- D-P4 `0fe9e4b8`: the losing GM tab toasted "already exists".
- `6b892145`: a snapshot of an unloadable image rejected the raw error.

**Async (§5.9).**
- Summons follow in both GM tabs. `keepId` lets the server refuse the second create, and the
  loser stays quiet (D-P4).
- The card switches and unlink write in one batch (C59, `[declared]`).
- The six region hooks share one debounced redraw (D-P3).

### creatures — `transform-creatures-25…40`

**Frozen files touched** (4 M).
- `glue.test`, `glue-player.test`, `publish.test`, `glue-libwrapper-throws.test`. Each flip is in
  its own `[declared]` commit: C-D1 `9c571421`, C-D2 `ef2578d6`, -29 `cdb694e2`, -31 `008647a0` /
  `54f2d1b2` / `a8d5eadd`, -26 `4b0ebf74`, -25 `2f844f6b`, -27 `a6a0d549` (every light write's
  `argc` pin goes from 2 to 3), -40 `23fa387a`, `inspect()` `61216f31`.
- No golden changed. `senses-handoff.json` (C-L1) is untouched.

**Findings → commits:**
- -25 `2f844f6b`
- -26 `4b0ebf74`
- -27 `a6a0d549`
- -28 characterised (W3-C1)
- -29 `cdb694e2`; adjustments row `f8e50927`
- -30 `fdab0bf`
- -31 `008647a0`, `54f2d1b2`, `a8d5eadd`; review fix `6bc62f3a` (`ownerSees(null)` answers false
  without spending the warn-once)
- -40 `23fa387a`

**Skipped:** `overrideFor`, a -29 seam. It would read private fields for every unseen token on a
hot getter.

**Known bugs fixed:**
- -26: the light queue was pushed back by steady traffic.
- -27: our own write re-queued a pass.
- -29: an override failure vanished.
- -31: `syncScene` with an array threw, and `ownerSees(TokenDocument)` was wrong.

**Async (§5.9).** Lights are written by the active GM user, so both GM tabs may send the same
update. That is harmless, because `lightUpdate` is idempotent. Visibility and the strip are per
client and write nothing.

### senses — `senses-walls-cursors-10…38`

**Frozen files touched** (29 M).
- **Import paths:** `0bd574da` (`core`, `light-core`, `migrate` and the two `legacy-*` oracle
  fixtures). The same commit appends two tests: `core.test`'s VERSION row and `glow.test`'s -22a
  KNOWN pin (the one `ff544d99` later flips).
- **Appended rows** at steps 2 and 5: `a3388e0b` (`util.test`) and `a1ea3e1a` (`hooks.test`).
- **Pin flips, each in a named `[declared]` commit:**
  - S-1/S-2 `88f85d98` (`surface.json`, `hooks-uninstall.json`, published keys);
  - S-3 `a6561663` (`hooks.json`);
  - S-4 `92cc591f`;
  - J10 `f76e7f91`;
  - the glow label `7b5d79fd`;
  - S-5 `763dda0f`;
  - S-6 `9fda315e` (four light goldens);
  - S-8 `6d43eb7e`;
  - S-11 `980958eb`;
  - S-12 `c5af5e88`;
  - S-13 `59870f95`;
  - S-14 `ab430bed`.
- **Untagged:** -22 `ff544d99` (perf only).

**Findings → commits** (the audit's "Status (wave 3)"):
- -10 `a3388e0b`, chain half `763dda0f`
- -11 `c1478be1`, `59870f95`
- -12 `13bd7517`
- -13 `13bd7517`, `90273143`, `e4a8f0c7`
- -14 `9fda315e`, review `44b58841`
- -15 `2ae44ef8`
- -16 and -17 `a1ea3e1a`
- -18 `a3388e0b`
- -19 `282d6c16`
- -20 `42c4cfb7`
- -21 `13bd7517`
- -22 `ff544d99`
- -23 `a1ea3e1a`
- -24 `9e0c3a20`, `7b5d79fd`
- -25 `c5af5e88`, `41cc0954`
- -26 `13bd7517`, `6d43eb7e`, `cece01a2`
- -27 `a269f91d`, `4e9cc5bf`; context half `cd1ce5b5`, `5d1cca94`
- -29 rows `287a945c`
- -34 `f76e7f91`, `88f85d98`
- -38 `980958eb`

**Skipped:** -26's optional `linkInfo()` and -38's optional `torchActivityPlan`. Both are features
and neither is needed for the fix.

**Known bugs fixed:**
- S-14 `ab430bed`: the glow's bright radius only ever shrank.
- S-11 `980958eb`: compendium torches got the activity.
- S-8 `6d43eb7e`: a Token uuid or an off-scene id was refused.
- S-7 `2ae44ef8`: a failed sync was an unhandled rejection.
- S-13 `59870f95`: a wasted prototype write on synthetic actors.
- S-5 `763dda0f`: a legacy `-=` delete.

**Async (§5.9).**
- The carried-light sync, the torch activity (fixed id), the token light writes and the darkvision
  reset are idempotent across tabs.
- Open:
  - the two-GM-tab Light reconcile (W3-SE1);
  - C59 in `setupLight` and `syncAll` (W3-SE2, W3-SE3);
  - the hidden-anchor chain (W3-SE4, a visibility question, not async).

## Merge notes (for Joe; nothing merged)

1. **`migrate/wave-3` into `main`:** clean. `main` has one commit since `wave-3-base` (`3ab3610f`,
   a wave-2 report line). It touches no file this branch touches, and `git merge-tree` reports no
   conflict.
2. **`feature/module-bundles`** (57 commits on top of `main` `3ab3610f` at the critic check, and still
   growing; backup and boot code in
   `scripts/foundry/cloud.py`, `storage.py`, `boot.py` and others): the only shared file is
   `context/foundry/README.md`.
   - Bundles edits the make table; wave 3 regenerated the Module APIs table. They are different
     hunks, and `git merge-tree` reports no conflict.
   - Whichever lands second: run `make foundry-module-index` and `make check-context`, and take the
     generator's table rather than hand-merging it.
   - Wave 3 touches none of the five files that workflow owns.
3. **Order:** either order works. If bundles lands first, wave 3's live plan step 1 ("upload queue
   empty") still applies, because the backup path is bundles' after its merge.
4. **Fork:** `migrate/wave-3` = `origin/pentaryn` + `a5ce74c`, a description string only. Merge it
   into `pentaryn` after the live phase (W3-L1 decides whether it is deployed in that session).
5. **Not in this branch:**
   - The Wave 7 `module.json` batch. [`wave7-restart-batch.md`](wave7-restart-batch.md) carries the
     five rows (`d83d0b11`); no `module.json` was edited and no version moved.
   - Ties' `CHANGELOG` "Unreleased" section, and its additive rows "since 0.20.0". These ship with a
     version bump: `module.json` and `ties-core.mjs` `VERSION` move together.

## What wave 4 starts with

Order (Stage 4): **riders → aoe → transform → combat**, then D7's tooltip wiring and D8.

1. **Re-anchor each guide first.**
   - riders and aoe: `git diff 28ccc87..HEAD` is empty for both, so their re-anchored line numbers
     hold.
   - transform has 8 commits since `28ccc87` (PT3-3/4/6/7, 0.3.3, a kit stub re-vendor) and combat
     has 2 (PT1-6). Re-locate their anchors by text.
   - Re-score each module live. At HEAD: riders 47.8 %, aoe 50.0 %, transform 55.6 %, combat 50.0 %.
2. **Characterisation checkpoint per module**, as in wave 3: S1 writes it, and coverage is measured
   by this report's method.
3. **Contracts that wave 3 left pointing at aoe:**
   - portals' `isAoeHandle` and creatures' `isAoeHandle`/`isItemPile` are hand copies of aoe's
     `isHandleTarget` (`pentaryn-aoe/core.mjs:364-368`, aoe-movement-portals-43 and
     transform-creatures-30). When aoe migrates, pin all three against one oracle row set.
   - The Item Piles probe difference is W3-P1.
4. **Kit guard copies (W2-K1):** riders, aoe, transform and combat still carry the frozen-root guard.
   Each one's publish step replaces it with `publishNamespace` (`[declared]`, as J10 was for senses).
5. **D7 tooltip wiring:** combat 8.6 writes `argon-kit` first. Then riders' `#tooltip` selectors and
   transform's `.pentaryn-tt*` adopt the vendored shared CSS (tooling landed `d959b66`), which
   clears riders' and transform's C37.
6. **D8** (Starry expiry on unlinked tokens, tc-22) is a live-test question, not a code fix. Record
   it for transform's live session; build nothing.
7. **Carry-overs to schedule** (Joe's defaults below):
   - W3-T5, W3-SE1, W3-SE2 and W3-SE3 (the §5.9.1 batches and the two-tab reconcile);
   - W3-PR4 (fork halves of mcp-fork-15, prompts-lookup-11/-12);
   - the cursors aoe-shared adjustments row (cursors guide step 10).

## Live plan

[`wave-3-live-plan.md`](wave-3-live-plan.md) (`8d3d7736`), with goldens
`scripts/foundry/live-goldens/{portals,creatures,senses}.js` (`4c3b6b0f`) and the existing
`prompts.js` and `ties.js`. It has not run. The "Live phase (planned, not run)" section at the end
of this file has the summary.

## Open for Joe

### Recommended defaults (code-phase close, 2026-10-11)

Each row is an item from the list below, with an id and the default this report recommends. If Joe
says nothing, the default applies. "Closed" means the item was resolved during the wave, so there is
nothing to decide. The prose under this table is the detail, kept as the lanes wrote it.

| # | Item | Default | Why |
|---|---|---|---|
| W3-SE4 | senses: a chain whose anchor is hidden is drawn for players | **hide it**: one condition in `paint()`, as a `[declared]` visual commit | It leaks the hidden token's square on screen, and on-screen leaks are the ones that matter at this table. **Decided (Joe 2026-10-12): fixed `97df5ddf`** on `fix/overnight-2-2026-10-12` (pin flipped in `1f999831`). senses stays 0.4.1; the bump rides the wave 5 restart batch |
| W3-C1 | creatures/senses: the orphan 5/5 light after a senses hand-off (C-L1) | **keep**; watch for it in the live phase | Rare, and the GM can set the light to 0. Arbitrating needs a contract on both sides |
| W3-P1 | portals' Item Piles probe differs from aoe's | **keep them different**; revisit when aoe migrates in wave 4 | Documented on purpose (-36): aoe tolerates a false positive, portals must not |
| W3-P2 | portals: `spreadArrival → { moved, to }`, `teleportParty(ref, { from })`, refs on the legacy rows | **don't build now** | They are shape changes outside the guide's list. The new rows already take refs |
| W3-P3 | portals: C59 batching of the card's writes | **closed**: `be2573e3`, `5c34cda8` | — |
| W3-PR1 | prompts: the type-ahead's window listeners are never removed | **keep the permanent listener** | It only swallows releases of keys it already swallowed. Removing it extends a frozen export golden for a dev-path gain |
| W3-PR2 | prompts-lookup-18 log lines | **closed**: built as debug lines, `25fd3172`. Making the replace summary always-on is optional; default no | — |
| W3-PR3 | prompts: the `replace` query is not idempotent across GM tabs | **keep it bridge-only**, as the README documents | The bridge calls it in one tab. A request-id key is a new mechanism |
| W3-PR4 | fork halves of mcp-fork-15 and prompts-lookup-11/-12 | **schedule in the fork lane alongside wave 4** | The module side and its contract test (`KNOWN_DRIFT`) are done. Widening the fork's strict schemas is a declared fork change |
| W3-T1 | ties: the card layer's bare `#pentaryn-ties-cards` selector (C37) | **accept C37 for ties** for now; revisit with D7's shared CSS | A class would churn seven canvas goldens for an invisible change |
| W3-T2 | ties-38: two socket listeners, one per caller | **keep two** | Works today. Merging them flips three frozen socket pins |
| W3-T3 | ties B5 keeps `false` for a player write; B10 not taken | **keep both as they are** | B10 waits on blueprint gap G3 |
| W3-T4 | ties-24 item 3 | **closed**: `6f1fca29` | — |
| W3-T5 | ties C59: Share's per-PC writes; `migrateLegacy` | **batch Share** as one `[declared]` perf commit at the start of wave 4 (flips its named conduit pins); **leave `migrateLegacy`** | §5.9.1 makes batching a MUST, and portals set the precedent. `migrateLegacy` is a one-time copy-verify-clear, where going one actor at a time is safer |
| W3-SE1 | senses: both GM tabs run the Light reconcile (duplicate square, doubled whisper) | **build it**: a deterministic square `_id` with `keepId`, `[declared]`, after the live phase confirms keepId replace behaviour | §5.9.1 MUST. It is the same mechanism as prompts DP11, so one probe covers both |
| W3-SE2 | senses: `setupLight()` updates one torch at a time | **leave it** | A one-off GM command. The cost is paid once |
| W3-SE3 | senses: `syncAll` writes prototypes one actor at a time | **batch it** per world, as `resetSight` does, in one `[declared]` perf commit (flips the ready-chain order pins) | It runs at every ready. §5.9.1 / §5.9.4 |
| W3-T6 | ties: `ties-api.mjs` keeps C05 red | **keep it for one release** (the README's promise); retire it at the next ties version after grepping the world's macros | It is a compat barrel for outside `import()` callers |
| W3-L1 | live: deploy the fork's `a5ce74c` in the same session | **yes** | One `kill -9`, and the GM reload happens anyway |
| W3-L2 | live: skip the checks that need a second GM tab (portals D-P4, prompts DP11) | **skip**, but run DP11's keepId probe once if W3-SE1 is wanted | Node tests cover the rest |
| W3-L3 | live: take a "before" run of `prompt-markers` for DP3 | **yes** | — |

The integration review's "write batching applied unevenly" note is answered by W3-T5, W3-SE2 and
W3-SE3. Its four untagged pin flips need no decision: they are listed in the Summary, and should be
treated as declared.

### The rows in detail

- **senses — a chain to a hidden anchor shows to players.** `chain.mjs` hides a chain from players
  only when the *chained* token is hidden; a chain whose *anchor* is hidden is still drawn from the
  visible end to the hidden token's square, so players see where it is. Pinned as today in
  `pentaryn-senses/test/chain.test.mjs`. Decide: hide it too (a [declared] visual change, one
  condition in `paint()`), or keep it (the chain is meant to be seen). Checkpoint `5e76c4a1`.
- **creatures — the orphan light after a pentaryn-senses hand-off (C-L1, transform-creatures-28).**
  Creatures lights a summon 5/5 and flags it; senses writes its item light over it, so creatures
  drops its flag; senses later restores the prior 5/5 *unflagged*. Nobody owns that light now: if
  the summon stops qualifying it keeps burning. Pinned as today in
  `pentaryn-creatures/test/golden/senses-handoff.json`. Decide: arbitrate (senses restores the
  creatures flag with the prior light, or creatures treats an exact radius match as its own — a
  [declared] change on one side and a contract test on both), or keep it (rare; the GM sets the
  light to 0 by hand). Migration done offline; nothing blocks on this.
- **portals — the Item Piles probe differs from pentaryn-aoe's.** `recordOf` asks
  `isValidItemPile(actor)` with no flag fallback; aoe's resolve.mjs passes the token and falls back
  to flags. Kept as is and commented (finding -36: aoe tolerates a false positive, portals must not
  leave a pile-PC behind). Decide: unify the two, or keep them different on purpose.
- **portals — three API shapes the audit proposed are not built.** `spreadArrival` still returns the
  token document (audit: `{ moved, to }`) and `teleportParty` has no `{ from }` scene option
  (audit -32); both are declared shape changes not in the guide's list. And the existing entries
  do not accept refs through `regionOf` (audit -32): guide S6 keeps today's document params on the
  legacy rows, and `regionOf` is unpublished, so `cardFor`, `lookAt`, `teleportParty` and `open`
  take documents only (`teleportParty('Scene.X.Region.Y')` throws on `.parent` / `.bounds`); the
  new rows resolve refs through the kit's `resolveRef`. Decide whether to add them.
- **portals — batching the Portal card's per-behaviour writes (C59 warning).** The switch and
  unlink loops `await` one `update` per teleport behaviour; batching them through the region's
  `updateEmbeddedDocuments` is one round trip but changes the frozen per-behaviour `update` pins,
  so it would be its own declared perf step. Usually one behaviour per region, so low value.
  **Landed after all (standalone pass 2, 2026-10-11): no decision needed — §5.9.1 makes batching a
  MUST and Joe's rule puts perf in the same wave.** [declared] `be2573e3` (switches), `5c34cda8`
  (unlink), each flipping its named pins; `05b79e3e` clears the scan's false positive. Live check
  in the portals guide's Result.
- **prompts — the type-ahead's window listeners have no uninstall (prompts-lookup-32 item 1).** The
  `keyup` (and `blur`) listeners are added when `typeahead-adapter.mjs` loads and are never removed;
  `uninstall()` clears the orphan sink only. Removing them needs two new exports on the adapter
  (`listenKeyup`, `unlistenAll`), and the frozen per-file surface golden (`golden/glue-exports.json`,
  key `typeahead`) pins its five. Decide: extend that pin (a declared golden edit) and build the
  uninstall, or keep the permanent listener (it only swallows releases of keys it swallowed).
- **prompts — gather/replace summary log lines (prompts-lookup-18) not built.** The gather's console
  line and replace's failure-path lines are pinned exactly by frozen tests, and logging is outside
  this wave's rule (performance, maintainability, hardening, LLM-read). Decide: build it (flips the
  two console pins, declared, console only) or drop it.
  **Built narrower in the standalone pass (`25fd3172`), no decision needed for it:** the phase split,
  manifest size and the replace summary are debug lines (`CONFIG.debug["pentaryn-prompts"]`), so no
  pin moved. Still Joe's, only if wanted: make the replace summary always-on (`log.debug` →
  `log.info`, one line in `replace.mjs` `logSummary`).
- **prompts — the `pentaryn-prompts.replace` query writes but is not idempotent across GM tabs
  (§5.9.1).** It is safe today: the fork reaches it through the bridge module, which calls the
  handler in its own tab. A `User#query` to the GM user would run it in every tab of that user
  (bridge + browser) and build every replacement twice. Documented in the README ("Two sessions").
  Decide: keep it bridge-only (as documented), or key replace runs by a request id.
- **prompts — the fork halves of mcp-fork-15 and prompts-lookup-11/-12 are open.** The module side
  is done (`prompts-core.mjs` `KINDS`/`PATCH_KEYS`; the manifest is the query table;
  `test/contract.test.mjs` checks the fork's kinds, sizes, feature types and patch keys and pins
  `KNOWN_DRIFT` = `character.folder`, `gather.from`). Fork lane: the checked-in vocabulary copy and its
  test, `ACTION_TABLE`; widening the fork's strict schemas for the two drift keys is a declared fork
  change the audit deferred.

- **ties — the canvas card layer keeps its bare id selector (C37).** `#pentaryn-ties-cards` is the
  one selector not under `pt-`; giving the layer a `pt-cards` class changes the element seven canvas
  goldens pin, so it would be its own declared (invisible) DOM change. Decide: take it, or accept
  C37 for ties. Everything else in `styles/ties.css` is under `pt-` (`5854be46`).
- **ties — one socket listener per caller kept (ties-38).** The relay and the study conduit both
  register through `socket-adapter.mjs` `listen()` and both ask the kit's `isActiveGM`, but each still
  calls `game.socket.on` itself; folding them into one dispatcher flips three frozen socket pins.
  Decide: a declared merge, or keep two listeners (works; a third GM action would add a third).
- **ties — B5 keeps `false` for a player write; B10 not taken.** The guide offered `null` for a
  player-client knowledge write (B5); the serialised store keeps today's `false`. `pinnedCards` stays
  a hidden client row without labels (`CLIENT_STATE`), waiting on blueprint gap G3. Decide whether
  either is wanted.
- **ties — ties-24 item 3 (worn badges diff instead of rebuild) not built.** Items 1–2 landed
  ([declared] B7). The diff changes the PIXI call pins in the worn goldens. Low value (GM only, few
  badges).
  *Update:* closed by `6f1fca29` — a whole-plan skip (unchanged plan + live layer → no rebuild)
  instead of a per-badge diff; no frozen golden changed, so nothing left to decide here.
- **ties — two C59 sequential-write warnings recorded, not batched.** Share's per-PC writes
  (`study/share.mjs` ~252: one identification and one granted write per PC) and `migrateLegacy`
  (`ties-adapter.mjs` ~325, one-time, copy-verify-clear per actor). Batching changes the frozen
  call-order pins in the conduit goldens. Usually 1–4 PCs; recorded only.

- **senses — two GM tabs both run the Light reconcile (§5.9 async review).** The reconcile, the
  deletion hooks and the ready sweep are gated on `isActiveGM()`, which elects a *user*; with the MCP
  bridge tab and a GM browser tab open, both run. For a Light cast on a square both tabs create the
  AmbientLight (two squares until the next reconcile or sweep removes one), and a "the creature is
  gone" whisper is posted twice. The carried-light sync, the torch activity (fixed id
  `psLightToggle000`), the token light writes and the darkvision reset are idempotent. Not changed
  (a behaviour change with no guide step). Decide: a deterministic square `_id` created with
  `keepId` (needs a live probe: an embedded create with an existing id), or a claim keyed by the
  cast's `at` stamp (claims are never cleared, so one flag per cast accumulates on the item), or
  keep it (rare: one GM tab at a time). Migration `4e9cc5bf`.
- **senses — `setupLight()` updates each torch one at a time (C59 pattern).** A one-off GM command
  over every torch in the world; batching per parent actor is one round trip each but changes the
  frozen per-item `update` pins in `setup-light.json`, so it would be its own declared perf step.
  Low value; recorded, not built.
- **senses — `syncAll` writes prototypes one actor at a time (C59 pattern, §5.9.4).** The ready
  chain's `syncAll` awaits one `actor.update` of the prototype per actor that needs a write, plus one
  `updateEmbeddedDocuments` per scene per actor. Batching per world (`Actor.implementation.
  updateDocuments`, as `resetSight` does) is one round trip, but it changes the glue ready-chain call
  order pins, so it would be its own declared perf step. On a converged world it is mostly no-op
  writes; recorded, not built. Migration `4e9cc5bf`.

- **ties — `ties-api.mjs` keeps C05 red (integrator, 2026-10-11).** With the scorer now following
  `export … from` (`6ceb2460`), ties' only unreachable file is `ties-api.mjs`, the README's
  "one-release barrel over core, adapter and settings" that nothing in the module imports (for
  outside `import()` callers). Decide: keep it a release (and accept C05 for ties), or retire it
  (grep the world's macros for `ties-api.mjs` first).

- **Live phase — three choices before go ([`wave-3-live-plan.md`](wave-3-live-plan.md) §12).**
  W3-L1: deploy the fork's description-only `a5ce74c` in the same session (default yes: one
  `kill -9`, and the GM reload is needed anyway). W3-L2: skip the two checks that need a second GM tab
  (portals D-P4, prompts DP11; default skip, node tests cover them). W3-L3: take a before-run of
  the `prompt-markers` tool for the DP3 compare (default yes).

## Known red commits and ranges (bisecting)

| Where | Range | What |
|---|---|---|
| portals: C32 / `foundry-adjustments-check` | `f6bbd2dc` → the ADJ batch commit | the S3 split moved the markers out of `portals.mjs`, and the two existing `adjustments.yml` rows still list it; fixed when the integrator lands the portals rows |
| portals: module-check imports gate | `ae936c07` → `186cdfb1` (`ae936c07`, `8a060d21`, `b87d8c15`, `186cdfb1`) | `test/aoe-handle.test.mjs` imported `../../pentaryn-aoe/core.mjs` across modules; fixed `4d6f0c4b` (a cited oracle copy); module tests stayed green |
| prompts: module-check i18n gate | `5ba6516c` → `02600db9` | `test/i18n.test.mjs` held a bare `"PENTARYN_PROMPTS."` literal the gate reads as a missing key; node tests stayed green; fixed `02600db9` |
| prompts: C32 / C47 (advisory) | `f5a05191` → the ADJ batch commit | `wrapMethod` names `prompts-token-dblclick` and the code names item-piles; both rows wait in the integrator list (scored on a copy with them: 97.9 %) |
| prompts: `scripts/tests/test_update_escalation.py -m repo` (`test_real_exposure_has_no_known_false_positives`) | `ec66c6df` → the integrator's edit of that test | step 10 renamed `los.mjs` → `sight-adapter.mjs` and step 13 added `"flags.wall-height"` to `api-manifest.mjs` `flags.reads`, so `exposure("wall-height")` is `[api-manifest.mjs, sight-adapter.mjs]`, not `[los.mjs]`; shared file, exact edit in the prompts integrator list (also refreshes the `levels` xfail comment: the template is now in `core/gather-text.mjs`). Module tests stayed green |
| ties: C32 / C47 and `foundry-adjustments-check` (advisory) | `c9276cb8` (S4) / `e688e96f` (S4b) / `cb65b749` (S12) → the ADJ batch commit | `core-ties-flag-wipe`, `dsn-skip-blind-study` and the ties path of `dnd5e-legacy-roll-modes` still list `known-core.mjs`, `look.mjs`, `preview.mjs`, `study.mjs`; the new item-piles row is not in yet. Scored on a copy with them: 96.0 %. Module tests stayed green |
| ties: module-check i18n gate | checkpoint `7395a708` → (open) | `test/i18n.test.mjs` (frozen) holds a bare `"PENTARYN_TIES."` literal the gate reads as a missing key; node tests green. Same shape as prompts' `02600db9`, but the ties line is in a frozen test, so it is not edited in this wave |

**Closed by the wave-3 integrator (2026-10-11):** the portals, prompts, ties C32/C47 and
`foundry-adjustments-check` ranges end at the adjustments commits `b3812eda` (portals), `6cf39b60`
(prompts), `38a9d2e5` (ties), with creatures `f8e50927` and senses `287a945c` closing theirs; the
prompts `test_update_escalation.py` range ends at `8ae0bec3` (ties' two paths at `414a6550`); the
ties module-check i18n gate is green from `2cab16e9` (the gate skips a bare `"NS."` literal; the
frozen test is untouched).

## ties — standalone-finding review (2026-10-11)

Every §4 commit was checked against its audit finding, the frozen checkpoint (`7395a708`) and §5.9.
The only checkpoint test or golden edits are in the [declared] commits and their golden commits
(B2, B3/ties-10, B4, B6, B7/ties-25, ties-46). `node test/run.mjs` passed twice after the fixes:
250 pass, 0 fail, 0 todo, plus LEGACY 183, 9 and reach. `vendor.py check` is identical and
conformance is still 87.8 %.

- **Fixed in this review.** `cad6f949`: ties-21, -23, -27 and -28 had no test of the saving itself,
  only goldens showing the output was unchanged. `test/perf-scans.test.mjs` now counts the reads
  from each moved call site, and each case fails when its fix is reverted. `d3bd0e51`: the ties-24
  item 3 tests did not cover the `state.painted = null` reset. A new case paints the last good
  plan again after a paint that failed partway; it fails without that line. `41fa7d31`: removes the
  orphaned `LIVE_MS` doc comment left in `look-app.mjs` after ties-40.
- **For the live-test run: B3 covers more commits than are tagged.** §5 B3 lists ties-3, -5, -6,
  -8, -9 and -10, but only `5b47b528` (ties-10) is tagged [declared] B3. The other additive commits
  are `7cb9e4f9` (ties-3), `bf44258f` (ties-5/-6), `fbc7c696` (ties-8) and `1d660cc8` (ties-9). They
  also update the S8 goldens `describe.json` and `surface.json` in the same commit. Those goldens are
  not checkpoint-frozen and nothing goes red. History is not rewritten; treat all five as B3 when
  checking at the table.
- **Red windows for bisecting.** Each behaviour commit below fails until its golden commit lands,
  because the golden follows in its own commit as §5 requires. Module tests are green from each
  golden commit onward.

  | [declared] commit | Red until |
  |---|---|
  | `468c4eee` (B2) | `1693599c` |
  | `5b47b528` (B3) | `9bbca55a` |
  | `c31bd116` (B4) | `c9f3e284` |
  | `f7aa8929` (B6) | `8bf658c6` |
  | `28b913e2` (ties-46) | `313c7df8` |

  The same holds for every other ties `[declared]` commit whose golden follows in its own commit
  (critic check, each tree's `node test/run.mjs` exit code): B1b `0b322d2e` → `99d13957`, B1
  `fc593f98` → `c32fc76b`, B11 `a0985d1f` → `c6222b13`, `2257ae61` → `ae89ff94`, `171c6e4f` →
  `8f3e120e`, `e45a3a96` → `aa63fff2`. Every other `[declared]` commit in the five modules is green
  at its own tree.

## Integration (wave 3, 2026-10-11)

The integrator applied every lane's shared-file list on `migrate/wave-3` (code phase; nothing
synced, nothing live). Commits, oldest first:

| Commit | What |
|---|---|
| `2cab16e9` | module-check i18n gate skips a bare namespace literal (`"PENTARYN_TIES."`); ties' gate green without touching its frozen test |
| `38a9d2e5` · `414a6550` | ties adjustments rows (moves + `itempiles-ties-pile-check`); escalation test paths |
| `6cf39b60` · `8ae0bec3` | prompts rows (`prompts-token-dblclick`, `itempiles-prompts-hotspot`); `wall-height` exposure and the `levels` xfail note |
| `f8e50927` | creatures rows (`creatures-libwrapper` rewrite, `argon-creatures-strip-float`, `itempiles-creatures-pile-flag`) |
| `287a945c` | senses rows (five step-12 rows; `argon-light-pick-collapse-panels` → `argon.mjs`; chat-message-types → `light-ui.mjs`) |
| `b3812eda` | portals rows (two moves, four new) |
| `b631badf` · `d83d0b11` · `ca85f637` | `adjustments-batch.md` marked; Wave 7 batch rows filled; guides' Result rows |
| `bc344835` · `5d1cca94` | prompts and senses ModuleSpec comments; prompts after-sync adds `selftest()` |
| `ff72c4d4` | `prompt-markers.md` (`typeahead-adapter.mjs`, the new reads); lookup's TWIN comment |
| `0291ce2a` | D1 aliases gone: `addon-blueprint.md`, `attributes.md` (:203 and step 5), `live-goldens/ties.js` |
| `e3fe7db9` · `e064e930` | module index keeps senses' `chain` alias; index regenerated; ties ref quirk; portals route row |
| `e0444215` | `scene-links.md` console table; `markers.md` "Who checks for Markers and crowd" |
| `6ceb2460` | scorer: C05 follows `export … from`, C50 reads `reg.once("ready", …)` |
| fork `a5ce74c` | `pentaryn-read` description: ties and prompts have `describe()` |

`scripts/foundry/live-goldens/prompts.js` already existed (`8a70e6ff`); its calls (`status`, `gather`,
`list`, `model`) are unchanged, so nothing new was needed.

Gates at the end (all static): every module's node tests through `make foundry-modules-check` (20/20
pass their gates); prompts with `FOUNDRY_MCP_FORK` 225/225; `pytest -q` 1203 passed, 2 skipped,
3 xfailed; `make foundry-lib-check` 82/82; `make check-context` OK; `make foundry-adjustments-check`
112 rows OK (every new or moved marker misspelt on a copy is caught); `vendor.py check --all` identical.
Fork: vitest 275 + 43 pass, `npm run typecheck` clean (after `build:shared` into the worktree's own
`shared/dist`, missing in a fresh worktree), `scripts/fork-footprint.sh` OK.

Conformance (`conformance.py`, fail-class rules) before → after integration:

| Module | Before | After | Still failing |
|---|---|---|---|
| prompts | 93.8 % | **97.9 %** | C07 (Wave 7) |
| ties | 87.8 % | **91.8 %** | C05 (`ties-api.mjs`, the macro-only compat barrel nothing imports), C07, C09, C37 (card layer, Open for Joe) |
| creatures | 89.6 % | **93.8 %** | C07, C09, C37 (Wave 7) |
| portals | 87.0 % | **91.3 %** | C07, C09, C37, C51 (Wave 7) |
| senses | 91.5 % | **93.6 %** | C07, C09, C37 (Wave 7) |

No other module's score moved.

## Integration review (wave 3, 2026-10-11)

A review of the whole branch: `wave-3-base..HEAD` (296 commits after the two fixes below) and the
fork's `origin/pentaryn..HEAD` (1 commit). It found nothing from `foundry/logs/**` and no secrets.
Kit copies are byte-identical (`vendor.py check --all`). Every gate is green again after the fixes.
`make check-lore` is red (47 links), but this branch touches no lore file, so the red is not
from wave 3.

**Lanes.** Only one commit touches another lane's module: `ff72c4d4` (prompts) edits a comment in
`pentaryn-lookup/lookup-core.mjs`, and its subject says so. No shared-scope commit (plans, adjustments,
ops, blueprint) touches module code.

**Contracts.**
- prompts and lookup: the TWIN copies agree. `SIZE_WORDS` equals `SIZE_KEYS`, and `parseCr`
  equals `crNum`.
- prompts and the fork: the five `pentaryn-prompts.*` query names match. The fork-mode contract
  test passes, 225/225.
- ties' D1: `attributes.lookup` and `study.examine` are the names in use. The old names appear
  only in history lines, the d1-rename test and the live golden's labelled keys.
- portals `ppt-` and prompts `pp-`: there is no overlap and no `[class*=…]` selector. Before S7,
  portals did not depend on any rule in `prompts.css`; its one shared name, `.pp-text`, was
  scoped on both sides.
- The scaffolding rules: `markers.md` matches `isScenery` and `isScaffold`.
- senses and walls: the two modules share no code and no flags. Their only link is the shared
  audit file.
- describe goldens: `test/golden/describe.json` exists for all five migrated modules, and the
  index rows are generated from it.

**Fixed in this review.**
- `9ec64a79`: eight ties comments still named `look.mjs`, `preview.mjs` and `lore.mjs` after the
  S12 renames. Comments only; the frozen test comments are left as they are.
- `cd1ce5b5`: the context half of senses -27 had been handed to the docs batch and had not
  landed. `context/foundry/README.md` now gives senses its own routing row. The senses clause no
  longer says token vision follows sheet Darkvision. The Look window is now named `look-app.mjs`.

**Frozen tests.** Each module was diffed from its checkpoint to HEAD:
ties `7395a708`, prompts `bc12443e`, senses `5e76c4a1`, portals `0ca63b97` and creatures `6e4c7d7c`.
Every edit to a checkpoint test file falls into one of these groups:
- a [declared] commit or its golden commit;
- an import path;
- additive new tests;
- a fixture that only adds a stub;
- a change the guide planned: ties S8's survival check `2a006ff8`, and S10's format-only fixtures
  `771f1716` and `a673a72b`.

These edits change a pin but carry no [declared] tag. They are the same kind of gap as ties B3:
- portals `a3ade332` (hygiene) changes the clear-image write from `-=img: null` to
  `img: _del` and re-pins `card-app.test.mjs`. It is recorded as "hygiene" in the guide's Result.
- senses `ff544d99` (finding -22) flips the post-checkpoint KNOWN pin "200 epoch builds" to ≤ 40.
  It is perf only, with no visible change.
- ties `ae89ff94` and `8f3e120e` are the golden commits for [declared] `2257ae61` and `171c6e4f`.
  They pair with those commits but do not name them.

Treat all four as declared when bisecting. History is not rewritten.

**Not consistent across lanes (recorded, not built).** §5.9.1 says batching is a MUST (C59), and
portals landed its two loops as [declared] perf steps on that ground. Senses (`setupLight`,
`syncAll`) and ties (Share's per-PC writes, `migrateLegacy`) recorded theirs under Open for Joe as
"its own declared perf step" and did not build them. Senses' two-GM-tab Light reconcile is also a
§5.9.1 MUST (pick one *tab*, not one user), and it is recorded the same way. These items need a
decision on whether a later lane builds them in wave 3, not a review fix.

**Small, not fixed.** `live-goldens/ties.js` keeps the label `"describe (top, the card toggle)"`
for `typeof T.describe`. Since B1, that is the kit's `describe()`, and the card is
`describeCard`. The key is kept so a before/after diff lines up, and the value is still
`"function"`.

## Live phase (planned, not run)

The gated sequence is [`wave-3-live-plan.md`](wave-3-live-plan.md). Goldens: `portals.js`,
`creatures.js` and `senses.js` are new, in the wave-2 shared/declared split. `prompts.js` is
unchanged. `ties.js` changed only in `0291ce2a`: it calls `attributes.lookup` where it called the
removed `describe` alias, and keeps the `describe*` keys so a before/after diff lines up. Their
expected declared differences are in the plan's §6 table. No `module.json`
changes on this branch, so a GM tab reload deploys it; there is no Foundry restart. Nothing has run.

## Critic check (2026-10-11)

Every claim in this report was checked against git and the files. Nothing was run live.

**What was checked and holds:**
- Every hash resolves: 309 in pentaryn and 2 in the fork.
- The commit lists match `git log`: 299 commits, 65 `[declared]`, 8 tagged goldens.
- The frozen-test diff stats, and the commits behind each frozen-file edit.
- Every finding → commit pair, against the commit message or the audit's status line.
- The conformance scores at wave-3-base, at each checkpoint, before integration (`b7d00d54`) and at
  HEAD, each read with the scorer of its own tree.
- The node:test counts at each checkpoint and at HEAD, and the legacy counts.
- Prompts in fork mode: 225/225.
- `pytest`: 1203 / 2 / 3. `foundry-lib-check`: 82/82. `foundry-adjustments-check`: 112 rows.
  `check-context`: 5 warnings. `foundry-modules-check`: 20/20. `vendor.py check --all`: identical.
- Fork: vitest 275 + 43, typecheck clean, footprint OK.
- Checkpoint coverage and the line and function figures at HEAD.
- The merge-tree checks, the cross-lane commit, and the `check-lore` red (47 links).

**Corrected in place:**
- prompts:
  - step 10 touched 13 test files, not 11;
  - step 11 also touched `i18n`;
  - -27's "routing row `ff72c4d4`": the routing rows predate wave 3.
- portals: the checkpoint's node:test count had 1 todo.
- senses: `0bd574da` is not import paths only. It also appends the VERSION row and the -22a KNOWN pin.
- ties: six more `[declared]` → golden red windows were missing.
- The Summary's "what still fails" list was imprecise per module.
- Coverage: the branch figures jitter by about ±0.2 between runs.
- Bundles has 57 commits, not 54.
- Live phase: `live-goldens/ties.js` did change, in `0291ce2a`.

## Commit lists

`git log --oneline wave-3-base..8d3d7736` (pentaryn, 299 commits, newest first; this report's commits come after it) and the fork's `git log --oneline origin/pentaryn..migrate/wave-3` (1 commit). A subject carrying `[declared]` changes behaviour, and those commits are listed first. Four commits flip a pin without the tag (see the Summary): `a3ade332`, `ff544d99`, `ae89ff94` and `8f3e120e`.

**[declared] behaviour commits, pentaryn (65):**

```
e45a3a96 fix(ties): [declared] describe() lists the User flag attrSelected among the flags it writes
6cf45894 fix(ties): [declared] a hot re-import re-wires the look menu's canvas double-click
a337f1fb fix(ties): [declared] ties-44 — the last hard-coded English goes through lang/en.json
aac9fd39 fix(ties): [declared] B9 — the once-unguarded hooks log their own failure line
171c6e4f fix(ties): [declared] the tie clamps read a missing strength as the default 3, not the weakest 1 (known bug, todo pin flipped)
2257ae61 fix(ties): [declared] readBeliefs keeps a null tier null (known bug, todo pin flipped)
25fd3172 feat(prompts): [declared] prompts-lookup-18 — gather phase split and replace summary as debug lines
ff8f3242 perf(ties): [declared] B7 — no wire frame with nothing on screen (ties-25); the B7 pin flips
28b913e2 fix(ties): [declared-lite] ties-46 — the inspect window's PC roster refreshes on a character pick or an ownership change
ade1a595 perf(ties): [declared] B7 (half) / ties-26 — the sheet render chain injects once per render
697b7330 perf(ties): [declared] B7 (half) / ties-24 — worn badges: badgePlan, and players schedule no frame
f7aa8929 fix(ties): [declared] B6 / ties-32 — describe-card art is escaped; an item-mark icon is checked
77be499b fix(ties): [declared] B5 / ties-30 — knowledge and attribute-belief writes are serialised
c31bd116 fix(ties): [declared] B4 / ties-29 — a missing private roll-mode API refuses before the claim; a throw releases it
e451d4a7 fix(prompts): [declared] ensureMarkers creates by deterministic id with keepId — no duplicates across two GM tabs (§5.9.1)
5b47b528 feat(ties): [declared] B3 / ties-10 — numeric whenMs / deliveredMs beside the locale dates
35ff884c fix(prompts): [declared] the manifest ring writes through one serialStore, so two gathers at once keep both manifests (§5.9.1, C58)
5c34cda8 perf(portals): [declared] C59 — unlink drops the destination from every behaviour in one batch
468c4eee feat(ties): [declared] B2 — the legacy actor reads resolve an id, a name or a token (ties-4)
be2573e3 perf(portals): [declared] C59 — the Portal card's revealed/choice switches write every behaviour in one batch
a0985d1f feat(ties): [declared] B11 — publish through the kit: module.api and the two ready hooks (guide S9)
0dfb854a fix(prompts): [declared] a patch's fractional CR is written as the number the dry run reads (wave-3 checkpoint finding)
e00bb70f fix(prompts): [declared] DP7 crop images load under a route prefix; data:/blob: sources fetched as they are (prompts-lookup-15)
1e376f51 fix(prompts): [declared] DP6 replaceMany checks replacements is an array before anything iterates it (prompts-lookup-14)
aa12d127 perf(prompts): [declared] DP8 the hover tip reuses a cached scene model until the scene changes (prompts-lookup-8)
fc593f98 feat(ties): [declared] B1 — the description card is describeCard; describe() is left for the kit
0b322d2e feat(ties): [declared] B1b — remove the D1 aliases attributes.describe and study.inspect
ab430bed fix(senses): the broken glow's bright radius follows the wave back up [declared S-14, visual] (checkpoint finding, no audit id)
980958eb fix(senses): a torch created in a compendium no longer gets the Light activity [declared S-11] (finding -38)
763dda0f fix(senses): Break chain deletes the flag with _del, not '-=' [declared S-5] (finding -10, chain half)
6d43eb7e feat(senses): chain.link/break accept Token uuids on any scene; links(sceneId) [declared S-8] (finding -26)
1ea35e09 fix(prompts): [declared] DP5 window blur clears the type-ahead's swallowed keys (guide step 16)
9fda315e feat(senses): light.reconcile() resolves to what it did; light.recent() [declared S-6] (finding -14)
a86a769e feat(prompts): [declared] DP1 DP2 the kit-built API, published synchronously at ready (guide step 13)
2ae44ef8 fix(senses): a failed debounced carried-light sync warns with the module and actor [declared S-7, console-only] (finding -15)
876f2899 refactor(prompts): [declared] DP3 api-manifest.mjs; the queries register from it through the kit (guide step 13)
59870f95 fix(senses): no prototype write on an unlinked token's synthetic actor [declared S-13] (checkpoint observation, folded into -11)
8a060d21 fix(portals): [declared] D-P6 — an arriving PC ignores an aoe handle flagged only on its actor (-43)
c5af5e88 feat(senses): inspect(ref, opts) and light.status(item), read-only [declared S-12, additive] (guide step 11, finding -25; C29 after Wave 7)
413fed02 feat(portals): [declared] D-P5 (2/2) — teleportParty returns { moved, cancelled } (-32)
59a1e99b fix(portals): [declared] D-P5 (1/2) — cardFor(null) returns null instead of throwing a TypeError (-32)
0fe9e4b8 fix(portals): [declared] D-P4 — the GM tab that loses the follower carry stays quiet (-28)
0f06790a perf(portals): [declared] D-P3 — the six region hooks share one 50 ms trailing badge redraw (-24)
6b892145 fix(portals): [declared] -27 — a snapshot whose image cannot load rejects 'portal snapshot: cannot load <src>'
61216f31 feat(creatures): inspect(ref, { as }) — one token as plain JSON [declared]
7b5d79fd refactor(senses): the broken glow's label is an i18n key [declared, console-only] (guide step 8, finding -24 glow half; C36)
2e15ab61 style(portals): [declared] S7 — every class portals puts in the DOM is ppt- (was prompts' pp-)
23fa387a perf(creatures): the strip's dock poll runs only with Argon enabled and floatOverHud on (transform-creatures-40) [declared]
88f85d98 feat(senses): kit-built API from api-manifest.mjs, published with publishNamespace [declared S-1, S-2; findings -34, -26 alias] (guide step 7; C27, C28, C48, C50)
a6a0d549 perf(creatures): our own light writes no longer re-queue a no-op pass (transform-creatures-27) [declared]
f76e7f91 refactor(senses): retire the frozen-root publish guard (J10, finding -34) [declared]
2f844f6b perf(creatures): the strip ignores token moves (transform-creatures-25) [declared]
d132395c feat(portals): [declared] D-P1 — the API is built and published at ready, frozen, with kit members
4b0ebf74 fix(creatures): the light queue flushes 200 ms after the first change, never pushed back (transform-creatures-26) [declared]
a8d5eadd feat(creatures): status() — wrap, settings, writer and lit-token count in one read (transform-creatures-31) [declared]
54f2d1b2 fix(creatures): ownerSees answers for a TokenDocument through its placeable (transform-creatures-31) [declared]
008647a0 fix(creatures): syncScene takes an array, one id or documents at the API boundary (transform-creatures-31) [declared]
cdb694e2 fix(creatures): an owner-override failure warns once instead of vanishing (transform-creatures-29) [declared]
349ee868 style(creatures): scope the strip's CSS on #pentaryn-creatures.pcr-strip [declared]
92cc591f refactor(senses): hot re-import goes through the entry, not per-file sentinels [declared S-4, dev-only]
ef2578d6 feat(creatures): API manifest, kit-built API published at ready [declared]
a6561663 refactor(senses): the entry's ready publishes the chain alias after senses [declared S-3, registration-only]
f131b6ee refactor(prompts): [declared] DP9 no comment-only catch; a throwing core token API warns once (guide step 7)
f5a05191 refactor(prompts): [declared] DP4 double-click patch through wrapMethod + libWrapperRoute (guide step 6)
9c571421 refactor(creatures): Token#isVisible through the kit's wrapMethod getter route [declared]
```

**Their tagged golden commits (8):**

```
313c7df8 test(ties): golden for [declared-lite] ties-46 — the preview's hooks gain updateUser
8bf658c6 test(ties): golden for [declared] B6 — escaped art, the flame for a non-fa icon
c9f3e284 test(ties): golden for [declared] B4 — refused before the claim, the next roll lands
9bbca55a test(ties): goldens for [declared] B3 / ties-10 — whenMs / deliveredMs
1693599c test(ties): golden for [declared] B2 — the id, name and token reads return Caven's ties
c6222b13 test(ties): boot goldens for [declared] B11 — the two ready hooks
c32fc76b test(ties): surface golden for [declared] B1 — describe → describeCard
99d13957 test(ties): surface golden for [declared] B1b — the two alias rows go
```

**Fork (1):**

```
a5ce74c docs(fork): pentaryn-read's description — ties and prompts have describe() since wave 3
```

**All commits, pentaryn (299):**

```
8d3d7736 docs(plans): wave-3 live plan — gated goldens, sync-only deploy (no module.json change, one GM reload), probes, bridge reads, rollback; report rows W3-L1..L3
4c3b6b0f test(foundry): wave-3 live goldens for portals, creatures, senses — shared/declared split, run on the deployed and the wave-3 code
1a53ab2c docs(plans): wave-3 report — integration review: contracts, frozen-test diffs, untagged pin flips, C59 inconsistency
cd1ce5b5 docs(foundry): senses gets its own routing row; the senses clause drops the retired darkvision sync (senses -27 context half)
9ec64a79 docs(ties): comments name the S12 file names — look-app, preview-app, lore-ui (comment only)
aab092b2 docs(plans): wave-3 report — the ties-api.mjs row quotes the README instead of guessing its callers
ee8cb8f5 docs(plans): wave-3 report — integration record, closed red ranges, conformance before/after
ca85f637 docs(plans): wave-3 guides' Result rows — adjustments rows landed, Wave 7 rows recorded by the integrator
6ceb2460 fix(blueprint): two scorer gaps — C05 follows export…from barrels, C50 reads reg.once("ready", …)
5d1cca94 chore(ops): senses ModuleSpec comment — chain-core.mjs is gone; the pure code is core/*.mjs behind senses-core.mjs
e0444215 docs(foundry): portals console table in scene-links.md; markers.md compares the three scaffolding rules (-38)
e064e930 docs(foundry): module index regenerated for wave 3; ties reads take refs; portals on the scene-links route row
e3fe7db9 fix(ops): module index keeps a code-published alias next to the describe golden's namespace
0291ce2a docs(ties): the D1 aliases are gone (B1b) — blueprint, attributes use-doc, ties live golden
ff72c4d4 docs(prompts): use-doc and lookup's TWIN comment follow the wave-3 renames
d83d0b11 docs(plans): Wave 7 restart batch — wave-3 module.json edits for prompts, ties, creatures, portals, senses
bc344835 chore(ops): prompts ModuleSpec — node-test comment names core/*.mjs; after-sync adds selftest()
b631badf docs(plans): adjustments batch — wave-3 rows for prompts, ties, creatures, portals, senses marked landed
b3812eda chore(adjustments): portals rows follow the S3 split; four new rows (-31, C47)
287a945c chore(adjustments): senses rows — five step-12 rows (-29); the two moved-marker rows follow step 6
f8e50927 chore(adjustments): creatures rows — creatures-libwrapper rewritten for the getter wrap; argon-creatures-strip-float; itempiles-creatures-pile-flag
8ae0bec3 test(update): wall-height exposure follows prompts' sight-adapter.mjs and manifest; levels xfail note names core/gather-text.mjs
6cf39b60 chore(adjustments): prompts rows — prompts-token-dblclick (patch), itempiles-prompts-hotspot
414a6550 test(update): escalation tests follow ties' moved files (study/apply.mjs, look-app.mjs)
38a9d2e5 chore(adjustments): ties rows follow the S4/S4b/S12 moves; new itempiles-ties-pile-check
2cab16e9 fix(ops): the i18n gate skips a bare namespace literal ("NS.") — no key ends with a dot
b7d00d54 docs(plans): wave-3 report — ties standalone-finding review, B3 tagging gap, declared red windows
41fa7d31 style(ties): drop the orphaned LIVE_MS doc comment left by ties-40
d3bd0e51 test(ties): ties-24 item 3 — a failed paint, then the last good plan again, redraws
cad6f949 test(ties): pin the read-once savings of ties-21, -23, -27 and -28
e214cd64 docs(audit): ties-24 item 3 closed by 6f1fca29
6f1fca29 perf(ties): ties-24 item 3 — an unchanged worn-badge plan keeps the layer as drawn
0e841d65 docs(plans): ties hand-off — the pentaryn-read tool description still calls ties eval-js only
97ae4abd docs(plans): ties hand-off — attributes.md still promises the removed describe/inspect aliases
aa63fff2 test(ties): golden describe.json — flags.writes gains attrSelected (additive)
e45a3a96 fix(ties): [declared] describe() lists the User flag attrSelected among the flags it writes
af666f5b refactor(ties): literal key maps for the review hold and preview proficiency labels
6cf45894 fix(ties): [declared] a hot re-import re-wires the look menu's canvas double-click
32aa2d24 docs(ties): the entry header points at the kit-built API, not a hand-built object
270a5a04 docs(audit): ties-1 was closed by 58af29d1, not open
018c071c docs(plans): wave-3 report — ties open items and red ranges
42a54af3 docs(plans): ties wave-3 Result — steps, declared, standalone, score, deviations
5854be46 style(ties): the review and Look windows' rules re-rooted under pt- classes (guide S11, C37)
45b1472e docs(audit): ties findings carry their wave-3 status and commits
a337f1fb fix(ties): [declared] ties-44 — the last hard-coded English goes through lang/en.json
aac9fd39 fix(ties): [declared] B9 — the once-unguarded hooks log their own failure line
8f3e120e test(ties): goldens for the clamp fix — null / "" / true / [] take the default
171c6e4f fix(ties): [declared] the tie clamps read a missing strength as the default 3, not the weakest 1 (known bug, todo pin flipped)
ae89ff94 test(ties): goldens for the readBeliefs null-tier fix
2257ae61 fix(ties): [declared] readBeliefs keeps a null tier null (known bug, todo pin flipped)
3b9976ba refactor(ties): dead code out (ties-42)
d3fb7630 chore(ties): drop two hasNotes locals the row fragments made unused
3efd5a15 refactor(ties): the row helpers live once, in core/html.mjs (ties-16, ties-18)
a5150027 refactor(ties): the Attributes tab draws granted cards with the Known tab's grantedRegion (ties-17)
34c9144c refactor(ties): one mount() for a card, shared by show() and restorePinned() (ties-41)
3d0adb60 perf(ties): planStep normalises the registry and both ledgers once (ties-20)
6120b5f4 docs(prompts): standalone pass — status rows, guide Result, DP9 note, fork-check test list, -18 Open-for-Joe resolved
25fd3172 feat(prompts): [declared] prompts-lookup-18 — gather phase split and replace summary as debug lines
6a97fae5 perf(ties): the GM's kind picker walks the world once (ties-28)
f3a707a4 perf(ties): the review panel's personal-clue rows reuse its carrier map (ties-27)
ccdbc09f perf(ties): the Known tab reads the registry once per paint (ties-23)
5a3c9e8b perf(ties): the Ties tab scans for inbound ties once per paint (ties-22)
acca4b22 perf(ties): runCascade reads its loop invariants once (ties-21)
e61d90df perf(ties): the clamped attribute registry is memoised (ties-19)
c56d3196 test(prompts): mcp-fork-10 parity — the patch's Recharge n-6 row equals the fork's rechargeUpdate
ff8f3242 perf(ties): [declared] B7 — no wire frame with nothing on screen (ties-25); the B7 pin flips
1fb8c610 test(prompts): mcp-fork-2 module half — bridge handlers called with the data only, own queries plain functions
313c7df8 test(ties): golden for [declared-lite] ties-46 — the preview's hooks gain updateUser
28b913e2 fix(ties): [declared-lite] ties-46 — the inspect window's PC roster refreshes on a character pick or an ownership change
691f89e1 refactor(ties): one live-refresh kit, LiveHooks, for the Look and inspect windows (ties-40)
020bde4c docs(prompts): isScaffold names the other two Marker predicates and markers.md's table (aoe-movement-portals-38, prompts half)
ade1a595 perf(ties): [declared] B7 (half) / ties-26 — the sheet render chain injects once per render
697b7330 perf(ties): [declared] B7 (half) / ties-24 — worn badges: badgePlan, and players schedule no frame
8bf658c6 test(ties): golden for [declared] B6 — escaped art, the flame for a non-fa icon
f7aa8929 fix(ties): [declared] B6 / ties-32 — describe-card art is escaped; an item-mark icon is checked
77be499b fix(ties): [declared] B5 / ties-30 — knowledge and attribute-belief writes are serialised
c9f3e284 test(ties): golden for [declared] B4 — refused before the claim, the next roll lands
c31bd116 fix(ties): [declared] B4 / ties-29 — a missing private roll-mode API refuses before the claim; a throw releases it
cd59bd20 docs(plans): wave-3 known red — test_update_escalation's wall-height exposure pin, red from ec66c6df until the integrator's edit
ae7594e5 docs(prompts): ensureMarkers two-tab idempotency — README, guide DP11 + Result, audit status
43c4c6a5 fix(ties): session-lifetime maps are pruned on delete (ties-31)
e451d4a7 fix(prompts): [declared] ensureMarkers creates by deterministic id with keepId — no duplicates across two GM tabs (§5.9.1)
b0785d60 chore(ties): drop four unused imports
1d660cc8 feat(ties): named calls for the raw-flag recipes — markLearned, lore rows, concealment (ties-9 parts 1, 2, 4)
3072e08e docs(prompts): comments name the renamed files (character/npc/scene/sight/typeahead adapters; review LLM-read fix)
fbc7c696 feat(ties): knowsAbout(character, subject) — the Look window's data half — published as study.knowsAbout (ties-8)
9bbca55a test(ties): goldens for [declared] B3 / ties-10 — whenMs / deliveredMs
5b47b528 feat(ties): [declared] B3 / ties-10 — numeric whenMs / deliveredMs beside the locale dates
c5b5fb7b docs(ties): README in the use-doc order, CHANGELOG, drifted comments fixed (guide S13, ties-43, ties-45)
a029b6b9 test(ties): graph-allow.json — the 30 import edges the direction table does not cover, each with why (guide S12, C16)
44b58841 fix(senses): light.recent()'s ring keeps its own copies, desired included (-14 review fix)
92d9dea1 refactor(ties): readWorn moves to ties-adapter (guide S12)
cb65b749 refactor(ties): UI files renamed for their role (guide S12)
fb2a2713 refactor(ties): known-data.mjs — the Known list's data half — split from known.mjs (guide S12)
02b9e0c3 style(ties): the tie dialog's and the inspect preview's rules re-rooted under pt- classes (guide S11)
4140c7b3 docs(plans): wave-3 report — prompts' open-for-Joe rows and known red ranges
bb4d7a53 docs(prompts): CHANGELOG and guide Result name the §5.9 review commits
35ff884c fix(prompts): [declared] the manifest ring writes through one serialStore, so two gathers at once keep both manifests (§5.9.1, C58)
5a62c088 refactor(ties): lang/en.json nested under one PENTARYN_TIES root (guide S10, C34)
6d400135 docs(plans): senses — syncAll's one-actor-at-a-time prototype writes (C59) recorded under Open for Joe; guide Result §5.9 review
8b2011ee docs(plans): senses review fixes recorded — -13 deleteItem half and the inspect spell prior (audit Status, guide Result)
8b7e583b refactor(ties): the template-built i18n keys become literal maps (guide S10, C35)
30c47bf2 perf(prompts): ensureMarkers repairs every drifted marker actor in one Actor.updateDocuments (§5.9.1, C59)
e4a8f0c7 perf(senses): -13 deleteItem half — the hook reads the burst memo, so a batch delete walks the world once
607bc494 refactor(ties): every UI string through _loc with its full PENTARYN_TIES key (guide S10, ties-15 t/f half)
a673a72b test(ties): the look suite's stub world defines Foundry's _loc (guide S10)
41cc0954 fix(senses): inspect() reports a spell-lit token's prior light with dotted keys, so animation/darkness stay within depth 4 (S-12)
343b5119 docs(plans): prompts wave-3 migration recorded — guide Result (commits by step, gates, deviations) and audit status per finding
771f1716 test(ties): the fixtures read lang/en.json flattened, flat or nested (guide S10, format only)
1b1c9c9c refactor(prompts): a hot re-import into a ready world runs the phases at once (blueprint lifecycle §4.1)
18b46d46 docs(plans): portals standalone pass 2 — guide Result, audit status, C59 open item marked landed
aa43f188 docs(portals): CHANGELOG — the C59 batches and the two new console labels
05b79e3e refactor(portals): the Portal card wires each destination card in _wireCard (no change)
02600db9 test(prompts): i18n.test reads choice labels with a regex, so the i18n gate sees no bare key prefix; README notes the dialog's own overrides
5c34cda8 perf(portals): [declared] C59 — unlink drops the destination from every behaviour in one batch
1693599c test(ties): golden for [declared] B2 — the id, name and token reads return Caven's ties
468c4eee feat(ties): [declared] B2 — the legacy actor reads resolve an id, a name or a token (ties-4)
be2573e3 perf(portals): [declared] C59 — the Portal card's revealed/choice switches write every behaviour in one batch
bf44258f feat(ties): additive API paths — attributes.effective/ofEffective (ties-5) and the imported internals (ties-6)
f1b06537 docs(prompts): README in the blueprint's section order, CHANGELOG, the languageKeys docblock (guide step 18)
7cb9e4f9 feat(ties): inspect(ref, { as }) — the dossier — and selftest() (guide S8 additive, ties-3)
7f50014c fix(portals): -27 — the GM badge menu's async actions are guarded ('badge menu')
24cc1b58 docs(portals): -36 — README notes the Item Piles probe differs from pentaryn-aoe's, and why
14f86c48 test(portals): -33 guard — every API row is named in the README's API table
09ec04f9 fix(portals): -27 — canvasReady and edit-toggle badge draws warn 'badge redraw failed' (no unattributed rejection)
9b57dfee refactor(ties): the entry's lifecycle in the template's shape; publish in the synchronous ready body (S9, C50)
5a759893 refactor(prompts): replace plans each kind through a PLANNERS registry (guide step 19, prompts-lookup-13)
c6222b13 test(ties): boot goldens for [declared] B11 — the two ready hooks
a0985d1f feat(ties): [declared] B11 — publish through the kit: module.api and the two ready hooks (guide S9)
0dfb854a fix(prompts): [declared] a patch's fractional CR is written as the number the dry run reads (wave-3 checkpoint finding)
5c5821f4 refactor(ties): the API is built from a manifest by the kit's buildApi (guide S8, ties-7)
e00bb70f fix(prompts): [declared] DP7 crop images load under a route prefix; data:/blob: sources fetched as they are (prompts-lookup-15)
bbe7f096 docs(plans): portals -32 — record that the existing entries still take documents, not refs (regionOf not built); open for Joe
237043d2 docs(plans): senses wave-3 migration recorded — guide Result, audit Status, two Open-for-Joe rows
50850d21 docs(plans): portals known-red ranges — imports gate red ae936c07..186cdfb1, recorded in the wave-3 report
50f4b6d5 docs(plans): portals — core-portals-relative-uuid also lists cards.mjs (decorate resolves relative: behavior)
1e376f51 fix(prompts): [declared] DP6 replaceMany checks replacements is an array before anything iterates it (prompts-lookup-14)
aa12d127 perf(prompts): [declared] DP8 the hover tip reuses a cached scene model until the scene changes (prompts-lookup-8)
4e9cc5bf docs(senses): README in the blueprint's fixed order; CHANGELOG (guide step 9; C44, C45; -22 cadence wording)
2a006ff8 test(ties): the surface pin becomes a survival check, ready for the kit members (guide S8)
93dbe68c refactor(ties): the ties data layer moves to ties-adapter; ties-api.mjs is a compat barrel (guide S8 prep)
92d0834c refactor(senses): the hand-edited Light square rule is pure (core handSquareEdit); light.mjs under 500 lines (C10)
2bf05359 perf(prompts): sceneItems indexes light hosts and walks each actor's folders once; gather counts prompts once (prompts-lookup-23)
c32fc76b test(ties): surface golden for [declared] B1 — describe → describeCard
fc593f98 feat(ties): [declared] B1 — the description card is describeCard; describe() is left for the kit
99d13957 test(ties): surface golden for [declared] B1b — the two alias rows go
0b322d2e feat(ties): [declared] B1b — remove the D1 aliases attributes.describe and study.inspect
ab430bed fix(senses): the broken glow's bright radius follows the wave back up [declared S-14, visual] (checkpoint finding, no audit id)
ce91ee83 perf(prompts): the hover tip counts sight lines without the door/wall pass (prompts-lookup-7)
980958eb fix(senses): a torch created in a compendium no longer gets the Light activity [declared S-11] (finding -38)
6bc62f3a fix(creatures): ownerSees(null) answers false without spending the override's warn-once (review of transform-creatures-29/-31)
763dda0f fix(senses): Break chain deletes the flag with _del, not '-=' [declared S-5] (finding -10, chain half)
cece01a2 docs(senses): the chain rows' params say they take Token uuids and scene ids (-26 follow-up)
6d43eb7e feat(senses): chain.link/break accept Token uuids on any scene; links(sceneId) [declared S-8] (finding -26)
0d28d169 refactor(ties): the entry becomes wiring; its hooks move into features (guide S7, ties-38, ties-45)
1ea35e09 fix(prompts): [declared] DP5 window blur clears the type-ahead's swallowed keys (guide step 16)
9fda315e feat(senses): light.reconcile() resolves to what it did; light.recent() [declared S-6] (finding -14)
7130fade refactor(prompts): tokenDataFrom — one actor-to-token-data helper for the four clones (guide step 15)
3451fdb7 test(prompts): contract.test checks the fork's vocabularies and pins KNOWN_DRIFT (guide step 14)
ff544d99 perf(senses): the glow keeps one epoch per light, LRU 64; shouldReinit is pure (finding -22)
a86a769e feat(prompts): [declared] DP1 DP2 the kit-built API, published synchronously at ready (guide step 13)
42c4cfb7 perf(senses): paint() updates its chain sprites in place (finding -20)
49b45f20 docs(plans): portals migrated (wave 3, code phase) — guide Result, audit status, open items for Joe
282d6c16 perf(senses): refreshToken reads a per-scene cache of chain pairs (finding -19; C49)
2ae44ef8 fix(senses): a failed debounced carried-light sync warns with the module and actor [declared S-7, console-only] (finding -15)
806c9e9b refactor(ties): settings.mjs — SETTINGS and KEYBINDINGS tables, setting(), mayWrite (guide S6)
876f2899 refactor(prompts): [declared] DP3 api-manifest.mjs; the queries register from it through the kit (guide step 13)
90273143 perf(senses): deletion hooks walk the world's spell lights once per burst, never for a linked token (finding -13)
4d6f0c4b test(portals): the aoe contract check uses a cited oracle copy, not an import across modules
59870f95 fix(senses): no prototype write on an unlinked token's synthetic actor [declared S-13] (checkpoint observation, folded into -11)
186cdfb1 docs(portals): S8 — README in the blueprint's section order; CHANGELOG takes the version notes
c1478be1 perf(senses): syncAll walks the scenes once (finding -11)
1d7e532b docs(plans): wave-3 report — Open for Joe: creatures' orphan light after a senses hand-off (C-L1)
872eaa71 docs(plans): creatures migrated (wave 3) — guide Result, audit status
9e63e343 refactor(prompts): features through the kit's hook registry; the entry is wiring only (guide step 12)
b87d8c15 docs(portals): -38 — isScenery's JSDoc states its rule and points at the markers.md comparison
8a060d21 fix(portals): [declared] D-P6 — an arriving PC ignores an aoe handle flagged only on its actor (-43)
ae936c07 refactor(portals): -43 — one isAoeHandle in core; recordOf uses it (no change)
cb777460 test(creatures): the hot-patch path — uninstall(), re-import, everything re-wired
c5af5e88 feat(senses): inspect(ref, opts) and light.status(item), read-only [declared S-12, additive] (guide step 11, finding -25; C29 after Wave 7)
0ff23728 feat(ties): debug lines at the silent refusals, gated on CONFIG.debug (ties-33)
413fed02 feat(portals): [declared] D-P5 (2/2) — teleportParty returns { moved, cancelled } (-32)
84d52ee4 test(creatures): module.json flags.pentaryn pins, skipped until the Wave 7 batch (guide step 10)
59a1e99b fix(portals): [declared] D-P5 (1/2) — cardFor(null) returns null instead of throwing a TypeError (-32)
0fe9e4b8 fix(portals): [declared] D-P4 — the GM tab that loses the follower carry stays quiet (-28)
4312f33a refactor(ties): the six comment-only catches become log.swallow with the same fallback (S5, C24, ties-34)
0f06790a perf(portals): [declared] D-P3 — the six region hooks share one 50 ms trailing badge redraw (-24)
59a72de4 refactor(ties): console warn/error lines go through the kit logger, same text (S5)
6b892145 fix(portals): [declared] -27 — a snapshot whose image cannot load rejects 'portal snapshot: cannot load <src>'
6d2785e4 fix(portals): -27 — async UI listeners are guarded; only an existing snapshot folder is silent
bc8ef0f3 refactor(prompts): typeahead-core createTypeahead + typeahead-adapter; named imports (guide step 11)
54898906 docs(creatures): README in use-doc order; CHANGELOG (guide step 9)
372071ed refactor(ties): one &#39; HTML escaper, core/html.mjs (S5, ties-15 esc half)
61216f31 feat(creatures): inspect(ref, { as }) — one token as plain JSON [declared]
a269f91d docs(senses): LIGHT-DESIGN.md moves to context/plans/senses-light-cantrip.md (guide step 9, finding -27 module half; C13)
1d7f327d refactor(ties): one canSee, in the new ties-adapter.mjs (S5, ties-15 canSee half)
477e39e2 perf(portals): -36 — the GM user list is read once per party pass, not once per token
a3ade332 refactor(portals): clear image deletes the flag with flagPath + _del, not the deprecated -=img key
7b5d79fd refactor(senses): the broken glow's label is an i18n key [declared, console-only] (guide step 8, finding -24 glow half; C36)
b0cbfeea refactor(ties): own-scope flag reads through the kit's readFlag (S5, ties-15/34 flagOf half)
9e0c3a20 refactor(senses): nested lang and full-key _loc literals (guide step 8, finding -24; C34, C35, C36 chain)
ee0108a9 refactor(prompts): poolIndex — one advancement-pool matcher for collectAdvancements and uuidsFor (prompts-lookup-10)
2e15ab61 style(portals): [declared] S7 — every class portals puts in the DOM is ppt- (was prompts' pp-)
9b597ba3 refactor(prompts): core/markers, core/walls and packs-adapter; adapters import core and lib only (guide step 10)
4502d41f refactor(ties): the relay and the conduit ask the kit's isActiveGM (S5, ties-38 gm half)
23fa387a perf(creatures): the strip's dock poll runs only with Argon enabled and floatOverHud on (transform-creatures-40) [declared]
88f85d98 feat(senses): kit-built API from api-manifest.mjs, published with publishNamespace [declared S-1, S-2; findings -34, -26 alias] (guide step 7; C27, C28, C48, C50)
fe8938fe feat(portals): -32 API additions — inspect, destinations, link, unlink, badges (additive)
0eb4f394 refactor(ties): one claim protocol, stakeAndConfirm, for facts and inspections (ties-39)
ec66c6df refactor(prompts): adapter renames — markers, model, los, character, patch, npc, crops (guide step 10)
e688e96f refactor(ties): split study.mjs into study/ behind a barrel (guide S4b, ties-35)
a6a0d549 perf(creatures): our own light writes no longer re-queue a no-op pass (transform-creatures-27) [declared]
a4f3d32c refactor(prompts): one size-word table and CR parser, named grouping distances, crop/spec helpers in core (guide step 9)
f76e7f91 refactor(senses): retire the frozen-root publish guard (J10, finding -34) [declared]
2f844f6b perf(creatures): the strip ignores token moves (transform-creatures-25) [declared]
d132395c feat(portals): [declared] D-P1 — the API is built and published at ready, frozen, with kit members
4b0ebf74 fix(creatures): the light queue flushes 200 ms after the first change, never pushed back (transform-creatures-26) [declared]
4110d70a refactor(senses): split light.mjs into feature, UI and adapters (guide step 6; C10, C16, C24 light:510)
a8d5eadd feat(creatures): status() — wrap, settings, writer and lit-token count in one read (transform-creatures-31) [declared]
b60f4dd4 refactor(prompts): split geometry-core.mjs into core/*.mjs behind the barrel (guide step 9)
bf362fd4 refactor(portals): S6 — API manifest and buildApiFor (published object unchanged until D-P1)
54f2d1b2 fix(creatures): ownerSees answers for a TokenDocument through its placeable (transform-creatures-31) [declared]
29560557 test(ties): pin study.mjs's export names before the split (guide S4b)
008647a0 fix(creatures): syncScene takes an array, one id or documents at the API boundary (transform-creatures-31) [declared]
f6de047c refactor(ties): one concealment clamp and one firstName (ties-9 part 3, ties-15 firstName)
cdb694e2 fix(creatures): an owner-override failure warns once instead of vanishing (transform-creatures-29) [declared]
66cb60ae refactor(portals): S5 — SETTINGS is a kit table; setting() is the kit's settingReader
349ee868 style(creatures): scope the strip's CSS on #pentaryn-creatures.pcr-strip [declared]
92cc591f refactor(senses): hot re-import goes through the entry, not per-file sentinels [declared S-4, dev-only]
b4479e1a refactor(ties): fact keys and flag names through the core grammar (ties-14)
38c366fd refactor(portals): S4 — one log, no empty catch
452f1465 refactor(prompts): prompts-core.mjs holds the identity and shared tables; core/drop.mjs matchesDrop (guide step 8)
ef2578d6 feat(creatures): API manifest, kit-built API published at ready [declared]
a6561663 refactor(senses): the entry's ready publishes the chain alias after senses [declared S-3, registration-only]
f6bbd2dc refactor(portals): S3 — split portals.mjs into adapter, three features, the card window and settings
f1e4891a refactor(ties): one flat-roll miss predicate, rolledMiss, at the four sites (ties-13)
f131b6ee refactor(prompts): [declared] DP9 no comment-only catch; a throwing core token API warns once (guide step 7)
a1ea3e1a refactor(senses): features export install(reg, ctx)/uninstall; the entry installs them (guide step 5, structural half; findings -16, -23, -17)
a0191510 refactor(creatures): strip UI + feature; the entry is wiring only (guide step 6)
c9276cb8 refactor(ties): split known-core.mjs into core/ behind a barrel (guide S4, ties-36)
f5a05191 refactor(prompts): [declared] DP4 double-click patch through wrapMethod + libWrapperRoute (guide step 6)
9c571421 refactor(creatures): Token#isVisible through the kit's wrapMethod getter route [declared]
902cde6f refactor(senses): settings.mjs owns every game.settings call (guide step 4; C21, C22, C24 migrate:100)
5ba6516c refactor(prompts): settings.mjs holds SETTINGS, the keybinding rows and the manifest ring (guide step 5)
90ea1292 refactor(creatures): owner-sees feature (guide step 5, structural half)
13bd7517 refactor(senses): pure code into core/ behind the barrel (guide step 3; findings -12, -21, -13 and -26 pure halves; C24 migrate)
b461208b refactor(creatures): light feature and tokens adapter (guide step 4)
b870dc71 test(portals): the VERSION === module.json pin goes live (todo flipped; S2 added VERSION to core)
ff66ad35 refactor(portals): S2 — constants, card HTML and -26's pure helpers move into core
f3085abd refactor(creatures): settings table and literal i18n keys (guide step 3)
be5c783b refactor(prompts): i18n literals through _loc, orphan toast localised via the entry's sink (guide step 4)
fdab0bf7 refactor(creatures): pure seams in core — constants, isAoeHandle/isItemPile (transform-creatures-30), fix seams
a5a52410 test(portals): -26 tables pinned on a verbatim oracle of the glue's pure logic (S2 before-half)
a3388e0b refactor(senses): one module id and the flag paths in core/ids.mjs; esc and unsetPath in core/util.mjs (guide step 2, findings -18, -10 light half)
57808739 refactor(ties): MODULE is defined once, in ties-core (C12)
8920256f refactor(ties): the tie dialog and the relay call ties-core's mirror rules (ties-12)
44c8d9ea refactor(ties): ties-core.mjs holds the pure constants, clamps and mirror rules; ties-api re-exports them (guide S3)
0bd574da refactor(senses): senses-core.mjs barrel and glow's maths exports; tests import through the barrel (guide step 1.2)
0a2d50ad chore(senses): vendor kit 1.0.2 (full + election), unused until the entry wiring (guide step 1.1)
181bf132 docs(plans): ties checkpoint 7395a708 recorded (S2 complete, J10 form of item 3b, two todo pins)
7395a708 test(ties): characterisation checkpoint
8d37be37 test(ties): fake DOM understands :not() and :focus; controls keyed by data-*
346c815a test(ties): move the look suite's stub world into test/fixtures/stubs.mjs (guide S1)
19d4819b test(ties): pin the before-half of each declared change; two todo pins for found bugs
66f13383 docs(plans): prompts wave-3 characterisation checkpoint bc12443e, re-anchors and KNOWN pins
bc12443e test(prompts): characterisation checkpoint
d42dc18a test(ties): i18n characterisation — the 48 template-built keys and every literal key
7da89872 test(ties): player-side characterisation — Look window, keys 7/8, Known API, tie dialog Save
d93db29c test(prompts): characterise choice-value checks, synthesised steps, starting equipment and a character replacement
cb0077b3 test(ties): print UI dates in one locale and zone (en-US, UTC)
a5a7e99d test(ties): canvas characterisation — keys 7/8/9, cards, wires, worn, item marks
d6b2fd3f docs(plans): senses checkpoint test count is 104 (103 pass, 1 todo)
b4e58d6c docs(plans): senses checkpoint 5e76c4a1 recorded; hidden-anchor chain open for Joe
e328d64f test(ties): GM windows characterisation — tie dialog, editor, preview, review
5e76c4a1 test(senses): characterisation checkpoint
676be7a3 test(prompts): characterise character lookup, resolve, the headless build's choices and summarise
d25ed03f test(ties): sheet tabs characterisation — markup and every bound control
d18ee674 test(prompts): characterise the prompt dialog
74328778 test(ties): restore the two frozen study-inspect goldens
066c6da1 test(prompts): characterise patch and npc (checks, writes, bridge calls)
0fb80b76 test(ties): attribute layer characterisation
39c10eca docs(plans): portals checkpoint recorded (0ca63b97), re-anchor and coverage
0ca63b97 test(portals): characterisation checkpoint
6da1e5fb test(ties): inspection cascade, Share/Forget and tempo characterisation
6d8acf5d test(prompts): characterise the scene model, sight, gather glue and crops (guide step 3)
415eb676 test(ties): study conduit characterisation (kind, lore, attribute facts)
1758eb5a test(ties): socket dispatch matrix, relay trust boundary and tempo bubble
76bd2c3e test(prompts): characterise the export surface, markers and replace (guide step 3)
a248a73b test(ties): core clamps, ties data layer and the legacy oracles
0c5c8cc1 docs(plans): creatures step 1 recorded — checkpoint 6e4c7d7, 64.4 % (29/45), coverage core-only → 100/98.4/100 on creatures.mjs
6e4c7d7c test(creatures): characterisation checkpoint
7398cd8d test(ties): hook manifest, player glue and ready-step failure characterisation
340383fd test(prompts): characterise the entry glue, hooks, settings, surface and queries (guide step 2)
4bd0a44d test(ties): world fixture, fake DOM and GM glue characterisation
a73d7ad1 test(portals): export an _internals seam from portals.mjs (no behaviour change)
49b2484d test(portals): the self-running suite moves to test/legacy-core.mjs; run.mjs is the fixed body
2b412b0a chore(portals): vendor kit 1.0.2 (full tier) for the characterisation checkpoint
6d36df23 test(creatures): vendor kit 1.0.2 (full + patch, patch-libwrapper, election), fixed run.mjs
510edad7 docs(plans): wave 3 baseline
```
