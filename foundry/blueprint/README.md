# foundry/blueprint — the module template

**Read this when:** you are changing what `new_module.py` generates. **Not this file:** building or
migrating a module → `context/foundry/addon-blueprint.md` · the design → `context/plans/addon-blueprint-2026-10.md`.

`template/pentaryn-__SHORT__/` is a complete module with placeholders. `scripts/foundry/blueprint/new_module.py`
renders it — never copy it by hand. It is not under `foundry/module/`, so nothing here is ever synced.

## Placeholders (literal replacement, longest first)

| Token | Becomes | Example |
|---|---|---|
| `__SHORT__` | short name (also in file names) | `demo` |
| `__SHORT_UPPER__` | upper-case short (i18n root `PENTARYN___SHORT_UPPER__`) | `DEMO` |
| `__Title__` | `--title` | `Pentaryn Demo` |
| `__MODULE__` | module id | `pentaryn-demo` |
| `__NS__` | namespace (`--namespace`, default short) | `demo` |
| `__CSS__` | CSS prefix (`--css-prefix`, else the first free `p<short…>-`) | `pd-` |
| `__DESC__` | `--description` (JSON-escaped inside `.json`) | |
| `__VERIFIED__` | installed Foundry `14.369.0` → `14.369`; `14` when unknown | `14.369` |
| `__TODAY__`, `__YYYY_MM__` | generation date | `2026-10-10`, `2026-10` |
| `__TIER__` | `small` or `full` | `full` |

## Line blocks

A line that is only `// @if <flag>`, `/* @if <flag> */` or `<!-- @if <flag> -->` opens a block, and the
matching `@endif` line closes it. Flags: `full`, `small`, `dnd5e`, `nodnd5e`. Marker lines are always
removed. JSON cannot hold comments, so `module.json` is edited structurally instead: small drops
`languages`, `--no-dnd5e` empties `relationships.systems`.

Files only the full tier gets: `api-manifest.mjs`, `api.mjs`, `settings.mjs`, `lang/en.json`,
`test/{hooks,api,i18n}.test.mjs`.

## What a generated module contains

| File | Role |
|---|---|
| `module.json` | manifest with `flags.pentaryn` (tier, namespace, flagScope, cssPrefix, generation, afterSync) |
| `<short>.mjs` | entry: wiring, features in load order, uninstall; lifecycle as named `onInit/onSetup/onReady`, run at once when `game.ready` (hot patch — re-runs the wiring only; edited feature/core/api/settings code needs a reload) else via `Hooks.once`. The small tier's `describe()` has the full `describe()` key set (use-doc §5.1a) with empty lists |
| `<short>-core.mjs` | pure constants, `HOOKS`, the example rules (`noteText`, `hpOf` with dnd5e) |
| `settings.mjs` | `SETTINGS` (one `enabled` row), `KEYBINDINGS` (one example `toggleEnabled` row: GM-only, unbound, flips `enabled`) |
| `api-manifest.mjs` | rows `inspect`, `selftest`, `note` (pure data) |
| `api.mjs` | implementations; `buildApiFor(ctx)` |
| `example-feature.mjs` | `install(reg, ctx)` / `uninstall()`; contributes the `recent` row |
| `lang/en.json`, `styles/<short>.css`, `README.md`, `CHANGELOG.md` | docs and assets |
| `lib/` + `lib/kit.lock.json`, `test/kit/` | vendored by `vendor.py` (the template's lock is a placeholder) |
| `test/run.mjs`, `test/*.test.mjs`, `test/fixtures/actors.mjs`, `test/graph-allow.json` | the suite; goldens are written on generation |

`docs/use-doc.md` and `docs/plan.md` are what `--docs` writes to `context/foundry/<short>.md` and
`context/plans/<short>-<yyyy-mm>.md`.

## Changing the template

Edit, then prove both tiers still generate green:

```
./.venv/bin/python -m pytest -q scripts/foundry/blueprint/tests
```

`test_new_module.py` generates small and full into a temp folder and runs every gate plus the
conformance scorer; a template change that breaks a gate fails there.
