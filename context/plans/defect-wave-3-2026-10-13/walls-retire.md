# Defect wave 3 (2026-10-13) — walls-retire

**Read this when:** you want the history of how `pentaryn-walls` was retired in defect wave 3:
what stopped shipping it, the commits and tests, and what is left for the live step. History
only — to operate (or un-retire) walls, read [`../../foundry/walls.md`](../../foundry/walls.md).

Branch `wave3/walls-retire-2026-10-13`, from `origin/main` `e392ba56`. Approved by Joe on
2026-10-13 ("retire his walls addon"; he walls scenes with prefabs now). Every change is a
declared behaviour change (`[declared]` in each commit). Code only: nothing touched Foundry.
The source stays in `foundry/module/pentaryn-walls/` and keeps its gate.

Gate: `make test` (2215 passed, 3 skipped, 4 xfailed) · `make foundry-modules-check` (all 20
modules pass, walls included, C07 still its accepted exception) · `make check-context` (OK).

## What could ship walls, and what changed

Only one path ever copies a repo module into `Data/modules`: `module-sync` (`make
foundry-<m>-sync`). The other lists the task named were checked:

- **Bundles / backups** — not a list. `scripts/foundry/bundles.py` bundles whatever folder is in
  `Data/modules`; nothing in the repo names walls. No change (see *Left for the live step*).
- **Updater** — never installs a `pentaryn-*` module, but its drift report told the reader to
  `run make foundry-walls-sync`. Fixed (W2).
- **Live goldens** — no runner list; each wave's plan names its goldens, and `walls.js` already
  returns `skipped` when the module is inactive. Header marked retired (W4).
- **`make foundry-modules-check`** — checks, never ships. Walls stays in it so its source keeps
  matching the kit; `make foundry-lib-vendor` keeps re-vendoring it.
- **Updater escalation** (`escalate.make_checks`) — already excluded walls. No change.

## Fixes

| item | defect | what changed | commits | test |
|---|---|---|---|---|
| W1 | `make foundry-walls-sync` / `module-sync walls` would still install the retired module | `ModuleSpec` gains `retired="<date> — <why>"`; a retired spec is never syncable. Walls is `retired="2026-10-13 — Joe uses prefabs"`: the CLI no longer offers `module-sync walls`, and a direct `modules.sync("walls")` refuses with `✗ walls is retired (…) — module-sync never installs it`. `module-check walls` still runs every gate | 910f5a35 | `scripts/tests/test_module_install.py` (`*_walls_retire`) |
| W2 | The updater's drift report and risk reasons told the reader to re-sync walls | `inventory.retired(id)` reads the ops registry. A retired module is never a drift row, its sync hint is `no sync — retired …`, and its risk reason is `built in this repo, retired … — never synced, not upstream` | 69a2e9d2 | `scripts/tests/test_update_inventory.py` (`*_walls_retire`, `test_sync_hint`) |
| W3 | `make help` listed walls among the `<m>` names for `foundry-<m>-sync`; the Module APIs index showed walls as a live module | Makefile `RETIRED_MODULES := walls` (a test keeps it equal to the registry) is filtered out of help's `<m>` list and named as "retired, -check only". The index row's Blueprint cell reads `full tier · **retired 2026-10-13 — Joe uses prefabs**` (regenerated with `make foundry-module-index`) | 20279156 | `scripts/tests/test_make_targets.py`, `scripts/tests/test_module_index.py` (`*_walls_retire`) |
| W4 | The docs still read as a live, enable-on-a-scratch-world module | `context/foundry/walls.md` and the module README: `status: retired`, "Read this when" opens on retired 2026-10-13 (Joe uses prefabs) and how to un-retire. `context/pentaryn.md` module list and *Left out* row, the `context/foundry/README.md` router row and file list, and the `walls.js` golden header say retired | 653d1267 | `scripts/tests/test_walls_retired_docs.py` |

Every new test failed on the parent `e392ba56` and passes on the branch.

## Restart / reload

None. No `module.json` changed (blueprint §10); walls is not synced, and the changes are Python
tooling, the Makefile and docs.

## Live check after deploy

Code-only: covered by the tests above. Nothing to deploy to Foundry. The live step is Joe's
(or a later wave's), not this group's:

- Disable `pentaryn-walls` in Manage Modules if it is still listed there (it was already `false`
  in `core.moduleConfiguration` in wave 2).

## Left for the live step

- If `Data/modules/pentaryn-walls/` is still on disk, every backup bundles it (bundles mirror
  `Data/modules`) and a restore puts the folder back — disabled, because enablement lives in the
  world's settings. Deleting that folder after the live disable is what drops it from the next
  snapshot. That is a Foundry-side change and was left alone here.
