# Pentaryn Feedback (`pentaryn-feedback`)

**Read this when:** you are changing or calling `pentaryn-feedback`. **Not this file:** use-doc → `context/foundry/feedback.md` · design → `context/plans/feedback-2026-10.md` · how every addon is built → `context/foundry/addon-blueprint.md`

A bug button in the left toolbar: players file a bug, defect or feature request with their recent actions and the live game context attached; the GM stores it as a file the repo's MCP tools read one at a time.

## What the player sees

Nothing yet — the example feature tracks GM notes on actors and announces changes as a hook.
Replace this with what a player sees at the table.

## Settings

| Key | Scope | Default | What it does |
|---|---|---|---|
| `enabled` | world | `true` | Master switch for the example feature. |

## API — game.pentaryn.feedback

Canonical: `game.modules.get("pentaryn-feedback").api`; `game.pentaryn.feedback` is the same object.
Ask it what it offers: `game.pentaryn.feedback.describe()` (offline: `test/golden/describe.json`).

| Method | GM | Writes | Returns |
|---|---|---|---|
| `inspect(ref, opts)` | — | — | `{ actor, note, lastSeen }` plain JSON; throws `NOT_FOUND` / `AMBIGUOUS` |
| `note(ref, { text, dryRun })` | yes | `flags.pentaryn-feedback.note` | `{ ok, … }` / `{ ok: false, code, reason }` |
| `recent()` | — | — | actors whose note changed this session |
| `selftest()` | — | — | `{ ok, checks }` |

`ref` is an Actor, Token, UUID, 16-character id or exact name — never a substring.
Queries: `pentaryn-feedback.inspect` (GM only).

## Data written

`flags.pentaryn-feedback.note` on actors (a string; deleted when cleared). Nothing in world settings.

## Flags other modules read

n/a — no other module reads this module's flags yet. When one does, list it here and in
`api-manifest.mjs` `flags.reads/writes` on both sides, with a contract test.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-feedback.noteChanged` | `(actor, note)` | an actor's note flag changed (note is null when cleared) |
| `pentaryn-feedback.ready` | `(api)` | the API is published |

Listens to: `updateActor`, `deleteActor` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

n/a — patches nothing. A patch goes through `wrapMethod` (vendor `patch`) with an
`adjustments` row id in `foundry/adjustments.yml`.

## Two sessions / who writes

Every client sees `updateActor`; each announces the change locally (no writes). The `note`
write runs on the calling GM client only. GM-only startup work would use `isActiveGM()`.

## Extending

1. A pure rule → `feedback-core.mjs` with a fixture in `test/core.test.mjs`.
2. A feature → copy `example-feature.mjs`, add it to `FEATURES` in `feedback.mjs`.
3. An API method → a row in `api-manifest.mjs` + an impl in `api.mjs` (or return `{ rows, impl }`
   from a feature's `install`), then `GOLDEN_UPDATE=1 node --test test/api.test.mjs` and review.
4. A setting → a `SETTINGS` row with literal `name`/`hint` keys + the keys in `lang/en.json`.

## Pitfalls

- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.

## Files

| File | Role |
|---|---|
| `feedback.mjs` | entry (esmodules[0]): wiring, load order |
| `feedback-core.mjs` | pure constants, HOOKS, rules |
| `settings.mjs` | SETTINGS table |
| `api-manifest.mjs` | API rows (pure data) |
| `api.mjs` | API implementations, inspect, selftest |
| `example-feature.mjs` | the example feature |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures, vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check feedback
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module feedback
```

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Feedback', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.feedback.describe().version`.
