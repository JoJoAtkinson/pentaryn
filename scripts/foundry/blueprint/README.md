# scripts/foundry/blueprint

**Read this when:** running or changing the generator, the vendoring gate or the conformance
scorer. **Not this file:** the playbook → `context/foundry/addon-blueprint.md`.

| Script | What it does | Writes |
|---|---|---|
| `new_module.py <short> --title …` | renders `foundry/blueprint/template/`, vendors the kit, writes goldens, runs the suite; `--check` adds the ops gates, `vendor check` and conformance (scored as not installed: C39 ModuleSpec and C46 route are printed as pending follow-ups, never failures). Flags: `--tier`, `--kit a,b`, `--namespace`, `--css-prefix`, `--no-dnd5e`, `--description`, `--out`, `--install`, `--docs`, `--check`, `--force` (re-render template files; keeps the lock and every golden), `--no-run` | the new module folder (refuses `foundry/module/` without `--install`); with `--docs`, two context stubs |
| `vendor.py sync\|check <module…\|--all> [--tier] [--kit a,b]` | copies `foundry/lib` into a module's `lib/` and `test/kit/`; proves identity by sha256. `--all` = modules that already have a lock: `sync --all` skips the rest (never writes them), `check --all` fails them (Stage 5: every module vendors the kit). The lock records `tier` (from `--tier`, kept on a re-sync), which the scorer uses until `module.json` has `flags.pentaryn.tier` | `lib/`, `test/kit/`, `lib/kit.lock.json` — never `module.json` |
| `conformance.py [--snapshot DIR] [--module m] [--json\|--markdown]` | scores modules on rules C01–C62; prints WAIT modules and each module's `accepted:` / `STALE exception:` rules; exit 1 exactly when the strict gate fails (a failing fail-class rule with no `exceptions.json` row, or a stale row), 2 for an unknown module (playbook §6). A broken or missing `foundry/adjustments.yml` (or `DIR/adjustments.yml` under `--snapshot`) fails C47 and C32 with the loader's error, printed once to stderr. Tier = `flags.pentaryn.tier`, else the lock's `tier`, else full | nothing |
| `packages.json` | third-party package names and code tokens the scripts match (aliases ⊇ `foundry/adjustments.yml` `aliases`; the registry's are merged in at run time too) | — |
| `wait.json` | modules the fix phase must not edit yet, with the reason; edit it when a workflow starts or stops on a module (it exempts nothing from the gates) | — |
| `exceptions.json` | the strict conformance gate's only exceptions: module id → rule id → `reason`, `decision`, `until`, `match` (regexes for the findings the decision covers; a failing finding none matches blocks). A stale row (its rule no longer fails) fails the gate; delete it in the commit that retires it. A pytest checks every row names a real module and a fail-class rule, and every `match` pattern a live finding | — |

Package names live in `packages.json`, not in the `.py` files: `scripts/foundry/**/*.py` is in the
Saturday updater's exposure grep, and a literal here would make the scanner look exposed.

Tests: `./.venv/bin/python -m pytest -q scripts/foundry/blueprint/tests` (also in `pyproject`
`testpaths`, so a bare `pytest` / `make test` runs them). This folder is outside the updater's
exposure grep (`EXPOSURE_SKIP_PARTS` in `scripts/foundry/update/adjustments.py`).
