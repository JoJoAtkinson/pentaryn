---
title: Retired addons — and how to bring one back
status: active
last_modified: 2026-10-13
tags: [foundry, module, retired, archive, pentaryn-walls]
---

# Retired addons

**Read this when:** you want an addon Joe retired back — or you are wondering where an in-house
module went. Each section says what the addon did, why Joe retired it, where an exact copy lives,
and how to restore it. **Not this file:** a module that is still in the repo → its README via the
Module APIs table in [`README.md`](README.md) · how an addon was designed → [`../plans/`](../plans/).

A retired addon is removed from `main` whole — source, tests, make targets, tooling, docs — after
an exact copy is pushed to an `archive/<module-id>` branch. Nothing installs it and nothing checks
it. (A module that should stay in the repo but never be synced uses `ModuleSpec.retired` in
`scripts/foundry/ops/config.py` instead; none does today.)

## Walls — `pentaryn-walls` (Wall Autocomplete)

**What it did.** Deterministic completion of hand-drawn walls. The GM roughed in the windows,
doors and short hint stubs of a building; the engine inferred the rest (extending, trimming and
welding walls until they met) or refused and said why, with a GM-only chat summary and a ping on
every refused endpoint. Each run was stamped so `undo` removed exactly that run. It shipped a
compiled engine (Rust → WASM, `wall-engine.wasm`, about 12× faster than the JS one and
geometry-identical on the same fixture corpus). API: `game.pentaryn.walls.preview()` (report,
writes nothing), `game.pentaryn.walls.run()`, `game.pentaryn.walls.undo()`, plus `makeMacro`,
`analyze`, `describe`; keys Alt+W / Alt+Z / Alt+Shift+W. Version 0.2.0, full blueprint tier.
Never live-tested after its wave-2 migration; its flags still lived under the old
`wall-autocomplete` scope (conformance C07 was an accepted exception).

**Why retired.** Joe walls scenes with prefabs now (2026-10-13, defect wave 3). It was first
retired in place (never synced, disabled, the installed `Data/modules/pentaryn-walls/` folder
moved to the macOS Trash — record:
[`../plans/defect-wave-3-2026-10-13/walls-retire.md`](../plans/defect-wave-3-2026-10-13/walls-retire.md)),
then removed from the repo the same day.

**Where it is.**

- Archive branch: **`archive/pentaryn-walls`** — `main` as it was at `f9f155bd`, holding every
  walls file (module, node tests and fixtures, the Rust/WASM sources, `context/foundry/walls.md`,
  the live golden, the make targets and ops commands).
- Removal commit: **`83543ac4ba2f75b259ed22e736bd4b23d4c482cc`** — "chore(walls): remove retired
  walls addon — archived on archive/pentaryn-walls".
- Design history (still on `main`): [`../plans/foundry-wall-autocomplete.md`](../plans/foundry-wall-autocomplete.md).

**How to restore it.**

The archive is a remote branch: a normal clone has only `origin/archive/pentaryn-walls`, no local
`archive/pentaryn-walls`, so name it with the `origin/` prefix (run `git fetch origin` first if
`git rev-parse origin/archive/pentaryn-walls` fails).

1. Everything back, wiring included (module, tests, `ModuleSpec` row, make targets
   `foundry-walls-test`/`-wasm`/`-bench`, ops commands `walls-wasm`/`walls-bench`, the C07
   exception, the live golden, `walls.md` and its doc links):

   ```sh
   git revert 83543ac4ba2f75b259ed22e736bd4b23d4c482cc
   ```

   On the branch that removed it this applies with no conflicts, and `make test`,
   `make foundry-module-index` (index current) and `make check-context` pass straight after it
   (tried 2026-10-13). The links to this page sit on lines the removal did not touch, so they
   survive the revert. On a later `main`, a revert conflicts only where someone has since edited
   a line the removal changed; keep the archive's walls lines there. The tree then matches
   `origin/archive/pentaryn-walls` except for this page, its test
   (`scripts/tests/test_retired_doc.py`) and the three links to it. Once walls is back, its
   section here is history: keep it, or delete the section, the test and the links together.
2. Single files only:
   `git checkout origin/archive/pentaryn-walls -- <path>`, e.g.
   `git checkout origin/archive/pentaryn-walls -- foundry/module/pentaryn-walls context/foundry/walls.md`.
   The module alone is not enough to install it: it also needs its `ModuleSpec` row in
   `scripts/foundry/ops/config.py` (and its C07 row in `scripts/foundry/blueprint/exceptions.json`
   for the conformance gate).
3. The restored code is still **retired in place**: its `ModuleSpec` carries
   `retired="2026-10-13 — Joe uses prefabs"` and the Makefile `RETIRED_MODULES := walls`. To run
   it, drop both (a test keeps them equal: leave `RETIRED_MODULES :=` empty), re-vendor the kit if
   it moved on (`make foundry-lib-vendor`), then `make foundry-walls-check`. Seven tests pin walls
   as retired and fail once it is not; delete them (they test nothing else):
   - `scripts/tests/test_make_targets.py::test_help_offers_no_sync_for_a_retired_module_walls_retire`
   - `scripts/tests/test_module_install.py::test_walls_is_retired_and_not_syncable_walls_retire`
   - `scripts/tests/test_module_install.py::test_module_sync_does_not_offer_walls_walls_retire`
   - `scripts/tests/test_update_inventory.py::test_sync_hint`: its `pentaryn-walls` row only
   - `scripts/tests/test_update_inventory.py::test_a_retired_module_is_never_drift_walls_retire`
   - `scripts/tests/test_update_inventory.py::test_retired_reads_the_ops_registry_walls_retire`
   - `scripts/tests/test_update_inventory.py::test_risk_says_a_retired_module_is_never_synced_walls_retire`

   `make test` is then green (tried 2026-10-13). The generic retired mechanism keeps
   its stand-in tests (`test_a_retired_spec_is_never_syncable_walls_retire`,
   `test_sync_refuses_a_retired_spec_and_says_so_walls_retire`). With nothing retired, `make help`
   ends its `<m>:` line with an empty "retired, -check only:" note; the removal commit's Makefile
   prints it only when `RETIRED_MODULES` is set, if you want that tidy too.
4. **Sync and enable it in the world.** `make foundry-walls-sync` copies it into
   `Data/modules/pentaryn-walls/`; then enable *Pentaryn Wall Autocomplete* in Manage Modules for
   the world and reload. `game.pentaryn.walls` answers once it is on. Rebuilding the `.wasm`
   (`make foundry-walls-wasm`) needs Rust with the `wasm32-unknown-unknown` target; the committed
   `wall-engine.wasm` works without it.
