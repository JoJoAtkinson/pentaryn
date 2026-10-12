---
title: Addon blueprint migration — index and wave order (2026-10)
status: plan
last_modified: 2026-10-10
tags: [foundry, modules, blueprint, plan, migration, audit, index]
---

# Addon blueprint migration — index and the one sequence

> **WAIT lifted 2026-10-11:** `wait.json` is empty (D9, live usability work done and committed). History: the 2026-10 list held combat, riders, transform, aoe, creatures, portals, senses. Re-anchor each guide before editing.

> **Re-anchored to 4e64f47 on 2026-10-11** (attunement and movement rows; creatures and portals rows). **Re-anchored to 28ccc87 on 2026-10-11** (riders row; aoe row; combat row).

**Read this when:** you are about to plan or run the fix phase that follows the 2026-10 code
audit: which module goes next, what it waits on, which audit findings its migration absorbs, and
the procedure an implementing workflow follows for each wave.
**Not this file:** the blueprint itself and the general migration procedure →
[`../../foundry/addon-blueprint.md`](../../foundry/addon-blueprint.md) (§8) · why it is shaped
that way → [`../addon-blueprint-2026-10.md`](../addon-blueprint-2026-10.md) · the audit finding
text → [`../code-audit-2026-10/README.md`](../code-audit-2026-10/README.md) and the audit
programme [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> **This file supersedes two orders.** The audit's *Sequenced waves* (`code-audit-2026-10.md`)
> and the design-time [`migration-order.md`](migration-order.md) each proposed an order. This
> README merges them into **one** sequence (§3). Where they disagree, this file wins; neither of
> them was edited, because both are history written by other workflows.

Every score, step count and line number here comes from the per-module guides, which were scored
with `conformance.py --snapshot` against the audit's frozen snapshot (pentaryn `ee505c2` plus the
uncommitted tree of 2026-10-10 20:15 EDT). Before you act, score live:
`./.venv/bin/python scripts/foundry/blueprint/conformance.py --module <short> --markdown`.

## 1. Files in this folder

| File | What it is |
|---|---|
| `README.md` | this index, the one sequence, the per-wave procedure, pending wiring |
| [`conformance-baseline.md`](conformance-baseline.md) | the "before" scores of all 19 modules (history) |
| [`migration-order.md`](migration-order.md) | the design-time order; superseded by §3 here |
| `migrate-pentaryn-<m>.md` (19 files) | one migration guide per module: rule table, old→new map, ordered steps each with its characterisation test, standalone fixes, declared changes, effort |
| [`migrate-mcp-fork.md`](migrate-mcp-fork.md) | the fork side: `pentaryn-read`/`pentaryn-write` (D14), ref resolution, the module-contract halves, every mcp-fork id mapped to a stage |
| [`tooling-lane.md`](tooling-lane.md) | the Python tooling lane: every python-tooling id, the W/K/R item it merges with, files touched, serialisation |
| [`wave7-restart-batch.md`](wave7-restart-batch.md) | the consolidated `module.json` edits for the Stage 3 restart (and Wave 7b) |
| [`adjustments-batch.md`](adjustments-batch.md) | the consolidated `foundry/adjustments.yml` rows the guides add |

## 2. Per-addon table

Score = fail-class rules passed on the snapshot. "After" = the guide's expected score once its
structural steps land, before / after the Wave 7 restart batch. "Absorbed" = audit findings whose
fix *is* a structural step; the rest of the module's findings are standalone fixes landed after its
migration (§3). Effort is agent time and excludes live-test turnaround unless stated.

| # | Module | Tier | Score today | After | Steps | Findings absorbed (of owned) | WAIT | Effort | Guide |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `pentaryn-importer` | full | 62.2 % (23/37) | all but C07 → 100 % | 9 | items-journal-1 (keystone, declared), -2, -3, -5, -6, tc-24 — 6 of 7 (+ -4, -7 standalone) | no | ~2 d (L) | [importer](migrate-pentaryn-importer.md) |
| 2 | `pentaryn-names` | small + `api` | 67.6 % (25/37) as small | all but C07 | 10 (0 + 9) | tc-32, -33, -38, names part of -20 — 3 of 3 | no | ~0.5 d (S) | [names](migrate-pentaryn-names.md) |
| 3 | `pentaryn-pings` | small + `settings,api,patch,election` | 63.9 % (23/36) as small | all but C07 | 11 (0 + 10) | tc-35, -36, -39, pings part of -20 — 3 of 3 | no | ~1 d (S/M) | [pings](migrate-pentaryn-pings.md) |
| 4 | `pentaryn-cursors` | small + `settings` | 56.4 % (22/39) as small | all but C07 | 12 + step 0 | swc-31, -35, cursors halves of -27/-28 — 2 of 4 | no (one sub-step waits on aoe's row) | ~1 d (S) | [cursors](migrate-pentaryn-cursors.md) |
| 5 | `pentaryn-lookup` | full | 63.2 % (24/38) | ~97 % → 100 % | 13 | pl-2, -3, -6, -26, -34, moving parts of -1/-4/-5 — 5 of 8 (+3 standalone) | no | ~1.5–2 d, 1 live session | [lookup](migrate-pentaryn-lookup.md) |
| 6 | `pentaryn-movement` | full | 53.7 % (22/41; re-scored at 4e64f47 on 2026-10-11, unchanged) | 97.7 % → 100 % | 7 + 2 standalone (F-M1, F-M2) | amp-17, -18, -20, -21, -22, -23, -37 — 7 of 9 | no | ~1.5 d | [movement](migrate-pentaryn-movement.md) |
| 7 | `pentaryn-walls` | full | 59.0 % (23/39) | all but C07 | 11 + step 0 (step 8 = 8a–8f) | swc-4, -7, -8, -36, walls half of -10 — 4 of 13 (+9 standalone, 3 tooling) | no | ~2–2.5 d (M) | [walls](migrate-pentaryn-walls.md) |
| 8 | `pentaryn-attunement` | full | 56.4 % (22/39; re-scored at 4e64f47 on 2026-10-11, unchanged) | all but C07 | 9 | ij-8, -9, -12, -14, -16, -17, hook half of -11, tc-24 — 6 of 10 | no | ~1.5–2 d (M) | [attunement](migrate-pentaryn-attunement.md) |
| 9 | `pentaryn-journal` | full | 48.8 % (20/41) | all but C07, C30 (C30 needs kit K4) | 9 | ij-34, -37, journal row of -29, part of -36, mcp-fork-24 doc — 2 of 7 | no | ~2 d (M) | [journal](migrate-pentaryn-journal.md) |
| 10 | `pentaryn-dropbin` | full | 53.7 % (22/41) | all but C07 | 11 | ij-18 (declared), -20, -22, -26, parts of -23/-24/-25/-28/-29/-30, tc-24 — 4 of 13 whole, 6 in part | no (after attunement) | ~3 d (L) | [dropbin](migrate-pentaryn-dropbin.md) |
| 11 | `pentaryn-prompts` | full | 51.2 % (21/41) | all but C07 | 19 (19 optional) | pl-9, -10, -11, -12, -13, -16, -17, -19, -20, -21, -22, -24, -27, -31, -32, -33, mcp-fork-15/-24 — 16 of 21 | no | ~5–7 d (+1 optional perf), 2 live sessions | [prompts](migrate-pentaryn-prompts.md) |
| 12 | `pentaryn-ties` | full | 43.9 % (18/41; re-anchored to 4e64f47 and re-scored live 2026-10-11, unchanged) | ~93 % → 100 % | 15 (S0–S13 + S4b) + S14 hand-off list | ties-1, -3…-7, -12…-15, -33…-39, -43…-45 — 20 of 44 (+24 standalone, incl. new ties-46) | no | XL: ~93–110 h structural + 30–40 h standalone (~15–19 d) | [ties](migrate-pentaryn-ties.md) |
| 13 | `pentaryn-creatures` | full | 53.7 % (22/41); live unchanged at 4e64f47, re-anchored 2026-10-11 | all but C07 | 11 (0 + 10) + kit K1 first | tc-28, -29, -30, -31; seams for -25/-26/-27/-40 — 4 of 8 | no (lifted 2026-10-11, D9) | ~2 d (M) | [creatures](migrate-pentaryn-creatures.md) |
| 14 | `pentaryn-portals` | full | 57.9 % (22/38); live 51.3 % (20/39) at 4e64f47, re-anchored 2026-10-11 | 90.2 % → 100 % | 8 + adjustments + restart batch, 7 standalone | amp-25, -26, -29, -31, -33, parts of -27/-32 — 5 of 12 | no (lifted 2026-10-11, D9) | ~3.5–4 d | [portals](migrate-pentaryn-portals.md) |
| 15 | `pentaryn-senses` | full | 48.8 % snapshot / 43.9 % live | all but C07 | 13 (+ step 0), 10 standalone | swc-12, -16, -17, -18, -21, -23, -24, -29, -34, halves of -10/-27 — 9 of 20 whole | no (lifted 2026-10-11, D9) | ~4–5 d (L) | [senses](migrate-pentaryn-senses.md) |
| 16 | `pentaryn-riders` | full | 47.6 % (20/42) snapshot; live 45.2 % (19/42) at 28ccc87, re-anchored 2026-10-11 (C24 newly fails) | all but C07, C09 (Wave 7), C37 (Wave 8.6) | 11 (S0 done, S1–S10) | cr-25, -26, -27, -32, -39, -40, riders halves of -13/-16/-17/-31 — 7 of 8 | no (lifted 2026-10-11, D9) | ~6.5 d, 2 live sessions | [riders](migrate-pentaryn-riders.md) |
| 17 | `pentaryn-aoe` | full | 50.0 % (21/42) snapshot; live 45.2 % (19/42) at 28ccc87, re-anchored 2026-10-11 (C26 now scored, C37 new) | 93.2 % → 100 % | 8 + adjustments + restart batch, 8 standalone | amp-4, -5, -10, -11, -12, -13, -15, -30, -44 (new), prefix half of -9 — 9 of 16 | no (lifted 2026-10-11, D9) | ~4–5 d | [aoe](migrate-pentaryn-aoe.md) |
| 18 | `pentaryn-transform` | full | 48.8 % (20/41) | all but C07, C23, C37 (clear at combat 8.6) | 13 (0 + 12) | tc-3…-9, -13 part 1, -15…-20, -22 extraction, -24 — 17 of 24 | no (lifted 2026-10-11, D9) | ~5–6 d (L) + Wave 8 | [transform](migrate-pentaryn-transform.md) |
| 19 | `pentaryn-combat` | full | 45.2 % (19/42); live unchanged at 28ccc87, re-anchored 2026-10-11 | all but C07, C23 (needs aoe `settings()`) | 16 (S0–S15; S6 has 4 parts) | cr-3…-9, -10 trace, -11, -13…-15, -17, -18 ph1, -20…-22 move, -28, -30, -31, -34, halves of -12/-16, tc-13/-14 parts, the move half of -36 — ~23 of 30 (-37, -38 and -36's aoe read standalone) | no (lifted 2026-10-11, D9); last | ~14 d (+1 argon-kit), ≥4 live sessions | [combat](migrate-pentaryn-combat.md) |

Abbreviations: tc = transform-creatures, swc = senses-walls-cursors, pl = prompts-lookup, amp =
aoe-movement-portals, ij = items-journal, cr = combat-riders. Names, pings and cursors have no tier
in `module.json` yet, so the baseline scored them as full (64.1 / 60.5 / 53.7 %); their guides
re-scored them as small on a scratch copy. Since the gap-fill pass, `vendor.py sync --tier small`
records the tier in `lib/kit.lock.json` and the scorer reads it, so after their step 1 they score
as small in place — no hand edit of `module.json` before Wave 7.

**These scores predate scorer fixes R2–R9** (§5, landed in the gap-fill pass). Eight modules moved
on the snapshot: aoe 47.6, dropbin 50.0, journal 46.3, prompts 50.0 (new true failures: C26, C29,
C03); importer 63.9, lookup 64.9, pings 62.2, walls 60.5 (C18 now n/a). The full table is in the
[design record](../addon-blueprint-2026-10.md) §7.5. Re-score live before you start (§4 step 0).

**Totals.** Non-WAIT modules (#1–12): about 40–47 agent-days. WAIT modules (#13–19): about 40–45
agent-days plus live-test round trips. Audit findings in scope: 305 verified on the addons and
tooling (328 after the gap-fill), of which the 19 module guides cover every module-owned id —
absorbed or standalone — and each verifier confirmed no id was missing.

## 3. The one sequence

The audit's waves were organised by *kind of change* (seams → reads → hardening → performance →
splits); the blueprint migrates *one module at a time*. They merge like this:

- A module's **migration replaces** its audit Wave 2 row (pure seams), its Wave 6 split, and every
  Wave 3/4/5 item its guide lists as absorbed.
- A module's **standalone findings** land right after its migration, on the new layout, in the
  audit's category order: reads (Wave 3) → logging/hardening (Wave 4) → performance (Wave 5).
- **Waves 0, 1, 7 and 8 stay** as cross-cutting stages, re-scoped below.
- **Tooling and fork** findings (python-tooling-\*, mcp-fork-\*) run in a parallel lane in the
  audit's wave order; they touch no module folder. The map is [`tooling-lane.md`](tooling-lane.md)
  (what merges with W1–W5 or is already closed) and [`migrate-mcp-fork.md`](migrate-mcp-fork.md)
  (the module-contract ids — mcp-fork-15, -20, -22, -24 and prompts-lookup-11/-12's fork halves —
  land with prompts/lookup/journal; the rest are the parallel lane).

### Stage 0 — Now, in parallel with the live test (no module code)

| Item | Source | Notes |
|---|---|---|
| Audit Wave 0 — gates, characterisation, docs | audit | **skip** every item on a WAIT module (combat README, aoe, transform, creatures, portals, senses, riders); those move to Stage 4 |
| Kit amendments K1–K10 (§5) | the guides | K1, K3–K8 **landed** (kit 1.0.1); K2 waits for D1; K9/K10 are doc/template items |
| Scorer fixes R1–R9 (§5) | the guides | R2–R9 **landed**; R1 waits for D2; R7's movement half waits for D4 |
| Joe's decisions D1–D9 (§6) | the guides | none blocks Stage 1; D1 blocks ties S8, D2 blocks the C32 rule wording |
| Pending wiring W1–W9 (§7) | this README §7 (the use-doc §12 points here) | W6–W8 first (routing); the rest when the files they touch are idle |

### Stage 1 — Keystone (audit Wave 1)

1. **`pentaryn-importer`** — items-journal-1: merge into `game.pentaryn` instead of replacing and
   freezing it. This is the only change that alters every other module's namespace lifetime, so
   it goes first and alone. Declared; the live test checks publishing in both load orders **and**
   that combat, transform and aoe namespaces survive (they stop being wiped).
2. The rest of audit Wave 1 that is still open: python-tooling-5 step a (atomic install, with
   -53), -10 (sync stamp), -33 (`out.py`), -9. python-tooling-4/-35 (scaffold + modules playbook)
   are **already met** by `scripts/foundry/blueprint/new_module.py`, `foundry/blueprint/template/`
   and `context/foundry/addon-blueprint.md`; close them by pointer, do not build a second scaffold.

**Landed 2026-10-11 on `migrate/wave-1` (offline; the importer's declared changes wait for the
live-test workflow):** the importer guide steps 2–8 plus `items-journal-4` and `-7`
([guide Result](migrate-pentaryn-importer.md#result-fill-when-done), 97.6 %, only C07 left for
Wave 7); python-tooling-33 `60bde34`, -5 step a `8c287ad` (+ `71a4414`), -53 `70588b1`, -10
`b902e30`, -9 `e7b5b17`.
3. The kit itself (`foundry/lib/`) already exists as new files; Wave 1's "create `foundry/lib/`"
   is done. What remains is wiring it into the gates (§7).

### Stage 2 — Non-WAIT modules, smallest and safest first

Order: **names → pings → cursors → lookup → movement → walls → attunement → journal → dropbin →
prompts → ties.** Each row = that module's guide, then its standalone fixes.

| Order | Module | Why here | Needs first |
|---|---|---|---|
| 2.1 | names | ~60 lines; first proof of the small tier and of `vendor.py sync --tier small` | W2 (ModuleSpec node-test) helps; not required |
| 2.2 | pings | small tier with opt-in kit files; first `wrapMethod` + adjustments rows | adjustments batch slot |
| 2.3 | cursors | small; its aoe-shared adjustments row splits out to Stage 4 (guide step 10) | — |
| 2.4 | lookup | first full-tier module with queries; namespace `rules` kept | — |
| 2.5 | movement | three new adjustments rows; re-anchored to 4e64f47 on 2026-10-11 (U-8-7 ghost-back toast added; +F-M2 / aoe-movement-portals-42) | D4 (dnd5e dependency) |
| 2.6 | walls | GM-only publish after `wasmReady` (`when`); the only **real** flag-scope data migration (Wave 7) | — |
| 2.7 | attunement | `attunement-core.mjs` seam, `lang/` via Wave 7; re-anchored to 4e64f47 on 2026-10-11 (U-8-5 tooltip guard: one more row `files` move, items-journal-39) | — |
| 2.8 | journal | player-relay query | K4 to clear C30 (else C30 stays failing, documented) |
| 2.9 | dropbin | after attunement (shared Item Piles rows) | K6 if the ledger moves to `serialStore` |
| 2.10 | prompts | largest non-WAIT surface after ties; fork query contracts | K8 (or the guide's hand-registered `replace` query) |
| 2.11 | ties | largest; ties-35 split behind barrels | **D1** before S8; K5 (G7 freeze-in-place) |

Modules in Stage 2 may run in parallel lanes when they share no file outside their own folder;
the shared files that force serialisation are `foundry/adjustments.yml` (one batch at a time),
`scripts/foundry/ops/config.py`, `Makefile` and `foundry/lib/` (kit bumps).

### Stage 3 — Wave 7 restart batch (one sync, one Foundry restart)

Every `module.json` edit the guides deferred is collected in
[`wave7-restart-batch.md`](wave7-restart-batch.md) (each guide's Record step appends to it): `flags.pentaryn` (namespace,
flagScope, cssPrefix, afterSync, tier), `compatibility.minimum → "14"`, CSS → `styles/`, `lang`
entries (pings, portals-if-lifted, walls, attunement), relationships (items-journal-37, -14 step
2), and the walls flag-scope data migration. Ship `_loc`/lang-key switches in the **same** restart
as their `languages` entry, or players see raw keys. One sync, one restart, one live smoke per
module (§4 step 6).

If WAIT lifts before Stage 3 runs, fold those modules' manifest edits in. Otherwise their edits
form a second, final restart batch (**Wave 7b**) at the end of Stage 4. Two restarts total, never
one per module.

### Stage 4 — Formerly-WAIT modules (audit Wave 8); all `wait.json` entries lifted 2026-10-11 (D9: live test done)

Order: **creatures → portals → senses → riders → aoe → transform → combat.**

- creatures, portals, senses are WAIT only because the live-test workflow was editing them on
  2026-10-10; they lift when Joe confirms. creatures goes before senses (the token-light hand-off);
  portals reads aoe's handle flag, so re-anchor that contract against aoe's live tree too.
- riders, aoe, transform, combat lift when the melee/usability live-test workflow is **done**.
  Inside them, follow audit Wave 8's internal order 8.0 tests/docs → 8.1 kit → 8.2 seams → 8.3
  reads → 8.4 hardening → 8.5 performance → 8.6 splits, mapped onto each guide's steps.
- combat is last: `argon-kit` is written there first (8.6), which clears transform's C23/C37 and
  riders' C37.
- Every WAIT guide starts with a re-anchor step: `git diff ee505c2 -- foundry/module/<m>` (plus
  the uncommitted tree), re-score live, re-locate every anchor by text. Riders has a file the audit
  never saw (`cast-flow.mjs`); aoe has `refund.mjs` and `aim.mjs`; portals has `spreadArrival`.

### Stage 5 — After the last module

1. Remove `publish.mjs`'s frozen-root guard and `setTimeout 0` re-alias tick (safe once the
   importer change has been live for a session), bump the kit, `vendor.py sync --all`.
2. Turn the vendor and conformance gates from advisory to failing for every module (W3).
3. Consider the phase-2 `pentaryn-lib` library module ([design record](../addon-blueprint-2026-10.md) §9, decision 1).

### Live-test sessions (declared changes only)

Batch declared changes per stage so the live-test workflow runs few sessions:

| Session | Declared changes |
|---|---|
| L1 (Stage 1) | importer keystone; console prefix change |
| L2 (Stage 2 small + lookup + movement) | frozen API objects published synchronously at `ready`; lookup registry guard, warning key, book cache; movement setting labels and -19 cache; names `sync` accepts an id |
| L3 (walls, attunement, journal, dropbin) | walls `undo()` works (-1), wasm levels; attunement `_loc` placeholders, CSS class renames, stash refusal (-10); dropbin serialised ledger (-18), -19/-21/-23/-25/-27/-30 |
| L4 (prompts) | publish timing, queries through the kit (`NOT_READY`, `toPlain`, `PentarynError`), dblclick wrap marker, typeahead blur, `BAD_SPEC`, crop route prefix, scene-model cache |
| L5 (ties) | B1 `describe` → `describeCard`; ties-29, -30, -32; B2–B10 in its guide |
| L6 (Stage 3 restart) | every module loads; lang keys resolve; walls flag-scope migration |
| L7+ (Stage 4, per module) | as each WAIT guide's declared-change table lists (combat alone needs ≥4) |

## 4. Per-wave procedure for an implementing workflow

One module per run. The guide's numbered steps are the unit of work; this is the wrapper around
each of them. Agents commit often (small, one logical step per commit, on the wave branch); Joe never commits, and review happens at merge. Agents do not push, stash or switch branches unless their task says so.
Rollback = `git revert` of the module's commits, a last resort (fix forward by default), then sync.

0. **Pre-flight.**
   - Module not in `scripts/foundry/blueprint/wait.json` (or Joe has just lifted it).
   - Re-anchor: `git diff ee505c2 -- foundry/module/<m>` and `git status -- foundry/module/<m>`;
     if anything moved, re-locate every guide anchor by its quoted text, not its line number.
   - Score live: `conformance.py --module <short> --markdown`; diff against the guide's §1 table.
   - Any kit amendment the guide lists as a prerequisite (§5) has landed and `node
     foundry/lib/test/run.mjs` is green.
1. **Characterisation tests (checkpoint commit).**
   - `vendor.py sync <short> --tier full|small [--kit …]`; convert `test/run.mjs` to the fixed
     body (old suites in `LEGACY`).
   - Write each step's named characterisation test against **unchanged** code, from the finding's
     `behaviourTest` plus hostile inputs; mark known-wrong rows `// KNOWN:`; pin effects (hooks,
     calls, console text, `surfaceOf`), not just returns.
   - `GOLDEN_UPDATE=1 node --test test/<file>.test.mjs` per file; then `node test/run.mjs` green.
   - Commit the diff (`test/` only) as the checkpoint; it is then frozen.
2. **Refactor**, one guide step at a time, exactly as written. A step never edits `test/golden/`
   or a characterisation test. Declared changes are separate steps with their own test change,
   flagged in the commit message.
3. **Node tests** after every step: `node test/run.mjs` in the module folder; `node
   foundry/lib/test/run.mjs` if the kit changed; `./.venv/bin/python -m pytest -q
   scripts/foundry/blueprint/tests` if the scorer or vendor changed.
4. **Gates.**
   - `make foundry-<short>-check` (walls: `make foundry-walls-test` until W4's alias exists).
   - `vendor.py check <short>` and `conformance.py --module <short>` by hand until W3 wires them.
   - `make foundry-adjustments-check` when a patch, marker or adjustments row moved.
   - `make check-context` when a doc changed.
   - `git diff --stat -- foundry/module/<m>/test/golden 'foundry/module/<m>/test/*.test.mjs'`
     shows only the checkpoint's files.
5. **Live test only for declared changes.** Behaviour-neutral steps get no live session: after
   Joe syncs, a four-line smoke (`describe().version` equals `module.json`, every described path is
   a function, `inspect(knownActor)` depth ≤ 4, `selftest().ok`). Declared changes go to the
   live-test workflow in the session batch of §3 before merge. On-screen differences are what
   count; console-only differences are fine at this table.
6. **Record.** Re-score and fill the guide's `## Result (fill when done)` section (live score,
   date, commits, declared changes handed off), mark the guide `status: done`, update the module
   README (use-doc), and append deferred `module.json` edits to
   [`wave7-restart-batch.md`](wave7-restart-batch.md) and new adjustments rows to
   [`adjustments-batch.md`](adjustments-batch.md) (each guide's §6 "Record" step).

## 5. Kit and scorer amendments the guides found

Land each in Stage 0 by use-doc §4.4 (kit) or with a scorer test (scorer). **Status** is as of the
gap-fill pass (2026-10-10).

| Id | Change | File | Needed by | Status |
|---|---|---|---|---|
| K1 | `wrapMethod` getter route (`kind: "getter"`) — `Token#isVisible` is a getter | `patch.mjs` | creatures step 5 | **landed** kit 1.0.1, `patch.test` |
| K2 | `buildApi` refuses reserved names at the **top level only** (D1 option A) | `api.mjs:32-38` | ties S8 | D1 decided (rename + aliases); top-level `describe` stays reserved until ties' B1 — open |
| K3 | `guarded(fn, { sender: "any" })` and pass core's `{user}` ctx as 2nd arg | `queries.mjs` | riders S6 | **landed** kit 1.0.1, `queries.test` |
| K4 | `relayed(fn, { activeGM: true })` player-relay helper; manifest row `relay: true` | `queries.mjs` | journal C30 | **landed** kit 1.0.1 (C30 accepts `relayed(`) |
| K5 | `buildApi` freezes a **copy**, never the module's own tables or an ES module namespace (which throws) | `api.mjs` | ties (G7), journal, creatures, combat, riders | **landed** kit 1.0.1, `api.test` |
| K6 | `serialStore` over several keys written together | `settings.mjs` | dropbin ledger | **landed** kit 1.0.1, `settings.test` |
| K7 | hook guard log level option (`guard: "warn"`) | `hooks.mjs` | senses S-9 | **landed** kit 1.0.1, `hooks.test` |
| K8 | manifest row `queryName` (query name ≠ row path) | `api.mjs` / `queries.mjs` | prompts `replace` | **landed** kit 1.0.1; prompts drops its hand-registered exception |
| K9 | blueprint gaps G1/G3/G4/G5: a role for Foundry-aware non-UI logic, hidden client settings vs C51, a shared non-feature log instance, per-row world-actor default in `resolveRef` | use-doc + kit | ties | open (design work with ties) |
| K10 | template `hooks.test` "only lifecycle hooks at module scope" needs a migration mode; features may share state via `ctx` (aoe tray/resolve); adapter→adapter import exception (prompts) | template, use-doc | aoe, prompts, dropbin | `ctx` line **landed** (use-doc §4.1); migration mode and adapter exception open |
| R1 | C32 contradicts use-doc §5.6 (module-prefixed rows that are not patches fail) | `conformance.py` or use-doc §5.6 | senses, aoe, portals, cursors | **landed** with D2 (`df661e0`): C32 fails an unwrapped `<short>-` row and a `wrapMethod` naming a non-`<short>-` row |
| R2 | C26 misses `setTimeout(publish, 0)` | `conformance.py` | aoe, dropbin | **landed** |
| R3 | C07 says "data migration" for every flagScope mismatch; only walls needs one | `conformance.py` | all | **landed** (DATA vs manifest-only) |
| R4 | C48 checks top-level names only, the kit checks every depth | `conformance.py` | ties | **landed** (any depth; flips with K2) |
| R5 | C50 cannot record a GM-only publish inside `ready` | `conformance.py` | pings | **landed** (`ready:<role>` behind a role gate) |
| R6 | C33 misses private internals (`Token#_preview`, `_placementContext`, Svelte `$$.ctx`, shader internals) | `conformance.py`, `packages.json` | senses, cursors, movement, dropbin | **landed** (`privateInternalPatterns`) |
| R7 | C03 misses real dnd5e use (journal, movement) | `packages.json` | journal, movement | **landed** (journal; movement's `ignoreTokens` with D4, `4a5c13c`) |
| R8 | C29 misses computed `flags.${MODULE}` writes | `conformance.py` | dropbin | **landed** (actor/token statements only) |
| R9 | C18 counts an entry's `import * as` of a `-core.mjs` as a feature, and cannot pass with no features (importer) | `conformance.py` | importer | **landed** (n/a for lifecycle-only modules) |

Consequence for the design record: declared change **B6** shrinks to the **walls** flag-scope
data migration — aoe, senses, cursors, attunement, dropbin, journal and ties already write under
their module id (manifest-only). The design record and the use-doc now say so.

## 6. Decisions for Joe

| Id | Decision | Recommendation | Blocks | Status (2026-10-11) |
|---|---|---|---|---|
| D1 | ties nested reserved names (`attributes.describe`, `study.inspect`) | option A: K2, kit 1.0.1, reload only | ties S8 | **decided**: rename to `attributes.lookup` / `study.examine`, old names alias with `logCompatibilityWarning` until ties S8 — **landed** `1411687` |
| D2 | adjustments-row naming for non-patch rows | keep the package prefix (`core-…`, `dnd5e-…`, `itempiles-…`) and fix R1 | senses, aoe, portals, cursors rows | **decided**: package prefix for non-patch rows — **landed** `df661e0` (eight rows renamed, C32 enforces both halves) |
| D3 | names `sync` writes but names is small tier | keep small + opt-in `api` kit file | names | **decided**: small tier + `api` kit file — recorded `2164005` |
| D4 | movement's dnd5e dependency (`ignoreTokens`) | keep it; add `ignoreTokens` to `packages.json` | movement C03 | **decided**: keep; `ignoreTokens` in packages.json `codePatterns` — **landed** `4a5c13c` |
| D5 | importer `flagScope` (writes the generator's `flags.pentaryn.*` by contract) | declare it as the generator scope, exempt from migration | importer C07 | **decided**: `flags.pentaryn.*` is the generator contract scope — recorded `2164005` |
| D6 | prompts `gatherChars` fallback 160 vs 400 | already in the audit's deferred list; prompts keeps its own helper until decided | none | **decided**: one `gatherChars` default 400 + cut suffix — **landed** `868103f` |
| D7 | riders' Argon `#tooltip` selectors and the shared `.pentaryn-tt` CSS | decide in Wave 8.6 with argon-kit | riders/transform C37 | **decided**: one shared stylesheet `foundry/lib/argon-tooltip.css` — tooling **landed** `d959b66`. **Wave 4 wiring:** transform vendors it and `styles/transform.css` `@import`s it (`4af2a9c2`, `45733d25`); combat vendors it (`eaff3e00`) and `styles/combat.css` `@import`s it `[declared]` (`24e961a0`), so combat's `pentaryn-tt` no longer depends on transform.css; both pin the applied rules against the pre-D7 block (`tooltip-rules.json`, `f6c668c8`). **Riders open:** vendoring waits for the W7 `relationships` edit (vendor.py refuses without `enhancedcombathud`), and the `#tooltip` click-through rule stays in riders.css (W4-R9, Joe) |
| D8 | Starry expiry on unlinked tokens (tc-22) | live-test question, not a code fix | none | later |
| D9 | when to lift each `wait.json` entry | creatures/portals/senses on confirmation; the rest when the live test is done | Stage 4 | done |

## 7. Pending wiring (W1–W8 applied in wave 1; W9 applied earlier)

**Status 2026-10-11 (wave 1, Lane A):** W1 `c8fd327`; W2 `8c4d6d9`, `667456c`; W3 `9a83ba1`; W4
`beda8e0`, `566273b`; W5 `35d439b`, `21c6d0f`, `2ec084f`; W7 Module APIs table `1ea9f37`, `56e75f1`;
W6–W8 routing rows were already present. Conformance stays advisory until Stage 5
(`CONFORMANCE_FAILS`); names and pings get `node-test` once they have a `test/run.mjs`. The table
below is the original suggestion list, kept as history.

| Id | File | Suggested edit |
|---|---|---|
| W1 | `scripts/foundry/ops/cli.py` | `module-new <short> --tier full\|small` wrapping `scripts/foundry/blueprint/new_module.py`; `module-vendor`, `module-conformance`, `module-check --all --json` |
| W2 | `scripts/foundry/ops/config.py` | a derived `ModuleSpec.kit` property that reads `lib/kit.lock.json` (None = unmigrated) — **never stored in `config.py`** (D8: the lock is the only kit list); `CHECKS += ("vendor", "conformance")`; `node-test` on ties (`:117`, python-tooling-7), names, pings; a `pings` spec |
| W3 | `scripts/foundry/ops/modules.py` | vendor gate `_check_vendor` = `vendor.py check <short>` for modules with a lock (unmigrated: skipped, not failed); `_check_conformance` failing on fail-class rules only, WAIT modules reported not failed |
| W4 | `Makefile` | `foundry-lib-check` (`node foundry/lib/test/run.mjs`), `foundry-lib-vendor`, `foundry-module-new`, `foundry-conformance`, `foundry-walls-check` alias; the audit's `foundry-modules-check` and `test` targets (python-tooling-1, -8) — the audit rules cite them but they do not exist yet |
| W5 | `scripts/foundry/update/adjustments.py`, `escalate.py`, `pyproject.toml` | `/scripts/foundry/blueprint/` in `EXPOSURE_SKIP_PARTS`; `make_checks()` from `ops_cfg.MODULES`; `testpaths += ["scripts/foundry/blueprint/tests"]` |
| W6 | `CLAUDE.md` | routing row (below) |
| W7 | `context/foundry/README.md` | routing row (below) and the "Module APIs (`game.pentaryn`)" namespace index (mcp-fork-20) |
| W8 | `context/plans/README.md` | an index row for this folder |
| W9 | `context/foundry/addon-blueprint.md` | **applied** in the gap-fill pass: §8 links §3 here as the order; §5.6 row-id wording (package prefix for non-patch rows, pending D2); the feature→feature `ctx` line (§4.1); §12 is a pointer to this table |

Suggested routing rows:

```markdown
<!-- CLAUDE.md, "Route by task" table -->
| Building a new Foundry module, or migrating one to the blueprint (kit, tiers, conformance) | [`context/foundry/addon-blueprint.md`](context/foundry/addon-blueprint.md) |

<!-- context/foundry/README.md, "Route by task" table -->
| New in-house module, or bringing an existing one up to the blueprint — kit, tiers, conformance, the migration order | [`addon-blueprint.md`](addon-blueprint.md) · order and per-module guides: [`../plans/addon-blueprint-2026-10/README.md`](../plans/addon-blueprint-2026-10/README.md) |

<!-- context/plans/README.md -->
| [`addon-blueprint-2026-10/`](addon-blueprint-2026-10/README.md) | Fix-phase plan: one migration guide per module, the merged wave order with the code audit |
```
