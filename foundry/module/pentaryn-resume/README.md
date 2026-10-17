# Pentaryn Resume (`pentaryn-resume`)

**Read this when:** you are changing or calling `pentaryn-resume`. **Not this file:** use-doc → `context/foundry/resume.md` · design → `context/plans/resume-2026-10.md` · how every addon is built → `context/foundry/addon-blueprint.md`

Each player logs back in on the map they last had open, at the same spot and zoom, as long as the GM has not moved the table to a new active scene since. Survives the 03:00 nightly restart. Exposes game.pentaryn.resume.

## What the player sees

Logging in puts them back on the map, level, spot and zoom they last had, instead of the active
scene. This holds unless the GM has made a different scene active since then; in that case they
land on the new one, as in stock Foundry. With pentaryn-pins' pinning on, resume decides where a
**pinned** player lands (pins 0.2.0 has no login path of its own): their character's token's scene
and level, the token controlled when they own it, whatever was saved and whatever the active scene
did; the saved pan and zoom are restored only when the saved view was of that scene. Foundry
draws the active scene first, so a pinned player whose token is elsewhere sees one extra draw. A GM
resumes as stock even if it carries a pin flag. There is no UI. Table-side guide: `context/foundry/resume.md`.

## Settings

n/a — a small module registers no settings.

## API — game.pentaryn.resume

Canonical: `game.modules.get("pentaryn-resume").api`; `game.pentaryn.resume` is the same object.
Ask it what it offers: `game.pentaryn.resume.describe()` (offline: `test/golden/describe.json`).

Kit members only: `describe()`, `version`, `contract`, `settings()`, `trace()`, `uninstall()`.

## Data written

`flags.pentaryn-resume.view` on the client's **own** User: `{ scene, level, active, x, y, scale }`
(`active` = the world's active scene at save time). Written 3 s (`SAVE_DELAY`) after a pan
settles, and right after each scene draw. Never written when nothing changed (`sameView`) and never
before the login restore has run.

## Flags other modules read

No other module reads this module's flag. This module reads one foreign API:

| API | Owner | Read for |
|---|---|---|
| `api:pentaryn-pins.pinnedToken` (`game.user`) → `{ scene: id string, level, token: uuid, … } \| null` | pentaryn-pins | where a pinned player lands at login (`pinned`: scene, level, and the token to control); declared in `describe().flags.reads`. Both sides pin the shape: pins' describe golden, and resume's glue test (including a non-string `scene`, which is logged and read as no pin) |

pins publishes at its own `ready`, registered when its entry evaluates — before this module's
`ready: resume` listener (registered in `setup`) — so the call sees the API at login.

## Events

| Hook | Args | When |
|---|---|---|
| `pentaryn-resume.resumed` | `(view)` | the login restore moved this client: `{ scene, level, position }` |
| `pentaryn-resume.ready` | `(api)` | the API is published |

Listens to: `canvasPan`, `canvasReady`, `updateScene` (active changes), `ready` (pinned in `test/golden/hooks.json`).

## Patches and adjustments

n/a — patches nothing. A patch goes through `wrapMethod` (vendor `patch`) with an
`adjustments` row id in `foundry/adjustments.yml`.

## Two sessions / who writes

Each client writes only its own User and restores only itself, so no election is needed.
Two tabs open as the same user both save. The last to settle wins, and that is the view the next
login resumes.

## Extending

1. A pure rule → `resume-core.mjs` with a fixture in `test/core.test.mjs`.
2. A feature → a new `<feature>.mjs` with `install(reg, ctx)` / `uninstall()`, added to `FEATURES` in `resume.mjs`.

## Pitfalls

- `canvasReady` for the first draw fires **before** `ready`: saving stays off until `resume()` has run, or that draw would overwrite the view about to be restored.
- A pinned player with no active scene gets a blank draw: `canvas.initialized` is true but `canvas.ready` stays false, so the pinned branch gates on `initialized` (the unpinned one keeps `ready`).

- `lib/` and `test/kit/` are vendored copies: edit `foundry/lib/`, then `vendor.py sync`.
- `module.json` is read at Foundry startup: any change to it needs a restart, not a reload.
- Never run `GOLDEN_UPDATE=1 node test/run.mjs` mid-refactor — a refactor must not move a golden.

## Files

| File | Role |
|---|---|
| `resume.mjs` | entry (esmodules[0]): wiring, load order |
| `resume-core.mjs` | pure constants, HOOKS, rules |
| `memory.mjs` | saves the view, restores it at `ready` |
| `lib/` | vendored kit (`lib/kit.lock.json`) |
| `test/` | node:test suites, goldens, fixtures, vendored test kit |

## Tests

```
node test/run.mjs                                  # from the module folder
./.venv/bin/python scripts/foundry/blueprint/vendor.py check resume
./.venv/bin/python scripts/foundry/blueprint/conformance.py --module resume
```

## Sync

First install: restart Foundry (module.json is read at startup), enable 'Pentaryn Resume', reload.
After that `.mjs`, `.css` and `lang/` changes need a reload only. Check what is live with
`game.pentaryn.resume.describe().version`.
