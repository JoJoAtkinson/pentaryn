---
title: "Final review 2026-10-12 — py-blueprint"
status: done
last_modified: 2026-10-12
tags: [plan, record, review, foundry]
---

**Read this when:** you want to know what the final code review of py-blueprint found, changed, and left for Joe. History, not instructions.

# Final review 2026-10-12 — py-blueprint

## Verdict

**NEEDS-JOE.** The eight kept changes are behaviour-preserving and the gate is green, but two real defects are recorded: a broken adjustments registry silently weakens the strict gate (ROB-2), and `new_module.py --force` silently re-renders a module at a different tier or namespace (PYB-E7).

## Scope

- Paths: `scripts/foundry/blueprint/**` (conformance scorer, vendor, module generator and their tests) and this record.
- Base: `140cba4f` (origin/main when the review started).
- Branch: `review/py-blueprint`, worktree `pentaryn-review-py-blueprint-wt`.
- Triage: 45 findings deduplicated to 38, giving 10 DO (8 DO-EDGE, 2 DO-REFACTOR), 28 RECORD (16 deferred by the 10-item cap, 12 that need a decision or are notes) and 7 DROP duplicates.

## Findings by lens

Line numbers are at the review base unless a kept commit moved them.

| id | file:line | severity | decision | one line |
|---|---|---|---|---|
| PYB-E2 | new_module.py (main) | low | DO-EDGE, kept | A refused `--kit` left the rendered folder on disk after exit 2 |
| PYB-E1 | new_module.py (pick_css_prefix) | low | DO-EDGE, kept | `--force` re-rendered with a new CSS prefix because the module clashed with itself |
| AC-1 | conformance.py (handler_at) | low | DO-EDGE, kept | C53/C61 did not see through `reg.guard` / `reg.guardSwallowAsync` wrappers |
| PYB-E3 | vendor.py (sync) | low | DO-EDGE, kept | A bad kit ext was refused only after `lib/` files were written |
| AC-2 | conformance.py (c55) | low | DO-EDGE, reverted | C55 accepted `timeout` in the data argument, not only the options argument |
| EXT-2 | conformance.py (role_of / C15) | low | DO-EDGE, kept | Four copies of the core-path predicate; C15 rejected a namespace import of core.mjs |
| AC-3 | conformance.py (c58) | low | DO-EDGE, kept | C58 missed duplicate `serialStore` calls with a string-literal module id |
| EXT-1 | conformance.py (c57) | low | DO-EDGE, reverted | C57 could not resolve a channel constant imported from another file |
| MAINT-1 | conformance.py (_published_literal_keys) | low | DO-REFACTOR, kept | `_published_literal_keys` duplicated `_published_literal_paths` |
| EXT-5 | tests/test_conformance.py | low | DO-REFACTOR, kept | `RESERVED_API` had no drift guard against the kit's `errors.RESERVED` |
| AC-5 | conformance.py:1737 | low | RECORD (cap) | C59 misses `for await` loops and `do { } while` bodies |
| AC-6 | conformance.py:1470 | low | RECORD (cap) | ACTIVE_GATE knows only the negated initiator gate, so C61 warns falsely |
| PYB-E4 | conformance.py:1085 | low | RECORD (cap) | C38 reports a module as clashing with itself when folder name differs from id |
| MAINT-7 | vendor.py:144 | low | RECORD (cap) | `vendor.sync` raises AttributeError on `"flags": {"pentaryn": null}` |
| EXT-3 | conformance.py:1295 | low | RECORD (cap) | C49 has its own hook matcher that misses `.once`, `ctx.reg` and named handlers |
| AC-4 | conformance.py:1782 | low | RECORD (cap) | C61 silently skips a handler imported from another module file |
| PYB-E5 | new_module.py:83 | low | RECORD (cap) | namespace_owner misses the `{ ...game.pentaryn, ns: api }` publish shape |
| perf-1 | conformance.py:1911 | medium | RECORD (cap) | A full run parses adjustments.yml N times and sibling manifests N² times |
| perf-2 | conformance.py:279 | low | RECORD (cap) | package_hits rebuilds aliases per file and runs twice per module |
| perf-3 | conformance.py:153 | low | RECORD (cap) | Module.imports, listeners, feature_files and tier are recomputed per rule |
| MAINT-4 | conformance.py:1543 | low | RECORD (cap) | "Find the body after a parameter list" is hand-written four times |
| MAINT-5 | conformance.py:1864 | low | RECORD (cap) | score() comment names only C36/C49 as warn+manual |
| MAINT-6 | conformance.py:1979 | low | RECORD (cap) | conformance.main and new_module._modules duplicate vendor.resolve_module/all_modules |
| EXT-6 | conformance.py:557 | low | RECORD (cap) | "… N more" truncation is copied into eight rules; hook/settings/buildApi regexes duplicated |
| MAINT-13 | vendor.py:198 | low | RECORD (cap) | Local `import re` inside two functions |
| MAINT-11 | README.md:9 | low | RECORD (cap) | README and vendor.py usage lines drifted from argparse flags |
| MAINT-10 | conformance.py:518 | low | RECORD | C10 keys the api cap on the file name `api.mjs`, not role `api` |
| MAINT-9 | conformance.py:1835 | low | RECORD | C62 calls a non-`ref` Document param "not the first ref" |
| ROB-2 | conformance.py:1912 | medium | RECORD, **defect** | A malformed/missing adjustments registry is swallowed; C47 goes n/a and the strict gate passes |
| PYB-E6 | conformance.py:1890 | low | RECORD | Strict-gate `match` runs on truncated details |
| ROB-4 | vendor.py:303 | low | RECORD | A corrupt kit.lock.json crashes `check/sync --all` with a traceback |
| ROB-5 | conformance.py:1916 | low | RECORD | A malformed sibling module.json crashes scoring of every module |
| PYB-E7 | new_module.py:390 | low | RECORD, **defect** | `--force` re-renders from CLI flags, silently changing tier/namespace while the lock keeps the old tier |
| AC-7 | conformance.py:1773 | low | RECORD | C60 misses a sync hot-hook handler that starts a named async function |
| AC-8 | conformance.py:1684 | low | RECORD | §5.9.1 says C58 checks module scope; it checks only key uniqueness |
| AC-9 | packages.json:1 | low | RECORD | HOT_HOOKS is an exact-name list, not the hook families §5.9.1 names |
| MAINT-12 | new_module.py:254 | low | RECORD | run_checks depends on private `ops.modules._CHECKS` |
| EXT-8 | new_module.py:61 | low | RECORD | Tier-to-files mapping is written out in five places |

## Changes kept

| commit | what | test that pins it |
|---|---|---|
| 81b9bbef | PYB-E2: on a `Refused`/`VendorError` after render, a new (non-existing) target folder is removed before the unchanged message and exit 2 | `tests/test_new_module.py::test_a_refused_kit_leaves_nothing_behind` (failed before the fix, both params) |
| 473e652b | PYB-E1: `css_owner` takes `skip`, `pick_css_prefix` takes `own`; `--force` keeps the module's own prefix | `tests/test_new_module.py::test_force_keeps_the_css_prefix` (failed before the fix) |
| 09a73a5d | AC-1: `handler_at` skips the `reg.guard` / `reg.guardSwallowAsync` wrapper at depth 0 (`GUARD_WRAP`) | `tests/test_conformance.py::test_c53_async_listener_on_a_vetoable_hook`, `test_c61_world_wide_document_reaction_runs_on_one_client` (new cases failed before) |
| d758f910 | PYB-E3: `vendor.sync` validates every kit file ext before creating `lib/` | `tests/test_vendor.py::test_bad_ext_refuses_before_writing` (failed before) |
| 443b14c1 | EXT-2: one `_is_core_path` predicate used by role_of, core_files and C15 | `tests/test_conformance.py::test_c15_namespace_import_of_core_mjs_is_a_core_barrel` (failed before) |
| 69801dda | AC-3: the C58 call regex also matches a string-literal module id | `tests/test_conformance.py::test_c58_one_serial_store_per_key` (two new rows, failed before) |
| 8a36f0ef | MAINT-1: `_published_literal_keys` is a filter over `_published_literal_paths` | `tests/test_conformance.py::test_published_literal_keys_are_the_top_level_paths` (passes on old and new) |
| c4c2eb26 | EXT-5: test-only drift guard between `RESERVED_API` and `foundry/lib/errors.mjs` RESERVED | `tests/test_conformance.py::test_reserved_api_mirrors_the_kit` |

Every kept code commit was checked with `conformance.py --root foundry/module --json` byte-identical before and after.

## Changes reverted by verification

| commit | reverted by | verifier's reason |
|---|---|---|
| 12557b01 | e3716c73 | AC-2: `_call_args` splits arguments with `_expr_end`, which stops at the `;` the kit lexer (`jsscan._template`) injects after every `${…}`. A template argument with two or more interpolations shifts later arguments, so compliant calls such as `gm.query(\`${A}.${B}\`, {}, { timeout: 8000 })` go from pass to a false fail-class C55 failure. No current module has such a call, so the live JSON did not show it. |
| 0ab13f60 | eb1dde98 | EXT-1: the cross-file fallback resolves the channel constant by bare name, first declaration in file order wins, and never follows the real import. Probes (name clash in an earlier-sorting file, aliased import, shadowing parameter, destructuring) turn n/a into a false fail-class C57 failure on correct code. |

## Recorded for Joe

- **defect** `scripts/foundry/blueprint/conformance.py:1912` (ROB-2): a malformed or missing adjustments registry is swallowed; C47 becomes n/a, C32's registry checks and the alias merge are skipped, and the strict gate passes modules it should fail. Fail C47 (and C32's registry part) with the RegistryError text, or at least print it to stderr from `main()`.
- **defect** `scripts/foundry/blueprint/new_module.py:390` (PYB-E7): `--force` re-renders from CLI flags, so a small-tier or custom-namespace module re-rendered without its original flags silently becomes full/short-namespace while `lib/kit.lock.json` stays small. Default `--tier/--namespace/--no-dnd5e` from `flags.pentaryn` on a re-render, or document the requirement in playbook §3.1 and the README. Also pre-validate the vendoring plan before `render()`, so a `--force` refusal does not partially overwrite an existing folder (the residue of PYB-E2).
- `scripts/foundry/blueprint/conformance.py:1890` (PYB-E6): strict-gate `match` runs on truncated details; a synthetic "… N more" line blocks an exception whose real findings all match, and C14/C19/C62 hide findings past the cap. Move truncation to display. Latent today.
- `scripts/foundry/blueprint/vendor.py:303` (ROB-4): one corrupt `lib/kit.lock.json` crashes `vendor.py check|sync --all` with a JSONDecodeError traceback; report it per module and count it as failing.
- `scripts/foundry/blueprint/conformance.py:1916` (ROB-5): a malformed sibling module.json crashes scoring of every module (same in `new_module.namespace_owner/css_owner`); skip it or have C38 name it.
- `scripts/foundry/blueprint/conformance.py:1684` (AC-8): playbook §5.9.1 says "exactly one serialStore per key, at module scope (C58)" but C58 never checks scope; enforce it while allowing the `x ??= serialStore(` memo shape, or soften the playbook.
- `scripts/foundry/blueprint/packages.json:1` (AC-9): HOT_HOOKS is exact-name, so C49/C60 skip `refreshTile`, `drawTokenLayer` (pentaryn-combat listens on it) and similar; add rows or match the §5.9.1 families by prefix.
- `scripts/foundry/blueprint/conformance.py:1773` (AC-7): C60 does not warn on a sync hot-hook handler that starts a named async function per call (`void paint(t)`).
- `scripts/foundry/blueprint/conformance.py:518` (MAINT-10): C10 keys the api cap on file name `api.mjs`; key it on `role == "api"` so `<short>-api.mjs` gets the 300 cap.
- `scripts/foundry/blueprint/conformance.py:1835` (MAINT-9): C62's "not the first ref" wording is misleading for a Document param not named `ref`; reword.
- `scripts/foundry/blueprint/conformance.py` c55 (AC-2, reverted): if the edge case is still wanted, `_call_args` must ignore lexer-injected `;` first, with a multi-interpolation template test.
- `scripts/foundry/blueprint/conformance.py` c57 (EXT-1, reverted): if wanted, resolve the constant through `Module.imports()` / `jsscan.imports_of`, not by bare name.
- `scripts/foundry/blueprint/new_module.py:254` (MAINT-12): `run_checks` depends on private `ops.modules._CHECKS`; a public `ops.modules.run_gate` would remove it (ops is out of scope).
- `scripts/foundry/blueprint/new_module.py:61` (EXT-8): the tier-to-files mapping lives in five places; add a shared table or a pin test of FULL_ONLY against C40.
- `scripts/foundry/ops/index.py:39` (out of scope, from EXT-5): a third copy of the reserved API names, `_RESERVED`, has no drift guard.
- Deferred by the cap, each a ready DO item: AC-5 `conformance.py:1737` (C59 `for await` / `do…while`), AC-6 `conformance.py:1470` (positive and `game.user?.id` gates), PYB-E4 `conformance.py:1085` (filter `mid not in (m.id, m.dir.name)`), MAINT-7 `vendor.py:144` (`or {}` for null flags.pentaryn), EXT-3 `conformance.py:1295` (C49 over `listeners(m)`), AC-4 `conformance.py:1782` (C61 imported handlers), PYB-E5 `new_module.py:83` (dotted spread operand), perf-1 `conformance.py:1911` (load registry and manifests once), perf-2 `conformance.py:279` (hoist aliases), perf-3 `conformance.py:153` (per-Module cache), MAINT-4 `conformance.py:1543` (`_block_after` helper), MAINT-5 `conformance.py:1864` (comment), MAINT-6 `conformance.py:1979` (use vendor.resolve_module; pin stderr first), EXT-6 `conformance.py:557` (`_capped` helper; coordinate with PYB-E6), MAINT-13 `vendor.py:198` (top-level `import re`), MAINT-11 `README.md:9` (usage flags).

## Verification

- 81b9bbef: keep
- 473e652b: keep
- 09a73a5d: keep
- d758f910: keep
- 12557b01: revert (e3716c73)
- 443b14c1: keep
- 69801dda: keep
- 0ab13f60: revert (eb1dde98)
- 8a36f0ef: keep
- c4c2eb26: keep

## Gates

- `make test && make foundry-modules-check` (with `PY=` the main checkout's `.venv/bin/python`, the worktree has no venv): blueprint tests 204 pass, 0 fail; all 20 modules pass their gates (pentaryn-walls 98.0% with accepted exception C07).
- `git diff --quiet origin/main -- '**/golden/**'`: exit 0. Goldens byte-identical: yes.
- Untouchables clean; `make check-context` passes with this record in place.
