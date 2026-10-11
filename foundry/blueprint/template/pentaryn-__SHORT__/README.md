# __Title__ (`pentaryn-__SHORT__`)

**Read this when:** you are changing or calling `pentaryn-__SHORT__`. **Not this file:** use-doc → `context/foundry/__SHORT__.md` · design → `context/plans/__SHORT__-__YYYY_MM__.md` · how every addon is built → `context/foundry/addon-blueprint.md`

__DESC__

## What the player sees

Nothing yet — the example feature tracks GM notes on actors and announces changes as a hook.
Replace this with what a player sees at the table.

## Settings

<!-- @if full -->
| Key | Scope | Default | What it does |
|---|---|---|---|
| `enabled` | world | `true` | Master switch for the example feature. |
<!-- @endif -->
<!-- @if small -->
n/a — a small module registers no settings.
<!-- @endif -->

## API — game.pentaryn.__NS__

Canonical: `game.modules.get("pentaryn-__SHORT__").api`; `game.pentaryn.__NS__` is the same object.
Ask it what it offers: `game.pentaryn.__NS__.describe()` (offline: `test/golden/describe.json`).

<!-- @if full -->
| Method | GM | Writes | Returns |
|---|---|---|---|
| `inspect(ref, opts)` | — | — | `{ actor, note, lastSeen }` plain JSON; throws `NOT_FOUND` / `AMBIGUOUS` |
| `note(ref, { text, dryRun })` | yes | `flags.pentaryn-__SHORT__.note` | `{ ok, … }` / `{ ok: false, code, reason }` |
| `recent()` | — | — | actors whose note changed this session |
| `selftest()` | — | — | `{ ok, checks }` |

`ref` is an Actor, Token, UUID, 16-character id or exact name — never a substring.
Queries: `pentaryn-__SHORT__.inspect` (GM only).
<!-- @endif -->
<!-- @if small -->
Kit members only: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.
<!-- @endif -->

## Data written

<!-- @if full -->
`flags.pentaryn-__SHORT__.note` on actors (a string; deleted when cleared). Nothing in world settings.
<!-- @endif -->
<!-- @if small -->
n/a — writes nothing.
<!-- @endif -->

## Flags other modules read

n/a — no other module reads this module's flags yet. When one does, list it here and in
`api-manifest.mjs` `flags.reads/writes` on both sides, with a contract test.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-__SHORT__.noteChanged` | `(actor, note)` | an actor's note flag changed (note is null when cleared) |
| `pentaryn-__SHORT__.ready` | `(api)` | the API is published |

Listens to: `updateActor`, `deleteActor` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

n/a — patches nothing. A patch goes through `wrapMethod` (vendor `patch`) with an
`adjustments` row id in `foundry/adjustments.yml`.

## Two sessions / who writes

Every client sees `updateActor`; each announces the change locally (no writes). The `note`
write runs on the calling GM client only. GM-only startup work would use `isActiveGM()`.

## Extending

1. A pure rule → `__SHORT__-core.mjs` with a fixture in `test/core.test.mjs`.
2. A feature → copy `example-feature.mjs`, add it to `FEATURES` in `__SHORT__.mjs`.
<!-- @if full -->
3. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs` (or return `{ rows, impl }`
   from a feature's `install`), then `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review.
4. A setting → a `SETTINGS` row with literal `name`/`hint` keys + the keys in `lang/en.json`.
<!-- @endif -->

## Pitfalls

- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.

## Files

| File | Role |
|---|---|
| `__SHORT__.mjs` | entry (esmodules[0]): wiring, load order |
| `__SHORT__-core.mjs` | pure constants, HOOKS, rules |
<!-- @if full -->
| `settings.mjs` | SETTINGS table |
| `api-manifest.mjs` | API rows (pure data) |
| `api.mjs` | API implementations, inspect, selftest |
<!-- @endif -->
| `example-feature.mjs` | the example feature |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures, vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check __SHORT__
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module __SHORT__
```

## Sync

First install: restart Foundry (module.json is read at startup), enable '__Title__', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.__NS__.describe().version`.
