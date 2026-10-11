---
title: Addon blueprint — the Python tooling lane (crosswalk, 2026-10)
status: plan
last_modified: 2026-10-10
tags: [foundry, tooling, python, blueprint, plan, migration]
---

# The Python tooling lane — crosswalk to the blueprint

**Read this when:** you are about to work a `python-tooling-*` finding in the fix phase and need to
know whether the blueprint already did it, which pending-wiring item (W1–W9) it merges with, which
files it touches, and what it must not run beside. **Not this file:** the finding text →
[`../code-audit-2026-10/python-tooling.md`](../code-audit-2026-10/python-tooling.md) · the module
order → [`README.md`](README.md) §3 · the fork → [`migrate-mcp-fork.md`](migrate-mcp-fork.md).

Python is not shaped like a module, so this is a crosswalk, not a migration guide. The lane runs in
parallel with the module stages, in the audit's wave order. Its one rule: **never build a second
copy of something the blueprint already built.** The three traps:

1. **after_sync.** The audit (-3) keeps `after_sync` next to each module in `config.py`; the
   blueprint stores it in `module.json` `flags.pentaryn.afterSync` (the generator writes it). One
   source: `ModuleSpec` **reads** `flags.pentaryn.afterSync` when present and falls back to its
   tuple; the tuples move into `module.json` only in the Wave 7 restart batch
   ([`wave7-restart-batch.md`](wave7-restart-batch.md)), never by hand-editing both.
2. **Scaffold.** -4 (`scaffold.py`, `templates/foundry-module/`, `string.Template`) and -35
   (`context/foundry/modules.md`) are **closed by pointer**: `scripts/foundry/blueprint/new_module.py`,
   `foundry/blueprint/template/` and `context/foundry/addon-blueprint.md` (design record D13). Do not
   build a second scaffold. W1's `ops module-new` only wraps `new_module.py`.
3. **The kit list.** The audit's `ModuleSpec.lib=(…)` is replaced by D8: `lib/kit.lock.json` is the
   only kit list; `ModuleSpec.kit` is a **derived** property that reads the lock (W2), never a tuple
   stored in `config.py`.

## 1. Shared files — serialise these

Two changes that touch the same file never run in parallel lanes. Each row lists every item that
touches it, so a lane can check before it starts.

| File | Items |
|---|---|
| `scripts/foundry/ops/config.py` | -3, -7, -13 (paths), W2 |
| `Makefile` | -1, -8, -25 (pentaryn side of mcp-fork-25), W4 |
| `scripts/foundry/ops/modules.py` | -5, -6, -10, -41, W3 |
| `scripts/foundry/ops/cli.py` | -8, -36, -41, W1, mcp-fork-25 |
| `scripts/foundry/update/escalate.py` | -2, -20, -21, -22, -39, W5 |
| `scripts/foundry/update/adjustments.py`, `pyproject.toml` | W5 |
| `scripts/mcp/server.py` | -27, -28, -29, -50 |
| `scripts/combat_actions_db.py` | -42, -43, -44, -45, -46, -47 |
| `context/foundry/README.md` | W7, mcp-fork-20, -36 (generated index) |

## 2. Every python-tooling id

"Audit wave" is the audit programme's (`../code-audit-2026-10.md`). "Blueprint" says what the
blueprint item does to it: **merges with** (one change, done once), **closed by** (already done;
close the finding with a pointer), **precedes** / **after** (ordering), or — (independent).
python-tooling-40 does not exist (dropped in verification). Ids -42…-53 are gap-fill stubs: no file
or line in `audit-findings.json`; their full text is only in
[`../code-audit-2026-10/python-tooling.md`](../code-audit-2026-10/python-tooling.md).

| Id | Finding (short) | Audit wave | Blueprint | Files touched |
|---|---|---|---|---|
| -1 | Makefile pattern rules + aliases | W0 | **merges with W4** (`foundry-walls-check` alias, `foundry-modules-check`); after -2 step a | `Makefile` |
| -2 | `escalate.make_checks()` scrapes the Makefile | W0 (step a); step b deferred | **merges with W5** (`make_checks()` from `ops_cfg.MODULES`); **precedes** -1 | `update/escalate.py` |
| -3 | registry complete; register pings; after_sync next to module | W0 | **merges with W2** (a `pings` spec; `after_sync` read from `flags.pentaryn.afterSync` — trap 1) | `ops/config.py` |
| -4 | module skeleton + `ops module-new` | W1 | **closed by** `new_module.py` + template; W1 adds the `module-new` wrapper only (trap 2) | `ops/cli.py` (wrapper only) |
| -5 | module-sync deletes before copying (non-atomic) | W1 (step a); step b deferred | — (README Stage 1 item 2); with -53 | `ops/modules.py`, `ops/pipeline.py` |
| -6 | parse gate `node --check` concurrently | W5 | after W3 (same file) | `ops/modules.py` |
| -7 | gate the ties suite (`test/run.mjs`, node-test) | W0 | **merges with W2** (node-test on ties) **and** the ties guide (`test/run.mjs`, S1) | `ops/config.py`; `pentaryn-ties/test/run.mjs` (ties guide) |
| -8 | `make test`, `foundry-modules-check`, help | W0 | **merges with W4** (targets) and **W1** (`module-check --all`) | `Makefile`, `ops/cli.py`, `ops/modules.py` |
| -9 | drift note names wrong target; same-version drift invisible | W1 | — | `update/inventory.py` |
| -10 | sync stamp + ops JSONL log | W1 | — (README Stage 1); exclude the stamp from digests | `ops/modules.py` |
| -11 | foundry-down returns before the port is free | W4 **declared** | — | `ops/service.py` |
| -12 | one Foundry-app module for probes/start/stop | W2 | — | `update/admin.py` + new `foundry/app.py` |
| -13 | `FOUNDRY_DATA` means two dirs; centralise paths | W2 | — (serialise on `config.py`) | `cloud.py`, new `paths.py`, `update/plan.py:166` |
| -14 | four pid-liveness helpers | W2 | — | `update/recover.py` + new `procs.py` |
| -15 | updater shells to make which shells to ops | W2 | — | `update/recover.py` |
| -16 | copy-pasted Infisical fetch | W2 | — (secrets stay in Infisical; read at point of use) | `admin_password.py` + new `secrets.py` |
| -17 | `gh_api()` raises on timeout / missing gh | W4 | — | `update/upstream.py` |
| -18 | release-note rendering duplicated | W2 | — | `update/adjudicate.py` + new `update/notes.py` |
| -19 | duplicate policy→Spec builders, dead aliases | W2 | — | `update/report.py` |
| -20 | bundle/cache-key loop duplicated | W2 | after W5 (escalate.py) | `update/escalate.py` |
| -21 | split `escalate._run` | W2 | after W5 | `update/escalate.py` |
| -22 | filename regex inlined | W2 | after W5 | `update/escalate.py` + `update/scrub.py` |
| -23 | swallowed updater exceptions untraced | W4 | — | `update/apply.py` |
| -24 | hardcoded interpreter/node paths | W2 | — | `update/apply.py` |
| -25 | `snapshot_digest` stats three times | W4 | — | `cloud.py` |
| -26 | `build_actors` re-reads sheets; no golden | W4 | — | `build_actors.py` |
| -27 | discovery AST-parses every script | W4 | — | `scripts/mcp/server.py` |
| -28 | read-only module + action-log tools via dnd-scripts | W3 | **after W1** (`module-check --json`, -41); its module list should read each module's `describe()` golden, not re-derive it. A new tool — the audit's own note says it may be a deferred feature | `ops/mcp_tools.py` |
| -29 | dnd-scripts per-call action log | W3 | — | `scripts/mcp/server.py` |
| -30 | `eval.jsonl` unrotated | W4 | **in the fork lane** with mcp-fork-5/-6 ([`migrate-mcp-fork.md`](migrate-mcp-fork.md) §4) | fork `eval-js.ts` |
| -31 | `make login` double status + KeyError | W4 | — | `ops/login.py` |
| -32 | osascript fallback does not escape | W4 | — | `update/notify.py` |
| -33 | ad-hoc print helpers → `ops/out.py` | W1 | — (README Stage 1) | `ops/service.py`, new `ops/out.py` |
| -34 | no conftest; duplicated fakes | W0 | — (the blueprint's tests live in `scripts/foundry/blueprint/tests`; W5 adds them to `testpaths`) | `scripts/tests/` |
| -35 | tooling README thin; no build-a-module use-doc | W1 | **closed by** `context/foundry/addon-blueprint.md` (D13) for the use-doc half; the README-table half remains; the CLAUDE.md row is **W6** | `scripts/foundry/README.md` |
| -36 | generate the module index; fail check-context when stale | W0 | **merges with W7 + mcp-fork-20**: one generated "Module APIs" index in `context/foundry/README.md` (from `module.json` + each `golden/describe.json`), not a second file `modules.md` | new `ops/index.py`, `ops/cli.py`, `scripts/check_context.py` |
| -37 | `bridge.scan` unguarded `int()` | W4 | — | `ops/bridge.py` |
| -38 | `prompt-marker-art.py` not importable | W0 | — | rename to `prompt_marker_art.py` + callers |
| -39 | escalate ↔ report lazy imports | W2 | after W5 | `update/escalate.py`, `update/report.py` |
| -41 | `--json` on module-check/status/bridge-status | W0 | **merges with W1** (`module-check --all --json`); W3's vendor/conformance gates report through the same `GateResult` | `ops/cli.py`, `ops/modules.py` |
| -42 | actions DB rewrites drop lines | W4 **declared** | — (stub) | `scripts/combat_actions_db.py` |
| -43 | `npc`/`action` in a spec re-keys the row | W4 **declared** | — (stub) | `scripts/combat_actions_db.py` |
| -44 | unlocked read-modify-writes on 8 threads | W4 **declared** | — (stub) | `scripts/combat_actions_db.py` |
| -45 | actions validator accepts what build_actors rejects | W0 (pins); narrowing deferred | — (stub) | `scripts/combat_actions_db.py`, `build_actors.py` |
| -46 | retired combat-runner code | W2 | — (stub) | `scripts/combat_actions_db.py`, `scripts/dnd_roller.py` |
| -47 | upsert points at a retired template | W0 (docs) | — (stub) | `scripts/combat_actions_db.py` docstrings |
| -48 | dnd-scripts tool contracts | W3 | — (stub) | `scripts/mcp/` tool modules |
| -49 | `check_lore_links` drops `zone`; timeline key writes outside repo | W4 **declared** | — (stub) | `scripts/lore.py`, timeline scripts, new `scripts/_paths.py` |
| -50 | second unused dispatch path in MCP modules | W2 | — (stub) | `scripts/lore.py`, `srd5_2.py`, `ages_converter.py` |
| -51 | `roll_dice` can hang a worker | W4 **declared** | — (stub) | `scripts/dnd_roller.py` |
| -52 | `test_dnd_roller` writes the real dice cache | W0 — **before anyone runs that test** | — (stub) | `scripts/tests/test_dnd_roller.py` |
| -53 | `pipeline.stage` non-atomic importer install | W1/W2 | — with -5 (same `_install` helper) | `ops/pipeline.py` |

## 3. Order inside the lane

1. **Stage 0** (with the blueprint's pending wiring): -52 first (it protects a real cache); -2 step a
   → W5; then -1 + -8 → W4; -3 + -7 → W2; -41 → W1; -36 with W7. -4 and -35 (use-doc half) are
   closed by pointer the same day.
2. **Stage 1:** -5 step a + -53, -10, -33, -9 (README §3 Stage 1 item 2).
3. Then audit Waves 2 → 3 → 4 → 5 for the rest, serialising on §1's shared files. Declared items
   (-11, -42, -43, -44, -49, -51) go to the live-test workflow like any declared module change.
4. Deferred (Joe): -2 step b, -5 step b, -45 narrowing.

## Result (fill when done)

| | |
|---|---|
| Closed by pointer (date) | -4: ______ · -35 (use-doc half): ______ |
| Merged with W items (which, date) | ______ |
| Independent ids done | Stage 1 (2026-10-11, `migrate/wave-1`): -33 `60bde34` (`ops/out.py`); -5 step a `8c287ad` + `71a4414` (atomic `modules.install`, staging in `FoundryVTT/.pentaryn-sync/`, outside `Data/`); -53 `70588b1` (`pipeline.stage` uses it); -10 `b902e30` (`.pentaryn-sync.json` stamp + `foundry/logs/ops-YYYY-MM.jsonl`; tests isolate the log via a conftest autouse fixture); -9 `e7b5b17` (`sync_hint`, `content_drift`, shared `ops/digest.py`) |
| Commits (Joe-approved) | ______ |
