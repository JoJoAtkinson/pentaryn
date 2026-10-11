---
title: "Code audit 2026-10 — Python tooling (Makefile, ops, updater, content, MCP server, dnd-scripts tools, tests)"
status: active
last_modified: 2026-10-10
tags: [plans, audit, foundry]
---

# Code audit 2026-10 — Python tooling (Makefile, ops, updater, content, MCP server, dnd-scripts tools, tests)

**Read this when:** you are about to refactor, harden or document Python tooling (Makefile, ops, updater, content, MCP server, the dnd-scripts MCP tools, tests) and want the audited, behaviour-preserving change list with its characterisation tests.
**Not this file:** the cross-addon design, kit and wave order → [`../code-audit-2026-10.md`](../code-audit-2026-10.md).

> History-tree plan, not a use-doc. Line numbers refer to the frozen audit snapshot (see the master plan); re-locate each change by its **anchor** if the live file has drifted. Write the characterisation test first, run it green, refactor, re-run.

## Summary

### tooling:makefile

**Purpose.**

The commands worth remembering. It covers the table lifecycle (vtt-*), the pieces (foundry-*, tunnel-*), secrets checks, the actor pipeline, OneDrive backup and restore, per-module check and sync, and the updater targets. All logic lives in Python.

**Health.**

Well commented and thin. The module section is 49 hand-written lines (175-225) plus a .PHONY line per module, which grows by three lines for every new addon. There are inconsistencies: walls uses foundry-walls-test instead of -check, pings has no targets, and there is no aggregate target to check every module or run pytest. `make help` lists only 3 of 18 modules. The updater's escalate.make_checks() regex-parses this file, so the Makefile's naming is a hidden API.

**LLM interface.**

An LLM finds targets by reading the file or running make -pRrq. Nothing machine-readable says which modules exist or how to gate them. Better: pattern rules plus `ops module-list --json`, with an MCP tool reading the same registry (python-tooling-28).

**How to extend.**

Today a new module needs four hand edits here: a .PHONY entry, a check line, a sync line, and optionally a help line, plus a ModuleSpec in config.py. It is unclear whether a module wants -check or -test (walls) and whether pings is meant to be synced by hand. With python-tooling-1 and -3, nothing in the Makefile changes per module.

### tooling:ops

**Purpose.**

`python -m scripts.foundry.ops`. It runs the Foundry app and tunnel lifecycle, status, the MCP-bridge orphan reaper, the one-command `login` handoff, the actor-pipeline Stage 2 with its public-404 gate, and module check/sync with four gates (parse, imports, i18n, node-test). jsscan.py is a purpose-built ES-module lexer for the imports and i18n gates.

**Health.**

Good docstrings and good test coverage (test_foundry_ops 55 tests, test_module_checks 25, test_bridge_orphans 15). Problems:
- config.MODULES (lines 114-312) is a hand-kept registry with stale after_sync prose (transform still says '0.2 adds hud.mjs'). pings is missing from it.
- sync is rmtree+copytree, which is not atomic and ships test/, wasm/target and .md files.
- Gate output is human text only.
- The parse gate spawns node serially, about 23 ms per file.
- Three print helpers exist (service._say, login._say, cloud.log).
- service.down() returns before Foundry has released the port, which races vtt-down's backup.
- Lifecycle, probes, pid checks and paths are duplicated with the update/ package.

**LLM interface.**

Reached only by shelling out to make or `python -m`; output is prose. The dnd-scripts MCP server discovers MCP_TOOL literals under scripts/, but ops declares none. So an LLM cannot ask 'which modules exist, which version is live, did the gates pass' without parsing text, and per CLAUDE.md it should not shell out when a tool exists. Proposals: --json on module-check (python-tooling-41), a read-only foundry_modules MCP tool (python-tooling-28), and a sync stamp that says which code is live (python-tooling-10).

**How to extend.**

A new module goes in foundry/module/<id>/ with a ModuleSpec in config.py, a Makefile pair and hand-written after_sync text. There is no template and no 'module-new' command. It is unclear whether a new module should get node-test (ties does not), and what the core/glue split and publish-guard conventions are (they are documented nowhere in tooling). python-tooling-3, -4, -35 and -36 make this a single scaffold command plus a use-doc.

### tooling:update

**Purpose.**

The unattended Saturday updater: gate, backup (OneDrive tar plus per-package Foundry backups), scan, deterministic risk buckets, LLM adjudication, an escalation tier (triage/analysis with validated tool-less model calls and cached plans), apply, browser and server smoke test, recovery by failure class, report, commit, and notification. adjustments.py keeps foundry/adjustments.yml honest (markers plus an exposure grep).

**Health.**

Mature and heavily commented, with explicit fail-closed design. Tests are strong: test_update_escalation has 93 tests, plus test_update_crash, test_update_window and test_admin_api_369. Problems:
- escalate.py is 1598 lines, and _run alone is 285 lines (1218-1502).
- The bundle/cache-prep loop is duplicated between _run and preview().
- Release-note rendering is duplicated between adjudicate and escalate, and the adjudicate copy can raise TypeError on a null published date.
- spec() is duplicated in adjudicate.py and report.py.
- There is dead code: risk._preview_blockers and the DENIED_TOOLS aliases.
- Several swallowed exceptions leave no trace in the run record (_repair_from, _prune_snapshots, smoke.package_warnings).
- gh_api and forks._gh can raise TimeoutExpired despite 'never raises'.
- Interpreter and node paths are hardcoded.
- The drift note tells you to run `make foundry-sync`, which is the actor stage target, not a module sync.
- local_drift compares only module.json versions, which the modules do not bump.

**LLM interface.**

An LLM reads the committed run records (foundry/logs/auto-updates/*.json|md) and the plans directory. The JSON record is well structured. The run's own LLM calls are fenced by llm.build_command and are not an agent interface. Improvements: content-hash drift so a report says which local modules are stale (python-tooling-9), and a run-status/last-report MCP tool (a candidate for the python-tooling-28 module).

**How to extend.**

New risk rules go in risk.py and new escalation tiers in escalate.py: Tier enum, DEFAULTS.tiers, ceiling chain, schema plus validator. A new adjustment row goes in foundry/adjustments.yml with markers. It is unclear where shared helpers belong; today they are copied between adjudicate, report and escalate. An update/notes.py and llm.policy_spec (python-tooling-18 and -19) give them a home.

### tooling:content

**Purpose.**

Content generators and asset tools:
- build_actors.py (combat-runner markdown + actions.jsonl → actors.json, contract @1)
- cloud.py (OneDrive assets down, world snapshots up, retention, restore)
- admin_password.py and license_key.py (Infisical-backed secrets)
- build_scenes.py, prep_map.py, ring_subject.py, travel_glyph.py and prompt-marker-art.py (art and scene helpers)

**Health.**

Each script is self-contained and well explained. build_actors has strong internal linting but no golden test, although scripts/foundry/README.md:68 says actors.json is 'the golden-file surface for pytest'. It also reads every world/*.md twice (369 files, 46 MB tree). cloud.snapshot_digest stats each file three times over a 2.7 GB Data/modules tree on every vtt-up and vtt-down. The Infisical fetch is copy-pasted between the two secrets modules, and source_of_record() fetches a second time. The name FOUNDRY_DATA means the FoundryVTT root in cloud.py but the Data dir in six other files. prompt-marker-art.py has a hyphenated name, so it cannot be imported or tested.

**LLM interface.**

Shell only (`make foundry-actors`, `python -m scripts.foundry.cloud status`). None of these scripts declare MCP_TOOL. That is fine for the write paths. A read-only `cloud status --json` (snapshots, newest, server running) would be a cheap addition to the python-tooling-28 tool set.

**How to extend.**

A new art generator lands as another top-level script with its own copy of the Foundry Data path. With python-tooling-13 it imports scripts/foundry/paths.py instead. The README Files table lists only 3 of 10 scripts, so a future builder cannot tell from it what already exists (python-tooling-35).

### tooling:mcp-server

**Purpose.**

scripts/mcp/server.py is the `dnd-scripts` stdio MCP server. It auto-discovers MCP_TOOL/MCP_TOOLS literals (AST, no import) or MCP_HANDLERS modules (in-process import). It dispatches on a thread pool with in-flight admission control and a per-call subprocess timeout.

**Health.**

Robust: it tolerates both JSONL and LSP framing, skips malformed frames, and has a tested discovery path (test_server_discovery, 11 tests). Weaknesses:
- Every scripts/**/*.py file gets a full ast.parse just to look for MCP_HANDLERS (78 ms of the 180 ms cold start).
- 78 'no MCP_TOOL' skips are dumped to stderr on every start, which buries real discovery failures.
- There is no per-call action log, unlike the fork's mcp-YYYY-MM.jsonl, so dnd-scripts usage cannot be audited.
- It exposes zero Foundry/module tooling.

**LLM interface.**

This is the LLM's native path, and adding a tool needs only a literal in a script. That makes it the right home for read-only module and log tools: foundry_modules and foundry_action_log in python-tooling-28, which removes the 'parse make output' and 'grep 4 MB of eval.jsonl' steps.

**How to extend.**

Add MCP_TOOLS plus MCP_HANDLERS to a script under scripts/. The filename must not start with '_' and must not live under scripts/mcp. This is documented in scripts/mcp/README.md and is clear. The only unclear point is where Foundry-side read tools belong. Proposal: scripts/foundry/ops/mcp_tools.py.

### tooling:tests

**Purpose.**

scripts/tests: 19 pytest files, 487 tests. Coverage:
- Foundry ops and updater: test_foundry_ops, test_module_checks, test_bridge_orphans, test_admin_api_369, test_update_crash, test_update_escalation, test_update_window, test_server_discovery
- Lore, SRD, timeline and dice tooling (the dnd-scripts MCP tools; audited in `tooling:dnd-scripts` below): everything else

**Health.**

Tests are high quality and incident-driven: each one names the outage it pins. Structural gaps:
- There is no conftest.py, and four different hand-rolled FoundryAdmin fakes exist (_FakeAdmin, _Recorder, FakeFA, Server369, plus an inline one in test_update_escalation).
- Six tests read live repo files (adjustments.yml, automation/, foundry/module) with no marker. They fail in any partial checkout, and they change outcome when the parallel live-test workflow edits adjustments.yml.
- The registry-vs-disk test is one-directional, so an unregistered module (pings) passes.
- There are no tests for build_actors, cloud retention, modules.sync contents, the node-test gate or the Makefile targets.
- There is no `make test`.

**LLM interface.**

Run with `.venv/bin/python -m pytest -q scripts/tests` (pyproject testpaths). Proposals: a `repo` marker so an agent can run the pure unit set anywhere (`-m 'not repo'`), and `make test`.

**How to extend.**

New tests go in scripts/tests/test_<area>.py. Fakes are copied from a neighbour today. With python-tooling-34 they come from conftest fixtures.

### tooling:dnd-scripts

**Purpose.**

The non-Foundry half of the LLM's call surface, served by `scripts/mcp/server.py` as the `dnd-scripts` MCP server:
- `lore.py` (894 lines): `search_npcs`, `get_npc`, `get_faction_overview`, `last_session_summary`, `find_lore`.
- `srd5_2.py` (2,691 lines): 60+ Open5e SRD tools.
- `dnd_roller.py` (687 lines): `roll_dice`, plus `combat_action_upsert` and `combat_actions_list` over `combat_actions_db.py` (591 lines).
- `ages_converter.py` (322 lines): the three age tools.
- `check_lore_links.py` (239 lines), `fix-md-links.py` (260 lines), `build_timeline_svg.py` (168 lines) and `build_timeline_key.py` (173 lines): one tool each.

`combat_actions_db.py` is also Stage 0 of the Foundry actor pipeline: it writes `foundry/actions.jsonl`, which `scripts/foundry/build_actors.py` reads.

**Health.**

Mostly good: argument validation is explicit, the lore and ages state are cached by mtime (measured on the live repo: `find_lore` 82 ms over 567 files, `_find_npc_file` 3 ms), SRD responses go through a 30-day `requests_cache`, and `_atomic_write` is crash-safe. The problems are concentrated in the write paths and the shared state:
- Rewrites delete comment and malformed lines, and the warning never reaches the caller (python-tooling-42).
- A spec can re-key its own row (python-tooling-43).
- Writes are unlocked while the server runs handlers on 8 threads (python-tooling-44).
- `roll_dice` shares an `asyncio.Lock`, an httpx client and an unlocked number pop across per-call event loops. A hang was reproduced offline (python-tooling-51).
- The roller's test suite overwrites the real `~/.cache` dice cache (python-tooling-52).
- The validator and `build_actors` disagree on what a valid row is (python-tooling-45).
- Retired combat-runner code remains (python-tooling-46).

**LLM interface.**

This is the LLM's native path. The tool contracts are uneven (python-tooling-48):
- Errors arrive by two channels.
- 7 tools have no read/write annotations.
- No SRD description points at the owned books that CLAUDE.md routes to.

Two subprocess tools mishandle arguments: `check_lore_links` drops `zone`, and `build_timeline_key` writes outside the repo (python-tooling-49). The in-process modules also keep an unused CLI dispatch that has drifted from their MCP path (python-tooling-50).

**How to extend.**

Adding a tool means adding a literal: `MCP_TOOLS` plus `MCP_HANDLERS` in a `scripts/*.py` whose name does not start with `_` (documented in `scripts/mcp/README.md`). New tools should:
- raise on error rather than return `ok: false`;
- declare `annotations`;
- skip `argv` when they declare a handler;
- be covered by the schema and annotation tests in python-tooling-48 and -49.

## Scope statement — every file named, with what was checked

Added after the first pass, to close the gap that the dnd-scripts MCP tools were not audited. Every file below was read from the snapshot; "nothing found" means all eight categories were checked.

**Audited for all eight categories (findings above):**

- `scripts/combat_actions_db.py`: python-tooling-42, -43, -44, -45, -46. Performance: one 63 KB read per call; nothing found.
- `scripts/dnd_roller.py`: python-tooling-46, -47, -48, -51, -52.
- `scripts/lore.py`: python-tooling-48, -50. Performance was measured (above) and nothing was found. Hardening: the slug and path confinement in `get_faction_overview` (line 412) and `find_lore` (`_REPO_ROOT in full.parents`) is sound.
- `scripts/srd5_2.py`: python-tooling-48, -50. Its transport errors are already turned into `ValueError`s (`_api_get`), and responses are cached for 30 days. Nothing else found.
- `scripts/ages_converter.py`: python-tooling-48, -50. The MCP path caches by the newest mtime and refuses an empty index; nothing else found.
- `scripts/check_lore_links.py`, `scripts/fix-md-links.py`, `scripts/build_timeline_key.py`, `scripts/build_timeline_svg.py`: their MCP contracts are covered by python-tooling-48 and -49. Their internals are link and SVG generation for the lore vault, not addon tooling; they were reviewed for the call contract only.
- `scripts/check_context.py` (89 lines): the CLAUDE.md and context gate. Reviewed. Its only gap is the stale-module-index check that python-tooling-36 adds; nothing else found.
- `scripts/foundry/ops/pipeline.py` (201 lines): python-tooling-53. Otherwise sound (see that finding).
- `scripts/foundry/update/plan.py` (330 lines): reviewed. Its broad catches are documented `noqa` "notes are an input, never a reason to fail a scan", recorded as downgraded confidence. Lines 166–167 hold a fifth hard-coded `/Applications/Foundry Virtual Tabletop.app` path; add it to python-tooling-13's `paths.py` list. Nothing else found.
- `scripts/foundry/update/state.py` (196 lines): reviewed. `_pid_alive` is one of the four helpers in python-tooling-14. `Lock` (`O_EXCL` directory plus `owner.json`), `RunStatus` and `EntryState` are sound. Nothing else found.

- `scripts/foundry/update/forks.py`: covered by python-tooling-17 (`forks._gh()` raises on a timeout or a missing `gh`). Package stubs `scripts/__init__.py`, `scripts/foundry/__init__.py`, `ops/__init__.py`, `ops/__main__.py` (it only calls `cli.main`), `update/__init__.py` and `mcp/__init__.py`: nothing to audit.

**Out of scope, with the reason:**

- `scripts/timeline_svg/` (23 files, about 4,300 lines): the world-history SVG renderer behind `build_timeline_svg`. It has no Foundry, addon or in-game coupling. It has 6 dedicated test files (`test_timeline_svg`, `test_timeline_generate`, and four `test_history_*`), and its only LLM-facing contract is the MCP tool audited in python-tooling-48. Auditing its layout internals is a lore-tooling job, not part of this addon audit.
- `scripts/research_curve.py` (727 lines): a standalone Monte Carlo calculator for a homebrew skill challenge. Its configuration lives in the file, it has no callers and no `MCP_TOOL`, and it is not an addon.
- `scripts/clipboard_circle.py` (285 lines): a macOS clipboard-to-token-PNG utility. It has no callers and no `MCP_TOOL`, and it is not an addon.

## Findings index

| Id | Category | Impact | Effort | Title |
|---|---|---|---|---|
| python-tooling-6 | Performance gains | low | S | Run the parse gate's node --check calls concurrently |
| python-tooling-25 | Performance gains | low | S | snapshot_digest stats every file three times |
| python-tooling-27 | Performance gains | low | S | Discovery AST-parses every script; benign skips flood stderr |
| python-tooling-8 | Maintainability gains | medium | S | Add aggregate targets: make test, foundry-modules-check, generated help |
| python-tooling-21 | Maintainability gains | medium | M | Split the 285-line escalate._run along its sections |
| python-tooling-26 | Maintainability gains | medium | S | build_actors re-reads every sheet and has no golden test |
| python-tooling-34 | Maintainability gains | medium | S | No conftest; duplicated FoundryAdmin fakes; unmarked live-repo tests |
| python-tooling-15 | Maintainability gains | low | S | Updater shells to make which shells back into ops |
| python-tooling-19 | Maintainability gains | low | S | Duplicate policy->Spec builders and dead aliases |
| python-tooling-38 | Maintainability gains | low | S | prompt-marker-art.py is hyphenated and cannot be imported or tested |
| python-tooling-46 | Maintainability gains | low | S | Retired combat-runner code still ships in the actions DB and the roller |
| python-tooling-52 | Maintainability gains | medium | S | test_dnd_roller writes and deletes the real dice cache in ~/.cache |
| python-tooling-3 | Defragmentation | medium | M | Make the module registry provably complete; register pings; keep after_sync next to each module |
| python-tooling-12 | Defragmentation | medium | M | One Foundry-app module for probes and start/stop |
| python-tooling-18 | Defragmentation | medium | S | Release-note rendering duplicated; adjudicate's copy crashes on null published |
| python-tooling-13 | Defragmentation | low | S | FOUNDRY_DATA means two different directories; centralise paths |
| python-tooling-14 | Defragmentation | low | S | Four pid-liveness helpers with contradictory PermissionError semantics |
| python-tooling-16 | Defragmentation | low | S | Copy-pasted Infisical fetch; source_of_record refetches |
| python-tooling-20 | Defragmentation | low | S | Bundle/cache-key/reuse loop duplicated between _run and preview |
| python-tooling-22 | Defragmentation | low | S | Filename-sanitising regex inlined repeatedly |
| python-tooling-39 | Defragmentation | low | S | escalate and report import each other lazily |
| python-tooling-50 | Defragmentation | low | M | In-process MCP modules carry a second, unused dispatch path that already diverges |
| python-tooling-53 | Defragmentation | low | S | pipeline.stage installs the importer with its own non-atomic rmtree + copytree |
| python-tooling-10 | Logging / auditability gains | medium | S | Record every module sync (JSONL ops log + sync stamp) |
| python-tooling-23 | Logging / auditability gains | medium | S | Swallowed updater exceptions leave no trace in the run record |
| python-tooling-29 | Logging / auditability gains | medium | S | dnd-scripts has no per-call action log |
| python-tooling-30 | Logging / auditability gains | low | S | eval.jsonl is unrotated and its comment contradicts the code |
| python-tooling-33 | Logging / auditability gains | low | S | Ad-hoc print helpers, no structured event output |
| python-tooling-7 | Hardening | high | S | Gate the ties suite: add test/run.mjs and add node-test to its checks |
| python-tooling-11 | Hardening | high | S | foundry-down returns before Foundry has released the port |
| python-tooling-2 | Hardening | medium | S | escalate.make_checks() scrapes Makefile text instead of the module registry |
| python-tooling-5 | Hardening | medium | S | module-sync deletes the live module before copying (non-atomic) |
| python-tooling-9 | Hardening | medium | S | Drift note names the wrong make target; same-version content drift is invisible |
| python-tooling-17 | Hardening | medium | S | gh_api()/forks._gh() raise on timeout or missing gh |
| python-tooling-24 | Hardening | low | S | Hardcoded interpreter and node paths in the updater |
| python-tooling-31 | Hardening | low | S | make login: double status call and KeyError on missing _id |
| python-tooling-32 | Hardening | low | S | osascript fallback does not escape title/subtitle |
| python-tooling-37 | Hardening | low | S | bridge.scan: unguarded int() and one ps per process |
| python-tooling-42 | Hardening | medium | S | combat_actions_db rewrites drop comment and malformed lines; the warning never reaches the caller |
| python-tooling-43 | Hardening | medium | S | A spec carrying `npc` or `action` silently re-keys the stored row |
| python-tooling-44 | Hardening | medium | S | Combat-action writes are unlocked read-modify-writes, and in-process tools run on 8 threads |
| python-tooling-51 | Hardening | medium | S | roll_dice can hang a worker: an asyncio.Lock and an httpx client shared across per-call event loops |
| python-tooling-49 | Hardening | medium | S | Two subprocess tools mishandle arguments: check_lore_links drops `zone`, build_timeline_key writes anywhere |
| python-tooling-4 | Extendability | high | M | Add a module skeleton and `ops module-new` |
| python-tooling-1 | Extendability | medium | S | Replace per-module make lines with pattern rules plus explicit aliases |
| python-tooling-45 | Extendability | medium | S | The actions validator accepts rows that build_actors rejects |
| python-tooling-28 | LLM interface | high | M | Expose read-only module and action-log tools via dnd-scripts |
| python-tooling-41 | LLM interface | medium | M | Add --json to module-check, status and bridge-status |
| python-tooling-48 | LLM interface | medium | S | dnd-scripts tool contracts: two error channels, 7 tools without annotations, no pointer to the owned books |
| python-tooling-35 | Documentation / skills | medium | S | README lists few tooling files and there is no build-a-module use-doc |
| python-tooling-36 | Documentation / skills | medium | M | Generate the module index; fail check-context when stale |
| python-tooling-47 | Documentation / skills | low | S | combat_action_upsert points LLMs at a template written for the retired launcher |

## Performance gains

### python-tooling-6 — Run the parse gate's node --check calls concurrently

**Category:** Performance gains · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/modules.py:64–70`

**Anchor:** `        proc = subprocess.run(["node", "--check", str(f)],`

**Current.**

_check_parse spawns one node --check per .mjs serially; the parse gate dominates module-check time (about 0.5 s for ties' 24 files).

**Proposed.**

Use ThreadPoolExecutor(max_workers=min(8, cpu_count)) with ex.map over the sorted files, then iterate results in order and report the first failure exactly as today.

**Behaviour test recipe (write first, must pass before and after).**

In scripts/tests/test_module_checks.py (skip if no node): tmp module with a.mjs valid, b.mjs `export const = ;`, c.mjs `function (`. Assert modules._check_parse(spec)==1, output has exactly one '✗ syntax error in' line naming b.mjs and not c.mjs. A valid module returns 0 and prints the existing success line. Passes before the change (serial stops at b).

**Risk.** Report order; ex.map preserves input order.

**Related:** python-tooling-8

### python-tooling-25 — snapshot_digest stats every file three times

**Category:** Performance gains · **Impact:** low · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/cloud.py:339–344`

**Anchor:** `                h.update(str(int(p.stat().st_mtime)).encode())`

**Current.**

is_file(), then stat() for size, then stat() for mtime on each file under Data/modules (GBs of files).

**Proposed.**

One p.stat() in try/except OSError (continue), skip unless stat.S_ISREG; same hashed bytes.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_cloud.py: tmp FOUNDRY_DATA with worlds, Config, modules (nested), file symlink, dir symlink, broken symlink; keep verbatim old function as _old_digest() in the test and assert cloud.snapshot_digest()==_old_digest(); digest changes after os.utime bump.

**Risk.** Digest mismatch causes one extra backup; equality test prevents it.

### python-tooling-27 — Discovery AST-parses every script; benign skips flood stderr

**Category:** Performance gains · **Impact:** low · **Effort:** S · **Addon:** tooling:mcp-server

**Where:** `scripts/mcp/server.py:550–595`

**Anchor:** `        if _has_top_level_assignment(source, "MCP_HANDLERS"):`

**Current.**

discover_tools ast.parse's every scripts/**/*.py even though few contain MCP_HANDLERS/MCP_GROUPS; main() writes every skip, mostly 'no MCP_TOOL', to stderr.

**Proposed.**

Guard with substring checks ('MCP_HANDLERS' in source, 'MCP_GROUPS' in source) before parsing; in main() log only real failures plus a count line; --list-tools still lists all.

**Behaviour test recipe (write first, must pass before and after).**

In test_server_discovery.py add test_discovery_unchanged_on_repo (marker repo): record sorted (tool name, script path, handler present) and sorted skipped (path, reason) before; assert equal after. Monkeypatch server.ast.parse with a counter and assert count <= files containing 'MCP_'. A tmp repo with one helper and one broken tool: only the broken one is reported to stderr.

**Risk.** Dynamic assignment missed (already unsupported).

**Related:** python-tooling-28, python-tooling-29

## Maintainability gains

### python-tooling-8 — Add aggregate targets: make test, foundry-modules-check, generated help

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:makefile

**Where:** `Makefile:20–43`

**Anchor:** `.PHONY: help`

**Current.**

No single command proves tooling and modules are healthy; help lists few modules; check-all covers only docs and lore.

**Proposed.**

cli.py: module-check positional nargs='?' plus --all (parser.error if neither); modules.check_all() runs every module, keeps going, prints a summary, returns 1 if any failed. Makefile: `test: ; @$(PY) -m pytest -q scripts/tests`, `foundry-modules-check`, extend check-all. Help gets a module-list line.

**Behaviour test recipe (write first, must pass before and after).**

In test_foundry_ops.py: monkeypatch modules.check to a recorder returning 1 for 'ties', else 0; assert cli.main(['module-check','--all'])==1 and recorder saw every key of cfg.MODULES sorted; assert cli.main(['module-check']) raises SystemExit(2); existing test_every_subcommand_routes and single `module-check ties` unchanged.

**Risk.** Only the new composite is slower; optional positional could mask typos (pinned by SystemExit test).

**Related:** python-tooling-1, python-tooling-6, python-tooling-7

### python-tooling-21 — Split the 285-line escalate._run along its sections

**Category:** Maintainability gains · **Impact:** medium · **Effort:** M · **Addon:** tooling:update

**Where:** `scripts/foundry/update/escalate.py:1218–1502`

**Anchor:** `def _run(plan: dict, cfg: dict, record: dict, *, run_id: str, dry: bool, forced: bool,`

**Current.**

_run holds facts, prep, budget, triage, candidates, analysis loop and plan writing with nested closures.

**Proposed.**

Introduce a _Ctx dataclass and extract _triage, _candidates, _analyze_one, _maybe_write_plan; _run orchestrates. Optionally move schemas/prompts to escalate_contract.py with re-exports.

**Behaviour test recipe (write first, must pass before and after).**

Golden-record harness shared with python-tooling-20: 6 fixtures (disabled, nothing exposed, triage hold_exposed, injection, functional analysis -> hold + plan, cached held_reuse). Capture before: record JSON, mutated plan['decisions'], FakeCaller call list, written plan file text; assert equal after. Existing escalation tests green.

**Risk.** Closure state (spend, injection early return) lost in extraction; golden call lists catch it.

**Related:** python-tooling-20

### python-tooling-26 — build_actors re-reads every sheet and has no golden test

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/build_actors.py:490–505`

**Anchor:** `head = "\n".join(path.read_text(encoding="utf-8").splitlines()[:30])`

**Current.**

discover_sheets reads each world md, Sheet.__init__ reads again, pc_slugs rescans world/party; comparable() called twice per key; README claims actors.json is the pytest golden surface but no such test exists.

**Proposed.**

Pass text into Sheet, collect PC slugs in the same walk, cache comparable() once per sheet, and add the golden test.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_build_actors_golden.py (marker repo): patch ba.source_revision, run ba.build(committed['generatedAt']) and compare to committed foundry/build/actors.json; if committed is stale, instead write json.dumps(build(...), sort_keys=True) to tmp before the refactor and compare after. Add unit cases for parse_area, parse_range, activity_id determinism, formula_label.

**Risk.** Ordering/content change; golden catches.

**Related:** python-tooling-35

### python-tooling-34 — No conftest; duplicated FoundryAdmin fakes; unmarked live-repo tests

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:tests

**Where:** `scripts/tests/test_foundry_ops.py:425–443`

**Anchor:** `class _FakeAdmin:`

**Current.**

Fakes are re-invented per test file and several tests read live repo state without a marker, so they fail in partial checkouts or when another workflow edits files.

**Proposed.**

Add scripts/tests/conftest.py with a fake_admin factory fixture; register `repo` marker in pyproject and mark the live-repo tests; migrate fakes one file at a time.

**Behaviour test recipe (write first, must pass before and after).**

`pytest --collect-only -q scripts/tests | tail -1` count identical before and after; full pytest passes on the real repo before and after; `pytest -m 'not repo'` passes on the snapshot.

**Risk.** More permissive shared fake hiding regressions; migrate incrementally.

**Related:** python-tooling-3, python-tooling-8

### python-tooling-15 — Updater shells to make which shells back into ops

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/recover.py:283–290`

**Anchor:** `["make", "tunnel-up"]`

**Current.**

recover.tunnel_up/down run make tunnel-up/down, which run the ops package; the failure reason is reduced to a return code.

**Proposed.**

Call service.tunnel_up()/tunnel_down() in-process with redirect_stdout capturing output into a module-level LAST_TUNNEL_OUTPUT; keep repo_root param and bool return.

**Behaviour test recipe (write first, must pass before and after).**

New test_update_recover.py: first pin subprocess.run(['make','tunnel-up']) rc 0/2 -> True/False; after the change monkeypatch service.tunnel_up returning 0/1 and assert True/False and capsys.out == ''.

**Risk.** Detachment of cloudflared when parent is launchd rather than make; verify.

**Related:** python-tooling-14

### python-tooling-19 — Duplicate policy->Spec builders and dead aliases

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/report.py:172–177`

**Anchor:** `def spec(policy: dict | None = None) -> llm.Spec:`

**Current.**

report.spec and adjudicate.spec duplicate logic; DENIED_TOOLS aliases, adjudicate._extract_json and risk._preview_blockers appear unused.

**Proposed.**

Add llm.policy_spec(policy,key,*,model,effort,timeout,budget); make both spec() one-liners; delete dead aliases after grep over scripts/ and automation/ finds no users.

**Behaviour test recipe (write first, must pass before and after).**

In test_update_escalation.py parametrize policies (None, {}, {'llm':'typo'}, bare isolation, full adjudicator/report overrides) and assert adjudicate.spec(p)/report.spec(p) equal literal Spec values captured before the refactor; add a grep test that deleted names have no references.

**Risk.** External importer in automation/.

**Related:** python-tooling-18

### python-tooling-38 — prompt-marker-art.py is hyphenated and cannot be imported or tested

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/prompt-marker-art.py:16–17`

**Anchor:** `    ./.venv/bin/python scripts/foundry/prompt-marker-art.py            # module assets only`

**Current.**

Only hyphenated script; unimportable so render() cannot be unit-tested; referenced by path in config.py after_sync text.

**Proposed.**

git mv to prompt_marker_art.py, update config.py and docstring, optionally leave a runpy shim at the old name.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_prompt_marker_art.py: for each key in SIZES assert sha256(render(k).tobytes()) equals the hash captured before rename by runpy.run_path of the old file (skip if fonts missing); assert prompts after_sync names the new path.

**Risk.** Stale path references; shim covers.

**Related:** python-tooling-3

### python-tooling-46 — Retired combat-runner code still ships in the actions DB and the roller

**Category:** Maintainability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/combat_actions_db.py:497–540` (+ 124–125, 166–169, 378–413, 563–586); `scripts/dnd_roller.py:502`

**Anchor:** `def format_ready_reference(npcs: list[str]) -> str:`

**Current.**

The combat-runner launcher and its `roll_combat_action` runner are retired (`dnd_roller.py:20–21`: "since the combat-runner launcher was retired"), but their remains are still here:
- `format_ready_reference` (497–540) and the `ready-ref` CLI command (563–564, 585–586) still build a "Ready actions" block that tells an LLM to call `roll_combat_action(...)`, a tool that no longer exists. A read-only grep of the repo finds no definition and no other caller.
- `upsert_many` (378–413) has no caller outside this file and no test.
- `_VALID_TRIGGER_EVENTS` is commented as a "Mirror of gui.event_bus.EventKind" (124–125), but there is no `gui` package. `_validate_slots`' docstring (166–169) and `_DICE_SPEC_RE`'s comment (91–95) describe the runner as the consumer. The real consumer is `scripts/foundry/build_actors.py`.
- `dnd_roller.py:502` defines `_DICE_RE`, which is never used: its definition is its only occurrence.

**Proposed.**

Delete `dnd_roller._DICE_RE`. Delete `format_ready_reference` and the `ready-ref` subcommand (confirm with Joe that nobody runs it by hand). Keep `upsert_many` (a sensible bulk API) but pin it with tests. Rewrite the three stale comments to name `build_actors.py` as the consumer, and point to python-tooling-45 for where the two grammars differ.

**Behaviour test recipe (write first, must pass before and after).**

Before any deletion, add to `scripts/tests/test_combat_actions_db.py`: `upsert_many` is all-or-nothing (one invalid entry → `ValueError` listing `entry[1]`, file byte-identical); two valid entries → both rows present with identical `updated_at`; an existing key is replaced in place. After the deletion: `python scripts/combat_actions_db.py list|get|validate|delete` behave as before (subprocess test with `DND_COMBAT_ACTIONS_DB` set); `grep -c roll_combat_action scripts/combat_actions_db.py` is 0. Do not run `test_dnd_roller.py` until python-tooling-52 lands.

**Risk.** `ready-ref` is a CLI surface; it has no caller in the repo.

**Related:** python-tooling-45, python-tooling-47

### python-tooling-52 — test_dnd_roller writes and deletes the real dice cache in ~/.cache

**Category:** Maintainability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/tests/test_dnd_roller.py:11–18`

**Anchor:** `def reset_cache():`

**Current.**

The autouse fixture clears the two in-memory lists, but not the file. Every `roll_dice` in the suite ends in `_pop_numbers` → `_write_cache()` (`dnd_roller.py:154–165`), which rewrites `~/.cache/dnd_roller/quant_numbers.bin` (`_CACHE_DIR`, line 104) with the seeded fake numbers, or unlinks it once the seed is consumed. So `pytest scripts/tests` destroys the real cache of fetched quantum numbers, and a leftover seeded file would be served later as "quantum" rolls. The audit did not run this test file for that reason.

**Proposed.**

In `reset_cache`, also `monkeypatch.setattr(dnd_roller, "_CACHE_DIR", tmp_path)` and `_CACHE_FILE` to `tmp_path / "quant_numbers.bin"` (both are module attributes read at call time). No product change.

**Behaviour test recipe (write first, must pass before and after).**

Write the fixture change, then add `test_suite_never_touches_home_cache`: record `(exists, st_mtime_ns, st_size)` of `Path.home() / ".cache/dnd_roller/quant_numbers.bin"` before a seeded `roll_dice(1, 20)` and assert it is unchanged after. All existing roller tests must pass unchanged.

**Risk.** None.

**Related:** python-tooling-34, python-tooling-51



## Defragmentation

### python-tooling-3 — Make the module registry provably complete; register pings; keep after_sync next to each module

**Category:** Defragmentation · **Impact:** medium · **Effort:** M · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/config.py:114–312`

**Anchor:** `MODULES = {`

**Current.**

MODULES is a ~200-line hand-kept dict. pentaryn-pings exists in foundry/module but has no ModuleSpec; the existing test only checks registry->disk. after_sync prose can go stale.

**Proposed.**

Add module_dirs() (sorted dirs under MODULE_SRC_ROOT with module.json); add `"pings": ModuleSpec("pentaryn-pings", check=_STATIC)`; optionally let ModuleSpec read flags.pentaryn.afterSync from module.json when after_sync is empty and move the tuples there verbatim.

**Behaviour test recipe (write first, must pass before and after).**

In scripts/tests/test_foundry_ops.py: (a) test_every_module_dir_is_registered asserting set(module_dirs()) - registered names == {'pentaryn-pings'} (passes today; empty set when pings registered). (b) Dump {k:(s.name,s.check,s.after_sync)} to a literal before moving prose; after the move assert the rebuilt dict is identical byte-for-byte. (c) run `python -m scripts.foundry.ops module-check pings` once; expect exit 0.

**Risk.** JSON escaping of after_sync text (unicode arrow); exact tuple comparison catches it.

**Related:** python-tooling-1, python-tooling-4, python-tooling-36

### python-tooling-12 — One Foundry-app module for probes and start/stop

**Category:** Defragmentation · **Impact:** medium · **Effort:** M · **Addon:** tooling:ops

**Where:** `scripts/foundry/update/admin.py:146–202`

**Anchor:** `def port_open(timeout: float = 2.0) -> bool:`

**Current.**

Three liveness probes (service.foundry_is_up, admin.port_open, cloud.server_running), two start/stop implementations and duplicated constants (FOUNDRY_APP/APP_NAME, FOUNDRY_URL/BASE_URL) with different semantics.

**Proposed.**

Create scripts/foundry/app.py with constants and listening()/answers_http()/serving()/process_running()/start()/quit(); keep every existing public name as a thin wrapper preserving its own semantics and timeout.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_app_lifecycle.py: monkeypatch subprocess.run/Popen/requests/socket; pin exact argv for service.up, admin.start_app, admin.quit_app (osascript then pkill on timeout), service.down; pin truth tables: foundry_is_up True only for 200/302, port_open True for any response, server_running True if either TCP connect works. Existing test_admin_api_369 stays green.

**Risk.** Probe unification changing semantics; wrappers + truth tables pin each.

**Related:** python-tooling-11, python-tooling-13

### python-tooling-18 — Release-note rendering duplicated; adjudicate's copy crashes on null published

**Category:** Defragmentation · **Impact:** medium · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/adjudicate.py:87–93`

**Anchor:** `f"  --- {n.get('version')} ({n.get('published', '')[:10]}) ---\n"`

**Current.**

adjudicate._candidate_block hardcodes 6 notes/2500 chars and slices n.get('published','') which is None for draft releases (upstream stores rel.get('published_at')); escalate._notes_block has a null-safe copy.

**Proposed.**

Add update/notes.py render(notes,*,cap,limit,empty) with null-safe formatting; both callers use it; re-export constants from escalate.

**Behaviour test recipe (write first, must pass before and after).**

In test_update_escalation.py capture before the change adjudicate._candidate_block and escalate._notes_block output for fixtures (2 notes, 8 notes, 3000-char body, empty list, body None) and assert byte-identical after. Add published=None case: raises TypeError before, renders after (intended hardening, name the test accordingly).

**Risk.** Whitespace drift changes prompts; byte-identical captures guard.

**Related:** python-tooling-19

### python-tooling-13 — FOUNDRY_DATA means two different directories; centralise paths

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/cloud.py:71–72`

**Anchor:** `FOUNDRY_DATA = Path.home() / "Library/Application Support/FoundryVTT"`

**Current.**

cloud.py FOUNDRY_DATA is the FoundryVTT root; ops/config.py, build_scenes.py, prep_map.py, travel_glyph.py use it for Data/. Many REPO_ROOT copies exist in update/*.py.

**Proposed.**

Add scripts/foundry/paths.py (REPO_ROOT, FOUNDRY_ROOT, FOUNDRY_DATA, APP paths) and rebind each module's legacy names to it, keeping their current meaning and module-attribute names (tests monkeypatch them).

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_paths.py asserting each legacy constant equals its pre-refactor literal (cloud.FOUNDRY_DATA, ops.config.FOUNDRY_DATA, admin.DATA/MODULES_DIR/APP_PAYLOAD, build_scenes/prep_map/travel_glyph constants, every update/*.REPO_ROOT == ops.config.REPO_ROOT). Written before the change, identical after.

**Risk.** Monkeypatch targets must stay module attributes.

**Related:** python-tooling-12

### python-tooling-14 — Four pid-liveness helpers with contradictory PermissionError semantics

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/update/recover.py:292–303`

**Anchor:** `def tunnel_running(repo_root: Path) -> bool:`

**Current.**

service._tunnel_pid, recover.tunnel_running, state._pid_alive and bridge._alive each implement pid liveness; PermissionError is dead in the first two and alive in the last two.

**Proposed.**

Add scripts/foundry/procs.py pid_alive(pid,*,permission_means_alive) and read_pidfile(path); each helper delegates with its current flag; document why.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_procs.py parametrized: monkeypatch os.kill to return/ProcessLookupError/PermissionError and pin current outputs per function (tunnel_pid 123/None/None, recover.tunnel_running True/False/False, state._pid_alive True/False/True, bridge._alive True/False/True, bridge._alive(1) False). Must pass before and after.

**Risk.** Accidentally flipping EPERM semantics; pinned.

**Related:** python-tooling-12, python-tooling-15

### python-tooling-16 — Copy-pasted Infisical fetch; source_of_record refetches

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/admin_password.py:61–162`

**Anchor:** `def _fetch_from_infisical() -> str:`

**Current.**

admin_password and license_key have near-identical _fetch_from_infisical; source_of_record()/check() call Infisical a second time (up to 30 s).

**Proposed.**

Add scripts/foundry/secrets.py infisical_get(name,*,error,empty_hint) with shared except block; add admin_password._resolve() returning (value,tier) used by all three callers. No caching across calls.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_secrets.py: monkeypatch subprocess.run for stdout 'pw\n', TimeoutExpired, FileNotFoundError, CalledProcessError with 'Unauthorized', empty stdout; pin the exact messages for both modules before refactor. Then assert admin_password.check() makes 1 subprocess call (2 today; intended) with identical printed line. Never log the secret.

**Risk.** Message drift; pinned.

### python-tooling-20 — Bundle/cache-key/reuse loop duplicated between _run and preview

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/escalate.py:1249–1260`

**Anchor:** `            text, files, bhash = build_bundle(f["id"], registry)`

**Current.**

escalate._run and preview repeat build_bundle, cache_key, cache_read, reusable_held and flag setting; preview stores f['cache_key'].

**Proposed.**

Extract _prepare(facts,registry,*,cache_dir,now,reuse_days,attempts,with_key=False); both callers use it. Do not add cache_key to _run facts (it would leak into prompts).

**Behaviour test recipe (write first, must pass before and after).**

Using FakeCaller and tmp cache in test_update_escalation.py add test_prepare_golden with 3 scenarios through esc.run and esc.preview; before refactor store json.dumps(record, sort_keys=True, default=str), preview JSON and the exact stdin strings FakeCaller received; assert identical after. Existing escalation tests stay green.

**Risk.** cache_key leaking into prompts.

**Related:** python-tooling-21

### python-tooling-22 — Filename-sanitising regex inlined repeatedly

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/escalate.py:932–933`

**Anchor:** `    safe = re.sub(r"[^A-Za-z0-9._-]", "_", pkg)`

**Current.**

The same re.sub appears in escalate (_cache_path, _fail_path, previous_analysis, write_plan, reusable_held) and upstream._cache_path (with a 180 cap).

**Proposed.**

Add safe_name(s,cap=None) and use it at all sites; upstream passes cap=180.

**Behaviour test recipe (write first, must pass before and after).**

In test_update_escalation.py, for ids ['dnd5e','pentaryn-ties','a/b c:d','x'*300,'ünï'] capture esc._cache_path, esc._fail_path, write_plan(...).name and upstream._cache_path before the change; assert identical after.

**Risk.** Forgetting the 180 cap; pinned.

**Related:** python-tooling-20

### python-tooling-39 — escalate and report import each other lazily

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/escalate.py:1127–1129`

**Anchor:** `    from scripts.foundry.update.report import IPV4, IPV6`

**Current.**

render_plan imports IPV4/IPV6 from report inside the function; report.cost_line imports escalate.cost_line lazily; report.scrub's _strip_ips is nested.

**Proposed.**

Add update/scrub.py (IPV4, IPV6, strip_ips) and move cost_line into llm.py; import at top level; keep re-exports.

**Behaviour test recipe (write first, must pass before and after).**

In test_update_escalation.py: report.scrub(rec) equals captured pre-refactor output for a record with '10.0.0.1', '2001:db8::1' and '17:21:33' (time survives); render_plan text unchanged for what_breaks containing '192.168.1.5'; report.cost_line(record)==escalate.cost_line(calls) incl. a timed-out T1 call.

**Risk.** Tests monkeypatching report.IPV4; grep first.

**Related:** python-tooling-21

### python-tooling-50 — In-process MCP modules carry a second, unused dispatch path that already diverges

**Category:** Defragmentation · **Impact:** low · **Effort:** M · **Addon:** tooling:dnd-scripts

**Where:** `scripts/srd5_2.py:2558–2671`; `scripts/lore.py:600–845`; `scripts/ages_converter.py:30–70, 272–316`

**Anchor:** `# --- Subprocess fallback (kept for compatibility; in-process is preferred) ---`

**Current.**

When a script declares `MCP_HANDLERS`, `server.py` imports it and binds every tool to its handler (`server.py:550–598`). An import failure skips the module (552–555) instead of falling back, so MCP never uses the `argv`/`value_flags` entries in those tool literals. Three modules still keep a parallel CLI dispatch:
- `lore.py`: `argv`/`value_flags` from line 616, `_parse_flag_args` at 778, `main` at 845.
- `srd5_2.py`: 46 `argv` entries, `_parse_flag_args` at 2561 with hand-kept int/float/bool key lists, and `main` at 2614 with a hand-kept `single_arg_tools` table.
- `ages_converter.py`: `argv` at lines 30, 47 and 70; `main` at 272.

The two paths already disagree. `ages_converter`'s MCP path refuses an empty age index (`_get_age_state`, lines 227–243: "Age conversions cannot be trusted"), but its CLI `main()` converts against the empty index and prints the bare year. `srd5_2`'s CLI coerces types by name lists that must follow every schema change by hand.

**Proposed.**

Keep the CLIs for human use, but stop presenting them as MCP fallbacks:
- Drop `argv`/`value_flags`/`bool_flags` from the tool literals of modules that declare `MCP_HANDLERS`. This has no runtime effect, because the server ignores them once a handler is bound.
- Replace the two `_parse_flag_args` with one `scripts/_cli.py:parse_flag_args(tokens, input_schema)` that coerces by the tool's schema types. The leading underscore keeps discovery from loading it.
- **[declared, CLI only]** Make `ages_converter.main()` load through `_get_age_state()`, so the CLI refuses an empty index the way MCP already does.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_server_discovery.py`: snapshot the tools/list payload (`name`, `description`, `inputSchema`, `annotations`) for lore, srd5_2 and ages_converter to a fixture before the change and assert equality after (`argv` is not part of the payload). `test_lore.py:462–520` keeps passing against the shared parser. Add srd parity: for each srd tool and token lists such as `["--limit", "5", "--dedupe", "false", "--cr_min", "0.5"]`, the shared parser equals the output today's `srd5_2._parse_flag_args` gives on the same tokens (captured before). ages: KNOWN today `main(["4150"])` with an empty index prints `4150`; after, it exits 2 with the index message.

**Risk.** CLI flag coercion edge cases; the parity test pins them.

**Related:** python-tooling-27, python-tooling-48

### python-tooling-53 — pipeline.stage installs the importer with its own non-atomic rmtree + copytree

**Category:** Defragmentation · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/pipeline.py:51–53`

**Anchor:** `    shutil.rmtree(spec.dst, ignore_errors=True)`

**Current.**

`stage()` installs pentaryn-importer with the same delete-then-copy pair as `modules.sync` (`modules.py:305–306`), but outside module-sync. So python-tooling-5 (atomic install) and python-tooling-10 (sync stamp and ops log) would not cover the importer, and a failed copy mid-stage leaves no importer in `Data/`. The rest of `ops/pipeline.py` was reviewed and is sound: `check_world` is a hard stop, `run_import` deletes the staged JSON on all three exits including the signal handler, and `verify` passes only on a 404 with the tunnel up.

**Proposed.**

When python-tooling-5 adds `modules.install(src, dst)` (copy to a sibling temp directory, then swap), call it from `pipeline.stage` as well, and route the sync stamp and log line through the same helper.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_foundry_ops.py`: monkeypatch `cfg.MODULES["importer"]` (src/dst under `tmp_path`), `cfg.FOUNDRY_MODULES`, `cfg.ACTORS_JSON`, `cfg.ACTORS_STAGED`, `cfg.WORLD_DIR` and `pipeline.build_actors` (→ 0). Characterise `stage()`: returns 0, `filecmp.dircmp(src, dst)` shows no differences, the actors file is copied, and captured output contains `target world`. With `WORLD_DIR` missing it returns 1 and dst is untouched. Same assertions after.

**Risk.** None beyond python-tooling-5's.

**Related:** python-tooling-5, python-tooling-10



## Logging / auditability gains

### python-tooling-10 — Record every module sync (JSONL ops log + sync stamp)

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/modules.py:307–310`

**Anchor:** `    _say(f"✓ module → {spec.dst}")`

**Current.**

A sync prints one line and leaves no trace; nobody can tell which commit/digest is live in Data/.

**Proposed.**

After successful copy write dst/.pentaryn-sync.json {module,version,digest,git,dirty,synced_at} and append a line to foundry/logs/ops-YYYY-MM.jsonl. Exclude the stamp from tree digests. Data/ is public while the tunnel is up: omit git hash if undesired.

**Behaviour test recipe (write first, must pass before and after).**

In test_foundry_ops.py: sync into tmp with FOUNDRY_MODULES/REPO_ROOT monkeypatched and _git_rev stubbed; assert stamp keys and one appended JSONL line with cmd='module-sync'; existing sync tests and printed output unchanged.

**Risk.** Dotfile makes Data copy differ from repo; handled by exclusion.

**Related:** python-tooling-5, python-tooling-9, python-tooling-33

### python-tooling-23 — Swallowed updater exceptions leave no trace in the run record

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/apply.py:211–225`

**Anchor:** `def _repair_from(entry: state.EntryState) -> None:`

**Current.**

_repair_from, _prune_snapshots, smoke.package_warnings, smoke._return_to_setup, plan._versions swallow exceptions silently.

**Proposed.**

Add optional notes list parameters, append 'what: ExcType: msg' while keeping the swallow and return values; wire into existing _WINDOW_NOTES/result.messages after existing messages.

**Behaviour test recipe (write first, must pass before and after).**

Keep test_update_crash.py::test_package_warnings_never_raises_on_odd_payloads unchanged. Add: package_warnings(FakeFA(setup_data=RuntimeError('socket refused')),{'x'},notes=notes)=={} and notes contains the message; _repair_from with world_active raising yields no exception and a note. run_env tests stay green.

**Risk.** Report/notification text changes; append after existing messages.

**Related:** python-tooling-17

### python-tooling-29 — dnd-scripts has no per-call action log

**Category:** Logging / auditability gains · **Impact:** medium · **Effort:** S · **Addon:** tooling:mcp-server

**Where:** `scripts/mcp/server.py:159–191`

**Anchor:** `def _run_call_worker(msg_id: Any, runner: "ToolRunner", arguments: dict[str, Any]) -> None:`

**Current.**

Only crash tracebacks go to stderr; the fork logs every call to JSONL.

**Proposed.**

When PENTARYN_MCP_LOG_DIR is set append {ts,server,tool,mode,args(truncated),ok,ms,error} to dnd-scripts-YYYY-MM.jsonl (month per call); wrap in try/except so logging never fails a call.

**Behaviour test recipe (write first, must pass before and after).**

In test_server_discovery.py: runner with handler lambda **k:'ok'; monkeypatch server._write_message to a list; unset env -> no file and payload identical to today; set env to tmp -> one line with keys {ts,server,tool,mode,args,ok,ms,error}; raising handler -> ok False and unchanged JSON-RPC error; env pointing at a file path does not break the call.

**Risk.** Write failure handling; tested.

**Related:** python-tooling-28, python-tooling-30

### python-tooling-30 — eval.jsonl is unrotated and its comment contradicts the code

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:logs

**Where:** `packages/mcp-server/src/fork/tools/eval-js.ts:71–75`

**Anchor:** `  const evalLogPath = logDir ? join(logDir, 'eval.jsonl') : null;`

**Current.**

(Fork repo.) eval-js appends everything to one eval.jsonl, while the action log rotates monthly; comment says always on but code is gated on PENTARYN_MCP_LOG_DIR.

**Proposed.**

Compute eval-YYYY-MM.jsonl at append time, fix comment; readers glob eval*.jsonl; leave existing file. Coordinate with fork owner.

**Behaviour test recipe (write first, must pass before and after).**

In the fork's vitest suite: set PENTARYN_MCP_LOG_DIR to tmp, invoke eval-js with a stub client, assert eval-YYYY-MM.jsonl exists with one line having the same keys as an existing eval.jsonl line; vi.setSystemTime to next month lands in the next file. grep docs/scripts for 'eval.jsonl' references.

**Risk.** Hard-coded filename readers.

**Related:** python-tooling-28, python-tooling-29

### python-tooling-33 — Ad-hoc print helpers, no structured event output

**Category:** Logging / auditability gains · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/service.py:36–37`

**Anchor:** `def _say(msg: str) -> None:`

**Current.**

service._say, login._say and cloud.log/die are separate; modules.py uses bare print; no machine-readable output.

**Proposed.**

Add ops/out.py say()/fail()/event(); say identical to today (stdout); event no-op unless PENTARYN_OPS_LOG; re-export _say in service and login; do not route cloud.die through it (stderr is load-bearing).

**Behaviour test recipe (write first, must pass before and after).**

Run existing test_foundry_ops and test_module_checks unchanged (capsys text assertions must pass byte-for-byte). Add test_out.py: event() writes nothing when env unset; with env set to tmp writes one JSON line with ts and kind.

**Risk.** Stream changes; kept on stdout.

**Related:** python-tooling-10, python-tooling-44

## Hardening

### python-tooling-7 — Gate the ties suite: add test/run.mjs and add node-test to its checks

**Category:** Hardening · **Impact:** high · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/config.py:115–128`

**Anchor:** `    "ties": ModuleSpec(`

**Current.**

ties has test/known.mjs, look.mjs, reach.mjs but no test/run.mjs and check=_STATIC, so make foundry-ties-check never runs its tests (_check_node_test requires test/run.mjs).

**Proposed.**

Add foundry/module/pentaryn-ties/test/run.mjs that runs the three suites in sequence (spawn each with node, or import if self-running), prints 'N passed, 0 failed' summing the counts and sets exitCode=1 on any failure; change ties check to (*_STATIC,'node-test').

**Behaviour test recipe (write first, must pass before and after).**

Before: from foundry/module/pentaryn-ties run node test/known.mjs; node test/look.mjs; node test/reach.mjs, record exit codes and pass counts. New run.mjs must exit 0 with the summed count. pytest: assert 'node-test' in cfg.MODULES['ties'].check and test/run.mjs exists (marker repo); run `python -m scripts.foundry.ops module-check ties` expecting 0, from repo root and module dir.

**Risk.** Suites depending on cwd; spawn each with cwd set to the module dir.

**Related:** python-tooling-8

### python-tooling-11 — foundry-down returns before Foundry has released the port

**Category:** Hardening · **Impact:** high · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/service.py:156–157`

**Anchor:** `    _say("✓ foundry stopped")`

**Current.**

down() sends osascript quit/pkill and returns immediately; make vtt-down then runs backup, which can die on a still-live server (update/admin.py documents the race).

**Proposed.**

After quit/pkill poll until process gone and foundry_is_up false (120 s deadline, pkill fallback, short flush sleep), reuse admin.quit_app logic. This is a timing change (vtt-down waits): flag as a hardening fix.

**Behaviour test recipe (write first, must pass before and after).**

In test_foundry_ops.py monkeypatch service.subprocess.run (pgrep rc 0,0,1; osascript 0), foundry_is_up returning [True,True,False], and time.sleep/monotonic. Pin first: already-down path prints '▸ foundry already down' returns 0; osascript failure triggers pkill. After: down()==0, prints '✓ foundry stopped', foundry_is_up polled until False.

**Risk.** Slower vtt-down by real shutdown time; bounded by deadline.

**Related:** python-tooling-12

### python-tooling-2 — escalate.make_checks() scrapes Makefile text instead of the module registry

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/escalate.py:592–619`

**Anchor:** `def make_checks(root: Path = REPO_ROOT) -> list[str]:`

**Current.**

make_checks regex-parses `foundry-*-check:` from the Makefile, so walls (target foundry-walls-test) is never offered and foundry-admin-check (a secrets check) is offered as a code test. The module set is defined twice (config.MODULES and Makefile).

**Proposed.**

Step (a), behaviour-preserving: derive from ops config: sorted({f'make foundry-{k}-check' for k in ops_cfg.MODULES if k not in {'walls','importer'}} | {'make foundry-adjustments-check','make foundry-admin-check'}); keep root param. Step (b) (behaviour change, separate PR, after python-tooling-1 alias): include walls, drop admin-check, filter render_plan's targets through make_checks().

**Behaviour test recipe (write first, must pass before and after).**

In scripts/tests/test_update_escalation.py add test_make_checks_pinned: reset esc._MAKE_TARGETS cache, capture the literal list esc.make_checks() returns on the current Makefile BEFORE the change and assert equality after step (a); also assert esc.checks_for(['foundry/module/pentaryn-walls/wall-engine.mjs','foundry/module/pentaryn-ties/look.mjs']) is unchanged. Step (b) deliberately updates the literals.

**Risk.** Importing ops.config into updater (no cycle: pathlib/os only). Step (b) changes analyst-visible enums; fails closed.

**Related:** python-tooling-1, python-tooling-3

### python-tooling-5 — module-sync deletes the live module before copying (non-atomic)

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/modules.py:306–310`

**Anchor:** `    shutil.copytree(spec.src, spec.dst)`

**Current.**

sync() does rmtree(spec.dst) then copytree; a failure mid-copy leaves Data/modules/<m> missing or partial while Foundry may be serving it. pipeline.stage has the same pattern.

**Proposed.**

Only step (a): add _install(src,dst) copying into a sibling dot-temp dir, renaming old dst aside, renaming temp into place, removing old; use from sync() and pipeline.stage(). Resulting tree is identical. Step (b) (excluding test/, *.md, wasm/target from the copy) CHANGES what is deployed: treat as a separate, flagged change that needs a manifest/import.meta.url guard; not part of the behaviour-preserving set.

**Behaviour test recipe (write first, must pass before and after).**

In test_foundry_ops.py: build tmp module (main.mjs, lang/en.json, module.json, test/run.mjs, README.md); monkeypatch cfg.FOUNDRY_MODULES to tmp, modules.check->0; sync and assert sorted relative paths of dst == src (current tree). Then monkeypatch shutil.copytree to raise OSError after creating the temp dir and assert the pre-existing dst content is intact (today it is deleted: intended hardening).

**Risk.** Leftover .sync-tmp dirs after a crash; cleaned at next run. Confirm Foundry ignores dot-dirs under Data/modules.

**Related:** python-tooling-10

### python-tooling-9 — Drift note names the wrong make target; same-version content drift is invisible

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/inventory.py:160–161`

**Anchor:** `"note": "Data/ copy differs from the repo — run make foundry-sync"`

**Current.**

local_drift compares only module.json versions, and the hint (also risk.py ~183) says `make foundry-sync`, which is the actor staging target, not a module sync.

**Proposed.**

Add _sync_hint(pkg_id) returning make foundry-<short>-sync (foundry-sync only for importer) and use it in inventory.py and risk.py. Optionally add content_drift entries via a tree_digest comparison as a NEW key (same version, different files).

**Behaviour test recipe (write first, must pass before and after).**

In scripts/tests/test_update_inventory.py with tmp repo/data module dirs and monkeypatched REPO_MODULE_SRC: pin (i) 0.9 vs 1.0 -> one entry installed/repo versions; (ii) equal versions and files -> []; (iii) module absent from repo -> 'installed but not present in foundry/module/'. After: (i) differs only in note ending 'make foundry-x-sync'; new case (iv) equal versions but differing file -> content_drift entry; (ii) still [].

**Risk.** Report text change (intended). The digest ignore list must match sync's.

**Related:** python-tooling-5, python-tooling-10

### python-tooling-17 — gh_api()/forks._gh() raise on timeout or missing gh

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/upstream.py:175–181`

**Anchor:** `    r = subprocess.run(cmd, capture_output=True, text=True, timeout=60)`

**Current.**

resolve() claims it never raises for network reasons, but gh_api does not catch TimeoutExpired/OSError; forks._gh same.

**Proposed.**

Wrap in try/except (subprocess.TimeoutExpired, OSError): return None; optionally record reason in a GH_ERRORS list surfaced in plan messages. Intended hardening (crash becomes held package).

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_update_upstream.py: monkeypatch upstream.subprocess.run to raise TimeoutExpired; assert gh_api(...) is None (raises today), and resolve(Package(...)) returns Upstream(error='could not resolve an upstream version') with CACHE_DIR patched to tmp. Same for forks._gh.

**Risk.** Failure now held rather than loud; add GH_ERRORS surfacing.

**Related:** python-tooling-23

### python-tooling-24 — Hardcoded interpreter and node paths in the updater

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/apply.py:243–247`

**Anchor:** `[str(REPO_ROOT / ".venv/bin/python"), "-m", "scripts.foundry.cloud",`

**Current.**

back_up() uses REPO_ROOT/.venv/bin/python; smoke.py hardcodes /opt/homebrew/bin/node.

**Proposed.**

Use sys.executable after confirming automation/bin/vtt-update.sh execs the venv python; NODE = shutil.which('node') or '/opt/homebrew/bin/node'.

**Behaviour test recipe (write first, must pass before and after).**

In test_update_crash.py patch subprocess.run with a recorder (rc 0) and admin quit/start, recover.newest_world_snapshot, recover.stash_system; assert argv[0] == sys.executable, comparing with the old literal under the .venv. For smoke, patch shutil.which->None and assert NODE falls back to '/opt/homebrew/bin/node'.

**Risk.** Wrapper might run a different python.

**Related:** python-tooling-13

### python-tooling-31 — make login: double status call and KeyError on missing _id

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/login.py:383–392`

**Anchor:** `        active = fa.status().world if fa.status().active else None`

**Current.**

fa.status() is called twice in one expression (racy) and who["_id"] raises KeyError outside the except tuple.

**Proposed.**

st = fa.status(); active = st.world if st.active else None; use who.get("_id") or who.get("id").

**Behaviour test recipe (write first, must pass before and after).**

In test_foundry_ops.py with a counting fake FoundryAdmin (status, authenticate, join_data, login_as) and patched service.up/foundry_admin_password/_handoff: login.login(world='space-journey',user='GM',open_browser=False,prompt=False)==0 with login_as('gm'); status call count 2 before, 1 after (intended). Case users=[{'id':'u1',...}] raises KeyError before, login_as('u1') after.

**Risk.** None meaningful.

### python-tooling-32 — osascript fallback does not escape title/subtitle

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** tooling:update

**Where:** `scripts/foundry/update/notify.py:84–96`

**Anchor:** `display notification`

**Current.**

Only the body has quotes replaced; a quote or backslash in title/subtitle yields an AppleScript syntax error and a silently lost notification.

**Proposed.**

Add _as(s) escaping backslash and double quote; apply to title and subtitle in both scripts; leave body handling byte-identical.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_update_notify.py: patch NOTIFIER_APP to a missing path, PAYLOAD_PATH to tmp, subprocess.run/Popen to recorders. notify.notify('done','weekly update','body "x"') argv script equals the pinned literal captured before (quote-free titles unchanged); notify('failed','run "7"','m') contains an unescaped quote before (pin as bug) and an escaped one after.

**Risk.** Altering quote-free text; literal-equality case guards.

### python-tooling-37 — bridge.scan: unguarded int() and one ps per process

**Category:** Hardening · **Impact:** low · **Effort:** S · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/bridge.py:107–120`

**Anchor:** `        ppid = int(rest[0])`

**Current.**

pid parse is guarded but ppid parse is not; _comm(ppid) spawns an extra ps per matched process.

**Proposed.**

try/except (ValueError, IndexError): continue around ppid; fetch `ps -eo pid=,comm=` once into a dict; judge() unchanged.

**Behaviour test recipe (write first, must pass before and after).**

In test_bridge_orphans.py: patch bridge.subprocess.run with canned ps outputs (two valid lines plus one malformed, comm map including a claude path, empty lsof) and os.kill; assert scan() returns the same Proc kinds/orphan flags/reasons as the pre-change code fed equivalent canned `ps -p` answers; after, the malformed line is skipped (intended) and subprocess calls drop to 3.

**Risk.** comm formatting difference between ps modes; test compares.

### python-tooling-42 — combat_actions_db rewrites drop comment and malformed lines; the warning never reaches the caller

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/combat_actions_db.py:46–84` (reader 46–59, rewrite 67–84; writers 352–423)

**Anchor:** `                print(f"warn: {p}:{lineno} skipped malformed JSON: {e}", file=sys.stderr)`

**Current.**

`_iter_records()` skips blank lines, `#` comment lines and any line `json.loads` rejects (a warning on stderr). `upsert`, `upsert_many` and `delete` then rewrite the whole file from the parsed records through `_atomic_write()`, so the first authoring call after a hand edit deletes every comment line and every malformed line. Verified on a scratch DB (`DND_COMBAT_ACTIONS_DB`): `# comment` + one good row + `not json`, then one `upsert` → the file holds the good row and the new row only.

The MCP tool runs in-process (`dnd_roller.py` declares `MCP_HANDLERS`; dispatch at `scripts/mcp/server.py:214`) and the server surfaces a script's stderr only on the subprocess path (`server.py:298–305`), so the "skipped malformed JSON" warning lands in the MCP host log while the LLM gets `{"ok": true}`. `foundry/actions.jsonl` is authoritative, git-tracked campaign data (docstring line 6) and Stage 0 of the actor pipeline (`build_actors.py:53` reads it). Latent today: the live file has 0 comment and 0 malformed lines (checked read-only).

**Proposed.**

**[declared — only paths that destroy data today change]**

1. Split the reader: `_read_lines() -> (records, comments, malformed)` where `malformed` is `[(lineno, reason)]`; `read_all()` keeps returning `records` exactly as today.
2. In the three writers, when `malformed` is non-empty, raise `ValueError(f"refusing to rewrite {p}: malformed line(s) {linenos}; fix them first")` before touching the file. `combat_action_upsert` already turns `ValueError` into `{"ok": false, "error": ...}`, so the LLM sees it.
3. Keep `#` comment lines: `_atomic_write(records, comments)` writes them first, in original order, then the sorted records. (The reader already treats them as legal, so deleting them is the bug.)

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_combat_actions_db.py` (its `tmp_db` fixture already points `DND_COMBAT_ACTIONS_DB` at `tmp_path`).

- Characterise first, unchanged by the fix: a 2-row file → after `upsert` the file text equals the pinned render (rows sorted by `(npc, action)`, `separators=(",", ":")`, `ensure_ascii=False`, one trailing `\n` per row); `read_all()` on `# c` / good row / `not json` returns `[good row]` and `capsys` stderr contains `skipped malformed JSON`.
- Pin today's loss: a test asserting that after one `upsert` the file still contains `# c`, marked `xfail(strict=True)` now (it fails today); the fix commit removes the marker.
- New after the fix: `upsert` on a file with a malformed line raises `ValueError` matching `malformed line` and the file is byte-identical; `dnd_roller.combat_action_upsert(...)` returns `ok: false` with that message; `delete` on the same file raises too.

**Risk.** Only the comment-loss and malformed-line paths change; a clean file renders byte-identically.

**Related:** python-tooling-43, python-tooling-44, python-tooling-29

### python-tooling-43 — A spec carrying `npc` or `action` silently re-keys the stored row

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/combat_actions_db.py:362` (and `upsert_many` at 404)

**Anchor:** `    record = {"npc": npc, "action": action, **spec}`

**Current.**

The spec is spread after the key fields, so `spec["npc"]` / `spec["action"]` override the arguments. Verified on a scratch DB: `upsert("a", "y", {..., "npc": "zzz"})` persists the row under `npc: "zzz"`, and `combat_action_upsert` reports `"npc": "zzz"`. The replace loop matched `(a, y)`, not `(zzz, y)`, so if `(zzz, y)` already existed the file now has two rows with the same composite key and `get()` returns whichever sorts first. `validate_spec` never looks at these keys, and the CLI `validate` (line 576) strips them before validating, so nothing can see the collision.

**Proposed.**

**[declared — only calls that mis-key a row today change]** `validate_spec` rejects a spec containing `npc` or `action` ("spec must not carry 'npc'/'action'; they are the key arguments"). Well-formed calls are unaffected; the CLI `validate` keeps stripping the top-level keys of stored rows (line 576), so every existing row still validates.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_combat_actions_db.py`:
- KNOWN today, deleted by the fix commit: `upsert("a", "y", {**UTILITY, "npc": "zzz"})["npc"] == "zzz"` (`UTILITY` = the module's minimal valid utility spec).
- After: the same call raises `ValueError` mentioning `'npc'`; `{**UTILITY, "action": "b"}` likewise.
- No false positives: each of the five valid kinds in the existing `kind` parametrisation still returns `[]`; the CLI `validate` path on a DB row that has top-level `npc`/`action`/`updated_at` still prints `OK`.

**Risk.** None for well-formed calls.

**Related:** python-tooling-42

### python-tooling-44 — Combat-action writes are unlocked read-modify-writes, and in-process tools run on 8 threads

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/combat_actions_db.py:352–423`

**Anchor:** `def upsert(npc: str, action: str, spec: dict) -> dict:`

**Current.**

`upsert`, `upsert_many` and `delete` each do `read_all()` → modify → `_atomic_write()`. The write is crash-safe (temp file, fsync, `replace`) but not concurrency-safe. `scripts/mcp/server.py` runs in-process handlers on a `ThreadPoolExecutor` (`DND_MCP_MAX_WORKERS`, default 8, lines 50 and 657), and every Claude session starts its own `dnd-scripts` process. Two overlapping upserts (parallel tool calls in one turn, or two sessions) both read the old file, and the second `replace` drops the first one's row. Both return `ok: true`.

**Proposed.**

**[declared — only concurrent outcomes change]** Wrap the read-modify-write of the three writers in `_locked()`, a context manager taking `fcntl.flock(LOCK_EX)` on a sidecar `<db>.lock` (stdlib; covers threads and processes on macOS/Linux). Readers stay unlocked (`replace` is atomic). Add `foundry/actions.jsonl.lock` to `.gitignore`.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_combat_actions_db.py`:
- Serial characterisation (unchanged): 20 sequential upserts of distinct actions → 20 rows and the pinned byte render.
- Concurrency: 16 threads behind a `threading.Barrier`, each `upsert("n", f"a{i}", UTILITY)`; assert `len(read_all()) == 16`. Loop the scenario 20 times inside the test so the pre-fix race shows; mark it `xfail(strict=False)` before the fix and plain after.

**Risk.** A lock file next to the DB; ignore it in git.

**Related:** python-tooling-42, ties-30 (same pattern for world settings)

### python-tooling-51 — roll_dice can hang a worker: an asyncio.Lock and an httpx client shared across per-call event loops

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/dnd_roller.py:111` (lock), `:131` (client), `:283–286` (pop), `:479` (`asyncio.run`)

**Anchor:** `_fetch_lock = asyncio.Lock()`

**Current.**

`roll_dice` runs `asyncio.run(...)` per call (line 479), and in-process calls run on the server's 8-thread pool (`server.py:50`, `:214`), so concurrent rolls run in different event loops on different threads. Three things are shared across them: `_fetch_lock` (a module-level `asyncio.Lock`, line 111); `_async_client` (an `httpx.AsyncClient` created inside the first call's loop, line 131, then reused after that loop has closed); and `_number_cache`, popped with no lock (`_pop_numbers`, lines 283–286: slice, then delete).

Reproduced offline (Python 3.14, scratch script): two threads each `asyncio.run` a coroutine that holds one module-level `asyncio.Lock` for 0.2 s. The second waiter never wakes, because its future is resolved from the other thread without waking its loop; only an outer `wait_for` ended it. `roll_dice` has no `wait_for`, and the 60 s cap covers only subprocess tools (`server.py:275`), so the tool call and its worker hang. The trigger is two overlapping rolls that both need a fetch: a cold cache, or every 1,024 numbers. The unlocked pop can also hand two concurrent rolls the same numbers, against the module header's "never reuses a number".

**Proposed.**

**[declared — only concurrent behaviour changes]** Guard the whole draw (`_ensure_numbers` + `_pop_numbers`) with a module-level `threading.Lock` taken in `roll_dice` before `asyncio.run`. Create the `httpx.AsyncClient` per call inside `_roll_dice_async` (`async with`), or fetch through the existing sync `requests` path in `asyncio.to_thread`, so no loop-bound object outlives its loop. Under the thread lock `_fetch_lock` is redundant; delete it.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_dnd_roller.py`, after python-tooling-52 isolates the cache file:
- Serial characterisation (unchanged): seed `[14, 11, 17, 3]`; `roll_dice(3, 20)` then `roll_dice(1, 20)`; assert the first call's `rolls` equal the mapping the existing `test_roll_dice_rolls_match_modulo` uses for `[14, 11, 17]` and the second's for `[3]` (numbers are consumed in order, never twice).
- Concurrency, run in a `subprocess` with `timeout=20` so a hang fails the test instead of the suite: empty cache; monkeypatch `_fetch_from_quantumnumbers` with an async fake that sleeps 0.2 s and returns `list(range(1024))`, and `_fetch_from_random_org_sync` to raise; 8 threads × `roll_dice(4, 20)`; assert every thread returns and a spy on `_pop_numbers` saw 32 distinct raw values. Expected to fail or hang before the fix.

**Risk.** Serialising draws costs microseconds per roll; network fetches already serialise.

**Related:** python-tooling-52, python-tooling-29

### python-tooling-49 — Two subprocess tools mishandle arguments: check_lore_links drops `zone`, build_timeline_key writes anywhere

**Category:** Hardening · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/check_lore_links.py:44–51`; `scripts/build_timeline_key.py:17–27, 162–166`

**Anchor:** `            "zone": {`

**Current.**

`check_lore_links` advertises a `zone` argument, but its `MCP_TOOL` has no `argv`/`value_flags` mapping, so `ToolRunner.run` (`server.py:222–264`) never passes it, even though `main()` accepts `--zone` (lines 194–196). Every MCP call therefore checks every lore zone: an LLM asking about one faction gets the whole-tree report, and a broken link anywhere becomes a JSON-RPC error.

`build_timeline_key`'s `output` (`value_flags` `--output`, line 27) is resolved against the repo only when it is relative (`main()`, 164–166). An absolute or `../` path writes outside the repo. `roll_dice`'s `log_path` is confined by `_confined_log_path` (`dnd_roller.py:50`); this argument is not. Nothing checks that every `input_schema` property of a subprocess tool is reachable through `argv`, `bool_flags` or `value_flags`.

**Proposed.**

**[declared]**
- Add `"value_flags": {"zone": "--zone"}` to `check_lore_links`' `MCP_TOOL`, so the documented argument is honoured.
- Confine `build_timeline_key`'s output (inside the repo, `.svg`) with the rule from `_confined_log_path`, moved to a shared `scripts/_paths.py:confined(path, suffix)`. The underscore keeps it out of discovery.
- Add the schema-coverage test, so a future tool cannot drop an argument silently.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_server_discovery.py`:
- `test_subprocess_schema_properties_are_mapped`: for every runner with `handler is None`, each `input_schema` property appears as a `{name}` placeholder in `argv` or as a key of `bool_flags`/`value_flags`. Allowlist `{("check_lore_links", "zone")}` before the fix (passes today); empty after.
- With a fake script that echoes `sys.argv`, `ToolRunner.run(arguments={"zone": "world/x"})` yields `--zone world/x` after the fix.
- `build_timeline_key.main(["--output", "../x.svg"])` raises after the fix. `main(["--output", "timeline-key.svg"])` still writes inside a monkeypatched `REPO_ROOT`.

**Risk.** `check_lore_links` with a zone now reports less (as documented); absolute output paths are refused.

**Related:** python-tooling-48






## Extendability

### python-tooling-4 — Add a module skeleton and `ops module-new`

**Category:** Extendability · **Impact:** high · **Effort:** M · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/cli.py:70–83`

**Anchor:** `    # ── modules ──`

**Current.**

No module template exists; new addons copy a neighbour, propagating divergences (module-id constant names, publish guards, lang layout, CSS location, test harness copies, READMEs without API sections).

**Proposed.**

Add scripts/foundry/ops/scaffold.py new_module(short,*,title,namespace=None) rendering templates/foundry-module/* via string.Template (module.json, <short>.mjs with MODULE_ID/DEFAULTS/publish guard, <short>-core.mjs, test/run.mjs with canonical harness, nested lang/en.json, README with Purpose/API/Settings/Hooks/Adjustments/Tests). Register `module-new` in cli.py and Makefile `foundry-module-new`. Refuse if dir exists.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_scaffold.py: monkeypatch cfg.MODULE_SRC_ROOT to tmp_path, call new_module('demo',title='Demo'); assert files exist and module.json flags.pentaryn.flagScope=='pentaryn-demo'; build a ModuleSpec for it and assert modules.check returns 0 (skip if no node); second call raises FileExistsError. Purely additive.

**Risk.** Template rot; the generated-module-passes-gates test guards it.

**Related:** python-tooling-3, python-tooling-35, python-tooling-36

### python-tooling-1 — Replace per-module make lines with pattern rules plus explicit aliases

**Category:** Extendability · **Impact:** medium · **Effort:** S · **Addon:** tooling:makefile

**Where:** `Makefile:175–225`

**Anchor:** `.PHONY: foundry-lookup-check foundry-lookup-sync`

**Current.**

Every module needs hand-written .PHONY plus foundry-<m>-check/-sync lines (175-225). walls is foundry-walls-test (222); pentaryn-pings has no targets; make help lists only a few modules. Forgetting a module is silent.

**Proposed.**

Delete the per-module lines and add `foundry-%-check: ; @$(OPS) module-check $*`, `foundry-%-sync: ; @$(OPS) module-sync $*`, `foundry-walls-test: foundry-walls-check`, `foundry-modules-check: ; @$(OPS) module-check --all`. Do NOT list pattern targets in .PHONY. Keep foundry-walls-wasm/-bench, foundry-adjustments-check, foundry-admin-check and foundry-sync explicit. Land python-tooling-2 first (escalate.make_checks scrapes this file).

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_make_targets.py (marker repo): for each k in cfg.MODULES run subprocess.run(['make','-n',f'foundry-{k}-check'],cwd=REPO_ROOT,capture_output=True,text=True) and assert f'module-check {k}' in stdout; same for -sync (except importer if it lacks one) asserting f'module-sync {k}'. Pin: foundry-walls-test -> 'module-check walls'; foundry-sync -> 'stage'; foundry-adjustments-check, foundry-admin-check, foundry-walls-bench still resolve to their current recipes. Write against current Makefile first (make -n only prints recipes), it must pass before and after.

**Risk.** Pattern rule shadowing an explicit target or .PHONY disabling the pattern; the make -n matrix catches both.

**Related:** python-tooling-2, python-tooling-3, python-tooling-8

### python-tooling-45 — The actions validator accepts rows that build_actors rejects

**Category:** Extendability · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/combat_actions_db.py:96, 135`; `scripts/foundry/build_actors.py:97–102, 513–517, 735–741`

**Anchor:** `_VALID_SLOT_REFRESH = {"long_rest", "short_rest", "encounter", "round", "turn"}`

**Current.**

`combat_actions_db.py` is Stage 0 of the actor pipeline: it writes `foundry/actions.jsonl`, which `build_actors.py` reads. Its comment (lines 91–95) says "NO spec may pass validate_spec that the runner cannot execute", but the runner it mirrors is retired, and the real consumer has a different grammar:
- `slots.refresh: "turn"` validates, but `REFRESH_TO_PERIOD` (`build_actors.py:97–102`) has no `"turn"`, so the build fails with `BuildError: unknown slots.refresh`.
- `_DICE_SPEC_RE` accepts `"2D6"` and `" 2 d 6 "` (case-insensitive, inner spaces), but `parse_dice` uses `re.fullmatch(r"(\d+)d(\d+)", expr.strip())` and fails with `BuildError`.

`validate_spec` was checked and returns `[]` for both. So `combat_action_upsert` returns `ok: true` for a row that later breaks `make foundry-actors`. Nothing ties the two files together: a refresh period or action type added on one side silently breaks the other. Today's 96 rows contain neither form (checked read-only).

**Proposed.**

1. Pin the drift now (tests only).
2. Pure move: lift `build_actors`' `builders` keys into a module constant `ROW_TYPES`, and export the validator's vocabulary from `combat_actions_db` (`ACTION_TYPES`, `SLOT_REFRESH`, `DICE_RE`) so both sides can be compared.
3. Narrowing the validator to the build grammar (reject `"turn"`, require lowercase `d`) changes what `combat_action_upsert` accepts. That is a decision for Joe (listed under Deferred); the pin makes the gap visible until then.

**Behaviour test recipe (write first, must pass before and after).**

New `scripts/tests/test_actions_contract.py`:
- (a) Every refresh in `combat_actions_db._VALID_SLOT_REFRESH` is either in `build_actors.REFRESH_TO_PERIOD` or in `KNOWN_UNBUILDABLE = {"turn"}`. This passes today and fails when someone adds a period on one side only.
- (b) `set(combat_actions_db._VALID_TYPES) == set(build_actors.ROW_TYPES)`.
- (c) `"2d6"`, `"1d20"` and `" 2d6 "` pass both `validate_spec` and `parse_dice`. `"2D6"` and `"2 d 6"` pass `validate_spec` but `parse_dice` raises `BuildError` (pinned KNOWN).
- (d) `repo` marker (python-tooling-34): every row of the real `foundry/actions.jsonl` passes both.

**Risk.** Tests plus one constant extraction.

**Related:** python-tooling-26 (build_actors golden test), python-tooling-46


## LLM interface

### python-tooling-28 — Expose read-only module and action-log tools via dnd-scripts

**Category:** LLM interface · **Impact:** high · **Effort:** M · **Addon:** tooling:mcp-server

**Where:** `scripts/mcp/server.py:498–613`

**Anchor:** `def discover_tools(*, repo_root: Path) -> DiscoveryResult:`

**Current.**

No MCP tool exists for Foundry module status or action logs; LLMs shell to make or grep large JSONL logs.

**Proposed.**

Add scripts/foundry/ops/mcp_tools.py (MCP_GROUPS=['foundry']) with foundry_modules (ids, repo vs installed version, gates, namespace, tests, readme) and foundry_action_log (filters, failures, top namespaces; globs eval*.jsonl and mcp-*.jsonl). Read-only; lazy imports; document in context/tools.md.

**Behaviour test recipe (write first, must pass before and after).**

Extend test_server_discovery.py: discover_tools(repo_root=REPO_ROOT) includes both tools with handlers; handler on a tmp logs dir with 3 synthetic lines (one ok:false) returns count=3 and the failure; foundry_modules on tmp MODULE_SRC_ROOT returns its id/version; the full tool list equals the pre-change golden plus exactly these two.

**Risk.** Additive; avoid heavy imports at cold start.

**Related:** python-tooling-9, python-tooling-10, python-tooling-29, python-tooling-30, python-tooling-41

### python-tooling-41 — Add --json to module-check, status and bridge-status

**Category:** LLM interface · **Impact:** medium · **Effort:** M · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/cli.py:74–79`

**Anchor:** `    mcheck = add("module-check", "Prove a module's sources before it can reach Foundry.")`

**Current.**

Gates print prose and return only an int; agents regex the text to find which gate failed.

**Proposed.**

Gates build a GateResult(ok,summary,problems,notes,counts) while still printing; --json suppresses prose and prints {module,ok,gates}; exit code unchanged.

**Behaviour test recipe (write first, must pass before and after).**

Existing test_module_checks.py capsys/exit-code assertions pass untouched. Add cli.main(['module-check','ties','--json']) on a tmp module with one broken import: exit 1 and JSON gates entry imports ok False with the problem string. status --json with _probe/_tunnel_pid patched returns keys foundry, tunnel, public.

**Risk.** Prose output drift and flush ordering at modules.py node-test gate.

**Related:** python-tooling-28, python-tooling-33, python-tooling-8

### python-tooling-48 — dnd-scripts tool contracts: two error channels, 7 tools without annotations, no pointer to the owned books

**Category:** LLM interface · **Impact:** medium · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/check_lore_links.py:35–52`; `scripts/ages_converter.py:12–74`; `scripts/fix-md-links.py:10–29`; `scripts/build_timeline_svg.py:10–21`; `scripts/build_timeline_key.py:10–28`; `scripts/dnd_roller.py:505–520`; `scripts/srd5_2.py:1579, 1634, 1650, 1703, 1986, 2018, 2171`

**Anchor:** `    "name": "check_lore_links",`

**Current.**

1. **Errors reach the LLM two ways.** lore, srd and ages handlers raise, and the server turns that into a JSON-RPC error `-32000` (`server.py:173–189`). `combat_action_upsert` catches instead and returns a successful result `{"ok": false, "error"}` (`dnd_roller.py:516–520`). Nothing says which tool does which.
2. **7 tools carry no `annotations`:** `year_to_age`, `age_to_year`, `age_convert`, `check_lore_links`, `fix_md_links`, `build_timeline_svg` and `build_timeline_key`. A host therefore cannot tell that `check_lore_links` and the ages tools are read-only, or that `fix_md_links(write=true)` and `build_timeline_*` write files. lore, dnd_roller and srd5_2 all declare `_RO_LOCAL` / `_RW_LOCAL` / `_RO_OPEN_WORLD`.
3. **No pointer to the owned books.** CLAUDE.md routes rules, spells and monsters to the owned books (`context/foundry/rules-lookup.md` → `game.pentaryn.rules`), but none of the 60+ SRD tool descriptions says so. `search_rules`, `get_spell_details` and `search_srd` present themselves as the default path.

**Proposed.**

- (a) Add `annotations` (metadata only): the read-only dict for `check_lore_links` and the three ages tools; a read-write, non-destructive dict for `build_timeline_*`; `destructiveHint: true` for `fix_md_links`, since `write=true` rewrites files.
- (b) Document the error channel per tool in `scripts/mcp/README.md`. New tools raise. `combat_action_upsert` keeps its shape, because callers parse `ok`.
- (c) Append one sentence to the descriptions of `search_rules`, `get_rule_section`, `search_spells`, `get_spell_details`, `search_srd`, `search_monsters` and `get_monster_details`: "For this campaign's 5.5e rules prefer the owned PHB/DMG/MM via game.pentaryn.rules (context/foundry/rules-lookup.md); use this tool for SRD-only or third-party content."

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_server_discovery.py`:
- `test_tools_without_annotations` over `discover_tools(repo_root=REPO_ROOT)` (`repo` marker): before the change, assert the set equals the 7 names above (pins today); after, assert it is empty.
- `test_input_schemas_unchanged`: snapshot `{name: inputSchema}` for every tool to `scripts/tests/fixtures/dnd_scripts_schemas.json` before the change and assert equality after. Descriptions and annotations may change; schemas may not.
- `test_error_channels`: `json.loads(dnd_roller.combat_action_upsert("", "x", {}))["ok"] is False`, and `lore.get_npc("")` raises `ValueError`. This pins both channels.

**Risk.** Description and metadata only; no handler changes.

**Related:** python-tooling-28, python-tooling-49, mcp-fork-21 (same idea for eval-js)


## Documentation / skills

### python-tooling-35 — README lists few tooling files and there is no build-a-module use-doc

**Category:** Documentation / skills · **Impact:** medium · **Effort:** S · **Addon:** tooling:content

**Where:** `scripts/foundry/README.md:140–146`

**Anchor:** `| File | Purpose |`

**Current.**

Files table omits ops/, update/, cloud.py, build_*.py etc.; claims a golden test that does not exist; CLAUDE.md does not route 'build or extend a module'.

**Proposed.**

Complete the table, fix the golden claim after python-tooling-26, add context/foundry/modules.md ('Read this when' line, scaffold, gates, conventions, adjustments rows, README API section) and a CLAUDE.md routing row.

**Behaviour test recipe (write first, must pass before and after).**

`make check-context` passes (links, Read-this-when rule, CLAUDE.md length). New scripts/tests/test_docs_tooling.py (marker repo): every top-level *.py in scripts/foundry plus ops/ and update/ appears by name in scripts/foundry/README.md; fails today, passes after.

**Risk.** Docs only.

**Related:** python-tooling-4, python-tooling-26, python-tooling-36

### python-tooling-36 — Generate the module index; fail check-context when stale

**Category:** Documentation / skills · **Impact:** medium · **Effort:** M · **Addon:** tooling:ops

**Where:** `scripts/foundry/ops/cli.py:73–79`

**Anchor:** `    names = sorted(k for k in cfg.MODULES if k != "importer")`

**Current.**

The module set is hand-maintained in config, Makefile, context/foundry/README.md, ops.md and pentaryn.md and they disagree.

**Proposed.**

Add `ops module-index [--check]` in ops/index.py rendering a generated table between markers into context/foundry/modules.md from module.json, ModuleSpec gates and test presence; add --check to make check-context; replace hand lists with links.

**Behaviour test recipe (write first, must pass before and after).**

New scripts/tests/test_module_index.py: tmp MODULE_SRC_ROOT with 2 modules renders both sorted; --check returns 0 right after writing and 1 after bumping a module.json version; on the real repo (marker repo) every dir in foundry/module appears including pentaryn-pings.

**Risk.** Generated block vs hand edits; markers confine it.

**Related:** python-tooling-3, python-tooling-35, python-tooling-28

### python-tooling-47 — combat_action_upsert points LLMs at a template written for the retired launcher

**Category:** Documentation / skills · **Impact:** low · **Effort:** S · **Addon:** tooling:dnd-scripts

**Where:** `scripts/dnd_roller.py:620–633`; `templates/npc-combat-runner-template.md:13, 16, 38`

**Anchor:** ``        "  spec: The action specification dict. See `templates/npc-combat-runner-template.md` "``

**Current.**

The tool description sends the LLM to `templates/npc-combat-runner-template.md` for the spec schema. That template still says "the launcher queries the DB at boot and injects a Ready actions reference" (lines 13, 16 and 38). Neither the description nor the template names the authoritative schema (`combat_actions_db.validate_spec`), or says that a row must also satisfy `build_actors.py` (python-tooling-45). The only accurate account is `context/tools.md:56–59`.

**Proposed.**

Description: "Schema: scripts/combat_actions_db.py validate_spec (authoritative); worked examples: templates/npc-combat-runner-template.md; rows feed scripts/foundry/build_actors.py (make foundry-actors), see context/tools.md." Template: drop the three launcher sentences and link `context/tools.md`. The input schema is unchanged.

**Behaviour test recipe (write first, must pass before and after).**

`scripts/tests/test_server_discovery.py`: import `dnd_roller`, find `combat_action_upsert` in `MCP_TOOLS`, and assert `"validate_spec" in description` and `input_schema` equal to the dict pinned before the edit. Add a `repo`-marked assertion that `"launcher"` does not occur in `templates/npc-combat-runner-template.md`.

**Risk.** Text only.

**Related:** python-tooling-46, python-tooling-48

